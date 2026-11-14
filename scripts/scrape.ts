/**
 * Collecte des annonces pour le tableau de bord.
 *
 *   npm run scrape                          annonces de démonstration
 *   npm run scrape -- --feed=annonces.json  démonstration + votre flux (fichier ou URL)
 *   npm run scrape -- --feed=… --no-mock    uniquement votre flux
 *
 * Étapes : collecte par source → normalisation (prix, surface, type, quartier, date)
 * → dédoublonnage → écriture de src/data/listings.json → rapport de filtrage.
 * Le filtrage lui-même (colocations, budget, distance) vit dans src/lib/evaluate.ts :
 * le tableau de bord l'applique à l'affichage, avec exactement les mêmes règles.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CRITERIA } from '../src/lib/criteria';
import { evaluate } from '../src/lib/evaluate';
import { euro } from '../src/lib/format';
import { dedupe, normalizeListing } from '../src/lib/normalize';
import type { Listing, ListingsFile, RejectionCode } from '../src/lib/types';
import { jsonFeedSource } from './sources/json-feed';
import { mockSource } from './sources/mock';
import type { ListingSource } from './sources/types';

const args = process.argv.slice(2);
const option = (name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => args.includes(`--${name}`);

const OUTPUT = resolve(process.cwd(), option('out') ?? 'src/data/listings.json');

function buildSources(): ListingSource[] {
  const sources: ListingSource[] = [];
  if (!flag('no-mock')) sources.push(mockSource);
  const feed = option('feed');
  if (feed) sources.push(jsonFeedSource(feed));
  return sources;
}

const REASON_LABELS: Record<RejectionCode, string> = {
  colocation: 'colocation',
  type: 'type de bien',
  budget: 'hors budget',
  distance: 'trop loin à vélo',
  ville: 'hors Saint-Nazaire',
};

async function main() {
  const sources = buildSources();
  if (sources.length === 0) {
    throw new Error('Aucune source : retirez --no-mock ou ajoutez --feed=…');
  }

  const collected: Listing[] = [];
  let unreadable = 0;

  for (const source of sources) {
    const raw = await source.fetch();
    let kept = 0;
    for (const item of raw) {
      const listing = normalizeListing(item);
      if (listing) {
        collected.push(listing);
        kept += 1;
      } else {
        unreadable += 1;
      }
    }
    console.log(`${source.label} : ${raw.length} annonces lues, ${kept} exploitables`);
  }

  const { unique, removed } = dedupe(collected);
  const listings = unique.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const file: ListingsFile = {
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: sources.map((s) => s.label),
    duplicatesRemoved: removed,
    unreadable,
    listings,
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  // Rapport : ce que le tableau de bord gardera et ce qu'il écartera.
  const evaluated = listings.map((listing) => evaluate(listing));
  const accepted = evaluated.filter((l) => l.accepted).sort((a, b) => b.score - a.score);
  const rejected = evaluated.filter((l) => !l.accepted);
  const reasonCounts = new Map<RejectionCode, number>();
  for (const listing of rejected) {
    for (const rejection of listing.rejections) {
      reasonCounts.set(rejection.code, (reasonCounts.get(rejection.code) ?? 0) + 1);
    }
  }

  console.log('');
  console.log(`Critères : studio ou T2, ${euro(CRITERIA.maxRent)} max charges comprises,`);
  console.log(`           ${CRITERIA.maxBikeMinutes} min à vélo des Chantiers de l'Atlantique, pas de colocation`);
  console.log('');
  console.log(`${listings.length} annonces uniques (${removed} doublon(s), ${unreadable} illisible(s))`);
  console.log(`  ${accepted.length} retenues`);
  console.log(`  ${rejected.length} écartées`);
  for (const [code, count] of reasonCounts) {
    console.log(`    ${String(count).padStart(2)} × ${REASON_LABELS[code]}`);
  }
  console.log('');
  console.log('Meilleures annonces :');
  for (const l of accepted.slice(0, 5)) {
    console.log(
      `  ${String(l.score).padStart(3)}/100  ${euro(l.monthlyCost).padEnd(7)} ${String(l.bikeMinutes).padStart(2)} min  ${l.title}`,
    );
  }
  console.log('');
  console.log(`Fichier écrit : ${OUTPUT}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
