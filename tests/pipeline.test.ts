import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractFromHtml, extractFromText, toRawListing } from '../scripts/lib/extract';
import { extractLinks, htmlToText } from '../scripts/lib/html';
import { isAllowed, parseRobots } from '../scripts/lib/robots';
import { PORTALS, parseAlertEmail } from '../scripts/sources/email-alerts';
import { CRITERIA } from '../src/lib/criteria';
import { evaluate, monthlyCost } from '../src/lib/evaluate';
import { DEFAULT_FILTERS, applyFilters, sortListings } from '../src/lib/filters';
import { bikeTrip, detectDistrict, getDistrict } from '../src/lib/geo';
import {
  dedupe,
  detectShared,
  detectType,
  normalizeListing,
  parseAmounts,
  parseAvailability,
  parsePrice,
  parseSurface,
  withCoordinates,
} from '../src/lib/normalize';
import type { Listing, RawListing } from '../src/lib/types';

const TODAY = '2026-11-14';

function listing(overrides: Partial<Listing> = {}): Listing {
  const centre = getDistrict('centre-ville')!;
  return {
    id: 'test-1',
    source: 'test',
    sourceLabel: 'Test',
    url: 'https://example.org/annonce/1',
    title: 'T2 38 m² centre-ville',
    description: '',
    type: 'T2',
    isShared: false,
    rent: 540,
    chargesIncluded: true,
    charges: null,
    surface: 38,
    furnished: true,
    city: 'Saint-Nazaire',
    postcode: '44600',
    districtId: centre.id,
    address: null,
    lat: centre.lat,
    lng: centre.lng,
    locationPrecision: 'quartier',
    availableFrom: '2027-01-04',
    publishedAt: null,
    firstSeen: TODAY,
    features: [],
    ...overrides,
  };
}

function raw(overrides: Partial<RawListing> = {}): RawListing {
  return {
    source: 'test',
    sourceLabel: 'Test',
    ref: 'r1',
    url: 'https://example.org/annonce/r1',
    title: 'Location appartement 2 pièces - 35.37m² à Saint nazaire (44600)',
    description: 'En centre-ville, proche mairie.',
    priceText: '600 € CC',
    surfaceText: '35.37 m²',
    locationText: 'Saint-Nazaire (44600)',
    ...overrides,
  };
}

test('montants et prix dans tous les formats', () => {
  assert.deepEqual(parseAmounts('321.84 € cc'), [321.84]);
  assert.deepEqual(parseAmounts('1 050 €'), [1050]);
  assert.deepEqual(parseAmounts('1.050 €'), [1050]);
  assert.deepEqual(parseAmounts('528,84 €'), [528.84]);
  assert.deepEqual(parsePrice('520 € CC'), { rent: 520, chargesIncluded: true, charges: null });
  assert.deepEqual(parsePrice('540 € + 45 € de charges'), { rent: 540, chargesIncluded: false, charges: 45 });
  assert.deepEqual(parsePrice('430 € HC'), { rent: 430, chargesIncluded: false, charges: null });
  assert.equal(parsePrice('prix sur demande'), null);
});

test('surfaces, types et dates', () => {
  assert.equal(parseSurface('38 m²'), 38);
  assert.equal(parseSurface('35,37 m2'), 35.4);
  assert.equal(detectType('Location appartement 1 pièce - 27.72m²'), 'T1');
  assert.equal(detectType('Location appartement 2 pièces - 40.85m²'), 'T2');
  assert.equal(detectType('Studio meublé 24 m²'), 'studio');
  assert.equal(detectType('T3 62 m² centre-ville'), 'T3+');
  assert.equal(detectType('Location parking Saint-Nazaire'), 'autre');
  assert.equal(detectType('Appartement à louer', '', 24), 'studio');
  assert.equal(detectType('Appartement à louer', '', 40), 'T2');
  assert.equal(parseAvailability('Disponible le 04/01/2027'), '2027-01-04');
  assert.equal(parseAvailability('Disponible mi-décembre 2026'), '2026-12-15');
  assert.equal(parseAvailability('Libre de suite'), null);
});

test('détection des colocations', () => {
  assert.equal(detectShared('Chambre en colocation dans T4 centre-ville'), true);
  assert.equal(detectShared('Chambre chez l’habitant'), true);
  assert.equal(detectShared('T2 avec une chambre sur cour'), false);
  assert.equal(detectShared('Studio meublé. Pas de colocation.'), false);
});

