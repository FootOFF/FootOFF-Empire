import { clamp } from './utils';
import { hash } from './faces';
import { TACTICS, formationOf } from './tactics';
import { planValue } from './zones';

// Cohérence tactique (1.0.39). Vision du PDG (12/11 au soir) : « Football Manager, c'est surtout un plan cohérent, une
// tactique cohérente », pas « répondre au plan de l'adversaire tout le temps ». Ses choix :
// - le cœur : le plan colle à ses joueurs (le gros de l'effet) ;
// - les réglages cohérents entre eux (les trois plans le sont par construction ; le mode expert devra le vérifier) ;
// - un peu l'adversaire (léger) ;
// - rien ne s'affiche : seuls les résultats le disent (le commentaire raconte le match, sans chiffre).
// Le plan agit en « niveaux » qui s'ajoutent à l'écart de niveau des deux onze (tactics.js, expectedGoals), et sur
// l'ouverture du match (le volume des occasions des deux côtés). Ce module ne tire aucun hasard.
// Remplace le duel tactique de la 1.0.35 (jamais publié), dont il garde le profil des onze, l'identité de jeu des clubs
// de l'ordinateur et leur réaction à la pause.

// Profil d'un onze, relatif à lui-même : pour chaque trait de jeu, l'écart entre la caractéristique des joueurs concernés
// et la moyenne de toutes leurs caractéristiques (de −5 à +5). Le niveau compte déjà dans l'écart de niveau ; ici, c'est
// la forme de l'équipe (rapide, puissante, technique, endurante…) qui compte.
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const attrsMean = (p) => mean(Object.values(p.a).filter(Number.isFinite));
function rel(players, key) {
  const ps = players.filter((p) => p?.a && Number.isFinite(p.a[key]));
  return ps.length ? clamp(mean(ps.map((p) => p.a[key])) - mean(ps.map(attrsMean)), -5, 5) : 0;
}
export const NEUTRAL_PROFILE = Object.freeze({ pace: 0, air: 0, build: 0, defPace: 0, engine: 0, wall: 0 });
// forme ordinaire d'un onze (moyenne de 2 000 onze tirés comme ceux du jeu, tools/sim/coherence.mjs) : un défenseur est
// toujours meilleur en défense qu'ailleurs ; le profil compte ce qui sort de l'ordinaire pour le poste
const BASE = { pace: 0.45, air: -0.18, build: 0.3, defPace: -0.18, engine: -0.52, wall: 2.72 };
export function profileOf(players) {
  const field = (players || []).filter((p) => p?.a && p.pos !== 'G');
  if (!field.length) return NEUTRAL_PROFILE;
  const by = (pos) => field.filter((p) => p.pos === pos);
  const front = by('A').length >= 2 ? by('A') : [...by('A'), ...by('M')];
  const back = by('D').length ? by('D') : field;
  return {
    pace: rel(front, 'vit') - BASE.pace, // vitesse des attaquants : les contres
    air: rel(front, 'pui') - BASE.air, // puissance des attaquants : les centres, le jeu aérien
    build: rel([...back, ...by('M')], 'pas') - BASE.build, // passe des défenseurs et des milieux : relancer, faire circuler
    defPace: rel(back, 'vit') - BASE.defPace, // vitesse des défenseurs : couvrir la profondeur derrière une ligne haute
    engine: rel(field, 'end') - BASE.engine, // endurance : tenir un pressing jusqu'au bout
    wall: rel(back, 'def') - BASE.wall, // défense des défenseurs : tenir un bloc
  };
}

const planId = (id) => (TACTICS[id] ? id : 'balanced');
// Ce que chaque plan demande aux joueurs, en niveaux par point de profil. L'Offensive (pressing haut, ligne haute) veut du
// souffle, des défenseurs rapides et une relance propre ; le Bloc bas, une défense solide et des attaquants rapides pour
// contrer ; l'Équilibrée, de la passe, du jeu aérien devant et un peu de solidité. Un onze au profil plat joue à peu près
// pareil avec les trois ; un onze typé gagne nettement à jouer le plan qui lui ressemble (mesures : tools/sim/coherence.mjs).
const NEEDS = {
  offensive: { engine: 0.78, defPace: 0.65, build: 0.52 },
  balanced: { build: 0.45, air: 0.32, wall: 0.25 },
  low: { wall: 0.78, pace: 0.75, air: 0.15 },
};
export function fitOf(plan, P, minute = 45) {
  const id = planId(plan);
  let v = 0;
  for (const [k, w] of Object.entries(NEEDS[id])) v += w * (P[k] || 0);
  // le pressing s'use après l'heure de jeu, d'autant plus vite que l'équipe manque de souffle
  if (id === 'offensive' && minute > 60) v -= Math.min(1, (minute - 60) / 30) * 0.3 * clamp(1 - P.engine / 1.5, 0, 2);
  return v;
}

