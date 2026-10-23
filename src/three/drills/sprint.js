import * as THREE from 'three';
import { KITS } from './stage';
import { agent, clamp01, cones, rnd, stride } from './kit';

// Sprint et haies (physique) : 100 m chronométrés, dix haies. Départ au signal (appuyer avant, c'est un faux
// départ), puis un appui pour sauter chaque haie : la bande dorée au sol montre où prendre l'appel. Un saut parfait
// relance la vitesse, un saut trop tôt ou trop tard touche la haie, l'oublier fait chuter. Le chrono fait le score.

const Z = 3.55; // couloir, parallèle à la ligne médiane (les mâts d'éclairage restent derrière la caméra)
const START = -5.0;
const FINISH = 5.0;
const HURDLES = Array.from({ length: 10 }, (_, i) => -3.7 + i * 0.88);
const H = 0.05; // hauteur d'une haie (50 cm)
const VMAX = 0.96; // 9,6 m/s
const JUMP = 0.44; // durée d'un saut (s)
const PEAK = 0.066; // hauteur du saut (66 cm)
const IDEAL = 0.2; // appel idéal : 2 m avant la haie
const FRAME = { v: 30, h: 36 }; // sur un écran en hauteur, le coureur reste grand

// chrono d'une course simulée (calage du score) : réaction, puis chaque haie franchie parfaitement ou touchée
function simulate(reaction, quality) {
  let x = START, v = 0, t = reaction;
  let i = 0;
  while (x < FINISH && t < 60) {
    const dt = 1 / 120;
    v += (VMAX - v) * Math.min(1, dt * 0.9);
    x += v * dt;
    t += dt;
    if (i < HURDLES.length && x >= HURDLES[i]) { v = quality === 'perfect' ? Math.min(VMAX * 1.06, v + 0.05) : v * 0.7; i += 1; }
  }
  return t;
}
const T_GOOD = simulate(0.17, 'perfect');
const T_BAD = simulate(0.45, 'clip');

