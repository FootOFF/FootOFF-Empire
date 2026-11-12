import * as THREE from 'three';
import { Agent, createBallMesh, placeBall } from './motion';
import { createPlayers } from './players';
import { createPlayersAuto, identityOf } from './players3d';
import { formationOf, slotsOf } from '../game/tactics';
import { matchFeed } from '../game/matchFeed';
import { hash, rng } from '../game/faces';
import { hitFrame, simulate, solveLaunch, stepFree, stepNet } from './ballphysics';

// Le match sur la pelouse du stade, seulement les jours de match.
//  - Avant le coup d'envoi (jour de match, pas encore de direct) : échauffement, chaque équipe dans sa moitié.
//  - Pendant le direct (0.7, façon FM) : la 3D ne joue que les temps forts que le direct lui demande (matchFeed.hl) :
//    buts, penalties, expulsions, grosses occasions, arrêts, poteaux. Depuis la 0.8.7 (demande du PDG : un rendu
//    professionnel, plus jamais de ballon qui se téléporte), chaque temps fort s'ouvre sur un plan de coupe (plan large
//    du stade) qui masque la mise en place, puis l'action, déjà en mouvement, part d'une vraie situation (relance,
//    récupération) et se construit en deux ou trois relais jusqu'à sa finale : 8 à 12 s de jeu, coups de pied arrêtés
//    à part. Le ballon ne change de pied qu'au contact. Chaque finale est construite comme une vraie,
//    selon son type (live.js : ouverture, contre, centre, centre en retrait, une-deux, cafouillage, percée, corner,
//    pressing, frappe lointaine, coup franc, penalty) : les deux équipes placées selon leur dispositif, la relance, les
//    passes, le centre ou l'ouverture, la frappe (pied, tête, volée, coup franc enroulé, penalty) et le plongeon du
//    gardien ; l'issue est celle du moteur. Le direct affiche l'événement à l'instant décisif (matchFeed.hlReveal :
//    ballon au fond des filets, dans les gants, sur le poteau, dehors, carton brandi). Un but est suivi de la joie du
//    buteur puis d'un ralenti, rejoué depuis l'enregistrement de l'action. Entre deux temps forts, rien ne bouge (et
//    Empire3D ne dessine rien).
//  - Après le coup de sifflet final : la pelouse se vide.
// Unités du jeu (1 = 10 m), repère du stade : pelouse 10,5 × 6,8, buts en x = ±5,25. Les positions d'un temps fort
// sont données dans le repère de l'équipe qui attaque : u vers le but qu'elle attaque, v en travers.

const N = 22;
const GOAL_X = 5.25;
const GOAL_HALF = 0.366; // demi-largeur du but (7,32 m)
const BAR = 0.244; // hauteur de la barre (2,44 m)
const KICK_TIME = 0.6;
const KICK_CONTACT = 0.55;
const ARMED = KICK_CONTACT * KICK_TIME; // de l'élan au contact du pied
const BALL_R = 0.011;
const HEAD = 0.185; // hauteur d'une tête (1,85 m)
const SPOT = GOAL_X - 1.1; // point de penalty (11 m)
const BOX = GOAL_X - 1.65; // ligne de la surface (16,5 m)
// une faute de carton rouge tombe devant la surface (1.0, remarque du PDG : dans la surface, elle vaudrait aussi un
// penalty, une double peine que le direct n'affiche pas) : le porteur file vers ce point, à 1,5 m de la ligne (GOAL_X - 1,4
// avant, dans la surface) ; le fautif garde sa place près de la ligne défensive, d'où il le rattrape
const FOUL_U = BOX - 0.15;
const KEEP_U = GOAL_X - 0.1; // le gardien se tient un mètre devant sa ligne
const SPRINT = 0.74; // u/s (7,4 m/s)
const REPLAY_SPEED = 0.5; // ralenti
const REPLAY_BEFORE = 2.6; // secondes d'action avant l'instant décisif, dans le ralenti
const REPLAY_AFTER = 0.8;
const HL_PRE = 0.2; // minutes de jeu du début d'un temps fort à son instant décisif (comme match.jsx) : 12 s
const CUT = 1.1; // plan de coupe (s) : la mise en place se fait hors champ, l'action démarre déjà en mouvement
const RECV = 0.05; // contact pied-ballon (u) : un ballon arrêté se prend à cette distance du pied
const TACKLE_LEAD = 0.55; // s : du départ du tacle glissé au contact de la jambe tendue (geste 3D calé dessus)
const REACH = 0.1; // portée d'une jambe tendue (u, un mètre du corps) : un ballon qui passe là, au sol, est contrôlé

const clamp = THREE.MathUtils.clamp;
const teamOf = (i) => (i < 11 ? 0 : 1);
const slotOf = (i) => i % 11;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Schéma de l'avant-match (en %, attaque vers le haut) → repère d'équipe : u vers le but adverse, v en travers.
const anchorsOf = (formation) => formationOf(formation).pitch.map(([x, y]) => [-4.7 + (88 - y) * (6.7 / 73), ((x - 50) / 36) * 2.3]);

// durée estimée d'une suite de gestes (s), pour tenir un temps fort sous 15 s (choix du PDG, 1.0.19)
const estBeats = (beats) => beats.reduce((t, x) => t + (x.t === 'wait' ? x.dur : x.t === 'pass' ? 1.3 : x.t === 'carry' ? Math.min(x.max ?? 1.5, 1.5) : x.t === 'intercept' ? 1.6 : x.t === 'tackle' ? 2.2 : 0.8), 0);
const HL_BUDGET = 12.6; // s du début à l'instant décisif, plan de coupe compris (le dernier geste et l'issue font le reste)

