import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IconAcademy, IconAlert, IconCheck, IconChevron, IconEmpire, IconStar, IconTraining, IconTransfer, IconTrophy } from './icons';

// Notifications du jeu, façon console : un seul bandeau à la fois, qui descend du haut de l'écran puis repart (au
// centre, sur la ligne de la barre du haut sur grand écran, juste dessous sinon ; par-dessus la barre sur
// téléphone, comme une notification du système). File d'attente : rien ne s'affiche pendant un écran cinématique
// (avant-match, direct, après-match, bilan), le menu pause ou une confirmation, sauf un avertissement qui suit un
// geste du joueur ; la file reprend ensuite, dans l'ordre. Plusieurs succès d'un coup tiennent dans un bandeau.
// Survolé (souris) ou touché et tenu, le bandeau reste ; un geste vers le haut le chasse ; s'il annonce quelque
// chose à voir, un clic l'ouvre (flèche à droite).

const KINDS = {
  achievement: { Icon: IconTrophy, ms: 4600, sound: 'achievement' },
  build: { Icon: IconEmpire, ms: 3400, sound: 'notify' },
  mercato: { Icon: IconTransfer, ms: 4600, sound: 'notify' },
  academy: { Icon: IconAcademy, ms: 4200, sound: 'notify' },
  training: { Icon: IconTraining, ms: 4200, sound: 'notify' },
  success: { Icon: IconCheck, ms: 3200, sound: 'notify' },
  info: { Icon: IconStar, ms: 3400, sound: 'notify' },
  warn: { Icon: IconAlert, ms: 3200, sound: 'error' },
};
const GAP_MS = 140; // respiration entre deux bandeaux
const OUT_MS = 220; // sortie (styles.css, .nt-card.out)

// File des notifications. held : le jeu montre un écran qui ne doit pas être couvert.
export function useNotifications(held) {
  const [queue, setQueue] = useState([]);
  const seq = useRef(0);
  // un avertissement (geste refusé) passe devant : il répond à ce que le joueur vient de faire
  // key : un bandeau plus récent de même clé remplace celui encore en attente (une validation refaite, par exemple)
  const notify = useCallback((n) => {
    const item = { kind: 'info', ...n, id: ++seq.current };
    setQueue((q) => {
      const rest = item.key ? q.filter((x, i) => i === 0 || x.key !== item.key) : q;
      return item.kind === 'warn' ? [item, ...rest] : [...rest, item];
    });
  }, []);
  const done = useCallback((id) => setQueue((q) => q.filter((x) => x.id !== id)), []);
  const current = queue.find((n) => !held || n.kind === 'warn') || null;
  return { notify, current, done };
}

export function Notifications({ current, done, onAction, sound }) {
  const [shown, setShown] = useState(null); // bandeau à l'écran (gardé pendant sa sortie)
  const [out, setOut] = useState(false);
  const [paused, setPaused] = useState(false);
  const left = useRef(0); // temps d'affichage restant (ms)
  const drag = useRef(null);
  const swiped = useRef(false); // chassé d'un geste vers le haut : le clic qui suit n'ouvre rien

  // un nouveau bandeau entre après la sortie du précédent et une courte respiration
  useEffect(() => {
    if (!current || (shown && shown.id === current.id)) return undefined;
    if (shown) return undefined; // le précédent sort encore
    const t = setTimeout(() => {
      left.current = (KINDS[current.kind] || KINDS.info).ms;
      setOut(false); setPaused(false);
      setShown(current);
      sound?.((KINDS[current.kind] || KINDS.info).sound);
    }, GAP_MS);
    return () => clearTimeout(t);
  }, [current, shown, sound]);

  // un écran qui ne doit pas être couvert s'ouvre (avant-match, menu pause…) : le bandeau s'efface sans être
  // consommé, il reviendra en entier ensuite
  useEffect(() => {
    if (shown && !out && (!current || current.id !== shown.id)) setShown(null);
  }, [current, shown, out]);

  const leave = useCallback(() => setOut(true), []);
  // minuterie d'affichage, suspendue au survol ou au doigt posé
  useEffect(() => {
    if (!shown || out || paused) return undefined;
    const start = performance.now();
    const t = setTimeout(leave, Math.max(0, left.current));
    return () => { clearTimeout(t); left.current -= performance.now() - start; };
  }, [shown, out, paused, leave]);
  useEffect(() => {
    if (!out || !shown) return undefined;
    const t = setTimeout(() => { done(shown.id); setShown(null); setOut(false); }, OUT_MS);
    return () => clearTimeout(t);
  }, [out, shown, done]);

  if (!shown) return <div className="nt-lane" aria-live="polite" />;
  const K = KINDS[shown.kind] || KINDS.info;
  const go = () => {
    if (swiped.current) { swiped.current = false; return; }
    if (shown.action) onAction?.(shown.action);
    leave();
  };
  return (
    <div className="nt-lane" aria-live="polite">
      <button
        type="button"
        key={shown.id}
        className={`nt-card nt-${shown.kind} ${out ? 'out' : ''} ${paused ? 'paused' : ''} ${shown.action ? 'has-action' : ''}`}
        onClick={go}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPaused(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPaused(false); }}
        onPointerDown={(e) => { drag.current = e.clientY; swiped.current = false; if (e.pointerType !== 'mouse') setPaused(true); }}
        onPointerMove={(e) => { if (drag.current !== null && e.clientY - drag.current < -24) { drag.current = null; swiped.current = true; leave(); } }}
        onPointerUp={(e) => { drag.current = null; if (e.pointerType !== 'mouse') setPaused(false); }}
        onPointerCancel={() => { drag.current = null; setPaused(false); }}
      >
        <span className="nt-icon"><K.Icon /></span>
        <span className="nt-text">
          {shown.eyebrow && <span className="nt-eyebrow">{shown.eyebrow}</span>}
          <span className="nt-title">{shown.title}</span>
          {shown.text && <span className="nt-sub">{shown.text}</span>}
        </span>
        {shown.action && <span className="nt-go" aria-hidden="true"><IconChevron /></span>}
        <i className="nt-timer" style={{ animationDuration: `${K.ms}ms` }} />
      </button>
    </div>
  );
}
