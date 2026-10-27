# Guide de style de l'interface

Habillage « Tribune » (refonte du 2026-10-24, direction A des maquettes validée par l'utilisateur) : l'habillage télé
de FootOFF Media posé sur la 3D. Charte : fond #08090A, or #C7A15A (dégradé du logo #B9924C → #DEC17F), blanc cassé
#F3F2EE. Titres, libellés, boutons et chiffres en Barlow Condensed (capitales pour les titres et libellés), texte en
Inter, petites mentions techniques (touches, version) en Geist Mono. Tous les jetons sont dans `:root`
(`src/styles.css`) ; les briques React dans `src/ui/kit.jsx`.

## Habillage Tribune

- Plaques : pleines et sombres (`--plate` sur la 3D, `--plate-solid` pour un panneau, `--plate-2` et `--plate-3`
  pour les blocs posés dessus), coin haut-droit coupé (`--cut-shape`, `--cut-shape-sm`), un filet de lumière en
  haut (`--plate-hi`). Pas de bordure fine autour d'un bloc : une plaque plus claire le détache.
- Formes penchées : boutons, onglets, pastilles de résultat (V 1–0, N 0–0, D 0–1), forme, codes des équipes, en
  parallélogramme (`--skew`, pente `--slant`).
- Logo : le logo FootOFF Empire d'origine (`FootOFFLockup`, `src/ui/brand.jsx` : monogramme, « FootOFF », « Empire »
  en sous-titre espacé) ne se modifie jamais, refonte comprise (consigne de l'utilisateur, 2026-10-24).
- Titre de section : marqueur doré penché devant des capitales condensées (`SectionHead`, `.mark-head`).
- États : l'élément choisi ou réussi se signale par un liseré intérieur (3 px à gauche : or choisi, vert réussi,
  rouge en danger ; ou 3 px en bas pour une date ou une carte choisie) ou par un fond plein, jamais par une bordure.
- Verre liquide (flou d'arrière-plan) : seulement dans le menu du bas. Partout ailleurs, des plaques pleines : un flou
  se recalcule à chaque image (la 3D bouge derrière).
- Découpe (`clip-path`) : elle rogne aussi les ombres et filtres de l'élément lui-même ; l'ombre portée se met sur
  un parent (étiquettes des parcelles en 3D), un anneau de focus devient un liseré intérieur.
- Liseré sur un élément découpé (`inset 0 0 0 1px` ou bordure) : la découpe l'efface sur la diagonale du coin. Un
  trait commun le redessine (`::after` de la règle « coin coupé d'un élément à liseré », dans `styles.css` après
  `.glass`), réglé par `--corner` (taille du coin) et `--ring` (couleur) : succès tout juste débloqué, parcelle
  choisie, recrue conseillée du mercato, icône de niveau de l'académie. Tout nouvel élément à liseré et coin coupé
  s'ajoute à cette règle.
- Texte dans un parallélogramme (`--skew`) : largeur au contenu et marge intérieure d'au moins le biais + 3 px, sinon
  les coins en biais mordent sur les premiers et derniers caractères (notes à deux chiffres : pastille de la
  composition `.lu-rate`, médaille des cartes du mercato). Contrôle : chaque note de la galerie passée à « 18,8 », le
  texte mesuré au glyphe près doit rester à 80 % du biais des bords.
- Préfixes de classes réservés, sans partage : `lv-` direct, `lm-` carte du dernier match, `sc-` calendrier,
  `sq-sorter` menu de tri (`.sq-sort` est la flèche du tableau), `is-<phase>` pour l'horloge du direct (`.halftime`
  et `.fulltime` sont des panneaux).
- Noms longs : `useFitText` (`src/ui/fittext.js`) réduit la taille jusqu'à un minimum pour tenir sur une ligne, sinon
  passe en deux lignes équilibrées (carte du prochain match, affiche de l'avant-match, bandeau du club).

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
| `--d-xs` … `--d-3xl` | 13 · 15 · 18 · 21 · 28 · 38 · 48 px | tailles d'affichage (Barlow Condensed) |
| `--r-sm` / `--r-md` / `--r-lg` | 2 / 3 / 3 px | presque aucun arrondi : plaques, coins coupés, parallélogrammes |
| `--cut` / `--cut-sm` | 14 / 10 px | coin coupé des plaques / des petits blocs |
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
- Peu de cadres : une plaque pour un vrai bloc, de simples filets fins entre les lignes ailleurs.
- Capitales condensées (Barlow Condensed) pour les titres de section, sur-titres, onglets et boutons ; les petits
  libellés (tuiles, statistiques, lignes de confirmation, puces de filtre) sont en texte normal discret.
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
| Haut gauche | bandeau du club comme un score télé : écusson, nom, division, saison et journée, classement | hauteur `--top-h` (60 px, 52 sur téléphone) ; le classement ouvre la Saison |
| Haut droite | trésorerie (ouvre les Finances), réputation (ouvre la Notoriété), menu | même hauteur que le bandeau |
| Colonne de gauche | objectifs du conseil d'administration (repliables sur une ligne) ou tutoriel, fiche d'une parcelle | largeur `--rail-w` (380 px, 340 de 761 à 1260 px) |
| Droite | colonne d'outils : Bâtir, Staff, Vue (dépliée : heure, jour de match, recentrer) | boutons de `--tool` × `--tool-h` (66 × 64, 54 × 54 sur téléphone) |
| Bas | menu du bas centré (le seul verre du jeu) et carte du prochain match à droite | même ligne de base (`--hud-bottom`) ; carte de 80 px (`--bar-h`) ; sous 1260 px le menu se cale à gauche |

- Marge d'écran `--gap` : 20 px dès 1240 px, 16 px sinon, 12 px sur téléphone.
- Carte du prochain match (`MatchCta`) : journée (« J3/14 » en Elite), domicile ou extérieur, adversaire (taille ajustée à la longueur du nom),
  chances exactes de victoire, nul et défaite en barre (`prematchOdds`, les mêmes que l'avant-match), bouton Jouer.
- Étiquettes des parcelles en 3D : flèche dorée pour améliorer, plaque sombre « Séance » avec le nombre de joueurs
  qui peuvent encore s'entraîner (`sessionPin`, ouvre l'entraînement).

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

## Menu du bas : cinq sections

Complexe, Équipe, Mercato, Saison, Club (`src/ui/nav.jsx`, `SECTIONS`). Chaque panneau appartient à une section ;
son en-tête porte le nom de la section en grand et, en onglets, les écrans voisins :

| Section | Onglets |
|---|---|
| Complexe | la vue 3D du complexe (fermer un panneau y revient) |
| Équipe | Joueurs, Composition, Entraînement, Académie, Médical, Anciens |
| Mercato | Recruter, Suivis, Offres, Bilan |
| Saison | Calendrier, Classement, Statistiques, Palmarès |
| Club | Finances, Journal, Notoriété, Direction |

- Un onglet d'un bâtiment pas encore construit reste visible, cadenassé (Entraînement, Académie, Médical, Direction).
- Téléphone : sous un panneau plein écran, le menu du bas s'efface. On passe à la section voisine (Équipe, Mercato,
  Saison, Club, sans boucler) en glissant le panneau du doigt vers la gauche ou la droite, ou par la barre du bas du
  panneau (`SectionPager`, à portée du pouce : « ‹ Équipe », les quatre points, « Saison › »). Le nouveau panneau
  arrive du côté d'où vient le doigt, l'ancien part de l'autre côté depuis l'endroit où le doigt l'a lâché
  (`data-nav` sur `.game`, `sideExit` de `useSwipe`). Une section se rouvre sur l'écran qu'on y avait laissé, tant
  qu'un panneau reste ouvert. Le geste ne part ni d'une rangée qui défile en largeur, ni d'une fiche ouverte
  par-dessus (elle garde son propre glissé : joueur suivant), ni de la composition (`data-noswipe` : glisser un
  joueur vers le bas fermait le panneau, 2026-10-25). Sans section de ce côté, le panneau ne suit le doigt que de
  loin et revient. Sur PC, le menu du bas reste visible : pas de barre.
