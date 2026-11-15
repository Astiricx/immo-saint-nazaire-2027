import { CRITERIA } from '../../src/lib/criteria';
import type { RawListing } from '../../src/lib/types';
import { PRIVATE_MODE } from '../lib/privacy';
import type { ListingSource } from './types';

/**
 * Grands portails (Leboncoin, SeLoger, Bien'ici) via Apify.
 *
 * Ces portails sont protégés contre les robots (DataDome). Les « Actors » Apify ci-dessous
 * passent ces protections avec des proxys résidentiels français et renvoient les annonces
 * en JSON. Vous payez Apify au résultat.
 *
 * Secret requis : APIFY_TOKEN. Ces sources ne s'activent qu'en mode privé
 * (secret LISTINGS_PASSPHRASE) : leurs annonces ne sont jamais publiées en clair.
 *
 * Chaque portail a plusieurs Actors candidats, essayés dans l'ordre : le premier qui renvoie
 * au moins une annonce exploitable est retenu. Les Actors de l'Apify Store sont publiés par des
 * tiers et peuvent disparaître : ajoutez-en un ici (actorId + input) si besoin.
 * Aucune limite de volume : toutes les annonces de la recherche sont collectées.
 */

export interface ApifyActor {
  actorId: string;
  input: Record<string, unknown>;
  /**
   * La recherche transmise à l'Actor filtre déjà sur « meublé » avec le filtre du portail :
   * une annonce sans mention contraire est alors considérée comme meublée.
   */
  furnishedFilter: boolean;
}

export interface ApifyPortal {
  id: string;
  label: string;
  /** Domaine des pages d'annonces : un résultat dont le lien pointe ailleurs est ignoré. */
  domain: string;
  actors: ApifyActor[];
}

const CITY = 'Saint-Nazaire';
/** Plafond technique très au-dessus du nombre d'annonces possibles : aucune annonce n'est écartée faute de place. */
const NO_LIMIT = 10000;
const FR_RESIDENTIAL = {
  useApifyProxy: true,
  apifyProxyGroups: ['RESIDENTIAL'],
  apifyProxyCountry: 'FR',
};

/**
 * Recherche Leboncoin : locations, Saint-Nazaire (44600), appartements, meublés,
 * 1 ou 2 pièces, 700 € maximum. C'est l'URL que le site lui-même produit avec ces filtres.
 */
export const LEBONCOIN_SEARCH_URL =
  `https://www.leboncoin.fr/recherche?category=10&locations=Saint-Nazaire_44600&real_estate_type=2&furnished=1&rooms=1-2&price=min-${CRITERIA.maxRent}`;

