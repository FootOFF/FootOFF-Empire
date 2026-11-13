// Cohérence tactique (1.0.39) : des milliers de matchs joués par le vrai moteur du direct (live.js). Mesure ce que vaut
// le plan qui colle aux joueurs (choix du PDG : « elle colle à mes joueurs », le cœur ; l'adversaire, léger) :
//   1. profils : la forme des onze tirés au hasard et l'écart, en niveaux, entre le plan qui leur va le mieux et le pire ;
//   2. points par match du plan le mieux accordé, du plan moyen et du pire, contre un adversaire de l'ordinateur ;
//   3. un même plan adverse : ce que pèse le cycle des plans (léger).
//   node tools/sim/coherence.mjs [matchs=1500]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { makePlayer } = await load('/src/game/players.js');
const { TACTIC_ORDER, autoLineup, lineupRating } = await load('/src/game/tactics.js');
const { createLiveMatch } = await load('/src/game/live.js');
const { profileOf, fitOf } = await load('/src/game/coherence.js');
const { rnd } = await load('/src/game/utils.js');

const N = Number(process.argv[2] || 1500);
const PLANS = TACTIC_ORDER;
function club() {
  const s = engine.createInitialState('Club Test');
  const level = rnd(1.5, 4.5);
  s.players = [];
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'D', 'M', 'M', 'A', 'A']) {
    const p = makePlayer({ level: level + rnd(-0.6, 0.6), pos });
    p.id = s.nextId++;
    p.fit = 100;
    s.players.push(p);
  }
  s.formation = '433';
  s.lineup = autoLineup(s.players, s.formation);
  return s;
}
const onze = (s) => s.lineup.map((id) => s.players.find((p) => p.id === id));
// 1. profils
const spread = [];
const comp = { pace: [], air: [], build: [], defPace: [], engine: [], wall: [] };
for (let i = 0; i < 2000; i++) {
  const P = profileOf(onze(club()));
  for (const k in comp) comp[k].push(P[k]);
  const f = PLANS.map((x) => fitOf(x, P));
  spread.push(Math.max(...f) - Math.min(...f));
}
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
spread.sort((a, b) => a - b);
console.log('profils (moyenne / écart type) :', Object.entries(comp).map(([k, a]) => `${k} ${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2)} / ${sd(a).toFixed(2)}`).join(' · '));
console.log(`écart meilleur − pire plan, en niveaux : médiane ${spread[1000].toFixed(2)} · 90e centile ${spread[1800].toFixed(2)} · max ${spread[1999].toFixed(2)}`);
// 2. le plan accordé contre un adversaire de l'ordinateur (son plan à lui : celui qui colle à ses joueurs)
let k = 0;
function play(s, plan, diff, home) {
  s.tactic = plan;
  const rating = lineupRating(s.players, s.lineup, s.formation);
  const ctx = { comp: 'league', home, opp: { name: `Adversaire ${++k}`, strength: rating - diff } };
  const lm = createLiveMatch(s, ctx);
  lm.playHalf(1);
  lm.playHalf(2);
  const { home: h, away: a } = lm.state.score;
  return h > a ? 3 : h === a ? 1 : 0;
}
for (const [diff, home] of [[0, true], [0, false], [-1, true]]) {
  const tot = { best: 0, mid: 0, worst: 0, balanced: 0 };
  for (let i = 0; i < N; i++) {
    const s = club();
    const P = profileOf(onze(s));
    const order = [...PLANS].sort((x, y) => fitOf(y, P) - fitOf(x, P));
    tot.best += play(s, order[0], diff, home);
    tot.mid += play(s, order[1], diff, home);
    tot.worst += play(s, order[2], diff, home);
    tot.balanced += play(s, 'balanced', diff, home);
  }
  const f = (x) => (x / N).toFixed(2);
  console.log(`écart ${diff}, ${home ? 'domicile' : 'extérieur'} : plan le mieux accordé ${f(tot.best)} pt · moyen ${f(tot.mid)} · pire ${f(tot.worst)} · toujours Équilibrée ${f(tot.balanced)}`);
}
// 3. le cycle seul : deux onze au profil neutre (fit ignoré), plan contre plan
await vite.close();
