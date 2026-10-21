import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Water } from 'three/examples/jsm/objects/Water.js';

// Écrin naturel autour du complexe : la plateforme du site posée sur un plateau, des collines douces boisées qui
// ondulent jusqu'à l'horizon, un lac au nord-ouest juste derrière le stade, une forêt européenne (canopée au
// loin, arbres un par un près du site et en lisière), et le boulevard sud prolongé par une route bordée de
// platanes avec son tram. Tout est généré ici (aucun gros fichier à télécharger), en unités du jeu (1 = 10 m),
// x vers l'est, z vers le sud. Côté caméra (sud-est), le relief reste bas pour ne jamais masquer le complexe.

const SITE = { x0: -30, x1: 30, z0: -28, z1: 23 }; // plateforme du site (build_site.py)
const LAKE = { x: -56, z: -58, rx: 30, rz: 16, rot: 0.5, level: -0.35 };
const ROAD_Z = { median: [15.8, 17.2], rails: [16.15, 16.85], lanes: [17.2, 18.4], mid: 16.9 };
const EXTENT = 240;
const CAM = new THREE.Vector2(0.62, 0.78).normalize(); // direction de la caméra vue de dessus
const TREE_TOP = { haute: 1, auto: 1, economie: 0.45 };

// --- bruit -----------------------------------------------------------------------------------------

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perlin(seed) {
  const rand = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => { const u = h & 2 ? x : y; const v = h & 2 ? y : x; return ((h & 1) ? -u : u) + ((h & 4) ? -v : v) * 0.5; };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = THREE.MathUtils.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = THREE.MathUtils.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return THREE.MathUtils.lerp(x1, x2, v); // environ -1..1
  };
}
const N1 = perlin(7), N2 = perlin(19), N3 = perlin(31), N4 = perlin(43), N5 = perlin(57);
function fbm(n, x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, t = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}
// couleurs données en sRGB (comme les textures du site), converties en linéaire pour les couleurs de sommets
const _c = new THREE.Color();
const srgb = (r, g, b) => { _c.setRGB(r, g, b, THREE.SRGBColorSpace); return [_c.r, _c.g, _c.b]; };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0, e1, x) => { const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// --- relief, lac, forêt ------------------------------------------------------------------------------

function siteDist(x, z) {
  const dx = Math.max(SITE.x0 - x, 0, x - SITE.x1);
  const dz = Math.max(SITE.z0 - z, 0, z - SITE.z1);
  return Math.hypot(dx, dz);
}
function lakeQ(x, z) { // rayon normalisé dans l'ellipse du lac (1 = rive)
  const dx = x - LAKE.x, dz = z - LAKE.z;
  const c = Math.cos(LAKE.rot), s = Math.sin(LAKE.rot);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.hypot(u / LAKE.rx, v / LAKE.rz);
}
function facing(x, z) { const l = Math.hypot(x, z) || 1; return (x * CAM.x + z * CAM.y) / l; }
const inCorridor = (x, z, w) => Math.abs(x) > SITE.x1 - 1 && Math.abs(z - ROAD_Z.mid) < w;

export function heightAt(x, z) {
  const d = siteDist(x, z);
  // strictement sous la plateforme : enfoui ; sur son bord : au ras de sa pelouse (aucune tranche visible)
  if (x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1) return -0.06;
  const hills = 0.5 + 0.5 * fbm(N1, x / 55, z / 55, 4);
  const big = 0.5 + 0.5 * fbm(N2, x / 150 + 7, z / 150 - 3, 3);
  let h = smooth(4, 40, d) * hills * 6.5 + smooth(40, 170, d) * big * 13;
  h *= 1 - 0.78 * smooth(-0.1, 0.6, facing(x, z)) * (1 - smooth(70, 170, d)); // côté caméra : bas
  if (Math.abs(x) > SITE.x1 - 1) h *= smooth(2.6, 9, Math.abs(z - ROAD_Z.mid)); // couloir de la route
  const q = lakeQ(x, z);
  if (q < 1.6) {
    const shore = smooth(1.0, 1.6, q);
    h = h * shore + (1 - shore) * (LAKE.level + 0.1);
    if (q < 1) h = Math.min(h, LAKE.level - 0.2 - 1.8 * (1 - q * q));
  }
  return h;
}

function forestAt(x, z) {
  const d = siteDist(x, z);
  if (d <= 1) return 0;
  let m = smooth(0.0, 0.1, fbm(N3, x / 40, z / 40, 4)); // massifs nets, prés dégagés
  m *= smooth(6, 16, d); // lisière à 60-160 m de la plateforme
  m *= smooth(1.2, 1.55, lakeQ(x, z));
  if (inCorridor(x, z, 7)) m *= smooth(4, 7, Math.abs(z - ROAD_Z.mid));
  m *= 1 - 0.7 * smooth(0.2, 0.8, facing(x, z)) * (1 - smooth(20, 45, d)); // premier plan côté caméra dégagé
  return m;
}

// --- textures générées ------------------------------------------------------------------------------

function noiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x / size, y / size);
    const i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// bruit de valeur périodique (raccord sans couture), en octaves : organique, sans motif répétitif
