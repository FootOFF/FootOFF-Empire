import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLOTS, plotBuilding } from '../game/map';
import { PLOT_POS } from './layout';
import { createPlayers } from './players';
import { Agent, PassingGame, createBallMesh, placeBall } from './motion';

// Vie de l'Empire : circulation et joueurs du club à l'entraînement.
// Unités du jeu (1 = 10 m). Tout est instancié et mis à jour sur place.
// Les tracés reprennent la voirie générée par tools/blender/models/build_site.py (repère Blender
// x, y en mètres -> jeu x / 10, z = -y / 10).

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

// --- Tracés ----------------------------------------------------------------------------------------

function polyline(points, closed) {
  const pts = closed ? [...points, points[0]] : points;
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return {
    length: total,
    closed,
    at(s, out) { // position et cap à l'abscisse s
      s = closed ? ((s % total) + total) % total : THREE.MathUtils.clamp(s, 0, total);
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].start <= s) lo = mid; else hi = mid - 1; }
      const g = segs[lo];
      const t = g.len ? (s - g.start) / g.len : 0;
      out.x = g.a[0] + (g.b[0] - g.a[0]) * t;
      out.z = g.a[1] + (g.b[1] - g.a[1]) * t;
      out.heading = Math.atan2(g.b[1] - g.a[1], g.b[0] - g.a[0]);
      return out;
    },
  };
}

// Boulevard périphérique (mêmes cotes que build_site.py, en mètres Blender : axe x = ±230, nord y = 220, sud
// y = −152) : deux boucles en sens contraires, circulation à droite. Aux angles sud, les voitures contournent
// l'îlot des ronds-points (trois quarts de tour pour tourner à gauche, un quart pour tourner à droite) ; au
// nord, simple virage. Le boulevard sud a sa propre chaussée de transit, de part et d'autre de la carte.
const RX = 230, RN = 220, RS = -152;
const OFF = 3; // demi-largeur de voie : axe de chaque sens à 3 m de l'axe de la route
const arcPts = (cx, cy, r, a0, a1) => { // arc en degrés, sens donné par a0 → a1
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 8));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
};
const toGame = (pts) => pts.map(([x, y]) => [x / 10, -y / 10]);
const ang = (dx, dy) => THREE.MathUtils.radToDeg(Math.atan2(dy, dx));
function ringLane(outer) {
  const R = outer ? 12.5 : 9.5; // rayon de giration autour de l'îlot
  const k = Math.sqrt(R * R - OFF * OFF);
  const pts = [];
  if (outer) { // sens trigonométrique vu de dessus : est au sud, nord à l'est, ouest au nord, sud à l'ouest
    pts.push(...arcPts(RX, RS, R, ang(-k, -OFF), ang(OFF, k) + 360)); // rond-point sud-est : à gauche
    pts.push(...arcPts(RX - 10, RN - 10, 10 + OFF, 0, 90)); // virage nord-est
    pts.push(...arcPts(-RX + 10, RN - 10, 10 + OFF, 90, 180)); // virage nord-ouest
    pts.push(...arcPts(-RX, RS, R, ang(-OFF, k), ang(k, -OFF) + 360)); // rond-point sud-ouest : à gauche
  } else { // sens horaire : ouest au sud, nord à l'ouest, est au nord, sud à l'est
    pts.push(...arcPts(-RX, RS, R, ang(k, OFF), ang(OFF, k))); // rond-point sud-ouest : à droite
    pts.push(...arcPts(-RX + 10, RN - 10, 10 - OFF, 180, 90)); // virage nord-ouest
    pts.push(...arcPts(RX - 10, RN - 10, 10 - OFF, 90, 0)); // virage nord-est
    pts.push(...arcPts(RX, RS, R, ang(-OFF, k), ang(-k, OFF))); // rond-point sud-est : à droite
  }
  return polyline(toGame(pts), true);
}

// Une voie = un tracé parcouru dans un seul sens ; les voitures d'une même voie ne se doublent jamais.
const LANES = [
  { path: ringLane(true), cars: 18 }, // périphérique, sens trigonométrique
  { path: ringLane(false), cars: 16 }, // périphérique, sens horaire
  { path: polyline([[-30, 17.5], [30, 17.5]], false), cars: 8 }, // boulevard sud (transit) vers l'est
  { path: polyline([[30, 18.1], [-30, 18.1]], false), cars: 8 }, // boulevard sud (transit) vers l'ouest
];
const CAR_LEN = 0.45;
const MIN_GAP = CAR_LEN + 0.35; // distance pare-chocs à pare-chocs minimale ~3,5 m
const EDGE = 1.5; // marge hors carte sur le boulevard (entrée / sortie invisibles)