test('robots.txt : règle la plus longue, joker, groupe spécifique', () => {
  const rules = parseRobots(
    `User-agent: *\nDisallow: /recherche\nAllow: /recherche/location\nDisallow: /*.pdf$\n\nUser-agent: AutreRobot\nDisallow: /`,
    'immo-saint-nazaire-2027',
  );
  assert.equal(isAllowed(rules, '/annonces/123'), true);
  assert.equal(isAllowed(rules, '/recherche?q=1'), false);
  assert.equal(isAllowed(rules, '/recherche/location/saint-nazaire'), true);
  assert.equal(isAllowed(rules, '/doc/plan.pdf'), false);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:', 'x'), '/tout'), true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /', 'x'), '/tout'), false);
  const own = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: immo-saint-nazaire-2027\nAllow: /', 'immo-saint-nazaire-2027/2.0');
  assert.equal(isAllowed(own, '/annonces'), true);
});

test('extraction : page d’agence avec JSON-LD', () => {
  const html = `<html><head><title>Annonce</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Apartment","name":"Appartement 2 pièces 40 m²",
  "description":"T2 au 2e étage avec balcon, rue de la Paix.","floorSize":{"@type":"QuantitativeValue","value":40},
  "address":{"@type":"PostalAddress","streetAddress":"12 rue de la Paix","postalCode":"44600","addressLocality":"Saint-Nazaire"},
  "offers":{"@type":"Offer","price":"560","priceCurrency":"EUR"}}</script></head>
  <body><nav>Accueil Acheter Louer</nav><h1>Appartement 2 pièces 40 m²</h1><p>Loyer 560 € charges comprises</p>
  <aside>Biens similaires : 1 280 € par mois</aside></body></html>`;
  const e = extractFromHtml(html);
  assert.equal(e.rent, 560);
  assert.equal(e.chargesMode, 'cc');
  assert.equal(e.surface, 40);
  assert.equal(e.locationText, 'Saint-Nazaire (44600)');
  assert.equal(e.address, '12 rue de la Paix');
});

test('extraction : page d’agence sans données structurées', () => {
  const html = `<html><body><header>Louer Acheter 3 999 € de frais</header>
  <h1>Location appartement 1 pièce - 25.21m² à Saint nazaire (44600)</h1>
  <div>SAINT NAZAIRE (44600)</div><div>Au prix de (par mois)</div><div>412.6 €</div><div>cc</div>
  <p>Studio refait à neuf, 3e étage avec ascenseur, avenue de la République. Disponible le 02/01/2027.</p>
  <div>Ces biens pourraient également vous plaire : 2 090 €</div></body></html>`;
  const e = extractFromHtml(html);
  assert.equal(e.rent, 413);
  assert.equal(e.chargesMode, 'cc');
  assert.equal(e.surface, 25.21);
  assert.equal(e.locationText, 'Saint-Nazaire (44600)');
  assert.match(e.address ?? '', /avenue de la République/);
  assert.match(e.availabilityText ?? '', /02\/01\/2027/);

  const rawListing = toRawListing(e, { source: 's', sourceLabel: 'S', ref: 'a', url: 'https://x.fr/a' });
  const normalized = normalizeListing(rawListing!, TODAY)!;
  assert.equal(normalized.type, 'T1');
  assert.equal(normalized.rent, 413);
  assert.equal(normalized.chargesIncluded, true);
  assert.equal(normalized.availableFrom, '2027-01-02');
});

test('extraction : liens de la page de résultats', () => {
  const links = extractLinks(
    '<a href="/annonces/biens/location/appartement/saint-nazaire/46afc9a5-befc-4b96-bbe1-a735a2b74641">T2</a><a href="#top">haut</a><a href="mailto:a@b.fr">mail</a>',
    'https://www.squarehabitat.fr/recherche',
  );
  assert.deepEqual(links, [
    'https://www.squarehabitat.fr/annonces/biens/location/appartement/saint-nazaire/46afc9a5-befc-4b96-bbe1-a735a2b74641',
  ]);
  assert.equal(htmlToText('<p>Loyer&nbsp;:&nbsp;520&nbsp;&euro;</p>'), 'Loyer : 520 €');
});