function periodicNoise(seed, grids) {
  const layers = grids.map((G, k) => {
    const r = mulberry32(seed * 131 + k);
    const g = new Float32Array(G * G);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return { G, g, amp: 1 / (k + 1) ** 0.8 };
  });
  const total = layers.reduce((a, l) => a + l.amp, 0);
  return (u, v) => {
    let s = 0;
    for (const { G, g, amp } of layers) {
      const x = u * G, y = v * G;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      let tx = x - x0, ty = y - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const i0 = ((x0 % G) + G) % G, j0 = ((y0 % G) + G) % G, i1 = (i0 + 1) % G, j1 = (j0 + 1) % G;
      s += amp * ((g[j0 * G + i0] * (1 - tx) + g[j0 * G + i1] * tx) * (1 - ty) + (g[j1 * G + i0] * (1 - tx) + g[j1 * G + i1] * tx) * ty);
    }
    return s / total; // 0..1
  };
}
function normalFromHeight(size, hfn, strength) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = hfn(x / size, y / size);
  return noiseCanvas(size, (u, v) => {
    const x = Math.round(u * size), y = Math.round(v * size);
    const at = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
}
function repeatTexture(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- arbres -----------------------------------------------------------------------------------------

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const [r, g, b] = fn(v, i);
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}

// Textures de feuillage (fond transparent) : feuilles de feuillus en ellipses, aiguilles de pin en traits.
function foliageTexture(kind) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = mulberry32(kind === 'needle' ? 9 : 3);
  const green = (k) => {
    const t = 0.72 + 0.4 * r() - 0.18 * k;
    return kind === 'needle'
      ? `rgb(${Math.round(46 * t)},${Math.round(82 * t)},${Math.round(52 * t)})`
      : `rgb(${Math.round(76 * t)},${Math.round(114 * t)},${Math.round(42 * t)})`;
  };
  g.fillStyle = green(0.6);
  g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.17, S * 0.17, 0, 0, Math.PI * 2); g.fill(); // cœur opaque
  if (kind === 'needle') {
    g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 112;
      const x = S / 2 + Math.cos(a) * d * 1.05, y = S / 2 + Math.sin(a) * d * 0.7;
      g.strokeStyle = green(d / 112);
      g.lineWidth = 1.6 + r() * 1.4;
      const la = a + (r() - 0.5) * 0.9, len = 7 + r() * 9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(la) * len, y + Math.sin(la) * len); g.stroke();
    }
  } else {
    for (let i = 0; i < 760; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 114;
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.94;
      g.fillStyle = green(d / 114);
      g.beginPath(); g.ellipse(x, y, 5 + r() * 4.5, 2.6 + r() * 2.2, r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }
  // texture brute (non prémultipliée) : les pixels transparents prennent la couleur moyenne du feuillage, sinon les
  // niveaux de détail réduits mélangent du noir et les arbres lointains deviennent sombres
  const img = g.getImageData(0, 0, S, S).data;
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 200) { ar += img[i]; ag += img[i + 1]; ab += img[i + 2]; n++; }
  ar /= n; ag /= n; ab /= n;
  const data = new Uint8Array(img.length);
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3] / 255;
    data[i] = img[i] * a + ar * (1 - a); data[i + 1] = img[i + 1] * a + ag * (1 - a); data[i + 2] = img[i + 2] * a + ab * (1 - a);
    data[i + 3] = img[i + 3];
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const UPV = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
// Houppier en grappes : cartes de feuillage dans un ellipsoïde, normales sphériques (lumière douce et volumineuse),
// plus sombres dessous et au cœur (occlusion).
function foliageCards(rand, { cx, cy, cz, rx, ry, rz, cards, size, droop = 0, radial = false, tiers = null, perTier = 7, sides = 8 }) {
  const pos = [], nrm = [], uv = [], col = [];
  const center = new THREE.Vector3(cx, cy, cz);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), q = new THREE.Vector3();
  // carte en polygone arrondi (pas en carré) : au loin, quand la texture réduite devient pleine, la grappe reste
  // une masse ronde de feuillage au lieu d'un carré
  const quad = (half) => {
    const rot = rand() * Math.PI * 2;
    const corners = [], uvs = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2, rr = 0.86 + 0.14 * rand();
      corners.push(p.clone().addScaledVector(t1, Math.cos(a) * half * rr).addScaledVector(t2, Math.sin(a) * half * rr));
      uvs.push([0.5 + 0.48 * Math.cos(a - rot) * rr, 0.5 + 0.48 * Math.sin(a - rot) * rr]);
    }
    const order = [];
    for (let k = 1; k < sides - 1; k++) order.push(0, k, k + 1);
    for (const k of order) {
      const c = corners[k];
      pos.push(c.x, c.y, c.z);
      q.subVectors(c, center); q.y = q.y * 0.8 + 0.25 * ry; q.normalize();
      nrm.push(q.x, q.y, q.z);
      uv.push(uvs[k][0], uvs[k][1]);
      const h = THREE.MathUtils.clamp((c.y - (cy - ry)) / (2 * ry), 0, 1);
      const inner = THREE.MathUtils.clamp(c.distanceTo(center) / Math.max(rx, ry), 0, 1);
      const ao = 0.42 + 0.38 * h + 0.3 * inner;
      col.push(ao, ao, ao);
    }
  };
  if (tiers) { // pin : étages de branches horizontales tombantes, autour du tronc
    for (const { y, r } of tiers) {
      for (let k = 0; k < perTier; k++) {
        const a = (k / perTier) * Math.PI * 2 + rand() * 0.6;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        p.set(cx + dir.x * r * 0.55, y - r * 0.12, cz + dir.z * r * 0.55);
        t1.copy(dir);
        t2.crossVectors(UPV, dir).normalize();
        t1.applyAxisAngle(t2, 0.35 + droop);
        quad(r * 0.62);
      }
    }
  } else {
    for (let i = 0; i < cards; i++) {
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, rr = 0.5 + 0.5 * Math.cbrt(rand());
      const sq = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(sq * Math.cos(th), u, sq * Math.sin(th));
      p.set(cx + dir.x * rx * rr, cy + dir.y * ry * rr, cz + dir.z * rz * rr);
      n.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().lerp(dir, radial ? 0.7 : 0.4).normalize();
      t1.crossVectors(n, Math.abs(n.y) < 0.9 ? UPV : RIGHT).normalize();
      t2.crossVectors(n, t1);
      quad(size * (0.8 + 0.45 * rand()));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// Tronc et branches maîtresses (écorce), mêmes attributs que le feuillage pour la fusion en groupes.
function wood(rand, h, r0, r1, branches) {
  const parts = [];
  const bark = srgb(0.27, 0.21, 0.16);
  const cyl = (from, to, ra, rb) => {
    const d = new THREE.Vector3().subVectors(to, from);
    const g = new THREE.CylinderGeometry(rb, ra, d.length(), 5, 1, true).translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.clone().normalize()));
    g.translate(from.x, from.y, from.z);
    const ng = g.toNonIndexed();
    const uvs = new Float32Array(ng.attributes.position.count * 2).fill(0.5); // cœur opaque de la texture (ombres)
    ng.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const col = new Float32Array(ng.attributes.position.count * 3);
    for (let i = 0; i < ng.attributes.position.count; i++) col.set(bark, i * 3);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(ng);
  };
  cyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0), r0, r1);
  for (let k = 0; k < branches; k++) {
    const a = rand() * Math.PI * 2, y = h * (0.55 + rand() * 0.35);
    cyl(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * 0.2, y + 0.18, Math.sin(a) * 0.2), r1 * 0.9, r1 * 0.45);
  }
  return mergeGeometries(parts);
}