- Retour du navigateur (bouton Précédent, bouton de la souris, retour d'Android) : il ferme la fenêtre du dessus
  (fiche, panneau, bâtiment) comme Échap, jamais le jeu ; une entrée d'historique (même adresse) garde la place tant
  qu'une fenêtre est ouverte (`App.jsx`).
- Pastilles sur le menu et les onglets (`dockSignals`, `src/game/advice.js`) : rouge pour ce qui attend une
  décision (offres à traiter), discrète pour une information (joueurs suivis), point doré pour une nouveauté.
- D'un onglet à l'autre, l'écran change sur place (ni glissement ni fondu, ni souffle d'ouverture : le clic de
  l'onglet suffit) et le reste tant que le panneau est ouvert (`nav-switch` sur `.game`). La règle était retirée au
  bout de 0,3 s, ce qui relançait l'animation d'entrée : le panneau disparaissait puis revenait (« sursaut »,
  2026-10-24). Les écrans d'une même section ont la même taille : Finances, Journal, Notoriété et Direction en
  panneau normal ; Équipe, Mercato et Saison en grand écran.
- Sur un fond doré (onglet, segment ou entrée de menu choisis), tout le contenu passe à l'encre foncée : texte,
  gains, points et pastilles, jamais or, vert ou blanc sur or (académie : « Mes jeunes 3 », « Détection 3 », point
  « à voir » d'une section ; entraînement : « Réflexes +0,08 » et le point de la qualité conseillée ; écran titre :
  point des Nouveautés). Règle générale `.segmented button.on :is(em, b, small, span)`.

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
- Saison (grand écran sur PC, le HUD s'efface ; maquette A9) : onglets Calendrier, Classement, Statistiques,
  Palmarès dans l'en-tête de la section ; quatre repères en barre fixe (position, points, différence, ambition),
  sur une ligne et sans leur précision au téléphone.
  - Calendrier (`src/ui/calendar.jsx`, dates calculées par `seasonFixtures` dans `src/game/fixtures.js`), en trois
    parties. Championnat en or, Coupe nationale en argent, Coupe d'Europe en bleu, partout.
    1. La frise : toutes les dates dans l'ordre où elles se jouent (15 au plus, 22 en Elite depuis l'aller-retour de
       la 0.6.0), une plaque par date : la journée (« J3 ») ou le
       tour de coupe à la couleur de sa compétition (trophée ou étoile), l'écusson et le nom de l'adversaire, puis
       le résultat en pastille penchée (V 1–0 vert, N 0–0 gris, D 0–1 rouge), « À suivre » en or pour le prochain
       match (bandeau doré en haut de sa plaque), « à venir » ensuite, « tirage » pour un tour à tirer ; un tour que
       le club ne jouera pas est grisé, cadenassé, « Éliminé ». La date choisie porte un trait en bas. Barre de
       progression de la saison au-dessus. Sur PC les plaques remplissent la largeur ; sur téléphone la frise défile
       et garde la date choisie au centre. Clavier et manette : flèches, début, fin (le focus suit).
    2. L'affiche de la date choisie, plaque au bandeau de la compétition, dessinée comme le terrain vu du dessus :
       notre moitié dorée, celle de l'adversaire à la couleur de son maillot (`kitOf`). Écussons en grand, noms en
       capitales (jamais coupés), niveaux, rang et points de l'adversaire en championnat (sa division en coupe, son
       budget de saison en Coupe d'Europe) ; « Journée 3 / 14 · Extérieur » au bandeau d'une journée chez l'adversaire ; au
       centre le score ou « VS », et l'état en pastille penchée (Prochain match, Victoire, Qualifié, Éliminé, Tirage
       au sort, Non disputé). Prochain match : pronostic exact du moteur avec le onze actuel (mêmes couleurs que
       l'avant-match : or, gris, rouge, avec l'avantage du terrain du bon côté), qualification exacte en coupe (tirs
       au but compris, comme l'avant-match), rapport de force, affluence et recette attendues (à l'extérieur : le lieu
       et les droits TV attendus, pas de billetterie), billets, prime de coupe, « Jouer le match ». Match joué : buteurs, homme du match, affluence, recette,
       dispositif, billets, « Voir le Stats Pass ». Un geste vers la gauche ou la droite change de date (téléphone).
    3. Le bilan (colonne de droite sur PC, dessous au téléphone), en plaques : victoires, nuls, défaites et leur
       barre, buts ; forme des cinq derniers matchs et les journées (sept, quatorze en Elite) en pastilles penchées (teintées, pleines
       pour la date choisie) ; le parcours de chaque coupe tour par tour. Chaque élément choisit sa date.
  - Classement (`StandingsTable`, `src/ui/panels.jsx`) : le tableau dans sa plaque, bord à bord ; rang et points en
    grands chiffres condensés, colonnes J, G, N, P, Diff, Pts (G, N, P comptés depuis le 2026-10-24 : une saison
    commencée avant n'affiche que J, Diff, Pts jusqu'à la suivante ; jamais de G, N, P au téléphone, faute de
    place). Zone de chaque place en liseré à gauche : montée (2 premiers, or) hors Elite, Coupe d'Europe des clubs
    (2 premiers de l'Elite, bleu), descente (2 derniers, rouge) ; légende en carrés de couleur dessous (hors Elite,
    elle rappelle que l'Europe se gagne en Elite). Notre ligne teintée d'or, notre nom en or. Le même tableau suit
    chaque journée de championnat dans l'après-match, avec les places gagnées ou perdues.
  - À droite du classement, des plaques : la course de la saison (« Monter en fin de saison », « Jouer l'Europe »
    ou « Sauver sa place » : la règle, la place, l'écart en points avec le club à rattraper ou à tenir derrière, les
    journées qui restent, la prime de classement exacte de la place actuelle, `prizeFor`) ; chaque coupe tour par
    tour (après une élimination, seulement les tours joués et une phrase) ; les meilleurs du club cette saison
    (meilleure note moyenne sur 3 matchs au moins, meilleur buteur, gardien ou défenseur aux matchs sans encaisser :
    un nom ouvre la fiche du joueur) ; le dernier match ; la vitrine ; les classements passés.
  - Aperçus : `?ecran=saison`, `saison-joue`, `saison-coupe`, `saison-fin`, `calendrier-europe` (Elite : quatorze
    journées et la Coupe d'Europe), `classement`, `europe`.
  - Statistiques (`src/ui/stats.jsx`) : onglets Le club, Matchs, Joueurs et, depuis la 0.6.1, Pronostic : sur tes
    propres matchs, les chances annoncées au coup d'envoi (gardées avec chaque match, `m.odds` : victoire, nul,
    défaite, et qualification en coupe) face aux résultats. En tête, victoires, nuls, défaites et qualifications
    obtenues, chacune avec sa part annoncée en moyenne ; puis, par tranche de chance de victoire annoncée (0-20, 20-40,
    40-60, 60-80, 80-100 %), le nombre de matchs, une barre dorée des victoires obtenues avec un trait blanc à la chance
    annoncée, et une pastille « dans le bruit » (écart sous deux erreurs types) ou « écart ». Les matchs d'avant la
    0.6.1 n'ont pas de pronostic gardé. Aperçu : `?ecran=stats-pronostic`.
- Réglages (écran titre et menu pause, voir plus bas) : Son et Vibrations en interrupteurs. Plus de qualité graphique
  depuis le 2026-10-23 : un seul rendu pour tous, celui de l'ancienne qualité Économie, jugée la plus belle et la plus
  nette (voir Fluidité) ; l'image est calculée à la pleine résolution de l'écran (un pixel calculé par pixel physique),
  téléphone compris, au repos comme en mouvement. Sur un écran peu haut, la liste des réglages défile sous son titre,
  l'entrée choisie toujours visible.

## Notifications, infobulles, portraits, raccourcis

- Notifications (`src/ui/notify.jsx`, classes `nt-`) : le bandeau garde son dessin d'origine, plus élégant que
  l'habillage Tribune (choix de l'utilisateur, 2026-10-24) : coins arrondis de 16 px, sur-titre en Geist Mono espacé,
  titre en Geist ; c'est la seule exception aux plaques au coin coupé. Un seul bandeau à la fois, qui descend du haut puis repart
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
- Portraits des joueurs (`src/ui/portrait.jsx`, traits dans `src/game/faces.js`, refaits en 0.6.1 pour qu'on
  retienne ses joueurs) : dessinés, dans le même style sobre, et toujours les mêmes pour un même joueur, son visage
  étant tiré une fois et gardé sur lui (`p.face`). Forme du visage (ovale, ronde, carrée, longue), yeux (cinq formes,
  leur couleur et un reflet dès 64 px), nez (cinq formes), bouche (cinq), sourcils (épaisseur et forme), oreilles ;
  une vingtaine de coiffures (court, raie, frange, houppe, dégradé, plaqué, en bataille, boucles, afro, afro court,
  dreadlocks, tresses, crête, high-top, longs, chignon, queue de cheval, mulet, front dégarni, crâne rasé) ; barbe de
  trois jours, courte, fournie, bouc, moustache, collier, bouc et moustache. Avec l'âge, les cheveux grisonnent (poivre
  et sel d'abord), le front se dégarnit, la barbe d'un jeune vient vers 20-26 ans. Un joueur sur cinq a un signe
  particulier : taches de rousseur, grain de beauté, cicatrice au sourcil, nez cassé, bandeau, oreilles décollées.
  L'origine de son nom de famille oriente un peu son teint, donc ses cheveux (un joueur sur quatre fait mélange, comme
  dans la vie). Aucun sosie dans l'effectif : à son arrivée, un joueur qui aurait la même silhouette qu'un coéquipier
  (teint, cheveux, coiffure, barbe, bandeau) prend une coupe ou une barbe voisine (`distinctFace`) ; l'été aussi (le
  dernier arrivé). Les joueurs d'avant la 0.6.1 gardent la base de leur ancien portrait (teint, cheveux, coiffure,
  barbe, mêmes changements avec l'âge), avec les nouveaux traits (`legacyFace`, vérifié sur 3 000 joueurs). En petit
  (moins de 40 px), seule la silhouette compte ; les traits fins viennent ensuite ; dès 52 px, le numéro du joueur
  sur son maillot. Buste au maillot de son club (notre or, l'anthracite de nos gardiens, les couleurs du club adverse,
  un haut d'entraînement pour un joueur libre), liseré doré pour nos joueurs. Tableau et cartes de l'effectif (poste
  en pastille sur le portrait au téléphone), fiche joueur, cartes du mercato (médaille de niveau posée sur le
  portrait), homme du match, bandeau du but, classements des Stats. Planche de contrôle : `?ecran=visages`.
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
  champs de saisie (la bulle « Copier / Traduire » n'apparaît jamais) ; pas de menu contextuel. La loupe de Safari
  (double toucher maintenu, même sur du texte non sélectionnable) : `main.jsx` bloque à la source (`touchstart`) le
  second appui d'un double toucher, quand il suit de moins de 350 ms un toucher bref au même endroit (40 px), hors
  champs de saisie ; si c'est encore un toucher bref, son clic est rejoué (`detail: 1`, qu'un bouton à maintenir
  ignore). Les défilements enchaînés ne sont jamais bloqués (seul un toucher bref ouvre la fenêtre) ; les gestes en
  pointer events (appui long « Construire », double toucher glissé du zoom 3D) restent intacts.
- Typographie : le code écrit des espaces ordinaires ; `src/ui/typography.js` pose à l'affichage les insécables
  (avant `: ; ! ?`, dans les guillemets, entre un nombre et son unité), l'apostrophe ’ et les points de
  suspension. Ordinaux avec `ordinal()` : 1er, 1re, 2e.
- Chargement : voir « Écran titre, pause et chargement ».

## Contrôle

La galerie (`?galerie` dans l'adresse du jeu) affiche chaque écran avec des données fictives, sur téléphone
(390 × 844) et sur PC (1280 × 720), sans toucher à la sauvegarde. Chaque modification d'interface se relit là.

## Sauvegarde, mises à jour, erreurs (socle de publication, 2026-10-24)

- Sauvegarde (`src/game/save.js`) : la partie dans le stockage local du navigateur (`SAVE_KEY`), plus une copie de secours
  (`BACKUP_KEY`) prise à l'ouverture de chaque session. Au chargement, une sauvegarde illisible ou invalide (`validSave`)
  laisse la place à la copie de secours, le texte illisible est gardé à part (`.corrupt`, jamais effacé) et une
  notification le dit. Réglages (écran titre et menu pause, `SettingsView` de `src/ui/console.jsx`) : « Copier le code
  de sauvegarde » (JSON compressé en base64, préfixe `FOE1`, quelques Ko, copié dans le presse-papiers ou affiché à
  copier) et « Restaurer un code de sauvegarde » (champ à coller ; la partie en cours est mise en copie de secours après
  une confirmation du jeu). C'est le passage d'un appareil à l'autre en attendant une synchronisation.
- Mises à jour (`src/sw.js`, publié en `sw.js` par le greffon de `vite.config.js` ; `src/ui/updates.js`) : service worker
  en production. Enveloppe de la version précachée (scripts, styles, page), ressources lourdes (modèles, ciels, vignettes,
  végétation) servies depuis le cache et rafraîchies en arrière-plan, polices de même ; la page se demande d'abord au
  réseau puis au cache : le jeu s'ouvre hors ligne après une première visite. Une nouvelle version s'installe en attente ;
  le jeu vérifie à chaque retour au premier plan et toutes les trente minutes, puis une notification « Nouvelle version »
  propose de recharger (la partie est sauvegardée). Plus besoin de fermer puis rouvrir l'app sur iPhone. Relancé, le jeu
  tourne souvent déjà la nouvelle version (la page vient du réseau) alors que son service worker attend encore (sur
  iPhone, fermer l'app ne libère pas l'ancien) : le jeu demande au service worker en attente la liste des fichiers de sa
  version (message `SHELL`) et, si son propre script principal y figure, le laisse prendre la main sans rien afficher.
  Le bandeau « Nouvelle version » ne s'affiche donc que si la page tourne vraiment une version plus ancienne.
- Erreurs (`src/ui/crash.jsx`, `src/ui/errlog.js`) : barrière d'erreur globale autour du jeu. Une erreur de rendu affiche
  « Le jeu a rencontré un problème » (Reprendre, Copie de secours avec son club et sa saison, Copier le rapport : version,
  navigateur, erreur, vingt dernières erreurs du navigateur ; rien n'est envoyé). Aperçu : `?ecran=erreur`. La version et
  la date de construction (`__APP_VERSION__`, `__BUILD_DATE__`) s'affichent au bas de l'écran titre.
- Signaler un problème (réglages, `SettingsView`) : un rapport à coller dans un message, version, navigateur, taille de
  l'écran, vingt dernières erreurs (`src/ui/errlog.js`), avec ou sans la partie (son code de sauvegarde) : le joueur
  choisit, rien n'est envoyé. L'écran d'erreur propose les deux mêmes copies. Un code de sauvegarde reçu se rejoue dans
  une session cloud avec `decodeCode` puis `repairSave` (`src/game/save.js`).
- Nouveautés (`src/game/changelog.js`, `src/ui/news.jsx`) : écran titre et menu pause, une entrée par version avec sa date
  et ses apports ; pastille dorée et « à lire » tant que la version courante n'a pas été ouverte (stockage local). La
  version courante est celle de `package.json` : la faire avancer avec chaque entrée du journal.
- Règles du jeu (`src/ui/rules.jsx`) : écran titre et menu pause, sept chapitres en langage joueur (but du jeu, match,
  joueurs, mercato et valeur, complexe, argent, réputation), à tenir à jour avec `docs/ECONOMIE.md` et `docs/JOUEURS.md`.
- Tutoriel : huit étapes depuis le 2026-10-24, avec « Ménage ton effectif » après le premier match (condition physique,
  blessures, suspensions, changements à toute minute).
- Navigateur trop ancien (`index.html`) : un contrôle avant le code du jeu (opérateurs récents, regard arrière des
  expressions régulières, `Array.at`, `CompressionStream`, WebGL) affiche un message clair (iOS 16.4, Chrome, Edge ou
  Firefox récents) au lieu d'un chargement sans fin ; et si le jeu n'a pas démarré après 25 s, un message avec
  « Réessayer ».

## Sélection en verre liquide

Réservée au menu du bas (`src/ui/glass.jsx`, `useGlass`) : la pastille glisse vers la section choisie en
s'étirant, et on peut la faire glisser au doigt (elle reste sous le doigt) ; la section s'ouvre au relâché.
Position par `translate`, étirement par `scale` : deux propriétés distinctes, sinon l'animation d'étirement coupe
le glissement et la loupe du doigt décale la pastille.

## Écran titre, pause et chargement

Façon jeu de console : un seul chargement au démarrage, puis l'écran titre devant le complexe en 3D, puis le jeu.

- Chargement (`index.html` puis `src/ui/loading.jsx`, mêmes styles dans `index.html`) : logo FootOFF Empire d'origine
  au centre, astuce en
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
  (`index.html`, `main.jsx`) ; seule la caméra 3D du jeu garde son zoom. Logo FootOFF Empire d'origine (monogramme,
  FootOFF, « Empire » en sous-titre espacé, le même que sur l'écran de chargement ; il ne se modifie jamais), sans
  horloge ; menu Continuer, Nouvelle partie (« Fonder un autre club » s'il y a une partie), Règles du jeu, Nouveautés,
  Réglages, FootOFF Media. L'entrée active devient une barre dorée penchée (maquette A10), plus haute, texte sombre
  et flèche. Nouvelle partie sur une partie en cours : la fenêtre de confirmation du jeu prévient que la sauvegarde
  sera effacée (« Effacer et recommencer » ou « Garder ma partie ») ; le joueur garde ce choix (consigne de
  l'utilisateur, 2026-10-24). À droite (PC) la plaque de l'entrée active : pour la partie, le club en grand,
  classement, points, journées, forme en pastilles penchées, prochain adversaire avec son écusson, trésorerie ; pour
  Nouvelle partie, l'avertissement que la partie en cours sera effacée.
  Avant la création du club, la scène montre le complexe de départ. Sous-écrans avec leur propre en-tête :
  réglages, création du club (nom proposé au hasard, dé pour en tirer un autre). Fenêtre peu haute (ordinateur
  sous 760 px, puis sous 680 px de haut) : le formulaire de création se resserre et tient en entier dès 600 px ;
  plus bas (téléphone à l'horizontale), sa colonne défile ; l'aide des commandes ne capte jamais un clic (elle
  recouvrait le milieu de « Fonder le club » en 793 × 639). Continuer : la caméra plonge
  vers la vue d'ensemble et le HUD apparaît.
- Menu pause (`src/ui/pause.jsx`) : Échap, le bouton menu du HUD, ou Start à la manette. La scène se fige (Empire3D
  ne dessine plus, `paused`) et se floute ; le nom du club avec son écusson ; Reprendre, Réglages, Règles du jeu,
  Nouveautés, Écran titre, Nouvelle partie (en rouge, avec la même confirmation), FootOFF Media (même barre dorée que
  l'écran titre) ; à droite la saison en cours et les objectifs. Ses classes portent le préfixe `pz-` : le préfixe
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
recommandation du staff (`recommendedBuilding`) est choisie d'emblée et marquée « Conseillé » : le centre
d'entraînement, puis l'académie (des jeunes gratuits à fort potentiel ; classée sur la seule rentabilité, elle passait
après tous les bâtiments qui rapportent), puis le bâtiment le plus vite rentabilisé. Comparé sur 24 carrières de 15
saisons (`tools/sim/career.mjs 15 24`) : Elite atteinte une saison plus tôt en médiane, moins de descentes (46 contre 53),
plus de trésorerie en début de partie ; moins de titres d'Elite en 15 saisons (6 carrières sur 24 contre 11). Le bâtiment choisi
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

L'après-match liste l'infirmerie et les suspensions du match (joueur, durée, motif), repris dans une notification
d'avertissement qui mène à l'Effectif, et au journal.
Au téléphone, les deux boutons du pied (« Stats du match », « Voir le classement » ou « Continuer ») sont l'un sous
l'autre, pleine largeur : côte à côte, le libellé débordait du parallélogramme (un `.btn` ne coupe jamais son texte).
Après une journée de championnat, l'après-match a deux temps : le résultat (bouton « Voir le classement »), puis le
classement de la division mis à jour (`StandingsTable` de `src/ui/panels.jsx`, partagé avec le panneau Saison) : la
colonne d'évolution montre les places gagnées (▲ vert) ou perdues (▼ rouge) sur la journée, et une pastille dit où
en est le club (« Tu grimpes à la 2e place », « Tu restes en tête »). L'ordre d'avant la journée est gardé dans
`lastMatch.before`. Après un match de coupe, le résultat suffit. Aperçu : `?ecran=apres-match-classement`.
À l'extérieur (Elite), le bandeau dit « Journée 4 / 14 · Extérieur » et la plaque des recettes devient « Recettes du
match · à l'extérieur » : seulement les droits TV, avec la phrase « Pas de billetterie chez l'adversaire ».

## Journal du club

`src/game/journal.js` : une entrée par événement, jusqu'à 600 (une saison en écrit une trentaine) ; au-delà, les plus
anciennes des rubriques les moins marquantes partent d'abord (entraînement, académie, puis matchs), jamais une saison
bouclée, un titre, un objectif ou un fait du club. Le panneau (`JournalPanel`, `src/ui/panels.jsx`) garde la rubrique en
barre d'outils et ajoute une rangée de saisons au-dessus des articles (la saison en cours d'abord, « Tout » pour
l'histoire entière).

## Commentaires du direct

`T` dans `src/game/live.js` : depuis la 0.7, chaque occasion a un type d'action (ouverture, contre, centre en retrait,
centre, une-deux, cafouillage, percée, corner, pressing, frappe lointaine, coup franc, penalty), tiré selon sa qualité
(une grosse occasion vient d'une ouverture ou d'un contre, une occasion difficile de loin ou d'un coup franc) : il
choisit l'amorce du commentaire (deux à quatre par type, pour le club et pour l'adversaire) et l'action que la 3D
construit ; un centre commenté « place sa tête » se finit de la tête, « reprend de volée » d'une volée. Huit issues
d'arrêt, huit à côté, quatre sur le poteau, deux pour chaque penalty manqué ; les buts se commentent selon le score
après le but (égalisation, avantage, écart creusé, écart réduit), sans dire comment il est marqué (l'amorce le dit), et
dans les arrêts de jeu une fois sur deux ; passeur nommé pour les buts des deux équipes ; six cartons jaunes, trois
rouges, deux seconds jaunes, quatre blessures, seize phrases d'ambiance (jamais deux fois la même dans un match).

## Partage

`index.html` : description, balises Open Graph et Twitter (titre, description, image 1200 × 630 `public/og.jpg`, rendue
par `node scripts/og/build.mjs` depuis `scripts/og/card.html` avec Playwright). Les adresses absolues visent l'hébergeur
de test : à remplacer par footoff.media à la mise en ligne finale.

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

## Direction du club

Nouveau bâtiment (2026-10-24, demande de l'utilisateur : « négocier les contrats, les droits TV, les tarifs des billets,
les salaires des joueurs ») : `direction` dans `BUILDINGS` (5 500 €, cinq niveaux, famille Revenus), modèle procédural
`directionMesh` (`src/three/procedural.js` : hôtel particulier, siège à auvent, immeuble à salle du conseil, tour à
ailettes dorées et fontaine, grand siège à rotonde), vignettes `public/ui/buildings/direction_L*.webp` rendues par
`tmp/ph3/vignettes.html`. Un clic sur le bâtiment ouvre son écran (`src/ui/direction.jsx`, logique dans
`src/game/direction.js`), trois onglets :
- Droits TV : une demande de hausse par saison au diffuseur (0 à 60 %), chance exacte d'accord (le diffuseur suit
  sans discuter jusqu'à une marge qui grandit avec le niveau et la réputation), puis le contrat de la saison. Chaque
  niveau ajoute aussi 8 % aux droits ; en Départementale (pas de télévision nationale), une télé locale paie 250 € par
  niveau et par match à domicile.
- Salaires : une baisse proposée par joueur et par saison, jusqu'à 14 % (niveau 1) à 30 % (niveau 5), avec l'économie
  sur la saison et la chance exacte d'accord (un joueur fort pour la division résiste davantage). Acceptée, la baisse
  reste (`wageCut`) jusqu'à une prochaine renégociation ; la prime de signature et la valeur de revente partent du
  salaire de référence. La réponse remplace la négociation, sur place : accord (vert : nouveau salaire, économie) ou
  refus (rouge : salaire gardé, prochaine discussion la saison suivante), « Fermer » la replie ; plus de bouton
  « Proposer » pour un joueur déjà consulté (il ne menait qu'à « Négociation impossible »). La réponse vient du
  tirage lui-même (`lastWageTalk`) : un refus garde la baisse déjà obtenue, et se lisait « accepte » quand elle était
  égale à la proposition (corrigé en 0.4.2).
- Jauge `Chance` (Direction, centre médical) : 0 % et 100 % seulement quand c'est certain, sinon de 1 à 99 %
  (`pctOf`, comme au mercato).
- Billetterie : la formule des billets avec la recette prévue de chacune. C'est le seul endroit où elle se règle : la
  fiche du stade montre le tarif en vigueur, le public et la recette attendus (`TicketSummary`), avec « Changer le tarif
  · Direction du club » qui ouvre cet onglet (une fois la Direction construite). Le conseil du staff « Ton stade affiche
  complet » y mène aussi.
Les chances affichées sont celles du tirage (vérifié sur 3 000 négociations). Aperçus : `?ecran=direction`,
`direction-salaires`.

## Centre médical

Nouveau bâtiment (2026-10-25, demande de l'utilisateur : « un bâtiment qui permet de soigner les joueurs blessés ») :
`medical` dans `BUILDINGS` (4 500 €, cinq niveaux, famille Sport, septième et dernière parcelle), modèle procédural
`medicalMesh` (`src/three/procedural.js` : cabinet, centre de soins, clinique du sport et ses bassins, tour et pavillon
de cryothérapie, campus à héliport ; croix verte de pharmacie en enseigne lumineuse, jamais la croix rouge, emblème
protégé), vignettes `public/ui/buildings/medical_L*.webp`. Logique dans `src/game/medical.js`, écran
`src/ui/medical.jsx` (panneau `medical`, onglet « Médical » de la section Équipe, cadenassé tant qu'il n'est pas
construit ; un clic sur le bâtiment l'ouvre aussi) :
- Prévention : en match, le risque de blessure par minute est multiplié par 1 − 0,08 × niveau (`live.js`, `injuryCut`) :
  −40 % au niveau 5 (mesuré : 0,229 → 0,149 blessure par match sur 1 800 matchs).
- Soins : un soin par joueur blessé et par date du calendrier (`p.treated.at`, `dateKey`), payé 15 % de son salaire
  annuel (dépense « Soins médicaux » des finances). Chance exacte en centièmes : 32 + 9 × niveau − 5 × (matchs restants
  − 1), bornée de 10 à 85 % (41 % pour un coup au niveau 1, 77 % au niveau 5 ; une fracture descend à 10 %). Réussi : un
  match d'absence en moins, et une blessure d'un match est guérie (disponible au prochain match) ; raté, la blessure
  suit son cours. La réponse s'affiche sur place, comme à la Direction (vert ou rouge) ; un joueur guéri reste
  affiché jusqu'au match suivant. Chances vérifiées sur 4 000 soins par cas.
- Pastille sur l'onglet Médical et la section Équipe quand un blessé peut être soigné et que la caisse le permet ; la
  notification des blessés d'un match mène au centre médical une fois construit.
Vignettes rendues dans une session cloud par `tmp/vign/index.html` (Three.js et `buildingMesh`, environnement
`RoomEnvironment`, cadrage recalé sur les vignettes de la Direction ; `tmp/` n'est pas versionné). Aperçus :
`?ecran=medical`, `medical-batiment`.

## Tutoriel des premiers pas

Refait le 2026-10-24 (`src/game/tutorial.js`, carte `CoachCard` de `src/ui/guide.jsx`) pour être intéressant,
didactique et donner envie de continuer. La directrice sportive du club mène huit étapes : bienvenue (le but du jeu),
construire le centre d'entraînement, jouer une première épreuve en 3D, recruter la recrue recommandée, jouer le
premier match, ménager son effectif (condition, blessures, suspensions, changements), découvrir les trois objectifs du
conseil d'administration (tirés pour la saison), puis cap sur le stade. Chaque
carte dit quoi faire (texte), pourquoi (filet doré) et, pour les quatre étapes d'action, sa prime (1 000 €, 500 €,
500 €, 1 000 €, versée une fois, notification « Étape réussie » une seule fois : la liste des primes à annoncer se
vide au début de chaque action, `run` dans `App.jsx` ; elle restait sinon dans la sauvegarde quand le tutoriel se
terminait juste après une prime, et « Subvention de la mairie » s'annonçait à chaque action). Chaque étape se valide
toute seule ; la cible de
l'étape pulse à l'écran (parcelle, bouton Jouer d'une ligne du centre, offre de la recrue, bouton du match, stade).

## Objectifs de la saison

Refaits le 2026-10-24 (`src/game/objectives.js`) : à chaque début de saison, le conseil d'administration fixe trois
objectifs (« du président » avant la 0.5.1 : le président, c'est le joueur, le jeu ne doit pas en inventer un autre),
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
- Condition physique en pourcentage (cartes, colonne « Cond. » du tableau, barre de la fiche avec le coût d'un match et
  la récupération par date) ; étiquette « Blessé · entorse · 3 matchs » ou « Suspendu · 1 match » sur la carte, sous le
  nom dans le tableau, dans les étiquettes de la fiche (`AbsentTag`).
- Vue d'ensemble en cinq repères : niveau du onze (doré), condition moyenne, âge moyen, forme, valeur totale.
- Filtres en onglets avec leur nombre (Tous, Gardiens, Défenseurs, Milieux, Attaquants) et menu de tri (poste :
  rangées par ligne ; niveau, âge, condition : d'un seul tenant). La liste du tri s'ouvre par-dessus les cartes :
  `.sq-controls` est positionné avec un `z-index`, car l'animation d'entrée des enfants du panneau (`fo-rise`) fait de
  chacun un contexte d'empilement ; sans cela les cartes la recouvraient et prenaient ses touchers (le tri semblait
  cassé au téléphone).
- Habillage Tribune (maquette A6) : carte en plaque au coin coupé, bandeau du rang en haut (bronze, argent, or,
  élite), en haut une colonne (niveau en grand, poste et « XI », numéro) à la largeur de « 20,0 » sur toutes les
  cartes, le portrait (90 px, 72 au téléphone) centré dans la place qui reste : une note à deux chiffres ne mord
  jamais sur le médaillon. Puis nom en capitales, trois points forts, barre de condition (ou bandeau
  rouge d'absence), pied avec la fourchette du potentiel et la forme des cinq derniers matchs en pastilles penchées.
- Fiche joueur (maquette A7) : en-tête en plaque (prénom au-dessus du nom en grand, poste, numéro, titulaire, pied),
  niveau et potentiel sur l'échelle de 0 à 20, puis condition, saison, carrière ; action principale collée en bas.
  Sous les quatre repères, « Arrivée au club » (`arrivalOf`, `src/game/mercato.js`) : indemnité (transfert) ou prime
  (joueur libre) en or, moment (`moveWhen` : « Saison 2, après la journée 3 », comme le bilan du mercato) et club
  d'origine. La signature est notée sur le joueur (`p.signed` : montant, club, saison, journée, date du calendrier) ;
  pour les signatures plus anciennes, elle est retrouvée dans le bilan du mercato. Formé au club ou effectif de départ :
  la saison d'arrivée. Aperçu : `?ecran=fiche-recrue`.
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
légendes de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et l'onglet Anciens de l'effectif. Son en-tête
est celui de la fiche joueur (`sh-hero` teinté du rang, niveau en grand avec sa légende « niveau / 20 » ou « au
départ / 20 », poste, nom en deux lignes, portrait, étiquettes Au club / Vendu / Retraité et saisons) ; le bouton vers
la fiche joueur dit seulement « Voir sa fiche joueur » (le libellé long débordait au téléphone). Le niveau de référence
de la division (`divRef`) et le rang (`tierOf`) viennent de `src/ui/kit.jsx`, partagés par l'effectif, le mercato,
l'académie, l'entraînement et la carrière.
Depuis la Saison (les meilleurs du club) et les Stats (fiche carrière), la fiche joueur s'ouvre par-dessus le panneau
en cours, sans passer à l'Équipe (`SquadView` en mode « sheet », état `peek` d'App) : la fermer (croix, Échap,
glissement) ramène au même onglet, au même défilement, et à la fiche carrière qui l'a ouverte. Elle est posée sur
un calque (`.peek-layer`, z-index 45) au-dessus des fenêtres du panneau : la fiche carrière (`.cr-overlay`, 40) passe
dessous (sinon la fiche s'ouvrait derrière elle, invisible). Ce qu'elle ouvre
(carrière, comparaison, mise en vente) s'empile de même ; seules les offres reçues mènent au Mercato.

## Mercato

Section Mercato du menu du bas (`src/ui/mercato.jsx`, maquette A8) : joueurs libres et joueurs sous contrat dans la
même liste, quatre vues en onglets dans l'en-tête de la section (Recruter, Suivis, Offres avec la pastille rouge des
offres à traiter, Bilan). Sur PC, la liste est un tableau d'analyste par défaut (joueur, poste, niveau, potentiel,
gain pour le onze, repères, prix, suivre, « Offre ») ; « Cartes / Tableau » ramène les cartes, le choix est gardé
(`fo-market-view`). Au téléphone, les cartes.
- Recruter : mode d'emploi en trois temps à la première visite, actualité de la journée (arrivées, départs, joueurs
  suivis courtisés ou partis), recherche par nom ou par club (sans accents ni majuscules), filtres (poste, statut,
  dans mes moyens, renforce mon onze, pépites), tri en menu compact. Cartes (refaites le 2026-10-24, « moderne et
  super esthétique ») : teinte du rang pour la division comme les cartes de l'Effectif (bronze, argent, or, élite),
  note en médaille (parallélogramme posé sur le portrait, large au contenu avec une marge qui couvre le biais : une note
  à deux chiffres n'est jamais rognée), club et écusson, âge, poste et salaire, trois meilleures qualités en grands chiffres, jauge du
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

Les trois feuilles à curseur (achat, mise en vente, vente négociée) montrent la chance exacte du montant choisi dans
leur pied collé, juste au-dessus du bouton (`LiveChance` : libellé, jauge, grand pourcentage coloré, et ce qui est
certain à 0 % ou 100 % : refus, club qui se retire, accord assuré). Elle suit le curseur et reste à l'écran sans
défiler : sous les raccourcis, le bas de la fenêtre la cachait au téléphone (demande de l'utilisateur, 2026-10-24).
Le corps garde « Ce qui joue » : les raisons, et pour la mise en vente la chance d'avoir deux clubs en lice.

Ventes (une seule voie, la négociation ; plus de vente immédiate à sa valeur), en trois temps. Un joueur blessé, suspendu,
recruté ou monté de l'académie depuis moins de quatre journées de championnat (`lockResale`, `RESALE_ROUNDS` ; « Arrivé
récemment », « Monté récemment », avec les journées qui restent ; depuis la 0.5.0 : un joueur libre acheté puis revendu
le lendemain rapportait 1,5 à 2 fois son prix) ne peut pas être vendu (`saleBlock`, `src/game/mercato.js`) : ni mise en vente (bouton grisé, la raison en ambre dans le pied de la fiche ;
interrupteur grisé dans la vue Offres), ni offre acceptée ou négociée, et les clubs ne font aucune offre tant que dure
le blocage (`transfers.js`). Déjà en vente, il le reste : les clubs reviennent à son retour.
1. Mise en vente à son prix : « Mettre en vente » (fiche d'un joueur de l'effectif, ou interrupteur de la vue Offres)
   ouvre une fenêtre avec le prix au curseur (60 à 200 % de sa valeur), la chance exacte qu'un club paie ce prix
   aussitôt et celle d'avoir au moins deux clubs en lice, avec ce qui joue (forme, âge, potentiel, niveau pour la
   division).
2. Clubs intéressés : quatre clubs étudient le dossier, ceux qui s'y intéressent font aussitôt leur offre (au moins un
   se présente toujours ; une seule vague par joueur et par journée, retirer puis remettre en vente ne la renouvelle
   pas), d'autres après chaque journée. Petit club (division inférieure), club ambitieux (la nôtre) ou grand club
   (division supérieure), avec écusson. Chaque club a un plafond secret : il paie le prix demandé s'il le paie à coup
   sûr, sinon il offre un peu moins. Les grands clubs paient plus mais négocient dur ; les petits acceptent vite.
   Depuis la 0.6.0, une star d'un club d'Elite (1,5 point au-dessus du club moyen de la division) attire aussi les
   géants européens (« Géant européen », sans division, nom de club européen imaginaire) : plafond à 1,3 fois la valeur,
   négociation très dure ; un sur six des clubs intéressés, un sur trois quand le club joue la Coupe d'Europe, et plus
   d'une offre spontanée sur trois pour une star (jusqu'à une fois et demie sa valeur : « +42 % sur sa valeur »).
3. Sur chaque offre : Accepter (confirmation, puis écran de vente conclue), Négocier (face à face : ta demande au
   curseur, chance exacte d'accord ; refusée, le club donne son dernier mot, qu'il paie à coup sûr ; à 0 %, il part ;
   trois demandes par offre), Refuser (le club se retire). Dès deux clubs pour un joueur, « Faire monter les
   enchères » (une fois par journée) : la meilleure offre tient, chaque autre club la bat avec la chance affichée ou se
   retire. Pas de clause de revente.
Les offres valent jusqu'à la journée suivante ; un joueur en grande forme reçoit parfois une offre spontanée. Pastille
« N clubs intéressés » dans l'Effectif. Après chaque match, une notification résume les offres reçues et les
joueurs suivis partis ; la pastille du menu compte les offres et contre-offres à traiter. Les noms de clubs prennent
leur article et accordent le verbe (« l'AS … accepte », « les Bleus … acceptent »).

Aperçus : `?ecran=marche`, `transferts`, `negociation`, `contre-offre`, `suivis`, `offres`, `offres-europe` (offre
folle d'un géant européen pour une star de 21 ans), `encheres`, `vente`, `vente-negociation`, `vente-conclue`,
`bilan-mercato`. Contrôle des chances de la vente : `tmp/ph3/salecheck.js`.

## Académie

L'équipe de jeunes du club (`src/game/academy.js`, écran `src/ui/academy.jsx`) s'ouvre d'un clic sur le bâtiment
dans la vue 3D ; sa fiche (amélioration) s'ouvre par la pastille dorée de la 3D, un conseil du staff ou le lien
« bâtiment » de l'écran, et la fiche ramène à l'écran (« Ouvrir l'académie »). Même famille que l'Effectif : tableau
détaillé sur PC (tri par colonne), liste compacte sur téléphone, fiche à droite (plein écran au téléphone).
- Mes jeunes : six places (cases dorées ; rouges pour un jeune dans sa dernière saison), niveau, potentiel estimé
  (texte doré s'il est fort pour la division), progrès de la saison (journée et dernier été en infobulle), trois
  points forts, plan ; étiquettes « Niveau titulaire » (il renforcerait l'onze) et « Dernière saison ». Bandeau de
  rappel pour les jeunes qui auront 19 ans à l'intersaison, règles en bas de liste.
- Mission des recruteurs (0.6.1, sous la liste de la Détection ; `academy.js`) : une cible, poste (gardien,
  défenseur, milieu, attaquant), profil (technique, physique, mental : la famille de qualités où le jeune est le plus
  fort) ou région imaginaire (Val d'Ambre, Monts d'Arvel, Côte des Brumes, Plaine d'Orbel, Pays des Sept Lacs), et une
  durée de un à trois repérages (une à trois journées, deux à six en Elite). Pendant la mission, pas de jeunes repérés.
  Au retour, les recruteurs ont vu autant de jeunes (de la cible) que les repérages manqués et ramènent les plus
  prometteurs, d'après leur vrai potentiel (autant qu'un repérage, plus un par repérage en plus). La carte dit combien
  ils en verront, combien ils en ramèneront, quand, et la chance exacte qu'il y ait parmi eux un potentiel de 16 ou
  plus, de 18 ou plus (`youthChance`, intégrée sur le tirage même des jeunes ; vérifiée sur 200 000 tirages et 4 000
  missions) : les mêmes que sur autant de repérages ordinaires, la mission trie et cible sans faire naître de pépite
  (l'équilibre de la 0.5.0 tient). Une région n'impose ni poste ni profil, mais ses jeunes, observés sur place, ont un
  potentiel deux fois mieux cerné. En cours : sa cible, son retour, « Rappeler les recruteurs » (fenêtre du jeu ; les
  repérages reprennent aussitôt). Au retour : une notification après la journée, la liste ramenée en tête de la
  Détection, l'étiquette « Repéré dans le Val d'Ambre » sur la fiche. Aperçus : `academie-detection`, `academie-mission`,
  `academie-retour`.
- Détection : les jeunes repérés de la journée, le plus prometteur d'abord, « Signer » (gratuit) ; carte du niveau
  de l'académie et du suivant (jeunes repérés, potentiel, fourchette) avec « Améliorer ».
- Fiche : même modèle que la fiche joueur (niveau en grand, poste, âge et pied, nom en capitales, portrait,
  étiquettes ; échelle du niveau et du potentiel ; attributs en trois familles), puis progrès (dernière journée,
  saison, dernier été), plan d'entraînement en sélecteur (le conseillé marqué d'un point, foncé sur le plan choisi ;
  un autre plan dit de combien le niveau progresse moins vite), qualités
  travaillées marquées dans les attributs ; « Faire monter » (confirmation : salaire, effectif) et « Libérer »
  (confirmation rouge, focus sur « Le garder »). Un joueur monté garde l'étiquette « Formé au club ».
Règles : recrutement gratuit dans la limite des places, sans salaire ; nouveaux jeunes au début de la saison et après
chaque journée de championnat, toutes les deux en Elite (quatorze journées depuis la 0.6.0 : autant de jeunes par
saison qu'ailleurs, « dans deux journées de championnat » à la détection ; `scoutingWhen`) (un aux niveaux 1 et 2 de
l'académie, deux ensuite ; six au plus avant la 0.5.0), plus
doués et mieux cernés quand elle grandit (`YOUTH_GEN`, `src/game/constants.js` ; fourchettes affichées calculées sur la
même formule, `academyTalent`) : niveau à l'arrivée de 4 à 6 au niveau 1, de 6 à 8 au niveau 5 ; potentiel de huit
jeunes sur dix de 8 à 14 au niveau 1, de 12 à 18 au niveau 5, et un jeune sur cent à 16 ou plus au niveau 1, à 20 au
niveau 5. Au niveau 5, une saison apporte environ 1,7 potentiel de 18 ou plus et un 20 toutes les cinq à six saisons (avant
la 0.5.0 : 48 jeunes par saison, tous au potentiel de 18 ou plus). Progrès après chaque journée (1,2 % de la marge,
la moitié en Elite, freiné près du sommet comme en équipe première), puis six dixièmes du bond de l'été (comme l'équipe première), sans
effet du centre d'entraînement (il fait progresser l'équipe première par ses séances ; choix du 2026-10-24, pour ne pas
compter son effet deux fois) : un jeune recruté à 15 ans finit ses 18 ans à 7,5 en moyenne avec l'académie 1, 9,1 au
niveau 3, 10,5 au niveau 5, et 12,7 pour un potentiel de 18 ou plus (10,2, 13,1 et 15,1 avant la 0.5.0) ; à
19 ans, un jeune qui n'est pas monté quitte le club (conseil du staff à partir de la mi-saison, notification après le
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
  séance (« Avant : journée 3 / 7 », « / 14 » en Elite), tableau des niveaux du centre. En Elite (quatorze journées,
  jusqu'à vingt-deux dates), chaque séance compte pour deux tiers (`sessionScale`, `ELITE_PACE`) : autant de progrès
  par saison qu'ailleurs ; l'en-tête le dit (« progrès ×0,97 par séance (calendrier chargé de l'Elite) »).
- Séances confiées au staff (0.5.1, demande de l'utilisateur : les épreuves l'ennuient) : un interrupteur en tête de
  l'onglet Séance (`training.js`, `staffOn` / `setStaff`, gardé dans la partie). Activé, le staff fait avant chaque
  match les épreuves que tu n'as pas faites, avec les choix affichés sur les cartes (`pickOf` : tes choix tant que le
  joueur a de la marge, sinon le joueur dont le programme de signe avance avec la séance, sinon le conseillé), en
  simulé (gain moyen assuré, programmes poursuivis, signe appris au journal) : à l'ouverture de l'avant-match, au coup
  d'envoi, et avant un match joué d'un bloc (`staffSession`). Plus de pastille, d'épingle ni de conseil « séance à
  faire » (`advice.js`, `trainingTodo`) ; l'en-tête dit « le staff s'en charge », chaque carte « Par le staff », et tu
  peux encore jouer une épreuve toi-même avant le match. Aperçu : `?ecran=entrainement-staff`.
Règles :
- Une séance par fenêtre entre deux matchs (ou avant la fin de saison), une épreuve par ligne.
- Gain = marge vers le potentiel × 1,2 % × rythme (âge, et plus lent au sommet) × niveau (×1 à ×1,6) × épreuve × score
  (×0,75 à ×1,5 ; un tiers des points vaut la simulation), réparti sur les qualités de la catégorie ; jamais au-delà
  du potentiel.
- Après chaque match, les joueurs absents de la séance gagnent 0,4 à 0,8 % de leur marge (séance collective).
- Rééquilibré en 0.5.0 (3 %, ×1 à ×2, 1 à 2 % et épreuves ×1,2 auparavant) : un jeune entraîné à chaque date touchait
  son potentiel en une saison et demie, et l'équipe première rattrapait l'Elite en quelques saisons.
- Le bond de l'été vaut six dixièmes de l'ancien bond sans centre.
- Programmes : 6, 5 ou 4 séances dans la bonne catégorie selon le niveau ; une épreuve très réussie (deux tiers des
  points) compte double. Trois signes positifs au plus ; « Maîtrise de soi » retire « Sang chaud ». Un signe appris
  entre au journal.
- « Flèche » pèse en match (`live.js`), pronostic compris ; « Infatigable » fatigue bien moins vite (`docs/JOUEURS.md`).
Calage : `tmp/calib-training.mjs` (carrières), contrôles : `tmp/check-training.mjs`, simulation : `tmp/ph3/simcheck.js`.

Épreuves en 3D (`src/three/drills/`, écran `src/ui/drill.jsx`), plein écran, chargées à la première épreuve :
- Scène en unités du jeu, avec son propre rendu à la pleine résolution de l'écran : une seule toile 3D pour toute la
  partie, créée à la première épreuve et gardée (0.7.1 ; un contexte 3D neuf à chaque séance finissait, sur iPhone,
  par faire recharger la page). En fin de séance, tout ce qu'elle a chargé est libéré et son image réduite à un pixel ;
  pendant la séance, l'image du complexe, cachée, l'est aussi (redessinée avant le premier affichage au retour).
  Elle reprend le ciel photographié
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
- Épreuves débloquées (bonus ×1,1 sur le gain) :
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
- Sons synthétisés (`sfx` de `src/ui/sound.js`). Une erreur avant l'épreuve referme l'écran sans toucher au jeu ; une
  erreur pendant l'épreuve (boucle d'images, hors de portée de la barrière React) l'arrête et propose « Simuler » ou
  « Fermer » (`onError` du moteur, `src/three/drills/index.js`) : l'image ne se fige plus (2026-10-24, Lecture du jeu
  figée sur iPhone : le tirage d'une situation échouait une fois sur quarante ; il relâche désormais ses contraintes
  et ne renvoie jamais rien de vide).
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
geste, repris à l'avant-match), l'avant-match, la mi-temps et les changements en cours de jeu. Sous chaque joueur, sa
condition physique : une barre et son pourcentage, toujours, même au vert (vert, ambre sous 75 %, rouge sous 50 % ;
`docs/JOUEURS.md` ; choix de l'utilisateur, 2026-10-25). Sur téléphone la barre se raccourcit (24 px) ; positions du
3-5-2 et du 5-3-2 et écart du terrain couché (PC) réglés pour qu'aucune note ne recouvre la condition d'un voisin
(contrôle des chevauchements, six dispositifs, de 375 à 1440 px). Blessés et suspendus restent sur le banc, grisés
avec leur motif, et ne peuvent pas entrer ; en match, un blessé encore sur le terrain (pastille rouge) ne peut qu'être
remplacé, un joueur sorti ne revient pas. On glisse un joueur sur un poste ou sur un coéquipier,
ou on en touche deux ; au doigt, un remplaçant se saisit après un court maintien (sinon le banc défile). Le joueur
choisi affiche sur chaque poste le niveau qu'il y aurait (vert s'il y ferait mieux). « Meilleur onze » annonce son
gain et dit quand le onze est déjà optimal. À la mi-temps, la composition est repliée : une carte « Composition et
changements » (formation, changements prévus et restants) la déploie, un lien « Replier » la referme ; repliée,
rien d'autre de la composition n'est à l'écran (la carte résume les changements). Notes de la première période en
petite pastille collée au coin du cercle (gardien placé à 90 % de la hauteur, joueurs de champ remontés : aucune
pastille ne mord sur un nom, vérifié sur les six dispositifs, PC et téléphone) ; « Reprendre la seconde période »
reste collé au bas de la carte quand la composition dépliée la fait défiler. Jusqu'à cinq entrants (`SUBS_MAX`, `live.applyLineup`), expulsés figés, résumé des changements visible
une fois la composition dépliée, pronostic recalculé.

Avant-match (`PreMatch`, `src/ui/match.jsx`, maquette A3), même principe : en tête la compétition et la journée, les
deux clubs face à face (noms ajustés à leur longueur), l'affluence et la recette attendues ; puis la composition (les
absents listés dessous), le plan de jeu (dispositif ; tactique avec son effet chiffré, « +28 % d'occasions · +22 %
subies », l'équilibrée étant « le plan de référence ») ; en bas, collés à l'écran et ensemble, le pronostic (victoire,
nul, défaite en or, gris, rouge ; buts attendus) et le coup d'envoi : chaque réglage montre aussitôt son effet sur les
chances, juste au-dessus du bouton qui lance le match. Le pronostic intègre la condition physique du onze, qui baisse
au fil du match (`src/game/live.js`, `prematchOdds`). Le niveau affiché du onze aussi (depuis la 0.5.0) : quand des
titulaires ne sont pas frais, « fatigue −x » en ambre à côté du niveau (et dans la carte repliée) dit ce qu'il perd par
rapport au repos, pour que l'écart entre le niveau et les chances ne paraisse plus aléatoire. En coupe, la ligne sous
le pronostic donne la chance exacte de gagner une séance de tirs au but avec ce onze (`shootoutWinChance`,
`src/game/cups.js` : finition des cinq meilleurs tireurs, réflexes du gardien, même tirage que le match) et la
qualification exacte (victoire, ou nul puis séance gagnée ; le nul comptait pour une demi-qualification). En Elite
(aller-retour depuis la 0.6.0), une journée sur deux se joue chez l'adversaire : « À l'extérieur » en tête, l'avantage
du terrain passe dans son camp (pronostic et buts attendus compris, `prematchOdds(…, { home: false })`), et la plaque
de billetterie devient « Stade adverse · Extérieur » avec les droits TV attendus, seule recette du jour. En Coupe
d'Europe, le budget de saison du club adverse (de 150 à 800 M€, à la mesure de son niveau) s'affiche à côté de son
niveau. Aperçus : `?ecran=avant-match`, `avant-match-coupe` (tour de Coupe nationale, trois titulaires fatigués),
`avant-match-exterieur`, `avant-match-europe`.
Exactitude vérifiée en 0.5.1 (`node tools/sim/pronostic.mjs 20000`, dans le dépôt) : vingt mille matchs du moteur du
direct, effectifs, adversaires, dispositifs, tactiques et conditions tirés au hasard, comparés aux chances annoncées
avant le match et pendant le direct (30e minute, mi-temps, 60e, 75e, 85e). Un match annoncé à 70-80 % de victoire
(74,7 % en moyenne) est gagné 75,2 % du temps ; chaque tranche reste dans le bruit du tirage, la qualification en coupe
aussi. Revérifié en 0.6.0 avec un match de championnat sur trois à l'extérieur : victoire annoncée 34,3 % à
l'extérieur, constatée 33,3 % ; défaite 41,0 %, constatée 41,6 % (dans le bruit du tirage). Le pronostic suppose qu'un blessé est remplacé : le direct le propose, et le staff le fait quand la fin d'une
mi-temps est passée ou que le match se joue d'un bloc (`staffSubs`, `live.js` ; avant la 0.5.1, l'équipe finissait à
dix et perdait environ un point de victoire sur l'annonce). Finir volontairement à dix coûte ce point.
Matchs très déséquilibrés, vérifiés en 0.6.1 (70 000 matchs, 4,5 à 7 points d'écart de niveau) : le calcul était exact
dans les deux matchs sur trois sans expulsion ni blessure ; les expulsions à venir, qu'il ignorait, retiraient au gros
favori environ 0,4 point de victoire. Depuis la 0.7, il les compte : chaque équipe a, à chaque minute, un risque
d'expulsion qui ne dépend que de la minute (`redAt`, `live.js` : 0,10 par équipe et par match comme avant, sept sur
dix en seconde période, six sur dix sur un second jaune, le carton allant de préférence à un joueur déjà averti), et
le pronostic suit toutes les combinaisons de zéro à trois expulsés de chaque côté, minute par minute. Les penalties
(0,28 par match, réussis à 75 %) prennent leur part des buts attendus sans en changer le nombre : le pronostic n'en
dépend pas. Revérifié (0.7) : sur 40 000 matchs très déséquilibrés, le gros favori est annoncé à 87,22 % et gagne
87,28 % du temps ; sur 20 000 matchs ordinaires (`pronostic.mjs`), chaque tranche reste dans le bruit du tirage, avant
le match comme à chaque minute du direct. Seules les blessures à venir restent supposées sans effet (le blessé est
remplacé). Calcul exact et rapide : un écart de buts plus grand que les minutes restantes est une issue certaine, qui
sort du calcul (7 ms pour l'avant-match, contre 45 ms sans cela, résultat identique au dix-millionième de milliardième
près).

Direct (`LiveMatch`, moteur `src/game/live.js`, façon FM depuis la 0.7, choix de l'utilisateur : « entre les temps
forts, des stats en direct ») : pas de terrain en permanence. Le match se simule au fil de l'horloge, avec quatorze
minutes d'avance ; l'écran montre le centre du match, plein écran et opaque (entre deux temps forts, la 3D ne se
dessine pas : c'est aussi un gain de fluidité sur la puce intégrée et l'iPhone) :
- en tête, le tableau de score : écussons, noms des clubs (codes de trois lettres sur téléphone), score en plaque
  dorée, horloge, et dessous les buteurs de chaque équipe (minutes, « (pen.) ») et les expulsés ;
- trois colonnes sur PC : les notes du match de nos joueurs, au centre les statistiques (ou le fil, en onglet), les
  notes des leurs ; sur téléphone, des onglets Stats, Notes (une équipe à la fois) et Le fil ;
- statistiques en direct (`statsOf`) : possession (qui ondule minute après minute autour de la tendance de la
  mi-temps), tirs, tirs cadrés, grosses occasions, buts attendus, arrêts, poteaux, cartons, penalties (dès le
  premier), en barres opposées ; puis le pronostic final (toujours visible, juste sous les statistiques) et les temps
  forts en colonnes ; seulement ce que le direct a déjà montré ;
- notes du match des deux équipes (`ratingsAt`), qui évoluent au fil du match : numéro, poste, nom, faits (buts,
  passes décisives, cartons, blessure, entrée et sortie avec la minute), note au dixième ; chez nous, un filet de la
  couleur de la condition physique sous chaque joueur (`docs/JOUEURS.md` : la note finale est celle du coup de sifflet).
Temps forts (`highlightOf`, `live.js`) : buts, penalties, expulsions, grosses occasions, arrêts (hors frappes
difficiles) et poteaux, environ cinq par match ; en accéléré (×4), les buts, les penalties et les expulsions
seulement, sans ralenti. À l'approche d'un temps fort, l'horloge s'arrête au début de son action (0,12 minute avant
l'instant décisif), le centre du match s'efface et la 3D le joue (`matchFeed.hl`, `src/three/matchplay.js`) ; le
direct révèle l'événement (score, bandeau « BUT ! », son, fil) à l'instant décisif que la scène lui signale
(`hlReveal`), jamais avant ; l'horloge suit l'action, puis vient la joie du buteur et le ralenti d'un but, et le centre
du match revient (`hlDone`). Pendant un temps fort, il reste le score façon télé en haut à gauche, une étiquette en
haut à droite qui ne dévoile pas l'issue (« Temps fort 23′ », « Penalty 64′ », « Ralenti » pendant le ralenti) et,
dans la barre du bas, « Passer le temps fort ». Sans réponse de la scène en 1,5 s (pas de WebGL, onglet caché), le
direct se passe d'elle : l'événement s'affiche avec son bandeau et une pause, comme avant ; au-delà de 32 s, le temps
fort se termine quoi qu'il arrive. Le bouton « Changement » (avec le nombre de
changements restants) arrête le match à toute minute et ouvre la même carte qu'à la mi-temps : composition sur le
terrain (notes du match en pastille, condition en barre), tactique, pronostic final recalculé ; « Reprendre » applique
tout au prochain arrêt de jeu, une à deux minutes plus tard (`subMinute`), après tout ce que le direct a déjà montré : les
minutes simulées d'avance sont reprises depuis un instantané et rejouées avec le nouveau onze (`change`). Une blessure
(croix médicale dans le fil et dans les notes) arrête le match d'elle-même s'il reste un changement et un remplaçant
disponible ; sinon l'équipe joue à dix. Passer la fin d'une mi-temps (« Mi-temps », « Fin du match ») laisse le staff
remplacer un blessé (`advanceTo(…, { staff: true })`). Cinq changements par match, à la pause ou en jeu. Aperçus :
`?ecran=direct`, `direct-but`, `direct-notes`, `direct-fil`, `direct-temps-fort`, `direct-ralenti` (ces deux-là sans
la 3D), `mi-temps`, `mi-temps-compo`, `changement`.
Onze adverse (0.7, `src/game/opponents.js`) : de vrais joueurs (noms, postes selon le dispositif du club, numéros, âge,
qualités, signes, visages) au niveau du club adverse, les mêmes à chaque rencontre de la saison (tirés d'une graine :
le club et la saison, sans toucher aux noms ni au hasard de la partie). Ils marquent, passent, prennent les cartons et
ont leurs notes ; le moteur compte encore leurs occasions sur le niveau du club, et opposer deux effectifs réels (ligue
entre amis) partira de là.
Reprise après une fermeture de l'app (0.5.1, choix de l'utilisateur : « reprise à la minute ») : le direct se sauvegarde
à part (`save.js`, `saveLive`, clé `….live`) au coup d'envoi, à chaque étape (changement, mi-temps, fin), au plus toutes
les deux secondes pendant le jeu et quand l'app passe en arrière-plan : tout l'état du moteur (`live.save`, la suite
déjà simulée d'avance comprise : fermer l'app ne rejoue rien), la minute, les événements montrés, la période, la
vitesse. À la réouverture, l'écran titre annonce « Match en cours · 63e minute contre … » sous « Continuer », et le
direct reprend à la minute près (une ligne « Le match reprend à la 63e minute… » en tête du fil, un court temps avant
de repartir ; un changement en préparation n'est pas repris). L'enregistrement n'est repris que pour le même match
(`liveKeyOf` : club, date, compétition, adversaire) et la même version du moteur (`LIVE_VERSION` 2 depuis la 0.7 : un
direct d'avant n'est pas repris) ; il s'efface une fois le résultat sauvegardé, à un nouveau coup d'envoi, à une
nouvelle partie ou à l'import d'une sauvegarde. Avant-match : la composition est dépliée d'office sur PC (le onze à
gauche, les réglages à droite) et repliée sur téléphone dans la même carte qu'à la mi-temps (`CompoCard`), avec
« Meilleur onze » dessous ; dépliée, elle cachait sur téléphone le pronostic et tout le reste de l'avant-match.

Habillage du direct (classes `lv-`) :
- Score façon télé pendant un temps fort, en haut à gauche : écussons, codes de trois lettres des clubs
  (`src/ui/teamcode.js` : le mot le plus distinctif du nom, sans accents ni mots génériques ; « Saint-Clair » → SCL,
  « FootOFF FC » → FOF ; l'adversaire prend une variante si les deux codes se ressemblent), score en plaque dorée,
  horloge (rouge en jeu).
- Bandeau « BUT ! » (« But VAU » pour l'adversaire) : portrait et nom du buteur, minute, « sur penalty », passeur, rang
  du but dans la saison pour nos joueurs (« 3e but de la saison »), score.
- Temps forts : 45 colonnes de deux minutes au-dessus et au-dessous d'un axe (notre domination en or, celle de
  l'adversaire en gris bleuté), tirées des tirs déjà montrés (but, arrêt ou poteau, à côté, pondérés par la qualité de
  l'occasion) et de la possession, avec un point pour chaque but ; rien n'annonce une action pas encore montrée.
- Pronostic final pendant tout le match : les chances exactes du moteur (`live.oddsShown`) à partir de ce que le
  direct a déjà montré (buts, cartons rouges, blessures), jamais des quatorze minutes simulées d'avance ; à la
  mi-temps, calculé depuis la fin réelle de la première période (temps additionnel compris).
- Fond du centre du match : sombre, une lueur or en haut, verte en bas, et le tracé d'un terrain à peine visible.

Chaque match enregistre son onze de départ (dans l'ordre des postes de la formation), ses changements, la formule
des billets du jour, le prix du billet et les recettes détaillées (`recordMatch`, `src/game/season.js`). Le Stats
Pass montre le onze sur le terrain (note du match dans la pastille, flèche sur les remplacés, changements dessous)
et une section Billetterie (formule, prix, affluence, spectateurs restés aux guichets, recettes par poste).

## Stade et match en 3D

Hors match, le stade est vide et immobile ; l'équipe s'entraîne au centre d'entraînement (rien tant qu'il n'est pas
construit). Le jour de match (`src/three/matchplay.js`) : échauffement des deux équipes avant le coup d'envoi,
maillots adverses propres à chaque club (`src/game/kits.js`). Pendant le direct (0.7), la 3D ne joue que les temps
forts que l'écran lui demande (`matchFeed.hl`) et ne se dessine que pendant ceux-ci (`matchFeed.show3D`, boucle de
rendu d'`Empire3D`) :
- chaque action est construite comme une vraie, selon son type (`live.js`) : les deux équipes placées selon leur
  dispositif (le onze adverse a le sien), puis la relance, les passes au sol ou en profondeur, le centre (tête ou
  volée selon le commentaire), le centre en retrait, l'une-deux, la percée, le pressing, la frappe lointaine, le corner
  (joueurs dans la surface, marquage), le coup franc direct (mur à 9,15 m, frappe enroulée au-dessus), le penalty (tout
  le monde hors de la surface et de l'arc, élan du tireur, plongeon au moment de la frappe), l'expulsion (contre, le
  fautif fauche le porteur, qui s'écroule, carton rouge brandi, il sort) ;
- le tireur est le joueur que le commentaire nomme, le dernier passeur aussi quand il y en a un ; les autres font leurs
  appels (premier poteau, second poteau, point de penalty), la défense recule en bloc, coulisse, presse le porteur et
  marque côté but dans la surface ;
- l'issue est celle du moteur : la frappe vise le petit filet loin du gardien pour un but (il plonge trop court ou du
  mauvais côté), à sa portée pour un arrêt (il capte ou repousse en corner), le poteau ou la barre, ou à côté ;
- l'instant décisif (ballon au fond des filets, dans les gants, sur le poteau, dehors, carton brandi) est signalé au
  direct (`hlReveal`) ; ensuite la joie du buteur (course vers le public, coéquipiers autour, bras levés), le gardien
  qui garde le ballon ou le fautif qui sort, puis, pour un but, un ralenti de l'action rejoué depuis son enregistrement
  (2,6 s avant l'instant décisif, 0,8 s après, à mi-vitesse) ; fin signalée par `hlDone` ;
- toutes les positions sont tirées d'une graine propre à l'occasion : un temps fort se rejoue à l'identique.
Réalisation télé (`broadcastStep`, `src/ui/Empire3D.jsx`) : caméra dans l'axe de la tribune principale, en plan large,
qui suit le ballon et serre le plan selon l'action (attaque, coup de pied arrêté, carton, joie du buteur, ralenti un
peu plus serré), sans jamais filmer les joueurs de près ni de dos ; dans le dernier tiers, le cadre penche vers le but
pour garder ballon et cage à l'image (écran en portrait compris) ; un nouveau temps fort et le ralenti changent de plan
d'un coup (`cut`). Pendant tout le direct, la réalisation garde la caméra : ni rotation, ni zoom, ni déplacement, et le
complexe ne réagit à rien ; `pickPlot` d'App refuse aussi toute parcelle pendant un match (avant-match compris).
Bancs d'essai (dans le dépôt) : `node tools/sim/temps-forts.mjs` joue sans affichage chaque type d'action avec chaque
issue, des deux côtés, et l'expulsion (98 temps forts : tous aboutissent, instant décisif entre 2,7 et 7 s, fin entre
4,2 et 16,8 s ralenti compris) ; `/tools/sim/temps-forts.html` (avec `npx vite`) les joue en temps réel sur une pelouse
simple, avec la même caméra (`?w=390&h=844` : cadrage d'un téléphone).
Public
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

## Mémoire (longues parties)

Sur iPhone, Safari recharge sans prévenir une page qui garde trop de mémoire : écran blanc, puis l'écran de
chargement (aucune perte : la partie est enregistrée à chaque action, le direct reprend à la minute). Depuis la 0.7.1 :
- photos des modèles partagées (`src/three/assets.js`) : chaque GLB embarque ses images (béton, brique, verre,
  gazon…), les mêmes d'un niveau et d'un bâtiment à l'autre, et un modèle chargé reste en mémoire jusqu'à la fermeture
  (améliorations, aperçus de la vitrine). Une image aux mêmes octets n'est décodée et envoyée au GPU qu'une fois.
  Tous les modèles chargés : 270 images, 388 Mo décodés et 517 Mo de textures avant ; 76 images, 100 et 134 Mo après.
  Complexe complet de l'Elite : 178 -> 115 Mo de textures ;
- épreuves d'entraînement : une seule toile 3D pour la partie (voir Centre d'entraînement) ; le contexte d'essai du
  démarrage est rendu tout de suite ;
- vérifié sans tête (Chromium, rendu logiciel) : dix matchs avec les menus et un changement de saison, tas JS, nœuds
  DOM et ressources three stables d'un tour à l'autre ; quatre séances d'épreuves enchaînées, un seul contexte 3D pour
  elles, toile des épreuves vide entre deux séances.

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