test('alerte e-mail : une annonce par bloc, liens parasites ignorés', () => {
  const portal = PORTALS.find((p) => p.id === 'leboncoin')!;
  const html = `<table>
  <tr><td><a href="https://www.leboncoin.fr/ad/locations/2914507731"><img src="x.jpg"></a></td>
      <td><a href="https://www.leboncoin.fr/ad/locations/2914507731">Studio meublé 24 m² hypercentre</a><br>490 € CC<br>Saint-Nazaire 44600 Centre-ville</td></tr>
  <tr><td><a href="https://www.leboncoin.fr/ad/locations/2915002917">Appartement 2 pièces 40 m²</a><br>550 €<br>Saint-Nazaire 44600</td></tr>
  <tr><td><a href="https://www.leboncoin.fr/mes-alertes/desinscription">Se désinscrire</a> 100 €</td></tr>
  </table>`;
  const listings = parseAlertEmail(html, portal, '2026-11-14T07:00:00Z');
  assert.equal(listings.length, 2);
  assert.equal(listings[0].url, 'https://www.leboncoin.fr/ad/locations/2914507731');
  assert.equal(listings[0].priceText, '490 € CC');
  assert.equal(listings[0].surfaceText, '24 m²');
  assert.equal(listings[1].priceText, '550 €');
  assert.equal(listings[1].surfaceText, '40 m²');
  assert.equal(listings[1].publishedAt, '2026-11-14');
});

test('extraction depuis un texte : loyer en contexte plutôt que premier montant', () => {
  const e = extractFromText('Frais de dossier 150 €\nT2 lumineux 38 m²\nLoyer : 595 € + 40 € de charges\nSaint-Nazaire (44600)');
  assert.equal(e.rent, 595);
  assert.equal(e.chargesMode, 'hc');
  assert.equal(e.charges, 40);
});

test('normalisation : localisation par quartier, par coordonnées ou inconnue', () => {
  const byDistrict = normalizeListing(raw({ locationText: 'Saint-Nazaire (44600), Front de mer' }), TODAY)!;
  assert.equal(byDistrict.districtId, 'front-de-mer');
  assert.equal(byDistrict.locationPrecision, 'quartier');

  const unknown = normalizeListing(raw({ description: 'Bel appartement lumineux.' }), TODAY)!;
  assert.equal(unknown.districtId, null);
  assert.equal(unknown.locationPrecision, 'inconnue');

  const located = withCoordinates(unknown, 47.2722, -2.199);
  assert.equal(located.districtId, 'petit-maroc');
  assert.equal(located.locationPrecision, 'adresse');
  assert.ok(detectDistrict('Saint-Nazaire (44600), Méan-Penhoët')?.id === 'mean-penhoet');
});

test('le centre-ville et le front de mer sont à moins de 20 min à vélo des Chantiers', () => {
  for (const id of ['centre-ville', 'front-de-mer', 'ville-port', 'petit-maroc', 'gare']) {
    const d = getDistrict(id)!;
    assert.ok(bikeTrip(d.lat, d.lng).minutes <= CRITERIA.maxBikeMinutes, d.name);
  }
  const saintMarc = getDistrict('saint-marc')!;
  assert.ok(bikeTrip(saintMarc.lat, saintMarc.lng).minutes > CRITERIA.maxBikeMinutes);
});

test('coût mensuel ramené charges comprises', () => {
  assert.equal(monthlyCost(listing({ rent: 540, chargesIncluded: false, charges: 45 })).cost, 585);
  const estimated = monthlyCost(listing({ rent: 590, chargesIncluded: false, charges: null }));
  assert.equal(estimated.cost, 590 + CRITERIA.chargesEstimate.T2);
  assert.equal(estimated.estimated, true);
});

test('filtrage strict : colocation, budget, type, distance, commune', () => {
  const codes = (l: Listing) => evaluate(l).rejections.map((r) => r.code);
  assert.deepEqual(codes(listing()), []);
  assert.deepEqual(codes(listing({ rent: 700 })), []);
  assert.deepEqual(codes(listing({ rent: 701 })), ['budget']);
  assert.deepEqual(codes(listing({ isShared: true })), ['colocation']);
  assert.deepEqual(codes(listing({ type: 'T3+' })), ['type']);
  assert.deepEqual(codes(listing({ type: 'autre' })), ['type']);
  const far = getDistrict('saint-marc')!;
  assert.deepEqual(codes(listing({ districtId: far.id, lat: far.lat, lng: far.lng })), ['distance']);
  assert.deepEqual(codes(listing({ city: 'Saint-Nazaire', postcode: '66570' })), ['ville']);
  assert.deepEqual(codes(listing({ city: 'Pornichet', postcode: '44380' })), ['ville']);
  // Adresse non précisée : conservée, trajet à vérifier.
  const unknown = evaluate(listing({ districtId: null, lat: null, lng: null, locationPrecision: 'inconnue' }));
  assert.equal(unknown.accepted, true);
  assert.equal(unknown.bikeMinutes, null);
  assert.equal(unknown.zone, 'inconnu');
});

