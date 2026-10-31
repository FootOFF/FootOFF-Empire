import { POS_LABELS, SCOUTED, YOUTH_GEN, YOUTH_LEAVE_AGE, YOUTH_PLACES } from './constants';
import { leagueLength } from './cups';
import { pushJournal } from './journal';
import { ATTRS, SUMMER, WEIGHTS, makePlayer, playerRating, seasonGain } from './players';
import { clamp, ri, rnd } from './utils';
import { comma, t, tn } from '../i18n/index';

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
  tech: { label: t('Technique'), fam: 'tech', gk: ['rel', 'aer'] },
  phys: { label: t('Physique'), fam: 'phys', gk: ['ref', 'uns'] },
  mental: { label: t('Mental'), fam: 'tac', gk: ['gpl', 'gsf'] },
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
      if (m.left > 0) { s.scouting.away = true; missionStep(s, m); } // les nouvelles du repérage (0.8.12)
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

// --- Missions des recruteurs (0.6.1, repensées en 0.8.12) ----------------------------------------------------------
// Tu envoies tes recruteurs chercher un poste ou un profil (technique, physique, mental), pour deux à quatre repérages
// (deux à quatre journées ; quatre à huit en Élite, qui repère toutes les deux journées). Pendant la mission, pas de
// jeunes repérés. Demande du PDG (2026-10-29) : plus de zones géographiques, des missions longues au gros butin, et une
// mission qu'on suit : à chaque repérage, ils observent deux fois plus de jeunes qu'un repérage ordinaire (BOOST) et
// donnent des nouvelles (s.mission.news) ; au retour, les plus prometteurs de tous ceux qu'ils ont vus, d'après leur
// vrai potentiel. Les chances (exactes, missionPlan) restent celles des potentiels réalistes de la 0.5.0 : la mission
// voit davantage de jeunes, elle n'en fait pas naître de meilleurs.
export const MISSION_KINDS = { pos: t('Poste'), plan: t('Profil') };
export const PROFILES = { tech: 'technique', phys: 'physique', mental: 'mental' };
// le profil cherché, dit dans la langue de la partie (« لاعبًا بملف technique » en arabe jusqu'à la 1.0.13)
const PROFILE_NAMES = { tech: t('technique'), phys: t('physique'), mental: t('mental') };
export const MISSION_STEPS = [2, 3, 4];
export const MISSION_BOOST = 2;
const POS_NOUNS = { G: [t('gardien'), t('gardiens')], D: [t('défenseur'), t('défenseurs')], M: [t('milieu'), t('milieux')], A: [t('attaquant'), t('attaquants')] };
// Ce qu'une mission cherche, en clair : « des gardiens », « des milieux », « un profil technique » ; « des jeunes » pour
// une mission d'avant la 0.8.12 partie dans une région.
export function missionTarget(m) {
  if (m.kind === 'pos') return `des ${POS_NOUNS[m.value][1]}`;
  if (m.kind === 'plan') return t('un profil {v}', { v: PROFILE_NAMES[m.value] });
  return t('des jeunes');
}
// Les jeunes d'une mission, comptés et accordés : « 12 attaquants », « 12 jeunes au profil technique », « 1 gardien ».
export function missionCount(m, n) {
  if (m.kind === 'pos') return `${n} ${POS_NOUNS[m.value][n > 1 ? 1 : 0]}`;
  const y = tn(n, '{n} jeune', '{n} jeunes', { n }, n > 1);
  return m.kind === 'plan' ? t('{y} au profil {v}', { y, v: PROFILE_NAMES[m.value] }) : y;
}
// Jeunes ramenés d'une mission : autant que de repérages, plus ceux d'un repérage ordinaire.
const missionBackCount = (per, steps) => per + steps;

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
  const seen = steps * per * MISSION_BOOST;
  const at = (t) => (seen ? 1 - (1 - youthChance(lvl, t)) ** seen : 0);
  return { seen, back: Math.min(seen, missionBackCount(per, steps)), p16: at(16), p18: at(18), ret: missionReturn(s, steps) };
}

