import type { PropertyType } from './types';

/**
 * Les critères de la recherche. Tout le filtrage et le score en découlent :
 * modifier une valeur ici suffit à changer le comportement du script et du tableau de bord.
 */
export const CRITERIA = {
  city: 'Saint-Nazaire',

  /** Studio ou T2 uniquement. Un T1 (studio avec cuisine séparée) est assimilé à un studio. */
  allowedTypes: ['studio', 'T1', 'T2'] as PropertyType[],

  /** Impératif : seules les annonces clairement identifiées comme meublées sont retenues. */
  requireFurnished: true,

  /** Loyer charges comprises visé. */
  idealRent: 550,
  /** Seuil intermédiaire : au-delà, on entre dans le « dernier recours ». */
  stretchRent: 650,
  /** Plafond absolu, charges comprises. */
  maxRent: 700,

  /** Trajet à vélo maximal jusqu'aux Chantiers de l'Atlantique, en minutes. */
  maxBikeMinutes: 20,

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