export function createSprint(stage, ctx) {
  const group = new THREE.Group();
  stage.scene.add(group);
  const keep = stage.keep;

  // couloir : deux lignes blanches, ligne de départ, ligne d'arrivée, mâts d'arrivée dorés
  const paint = keep(new THREE.MeshBasicMaterial({ color: 0xe9ebe6 }));
  const lane = (x0, x1, z, w) => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(x1 - x0, w).rotateX(-Math.PI / 2)), paint);
    m.position.set((x0 + x1) / 2, 0.0012, z);
    group.add(m);
  };
  lane(START - 0.2, FINISH + 0.6, Z - 0.062, 0.005);
  lane(START - 0.2, FINISH + 0.6, Z + 0.062, 0.005);
  for (const x of [START, FINISH]) {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.008, 0.124).rotateX(-Math.PI / 2)), paint);
    m.position.set(x, 0.0013, Z);
    group.add(m);
  }
  const gold = keep(new THREE.MeshStandardMaterial({ color: 0xc7a15a, roughness: 0.35, metalness: 0.6 }));
  for (const dz of [-0.09, 0.09]) {
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.003, 0.003, 0.24, 10)), gold);
    pole.position.set(FINISH, 0.12, Z + dz);
    group.add(pole);
  }
  const banner = new THREE.Mesh(keep(new THREE.BoxGeometry(0.004, 0.03, 0.18)), keep(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6 })));
  banner.position.set(FINISH, 0.225, Z);
  group.add(banner);

  // haies : montants blancs, barre rayée rouge et blanc ; elles basculent quand on les touche
  const barTex = keep((() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 8;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2ef' : '#d8352a'; g.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })());
  const barMat = keep(new THREE.MeshStandardMaterial({ map: barTex, roughness: 0.5 }));
  const postMat = keep(new THREE.MeshStandardMaterial({ color: 0xf0f0ed, roughness: 0.4, metalness: 0.2 }));
  const hurdles = HURDLES.map((x) => {
    const g = new THREE.Group();
    g.position.set(x, 0, Z);
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(0.004, 0.009, 0.1)), barMat);
    bar.position.y = H - 0.0045;
    g.add(bar);
    for (const dz of [-0.05, 0.05]) {
      const p = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.0013, 0.0013, H, 6)), postMat);
      p.position.set(0, H / 2, dz);
      g.add(p);
      const foot = new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.002, 0.003)), postMat);
      foot.position.set(0.01, 0.001, dz);
      g.add(foot);
    }
    group.add(g);
    const sh = stage.addShadow(0.06, 0.25, group);
    sh.scale.set(0.03, 1, 0.11);
    sh.position.set(x + 0.006, 0.0014, Z);
    // zone d'appel : bande dorée au sol, plus vive au point idéal
    const zone = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.12, 0.16).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)), keep(stage.beamMaterial(0xdec17f, { opacity: 0.55 })));
    zone.position.set(x - IDEAL, 0.0016, Z);
    zone.renderOrder = 3;
    group.add(zone);
    return { x, g, zone, fall: 0, fallen: false, done: false };
  });
  cones(stage, [[START - 0.1, Z - 0.1], [START - 0.1, Z + 0.1], [FINISH + 0.1, Z - 0.13], [FINISH + 0.1, Z + 0.13]], undefined, group);

  const runner = agent(START - 0.02, Z, 0);
  stage.players.setKit(0, KITS.ours);
  const shadow = stage.addShadow(0.07, 0.5, group);

  const s = {
    phase: 'intro', t: 0, v: 0, chrono: 0, jump: null, next: 0, beepAt: 0, signal: false, reaction: null,
    penalty: 0, perfect: 0, clips: 0, stumble: 0, prompt: '',
  };
  const tmp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const fmt = (t) => `${t.toFixed(2).replace('.', ',')} s`;

  function hud() {
    ctx.hud({ round: Math.min(HURDLES.length, s.next + 1), rounds: HURDLES.length, chrono: fmt(s.chrono), prompt: s.prompt, action: s.phase === 'set' || s.phase === 'run' });
  }
  function follow() { // travelling latéral qui accompagne le coureur, un peu devant lui
    camLook.set(runner.x + 0.2, 0.055, Z);
    camPos.set(runner.x + 0.12, 0.13, Z + 0.98);
    stage.camSet(camPos, camLook, FRAME);
  }

  function judge(h) {
    const j = s.jump;
    const lift = j ? PEAK * Math.sin(Math.PI * clamp01(j.t / JUMP)) : 0;
    h.done = true;
    let text;
    let tone;
    if (j && lift >= H - 0.002) {
      const d = Math.abs(j.from - (h.x - IDEAL));
      if (d <= 0.035) { s.v = Math.min(VMAX * 1.06, s.v + 0.05); s.perfect += 1; text = 'Parfait'; tone = 'gold'; ctx.sfx('good'); } else if (d <= 0.07) { text = 'Bien'; tone = 'good'; } else { s.v *= 0.94; text = 'Juste'; tone = 'meh'; }
    } else if (j) {
      s.v *= 0.7; s.clips += 1; h.fall = 0.001; text = 'Haie touchée'; tone = 'bad'; ctx.sfx('clip');
    } else {
      s.v *= 0.4; s.clips += 1; h.fall = 0.001; s.stumble = 1; text = 'Chute évitée de justesse'; tone = 'bad'; ctx.sfx('crash');
    }
    ctx.pop({ text, points: text === 'Parfait' ? '+' : '', tone, at: stage.toScreen(tmp.set(h.x, 0.1, Z)) });
  }

  return {
    intro() {
      runner.x = START - 0.02; runner.h = 0; runner.gait = 0;
      // plan d'ensemble : la ligne des haies en enfilade, puis la caméra rejoint le couloir de départ
      stage.camSet(new THREE.Vector3(START - 0.9, 0.34, Z + 0.7), new THREE.Vector3(START + 2.2, 0.02, Z), { v: 32, h: 46 });
      stage.camTo(tmp.set(runner.x + 0.12, 0.13, Z + 0.98), new THREE.Vector3(runner.x + 0.2, 0.055, Z), 3.2, FRAME);
      s.phase = 'intro';
      s.prompt = '';
    },
    start() {
      s.phase = 'set'; s.t = 0; s.beepAt = rnd(1.4, 2.4); s.signal = false;
      s.prompt = 'À vos marques… Prêt…';
      hud();
    },
    press() {
      if (s.phase === 'set') {
        if (!s.signal) {
          if (!s.penalty) { s.penalty = 0.5; ctx.pop({ text: 'Faux départ', points: '+0,5 s', tone: 'bad', at: stage.toScreen(tmp.set(runner.x, 0.2, Z)) }); ctx.sfx('bad'); }
          return;
        }
        s.reaction = s.t - s.beepAt;
        s.phase = 'run';
        s.chrono = s.reaction + s.penalty;
        s.prompt = 'Saute dans la zone dorée';
        ctx.pop({ text: s.reaction < 0.2 ? 'Départ canon' : 'Partez', points: `${(s.reaction).toFixed(2).replace('.', ',')} s`, tone: s.reaction < 0.2 ? 'gold' : 'good', at: stage.toScreen(tmp.set(runner.x, 0.2, Z)) });
        hud();
        return;
      }
      if (s.phase === 'run' && !s.jump) { s.jump = { t: 0, from: runner.x }; ctx.sfx('jump'); }
    },
    update(dt) {
      s.t += dt;
      hurdles.forEach((h) => {
        h.zone.material.uniforms.uTime.value = stage.time;
        h.zone.visible = !h.done;
        if (h.fall > 0 && h.fall < 1) { h.fall = Math.min(1, h.fall + dt * 3.2); h.g.rotation.z = -h.fall * 1.45; }
      });
      if (s.phase === 'set') {
        if (!s.signal && s.t >= s.beepAt) { s.signal = true; ctx.sfx('go'); s.prompt = 'Partez !'; hud(); }
        if (s.signal && s.t - s.beepAt > 1.5) { s.reaction = 1.5; s.phase = 'run'; s.chrono = 1.5 + s.penalty; s.prompt = 'Saute dans la zone dorée'; hud(); }
        stride(runner, 0, dt);
        follow();
      } else if (s.phase === 'run' || s.phase === 'finish') {
        if (s.phase === 'run') {
          s.v += (VMAX - s.v) * Math.min(1, dt * 0.9);
          s.chrono += dt;
        } else s.v = Math.max(0, s.v - dt * 0.9);
        runner.x += s.v * dt;
        stride(runner, s.v, dt);
        if (s.jump) {
          s.jump.t += dt;
          if (s.jump.t >= JUMP) { s.jump = null; ctx.sfx('step'); }
        }
        runner.lift = s.jump ? PEAK * Math.sin(Math.PI * clamp01(s.jump.t / JUMP)) : 0;
        if (s.stumble > 0) { s.stumble = Math.max(0, s.stumble - dt * 2.2); runner.roll = Math.sin(s.stumble * 9) * 0.12 * s.stumble; } else runner.roll = 0;
        while (s.next < HURDLES.length && runner.x >= HURDLES[s.next]) { judge(hurdles[s.next]); s.next += 1; hud(); }
        if (s.phase === 'run' && runner.x >= FINISH) {
          s.phase = 'finish';
          s.t = 0;
          s.prompt = '';
          ctx.sfx('finish');
          ctx.pop({ text: 'Arrivée', points: fmt(s.chrono), tone: s.chrono <= T_GOOD + 0.6 ? 'gold' : 'good', at: stage.toScreen(tmp.set(FINISH, 0.2, Z)) });
          hud();
        }
        if (s.phase === 'run' && Math.round(s.chrono * 10) !== Math.round((s.chrono - dt) * 10)) hud();
        follow();
        if (s.phase === 'finish' && s.t > 1.6) {
          s.phase = 'done';
          const score = clamp01((T_BAD - s.chrono) / (T_BAD - T_GOOD));
          ctx.end(score, { time: s.chrono, perfect: s.perfect, clips: s.clips });
        }
      }
      runner.cheer = s.phase === 'finish' && s.chrono <= T_GOOD + 1.5 ? clamp01(s.t * 2) : 0;
      stage.players.setAgent(0, runner, 0);
      stage.players.commit(1);
      shadow.position.set(runner.x + 0.006, 0.0015, Z + 0.006);
      shadow.scale.setScalar(0.07 * (1 + (runner.lift || 0) * 4));
    },
    get debug() { return { ...s, x: runner.x, T_GOOD, T_BAD }; },
    dispose() { stage.scene.remove(group); },
  };
}
