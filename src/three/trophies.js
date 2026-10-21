import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { instantiateModel } from './assets';
import { resolveProp } from './manifest';
import { honoursOf, plural } from '../game/honours';

// Allée d'honneur du parvis : un socle et une réplique monumentale par compétition gagnée, posés à la première
// victoire. Les trophées s'alignent dans l'ordre de leurs premières victoires, en alternant les côtés de l'axe depuis
// la place ; la Coupe d'Europe trône au centre de la place. Chaque socle porte une plaque de bronze : la compétition
// et son nombre de victoires. Rien sur le parvis tant que le club n'a rien gagné.

const GROUND = 0.014; // dessus du dallage du parvis (14 cm)
const C1_AT = [0, 8.2];
const SLOTS = [[-2.05, 10.45], [2.05, 10.45], [-2.05, 11.75], [2.05, 11.75], [-2.05, 13.05], [2.05, 13.05]];
const TOP = { plinth: 1.42, plinthc1: 1.55 }; // dessus des socles (m, repère du modèle)
const SIDE_SCALE = 1.3; // répliques de l'allée un peu agrandies : lisibles depuis la vue d'ensemble
export const PARVIS = { x: 0, z: 10.375, w: 7.2, d: 7.75 }; // axe d'honneur : zone cliquable (salle des trophées)

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

// Plaque de bronze : grand chiffre (nombre de victoires), compétition, saisons. Lettres en relief polies.
function drawPlaque(h, c1) {
  const W = 1024, H = c1 ? 218 : 326;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W * 0.6, H * 1.4);
  bg.addColorStop(0, '#8d6a3b');
  bg.addColorStop(0.55, '#6f5129');
  bg.addColorStop(1, '#5a4021');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) { // bronze brossé
    g.fillStyle = `rgba(255, 228, 180, ${(Math.sin(y * 12.9898) * 43758.5453 % 1 + 1) % 1 * 0.05})`;
    g.fillRect(0, y, W, 1);
  }
  const raised = (draw) => { // relief : ombre portée sombre, puis lettre claire polie
    g.fillStyle = 'rgba(30, 18, 6, 0.75)';
    g.save(); g.translate(2, 3); draw(); g.restore();
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, '#fbe7b8');
    lg.addColorStop(1, '#d9b56e');
    g.fillStyle = lg;
    draw();
  };
  g.strokeStyle = 'rgba(32, 20, 8, 0.8)';
  g.lineWidth = 4;
  g.strokeRect(16, 16, W - 32, H - 32);
  g.strokeStyle = 'rgba(250, 226, 170, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(24, 24, W - 48, H - 48);
  const font = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;
  // chiffre
  const big = Math.round(H * (c1 ? 0.62 : 0.58));
  g.font = font(800, big);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const cx = c1 ? 150 : 170;
  raised(() => g.fillText(String(h.count), cx, H * (c1 ? 0.69 : 0.66)));
  g.font = font(700, Math.round(H * (c1 ? 0.1 : 0.085)));
  raised(() => g.fillText((h.count > 1 ? `${h.unit}s` : h.unit).toUpperCase(), cx, H * (c1 ? 0.88 : 0.85)));
  // séparateur, compétition, saisons
  g.fillStyle = 'rgba(32, 20, 8, 0.7)';
  g.fillRect(cx + (c1 ? 130 : 150), H * 0.2, 3, H * 0.6);
  g.textAlign = 'left';
  const x = cx + (c1 ? 165 : 185);
  const name = (c1 ? 'Coupe d’Europe des clubs' : h.name).toUpperCase();
  let size = Math.round(H * (c1 ? 0.21 : 0.15));
  g.font = font(800, size);
  while (g.measureText(name).width > W - x - 50 && size > 18) { size -= 2; g.font = font(800, size); }
  raised(() => g.fillText(name, x, H * (c1 ? 0.48 : 0.45)));
  g.font = font(600, Math.round(H * (c1 ? 0.13 : 0.1)));
  const seasons = h.count > 1 ? `Première : saison ${h.first} · dernière : saison ${h.last}` : `Saison ${h.first}`;
  raised(() => g.fillText(seasons, x, H * (c1 ? 0.75 : 0.66)));
  return cv;
}

