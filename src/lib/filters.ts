import { CRITERIA } from './criteria';
import { normalizeText } from './geo';
import type { EvaluatedListing, StatusId } from './types';

export type TypeFilter = 'all' | 'studio' | 'T2';
export type ZoneFilter = 'coeur' | 'all';
export type SortKey = 'score' | 'price-asc' | 'price-desc' | 'surface' | 'bike' | 'recent';

export interface Filters {
  query: string;
  type: TypeFilter;
  /** Loyer charges comprises maximal. */
  maxCost: number;
  minSurface: number;
  minScore: number;
  zone: ZoneFilter;
  status: StatusId | 'all';
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  type: 'all',
  maxCost: CRITERIA.maxRent,
  minSurface: 0,
  minScore: 0,
  // Les annonces qui ne précisent pas le quartier restent visibles : à vérifier une par une.
  zone: 'all',
  status: 'all',
};

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'score', label: 'Pertinence' },
  { id: 'price-asc', label: 'Loyer croissant' },
  { id: 'price-desc', label: 'Loyer décroissant' },
  { id: 'surface', label: 'Surface décroissante' },
  { id: 'bike', label: 'Trajet vélo le plus court' },
  { id: 'recent', label: 'Plus récentes' },
];

export function isDefaultFilters(filters: Filters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).every(
    (key) => filters[key] === DEFAULT_FILTERS[key],
  );
}

export function applyFilters(
  listings: EvaluatedListing[],
  filters: Filters,
  statusOf: (id: string) => StatusId,
): EvaluatedListing[] {
  const query = normalizeText(filters.query);
  return listings.filter((l) => {
    if (filters.type === 'studio' && l.type !== 'studio' && l.type !== 'T1') return false;
    if (filters.type === 'T2' && l.type !== 'T2') return false;
    if (l.monthlyCost > filters.maxCost) return false;
    if (l.surface < filters.minSurface) return false;
    if (l.score < filters.minScore) return false;
    if (filters.zone === 'coeur' && l.zone !== 'coeur') return false;
    if (filters.status !== 'all' && statusOf(l.id) !== filters.status) return false;
    if (query) {
      const haystack = normalizeText(`${l.title} ${l.districtName} ${l.description}`);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function sortListings(listings: EvaluatedListing[], sort: SortKey): EvaluatedListing[] {
  const byScore = (a: EvaluatedListing, b: EvaluatedListing) =>
    b.score - a.score || a.monthlyCost - b.monthlyCost;
  const comparators: Record<SortKey, (a: EvaluatedListing, b: EvaluatedListing) => number> = {
    score: byScore,
    'price-asc': (a, b) => a.monthlyCost - b.monthlyCost || byScore(a, b),
    'price-desc': (a, b) => b.monthlyCost - a.monthlyCost || byScore(a, b),
    surface: (a, b) => b.surface - a.surface || byScore(a, b),
    bike: (a, b) => (a.bikeMinutes ?? 999) - (b.bikeMinutes ?? 999) || byScore(a, b),
    recent: (a, b) =>
      (b.publishedAt ?? b.firstSeen).localeCompare(a.publishedAt ?? a.firstSeen) || byScore(a, b),
  };
  return [...listings].sort(comparators[sort]);
}
