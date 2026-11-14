import React, { useRef, useState } from 'react';
import { INSTR_KEYS, TACTICS, TACTIC_ORDER, formationOf, instructionsOf, tacticFrom } from '../game/tactics';
import { uiSound } from './uisound';
import { colon, t } from '../i18n/index';

// Tableau tactique de l'avant-match (1.0.34, demande du PDG du 12/11 : direction A, « tableau animé noir et or »).
// Les trois tactiques (tactics.js, TACTICS) deviennent des préréglages qui règlent d'un coup le pressing, la ligne
// défensive et la largeur : le tableau place l'équipe en conséquence, dessine la zone où elle presse, sa ligne
// défensive et ses courses, et tout glisse en place quand on change de plan ou de dispositif. Purement visuel : le
// match ne lit que l'identifiant de la tactique, inchangé (les ligues entre amis rejouent les mêmes journées).
// Jamais de chiffres pour ces réglages (PDG, 12/11) : des crans dorés et le mot du cran.

// crans de 1 (très bas) à 5 (très haut) : ceux du préréglage, ou ceux d'une tactique sur mesure (1.0.50, mode expert,
// tactics.js instructionsOf : les 7 consignes ; le tableau dessine le pressing, la ligne, la largeur, et les courses)
export const presetOf = (id) => instructionsOf(id);


