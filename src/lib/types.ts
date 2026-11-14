export type PropertyType = 'studio' | 'T1' | 'T2' | 'T3+' | 'chambre' | 'maison';

export type SourceId =
  | 'leboncoin'
  | 'seloger'
  | 'bienici'
  | 'ouestfrance-immo'
  | 'location-etudiant'
  | 'agence'
  | 'flux'
  | 'manuel';

/** coeur = centre-ville et front de mer ; proche = quartiers voisins ; eloigne = le reste. */
export type Zone = 'coeur' | 'proche' | 'eloigne';

export type BudgetTier = 'ideal' | 'correct' | 'dernier-recours' | 'hors-budget';

export type RejectionCode = 'colocation' | 'type' | 'budget' | 'distance' | 'ville';

export type StatusId =
  | 'a-analyser'
  | 'contacte'
  | 'visite'
  | 'dossier'
  | 'refuse'
  | 'coup-de-coeur';

/** Annonce telle qu'elle sort d'un portail : des textes libres, pas encore de chiffres. */
export interface RawListing {
  source: SourceId;
  ref: string;
  url: string;
  title: string;
  description: string;
  /** Ex. « 520 € CC », « 540 € + 45 € de charges », « 430 € HC ». */
  priceText: string;
  /** Ex. « 38 m² ». */
  surfaceText: string;
  /** Ex. « Saint-Nazaire (44600), Centre-ville ». */
  locationText: string;
  /** Ex. « Disponible le 04/01/2027 », « Libre de suite », « début janvier 2027 ». */
  availabilityText?: string;
  publishedAt: string;
  lat?: number;
  lng?: number;
  furnished?: boolean;
  tags?: string[];
  /** true pour les annonces de démonstration (lien vers la recherche du portail). */
  isDemo?: boolean;
}

/** Annonce normalisée : c'est ce format qui est stocké dans src/data/listings.json. */
export interface Listing {
  id: string;
  source: SourceId;
  url: string;
  title: string;
  description: string;
  type: PropertyType;
  /** Colocation ou chambre chez l'habitant. */
  isShared: boolean;
  /** Loyer affiché, en euros par mois. */
  rent: number;
  chargesIncluded: boolean;
  /** Provision pour charges quand elle est annoncée à part. */
  charges: number | null;
  surface: number;
  furnished: boolean;
  city: string;
  districtId: string;
  lat: number;
  lng: number;
  /** Date ISO (AAAA-MM-JJ) ; null = libre de suite. */
  availableFrom: string | null;
  publishedAt: string;
  features: string[];
  isDemo: boolean;
}

export interface ScorePart {
  id: 'prix' | 'trajet' | 'secteur' | 'disponibilite' | 'confort';
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface Rejection {
  code: RejectionCode;
  label: string;
  detail: string;
}

/** Annonce enrichie : coût mensuel réel, trajet vélo, score et verdict de filtrage. */
export interface EvaluatedListing extends Listing {
  monthlyCost: number;
  costIsEstimated: boolean;
  estimatedCharges: number;
  bikeMinutes: number;
  bikeKm: number;
  districtName: string;
  zone: Zone;
  budgetTier: BudgetTier;
  score: number;
  scoreParts: ScorePart[];
  rejections: Rejection[];
  accepted: boolean;
}

export interface ListingsFile {
  generatedAt: string;
  sources: string[];
  duplicatesRemoved: number;
  unreadable: number;
  listings: Listing[];
}
