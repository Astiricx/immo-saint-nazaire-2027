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
  /**
   * Allure d'un trajet quotidien sur piste cyclable continue et plate (front de mer, centre) :
   * 16 km/h, feux compris dans les minutes fixes.
   */
  speedKmh: 16,
  /** Feux, antivol, traversée du site. */
  fixedMinutes: 2,
};

/**
 * Quartiers de Saint-Nazaire, du plus spécifique au plus générique :
 * la détection s'arrête au premier mot-clé trouvé, « centre-ville » passe donc en dernier.
 * Les centres sont approximatifs : ils servent quand l'annonce ne donne que le quartier.
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
    zone: 'coeur',
    lat: 47.2795,
    lng: -2.2255,
    keywords: ['parc paysager', 'leo lagrange'],
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
    keywords: ['mean penhoet', 'penhoet', 'penhouet', 'mean'],
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
  // Le front de mer se prolonge vers l'ouest par la piste cyclable du littoral :
  // Villès-Martin, Kerlédé, puis le Rocher du Lion et Belle Fontaine.
  {
    id: 'villes-martin',
    name: 'Villès-Martin',
    zone: 'coeur',
    lat: 47.2605,
    lng: -2.229,
    keywords: ['villes martin', 'ville martin'],
  },
  {
    id: 'kerlede',
    name: 'Kerlédé',
    zone: 'coeur',
    lat: 47.2572,
    lng: -2.238,
    keywords: ['kerlede', 'ker villes'],
  },
  {
    id: 'rocher-du-lion',
    name: 'Rocher du Lion',
    zone: 'coeur',
    lat: 47.2562,
    lng: -2.2426,
    keywords: ['rocher du lion', 'belle fontaine', 'kerloupiots', 'avocettes'],
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
];

const DISTRICT_BY_ID: Record<string, District> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
);

export function getDistrict(id: string | null | undefined): District | undefined {
  return id ? DISTRICT_BY_ID[id] : undefined;
}

/** Quartier le plus proche d'un point, s'il est à moins de 1,2 km de son centre. */
export function nearestDistrict(lat: number, lng: number): District | undefined {
  let best: District | undefined;
  let bestKm = Infinity;
  for (const district of DISTRICTS) {
    const km = haversineKm({ lat, lng }, district);
    if (km < bestKm) {
      best = district;
      bestKm = km;
    }
  }
  return bestKm <= 1.2 ? best : undefined;
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

export const TARGET_POSTCODE = '44600';

/** Saint-Nazaire (44600). Saint-Marc-sur-Mer fait partie de la commune. */
export function isTargetCity(city: string, postcode: string | null = null): boolean {
  if (postcode) return postcode === TARGET_POSTCODE;
  const c = normalizeText(city);
  return c === 'saint nazaire' || c === 'st nazaire' || c === 'saint marc sur mer';
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
