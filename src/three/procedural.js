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
    m.name = key; // le public repère les sièges par le nom du matériau
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

// ---------- Bureau des transferts (niveaux 1 à 5) ----------
// Logo FootOFF (monogramme « FO », or sur noir) et panneau « TRANSFERTS » en textures dessinées une fois ;
// ils s'allument la nuit. Chaque niveau a sa propre architecture, de l'agence au campus.
const F_PATH = 'M594 256H1035V351H689V588H770.6A300 300 0 0 0 744.5 662H689V835L594 938Z';
const O_PATH = 'M770.6 588A300 300 0 1 1 744.5 662H829A218 218 0 1 0 867.6 588Z';
const texCache = new Map();
function canvasTexture(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const goldGrad = (g2, x0, y0, x1, y1) => {
  const gr = g2.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#B9924C'); gr.addColorStop(0.55, '#C7A15A'); gr.addColorStop(1, '#DEC17F');
  return gr;
};
function drawMonogram(g2, cx, cy, size) {
  const k = size / 768;
  g2.save();
  g2.translate(cx - 966 * k, cy - 640 * k);
  g2.scale(k, k);
  g2.fillStyle = goldGrad(g2, 940, 640, 1180, 300);
  g2.fill(new Path2D(F_PATH));
  g2.fill(new Path2D(O_PATH));
  g2.restore();
}
const logoTex = () => canvasTexture('logo', 256, 256, (g2, w, h) => {
  g2.fillStyle = '#0b0b0c'; g2.fillRect(0, 0, w, h);
  g2.strokeStyle = 'rgba(199,161,90,.55)'; g2.lineWidth = 6; g2.strokeRect(6, 6, w - 12, h - 12);
  drawMonogram(g2, w / 2, h / 2, 190);
});
const boardTex = () => canvasTexture('board', 512, 256, (g2, w, h) => {
  g2.fillStyle = '#0b0b0c'; g2.fillRect(0, 0, w, h);
  drawMonogram(g2, 70, 70, 96);
  g2.fillStyle = goldGrad(g2, 0, 0, w, 0);
  g2.font = '600 46px Inter, Arial, sans-serif';
  g2.fillText('TRANSFERTS', 130, 86);
  g2.fillStyle = 'rgba(243,242,238,.85)';
  g2.font = '500 28px Inter, Arial, sans-serif';
  ['⇄  ARRIVÉES', '⇄  DÉPARTS', '⇄  MERCATO'].forEach((t, i) => g2.fillText(t, 40, 150 + i * 36));
  g2.fillStyle = '#C7A15A'; g2.fillRect(0, h - 10, w, 10);
});
const logoMat = () => {
  const t = logoTex();
  return mat('logoPanel', t ? { map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12, roughness: 0.45 } : { color: 0xc7a15a }, 1.1);
};
const boardMat = () => {
  const t = boardTex();
  return mat('transferBoard', t ? { map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25, roughness: 0.4 } : { color: 0x1c1c1e }, 1.3);
};
const tickerMat = () => mat('ticker', { color: 0xc7a15a, emissive: 0xdec17f, emissiveIntensity: 0.15, metalness: 0.4, roughness: 0.35 }, 1.6);
const darkGlass = () => mat('darkGlass', { color: 0x141a22, metalness: 0.9, roughness: 0.1, emissive: 0xffd9a0, emissiveIntensity: 0 }, 0.9);
const plane = (w, h) => geo(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));

