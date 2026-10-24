# Guide de style de l'interface

Charte FootOFF Media : noir #090909, or #C7A15A (dégradé #B9924C → #DEC17F), blanc cassé #F3F2EE, gris #8B8B8B.
Titres en Geist, libellés en Geist Mono (capitales espacées), texte en Inter. Tous les jetons sont dans
`:root` (`src/styles.css`) ; les briques React dans `src/ui/kit.jsx`.

## Grille

| Jeton | Valeur | Usage |
|---|---|---|
| `--t-xs` | 11 px | libellés, métadonnées (minimum : rien en dessous) |
| `--t-sm` | 13 px | texte secondaire, boutons compacts |
| `--t-md` | 15 px | texte courant, noms |
| `--t-lg` | 18 px | sous-titres, valeurs de tuiles |
| `--t-xl` | 24 px | titres de panneau |
| `--t-2xl` | 32 px | grands chiffres |
| `--t-3xl` | 40 px | score, note vedette |
| `--r-sm` / `--r-md` / `--r-lg` | 12 / 16 / 22 px | tuiles et champs / cartes / panneaux |
| espacements | multiples de 4 px | `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-6` 24 · `--s-8` 32 |
| marge d'écran | `--gap` (16 px, 10 px sur mobile) | distance aux bords pour tout élément du HUD |

Seuls les chiffres « d'affichage » des écrans cinématiques (classement de fin de saison) dépassent l'échelle.

## Règles d'alignement

- Un écran = un axe. Un score se pose sur une grille à 3 colonnes `1fr auto 1fr` (équipe à droite, score au
  centre, équipe à gauche) pour que le score soit au centre exact, quelle que soit la longueur des noms.
- Une information n'apparaît qu'une fois à l'écran (pas de score en double).
- Libellé au-dessus, valeur en dessous ; les valeurs numériques en chiffres tabulaires.
- Un seul bouton principal (doré) par écran ; les autres en contour (`.btn.ghost`) ou en lien (`.linkbtn`).
- Mobile : zones tactiles de 44 px minimum, panneaux en plein écran ou en feuille basse.
- Peu de cadres : un cadre pour un vrai bloc, de simples filets fins ailleurs (fiche joueur, comparateur).
- Capitales espacées (Geist Mono) réservées aux titres de section et sur-titres ; les petits libellés (tuiles,
  statistiques, lignes de confirmation, puces de filtre) sont en texte normal discret.
- Dans une rangée de cases, les montants tombent au même niveau : libellés courts, et valeurs calées en bas de la
  case quand un libellé passe sur deux lignes (bilan de saison) ; une dernière rangée incomplète se centre, avec des
  cases de même largeur que les autres.
- Un score posé entre deux écussons se centre sur eux : c'est l'encre des chiffres qui compte, pas la boîte de ligne
  (après-match : même retrait et même hauteur que les écussons, chiffres descendus de 2 % de leur taille).
- Un nom trop long passe sur deux lignes équilibrées (`text-wrap: balance`), jamais coupé par « … » : carte du
  prochain match, tableau d'affichage, calendrier, dernier match, mercato, menu pause ; la barre du téléphone le
  passe en plus petit sur deux lignes s'il ne tient pas.
- Des tableaux qui se suivent partagent leur grille : gardiens et joueurs de champ de l'Effectif ont les mêmes
  colonnes (cases vides pour les caractéristiques que les gardiens n'ont pas).
- Un repère ne se sépare pas de son numéro (Saison 3, journée 2, niveau 4), ni une unité de son nombre, et un
  séparateur « · » termine une ligne sans jamais ouvrir la suivante (`src/ui/typography.js`) ; « 53 % » toujours
  avec son espace fine.
- Consignes neutres, valables à la souris, au doigt et à la manette : « Choisis un joueur… » plutôt que « Touche… ».
- Une seule façon d'afficher chaque échelle : niveau sur 20 en grand chiffre (doré s'il est fort pour la
  division), note de match sur 10 en pastille (vert, neutre, rouge). Une légende dès qu'une couleur a un sens.
- Classes tirées des données du jeu toujours préfixées (`ev-side-home`, `ev-out-post`…) : un nom nu peut tomber
  sur celui d'un écran (« post », tir sur le poteau, prenait les styles de l'écran d'après-match `.post`).
- Un préfixe de classes par écran, jamais partagé : `pm-` avant-match, `pz-` menu pause, `ts-` écran titre, `ld-`
  chargement, `cm-` menus façon console. Le menu pause avait repris `.pm-side` de l'avant-match : sa règle « masqué
  sur téléphone » cachait la colonne du coup d'envoi, et les matchs ne se lançaient plus sur téléphone.
- L'action principale d'un écran qui défile reste visible, avec ce qui aide à la décider : le pronostic et le coup
  d'envoi sont collés ensemble au bas de l'écran pendant que l'avant-match défile (sur téléphone, sur toute la
  largeur).
- Icônes dessinées uniquement (jamais ‹ › ou ⬠ en caractères) ; « Comparer » = bouton rond avec l'icône radar.

## Zones du HUD

| Zone | Contenu | Règle |
|---|---|---|
| Haut gauche | identité du club | largeur `--rail-w` (320 px), hauteur 56 px |
| Haut droite | trésorerie, réputation, menu | pastilles de 40 px |
| Colonne de gauche | objectif ou tutoriel | même largeur que la carte du club, 12 px entre les cartes |
| Droite | Construire, conseil du staff, outils de vue (heure, jour de match, recentrer) | centrés verticalement ; sur mobile en haut à droite, Construire et staff visibles, la vue derrière un bouton |
| Bas | dock centré + carte de match à droite | même hauteur (`--bar-h`, 68 px) et même ligne de base ; sous 1240 px le dock se cale à gauche |

- La 3D occupe tout l'écran. `--hb` réserve la place du badge imposé par l'hébergeur de test (0 sur footoff.media) :
  seuls les éléments posés en bas l'utilisent (`--hud-bottom`).
- Mobile (≤ 760 px) : barre du haut (écusson et nom du club, ressources), objectif replié, puis en bas, de haut en bas :
  carte de match, dock. Jamais plus de six éléments à l'écran.
- Conseil du staff (`SceneTools`, `src/ui/hud.jsx`) : un bouton à bulle de parole dans la colonne d'outils, présent
  tant que le staff a un conseil, avec un point doré (rouge pour une alerte) tant qu'il n'est pas lu. Un conseil
  nouveau s'annonce 7 s dans une bulle opaque à gauche de la colonne (en haut sur téléphone), puis se range ; un appui
  sur le bouton la rouvre, un appui ailleurs la range ; « Masquer ce conseil » l'écarte pour la session. Plus de
  bandeau en bas de l'écran (choix de l'utilisateur, 2026-10-24 : il « dérangeait »).
- Un contrôle automatique (galerie) vérifie qu'aucun élément ne se chevauche ni ne sort de l'écran à
  1440, 1280, 1000, 800 et 375 px.

## Briques (`src/ui/kit.jsx`)

- `Eyebrow` : libellé en capitales.
- `SectionHead` : libellé de section + complément aligné à droite.
- `Stat` : tuile libellé / valeur / précision.
- `VersusBar` : comparaison club / adversaire (possession, tirs…).
- `RatingBadge` : note de match sur 10 (vert ≥ 7,5, rouge < 5,5, neutre sinon ; or seulement pour l’homme du match). L’or désigne le niveau sur 20.
- Icônes des temps forts : `IconBall`, `IconAssist`, `IconSwap`, `IconWhistle`, `IconStar`, `Card` (jamais d'emoji).
- Boutons : `.btn` (principal), `.btn.ghost` (secondaire), `.linkbtn` (tertiaire), `.chipbtn` (filtre/action
  légère) ; tailles `.btn-sm`, normale, `.btn-xl`.

## Panneaux (`src/ui/panels.jsx`)

- `Panel` : un seul modèle pour l'Effectif (`size="lg"`), la Saison et le Journal. En-tête (sur-titre sur une
  ligne, titre, trésorerie seulement quand on y dépense, fermeture), barre d'outils fixe, corps qui défile.
  Glisse depuis la droite sur PC, plein écran sur téléphone. Fond opaque (pas de flou imbriqué).
- Puces de filtre : toujours sur une ligne ; sur téléphone elles se resserrent et défilent en secours.
- Inspecteur de parcelle : même famille (en-tête séparé, corps), largeur de la colonne de gauche sur PC,
  feuille basse opaque avec poignée sur téléphone.
