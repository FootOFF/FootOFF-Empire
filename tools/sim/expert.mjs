// Mode expert (1.0.50) : ce que rapporte une tactique sur mesure, réglée cran par cran pour son onze, face au meilleur des
// trois préréglages et à « toujours Équilibrée » ; et qu'aucun réglage ne gagne partout (pas de tactique miracle).
// Mesure analytique (chaîne du moteur à zones, sans tirage), contre un adversaire ordinaire de même niveau.
//   node tools/sim/expert.mjs [onze=150]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const Zm = await load('/src/game/zones.js');
const { INSTR_KEYS, PLAN_PRESETS, TACTIC_ORDER, tacticFrom } = await load('/src/game/tactics.js');
const { makePlayer } = await load('/src/game/players.js');
const { slotsOf } = await load('/src/game/tactics.js');
const { rnd } = await load('/src/game/utils.js');
if (process.env.ZONES) Object.assign(Zm.Z, JSON.parse(process.env.ZONES));

const N = Number(process.argv[2] || 150);
const team = (f, L) => slotsOf(f).map((pos) => { const p = makePlayer({ level: L + rnd(-0.35, 0.35), pos }); p.id = Math.floor(Math.random() * 1e9); return p; });
const value = (pl, f, instr) => Zm.planValue(pl, f, tacticFrom(instr));
const best = { gainPreset: 0, gainBalanced: 0, count: {} };
const tally = Object.fromEntries(INSTR_KEYS.map((k) => [k, [0, 0, 0, 0, 0]]));
for (let i = 0; i < N; i++) {
  const pl = team('433', rnd(1, 4));
  const pv = Object.fromEntries(TACTIC_ORDER.map((id) => [id, Zm.planValue(pl, '433', id)]));
  const bestPreset = TACTIC_ORDER.reduce((a, b) => (pv[b] > pv[a] ? b : a));
  // montée cran par cran depuis le meilleur préréglage
  let cur = { ...PLAN_PRESETS[bestPreset] };
  let v = pv[bestPreset];
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const k of INSTR_KEYS) {
      for (const n of [1, 2, 3, 4, 5]) {
        if (n === cur[k]) continue;
        const next = { ...cur, [k]: n };
        const w = value(pl, '433', next);
        if (w > v + 1e-6) { v = w; cur = next; moved = true; }
      }
    }
    if (!moved) break;
  }
  best.gainPreset += v - pv[bestPreset];
  best.gainBalanced += v - pv.balanced;
  for (const k of INSTR_KEYS) tally[k][cur[k] - 1]++;
}
console.log(`${N} onze : tactique sur mesure optimale +${(best.gainPreset / N).toFixed(2)} occasion nette par match sur le meilleur préréglage, +${(best.gainBalanced / N).toFixed(2)} sur « toujours Équilibrée »`);
console.log('cran retenu pour chaque consigne (1 → 5) :', INSTR_KEYS.map((k) => `${k} ${tally[k].join('/')}`).join(' · '));
await vite.close();