// arbres de hauteur 1 (mis à l'échelle par instance) : chêne, hêtre, pin, peuplier
function treeGeometries() {
  const r = mulberry32(5);
  const make = (woodGeo, leaves) => mergeGeometries([woodGeo, leaves], true); // groupe 0 : écorce, 1 : feuillage
  return {
    oak: make(wood(r, 0.5, 0.05, 0.03, 3), foliageCards(r, { cx: 0, cy: 0.66, cz: 0, rx: 0.37, ry: 0.27, rz: 0.37, cards: 24, size: 0.16 })),
    beech: make(wood(r, 0.5, 0.045, 0.028, 2), foliageCards(r, { cx: 0, cy: 0.64, cz: 0, rx: 0.3, ry: 0.33, rz: 0.3, cards: 22, size: 0.15 })),
    pine: make(wood(r, 0.82, 0.04, 0.02, 0), foliageCards(r, {
      cx: 0, cy: 0.6, cz: 0, rx: 0.25, ry: 0.4, rz: 0.25, cards: 0, size: 0, droop: 0.1,
      tiers: [0.36, 0.48, 0.6, 0.71, 0.81, 0.9].map((y, k) => ({ y, r: 0.27 * (1 - k / 6.5) + 0.04 })),
    })),
    poplar: make(wood(r, 0.32, 0.035, 0.025, 0), foliageCards(r, { cx: 0, cy: 0.62, cz: 0, rx: 0.13, ry: 0.42, rz: 0.13, cards: 22, size: 0.09, radial: true })),
    // versions allégées pour la forêt lointaine (dans la brume) : moins de cartes, plus grandes
    oakLow: make(wood(r, 0.5, 0.05, 0.03, 0), foliageCards(r, { cx: 0, cy: 0.66, cz: 0, rx: 0.32, ry: 0.26, rz: 0.32, cards: 13, size: 0.25, sides: 6 })),
    pineLow: make(wood(r, 0.82, 0.04, 0.02, 0), foliageCards(r, {
      cx: 0, cy: 0.6, cz: 0, rx: 0.25, ry: 0.4, rz: 0.25, cards: 0, size: 0, droop: 0.1,
      tiers: [0.36, 0.52, 0.68, 0.84].map((y, k) => ({ y, r: 0.3 * (1 - k / 5) + 0.04 })), perTier: 5, sides: 6,
    })),
  };
}