test('score : moins cher, plus proche et mieux daté passe devant', () => {
  const ideal = evaluate(listing({ rent: 520 }));
  const pricey = evaluate(listing({ rent: 690 }));
  const late = evaluate(listing({ rent: 520, availableFrom: '2027-04-01' }));
  const unknown = evaluate(listing({ rent: 520, districtId: null, lat: null, lng: null, locationPrecision: 'inconnue' }));
  assert.ok(ideal.score > pricey.score);
  assert.ok(ideal.score > late.score);
  assert.ok(ideal.score > unknown.score);
  for (const l of [ideal, pricey, late, unknown]) {
    assert.ok(l.score >= 0 && l.score <= 100);
    for (const part of l.scoreParts) assert.ok(part.points >= 0 && part.points <= part.max);
  }
});

test('dédoublonnage et tris', () => {
  const a = listing({ id: 'a', url: 'https://a.fr/1' });
  const b = listing({ id: 'b', url: 'https://b.fr/9' });
  const c = listing({ id: 'c', url: 'https://c.fr/3', rent: 480, surface: 22, type: 'studio' });
  const { unique, removed } = dedupe([a, b, c]);
  assert.equal(removed, 1);
  const evaluated = unique.map((l) => evaluate(l));
  assert.deepEqual(sortListings(evaluated, 'price-asc').map((l) => l.id), ['c', 'a']);
  const studios = applyFilters(evaluated, { ...DEFAULT_FILTERS, type: 'studio' }, () => 'a-analyser');
  assert.deepEqual(studios.map((l) => l.id), ['c']);
});

test('alerte e-mail : les paramètres de suivi sont retirés des liens publiés', async () => {
  const { cleanUrl } = await import('../scripts/sources/email-alerts');
  assert.equal(
    cleanUrl('https://www.leboncoin.fr/ad/locations/2914507731?utm_source=alerte&uid=abc123&page=2#photos'),
    'https://www.leboncoin.fr/ad/locations/2914507731?page=2',
  );
});

test('extraction : champs légaux d’une fiche d’agence (loi ALUR), sans signe €', () => {
  const html = `<h1>Location studio - 38.37m² à Saint nazaire (44600)</h1>
  <p>Saint-Nazaire - Avenue de Penhouët</p><p>Beau studio meublé entièrement rénové.</p>
  <dl><dt>Typologie</dt><dd>T0</dd><dt>Date de disponibilité</dt><dd>20/07/2026</dd>
  <dt>Loyer hors charges</dt><dd>600</dd><dt>Montant des charges</dt><dd>11 (1)</dd>
  <dt>Dépôt de garantie</dt><dd>1200</dd><dt>Honoraires charge locataire</dt><dd>448.93 TTC (2)</dd></dl>
  <p>Montant estimé des dépenses annuelles d'énergie</p><p>Entre 1230 €</p><p>et 1690 €</p><p>par an</p>`;
  const e = extractFromHtml(html);
  assert.equal(e.rent, 600);
  assert.equal(e.chargesMode, 'hc');
  assert.equal(e.charges, 11);
  assert.equal(e.address, 'Avenue de Penhouët');
  const listing = normalizeListing(toRawListing(e, { source: 's', sourceLabel: 'S', ref: 'x', url: 'https://x.fr/x' })!, TODAY)!;
  assert.equal(listing.type, 'studio');
  assert.equal(listing.availableFrom, '2026-07-20');
  assert.equal(evaluate(listing).monthlyCost, 611);
});

test('extraction : le coût annuel de l’énergie n’est pas un loyer', () => {
  assert.equal(extractFromText('Studio 20 m²\nDépenses annuelles d’énergie\nEntre 1230 €\net 1690 €\npar an').rent, null);
});