// Un peu l'adversaire (choix du PDG : « léger ») : l'Offensive gêne l'Équilibrée, l'Équilibrée use le Bloc bas, le Bloc
// bas punit l'Offensive, au tiers du duel de la 1.0.35.
const CYCLE = {
  offensive: { offensive: 0, balanced: 0.4, low: -0.35 },
  balanced: { offensive: -0.4, balanced: 0, low: 0.28 },
  low: { offensive: 0.35, balanced: -0.28, low: 0 },
};
// ce qui se voit quand un plan colle nettement à ses joueurs (commentaire du direct, type des actions)
const KEY = { offensive: 'press', balanced: 'wide', low: 'counter' };

// us, them : { tactic, formation, players (sur le terrain) } ; minute : le pressing s'use. Renvoie { adv, vol, key, by } :
// adv, l'avantage de us en niveaux (négatif : celui de them) ; vol, l'ouverture du match ; key, ce qui fait la différence
// (« press », « wide », « counter ») ; by, le camp qui en profite (1 : us, −1 : them).
export function tacticalFit(us, them, minute = 45) {
  const a = planId(us.tactic);
  const b = planId(them.tactic);
  const P = us.profile || profileOf(us.players);
  const Q = them.profile || profileOf(them.players);
  const fa = fitOf(a, P, minute);
  const fb = fitOf(b, Q, minute);
  let adv = fa - fb + CYCLE[a][b];
  // dispositifs : un milieu plus fourni contrôle le jeu ; une défense à trois souffre contre l'Offensive (ses couloirs),
  // une défense à cinq la contient
  const la = formationOf(us.formation).lines;
  const lb = formationOf(them.formation).lines;
  adv += 0.06 * (la[1] - lb[1]);
  const vsOff = (lines, opp) => (opp !== 'offensive' ? 0 : lines[0] === 3 ? -0.15 : lines[0] === 5 ? 0.12 : 0);
  adv += vsOff(la, b) - vsOff(lb, a);
  let key = null;
  let by = 0;
  if (fa >= 0.3 && fa - fb >= 0.25) { key = KEY[a]; by = 1; } else if (fb >= 0.3 && fb - fa >= 0.25) { key = KEY[b]; by = -1; }
  // ouverture : chaque équipe à l'Offensive ouvre le match, chaque bloc bas le ferme (des deux côtés)
  const open = (id) => (id === 'offensive' ? 0.12 : id === 'low' ? -0.13 : 0);
  return { adv: clamp(adv, -2, 2), vol: 1 + open(a) + open(b), key, by };
}

// Identité de jeu d'un club de l'ordinateur : son plan de cœur, tiré de son nom, le même saison après saison.
const IDENTITY = [['offensive', 3], ['balanced', 4], ['low', 3]];
export function identityOf(name) {
  let r = (hash(`${name}|identite`) >>> 0) % 10;
  return (IDENTITY.find(([, w]) => (r -= w) < 0) || IDENTITY[1])[0];
}
// Plan d'un club de l'ordinateur pour un match : un club cohérent, qui joue le plan qui colle à ses joueurs, avec un
// penchant pour son identité ; plus fort que son adversaire, il attaque plus volontiers ; nettement plus faible, il se
// regroupe. gap : son niveau moins celui d'en face ; players : son onze (sans lui, son identité et le rapport de force).
const UP = { low: 'balanced', balanced: 'offensive', offensive: 'offensive' };
const DOWN = { offensive: 'balanced', balanced: 'low', low: 'low' };
// vs (1.0.49) : le onze d'en face et son dispositif ({ players, formation }), quand on les connaît (en solo : il a observé
// ton effectif, pas ton plan)
export function aiPlanOf(name, gap, players = null, formation = null, vs = null) {
  const id = identityOf(name);
  if (!players?.length) return gap <= -1.2 ? DOWN[id] : gap >= 1.2 ? UP[id] : id;
  // 1.0.49 : ce que chaque plan rapporte à ses joueurs, mesuré par le moteur à zones (occasions nettes par match), avec un
  // penchant pour son identité ; plus fort, il attaque plus volontiers ; nettement plus faible, il se regroupe
  const f = formation || '433';
  const score = (plan) => planValue(players, f, plan, vs) + (plan === id ? 0.5 : 0) + (plan === 'offensive' ? 0.15 * gap : plan === 'low' ? -0.25 * gap : 0);
  return ['balanced', 'offensive', 'low'].reduce((best, x) => (score(x) > score(best) + 1e-9 ? x : best), 'balanced');
}
// À la pause, il réagit au score (lead : son avance) : mené de deux buts, il attaque ; mené d'un, il monte d'un cran ;
// devant et plus faible, il recule d'un cran ; sinon il garde son plan.
export function aiHalftimePlan(plan, lead, gap) {
  if (lead <= -2) return 'offensive';
  if (lead === -1) return UP[plan];
  if (lead >= 1 && gap < 0) return DOWN[plan];
  return plan;
}
