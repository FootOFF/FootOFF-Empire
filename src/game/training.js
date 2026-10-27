import { DRILLS, PROGRAM_STEPS, TRAINING_COLLECTIVE, TRAINING_MULT } from './constants';
import { TRAITS, WEIGHTS, isInjured, playerRating } from './players';
import { nextFixture } from './cups';
import { pushJournal } from './journal';
import { clamp } from './utils';

// Centre d'entraînement. Entre deux matchs, une séance : quatre joueurs, un par ligne (gardien, défenseur, milieu,
// attaquant), chacun sur la catégorie de son choix, passent chacun une épreuve, jouée en 3D ou simulée. Simuler donne
// le gain moyen, assuré ; jouer rapporte plus avec un bon score, un peu moins avec un mauvais. Les progrès sont
// durables et plafonnés au potentiel. Après chaque match, les joueurs qui n'étaient pas à la séance progressent un
// peu (séance collective). Le bond de l'intersaison est réduit d'autant (players.js, progressPlayer).
// Les niveaux du centre : gains plus forts, une nouvelle épreuve à chaque niveau (2 à 5), programmes de signes
// distinctifs dès le niveau 3, séance collective plus forte. Les actions sont dans engine.js.

export { DRILLS, PROGRAM_STEPS };
export const LINES = ['G', 'D', 'M', 'A'];

// Catégories des joueurs de champ ; le gardien passe toujours une épreuve de gardien et choisit ce qu'il travaille.
export const FIELD_CATS = {
  tech: { label: 'Technique', short: 'Technique', attrs: ['fin', 'pas', 'dri'] },
  phys: { label: 'Physique', short: 'Physique', attrs: ['vit', 'end', 'pui'] },
  tac: { label: 'Tactique et mental', short: 'Tactique', attrs: ['pla', 'def', 'sfr'] },
};
export const GK_CATS = {
  reflexes: { label: 'Réflexes', short: 'Réflexes', attrs: ['ref', 'uns'] },
  placement: { label: 'Placement et sang-froid', short: 'Placement', attrs: ['gpl', 'gsf'] },
  relance: { label: 'Relance et jeu aérien', short: 'Relance', attrs: ['rel', 'aer'] },
};
export const catsFor = (pos) => (pos === 'G' ? GK_CATS : FIELD_CATS);
const familyOf = (pos, cat) => (pos === 'G' ? 'gk' : cat);
// épreuves ouvertes au niveau `lvl` pour une catégorie (la plus récente en dernier)
export const drillsFor = (lvl, pos, cat) => Object.keys(DRILLS).filter((id) => DRILLS[id].level <= lvl && DRILLS[id].family === familyOf(pos, cat));

// part de la marge vers le potentiel gagnée par une séance simulée (niveau 1, jeune joueur) ; 0,03 avant la 0.5.0 :
// un jeune entraîné à chaque date touchait son potentiel en une saison et demie
const SESSION = 0.012;
export const PLAY_MIN = 0.75; // épreuve jouée : facteur du gain pour un score nul…
export const PLAY_MAX = 1.5; // …et pour un score parfait ; un tiers des points vaut la simulation
export const factorOf = (score) => PLAY_MIN + (PLAY_MAX - PLAY_MIN) * clamp(score, 0, 1);
export const GREAT = 1.25; // facteur d'une épreuve très réussie (deux tiers des points) : compte double dans un programme
export const TRAIT_MAX = 3; // signes distinctifs positifs au plus

const r2 = (v) => Math.round(v * 100) / 100;
const poolOf = (p) => (p.pos === 'G' ? p.g : p.a);
const share = (p, k) => 0.5 + 4.5 * (WEIGHTS[p.pos][k] || 0);

// Rythme de progrès : un jeune progresse le plus vite, un trentenaire entretient surtout ; au sommet, chaque progrès
// coûte plus cher (comme le bond de l'intersaison, players.js).
const agePace = (age) => (age <= 19 ? 1 : age <= 23 ? 0.75 : age <= 27 ? 0.5 : age <= 30 ? 0.3 : 0.15);
export const paceOf = (p) => agePace(p.age) * clamp(1.4 - playerRating(p) / 20, 0.45, 1);

