import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { POS_LABELS } from '../game/constants';
import { absenceOf, available, fitFactor, fitOf, playerRating, ratingAt } from '../game/players';
import { FORMATIONS, FORMATION_ORDER, autoLineup, fitWeight, formationOf, lineupRating, reshapeLineup, restWeight, rotateLineup, slotsOf } from '../game/tactics';
import { fmtRating } from './format';
import { RatingBadge } from './kit';
import { haptic } from './haptics';
import { Portrait } from './portrait';
import { IconCheck } from './icons';

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
    for (const b of face.querySelectorAll('.lu-rate, .lu-note')) add(face.offsetLeft + b.offsetLeft, face.offsetTop + b.offsetTop, b.offsetWidth, b.offsetHeight);
  }
  for (const b of chip.querySelectorAll(':scope > .lu-name, :scope > .lu-fit')) add(b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight);
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
function useChipScale(pitchRef, rootRef, pitch, key) {
  useLayoutEffect(() => {
    const el = pitchRef.current;
    const root = rootRef.current;
    if (!el || !root) return undefined;
    const fit = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      const chips = [...el.querySelectorAll('.lu-chip')];
      if (chips.length !== pitch.length || !W || !H) return;
      const wide = root.clientWidth >= WIDE;
      const at = ([x, y]) => (wide ? [W * (0.05 + (100 - y) * 0.009), H * (0.05 + x * 0.009)] : [W * (0.09 + x * 0.0082), H * (0.05 + y * 0.009)]);
      const pts = pitch.map(at);
      const parts = chips.map(chipParts);
      const ok = (s) => {
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (clashes(pts[i], parts[i], pts[j], parts[j], s)) return false;
        return true;
      };
      let lo = 0.6;
      let hi = 1.3;
      if (ok(hi)) lo = hi;
      else for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      el.style.setProperty('--lu-s', lo.toFixed(3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(root);
    return () => ro.disconnect();
  }, [pitchRef, rootRef, pitch, key]);
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

// Dispositif : six formations. Leur effet exact sur les occasions (tactics.js : les nôtres et celles de l'adversaire,
// dans la même proportion), en mots sous le choix.
export function formationEffect(id) {
  const f = FORMATIONS[id];
  if (!f || f.for === 1) return 'Occasions : la référence.';
  const pct = Math.round((f.for - 1) * 100);
  return `Occasions : ${pct > 0 ? '+' : '−'}${Math.abs(pct)} % des deux côtés.`;
}
export function FormationPicker({ value, onChange }) {
  return (
    <div className="formations" role="radiogroup" aria-label="Dispositif">
      {FORMATION_ORDER.map((id) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <strong>{FORMATIONS[id].name}</strong>
        </button>
      ))}
    </div>
  );
}

// Trois boutons de composition (0.8.5, demande du PDG), toujours visibles :
//  - « Meilleur onze » : les meilleures notes, sans regarder la condition ni la forme ;
//  - « Onze en forme » : le onze le plus fort pour ce match, notes, condition physique et forme réunies, comme le
//    pronostic et le match ;
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
  return <LineupAction next={best} lineup={lineup} onApply={onApply} label="Meilleur onze" done="Meilleur onze" gain={gain} title="Les meilleures notes, sans regarder la condition physique ni la forme" />;
}
export function FitEleven({ players, lineup, formation, onApply }) {
  const best = useMemo(() => autoLineup(players, formation), [players, formation]);
  const gain = lineupRating(players, best, formation, fitWeight) - lineupRating(players, lineup, formation, fitWeight);
  return <LineupAction next={best} lineup={lineup} onApply={onApply} label="Onze en forme" done="Onze en forme" gain={gain} className="lu-fresh" title="Le onze le plus fort pour ce match : notes, condition physique et forme réunies" />;
}

// Niveau d'un onze tel qu'il jouera, condition et forme comprises (comme le pronostic et le match), avec ce que la
// fatigue lui retire et ce que la forme lui ajoute ou lui retire (avant-match, onglet Composition).
export function levelOf(players, lineup, formation) {
  const rating = lineupRating(players, lineup, formation, fitWeight);
  const rested = lineupRating(players, lineup, formation);
  const fitOnly = lineupRating(players, lineup, formation, (p) => fitFactor(fitOf(p)));
  return { rating, rested, tired: rested - fitOnly >= 0.05 ? rested - fitOnly : 0, formGap: Math.abs(rating - fitOnly) >= 0.05 ? rating - fitOnly : 0 };
}
export function LevelReadout({ level }) {
  const { rating, rested, tired, formGap } = level;
  return (
    <span className="pm-level">
      Niveau <b>{fmtRating(rating)}</b>
      {tired > 0 && <em className="pm-tired" title={`${fmtRating(rested)} au repos`}>fatigue −{fmtRating(tired)}</em>}
      {formGap !== 0 && <em className={`pm-form ${formGap > 0 ? 'up' : 'down'}`} title="Moyenne des notes des derniers matchs">forme {formGap > 0 ? '+' : '−'}{fmtRating(Math.abs(formGap))}</em>}
    </span>
  );
}

// last : le onze de départ du dernier match (sans dernier match : le onze actuel)
export function RotateButton({ players, lineup, last, formation, onApply }) {
  const ref = last?.length ? last : lineup;
  const next = useMemo(() => rotateLineup(players, ref, formation), [players, ref, formation]);
  return <LineupAction next={next} lineup={lineup} onApply={onApply} label="Faire tourner" done="Rotation en place" className="lu-rotate" title="Les remplaçants du dernier match jouent, complétés par les titulaires les plus reposés" />;
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
    <span className={`lu-fit ${tone}`} title={`Condition physique : ${v} %`} aria-label={`condition ${v} %`}>
      <span className="lu-fit-bar"><i style={{ width: `${v}%` }} /></span>
      <em>{v} %</em>
    </span>
  );
}

