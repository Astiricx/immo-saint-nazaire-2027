import type { Zone } from './types';

export interface District {
  id: string;
  name: string;
  zone: Zone;
  lat: number;
  lng: number;
  /** Mots-clés déjà normalisés (minuscules, sans accent ni tiret). */
  keywords: string[];
}

/**
 * Point d'arrivée du trajet : entrée des Chantiers de l'Atlantique côté Penhoët.
 * Coordonnées approximatives, à ajuster si votre porte d'accès est différente.
 */
export const SHIPYARD = {
  name: "Chantiers de l'Atlantique",
  lat: 47.285,
  lng: -2.185,
};

/** Hypothèses du trajet vélo. */
export const BIKE = {
  /** Le trajet réel contourne les bassins du port : distance à vol d'oiseau × 1,3. */
  detourFactor: 1.3,
  speedKmh: 15,
  /** Feux, antivol, traversée du site. */
  fixedMinutes: 2,
};

/**
 * Quartiers de Saint-Nazaire, du plus spécifique au plus générique :
 * la détection s'arrête au premier mot-clé trouvé, « centre-ville » passe donc en dernier.
 */
export const DISTRICTS: District[] = [
  {
    id: 'front-de-mer',
    name: 'Front de mer',
    zone: 'coeur',
    lat: 47.2698,
    lng: -2.214,
    keywords: ['front de mer', 'bord de mer', 'boulevard wilson', 'bd wilson', 'president wilson'],
  },
  {
    id: 'ville-port',
    name: 'Ville-Port',
    zone: 'coeur',
    lat: 47.2762,
    lng: -2.2045,
    keywords: ['ville port', 'base sous marine'],
  },
  {
    id: 'petit-maroc',
    name: 'Petit Maroc',
    zone: 'coeur',
    lat: 47.2722,
    lng: -2.199,
    keywords: ['petit maroc', 'vieux mole'],
  },
  {
    id: 'halles',
    name: 'Les Halles',
    zone: 'coeur',
    lat: 47.2738,
    lng: -2.2085,
    keywords: ['halles', 'marche couvert'],
  },
  {
    id: 'gare',
    name: 'Gare',
    zone: 'coeur',
    lat: 47.285,
    lng: -2.211,
    keywords: ['gare'],
  },
  {
    id: 'jardin-des-plantes',
    name: 'Jardin des Plantes',
    zone: 'proche',
    lat: 47.2675,
    lng: -2.2225,
    keywords: ['jardin des plantes'],
  },
  {
    id: 'parc-paysager',
    name: 'Parc paysager',
    zone: 'proche',
    lat: 47.2795,
    lng: -2.2255,
    keywords: ['parc paysager'],
  },
  {
    id: 'petit-caporal',
    name: 'Petit Caporal',
    zone: 'proche',
    lat: 47.28,
    lng: -2.219,
    keywords: ['petit caporal'],
  },
  {
    id: 'mean-penhoet',
    name: 'Méan-Penhoët',
    zone: 'proche',
    lat: 47.2925,
    lng: -2.1905,
    keywords: ['mean penhoet', 'penhoet', 'mean'],
  },
  {
    id: 'prezegat',
    name: 'Prézégat',
    zone: 'proche',
    lat: 47.2915,
    lng: -2.2085,
    keywords: ['prezegat'],
  },
  {
    id: 'sautron',
    name: 'Sautron',
    zone: 'eloigne',
    lat: 47.2655,
    lng: -2.23,
    keywords: ['sautron'],
  },
  {
    id: 'kerlede',
    name: 'Kerlédé',
    zone: 'eloigne',
    lat: 47.269,
    lng: -2.244,
    keywords: ['kerlede'],
  },
  {
    id: 'villes-martin',
    name: 'Villès-Martin',
    zone: 'eloigne',
    lat: 47.2585,
    lng: -2.2395,
    keywords: ['villes martin'],
  },
  {
    id: 'immaculee',
    name: "L'Immaculée",
    zone: 'eloigne',
    lat: 47.305,
    lng: -2.276,
    keywords: ['immaculee'],
  },
  {
    id: 'saint-marc',
    name: 'Saint-Marc-sur-Mer',
    zone: 'eloigne',
    lat: 47.2385,
    lng: -2.288,
    keywords: ['saint marc', 'st marc'],
  },
  {
    id: 'centre-ville',
    name: 'Centre-ville',
    zone: 'coeur',
    lat: 47.2745,
    lng: -2.2125,
    keywords: ['centre ville', 'hypercentre', 'hyper centre', 'hotel de ville', 'mairie', 'republique'],
  },
  {
    id: 'autre',
    name: 'Autre secteur',
    zone: 'eloigne',
    lat: 47.2745,
    lng: -2.2125,
    keywords: [],
  },
];

const DISTRICT_BY_ID: Record<string, District> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
);

/** Communes voisines, pour situer une annonce qui n'est pas à Saint-Nazaire. */
export const NEARBY_CITIES: Record<string, { lat: number; lng: number }> = {
  pornichet: { lat: 47.265, lng: -2.34 },
  trignac: { lat: 47.318, lng: -2.188 },
  montoir: { lat: 47.329, lng: -2.151 },
  'la baule': { lat: 47.286, lng: -2.391 },
  'saint andre des eaux': { lat: 47.314, lng: -2.311 },
};

export function getDistrict(id: string): District {
  return DISTRICT_BY_ID[id] ?? DISTRICT_BY_ID.autre;
}

/** Minuscules, sans accent, tirets et apostrophes remplacés par des espaces. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-'’_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTargetCity(city: string): boolean {
  const c = normalizeText(city);
  return c === 'saint nazaire' || c === 'st nazaire';
}

export function detectDistrict(text: string): District | null {
  const haystack = normalizeText(text);
  for (const district of DISTRICTS) {
    for (const keyword of district.keywords) {
      if (new RegExp(`\\b${keyword}\\b`).test(haystack)) return district;
    }
  }
  return null;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Estimation du trajet à vélo jusqu'aux Chantiers. */
export function bikeTrip(lat: number, lng: number): { km: number; minutes: number } {
  const km = haversineKm({ lat, lng }, SHIPYARD) * BIKE.detourFactor;
  const minutes = Math.round((km / BIKE.speedKmh) * 60 + BIKE.fixedMinutes);
  return { km: Math.round(km * 10) / 10, minutes };
}
