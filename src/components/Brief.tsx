'use client';

import { Info, X } from 'lucide-react';
import { CRITERIA } from '@/lib/criteria';
import { euro, formatDate } from '@/lib/format';
import { LoadLine } from './LoadLine';

/** En-tête de page : le brief de la recherche, le bilan du filtrage et la lecture de la jauge. */
export function Brief({
  accepted,
  collected,
  rejected,
  idealCount,
  generatedAt,
  showDemoNotice,
  onDismissDemoNotice,
}: {
  accepted: number;
  collected: number;
  rejected: number;
  idealCount: number;
  generatedAt: string;
  showDemoNotice: boolean;
  onDismissDemoNotice: () => void;
}) {
  return (
    <section id="top" className="grid gap-x-12 gap-y-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-10">
      <div>
        <h1 className="max-w-3xl font-display text-[2.1rem] font-semibold leading-[1.05] sm:text-5xl">
          Un studio ou un T2 à Saint-Nazaire, à vélo des Chantiers, pour janvier 2027
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          {accepted} annonces retenues sur {collected} collectées le {formatDate(generatedAt)}.{' '}
          {idealCount} tiennent dans le budget idéal de {euro(CRITERIA.idealRent)}.{' '}
          <a href="#ecartees" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            {rejected} ont été écartées automatiquement
          </a>{' '}
          : colocations, loyers au-dessus de {euro(CRITERIA.maxRent)}, biens trop grands ou trop
          loin.
        </p>

        {showDemoNotice ? (
          <div className="mt-6 flex max-w-2xl items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p className="leading-relaxed">
              Les annonces affichées sont des exemples réalistes, pas de vraies offres : leur lien
              ouvre la recherche correspondante sur le portail. Ajoutez vos vraies annonces avec
              « Ajouter une annonce », ou branchez un flux avec le script de collecte.
            </p>
            <button
              type="button"
              className="btn btn-quiet -my-1 -mr-1 px-1.5"
              onClick={onDismissDemoNotice}
              aria-label="Masquer ce message"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <aside aria-label="Critères de la recherche" className="self-end">
        <dl className="divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Bien</dt>
            <dd className="text-right font-medium">Studio ou T2, sans colocation</dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Trajet</dt>
            <dd className="text-right font-medium">
              {CRITERIA.maxBikeMinutes} min à vélo au maximum
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-muted">Emménagement</dt>
            <dd className="text-right font-medium">Janvier 2027, ou fin 2026</dd>
          </div>
          <div className="py-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Loyer charges comprises</dt>
              <dd className="text-right font-medium">
                {euro(CRITERIA.idealRent)} idéal, {euro(CRITERIA.maxRent)} maximum
              </dd>
            </div>
            <div className="mt-3">
              <LoadLine showScale />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Chaque annonce porte cette jauge : le repère situe son loyer entre l’idéal (vert), le
              dernier recours (ambre) et le hors budget (hachures).
            </p>
          </div>
        </dl>
      </aside>
    </section>
  );
}
