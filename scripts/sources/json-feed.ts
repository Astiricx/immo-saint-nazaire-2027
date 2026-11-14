import { readFile } from 'node:fs/promises';
import type { RawListing } from '../../src/lib/types';
import { USER_AGENT } from '../lib/http';
import type { ListingSource } from './types';

const REQUIRED_FIELDS = ['ref', 'url', 'title', 'priceText', 'surfaceText', 'locationText'] as const;

/**
 * Flux JSON d'annonces (fichier du dépôt ou URL) : export d'un outil d'alertes, flux fourni
 * par une agence, API d'un portail dont vous avez la clé…
 * Variable du dépôt FEED_URLS : une ou plusieurs adresses séparées par des virgules.
 *
 *   [{ "ref": "123", "url": "https://…", "title": "T2 38 m² centre-ville",
 *      "priceText": "560 € CC", "surfaceText": "38 m²",
 *      "locationText": "Saint-Nazaire (44600), Centre-ville",
 *      "availabilityText": "Disponible le 04/01/2027" }]
 */
export const jsonFeedSource: ListingSource = {
  id: 'flux',
  label: 'Flux JSON',
  disabledReason() {
    return process.env.FEED_URLS?.trim() ? null : 'variable FEED_URLS non configurée';
  },
  async fetch() {
    const locations = (process.env.FEED_URLS ?? '')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    const listings: RawListing[] = [];
    const notes: string[] = [];

    for (const location of locations) {
      let payload: unknown;
      if (/^https?:\/\//i.test(location)) {
        const response = await fetch(location, {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          notes.push(`${location} : HTTP ${response.status}`);
          continue;
        }
        payload = await response.json();
      } else {
        payload = JSON.parse(await readFile(location, 'utf8'));
      }
      if (!Array.isArray(payload)) {
        notes.push(`${location} : le flux doit être un tableau JSON`);
        continue;
      }
      payload.forEach((item: unknown, index: number) => {
        if (!item || typeof item !== 'object') return;
        const record = item as Record<string, unknown>;
        const missing = REQUIRED_FIELDS.filter((field) => typeof record[field] !== 'string');
        if (missing.length > 0) {
          notes.push(`annonce n° ${index + 1} ignorée (${missing.join(', ')} manquant)`);
          return;
        }
        listings.push({
          description: '',
          ...(record as Partial<RawListing>),
          source: 'flux',
          sourceLabel: typeof record.sourceLabel === 'string' ? record.sourceLabel : 'Flux JSON',
        } as RawListing);
      });
    }
    return { listings, message: notes.length ? notes.join(' ; ') : undefined };
  },
};
