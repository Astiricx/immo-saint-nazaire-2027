import { CRITERIA } from '../../src/lib/criteria';
import type { RawListing } from '../../src/lib/types';
import { PRIVATE_MODE } from '../lib/privacy';
import type { ListingSource } from './types';

/**
 * Grands portails (Leboncoin, SeLoger, Bien'ici) via Apify.
 *
 * Ces portails sont protégés contre les robots (DataDome). Les « Actors » Apify ci-dessous
 * passent ces protections avec des proxys résidentiels français et renvoient les annonces
 * en JSON. Vous payez Apify au résultat ; le crédit gratuit mensuel suffit au volume
 * d'une recherche à Saint-Nazaire.
 *
 * Secret requis : APIFY_TOKEN. Ces sources ne s'activent qu'en mode privé
 * (secret LISTINGS_PASSPHRASE) : leurs annonces ne sont jamais publiées en clair.
 *
 * Pour changer d'Actor (s'il disparaît ou se dégrade), modifiez actorId et input :
 * la conversion des résultats (toRawListing) s'adapte aux noms de champs courants.
 */

export interface ApifyPortal {
  id: string;
  label: string;
  actorId: string;
  /** Domaine des pages d'annonces : un résultat dont le lien pointe ailleurs est ignoré. */
  domain: string;
  input: Record<string, unknown>;
}

const MAX_ITEMS = Number(process.env.APIFY_MAX_ITEMS) || 60;
const CITY = 'Saint-Nazaire';
const FR_RESIDENTIAL = {
  useApifyProxy: true,
  apifyProxyGroups: ['RESIDENTIAL'],
  apifyProxyCountry: 'FR',
};

export const APIFY_PORTALS: ApifyPortal[] = [
  {
    id: 'leboncoin',
    label: 'Leboncoin',
    actorId: 'scrapifier/leboncoin-universal-scraper-real-estate',
    domain: 'leboncoin.fr',
    input: {
      category: '10',
      locations: [CITY],
      radius_m: 0,
      price_max: CRITERIA.maxRent,
      property_types: ['apartment'],
      rooms_min: 1,
      sort: 'newest',
      max_results: MAX_ITEMS,
      proxyConfiguration: FR_RESIDENTIAL,
    },
  },
  {
    id: 'seloger',
    label: 'SeLoger',
    actorId: 'igolaizola/seloger-scraper',
    domain: 'seloger.com',
    input: {
      location: CITY,
      locationType: 'city',
      operation: 'rent',
      propertyType: 'apartment',
      maxPrice: CRITERIA.maxRent,
      maxRooms: 2,
      warmRent: 'total',
      maxItems: MAX_ITEMS,
    },
  },
  {
    id: 'bienici',
    label: "Bien'ici",
    actorId: 'igolaizola/bienici-scraper',
    domain: 'bienici.com',
    input: {
      location: CITY,
      operation: 'rent',
      maxPrice: CRITERIA.maxRent,
      maxRooms: 2,
      sortBy: 'relevance',
      maxItems: MAX_ITEMS,
    },
  },
];

// ——— Conversion tolérante des résultats ———

type Item = Record<string, unknown>;

const isObject = (v: unknown): v is Item => !!v && typeof v === 'object' && !Array.isArray(v);

/** Valeur au chemin « a.b.c », ou undefined. */
function at(item: Item, path: string): unknown {
  let value: unknown = item;
  for (const key of path.split('.')) {
    if (!isObject(value)) return undefined;
    value = value[key];
  }
  return value;
}

