import { fmtNum, t } from '../../i18n/index';
import * as THREE from 'three';
import { BALL_R, GOAL, KITS, PITCH } from './stage';
import { agent, bezier, clamp01, cones, easeOut, rnd, walkTo } from './kit';

// Épreuves de gardien, en vue subjective : la caméra est le gardien, ses gants au bas de l'écran ; un seul plongeon
// par tir.
// - Arrêts réflexes : huit tirs de 11 à 17 m, de plus en plus forts et variés (à ras de terre, à mi-hauteur, en
//   lucarne, enroulés), du côté gauche ou droit au hasard. On plonge vers un point précis : au doigt, on touche
//   l'endroit où part le ballon (en haut pour un tir haut, en bas pour un tir à ras de terre) ; au clavier et à la
//   manette, gauche ou droite (avec haut pour un tir haut), haut seul pour sauter, bas pour rester au sol. Les mains
//   mettent plus de temps à couvrir un coin qu'à rester au centre : à l'arrivée du ballon, leur distance au ballon
//   donne « Capté », « Claqué » ou « Du bout des gants » (ralenti sur un arrêt serré), avec le temps de réaction ;
//   plonger avant la frappe est un pari (« Bien deviné », moins de points). Un tir dans l'axe sans bouger est arrêté.
// - Penalties (niveau 3) : six tirs au but, trop rapides pour réagir après la frappe. Juste avant de frapper, le
//   tireur se tourne vers son côté : plonger à ce moment-là rapporte le plus ; trop tôt, il te voit partir et tire de
//   l'autre côté. Certains feintent (temps d'arrêt dans la course) ou tentent la panenka au centre.

const LINE = PITCH.len; // ligne de but défendue (z = 10,5), cage ouverte vers -z
const EYE = 0.172; // hauteur des yeux (1,72 m)
const MEET = LINE - 0.065; // le ballon rencontre les gants à 65 cm devant le gardien
const EYE_FRAME = { v: 48, h: 40 }; // vue subjective : le tireur et la surface ; sur un écran en hauteur, pas de grand angle
const REACH = { left: 0.24, right: 0.24, center: 0.12 }; // temps qu'il faut pour couvrir la zone (s)
const MODES = {
  reflexes: { shots: 8, prompt: t('Plonge vers le ballon') },
  penalties: { shots: 6, prompt: t('Lis la course du tireur') },
};
// arrêts réflexes : plongeon vers un point (x en travers, y en hauteur, dans le plan des gants)
const REST_Y = 0.115; // mains au repos, à 1,15 m
const SPAN = { x: 0.36, y: 0.235 }; // le but vu du gardien : 3,6 m de chaque côté, 2,35 m de haut
const CATCH = 0.04; // portées : capté (40 cm), claqué (70 cm), du bout des gants (95 cm)
const PARRY = 0.07;
const TIPS = 0.095;
const reachTime = (ax, ay) => 0.1 + 1.1 * Math.hypot(ax, ay - REST_Y); // couvrir un coin prend près d'une demi-seconde
const SHOT_KINDS = ['low', 'mid', 'high', 'body', 'curl', 'high', 'low', 'curl'];
export const SAVES_MAX = 100 * MODES.reflexes.shots;
export const PENALTIES_MAX = 100 * MODES.penalties.shots;
const TELL = 0.32; // penalty : le tireur se tourne vers son côté 0,32 s avant la frappe
const EARLY = 0.45; // plonger plus tôt que 0,45 s avant la frappe : le tireur te voit partir

