import { extractFromHtml, extractFromText, toRawListing } from '../lib/extract';
import { extractLinks, segmentByLinks } from '../lib/html';
import { BlockedError, fetchPage, robotsAllows } from '../lib/http';
import { canLogContent } from '../lib/privacy';
import type { RawListing } from '../../src/lib/types';
import type { ListingSource } from './types';

export interface AgencySite {
  id: string;
  label: string;
  /** Pages de résultats « location appartement Saint-Nazaire » du site. */
  searchUrls: string[];
  /** Forme des liens vers une fiche d'annonce. */
  detailPattern: RegExp;
  /** Nombre maximal de fiches lues par passage. */
  maxDetails?: number;
}

/**
 * Sites d'agences qui publient leurs annonces de location à Saint-Nazaire sur des pages publiques.
 * Le collecteur lit d'abord la page de résultats, puis chaque fiche, en respectant robots.txt.
 * Leboncoin et SeLoger n'y figurent pas : ils interdisent l'extraction automatique et la bloquent.
 */
export const AGENCY_SITES: AgencySite[] = [
  {
    id: 'squarehabitat',
    label: 'Square Habitat',
    searchUrls: [
      'https://www.squarehabitat.fr/annonces/location/bien/appartement/immobilier/pays-de-la-loire/loire-atlantique/saint-nazaire-44600',
      'https://www.squarehabitat.fr/louer-appartement-saint_nazaire-44600.aspx',
    ],
    detailPattern: /\/annonces\/biens\/location\/appartement\/(saint|st)[-_]?nazaire\/[0-9a-f-]{20,}/i,
  },
  {
    id: 'foncia',
    label: 'Foncia',
    searchUrls: ['https://fr.foncia.com/location/saint-nazaire-44600/appartement'],
    detailPattern: /\/location\/saint-nazaire-44600\/appartement\/[^/?#]*\d{4,}/i,
  },
  {
    id: 'fnaim',
    label: 'FNAIM',
    searchUrls: [
      'https://www.fnaim.fr/liste-annonces-immobilieres/18-location-appartement-st-nazaire-44600.htm',
    ],
    detailPattern: /\/annonce-immobiliere\/\d+\//i,
  },
  {
    id: 'ouestfrance-immo',
    label: 'Ouest-France Immo',
    searchUrls: ['https://www.ouestfrance-immo.com/louer/appartement/saint-nazaire-44-44184/'],
    detailPattern: /\/immobilier\/location\/[^?#]*\d{6,}|\/annonce[^?#]*\d{6,}/i,
  },
  {
    id: 'laforet',
    label: 'Laforêt',
    searchUrls: ['https://www.laforet.com/ville/location-appartement-saint-nazaire-44600'],
    detailPattern: /\/agence-immobiliere\/[^/]+\/louer\/[^/]*(saint-nazaire|st-nazaire)[^/]*\/[^/?#]+/i,
  },
];

const refFromUrl = (url: string) => {
  const { pathname } = new URL(url);
  return pathname.split('/').filter(Boolean).pop()?.replace(/\.(html?|aspx|php)$/, '') ?? pathname;
};

export function agencySource(site: AgencySite): ListingSource {
  return {
    id: site.id,
    label: site.label,
    disabledReason: () => null,
    async fetch(debug) {
      const showContent = canLogContent(debug);
      const detailUrls = new Set<string>();
      /** Texte de la carte d'annonce sur la page de résultats, par lien de fiche. */
      const cards = new Map<string, string>();
      const notes: string[] = [];
      let lastError: unknown = null;

      for (const searchUrl of site.searchUrls) {
        try {
          const html = await fetchPage(searchUrl);
          const links = extractLinks(html, searchUrl);
          const matching = links.filter((link) => site.detailPattern.test(new URL(link).pathname));
          matching.forEach((link) => detailUrls.add(link));
          for (const segment of segmentByLinks(html, searchUrl)) {
            if (!detailUrls.has(segment.href)) continue;
            cards.set(segment.href, `${cards.get(segment.href) ?? ''}\n${segment.text}`.trim());
          }
          if (debug) {
            console.log(`  [${site.id}] ${searchUrl} : ${links.length} liens, ${matching.length} fiches`);
            if (matching.length === 0) {
              const sameHost = links.filter((l) => new URL(l).host === new URL(searchUrl).host);
              console.log(`  [${site.id}] exemples de liens :`);
              sameHost.slice(0, 40).forEach((l) => console.log(`    ${l}`));
            }
          }
        } catch (error) {
          lastError = error;
          notes.push(`${new URL(searchUrl).pathname} : ${(error as Error).message}`);
        }
      }

      if (detailUrls.size === 0 && lastError) throw lastError;

      const listings: RawListing[] = [];
      const max = site.maxDetails ?? 40;
      let unreadable = 0;
      let notAllowed = 0;
      let fromCards = 0;
      let debugExcerpts = 0;
      const meta = (url: string) => ({ source: site.id, sourceLabel: site.label, ref: refFromUrl(url), url });

      /** Annonce lue sur la carte de la page de résultats, quand la fiche n'est pas utilisable. */
      const fromCard = (url: string): RawListing | null => {
        const card = cards.get(url);
        if (!card) return null;
        const extracted = extractFromText(card);
        if (showContent) {
          console.log(
            `  [${site.id}] carte ${url}\n      → ${extracted.title.slice(0, 70)} | ${extracted.rent ?? '?'} € ${extracted.chargesMode ?? ''} | ${extracted.surface ?? '?'} m² | ${extracted.locationText}`,
          );
          if (debugExcerpts < 3) {
            debugExcerpts += 1;
            console.log(`      texte : ${JSON.stringify(card.slice(0, 600))}`);
          }
        }
        return toRawListing(extracted, meta(url));
      };

      for (const url of [...detailUrls].slice(0, max)) {
        // Une autre ville du même nom (Saint-Nazaire, 66) ou une ville voisine : inutile d'ouvrir la fiche.
        if (/\b(66\d{3}|saint-brevin|pornichet|la-baule|trignac|montoir)\b/i.test(url)) continue;
        let raw: RawListing | null = null;
        if (!(await robotsAllows(url))) {
          notAllowed += 1;
        } else {
          try {
            const html = await fetchPage(url);
            const extracted = extractFromHtml(html);
            raw = toRawListing(extracted, meta(url));
            if (showContent) {
              console.log(
                `  [${site.id}] ${url}\n      → ${extracted.title.slice(0, 70)} | ${extracted.rent ?? '?'} € ${extracted.chargesMode ?? ''} | ${extracted.surface ?? '?'} m² | ${extracted.locationText} | ${extracted.address ?? ''}`,
              );
              if (debugExcerpts < 3) {
                debugExcerpts += 1;
                console.log(`      texte : ${JSON.stringify(extracted.excerpt ?? '')}`);
              }
            }
          } catch (error) {
            if (error instanceof BlockedError) throw error;
            if (showContent) console.log(`  [${site.id}] ${url} : ${(error as Error).message}`);
          }
        }
        if (!raw) {
          raw = fromCard(url);
          if (raw) fromCards += 1;
        }
        if (raw) listings.push(raw);
        else unreadable += 1;
      }

      if (detailUrls.size > max) notes.push(`${detailUrls.size - max} fiches au-delà de la limite`);
      if (notAllowed > 0) notes.push(`${notAllowed} fiche(s) fermée(s) aux robots par le site`);
      if (fromCards > 0) notes.push(`${fromCards} annonce(s) lue(s) sur la page de résultats`);
      if (unreadable > 0) notes.push(`${unreadable} annonce(s) sans loyer ou surface lisible`);
      if (detailUrls.size === 0) notes.push('aucune fiche trouvée sur la page de résultats');
      return { listings, message: notes.length ? notes.join(' ; ') : undefined };
    },
  };
}
