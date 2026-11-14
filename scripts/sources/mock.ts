import { SOURCES } from '../../src/lib/sources';
import type { RawListing, SourceId } from '../../src/lib/types';
import type { ListingSource } from './types';

type Seed = Omit<RawListing, 'url' | 'isDemo' | 'locationText' | 'surfaceText'> & {
  surface: number;
  /** Quartier, ou « Ville|… » pour une autre commune. */
  where: string;
};

const sn = (district: string) => `Saint-Nazaire (44600), ${district}`;

/**
 * Annonces fictives mais plausibles pour Saint-Nazaire fin 2026 : loyers, surfaces et
 * quartiers calés sur le marché local. Le jeu contient volontairement des colocations,
 * des biens hors budget, trop grands ou trop éloignés, pour exercer le filtrage.
 */
const SEEDS: Seed[] = [
  // ——— Dans les critères ———
  {
    source: 'leboncoin', ref: '2914507731', surface: 24, where: sn('Centre-ville'),
    title: 'Studio meublé 24 m² hypercentre, proche Ruban Bleu',
    description:
      'Studio meublé au 3e étage avec ascenseur, entre le Ruban Bleu et le Paquebot. Pièce de vie avec kitchenette équipée, salle d’eau, fibre installée. Pas de colocation.',
    priceText: '490 € CC', availabilityText: 'Disponible le 04/01/2027', publishedAt: '2026-11-12',
  },
  {
    source: 'seloger', ref: '231884109', surface: 38, where: sn('Centre-ville'),
    title: 'T2 lumineux 38 m² avenue de la République',
    description:
      'Au 2e étage sans ascenseur, séjour avec balcon filant, cuisine séparée aménagée, chambre sur cour, cave. Chauffage individuel gaz.',
    priceText: '540 € + 45 € de charges', availabilityText: 'Libre le 15/12/2026', publishedAt: '2026-11-10',
  },
  {
    source: 'bienici', ref: 'ag440871-5521', surface: 41, where: sn('Front de mer'),
    title: 'T2 41 m² vue mer boulevard Wilson',
    description:
      'Face à la plage, T2 traversant avec vue mer depuis le séjour. Résidence avec ascenseur et local vélos sécurisé. Eau froide comprise dans les charges.',
    priceText: '690 € CC', availabilityText: 'Disponible début janvier 2027', publishedAt: '2026-11-08',
  },
  {
    source: 'ouestfrance-immo', ref: '17402266', surface: 21, where: sn('Gare'),
    title: 'Studio 21 m² tout compris, près de la gare et des chantiers navals',
    description:
      'Studio meublé en étage avec ascenseur. Loyer tout compris : eau, électricité, chauffage, internet inclus. Idéal salarié en mission.',
    priceText: '524 € tout compris', availabilityText: 'Disponible le 02/01/2027', publishedAt: '2026-11-11',
    furnished: true,
  },
  {
    source: 'agence', ref: 'SH-44600-3187', surface: 35, where: sn('Centre-ville'),
    title: 'Appartement T2 rénové 35 m², proche mairie',
    description:
      'En rez-de-chaussée d’un immeuble calme, T2 entièrement rénové : séjour, cuisine aménagée, chambre, salle d’eau avec WC.',
    priceText: '565 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-05',
  },
  {
    source: 'leboncoin', ref: '2909917340', surface: 27, where: sn('Centre-ville'),
    title: 'Studio 27 m² avec cuisine indépendante, près de la médiathèque',
    description:
      'Entrée, pièce de vie, cuisine indépendante aménagée, salle d’eau avec WC. 2e étage sans ascenseur. Charges en sus (eau, parties communes).',
    priceText: '430 € HC', availabilityText: 'Disponible le 01/12/2026', publishedAt: '2026-11-02',
  },
  {
    source: 'location-etudiant', ref: '1427990312', surface: 31, where: sn('Ville-Port'),
    title: 'T1 bis 31 m² Ville-Port, face au théâtre',
    description:
      'T1 bis avec coin nuit séparé, cuisine équipée, ascenseur et local vélos. À deux pas de la base sous-marine.',
    priceText: '510 € CC', availabilityText: 'Disponible le 11/01/2027', publishedAt: '2026-11-13',
  },
  {
    source: 'leboncoin', ref: '2916630058', surface: 37, where: sn('Centre-ville'),
    title: 'T2 meublé 37 m² refait à neuf, à deux pas du centre',
    description:
      'Appartement meublé rénové à l’été 2024 : séjour avec cuisine ouverte équipée, chambre avec dressing, lave-linge.',
    priceText: '640 € CC', availabilityText: 'Disponible janvier 2027', publishedAt: '2026-11-06',
  },
  {
    source: 'seloger', ref: '232017645', surface: 19, where: sn('Petit Maroc'),
    title: 'Studio 19 m² au Petit Maroc, vue sur le port',
    description:
      'Petit studio au dernier étage avec vue sur le port et l’estuaire. Kitchenette, salle d’eau. Immeuble sans ascenseur.',
    priceText: '410 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-10-29',
  },
  {
    source: 'bienici', ref: 'ag441203-0098', surface: 44, where: sn('Les Halles'),
    title: 'T2 44 m² avec balcon, quartier des Halles',
    description:
      'À 100 m du marché couvert : séjour avec balcon, cuisine séparée, chambre, cave et local vélo commun.',
    priceText: '598 € + 50 € de charges', availabilityText: 'Disponible le 15/01/2027', publishedAt: '2026-11-09',
  },
  {
    source: 'agence', ref: 'SH-44600-3204', surface: 25, where: sn('Petit Caporal'),
    title: 'Studio meublé 25 m² Petit Caporal, au calme sur cour',
    description:
      'Au fond d’une cour desservant trois logements, studio meublé (mobilier récent) en rez-de-chaussée. Proche centre-ville.',
    priceText: '455 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-03',
  },
  {
    source: 'ouestfrance-immo', ref: '17398841', surface: 33, where: sn('Parc paysager'),
    title: 'T2 33 m² à 2 minutes du Parc paysager',
    description:
      'Dans une petite copropriété, T2 avec séjour, cuisine aménagée, chambre et place de parking privative.',
    priceText: '620 € CC', availabilityText: 'Disponible le 20/12/2026', publishedAt: '2026-11-07',
  },
  {
    source: 'leboncoin', ref: '2915002917', surface: 40, where: sn('Méan-Penhoët'),
    title: 'T2 40 m² Méan-Penhoët, à 5 minutes des Chantiers',
    description:
      'Au 1er étage d’une maison divisée en deux logements : séjour, cuisine, chambre, stationnement et local vélo dans la cour.',
    priceText: '550 € CC', availabilityText: 'Disponible le 05/01/2027', publishedAt: '2026-11-12',
  },
  {
    source: 'leboncoin', ref: '2912288164', surface: 30, where: sn('Front de mer'),
    title: 'Studio 30 m² front de mer, résidence avec ascenseur',
    description:
      'Grand studio avec coin cuisine équipé et vue mer latérale. Ascenseur, interphone. Plage à 50 m.',
    priceText: '535 € CC', availabilityText: 'Disponible mi-décembre 2026', publishedAt: '2026-11-04',
  },
  {
    source: 'seloger', ref: '231990277', surface: 36, where: sn('Jardin des Plantes'),
    title: 'T2 36 m² Jardin des Plantes, proche plage',
    description:
      'Au calme, T2 en rez-de-jardin : séjour, cuisine aménagée, chambre avec placard. Plage et Jardin des Plantes à pied.',
    priceText: '605 € CC', availabilityText: 'Disponible le 02/02/2027', publishedAt: '2026-10-31',
    lat: 47.2685, lng: -2.22,
  },
  {
    source: 'location-etudiant', ref: '1427484269', surface: 18, where: sn('Gare'),
    title: 'Studio 18 m² résidence récente, centre-ville gare',
    description:
      'Dans une résidence BBC de 2018 à deux pas de la gare SNCF et des bus Hélyce, studio meublé avec kitchenette.',
    priceText: '395 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-01',
    furnished: true,
  },
  {
    source: 'bienici', ref: 'ag440871-5560', surface: 42, where: sn('Centre-ville'),
    title: 'T2 42 m² hypercentre, 2e étage, parquet',
    description:
      'Bel appartement ancien avec parquet et hauteur sous plafond : séjour, cuisine séparée, chambre, cave.',
    priceText: '675 € CC', availabilityText: 'Disponible le 08/01/2027', publishedAt: '2026-11-13',
  },
  {
    source: 'agence', ref: 'SH-44600-3219', surface: 29, where: sn('Centre-ville'),
    title: 'T1 bis 29 m² avenue du Général de Gaulle',
    description:
      'T1 bis au 4e étage avec ascenseur : pièce de vie, alcôve, cuisine aménagée, salle de bains.',
    priceText: '480 € + 35 € de charges', availabilityText: 'Disponible le 01/01/2027', publishedAt: '2026-11-10',
  },
  {
    source: 'leboncoin', ref: '2907745512', surface: 39, where: sn('Prézégat'),
    title: 'T2 39 m² Prézégat, proche gare, stationnement',
    description:
      'T2 au 1er étage : séjour, cuisine, chambre, place de stationnement. Bus Hélyce à 200 m.',
    priceText: '530 € CC', availabilityText: 'Disponible le 15/11/2026', publishedAt: '2026-10-27',
  },
  {
    source: 'ouestfrance-immo', ref: '17405530', surface: 23, where: sn('Ville-Port'),
    title: 'Studio 23 m² Ville-Port, immeuble récent',
    description:
      'Studio en étage avec ascenseur, kitchenette équipée, local vélos en rez-de-chaussée. Commerces au pied de l’immeuble.',
    priceText: '468 € CC', availabilityText: 'Disponible le 12/12/2026', publishedAt: '2026-11-09',
  },
  {
    source: 'seloger', ref: '232040918', surface: 45, where: sn('Front de mer'),
    title: 'T2 45 m² dernier étage, boulevard Wilson',
    description:
      'Dernier étage avec balcon et vue mer : séjour, cuisine équipée, chambre, salle d’eau. Ascenseur.',
    priceText: '700 € CC', availabilityText: 'Disponible janvier 2027', publishedAt: '2026-11-11',
  },
  {
    source: 'leboncoin', ref: '2913370926', surface: 34, where: sn('Centre-ville'),
    title: 'T2 34 m² rue de la Paix',
    description:
      'Particulier loue T2 au 1er étage : séjour, coin cuisine, chambre. Montant des charges à voir avec le propriétaire.',
    priceText: '590 €', availabilityText: 'Libre de suite', publishedAt: '2026-10-30',
  },

  // ——— Colocations (écartées) ———
  {
    source: 'leboncoin', ref: '2915518803', surface: 12, where: sn('Centre-ville'),
    title: 'Chambre en colocation dans T4 centre-ville',
    description: 'Chambre meublée de 12 m² dans une colocation de trois personnes. Cuisine et salon partagés.',
    priceText: '390 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-08',
  },
  {
    source: 'location-etudiant', ref: '1427811650', surface: 14, where: sn('Gare'),
    title: 'Colocation : chambre meublée 14 m² proche gare',
    description: 'Dans une maison en colocation de quatre chambres, tout compris avec internet.',
    priceText: '420 € tout compris', availabilityText: 'Disponible le 03/01/2027', publishedAt: '2026-11-10',
  },
  {
    source: 'bienici', ref: 'ag439115-7741', surface: 15, where: sn('Front de mer'),
    title: 'T3 à partager, colocation à deux sur le front de mer',
    description: 'Une chambre disponible dans un T3 de 62 m² avec vue mer, à partager avec un colocataire.',
    priceText: '450 € CC', availabilityText: 'Disponible janvier 2027', publishedAt: '2026-11-06',
  },
  {
    source: 'leboncoin', ref: '2910046377', surface: 11, where: sn('Parc paysager'),
    title: 'Chambre chez l’habitant, quartier Parc paysager',
    description: 'Chambre meublée chez l’habitant avec accès cuisine et salle de bains.',
    priceText: '350 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-10-28',
  },

  // ——— Hors budget (écartées) ———
  {
    source: 'seloger', ref: '232051104', surface: 48, where: sn('Ville-Port'),
    title: 'T2 48 m² neuf avec terrasse, Ville-Port',
    description: 'Résidence neuve : séjour ouvrant sur terrasse, cuisine équipée, chambre, parking en sous-sol.',
    priceText: '790 € CC', availabilityText: 'Disponible le 10/01/2027', publishedAt: '2026-11-12',
  },
  {
    source: 'bienici', ref: 'ag441203-0131', surface: 43, where: sn('Front de mer'),
    title: 'T2 meublé standing 43 m² vue mer',
    description: 'T2 meublé haut de gamme face à la mer, balcon, ascenseur, cave.',
    priceText: '740 € + 60 € de charges', availabilityText: 'Disponible janvier 2027', publishedAt: '2026-11-09',
  },
  {
    source: 'leboncoin', ref: '2911904482', surface: 40, where: sn('Centre-ville'),
    title: 'T2 40 m² centre-ville, chauffage collectif',
    description: 'T2 au 3e étage : séjour, cuisine, chambre. Chauffage et eau chaude collectifs dans les charges.',
    priceText: '680 € + 45 € de charges', availabilityText: 'Disponible le 05/01/2027', publishedAt: '2026-11-05',
  },
  {
    source: 'ouestfrance-immo', ref: '17401187', surface: 32, where: sn('Centre-ville'),
    title: 'Studio 32 m² en résidence hôtelière, services inclus',
    description: 'Studio meublé avec ménage, linge et internet inclus. Bail courte ou longue durée.',
    priceText: '890 € tout compris', availabilityText: 'Libre de suite', publishedAt: '2026-11-02',
  },

  // ——— Trop grand ou maison (écartées) ———
  {
    source: 'agence', ref: 'SH-44600-3166', surface: 62, where: sn('Centre-ville'),
    title: 'T3 62 m² centre-ville, deux chambres',
    description: 'Au 2e étage avec ascenseur : séjour avec terrasse, cuisine aménagée, deux chambres, parking couvert.',
    priceText: '875 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-04',
  },
  {
    source: 'leboncoin', ref: '2908831925', surface: 68, where: sn('Méan-Penhoët'),
    title: 'Maison de ville 2 chambres avec cour, Méan',
    description: 'Maison de ville sur deux niveaux, cour et dépendance. Proche des Chantiers.',
    priceText: '820 € HC', availabilityText: 'Disponible le 01/12/2026', publishedAt: '2026-10-26',
  },
  {
    source: 'seloger', ref: '231977530', surface: 58, where: sn('Les Halles'),
    title: 'T3 58 m² quartier des Halles',
    description: 'T3 traversant : séjour, cuisine séparée, deux chambres, cave.',
    priceText: '695 € CC', availabilityText: 'Disponible le 15/12/2026', publishedAt: '2026-11-01',
  },

  // ——— Trop loin à vélo (écartées) ———
  {
    source: 'leboncoin', ref: '2914119076', surface: 41, where: sn('Saint-Marc-sur-Mer'),
    title: 'T2 41 m² avec terrasse au centre de Saint-Marc',
    description: 'Pièce de vie ouverte sur terrasse privative, cuisine équipée, chambre. Plage de Monsieur Hulot à 300 m.',
    priceText: '497 € CC', availabilityText: 'Disponible le 04/01/2027', publishedAt: '2026-11-07',
  },
  {
    source: 'ouestfrance-immo', ref: '17396602', surface: 26, where: sn('Kerlédé'),
    title: 'Studio 26 m² Kerlédé, proche IUT',
    description: 'Studio avec kitchenette et parking, à 5 minutes en voiture de l’IUT et de l’université.',
    priceText: '440 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-10-30',
  },
  {
    source: 'bienici', ref: 'ag438760-2210', surface: 46, where: sn('L’Immaculée'),
    title: 'T2 46 m² L’Immaculée, résidence récente',
    description: 'T2 avec balcon et parking dans une résidence de 2019, au calme.',
    priceText: '560 € CC', availabilityText: 'Disponible le 12/01/2027', publishedAt: '2026-11-03',
  },
  {
    source: 'seloger', ref: '232008845', surface: 38, where: sn('Sautron'),
    title: 'T2 38 m² Sautron, à 200 m de la plage',
    description: 'T2 au 1er étage : séjour, cuisine aménagée, chambre, cave. Quartier résidentiel.',
    priceText: '610 € CC', availabilityText: 'Disponible le 06/01/2027', publishedAt: '2026-11-08',
  },

  // ——— Autres communes (écartées) ———
  {
    source: 'leboncoin', ref: '2912906631', surface: 16, where: 'Pornichet (44380), Centre',
    title: 'Studio meublé 16 m² à Pornichet, proche centre',
    description: 'Studio meublé proche du centre, des commerces et de la plage. Accès Saint-Nazaire par la voie rapide.',
    priceText: '430 € CC', availabilityText: 'Libre de suite', publishedAt: '2026-11-06',
  },
  {
    source: 'agence', ref: 'SH-44570-0912', surface: 40, where: 'Trignac (44570), Bourg',
    title: 'T2 40 m² à Trignac, proche commerces',
    description: 'T2 en rez-de-chaussée avec jardinet et place de parking.',
    priceText: '520 € CC', availabilityText: 'Disponible le 02/01/2027', publishedAt: '2026-11-11',
  },

  // ——— Doublon : la même annonce publiée sur un second portail ———
  {
    source: 'bienici', ref: 'ag440012-3345', surface: 37, where: sn('Centre-ville'),
    title: 'T2 meublé 37 m² rénové, centre-ville',
    description: 'Appartement meublé rénové : séjour avec cuisine ouverte équipée, chambre avec dressing.',
    priceText: '640 € CC', availabilityText: 'Disponible janvier 2027', publishedAt: '2026-11-09',
  },
];

function toRaw(seed: Seed): RawListing {
  const { surface, where, ...rest } = seed;
  return {
    ...rest,
    surfaceText: `${surface} m²`,
    locationText: where,
    url: SOURCES[seed.source as SourceId].searchUrl,
    isDemo: true,
  };
}

/** Source de démonstration : aucune requête réseau, les annonces sont fournies par ce fichier. */
export const mockSource: ListingSource = {
  id: 'mock',
  label: 'Annonces de démonstration',
  async fetch() {
    return SEEDS.map(toRaw);
  },
};
