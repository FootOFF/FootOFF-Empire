// Banc d'essai visuel des temps forts (0.7) : une pelouse simple, les deux équipes, la scène du match
// (src/three/matchplay.js) et la caméra télé d'Empire3D (même cadrage, même largeur de plan). Choisir un type d'action,
// une issue, un camp, puis « Jouer » : le temps fort se joue en temps réel, ralenti compris pour un but. Ouvrir avec
// npx vite, puis /tools/sim/temps-forts.html (?w=390&h=844 pour le cadrage d'un téléphone). window.runHL(e, temps)
// rend des images à des instants donnés (captures sans écran).
import * as THREE from 'three';
import { createMatchScene } from '../../src/three/matchplay.js';
import { matchFeed } from '../../src/game/matchFeed.js';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || innerWidth), H = Number(params.get('h') || innerHeight);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3a2a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 10, 6);
sun.castShadow = true;
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
// pelouse à bandes, lignes, buts
const stripes = document.createElement('canvas'); stripes.width = 1050; stripes.height = 680;
const g = stripes.getContext('2d');
for (let k = 0; k < 14; k++) { g.fillStyle = k % 2 ? '#2f7d36' : '#2a7231'; g.fillRect(k * 75, 0, 75, 680); }
g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
g.strokeRect(2, 2, 1046, 676); g.beginPath(); g.moveTo(525, 2); g.lineTo(525, 678); g.stroke();
g.beginPath(); g.arc(525, 340, 91.5, 0, Math.PI * 2); g.stroke();
g.strokeRect(2, 138, 165, 404); g.strokeRect(883, 138, 165, 404); g.strokeRect(2, 248, 55, 184); g.strokeRect(993, 248, 55, 184);
g.beginPath(); g.arc(112, 340, 3, 0, Math.PI * 2); g.arc(938, 340, 3, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
const tex = new THREE.CanvasTexture(stripes); tex.colorSpace = THREE.SRGBColorSpace;
const pitch = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 6.8), new THREE.MeshStandardMaterial({ map: tex }));
pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
const apron = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x23592a }));
apron.rotation.x = -Math.PI / 2; apron.position.y = -0.002; scene.add(apron);
const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
for (const sx of [-1, 1]) {
  const goal = new THREE.Group();
  const post = new THREE.BoxGeometry(0.012, 0.244, 0.012);
  for (const sz of [-1, 1]) { const p = new THREE.Mesh(post, white); p.position.set(0, 0.122, sz * 0.366); goal.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.744), white); bar.position.set(0, 0.244, 0); goal.add(bar);
  const net = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.244, 0.732), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
  net.position.set(sx * 0.08, 0.122, 0); goal.add(net);
  goal.position.set(sx * 5.25, 0, 0); scene.add(goal);
}
const squad = createMatchScene(scene);
squad.setKits({ shirt: 0xc7a15a, keeper: 0x1d1d1d }, { shirt: 0x2f5fb3, keeper: 0x5fbf5f });
squad.setMode({ matchDay: true, baseY: 0.001 });
Object.assign(matchFeed, { active: true, phase: 'playing', ended: false });

