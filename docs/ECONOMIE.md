# Économie de FootOFF Empire

Toutes les formules vivent dans `src/game/economy.js`, les réglages par division et le coût des bâtiments
dans `src/game/constants.js`. Les valeurs ci-dessous ont été calées par simulation de carrières complètes.

## Le modèle

**Stade** : 600 places (terrain municipal), 3 500 (tribune couverte), 14 000 (stade 4 tribunes),
38 000 (arène moderne), puis l'arène fermée : 55 000 (deux étages, toit en selle) et 75 000 (plus large et plus haute).
Coût : 40 k€, 400 k€, 4 M€, 55 M€, 140 M€ (22 et 55 M€ pour l'arène fermée avant la 0.6.0 : à l'échelle de la
nouvelle Elite, ils se seraient payés en deux saisons). Loges et hospitalités à partir de 14 000 places (1,2 % à 3 % de la
capacité, vendues dix fois le prix du billet, dans la limite de 5 % du public potentiel).

**Tarif des billets** (fiche du stade) : Populaire (×0,75 sur le billet, +12 % de public), Normal, Premium
(×1,35, −16 %), Prestige (×1,8, −36 %). Quand le stade refuse du monde, Premium ou Prestige gardent l'enceinte
pleine et rapportent davantage ; le staff le conseille quand le stade est au maximum et la demande 30 % au-dessus.

**Coupes** : la Coupe nationale (quatre tours à élimination directe, tirs au but en cas d'égalité, adversaires
des divisions voisines) et la Coupe d'Europe des clubs, réservée aux deux premiers de l'Elite la saison précédente (adversaires
européens fictifs, avec leur budget de saison affiché : 150 à 800 M€ selon leur niveau, une simple indication). Les
tours s'intercalent entre les journées ; tous les matchs de coupe se jouent à domicile, avec un
public en hausse (×1,15 en Coupe nationale, ×1,55 en Coupe d'Europe, billets ×1,5) et 5 M€ de droits TV par match
européen (1,5 M€ avant la 0.6.0). Primes de la Coupe nationale : 6 %, 12 %, 25 % puis 75 % de la prime du champion de la division pour
chaque tour gagné. Coupe d'Europe (0.6.0, à l'échelle des vraies) : 15 M€ de participation, puis 10, 12, 18 et 30 M€
par tour gagné, soit plus de cent millions pour le vainqueur avec les droits TV (avant : 4 M€, puis 2,5, 4, 6,5 et
15 M€).
Avant un match de coupe, la chance de gagner la séance de tirs au but (finition des tireurs, réflexes du gardien) et la
qualification affichées sont exactes (`shootoutWinChance`, `src/game/cups.js`).

**Trophées et titre** : champion de sa division → trophée, prime de titre (la moitié de la prime du champion et
30 % des sponsors), +3 de réputation. Coupe gagnée → trophée et +3 de réputation (+6 pour la Coupe d'Europe). Chaque trophée
attire 3 % de public en plus (six au plus).

**Elite en aller-retour** (0.6.0) : quatorze journées, la seconde moitié reprend les affiches de la première, lieux
inversés ; une journée sur deux à l'extérieur (`s.away`, `isAwayRound`, `src/game/cups.js`). À l'extérieur, l'avantage
du terrain passe à l'adversaire (×1,06 pour lui, dans le moteur et le pronostic) et le club ne touche que ses droits TV
(`awayGate`, `src/game/economy.js`) : sept recettes de billetterie par saison, comme ailleurs, et quatorze de droits TV.
Salaires et entretien se paient par quatorzième. La réputation d'une journée compte moitié (sept journées de
réputation par saison, comme ailleurs).

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
| Elite | 40 € | 7 € | 9 € | 1,8 M€ (à domicile comme à l'extérieur) |

Buvette +10 % et boutique +12 % par niveau d'espace supporters ; la boutique suit aussi la réputation.

En Elite, 28 €, 5 €, 6 € et 220 000 € avant la 0.6.0.

**Revenus de saison** : sponsors (5 k€, 35 k€, 220 k€, 8 M€ selon la division, +40 % par niveau du siège, selon la
réputation ; versés à la reprise depuis la 0.6.0, la première saison du club au bilan : un club promu touche tout de
suite ceux de sa nouvelle division ; `paySponsors`, `src/game/season.js`), prime de classement (champion : 6 k€,
40 k€, 300 k€, 6,4 M€ ; dernier : 10 % de la prime), revenus hors ligne (50 €, 350 €, 2 200 €, 40 000 € par heure et
par niveau du siège selon la division, 12 h au plus).

**L'Elite à l'échelle d'un grand championnat** (0.6.0, demande de l'utilisateur : « des transferts à plusieurs
dizaines de millions, des clubs de Coupe d'Europe aux moyens énormes »). Salaires et valeurs ×4 (`WAGE_DIVISION`,
`ELITE_SCALE`), droits TV ×8 par match, sponsors ×8, prime du champion ×4, billets ×1,4 : les recettes viennent
d'abord de la télévision et des sponsors, comme dans les grands clubs, et plus seulement du stade. Les petites
divisions ne changent pas : la montée en Elite change d'échelle (un joueur à 13 coûte 200 000 € par an en Nationale,
1,3 M€ en Elite). Une partie déjà en Elite à la mise à jour y passe une fois : trésorerie, offres et prix demandés en
cours, contre-propositions et référence de l'objectif « dans le vert » ×4 (`scaleElite`, `src/game/save.js`).