// Fenêtre de séance : jusqu'au prochain match (une séance par fenêtre), ou jusqu'à la fin de la saison.
export const windowKey = (s) => `${s.seasonNumber}:${nextFixture(s)?.index ?? 'fin'}`;
export const sessionOf = (s) => (s.training?.key === windowKey(s) ? s.training : { key: windowKey(s), done: {} });
export const sessionDone = (s) => LINES.every((pos) => sessionOf(s).done[pos] || !s.players.some((p) => p.pos === pos));

// Applique `points` de qualité aux qualités `attrs` (au prorata de leur part), sans dépasser 20 (ce qui ne passe pas
// revient aux autres qualités de la liste). Renvoie le gain de note.
function spend(p, attrs, points) {
  const pool = poolOf(p);
  const before = playerRating(p);
  let left = points;
  const add = {};
  for (let pass = 0; pass < 4 && left > 0.001; pass++) {
    const open = attrs.filter((k) => pool[k] + (add[k] || 0) < 20);
    const sum = open.reduce((a, k) => a + share(p, k), 0);
    if (!sum) break;
    let rest = 0;
    for (const k of open) {
      const want = (left * share(p, k)) / sum;
      const got = Math.min(want, 20 - pool[k] - (add[k] || 0));
      add[k] = (add[k] || 0) + got;
      rest += want - got;
    }
    left = rest;
  }
  for (const k of attrs) if (add[k]) pool[k] = clamp(r2(pool[k] + add[k]), 1, 20);
  return playerRating(p) - before;
}

// Points de qualité qui feraient gagner `gain` à la note avec la répartition de l'équipe première (toutes les
// qualités, les plus utiles au poste d'abord).
function pointsFor(p, gain) {
  let c = 0;
  let wc = 0;
  for (const k in poolOf(p)) { c += share(p, k); wc += (WEIGHTS[p.pos][k] || 0) * share(p, k); }
  return (gain * c) / wc;
}

// Séance d'un joueur : la marge vers son potentiel × la part d'une séance × son rythme × le niveau du centre ×
// l'épreuve × le score, en points de qualité répartis sur la catégorie travaillée. Une catégorie tournée vers les
// qualités clés du poste fait monter la note plus vite. Jamais au-delà du potentiel. Renvoie le gain de note.
function applySession(lvl, p, cat, drill, factor) {
  const room = Math.max(0, p.pot - playerRating(p));
  const attrs = catsFor(p.pos)[cat]?.attrs;
  if (!room || !lvl || !attrs) return 0;
  const points = pointsFor(p, room * SESSION * paceOf(p) * TRAINING_MULT[lvl] * (DRILLS[drill]?.bonus || 1) * factor);
  const pool = poolOf(p);
  const keep = { ...pool };
  let g = spend(p, attrs, points);
  if (g > room) { // au-delà du potentiel : la séance reprend avec ce qu'il fallait, pas plus
    Object.assign(pool, keep);
    g = spend(p, attrs, points * (room / g));
  }
  return g;
}

const copyOf = (p) => ({ ...p, a: { ...p.a }, g: p.g ? { ...p.g } : p.g });
// Gain de note d'une séance, sans rien toucher : simulée, et les bornes d'une épreuve jouée (score nul, parfait).
export function sessionPreview(s, p, cat, drill) {
  const lvl = s.buildings.training || 0;
  const at = (factor) => applySession(lvl, copyOf(p), cat, drill, factor);
  return { sim: at(1), min: at(PLAY_MIN), max: at(PLAY_MAX) };
}
// Qualités d'une catégorie après une séance (fiche : « FIN 12,4 → 12,7 »).
export function attrsAfter(s, p, cat, drill, factor = 1) {
  const q = copyOf(p);
  applySession(s.buildings.training || 0, q, cat, drill, factor);
  return Object.fromEntries(catsFor(p.pos)[cat].attrs.map((k) => [k, poolOf(q)[k]]));
}

