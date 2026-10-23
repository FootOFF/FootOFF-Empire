# FootOFF Empire — Plan 3D (direction semi-réaliste)

Direction retenue : **semi-réaliste, modèles GLB détaillés**, matériaux PBR, éclairage physique.
Le procédural actuel reste en **repli** : tant qu'un GLB n'existe pas, le jeu affiche la version primitive.

## Identité visuelle : FootOFF Media
Charte relevée sur footoff.media : fond #090909, surfaces #121212, or #C7A15A (dégradé du logo #B9924C → #DEC17F),
blanc cassé #F3F2EE, gris #8B8B8B ; titres Geist (capitales), libellés Geist Mono espacés, texte Inter.
- Interface : `src/styles.css` (jetons), monogramme FO vectoriel et lockup dans `src/ui/brand.jsx`, favicon.
- 3D : sièges anthracite et rangs or, toitures graphite avec grands monogrammes FO dorés (lisibles depuis
  la caméra), panneaux et écrans au logo FootOFF Media (`assets-src/brand/`), LED or la nuit.
- Règle Blender : les couleurs des matériaux sont saisies en sRGB (charte) et converties en linéaire
  (`srgb_to_linear` dans le générateur) — sinon tout sort trop clair.

## Interface de jeu
Vue 3D plein écran (décor permanent) + HUD en verre fumé : club et progression de saison (haut gauche),
trésorerie et réputation (haut droite), objectif repliable, outils de vue (nuit, jour de match, recentrer),
carte « prochain match » (bas droite), dock de navigation (Empire, Effectif, Saison, Journal).
Panneaux latéraux pour l'effectif, la saison et le journal ; inspecteur de parcelle au clic ; écrans
cinématiques pour le résultat de match, le bilan de saison et le retour hors ligne. Mobile : dock bas,
panneaux plein écran, inspecteur en feuille basse. Code : `src/App.jsx`, `src/ui/hud.jsx`, `panels.jsx`,
`inspector.jsx`, `overlays.jsx`, `styles.css`.

## Échelle de référence
- **1 unité three = 10 m.** Un terrain réglementaire (105 × 68 m) ≈ 10,5 × 6,8 unités.
- Parcelle standard : **6 × 6 unités** (60 × 60 m).
- Emprise réservée au stade : **16 × 13 unités**.
- Les modèles sont exportés de Blender en mètres (1 m = 1 unité Blender) puis mis à l'échelle ×0,1
  par le loader (`scale` dans le manifeste), ou auto-ajustés à l'emprise (`fit: true`).

## Phase 0 — Fondations techniques ✅ (cette itération)
- Rendu physique : sRGB, tone mapping ACES, environment map PMREM (RoomEnvironment), ciel physique (Sky),
  soleil avec ombres douces 2048 px, jour par défaut, nuit lisible (projecteurs du stade).
- Grille d'urbanisme cohérente (`src/three/layout.js`) : plus de chevauchement stade / parcelles.
- Pipeline GLB (`src/three/assets.js` + `src/three/manifest.js`) : GLTFLoader + Draco + KTX2 + Meshopt,
  cache, normalisation (ombres, échelle, ancrage au sol), remplacement asynchrone du procédural.
- Rendu incrémental : seule la parcelle modifiée est reconstruite.
- Matériaux/géométries procédurales partagés, chargement paresseux de la 3D (chunk séparé),
  boucle de rendu en pause hors écran / onglet caché.
- Choix technique : three.js « vanilla » découpé en modules (`src/three/`), sans React Three Fiber —
  aucune dépendance ajoutée. Les décodeurs Draco/KTX2 sont fournis par three et émis par Vite,
  téléchargés uniquement si un GLB compressé est chargé.
- Validé dans le navigateur avec un GLB de test (échelle ×0,1, ancrage au sol, repli niveau inférieur,
  enseigne `emissive_*` allumée la nuit).

## Phase 1 — Pipeline de production des assets ✅
Guide complet pour les artistes : [assets-src/README.md](../assets-src/README.md).
- Sources : `assets-src/models/buildings/<bâtiment>/<bâtiment>_L<n>.glb` (+ `.json` de réglages facultatif).
- Budgets et conventions : `assets-src/budgets.json`, source unique lue par Node et par Blender.
- Export Blender : `tools/blender/footoff_export.py` (une collection par modèle, contrôles avant export :
  unités, emprise, ancrage, UV, textures manquantes, Principled BSDF, triangles, matériaux).
  Testé sous Blender 5.2, dans l'interface ou en ligne de commande.
