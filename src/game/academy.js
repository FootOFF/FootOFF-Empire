import { POS_LABELS, SCOUTED, YOUTH_GEN, YOUTH_LEAVE_AGE, YOUTH_PLACES } from './constants';
import { leagueLength } from './cups';
import { pushJournal } from './journal';
import { ATTRS, SUMMER, WEIGHTS, makePlayer, playerRating, seasonGain } from './players';
import { clamp, ri, rnd } from './utils';

// Académie : l'équipe de jeunes du club, six places. On recrute quand on veut, gratuitement, parmi les jeunes repérés
// (renouvelés après chaque journée de championnat, toutes les deux en Élite ; plus nombreux et plus doués quand
// l'académie grandit, leur potentiel mieux cerné : players.js, potentialRange). Chaque jeune suit un plan d'entraînement
// (technique, physique ou mental) : il progresse un peu après chaque journée et fait un bond à l'intersaison, selon
// son potentiel (le centre
// d'entraînement n'y change rien : il fait progresser l'équipe première, par ses séances). Il monte en équipe première
// quand on le décide ; à 19 ans, un jeune qui n'est pas monté quitte le club. Pas de salaire : les jeunes sont à la
// charge de l'académie (son entretien). Les actions (recruter, faire monter, libérer, choisir le plan) sont dans
// engine.js.

export { SCOUTED, YOUTH_LEAVE_AGE, YOUTH_PLACES };
export const PLANS = {
  tech: { label: 'Technique', fam: 'tech', gk: ['rel', 'aer'] },
  phys: { label: 'Physique', fam: 'phys', gk: ['ref', 'uns'] },
  mental: { label: 'Mental', fam: 'tac', gk: ['gpl', 'gsf'] },
};
const FOCUS = 2.4; // part d'entraînement des qualités travaillées par le plan : quatre fois celle des autres
const REST = 0.6;
// part de la marge vers le potentiel gagnée à chaque journée, freinée près du sommet comme en équipe première
// (0,03 sans frein avant la 0.5.0 : un jeune doué touchait son potentiel avant 19 ans)
const ROUND_PACE = 0.012;
const levelBrake = (p) => clamp(1.4 - playerRating(p) / 20, 0.45, 1);

const r1 = (v) => Math.round(v * 10) / 10;
// L'Élite joue quatorze journées (aller-retour) : l'académie y garde le rythme d'une saison de sept (repérage toutes
// les deux journées, progrès de moitié à chaque journée), autant de jeunes et de progrès par saison qu'ailleurs.
const perRound = (s) => 7 / leagueLength(s);
const scoutStep = (s, round = s.round) => Math.floor(round * perRound(s));
const roundKey = (s) => `${s.seasonNumber}:${scoutStep(s)}`;

// Repérage en cours : journée après laquelle la liste a été tirée (0 : début de saison), et nombre de journées de
// championnat avant la suivante (null : plus de repérage avant la saison prochaine).
export function scoutingWhen(s) {
  const len = leagueLength(s);
  const step = scoutStep(s);
  let next = s.round + 1;
  while (next <= len && scoutStep(s, next) === step) next += 1;
  return { since: Math.ceil(step / perRound(s)), next: next <= len ? next - s.round : null };
}

// Qualités travaillées par un plan : une famille pour un joueur de champ, deux qualités de gardien pour un gardien.
export const planAttrs = (p, plan) => (p.pos === 'G' ? PLANS[plan].gk : ATTRS.filter((a) => a.fam === PLANS[plan].fam).map((a) => a.key));

// Plan conseillé : celui qui fait monter le niveau le plus vite (les qualités qui comptent le plus à son poste).
export function advisedPlan(p) {
  let best = 'tech';
  let top = -1;
  for (const plan of Object.keys(PLANS)) {
    const v = planPace(p, plan);
    if (v > top) { top = v; best = plan; }
  }
  return best;
}

// Entraînement d'un jeune : des points de qualité, autant que ceux qui feraient gagner `gain` à sa note avec la
// répartition de l'équipe première (progressPlayer, players.js : les qualités clés du poste d'abord), mais
// répartis selon son plan (les qualités travaillées en reçoivent quatre fois plus). Un plan tourné vers les
// qualités clés du poste fait donc monter le niveau plus vite ; un autre développe d'autres qualités, au prix
// d'un niveau qui monte moins vite (planPace).
const baseShare = (p, k) => 0.5 + 4.5 * (WEIGHTS[p.pos][k] || 0);
const poolOf = (p) => (p.pos === 'G' ? p.g : p.a);

