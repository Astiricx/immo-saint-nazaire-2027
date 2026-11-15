'use client';

import { Bike, CalendarCheck, FileText, MapPin } from 'lucide-react';
import { euro, formatAvailability, formatDate, formatSurface, typeLabel } from '@/lib/format';
import type { TrackEntry } from '@/lib/storage';
import type { EvaluatedListing, StatusId } from '@/lib/types';
import { LoadLine } from './LoadLine';
import { ListingLink, NetRent, ScoreBadge, StatusSelect, TierTag } from './ui';

export function ListingCard({
  listing,
  entry,
  onOpen,
  onStatus,
}: {
  listing: EvaluatedListing;
  entry: TrackEntry;
  onOpen: () => void;
  onStatus: (status: StatusId) => void;
}) {
  const l = listing;
  return (
    <article className="flex flex-col rounded-md border border-line bg-surface">
      <div className="flex items-start justify-between gap-4 p-4 pb-0">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {typeLabel(l.type)} de {formatSurface(l.surface)}
            {l.furnished ? ', meublé' : ''}
          </p>
          <h3 className="mt-1 font-medium leading-snug">
            <button type="button" onClick={onOpen} className="text-left hover:underline">
              {l.title}
            </button>
          </h3>
        </div>
        <ScoreBadge score={l.score} />
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-4xl font-semibold leading-none tabular-nums">
            {euro(l.monthlyCost)}
          </p>
          <TierTag tier={l.budgetTier} />
        </div>
        <p className="mb-2.5 mt-1 text-sm text-muted">
          {l.chargesIncluded
            ? 'par mois, charges comprises'
            : l.costIsEstimated
              ? `par mois, dont ${euro(l.estimatedCharges)} de charges estimées`
              : `par mois, dont ${euro(l.estimatedCharges)} de charges`}
        </p>
        <LoadLine cost={l.monthlyCost} />
        <div className="mt-3">
          <NetRent listing={l} />
        </div>
      </div>

      <ul className="grid gap-2 px-4 py-4 text-sm">
        <li className="flex items-center gap-2">
          <Bike className="size-4 shrink-0 text-muted" aria-hidden />
          {l.bikeMinutes != null ? (
            <span>
              <span className="font-medium tabular-nums">{l.bikeMinutes} min</span> à vélo des
              Chantiers
            </span>
          ) : (
            <span className="text-muted">Adresse non précisée : trajet à vérifier</span>
          )}
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
          {l.districtName}
        </li>
        <li className="flex items-center gap-2">
          <CalendarCheck className="size-4 shrink-0 text-muted" aria-hidden />
          {formatAvailability(l.availableFrom)}
        </li>
        {entry.notes ? (
          <li className="flex items-start gap-2 text-muted">
            <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="line-clamp-2">{entry.notes}</span>
          </li>
        ) : null}
      </ul>

      <div className="mt-auto flex items-center gap-2 border-t border-line p-3">
        <StatusSelect value={entry.status} onChange={onStatus} className="min-w-0 flex-1" />
        <button type="button" className="btn" onClick={onOpen}>
          Détails
        </button>
        <ListingLink listing={l} iconOnly className="btn px-2.5" />
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        {l.sourceLabel}, repérée le {formatDate(l.publishedAt ?? l.firstSeen, false)}
      </p>
    </article>
  );
}
