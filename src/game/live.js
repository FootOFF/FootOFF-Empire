import { clamp, pick, ri } from './utils';
import { CLUB_PREPS, capitalize, clubAfter, deName, isPluralClub } from './names';
import { penaltySkills, shootout, shootoutWinChance } from './cups';
import { FORMATIONS, TACTICS, expectedGoals, formationOf, lineupRating, slotsOf } from './tactics';
import { available, fitAt, fitFactor, ratingAt } from './players';
import { injuryCut } from './medical';
import { opponentEleven } from './opponents';
import { t, tn } from '../i18n/index';

// Match en direct : simulation minute par minute, au fil de l'horloge du direct (advanceTo), avec une avance de
// quelques minutes pour préparer les temps forts en 3D. Un changement ou une nouvelle tactique peut se décider à toute
// minute (change) : les minutes déjà simulées mais pas encore vues sont reprises depuis un instantané, et la suite se
// rejoue avec le nouveau onze. La condition physique des joueurs baisse minute après minute et pèse sur le niveau du
// onze ; un joueur fatigué se blesse plus souvent. Produit un fil d'événements commentés (occasions, penalties, buts,
// cartons, blessures, changements, ambiance), chaque occasion avec son type d'action (centre, contre, ouverture…) que
// la 3D construit, des notes de joueurs qui évoluent (des deux équipes) et le résultat attendu par applyMatchResult
// (season.js).

const CONVERSION = 0.3; // part des occasions transformées
const YELLOW_PER_MIN = 0.021;
// Expulsions (0.7) : à chaque minute de jeu, chaque équipe a un risque d'expulsion qui ne dépend que de la minute (il
// monte au fil du match) : 0,10 par équipe et par match, comme avant, sept fois sur dix sur un second carton jaune.
// Le pronostic peut ainsi compter exactement les expulsions encore à venir (outcomeOdds).
const RED_BASE = 0.00015;
const RED_SLOPE = 0.0000193; // sept expulsions sur dix en seconde période
export const redAt = (minute) => RED_BASE + RED_SLOPE * minute;
const RED_BOOKED = 60; // un joueur déjà averti est bien plus souvent celui qu'on expulse : second carton jaune
const INJURY_PER_MIN = 0.00017; // par joueur de champ et par minute, condition pleine : ≈ 0,23 blessure par match avec la fatigue
const INJURY_TIRED = 2.5; // à zéro de condition, le risque est multiplié par 3,5
export const SUBS_MAX = 5; // changements par match (cinq, comme en championnat professionnel)
const SNAPS_KEEP = 30; // minutes d'instantanés gardées derrière l'horloge (reprise après un changement)
// Penalties (0.7) : 3,5 % des occasions, transformés comme un tir de la séance de tirs au but (cups.js : notre meilleur
// finisseur au tir, leur réussite face à notre gardien). Les autres occasions sont d'autant moins bien transformées :
// le nombre de buts attendu ne change pas, ni le pronostic.
const PEN_SHARE = 0.035;
// Qualité d'une autre occasion : grosse occasion, occasion, occasion difficile ; qualité moyenne exactement 1.
const Q_BIG = 2.2;
const Q_STD = 0.9;
const P_BIG = 0.18;
const P_STD = 0.52;
const Q_HARD = (1 - P_BIG * Q_BIG - P_STD * Q_STD) / (1 - P_BIG - P_STD); // 0,4533…
// Type d'action de chaque occasion (0.7) : il choisit la phrase du commentaire et l'action que la 3D construit. Une
// grosse occasion vient d'une ouverture, d'un contre, d'un centre en retrait ; une occasion difficile, de loin ou d'un
// coup franc.
const KINDS = {
  big: [['through', 3], ['counter', 2], ['cutback', 2], ['cross', 2], ['combo', 2], ['scramble', 1]],
  std: [['combo', 3], ['cross', 3], ['solo', 2], ['corner', 2], ['press', 1], ['cutback', 1], ['counter', 1], ['through', 1]],
  hard: [['long', 4], ['freekick', 2], ['solo', 1], ['cross', 1], ['corner', 1]],
};
// actions qui finissent sur une passe (la passe décisive, quand c'est un but) ; les autres sont l'affaire du tireur
const PASS_KINDS = new Set(['through', 'counter', 'cutback', 'cross', 'combo', 'corner']);

// Gabarits du commentaire. {p} joueur, {home} / {away} clubs (article accordé), {n} accord du verbe pour un club au
// pluriel, {team} club nu entre parenthèses. Pas deux fois la même phrase d'ambiance dans un match ; chaque occasion
// a la phrase de son type d'action et de son issue ; un but se commente selon le score.
const T = {
  kickoff: [
    t('Coup d’envoi ! {home} et {away} lancent la partie.'),
    t('C’est parti ! Le stade est debout pour le coup d’envoi.'),
    t('L’arbitre siffle : {home} engage, {away} attend{n} dans son camp.'),
    t('Coup d’envoi sous les encouragements du public : {home} donne le ton d’entrée.'),
  ],
  chance: {
    home: {
      through: [t('Ouverture lumineuse dans la profondeur : {p} file seul vers le but…'), t('{p} part dans le dos de la défense et se présente face au gardien…'), t('Passe en profondeur parfaite, {p} est lancé…')],
      counter: [t('Contre éclair de {home}, {p} déboule dans l’axe…'), t('Récupération et projection rapide : {p} est lancé…'), t('{home} part en contre à toute vitesse, {p} conclut l’action…')],
      cutback: [t('Débordement jusqu’à la ligne, remise en retrait pour {p}…'), t('Centre en retrait, {p} arrive lancé au point de penalty…')],
      cross: [t('Centre millimétré, {p} place sa tête…'), t('{p} reprend de volée un centre venu de la gauche…'), t('Centre de la droite, {p} s’élève plus haut que tout le monde…')],
      combo: [t('Belle combinaison de {home}, {p} arme sa frappe…'), t('Une-deux dans la surface, {p} se retrouve face au gardien…'), t('Remise en retrait, {p} frappe du plat du pied…')],
      scramble: [t('Cafouillage dans la surface, {p} a le ballon au point de penalty…'), t('Le ballon traîne dans les six mètres, {p} est le plus prompt…')],
      solo: [t('{p} élimine son vis-à-vis et tente sa chance…'), t('{p} s’infiltre côté gauche et frappe…'), t('{p} pivote dans la surface et déclenche…')],
      corner: [t('Corner de {home} : {p} monte plus haut que tout le monde…'), t('Corner rentrant, {p} surgit au premier poteau…')],
      press: [t('{p} récupère haut et frappe en première intention…'), t('Pressing de {home}, {p} chipe le ballon et frappe aussitôt…')],
      long: [t('{p} arme une frappe lointaine…'), t('De loin, {p} tente sa chance…'), t('À trente mètres, {p} voit le gardien avancé et frappe…'), t('{p} n’hésite pas : frappe puissante de l’extérieur de la surface…')],
      freekick: [t('Coup franc excentré, {p} tente sa chance directement…'), t('Coup franc à vingt-cinq mètres, {p} enroule au-dessus du mur…')],
      penalty: [t('Faute dans la surface : penalty pour {home} ! {p} s’élance…'), t('Penalty pour {home} ! {p} prend ses responsabilités…')],
    },
    away: {
      through: [t('Long ballon dans le dos de la défense, {p} est parti…'), t('{p} file seul vers le but après une ouverture de {away}…')],
      counter: [t('{away} contre{n} vite, {p} se présente face au but…'), t('Perte de balle au milieu : {p} file au but…'), t('Contre rapide de {away} : {p} choisit la frappe…')],
      cutback: [t('Débordement de {away} jusqu’à la ligne, remise en retrait pour {p}…'), t('Centre en retrait de {away}, {p} arrive lancé…')],
      cross: [t('Centre de la droite, {p} reprend de la tête…'), t('{p} reprend de volée un centre venu de la gauche…'), t('Centre fort devant le but, {p} s’élève…')],
      combo: [t('{p} s’infiltre entre deux défenseurs et frappe…'), t('Combinaison de {away} aux abords de la surface, {p} frappe…')],
      scramble: [t('{p} profite d’un cafouillage dans la surface…'), t('Le ballon traîne dans les six mètres, {p} est le plus prompt…')],
      solo: [t('{p} fixe la défense et déclenche à l’entrée de la surface…'), t('{p} élimine un défenseur et tente sa chance…')],
      corner: [t('Corner pour {away}, {p} surgit au premier poteau…'), t('Sur corner, {p} s’élève dans la surface…')],
      press: [t('{p} intercepte une relance hasardeuse et frappe aussitôt…'), t('Pressing de {away}, {p} récupère et frappe…')],
      long: [t('Frappe lointaine de {p}…'), t('De loin, {p} tente sa chance…')],
      freekick: [t('Coup franc dangereux pour {away}, {p} s’élance…'), t('Coup franc à vingt-cinq mètres, {p} enroule au-dessus du mur…')],
      penalty: [t('Faute dans la surface : penalty pour {away}. {p} s’élance…'), t('Penalty pour {away} : {p} face au gardien…')],
    },
  },
  saved: [
    t('arrêt du gardien !'), t('parade décisive !'), t('le gardien capte sans trembler.'), t('détourné en corner du bout des gants !'),
    t('claqué au-dessus par le gardien !'), t('le portier se couche bien et bloque.'), t('repoussé des poings !'), t('le gardien gagne son face-à-face !'),
  ],
  wide: [
    t('à côté !'), t('au-dessus de la barre.'), t('ça frôle le poteau, mais c’est dehors.'), t('dévissé, loin du cadre.'),
    t('dans les tribunes…'), t('contré par un défenseur, en corner.'), t('juste à côté du montant !'), t('trop croisé, ça sort.'),
  ],
  post: [t('sur le poteau !'), t('la barre transversale tremble encore !'), t('le poteau sauve le gardien !'), t('sur la barre, puis dégagé en catastrophe !')],
  // penalty manqué
  pen: {
    saved: [t('le gardien devine le bon côté et repousse !'), t('arrêté ! Le gardien a lu dans le jeu du tireur !')],
    wide: [t('à côté ! Le penalty est manqué.'), t('au-dessus ! Il manque complètement son penalty.')],
    post: [t('sur le poteau ! Le penalty n’est pas transformé.'), t('sur la barre ! Le penalty est manqué.')],
  },
  // but du club selon le score après le but (nous − adversaire) et, en fin de match, selon la minute
  goalHome: {
    level: [t('BUT ! {p} égalise, imparable !'), t('BUT ! {p} remet {home} à hauteur, le stade exulte !'), t('ÉGALISATION ! {p} trompe le gardien !')],
    lead: [t('BUT ! {p} trompe le gardien et donne l’avantage à {home} !'), t('BUT ! Quel geste de {p} ! {home} passe devant !'), t('BUT ! {p} fait trembler les filets, {home} mène !')],
    more: [t('BUT ! {p} creuse l’écart !'), t('BUT ! {p} enfonce le clou, {home} se met à l’abri !'), t('ENCORE ! {p} alourdit la marque !')],
    back: [t('BUT ! {p} réduit l’écart, {home} y croit encore !'), t('BUT ! {p} relance le match pour {home} !'), t('BUT ! {p} redonne espoir à {home} !')],
    late: [t('BUT DANS LES ARRÊTS DE JEU ! {p} fait chavirer le stade !'), t('BUT ! {p} à la dernière minute, le public n’en revient pas !')],
  },
  // but adverse, selon l'écart après le but (adversaire − nous)
  goalAway: {
    level: [t('Égalisation : {p} remet {away} à hauteur.'), t('{p} égalise pour {away}.'), t('Le stade se tait : {p} égalise pour {away}.')],
    lead: [t('But de {away} : {p} donne l’avantage aux siens.'), t('Coup dur : {p} marque pour {away}.'), t('{p} ouvre le score pour {away}, silence dans les tribunes.')],
    more: [t('{p} creuse l’écart pour {away}.'), t('Coup dur : {p} enfonce le clou pour {away}.'), t('{p} encore pour {away}, la soirée se complique.')],
    back: [t('{p} réduit l’écart pour {away}.'), t('But de {away} : {p} relance le suspense.'), t('{p} marque pour {away} : il va falloir tenir.')],
    late: [t('But de {away} dans les arrêts de jeu : {p} glace le stade.'), t('Dernière minute : {p} marque pour {away}, cruel.')],
  },
  yellow: [
    t('Carton jaune pour {p} ({team}) après une faute tactique.'), t('Avertissement : {p} ({team}) est sanctionné.'),
    t('{p} ({team}) arrive en retard : carton jaune.'), t('Jaune pour {p} ({team}), qui a protesté un peu trop fort.'),
    t('Semelle de {p} ({team}) : l’arbitre sort le jaune.'), t('{p} ({team}) stoppe un contre de la main : avertissement.'),
  ],
  red: [t('CARTON ROUGE ! {p} ({team}) est expulsé !'), t('ROUGE DIRECT ! {p} ({team}) est renvoyé aux vestiaires !'), t('Expulsion ! {p} ({team}) a fauché le dernier défenseur !')],
  secondYellow: [t('Second carton jaune pour {p} ({team}) : expulsion !'), t('{p} ({team}) prend un second jaune : il sort !')],
  injury: [
    t('Blessure : {p} reste au sol et ne peut pas continuer.'), t('{p} se tient la cuisse : il doit sortir.'),
    t('Coup dur pour {home} : {p} est blessé et quitte le terrain.'), t('{p} grimace, le staff médical entre : il ne peut pas reprendre.'),
  ],
  ambience: [
    t('Possession patiente de {home} au milieu de terrain.'),
    t('{away} resserre{n} les lignes et laisse{n} venir.'),
    t('Le public pousse derrière {home} !'),
    t('Duel âpre au milieu, l’arbitre laisse jouer.'),
    t('Temps faible pour {home}, {away} confisque{n} le ballon.'),
    t('Corner pour {home}… dégagé par la défense.'),
    t('Récupération haute de {home}, mais la passe est trop longue.'),
    t('Touche pour {away} dans sa moitié : le rythme retombe.'),
    t('Hors-jeu signalé contre {away}, à raison.'),
    t('{home} fait tourner, la défense adverse recule.'),
    t('Le capitaine de {home} replace ses coéquipiers.'),
    t('Le banc de {away} s’agite : consignes criées depuis la ligne.'),
    t('Faute sans gravité au milieu, coup franc indirect pour {home}.'),
    t('Les supporters entonnent le chant du club.'),
    t('Chaleur dans les duels : {away} ne lâche{n} rien.'),
    t('Le gardien de {home} relance court, patiemment.'),
  ],
};

