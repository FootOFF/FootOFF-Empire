import { clamp, pick, ri } from './utils';
import { FIRST, LAST } from './names';
import { SLOTS, TACTICS, expectedGoals, lineupRating } from './tactics';

// Match en direct : simulation minute par minute, mi-temps par mi-temps (un changement ou une nouvelle
// tactique à la pause pèse vraiment sur la seconde période). Produit un fil d'événements commentés
// (occasions, buts, cartons, ambiance) et le résultat attendu par applyMatchResult (season.js).

const CONVERSION = 0.3; // part des occasions transformées
const YELLOW_PER_MIN = 0.021;
const RED_PER_MIN = 0.00035; // ~0,2 rouge par match avec les doubles jaunes

const T = {
  kickoff: [
    'Coup d’envoi ! {home} et {away} lancent la partie.',
    'C’est parti ! Le stade est debout pour le coup d’envoi.',
  ],
  chanceHome: [
    '{p} s’infiltre côté gauche et frappe…',
    'Belle combinaison de {home}, {p} arme sa frappe…',
    '{p} reprend de volée à l’entrée de la surface…',
    'Centre millimétré, {p} place sa tête…',
    '{p} élimine son vis-à-vis et tente sa chance…',
  ],
  chanceAway: [
    '{away} contre vite, {p} se présente face au but…',
    'Frappe lointaine de {p}…',
    '{p} déborde et centre fort devant le but…',
    'Coup franc dangereux pour {away}, {p} s’élance…',
  ],
  saved: ['arrêt du gardien !', 'parade décisive !', 'le gardien capte sans trembler.'],
  wide: ['à côté !', 'au-dessus de la barre.', 'ça frôle le poteau, mais c’est dehors.'],
  post: ['sur le poteau !', 'la barre transversale tremble encore !'],
  goalHome: ['BUT ! {p} trompe le gardien !', 'BUT ! Quelle frappe de {p} !', 'BUT ! {p} conclut une action collective magnifique !'],
  goalAway: ['But de {away}. {p} égalise… ou fait mal.', 'But de {away} : {p} punit la défense.', 'Coup dur : {p} marque pour {away}.'],
  yellow: ['Carton jaune pour {p} ({team}) après une faute tactique.', 'Avertissement : {p} ({team}) est sanctionné.'],
  red: ['CARTON ROUGE ! {p} ({team}) est expulsé !'],
  secondYellow: ['Second carton jaune pour {p} ({team}) : expulsion !'],
  ambience: [
    'Possession patiente de {home} au milieu de terrain.',
    '{away} resserre les lignes et laisse venir.',
    'Le public pousse derrière {home} !',
    'Duel âpre au milieu, l’arbitre laisse jouer.',
    'Temps faible pour {home}, {away} confisque le ballon.',
    'Corner pour {home}… dégagé par la défense.',
    'Récupération haute de {home}, mais la passe est trop longue.',
  ],
};

const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

