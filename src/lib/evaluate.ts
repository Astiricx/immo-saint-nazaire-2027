import { CRITERIA, type Criteria } from './criteria';
import { euro, formatAvailability, formatSurface, typeLabel } from './format';
import { bikeTrip, getDistrict, isTargetCity } from './geo';
import type {
  BudgetTier,
  EvaluatedListing,
  Listing,
  Rejection,
  ScorePart,
  Zone,
} from './types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Ramène tous les loyers à un coût mensuel charges comprises. */
export function monthlyCost(
  listing: Pick<Listing, 'rent' | 'chargesIncluded' | 'charges' | 'type'>,
  criteria: Criteria = CRITERIA,
): { cost: number; estimated: boolean; charges: number } {
  if (listing.chargesIncluded) return { cost: listing.rent, estimated: false, charges: 0 };
  if (listing.charges != null) {
    return { cost: listing.rent + listing.charges, estimated: false, charges: listing.charges };
  }
  const charges = criteria.chargesEstimate[listing.type];
  return { cost: listing.rent + charges, estimated: true, charges };
}

export function budgetTier(cost: number, criteria: Criteria = CRITERIA): BudgetTier {
  if (cost <= criteria.idealRent) return 'ideal';
  if (cost <= criteria.stretchRent) return 'correct';
  if (cost <= criteria.maxRent) return 'dernier-recours';
  return 'hors-budget';
}

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  ideal: 'Budget idéal',
  correct: "Au-dessus de l'idéal",
  'dernier-recours': 'Dernier recours',
  'hors-budget': 'Hors budget',
};

const ZONE_LABELS: Record<Zone, string> = {
  coeur: 'Centre-ville ou front de mer',
  proche: 'Quartier voisin du centre',
  eloigne: 'Secteur excentré',
  inconnu: 'Secteur non précisé dans l’annonce',
};

function priceScore(cost: number, criteria: Criteria): number {
  if (cost <= criteria.idealRent) return 40;
  if (cost >= criteria.maxRent) return 8;
  const ratio = (cost - criteria.idealRent) / (criteria.maxRent - criteria.idealRent);
  return 40 - ratio * 32;
}

function bikeScore(minutes: number | null, criteria: Criteria): number {
  // Logement non situé : note neutre, à vérifier avant de candidater.
  if (minutes == null) return 10;
  if (minutes > criteria.maxBikeMinutes) return 0;
  if (minutes <= 8) return 25;
  const ratio = (minutes - 8) / (criteria.maxBikeMinutes - 8);
  return 25 - ratio * 20;
}

function zoneScore(zone: Zone): number {
  if (zone === 'coeur') return 15;
  if (zone === 'proche') return 8;
  if (zone === 'inconnu') return 5;
  return 2;
}

function availabilityScore(
  availableFrom: string | null,
  criteria: Criteria,
): { points: number; detail: string } {
  const { idealFrom, idealTo, acceptableFrom, acceptableTo } = criteria.moveIn;
  if (!availableFrom || availableFrom < acceptableFrom) {
    return {
      points: 6,
      detail: 'Libre de suite ou date non précisée : date d’entrée à négocier',
    };
  }
  const label = formatAvailability(availableFrom);
  if (availableFrom >= idealFrom && availableFrom <= idealTo) {
    return { points: 10, detail: `${label} : dans la fenêtre visée` };
  }
  if (availableFrom < idealFrom) return { points: 7, detail: `${label} : un peu tôt` };
  if (availableFrom <= acceptableTo) return { points: 5, detail: `${label} : un peu tard` };
  return { points: 1, detail: `${label} : trop tard pour janvier 2027` };
}

function comfortScore(listing: Listing): { points: number; detail: string } {
  const surfacePoints = clamp01((listing.surface - 15) / 25) * 6;
  const bonuses: string[] = [];
  let bonus = 0;
  if (listing.chargesIncluded) {
    bonus += 2;
    bonuses.push('charges comprises');
  }
  if (listing.furnished) {
    bonus += 1;
    bonuses.push('meublé');
  }
  if (listing.features.some((f) => /v[ée]lo/i.test(f))) {
    bonus += 1;
    bonuses.push('local vélo');
  }
  const detail = [formatSurface(listing.surface), ...bonuses].join(', ');
  return { points: Math.min(10, surfacePoints + bonus), detail };
}

