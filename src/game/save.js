import { SAVE_KEY } from './constants';
import { initGoals } from './goals';
import { ensureFixedPlots } from './map';
import { ensureLineup } from './tactics';
import { addReserves } from './engine';

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
    if (s.version === 3) return ensureLineup(addReserves(ensureFixedPlots(s)));
    if (s.version === 2) return ensureLineup(addReserves(ensureFixedPlots(migrateEconomy(s))));
    if (s.version === 1) return ensureLineup(addReserves(ensureFixedPlots(migrateEconomy(migrate(s)))));
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
