import { detectDistrict, nearestDistrict, normalizeText } from './geo';
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
 * Montants en euros, dans tous les formats rencontrés :
 * « 520 € », « 1 050 € », « 1.050 € », « 528.84 € », « 528,84 € », « 600 euros ».
 */
const AMOUNT_RE =
  /(\d{1,3}(?:[   .]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:€|eur(?:os?)?\b)/gi;

export function parseAmounts(text: string): number[] {
  return [...text.matchAll(AMOUNT_RE)].map((m) => {
    const whole = Number(m[1].replace(/[   .]/g, ''));
    return m[2] ? whole + Number(`0.${m[2]}`) : whole;
  });
}

/**
 * « 520 € CC » → 520 charges comprises ; « 540 € + 45 € de charges » → 540 + 45 ;
 * « 430 € HC » ou un prix sans mention → hors charges, montant des charges inconnu.
 */
export function parsePrice(
  text: string,
): { rent: number; chargesIncluded: boolean; charges: number | null } | null {
  const amounts = parseAmounts(text);
  const rent = amounts[0];
  if (!rent || Number.isNaN(rent)) return null;
  const t = normalizeText(text);

  if (/\+\s*\d/.test(text) && amounts[1] != null && /charges|provision/.test(t)) {
    return { rent: Math.round(rent), chargesIncluded: false, charges: Math.round(amounts[1]) };
  }
  if (/\bcc\b|charges (comprises|incluses)|tout compris|toutes charges/.test(t)) {
    return { rent: Math.round(rent), chargesIncluded: true, charges: null };
  }
  return { rent: Math.round(rent), chargesIncluded: false, charges: null };
}

export function parseSurface(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*m\s?(?:²|2\b)/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return value >= 8 && value <= 400 ? Math.round(value * 10) / 10 : null;
}

/** Colocation, chambre chez l'habitant, logement « à partager ». */
export function detectShared(text: string): boolean {
  const t = normalizeText(text)
    // « Pas de colocation », « colocation refusée » : l'annonce exclut la colocation, elle n'en est pas une.
    .replace(/\b(pas de|non|sans|hors) coloc\w*/g, ' ')
    .replace(/\bcoloc\w* (non acceptee?s?|refusee?s?|interdite?s?|exclue?s?|impossible)/g, ' ');
  return /\bcoloc|\ba partager\b|chez l habitant|chambre a louer (chez|dans)/.test(t);
}

/**
 * Type du bien d'après le titre, puis la description.
 * Un appartement sans nombre de pièces est classé d'après sa surface.
 */
export function detectType(title: string, description = '', surface: number | null = null): PropertyType {
  const fromText = (raw: string): PropertyType | null => {
    const s = normalizeText(raw);
    if (/\bchambre\b/.test(s) && detectShared(s)) return 'chambre';
    if (/\b(parking|garage|box|stationnement|local commercial|bureaux?|entrepot|terrain|cave)\b/.test(s) &&
      !/\b(appartement|studio|logement|maison|pieces?)\b/.test(s)) {
      return 'autre';
    }
    if (/\bmaison\b/.test(s)) return 'maison';
    if (/\b[tf]\s?[3-9]\b|\b[3-9] pieces\b|\btrois pieces\b/.test(s)) return 'T3+';
    if (/\b[tf]\s?2\b|\b2 pieces\b|\bdeux pieces\b/.test(s)) return 'T2';
    if (/\b[tf]\s?1\b|\b1 piece\b|\bune piece\b/.test(s)) return 'T1';
    if (/\bstudio\b|\bstudette\b/.test(s)) return 'studio';
    return null;
  };
  const found = fromText(title) ?? fromText(description);
  if (found) return found;
  if (/\b(appartement|logement)\b/.test(normalizeText(`${title} ${description}`)) && surface) {
    if (surface < 28) return 'studio';
    if (surface <= 55) return 'T2';
    return 'T3+';
  }
  return 'autre';
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

export function parsePostcode(text: string): string | null {
  return text.match(/\b(\d{5})\b/)?.[1] ?? null;
}

export function parseCity(locationText: string): string {
  if (/nazaire/i.test(locationText)) return 'Saint-Nazaire';
  const city = locationText.split(/[(,·|]/)[0]?.replace(/\d{5}/, '').trim();
  return city || '';
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
  const text = normalizeText(`${raw.title} ${raw.description}`).replace(
    /\b(sans|pas de|pas d|ni) \w+/g,
    ' ',
  );
  const features = new Set<string>();
  for (const [pattern, label] of FEATURE_PATTERNS) {
    if (pattern.test(text)) features.add(label);
  }
  return [...features];
}

function slug(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * Transforme une annonce brute en annonce normalisée ; null si le prix ou la surface est illisible.
 * La position est celle fournie par la source, sinon le centre du quartier reconnu, sinon inconnue.
 */
export function normalizeListing(raw: RawListing, today: string): Listing | null {
  const price = parsePrice(raw.priceText);
  const surface =
    parseSurface(raw.surfaceText) ?? parseSurface(raw.title) ?? parseSurface(raw.description);
  if (!price || !surface || price.rent < 100) return null;

  const fullText = `${raw.title} ${raw.description}`;
  const postcode = parsePostcode(raw.locationText);
  const city = parseCity(raw.locationText) || parseCity(raw.title);

  let lat: number | null = null;
  let lng: number | null = null;
  let districtId: string | null = null;
  let precision: Listing['locationPrecision'] = 'inconnue';

  if (raw.lat != null && raw.lng != null) {
    lat = raw.lat;
    lng = raw.lng;
    districtId = nearestDistrict(lat, lng)?.id ?? null;
    precision = 'adresse';
  } else {
    const district =
      detectDistrict(`${raw.locationText} ${raw.address ?? ''} ${raw.title}`) ??
      detectDistrict(raw.description);
    if (district) {
      districtId = district.id;
      lat = district.lat;
      lng = district.lng;
      precision = 'quartier';
    }
  }

  const normalized = normalizeText(fullText);
  const furnished =
    raw.furnished ?? (/\bmeuble/.test(normalized) && !/non meuble/.test(normalized));

  return {
    id: `${raw.source}-${slug(raw.ref) || slug(raw.url)}`,
    source: raw.source,
    sourceLabel: raw.sourceLabel,
    url: raw.url,
    title: raw.title.trim(),
    description: raw.description.trim().slice(0, 1500),
    type: detectType(raw.title, raw.description, surface),
    isShared: detectShared(fullText),
    rent: price.rent,
    chargesIncluded: price.chargesIncluded,
    charges: price.charges,
    surface,
    furnished,
    city,
    postcode,
    districtId,
    address: raw.address?.trim() || null,
    lat: lat == null ? null : Math.round(lat * 1e5) / 1e5,
    lng: lng == null ? null : Math.round(lng * 1e5) / 1e5,
    locationPrecision: precision,
    availableFrom: parseAvailability(raw.availabilityText),
    publishedAt: raw.publishedAt ?? null,
    firstSeen: today,
    features: detectFeatures(raw),
  };
}

/** Position précise trouvée par géocodage de l'adresse : elle remplace le centre du quartier. */
export function withCoordinates(listing: Listing, lat: number, lng: number): Listing {
  return {
    ...listing,
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    districtId: nearestDistrict(lat, lng)?.id ?? listing.districtId,
    locationPrecision: 'adresse',
  };
}

/** Une même annonce publiée sur deux sources : on garde la première vue. */
export function dedupe(listings: Listing[]): { unique: Listing[]; removed: number } {
  const seen = new Map<string, Listing>();
  for (const listing of listings) {
    const key = [listing.type, listing.rent, Math.round(listing.surface), listing.postcode ?? listing.city].join('|');
    const urlKey = `url|${listing.url}`;
    if (!seen.has(key) && !seen.has(urlKey)) {
      seen.set(key, listing);
      seen.set(urlKey, listing);
    }
  }
  const unique = [...new Set(seen.values())];
  return { unique, removed: listings.length - unique.length };
}