test('texte : attributs contenant « > » et découpe par liens', async () => {
  const { segmentByLinks } = await import('../scripts/lib/html');
  assert.equal(htmlToText('<a data-action="click->modal#open" href="/x">Appeler</a>'), 'Appeler');
  const segments = segmentByLinks('<a href="/a/1">T2 40 m²</a> 520 € par mois <a href="/a/2">Studio 20 m²</a> 410 €', 'https://x.fr/');
  assert.deepEqual(segments.map((s) => s.href), ['https://x.fr/a/1', 'https://x.fr/a/2']);
  assert.match(segments[0].text, /520 € par mois/);
});

test('identifiants : deux annonces d’un même site ne se confondent jamais', () => {
  const a = normalizeListing(raw({ url: 'https://www.fnaim.fr/annonce-immobiliere/53224796/18-location-appartement-st-nazaire-44600.htm', ref: '18-location-appartement-st-nazaire-44600' }), TODAY)!;
  const b = normalizeListing(raw({ url: 'https://www.fnaim.fr/annonce-immobiliere/53234097/18-location-appartement-st-nazaire-44600.htm', ref: '18-location-appartement-st-nazaire-44600' }), TODAY)!;
  assert.notEqual(a.id, b.id);
  const marc = normalizeListing(raw({ title: 'Appartement 2 pièces 36m² ST MARC SUR MER 44600', locationText: extractFromText('ST MARC SUR MER 44600').locationText }), TODAY)!;
  assert.equal(marc.postcode, '44600');
  assert.equal(marc.districtId, 'saint-marc');
  assert.deepEqual(evaluate({ ...marc, furnished: true }).rejections.map((r) => r.code), ['distance']);
});

test('géocodage : la rue trouvée doit correspondre à la rue demandée', async () => {
  const { sameStreet } = await import('../scripts/lib/http');
  assert.equal(sameStreet('Avenue de Penhouët', 'Avenue de Penhoët'), true);
  assert.equal(sameStreet('Avenue de Penhouët', 'Avenue de Saint-Nazaire'), false);
  assert.equal(sameStreet('98 AVENUE ALBERT DE MUN', 'Avenue Albert de Mun'), true);
});

test('chiffrement : aller-retour, et mauvaise phrase refusée', async () => {
  const { encryptJson, decryptJson, isEncryptedFile, WrongPassphraseError } = await import('../src/lib/crypto');
  const payload = { listings: [{ id: 'a', rent: 520 }], generatedAt: '2026-11-14T07:17:00Z' };
  const sealed = await encryptJson(payload, 'phrase de test très longue');
  assert.ok(isEncryptedFile(sealed));
  assert.ok(!JSON.stringify(sealed).includes('520'));
  assert.deepEqual(await decryptJson(sealed, 'phrase de test très longue'), payload);
  await assert.rejects(decryptJson(sealed, 'mauvaise phrase'), WrongPassphraseError);
});

test('Apify : résultat Leboncoin converti', async () => {
  const { toRawListing, APIFY_PORTALS } = await import('../scripts/sources/apify');
  const portal = APIFY_PORTALS.find((p) => p.id === 'leboncoin')!;
  const raw = toRawListing(
    {
      id: '3127779306',
      url: 'https://www.leboncoin.fr/ad/locations/3127779306',
      subject: 'Appartement lumineux proche gare',
      body: 'Au 2e étage, rue de la Paix. Disponible début janvier 2027.',
      price: [560],
      first_publication_date: '2026-11-13 18:50:46',
      attributes: [
        { key: 'square', value: '38', value_label: '38 m²' },
        { key: 'rooms', value: '2', value_label: '2' },
        { key: 'charges_included', value: '1', value_label: 'Oui' },
        { key: 'furnished', value: '2', value_label: 'Non meublé' },
      ],
      location: { city: 'Saint-Nazaire', zipcode: '44600', lat: 47.27, lng: -2.21, source: 'city' },
    },
    portal,
  )!;
  assert.equal(raw.priceText, '560 € CC');
  assert.equal(raw.surfaceText, '38 m²');
  assert.equal(raw.publishedAt, '2026-11-13');
  assert.equal(raw.lat, undefined, 'position floutée ignorée');
  assert.equal(raw.furnished, false);
  const listing = normalizeListing(raw, TODAY)!;
  assert.equal(listing.type, 'T2');
  assert.equal(listing.postcode, '44600');
  assert.deepEqual(evaluate(listing).rejections.map((r) => r.code), ['meuble'], 'non meublé écarté');
});