- Optimisation : `npm run models` (gltf-transform) — dédoublonnage, instancing GPU (≥ 5 copies),
  fusion des maillages en préservant les nœuds spéciaux, textures WebP redimensionnées, Meshopt.
  Contrôle des budgets après optimisation, rapport `assets-src/models/REPORT.md`,
  manifeste `src/three/models.generated.js` régénéré (le jeu le lit automatiquement).
- `npm run models:check` pour la CI (code de sortie 1 si erreur).
- Reste à faire plus tard : LOD automatiques (phase 5), textures KTX2 (nécessite l'outil `ktx` installé).

## Phase 2 — Bâtiments (5 niveaux, silhouettes distinctes)
**Stade ✅ (terrain_L1 à L4)** — généré par script : `tools/blender/models/build_stadium.py`
(textures procédurales comprises), source `assets-src/blend/stadium.blend`, publié via le pipeline.
| Niveau | Contenu | Triangles | Draw calls | Poids |
|---|---|---|---|---|
| L1 | Terrain municipal usé, main courante, abris, club-house, gradins bois, 4 poteaux | 4 156 | 13 | 123 Ko |
| L2 | Tribune couverte à l'ancienne (sièges, allées), virage debout côté caméra, panneaux pub | 3 020 | 13 | 123 Ko |
| L3 | 4 tribunes, nord à deux étages + loges + toit haubané, pylônes en treillis, écran géant | 13 664 | 14 | 387 Ko |
| L4 | Cuvette continue, angles nord en éventail, toit annulaire, façade vitrée, LED, écrans, sud ouvert | 19 328 | 15 | 658 Ko |

Reste à faire pour le stade : foule instanciée (`crowd_*`), couleurs du club sur les sièges,
projecteurs réels aux positions `light_*` (phase 4).

| Bâtiment | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Stade (max 4) | Terrain municipal, main courante, abri de touche | Tribune latérale couverte en tôle | Stade 4 tribunes béton, toit principal, pylônes | Arène moderne, toit continu, façade LED, couronne de projecteurs | — |
| Centre d'entraînement | Terrain annexe + vestiaire préfa | Bâtiment brique + 2 terrains | Salle de musculation vitrée | Centre de performance, terrain couvert | Campus avec centre médical |
| Académie | Petite école | Dortoir | Campus + terrain synthétique | Internat + salles de classe | Académie signature, mini-stade |
| Espace supporters | Buvette | Fan zone, guirlandes | Bar des supporters | Écran géant + boutique | Place des supporters, statue |
| Siège & partenaires | Bureaux R+1 | Immeuble R+3 | Immeuble vitré | Tour avec logo lumineux | Tour signature + hall partenaires |

Foule instanciée dans les tribunes (densité = taux de remplissage du dernier match), couleurs du club.
Le côté caméra des tribunes reste bas ou en coupe pour que la pelouse soit toujours visible.

**Bâtiments ✅ (training, academy, fans, sponsor — niveaux 1 à 5)** — `tools/blender/models/build_buildings.py`.
Architecture moderne sombre : bardage anthracite, verre fumé (bureaux allumés au hasard la nuit), cèdre,
toitures-terrasses grises avec équipements, ailettes et monogrammes dorés, parcelles paysagées.
82 à 167 Ko par modèle, 1 300 à 4 900 triangles. Code commun : `footoff_lib.py` (outils, logo, matériaux)
et `footoff_modern.py` (textures et éléments d'architecture).

## Phase 3 — Écosystème (premier jet ✅)
`tools/blender/models/build_site.py` : site urbain (boucle de voirie, boulevard sud, trottoirs, promenade,
parvis du stade avec monogramme doré, lampadaires allumés la nuit, arbres, voitures) + parcelles vides
(dalle sombre, contour doré) et verrouillées (chantier palissadé, grue dorée). Chargés comme props.
Reste : ville environnante qui évolue avec la division, circulation animée.
Plateau paysager (relief léger, bords sculptés), routes et parking, végétation instanciée,
lampadaires, ville environnante qui s'urbanise avec la division, secteurs verrouillés en chantier
(palissades, grue, panneau « Réputation N »). Nouveaux bâtiments pour remplir les parcelles vides
(boutique, parking, hôtel, musée) — décision de game design.

## Phase 4 — Vie & feedback ✅ (premier jet)
- **Foule** (`src/three/crowd.js`) : zones `crowd_*` générées dans le stade (chaque rang de sièges / gradin
  debout), jusqu'à 7 000 spectateurs instanciés en un draw call, tenues sombres et or FootOFF, balancement
  et sauts de célébration dans le shader. Remplissage = affluence réelle du dernier match.
- **Projecteurs** (`src/three/lights.js`) : SpotLights aux empties `light_*` (6 pour le stade, 2 pour les
  terrains d'entraînement), visant le barycentre ; éteints le jour, allumés la nuit, poussés en jour de match.
- **Survol** : contour doré pulsant autour de la parcelle + étiquette (nom, niveau, coût d'amélioration).
- **Chantier** (`src/three/fx.js`) : échafaudage à filet doré + poussière, puis le bâtiment sort de terre,
  anneau doré de fin. L'ancien bâtiment reste visible tant que le nouveau charge.
- **Jour de match** : bouton dédié et ouverture automatique après un match joué ; caméra sur le stade,
  nuit, stade plein, LED, feux d'artifice dorés en cas de victoire, bandeau du score.
Reste : circulation animée, joueurs animés (GLB riggés), son d'ambiance.

**3D vivante ✅** — `src/three/life.js` : circulation sur la boucle du stade et le boulevard (modèle de poursuite :
chaque voiture garde ses distances, aucun dépassement fantôme — testé sur 10 min simulées) et joueurs du club à
l'entraînement (rondo, sprints, footing). `src/three/players.js` : modèle de joueur réaliste instancié (anatomie,
tenue du club, teints variés, course animée dans le shader) et le onze en 4-3-3 sur la pelouse du stade.
`src/three/motion.js` : locomotion (accélération, freinage, rotation limitée, foulée liée à la distance :
pas de pieds qui glissent) et moteur de passes (contrôle, conduite, orientation, frappe animée, ballon qui
roule avec décélération réaliste ou passe lobée, réception sur la trajectoire, tirs et relance du gardien).
Squelette du joueur animé dans le shader (hanches, genoux, épaules, coudes, frappe), ombres comprises.
Testé en simulation : passes toutes contrôlées, ballon jamais hors du terrain, aucun glissement de pied.
Choix de direction : aucune silhouette humaine autre que nos joueurs (pas de foule, pas de passants, pas
d'entraîneur), aucune voiture statique. Météo (pluie, neige saisonnières) retirée le 2026-10-23 : toujours par temps
clair. Cycle jour / nuit réel dans `environment.js`.

**Match en direct ✅** — le cœur émotionnel du jeu (30 à 60 s à vitesse normale, ~17 s en x4).
- Avant-match (`src/ui/match.jsx`, `PreMatch`) : onze en 4-3-3 sur un schéma tactique (clic sur un poste pour
  changer de joueur, pénalité hors poste : ligne voisine −12 %, opposée −25 %, gardien ↔ champ −50 %), banc de
  remplaçants, tactique parmi trois (`src/game/tactics.js` : Offensive, Équilibrée, Bloc bas) et pronostic
  victoire / nul / défaite recalculé en direct (loi de Poisson sur les buts attendus).
- Direct (`LiveMatch` + moteur `src/game/live.js`) : simulation minute par minute, une mi-temps à la fois
  (occasions, buts, cartons, ambiance commentée, temps additionnel), score et chrono, fil de commentaires,
  boutons x1 / « Accélérer x4 » / aller à la mi-temps ou au coup de sifflet, son on / off.
- Mi-temps : un changement (titulaire ↔ remplaçant) et une nouvelle tactique, avec le pronostic final mis à
  jour à partir du score ; le moteur rejoue la seconde période avec ces choix.
- 3D (`Empire3D.jsx`) : vue TV recentrée dans la zone libre de l'écran ; sur nos buts, plan de coupe sur le but,
  ralenti (~4 s, synchronisé avec la pause du direct), salves dorées et LED du stade boostées ; but encaissé :
  projecteurs qui baissent et caméra qui tremble. La « foule qui réagit » passe par le stade (lumières, LED,
  feux) et par le son, sans silhouette de spectateur (choix de direction ci-dessus).
- Son (`src/ui/sound.js`) : rumeur de foule, « ooh », clameur, silence, sifflet, tout synthétisé en Web Audio.
- Validé en simulation (4 000 matchs par tactique) : résultats simulés à 1–2 points du pronostic affiché.

## Phase 5 — Performance & post-traitement
Bloom (projecteurs, LED), SSAO/GTAO léger, LOD, instancing, ombres en cache, résolution adaptative,
qualité auto (bas / moyen / haut). Cible : 60 fps mobile milieu de gamme en qualité « moyen ».

## Ajouter un modèle (procédure)
1. Dans Blender, une collection `fans_L2` → lancer `tools/blender/footoff_export.py`.
2. `npm run models` → le modèle est optimisé, publié et ajouté au manifeste automatiquement.
3. Si un niveau n'a pas son GLB, le loader prend le **niveau inférieur le plus proche** disponible,
   sinon le procédural.
