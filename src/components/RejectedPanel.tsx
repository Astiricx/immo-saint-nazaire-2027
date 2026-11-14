'use client';

import { ChevronDown } from 'lucide-react';
import { euro, formatSurface, typeLabel } from '@/lib/format';
import type { EvaluatedListing, RejectionCode } from '@/lib/types';

const REASONS: { code: RejectionCode; label: string }[] = [
  { code: 'colocation', label: 'Colocation' },
  { code: 'budget', label: 'Hors budget' },
  { code: 'type', label: 'Type de bien' },
  { code: 'distance', label: 'Trop loin à vélo' },
  { code: 'ville', label: 'Hors Saint-Nazaire' },
];

/** Les annonces que les critères ont écartées, avec le motif : le filtrage reste vérifiable. */
export function RejectedPanel({
  rejected,
  duplicatesRemoved,
  onOpen,
}: {
  rejected: EvaluatedListing[];
  duplicatesRemoved: number;
  onOpen: (id: string) => void;
}) {
  if (rejected.length === 0) return null;
  const count = (code: RejectionCode) =>
    rejected.filter((l) => l.rejections.some((r) => r.code === code)).length;

  return (
    <details id="ecartees" className="group mt-10 rounded-md border border-line bg-surface">
      <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
        <h2 className="font-medium">
          {rejected.length} annonces écartées automatiquement
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {REASONS.filter((reason) => count(reason.code) > 0).map((reason) => (
            <li key={reason.code}>
              {reason.label} <span className="font-medium tabular-nums text-ink">{count(reason.code)}</span>
            </li>
          ))}
        </ul>
      </summary>

      <ul className="divide-y divide-line border-t border-line">
        {rejected.map((l) => (
          <li key={l.id} className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(l.id)}
                className="block max-w-full truncate text-left font-medium hover:underline"
              >
                {l.title}
              </button>
              <span className="text-muted">
                {typeLabel(l.type)} de {formatSurface(l.surface)}, {euro(l.monthlyCost)}, {l.districtName}
              </span>
            </div>
            <ul className="text-signal">
              {l.rejections.map((rejection) => (
                <li key={rejection.code}>{rejection.detail}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {duplicatesRemoved > 0 ? (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          En plus, {duplicatesRemoved} doublon{duplicatesRemoved > 1 ? 's' : ''} (même annonce sur
          deux portails) {duplicatesRemoved > 1 ? 'ont été retirés' : 'a été retiré'} à la collecte.
        </p>
      ) : null}
    </details>
  );
}