- Saison (grand écran sur PC depuis le 2026-10-23, le HUD s'efface) : onglets Calendrier (ouvert d'emblée) et
  Classement dans la barre fixe, à droite des quatre repères (position, points, différence, ambition) ; sur
  téléphone, ces repères tiennent sur une ligne, sans leur précision.
  - Calendrier (`src/ui/calendar.jsx`, dates calculées par `seasonFixtures` dans `src/game/fixtures.js`), en trois
    parties. Championnat en or, Coupe nationale en argent, Coupe d'Europe en bleu, partout.
    1. La frise : toutes les dates dans l'ordre où elles se jouent, une case par date (liseré de la compétition en
       tête, trophée ou étoile pour les coupes, écusson de l'adversaire, « J3 » ou le tour, score coloré V / N / D ou
       point doré du prochain match ; « ? » pour un tour à tirer, « — » pour un tour non disputé), barre de
       progression de la saison au-dessus. La date choisie se lève, soulignée ; le prochain match respire en or. Sur
       PC les cases remplissent la largeur (quinze dates avec la Coupe d'Europe) ; sur téléphone la frise défile et
       garde la date choisie au centre. Clavier et manette : flèches, début, fin (le focus suit).
    2. L'affiche de la date choisie, dessinée comme le terrain vu du dessus : bandes de tonte, ligne médiane, rond
       central ; notre moitié dorée, celle de l'adversaire à la couleur de son maillot (`kitOf`). Écussons en grand,
       noms (jamais coupés), niveaux, rang et points de l'adversaire ; écussons et score toujours sur la même ligne en championnat (sa division en coupe) ; au
       centre le score ou « VS », et l'état (Prochain match, Victoire, Qualifié, Éliminé, Tirage au sort, Non
       disputé). Prochain match : pronostic exact du moteur avec le onze actuel (le même que l'avant-match),
       qualification en coupe, rapport de force, affluence et recette attendues, billets, prime de coupe, « Jouer le
       match ». Match joué : buteurs, homme du match, affluence, recette, dispositif, billets, « Voir le Stats Pass ».
       Un geste vers la gauche ou la droite sur l'affiche change de date (téléphone).
    3. Le bilan (colonne de droite sur PC, dessous au téléphone) : victoires, nuls, défaites et leur barre, buts ;
       forme des cinq derniers matchs ; les sept journées du championnat avec la place et l'enjeu ; le parcours de
       chaque coupe tour par tour. Chaque élément choisit sa date dans la frise.
  - Classement : sur deux colonnes en grand écran (le tableau et sa légende ; les coupes, le dernier match, les
    trophées et les classements passés). Zones colorées avec leur légende sous le tableau. Montée (2 premiers, or)
    hors Elite ; Coupe d'Europe des clubs (2 premiers de l'Elite, bleu) ; descente (2 derniers, rouge). Hors Elite, la
    légende rappelle que l'Europe se gagne en Elite.
  - Aperçus : `?ecran=saison`, `saison-joue`, `saison-coupe`, `saison-fin`, `calendrier-europe`, `classement`,
    `europe`.
- Réglages (écran titre et menu pause, voir plus bas) : Son et Vibrations en interrupteurs. Plus de qualité graphique
  depuis le 2026-10-23 : un seul rendu pour tous, celui de l'ancienne qualité Économie, jugée la plus belle et la plus
  nette (voir Fluidité) ; l'image est calculée à la pleine résolution de l'écran (un pixel calculé par pixel physique),
  téléphone compris, au repos comme en mouvement. Sur un écran peu haut, la liste des réglages défile sous son titre,
  l'entrée choisie toujours visible.

## Notifications, infobulles, portraits, raccourcis

- Notifications (`src/ui/notify.jsx`, classes `nt-`) : un seul bandeau à la fois, qui descend du haut puis repart
  (au centre sur la ligne de la barre du haut à partir de 1100 px, juste dessous en dessous de 1100 px, par-dessus
  la barre sur téléphone, comme une notification du système). File d'attente : rien pendant l'avant-match, le
  direct, l'après-match, un bilan, le menu pause ou une confirmation (le bandeau en cours s'efface et reviendra
  en entier) ; seul un avertissement qui répond à un geste du joueur passe devant. Plusieurs succès d'un coup :
  un seul bandeau (« 3 succès débloqués »). Types : succès (médaille dorée qui surgit, reflet, trois notes qui
  montent), complexe, mercato, réussite, information, avertissement. Un filet doré montre le temps restant ;
  survol ou doigt posé : il reste ; geste vers le haut : il part ; flèche à droite : un clic ouvre ce qu'il
  annonce, à l'endroit exact : un succès → salle des trophées, onglet Succès, la liste déjà centrée sur lui, liseré
  doré qui palpite et pastille « Nouveau » ; des offres reçues → Mercato, vue Offres ; des joueurs suivis partis
  ailleurs → Mercato, vue Suivis. Aperçu : `?ecran=notification`.
- Infobulles (`src/ui/tips.jsx`) : à la souris seulement, tout `title` devient une bulle du jeu après 280 ms, au-dessus
  de l'élément (dessous près du haut de l'écran), toujours dans l'écran ; jamais l'infobulle du navigateur. Les
  en-têtes du tableau de l'effectif donnent le nom complet de la caractéristique (« Finition · trier ») ; le tri
  se montre par une flèche dessinée.
