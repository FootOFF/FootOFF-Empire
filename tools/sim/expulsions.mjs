// Expulsions en 3D (1.0) : joue N fois le temps fort d'un carton rouge, pour les deux équipes, sans affichage, et relève
// où le joueur est fauché. Une faute de carton rouge ne tombe jamais dans la surface (elle vaudrait aussi un penalty) ;
// le temps fort doit aussi aller à son terme. Lancer depuis la racine du dépôt :
//   node tools/sim/expulsions.mjs [N=40]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const THREE = await load('three');
const { createMatchScene } = await load('/src/three/matchplay.js');
const { matchFeed } = await load('/src/game/matchFeed.js');
const N = Number(process.argv[2] || 40);
const GOAL_X = 5.25, BOX = GOAL_X - 1.65, BOX_V = 2.016; // surface : 16,5 m de profondeur, 40,32 m de large (unité : 10 m)

const squad = createMatchScene(new THREE.Scene());
squad.setKits({ shirt: 0xc7a15a, keeper: 0x222222 }, { shirt: 0x3366cc, keeper: 0x55aa55 });
squad.setMode({ matchDay: true });
Object.assign(matchFeed, { active: true, phase: 'playing', ended: false });
const NAMES = ['G1', 'D1', 'D2', 'D3', 'D4', 'M1', 'M2', 'M3', 'A1', 'A2', 'A3'];
let id = 0;
const rows = [];
for (let i = 0; i < N; i++) {
  const side = i % 2 ? 'away' : 'home';
  const e = { type: 'red', side, at: 60.2, minute: '61', player: side === 'home' ? 'D2' : 'XD2', seed: (i * 7919 + 13) % 100000 };
  const spec = { id: ++id, e, type: 'red', half: 2, replay: true, speed: 1, homeNames: NAMES, awayNames: NAMES.map((n) => `X${n}`), formation: '433', awayFormation: '442', offHome: [], offAway: [] };
  Object.assign(matchFeed, { hl: spec, hlAck: 0, hlReveal: 0, hlDone: 0, hlClock: e.at - 0.12, hlPhase: '' });
  let t = 0, foul = null;
  while (t < 40) {
    squad.update(1 / 60, t);
    t += 1 / 60;
    const d = squad.debug;
    if (!foul && d?.foulAt != null && d.victim !== undefined) {
      const v = squad.agents[d.victim];
      const u = v.x * d.dirA, w = v.z * d.dirA;
      foul = { u, w, inBox: u > BOX && Math.abs(w) < BOX_V, edge: BOX - u };
    }
    if (matchFeed.hlDone === spec.id) break;
  }
  rows.push({ side, done: matchFeed.hlDone === spec.id, foul });
}
const fouls = rows.filter((r) => r.foul);
const inBox = fouls.filter((r) => r.foul.inBox).length;
const edge = fouls.map((r) => r.foul.edge).sort((a, b) => a - b);
console.log(`${rows.length} expulsions · ${rows.filter((r) => !r.done).length} inachevée(s) · faute relevée ${fouls.length} fois · dans la surface : ${inBox}`);
if (edge.length) console.log(`distance à la ligne de surface : de ${(edge[0] * 10).toFixed(1)} m à ${(edge[edge.length - 1] * 10).toFixed(1)} m (médiane ${(edge[Math.floor(edge.length / 2)] * 10).toFixed(1)} m ; négatif = dans la surface en profondeur)`);
await vite.close();
