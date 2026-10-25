import { clamp, pick, ri } from './utils';
import { capitalize, clubAfter, deName, isPluralClub, playerName } from './names';
import { shootout } from './cups';
import { SLOTS, TACTICS, expectedGoals, formationOf, lineupRating, slotsOf } from './tactics';
import { available, fitAt, fitFactor, ratingAt } from './players';
import { injuryCut } from './medical';

// Match en direct : simulation minute par minute, au fil de l'horloge du direct (advanceTo), avec une avance de
// quelques minutes pour que la scène 3D prépare chaque action. Un changement ou une nouvelle tactique peut se décider
// à toute minute (change) : les minutes déjà simulées mais pas encore vues sont reprises depuis un instantané, et la
// suite se rejoue avec le nouveau onze. La condition physique des joueurs baisse minute après minute et pèse sur le
// niveau du onze ; un joueur fatigué se blesse plus souvent. Produit un fil d'événements commentés (occasions, buts,
// cartons, blessures, changements, ambiance) et le résultat attendu par applyMatchResult (season.js).

const CONVERSION = 0.3; // part des occasions transformées
const YELLOW_PER_MIN = 0.021;
const RED_PER_MIN = 0.00035; // ~0,2 rouge par match avec les doubles jaunes
const INJURY_PER_MIN = 0.00017; // par joueur de champ et par minute, condition pleine : ≈ 0,23 blessure par match avec la fatigue
const INJURY_TIRED = 2.5; // à zéro de condition, le risque est multiplié par 3,5
export const SUBS_MAX = 5; // changements par match (cinq, comme en championnat professionnel)
const SNAPS_KEEP = 30; // minutes d'instantanés gardées derrière l'horloge (reprise après un changement)