// Feuillage : alpha testé (cartes), vent léger, normales sphériques conservées des deux côtés des cartes.
function foliageMaterial(map, uniforms) {
  const m = new THREE.MeshStandardMaterial({
    map, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
  });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
        #else
          float ph = 0.0;
        #endif
        float sway = smoothstep(0.35, 1.0, position.y) * 0.014;
        transformed.x += sin(uTime * 1.3 + ph + position.y * 3.0) * sway;
        transformed.z += cos(uTime * 1.05 + ph * 1.3) * sway * 0.7;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  return m;
}

// --- construction ------------------------------------------------------------------------------------

function axis(lo, hi, marks) { // coordonnées de grille : fines près du site, plus larges au loin, bords du site exacts
  const out = new Set(marks);
  for (let v = lo; v <= hi + 1e-6; ) {
    out.add(Math.round(v * 100) / 100);
    const a = Math.abs(v);
    v += a < 64 ? 1.5 : a < 120 ? 3 : 6;
  }
  return [...out].sort((a, b) => a - b);
}

function buildTerrain(maps) {
  const xs = axis(-EXTENT, EXTENT, [SITE.x0, SITE.x1]);
  const zs = axis(-EXTENT, EXTENT, [SITE.z0, SITE.z1]);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const forest = new Float32Array(nx * nz);
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j], k = j * nx + i;
    const h = heightAt(x, z);
    const f = forestAt(x, z);
    heights[k] = h; forest[k] = f;
    pos.set([x, h, z], k * 3);
    uv.set([x / 4, z / 4], k * 2);
    // pelouse du site au contact, puis prairie (variations, fleurs), sous-bois sombre, rive sableuse, fond du lac
    const n = 0.5 + 0.5 * fbm(N4, x / 18, z / 18, 3);
    const flower = smooth(0.62, 0.8, 0.5 + 0.5 * fbm(N5, x / 9, z / 9, 2));
    const lawn = [0.155, 0.275, 0.105];
    const patch = 0.5 + 0.5 * fbm(N2, x / 26 + 11, z / 26 - 5, 2);
    const fresh = [0.19 + 0.06 * n, 0.33 + 0.06 * n, 0.11 + 0.03 * n];
    const hay = [0.36 + 0.05 * n, 0.38 + 0.04 * n, 0.17 + 0.02 * n];
    const dark = [0.16 + 0.04 * n, 0.29 + 0.04 * n, 0.10 + 0.02 * n];
    let meadow = patch < 0.42 ? mix3(dark, fresh, smooth(0.3, 0.42, patch)) : mix3(fresh, hay, smooth(0.6, 0.75, patch));
    meadow = mix3(meadow, [0.36, 0.34, 0.2], flower * 0.35); // prairie fleurie
    let c = mix3(lawn, meadow, smooth(1, 6, siteDist(x, z)));
    c = mix3(c, [0.10, 0.16, 0.07], smooth(0.1, 0.6, f));
    c = mix3(c, [0.075, 0.13, 0.065], smooth(0.3, 0.6, f) * smooth(100, 130, siteDist(x, z))); // massifs lointains
    const q = lakeQ(x, z);
    c = mix3(c, [0.42, 0.38, 0.28], (1 - smooth(1.0, 1.18, q)) * smooth(0.82, 0.98, q));
    if (q < 0.9) c = [0.14, 0.17, 0.12];
    col.set(srgb(...c), k * 3);
  }
  const idx = [];
  const inside = (x, z) => x > SITE.x0 + 1e-3 && x < SITE.x1 - 1e-3 && z > SITE.z0 + 1e-3 && z < SITE.z1 - 1e-3;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (inside(cx, cz)) continue; // la plateforme du site couvre ce carré
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: maps.grass, normalMap: maps.grassN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.96 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'landscape_terrain';

  return { mesh };
}

