// Vibrations légères (téléphones Android ; Safari sur iPhone ne les permet pas aux pages web).
// Désactivables dans le menu, préférence par appareil. Une vibration importante (but) n'est pas coupée par une
// plus anodine qui arriverait juste après (la dépense qui suit une construction, par exemple).

const KEY = 'fo-vibration';
const PATTERNS = { tap: 8, spend: 15, gain: [12, 40, 12], build: [18, 50, 28], goal: [50, 70, 50, 70, 140] };
const PRIORITY = { tap: 0, spend: 1, gain: 1, build: 2, goal: 3 };

let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* préférence indisponible */ }
let busy = { until: 0, prio: -1 };

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export const vibrationEnabled = () => enabled;

export function setVibration(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* préférence non conservée */ }
  if (on) haptic('tap'); // on sent tout de suite que c'est réactivé
}

export function haptic(kind) {
  if (!enabled || !canVibrate()) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // bloqué avant un vrai geste
  const now = performance.now();
  const prio = PRIORITY[kind] ?? 0;
  if (now < busy.until && prio < busy.prio) return;
  const pattern = PATTERNS[kind] ?? 10;
  busy = { until: now + [].concat(pattern).reduce((a, b) => a + b, 0) + 250, prio };
  try { navigator.vibrate(pattern); } catch { /* vibration indisponible */ }
}
