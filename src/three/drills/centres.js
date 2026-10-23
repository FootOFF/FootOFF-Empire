import * as THREE from 'three';
import { BALL_R, GOAL, KITS } from './stage';
import { agent, bezier, clamp01, cones, easeOut, rnd, stride, walkTo } from './kit';

// Centres (physique, niveau 4) : cinq centres venus de l'aile droite. Premier appui : l'attaquant (nos couleurs) lance
// sa course vers le point de chute ; second appui : il saute. La reprise est d'autant meilleure qu'il arrive à temps
// (ni trop tôt, à l'arrêt, ni trop tard) et que le haut du saut tombe avec le ballon : but, but en force, arrêt du
// gardien ou reprise manquée. Plan large et surélevé, depuis l'entrée de la surface, côté opposé à l'ailier.

const CROSSES = 5;
export const CROSSES_MAX = 100 * CROSSES;
const START = new THREE.Vector3(-0.2, 0, 1.3); // l'attaquant attend au point de penalty, un peu décalé
const RUN = 0.72; // vitesse de course (7,2 m/s)
const JUMP = 0.5; // durée d'un saut (s) ; le haut du saut à mi-course (le ballon arrive à 2,1 m : il faut sauter)
const FRAME = { v: 36, h: 54 }; // l'ailier, la surface et le but dans le même plan
const CAM = { pos: new THREE.Vector3(-0.95, 0.5, 2.25), look: new THREE.Vector3(0.42, 0.02, 0.95) };
// écran en hauteur (téléphone) : plan resserré sur la surface, derrière l'attaquant ; le centre entre par la droite
const CAM_TALL = { pos: new THREE.Vector3(0.25, 0.78, 2.45), look: new THREE.Vector3(0.12, 0, 0.82), frame: { v: 50, h: 36 } };

