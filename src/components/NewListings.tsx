'use client';

import { Bike, ChevronDown, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { euro, formatDate, formatSurface, typeLabel } from '@/lib/format';
import { newListingsOf } from '@/lib/history';
import type { EvaluatedListing } from '@/lib/types';
import { ListingLink } from './ui';

const VISIBLE = 6;

/**
 * Rapport du jour : les annonces apparues pour la première fois lors de la dernière collecte,
 * absentes de l'historique des jours précédents, avec leur lien direct.
 */
export function NewListings({
  listings,
  generatedAt,
  onOpen,
}: {
  listings: EvaluatedListing[];
  generatedAt: string | null;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fresh = useMemo(
    () => (generatedAt ? newListingsOf(listings, generatedAt).sort((a, b) => b.score - a.score) : []),
    [listings, generatedAt],
  );
  if (!generatedAt) return null;

  const day = formatDate(generatedAt.slice(0, 10), false);
  const shown = expanded ? fresh : fresh.slice(0, VISIBLE);

  return (
    <section
      aria-labelledby="nouveautes-titre"
      className="rounded-md border border-line bg-surface-2"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <h2 id="nouveautes-titre" className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="size-4 shrink-0 text-signal" aria-hidden />
          {fresh.length === 0
            ? `Aucune nouvelle annonce à la collecte du ${day}`
            : `${fresh.length} nouvelle${fresh.length > 1 ? 's' : ''} annonce${fresh.length > 1 ? 's' : ''} le ${day}`}
        </h2>
        <p className="text-sm text-muted">
          {fresh.length === 0
            ? 'Toutes les annonces retenues étaient déjà connues des collectes précédentes.'
            : 'Repérées pour la première fois, absentes des collectes précédentes.'}
        </p>
      </header>

      {fresh.length > 0 ? (
        <ul className="divide-y divide-line">
          {shown.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <button
                type="button"
                onClick={() => onOpen(l.id)}
                className="min-w-0 flex-1 text-left hover:underline focus-visible:underline"
              >
                <span className="block font-medium">
                  {typeLabel(l.type)} de {formatSurface(l.surface)}
                  , {l.districtName}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                  <span>
                    <span className="font-medium tabular-nums text-ink">{euro(l.netCost)} net</span> (
                    {euro(l.monthlyCost)} CC − {euro(l.housingAid)} d’aide)
                  </span>
                  {l.bikeMinutes != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Bike className="size-3.5" aria-hidden />
                      {l.bikeMinutes} min
                    </span>
                  ) : null}
                  <span>{l.sourceLabel}</span>
                </span>
              </button>
              <ListingLink listing={l} className="btn" />
            </li>
          ))}
        </ul>
      ) : null}

      {fresh.length > VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line px-4 py-2.5 text-sm text-muted hover:text-ink"
        >
          <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          {expanded ? 'Réduire la liste' : `Afficher les ${fresh.length - VISIBLE} autres`}
        </button>
      ) : null}
    </section>
  );
}
