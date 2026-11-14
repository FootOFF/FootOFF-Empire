// Moteur à zones (1.0.49) : calage analytique de la chaîne (sans tirage), sur des onze tirés comme ceux de l'ordinateur.
//   node tools/sim/zones.mjs [onze=1500]            mesures (profil ordinaire, volume, écart de niveau, types d'action)
//   ZONES='{"ch":0.03}' node tools/sim/zones.mjs    mêmes mesures avec des paramètres Z modifiés
// Cibles : celles du moteur d'avant (1.0.48) pour un match ordinaire : 1,15 but attendu par équipe sur terrain neutre
// (×1,06 à domicile), soit 3,83 occasions ; pente de l'écart de niveau 0,22 but par point ; types d'action de KINDS.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const Zm = await load('/src/game/zones.js');
const { makePlayer } = await load('/src/game/players.js');
const { slotsOf, formationOf } = await load('/src/game/tactics.js');
const { rnd } = await load('/src/game/utils.js');
if (process.env.ZONES) Object.assign(Zm.Z, JSON.parse(process.env.ZONES));

const N = Number(process.argv[2] || 1500);
const team = (formation, level) => slotsOf(formation).map((pos) => { const p = makePlayer({ level: level + rnd(-0.35, 0.35), pos }); p.id = Math.floor(Math.random() * 1e9); return p; });
const statOf = (players, formation, plan) => { const { eleven, keeper } = Zm.elevenOf(players, formation); return Zm.teamStatic(eleven, keeper, plan); };
const lvl = (players) => players.reduce((s, p) => s + Object.values(p.a).reduce((a, b) => a + b, 0) / 9, 0) / players.length;

