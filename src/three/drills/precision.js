import * as THREE from 'three';
import { BALL_R, GOAL, KITS } from './stage';
import { agent, bezier, clamp01, cones, pingPong, rnd, walkTo } from './kit';

// Précision (technique) : six frappes depuis l'entrée de la surface vers des cibles accrochées dans le but. Deux
// temps par frappe : une ligne verticale balaie le but (premier appui : la direction), puis une ligne horizontale
// (second appui : la hauteur). Plus le ballon arrive près du cœur d'une cible allumée, plus la frappe rapporte ;
// les lignes vont de plus en plus vite.

const TARGETS = [[-0.272, 0.183], [0.272, 0.183], [-0.272, 0.064], [0.272, 0.064]]; // haut gauche, haut droite, bas gauche, bas droite
const R = 0.046; // rayon d'une cible (46 cm)
const SHOTS = [
  { spot: [0, 1.95], on: [1], px: 1.9, py: 1.7 },
  { spot: [-0.42, 2.0], on: [2], px: 1.75, py: 1.55 },
  { spot: [0.42, 2.0], on: [0, 3], px: 1.6, py: 1.45 },
  { spot: [-0.2, 2.25], on: [1], px: 1.45, py: 1.3 },
  { spot: [0.25, 2.2], on: [2, 0], px: 1.3, py: 1.2 },
  { spot: [0, 1.85], on: [3], px: 1.15, py: 1.05 },
];
export const PRECISION_MAX = 100 * SHOTS.length;
const X_RANGE = [-0.43, 0.43];
const Y_RANGE = [0.008, 0.29];
const AUTO = 3.4; // secondes : sans appui, la ligne s'arrête d'elle-même
const FRAME = { v: 21, h: 27 }; // cadrage d'une frappe : le but, en grand (le ballon entre dans le champ quand il part)

