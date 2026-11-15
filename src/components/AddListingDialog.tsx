'use client';

import { Check, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { evaluate } from '@/lib/evaluate';
import { euro, typeLabel } from '@/lib/format';
import { DISTRICTS, getDistrict } from '@/lib/geo';
import type { Listing, PropertyType } from '@/lib/types';
import { useOverlay } from './ui';

interface FormState {
  title: string;
  url: string;
  type: PropertyType;
  rent: string;
  chargesIncluded: boolean;
  charges: string;
  surface: string;
  districtId: string;
  furnished: boolean;
  availableFrom: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  url: '',
  type: 'T2',
  rent: '',
  chargesIncluded: true,
  charges: '',
  surface: '',
  districtId: 'centre-ville',
  furnished: true,
  availableFrom: '',
  description: '',
};

const TYPE_CHOICES: PropertyType[] = ['T2', 'T3+', 'maison', 'studio'];
const DISTRICT_CHOICES = [...DISTRICTS].sort((a, b) =>
  a.name.localeCompare(b.name, 'fr'),
);

function buildListing(form: FormState, id: string, today: string): Listing | null {
  const rent = Number(form.rent.replace(',', '.'));
  const surface = Number(form.surface.replace(',', '.'));
  if (!(rent > 0) || !(surface > 0)) return null;
  const district = getDistrict(form.districtId) ?? DISTRICTS[DISTRICTS.length - 1];
  const charges = Number(form.charges.replace(',', '.'));
  return {
    id,
    source: 'manuel',
    sourceLabel: 'Ajout manuel',
    url: form.url.trim(),
    title: form.title.trim() || `${typeLabel(form.type)} de ${surface} m², ${district.name}`,
    description: form.description.trim(),
    type: form.type,
    isShared: false,
    rent,
    chargesIncluded: form.chargesIncluded,
    charges: !form.chargesIncluded && charges > 0 ? charges : null,
    surface,
    furnished: form.furnished,
    city: 'Saint-Nazaire',
    postcode: '44600',
    districtId: district.id,
    address: null,
    lat: district.lat,
    lng: district.lng,
    locationPrecision: 'quartier',
    availableFrom: form.availableFrom || null,
    publishedAt: today,
    firstSeen: today,
    features: [],
  };
}

/** Formulaire d'ajout d'une vraie annonce, avec le verdict des critères affiché en direct. */
export function AddListingDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (listing: Listing) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [urlError, setUrlError] = useState('');
  useOverlay(onClose);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const preview = useMemo(() => {
    const draft = buildListing(form, 'apercu', '2026-01-01');
    return draft ? evaluate(draft) : null;
  }, [form]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = form.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setUrlError('Le lien doit commencer par http:// ou https://');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const listing = buildListing(form, `manuel-${Date.now().toString(36)}`, today);
    if (!listing) return;
    onAdd(listing);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajout-titre"
        onSubmit={handleSubmit}
        className="relative w-full max-w-xl rounded-md border border-line bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id="ajout-titre" className="text-lg font-medium">
            Ajouter une annonce
          </h2>
          <button type="button" className="btn btn-quiet -mr-2 px-2" onClick={onClose} aria-label="Fermer">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ajout-lien" className="label">
              Lien de l’annonce
            </label>
            <input
              id="ajout-lien"
              type="url"
              inputMode="url"
              autoFocus
              value={form.url}
              onChange={(event) => {
                set('url', event.target.value);
                setUrlError('');
              }}
              placeholder="https://www.leboncoin.fr/ad/locations/…"
              className="field"
              aria-describedby={urlError ? 'ajout-lien-erreur' : undefined}
            />
            {urlError ? (
              <p id="ajout-lien-erreur" className="mt-1 text-sm text-signal">
                {urlError}
              </p>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ajout-titre-champ" className="label">
              Titre (facultatif)
            </label>
            <input
              id="ajout-titre-champ"
              type="text"
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="T2 lumineux près des Halles"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="ajout-type" className="label">
              Type de bien
            </label>
            <select
              id="ajout-type"
              value={form.type}
              onChange={(event) => set('type', event.target.value as PropertyType)}
              className="field"
            >
              {TYPE_CHOICES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ajout-quartier" className="label">
              Quartier
            </label>
            <select
              id="ajout-quartier"
              value={form.districtId}
              onChange={(event) => set('districtId', event.target.value)}
              className="field"
            >
              {DISTRICT_CHOICES.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ajout-loyer" className="label">
              Loyer mensuel, en euros
            </label>
            <input
              id="ajout-loyer"
              type="text"
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]+)?"
              value={form.rent}
              onChange={(event) => set('rent', event.target.value)}
              placeholder="560"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="ajout-surface" className="label">
              Surface, en m²
            </label>
            <input
              id="ajout-surface"
              type="text"
              inputMode="decimal"
              required
              pattern="[0-9]+([.,][0-9]+)?"
              value={form.surface}
              onChange={(event) => set('surface', event.target.value)}
              placeholder="38"
              className="field"
            />
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.chargesIncluded}
                onChange={(event) => set('chargesIncluded', event.target.checked)}
                className="size-4 accent-accent"
              />
              Charges comprises dans le loyer
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.furnished}
                onChange={(event) => set('furnished', event.target.checked)}
                className="size-4 accent-accent"
              />
              Meublé
            </label>
          </div>

          <div>
            <label htmlFor="ajout-charges" className="label">
              Charges en plus, en euros
            </label>
            <input
              id="ajout-charges"
              type="text"
              inputMode="decimal"
              disabled={form.chargesIncluded}
              pattern="[0-9]+([.,][0-9]+)?"
              value={form.chargesIncluded ? '' : form.charges}
              onChange={(event) => set('charges', event.target.value)}
              placeholder={form.chargesIncluded ? 'Déjà comprises' : 'Vide = estimation'}
              className="field disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="ajout-dispo" className="label">
              Disponible à partir du
            </label>
            <input
              id="ajout-dispo"
              type="date"
              value={form.availableFrom}
              onChange={(event) => set('availableFrom', event.target.value)}
              className="field"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ajout-description" className="label">
              Description (facultatif)
            </label>
            <textarea
              id="ajout-description"
              rows={2}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              className="field resize-y"
            />
          </div>
        </div>

        <div className="border-t border-line px-5 py-3 text-sm" aria-live="polite">
          {preview === null ? (
            <p className="text-muted">Indiquez le loyer et la surface pour voir le verdict des critères.</p>
          ) : preview.accepted ? (
            <p className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              <span>
                Dans les critères : {euro(preview.monthlyCost)} charges comprises,{' '}
                {preview.bikeMinutes} min à vélo, score de {preview.score} sur 100.
              </span>
            </p>
          ) : (
            <p className="text-signal">
              Sera classée parmi les annonces écartées :{' '}
              {preview.rejections.map((r) => r.detail.toLowerCase()).join(' ; ')}.
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary">
            Ajouter l’annonce
          </button>
        </footer>
      </form>
    </div>
  );
}
