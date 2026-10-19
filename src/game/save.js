import { SAVE_KEY } from './constants';
import { initGoals } from './goals';
import { ensureFixedPlots } from './map';
import { ensureLineup } from './tactics';
import { addReserves } from './engine';
import { ensureTutorial } from './tutorial';

export function saveGame(state) {
  try {
    state.version = 3;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  } catch {
    /* stockage indisponible : le prototype reste jouable sans sauvegarde */
  }
}

// Migration : les sauvegardes v1 (avant l'Empire) n'ont ni goals ni seasonStats.
function migrate(s) {
  if (!s.goals) initGoals(s);
  if (!s.seasonStats) s.seasonStats = { crowd: false };
  s.version = 2;
  return s;
}

// v2 → v3 : nouvelle économie (montants ×12 environ) ; la trésorerie suit la même échelle.
function migrateEconomy(s) {
  s.money = Math.round(s.money * 12);
  s.version = 3;
  return s;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // toute sauvegarde : le stade retrouve sa parcelle (réparation des parties déjà commencées)
    // parties commencées avant le match en direct : banc de 4 remplaçants offert une fois
    const fix = (x) => ensureTutorial(ensureLineup(addReserves(ensureFixedPlots(x))));
    if (s.version === 3) return fix(s);
    if (s.version === 2) return fix(migrateEconomy(s));
    if (s.version === 1) return fix(migrateEconomy(migrate(s)));
    return null;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* rien à nettoyer */
  }
}
