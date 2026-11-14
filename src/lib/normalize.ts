import { NEARBY_CITIES, detectDistrict, getDistrict, isTargetCity, normalizeText } from './geo';
import type { Listing, PropertyType, RawListing } from './types';

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * « 520 € CC » → 520 charges comprises ; « 540 € + 45 € de charges » → 540 + 45 ;
 * « 430 € HC » ou un prix sans mention → hors charges, montant des charges inconnu.
 */
export function parsePrice(
  text: string,
): { rent: number; chargesIncluded: boolean; charges: number | null } | null {
  const t = normalizeText(text);
  const amounts = [...t.matchAll(/(\d[\d\s.  ]*)(?:,\d+)?\s*(?:€|eur)/g)].map((m) =>
    Number(m[1].replace(/[\s.  ]/g, '')),
  );
  const rent = amounts[0];
  if (!rent || Number.isNaN(rent)) return null;

  if (/\+\s*\d/.test(t) && amounts[1] != null && /charges/.test(t)) {
    return { rent, chargesIncluded: false, charges: amounts[1] };
  }
  if (/\bcc\b|charges (comprises|incluses)|tout compris|toutes charges/.test(t)) {
    return { rent, chargesIncluded: true, charges: null };
  }
  return { rent, chargesIncluded: false, charges: null };
}

export function parseSurface(text: string): number | null {
  const match = text.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*m\s?(?:²|2)/i);
  return match ? Number(match[1]) : null;
}

/** Colocation, chambre chez l'habitant, logement « à partager ». */
export function detectShared(text: string): boolean {
  const t = normalizeText(text)
    // « Pas de colocation », « colocation refusée » : l'annonce exclut la colocation, elle n'en est pas une.
    .replace(/\b(pas de|non|sans|hors) coloc\w*/g, ' ')
    .replace(/\bcoloc\w* (non acceptee?s?|refusee?s?|interdite?s?|exclue?s?|impossible)/g, ' ');
  return /\bcoloc|\ba partager\b|chez l habitant|chambre a louer (chez|dans)/.test(t);
}

export function detectType(title: string, description = ''): PropertyType {
  const t = normalizeText(title);
  const fromText = (s: string): PropertyType | null => {
    if (/\bchambre\b/.test(s) && detectShared(s)) return 'chambre';
    if (/\bmaison\b/.test(s)) return 'maison';
    if (/\b[tf]\s?[3-9]\b|\b[3-9] pieces\b/.test(s)) return 'T3+';
    if (/\b[tf]\s?2\b|\b2 pieces\b|\bdeux pieces\b/.test(s)) return 'T2';
    if (/\b[tf]\s?1\b|\b1 piece\b/.test(s)) return 'T1';
    if (/\bstudio\b|\bstudette\b/.test(s)) return 'studio';
    return null;
  };
  return fromText(t) ?? fromText(normalizeText(description)) ?? 'studio';
}

/** Renvoie une date ISO, ou null pour « libre de suite » (ou quand rien n'est précisé). */
export function parseAvailability(text: string | undefined): string | null {
  if (!text) return null;
  const t = normalizeText(text);
  if (/de suite|immediat|des maintenant/.test(t)) return null;

  const numeric = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) return `${numeric[3]}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`;

  const worded = t.match(
    /(?:(\d{1,2})(?:er)?\s+|(debut|mi|fin)\s+)?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/,
  );
  if (worded) {
    const [, dayText, moment, monthName, year] = worded;
    const day = dayText ? Number(dayText) : moment === 'mi' ? 15 : moment === 'fin' ? 28 : 1;
    return `${year}-${pad(MONTHS[monthName])}-${pad(day)}`;
  }
  return null;
}

export function parseCity(locationText: string): string {
  const city = locationText.split(/[(,·|]/)[0]?.trim();
  return city || 'Saint-Nazaire';
}

const FEATURE_PATTERNS: [RegExp, string][] = [
  [/local (a )?velos?|garage a velos?/, 'Local vélo'],
  [/\bbalcon\b/, 'Balcon'],
  [/\bterrasse\b/, 'Terrasse'],
  [/\bascenseur\b/, 'Ascenseur'],
  [/\bparking\b|\bstationnement\b|\bgarage\b/, 'Stationnement'],
  [/\bcave\b/, 'Cave'],
  [/vue (sur la )?mer|vue sur (le port|l estuaire)/, 'Vue mer ou port'],
  [/\bfibre\b|internet (inclus|compris)/, 'Internet'],
];

function detectFeatures(raw: RawListing): string[] {
  // « sans ascenseur », « pas de parking » : on retire les négations avant de chercher les équipements.
  const text = normalizeText(`${raw.title} ${raw.description} ${(raw.tags ?? []).join(' ')}`).replace(
    /\b(sans|pas de|pas d|ni) \w+/g,
    ' ',
  );
  const features = new Set<string>();
  for (const [pattern, label] of FEATURE_PATTERNS) {
    if (pattern.test(text)) features.add(label);
  }
  return [...features];
}

/** Décalage déterministe (≈ ±250 m) : les portails ne donnent qu'une position approximative. */
function jitter(seed: string): { dLat: number; dLng: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 0) / 1000) % 1000) / 1000;
  return { dLat: (a - 0.5) * 0.0045, dLng: (b - 0.5) * 0.0065 };
}

/** Transforme une annonce brute en annonce normalisée ; null si le prix ou la surface est illisible. */
export function normalizeListing(raw: RawListing): Listing | null {
  const price = parsePrice(raw.priceText);
  const surface = parseSurface(raw.surfaceText) ?? parseSurface(raw.title);
  if (!price || !surface) return null;

  const fullText = `${raw.title} ${raw.description}`;
  const city = parseCity(raw.locationText);
  const inCity = isTargetCity(city);
  const district = inCity
    ? (detectDistrict(raw.locationText) ?? detectDistrict(raw.title) ?? getDistrict('autre'))
    : getDistrict('autre');

  let lat = raw.lat;
  let lng = raw.lng;
  if (lat == null || lng == null) {
    const cityPoint = inCity ? null : NEARBY_CITIES[normalizeText(city)];
    const base = cityPoint ?? district;
    const offset = jitter(`${raw.source}-${raw.ref}`);
    lat = base.lat + offset.dLat;
    lng = base.lng + offset.dLng;
  }

  const furnished =
    raw.furnished ?? (/\bmeuble/.test(normalizeText(fullText)) && !/non meuble/.test(normalizeText(fullText)));

  return {
    id: `${raw.source}-${raw.ref}`,
    source: raw.source,
    url: raw.url,
    title: raw.title.trim(),
    description: raw.description.trim(),
    type: detectType(raw.title, raw.description),
    isShared: detectShared(fullText),
    rent: price.rent,
    chargesIncluded: price.chargesIncluded,
    charges: price.charges,
    surface,
    furnished,
    city,
    districtId: district.id,
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    availableFrom: parseAvailability(raw.availabilityText),
    publishedAt: raw.publishedAt,
    features: detectFeatures(raw),
    isDemo: raw.isDemo ?? false,
  };
}

/** Une même annonce publiée sur deux portails : on garde la plus ancienne. */
export function dedupe(listings: Listing[]): { unique: Listing[]; removed: number } {
  const seen = new Map<string, Listing>();
  const sorted = [...listings].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
  for (const listing of sorted) {
    const key = [
      listing.type,
      listing.rent,
      Math.round(listing.surface),
      listing.city,
      listing.districtId,
    ].join('|');
    if (!seen.has(key)) seen.set(key, listing);
  }
  return { unique: [...seen.values()], removed: listings.length - seen.size };
}