// --- Circulation -----------------------------------------------------------------------------------

const PAINTS = [0x15161a, 0x1f2125, 0x2b2e33, 0x8a8f96, 0xd8d8d4, 0x3a3f47, 0x6b5530, 0xc7a15a];

function createTraffic(scene) {
  const cars = [];
  LANES.forEach((lane, li) => {
    const spacing = lane.path.length / lane.cars;
    for (let i = 0; i < lane.cars; i++) {
      cars.push({
        lane, li,
        d: spacing * i + Math.random() * Math.max(0, spacing - MIN_GAP) * 0.5, // déjà espacées
        v: 0,
        vmax: 0.95 + Math.random() * 0.45, // 34 à 50 km/h
      });
    }
  });
  const n = cars.length;
  const body = new THREE.BoxGeometry(0.45, 0.085, 0.18).translate(0, 0.075, 0);
  const cabin = new THREE.BoxGeometry(0.24, 0.06, 0.16).translate(-0.03, 0.145, 0);
  const lightsF = mergeGeometries([0.06, -0.06].map((z) => new THREE.BoxGeometry(0.01, 0.025, 0.035).translate(0.226, 0.085, z)));
  const lightsR = mergeGeometries([0.06, -0.06].map((z) => new THREE.BoxGeometry(0.01, 0.025, 0.04).translate(-0.226, 0.085, z)));
  const mBody = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), n);
  const mCab = new THREE.InstancedMesh(cabin, new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.1, metalness: 0.8 }), n);
  const front = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const rear = new THREE.MeshBasicMaterial({ color: 0x3a0d0d });
  const mF = new THREE.InstancedMesh(lightsF, front, n);
  const mR = new THREE.InstancedMesh(lightsR, rear, n);
  const col = new THREE.Color();
  cars.forEach((c, i) => mBody.setColorAt(i, col.setHex(PAINTS[i % PAINTS.length])));
  [mBody, mCab].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  [mBody, mCab, mF, mR].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  const st = { x: 0, z: 0, heading: 0 };
  const byLane = LANES.map((_, li) => cars.filter((c) => c.li === li));

  return {
    // lecture seule (tests, inspection) : voie, abscisse et vitesse de chaque voiture
    inspect: () => cars.map((c) => ({ lane: c.li, d: c.d, v: c.v, closed: c.lane.path.closed, L: c.lane.path.length })),
    setDark(dark) {
      front.color.setHex(dark ? 0xfff2d6 : 0x555555);
      rear.color.setHex(dark ? 0xff2a1a : 0x3a0d0d);
    },
    update(dt) {
      // modèle de poursuite : chaque voiture règle sa vitesse sur l'écart avec celle qui la précède
      byLane.forEach((list, li) => {
        const { path } = LANES[li];
        const L = path.length;
        list.sort((a, b) => a.d - b.d);
        list.forEach((c, k) => {
          let gap = Infinity;
          if (path.closed) {
            const lead = list[(k + 1) % list.length];
            gap = lead === c ? Infinity : ((lead.d - c.d) % L + L) % L;
          } else if (k + 1 < list.length) {
            gap = list[k + 1].d - c.d;
          }
          const safe = Math.max(0, (gap - MIN_GAP) * 1.6);
          const target = Math.min(c.vmax, safe);
          const accel = target > c.v ? 0.8 : 4.5; // freine plus fort qu'il n'accélère
          c.v += THREE.MathUtils.clamp(target - c.v, -accel * dt, accel * dt);
          c.v = Math.min(c.v, Math.max(0, gap - MIN_GAP) / Math.max(dt, 1e-3)); // jamais de chevauchement, même à bas débit d'images
          c.d += c.v * dt;
        });
        if (!path.closed) {
          // boulevard : la voiture sortie de la carte revient à l'entrée, derrière la dernière arrivée
          const tail = list.reduce((m, c) => Math.min(m, c.d), Infinity);
          list.forEach((c) => {
            if (c.d > L + EDGE) { c.d = Math.min(-EDGE, tail - MIN_GAP - 0.2); c.v = c.vmax * 0.8; }
          });
        } else {
          list.forEach((c) => { if (c.d > L) c.d -= L; });
        }
      });
      cars.forEach((c, i) => {
        const path = c.lane.path;
        const visible = path.closed || (c.d >= 0 && c.d <= path.length);
        path.at(c.d, st);
        tmpP.set(st.x, 0.003, st.z);
        tmpQ.setFromAxisAngle(UP, -st.heading);
        tmpM.compose(tmpP, tmpQ, visible ? tmpS : ZERO);
        mBody.setMatrixAt(i, tmpM); mCab.setMatrixAt(i, tmpM); mF.setMatrixAt(i, tmpM); mR.setMatrixAt(i, tmpM);
      });
      [mBody, mCab, mF, mR].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    },
    dispose() { [mBody, mCab, mF, mR].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); },
  };
}