**Salaires** (payés à chaque journée de championnat, comme l'entretien : un septième de la saison, un quatorzième en
Elite) : 800 € × 1,7^(note − 6) jusqu'à une note de 13, puis ×1,55 par point, multiplié par 1 / 2,7 / 6,2 / 40 selon
la division (10 en Elite avant la 0.6.0). En Elite : 1,3 M€ à 13, 4,9 M€ à 16, 11,8 M€ à 18, 28 M€ à 20. Un onze adapté
à sa division coûte 50 à 60 % des revenus ; en Elite, un effectif de stars monte à 80 % et plus (les coupes font la
différence), ce qui freine la fin de partie.

**Valeur de marché et transferts** (`marketValue`, `src/game/players.js`) : la valeur d'un joueur vaut deux saisons de
salaire × âge (×1,35 jusqu'à 21 ans, ×1,15 jusqu'à 24, ×0,85 à 29-30, ×0,7 dès 31) × marge de progression (+7 % par
point de potentiel, ×1,5 au plus). C'est la référence de tous les prix, la même sur la fiche et au mercato :
- un joueur libre demande une prime de signature de 70 % de sa valeur (`FREE_AGENT_SHARE`, `src/game/economy.js` ; une
  saison de salaire avant la 0.5.0, soit 0,38 fois sa valeur : racheté puis revendu, il rapportait 1,5 à 2 fois son prix) ;
- un club vendeur demande sa valeur × contrat (0,9 à 1,2 selon 1 à 4 ans restants) × cours du marché (0,8 à 1,3) ×
  réseau du bureau des transferts (−3 % par niveau), puis se négocie (seuils ci-dessous) ;
