// Plans en matchs complets (moteur à zones, 1.0.49) : points par match de chaque plan contre l'ordinateur (qui choisit le
// sien), selon l'écart de niveau, et du plan que le moteur juge le mieux accordé aux joueurs (planValue) contre le pire.
//   node tools/sim/plans-zones.mjs [clubs=500]
// Mesures du 14/11 (1 500 clubs) : Offensive 1,21 · Équilibrée 1,23 · Bloc bas 1,26 ; plus faible de 2 points, le bloc
// bas rapporte le plus ; à niveau égal, l'Équilibrée ; plus fort, l'Offensive ou le bloc bas ; plan accordé +0,14 point
// sur le pire.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { makePlayer } = await load('/src/game/players.js');
const { autoLineup, lineupRating } = await load('/src/game/tactics.js');
const { createLiveMatch } = await load('/src/game/live.js');
const { planValue } = await load('/src/game/zones.js');
const { rnd } = await load('/src/game/utils.js');
const N = Number(process.argv[2] || 500);
const PL = ['offensive', 'balanced', 'low'];
function club(level) {
  const s = engine.createInitialState('Club Test');
  s.players = [];
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'D', 'M', 'M', 'A', 'A']) {
    const p = makePlayer({ level: level + rnd(-0.5, 0.5), pos }); p.id = s.nextId++; p.fit = 100; s.players.push(p);
  }
  s.formation = '433'; s.lineup = autoLineup(s.players, s.formation); s.tactic = 'balanced';
  return s;
}
const pts = { offensive: 0, balanced: 0, low: 0, best: 0, worst: 0 };
const byGap = {};
const aiPlans = {};
for (let i = 0; i < N; i++) {
  const s = club(rnd(0.5, 4.5));
  const rating = lineupRating(s.players, s.lineup, s.formation);
  const onze = s.lineup.map((id) => s.players.find((p) => p.id === id));
  const v = Object.fromEntries(PL.map((x) => [x, planValue(onze, '433', x)]));
  const order = [...PL].sort((a, b) => v[b] - v[a]);
  const gap = [-2, 0, 2][i % 3];
  for (const plan of PL) {
    s.tactic = plan;
    const lm = createLiveMatch(s, { comp: 'league', home: i % 2 === 0, opp: { name: `Adversaire ${i}`, strength: rating - gap } });
    if (plan === 'balanced') aiPlans[lm.state.oppPlan.tactic] = (aiPlans[lm.state.oppPlan.tactic] || 0) + 1;
    lm.playHalf(1); lm.playHalf(2);
    const { home: h, away: a } = lm.state.score;
    const p = h > a ? 3 : h === a ? 1 : 0;
    pts[plan] += p;
    byGap[`${gap}:${plan}`] = (byGap[`${gap}:${plan}`] || 0) + p; byGap[`${gap}`] = (byGap[`${gap}`] || 0) + (plan === 'balanced' ? 1 : 0);
    if (plan === order[0]) pts.best += p;
    if (plan === order[2]) pts.worst += p;
  }
}
console.log(`${N} clubs × 3 plans contre l'ordinateur (écarts −2, 0, +2) : points par match`, Object.entries(pts).map(([k, x]) => `${k} ${(x / N).toFixed(3)}`).join(' · '));
for (const g of [-2, 0, 2]) console.log(`  écart ${g} :`, PL.map((x) => `${x} ${(byGap[`${g}:${x}`] / byGap[`${g}`]).toFixed(2)}`).join(' · '));
console.log('plans de l\'ordinateur :', Object.entries(aiPlans).map(([k, x]) => `${k} ${(100 * x / N).toFixed(0)}%`).join(' · '));
await vite.close();
