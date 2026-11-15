import { estimateApl } from '../../src/lib/apl';
import { CRITERIA } from '../../src/lib/criteria';
import type { RawListing } from '../../src/lib/types';
import { PRIVATE_MODE } from '../lib/privacy';
import type { ListingSource } from './types';

/**
 * Grands portails (Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, ParuVendu) via Apify.
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
  /** Une recherche, ou plusieurs (par exemple appartements puis maisons) dont les résultats s'additionnent. */
  input: Record<string, unknown> | Record<string, unknown>[];
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
const POSTCODE = '44600';
// Volumes : chaque Actor reçoit son maximum accepté (1000 en général), très au-dessus du nombre
// d'annonces de Saint-Nazaire : aucune annonce n'est écartée faute de place.
/**
 * Clé à ajouter à une recherche (jamais transmise à l'Actor) : ses résultats viennent d'une page
 * déjà filtrée sur « meublé » par le portail.
 */
const FURNISHED_SEARCH = '__furnishedSearch';

const FR_RESIDENTIAL = {
  useApifyProxy: true,
  apifyProxyGroups: ['RESIDENTIAL'],
  apifyProxyCountry: 'FR',
};

/**
 * Loyer affiché maximal demandé aux portails. Le plafond porte sur le loyer NET
 * (charges comprises − aide au logement estimée) : on cherche donc jusqu'au plafond net
 * plus l'aide maximale, arrondi aux 50 € supérieurs. Le filtrage exact se fait ensuite.
 */
export const SEARCH_MAX_RENT =
  Math.ceil((CRITERIA.maxNetRent + estimateApl(CRITERIA.maxNetRent).amount) / 50) * 50;

/** Identifiant de Saint-Nazaire (44600) sur les portails du groupe SeLoger / Logic-Immo. */
const AVIV_LOCATION = 'AD08FR17295';

/**
 * Recherche Leboncoin : locations meublées à Saint-Nazaire (44600), maisons et appartements,
 * 25 m² minimum, loyer affiché jusqu'à SEARCH_MAX_RENT. C'est l'URL que le site produit avec ces filtres.
 */
export const LEBONCOIN_SEARCH_URL =
  `https://www.leboncoin.fr/recherche?category=10&locations=Saint-Nazaire_${POSTCODE}&real_estate_type=1,2&furnished=1&square=${CRITERIA.minSurface}-max&price=min-${SEARCH_MAX_RENT}`;

export const LOGICIMMO_SEARCH_URL =
  `https://www.logic-immo.com/classified-search?distributionTypes=Rent&estateTypes=House,Apartment&locations=${AVIV_LOCATION}&priceMax=${SEARCH_MAX_RENT}&spaceMin=${CRITERIA.minSurface}`;

/** Toutes les locations PAP à Saint-Nazaire (le code g24084 est celui de la commune sur pap.fr). */
export const PAP_SEARCH_URL = 'https://www.pap.fr/annonce/locations-saint-nazaire-44600-g24084';

/** Pages de résultats ParuVendu, sous deux formes d'adresse : la seconde sert si la première ne donne rien. */
export const PARUVENDU_SEARCH_URLS = [
  'https://www.paruvendu.fr/immobilier/recherche/location/saint-nazaire-44600/',
  'https://www.paruvendu.fr/immobilier/recherche/location/appartement/saint-nazaire-44600/',
];
export const PARUVENDU_CATEGORY_URLS = [
  'https://www.paruvendu.fr/immobilier/location/appartement/meuble/saint-nazaire-44600/',
  'https://www.paruvendu.fr/immobilier/location/appartement/saint-nazaire-44600/',
  'https://www.paruvendu.fr/immobilier/location/maison/saint-nazaire-44600/',
];

