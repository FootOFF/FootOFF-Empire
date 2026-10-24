# FootOFF Empire : consignes pour Claude

Jeu de gestion de club de football dans le navigateur : React 18, Vite 5, Three.js. L'utilisateur joue sur PC (puce
AMD intégrée, écran à 200 %) et sur iPhone, souvent à distance, depuis son téléphone.

## Langue et échanges
- Tout ce que l'utilisateur lit est en français : réponses, étapes, récapitulatifs, textes du jeu, messages de commit.
- Il aime les questions à choix multiples. Quand il demande seulement un rapport, des idées ou une proposition, on ne
  modifie pas le jeu.
- Il fixe souvent une heure limite : la respecter, publier au fil de l'eau, finir par un rapport des nouveautés.

## Publication
- Chaque changement terminé et vérifié est publié sans redemander : commit sur `main` puis push. GitHub Actions déploie
  sur https://footoff.github.io/FootOFF-Empire/ (version finale prévue sur footoff.media).
- Vérifier `git diff --cached --stat` avant chaque commit. Messages de commit en français, terminés par la ligne
  d'attribution de Claude.
- Après un déploiement, le jeu propose lui-même « Nouvelle version » (service worker) ; si le bandeau ne vient pas,
  fermer puis rouvrir l'app sur iPhone.

## Règles du jeu et de l'interface
- Jamais de fenêtre du navigateur (`alert`, `confirm`) : toute confirmation passe par la fenêtre du jeu (`ConfirmDialog`).
- Aucun nom de vrai footballeur ; les clubs et les lieux sont imaginaires.
- Les pourcentages et les chances affichés sont exacts : ce sont ceux qui décident le tirage.
- Rien du système : aucune barre de défilement, aucune sélection de texte (sauf dans les champs de saisie). Une
  notification mène à l'élément exact.
- Une rangée qui défile en largeur ne défile jamais en hauteur.
- Verre liquide seulement dans le menu du bas.
- La fluidité d'abord, sur la puce intégrée comme sur l'iPhone : rendu unique, sans réglage de qualité, pleine
  résolution de l'écran.
- Les joueurs 3D sont simples (low-poly) : ne jamais les filmer de près ni de dos.
- Ne jamais toucher au logo FootOFF Empire d'origine (`FootOFFLockup` de `src/ui/brand.jsx` et sa copie dans
  `index.html`) : c'est lui, tel quel, sur l'écran de chargement et l'écran titre.
- Jamais de suppression de données d'une partie à l'insu du joueur. « Nouvelle partie » reste proposée sur une
  sauvegarde existante (écran titre et pause), après la fenêtre de confirmation du jeu qui prévient que la partie en
  cours sera effacée.
- Pas de téléchargement de fichier sans l'accord de l'utilisateur.

## Où trouver quoi
- `docs/DESIGN.md` : règles de l'interface et de chaque écran (à mettre à jour avec chaque changement). Voir aussi
  `docs/ECONOMIE.md` et `docs/JOUEURS.md`.
- `src/game/` : logique du jeu, sans interface. `src/ui/` : écrans React. `src/three/` : 3D.
- Galerie d'écrans pour vérifier une interface sans jouer : `/?ecran=<nom>` (liste dans `src/ui/preview.js`).
- Les outils de contrôle (`tmp/ph3/textcheck.html`, `hudcheck.html`, `scrollcheck.html`, `simcheck.js`…) ne sont pas
  dans le dépôt (`tmp/` est ignoré) : ils n'existent que sur le PC de l'utilisateur. Dans une session cloud, vérifier au
  minimum avec `npx vite build`, et dire ce qui n'a pas pu être vérifié (3D, rendu sur téléphone).
- Dans le dépôt : `node tools/sim/career.mjs 30 8` (carrières jouées par un président automatique : rythme des montées,
  titres, trésorerie, salaires, réputation, marché ; `--detail` pour la première carrière saison par saison). À lancer
  après tout changement d'équilibre (économie, joueurs, adversaires). La galerie se capture sans tête avec Playwright
  (`npx vite preview`, puis `chromium` sur `/?ecran=<nom>`).
- Les modèles 3D des bâtiments viennent de scripts Blender (`tools/blender/models/`), que seul le PC peut lancer.