function scatterTrees(siteTrees) {
  const r = mulberry32(77);
  const list = []; // [x, y, z, échelle hauteur, échelle largeur, espèce]
  const kindAt = (x, z) => {
    if (fbm(N5, x / 30, z / 30, 2) > 0.22 && r() < 0.8) return 'pine';
    return r() < 0.55 ? 'oak' : 'beech';
  };
  const add = (x, z, kind, h) => {
    const y = heightAt(x, z);
    list.push([x, y, z, h, h * (0.85 + r() * 0.35), kind, r() * Math.PI * 2]);
  };
  // près de la plateforme : forêt dense, arbres isolés dans les prés, rive du lac
  for (let x = -75; x <= 75; x += 1.05) {
    for (let z = -80; z <= 72; z += 1.05) {
      const jx = x + (r() - 0.5) * 0.9, jz = z + (r() - 0.5) * 0.9;
      const d = siteDist(jx, jz);
      if (d < 1.2 || d > 18) continue;
      const q = lakeQ(jx, jz);
      if (q < 1.08 || inCorridor(jx, jz, 3.2)) continue;
      const f = forestAt(jx, jz);
      const shore = q < 1.4 ? 0.22 : 0;
      if (r() < f * 0.95 || r() < 0.005 + shore) add(jx, jz, kindAt(jx, jz), 0.85 + r() * 0.55);
    }
  }
  // forêts et bosquets au-delà, jusqu'à ~1,2 km : arbres allégés, denses au cœur des massifs
  const low = (k) => (k === 'pine' ? 'pineLow' : 'oakLow');
  for (let x = -150; x <= 150; x += 1.7) {
    for (let z = -150; z <= 140; z += 1.7) {
      const jx = x + (r() - 0.5) * 1.5, jz = z + (r() - 0.5) * 1.5;
      const d = siteDist(jx, jz);
      if (d <= 18 || d > 120) continue;
      if (lakeQ(jx, jz) < 1.08 || inCorridor(jx, jz, 3.2)) continue;
      const f = forestAt(jx, jz);
      if (r() < f * 0.9 || r() < 0.002) add(jx, jz, low(kindAt(jx, jz)), 1.0 + r() * 0.6);
    }
  }
  // route bordée de platanes (prolongement du boulevard sud)
  for (const s of [-1, 1]) {
    for (let x = SITE.x1 + 1.2; x < 170; x += 1.2) {
      for (const z of [15.15, 19.05]) list.push([s * x, 0, z, 1.25 + r() * 0.15, 1.35, 'oak', r() * 6.28]);
    }
  }
  for (const t of siteTrees) list.push(t);
  return list;
}