// 1. profil ordinaire (BASE) : écart moyen de chaque profil brut au niveau du onze, en 4-3-3
const acc = Object.fromEntries(Zm.Q_KEYS.map((k) => [k, []]));
for (let i = 0; i < N; i++) {
  const st = statOf(team('433', rnd(0.5, 5)), '433', 'balanced');
  for (const k of Zm.Q_KEYS) acc[k].push(st.raw[k]);
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
console.log('profil (moyenne / écart type, cible 0) :', Zm.Q_KEYS.map((k) => `${k} ${mean(acc[k]).toFixed(2)}/${sd(acc[k]).toFixed(2)}`).join(' · '));

// 2. match ordinaire : deux onze de même niveau, Équilibrée, dispositifs de l'ordinateur
const OPP = [['433', 4], ['442', 3], ['4231', 3], ['352', 1], ['343', 1], ['532', 1]];
const drawF = () => { let r = Math.random() * 13; return (OPP.find(([, w]) => (r -= w) < 0) || OPP[0])[0]; };
const KIND_OLD = { through: 0.082, counter: 0.067, cutback: 0.067, cross: 0.174, combo: 0.141, scramble: 0.015, solo: 0.107, corner: 0.107, press: 0.037, long: 0.133, freekick: 0.067 };
function summary(pa, fa, plA, pb, fb, plB, { gap = 0, homeAdv = 1 } = {}) {
  const H = Zm.teamAt(statOf(pa, fa, plA), 10 + gap);
  const A = Zm.teamAt(statOf(pb, fb, plB), 10);
  const tables = Zm.buildTables(H, A, { homeAdv });
  const s = Zm.chainSummary(tables);
  return { s, H, A };
}
function kindMix(s, side, X, Y) {
  const mix = {};
  for (const [key, w] of Object.entries(s.bySrc[side])) {
    const [src, lane] = key.split(':');
    if (src === 'final') {
      const kw = Zm.kindWeights(X, Y, Number(lane));
      const tot = kw.reduce((a, [, x]) => a + x, 0);
      for (const [k, x] of kw) mix[k] = (mix[k] || 0) + (w * x) / tot;
    } else mix[src] = (mix[src] || 0) + w;
  }
  return mix;
}
const dur = 93; // minutes jouées en moyenne
let ch = [0, 0], poss = 0, q = [0, 0];
const mix = {};
const evs = {};
const th = [0, 0, 0];
for (let i = 0; i < N; i++) {
  const L = rnd(0.5, 5);
  const fa = drawF(), fb = drawF();
  const { s, H, A } = summary(team(fa, L), fa, 'balanced', team(fb, L), fb, 'balanced', { homeAdv: 0 });
  ch[0] += s.perMinute[0] * dur; ch[1] += s.perMinute[1] * dur; poss += s.possession;
  q[0] += Zm.qualityMean(s, 0, H, A);
  for (const [k, x] of Object.entries(s.events[0])) evs[k] = (evs[k] || 0) + x * dur;
  for (let t = 0; t < 3; t++) th[t] += s.thirds[0][t];
  const km = kindMix(s, 0, H, A);
  const tot = Object.values(km).reduce((a, b) => a + b, 0);
  for (const [k, x] of Object.entries(km)) mix[k] = (mix[k] || 0) + x / tot;
}
console.log(`terrain neutre, Équilibrée : occasions par équipe ${(ch[0] / N).toFixed(2)} / ${(ch[1] / N).toFixed(2)} (cible 3,83) · possession ${(100 * poss / N).toFixed(1)} % · qualité moyenne ${(q[0] / N).toFixed(3)}`);
console.log('par équipe et par match :', Object.entries(evs).map(([k, x]) => `${k} ${(x / N).toFixed(2)}`).join(' · '), '· tiers', th.map((x) => `${(100 * x / poss).toFixed(0)}%`).join('/'));
console.log('types d\'action (nouveau / avant) :', Object.keys(KIND_OLD).map((k) => `${k} ${((mix[k] || 0) / N).toFixed(3)}/${KIND_OLD[k]}`).join(' · '));
// 3. écart de niveau, à domicile : occasions de chaque camp (avant : 1,15 + 0,22 × écart, × 1,06 ; ÷ 0,3)
for (const gap of [-4, -2, -1, 0, 1, 2, 4]) {
  let a = 0, b = 0, ps = 0;
  const M = Math.max(200, N / 4);
  for (let i = 0; i < M; i++) {
    const L = rnd(1, 4);
    const fa = drawF(), fb = drawF();
    const { s } = summary(team(fa, L), fa, 'balanced', team(fb, L), fb, 'balanced', { gap });
    a += s.perMinute[0] * dur; b += s.perMinute[1] * dur; ps += s.possession;
  }
  const oldF = Math.min(3.6, Math.max(0.15, 1.15 + gap * 0.22)) * 1.06 / 0.3;
  const oldA = Math.min(3.6, Math.max(0.15, 1.15 - gap * 0.22)) / 1.06 / 0.3;
  console.log(`écart ${gap > 0 ? '+' : ''}${gap} : occasions ${(a / M).toFixed(2)} – ${(b / M).toFixed(2)} (avant ${oldF.toFixed(2)} – ${oldA.toFixed(2)}) · possession ${(100 * ps / M).toFixed(1)} %`);
}
// 4. plans contre plans, même onze ordinaire, même niveau, terrain neutre
const PL = ['offensive', 'balanced', 'low'];
const grid = PL.map(() => PL.map(() => [0, 0, 0]));
for (let i = 0; i < Math.max(300, N / 3); i++) {
  const L = rnd(1, 4);
  const pa = team('433', L), pb = team('433', L);
  PL.forEach((x, a) => PL.forEach((y, b) => {
    const { s } = summary(pa, '433', x, pb, '433', y, { homeAdv: 0 });
    grid[a][b][0] += s.perMinute[0] * dur; grid[a][b][1] += s.perMinute[1] * dur; grid[a][b][2] += s.possession;
  }));
}
const M4 = Math.max(300, N / 3);
console.log('plans (ligne : nous, colonne : eux) — occasions pour – contre · possession');
PL.forEach((x, a) => console.log(`  ${x.padEnd(9)} ` + PL.map((y, b) => `${y}: ${(grid[a][b][0] / M4).toFixed(2)}–${(grid[a][b][1] / M4).toFixed(2)} ${(100 * grid[a][b][2] / M4).toFixed(0)}%`).join(' · ')));
// 5. dispositifs, Équilibrée contre un 4-3-3 Équilibrée
const FS = ['433', '442', '4231', '352', '343', '532'];
const line = [];
for (const f of FS) {
  let a = 0, b = 0, ps = 0;
  const M = Math.max(200, N / 5);
  for (let i = 0; i < M; i++) {
    const L = rnd(1, 4);
    const { s } = summary(team(f, L), f, 'balanced', team('433', L), '433', 'balanced', { homeAdv: 0 });
    a += s.perMinute[0] * dur; b += s.perMinute[1] * dur; ps += s.possession;
  }
  line.push(`${formationOf(f).name} ${(a / M).toFixed(2)}–${(b / M).toFixed(2)} ${(100 * ps / M).toFixed(0)}%`);
}
console.log('dispositifs contre 4-3-3 :', line.join(' · '));
// 6. le plan qui colle aux joueurs : pour des onze tirés au hasard (profils naturels), écart d'occasions (pour − contre)
// de chaque plan contre un adversaire ordinaire en Équilibrée ; gain du meilleur plan sur « toujours Équilibrée »
{
  const M = Math.max(400, N / 2);
  let gain = 0, spread = 0;
  const best = { offensive: 0, balanced: 0, low: 0 };
  const corr = { offensive: {}, low: {} };
  const rows = [];
  for (let i = 0; i < M; i++) {
    const L = rnd(1, 4);
    const pa = team('433', L), pb = team('433', L);
    const net = {};
    let st;
    for (const x of PL) {
      const { s, H } = summary(pa, '433', x, pb, '433', 'balanced', { homeAdv: 0 });
      st = H.Q;
      net[x] = (s.perMinute[0] - s.perMinute[1]) * dur;
    }
    const b = PL.reduce((a, x) => (net[x] > net[a] ? x : a), 'balanced');
    best[b]++;
    gain += net[b] - net.balanced;
    spread += Math.max(...PL.map((x) => net[x])) - Math.min(...PL.map((x) => net[x]));
    rows.push({ Q: st, d: net });
  }
  console.log(`plan le mieux accordé : gain moyen ${(gain / M).toFixed(3)} occasion nette par match sur « toujours Équilibrée » · écart meilleur − pire ${(spread / M).toFixed(3)} · meilleur plan : ${Object.entries(best).map(([k, x]) => `${k} ${(100 * x / M).toFixed(0)}%`).join(' · ')}`);
  // ce qui fait préférer l'Offensive ou le Bloc bas : corrélation de chaque profil avec l'avantage de ce plan sur l'Équilibrée
  const cor = (xs, ys) => { const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return a / Math.sqrt(b * c || 1); };
  for (const x of ['offensive', 'low']) {
    const ys = rows.map((r) => r.d[x] - r.d.balanced);
    console.log(`  ${x} − Équilibrée (moy. ${mean(ys).toFixed(3)}, écart type ${sd(ys).toFixed(3)}) :`, Zm.Q_KEYS.map((k) => `${k} ${cor(rows.map((r) => r.Q[k]), ys).toFixed(2)}`).join(' · '));
  }
}
await vite.close();
