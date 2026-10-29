import * as THREE from 'three';
import { Agent, createBallMesh, placeBall } from './motion';
import { createPlayers } from './players';
import { createPlayersAuto, identityOf } from './players3d';
import { formationOf, slotsOf } from '../game/tactics';
import { matchFeed } from '../game/matchFeed';
import { hash, rng } from '../game/faces';

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
const GRAVITY = 0.98;
const ROLL_DECEL = 0.15;
const BALL_R = 0.011;
const HEAD = 0.185; // hauteur d'une tête (1,85 m)
const SPOT = GOAL_X - 1.1; // point de penalty (11 m)
const BOX = GOAL_X - 1.65; // ligne de la surface (16,5 m)
const KEEP_U = GOAL_X - 0.1; // le gardien se tient un mètre devant sa ligne
const SPRINT = 0.74; // u/s (7,4 m/s)
const REPLAY_SPEED = 0.5; // ralenti
const REPLAY_BEFORE = 2.6; // secondes d'action avant l'instant décisif, dans le ralenti
const REPLAY_AFTER = 0.8;
const HL_PRE = 0.2; // minutes de jeu du début d'un temps fort à son instant décisif (comme match.jsx) : 12 s
const CUT = 1.1; // plan de coupe (s) : la mise en place se fait hors champ, l'action démarre déjà en mouvement
const RECV = 0.05; // contact pied-ballon (u) : un ballon arrêté se prend à cette distance du pied
const REACH = 0.1; // portée d'une jambe tendue (u, un mètre du corps) : un ballon qui passe là, au sol, est contrôlé

const clamp = THREE.MathUtils.clamp;
const teamOf = (i) => (i < 11 ? 0 : 1);
const slotOf = (i) => i % 11;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Schéma de l'avant-match (en %, attaque vers le haut) → repère d'équipe : u vers le but adverse, v en travers.
const anchorsOf = (formation) => formationOf(formation).pitch.map(([x, y]) => [-4.7 + (88 - y) * (6.7 / 73), ((x - 50) / 36) * 2.3]);