function buildForest(list, uniforms) {
  const geos = treeGeometries();
  const leafTex = foliageTexture('leaf');
  const needleTex = foliageTexture('needle');
  const bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const leaves = foliageMaterial(leafTex, uniforms);
  const needles = foliageMaterial(needleTex, uniforms);
  const depth = (map) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 });
  const meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  const near = (t) => Math.abs(t[0]) < 32 && Math.abs(t[2] + 2) < 32; // dans le cadre des ombres du soleil
  for (const kind of Object.keys(geos)) {
    const tex = kind.startsWith('pine') ? needleTex : leafTex;
    for (const shadow of [true, false]) {
      const items = list.filter((t) => t[5] === kind && near(t) === shadow);
      if (!items.length) continue;
      // ordre mélangé : réduire `count` (mode économie) retire des arbres partout, pas une zone entière
      const rr = mulberry32(items.length + kind.length);
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      const mesh = new THREE.InstancedMesh(geos[kind], [bark, kind.startsWith('pine') ? needles : leaves], items.length);
      items.forEach((t, i) => {
        q.setFromAxisAngle(UPV, t[6]);
        m4.compose(p.set(t[0], t[1], t[2]), q, s.set(t[4], t[3], t[4]));
        mesh.setMatrixAt(i, m4);
        const v = 0.86 + rr() * 0.28;
        mesh.setColorAt(i, col.setRGB(v * (0.94 + rr() * 0.12), v * (0.97 + rr() * 0.06), v * (0.88 + rr() * 0.12)));
      });
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = depth(tex);
      mesh.userData.full = items.length;
      mesh.name = `landscape_trees_${kind}`;
      meshes.push(mesh);
    }
  }
  return meshes;
}