// panneau plat face caméra (+Z), légèrement décollé de la façade
function panel(g, m, w, h, x, y, z, rotY = 0) {
  const o = new THREE.Mesh(plane(w, h), m);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  g.add(o);
  return o;
}
// tour vitrée : dalles d'étage, bandeau doré en tête, toit technique
function tower(g, { x, z, w, d, floors, fh = 0.42, glassMat = darkGlass(), band = true }) {
  const h = floors * fh;
  g.add(mesh(box(w, h, d), glassMat, x, h / 2, z));
  for (let i = 1; i < floors; i++) g.add(mesh(box(w + 0.04, 0.045, d + 0.04), M.concreteDark(), x, i * fh, z));
  if (band) g.add(mesh(box(w + 0.06, 0.1, d + 0.06), M.gold(), x, h - 0.1, z));
  g.add(mesh(box(w + 0.12, 0.07, d + 0.12), M.concreteDark(), x, h + 0.035, z));
  return h;
}
// panneau des transferts sur pied, devant l'entrée
function transferBoard(g, x, z, w) {
  const hgt = w * 0.5;
  g.add(mesh(cyl(0.035, 0.035, 0.55), M.steel(), x - w * 0.35, 0.28, z));
  g.add(mesh(cyl(0.035, 0.035, 0.55), M.steel(), x + w * 0.35, 0.28, z));
  g.add(mesh(box(w + 0.08, hgt + 0.08, 0.06), M.canvas(), x, 0.55 + hgt / 2, z - 0.035));
  panel(g, boardMat(), w, hgt, x, 0.55 + hgt / 2, z);
}
function plaza(g, w, d, z) {
  const p = mesh(box(w, 0.04, d), M.padTop(), 0, 0.02, z);
  p.castShadow = false; g.add(p);
}