// Gabarits du commentaire. {p} joueur, {home} / {away} clubs (article accordé), {n} accord du verbe pour un club au
// pluriel, {team} club nu entre parenthèses. Pas deux fois la même phrase d'ambiance dans un match ; chaque occasion
// a sa famille (pied, tête, lointaine, contre, coup de pied arrêté) et son issue ; un but se commente selon le score.
const T = {
  kickoff: [
    'Coup d’envoi ! {home} et {away} lancent la partie.',
    'C’est parti ! Le stade est debout pour le coup d’envoi.',
    'L’arbitre siffle : {home} engage, {away} attend{n} dans son camp.',
    'Coup d’envoi sous les encouragements du public : {home} donne le ton d’entrée.',
  ],
  chanceHome: [
    '{p} s’infiltre côté gauche et frappe…',
    'Belle combinaison de {home}, {p} arme sa frappe…',
    '{p} reprend de volée à l’entrée de la surface…',
    'Centre millimétré, {p} place sa tête…',
    '{p} élimine son vis-à-vis et tente sa chance…',
    'Une-deux dans la surface, {p} se retrouve face au gardien…',
    'Corner de {home} : {p} monte plus haut que tout le monde…',
    '{p} récupère haut et frappe en première intention…',
    'Décalage côté droit, {p} enroule du gauche…',
    'Contre éclair de {home}, {p} déboule dans l’axe…',
    '{p} talonne, puis reprend lui-même dans le rond adverse…',
    'Coup franc excentré, {p} tente sa chance directement…',
    '{p} pivote dans la surface et déclenche…',
    'Remise en retrait, {p} frappe du plat du pied…',
  ],
  chanceLong: [
    '{p} arme une frappe lointaine…',
    'De loin, {p} tente sa chance…',
    'À trente mètres, {p} voit le gardien avancé et frappe…',
    '{p} n’hésite pas : frappe puissante de l’extérieur de la surface…',
  ],
  chanceAway: [
    '{away} contre{n} vite, {p} se présente face au but…',
    'Frappe lointaine de {p}…',
    '{p} déborde et centre fort devant le but…',
    'Coup franc dangereux pour {away}, {p} s’élance…',
    'Perte de balle au milieu : {p} file au but…',
    'Corner pour {away}, {p} surgit au premier poteau…',
    '{p} s’infiltre entre deux défenseurs et frappe…',
    'Centre de la droite, {p} reprend de la tête…',
    '{p} fixe la défense et déclenche à l’entrée de la surface…',
    'Long ballon dans le dos de la défense, {p} est parti…',
    '{p} profite d’un cafouillage dans la surface…',
    'Contre rapide de {away} : {p} choisit la frappe…',
  ],
  saved: [
    'arrêt du gardien !', 'parade décisive !', 'le gardien capte sans trembler.', 'détourné en corner du bout des gants !',
    'claqué au-dessus par le gardien !', 'le portier se couche bien et bloque.', 'repoussé des poings !', 'le gardien gagne son face-à-face !',
  ],
  wide: [
    'à côté !', 'au-dessus de la barre.', 'ça frôle le poteau, mais c’est dehors.', 'dévissé, loin du cadre.',
    'dans les tribunes…', 'contré par un défenseur, en corner.', 'juste à côté du montant !', 'trop croisé, ça sort.',
  ],
  post: ['sur le poteau !', 'la barre transversale tremble encore !', 'le poteau sauve le gardien !', 'sur la barre, puis dégagé en catastrophe !'],
  // but du club selon le score après le but (nous − adversaire) et, en fin de match, selon la minute
  goalHome: {
    level: ['BUT ! {p} égalise d’une frappe imparable !', 'BUT ! {p} remet {home} à hauteur, le stade exulte !', 'ÉGALISATION ! {p} trompe le gardien !'],
    lead: ['BUT ! {p} trompe le gardien et donne l’avantage à {home} !', 'BUT ! Quelle frappe de {p} ! {home} passe devant !', 'BUT ! {p} conclut une action collective magnifique, {home} mène !'],
    more: ['BUT ! {p} creuse l’écart !', 'BUT ! {p} enfonce le clou, {home} se met à l’abri !', 'ENCORE ! {p} alourdit la marque !'],
    back: ['BUT ! {p} réduit l’écart, {home} y croit encore !', 'BUT ! {p} relance le match pour {home} !', 'BUT ! {p} redonne espoir à {home} !'],
    late: ['BUT DANS LES ARRÊTS DE JEU ! {p} fait chavirer le stade !', 'BUT ! {p} à la dernière minute, le public n’en revient pas !'],
  },
  // but adverse, selon l'écart après le but (adversaire − nous)
  goalAway: {
    level: ['Égalisation : {p} remet {away} à hauteur.', '{p} égalise pour {away}.', 'Le stade se tait : {p} égalise pour {away}.'],
    lead: ['But de {away} : {p} donne l’avantage aux siens.', 'Coup dur : {p} marque pour {away}.', '{p} ouvre le score pour {away}, silence dans les tribunes.'],
    more: ['{p} creuse l’écart pour {away}.', 'Coup dur : {p} enfonce le clou pour {away}.', '{p} encore pour {away}, la soirée se complique.'],
    back: ['{p} réduit l’écart pour {away}.', 'But de {away} : {p} relance le suspense.', '{p} marque pour {away} : il va falloir tenir.'],
    late: ['But de {away} dans les arrêts de jeu : {p} glace le stade.', 'Dernière minute : {p} marque pour {away}, cruel.'],
  },
  yellow: [
    'Carton jaune pour {p} ({team}) après une faute tactique.', 'Avertissement : {p} ({team}) est sanctionné.',
    '{p} ({team}) arrive en retard : carton jaune.', 'Jaune pour {p} ({team}), qui a protesté un peu trop fort.',
    'Semelle de {p} ({team}) : l’arbitre sort le jaune.', '{p} ({team}) stoppe un contre de la main : avertissement.',
  ],
  red: ['CARTON ROUGE ! {p} ({team}) est expulsé !', 'ROUGE DIRECT ! {p} ({team}) est renvoyé aux vestiaires !', 'Expulsion ! {p} ({team}) a fauché le dernier défenseur !'],
  secondYellow: ['Second carton jaune pour {p} ({team}) : expulsion !', '{p} ({team}) prend un second jaune : il sort !'],
  injury: [
    'Blessure : {p} reste au sol et ne peut pas continuer.', '{p} se tient la cuisse : il doit sortir.',
    'Coup dur pour {home} : {p} est blessé et quitte le terrain.', '{p} grimace, le staff médical entre : il ne peut pas reprendre.',
  ],
  ambience: [
    'Possession patiente de {home} au milieu de terrain.',
    '{away} resserre{n} les lignes et laisse{n} venir.',
    'Le public pousse derrière {home} !',
    'Duel âpre au milieu, l’arbitre laisse jouer.',
    'Temps faible pour {home}, {away} confisque{n} le ballon.',
    'Corner pour {home}… dégagé par la défense.',
    'Récupération haute de {home}, mais la passe est trop longue.',
    'Touche pour {away} dans sa moitié : le rythme retombe.',
    'Hors-jeu signalé contre {away}, à raison.',
    '{home} fait tourner, la défense adverse recule.',
    'Le capitaine de {home} replace ses coéquipiers.',
    'Le banc de {away} s’agite : consignes criées depuis la ligne.',
    'Faute sans gravité au milieu, coup franc indirect pour {home}.',
    'Les supporters entonnent le chant du club.',
    'Chaleur dans les duels : {away} ne lâche{n} rien.',
    'Le gardien de {home} relance court, patiemment.',
  ],
};

// noms de clubs avec leur article (« pour l’US du Tilleul », « du FC des Bruyères »), élision devant un prénom
// (« frappe d’Ilyes »), majuscule en tête de phrase. Le club entre parenthèses ({team}) reste nu.
const CLUB_KEYS = new Set(['home', 'away']);
const fill = (tpl, v) => capitalize(tpl.replace(/((?<!\p{L})(?:de|à) )?\{(\w+)\}/gu, (_, prep = '', k) => (
  CLUB_KEYS.has(k) ? clubAfter(prep, v[k] ?? '') : prep === 'de ' ? deName(v[k] ?? '') : prep + (v[k] ?? '')
)));

