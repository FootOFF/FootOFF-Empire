// Réglage « Fluidité sur appareil lent » (Réglages de l'écran titre et du menu pause ; par appareil, coupé par défaut).
// Coupé, la règle du jeu tient : la 3D est toujours calculée à la pleine résolution de l'écran (environment.js). Actif,
// et seulement quand l'image tombe sous 24 par seconde, elle est calculée avec moins de pixels, par paliers, juste
// assez pour redevenir fluide (image un peu plus douce) ; elle remonte d'un palier quand elle redevient très fluide.
// Sur une tablette d'entrée de gamme, la carte graphique est 30 à 80 fois moins puissante que la puce intégrée d'un
// PC : en pleine résolution, le complexe y tournait à 3 images par seconde.
// Réglage coupé, un appareil qui reste sous 15 images par seconde se le voit proposer une fois (App, onLag).

const KEY = 'fo-fluid';
const LEVEL_KEY = 'fo-fluid-level'; // dernier palier trouvé sur cet appareil : la partie suivante repart de là
const LEVELS = [1, 0.85, 0.72, 0.6, 0.5, 0.42, 0.35]; // part de la densité de l'écran (1 : pleine résolution)
const FLOOR = 0.5; // jamais moins d'un pixel calculé pour deux pixels de la page, en largeur
const SLOW = 1000 / 24; // image moyenne plus longue : un palier de moins
const FAST = 1000 / 50; // plus courte deux mesures de suite : un palier de plus
const LAG = 1000 / 15; // réglage coupé : plus longue trois mesures de suite, le jeu propose le réglage
const WINDOW = 1500; // ms d'images par mesure
const SETTLE = 600; // ms ignorées après un changement de palier (nouvelle toile, à-coup d'un instant)
const HOLD = 20000; // après une baisse, pas de remontée avant 20 s (pas de va-et-vient entre deux paliers)

let enabled = false;
let deviceLevel = 0;
try {
  enabled = localStorage.getItem(KEY) === 'on';
  deviceLevel = Math.max(0, Math.min(LEVELS.length - 1, Number(localStorage.getItem(LEVEL_KEY)) || 0));
} catch { /* préférences indisponibles */ }

export const fluidEnabled = () => enabled;
export function setFluid(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* préférence non conservée */ }
}

const maxLevel = () => {
  const dpr = window.devicePixelRatio || 1;
  let k = 0;
  while (k + 1 < LEVELS.length && dpr * LEVELS[k + 1] >= FLOOR) k++;
  return k;
};

// Une boucle de rendu (complexe, épreuves) : frame(dt) à chaque image dessinée, avec le temps réel écoulé depuis
// l'image dessinée précédente (null si la précédente ne l'a pas été) ; scale : la part de la densité de l'écran à
// appliquer. apply(scale) est appelé à chaque changement de palier.
export function createFluidity({ apply, onLag = null }) {
  let on = enabled;
  let level = on ? Math.min(deviceLevel, maxLevel()) : 0;
  let sum = 0;
  let n = 0;
  let settle = 0;
  let fastRuns = 0;
  let lagRuns = 0;
  let holdUp = 0;
  const set = (k, now) => {
    if (k === level) return;
    if (k > level) holdUp = now + HOLD;
    level = k;
    settle = SETTLE;
    sum = 0;
    n = 0;
    fastRuns = 0;
    if (on) {
      deviceLevel = k;
      try { localStorage.setItem(LEVEL_KEY, String(k)); } catch { /* palier non conservé */ }
    }
    apply(LEVELS[k]);
  };
  return {
    get scale() { return LEVELS[level]; },
    frame(dt, now = performance.now()) {
      if (on !== enabled) { // réglage changé : coupé, pleine résolution tout de suite ; actif, le palier de l'appareil
        on = enabled;
        level = on ? Math.min(deviceLevel, maxLevel()) : 0;
        settle = SETTLE;
        sum = 0;
        n = 0;
        fastRuns = 0;
        lagRuns = 0;
        apply(LEVELS[level]);
        return;
      }
      // à-coup isolé (onglet repris, appel système) : on remesure ; une image d'une seconde, elle, compte : c'est
      // justement l'appareil trop lent (la boucle qui ne dessine pas, en pause, envoie null)
      if (dt == null || dt > 2500) { sum = 0; n = 0; return; }
      if (settle > 0) { settle -= dt; return; }
      sum += dt;
      n += 1;
      if (sum < WINDOW) return;
      const avg = sum / n;
      sum = 0;
      n = 0;
      if (!on) {
        lagRuns = avg > LAG ? lagRuns + 1 : 0;
        if (lagRuns >= 3) { lagRuns = 0; onLag?.(); }
        return;
      }
      if (avg > SLOW) { if (level < maxLevel()) set(level + 1, now); return; }
      fastRuns = avg < FAST ? fastRuns + 1 : 0;
      if (fastRuns >= 2 && level > 0 && now > holdUp) set(level - 1, now);
    },
  };
}
