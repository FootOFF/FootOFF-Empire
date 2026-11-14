import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { POS_LABELS } from '../game/constants';
import { absenceOf, available, fitFactor, fitOf, playerRating, ratingAt } from '../game/players';
import { FORMATIONS, FORMATION_ORDER, FRESH_FIT, autoLineup, fitWeight, formationOf, freshLineup, lineupRating, postsOf, ratingAtSlot, reshapeLineup, restWeight, rotateLineup, slotsOf } from '../game/tactics';
import { ALL_CELLS, POST_LINE, POST_NAMES, POST_SHORT, cellPitch, gridFormation, gridId, ratingAtPost, typeOf, usable } from '../game/posts';
import { fmtRating } from './format';
import { RatingBadge } from './kit';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { Portrait } from './portrait';
import { IconCheck } from './icons';
import { comma, t, tn, tr } from '../i18n/index';
import { useFitText } from './fittext';
import { BoardLegend, BoardMarks, boardPx, shapeOf, shapePoint, shapesOf } from './tacticboard';
import { RoleSheet, rolesAt } from './roles';

// Composition interactive, la même partout (onglet Composition de l'Effectif, avant-match, mi-temps) : le terrain
// avec le onze à ses postes (portrait, note au poste, nom, condition), le banc en cartes en dessous. Le terrain se
// couche quand la place le permet (PC : notre but à gauche, l'attaque vers la droite) et se dresse sinon (téléphone :
// l'attaque vers le haut) ; c'est la largeur de la composition qui décide (styles.css, @container lu). On glisse un joueur sur un poste ou sur un coéquipier pour les
// échanger, ou on touche un joueur puis un autre. Quand un joueur est choisi, chaque poste affiche la note qu'il y
// aurait (vert s'il y ferait mieux que l'actuel, rouge sinon). À la mi-temps (maxIn), seuls quelques remplaçants
// peuvent entrer et les expulsés restent figés.
// Au doigt, un joueur du terrain se saisit tout de suite ; sur le banc (qui défile), il faut le maintenir un
// instant, sinon le geste fait défiler la page.
// Blessés et suspendus (players.js, available) restent sur le banc, grisés : ils ne peuvent pas entrer. En match, un
// blessé encore sur le terrain (hurt) ne peut qu'être remplacé ; un joueur sorti (unavailable) ne revient pas. La barre
// sous chaque joueur est sa condition physique (fitness : condition à l'instant du match).

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const HOLD_MS = 170;
const lastOf = (n) => n.split(' ').slice(1).join(' ') || n;

// Terrain couché dès que la composition a cette largeur (styles.css, @container lu : même seuil).
const WIDE = 480;