// Catégorie conseillée : celle qui fait monter la note le plus vite (les qualités clés du poste).
export function bestCat(s, p) {
  const lvl = Math.max(1, s.buildings.training || 0);
  let best = null;
  for (const cat of Object.keys(catsFor(p.pos))) {
    const g = applySession(lvl, copyOf(p), cat, drillsFor(lvl, p.pos, cat)[0], 1);
    if (!best || g > best.g + 1e-9) best = { cat, g };
  }
  return best.cat;
}

// Joueur conseillé pour une ligne : celui qui progresserait le plus (les jeunes loin de leur potentiel d'abord).
export function suggestFor(s, pos) {
  const lvl = Math.max(1, s.buildings.training || 0);
  let best = null;
  for (const p of s.players) {
    if (p.pos !== pos || isInjured(p)) continue; // un blessé ne s'entraîne pas
    const cat = bestCat(s, p);
    const g = applySession(lvl, copyOf(p), cat, drillsFor(lvl, pos, cat)[0], 1);
    if (!best || g > best.g + 1e-9 || (Math.abs(g - best.g) < 1e-9 && playerRating(p) > playerRating(best.p))) best = { p, g };
  }
  return best?.p || null;
}

// Choix de la séance pour une ligne : le joueur, sa catégorie et son épreuve, gardés d'une séance à l'autre tant que le
// joueur a encore de la marge ; à défaut, le joueur dont le programme de signe avance avec la séance (le plus près du
// but), sinon le joueur conseillé, sur sa catégorie conseillée, avec l'épreuve la plus récente. Le staff fait les
// séances avec ces mêmes choix (staffSession) : ce que montre l'écran est ce qu'il fera.
export function pickOf(s, pos) {
  const lvl = Math.max(1, s.buildings.training || 0);
  const saved = s.training?.picks?.[pos];
  const p = (saved && s.players.find((q) => q.id === saved.id && q.pos === pos && !isInjured(q) && q.pot > playerRating(q) + 0.05))
    || programPlayer(s, pos) || suggestFor(s, pos);
  if (!p) return null;
  const same = saved && saved.id === p.id;
  const prog = programOf(s, p.id);
  const cat = same && catsFor(pos)[saved.cat] ? saved.cat : prog && catsFor(pos)[PROGRAMS[prog.id]?.cat] ? PROGRAMS[prog.id].cat : bestCat(s, p);
  const drills = drillsFor(lvl, pos, cat);
  const drill = same && saved.cat === cat && drills.includes(saved.drill) ? saved.drill : drills[drills.length - 1];
  return { id: p.id, cat, drill };
}

// --- Programmes de signes distinctifs (dès le niveau 3) -------------------------------------------------------
// Le signe visé, la catégorie dont les séances le font avancer, les postes concernés (là où il compte en match :
// live.js et tactics.js).
export const PROGRAMS = {
  finisseur: { trait: 'finisseur', cat: 'tech', pos: ['A', 'M'] },
  passeur: { trait: 'passeur', cat: 'tech', pos: ['M', 'A', 'D'] },
  frappe: { trait: 'frappe', cat: 'tech', pos: ['M', 'A'] },
  fleche: { trait: 'fleche', cat: 'phys', pos: ['A', 'M', 'D'] },
  infatigable: { trait: 'infatigable', cat: 'phys', pos: ['M', 'D', 'A'] },
  roc: { trait: 'roc', cat: 'tac', pos: ['D'] },
  leader: { trait: 'leader', cat: 'tac', pos: ['D', 'M', 'A'] },
  grandsSoirs: { trait: 'grandsSoirs', cat: 'tac', pos: ['M', 'A'] },
  calme: { remove: 'sangChaud', cat: 'tac', pos: ['D', 'M', 'A'], label: 'Maîtrise de soi', desc: 'Perd le signe « Sang chaud » : moins de cartons.' },
  chat: { trait: 'chat', cat: 'reflexes', pos: ['G'] },
  leaderG: { trait: 'leader', cat: 'placement', pos: ['G'] },
};
export const programLabel = (id) => PROGRAMS[id].label || TRAITS[PROGRAMS[id].trait].name;
export const programDesc = (id) => PROGRAMS[id].desc || TRAITS[PROGRAMS[id].trait].desc;
const positives = (p) => (p.traits || []).filter((t) => t !== 'sangChaud');
export const programOf = (s, id) => s.training?.programs?.[id] || null;