export function createMatchScene(parent) {
  const players = createPlayersAuto(parent, N, () => createPlayers(parent, N)); // joueurs réalistes dès qu'ils sont chargés
  const ballMesh = createBallMesh();
  parent.add(ballMesh);
  const warmBalls = [createBallMesh(), createBallMesh()];
  warmBalls.forEach((m) => parent.add(m));
  const cardMats = { yellow: new THREE.SpriteMaterial({ color: 0xf5d020, depthTest: false }), red: new THREE.SpriteMaterial({ color: 0xe03b2f, depthTest: false }) };
  const card = new THREE.Sprite(cardMats.red);
  card.scale.set(0.05, 0.07, 1);
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
  const b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, state: 'dead', owner: -1, roll: 0, rollAxis: new THREE.Vector3(0, 0, 1), prev: [0, 0] };
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
      Object.assign(a, { x, z, vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0, pose: 0, poseId: 0, poseK: 0, poseWant: 0 });
      a.h = teamOf(i) === 0 ? (S.dir[0] > 0 ? 0 : Math.PI) : (S.dir[1] > 0 ? 0 : Math.PI);
    }
  }
  function deadBall(x, z) { Object.assign(b, { state: 'dead', owner: -1, x, z, y: 0, vx: 0, vz: 0, vy: 0 }); }
  function give(i) { Object.assign(b, { state: 'held', owner: i, vx: 0, vz: 0, vy: 0 }); }

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
    Object.assign(a, { vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0 });
    const [fx, fz] = at(faceU, faceV);
    a.h = Math.atan2(fz - a.z, fx - a.x);
    H.home.set(i, [u, v]);
  }
  // place un joueur au départ de la construction (hors champ, pendant le plan de coupe), sans changer sa place de finale
  function place(i, u, v, faceU = GOAL_X, faceV = 0) {
    const a = agents[i];
    [a.x, a.z] = at(u, v);
    Object.assign(a, { vx: 0, vz: 0, speed: 0, kick: 0, lean: 0, leanTo: 0, leanHold: 0, cheer: 0, lift: 0, roll: 0 });
    const [fx, fz] = at(faceU, faceV);
    a.h = Math.atan2(fz - a.z, fx - a.x);
  }
  // pendant la construction, chacun remonte de son point de départ vers sa place de finale (u reculé de shift au début)
  const lagAt = (i, t) => (H.shift && slotOf(i) > 0 ? H.shift * (1 - clamp(t / Math.max(0.5, H.bT), 0, 1)) : 0);
  const planAt = (i, t) => { const [u, v] = H.home.get(i); return [u - lagAt(i, t), v]; };
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
      home: new Map(), runs: new Map(), busy: new Set(), rec: [], shot: null, dive: null, cut: true,
      speed: 1, est: 4, // toujours à vitesse normale : ×4 n'accélère que le jeu entre deux temps forts (0.8.9)
    };
    H.roles = [rolesOf(0), rolesOf(1)];
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
          { t: 'carry', who: carrier, to: [3.3, s * 0.45], speed: 0.6, max: 2.4 },
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
    if (!['corner', 'freekick', 'penalty'].includes(H.kind)) beats = buildUp(beats);
    H.beats = beats;
    H.finale = H.fk === 0;
    H.est = beats.reduce((t, x) => t + (x.t === 'wait' ? x.dur : x.t === 'pass' ? 1.3 : x.t === 'carry' ? Math.min(x.max ?? 1.5, 1.5) : 0.8), CUT + 0.6);
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
    H.shift = counter ? rr(0.8, 1.1) : rr(1.2, 1.7);
    for (const i of [...outfield(0), ...outfield(1)]) {
      const [u, v] = H.home.get(i);
      place(i, clamp(u - H.shift, -4.3, 4.6), v, teamOf(i) === H.A ? GOAL_X : -GOAL_X, 0);
    }
    const mates = outfield(T).filter((i) => i !== owner0);
    const homeU = (i) => H.home.get(i)[0];
    const homeV = (i) => H.home.get(i)[1];
    // départ : un défenseur central (le plus axial), ou sur un contre le milieu le plus reculé
    const starters = mates.filter((i) => slotsOf(S.formation[T])[slotOf(i)] === (counter ? 'M' : 'D'));
    const starter = (starters.length ? starters : mates).sort((x, y) => (counter ? homeU(x) - homeU(y) : Math.abs(homeV(x)) - Math.abs(homeV(y))))[0];
    if (starter === undefined) return finale;
    const keeperFirst = !counter && r() < 0.2; // relance du gardien : une passe courte vers son défenseur
    if (keeperFirst) {
      const keeper = T * 11;
      give(keeper);
      chain.push({ t: 'wait', dur: 0.35 });
      chain.push({ t: 'pass', from: keeper, to: starter, at: 'plan', style: 'ground' });
    } else give(starter);
    chain.push({ t: 'carry', who: starter, to: 'plan', speed: 0.3, max: rr(0.4, 0.8) }); // quelques mètres balle au pied
    // les relais : de l'arrière vers l'avant, souvent d'un côté à l'autre, jusqu'au joueur de la finale
    const k = counter ? (r() < 0.5 ? 1 : 2) : 2 + (r() < 0.3 ? 1 : 0);
    const seq = [];
    let cur = starter;
    for (let j = 0; j < k - 1; j++) {
      const cu = homeU(cur), cv = homeV(cur);
      const opts = mates.filter((i) => i !== starter && !seq.includes(i) && homeU(i) > cu - 0.3 && homeU(i) < Math.max(cu + 2.4, homeU(owner0) - 0.2)
        && Math.hypot(homeU(i) - cu, homeV(i) - cv) > 1.2 && Math.hypot(homeU(i) - homeU(owner0), homeV(i) - homeV(owner0)) > 1.0); // jamais une passe de quelques pas
      if (!opts.length) break;
      const score = (i) => (homeU(i) - cu) * 0.6 + (Math.sign(homeV(i)) !== Math.sign(cv) && Math.abs(homeV(i) - cv) > 0.8 ? 0.9 : 0) + r() * 0.8;
      opts.sort((x, y) => score(y) - score(x));
      seq.push(opts[0]);
      cur = opts[0];
    }
    seq.push(owner0);
    from = starter;
    seq.forEach((to, j) => {
      const last = j === seq.length - 1;
      const [fu, fv] = H.home.get(from), [tu, tv] = H.home.get(to);
      chain.push({ t: 'pass', from, to, at: last ? H.home.get(to) : 'plan', style: Math.hypot(tu - fu, tv - fv) > 2.6 ? 'lob' : 'ground' });
      if (!last && r() < 0.5) chain.push({ t: 'carry', who: to, to: 'plan', speed: 0.34, max: rr(0.25, 0.5) }); // contrôle orienté, quelques pas (sinon, en une touche)
      from = to;
    });
    H.fk = chain.length;
    H.bT = chain.reduce((t, x) => t + (x.t === 'wait' ? x.dur : x.t === 'pass' ? 1.4 : Math.min(x.max ?? 1, 1)), 0.4);
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
  const steerUV = (i, u, v, speed, dt, look = null) => {
    const [x, z] = at(u, v);
    if (look) agents[i].steer(x, z, speed, dt, ...look);
    else agents[i].steer(x, z, speed, dt);
  };
  // passe vers (tx, tz) en T secondes : au sol (le ballon ralentit en roulant), ou aérienne jusqu'à la hauteur y1
  function launchBall(tx, tz, T, { ground = false, y1 = 0 } = {}) {
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    let v;
    if (ground) { v = d / T + 0.5 * ROLL_DECEL * T; b.vy = 0; b.y = 0; } else { v = d / T; b.vy = (y1 - b.y + 0.5 * GRAVITY * T * T) / T; }
    b.vx = (dx / d) * v;
    b.vz = (dz / d) * v;
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
  function shoot(i, style) {
    const { rr, outcome } = H;
    const kp = agents[H.keeper];
    const [, kv] = uvOf(kp.x, kp.z);
    const [bu, bv] = uvOf(b.x, b.z);
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
    b.vx = (gx - b.x) / T;
    b.vz = (gz - b.z) / T;
    b.vy = (h - b.y + 0.5 * GRAVITY * T * T) / T;
    b.state = 'shot';
    b.owner = -1;
    // le gardien : où plonger, et quand (un penalty se plonge au moment de la frappe)
    const reach = outcome === 's' ? tv : outcome === 'g' ? (H.r() < 0.55 ? -Math.sign(tv || 1) * rr(0.12, 0.28) : tv * rr(0.25, 0.55)) : tv * rr(0.4, 0.8);
    H.dive = { v: reach, at: H.t + (H.pen ? 0.06 : Math.max(0.05, T - 0.42)), from: kv, catch: outcome === 's', parry: outcome === 's' && H.r() < 0.45 };
    H.shot = { T, t0: H.t, tv, h, style, from: [bu, bv] };
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
  function ballPhysics(dt) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    if (b.y > 0) b.vy -= GRAVITY * dt;
    else {
      b.y = 0;
      if (b.vy < -0.06) { b.vy = -b.vy * 0.32; b.vx *= 0.6; b.vz *= 0.6; } else b.vy = 0;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const f = Math.max(0, sp - (b.state === 'net' ? 1.6 : ROLL_DECEL) * dt) / sp; b.vx *= f; b.vz *= f; }
    }
  }
  function ballUpdate(dt) {
    if (b.state === 'held') {
      const p = agents[b.owner];
      const [sx, sz] = footSpot(p, 0.04 + 0.025 * Math.abs(Math.sin(p.phase * 0.5)));
      b.x += (sx - b.x) * Math.min(1, dt * 12); b.z += (sz - b.z) * Math.min(1, dt * 12);
      b.y = Math.max(0, b.y - dt * 1.2);
      return;
    }
    if (b.state === 'keeper') { // dans les gants : le ballon y vient en douceur (jamais recollé d'un coup)
      const kp = agents[H.keeper];
      const k = Math.min(1, dt * 14);
      b.x += (kp.x + Math.cos(kp.h) * 0.02 - b.x) * k;
      b.z += (kp.z + Math.sin(kp.h) * 0.02 + kp.lean * 0.11 - b.z) * k;
      b.y += (0.09 * (1 - Math.abs(kp.lean) * 0.55) - b.y) * k;
      return;
    }
    if (b.state === 'dead') return;
    const [u0] = uvOf(b.x, b.z);
    ballPhysics(dt);
    if (b.state === 'net') { // au fond des filets
      const gx = S.dir[H.A] * (GOAL_X + 0.16);
      if (Math.abs(b.x) > Math.abs(gx)) { b.x = gx; b.vx = 0; }
      if (Math.abs(b.z) > GOAL_HALF - 0.02) { b.z = Math.sign(b.z) * (GOAL_HALF - 0.02); b.vz = 0; }
      if (b.y > 0.2) { b.y = 0.2; b.vy = 0; }
      return;
    }
    if (b.state !== 'shot') return;
    const [u1, v1] = uvOf(b.x, b.z);
    const kp = agents[H.keeper];
    const [ku] = uvOf(kp.x, kp.z);
    // arrêt : le ballon atteint le gardien, qui l'a suivi et s'est jeté dessus
    if (H.outcome === 's' && u0 < ku - 0.01 && u1 >= ku - 0.01) {
      const [, kvNow] = uvOf(kp.x, kp.z);
      kp.leanTo = clamp((v1 - kvNow) / 0.11, -1, 1);
      kp.leanHold = 0.8;
      if (H.dive?.parry) { // repoussé : le ballon repart sur le côté, en corner
        b.vx = -b.vx * 0.3; b.vz = (Math.sign(v1 || 1) * 1.2) * S.dir[H.A]; b.vy = Math.abs(b.vy) * 0.4 + 0.25;
        b.state = 'free';
      } else { b.vx = b.vz = b.vy = 0; b.state = 'keeper'; }
      reveal();
      return;
    }
    if (u1 >= GOAL_X) {
      const inFrame = Math.abs(v1) < GOAL_HALF - 0.012 && b.y < BAR - 0.01;
      if (H.outcome === 'p') { // poteau ou barre : le ballon revient en jeu
        [b.x] = at(GOAL_X - 0.012, v1);
        b.vx = -b.vx * 0.45; b.vz = (Math.random() - 0.5) * 0.9; b.vy = Math.abs(b.vy) * 0.3;
        b.state = 'free';
        reveal();
      } else if (H.outcome === 'g' && inFrame) {
        b.state = 'net';
        b.vx *= 0.3; b.vz *= 0.3;
        reveal();
      } else if (!H.revealed) { reveal(); b.state = 'free'; } // dehors
    }
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
  function gather(i, dt, speed = 0.62) {
    if (b.state === 'held') return b.owner === i;
    if (b.state === 'shot' || b.state === 'net' || b.state === 'keeper') return false;
    const p = agents[i];
    const sp = Math.hypot(b.vx, b.vz);
    const ahead = Math.min(0.35, sp * 0.35); // là où le ballon sera dans un instant
    const tx = b.x + (sp > 0.02 ? (b.vx / sp) * ahead : 0), tz = b.z + (sp > 0.02 ? (b.vz / sp) * ahead : 0);
    const [fx, fz] = p.forward();
    p.steer(tx - fx * 0.04, tz - fz * 0.04, speed, dt, b.x, b.z);
    if (touching(i)) { give(i); return true; }
    return false;
  }
  // durée d'une passe vers (tx, tz) : celle du geste, ou davantage si le receveur a besoin de plus de temps pour y être
  function passTime(bt, tx, tz) {
    const base = passTimeOf(bt.style, Math.hypot(tx - b.x, tz - b.z));
    const rc = agents[bt.to];
    // un joueur arrêté met plus d'une seconde à prendre sa vitesse (ACCEL 0,55 u/s²) : sa course est comptée large
    return Math.max(base, Math.hypot(tx - rc.x, tz - rc.z) / 0.5 + (rc.speed < 0.2 ? 0.5 : 0.25));
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
  function runBeats(dt) {
    const bt = H.beats[H.k];
    if (!bt || H.revealed) return;
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
      const tx = b.x - Math.cos(toGoal) * 0.035, tz = b.z - Math.sin(toGoal) * 0.035;
      p.steer(tx, tz, 0.36, dt, b.x, b.z);
      if (Math.hypot(tx - p.x, tz - p.z) < 0.025 && (touching(bt.who) || H.bt > 2)) { give(bt.who); next(); }
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
    if (bt.t === 'pass') {
      const p = agents[bt.from];
      const rcv = agents[bt.to];
      H.busy.add(bt.from);
      H.busy.add(bt.to);
      const shot = H.beats[H.k + 1];
      const firstShot = shot && shot.t === 'shot' && shot.first && shot.who === bt.to;
      const firstPass = shot && shot.t === 'pass' && shot.first && shot.from === bt.to;
      const headed = (firstShot && shot.style === 'head') || (firstPass && shot.head);
      if (!bt.launched) {
        if (bt.head) { // déviation de la tête (défenseur) : le ballon arrive sur lui, il le repousse aussitôt
          if (!bt.target) bt.target = at(...bt.at);
          const [tx, tz] = bt.target;
          const T = passTimeOf(bt.style, Math.hypot(tx - b.x, tz - b.z));
          launchBall(tx, tz, T, { y1: 0.04 });
          bt.launched = true; bt.T = T; bt.t0 = H.t; b.state = 'pass';
          return;
        }
        if (!bt.target) bt.target = targetOf(bt);
        const [tx, tz] = bt.target;
        // le receveur se met en route vers le point visé
        const lead = passTime(bt, tx, tz) + ARMED;
        const [ttu, ttv] = uvOf(tx, tz);
        const [hx, hz] = ttu > H.line - 0.03 ? at(H.line - 0.03, ttv) : [tx, tz]; // en jeu jusqu'au départ du ballon
        rcv.steer(hx, hz, Math.min(SPRINT, Math.hypot(hx - rcv.x, hz - rcv.z) / Math.max(0.15, lead - 0.05) + 0.05), dt, b.x, b.z);
        if (!gather(bt.from, dt)) return; // le passeur doit d'abord avoir le ballon
        // il frappe en finissant de se tourner, quand son receveur est en jeu (il attend son appel, au plus 1,6 s)
        if (!p.kick && (p.facing(tx, tz) < 1.0 || H.bt > 0.35) && (onside(bt.to) || H.bt > 1.6)) { p.kick = 0.001; p.kickKind = 'pass'; }
        p.steer(p.x, p.z, 0, dt, tx, tz);
        if (p.kick >= KICK_CONTACT) {
          if (!onside(bt.to)) H.offside = (H.offside || 0) + 1; // mesure (banc) : jamais atteint
          const T = passTime(bt, tx, tz);
          launchBall(tx, tz, T, { ground: bt.style === 'ground' || bt.style === 'through', y1: bt.y1 || 0 });
          bt.launched = true; bt.T = T; bt.t0 = H.t; b.state = 'pass';
          H.busy.delete(bt.from);
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
        rcv.steer(gx, gz, left > 0 ? Math.min(SPRINT, Math.hypot(gx - rcv.x, gz - rcv.z) / Math.max(0.08, tl) + 0.02) : 0.4, dt, b.x, b.z);
      }
      // reprise du pied : l'élan commence avant que le ballon n'arrive ; de la tête : il saute
      if (firstShot && shot.style !== 'head' && left <= ARMED && !rcv.kick) { rcv.kick = 0.001; rcv.kickKind = 'shot'; }
      if (headed) {
        const jt = 0.32;
        rcv.lift = left < jt && left > -jt ? 0.07 * Math.max(0, 1 - (left / jt) ** 2) : rcv.lift * 0.8;
      }
      const headNow = headed && b.y > 0.1;
      // le receveur visé s'étire pour contrôler la passe qui lui est destinée (1,5 m) ; le ballon vient ensuite à son pied
      // en douceur (ballUpdate), jamais d'un bond
      const stretch = !headNow && b.y < 0.09 && Math.hypot(b.x - rcv.x, b.z - rcv.z) < REACH * 1.5;
      if (touching(bt.to, headNow) || stretch) {
        if (firstShot) { next(); shot.launched = true; shoot(bt.to, headNow ? 'head' : shot.style === 'head' ? 'volley' : shot.style); H.busy.add(bt.to); return; }
        if (firstPass) { next(); return; } // la déviation part tout de suite (geste suivant)
        give(bt.to);
        next();
        return;
      }
      if (left < -0.15) { // manqué : il va chercher le ballon (qui roule, ou retombe) et le prend au contact
        if (firstPass && left < -0.4) { next(); return; } // la déviation se fait sans lui : le ballon est repoussé là où il est
        if (gather(bt.to, dt, SPRINT)) {
          if (firstShot) { next(); shot.launched = true; shoot(bt.to, shot.style === 'head' ? 'poke' : shot.style); H.busy.add(bt.to); return; }
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
      if (!p.kick) { p.kick = 0.001; p.kickKind = 'shot'; }
      if (p.kick >= KICK_CONTACT) { bt.launched = true; shoot(bt.who, bt.style); }
      return;
    }
    if (bt.t === 'foul') { // le fautif fauche le porteur : arrêt de jeu, carton rouge, il sort
      H.busy.add(bt.who);
      H.busy.add(bt.victim);
      const off = agents[bt.who];
      const vic = agents[bt.victim];
      if (!bt.contact) {
        off.steer(vic.x, vic.z, 0.8, dt);
        vic.steer(...at(GOAL_X - 1.4, uvOf(vic.x, vic.z)[1] * 0.8), 0.6, dt);
        if (Math.hypot(off.x - vic.x, off.z - vic.z) < 0.05 || H.bt > 2.2) {
          bt.contact = H.t;
          vic.roll = (Math.random() < 0.5 ? -1 : 1) * 1.35; // le porteur s'écroule
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

  // Les autres joueurs : appels de balle, bloc défensif qui coulisse, pressing, marquage dans la surface, gardiens.
  function offBall(dt) {
    const { A, D } = H;
    const [bu, bv] = uvOf(b.x, b.z);
    const carrier = b.state === 'held' ? b.owner : -1;
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
        steerUV(i, Math.min(tu, line), hv + (bv - hv) * 0.08 + Math.cos(w * 0.8) * 0.18, 0.3, dt, [b.x, b.z]);
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
          if (!active(j) || slotOf(j) === 0) continue;
          const [ju, jv] = uvOf(agents[j].x, agents[j].z);
          const d = Math.hypot(ju - hu, jv - hv);
          if (ju > BOX - 0.6 && d < md) { md = d; mark = [ju, jv]; }
        }
      }
      // la défense ne laisse personne partir dans son dos : chacun reste plus près de son but que l'attaquant le plus avancé
      // (c'est elle qui recule, l'attaquant reste en jeu) ; en attendant, de petits pas d'ajustement, jamais planté
      const goalSide = Math.min(GOAL_X - 0.22, deepest + 0.06);
      const k = slotOf(i), w = H.t * (0.7 + k * 0.05) + k * 2.3;
      if (mark) steerUV(i, Math.max(Math.min(GOAL_X - 0.2, mark[0] + 0.1), goalSide), mark[1] * 0.9, 0.5, dt, [b.x, b.z]);
      else {
        const tu = Math.max(clamp(hu + clamp(bu - 3.2, -1.5, 0.6) * 0.5, 0.3, GOAL_X - 0.3), goalSide);
        const [cu] = uvOf(agents[i].x, agents[i].z);
        const late = tu - cu > 0.15; // en retard sur sa ligne : il recule vite
        steerUV(i, tu + Math.sin(w) * 0.05, hv + (bv - hv) * 0.22 + Math.cos(w * 0.9) * 0.06, late ? 0.62 : H.oneOnOne ? 0.6 : 0.34, dt, [b.x, b.z]);
      }
    }
  }
  // Gardiens : celui qui défend suit le ballon sur sa ligne (sort sur un face-à-face) et plonge sur la frappe ;
  // l'autre reste dans sa moitié.
  function keeperStep(i, dt, bu, bv) {
    const a = agents[i];
    if (teamOf(i) === H.A) { // le gardien de l'équipe qui attaque suit le jeu, en libéro, sans quitter sa surface
      a.poseWant = 0;
      steerUV(i, -4.6 + clamp((bu + 1) * 0.12, 0, 0.7), clamp(bv * 0.12, -0.4, 0.4), 0.14, dt, [b.x, b.z]);
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
    steerUV(i, u, v, H.dive && H.t >= H.dive.at ? 0.5 : 0.3, dt, H.shot ? [b.x - b.vx * 0.6, b.z - b.vz * 0.6] : [b.x, b.z]);
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
      off.steer(off.x, Math.sign(off.z || 1) * 3.75, 0.16, dt);
      for (let i = 0; i < N; i++) if (active(i) && i !== H.offender && i !== H.victim) agents[i].steer(agents[i].x, agents[i].z, 0, dt, off.x, off.z);
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
  const REC = 12; // par joueur : x, z, cap, foulée, allure, frappe, plongeon, joie, saut, chute, pose, tir (joueurs 3D)
  function record() {
    const a = new Float32Array(N * REC);
    for (let i = 0; i < N; i++) {
      const g = agents[i];
      a.set([g.x, g.z, g.h, g.phase, g.gait, g.kick, g.lean, g.cheer, g.lift, g.roll, g.pose || 0, g.kickKind === 'shot' ? 1 : 0], i * REC);
    }
    H.rec.push({ t: H.t, a, b: [b.x, b.y, b.z], q: ballMesh.quaternion.toArray() });
  }
  function startReplay() {
    H.phase = 'replay';
    H.replayAngle = H.r() < 0.5 ? 'goal' : 'low'; // derrière la cage, ou au ras de la pelouse
    H.rt = Math.max(H.rec[0].t, H.revealT - REPLAY_BEFORE);
    H.rEnd = Math.min(H.rec[H.rec.length - 1].t, H.revealT + REPLAY_AFTER);
    H.cut = true;
    matchFeed.hlPhase = 'replay';
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
      cut = H.cut;
      H.cut = false;
      const step = dt * H.speed;
      if (H.phase === 'cut' || H.phase === 'play' || H.phase === 'react') {
        H.t += step;
        if (H.phase === 'cut' && H.t >= CUT) { H.phase = 'play'; H.cut = true; } // retour au jeu : changement de plan franc
        if (H.phase === 'cut' || H.phase === 'play') {
          H.line = offsideLine();
          runBeats(step);
          offBall(step);
          ballUpdate(step);
          if (H.revealed) H.phase = 'react'; // (jamais pendant le plan de coupe : la construction dure bien plus)
          else if (H.t > H.est + 10) { H.forced = true; reveal(); H.phase = 'react'; } // une action qui n'aboutit pas : l'issue s'affiche quand même (filet de sécurité, jamais atteint au banc)
          if (!H.revealed) matchFeed.hlClock = H.e.at - HL_PRE * (1 - Math.min(0.98, H.t / Math.max(1, H.est)));
        } else {
          reactStep(step);
          ballUpdate(step);
        }
      } else if (H.phase === 'replay') replayStep(dtReal);
    }

    // frappes, plongeons, sauts, chutes, joie (bras levés de l'équipe qui vient de marquer)
    const replay = H?.phase === 'replay';
    const cheerTeam = H && H.phase === 'react' && H.outcome === 'g' ? H.A : -1;
    if (!replay) {
      agents.forEach((a, i) => {
        if (a.kick > 0) { a.kick += (dt * (H?.speed || 1)) / KICK_TIME; if (a.kick >= 1) a.kick = 0; }
        if (a.leanHold > 0) a.leanHold -= dt; else a.leanTo *= Math.max(0, 1 - dt * 2.5); // le gardien se relève
        a.lean += (a.leanTo - a.lean) * Math.min(1, dt * 12);
        if (Math.abs(a.lean) < 0.003 && Math.abs(a.leanTo) < 0.003) a.lean = a.leanTo = 0;
        const cheer = teamOf(i) === cheerTeam && slotOf(i) !== 0 ? 1 : 0;
        a.cheer += (cheer - a.cheer) * Math.min(1, dt * (cheer ? 5 : 2.5));
        if (a.cheer < 0.005) a.cheer = 0;
        if (a.lift && !(H?.busy.has(i))) a.lift = Math.max(0, a.lift - dt * 0.4);
        // pose (players.js) : gardien prêt, plongeon, ballon serré ; saut de la tête, bras levés
        let want = slotOf(i) === 0 && H?.phase !== 'end' ? a.poseWant || 0 : a.lift > 0.004 ? 4 : 0;
        if (slotOf(i) === 0 && H && H.phase === 'react') want = b.state === 'keeper' && teamOf(i) === H.D ? 3 : 2; // après l'instant décisif
        // les bras tendus du plongeon, seulement tant que le corps est couché : relevé, il baisse les bras (jamais bras
        // levés devant un but encaissé)
        if (want === 2 && Math.abs(a.lean) < 0.2) want = 0;
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
    players.commit(N);
    if (!replay) {
      const mx = b.x - b.prev[0], mz = b.z - b.prev[1];
      const moved = Math.hypot(mx, mz);
      if (moved > 1e-5 && b.y < 0.01) { b.roll += moved / BALL_R; b.rollAxis.set(mz, 0, -mx).normalize(); }
      b.prev = [b.x, b.z];
      placeBall(ballMesh, b, S.baseY);
    } else ballMesh.position.set(b.x, S.baseY + BALL_R + b.y, b.z);
    if (S.play === 'live' && H && (H.phase === 'play' || H.phase === 'react')) record();
    // carton brandi au-dessus du fautif
    if (H && H.cardOf !== undefined && H.phase === 'react') {
      const a = agents[H.cardOf];
      card.visible = H.react < 1.8;
      card.position.set(a.x, S.baseY + 0.27 + Math.sin(time * 4) * 0.008, a.z);
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
      return H && { offside: H.offside || 0, swaps: H.swaps || 0, line: H.line, A: H.A, dirA: S.dir[H.A], id: H.id, kind: H.kind, outcome: H.outcome, phase: H.phase, beat: H.beats[H.k]?.t, k: H.k, t: +H.t.toFixed(2), revealed: H.revealed, forced: !!H.forced, finaleT: H.finaleT ?? (H.fk === 0 ? 0 : null), est: H.est, fk: H.fk, bstate: b.state, owner: b.owner, bt: H.beats[H.k] && { t: H.beats[H.k].t, from: H.beats[H.k].from, to: H.beats[H.k].to, who: H.beats[H.k].who }, ball: { state: b.state, x: +b.x.toFixed(2), z: +b.z.toFixed(2), y: +b.y.toFixed(2) } };
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