// --- Joueurs du club à l'entraînement --------------------------------------------------------------

// Terrains d'entraînement (repère local du modèle en mètres -> jeu), selon le bâtiment et son niveau.
function pitchOf(key, lvl) {
  if (key === 'training') return lvl === 1 ? { c: [0, -13], h: [2.0, 1.2] } : { c: [0, -10], h: [2.6, 1.6] };
  return lvl <= 2 ? { c: [-6, -17], h: [1.4, 0.8] } : { c: [-6, -14], h: [1.95, 1.25] };
}

const GOLD_BIB = 0xc7a15a;
const DARK_BIB = 0x23252b;
const rnd = (a, b) => a + Math.random() * (b - a);

// Un terrain = un rondo (passes à une ou deux touches, deux joueurs au milieu qui pressent),
// des sprints (accélération, freinage, demi-tour, récupération) et un footing autour du terrain.
function sessionFor(cx, cz, hx, hz, small) {
  const units = [];
  // rondo
  const rx = cx - hx * 0.45, rz = cz, R = 0.32;
  const ringN = small ? 6 : 8;
  const ring = Array.from({ length: ringN }, (_, i) => {
    const a = (i / ringN) * Math.PI * 2;
    return { slot: [rx + Math.cos(a) * R, rz + Math.sin(a) * R], kit: GOLD_BIB };
  });
  const press = [{ kit: DARK_BIB }, { kit: DARK_BIB }];
  const rondoAgents = [...ring.map((r) => new Agent(r.slot[0], r.slot[1])), new Agent(rx - 0.05, rz), new Agent(rx + 0.05, rz)];
  rondoAgents.forEach((ag, i) => { if (i < ringN) ag.h = Math.atan2(rz - ag.z, rx - ag.x); });
  const game = new PassingGame(rondoAgents, {
    start: 0,
    dribble: [0.15, 0.55], // une à deux touches
    dribbleSpeed: 0.08,
    dribbleTarget: (i) => ({ x: ring[i].slot[0], z: ring[i].slot[1] }),
    canReceive: (i) => i < ringN,
    pickReceiver: (i) => {
      const opts = ring.map((_, j) => j).filter((j) => j !== i && j !== (i + 1) % ringN && j !== (i + ringN - 1) % ringN);
      return opts[Math.floor(Math.random() * opts.length)];
    },
    offBall: (i, b) => {
      if (i < ringN) { // joueurs du cercle : restent sur leur poste, petits ajustements, regardent le ballon
        const [sx, sz] = ring[i].slot;
        return { x: sx + Math.sin(i * 2.3 + b.x * 9) * 0.02, z: sz + Math.cos(i * 1.7 + b.z * 9) * 0.02, speed: 0.12 };
      }
      // pressing : le premier sur le porteur, le second coupe la ligne de passe, sans jamais toucher le ballon
      const holder = b.state === 'held' ? rondoAgents[b.owner] : null;
      const aim = holder || b;
      const toCenterX = rx - aim.x, toCenterZ = rz - aim.z;
      const l = Math.hypot(toCenterX, toCenterZ) || 1;
      const k = i === ringN ? 0.075 : 0.17;
      return { x: aim.x + (toCenterX / l) * k, z: aim.z + (toCenterZ / l) * k, speed: i === ringN ? 0.5 : 0.35 };
    },
  });
  units.push({ type: 'rondo', game, agents: rondoAgents, kits: [...ring.map((r) => r.kit), ...press.map((p) => p.kit)] });

  // sprints aller-retour
  const lanes = small ? 3 : 4;
  for (let i = 0; i < lanes; i++) {
    const x = cx + hx * 0.35 + i * 0.18;
    const ends = [cz - hz * 0.72, cz + hz * 0.72];
    const ag = new Agent(x, ends[0], Math.PI / 2);
    units.push({ type: 'shuttle', agent: ag, ends, x, leg: 1, rest: i * 0.7, kits: [DARK_BIB] });
  }
  // footing autour du terrain
  if (!small) {
    const corners = [[cx - hx * 0.92, cz - hz * 0.9], [cx + hx * 0.92, cz - hz * 0.9], [cx + hx * 0.92, cz + hz * 0.9], [cx - hx * 0.92, cz + hz * 0.9]];
    for (let i = 0; i < 3; i++) {
      const ag = new Agent(corners[0][0] + i * 0.12, corners[0][1]);
      units.push({ type: 'jog', agent: ag, corners, next: 1, kits: [GOLD_BIB] });
    }
  }
  return units;
}