function collectRejections(
  listing: Listing,
  cost: number,
  bikeMinutes: number | null,
  criteria: Criteria,
): Rejection[] {
  const rejections: Rejection[] = [];
  const inCity = isTargetCity(listing.city, listing.postcode);

  if (!inCity) {
    const where = [listing.city, listing.postcode ? `(${listing.postcode})` : '']
      .filter(Boolean)
      .join(' ');
    rejections.push({
      code: 'ville',
      label: 'Hors Saint-Nazaire',
      detail: where ? `Située à ${where}` : 'Commune non précisée',
    });
  }
  if (listing.isShared || listing.type === 'chambre') {
    rejections.push({
      code: 'colocation',
      label: 'Colocation',
      detail: 'Colocation ou chambre chez l’habitant',
    });
  } else if (!criteria.allowedTypes.includes(listing.type)) {
    rejections.push({
      code: 'type',
      label: 'Type de bien',
      detail: `${typeLabel(listing.type)} : seuls les studios et les T2 sont retenus`,
    });
  }
  if (cost > criteria.maxRent) {
    rejections.push({
      code: 'budget',
      label: 'Hors budget',
      detail: `${euro(cost)} charges comprises, plafond à ${euro(criteria.maxRent)}`,
    });
  }
  if (inCity && bikeMinutes != null && bikeMinutes > criteria.maxBikeMinutes) {
    rejections.push({
      code: 'distance',
      label: 'Trop loin à vélo',
      detail: `${bikeMinutes} min jusqu’aux Chantiers, maximum ${criteria.maxBikeMinutes} min`,
    });
  }
  return rejections;
}

/** Calcule coût réel, trajet, score sur 100 et verdict de filtrage d'une annonce. */
export function evaluate(listing: Listing, criteria: Criteria = CRITERIA): EvaluatedListing {
  const district = getDistrict(listing.districtId);
  const zone: Zone = district?.zone ?? 'inconnu';
  const { cost, estimated, charges } = monthlyCost(listing, criteria);
  const trip =
    listing.lat != null && listing.lng != null ? bikeTrip(listing.lat, listing.lng) : null;
  const inCity = isTargetCity(listing.city, listing.postcode);
  const districtName = !inCity
    ? listing.city || 'Commune non précisée'
    : (district?.name ?? 'Secteur non précisé');
  const availability = availabilityScore(listing.availableFrom, criteria);
  const comfort = comfortScore(listing);
  const tier = budgetTier(cost, criteria);

  const scoreParts: ScorePart[] = [
    {
      id: 'prix',
      label: 'Loyer',
      points: round1(priceScore(cost, criteria)),
      max: 40,
      detail: `${euro(cost)} charges comprises${estimated ? ' (charges estimées)' : ''}`,
    },
    {
      id: 'trajet',
      label: 'Trajet à vélo',
      points: round1(bikeScore(trip?.minutes ?? null, criteria)),
      max: 25,
      detail: trip
        ? `${trip.minutes} min jusqu’aux Chantiers${
            listing.locationPrecision === 'quartier' ? ', depuis le centre du quartier' : ''
          }`
        : 'Adresse non précisée : trajet à vérifier',
    },
    {
      id: 'secteur',
      label: 'Secteur',
      points: zoneScore(zone),
      max: 15,
      detail: district ? `${district.name} : ${ZONE_LABELS[zone].toLowerCase()}` : ZONE_LABELS[zone],
    },
    {
      id: 'disponibilite',
      label: 'Disponibilité',
      points: availability.points,
      max: 10,
      detail: availability.detail,
    },
    {
      id: 'confort',
      label: 'Confort',
      points: round1(comfort.points),
      max: 10,
      detail: comfort.detail,
    },
  ];

  const rejections = collectRejections(listing, cost, trip?.minutes ?? null, criteria);
  const score = Math.round(scoreParts.reduce((sum, part) => sum + part.points, 0));

  return {
    ...listing,
    monthlyCost: cost,
    costIsEstimated: estimated,
    estimatedCharges: charges,
    bikeMinutes: trip?.minutes ?? null,
    bikeKm: trip?.km ?? null,
    districtName,
    zone,
    budgetTier: tier,
    score,
    scoreParts,
    rejections,
    accepted: rejections.length === 0,
  };
}
