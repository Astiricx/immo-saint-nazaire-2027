'use client';

import { LayoutGrid, RotateCcw, Search, Table2 } from 'lucide-react';
import { CRITERIA } from '@/lib/criteria';
import { euro } from '@/lib/format';
import {
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  isDefaultFilters,
  type Filters,
  type SortKey,
  type ZoneFilter,
} from '@/lib/filters';
import { STATUSES } from '@/lib/pipeline';
import type { StatusId } from '@/lib/types';

export type View = 'grid' | 'table';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
            value === option.id ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RangeField({
  id,
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="min-w-40 flex-1">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{valueLabel}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 block w-full"
      />
    </div>
  );
}

const ZONE_OPTIONS: { id: ZoneFilter; label: string }[] = [
  { id: 'coeur', label: 'Secteurs visés' },
  { id: 'all', label: 'Tous les quartiers' },
];

export function FiltersBar({
  filters,
  onFilters,
  sort,
  onSort,
  view,
  onView,
  resultCount,
  totalCount,
}: {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  view: View;
  onView: (view: View) => void;
  resultCount: number;
  totalCount: number;
}) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onFilters({ ...filters, [key]: value });

  return (
    <section aria-label="Filtres et tri" className="rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => set('query', event.target.value)}
            placeholder="Rechercher un quartier, une rue, un mot-clé"
            aria-label="Rechercher dans les annonces"
            className="field pl-8"
          />
        </div>
        <Segmented
          label="Secteur"
          value={filters.zone}
          options={ZONE_OPTIONS}
          onChange={(value) => set('zone', value)}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="tri" className="text-sm text-muted">
            Trier par
          </label>
          <select
            id="tri"
            value={sort}
            onChange={(event) => onSort(event.target.value as SortKey)}
            className="field w-auto"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Affichage" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          <button
            type="button"
            aria-pressed={view === 'grid'}
            aria-label="Afficher en cartes"
            title="Cartes"
            onClick={() => onView('grid')}
            className={`rounded p-1.5 ${view === 'grid' ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
          >
            <LayoutGrid className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-pressed={view === 'table'}
            aria-label="Afficher en tableau"
            title="Tableau"
            onClick={() => onView('table')}
            className={`rounded p-1.5 ${view === 'table' ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`}
          >
            <Table2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line p-3">
        <RangeField
          id="loyer-max"
          label="Loyer maximum"
          valueLabel={euro(Math.min(filters.maxCost, CRITERIA.maxRent))}
          value={Math.min(filters.maxCost, CRITERIA.maxRent)}
          min={300}
          max={CRITERIA.maxRent}
          step={10}
          onChange={(value) => set('maxCost', value)}
        />
        <RangeField
          id="surface-min"
          label="Surface minimum"
          valueLabel={`${Math.max(filters.minSurface, CRITERIA.minSurface)} m²`}
          value={Math.max(filters.minSurface, CRITERIA.minSurface)}
          min={CRITERIA.minSurface}
          max={100}
          step={5}
          onChange={(value) => set('minSurface', value)}
        />
        <RangeField
          id="score-min"
          label="Score minimum"
          valueLabel={filters.minScore > 0 ? `${filters.minScore} sur 100` : 'Indifférent'}
          value={filters.minScore}
          min={0}
          max={90}
          step={5}
          onChange={(value) => set('minScore', value)}
        />
        <div className="min-w-40">
          <label htmlFor="filtre-statut" className="label">
            Étape du suivi
          </label>
          <select
            id="filtre-statut"
            value={filters.status}
            onChange={(event) => set('status', event.target.value as StatusId | 'all')}
            className="field"
          >
            <option value="all">Toutes les étapes</option>
            {STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            <span className="font-medium tabular-nums text-ink">{resultCount}</span> sur {totalCount}{' '}
            annonces
          </p>
          {isDefaultFilters(filters) ? null : (
            <button type="button" className="btn" onClick={() => onFilters(DEFAULT_FILTERS)}>
              <RotateCcw className="size-4" aria-hidden />
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
