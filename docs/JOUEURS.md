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

## Progression

- Intersaison : vers le potentiel caché, selon l'âge, plus lente au sommet ;
  déclin dès 32 ans (le physique d'abord). Rythme calé par la simulation de 50 saisons (`docs/ECONOMIE.md`) :
  Elite vers la saison 11, premier titre vers la 19e, masse salariale à 79 % des revenus en Elite.
- Au fil de la saison : séances du centre d'entraînement pour l'équipe première (`docs/DESIGN.md`) ; à l'académie,
  un petit progrès après chaque journée, sans effet du centre.
- Potentiel affiché en fourchette : elle se resserre avec l'académie et les saisons passées au club.
- Vie du joueur : forme (5 derniers matchs), statistiques de saison, historique des 10 dernières saisons,
  évolution du dernier été.

Les sauvegardes antérieures sont converties automatiquement : chaque joueur garde sa note au poste naturel.