- un club acheteur a un plafond secret en part de la valeur : petit club 0,84, club ambitieux 0,97, grand club 1,12,
  géant européen 1,3 (0.6.0 : seulement pour une star d'un club d'Elite, 1,5 point au-dessus du club moyen de la
  division ; un candidat sur six, un sur trois quand le club joue la Coupe d'Europe ; il négocie très dur)
  (±6 % de caractère, +6 % pour un joueur en forme ou jeune, +5 % à fort potentiel, −8 % dès 31 ans), et la
  négociation ou les enchères le font monter ; une vente forcée (plan de redressement du conseil) rapporte 85 %.
Une recrue, ou un jeune monté de l'académie, ne se revend qu'après quatre journées de championnat au club
(`RESALE_ROUNDS`, `saleBlock`, `src/game/mercato.js`, depuis la 0.5.0) : faire progresser un joueur rapporte, l'acheter
pour le revendre aussitôt n'est plus possible (ni l'achat juste avant une montée, revendu à la reprise au prix de la
division supérieure).
Un joueur en grande forme (moyenne ≥ 7,3, niveau ≥ 6) peut recevoir une offre spontanée (5 % par journée, plafond +20 %) ;
pour une star d'Elite, un géant européen plus d'une fois sur trois (plafond 1,5 fois la valeur : l'« offre folle »).

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

**Bureau des transferts** (4,5 k€ au niveau 1, ×6,2 par niveau, sur n'importe quelle parcelle) : sans lui, seuls 4 joueurs sous contrat sont listés publiquement ; son réseau de recruteurs en suit
12 au niveau 1 puis 4 de plus par niveau (28 au niveau 5), avec des profils de plus en plus forts. Un joueur sur quatre
est un espoir (18 à 21 ans, potentiel relevé).
**Niveau du marché** (`marketLevel`, `src/game/transfers.js`, depuis la 0.5.0) : calé sur le club moyen de la division
(milieu de `oppMin` à `oppMax`). Joueurs libres : 0,4 point sous le club moyen en médiane, le meilleur des cinq environ
0,8 au-dessus. Joueurs sous contrat : au niveau du club moyen sans bureau ; les recruteurs vont plus haut avec le bureau
(+0,15 de haut de fourchette par niveau) et la notoriété attire les grands noms (+0,6 au plus, à 60 de réputation) :
médiane un point au-dessus du club moyen, le meilleur environ trois points au-dessus avec un réseau complet et un grand
nom (18,3 en Elite, 19 au plus). Avant la 0.5.0, le marché suivait le rang de la division : un cran au-dessus du club
moyen en Départementale (la montée était acquise d'emblée), deux crans en dessous en Elite. Ordres de grandeur d'une
indemnité (médiane, sans puis avec un réseau complet) : 2 à 4 k€ en Départementale, 25 à 40 k€ en Régionale, 240 à
390 k€ en Nationale, 9 à 13 M€ en Elite, 30 à 50 M€ pour une star à 18 (×4 depuis la 0.6.0). Le mercato (5 joueurs libres et les joueurs sous contrat) est renouvelé chaque saison ; après chaque
journée, des joueurs signent ailleurs et de nouveaux arrivent (marqués « Nouveau »). Les rapports des recruteurs
resserrent aussi la fourchette de potentiel affichée et rendent les vendeurs plus conciliants.

**Charges** : entretien des installations, 4 % de ce qui a été investi chaque saison, payé à chaque journée de
championnat (un septième, un quatorzième en Elite).
L'écran Finances prévoit la fin de saison avec les journées restantes à payer.

**Plan de redressement** : une saison bouclée dans le rouge déclenche la vente des plus gros salaires
par le conseil (jusqu'à revenir au-dessus de zéro, sans descendre sous 13 joueurs).

## Parcelles et notoriété

Les sept parcelles autour du stade sont ouvertes dès la fondation, sans quartier réservé : chaque bâtiment
(entraînement, académie, espace supporters, siège et partenaires, bureau des transferts) se construit une fois, sur
la parcelle choisie (`build(s, parcelle, bâtiment)`, `src/game/engine.js`). La réputation n'ouvre plus rien : elle
attire (`src/game/reputation.js`), à rendement décroissant, comparée à la fondation (réputation 5) :

- public et boutique : `repFactor` (×0,45 à ×1,45, voir plus haut) ;
- sponsors : ×0,9 (club sans nom) à ×1,25 environ (légende), ×1 à la fondation (`sponsorRep`) ;
- mercato : seuil d'acceptation des vendeurs abaissé jusqu'à 6 points (−2 points pour un club sans nom), avec sa
  raison affichée dans la négociation (`mercatoRep`, `stanceOf`) ;
- statuts nommés (Club de quartier 0, Club qui monte 6, Club régional 12, Club national 25, Grand club 45, Club
  de légende 80) : une ligne au journal et une mention à l'après-match quand le club en change ; les paliers des
  grandes étapes (`goals.js`) suivent la même échelle. Panneau Notoriété : bouton étoile du HUD.
- gains : une victoire rapporte +1 (nul +0,2, défaite −0,6) × espace supporters (+10 % par niveau) × affiche (coupe
  ×1,2, Europe ×1,6) × division (Départementale ×0,35, Régionale ×0,55, Nationale ×0,8, Elite ×1) ; titre +3, Coupe +3,
  Coupe d'Europe +6, montée +4, descente −3. Chaque intersaison efface 12 % de la notoriété : un club de
  Départementale plafonne autour de 25, la légende se bâtit par des titres en Elite (`REP_DIVISION`, `REP_DECAY`).

## Divisions et difficulté

Niveau des adversaires (`DIVISIONS`, répartis de `oppMin` à `oppMax`) : Départementale 5,0 à 7,4, Régionale 7,6 à 10,0,
Nationale 10,2 à 12,8, Elite 13,4 à 17,0 ; Coupe d'Europe 15,1 à 18,5, plus fort à chaque tour (15,9 de moyenne en
huitièmes, 17,7 en finale ; 14,8 à 18,2 en 0.5.x ; 13,7 à 17,3 avant la 0.5.0, quand une Coupe d'Europe sur deux était
gagnée). L'effectif de départ vaut environ 6,2 (milieu de
Départementale) : la première montée se gagne en deux ou trois saisons, pas d'emblée. Au sommet, le haut de l'Elite
(17) reste un défi pour un onze arrivé à 17,5-18 : le titre se dispute, saison après saison, sans jamais être acquis.

## Simulation (`tools/sim/career.mjs`, dans le dépôt)

`node tools/sim/career.mjs 30 8` fait jouer huit carrières de trente saisons par un président automatique raisonnable
(meilleur onze condition comprise, recrue utile avec une réserve d'une demi-saison de salaires, stade dès que le public
dépasse la capacité, bâtiment conseillé puis améliorations, jeunes repérés recrutés, vente d'un remplaçant quand les
salaires pèsent trop). Rééquilibrage du 2026-10-24 :

| | Avant | Après |
|---|---|---|
| Première montée en Régionale | saison 1 | saison 3 |
| Elite | saison 8 | saison 9 |
| Premier titre en Elite | saison 15 | saison 19 |
| Saisons en Elite gagnées | 51 % | 36 % |
| Réputation en saison 6-10 / 26-30 | 75 / 400 (légende dès la saison 6) | 26 / 123 (légende vers la saison 25) |
| Meilleur joueur du marché en fin de partie | 16,8 (sous le onze) | 18,6 (au-dessus du onze) |
| Salaires / revenus, saisons 16-25 | 64 % | 81 % |
| Trésorerie médiane, saisons 16-25 / 26-30 | 358 M€ / 800 M€ | 60 M€ / 300 M€ |

Avant : montée offerte, légende en Régionale, plus aucun renfort à acheter au sommet, titre chaque année, argent sans
usage. Après : chaque étape se mérite, le marché garde un cran d'avance, les stars coûtent, le titre se dispute.

Rééquilibrage 0.5.0 (2026-10-27 ; « super cheaté » : prodiges de l'académie, onze de 19-21 ans, Coupe d'Europe facile,
argent qui déborde). Mesuré par `node tools/sim/career.mjs 20 40 --joueur` : quarante carrières de vingt saisons par un
président qui joue comme un bon joueur humain (séance individuelle à chaque date avec des épreuves réussies à 85 %,
tactique adaptée à l'adversaire, meilleurs jeunes repérés, revente seulement quand `saleBlock` l'autorise) :

| | Avant (0.4.3) | Après (0.5.0) |
|---|---|---|
| Elite (médiane) | saison 6 | saison 10 |
| Premier titre en Elite | saison 12 (38 carrières sur 40) | saison 17 (35 sur 40) |
| Saisons en Elite gagnées | 51 % | 25 % |
| Coupe d'Europe gagnée | 62 % des participations | 22 % |
| Âge moyen du onze, saisons 1-5 / 6-10 / 11-15 / 16-20 | 20,9 / 21,1 / 23,3 / 25,1 | 24,1 / 22,5 / 24,2 / 26,1 |
| Joueurs de 21 ans ou moins dans le onze (mêmes périodes) | 7 / 7 / 4 / 1 | 3 / 5 / 3 / 1 |
| Onze en fin de partie (écart au club moyen de la division) | 19,0 (+3,8) | 16,9 (+1,8) |
| Trésorerie médiane, saisons 11-15 / 16-20 | 38 M€ / 91 M€ | 15 M€ / 24 M€ |
| Descentes (sur 40 carrières) | 55 | 79 |

Le président automatique, qui ne joue ni les séances ni la tactique, monte en Elite vers la saison 12 (9 avant), gagne
son premier titre vers la 19e (17 avant ; dans 17 carrières sur 40) et 16 % de ses Coupes d'Europe (32 % avant).
Un joueur parfait (épreuves réussies à 100 %, `SCORE=1`) : Elite vers la saison 10, premier titre vers la 17e.

0.5.1 : récupération de la condition réduite (`docs/JOUEURS.md`). Le simulateur mesure la condition du onze au coup
d'envoi et, avec `--sans-rotation`, ce que coûte de ne jamais faire tourner : avant, 96 % de condition même sans
rotation (la fatigue ne comptait pas) ; désormais 90 % avec « Meilleur onze » (1,3 titulaire sous 70 % par match), 88 %
sans rotation (1,7), 0,21 blessure par match au lieu de 0,18 ; rythme inchangé (Elite vers la saison 10, premier titre
vers la 17e, 40 carrières).

0.6.0 (Elite en aller-retour et à l'échelle d'un grand championnat, sponsors versés à la reprise, séances d'Elite à
deux tiers, Coupe d'Europe plus riche et un peu plus forte). Mesuré par `node tools/sim/career.mjs 25 20 --joueur
--comptes` (et sans `--joueur`), comparé à la 0.5.1 rejouée de la même façon (12 carrières) :

| | 0.5.1 | 0.6.0 |
|---|---|---|
| Elite (médiane) | saison 10 | saison 10 |
| Premier titre en Elite | saison 19 (12 carrières sur 12) | saison 18 (20 sur 20) |
| Saisons en Elite gagnées | 35 % | 40 % (quatorze journées : le plus fort gagne un peu plus souvent) |
| Coupe d'Europe gagnée | 26 % des participations | 20 % |
| Onze en fin de partie (écart au club moyen de la division) | 17,6 (+2,6) | 17,5 (+2,5) |
| Recettes d'une saison d'Elite (moyenne) | 47,6 M€ | 164,5 M€ |
| dont droits TV et sponsors / billetterie, buvette, boutique et loges | 18 % / 56 % | 49 % / 25 % |
| Salaires d'une saison d'Elite | 27,3 M€ | 116,7 M€ |
| Président automatique : Elite, premier titre, saisons d'Elite gagnées | saison 12, saison 19 (9 sur 12), 24 % | saison 13, saison 20 (17 sur 20), 18 % |

Étapes du calage : salaires ×4 seuls, avec les billets ×1,6 et des droits TV et sponsors ×9 et ×10, le bon joueur
gagnait 48 % des saisons d'Elite ; ramenés à ×7, le président automatique n'en gagnait plus que 10 % : promu, il
retrouvait des salaires six fois plus lourds sans l'argent de l'Elite, versé au bilan (d'où les sponsors à la reprise),
et la Coupe d'Europe trop riche faisait gagner 40 % des participations au bon joueur (d'où ses primes ramenées de 134
à 105 M€ pour le vainqueur et ses adversaires +0,3).

Prochaines sources de dépense prévues (feuille de route) : marché des transferts, personnel du club,
bâtiments des parcelles vides, compétitions continentales.

## Écran Finances (livre de comptes)

- `src/game/ledger.js` range chaque mouvement d'argent par poste : billetterie, buvette, boutique, droits TV,
  sponsors, prime de classement, primes d'objectif, ventes, revenus hors ligne ; salaires, entretien, travaux,
  recrutements. Une saison bouclée garde ses totaux et ses trésoreries de début et de fin (12 dernières).
  Vérifié par simulation : début + recettes − dépenses = fin, à l'euro près, sur 520 saisons.
- `endOfSeasonForecast` : trésorerie actuelle + matchs restants (recette attendue ; à l'extérieur, les droits TV) +
  sponsors s'ils ne sont pas encore versés + prime au classement actuel − salaires − entretien restants. C'est la ligne « Fin de saison prévue » des fenêtres de recrutement
  et de vente, et le conseil du staff « Fin de saison dans le rouge ».
- `investmentPreview` : pour un niveau de bâtiment de plus, recettes gagnées par saison (`leagueSeasonGate` : sept
  matchs à domicile, les droits TV de toutes les journées ; et les sponsors),
  entretien supplémentaire (4 % du coût) et saisons nécessaires pour rentrer dans ses frais, dans la division
  actuelle. Entraînement et académie : investissement sportif, sans recette directe.
- Les parties commencées avant cet écran démarrent leur livre de comptes à la trésorerie du moment.