function buildRoad(maps) {
  // chaussée de transit et voies du tram, des deux côtés de la plateforme, jusqu'à l'horizon
  const parts = [];
  const strip = (x0, x1, z0, z1, y, color) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    parts.push(paint(g, () => color));
  };
  const asphalt = srgb(0.12, 0.12, 0.125), white = srgb(0.42, 0.42, 0.41), rail = srgb(0.22, 0.22, 0.23), pole = srgb(0.08, 0.08, 0.09);
  for (const s of [-1, 1]) {
    const [a, b] = s > 0 ? [SITE.x1, EXTENT] : [-EXTENT, SITE.x0];
    strip(a, b, ROAD_Z.lanes[0], ROAD_Z.lanes[1], 0.006, asphalt);
    for (let x = a + 0.3; x < b - 0.3; x += 0.9) strip(x, x + 0.3, 17.792, 17.808, 0.012, white);
    for (const zr of ROAD_Z.rails) for (const dz of [-0.072, 0.072]) strip(a, b, zr + dz - 0.006, zr + dz + 0.006, 0.014, rail);
    for (let x = a + 1.6; x < b; x += 3.2) { // poteaux de la ligne aérienne
      const g = new THREE.CylinderGeometry(0.012, 0.012, 0.72, 5).translate(x, 0.36, 16.5);
      g.deleteAttribute('uv');
      parts.push(paint(g, () => pole));
    }
  }
  const geo = mergeGeometries(parts);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  mesh.receiveShadow = true;
  mesh.name = 'landscape_road';
  return mesh;
}

// --- eau ---------------------------------------------------------------------------------------------

