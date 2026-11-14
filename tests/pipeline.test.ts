import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockSource } from '../scripts/sources/mock';
import { CRITERIA } from '../src/lib/criteria';
import { evaluate, monthlyCost } from '../src/lib/evaluate';
import { DEFAULT_FILTERS, applyFilters, sortListings } from '../src/lib/filters';
import { bikeTrip, detectDistrict, getDistrict } from '../src/lib/geo';
import {
  dedupe,
  detectShared,
  detectType,
  normalizeListing,
  parseAvailability,
  parsePrice,
  parseSurface,
} from '../src/lib/normalize';
import type { Listing } from '../src/lib/types';

function listing(overrides: Partial<Listing> = {}): Listing {
  const centre = getDistrict('centre-ville');
  return {
    id: 'test-1',
    source: 'manuel',
    url: 'https://example.org/annonce',
    title: 'T2 38 m² centre-ville',
    description: '',
    type: 'T2',
    isShared: false,
    rent: 540,
    chargesIncluded: true,
    charges: null,
    surface: 38,
    furnished: false,
    city: 'Saint-Nazaire',
    districtId: centre.id,
    lat: centre.lat,
    lng: centre.lng,
    availableFrom: '2027-01-04',
    publishedAt: '2026-11-10',
    features: [],
    isDemo: false,
    ...overrides,
  };
}

test('lecture des prix', () => {
  assert.deepEqual(parsePrice('520 € CC'), { rent: 520, chargesIncluded: true, charges: null });
  assert.deepEqual(parsePrice('540 € + 45 € de charges'), {
    rent: 540,
    chargesIncluded: false,
    charges: 45,
  });
  assert.deepEqual(parsePrice('430 € HC'), { rent: 430, chargesIncluded: false, charges: null });
  assert.deepEqual(parsePrice('524 € tout compris'), {
    rent: 524,
    chargesIncluded: true,
    charges: null,
  });
  assert.equal(parsePrice('1 050 €/mois charges comprises')?.rent, 1050);
  assert.equal(parsePrice('prix sur demande'), null);
});

test('lecture des surfaces, types et dates', () => {
  assert.equal(parseSurface('38 m²'), 38);
  assert.equal(parseSurface('35,37 m2'), 35.37);
  assert.equal(detectType('Studio meublé 24 m² hypercentre'), 'studio');
  assert.equal(detectType('T1 bis 31 m² Ville-Port'), 'T1');
  assert.equal(detectType('Appartement 2 pièces lumineux'), 'T2');
  assert.equal(detectType('T3 62 m² centre-ville'), 'T3+');
  assert.equal(detectType('Chambre en colocation dans T4'), 'chambre');
  assert.equal(parseAvailability('Disponible le 04/01/2027'), '2027-01-04');
  assert.equal(parseAvailability('Disponible mi-décembre 2026'), '2026-12-15');
  assert.equal(parseAvailability('Disponible janvier 2027'), '2027-01-01');
  assert.equal(parseAvailability('Libre de suite'), null);
});

test('détection des colocations', () => {
  assert.equal(detectShared('Chambre en colocation dans T4 centre-ville'), true);
  assert.equal(detectShared('T3 à partager avec un colocataire'), true);
  assert.equal(detectShared('Chambre chez l’habitant'), true);
  assert.equal(detectShared('T2 avec une chambre sur cour'), false);
  assert.equal(detectShared('Studio meublé. Pas de colocation.'), false);
});

test('détection des quartiers', () => {
  assert.equal(detectDistrict('Saint-Nazaire (44600), Front de mer')?.id, 'front-de-mer');
  assert.equal(detectDistrict('Saint-Nazaire (44600), Méan-Penhoët')?.id, 'mean-penhoet');
  assert.equal(detectDistrict('Saint-Nazaire (44600), Centre-ville')?.id, 'centre-ville');
});

test('le centre-ville et le front de mer sont à moins de 20 min à vélo des Chantiers', () => {
  for (const id of ['centre-ville', 'front-de-mer', 'ville-port', 'petit-maroc', 'gare']) {
    const d = getDistrict(id);
    const trip = bikeTrip(d.lat, d.lng);
    assert.ok(trip.minutes <= CRITERIA.maxBikeMinutes, `${d.name} : ${trip.minutes} min`);
  }
  const saintMarc = getDistrict('saint-marc');
  assert.ok(bikeTrip(saintMarc.lat, saintMarc.lng).minutes > CRITERIA.maxBikeMinutes);
});

