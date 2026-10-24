import * as THREE from 'three';
import { BALL_R, GOAL, KITS } from './stage';
import { agent, bezier, clamp01, cones, pingPong, rnd } from './kit';

// Tirs au but. Au doigt ou à la souris, comme sur les jeux de foot mobiles : on glisse du ballon vers le but, le
// ballon part là où le doigt se lève ; un tracé courbé lui donne de l'effet (il s'enroule du côté où le geste
// s'est bombé) ; un geste lent fait une frappe molle et moins précise, et la précision se resserre moins à chaque
// frappe. Au clavier et à la manette, en deux temps : une ligne verticale balaie le but (premier appui : la
// direction), puis une ligne horizontale (second appui : la hauteur), de plus en plus vite. Plus le ballon arrive
// près du cœur d'une cible allumée, plus la frappe rapporte. Caméra derrière le ballon, dans l'axe du but ; le
// tireur n'apparaît que dans le plan d'ensemble de l'intro (vu de près et de dos, il masquerait le but).
// - Précision (technique) : six frappes depuis l'entrée de la surface, quatre cibles, cage vide.
// - Coups francs (technique, niveau 2) : cinq coups francs à 21-25 m, un mur de quatre joueurs qui saute à la frappe
//   et un gardien ; il faut viser haut pour passer au-dessus du mur, ou le contourner, et loin du gardien.

const R = 0.046; // rayon d'une cible (46 cm)
const CORNERS = [[-0.272, 0.183], [0.272, 0.183], [-0.272, 0.064], [0.272, 0.064]]; // haut gauche, haut droite, bas gauche, bas droite
const X_RANGE = [-0.43, 0.43];
const Y_RANGE = [0.008, 0.29];
const AUTO = 3.4; // secondes : sans appui, la ligne s'arrête d'elle-même
const FRAME = { v: 21, h: 27 }; // cadrage d'une frappe : le but, en grand (le ballon entre dans le champ quand il part)
const SWIPE_MIN = 34; // pixels : un geste plus court n'est pas un tir
const GOAL_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const PRECISION = {
  targets: CORNERS,
  shots: [
    { spot: [0, 1.95], on: [1], px: 1.9, py: 1.7 },
    { spot: [-0.42, 2.0], on: [2], px: 1.75, py: 1.55 },
    { spot: [0.42, 2.0], on: [0, 3], px: 1.6, py: 1.45 },
    { spot: [-0.2, 2.25], on: [1], px: 1.45, py: 1.3 },
    { spot: [0.25, 2.2], on: [2, 0], px: 1.3, py: 1.2 },
    { spot: [0, 1.85], on: [3], px: 1.15, py: 1.05 },
  ],
};
const FREE_KICKS = {
  targets: [[-0.27, 0.19], [0.27, 0.19], [-0.27, 0.07], [0.27, 0.07]],
  wall: true,
  keeper: true,
  shots: [
    { spot: [-0.3, 2.2], on: [1, 0], px: 1.8, py: 1.6 },
    { spot: [0.36, 2.15], on: [0, 1], px: 1.65, py: 1.5 },
    { spot: [0.04, 2.4], on: [0, 1], px: 1.5, py: 1.4 },
    { spot: [-0.48, 2.1], on: [1, 3], px: 1.4, py: 1.3 },
    { spot: [0.5, 2.25], on: [0, 2], px: 1.3, py: 1.2 },
  ],
};
export const PRECISION_MAX = 100 * PRECISION.shots.length;
export const FREE_KICKS_MAX = 100 * FREE_KICKS.shots.length;

const WALL = { gap: 0.058, dist: 0.915, top: 0.185, over: 0.15 }; // mur à 9,15 m ; viser au-dessus de 1,5 m le passe