/** Agrégateur multi-portails (PAP, Logic-Immo…) : sert de solution de repli. */
const pigeImmo = (source: string, proxy: Record<string, unknown>): ApifyActor => ({
  actorId: 'dltik/pige-immo-fr-scraper',
  input: {
    sources: [source],
    transaction: 'rent',
    cities: [CITY],
    postalCodes: [POSTCODE],
    propertyTypes: ['appartement', 'maison'],
    priceMax: SEARCH_MAX_RENT,
    surfaceMin: CRITERIA.minSurface,
    // Maximum accepté par l'Actor : 5000 ; la recherche en compte bien moins.
    maxResultsPerSource: 1000,
    enrichDpe: false,
    dedupAcrossSources: false,
    proxyConfig: proxy,
  },
  furnishedFilter: false,
});

/**
 * Ordre de passage : du plus rentable au plus coûteux. SeLoger passe en dernier : c'est le plus cher
 * (environ 0,36 $ par collecte pour peu d'annonces retenues) et Logic-Immo en reprend une partie.
 */
export const APIFY_PORTALS: ApifyPortal[] = [
  {
    id: 'leboncoin',
    label: 'Leboncoin',
    domain: 'leboncoin.fr',
    actors: [
      {
        // 1000 est le maximum accepté par cet Actor, bien au-delà des annonces de la recherche.
        actorId: 'data_alchemist/leboncoin',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxResults: 1000, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
      },
      {
        actorId: 'crawlerbros/leboncoin-scraper',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxItems: 1000, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
      },
      // xtracto/leboncoin-listings a été retiré : sa recherche par code postal ramenait des centaines
      // d'annonces hors Saint-Nazaire et non meublées, et a épuisé le crédit Apify mensuel en une exécution.
      {
        actorId: 'crawloop/leboncoin-scraper',
        input: { startUrls: [{ url: LEBONCOIN_SEARCH_URL }], maxItems: 1000, proxyConfiguration: FR_RESIDENTIAL },
        furnishedFilter: true,
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
          maxPrice: SEARCH_MAX_RENT,
          minSurface: CRITERIA.minSurface,
          furnished: true,
          sortBy: 'relevance',
          maxItems: 0,
        },
        furnishedFilter: true,
      },
    ],
  },
  {
    id: 'pap',
    label: 'PAP',
    domain: 'pap.fr',
    actors: [
      {
        // Payé à l'annonce, proxys compris : fonctionne avec l'offre gratuite d'Apify.
        actorId: 'tagadanar/french-real-estate-pap',
        input: {
          searchUrls: [PAP_SEARCH_URL],
          maxPrice: SEARCH_MAX_RENT,
          minSurface: CRITERIA.minSurface,
          // Fiche complète : description entière (« meublé ») et rue.
          scrapeDetails: true,
          maxResults: 1000,
          maxPagesPerUrl: 20,
        },
        furnishedFilter: false,
      },
      pigeImmo('pap', { useApifyProxy: true }),
    ],
  },
  {
    id: 'logicimmo',
    label: 'Logic-Immo',
    domain: 'logic-immo.com',
    actors: [
      {
        // Payé à l'annonce, proxys résidentiels compris.
        actorId: 'tagadanar/french-real-estate-logicimmo',
        input: {
          searchUrls: [LOGICIMMO_SEARCH_URL],
          maxPrice: SEARCH_MAX_RENT,
          minSurface: CRITERIA.minSurface,
          // Maximum accepté par l'Actor : 1050.
          maxResults: 1000,
          maxPagesPerUrl: 40,
        },
        furnishedFilter: false,
      },
      // studio-amba/logicimmo-scraper a été retiré : Actor en location, refusé avec le crédit gratuit.
      pigeImmo('logic_immo', FR_RESIDENTIAL),
    ],
  },
  {
    id: 'paruvendu',
    label: 'ParuVendu',
    domain: 'paruvendu.fr',
    actors: [
      {
        // Payé à l'annonce, proxys compris. La première recherche ne contient que des meublés.
        // ParuVendu ne dit pas toujours « meublé » dans le texte : la page des meublés est lue à part.
        actorId: 'tagadanar/french-real-estate-paruvendu',
        input: [
          {
            searchUrls: [
              'https://www.paruvendu.fr/immobilier/recherche/location/appartement/meuble/saint-nazaire-44600/',
              PARUVENDU_CATEGORY_URLS[0],
            ],
            scrapeDetails: true,
            maxResults: 1000,
            maxPagesPerUrl: 20,
            [FURNISHED_SEARCH]: true,
          },
          { searchUrls: PARUVENDU_SEARCH_URLS, scrapeDetails: true, maxResults: 1000, maxPagesPerUrl: 20 },
        ],
        furnishedFilter: false,
      },
      {
        actorId: 'tagadanar/french-real-estate-paruvendu',
        input: { searchUrls: PARUVENDU_CATEGORY_URLS, scrapeDetails: true, maxResults: 1000, maxPagesPerUrl: 20 },
        furnishedFilter: false,
      },
    ],
  },
  {
    id: 'seloger',
    label: 'SeLoger',
    domain: 'seloger.com',
    actors: [
      {
        // Recherche par ville, appartements puis maisons. L'Actor n'accepte pas les URL de recherche
        // filtrées (loyer, surface) : le filtrage se fait ensuite. Le portail ne publie pas de champ
        // « meublé » : il est lu dans le texte et les caractéristiques de l'annonce.
        actorId: 'lentic_clockss/seloger-property-scraper',
        input: ['appartement', 'maison'].map((propertyType) => ({
          location: 'saint-nazaire',
          channel: 'RENT',
          propertyType,
          maxItems: 500,
          maxPages: 50,
          scrapeDetails: true,
        })),
        furnishedFilter: false,
      },
      {
        // Exige une offre Apify payante (accès aux proxys résidentiels).
        actorId: 'abotapi/seloger-france-scraper',
        input: {
          mode: 'search',
          locations: [POSTCODE],
          distributionType: 'Rent',
          estateTypes: ['Apartment', 'House'],
          priceMax: SEARCH_MAX_RENT,
          spaceMin: CRITERIA.minSurface,
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
          postalCodes: [POSTCODE],
          propertyTypes: ['apartment', 'house'],
          priceMax: SEARCH_MAX_RENT,
          surfaceMin: CRITERIA.minSurface,
          maxResults: 1000,
          proxyConfiguration: FR_RESIDENTIAL,
        },
        furnishedFilter: false,
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
  const label = [
    toText(first(item, ['priceLabel', 'price_label', 'priceText', 'formattedPrice', 'priceFormatted', 'pricing.label'])),
    toText(item.chargesLabel),
  ].join(' ');
  if (/\bcc\b|charges comprises|charges incluses/i.test(label)) return true;
  if (/\bhc\b|hors charges/i.test(label)) return false;
  return null;
}

const FURNISHED_KEY = /furnish|meubl/i;

/** Lit une valeur « meublé » : booléen, 1/0, « oui », « Meublé », « Non meublé », « Unfurnished »… */
export function furnishedFromValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 || value === 2 ? false : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  if (/\bnon\b|unfurnished|\bvide\b|^\s*2\s*$|false|^\s*no\s*$/i.test(value)) return false;
  if (/oui|yes|meubl|furnished|^\s*1\s*$|true/i.test(value)) return true;
  return null;
}

/**
 * Cherche l'état « meublé » partout dans un résultat : champ dédié à n'importe quelle profondeur
 * (features.furnished, rawData.isFurnished…), ou étiquette « Meublé » dans une liste de caractéristiques.
 * SeLoger, notamment, ne le donne que dans ses caractéristiques.
 */
export function findFurnished(item: unknown, depth = 0): boolean | null {
  if (depth > 5 || item == null) return null;
  if (Array.isArray(item)) {
    let found: boolean | null = null;
    for (const entry of item) {
      if (typeof entry === 'string') {
        if (/non[\s-]+meubl|unfurnished/i.test(entry)) return false;
        if (/\bmeubl[ée]|\bfurnished\b/i.test(entry)) found = true;
      } else {
        const inner = findFurnished(entry, depth + 1);
        if (inner === false) return false;
        if (inner === true) found = true;
      }
    }
    return found;
  }
  if (!isObject(item)) return null;
  // Attribut « clé / valeur » : { key: 'furnished', value: '1' } ou { name: 'Meublé', value: true }.
  const label = toText(item.key ?? item.name ?? item.label ?? item.type ?? item.code);
  if (label && FURNISHED_KEY.test(label)) {
    const own = furnishedFromValue(item.value ?? item.value_label ?? item.enabled ?? true);
    if (own !== null) return /non|unfurnish/i.test(label) ? !own : own;
  }
  let found: boolean | null = null;
  for (const [key, value] of Object.entries(item)) {
    if (FURNISHED_KEY.test(key) && (typeof value !== 'object' || value === null)) {
      const own = furnishedFromValue(value);
      if (own !== null) {
        if (/^(is)?(un|non)/i.test(key)) return !own;
        return own;
      }
    }
    if (value && typeof value === 'object') {
      const inner = findFurnished(value, depth + 1);
      if (inner === false) return false;
      if (inner === true) found = true;
    }
  }
  return found;
}

/** Étiquettes courtes des listes de caractéristiques (« Balcon », « Meublé », « Local à vélos »). */
function featureLabels(item: Item): string[] {
  const labels = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 3 || value == null) return;
    if (typeof value === 'string') {
      if (value.length <= 40) labels.add(value.trim());
    } else if (Array.isArray(value)) {
      value.forEach((v) => visit(v, depth + 1));
    } else if (isObject(value)) {
      // { label: 'Meublé', value: false } : caractéristique absente, à ne pas reprendre comme texte.
      const absent = value.value === false || value.enabled === false || /^(non|no|false)$/i.test(toText(value.value));
      const text = toText(value.label ?? value.name ?? value.title ?? value.value);
      if (text && text.length <= 40 && !absent) labels.add(text);
      // Objet de booléens : { balcony: true, furnished: false } → on garde les clés vraies.
      for (const [key, v] of Object.entries(value)) if (v === true) labels.add(key);
    }
  };
  for (const key of ['features', 'tags', 'keyFacts', 'amenities', 'characteristics', 'criteria']) visit(item[key], 0);
  return [...labels].filter(Boolean);
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

  const chargesLabel = toText(item.chargesLabel);
  const charges = toNumber(
    first(item, ['charges', 'chargesAmount', 'monthlyCharges', 'pricing.charges', 'serviceCharges']) ??
      (/\d/.test(chargesLabel) ? chargesLabel : undefined),
  );
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
  const postcode = toText(first(item, ['location.zipcode', 'postalCode', 'postal_code', 'zipcode', 'zipCode', 'postcode', 'address.postalCode']));
  const district = toText(first(item, ['district.name', 'district', 'location.district', 'neighborhood', 'neighbourhood', 'quartier']));
  const street = toText(first(item, ['address.street', 'address.streetAddress', 'street', 'streetAddress']));

  // Les portails floutent la position (centre de la commune ou cercle de quelques centaines de mètres) :
  // on ne s'en sert que si le résultat dit explicitement que l'adresse est connue.
  const addressKnown = first(item, ['addressKnown', 'isAddressKnown', 'exactLocation']) === true;
  const lat = addressKnown ? toNumber(first(item, ['latitude', 'lat', 'location.lat', 'blurInfo.position.lat', 'position.lat', 'coordinates.lat'])) : null;
  const lng = addressKnown ? toNumber(first(item, ['longitude', 'lng', 'lon', 'location.lng', 'blurInfo.position.lon', 'position.lon', 'coordinates.lng'])) : null;

  const furnishedValue = first(item, ['furnished', 'isFurnished', 'is_furnished', 'furnishedStatus']) ?? attributeLabel(item, 'furnished');
  let furnished: boolean | null = furnishedFromValue(furnishedValue) ?? findFurnished(item);
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
    description: [
      toText(first(item, ['body', 'description', 'text', 'summary'])),
      toText(first(item, ['headline', 'subtitle'])),
      featureLabels(item).join(' · '),
    ]
      .filter(Boolean)
      .join('\n'),
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
/**
 * Coût maximal d'une exécution d'Actor payé au résultat, en dollars : une recherche mal comprise
 * par un Actor ne peut pas consommer tout le crédit Apify du mois.
 */
