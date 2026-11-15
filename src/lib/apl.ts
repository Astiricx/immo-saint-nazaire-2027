import { CRITERIA, type Criteria } from './criteria';

/**
 * Estimation de l'aide au logement (APL ou ALS : même barème), locataire seul, logement ordinaire.
 *
 * Formule (ministère du Logement, « Les aides personnelles au logement, éléments de calcul ») :
 *   aide = L + C − PP − 5 €,  PP = P0 + Tp × (R − R0),  Tp = TF + TL
 *   L  loyer hors charges, dans la limite du plafond de la zone
 *   C  forfait charges
 *   P0 participation minimale : le plus élevé de 8,5 % × (L + C) et d'un montant fixe
 *   R  ressources annuelles (pour un étudiant : forfait, même sans revenu), arrondies à la centaine
 *   R0 abattement annuel ; TL dépend du rapport entre L et le plafond de la zone 2
 * Puis CRDS de 0,5 % et arrondi à l'euro inférieur ; dégressivité au-delà de 2,5 fois le plafond.
 *
 * Paramètres : barème au 1er octobre 2026 (valeurs du 1er octobre 2025 revalorisées de 1,15 %),
 * forfaits étudiants et R0 gelés pour 2026. Ce n'est qu'une estimation : seule la CAF fixe le droit.
 */
export const APL_SCALE = {
  validFrom: '2026-10-01',
  /** Loyers plafonds mensuels, personne seule, location. */
  rentCeiling: { 1: 336.97, 2: 293.68, 3: 275.25 } as Record<1 | 2 | 3, number>,
  /** Loyer de référence pour TL : plafond de la zone 2. */
  referenceRent: 293.68,
  chargesAllowance: 61.29,
  minimumParticipation: 40.01,
  participationRate: 0.085,
  /** TF, personne seule. */
  familyRate: 0.0283,
  /** R0, personne seule (gelé en 2026). */
  r0: 5235,
  studentFlatIncome: { scholarship: 6900, regular: 8600 },
  flatDeduction: 5,
  crds: 0.005,
  /** Coefficients de dégressivité et de suppression pour loyer élevé (zones 2 et 3 ; 3,4 et 4 en zone 1). */
  degressive: { 1: [3.4, 4], 2: [2.5, 3.1], 3: [2.5, 3.1] } as Record<1 | 2 | 3, [number, number]>,
};

export interface AplEstimate {
  /** Aide mensuelle estimée, en euros. */
  amount: number;
  /** Loyer hors charges retenu par le barème (plafonné). */
  rentRetained: number;
  /** Participation personnelle mensuelle. */
  participation: number;
  /** Ressources annuelles retenues. */
  income: number;
  /** L'aide est réduite parce que le loyer dépasse 2,5 fois le plafond. */
  reducedForHighRent: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** TL : 0 sous 45 %, 0,45 % par point entre 45 et 75 %, puis 0,68 % par point au-delà. */
export function rentRatioRate(rentRetained: number, scale = APL_SCALE): number {
  const ratio = Math.round((rentRetained / scale.referenceRent) * 10000) / 10000;
  let rate = 0;
  if (ratio > 0.75) rate = 0.0045 * 0.3 + 0.0068 * (ratio - 0.75);
  else if (ratio > 0.45) rate = 0.0045 * (ratio - 0.45);
  return Math.round(rate * 100000) / 100000;
}

/**
 * Aide mensuelle pour un loyer hors charges donné.
 * @param rentExcludingCharges loyer mensuel hors charges
 */
export function estimateApl(
  rentExcludingCharges: number,
  criteria: Criteria = CRITERIA,
  scale = APL_SCALE,
): AplEstimate {
  const profile = criteria.housingAid;
  const zone = profile.zone;
  const ceiling = scale.rentCeiling[zone];
  const rentRetained = Math.min(Math.max(rentExcludingCharges, 0), ceiling);
  const housingCost = rentRetained + scale.chargesAllowance;

  const flat = profile.scholarship ? scale.studentFlatIncome.scholarship : scale.studentFlatIncome.regular;
  const rawIncome = profile.student ? Math.max(profile.annualIncome, flat) : profile.annualIncome;
  const income = Math.ceil(rawIncome / 100) * 100;

  const p0 = Math.max(scale.participationRate * housingCost, scale.minimumParticipation);
  const tp = scale.familyRate + rentRatioRate(rentRetained, scale);
  const participation = p0 + tp * Math.max(income - scale.r0, 0);

  let amount = housingCost - participation - scale.flatDeduction;

  // Dégressivité puis suppression quand le loyer réel est très au-dessus du plafond.
  const [cd, cs] = scale.degressive[zone];
  const start = ceiling * cd;
  const end = ceiling * cs;
  let reducedForHighRent = false;
  if (rentExcludingCharges >= end) amount = 0;
  else if (rentExcludingCharges > start) {
    amount *= (end - rentExcludingCharges) / (end - start);
    reducedForHighRent = true;
  }

  amount = Math.floor(Math.max(amount, 0) * (1 - scale.crds));
  return {
    amount: profile.enabled ? amount : 0,
    rentRetained: round2(rentRetained),
    participation: round2(participation),
    income,
    reducedForHighRent,
  };
}

/** Description courte du profil retenu, pour l'interface. */
export function aidProfileLabel(criteria: Criteria = CRITERIA): string {
  const p = criteria.housingAid;
  const who = p.student ? `étudiant ${p.scholarship ? 'boursier' : 'non boursier'}` : 'locataire seul';
  return `${who}, zone ${p.zone}, barème au 1er octobre 2026`;
}
