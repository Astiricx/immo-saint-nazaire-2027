'use client';

import { CRITERIA } from '@/lib/criteria';
import { aidProfileLabel, estimateApl } from '@/lib/apl';
import { euro, formatDateTime } from '@/lib/format';
import type { ListingsFile } from '@/lib/types';
import { LoadLine } from './LoadLine';

/** En-tête de page : le brief de la recherche, le bilan de la collecte et la lecture de la jauge. */
export function Brief({
  accepted,
  idealCount,
  data,
}: {
  accepted: number;
  idealCount: number;
  data: ListingsFile | null;
}) {
  const rejected = data
    ? Object.values(data.stats.rejected).reduce((sum, n) => sum + (n ?? 0), 0)
    : 0;
  const activeSources = data?.sources.filter((s) => s.status === 'ok').length ?? 0;

  return (
    <section id="top" className="grid gap-x-12 gap-y-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-10">
      <div>
        <h1 className="max-w-3xl font-display text-[2.1rem] font-semibold leading-[1.05] sm:text-5xl">
          Un logement meublé à Saint-Nazaire, à vélo des Chantiers, pour janvier 2027
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          {data?.generatedAt ? (
            <>
              {accepted} annonce{accepted > 1 ? 's' : ''} retenue{accepted > 1 ? 's' : ''}, dont{' '}
              {idealCount} à {euro(CRITERIA.idealNetRent)} net ou moins, aide au logement estimée
              déduite. Dernière collecte le{' '}
              {formatDateTime(data.generatedAt)} sur {activeSources} source
              {activeSources > 1 ? 's' : ''} ;{' '}
              <a
                href="#collecte"
                className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {rejected} annonce{rejected > 1 ? 's' : ''} écartée{rejected > 1 ? 's' : ''}
              </a>{' '}
              automatiquement (non meublés, moins de {CRITERIA.minSurface} m², colocations, plus de{' '}
              {euro(CRITERIA.maxNetRent)} net après aide, ou plus de {CRITERIA.maxBikeMinutes} min à
              vélo).
            </>
          ) : (
            <>
              Les annonces sont collectées chaque matin et filtrées selon vos critères. La première
              collecte n’a pas encore été publiée.
            </>
          )}
        </p>
      </div>

      <aside aria-label="Critères de la recherche" className="self-end">
        <dl className="divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Bien</dt>
            <dd className="text-right font-medium">
              T2, T3, T4 ou maison meublés, {CRITERIA.minSurface} m² minimum, sans colocation
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Secteurs</dt>
            <dd className="text-right font-medium">
              Centre-ville, front de mer jusqu’au Rocher du Lion, Parc paysager
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Trajet</dt>
            <dd className="text-right font-medium">
              {CRITERIA.maxBikeMinutes} min à vélo au maximum, piste du front de mer comprise
            </dd>
          </div>
          {CRITERIA.housingAid.enabled ? (
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-muted">Aide au logement</dt>
              <dd className="text-right font-medium">
                ≈ {euro(estimateApl(CRITERIA.maxNetRent).amount)} par mois, estimée
                <span className="block text-xs font-normal text-muted">{aidProfileLabel()}</span>
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Emménagement</dt>
            <dd className="text-right font-medium">Janvier 2027, ou fin 2026</dd>
          </div>
          <div className="py-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Loyer net après aide</dt>
              <dd className="text-right font-medium">
                {euro(CRITERIA.idealNetRent)} idéal, {euro(CRITERIA.maxNetRent)} maximum
                <span className="block text-xs font-normal text-muted">
                  charges comprises, moins l’aide estimée
                </span>
              </dd>
            </div>
            <div className="mt-3">
              <LoadLine showScale />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Chaque annonce porte cette jauge : le repère situe son loyer net entre l’idéal (vert),
              le dernier recours (ambre) et le hors budget (hachures).
            </p>
          </div>
        </dl>
      </aside>
    </section>
  );
}
