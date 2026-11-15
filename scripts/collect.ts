/**
 * Collecte réelle des annonces, lancée chaque jour par .github/workflows/scrape.yml.
 *
 *   npm run collect            collecte complète
 *   npm run collect -- --debug détaille chaque page lue (pour régler une source)
 *
 * Étapes : sources → normalisation → géocodage des adresses → dédoublonnage
 * → filtrage strict (src/lib/evaluate.ts) → fusion avec l'historique (src/lib/history.ts) → publication.
 * Les annonces des collectes précédentes ne sont jamais écrasées : elles restent publiées
 * tant qu'elles ont été revues dans les RETENTION_DAYS derniers jours.
 * Seules les annonces conformes aux critères sont publiées :
 *   - avec le secret LISTINGS_PASSPHRASE : public/listings.enc.json, chiffré (portails inclus) ;
 *   - sans : public/listings.json, en clair, sans les portails (Leboncoin, SeLoger, Bien'ici, PAP…).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CRITERIA } from '../src/lib/criteria';
import { decryptJson, encryptJson, isEncryptedFile } from '../src/lib/crypto';
import { evaluate } from '../src/lib/evaluate';
import { euro } from '../src/lib/format';
import { RETENTION_DAYS, mergeWithHistory, newListingsOf, type HistoryEntry } from '../src/lib/history';
import { dedupe, normalizeListing, withCoordinates } from '../src/lib/normalize';
import type {
  Listing,
  ListingsFile,
  RejectionCode,
  SourceReport,
} from '../src/lib/types';
import { BlockedError, geocode } from './lib/http';
import { PASSPHRASE, PRIVATE_MODE, canLogContent } from './lib/privacy';
import { APIFY_PORTALS, apifySource } from './sources/apify';
import { AGENCY_SITES, agencySource } from './sources/agency-pages';
import { emailAlertsSource } from './sources/email-alerts';
import { jsonFeedSource } from './sources/json-feed';
import type { ListingSource } from './sources/types';

const PLAIN_OUTPUT = resolve(process.cwd(), 'public/listings.json');
const ENCRYPTED_OUTPUT = resolve(process.cwd(), 'public/listings.enc.json');
const DEBUG = process.argv.includes('--debug') || process.env.COLLECT_DEBUG === '1';
const LOG_CONTENT = canLogContent(DEBUG);
const MAX_GEOCODES = 300;

const SOURCES: ListingSource[] = [
  ...APIFY_PORTALS.map(apifySource),
  emailAlertsSource,
  ...AGENCY_SITES.map(agencySource),
  jsonFeedSource,
];

const REASON_LABELS: Record<RejectionCode, string> = {
  colocation: 'colocation',
  type: 'type de bien',
  surface: `moins de ${CRITERIA.minSurface} m²`,
  meuble: 'non meublé',
  budget: 'hors budget',
  distance: 'trop loin à vélo',
  ville: 'hors Saint-Nazaire',
};

/** Lit un fichier d'annonces, chiffré ou non. null s'il est illisible (phrase secrète changée…). */
async function parseListingsFile(text: string): Promise<ListingsFile | null> {
  try {
    const payload: unknown = JSON.parse(text);
    if (isEncryptedFile(payload)) {
      return PRIVATE_MODE ? await decryptJson<ListingsFile>(payload, PASSPHRASE) : null;
    }
    const file = payload as ListingsFile;
    return Array.isArray(file?.listings) ? file : null;
  } catch {
    return null;
  }
}

const toEntries = (file: ListingsFile | null, fallbackDate: string): HistoryEntry[] =>
  (file?.listings ?? []).map((listing) => ({
    listing,
    collectedOn: file?.generatedAt?.slice(0, 10) ?? fallbackDate,
  }));

/** Annonces de la dernière collecte publiée. */
async function readPrevious(today: string): Promise<{ file: ListingsFile | null; entries: HistoryEntry[] }> {
  for (const path of [ENCRYPTED_OUTPUT, PLAIN_OUTPUT]) {
    if (!existsSync(path)) continue;
    const file = await parseListingsFile(readFileSync(path, 'utf8'));
    if (file) return { file, entries: toEntries(file, today) };
  }
  return { file: null, entries: [] };
}

/**
 * Reprise de l'historique : relit toutes les versions publiées du fichier dans l'historique git
 * (variable RECOVER_HISTORY=1). Sert à retrouver les annonces des collectes passées.
 */
