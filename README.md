# Saint-Nazaire 2027

Tableau de bord pour trouver un **studio ou un T2 à Saint-Nazaire**, à vélo des **Chantiers de l'Atlantique**, pour un emménagement en **janvier 2027**.

L'application collecte des annonces, écarte automatiquement celles qui sortent des critères, classe le reste par pertinence et permet de suivre chaque démarche, de la première lecture au dossier envoyé.

> Les annonces fournies sont des **exemples réalistes**, pas de vraies offres. Leur lien ouvre la recherche correspondante sur le portail. Voir [Brancher de vraies annonces](#brancher-de-vraies-annonces).

## Critères appliqués

| Critère | Règle |
| --- | --- |
| Type de bien | Studio ou T2. Un T1 est assimilé à un studio. Colocations et chambres chez l'habitant écartées. |
| Loyer | 550 € charges comprises visés, 700 € maximum. Au-delà, l'annonce est écartée. |
| Trajet | 20 minutes à vélo au maximum jusqu'aux Chantiers. |
| Secteur | Centre-ville et front de mer affichés par défaut ; les quartiers voisins restent accessibles d'un clic. |
| Disponibilité | Janvier 2027 ou fin 2026 : compte dans le score, n'écarte pas l'annonce. |

Tous ces seuils se règlent dans [`src/lib/criteria.ts`](src/lib/criteria.ts).

Les loyers sont toujours comparés **charges comprises**. Quand une annonce est « hors charges » sans donner le montant, une provision est estimée (40 € pour un studio, 55 € pour un T2) et signalée comme telle.

## Fonctionnalités

- **Annonces** : cartes ou tableau, avec loyer, surface, type, quartier, temps de trajet à vélo, disponibilité, score et lien.
- **Jauge de loyer** sur chaque annonce : vert jusqu'à 550 €, ambre jusqu'à 700 €, hachures au-delà.
- **Filtres et tris** : recherche libre, type, secteur, loyer maximum, surface minimum, score minimum, étape du suivi ; tri par pertinence, loyer, surface, trajet ou date.
- **Suivi Kanban** : À analyser, Contacté, Visite planifiée, Dossier envoyé, Refusé, Coup de cœur. Glisser-déposer à la souris, liste déroulante au tactile et au clavier.
- **Fiche détaillée** : décomposition du score, notes, date de visite.
- **Ajout manuel** d'une annonce, avec le verdict des critères affiché pendant la saisie.
- **Annonces écartées** consultables avec leur motif, pour vérifier le filtrage.
- **Persistance locale** (`localStorage`) du suivi, des notes, des annonces ajoutées, des filtres et du thème. Export et import du suivi en JSON.
- **Thème clair ou sombre**, interface responsive.

## Démarrer

Node.js 20.9 ou plus récent.

```bash
npm install
npm run dev
```

L'application est servie sur <http://localhost:3000>.

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types et export statique dans `out/` |
| `npm run preview` | Sert le dossier `out/` en local |
| `npm run scrape` | Régénère `src/data/listings.json` |
| `npm test` | Tests du filtrage, du score et du trajet |

## Collecte des annonces

```bash
npm run scrape
```

Le script [`scripts/scrape.ts`](scripts/scrape.ts) enchaîne quatre étapes :

1. **Collecte** auprès de chaque source (voir `scripts/sources/`).
2. **Normalisation** : lecture du prix (« 540 € + 45 € de charges », « 430 € HC »), de la surface, du type, du quartier, de la date de disponibilité, détection des colocations.
3. **Dédoublonnage** d'une même annonce publiée sur deux portails.
4. **Écriture** de `src/data/listings.json` et affichage d'un rapport de filtrage.

Le filtrage lui-même vit dans [`src/lib/evaluate.ts`](src/lib/evaluate.ts). Le tableau de bord l'applique à l'affichage avec les mêmes règles que le script : une annonce ajoutée à la main est donc filtrée et notée comme les autres.

### Brancher de vraies annonces

Deux voies, sans toucher au code :

- **Dans l'application** : « Ajouter une annonce », en collant le lien et les chiffres de l'offre.
- **Par un flux JSON** (fichier ou URL) :

  ```bash
  npm run scrape -- --feed=mes-annonces.json --no-mock
  ```

  ```json
  [
    {
      "ref": "123",
      "url": "https://exemple.fr/annonce/123",
      "title": "T2 38 m² centre-ville",
      "priceText": "560 € CC",
      "surfaceText": "38 m²",
      "locationText": "Saint-Nazaire (44600), Centre-ville",
      "availabilityText": "Disponible le 04/01/2027",
      "publishedAt": "2026-11-14"
    }
  ]
  ```

Pour une autre source (API d'un portail dont vous avez la clé, flux d'agence), écrivez un objet `ListingSource` dans `scripts/sources/` et ajoutez-le dans `buildSources()`.

Aucun robot ne vient aspirer Leboncoin, SeLoger ou Bien'ici : leurs conditions d'utilisation l'interdisent et ils bloquent les requêtes automatisées. Les alertes e-mail de ces portails, recopiées dans l'application ou dans un flux, restent la voie fiable.

## Score de pertinence

| Critère | Points | Barème |
| --- | --- | --- |
| Loyer | 40 | Maximum jusqu'à 550 €, puis dégressif jusqu'à 700 € |
| Trajet à vélo | 25 | Maximum jusqu'à 8 minutes, puis dégressif jusqu'à 20 |
| Secteur | 15 | Centre-ville ou front de mer 15, quartier voisin 8 |
| Disponibilité | 10 | Maximum entre le 1er décembre 2026 et le 31 janvier 2027 |
| Confort | 10 | Surface, charges comprises, meublé, local vélo |

### Estimation du trajet à vélo

Distance à vol d'oiseau jusqu'à l'entrée des Chantiers côté Penhoët, majorée de 30 % pour contourner les bassins du port, parcourue à 15 km/h, plus 2 minutes. Les annonces sont situées au centre de leur quartier, à quelques centaines de mètres près.

C'est un ordre de grandeur pour trier, pas un itinéraire : vérifiez le trajet réel avant de vous engager. Le point d'arrivée et les hypothèses se règlent dans [`src/lib/geo.ts`](src/lib/geo.ts).

## Déploiement

L'application est un site statique, sans serveur ni base de données.

- **Vercel** : importez le dépôt, aucun réglage n'est nécessaire.
- **GitHub Pages** : dans *Settings > Pages*, choisissez la source *GitHub Actions*. Le workflow [`ci.yml`](.github/workflows/ci.yml) publie alors le site à chaque push sur `main`. Sur un compte gratuit, Pages demande un dépôt public.
- **Ailleurs** : `npm run build`, puis servez le dossier `out/`.

À chaque push, le même workflow lance les tests et le build.

## Structure

```text
scripts/
  scrape.ts            Collecte, normalisation, rapport
  sources/             Annonces de démonstration, flux JSON
src/
  app/                 Page, mise en page, styles (Next.js App Router)
  components/          Tableau de bord, cartes, tableau, Kanban, fiche, formulaire
  data/listings.json   Annonces collectées
  lib/                 Critères, quartiers et trajet, normalisation, score, filtres, stockage
tests/                 Tests de la logique
```

## Données personnelles

Le suivi reste dans le navigateur : rien n'est envoyé à un serveur. Utilisez « Exporter le suivi », en bas de page, pour le sauvegarder ou le reprendre sur un autre appareil.
