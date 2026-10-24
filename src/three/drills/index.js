import { createStage } from './stage';
import { createFreeKicks, createPrecision } from './precision';
import { createPenalties, createSaves } from './arrets';
import { createSprint } from './sprint';
import { createReading } from './lecture';
import { createCrosses } from './centres';
import { createCounter } from './contre';

// Moteur des épreuves du centre d'entraînement (chargé à part, à la première épreuve) : la scène du terrain
// d'entraînement et l'épreuve en cours. L'interface (src/ui/drill.jsx) affiche l'intro, le compte à rebours, le
// tableau de bord et les résultats ; le moteur lui envoie le tableau de bord (hud), les gains de points à l'écran
// (pop), les sons (sfx) et le score final (end, de 0 à 1).

const DRILLS = { precision: createPrecision, arrets: createSaves, sprint: createSprint, lecture: createReading, coupsFrancs: createFreeKicks, penalties: createPenalties, centres: createCrosses, contre: createCounter };
export const drillReady = (id) => !!DRILLS[id];

export function createDrillEngine(canvas, { onHud, onPop, onEnd, onError, sfx }) {
  const stage = createStage(canvas);
  if (import.meta.env.DEV) window.__drillStage = stage; // mesures en développement (temps de rendu)
  let drill = null;
  let mode = 'idle'; // intro | play | done
  let paused = false;
  // Une erreur dans l'épreuve (boucle d'images, hors de portée de la barrière d'erreur React) ne fige plus l'écran :
  // l'épreuve s'arrête, l'interface est prévenue (onError) et propose de simuler ou de fermer.
  stage.onTick((dt, t) => {
    if (!drill || paused || mode === 'done') return;
    try {
      drill.update(dt, t);
    } catch (e) {
      console.warn('[drill] erreur pendant l’épreuve', e);
      mode = 'done';
      onError?.(e);
    }
  });
  const ctx = {
    hud: (h) => onHud?.(h),
    pop: (p) => onPop?.(p),
    sfx: (k) => sfx?.(k),
    end: (score, detail) => {
      if (mode === 'done') return;
      mode = 'done';
      onEnd?.(Math.max(0, Math.min(1, score)), detail);
    },
  };
  return {
    load(id, info = {}) {
      drill?.dispose();
      drill = DRILLS[id](stage, { ...ctx, info });
      mode = 'intro';
      paused = false;
      drill.intro();
    },
    start() { if (drill && mode === 'intro') { mode = 'play'; drill.start(); } },
    press(e) { if (mode === 'play' && !paused) drill?.press?.(e); },
    release(e) { if (mode === 'play' && !paused) drill?.release?.(e); },
    move(e) { if (mode === 'play' && !paused) drill?.move?.(e); }, // doigt ou souris qui glisse (frappes)
    dir(d) { if (mode === 'play' && !paused) drill?.dir?.(d); },
    pause(v) { paused = !!v; },
    get mode() { return mode; },
    get debug() { return drill?.debug || null; }, // développement : état de l'épreuve en cours
    dispose() { drill?.dispose(); drill = null; stage.dispose(); },
  };
}
