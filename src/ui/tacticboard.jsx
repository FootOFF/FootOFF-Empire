import React from 'react';
import { TACTICS, TACTIC_ORDER, formationOf } from '../game/tactics';
import { colon, t } from '../i18n/index';

// Tableau tactique de l'avant-match (1.0.34, demande du PDG du 12/11 : direction A, « tableau animé noir et or »).
// Les trois tactiques (tactics.js, TACTICS) deviennent des préréglages qui règlent d'un coup le pressing, la ligne
// défensive et la largeur : le tableau place l'équipe en conséquence, dessine la zone où elle presse, sa ligne
// défensive et ses courses, et tout glisse en place quand on change de plan ou de dispositif. Purement visuel : le
// match ne lit que l'identifiant de la tactique, inchangé (les ligues entre amis rejouent les mêmes journées).
// Jamais de chiffres pour ces réglages (PDG, 12/11) : des crans dorés et le mot du cran.

// crans de 1 (très bas) à 5 (très haut) ; le mode expert (après le championnat) réglera chacun
export const PRESETS = Object.assign(Object.create(null), {
  offensive: { press: 4, line: 4, width: 4 },
  balanced: { press: 3, line: 3, width: 3 },
  low: { press: 2, line: 2, width: 2 },
});
export const presetOf = (id) => PRESETS[id] || PRESETS.balanced;

const LEVEL_KEYS = ['press', 'line', 'width'];
const levelLabel = (key) => (key === 'press' ? t('Pressing') : key === 'line' ? t('Ligne défensive') : t('Largeur'));
// mots des crans, accordés au réglage (le pressing, la ligne, la largeur)
const levelWords = (key) => (key === 'press' ? [t('Très bas'), t('Bas'), t('Moyen'), t('Haut'), t('Très haut')]
  : key === 'line' ? [t('Très basse'), t('Basse'), t('Médiane'), t('Haute'), t('Très haute')]
    : [t('Très étroite'), t('Étroite'), t('Normale'), t('Large'), t('Très large')]);