function pickWeighted(list, weight) {
  const w = list.map(weight);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

// --- Pronostic exact -----------------------------------------------------------------------------------------
// Calculé sur les règles mêmes du moteur (ci-dessous) : chaque minute, chaque équipe a une occasion avec la
// probabilité λ/27 (λ : buts attendus sur 90 minutes, corrigés des expulsions, des blessés non remplacés et de la
// condition physique du onze à cette minute) et la transforme avec son taux de conversion (signes distinctifs
// compris) ; au plus un but par équipe et par minute. On additionne toutes les suites de minutes possibles, temps
// additionnel compris : « 70 % » veut dire 7 victoires sur 10. Seuls les expulsions et les blessures encore à venir
// sont ignorées. Une issue n'a une probabilité nulle que si elle est réellement impossible.
const HALF1 = [46, 47, 48]; // 45 minutes + 1 à 3 de temps additionnel
const HALF2 = [47, 48, 49, 50]; // 45 minutes + 2 à 5
// « Flèche » : plus d'occasions, surtout en bloc bas (le jeu de contre). « Infatigable » : le joueur se fatigue bien
// moins vite (players.js, matchCost) et garde son niveau jusqu'au bout.
const arrowBoost = (tactic) => (tactic === 'low' ? 1.06 : 1.03);

const shooterWeight = (p, bigGame) => {
  const base = p.pos === 'A' ? p.a.fin * 3 : p.pos === 'M' ? ((p.a.fin + p.a.pas) / 2) * 1.5 : p.a.fin * 0.5;
  return (base + 1) * (bigGame && p.traits?.includes('grandsSoirs') ? 1.5 : 1) * (p.traits?.includes('frappe') ? 1.15 : 1);
};

// facteur de condition physique de chaque joueur à une minute donnée (since : minute d'entrée en jeu de chacun)
const factorAt = (minute, since) => (p) => fitFactor(fitAt(p, minute, since(p.id)));

// probabilités de but par minute pour chaque équipe, dans l'état donné (onze, tactique, joueurs en moins : expulsés
// et blessés non remplacés, condition physique)
function minuteGoalChances(s, lineup, tactic, oppStrength, short = { home: 0, away: 0 }, offIds = new Set(), formation = s.formation, factorOf = null) {
  const rating = lineupRating(s.players, lineup, formation, factorOf);
  const xg = expectedGoals(rating, oppStrength, tactic, formation);
  const bigGame = oppStrength > rating;
  const on = lineup.map((id) => s.players.find((p) => p.id === id)).filter((p) => p && !offIds.has(p.id));
  const has = (p, t) => p.traits?.includes(t);
  const rocs = on.some((p) => p.pos === 'D' && has(p, 'roc'));
  const keeper = on.find((p) => p.pos === 'G');
  const field = on.filter((p) => p.pos !== 'G');
  const arrow = field.some((p) => has(p, 'fleche')) ? arrowBoost(tactic) : 1;
  const shooters = field.length ? field : on;
  let wSum = 0, convSum = 0;
  for (const p of shooters) {
    const w = shooterWeight(p, bigGame);
    wSum += w;
    convSum += w * CONVERSION * (has(p, 'finisseur') ? 1.15 : 1) * (bigGame && has(p, 'grandsSoirs') ? 1.1 : 1);
  }
  const convH = wSum ? convSum / wSum : CONVERSION;
  const convA = CONVERSION * (keeper && has(keeper, 'chat') ? 0.92 : 1);
  const lamH = xg.for * 0.78 ** short.home * 1.22 ** short.away * arrow;
  const lamA = xg.against * 1.22 ** short.home * 0.78 ** short.away * (rocs ? 0.97 : 1);
  return { pH: Math.min(1, lamH / (90 * CONVERSION)) * convH, pA: Math.min(1, lamA / (90 * CONVERSION)) * convA, lamH, lamA, bigGame };
}

// répartition victoire / nul / défaite après n minutes, n tiré parmi `durations` (toutes également probables) ;
// chancesAt(minute) : probabilités de but de la minute de jeu ; minuteOf(k) : minute de jeu de la k-ième minute jouée
function outcomeOdds(chancesAt, lead, durations, minuteOf = (k) => k) {
  const max = Math.max(...durations);
  const off = max + 1;
  let dist = new Float64Array(2 * off + 1);
  dist[off] = 1; // écart de buts supplémentaire, en partant de 0
  let win = 0, draw = 0, loss = 0;
  for (let n = 1; n <= max; n++) {
    const { pH, pA } = chancesAt(minuteOf(n));
    const up = pH * (1 - pA);
    const down = pA * (1 - pH);
    const stay = 1 - up - down;
    const next = new Float64Array(dist.length);
    for (let d = 1; d < dist.length - 1; d++) {
      const v = dist[d];
      if (!v) continue;
      next[d] += v * stay;
      next[d + 1] += v * up;
      next[d - 1] += v * down;
    }
    dist = next;
    const k = durations.filter((x) => x === n).length;
    if (!k) continue;
    for (let d = 0; d < dist.length; d++) {
      if (!dist[d]) continue;
      const final = lead + d - off;
      const share = (dist[d] * k) / durations.length;
      if (final > 0) win += share; else if (final === 0) draw += share; else loss += share;
    }
  }
  return { win, draw, loss };
}

// chances de but minute par minute, mémorisées (la condition physique change chaque minute)
const memoChances = (fn) => { const cache = new Map(); return (minute) => { if (!cache.has(minute)) cache.set(minute, fn(minute)); return cache.get(minute); }; };

// avant le coup d'envoi : 90 minutes plus le temps additionnel des deux mi-temps (chaque durée de la première
// mi-temps à part : la seconde commence à la 46e minute de jeu, quel que soit le temps additionnel), le onze de
// départ jusqu'au bout, sa condition qui baisse au fil du match
export function prematchOdds(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation, oppStrength }) {
  const chancesAt = memoChances((minute) => minuteGoalChances(s, lineup, tactic, oppStrength, undefined, undefined, formation, factorAt(minute, () => 0)));
  const parts = HALF1.map((h1) => outcomeOdds(chancesAt, 0, HALF2.map((h2) => h1 + h2), (k) => (k <= h1 ? k : 45 + k - h1)));
  const mean = (key) => parts.reduce((a, o) => a + o[key], 0) / parts.length;
  return { win: mean('win'), draw: mean('draw'), loss: mean('loss') };
}

