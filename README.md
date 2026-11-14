# Saint-Nazaire 2027

Tableau de bord pour trouver un **studio ou un T2 à Saint-Nazaire**, à vélo des **Chantiers de l'Atlantique**, pour un emménagement en **janvier 2027**.

Chaque matin, une GitHub Action collecte les annonces de location, écarte celles qui sortent des critères, enregistre le résultat dans `public/listings.json` et republie le site. Le site lit ce fichier à chaque visite.

Site : <https://astiricx.github.io/immo-saint-nazaire-2027/>

## Critères appliqués par la collecte

| Critère | Règle |
| --- | --- |
| Type de bien | Studio ou T2. Un T1 est assimilé à un studio. Colocations, chambres, T3 et plus, maisons, parkings écartés. |
| Loyer | 550 € charges comprises visés, 700 € maximum. Au-delà, l'annonce est écartée. |
| Commune | Saint-Nazaire (44600) uniquement. |
| Trajet | 20 minutes à vélo au maximum jusqu'aux Chantiers, quand l'annonce permet de situer le logement. |
| Disponibilité | Janvier 2027 ou fin 2026 : compte dans le score, n'écarte pas l'annonce. |

Seules les annonces conformes sont publiées. Une annonce qui ne précise ni rue ni quartier est conservée avec la mention « trajet à vérifier » plutôt que d'être écartée à tort.

Les seuils se règlent dans [`src/lib/criteria.ts`](src/lib/criteria.ts).

## Sources

| Source | Fonctionnement | Activation |
| --- | --- | --- |
| Alertes e-mail des portails | Lit, en lecture seule, les e-mails d'alerte de Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, Ouest-France Immo, ParuVendu, LocService et Jinka reçus ces 4 derniers jours. | Secrets `IMAP_USER` et `IMAP_PASSWORD` |
| Sites d'agences | Square Habitat, Foncia, FNAIM, Laforêt : page de résultats Saint-Nazaire, puis chaque fiche. | Active par défaut |
| Flux JSON | Toute adresse qui renvoie un tableau d'annonces au format de [`json-feed.ts`](scripts/sources/json-feed.ts). | Variable `FEED_URLS` |

Le collecteur s'identifie clairement, attend 2 secondes entre deux pages d'un même site, et ne visite que les pages que le fichier `robots.txt` du site autorise. Un site qui refuse est marqué « Accès refusé » dans le bilan, sans contournement.

Leboncoin et SeLoger ne sont pas lus directement : leurs conditions d'utilisation interdisent l'extraction automatique, et ils la bloquent. Leurs **alertes e-mail** sont la voie prévue pour les suivre.

Le bilan de chaque collecte (sources lues, annonces retenues, motifs d'exclusion) est affiché en bas du site et sur la page de l'exécution, dans l'onglet *Actions*.

### Activer les alertes e-mail (recommandé)

1. Sur Leboncoin, SeLoger, Bien'ici ou PAP, lancez une recherche « location, Saint-Nazaire, appartement, 700 € max » et créez une alerte e-mail quotidienne.
2. Créez un mot de passe d'application Gmail : *Compte Google > Sécurité > Validation en deux étapes > Mots de passe des applications*.
3. Dans le dépôt : *Settings > Secrets and variables > Actions > New repository secret*, ajoutez `IMAP_USER` (votre adresse Gmail) et `IMAP_PASSWORD` (le mot de passe d'application).

Pour une autre messagerie, ajoutez aussi `IMAP_HOST`. Le mot de passe reste chiffré dans GitHub et n'apparaît jamais dans les journaux. La boîte est ouverte en lecture seule.

## La GitHub Action

[`.github/workflows/scrape.yml`](.github/workflows/scrape.yml) tourne tous les jours à 7 h 17 UTC (8 h 17 à Saint-Nazaire en hiver) :

1. collecte et filtre les annonces (`npm run collect`) ;
2. enregistre `public/listings.json` dans le dépôt ;
3. appelle [`ci.yml`](.github/workflows/ci.yml), qui teste, construit et publie le site sur GitHub Pages.

Pour lancer une collecte tout de suite : *Actions > Collecte quotidienne des annonces > Run workflow*. Cochez « Détailler chaque page lue » pour voir dans le journal ce que le collecteur trouve sur chaque fiche.

GitHub suspend les tâches planifiées d'un dépôt resté 60 jours sans activité ; les commits quotidiens de la collecte suffisent à l'éviter.

## Fonctionnalités du site

- **Annonces** en cartes ou en tableau : loyer charges comprises, surface, type, quartier, trajet à vélo, disponibilité, score et lien vers l'annonce d'origine.
- **Filtres et tris** : recherche libre, type, secteur, loyer, surface, score, étape du suivi.
- **Suivi Kanban** : À analyser, Contacté, Visite planifiée, Dossier envoyé, Refusé, Coup de cœur, avec notes et date de visite.
- **Ajout manuel** d'une annonce repérée ailleurs, filtrée et notée comme les autres.
- **Persistance locale** (`localStorage`) du suivi et des préférences, export et import en JSON.
- Thème clair ou sombre, interface responsive.

## Commandes

Node.js 20.9 ou plus récent.

| Commande | Effet |
| --- | --- |
| `npm install` | Installe les dépendances |
| `npm run dev` | Serveur de développement sur <http://localhost:3000> |
| `npm run collect` | Collecte réelle, écrit `public/listings.json` |
| `npm run collect -- --debug` | Idem, en détaillant chaque page lue |
| `npm test` | Tests de l'extraction, du filtrage et du score |
| `npm run build` | Vérification des types et export statique dans `out/` |

## Score de pertinence

| Critère | Points | Barème |
| --- | --- | --- |
| Loyer | 40 | Maximum jusqu'à 550 €, puis dégressif jusqu'à 700 € |
| Trajet à vélo | 25 | Maximum jusqu'à 8 minutes, dégressif jusqu'à 20 ; 10 points si l'adresse n'est pas précisée |
| Secteur | 15 | Centre-ville ou front de mer 15, quartier voisin 8, non précisé 5 |
| Disponibilité | 10 | Maximum entre le 1er décembre 2026 et le 31 janvier 2027 |
| Confort | 10 | Surface, charges comprises, meublé, local vélo |

Quand une annonce donne une rue, elle est géocodée par le service public de la Géoplateforme (IGN). Le trajet est estimé à partir de la distance à vol d'oiseau jusqu'à l'entrée des Chantiers côté Penhoët, majorée de 30 % pour contourner les bassins, à 15 km/h, plus 2 minutes. C'est un ordre de grandeur pour trier : vérifiez l'itinéraire réel.

## Structure

```text
.github/workflows/
  scrape.yml           Collecte quotidienne, commit, publication
  ci.yml               Tests, build, déploiement GitHub Pages
public/listings.json   Annonces retenues par la dernière collecte
scripts/
  collect.ts           Orchestration de la collecte
  lib/                 robots.txt, requêtes, extraction HTML, géocodage
  sources/             Alertes e-mail, sites d'agences, flux JSON
src/
  app/                 Page et styles (Next.js, export statique)
  components/          Tableau de bord, cartes, tableau, Kanban, fiche
  lib/                 Critères, normalisation, score, filtres, stockage
tests/                 Tests sans réseau
```

## Données personnelles

Le suivi (étapes, notes, annonces ajoutées) reste dans votre navigateur. `public/listings.json` ne contient que les annonces publiques collectées, jamais vos e-mails.