// Mannequin de coup franc : silhouette jaune vif découpée (tête, épaules, corps, jambes serrées), sur un ressort noir.
function mannequinGeometry() {
  const m = 0.1; // mètres -> unités
  const s = new THREE.Shape();
  const pts = [[-0.15, 0], [-0.16, 0.9], [-0.21, 1.02], [-0.24, 1.42], [-0.18, 1.52], [-0.07, 1.56]];
  s.moveTo(pts[0][0] * m, pts[0][1] * m);
  pts.slice(1).forEach(([x, y]) => s.lineTo(x * m, y * m));
  s.absarc(0, 1.7 * m, 0.11 * m, -2.2, -0.94, true); // tête : du bas gauche au bas droit, par le haut
  [[0.07, 1.56], [0.18, 1.52], [0.24, 1.42], [0.21, 1.02], [0.16, 0.9], [0.15, 0]].forEach(([x, y]) => s.lineTo(x * m, y * m));
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 18 }).translate(0, 0.004, -0.0015);
}

function createShooting(stage, ctx, cfg) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;
  const SHOTS = cfg.shots;
  const MAX = 100 * SHOTS.length;
  const tgtGeo = keep(new THREE.PlaneGeometry(R * 2, R * 2));
  const targets = cfg.targets.map(([x, y]) => {
    const mat = keep(stage.ringMaterial(0xdec17f));
    const mesh = new THREE.Mesh(tgtGeo, mat);
    mesh.position.set(x, y, 0.004);
    group.add(mesh);
    return { x, y, mesh, mat, on: false, flash: 0 };
  });
  // lignes du viseur (dans le plan du but), réticule au croisement
  const beamV = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.32, 0.014).rotateZ(Math.PI / 2)), keep(stage.beamMaterial(0xffe9b8)));
  const beamH = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.9, 0.014)), keep(stage.beamMaterial(0xffe9b8)));
  const reticle = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.06, 0.06)), keep(stage.ringMaterial(0xffffff)));
  reticle.material.uniforms.uFill.value = 0;
  for (const b of [beamV, beamH, reticle]) { b.visible = false; b.renderOrder = 5; group.add(b); }

  // joueurs : 0 le tireur (nos couleurs), 1 le gardien ; le mur, ce sont des mannequins de coup franc
  const P = stage.players;
  const shooter = agent(0, 2.1);
  P.setKit(0, KITS.ours);
  const keeper = cfg.keeper ? agent(0, 0.035, Math.PI / 2) : null;
  if (keeper) P.setKit(1, KITS.keeper);
  const dummyGeo = cfg.wall ? keep(mannequinGeometry()) : null;
  const dummyMat = keep(new THREE.MeshStandardMaterial({ color: 0xf3d21c, roughness: 0.45, metalness: 0 }));
  const springMat = keep(new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.6, metalness: 0.4 }));
  const springGeo = keep(new THREE.CylinderGeometry(0.0035, 0.0045, 0.006, 14).translate(0, 0.003, 0));
  const wall = cfg.wall ? [0, 1, 2, 3].map(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(dummyGeo, dummyMat);
    g.add(body);
    g.add(new THREE.Mesh(springGeo, springMat));
    group.add(g);
    return { g, x: 0, z: 0, wobble: 0, v: 0 };
  }) : [];
  const people = [shooter, ...(keeper ? [keeper] : [])];
  const shadows = people.map(() => stage.addShadow(0.07, 0.5, group));
  const wallShadows = wall.map(() => { const sh = stage.addShadow(0.05, 0.35, group); sh.scale.set(0.05, 1, 0.02); return sh; });
  const ball = stage.addBall(group);
  const spare = [stage.addBall(group), stage.addBall(group), stage.addBall(group)];
  spare.forEach((b, i) => b.set(0.62 + i * 0.03, 0, 2.35 + (i % 2) * 0.025));
  cones(stage, [[-0.55, 1.65], [0.55, 1.65], [-0.55, 2.45], [0.55, 2.45]], undefined, group);

  const s = {
    k: -1, phase: 'intro', t: 0, aimX: 0, aimY: 0, points: 0, hits: 0, flight: null, jump: null, dive: null,
    mode: null, swipe: null, curl: 0, retry: false, // mode : 'swipe' (glissé) ou 'lines' (clavier, manette)
    spot: new THREE.Vector3(), from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(), out: null,
    wallAt: new THREE.Vector3(), wallSide: new THREE.Vector3(), keeperX: 0,
  };
  const tmp = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);

  const axes = (shot) => {
    const [sx, sz] = shot.spot;
    const dir = new THREE.Vector3(sx, 0, sz).normalize(); // du but vers le ballon
    return { sx, sz, dir, left: new THREE.Vector3(dir.z, 0, -dir.x) }; // gauche du tireur qui regarde le but
  };
  function camFor(shot) {
    const { sx, sz, dir } = axes(shot);
    const pos = new THREE.Vector3(sx, 0, sz).addScaledVector(dir, 0.42).setY(0.165);
    const look = new THREE.Vector3(sx * 0.12, 0.112, 0);
    return { pos, look };
  }

  function setup(k) {
    s.k = k;
    const shot = SHOTS[k];
    const { sx, sz, dir, left } = axes(shot);
    s.spot.set(sx, 0, sz);
    ball.set(sx, 0, sz);
    ball.mesh.rotation.set(rnd(0, 6), rnd(0, 6), 0);
    shooter.x = sx + dir.x * 0.06 + left.x * 0.15; // attend sur la gauche du ballon
    shooter.z = sz + dir.z * 0.06 + left.z * 0.15;
    shooter.h = Math.atan2(-dir.z, -dir.x);
    shooter.kick = 0; shooter.gait = 0; shooter.cheer = 0;
    targets.forEach((t, i) => { t.on = shot.on.includes(i); });
    if (cfg.wall) {
      // le mur couvre le poteau le plus proche du ballon ; le gardien se place de l'autre côté
      const side = Math.abs(sx) < 0.1 ? (k % 2 ? 1 : -1) : Math.sign(sx);
      const aim = tmp.set(side * 0.2, 0, 0);
      const toAim = aim.clone().sub(s.spot).normalize();
      s.wallAt.copy(s.spot).addScaledVector(toAim, WALL.dist);
      s.wallSide.set(-toAim.z, 0, toAim.x);
      wall.forEach((w, i) => {
        const o = (i - 1.5) * WALL.gap;
        w.x = s.wallAt.x + s.wallSide.x * o; w.z = s.wallAt.z + s.wallSide.z * o;
        w.g.position.set(w.x, 0, w.z);
        w.g.rotation.set(0, Math.atan2(s.spot.x - w.x, s.spot.z - w.z), 0); // face au ballon
        w.wobble = 0; w.v = 0;
        wallShadows[i].position.set(w.x + 0.004, 0.0014, w.z + 0.004);
        wallShadows[i].rotation.y = w.g.rotation.y;
      });
      s.keeperX = -side * 0.07;
    }
    if (keeper) { keeper.x = s.keeperX; keeper.z = 0.035; keeper.roll = 0; keeper.lift = 0; keeper.cheer = 0; keeper.gait = 0.1; }
    s.jump = null;
    s.dive = null;
    const c = camFor(shot);
    stage.camTo(c.pos, c.look, k === 0 ? 0.9 : 0.75, FRAME);
    s.phase = 'ready';
    s.t = 0;
    hud();
  }

  function hud(extra = {}) {
    const prompt = s.phase === 'aim' ? (s.retry ? 'Glisse plus franchement vers le but' : 'Glisse du ballon vers le but')
      : s.phase === 'aimX' ? 'Direction : arrête la ligne' : s.phase === 'aimY' ? (cfg.wall ? 'Hauteur : au-dessus du mur' : 'Hauteur : arrête la ligne') : '';
    const aim = s.phase === 'aim';
    ctx.hud({
      round: Math.max(1, s.k + 1), rounds: SHOTS.length, points: s.points, max: MAX, prompt, action: s.phase === 'aimX' || s.phase === 'aimY',
      swipe: aim, hint: aim ? stage.toScreen(tmp.set(s.spot.x, BALL_R, s.spot.z)) : null, ...extra,
    });
  }

  // tir au glissé : le point où le doigt se lève, ramené dans le plan du but, est la cible ; le tracé bombé donne
  // l'effet ; un geste lent (plus de 0,45 s) rend la frappe molle et l'écarte
  function swipeShot(sw) {
    const [x0, y0] = sw.pts[0];
    const [x1, y1] = sw.pts[sw.pts.length - 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const hit = len >= SWIPE_MIN && dy < -len * 0.3 ? stage.pickPlane(x1, y1, GOAL_PLANE) : null; // vers le haut, vers le but
    if (!hit) { s.retry = true; hud(); return; }
    const nx = -dy / len, ny = dx / len; // à droite du geste, à l'écran
    let bow = 0;
    for (const [px, py] of sw.pts) { const d = (px - x0) * nx + (py - y0) * ny; if (Math.abs(d) > Math.abs(bow)) bow = d; }
    s.curl = THREE.MathUtils.clamp((bow / len) * 3, -1, 1);
    const slow = clamp01(((performance.now() - sw.t0) / 1000 - 0.45) / 0.6);
    const sigma = 0.01 * (1.9 / SHOTS[s.k].px) + 0.025 * slow + 0.008 * Math.abs(s.curl);
    s.aimX = THREE.MathUtils.clamp(hit.x + gauss() * sigma, -0.7, 0.7);
    s.aimY = THREE.MathUtils.clamp(Math.max(Y_RANGE[0], hit.y) + gauss() * sigma * 0.8 - 0.03 * slow, Y_RANGE[0], 0.5);
    s.retry = false;
    s.mode = 'swipe';
    shoot();
  }

  // où le ballon passe-t-il le mur ? (en plan : la ligne du ballon au point visé, écartée par l'effet `off`)
  function wallCheck(x, y, off = 0) {
    if (!cfg.wall) return null;
    const d = Math.hypot(x - s.spot.x, -s.spot.z);
    const k = WALL.dist / d;
    const px = s.spot.x + (x - s.spot.x) * k + 2 * k * (1 - k) * off;
    const pz = s.spot.z + (0 - s.spot.z) * k;
    const lateral = (px - s.wallAt.x) * s.wallSide.x + (pz - s.wallAt.z) * s.wallSide.z;
    const covered = Math.abs(lateral) <= 1.5 * WALL.gap + 0.022;
    return { covered, blocked: covered && y < WALL.over, at: new THREE.Vector3(px, 0.12, pz), k };
  }

  // où arrive le ballon : mur, gardien, cible touchée (points selon la distance au cœur), cadré, montant ou à côté
  function judge(x, y, off = 0) {
    const shot = SHOTS[s.k];
    const w = wallCheck(x, y, off);
    if (w?.blocked) return { pts: 0, wall: true, text: 'Dans le mur', tone: 'bad' };
    const inGoal = Math.abs(x) < GOAL.w / 2 - BALL_R * 0.3 && y < GOAL.h - BALL_R * 0.3;
    if (keeper && inGoal && Math.abs(x - s.keeperX) <= 0.13 && y <= 0.205) return { pts: 10, saved: true, text: 'Arrêté par le gardien', tone: 'meh' };
    let best = null;
    for (const i of shot.on) {
      const t = targets[i];
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= R + BALL_R * 0.5 && (!best || d < best.d)) best = { t, d };
    }
    const onFrame = !inGoal && Math.abs(x) < GOAL.w / 2 + GOAL.post * 2 + BALL_R && y < GOAL.h + GOAL.post * 2 + BALL_R
      && (Math.abs(Math.abs(x) - (GOAL.w / 2 + GOAL.post)) < GOAL.post + BALL_R || Math.abs(y - (GOAL.h + GOAL.post / 2)) < GOAL.post + BALL_R);
    if (best && inGoal) {
      const q = best.d / R;
      const pts = q <= 0.34 ? 100 : q <= 0.67 ? 75 : 50;
      const lucarne = cfg.wall && best.t.y > 0.15;
      return { pts, target: best.t, inGoal, text: pts === 100 ? (lucarne ? 'Pleine lucarne' : 'En plein cœur') : pts === 75 ? 'Très bien' : 'Cible touchée', tone: pts === 100 ? 'gold' : 'good' };
    }
    if (onFrame) return { pts: 0, frame: true, text: 'Sur le montant', tone: 'bad' };
    if (inGoal) return cfg.keeper ? { pts: 30, inGoal, text: 'But, hors cible', tone: 'good' } : { pts: 15, inGoal, text: 'Cadré, hors cible', tone: 'meh' };
    return { pts: 0, text: y > GOAL.h ? 'Au-dessus' : 'À côté', tone: 'bad' };
  }

  function shoot() { // le ballon part une fraction de seconde après l'appui (le temps de la frappe)
    s.phase = 'kick';
    s.t = 0.2;
    hud();
  }

  function launch() {
    const x = s.aimX, y = s.aimY;
    // effet : celui du geste (glissé) ; sinon le ballon s'enroule vers l'intérieur (coup franc : effet marqué)
    const off = s.mode === 'swipe' ? s.curl * (cfg.wall ? 0.16 : 0.1)
      : cfg.wall ? (x - s.spot.x > 0 ? -1 : 1) * 0.07 : (s.spot.x > 0 ? -1 : 1) * 0.04 * (0.5 + Math.random() * 0.5);
    s.out = judge(x, y, off);
    s.from.set(s.spot.x, BALL_R, s.spot.z);
    s.to.set(x, y + (y < 0.02 ? 0.006 : 0), 0);
    const dist = s.from.distanceTo(s.to);
    s.ctrl.copy(s.from).lerp(s.to, 0.5);
    s.ctrl.x += off;
    if (cfg.wall) {
      // coup franc : une cloche qui passe le mur (ou s'y écrase)
      const w = wallCheck(x, y, off);
      s.ctrl.y = s.out.wall ? 0.16 : Math.max(0.3, y + 0.14);
      if (s.out.wall) { s.to.copy(w.at); s.to.y = 0.13; }
    } else {
      s.ctrl.y += 0.02 + y * 0.35; // légère cloche selon la hauteur visée
    }
    s.flight = { t: 0, dur: (cfg.wall ? 0.5 : 0.38) + dist * 0.06 * (s.out.wall ? 0.4 : 1) };
    s.phase = 'flight';
    if (keeper && (s.out.saved || s.out.inGoal || s.out.target)) s.dive = { t: 0, side: Math.sign(x - s.keeperX) || 1, reach: s.out.saved };
    ctx.sfx('kick');
  }

  function resolve() {
    const r = s.out;
    s.points += r.pts;
    if (r.target) {
      s.hits += 1;
      r.target.flash = 1;
      stage.burst(tmp.set(s.to.x, s.to.y, 0.01), { count: r.pts === 100 ? 70 : 45, color: r.pts === 100 ? 0xffe3a0 : 0xdec17f, speed: 0.16 });
      stage.shake(r.pts === 100 ? 0.6 : 0.35);
      ctx.sfx(r.pts === 100 ? 'perfect' : 'hit');
    } else if (r.frame) {
      stage.shake(0.5);
      ctx.sfx('post');
    } else if (r.wall) {
      stage.shake(0.3);
      ctx.sfx('clip');
      // le mannequin touché vacille sur son ressort, ses voisins un peu
      wall.forEach((w) => { const d = Math.hypot(w.x - s.to.x, w.z - s.to.z); w.v -= Math.max(0, 1 - d / 0.12) * 5; });
    } else if (r.saved) ctx.sfx('save');
    else ctx.sfx(r.inGoal ? 'net' : 'miss');
    if (r.inGoal) { stage.netHit(tmp.set(s.to.x, s.to.y, -GOAL.depth), 1); if (r.target) ctx.sfx('net'); }
    ctx.pop({ text: r.text, points: r.pts ? `+${r.pts}` : '0', tone: r.tone, at: stage.toScreen(tmp.set(s.to.x, s.to.y + 0.05, s.to.z)) });
    // suite du ballon : au fond du filet, capté, renvoyé par le mur ou le montant, ou au loin
    const after = r.inGoal ? new THREE.Vector3(s.to.x * 1.04, Math.max(0.02, s.to.y * 0.8), -GOAL.depth * 0.9)
      : r.saved ? new THREE.Vector3(s.keeperX + Math.sign(s.to.x - s.keeperX) * 0.05, 0.12, 0.05)
        : r.wall ? new THREE.Vector3(s.to.x + rnd(-0.15, 0.15), 0.02, s.to.z + 0.35)
          : r.frame ? new THREE.Vector3(s.to.x * 0.7, s.to.y * 0.6, 0.45) : new THREE.Vector3(s.to.x * 1.3, s.to.y + 0.06, -0.5);
    s.flight = { t: 0, dur: r.inGoal ? 0.22 : r.saved ? 0.18 : 0.5, from: s.to.clone(), to: after, settle: r.inGoal || r.wall, hold: r.saved };
    s.phase = 'after';
    s.t = 0;
    hud();
  }

  return {
    intro() {
      setup(0);
      // plan d'ensemble : le tireur à côté du ballon, le but au loin ; puis la caméra se place derrière le ballon
      stage.camSet(new THREE.Vector3(-0.62, 0.2, 2.5), new THREE.Vector3(-0.05, 0.08, 1.2), { v: 34, h: 44 });
      const c = camFor(SHOTS[0]);
      stage.camTo(c.pos, c.look, 3.4, FRAME);
      s.phase = 'intro';
    },
    start() { s.phase = s.mode === 'lines' ? 'aimX' : 'aim'; s.t = 0; hud(); },
    press(e = {}) {
      if (s.phase === 'aim') {
        if (e.pointer) { s.swipe = { pts: [[e.cx, e.cy]], t0: performance.now() }; return; }
        s.mode = 'lines'; // clavier ou manette : les deux lignes, pour cette frappe et les suivantes
        s.phase = 'aimX'; s.t = 0; hud();
        return;
      }
      if (s.phase === 'aimX') { s.phase = 'aimY'; s.t = 0; ctx.sfx('lock'); hud(); } else if (s.phase === 'aimY') { ctx.sfx('lock'); shoot(); }
    },
    move(e = {}) { if (s.swipe && e.pointer && e.cx != null) s.swipe.pts.push([e.cx, e.cy]); },
    release(e = {}) {
      if (!s.swipe || !e.pointer) return;
      const sw = s.swipe;
      s.swipe = null;
      if (e.cx != null) sw.pts.push([e.cx, e.cy]);
      if (s.phase === 'aim') swipeShot(sw);
    },
    update(dt) {
      const shot = SHOTS[Math.max(0, s.k)];
      s.t += dt;
      targets.forEach((t) => {
        t.mat.uniforms.uTime.value = stage.time;
        t.mat.uniforms.uOn.value += ((t.on ? 1 : 0.08) - t.mat.uniforms.uOn.value) * Math.min(1, dt * 6);
        t.flash = Math.max(0, t.flash - dt * 1.8);
        t.mat.uniforms.uFlash.value = t.flash;
        t.mesh.scale.setScalar(1 + t.flash * 0.35);
      });
      reticle.material.uniforms.uTime.value = stage.time;
      // viseur
      if (s.phase === 'ready' && !stage.camMoving && s.t > 0.25) { s.phase = s.mode === 'lines' ? 'aimX' : 'aim'; s.t = 0; hud(); }
      beamV.visible = s.phase === 'aimX' || s.phase === 'aimY';
      beamH.visible = s.phase === 'aimY';
      reticle.visible = s.phase === 'aimY';
      if (s.phase === 'aimX') {
        s.aimX = pingPong(s.t + shot.px * 0.25, X_RANGE[0], X_RANGE[1], shot.px);
        beamV.position.set(s.aimX, 0.15, 0.012);
        if (s.t > AUTO) { s.phase = 'aimY'; s.t = 0; hud(); }
      } else if (s.phase === 'aimY') {
        s.aimY = pingPong(s.t, Y_RANGE[0], Y_RANGE[1], shot.py);
        beamV.position.set(s.aimX, 0.15, 0.012);
        beamH.position.set(0, s.aimY, 0.013);
        reticle.position.set(s.aimX, s.aimY, 0.014);
        if (s.t > AUTO) shoot();
      }
      if (s.phase === 'kick' && s.t >= 0.33) launch();
      if (s.phase === 'flight') {
        const f = s.flight;
        f.t = Math.min(1, f.t + dt / f.dur);
        bezier(tmp, s.from, s.ctrl, s.to, f.t);
        ball.set(tmp.x, tmp.y - BALL_R, tmp.z);
        ball.spin(spin.set(1, 0, 0), dt * 40);
        if (f.t >= 1) resolve();
      } else if (s.phase === 'after') {
        const f = s.flight;
        f.t = Math.min(1, f.t + dt / f.dur);
        tmp.copy(f.from).lerp(f.to, f.t);
        if (f.settle) tmp.y = THREE.MathUtils.lerp(f.from.y, 0, f.t * f.t);
        else if (!f.hold) tmp.y -= 0.15 * f.t * f.t;
        ball.set(tmp.x, Math.max(0, tmp.y - BALL_R), tmp.z);
        if (s.t > 1.15) {
          if (s.k + 1 < SHOTS.length) setup(s.k + 1);
          else { s.phase = 'done'; ball.hide(); ctx.end(s.points / MAX, { hits: s.hits, shots: SHOTS.length, points: s.points }); }
        }
      }
      // mannequins sur ressort (oscillation amortie) ; le gardien plonge vers le ballon (et le capte s'il est à sa portée)
      wall.forEach((w) => {
        w.v += (-w.wobble * 90 - w.v * 6) * dt;
        w.wobble += w.v * dt;
        w.g.children[0].rotation.x = w.wobble;
      });
      if (keeper && s.dive) {
        s.dive.t += dt;
        const k = clamp01(s.dive.t / 0.32) * (1 - clamp01((s.dive.t - 1.0) / 0.4));
        const amp = s.dive.reach ? 0.6 : 1.15;
        keeper.roll = s.dive.side * amp * k;
        keeper.x = s.keeperX + s.dive.side * (s.dive.reach ? 0.05 : 0.12) * k;
        keeper.lift = 0.02 * Math.sin(Math.PI * clamp01(s.dive.t / 0.5));
        keeper.cheer = k;
      }
      // le tireur n'apparaît que dans le plan d'ensemble de l'intro ; caché pendant les frappes, il est posé sous le
      // terrain (le gardien garde son numéro)
      const seen = s.phase === 'intro';
      P.setAgent(0, seen ? shooter : { ...shooter, lift: -1 }, 0);
      if (keeper) P.setAgent(1, keeper, 0);
      P.commit(keeper ? 2 : 1);
      shadows.forEach((sh, i) => {
        const a = people[i];
        sh.visible = i > 0 || seen;
        sh.position.set(a.x + 0.006, 0.0015, a.z + 0.006);
        sh.material.opacity = 0.5 * (1 - Math.min(0.6, (a.lift || 0) * 12));
      });
    },
    get debug() { return s; },
    dispose() { stage.scene.remove(group); },
  };
}

export const createPrecision = (stage, ctx) => createShooting(stage, ctx, PRECISION);
export const createFreeKicks = (stage, ctx) => createShooting(stage, ctx, FREE_KICKS);