// Taille des joueurs du terrain : la plus grande pour laquelle aucun ne touche son voisin, selon la taille du terrain,
// la formation (un 3-5-2 serre ses joueurs plus qu'un 4-3-3) et la vraie forme de chaque joueur : portrait et note, nom
// à sa longueur, condition. Les postes sont placés comme dans styles.css (.lu-chip) ; l'échelle agrandit chaque joueur
// autour de son poste. Entre 0,6 (petit terrain) et 1,3 (grand écran) ; posée sur le terrain en --lu-s.
const GAP = 3; // px d'écart minimal entre deux joueurs
function chipParts(chip) { // rectangles du joueur, sans l'échelle, centrés sur son poste
  const cx = chip.offsetWidth / 2;
  const cy = chip.offsetHeight / 2;
  const rects = [];
  const add = (x, y, w, h) => { if (w && h) rects.push([x - cx, y - cy, w, h]); };
  const face = chip.querySelector('.lu-face');
  if (face) {
    add(face.offsetLeft, face.offsetTop, face.offsetWidth, face.offsetHeight);
    for (const b of face.querySelectorAll('.lu-rate, .lu-note, .lu-flag, .lu-hurt, .lu-alt')) add(face.offsetLeft + b.offsetLeft, face.offsetTop + b.offsetTop, b.offsetWidth, b.offsetHeight);
  }
  // l'étiquette du mode Rôles compte aussi (relecture 1.0.55 : au PC, elle passait sous le portrait du voisin ; au
  // téléphone, trois étiquettes d'une même ligne se touchaient)
  for (const b of chip.querySelectorAll(':scope > .lu-name, :scope > .lu-fit, :scope > .lu-role')) add(b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight);
  return rects;
}
function clashes(a, pa, b, pb, s) {
  for (const [ax, ay, aw, ah] of pa) {
    for (const [bx, by, bw, bh] of pb) {
      const x1 = a[0] + ax * s;
      const y1 = a[1] + ay * s;
      const x2 = b[0] + bx * s;
      const y2 = b[1] + by * s;
      if (x1 < x2 + bw * s + GAP && x2 < x1 + aw * s + GAP && y1 < y2 + bh * s + GAP && y2 < y1 + ah * s + GAP) return true;
    }
  }
  return false;
}
// Dispositif libre (1.0.41) : deux joueurs d'un même couloir sur des rangées voisines de la grille (milieu défensif et
// milieu dans l'axe, latéral et piston, milieu offensif et attaquant sur un côté) seraient trop près l'un de l'autre au
// téléphone ; sur le tableau seulement, ils s'écartent jusqu'à LANE_GAP (en % du terrain). Les six dispositifs tout faits
// n'ont aucune paire si proche : leur dessin ne change pas. Le moteur et la 3D gardent les postes de la grille.
const LANE_GAP = 13; // 13 : le 4-2-3-1 en Offensive et en Bloc bas a une paire à 13,1, il ne bouge pas
export function spreadLanes(P) {
  const out = P.map(([x, y]) => [x, y]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const [a, b] = [out[i], out[j]];
        const dy = Math.abs(a[1] - b[1]);
        if (Math.abs(a[0] - b[0]) >= 9 || dy >= LANE_GAP) continue;
        const d = (LANE_GAP - dy) / 2;
        const [hi, lo] = a[1] <= b[1] ? [a, b] : [b, a];
        hi[1] = Math.max(4.5, hi[1] - d);
        lo[1] = Math.min(84, lo[1] + d);
      }
    }
  }
  return out;
}
// sets : les jeux de postes à respecter (le dispositif ; au tableau tactique, ses trois blocs, 1.0.34, pour que la taille
// ne change pas d'un plan à l'autre). onBox(W, H, wide, geo) : la taille du terrain et la forme d'un joueur à l'échelle
// (geo : centre et rayon du portrait, demi-hauteur et demi-largeur du joueur, depuis son centre), pour ce qu'on dessine.
function useChipScale(pitchRef, rootRef, sets, key, onBox) {
  useLayoutEffect(() => {
    const el = pitchRef.current;
    const root = rootRef.current;
    if (!el || !root) return undefined;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const wide = root.clientWidth >= WIDE;
      const chips = [...el.querySelectorAll('.lu-chip')];
      if (chips.length !== sets[0].length || !W || !H) { onBox?.(W, H, wide, null); return; }
      const ptsSets = sets.map((set) => set.map((p) => boardPx(p, W, H, wide)));
      el.classList.remove('lu-tight');
      let parts = chips.map(chipParts);
      const ok = (s) => {
        for (const pts of ptsSets) for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (clashes(pts[i], parts[i], pts[j], parts[j], s)) return false;
        return true;
      };
      const search = () => {
        let lo = 0.6;
        let hi = 1.3;
        if (ok(hi)) return hi;
        for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
        return lo;
      };
      let lo = search();
      if (!ok(lo)) { el.classList.add('lu-tight'); parts = chips.map(chipParts); lo = search(); }
      el.style.setProperty('--lu-s', lo.toFixed(3));
      if (onBox) {
        const c = chips[0];
        const f = c.querySelector('.lu-face');
        const r = (v) => Math.round(v * lo * 10) / 10;
        onBox(W, H, wide, f && {
          faceDy: r(f.offsetTop + f.offsetHeight / 2 - c.offsetHeight / 2), faceR: r(f.offsetWidth / 2),
          halfH: r(c.offsetHeight / 2), halfW: r(c.offsetWidth / 2),
        });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(root);
    return () => ro.disconnect();
  }, [pitchRef, rootRef, sets, key, onBox]);
}

// noms courts lisibles : « Joubert », ou « F. Joubert » quand deux joueurs portent le même nom
export function displayNames(players) {
  const count = {};
  for (const p of players) { const l = lastOf(p.name); count[l] = (count[l] || 0) + 1; }
  return Object.fromEntries(players.map((p) => {
    const l = lastOf(p.name);
    return [p.id, count[l] > 1 ? `${p.name[0]}. ${l}` : l];
  }));
}

// Dispositif : six formations ; leur effet se lit dans leur description, sans chiffre (1.0.34, décision du PDG)
export function FormationPicker({ value, onChange }) {
  const own = gridFormation(value); // dispositif libre (1.0.41) : en tête, choisi
  return (
    <div className="formations" role="radiogroup" aria-label={t('Dispositif')}>
      {own && (
        <button role="radio" aria-checked="true" className="active own" onClick={() => onChange(value)} title={t('Ton dispositif, poste par poste.')}>
          <strong>{own.name}</strong><em>{t('Libre', undefined, 'dispositif')}</em>
        </button>
      )}
      {FORMATION_ORDER.map((id) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <strong>{FORMATIONS[id].name}</strong>
        </button>
      ))}
    </div>
  );
}

// Trois boutons de composition (0.8.5, demande du PDG), toujours visibles :
//  - « Meilleur onze » : les meilleures notes, sans regarder la condition ;
//  - « Onze frais » (0.8.8, « Onze en forme » avant) : les meilleurs joueurs à 80 % de condition ou plus, niveau et
//    condition réunis ; un joueur fatigué seulement si personne de frais ne tient son poste (tactics.js, freshLineup) ;
//  - « Faire tourner » : les remplaçants du dernier match jouent (tactics.js, rotateLineup).
// Chacun dit ce qu'il change (+0,4 de niveau, ou le nombre de joueurs qui entrent), ou que le onze y est déjà.
const changed = (a, b) => a.filter((id, k) => id !== null && !b.includes(id) && id !== b[k]).length;
function LineupAction({ next, lineup, onApply, label, done, gain = null, title, className = '' }) {
  const n = changed(next, lineup);
  if (!n && next.every((id, k) => id === lineup[k])) return <span className={`lu-best done ${className}`} title={title}><IconCheck />{done}</span>;
  return (
    <button className={`lu-best ${className}`} title={title} onClick={() => { haptic('tap'); onApply(next); }}>
      {label}{gain !== null ? gain >= 0.05 && <b>+{fmtRating(gain)}</b> : n > 0 && <b>{n}</b>}
    </button>
  );
}
export function BestEleven({ players, lineup, formation, onApply }) {
  const best = useMemo(() => autoLineup(players, formation, restWeight), [players, formation]);
  const gain = lineupRating(players, best, formation) - lineupRating(players, lineup, formation);
  return <LineupAction next={best} lineup={lineup} onApply={onApply} label={t('Meilleur onze')} done={t('Meilleur onze')} gain={gain} title={t('Les meilleures notes, sans regarder la condition physique')} />;
}
export function FitEleven({ players, lineup, formation, onApply }) {
  const best = useMemo(() => freshLineup(players, formation), [players, formation]);
  const n = changed(best, lineup);
  return <LineupAction next={best} lineup={lineup} onApply={onApply} label={t('Onze frais')} done={t('Onze frais')} gain={n ? null : 0} className="lu-fresh" title={t('Les meilleurs joueurs à {FRESH_FIT} % de condition physique ou plus ; un joueur fatigué seulement si personne de frais ne tient son poste', { FRESH_FIT })} />;
}

