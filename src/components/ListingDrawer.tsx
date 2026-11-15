'use client';

import { Bike, CalendarCheck, MapPin, Ruler, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BIKE } from '@/lib/geo';
import {
  euro,
  formatAvailability,
  formatDate,
  formatKm,
  formatSurface,
  typeLabel,
} from '@/lib/format';
import type { TrackEntry } from '@/lib/storage';
import type { EvaluatedListing } from '@/lib/types';
import { LoadLine } from './LoadLine';
import { ListingLink, NetRent, ScoreBadge, StatusSelect, TierTag, useOverlay } from './ui';
import { aidProfileLabel, APL_SCALE, estimateApl } from '@/lib/apl';
import { rentExcludingCharges } from '@/lib/evaluate';

/** Panneau latéral : détail de l'annonce, décomposition du score, étape, date de visite et notes. */
export function ListingDrawer({
  listing,
  entry,
  onClose,
  onUpdate,
  onDelete,
}: {
  listing: EvaluatedListing;
  entry: TrackEntry;
  onClose: () => void;
  onUpdate: (patch: Partial<TrackEntry>) => void;
  /** Présent uniquement pour les annonces ajoutées à la main. */
  onDelete?: () => void;
}) {
  const l = listing;
  const closeRef = useRef<HTMLButtonElement>(null);
  useOverlay(onClose);

  useEffect(() => {
    closeRef.current?.focus();
  }, [l.id]);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-titre"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-line bg-surface shadow-2xl"
      >
        <header className="flex items-start gap-4 border-b border-line p-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">
              {typeLabel(l.type)} de {formatSurface(l.surface)}
              {l.furnished ? ', meublé' : ''}
            </p>
            <h2 id="detail-titre" className="mt-1 text-lg font-medium leading-snug">
              {l.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-quiet -mr-2 -mt-1 px-2"
            onClick={onClose}
            aria-label="Fermer le détail"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {l.rejections.length > 0 ? (
            <div className="border-b border-line bg-signal/10 px-5 py-3 text-sm">
              <p className="font-medium text-signal">Annonce écartée par les critères</p>
              <ul className="mt-1 list-disc pl-5">
                {l.rejections.map((rejection) => (
                  <li key={rejection.code}>{rejection.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <section className="border-b border-line p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-5xl font-semibold leading-none tabular-nums">
                  {euro(l.monthlyCost)}
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  {l.chargesIncluded
                    ? 'par mois, charges comprises'
                    : `par mois : ${euro(l.rent)} de loyer et ${euro(l.estimatedCharges)} de charges${
                        l.costIsEstimated ? ' (estimation, non précisées dans l’annonce)' : ''
                      }`}
                </p>
              </div>
              <TierTag tier={l.budgetTier} />
            </div>
            <div className="mt-4">
              <NetRent listing={l} size="lg" />
            </div>
            <div className="mt-3">
              <LoadLine cost={l.netCost} showScale />
            </div>

            <ul className="mt-5 grid gap-2.5 text-sm sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <Bike className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {l.bikeMinutes != null && l.bikeKm != null ? (
                  <span>
                    <span className="font-medium tabular-nums">{l.bikeMinutes} min</span> à vélo des
                    Chantiers, environ {formatKm(l.bikeKm)}
                    {l.locationPrecision === 'quartier' ? ' depuis le centre du quartier' : ''}
                  </span>
                ) : (
                  <span>Adresse non précisée : trajet à vérifier sur l’annonce</span>
                )}
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {l.address ? `${l.address}, ${l.districtName}` : l.districtName}
              </li>
              <li className="flex items-start gap-2">
                <CalendarCheck className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {formatAvailability(l.availableFrom)}
              </li>
              <li className="flex items-start gap-2">
                <Ruler className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  {formatSurface(l.surface)}, soit {euro(l.monthlyCost / l.surface)} par m²
                </span>
              </li>
            </ul>
          </section>

          <AidDetails listing={l} />

          <section className="border-b border-line p-5">
            <h3 className="font-medium">Votre suivi</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="detail-statut" className="label">
                  Étape
                </label>
                <StatusSelect
                  id="detail-statut"
                  value={entry.status}
                  onChange={(status) => onUpdate({ status })}
                />
              </div>
              <div>
                <label htmlFor="detail-visite" className="label">
                  Date de visite
                </label>
                <input
                  id="detail-visite"
                  type="date"
                  value={entry.visitDate}
                  onChange={(event) => onUpdate({ visitDate: event.target.value })}
                  className="field"
                />
              </div>
            </div>
            <label htmlFor="detail-notes" className="label mt-3">
              Notes
            </label>
            <textarea
              id="detail-notes"
              rows={4}
              value={entry.notes}
              onChange={(event) => onUpdate({ notes: event.target.value })}
              placeholder="Contact du bailleur, questions à poser, impressions après la visite"
              className="field resize-y"
            />
            <p className="mt-1.5 text-xs text-muted">
              Enregistré automatiquement dans ce navigateur
              {entry.updatedAt ? `, dernière modification le ${formatDate(entry.updatedAt)}` : ''}.
            </p>
          </section>

          <section className="border-b border-line p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium">Score de pertinence</h3>
                <p className="mt-1 text-sm text-muted">Cinq critères, pondérés selon vos priorités.</p>
              </div>
              <ScoreBadge score={l.score} large />
            </div>
            <ul className="mt-4 grid gap-3">
              {l.scoreParts.map((part) => (
                <li key={part.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{part.label}</span>
                    <span className="tabular-nums text-muted">
                      {String(part.points).replace('.', ',')} sur {part.max}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-surface-2">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${(part.points / part.max) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted">{part.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="p-5">
            <h3 className="font-medium">L’annonce</h3>
            {l.description ? (
              <p className="mt-2 text-sm leading-relaxed">{l.description}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">Pas de description enregistrée.</p>
            )}
            {l.features.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {l.features.map((feature) => (
                  <li key={feature} className="rounded-full border border-line px-2.5 py-0.5 text-sm">
                    {feature}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 text-sm text-muted">
              {l.sourceLabel}
              {l.publishedAt ? `, publiée le ${formatDate(l.publishedAt)}` : ''}, repérée par la
              collecte le {formatDate(l.firstSeen)}.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Les informations viennent de l’annonce d’origine : vérifiez-les avant de vous
              engager. Trajet estimé : distance à vol d’oiseau majorée de{' '}
              {Math.round((BIKE.detourFactor - 1) * 100)} % pour contourner les bassins, à{' '}
              {BIKE.speedKmh} km/h, plus {BIKE.fixedMinutes} min.
            </p>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          <ListingLink listing={l} className="btn btn-primary" />
          {onDelete ? (
            <button type="button" className="btn" onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden />
              Supprimer l’annonce
            </button>
          ) : null}
          <button type="button" className="btn ml-auto" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </aside>
    </div>
  );
}

/** Détail de l'estimation de l'aide au logement pour cette annonce. */
function AidDetails({ listing }: { listing: EvaluatedListing }) {
  const rentHc = rentExcludingCharges(listing);
  const aid = estimateApl(rentHc);
  const rows: [string, string][] = [
    ['Loyer hors charges', `${euro(rentHc)}${listing.chargesIncluded && listing.charges == null ? ' (charges estimées)' : ''}`],
    ['Loyer retenu par la CAF (plafonné)', euro(aid.rentRetained)],
    ['Forfait charges', euro(APL_SCALE.chargesAllowance)],
    ['Participation personnelle', `− ${euro(aid.participation)}`],
    ['Aide au logement estimée', euro(aid.amount)],
    ['Reste à payer chaque mois', euro(listing.netCost)],
  ];
  return (
    <section className="border-b border-line p-5">
      <h3 className="font-medium">Aide au logement estimée</h3>
      <dl className="mt-3 divide-y divide-line text-sm">
        {rows.map(([label, value], i) => (
          <div key={label} className={`flex justify-between gap-4 py-1.5 ${i >= 4 ? 'font-medium' : ''}`}>
            <dt className={i >= 4 ? '' : 'text-muted'}>{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Profil : {aidProfileLabel()}, ressources retenues {euro(aid.income)} par an (forfait étudiant
        de la CAF, appliqué même sans revenu).
        {aid.reducedForHighRent ? ' Aide réduite : le loyer dépasse 2,5 fois le plafond de la CAF.' : ''}{' '}
        Estimation indicative : seule la CAF fixe le montant, sur le simulateur de caf.fr.
      </p>
    </section>
  );
}