// À l'extérieur (Élite, 0.6.0) : le public est celui de l'adversaire. Le coup d'envoi, l'ambiance et les buts se
// commentent depuis son stade (le reste des gabarits ne change pas).
const T_AWAY = {
  ...T,
  kickoff: [
    t('Coup d’envoi ! {away} reçoi{v} {home} devant son public.'),
    t('C’est parti chez {away} : {home} devra faire taire le stade.'),
    t('L’arbitre siffle : {away} engage{n} sous les encouragements de ses supporters.'),
    t('Coup d’envoi dans un stade bouillant : {home} est attendu de pied ferme.'),
  ],
  ambience: [
    ...T.ambience.filter((t) => !/public|supporters/.test(t)),
    t('Le public de {away} pousse derrière les siens.'),
    t('Dans le parcage visiteurs, les supporters de {home} donnent de la voix.'),
    t('Sifflets du public adverse à chaque ballon touché par {home}.'),
  ],
  goalHome: {
    ...T.goalHome,
    level: [t('BUT ! {p} égalise, imparable !'), t('BUT ! {p} remet {home} à hauteur et fait taire le stade !'), t('ÉGALISATION ! {p} trompe le gardien !')],
    late: [t('BUT DANS LES ARRÊTS DE JEU ! {p} crucifie le stade adverse !'), t('BUT ! {p} à la dernière minute, le parcage visiteurs explose !')],
  },
  goalAway: {
    level: [t('Égalisation : {p} remet {away} à hauteur.'), t('{p} égalise pour {away}.'), t('Le stade exulte : {p} égalise pour {away}.')],
    lead: [t('But de {away} : {p} donne l’avantage aux siens.'), t('Coup dur : {p} marque pour {away}.'), t('{p} ouvre le score pour {away}, le stade explose.')],
    more: [t('{p} creuse l’écart pour {away}.'), t('Coup dur : {p} enfonce le clou pour {away}.'), t('{p} encore pour {away}, la soirée se complique.')],
    back: [t('{p} réduit l’écart pour {away}.'), t('But de {away} : {p} relance le suspense.'), t('{p} marque pour {away} : il va falloir tenir.')],
    late: [t('But de {away} dans les arrêts de jeu : {p} fait chavirer le stade.'), t('Dernière minute : {p} marque pour {away}, cruel.')],
  },
};

// noms de clubs avec leur article (« pour l’US du Tilleul », « du FC des Bruyères »), élision devant un prénom
// (« frappe d’Ilyes »), majuscule en tête de phrase. Le club entre parenthèses ({team}) reste nu.
const CLUB_KEYS = new Set(['home', 'away']);
// Prépositions qui se lient au club dans la langue de la partie (CLUB_PREPS : « de », « à » ; en espagnol « de », « a » ;
// aucune en anglais ni en arabe, où la phrase traduite porte la sienne).
const FILL_RE = new RegExp(`${CLUB_PREPS.length ? `((?<!\\p{L})(?:${CLUB_PREPS.join('|')}) )?` : '()?'}\\{(\\w+)\\}`, 'gu');
const fill = (tpl, v) => capitalize(tpl.replace(FILL_RE, (_, prep = '', k) => (
  CLUB_KEYS.has(k) ? clubAfter(prep, v[k] ?? '') : prep === 'de ' ? deName(v[k] ?? '') : prep + (v[k] ?? '')
)));

function pickWeighted(list, weight) {
  const w = list.map(weight);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}
function drawKind(q) {
  const list = KINDS[q];
  let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
  return (list.find(([, w]) => (r -= w) < 0) || list[0])[0];
}

// Temps forts montrés en 3D (0.7) : buts, penalties, expulsions, grosses occasions, arrêts et poteaux. En accéléré, les
// buts, les penalties et les expulsions seulement. Renvoie le type de temps fort, ou null.
export function highlightOf(e, fast = false) {
  if (!e) return null;
  if (e.type === 'goal') return e.q === 'pen' ? 'penalty' : 'goal';
  if (e.type === 'red') return 'red';
  if (e.type !== 'chance') return null;
  if (e.q === 'pen') return 'penalty';
  if (fast) return null;
  if (e.q === 'big') return 'big';
  if (e.outcome === 'post') return 'post';
  if (e.outcome === 'saved' && e.q !== 'hard') return 'save';
  return null;
}

// --- Pronostic exact -----------------------------------------------------------------------------------------
// Calculé sur les règles mêmes du moteur (ci-dessous) : chaque minute, chaque équipe a une occasion avec la
// probabilité λ/27 (λ : buts attendus sur 90 minutes, corrigés des expulsions, des blessés non remplacés et de la
// condition physique du onze à cette minute) et la transforme avec son taux de conversion moyen (signes distinctifs
// compris ; les penalties n'y changent rien) ; au plus un but par équipe et par minute. Les expulsions encore à venir
// sont suivies minute par minute (de zéro à trois de plus de chaque côté, au risque redAt). On additionne toutes les
// suites de minutes possibles, temps additionnel compris : « 70 % » veut dire 7 victoires sur 10. Seules les blessures
// encore à venir sont ignorées : un blessé est supposé remplacé (le direct le propose, et le staff le fait quand le match
// se joue sans toi : staffSubs). Une issue n'a une probabilité nulle que si elle est réellement impossible. Vérifié sur
// 20 000 matchs du moteur (tools/sim/pronostic.mjs).
const HALF1 = [46, 47, 48]; // 45 minutes + 1 à 3 de temps additionnel
const HALF2 = [47, 48, 49, 50]; // 45 minutes + 2 à 5
// Signes distinctifs en match (0.8.5, demande du PDG : des effets nets et mesurés, environ +0,1 point par match là où le
// signe agit, et les adversaires ont les leurs). Pour chaque équipe sur le terrain (edgeOf) : ses occasions (chances),
// celles qu'elle laisse à l'adversaire (against), la finition adverse face à son gardien (keep, pen), ses cartons
// (yellow, red). « Finisseur » et « Joueur des grands soirs » agissent sur la finition du tireur (convOf), « Leader » sur
// le niveau d'équipe (tactics.js, lineupRating), « Infatigable » aussi sur la fatigue (players.js, matchCost).
export const TRAIT_FX = {
  finisseur: 1.5, // finition de ses tirs
  passeur: 1.1, // occasions de son équipe
  infatigable: 1.4, infatigableFrom: 70, // occasions de son équipe à partir de la 70e minute
  fleche: 1.09, flecheLow: 1.15, // occasions de son équipe, davantage en bloc bas (le jeu de contre)
  roc: 0.9, // occasions de l'adversaire (un défenseur ou un milieu)
  sangChaud: 1.03, sangChaudYellow: 1.4, sangChaudRed: 2.2, // engagé dans les duels, mais des cartons
  frappe: 1.09, // ses tentatives de loin : des occasions en plus
  grandsSoirs: 1.3, grandsSoirsTeam: 1.06, // contre plus fort : sa finition, et son équipe le suit
  chat: 0.88, chatPen: 0.05, // finition adverse, et penalties adverses
};
// Un onze compte en moyenne cinq à six signes (mesure : 5,8 chez nous, 5,5 chez l'adversaire) : ensemble, ils
// gonfleraient les buts de 16 %. TRAIT_NORM ramène un match entre deux onzes ordinaires au nombre de buts d'avant ; un
// onze riche en signes en marque et en sauve davantage, un onze qui en a peu, moins.
const TRAIT_NORM = 0.865;
const hasTrait = (p, t) => !!p?.traits?.includes(t);
const convOf = (p, bigGame) => CONVERSION * (hasTrait(p, 'finisseur') ? TRAIT_FX.finisseur : 1) * (bigGame && hasTrait(p, 'grandsSoirs') ? TRAIT_FX.grandsSoirs : 1);
export function edgeOf(on, { bigGame = false, tactic = 'balanced', minute = 0 } = {}) {
  const e = { chances: 1, against: 1, keep: 1, pen: 0, yellow: 1, red: 1 };
  const keeper = on.find((p) => p?.pos === 'G');
  for (const p of on) {
    if (!p?.traits?.length) continue;
    if (hasTrait(p, 'passeur')) e.chances *= TRAIT_FX.passeur;
    if (hasTrait(p, 'frappe')) e.chances *= TRAIT_FX.frappe;
    if (hasTrait(p, 'fleche')) e.chances *= tactic === 'low' ? TRAIT_FX.flecheLow : TRAIT_FX.fleche;
    if (hasTrait(p, 'infatigable') && minute >= TRAIT_FX.infatigableFrom) e.chances *= TRAIT_FX.infatigable;
    if (bigGame && hasTrait(p, 'grandsSoirs')) e.chances *= TRAIT_FX.grandsSoirsTeam;
    if (hasTrait(p, 'sangChaud')) { e.chances *= TRAIT_FX.sangChaud; e.yellow *= TRAIT_FX.sangChaudYellow; e.red *= TRAIT_FX.sangChaudRed; }
    if ((p.pos === 'D' || p.pos === 'M') && hasTrait(p, 'roc')) e.against *= TRAIT_FX.roc;
    if (p === keeper && hasTrait(p, 'chat')) { e.keep = TRAIT_FX.chat; e.pen = TRAIT_FX.chatPen; }
  }
  return e;
}

