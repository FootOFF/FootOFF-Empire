import { leagueFixtures, leagueTable } from './league';

// Saison d'un club de ligue (partie de championnat entre amis : leagueClub.js) dans le moteur de la carrière. La partie
// garde la ligue dans s.league : { code, seed, format, name, slot (sa place), season, round (journées appliquées), level,
// clubs: [{ slot, name, crest, human, pseudo, strength }], results (résultats officiels de la saison), deadline, sent }.
// Index de la carrière : 0 pour nous, puis les sept autres places dans l'ordre (s.rivals[i - 1]).

const leagueOf = (L) => ({ code: L.code, seed: L.seed, settings: { format: L.format } });
const othersOf = (L) => L.clubs.filter((c) => c.slot !== L.slot).sort((a, b) => a.slot - b.slot);
export const indexOfSlot = (L, slot) => (slot === L.slot ? 0 : othersOf(L).findIndex((c) => c.slot === slot) + 1);
export const slotOfIndex = (L, i) => (i === 0 ? L.slot : othersOf(L)[i - 1]?.slot);

// Début de saison : les sept adversaires de la ligue, le calendrier vu de notre place, nos déplacements (aller-retour :
// une rencontre sur deux chez l'adversaire ; aller simple : selon le tirage), le classement officiel. Ni coupes, ni marché
// privé : le mercato d'une ligue est commun (leagueWorld.js).
export function leagueSeasonStart(s) {
  const L = s.league;
  s.rivals = othersOf(L).map((c) => ({ name: c.name, strength: c.strength ?? 6.8, slot: c.slot, crest: c.crest || null, human: !!c.human, pseudo: c.pseudo || null }));
  const fixtures = leagueFixtures(leagueOf(L), L.season);
  s.schedule = fixtures.map((pairs) => pairs.map(([h, a]) => [indexOfSlot(L, h), indexOfSlot(L, a)]));
  s.away = fixtures.map((pairs) => pairs.some(([, a]) => a === L.slot));
  s.round = 0;
  s.calendar = null;
  s.cups = null;
  s.c1 = false;
  s.c1Next = false;
  s.market = [];
  s.transfers = [];
  s.divisionIndex = Math.max(0, Math.min(3, L.level || 0)); // échelle de l'économie : celle de la ligue
  L.round = 0;
  L.results = [];
  s.table = officialTable(s);
}

// Classement officiel (résultats du serveur), dans l'ordre des index de la carrière.
export function officialTable(s) {
  const L = s.league;
  const rows = leagueTable(L.clubs.map((c) => ({ ...c, open: false })), L.results || []);
  return Array.from({ length: 8 }, (_, i) => {
    const r = rows.find((x) => x.slot === slotOfIndex(L, i)) || { pts: 0, gd: 0, played: 0, w: 0, d: 0, l: 0 };
    return { pts: r.pts, gd: r.gd, played: r.played, w: r.w, d: r.d, l: r.l };
  });
}

// Les clubs de la ligue, mis à jour depuis le serveur (noms, écussons, amis présents ou partis) ; niveau d'un club : celui
// de son dernier onze connu (équipe envoyée ou club de l'ordinateur).
export function refreshRivals(s) {
  const L = s.league;
  for (const r of s.rivals || []) {
    const c = L.clubs.find((x) => x.slot === r.slot);
    if (c) Object.assign(r, { name: c.name, crest: c.crest || null, human: !!c.human, pseudo: c.pseudo || null, strength: c.strength ?? r.strength });
  }
}

// --- Le match officiel, de notre point de vue ------------------------------------------------------------------------
// Le moteur suit le club qui reçoit joueur par joueur (live.js) ; à domicile, son résultat est le nôtre tel quel. À
// l'extérieur, on le retourne : score, statistiques et tirs inversés, nos notes, buts, passes et cartons lus dans les
// événements du match (par le nom des joueurs) ; pas de blessure suivie pour le visiteur.
const flip2 = (a) => (Array.isArray(a) ? [a[1], a[0]] : a);
export function perspectiveResult(live, side, players) {
  const res = live.result();
  if (side === 'home') return res;
  const m = live.state;
  const all = [...live.eventsOf(1), ...live.eventsOf(2)];
  const byName = new Map(players.map((p) => [p.name, p]));
  const notes = live.ratingsAt(all, 90).away || [];
  const perf = new Map();
  const get = (name) => {
    const p = byName.get(name);
    if (!p) return null;
    if (!perf.has(p.id)) perf.set(p.id, { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 });
    return perf.get(p.id);
  };
  const scorers = [];
  for (const e of all) {
    if (e.side !== 'away') continue;
    if (e.type === 'goal') {
      const f = get(e.player);
      if (f) f.goals++;
      const a = e.assist && get(e.assist);
      if (a) a.assists++;
      const p = byName.get(e.player);
      scorers.push({ name: e.player, id: p?.id ?? null, minute: Number.parseInt(e.minute, 10) || 0, assist: e.assist || null, pen: e.q === 'pen' });
    } else if (e.type === 'yellow' || e.type === 'red') {
      const f = get(e.player);
      if (f) f[e.type]++;
    }
  }
  const lineup = m.awayRoster.map((p) => p.id);
  const rated = notes.map((n) => {
    const p = byName.get(n.name) || players.find((q) => q.id === n.id);
    if (!p) return null;
    const f = perf.get(p.id) || { goals: 0, assists: 0, yellow: 0, red: 0, shots: 0, onTarget: 0 };
    return { id: p.id, name: p.name, num: p.num, pos: n.pos || p.pos, rating: n.rating, minutes: 90, ...f };
  }).filter(Boolean);
  const st = m.stats;
  const stats = {
    ...st,
    possession: 100 - st.possession,
    shots: flip2(st.shots), onTarget: flip2(st.onTarget), yellow: flip2(st.yellow), red: flip2(st.red), xg: flip2(st.xg),
    saves: flip2(st.saves), post: flip2(st.post), wide: flip2(st.wide), big: flip2(st.big), pens: flip2(st.pens),
    possHalf: st.possHalf ? st.possHalf.map((v) => (v == null ? v : 100 - v)) : st.possHalf,
  };
  return {
    ...res,
    players: rated,
    gf: m.score.away,
    ga: m.score.home,
    scorers,
    myRating: Math.round(m.oppStrength * 10) / 10,
    formation: m.oppPlan?.formation || res.formation,
    lineup,
    subs: [],
    injuries: [],
    oppStrength: res.myRating,
    oppName: m.home,
    tactic: m.oppPlan?.tactic || res.tactic,
    stats,
    shots: (res.shots || []).map((x) => ({ ...x, s: x.s === 0 ? 1 : 0 })),
    highlights: (res.highlights || []).map((h) => ({ ...h, side: h.side === 'home' ? 'away' : h.side === 'away' ? 'home' : h.side })),
    preOdds: res.preOdds ? { w: res.preOdds.l, d: res.preOdds.d, l: res.preOdds.w } : null,
  };
}