// Niveau d'un onze tel qu'il jouera, condition comprise (comme le pronostic et le match), avec ce que la fatigue lui
// retire (avant-match, onglet Composition). La forme ne pèse plus en match (0.8.8).
export function levelOf(players, lineup, formation) {
  const rating = lineupRating(players, lineup, formation, fitWeight);
  const rested = lineupRating(players, lineup, formation);
  return { rating, rested, tired: rested - rating >= 0.05 ? rested - rating : 0 };
}
export function LevelReadout({ level }) {
  const { rating, rested, tired } = level;
  return (
    <span className="pm-level">{tr('Niveau <0/><1/>', [<b>{fmtRating(rating)}</b>, tired > 0 && <em className="pm-tired" title={t('{fmtRating} au repos', { fmtRating: fmtRating(rested) })}>{tr('fatigue −<0/>', [fmtRating(tired)])}</em>])}</span>
  );
}

// last : le onze de départ du dernier match (sans dernier match : le onze actuel)
export function RotateButton({ players, lineup, last, formation, onApply }) {
  const ref = last?.length ? last : lineup;
  const next = useMemo(() => rotateLineup(players, ref, formation), [players, ref, formation]);
  return <LineupAction next={next} lineup={lineup} onApply={onApply} label={t('Faire tourner')} done={t('Rotation en place')} className="lu-rotate" title={t('Les remplaçants du dernier match jouent, complétés par les titulaires les plus reposés')} />;
}
// Les trois boutons ensemble (avant-match, onglet Composition)
export function LineupActions({ state, lineup, formation, onApply }) {
  return (
    <span className="lu-acts">
      <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={onApply} />
      <FitEleven players={state.players} lineup={lineup} formation={formation} onApply={onApply} />
      <RotateButton players={state.players} lineup={lineup} last={state.lastMatch?.lineup} formation={formation} onApply={onApply} />
    </span>
  );
}

// Condition physique sous le nom : la barre et le pourcentage, toujours (vert, ambre sous 75 %, rouge sous 50 %).
const FIT_TONE = (f) => (f >= 75 ? 'good' : f >= 50 ? 'mid' : 'low');
function FitBar({ value }) {
  if (value == null) return null;
  const v = Math.round(Math.max(0, Math.min(100, value)));
  const tone = FIT_TONE(v);
  return (
    <span className={`lu-fit ${tone}`} title={t('Condition physique : {v} %', { v })} aria-label={t('condition {v} %', { v })}>
      <span className="lu-fit-bar"><i style={{ width: `${v}%` }} /></span>
      <em>{v} %</em>
    </span>
  );
}

// Condition d'un remplaçant : en chiffre, coloré selon le même seuil que la barre du terrain.
function BenchFit({ value }) {
  if (value == null) return null;
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return <span className={`lu-bfit ${FIT_TONE(v)}`} title={t('Condition physique : {v} %', { v })}>{v} %</span>;
}