const shooterWeight = (p, bigGame) => {
  const base = p.pos === 'A' ? p.a.fin * 3 : p.pos === 'M' ? ((p.a.fin + p.a.pas) / 2) * 1.5 : p.a.fin * 0.5;
  return (base + 1) * (bigGame && p.traits?.includes('grandsSoirs') ? 1.5 : 1) * (p.traits?.includes('frappe') ? 1.15 : 1);
};
// Tireur d'un penalty : le meilleur finisseur sur le terrain. Sa réussite, et celle d'un tireur adverse face à notre
// gardien, sont celles d'un tir de la séance de tirs au but (cups.js, penaltySkills).
const penaltyTaker = (field) => field.reduce((best, p) => (!best || p.a.fin > best.a.fin || (p.a.fin === best.a.fin && p.a.sfr > best.a.sfr) ? p : best), null);
const penHome = (taker) => clamp(0.62 + (taker?.a.fin ?? 10) / 100, 0.66, 0.84);
const penAway = (keeper) => 0.77 - (keeper ? (keeper.g?.ref || 10) / 400 : 0);

// facteur de chaque joueur à une minute donnée : sa condition physique (since : minute d'entrée en jeu de chacun). La
// forme (notes des derniers matchs) ne pèse plus en match depuis la 0.8.8 (demande du PDG : la condition physique et les
// capacités du joueur, rien d'autre) ; en ligue, elle ne voyageait déjà pas avec les joueurs.
const factorAt = (minute, since) => (p) => fitFactor(fitAt(p, minute, since(p.id)));

// probabilités de but par minute pour chaque équipe, dans l'état donné (onze, tactique, joueurs en moins : expulsés
// et blessés non remplacés, condition physique) ; convH, convA : conversion moyenne d'une occasion ; penH, penA :
// réussite d'un penalty
// holes (0.8.4, solo) : un joueur sorti sans remplaçant (expulsé, blessé) laisse son poste vide dans le niveau de
// l'équipe, et la pénalité d'infériorité numérique est réduite d'autant (même effet moyen) ; le poste où l'on place
// l'expulsé compte donc. Sans (championnat entre amis, où personne ne peut le déplacer) : la pénalité seule, comme avant.
// minute : la minute de jeu (« Infatigable ») ; away : les joueurs adverses sur le terrain, et leurs signes (0.8.5).
export const HOLE_LOSE = 0.86;
export const HOLE_GAIN = 1.115;
// finition moyenne d'une équipe : celle de chaque tireur, pondérée par sa part des tirs (même tirage que le direct)
const teamConv = (shooters, bigGame) => {
  let wSum = 0, convSum = 0;
  for (const p of shooters) {
    const w = shooterWeight(p, bigGame);
    wSum += w;
    convSum += w * convOf(p, bigGame);
  }
  return wSum ? convSum / wSum : CONVERSION;
};
// adversaire dont on ne connaît pas le onze (estimation d'avant-match d'un championnat entre amis) : les signes d'un onze
// moyen, moyenne géométrique de 2 000 onzes tirés comme en jeu (scratchpad avg-edge, 2026-10-28), finition de ses
// tireurs comprise (AVERAGE_CONV : ses Finisseurs)
const AVERAGE_EDGE = { chances: 1.2, against: 0.842, keep: 0.953, pen: 0.019, yellow: 1.122, red: 1.31 };
const AVERAGE_CONV = 1.081;
function minuteGoalChances(s, lineup, tactic, oppStrength, short = { home: 0, away: 0 }, offIds = new Set(), formation = s.formation, factorOf = null, atHome = true, oppPlan = null, holes = false, minute = 0, away = null) {
  const rating = lineupRating(s.players, holes ? lineup.map((id) => (offIds.has(id) ? null : id)) : lineup, formation, factorOf);
  const xg = expectedGoals(rating, oppStrength, tactic, formation, atHome, oppPlan);
  const bigGame = oppStrength > rating;
  const bigA = rating > oppStrength; // le grand soir de l'adversaire : nous sommes plus forts
  const on = lineup.map((id) => s.players.find((p) => p.id === id)).filter((p) => p && !offIds.has(p.id));
  const keeper = on.find((p) => p.pos === 'G');
  const field = on.filter((p) => p.pos !== 'G');
  const edgeH = edgeOf(on, { bigGame, tactic, minute });
  const edgeA = away ? edgeOf(away, { bigGame: bigA, tactic: oppPlan?.tactic || 'balanced', minute }) : AVERAGE_EDGE;
  const awayField = (away || []).filter((p) => p.pos !== 'G');
  const keepH = edgeA.keep; // leur « Chat » face à nos tireurs
  const keepA = edgeH.keep;
  const convH = teamConv(field.length ? field : on, bigGame) * keepH;
  const convA = (away?.length ? teamConv(awayField.length ? awayField : away, bigA) : CONVERSION * AVERAGE_CONV) * keepA;
  const lose = holes ? HOLE_LOSE : 0.78;
  const gain = holes ? HOLE_GAIN : 1.22;
  const lamH = xg.for * lose ** short.home * 1.22 ** short.away * edgeH.chances * edgeA.against * TRAIT_NORM;
  const lamA = xg.against * gain ** short.home * 0.78 ** short.away * edgeA.chances * edgeH.against * TRAIT_NORM;
  const taker = penaltyTaker(field);
  return {
    pH: Math.min(1, lamH / (90 * CONVERSION)) * convH, pA: Math.min(1, lamA / (90 * CONVERSION)) * convA,
    lamH, lamA, convH, convA, penH: penHome(taker) - edgeA.pen, penA: penAway(keeper) - edgeH.pen, taker, bigGame, bigA,
    keepH, keepA, redH: edgeH.red, redA: edgeA.red, yellowH: edgeH.yellow, yellowA: edgeA.yellow,
  };
}

// Chances de but d'une minute avec a expulsés de plus chez nous et b chez eux (en plus de l'état de chancesAt).
const LOSE = [1, 0.78, 0.78 ** 2, 0.78 ** 3];
const GAIN = [1, 1.22, 1.22 ** 2, 1.22 ** 3];
const goalPair = (c, a, b) => [
  Math.min(1, (c.lamH * LOSE[a] * GAIN[b]) / (90 * CONVERSION)) * c.convH,
  Math.min(1, (c.lamA * GAIN[a] * LOSE[b]) / (90 * CONVERSION)) * c.convA,
];

