export type PropertyType = 'studio' | 'T1' | 'T2' | 'T3+' | 'chambre' | 'maison' | 'autre';

/** coeur = centre-ville et front de mer ; proche = quartiers voisins ; eloigne = le reste ; inconnu = non précisé. */
export type Zone = 'coeur' | 'proche' | 'eloigne' | 'inconnu';

/** adresse = rue géocodée ou coordonnées fournies ; quartier = nom de quartier reconnu ; inconnue = rien. */
export type LocationPrecision = 'adresse' | 'quartier' | 'inconnue';

export type BudgetTier = 'ideal' | 'correct' | 'dernier-recours' | 'hors-budget';

export type RejectionCode = 'colocation' | 'type' | 'meuble' | 'budget' | 'distance' | 'ville';

export type StatusId =
  | 'a-analyser'
  | 'contacte'
  | 'visite'
  | 'dossier'
  | 'refuse'
  | 'coup-de-coeur';

/** Annonce telle qu'elle sort d'une source : des textes libres, pas encore de chiffres. */
export interface RawListing {
  source: string;
  sourceLabel: string;
  ref: string;
  /** Lien vers la page d'origine de l'annonce. */
  url: string;
  title: string;
  description: string;
  /** Ex. « 520 € CC », « 540 € + 45 € de charges », « 430 € HC ». */
  priceText: string;
  /** Ex. « 38 m² ». */
  surfaceText: string;
  /** Ex. « Saint-Nazaire (44600), Centre-ville ». */
  locationText: string;
  /** Ex. « Disponible le 04/01/2027 », « Libre de suite ». */
  availabilityText?: string;
  publishedAt?: string;
  /** Rue, si l'annonce la donne : sert au géocodage. */
  address?: string;
  lat?: number;
  lng?: number;
  /** true meublé, false vide, null ou absent : non précisé. */
  furnished?: boolean | null;
}

/** Annonce normalisée : c'est ce format qui est publié dans public/listings.json. */
export interface Listing {
  id: string;
  /** Site d'origine de l'annonce (leboncoin, squarehabitat…). */
  source: string;
  sourceLabel: string;
  /** Source de collecte qui l'a trouvée (alertes-email, squarehabitat…), si différente. */
  collector?: string;
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
  /** true meublé, false vide, null non précisé dans l'annonce. */
  furnished: boolean | null;
  city: string;
  postcode: string | null;
  districtId: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  locationPrecision: LocationPrecision;
  /** Date ISO (AAAA-MM-JJ) ; null = libre de suite ou non précisé. */
  availableFrom: string | null;
  publishedAt: string | null;
  /** Première collecte où l'annonce est apparue. */
  firstSeen: string;
  features: string[];
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
  /** null quand l'annonce ne permet pas de situer le logement. */
  bikeMinutes: number | null;
  bikeKm: number | null;
  districtName: string;
  zone: Zone;
  budgetTier: BudgetTier;
  score: number;
  scoreParts: ScorePart[];
  rejections: Rejection[];
  accepted: boolean;
}

export type SourceStatus = 'ok' | 'erreur' | 'bloquee' | 'inactive';

export interface SourceReport {
  id: string;
  label: string;
  status: SourceStatus;
  /** Annonces lues sur la source. */
  found: number;
  /** Annonces retenues après filtrage. */
  kept: number;
  message?: string;
}

export interface ListingsFile {
  /** Date et heure ISO de la dernière collecte ; null avant la première. */
  generatedAt: string | null;
  sources: SourceReport[];
  stats: {
    collected: number;
    duplicates: number;
    unreadable: number;
    rejected: Partial<Record<RejectionCode, number>>;
  };
  /** Uniquement les annonces qui respectent les critères. */
  listings: Listing[];
}
