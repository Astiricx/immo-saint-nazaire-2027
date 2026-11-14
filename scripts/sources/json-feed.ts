import { readFile } from 'node:fs/promises';
import type { RawListing } from '../../src/lib/types';
import type { ListingSource } from './types';

const REQUIRED_FIELDS = ['ref', 'url', 'title', 'priceText', 'surfaceText', 'locationText'] as const;

/**
 * Source réelle : un flux JSON (fichier local ou URL) contenant un tableau d'annonces brutes.
 *
 * C'est le point d'entrée prévu pour vos vraies annonces : export d'un outil d'alertes,
 * flux fourni par une agence, API d'un portail dont vous avez la clé, ou fichier que vous
 * tenez à jour à la main. Chaque élément suit le format RawListing (voir src/lib/types.ts) :
 *
 *   [{ "ref": "123", "url": "https://…", "title": "T2 38 m² centre-ville",
 *      "priceText": "560 € CC", "surfaceText": "38 m²",
 *      "locationText": "Saint-Nazaire (44600), Centre-ville",
 *      "availabilityText": "Disponible le 04/01/2027", "publishedAt": "2026-11-14" }]
 */
export function jsonFeedSource(location: string): ListingSource {
  return {
    id: 'flux',
    label: `Flux JSON (${location})`,
    async fetch() {
      const isUrl = /^https?:\/\//i.test(location);
      let payload: unknown;
      if (isUrl) {
        const response = await fetch(location, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`Flux inaccessible (${response.status} ${response.statusText}) : ${location}`);
        }
        payload = await response.json();
      } else {
        payload = JSON.parse(await readFile(location, 'utf8'));
      }

      if (!Array.isArray(payload)) {
        throw new Error('Le flux doit contenir un tableau JSON d’annonces.');
      }

      const today = new Date().toISOString().slice(0, 10);
      const listings: RawListing[] = [];
      payload.forEach((item: unknown, index: number) => {
        if (!item || typeof item !== 'object') return;
        const record = item as Record<string, unknown>;
        const missing = REQUIRED_FIELDS.filter((field) => typeof record[field] !== 'string');
        if (missing.length > 0) {
          console.warn(`  Annonce n° ${index + 1} ignorée, champs manquants : ${missing.join(', ')}`);
          return;
        }
        listings.push({
          description: '',
          publishedAt: today,
          ...(record as Partial<RawListing>),
          source: 'flux',
          isDemo: false,
        } as RawListing);
      });
      return listings;
    },
  };
}