// Répartition victoire / nul / défaite après n minutes jouées, n tiré parmi `durations` (toutes également probables) ;
// chancesAt(minute) : chances de la minute de jeu ; minuteOf(k) : minute de jeu de la k-ième minute jouée ; short :
// joueurs de champ déjà en moins de chaque côté (expulsés, blessés non remplacés). Les expulsions à venir sont suivies :
// une équipe à huit joueurs de champ n'en perd plus (moteur, simMinute), soit au plus trois en moins. Un écart plus
// grand que les minutes qui restent est une issue déjà certaine (au plus un but par équipe et par minute) : il sort du
// calcul, qui reste exact et devient bien plus rapide.
function outcomeOdds(chancesAt, lead, durations, minuteOf = (k) => k, short = { home: 0, away: 0 }) {
  const max = Math.max(...durations);
  const off = max + 1;
  const W = 2 * off + 1;
  const hMax = Math.max(0, 3 - short.home); // expulsions encore possibles de chaque côté
  const aMax = Math.max(0, 3 - short.away);
  const NB = aMax + 1;
  const NS = (hMax + 1) * NB;
  let cur = Array.from({ length: NS }, () => new Float64Array(W));
  let nxt = Array.from({ length: NS }, () => new Float64Array(W));
  let used = new Uint8Array(NS);
  let usedNext = new Uint8Array(NS);
  const moved = new Float64Array(W);
  cur[0][off] = 1; // écart de buts supplémentaire, en partant de 0
  used[0] = 1;
  let lo = off, hi = off; // écarts encore en jeu
  let win = 0, draw = 0, loss = 0;
  let won = 0, lost = 0; // issues déjà certaines
  for (let n = 1; n <= max; n++) {
    const minute = minuteOf(n);
    const c = chancesAt(minute);
    const red = redAt(minute);
    const nlo = lo - 1, nhi = hi + 1;
    for (let st = 0; st < NS; st++) { nxt[st].fill(0, nlo, nhi + 1); usedNext[st] = 0; }
    for (let a = 0; a <= hMax; a++) {
      for (let b = 0; b <= aMax; b++) {
        const st = a * NB + b;
        if (!used[st]) continue;
        const dist = cur[st];
        const [pH, pA] = goalPair(c, a, b);
        const up = pH * (1 - pA);
        const down = pA * (1 - pH);
        const stay = 1 - up - down;
        moved.fill(0, nlo, nhi + 1);
        for (let d = lo; d <= hi; d++) {
          const v = dist[d];
          if (v === 0) continue;
          moved[d] += v * stay;
          moved[d + 1] += v * up;
          moved[d - 1] += v * down;
        }
        // les cartons de la minute tombent après ses occasions (simMinute)
        const rH = a < hMax ? red * c.redH : 0;
        const rA = b < aMax ? red * c.redA : 0;
        const spread = (to, w) => {
          const t = nxt[to];
          for (let d = nlo; d <= nhi; d++) t[d] += moved[d] * w;
          usedNext[to] = 1;
        };
        spread(st, (1 - rH) * (1 - rA));
        if (rH) spread(st + NB, rH * (1 - rA));
        if (rA) spread(st + 1, (1 - rH) * rA);
        if (rH && rA) spread(st + NB + 1, rH * rA);
      }
    }
    [cur, nxt] = [nxt, cur];
    [used, usedNext] = [usedNext, used];
    lo = nlo;
    hi = nhi;
    // écart final = lead + (d − off) : au-delà des minutes restantes, il ne peut plus changer de signe
    const rest = max - n;
    const winFrom = off + rest - lead + 1;
    const lossTo = off - rest - lead - 1;
    for (let st = 0; st < NS; st++) {
      if (!used[st]) continue;
      const dist = cur[st];
      for (let d = lo; d <= Math.min(hi, lossTo); d++) { lost += dist[d]; dist[d] = 0; }
      for (let d = Math.max(lo, winFrom); d <= hi; d++) { won += dist[d]; dist[d] = 0; }
    }
    lo = Math.max(lo, lossTo + 1);
    hi = Math.min(hi, winFrom - 1);
    const k = durations.filter((x) => x === n).length;
    if (!k) continue;
    const share = k / durations.length;
    win += won * share;
    loss += lost * share;
    for (let st = 0; st < NS; st++) {
      if (!used[st]) continue;
      const dist = cur[st];
      for (let d = lo; d <= hi; d++) {
        const v = dist[d];
        if (v === 0) continue;
        const final = lead + d - off;
        if (final > 0) win += v * share; else if (final === 0) draw += v * share; else loss += v * share;
      }
    }
  }
  return { win, draw, loss };
}

// chances de but minute par minute, mémorisées (la condition physique change chaque minute)
const memoChances = (fn) => { const cache = new Map(); return (minute) => { if (!cache.has(minute)) cache.set(minute, fn(minute)); return cache.get(minute); }; };

// avant le coup d'envoi : 90 minutes plus le temps additionnel des deux mi-temps (chaque durée de la première
// mi-temps à part : la seconde commence à la 46e minute de jeu, quel que soit le temps additionnel), le onze de
// départ jusqu'au bout, sa condition qui baisse au fil du match ; home : false pour un match à l'extérieur (Élite)
// away : le onze adverse, dont les signes comptent (awayElevenOf) ; inconnu (null) : un onze ordinaire
export function prematchOdds(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation, oppStrength, home = true, oppPlan = null, away = null }) {
  const chancesAt = memoChances((minute) => minuteGoalChances(s, lineup, tactic, oppStrength, undefined, undefined, formation, factorAt(minute, () => 0), home, oppPlan, false, minute, away));
  const parts = HALF1.map((h1) => outcomeOdds(chancesAt, 0, HALF2.map((h2) => h1 + h2), (k) => (k <= h1 ? k : 45 + k - h1)));
  const mean = (key) => parts.reduce((a, o) => a + o[key], 0) / parts.length;
  return { win: mean('win'), draw: mean('draw'), loss: mean('loss') };
}

// Buts attendus du match selon le même moteur que le pronostic (traits des tireurs et du gardien, condition physique,
// expulsions à venir, temps additionnel moyen compris) : l'avant-match ne peut pas afficher des buts attendus qui
// contredisent ses pourcentages.
const MEAN_H1 = Math.round(HALF1.reduce((a, b) => a + b, 0) / HALF1.length);
const MEAN_H2 = Math.round(HALF2.reduce((a, b) => a + b, 0) / HALF2.length);
export function prematchXg(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation, oppStrength, home = true, oppPlan = null, away = null }) {
  const chancesAt = memoChances((minute) => minuteGoalChances(s, lineup, tactic, oppStrength, undefined, undefined, formation, factorAt(minute, () => 0), home, oppPlan, false, minute, away));
  // répartition des expulsions (a chez nous, b chez eux), qui ne dépendent pas des buts : minute après minute
  let pr = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let xf = 0, xa = 0;
  const step = (minute) => {
    const c = chancesAt(minute);
    const red = redAt(minute);
    const next = new Array(16).fill(0);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        const p = pr[a * 4 + b];
        if (!p) continue;
        const [pH, pA] = goalPair(c, a, b);
        xf += p * pH;
        xa += p * pA;
        const rH = a < 3 ? red * c.redH : 0;
        const rA = b < 3 ? red * c.redA : 0;
        next[a * 4 + b] += p * (1 - rH) * (1 - rA);
        if (rH) next[(a + 1) * 4 + b] += p * rH * (1 - rA);
        if (rA) next[a * 4 + b + 1] += p * (1 - rH) * rA;
        if (rH && rA) next[(a + 1) * 4 + b + 1] += p * rH * rA;
      }
    }
    pr = next;
  };
  for (let k = 1; k <= MEAN_H1; k++) step(k);
  for (let k = 1; k <= MEAN_H2; k++) step(45 + k);
  return { for: xf, against: xa };
}

// Changements entre deux onzes : chaque entrant face au sortant qu'il remplace (celui de son poste s'il sort,
// sinon un sortant resté sans remplaçant).
export function pairSubs(before, next) {
  const outs = before.filter((id) => !next.includes(id));
  const pairs = next.filter((id) => !before.includes(id)).map((id) => [id, before[next.indexOf(id)]]);
  const left = outs.filter((o) => !pairs.some(([, b]) => b === o));
  for (const p of pairs) if (!outs.includes(p[1])) p[1] = left.shift();
  return pairs;
}

// Minute à laquelle un changement décidé à l'instant `clock` du direct prend effet : au prochain arrêt de jeu, une à
// deux minutes plus tard, après tout ce que le direct a déjà montré.
export const subMinute = (clock) => Math.ceil(clock + 0.9);

// --- Reprise après une fermeture de l'app ---------------------------------------------------------------------------
// Tout l'état du direct en objet simple (les ensembles en tableaux), pour la sauvegarde du match en cours (save.js,
// saveLive). La suite déjà simulée d'avance est gardée telle quelle : fermer l'app ne rejoue rien. Les instantanés sont
// gardés à partir de la minute affichée : un changement peut encore revenir sur les minutes simulées d'avance.
// Version 2 (0.7) : onze adverse de vrais joueurs, penalties, types d'action ; un direct d'avant n'est pas repris.
export const LIVE_VERSION = 2;
const SNAP_SETS = ['sentH', 'sentA', 'bookedH', 'bookedA', 'out', 'gone', 'played', 'usedAmbience'];
const packSnap = (x) => ({ ...x, ...Object.fromEntries(SNAP_SETS.map((k) => [k, [...x[k]]])) });
const unpackSnap = (x) => ({ ...x, ...Object.fromEntries(SNAP_SETS.map((k) => [k, new Set(x[k])])) });
const packLive = (m, from) => ({
  ...m,
  snaps: [...m.snaps].filter(([k]) => k >= from).map(([k, v]) => [k, packSnap(v)]),
  sent: { home: [...m.sent.home], away: [...m.sent.away] },
  booked: { home: [...m.booked.home], away: [...m.booked.away] },
  out: [...m.out], gone: [...m.gone], played: [...m.played], usedAmbience: [...m.usedAmbience],
});
const unpackLive = (x) => ({
  ...x,
  snaps: new Map((x.snaps || []).map(([k, v]) => [k, unpackSnap(v)])),
  sent: { home: new Set(x.sent.home), away: new Set(x.sent.away) },
  booked: { home: new Set(x.booked.home), away: new Set(x.booked.away) },
  out: new Set(x.out), gone: new Set(x.gone), played: new Set(x.played), usedAmbience: new Set(x.usedAmbience),
});
// Le match d'une sauvegarde : club, date du calendrier, compétition et adversaire (un autre match n'est jamais repris).
export const liveKeyOf = (s, ctx) => `${s.clubName}|${s.seasonNumber}:${s.calIndex || 0}:${s.round}|${ctx.comp || 'league'}|${ctx.opp.name}`;

// Statistiques montrées par le direct : seulement ce qu'il a déjà montré (le moteur a quelques minutes d'avance).
// [club, adversaire] ; big : grosses occasions (penalties compris) ; xg : buts attendus des tirs montrés.
export function statsOf(shown) {
  const x = { shots: [0, 0], on: [0, 0], saves: [0, 0], post: [0, 0], yellow: [0, 0], red: [0, 0], big: [0, 0], xg: [0, 0], pens: [0, 0] };
  for (const e of shown) {
    const i = e.side === 'home' ? 0 : 1;
    if (e.type === 'goal' || e.type === 'chance') {
      x.shots[i]++;
      x.xg[i] += e.xg || 0;
      if (e.q === 'big' || e.q === 'pen') x.big[i]++;
      if (e.q === 'pen') x.pens[i]++;
      if (e.type === 'goal') x.on[i]++;
      else if (e.outcome === 'saved') { x.on[i]++; x.saves[1 - i]++; } else if (e.outcome === 'post') x.post[i]++;
    } else if (e.type === 'yellow') x.yellow[i]++;
    else if (e.type === 'red') x.red[i]++;
  }
  return x;
}

// Onze adverse d'un match : le vrai (championnat entre amis), sinon celui tiré de son nom (opponents.js). Une partie
// de championnat entre amis ne connaît pas le onze de son adversaire avant la journée : null (un onze ordinaire).
export const awayElevenOf = (s, ctx) => (ctx.awayEleven ? ctx.awayEleven.players : s.league ? null : opponentEleven(s, ctx.opp).players);

