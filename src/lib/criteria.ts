import type { PropertyType } from './types';

/**
 * Les critères de la recherche. Tout le filtrage et le score en découlent :
 * modifier une valeur ici suffit à changer le comportement du script et du tableau de bord.
 */
export const CRITERIA = {
  city: 'Saint-Nazaire',

  /** T2 uniquement : studios et T1 sont écartés. */
  allowedTypes: ['T2'] as PropertyType[],

  /** Surface habitable minimale, en m². */
  minSurface: 25,

  /** Impératif : seules les annonces clairement identifiées comme meublées sont retenues. */
  requireFurnished: true,

  /** Budget visé. Le score le compare au loyer net, après aide au logement estimée. */
  idealRent: 550,
  /** Seuil intermédiaire : au-delà, on entre dans le « dernier recours ». */
  stretchRent: 650,
  /** Plafond absolu, charges comprises, avant aide au logement. */
  maxRent: 700,

  /** Trajet à vélo maximal jusqu'aux Chantiers de l'Atlantique, en minutes. */
  maxBikeMinutes: 20,

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