const MAX_RUN_COST_USD = 0.75;
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
  if (status === 403) return `accès refusé à l'Actor ${actorId}`;
  if (status === 404) return `Actor ${actorId} introuvable`;
  if (status === 400) return `paramètres refusés par l'Actor ${actorId}`;
  return `HTTP ${status}`;
}

/** Crédit Apify du mois épuisé : inutile d'essayer les autres Actors avant la remise à zéro. */
export class CreditExhaustedError extends Error {
  constructor(renewal?: string) {
    super(
      `crédit Apify du mois épuisé : les portails reprendront ${
        renewal ? `le ${renewal}, au renouvellement du crédit` : 'au renouvellement du crédit'
      }, ou plus tôt avec une offre Apify payante`,
    );
  }
}

/**
 * Garde-fou du crédit : une exécution n'est lancée que s'il reste au moins MAX_RUN_COST_USD
 * de crédit ce mois-ci. Sans réponse de l'API, on laisse faire (le plafond par exécution s'applique).
 */
async function creditAllowsRun(): Promise<boolean> {
  const usage = await apifyUsage();
  return !usage || usage.limit - usage.used >= MAX_RUN_COST_USD;
}

/** Consommation du mois sur le compte Apify, en dollars : { used, limit }, si l'API la donne. */
export async function apifyUsage(): Promise<{ used: number; limit: number } | null> {
  try {
    const response = await apify('/users/me/limits');
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } };
    };
    const used = body.data?.current?.monthlyUsageUsd;
    const limit = body.data?.limits?.maxMonthlyUsageUsd;
    return used != null && limit != null ? { used, limit } : null;
  } catch {
    return null;
  }
}