- Portraits des joueurs (`src/ui/portrait.jsx`) : dessinés, toujours les mêmes pour un même joueur (teint, visage,
  coiffure, cheveux qui grisonnent avec l'âge, barbe), buste au maillot de son club (notre or, l'anthracite de nos
  gardiens, les couleurs du club adverse, un haut d'entraînement pour un joueur libre), liseré doré pour nos
  joueurs. Tableau et cartes de l'effectif (poste en pastille sur le portrait au téléphone), fiche joueur, cartes du
  mercato (médaille de niveau posée sur le portrait), homme du match, classements des Stats.
- Raccourcis clavier (PC) : 1 à 5 ouvrent les sections du menu du bas (une seconde fois : retour à l'Empire), J lance
  le match (ou le bilan) ; touches physiques (AZERTY compris), jamais pendant une saisie, un menu ou un match. La
  touche s'affiche au survol du menu ou du bouton Jouer.
- Sons d'interface (`src/ui/uisound.js`, joués par l'ambiance du stade) : onglet (clic très bref), panneau ou fiche
  qui s'ouvre (souffle qui monte) ou se ferme (qui descend), notification, succès, geste refusé ; discrets, coupés
  avec le son.
- Panneaux : leurs blocs arrivent l'un après l'autre (40 ms d'écart, 200 ms au plus) à l'ouverture et à chaque
  changement d'onglet. Effectif, Stats et salle des trophées, plus larges, effacent tout le HUD ; Saison, Journal et
  Finances gardent le menu du bas, recentré dans l'espace libre.
- Fiche de parcelle (PC) : toujours sous la carte du club, corps qui défile (le titre de la fiche du stade sortait
  de l'écran en 810 px de haut) ; elle efface l'objectif et le conseil du staff. Options de construction sur deux
  lignes : icône, nom et prix, puis l'effet et la rentabilité sur toute la largeur.

## Finitions

- Sorties : tout ce qui s'ouvre passe par `<Presence>` (`src/ui/presence.jsx`) et s'efface en 200 ms dans le
  sens inverse de son entrée (panneau vers la droite, carte vers le bas, fenêtre en se resserrant). Les raccourcis
  clavier d'une fenêtre passent par `useKeydown` : ils se coupent dès qu'elle sort. Mouvement réduit respecté.
- Focus : anneau doré au clavier uniquement ; une fenêtre reçoit le focus à l'ouverture et le rend au bouton
  d'origine à la fermeture (`useDialogFocus`).
- Survol : seulement avec une souris (`@media (hover: hover)`) ; appui : léger enfoncement partout.
- Toucher : sur écran tactile, chaque commande se touche sur 44 × 44 px au moins (zone invisible `::after`).
- Gestes (`src/ui/gestures.js`) : sur téléphone, panneaux, confirmation, inspecteur et fiche se ferment en
  glissant vers le bas (poignée visible) ; la fiche passe au joueur suivant ou précédent en glissant à gauche ou
  à droite. Le défilement reste prioritaire. L'action principale (Améliorer, Signer, Vendre) reste collée en bas ;
  la confirmation devient une feuille qui monte du bas.
- Vibrations (`src/ui/haptics.js`) : but marqué, vente, dépense, construction ; désactivables dans les réglages
  (indisponibles sur iPhone, Safari ne les permet pas).
- Défilement (`src/ui/scrollcue.js`) : aucune barre de défilement, nulle part (PC, téléphone, tablette ; choix de
  l'utilisateur, « plus esthétique sans »). Une zone qui défile s'estompe sur le bord où il reste du contenu
  (`data-fade`, liste des zones dans `scrollcue.js` : jamais une zone à pied collé, qui s'estomperait avec) ;
  arrivée au bout, elle n'entraîne plus la page (pas de rebond de la page). Une rangée qui défile en largeur
  (puces, frise de la saison) ne défile jamais en hauteur (`overflow-y: hidden`) et, sur écran tactile, garde la
  place des zones `::after` de ses boutons (retrait et marge de 9 px) : sinon elle glisse au doigt et coupe ses
  puces. Contrôle de tous les écrans : `tmp/ph3/scrollcheck.html`.
- Sélection : rien ne se sélectionne dans le jeu, quel que soit le geste (appui long, double toucher, « Tout
  sélectionner » d'iOS) : CSS `user-select: none` jusqu'à `html`, et `main.jsx` annule toute sélection hors des
  champs de saisie (la bulle « Copier / Traduire » n'apparaît jamais) ; pas de menu contextuel.
- Typographie : le code écrit des espaces ordinaires ; `src/ui/typography.js` pose à l'affichage les insécables
  (avant `: ; ! ?`, dans les guillemets, entre un nombre et son unité), l'apostrophe ’ et les points de
  suspension. Ordinaux avec `ordinal()` : 1er, 1re, 2e.
- Chargement : voir « Écran titre, pause et chargement ».

## Contrôle

La galerie (`?galerie` dans l'adresse du jeu) affiche chaque écran avec des données fictives, sur téléphone
(390 × 844) et sur PC (1280 × 720), sans toucher à la sauvegarde. Chaque modification d'interface se relit là.

## Sélection en verre liquide

Réservée au menu du bas (`src/ui/glass.jsx`, `useGlass`) : la pastille glisse vers la section choisie en
s'étirant, et on peut la faire glisser au doigt (elle reste sous le doigt) ; la section s'ouvre au relâché.
Position par `translate`, étirement par `scale` : deux propriétés distinctes, sinon l'animation d'étirement coupe
le glissement et la loupe du doigt décale la pastille.

## Écran titre, pause et chargement

Façon jeu de console : un seul chargement au démarrage, puis l'écran titre devant le complexe en 3D, puis le jeu.

- Chargement (`index.html` puis `src/ui/loading.jsx`, mêmes styles dans `index.html`) : logo au centre, astuce en
  bas à gauche, étape et pourcentage en bas à droite, barre dorée sur toute la largeur. Sur téléphone, barre, étape
  et pourcentage sous le rond central, l'astuce en bas (collée au bord du bas, la barre passait sous la barre
  d'outils du navigateur ou le trait d'accueil du téléphone). La progression est réelle
  et ne recule jamais : démarrage (le lancement du moteur 3D occupe le processeur une à deux secondes : le début
  de la barre est animé par la carte graphique, sans pourcentage), puis octets reçus des modèles, textures et
  ciels de 15 à 84 % (`trackLoad` dans `src/three/assets.js`), puis décodage et compilation jusqu'à 100 %. Un
  reflet parcourt la barre, animé par la carte graphique : elle vit même quand le processeur est occupé. La scène
  est dessinée derrière l'écran de chargement : chaque modèle compile ses matériaux dès son arrivée (tout
  compiler à la fin prenait 8 s au lieu de 3,5). Onglet en arrière-plan : une minuterie termine le chargement.
- Écran titre (`src/ui/title.jsx`) : la caméra tourne lentement autour du complexe (`attract` d'Empire3D, le
  complexe décalé hors du menu), sur téléphone comme sur PC. La page elle-même ne se zoome pas au doigt
  (`index.html`, `main.jsx`) ; seule la caméra 3D du jeu garde son zoom. Logo FootOFF Empire (monogramme, FootOFF, « Empire » en sous-titre espacé, comme
  sur l'écran de chargement), sans horloge ; menu Continuer, Nouvelle partie, Réglages, FootOFF Media ;
  à droite (PC) la carte de l'entrée active (classement, points, journée, forme, prochain match, trésorerie).
  Avant la création du club, la scène montre le complexe de départ. Sous-écrans avec leur propre en-tête :
  réglages, création du club (nom proposé au hasard, dé pour en tirer un autre). Fenêtre peu haute (ordinateur
  sous 760 px, puis sous 680 px de haut) : le formulaire de création se resserre et tient en entier dès 600 px ;
  plus bas (téléphone à l'horizontale), sa colonne défile ; l'aide des commandes ne capte jamais un clic (elle
  recouvrait le milieu de « Fonder le club » en 793 × 639). Continuer : la caméra plonge
  vers la vue d'ensemble et le HUD apparaît.
- Menu pause (`src/ui/pause.jsx`) : Échap, le bouton menu du HUD, ou Start à la manette. La scène se fige (Empire3D
  ne dessine plus, `paused`) et se floute ; le nom du club avec son écusson ; Reprendre, Réglages, Écran titre, Nouvelle partie (confirmation),
  FootOFF Media ; à droite la saison en cours et l'objectif. Ses classes portent le préfixe `pz-` : le préfixe
  `pm-` appartient à l'avant-match (un `.pm-side` commun masquait le coup d'envoi sur téléphone).
- Commandes (`src/ui/console.jsx`, `src/ui/input.js`) : flèches, Entrée, Échap ; souris (l'entrée suit le
  survol) ; doigt ; manette (croix ou stick, A, B, Start), traduite en touches du clavier. Les aides en bas
  d'écran suivent le dernier moyen utilisé (touches, boutons de manette, rien au doigt). Petits sons de menu,
  coupés avec le son.

## Caméra sur téléphone

Vue d'ensemble calculée pour faire tenir toutes les parcelles entre la barre du haut et le menu du bas. Toucher un
bâtiment le cadre au-dessus de sa fiche ; toucher à côté referme la fiche et ramène la vue d'ensemble. Double tap
puis glisser : vers le haut pour dézoomer, vers le bas pour zoomer (double tap seul : un cran de zoom).

## Cadrage d'un bâtiment

La caméra mesure la zone libre (sous la barre du haut, au-dessus de la fiche sur téléphone, à droite de la
carte de l'inspecteur sur PC, à gauche de la fenêtre d'aperçu ou au-dessus quand elle se pose en bas) et choisit
la distance qui fait tenir le bâtiment entier dans cette zone, en trois-quarts face. Sur téléphone, la fiche est
limitée à 54 % de la hauteur et l'objectif s'efface pendant ce temps.

## Vitrine de construction

Fiche d'une parcelle libre (`src/ui/inspector.jsx`, briques dans `src/ui/build.jsx`) : tous les bâtiments en cartes
illustrées d'un coup d'œil, sans rien faire défiler (vignette rendue avec les modèles 3D du jeu,
`public/ui/buildings/<bâtiment>_L<niveau>.webp`, famille, effet phare chiffré, prix ou « il manque … »). La
recommandation du staff (`recommendedBuilding`) est choisie d'emblée et marquée « Conseillé ». Le bâtiment choisi
se dessine en hologramme doré sur la parcelle (`holo` d'Empire3D : corps translucide, arêtes, sortie de terre),
la caméra le cadre dans la zone libre puis oscille lentement autour, comme en vitrine.

- PC : la fenêtre d'aperçu (`.bw`) se pose à droite, la carte de match et les outils s'effacent ; grande vignette,
  rangée des niveaux (un clic montre le niveau, en hologramme aussi), effets chiffrés avant / après, rentabilité,
  action. Filtres Tout / Sport / Revenus / Mercato. Clavier et manette : flèches dans la vitrine puis vers le
  bouton d'achat, Entrée sur la carte choisie pour construire, Échap. Tablette en hauteur : la fenêtre se pose en
  bas à droite, la parcelle reste visible au-dessus.
- Téléphone : une rangée de vignettes (jamais plus large qu'un quart de la rangée), le détail dessous, l'action
  sous le pouce ; « Aperçu » ouvre la fenêtre en grand, par-dessus la fiche.
- Acheter au doigt : appui long de 0,7 s (`HoldButton`) ; le bouton se remplit de lumière, un anneau suit l'appui,
  une note monte, l'hologramme se charge de lumière (`src/ui/charge.js`) ; un simple toucher explique le geste.
  Souris, clavier, manette : un clic. Puis le chantier : son, vibration, ruban « Chantier lancé » sur la vignette.
- Parcelle bâtie : vignette du niveau atteint, niveau suivant chiffré avant / après, « Aperçu des niveaux » (la
  fenêtre ; sur PC, le niveau montré remplace le bâtiment en hologramme le temps de l'aperçu).
- Sélecteur ‹ › : d'une parcelle libre à l'autre, sans perdre le bâtiment choisi. Bouton Construire (grue) en tête
  des outils du HUD, touche B : ouvre la vitrine sur la première parcelle libre, pastille dorée si un bâtiment est
  payable tout de suite.
- Coût mesuré : l'hologramme ajoute environ 1,4 ms par image en plein écran (2880 × 1620, gros plan), seulement
  pendant l'aperçu ; les modèles des bâtiments proposés se chargent à l'ouverture de la vitrine.

## Après-match et classement

Après une journée de championnat, l'après-match a deux temps : le résultat (bouton « Voir le classement »), puis le
classement de la division mis à jour (`StandingsTable` de `src/ui/panels.jsx`, partagé avec le panneau Saison) : la
colonne d'évolution montre les places gagnées (▲ vert) ou perdues (▼ rouge) sur la journée, et une pastille dit où
en est le club (« Tu grimpes à la 2e place », « Tu restes en tête »). L'ordre d'avant la journée est gardé dans
`lastMatch.before`. Après un match de coupe, le résultat suffit. Aperçu : `?ecran=apres-match-classement`.

## Noms et écussons

- Joueurs (`src/game/names.js`) : prénoms et noms francophones, courts et faciles à prononcer, de toutes les
  origines du football français ; le plus souvent un prénom et un nom de la même origine. Jamais deux joueurs du
  même nom dans une partie (`registerNames`, `playerName`), et autant que possible pas le même nom de famille.
  Aucun nom de footballeur connu : noms de famille trop associés à de vrais joueurs écartés, combinaisons qui
  retomberaient sur une personne réelle interdites (`BLOCK`).
- Clubs : un type (AS, FC, Stade, Entente, Jeunesse…) et un lieu imaginaire. Dans une division : sept clubs tous
  différents, jamais deux du même lieu, au plus deux du même type, rien qui rappelle notre club
  (`leagueClubNames`) ; les adversaires de coupe non plus (`distinctClubName`). Les parties existantes sont
  réparées au chargement (`fixLeagueNames`).
- Écussons (données `src/game/crest.js`, dessin `src/ui/crest.jsx`, refonte du 2026-10-23) : trois familles, mêlées
  comme dans un vrai championnat.
  - Blason : quatre silhouettes (ancien, arrondi, pointu, cranté), couronne pour certains clubs (toujours pour les
    Real et Royal), ruban de métal en bas avec l'année de fondation ou le nom court.
  - Médaillon : anneau de métal (lisse, crénelé ou double), bandeau où le nom court en cercle et l'année en bas
    (« Fondé en … » quand seule l'année est écrite), disque central.
  - Moderne : taillé, hexagone, losange ou capsule, monogramme ou symbole, bandeau du nom court.
  Rendu « métal émaillé » : liserés et symboles en or ou argent poli (dégradés à reflets), émail bombé (ombre et lumière
  douces), reflet en haut, léger relief sous le symbole. Quinze motifs (dont rayons et bordure, « Aucun » pour un
  champ uni), vingt-six symboles (dont trois étoiles, croix de Malte, hermine, rose, laurier, flambeau, phare,
  château, navire, clés), quatre figures héraldiques en silhouette (aigle, coq, cheval, cerf ; les têtes d'animaux de
  face, jugées enfantines, ont été retirées) ou le monogramme. Les clubs adverses tirent tout de leur nom
  (`rivalCrest`) : famille (quatre blasons pour trois médaillons et trois badges), forme, motif, symbole (une figure
  animale rare), métal, année de fondation (1885 à 1984), inscription. Notre écusson se compose à la fondation
  (style, forme, symbole ou « Aucun », motif ou « Aucun », inscription, fond) et reste noir et or ;
  il porte l'année réelle de la fondation et une étoile par titre de champion (`clubStars`, cinq au plus). Le nom,
  l'année et le ruban ne s'écrivent que sur les grands écussons (`full` : affiche du calendrier, création du club,
  notoriété) ; en petit, l'écusson garde sa silhouette, ses couleurs et son symbole. Les anciennes parties gardent
  leur écusson, rangé dans la famille la plus proche. Planche de contrôle : `tmp/ph3/crests.html`
  (`?sec=clubs|familles|symboles|motifs`).

## Tutoriel des premiers pas

Refait le 2026-10-24 (`src/game/tutorial.js`, carte `CoachCard` de `src/ui/guide.jsx`) pour être intéressant,
didactique et donner envie de continuer. La directrice sportive du club mène sept étapes : bienvenue (le but du jeu),
construire le centre d'entraînement, jouer une première épreuve en 3D, recruter la recrue recommandée, jouer le
premier match, découvrir les trois objectifs du président (tirés pour la saison), puis cap sur le stade. Chaque
carte dit quoi faire (texte), pourquoi (filet doré) et, pour les quatre étapes d'action, sa prime (1 000 €, 500 €,
500 €, 1 000 €, versée une fois, notification « Étape réussie »). Chaque étape se valide toute seule ; la cible de
l'étape pulse à l'écran (parcelle, bouton Jouer d'une ligne du centre, offre de la recrue, bouton du match, stade).

## Objectifs de la saison

Refaits le 2026-10-24 (`src/game/objectives.js`) : à chaque début de saison, le président fixe trois objectifs,
adaptés à l'écart entre le niveau du onze et la moyenne de la division :
- un classement : être champion, monter (ou finir dans les deux premiers en Elite), finir dans la première moitié,
  se maintenir (finir 6e ou mieux en Départementale) ;
- un défi sportif en championnat : gagner N matchs, marquer N buts, encaisser N buts au plus, garder sa cage
  inviolée N fois ;
- un défi du club : finir la saison dans le vert (au moins autant d'argent au bilan qu'au début), faire grandir le
  complexe (construire ou améliorer), lancer un jeune de l'académie (si elle est construite).
Primes connues d'avance (argent selon la division, et réputation), bonus « saison parfaite » si les trois sont
atteints ; verdict au bilan (événements, journal). Cibles calées sur des saisons simulées (chaque défi réussi environ
deux fois sur trois à niveau attendu). Carte du HUD : une ligne par objectif (point doré, coche verte, croix rouge),
barre d'avancée, avancée en mots, prime ; puis le bonus et la grande étape de réputation en cours (`goals.js`, qui
garde ses paliers et leurs primes). Le menu pause résume les trois objectifs.

## Effectif

Onglet Joueurs de l'Effectif (`src/ui/squad.jsx`, refait le 2026-10-24 : « moderne et super esthétique ») :
- Vue d'ensemble en quatre tuiles : niveau du onze (doré), âge moyen, forme, valeur totale.
- Joueurs en cartes rangées par ligne (Gardiens, Défenseurs, Milieux, Attaquants ; effectif et moyenne de la ligne).
  Une carte : teinte du rang pour la division (bronze : faible, argent, or : fort, élite : très fort, avec halo et
  reflet qui passe), niveau en grand (dégradé doré dès l'or) et poste, numéro, « XI » pour un titulaire, portrait sur
  un halo, prénom puis nom, pastille de vente ou de clubs intéressés, trois points forts en grands chiffres (dorés
  s'ils sont forts pour la division), âge et forme. Apparition en cascade ; deux colonnes au téléphone.
- Sur PC, « Cartes / Tableau » ramène le tableau d'analyste (tri par colonne) ; le choix est gardé (navigateur). Au
  téléphone, les cartes seulement.

## Carrières et anciens joueurs

Chaque départ (vente, plan de redressement, retraite) archive le joueur dans `alumni` avec tout son parcours.
La fiche carrière (`src/ui/career.jsx`, calculs dans `src/game/career.js`) s'ouvre depuis les classements et les
légendes de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et l'onglet Anciens de l'effectif.

## Mercato

Un seul onglet « Mercato » dans l'Effectif (`src/ui/mercato.jsx`) : joueurs libres et joueurs sous contrat dans la
même liste, quatre vues.
- Recruter : mode d'emploi en trois temps à la première visite, actualité de la journée (arrivées, départs, joueurs
  suivis courtisés ou partis), recherche par nom ou par club (sans accents ni majuscules), filtres (poste, statut,
  dans mes moyens, renforce mon onze, pépites), tri en menu compact. Cartes (refaites le 2026-10-24, « moderne et
  super esthétique ») : teinte du rang pour la division comme les cartes de l'Effectif (bronze, argent, or, élite),
  note en médaille, club et écusson, âge, poste et salaire, trois meilleures qualités en grands chiffres, jauge du
  niveau et de la fourchette du potentiel sur l'échelle de 0 à 20, étoile pour suivre, comparateur ; étiquettes Recommandé, Onze +x, Courtisé, Nouveau, Pépite,
  Bonne affaire, Prix en hausse ou en baisse, Fin de contrat ; prix (rouge s'il dépasse la trésorerie), tendance,
  « Faire une offre ». Le réseau de recruteurs (bureau des transferts) ferme la liste.
- Suivis : écart de prix depuis le suivi (vert s'il a baissé), joueurs partis ailleurs.
- Offres : contre-offres à conclure, offres reçues groupées par joueur (Accepter, Négocier, Refuser, Faire monter les
  enchères) avec retour immédiat, joueurs en vente et leur prix (un interrupteur ouvre la fenêtre de mise en vente).
- Bilan : achats, ventes et solde de la saison, records, historique des arrivées et départs.

Négociation dans une feuille (`Negotiation`) : montant au curseur, boutons − et +, raccourcis (−20 %, −10 %, prix
demandé), jauge des chances d'accord (exactes : 0 % seulement si le refus est certain, 100 % seulement si l'accord
l'est) avec les raisons du vendeur, coût réel (salaire, part des salaires, fin de saison prévue), tentatives
restantes, contre-offre en carte dorée, écran d'accord (économie réalisée, gain pour le onze, « Composer
l'équipe »).

Ventes (une seule voie, la négociation ; plus de vente immédiate à sa valeur), en trois temps :
1. Mise en vente à son prix : « Mettre en vente » (fiche d'un joueur de l'effectif, ou interrupteur de la vue Offres)
   ouvre une fenêtre avec le prix au curseur (60 à 200 % de sa valeur), la chance exacte qu'un club paie ce prix
   aussitôt et celle d'avoir au moins deux clubs en lice, avec ce qui joue (forme, âge, potentiel, niveau pour la
   division).
2. Clubs intéressés : quatre clubs étudient le dossier, ceux qui s'y intéressent font aussitôt leur offre (au moins un
   se présente toujours ; une seule vague par joueur et par journée, retirer puis remettre en vente ne la renouvelle
   pas), d'autres après chaque journée. Petit club (division inférieure), club ambitieux (la nôtre) ou grand club
   (division supérieure), avec écusson. Chaque club a un plafond secret : il paie le prix demandé s'il le paie à coup
   sûr, sinon il offre un peu moins. Les grands clubs paient plus mais négocient dur ; les petits acceptent vite.
3. Sur chaque offre : Accepter (confirmation, puis écran de vente conclue), Négocier (face à face : ta demande au
   curseur, chance exacte d'accord ; refusée, le club donne son dernier mot, qu'il paie à coup sûr ; à 0 %, il part ;
   trois demandes par offre), Refuser (le club se retire). Dès deux clubs pour un joueur, « Faire monter les
   enchères » (une fois par journée) : la meilleure offre tient, chaque autre club la bat avec la chance affichée ou se
   retire. Pas de clause de revente.
Les offres valent jusqu'à la journée suivante ; un joueur en grande forme reçoit parfois une offre spontanée. Pastille
« N clubs intéressés » dans l'Effectif. Après chaque match, une notification résume les offres reçues et les
joueurs suivis partis ; la pastille du menu compte les offres et contre-offres à traiter. Les noms de clubs prennent
leur article et accordent le verbe (« l'AS … accepte », « les Bleus … acceptent »).

Aperçus : `?ecran=marche`, `transferts`, `negociation`, `contre-offre`, `suivis`, `offres`, `encheres`, `vente`,
`vente-negociation`, `vente-conclue`, `bilan-mercato`. Contrôle des chances de la vente : `tmp/ph3/salecheck.js`.

## Académie

L'équipe de jeunes du club (`src/game/academy.js`, écran `src/ui/academy.jsx`) s'ouvre d'un clic sur le bâtiment
dans la vue 3D ; sa fiche (amélioration) s'ouvre par la pastille dorée de la 3D, un conseil du staff ou le lien
« bâtiment » de l'écran, et la fiche ramène à l'écran (« Ouvrir l'académie »). Même famille que l'Effectif : tableau
détaillé sur PC (tri par colonne), liste compacte sur téléphone, fiche à droite (plein écran au téléphone).
- Mes jeunes : six places (cases dorées ; rouges pour un jeune dans sa dernière saison), niveau, potentiel estimé
  (texte doré s'il est fort pour la division), progrès de la saison (journée et dernier été en infobulle), trois
  points forts, plan ; étiquettes « Niveau titulaire » (il renforcerait l'onze) et « Dernière saison ». Bandeau de
  rappel pour les jeunes qui auront 19 ans à l'intersaison, règles en bas de liste.
- Détection : les jeunes repérés de la journée, le plus prometteur d'abord, « Signer » (gratuit) ; carte du niveau
  de l'académie et du suivant (jeunes repérés, potentiel, fourchette) avec « Améliorer ».
- Fiche : niveau et potentiel, progrès (dernière journée, saison, dernier été), plan d'entraînement en sélecteur (le
  conseillé marqué d'un point doré ; un autre plan dit de combien le niveau progresse moins vite), qualités
  travaillées marquées dans les attributs ; « Faire monter » (confirmation : salaire, effectif) et « Libérer »
  (confirmation rouge, focus sur « Le garder »). Un joueur monté garde l'étiquette « Formé au club ».
Règles : recrutement gratuit dans la limite des places, sans salaire ; nouveaux jeunes après chaque journée de
championnat (2 à 6 selon le niveau de l'académie, plus doués et mieux cernés quand elle grandit) ; progrès après
chaque journée puis bond de l'été, sans effet du centre d'entraînement (il fait progresser l'équipe première par ses
séances ; choix du 2026-10-24, pour ne pas compter son effet deux fois) : niveau moyen à 18 ans de 10,8 avec
l'académie 1, 13,8 au niveau 3 et 15,9 au niveau 5 (`tmp/calib-youth-options.mjs`, option « Sans le centre ») ; à
19 ans, un jeune qui n'est pas monté quitte le club (conseil du staff à partir de la 4e journée, notification après le
dernier match, ligne du bilan). Les points d'entraînement sont les mêmes quel que soit le plan : le conseillé fait
monter le niveau le plus vite (×1,14 à ×1,28 selon le poste), un autre développe d'autres qualités (×0,7 à ×0,96) ;
une qualité à 20 cède ses points aux autres.

Aperçus : `?ecran=academie`, `academie-detection`, `academie-jeune`, `academie-repere`, `academie-vide`,
`academie-batiment`. Simulation : `tmp/ph3/simcheck.js` (gestes et contrôles de l'académie) ; calage des progrès :
`tmp/calib-academy.mjs`.

## Centre d'entraînement

Les séances (`src/game/training.js`, écran `src/ui/training.jsx`) s'ouvrent d'un clic sur le bâtiment dans la vue 3D,
par « Séance d'entraînement » sur sa fiche, ou par le conseil du staff tant que la séance d'avant-match n'est pas
finie. Trois onglets :
- Séance : une carte par ligne (gardien, défenseur, milieu, attaquant). Joueur conseillé d'emblée (celui qui
  progresserait le plus), « Changer » ouvre la liste de la ligne avec le gain de chacun. Catégorie en sélecteur, gain
  simulé sous chaque catégorie, la conseillée marquée d'un point doré. Qualités travaillées avant → après. Épreuve et
  règle en une ligne, programme en cours (barre ; avertissement si la catégorie choisie ne le fait pas avancer). Gain
  attendu exact : simulée, et la fourchette d'une épreuve jouée (score nul à parfait). « Simuler » ou « Jouer » par
  ligne, « Tout simuler » et « Lancer la séance » en tête ; une ligne faite montre son résultat.
- Programmes (dès le niveau 3) : en cours (barre, catégorie, arrêt confirmé en rouge), puis les joueurs qui peuvent en
  commencer un ; la fiche d'un joueur liste les signes possibles avec leur effet.
- Progrès : épreuves de la saison, niveau gagné, score moyen joué, dernière séance collective, journal groupé par
  séance (« Avant : journée 3 / 7 »), tableau des niveaux du centre.
Règles :
- Une séance par fenêtre entre deux matchs (ou avant la fin de saison), une épreuve par ligne.
- Gain = marge vers le potentiel × 3 % × rythme (âge, et plus lent au sommet) × niveau (×1 à ×2) × épreuve × score
  (×0,75 à ×1,5 ; un tiers des points vaut la simulation), réparti sur les qualités de la catégorie ; jamais au-delà
  du potentiel.
- Après chaque match, les joueurs absents de la séance gagnent 1 à 2 % de leur marge (séance collective).
- Le bond de l'été vaut six dixièmes de l'ancien bond sans centre.
- Programmes : 6, 5 ou 4 séances dans la bonne catégorie selon le niveau ; une épreuve très réussie (deux tiers des
  points) compte double. Trois signes positifs au plus ; « Maîtrise de soi » retire « Sang chaud ». Un signe appris
  entre au journal.
- « Infatigable » et « Flèche » pèsent en match (`live.js`), pronostic compris.
Calage : `tmp/calib-training.mjs` (carrières), contrôles : `tmp/check-training.mjs`, simulation : `tmp/ph3/simcheck.js`.

Épreuves en 3D (`src/three/drills/`, écran `src/ui/drill.jsx`), plein écran, chargées à la première épreuve :
- Scène en unités du jeu, avec son propre rendu à la pleine résolution de l'écran. Elle reprend le ciel photographié
  du plein jour, le gazon photo du site (bandes de tonte, marquages calculés au pixel), la forêt d'imposteurs, les
  buts avec filets animés, les filets pare-ballons, les mâts et un ballon à panneaux et coutures.
- Toutes les caméras regardent vers le nord, soleil dans le dos. Les joueurs sont low-poly : jamais filmés de près ni
  de dos (plan large, vue subjective ou vue d'en haut). Le 3D du complexe est figé pendant l'épreuve.
- Précision : caméra derrière le ballon, six frappes vers des cibles dorées. Au doigt ou à la souris, comme sur les
  jeux de foot mobiles (choix de l'utilisateur, 2026-10-24) : on glisse du ballon vers le but (une flèche dorée au-dessus
  du ballon y invite, un tracé doré suit le doigt) ; le ballon part là où le doigt se lève ; un geste bombé donne de
  l'effet (le ballon s'enroule du côté du bombé, et contourne le mur en coup franc) ; un geste lent (plus de 0,45 s)
  rend la frappe molle et moins précise ; la dispersion grandit un peu à chaque frappe. Au clavier et à la manette :
  deux appuis (ligne verticale, puis horizontale).
- Arrêts réflexes (refaite le 2026-10-24, « bien plus travaillée ») : vue subjective du gardien, gants noir et or,
  plongeon réel de la caméra vers le point visé (côté et hauteur), huit tirs variés (à ras de terre, mi-hauteur,
  lucarne, dans l'axe, enroulés) du côté gauche ou droit au hasard, de plus en plus forts. Au doigt, on touche
  l'endroit où part le ballon (l'écran est le but vu du gardien, le bas de l'écran le sol) ; au clavier et à la
  manette, gauche ou droite (avec haut pour un tir haut : le gardien suit alors la trajectoire), haut seul pour
  sauter, bas pour rester au sol. Couvrir un coin prend près d'une demi-seconde : à l'arrivée du ballon, sa distance
  aux mains (et au corps tendu du bassin aux mains) donne « Capté » (100), « Claqué » (80) ou « Du bout des gants »
  (60, le ballon part en corner), avec le temps de réaction ; ralenti sur les arrêts serrés ; plonger avant la frappe
  : « Bien deviné » (six dixièmes des points) ; « Mauvais côté », « Trop tard ».
- Sprint et haies : travelling latéral, départ au signal, dix haies, zone d'appel dorée, chrono.
- Lecture du jeu : tablette de l'analyste vue d'en haut, cadrage automatique, trois partenaires numérotés, une seule
  bonne passe.
- Épreuves débloquées (bonus ×1,2 sur le gain) :
  - Coups francs (niveau 2) : la visée de Précision, un mur de mannequins jaunes sur ressort (ils vacillent quand le
    ballon les touche), un gardien ; viser au-dessus de 1,5 m passe le mur.
  - Penalties (niveau 3) : vue subjective. Pendant l'armé de la frappe, le corps du tireur s'ouvre vers son côté :
    plonger à ce moment rapporte 100. Plonger plus de 0,45 s avant la frappe, c'est se trahir : il tire de l'autre
    côté. Feintes (temps d'arrêt) et panenka au centre.
  - Centres (niveau 4) : un appui pour lancer la course vers le point de chute (anneau doré au départ du centre), un
    pour sauter. Plan large au PC ; plan resserré derrière l'attaquant sur un écran en hauteur.
  - Contre-attaque (niveau 5) : trois contre deux suivi d'en haut, deux décisions au ralenti par contre (passe à
    gauche, à droite, tir). Le défenseur qui sort libère son partenaire ; ensuite, s'il ferme le porteur, la passe
    axiale, s'il coupe la passe, le tir.
- Intro (gain parfait / simulé / raté, commandes selon le moyen utilisé), compte à rebours, tableau de bord (points
  ou chrono, tentatives, consigne), points à l'impact, résultat (score, mention, gain, programme), bilan.
- Échap (B ou Start) met en pause ; une épreuve interrompue n'est pas comptée.
- Sons synthétisés (`sfx` de `src/ui/sound.js`). Toute erreur referme l'écran sans toucher au jeu.
- GPU mesuré en 2880 × 1620 sur la puce intégrée : de 9 ms (Lecture, Contre-attaque) à 16 ms (Précision) par image.
- Essais : `tmp/ph3/drilltest.js` (ouvrir une épreuve, état, mesure GPU).

Aperçus : `?ecran=entrainement`, `entrainement-joueur`, `entrainement-programmes`, `entrainement-programme`,
`entrainement-progres`, `entrainement-batiment` (les épreuves 3D se testent dans le jeu ; `window.__drill.debug` et
`window.__drillStage` en développement).

## Dispositifs

Six formations (`FORMATIONS` dans `src/game/tactics.js`) : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2. Le
dispositif fixe les postes du onze, le schéma de l'avant-match et la place des joueurs 3D ; il agit sur les
occasions des deux équipes et sur la possession. Le pronostic en tient compte (vérifié par simulation).

## Composition sur le terrain

Un seul composant (`LineupBoard`, `src/ui/lineup.jsx`) pour l'onglet Composition de l'Effectif (enregistré à chaque
geste, repris à l'avant-match), l'avant-match et la mi-temps. On glisse un joueur sur un poste ou sur un coéquipier,
ou on en touche deux ; au doigt, un remplaçant se saisit après un court maintien (sinon le banc défile). Le joueur
choisi affiche sur chaque poste le niveau qu'il y aurait (vert s'il y ferait mieux). « Meilleur onze » annonce son
gain et dit quand le onze est déjà optimal. À la mi-temps, la composition est repliée : une carte « Composition et
changements » (formation, changements prévus et restants) la déploie, un lien « Replier » la referme ; repliée,
rien d'autre de la composition n'est à l'écran (la carte résume les changements). Notes de la première période en
petite pastille collée au coin du cercle (gardien placé à 90 % de la hauteur, joueurs de champ remontés : aucune
pastille ne mord sur un nom, vérifié sur les six dispositifs, PC et téléphone) ; « Reprendre la seconde période »
reste collé au bas de la carte quand la composition dépliée la fait défiler. Jusqu'à cinq entrants (`SUBS_MAX`, `live.applyLineup`), expulsés figés, résumé des changements visible
une fois la composition dépliée, pronostic recalculé.

Avant-match (`PreMatch`, `src/ui/match.jsx`), même principe : sous l'affiche, des pastilles (niveau contre niveau,
affluence, recettes) ; puis la composition, le dispositif et la tactique ; en bas, collés à l'écran et ensemble, le
pronostic (victoire, nul, défaite, buts attendus) et le coup d'envoi : chaque réglage montre aussitôt son effet sur
les chances, juste au-dessus du bouton qui lance le match. La composition est dépliée d'office sur PC (le onze à
gauche, les réglages à droite) et repliée sur téléphone dans la même carte qu'à la mi-temps (`CompoCard`), avec
« Meilleur onze » dessous ; dépliée, elle cachait sur téléphone le pronostic et tout le reste de l'avant-match.

Chaque match enregistre son onze de départ (dans l'ordre des postes de la formation), ses changements, la formule
des billets du jour, le prix du billet et les recettes détaillées (`recordMatch`, `src/game/season.js`). Le Stats
Pass montre le onze sur le terrain (note du match dans la pastille, flèche sur les remplacés, changements dessous)
et une section Billetterie (formule, prix, affluence, spectateurs restés aux guichets, recettes par poste).

## Stade et match en 3D

Hors match, le stade est vide et immobile ; l'équipe s'entraîne au centre d'entraînement (rien tant qu'il n'est pas
construit). Le jour de match (`src/three/matchplay.js`) : échauffement des deux équipes avant le coup d'envoi,
puis 11 contre 11 en direct, maillots adverses propres à chaque club (`src/game/kits.js`). L'écran du direct
écrit l'horloge et les événements de la mi-temps dans `src/game/matchFeed.js` ; la scène construit chaque action
pour que le ballon ARRIVE à l'instant où le commentaire l'affiche : au fond des filets quand « BUT ! » apparaît, dans
les gants du gardien pour un arrêt, sur le poteau, au-delà de la ligne pour un tir à côté. Règles :
- le commentaire n'annonce jamais ce que la 3D n'a pas encore montré : si le ballon est en retard (ou la faute pas
  commise), l'horloge du direct attend, au plus 2,5 s (1,25 s en accéléré), puis reprend quoi qu'il arrive
  (`matchFeed.waitAt`, `waitUntil`) ;
- l'attaque se construit vers un point de frappe dans les 20 derniers mètres : le tireur y fait son appel, la
  passe décisive est jouée dans sa course, la frappe part à une vitesse réaliste (36 m/s au plus) choisie pour
  arriver à l'heure ; le tireur nommé frappe s'il peut y être à temps, sinon le partenaire le mieux placé (les noms
  ne s'affichent pas sur la pelouse, une frappe de 40 m se voit) ;
- en accéléré, une action déjà annoncée que la 3D n'a pas pu commencer est sautée, jamais un but ; une action
  déjà annoncée n'est jamais rejouée ;
- gardien face au jeu (pas chassés), arrêts souvent en plongeant, ballon dans les gants ; contrôle de la poitrine
  des ballons aériens ; la faute se commet sur le porteur, près du ballon (plus de ballon téléporté) ;
- but : course de joie du buteur vers le public, ses coéquipiers l'entourent bras levés, le temps du bandeau
  « BUT ! », puis engagement.
Réalisation télé (`broadcastStep`, `src/ui/Empire3D.jsx`) : caméra dans l'axe de la tribune principale qui suit le
ballon et serre le plan selon l'action (jeu, attaque dans le dernier tiers, carton, joie du buteur) ; la largeur de
pelouse montrée se règle sur la zone libre de l'écran (à gauche du fil sur PC, au-dessus sur téléphone) ; le joueur
reprend la main en bougeant la caméra, la réalisation revient en douceur. Plus proche de la pelouse, elle coûte
moins que l'ancienne vue large (soir de match, 2880 × 1620 : 26,1 → 22,4 ms au stade 6). Bancs de développement :
`tmp/ph3/matchbench.js` (synchronisme, mi-temps simulées) et `tmp/ph3/matchdemo.js` (démo en temps réel, arrêt sur
image). Fautes et cartons (expulsé qui sort), engagements, changement de côté et retour aux vestiaires. Public
(`src/three/crowd.js`) : supporters assis sur les sièges du modèle de stade (debout le long de la main courante
dans les petits stades), nombre selon l'affluence, parcage visiteurs, le camp concerné se lève sur un but.
Niveaux 5 et 6 : arène fermée générée dans Blender (`arena()` de `tools/blender/models/build_stadium.py`), une
cuvette continue aux angles fermés, deux étages reliés par des loges au nord et sur les virages, toit en selle
(haut au nord, bas et reculé côté caméra pour voir toute la pelouse), bande vitrée et nervures, façade vitrée à
ailettes LED or, bandeau sombre souligné d'un filet lumineux sous le bord du toit. Marque sur le stade : un seul
monogramme en façade côté caméra, au centre (sans ailette qui le traverse), et le monogramme du toit, du niveau 3
au niveau 6 (le bandeau reprenait les panneaux publicitaires, avec un logo tous les 6 m, plus deux grands
monogrammes et, au niveau 6, deux totems à logo : trop de marques sur une façade). L'arène déborde sur les allées
de l'esplanade (`ARENA_FOOTPRINT`, catégorie `arena` de `assets-src/budgets.json`) ; caméras de match un peu plus
hautes.
Le stade est posé sur une esplanade piétonne (plus de route autour).

## Plateforme du complexe

Plan commun à `src/three/layout.js` (parcelles, en unités du jeu) et `tools/blender/models/build_site.py` (site, en
mètres) : arène au centre sur son esplanade, parcelles écartées (allées plantées et jardins entre elles, promenade
au nord), boulevard périphérique autour du complexe avec deux ronds-points au sud, parkings paysagers de part et
d'autre du parvis, grand boulevard sud à deux chaussées avec le tram sur gazon et sa station face au parvis. La
circulation (`src/three/life.js`) suit les mêmes cotes : deux boucles du périphérique en sens contraires qui
contournent l'îlot des ronds-points, plus la chaussée de transit. Parvis de prestige (`prestige()` de `build_site.py`) : axe
d'honneur en granit clair du stade à la station du tram, place de la Coupe d'Europe, miroir d'eau, jardinières
plantées, bannières FootOFF, bornes lumineuses et monogramme doré au sol. La zone au contact du stade reste libre pour
les totems de l'arène.

## Allée d'honneur et salle des trophées

Le parvis n'affiche que les compétitions gagnées par la partie en cours (`src/three/trophies.js`, palmarès commun
`src/game/honours.js` ; une nouvelle partie vide l'allée, que la scène 3D ne recrée pas) :
une réplique monumentale par compétition, posée sur son socle de granit à la première victoire, avec une plaque de
bronze (compétition, nombre de victoires, saisons) écrite par le jeu. Les trophées s'alignent de part et d'autre de
l'axe dans l'ordre des premières victoires ; la Coupe d'Europe trône au centre de la place. Six dessins originaux
modélisés dans `tools/blender/models/build_trophies.py` (coupe du District, trophée de la Ligue, plateau national,
trophée Elite, Coupe nationale, Coupe d'Europe) ; leurs vignettes de la salle sont rendues sous un vrai ciel par
`render_trophies.py`. Un nouveau trophée sort de terre sous l'œil de la caméra (après le match). La nuit, l'or et
l'argent reflètent un studio retourné, comme éclairés par des projecteurs au sol. Un clic sur le parvis ouvre la
salle des trophées (`src/ui/trophyroom.jsx`) : palmarès, succès datés (`src/game/achievements.js`) et records de
toujours (`src/game/records.js`, tenus match après match : l'historique détaillé ne garde que 400 matchs).

## Ciel et lumière

Vrais ciels photographiés (HDRI CC0 de Poly Haven, liste et URL dans `assets-src/skies.json`, sources lourdes hors
dépôt dans `assets-src/hdri/`). `npm run skies` mesure chaque ciel (soleil, lueur, éclairement, couleur de l'horizon)
et le convertit en WebP léger (moitié haute, radiance compressée x / (1 + x)) pour `src/three/sky.js` : dôme, voile
d'horizon, environnement (reflets et lumière ambiante, sans le disque solaire) et brume couleur d'horizon dans la
direction du regard. L'heure réelle choisit un moment (aube, matin, journée, fin d'après-midi dorée, coucher,
crépuscule, nuit) d'après le lever et le coucher de la saison ; chaque moment tourne sa photo pour placer le soleil
là où il flatte la vue d'ensemble, et le soleil du jeu suit celui de la photo. Toujours par temps clair : ni pluie ni
neige (retirées le 2026-10-23, avec leurs ciels couverts).

Eau (lac et miroir d'eau du parvis, `src/three/landscape.js`) : naturelle et sans reflet net (ni miroir, ni nuages
ou bâtiments reflétés) : bleu profond au large et dans les bassins, un peu plus clair vers les rives, bord vaseux au
ras de la rive ; un voile de ciel très flou (eau ridée, rugosité 0,3) et des rides animées lui donnent sa profondeur,
de jour comme sous la lune. Une première eau bleu vif, mate, faisait artificielle (refusée le 2026-10-23).
Fondu de quatre secondes entre deux ambiances (ciel, soleil, exposition). La nuit, la lueur de ville de la
photo au ras de l'horizon (une douzaine de fois plus claire que le reste) est atténuée à la conversion (« tame » dans
`skies.json`) : regardée en face, elle faisait une tache blanche (halo) et une brume claire sur tout le complexe.

## Arbres et jardins

Cinq essences européennes (chêne, hêtre, peuplier d'Italie, pin sylvestre, sapin) modélisées dans Blender
(`tools/blender/models/build_trees.py`) : la silhouette de chaque espèce est remplie de touffes de feuillage
composées à partir de vraies feuilles, aiguilles et écorces photographiées (CC0, liste dans
`assets-src/vegetation.json`, sources hors dépôt dans `assets-src/vegetation/`, masses de feuilles composées par
`tools/vegetation/clusters.py`). Normales arrondies sur le houppier et sur chaque touffe : de loin, un arbre se lit
comme un vrai volume de feuillage, éclairé et ombré. Au loin (forêts des collines) et sur le site quand la caméra
s'éloigne, chaque arbre devient un imposteur : l'espèce rendue sous huit angles (couleur, relief, part de ciel
visible ; `render_impostors.py` puis `tools/vegetation/impostors.py`), éclairée en direct comme le reste de la scène.
Pas d'ombres portées (rendu unique, voir Fluidité). Jardins : haies taillées, buis en boule et massifs
d'arbustes (quelques-uns pourpres) dans les jardinières du parvis, les jardins et aux coins des pelouses des
parcelles. Emplacements : `site_trees.json` pour le site (`build_site.py`), repères `tree_spot_*` dans les modèles des
bâtiments et des parcelles. Forêts des collines : un arbre sur deux, pris au hasard ; arbres du site en 3D à moins de
16 unités de la caméra.

## Sols, routes et mobilier

Matières photographiées (CC0, liste dans `assets-src/grounds.json`, sources hors dépôt dans `assets-src/grounds/`),
préparées par `tools/grounds/prepare.py` : teinte calée sur la palette du complexe, joints des grandes dalles calés
au mètre, tailles du jeu. Esplanade, parvis et promenade en grandes dalles de granit d'un mètre (l'axe d'honneur dans
le même granit, plus clair), calepinage de bandes de granit gris tous les 6 m ; trottoirs, allées et quai du tram en
pavés béton ; routes, parkings et ronds-points en enrobé, marquages en peinture qui laisse voir le grain ; pelouses
en gazon dense, bandes de tonte comprises ; béton désactivé des dalles de parcelles, gravier des chantiers, paillage
d'écorce au pied des massifs. Bordures en granit et caniveaux calculés sur le contour des espaces piétons
(`edging()` de `build_site.py`), avaloirs, plaques d'égout, grilles d'arbres en fonte. Dans le jeu (`src/three/ground.js`),
sans texture de plus : taches à grande échelle, mosaïque des dalles (chaque dalle prend l'une des neuf dalles de la
photo, tournée au hasard : aucune répétition visible), touffes et zones plus sèches des pelouses. La prairie de
l'écrin garde son grain et prend en plus le gazon photo de près ; la route extérieure, l'enrobé du site.
Mobilier contemporain (`tools/blender/models/footoff_street.py`) : lampadaires routiers à LED, lanternes piétonnes,
bancs en teck et acier anthracite, corbeilles, bornes, arceaux à vélos. Le soir et la nuit, une flaque de lumière
chaude au sol sous chaque lampadaire et lanterne (ajoutée à l'image, cachée le jour).
Écarts verticaux entre sols superposés : au moins 2,5 cm (positions du site compressées sur 16 bits, pas de 9 mm ;
sur 14 bits, le paillage passait sous la pelouse).

## Matières du stade

Les mêmes matières photographiées (`assets-src/grounds.json`, `tools/grounds/prepare.py`), posées par
`footoff_photo.py` dans `tools/blender/models/build_stadium.py` : béton coulé des gradins (joints de coffrage, trous de
banches), béton des dalles et des abords, bac acier nervuré des toitures (nervures dans le sens de la pente, y compris
sur les toits en anneau et en selle), brique du club-house, bois grisé des petits gradins, gravier autour du terrain
municipal. Sièges coques en deux pièces (assise, et dossier incliné au haut arrondi ; jour ouvert sous l'assise), une
coque tous les 50 cm calée sur son rang ; le public ne s'assoit que sur les assises. Filets de but : mailles fondues
en voile blanc au loin, sans ombre ni occlusion.
Pelouse (`src/three/ground.js`) : l'image du modèle ne porte que la teinte du gazon et l'usure ; le jeu dessine les
bandes de tonte selon le point de vue (brins couchés vers la caméra ou à l'opposé : elles s'inversent quand on fait le
tour du stade ; croisées au niveau 4), les touffes et les marquages réglementaires de 12 cm, calculés au pixel, nets
et sans scintillement à toute distance (à la chaux et usés au terrain municipal). La caméra reste à 60 m et plus :
une photo de gazon s'y fondait en aplat, elle n'a pas été gardée.
La nuit : les quatre mâts de l'esplanade éclairent l'esplanade devant eux (ils visaient le stade, déjà éclairé par ses
projecteurs, un peu adoucis).

## Fluidité

Un seul rendu depuis le 2026-10-23 (`src/three/render.js`), celui de l'ancienne qualité Économie, que le joueur
jugeait le plus beau et le plus net : scène dessinée directement dans une toile multi-échantillonnée (bords lisses,
feuillages au bord adouci par alpha-to-coverage), sans ombres portées ni post-traitement (plus d'occlusion, de halo,
d'étalonnage ni de FXAA), toile toujours opaque (les feuillages écrivent un alpha partiel : sans cela, le fond de la
page se voyait en pointillés sombres autour des arbres), bord des feuilles détourées sur fond noir éclairci dans le
shader. Le public du stade garde son nombre complet les jours de match. Mesuré en 2880 × 1620 (puce intégrée AMD,
mêmes conditions) : 12 à 17,5 ms par image, contre 17 à 24 ms pour l'ancienne qualité Auto. Ensuite :
- projecteurs (mâts, parcelles, stade, trophée) tous dans le calcul de la lumière ou aucun : le jour, aucun ne coûte ;
  les deux combinaisons sont compilées d'avance, derrière l'écran de chargement (pas d'à-coup à la tombée du jour) ;
  chaque pixel ne calcule que les projecteurs qui l'atteignent (`src/three/lights.js`) : test de portée d'abord,
  modèle de lumière seulement dans le cône (three évaluait sinon les 11 projecteurs en entier sur chaque pixel, même
  là où leur lumière vaut zéro). Même image ; mesuré la nuit en 2880 × 1620 (puce intégrée, image par image) : scène
  37,9 → 25,8 ms, rotation de caméra la nuit et les soirs de match 16 à 17 → 22 à 25 images par seconde ; de même,
  une lumière directionnelle qui n'apporte rien (la lumière d'appoint, à zéro en plein jour ; le soleil dans une
  ombre complète) n'est pas calculée (en plein jour, 18,4 → 18,0 ms par image) ;
- ciel peint en dernier, là où il se voit ;
- net en permanence : la toile a exactement la densité de l'écran et la scène est toujours calculée à cette densité,
  sur ordinateur comme sur téléphone, au repos comme pendant les déplacements et le zoom, sans résolution adaptative
  ni agrandisseur (sur une puce intégrée, agrandir une image calculée plus petite coûtait presque autant que la pleine
  résolution : FXAA, EASU, RCAS, 5 à 7 ms en 2880 × 1620) ; ciel photo et images des arbres lointains en pleine
  définition partout. Densité de l'écran relue au zoom du navigateur et au changement d'écran ;
- feuillage des arbres : profondeur écrite d'abord par une passe qui ne lit que l'image des feuilles (même vent, même
  découpe), puis feuillage éclairé sans écrire la profondeur : chaque pixel n'est éclairé que pour la feuille visible
  (vue rapprochée, 2880 × 1620 : scène 22,1 → 18,4 ms) ;
- panneaux du HUD sans flou d'arrière-plan (fond sombre plus couvrant) : le flou, recalculé à chaque image puisque la
  3D bouge derrière, coûtait ~4 ms en 2880 × 1620 et faisait tomber l'image sous 30 par seconde ; le verre liquide
  reste au menu du bas ;
- caméra sans inertie : elle s'arrête dès qu'on lâche ;
- sols dessinés après tout le reste (les pixels de sol cachés par les arbres et les bâtiments ne sont pas calculés),
  couches posées dessus avant les surfaces qu'elles recouvrent, pelouse du site en dernier (mesuré en vue
  rapprochée, 4 Mpx : les sols photo coûtent ainsi autant que les anciens sols unis) ;
- stade : toits et sièges dessinés d'abord, béton des gradins et façades en dernier (face à une tribune, 4 Mpx :
  -3 ms) ; béton des gradins, des dalles et gravier en couleur photo seule (relief et rugosité ne changeaient pas
  l'image à la distance du jeu) ; axes de la pelouse calculés une fois par image, marquages seulement près d'un trait
  (mesuré image par image contre l'ancien stade, 3 niveaux, 9 vues : à égalité en moyenne).
