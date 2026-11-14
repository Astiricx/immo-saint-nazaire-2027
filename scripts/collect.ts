/**
 * Collecte réelle des annonces, lancée chaque jour par .github/workflows/scrape.yml.
 *
 *   npm run collect            collecte complète, écrit public/listings.json
 *   npm run collect -- --debug détaille chaque page lue (pour régler une source)
 *
 * Étapes : sources → normalisation → géocodage des adresses → dédoublonnage
 * → filtrage strict (src/lib/evaluate.ts) → public/listings.json.
 * Seules les annonces conformes aux critères sont publiées.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CRITERIA } from '../src/lib/criteria';
import { evaluate } from '../src/lib/evaluate';
import { euro } from '../src/lib/format';
import { dedupe, normalizeListing, withCoordinates } from '../src/lib/normalize';
import type {
  Listing,
  ListingsFile,
  RejectionCode,
  SourceReport,
} from '../src/lib/types';
import { BlockedError, geocode } from './lib/http';
import { AGENCY_SITES, agencySource } from './sources/agency-pages';
import { emailAlertsSource } from './sources/email-alerts';
import { jsonFeedSource } from './sources/json-feed';
import type { ListingSource } from './sources/types';

const OUTPUT = resolve(process.cwd(), 'public/listings.json');
const DEBUG = process.argv.includes('--debug') || process.env.COLLECT_DEBUG === '1';
const MAX_GEOCODES = 80;

const SOURCES: ListingSource[] = [
  emailAlertsSource,
  ...AGENCY_SITES.map(agencySource),
  jsonFeedSource,
];

const REASON_LABELS: Record<RejectionCode, string> = {
  colocation: 'colocation',
  type: 'type de bien',
  budget: 'hors budget',
  distance: 'trop loin à vélo',
  ville: 'hors Saint-Nazaire',
};

function readPrevious(): ListingsFile | null {
  if (!existsSync(OUTPUT)) return null;
  try {
    return JSON.parse(readFileSync(OUTPUT, 'utf8')) as ListingsFile;
  } catch {
    return null;
  }
}

async function main() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const previous = readPrevious();
  const reports: SourceReport[] = [];
  const collected: Listing[] = [];
  let unreadable = 0;

  for (const source of SOURCES) {
    const disabled = source.disabledReason();
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
  }

  const { unique, removed } = dedupe(collected);
  const evaluated = unique.map((listing) => evaluate(listing));
  const accepted = evaluated.filter((l) => l.accepted);
  const rejectedCounts: Partial<Record<RejectionCode, number>> = {};
  for (const listing of evaluated.filter((l) => !l.accepted)) {
    for (const rejection of listing.rejections) {
      rejectedCounts[rejection.code] = (rejectedCounts[rejection.code] ?? 0) + 1;
    }
  }

  // On garde la date de première apparition, et les annonces d'une source en panne ce jour-là.
  const previousById = new Map((previous?.listings ?? []).map((l) => [l.id, l]));
  const failedSources = new Set(reports.filter((r) => r.status !== 'ok' && r.status !== 'inactive').map((r) => r.id));
  const keptListings: Listing[] = accepted.map((evaluatedListing) => {
    const { id } = evaluatedListing;
    const listing = unique.find((l) => l.id === id) as Listing;
    return { ...listing, firstSeen: previousById.get(id)?.firstSeen ?? today };
  });
  const keptIds = new Set(keptListings.map((l) => l.id));
  for (const old of previous?.listings ?? []) {
    if (failedSources.has(old.collector ?? old.source) && !keptIds.has(old.id)) keptListings.push(old);
  }
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
    },
    listings: keptListings,
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  const rejectedTotal = evaluated.length - accepted.length;
  const lines = [
    `Critères : studio ou T2 sans colocation, ${euro(CRITERIA.maxRent)} maximum charges comprises, ${CRITERIA.maxBikeMinutes} min à vélo des Chantiers.`,
    `${collected.length} annonce(s) collectée(s), ${removed} doublon(s), ${unreadable} illisible(s).`,
    `${keptListings.length} retenue(s), ${rejectedTotal} écartée(s)${
      rejectedTotal
        ? ` : ${Object.entries(rejectedCounts)
            .map(([code, n]) => `${n} ${REASON_LABELS[code as RejectionCode]}`)
            .join(', ')}`
        : ''
    }.`,
    `${geocoded} adresse(s) géocodée(s).`,
  ];
  console.log(`\n${lines.join('\n')}\nFichier écrit : ${OUTPUT}`);

  // Résumé affiché sur la page de l'exécution dans l'onglet Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const table = reports
      .map((r) => `| ${r.label} | ${r.status} | ${r.found} | ${r.kept} | ${(r.message ?? '').replace(/\|/g, '/')} |`)
      .join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Collecte du ${today}\n\n${lines.join('\n\n')}\n\n| Source | État | Lues | Retenues | Note |\n| --- | --- | --- | --- | --- |\n${table}\n`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