const first = (item: Item, paths: string[]) => {
  for (const path of paths) {
    const value = at(item, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

/** Nombre dans 650, "650", "650 €", "60 m²", [650], { value: 650 }, { amount: 650 }. */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return toNumber(value[0]);
  if (isObject(value)) return toNumber(value.value ?? value.amount ?? value.min);
  if (typeof value === 'string') {
    const m = value.replace(/[\s  ]/g, '').match(/\d+(?:[.,]\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  }
  return null;
}

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (isObject(value)) return toText(value.name ?? value.label ?? value.value);
  return '';
};

/** Attributs « clé / valeur » à la Leboncoin : [{ key: 'square', value: '38' }]. */
function attribute(item: Item, keys: string[]): unknown {
  const list = item.attributes;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (isObject(entry) && keys.includes(String(entry.key))) {
        return entry.value ?? entry.value_label;
      }
    }
  }
  if (isObject(list)) {
    for (const key of keys) if (list[key] !== undefined) return list[key];
  }
  return undefined;
}

function attributeLabel(item: Item, key: string): string {
  const list = item.attributes;
  if (Array.isArray(list)) {
    const entry = list.find((e) => isObject(e) && e.key === key) as Item | undefined;
    return entry ? `${toText(entry.value_label)} ${toText(entry.value)}`.trim() : '';
  }
  return '';
}

/** Charges comprises ? true, false, ou null si l'annonce ne le dit pas. */
function chargesIncluded(item: Item): boolean | null {
  const flag = first(item, ['chargesIncluded', 'charges_included', 'pricing.chargesIncluded', 'isChargesIncluded']);
  if (typeof flag === 'boolean') return flag;
  const attr = attributeLabel(item, 'charges_included').toLowerCase();
  if (attr) return /oui|yes|\b1\b|compris/.test(attr);
  const label = toText(first(item, ['priceLabel', 'price_label', 'priceText', 'formattedPrice', 'pricing.label']));
  if (/\bcc\b|charges comprises|charges incluses/i.test(label)) return true;
  if (/\bhc\b|hors charges/i.test(label)) return false;
  return null;
}

/**
 * Convertit un résultat d'Actor en annonce brute. Les noms de champs varient d'un Actor
 * à l'autre : on essaie les plus courants. Renvoie null si le lien, le loyer ou la surface manque.
 */
export function toRawListing(item: Item, portal: Pick<ApifyPortal, 'id' | 'label' | 'domain'>): RawListing | null {
  const url = toText(first(item, ['url', 'detailUrl', 'listingUrl', 'adUrl', 'link', 'permalink', 'href']));
  if (!/^https?:\/\//i.test(url) || !url.includes(portal.domain)) return null;

  const rent = toNumber(
    first(item, ['price', 'rent', 'monthlyRent', 'pricing.price', 'pricing.rent', 'priceValue', 'price_value']),
  );
  const surface = toNumber(
    first(item, ['surfaceArea', 'surface', 'livingArea', 'livingSpace', 'area', 'size', 'surface_m2', 'squareMeters']) ??
      attribute(item, ['square', 'surface', 'living_area']),
  );
  if (!rent || !surface) return null;

  const charges = toNumber(first(item, ['charges', 'chargesAmount', 'monthlyCharges', 'pricing.charges', 'serviceCharges']));
  const included = chargesIncluded(item);
  const priceText =
    included === true
      ? `${rent} € CC`
      : charges != null && charges > 0 && charges < 400
        ? `${rent} € + ${charges} € de charges`
        : included === false
          ? `${rent} € HC`
          : `${rent} €`;

  const rooms = toNumber(first(item, ['roomsQuantity', 'rooms', 'roomCount', 'numberOfRooms', 'nbRooms']) ?? attribute(item, ['rooms']));
  const typeHint = [
    toText(first(item, ['propertySubtype', 'propertySubType', 'subType', 'propertyType', 'type'])),
    toText(attribute(item, ['real_estate_type'])),
  ].join(' ');
  let title = toText(first(item, ['subject', 'title', 'name', 'heading'])) || typeHint || 'Appartement';
  // Le type (studio, T2…) se lit dans le titre : on y ajoute le nombre de pièces s'il manque.
  if (rooms && !/studio|\bt\s?\d\b|\bf\s?\d\b|pi[eè]ces?/i.test(title)) {
    title = `${title} - ${rooms} pièce${rooms > 1 ? 's' : ''}`;
  }
  if (/studio/i.test(typeHint) && !/studio/i.test(title)) title = `Studio - ${title}`;

  const city = toText(first(item, ['location.city_label', 'location.city', 'city', 'address.city', 'address.addressLocality', 'locality']));
  const postcode = toText(first(item, ['location.zipcode', 'postalCode', 'zipcode', 'zipCode', 'postcode', 'address.postalCode']));
  const district = toText(first(item, ['district.name', 'district', 'location.district', 'neighborhood', 'neighbourhood', 'quartier']));
  const street = toText(first(item, ['address.street', 'address.streetAddress', 'street', 'streetAddress']));

  // Les portails floutent la position (centre de la commune ou cercle de quelques centaines de mètres) :
  // on ne s'en sert que si le résultat dit explicitement que l'adresse est connue.
  const addressKnown = first(item, ['addressKnown', 'isAddressKnown', 'exactLocation']) === true;
  const lat = addressKnown ? toNumber(first(item, ['latitude', 'lat', 'location.lat', 'blurInfo.position.lat', 'position.lat', 'coordinates.lat'])) : null;
  const lng = addressKnown ? toNumber(first(item, ['longitude', 'lng', 'lon', 'location.lng', 'blurInfo.position.lon', 'position.lon', 'coordinates.lng'])) : null;

  const furnishedValue = first(item, ['furnished', 'isFurnished']) ?? attributeLabel(item, 'furnished');
  const furnished =
    typeof furnishedValue === 'boolean'
      ? furnishedValue
      : typeof furnishedValue === 'string' && furnishedValue
        ? /oui|yes|meubl[ée]|\b1\b/i.test(furnishedValue) && !/non/i.test(furnishedValue)
        : undefined;

  const published = toText(first(item, ['first_publication_date', 'publicationDate', 'publishedAt', 'createdAt', 'creationDate', 'date']));
  const availability = toText(first(item, ['availableFrom', 'availabilityDate', 'availableDate', 'available_date', 'availability']));
  const ref = toText(first(item, ['id', 'list_id', 'listId', 'adId', 'reference'])) || url;

  return {
    source: portal.id,
    sourceLabel: portal.label,
    ref,
    url: url.split('#')[0],
    title,
    description: toText(first(item, ['body', 'description', 'text', 'summary'])),
    priceText,
    surfaceText: `${surface} m²`,
    locationText: [city || CITY, postcode ? `(${postcode})` : '', district ? `, ${district}` : ''].join(' ').replace(' ,', ',').trim(),
    availabilityText: availability
      ? /^\d{4}-\d{2}-\d{2}/.test(availability)
        ? `Disponible le ${availability.slice(8, 10)}/${availability.slice(5, 7)}/${availability.slice(0, 4)}`
        : availability
      : undefined,
    publishedAt: /^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : undefined,
    address: street || undefined,
    lat: lat ?? undefined,
    lng: lng ?? undefined,
    furnished,
  };
}

/** Noms de champs présents dans les résultats : sert à vérifier la conversion sans rien dévoiler des annonces. */
function fieldCoverage(items: Item[]): string {
  const counts = new Map<string, number>();
  for (const item of items) for (const key of Object.keys(item)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${k}:${n}`).join(' ');
}

export function apifySource(portal: ApifyPortal): ListingSource {
  return {
    id: portal.id,
    label: `${portal.label} (via Apify)`,
    disabledReason() {
      if (!process.env.APIFY_TOKEN) return 'secret APIFY_TOKEN non configuré';
      if (!PRIVATE_MODE) return 'secret LISTINGS_PASSPHRASE non configuré : annonces jamais publiées en clair';
      return null;
    },
    async fetch(debug) {
      const actor = portal.actorId.replace('/', '~');
      const response = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=280&format=json&clean=true`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${process.env.APIFY_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(portal.input),
          signal: AbortSignal.timeout(300000),
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
        const hint =
          response.status === 401
            ? 'jeton APIFY_TOKEN refusé'
            : response.status === 402
              ? 'crédit Apify épuisé'
              : response.status === 404
                ? `Actor ${portal.actorId} introuvable`
                : response.status === 408
                  ? 'Actor trop long (plus de 5 minutes)'
                  : `HTTP ${response.status}`;
        throw new Error(`${hint} — ${detail}`);
      }
      const payload: unknown = await response.json();
      const items = (Array.isArray(payload) ? payload : []).filter(isObject);
      const listings = items
        .map((item) => toRawListing(item, portal))
        .filter((l): l is RawListing => l !== null);

      if (debug) {
        console.log(`  [${portal.id}] ${items.length} résultat(s) Apify, ${listings.length} converti(s)`);
        console.log(`  [${portal.id}] champs présents : ${fieldCoverage(items)}`);
      }
      const skipped = items.length - listings.length;
      return {
        listings,
        message: `${items.length} résultat(s) Apify${skipped ? `, ${skipped} sans lien, loyer ou surface lisible` : ''}`,
      };
    },
  };
}