export function createCrosses(stage, ctx) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const P = stage.players;
  // 0 l'attaquant, 1 l'ailier (nos couleurs), 2 le défenseur (bleu), 3 le gardien
  const striker = agent(START.x, START.z, -Math.PI / 2 + 0.3);
  const winger = agent(2.55, 2.6, -Math.PI / 2);
  const marker = agent(START.x + 0.05, START.z - 0.09, Math.PI / 2);
  const keeper = agent(0, 0.05, Math.PI / 2);
  P.setKit(0, KITS.ours); P.setKit(1, KITS.ours); P.setKit(2, KITS.rival); P.setKit(3, KITS.keeper);
  const people = [striker, winger, marker, keeper];
  const shadows = people.map(() => stage.addShadow(0.07, 0.5, group));
  const ball = stage.addBall(group);
  cones(stage, [[2.3, 2.7], [2.75, 2.7], [2.3, 1.0], [2.75, 1.0]], undefined, group);
  // point de chute du centre : un anneau doré au sol, qui n'apparaît qu'au départ du ballon
  const spot = new THREE.Mesh(stage.keep(new THREE.PlaneGeometry(0.1, 0.1).rotateX(-Math.PI / 2)), stage.keep(stage.ringMaterial(0xdec17f)));
  spot.renderOrder = 4;
  spot.visible = false;
  group.add(spot);

  const s = {
    k: -1, phase: 'intro', t: 0, clock: 0, points: 0, goals: 0,
    land: new THREE.Vector3(), from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(),
    crossAt: 0, ballAt: 0, runAt: null, jumpAt: null, arrivedAt: null, flight: 0, dur: 1, header: null, out: null, dribble: 0, kickT: null,
  };
  const tmp = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);

  function hud() {
    const live = s.phase === 'wing' || s.phase === 'kickoff' || s.phase === 'cross';
    const prompt = live ? (s.runAt === null ? 'Lance ta course' : 'Saute pour reprendre le centre') : '';
    ctx.hud({ round: Math.max(1, s.k + 1), rounds: CROSSES, points: s.points, max: CROSSES_MAX, prompt, action: !!prompt });
  }

  function setup(k) {
    s.k = k;
    Object.assign(striker, { x: START.x, z: START.z, h: -Math.PI / 2 + 0.3, gait: 0, lift: 0, cheer: 0, kick: 0 });
    Object.assign(winger, { x: 2.55, z: 2.65, h: -Math.PI / 2, gait: 0, kick: 0 });
    Object.assign(marker, { x: START.x + 0.06, z: START.z - 0.1, h: Math.PI / 2, gait: 0 });
    Object.assign(keeper, { x: 0.05, z: 0.05, h: Math.PI / 2, roll: 0, lift: 0, cheer: 0, gait: 0.1 });
    s.land.set(rnd(-0.1, 0.2), 0.21, rnd(0.62, 0.9));
    s.dur = rnd(0.95, 1.12) - k * 0.03;
    s.dribble = rnd(1.1, 1.9);
    s.runAt = null; s.jumpAt = null; s.arrivedAt = null; s.header = null; s.out = null; s.kickT = null;
    ball.set(winger.x - 0.02, 0, winger.z - 0.04);
    spot.visible = false;
    s.phase = 'wing';
    s.t = 0;
    hud();
  }

  // évaluation de la reprise, à l'instant où le ballon arrive au point de chute
  function contact() {
    // en retard : le temps qu'il lui faudrait encore pour atteindre le point de chute ; en avance : depuis quand il y est
    const left = Math.hypot(s.land.x - striker.x, s.land.z - striker.z);
    const late = s.runAt === null ? Infinity : left > 0.03 ? left / RUN : (s.arrivedAt ?? s.clock) - s.ballAt;
    const peak = s.jumpAt === null ? null : s.jumpAt + JUMP / 2;
    const dj = peak === null ? 1 : Math.abs(peak - s.ballAt);
    let q;
    let text;
    if (late > 0.12) { q = 0; text = s.runAt === null ? 'Pas de course' : 'Trop tard'; } else {
      const early = Math.max(0, -late - 0.35); // arrivé bien avant le ballon : reprise à l'arrêt
      q = clamp01(1 - dj / 0.24) * (1 - Math.min(0.45, early * 0.6));
      if (s.jumpAt === null) q = 0.15;
      text = q >= 0.8 ? 'But de la tête' : q >= 0.5 ? 'But' : q >= 0.2 ? 'Arrêté par le gardien' : 'Reprise manquée';
    }
    const pts = q >= 0.8 ? 100 : q >= 0.5 ? 70 : q >= 0.2 ? 30 : 0;
    const goal = q >= 0.5;
    s.out = { pts, goal, text, saved: !goal && q >= 0.2, touched: q > 0, late, dj };
    s.points += pts;
    if (goal) s.goals += 1;
    if (s.out.touched) {
      // la tête renvoie le ballon vers le but : dans un coin si la reprise est belle, sur le gardien sinon
      const side = s.land.x > 0.05 ? -1 : 1;
      s.header = {
        t: 0,
        from: new THREE.Vector3(s.land.x, s.land.y, s.land.z),
        to: goal ? new THREE.Vector3(side * rnd(0.2, 0.3), rnd(0.03, 0.2), 0) : s.out.saved ? new THREE.Vector3(keeper.x + side * 0.03, 0.12, 0.06) : new THREE.Vector3(side * rnd(0.45, 0.6), 0.28, -0.1),
        dur: goal ? 0.36 : 0.45,
      };
      ctx.sfx('kick');
    } else s.header = null;
    ctx.pop({ text, points: pts ? `+${pts}` : '0', tone: pts >= 100 ? 'gold' : pts >= 70 ? 'good' : pts ? 'meh' : 'bad', at: stage.toScreen(tmp.set(s.land.x, 0.32, s.land.z)) });
  }

  return {
    intro() {
      setup(0);
      s.phase = 'intro';
      stage.camSet(new THREE.Vector3(1.6, 0.5, 2.9), new THREE.Vector3(0.5, 0.05, 1.2), { v: 36, h: 50 });
      const tall = stage.camera.aspect < 0.9;
      stage.camTo(tall ? CAM_TALL.pos : CAM.pos, tall ? CAM_TALL.look : CAM.look, 3.2, tall ? CAM_TALL.frame : FRAME);
    },
    start() { s.phase = 'wing'; s.t = 0; hud(); },
    press() {
      if (s.phase !== 'wing' && s.phase !== 'kickoff' && s.phase !== 'cross') return;
      if (s.runAt === null) { s.runAt = s.clock; ctx.sfx('step'); hud(); } else if (s.jumpAt === null) { s.jumpAt = s.clock; ctx.sfx('jump'); }
    },
    update(dt) {
      s.t += dt;
      s.clock += dt;
      // l'ailier déborde, puis centre
      if (s.phase === 'wing') {
        walkTo(winger, 2.55, 0.9, 0.55, dt, -Math.PI / 2);
        ball.set(winger.x - 0.012, 0, winger.z - 0.045);
        ball.spin(spin, dt * 12);
        if (s.t > s.dribble) { s.phase = 'kickoff'; s.t = 0; s.kickT = 0; winger.h = Math.PI; }
      }
      if (s.kickT !== null) {
        s.kickT += dt;
        winger.kick = clamp01(s.kickT / 0.6);
        winger.gait *= 1 - Math.min(1, dt * 8);
        if (s.kickT >= 0.6) { winger.kick = 0; s.kickT = null; }
      }
      if (s.phase === 'kickoff' && s.t >= 0.33) {
        s.phase = 'cross';
        s.t = 0;
        s.crossAt = s.clock;
        s.ballAt = s.clock + s.dur;
        s.from.set(ball.mesh.position.x, BALL_R, ball.mesh.position.z);
        s.to.copy(s.land);
        s.ctrl.copy(s.from).lerp(s.to, 0.5);
        s.ctrl.y = 0.62;
        s.ctrl.z += 0.15;
        spot.position.set(s.land.x, 0.002, s.land.z);
        spot.visible = true;
        ctx.sfx('kick');
        hud();
      }
      if (s.phase === 'cross') {
        const f = clamp01(s.t / s.dur);
        bezier(tmp, s.from, s.ctrl, s.to, f);
        ball.set(tmp.x, tmp.y - BALL_R, tmp.z);
        ball.spin(spin, dt * 20);
        if (f >= 1) { contact(); s.phase = 'header'; s.t = 0; spot.visible = false; hud(); }
      }
      if (s.phase === 'header') {
        const h = s.header;
        if (h) {
          h.t = Math.min(1, h.t + dt / h.dur);
          tmp.copy(h.from).lerp(h.to, easeOut(h.t));
          ball.set(tmp.x, Math.max(0, tmp.y - BALL_R), tmp.z);
          if (h.t >= 1 && !h.done) {
            h.done = true;
            if (s.out.goal) { stage.netHit(tmp.set(h.to.x, h.to.y, -GOAL.depth), 1); ctx.sfx('net'); stage.burst(tmp.set(h.to.x, h.to.y, 0.01), { count: s.out.pts >= 100 ? 60 : 36, color: 0xffe3a0, speed: 0.14 }); } else if (s.out.saved) ctx.sfx('save');
          }
        } else {
          // ballon manqué : il file vers le second poteau et sort
          tmp.set(s.land.x - 0.6 * s.t, Math.max(0, s.land.y - 0.4 * s.t), s.land.z - 0.25 * s.t);
          ball.set(tmp.x, tmp.y, tmp.z);
        }
        if (s.t > 1.5) {
          if (s.k + 1 < CROSSES) setup(s.k + 1);
          else { s.phase = 'done'; ball.hide(); ctx.end(s.points / CROSSES_MAX, { goals: s.goals, crosses: CROSSES }); }
        }
      }
      // l'attaquant : course vers le point de chute (ou vers le point de penalty avant le centre), saut
      if (s.runAt !== null && s.phase !== 'header') {
        const goal = s.phase === 'cross' ? s.land : tmp.set(0.05, 0, 0.78);
        const d = Math.hypot(goal.x - striker.x, goal.z - striker.z);
        if (d > 0.02) walkTo(striker, goal.x, goal.z, RUN, dt); else stride(striker, 0, dt);
        if (s.phase === 'cross' && s.arrivedAt === null && Math.hypot(s.land.x - striker.x, s.land.z - striker.z) <= 0.03) s.arrivedAt = s.clock;
      } else if (s.phase === 'header') {
        striker.gait *= 1 - Math.min(1, dt * 4);
        striker.cheer = s.out?.goal && s.t > 0.4 ? clamp01((s.t - 0.4) * 3) : 0;
      }
      striker.lift = s.jumpAt === null ? 0 : Math.max(0, 0.05 * Math.sin(Math.PI * clamp01((s.clock - s.jumpAt) / JUMP)));
      if (s.jumpAt !== null && s.clock - s.jumpAt > JUMP) striker.lift = 0;
      // le défenseur suit l'attaquant à un pas ; le gardien glisse vers le ballon et plonge sur la reprise
      walkTo(marker, striker.x + 0.07, striker.z - 0.08, RUN * 0.92, dt, Math.atan2(ball.mesh.position.z - marker.z, ball.mesh.position.x - marker.x));
      marker.lift = striker.lift * 0.6;
      const kx = THREE.MathUtils.clamp(ball.mesh.position.x * 0.4, -0.2, 0.2);
      if (s.phase !== 'header') walkTo(keeper, kx, 0.05, 0.25, dt, Math.PI / 2);
      else if (s.header && s.t < 0.8) { const side = Math.sign(s.header.to.x - keeper.x) || 1; keeper.roll = side * 1.0 * clamp01(s.t / 0.3); keeper.cheer = clamp01(s.t / 0.3); }
      people.forEach((a, i) => {
        P.setAgent(i, a, 0);
        shadows[i].position.set(a.x + 0.006, 0.0015, a.z + 0.006);
      });
      P.commit(people.length);
      spot.material.uniforms.uTime.value = stage.time;
    },
    get debug() { return Object.assign(s, { striker: [striker.x, striker.z] }); },
    dispose() { stage.scene.remove(group); },
  };
}