const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Le bloc selon les crans (en %, attaque vers le haut, comme tactics.js FORMATIONS.pitch) : la ligne monte (les
// défenseurs de tout le décalage, les milieux des trois quarts, les attaquants de moitié moins) ou recule (les défenseurs,
// déjà bas sur le schéma, de moitié moins), le pressing pousse encore milieux et attaquants, la largeur écarte ou resserre
// l'équipe autour de l'axe ; le gardien avance un peu derrière une ligne haute. Au cran moyen (Équilibrée), le bloc est
// exactement le dispositif. Amplitudes mesurées (12/11) : dans les trois plans, les joueurs gardent au moins 91 % de leur
// taille au téléphone (ils ne se touchent jamais, lineup.jsx useChipScale).
const LINE = [10, 4, 0, -6, -12];
const roleOf = (i, [d, m]) => (i === 0 ? 'G' : i <= d ? 'D' : i <= d + m ? 'M' : 'A');
// un point du terrain (r : G, D, M ou A) déplacé comme le bloc ; aussi les cases libres de la grille (lineup.jsx, 1.0.41)
export function shapePoint([x, y], r, tactic) {
  const st = presetOf(tactic);
  const fx = 1 + (st.width - 3) * 0.05;
  const L = LINE[st.line - 1];
  if (r === 'G') return [x, L < 0 ? y + L / 4 : L > 0 ? y + 1.5 : y]; // derrière une ligne haute il avance, en bloc bas il reste sur sa ligne
  const k = { D: [L > 0 ? 0.5 : 1, 0], M: [L > 0 ? 0.55 : 0.75, 0.6], A: [0.45, 2.5] }[r];
  const kx = r === 'D' && fx < 1 ? 1 : fx; // un bloc resserré garde sa défense en largeur : milieux et attaquants rentrent
  return [clamp(50 + (x - 50) * kx, 4, 96), clamp(y + L * k[0] - (st.press - 3) * k[1], 4.5, 84)];
}
export function shapeOf(formation, tactic) {
  const f = formationOf(formation);
  return f.pitch.map((p, i) => shapePoint(p, roleOf(i, f.lines), tactic));
}
// les trois blocs d'un dispositif : la taille des joueurs du tableau (lineup.jsx, useChipScale) est celle où aucun ne
// touche son voisin dans aucun des trois, pour qu'elle ne change pas d'un plan à l'autre
export const shapesOf = (formation) => TACTIC_ORDER.map((id) => shapeOf(formation, id));

// Position d'un poste en pixels du terrain, exactement comme styles.css place les joueurs (.lu-chip) : terrain dressé
// (attaque vers le haut), ou couché dès que la composition est large (notre but à gauche, l'attaque vers la droite).
export const boardPx = ([x, y], W, H, wide) => (wide ? [W * (0.05 + (100 - y) * 0.009), H * (0.05 + x * 0.009)] : [W * (0.09 + x * 0.0082), H * (0.05 + y * 0.009)]);

// zone où l'équipe déclenche son pressing (en %, du but adverse vers le nôtre), selon le cran
const ZONE = [[50, 68], [36, 56], [22, 44], [8, 32], [3, 22]];

// Courses dessinées sur le tableau, d'après les consignes (1.0.50) : les joueurs de couloir montent quand l'équipe joue
// large (Offensive : latéraux projetés), les attaquants jaillissent en profondeur quand elle contre (Bloc bas), un long
// ballon part de la défense quand elle joue direct, l'axe relaie quand elle construit (Équilibrée : transitions
// maîtrisées). Trois flèches au plus.
function runsOf(formation, tactic, P) {
  const I = instructionsOf(tactic);
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
  const runs = [];
  if (I.width >= 4) runs.push({ a: L, to: at(L, 3, -26) }, { a: R, to: at(R, -3, -26) });
  if (I.counter >= 4 && runs.length < 3) {
    // les deux joueurs offensifs les plus excentrés jaillissent vers l'axe ; seul en pointe (4-2-3-1), ce sont les
    // meneurs des côtés
    const front = A.length > 1 ? A : [...M.filter((i) => P[i][1] < 40), ...A];
    const lo = front.reduce((a, i) => (P[i][0] < P[a][0] ? i : a));
    const hi = front.reduce((a, i) => (P[i][0] > P[a][0] ? i : a));
    runs.push({ a: lo, to: at(lo, 9, -20) });
    if (runs.length < 3) runs.push({ a: hi, to: at(hi, -9, -20) });
  }
  if (I.direct >= 4 && runs.length < 3) runs.push({ a: central(D), to: central(A), dash: true });
  if (runs.length < 3) runs.push({ a: central(M), to: central(A), dash: I.width >= 4 });
  if (runs.length < 3 && I.width <= 3) runs.push({ a: L, to: at(L, 0, -18), dash: true });
  if (runs.length < 3 && I.width <= 3) runs.push({ a: R, to: at(R, 0, -18), dash: true });
  return runs.slice(0, 3);
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

// Légende du tableau (1.0.55, « B · Tableau ») : le pressing (zone hachurée) et la ligne défensive (pointillés) nommés,
// juste au-dessus du terrain (sur le terrain, les étiquettes couvraient les plaques des joueurs)
export function BoardLegend({ tactic }) {
  const st = presetOf(tactic);
  return (
    <div className="tb-legend">
      <span className="zone"><i aria-hidden="true" />{LABELS.press} · {WORDS.press[st.press - 1]}</span>
      <span className="line"><i aria-hidden="true" />{LABELS.line} · {WORDS.line[st.line - 1]}</span>
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

// Mini-tableau (1.0.51) : au téléphone, le grand tableau est loin des curseurs ; ce petit terrain couché (notre but à
// gauche, l'attaque vers la droite) reste en vue au-dessus d'eux et montre, à chaque cran, le bloc, la zone de pressing
// et la ligne défensive, aux mêmes places que le grand tableau.
export function MiniBoard({ formation, tactic }) {
  const P = shapeOf(formation, tactic);
  const st = presetOf(tactic);
  const [z0, z1] = ZONE[st.press - 1];
  const [d] = formationOf(formation).lines;
  const X = (y) => (5 + (100 - y) * 0.9) * 2.2; // y du schéma (0 : but adverse) → abscisse du terrain couché
  const Y = (x) => 5 + x * 0.9;
  const deepest = Math.max(...P.slice(1, 1 + d).map((p) => p[1]));
  const lineX = X(deepest) - 7;
  return (
    <svg className="mini-board" viewBox="0 0 220 100" role="img" aria-label={t('Ton bloc selon tes consignes')}>
      <rect x="1" y="1" width="218" height="98" rx="2" className="mb-pitch" />
      <path d="M110 1V99M1 32H24V68H1M219 32H196V68H219" className="mb-mark" />
      <circle cx="110" cy="50" r="12" className="mb-mark" />
      <rect x={X(z1)} y="3" width={Math.max(4, X(z0) - X(z1))} height="94" className="mb-zone" />
      <line x1={lineX} y1="4" x2={lineX} y2="96" className="mb-line" />
      {P.map(([x, y], i) => <circle key={i} cx={X(y)} cy={Y(x)} r={i === 0 ? 3.6 : 4.4} className={i === 0 ? 'mb-gk' : 'mb-p'} />)}
    </svg>
  );
}

// Le mode expert (1.0.50, choix du PDG du 14/11 : les 7 consignes du moteur ; du 12/11 : un curseur doré à 5 crans,
// le mot du cran, jamais de chiffre, le tableau qui bouge en même temps). Les consignes vont par phase de jeu : sans
// ballon (pressing, ligne), avec ballon (largeur, tempo, jeu direct), aux transitions (à la récupération : contrer ou
// garder ; à la perte : contre-presser ou se replier). Un cran se touche, ou le curseur se fait glisser ; au clavier et
// à la manette, les flèches. Les trois plans sont des préréglages : régler un cran fait une tactique sur mesure.
const GROUPS = [
  { key: 'out', label: t('Sans ballon'), keys: ['press', 'line'] },
  { key: 'in', label: t('Avec ballon'), keys: ['width', 'tempo', 'direct'] },
  { key: 'tr', label: t('Transitions'), keys: ['counter', 'cpress'] },
];
const LABELS = {
  press: t('Pressing'), line: t('Ligne défensive'), width: t('Largeur'), tempo: t('Tempo'), direct: t('Jeu direct'),
  counter: t('À la récupération'), cpress: t('À la perte'),
};
const WORDS = {
  press: [t('Très bas'), t('Bas'), t('Moyen'), t('Haut'), t('Très haut')],
  line: [t('Très basse'), t('Basse'), t('Médiane'), t('Haute'), t('Très haute')],
  width: [t('Très étroite'), t('Étroite'), t('Normale'), t('Large'), t('Très large')],
  tempo: [t('Très lent'), t('Lent'), t('Normal', undefined, 'tempo'), t('Rapide'), t('Très rapide')],
  direct: [t('Très court'), t('Court'), t('Mixte'), t('Direct', undefined, 'jeu'), t('Très direct')],
  counter: [t('Garder le ballon'), t('Plutôt garder'), t('Selon l’occasion'), t('Contrer souvent'), t('Contrer toujours')],
  cpress: [t('Se replier'), t('Plutôt se replier'), t('Selon l’occasion', undefined, 'perte'), t('Contre-presser'), t('Contre-presser fort')],
};
export const instructionWord = (key, v) => WORDS[key][v - 1];
export const instructionLabel = (key) => LABELS[key];

// un curseur : le libellé et le mot du cran sur une ligne, les cinq crans dessous (toute la largeur, faciles à toucher)
function Notches({ k, v, onPick, compact }) {
  const ref = useRef(null);
  const drag = useRef(false);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const at = (x) => {
    const r = ref.current.getBoundingClientRect();
    let f = (x - r.left) / r.width;
    if (rtl) f = 1 - f;
    return Math.max(1, Math.min(5, Math.floor(f * 5) + 1));
  };
  const down = (e) => { drag.current = true; ref.current.setPointerCapture?.(e.pointerId); onPick(at(e.clientX)); };
  const move = (e) => { if (drag.current) onPick(at(e.clientX)); };
  const up = () => { drag.current = false; };
  const key = (e) => {
    const inc = rtl ? 'ArrowLeft' : 'ArrowRight';
    const dec = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === inc || e.key === 'ArrowUp') { e.preventDefault(); onPick(Math.min(5, v + 1)); } else if (e.key === dec || e.key === 'ArrowDown') { e.preventDefault(); onPick(Math.max(1, v - 1)); }
  };
  return (
    <div className={`xi-row ${compact ? 'compact' : ''}`}>
      <div className="xi-head"><span className={`xi-k ${k}`}>{LABELS[k]}</span><b>{WORDS[k][v - 1]}</b></div>
      <div
        ref={ref} className="xi-track" role="slider" tabIndex={0} aria-label={LABELS[k]} aria-valuemin={1} aria-valuemax={5} aria-valuenow={v} aria-valuetext={WORDS[k][v - 1]}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} data-noswipe=""
      >
        {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`${n <= v ? 'on' : ''} ${n === v ? 'at' : ''}`} />)}
      </div>
    </div>
  );
}

