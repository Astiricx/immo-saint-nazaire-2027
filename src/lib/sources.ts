import type { Listing, SourceId } from './types';

export interface Source {
  label: string;
  /** Recherche « location à Saint-Nazaire » sur le portail : cible des liens des annonces de démonstration. */
  searchUrl: string;
}

export const SOURCES: Record<SourceId, Source> = {
  leboncoin: {
    label: 'Leboncoin',
    searchUrl:
      'https://www.leboncoin.fr/recherche?category=10&locations=Saint-Nazaire_44600&real_estate_type=2&price=min-700',
  },
  seloger: {
    label: 'SeLoger',
    searchUrl: 'https://www.seloger.com/immobilier/locations/immo-saint-nazaire-44/bien-appartement/',
  },
  bienici: {
    label: "Bien'ici",
    searchUrl: 'https://www.bienici.com/recherche/location/saint-nazaire-44600/appartement?prix-max=700',
  },
  'ouestfrance-immo': {
    label: 'Ouest-France Immo',
    searchUrl: 'https://www.ouestfrance-immo.com/louer/appartement/saint-nazaire-44-44184/',
  },
  'location-etudiant': {
    label: 'Location-etudiant.fr',
    searchUrl: 'https://www.location-etudiant.fr/logement-etudiant/Saint-Nazaire-44184.html',
  },
  agence: {
    label: 'Agence locale',
    searchUrl: 'https://www.squarehabitat.fr/',
  },
  flux: { label: 'Flux importé', searchUrl: '' },
  manuel: { label: 'Ajout manuel', searchUrl: '' },
};

export function sourceLabel(source: SourceId): string {
  return SOURCES[source]?.label ?? source;
}

/** Une annonce de démonstration n'a pas de page propre : le lien mène à la recherche du portail. */
export function linkLabel(listing: Pick<Listing, 'isDemo' | 'source'>): string {
  return listing.isDemo ? `Recherche ${sourceLabel(listing.source)}` : "Voir l'annonce";
}
