// Temps forts en 3D (0.7) : chaque type d'action du moteur (live.js), avec chaque issue (but, arrêt, à côté, poteau),
// pour les deux équipes, et l'expulsion, joués sans affichage par la scène du match (src/three/matchplay.js). Vérifie
// que chacun commence, arrive à son instant décisif (le direct affiche alors l'événement), finit (ralenti compris), que
// le ballon d'un but finit au fond des filets ; donne la durée de chacun. Lancer depuis la racine du dépôt :
//   node tools/sim/temps-forts.mjs [--detail]
// Pour les regarder : npx vite, puis /tools/sim/temps-forts.html dans le navigateur.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const THREE = await load('three');
const { createMatchScene } = await load('/src/three/matchplay.js');
const { matchFeed } = await load('/src/game/matchFeed.js');
const detail = process.argv.includes('--detail');

const squad = createMatchScene(new THREE.Scene());
squad.setKits({ shirt: 0xc7a15a, keeper: 0x222222 }, { shirt: 0x3366cc, keeper: 0x55aa55 });
squad.setMode({ matchDay: true });
Object.assign(matchFeed, { active: true, phase: 'playing', ended: false });
const NAMES = ['G1', 'D1', 'D2', 'D3', 'D4', 'M1', 'M2', 'M3', 'A1', 'A2', 'A3'];
const KINDS = ['through', 'counter', 'cutback', 'cross', 'combo', 'scramble', 'solo', 'corner', 'press', 'long', 'freekick', 'penalty'];
const OUTCOMES = [['goal', null, 'but'], ['chance', 'saved', 'arrêt'], ['chance', 'wide', 'à côté'], ['chance', 'post', 'poteau']];
let id = 0;

// joue un temps fort à 60 images par seconde, au plus 40 s
function play(e, type, half) {
  const spec = { id: ++id, e, type, half, replay: true, speed: 1, homeNames: NAMES, awayNames: NAMES.map((n) => `X${n}`), formation: '433', awayFormation: '442', offHome: [], offAway: [] };
  Object.assign(matchFeed, { hl: spec, hlAck: 0, hlReveal: 0, hlDone: 0, hlClock: e.at - 0.12, hlPhase: '' });
  let t = 0, reveal = null, kicked = false;
  while (t < 40) {
    squad.update(1 / 60, t);
    t += 1 / 60;
    if (squad.ball.state === 'shot') kicked = true;
    if (reveal === null && matchFeed.hlReveal === spec.id) reveal = t;
    if (matchFeed.hlDone === spec.id) break;
  }
  return { ack: matchFeed.hlAck === spec.id, reveal, done: matchFeed.hlDone === spec.id ? t : null, kicked, ball: squad.ball.state };
}

const rows = [];
for (const kind of KINDS) {
  for (const [type, outcome, label] of OUTCOMES) {
    for (const side of ['home', 'away']) {
      const e = { type, side, outcome, kind, q: kind === 'penalty' ? 'pen' : 'std', at: 23.4, minute: '24', player: side === 'home' ? 'A2' : 'XA2', assist: side === 'home' ? 'M2' : 'XM2', seed: (id * 7919) % 100000 };
      const r = play(e, type === 'goal' ? 'goal' : 'big', id % 2 ? 1 : 2);
      const ok = r.ack && r.reveal !== null && r.done !== null && r.kicked && (type !== 'goal' || r.ball === 'net');
      rows.push({ kind, label, side, ok, ...r });
    }
  }
}
for (const side of ['home', 'away']) {
  const r = play({ type: 'red', side, at: 60.2, minute: '61', player: side === 'home' ? 'D2' : 'XD2', seed: 4242 }, 'red', 2);
  rows.push({ kind: 'expulsion', label: 'carton rouge', side, ok: r.ack && r.reveal !== null && r.done !== null, ...r });
}
const fmt = (v) => (v === null ? '—' : `${v.toFixed(1).replace('.', ',')} s`);
for (const r of rows) if (detail || !r.ok) console.log(`${r.ok ? 'ok  ' : 'RATÉ'} ${r.kind.padEnd(9)} ${r.label.padEnd(12)} ${r.side === 'home' ? 'nous' : 'eux '} · instant décisif ${fmt(r.reveal)} · fin ${fmt(r.done)} · ballon ${r.ball}`);
const reveals = rows.filter((r) => r.reveal !== null).map((r) => r.reveal);
const dones = rows.filter((r) => r.done !== null).map((r) => r.done);
console.log(`${rows.length} temps forts · ${rows.filter((r) => !r.ok).length} raté(s) · instant décisif de ${fmt(Math.min(...reveals))} à ${fmt(Math.max(...reveals))} · fin de ${fmt(Math.min(...dones))} à ${fmt(Math.max(...dones))} (ralenti des buts compris)`);
await vite.close();
