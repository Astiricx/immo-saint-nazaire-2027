import type { RawListing } from '../../src/lib/types';

export interface SourceResult {
  listings: RawListing[];
  /** Note affichée dans le rapport et sur le site (pages ignorées, raison d'un échec partiel). */
  message?: string;
}

/**
 * Une source d'annonces. Pour en ajouter une, écrivez un objet de cette forme
 * et ajoutez-le à la liste dans scripts/collect.ts : normalisation, géocodage,
 * dédoublonnage et filtrage s'appliquent ensuite automatiquement.
 */
export interface ListingSource {
  id: string;
  label: string;
  /** Raison pour laquelle la source est inactive (secret manquant…), ou null si elle est active. */
  disabledReason(): string | null;
  fetch(debug: boolean): Promise<SourceResult>;
}
