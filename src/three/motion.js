import * as THREE from 'three';

// Mouvement des joueurs : locomotion réaliste (accélération, freinage, rotation limitée, foulée liée à la
// distance parcourue) et jeu de passes (contrôle, conduite, orientation, frappe, ballon qui roule, réception).
// Unités du jeu : 1 = 10 m. Vitesses de référence : marche 0,14 u/s (1,4 m/s), footing 0,3, sprint 0,7.

const ACCEL = 0.55; // u/s² (5,5 m/s²)
const TURN = 5.5; // rad/s
const KICK_TIME = 0.6; // durée de l'animation de frappe (s)
const KICK_CONTACT = 0.55; // instant du contact pied-ballon (fraction de la frappe)
const GRAVITY = 0.98; // u/s²
const ROLL_DECEL = 0.15; // décélération du ballon qui roule (1,5 m/s²)
const ARRIVAL = 0.75; // vitesse visée à l'arrivée d'une passe (7,5 m/s)
const BALL_R = 0.011; // rayon du ballon (11 cm)

const rand = (a, b) => a + Math.random() * (b - a);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Agent {
  constructor(x, z, h = 0) {
    this.x = x; this.z = z; this.vx = 0; this.vz = 0;
    this.h = h; this.speed = 0; this.gait = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.kick = 0; // progression de la frappe (0 = pas de frappe)
    this.lean = 0; this.leanTo = 0; this.leanHold = 0; // bascule latérale (plongeon du gardien : -1 .. 1, vers -z / +z)
    this.cheer = 0; // joie (0 .. 1) : bras levés pendant la célébration d'un but
  }

  // Se dirige vers (tx, tz) à la vitesse voulue en ralentissant à l'arrivée ; regarde (fx, fz) à l'arrêt, ou tout
  // le temps avec look (gardien en pas chassés, face au jeu).
  steer(tx, tz, speed, dt, fx, fz, look = false) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const want = d > 0.004 ? Math.min(speed, d * 1.6) : 0;
    const dvx = (d > 1e-6 ? (dx / d) * want : 0) - this.vx;
    const dvz = (d > 1e-6 ? (dz / d) * want : 0) - this.vz;
    const dv = Math.hypot(dvx, dvz);
    const k = dv > ACCEL * dt ? (ACCEL * dt) / dv : 1;
    this.vx += dvx * k; this.vz += dvz * k;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.speed = Math.hypot(this.vx, this.vz);
    let target = this.h;
    const kicking = this.kick > 0 && this.kickH !== undefined; // frappe : le corps se tourne vers la cible (0.8.20)
    if (kicking) target = this.kickH;
    else if (look && fx !== undefined) {
      target = Math.atan2(fz - this.z, fx - this.x);
      // pas chassés (0.8.24) : face au ballon ; au-delà de 2 m/s de côté, les hanches s'ouvrent un peu vers la course ;
      // à reculons, il recule face au jeu
      if (this.speed > 0.2) {
        const off = wrapAngle(Math.atan2(this.vz, this.vx) - target);
        if (Math.abs(off) < 2.2) target += THREE.MathUtils.clamp(off, -0.25, 0.25) * Math.min(1, (this.speed - 0.2) / 0.15);
      }
    } else if (this.speed > 0.05) target = Math.atan2(this.vz, this.vx);
    else if (fx !== undefined) target = Math.atan2(fz - this.z, fx - this.x);
    const diff = wrapAngle(target - this.h);
    // demi-tour : il pivote plus vite (on ne court pas longtemps à reculons), et sur place, presque arrêté (moins de
    // 1,5 m/s), d'un appui (0.8.24 : il repartait avant d'avoir pivoté et courait un instant à reculons) ; une frappe se
    // tourne vite vers sa cible
    const rate = kicking ? TURN * 3 : Math.abs(diff) > 1.6 ? (this.speed < 0.15 ? TURN * 3 : TURN * 1.7) : TURN;
    this.h += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
    // foulée : un cycle complet (deux pas) couvre 1,6 m en marchant, jusqu'à 3,8 m en sprint
    const g = THREE.MathUtils.clamp(this.speed / 0.7, 0, 1);
    this.gait += (g - this.gait) * Math.min(1, dt * 8);
    this.phase += (2 * Math.PI * this.speed * dt) / (0.16 + 0.22 * this.gait);
  }

  forward() { return [Math.cos(this.h), Math.sin(this.h)]; }
  // côté du pied de frappe (+Z local du modèle)
  side() { return [-Math.sin(this.h), Math.cos(this.h)]; }
  facing(x, z) { return Math.abs(wrapAngle(Math.atan2(z - this.z, x - this.x) - this.h)); }
}