function transfersMesh(lvl) {
  const g = new THREE.Group();
  if (lvl === 1) { // l'agence : pavillon vitré, enseigne au logo sur le toit, petit panneau devant
    plaza(g, S * 0.9, S * 0.35, S * 0.22);
    g.add(mesh(box(S * 0.6, 0.6, S * 0.34), darkGlass(), -S * 0.08, 0.3, -S * 0.15));
    g.add(mesh(box(S * 0.64, 0.08, S * 0.4), M.concreteDark(), -S * 0.08, 0.64, -S * 0.13));
    g.add(mesh(box(S * 0.64, 0.05, 0.05), M.gold(), -S * 0.08, 0.6, S * 0.07));
    g.add(mesh(box(0.06, 0.32, 0.06), M.steel(), -S * 0.08, 0.84, -S * 0.15));
    g.add(mesh(box(0.74, 0.74, 0.06), M.canvas(), -S * 0.08, 1.33, -S * 0.155));
    panel(g, logoMat(), 0.66, 0.66, -S * 0.08, 1.33, -S * 0.155 + 0.035);
    transferBoard(g, S * 0.24, S * 0.27, 0.9);
    return g;
  }
  if (lvl === 2) { // les bureaux : deux étages, logo en façade, annexe d'accueil des agents
    plaza(g, S * 0.95, S * 0.36, S * 0.24);
    const h = tower(g, { x: -S * 0.14, z: -S * 0.16, w: S * 0.5, d: S * 0.36, floors: 2, fh: 0.48 });
    panel(g, logoMat(), 0.6, 0.6, -S * 0.14, h * 0.52, -S * 0.16 + S * 0.18 + 0.04);
    const annex = new THREE.Group();
    annex.position.set(S * 0.27, 0, -S * 0.1);
    annex.add(mesh(box(S * 0.3, 0.5, S * 0.28), M.facade(), 0, 0.25, 0));
    windowsOn(annex, S * 0.3, 0.5, 1, S * 0.14 + 0.02, 3);
    annex.add(mesh(box(S * 0.34, 0.06, S * 0.32), M.concreteDark(), 0, 0.53, 0));
    g.add(annex);
    transferBoard(g, S * 0.12, S * 0.3, 1.1);
    return g;
  }
  if (lvl === 3) { // le siège : tour de quatre étages, grand logo, bandeau lumineux et mâts
    plaza(g, S * 0.95, S * 0.4, S * 0.24);
    const h = tower(g, { x: -S * 0.12, z: -S * 0.18, w: S * 0.48, d: S * 0.38, floors: 4 });
    const front = -S * 0.18 + S * 0.19 + 0.04;
    panel(g, logoMat(), 0.95, 0.95, -S * 0.12, h * 0.62, front);
    g.add(mesh(box(S * 0.5, 0.08, 0.05), tickerMat(), -S * 0.12, 0.62, front));
    g.add(mesh(box(S * 0.34, 0.45, S * 0.32), M.facade(), S * 0.3, 0.225, -S * 0.12));
    for (const fx of [S * 0.32, S * 0.4]) {
      g.add(mesh(cyl(0.02, 0.02, 1.3, 6), M.steel(), fx, 0.65, S * 0.12));
      g.add(mesh(box(0.34, 0.2, 0.02), M.gold(), fx + 0.18, 1.18, S * 0.12));
    }
    transferBoard(g, -S * 0.02, S * 0.32, 1.3);
    return g;
  }
  if (lvl === 4) { // la tour : six étages, ailettes dorées, couronne au logo lumineux sur deux faces
    plaza(g, S * 0.95, S * 0.42, S * 0.24);
    const w = S * 0.46, d = S * 0.4, x = -S * 0.12, z = -S * 0.16;
    const h = tower(g, { x, z, w, d, floors: 6, fh: 0.4 });
    for (let i = 0; i <= 5; i++) g.add(mesh(box(0.04, h, 0.08), M.gold(), x - w / 2 + (w / 5) * i, h / 2, z + d / 2 + 0.04));
    g.add(mesh(box(w + 0.1, 0.12, d + 0.1), tickerMat(), x, h - 0.3, z)); // bandeau lumineux
    g.add(mesh(box(w * 0.7, 0.7, d * 0.7), M.canvas(), x, h + 0.42, z)); // couronne
    panel(g, logoMat(), 0.62, 0.62, x, h + 0.42, z + d * 0.35 + 0.01);
    panel(g, logoMat(), 0.62, 0.62, x + w * 0.35 + 0.01, h + 0.42, z, Math.PI / 2);
    g.add(mesh(box(S * 0.36, 0.55, S * 0.34), M.facade(), S * 0.29, 0.275, -S * 0.1)); // podium d'accueil
    g.add(mesh(box(S * 0.4, 0.05, 0.05), M.gold(), S * 0.29, 0.5, -S * 0.1 + S * 0.17 + 0.03));
    transferBoard(g, S * 0.02, S * 0.33, 1.4);
    return g;
  }
  // niveau 5, le campus : deux tours reliées par une passerelle, logo géant, antenne et grand écran
  plaza(g, S * 0.98, S * 0.45, S * 0.24);
  const hA = tower(g, { x: -S * 0.2, z: -S * 0.18, w: S * 0.36, d: S * 0.36, floors: 8, fh: 0.4 });
  const hB = tower(g, { x: S * 0.24, z: -S * 0.2, w: S * 0.3, d: S * 0.3, floors: 6, fh: 0.4 });
  for (const [tx, tw, td, th] of [[-S * 0.2, S * 0.36, S * 0.36, hA], [S * 0.24, S * 0.3, S * 0.3, hB]]) {
    for (let i = 0; i <= 4; i++) g.add(mesh(box(0.035, th, 0.07), M.gold(), tx - tw / 2 + (tw / 4) * i, th / 2, -S * 0.19 + td / 2 + 0.04));
  }
  g.add(mesh(box(S * 0.16, 0.36, S * 0.16), darkGlass(), S * 0.02, hB - 0.6, -S * 0.19)); // passerelle
  g.add(mesh(box(S * 0.16, 0.05, S * 0.17), M.gold(), S * 0.02, hB - 0.4, -S * 0.19));
  g.add(mesh(box(S * 0.3, 0.95, 0.1), M.canvas(), -S * 0.2, hA + 0.55, -S * 0.19 + S * 0.12)); // logo géant
  panel(g, logoMat(), 0.86, 0.86, -S * 0.2, hA + 0.55, -S * 0.19 + S * 0.12 + 0.055);
  g.add(mesh(cyl(0.025, 0.05, 1.3, 6), M.steel(), -S * 0.28, hA + 0.65, -S * 0.26)); // antenne
  g.add(mesh(box(S * 0.36 + 0.1, 0.12, S * 0.36 + 0.1), tickerMat(), -S * 0.2, hA - 0.3, -S * 0.18));
  transferBoard(g, S * 0.05, S * 0.34, 1.6);
  return g;
}