// Rythme de progression du niveau avec un plan, par rapport à la répartition de l'équipe première (×1), en moyenne :
// de ×0,7 (plan à contre-emploi) à ×1,28 (plan conseillé d'un défenseur).
export function planPace(p, plan) {
  const w = WEIGHTS[p.pos];
  const focus = new Set(planAttrs(p, plan));
  let c = 0; let wc = 0; let cm = 0; let wcm = 0;
  for (const k in poolOf(p)) {
    const share = baseShare(p, k);
    const m = focus.has(k) ? FOCUS : REST;
    c += share; wc += (w[k] || 0) * share; cm += share * m; wcm += (w[k] || 0) * share * m;
  }
  return (c / wc) * (wcm / cm);
}

// Progrès d'un jeune (voir plus haut). Renvoie le gain de note arrondi.
function grow(p, gain) {
  if (!(gain > 0)) return 0;
  const before = playerRating(p);
  const w = WEIGHTS[p.pos];
  const pool = poolOf(p);
  const focus = new Set(planAttrs(p, PLANS[p.plan] ? p.plan : advisedPlan(p)));
  let c = 0; let wc = 0;
  for (const k in pool) { c += baseShare(p, k); wc += (w[k] || 0) * baseShare(p, k); }
  let points = (gain * c) / wc; // points de qualité de l'entraînement
  const f = {};
  for (const k in pool) f[k] = baseShare(p, k) * (focus.has(k) ? FOCUS : REST) * rnd(0.8, 1.2);
  // une qualité qui atteint 20 ne prend plus rien : ses points vont aux autres, rien ne se perd
  const add = {};
  for (let pass = 0; pass < 4 && points > 0.001; pass++) {
    const open = Object.keys(pool).filter((k) => pool[k] + (add[k] || 0) < 20);
    const sum = open.reduce((a, k) => a + f[k], 0);
    if (!sum) break;
    let left = 0;
    for (const k of open) {
      const want = (points * f[k]) / sum;
      const got = Math.min(want, 20 - pool[k] - (add[k] || 0));
      add[k] = (add[k] || 0) + got;
      left += want - got;
    }
    points = left;
  }
  for (const k in pool) pool[k] = clamp(r1(pool[k] + (add[k] || 0)), 1, 20);
  return r1(playerRating(p) - before);
}

// Après chaque journée de championnat : un petit progrès pour chaque jeune, d'autant plus grand qu'il est loin de son
// potentiel (de moitié en Élite, qui joue deux fois plus de journées).
export function trainYouth(s) {
  for (const p of s.youth || []) {
    const room = Math.max(0, p.pot - playerRating(p));
    const g = grow(p, room * ROUND_PACE * perRound(s) * levelBrake(p) * rnd(0.7, 1.3));
    p.gain = { ...(p.gain || {}), round: g, season: r1((p.gain?.season || 0) + g) };
  }
}

// Intersaison : le bond de l'été (comme l'équipe première, seasonGain × SUMMER), puis un an de plus ; à 19 ans, un
// jeune qui n'est pas monté quitte le club. Renvoie les jeunes partis.
export function youthSeasonEnd(s) {
  const gone = [];
  for (const p of s.youth || []) {
    const g = grow(p, seasonGain(p) * SUMMER);
    p.gain = { round: 0, season: 0, summer: g };
    p.age += 1;
    if (p.age >= YOUTH_LEAVE_AGE) gone.push(p);
  }
  s.youth = (s.youth || []).filter((p) => !gone.includes(p));
  return gone;
}

// Jeunes repérés de la journée : tirés une fois par journée de championnat, toutes les deux en Élite (recruter ne les
// renouvelle pas ; une amélioration de l'académie en ajoute aussitôt), âgés de 15 à 17 ans. Recruteurs en mission :
// pas de jeunes repérés, jusqu'à leur retour (missions, plus bas).
export function refreshScouting(s) {
  const lvl = s.buildings.academy || 0;
  const key = roundKey(s);
  if (!s.scouting || s.scouting.key !== key) {
    s.scouting = { key, list: [], drawn: 0 };
    const m = s.mission;
    if (m && lvl > 0) {
      m.left -= 1;
      if (m.left > 0) s.scouting.away = true;
      else missionBack(s, m);
    }
  }
  if (s.scouting.away) return s;
  while (s.scouting.drawn < (SCOUTED[lvl] || 0)) {
    const p = makePlayer({ youth: true, academy: lvl, age: ri(15, 17) });
    p.id = s.nextId++;
    s.scouting.list.push(p);
    s.scouting.drawn += 1;
  }
  return s;
}

