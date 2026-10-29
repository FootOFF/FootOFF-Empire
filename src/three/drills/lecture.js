import { t } from '../../i18n/index';
import * as THREE from 'three';
import { KITS } from './stage';
import { agent, clamp01, easeInOut, rnd } from './kit';

// Lecture du jeu (tactique et mental), sur la tablette de l'analyste : six actions figées vues d'en haut ; le
// porteur du ballon (nos couleurs) a trois partenaires numérotés. Une seule passe est la bonne : les autres sont
// coupées par un défenseur placé sur la trajectoire, ou leur receveur est marqué de près. Choisir vite rapporte
// plus ; l'action reprend alors un instant pour montrer la passe (réussie ou interceptée).

const M = 0.1; // mètres -> unités du jeu
const SITUATIONS = 6;
const LIMIT = 5; // secondes pour choisir
export const LECTURE_MAX = 100 * SITUATIONS;
const DEG = Math.PI / 180;

// distance d'un point au segment [a, b] (plan du terrain)
function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp01(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// Une action jouable (en mètres) : une seule bonne passe, chaque mauvaise coupée ou son receveur marqué.
// Le tirage ne renvoie jamais rien : 200 essais aux contraintes pleines, puis des contraintes d'espacement relâchées
// (un tirage sur quarante n'aboutissait pas, et l'épreuve se figeait à la situation suivante), puis la meilleure
// configuration rencontrée (celle qui respecte le plus de contraintes).
const TRIES = 200;
function makeSituation() {
  let fallback = null;
  let fallbackScore = -1;
  for (let tries = 0; tries < TRIES * 4; tries++) {
    const relax = tries >= TRIES ? 0.75 : 1; // au-delà des essais stricts, les distances minimales baissent d'un quart
    const C = { x: rnd(-13, 13), z: rnd(25, 32) };
    const angles = [-64, -30, 4, 36, 66].sort(() => Math.random() - 0.5).slice(0, 3).sort((a, b) => a - b);
    const opts = angles.map((a) => {
      const d = rnd(10, 18);
      return { x: THREE.MathUtils.clamp(C.x + Math.sin(a * DEG) * d, -30, 30), z: Math.max(7, C.z - Math.cos(a * DEG) * d * 0.95) };
    });
    if (opts.some((o, i) => opts.some((q, j) => i < j && Math.hypot(o.x - q.x, o.z - q.z) < 7))) continue;
    const best = Math.floor(Math.random() * 3);
    const defs = [];
    const traps = [];
    opts.forEach((o, i) => {
      if (i === best) return;
      const lane = Math.random() < 0.55;
      const dx = o.x - C.x, dz = o.z - C.z, len = Math.hypot(dx, dz);
      const px = -dz / len, pz = dx / len;
      if (lane) {
        const t = rnd(0.42, 0.66), off = rnd(-0.6, 0.6);
        defs.push({ x: C.x + dx * t + px * off, z: C.z + dz * t + pz * off });
      } else {
        const off = rnd(-0.5, 0.5);
        defs.push({ x: o.x - (dx / len) * 1.1 + px * off, z: o.z - (dz / len) * 1.1 + pz * off });
      }
      traps[i] = { kind: lane ? 'lane' : 'mark', d: defs.length - 1 };
    });
    // pressing sur le porteur, défenseurs plus loin dans le bloc
    defs.push({ x: C.x + rnd(-2.5, 2.5), z: C.z - rnd(2.2, 3.2) });
    defs.push({ x: rnd(-9, 9), z: rnd(9, 14) });
    defs.push({ x: rnd(-18, 18), z: rnd(13, 20) });
    const B = opts[best];
    const okBest = defs.every((d) => segDist(d, C, B) >= 3.2 * relax && Math.hypot(d.x - B.x, d.z - B.z) >= 4.5 * relax);
    const okTraps = opts.every((o, i) => i === best || defs.some((d) => segDist(d, C, o) <= 1.0 || Math.hypot(d.x - o.x, d.z - o.z) <= 1.5));
    const all = [C, ...opts, ...defs];
    const apart = all.every((p, i) => all.every((q, j) => i >= j || Math.hypot(p.x - q.x, p.z - q.z) >= 1.3 * relax));
    const sit = { C, opts, defs, best, traps };
    if (okBest && okTraps && apart) return sit;
    const score = (okTraps ? 2 : 0) + (okBest ? 1 : 0) + (apart ? 1 : 0); // la bonne passe doit rester la seule : les pièges d'abord
    if (score > fallbackScore) { fallbackScore = score; fallback = sit; }
  }
  return fallback;
}

export function createReading(stage, ctx) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;
  const P = stage.players;
  // 0 porteur, 1 à 3 partenaires, 4 soutien ; 5 à 9 défenseurs (chasubles) ; 10 gardien adverse
  for (let i = 0; i <= 4; i++) P.setKit(i, KITS.ours);
  for (let i = 5; i <= 9; i++) P.setKit(i, KITS.rival); // l'opposition en chasubles bleues, bien distinctes de notre or
  P.setKit(10, KITS.keeper);
  const agents = Array.from({ length: 11 }, () => agent(0, 0));
  const shadows = agents.map(() => stage.addShadow(0.07, 0.42, group));
  const ball = stage.addBall(group);
  const rings = [1, 2, 3].map(() => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.11, 0.11).rotateX(-Math.PI / 2)), keep(stage.ringMaterial(0xdec17f)));
    m.renderOrder = 4;
    group.add(m);
    return m;
  });
  const lanes = [1, 2, 3].map(() => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 0.012).rotateX(-Math.PI / 2)), keep(stage.beamMaterial(0xffffff, { dash: 0.035, opacity: 0.55 })));
    m.renderOrder = 4;
    group.add(m);
    return m;
  });

  const s = { k: -1, phase: 'intro', t: 0, points: 0, good: 0, sit: null, sel: -1, choice: -1, anim: null, marksAt: 0 };
  const tmp = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);
  const u = (p) => ({ x: p.x * M, z: p.z * M });

  // plan de la tablette : vue plongeante (58°) qui cadre le porteur, ses trois partenaires et les défenseurs proches
  const FRAME = { v: 36, h: 42 };
  function camFor(sit) {
    const pts = [sit.C, ...sit.opts, ...sit.defs.slice(0, 3)].map(u);
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minZ = Math.min(...pts.map((p) => p.z)), maxZ = Math.max(...pts.map((p) => p.z));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const aspect = Math.max(0.3, stage.camera.aspect || 1.5);
    const vf = Math.max(FRAME.v, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FRAME.h) / 2) / aspect)));
    const tv = Math.tan(THREE.MathUtils.degToRad(vf) / 2);
    const th = tv * aspect;
    const a = 58 * DEG;
    const dist = Math.max(((maxX - minX) / 2 + 0.28) / th, (((maxZ - minZ) / 2) * Math.sin(a) + 0.3) / tv, 1.6);
    return { pos: new THREE.Vector3(cx, Math.sin(a) * dist, cz + Math.cos(a) * dist), look: new THREE.Vector3(cx, 0, cz) };
  }

  function place(sit) {
    const C = u(sit.C);
    agents.forEach((a, i) => { a.gait = rnd(0.55, 0.85); a.phase = rnd(0, Math.PI * 2); a.kick = 0; a.cheer = 0; a.roll = 0; a.lift = 0; });
    Object.assign(agents[0], { x: C.x, z: C.z, h: -Math.PI / 2 });
    sit.opts.forEach((o, i) => { const p = u(o); Object.assign(agents[1 + i], { x: p.x, z: p.z, h: -Math.PI / 2 + rnd(-0.4, 0.4) }); });
    Object.assign(agents[4], { x: C.x + rnd(-0.6, 0.6), z: C.z + rnd(0.7, 1.1), h: -Math.PI / 2 });
    sit.defs.slice(0, 5).forEach((d, i) => { const p = u(d); Object.assign(agents[5 + i], { x: p.x, z: p.z, h: Math.atan2(C.z - p.z, C.x - p.x) }); });
    Object.assign(agents[10], { x: rnd(-0.05, 0.05), z: 0.06, h: Math.PI / 2, gait: 0.15 });
    ball.set(C.x, 0, C.z - 0.035);
    sit.opts.forEach((o, i) => {
      const p = u(o);
      rings[i].position.set(p.x, 0.002, p.z);
      rings[i].material.uniforms.uColor.value.set(0xdec17f);
      rings[i].material.uniforms.uFlash.value = 0;
      const dx = p.x - C.x, dz = p.z - C.z, len = Math.hypot(dx, dz);
      const l = lanes[i];
      l.scale.set(len - 0.06, 1, 1);
      l.position.set((p.x + C.x) / 2, 0.0022, (p.z + C.z) / 2);
      l.rotation.y = -Math.atan2(dz, dx);
      l.material.uniforms.uLen.value = len;
      l.material.uniforms.uColor.value.set(0xffffff);
      l.material.uniforms.uOpacity.value = 0.5;
    });
  }

  function hud(extra = {}) {
    const live = s.phase === 'choose';
    ctx.hud({
      round: Math.max(1, s.k + 1), rounds: SITUATIONS, points: s.points, max: LECTURE_MAX,
      prompt: live ? t('Trouve la bonne passe') : '', action: live, timer: live ? clamp01(1 - s.t / LIMIT) : null, ...extra,
    });
  }
  function marks() { // numéros des partenaires, à l'écran (au-dessus de leur tête)
    return s.sit.opts.map((o, i) => { const p = u(o); const at = stage.toScreen(tmp.set(p.x, 0.24, p.z)); return { n: i + 1, x: at.x, y: at.y, on: s.sel === i }; });
  }

  function setup(k) {
    s.k = k;
    s.sit = makeSituation();
    s.sel = -1;
    s.choice = -1;
    s.anim = null;
    place(s.sit);
    const c = camFor(s.sit);
    stage.camTo(c.pos, c.look, k === 0 ? 0.01 : 0.7, FRAME);
    s.phase = 'ready';
    s.t = 0;
    hud({ marks: [] });
  }

  function choose(i) {
    if (s.phase !== 'choose' || i < 0 || i > 2) return;
    s.choice = i;
    s.sel = i;
    const right = i === s.sit.best;
    const pts = right ? Math.round(50 + 50 * clamp01(1 - s.t / LIMIT)) : 0;
    s.points += pts;
    if (right) s.good += 1;
    const C = u(s.sit.C);
    const R = u(s.sit.opts[i]);
    const trap = s.sit.traps[i];
    let stop = R;
    let thief = -1;
    if (!right && trap) {
      const d = u(s.sit.defs[trap.d]);
      thief = 5 + trap.d;
      if (trap.kind === 'lane') { // interception sur la trajectoire
        const dx = R.x - C.x, dz = R.z - C.z;
        const t = clamp01(((d.x - C.x) * dx + (d.z - C.z) * dz) / (dx * dx + dz * dz));
        stop = { x: C.x + dx * t, z: C.z + dz * t };
      } else stop = { x: R.x + (d.x - R.x) * 0.5, z: R.z + (d.z - R.z) * 0.5 };
    }
    s.anim = { t: 0, from: { x: C.x, z: C.z - 0.035 }, stop, thief, right, text: right ? (pts >= 90 ? t('Lecture parfaite') : t('Bonne lecture')) : trap?.kind === 'lane' ? t('Passe interceptée') : t('Receveur marqué'), pts };
    s.phase = 'pass';
    s.t = 0;
    lanes[i].material.uniforms.uColor.value.set(right ? 0xdec17f : 0xe07a6f);
    lanes[i].material.uniforms.uOpacity.value = 1;
    rings[i].material.uniforms.uColor.value.set(right ? 0xdec17f : 0xe07a6f);
    agents[0].kick = 0.001;
    ctx.sfx('kick');
    hud({ marks: [] });
  }

  return {
    intro() {
      setup(0);
      s.phase = 'intro';
      const c = camFor(s.sit);
      stage.camSet(tmp.copy(c.pos).add(new THREE.Vector3(1.2, -1.1, 1.4)), c.look, { v: 34, h: 42 });
      stage.camTo(c.pos, c.look, 3.2, FRAME);
    },
    start() { s.phase = 'ready'; s.t = 0; hud(); },
    press(e) {
      if (s.phase !== 'choose') return;
      if (e?.index != null) { choose(e.index); return; }
      if (e?.pointer) { // le partenaire le plus proche du doigt (à 90 px près)
        const m = marks();
        let best = -1;
        let bd = 90;
        m.forEach((p, i) => {
          const foot = stage.toScreen(tmp.set(u(s.sit.opts[i]).x, 0.0, u(s.sit.opts[i]).z));
          const d = Math.min(Math.hypot(p.x - e.x, p.y - e.y), Math.hypot(foot.x - e.x, foot.y - e.y), Math.hypot((p.x + foot.x) / 2 - e.x, (p.y + foot.y) / 2 - e.y));
          if (d < bd) { bd = d; best = i; }
        });
        if (best >= 0) choose(best);
        return;
      }
      if (s.sel >= 0) choose(s.sel);
    },
    dir(d) {
      if (s.phase !== 'choose') return;
      // de gauche à droite à l'écran
      const order = s.sit.opts.map((o, i) => [stage.toScreen(tmp.set(u(o).x, 0, u(o).z)).x, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
      const at = order.indexOf(s.sel);
      if (d === 'left') s.sel = order[Math.max(0, at < 0 ? order.length - 1 : at - 1)];
      else if (d === 'right') s.sel = order[Math.min(order.length - 1, at < 0 ? 0 : at + 1)];
      ctx.sfx('lock');
      hud({ marks: marks() });
    },
    update(dt) {
      s.t += dt;
      rings.forEach((r) => { r.material.uniforms.uTime.value = stage.time; });
      lanes.forEach((l) => { l.material.uniforms.uTime.value = stage.time; });
      if (s.phase === 'ready' && !stage.camMoving && s.t > 0.2) { s.phase = 'choose'; s.t = 0; hud({ marks: marks() }); }
      if (s.phase === 'choose') {
        rings.forEach((r, i) => { r.material.uniforms.uOn.value = s.sel === i ? 1 : 0.6; });
        if (Math.floor(s.t * 10) !== Math.floor((s.t - dt) * 10)) hud({ marks: marks() });
        if (s.t >= LIMIT) { // temps écoulé : passe perdue
          s.phase = 'pass';
          s.anim = { t: 0, from: null, timeout: true, text: t('Trop tard'), pts: 0 };
          s.t = 0;
          hud({ marks: [] });
        }
      }
      if (s.phase === 'pass') {
        const a = s.anim;
        a.t += dt;
        // l'action reprend : chacun avance un peu, le ballon file vers le receveur (ou l'intercepteur)
        if (a.from) {
          const k = easeInOut(clamp01(a.t / 0.55));
          ball.set(a.from.x + (a.stop.x - a.from.x) * k, Math.sin(k * Math.PI) * 0.004, a.from.z + (a.stop.z - a.from.z) * k);
          ball.spin(spin, dt * 25);
          agents.forEach((ag, i) => {
            if (i === 10) return;
            const sp = i < 5 ? 0.25 : 0.2;
            const fwd = i < 5 ? -1 : 1;
            if (i === a.thief) { ag.x += (a.stop.x - ag.x) * Math.min(1, dt * 5); ag.z += (a.stop.z - ag.z) * Math.min(1, dt * 5); ag.phase += dt * 9; return; }
            ag.z += fwd * sp * dt * 0.4;
            ag.phase += dt * 7 * ag.gait;
          });
          agents[0].kick = Math.min(1, agents[0].kick + dt / 0.5);
          if (a.t > 0.55 && !a.done) {
            a.done = true;
            ctx.pop({ text: a.text, points: a.pts ? `+${a.pts}` : '0', tone: a.right ? (a.pts >= 90 ? 'gold' : 'good') : 'bad', at: stage.toScreen(tmp.set(a.stop.x, 0.2, a.stop.z)) });
            ctx.sfx(a.right ? 'good' : 'bad');
            if (a.right) stage.burst(tmp.set(a.stop.x, 0.02, a.stop.z), { count: 30, color: 0xdec17f, speed: 0.08, up: 0.06 });
            hud();
          }
        } else if (!a.done) {
          a.done = true;
          ctx.pop({ text: a.text, points: '0', tone: 'bad', at: stage.toScreen(tmp.set(agents[0].x, 0.22, agents[0].z)) });
          ctx.sfx('bad');
          hud();
        }
        if (a.t > 1.3) {
          agents[0].kick = 0;
          if (s.k + 1 < SITUATIONS) setup(s.k + 1);
          else { s.phase = 'done'; ctx.end(s.points / LECTURE_MAX, { good: s.good, total: SITUATIONS }); }
        }
      }
      agents.forEach((ag, i) => {
        P.setAgent(i, ag, 0);
        shadows[i].position.set(ag.x + 0.005, 0.0015, ag.z + 0.005);
      });
      P.commit(agents.length);
      if (s.phase === 'done') ball.hide();
    },
    get debug() { return s; },
    dispose() { stage.scene.remove(group); },
  };
}