const levelWord = (key, v) => levelWords(key)[v - 1];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Le bloc selon les crans (en %, attaque vers le haut, comme tactics.js FORMATIONS.pitch) : la ligne monte (les
// défenseurs de tout le décalage, les milieux des trois quarts, les attaquants de moitié moins) ou recule (les défenseurs,
// déjà bas sur le schéma, de moitié moins), le pressing pousse encore milieux et attaquants, la largeur écarte ou resserre
// l'équipe autour de l'axe ; le gardien avance un peu derrière une ligne haute. Au cran moyen (Équilibrée), le bloc est
// exactement le dispositif. Amplitudes mesurées (12/11) : dans les trois plans, les joueurs gardent au moins 91 % de leur
// taille au téléphone (ils ne se touchent jamais, lineup.jsx useChipScale).
const LINE = [10, 4, 0, -6, -12];
const roleOf = (i, [d, m]) => (i === 0 ? 'G' : i <= d ? 'D' : i <= d + m ? 'M' : 'A');
export function shapeOf(formation, tactic) {
  const f = formationOf(formation);
  const st = presetOf(tactic);
  const fx = 1 + (st.width - 3) * 0.05;
  const L = LINE[st.line - 1];
  return f.pitch.map(([x, y], i) => {
    const r = roleOf(i, f.lines);
    if (r === 'G') return [x, L < 0 ? y + L / 4 : L > 0 ? y + 1.5 : y]; // derrière une ligne haute il avance, en bloc bas il reste sur sa ligne
    const k = { D: [L > 0 ? 0.5 : 1, 0], M: [L > 0 ? 0.55 : 0.75, 0.6], A: [0.45, 2.5] }[r];
    const kx = r === 'D' && fx < 1 ? 1 : fx; // un bloc resserré garde sa défense en largeur : milieux et attaquants rentrent
    return [clamp(50 + (x - 50) * kx, 4, 96), clamp(y + L * k[0] - (st.press - 3) * k[1], 4.5, 84)];
  });
}
// les trois blocs d'un dispositif : la taille des joueurs du tableau (lineup.jsx, useChipScale) est celle où aucun ne
// touche son voisin dans aucun des trois, pour qu'elle ne change pas d'un plan à l'autre
export const shapesOf = (formation) => TACTIC_ORDER.map((id) => shapeOf(formation, id));

// Position d'un poste en pixels du terrain, exactement comme styles.css place les joueurs (.lu-chip) : terrain dressé
// (attaque vers le haut), ou couché dès que la composition est large (notre but à gauche, l'attaque vers la droite).
export const boardPx = ([x, y], W, H, wide) => (wide ? [W * (0.05 + (100 - y) * 0.009), H * (0.05 + x * 0.009)] : [W * (0.09 + x * 0.0082), H * (0.05 + y * 0.009)]);

// zone où l'équipe déclenche son pressing (en %, du but adverse vers le nôtre), selon le cran
const ZONE = [[50, 68], [36, 56], [22, 44], [8, 32], [3, 22]];

// Courses dessinées sur le tableau : les joueurs de couloir montent (Offensive : latéraux projetés), l'axe relaie
// (Équilibrée : transitions maîtrisées), les attaquants jaillissent en profondeur (Bloc bas : les contres).
function runsOf(formation, tactic, P) {
  const f = formationOf(formation);
  const [d, m] = f.lines;
  const idx = (from, n) => Array.from({ length: n }, (_, k) => from + k);
  const D = idx(1, d);
  const M = idx(1 + d, m);
  const A = idx(1 + d + m, 10 - d - m);
  const central = (L) => L.reduce((a, i) => (Math.abs(P[i][0] - 50) < Math.abs(P[a][0] - 50) ? i : a));
  // couloirs : le joueur de champ le plus excentré de chaque côté (à égalité, le plus bas : le latéral)
  const side = (s) => [...D, ...M].reduce((a, i) => {
    const da = s * (P[a][0] - 50);
    const di = s * (P[i][0] - 50);
    return di > da + 0.5 || (Math.abs(di - da) <= 0.5 && P[i][1] > P[a][1]) ? i : a;
  });
  const at = (i, dx, dy) => [clamp(P[i][0] + dx, 4, 96), clamp(P[i][1] + dy, 3, 95)];
  const L = side(-1);
  const R = side(1);
  // a : le joueur qui court ; to : le point visé, ou le joueur visé (nombre)
  if (tactic === 'offensive') {
    return [
      { a: L, to: at(L, 3, -26) },
      { a: R, to: at(R, -3, -26) },
      { a: central(M), to: central(A), dash: true },
    ];
  }
  if (tactic === 'low') {
    // les deux joueurs offensifs les plus excentrés jaillissent vers l'axe ; seul en pointe (4-2-3-1), ce sont les
    // meneurs des côtés
    const front = A.length > 1 ? A : [...M.filter((i) => P[i][1] < 40), ...A];
    const lo = front.reduce((a, i) => (P[i][0] < P[a][0] ? i : a));
    const hi = front.reduce((a, i) => (P[i][0] > P[a][0] ? i : a));
    return [
      { a: lo, to: at(lo, 9, -20) },
      { a: hi, to: at(hi, -9, -20) },
    ];
  }
  return [
    { a: central(M), to: central(A) },
    { a: L, to: at(L, 0, -18), dash: true },
    { a: R, to: at(R, 0, -18), dash: true },
  ];
}

// Ce que le tableau dessine sous les joueurs : la zone de pressing (hachures dorées), la ligne défensive (pointillés),
// les courses (flèches qui se tracent une fois l'équipe en place). box : taille du terrain en pixels et forme d'un
// joueur à l'échelle (lineup.jsx, useChipScale). Relecture de la charte (12/11) : une course part du bord du portrait
// (jamais de la note), garde au moins 28 px de trait visible, et s'arrête devant le joueur visé (sa pointe n'est jamais
// cachée par ses plaques) ; la ligne défensive passe sous les plaques des défenseurs, au-dessus du gardien.
const RUN_MIN = 28;
export function BoardMarks({ formation, tactic, P, box }) {
  if (!box?.geo) return null;
  const { W, H, wide, geo } = box;
  const { faceDy, faceR, halfH, halfW } = geo;
  const st = presetOf(tactic);
  const [z0, z1] = ZONE[st.press - 1];
  const zone = wide
    ? { left: W * (0.05 + (100 - z1) * 0.009), width: W * (z1 - z0) * 0.009, top: 14, height: H - 28 }
    : { top: H * (0.05 + z0 * 0.009), height: H * (z1 - z0) * 0.009, left: 12, width: W - 24 };
  const [d] = formationOf(formation).lines;
  const px = P.map((p) => boardPx(p, W, H, wide));
  const defs = px.slice(1, 1 + d);
  const gk = px[0];
  let line;
  if (wide) { // couché : juste derrière les défenseurs (vers notre but, à gauche), devant le gardien
    const x = Math.max(Math.min(...defs.map((p) => p[0])) - halfW - 4, gk[0] + halfW + 4);
    line = { left: x, top: 14, height: H - 28 };
  } else { // dressé : sous les plaques du défenseur le plus bas, au-dessus du portrait du gardien
    const y = Math.min(Math.max(...defs.map((p) => p[1])) + halfH + 3, gk[1] + faceDy - faceR - 10); // anneau doré du gardien compris
    line = { top: y, left: 12, width: W - 24 };
  }
  const runs = runsOf(formation, tactic, P).map(({ a, to, dash }) => {
    const head = [px[a][0], px[a][1] + faceDy]; // centre du portrait du coureur
    const toPlayer = typeof to === 'number';
    const goal = toPlayer ? [px[to][0], px[to][1] + faceDy] : boardPx(to, W, H, wide);
    let dx = goal[0] - head[0];
    let dy = goal[1] - head[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const s0 = faceR + 3; // part du bord du portrait
    // une course qui part vers le bas à droite partirait de la note (en bas à droite du portrait) : elle part plus haut
    if (dx > 0.3 && dy > 0.1) head[1] -= faceR * 0.55;
    let end = len - 2;
    if (toPlayer) { // s'arrête au bord du joueur visé (ses plaques comprises), à 5 px
      const c = [px[to][0], px[to][1]];
      // distance, le long de la course, jusqu'à l'entrée dans le rectangle du joueur visé
      const tx = Math.abs(dx) > 1e-6 ? [(c[0] - halfW - head[0]) / dx, (c[0] + halfW - head[0]) / dx].sort((u, v) => u - v) : [-Infinity, Infinity];
      const ty = Math.abs(dy) > 1e-6 ? [(c[1] - halfH - head[1]) / dy, (c[1] + halfH - head[1]) / dy].sort((u, v) => u - v) : [-Infinity, Infinity];
      end = Math.max(tx[0], ty[0]) - 5;
    }
    end = Math.max(end, s0 + RUN_MIN); // toujours un trait visible
    return { dash, left: head[0] + dx * s0, top: head[1] + dy * s0, width: end - s0, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
  });
  return (
    <div className={`tb-marks ${wide ? 'wide' : ''}`} aria-hidden="true">
      <i className={`tb-zone p${st.press}`} style={zone} />
      <i className="tb-line" style={line} />
      {runs.map((r, k) => (
        // une clé par plan : les flèches d'un nouveau plan se tracent ; celles du même plan suivent un changement de dispositif
        <i key={`${tactic}-${k}`} className={`tb-run ${r.dash ? 'dash' : ''}`} style={{ left: r.left, top: r.top, width: r.width, transform: `rotate(${r.deg.toFixed(1)}deg)` }}><b /></i>
      ))}
    </div>
  );
}

// Pictogramme d'un plan (relecture de la charte : lisible à 20 px) : le bloc en trois barres, haut et large pour
// Offensive, au milieu pour Équilibrée, bas et serré pour Bloc bas, de part et d'autre de la ligne médiane
const GLYPH = {
  offensive: [[8, 4, 36], [16, 7, 33], [24, 10, 30]],
  balanced: [[14, 6, 34], [22, 9, 31], [30, 12, 28]],
  low: [[21, 10, 30], [27, 12, 28], [33, 14, 26]],
};
function PresetGlyph({ id }) {
  return (
    <svg className="tb-glyph" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M2 20h36" className="tb-g-mid" />
      {(GLYPH[id] || GLYPH.balanced).map(([y, x0, x1]) => <path key={y} d={`M${x0} ${y}H${x1}`} className="tb-g-row" />)}
    </svg>
  );
}

// Les trois plans en grands boutons (le choisi en or), sous le tableau
export function PresetPicker({ value, onChange }) {
  return (
    <div className="presets" role="radiogroup" aria-label={t('Plan de jeu')}>
      {TACTIC_ORDER.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <PresetGlyph id={id} />
          <strong>{TACTICS[id].name}</strong>
        </button>
      ))}
    </div>
  );
}

// Ce que règle le plan choisi : un cran doré par niveau et le mot du cran ; le pictogramme de chaque ligne est celui du
// tableau (hachures du pressing, pointillés de la ligne, écart de la largeur)
export function PresetGauges({ tactic }) {
  const st = presetOf(tactic);
  return (
    <div className="tb-gauges">
      {LEVEL_KEYS.map((key) => (
        <div key={key} className="tb-gauge" role="img" aria-label={`${levelLabel(key)}${colon()}${levelWord(key, st[key])}`}>
          <span className={`tb-gauge-k ${key}`}>{levelLabel(key)}</span>
          <span className="tb-steps" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= st[key] ? 'on' : ''} />)}</span>
          <b>{levelWord(key, st[key])}</b>
        </div>
      ))}
    </div>
  );
}
