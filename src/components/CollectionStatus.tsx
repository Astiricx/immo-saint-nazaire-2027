'use client';

import { RETENTION_DAYS } from '@/lib/history';
import { ChevronDown } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { ListingsFile, RejectionCode, SourceStatus } from '@/lib/types';

const REASONS: { code: RejectionCode; label: string }[] = [
  { code: 'colocation', label: 'Colocation' },
  { code: 'budget', label: 'Hors budget' },
  { code: 'type', label: 'Type de bien' },
  { code: 'surface', label: 'Trop petit' },
  { code: 'meuble', label: 'Non meublé' },
  { code: 'distance', label: 'Trop loin à vélo' },
  { code: 'ville', label: 'Hors Saint-Nazaire' },
];

const STATUS_LABELS: Record<SourceStatus, string> = {
  ok: 'Collectée',
  erreur: 'En erreur',
  bloquee: 'Accès refusé',
  inactive: 'Inactive',
};

const STATUS_TONE: Record<SourceStatus, string> = {
  ok: 'bg-ok',
  erreur: 'bg-signal',
  bloquee: 'bg-warn',
  inactive: 'bg-line',
};

/** Bilan de la dernière collecte : sources interrogées et annonces écartées par les critères. */
export function CollectionStatus({ data }: { data: ListingsFile }) {
  const rejectedTotal = Object.values(data.stats.rejected).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <details id="collecte" className="group mt-10 rounded-md border border-line bg-surface">
      <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
        <h2 className="font-medium">Dernière collecte</h2>
        <span className="text-sm text-muted">
          {data.generatedAt ? formatDateTime(data.generatedAt) : 'Pas encore lancée'}
        </span>
        {rejectedTotal > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <li>Écartées automatiquement :</li>
            {REASONS.filter((r) => (data.stats.rejected[r.code] ?? 0) > 0).map((reason) => (
              <li key={reason.code}>
                {reason.label}{' '}
                <span className="font-medium tabular-nums text-ink">{data.stats.rejected[reason.code]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </summary>

      <div className="border-t border-line">
        {data.sources.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">
            La première collecte n’a pas encore eu lieu. Elle tourne chaque matin, ou à la demande
            depuis l’onglet Actions du dépôt.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">Source</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">État</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Lues</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Retenues</th>
                <th scope="col" className="hidden px-4 py-2 text-left font-medium md:table-cell">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.sources.map((source) => (
                <tr key={source.id} className="align-top">
                  <td className="px-4 py-2 font-medium">{source.label}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${STATUS_TONE[source.status]}`} aria-hidden />
                      {STATUS_LABELS[source.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{source.found}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{source.kept}</td>
                  <td className="hidden px-4 py-2 text-muted md:table-cell">{source.message ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          {data.stats.collected} annonce{data.stats.collected > 1 ? 's' : ''} lue{data.stats.collected > 1 ? 's' : ''},{' '}
          {data.stats.duplicates} doublon{data.stats.duplicates > 1 ? 's' : ''} retiré{data.stats.duplicates > 1 ? 's' : ''},{' '}
          {rejectedTotal} écartée{rejectedTotal > 1 ? 's' : ''} par les critères. Seules les annonces
          conformes sont publiées ici.
          {data.stats.fresh != null ? (
            <>
              {' '}Les annonces s’accumulent d’une collecte à l’autre : {data.stats.fresh} revue
              {data.stats.fresh > 1 ? 's' : ''} lors de cette collecte, {data.stats.carried ?? 0}{' '}
              conservée{(data.stats.carried ?? 0) > 1 ? 's' : ''} des précédentes (vues dans les{' '}
              {RETENTION_DAYS} derniers jours).
            </>
          ) : null}
        </p>
      </div>
    </details>
  );
}
