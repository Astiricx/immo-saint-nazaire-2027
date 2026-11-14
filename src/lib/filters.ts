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
  // Critère strict de la recherche : centre-ville et front de mer d'abord.
  zone: 'coeur',
  status: 'all',
};

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'score', label: 'Pertinence' },
  { id: 'price-asc', label: 'Loyer croissant' },
  { id: 'price-desc', label: 'Loyer décroissant' },
  { id: 'surface', label: 'Surface décroissante' },
  { id: 'bike', label: 'Trajet vélo le plus court' },
  { id: 'recent', label: 'Publication récente' },
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
    bike: (a, b) => a.bikeMinutes - b.bikeMinutes || byScore(a, b),
    recent: (a, b) => b.publishedAt.localeCompare(a.publishedAt) || byScore(a, b),
  };
  return [...listings].sort(comparators[sort]);
}
