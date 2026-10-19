import { clamp, pick, ri } from './utils';
import { FIRST, LAST, capitalize, clubAfter, deName } from './names';
import { SLOTS, TACTICS, expectedGoals, lineupRating } from './tactics';
import { ratingAt } from './players';

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
  chanceLong: [
    '{p} arme une frappe lointaine…',
    'De loin, {p} tente sa chance…',
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
  // but adverse, selon l'écart après le but (adversaire − nous)
  goalAway: {
    level: ['Égalisation : {p} remet {away} à hauteur.', '{p} égalise pour {away}.'],
    lead: ['But de {away} : {p} donne l’avantage aux siens.', 'Coup dur : {p} marque pour {away}.'],
    more: ['{p} creuse l’écart pour {away}.', 'Coup dur : {p} enfonce le clou pour {away}.'],
    back: ['{p} réduit l’écart pour {away}.', 'But de {away} : {p} relance le suspense.'],
  },
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
    halvesPlayed: [false, false], // mi-temps déjà simulées (rejouer une mi-temps redonne le même déroulé)
    halfLength: [45 + ri(1, 3), 45 + ri(2, 5)],
    sent: { home: new Set(), away: new Set() },
    booked: { home: new Set(), away: new Set() },
    subsUsed: 0,
    played: new Set(s.lineup), // joueurs entrés en jeu (notes de match)
    perf: {}, // par joueur : buts, passes décisives, cartons
  };
  const perf = (id) => (m.perf[id] ||= { goals: 0, assists: 0, yellow: 0, red: 0 });
  const has = (p, t) => p.traits?.includes(t);
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

  // buteur : la finition compte (beaucoup pour un attaquant, un peu pour un milieu, peu pour un défenseur)
  function homeShooter(bigGame) {
    const out = playersOn().filter((p) => p.pos !== 'G');
    return pickWeighted(out.length ? out : playersOn(), (p) => {
      const base = p.pos === 'A' ? p.a.fin * 3 : p.pos === 'M' ? ((p.a.fin + p.a.pas) / 2) * 1.5 : p.a.fin * 0.5;
      return (base + 1) * (bigGame && has(p, 'grandsSoirs') ? 1.5 : 1) * (has(p, 'frappe') ? 1.15 : 1);
    });
  }
  // passeur décisif : la passe compte, le signe « Passeur » triple les chances
  function homeAssist(scorer) {
    const pool = playersOn().filter((p) => p !== scorer && p.pos !== 'G');
    if (!pool.length || Math.random() > 0.8) return null; // certains buts sont des exploits personnels
    return pickWeighted(pool, (p) => (p.a.pas + (p.pos === 'M' ? 3 : 0)) * (has(p, 'passeur') ? 3 : 1));
  }
  const awayShooter = () => pickWeighted(awayOn().filter((p) => p.pos !== 'G'), (p) => (p.pos === 'A' ? 3 : p.pos === 'M' ? 1.6 : 0.5));

  // Simule une mi-temps entière (1 ou 2) avec l'onze et la tactique du moment.
  function playHalf(half) {
    if (m.halvesPlayed[half - 1]) return m.events.filter((e) => e.half === half); // déjà jouée : même déroulé
    m.halvesPlayed[half - 1] = true;
    m.half = half;
    const start = half === 1 ? 0 : 45;
    const end = start + m.halfLength[half - 1]; // 45 minutes + temps additionnel
    const rating = lineupRating(s.players, m.lineup);
    const xg = expectedGoals(rating, m.oppStrength, m.tactic);
    const bigGame = m.oppStrength > rating;
    const starters = playersOn();
    const rocs = starters.some((p) => p.pos === 'D' && has(p, 'roc'));
    const keeper = starters.find((p) => p.pos === 'G');
    const chat = keeper && has(keeper, 'chat');
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
      const lamA = xg.against * Math.pow(1.22, redH) * Math.pow(0.78, redA) * (rocs ? 0.97 : 1);
      for (const [side, lam] of [['home', lamH], ['away', lamA]]) {
        if (Math.random() >= lam / (90 * CONVERSION)) continue;
        const idx = side === 'home' ? 0 : 1;
        const p = side === 'home' ? homeShooter(bigGame) : awayShooter();
        m.stats.shots[idx]++;
        const pool = side === 'home' ? (has(p, 'frappe') && Math.random() < 0.4 ? T.chanceLong : T.chanceHome) : T.chanceAway;
        const lead = fill(pick(pool), vars({ p: p.name }));
        // finition : « Finisseur » et « grands soirs » côté club, « Chat » dans nos cages contre l'adversaire
        const conv = side === 'home'
          ? CONVERSION * (has(p, 'finisseur') ? 1.15 : 1) * (bigGame && has(p, 'grandsSoirs') ? 1.1 : 1)
          : CONVERSION * (chat ? 0.92 : 1);
        if (Math.random() < conv) {
          m.stats.onTarget[idx]++;
          m.score[side]++;
          const gap = m.score.away - m.score.home;
          const awayPool = gap === 0 ? T.goalAway.level : gap === 1 ? T.goalAway.lead : gap > 1 ? T.goalAway.more : T.goalAway.back;
          let text = fill(pick(side === 'home' ? T.goalHome : awayPool), vars({ p: p.name }));
          let assist = null;
          if (side === 'home') {
            assist = homeAssist(p);
            perf(p.id).goals++;
            if (assist) { perf(assist.id).assists++; text += ` Passe décisive ${deName(assist.name)}.`; }
            m.scorers.push({ name: p.name, id: p.id, minute: Math.ceil(at), assist: assist?.name || null });
          }
          push(at, 'goal', side, text, {
            player: p.name, playerId: side === 'home' ? p.id : null, score: { ...m.score }, lead,
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
            const p = side === 'home' ? pickWeighted(pool, (q) => (21 - q.a.sfr) * (has(q, 'sangChaud') ? 2.5 : 1)) : pick(pool);
            m.sent[side].add(side === 'home' ? p.id : p.name);
            if (side === 'home') perf(p.id).red++;
            m.stats.red[side === 'home' ? 0 : 1]++;
            push(at, 'red', side, fill(pick(T.red), vars({ p: p.name, team: side === 'home' ? m.home : m.away })), { player: p.name });
          }
        } else if (r < RED_PER_MIN + YELLOW_PER_MIN) {
          const pool = side === 'home' ? playersOn().filter((p) => p.pos !== 'G') : awayOn().filter((p) => p.pos !== 'G');
          const keyOf = (q) => (side === 'home' ? q.id : q.name);
          // un joueur déjà averti se montre prudent : quatre fois moins de risque d'un second carton
          const p = pickWeighted(pool, (q) => (m.booked[side].has(keyOf(q)) ? 0.25 : 1)
            * (side === 'home' ? ((21 - q.a.sfr) / 10) * (has(q, 'sangChaud') ? 2.5 : 1) : 1));
          const key = keyOf(p);
          const team = side === 'home' ? m.home : m.away;
          if (m.booked[side].has(key) && pool.length > 7) {
            m.sent[side].add(key);
            if (side === 'home') perf(p.id).red++;
            m.stats.red[side === 'home' ? 0 : 1]++;
            push(at, 'red', side, fill(pick(T.secondYellow), vars({ p: p.name, team })), { player: p.name });
          } else {
            m.booked[side].add(key);
            if (side === 'home') perf(p.id).yellow++;
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
      const pos = k >= 0 ? SLOTS[k] : p.pos;
      const f = m.perf[id] || { goals: 0, assists: 0, yellow: 0, red: 0 };
      let r = 6 + res + f.goals * 1 + f.assists * 0.6 - f.yellow * 0.4 - f.red * 1.5;
      r += (ratingAt(p, pos) - m.oppStrength) * 0.1;
      if (pos === 'G') r += ga === 0 ? 0.8 : -0.3 * ga;
      if (pos === 'D' && ga === 0) r += 0.4;
      r += (Math.random() - 0.5) * 1.2;
      return { id, name: p.name, num: p.num, pos, rating: Math.round(clamp(r, 3, 10) * 2) / 2, ...f };
    }).filter(Boolean);
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
      m.played.add(inId);
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
        players: matchRatings(),
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
