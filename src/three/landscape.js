import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createForest, setForestTime } from './forest';

// Écrin naturel autour du complexe : la plateforme du site posée sur un plateau, des collines douces boisées qui
// ondulent jusqu'à l'horizon, un lac au nord-ouest juste derrière le stade, une forêt européenne (arbres modélisés
// près du site et en lisière, imposteurs au loin : forest.js), et le boulevard sud prolongé par une route bordée
// d'arbres avec son tram. Relief, eau et route sont générés ici, en unités du jeu (1 = 10 m), x vers l'est, z vers
// le sud. Côté caméra (sud-est), le relief reste bas pour ne jamais masquer le complexe.

const SITE = { x0: -30, x1: 30, z0: -28, z1: 23 }; // plateforme du site (build_site.py)
const LAKE = { x: -56, z: -58, rx: 30, rz: 16, rot: 0.5, level: -0.35 };
const ROAD_Z = { median: [15.8, 17.2], rails: [16.15, 16.85], lanes: [17.2, 18.4], mid: 16.9 };
const EXTENT = 240;
const CAM = new THREE.Vector2(0.62, 0.78).normalize(); // direction de la caméra vue de dessus

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

// --- couleurs par sommet ----------------------------------------------------------------------------

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

// Arbres du paysage (forest.js) : [x, y, z, hauteur, largeur, espèce, orientation, arbre du site, longueur d'une
// haie]. Massifs de chênes et de hêtres, peuplements de résineux (sapins, quelques pins sylvestres), peupliers au
// bord du lac ; sur le site, arbres, haies et arbustes de site_trees.json (build_site.py).
const SITE_SPECIES = { oak: 'chene', beech: 'hetre', poplar: 'peuplier' }; // noms de site_trees.json (build_site.py)
function scatterTrees(siteTrees) {
  const r = mulberry32(77);
  const list = [];
  const kindAt = (x, z) => {
    if (fbm(N5, x / 30, z / 30, 2) > 0.22 && r() < 0.8) return r() < 0.3 ? 'pin' : 'sapin';
    return r() < 0.55 ? 'chene' : 'hetre';
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
      if (r() < f * 0.95 || r() < 0.005 + shore) add(jx, jz, shore && r() < 0.5 ? 'peuplier' : kindAt(jx, jz), 0.85 + r() * 0.55);
    }
  }
  // forêts et bosquets au-delà, jusqu'à ~1,2 km : denses au cœur des massifs
  for (let x = -150; x <= 150; x += 1.7) {
    for (let z = -150; z <= 140; z += 1.7) {
      const jx = x + (r() - 0.5) * 1.5, jz = z + (r() - 0.5) * 1.5;
      const d = siteDist(jx, jz);
      if (d <= 18 || d > 120) continue;
      if (lakeQ(jx, jz) < 1.08 || inCorridor(jx, jz, 3.2)) continue;
      const f = forestAt(jx, jz);
      if (r() < f * 0.9 || r() < 0.002) add(jx, jz, kindAt(jx, jz), 1.0 + r() * 0.6);
    }
  }
  // route bordée d'arbres d'alignement (prolongement du boulevard sud)
  for (const s of [-1, 1]) {
    for (let x = SITE.x1 + 1.2; x < 170; x += 1.2) {
      for (const z of [15.15, 19.05]) list.push([s * x, 0, z, 1.25 + r() * 0.15, 1.35, 'hetre', r() * 6.28]);
    }
  }
  for (const [x, z, y, h, w, kind, rot, len] of siteTrees) {
    list.push([x, y, z, h, w, SITE_SPECIES[kind] || kind, rot ?? (x * 7.3 + z * 3.1) % 6.28, true, len]);
  }
  return list;
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
  let forest = null;
  let currentQuality = quality;
  const plant = (siteTrees) => {
    forest?.dispose();
    forest = createForest(group, scatterTrees(siteTrees), { quality: currentQuality, site: SITE });
  };
  plant([]);
  if (siteTreesUrl) {
    fetch(siteTreesUrl).then((r) => (r.ok ? r.json() : [])).then((data) => {
      if (Array.isArray(data) && data.length) plant(data);
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
    update(dt, time, camera) {
      setForestTime(time);
      if (camera) forest?.update(camera);
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
    setQuality(q) { if (q === currentQuality) return; currentQuality = q; makeLake(q); forest?.setQuality(q); },
    // voile peint avec le ciel photographié (sky.js) à la place de la couleur de brume
    setVeilMaterial(mat) { veil.material.dispose(); veil.material = mat; },
    dispose() {
      forest?.dispose();
      scene.remove(group);
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } });
    },
  };
}
