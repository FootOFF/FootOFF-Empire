// Palette FootOFF Media : or #C7A15A, noir #090909, blanc cassé #F3F2EE.
import * as THREE from 'three';
import { PLOT_SIZE } from './layout';

// Modèles procéduraux : repli tant qu'un GLB n'existe pas pour (bâtiment, niveau).
// Géométries et matériaux sont mis en cache et partagés : ne jamais les disposer individuellement
// (voir disposeShared()).

const geoCache = new Map();
const matCache = new Map();

function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const box = (w, h, d) => geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 12) => geo(`cyl:${rt}:${rb}:${h}:${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

// Matériau partagé. `night` : intensité émissive appliquée la nuit (le jour = `day`, 0 par défaut).
export function mat(key, params, night) {
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial(params);
    if (night !== undefined) m.userData.nightEmissive = { day: params.emissiveIntensity ?? 0, night };
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const M = {
  grass: () => mat('grass', { color: 0x3f7d3a, roughness: 0.95 }),
  dirt: () => mat('dirt', { color: 0x7a6142, roughness: 1 }),
  line: () => mat('line', { color: 0xf2f2f2, roughness: 0.6 }),
  concrete: () => mat('concrete', { color: 0x9d9c96, roughness: 0.85 }),
  concreteDark: () => mat('concreteDark', { color: 0x6c6e72, roughness: 0.85 }),
  seats: () => mat('seats', { color: 0x262628, roughness: 0.55 }),
  roof: () => mat('roof', { color: 0xc7a15a, metalness: 0.6, roughness: 0.35 }),
  steel: () => mat('steel', { color: 0xb8bec8, metalness: 0.8, roughness: 0.35 }),
  lampHead: () => mat('lampHead', { color: 0x1a1e28, emissive: 0xfff2d8, emissiveIntensity: 0.05, roughness: 0.4 }, 4),
  glass: () => mat('glass', { color: 0x1d2a3a, metalness: 0.9, roughness: 0.12, emissive: 0xffd9a0, emissiveIntensity: 0 }, 1.4),
  brick: () => mat('brick', { color: 0x9b4a3a, roughness: 0.85 }),
  stone: () => mat('stone', { color: 0xcdbf9f, roughness: 0.8 }),
  tiles: () => mat('tiles', { color: 0x6b3a2a, roughness: 0.75 }),
  facade: () => mat('facade', { color: 0xdedbd2, roughness: 0.7 }),
  wood: () => mat('wood', { color: 0x7a5434, roughness: 0.9 }),
  padTop: () => mat('padTop', { color: 0x8a8c8f, roughness: 0.95 }),
  gold: () => mat('gold', { color: 0xc7a15a, metalness: 0.7, roughness: 0.3, emissive: 0xc7a15a, emissiveIntensity: 0 }, 0.6),
  canvas: () => mat('canvas', { color: 0x1c1c1e, roughness: 0.8 }),
};

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// ---------- Stade (niveaux 1 à 4) ----------
// Le côté +Z (face caméra) reste bas et ouvert : la pelouse doit toujours être visible.
export function stadiumMesh(lvl) {
  const g = new THREE.Group();
  const field = mesh(box(10.5, 0.2, 6.8), lvl >= 2 ? M.grass() : M.dirt(), 0, 0.1, 0);
  field.castShadow = false;
  g.add(field);
  g.add(mesh(box(0.08, 0.02, 6.6), M.line(), 0, 0.21, 0));
  const ring = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.9, 0.04, 6, 40)), M.line());
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.21; g.add(ring);
  for (const sx of [-1, 1]) {
    // surfaces de réparation
    const pen = new THREE.Mesh(geo('pen', () => new THREE.TorusGeometry(1, 0.03, 4, 4, Math.PI)), M.line());
    pen.rotation.set(Math.PI / 2, 0, (sx > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 4);
    pen.position.set(sx * 5.25, 0.21, 0);
    g.add(pen);
    // buts
    g.add(mesh(box(0.06, 0.24, 0.8), M.line(), sx * 5.3, 0.32, 0));
  }

  // Gradins en escalier (3 marches), plus hauts à chaque niveau.
  const tiers = (w, depth, h, x, z, rotY, roofed) => {
    const s = new THREE.Group();
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      const sh = (h * (steps - i)) / steps; // marche haute au fond, basse côté pelouse (+Z local)
      const sd = depth / steps;
      s.add(mesh(box(w, sh, sd), M.concrete(), 0, sh / 2, -depth / 2 + sd * (i + 0.5)));
      s.add(mesh(box(w * 0.96, 0.06, sd * 0.7), M.seats(), 0, sh + 0.03, -depth / 2 + sd * (i + 0.5)));
    }
    if (roofed) {
      s.add(mesh(box(w + 0.4, 0.12, depth + 0.6), M.roof(), 0, h + 1.1, 0.2));
      for (const px of [-w / 2 + 0.2, 0, w / 2 - 0.2]) s.add(mesh(cyl(0.06, 0.06, h + 1.1), M.steel(), px, (h + 1.1) / 2, -depth / 2 + 0.1));
    }
    s.position.set(x, 0, z);
    s.rotation.y = rotY;
    g.add(s);
  };
  const h = 0.4 + lvl * 0.45;
  // tribune principale (nord, -Z) : dos au nord
  tiers(10, 1.6 + lvl * 0.15, h * (lvl >= 3 ? 1.5 : 1), 0, -3.4 - (0.8 + lvl * 0.075), 0, lvl >= 2);
  if (lvl >= 2) {
    tiers(6.4, 1.6, h, -6.2, 0, Math.PI / 2, lvl >= 4);
    tiers(6.4, 1.6, h, 6.2, 0, -Math.PI / 2, lvl >= 4);
  }
  // côté caméra (+Z) : toujours bas, sans toit
  tiers(9, 1.2, Math.min(h, 0.8), 0, 4.3, Math.PI, false);

  // Projecteurs
  const mast = (x, z, mh, big) => {
    const m = new THREE.Group();
    m.add(mesh(cyl(big ? 0.1 : 0.06, big ? 0.14 : 0.08, mh), M.steel(), 0, mh / 2, 0));
    const head = mesh(box(big ? 1.2 : 0.6, big ? 0.7 : 0.4, 0.2), M.lampHead(), 0, mh, 0);
    head.rotation.x = 0.45; // incliné vers la pelouse
    m.add(head);
    m.position.set(x, 0, z);
    m.rotation.y = Math.atan2(-x, -z);
    g.add(m);
  };
  if (lvl <= 2) { mast(-5.8, -3.9, 2.8, false); mast(5.8, -3.9, 2.8, false); mast(-5.8, 3.9, 2.8, false); mast(5.8, 3.9, 2.8, false); }
  else { for (const [x, z] of [[-7, -5.6], [7, -5.6], [-7, 5.6], [7, 5.6]]) mast(x, z, 4.6 + (lvl - 3) * 1.2, true); }

  if (lvl >= 4) {
    // bandeau LED sous le toit principal
    g.add(mesh(box(9, 0.3, 0.05), M.gold(), 0, h * 1.5 + 0.8, -3.4));
  }
  g.scale.setScalar(1.12);
  g.userData.floodlight = lvl >= 1;
  return g;
}

// ---------- Bâtiments des parcelles ----------
const S = PLOT_SIZE;

function windowsOn(g, w, hTotal, floors, z, xCount = 4) {
  const fh = hTotal / floors;
  for (let f = 0; f < floors; f++) for (let c = 0; c < xCount; c++) {
    const x = -w / 2 + (w / xCount) * (c + 0.5);
    g.add(mesh(box((w / xCount) * 0.6, fh * 0.45, 0.04), M.glass(), x, fh * (f + 0.55), z));
  }
}

function trainingMesh(lvl) {
  const g = new THREE.Group();
  // terrain annexe
  const pitch = mesh(box(S * 0.95, 0.1, S * 0.45), M.grass(), 0, 0.05, S * 0.24);
  pitch.castShadow = false; g.add(pitch);
  g.add(mesh(box(0.05, 0.02, S * 0.43), M.line(), 0, 0.11, S * 0.24));
  // bâtiment : un étage par niveau (max 3), s'élargit ensuite
  const floors = Math.min(lvl, 3);
  const w = S * (lvl >= 4 ? 0.95 : 0.7), d = S * 0.4, fh = 0.55;
  g.add(mesh(box(w, floors * fh, d), M.brick(), 0, (floors * fh) / 2, -S * 0.25));
  windowsOn(g, w, floors * fh, floors, -S * 0.25 + d / 2 + 0.02, 5);
  g.add(mesh(box(w + 0.1, 0.08, d + 0.1), M.concreteDark(), 0, floors * fh + 0.04, -S * 0.25));
  if (lvl >= 5) g.add(mesh(box(w * 0.5, 0.4, d * 0.7), M.glass(), 0, floors * fh + 0.28, -S * 0.25));
  return g;
}

function academyMesh(lvl) {
  const g = new THREE.Group();
  const floors = Math.min(1 + Math.ceil(lvl / 2), 3);
  const w = S * 0.75, d = S * 0.35, fh = 0.5;
  g.add(mesh(box(w, floors * fh, d), M.stone(), 0, (floors * fh) / 2, -S * 0.22));
  windowsOn(g, w, floors * fh, floors, -S * 0.22 + d / 2 + 0.02, 5);
  const roof = mesh(geo(`aroof:${w}:${d}`, () => {
    const r = new THREE.CylinderGeometry(0.01, d * 0.75, w, 4, 1);
    r.rotateZ(Math.PI / 2); r.rotateX(Math.PI / 4);
    return r;
  }), M.tiles(), 0, floors * fh + 0.25, -S * 0.22);
  roof.scale.set(1, 0.6, 1);
  g.add(roof);
  if (lvl >= 2) g.add(mesh(box(S * 0.3, fh * 2, S * 0.35), M.stone(), -S * 0.3, fh, S * 0.12)); // dortoir
  if (lvl >= 3) {
    const p = mesh(box(S * 0.55, 0.08, S * 0.38), M.grass(), S * 0.15, 0.04, S * 0.22);
    p.castShadow = false; g.add(p);
  }
  return g;
}

function fansMesh(lvl) {
  const g = new THREE.Group();
  // buvette
  g.add(mesh(box(S * 0.35, 0.45, S * 0.25), M.wood(), -S * 0.25, 0.225, -S * 0.25));
  g.add(mesh(box(S * 0.4, 0.06, S * 0.32), M.canvas(), -S * 0.25, 0.5, -S * 0.22));
  // tentes de fan zone
  for (let i = 0; i < Math.min(lvl, 4); i++) {
    const t = mesh(geo('tent', () => new THREE.ConeGeometry(0.5, 0.6, 4)), i % 2 ? M.canvas() : M.gold(), -S * 0.3 + i * 1.2, 0.3, S * 0.25);
    t.rotation.y = Math.PI / 4; g.add(t);
  }
  if (lvl >= 3) {
    // bar des supporters
    g.add(mesh(box(S * 0.4, 0.9, S * 0.3), M.brick(), S * 0.22, 0.45, -S * 0.22));
    windowsOn(g, S * 0.4, 0.9, 2, -S * 0.22 + S * 0.15 + 0.02, 3);
  }
  if (lvl >= 4) {
    // écran géant
    g.add(mesh(cyl(0.05, 0.05, 1.4), M.steel(), S * 0.32, 0.7, S * 0.1));
    g.add(mesh(box(1.6, 0.9, 0.08), M.glass(), S * 0.32, 1.6, S * 0.1));
  }
  if (lvl >= 5) g.add(mesh(cyl(0.25, 0.3, 0.9, 8), M.gold(), 0, 0.45, 0));
  return g;
}

function sponsorMesh(lvl) {
  const g = new THREE.Group();
  const floors = 1 + lvl * 2;
  const fh = 0.42, w = S * 0.5, d = S * 0.5;
  const h = floors * fh;
  g.add(mesh(box(w, h, d), lvl >= 3 ? M.glass() : M.facade(), 0, h / 2, -S * 0.08));
  if (lvl < 3) {
    windowsOn(g, w, h, floors, -S * 0.08 + d / 2 + 0.02, 4);
  } else {
    // résille de poteaux sur la façade vitrée
    for (let i = 0; i <= 4; i++) g.add(mesh(box(0.05, h, 0.05), M.steel(), -w / 2 + (w / 4) * i, h / 2, -S * 0.08 + d / 2 + 0.03));
  }
  g.add(mesh(box(w + 0.15, 0.12, d + 0.15), M.concreteDark(), 0, h + 0.06, -S * 0.08));
  // hall partenaires
  g.add(mesh(box(S * 0.8, 0.5, S * 0.22), M.facade(), 0, 0.25, S * 0.3));
  if (lvl >= 4) g.add(mesh(box(w * 0.7, 0.4, 0.06), M.gold(), 0, h - 0.3, -S * 0.08 + d / 2 + 0.06)); // logo
  return g;
}

const BUILDERS = { training: trainingMesh, academy: academyMesh, fans: fansMesh, sponsor: sponsorMesh };

export function buildingMesh(key, lvl) {
  return (BUILDERS[key] || trainingMesh)(Math.max(1, lvl));
}

// Parcelle verrouillée : terrain vague clôturé.
export function wastelandMesh() {
  const g = new THREE.Group();
  const dirt = mesh(box(S, 0.08, S), M.dirt(), 0, 0.04, 0);
  dirt.castShadow = false; g.add(dirt);
  const s = S / 2 - 0.1;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s], [0, -s], [0, s], [-s, 0], [s, 0]]) {
    g.add(mesh(box(0.08, 0.45, 0.08), M.wood(), x, 0.225, z));
  }
  g.add(mesh(box(s * 2, 0.05, 0.05), M.wood(), 0, 0.32, -s));
  g.add(mesh(box(s * 2, 0.05, 0.05), M.wood(), 0, 0.32, s));
  g.add(mesh(box(0.05, 0.05, s * 2), M.wood(), -s, 0.32, 0));
  g.add(mesh(box(0.05, 0.05, s * 2), M.wood(), s, 0.32, 0));
  g.add(mesh(box(0.06, 0.7, 0.06), M.wood(), 0, 0.35, s));
  g.add(mesh(box(0.8, 0.4, 0.04), M.gold(), 0, 0.75, s));
  return g;
}

// Parcelle ouverte et vide : dalle prête à bâtir.
export function padMesh() {
  const g = new THREE.Group();
  const pad = mesh(box(S - 0.2, 0.06, S - 0.2), M.padTop(), 0, 0.03, 0);
  pad.castShadow = false; g.add(pad);
  const edge = new THREE.Mesh(box(S, 0.03, S), mat('padEdge', { color: 0xc7a15a, emissive: 0xc7a15a, emissiveIntensity: 0.15, roughness: 0.6 }));
  edge.position.y = 0.015; g.add(edge);
  return g;
}

// Bascule jour/nuit des matériaux procéduraux partagés.
export function setProceduralNight(night) {
  for (const m of matCache.values()) {
    const e = m.userData.nightEmissive;
    if (e) m.emissiveIntensity = night ? e.night : e.day;
  }
}

export function disposeShared() {
  geoCache.forEach((g) => g.dispose());
  matCache.forEach((m) => m.dispose());
  geoCache.clear();
  matCache.clear();
}
