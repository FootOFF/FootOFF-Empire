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
| Colonne de gauche | objectif ou tutoriel, puis conseil du staff | même largeur que la carte du club, 12 px entre les cartes |
| Droite | outils de vue (heure, météo, jour de match, recentrer) | centrés verticalement ; derrière un seul bouton sur mobile |
| Bas | dock centré + carte de match à droite | même hauteur (`--bar-h`, 68 px) et même ligne de base ; sous 1240 px le dock se cale à gauche |

- La 3D occupe tout l'écran. `--hb` réserve la place du badge imposé par l'hébergeur de test (0 sur footoff.media) :
  seuls les éléments posés en bas l'utilisent (`--hud-bottom`).
- Mobile (≤ 760 px) : barre du haut (écusson et nom du club, ressources), objectif replié, puis en bas, de haut en bas :
  conseil du staff, carte de match, dock. Jamais plus de six éléments à l'écran.
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
- Saison : onglets Calendrier (ouvert d'emblée) et Classement dans la barre fixe, sous la situation du club.
  - Calendrier (`src/ui/calendar.jsx`, dates calculées par `seasonFixtures` dans `src/game/fixtures.js`) : toutes
    les dates dans l'ordre où elles se jouent, championnat en or, Coupe nationale en argent, Coupe d'Europe en
    bleu. En tête, le bilan (dates jouées, V / N / D, prochain match) et une frise d'une pastille par date (couleur
    du résultat, anneau de la compétition, tirets pour un tour à tirer au sort ou non disputé). Puis une carte par
    date le long d'un fil : écusson aux couleurs du maillot adverse (`kitOf`), compétition, adversaire, et pour un
    match joué le score, la formation, la formule des billets et son prix, l'affluence et la recette ; la carte
    ouvre le Stats Pass du match. Le prochain match se lance depuis sa carte.
  - Classement : zones colorées avec leur légende sous le tableau. Montée (2 premiers, or) hors Elite ; Coupe
    d'Europe des clubs (2 premiers de l'Elite, bleu) ; descente (2 derniers, rouge). Hors Elite, la légende
    rappelle que l'Europe se gagne en Elite.
- Réglages (écran titre et menu pause, voir plus bas) : Son et Vibrations en interrupteurs, Qualité graphique en
  choix à trois positions. La qualité est enregistrée par appareil (`fo-quality`) : Économie = sans ombres ni effets de
  lumière, Auto = selon l'appareil, Haute = ombres et détails maximaux ; elle s'applique sans recharger. Dans les trois,
  l'image est calculée à la pleine résolution de l'écran (un pixel calculé par pixel physique), téléphone compris, au
  repos comme en mouvement ; la ligne Qualité graphique affiche cette résolution réelle (« Image calculée en
  2880 × 1620 pixels »). Sur un écran peu haut, la liste des réglages défile sous son titre, l'entrée choisie toujours
  visible.

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
  arrivée au bout, elle n'entraîne plus la page (pas de rebond de la page).
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
- Écussons des autres clubs (`rivalCrest`, dessin dans `src/ui/crest.jsx`) : aux deux couleurs du club (le fond au
  maillot, le motif à une seconde couleur bien contrastée), 10 formes, 14 motifs, 17 emblèmes (dont lys, montagne,
  vagues, épi, pont, épées, roue, sapin, aigle) et les initiales pour un club sur quatre ; liseré blanc, noir ou à
  la seconde couleur. Les mêmes formes, motifs et emblèmes servent à composer notre écusson (toujours noir et or).
  Planche de contrôle : `tmp/ph3/crests.html`.

## Carrières et anciens joueurs

Chaque départ (vente, plan de redressement, retraite) archive le joueur dans `alumni` avec tout son parcours.
La fiche carrière (`src/ui/career.jsx`, calculs dans `src/game/career.js`) s'ouvre depuis les classements et les
légendes de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et l'onglet Anciens de l'effectif.

## Mercato

Un seul onglet « Mercato » dans l'Effectif (`src/ui/mercato.jsx`) : joueurs libres et joueurs sous contrat dans la
même liste, quatre vues.
- Recruter : mode d'emploi en trois temps à la première visite, actualité de la journée (arrivées, départs, joueurs
  suivis courtisés ou partis), filtres (poste, statut, dans mes moyens, renforce mon onze, pépites), tri en menu
  compact. Cartes : note en médaille (code couleur de l'Effectif), club et écusson, trois meilleures qualités,
  potentiel et salaire, étoile pour suivre, comparateur ; étiquettes Recommandé, Onze +x, Courtisé, Nouveau, Pépite,
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

Le parvis n'affiche que les compétitions gagnées (`src/three/trophies.js`, palmarès commun `src/game/honours.js`) :
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
là où il flatte la vue d'ensemble, et le soleil du jeu suit celui de la photo. Pluie et neige : ciels couverts.
Fondu de quatre secondes entre deux ambiances (ciel, soleil, exposition, étalonnage). La nuit, la lueur de ville de la
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
Les arbres du site gardent toujours l'ombre de leur modèle 3D. Jardins : haies taillées, buis en boule et massifs
d'arbustes (quelques-uns pourpres) dans les jardinières du parvis, les jardins et aux coins des pelouses des
parcelles. Emplacements : `site_trees.json` pour le site (`build_site.py`), repères `tree_spot_*` dans les modèles des
bâtiments et des parcelles. Sur téléphone et en mode économie : atlas réduit, pas d'ombres d'arbres.

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
projecteurs, un peu adoucis) ; de près, au-dessus du stade, le halo garde 40 % de sa force : les LED de l'arène et
les gradins sous les projecteurs le changeaient en voile blanc sur tout l'écran.