export const APIFY_PORTALS: ApifyPortal[] = [
  {
    id: 'leboncoin',
    label: 'Leboncoin',
    domain: 'leboncoin.fr',
    actors: [
      {
        actorId: 'data_alchemist/leboncoin',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxResults: 1000, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
      },
      {
        actorId: 'crawlerbros/leboncoin-scraper',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxItems: NO_LIMIT, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
      },
      {
        // Recherche par code postal, sans filtre meublé : le filtrage strict se fait ensuite.
        actorId: 'xtracto/leboncoin-listings',
        input: {
          category: '10',
          locations: ['44600'],
          priceMax: CRITERIA.maxRent,
          sortBy: 'time',
          maxResults: 0,
          proxyConfiguration: FR_RESIDENTIAL,
        },
        furnishedFilter: false,
      },
      {
        actorId: 'crawloop/leboncoin-scraper',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxItems: NO_LIMIT, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
      },
    ],
  },
  {
    id: 'seloger',
    label: 'SeLoger',
    domain: 'seloger.com',
    actors: [
      {
        actorId: 'abotapi/seloger-france-scraper',
        input: {
          mode: 'search',
          locations: ['44600'],
          distributionType: 'Rent',
          estateTypes: ['Apartment'],
          priceMax: CRITERIA.maxRent,
          sortBy: 'DateDesc',
          maxItems: 0,
          maxPages: 0,
          // Fiche complète : la description dit si le logement est meublé.
          getDetails: true,
          proxy: FR_RESIDENTIAL,
        },
        furnishedFilter: false,
      },
      {
        actorId: 'dltik/seloger-scraper',
        input: {
          transaction: 'rent',
          cities: [CITY],
          postalCodes: ['44600'],
          propertyTypes: ['apartment'],
          priceMax: CRITERIA.maxRent,
          roomsMax: 2,
          maxResults: NO_LIMIT,
          proxyConfiguration: FR_RESIDENTIAL,
        },
        furnishedFilter: false,
      },
      {
        actorId: 'lentic_clockss/seloger-property-scraper',
        input: {
          location: 'saint-nazaire',
          channel: 'RENT',
          propertyType: 'appartement',
          maxItems: 500,
          maxPages: 50,
          scrapeDetails: true,
        },
        furnishedFilter: false,
      },
    ],
  },
  {
    id: 'bienici',
    label: "Bien'ici",
    domain: 'bienici.com',
    actors: [
      {
        actorId: 'igolaizola/bienici-scraper',
        input: {
          location: CITY,
          operation: 'rent',
          maxPrice: CRITERIA.maxRent,
          maxRooms: 2,
          furnished: true,
          sortBy: 'relevance',
          maxItems: 0,
        },
        furnishedFilter: true,
      },
    ],
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
export function toRawListing(
  item: Item,
  portal: Pick<ApifyPortal, 'id' | 'label' | 'domain'>,
  furnishedFilter = false,
): RawListing | null {
  const url = toText(first(item, ['url', 'detailUrl', 'listingUrl', 'adUrl', 'link', 'permalink', 'href']));
  if (!/^https?:\/\//i.test(url) || !url.includes(portal.domain)) return null;

  const rent = toNumber(
    first(item, ['price_numeric', 'priceAmount', 'price', 'rent', 'monthlyRent', 'pricing.price', 'pricing.rent', 'priceValue', 'price_value']),
  );
  const surface = toNumber(
    first(item, ['surfaceArea', 'surface', 'area_m2', 'livingArea', 'living_area', 'livingSpace', 'area', 'size', 'surface_m2', 'squareMeters']) ??
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

  const furnishedValue = first(item, ['furnished', 'isFurnished', 'is_furnished', 'furnishedStatus']) ?? attributeLabel(item, 'furnished');
  let furnished: boolean | null =
    typeof furnishedValue === 'boolean'
      ? furnishedValue
      : typeof furnishedValue === 'string' && furnishedValue
        ? /non|unfurnished|vide|\b2\b|false/i.test(furnishedValue)
          ? false
          : /oui|yes|meubl[ée]|furnished|\b1\b|true/i.test(furnishedValue)
            ? true
            : null
        : null;
  // La recherche filtrait déjà sur « meublé » : sans indication contraire, l'annonce l'est.
  if (furnished === null && furnishedFilter) furnished = true;

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

const API = 'https://api.apify.com/v2';
/** Durée maximale d'une exécution d'Actor (la collecte complète d'un portail). */
const RUN_TIMEOUT_MS = 25 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function apify(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.APIFY_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(120000),
  });
}

function httpHint(status: number, actorId: string): string {
  if (status === 401) return 'jeton APIFY_TOKEN refusé';
  if (status === 402) return 'crédit Apify épuisé';
  if (status === 403) return `accès refusé à l'Actor ${actorId} (location payante non souscrite ?)`;
  if (status === 404) return `Actor ${actorId} introuvable`;
  if (status === 400) return `paramètres refusés par l'Actor ${actorId}`;
  return `HTTP ${status}`;
}

/** Lance un Actor, attend la fin de l'exécution et renvoie tout son jeu de données. */
export async function runActor(actor: ApifyActor): Promise<Item[]> {
  const id = actor.actorId.replace('/', '~');
  const start = await apify(`/acts/${id}/runs`, { method: 'POST', body: JSON.stringify(actor.input) });
  if (!start.ok) {
    const detail = (await start.text()).slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(`${httpHint(start.status, actor.actorId)} — ${detail}`);
  }
  let run = ((await start.json()) as { data: { id: string; status: string; defaultDatasetId: string; statusMessage?: string } }).data;

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (Date.now() > deadline) {
      await apify(`/actor-runs/${run.id}/abort`, { method: 'POST' }).catch(() => undefined);
      throw new Error(`exécution de ${actor.actorId} interrompue après 25 minutes`);
    }
    // Attente longue côté Apify : la réponse arrive dès que l'exécution se termine.
    const poll = await apify(`/actor-runs/${run.id}?waitForFinish=60`);
    if (poll.ok) run = ((await poll.json()) as { data: typeof run }).data;
    else await sleep(10000);
  }
  if (run.status !== 'SUCCEEDED') {
    // Une exécution échouée a parfois déjà enregistré des annonces : on les garde.
    console.log(`  ${actor.actorId} : exécution ${run.status}${run.statusMessage ? ` (${run.statusMessage.slice(0, 160)})` : ''}`);
  }

  const items: Item[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await apify(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&offset=${offset}&limit=1000`);
    if (!page.ok) throw new Error(`lecture des résultats de ${actor.actorId} : HTTP ${page.status}`);
    const batch = ((await page.json()) as unknown[]).filter(isObject);
    items.push(...batch);
    if (batch.length < 1000) break;
  }
  if (items.length === 0 && run.status !== 'SUCCEEDED') {
    throw new Error(`exécution ${run.status}${run.statusMessage ? ` : ${run.statusMessage.slice(0, 160)}` : ''}`);
  }
  return items;
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
      const failures: string[] = [];
      for (const actor of portal.actors) {
        let items: Item[];
        try {
          items = await runActor(actor);
        } catch (error) {
          const message = (error as Error).message;
          console.log(`  ${actor.actorId} : ${message}`);
          failures.push(`${actor.actorId} : ${message.split(' — ')[0]}`);
          continue;
        }
        const listings = items
          .map((item) => toRawListing(item, portal, actor.furnishedFilter))
          .filter((l): l is RawListing => l !== null);
        console.log(`  ${actor.actorId} : ${items.length} résultat(s), ${listings.length} converti(s)`);
        if (debug) console.log(`  champs présents : ${fieldCoverage(items)}`);
        if (listings.length === 0) {
          failures.push(`${actor.actorId} : ${items.length} résultat(s), aucun exploitable`);
          continue;
        }
        const skipped = items.length - listings.length;
        return {
          listings,
          message: `Actor ${actor.actorId} : ${items.length} résultat(s)${
            skipped ? `, ${skipped} sans lien, loyer ou surface lisible` : ''
          }${failures.length ? ` (avant lui : ${failures.join(' ; ')})` : ''}`,
        };
      }
      // Aucun Actor n'a fonctionné : la source est en erreur, ses annonces de la veille sont conservées.
      throw new Error(`aucun Actor exploitable — ${failures.join(' ; ')}`);
    },
  };
}