test('coût mensuel ramené charges comprises', () => {
  assert.equal(monthlyCost(listing({ rent: 540, chargesIncluded: true })).cost, 540);
  assert.equal(monthlyCost(listing({ rent: 540, chargesIncluded: false, charges: 45 })).cost, 585);
  const estimated = monthlyCost(listing({ rent: 590, chargesIncluded: false, charges: null }));
  assert.equal(estimated.cost, 590 + CRITERIA.chargesEstimate.T2);
  assert.equal(estimated.estimated, true);
});

test('filtrage : colocation, budget, type, distance, commune', () => {
  const codes = (l: Listing) => evaluate(l).rejections.map((r) => r.code);
  assert.deepEqual(codes(listing()), []);
  assert.deepEqual(codes(listing({ rent: 700 })), []);
  assert.deepEqual(codes(listing({ rent: 701 })), ['budget']);
  assert.deepEqual(codes(listing({ rent: 680, chargesIncluded: false, charges: 45 })), ['budget']);
  assert.deepEqual(codes(listing({ isShared: true })), ['colocation']);
  assert.deepEqual(codes(listing({ type: 'T3+' })), ['type']);
  const far = getDistrict('saint-marc');
  assert.deepEqual(codes(listing({ districtId: far.id, lat: far.lat, lng: far.lng })), ['distance']);
  assert.deepEqual(codes(listing({ city: 'Pornichet' })), ['ville']);
});

test('score : moins cher, plus proche et mieux daté passe devant', () => {
  const ideal = evaluate(listing({ rent: 520 }));
  const pricey = evaluate(listing({ rent: 690 }));
  assert.ok(ideal.score > pricey.score);
  assert.equal(ideal.budgetTier, 'ideal');
  assert.equal(pricey.budgetTier, 'dernier-recours');

  const late = evaluate(listing({ rent: 520, availableFrom: '2027-04-01' }));
  assert.ok(ideal.score > late.score);

  for (const l of [ideal, pricey, late]) {
    assert.ok(l.score >= 0 && l.score <= 100);
    for (const part of l.scoreParts) assert.ok(part.points >= 0 && part.points <= part.max);
  }
});

test('jeu de démonstration : rien hors critères ne passe le filtre', async () => {
  const raw = await mockSource.fetch();
  const normalized = raw.map(normalizeListing).filter((l): l is Listing => l !== null);
  assert.equal(normalized.length, raw.length, 'toutes les annonces de démonstration sont lisibles');

  const { unique, removed } = dedupe(normalized);
  assert.equal(removed, 1);

  const evaluated = unique.map((l) => evaluate(l));
  const accepted = evaluated.filter((l) => l.accepted);
  const rejected = evaluated.filter((l) => !l.accepted);
  assert.ok(accepted.length >= 15, `${accepted.length} annonces retenues`);
  assert.ok(rejected.length >= 10, `${rejected.length} annonces écartées`);

  for (const l of accepted) {
    assert.equal(l.isShared, false, l.title);
    assert.ok(CRITERIA.allowedTypes.includes(l.type), l.title);
    assert.ok(l.monthlyCost <= CRITERIA.maxRent, l.title);
    assert.ok(l.bikeMinutes <= CRITERIA.maxBikeMinutes, l.title);
    assert.equal(l.city, 'Saint-Nazaire', l.title);
  }
  for (const code of ['colocation', 'budget', 'type', 'distance', 'ville'] as const) {
    assert.ok(
      rejected.some((l) => l.rejections.some((r) => r.code === code)),
      `au moins une annonce écartée pour « ${code} »`,
    );
  }
});

test('filtres et tris du tableau de bord', async () => {
  const raw = await mockSource.fetch();
  const accepted = raw
    .map(normalizeListing)
    .filter((l): l is Listing => l !== null)
    .map((l) => evaluate(l))
    .filter((l) => l.accepted);
  const statusOf = () => 'a-analyser' as const;

  const coeur = applyFilters(accepted, DEFAULT_FILTERS, statusOf);
  assert.ok(coeur.length > 0 && coeur.every((l) => l.zone === 'coeur'));

  const cheapT2 = applyFilters(
    accepted,
    { ...DEFAULT_FILTERS, zone: 'all', type: 'T2', maxCost: 600 },
    statusOf,
  );
  assert.ok(cheapT2.length > 0 && cheapT2.every((l) => l.type === 'T2' && l.monthlyCost <= 600));

  const byPrice = sortListings(accepted, 'price-asc').map((l) => l.monthlyCost);
  assert.deepEqual(byPrice, [...byPrice].sort((a, b) => a - b));
  const byScore = sortListings(accepted, 'score').map((l) => l.score);
  assert.deepEqual(byScore, [...byScore].sort((a, b) => b - a));
});
