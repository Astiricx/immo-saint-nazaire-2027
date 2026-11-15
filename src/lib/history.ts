import { evaluate } from './evaluate';
import { dedupe } from './normalize';
import type { Listing } from './types';

/**
 * Historique glissant : une annonce retenue reste publiée tant qu'elle a été revue sur sa source
 * dans les RETENTION_DAYS derniers jours. Une collecte ne fait donc jamais disparaître les
 * annonces des précédentes ; elle ajoute les nouvelles et met à jour les autres.
 */
export const RETENTION_DAYS = 30;

/** Paramètres de suivi retirés avant de comparer deux liens. */
const TRACKING = /^(utm_|xtor|xts|at_|fbclid|gclid|mc_|ref$|from$|origin$)/i;

/** Lien canonique : hôte en minuscules, sans ancre, sans paramètres de suivi ni barre finale. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host.toLowerCase().replace(/^www\./, '')}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export interface HistoryEntry {
  listing: Listing;
  /** Date (AAAA-MM-JJ) de la collecte qui a produit ce fichier, à défaut de lastSeen. */
  collectedOn: string;
}

export interface MergeResult {
  listings: Listing[];
  /** Annonces retenues revues aujourd'hui. */
  fresh: number;
  /** Annonces des collectes précédentes conservées sans avoir été revues aujourd'hui. */
  carried: number;
  /** Annonces de l'historique abandonnées : trop anciennes ou désormais hors critères. */
  expired: number;
  /** Doublons fusionnés (même lien, ou même bien sur deux sources). */
  duplicates: number;
}

/**
 * Fusionne les annonces retenues aujourd'hui avec l'historique.
 * - Même lien (ou même identifiant) : une seule annonce, avec la date de première apparition la plus ancienne.
 * - Annonce de l'historique non revue aujourd'hui : conservée si elle a été vue il y a moins de
 *   retentionDays jours et respecte toujours les critères (ceux-ci ont pu changer), marquée « plus revue ».
 */
export function mergeWithHistory(
  fresh: Listing[],
  history: HistoryEntry[],
  today: string,
  retentionDays = RETENTION_DAYS,
): MergeResult {
  // Mémoire de l'historique par identifiant et par lien : première et dernière apparition.
  const known = new Map<string, { listing: Listing; firstSeen: string; lastSeen: string }>();
  const keysOf = (l: Listing) => [`id|${l.id}`, `url|${canonicalUrl(l.url)}`];
  for (const { listing, collectedOn } of history) {
    const lastSeen = listing.lastSeen ?? collectedOn;
    const existing = keysOf(listing).map((k) => known.get(k)).find(Boolean);
    const record = existing ?? { listing, firstSeen: listing.firstSeen, lastSeen };
    if (listing.firstSeen < record.firstSeen) record.firstSeen = listing.firstSeen;
    if (lastSeen >= record.lastSeen) {
      record.lastSeen = lastSeen;
      record.listing = listing;
    }
    for (const key of keysOf(listing)) known.set(key, record);
  }

  const freshKeys = new Set<string>();
  const merged: Listing[] = fresh.map((listing) => {
    keysOf(listing).forEach((k) => freshKeys.add(k));
    const past = keysOf(listing).map((k) => known.get(k)).find(Boolean);
    const firstSeen = past && past.firstSeen < listing.firstSeen ? past.firstSeen : listing.firstSeen;
    return { ...listing, firstSeen, lastSeen: today, stillListed: true };
  });

  let expired = 0;
  for (const record of new Set(known.values())) {
    if (keysOf(record.listing).some((k) => freshKeys.has(k))) continue;
    const listing: Listing = {
      ...record.listing,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      stillListed: false,
    };
    if (daysBetween(record.lastSeen, today) > retentionDays || !evaluate(listing).accepted) {
      expired += 1;
      continue;
    }
    merged.push(listing);
  }

  // Même bien publié sur deux sources : les annonces revues aujourd'hui passent en premier.
  const { unique, removed } = dedupe(merged);
  const kept = new Set(unique);
  return {
    listings: unique,
    fresh: merged.filter((l) => l.stillListed && kept.has(l)).length,
    carried: merged.filter((l) => !l.stillListed && kept.has(l)).length,
    expired,
    duplicates: removed,
  };
}