// --- Missions des recruteurs (0.6.1) -----------------------------------------------------------------------------
// Tu envoies tes recruteurs sur un poste, un profil (technique, physique, mental) ou une région imaginaire, pour un à
// trois repérages (une à trois journées ; deux à six en Élite, qui repère toutes les deux journées). Pendant la mission,
// pas de jeunes repérés. Au retour, ils ont vu autant de jeunes (de la cible) que les repérages manqués et te ramènent
// les plus prometteurs, d'après leur vrai potentiel : plus la mission est longue, plus ils en ont vu, plus il y a de
// chances d'y trouver une pépite. Ils ne la font pas naître pour autant : les chances (exactes, missionPlan) sont celles
// d'autant de repérages ordinaires, toujours dans les potentiels réalistes de la 0.5.0. Une région n'impose ni poste
// ni profil, mais ses jeunes y ont été bien observés : leur potentiel est deux fois mieux cerné.
export const MISSION_KINDS = { pos: 'Poste', plan: 'Profil', region: 'Région' };
export const MISSION_REGIONS = ['Val d’Ambre', 'Monts d’Arvel', 'Côte des Brumes', 'Plaine d’Orbel', 'Pays des Sept Lacs'];
export const PROFILES = { tech: 'technique', phys: 'physique', mental: 'mental' };
export const MISSION_STEPS = [1, 2, 3];
// « dans le Val d'Ambre », « dans les Monts d'Arvel », « sur la Côte des Brumes »…
export const inRegion = (r) => (r.startsWith('Monts') ? `dans les ${r}` : r.startsWith('Côte') || r.startsWith('Plaine') ? `sur la ${r}` : `dans le ${r}`);
// Ce qu'une mission cherche, en clair : « des gardiens », « un profil technique », « dans le Val d'Ambre ».
export function missionTarget(m) {
  if (m.kind === 'pos') return `des ${POS_LABELS[m.value].toLowerCase()}s`;
  if (m.kind === 'plan') return `un profil ${PROFILES[m.value]}`;
  return inRegion(m.value);
}

// Profil d'un jeune : la famille de qualités où il est le plus fort (celle d'un plan d'entraînement : technique,
// physique, mental ; pour un gardien, ses deux qualités de chaque plan).
export function profileOf(p) {
  let best = 'tech';
  let top = -Infinity;
  for (const plan of Object.keys(PLANS)) {
    const keys = planAttrs(p, plan);
    const pool = p.pos === 'G' ? p.g : p.a;
    const v = keys.reduce((a, k) => a + (pool[k] || 0), 0) / keys.length;
    if (v > top) { top = v; best = plan; }
  }
  return best;
}

// Chance exacte qu'un jeune repéré par une académie au niveau lvl ait un potentiel d'au moins t : même tirage que
// makePlayer (players.js : âge de 15 à 17 ans, centre et potentiel de YOUTH_GEN), intégré pas à pas.
const chanceCache = new Map();
export function youthChance(lvl, t) {
  if (t <= 8) return 1;
  if (t > 20) return 0;
  const id = `${lvl}:${t}`;
  if (chanceCache.has(id)) return chanceCache.get(id);
  const g = YOUTH_GEN;
  const N = 4000;
  let sum = 0;
  for (const years of [0, 1, 2]) {
    for (let i = 0; i < N; i++) {
      const c = g.base + g.perLevel * lvl + g.spread * ((i + 0.5) / N) + g.perAge * years + g.potBase + g.potPerLevel * lvl;
      const z = (t - 0.5 - c) / g.potTail; // potentiel arrondi ≥ t ⇔ potTail × U³ ≥ t − 0,5 − centre
      sum += z <= 0 ? 1 : z >= 1 ? 0 : 1 - Math.cbrt(z);
    }
  }
  const p = sum / (3 * N);
  chanceCache.set(id, p);
  return p;
}