function createTraining(scene, max = 48) {
  const players = createPlayers(scene, max);
  const balls = [];
  let sessions = [];
  let keys = []; // bâtiment de chaque séance (entraînement ou académie)
  let sig = '';
  let matchDay = false; // jour de match : l'équipe première est au stade, seuls les jeunes de l'académie s'entraînent

  return {
    setState(s) {
      // ne recrée les séances que si un terrain d'entraînement change (construction, niveau)
      const next = PLOTS.map((p) => { const k = plotBuilding(s, p.id); return k === 'training' || k === 'academy' ? `${p.id}:${k}:${s.buildings[k]}` : ''; }).join('|');
      if (next === sig) return;
      sig = next;
      sessions = [];
      keys = [];
      for (const p of PLOTS) {
        const key = plotBuilding(s, p.id);
        if (key !== 'training' && key !== 'academy') continue;
        const { c, h } = pitchOf(key, s.buildings[key]);
        const [px, pz] = PLOT_POS[p.id];
        sessions.push(sessionFor(px + c[0] / 10, pz - c[1] / 10, h[0], h[1], key === 'academy'));
        keys.push(key);
      }
      while (balls.length < sessions.length) { const b = createBallMesh(); scene.add(b); balls.push(b); }
      balls.forEach((b, i) => { b.visible = i < sessions.length; });
      let i = 0;
      sessions.forEach((units) => units.forEach((u) => u.kits.forEach((k) => { if (i < max) players.setKit(i++, k); })));
    },
    update(dt, time) {
      const step = Math.min(dt, 0.05);
      let i = 0;
      sessions.forEach((units, si) => {
        if (matchDay && keys[si] === 'training') { balls[si].visible = false; return; }
        balls[si].visible = true;
        units.forEach((u) => {
          if (u.type === 'rondo') {
            u.game.update(step, time);
            placeBall(balls[si], u.game.ball, 0.018);
            u.agents.forEach((ag) => { if (i < max) players.setAgent(i++, ag, 0.018); });
            return;
          }
          const ag = u.agent;
          if (u.type === 'shuttle') {
            if (u.rest > 0) { // récupération en bout de ligne, tourné vers la ligne suivante
              u.rest -= step;
              ag.steer(ag.x, ag.z, 0, step, u.x, u.ends[u.leg]);
            } else {
              ag.steer(u.x, u.ends[u.leg], 0.62, step);
              if (Math.abs(ag.z - u.ends[u.leg]) < 0.02 && ag.speed < 0.05) { u.leg = 1 - u.leg; u.rest = rnd(0.8, 1.6); }
            }
          } else { // footing : vise le coin suivant, l'arrondit en ralentissant légèrement
            const [tx, tz] = u.corners[u.next];
            ag.steer(tx, tz, 0.3, step);
            if (Math.hypot(tx - ag.x, tz - ag.z) < 0.12) u.next = (u.next + 1) % 4;
          }
          if (i < max) players.setAgent(i++, ag, 0.018);
        });
      });
      players.commit(i);
    },
    setMatchDay(v) {
      if (v === matchDay) return;
      matchDay = v;
      let i = 0; // les couleurs restent attachées à l'ordre des joueurs affichés
      sessions.forEach((units, si) => {
        if (matchDay && keys[si] === 'training') return;
        units.forEach((u) => u.kits.forEach((k) => { if (i < max) players.setKit(i++, k); }));
      });
    },
    dispose() {
      players.dispose();
      balls.forEach((b) => { scene.remove(b); b.geometry.dispose(); b.material.dispose(); });
    },
  };
}

// --- Point d'entrée --------------------------------------------------------------------------------

export function createLife(scene) {
  const traffic = createTraffic(scene);
  const training = createTraining(scene);
  return {
    traffic,
    setState: (s) => training.setState(s),
    setMode({ dark, matchDay }) { traffic.setDark(dark); training.setMatchDay(!!matchDay); },
    update(dt, time) { traffic.update(dt); training.update(dt, time); },
    dispose() { traffic.dispose(); training.dispose(); },
  };
}