// caméra télé (Empire3D : TV_VIEW et broadcastStep)
const aspect = W / H;
const camera = new THREE.PerspectiveCamera(aspect < 1 ? 42 + (1 - aspect) * 26 : 42, aspect, 0.1, 400);
const TV = { pos: new THREE.Vector3(0, 5.4, 10.8), target: new THREE.Vector3(0, 0, 0.8) };
const tvDir = new THREE.Vector3().subVectors(TV.pos, TV.target).normalize();
const SHOT = { wide: { play: 6.2, attack: 4.8, set: 4.2, card: 3.6, celebrate: 3.3, replay: 3.4 }, narrow: { play: 3.7, attack: 3.1, set: 2.9, card: 2.5, celebrate: 2.3, replay: 2.4 } };
const target = new THREE.Vector3();
let dist = 9;
function cam(mi, dt) {
  const narrow = W <= 760;
  const width = SHOT[narrow ? 'narrow' : 'wide'][mi.cam] || 4.8;
  const perUnit = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (W / H);
  const want = THREE.MathUtils.clamp(width / perUnit, 2.6, 12.5);
  const lim = 5.25 - width * 0.3;
  const tx = THREE.MathUtils.clamp(mi.x + THREE.MathUtils.clamp((mi.vx || 0) * 0.3, -0.7, 0.7), -lim, lim);
  const tz = THREE.MathUtils.clamp(mi.z * 0.55 + (mi.vz || 0) * 0.15, -1.6, 1.6) + 0.3;
  if (mi.cut) { target.set(tx, 0, tz); dist = want; } else {
    const k = 1 - Math.exp(-dt * (mi.cam === 'replay' ? 3.2 : 2.2));
    target.x += (tx - target.x) * k; target.z += (tz - target.z) * k;
    dist += (want - dist) * (1 - Math.exp(-dt * (mi.cam === 'replay' ? 2.4 : 1.2)));
  }
  camera.position.copy(target).addScaledVector(tvDir, dist);
  camera.lookAt(target);
}
let id = 0;
const NAMES = ['G1', 'D1', 'D2', 'D3', 'D4', 'M1', 'M2', 'M3', 'A1', 'A2', 'A3'];
// joue un temps fort et rend les images demandées (secondes depuis le début), plus l'instant décisif
window.runHL = (e, times, opts = {}) => {
  const spec = { id: ++id, e, type: opts.type || 'big', half: opts.half || 1, replay: opts.replay ?? true, speed: 1, homeNames: NAMES, awayNames: NAMES.map((n) => `X${n}`), formation: opts.formation || '433', awayFormation: opts.awayFormation || '442', offHome: [], offAway: [] };
  Object.assign(matchFeed, { hl: spec, hlAck: 0, hlReveal: 0, hlDone: 0, hlPhase: '' });
  const shots = [];
  let t = 0, k = 0, revealAt = null;
  const dt = 1 / 60;
  const wanted = [...times].sort((a, b) => a - b);
  while (t < 40 && (k < wanted.length || matchFeed.hlDone !== spec.id)) {
    const mi = squad.update(dt, t);
    t += dt;
    if (mi) cam(mi, dt);
    if (revealAt === null && matchFeed.hlReveal === spec.id) { revealAt = t; renderer.render(scene, camera); shots.push({ t: +t.toFixed(2), tag: 'décisif', url: canvas.toDataURL('image/jpeg', 0.85), phase: matchFeed.hlPhase }); }
    while (k < wanted.length && t >= wanted[k]) { renderer.render(scene, camera); shots.push({ t: +t.toFixed(2), tag: '', url: canvas.toDataURL('image/jpeg', 0.85), phase: matchFeed.hlPhase }); k++; }
    if (matchFeed.hlDone === spec.id && k >= wanted.length) break;
  }
  return { shots, revealAt, doneAt: t, debug: squad.debug };
};
// --- Lecture en temps réel ------------------------------------------------------------------------------------------
const KINDS = { through: 'Ouverture', counter: 'Contre', cutback: 'Centre en retrait', cross: 'Centre', combo: 'Une-deux', scramble: 'Cafouillage', solo: 'Percée', corner: 'Corner', press: 'Pressing', long: 'Frappe lointaine', freekick: 'Coup franc', penalty: 'Penalty' };
const ui = document.getElementById('ui');
const kindSel = document.getElementById('kind');
const state = document.getElementById('state');
if (kindSel) kindSel.innerHTML = Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
let live = null;
let last = performance.now();
ui?.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const kind = kindSel.value;
  const outcome = document.getElementById('outcome').value;
  const side = document.getElementById('side').value;
  const e = outcome === 'red'
    ? { type: 'red', side, at: 60.2, minute: '61', player: side === 'home' ? 'D2' : 'XD2', seed: Math.floor(Math.random() * 1e9) }
    : { type: outcome === 'goal' ? 'goal' : 'chance', side, outcome: outcome === 'goal' ? null : outcome, kind, q: kind === 'penalty' ? 'pen' : 'std', at: 23.4, minute: '24', player: side === 'home' ? 'A2' : 'XA2', assist: side === 'home' ? 'M2' : 'XM2', seed: Math.floor(Math.random() * 1e9) };
  live = { id: ++id };
  Object.assign(matchFeed, { hl: { id: live.id, e, type: outcome === 'red' ? 'red' : kind === 'penalty' ? 'penalty' : outcome === 'goal' ? 'goal' : 'big', half: 1, replay: true, speed: 1, homeNames: NAMES, awayNames: NAMES.map((n) => `X${n}`), formation: '433', awayFormation: '442', offHome: [], offAway: [] }, hlAck: 0, hlReveal: 0, hlDone: 0, hlPhase: '' });
});
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (live) {
    const mi = squad.update(dt, now / 1000);
    if (mi) cam(mi, dt);
    renderer.render(scene, camera);
    if (state) state.textContent = matchFeed.hlDone === live.id ? 'Fini' : matchFeed.hlPhase === 'replay' ? 'Ralenti' : matchFeed.hlReveal === live.id ? 'Instant décisif passé' : 'Action';
  }
  requestAnimationFrame(frame);
}
if (!params.get('w')) requestAnimationFrame(frame); // les captures (window.runHL) passent leur taille
renderer.render(scene, camera);
window.ready = true;