test('Apify : résultat Bien’ici converti, lien étranger refusé', async () => {
  const { toRawListing, APIFY_PORTALS } = await import('../scripts/sources/apify');
  const portal = APIFY_PORTALS.find((p) => p.id === 'bienici')!;
  const item = {
    id: 'ag440871-5521',
    propertyType: 'flat',
    title: 'Appartement',
    description: 'Studio meublé face à la mer.',
    price: 535,
    charges: 30,
    surfaceArea: 24,
    roomsQuantity: 1,
    url: 'https://www.bienici.com/annonce/location/saint-nazaire/appartement/1piece/ag440871-5521',
    city: 'Saint-Nazaire',
    postalCode: '44600',
    district: { name: 'Front de mer' },
    blurInfo: { position: { lat: 47.27, lon: -2.21 } },
  };
  const raw = toRawListing(item, portal)!;
  assert.equal(raw.priceText, '535 € + 30 € de charges');
  const listing = normalizeListing(raw, TODAY)!;
  assert.equal(listing.type, 'T1');
  assert.equal(listing.districtId, 'front-de-mer');
  assert.equal(toRawListing({ ...item, url: 'https://ailleurs.example/annonce/1' }, portal), null);
  assert.equal(toRawListing({ ...item, price: null }, portal), null);
});

test('meublé : détection stricte et rejet de tout ce qui n’est pas clairement meublé', async () => {
  const { detectFurnished } = await import('../src/lib/normalize');
  assert.equal(detectFurnished('Studio meublé proche gare'), true);
  assert.equal(detectFurnished('T2 entierement meuble et equipe'), true);
  assert.equal(detectFurnished('Location meublée, bail 1 an'), true);
  assert.equal(detectFurnished('Appartement non meublé'), false);
  assert.equal(detectFurnished('T2 loué vide, cuisine équipée'), false);
  assert.equal(detectFurnished('Cuisine avec meubles hauts et bas'), null);
  assert.equal(detectFurnished('Bel immeuble ancien'), null);
  assert.equal(detectFurnished('T2 lumineux'), null);

  const codes = (l: Listing) => evaluate(l).rejections.map((r) => r.code);
  assert.deepEqual(codes(listing({ furnished: true })), []);
  assert.deepEqual(codes(listing({ furnished: false })), ['meuble']);
  assert.deepEqual(codes(listing({ furnished: null })), ['meuble']);
  // « Non meublé » dans le texte l'emporte sur un drapeau positif.
  const contradicted = normalizeListing(raw({ description: 'Appartement non meublé', furnished: true }), TODAY)!;
  assert.equal(contradicted.furnished, false);
});

test('meublé : champ légal d’une fiche d’agence et filtre du portail', async () => {
  const { findFurnished } = await import('../scripts/lib/extract');
  assert.equal(findFurnished('Typologie\nT1\nMeublé\nOui\nLoyer\n450'), true);
  assert.equal(findFurnished('Meublé : Non'), false);
  const { toRawListing, APIFY_PORTALS } = await import('../scripts/sources/apify');
  const portal = APIFY_PORTALS.find((p) => p.id === 'bienici')!;
  const item = { url: 'https://www.bienici.com/annonce/x', title: 'Appartement', price: 520, surfaceArea: 30, roomsQuantity: 1, city: 'Saint-Nazaire', postalCode: '44600' };
  assert.equal(toRawListing(item, portal, true)!.furnished, true, 'recherche filtrée sur meublé');
  assert.equal(toRawListing(item, portal, false)!.furnished, null);
  assert.equal(toRawListing({ ...item, isFurnished: false }, portal, true)!.furnished, false, 'drapeau contraire prioritaire');
});

test('Leboncoin : l’URL de recherche porte tous les critères', async () => {
  const { LEBONCOIN_SEARCH_URL, APIFY_PORTALS } = await import('../scripts/sources/apify');
  const url = new URL(LEBONCOIN_SEARCH_URL);
  assert.equal(url.searchParams.get('category'), '10');
  assert.equal(url.searchParams.get('furnished'), '1');
  assert.equal(url.searchParams.get('price'), 'min-700');
  assert.equal(url.searchParams.get('locations'), 'Saint-Nazaire_44600');
  for (const portal of APIFY_PORTALS) assert.ok(portal.actors.length >= 1, portal.id);
});