// Condition d'un remplaçant : en chiffre, coloré selon le même seuil que la barre du terrain.
function BenchFit({ value }) {
  if (value == null) return null;
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return <span className={`lu-bfit ${FIT_TONE(v)}`} title={`Condition physique : ${v} %`}>{v} %</span>;
}

export function LineupBoard({ players, lineup, formation, onChange, locked = null, booked = null, maxIn = Infinity, original = null, notes = null, hurt = null, unavailable = null, fitness = null }) {
  const slots = slotsOf(formation);
  const pitch = formationOf(formation).pitch;
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
  const drag = useRef(null);
  const root = useRef(null);
  const pitchEl = useRef(null);
  useChipScale(pitchEl, root, pitch, lineup.join(','));
  const isLocked = (id) => !!locked?.has(id);
  const entering = (next) => (original ? next.filter((id) => id !== null && !original.includes(id)).length : 0);
  const keyOf = (item) => (item ? `${item.kind}:${item.kind === 'slot' ? item.k : item.id}` : null);

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
  const act = (from, to) => {
    if (!from || !to) return false;
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
    onChange(next);
    return true;
  };

  const targetAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
    if (!el || !root.current?.contains(el)) return null;
    const [kind, v] = el.dataset.drop.split(':');
    return kind === 'slot' ? { kind, k: Number(v) } : { kind, id: Number(v) };
  };
  const reset = () => {
    clearTimeout(drag.current?.timer);
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
    if (item.kind === 'bench' && !canEnter(byId[item.id])) return;
    setSel(item);
  };
  const handlers = (item) => ({
    onPointerDown: (e) => down(e, item),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: reset,
    onContextMenu: (e) => e.preventDefault(), // appui long : pas de menu du navigateur
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(item); } },
  });

  // un expulsé ou un blessé non remplacé ne joue plus : le choisir montre, sur chaque coéquipier, son niveau au poste
  // qu'il libérerait en venant s'y placer (celui de l'expulsé devient le poste laissé vide)
  const isOutAt = (k) => isLocked(lineup[k]) || isHurt(lineup[k]);
  const selOut = sel?.kind === 'slot' && isOutAt(sel.k);
  const ghostOut = ghost?.from?.startsWith('slot:') && isOutAt(Number(ghost.from.slice(5)));
  const chosen = selOut || ghostOut ? null : playerOf(sel) || ghost?.p || null;
  const freed = selOut ? slots[sel.k] : null;
  const left = original ? maxIn - entering(lineup) : null;
  const sentOn = lineup.filter((id) => isLocked(id)).length;
  const outHint = selOut
    ? `${playerOf(sel)?.name} ne joue plus : choisis le poste à laisser vide (jamais celui du gardien)`
    : sentOn > 1 ? 'Expulsés : déplace-les sur les postes à laisser vides' : sentOn ? 'Expulsé : déplace-le sur le poste à laisser vide' : null;
  const hint = sel && !selOut
    ? `${playerOf(sel)?.name} : choisis un poste ou un joueur pour l’y placer`
    : 'Glisse un joueur sur un poste, ou choisis-en deux pour les échanger';

  return (
    <div className={`lu ${ghost ? 'dragging' : ''}`} ref={root} data-noswipe="">
      {outHint && <p className="lu-hint lu-hint-out" role="status">{outHint}</p>}
      <div className="lu-pitch" ref={pitchEl}>
        <div className="p2-lines"><i className="half" /><i className="circle" /><i className="box top" /><i className="box bottom" /><i className="six top" /><i className="six bottom" /></div>
        {lineup.map((id, k) => {
          const p = byId[id];
          if (!p) return null;
          const pos = slots[k];
          const natural = p.pos === pos;
          const key = `slot:${k}`;
          const cur = ratingAt(p, pos);
          const out = isLocked(id) || isHurt(id);
          const preview = freed ? (out || pos === 'G' ? null : ratingAt(p, freed)) : chosen && chosen.id !== id ? ratingAt(chosen, pos) : null;
          const cls = ['lu-chip', !natural && !out && 'off', keyOf(sel) === key && 'sel', over === key && 'over', ghost?.from === key && 'src', isLocked(id) && 'locked', isHurt(id) && 'hurt'];
          return (
            <button
              key={k}
              type="button"
              data-drop={key}
              className={cls.filter(Boolean).join(' ')}
              style={{ '--x': `${pitch[k][0]}%`, '--y': `${pitch[k][1]}%` }}
              title={isLocked(id) ? 'Expulsé : il ne peut pas être remplacé ; déplace-le sur le poste à laisser vide' : isHurt(id) ? 'Blessé : à remplacer par un joueur du banc, ou à déplacer sur le poste à laisser vide' : `${POS_LABELS[pos]}${natural ? '' : ` · hors de son poste (${POS_LABELS[p.pos].toLowerCase()})`}`}
              aria-label={`${p.name}, ${POS_LABELS[pos].toLowerCase()}${out ? '' : `, niveau ${fmtRating(cur)}`}${isLocked(id) ? ', expulsé, poste laissé vide' : isHurt(id) ? ', blessé' : ''}`}
              {...handlers({ kind: 'slot', k })}
            >
              <span className="lu-face">
                <Portrait p={p} size={52} />
                <span className="lu-rate">{out ? '—' : fmtRating(cur)}</span>
                {preview !== null && <span className={`lu-alt ${preview > cur ? 'up' : preview < cur ? 'down' : ''}`}>{fmtRating(preview)}</span>}
                {notes?.[id] != null && <span className="lu-note"><RatingBadge value={notes[id]} size="sm" /></span>}
                {(isLocked(id) || booked?.has(id)) && <i className={`card ${isLocked(id) ? 'red' : 'yellow'} lu-flag`} />}
                {isHurt(id) && <i className="lu-hurt" aria-hidden="true" />}
              </span>
              <span className="lu-name">{names[id]}</span>
              {!out && <FitBar value={fitValue(p)} />}
            </button>
          );
        })}
      </div>
      <div className="lu-bench">
        <div className="lu-bench-head">
          <span className="lu-bench-title mark-head">Remplaçants</span>
          {left !== null && <span className={`lu-left ${left === 0 ? 'none' : ''}`}>{left === 0 ? 'Plus de changement' : `${left} changement${left > 1 ? 's' : ''} possible${left > 1 ? 's' : ''}`}</span>}
        </div>
        <div className="lu-bench-grid">
          {bench.length === 0 && <span className="muted small">Aucun remplaçant : recrute au mercato.</span>}
          {bench.map((p) => {
            const key = `bench:${p.id}`;
            const ok = canEnter(p);
            const why = ok ? null : absenceOf(p)?.short || (hurt?.has(p.id) ? 'Blessé' : 'Déjà sorti');
            const cls = ['lu-bchip', keyOf(sel) === key && 'sel', over === key && 'over', (ghost?.from === key || lift === key) && 'src', lift === key && 'lift', !ok && 'na'];
            return (
              <button key={p.id} type="button" data-drop={key} className={cls.filter(Boolean).join(' ')} title={why || undefined} aria-disabled={!ok || undefined}
                aria-label={`${p.name}, ${POS_LABELS[p.pos].toLowerCase()}, niveau ${fmtRating(playerRating(p))}${why ? `, ${why.toLowerCase()}` : ''}`} {...handlers({ kind: 'bench', id: p.id })}>
                <Portrait p={p} size={36} />
                <span className="lu-bmain">
                  <span className="lu-bname">{names[p.id]}</span>
                  <span className="lu-bmeta"><span className={`pos-pill ${p.pos}`}>{p.pos}</span>{why ? <em className="lu-why">{why}</em> : <BenchFit value={fitValue(p)} />}</span>
                </span>
                <b className="lu-brate">{fmtRating(playerRating(p))}</b>
              </button>
            );
          })}
        </div>
        <p className="lu-hint">{hint}</p>
      </div>
      {ghost && createPortal(
        <div className="lu-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <span className="lu-face"><Portrait p={ghost.p} size={52} /><span className="lu-rate">{ghostOut ? '—' : fmtRating(playerRating(ghost.p))}</span></span>
          <span className="lu-name">{names[ghost.p.id]}</span>
        </div>,
        document.body,
      )}
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
          <h3 className="pm-sh mark-head">Onze de départ · <span className="nowrap">{formationOf(formation).name}</span></h3>
          <LevelReadout level={level} />
          <LineupActions state={state} lineup={state.lineup} formation={formation} onApply={(l) => save(l)} />
        </div>
        <LineupBoard players={state.players} lineup={state.lineup} formation={formation} onChange={(l) => save(l)} />
      </section>
      <aside className="lu-side">
        <div className="lu-card">
          <h3 className="pm-sh mark-head">Dispositif</h3>
          <FormationPicker value={formation} onChange={(f) => save(reshapeLineup(state.players, state.lineup, f), f)} />
          <p className="pm-blurb">{formationOf(formation).blurb} <span className="pm-effect">{formationEffect(formation)}</span></p>
        </div>
        <div className="lu-card lu-legend">
          <h3 className="pm-sh mark-head">Repères</h3>
          <p><i className="lu-dot" /><span>Le chiffre à côté du portrait est le niveau du joueur <b>à ce poste</b>.</span></p>
          <p><i className="lu-dot off" /><span>Contour en pointillés rouges : il joue hors de son poste{offPos ? ` (${offPos} dans ton onze)` : ''}.</span></p>
          <p><i className="lu-dot alt" /><span>Joueur choisi : chaque poste affiche le niveau qu’il y aurait, en vert s’il y ferait mieux, en rouge sinon.</span></p>
          <p><i className="lu-dot fit" /><span>Barre et pourcentage sous le nom : condition physique. Un joueur fatigué joue moins bien et se blesse plus souvent ; les absents (blessés, suspendus) restent sur le banc, grisés.</span></p>
          <p className="muted small">Ce onze est repris à l’avant-match, où tu peux encore le retoucher.</p>
        </div>
      </aside>
    </div>
  );
}