function createKeeper(stage, ctx, mode) {
  const M = MODES[mode];
  const pens = mode === 'penalties';
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;

  // gants (enfants de la caméra), vus du dos : noir du club, bande et manchette dorées
  const gloveMat = keep(new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.62 }));
  const palmMat = keep(new THREE.MeshStandardMaterial({ color: 0xc7a15a, roughness: 0.4, metalness: 0.35 }));
  function glove(side) {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0042, 0.006, 6, 12).scale(1.35, 1, 0.55)), gloveMat);
    g.add(palm);
    const strap = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0044, 0.002, 4, 12).scale(1.38, 0.6, 0.6)), palmMat);
    strap.position.y = -0.0035;
    g.add(strap);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0012, 0.0045 + (f === 1 || f === 2 ? 0.0012 : 0), 4, 8)), gloveMat);
      finger.position.set((f - 1.5) * 0.0026, 0.0085 + (f === 1 || f === 2 ? 0.0007 : 0), 0);
      finger.rotation.z = (f - 1.5) * -0.08;
      g.add(finger);
    }
    const thumb = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0013, 0.004, 4, 8)), gloveMat);
    thumb.position.set(-side * 0.0062, 0.0018, 0.0006);
    thumb.rotation.z = side * 0.9;
    g.add(thumb);
    const cuff = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0046, 0.0052, 0.007, 16).scale(1.3, 1, 0.75)), palmMat);
    cuff.position.y = -0.0085;
    g.add(cuff);
    g.rotation.x = -0.25;
    stage.camera.add(g);
    return g;
  }
  const hands = [glove(-1), glove(1)];
  const REST = [new THREE.Vector3(-0.022, -0.024, -0.06), new THREE.Vector3(0.022, -0.024, -0.06)];

  // tireur (chasubles d'entraînement), ballon, plots, ballons de réserve
  const shooter = agent(0, LINE - 1.3, Math.PI / 2);
  stage.players.setKit(0, KITS.bibs);
  const shShadow = stage.addShadow(0.07, 0.5, group);
  const ball = stage.addBall(group);
  [[-0.5, LINE - 1.5], [-0.53, LINE - 1.47], [0.48, LINE - 1.62]].forEach(([x, z]) => stage.addBall(group).set(x, 0, z));
  cones(stage, pens ? [[-0.25, LINE - 1.65], [0.25, LINE - 1.65]] : [[-0.2, LINE - 1.7], [0.2, LINE - 1.7], [-0.4, LINE - 1.35], [0.4, LINE - 1.35]], undefined, group);

  const s = {
    k: -1, phase: 'intro', t: 0, points: 0, saves: 0,
    spot: new THREE.Vector3(), from: new THREE.Vector3(), ctrl: new THREE.Vector3(), to: new THREE.Vector3(),
    flight: 0, dur: 0.6, zone: 'center', dive: null, used: false, kickT: null, out: null, wait: 0,
    clock: 0, kickAt: null, run: null, chip: false,
  };
  const tmp = new THREE.Vector3();
  const off = new THREE.Vector3();
  const spin = new THREE.Vector3(1, 0, 0);
  const restCam = { pos: new THREE.Vector3(0, EYE, LINE - 0.03), look: new THREE.Vector3(0, 0.07, LINE - 1.4) };
  const PEN_ZONES = ['left', 'right', 'right', 'center', 'left', 'right'].sort(() => Math.random() - 0.5);

  function hud() {
    const live = ['wait', 'runup', 'kick', 'flight'].includes(s.phase);
    ctx.hud({ round: Math.max(1, s.k + 1), rounds: M.shots, points: s.points, max: 100 * M.shots, prompt: live ? M.prompt : '', action: live });
  }

  const target = (zone, chip = false) => {
    const x = zone === 'center' ? rnd(-0.05, 0.05) : (zone === 'right' ? 1 : -1) * rnd(0.19, 0.31);
    return new THREE.Vector3(x, chip ? rnd(0.12, 0.17) : rnd(0.03, 0.19), MEET);
  };

  function setup(k) {
    s.k = k;
    if (pens) {
      s.spot.set(0, 0, LINE - 1.1);
      s.zone = PEN_ZONES[k];
      s.chip = s.zone === 'center';
      const from = Math.random() < 0.5 ? -1 : 1; // course d'élan, de la gauche ou de la droite
      s.run = { from, stutter: !s.chip && Math.random() < 0.35, paused: 0 };
      shooter.x = s.spot.x + from * 0.11; shooter.z = s.spot.z - 0.24;
      s.dur = s.chip ? 0.95 : rnd(0.42, 0.48);
    } else {
      // tirs variés, côté au hasard ; de plus en plus forts
      const dist = rnd(1.1, 1.7) - k * 0.025;
      s.spot.set(rnd(-0.35, 0.35), 0, LINE - dist);
      s.kind = SHOT_KINDS[k];
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = s.kind === 'body' ? rnd(-0.04, 0.04) : side * rnd(0.12, 0.31);
      const y = s.kind === 'low' ? rnd(0.015, 0.055) : s.kind === 'high' ? rnd(0.155, 0.215) : s.kind === 'body' ? rnd(0.08, 0.14) : rnd(0.06, 0.14);
      s.zone = x < -0.06 ? 'left' : x > 0.06 ? 'right' : 'center';
      s.curl = s.kind === 'curl' ? -side * rnd(0.06, 0.1) : rnd(-0.02, 0.02); // enroulé : il part dehors et rentre
      s.chip = false;
      shooter.x = s.spot.x - 0.02; shooter.z = s.spot.z - 0.13;
      s.dur = THREE.MathUtils.clamp(0.86 - k * 0.045, 0.5, 0.86) * (dist / 1.3) ** 0.5;
      s.to.set(x, y, MEET);
    }
    if (pens) s.to.copy(target(s.zone, s.chip));
    s.slowmo = false;
    s.upAt = null;
    ball.set(s.spot.x, 0, s.spot.z);
    shooter.h = Math.PI / 2; shooter.kick = 0; shooter.gait = 0; shooter.cheer = 0;
    s.dive = null;
    s.used = false;
    s.out = null;
    s.kickAt = null;
    s.phase = 'wait';
    s.wait = pens ? rnd(0.7, 1.2) : rnd(0.5, 1.1);
    s.t = 0;
    stage.camTo(restCam.pos, tmp.copy(restCam.look).setX(s.spot.x * 0.4), 0.5, EYE_FRAME);
    hud();
  }

  // plongeon : décalage et bascule de la caméra, gants tendus vers le ballon
  function diveTo(zone) {
    if (s.used || s.phase === 'after' || s.phase === 'done' || s.phase === 'intro') return;
    s.dive = { zone, t: 0, at: s.clock };
    s.used = true; // un seul plongeon par tir
    ctx.sfx('jump');
  }
  // arrêts réflexes : plongeon vers un point du but (ax en travers, ay en hauteur)
  function diveAt(ax, ay) {
    if (s.used || s.phase === 'after' || s.phase === 'done' || s.phase === 'intro') return;
    ax = THREE.MathUtils.clamp(ax, -SPAN.x, SPAN.x);
    ay = THREE.MathUtils.clamp(ay, 0, SPAN.y);
    s.dive = { zone: ax < -0.06 ? 'left' : ax > 0.06 ? 'right' : 'center', t: 0, at: s.clock, ax, ay, reach: reachTime(ax, ay) };
    s.used = true;
    s.upAt = null;
    ctx.sfx('jump');
  }
  // où sont les mains à l'arrivée du ballon (temps nominal du tir) ; leur distance au ballon fait l'arrêt
  function handsAtArrival() {
    const d = s.dive;
    if (!d || s.kickAt === null) return { x: 0, y: REST_Y, d };
    const prog = easeOut(clamp01((s.kickAt + s.dur - d.at) / d.reach));
    return { x: d.ax * prog, y: REST_Y + (d.ay - REST_Y) * prog, d };
  }
  // distance du ballon au corps du gardien en plongeon : du bassin (qui suit un peu) jusqu'aux mains
  function bodyDist(h) {
    const ax = h.x * 0.25, ay = 0.08;
    const dx = h.x - ax, dy = h.y - ay;
    const u = clamp01(((s.to.x - ax) * dx + (s.to.y - ay) * dy) / (dx * dx + dy * dy || 1e-9));
    return Math.hypot(s.to.x - (ax + dx * u), s.to.y - (ay + dy * u));
  }
  function resolveReflex() {
    const h = handsAtArrival();
    const d = h.d;
    const dist = Math.hypot(s.to.x - h.x, s.to.y - h.y);
    const react = d ? d.at - s.kickAt : null; // temps de réaction (négatif : plongeon avant la frappe)
    // dans les mains : capté ; près des mains ou sur le corps (bras, buste) : repoussé ; au bout des doigts : détourné
    let kind = dist <= CATCH ? 'catch' : dist <= PARRY || bodyDist(h) <= 0.05 ? 'parry' : dist <= TIPS ? 'tips' : 'goal';
    let pts = { catch: 100, parry: 80, tips: 60, goal: 0 }[kind];
    let text = { catch: t('Capté'), parry: t('Claqué'), tips: t('Du bout des gants'), goal: t('But') }[kind];
    if (pts && !d) text = t('Bien placé');
    else if (pts && react < 0) { pts = Math.round(pts * 0.6); text = t('Bien deviné'); } else if (!pts && d && Math.sign(d.ax) === Math.sign(s.to.x) && react > 0) text = t('Trop tard');
    if (!pts && d && Math.sign(d.ax) !== Math.sign(s.to.x) && Math.abs(d.ax) > 0.06) text = t('Mauvais côté');
    const tone = pts >= 100 ? 'gold' : pts > 0 ? 'good' : 'bad';
    const rtxt = pts && react !== null && react >= 0 ? ` · ${fmtNum(react, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : '';
    s.out = { pts, save: pts > 0, kind };
    s.points += pts;
    const side = Math.sign(s.to.x) || 1;
    if (pts > 0) {
      s.saves += 1;
      stage.burst(tmp.copy(s.to).setZ(MEET - 0.04), { count: kind === 'catch' ? 60 : 40, color: kind === 'catch' ? 0xffe3a0 : 0xffffff, speed: 0.1 });
      stage.shake(kind === 'tips' ? 0.35 : 0.5);
      ctx.sfx('save');
    } else {
      ctx.sfx('goal');
      stage.netHit(tmp.set(s.to.x, s.to.y, LINE + GOAL.depth), 1);
    }
    ctx.pop({ text: `${text}${rtxt}`, points: pts ? `+${pts}` : '0', tone, at: stage.toScreen(tmp.set(s.to.x * 0.6, s.to.y * 0.5 + 0.12, LINE - 0.45)) });
    // suite : capté (dans les gants), claqué sur le côté, détourné par-dessus ou à côté (corner), ou au fond des filets
    const to = kind === 'catch' ? new THREE.Vector3(0, EYE - 0.04, MEET + 0.01)
      : kind === 'parry' ? new THREE.Vector3(s.to.x * 2.4 + side * 0.1, s.to.y + 0.05, LINE - 0.32)
        : kind === 'tips' ? new THREE.Vector3(s.to.x * 1.3 + side * 0.12, s.to.y + 0.2, LINE + 0.12)
          : new THREE.Vector3(s.to.x * 1.05, s.to.y * 0.8, LINE + GOAL.depth * 0.9);
    s.after = { from: s.to.clone(), to, caught: kind === 'catch' };
    s.phase = 'after';
    s.t = 0;
    hud();
  }

  // penalty : plonger trop tôt, c'est se trahir ; le tireur change de côté
  function adapt() {
    const d = s.dive;
    if (!pens || !d || s.kickAt === null) return;
    if (s.kickAt - d.at > EARLY) {
      const other = d.zone === 'left' ? 'right' : d.zone === 'right' ? 'left' : (Math.random() < 0.5 ? 'left' : 'right');
      s.zone = other;
      s.chip = false;
      s.to.copy(target(other));
      s.dur = rnd(0.44, 0.5);
      s.early = true;
    }
  }

  function resolve() {
    const d = s.dive;
    const r = d ? d.at - s.kickAt : null; // plongeon par rapport à la frappe (négatif : avant)
    const right = d && d.zone === s.zone;
    const late = d && r > s.dur - REACH[s.zone];
    let pts = 0;
    let text = t('But');
    let tone = 'bad';
    if (pens) {
      if (s.early) text = t('Trop tôt : il t’a vu partir');
      else if (s.zone === 'center' && (!d || d.zone === 'center')) { pts = 100; text = t('Panenka arrêtée'); tone = 'gold'; } else if (s.zone === 'center') text = 'Panenka';
      else if (right && !late) { pts = r >= -TELL - 0.02 ? 100 : 75; text = pts === 100 ? t('Lu à la perfection') : t('Bien senti'); tone = pts === 100 ? 'gold' : 'good'; } else if (right && late) text = t('Trop tard');
    } else if (!d && s.zone === 'center') { pts = 60; text = t('Bien placé'); tone = 'good'; } else if (right && r < 0) { pts = 50; text = t('Bien deviné'); tone = 'good'; } else if (right && !late) {
      pts = Math.round(60 + 40 * clamp01(1 - r / Math.max(0.05, s.dur - REACH[s.zone])));
      text = pts >= 90 ? t('Réflexe parfait') : t('Arrêt');
      tone = pts >= 90 ? 'gold' : 'good';
    } else if (right && late) text = t('Trop tard');
    s.out = { pts, save: pts > 0 };
    s.points += pts;
    if (pts > 0) {
      s.saves += 1;
      stage.burst(tmp.copy(s.to).setZ(MEET - 0.04), { count: pts >= 90 ? 60 : 36, color: pts >= 90 ? 0xffe3a0 : 0xffffff, speed: 0.1 });
      stage.shake(0.5);
      ctx.sfx('save');
    } else {
      ctx.sfx('goal');
    }
    ctx.pop({ text, points: pts ? `+${pts}` : '0', tone, at: stage.toScreen(tmp.set(s.to.x * 0.6, s.to.y * 0.5 + 0.12, LINE - 0.45)) });
    // suite : capté (au centre), repoussé sur le côté, ou au fond des filets derrière la caméra
    s.after = {
      from: s.to.clone(),
      to: pts > 0 ? (s.zone === 'center' ? new THREE.Vector3(0, EYE - 0.04, MEET + 0.01) : new THREE.Vector3(s.to.x * 2.6, s.to.y + 0.08, LINE - 0.35)) : new THREE.Vector3(s.to.x * 1.05, s.to.y * 0.8, LINE + GOAL.depth * 0.9),
      caught: pts > 0 && s.zone === 'center',
    };
    if (!pts) stage.netHit(tmp.set(s.to.x, s.to.y, LINE + GOAL.depth), 1);
    s.phase = 'after';
    s.t = 0;
    hud();
  }

  return {
    intro() {
      setup(0);
      s.phase = 'intro';
      // plan d'ensemble depuis derrière le but (soleil dans le dos), puis la caméra rejoint les yeux du gardien
      stage.camSet(new THREE.Vector3(-0.55, 0.42, LINE + 0.85), new THREE.Vector3(0, 0.04, LINE - 0.9), { v: 38, h: 48 });
      stage.camTo(restCam.pos, tmp.copy(restCam.look).setX(s.spot.x * 0.4), 3.2, EYE_FRAME);
    },
    start() { s.phase = 'wait'; s.t = 0; hud(); },
    press(e) {
      if (pens) {
        if (e?.pointer) diveTo(e.x < e.w * 0.36 ? 'left' : e.x > e.w * 0.64 ? 'right' : 'center');
        else if (e?.key || e?.pad) diveTo('center');
        return;
      }
      // au doigt : l'écran est le but vu du gardien ; le bas de l'écran, le sol
      if (e?.pointer) {
        const fb = 1 - e.y / e.h;
        diveAt(((e.x / e.w) - 0.5) * 2 * SPAN.x * 1.05, clamp01((fb - 0.08) / 0.62) * SPAN.y);
      } else if (e?.key || e?.pad) diveAt(0, REST_Y); // rester debout, dans l'axe
    },
    dir(d) {
      if (pens) { diveTo(d === 'left' ? 'left' : d === 'right' ? 'right' : 'center'); return; }
      if (d === 'up') { s.upAt = s.clock; return; } // haut : tir haut avec gauche ou droite, sinon un saut
      if (d === 'down') { diveAt(0, 0.03); return; }
      // gauche ou droite : le gardien suit la trajectoire si le côté est le bon et la hauteur aussi (haut pour un tir
      // au-dessus de 1,5 m) ; sinon il plonge à 2,7 m, à la hauteur choisie
      const sign = d === 'left' ? -1 : 1;
      const high = s.upAt !== null && s.clock - s.upAt < 0.35;
      const sameSide = Math.abs(s.to.x) > 0.06 && Math.sign(s.to.x) === sign;
      if (sameSide) diveAt(s.to.x, high === s.to.y > 0.15 ? s.to.y : high ? 0.19 : 0.08);
      else diveAt(sign * 0.27, high ? 0.19 : 0.08);
    },
    update(dt) {
      s.t += dt;
      s.clock += dt;
      // haut seul (clavier, manette) : un saut dans l'axe, faute de gauche ou droite dans la foulée
      if (!pens && s.upAt !== null && !s.used && s.clock - s.upAt > 0.2) diveAt(0, 0.21);
      // tireur : attente, élan, frappe
      if (s.phase === 'wait' && s.t > s.wait) { s.phase = 'runup'; s.t = 0; hud(); }
      if (s.phase === 'runup') {
        if (pens) {
          // course d'élan vers le ballon ; temps d'arrêt éventuel à mi-course (feinte)
          const tx = s.spot.x + 0.012, tz = s.spot.z - 0.045;
          const left = Math.hypot(tx - shooter.x, tz - shooter.z);
          if (s.run.stutter && !s.run.done && left < 0.13) { s.run.paused += dt; shooter.gait *= 0.8; if (s.run.paused > 0.3) s.run.done = true; } else walkTo(shooter, tx, tz, 0.3, dt, Math.atan2(tz - shooter.z, tx - shooter.x));
          if (left < 0.01) { s.phase = 'kick'; s.t = 0; s.kickT = 0; s.turn = s.chip ? 0 : (s.to.x < 0 ? 1 : -1); }
        } else {
          const there = walkTo(shooter, s.spot.x - 0.03, s.spot.z - 0.045, 0.42, dt, Math.atan2(s.to.z - s.spot.z, s.to.x - s.spot.x));
          if (there || s.t > 0.7) { s.phase = 'kick'; s.t = 0; s.kickT = 0; }
        }
      }
      if (s.kickT !== null) {
        s.kickT += dt;
        shooter.kick = clamp01(s.kickT / 0.6);
        shooter.gait *= 1 - Math.min(1, dt * 8);
        // penalty : l'appui révélateur, le corps s'ouvre vers le côté visé pendant l'armé de la frappe (0,32 s)
        if (pens && s.turn) shooter.h = Math.PI / 2 + s.turn * 0.5 * clamp01(s.kickT / 0.2);
        if (s.kickT >= 0.6) { shooter.kick = 0; s.kickT = null; }
      }
      if (s.phase === 'kick' && s.t >= 0.33) {
        s.kickAt = s.clock;
        adapt();
        s.phase = 'flight';
        s.flight = 0;
        s.from.set(s.spot.x, BALL_R, s.spot.z);
        s.ctrl.copy(s.from).lerp(s.to, 0.5);
        s.ctrl.y += s.chip ? 0.2 : 0.015 + s.to.y * 0.25;
        s.ctrl.x += pens ? (s.chip ? 0 : rnd(-0.03, 0.03)) : s.curl;
        ctx.sfx('kick');
        hud();
      }
      if (s.phase === 'flight') {
        // arrêt serré en vue : les derniers mètres au ralenti (le verdict reste celui du temps réel du tir)
        if (!pens && !s.slowmo && s.flight > 0.78 && s.dive) {
          const h = handsAtArrival();
          if (Math.hypot(s.to.x - h.x, s.to.y - h.y) <= TIPS) s.slowmo = true;
        }
        s.flight = Math.min(1, s.flight + (dt * (s.slowmo ? 0.35 : 1)) / s.dur);
        bezier(tmp, s.from, s.ctrl, s.to, s.flight);
        ball.set(tmp.x, tmp.y - BALL_R, tmp.z);
        ball.spin(spin, dt * (s.chip ? 8 : 30));
        if (s.flight >= 1) { if (pens) resolve(); else resolveReflex(); }
      } else if (s.phase === 'after') {
        const a = s.after;
        const k = clamp01(s.t / (a.caught ? 0.18 : 0.45));
        tmp.copy(a.from).lerp(a.to, easeOut(k));
        if (!a.caught) tmp.y = THREE.MathUtils.lerp(a.from.y, a.to.y, k) - 0.05 * k * k;
        if (s.out.save || k < 0.6) ball.set(tmp.x, Math.max(0, tmp.y - BALL_R), tmp.z); else ball.hide();
        if (s.t > 1.05) {
          s.early = false;
          if (s.k + 1 < M.shots) setup(s.k + 1);
          else { s.phase = 'done'; ctx.end(s.points / (100 * M.shots), { saves: s.saves, shots: M.shots }); }
        }
      }
      // plongeon (caméra) et gants
      const d = s.dive;
      let side = 0;
      let lift = 0; // arrêts réflexes : hauteur visée par rapport aux mains au repos
      let k = 0;
      if (d) {
        d.t += dt * (s.slowmo && s.phase === 'flight' ? 0.35 : 1);
        side = pens ? (d.zone === 'left' ? -1 : d.zone === 'right' ? 1 : 0) : THREE.MathUtils.clamp(d.ax / 0.3, -1, 1);
        lift = pens ? 0 : d.ay - REST_Y;
        const out = clamp01(d.t / (pens ? 0.26 : Math.max(0.18, d.reach)));
        const back = clamp01((d.t - (pens ? 0.75 : 0.95)) / 0.45);
        k = easeOut(out) * (1 - easeOut(back));
        if (back >= 1 && s.phase !== 'flight') s.dive = null;
      }
      if (pens) off.set(side * 0.13 * k, side ? -0.05 * k : 0.012 * k, -0.008 * k);
      else off.set(side * 0.13 * k, (lift * 0.55 - Math.abs(side) * 0.035) * k, -0.008 * k);
      stage.camOffset(off, -side * 0.38 * k);
      // gants dans le champ, quelle que soit la forme de l'écran (plus rapprochés sur un téléphone en hauteur)
      const cam = stage.camera;
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect * 0.06;
      const gx = Math.min(0.022, half * 0.6);
      REST[0].x = -gx; REST[1].x = gx;
      hands.forEach((h, i) => {
        const r = REST[i];
        const reach = !pens ? new THREE.Vector3(side * 0.03 + (i - 0.5) * 0.014, lift * 0.09 - 0.002, -0.06)
          : side ? new THREE.Vector3(side * 0.03 + (i - 0.5) * 0.012, -0.002, -0.06) : new THREE.Vector3((i - 0.5) * 0.02, -0.008, -0.058);
        h.position.copy(r).lerp(reach, k);
        h.rotation.z = (side ? side * -0.7 : (i - 0.5) * 0.6) * k;
        h.visible = s.phase !== 'intro';
      });
      stage.players.setAgent(0, shooter, 0);
      stage.players.commit(1);
      shShadow.position.set(shooter.x + 0.006, 0.0015, shooter.z + 0.006);
    },
    get debug() { return s; },
    dispose() {
      hands.forEach((h) => stage.camera.remove(h));
      stage.camOffset(new THREE.Vector3(), 0);
      stage.scene.remove(group);
    },
  };
}

export const createSaves = (stage, ctx) => createKeeper(stage, ctx, 'reflexes');
export const createPenalties = (stage, ctx) => createKeeper(stage, ctx, 'penalties');