// saved : un direct sauvegardé (save(), plus bas) à reprendre tel quel.
// ctx.awayEleven : le vrai onze de l'adversaire ({ formation, players }, championnat entre amis), sinon tiré de son nom ;
// ctx.oppPlan : son plan de jeu ({ tactic, formation }), qui pèse sur les occasions des deux côtés (expectedGoals).
export function createLiveMatch(s, ctx, saved = null) {
  const opp = saved ? null : ctx.awayEleven || opponentEleven(s, ctx.opp);
  const m = {
    home: s.clubName,
    away: ctx.opp.name,
    oppStrength: ctx.opp.strength,
    oppPlan: ctx.oppPlan || null,
    holes: ctx.holes !== false, // poste vide d'un expulsé ou d'un blessé non remplacé compté (minuteGoalChances)
    lineup: [...s.lineup],
    startLineup: [...s.lineup], // onze de départ (historique du match : composition sur le terrain)
    subsList: [], // changements faits : entrant, sortant, minute
    formation: formationOf(s.formation).id,
    startFormation: formationOf(s.formation).id, // dispositif du coup d'envoi (un plan de mi-temps peut le changer)
    comp: ctx.comp || 'league',
    atHome: ctx.home !== false, // à l'extérieur (Élite) : l'avantage du terrain passe à l'adversaire
    knockout: !!ctx.knockout, // coupe : pas de match nul, tirs au but
    pens: null,
    awayRoster: opp?.players || [], // onze adverse : de vrais joueurs (opponents.js), dans l'ordre des postes de son dispositif
    awayFormation: opp?.formation || '433',
    myRating: Math.round(lineupRating(s.players, s.lineup, s.formation) * 10) / 10, // notre niveau au coup d'envoi (notes adverses)
    tactic: s.tactic,
    score: { home: 0, away: 0 },
    // statistiques détaillées (fiche Stats Pass) : [club, adversaire] ; xg = buts attendus, saves = arrêts du gardien,
    // big = grosses occasions, pens = penalties obtenus
    stats: {
      shots: [0, 0], onTarget: [0, 0], possession: 50, yellow: [0, 0], red: [0, 0],
      xg: [0, 0], saves: [0, 0], post: [0, 0], wide: [0, 0], big: [0, 0], pens: [0, 0], possHalf: [null, null], longShots: 0,
    },
    shots: [], // chaque tir : minute, mi-temps, camp, issue (g but, s arrêté, w à côté, p poteau), tireur, xG, qualité, action
    halves: [[], []], // événements de chaque mi-temps, dans l'ordre (le direct et la 3D lisent le tableau de la mi-temps en cours)
    scorers: [],
    half: 0,
    begun: [false, false], // mi-temps commencées
    halfLength: [45 + ri(1, 3), 45 + ri(2, 5)],
    simTo: 0, // dernière minute simulée
    snaps: new Map(), // instantanés avant chaque minute simulée (reprise après un changement)
    rewound: 0, // compteur : des minutes simulées ont été reprises (les temps forts préparés pour elles sont oubliés)
    sent: { home: new Set(), away: new Set() },
    booked: { home: new Set(), away: new Set() },
    out: new Set(), // nos blessés sortis pendant le match (identifiants)
    gone: new Set(), // nos joueurs sortis (remplacés ou blessés) : ils ne reviennent pas
    injuries: [], // { id, name, minute }
    subsUsed: 0,
    played: new Set(s.lineup), // joueurs entrés en jeu (notes de match)
    perf: {}, // par joueur : buts, passes décisives, cartons, entrée et sortie
    // forme du jour de chaque joueur des deux équipes (notes du match), tirée au coup d'envoi ; clé : identifiant chez
    // nous, « o: » + nom chez l'adversaire
    form: {},
    seed: Math.floor(Math.random() * 1e9), // ondulations de la possession affichée
    lastAmbience: 0,
    usedAmbience: new Set(),
    preOdds: null, // chances annoncées au coup d'envoi (gardées avec le match : fiabilité du pronostic, Stats)
  };
  if (!saved) {
    for (const p of s.players) m.form[p.id] = Math.round((Math.random() - 0.5) * 120) / 100;
    for (const p of m.awayRoster) m.form[`o:${p.name}`] = Math.round((Math.random() - 0.5) * 120) / 100;
  }
  if (saved) Object.assign(m, unpackLive(saved));
  if (!m.preOdds) {
    const o = prematchOdds(s, { oppStrength: ctx.opp.strength, home: ctx.home !== false, oppPlan: m.oppPlan, away: m.awayRoster });
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    m.preOdds = { w: r4(o.win), d: r4(o.draw), l: r4(o.loss) };
    if (ctx.knockout) { // qualification : victoire, ou nul puis séance de tirs au but gagnée
      const pens = penaltySkills(s.lineup.map((id) => s.players.find((p) => p.id === id)).filter(Boolean));
      m.preOdds.q = r4(o.win + o.draw * shootoutWinChance(pens.home, pens.away));
    }
  }
  const awayRoster = m.awayRoster;
  const perf = (id) => (m.perf[id] ||= { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 });
  const has = (p, t) => p.traits?.includes(t);
  const since = (id) => m.perf[id]?.in ?? 0; // minute d'entrée en jeu (titulaires : 0)
  const offIds = () => new Set([...m.sent.home, ...m.out]);
  const playersOn = () => m.lineup.map((id) => s.players.find((p) => p.id === id)).filter((p) => p && !m.sent.home.has(p.id) && !m.out.has(p.id));
  const awayOn = () => awayRoster.filter((p) => !m.sent.away.has(p.name));
  const shortOf = (lineup = m.lineup) => ({ home: m.sent.home.size + [...m.out].filter((id) => lineup.includes(id)).length, away: m.sent.away.size });
  const vars = (extra = {}) => ({ home: m.home, away: m.away, n: isPluralClub(m.away) ? 'nt' : '', v: isPluralClub(m.away) ? 'vent' : 't', ...extra });
  const TX = m.atHome === false ? T_AWAY : T; // gabarits du commentaire : à domicile, ou dans le stade adverse
  const ambience = () => { // pas deux fois la même phrase d'ambiance dans un match
    let pool = TX.ambience.filter((t) => !m.usedAmbience.has(t));
    if (!pool.length) { m.usedAmbience.clear(); pool = TX.ambience; }
    const t = pick(pool);
    m.usedAmbience.add(t);
    return t;
  };
  const events = () => m.halves[m.half - 1];
  const label = (at, half) => {
    const base = half === 1 ? 45 : 90;
    const mm = Math.ceil(at);
    return mm > base ? `${base}+${mm - base}` : `${mm}`;
  };
  const make = (at, type, side, text, extra = {}) => ({ at, minute: label(at, extra.half ?? m.half), type, side, text, half: m.half, ...extra });
  const push = (at, type, side, text, extra = {}) => { const e = make(at, type, side, text, extra); events().push(e); return e; };
  const chancesNow = (minute, lineup = m.lineup, tactic = m.tactic) => minuteGoalChances(s, lineup, tactic, m.oppStrength, shortOf(lineup), offIds(), m.formation, factorAt(minute, since), m.atHome !== false, m.oppPlan, m.holes, minute, awayOn());

  // tireur : la finition compte (beaucoup pour un attaquant, un peu pour un milieu, peu pour un défenseur), chez nous
  // comme chez eux ; même pondération que le pronostic
  function homeShooter(bigGame) {
    const out = playersOn().filter((p) => p.pos !== 'G');
    return pickWeighted(out.length ? out : playersOn(), (p) => shooterWeight(p, bigGame));
  }
  const awayShooter = (bigGame = false) => { const field = awayOn().filter((p) => p.pos !== 'G'); return pickWeighted(field.length ? field : awayOn(), (p) => shooterWeight(p, bigGame)); };
  const awayTaker = () => penaltyTaker(awayOn().filter((p) => p.pos !== 'G')) || awayShooter();
  // dernier passeur d'une action qui finit sur une passe : la passe compte, le signe « Passeur » triple les chances ;
  // un centre vient plutôt d'un joueur de couloir
  function assistOf(side, shooter, kind) {
    if (!PASS_KINDS.has(kind)) return null;
    const pool = (side === 'home' ? playersOn() : awayOn()).filter((p) => p !== shooter && p.pos !== 'G');
    if (!pool.length) return null;
    const wide = kind === 'cross' || kind === 'cutback' || kind === 'corner';
    return pickWeighted(pool, (p) => (p.a.pas + (p.pos === 'M' ? 3 : 0)) * (has(p, 'passeur') ? 3 : 1) * (wide && p.pos !== 'A' ? 1.2 : 1));
  }
  // discipline : un joueur sans sang-froid, ou « Sang chaud », prend plus souvent les cartons
  const discipline = (p) => ((21 - (p.a?.sfr ?? 10)) / 10) * (has(p, 'sangChaud') ? 2.5 : 1);

  // --- Instantanés : tout ce qu'une minute simulée peut changer ---------------------------------------------------
  function snapshot() {
    return {
      score: { ...m.score }, pens: m.pens,
      stats: { ...m.stats, shots: [...m.stats.shots], onTarget: [...m.stats.onTarget], yellow: [...m.stats.yellow], red: [...m.stats.red], xg: [...m.stats.xg], saves: [...m.stats.saves], post: [...m.stats.post], wide: [...m.stats.wide], big: [...m.stats.big], pens: [...m.stats.pens], possHalf: [...m.stats.possHalf] },
      shots: [...m.shots], scorers: [...m.scorers], len: events().length,
      sentH: new Set(m.sent.home), sentA: new Set(m.sent.away), bookedH: new Set(m.booked.home), bookedA: new Set(m.booked.away),
      out: new Set(m.out), gone: new Set(m.gone), injuries: [...m.injuries], played: new Set(m.played),
      perf: JSON.parse(JSON.stringify(m.perf)), lineup: [...m.lineup], tactic: m.tactic, formation: m.formation, subsUsed: m.subsUsed, subsList: [...m.subsList],
      lastAmbience: m.lastAmbience, usedAmbience: new Set(m.usedAmbience), simTo: m.simTo,
    };
  }
  function restore(x) {
    Object.assign(m, {
      score: { ...x.score }, pens: x.pens, stats: { ...x.stats, shots: [...x.stats.shots], onTarget: [...x.stats.onTarget], yellow: [...x.stats.yellow], red: [...x.stats.red], xg: [...x.stats.xg], saves: [...x.stats.saves], post: [...x.stats.post], wide: [...x.stats.wide], big: [...x.stats.big], pens: [...x.stats.pens], possHalf: [...x.stats.possHalf] },
      shots: [...x.shots], scorers: [...x.scorers], out: new Set(x.out), gone: new Set(x.gone), injuries: [...x.injuries], played: new Set(x.played),
      perf: JSON.parse(JSON.stringify(x.perf)), lineup: [...x.lineup], tactic: x.tactic, formation: x.formation ?? m.formation, subsUsed: x.subsUsed, subsList: [...x.subsList],
      lastAmbience: x.lastAmbience, usedAmbience: new Set(x.usedAmbience), simTo: x.simTo,
    });
    m.sent = { home: new Set(x.sentH), away: new Set(x.sentA) };
    m.booked = { home: new Set(x.bookedH), away: new Set(x.bookedA) };
    events().length = x.len; // les événements des minutes reprises disparaissent, le tableau reste le même objet
    for (const k of [...m.snaps.keys()]) if (k > x.simTo + 1) m.snaps.delete(k);
    m.rewound += 1;
  }

  // --- Possession affichée -------------------------------------------------------------------------------------------
  // Chaque mi-temps a sa tendance (possHalf, tirée à son coup d'envoi) ; minute après minute, la possession ondule
  // autour, et celle du match est la moyenne des minutes jouées (affichage seulement : elle ne décide d'aucun tirage).
  const possMinute = (half, k) => {
    const base = m.stats.possHalf[half - 1] ?? 50;
    const ph = ((half === 1 ? m.seed : Math.floor(m.seed / 997)) % 628) / 100;
    return clamp(base + 6 * Math.sin(k * 0.23 + ph) + 3 * Math.sin(k * 0.61 + ph * 2), 20, 80);
  };
  function possessionAt(half, clock) {
    let sum = 0, n = 0;
    const end1 = half === 1 ? Math.min(clock, m.halfLength[0]) : m.halfLength[0];
    for (let k = 1; k <= end1; k++) { sum += possMinute(1, k); n++; }
    if (half === 2) for (let k = 46; k <= Math.min(clock, 45 + m.halfLength[1]); k++) { sum += possMinute(2, k); n++; }
    return n ? Math.round(sum / n) : Math.round(m.stats.possHalf[half - 1] ?? 50);
  }

  // --- Simulation ---------------------------------------------------------------------------------------------------
  function beginHalf(half) {
    if (m.begun[half - 1]) return;
    m.begun[half - 1] = true;
    m.half = half;
    m.simTo = half === 1 ? 0 : 45;
    m.lastAmbience = m.simTo;
    const rating = lineupRating(s.players, m.lineup, m.formation);
    const diff = rating - m.oppStrength;
    const tilt = (m.tactic === 'offensive' ? 6 : m.tactic === 'low' ? -9 : 0) + (formationOf(m.formation).lines[1] - 3) * 2.5 // un milieu fourni tient le ballon
      + (m.atHome === false ? -4 : 0) // à l'extérieur, l'adversaire tient davantage le ballon
      - (m.oppPlan?.tactic === 'offensive' ? 6 : m.oppPlan?.tactic === 'low' ? -9 : 0); // son plan de jeu, en miroir du nôtre
    m.stats.possHalf[half - 1] = Math.round(clamp(50 + diff * 3 + tilt + (Math.random() - 0.5) * 6, 28, 74));
    if (half === 1) push(0, 'kickoff', null, fill(pick(TX.kickoff), vars()));
    else push(45, 'kickoff', null, t('Reprise de la seconde période !'));
  }
  const halfEnd = () => (m.half === 1 ? m.halfLength[0] : 45 + m.halfLength[1]);

  // Une minute de jeu : occasions, cartons, blessures, ambiance ; les événements de la minute sont rangés par instant.
  function simMinute(minute) {
    m.snaps.set(minute, snapshot());
    for (const k of [...m.snaps.keys()]) if (k < minute - SNAPS_KEEP) m.snaps.delete(k);
    const batch = [];
    const add = (at, type, side, text, extra = {}) => { const e = make(at, type, side, text, extra); batch.push(e); return e; };
    // première minute du temps additionnel : le quatrième arbitre l'annonce (le fil reste rangé par instant, sans tri :
    // chaque minute s'ajoute à la suite de la précédente, ce qui permet de reprendre le fil à une minute donnée)
    const baseEnd = m.half === 1 ? 45 : 90;
    const extra = halfEnd() - baseEnd;
    if (minute === baseEnd + 1 && extra > 0) events().push(make(minute - 0.95, 'info', null, tn(extra, '{extra} minute de temps additionnel.', '{extra} minutes de temps additionnel.', { extra }, extra > 1)));
    const c = chancesNow(minute);
    const at = minute - Math.random() * 0.9;
    for (const [side, lam] of [['home', c.lamH], ['away', c.lamA]]) {
      if (Math.random() >= lam / (90 * CONVERSION)) continue;
      const home = side === 'home';
      const idx = home ? 0 : 1;
      let p, conv, q, kind;
      if (Math.random() < PEN_SHARE) { // penalty : le meilleur finisseur sur le terrain le tire
        p = home ? c.taker || homeShooter(c.bigGame) : awayTaker();
        conv = home ? c.penH : c.penA;
        q = 'pen';
        kind = 'penalty';
      } else {
        p = home ? homeShooter(c.bigGame) : awayShooter(c.bigA);
        // finition : « Finisseur » et « grands soirs » du tireur, « Chat » dans les cages d'en face, des deux côtés
        // (0.8.5) ; les penalties prennent leur part des buts attendus (keep), la qualité de l'occasion a une moyenne
        // de 1 : le nombre de buts attendu ne change pas, le pronostic reste exact
        const base = convOf(p, home ? c.bigGame : c.bigA) * (home ? c.keepH : c.keepA);
        const keep = home ? (c.convH - PEN_SHARE * c.penH) / ((1 - PEN_SHARE) * c.convH) : (c.convA - PEN_SHARE * c.penA) / ((1 - PEN_SHARE) * c.convA);
        const qr = Math.random();
        q = qr < P_BIG ? 'big' : qr < P_BIG + P_STD ? 'std' : 'hard';
        conv = base * (q === 'big' ? Q_BIG : q === 'std' ? Q_STD : Q_HARD) * keep;
        const long = has(p, 'frappe') && Math.random() < 0.4; // « Frappe » : il tente souvent sa chance de loin
        if (long && home) m.stats.longShots++;
        kind = long ? 'long' : drawKind(q);
      }
      m.stats.shots[idx]++;
      if (home) perf(p.id).shots++;
      if (q === 'pen') m.stats.pens[idx]++;
      if (q === 'big' || q === 'pen') m.stats.big[idx]++;
      m.stats.xg[idx] += conv;
      const lead = fill(pick(T.chance[side][kind]), vars({ p: p.name }));
      const shot = { m: label(at, m.half), at: Math.round(at * 10) / 10, h: m.half, s: idx, p: p.name, x: Math.round(conv * 100) / 100, q, k: kind };
      m.shots.push(shot);
      const assist = assistOf(side, p, kind);
      const seed = Math.floor(Math.random() * 1e9); // variante de l'action construite en 3D
      const meta = { player: p.name, playerId: home ? p.id : null, xg: conv, q, kind, seed, assist: assist?.name || null };
      if (Math.random() < conv) {
        shot.o = 'g';
        m.stats.onTarget[idx]++;
        if (home) perf(p.id).onTarget++;
        m.score[side]++;
        const gap = m.score.away - m.score.home; // écart après le but, vu de l'adversaire
        const late = at >= 89 || (m.half === 1 && at >= 44.5); // arrêts de jeu : un commentaire sur deux le souligne
        const poolOf = (G, g) => (late && G.late && Math.random() < 0.5 ? G.late : g === 0 ? G.level : g === 1 ? G.lead : g > 1 ? G.more : G.back);
        let text = fill(pick(home ? poolOf(TX.goalHome, -gap) : poolOf(TX.goalAway, gap)), vars({ p: p.name }));
        if (assist) text += t(' Passe décisive {deName}.', { deName: deName(assist.name) });
        if (home) {
          perf(p.id).goals++;
          if (assist) perf(assist.id).assists++;
          m.scorers.push({ name: p.name, id: p.id, minute: Math.ceil(at), assist: assist?.name || null, pen: q === 'pen' });
        }
        add(at, 'goal', side, text, { ...meta, score: { ...m.score }, lead });
      } else {
        const r = Math.random();
        // un penalty manqué est arrêté sept fois sur dix
        const outcome = q === 'pen' ? (r < 0.7 ? 'saved' : r < 0.92 ? 'wide' : 'post') : r < 0.45 ? 'saved' : r < 0.85 ? 'wide' : 'post';
        shot.o = outcome[0];
        if (outcome === 'saved') {
          m.stats.onTarget[idx]++;
          m.stats.saves[1 - idx]++; // arrêt du gardien d'en face
          if (home) perf(p.id).onTarget++;
        } else m.stats[outcome === 'wide' ? 'wide' : 'post'][idx]++;
        add(at, 'chance', side, `${lead} ${pick(q === 'pen' ? T.pen[outcome] : T[outcome])}`, { ...meta, outcome });
      }
    }
    // cartons : une expulsion au risque de la minute (redAt), le plus souvent d'un joueur déjà averti ; un carton
    // jaune, à un joueur pas encore averti (un averti se montre prudent)
    for (const side of ['home', 'away']) {
      const home = side === 'home';
      const r = Math.random();
      const cat = minute - Math.random() * 0.9;
      const pool = (home ? playersOn() : awayOn()).filter((p) => p.pos !== 'G');
      const keyOf = (q) => (home ? q.id : q.name);
      const team = home ? m.home : m.away;
      const red = redAt(minute) * (home ? c.redH : c.redA); // « Sang chaud » : plus d'expulsions (pronostic compris)
      if (r < red) {
        if (pool.length <= 7) continue; // une équipe ne descend pas sous sept joueurs de champ
        const p = pickWeighted(pool, (q) => (m.booked[side].has(keyOf(q)) ? RED_BOOKED : 1) * discipline(q));
        const second = m.booked[side].has(keyOf(p));
        m.sent[side].add(keyOf(p));
        if (home) { perf(p.id).red++; perf(p.id).out = Math.ceil(cat); }
        m.stats.red[home ? 0 : 1]++;
        add(cat, 'red', side, fill(pick(second ? T.secondYellow : T.red), vars({ p: p.name, team })), { player: p.name, playerId: home ? p.id : null, second });
      } else if (r < red + YELLOW_PER_MIN * (home ? c.yellowH : c.yellowA)) {
        const fresh = pool.filter((q) => !m.booked[side].has(keyOf(q)));
        if (!fresh.length) continue;
        const p = pickWeighted(fresh, discipline);
        m.booked[side].add(keyOf(p));
        if (home) perf(p.id).yellow++;
        m.stats.yellow[home ? 0 : 1]++;
        add(cat, 'yellow', side, fill(pick(T.yellow), vars({ p: p.name, team })), { player: p.name, playerId: home ? p.id : null });
      }
    }
    // blessures : un de nos joueurs de champ, d'autant plus souvent qu'il est fatigué ; il doit sortir
    for (const p of playersOn()) {
      if (p.pos === 'G') continue;
      const fit = fitAt(p, minute, since(p.id));
      // centre médical : la prévention retire 8 % du risque par niveau (medical.js)
      if (Math.random() >= INJURY_PER_MIN * (1 - injuryCut(s.buildings?.medical || 0)) * (1 + INJURY_TIRED * (1 - fit / 100))) continue;
      const iat = minute - Math.random() * 0.9;
      m.out.add(p.id);
      m.gone.add(p.id);
      perf(p.id).out = Math.ceil(iat);
      m.injuries.push({ id: p.id, name: p.name, minute: Math.ceil(iat) });
      add(iat, 'injury', 'home', fill(pick(T.injury), vars({ p: p.name })), { player: p.name, playerId: p.id });
      break; // une blessure par minute au plus
    }
    // ambiance, de temps en temps
    if (minute - m.lastAmbience > ri(6, 11)) {
      m.lastAmbience = minute;
      add(minute - Math.random() * 0.9, 'info', null, fill(ambience(), vars()));
    }
    batch.sort((a, b) => a.at - b.at);
    events().push(...batch);
    m.simTo = minute;
  }

  function endHalf() {
    const half = m.half;
    const end = halfEnd();
    if (half === 2 && m.knockout && m.score.home === m.score.away) { // égalité en coupe : séance de tirs au but
      const { home: homeSkill, away: awaySkill } = penaltySkills(playersOn());
      const so = shootout(homeSkill, awaySkill);
      m.pens = [so.home, so.away];
      push(end - 0.02, 'info', null, t('Égalité au bout du temps réglementaire : place aux tirs au but !'));
      push(end - 0.01, 'pens', so.home > so.away ? 'home' : 'away',
        so.home > so.away ? t('Tirs au but : {home} l’emporte {home2}–{away} et se qualifie !', { home: m.home, home2: so.home, away: so.away }) : t('Tirs au but : {away} s’impose {away2}–{home}. {home2} est éliminé.', { away: m.away, away2: so.away, home: so.home, home2: m.home }),
        { kicks: so.kicks });
    }
    m.stats.possession = possessionAt(half, end);
    push(end, half === 1 ? 'halftime' : 'fulltime', null, tn(half, 'Mi-temps : {home} {home2} – {away} {away2}.', 'Coup de sifflet final ! {home3} {home4} – {away3} {away4}{v}.', { home: m.home, home2: m.score.home, away: m.score.away, away2: m.away, home3: m.home, home4: m.score.home, away3: m.score.away, away4: m.away, v: m.pens ? t(' ({v}–{v2} aux tirs au but)', { v: m.pens[0], v2: m.pens[1] }) : '' }, !(half === 1)));
    m.simTo = end + 1; // mi-temps close
  }
  const halfDone = () => m.simTo > halfEnd();

  // Le staff remplace nos blessés encore sur le terrain, quand le match se joue sans toi (match joué d'un bloc, fin de
  // mi-temps passée) : le meilleur remplaçant disponible à son poste, s'il reste un changement, à la minute suivante
  // (à la pause si la mi-temps est finie). Sans changement ni remplaçant, l'équipe finit à dix.
  function staffSubs() {
    const hurt = m.lineup.filter((id) => m.out.has(id));
    if (!hurt.length) return;
    const slots = slotsOf(m.formation);
    const next = [...m.lineup];
    let ins = 0;
    for (const id of hurt) {
      if (m.subsUsed + ins >= SUBS_MAX) break;
      const k = next.indexOf(id);
      const bench = s.players.filter((p) => !next.includes(p.id) && !m.gone.has(p.id) && !m.out.has(p.id) && available(p));
      if (!bench.length) break;
      bench.sort((a, b) => ratingAt(b, slots[k]) - ratingAt(a, slots[k]) || (b.pos === slots[k]) - (a.pos === slots[k]));
      next[k] = bench[0].id;
      ins += 1;
    }
    if (!ins) return;
    const minute = m.simTo + 1;
    if (minute <= halfEnd()) change(minute, { lineup: next, staff: true });
    else if (m.half === 1) change(45, { lineup: next, halftime: true, staff: true });
  }

  // Simule la mi-temps en cours jusqu'à la minute demandée (bornée par la fin de la mi-temps). staff : le match se joue
  // sans toi, le staff fait entrer un remplaçant à la place d'un blessé (staffSubs).
  function advanceTo(minute, { staff = false } = {}) {
    if (!m.half || halfDone()) return;
    const end = halfEnd();
    if (staff) staffSubs();
    while (m.simTo < Math.min(minute, end)) {
      simMinute(m.simTo + 1);
      if (staff) staffSubs();
    }
    if (m.simTo >= end) endHalf();
  }

  // Notes du match (0.7), sur 10 au dixième, pour les deux équipes : elles évoluent pendant le match d'après ce que le
  // direct a montré (shown), et la note finale est celle du coup de sifflet (shown : tout le match, minute 90). Base 6,
  // niveau du joueur face à l'adversaire, forme du jour (tirée au coup d'envoi), buts (+1), passes décisives (+0,6), tirs
  // cadrés (+0,1), arrêts du gardien (+0,1), cartons (−0,4 le jaune, −1,5 le rouge), buts encaissés du gardien (−0,3) ;
  // au prorata du temps écoulé, le résultat (±0,5) et la cage inviolée (+0,8 le gardien, +0,4 les défenseurs).
  function ratingsAt(shown, minute) {
    const f = Math.min(1, Math.max(0, minute) / 90);
    let gf = 0, ga = 0;
    for (const e of shown) if (e.type === 'goal') { if (e.side === 'home') gf++; else ga++; }
    const res = (gf > ga ? 0.5 : gf < ga ? -0.5 : 0) * f;
    // qui a joué, à quel poste et combien de temps : onze de départ, puis changements montrés
    const lineup = [...m.startLineup];
    let slots = slotsOf(m.startFormation || m.formation);
    const home = new Map(lineup.map((id, k) => [id, { id, pos: slots[k], in: 0, out: null }]));
    // visiteur : son onze de départ (awayStart, gardé quand un plan de mi-temps le change), puis ses entrants
    const away = new Map((m.awayStart || awayRoster).map((p) => [p.name, { p, pos: p.pos, in: 0, out: null }]));
    const awayNow = new Map(awayRoster.map((p) => [p.name, p]));
    const homeByName = new Map(s.players.map((p) => [p.name, p.id]));
    const add = (rec, k, v) => { if (rec) rec[k] = (rec[k] || 0) + v; };
    for (const e of shown) {
      const mine = e.side === 'home';
      const at = Math.ceil(e.at);
      if (e.type === 'sub' && e.inId != null) {
        const k = lineup.indexOf(e.outId);
        const rec = home.get(e.outId);
        if (rec && rec.out == null) rec.out = at;
        if (k >= 0) lineup[k] = e.inId;
        if (!home.has(e.inId)) home.set(e.inId, { id: e.inId, pos: k >= 0 ? slots[k] : null, in: at, out: null });
        continue;
      }
      if (e.type === 'sub' && e.inName) {
        const rec = away.get(e.outName);
        if (rec && rec.out == null) rec.out = at;
        const p = awayNow.get(e.inName);
        if (p && !away.has(e.inName)) away.set(e.inName, { p, pos: p.pos, in: at, out: null });
        continue;
      }
      if (e.type === 'info' && e.side === 'home' && e.lineup) { // dispositif ou postes changés : les postes des entrants suivants
        if (e.formation) slots = slotsOf(e.formation);
        lineup.splice(0, lineup.length, ...e.lineup);
        continue;
      }
      const recOf = (name, id) => (mine ? home.get(id ?? homeByName.get(name)) : away.get(name));
      const who = recOf(e.player, e.playerId);
      if (e.type === 'goal') {
        add(who, 'goals', 1);
        add(who, 'on', 1);
        if (e.assist) add(recOf(e.assist), 'assists', 1);
        const keeper = mine ? [...away.values()].find((r) => r.pos === 'G') : [...home.values()].find((r) => r.pos === 'G' && r.out == null);
        add(keeper, 'conceded', 1);
      } else if (e.type === 'chance') {
        if (e.outcome === 'saved' || e.outcome === 'post') add(who, 'on', 1);
        if (e.outcome === 'saved') {
          const keeper = mine ? [...away.values()].find((r) => r.pos === 'G') : [...home.values()].find((r) => r.pos === 'G' && r.out == null);
          add(keeper, 'saves', 1);
        }
      } else if (e.type === 'yellow') add(who, 'yellow', 1);
      else if (e.type === 'red') { add(who, 'red', 1); if (who && who.out == null) who.out = at; } else if (e.type === 'injury' && who && who.out == null) who.out = at;
    }
    const noteOf = (rec, level, conceded) => {
      let r = 6 + res * (rec.side === 'away' ? -1 : 1) + level * 0.1 + (rec.form || 0)
        + (rec.goals || 0) + (rec.assists || 0) * 0.6 + (rec.on || 0) * 0.1 + (rec.saves || 0) * 0.1
        - (rec.yellow || 0) * 0.4 - (rec.red || 0) * 1.5;
      if (rec.pos === 'G') r += conceded === 0 ? 0.8 * f : -0.3 * conceded;
      if (rec.pos === 'D' && conceded === 0) r += 0.4 * f;
      return Math.round(clamp(r, 3, 10) * 10) / 10;
    };
    const ours = [...home.values()].map((rec) => {
      const p = s.players.find((q) => q.id === rec.id);
      if (!p) return null;
      const pos = rec.pos || p.pos;
      const rating = noteOf({ ...rec, pos, side: 'home', form: m.form[rec.id] }, ratingAt(p, pos) - m.oppStrength, ga);
      return { id: p.id, name: p.name, num: p.num, pos, rating, minutes: Math.max(0, Math.min(minute, rec.out ?? minute) - rec.in), on: rec.out == null };
    }).filter(Boolean);
    const theirs = [...away.values()].map((rec) => ({
      name: rec.p.name, num: rec.p.num, pos: rec.pos, p: rec.p, on: rec.out == null,
      minutes: Math.max(0, Math.min(minute, rec.out ?? minute) - rec.in),
      rating: noteOf({ ...rec, side: 'away', form: m.form[`o:${rec.p.name}`] }, ratingAt(rec.p, rec.pos) - m.myRating, gf),
    }));
    return { home: ours, away: theirs };
  }

  // Ce qui empêche un onze d'entrer en jeu à cette minute, ou null : même nombre de joueurs, pas de doublon, les
  // expulsés toujours sur la feuille (au poste qu'on choisit de laisser vide), au plus SUBS_MAX entrants dans le match,
  // aucun entrant blessé, suspendu ou déjà sorti.
  function lineupBlock(next) {
    const before = m.lineup;
    const named = Array.isArray(next) ? next.filter((id) => id !== null) : [];
    if (!Array.isArray(next) || next.length !== before.length || new Set(named).size !== named.length) return t('Onze incomplet.');
    if (before.some((id) => m.sent.home.has(id) && !next.includes(id))) return t('Un expulsé ne peut pas être remplacé.');
    const ins = named.filter((id) => !before.includes(id));
    if (ins.length > SUBS_MAX - m.subsUsed) return t('Plus de changement disponible.');
    for (const id of ins) {
      const p = s.players.find((q) => q.id === id);
      if (!p) return t('Joueur inconnu.');
      if (m.gone.has(id) || m.out.has(id)) return t('{name} est déjà sorti.', { name: p.name });
      if (!available(p)) return t('{name} n’est pas disponible.', { name: p.name });
    }
    return null;
  }

  // Changement et tactique à une minute du match, ou à la pause (halftime : les événements ouvrent la seconde
  // période). En cours de jeu, les minutes déjà simulées à partir de là sont reprises depuis l'instantané et
  // rejouées ensuite avec le nouveau onze. staff : changement décidé par le staff (un blessé remplacé). formation : un
  // nouveau dispositif (plan de mi-temps, league.js), le onze donné déjà replacé dans ses postes. Renvoie null si c'est
  // accepté, sinon la raison.
  function change(minute, { lineup = null, tactic = null, formation = null, halftime = false, staff = false } = {}) {
    const next = lineup || m.lineup;
    const block = lineupBlock(next);
    if (block) return block;
    const atBreak = halftime || !m.half;
    if (!atBreak) {
      if (minute > halfEnd()) return t('Trop tard pour cette mi-temps : attends la pause.');
      if (m.simTo >= minute) { const snap = m.snaps.get(minute); if (!snap) return t('Trop tard pour revenir à cette minute.'); restore(snap); }
      if (m.simTo < minute - 1) advanceTo(minute - 1);
    }
    const half = atBreak ? 2 : m.half;
    const target = atBreak ? m.halves[1] : events();
    const at = atBreak ? 45 : minute - 0.89;
    const before = m.lineup;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name || '';
    for (const [inId, outId] of pairSubs(before, next)) {
      m.played.add(inId);
      m.gone.add(outId);
      perf(outId).out = m.out.has(outId) ? perf(outId).out : minute;
      perf(inId).in = minute;
      m.subsUsed++;
      m.subsList.push({ in: inId, out: outId, minute });
      const text = staff && m.out.has(outId)
        ? t('Changement pour {home} : le staff fait entrer {nameOf} à la place {deName}, blessé.', { home: m.home, nameOf: nameOf(inId), deName: deName(nameOf(outId)) })
        : t('Changement pour {home} : {nameOf} remplace {nameOf2}.', { home: m.home, nameOf: nameOf(inId), nameOf2: nameOf(outId) });
      target.push({ ...make(at, 'sub', 'home', text), half, inId, outId });
    }
    const moved = next.filter((id, k) => before.includes(id) && before[k] !== id).length;
    m.lineup = [...next];
    if (FORMATIONS[formation] && formation !== m.formation) {
      m.formation = formation;
      target.push({ ...make(at, 'info', 'home', t('Changement de dispositif : {home} passe en {name}.', { home: m.home, name: formationOf(formation).name })), half, formation, lineup: [...next] });
    } else if (moved) target.push({ ...make(at, 'info', 'home', t('{home} réorganise son équipe.', { home: m.home })), half, lineup: [...next] });
    if (tactic && TACTICS[tactic] && tactic !== m.tactic) {
      m.tactic = tactic;
      target.push({ ...make(at, 'info', 'home', t('Changement tactique : {home} passe en {toLowerCase}.', { home: m.home, toLowerCase: TACTICS[tactic].name.toLowerCase() })), half });
    }
    return null;
  }

  // Plan de mi-temps du visiteur (championnats entre amis, league.js), à la pause : ses changements ([sortant, entrant],
  // des joueurs), le onze qui en sort dans l'ordre des postes, son dispositif, sa tactique et le niveau de ce onze. Les
  // notes du match suivent ses entrants par leur nom ; awayStart garde son onze de départ.
  function awayChange({ subs = [], eleven = null, formation = null, tactic = null, strength = null } = {}) {
    const target = m.halves[1];
    m.awayStart ||= [...awayRoster];
    m.awayStartFormation ||= m.oppPlan?.formation || m.awayFormation;
    for (const [out, inn] of subs) {
      m.form[`o:${inn.name}`] ??= Math.round((Math.random() - 0.5) * 120) / 100;
      target.push({ ...make(45, 'sub', 'away', t('Changement pour {away} : {name} remplace {name2}.', { away: m.away, name: inn.name, name2: out.name })), half: 2, inName: inn.name, outName: out.name });
    }
    if (eleven) awayRoster.splice(0, awayRoster.length, ...eleven);
    const plan = { tactic: m.oppPlan?.tactic || 'balanced', formation: m.oppPlan?.formation || m.awayFormation };
    if (FORMATIONS[formation] && formation !== plan.formation) {
      plan.formation = formation;
      m.awayFormation = formation;
      target.push({ ...make(45, 'info', 'away', t('Changement de dispositif : {away} passe en {name}.', { away: m.away, name: formationOf(formation).name })), half: 2, formation });
    }
    if (TACTICS[tactic] && tactic !== plan.tactic) {
      plan.tactic = tactic;
      target.push({ ...make(45, 'info', 'away', t('Changement tactique : {away} passe en {toLowerCase}.', { away: m.away, toLowerCase: TACTICS[tactic].name.toLowerCase() })), half: 2 });
    }
    m.oppPlan = plan;
    if (Number.isFinite(strength)) m.oppStrength = strength;
  }

  return {
    state: m,
    // état du direct à sauvegarder (reprise après une fermeture de l'app) ; from : minute affichée
    save: (from = 0) => packLive(m, from),
    get halfEnd() { return halfEnd(); },
    get halfDone() { return halfDone(); },
    get simTo() { return m.simTo; },
    eventsOf: (half) => m.halves[half - 1],
    beginHalf,
    advanceTo,
    // mi-temps entière d'un coup (match joué d'un bloc, essais) : le staff remplace les blessés
    playHalf(half) { beginHalf(half); advanceTo(Infinity, { staff: true }); return m.halves[half - 1]; },
    lineupBlock,
    // possession affichée à une minute de la mi-temps en cours
    possessionAt,
    // notes des deux équipes d'après les événements montrés, à une minute de jeu
    ratingsAt,
    // pronostic de fin de match depuis une minute de jeu (mi-temps : 45), avec le onze et la tactique envisagés ; les
    // entrants arrivent frais à cette minute
    oddsFrom(minute, { lineup = m.lineup, tactic = m.tactic, formation = m.formation } = {}) {
      const end = halfEnd();
      const sinceOf = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : minute);
      const short = shortOf(lineup);
      const chancesAt = memoChances((min) => minuteGoalChances(s, lineup, tactic, m.oppStrength, short, offIds(), formation, factorAt(min, sinceOf), m.atHome !== false, m.oppPlan, m.holes, min, awayOn()));
      const rest = Math.max(0, end - minute); // la durée des mi-temps est tirée au coup d'envoi : le pronostic en tient compte
      const durations = [rest + (m.half === 1 ? m.halfLength[1] : 0)];
      return outcomeOdds(chancesAt, m.score.home - m.score.away, durations, (k) => (k <= rest ? minute + k : 45 + k - rest), short);
    },
    secondHalfOdds(opts) { return this.oddsFrom(45, opts); },
    // Pronostic de fin de match tel que le direct l'a montré (shown : les événements déjà affichés). Le moteur a
    // quelques minutes d'avance sur l'horloge : ce qu'il a simulé sans l'avoir encore montré (un but, un carton, une
    // blessure) ne compte pas. minute : la minute de jeu affichée (la fin de la mi-temps à la pause) ; le onze et la
    // tactique (et le dispositif) envisagés peuvent remplacer les actuels (changement en préparation).
    oddsShown(minute, shown, { lineup = m.lineup, tactic = m.tactic, formation = m.formation } = {}) {
      let lead = 0;
      let sentA = 0;
      const sentH = new Set();
      const out = new Set();
      for (const e of shown) {
        if (e.type === 'goal') lead += e.side === 'home' ? 1 : -1;
        else if (e.type === 'red') { if (e.side === 'home') sentH.add(e.playerId); else sentA += 1; }
        else if (e.type === 'injury') out.add(e.playerId);
      }
      const short = { home: sentH.size + [...out].filter((id) => lineup.includes(id)).length, away: sentA };
      const off = new Set([...sentH, ...out]);
      const sinceOf = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : minute);
      const chancesAt = memoChances((min) => minuteGoalChances(s, lineup, tactic, m.oppStrength, short, off, formation, factorAt(min, sinceOf), m.atHome !== false, m.oppPlan, m.holes, min, awayOn()));
      const rest = Math.max(0, halfEnd() - minute);
      const durations = [rest + (m.half === 1 ? m.halfLength[1] : 0)];
      return outcomeOdds(chancesAt, lead, durations, (k) => (k <= rest ? minute + k : 45 + k - rest), short);
    },
    change,
    awayChange,
    // compatibilité : composition et tactique de la mi-temps
    applyLineup(next) { return this.change(45, { lineup: next, halftime: true }) === null; },
    setTactic(t) { this.change(45, { tactic: t, halftime: true }); },
    // résultat au format attendu par applyMatchResult
    result() {
      const all = [...m.halves[0], ...m.halves[1]];
      const notes = new Map(ratingsAt(all, 90).home.map((x) => [x.id, x]));
      const players = [...m.played].map((id) => {
        const p = s.players.find((q) => q.id === id);
        const n = notes.get(id);
        if (!p || !n) return null;
        const f = m.perf[id] || { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 };
        const minutes = Math.max(0, Math.min(90, f.out ?? 90) - (f.in ?? 0)); // temps de jeu (entrée, sortie, expulsion, blessure)
        const { in: _in, out: _out, ...stats } = f;
        return { id, name: p.name, num: p.num, pos: n.pos, rating: n.rating, minutes, shots: 0, onTarget: 0, ...stats };
      }).filter(Boolean);
      return {
        players,
        gf: m.score.home,
        ga: m.score.away,
        scorers: m.scorers,
        myRating: Math.round(lineupRating(s.players, m.lineup, m.formation) * 10) / 10,
        formation: m.startFormation || m.formation, // avec le onze de départ
        lineup: [...m.startLineup],
        subs: m.subsList.map((x) => ({ ...x })),
        injuries: m.injuries.map((x) => ({ ...x })),
        comp: m.comp,
        pens: m.pens,
        oppStrength: m.oppStrength,
        oppName: m.away,
        tactic: m.tactic,
        stats: m.stats,
        shots: m.shots,
        highlights: all.filter((e) => ['goal', 'red', 'yellow'].includes(e.type)).map(({ minute, type, side, player, q }) => ({ minute, type, side, player, ...(q === 'pen' ? { pen: true } : {}) })),
        preOdds: m.preOdds,
      };
    },
  };
}

// Match joué d'un bloc (repli, tests) : deux mi-temps sans intervention.
export function quickMatch(s, ctx) {
  const lm = createLiveMatch(s, ctx);
  lm.playHalf(1);
  lm.playHalf(2);
  return lm.result();
}
