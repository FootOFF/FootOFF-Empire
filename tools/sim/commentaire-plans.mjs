// Commentaire des plans (1.0.39) : quelques matchs du vrai moteur, les lignes « info » qui racontent le plan adverse,
// son changement à la pause et ce qui fait la différence. node tools/sim/commentaire-plans.mjs [matchs=6]
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
const { rnd } = await load('/src/game/utils.js');
const N = Number(process.argv[2] || 6);
for (let i = 0; i < N; i++) {
  const s = engine.createInitialState('Club Test');
  s.players = [];
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'D', 'M', 'M', 'A', 'A']) { const p = makePlayer({ level: 3 + rnd(-0.6, 0.6), pos }); p.id = s.nextId++; p.fit = 100; s.players.push(p); }
  s.formation = '433'; s.lineup = autoLineup(s.players, s.formation); s.tactic = ['offensive', 'balanced', 'low'][i % 3];
  const rating = lineupRating(s.players, s.lineup, s.formation);
  const lm = createLiveMatch(s, { comp: 'league', home: true, opp: { name: `Club ${i}`, strength: rating + rnd(-1, 1) } });
  const ev = [...lm.playHalf(1), ...lm.playHalf(2)];
  const infos = ev.filter((e) => e.type === 'info' && /bloc|press|contre|côtés|plan|monte|recule|attaque|ballon/i.test(e.text || ''));
  console.log(`— match ${i} : notre plan ${s.tactic}, le leur ${lm.state.oppPlan?.tactic}, score ${lm.state.score.home}-${lm.state.score.away}`);
  for (const e of infos) console.log(`   ${e.minute}′ ${e.text}`);
}
await vite.close();
