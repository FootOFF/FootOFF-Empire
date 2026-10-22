# Économie de FootOFF Empire

Toutes les formules vivent dans `src/game/economy.js`, les réglages par division et le coût des bâtiments
dans `src/game/constants.js`. Les valeurs ci-dessous ont été calées par simulation de carrières complètes.

## Le modèle

**Stade** : 600 places (terrain municipal), 3 500 (tribune couverte), 14 000 (stade 4 tribunes),
38 000 (arène moderne), puis l'arène fermée : 55 000 (deux étages, toit en selle) et 75 000 (plus large et plus haute).
Coût : 40 k€, 400 k€, 4 M€, 22 M€, 55 M€. Loges et hospitalités à partir de 14 000 places (1,2 % à 3 % de la
capacité, vendues dix fois le prix du billet, dans la limite de 5 % du public potentiel).

**Tarif des billets** (fiche du stade) : Populaire (×0,75 sur le billet, +12 % de public), Normal, Premium
(×1,35, −16 %), Prestige (×1,8, −36 %). Quand le stade refuse du monde, Premium ou Prestige gardent l'enceinte
pleine et rapportent davantage ; le staff le conseille quand le stade est au maximum et la demande 30 % au-dessus.

**Coupes** : la Coupe nationale (quatre tours à élimination directe, tirs au but en cas d'égalité, adversaires
des divisions voisines) et la Coupe d'Europe des clubs, réservée aux deux premiers de l'Elite la saison précédente (adversaires
européens fictifs). Les tours s'intercalent entre les journées ; tous les matchs se jouent à domicile, avec un
public en hausse (×1,15 en Coupe nationale, ×1,55 en Coupe d'Europe, billets ×1,5) et 1,5 M€ de droits TV par match
européen. Primes de la Coupe nationale : 6 %, 12 %, 25 % puis 75 % de la prime du champion de la division pour
chaque tour gagné. Coupe d'Europe : 4 M€ de participation, puis 2,5 M€, 4 M€, 6,5 M€ et 15 M€ par tour gagné.

**Trophées et titre** : champion de sa division → trophée, prime de titre (la moitié de la prime du champion et
30 % des sponsors), +3 de réputation. Coupe gagnée → trophée et +3 de réputation (+6 pour la Coupe d'Europe). Chaque trophée
attire 3 % de public en plus (six au plus).

Effet mesuré en Elite (club au niveau 15-16, bâtiments au maximum) : stade à 38 000 places, salaires ≈ 63 % des
revenus ; à 75 000 places, recettes des matchs de 18 à 42 M€ et salaires ≈ 34 % ; avec la Coupe d'Europe, ≈ 23 %.

**Effectif** : 25 joueurs au plus (au lieu de 18).

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

**Transferts** : un seul mercato (`src/game/transfers.js`, `src/game/mercato.js`). Un joueur libre demande une
prime de signature de 1,5 saison de salaire. Vendre un joueur tout de suite rapporte sa valeur (1,2 saison) ; mis
en vente, il reçoit des offres après chaque journée : 60 % de chances par journée (75 % en grande forme), de 0,95 à
1,3 fois sa valeur (+8 % en forme, +8 % jusqu'à 23 ans). Un joueur en grande forme (moyenne ≥ 7,3, niveau ≥ 6)
peut aussi recevoir une offre spontanée (5 % par journée, 1,25 à 1,6 fois sa valeur). « Demander +10 % » : une
chance sur deux, sinon le club retire son offre. Une offre vaut jusqu'à la journée suivante. Acheter puis revendre
fait perdre de l'argent, former un jeune et le revendre en fait gagner.

**Cours du marché** : le prix demandé suit un cours (×0,8 à ×1,3) qui bouge à chaque journée (±5 %), monte quand
des clubs rivaux courtisent le joueur (+2,5 % par club) et baisse après trois journées sans preneur. Un joueur
courtisé part plus souvent ailleurs (26 % + 12 % par club et par journée, 10 % sinon).

**Négociation** : chaque vendeur a un seuil, la part du prix demandé à laquelle il accepte une fois sur deux : 86 %
pour un club (−7 points en dernière année de contrat, −2 à 2 ans, +2 à 3 ans, +5 à 4 ans, −1,2 par niveau du
bureau des transferts), 90 % pour l'agent d'un joueur libre ; −4 dès 31 ans, +4 pour un jeune à fort potentiel,
+4 par club rival intéressé, −2 si son prix baisse ou s'il est sans preneur depuis trois journées, +1,5 par offre
refusée, ±3 selon le caractère du vendeur. Autour du seuil, la chance d'accord passe de 0 à 100 % sur ±7 points
(courbe en S) ; la chance affichée est celle qui décide. Une offre refusée qui reste à moins de 14 points sous le
seuil appelle une contre-offre (signature assurée à ce prix, plafonnée à 125 % du prix demandé) ; trois offres par
joueur et par journée.

**Bureau des transferts** (4,5 k€ au niveau 1, ×6,2 par niveau, quartier des supporters ou zone des
partenaires) : sans lui, seuls 4 joueurs sous contrat sont listés publiquement ; son réseau de recruteurs en suit
12 au niveau 1 puis 4 de plus par niveau (28 au niveau 5), avec des profils de plus en plus forts (jusqu'à environ 2,5 niveaux de
division au-dessus du club). Un joueur sur quatre est un espoir (18 à 21 ans, potentiel relevé).
L'indemnité de transfert vaut 2,5 saisons de salaire × âge (×1,35 jusqu'à 21 ans, ×1,15 jusqu'à 24,
×0,85 à 29-30, ×0,7 dès 31) × marge de progression (+7 % par point de potentiel, ×1,5 au plus) ×
contrat (0,9 à 1,2 selon 1 à 4 ans restants) × réseau du bureau (−3 % par niveau). Ordres de grandeur
(médiane) : 3 à 11 k€ en Départementale, 45 k€ en Régionale, 230 à 380 k€ en Nationale, 1,2 à 1,5 M€ en
Elite. Le mercato (5 joueurs libres et les joueurs sous contrat) est renouvelé chaque saison ; après chaque
journée, des joueurs signent ailleurs et de nouveaux arrivent (marqués « Nouveau »). Les rapports des recruteurs
resserrent aussi la fourchette de potentiel affichée et rendent les vendeurs plus conciliants.

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