// tactic (avant-match, 1.0.34) : le terrain devient le tableau tactique noir et or (tacticboard.jsx) : l'équipe se place
// selon le plan, avec sa zone de pressing, sa ligne défensive et ses courses, et glisse en place à chaque changement.
// middle : ce qui se range entre le terrain et le banc (les réglages du plan, sous le tableau).
export function LineupBoard({ players, lineup, formation, onChange, onShape = null, locked = null, booked = null, maxIn = Infinity, original = null, notes = null, hurt = null, unavailable = null, fitness = null, tactic = null, middle = null, roles = null, onRoles = null, onMode = null }) {
  const slots = slotsOf(formation);
  const posts = postsOf(formation);
  const cells = formationOf(formation).cells;
  const [shapeMsg, setShapeMsg] = useState(null); // un déplacement refusé (une ligne vide) : la raison, un instant
  const base = useMemo(() => spreadLanes(formationOf(formation).pitch), [formation]);
  const pitch = useMemo(() => (tactic ? spreadLanes(shapeOf(formation, tactic)) : base), [formation, tactic, base]);
  const board = !!tactic;
  const sets = useMemo(() => (board ? shapesOf(formation).map(spreadLanes) : [base]), [board, formation, base]);
  const [box, setBox] = useState(null); // taille du terrain en pixels (dessins du tableau)
  const onBox = useCallback((W, H, wide, geo) => setBox((b) => (b && b.W === W && b.H === H && b.wide === wide && JSON.stringify(b.geo) === JSON.stringify(geo) ? b : { W, H, wide, geo })), []);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const names = useMemo(() => displayNames(players), [players]);
  const canEnter = (p) => available(p) && !unavailable?.has(p.id);
  const isHurt = (id) => !!hurt?.has(id);
  const fitValue = (p) => (fitness ? fitness(p) : fitOf(p));
  const bench = players.filter((p) => !lineup.includes(p.id)).sort((a, b) => canEnter(b) - canEnter(a) || ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a));
  const [sel, setSel] = useState(null); // { kind: 'slot', k } | { kind: 'bench', id }
  const [ghost, setGhost] = useState(null); // joueur suivi par le doigt
  const [over, setOver] = useState(null); // cible survolée pendant le glissé
  const [lift, setLift] = useState(null); // remplaçant saisi (maintien au doigt)
  // mode Rôles (1.0.55, choix du PDG du 14/11 : « B · Tableau ») : sur le même terrain, un joueur touché ouvre la feuille
  // de ses rôles (roles.jsx) ; rien ne se déplace dans ce mode, le banc s'efface
  const [mode, setMode] = useState('xi');
  const [roleFor, setRoleFor] = useState(null);
  const rolesMode = !!onRoles && mode === 'roles';
  // l'écran du match adapte sa légende au mode (« sous le nom : rôle ») ; à chaque ouverture du terrain, Composition
  useEffect(() => { onMode?.(rolesMode ? 'roles' : 'xi'); }, [rolesMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeAt = (k) => (cells[k] === 'G' ? 'G' : typeOf(cells[k]));
  const drag = useRef(null);
  const bestRef = useRef(null);
  const root = useRef(null);
  const pitchEl = useRef(null);
  // en mode Rôles, les étiquettes comptent dans la taille des joueurs (chipParts)
  useChipScale(pitchEl, root, sets, lineup.join(',') + (rolesMode ? `:${JSON.stringify(roles || {})}` : ''), board ? onBox : null);
  const isLocked = (id) => !!locked?.has(id);
  const entering = (next) => (original ? next.filter((id) => id !== null && !original.includes(id)).length : 0);
  const keyOf = (item) => (item ? `${item.kind}:${item.kind === 'slot' ? item.k : item.kind === 'cell' ? item.key : item.id}` : null);

  // pendant un glissé au doigt, la page ne défile pas (écouteur non passif, React les rend passifs)
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const block = (e) => { if (drag.current?.armed) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  useEffect(() => () => clearTimeout(drag.current?.timer), []);
  // la sélection ne survit pas à un changement de dispositif
  useEffect(() => { setSel(null); }, [formation]);

  const playerOf = (item) => (!item ? null : item.kind === 'slot' ? byId[lineup[item.k]] : byId[item.id]);
  // Postes libres (1.0.41, PDG : « placer les joueurs où on veut, comme sur Football Manager ») : un joueur du terrain
  // posé sur une case libre de la grille y change de poste ; le dispositif devient le sien (posts.js, « g:… »).
  const moveTo = (k, cell) => {
    if (!onShape || !cells || cells[k] === 'G') return false;
    const next = [...cells];
    next[k] = cell;
    const keys = next.slice(1);
    if (!usable(keys)) {
      setShapeMsg(t('Il faut au moins un défenseur, un milieu et un attaquant.'));
      setTimeout(() => setShapeMsg(null), 2600);
      return false;
    }
    const same = FORMATION_ORDER.find((f) => { const c = FORMATIONS[f].cells.slice(1); return c.every((x) => keys.includes(x)); });
    const id = same || gridId(keys);
    const F = formationOf(id);
    const gk = lineup[cells.indexOf('G')];
    const order = F.cells.map((c) => (c === 'G' ? gk : lineup[next.indexOf(c)]));
    haptic('tap');
    uiSound('shift');
    onShape(id, order);
    return true;
  };
  const act = (from, to) => {
    if (!from || !to) return false;
    if (to.kind === 'cell') return from.kind === 'slot' && !isLocked(lineup[from.k]) && moveTo(from.k, to.key);
    if (from.kind === 'cell') return false;
    const next = [...lineup];
    if (from.kind === 'slot' && to.kind === 'slot') {
      if (from.k === to.k) return false; // un expulsé ou un blessé se déplace aussi : son poste devient celui laissé vide
      const isOff = (id) => isLocked(id) || isHurt(id);
      if ((isOff(next[from.k]) && slots[to.k] === 'G') || (isOff(next[to.k]) && slots[from.k] === 'G')) return false; // jamais le but vide
      [next[from.k], next[to.k]] = [next[to.k], next[from.k]];
    } else if (from.kind === 'bench' && to.kind === 'bench') {
      return false;
    } else {
      const k = from.kind === 'slot' ? from.k : to.k;
      const id = from.kind === 'bench' ? from.id : to.id;
      if (isLocked(next[k]) || !canEnter(byId[id])) return false; // expulsé, ou remplaçant indisponible
      next[k] = id;
      if (entering(next) > maxIn) return false; // plus de changement disponible
    }
    haptic('tap');
    if (board) uiSound('swap'); // tableau tactique : un son feutré quand l'équipe se replace (PDG, 12/11)
    onChange(next);
    return true;
  };

  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
    if (!el || !root.current?.contains(el)) return null;
    const [kind, v] = el.dataset.drop.split(':');
    return kind === 'slot' ? { kind, k: Number(v) } : kind === 'cell' ? { kind, key: v } : { kind, id: Number(v) };
  };
  // Glissé jusqu'au bord de l'écran (1.0.35, PDG : « les remplaçants sont trop en bas, il faut défiler, et je n'arrive
  // plus à les placer ») : pendant un glissé, la page ne défile pas au doigt ; elle défile donc toute seule quand le
  // doigt approche du haut ou du bas de la zone qui défile, et la cible se recalcule sous le doigt.
  const scrollerOf = (el) => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement;
  };
  const viewOf = (sc) => (sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect());
  const edgeLoop = () => {
    const d = drag.current;
    if (!d?.moved) return;
    const r = viewOf(d.scroller);
    const EDGE = 76;
    const v = d.py < r.top + EDGE ? d.py - (r.top + EDGE) : d.py > r.bottom - EDGE ? d.py - (r.bottom - EDGE) : 0;
    if (v) {
      d.scroller.scrollTop += Math.sign(v) * Math.min(18, 4 + Math.abs(v) * 0.22);
      setOver(keyOf(targetAt(d.px, d.py)));
    }
    d.raf = requestAnimationFrame(edgeLoop);
  };
  // Remplaçant choisi d'un toucher : le terrain vient en vue (il est souvent au-dessus, hors de l'écran)
  const revealPitch = () => {
    const pitchBox = pitchEl.current?.getBoundingClientRect();
    const sc = scrollerOf(root.current);
    if (!pitchBox || !sc) return;
    const r = viewOf(sc);
    if (pitchBox.top >= r.top - 4 && pitchBox.bottom <= r.bottom + 4) return; // déjà en vue
    const by = pitchBox.height <= r.bottom - r.top - 96 ? pitchBox.top + pitchBox.height / 2 - (r.top + r.bottom) / 2 : pitchBox.top - r.top - 8;
    sc.scrollBy({ top: by, behavior: 'smooth' });
  };
  const reset = () => {
    clearTimeout(drag.current?.timer);
    cancelAnimationFrame(drag.current?.raf || 0);
    drag.current = null;
    setGhost(null);
    setOver(null);
    setLift(null);
  };
  const down = (e, item) => {
    if (e.button > 0) return;
    if (item.kind === 'bench' && !canEnter(byId[item.id])) return;
    clearTimeout(drag.current?.timer);
    const hold = e.pointerType === 'touch' && item.kind === 'bench';
    const d = { item, x: e.clientX, y: e.clientY, moved: false, armed: !hold, timer: 0 };
    if (hold) d.timer = setTimeout(() => { d.armed = true; setLift(keyOf(item)); haptic('tap'); }, HOLD_MS);
    drag.current = d;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 7;
    if (!d.armed) { if (far) reset(); return; } // le doigt a bougé avant la saisie : c'est un défilement
    if (!d.moved && !far) return;
    d.moved = true;
    d.px = e.clientX;
    d.py = e.clientY;
    d.scroller ||= scrollerOf(root.current);
    d.raf ||= requestAnimationFrame(edgeLoop);
    setGhost({ x: e.clientX, y: e.clientY, p: playerOf(d.item), from: keyOf(d.item) });
    setOver(keyOf(targetAt(e.clientX, e.clientY)));
  };
  const up = (e) => {
    const d = drag.current;
    reset();
    if (!d) return;
    if (d.moved) { act(d.item, targetAt(e.clientX, e.clientY)); setSel(null); return; }
    tap(d.item);
  };
  const tap = (item) => {
    if (keyOf(sel) === keyOf(item)) { setSel(null); return; }
    if (sel && act(sel, item)) { setSel(null); return; }
    if (item.kind === 'cell') return; // déplacement refusé (une ligne vide) : le joueur reste choisi
    if (item.kind === 'bench' && !canEnter(byId[item.id])) return;
    setSel(item);
    if (item.kind === 'bench') revealPitch();
  };
  const openRole = (k) => {
    const id = lineup[k];
    if (id == null || !byId[id] || isLocked(id)) return;
    uiSound('tap');
    haptic('tap');
    setRoleFor(k);
  };
  const handlers = (item) => (rolesMode ? {
    onClick: () => { if (item.kind === 'slot') openRole(item.k); },
    onContextMenu: (e) => e.preventDefault(),
  } : {
    onPointerDown: (e) => down(e, item),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: reset,
    onContextMenu: (e) => e.preventDefault(), // appui long : pas de menu du navigateur
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(item); } },
    // le bouton A de la manette appuie sur l'élément choisi par un clic sans pointeur (input.js, detail 0) : sans lui,
    // ni un poste ni un remplaçant ne se choisissait à la manette (1.0) ; le doigt et la souris passent par down/up
    onClick: (e) => { if (e.detail === 0) tap(item); },
  });

  // un expulsé ou un blessé non remplacé ne joue plus : le choisir montre, sur chaque coéquipier, son niveau au poste
  // qu'il libérerait en venant s'y placer (celui de l'expulsé devient le poste laissé vide)
  const isOutAt = (k) => isLocked(lineup[k]) || isHurt(lineup[k]);
  const selOut = sel?.kind === 'slot' && isOutAt(sel.k);
  const ghostOut = ghost?.from?.startsWith('slot:') && isOutAt(Number(ghost.from.slice(5)));
  const chosen = selOut || ghostOut ? null : playerOf(sel) || ghost?.p || null;
  const freed = selOut ? posts[sel.k] : null;
  const left = original ? maxIn - entering(lineup) : null;
  const sentOn = lineup.filter((id) => isLocked(id)).length;
  const outHint = selOut
    ? t('{v} ne joue plus : choisis le poste à laisser vide (jamais celui du gardien)', { v: playerOf(sel)?.name })
    : sentOn > 1 ? t('Expulsés : déplace-les sur les postes à laisser vides') : sentOn ? t('Expulsé : déplace-le sur le poste à laisser vide') : null;
  const hint = sel && !selOut
    ? (onShape && sel.kind === 'slot' && slots[sel.k] !== 'G'
      ? t('{v} : choisis un poste libre pour changer le dispositif, ou un coéquipier pour échanger', { v: playerOf(sel)?.name })
      : t('{v} : choisis un poste ou un joueur pour l’y placer', { v: playerOf(sel)?.name }))
    : onShape ? t('Glisse un joueur sur un poste libre pour créer ton dispositif, ou sur un coéquipier pour les échanger')
      : t('Glisse un joueur sur un poste, ou choisis-en deux pour les échanger');
  // cases libres de la grille : visibles quand un joueur du terrain (hors gardien) est choisi ou glissé
  const moving = sel?.kind === 'slot' ? sel.k : ghost?.from?.startsWith('slot:') ? Number(ghost.from.slice(5)) : null;
  const showCells = !!onShape && !!cells && moving !== null && slots[moving] !== 'G' && !isOutAt(moving);
  const movingP = moving !== null ? byId[lineup[moving]] : null;
  // Banc classé pour le poste (1.0.51, PDG 14/11 : « les remplaçants, améliore l'interface… intuitif ») : un joueur du terrain
  // choisi ou glissé, chaque remplaçant montre sa note à ce poste, les meilleurs d'abord, le premier marqué « Le meilleur
  // ici » ; un poste laissé vide par un blessé se remplace de la même façon.
  const target = sel?.kind === 'slot' ? sel.k : moving;
  const atTarget = (p) => (target === null || target === undefined ? null : ratingAtSlot(p, formation, target));
  const benchShown = target === null || target === undefined ? bench : [...bench].sort((a, b) => canEnter(b) - canEnter(a) || atTarget(b) - atTarget(a));
  const firstId = target === null || target === undefined || isLocked(lineup[target]) ? null : benchShown.find((p) => canEnter(p))?.id ?? null;
  // le bandeau seulement pour un vrai recours : au moins 70 % de la note du titulaire à ce poste (et 3 sur 10) ; sinon la
  // bande reste classée sans conseil (un poste sans remplaçant naturel ne pousse pas à un mauvais changement)
  const starter = firstId !== null && !isOutAt(target) ? byId[lineup[target]] : null;
  const floor = Math.max(3, starter ? 0.7 * ratingAtSlot(starter, formation, target) : 0);
  const bestId = firstId !== null && atTarget(byId[firstId]) >= floor ? firstId : null;
  // un titulaire épuisé, sous 50 % de condition (le rouge de sa barre), se signale (anneau ambré qui respire) : c'est lui
  // qu'on remplace (à 60 %, presque tout un onze parti fatigué s'allumait à la pause, relecture du 14/11)
  const TIRED = 50;
  // le meilleur remplaçant vient en vue dans le banc qui défile (au téléphone, une bande horizontale). Pendant le
  // classement, la bande n'accroche plus ses cartes (.ranked) : sinon le navigateur la ramène sur la carte accrochée
  // avant le nouveau classement, et le meilleur, désormais premier, sort de l'écran. Seule la bande défile, jamais la page.
  useLayoutEffect(() => {
    const el = bestRef.current;
    const g = el?.parentElement;
    if (firstId === null || !g || g.scrollWidth <= g.clientWidth + 1) return;
    const r = el.getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    const dx = r.left < gr.left ? r.left - gr.left - 8 : r.right > gr.right ? r.right - gr.right + 8 : 0;
    if (dx) g.scrollBy({ left: dx, behavior: 'smooth' });
  }, [firstId, target]);

  return (
    <div className={`lu ${board ? 'tb' : ''} ${ghost ? 'dragging' : ''} ${showCells ? 'shaping' : ''} ${rolesMode ? 'roles-mode' : ''}`} ref={root} data-noswipe="">
      {onRoles && (
        <div className="lu-modes" role="tablist" aria-label={t('Terrain')}>
          {[['xi', t('Composition')], ['roles', t('Rôles')]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''}
              onClick={() => { if (k === mode) return; uiSound('shift'); reset(); setSel(null); setMode(k); }}>{label}</button>
          ))}
        </div>
      )}
      {rolesMode && <p className="lu-hint lu-hint-roles" role="status">{t('Touche un joueur pour choisir ses rôles.')}</p>}
      {outHint && !rolesMode && <p className="lu-hint lu-hint-out" role="status">{outHint}</p>}
      {board && <BoardLegend tactic={tactic} />}
      <div className="lu-pitch" ref={pitchEl}>
        {shapeMsg && (root.current?.clientWidth || 0) >= WIDE && <p className="lu-toast" role="status">{shapeMsg}</p>}
        <div className="p2-lines"><i className="half" /><i className="circle" /><i className="box top" /><i className="box bottom" /><i className="six top" /><i className="six bottom" /></div>
        {board && <BoardMarks formation={formation} tactic={tactic} P={pitch} box={box} />}
        {showCells && ALL_CELLS.filter((c) => !cells.includes(c)).map((c) => {
          const [x, y] = tactic ? shapePoint(cellPitch(c), POST_LINE[typeOf(c)], tactic) : cellPitch(c);
          const key = `cell:${c}`;
          const v = movingP ? ratingAtPost(movingP, typeOf(c)) : null;
          return (
            <button key={c} type="button" data-drop={key} className={`lu-cell ${over === key ? 'over' : ''}`} style={{ '--x': `${x}%`, '--y': `${y}%` }}
              aria-label={t('{post} : y placer {name}', { post: POST_NAMES[typeOf(c)], name: movingP?.name || '' })} title={POST_NAMES[typeOf(c)]}
              {...handlers({ kind: 'cell', key: c })}>
              <b>{POST_SHORT[typeOf(c)]}</b>
              {v !== null && <em>{fmtRating(v)}</em>}
            </button>
          );
        })}
        {lineup.map((id, k) => {
          const p = byId[id];
          if (!p) return null;
          const pos = slots[k];
          const natural = p.pos === pos;
          const key = `slot:${k}`;
          const cur = ratingAtSlot(p, formation, k);
          const out = isLocked(id) || isHurt(id);
          const preview = freed ? (out || pos === 'G' ? null : ratingAtPost(p, freed)) : chosen && chosen.id !== id ? ratingAtSlot(chosen, formation, k) : null;
          const cls = ['lu-chip', !natural && !out && 'off', keyOf(sel) === key && 'sel', over === key && 'over', ghost?.from === key && 'src', isLocked(id) && 'locked', isHurt(id) && 'hurt', !out && fitness && fitValue(p) < TIRED && 'tired'];
          return (
            <button
              key={k}
              type="button"
              data-drop={key}
              className={cls.filter(Boolean).join(' ')}
              style={{ '--x': `${+pitch[k][0].toFixed(2)}%`, '--y': `${+pitch[k][1].toFixed(2)}%`, ...(rolesMode ? { '--zn': 1 + Math.round((100 - pitch[k][1]) / 5), '--zw': 1 + Math.round((100 - pitch[k][0]) / 5) } : null) }}
              title={isLocked(id) ? t('Expulsé : il ne peut pas être remplacé ; déplace-le sur le poste à laisser vide') : isHurt(id) ? t('Blessé : à remplacer par un joueur du banc, ou à déplacer sur le poste à laisser vide') : `${POST_NAMES[posts[k]] || POS_LABELS[pos]}${natural ? '' : t(' · hors de son poste ({toLowerCase})', { toLowerCase: POS_LABELS[p.pos].toLowerCase() })}`}
              aria-label={`${p.name}, ${(POST_NAMES[posts[k]] || POS_LABELS[pos]).toLowerCase()}${out ? '' : t(', niveau {fmtRating}', { fmtRating: fmtRating(cur) })}${isLocked(id) ? t(', expulsé, poste laissé vide') : isHurt(id) ? t(', blessé') : ''}`}
              {...handlers({ kind: 'slot', k })}
            >
              <span className="lu-face">
                <Portrait p={p} size={52} />
                <span className="lu-rate">{out ? '—' : fmtRating(cur)}</span>
                {/* note d'échange : toujours là, invisible hors choix, pour que la taille des joueurs lui réserve sa place
                    (relecture 1.0.41) ; comparée au dixième affiché (une égalité n'est ni verte ni rouge) */}
                <span key={preview === null ? 'off' : 'on'} className={`lu-alt ${preview === null ? 'off' : fmtRating(preview) === fmtRating(cur) ? '' : preview > cur ? 'up' : 'down'}`} aria-hidden={preview === null || undefined}>{fmtRating(preview === null ? cur : preview)}</span>
                {notes?.[id] != null && <span className="lu-note"><RatingBadge value={notes[id]} size="sm" /></span>}
                {(isLocked(id) || booked?.has(id)) && <i className={`card ${isLocked(id) ? 'red' : 'yellow'} lu-flag`} />}
                {isHurt(id) && <i className="lu-hurt" aria-hidden="true" />}
              </span>
              <span className="lu-name">{names[id]}</span>
              {rolesMode
                ? isLocked(id) ? null /* expulsé : plus de rôle à choisir (relecture 1.0.55) */ : (() => { const ra = rolesAt(typeAt(k), roles?.[id]); const r = ra && (ra.w !== ra.fam.with[0] || ra.d === ra.fam.without[0] ? ra.w : ra.d); return r ? <span className={`lu-role ${ra.custom ? 'custom' : ''}`}>{r.name}</span> : null; })()
                : !out && <FitBar value={fitValue(p)} />}
            </button>
          );
        })}
      </div>
      {middle}
      <div className="lu-bench">
        <div className="lu-bench-head">
          <span className="lu-bench-title mark-head">{t('Remplaçants')}{board && bench.length > 0 && <em className="lu-count">{bench.length}</em>}</span>
          {left !== null && <span className={`lu-left ${left === 0 ? 'none' : ''}`}>{left === 0 ? t('Plus de changement') : tn(left, '{left} changement possible', '{left} changements possibles', { left }, left > 1)}</span>}
        </div>
        <div className={`lu-bench-grid ${firstId !== null ? 'ranked' : ''}`}>
          {bench.length === 0 && <span className="muted small">{t('Aucun remplaçant : recrute au mercato.')}</span>}
          {benchShown.map((p) => {
            const key = `bench:${p.id}`;
            const ok = canEnter(p);
            const why = ok ? null : absenceOf(p)?.short || (hurt?.has(p.id) ? t('Blessé') : t('Déjà sorti'));
            const here = ok ? atTarget(p) : null;
            const cls = ['lu-bchip', keyOf(sel) === key && 'sel', over === key && 'over', (ghost?.from === key || lift === key) && 'src', lift === key && 'lift', !ok && 'na', p.id === bestId && 'best', here !== null && 'aimed'];
            return (
              <button key={p.id} ref={p.id === firstId ? bestRef : undefined} type="button" data-drop={key} className={cls.filter(Boolean).join(' ')} title={why || undefined} aria-disabled={!ok || undefined}
                aria-label={t('{name}, {toLowerCase}, niveau {fmtRating}{v}', { name: p.name, toLowerCase: POS_LABELS[p.pos].toLowerCase(), fmtRating: fmtRating(playerRating(p)), v: why ? `${comma()}${why.toLowerCase()}` : '' })} {...handlers({ kind: 'bench', id: p.id })}>
                <Portrait p={p} size={36} />
                <span className="lu-bmain">
                  <BenchName name={names[p.id]} />
                  <span className="lu-bmeta"><span className={`pos-pill ${p.pos}`}>{p.pos}</span>{why ? <em className="lu-why">{why}</em> : <BenchFit value={fitValue(p)} />}</span>
                </span>
                <b className="lu-brate" title={here !== null ? t('Sa note à ce poste') : undefined}>{fmtRating(here !== null ? here : playerRating(p))}</b>
                {p.id === bestId && <em className="lu-btag">{t('Le meilleur ici')}</em>}
              </button>
            );
          })}
        </div>
        <p className="lu-hint">{hint}</p>
      </div>
      {/* refus d'un poste libre, terrain dressé (téléphone) : bandeau fixe en bas de l'écran, au-dessus des barres du bas
          (« Coup d'envoi », « Reprendre », bas de l'Équipe), jamais coupé (relecture 1.0.41) */}
      {shapeMsg && (root.current?.clientWidth || 0) < WIDE && createPortal(
        <div className="lu-pick lu-pick-out" role="status"><span className="lu-pick-text">{shapeMsg}</span></div>,
        document.body,
      )}
      {/* remplaçant choisi d'un toucher : un bandeau en bas de l'écran dit quoi faire ensuite, avec « Annuler » */}
      {sel?.kind === 'bench' && byId[sel.id] && createPortal(
        <div className="lu-pick" role="status">
          <Portrait p={byId[sel.id]} size={34} />
          <span className="lu-pick-text">{t('{v} : choisis un poste ou un joueur pour l’y placer', { v: byId[sel.id].name })}</span>
          <button type="button" className="linkbtn" onClick={() => { uiSound('back'); setSel(null); }}>{t('Annuler')}</button>
        </div>,
        document.body,
      )}
      {ghost && createPortal(
        <div className="lu-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <span className="lu-face"><Portrait p={ghost.p} size={52} /><span className="lu-rate">{ghostOut ? '—' : fmtRating(playerRating(ghost.p))}</span></span>
          <span className="lu-name">{names[ghost.p.id]}</span>
        </div>,
        document.body,
      )}
      {roleFor !== null && byId[lineup[roleFor]] && <RoleSheet player={byId[lineup[roleFor]]} type={typeAt(roleFor)} roles={roles || {}} onChange={onRoles} onClose={() => setRoleFor(null)} />}
    </div>
  );
}