// tactic : le préréglage ou la tactique sur mesure ; onChange(id) reçoit la nouvelle tactique (préréglage si les crans en
// sont un). compact : la mi-temps et les plans de mi-temps (lignes plus serrées). carousel (1.0.55, « B · Tableau ») : au
// téléphone, une carte par phase de jeu qui glisse de côté, juste sous le terrain, et trois points pour s'y retrouver ;
// plus large, les trois cartes l'une sous l'autre.
export function TacticSliders({ tactic, onChange, compact = false, carousel = false, className = '' }) {
  const I = instructionsOf(tactic);
  const [page, setPage] = useState(0);
  const strip = useRef(null);
  const pick = (k, n) => {
    if (n === I[k]) return;
    uiSound(n > I[k] ? 'shift-up' : 'shift-down');
    onChange(tacticFrom({ ...I, [k]: n }));
  };
  const groups = GROUPS.map((g) => (
    <section key={g.key} className="xi-group" aria-label={g.label}>
      <h4 className="xi-gh">{g.label}</h4>
      {g.keys.map((k) => <Notches key={k} k={k} v={I[k]} onPick={(n) => pick(k, n)} compact={compact} />)}
    </section>
  ));
  if (!carousel) return <div className={`xi-sliders ${compact ? 'compact' : ''} ${className}`}>{groups}</div>;
  const onScroll = () => {
    const el = strip.current;
    const card = el?.firstElementChild;
    if (!card) return;
    const k = Math.round(Math.abs(el.scrollLeft) / (card.offsetWidth + 10));
    if (k !== page) setPage(Math.max(0, Math.min(GROUPS.length - 1, k)));
  };
  const go = (k) => strip.current?.children[k]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  return (
    <div className={`xi-carousel ${className}`}>
      <div ref={strip} className={`xi-sliders carousel ${compact ? 'compact' : ''}`} onScroll={onScroll} data-noswipe="">{groups}</div>
      <div className="xi-dots" role="tablist" aria-label={t('Consignes')}>
        {GROUPS.map((g, k) => <button key={g.key} type="button" role="tab" aria-selected={page === k} aria-label={g.label} className={page === k ? 'on' : ''} onClick={() => go(k)} />)}
      </div>
    </div>
  );
}

// Ce que règle le plan choisi, en lecture seule (écrans qui ne règlent rien) : un cran doré par niveau et le mot du cran
export function PresetGauges({ tactic }) {
  const st = presetOf(tactic);
  return (
    <div className="tb-gauges">
      {['press', 'line', 'width'].map((key) => (
        <div key={key} className="tb-gauge" role="img" aria-label={`${LABELS[key]}${colon()}${WORDS[key][st[key] - 1]}`}>
          <span className={`tb-gauge-k ${key}`}>{LABELS[key]}</span>
          <span className="tb-steps" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= st[key] ? 'on' : ''} />)}</span>
          <b>{WORDS[key][st[key] - 1]}</b>
        </div>
      ))}
    </div>
  );
}
export { INSTR_KEYS };