/** Date de renouvellement du crédit mensuel Apify, au format jj/mm/aaaa, si l'API la donne. */
async function creditRenewal(): Promise<string | undefined> {
  try {
    const response = await apify('/users/me/limits');
    if (!response.ok) return undefined;
    const body = (await response.json()) as { data?: { monthlyUsageCycle?: { endAt?: string } } };
    const end = body.data?.monthlyUsageCycle?.endAt;
    if (!end) return undefined;
    // Le crédit revient le lendemain de la fin du cycle.
    const next = new Date(new Date(end).getTime() + 1000);
    return next.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  } catch {
    return undefined;
  }
}

/** Chemins des champs dont le nom évoque « meublé » : vérifie la lecture sans rien dévoiler des annonces. */
function furnishedPaths(items: Item[]): string {
  const counts = new Map<string, number>();
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.slice(0, 50).forEach((v) => visit(v, `${path}[]`, depth + 1));
      return;
    }
    for (const [key, v] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (FURNISHED_KEY.test(key)) counts.set(next, (counts.get(next) ?? 0) + 1);
      visit(v, next, depth + 1);
    }
  };
  items.forEach((item) => visit(item, '', 0));
  return [...counts.entries()].map(([k, n]) => `${k}:${n}`).join(' ') || 'aucun';
}

