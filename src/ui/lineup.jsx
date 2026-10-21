import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { POS_LABELS } from '../game/constants';
import { playerRating, ratingAt } from '../game/players';
import { FORMATIONS, FORMATION_ORDER, autoLineup, formationOf, lineupRating, reshapeLineup, slotsOf } from '../game/tactics';
import { fmtRating } from './format';
import { RatingBadge } from './kit';
import { haptic } from './haptics';

// Composition interactive, la même partout (onglet Composition de l'Effectif, avant-match, mi-temps) : le terrain
// avec le onze à ses postes, le banc en dessous. On glisse un joueur sur un poste ou sur un coéquipier pour les
// échanger, ou on touche un joueur puis un autre. Quand un joueur est choisi, chaque poste affiche la note qu'il y
// aurait (vert s'il y ferait mieux que l'actuel, rouge sinon). À la mi-temps (maxIn), seuls quelques remplaçants
// peuvent entrer et les expulsés restent figés.
// Au doigt, un joueur du terrain se saisit tout de suite ; sur le banc (qui défile), il faut le maintenir un
// instant, sinon le geste fait défiler la page.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const HOLD_MS = 170;
const lastOf = (n) => n.split(' ').slice(1).join(' ') || n;

// noms courts lisibles : « Joubert », ou « F. Joubert » quand deux joueurs portent le même nom
export function displayNames(players) {
  const count = {};
  for (const p of players) { const l = lastOf(p.name); count[l] = (count[l] || 0) + 1; }
  return Object.fromEntries(players.map((p) => {
    const l = lastOf(p.name);
    return [p.id, count[l] > 1 ? `${p.name[0]}. ${l}` : l];
  }));
}

// Dispositif : six formations, avec leur effet résumé.
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

// « Meilleur onze » : le bouton dit ce qu'il apporte (+0,4), ou que le onze est déjà le meilleur possible.
export function BestEleven({ players, lineup, formation, onApply }) {
  const best = useMemo(() => autoLineup(players, formation), [players, formation]);
  const gain = lineupRating(players, best, formation) - lineupRating(players, lineup, formation);
  if (gain < 1e-6) return <span className="lu-best done">Meilleur onze possible</span>;
  return (
    <button className="linkbtn lu-best" onClick={() => { haptic('tap'); onApply(best); }}>
      Meilleur onze{gain >= 0.05 && <b>+{fmtRating(gain)}</b>}
    </button>
  );
}

