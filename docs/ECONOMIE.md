# Économie de FootOFF Empire

Toutes les formules vivent dans `src/game/economy.js`, les réglages par division et le coût des bâtiments
dans `src/game/constants.js`. Les valeurs ci-dessous ont été calées par simulation de carrières complètes.

## Le modèle

**Stade** : 600 places (terrain municipal), 3 500 (tribune couverte), 14 000 (stade 4 tribunes),
38 000 (arène moderne). Coût : 40 k€, 400 k€, 4 M€.

**Affluence** = min(capacité, public potentiel). Le public potentiel dépend de la division
(650 → 40 000), de la réputation (rendement décroissant, ×0,45 à ×1,45), de l'espace supporters
(+7 % par niveau), de la forme de l'équipe (±10 %) et de l'affiche (±8 % selon l'adversaire).
Un stade trop petit laisse des supporters dehors : l'écran de fin de match et l'inspecteur du stade
le signalent.

**Recettes d'un match à domicile** :

| Division | Billet | Buvette / spectateur | Boutique / spectateur | Droits TV / match |
|---|---|---|---|---|
| Départementale | 6 € | 2 € | 1 € | — |
| Régionale | 10 € | 3 € | 2 € | 4 000 € |
| Nationale | 16 € | 4 € | 3,5 € | 45 000 € |
| Elite | 28 € | 5 € | 6 € | 220 000 € |

Buvette +10 % et boutique +12 % par niveau d'espace supporters ; la boutique suit aussi la réputation.

**Revenus de saison** : sponsors (5 k€ → 1 M€ selon la division, +40 % par niveau du siège),
prime de classement (champion : 6 k€ → 1,6 M€, dernier : 10 % de la prime), revenus hors ligne
(1 % des sponsors par heure et par niveau du siège, 12 h au plus).

**Salaires** (payés en fin de saison) : 800 € × 1,7^(note − 6) jusqu'à une note de 13, puis ×1,35 par
point, multiplié par 1 / 2,7 / 6,2 / 10 selon la division. Un onze adapté à sa division coûte 45 à 65 %
des revenus ; en Elite, la masse salariale grimpe avec la qualité de l'effectif (80 à 90 %), ce qui
stabilise la fin de partie.

**Transferts** : signer un joueur libre coûte 1,5 saison de salaire ; le vendre rapporte 1,2 saison.
Acheter puis revendre fait perdre de l'argent, former un jeune et le revendre en fait gagner.

**Charges** : entretien des installations, 4 % de ce qui a été investi chaque saison.

**Plan de redressement** : une saison bouclée dans le rouge déclenche la vente des plus gros salaires
par le conseil (jusqu'à revenir au-dessus de zéro, sans descendre sous 13 joueurs).

## Simulation (200 carrières × 50 saisons, `sim_eco.mjs`)

Un joueur automatique gère le club : meilleur onze, recrutement quand un joueur libre améliore l'équipe,
bâtiments par priorité (stade dès que le public dépasse la capacité), réserve de trésorerie. Trois profils
ont été testés : raisonnable, passif (ne recrute jamais) et dépensier (aucune réserve).

| | Avant | Après (raisonnable) | Passif | Dépensier |
|---|---|---|---|---|
| Première montée en Régionale | saison 2 | 3 | 2 | 3 |
| Nationale | saison 5 | 7 | 8 | 7 |
| Elite | saison 9 | 12 | 14 | 11 |
| Premier titre en Elite | saison 14 | 20 | 20 | 20 |
| Saisons en Elite gagnées | ~100 % | 40 % | 45 % | 43 % |
| Tous les bâtiments au maximum | saison 11 | 17 | 18 | 16 |
| Salaires / revenus (D1 → Elite) | 14 % → 2 % | 59 % → 79 % | 52 % → 90 % | 64 % → 80 % |
| Carrières passées dans le rouge | 0 % | 3 % | 17 % | 1 % |
| Trésorerie médiane, saison 50 | 8 M€ (sans usage) | 112 M€ (stabilisée) | 51 M€ | 100 M€ |

Avant : stade plafonné à 1 600 places, salaires négligeables, argent accumulé sans usage dès la
saison 11. Après : chaque division change d'échelle (budget ×10 environ), le stade devient une vraie
décision, les salaires pèsent, et la trésorerie se stabilise en fin de partie au lieu d'exploser.

Prochaines sources de dépense prévues (feuille de route) : marché des transferts, personnel du club,
bâtiments des parcelles vides, compétitions continentales.

## Écran Finances (livre de comptes)

- `src/game/ledger.js` range chaque mouvement d'argent par poste : billetterie, buvette, boutique, droits TV,
  sponsors, prime de classement, primes d'objectif, ventes, revenus hors ligne ; salaires, entretien, travaux,
  recrutements. Une saison bouclée garde ses totaux et ses trésoreries de début et de fin (12 dernières).
  Vérifié par simulation : début + recettes − dépenses = fin, à l'euro près, sur 520 saisons.
- `endOfSeasonForecast` : trésorerie actuelle + matchs restants (recette attendue) + sponsors + prime au
  classement actuel − salaires − entretien. C'est la ligne « Fin de saison prévue » des fenêtres de recrutement
  et de vente, et le conseil du staff « Fin de saison dans le rouge ».
- `investmentPreview` : pour un niveau de bâtiment de plus, recettes gagnées par saison (7 matchs et sponsors),
  entretien supplémentaire (4 % du coût) et saisons nécessaires pour rentrer dans ses frais, dans la division
  actuelle. Entraînement et académie : investissement sportif, sans recette directe.
- Les parties commencées avant cet écran démarrent leur livre de comptes à la trésorerie du moment.