export function createMatchScene(parent) {
  const players = createPlayersAuto(parent, N, () => createPlayers(parent, N)); // joueurs réalistes dès qu'ils sont chargés
  const ballMesh = createBallMesh();
  parent.add(ballMesh);
  const warmBalls = [createBallMesh(), createBallMesh()];
  warmBalls.forEach((m) => parent.add(m));
  const cardMats = { yellow: new THREE.SpriteMaterial({ color: 0xf5d020, depthTest: false }), red: new THREE.SpriteMaterial({ color: 0xe03b2f, depthTest: false }) };
  const card = new THREE.Sprite(cardMats.red);
  card.scale.set(0.044, 0.062, 1); // carton : 0,44 × 0,62 m
  card.visible = false;
  card.renderOrder = 10;
  parent.add(card);

  const agents = Array.from({ length: N }, () => Object.assign(new Agent(0, 0, 0), { lift: 0, roll: 0 }));
  const S = {
    baseY: 0.006,
    matchDay: false,
    play: 'off', // off | warmup | live | gone
    now: 0,
    dir: [1, -1],
    formation: ['433', '433'],
    anchors: [anchorsOf('433'), anchorsOf('433')],
    out: new Array(N).fill(false), // joueurs qui ne sont plus sur la pelouse (expulsés, blessés)
    warm: null,
  };
  // ballon (1.0.18) : sa rotation (sx, sy, sz : effet), son glissé après un rebond, la frappe armée (strike : le ballon
  // poussé vers le point où le pied le touchera), arrêté pour un coup de pied arrêté (fixed)
  const b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, sx: 0, sy: 0, sz: 0, skid: 0, strike: null, fixed: false, state: 'dead', owner: -1, roll: 0, rollAxis: new THREE.Vector3(0, 0, 1), prev: [0, 0] };
  const on = { goal: null, save: null, post: null, miss: null }; // réactions du stade (Empire3D)
  let H = null; // temps fort en cours
  let lastId = 0; // un temps fort ne se joue qu'une fois
  let looks = [null, null]; // onzes dont les visages 3D sont posés
  // chaque joueur 3D prend l'identité de son portrait (teint, cheveux, barbe, traits) et une taille selon son poste
  function applyLooks(spec) {
    const src = [spec?.homeLooks || matchFeed.homeLooks || [], spec?.awayLooks || matchFeed.awayLooks || []];
    src.forEach((list, t) => {
      if (list === looks[t] || !list.length) return;
      looks[t] = list;
      const slots = slotsOf(S.formation[t]);
      for (let k = 0; k < 11; k++) if (list[k]) players.setIdentity(t * 11 + k, identityOf(list[k], k === 0 ? 'G' : list[k].pos || slots[k]));
    });
  }
  matchFeed.scene = true;

  const active = (i) => !S.out[i];
  const world = (t, u, v) => [u * S.dir[t], v * S.dir[t]];
  const local = (t, x, z) => [x * S.dir[t], z * S.dir[t]];
  const footSpot = (p, ahead = 0.042) => {
    const [fx, fz] = p.forward();
    const [sx, sz] = p.side();
    return [p.x + fx * ahead + sx * 0.012, p.z + fz * ahead + sz * 0.012];
  };
  const teamIdx = (t) => Array.from({ length: 11 }, (_, k) => t * 11 + k);

  // --- Équipes, couleurs, dispositifs ----------------------------------------------------------------------------
  function setKits(home, away) { // maillot, et short et col à la couleur secondaire (0.8.8)
    for (let k = 0; k < 11; k++) {
      players.setKit(k, k === 0 ? home.keeper : home.shirt, home.trim);
      players.setKit(11 + k, k === 0 ? away.keeper : away.shirt, away.trim);
    }
  }
  function setFormations(home, away = S.formation[1]) {
    S.formation = [formationOf(home).id, formationOf(away).id];
    S.anchors = S.formation.map(anchorsOf);
  }
  function placeAll(spotFn) {
    for (let i = 0; i < N; i++) {
      const [x, z] = spotFn(i);
      const a = agents[i];
      Object.assign(a, { x, z, vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0, pose: 0, poseId: 0, poseK: 0, poseWant: 0, saveSide: 0, saveH: 0, saveLead: 0, saveKind: 0, saveId: 0 });
      a.h = teamOf(i) === 0 ? (S.dir[0] > 0 ? 0 : Math.PI) : (S.dir[1] > 0 ? 0 : Math.PI);
    }
  }
  function deadBall(x, z) { Object.assign(b, { state: 'dead', owner: -1, x, z, y: 0, vx: 0, vz: 0, vy: 0, sx: 0, sy: 0, sz: 0, strike: null, fixed: true }); }
  function give(i) {
    Object.assign(b, { state: 'held', owner: i, vx: 0, vz: 0, vy: 0, sx: 0, sy: 0, sz: 0, strike: null });
    if (H) H.poss = teamOf(i); // équipe en possession (1.0.19 : l'adversaire peut l'avoir avant de la perdre)
  }
  // Contact de la frappe (1.0.18, chantier du PDG : « les joueurs frappent à côté du ballon ») : le point où le pied du
  // geste 3D touche le ballon, pour un joueur au point (x, z) qui regarde h ; sans joueurs réalistes, le pied de frappe
  // simple (42 cm devant, 12 cm à droite)
  function strikeSpot(i, kind, h, x = agents[i].x, z = agents[i].z) {
    const c = players.kickSpot?.(i, kind === 'shot' ? 'Shot' : 'Pass') || { fwd: 0.042, right: 0.012 };
    return [x + Math.cos(h) * c.fwd - Math.sin(h) * c.right, z + Math.sin(h) * c.fwd + Math.cos(h) * c.right];
  }
  // où sera un joueur qui freine jusqu'à l'arrêt (steer vers lui-même : décélération ACCEL), au bout de T secondes
  const ACCEL = 0.55;
  function stopAt(a, T) {
    const sp = Math.hypot(a.vx, a.vz);
    if (sp < 1e-4) return [a.x, a.z];
    const t = Math.min(T, sp / ACCEL);
    const d = sp * t - 0.5 * ACCEL * t * t;
    return [a.x + (a.vx / sp) * d, a.z + (a.vz / sp) * d];
  }
  // la frappe armée : pendant l'élan, le ballon va (dernière touche) au point où le pied le touchera au contact ; un
  // ballon arrêté (penalty, coup franc, corner) ne bouge pas : c'est le tireur qui s'est placé
  function armStrike(i, kind, h) {
    const p = agents[i];
    const T = Math.max(0.06, (KICK_CONTACT - p.kick) * KICK_TIME);
    const [px, pz] = stopAt(p, T);
    const [sx, sz] = strikeSpot(i, kind, h, px, pz);
    b.strike = b.fixed ? { x0: b.x, z0: b.z, x1: b.x, z1: b.z, t0: H.t, T } : { x0: b.x, z0: b.z, x1: sx, z1: sz, t0: H.t, T };
  }
  const spinOff = () => { b.strike = null; b.fixed = false; };
  // reprise du pied (1.0.19) : le ballon qui arrive, face au pied de frappe d'un joueur qui armerait maintenant vers h (ce
  // pied pris là où le joueur, qui freine, sera au bout de l'horizon). Sa vraie trajectoire est simulée : le point où il
  // passe au plus près du pied (ou, avec atEnd, celui où il sera au bout de l'horizon), l'instant, l'écart
  function meetBall(i, h, horizon, atEnd = false) {
    const [px, pz] = stopAt(agents[i], horizon);
    const [sx, sz] = strikeSpot(i, 'shot', h, px, pz);
    const m = { d: Infinity, t: 0, x: b.x, y: b.y, z: b.z, sx, sz };
    simulate({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, sx: b.sx || 0, sy: b.sy || 0, sz: b.sz || 0, skid: b.skid || 0 }, horizon, 1 / 240, (s, t) => {
      const d = Math.hypot(s.x - sx, s.z - sz);
      if (atEnd || d < m.d) Object.assign(m, { d, t, x: s.x, y: s.y, z: s.z });
      return false;
    });
    return m;
  }
  // remise pour une reprise (1.0.19) : un receveur encore loin du point visé ne fait plus rouler la passe au pas ; elle
  // part à sa vitesse vers le point de sa course (vers le point visé) où il l'aura à temps. null : rien à changer
  // (un centre reste dans la surface : jamais en deçà de minU)
  function layoff(bt, tx, tz, minU = -Infinity) {
    const rc = agents[bt.to];
    const nat = (qx, qz) => passTimeOf(bt.style, Math.hypot(qx - b.x, qz - b.z));
    const run = (qx, qz) => runTime(bt, qx, qz);
    if (run(tx, tz) <= nat(tx, tz) * 1.35) return null;
    let lo = 0, hi = 1;
    for (let it = 0; it < 12; it++) {
      const f = (lo + hi) / 2;
      const qx = rc.x + (tx - rc.x) * f, qz = rc.z + (tz - rc.z) * f;
      if (run(qx, qz) <= nat(qx, qz) * 1.3) lo = f; else hi = f;
    }
    const [ru] = uvOf(rc.x, rc.z), [tu] = uvOf(tx, tz);
    if (minU > -Infinity && tu > ru + 1e-6) lo = Math.max(lo, clamp((minU - ru) / (tu - ru), 0, 1));
    if (lo > 0.995) return null;
    H.layoffs = (H.layoffs || 0) + 1; // mesure (banc)
    return [rc.x + (tx - rc.x) * lo, rc.z + (tz - rc.z) * lo];
  }

  // --- Échauffement ----------------------------------------------------------------------------------------------
  function warmupSetup() {
    S.warm = [0, 1].map((t) => ({ from: t * 11 + 1, to: t * 11 + 2, timer: 0.5, x: 0, z: 0, flight: 0, sx: 0, sz: 0 }));
  }
  function warmupUpdate(dt) {
    for (let i = 0; i < N; i++) {
      const t = teamOf(i);
      const k = slotOf(i);
      const a = agents[i];
      if (k === 0) { // gardien : pas chassés sur sa ligne
        const own = -GOAL_X * S.dir[t];
        a.steer(own + S.dir[t] * 0.1, Math.sin(S.now * 0.8 + t) * 0.25, 0.18, dt, 0, 0);
        continue;
      }
      const ang = ((k - 1) / 10) * Math.PI * 2 + S.now * 0.05;
      const [wx, wz] = world(t, -2.3 + Math.cos(ang) * 1.05, Math.sin(ang) * 1.05);
      const w = S.warm[t];
      const busy = i === w.from && w.flight === 0;
      if (!busy) a.steer(wx, wz, 0.2, dt, ...world(t, -2.3, 0));
    }
    S.warm.forEach((w, t) => {
      const from = agents[w.from];
      const to = agents[w.to];
      if (w.flight === 0) { // le passeur contrôle, s'oriente, frappe
        const [sx, sz] = footSpot(from);
        w.x += (sx - w.x) * Math.min(1, dt * 10); w.z += (sz - w.z) * Math.min(1, dt * 10);
        from.steer(from.x, from.z, 0, dt, to.x, to.z);
        if ((w.timer -= dt) <= 0 && from.kick === 0) from.kick = 0.001;
        if (from.kick >= KICK_CONTACT) { w.flight = 0.001; w.sx = w.x; w.sz = w.z; w.dur = Math.hypot(to.x - w.x, to.z - w.z) / 0.9; }
      } else {
        w.flight += dt / Math.max(0.3, w.dur);
        const f = Math.min(1, w.flight);
        const [tx, tz] = footSpot(to);
        w.x = w.sx + (tx - w.sx) * f; w.z = w.sz + (tz - w.sz) * f;
        to.steer(to.x, to.z, 0, dt, w.x, w.z);
        if (f >= 1) {
          w.from = w.to;
          let next;
          do next = t * 11 + 1 + Math.floor(Math.random() * 10); while (next === w.from);
          w.to = next; w.flight = 0; w.timer = 0.35 + Math.random() * 0.55;
        }
      }
      warmBalls[t].visible = true;
      placeBall(warmBalls[t], { x: w.x, z: w.z, y: 0, roll: 0 }, S.baseY);
    });
  }

  // --- Temps forts : mise en place ----------------------------------------------------------------------------------
  const at = (u, v) => world(H.A, u, v); // repère de l'équipe qui attaque → pelouse
  const uvOf = (x, z) => local(H.A, x, z);
  function put(i, u, v, faceU = GOAL_X, faceV = 0) {
    const a = agents[i];
    [a.x, a.z] = at(u, v);
    Object.assign(a, { vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0, saveSide: 0, saveH: 0, saveLead: 0, saveKind: 0, saveId: 0, tackleId: 0, tackleLead: 0, jumpAt: -1 });
    const [fx, fz] = at(faceU, faceV);
    a.h = Math.atan2(fz - a.z, fx - a.x);
    H.home.set(i, [u, v]);
  }
  // place un joueur au départ de la construction (hors champ, pendant le plan de coupe), sans changer sa place de finale
  function place(i, u, v, faceU = GOAL_X, faceV = 0) {
    const a = agents[i];
    [a.x, a.z] = at(u, v);
    Object.assign(a, { vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0, saveSide: 0, saveH: 0, saveLead: 0, saveKind: 0, saveId: 0 });
    const [fx, fz] = at(faceU, faceV);
    a.h = Math.atan2(fz - a.z, fx - a.x);
  }
  // pendant la construction, chacun remonte de son point de départ vers sa place de finale (u reculé de shift au début)
  const lagAt = (i, t) => (H.shift && slotOf(i) > 0 ? (H.shiftOf?.get(i) ?? H.shift) * (1 - clamp(t / Math.max(0.5, H.bT), 0, 1)) : 0);
  const planAt = (i, t) => { const [u, v] = H.home.get(i); return [u - lagAt(i, t), v]; };
  const roleOf = (i) => slotsOf(S.formation[teamOf(i)])[slotOf(i)]; // poste d'un joueur : G, D, M ou A
  // joueurs encore sur la pelouse, par poste
  function rolesOf(t) {
    const r = { G: [], D: [], M: [], A: [] };
    slotsOf(S.formation[t]).forEach((pos, k) => { if (active(t * 11 + k)) r[pos].push(t * 11 + k); });
    return r;
  }
  // l'agent d'un joueur nommé par le direct (équipe t), sinon un joueur de champ du poste préféré
  function agentOf(t, name, prefer = ['A', 'M', 'D'], not = -1) {
    const names = (t === 0 ? H.spec.homeNames : H.spec.awayNames) || [];
    const k = name ? names.indexOf(name) : -1;
    if (k > 0 && active(t * 11 + k) && t * 11 + k !== not) return t * 11 + k;
    const r = H.roles[t];
    for (const pos of prefer) {
      const list = r[pos].filter((i) => i !== not);
      if (list.length) return list[Math.floor(H.r() * list.length)];
    }
    return teamIdx(t).find((i) => i !== not && slotOf(i) > 0 && active(i)) ?? t * 11 + 10;
  }
  // attaque installée : la défense de l'équipe qui attaque monte au milieu, ses attaquants sur la ligne adverse ; la
  // défense adverse en bloc devant sa surface, ses attaquants à mi-terrain
  function baseShape() {
    const { A, D } = H;
    for (let k = 0; k < 11; k++) {
      const i = A * 11 + k;
      if (!active(i)) continue;
      const [au, av] = S.anchors[A][k];
      if (k === 0) put(i, -4.6, 0);
      else put(i, clamp(au * 0.6 + 2.0, -1.4, 3.5), clamp(av * 1.05, -3.0, 3.0));
    }
    for (let k = 0; k < 11; k++) {
      const i = D * 11 + k;
      if (!active(i)) continue;
      const [au, av] = S.anchors[D][k];
      if (k === 0) put(i, KEEP_U, 0, 0, 0);
      else put(i, clamp(1.9 - au * 0.5, 0.6, 4.6), clamp(-av * 0.85, -2.6, 2.6), 0, 0);
    }
  }
  // place un joueur de champ adverse près d'un point (le défenseur le plus proche de ce point y va)
  function nearestTo(t, u, v, not = new Set()) {
    let best = -1, bd = Infinity;
    for (const i of teamIdx(t)) {
      if (!active(i) || slotOf(i) === 0 || not.has(i)) continue;
      const [hu, hv] = H.home.get(i) || [0, 0];
      const d = Math.hypot(hu - u, hv - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Construit le temps fort : placement, puis la suite d'actions (beats) qui mène à l'instant décisif.
  function startHL(spec) {
    const e = spec.e;
    const red = spec.type === 'red';
    const sideT = e.side === 'home' ? 0 : 1;
    const r = rng(e.seed ?? hash(`${e.at}|${e.player}|${e.type}`));
    S.dir = spec.half === 2 ? [-1, 1] : [1, -1];
    setFormations(spec.formation || S.formation[0], spec.awayFormation || '433');
    S.out.fill(false);
    const names = [spec.homeNames || [], spec.awayNames || []];
    (spec.offHome || []).forEach((n) => { const k = names[0].indexOf(n); if (k >= 0) S.out[k] = true; });
    (spec.offAway || []).forEach((n) => { const k = names[1].indexOf(n); if (k >= 0) S.out[11 + k] = true; });
    H = {
      id: spec.id, spec, e, r, rr: (a, b2) => a + r() * (b2 - a),
      A: red ? 1 - sideT : sideT, D: red ? sideT : 1 - sideT,
      kind: red ? 'red' : e.kind || 'combo',
      outcome: red ? 'red' : e.type === 'goal' ? 'g' : (e.outcome || 'wide')[0],
      beats: [], k: 0, bt: 0, t: 0, phase: 'cut', revealed: false, revealT: 0, react: 0, fk: 0, finale: true, shift: 0, bT: 1,
      home: new Map(), runs: new Map(), busy: new Set(), hold: new Map(), rec: [], shot: null, dive: null, cut: true,
      speed: 1, est: 4, // toujours à vitesse normale : ×4 n'accélère que le jeu entre deux temps forts (0.8.9)
    };
    H.roles = [rolesOf(0), rolesOf(1)];
    Object.assign(b, { sx: 0, sy: 0, sz: 0, skid: 0, strike: null, fixed: false, hit: null });
    card.visible = false;
    baseShape();
    const { A, D } = H;
    const s = r() < 0.5 ? 1 : -1; // côté de l'action
    const rr = H.rr;
    const text = `${e.lead || ''} ${e.text || ''}`;
    const header = /tête|s’élève|monte plus haut|premier poteau/.test(text);
    const volley = /volée/.test(text);
    const shooter = red ? -1 : agentOf(A, e.player, ['A', 'M', 'D']);
    const assistNamed = e.assist ? agentOf(A, e.assist, ['M', 'A', 'D'], shooter) : -1;
    const mate = (prefer) => (assistNamed >= 0 ? assistNamed : agentOf(A, null, prefer, shooter));
    const keeper = D * 11;
    H.shooter = shooter;
    H.assist = assistNamed;
    H.keeper = keeper;
    let beats;
    const boxRuns = (who) => { // appels dans la surface : premier poteau, second poteau, point de penalty
      const spots = [[4.72, s * 0.45], [4.62, -s * 0.62], [4.1, -s * 0.05]];
      who.filter((i) => i >= 0).forEach((i, k) => H.runs.set(i, spots[k % spots.length]));
    };
    const otherAttackers = (n, not) => H.roles[A].A.concat(H.roles[A].M).filter((i) => !not.includes(i)).slice(0, n);
    switch (H.kind) {
      case 'through': { // ouverture dans le dos de la défense, face-à-face avec le gardien
        const mid = mate(['M', 'D']);
        put(mid, 1.5, s * 0.55); give(mid);
        put(shooter, 3.05, -s * rr(0.15, 0.45));
        beats = [
          { t: 'carry', who: mid, to: [1.95, s * 0.35], speed: 0.36, max: 1.2 },
          { t: 'pass', from: mid, to: shooter, at: [4.2, -s * rr(0.0, 0.2)], style: 'through' },
          { t: 'carry', who: shooter, to: [4.5, -s * rr(0.0, 0.12)], speed: 0.62, max: 0.55 },
          { t: 'shot', who: shooter, style: 'foot' },
        ];
        H.oneOnOne = true;
        break;
      }
      case 'counter': { // contre : récupération dans sa moitié, l'adversaire pris à revers
        const carrier = mate(['M', 'D']);
        for (const i of teamIdx(D)) { // l'adversaire était monté : il est haut et désorganisé
          if (!active(i) || slotOf(i) === 0) continue;
          const [hu, hv] = H.home.get(i);
          put(i, clamp(hu - 2.3, -0.8, 2.6), hv * 0.9, -GOAL_X, 0);
        }
        put(carrier, -0.7, s * 1.1); give(carrier);
        put(shooter, 1.0, -s * 0.3);
        H.runs.set(shooter, [2.7, s * 0.1]);
        beats = [
          { t: 'carry', who: carrier, to: [0.7, s * 1.05], speed: 0.62, max: 2.2 },
          { t: 'pass', from: carrier, to: shooter, at: [2.9, s * 0.15], style: 'through' },
          { t: 'carry', who: shooter, to: [4.15, s * 0.12], speed: 0.66, max: 1.8 },
          { t: 'shot', who: shooter, style: 'foot' },
        ];
        H.oneOnOne = true;
        break;
      }
      case 'cutback': { // débordement jusqu'à la ligne, centre en retrait
        const wing = mate(['M', 'A', 'D']);
        put(wing, 3.0, s * 2.55); give(wing);
        put(shooter, 3.35, -s * 0.5);
        boxRuns(otherAttackers(2, [shooter, wing]));
        beats = [
          { t: 'carry', who: wing, to: [4.92, s * 1.55], speed: 0.56, max: 3 },
          { t: 'pass', from: wing, to: shooter, at: [4.05, s * rr(0.1, 0.35)], style: 'ground' },
          { t: 'shot', who: shooter, style: 'foot', first: true },
        ];
        break;
      }
      case 'cross': { // centre de la ligne de touche : tête ou volée
        const wing = mate(['M', 'D', 'A']);
        put(wing, 2.5, s * 2.75); give(wing);
        put(shooter, 3.45, s * 0.1);
        boxRuns(otherAttackers(2, [shooter, wing]));
        const style = header || !volley ? 'head' : 'volley';
        beats = [
          { t: 'carry', who: wing, to: [3.55, s * 2.85], speed: 0.52, max: 2.6 },
          { t: 'pass', from: wing, to: shooter, at: [4.55, -s * rr(0.1, 0.45)], style: 'cross', y1: style === 'head' ? HEAD : 0.07 },
          { t: 'shot', who: shooter, style, first: true },
        ];
        break;
      }
      case 'combo': { // une-deux aux abords de la surface
        const wall = mate(['A', 'M']);
        put(shooter, 2.75, s * 0.55); give(shooter);
        put(wall, 3.55, -s * 0.2, -GOAL_X, 0);
        H.runs.set(shooter, [4.05, s * 0.18]);
        beats = [
          { t: 'pass', from: shooter, to: wall, at: [3.5, -s * 0.18], style: 'ground' },
          { t: 'pass', from: wall, to: shooter, at: [4.05, s * 0.15], style: 'ground', first: true },
          { t: 'shot', who: shooter, style: 'foot', first: true },
        ];
        break;
      }
      case 'scramble': { // centre dans les six mètres, tête mal assurée d'un défenseur, le ballon traîne
        const wing = mate(['M', 'D', 'A']);
        const def = nearestTo(D, 4.7, 0.2);
        put(wing, 3.4, s * 2.9); give(wing);
        put(def, 4.72, s * 0.2, 0, 0);
        put(shooter, 4.05, -s * 0.35);
        boxRuns(otherAttackers(2, [shooter, wing]));
        beats = [
          { t: 'wait', dur: 0.35 },
          { t: 'pass', from: wing, to: def, at: [4.7, s * 0.18], style: 'cross', y1: HEAD },
          { t: 'pass', from: def, to: shooter, at: [4.4, -s * rr(0.05, 0.25)], style: 'flick', head: true, first: true },
          { t: 'shot', who: shooter, style: 'poke', first: true },
        ];
        break;
      }
      case 'solo': { // percée : il élimine son vis-à-vis et frappe
        const def = nearestTo(D, 3.25, s * 0.95);
        put(shooter, 2.45, s * 1.35); give(shooter);
        put(def, 3.25, s * 0.95, 0, 0);
        H.lunge = def;
        beats = [
          { t: 'carry', who: shooter, to: [3.0, s * 1.05], speed: 0.42, max: 1.6 },
          { t: 'carry', who: shooter, to: [3.62, s * 0.45], speed: 0.62, max: 1.4 },
          { t: 'shot', who: shooter, style: 'foot' },
        ];
        break;
      }
      case 'corner': { // corner rentrant, reprise de la tête
        const taker = mate(['M', 'D', 'A']);
        for (const i of teamIdx(A)) if (active(i) && slotOf(i) > 0 && i !== taker && i !== shooter) { const [hu, hv] = H.home.get(i); put(i, clamp(hu, 2.4, 4.6), hv * 0.6); }
        for (const i of teamIdx(D)) if (active(i) && slotOf(i) > 0) { const [hu, hv] = H.home.get(i); put(i, clamp(hu + 0.5, 3.4, 4.85), hv * 0.55, 0, 0); }
        put(taker, GOAL_X - 0.03, s * 3.38, GOAL_X - 1, 0);
        deadBall(...at(GOAL_X - 0.01, s * 3.33));
        put(shooter, 4.25, -s * 0.45);
        boxRuns(otherAttackers(3, [shooter, taker]));
        beats = [
          { t: 'wait', dur: 0.9 + CUT }, // la mise en place se joue pendant le plan de coupe : l'attente visible reste la même
          { t: 'runup', who: taker, back: 0.18 },
          { t: 'pass', from: taker, to: shooter, at: [4.62, s * rr(-0.35, 0.25)], style: 'cross', y1: HEAD },
          { t: 'shot', who: shooter, style: 'head', first: true },
        ];
        H.cam = 'set';
        break;
      }
      case 'press': { // pressing : le défenseur relance mal, l'attaquant chipe le ballon et frappe aussitôt
        const def = nearestTo(D, 3.6, s * 1.0);
        put(def, 3.6, s * 1.05, 0, s * 2); give(def);
        put(shooter, 2.95, s * 0.75);
        beats = [
          { t: 'carry', who: def, to: [3.75, s * 1.25], speed: 0.16, max: 0.9 },
          { t: 'steal', who: shooter },
          { t: 'carry', who: shooter, to: [3.85, s * 0.85], speed: 0.5, max: 0.45 },
          { t: 'shot', who: shooter, style: 'foot' },
        ];
        break;
      }
      case 'long': { // frappe lointaine après une passe à l'entrée de la zone
        const mid = mate(['M', 'D']);
        put(mid, 1.55, s * 1.45); give(mid);
        put(shooter, 2.25, s * 0.35);
        beats = [
          { t: 'pass', from: mid, to: shooter, at: [2.45, s * 0.3], style: 'ground' },
          { t: 'carry', who: shooter, to: [2.62, s * 0.22], speed: 0.3, max: 0.5 },
          { t: 'shot', who: shooter, style: 'long' },
        ];
        break;
      }
      case 'freekick': { // coup franc direct : le mur à 9,15 m, frappe enroulée au-dessus
        const u0 = GOAL_X - rr(2.15, 2.6), v0 = s * rr(0.25, 0.95);
        deadBall(...at(u0, v0));
        put(shooter, u0 - 0.3, v0 + s * 0.12);
        const gx = GOAL_X - u0, gv = -v0; // vers le centre du but
        const gd = Math.hypot(gx, gv);
        const wu = u0 + (gx / gd) * 0.915, wv = v0 + (gv / gd) * 0.915;
        const wall = [];
        for (const i of teamIdx(D)) if (active(i) && slotOf(i) > 0 && wall.length < 4) wall.push(i);
        wall.forEach((i, k) => put(i, wu + (gv / gd) * (k - 1.5) * 0.065, wv - (gx / gd) * (k - 1.5) * 0.065, u0, v0));
        H.wall = new Set(wall);
        // quatre attaquants attendent dans la surface (un renvoi, une déviation), marqués côté but ; les autres en retrait
        const inBox = [[4.35, -s * 0.75], [4.6, s * 0.1], [4.2, -s * 0.2], [3.95, -s * 1.2]];
        const marks = new Set(wall);
        let n = 0;
        for (const i of teamIdx(A)) {
          if (!active(i) || slotOf(i) === 0 || i === shooter) continue;
          if (n < inBox.length && slotOf(i) >= 5) {
            const [bu, bv] = inBox[n++];
            put(i, bu, bv);
            const m = nearestTo(D, bu, bv, marks);
            if (m >= 0) { marks.add(m); put(m, bu + 0.1, bv * 0.9, u0, v0); }
          } else { const [hu, hv] = H.home.get(i); put(i, clamp(hu - 0.2, 0.4, 2.4), hv * 0.8); }
        }
        beats = [
          { t: 'wait', dur: 1.1 + CUT },
          { t: 'runup', who: shooter, back: 0.06 },
          { t: 'shot', who: shooter, style: 'curl' },
        ];
        H.cam = 'set';
        break;
      }
      case 'penalty': { // penalty : tous hors de la surface, le tireur face au gardien
        deadBall(...at(SPOT, 0));
        // places autour de la surface : sur la ligne et en retrait, jamais dans l'arc (à 9,15 m du point), les plus
        // proches de l'arc d'abord ; un joueur de chaque équipe à tour de rôle, comme au marquage
        const spots = [];
        for (const du of [0.08, 0.34, 0.62]) for (let v = -2.3; v <= 2.31; v += 0.3) {
          const u = BOX - du;
          if (Math.hypot(u - SPOT, v) < 0.98 || Math.abs(v) < 0.25) continue;
          spots.push([u + rr(-0.03, 0.03), v + rr(-0.06, 0.06), Math.hypot(u - SPOT, v) + rr(0, 0.25)]);
        }
        spots.sort((x, y) => x[2] - y[2]);
        const queue = [];
        const as = teamIdx(A).filter((i) => active(i) && slotOf(i) > 0 && i !== shooter);
        const ds = teamIdx(D).filter((i) => active(i) && slotOf(i) > 0);
        for (let k = 0; k < Math.max(as.length, ds.length); k++) { if (as[k] !== undefined) queue.push(as[k]); if (ds[k] !== undefined) queue.push(ds[k]); }
        queue.forEach((i, k) => put(i, spots[k][0], spots[k][1], SPOT, 0));
        put(shooter, SPOT - 0.3, s * 0.08, SPOT, 0);
        put(keeper, GOAL_X - 0.02, 0, 0, 0);
        beats = [
          { t: 'wait', dur: 1.25 + CUT },
          { t: 'runup', who: shooter, back: 0.06 },
          { t: 'shot', who: shooter, style: 'pen' },
        ];
        H.cam = 'set';
        H.pen = true;
        break;
      }
      case 'red': { // expulsion : un contre, le fautif fauche le porteur, carton rouge
        const offender = agentOf(D, e.player, ['D', 'M', 'A']);
        const carrier = agentOf(A, null, ['A', 'M']);
        put(carrier, 1.6, s * 0.7); give(carrier);
        put(offender, 2.35, s * 0.15, 0, 0);
        H.offender = offender;
        H.victim = carrier;
        beats = [
          { t: 'carry', who: carrier, to: [3.15, s * 0.45], speed: 0.6, max: 2.4 }, // 3,3 avant la 1.0 (FOUL_U)
          { t: 'foul', who: offender, victim: carrier },
        ];
        break;
      }
      default: { // frappe à l'entrée de la surface
        const mid = mate(['M', 'D']);
        put(mid, 2.2, s * 1.2); give(mid);
        put(shooter, 3.1, s * 0.2);
        beats = [
          { t: 'pass', from: mid, to: shooter, at: [3.35, s * 0.15], style: 'ground' },
          { t: 'shot', who: shooter, style: 'foot', first: true },
        ];
      }
    }
    // centre, centre en retrait : le buteur fait son appel dès le début de la finale (1.0.19), il arrive au point du centre
    // avec le ballon (qui flottait jusqu'à 2,7 s en l'attendant)
    if (H.kind === 'cross' || H.kind === 'cutback') {
      const last = [...beats].reverse().find((x) => x.t === 'pass' && x.to === shooter && Array.isArray(x.at));
      if (last && !H.runs.has(shooter)) H.runs.set(shooter, last.at);
    }
    if (!['corner', 'freekick', 'penalty'].includes(H.kind)) beats = buildUp(beats);
    H.beats = beats;
    H.finale = H.fk === 0;
    H.est = CUT + 0.6 + estBeats(beats);
    if (b.state === 'held') { const [fx, fz] = footSpot(agents[b.owner]); b.x = fx; b.z = fz; b.y = 0; }
    b.prev = [b.x, b.z];
    matchFeed.hlAck = spec.id;
    matchFeed.hlPhase = 'play';
  }

  // Construction (0.8.7) : la finale (placements et gestes ci-dessus) est l'arrivée. On part de plus loin : toute la
  // scène reculée de shift (12 à 17 m ; 8 à 11 m pour un contre), le ballon à un défenseur central qui relance (parfois
  // après une passe de son gardien) ou, sur un contre, à un milieu qui vient de le récupérer ; deux ou trois passes, d'un
  // côté puis de l'autre, le mènent au joueur qui lance la finale, à sa place, pendant que les deux blocs remontent
  // (lagAt). Le pressing part d'une relance adverse : le gardien, puis un défenseur, servent celui qui perd le ballon.
  function buildUp(finale) {
    const owner0 = b.state === 'held' ? b.owner : -1;
    if (owner0 < 0) return finale;
    const { r, rr } = H;
    const T = teamOf(owner0);
    const outfield = (t) => teamIdx(t).filter((i) => active(i) && slotOf(i) > 0);
    const chain = [];
    let from;
    if (H.kind === 'press') { // relance adverse sous pressing : gardien → défenseur → celui qui va perdre le ballon
      const keeper = T * 11;
      const mate = outfield(T).filter((i) => i !== owner0).sort((x, y) => Math.abs(H.home.get(x)[1]) - Math.abs(H.home.get(y)[1]))[0];
      give(keeper);
      chain.push({ t: 'wait', dur: 0.5 });
      if (mate !== undefined) {
        chain.push({ t: 'pass', from: keeper, to: mate, at: H.home.get(mate), style: 'ground' });
        chain.push({ t: 'carry', who: mate, to: H.home.get(mate), speed: 0.25, max: 0.6 });
        from = mate;
      } else from = keeper;
      chain.push({ t: 'pass', from, to: owner0, at: H.home.get(owner0), style: 'ground' });
      H.fk = chain.length;
      return [...chain, ...finale];
    }
    const counter = H.kind === 'counter';
    // Retournements (1.0.19, demande du PDG du 11/11 : « l'équipe qui a le ballon au début du temps fort n'est pas
    // forcément celle qui termine l'action : récupérations, contre-attaques, de la variation et du réalisme, en défense
    // aussi ») : une action sur deux part chez l'adversaire, qui perd le ballon (passe coupée, ou tacle glissé sur le
    // porteur) ; l'équipe de la finale contre-attaque. Sur un contre, presque toujours.
    const ft = H.e.forceTurn; // (bancs d'essai : 'intercept', 'tackle' ou 'none')
    const turn = ft ? ft !== 'none' : r() < (counter ? 0.85 : 0.5);
    H.turn = turn ? (ft && ft !== 'none' ? ft : r() < 0.6 ? 'intercept' : 'tackle') : null;
    // récupération haute (pressing sur la relance adverse, près de sa surface) : la finale s'enchaîne vite ; sur un contre,
    // récupération dans notre moitié et longue course
    H.shift = turn ? (counter ? rr(1.0, 1.4) : rr(0.4, 0.75)) : counter ? rr(0.8, 1.1) : rr(1.2, 1.7);
    // le buteur et le joueur qui lance la finale partent déjà plus haut (1.0.19) : en contre, l'attaquant est devant
    // quand le ballon est récupéré ; sinon la dernière passe arrivait avant lui
    H.shiftOf = new Map();
    for (const i of [H.shooter, owner0]) if (i >= 0 && teamOf(i) === T) H.shiftOf.set(i, H.shift * (turn ? 0.35 : 0.6));
    for (const i of [...outfield(0), ...outfield(1)]) {
      const [u, v] = H.home.get(i);
      place(i, clamp(u - (H.shiftOf.get(i) ?? H.shift), -4.3, 4.6), v, teamOf(i) === H.A ? GOAL_X : -GOAL_X, 0);
    }
    // (1.0.19 : jamais le buteur ni le passeur annoncés comme relais au milieu, sauf faute d'autres joueurs : servant de
    // relais, le buteur se retrouvait à 20 m de sa place et la dernière passe l'attendait en roulant au pas)
    const all = outfield(T).filter((i) => i !== owner0);
    const keep = all.filter((i) => i !== H.shooter && i !== H.assist);
    const mates = keep.length >= 3 ? keep : all;
    const homeU = (i) => H.home.get(i)[0];
    const homeV = (i) => H.home.get(i)[1];
    const startOf = (i) => [clamp(homeU(i) - (H.shiftOf.get(i) ?? H.shift), -4.3, 4.6), homeV(i)];
    const near = (i, u, v) => Math.hypot(startOf(i)[0] - u, startOf(i)[1] - v);
    let starter;
    if (turn) {
      const opp = outfield(1 - T);
      const roleT = (i) => slotsOf(S.formation[teamOf(i)])[slotOf(i)];
      // le porteur adverse : sur un contre, un milieu ou un attaquant près du rond central ; sinon un défenseur ou un milieu
      // qui relance de sa moitié (pressing haut) ; sa cible, un coéquipier devant lui
      const cu0 = counter ? 0.1 : 2.0;
      const d1 = opp.filter((i) => (counter ? roleT(i) !== 'D' : roleT(i) !== 'A')).sort((x, y) => near(x, cu0, 0) + Math.abs(startOf(x)[1]) * 0.3 - near(y, cu0, 0) - Math.abs(startOf(y)[1]) * 0.3)[0];
      const [su, sv] = d1 === undefined ? [0, 0] : startOf(d1);
      // la passe adverse et celui qui la coupe : le couple (receveur visé, intercepteur) où notre joueur est le plus près de
      // la ligne de passe (il lit la passe : sinon il courait 20 m et la passe traînait 4 s)
      const segD = (i, u1, v1) => { const [pu, pv] = startOf(i); const du = u1 - su, dv = v1 - sv; const L2 = du * du + dv * dv || 1; const f = clamp(((pu - su) * du + (pv - sv) * dv) / L2, 0.25, 0.8); return Math.hypot(su + du * f - pu, sv + dv * f - pv); };
      const cutters = counter ? [owner0] : [...mates, owner0];
      let d2, by, bestD = Infinity;
      for (const c of opp.filter((i) => i !== d1 && startOf(i)[0] < su - 0.45)) {
        const [cu1, cv1] = startOf(c);
        if (Math.hypot(cu1 - su, cv1 - sv) > 2.6) continue;
        for (const a2 of cutters) { const d = segD(a2, cu1, cv1); if (d < bestD) { bestD = d; d2 = c; by = a2; } }
      }
      if (H.turn === 'intercept' && bestD > 0.7) H.turn = 'tackle'; // personne pour la couper : un tacle
      if (d1 !== undefined && (H.turn === 'tackle' || d2 !== undefined)) {
        give(d1);
        if (H.turn === 'intercept') { // passe coupée (contre : le joueur de la finale récupère lui-même)
          chain.push({ t: 'carry', who: d1, to: [su - rr(0.25, 0.45), sv * 0.9], speed: 0.38, max: rr(0.7, 1.0) });
          chain.push({ t: 'intercept', from: d1, to: d2, by });
          starter = by;
        } else { // tacle glissé sur le porteur qui file vers notre but ; le ballon part vers un coéquipier
          const tk = mates.filter((i) => i !== H.shooter).sort((x, y) => near(x, su - 0.7, sv) - near(y, su - 0.7, sv))[0];
          const col = counter && owner0 !== tk ? owner0 : [...mates, owner0].filter((i) => i !== tk).sort((x, y) => near(x, su - 0.2, sv * 0.6) - near(y, su - 0.2, sv * 0.6))[0];
          if (tk !== undefined && col !== undefined) {
            chain.push({ t: 'carry', who: d1, to: [su - rr(0.7, 0.9), sv * 0.85], speed: 0.4, max: 1.2 });
            chain.push({ t: 'tackle', who: tk, victim: d1, to: col });
            starter = col;
          }
        }
        if (starter !== undefined) chain.push({ t: 'carry', who: starter, to: 'plan', speed: 0.5, max: rr(0.4, 0.7) }); // il repart aussitôt
        else { chain.length = 0; H.turn = null; }
      } else H.turn = null;
    }
    if (starter === undefined) {
      // départ : un défenseur central (le plus axial), ou sur un contre le milieu le plus reculé
      const starters = mates.filter((i) => slotsOf(S.formation[T])[slotOf(i)] === (counter ? 'M' : 'D'));
      starter = (starters.length ? starters : mates).sort((x, y) => (counter ? homeU(x) - homeU(y) : Math.abs(homeV(x)) - Math.abs(homeV(y))))[0];
      if (starter === undefined) return finale;
      const keeperFirst = !counter && r() < 0.2; // relance du gardien : une passe courte vers son défenseur
      if (keeperFirst) {
        const keeper = T * 11;
        give(keeper);
        chain.push({ t: 'wait', dur: 0.35 });
        chain.push({ t: 'pass', from: keeper, to: starter, at: 'plan', style: 'ground' });
      } else give(starter);
      chain.push({ t: 'carry', who: starter, to: 'plan', speed: 0.3, max: rr(0.4, 0.8) }); // quelques mètres balle au pied
    }
    // les relais : de l'arrière vers l'avant, souvent d'un côté à l'autre, jusqu'au joueur de la finale (après un
    // retournement, une ou deux passes : la contre-attaque va vite)
    const k0 = H.turn ? 1 : counter ? (r() < 0.5 ? 1 : 2) : 2 + (r() < 0.3 ? 1 : 0);
    // le budget de temps (15 s au plus, choix du PDG) : moins de relais quand la finale est longue
    const room = HL_BUDGET - CUT - 0.6 - estBeats(finale) - estBeats(chain);
    const k = clamp(Math.min(k0, Math.floor(room / 1.75) + 1), 1, k0);
    const seq = [];
    let cur = starter;
    for (let j = 0; j < k - 1 && starter !== owner0; j++) {
      const cu = homeU(cur), cv = homeV(cur);
      const opts = mates.filter((i) => i !== starter && !seq.includes(i) && homeU(i) > cu - 0.3 && homeU(i) < Math.max(cu + 2.4, homeU(owner0) - 0.2)
        && Math.hypot(homeU(i) - cu, homeV(i) - cv) > 1.2 && Math.hypot(homeU(i) - homeU(owner0), homeV(i) - homeV(owner0)) > 1.0); // jamais une passe de quelques pas
      if (!opts.length) break;
      const score = (i) => (homeU(i) - cu) * 0.6 + (Math.sign(homeV(i)) !== Math.sign(cv) && Math.abs(homeV(i) - cv) > 0.8 ? 0.9 : 0) + r() * 0.8;
      opts.sort((x, y) => score(y) - score(x));
      seq.push(opts[0]);
      cur = opts[0];
    }
    if (starter !== owner0) seq.push(owner0); // (l'intercepteur peut être le joueur de la finale lui-même)
    from = starter;
    seq.forEach((to, j) => {
      const last = j === seq.length - 1;
      const [fu, fv] = H.home.get(from), [tu, tv] = H.home.get(to);
      chain.push({ t: 'pass', from, to, at: last ? H.home.get(to) : 'plan', style: Math.hypot(tu - fu, tv - fv) > 2.6 ? 'lob' : 'ground' });
      if (!last && r() < 0.5) chain.push({ t: 'carry', who: to, to: 'plan', speed: 0.34, max: rr(0.25, 0.5) }); // contrôle orienté, quelques pas (sinon, en une touche)
      from = to;
    });
    H.fk = chain.length;
    H.bT = chain.reduce((t, x) => t + (x.t === 'wait' ? x.dur : x.t === 'pass' ? 1.4 : x.t === 'intercept' ? 1.6 : x.t === 'tackle' ? 2.2 : Math.min(x.max ?? 1, 1)), 0.4);
    return [...chain, ...finale];
  }

  // --- Temps forts : le jeu ---------------------------------------------------------------------------------------
  // Hors-jeu (0.8.15, demande du PDG : une action qui respecte les règles) : la ligne est celle de l'avant-dernier
  // adversaire (le gardien compte), jamais en deçà du ballon ni de la ligne médiane, dans le repère de l'équipe qui attaque.
  // Un attaquant ne la dépasse pas avant que le ballon ne parte vers lui : il règle sa course dessus, puis s'élance.
  function offsideLine() {
    const us = [];
    for (const i of teamIdx(H.D)) if (active(i)) us.push(uvOf(agents[i].x, agents[i].z)[0]);
    us.sort((x, y) => y - x);
    return Math.max(us[1] ?? 0, uvOf(b.x, b.z)[0], 0);
  }
  const onside = (i) => uvOf(agents[i].x, agents[i].z)[0] <= H.line + 0.005;
  // Ballon libre : celui que l'action désigne n'est pas forcément le plus près. Le coéquipier nettement plus proche y va à
  // sa place (jamais le buteur ni le passeur annoncés par le direct, qui gardent leur rôle) : personne ne traverse le
  // terrain pour un ballon qu'un autre a presque au pied.
  function swapRole(from, to) {
    for (let k = H.k; k < H.beats.length; k++) { const x = H.beats[k]; for (const f of ['who', 'from', 'to']) if (x[f] === from) x[f] = to; }
    H.busy.delete(from);
    H.busy.add(to);
    if (H.runs.has(from)) { H.runs.set(to, H.runs.get(from)); H.runs.delete(from); }
  }
  function nearestFor(i) {
    if (b.state !== 'free' || i < 0 || i === H.shooter || i === H.assist) return i;
    const di = Math.hypot(agents[i].x - b.x, agents[i].z - b.z);
    let best = i, bd = di;
    for (const j of teamIdx(teamOf(i))) {
      if (j === i || !active(j) || slotOf(j) === 0 || j === H.shooter || j === H.assist || H.busy.has(j)) continue;
      const d = Math.hypot(agents[j].x - b.x, agents[j].z - b.z);
      if (d < bd) { bd = d; best = j; }
    }
    if (best !== i && bd < di * 0.6 && di - bd > 0.2) { swapRole(i, best); H.swaps = (H.swaps || 0) + 1; return best; }
    return i;
  }
  // carton rouge, après la faute : personne d'autre que le fautif ne vient à moins de 2,5 m du joueur à terre (audit de
  // la charte, 0.8.24 : un second défenseur se collait au porteur fauché) ; il vise un point hors du cercle, du côté où
  // il se trouve (il y va en marchant, sans glisser)
  const VICTIM_CLEAR = 0.25;
  const clearOfVictim = (i, x, z) => {
    if (!H || H.outcome !== 'red' || H.victim === undefined || H.foulAt === undefined || i === H.offender || i === H.victim) return [x, z];
    const v = agents[H.victim];
    if (Math.hypot(x - v.x, z - v.z) < VICTIM_CLEAR) {
      const ox = agents[i].x - v.x, oz = agents[i].z - v.z, od = Math.hypot(ox, oz) || 1;
      x = v.x + (ox / od) * (VICTIM_CLEAR + 0.03); z = v.z + (oz / od) * (VICTIM_CLEAR + 0.03);
    }
    // derrière le fautif, vu de la caméra du direct (toujours côté +z, plongée de 28 à 34°) : le carton brandi au-dessus
    // de sa tête se projette sur cette bande (jusqu'à 7,4 m derrière lui avec la caméra la plus proche, perspective
    // comprise) ; elle reste libre dès la faute (audit, 0.8.24 : le carton semblait collé à un coéquipier placé là)
    const o = agents[H.offender];
    if (o.z - z > -0.05 && o.z - z < 0.85 && Math.abs(x - o.x) < 0.1) x = o.x + (Math.sign(agents[i].x - o.x) || 1) * 0.13;
    return [x, z];
  };
  const steerUV = (i, u, v, speed, dt, look = null) => {
    const [x, z] = clearOfVictim(i, ...at(u, v));
    if (look) agents[i].steer(x, z, speed, dt, ...look);
    else agents[i].steer(x, z, speed, dt);
  };
  // passe vers (tx, tz) en T secondes : au sol (le ballon ralentit en roulant), ou aérienne jusqu'à la hauteur y1.
  // 1.0.18 : vraie physique (air, effet, herbe), la vitesse de départ est résolue pour arriver à l'heure ; un centre
  // part brossé (il s'enroule), une passe au sol roule droit
  function launchBall(tx, tz, T, { ground = false, y1 = 0, curl = 0 } = {}) {
    spinOff();
    if (ground) b.y = 0;
    const spin = [0, curl, 0];
    const v = solveLaunch({ x: b.x, y: b.y, z: b.z }, [tx, y1, tz], T, { spin, ground });
    Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, sx: 0, sy: ground ? 0 : curl, sz: 0, skid: ground ? 0.08 : 0 });
    b.owner = -1;
  }
  // durées réalistes (0.8.7) : une passe au sol file à 12 m/s de moyenne et arrive moins vite ; une transversale est lobée
  const passTimeOf = (style, d) => (
    style === 'cross' ? clamp(0.75 + d * 0.13, 0.85, 1.5)
      : style === 'flick' ? 0.5
        : style === 'lob' ? clamp(0.8 + d * 0.22, 1.1, 2.0)
          : style === 'through' ? clamp(d / 1.25, 0.6, 2.0)
            : clamp(d / 1.2, 0.45, 2.0)
  );
  // Frappe : la cible sur la ligne de but dépend de l'issue (live.js) et de la place du gardien. Le gardien plonge
  // dans les derniers instants : vers le ballon pour un arrêt, trop court ou du mauvais côté pour un but.
  // Tir contré (1.0.20, choix du PDG : « seulement quand l'issue est à côté, dévié en corner ») : quand le tireur arme une
  // frappe qui doit finir à côté, un défenseur placé sur la trajectoire (entre 0,8 et 9,5 m du tireur, à moins de 2,2 m
  // de la ligne) se jette, jambe tendue au point de passage ; dans le mur d'un coup franc, le joueur visé saute. Le ballon
  // le touche et file hors du cadre, en corner ou par-dessus la barre. Trois fois sur quatre quand un défenseur est sur la
  // ligne (à moins d'un mètre), une fois sur deux sinon et pour le mur. (ox, oz) : le point de la frappe
  function armBlock(i, style, ox, oz) {
    if (H.block !== undefined || H.outcome !== 'w' || H.pen || style === 'head' || style === 'pen') return;
    H.block = null;
    const [gx, gz] = at(GOAL_X, 0);
    const L = Math.hypot(gx - ox, gz - oz) || 1;
    const ux = (gx - ox) / L, uz = (gz - oz) / L;
    const wall = style === 'curl';
    let best = -1, bl = Infinity, bs = 0;
    for (const j of teamIdx(H.D)) {
      if (!active(j) || slotOf(j) === 0 || (wall && !H.wall?.has(j))) continue;
      const a = agents[j];
      const s = (a.x - ox) * ux + (a.z - oz) * uz;
      const lat = Math.abs((a.x - ox) * uz - (a.z - oz) * ux);
      if (s < (wall ? 0.5 : 0.08) || s > (wall ? 1.1 : 0.95) || lat > (wall ? 0.06 : 0.22)) continue;
      if (lat < bl) { bl = lat; best = j; bs = s; }
    }
    if (best < 0 || H.r() > (wall ? 0.5 : bl > 0.1 ? 0.65 : 0.85)) return;
    const a = agents[best];
    const qx = ox + ux * bs, qz = oz + uz * bs;
    const lead = Math.max(0.1, (KICK_CONTACT - agents[i].kick) * KICK_TIME) + bs / (wall ? 2.5 : 2.9);
    const slide = !wall && Math.hypot(qx - a.x, qz - a.z) > 0.04; // déjà sur la ligne : il fait barrage du corps
    H.block = { who: best, q: [qx, qz], y: wall ? H.rr(0.12, 0.17) : slide ? H.rr(0.015, 0.04) : H.rr(0.03, 0.08), wall, slide, t0: H.t, lead, from: [a.x, a.z], done: false };
    if (slide) Object.assign(a, { tackleId: H.id * 8 + 6, tackleLead: lead });
    H.blocks = (H.blocks || 0) + 1; // mesure (banc)
  }
  // le contreur : la glissade pilotée de sa place jusqu'au point de passage (jambe tendue, 85 cm, au contact) ; dans le
  // mur, tous sautent quand le ballon arrive
  function blockStep(dt) {
    const k = H.block;
    if (H.wall && H.shot && !H.shot.blocked) wallJump();
    if (!k) return;
    const a = agents[k.who];
    H.busy.add(k.who);
    if (k.wall) { wallJump(k.t0 + k.lead); return; }
    if (k.done) return;
    const [qx, qz] = k.q;
    const dx = qx - k.from[0], dz = qz - k.from[1], dd = Math.hypot(dx, dz);
    if (!k.slide) { a.steer(a.x, a.z, 0, dt, b.x, b.z); return; } // barrage : il fait face au tireur
    const r = Math.min(0.085, dd * 0.9);
    const tx = qx - (dx / dd) * r, tz = qz - (dz / dd) * r;
    const f = clamp((H.t - k.t0) / Math.max(0.05, k.lead), 0, 1);
    const e = 1 - (1 - f) * (1 - f);
    const nx = k.from[0] + (tx - k.from[0]) * e, nz = k.from[1] + (tz - k.from[1]) * e;
    a.vx = (nx - a.x) / Math.max(dt, 1e-4); a.vz = (nz - a.z) / Math.max(dt, 1e-4);
    a.x = nx; a.z = nz; a.speed = Math.hypot(a.vx, a.vz);
    a.h = Math.atan2(dz, dx);
  }
  function wallJump(tc = (H.shot?.t0 ?? H.t) + 0.3) {
    for (const j of H.wall) {
      const a = agents[j], x = (H.t - tc) / 0.3;
      if (Math.abs(x) < 1) { a.lift = 0.045 * (1 - x * x); a.jumpAt = H.t; }
    }
  }
  function shoot(i, style) {
    const { rr, outcome } = H;
    const kp = agents[H.keeper];
    const [, kv] = uvOf(kp.x, kp.z);
    const [bu, bv] = uvOf(b.x, b.z);
    if (H.block) { // tir contré : le ballon part vers le point de passage, où le défenseur le touche
      const k = H.block;
      const [qx, qz] = k.q;
      const sp = { foot: rr(2.6, 3.2), volley: rr(2.7, 3.2), long: rr(3.0, 3.5), poke: rr(1.9, 2.3), curl: 2.5 }[style] || 2.8;
      const T = Math.max(0.06, Math.hypot(qx - b.x, qz - b.z) / sp);
      spinOff();
      const v = solveLaunch({ x: b.x, y: b.y, z: b.z }, [qx, k.y, qz], T, { spin: [0, 0, 0] });
      Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, sx: 0, sy: 0, sz: 0, skid: 0, hit: null });
      b.state = 'shot';
      b.owner = -1;
      H.dive = null;
      k.uq = uvOf(qx, qz)[0];
      H.shot = { T, t0: H.t, tv: bv, h: k.y, style, from: [bu, bv], tc: T, ku: k.uq, blocked: true };
      return T;
    }
    let tv, h;
    const lowH = style === 'head' ? [0.02, 0.12] : style === 'pen' ? [0.02, 0.17] : [0.02, 0.2];
    if (outcome === 'g') {
      const away = H.pen ? (H.r() < 0.5 ? 1 : -1) : (kv > 0 ? -1 : kv < 0 ? 1 : (H.r() < 0.5 ? 1 : -1));
      tv = away * rr(0.17, 0.31);
      h = rr(...lowH);
    } else if (outcome === 's') {
      tv = clamp(kv + rr(-0.24, 0.24), -0.31, 0.31);
      h = rr(lowH[0] + 0.01, lowH[1]);
    } else if (outcome === 'p') {
      if (H.r() < 0.3 && style !== 'head') { tv = rr(-0.25, 0.25); h = BAR; } else { tv = (H.r() < 0.5 ? -1 : 1) * GOAL_HALF; h = rr(0.04, 0.2); }
    } else if (H.r() < 0.4 && style !== 'pen') { tv = rr(-0.3, 0.3); h = rr(0.32, 0.55); } else { tv = (H.r() < 0.5 ? -1 : 1) * rr(0.46, 0.85); h = rr(0.02, 0.22); }
    const speed = { foot: rr(2.6, 3.2), head: rr(1.6, 2.0), volley: rr(2.7, 3.2), long: rr(3.0, 3.5), pen: rr(2.5, 2.9), poke: rr(1.9, 2.3) }[style] || 2.8;
    const [gx, gz] = at(GOAL_X + 0.02, tv);
    const d = Math.hypot(gx - b.x, gz - b.z);
    const T = style === 'curl' ? clamp(d / 2.0, 1.0, 1.4) : d / speed;
    // 1.0.18 : vraie physique. La frappe enroulée (coup franc) part de côté et revient vers le but ; les autres frappes ont
    // un peu d'effet au hasard ; la tête et le penalty, aucun. La vitesse de départ est résolue pour la cible du moteur.
    spinOff();
    const curl = style === 'curl' ? Math.sign(bv || 1) * rr(0.75, 1.0) : style === 'head' || style === 'pen' ? 0 : rr(-0.25, 0.25);
    const v = solveLaunch({ x: b.x, y: b.y, z: b.z }, [gx, h, gz], T, { spin: [0, curl, 0] });
    Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, sx: 0, sy: curl, sz: 0, skid: 0, hit: null });
    b.state = 'shot';
    b.owner = -1;
    // l'arrêt du gardien (0.8.24, joueurs 3D) : le point où le ballon croise sa ligne (là où il se jette pour un but ou un
    // tir à côté), à gauche (+) ou à droite de son corps, sa hauteur, et le temps qui le sépare de la frappe ; la
    // 3D y choisit le geste (prise basse, moyenne ou haute, arrêt du corps, plongeon) et le cale sur l'instant du contact.
    // 1.0.18 : ce point vient de la vraie trajectoire (air et effet compris)
    const [ku] = uvOf(kp.x, kp.z);
    const kx = at(ku, 0)[0];
    const dirA = S.dir[H.A];
    const f0 = clamp((ku - bu) / Math.max(0.05, GOAL_X - bu), 0, 1);
    let tc = f0 * T, crossV = bv + (tv - bv) * f0, hc = 0;
    simulate({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, sx: 0, sy: curl, sz: 0, skid: 0 }, T + 0.3, 1 / 240, (s, t) => {
      if ((s.x - kx) * dirA < 0) return false;
      tc = t; crossV = s.z * dirA; hc = s.y;
      return true;
    });
    // le gardien : où plonger, et quand (un penalty se plonge au moment de la frappe)
    const reach = outcome === 's' ? crossV : outcome === 'g' ? (H.r() < 0.55 ? -Math.sign(tv || 1) * rr(0.12, 0.28) : tv * rr(0.25, 0.55)) : tv * rr(0.4, 0.8);
    const [cx, cz] = at(ku, reach);
    const side = ((cx - kp.x) * Math.sin(kp.h) - (cz - kp.z) * Math.cos(kp.h)) * 10; // m, sa gauche positive
    // selon la frappe (choix du PDG, 1.0.18) : une frappe forte ou loin de lui, il plonge et la repousse (en corner, ou
    // par-dessus la barre) ; une frappe molle ou sur lui, il la capte dans les gants et la serre contre lui
    const vMs = Math.hypot(b.vx, b.vy, b.vz) * 10;
    const far = Math.abs(side), hm = hc * 10 + 0.11;
    const parry = outcome === 's' && (far > 1.35 || (far > 0.7 && vMs > 22) || hm > 2.05 || (H.pen && far > 0.6));
    H.dive = { v: reach, at: H.t + (H.pen ? 0.06 : Math.max(0.05, tc - 0.42)), from: kv, catch: outcome === 's', parry };
    H.shot = { T, t0: H.t, tv, h, style, from: [bu, bv], tc, ku };
    // saveLead : le temps de la frappe au contact ; saveId : un arrêt par frappe (la 3D lance le geste dès la frappe)
    Object.assign(kp, { saveSide: side, saveH: hc * 10, saveLead: tc, saveKind: outcome === 's' ? (parry ? 2 : 1) : 3, saveId: H.id * 8 + (H.shots = (H.shots || 0) + 1) });
    // l'arrêt (1.0.18, chantier du PDG : « le ballon le frappe au milieu du corps ») : le gardien se détend pour que ses
    // mains, au contact de son geste, soient là où passe le ballon (prise : entre les deux mains ; plongeon : la main
    // tendue) ; un tir qui le bat le voit se jeter vers son point de plongeon, comme avant
    const hand = outcome === 's' ? players.saveHand?.(H.keeper, kp) : null;
    if (hand) {
      const [bx2, bz2] = at(ku, crossV);
      const fx = Math.cos(kp.h), fz = Math.sin(kp.h);
      H.dive.root = [bx2 - (fx * hand.fwd - fz * hand.right), bz2 - (fz * hand.fwd + fx * hand.right)];
      H.dive.tc = H.t + tc;
    }
    return T;
  }
  function reveal() {
    if (H.revealed) return;
    H.revealed = true;
    H.revealT = H.t;
    matchFeed.hlReveal = H.id;
    matchFeed.hlClock = H.e.at;
    const { A, outcome } = H;
    if (outcome === 'g') on.goal?.(A);
    else if (outcome === 's') on.save?.(A);
    else if (outcome === 'p') on.post?.(A);
    else if (outcome === 'w') on.miss?.(A);
  }

  // Le ballon d'un temps fort : tenu, en vol (passe, frappe), au fond des filets, dans les gants.
  // 1.0.18 : pas courts (1/240 s) de vraie physique (ballphysics.js), montants et barre du but attaqué, filet.
  function ballPhysics(dt) {
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    const gx = S.dir[H.A] * GOAL_X;
    for (let k = 0; k < n; k++) {
      if (b.state === 'net') { H.net = Math.max(H.net || 0, stepNet(b, gx, h)); continue; }
      stepFree(b, h);
      // montants et barre (le poteau du moteur, ou un ballon libre qui y revient)
      if ((b.state === 'shot' || b.state === 'free') && Math.abs(b.x - gx) < 0.05) {
        const hit = hitFrame(b, gx);
        if (hit && !b.hit) b.hit = hit;
      }
    }
  }
  function ballUpdate(dt) {
    if (b.state === 'held') {
      const p = agents[b.owner];
      if (b.strike) { // frappe armée : la dernière touche pousse le ballon là où le pied le touchera
        const s = b.strike;
        const f = clamp((H.t - s.t0) / s.T, 0, 1);
        const e = 1 - (1 - f) * (1 - f);
        b.x = s.x0 + (s.x1 - s.x0) * e; b.z = s.z0 + (s.z1 - s.z0) * e;
        b.y = Math.max(0, b.y - dt * 1.2);
        return;
      }
      if (b.fixed) { b.y = 0; return; } // ballon arrêté (coup de pied arrêté) : il attend le tireur
      // conduite : le ballon devant le pied, rattrapé à chaque foulée ; la cible anticipe la course (sans quoi le ballon
      // traînait derrière le pied d'autant que le joueur allait vite)
      const [sx, sz] = footSpot(p, 0.04 + 0.025 * Math.abs(Math.sin(p.phase * 0.5)));
      const k = Math.min(1, dt * 12);
      b.x += (sx + p.vx / 12 - b.x) * k; b.z += (sz + p.vz / 12 - b.z) * k;
      b.y = Math.max(0, b.y - dt * 1.2);
      return;
    }
    if (b.state === 'keeper') { // dans les gants (1.0.18 : entre ses gants, là où ses mains le tiennent ; jamais au ventre)
      const kp = agents[H.keeper];
      const an = players.ballAnchor?.(H.keeper);
      const k = Math.min(1, dt * (an ? 30 : 14));
      if (an) {
        b.x += (an.x - b.x) * k; b.z += (an.z - b.z) * k;
        b.y += (Math.max(0, an.y - S.baseY - BALL_R) - b.y) * k;
      } else {
        b.x += (kp.x + Math.cos(kp.h) * 0.02 - b.x) * k;
        b.z += (kp.z + Math.sin(kp.h) * 0.02 + kp.lean * 0.11 - b.z) * k;
        b.y += (0.09 * (1 - Math.abs(kp.lean) * 0.55) - b.y) * k;
      }
      return;
    }
    if (b.state === 'dead') return;
    const [u0] = uvOf(b.x, b.z);
    const p0 = [b.x, b.y, b.z];
    ballPhysics(dt);
    if (b.state === 'net') return; // au fond des filets (stepNet)
    if (b.state !== 'shot') return;
    const [u1, v1] = uvOf(b.x, b.z);
    // tir contré : au point de passage, le ballon touche le défenseur et file hors du cadre (en corner, une fois sur
    // quatre par-dessus la barre ; le mur, une fois sur deux), ralenti et relevé
    const k = H.block;
    if (k && !k.done && u0 < k.uq && u1 >= k.uq) {
      const f = clamp((k.uq - u0) / Math.max(1e-6, u1 - u0), 0, 1);
      b.x = p0[0] + (b.x - p0[0]) * f; b.y = p0[1] + (b.y - p0[1]) * f; b.z = p0[2] + (b.z - p0[2]) * f;
      const [, qv] = uvOf(b.x, b.z);
      const over = H.r() < (k.wall ? 0.5 : 0.25);
      const side = Math.sign(qv - H.shot.from[1]) || (H.r() < 0.5 ? 1 : -1);
      const tv = over ? clamp(qv * 0.5 + H.rr(-0.15, 0.15), -0.3, 0.3) : side * (GOAL_HALF + H.rr(0.12, 0.55));
      const ty = over ? BAR + H.rr(0.08, 0.3) : H.rr(0.03, 0.2);
      const [tx, tz] = at(GOAL_X + 0.05, tv);
      const T = Math.hypot(tx - b.x, tz - b.z) / H.rr(1.1, 1.7);
      const v = solveLaunch({ x: b.x, y: b.y, z: b.z }, [tx, ty, tz], T, { spin: [0, H.rr(-0.3, 0.3), 0] });
      Object.assign(b, { vx: v.vx, vy: v.vy, vz: v.vz, sx: 0, sy: 0, sz: 0, skid: 0 });
      k.done = true;
      H.hold.set(k.who, H.t + (k.slide ? 1.15 : 0.4));
      return;
    }
    const kp = agents[H.keeper];
    const ku = H.shot?.ku ?? uvOf(kp.x, kp.z)[0]; // la ligne où le moteur a prévu l'arrêt (le gardien s'y détend)
    // arrêt : le ballon atteint le gardien, qui l'a suivi et s'est jeté dessus
    if (H.outcome === 's' && u0 < ku - 0.01 && u1 >= ku - 0.01) {
      // le ballon reste là où il rencontre les gants (1.0.18 : une frappe parcourt 80 cm par image, il passait au-delà)
      const f = clamp((ku - 0.01 - u0) / Math.max(1e-6, u1 - u0), 0, 1);
      b.x = p0[0] + (b.x - p0[0]) * f; b.y = p0[1] + (b.y - p0[1]) * f; b.z = p0[2] + (b.z - p0[2]) * f;
      const [, v1s] = uvOf(b.x, b.z);
      const [, kvNow] = uvOf(kp.x, kp.z);
      kp.leanTo = clamp((v1s - kvNow) / 0.11, -1, 1);
      kp.leanHold = 0.8;
      if (H.dive?.parry) parryBall(ku - 0.01, v1s);
      else { b.vx = b.vz = b.vy = 0; b.sx = b.sy = b.sz = 0; b.state = 'keeper'; }
      reveal();
      return;
    }
    if (b.hit && H.outcome === 'p' && !H.revealed) { b.state = 'free'; reveal(); return; } // sur le montant ou la barre
    if (u1 >= GOAL_X) {
      const inFrame = Math.abs(v1) < GOAL_HALF - 0.012 && b.y < BAR - 0.01;
      if (H.outcome === 'p') { // poteau ou barre manqué de peu par la physique : le choc a lieu quand même
        [b.x] = at(GOAL_X - 0.012, v1);
        b.vx = -b.vx * 0.45; b.vz = (H.r() - 0.5) * 0.9; b.vy = Math.abs(b.vy) * 0.3;
        b.state = 'free';
        reveal();
      } else if (H.outcome === 'g' && inFrame) {
        b.state = 'net'; // le filet le freine et le retient (stepNet)
        reveal();
      } else if (!H.revealed) { reveal(); b.state = 'free'; } // dehors
    }
  }
  // la parade (1.0.18, choix du PDG : « dévié en corner ») : le gant repousse le ballon hors du cadre, sur le côté
  // (assez fort pour passer le montant avant la ligne de but) ou, haut et au centre, par-dessus la barre
  function parryBall(u1, v1) {
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    const dir = S.dir[H.A];
    const high = b.y > BAR * 0.62 && Math.abs(v1) < GOAL_HALF * 0.75;
    const toLine = Math.max(0.02, GOAL_X - u1);
    let du, dv, dy;
    if (high) { // claquée par-dessus
      du = sp * 0.32; dv = Math.sign(v1 || 1) * sp * 0.08;
      const t = toLine / du;
      dy = Math.max(0.45, (BAR + 0.05 - b.y + 0.5 * 0.981 * t * t) / t);
    } else { // repoussée sur le côté, en corner
      du = sp * 0.22;
      const t = toLine / du;
      const need = (GOAL_HALF + 0.07 - Math.abs(v1)) / t;
      dv = Math.sign(v1 || (H.r() < 0.5 ? 1 : -1)) * Math.max(sp * 0.3, need);
      dy = 0.12 + H.r() * 0.15;
    }
    Object.assign(b, { vx: du * dir, vz: dv * dir, vy: dy, sx: 0, sy: 0, sz: 0, state: 'free' });
  }

  // Un pas des actions du temps fort (0.8.7). Le ballon ne change jamais de pied à distance : un joueur ne le prend
  // qu'au contact (son pied à RECV du ballon, ballon bas ; sa tête à hauteur d'un centre), sinon il va le chercher
  // (gather). Une passe part vers le point où son receveur peut être à temps (passTime) ; s'il la manque malgré tout, il
  // court après le ballon qui roule. Aucun ballon recollé, aucun joueur posé pendant le jeu.
  function next() { H.k += 1; H.bt = 0; if (H.k >= H.fk && !H.finale) { H.finale = true; H.finaleT = H.t; } }
  const touching = (i, head = false) => {
    const p = agents[i];
    if (head) return Math.hypot(b.x - p.x, b.z - p.z) < 0.1 && b.y > 0.1 && b.y < 0.27;
    const [fx, fz] = footSpot(p);
    return (Math.hypot(b.x - fx, b.z - fz) < RECV || Math.hypot(b.x - p.x, b.z - p.z) < REACH) && b.y < 0.09;
  };
  // il va au ballon (libre, qui roule ou arrêté) et le prend au contact ; vrai quand il l'a
  // course d'interception (1.0.19) : le premier point de la trajectoire du ballon (simulée) que le joueur, à cette
  // vitesse, atteint avant lui ; sinon, là où le ballon sera au bout de l'horizon
  function cutPoint(i, horizon = 2.5, speed = SPRINT) {
    const a = agents[i];
    const v = Math.max(0.3, Math.min(speed, SPRINT)) * 0.92;
    let best = [b.x, b.z];
    simulate({ x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, sx: b.sx || 0, sy: b.sy || 0, sz: b.sz || 0, skid: b.skid || 0 }, horizon, 1 / 60, (s, t) => {
      best = [s.x, s.z];
      return s.y < 0.1 && Math.hypot(s.x - a.x, s.z - a.z) / v + 0.12 <= t;
    });
    return best;
  }
  function gather(i, dt, speed = 0.62) {
    if (b.state === 'held') return b.owner === i;
    if (b.state === 'shot' || b.state === 'net' || b.state === 'keeper') return false;
    const p = agents[i];
    const sp = Math.hypot(b.vx, b.vz);
    let tx, tz;
    // un ballon qui file : il coupe sa trajectoire (1.0.19 ; en lui courant après, il restait derrière, parfois 8 s) ;
    // presque arrêté : là où il sera dans un instant
    if (sp > 0.2 && b.y < 0.3) [tx, tz] = cutPoint(i, 2.5, speed);
    else {
      const ahead = Math.min(0.35, sp * 0.35);
      tx = b.x + (sp > 0.02 ? (b.vx / sp) * ahead : 0); tz = b.z + (sp > 0.02 ? (b.vz / sp) * ahead : 0);
    }
    const [fx, fz] = p.forward();
    p.steer(tx - fx * 0.04, tz - fz * 0.04, speed, dt, b.x, b.z);
    if (touching(i)) { give(i); return true; }
    return false;
  }
  // durée d'une passe vers (tx, tz) : celle du geste, ou davantage si le receveur a besoin de plus de temps pour y être
  function passTime(bt, tx, tz) {
    return Math.max(passTimeOf(bt.style, Math.hypot(tx - b.x, tz - b.z)), runTime(bt, tx, tz));
  }
  // la course du receveur jusqu'au point visé : un joueur arrêté met plus d'une seconde à prendre sa vitesse (ACCEL
  // 0,55 u/s²), sa course est comptée large ; l'attaquant qui attaque un centre de la finale sprinte (1.0.19)
  function runTime(bt, tx, tz) {
    const rc = agents[bt.to];
    const d = Math.hypot(tx - rc.x, tz - rc.z);
    if (H.finale && bt.style === 'cross' && teamOf(bt.to) === H.A) { // il attaque le centre à fond (accélération comprise)
      const ux = (tx - rc.x) / (d || 1), uz = (tz - rc.z) / (d || 1);
      const v0 = clamp(rc.vx * ux + rc.vz * uz, 0, SPRINT);
      const t1 = (SPRINT - v0) / ACCEL, d1 = v0 * t1 + 0.5 * ACCEL * t1 * t1;
      return (d <= d1 ? (-v0 + Math.sqrt(v0 * v0 + 2 * ACCEL * d)) / ACCEL : t1 + (d - d1) / SPRINT) + 0.12;
    }
    return d / 0.5 + (rc.speed < 0.2 ? 0.5 : 0.25);
  }
  // point visé d'un relais de la construction : le receveur vient au ballon, à quelques mètres de lui dans la direction de
  // sa place (il la rejoint ensuite balle au pied) ; ailleurs, le point donné par la finale
  const targetOf = (bt) => {
    if (bt.at !== 'plan') return at(...bt.at);
    const rc = agents[bt.to];
    const [pu, pv] = planAt(bt.to, H.t + 1.2);
    const [ru, rv] = uvOf(rc.x, rc.z);
    const [bu, bv] = uvOf(b.x, b.z);
    const toBall = Math.hypot(bu - ru, bv - rv) || 1;
    // un pas vers sa place, un pas vers le ballon : 2 à 4 m de course au plus
    const u = ru + clamp(pu - ru, -0.28, 0.28) + ((bu - ru) / toBall) * 0.1;
    const v = rv + clamp(pv - rv, -0.28, 0.28) + ((bv - rv) / toBall) * 0.1;
    return at(clamp(u, -4.6, 4.6), clamp(v, -3.2, 3.2));
  };
  // le contact du pied tombe pendant cette image (1.0.18) : le ballon part dans l'image même du contact du geste (une
  // image plus tard, le pied d'une frappe, lancé à plus de 10 m/s, avait déjà dépassé le ballon de 20 à 40 cm)
  const contactNow = (p, dt) => p.kick > 0 && p.kick + (dt * 0.5) / KICK_TIME >= KICK_CONTACT;
  function runBeats(dt) {
    const bt = H.beats[H.k];
    // les acteurs du geste en cours, recalculés à chaque image (1.0.19) : eux seuls échappent au placement collectif ;
    // celui qui vient de jouer finit son geste (hold) puis repart. La liste n'était jamais vidée : un joueur qui avait
    // passé le ballon restait planté là jusqu'à la fin du temps fort (le une-deux se jouait sans appel du buteur)
    H.busy.clear();
    for (const [i, until] of H.hold) { if (H.t < until) H.busy.add(i); else H.hold.delete(i); }
    if (!bt || H.revealed) return;
    blockStep(dt);
    H.bt += dt;
    if (b.state === 'free') { // ballon libre : le plus proche de l'équipe qui l'attend y va
      if (bt.t === 'carry' || (bt.t === 'shot' && !bt.launched)) nearestFor(bt.who);
      else if (bt.t === 'pass' && !bt.launched && !bt.head) nearestFor(bt.from);
      else if (bt.t === 'pass' && bt.launched && H.t > bt.t0 + bt.T + 0.15) nearestFor(bt.to);
    }
    if (bt.t === 'wait') { if (H.bt >= bt.dur) next(); return; }
    if (bt.t === 'carry') {
      H.busy.add(bt.who);
      if (!gather(bt.who, dt)) return; // il va d'abord au ballon
      const [tx, tz] = bt.to === 'plan' ? at(...planAt(bt.who, H.t + 0.8)) : at(...bt.to);
      agents[bt.who].steer(tx, tz, bt.speed, dt);
      if (Math.hypot(tx - agents[bt.who].x, tz - agents[bt.who].z) < 0.035 || H.bt > (bt.max ?? 3)) next();
      return;
    }
    if (bt.t === 'runup') { // élan vers le ballon arrêté (penalty, coup franc, corner) : il le prend au contact
      H.busy.add(bt.who);
      const p = agents[bt.who];
      const [gx, gz] = at(GOAL_X, 0);
      const toGoal = Math.atan2(gz - b.z, gx - b.x);
      // 1.0.18 : il se place pour que son pied de frappe tombe sur le ballon (le ballon arrêté, lui, ne bouge pas)
      const kind = H.beats[H.k + 1]?.t === 'shot' ? 'shot' : 'pass';
      const [ox, oz] = strikeSpot(bt.who, kind, toGoal, 0, 0);
      const tx = b.x - ox, tz = b.z - oz;
      p.steer(tx, tz, 0.36, dt, b.x, b.z);
      if ((Math.hypot(tx - p.x, tz - p.z) < 0.012 && p.facing(gx, gz) < 0.5) || H.bt > 2.4) { give(bt.who); next(); }
      return;
    }
    if (bt.t === 'steal') { // il chipe le ballon au porteur adverse : un tacle, le ballon file d'un pas, il le reprend
      H.busy.add(bt.who);
      const p = agents[bt.who];
      if (b.state === 'held' && b.owner !== bt.who) {
        p.steer(b.x, b.z, 0.68, dt, b.x, b.z);
        if (Math.hypot(b.x - p.x, b.z - p.z) < 0.06 || H.bt > 2.4) {
          const c = agents[b.owner];
          c.vx *= 0.2; c.vz *= 0.2;
          const [fx, fz] = at(GOAL_X, 0);
          const d = Math.hypot(fx - b.x, fz - b.z) || 1;
          Object.assign(b, { state: 'free', owner: -1, vx: ((fx - b.x) / d) * 0.3, vz: ((fz - b.z) / d) * 0.3, vy: 0 });
        }
        return;
      }
      if (gather(bt.who, dt, 0.55)) next();
      return;
    }
    if (bt.t === 'intercept') { // passe coupée (1.0.19) : l'adversaire passe, notre joueur coupe la trajectoire
      const p = agents[bt.from], by = agents[bt.by], d2 = agents[bt.to];
      if (!bt.launched) H.busy.add(bt.from); else H.busy.add(bt.to);
      H.busy.add(bt.by);
      if (!bt.P) { // le point de coupe : sur la ligne de la passe, au plus près de l'intercepteur
        const ax = d2.x - p.x, az = d2.z - p.z, L2 = ax * ax + az * az || 1;
        const f = clamp(((by.x - p.x) * ax + (by.z - p.z) * az) / L2, 0.3, 0.75);
        bt.P = [p.x + ax * f, p.z + az * f];
      }
      const [px, pz] = bt.P;
      if (!bt.launched) {
        by.steer(px, pz, 0.5, dt, b.x, b.z); // il lit la passe
        if (!gather(bt.from, dt)) return;
        p.steer(p.x, p.z, 0, dt, d2.x, d2.z);
        if (!p.kick && (p.facing(d2.x, d2.z) < 0.8 || H.bt > 0.4)) {
          p.kick = 0.001; p.kickKind = 'pass'; p.kickH = Math.atan2(d2.z - p.z, d2.x - p.x);
          armStrike(bt.from, 'pass', p.kickH);
        }
        if (contactNow(p, dt)) { // la passe part vers son coéquipier : elle arrive au point de coupe quand l'intercepteur y est
          const tBy = Math.hypot(px - by.x, pz - by.z) / 0.5 + 0.1;
          const T = Math.max(passTimeOf('ground', Math.hypot(px - b.x, pz - b.z)) * 0.75, tBy);
          launchBall(px, pz, T, { ground: true });
          bt.launched = true; bt.t0 = H.t; bt.T = T; b.state = 'pass';
          H.hold.set(bt.from, H.t + 0.45); // la fin de son geste, puis il suit l'action
        }
        return;
      }
      d2.steer(px, pz, 0.45, dt, b.x, b.z); // le receveur adverse vient au ballon, en retard
      // l'intercepteur tient le point de coupe, où le ballon arrive à l'heure (1.0.19 : il courait après le ballon et le
      // manquait de 2 m) ; passé ce moment, il coupe sa trajectoire. Il le prend au contact, ou en s'étirant (1,5 m)
      const leftI = bt.t0 + bt.T - H.t;
      if (leftI > -0.1) by.steer(px, pz, Math.min(SPRINT, Math.hypot(px - by.x, pz - by.z) / Math.max(0.08, leftI) + 0.05), dt, b.x, b.z);
      else { const [cx, cz] = cutPoint(bt.by); by.steer(cx, cz, SPRINT, dt, b.x, b.z); }
      if (touching(bt.by) || (b.y < 0.09 && Math.hypot(b.x - by.x, b.z - by.z) < REACH * 1.5)) { give(bt.by); next(); }
      return;
    }
    if (bt.t === 'tackle') { // tacle glissé (1.0.19) : notre joueur prend le ballon au porteur adverse, un coéquipier le récupère
      const a = agents[bt.who], v = agents[bt.victim], m = agents[bt.to];
      H.busy.add(bt.who); H.busy.add(bt.to);
      if (!bt.contact) H.busy.add(bt.victim);
      if (!bt.contact) {
        const gap = Math.hypot(a.x - v.x, a.z - v.z);
        if (!bt.slide && (gap < 0.2 || (H.bt > 1.2 && gap < 0.34))) { // à 2 m (3,4 m s'il tarde) il se jette, jambe tendue vers le ballon
          bt.slide = H.t + TACKLE_LEAD;
          bt.from = [a.x, a.z, H.t];
          Object.assign(a, { tackleId: H.id * 8 + 5, tackleLead: TACKLE_LEAD });
        }
        if (bt.slide) { // la glissade : un jaillissement, de sa place jusqu'au ballon, jambe tendue (90 cm) au contact
          const dx = b.x - bt.from[0], dz = b.z - bt.from[1], dd = Math.hypot(dx, dz) || 1;
          const tx = b.x - (dx / dd) * 0.085, tz = b.z - (dz / dd) * 0.085;
          const f = clamp((H.t - bt.from[2]) / Math.max(0.05, bt.slide - bt.from[2]), 0, 1);
          const e = 1 - (1 - f) * (1 - f);
          const nx = bt.from[0] + (tx - bt.from[0]) * e, nz = bt.from[1] + (tz - bt.from[1]) * e;
          a.vx = (nx - a.x) / Math.max(dt, 1e-4); a.vz = (nz - a.z) / Math.max(dt, 1e-4);
          a.x = nx; a.z = nz; a.speed = Math.hypot(a.vx, a.vz);
          a.h = Math.atan2(dz, dx);
        } else { // il fond sur le porteur sans ralentir à l'approche (il vise au-delà du ballon)
          const dd = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          a.steer(b.x + ((b.x - a.x) / dd) * 0.4, b.z + ((b.z - a.z) / dd) * 0.4, SPRINT, dt);
        }
        // le porteur file vers notre but ; repéré, il ralentit un peu à l'approche du tacle
        const [vu, vv] = uvOf(v.x, v.z);
        v.steer(...at(vu - 0.5, vv * 0.95), bt.slide ? 0.12 : 0.4, dt);
        { // le coéquipier suit l'action, en soutien un peu devant le tacleur (côté de notre attaque)
          const [au, av] = uvOf(a.x, a.z); const [mu, mv] = uvOf(m.x, m.z);
          m.steer(...at(au + 0.12, av + (Math.sign(mv - av) || 1) * 0.1), 0.38, dt, b.x, b.z);
        }
        if ((bt.slide && H.t >= bt.slide) || H.bt > 3.2) {
          bt.contact = H.t;
          // le ballon file vers le coéquipier qui suit (un tacle qui sert, pas une faute : le porteur reste debout)
          b.state = 'free'; b.owner = -1;
          const T = clamp(Math.hypot(m.x - b.x, m.z - b.z) / 0.8, 0.45, 1.3);
          launchBall(m.x, m.z, T, { ground: true });
          b.state = 'free';
          v.vx *= 0.3; v.vz *= 0.3;
          // le tacleur, au sol, se relève (fin du geste 3D) ; le porteur, déséquilibré, repart un instant plus tard
          a.vx = a.vz = 0; a.speed = 0;
          H.hold.set(bt.who, H.t + 1.15);
          H.hold.set(bt.victim, H.t + 0.45);
        }
        return;
      }
      if (gather(bt.to, dt, SPRINT)) next();
      return;
    }
    if (bt.t === 'pass') {
      const p = agents[bt.from];
      const rcv = agents[bt.to];
      if (!bt.launched) H.busy.add(bt.from); // (lancée, il finit son geste puis suit l'action : hold)
      H.busy.add(bt.to);
      const shot = H.beats[H.k + 1];
      const firstShot = shot && shot.t === 'shot' && shot.first && shot.who === bt.to;
      const firstPass = shot && shot.t === 'pass' && shot.first && shot.from === bt.to;
      const headed = (firstShot && shot.style === 'head') || (firstPass && shot.head);
      if (!bt.launched) {
        if (bt.head) { // déviation de la tête (défenseur) : le ballon arrive sur lui, il le repousse aussitôt
          if (!bt.target) { // (1.0.19 : vers là où le joueur qui suit peut la reprendre, pas un point fixe hors d'atteinte)
            const [au, av] = bt.at; const [ru, rv] = uvOf(rcv.x, rcv.z);
            bt.target = at(au + (ru - au) * 0.6, av + (rv - av) * 0.6);
          }
          const [tx, tz] = bt.target;
          const T = passTimeOf(bt.style, Math.hypot(tx - b.x, tz - b.z));
          launchBall(tx, tz, T, { y1: 0.04 });
          bt.launched = true; bt.T = T; bt.t0 = H.t; b.state = 'pass';
          H.hold.set(bt.from, H.t + 0.4);
          return;
        }
        if (!bt.target) bt.target = targetOf(bt);
        let [tx, tz] = bt.target;
        // le receveur se met en route vers le point visé
        const lead = passTime(bt, tx, tz) + ARMED;
        const [ttu, ttv] = uvOf(tx, tz);
        const [hx, hz] = ttu > H.line - 0.03 ? at(H.line - 0.03, ttv) : [tx, tz]; // en jeu jusqu'au départ du ballon
        rcv.steer(hx, hz, Math.min(SPRINT, Math.hypot(hx - rcv.x, hz - rcv.z) / Math.max(0.15, lead - 0.05) + 0.05), dt, b.x, b.z);
        if (!gather(bt.from, dt)) return; // le passeur doit d'abord avoir le ballon
        // il frappe en finissant de se tourner, quand son receveur est en jeu (il attend son appel, au plus 1,6 s)
        // pendant la construction, il attend que son partenaire arrive (au plus 1,5 s) : une passe ne roule jamais au pas en l'attendant (1.0.19)
        const ready = H.finale || Math.hypot(hx - rcv.x, hz - rcv.z) / 0.62 <= passTimeOf(bt.style, Math.hypot(tx - b.x, tz - b.z)) + 0.6 || H.bt > 1.5;
        if (!p.kick && ready && (p.facing(tx, tz) < 1.0 || H.bt > 0.35) && (onside(bt.to) || H.bt > 1.6)) {
          // remise (1.0.19) : au sol, vers le receveur encore loin ; un centre de la finale, au plus près de l'attaquant qui
          // l'attaque, sans sortir du cœur de la surface
          if (H.finale && (bt.style === 'ground' || (bt.style === 'cross' && teamOf(bt.to) === H.A))) {
            const q = layoff(bt, tx, tz, bt.style === 'cross' ? Math.min(4.15, uvOf(tx, tz)[0]) : -Infinity);
            if (q) { bt.target = q; [tx, tz] = q; }
          }
          p.kick = 0.001; p.kickKind = 'pass'; p.kickH = Math.atan2(tz - p.z, tx - p.x);
          armStrike(bt.from, 'pass', p.kickH); // 1.0.18 : le ballon là où le pied le touchera
        }
        p.steer(p.x, p.z, 0, dt, tx, tz);
        if (contactNow(p, dt)) {
          if (!onside(bt.to)) H.offside = (H.offside || 0) + 1; // mesure (banc) : jamais atteint
          const T = passTime(bt, tx, tz);
          // un partenaire encore loin : la passe part en l'air (une transversale prend son temps), jamais un ballon qui roule
          // au pas (1.0.19)
          const dd = Math.hypot(tx - b.x, tz - b.z);
          if (!H.finale && bt.style === 'ground' && dd > 1.4 && T > passTimeOf('ground', dd) * 1.5) bt.style = 'lob';
          // un centre part brossé (il s'enroule vers le but ou s'en éloigne), une transversale un peu ; au sol, droit
          const curl = bt.style === 'cross' ? (H.r() < 0.5 ? -1 : 1) * H.rr(0.25, 0.55) : bt.style === 'lob' ? H.rr(-0.2, 0.2) : 0;
          launchBall(tx, tz, T, { ground: bt.style === 'ground' || bt.style === 'through', y1: bt.y1 || 0, curl });
          bt.launched = true; bt.T = T; bt.t0 = H.t; b.state = 'pass';
          H.hold.set(bt.from, H.t + 0.45);
        }
        return;
      }
      const [tx, tz] = bt.target;
      const left = bt.t0 + bt.T - H.t;
      // le receveur court au point visé, sur la trajectoire même du ballon, et l'y attend face à lui ; manqué, la poursuite
      // plus bas le déplace (un seul pas par image)
      if (left > -0.15) {
        // à l'approche du ballon, il se met sur sa ligne (le point de sa course le plus proche de lui) : il le prend
        // au lieu de le regarder passer à un pas
        let gx = tx, gz = tz, tl = left;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0.05 && (bt.style === 'ground' || bt.style === 'through') && !firstShot && !headed && b.y < 0.05) { // passe au sol
          const ux = b.vx / sp, uz = b.vz / sp;
          const ahead = (rcv.x - b.x) * ux + (rcv.z - b.z) * uz;
          const px = b.x + ux * ahead, pz = b.z + uz * ahead;
          // seulement s'il est déjà presque sur sa ligne (moins de 2 m) : sinon il suit le plan de la passe
          if (ahead > 0 && ahead / sp < 1.1 && Math.hypot(px - rcv.x, pz - rcv.z) < 0.2) { gx = px; gz = pz; tl = Math.min(left, ahead / sp); }
        }
        // reprise du pied (1.0.18) : il se place pour que son pied de frappe, tourné vers le but, soit là où arrive le
        // ballon (et non son corps : il frappait à côté)
        if (firstShot && !headed) {
          const [ggx, ggz] = at(GOAL_X, 0);
          const [ox, oz] = strikeSpot(bt.to, 'shot', Math.atan2(ggz - tz, ggx - tx), 0, 0);
          gx = tx - ox; gz = tz - oz;
        }
        const dd = Math.hypot(gx - rcv.x, gz - rcv.z);
        if (headed && left > 0 && dd > 1e-4) { // (1.0.19) il attaque le centre : à fond, puis à l'allure qui l'amène au point à l'heure, sans freiner devant
          const ux = (gx - rcv.x) / dd, uz = (gz - rcv.z) / dd;
          rcv.steer(gx + ux * 0.3, gz + uz * 0.3, dd > 0.3 ? SPRINT : clamp(dd / Math.max(0.08, tl) + 0.03, 0.1, SPRINT), dt, b.x, b.z);
        } else rcv.steer(gx, gz, left > 0 ? Math.min(SPRINT, dd / Math.max(0.08, tl) + 0.02) : 0.4, dt, b.x, b.z);
      }
      // reprise du pied (1.0.19) : l'élan part quand le ballon, sur sa vraie trajectoire (simulée), arrivera sur le pied de
      // frappe à l'instant du contact, et non plus à l'heure prévue de la passe : un ballon en retard faisait frapper dans
      // le vide, un ballon en avance partait du corps, sans geste (les deux tiers des reprises au banc). Pendant l'élan, le
      // ballon est amené au point exact du contact (quelques centimètres) ; trop tard pour armer, il contrôle puis frappe
      const footFirst = firstShot && !headed;
      let strikeComing = false;
      if (footFirst && !rcv.kick && !bt.late && b.y < 0.15) {
        const [ggx, ggz] = at(GOAL_X, 0);
        const hk = Math.atan2(ggz - rcv.z, ggx - rcv.x);
        const m = meetBall(bt.to, hk, ARMED + 0.04);
        if (m.d < 0.07 && m.y < (shot.style === 'volley' ? 0.08 : 0.03)) {
          if (m.t < ARMED - 0.1) bt.late = true;
          else if (m.t <= ARMED + dt * 0.5) { rcv.kick = 0.001; rcv.kickKind = 'shot'; rcv.kickH = hk; armBlock(bt.to, shot.style, m.sx, m.sz); } else strikeComing = true;
        }
      }
      const swinging = footFirst && rcv.kick > 0 && rcv.kick < 0.8;
      if (footFirst && rcv.kick > 0 && rcv.kick < KICK_CONTACT && b.y < 0.15) { // le ballon amené au pied, en douceur
        const rem = (KICK_CONTACT - rcv.kick) * KICK_TIME;
        if (rem > dt * 0.6) {
          const m = meetBall(bt.to, rcv.kickH, rem, true);
          const ex = m.sx - m.x, ez = m.sz - m.z;
          if (Math.hypot(ex, ez) < 0.1) { const f = Math.min(1, dt / rem); b.x += ex * f; b.z += ez * f; }
        }
      }
      // la reprise part au contact du pied : le ballon est sous son pied (le reste de l'écart, une image au plus)
      if (footFirst && contactNow(rcv, dt) && rcv.kick < 0.8 && b.y < 0.12) {
        const [sx, sz] = strikeSpot(bt.to, 'shot', rcv.kickH ?? rcv.h);
        if (Math.hypot(b.x - sx, b.z - sz) < 0.12) {
          b.x = sx; b.z = sz;
          next(); shot.launched = true; shoot(bt.to, shot.style); H.busy.add(bt.to); return;
        }
      }
      if (headed) {
        const jt = 0.32;
        rcv.lift = left < jt && left > -jt ? 0.07 * Math.max(0, 1 - (left / jt) ** 2) : rcv.lift * 0.8;
        rcv.jumpAt = H.t; // saut entretenu à cet instant (sinon il retombe)
      }
      const headNow = headed && b.y > 0.1;
      // le receveur visé s'étire pour contrôler la passe qui lui est destinée (1,5 m) ; le ballon vient ensuite à son pied
      // en douceur (ballUpdate), jamais d'un bond. Une reprise ne part jamais du corps (1.0.19) : la tête la reprend au
      // contact du front ; sinon il contrôle, et la frappe suit (geste suivant, élan et contact du pied)
      const waitStrike = swinging || strikeComing;
      const stretch = !headNow && !waitStrike && b.y < 0.09 && Math.hypot(b.x - rcv.x, b.z - rcv.z) < REACH * 1.5;
      if (!waitStrike && (touching(bt.to, headNow) || stretch)) {
        if (firstShot && headNow) { next(); shot.launched = true; shoot(bt.to, 'head'); H.busy.add(bt.to); return; }
        if (firstPass) { next(); return; } // la déviation part tout de suite (geste suivant)
        if (firstShot && shot.style === 'head') shot.style = 'foot'; // centre trop bas pour la tête : contrôle, frappe du pied
        give(bt.to);
        next();
        return;
      }
      if (left < -0.15 && !waitStrike) { // manqué : il va chercher le ballon (qui roule, ou retombe) et le prend au contact
        if (firstPass && left < -0.4) { next(); return; } // la déviation se fait sans lui : le ballon est repoussé là où il est
        if (gather(bt.to, dt, SPRINT)) {
          if (firstShot && shot.style === 'head') shot.style = 'foot';
          next();
        }
      }
      return;
    }
    if (bt.t === 'shot') {
      H.busy.add(bt.who);
      const p = agents[bt.who];
      if (bt.launched) return;
      if (!gather(bt.who, dt)) return;
      const [gx, gz] = at(GOAL_X, 0);
      p.steer(p.x, p.z, 0, dt, gx, gz);
      // 1.0.18 : il arme sa frappe une fois tourné vers le but (au plus 0,3 s) ; le ballon va là où son pied le touchera.
      // 1.0.20 : une frappe qui finira à côté, un défenseur qui vient fermer l'angle : il prend le temps d'une touche (au
      // plus 0,8 s), le défenseur arrive sur la trajectoire et contre la frappe
      let closing = false;
      if (H.outcome === 'w' && H.laneWho >= 0 && H.bt < 0.8 && !b.fixed) {
        const L = Math.hypot(gx - p.x, gz - p.z) || 1, d = agents[H.laneWho];
        closing = Math.hypot(d.x - (p.x + ((gx - p.x) / L) * 0.25), d.z - (p.z + ((gz - p.z) / L) * 0.25)) > 0.12;
      }
      if (!p.kick && !closing && (p.facing(gx, gz) < 0.6 || H.bt > 0.3 || b.fixed)) {
        p.kick = 0.001; p.kickKind = 'shot'; p.kickH = Math.atan2(gz - p.z, gx - p.x);
        armStrike(bt.who, 'shot', p.kickH);
        armBlock(bt.who, bt.style, b.strike ? b.strike.x1 : b.x, b.strike ? b.strike.z1 : b.z);
      }
      if (contactNow(p, dt)) { bt.launched = true; shoot(bt.who, bt.style); }
      return;
    }
    if (bt.t === 'foul') { // le fautif fauche le porteur : arrêt de jeu, carton rouge, il sort
      H.busy.add(bt.who);
      H.busy.add(bt.victim);
      const off = agents[bt.who];
      const vic = agents[bt.victim];
      if (!bt.contact) {
        // la faute au contact (0.8.24, audit de la charte : le carton tombait à distance) : le porteur, gêné, ralentit et
        // le fautif le rattrape ; le tacle glissé part quand il est à deux mètres (geste 3D, contact calé dessus)
        // pendant la glissade, il règle sa vitesse pour arriver à portée de jambe (90 cm) au contact ; le porteur, rattrapé,
        // ne s'échappe plus
        const gap0 = Math.hypot(off.x - vic.x, off.z - vic.z);
        if (bt.tackle) { // (il vise au-delà du porteur : sans ralentir à l'approche, à la vitesse qui le rattrape)
          const want = clamp(vic.speed + (gap0 - 0.09) / Math.max(0.05, bt.tackle - H.t), 0, 1.2);
          const k = 0.6 / Math.max(1e-6, gap0);
          off.steer(vic.x + (vic.x - off.x) * k, vic.z + (vic.z - off.z) * k, want, dt);
        } else off.steer(vic.x, vic.z, 0.8, dt);
        vic.steer(...at(FOUL_U, uvOf(vic.x, vic.z)[1] * 0.8), bt.tackle ? 0.08 : H.bt > 1.2 ? 0.15 : 0.6, dt);
        const gap = Math.hypot(off.x - vic.x, off.z - vic.z);
        // à 1,6 m, il se jette : la jambe tendue (90 cm devant le bassin) fauche le porteur 0,55 s plus tard, et c'est ce
        // contact qui fait la faute
        if (!bt.tackle && gap < 0.16) {
          bt.tackle = H.t + TACKLE_LEAD;
          Object.assign(off, { tackleId: H.id * 8 + 7, tackleLead: TACKLE_LEAD });
        }
        if ((bt.tackle && H.t >= bt.tackle) || gap < 0.05 || H.bt > 4) {
          bt.contact = H.t;
          H.foulAt = H.t;
          vic.roll = (Math.random() < 0.5 ? -1 : 1) * 1.35; // le porteur s'écroule (3D : il trébuche sur le tacle et reste au sol)
          if (!bt.tackle) { bt.tackle = H.t; Object.assign(off, { tackleId: H.id * 8 + 7, tackleLead: 0 }); }
          vic.vx *= 0.3; vic.vz *= 0.3;
          deadBall(b.x, b.z);
        }
        return;
      }
      vic.vx *= 0.9; vic.vz *= 0.9;
      if (H.t - bt.contact > 0.7) { // l'arbitre brandit le carton : l'expulsion s'affiche
        card.material = cardMats.red;
        H.cardOf = bt.who;
        reveal();
      }
    }
  }

  // Personne ne traverse personne (1.0.20, demande du PDG : « des joueurs qui se traversent ») : deux joueurs à moins de
  // 55 cm l'un de l'autre (corps contre corps) s'écartent, chacun de la moitié du chevauchement. Ne bougent pas : celui qui
  // frappe (son pied va au ballon), le gardien pendant un arrêt, ceux qui finissent un geste (tacle, relevé) ; les duels
  // voulus (tacle, faute, ballon chipé) se jouent au contact
  const BODY = 0.055;
  function separate() {
    const bt = H.beats[H.k];
    const duel = new Set();
    if (bt && ((bt.t === 'tackle' && !bt.contact) || bt.t === 'foul')) { duel.add(bt.who); duel.add(bt.victim); } // (après le tacle, le porteur contourne le tacleur au sol)
    if (bt?.t === 'steal') { duel.add(bt.who); if (b.owner >= 0) duel.add(b.owner); }
    if (H.outcome === 'red' && H.foulAt !== undefined) { duel.add(H.offender); duel.add(H.victim); }
    const fixed = (i) => agents[i].kick > 0 || H.hold.has(i) || (slotOf(i) === 0 && !!H.shot) || (H.block?.who === i && !H.block.done);
    for (let i = 0; i < N; i++) {
      if (!active(i) || duel.has(i)) continue;
      const a = agents[i];
      for (let j = i + 1; j < N; j++) {
        if (!active(j) || duel.has(j)) continue;
        const c = agents[j];
        const dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 >= BODY * BODY) continue;
        const fi = fixed(i), fj = fixed(j);
        if (fi && fj) continue;
        const d = Math.sqrt(d2);
        // (exactement superposés : écartés de côté, selon leurs numéros)
        const ux = d > 1e-5 ? dx / d : Math.cos(i * 2.4), uz = d > 1e-5 ? dz / d : Math.sin(i * 2.4);
        const o = BODY - d;
        const wi = fi ? 0 : fj ? 1 : 0.5, wj = 1 - wi;
        a.x -= ux * o * wi; a.z -= uz * o * wi;
        c.x += ux * o * wj; c.z += uz * o * wj;
      }
    }
  }

  // Les autres joueurs : appels de balle, bloc défensif qui coulisse, pressing, marquage dans la surface, gardiens.
  function offBall(dt) {
    const { A, D } = H;
    const [bu, bv] = uvOf(b.x, b.z);
    const carrier = b.state === 'held' ? b.owner : -1;
    // retournement (1.0.19) : tant que l'adversaire a le ballon, les rôles s'inversent. Ses joueurs soutiennent le porteur
    // et montent ; les nôtres se resserrent entre le ballon et leur but, et le plus proche presse le porteur
    if (H.turn && H.poss === D && !H.finale) {
      let presser = -1, pd = Infinity;
      if (carrier >= 0) for (const i of teamIdx(A)) {
        if (!active(i) || slotOf(i) === 0 || H.busy.has(i)) continue;
        const d = Math.hypot(agents[i].x - agents[carrier].x, agents[i].z - agents[carrier].z);
        if (d < pd) { pd = d; presser = i; }
      }
      for (let i = 0; i < N; i++) {
        if (!active(i) || H.busy.has(i)) continue;
        if (slotOf(i) === 0) { keeperStep(i, dt, bu, bv); continue; }
        const [hu, hv] = planAt(i, H.t);
        const k = slotOf(i), w = H.t * (0.6 + k * 0.05) + k * 2.1;
        if (teamOf(i) === D) { steerUV(i, hu - 0.2 + Math.sin(w) * 0.08, hv + Math.cos(w * 0.8) * 0.1, 0.36, dt, [b.x, b.z]); continue; }
        if (i === presser) { const c = agents[carrier]; const [cu, cv] = uvOf(c.x, c.z); steerUV(i, cu - 0.13, cv * 0.95, 0.55, dt, [c.x, c.z]); continue; }
        // défenseurs et milieux se placent entre le ballon et leur but ; les attaquants (et le buteur) pressent haut
        const high = roleOf(i) === 'A' || i === H.shooter;
        steerUV(i, high ? hu : Math.min(hu, bu - 0.25), hv + (bv - hv) * 0.25 + Math.sin(w) * 0.04, 0.42, dt, [b.x, b.z]);
      }
      return;
    }
    // le défenseur le plus proche du porteur presse
    let presser = -1;
    if (carrier >= 0 && teamOf(carrier) === A) {
      let bd = Infinity;
      for (const i of teamIdx(D)) {
        if (!active(i) || slotOf(i) === 0 || H.busy.has(i) || H.wall?.has(i)) continue;
        const d = Math.hypot(agents[i].x - agents[carrier].x, agents[i].z - agents[carrier].z);
        if (d < bd) { bd = d; presser = i; }
      }
    }
    const setPiece = H.cam === 'set' && H.k < H.beats.findIndex((x) => x.t === 'shot' || x.t === 'pass');
    // soutien du porteur (ses deux coéquipiers libres les plus proches) ; le défenseur le plus proche d'un ballon libre
    const support = [];
    if (carrier >= 0 && teamOf(carrier) === A && !setPiece) {
      const near = teamIdx(A).filter((i) => i !== carrier && active(i) && slotOf(i) > 0 && !H.busy.has(i) && !(H.finale && H.runs.has(i)))
        .map((i) => [i, Math.hypot(agents[i].x - agents[carrier].x, agents[i].z - agents[carrier].z)]).sort((x, y) => x[1] - y[1]);
      for (const [i, d] of near.slice(0, 2)) if (d < 2.2) support.push(i);
    }
    // l'attaquant le plus avancé (hors porteur) : la défense reste derrière lui
    let deepest = -Infinity;
    for (const i of teamIdx(A)) {
      if (!active(i) || slotOf(i) === 0 || i === carrier) continue;
      deepest = Math.max(deepest, uvOf(agents[i].x, agents[i].z)[0]);
    }
    let chaser = -1;
    if (b.state === 'free') {
      let bd = Infinity;
      for (const i of teamIdx(D)) {
        if (!active(i) || slotOf(i) === 0 || H.busy.has(i) || H.wall?.has(i)) continue;
        const d = Math.hypot(agents[i].x - b.x, agents[i].z - b.z);
        if (d < bd) { bd = d; chaser = i; }
      }
      if (bd > 1.2) chaser = -1; // trop loin : il garde sa place
    }
    // passe en profondeur, face-à-face (0.8.20, remarque du PDG : la défense restait inerte) : les deux défenseurs les
    // plus proches du point visé, puis du porteur, se retournent et courent vers leur but, battus de peu (l'issue est
    // celle du moteur : ils ne le rattrapent pas)
    const chase = new Set();
    let chaseTo = null;
    const cur = H.beats[H.k];
    // une frappe qui finira à côté (1.0.20) : quand le buteur a le ballon, le défenseur le plus proche de son angle de
    // frappe (2,5 m devant lui, vers le but) vient le fermer ; quatre fois sur cinq, s'il peut y être (moins de 14 m) :
    // la frappe le trouvera (tir contré)
    let lane = null;
    // (dès que la passe part vers lui : le défenseur lit l'action)
    const toShooter = cur?.t === 'pass' && cur.to === H.shooter && cur.launched && cur.target;
    if (H.outcome === 'w' && H.finale && !H.shot && !H.pen && (carrier === H.shooter || toShooter) && H.kind !== 'freekick') {
      const [cx, cz] = carrier === H.shooter ? [agents[carrier].x, agents[carrier].z] : cur.target;
      const [gx, gz] = at(GOAL_X, 0);
      const L = Math.hypot(gx - cx, gz - cz) || 1;
      const ux = (gx - cx) / L, uz = (gz - cz) / L;
      lane = [cx + ux * 0.25, cz + uz * 0.25];
      if (H.laneRoll === undefined) H.laneRoll = H.r() < 0.8;
      if (H.laneRoll && !(H.laneWho >= 0)) { // un défenseur devant le tireur (jamais celui qu'il vient d'éliminer), à moins de 14 m de l'angle
        let bd = 1.4;
        for (const i of teamIdx(D)) {
          if (!active(i) || slotOf(i) === 0 || H.busy.has(i) || i === H.lunge) continue;
          if ((agents[i].x - cx) * ux + (agents[i].z - cz) * uz < 0.15) continue;
          const d = Math.hypot(agents[i].x - lane[0], agents[i].z - lane[1]);
          if (d < bd) { bd = d; H.laneWho = i; }
        }
      }
    }
    // l'action d'un carton rouge : seul le fautif va au contact du porteur, avant la faute comme après
    const foulOn = H.outcome === 'red' && H.victim !== undefined;
    if (foulOn) presser = -1;
    if (H.oneOnOne && !H.shot) {
      if (cur?.t === 'pass' && cur.style === 'through' && cur.launched && cur.target) chaseTo = cur.target;
      else if (b.state === 'held' && b.owner === H.shooter) chaseTo = [agents[H.shooter].x, agents[H.shooter].z];
    }
    if (chaseTo) {
      teamIdx(D).filter((i) => active(i) && slotOf(i) > 0 && !H.busy.has(i) && !H.wall?.has(i))
        .map((i) => [i, Math.hypot(agents[i].x - chaseTo[0], agents[i].z - chaseTo[1])])
        .sort((x, y) => x[1] - y[1]).slice(0, 2).forEach(([i]) => chase.add(i));
    }
    for (let i = 0; i < N; i++) {
      if (!active(i) || H.busy.has(i)) continue;
      const a = agents[i];
      const t = teamOf(i);
      if (slotOf(i) === 0) { keeperStep(i, dt, bu, bv); continue; }
      const [hu0, hv] = H.home.get(i) || uvOf(a.x, a.z);
      const hu = hu0 - lagAt(i, H.t); // construction : la place de finale, reculée au début
      if (setPiece || H.wall?.has(i) || H.pen) { // coup de pied arrêté : chacun tient sa place, face au ballon
        // sur un corner, ça bouge dans la surface : appels, feintes, marquage serré, en attendant le centre
        const box = H.kind === 'corner' && !H.wall?.has(i) && hu > BOX - 0.5;
        const k = slotOf(i), w = H.t * (1.1 + k * 0.08) + k * 2.1 + t * 1.3;
        steerUV(i, hu + (box ? Math.sin(w) * 0.07 : 0), hv + (box ? Math.cos(w * 0.9) * 0.09 : 0), box ? 0.26 : 0.12, dt, [b.x, b.z]);
        continue;
      }
      if (t === A) {
        const line = H.line - 0.03; // jamais au-delà de l'avant-dernier adversaire : il serait hors jeu
        const run = H.finale ? H.runs.get(i) : null; // les appels dans la surface : pour la finale
        if (run) { steerUV(i, Math.min(run[0], line), run[1], 0.55, dt, [b.x, b.z]); continue; }
        // soutien : les deux plus proches du porteur lui offrent une solution, l'un en appui un peu en retrait, l'autre
        // en diagonale vers le but, à 10-14 m
        const sup = support.indexOf(i);
        if (sup >= 0) {
          const [cu, cv] = uvOf(agents[carrier].x, agents[carrier].z);
          const side = Math.sign(hv - cv) || (sup ? 1 : -1);
          steerUV(i, Math.min(clamp(cu + (sup ? 0.95 : -0.7), -1.6, 4.4), line), clamp(cv + side * (sup ? 1.05 : 0.85), -3.1, 3.1), 0.42, dt, [b.x, b.z]);
          continue;
        }
        // jamais immobile : chacun se démarque à son rythme (appels courts, décrochages) autour de sa place
        const k = slotOf(i), w = H.t * (0.55 + k * 0.06) + k * 1.9;
        const tu = clamp(hu + clamp(bu - 2.6, -1.2, 1.2) * 0.4 + Math.sin(w) * 0.22, -1.6, 4.3);
        // en retard sur sa place (après un retournement, une relance) : il court au lieu de trottiner (1.0.19)
        const [cu0, cv0] = uvOf(agents[i].x, agents[i].z);
        const lag = Math.hypot(Math.min(tu, line) - cu0, hv - cv0);
        steerUV(i, Math.min(tu, line), hv + (bv - hv) * 0.08 + Math.cos(w * 0.8) * 0.18, clamp(0.3 + (lag - 0.25) * 0.35, 0.3, 0.62), dt, [b.x, b.z]);
        continue;
      }
      if (lane && i === H.laneWho) { // il ferme l'angle, face au tireur
        agents[i].steer(lane[0], lane[1], SPRINT * 0.9, dt, b.x, b.z);
        continue;
      }
      if (chase.has(i)) { // course de repli, côté but du point visé ou du porteur
        const [cu, cv] = uvOf(chaseTo[0], chaseTo[1]);
        steerUV(i, Math.min(GOAL_X - 0.15, cu + 0.18), cv * 0.9, 0.6, dt, [b.x, b.z]);
        continue;
      }
      if (i === chaser) { // ballon libre : le défenseur le plus proche va le disputer
        steerUV(i, bu, bv, 0.55, dt, [b.x, b.z]);
        continue;
      }
      if (i === presser) { // pressing : il se place entre le porteur et le but
        const c = agents[carrier];
        const [cu, cv] = uvOf(c.x, c.z);
        steerUV(i, cu + 0.12, cv * 0.92, i === H.lunge ? 0.5 : 0.42, dt, [c.x, c.z]);
        continue;
      }
      // marquage dans la surface : côté but de l'attaquant le plus proche ; sinon le bloc recule et coulisse
      let mark = null, md = 0.7;
      if (hu > BOX - 0.4) {
        for (const j of teamIdx(A)) {
          if (!active(j) || slotOf(j) === 0 || (H.outcome === 'red' && j === H.victim)) continue; // le porteur fauché n'est plus marqué
          const [ju, jv] = uvOf(agents[j].x, agents[j].z);
          const d = Math.hypot(ju - hu, jv - hv);
          if (ju > BOX - 0.6 && d < md) { md = d; mark = [ju, jv]; }
        }
      }
      // la défense ne laisse personne partir dans son dos : chacun reste plus près de son but que l'attaquant le plus avancé
      // (c'est elle qui recule, l'attaquant reste en jeu) ; en attendant, de petits pas d'ajustement, jamais planté
      // seule la ligne défensive (0.8.20, remarque du PDG : toute l'équipe s'alignait en retrait) : le milieu tient sa
      // ligne une dizaine de mètres devant, l'attaque plus haut encore
      const role = roleOf(i);
      const goalSide = Math.min(GOAL_X - 0.22, deepest + 0.06) - (role === 'D' ? 0 : role === 'M' ? 0.95 : 2.1);
      const k = slotOf(i), w = H.t * (0.7 + k * 0.05) + k * 2.3;
      if (mark) steerUV(i, Math.max(Math.min(GOAL_X - 0.2, mark[0] + 0.1), goalSide), mark[1] * 0.9, 0.5, dt, [b.x, b.z]);
      else {
        const tu = Math.max(clamp(hu + clamp(bu - 3.2, -1.5, 0.6) * 0.5, 0.3, GOAL_X - 0.3), goalSide);
        const [cu] = uvOf(agents[i].x, agents[i].z);
        const late = tu - cu > 0.15; // en retard sur sa ligne : il recule vite
        steerUV(i, tu + Math.sin(w) * 0.05, hv + (bv - hv) * 0.22 + Math.cos(w * 0.9) * 0.06, late ? 0.62 : H.oneOnOne ? 0.6 : 0.34, dt, [b.x, b.z]);
      }
    }
    if (foulOn) { // les autres défenseurs restent à 1,5 m au moins du porteur (on doit voir qui le fauche)
      const v = agents[H.victim];
      for (const i of teamIdx(D)) {
        if (i === H.offender || !active(i) || slotOf(i) === 0) continue;
        const a = agents[i]; const dx = a.x - v.x, dz = a.z - v.z; const d = Math.hypot(dx, dz);
        if (d < 0.15 && d > 1e-6) { a.x = v.x + (dx / d) * 0.15; a.z = v.z + (dz / d) * 0.15; }
      }
    }
  }
  // Gardiens : celui qui défend suit le ballon sur sa ligne (sort sur un face-à-face) et plonge sur la frappe ;
  // l'autre reste dans sa moitié.
  function keeperStep(i, dt, bu, bv) {
    const a = agents[i];
    if (teamOf(i) === H.A) { // le gardien de l'équipe qui attaque suit le jeu, en libéro, sans quitter sa surface
      a.poseWant = 0;
      steerUV(i, -4.6 + clamp((bu + 1) * 0.12, 0, 0.7), clamp(bv * 0.12, -0.4, 0.4), 0.14, dt, [b.x, b.z, true]);
      return;
    }
    // la détente de l'arrêt (1.0.18) : du départ du plongeon au contact, il va au point où ses mains rencontrent le ballon
    // (départ vif, arrivée posée), puis y reste ; le geste 3D fait le reste
    const dv0 = H.dive;
    if (dv0?.root && H.t >= dv0.at) {
      if (!dv0.start) dv0.start = [a.x, a.z, H.t];
      const span = Math.max(0.05, dv0.tc - dv0.start[2]);
      const f = clamp((H.t - dv0.start[2]) / span, 0, 1);
      const e = 1 - (1 - f) * (1 - f);
      const nx = dv0.start[0] + (dv0.root[0] - dv0.start[0]) * e, nz = dv0.start[1] + (dv0.root[1] - dv0.start[1]) * e;
      a.vx = (nx - a.x) / Math.max(dt, 1e-4); a.vz = (nz - a.z) / Math.max(dt, 1e-4);
      a.x = nx; a.z = nz; a.speed = Math.hypot(a.vx, a.vz);
      a.poseWant = b.state === 'keeper' ? 3 : 2;
      return;
    }
    // sur la ligne qui joint le ballon au centre du but, d'autant plus avancé que le ballon est loin (jusqu'à 3 m)
    const dist = Math.max(0.3, GOAL_X - bu);
    const depth = clamp(0.06 + dist * 0.05, 0.08, 0.3);
    let u = GOAL_X - depth, v = clamp((bv * depth) / dist, -0.3, 0.3);
    // position d'attente : appuis fléchis, bras ouverts, quand une frappe se prépare (porteur dans les 25 m, penalty)
    const bt = H.beats[H.k];
    const threat = !H.shot && (H.pen || bt?.t === 'shot' || (b.state === 'held' && teamOf(b.owner) === H.A && bu > BOX - 0.9));
    a.poseWant = b.state === 'keeper' ? 3 : H.dive && H.t >= H.dive.at - 0.05 ? 2 : threat ? 1 : 0;
    if (H.oneOnOne && bu > BOX - 0.3 && !H.shot) { u = GOAL_X - 0.38; v = clamp(bv * 0.4, -0.3, 0.3); } // il sort au-devant
    if (H.pen && !H.shot) { u = GOAL_X - 0.02; v = 0; }
    if (threat && a.speed > 0.05) u = Math.min(u, uvOf(a.x, a.z)[0] + 0.02); // il s'arrête, prêt, au lieu de reculer
    if (H.dive) {
      const dv = H.dive;
      if (H.t < dv.at) v = dv.from + (dv.v - dv.from) * 0.25; // pas chassés
      else if (!dv.done) { dv.done = true; a.leanTo = clamp((dv.v - dv.from) / 0.12, -1, 1) * (dv.catch ? 1 : 0.95); a.leanHold = 0.9; }
      if (H.t >= dv.at) { v = dv.v * 0.55; u = KEEP_U; }
    }
    // toujours face au ballon (0.8.24, remarque du PDG : des gardiens regardaient leur but en reculant)
    steerUV(i, u, v, H.dive && H.t >= H.dive.at ? 0.5 : 0.3, dt, H.shot ? [b.x - b.vx * 0.6, b.z - b.vz * 0.6, true] : [b.x, b.z, true]);
  }

  // Après l'instant décisif : la joie du buteur (ses coéquipiers l'entourent), le gardien qui garde le ballon, le
  // fautif qui sort ; puis le ralenti d'un but.
  function reactStep(dt) {
    H.react += dt;
    const { A, outcome } = H;
    if (outcome === 'g') {
      const sc = agents[H.shooter];
      if (!H.cel) {
        const [, sv] = uvOf(sc.x, sc.z);
        const fu = 4.95, fv = (sv >= 0 ? 1 : -1) * 3.05;
        const [cu, cv] = uvOf(sc.x, sc.z);
        const d = Math.hypot(fu - cu, fv - cv);
        const k = d > 1.6 ? 1.6 / d : 1;
        H.cel = { to: [cu + (fu - cu) * k, cv + (fv - cv) * k], fans: [fu * 1.15, fv * 1.25] };
      }
      const [cx, cz] = at(...H.cel.to);
      for (let i = 0; i < N; i++) {
        if (!active(i)) continue;
        const a = agents[i];
        if (i === H.shooter) a.steer(cx, cz, 0.7, dt, ...at(...H.cel.fans));
        else if (teamOf(i) === A && slotOf(i) !== 0) {
          const ang = slotOf(i) * 2.4, r = 0.075 + (slotOf(i) % 3) * 0.03;
          a.steer(sc.x + Math.cos(ang) * r, sc.z + Math.sin(ang) * r, 0.62, dt, sc.x, sc.z);
        } else a.steer(a.x, a.z, 0, dt);
      }
    } else if (outcome === 'red') {
      const off = agents[H.offender];
      // le fautif se relève de son tacle (2,6 s) avant de quitter la pelouse
      const v = agents[H.victim];
      if (H.t - (H.foulAt ?? H.t) > 2.6) off.steer(off.x, Math.sign(off.z || 1) * 3.75, 0.16, dt);
      // relevé de son tacle, il se tient à côté du joueur à terre, jamais entre lui et la caméra (audit, 0.8.24)
      else if (H.t - (H.foulAt ?? H.t) > 1.3 && off.z > v.z - 0.02 && Math.abs(off.x - v.x) < 0.12) off.steer(v.x + (Math.sign(off.x - v.x) || 1) * 0.15, off.z, 0.12, dt, v.x, v.z);
      else off.steer(off.x, off.z, 0, dt, v.x, v.z);
      for (let i = 0; i < N; i++) {
        if (!active(i) || i === H.offender || i === H.victim) continue;
        const a = agents[i]; const [x, z] = clearOfVictim(i, a.x, a.z); // trop près du joueur à terre : il s'écarte
        a.steer(x, z, x === a.x && z === a.z ? 0 : 0.42, dt, off.x, off.z);
      }
    } else {
      for (let i = 0; i < N; i++) if (active(i)) agents[i].steer(agents[i].x, agents[i].z, 0, dt, b.x, b.z);
    }
    const hold = outcome === 'g' ? 2.9 : outcome === 'red' ? 2.6 : 1.5;
    if (H.react > hold / H.speed) {
      if (outcome === 'g' && H.spec.replay && H.rec.length > 8) startReplay();
      else finish();
    }
  }
  function finish() {
    H.phase = 'end';
    matchFeed.hlDone = H.id;
    matchFeed.hlPhase = '';
  }

  // --- Ralenti : l'action rejouée depuis son enregistrement ----------------------------------------------------------
  const REC = 17; // par joueur : x, z, cap, foulée, allure, frappe, plongeon, joie, saut, chute, pose, tir (joueurs 3D), arrêt (côté, hauteur, avance, issue, numéro)
  function record() {
    const a = new Float32Array(N * REC);
    for (let i = 0; i < N; i++) {
      const g = agents[i];
      a.set([g.x, g.z, g.h, g.phase, g.gait, g.kick, g.lean, g.cheer, g.lift, g.roll, g.pose || 0, g.kickKind === 'shot' ? 1 : 0, g.saveSide || 0, g.saveH || 0, g.saveLead || 0, g.saveKind || 0, g.saveId || 0], i * REC);
    }
    H.rec.push({ t: H.t, a, b: [b.x, b.y, b.z], q: ballMesh.quaternion.toArray() });
  }
  function startReplay() {
    H.phase = 'replay';
    players.reset?.(); // chacun repart de sa place au début de l'action, sans la célébration en cours (0.8.20)
    // derrière la cage, ou au ras de la pelouse ; un penalty, toujours derrière la cage (au ras de la pelouse, la caméra
    // se plaçait parmi les joueurs alignés hors de la surface et cachait le gardien)
    const angle = H.r() < 0.5 ? 'goal' : 'low';
    H.replayAngle = H.pen ? 'goal' : angle;
    H.rt = Math.max(H.rec[0].t, H.revealT - REPLAY_BEFORE);
    H.rEnd = Math.min(H.rec[H.rec.length - 1].t, H.revealT + REPLAY_AFTER);
    H.cut = true;
    matchFeed.hlPhase = 'replay';
    matchFeed.onReplay?.(); // l'étiquette « Ralenti » change sur l'image même de la coupe (0.8.24)
    // la première image enregistrée, tout de suite (0.8.24, audit de la charte) : sinon, dans cette même image, les
    // joueurs remis à zéro recevaient encore l'état du direct (ballon frappé, but marqué) ; le gardien plongeait et le
    // buteur levait les bras avant la frappe rejouée
    replayStep(0);
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function replayStep(dt) {
    H.rt += dt * REPLAY_SPEED;
    if (H.rt >= H.rEnd) { finish(); return; }
    const rec = H.rec;
    let k = 0;
    while (k < rec.length - 2 && rec[k + 1].t < H.rt) k++;
    const f0 = rec[k], f1 = rec[k + 1] || f0;
    const w = f1.t > f0.t ? clamp((H.rt - f0.t) / (f1.t - f0.t), 0, 1) : 0;
    const L = (x, y) => x + (y - x) * w;
    for (let i = 0; i < N; i++) {
      const o = i * REC;
      const g = agents[i];
      g.x = L(f0.a[o], f1.a[o]); g.z = L(f0.a[o + 1], f1.a[o + 1]);
      g.h = f0.a[o + 2] + wrap(f1.a[o + 2] - f0.a[o + 2]) * w;
      g.phase = L(f0.a[o + 3], f1.a[o + 3]); g.gait = L(f0.a[o + 4], f1.a[o + 4]);
      g.kick = f1.a[o + 5] < f0.a[o + 5] ? f0.a[o + 5] : L(f0.a[o + 5], f1.a[o + 5]);
      g.lean = L(f0.a[o + 6], f1.a[o + 6]); g.cheer = L(f0.a[o + 7], f1.a[o + 7]);
      g.lift = L(f0.a[o + 8], f1.a[o + 8]); g.roll = L(f0.a[o + 9], f1.a[o + 9]);
      g.pose = f0.a[o + 10]; // une pose ne s'interpole pas (sa partie entière est son type)
      g.kickKind = f0.a[o + 11] ? 'shot' : 'pass';
      g.saveSide = f0.a[o + 12]; g.saveH = f0.a[o + 13]; g.saveLead = f0.a[o + 14]; g.saveKind = f0.a[o + 15]; g.saveId = f0.a[o + 16];
    }
    b.x = L(f0.b[0], f1.b[0]); b.y = L(f0.b[1], f1.b[1]); b.z = L(f0.b[2], f1.b[2]);
    qa.fromArray(f0.q); qb.fromArray(f1.q);
    ballMesh.quaternion.slerpQuaternions(qa, qb, w);
  }

  // --- Mise en scène générale ------------------------------------------------------------------------------------------
  function wantedPhase() {
    if (!S.matchDay) return 'off';
    if (matchFeed.active) return 'live';
    if (matchFeed.ended) return 'gone';
    return 'warmup';
  }
  function syncPhase() {
    const want = wantedPhase();
    if (want !== 'warmup' && S.play === 'warmup') warmBalls.forEach((m) => { m.visible = false; });
    if (want === 'warmup' && S.play !== 'warmup') {
      S.dir = [1, -1];
      warmupSetup();
      placeAll((i) => world(teamOf(i), slotOf(i) === 0 ? -5.1 : -2.3 + Math.cos(i) * 1.05, slotOf(i) === 0 ? 0 : Math.sin(i) * 1.05));
    }
    if (want !== 'live') { H = null; lastId = 0; }
    S.play = want;
  }

  function update(dtReal, time) {
    const dt = Math.min(dtReal, 0.05);
    S.now += dt;
    syncPhase();
    const visible = S.play === 'warmup' || (S.play === 'live' && H);
    ballMesh.visible = S.play === 'live' && !!H;
    warmBalls.forEach((m) => { m.visible = S.play === 'warmup'; });
    if (S.play === 'live') {
      const spec = matchFeed.hl;
      if (spec && spec.id !== lastId) { lastId = spec.id; startHL(spec); }
      if (!spec && H && H.phase !== 'end') H.phase = 'end'; // passé par le direct
    }
    if (!visible) { players.commit(0); card.visible = false; return null; }
    applyLooks(S.play === 'live' ? matchFeed.hl : null);
    if (S.play === 'warmup') warmupUpdate(dt);
    let cut = false;
    if (S.play === 'live' && H) {
      const step = dt * H.speed;
      if (H.phase === 'cut' || H.phase === 'play' || H.phase === 'react') {
        H.t += step;
        if (H.phase === 'cut' && H.t >= CUT) { H.phase = 'play'; H.cut = true; } // retour au jeu : changement de plan franc
        if (H.phase === 'cut' || H.phase === 'play') {
          H.line = offsideLine();
          runBeats(step);
          offBall(step);
          separate();
          ballUpdate(step);
          if (H.revealed) H.phase = 'react'; // (jamais pendant le plan de coupe : la construction dure bien plus)
          else if (H.t > H.est + 10) { H.forced = true; reveal(); H.phase = 'react'; } // une action qui n'aboutit pas : l'issue s'affiche quand même (filet de sécurité, jamais atteint au banc)
          if (!H.revealed) matchFeed.hlClock = H.e.at - HL_PRE * (1 - Math.min(0.98, H.t / Math.max(1, H.est)));
        } else {
          reactStep(step);
          if (H.phase === 'react') ballUpdate(step); // (le ralenti vient de commencer : son ballon est déjà posé)
        }
      } else if (H.phase === 'replay') replayStep(dtReal);
      // changement de plan lu après le pas de jeu (0.8.24, audit de la charte) : la coupe vers le ralenti tombe sur l'image
      // même où il commence ; lue avant, une image du ralenti passait encore par la caméra du direct
      cut = H.cut;
      H.cut = false;
    }

    // frappes, plongeons, sauts, chutes, joie (bras levés de l'équipe qui vient de marquer)
    const replay = H?.phase === 'replay';
    const cheerTeam = H && H.phase === 'react' && H.outcome === 'g' ? H.A : -1;
    const sc = cheerTeam >= 0 ? agents[H.shooter] : null;
    const celTo = cheerTeam >= 0 && H.cel ? at(...H.cel.to) : null;
    if (!replay) {
      agents.forEach((a, i) => {
        if (a.kick > 0) { a.kick += (dt * (H?.speed || 1)) / KICK_TIME; if (a.kick >= 1) { a.kick = 0; a.kickH = undefined; } }
        if (a.leanHold > 0) a.leanHold -= dt; else a.leanTo *= Math.max(0, 1 - dt * 2.5); // le gardien se relève
        a.lean += (a.leanTo - a.lean) * Math.min(1, dt * 12);
        if (Math.abs(a.lean) < 0.003 && Math.abs(a.leanTo) < 0.003) a.lean = a.leanTo = 0;
        // la joie (0.8.20, remarque du PDG : toute l'équipe célébrait en courant, glissades à genoux comprises) : le buteur
        // à l'approche de son coin ou après sa course, ses coéquipiers une fois arrêtés près de lui
        a.scorer = H?.shooter === i;
        let cheer = 0;
        if (teamOf(i) === cheerTeam && slotOf(i) !== 0) {
          if (a.scorer) cheer = !celTo || Math.hypot(a.x - celTo[0], a.z - celTo[1]) < 0.55 || H.react > 1.7 ? 1 : 0;
          else cheer = sc && a.speed < 0.16 && Math.hypot(a.x - sc.x, a.z - sc.z) < 0.45 ? 1 : 0;
        }
        a.cheer += (cheer - a.cheer) * Math.min(1, dt * (cheer ? 5 : 2.5));
        if (a.cheer < 0.005) a.cheer = 0;
        // un saut retombe dès qu'il n'est plus entretenu (0.8.24, audit de la charte : le joueur qui avait dévié de la tête,
        // gardé dans l'action, restait suspendu à 70 cm du sol jusqu'à la fin, ralenti compris)
        if (a.lift && !(H && a.jumpAt === H.t)) a.lift = Math.max(0, a.lift - dt * 0.4);
        // pose (players.js) : gardien prêt, plongeon, ballon serré ; saut de la tête, bras levés
        let want = slotOf(i) === 0 && H?.phase !== 'end' ? a.poseWant || 0 : a.lift > 0.004 ? 4 : 0;
        if (slotOf(i) === 0 && H && H.phase === 'react') want = b.state === 'keeper' && teamOf(i) === H.D ? 3 : 2; // après l'instant décisif
        // les bras tendus du plongeon, seulement tant que le corps est couché : relevé, il baisse les bras (jamais bras
        // levés devant un but encaissé)
        if (want === 2 && Math.abs(a.lean) < 0.2 && !a.saveKind) want = 0; // (un arrêt face à lui : le gardien 3D prend le ballon)
        if (want && want !== a.poseId) { a.poseId = want; a.poseK = Math.min(a.poseK || 0, 0.4); }
        a.poseK = (a.poseK || 0) + ((want ? 1 : 0) - (a.poseK || 0)) * Math.min(1, dt * (want === 2 ? 18 : 8));
        if (a.poseK < 0.01) { a.poseK = 0; a.poseId = want; }
        a.pose = a.poseId && a.poseK > 0.01 ? a.poseId + 0.98 * Math.min(1, a.poseK) : 0;
      });
    }
    for (let i = 0; i < N; i++) {
      if (S.out[i]) players.setAgent(i, agents[i], -2, 0.0001);
      else players.setAgent(i, agents[i], S.baseY);
    }
    players.timeScale = H && H.phase === 'replay' ? REPLAY_SPEED : 1; // joueurs 3D : gestes au ralenti eux aussi
    // tous les regards suivent le ballon pendant un temps fort (0.8.24)
    if (S.play === 'live' && H) players.setLook?.(b.x, S.baseY + BALL_R + b.y, b.z); else players.setLook?.(null);
    players.commit(N, dt);
    if (!replay) {
      const mx = b.x - b.prev[0], mz = b.z - b.prev[1];
      const moved = Math.hypot(mx, mz);
      if (moved > 1e-5 && b.y < 0.01) { b.roll += moved / BALL_R; b.rollAxis.set(mz, 0, -mx).normalize(); }
      else if (b.y >= 0.01 && (b.sx || b.sy || b.sz)) { // en l'air (1.0.18) : il tourne sur l'axe de son effet
        const w = Math.hypot(b.sx, b.sy, b.sz);
        b.roll += w * 40 * dt; b.rollAxis.set(b.sx / w, b.sy / w, b.sz / w);
      }
      b.prev = [b.x, b.z];
      placeBall(ballMesh, b, S.baseY);
    } else ballMesh.position.set(b.x, S.baseY + BALL_R + b.y, b.z);
    if (S.play === 'live' && H && (H.phase === 'play' || H.phase === 'react')) record();
    // carton brandi au-dessus du fautif
    if (H && H.cardOf !== undefined && H.phase === 'react') {
      const a = agents[H.cardOf];
      card.visible = H.react > 0.5 && H.react < 2.3; // l'arbitre le sort un instant après la coupe : la bande derrière le fautif est déjà libre
      card.position.set(a.x, S.baseY + 0.245 + Math.sin(time * 4) * 0.006, a.z); // juste au-dessus de sa tête (bas du carton à 2,1 m)
    } else card.visible = false;
    if (S.play !== 'live' || !H) return null;
    // plan demandé à la réalisation (Empire3D) : l'action (ballon, porteur), un coup de pied arrêté (entre le ballon et
    // le but), la joie du buteur, le carton, le ralenti ; cut : changement de plan franc
    // plan de coupe : plan large du stade, le temps de la mise en place (Empire3D)
    if (H.phase === 'cut') return { x: 0, z: 0, vx: 0, vz: 0, cam: 'cutaway', live: true, cut, t: H.t, side: S.dir[H.A], slow: false };
    const mover = b.state === 'held' && b.owner >= 0 ? agents[b.owner] : b;
    let focus = b, cam = 'attack';
    if (H.phase === 'replay') cam = 'replay';
    else if (H.phase === 'react' && H.outcome === 'g') { focus = agents[H.shooter]; cam = 'celebrate'; }
    else if (H.outcome === 'red' && (H.revealed || H.beats[H.k]?.contact)) { focus = agents[H.offender]; cam = 'card'; }
    else if (H.cam === 'set' && !H.shot) {
      const [gx, gz] = at(GOAL_X, 0);
      focus = { x: (b.x * 2 + gx) / 3, z: (b.z * 2 + gz) / 3 };
      cam = 'set';
    }
    // construction : plan large ; dans les quarante derniers mètres, le plan se resserre (façon retransmission)
    if (cam === 'attack' && uvOf(focus.x, focus.z)[0] < 1.4) cam = 'play';
    // dans le dernier tiers, le cadre penche vers le but : le ballon et la cage restent à l'image (écran en portrait compris)
    if (cam === 'attack' || cam === 'replay') {
      const [fu] = uvOf(focus.x, focus.z);
      const w = clamp((fu - 2.2) / 2.4, 0, 1) * 0.4;
      if (w > 0) { const [gx, gz] = at(GOAL_X, 0); focus = { x: focus.x + (gx - focus.x) * w, z: focus.z + (gz - focus.z) * w * 0.5 }; }
    }
    return {
      x: focus.x, z: focus.z, vx: mover.vx || 0, vz: mover.vz || 0, cam, live: true, cut, slow: H.phase === 'replay',
      angle: H.phase === 'replay' ? H.replayAngle : null, goalX: S.dir[H.A] * GOAL_X, bx: b.x, by: b.y, bz: b.z,
    };
  }

  return {
    update,
    setKits,
    setFormation(f) { if (S.play !== 'live') setFormations(f); },
    setMode(m) {
      if (m.baseY !== undefined) S.baseY = m.baseY;
      if (m.matchDay !== undefined) {
        if (!m.matchDay) matchFeed.ended = false; // jour de match terminé : le prochain recommence à l'échauffement
        S.matchDay = m.matchDay;
      }
    },
    on,
    get ball() { return b; },
    get agents() { return agents; }, // lecture seule (inspection en développement)
    get debug() {
      return H && { lane: H.laneWho ?? null, block: H.block ? { who: H.block.who, wall: H.block.wall, slide: H.block.slide, done: H.block.done } : null, turn: H.turn || null, slide: H.beats[H.k]?.slide ?? null, gapT: H.beats[H.k]?.t === 'tackle' ? +Math.hypot(agents[H.beats[H.k].who].x - agents[H.beats[H.k].victim].x, agents[H.beats[H.k].who].z - agents[H.beats[H.k].victim].z).toFixed(3) : null, offside: H.offside || 0, swaps: H.swaps || 0, line: H.line, A: H.A, keeper: H.keeper, victim: H.victim, offender: H.offender, foulAt: H.foulAt ?? null, dirA: S.dir[H.A], id: H.id, kind: H.kind, outcome: H.outcome, phase: H.phase, beat: H.beats[H.k]?.t, k: H.k, t: +H.t.toFixed(2), revealed: H.revealed, forced: !!H.forced, finaleT: H.finaleT ?? (H.fk === 0 ? 0 : null), est: H.est, fk: H.fk, bstate: b.state, owner: b.owner, bt: H.beats[H.k] && { t: H.beats[H.k].t, from: H.beats[H.k].from, to: H.beats[H.k].to, who: H.beats[H.k].who }, ball: { state: b.state, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2) } };
    },
    dispose() {
      matchFeed.scene = false;
      players.dispose();
      [ballMesh, ...warmBalls].forEach((m) => { parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      parent.remove(card);
      Object.values(cardMats).forEach((m) => m.dispose());
    },
  };
}