// Jeu de passes générique.
// opts : pickReceiver(i) -> j | null · offBall(i, ball, time) -> { x, z, speed } · dribbleTarget(i) -> { x, z }
//        dribble: [min, max] s · dribbleSpeed · canReceive(i) · shoot?(i) -> { x, z } | null
//        goal?: { x } (ligne de but attaquée, +x) · keeper?: indice du gardien
//        clampTarget?(x, z) -> [x, z] : garde les passes dans les limites du terrain
export class PassingGame {
  constructor(agents, opts) {
    this.a = agents;
    this.o = opts;
    this.ball = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, state: 'held', owner: opts.start ?? 0, receiver: -1, timer: 0, roll: 0, rollAxis: new THREE.Vector3(0, 0, 1) };
    this.prev = [0, 0];
    this.hold = null;
    this.give(this.ball.owner, 'dribble');
    const p = this.a[this.ball.owner];
    this.ball.x = p.x; this.ball.z = p.z;
  }

  give(i, phase) {
    const b = this.ball;
    b.state = 'held'; b.owner = i; b.receiver = -1; b.vx = b.vz = b.vy = 0; b.y = 0;
    this.heldFor = 0;
    this.hold = { phase, timer: phase === 'control' ? 0.28 : rand(...this.o.dribble), t: this.o.dribbleTarget(i) };
  }

  footSpot(p, ahead = 0.042) {
    const [fx, fz] = p.forward();
    const [sx, sz] = p.side();
    return [p.x + fx * ahead + sx * 0.012, p.z + fz * ahead + sz * 0.012];
  }

  launch(p, tx, tz, shot) {
    const b = this.ball;
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.max(0.05, Math.hypot(dx, dz));
    // passe : vitesse de départ calculée pour arriver au receveur à ~7,5 m/s malgré le frottement
    let v0 = shot ? this.power || 2.4 : Math.min(1.9, Math.sqrt(ARRIVAL * ARRIVAL + 2 * ROLL_DECEL * d));
    // frappe appuyée (but du direct) : trajectoire tendue qui franchit la ligne en l'air, entre 0 et ~90 cm
    b.vy = shot ? (this.power ? ((GRAVITY * d) / v0 / 2) * (1 + Math.random() * 1.2) : 0.1 + Math.random() * 0.12) : 0;
    this.power = 0;
    if (!shot && d > 3) { // passe longue lobée : temps de vol réaliste, retombe juste devant le receveur
      const T = 0.6 + d * 0.2;
      b.vy = (GRAVITY * T) / 2;
      v0 = (d * 0.8) / T;
    }
    b.vx = (dx / d) * v0; b.vz = (dz / d) * v0;
    b.state = shot ? 'shot' : 'flying';
    b.timer = 0;
  }

  update(dt, time) {
    const { a: A, o, ball: b } = this;
    // --- porteur du ballon : contrôle, conduite, orientation, frappe
    if (b.state === 'held') {
      const p = A[b.owner];
      const h = this.hold;
      this.heldFor += dt;
      if (h.phase === 'control') {
        p.steer(p.x, p.z, 0, dt, b.x, b.z);
        const [sx, sz] = this.footSpot(p);
        b.x += (sx - b.x) * Math.min(1, dt * 10); b.z += (sz - b.z) * Math.min(1, dt * 10);
        if ((h.timer -= dt) <= 0) this.hold = { phase: 'dribble', timer: rand(...o.dribble), t: o.dribbleTarget(b.owner) };
      } else if (h.phase === 'dribble') {
        p.steer(h.t.x, h.t.z, o.dribbleSpeed, dt);
        // petites touches : le ballon part devant puis le joueur le rattrape
        const [sx, sz] = this.footSpot(p, 0.04 + 0.03 * Math.abs(Math.sin(p.phase * 0.5)));
        b.x += (sx - b.x) * Math.min(1, dt * 12); b.z += (sz - b.z) * Math.min(1, dt * 12);
        if ((h.timer -= dt) <= 0) {
          let shot = o.shoot ? o.shoot(b.owner) : null;
          if (this.forceShot) { // but du match en direct : frappe cadrée et appuyée, quoi qu'il arrive
            this.forceShot = false;
            this.power = 3.4;
            shot = { x: (o.goal?.x ?? 5.25) + 0.05, z: rand(-0.22, 0.22) };
          }
          let r = shot ? null : o.pickReceiver(b.owner);
          if (!shot && r === null && this.heldFor > 3) r = this.nearestMate(b.owner); // pas de conduite sans fin
          if (shot || r !== null) this.hold = { phase: 'aim', shot, receiver: r, wait: 0 };
          else this.hold = { phase: 'dribble', timer: rand(...o.dribble), t: o.dribbleTarget(b.owner) };
        }
      } else if (h.phase === 'aim') {
        const R = h.shot ? null : A[h.receiver];
        const tx = h.shot ? h.shot.x : R.x, tz = h.shot ? h.shot.z : R.z;
        p.steer(p.x, p.z, 0, dt, tx, tz);
        const [sx, sz] = this.footSpot(p);
        b.x += (sx - b.x) * Math.min(1, dt * 10); b.z += (sz - b.z) * Math.min(1, dt * 10);
        h.wait += dt;
        if ((p.speed < 0.04 && p.facing(tx, tz) < 0.18) || h.wait > 1.6) {
          p.kick = 0.001;
          this.hold = { ...h, phase: 'kick', spot: [sx, sz] };
        }
      } else if (h.phase === 'kick') {
        const R = h.shot ? null : A[h.receiver];
        p.steer(p.x, p.z, 0, dt, h.shot ? h.shot.x : R.x, h.shot ? h.shot.z : R.z);
        b.x = h.spot[0]; b.z = h.spot[1];
        if (p.kick >= KICK_CONTACT || p.kick === 0) {
          if (h.shot) this.launch(p, h.shot.x, h.shot.z, true);
          else {
            // vise là où le receveur sera à l'arrivée du ballon
            const T = Math.hypot(R.x - b.x, R.z - b.z) / 1.0;
            let [tx, tz] = [R.x + R.vx * T, R.z + R.vz * T];
            if (o.clampTarget) [tx, tz] = o.clampTarget(tx, tz);
            this.launch(p, tx, tz, false);
            b.receiver = h.receiver;
          }
          this.hold = null;
        }
      }
    }

    // --- ballon libre : roule (frottement), rebondit, vole (passe lobée, tir)
    if (b.state === 'flying' || b.state === 'shot' || b.state === 'net') {
      b.timer += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      if (b.y > 0) b.vy -= GRAVITY * dt;
      else {
        b.y = 0;
        if (b.vy < -0.06) { b.vy = -b.vy * 0.3; b.vx *= 0.45; b.vz *= 0.45; } // le rebond amortit
        else b.vy = 0;
        const sp0 = Math.hypot(b.vx, b.vz);
        if (sp0 > 0) {
          const f = Math.max(0, sp0 - (b.state === 'net' ? 1.4 : ROLL_DECEL) * dt) / sp0;
          b.vx *= f; b.vz *= f;
        }
      }
      const sp = Math.hypot(b.vx, b.vz);
      if (b.state === 'shot' && o.goal && b.x >= o.goal.x) {
        // dans les filets (ou à côté) : le ballon meurt derrière la ligne, puis le gardien relance
        b.state = 'net'; b.timer = 0; b.vx *= 0.25; b.vz *= 0.25; b.vy = 0;
      }
      if (b.state === 'net' && b.timer > 1.6) {
        const k = o.keeper ?? 0;
        const [sx, sz] = this.footSpot(A[k]);
        b.x = sx; b.z = sz;
        this.give(k, 'dribble');
      } else if (b.state === 'flying') {
        if (b.receiver < 0 || sp < 0.03) b.receiver = this.nearest(b.x, b.z);
        const R = A[b.receiver];
        const [fx, fz] = R.forward();
        if (Math.hypot(b.x - (R.x + fx * 0.035), b.z - (R.z + fz * 0.035)) < 0.065 && b.y < 0.06) {
          this.give(b.receiver, 'control');
        }
      } else if (b.state === 'shot' && b.timer > 3) {
        b.state = 'net'; b.timer = 1.6; // tir perdu : relance
      }
    }
    // rotation du ballon : roule dans le sens de son déplacement (conduite comprise)
    const mx = b.x - this.prev[0], mz = b.z - this.prev[1];
    const moved = Math.hypot(mx, mz);
    if (moved > 1e-5 && b.y < 0.01) { b.roll += moved / BALL_R; b.rollAxis.set(mz, 0, -mx).normalize(); }
    this.prev = [b.x, b.z];

    // --- joueurs sans ballon : receveur vers la trajectoire, les autres selon le schéma
    A.forEach((ag, i) => {
      if (b.state === 'held' && i === b.owner) return;
      if (b.state === 'flying' && i === b.receiver) {
        const sp = Math.hypot(b.vx, b.vz);
        let tx = b.x, tz = b.z;
        if (sp > 0.25) { // point de la trajectoire le plus proche du receveur
          const t = Math.max(0, ((ag.x - b.x) * b.vx + (ag.z - b.z) * b.vz) / (sp * sp));
          tx = b.x + b.vx * t; tz = b.z + b.vz * t;
        }
        const [fx, fz] = ag.forward();
        // pas de limite ici : le receveur doit pouvoir aller chercher un ballon sorti
        ag.steer(tx - fx * 0.03, tz - fz * 0.03, sp > 0.25 ? 0.38 : 0.5, dt, b.x, b.z);
        return;
      }
      const t = o.offBall(i, b, time);
      ag.steer(t.x, t.z, t.speed, dt, t.fx ?? b.x, t.fz ?? b.z);
    });

    // --- progression des frappes (elles se terminent même après le départ du ballon)
    A.forEach((ag) => { if (ag.kick > 0) { ag.kick += dt / KICK_TIME; if (ag.kick >= 1) ag.kick = 0; } });
  }

  nearestMate(i) {
    let best = null, bd = Infinity;
    this.a.forEach((ag, j) => {
      if (j === i || (this.o.canReceive && !this.o.canReceive(j))) return;
      const d = Math.hypot(ag.x - this.a[i].x, ag.z - this.a[i].z);
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }

  nearest(x, z) {
    let best = 0, bd = Infinity;
    this.a.forEach((ag, i) => {
      if (this.o.canReceive && !this.o.canReceive(i)) return;
      const d = Math.hypot(ag.x - x, ag.z - z);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
}

// Ballon : icosaèdre à facettes sombres et claires (lecture du roulement), mis à l'échelle du jeu.
export function createBallMesh() {
  const geo = new THREE.IcosahedronGeometry(BALL_R, 1); // déjà une face par triangle (non indexé)
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let f = 0; f < n / 3; f++) {
    const c = f % 5 === 0 ? 0.08 : 0.95;
    for (let v = 0; v < 3; v++) col.set([c, c, c], (f * 3 + v) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, flatShading: true }));
  mesh.castShadow = true;
  return mesh;
}

const qRoll = new THREE.Quaternion();
export function placeBall(mesh, ball, baseY) {
  mesh.position.set(ball.x, baseY + BALL_R + ball.y, ball.z);
  if (ball.roll) { // rotation incrémentale : pas de saut quand la direction change
    qRoll.setFromAxisAngle(ball.rollAxis, ball.roll);
    mesh.quaternion.premultiply(qRoll);
    ball.roll = 0;
  }
}
