import { t } from '../../i18n/index';
import * as THREE from 'three';
import { GOAL, KITS } from './stage';
import { agent, clamp01, easeInOut, rnd, walkTo } from './kit';

// Contre-attaque (tactique et mental, niveau 5) : quatre contres à trois contre deux, lancés à pleine vitesse. Deux
// décisions par contre, au ralenti : la passe à gauche, la passe à droite ou le tir. La bonne dépend des défenseurs :
// celui qui sort sur le porteur libère son partenaire ; ensuite, si le dernier défenseur ferme le porteur, la passe à
// l'attaquant axial est la bonne, s'il coupe la passe, il faut tirer. Décider vite rapporte plus ; une erreur et le
// contre s'arrête. Caméra haute derrière l'action, qui la suit.

const ATTACKS = 4;
export const COUNTER_MAX = 100 * ATTACKS;
const LIMIT = 1.8; // secondes (réelles) pour décider, au ralenti
const SLOW = 0.22; // vitesse du jeu pendant une décision
const FRAME = { v: 40, h: 62 }; // les trois attaquants toujours dans le plan

export function createCounter(stage, ctx) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;
  const P = stage.players;
  // 0 à 2 nos attaquants (gauche, axe, droite), 3 et 4 les défenseurs, 5 le gardien
  const atk = [0, 1, 2].map(() => agent(0, 0));
  const def = [0, 1].map(() => agent(0, 0, Math.PI / 2));
  const keeper = agent(0, 0.05, Math.PI / 2);
  [0, 1, 2].forEach((i) => P.setKit(i, KITS.ours));
  P.setKit(3, KITS.rival); P.setKit(4, KITS.rival); P.setKit(5, KITS.keeper);
  const people = [...atk, ...def, keeper];
  const shadows = people.map(() => stage.addShadow(0.07, 0.45, group));
  const ball = stage.addBall(group);
  const lanes = [0, 1].map(() => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 0.012).rotateX(-Math.PI / 2)), keep(stage.beamMaterial(0xffffff, { dash: 0.035, opacity: 0.6 })));
    m.renderOrder = 4;
    m.visible = false;
    group.add(m);
    return m;
  });

  const s = {
    k: -1, phase: 'intro', t: 0, points: 0, goals: 0, carrier: 1, cfg: null, choice: null, anim: null,
    decision: 0, decT: 0, camZ: 4.5, slow: 1,
  };
  const tmp = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);

  function hud(extra = {}) {
    const live = s.phase === 'dec';
    ctx.hud({
      round: Math.max(1, s.k + 1), rounds: ATTACKS, points: s.points, max: COUNTER_MAX,
      prompt: live ? (s.decision === 1 ? t('Qui est libre ?') : t('Passe ou tir ?')) : s.phase === 'run' ? t('Contre-attaque !') : '',
      action: live, timer: live ? clamp01(1 - s.decT / LIMIT) : null, marks: live ? marks() : [], ...extra,
    });
  }
  // repères des choix, à l'écran : 1 à gauche, 2 à droite, « Tir » sur le but
  function marks() {
    const out = [];
    options().forEach((o) => {
      if (o.kind === 'shoot') { const at = stage.toScreen(tmp.set(0, GOAL.h + 0.05, 0)); out.push({ n: 'Tir', x: at.x, y: at.y }); return; }
      const a = atk[o.to];
      const at = stage.toScreen(tmp.set(a.x, 0.24, a.z));
      out.push({ n: o.key === 'left' ? 1 : 2, x: at.x, y: at.y });
    });
    return out;
  }
  // les choix possibles : passe aux partenaires (à gauche / à droite du porteur à l'écran), tir (dans les 25 m)
  function options() {
    const c = atk[s.carrier];
    const mates = [0, 1, 2].filter((i) => i !== s.carrier).sort((a, b) => atk[a].x - atk[b].x);
    const out = [{ kind: 'pass', key: 'left', to: mates[0] }, { kind: 'pass', key: 'right', to: mates[1] }];
    if (c.z < 2.6) out.push({ kind: 'shoot', key: 'shoot' });
    return out;
  }

  function setup(k) {
    s.k = k;
    const x0 = rnd(-0.6, 0.6);
    const pos = [[x0 - 1.3, 5.0], [x0, 5.2], [x0 + 1.3, 5.0]];
    atk.forEach((a, i) => Object.assign(a, { x: pos[i][0], z: pos[i][1], h: -Math.PI / 2, gait: 0.6, kick: 0, cheer: 0 }));
    def.forEach((d, i) => Object.assign(d, { x: x0 + (i ? 0.55 : -0.55), z: 3.75, h: Math.PI / 2, gait: 0.3 }));
    Object.assign(keeper, { x: 0, z: 0.05, h: Math.PI / 2, roll: 0, lift: 0, cheer: 0 });
    s.carrier = 1;
    // sortie du premier défenseur (gauche ou droite), puis le dernier ferme le porteur ou coupe la passe
    s.cfg = { press: Math.random() < 0.5 ? 0 : 1, close: Math.random() < 0.5 };
    s.decision = 0;
    s.choice = null;
    s.anim = null;
    s.phase = 'run';
    s.t = 0;
    s.camZ = 5.6;
    lanes.forEach((l) => { l.visible = false; });
    hud();
  }

  function decide(key) {
    if (s.phase !== 'dec') return;
    const opts = options();
    const o = opts.find((x) => x.key === key);
    if (!o) return;
    const c = atk[s.carrier];
    let right;
    let text;
    if (s.decision === 1) {
      const free = s.cfg.press === 0 ? 'left' : 'right'; // le défenseur sorti a laissé son partenaire seul
      right = o.kind === 'pass' && o.key === free;
      text = right ? t('Bien vu') : o.kind === 'pass' ? t('Passe interceptée') : t('Ballon perdu');
    } else {
      const axial = 1; // l'attaquant de l'axe
      right = s.cfg.close ? (o.kind === 'pass' && o.to === axial) : o.kind === 'shoot';
      text = right ? (o.kind === 'shoot' ? t('Frappe décisive') : t('Passe décisive')) : o.kind === 'shoot' ? t('Tir contré') : t('Passe coupée');
    }
    const speed = clamp01(1 - s.decT / LIMIT);
    const pts = right ? Math.round(50 * (0.7 + 0.3 * speed)) : 0;
    s.points += pts;
    s.choice = { o, right, text, pts };
    // animation : la passe (réussie ou coupée), le tir (au fond, ou contré)
    const from = new THREE.Vector3(c.x, 0, c.z - 0.03);
    let to;
    let thief = null;
    if (o.kind === 'pass') {
      const r = atk[o.to];
      to = new THREE.Vector3(r.x, 0, r.z - 0.08);
      if (!right) { thief = def.reduce((b, d) => (!b || Math.hypot(d.x - to.x, d.z - to.z) < Math.hypot(b.x - to.x, b.z - to.z) ? d : b), null); to.lerp(new THREE.Vector3(thief.x, 0, thief.z), 0.7); }
    } else {
      to = right ? new THREE.Vector3((c.x > 0 ? -1 : 1) * rnd(0.22, 0.3), 0.1, -0.05) : new THREE.Vector3(def[1 - s.cfg.press].x, 0.05, def[1 - s.cfg.press].z);
    }
    s.anim = { t: 0, from, to, kind: o.kind, thief, receiver: o.kind === 'pass' && right ? o.to : null };
    s.phase = 'play';
    s.t = 0;
    s.slow = 1;
    lanes.forEach((l) => { l.visible = false; });
    ctx.sfx('kick');
    ctx.pop({ text, points: pts ? `+${pts}` : '0', tone: right ? (speed > 0.6 ? 'gold' : 'good') : 'bad', at: stage.toScreen(tmp.set(to.x, 0.22, to.z)) });
    ctx.sfx(right ? 'good' : 'bad');
    hud();
  }

  function showLanes() {
    const c = atk[s.carrier];
    options().filter((o) => o.kind === 'pass').forEach((o, i) => {
      const r = atk[o.to];
      const dx = r.x - c.x, dz = r.z - c.z, len = Math.hypot(dx, dz);
      const l = lanes[i];
      l.visible = true;
      l.scale.set(len - 0.05, 1, 1);
      l.position.set((r.x + c.x) / 2, 0.0022, (r.z + c.z) / 2);
      l.rotation.y = -Math.atan2(dz, dx);
      l.material.uniforms.uLen.value = len;
    });
  }

  return {
    intro() {
      setup(0);
      s.phase = 'intro';
      stage.camSet(new THREE.Vector3(1.6, 0.9, 7.2), new THREE.Vector3(0, 0, 4.0), { v: 36, h: 46 });
      stage.camTo(new THREE.Vector3(0, 1.7, s.camZ + 2.3), new THREE.Vector3(0, 0, s.camZ - 0.55), 3.0, FRAME); // le plan de suivi, sans saut
    },
    start() { s.phase = 'run'; s.t = 0; hud(); },
    press(e) {
      if (s.phase !== 'dec') return;
      if (e?.index === 0) decide('left');
      else if (e?.index === 1) decide('right');
      else if (e?.index === 2) decide('shoot');
      else if (e?.pointer) { // le repère le plus proche du doigt
        let best = null;
        let bd = 110;
        marks().forEach((m) => { const d = Math.hypot(m.x - e.x, m.y - e.y); if (d < bd) { bd = d; best = m; } });
        if (best) decide(best.n === 'Tir' ? 'shoot' : best.n === 1 ? 'left' : 'right');
      } else if (options().some((o) => o.kind === 'shoot')) decide('shoot');
    },
    dir(d) { if (d === 'left' || d === 'right') decide(d); else if (d === 'up') decide('shoot'); },
    update(rawDt) {
      // ralenti pendant une décision : le temps du jeu passe moins vite, celui de la décision à vitesse réelle
      s.slow += ((s.phase === 'dec' ? SLOW : 1) - s.slow) * Math.min(1, rawDt * 10);
      const dt = rawDt * s.slow;
      s.t += dt;
      const c = atk[s.carrier];
      if (s.phase === 'run' || s.phase === 'dec') {
        // les attaquants filent vers le but ; le porteur conduit ; les défenseurs reculent, l'un d'eux sort
        atk.forEach((a, i) => {
          const tx = i === s.carrier ? a.x * 0.98 : a.x + (i === 1 ? 0 : (i === 0 ? 0.08 : -0.08)) * dt;
          walkTo(a, tx, a.z - 0.65 * dt * 3, 0.65, dt, -Math.PI / 2);
        });
        def.forEach((d, i) => {
          const press = s.decision === 0 && i === s.cfg.press ? 1 : 0;
          const last = s.decision === 1 && i !== s.cfg.press;
          if (press) walkTo(d, c.x + (i ? 0.08 : -0.08), c.z - 0.35, 0.5, dt, Math.atan2(c.z - d.z, c.x - d.x));
          else if (last && s.cfg.close) walkTo(d, c.x, c.z - 0.28, 0.55, dt, Math.atan2(c.z - d.z, c.x - d.x));
          else if (last) { const ax = atk[1]; walkTo(d, (c.x + ax.x) / 2, (c.z + ax.z) / 2 - 0.05, 0.55, dt, Math.atan2(c.z - d.z, c.x - d.x)); } else if (s.decision === 1) {
            // le défenseur sorti au milieu revient couvrir l'attaquant du côté opposé
            const far = atk[s.carrier === 0 ? 2 : 0];
            walkTo(d, far.x + (far.x > c.x ? -0.06 : 0.06), far.z - 0.12, 0.7, dt, Math.atan2(c.z - d.z, c.x - d.x));
          } else walkTo(d, d.x * 0.995, Math.max(1.6, d.z - 0.2 * dt), 0.25, dt, Math.PI / 2);
        });
        ball.set(c.x - 0.01, 0, c.z - 0.045);
        ball.spin(spin, dt * 14);
        // moments de décision : au milieu (premier défenseur sorti), puis à l'entrée de la surface
        if (s.phase === 'run' && ((s.decision === 0 && c.z < 4.3) || (s.decision === 1 && c.z < 2.45))) {
          s.decision += 1;
          s.phase = 'dec';
          s.decT = 0;
          showLanes();
          hud();
        }
      }
      if (s.phase === 'dec') {
        s.decT += rawDt;
        if (Math.floor(s.decT * 8) !== Math.floor((s.decT - rawDt) * 8)) hud();
        lanes.forEach((l) => { l.material.uniforms.uTime.value = stage.time; });
        if (s.decT >= LIMIT) { // trop tard : le porteur est pris
          s.choice = { right: false, text: t('Trop tard'), pts: 0 };
          s.anim = null;
          s.phase = 'play';
          s.t = 0;
          s.slow = 1;
          lanes.forEach((l) => { l.visible = false; });
          ctx.pop({ text: t('Trop tard'), points: '0', tone: 'bad', at: stage.toScreen(tmp.set(c.x, 0.22, c.z)) });
          ctx.sfx('bad');
          hud();
        }
      }
      if (s.phase === 'play') {
        const a = s.anim;
        if (a) {
          a.t = Math.min(1, a.t + dt / (a.kind === 'shoot' ? 0.45 : 0.55));
          const k = easeInOut(a.t);
          ball.set(a.from.x + (a.to.x - a.from.x) * k, a.kind === 'shoot' ? (a.to.y || 0) * k + Math.sin(k * Math.PI) * 0.02 : 0, a.from.z + (a.to.z - a.from.z) * k);
          ball.spin(spin, dt * 30);
          if (a.thief) { a.thief.x += (a.to.x - a.thief.x) * Math.min(1, dt * 6); a.thief.z += (a.to.z - a.thief.z) * Math.min(1, dt * 6); }
          atk.forEach((p) => walkTo(p, p.x, p.z - 0.5 * dt, 0.5, dt, -Math.PI / 2));
          if (a.t >= 1 && !a.done) {
            a.done = true;
            if (a.kind === 'shoot' && s.choice.right) { stage.netHit(tmp.set(a.to.x, a.to.y, -GOAL.depth), 1); ctx.sfx('net'); stage.burst(tmp.set(a.to.x, a.to.y, 0.01), { count: 50, color: 0xffe3a0, speed: 0.12 }); s.goals += 1; }
            if (a.receiver !== null) {
              s.carrier = a.receiver;
              if (s.decision === 2) { // passe décisive : l'attaquant axial pousse le ballon au fond
                const r = atk[a.receiver];
                s.anim = { t: 0, from: new THREE.Vector3(r.x, 0, r.z), to: new THREE.Vector3(r.x * 0.3 + rnd(-0.1, 0.1), 0.06, -0.05), kind: 'shoot', thief: null, receiver: null, tapIn: true };
                return;
              }
              s.phase = 'run';
              s.t = 0;
              hud();
              return;
            }
            if (a.tapIn) { stage.netHit(tmp.set(a.to.x, a.to.y, -GOAL.depth), 1); ctx.sfx('net'); s.goals += 1; }
          }
        }
        if (!a || a.done) {
          s.after = (s.after || 0) + rawDt;
          if (s.after > 1.1) {
            s.after = 0;
            if (s.k + 1 < ATTACKS) setup(s.k + 1);
            else { s.phase = 'done'; ball.hide(); ctx.end(s.points / COUNTER_MAX, { goals: s.goals, attacks: ATTACKS }); }
          }
        }
      }
      // caméra haute derrière l'action, qui suit le ballon
      const bz = ball.mesh.position.z;
      s.camZ += (bz - s.camZ) * Math.min(1, rawDt * 2.5);
      if (s.phase !== 'intro' && !stage.camMoving) {
        const mid = (Math.min(...atk.map((a) => a.x)) + Math.max(...atk.map((a) => a.x))) / 2;
        stage.camSet(tmp.set(mid * 0.6, 1.7, s.camZ + 2.3), new THREE.Vector3(mid * 0.7, 0, s.camZ - 0.55), FRAME);
      }
      keeper.x += (THREE.MathUtils.clamp(ball.mesh.position.x * 0.3, -0.2, 0.2) - keeper.x) * Math.min(1, rawDt * 3);
      people.forEach((p, i) => {
        P.setAgent(i, p, 0);
        shadows[i].position.set(p.x + 0.006, 0.0015, p.z + 0.006);
      });
      P.commit(people.length);
    },
    get debug() { return s; },
    dispose() { stage.scene.remove(group); },
  };
}