function readGitHistory(today: string): Promise<HistoryEntry[]> {
  const run = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const entries: Promise<HistoryEntry[]>[] = [];
  let commits: string[] = [];
  try {
    commits = run(['log', '--format=%H', '--max-count=200', '--', 'public/listings.enc.json', 'public/listings.json'])
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    console.log(`  historique git illisible : ${(error as Error).message.split('\n')[0]}`);
  }
  for (const sha of commits) {
    for (const path of ['public/listings.enc.json', 'public/listings.json']) {
      let text: string;
      try {
        text = run(['show', `${sha}:${path}`]);
      } catch {
        continue;
      }
      entries.push(parseListingsFile(text).then((file) => toEntries(file, today)));
    }
  }
  console.log(`Reprise de l'historique : ${commits.length} version(s) publiée(s) relue(s).`);
  return Promise.all(entries).then((lists) => lists.flat());
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { file: previous, entries: previousEntries } = await readPrevious(today);
  const history = process.env.RECOVER_HISTORY === '1' ? [...(await readGitHistory(today)), ...previousEntries] : previousEntries;
  console.log(
    PRIVATE_MODE
      ? 'Mode privé : annonces publiées chiffrées, aucun contenu dans ce journal.'
      : 'Mode public : annonces publiées en clair ; portails désactivés (secret LISTINGS_PASSPHRASE absent).',
  );
  const reports: SourceReport[] = [];
  const collected: Listing[] = [];
  let unreadable = 0;

  // Collecte partielle (ONLY_SOURCES=pap,logicimmo) : les autres sources gardent leurs annonces.
  const only = (process.env.ONLY_SOURCES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const source of SOURCES) {
    const disabled = only.length && !only.includes(source.id) ? 'non lancée lors de cette collecte partielle' : source.disabledReason();
    if (disabled) {
      reports.push({ id: source.id, label: source.label, status: 'inactive', found: 0, kept: 0, message: disabled });
      console.log(`– ${source.label} : inactive (${disabled})`);
      continue;
    }
    console.log(`→ ${source.label}`);
    try {
      const result = await source.fetch(DEBUG);
      let readable = 0;
      for (const raw of result.listings) {
        const listing = normalizeListing(raw, today);
        if (listing) {
          collected.push({ ...listing, collector: source.id });
          readable += 1;
        } else {
          unreadable += 1;
        }
      }
      reports.push({
        id: source.id,
        label: source.label,
        status: 'ok',
        found: readable,
        kept: 0,
        message: result.message,
      });
      console.log(`  ${result.listings.length} annonce(s) lue(s), ${readable} exploitable(s)${result.message ? ` ; ${result.message}` : ''}`);
    } catch (error) {
      const blocked = error instanceof BlockedError;
      const message = (error as Error).message;
      reports.push({
        id: source.id,
        label: source.label,
        status: blocked ? 'bloquee' : 'erreur',
        found: 0,
        kept: 0,
        message,
      });
      console.log(`  ${blocked ? 'bloquée' : 'erreur'} : ${message}`);
    }
  }

  // Géocodage des adresses de rue : position précise et vrai temps de trajet.
  let geocoded = 0;
  for (let i = 0; i < collected.length && geocoded < MAX_GEOCODES; i += 1) {
    const listing = collected[i];
    if (listing.locationPrecision === 'adresse' || !listing.address) continue;
    geocoded += 1;
    const point = await geocode(listing.address);
    if (point) collected[i] = withCoordinates(listing, point.lat, point.lng);
    if (LOG_CONTENT) {
      const trip = point ? evaluate(collected[i]).bikeMinutes : null;
      console.log(
        `  géocodage « ${listing.address} » → ${point ? `${point.lat}, ${point.lng} (${collected[i].districtId ?? 'hors quartier connu'}, ${trip} min)` : 'non trouvé'}`,
      );
    }
  }

  const { unique, removed } = dedupe(collected);
  const evaluated = unique.map((listing) => evaluate(listing));
  const accepted = evaluated.filter((l) => l.accepted);
  if (LOG_CONTENT) {
    for (const l of evaluated) {
      console.log(
        `  ${l.accepted ? 'RETENUE ' : 'écartée '} ${l.sourceLabel} | ${l.title.slice(0, 60)} | ${l.monthlyCost} € | ${l.bikeMinutes ?? '?'} min | ${l.rejections.map((r) => r.code).join(', ')}`,
      );
    }
  }
  const rejectedCounts: Partial<Record<RejectionCode, number>> = {};
  /** Motifs d'exclusion par source : des comptes seulement, jamais le contenu des annonces. */
  const bySource = new Map<
    string,
    { read: number; kept: number; reasons: Partial<Record<RejectionCode, number>>; furnished: [number, number, number] }
  >();
  for (const listing of evaluated) {
    const key = listing.collector ?? listing.source;
    const entry = bySource.get(key) ?? { read: 0, kept: 0, reasons: {}, furnished: [0, 0, 0] };
    entry.read += 1;
    entry.furnished[listing.furnished === true ? 0 : listing.furnished === false ? 1 : 2] += 1;
    if (listing.accepted) entry.kept += 1;
    for (const rejection of listing.rejections) {
      entry.reasons[rejection.code] = (entry.reasons[rejection.code] ?? 0) + 1;
      rejectedCounts[rejection.code] = (rejectedCounts[rejection.code] ?? 0) + 1;
    }
    bySource.set(key, entry);
  }
  const breakdown = [...bySource.entries()].map(([id, e]) => {
    const label = reports.find((r) => r.id === id)?.label ?? id;
    const reasons = Object.entries(e.reasons)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([code, n]) => `${n} ${REASON_LABELS[code as RejectionCode]}`)
      .join(', ');
    const [yes, no, unknown] = e.furnished;
    return `${label} : ${e.kept} retenue(s) sur ${e.read} (meublé : ${yes} oui, ${no} non, ${unknown} non précisé)${
      reasons ? ` — motifs : ${reasons}` : ''
    }`;
  });
  console.log(`\nPar source (une annonce peut cumuler plusieurs motifs) :\n${breakdown.map((l) => `  ${l}`).join('\n')}`);

  // Fusion avec l'historique : rien n'est écrasé. Les annonces déjà connues gardent leur date de
  // première apparition ; celles qui ne sont pas revues aujourd'hui restent publiées (marquées
  // « plus revues ») tant qu'elles ont été vues dans les RETENTION_DAYS derniers jours.
  const byId = new Map(unique.map((l) => [l.id, l]));
  const freshAccepted: Listing[] = accepted.map(({ id }) => byId.get(id) as Listing);
  const unverified = new Set(reports.filter((r) => r.status !== 'ok').map((r) => r.id));
  const merge = mergeWithHistory(freshAccepted, history, today, RETENTION_DAYS, unverified);
  const keptListings = merge.listings;
  for (const report of reports) {
    report.kept = keptListings.filter((l) => (l.collector ?? l.source) === report.id).length;
  }

  keptListings.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.rent - b.rent);

  const file: ListingsFile = {
    generatedAt: now.toISOString(),
    sources: reports,
    stats: {
      collected: collected.length,
      duplicates: removed,
      unreadable,
      rejected: rejectedCounts,
      fresh: merge.fresh,
      carried: merge.carried,
      expired: merge.expired,
      newToday: newListingsOf(keptListings, today).length,
    },
    listings: keptListings,
  };
  mkdirSync(dirname(PLAIN_OUTPUT), { recursive: true });
  let output: string;
  if (PRIVATE_MODE) {
    output = ENCRYPTED_OUTPUT;
    writeFileSync(ENCRYPTED_OUTPUT, `${JSON.stringify(await encryptJson(file, PASSPHRASE))}\n`, 'utf8');
    // Jamais de version en clair à côté de la version chiffrée.
    rmSync(PLAIN_OUTPUT, { force: true });
  } else {
    output = PLAIN_OUTPUT;
    writeFileSync(PLAIN_OUTPUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    rmSync(ENCRYPTED_OUTPUT, { force: true });
  }

  const rejectedTotal = evaluated.length - accepted.length;
  const lines = [
    `Critères : meublé, ${CRITERIA.minSurface} m² minimum (T2, T3, T4, maison), sans colocation, ${euro(CRITERIA.maxNetRent)} net maximum après aide au logement estimée, ${CRITERIA.maxBikeMinutes} min à vélo des Chantiers.`,
    `${collected.length} annonce(s) collectée(s), ${removed} doublon(s), ${unreadable} illisible(s).`,
    `Nouvelles annonces aujourd'hui (absentes des collectes précédentes) : ${newListingsOf(keptListings, today).length}.`,
    `Historique : ${previous?.listings.length ?? 0} annonce(s) dans le fichier précédent${
      history.length > previousEntries.length ? `, ${history.length} entrée(s) relue(s) dans l'historique git` : ''
    } ; publiées : ${keptListings.length} = ${merge.fresh} revue(s) aujourd'hui + ${merge.carried} conservée(s) des collectes précédentes (${RETENTION_DAYS} jours glissants) ; ${merge.expired} retirée(s) ; ${merge.duplicates} doublon(s) fusionné(s).`,
    `${accepted.length} retenue(s) aujourd'hui, ${rejectedTotal} écartée(s)${
      rejectedTotal
        ? ` : ${Object.entries(rejectedCounts)
            .map(([code, n]) => `${n} ${REASON_LABELS[code as RejectionCode]}`)
            .join(', ')}`
        : ''
    }.`,
    `${geocoded} adresse(s) géocodée(s).`,
  ];
  console.log(`\n${lines.join('\n')}\nFichier écrit : ${output}`);

  // Résumé affiché sur la page de l'exécution dans l'onglet Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const table = reports
      .map((r) => `| ${r.label} | ${r.status} | ${r.found} | ${r.kept} | ${(r.message ?? '').replace(/\|/g, '/')} |`)
      .join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Collecte du ${today}\n\n${lines.join('\n\n')}\n\n| Source | État | Lues | Retenues | Note |\n| --- | --- | --- | --- | --- |\n${table}\n\n### Motifs d'exclusion par source\n\n${breakdown.map((l) => `- ${l}`).join('\n')}\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
