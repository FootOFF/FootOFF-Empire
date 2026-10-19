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
- `RatingBadge` : note de match sur 10 (or ≥ 8, doré clair ≥ 7, rouge < 5,5).
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

## Contrôle

La galerie (`?galerie` dans l'adresse du jeu) affiche chaque écran avec des données fictives, sur téléphone
(390 × 844) et sur PC (1280 × 720), sans toucher à la sauvegarde. Chaque modification d'interface se relit là.