// Programmes qu'un joueur peut commencer : selon son poste et ses signes, si le centre a le niveau 3.
export function programsFor(s, p) {
  if ((s.buildings.training || 0) < 3) return [];
  return Object.keys(PROGRAMS).filter((id) => {
    const g = PROGRAMS[id];
    if (!g.pos.includes(p.pos)) return false;
    if (g.remove) return (p.traits || []).includes(g.remove);
    return !(p.traits || []).includes(g.trait) && positives(p).length < TRAIT_MAX;
  });
}
// Séances nécessaires (le centre amélioré en cours de programme raccourcit ce qui reste)
export const programNeed = (s, prog) => Math.min(prog.need, PROGRAM_STEPS[s.buildings.training || 0] || prog.need);

export function startProgram(s, playerId, id) {
  const p = s.players.find((q) => q.id === playerId);
  if (!p || !programsFor(s, p).includes(id)) return null;
  const need = PROGRAM_STEPS[s.buildings.training || 0];
  s.training = { ...(s.training || {}), programs: { ...(s.training?.programs || {}), [playerId]: { id, steps: 0, need, since: s.seasonNumber } } };
  return s;
}

export function stopProgram(s, playerId) {
  if (!programOf(s, playerId)) return null;
  const programs = { ...s.training.programs };
  delete programs[playerId];
  s.training = { ...s.training, programs };
  return s;
}

// --- Séance ------------------------------------------------------------------------------------------------------

// Une épreuve terminée, jouée (score de 0 à 1) ou simulée (score null) : progrès du joueur, ligne marquée pour cette
// fenêtre, programme avancé (deux pas pour une épreuve très réussie), signe appris au bout du programme. Renvoie
// l'état, ou null si l'épreuve n'est pas possible.
export function trainLine(s, pos, { id, cat, drill, score = null }) {
  const p = s.players.find((q) => q.id === id && q.pos === pos);
  const lvl = s.buildings.training || 0;
  if (!p || isInjured(p) || !lvl || !catsFor(pos)[cat] || !drillsFor(lvl, pos, cat).includes(drill)) return null;
  const session = sessionOf(s);
  if (session.done[pos]) return null;
  const factor = score === null ? 1 : factorOf(score);
  const before = playerRating(p);
  const gain = applySession(lvl, p, cat, drill, factor);
  const result = { id, name: p.name, cat, drill, score, gain: r2(gain), before: r2(before), after: r2(playerRating(p)), learned: null, steps: null };
  const programs = { ...(s.training?.programs || {}) };
  const prog = programs[id];
  if (prog && PROGRAMS[prog.id]?.cat === cat) {
    const need = programNeed(s, prog);
    const steps = Math.min(need, prog.steps + (factor >= GREAT ? 2 : 1));
    result.steps = [steps, need, prog.id];
    if (steps >= need) {
      const g = PROGRAMS[prog.id];
      p.traits = g.remove ? (p.traits || []).filter((t) => t !== g.remove) : [...(p.traits || []).filter((t) => t !== g.trait), g.trait];
      result.learned = prog.id;
      delete programs[id];
    } else programs[id] = { ...prog, steps, need };
  }
  s.training = {
    ...(s.training || {}),
    key: session.key,
    done: { ...session.done, [pos]: result },
    picks: { ...(s.training?.picks || {}), [pos]: { id, cat, drill } },
    programs,
    log: [{ season: s.seasonNumber, key: session.key, pos, ...result }, ...(s.training?.log || [])].slice(0, 60),
  };
  return s;
}