// Buts attendus du match selon le même moteur que le pronostic (traits des tireurs et du gardien, condition physique,
// temps additionnel moyen compris) : l'avant-match ne peut plus afficher des buts attendus qui contredisent ses
// pourcentages.
const MEAN_H1 = Math.round(HALF1.reduce((a, b) => a + b, 0) / HALF1.length);
const MEAN_H2 = Math.round(HALF2.reduce((a, b) => a + b, 0) / HALF2.length);
export function prematchXg(s, { lineup = s.lineup, tactic = s.tactic, formation = s.formation, oppStrength }) {
  const chancesAt = memoChances((minute) => minuteGoalChances(s, lineup, tactic, oppStrength, undefined, undefined, formation, factorAt(minute, () => 0)));
  let xf = 0, xa = 0;
  for (let k = 1; k <= MEAN_H1; k++) { const c = chancesAt(k); xf += c.pH; xa += c.pA; }
  for (let k = 1; k <= MEAN_H2; k++) { const c = chancesAt(45 + k); xf += c.pH; xa += c.pA; }
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

export function createLiveMatch(s, ctx) {
  const taken = new Set(s.lineup.map((id) => s.players.find((p) => p.id === id)?.name));
  const awayRoster = Array.from({ length: 11 }, (_, k) => { // noms uniques : la scène 3D retrouve le bon joueur
    const name = playerName(taken);
    taken.add(name);
    return { name, pos: SLOTS[k] };
  });
  const m = {
    home: s.clubName,
    away: ctx.opp.name,
    oppStrength: ctx.opp.strength,
    lineup: [...s.lineup],
    startLineup: [...s.lineup], // onze de départ (historique du match : composition sur le terrain)
    subsList: [], // changements faits : entrant, sortant, minute
    formation: formationOf(s.formation).id,
    comp: ctx.comp || 'league',
    knockout: !!ctx.knockout, // coupe : pas de match nul, tirs au but
    pens: null,
    awayRoster, // onze adverse (4-3-3), pour la scène 3D
    tactic: s.tactic,
    score: { home: 0, away: 0 },
    // statistiques détaillées (fiche Stats Pass) : [club, adversaire] ; xg = buts attendus, saves = arrêts du gardien
    stats: {
      shots: [0, 0], onTarget: [0, 0], possession: 50, yellow: [0, 0], red: [0, 0],
      xg: [0, 0], saves: [0, 0], post: [0, 0], wide: [0, 0], big: [0, 0], possHalf: [null, null], longShots: 0,
    },
    shots: [], // chaque tir : minute, mi-temps, camp, issue (g but, s arrêté, w à côté, p poteau), tireur, xG
    halves: [[], []], // événements de chaque mi-temps, dans l'ordre (la scène 3D lit le tableau de la mi-temps en cours)
    scorers: [],
    half: 0,
    begun: [false, false], // mi-temps commencées
    halfLength: [45 + ri(1, 3), 45 + ri(2, 5)],
    simTo: 0, // dernière minute simulée
    snaps: new Map(), // instantanés avant chaque minute simulée (reprise après un changement)
    rewound: 0, // compteur : des minutes simulées ont été reprises (la scène 3D oublie les actions disparues)
    sent: { home: new Set(), away: new Set() },
    booked: { home: new Set(), away: new Set() },
    out: new Set(), // nos blessés sortis pendant le match (identifiants)
    gone: new Set(), // nos joueurs sortis (remplacés ou blessés) : ils ne reviennent pas
    injuries: [], // { id, name, minute }
    subsUsed: 0,
    played: new Set(s.lineup), // joueurs entrés en jeu (notes de match)
    perf: {}, // par joueur : buts, passes décisives, cartons, entrée et sortie
    lastAmbience: 0,
    usedAmbience: new Set(),
  };
  const perf = (id) => (m.perf[id] ||= { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 });
  const has = (p, t) => p.traits?.includes(t);
  const since = (id) => m.perf[id]?.in ?? 0; // minute d'entrée en jeu (titulaires : 0)
  const offIds = () => new Set([...m.sent.home, ...m.out]);
  const playersOn = () => m.lineup.map((id) => s.players.find((p) => p.id === id)).filter((p) => p && !m.sent.home.has(p.id) && !m.out.has(p.id));
  const awayOn = () => awayRoster.filter((p) => !m.sent.away.has(p.name));
  const shortOf = (lineup = m.lineup) => ({ home: m.sent.home.size + [...m.out].filter((id) => lineup.includes(id)).length, away: m.sent.away.size });
  const vars = (extra = {}) => ({ home: m.home, away: m.away, n: isPluralClub(m.away) ? 'nt' : '', ...extra });
  const ambience = () => { // pas deux fois la même phrase d'ambiance dans un match
    let pool = T.ambience.filter((t) => !m.usedAmbience.has(t));
    if (!pool.length) { m.usedAmbience.clear(); pool = T.ambience; }
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
  const chancesNow = (minute, lineup = m.lineup, tactic = m.tactic) => minuteGoalChances(s, lineup, tactic, m.oppStrength, shortOf(lineup), offIds(), m.formation, factorAt(minute, since));

  // buteur : la finition compte (beaucoup pour un attaquant, un peu pour un milieu, peu pour un défenseur)
  function homeShooter(bigGame) {
    const out = playersOn().filter((p) => p.pos !== 'G');
    return pickWeighted(out.length ? out : playersOn(), (p) => shooterWeight(p, bigGame)); // même pondération que le pronostic
  }
  // passeur décisif : la passe compte, le signe « Passeur » triple les chances
  function homeAssist(scorer) {
    const pool = playersOn().filter((p) => p !== scorer && p.pos !== 'G');
    if (!pool.length || Math.random() > 0.8) return null; // certains buts sont des exploits personnels
    return pickWeighted(pool, (p) => (p.a.pas + (p.pos === 'M' ? 3 : 0)) * (has(p, 'passeur') ? 3 : 1));
  }
  const awayShooter = () => pickWeighted(awayOn().filter((p) => p.pos !== 'G'), (p) => (p.pos === 'A' ? 3 : p.pos === 'M' ? 1.6 : 0.5));

  // --- Instantanés : tout ce qu'une minute simulée peut changer ---------------------------------------------------
  function snapshot() {
    return {
      score: { ...m.score }, pens: m.pens,
      stats: { ...m.stats, shots: [...m.stats.shots], onTarget: [...m.stats.onTarget], yellow: [...m.stats.yellow], red: [...m.stats.red], xg: [...m.stats.xg], saves: [...m.stats.saves], post: [...m.stats.post], wide: [...m.stats.wide], big: [...m.stats.big], possHalf: [...m.stats.possHalf] },
      shots: [...m.shots], scorers: [...m.scorers], len: events().length,
      sentH: new Set(m.sent.home), sentA: new Set(m.sent.away), bookedH: new Set(m.booked.home), bookedA: new Set(m.booked.away),
      out: new Set(m.out), gone: new Set(m.gone), injuries: [...m.injuries], played: new Set(m.played),
      perf: JSON.parse(JSON.stringify(m.perf)), lineup: [...m.lineup], tactic: m.tactic, subsUsed: m.subsUsed, subsList: [...m.subsList],
      lastAmbience: m.lastAmbience, usedAmbience: new Set(m.usedAmbience), simTo: m.simTo,
    };
  }
  function restore(x) {
    Object.assign(m, {
      score: { ...x.score }, pens: x.pens, stats: { ...x.stats, shots: [...x.stats.shots], onTarget: [...x.stats.onTarget], yellow: [...x.stats.yellow], red: [...x.stats.red], xg: [...x.stats.xg], saves: [...x.stats.saves], post: [...x.stats.post], wide: [...x.stats.wide], big: [...x.stats.big], possHalf: [...x.stats.possHalf] },
      shots: [...x.shots], scorers: [...x.scorers], out: new Set(x.out), gone: new Set(x.gone), injuries: [...x.injuries], played: new Set(x.played),
      perf: JSON.parse(JSON.stringify(x.perf)), lineup: [...x.lineup], tactic: x.tactic, subsUsed: x.subsUsed, subsList: [...x.subsList],
      lastAmbience: x.lastAmbience, usedAmbience: new Set(x.usedAmbience), simTo: x.simTo,
    });
    m.sent = { home: new Set(x.sentH), away: new Set(x.sentA) };
    m.booked = { home: new Set(x.bookedH), away: new Set(x.bookedA) };
    events().length = x.len; // les événements des minutes reprises disparaissent, le tableau reste le même objet
    for (const k of [...m.snaps.keys()]) if (k > x.simTo + 1) m.snaps.delete(k);
    m.rewound += 1;
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
    const tilt = (m.tactic === 'offensive' ? 6 : m.tactic === 'low' ? -9 : 0) + (formationOf(m.formation).lines[1] - 3) * 2.5; // un milieu fourni tient le ballon
    m.stats.possHalf[half - 1] = Math.round(clamp(50 + diff * 3 + tilt + (Math.random() - 0.5) * 6, 28, 74));
    const halves = m.stats.possHalf.filter((x) => x !== null);
    m.stats.possession = Math.round(halves.reduce((a, b) => a + b, 0) / halves.length);
    if (half === 1) push(0, 'kickoff', null, fill(pick(T.kickoff), vars()));
    else push(45, 'kickoff', null, 'Reprise de la seconde période !');
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
    if (minute === baseEnd + 1 && extra > 0) events().push(make(minute - 0.95, 'info', null, `${extra} minute${extra > 1 ? 's' : ''} de temps additionnel.`));
    const c = chancesNow(minute);
    const at = minute - Math.random() * 0.9;
    for (const [side, lam] of [['home', c.lamH], ['away', c.lamA]]) {
      if (Math.random() >= lam / (90 * CONVERSION)) continue;
      const idx = side === 'home' ? 0 : 1;
      const p = side === 'home' ? homeShooter(c.bigGame) : awayShooter();
      m.stats.shots[idx]++;
      const long = side === 'home' && has(p, 'frappe') && Math.random() < 0.4;
      if (long) m.stats.longShots++;
      if (side === 'home') perf(p.id).shots++;
      const pool = side === 'home' ? (long ? T.chanceLong : T.chanceHome) : T.chanceAway;
      const lead = fill(pick(pool), vars({ p: p.name }));
      // finition : « Finisseur » et « grands soirs » côté club, « Chat » dans nos cages contre l'adversaire
      const keeper = playersOn().find((q) => q.pos === 'G');
      let conv = side === 'home'
        ? CONVERSION * (has(p, 'finisseur') ? 1.15 : 1) * (c.bigGame && has(p, 'grandsSoirs') ? 1.1 : 1)
        : CONVERSION * (keeper && has(keeper, 'chat') ? 0.92 : 1);
      // qualité de l'occasion (moyenne 1 : le nombre de buts attendu ne change pas, le pronostic reste exact)
      const qr = Math.random();
      const q = qr < 0.18 ? 2.2 : qr < 0.7 ? 0.9 : 0.45;
      conv *= q;
      if (q > 2) m.stats.big[idx]++;
      m.stats.xg[idx] += conv;
      const shot = { m: label(at, m.half), at: Math.round(at * 10) / 10, h: m.half, s: idx, p: p.name, x: Math.round(conv * 100) / 100, q: q > 2 ? 'big' : q < 0.5 ? 'hard' : 'std' };
      m.shots.push(shot);
      if (Math.random() < conv) {
        shot.o = 'g';
        m.stats.onTarget[idx]++;
        if (side === 'home') perf(p.id).onTarget++;
        m.score[side]++;
        const gap = m.score.away - m.score.home; // écart après le but, vu de l'adversaire
        const late = at >= 89 || (m.half === 1 && at >= 44.5); // arrêts de jeu : un commentaire sur deux le souligne
        const poolOf = (G, g) => (late && G.late && Math.random() < 0.5 ? G.late : g === 0 ? G.level : g === 1 ? G.lead : g > 1 ? G.more : G.back);
        let text = fill(pick(side === 'home' ? poolOf(T.goalHome, -gap) : poolOf(T.goalAway, gap)), vars({ p: p.name }));
        let assist = null;
        if (side === 'home') {
          assist = homeAssist(p);
          perf(p.id).goals++;
          if (assist) { perf(assist.id).assists++; text += ` Passe décisive ${deName(assist.name)}.`; }
          m.scorers.push({ name: p.name, id: p.id, minute: Math.ceil(at), assist: assist?.name || null });
        }
        add(at, 'goal', side, text, { player: p.name, playerId: side === 'home' ? p.id : null, score: { ...m.score }, lead, assist: assist?.name || null, xg: conv });
      } else {
        const r = Math.random();
        const outcome = r < 0.45 ? 'saved' : r < 0.85 ? 'wide' : 'post';
        shot.o = outcome[0];
        if (outcome === 'saved') {
          m.stats.onTarget[idx]++;
          m.stats.saves[1 - idx]++; // arrêt du gardien d'en face
          if (side === 'home') perf(p.id).onTarget++;
        } else m.stats[outcome === 'wide' ? 'wide' : 'post'][idx]++;
        add(at, 'chance', side, `${lead} ${pick(T[outcome])}`, { player: p.name, outcome, xg: conv });
      }
    }
    // cartons
    for (const side of ['home', 'away']) {
      const r = Math.random();
      const cat = minute - Math.random() * 0.9;
      if (r < RED_PER_MIN) {
        const pool = side === 'home' ? playersOn().filter((p) => p.pos !== 'G') : awayOn().filter((p) => p.pos !== 'G');
        if (pool.length > 7) {
          const p = side === 'home' ? pickWeighted(pool, (q) => (21 - q.a.sfr) * (has(q, 'sangChaud') ? 2.5 : 1)) : pick(pool);
          m.sent[side].add(side === 'home' ? p.id : p.name);
          if (side === 'home') { perf(p.id).red++; perf(p.id).out = Math.ceil(cat); }
          m.stats.red[side === 'home' ? 0 : 1]++;
          add(cat, 'red', side, fill(pick(T.red), vars({ p: p.name, team: side === 'home' ? m.home : m.away })), { player: p.name, playerId: side === 'home' ? p.id : null });
        }
      } else if (r < RED_PER_MIN + YELLOW_PER_MIN) {
        const pool = side === 'home' ? playersOn().filter((p) => p.pos !== 'G') : awayOn().filter((p) => p.pos !== 'G');
        if (!pool.length) continue;
        const keyOf = (q) => (side === 'home' ? q.id : q.name);
        // un joueur déjà averti se montre prudent : quatre fois moins de risque d'un second carton
        const p = pickWeighted(pool, (q) => (m.booked[side].has(keyOf(q)) ? 0.25 : 1)
          * (side === 'home' ? ((21 - q.a.sfr) / 10) * (has(q, 'sangChaud') ? 2.5 : 1) : 1));
        const key = keyOf(p);
        const team = side === 'home' ? m.home : m.away;
        if (m.booked[side].has(key) && pool.length > 7) {
          m.sent[side].add(key);
          if (side === 'home') { perf(p.id).red++; perf(p.id).out = Math.ceil(cat); }
          m.stats.red[side === 'home' ? 0 : 1]++;
          add(cat, 'red', side, fill(pick(T.secondYellow), vars({ p: p.name, team })), { player: p.name, playerId: side === 'home' ? p.id : null });
        } else {
          m.booked[side].add(key);
          if (side === 'home') perf(p.id).yellow++;
          m.stats.yellow[side === 'home' ? 0 : 1]++;
          add(cat, 'yellow', side, fill(pick(T.yellow), vars({ p: p.name, team })), { player: p.name });
        }
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
      const on = playersOn();
      const fin = on.filter((p) => p.pos !== 'G').map((p) => p.a.fin).sort((x, y) => y - x).slice(0, 5);
      const homeSkill = clamp(0.62 + (fin.reduce((a, b) => a + b, 0) / Math.max(1, fin.length)) / 100, 0.66, 0.84);
      const keeper = on.find((p) => p.pos === 'G');
      const awaySkill = 0.77 - (keeper ? (keeper.g?.ref || 10) / 400 : 0) - (keeper && has(keeper, 'chat') ? 0.03 : 0);
      const so = shootout(homeSkill, awaySkill);
      m.pens = [so.home, so.away];
      push(end - 0.02, 'info', null, `Égalité au bout du temps réglementaire : place aux tirs au but !`);
      push(end - 0.01, 'pens', so.home > so.away ? 'home' : 'away',
        so.home > so.away ? `Tirs au but : ${m.home} l’emporte ${so.home}–${so.away} et se qualifie !` : `Tirs au but : ${m.away} s’impose ${so.away}–${so.home}. ${m.home} est éliminé.`);
    }
    push(end, half === 1 ? 'halftime' : 'fulltime', null, half === 1
      ? `Mi-temps : ${m.home} ${m.score.home} – ${m.score.away} ${m.away}.`
      : `Coup de sifflet final ! ${m.home} ${m.score.home} – ${m.score.away} ${m.away}${m.pens ? ` (${m.pens[0]}–${m.pens[1]} aux tirs au but)` : ''}.`);
    m.simTo = end + 1; // mi-temps close
  }
  const halfDone = () => m.simTo > halfEnd();

  // Simule la mi-temps en cours jusqu'à la minute demandée (bornée par la fin de la mi-temps).
  function advanceTo(minute) {
    if (!m.half || halfDone()) return;
    const end = halfEnd();
    while (m.simTo < Math.min(minute, end)) simMinute(m.simTo + 1);
    if (m.simTo >= end) endHalf();
  }

  // Notes de match sur 10, comme dans la presse : base 6, résultat, buts, passes, cartons, niveau du
  // joueur face à l'adversaire, clean sheet pour le gardien et la défense, et une part d'aléa.
  function matchRatings() {
    const gf = m.score.home;
    const ga = m.score.away;
    const res = gf > ga ? 0.5 : gf < ga ? -0.5 : 0;
    return [...m.played].map((id) => {
      const p = s.players.find((q) => q.id === id);
      if (!p) return null;
      const k = m.lineup.indexOf(id);
      const pos = k >= 0 ? slotsOf(m.formation)[k] : p.pos;
      const f = m.perf[id] || { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 };
      const minutes = Math.max(0, Math.min(90, f.out ?? 90) - (f.in ?? 0)); // temps de jeu (entrée, sortie, expulsion, blessure)
      let r = 6 + res + f.goals * 1 + f.assists * 0.6 - f.yellow * 0.4 - f.red * 1.5;
      r += (ratingAt(p, pos) - m.oppStrength) * 0.1;
      if (pos === 'G') r += ga === 0 ? 0.8 : -0.3 * ga;
      if (pos === 'D' && ga === 0) r += 0.4;
      r += (Math.random() - 0.5) * 1.2;
      const { in: _in, out: _out, ...stats } = f;
      return { id, name: p.name, num: p.num, pos, rating: Math.round(clamp(r, 3, 10) * 2) / 2, minutes, shots: 0, onTarget: 0, ...stats };
    }).filter(Boolean);
  }

  // Ce qui empêche un onze d'entrer en jeu à cette minute, ou null : même nombre de joueurs, pas de doublon, les
  // expulsés à leur place, au plus SUBS_MAX entrants dans le match, aucun entrant blessé, suspendu ou déjà sorti.
  function lineupBlock(next) {
    const before = m.lineup;
    if (!Array.isArray(next) || next.length !== before.length || new Set(next).size !== next.length) return 'Onze incomplet.';
    if (before.some((id, k) => m.sent.home.has(id) && next[k] !== id)) return 'Un expulsé ne peut pas être remplacé.';
    const ins = next.filter((id) => !before.includes(id));
    if (ins.length > SUBS_MAX - m.subsUsed) return 'Plus de changement disponible.';
    for (const id of ins) {
      const p = s.players.find((q) => q.id === id);
      if (!p) return 'Joueur inconnu.';
      if (m.gone.has(id) || m.out.has(id)) return `${p.name} est déjà sorti.`;
      if (!available(p)) return `${p.name} n’est pas disponible.`;
    }
    return null;
  }

  return {
    state: m,
    get halfEnd() { return halfEnd(); },
    get halfDone() { return halfDone(); },
    get simTo() { return m.simTo; },
    eventsOf: (half) => m.halves[half - 1],
    beginHalf,
    advanceTo,
    // mi-temps entière d'un coup (match joué d'un bloc, essais)
    playHalf(half) { beginHalf(half); advanceTo(Infinity); return m.halves[half - 1]; },
    lineupBlock,
    // pronostic de fin de match depuis une minute de jeu (mi-temps : 45), avec le onze et la tactique envisagés ; les
    // entrants arrivent frais à cette minute
    oddsFrom(minute, { lineup = m.lineup, tactic = m.tactic } = {}) {
      const end = halfEnd();
      const sinceOf = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : minute);
      const chancesAt = memoChances((min) => minuteGoalChances(s, lineup, tactic, m.oppStrength, shortOf(lineup), offIds(), m.formation, factorAt(min, sinceOf)));
      const rest = Math.max(0, end - minute); // la durée des mi-temps est tirée au coup d'envoi : le pronostic en tient compte
      const durations = [rest + (m.half === 1 ? m.halfLength[1] : 0)];
      return outcomeOdds(chancesAt, m.score.home - m.score.away, durations, (k) => (k <= rest ? minute + k : 45 + k - rest));
    },
    secondHalfOdds(opts) { return this.oddsFrom(45, opts); },
    // Pronostic de fin de match tel que le direct l'a montré (shown : les événements déjà affichés). Le moteur a
    // quelques minutes d'avance sur l'horloge : ce qu'il a simulé sans l'avoir encore montré (un but, un carton, une
    // blessure) ne compte pas. minute : la minute de jeu affichée (la fin de la mi-temps à la pause) ; le onze et la
    // tactique envisagés peuvent remplacer les actuels (changement en préparation).
    oddsShown(minute, shown, { lineup = m.lineup, tactic = m.tactic } = {}) {
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
      const chancesAt = memoChances((min) => minuteGoalChances(s, lineup, tactic, m.oppStrength, short, off, m.formation, factorAt(min, sinceOf)));
      const rest = Math.max(0, halfEnd() - minute);
      const durations = [rest + (m.half === 1 ? m.halfLength[1] : 0)];
      return outcomeOdds(chancesAt, lead, durations, (k) => (k <= rest ? minute + k : 45 + k - rest));
    },
    // Changement et tactique à une minute du match, ou à la pause (halftime : les événements ouvrent la seconde
    // période). En cours de jeu, les minutes déjà simulées à partir de là sont reprises depuis l'instantané et
    // rejouées ensuite avec le nouveau onze. Renvoie null si c'est accepté, sinon la raison.
    change(minute, { lineup = null, tactic = null, halftime = false } = {}) {
      const next = lineup || m.lineup;
      const block = lineupBlock(next);
      if (block) return block;
      const atBreak = halftime || !m.half;
      if (!atBreak) {
        if (minute > halfEnd()) return 'Trop tard pour cette mi-temps : attends la pause.';
        if (m.simTo >= minute) { const snap = m.snaps.get(minute); if (!snap) return 'Trop tard pour revenir à cette minute.'; restore(snap); }
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
        target.push({ ...make(at, 'sub', 'home', `Changement pour ${m.home} : ${nameOf(inId)} remplace ${nameOf(outId)}.`), half });
      }
      const moved = next.filter((id, k) => before.includes(id) && before[k] !== id).length;
      m.lineup = [...next];
      if (moved) target.push({ ...make(at, 'info', 'home', `${m.home} réorganise son équipe.`), half });
      if (tactic && TACTICS[tactic] && tactic !== m.tactic) {
        m.tactic = tactic;
        target.push({ ...make(at, 'info', 'home', `Changement tactique : ${m.home} passe en ${TACTICS[tactic].name.toLowerCase()}.`), half });
      }
      return null;
    },
    // compatibilité : composition et tactique de la mi-temps
    applyLineup(next) { return this.change(45, { lineup: next, halftime: true }) === null; },
    setTactic(t) { this.change(45, { tactic: t, halftime: true }); },
    // résultat au format attendu par applyMatchResult
    result() {
      const all = [...m.halves[0], ...m.halves[1]];
      return {
        players: matchRatings(),
        gf: m.score.home,
        ga: m.score.away,
        scorers: m.scorers,
        myRating: Math.round(lineupRating(s.players, m.lineup, m.formation) * 10) / 10,
        formation: m.formation,
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
        highlights: all.filter((e) => ['goal', 'red', 'yellow'].includes(e.type)).map(({ minute, type, side, player }) => ({ minute, type, side, player })),
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