## Fluidité

Rendu taillé pour rester fluide en qualité haute, sur PC comme sur téléphone, sans rien retirer à l'image :
- ombres calculées une seule fois par image (et non à chaque rendu de la scène) ; les arbres du site affichés en
  imposteurs gardent l'ombre de leur modèle 3D, dessiné seulement dans la carte d'ombres ;
- projecteurs (mâts, parcelles, stade, trophée) tous dans le calcul de la lumière ou aucun : le jour, aucun ne coûte ;
  les deux combinaisons sont compilées d'avance, derrière l'écran de chargement (pas d'à-coup à la tombée du jour) ;
  chaque pixel ne calcule que les projecteurs qui l'atteignent (`src/three/lights.js`) : test de portée d'abord,
  modèle de lumière seulement dans le cône (three évaluait sinon les 11 projecteurs en entier sur chaque pixel, même
  là où leur lumière vaut zéro). Même image ; mesuré la nuit en 2880 × 1620 (puce intégrée, image par image) : scène
  37,9 → 25,8 ms, rotation de caméra la nuit et les soirs de match 16 à 17 → 22 à 25 images par seconde ; de même,
  une lumière directionnelle qui n'apporte rien (la lumière d'appoint, à zéro en plein jour ; le soleil dans une
  ombre complète) n'est pas calculée (en plein jour, 18,4 → 18,0 ms par image) ;
- chaîne de rendu (`src/three/postfx.js`) : scène dessinée sans multi-échantillons (il coûtait ~7,5 ms en
  2880 × 1620 sur une puce graphique intégrée) ; occlusion (demi-résolution de l'écran de près comme de loin, sans
  le ciel, l'eau, le voile d'horizon, les imposteurs ni les cartes de feuillage) et halo calculés à basse résolution,
  posés dans la passe de sortie avec le tone mapping et l'étalonnage ; halo au quart de la résolution de la scène,
  zones claires lues sur 4 × 4 pixels et noyaux de flou divisés par deux (4,5 → 1,7 ms, même image) ; garde-fou des
  pixels invalides à l'entrée du halo ; anticrénelage FXAA seulement sur écran peu dense (sur un écran très dense, une
  marche d'escalier fait un demi-pixel CSS) ; ciel peint en dernier, là où il se voit ; reflet du lac une image sur
  deux ;
- net en permanence : la toile a exactement la densité de l'écran et la scène est toujours calculée à cette densité,
  dans toutes les qualités, sur ordinateur comme sur téléphone, au repos comme pendant les déplacements et le zoom,
  sans résolution adaptative ni agrandisseur (sur une puce intégrée, agrandir une image calculée plus petite coûtait
  presque autant que la pleine résolution : FXAA, EASU, RCAS, 5 à 7 ms en 2880 × 1620) ; ombres en 2048, ciel photo
  et images des arbres lointains en pleine définition partout. Mesuré en 2880 × 1620 (puce intégrée AMD, écran
  60 Hz) : environ 30 images par seconde en mouvement le jour, chaque image à la taille exacte de l'écran (avant :
  image agrandie ×1,7 en mouvement, floue et crénelée). Densité de l'écran relue au zoom du navigateur et au
  changement d'écran ;
- feuillage des arbres : profondeur écrite d'abord par une passe qui ne lit que l'image des feuilles (même vent, même
  découpe), puis feuillage éclairé sans écrire la profondeur : chaque pixel n'est éclairé que pour la feuille visible
  (vue rapprochée, 2880 × 1620 : scène 22,1 → 18,4 ms) ;
- panneaux du HUD sans flou d'arrière-plan (fond sombre plus couvrant) : le flou, recalculé à chaque image puisque la
  3D bouge derrière, coûtait ~4 ms en 2880 × 1620 et faisait tomber l'image sous 30 par seconde ; le verre liquide
  reste au menu du bas ;
- caméra sans inertie : elle s'arrête dès qu'on lâche ;
- sols dessinés après tout le reste (les pixels de sol cachés par les arbres et les bâtiments ne sont pas calculés),
  couches posées dessus avant les surfaces qu'elles recouvrent, pelouse du site en dernier ; un sol plat ne projette
  pas d'ombre (mesuré en vue rapprochée, 4 Mpx : les sols photo coûtent ainsi autant que les anciens sols unis) ;
- stade : toits et sièges dessinés d'abord, béton des gradins et façades en dernier (face à une tribune, 4 Mpx :
  -3 ms) ; béton des gradins, des dalles et gravier en couleur photo seule (relief et rugosité ne changeaient pas
  l'image à la distance du jeu) ; axes de la pelouse calculés une fois par image, marquages seulement près d'un trait
  (mesuré image par image contre l'ancien stade, 3 niveaux, 9 vues : à égalité en moyenne).
