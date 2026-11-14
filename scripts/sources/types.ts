import type { RawListing } from '../../src/lib/types';

/**
 * Une source d'annonces. Pour brancher un nouveau fournisseur, il suffit d'écrire un objet
 * de cette forme et de l'ajouter à la liste dans scripts/scrape.ts : la normalisation,
 * le dédoublonnage et le filtrage s'appliquent ensuite automatiquement.
 */
export interface ListingSource {
  id: string;
  label: string;
  fetch(): Promise<RawListing[]>;
}
