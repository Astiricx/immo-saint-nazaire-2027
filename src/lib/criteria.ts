import type { PropertyType } from './types';

/**
 * Les critères de la recherche. Tout le filtrage et le score en découlent :
 * modifier une valeur ici suffit à changer le comportement du script et du tableau de bord.
 */
export const CRITERIA = {
  city: 'Saint-Nazaire',

  /**
   * T2, T3, T4 et plus, maisons. Studios et T1 ne passent que s'ils font au moins minSurface :
   * la seule exclusion stricte de taille est « moins de 25 m² ». Chambres et colocations restent écartées.
   */
  allowedTypes: ['studio', 'T1', 'T2', 'T3+', 'maison'] as PropertyType[],

  /** Surface habitable minimale, en m², pour tous les types de bien. */
  minSurface: 25,

  /** Impératif : seules les annonces clairement identifiées comme meublées sont retenues. */
  requireFurnished: true,

  /**
   * Budget, en loyer NET : loyer charges comprises moins l'aide au logement estimée.
   * Le loyer affiché sur l'annonce peut donc dépasser ces montants si l'aide le ramène en dessous.
   */
  idealNetRent: 500,
  /** Seuil intermédiaire : au-delà, on entre dans le « dernier recours ». */
  stretchNetRent: 550,
  /** Plafond absolu : loyer charges comprises − aide estimée ≤ 600 €. */
  maxNetRent: 600,

  /**
   * Trajet à vélo maximal jusqu'aux Chantiers de l'Atlantique, en minutes. 30 min couvrent
   * le centre-ville, le Parc paysager et le front de mer jusqu'au Rocher du Lion et un peu au-delà.
   */
  maxBikeMinutes: 30,

  /**
   * Aide au logement (APL ou ALS, même barème) : profil du locataire pour l'estimation.
   * Voir src/lib/apl.ts pour le barème.
   */
  housingAid: {
    enabled: true,
    /**
     * Zone du barème. Saint-Nazaire (agglomération de plus de 100 000 habitants) relève
     * normalement de la zone 2 ; la zone 3, plus prudente, donne environ 17 € d'aide en moins.
     */
    zone: 3 as 1 | 2 | 3,
    /** Étudiant : la CAF retient un forfait de ressources, même avec 0 € de revenus. */
    student: true,
    /** Boursier : forfait plus bas (6 900 € au lieu de 8 600 €), donc aide plus élevée. */
    scholarship: false,
    /** Ressources annuelles réelles, utilisées si elles dépassent le forfait étudiant. */
    annualIncome: 0,
  },

  /** Emménagement visé : janvier 2027, ou fin 2026. */
  moveIn: {
    idealFrom: '2026-12-01',
    idealTo: '2027-01-31',
    acceptableFrom: '2026-11-15',
    acceptableTo: '2027-02-28',
  },

  /**
   * Provision appliquée quand une annonce est « hors charges » sans préciser le montant,
   * pour comparer tous les loyers charges comprises.
   */
  chargesEstimate: {
    studio: 40,
    T1: 45,
    T2: 55,
    'T3+': 70,
    chambre: 0,
    maison: 80,
    autre: 40,
  } as Record<PropertyType, number>,
};

export type Criteria = typeof CRITERIA;
