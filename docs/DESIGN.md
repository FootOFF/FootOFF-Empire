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
- Libellés sur une seule ligne, pour que les chiffres d'une même rangée tombent au même niveau.
- Une seule façon d'afficher chaque échelle : niveau sur 20 en grand chiffre (doré s'il est fort pour la
  division), note de match sur 10 en pastille (vert, neutre, rouge). Une légende dès qu'une couleur a un sens.
- Classes tirées des données du jeu toujours préfixées (`ev-side-home`, `ev-out-post`…) : un nom nu peut tomber
  sur celui d'un écran (« post », tir sur le poteau, prenait les styles de l'écran d'après-match `.post`).
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
- Mobile (≤ 760 px) : barre du haut (nom du club, ressources), objectif replié, puis en bas, de haut en bas :
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
- Menu : réglages (Son en interrupteur, Qualité graphique en sélecteur à trois positions), puis la partie.
  La qualité est enregistrée par appareil (`fo-quality`) : Économie = sans ombres et résolution 1, Auto = selon
  l'appareil, Haute = ombres et netteté maximales ; elle s'applique sans recharger.

## Finitions

- Sorties : tout ce qui s'ouvre passe par `<Presence>` (`src/ui/presence.jsx`) et s'efface en 200 ms dans le
  sens inverse de son entrée (panneau vers la droite, carte vers le bas, fenêtre en se resserrant). Les raccourcis
  clavier d'une fenêtre passent par `useKeydown` : ils se coupent dès qu'elle sort. Mouvement réduit respecté.
- Focus : anneau doré au clavier uniquement ; une fenêtre reçoit le focus à l'ouverture et le rend au bouton
  d'origine à la fermeture (`useDialogFocus`).
- Survol : seulement avec une souris (`@media (hover: hover)`) ; appui : léger enfoncement partout.
- Toucher : sur écran tactile, chaque commande se touche sur 44 × 44 px au moins (zone invisible `::after`).
- Gestes (`src/ui/gestures.js`) : sur téléphone, panneaux, menu, confirmation, inspecteur et fiche se ferment en
  glissant vers le bas (poignée visible) ; la fiche passe au joueur suivant ou précédent en glissant à gauche ou
  à droite. Le défilement reste prioritaire. L'action principale (Améliorer, Signer, Vendre) reste collée en bas ;
  menu et confirmation deviennent des feuilles qui montent du bas.
- Vibrations (`src/ui/haptics.js`) : but marqué, vente, dépense, construction ; désactivables dans le menu
  (indisponibles sur iPhone, Safari ne les permet pas).
- Typographie : le code écrit des espaces ordinaires ; `src/ui/typography.js` pose à l'affichage les insécables
  (avant `: ; ! ?`, dans les guillemets, entre un nombre et son unité), l'apostrophe ’ et les points de
  suspension. Ordinaux avec `ordinal()` : 1er, 1re, 2e.
- Chargement : écran HTML dans `index.html` avant l'arrivée du code, puis `LoadingScreen` (progression réelle des
  modèles 3D, astuces) jusqu'à ce que la scène soit prête ; même mise en page, aucun saut.

## Contrôle

