// Attributs détaillés en match (1.0.39) : buts par match, part des buts sur centre ou corner, poste des buteurs de la
// tête, et le jeu aérien moyen des buteurs de la tête comparé à celui des joueurs de champ.
//   node tools/sim/attributs-match.mjs [matchs=2000]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { makePlayer } = await load('/src/game/players.js');
const { autoLineup, lineupRating } = await load('/src/game/tactics.js');
const { createLiveMatch, fmOf } = await load('/src/game/live.js');
const { rnd } = await load('/src/game/utils.js');
const N = Number(process.argv[2] || 2000);
let goals = 0, aerial = 0, fk = 0, longG = 0; const pos = { D: 0, M: 0, A: 0 }; let airSum = 0, airN = 0, fieldAir = 0, fieldN = 0;
for (let i = 0; i < N; i++) {
  const s = engine.createInitialState('Club Test');
  s.players = [];
  for (const ps of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'D', 'M', 'M', 'A', 'A']) { const p = makePlayer({ level: 3 + rnd(-0.6, 0.6), pos: ps }); p.id = s.nextId++; p.fit = 100; s.players.push(p); }
  s.formation = '433'; s.lineup = autoLineup(s.players, s.formation); s.tactic = 'balanced';
  const rating = lineupRating(s.players, s.lineup, s.formation);
  const lm = createLiveMatch(s, { comp: 'league', home: true, opp: { name: `Club ${i}`, strength: rating + rnd(-1, 1) } });
  const ev = [...lm.playHalf(1), ...lm.playHalf(2)];
  for (const id of s.lineup) { const p = s.players.find((q) => q.id === id); if (p && p.pos !== 'G') { fieldAir += fmOf(p).jeuAerien; fieldN++; } }
  for (const e of ev) {
    if (e.type !== 'goal') continue;
    goals++;
    if (e.kind === 'cross' || e.kind === 'corner') {
      aerial++;
      if (e.side === 'home' && e.playerId != null) { const p = s.players.find((q) => q.id === e.playerId); if (p) { pos[p.pos] = (pos[p.pos] || 0) + 1; airSum += fmOf(p).jeuAerien; airN++; } }
    }
    if (e.kind === 'freekick') fk++;
    if (e.kind === 'long') longG++;
  }
}
const f = (x) => (x / N).toFixed(2);
console.log(`buts par match ${f(goals)} · sur centre ou corner ${Math.round((100 * aerial) / goals)} % · coup franc ${Math.round((100 * fk) / goals)} % · de loin ${Math.round((100 * longG) / goals)} %`);
console.log(`buteurs de la tête (nos buts) : défenseurs ${pos.D}, milieux ${pos.M}, attaquants ${pos.A} · jeu aérien moyen ${(airSum / airN).toFixed(1)} contre ${(fieldAir / fieldN).toFixed(1)} pour les joueurs de champ`);
await vite.close();
