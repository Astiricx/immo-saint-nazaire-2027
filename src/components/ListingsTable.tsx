'use client';

import { ArrowUpDown, ChevronDown } from 'lucide-react';
import { euro, formatAvailability, formatSurface, typeLabel } from '@/lib/format';
import type { SortKey } from '@/lib/filters';
import type { TrackEntry } from '@/lib/storage';
import type { EvaluatedListing, StatusId } from '@/lib/types';
import { LoadLine } from './LoadLine';
import { ListingLink, StatusSelect } from './ui';

function SortHeader({
  label,
  sortKeys,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  /** Une clé, ou deux pour alterner (croissant puis décroissant). */
  sortKeys: SortKey[];
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const activeIndex = sortKeys.indexOf(sort);
  const active = activeIndex !== -1;
  const next = sortKeys[(activeIndex + 1) % sortKeys.length];
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.endsWith('asc') || sort === 'bike' ? 'ascending' : 'descending') : undefined}
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(next)}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        {active ? (
          <ChevronDown
            className={`size-3.5 ${sort.endsWith('asc') || sort === 'bike' ? 'rotate-180' : ''}`}
            aria-hidden
          />
        ) : (
          <ArrowUpDown className="size-3.5 opacity-60" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function ListingsTable({
  listings,
  entryOf,
  sort,
  onSort,
  onOpen,
  onStatus,
}: {
  listings: EvaluatedListing[];
  entryOf: (id: string) => TrackEntry;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: StatusId) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Annonce
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Type
            </th>
            <SortHeader label="Surface" sortKeys={['surface']} sort={sort} onSort={onSort} align="right" />
            <SortHeader
              label="Loyer charges comprises"
              sortKeys={['price-asc', 'price-desc']}
              sort={sort}
              onSort={onSort}
            />
            <SortHeader label="Après APL (indicatif)" sortKeys={['net-asc']} sort={sort} onSort={onSort} align="right" />
            <SortHeader label="Vélo" sortKeys={['bike']} sort={sort} onSort={onSort} align="right" />
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Disponibilité
            </th>
            <SortHeader label="Score" sortKeys={['score']} sort={sort} onSort={onSort} align="right" />
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Suivi
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Lien</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {listings.map((l) => (
            <tr key={l.id} className="align-middle hover:bg-surface-2">
              <td className="max-w-80 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onOpen(l.id)}
                  className="block max-w-full truncate text-left font-medium hover:underline"
                >
                  {l.title}
                </button>
                <span className="text-muted">{l.districtName}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {typeLabel(l.type)}
                {l.furnished ? ' meublé' : ''}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {formatSurface(l.surface)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0 whitespace-nowrap font-display text-xl font-semibold leading-none tabular-nums">
                    {euro(l.monthlyCost)}
                  </span>
                  {l.costIsEstimated ? <span className="text-xs text-muted">estimé</span> : null}
                </div>
                <div className="mt-1.5 w-24">
                  <LoadLine cost={l.monthlyCost} />
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right">
                <span className="tabular-nums text-accent">{euro(l.netCost)}</span>
                <span className="block text-xs text-muted">aide {euro(l.housingAid)}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                {l.bikeMinutes != null ? `${l.bikeMinutes} min` : 'À vérifier'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{formatAvailability(l.availableFrom)}</td>
              <td className="px-3 py-2.5 text-right font-display text-xl font-semibold leading-none tabular-nums">
                {l.score}
              </td>
              <td className="px-3 py-2">
                <StatusSelect
                  value={entryOf(l.id).status}
                  onChange={(status) => onStatus(l.id, status)}
                  className="w-40 py-1"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <ListingLink listing={l} iconOnly className="btn btn-quiet px-2" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