// Direction du club : la maison du président, où se négocient droits TV, salaires et billetterie. Pierre claire et
// encadrements dorés, mâts aux couleurs du club ; elle grandit de l'hôtel particulier au grand siège à rotonde.
function flagPole(g, x, z, h = 1.25) {
  g.add(mesh(cyl(0.018, 0.024, h, 6), M.steel(), x, h / 2, z));
  g.add(mesh(box(0.36, 0.22, 0.012), M.gold(), x + 0.19, h - 0.14, z));
}
function stoneBlock(g, x, z, w, d, h) {
  g.add(mesh(box(w, h, d), M.facade(), x, h / 2, z));
  g.add(mesh(box(w + 0.06, 0.06, d + 0.06), M.concreteDark(), x, h + 0.03, z)); // corniche
}
// sous-groupe décalé (fenêtres centrées sur un bloc, tour posée sur un socle)
const at = (g, x = 0, y = 0) => { const r = new THREE.Group(); r.position.set(x, y, 0); g.add(r); return r; };
function directionMesh(lvl) {
  const g = new THREE.Group();
  if (lvl === 1) { // l'hôtel particulier : deux niveaux de pierre, porte encadrée d'or, mât du club
    plaza(g, S * 0.85, S * 0.34, S * 0.22);
    stoneBlock(g, -S * 0.06, -S * 0.15, S * 0.56, S * 0.34, 0.9);
    windowsOn(at(g, -S * 0.06), S * 0.56, 0.9, 2, -S * 0.15 + S * 0.17 + 0.02, 5);
    g.add(mesh(box(0.34, 0.5, 0.05), darkGlass(), -S * 0.06, 0.25, -S * 0.15 + S * 0.17 + 0.03)); // entrée
    g.add(mesh(box(0.42, 0.05, 0.08), M.gold(), -S * 0.06, 0.52, -S * 0.15 + S * 0.17 + 0.05));
    panel(g, logoMat(), 0.42, 0.42, -S * 0.06, 0.74, -S * 0.15 + S * 0.17 + 0.035);
    flagPole(g, S * 0.3, S * 0.18);
    return g;
  }
  if (lvl === 2) { // le siège : trois niveaux, auvent vitré, deux mâts
    plaza(g, S * 0.92, S * 0.36, S * 0.24);
    stoneBlock(g, -S * 0.06, -S * 0.16, S * 0.62, S * 0.36, 1.3);
    windowsOn(at(g, -S * 0.06), S * 0.62, 1.3, 3, -S * 0.16 + S * 0.18 + 0.02, 6);
    const front = -S * 0.16 + S * 0.18;
    g.add(mesh(box(0.5, 0.55, 0.05), darkGlass(), -S * 0.06, 0.275, front + 0.03));
    g.add(mesh(box(0.8, 0.04, 0.42), darkGlass(), -S * 0.06, 0.6, front + 0.2)); // auvent
    g.add(mesh(box(0.84, 0.03, 0.03), M.gold(), -S * 0.06, 0.62, front + 0.41));
    panel(g, logoMat(), 0.5, 0.5, -S * 0.06, 1.0, front + 0.035);
    flagPole(g, S * 0.28, S * 0.2);
    flagPole(g, S * 0.36, S * 0.2);
    return g;
  }
  if (lvl === 3) { // l'immeuble : socle de pierre, quatre étages vitrés, salle du conseil sur le toit
    plaza(g, S * 0.95, S * 0.4, S * 0.24);
    stoneBlock(g, -S * 0.08, -S * 0.17, S * 0.56, S * 0.38, 0.5);
    const h = 0.56 + tower(at(g, 0, 0.56), { x: -S * 0.08, z: -S * 0.17, w: S * 0.5, d: S * 0.34, floors: 3, fh: 0.42 });
    g.add(mesh(box(S * 0.3, 0.38, S * 0.22), darkGlass(), -S * 0.08, h + 0.19, -S * 0.17)); // salle du conseil
    g.add(mesh(box(S * 0.32, 0.04, S * 0.24), M.gold(), -S * 0.08, h + 0.4, -S * 0.17));
    panel(g, logoMat(), 0.6, 0.6, -S * 0.08, 0.28, -S * 0.17 + S * 0.19 + 0.035);
    for (const fx of [S * 0.26, S * 0.33, S * 0.4]) flagPole(g, fx, S * 0.2, 1.35);
    return g;
  }
  if (lvl === 4) { // la tour : six étages, ailettes dorées, salle du conseil vitrée en couronne, fontaine
    plaza(g, S * 0.95, S * 0.42, S * 0.24);
    const w = S * 0.46, d = S * 0.38, x = -S * 0.1, z = -S * 0.17;
    stoneBlock(g, x, z, w + 0.1, d + 0.1, 0.5);
    const h = 0.56 + tower(at(g, 0, 0.56), { x, z, w, d, floors: 5, fh: 0.4 });
    for (let i = 0; i <= 4; i++) g.add(mesh(box(0.04, h - 0.5, 0.07), M.gold(), x - w / 2 + (w / 4) * i, 0.5 + (h - 0.5) / 2, z + d / 2 + 0.04));
    g.add(mesh(box(w * 0.8, 0.5, d * 0.8), darkGlass(), x, h + 0.25, z));
    g.add(mesh(box(w * 0.84, 0.05, d * 0.84), M.gold(), x, h + 0.52, z));
    panel(g, logoMat(), 0.66, 0.66, x, 0.28, z + d / 2 + 0.085);
    g.add(mesh(cyl(0.34, 0.38, 0.08, 20), M.concreteDark(), S * 0.3, 0.04, S * 0.08)); // fontaine
    g.add(mesh(cyl(0.28, 0.28, 0.03, 20), darkGlass(), S * 0.3, 0.09, S * 0.08));
    for (const fx of [S * 0.22, S * 0.3, S * 0.38]) flagPole(g, fx, S * 0.26, 1.45);
    return g;
  }
  // niveau 5, le grand siège : tour de neuf étages, rotonde à anneau doré, couronne lumineuse, allée de mâts
  plaza(g, S * 0.98, S * 0.46, S * 0.24);
  const w = S * 0.36, d = S * 0.34, x = -S * 0.2, z = -S * 0.18;
  stoneBlock(g, x, z, w + 0.1, d + 0.1, 0.5);
  const h = 0.56 + tower(at(g, 0, 0.56), { x, z, w, d, floors: 8, fh: 0.4 });
  for (let i = 0; i <= 4; i++) g.add(mesh(box(0.035, h - 0.5, 0.07), M.gold(), x - w / 2 + (w / 4) * i, 0.5 + (h - 0.5) / 2, z + d / 2 + 0.04));
  g.add(mesh(box(w + 0.1, 0.12, d + 0.1), tickerMat(), x, h - 0.3, z)); // bandeau lumineux
  g.add(mesh(box(w * 0.8, 0.55, d * 0.8), darkGlass(), x, h + 0.27, z)); // salle du conseil
  panel(g, logoMat(), 0.6, 0.6, x, h + 0.3, z + d * 0.4 + 0.01);
  g.add(mesh(cyl(S * 0.17, S * 0.17, 0.9, 28), M.facade(), S * 0.22, 0.45, -S * 0.14)); // rotonde
  g.add(mesh(cyl(S * 0.18, S * 0.18, 0.06, 28), M.gold(), S * 0.22, 0.93, -S * 0.14));
  g.add(mesh(cyl(S * 0.12, S * 0.17, 0.32, 28), darkGlass(), S * 0.22, 1.12, -S * 0.14)); // verrière
  for (const fx of [S * 0.08, S * 0.16, S * 0.24, S * 0.32, S * 0.4]) flagPole(g, fx, S * 0.3, 1.5);
  return g;
}

const BUILDERS = { training: trainingMesh, academy: academyMesh, fans: fansMesh, sponsor: sponsorMesh, transfers: transfersMesh, direction: directionMesh };

export function buildingMesh(key, lvl) {
  return (BUILDERS[key] || trainingMesh)(Math.max(1, lvl));
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
  texCache.forEach((t) => t.dispose());
  texCache.clear();
  geoCache.forEach((g) => g.dispose());
  matCache.forEach((m) => m.dispose());
  geoCache.clear();
  matCache.clear();
}
