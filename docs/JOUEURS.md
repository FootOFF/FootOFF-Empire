# Les joueurs de FootOFF Empire

Code : `src/game/players.js` (modèle, progression), `src/game/live.js` (effets en match, notes),
`src/ui/squad.jsx` (tableau, fiche, comparateur).

## Notes

- **Niveau** sur 20 avec une décimale (7,8), calculé selon le poste à partir des caractéristiques.
- **Caractéristiques** sur 20 (stockées avec une décimale, affichées arrondies) :
  - joueurs de champ : finition, passe, dribble (technique) · vitesse, endurance, puissance (physique) ·
    placement, défense, sang-froid (tactique et mental) ;
  - gardiens : réflexes, placement, jeu aérien, un contre un, relance, sang-froid.
- **Note de match** sur 10, comme dans la presse : base 6, résultat, buts (+1), passes décisives (+0,6),
  cartons, niveau face à l'adversaire, clean sheet (gardien +0,8, défenseurs +0,4), part d'aléa.
- Les couleurs de l'interface comparent une valeur au niveau moyen de la division (forte, faible).

## Poids par poste (niveau = moyenne pondérée)

| Poste | Caractéristiques principales |
|---|---|
| Attaquant | finition 26 %, dribble 16 %, vitesse 14 %, sang-froid 12 % |
| Milieu | passe 22 %, placement 14 %, endurance 14 %, dribble 12 % |
| Défenseur | défense 28 %, placement 20 %, puissance 16 % |
| Gardien | réflexes 28 %, placement 20 %, un contre un 16 %, jeu aérien 14 % |

Hors de son poste : poste de dépannage −5 %, ligne voisine −12 %, ligne opposée −25 %,
gardien ↔ joueur de champ −50 %.

## Profil

Pied fort, poste de dépannage, numéro de maillot, 0 à 2 signes distinctifs tirés de ses points forts :
Finisseur (+15 % de conversion), Passeur (passes décisives ×3), Roc (adversaire −3 % d'occasions),
Chat (gardien, −8 % de buts encaissés), Leader (+0,1 au niveau d'équipe), Sang chaud (cartons ×2,5),
Joueur des grands soirs (contre plus fort), Infatigable, Flèche, Frappe lointaine.

## Condition physique, blessures, suspensions

Code : `src/game/players.js` (condition, blessures, disponibilité), `src/game/live.js` (effets en match), `src/game/season.js`
(après chaque match).

- **Condition** (`fit`, 0 à 100, 100 au repos) : un match complet coûte 25 points à un joueur très endurant, 36 à un joueur
  peu endurant (moitié pour un gardien ; « Infatigable » : ×0,6), au prorata du temps de jeu. Chaque date du calendrier
  rend 28 points jusqu'à 27 ans, 24 jusqu'à 31, 20 ensuite, plus 2 par niveau du centre d'entraînement (son centre
  médical). En match, elle baisse minute après minute et pèse sur le niveau du joueur (jusqu'à −15 % à zéro) : le
  pronostic en tient compte, « Meilleur onze » aussi (un titulaire épuisé cède sa place à un remplaçant frais). L'été
  remet tout le monde à 100.
- **Blessures** : en match, chaque joueur de champ risque une blessure à chaque minute (environ une tous les quatre
  matchs pour l'équipe, trois fois et demie plus pour un joueur à bout de forces). Il sort ; s'il reste un changement,
  le match s'arrête pour le faire. Durée tirée à la fin du match, en dates du calendrier : coup reçu (1), élongation (2),
  entorse (3), claquage (4), déchirure musculaire (6), fracture (9). Un blessé ne joue pas, ne s'entraîne pas et ne
  profite pas de la séance collective ; l'intersaison soigne tout.
- **Suspensions** : un carton rouge direct vaut deux matchs, un second carton jaune un match, trois cartons jaunes dans
  la saison un match. Une suspension se purge à chaque date jouée par le club, même d'une saison sur l'autre.
- Un joueur indisponible reste sur le banc, grisé, et quitte le onze (`ensureLineup` après chaque match). Les absents
  sont listés dans l'avant-match, à l'après-match (infirmerie et suspensions), dans une notification et au journal.

## Progression

- Intersaison : vers le potentiel caché, selon l'âge, plus lente au sommet ;
  déclin dès 32 ans (le physique d'abord). Rythme calé par la simulation de carrières (`tools/sim/career.mjs`,
  `docs/ECONOMIE.md`) : pour un bon joueur, Elite vers la saison 10, premier titre vers la 17e, onze de 24 à 26 ans en
  moyenne ; masse salariale à 75-90 % des revenus en Elite.
- Valeur de marché (`marketValue`) : deux saisons de salaire, plus pour un jeune à potentiel, moins pour un trentenaire ;
  c'est la référence des indemnités et des offres (`docs/ECONOMIE.md`).
- Au fil de la saison : séances du centre d'entraînement pour l'équipe première (`docs/DESIGN.md`) ; à l'académie,
  un petit progrès après chaque journée (1,2 % de la marge, freiné près du sommet), sans effet du centre, et six
  dixièmes du bond de l'été, comme l'équipe première (depuis la 0.5.0 : un jeune doué touchait son potentiel avant 19 ans).
- Jeunes repérés (`YOUTH_GEN`, `src/game/constants.js`) : 15 à 17 ans, niveau à l'arrivée de 4 à 6 (académie 1) à 6 à 8
  (académie 5) ; potentiel de huit jeunes sur dix de 8 à 14 (académie 1) à 12 à 18 (académie 5), un sur cent à 16 ou
  plus (académie 1), à 20 (académie 5). Recruté à 15 ans, un jeune finit ses 18 ans à 7,5 en moyenne (académie 1),
  10,5 (académie 5), 12,7 pour un potentiel de 18 ou plus : il éclot ensuite, en équipe première.
- Potentiel affiché en fourchette : elle se resserre avec l'académie et les saisons passées au club.
- Vie du joueur : forme (5 derniers matchs), statistiques de saison, historique des 10 dernières saisons,
  évolution du dernier été.

Les sauvegardes antérieures sont converties automatiquement : chaque joueur garde sa note au poste naturel.