export function startMission(s, { kind, value, steps }) {
  const lvl = s.buildings.academy || 0;
  const ok = kind === 'pos' ? !!POS_LABELS[value] : kind === 'plan' ? !!PROFILES[value] : false;
  if (!lvl || s.mission || !ok || !MISSION_STEPS.includes(steps)) return null;
  s.mission = { kind, value, steps, left: steps, per: SCOUTED[lvl] || 0, season: s.seasonNumber, round: s.round, seen: [], news: [] };
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: t('Les recruteurs partent en mission'),
    text: t('Ils cherchent {missionTarget}, {tn}.', { missionTarget: missionTarget(s.mission), tn: tn(steps, 'le temps d’un repérage', 'pendant {steps} repérages', { steps }, steps > 1) }),
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

// Un jeune observé en mission, de la cible (le poste, ou le profil : jusqu'à soixante essais).
function missionCandidate(s, m) {
  const lvl = s.buildings.academy || 0;
  let p = null;
  for (let tries = 0; tries < 60; tries++) {
    p = makePlayer({ youth: true, academy: lvl, age: ri(15, 17), pos: m.kind === 'pos' ? m.value : null });
    if (m.kind !== 'plan' || profileOf(p) === m.value) break;
  }
  return p;
}
const byPromise = (a, b) => b.pot - a.pot || playerRating(b) - playerRating(a);
// Ce que disent les recruteurs d'un jeune, sans dévoiler son potentiel : leur impression, d'après lui.
export const promiseWord = (p) => (p.pot >= 16 ? t('un talent rare') : p.pot >= 13.5 ? t('un beau potentiel') : t('un bon élément'));
const youthWord = (p) => t('un {v} de {age} ans', { v: POS_NOUNS[p.pos][0], age: p.age });
const NUM_WORDS = [t('Aucun'), t('Un'), t('Deux'), t('Trois'), t('Quatre'), t('Cinq'), t('Six'), t('Sept'), t('Huit')];

const tierOf = (p) => (p.pot >= 16 ? 'rare' : p.pot >= 13.5 ? 'fine' : 'solid');

// Un repérage de la mission (0.8.12) : les jeunes observés (seuls les plus prometteurs sont gardés, autant qu'il en
// reviendra : la sauvegarde reste légère), et la nouvelle du jour. up : le plus prometteur vient d'apparaître.
function missionStep(s, m) {
  const fresh = Array.from({ length: m.per * MISSION_BOOST }, () => missionCandidate(s, m));
  const before = m.seen?.[0];
  m.seen = [...(m.seen || []), ...fresh].sort(byPromise).slice(0, missionBackCount(m.per, m.steps));
  m.observed = (m.observed || 0) + fresh.length;
  const best = m.seen[0];
  const who = youthWord(best);
  const up = best !== before;
  const lead = !up ? t('Le plus prometteur reste {who}, {promiseWord}.', { who, promiseWord: promiseWord(best) })
    : tierOf(best) === 'solid' ? t('Le plus prometteur pour l’instant : {who}, {promiseWord}.', { who, promiseWord: promiseWord(best) })
      : t('{toUpperCase}{slice} sort du lot : {promiseWord}.', { toUpperCase: who[0].toUpperCase(), slice: who.slice(1), promiseWord: promiseWord(best) });
  const k = m.steps - m.left;
  const n = fresh.length;
  m.news = [...(m.news || []), { step: k, season: s.seasonNumber, round: s.round, n, best: tierOf(best), up, text: tn(n, '{v} jeune observé. {lead}', '{v} jeunes observés. {lead}', { v: NUM_WORDS[n] || n, lead }, n > 1) }].slice(-6);
}

// Retour de mission : les candidats vus (de la cible), les plus prometteurs ramenés.
function missionBack(s, m) {
  const lvl = s.buildings.academy || 0;
  // le dernier repérage (tout ce qu'une mission d'avant la 0.8.12 n'avait pas encore vu)
  const seen = m.steps * m.per * MISSION_BOOST;
  const cands = [...(m.seen || [])];
  for (let k = m.observed || 0; k < seen; k++) cands.push(missionCandidate(s, m));
  const back = Math.min(seen, missionBackCount(m.per, m.steps));
  cands.sort(byPromise);
  const list = cands.slice(0, back);
  for (const p of list) {
    p.id = s.nextId++;
    p.scoutNote = t('Mission des recruteurs : {missionTarget}', { missionTarget: missionTarget(m) });
  }
  s.scouting.list = list;
  s.scouting.drawn = SCOUTED[lvl] || 0; // ce repérage-là, c'est la mission
  s.scouting.mission = { kind: m.kind, value: m.value, steps: m.steps, seen, back: list.length, season: s.seasonNumber, round: s.round };
  s.mission = null;
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'academie', title: t('Retour de mission des recruteurs'),
    text: t('Ils ont vu {missionCount} et ramènent {tn} : {join}.', { missionCount: missionCount(m, seen), tn: tn(list.length, 'le plus prometteur', 'les {length} plus prometteurs', { length: list.length }, list.length > 1), join: list.map((p) => p.name).join(comma()) }),
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
