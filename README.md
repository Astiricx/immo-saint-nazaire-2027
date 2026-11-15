# Saint-Nazaire 2027

Tableau de bord pour trouver un **logement meublé à Saint-Nazaire** (T2, T3, T4 ou maison), à vélo des **Chantiers de l'Atlantique**, pour un emménagement en **janvier 2027**.

Chaque matin, une GitHub Action collecte les annonces de location (grands portails, agences, alertes e-mail), écarte celles qui sortent des critères, publie le résultat **chiffré** dans `public/listings.enc.json` et republie le site. Le site déchiffre ce fichier avec votre phrase secrète.

Site : <https://astiricx.github.io/immo-saint-nazaire-2027/>

## Critères appliqués par la collecte

| Critère | Règle |
| --- | --- |
| Type de bien | **T2, T3, T4 et plus, maisons.** Colocations, chambres, parkings et locaux écartés. Un studio n'est écarté que s'il fait moins de 25 m². |
| Surface | **25 m² minimum**, pour tous les types de bien. |
| Meublé | **Impératif.** Toute annonce qui n'est pas clairement meublée est écartée : « non meublé » ou « vide », mais aussi une annonce muette sur ce point. |
| Loyer | **600 € net maximum** : loyer charges comprises − aide au logement estimée ≤ 600 €. Le loyer affiché peut donc dépasser 600 € (jusqu'à 760 € environ pour un T2) si l'aide le ramène en dessous. Budget idéal : 500 € net. |
| Commune | Saint-Nazaire (44600) uniquement. |
| Secteurs | Centre-ville, front de mer prolongé par la piste cyclable du littoral (Villès-Martin, Kerlédé, Rocher du Lion) et Parc paysager : meilleure note de secteur. |
| Trajet | 30 minutes à vélo au maximum jusqu'aux Chantiers, quand l'annonce permet de situer le logement : jusqu'un peu après le Rocher du Lion par le front de mer. |
| Disponibilité | Janvier 2027 ou fin 2026 : compte dans le score, n'écarte pas l'annonce. |

Seules les annonces conformes sont publiées. Une annonce qui ne précise ni rue ni quartier est conservée avec la mention « trajet à vérifier » plutôt que d'être écartée à tort.

Les seuils se règlent dans [`src/lib/criteria.ts`](src/lib/criteria.ts).

## Sources

| Source | Fonctionnement | Activation |
| --- | --- | --- |
| Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, ParuVendu | Via des Actors [Apify](https://apify.com), qui passent les protections anti-robots avec des proxys résidentiels français. Payé au résultat. | Secrets `APIFY_TOKEN` **et** `LISTINGS_PASSPHRASE` |
| Alertes e-mail des portails | Lit, en lecture seule, les alertes de Leboncoin, SeLoger, Bien'ici, PAP, Logic-Immo, Ouest-France Immo, ParuVendu, LocService et Jinka reçues ces 4 derniers jours. | Secrets `IMAP_USER` et `IMAP_PASSWORD` |
| Sites d'agences, LocService, Ouest-France Immo | Square Habitat, Foncia, FNAIM, LocService, Laforêt, Ouest-France Immo : pages de résultats Saint-Nazaire, puis chaque fiche, en respectant `robots.txt`. Les biens marqués « Loué » sur LocService sont ignorés. | Active par défaut |
| Flux JSON | Toute adresse qui renvoie un tableau d'annonces au format de [`json-feed.ts`](scripts/sources/json-feed.ts). | Variable `FEED_URLS` |

Le bilan de chaque collecte (sources lues, annonces retenues, motifs d'exclusion, y compris par source) est affiché en bas du site et sur la page de l'exécution, dans l'onglet *Actions*.

### Activer les grands portails

1. **Phrase secrète.** Choisissez une longue phrase (5 mots ou plus). Dans le dépôt : *Settings > Secrets and variables > Actions > New repository secret*, nom `LISTINGS_PASSPHRASE`. Gardez-la : le site vous la demandera une fois par appareil.
2. **Compte Apify.** Créez un compte gratuit sur <https://console.apify.com/sign-up> (sans carte bancaire), puis copiez votre jeton dans *Settings > API & Integrations*.
3. **Jeton.** Ajoutez le secret `APIFY_TOKEN` de la même façon.
4. Lancez la collecte : *Actions > Collecte quotidienne des annonces > Run workflow*.

Aucune limite de volume : chaque portail renvoie toutes les annonces de la recherche (Saint-Nazaire, maisons et appartements, 25 m² minimum, meublé quand le portail le permet, loyer affiché jusqu'à 800 €, soit le plafond net plus l'aide maximale). Les Actors sont payés au résultat, de un à quelques dollars pour mille annonces, plus le trafic des proxys résidentiels. Votre consommation est visible dans la console Apify.

Chaque portail a plusieurs Actors candidats, listés dans [`scripts/sources/apify.ts`](scripts/sources/apify.ts) et essayés dans l'ordre : le premier qui renvoie des annonces exploitables est retenu, et le bilan de la collecte indique lequel. Ces Actors sont publiés par des tiers et peuvent disparaître : ajoutez-en un à la liste (`actorId` et `input`) si besoin. La conversion des résultats accepte les noms de champs courants.

### Pourquoi les annonces sont chiffrées

Un site GitHub Pages est public, même si le dépôt est privé. Les conditions d'utilisation de Leboncoin interdisent les robots, et republier publiquement des annonces extraites de Leboncoin ou SeLoger a valu à Jinka une condamnation en appel en avril 2026. Ici, les annonces restent lisibles par vous seul :

- `public/listings.enc.json` est chiffré (AES-256-GCM, clé dérivée de la phrase secrète par PBKDF2) ;
- aucune version en clair n'est jamais enregistrée dans le dépôt ;
- les journaux de l'Action, publics sur un dépôt public, ne contiennent que des comptes et des noms de champs.

Sans le secret `LISTINGS_PASSPHRASE`, les portails restent désactivés et le site publie en clair les seules annonces des agences, des alertes et des flux.

Ce dispositif réduit le risque, il ne le supprime pas : la collecte automatisée de Leboncoin reste contraire à ses conditions d'utilisation. C'est votre choix, pour votre recherche personnelle.

### Activer les alertes e-mail

1. Sur les portails, lancez une recherche « location, Saint-Nazaire, meublé, 800 € max » et créez une alerte e-mail quotidienne.
2. Créez un mot de passe d'application Gmail : *Compte Google > Sécurité > Validation en deux étapes > Mots de passe des applications*.
3. Ajoutez les secrets `IMAP_USER` (votre adresse Gmail) et `IMAP_PASSWORD` (le mot de passe d'application). Pour une autre messagerie, ajoutez aussi `IMAP_HOST`.

La boîte est ouverte en lecture seule. Les liens de suivi des e-mails sont remplacés par l'adresse neutre de l'annonce.

## La GitHub Action

[`.github/workflows/scrape.yml`](.github/workflows/scrape.yml) tourne tous les jours à 7 h 17 UTC (8 h 17 à Saint-Nazaire en hiver) :

1. collecte et filtre les annonces (`npm run collect`) ;
2. enregistre `public/listings.enc.json` (ou `public/listings.json` sans phrase secrète) dans le dépôt ;
3. appelle [`ci.yml`](.github/workflows/ci.yml), qui teste, construit et publie le site sur GitHub Pages.

Pour lancer une collecte tout de suite : *Actions > Collecte quotidienne des annonces > Run workflow*. L'option « Détailler chaque page lue » ajoute au journal des comptes par page et, pour Apify, les noms de champs reçus ; le contenu des annonces n'y figure qu'en l'absence de phrase secrète.

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
| `npm run collect` | Collecte réelle, écrit `public/listings.enc.json` ou `public/listings.json` |
| `npm run collect -- --debug` | Idem, en détaillant chaque page lue |
| `npm test` | Tests de l'extraction, du filtrage et du score |
| `npm run build` | Vérification des types et export statique dans `out/` |

## Aide au logement et loyer net

Chaque annonce affiche, en plus du loyer charges comprises, le **loyer net estimé après APL** : ce qui reste à payer chaque mois une fois l'aide au logement déduite. La fiche détaille le calcul.

L'estimation applique le barème officiel des aides personnelles au logement (APL et ALS, même formule), en vigueur au 1er octobre 2026, pour un locataire seul :

- **Ressources :** pour un étudiant, la CAF ne retient pas les revenus réels mais un forfait annuel, même sans aucun revenu : 8 600 € pour un non-boursier, 6 900 € pour un boursier.
- **Zone :** zone 3 par défaut. L'agglomération de Saint-Nazaire dépasse 100 000 habitants, ce qui correspond normalement à la zone 2. La zone 3 est le choix prudent : environ 17 € d'aide en moins par mois.
- **Résultat :** environ 186 € par mois en zone 3 (203 € en zone 2), quasi identique pour toutes les annonces. Le loyer retenu par la CAF est plafonné à 275 € hors charges (personne seule, quel que soit le nombre de pièces). Au-delà de 688 € hors charges, l'aide diminue, puis s'annule vers 850 € hors charges : c'est pourquoi le plafond de 600 € net correspond à environ 760 € charges comprises.

Le profil (zone, boursier, ressources) se règle dans `housingAid`, dans [`src/lib/criteria.ts`](src/lib/criteria.ts), et le barème dans [`src/lib/apl.ts`](src/lib/apl.ts). C'est une estimation : seule la CAF fixe le droit, sur son simulateur. Depuis le 1er juillet 2026, certains étudiants étrangers non boursiers n'y ont plus droit.

## Score de pertinence

| Critère | Points | Barème |
| --- | --- | --- |
| Loyer net | 40 | Loyer après aide au logement estimée : 40 points jusqu'à 300 €, 32 au budget idéal de 500 €, puis dégressif jusqu'à 8 à 600 € |
| Trajet à vélo | 25 | Maximum jusqu'à 8 minutes, dégressif jusqu'à 30 ; 10 points si l'adresse n'est pas précisée |
| Secteur | 15 | Centre-ville, front de mer jusqu'au Rocher du Lion ou Parc paysager 15, quartier voisin 8, non précisé 5 |
| Disponibilité | 10 | Maximum entre le 1er décembre 2026 et le 31 janvier 2027 |
| Confort | 10 | Surface, charges comprises, meublé, local vélo |

Quand une annonce donne une rue, elle est géocodée par le service public de la Géoplateforme (IGN). Le trajet est estimé à partir de la distance à vol d'oiseau jusqu'à l'entrée des Chantiers côté Penhoët, majorée de 30 % pour contourner les bassins, à 16 km/h (piste cyclable plate et continue), plus 2 minutes. C'est un ordre de grandeur pour trier : vérifiez l'itinéraire réel.

## Structure

```text
.github/workflows/
  scrape.yml           Collecte quotidienne, commit, publication
  ci.yml               Tests, build, déploiement GitHub Pages
public/listings.enc.json  Annonces retenues, chiffrées
scripts/
  collect.ts           Orchestration de la collecte
  lib/                 robots.txt, requêtes, extraction HTML, géocodage
  sources/             Portails via Apify, alertes e-mail, sites d'agences, flux JSON
src/
  app/                 Page et styles (Next.js, export statique)
  components/          Tableau de bord, cartes, tableau, Kanban, fiche
  lib/                 Critères, normalisation, score, filtres, stockage
tests/                 Tests sans réseau
```

## Données personnelles

Le suivi (étapes, notes, annonces ajoutées) reste dans votre navigateur, comme la phrase secrète si vous cochez « Se souvenir sur cet appareil ». Le fichier publié ne contient que les annonces collectées, jamais vos e-mails.