export function LineupBoard({ players, lineup, formation, onChange, locked = null, booked = null, maxIn = Infinity, original = null, notes = null }) {
  const slots = slotsOf(formation);
  const pitch = formationOf(formation).pitch;
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const names = useMemo(() => displayNames(players), [players]);
  const bench = players.filter((p) => !lineup.includes(p.id)).sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a));
  const [sel, setSel] = useState(null); // { kind: 'slot', k } | { kind: 'bench', id }
  const [ghost, setGhost] = useState(null); // joueur suivi par le doigt
  const [over, setOver] = useState(null); // cible survolée pendant le glissé
  const [lift, setLift] = useState(null); // remplaçant saisi (maintien au doigt)
  const drag = useRef(null);
  const root = useRef(null);
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
      if (from.k === to.k || isLocked(next[from.k]) || isLocked(next[to.k])) return false;
      [next[from.k], next[to.k]] = [next[to.k], next[from.k]];
    } else if (from.kind === 'bench' && to.kind === 'bench') {
      return false;
    } else {
      const k = from.kind === 'slot' ? from.k : to.k;
      const id = from.kind === 'bench' ? from.id : to.id;
      if (isLocked(next[k])) return false;
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
    if (item.kind === 'slot' && isLocked(lineup[item.k])) return;
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
    if (item.kind === 'slot' && isLocked(lineup[item.k])) return;
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

  const chosen = playerOf(sel) || ghost?.p || null;
  const left = original ? maxIn - entering(lineup) : null;
  const hint = sel
    ? `${playerOf(sel)?.name} : touche un poste ou un joueur pour l’y placer`
    : 'Glisse un joueur sur un poste, ou touches-en deux pour les échanger';

  return (
    <div className={`lu ${ghost ? 'dragging' : ''}`} ref={root}>
      <div className="pitch2d lu-pitch">
        <div className="p2-lines"><i className="half" /><i className="circle" /><i className="box top" /><i className="box bottom" /></div>
        {lineup.map((id, k) => {
          const p = byId[id];
          if (!p) return null;
          const pos = slots[k];
          const natural = p.pos === pos;
          const key = `slot:${k}`;
          const cur = ratingAt(p, pos);
          const preview = chosen && chosen.id !== id ? ratingAt(chosen, pos) : null;
          const cls = ['p2-chip', 'lu-chip', !natural && 'off', keyOf(sel) === key && 'sel', over === key && 'over', ghost?.from === key && 'src', isLocked(id) && 'locked'];
          return (
            <button
              key={k}
              type="button"
              data-drop={key}
              className={cls.filter(Boolean).join(' ')}
              style={{ left: `${pitch[k][0]}%`, top: `${pitch[k][1]}%` }}
              title={isLocked(id) ? 'Expulsé : il ne peut pas être remplacé' : `${POS_LABELS[pos]}${natural ? '' : ` · hors de son poste (${POS_LABELS[p.pos].toLowerCase()})`}`}
              aria-label={`${p.name}, ${POS_LABELS[pos].toLowerCase()}, niveau ${fmtRating(cur)}`}
              {...handlers({ kind: 'slot', k })}
            >
              <span className="p2-num">
                {fmtRating(cur)}
                {preview !== null && <span className={`lu-alt ${preview > cur ? 'up' : preview < cur ? 'down' : ''}`}>{fmtRating(preview)}</span>}
                {notes?.[id] != null && <span className="lu-note"><RatingBadge value={notes[id]} size="sm" /></span>}
                {(isLocked(id) || booked?.has(id)) && <i className={`card ${isLocked(id) ? 'red' : 'yellow'} lu-flag`} />}
              </span>
              <span className="p2-name">{names[id]}</span>
            </button>
          );
        })}
      </div>
      <div className="lu-bench">
        <div className="lu-bench-head">
          <span className="eyebrow muted-eyebrow">Remplaçants</span>
          {left !== null && <span className={`lu-left ${left === 0 ? 'none' : ''}`}>{left === 0 ? 'Plus de changement' : `${left} changement${left > 1 ? 's' : ''} possible${left > 1 ? 's' : ''}`}</span>}
        </div>
        <div className="lu-bench-grid">
          {bench.length === 0 && <span className="muted small">Aucun remplaçant : recrute dans l’Effectif.</span>}
          {bench.map((p) => {
            const key = `bench:${p.id}`;
            const cls = ['lu-bchip', keyOf(sel) === key && 'sel', over === key && 'over', (ghost?.from === key || lift === key) && 'src', lift === key && 'lift'];
            return (
              <button key={p.id} type="button" data-drop={key} className={cls.filter(Boolean).join(' ')} {...handlers({ kind: 'bench', id: p.id })}>
                <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
                <span className="lu-bname">{names[p.id]}</span>
                <b>{fmtRating(playerRating(p))}</b>
              </button>
            );
          })}
        </div>
        <p className="lu-hint">{hint}</p>
      </div>
      {ghost && createPortal(
        <div className="lu-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          <span className="p2-num">{fmtRating(playerRating(ghost.p))}</span>
          <span className="p2-name">{names[ghost.p.id]}</span>
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
  const rating = lineupRating(state.players, state.lineup, formation);
  const save = (lineup, f = formation) => run((s) => { s.lineup = lineup; s.formation = f; return s; });
  const offPos = state.lineup.filter((id, k) => {
    const p = state.players.find((q) => q.id === id);
    return p && p.pos !== slotsOf(formation)[k];
  }).length;
  return (
    <div className="lu-editor">
      <section className="lu-main">
        <div className="pm-sub">
          <span className="eyebrow">Onze de départ · <span className="nowrap">{formationOf(formation).name}</span></span>
          <BestEleven players={state.players} lineup={state.lineup} formation={formation} onApply={(l) => save(l)} />
          <span className="pm-rating">Niveau <b>{fmtRating(rating)}</b></span>
        </div>
        <LineupBoard players={state.players} lineup={state.lineup} formation={formation} onChange={(l) => save(l)} />
      </section>
      <aside className="lu-side">
        <div className="lu-card">
          <span className="eyebrow">Dispositif</span>
          <FormationPicker value={formation} onChange={(f) => save(reshapeLineup(state.players, state.lineup, f), f)} />
          <p className="pm-blurb">{formationOf(formation).blurb}</p>
        </div>
        <div className="lu-card lu-legend">
          <span className="eyebrow">Repères</span>
          <p><i className="lu-dot" /><span>Le chiffre est le niveau du joueur <b>à ce poste</b>.</span></p>
          <p><i className="lu-dot off" /><span>Contour en pointillés rouges : il joue hors de son poste{offPos ? ` (${offPos} dans ton onze)` : ''}.</span></p>
          <p><i className="lu-dot alt" /><span>Joueur choisi : chaque poste affiche le niveau qu’il y aurait, en vert s’il y ferait mieux.</span></p>
          <p className="muted small">Ce onze est repris à l’avant-match, où tu peux encore le retoucher.</p>
        </div>
      </aside>
    </div>
  );
}