La galerie (`?galerie` dans l'adresse du jeu) affiche chaque écran avec des données fictives, sur téléphone
(390 × 844) et sur PC (1280 × 720), sans toucher à la sauvegarde. Chaque modification d'interface se relit là.

## Sélection en verre liquide

Le menu du bas, les onglets des panneaux et les choix segmentés utilisent la même pastille en verre
(`src/ui/glass.jsx`, `useGlass` et `GlassTabs`) : elle glisse vers la section choisie en s'étirant, et on peut la
faire glisser au doigt ; la section s'ouvre au relâché. Les barres portent `data-noswipe` pour que ce geste ne
fasse pas changer de fiche.

## Caméra sur téléphone

Vue d'ensemble calculée pour faire tenir toutes les parcelles entre la barre du haut et le menu du bas. Toucher un
bâtiment le cadre au-dessus de sa fiche ; toucher à côté referme la fiche et ramène la vue d'ensemble. Double tap
puis glisser : vers le haut pour dézoomer, vers le bas pour zoomer (double tap seul : un cran de zoom).

## Cadrage d'un bâtiment

La caméra mesure la zone libre (sous la barre du haut, au-dessus de la fiche sur téléphone, à droite de la
carte de l'inspecteur sur PC) et choisit la distance qui fait tenir le bâtiment entier dans cette zone, en
trois-quarts face. Sur téléphone, la fiche est limitée à 54 % de la hauteur et l'objectif s'efface pendant ce temps.

## Carrières et anciens joueurs

Chaque départ (vente, plan de redressement, retraite) archive le joueur dans `alumni` avec tout son parcours.
La fiche carrière (`src/ui/career.jsx`, calculs dans `src/game/career.js`) s'ouvre depuis les classements et les
légendes de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et l'onglet Anciens de l'effectif.

## Dispositifs

Six formations (`FORMATIONS` dans `src/game/tactics.js`) : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2. Le
dispositif fixe les postes du onze, le schéma de l'avant-match et la place des joueurs 3D ; il agit sur les
occasions des deux équipes et sur la possession. Le pronostic en tient compte (vérifié par simulation).

## Composition sur le terrain

Un seul composant (`LineupBoard`, `src/ui/lineup.jsx`) pour l'onglet Composition de l'Effectif (enregistré à chaque
geste, repris à l'avant-match), l'avant-match et la mi-temps. On glisse un joueur sur un poste ou sur un coéquipier,
ou on en touche deux ; au doigt, un remplaçant se saisit après un court maintien (sinon le banc défile). Le joueur
choisi affiche sur chaque poste le niveau qu'il y aurait (vert s'il y ferait mieux). « Meilleur onze » annonce son
gain et dit quand le onze est déjà optimal. À la mi-temps : notes de la première période en pastille, jusqu'à trois
entrants (`SUBS_MAX`, `live.applyLineup`), expulsés figés, résumé des changements et pronostic recalculé.

## Stade et match en 3D

Hors match, le stade est vide et immobile ; l'équipe s'entraîne au centre d'entraînement (rien tant qu'il n'est pas
construit). Le jour de match (`src/three/matchplay.js`) : échauffement des deux équipes avant le coup d'envoi,
puis 11 contre 11 en direct, maillots adverses propres à chaque club (`src/game/kits.js`). L'écran du direct
écrit l'horloge et les événements de la mi-temps dans `src/game/matchFeed.js` ; la scène construit chaque action
pour que la frappe parte à l'instant où le commentaire l'annonce (but, arrêt, à côté, poteau), joue les fautes
et cartons (expulsé qui sort), les célébrations, les engagements, le changement de côté et le retour aux
vestiaires. Une action qui ne peut plus aboutir à l'heure est abandonnée pour rester synchrone. Public
(`src/three/crowd.js`) : supporters assis sur les sièges du modèle de stade (debout le long de la main courante
dans les petits stades), nombre selon l'affluence, parcage visiteurs, le camp concerné se lève sur un but.
Niveaux 5 et 6 : arène fermée générée dans Blender (`arena()` de `tools/blender/models/build_stadium.py`), une
cuvette continue aux angles fermés, deux étages reliés par des loges au nord et sur les virages, toit en selle
(haut au nord, bas et reculé côté caméra pour voir toute la pelouse), bande vitrée et nervures, façade vitrée à
ailettes LED or, bandeau FootOFF Media et monogrammes côté caméra. Elle déborde sur les allées de l'esplanade
(`ARENA_FOOTPRINT`, catégorie `arena` de `assets-src/budgets.json`) ; caméras de match un peu plus hautes.
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
Fondu de quatre secondes entre deux ambiances (ciel, soleil, exposition, étalonnage).

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

## Fluidité

Rendu taillé pour rester fluide en qualité haute, sur PC comme sur téléphone, sans rien retirer à l'image :
- ombres calculées une seule fois par image (et non à chaque rendu de la scène) ; les arbres du site affichés en
  imposteurs gardent l'ombre de leur modèle 3D, dessiné seulement dans la carte d'ombres ;
- projecteurs (mâts, parcelles, stade, trophée) tous dans le calcul de la lumière ou aucun : le jour, aucun ne coûte ;
  les deux combinaisons sont compilées d'avance, derrière l'écran de chargement (pas d'à-coup à la tombée du jour) ;
- seule la scène est rendue en multi-échantillons ; occlusion à demi-résolution de l'écran, sans le ciel, l'eau, le
  voile d'horizon, les imposteurs ni les cartes de feuillage ; garde-fou des pixels invalides à l'entrée du halo,
  étalonnage dans la passe de sortie ; ciel peint en dernier, là où il se voit ; reflet du lac une image sur deux ;
- résolution adaptative : si l'appareil ne tient plus ~50 images par seconde, la résolution de rendu descend par
  paliers (jamais sous un pixel par pixel d'écran) puis remonte dès qu'il y a de la marge ;
- caméra sans inertie : elle s'arrête dès qu'on lâche.