/** Lance un Actor, attend la fin de l'exécution et renvoie tout son jeu de données. */
export async function runActor(actor: ApifyActor, input: Record<string, unknown>): Promise<Item[]> {
  const id = actor.actorId.replace('/', '~');
  // maxTotalChargeUsd : plafond des Actors payés au résultat ; timeout : arrêt côté Apify au bout de 20 min.
  const start = await apify(`/acts/${id}/runs?maxTotalChargeUsd=${MAX_RUN_COST_USD}&timeout=1200`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!start.ok) {
    const detail = (await start.text()).slice(0, 200).replace(/\s+/g, ' ');
    if (/actor-disabled|monthly usage|usage limit/i.test(detail)) throw new CreditExhaustedError(await creditRenewal());
    throw new Error(`${httpHint(start.status, actor.actorId)} — ${detail}`);
  }
  let run = (
    (await start.json()) as {
      data: { id: string; status: string; defaultDatasetId: string; statusMessage?: string; usageTotalUsd?: number };
    }
  ).data;
  let stoppedForCost = false;

  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (Date.now() > deadline) {
      await apify(`/actor-runs/${run.id}/abort`, { method: 'POST' }).catch(() => undefined);
      throw new Error(`exécution de ${actor.actorId} interrompue après 25 minutes`);
    }
    // Attente longue côté Apify : la réponse arrive dès que l'exécution se termine.
    const poll = await apify(`/actor-runs/${run.id}?waitForFinish=30`);
    if (poll.ok) run = ((await poll.json()) as { data: typeof run }).data;
    else await sleep(10000);
    // Actors payés à l'usage (calcul + proxys) : maxTotalChargeUsd ne les borne pas, on surveille.
    if (!stoppedForCost && (run.usageTotalUsd ?? 0) >= MAX_RUN_COST_USD && run.status === 'RUNNING') {
      stoppedForCost = true;
      console.log(`  ${actor.actorId} : arrêt à ${MAX_RUN_COST_USD} $ de consommation (plafond par exécution)`);
      await apify(`/actor-runs/${run.id}/abort?gracefully=true`, { method: 'POST' }).catch(() => undefined);
    }
  }
  console.log(
    `  ${actor.actorId} : exécution ${run.status.toLowerCase()}, consommation plateforme ${(run.usageTotalUsd ?? 0).toFixed(3)} $`,
  );
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
      const before = await apifyUsage();
      for (const actor of portal.actors) {
        const items: Item[] = [];
        /** Résultats issus d'une recherche déjà filtrée sur « meublé ». */
        const fromFurnishedSearch = new Set<Item>();
        let lastError: string | null = null;
        for (const search of Array.isArray(actor.input) ? actor.input : [actor.input]) {
          const { [FURNISHED_SEARCH]: furnishedSearch, ...input } = search;
          if (!(await creditAllowsRun())) {
            lastError = `crédit Apify presque épuisé (réserve de ${MAX_RUN_COST_USD} $) : exécution reportée`;
            console.log(`  ${actor.actorId} : ${lastError}`);
            break;
          }
          try {
            const batch = await runActor(actor, input);
            items.push(...batch);
            if (furnishedSearch === true) batch.forEach((item) => fromFurnishedSearch.add(item));
          } catch (error) {
            if (error instanceof CreditExhaustedError) throw error;
            lastError = (error as Error).message;
            console.log(`  ${actor.actorId} : ${lastError}`);
          }
        }
        if (items.length === 0 && lastError) {
          failures.push(`${actor.actorId} : ${lastError.split(' — ')[0]}`);
          continue;
        }
        const listings = items
          .map((item) => toRawListing(item, portal, actor.furnishedFilter || fromFurnishedSearch.has(item)))
          .filter((l): l is RawListing => l !== null);
        console.log(`  ${actor.actorId} : ${items.length} résultat(s), ${listings.length} converti(s)`);
        if (debug) {
          const states = { oui: 0, non: 0, inconnu: 0 };
          for (const l of listings) states[l.furnished === true ? 'oui' : l.furnished === false ? 'non' : 'inconnu'] += 1;
          console.log(`  champs présents : ${fieldCoverage(items)}`);
          console.log(`  champs « meublé » : ${furnishedPaths(items)}`);
          console.log(`  meublé lu dans les données : ${states.oui} oui, ${states.non} non, ${states.inconnu} non précisé`);
          const lengths = listings.map((l) => l.description.length).sort((a, b) => a - b);
          const mentions = listings.filter((l) => /meubl/i.test(`${l.title} ${l.description}`)).length;
          console.log(
            `  textes : description médiane ${lengths[Math.floor(lengths.length / 2)] ?? 0} caractères, « meubl… » dans ${mentions} annonce(s)`,
          );
        }
        if (listings.length === 0) {
          failures.push(`${actor.actorId} : ${items.length} résultat(s), aucun exploitable`);
          continue;
        }
        const skipped = items.length - listings.length;
        const after = await apifyUsage();
        if (before && after) {
          console.log(
            `  crédit Apify : ${(after.used - before.used).toFixed(2)} $ pour ce portail, ${after.used.toFixed(2)} $ consommés sur ${after.limit.toFixed(2)} $ ce mois`,
          );
        }
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