// --- Séances confiées au staff (réglage du centre d'entraînement, 0.5.1) ------------------------------------------
// Avant chaque match (avant-match, match joué d'un bloc), le staff simule les épreuves que tu n'as pas faites, avec les
// choix de la séance (pickOf : tes choix, sinon le joueur en programme ou le conseillé) : gain moyen assuré, comme
// « Tout simuler ». Renvoie les épreuves faites.
export const staffOn = (s) => !!s.training?.staff;
export function setStaff(s, on) {
  s.training = { ...(s.training || {}), staff: !!on };
  return s;
}
// joueur de la ligne dont un programme de signe est en cours (le plus près du but), ou null
function programPlayer(s, pos) {
  const progs = s.training?.programs || {};
  return s.players
    .filter((p) => p.pos === pos && !isInjured(p) && progs[p.id] && catsFor(pos)[PROGRAMS[progs[p.id].id]?.cat])
    .sort((a, b) => (programNeed(s, progs[a.id]) - progs[a.id].steps) - (programNeed(s, progs[b.id]) - progs[b.id].steps))[0] || null;
}
export function staffSession(s) {
  if (!staffOn(s) || !(s.buildings.training > 0)) return [];
  const done = [];
  for (const pos of LINES) {
    if (sessionOf(s).done[pos]) continue;
    const pick = pickOf(s, pos);
    if (!pick || !trainLine(s, pos, { ...pick, score: null })) continue;
    const r = s.training.done[pos];
    if (r.learned) journalLearned(s, r);
    done.push(r);
  }
  return done;
}

// Un signe distinctif appris au bout d'un programme entre au journal.
export function journalLearned(s, r) {
  const removed = !!PROGRAMS[r.learned].remove;
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'entrainement',
    title: removed ? `${r.name} apprend à se maîtriser` : `${r.name} gagne un signe distinctif : ${programLabel(r.learned)}`,
    text: `Au bout de son programme au centre d’entraînement. ${programDesc(r.learned)}`,
  });
}

// Choix gardé pour la séance (sans s'entraîner) : joueur, catégorie, épreuve.
export function setPick(s, pos, pick) {
  const p = s.players.find((q) => q.id === pick.id && q.pos === pos);
  if (!p || isInjured(p) || !catsFor(pos)[pick.cat]) return null;
  s.training = { ...(s.training || {}), picks: { ...(s.training?.picks || {}), [pos]: { id: pick.id, cat: pick.cat, drill: pick.drill } } };
  return s;
}

// Après chaque match : séance collective pour les joueurs qui n'étaient pas à la séance de la fenêtre qui se termine
// (`key`), avec la répartition de l'équipe première, plafonnée au potentiel.
export function collectiveSession(s, key) {
  const lvl = s.buildings.training || 0;
  if (!lvl) return;
  const trained = s.training?.key === key ? Object.values(s.training.done || {}).map((d) => d.id) : [];
  let n = 0;
  let total = 0;
  for (const p of s.players) {
    if (trained.includes(p.id) || isInjured(p)) continue; // les blessés sont à l'infirmerie
    const room = Math.max(0, p.pot - playerRating(p));
    if (!room) continue;
    const g = spend(p, Object.keys(poolOf(p)), pointsFor(p, room * TRAINING_COLLECTIVE[lvl] * paceOf(p)));
    if (g > 0) { n += 1; total += g; }
  }
  s.training = { ...(s.training || {}), collective: { season: s.seasonNumber, key, players: n, gain: r2(total) } };
}

// Programmes et choix des joueurs partis (vendus, retraités) : effacés.
export function tidyTraining(s) {
  if (!s.training) return s;
  const ids = new Set(s.players.map((p) => p.id));
  const programs = Object.fromEntries(Object.entries(s.training.programs || {}).filter(([id]) => ids.has(Number(id))));
  const picks = Object.fromEntries(Object.entries(s.training.picks || {}).filter(([, v]) => ids.has(v.id)));
  s.training = { ...s.training, programs, picks };
  return s;
}