export function createTrophies(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'trophies';
  group.userData.plotId = 'parvis'; // un clic sur l'axe ou sur un trophée ouvre la salle des trophées
  scene.add(group);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(PARVIS.w, 0.04, PARVIS.d), new THREE.MeshBasicMaterial({ visible: false }));
  pad.position.set(PARVIS.x, 0.02, PARVIS.z);
  group.add(pad);

  // nuit : l'or et l'argent reflètent un studio retourné (lumière venue du sol, comme des projecteurs encastrés)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  let lib = null; // id -> maillages du GLB (repère du modèle)
  let unit = 0.1;
  let wanted = null;
  let first = true;
  let dark = false;
  let lit = 0; // niveau d'éclairage du complexe (0 à 1)
  const placed = new Map(); // id -> { root, trophy, base, plaque, count, anim }
  const metals = new Set();
  const glows = new Set();
  const spots = [];

  const entry = resolveProp('trophies');
  if (entry) {
    instantiateModel(entry, { w: 1, d: 1 }).then((wrapper) => {
      const model = wrapper.children[0];
      unit = model.scale.x;
      lib = new Map();
      model.traverse((o) => {
        const m = o.isMesh && /^trophy_([a-z0-9]+)__/.exec(o.name);
        if (!m) return;
        if (!lib.has(m[1])) lib.set(m[1], []);
        lib.get(m[1]).push(o);
        if (/trophy_(gold|silver)/.test(o.material.name)) metals.add(o.material);
        if (/trophy_uplight/.test(o.material.name)) glows.add(o.material);
      });
      setDark(dark);
      if (wanted) sync(wanted);
    }).catch((err) => console.warn('[trophies] modèle indisponible', err));
  }

  const build = (id) => {
    const g = new THREE.Group();
    g.scale.setScalar(unit);
    (lib.get(id) || []).forEach((m) => { const c = m.clone(); c.castShadow = true; c.receiveShadow = true; g.add(c); });
    return g;
  };

  function plaqueMaterial(h, c1) {
    const tex = new THREE.CanvasTexture(drawPlaque(h, c1));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // UV glTF : v = 0 en haut
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.42 });
    // la police du jeu peut arriver après le premier dessin : on redessine une fois chargée
    document.fonts?.ready.then(() => { tex.image = drawPlaque(h, c1); tex.needsUpdate = true; });
    return mat;
  }

  function place(h, slot, animate) {
    const c1 = h.id === 'c1';
    const [x, z] = c1 ? C1_AT : SLOTS[Math.min(slot, SLOTS.length - 1)];
    const root = new THREE.Group();
    root.position.set(x, GROUND, z);
    if (!c1) root.scale.setScalar(SIDE_SCALE);
    const base = build(c1 ? 'plinthc1' : 'plinth');
    const plaque = build(c1 ? 'plaquec1' : 'plaque');
    const trophy = build(h.id);
    trophy.position.y = TOP[c1 ? 'plinthc1' : 'plinth'] * unit;
    const mat = plaqueMaterial(h, c1);
    plaque.traverse((o) => { if (o.isMesh) o.material = mat; });
    root.add(base, plaque, trophy);
    if (c1) {
      root.add(build('uplights'));
      for (const s of [-1, 1]) { // deux projecteurs au sol, comme pour l'ancien trophée géant
        const l = new THREE.SpotLight(0xffe2b0, 0, 3.2, Math.PI / 5, 0.6, 1.4);
        l.position.set(s * 0.45, 0.03, 0.55);
        l.target.position.set(0, 1.0, 0);
        root.add(l, l.target);
        spots.push(l);
      }
    }
    group.add(root);
    const p = { root, trophy, base, plaque, mat, count: h.count, first: h.first, last: h.last, anim: animate ? 0 : null, y: trophy.position.y };
    placed.set(h.id, p);
    if (animate) { base.scale.y = 0.001; plaque.visible = false; trophy.visible = false; }
    setDark(dark);
    return p;
  }

  // Synchronise l'allée avec le palmarès. Renvoie les trophées qui viennent d'apparaître (première victoire).
  function sync(state) {
    wanted = state;
    if (!lib) return [];
    const list = honoursOf(state);
    const fresh = [];
    let slot = 0;
    for (const h of list) {
      const p = placed.get(h.id);
      if (!p) {
        place(h, h.id === 'c1' ? 0 : slot, !first);
        if (!first) fresh.push(h.id);
      } else if (p.count !== h.count || p.last !== h.last) { // nouvelle victoire : la plaque change
        const old = p.mat;
        p.mat = plaqueMaterial(h, h.id === 'c1');
        p.plaque.traverse((o) => { if (o.isMesh) o.material = p.mat; });
        old.map.dispose();
        old.dispose();
        p.count = h.count;
        p.last = h.last;
      }
      if (h.id !== 'c1') slot += 1;
    }
    first = false;
    return fresh;
  }

  function setDark(d) {
    dark = d;
    metals.forEach((m) => {
      m.envMap = d ? studio : null; // nuit : studio retourné ; jour : le ciel (environnement de la scène)
      m.envMapRotation.set(d ? Math.PI : 0, 0, 0);
      m.envMapIntensity = d ? (/silver/.test(m.name) ? 0.22 : 0.42) : 1; // l'argent poli renvoie plus de lumière que l'or
    });
    setLights(d ? Math.max(lit, 1) : lit);
  }

  // projecteurs au sol de la Coupe d'Europe : allumés avec l'éclairage du complexe (dès le coucher du soleil)
  function setLights(level) {
    lit = level;
    glows.forEach((m) => { m.emissiveIntensity = 5 * level; });
    spots.forEach((l) => { l.intensity = 3 * level; });
  }

  // Apparition : le socle sort du sol, puis le trophée s'y pose.
  function update(dt) {
    placed.forEach((p) => {
      if (p.anim === null) return;
      p.anim += dt;
      const a = Math.min(1, p.anim / 0.7);
      p.base.scale.y = unit * Math.max(0.001, easeOut(a));
      if (a >= 1) p.plaque.visible = true;
      const b = THREE.MathUtils.clamp((p.anim - 0.7) / 1.1, 0, 1);
      p.trophy.visible = p.anim > 0.7;
      p.trophy.position.y = p.y + (1 - easeOut(b)) * 0.5;
      p.trophy.scale.setScalar(unit * (0.85 + 0.15 * easeBack(b)));
      if (p.anim > 1.8) { p.anim = null; p.trophy.position.y = p.y; p.trophy.scale.setScalar(unit); }
    });
  }

  // Point de vue pour montrer un trophée (vue d'ensemble -> gros plan) : position et cible de caméra.
  function viewOf(id) {
    const p = placed.get(id);
    if (!p) return null;
    const c1 = id === 'c1';
    const t = p.root.position.clone().add(new THREE.Vector3(0, c1 ? 0.75 : 0.55, 0));
    return { pos: t.clone().add(new THREE.Vector3(c1 ? 2.2 : 1.9, c1 ? 1.4 : 1.1, c1 ? 3.6 : 2.9)), target: t };
  }

  function dispose() {
    scene.remove(group);
    placed.forEach((p) => { p.mat.map.dispose(); p.mat.dispose(); });
    pad.geometry.dispose();
    pad.material.dispose();
    studio.dispose();
  }

  return { group, sync, setDark, setLights, update, viewOf, dispose, get placed() { return [...placed.keys()]; } };
}
