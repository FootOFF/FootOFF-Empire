// Postes façon FM (1.0.41) : écart entre la note au poste précis et la note de la ligne, par poste, sur 3 000 joueurs
// tirés comme ceux du jeu ; puis buts par match avec les six dispositifs et un dispositif libre.
//   node tools/sim/postes.mjs
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const { makePlayer, ratingAt } = await load('/src/game/players.js');
const P = await load('/src/game/posts.js');
const engine = await load('/src/game/engine.js');
const { autoLineup, lineupRating, formationOf } = await load('/src/game/tactics.js');
const { createLiveMatch } = await load('/src/game/live.js');
const { rnd } = await load('/src/game/utils.js');
const types = ['DC', 'DG', 'DLG', 'MDC', 'MG', 'MC', 'MOG', 'MOC', 'ATG', 'BT'];
const stat = Object.fromEntries(types.map((t) => [t, []]));
for (let i = 0; i < 3000; i++) {
  const pos = ['D', 'M', 'A'][i % 3];
  const p = makePlayer({ level: rnd(1, 5), pos });
  p.id = i + 1;
  for (const t of types) if (P.POST_LINE[t] === pos) stat[t].push(P.ratingAtPost(p, t) - ratingAt(p, pos));
}
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return [m, Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length)]; };
console.log('écart note au poste − note de la ligne (moyenne / écart type) :');
console.log(types.filter((t) => stat[t].length).map((t) => { const [m, s] = sd(stat[t]); return `${t} ${m.toFixed(2)} / ${s.toFixed(2)}`; }).join(' · '));
const N = Number(process.argv[2] || 400);
for (const f of ['433', '442', '4231', '352', '343', '532', 'g:00010304111321232442', 'g:01020310142122233042']) {
  const F = formationOf(f);
  let g = 0, pts = 0;
  for (let i = 0; i < N; i++) {
    const s = engine.createInitialState('Club Test');
    s.players = [];
    for (const pos of ['G', 'D', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'M', 'M', 'A']) { const p = makePlayer({ level: 3 + rnd(-0.6, 0.6), pos }); p.id = s.nextId++; p.fit = 100; s.players.push(p); }
    s.formation = f; s.lineup = autoLineup(s.players, f); s.tactic = 'balanced';
    const rating = lineupRating(s.players, s.lineup, f);
    if (!Number.isFinite(rating)) { console.log('NOTE INVALIDE', f); break; }
    const lm = createLiveMatch(s, { comp: 'league', home: true, opp: { name: `Club ${i}`, strength: rating } });
    lm.playHalf(1); lm.playHalf(2);
    const { home: h, away: a } = lm.state.score; g += h + a; pts += h > a ? 3 : h === a ? 1 : 0;
  }
  console.log(`${F.name.padEnd(9)} (${f.padEnd(22)}) buts/match ${(g / N).toFixed(2)} · points ${(pts / N).toFixed(2)}`);
}
await vite.close();