function pickWeighted(list, weight) {
  const w = list.map(weight);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

export function createLiveMatch(s, ctx) {
  const awayRoster = Array.from({ length: 11 }, (_, k) => ({ name: `${pick(FIRST)} ${pick(LAST)}`, pos: SLOTS[k] }));
  const m = {
    home: s.clubName,
    away: ctx.opp.name,
    oppStrength: ctx.opp.strength,
    lineup: [...s.lineup],
    tactic: s.tactic,
    score: { home: 0, away: 0 },
    stats: { shots: [0, 0], onTarget: [0, 0], possession: 50, yellow: [0, 0], red: [0, 0] },
    events: [],
    scorers: [],
    half: 0,
    played: [false, false],
    halfLength: [45 + ri(1, 3), 45 + ri(2, 5)],
    sent: { home: new Set(), away: new Set() },
    booked: { home: new Set(), away: new Set() },
    subsUsed: 0,
  };
  const playersOn = () => m.lineup.map((id) => s.players.find((p) => p.id === id)).filter((p) => p && !m.sent.home.has(p.id));
  const awayOn = () => awayRoster.filter((p) => !m.sent.away.has(p.name));
  const vars = (extra = {}) => ({ home: m.home, away: m.away, ...extra });
  const usedAmbience = new Set();
  const ambience = () => { // pas deux fois la même phrase d'ambiance dans un match
    let pool = T.ambience.filter((t) => !usedAmbience.has(t));
    if (!pool.length) { usedAmbience.clear(); pool = T.ambience; }
    const t = pick(pool);
    usedAmbience.add(t);
    return t;
  };
  const push = (at, type, side, text, extra = {}) => m.events.push({ at, minute: label(at, extra.half ?? m.half), type, side, text, half: m.half, ...extra });
  const label = (at, half) => {
    const base = half === 1 ? 45 : 90;
    const mm = Math.ceil(at);
    return mm > base ? `${base}+${mm - base}` : `${mm}`;
  };

  function homeShooter() {
    const out = playersOn().filter((p) => p.pos !== 'G');
    return pickWeighted(out.length ? out : playersOn(), (p) => (p.pos === 'A' ? p.att * 3 : p.pos === 'M' ? p.men * 1.5 : p.att * 0.5) + 1);
  }
  const awayShooter = () => pickWeighted(awayOn().filter((p) => p.pos !== 'G'), (p) => (p.pos === 'A' ? 3 : p.pos === 'M' ? 1.6 : 0.5));

  // Simule une mi-temps entière (1 ou 2) avec l'onze et la tactique du moment.
  function playHalf(half) {
    if (m.played[half - 1]) return m.events.filter((e) => e.half === half); // déjà jouée : même déroulé
    m.played[half - 1] = true;
    m.half = half;
    const start = half === 1 ? 0 : 45;
    const end = start + m.halfLength[half - 1]; // 45 minutes + temps additionnel
    const rating = lineupRating(s.players, m.lineup);
    const xg = expectedGoals(rating, m.oppStrength, m.tactic);
    const diff = rating - m.oppStrength;
    const tilt = m.tactic === 'offensive' ? 6 : m.tactic === 'low' ? -9 : 0;
    m.stats.possession = Math.round(clamp(50 + diff * 3 + tilt, 30, 72));
    if (half === 1) push(0, 'kickoff', null, fill(pick(T.kickoff), vars()));
    else push(45, 'kickoff', null, 'Reprise de la seconde période !');
    let lastAmbience = start;
    for (let minute = start + 1; minute <= end; minute++) {
      const at = minute - Math.random() * 0.9;
      // un joueur expulsé affaiblit l'équipe pour le reste du match
      const redH = m.sent.home.size, redA = m.sent.away.size;
      const lamH = xg.for * Math.pow(0.78, redH) * Math.pow(1.22, redA);
      const lamA = xg.against * Math.pow(1.22, redH) * Math.pow(0.78, redA);
      for (const [side, lam] of [['home', lamH], ['away', lamA]]) {
        if (Math.random() >= lam / (90 * CONVERSION)) continue;
        const idx = side === 'home' ? 0 : 1;
        const p = side === 'home' ? homeShooter() : awayShooter();
        m.stats.shots[idx]++;
        const lead = fill(pick(side === 'home' ? T.chanceHome : T.chanceAway), vars({ p: p.name }));
        if (Math.random() < CONVERSION) {
          m.stats.onTarget[idx]++;
          m.score[side]++;
          if (side === 'home') m.scorers.push({ name: p.name, minute: Math.ceil(at) });
          push(at, 'goal', side, fill(pick(side === 'home' ? T.goalHome : T.goalAway), vars({ p: p.name })), {
            player: p.name, score: { ...m.score }, lead,
          });
        } else {
          const r = Math.random();
          const outcome = r < 0.45 ? 'saved' : r < 0.85 ? 'wide' : 'post';
          if (outcome === 'saved') m.stats.onTarget[idx]++;
          push(at, 'chance', side, `${lead} ${pick(T[outcome])}`, { player: p.name, outcome });
        }
      }
      // cartons
      for (const side of ['home', 'away']) {
        const r = Math.random();
        if (r < RED_PER_MIN) {
          const pool = side === 'home' ? playersOn().filter((p) => p.pos !== 'G') : awayOn().filter((p) => p.pos !== 'G');
          if (pool.length > 7) {
            const p = pick(pool);
            m.sent[side].add(side === 'home' ? p.id : p.name);
            m.stats.red[side === 'home' ? 0 : 1]++;
            push(at, 'red', side, fill(pick(T.red), vars({ p: p.name, team: side === 'home' ? m.home : m.away })), { player: p.name });
          }
        } else if (r < RED_PER_MIN + YELLOW_PER_MIN) {
          const pool = side === 'home' ? playersOn().filter((p) => p.pos !== 'G') : awayOn().filter((p) => p.pos !== 'G');
          const keyOf = (q) => (side === 'home' ? q.id : q.name);
          // un joueur déjà averti se montre prudent : quatre fois moins de risque d'un second carton
          const p = pickWeighted(pool, (q) => (m.booked[side].has(keyOf(q)) ? 0.25 : 1));
          const key = keyOf(p);
          const team = side === 'home' ? m.home : m.away;
          if (m.booked[side].has(key) && pool.length > 7) {
            m.sent[side].add(key);
            m.stats.red[side === 'home' ? 0 : 1]++;
            push(at, 'red', side, fill(pick(T.secondYellow), vars({ p: p.name, team })), { player: p.name });
          } else {
            m.booked[side].add(key);
            m.stats.yellow[side === 'home' ? 0 : 1]++;
            push(at, 'yellow', side, fill(pick(T.yellow), vars({ p: p.name, team })), { player: p.name });
          }
        }
      }
      // ambiance, de temps en temps
      if (minute - lastAmbience > ri(6, 11)) {
        lastAmbience = minute;
        push(at - 0.3, 'info', null, fill(ambience(), vars()));
      }
    }
    const baseEnd = half === 1 ? 45 : 90;
    if (end > baseEnd) push(baseEnd + 0.01, 'info', null, `${end - baseEnd} minute${end - baseEnd > 1 ? 's' : ''} de temps additionnel.`);
    push(end, half === 1 ? 'halftime' : 'fulltime', null, half === 1
      ? `Mi-temps : ${m.home} ${m.score.home} – ${m.score.away} ${m.away}.`
      : `Coup de sifflet final ! ${m.home} ${m.score.home} – ${m.score.away} ${m.away}.`);
    m.events.sort((a, b) => a.half - b.half || a.at - b.at);
    return m.events.filter((e) => e.half === half);
  }

  return {
    state: m,
    playHalf,
    get halfEnd() { return m.half === 1 ? m.halfLength[0] : 45 + m.halfLength[1]; },
    // changement à la mi-temps : un titulaire sort, un remplaçant prend son poste
    substitute(outId, inId) {
      const k = m.lineup.indexOf(outId);
      if (k === -1 || m.lineup.includes(inId) || m.sent.home.has(outId)) return false;
      const out = s.players.find((p) => p.id === outId);
      const inn = s.players.find((p) => p.id === inId);
      m.lineup[k] = inId;
      m.subsUsed++;
      push(45, 'sub', 'home', `Changement pour ${m.home} : ${inn.name} remplace ${out.name}.`, { half: 2 });
      return true;
    },
    setTactic(t) {
      if (!TACTICS[t] || t === m.tactic) return;
      m.tactic = t;
      push(45, 'info', 'home', `Changement tactique : ${m.home} passe en ${TACTICS[t].name.toLowerCase()}.`, { half: 2 });
    },
    // résultat au format attendu par applyMatchResult
    result() {
      return {
        gf: m.score.home,
        ga: m.score.away,
        scorers: m.scorers,
        myRating: Math.round(lineupRating(s.players, m.lineup) * 10) / 10,
        oppStrength: m.oppStrength,
        oppName: m.away,
        stats: m.stats,
        highlights: m.events.filter((e) => ['goal', 'red', 'yellow'].includes(e.type)).map(({ minute, type, side, player }) => ({ minute, type, side, player })),
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