function waterNormalsTexture() {
  const size = 256;
  const h = periodicNoise(3, [4, 8, 16, 32]);
  const t = new THREE.CanvasTexture(normalFromHeight(size, h, 6));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createLandscape(scene, { quality = 'auto', siteTreesUrl = null } = {}) {
  const uniforms = { uTime: { value: 0 } };
  const maps = {
    grass: (() => {
      const nz = periodicNoise(11, [4, 8, 16, 32, 64, 128]);
      return repeatTexture(noiseCanvas(256, (u, v) => { const c = 228 + nz(u, v) * 27; return [c, c + 2, c - 5]; }), true, 1);
    })(),
    grassN: (() => {
      const nz = periodicNoise(13, [16, 32, 64, 128]);
      return repeatTexture(normalFromHeight(256, nz, 6), false, 1);
    })(),
  };
  const group = new THREE.Group();
  group.name = 'landscape';
  const { mesh: terrain } = buildTerrain(maps);
  group.add(terrain, buildRoad(maps));

  // eau sans miroir : sombre en profondeur, reflète le ciel (environnement du ciel) d'autant plus que le regard
  // est rasant (Fresnel des matériaux physiques)
  let skyEnv = null;
  const waterMats = new Set();
  const waterMaterial = (normals, scale) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setRGB(0.03, 0.10, 0.12, THREE.SRGBColorSpace), roughness: 0.035, metalness: 0,
      normalMap: normals, normalScale: new THREE.Vector2(scale, scale), envMap: skyEnv, envMapIntensity: 1,
      specularIntensity: 1, ior: 1.33,
    });
    waterMats.add(m);
    return m;
  };

  // voile d'horizon : un anneau couleur de brouillard, opaque en bas et fondu vers le ciel, cache le bord du relief
  const veil = new THREE.Mesh(
    new THREE.CylinderGeometry(226, 226, 80, 72, 1, true).translate(0, 30, 0),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() } },
      vertexShader: 'varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; varying float vY;
        void main() { gl_FragColor = vec4(uColor, 1.0 - smoothstep(10.0, 52.0, vY));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    }),
  );
  veil.renderOrder = 10;
  veil.name = 'landscape_veil';
  group.add(veil);

  // lac : miroir réel (reflets du stade la nuit) en qualité haute, sinon reflets du ciel
  const waterNormals = waterNormalsTexture();
  // plan dans XY (normale +Z, ce qu'attend le miroir de Water), couché par la rotation du maillage
  const lakeGeo = new THREE.CircleGeometry(1, 72).scale(LAKE.rx * 1.35, LAKE.rz * 1.35, 1).rotateZ(-LAKE.rot);
  let lake = null;
  const makeLake = (q) => {
    if (lake) { group.remove(lake); waterMats.delete(lake.material); lake.material.dispose(); lake = null; }
    if (q === 'haute') {
      lake = new Water(lakeGeo, {
        textureWidth: 512, textureHeight: 512, waterNormals, sunDirection: new THREE.Vector3(0.5, 0.8, 0.3).normalize(),
        sunColor: 0xfff1dc, waterColor: 0x0c2f3a, distortionScale: 1.6, fog: true,
      });
      lake.material.uniforms.size.value = 6.0;
    } else {
      lake = new THREE.Mesh(lakeGeo, waterMaterial(waterNormals, 0.09));
      waterNormals.repeat.set(9, 5);
    }
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(LAKE.x, LAKE.level, LAKE.z);
    lake.name = 'landscape_lake';
    group.add(lake);
  };
  makeLake(quality);

  scene.add(group);
  let trees = [];
  let currentQuality = quality;
  const applyTreeCount = () => trees.forEach((m) => { m.count = Math.max(1, Math.round(m.userData.full * (TREE_TOP[currentQuality] ?? 1))); });
  const plant = (siteTrees) => {
    trees.forEach((m) => { group.remove(m); m.dispose(); });
    trees = buildForest(scatterTrees(siteTrees), uniforms);
    trees.forEach((m) => group.add(m));
    applyTreeCount();
  };
  plant([]);
  if (siteTreesUrl) {
    fetch(siteTreesUrl).then((r) => (r.ok ? r.json() : [])).then((data) => {
      if (!Array.isArray(data) || !data.length) return;
      plant(data.map(([x, z, y, h, w, kind]) => [x, y, z, h, w, kind, (x * 7.3 + z * 3.1) % 6.28]));
    }).catch(() => {});
  }

  return {
    group,
    // miroir d'eau du parvis (site) : même eau animée, reflets du ciel
    adoptWater(mesh) {
      const normals = waterNormals.clone();
      normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
      mesh.material = waterMaterial(normals, 0.06);
      mesh.userData.ripple = true;
      this.pools = [...(this.pools || []), mesh];
    },
    update(dt, time) {
      uniforms.uTime.value = time;
      if (scene.fog && veil.material.uniforms.uColor) veil.material.uniforms.uColor.value.copy(scene.fog.color);
      if (lake?.material.uniforms?.time) lake.material.uniforms.time.value = time * 0.35;
      else waterNormals.offset.set(time * 0.004, time * 0.0025);
      (this.pools || []).forEach((m) => m.material.normalMap.offset.set(time * 0.01, -time * 0.006));
    },
    setDark(dark) {
      if (lake?.material.uniforms?.sunColor) lake.material.uniforms.sunColor.value.set(dark ? 0x334466 : 0xfff1dc);
      waterMats.forEach((m) => { m.envMapIntensity = dark ? 0.35 : 1; }); // la nuit, l'eau reste sombre
    },
    // reflet du ciel photographié (environnement de sky.js, déjà à la luminosité de l'ambiance) pour l'eau
    setSkyEnv(tex) {
      const first = !skyEnv;
      skyEnv = tex;
      waterMats.forEach((m) => { m.envMap = tex; if (first) m.needsUpdate = true; });
    },
    setSun(dir) { if (lake?.material.uniforms?.sunDirection) lake.material.uniforms.sunDirection.value.copy(dir).normalize(); },
    setQuality(q) { if (q === currentQuality) return; currentQuality = q; makeLake(q); applyTreeCount(); },
    // voile peint avec le ciel photographié (sky.js) à la place de la couleur de brume
    setVeilMaterial(mat) { veil.material.dispose(); veil.material = mat; },
    dispose() {
      scene.remove(group);
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } });
    },
  };
}
