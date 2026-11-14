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
  /** Début du texte utile de la page, pour le mode --debug. */
  excerpt?: string;
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
/** Montants qui ne sont pas un loyer : frais, dépôt de garantie, honoraires, parking, énergie. */
const NOT_RENT =
  /frais|honoraires|d[ée]p[ôo]t|garantie|caution|parking|garage|[ée]tat des lieux|[ée]nergie|entre\s*$/i;

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
    if (NOT_RENT.test(sameLineBefore) || /^\S*\s*(?:\n\s*)?(?:et\s+\d|par an|\/\s*an)/i.test(text.slice(index + m[0].length, index + m[0].length + 20))) {
      continue;
    }
    const candidate = { rent: Math.round(value), window: `${before}${after}` };
    if (PRICE_CONTEXT.test(before) || PRICE_CONTEXT.test(after)) return candidate;
    fallback ??= candidate;
  }
  return fallback;
}

/** Loyer lu dans les champs étiquetés, s'ils existent. */
function labeledRent(text: string): Pick<Extracted, 'rent' | 'chargesMode' | 'charges'> | null {
  const valid = (n: number | null) => (n != null && n >= 150 && n <= 3000 ? Math.round(n) : null);
  const cc = valid(labeledAmount(text, LABEL_RENT_CC));
  if (cc) return { rent: cc, chargesMode: 'cc', charges: null };
  const hc = valid(labeledAmount(text, LABEL_RENT_HC));
  const charges = labeledAmount(text, LABEL_CHARGES);
  if (hc) {
    return { rent: hc, chargesMode: 'hc', charges: charges != null && charges < 400 ? Math.round(charges) : null };
  }
  const plain = valid(labeledAmount(text, LABEL_RENT));
  if (plain) return { rent: plain, ...chargesFrom(labeledValue(text, LABEL_RENT) ?? '') };
  return null;
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

const STREET_TYPES = ['rue', 'avenue', 'boulevard', 'bd', 'place', 'allée', 'allee', 'quai', 'impasse', 'chemin', 'route']
  .flatMap((w) => [w, w[0].toUpperCase() + w.slice(1), w.toUpperCase()])
  .join('|');
// Espaces horizontaux seulement : une adresse ne déborde pas sur la ligne suivante.
const PARTICLES = '(?:(?:de|du|des|la|le|les|DE|DU|DES|LA|LE|LES)[ \\t]+|[lLdD][\'’])*';
const STREET_RE = new RegExp(
  `(?:\\b\\d{1,4}[ \\t]*(?:bis|ter)?[ \\t]*,?[ \\t]*)?\\b(?:${STREET_TYPES})\\b(?:[ \\t]+${PARTICLES}[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){1,4}`,
);

export function findStreet(text: string): string | null {
  const m = text.match(STREET_RE);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export function findLocation(text: string): string {
  // Saint-Marc-sur-Mer est un quartier de Saint-Nazaire (44600).
  const marc = text.match(/(saint|st)[\s-]*marc[\s-]*sur[\s-]*mer\s*\(?\s*(\d{5})?/i);
  if (marc) return `Saint-Nazaire (${marc[2] ?? '44600'}), Saint-Marc-sur-Mer`;
  const m = text.match(/(saint|st)[\s-]*nazaire\s*\(?\s*(\d{5})?\s*\)?/i);
  if (m) return `Saint-Nazaire${m[2] ? ` (${m[2]})` : ''}`;
  if (/\b44600\b/.test(text)) return 'Saint-Nazaire (44600)';
  const other = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ -]{2,40})\s*\((\d{5})\)/);
  return other ? `${other[1].trim()} (${other[2]})` : '';
}

export function findAvailability(text: string): string | null {
  const m = text.match(
    /(disponible|libre|dispo\.?)\s+(?:le|à partir du|a partir du|dès le|des le|au|en|début|debut|fin|mi-)?\s*[^\n.;]{0,30}/i,
  );
  return m ? m[0].trim() : null;
}

/**
 * Valeur d'un champ étiqueté, sur la même ligne (« Loyer : 600 € ») ou la suivante
 * (« Loyer hors charges » puis « 600 »). C'est la présentation imposée par la loi ALUR
 * aux annonces d'agence : loyer, charges, dépôt de garantie, honoraires sur des lignes séparées.
 */
export function labeledValue(text: string, label: RegExp): string | null {
  const lines = text.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(label);
    if (!m || m.index !== 0) continue;
    const rest = lines[i].slice(m[0].length).replace(/^[\s:：-]+/, '');
    if (/\d/.test(rest)) return rest;
    const next = lines[i + 1] ?? '';
    if (/\d/.test(next)) return next;
  }
  return null;
}

function labeledAmount(text: string, label: RegExp): number | null {
  const value = labeledValue(text, label);
  const number = value?.match(/\d{1,3}(?:[ \u00a0\u202f.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/)?.[0];
  if (!number) return null;
  const [amount] = parseAmounts(`${number} €`);
  return amount ?? null;
}

const LABEL_RENT_CC = /loyer(?: mensuel)?(?:,)? (?:charges comprises|charges incluses|cc|tcc|tout compris)/i;
const LABEL_RENT_HC = /loyer(?: mensuel)?(?:,)? (?:hors charges|hc)|loyer de base|loyer nu/i;
const LABEL_CHARGES = /montant des charges|provisions? (?:pour|sur) charges|charges(?: locatives| mensuelles| forfaitaires)?(?=\s*[:\n]|\s*$)/i;
const LABEL_RENT = /loyer(?: mensuel)?(?=\s*[:\n]|\s*$)/i;
const LABEL_AVAILABILITY = /(?:date de )?disponibilit[ée]/i;

/** Extraction depuis un bloc de texte (annonce dans un e-mail d'alerte, par exemple). */
export function extractFromText(text: string, title = ''): Extracted {
  const fields = labeledRent(text);
  const price = fields ? null : findRent(`${title}\n${text}`);
  const charges = fields
    ? { chargesMode: fields.chargesMode, charges: fields.charges }
    : price
      ? chargesFrom(price.window)
      : { chargesMode: null, charges: null };
  const availability = labeledValue(text, LABEL_AVAILABILITY);
  return {
    title: title || text.split('\n').find((line) => line.trim().length > 8)?.trim() || '',
    description: text.slice(0, 1200),
    rent: fields?.rent ?? price?.rent ?? null,
    ...charges,
    surface: findSurface(title) ?? findSurface(text),
    locationText: findLocation(`${title}\n${text}`),
    address: findStreet(text),
    availabilityText: availability ? `Disponible le ${availability}` : findAvailability(text),
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

  const textHasFields = labeledRent(main) !== null;
  const rent =
    !textHasFields && ld.rent && ld.rent >= 150 && ld.rent <= 3000 ? Math.round(ld.rent) : fromText.rent;
  const charges =
    rent === fromText.rent
      ? { chargesMode: fromText.chargesMode, charges: fromText.charges }
      : chargesFrom(main.slice(0, 1500));

  return {
    excerpt: main.slice(0, 1800),
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