export function createPrecision(stage, ctx) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;
  const tgtGeo = keep(new THREE.PlaneGeometry(R * 2, R * 2));
  const targets = TARGETS.map(([x, y]) => {
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

  // tireur (nos couleurs), ballon, plots et ballons de réserve
  const shooter = agent(0, 2.1);
  stage.players.setKit(0, KITS.ours);
  const shShadow = stage.addShadow(0.07, 0.5, group);
  const ball = stage.addBall(group);
  const spare = [stage.addBall(group), stage.addBall(group), stage.addBall(group)];
  spare.forEach((b, i) => b.set(0.62 + i * 0.03, 0, 2.35 + (i % 2) * 0.025));
  cones(stage, [[-0.55, 1.65], [0.55, 1.65], [-0.55, 2.4], [0.55, 2.4]], undefined, group);

  const s = {
    k: -1, phase: 'intro', t: 0, aimX: 0, aimY: 0, points: 0, hits: 0, flight: null, kickT: null,
    spot: new THREE.Vector3(), from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(), out: null,
  };
  const tmp = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);

  // caméra derrière le ballon, dans l'axe du but ; le tireur attend sur la gauche, hors du champ, et y entre pour frapper
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
  const waitSpot = (shot) => { const { sx, sz, dir, left } = axes(shot); return [sx + dir.x * 0.06 + left.x * 0.15, sz + dir.z * 0.06 + left.z * 0.15]; };
  const kickSpot = (shot) => { const { sx, sz, dir, left } = axes(shot); return [sx + dir.x * 0.045 + left.x * 0.03, sz + dir.z * 0.045 + left.z * 0.03]; };

  function setup(k) {
    s.k = k;
    const shot = SHOTS[k];
    const [sx, sz] = shot.spot;
    s.spot.set(sx, 0, sz);
    ball.set(sx, 0, sz);
    ball.mesh.rotation.set(rnd(0, 6), rnd(0, 6), 0);
    const { dir } = axes(shot);
    [shooter.x, shooter.z] = waitSpot(shot);
    shooter.h = Math.atan2(-dir.z, -dir.x);
    shooter.kick = 0; shooter.gait = 0; shooter.cheer = 0;
    targets.forEach((t, i) => { t.on = shot.on.includes(i); });
    const c = camFor(shot);
    if (k === 0) stage.camTo(c.pos, c.look, 0.9, FRAME); else stage.camTo(c.pos, c.look, 0.75, FRAME);
    s.phase = 'ready';
    s.t = 0;
    hud();
  }

  function hud(extra = {}) {
    const prompt = s.phase === 'aimX' ? 'Direction : arrête la ligne' : s.phase === 'aimY' ? 'Hauteur : arrête la ligne' : '';
    ctx.hud({ round: Math.max(1, s.k + 1), rounds: SHOTS.length, points: s.points, max: PRECISION_MAX, prompt, action: s.phase === 'aimX' || s.phase === 'aimY', ...extra });
  }

  // où arrive le ballon : cible touchée (points selon la distance au cœur), cadré, poteau ou à côté
  function judge(x, y) {
    const shot = SHOTS[s.k];
    let best = null;
    for (const i of shot.on) {
      const t = targets[i];
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= R + BALL_R * 0.5 && (!best || d < best.d)) best = { t, d };
    }
    const inGoal = Math.abs(x) < GOAL.w / 2 - BALL_R * 0.3 && y < GOAL.h - BALL_R * 0.3;
    const onFrame = !inGoal && Math.abs(x) < GOAL.w / 2 + GOAL.post * 2 + BALL_R && y < GOAL.h + GOAL.post * 2 + BALL_R
      && (Math.abs(Math.abs(x) - (GOAL.w / 2 + GOAL.post)) < GOAL.post + BALL_R || Math.abs(y - (GOAL.h + GOAL.post / 2)) < GOAL.post + BALL_R);
    if (best && inGoal) {
      const q = best.d / R;
      const pts = q <= 0.34 ? 100 : q <= 0.67 ? 75 : 50;
      return { pts, target: best.t, inGoal, text: pts === 100 ? 'En plein cœur' : pts === 75 ? 'Très bien' : 'Cible touchée', tone: pts === 100 ? 'gold' : 'good' };
    }
    if (onFrame) return { pts: 0, frame: true, text: 'Sur le montant', tone: 'bad' };
    if (inGoal) return { pts: 15, inGoal, text: 'Cadré, hors cible', tone: 'meh' };
    return { pts: 0, text: 'À côté', tone: 'bad' };
  }

  function shoot() { // le ballon part une fraction de seconde après l'appui (le temps de la frappe)
    s.phase = 'kick';
    s.t = 0.2;
    hud();
  }

  function launch() {
    const x = s.aimX, y = s.aimY;
    s.from.set(s.spot.x, BALL_R, s.spot.z);
    s.to.set(x, y + (y < 0.02 ? 0.006 : 0), 0);
    const dist = s.from.distanceTo(s.to);
    // effet : le ballon s'enroule un peu vers l'intérieur ; légère cloche selon la hauteur visée
    s.ctrl.copy(s.from).lerp(s.to, 0.5);
    s.ctrl.x += (s.spot.x > 0 ? -1 : 1) * 0.04 * (0.5 + Math.random() * 0.5);
    s.ctrl.y += 0.02 + y * 0.35;
    s.flight = { t: 0, dur: 0.38 + dist * 0.06 };
    s.out = judge(x, y);
    s.phase = 'flight';
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
    } else ctx.sfx(r.inGoal ? 'net' : 'miss');
    if (r.inGoal) { stage.netHit(tmp.set(s.to.x, s.to.y, -GOAL.depth), 1); if (r.target) ctx.sfx('net'); }
    ctx.pop({ text: r.text, points: r.pts ? `+${r.pts}` : '0', tone: r.tone, at: stage.toScreen(tmp.set(s.to.x, s.to.y + 0.05, 0)) });
    // suite du ballon : au fond du filet, renvoyé par le montant, ou au loin
    const after = r.inGoal ? new THREE.Vector3(s.to.x * 1.04, Math.max(0.02, s.to.y * 0.8), -GOAL.depth * 0.9)
      : r.frame ? new THREE.Vector3(s.to.x * 0.7, s.to.y * 0.6, 0.45) : new THREE.Vector3(s.to.x * 1.3, s.to.y + 0.06, -0.5);
    s.flight = { t: 0, dur: r.inGoal ? 0.22 : 0.5, from: s.to.clone(), to: after, settle: r.inGoal };
    s.phase = 'after';
    s.t = 0;
    hud();
  }

  return {
    intro() {
      setup(0);
      // plan d'ensemble : le tireur à côté du ballon, le but au loin ; puis la caméra se place derrière le ballon
      stage.camSet(new THREE.Vector3(-0.62, 0.2, 2.42), new THREE.Vector3(-0.05, 0.08, 1.2), { v: 34, h: 44 });
      const c = camFor(SHOTS[0]);
      stage.camTo(c.pos, c.look, 3.4, FRAME);
      s.phase = 'intro';
    },
    start() { s.phase = 'aimX'; s.t = 0; hud(); },
    press() {
      if (s.phase === 'aimX') { s.phase = 'aimY'; s.t = 0; ctx.sfx('lock'); hud(); } else if (s.phase === 'aimY') { ctx.sfx('lock'); shoot(); }
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
      if (s.phase === 'ready' && !stage.camMoving && s.t > 0.25) { s.phase = 'aimX'; s.t = 0; hud(); }
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
      // élan (quelques foulées), frappe (le pied touche le ballon à 55 % du geste), vol du ballon, suite
      if (s.phase === 'runup') {
        const { dir } = axes(shot);
        const [tx, tz] = kickSpot(shot);
        const there = walkTo(shooter, tx, tz, 0.5, dt, Math.atan2(-dir.z, -dir.x));
        if (there || s.t > 0.45) { s.phase = 'kick'; s.t = 0; s.kickT = 0; }
      }
      if (s.kickT !== null) {
        s.kickT += dt;
        shooter.kick = clamp01(s.kickT / 0.6);
        shooter.gait *= 1 - Math.min(1, dt * 8);
        if (s.kickT >= 0.6) { shooter.kick = 0; s.kickT = null; }
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
        tmp.y = f.settle ? THREE.MathUtils.lerp(f.from.y, 0, f.t * f.t) : tmp.y - 0.15 * f.t * f.t;
        ball.set(tmp.x, Math.max(0, tmp.y - BALL_R), tmp.z);
        if (s.out?.pts >= 75 && s.t < 0.9) shooter.cheer = Math.min(1, s.t * 3);
        if (s.t > 1.15) {
          shooter.cheer = 0;
          if (s.k + 1 < SHOTS.length) setup(s.k + 1);
          else { s.phase = 'done'; ball.hide(); ctx.end(s.points / PRECISION_MAX, { hits: s.hits, shots: SHOTS.length, points: s.points }); }
        }
      }
      // le tireur n'apparaît que dans le plan d'ensemble de l'intro (vu de près, de dos, il masquerait le but)
      const seen = s.phase === 'intro';
      stage.players.setAgent(0, shooter, 0);
      stage.players.commit(seen ? 1 : 0);
      shShadow.visible = seen;
      shShadow.position.set(shooter.x + 0.006, 0.0015, shooter.z + 0.006);
    },
    get debug() { return s; },
    dispose() {
      stage.scene.remove(group);
    },
  };
}
