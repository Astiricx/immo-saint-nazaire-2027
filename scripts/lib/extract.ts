import { normalizeText } from '../../src/lib/geo';
import { parseAmounts } from '../../src/lib/normalize';
import type { RawListing } from '../../src/lib/types';
import { extractJsonLd, extractMeta, extractTitle, htmlToText } from './html';

/**
 * Extraction d'une annonce à partir d'une page ou d'un fragment de texte.
 * Ordre de confiance : données structurées (JSON-LD), balises OpenGraph, puis le texte.
 */

export interface Extracted {
  title: string;
  description: string;
  rent: number | null;
  /** 'cc' charges comprises, 'hc' hors charges, null non précisé. */
  chargesMode: 'cc' | 'hc' | null;
  charges: number | null;
  surface: number | null;
  locationText: string;
  address: string | null;
  availabilityText: string | null;
  lat: number | null;
  lng: number | null;
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const LISTING_TYPES =
  /apartment|house|residence|accommodation|product|offer|realestatelisting|singlefamilyresidence|room/i;

interface LdFields {
  title?: string;
  description?: string;
  rent?: number;
  surface?: number;
  street?: string;
  locality?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
}

function fromJsonLd(objects: Record<string, unknown>[]): LdFields {
  const out: LdFields = {};
  const visit = (obj: Record<string, unknown>, depth: number) => {
    if (depth > 3) return;
    const types = ([] as unknown[]).concat(obj['@type'] ?? []).map(String).join(' ');
    if (LISTING_TYPES.test(types)) {
      out.title ??= asText(obj.name) || undefined;
      out.description ??= asText(obj.description) || undefined;
      const offers = ([] as unknown[]).concat(obj.offers ?? []) as Record<string, unknown>[];
      for (const offer of [obj, ...offers]) {
        const spec = offer.priceSpecification as Record<string, unknown> | undefined;
        out.rent ??= asNumber(offer.price) ?? asNumber(spec?.price) ?? undefined;
      }
      const floor = obj.floorSize as Record<string, unknown> | number | string | undefined;
      out.surface ??=
        (typeof floor === 'object' && floor ? asNumber(floor.value) : asNumber(floor)) ?? undefined;
      const address = obj.address as Record<string, unknown> | string | undefined;
      if (typeof address === 'string') out.locality ??= address;
      else if (address) {
        out.street ??= asText(address.streetAddress) || undefined;
        out.locality ??= asText(address.addressLocality) || undefined;
        out.postcode ??= asText(address.postalCode) || undefined;
      }
      const geo = obj.geo as Record<string, unknown> | undefined;
      if (geo) {
        out.lat ??= asNumber(geo.latitude) ?? undefined;
        out.lng ??= asNumber(geo.longitude) ?? undefined;
      }
    }
    for (const key of ['mainEntity', 'about', 'itemOffered', 'containsPlace']) {
      const child = obj[key];
      if (child && typeof child === 'object') {
        ([] as unknown[]).concat(child).forEach((c) => visit(c as Record<string, unknown>, depth + 1));
      }
    }
  };
  objects.forEach((obj) => visit(obj, 0));
  return out;
}

const PRICE_CONTEXT = /loyer|prix|mensuel|par mois|\/\s*mois|\bmois\b|\bcc\b|\bhc\b|charges/i;
/** Montants qui ne sont pas un loyer : frais, dépôt de garantie, honoraires, parking. */
const NOT_RENT = /frais|honoraires|d[ée]p[ôo]t|garantie|caution|parking|garage|[ée]tat des lieux/i;

/**
 * Loyer dans un texte : le premier montant plausible (150 à 3 000 €)
 * entouré, sur la même ligne ou la précédente, d'un mot qui désigne un loyer.
 */
export function findRent(text: string): { rent: number; window: string } | null {
  const re = /(\d{1,3}(?:[ \u00a0\u202f.]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:€|eur(?:os?)?\b)/gi;
  let fallback: { rent: number; window: string } | null = null;
  for (const m of text.matchAll(re)) {
    const [value] = parseAmounts(m[0]);
    if (value == null || value < 150 || value > 3000) continue;
    const index = m.index ?? 0;
    const lineStart = text.lastIndexOf('\n', index - 1);
    const previousLineStart = lineStart > 0 ? text.lastIndexOf('\n', lineStart - 1) : -1;
    const before = text.slice(Math.max(previousLineStart + 1, index - 60), index);
    const sameLineBefore = text.slice(lineStart + 1, index);
    const afterEnd = text.indexOf('\n', index + m[0].length + 1);
    const after = text.slice(index, Math.min(index + m[0].length + 60, afterEnd === -1 ? text.length : afterEnd + 30));
    if (NOT_RENT.test(sameLineBefore)) continue;
    const candidate = { rent: Math.round(value), window: `${before}${after}` };
    if (PRICE_CONTEXT.test(before) || PRICE_CONTEXT.test(after)) return candidate;
    fallback ??= candidate;
  }
  return fallback;
}

export function chargesFrom(window: string): Pick<Extracted, 'chargesMode' | 'charges'> {
  const t = normalizeText(window);
  const plus = window.match(/\+\s*(\d+(?:[.,]\d{1,2})?)\s*€?\s*(?:de\s+)?(?:charges|provision)/i);
  if (plus) return { chargesMode: 'hc', charges: Math.round(Number(plus[1].replace(',', '.'))) };
  if (/\bcc\b|charges (comprises|incluses)|tout compris|toutes charges|ttc/.test(t)) {
    return { chargesMode: 'cc', charges: null };
  }
  if (/\bhc\b|hors charges/.test(t)) return { chargesMode: 'hc', charges: null };
  return { chargesMode: null, charges: null };
}

export function findSurface(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*m\s?(?:²|2\b)/i);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  return value >= 8 && value <= 400 ? value : null;
}

const STREET_TYPES = ['rue', 'avenue', 'boulevard', 'bd', 'place', 'allée', 'allee', 'quai', 'impasse', 'chemin', 'square', 'cours', 'route']
  .flatMap((w) => [w, w[0].toUpperCase() + w.slice(1), w.toUpperCase()])
  .join('|');
const PARTICLES = '(?:(?:de|du|des|la|le|les|DE|DU|DES|LA|LE|LES)\\s+|[lLdD][\'’])*';
const STREET_RE = new RegExp(
  `(?:\\b\\d{1,4}\\s*(?:bis|ter)?\\s*,?\\s*)?\\b(?:${STREET_TYPES})\\b(?:\\s+${PARTICLES}[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){1,4}`,
);

export function findStreet(text: string): string | null {
  const m = text.match(STREET_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export function findLocation(text: string): string {
  const m = text.match(/(saint|st)[\s-]*nazaire\s*\(?\s*(\d{5})?\s*\)?/i);
  if (m) return `Saint-Nazaire${m[2] ? ` (${m[2]})` : ''}`;
  const other = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{2,40})\s*\((\d{5})\)/);
  return other ? `${other[1].trim()} (${other[2]})` : '';
}

export function findAvailability(text: string): string | null {
  const m = text.match(
    /(disponible|libre|dispo\.?)\s+(?:le|à partir du|a partir du|dès le|des le|au|en|début|debut|fin|mi-)?\s*[^\n.;]{0,30}/i,
  );
  return m ? m[0].trim() : null;
}

/** Extraction depuis un bloc de texte (annonce dans un e-mail d'alerte, par exemple). */
export function extractFromText(text: string, title = ''): Extracted {
  const price = findRent(text);
  const charges = price ? chargesFrom(price.window) : { chargesMode: null, charges: null };
  return {
    title: title || text.split('\n').find((line) => line.trim().length > 8)?.trim() || '',
    description: text.slice(0, 1200),
    rent: price?.rent ?? null,
    ...charges,
    surface: findSurface(title) ?? findSurface(text),
    locationText: findLocation(`${title}\n${text}`),
    address: findStreet(text),
    availabilityText: findAvailability(text),
    lat: null,
    lng: null,
  };
}

/** Extraction depuis la page complète d'une annonce. */
export function extractFromHtml(html: string): Extracted {
  const ld = fromJsonLd(extractJsonLd(html));
  const meta = extractMeta(html);
  const title = ld.title || meta['og:title'] || extractTitle(html);

  // Le texte utile commence au titre principal : on évite les menus et les « biens similaires » de fin de page.
  const fullText = htmlToText(html);
  const heading = extractTitle(html);
  const start = heading ? Math.max(0, fullText.indexOf(heading)) : 0;
  const main = fullText.slice(start, start + 5000);

  const fromText = extractFromText(main, title);
  const description =
    ld.description || meta['og:description'] || meta.description || fromText.description;

  const locationText =
    ld.locality || ld.postcode
      ? `${ld.locality ?? ''}${ld.postcode ? ` (${ld.postcode})` : ''}`.trim()
      : fromText.locationText;

  const rent = ld.rent && ld.rent >= 150 && ld.rent <= 3000 ? Math.round(ld.rent) : fromText.rent;
  const charges =
    rent === fromText.rent
      ? { chargesMode: fromText.chargesMode, charges: fromText.charges }
      : chargesFrom(main.slice(0, 1500));

  return {
    title,
    description,
    rent,
    ...charges,
    surface: ld.surface ?? fromText.surface,
    locationText,
    address: ld.street || fromText.address,
    availabilityText: fromText.availabilityText,
    lat: ld.lat ?? null,
    lng: ld.lng ?? null,
  };
}

/** Met une extraction au format RawListing ; null s'il manque le loyer ou la surface. */
export function toRawListing(
  extracted: Extracted,
  meta: { source: string; sourceLabel: string; ref: string; url: string },
): RawListing | null {
  if (!extracted.rent || !extracted.surface) return null;
  const priceText =
    extracted.chargesMode === 'cc'
      ? `${extracted.rent} € CC`
      : extracted.charges != null
        ? `${extracted.rent} € + ${extracted.charges} € de charges`
        : `${extracted.rent} €${extracted.chargesMode === 'hc' ? ' HC' : ''}`;
  return {
    ...meta,
    title: extracted.title,
    description: extracted.description,
    priceText,
    surfaceText: `${extracted.surface} m²`,
    locationText: extracted.locationText,
    availabilityText: extracted.availabilityText ?? undefined,
    address: extracted.address ?? undefined,
    lat: extracted.lat ?? undefined,
    lng: extracted.lng ?? undefined,
  };
}