// Onglet Composition de l'Effectif : le onze, le dispositif et la tactique de base, enregistrés à chaque geste
// (l'avant-match repart de là).
export function LineupEditor({ state, run }) {
  const formation = formationOf(state.formation).id;
  const level = levelOf(state.players, state.lineup, formation); // condition et forme comprises, comme à l'avant-match
  const save = (lineup, f = formation) => run((s) => { s.lineup = lineup; s.formation = f; return s; });
  const offPos = state.lineup.filter((id, k) => {
    const p = state.players.find((q) => q.id === id);
    return p && p.pos !== slotsOf(formation)[k];
  }).length;
  return (
    <div className="lu-editor">
      <section className="lu-main">
        <div className="pm-xi-head">
          <h3 className="pm-sh mark-head">{tr('Onze de départ · <0/>', [<span className="nowrap">{formationOf(formation).name}</span>])}</h3>
          <LevelReadout level={level} />
          <LineupActions state={state} lineup={state.lineup} formation={formation} onApply={(l) => save(l)} />
        </div>
        <LineupBoard players={state.players} lineup={state.lineup} formation={formation} onChange={(l) => save(l)} onShape={(f, l) => save(l, f)} />
      </section>
      <aside className="lu-side">
        <div className="lu-card">
          <h3 className="pm-sh mark-head">{t('Dispositif')}</h3>
          <FormationPicker value={formation} onChange={(f) => save(reshapeLineup(state.players, state.lineup, f), f)} />
          <p className="pm-blurb">{formationOf(formation).blurb}</p>
        </div>
        <div className="lu-card lu-legend">
          <h3 className="pm-sh mark-head">{t('Repères')}</h3>
          <p><i className="lu-dot" /><span>{tr('Le chiffre à côté du portrait est le niveau du joueur <0>à ce poste</0>.', [(c) => <b>{c}</b>])}</span></p>
          <p><i className="lu-dot off" /><span>{tr('Contour en pointillés rouges : il joue hors de son poste<0/>.', [offPos ? t(' ({offPos} dans ton onze)', { offPos }) : ''])}</span></p>
          <p><i className="lu-dot alt" /><span>{t('Joueur choisi : chaque poste affiche le niveau qu’il y aurait, en vert s’il y ferait mieux, en rouge sinon.')}</span></p>
          <p><i className="lu-dot fit" /><span>{t('Barre et pourcentage sous le nom : condition physique. Un joueur fatigué joue moins bien et se blesse plus souvent ; les absents (blessés, suspendus) restent sur le banc, grisés.')}</span></p>
          <p className="muted small">{t('Ce onze est repris à l’avant-match, où tu peux encore le retoucher.')}</p>
        </div>
      </aside>
    </div>
  );
}

// Nom d'un remplaçant (1.0.14, chasse aux défauts) : rapetisse juste assez pour tenir dans sa puce (« JEANNERET » raccourci
// à 360 px)
function BenchName({ name }) {
  const ref = useFitText(name, 11);
  return <span className="lu-bname" ref={ref}>{name}</span>;
}