// Repérage où reviendrait une mission partie maintenant : { season, round } (round 0 : au début de la saison).
export function missionReturn(s, steps) {
  const len = leagueLength(s);
  let season = s.seasonNumber;
  let round = s.round;
  for (let k = 0; k < steps; k++) {
    const step = scoutStep(s, round);
    if (round >= len) { season += 1; round = 0; continue; }
    let r = round + 1;
    while (r <= len && scoutStep(s, r) === step) r += 1;
    round = r;
  }
  return { season, round };
}

// Ce que donnera une mission de `steps` repérages : jeunes vus, jeunes ramenés, chances exactes qu'il y ait parmi eux
// un potentiel de 16 ou plus, de 18 ou plus (les mêmes que sur autant de repérages ordinaires), retour.
export function missionPlan(s, steps) {
  const lvl = s.buildings.academy || 0;
  const per = SCOUTED[lvl] || 0;
  const seen = steps * per;
  const at = (t) => (seen ? 1 - (1 - youthChance(lvl, t)) ** seen : 0);
  return { seen, back: Math.min(seen, per + steps - 1), p16: at(16), p18: at(18), ret: missionReturn(s, steps) };
}

export function startMission(s, { kind, value, steps }) {
  const lvl = s.buildings.academy || 0;
  const ok = kind === 'pos' ? !!POS_LABELS[value] : kind === 'plan' ? !!PROFILES[value] : kind === 'region' ? MISSION_REGIONS.includes(value) : false;
  if (!lvl || s.mission || !ok || !MISSION_STEPS.includes(steps)) return null;
  s.mission = { kind, value, steps, left: steps, per: SCOUTED[lvl] || 0, season: s.seasonNumber, round: s.round };
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: 'Les recruteurs partent en mission',
    text: `Ils cherchent ${missionTarget(s.mission)}, ${steps > 1 ? `pendant ${steps} repérages` : 'le temps d’un repérage'}.`,
  });
  return s;
}

// Rappeler les recruteurs : la mission s'arrête, sans jeunes ; les repérages reprennent aussitôt.
export function cancelMission(s) {
  if (!s.mission) return null;
  s.mission = null;
  if (s.scouting?.away) { delete s.scouting.away; refreshScouting(s); }
  return s;
}

// Retour de mission : les candidats vus (de la cible), les plus prometteurs ramenés.
function missionBack(s, m) {
  const lvl = s.buildings.academy || 0;
  const seen = m.steps * m.per;
  const back = Math.min(seen, m.per + m.steps - 1);
  const cands = [];
  for (let k = 0; k < seen; k++) {
    let p = null;
    for (let tries = 0; tries < 60; tries++) {
      p = makePlayer({ youth: true, academy: lvl, age: ri(15, 17), pos: m.kind === 'pos' ? m.value : null });
      if (m.kind !== 'plan' || profileOf(p) === m.value) break;
    }
    cands.push(p);
  }
  cands.sort((a, b) => b.pot - a.pot || playerRating(b) - playerRating(a));
  const list = cands.slice(0, back);
  for (const p of list) {
    p.id = s.nextId++;
    p.scoutNote = m.kind === 'region' ? `Repéré ${inRegion(m.value)}` : `Mission des recruteurs : ${missionTarget(m)}`;
    if (m.kind === 'region') p.sharp = true; // potentiel deux fois mieux cerné (players.js, potentialRange)
  }
  s.scouting.list = list;
  s.scouting.drawn = SCOUTED[lvl] || 0; // ce repérage-là, c'est la mission
  s.scouting.mission = { kind: m.kind, value: m.value, steps: m.steps, seen, back: list.length, season: s.seasonNumber, round: s.round };
  s.mission = null;
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: 'Retour de mission des recruteurs',
    text: `Ils ont vu ${seen} jeune${seen > 1 ? 's' : ''} (${missionTarget(m)}) et ramènent ${list.length > 1 ? `les ${list.length} plus prometteurs` : 'le plus prometteur'} : ${list.map((p) => p.name).join(', ')}.`,
  });
}

// Jeunes qui auront 19 ans à l'intersaison : à faire monter avant, sinon ils partent.
// Détection regardée : la pastille et le conseil du staff s'éteignent jusqu'à la liste de la journée suivante (0.8.2).
export function markScoutingSeen(s) {
  if (!s.scouting || s.scouting.seen) return null;
  s.scouting.seen = true;
  return s;
}

export const leavingYouth = (s) => (s.youth || []).filter((p) => p.age + 1 >= YOUTH_LEAVE_AGE);
