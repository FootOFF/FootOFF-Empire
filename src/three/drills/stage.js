import * as THREE from 'three';
import { createPhotoSky, lookFor } from '../sky';
import { createPlayers } from '../players';
import { initAssets, instantiateModel } from '../assets';
import { resolveProp } from '../manifest';
import { createForest, setForestTime } from '../forest';
import { TREES } from '../trees.generated';

// Terrain d'entraînement des épreuves (centre d'entraînement) : une scène à part, avec son propre rendu, en unités du
// jeu (1 = 10 m) pour reprendre tels quels les joueurs, les arbres et le ciel du complexe. Pelouse photo (celle du
// site) avec bandes de tonte et marquages calculés au pixel, deux buts réglementaires avec filets, filets pare-ballons,
// mâts d'éclairage, lisière d'arbres, ciel photographié du plein jour. Pas d'ombres portées (coût) : des ombres
// douces au sol sous les joueurs, le ballon et le matériel. Pleine résolution de l'écran, comme le reste du jeu.
// Repère : terrain de 105 × 68 m, lignes de but en z = 0 et z = 10,5, axe en x = 0 ; le soleil est au sud (+z),
// toutes les caméras regardent vers -z (scènes éclairées de face ou de côté, jamais à contre-jour).

export const M = 0.1; // un mètre en unités du jeu
export const PITCH = { len: 10.5, half: 3.4 };
export const GOAL = { w: 0.732, h: 0.244, post: 0.006, depth: 0.2 };
export const BALL_R = 0.011;
export const KITS = { ours: 0xc7a15a, keeper: 0x2f343c, bibs: 0xc9e23b, rival: 0x2d6be0, coach: 0x22262c };

const rnd = (a, b) => a + Math.random() * (b - a);

// --- Textures générées ------------------------------------------------------------------------------------------

function canvasTexture(size, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ombre douce au sol (dégradé radial)
const blobTexture = () => canvasTexture(128, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(0,0,0,0.62)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.38)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
}, { srgb: false });

// maille de filet (fils blancs, carré de 12 cm par répétition)
const netTexture = () => canvasTexture(64, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(0, 1.5); g.lineTo(s, 1.5);
  g.moveTo(1.5, 0); g.lineTo(1.5, s);
  g.stroke();
  for (const [x, y] of [[1.5, 1.5]]) { g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(x - 3, y - 3, 6, 6); } // nœud
}, { srgb: false, repeat: true });

// bruit de valeur périodique (taches de la pelouse) : r grandes taches, g touffes, b brins
function noiseTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const layer = (cells, seed) => {
    const g = new Float32Array(cells * cells);
    let a = seed * 9301 + 49297;
    for (let i = 0; i < g.length; i++) { a = (a * 9301 + 49297) % 233280; g[i] = a / 233280; }
    return (x, y) => {
      const fx = (x / S) * cells, fy = (y / S) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const at = (i, j) => g[((j % cells) * cells) + (i % cells)];
      return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
    };
  };
  const A = [layer(4, 1), layer(8, 2), layer(16, 3)];
  const B = [layer(24, 4), layer(48, 5)];
  const C = [layer(96, 6), layer(192, 7)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = (A[0](x, y) * 0.55 + A[1](x, y) * 0.3 + A[2](x, y) * 0.15) * 255;
      data[i + 1] = (B[0](x, y) * 0.6 + B[1](x, y) * 0.4) * 255;
      data[i + 2] = (C[0](x, y) * 0.5 + C[1](x, y) * 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// --- Pelouse -------------------------------------------------------------------------------------------------------
// Gazon photo du complexe (matière ground_lawn du site, si elle est chargée ; sinon une teinte de gazon nuancée),
// bandes de tonte de 5,25 m qui changent avec le point de vue (brins couchés vers la caméra : plus sombres),
// marquages réglementaires de 12 cm calculés au pixel, nets à toute distance, et un tapis un peu plus rustique
// autour du terrain.
const PITCH_GLSL = /* glsl */`
uniform sampler2D uNoise;
uniform float uTile;
uniform float uPhoto;
varying vec3 vWorld;
float pCov(float d, float w) {
  w = max(w, 1e-4);
  return clamp((min(d + 0.5 * w, 0.06) - max(d - 0.5 * w, -0.06)) / w, 0.0, 1.0);
}
// marquages d'un terrain de 105 x 68 m ; p : mètres, x en largeur, y en longueur depuis la ligne de but sud (z = 0)
float pLines(vec2 p) {
  const float L = 105.0, W = 34.0, E = 0.06;
  vec2 c = vec2(abs(p.x), p.y < L * 0.5 ? p.y : L - p.y); // un quart du terrain suffit (symétries)
  vec2 fw = vec2(fwidth(p.x), fwidth(p.y));
  float dx = c.y > -E && c.y < L * 0.5 + E ? abs(c.x - W) : 1e3; // touches
  float dy = c.x < W + E ? min(abs(c.y), abs(p.y - L * 0.5)) : 1e3; // ligne de but, ligne médiane
  dx = min(dx, c.y < 16.5 + E ? abs(c.x - 20.16) : 1e3); // surface de réparation
  dy = min(dy, c.x < 20.16 + E ? abs(c.y - 16.5) : 1e3);
  dx = min(dx, c.y < 5.5 + E ? abs(c.x - 9.16) : 1e3); // surface de but
  dy = min(dy, c.x < 9.16 + E ? abs(c.y - 5.5) : 1e3);
  float r0 = length(vec2(p.x, p.y - L * 0.5));
  float r1 = length(vec2(c.x, c.y - 11.0));
  float r2 = length(vec2(c.x - W, c.y));
  float d0 = min(abs(r0 - 9.15), max(r0 - 0.11, 0.0)); // rond central, point central
  float d1 = min(c.y > 16.5 ? abs(r1 - 9.15) : 1e3, max(r1 - 0.11, 0.0)); // arc, point de réparation
  float d2 = c.y > 0.0 && c.x < W ? abs(r2 - 1.0) : 1e3; // arcs de coin
  float cov = max(pCov(dx, fw.x), pCov(dy, fw.y));
  cov = max(cov, pCov(d0, fwidth(r0)));
  cov = max(cov, pCov(d1, fwidth(r1)));
  return max(cov, pCov(d2, fwidth(r2)));
}
`;

function pitchMaterial(lawn) {
  const noise = noiseTexture();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.userData.noise = noise; // libérée avec le matériau (setGround, fin de séance)
  if (lawn?.map) {
    m.map = lawn.map;
    m.normalMap = lawn.normalMap || null;
    if (m.normalMap) m.normalScale = new THREE.Vector2(0.9, 0.9);
    m.roughnessMap = lawn.roughnessMap || null;
    if (lawn.color) m.color.copy(lawn.color);
  } else {
    m.color.setRGB(0.16, 0.3, 0.09); // gazon (lumière linéaire)
  }
  const tile = lawn?.tile || 2;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uTile = { value: tile };
    shader.uniforms.uPhoto = { value: lawn?.map ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PITCH_GLSL}`)
      .replace('#include <map_fragment>', `
        vec2 gM = vWorld.xz * 10.0; // mètres
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          diffuseColor *= sampledDiffuseColor;
        #endif
        vec4 gN = texture2D(uNoise, gM / 70.0);
        vec4 gC = texture2D(uNoise, gM / 9.0);
        float onPitch = step(abs(gM.x), 35.5) * step(-1.5, gM.y) * step(gM.y, 106.5);
        // taches et touffes ; brins fins pour le gazon sans photo
        diffuseColor.rgb *= 1.0 + 0.2 * (gN.r - 0.5) + 0.14 * (gC.g - 0.5);
        if (uPhoto < 0.5) diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, gM * 1.7).b;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.1, 1.04, 0.82), smoothstep(0.62, 0.9, gN.r) * 0.45); // zones plus sèches
        // bandes de tonte (5,25 m, tondues en largeur) : selon le sens des brins par rapport au regard
        vec3 toCam = normalize(cameraPosition - vWorld);
        float band = clamp(sin(gM.y * 0.5983986) * 6.0, -1.0, 1.0);
        float fade = clamp(2.0 - 0.6 * fwidth(gM.y), 0.0, 1.0);
        diffuseColor.rgb *= 1.0 + band * (0.05 + 0.16 * abs(toCam.z)) * fade * mix(0.35, 1.0, onPitch);
        diffuseColor.rgb *= mix(0.86, 1.0, onPitch); // hors du terrain : pelouse moins soignée
        float line = pLines(gM) * onPitch * (1.0 - 0.25 * smoothstep(0.45, 0.8, gC.r));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78), line);
      `);
  };
  m.customProgramCacheKey = () => `drill-pitch-${lawn?.map ? 1 : 0}`;
  return m;
}

// --- Ballon : 12 pentagones noirs et 20 hexagones blancs, coutures fines (calculés au pixel sur la sphère) ----------
function ballMaterial() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const ico = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]]
    .map((v) => new THREE.Vector3(...v).normalize());
  const faces = new THREE.IcosahedronGeometry(1, 0);
  const pos = faces.attributes.position;
  const hex = [];
  for (let i = 0; i < pos.count; i += 3) {
    hex.push(new THREE.Vector3().fromBufferAttribute(pos, i).add(new THREE.Vector3().fromBufferAttribute(pos, i + 1)).add(new THREE.Vector3().fromBufferAttribute(pos, i + 2)).normalize());
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPent = { value: ico };
    shader.uniforms.uHex = { value: hex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform vec3 uPent[12];\nuniform vec3 uHex[20];')
      .replace('#include <map_fragment>', `
        vec3 n = normalize(vObj);
        float b1 = -2.0, b2 = -2.0; float pent = 0.0;
        for (int i = 0; i < 12; i++) { float d = dot(n, uPent[i]); if (d > b1) { b2 = b1; b1 = d; pent = 1.0; } else if (d > b2) b2 = d; }
        for (int i = 0; i < 20; i++) { float d = dot(n, uHex[i]); if (d > b1) { b2 = b1; b1 = d; pent = 0.0; } else if (d > b2) b2 = d; }
        float seam = 1.0 - smoothstep(0.004, 0.012 + fwidth(b1 - b2), b1 - b2);
        vec3 col = mix(vec3(0.93), vec3(0.035), pent);
        col = mix(col, vec3(0.12), seam * 0.85);
        diffuseColor.rgb *= col;
      `);
  };
  m.customProgramCacheKey = () => 'drill-ball';
  return m;
}

// --- Effets lumineux -----------------------------------------------------------------------------------------------
// Anneau holographique doré (cibles, joueurs à choisir) : disque léger, anneaux nets, pulsation ; additif.
export function ringMaterial(color = 0xdec17f) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOn: { value: 1 }, uFlash: { value: 0 }, uFill: { value: 0.16 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime, uOn, uFlash, uFill; varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float w = fwidth(r) * 1.5;
        float outer = smoothstep(0.86 - w, 0.86, r) * (1.0 - smoothstep(0.96, 0.96 + w, r));
        float mid = smoothstep(0.52 - w, 0.52, r) * (1.0 - smoothstep(0.58, 0.58 + w, r));
        float core = 1.0 - smoothstep(0.2, 0.2 + w, r);
        float pulse = 0.75 + 0.25 * sin(uTime * 5.0);
        float a = (outer * 1.0 + mid * 0.7 + core * 0.9) * mix(0.35, pulse, uOn) + uFill * (1.0 - smoothstep(0.9, 0.96, r)) * uOn;
        a += uFlash * (1.0 - smoothstep(0.0, 1.0, r)) * 1.4;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor * a * (1.0 + uFlash * 2.0), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

// Trait lumineux (viseur, lignes de passe) : un ruban, plus intense au centre ; dash > 0 : pointillés qui défilent.
export function beamMaterial(color = 0xdec17f, { dash = 0, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uDash: { value: dash }, uOpacity: { value: opacity }, uLen: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime, uDash, uOpacity, uLen; varying vec2 vUv;
      void main() {
        float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float a = pow(max(across, 0.0), 1.6);
        if (uDash > 0.0) a *= step(0.45, fract(vUv.x * uLen / uDash - uTime * 1.5));
        a *= smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);
        gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

// --- Scène -----------------------------------------------------------------------------------------------------------

// Une seule toile 3D pour toutes les séances, créée à la première et gardée ensuite. Un contexte 3D neuf à chaque
// séance, même libéré à la fin (perte forcée du contexte), finit sur iPhone par faire recharger la page par Safari
// (écran blanc, puis l'écran de chargement) au fil d'une longue partie. Entre deux séances, la toile quitte l'écran
// et son image rendue est réduite à un pixel : il ne reste que le contexte, vide.
let gl3d = null;
function drillRenderer() {
  if (gl3d?.getContext().isContextLost()) { gl3d.dispose(); gl3d = null; } // contexte repris par le système : un neuf
  if (!gl3d) {
    gl3d = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    gl3d.outputColorSpace = THREE.SRGBColorSpace;
    gl3d.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return gl3d;
}

// Fin de séance : tout ce que la scène garde encore est libéré (les épreuves libèrent aussi ce qu'elles ont créé,
// keep), sauf les photos du gazon, prêtées par les modèles du complexe (lent). Un objet tiré des modèles du complexe
// (géométries et matériaux partagés avec lui) doit avoir quitté la scène avant : la forêt retire les siens.
function sweep(root, lent) {
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    o.geometry?.dispose();
    [].concat(o.material || []).forEach((m) => {
      Object.values(m).forEach((v) => { if (v?.isTexture && !lent.has(v)) v.dispose(); });
      Object.values(m.uniforms || {}).forEach((u) => { if (u?.value?.isTexture && !lent.has(u.value)) u.value.dispose(); });
      m.userData?.noise?.dispose();
      m.dispose();
    });
  });
}

// mount : l'élément qui accueille la toile (plein écran des épreuves)
export function createStage(mount) {
  const renderer = drillRenderer();
  const canvas = renderer.domElement;
  mount.appendChild(canvas);
  renderer.setPixelRatio(window.devicePixelRatio || 1); // pleine résolution de l'écran, comme le complexe
  const look = lookFor('day');
  renderer.toneMappingExposure = look.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd2e6);
  scene.fog = new THREE.Fog(0xbfd2e6, 30, 140);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.012, 400);
  scene.add(camera); // ses enfants (les gants du gardien, en vue subjective) sont dessinés avec la scène

  // ciel photographié et lumière du plein jour (comme le complexe) ; lumière d'attente le temps que le ciel arrive
  const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x4a5a3a, 1.1);
  scene.add(hemi);
  const photo = createPhotoSky(renderer);
  photo.set(look);
  scene.add(photo.dome);
  photo.onEnv((tex) => { scene.environment = tex; scene.environmentIntensity = look.ambient; hemi.intensity = 0; });
  const sun = new THREE.DirectionalLight(look.sunColor, look.sunI);
  sun.position.copy(look.sunDir).multiplyScalar(40);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffe4c8, 0.35); // appoint venu de la caméra : visages et maillots lisibles
  fill.position.set(0, 12, 30);
  scene.add(fill);

  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const shadowTex = keep(blobTexture());
  const netTex = keep(netTexture());

  // pelouse : photo du complexe si elle est chargée
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 140, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, PITCH.len / 2)), null);
  ground.renderOrder = 2; // dessinée après le reste : ses pixels cachés ne sont pas calculés
  scene.add(ground);
  const lent = new Set(); // photos du gazon prêtées par le modèle du site (jamais libérées ici)
  const setGround = (lawn) => {
    if (ground.material) { ground.material.userData.noise?.dispose(); ground.material.dispose(); }
    ground.material = pitchMaterial(lawn);
    [lawn?.map, lawn?.normalMap, lawn?.roughnessMap].forEach((x) => { if (x) lent.add(x); });
    if (lawn?.map) {
      // coordonnées de texture en tuiles de la photo : uv = mètres / taille de la tuile
      const g = ground.geometry;
      const p = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) * 10) / lawn.tile, (-p.getZ(i) * 10) / lawn.tile);
      uv.needsUpdate = true;
      [lawn.map, lawn.normalMap, lawn.roughnessMap].forEach((t) => { if (t) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
    }
  };
  setGround(null);
  try {
    initAssets(renderer);
    const site = resolveProp('site');
    if (site) {
      instantiateModel(site, { w: 1, d: 1 }).then((node) => {
        let lawn = null;
        node.traverse((o) => {
          if (lawn || !o.isMesh) return;
          const m = o.material;
          if (m?.name === 'ground_lawn' && m.map) lawn = { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, tile: m.userData?.ground?.tile || m.userData?.tile || 2, color: m.color };
        });
        if (lawn && alive) setGround(lawn);
      }).catch(() => {});
    }
  } catch { /* gazon sans photo */ }

  // --- Buts ---------------------------------------------------------------------------------------------------------
  const white = keep(new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.32, metalness: 0.15 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.45, metalness: 0.6 }));
  const netMat = keep(new THREE.MeshStandardMaterial({
    color: 0xffffff, alphaMap: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8,
  }));
  // ombre : noir, opacité lue dans le dégradé (la texture ne porte que l'alpha), sans brume
  const shadowMat = keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));

  const nets = []; // filets animés : { mesh, hit, amp }
  function netSurface(w, h, segW, segH, place, repeat) {
    const geo = new THREE.PlaneGeometry(w, h, segW, segH);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat[0], uv.getY(i) * repeat[1]);
    const mat = netMat.clone();
    mat.alphaMap = netTex;
    const st = { amp: 0, at: new THREE.Vector3(), mat };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHit = { value: st.at };
      shader.uniforms.uAmp = { value: 0 };
      st.uniforms = shader.uniforms;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHit; uniform float uAmp;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float dd = length(wp - uHit);
          transformed.z -= uAmp * exp(-dd * dd / 0.0036);`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    place(mesh);
    disposables.push(geo, mat);
    nets.push({ mesh, st });
    return mesh;
  }

  function buildGoal(z, dir) { // dir : +1 = le but s'ouvre vers +z (filet vers -z)
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    if (dir < 0) g.rotation.y = Math.PI;
    const { w, h, post, depth } = GOAL;
    const cyl = (r, len) => keep(new THREE.CylinderGeometry(r, r, len, 16));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(cyl(post, h + post), white);
      p.position.set(s * (w / 2 + post), (h + post) / 2, 0);
      g.add(p);
      const back = new THREE.Mesh(cyl(0.0025, 0.16), steel); // montant arrière
      back.position.set(s * (w / 2 + post), 0.08, -depth);
      g.add(back);
      const strut = new THREE.Mesh(cyl(0.0022, Math.hypot(depth, h - 0.16)), steel); // jambe de force
      strut.position.set(s * (w / 2 + post), (h + 0.16) / 2, -depth / 2);
      strut.rotation.x = Math.atan2(depth, h - 0.16);
      g.add(strut);
      const foot = new THREE.Mesh(cyl(0.0022, depth), steel); // barre au sol
      foot.rotation.x = Math.PI / 2;
      foot.position.set(s * (w / 2 + post), 0.003, -depth / 2);
      g.add(foot);
    }
    const bar = new THREE.Mesh(cyl(post, w + post * 4), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, h + post / 2, 0);
    g.add(bar);
    const backBar = new THREE.Mesh(cyl(0.0022, w + post * 2), steel);
    backBar.rotation.z = Math.PI / 2;
    backBar.position.set(0, 0.003, -depth);
    g.add(backBar);
    // filets : fond (animé quand le ballon y entre), toit en pente, côtés
    const cell = 0.012;
    g.add(netSurface(w + post * 2, 0.16, 40, 10, (m) => { m.position.set(0, 0.08, -depth); }, [(w + post * 2) / cell, 0.16 / cell]));
    const roofLen = Math.hypot(depth, h - 0.16);
    g.add(netSurface(w + post * 2, roofLen, 24, 6, (m) => {
      m.position.set(0, (h + 0.16) / 2, -depth / 2);
      m.rotation.x = Math.atan2(depth, h - 0.16); // du haut du fond jusqu'à la barre transversale
    }, [(w + post * 2) / cell, roofLen / cell]));
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(depth, 0), new THREE.Vector2(depth, 0.16), new THREE.Vector2(0, h)]);
      const geo = keep(new THREE.ShapeGeometry(shape));
      const uv = geo.attributes.uv;
      const p = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / cell, p.getY(i) / cell);
      const side = new THREE.Mesh(geo, netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(s * (w / 2 + post), 0, 0);
      g.add(side);
    }
    // ombre au sol du but (douce, étirée sous la barre transversale et la cage)
    const sh = new THREE.Mesh(keep(new THREE.PlaneGeometry(w + 0.08, depth + 0.06).rotateX(-Math.PI / 2)), shadowMat.clone());
    sh.material.opacity = 0.5;
    sh.position.set(0.02, 0.0012, -depth / 2 + 0.01);
    g.add(sh);
    scene.add(g);
    return g;
  }
  const goals = [buildGoal(0, 1), buildGoal(PITCH.len, -1)];

  // filets pare-ballons derrière les buts, mâts d'éclairage aux coins du terrain
  const darkNet = keep(new THREE.MeshStandardMaterial({ color: 0x1c2a22, alphaMap: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9, opacity: 0.5 }));
  for (const z of [-0.55, PITCH.len + 0.55]) {
    const w = 4.2, h = 0.45;
    const geo = keep(new THREE.PlaneGeometry(w, h));
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.02), uv.getY(i) * (h / 0.02));
    const net = new THREE.Mesh(geo, darkNet);
    net.position.set(0, h / 2, z);
    scene.add(net);
    for (const x of [-2.1, -1.3, -0.56, 0.56, 1.3, 2.1]) { // aucun poteau derrière la cage, vu des tireurs
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.005, h + 0.02, 8)), steel);
      pole.position.set(x, (h + 0.02) / 2, z);
      scene.add(pole);
    }
  }
  const mastGeo = keep(new THREE.CylinderGeometry(0.012, 0.022, 1.8, 10));
  const headGeo = keep(new THREE.BoxGeometry(0.16, 0.09, 0.03));
  const lampMat = keep(new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.5, metalness: 0.5, emissive: 0xfff3d6, emissiveIntensity: 0.05 }));
  for (const [x, z] of [[-4.1, -0.9], [4.1, -0.9], [-4.1, PITCH.len + 0.9], [4.1, PITCH.len + 0.9], [-4.1, PITCH.len / 2], [4.1, PITCH.len / 2]]) {
    const mast = new THREE.Mesh(mastGeo, steel);
    mast.position.set(x, 0.9, z);
    scene.add(mast);
    const head = new THREE.Mesh(headGeo, lampMat);
    head.position.set(x - Math.sign(x) * 0.04, 1.82, z);
    head.lookAt(0, 0, PITCH.len / 2);
    scene.add(head);
  }

  // lisière : chênes, hêtres et peupliers autour du terrain d'entraînement (imposteurs, comme au loin du complexe)
  const forestGroup = new THREE.Group();
  scene.add(forestGroup);
  let forest = null;
  try {
    const kinds = Object.keys(TREES.species);
    const list = [];
    let seed = 11;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let a = 0; a < Math.PI * 2; a += 0.021) {
      for (const ring of [0, 1, 2, 3]) {
        const rad = 17 + ring * 3.6 + r() * 3;
        const x = Math.cos(a) * rad * 0.85;
        const z = PITCH.len / 2 + Math.sin(a) * rad;
        if (r() < 0.3) continue;
        const kind = r() < 0.12 ? 'peuplier' : kinds.includes('chene') && r() < 0.55 ? 'chene' : 'hetre';
        const h = 1.4 + r() * 0.9;
        list.push([x, 0, z, h, h * (0.85 + r() * 0.3), kind, r() * Math.PI * 2]);
      }
    }
    forest = createForest(forestGroup, list);
  } catch { forest = null; }
  // au-delà, la forêt continue : bande de feuillage lointain (entre les troncs, plus de ciel au ras du sol)
  const backdrop = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(44, 44, 1.1, 96, 1, true).translate(0, 0.45, PITCH.len / 2)),
    keep(new THREE.MeshStandardMaterial({ color: 0x24341f, roughness: 1, side: THREE.BackSide })),
  );
  scene.add(backdrop);

  // --- Joueurs, ballons, ombres, étincelles ---------------------------------------------------------------------------
  const players = createPlayers(scene, 24);
  const shadows = [];
  const shadowGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  function addShadow(size = 0.07, opacity = 0.55, parent = scene) {
    const mat = shadowMat.clone();
    mat.opacity = opacity;
    disposables.push(mat);
    const mesh = new THREE.Mesh(shadowGeo, mat);
    mesh.scale.set(size, 1, size);
    mesh.position.y = 0.0015;
    mesh.renderOrder = 1;
    parent.add(mesh);
    shadows.push(mesh);
    return mesh;
  }

  const ballGeo = keep(new THREE.SphereGeometry(BALL_R, 40, 20));
  const ballMat = keep(ballMaterial());
  function addBall(parent = scene) {
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    parent.add(mesh);
    const shadow = addShadow(0.026, 0.6, parent);
    return {
      mesh, shadow,
      set(x, y, z) {
        mesh.position.set(x, y + BALL_R, z);
        shadow.position.set(x + 0.004, 0.0015, z + 0.004);
        const k = THREE.MathUtils.clamp(1 - y / 0.6, 0.25, 1);
        shadow.material.opacity = 0.6 * k;
        shadow.scale.setScalar(0.026 * (1 + y * 1.5));
        mesh.visible = shadow.visible = true;
      },
      hide() { mesh.visible = shadow.visible = false; },
      spin(axis, angle) { mesh.rotateOnWorldAxis(axis, angle); },
    };
  }

  // étincelles dorées (impacts, cibles touchées) : particules additives
  const MAXP = 260;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 3);
  const pLife = new Float32Array(MAXP);
  const pGeo = keep(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkTex = keep(canvasTexture(64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,240,200,0.8)');
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }));
  const pMat = keep(new THREE.PointsMaterial({ size: 0.012, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
  const sparks = new THREE.Points(pGeo, pMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let pNext = 0;
  function burst(at, { count = 40, color = 0xdec17f, speed = 0.18, up = 0.08 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const k = pNext++ % MAXP;
      pPos.set([at.x, at.y, at.z], k * 3);
      const a = Math.random() * Math.PI * 2, b = Math.acos(rnd(-1, 1));
      const v = speed * rnd(0.3, 1);
      pVel.set([Math.sin(b) * Math.cos(a) * v, Math.cos(b) * v * 0.6 + up, Math.sin(b) * Math.sin(a) * v], k * 3);
      const f = rnd(0.7, 1.3);
      pCol.set([c.r * f, c.g * f, c.b * f], k * 3);
      pLife[k] = rnd(0.5, 1.1);
    }
  }
  function updateSparks(dt) {
    for (let k = 0; k < MAXP; k++) {
      if (pLife[k] <= 0) { pPos[k * 3 + 1] = -10; continue; }
      pLife[k] -= dt;
      pVel[k * 3 + 1] -= 0.35 * dt;
      for (let j = 0; j < 3; j++) pPos[k * 3 + j] += pVel[k * 3 + j] * dt;
      const fade = Math.max(0, Math.min(1, pLife[k] * 2));
      pCol[k * 3] *= 0.985 + 0.015 * fade; pCol[k * 3 + 1] *= 0.98 + 0.02 * fade; pCol[k * 3 + 2] *= 0.97 + 0.03 * fade;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // filet qui se gonfle au point d'impact du ballon
  function netHit(at, strength = 1) {
    let best = null;
    let bd = Infinity;
    for (const n of nets) {
      const p = new THREE.Vector3();
      n.mesh.getWorldPosition(p);
      const d = p.distanceTo(at);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return;
    best.st.at.copy(at);
    best.st.amp = 0.05 * strength;
  }

  // --- Caméra : plans fixes, travellings adoucis, tremblement d'impact ------------------------------------------------
  // Cadrage : champ vertical v et champ horizontal h minimaux (degrés) ; sur un écran en hauteur (téléphone), le champ
  // vertical s'ouvre pour que la largeur voulue tienne toujours.
  const cam = { pos: new THREE.Vector3(0, 0.3, 3), look: new THREE.Vector3(0, 0.1, 0), from: null, to: null, t: 0, dur: 0, shake: 0, spec: { v: 40, h: 40 } };
  function camSet(pos, look, spec = cam.spec) {
    cam.pos.copy(pos); cam.look.copy(look); cam.to = null; cam.spec = { ...spec };
  }
  function camTo(pos, look, dur = 1.2, spec = cam.spec) {
    cam.from = { pos: cam.pos.clone(), look: cam.look.clone(), spec: { ...cam.spec } };
    cam.to = { pos: pos.clone(), look: look.clone(), spec: { ...spec } };
    cam.t = 0; cam.dur = dur;
  }
  const fovOf = (spec) => {
    const h = THREE.MathUtils.degToRad(spec.h);
    return Math.max(spec.v, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / Math.max(0.2, camera.aspect))));
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const tmpLook = new THREE.Vector3();
  const shakeOff = new THREE.Vector3();
  cam.roll = 0; // bascule de la caméra (plongeon en vue subjective)
  cam.offset = new THREE.Vector3(); // décalage ajouté au plan (plongeon)
  function updateCamera(dt) {
    if (cam.to) {
      cam.t = Math.min(1, cam.t + dt / cam.dur);
      const k = ease(cam.t);
      cam.pos.lerpVectors(cam.from.pos, cam.to.pos, k);
      cam.look.lerpVectors(cam.from.look, cam.to.look, k);
      cam.spec = { v: THREE.MathUtils.lerp(cam.from.spec.v, cam.to.spec.v, k), h: THREE.MathUtils.lerp(cam.from.spec.h, cam.to.spec.h, k) };
      if (cam.t >= 1) cam.to = null;
    }
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
    const s = cam.shake * cam.shake * 0.004;
    shakeOff.set(rnd(-s, s), rnd(-s, s), rnd(-s, s));
    camera.position.copy(cam.pos).add(shakeOff).add(cam.offset);
    camera.lookAt(tmpLook.copy(cam.look).add(cam.offset));
    if (cam.roll) camera.rotateZ(cam.roll);
    const fov = fovOf(cam.spec);
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  // --- Boucle -----------------------------------------------------------------------------------------------------
  let alive = true;
  let raf = 0;
  let last = 0;
  let clock = 0;
  const tickers = new Set();
  const fogCol = new THREE.Color();
  const view = new THREE.Vector3();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    clock += dt;
    setForestTime(clock);
    tickers.forEach((fn) => fn(dt, clock));
    for (const n of nets) {
      n.st.amp *= Math.exp(-dt * 5);
      if (n.st.uniforms) n.st.uniforms.uAmp.value = n.st.amp * Math.sin(Math.min(1, n.st.amp * 40) * 1.57);
    }
    updateSparks(dt);
    updateCamera(dt);
    photo.update(dt);
    camera.getWorldDirection(view);
    if (photo.horizon(Math.atan2(view.x, -view.z), fogCol)) { scene.fog.color.copy(fogCol.multiplyScalar(look.haze)); scene.background.copy(fogCol); }
    forest?.update({ position: camera.position });
    renderer.render(scene, camera);
  }

  function resize() {
    const p = canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  resize();
  raf = requestAnimationFrame(frame);

  // position à l'écran (pixels CSS) d'un point de la scène
  const proj = new THREE.Vector3();
  function toScreen(v) {
    proj.copy(v).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (proj.x * 0.5 + 0.5) * r.width, y: (-proj.y * 0.5 + 0.5) * r.height, behind: proj.z > 1 };
  }
  // rayon depuis un point de l'écran (pixels CSS) : intersection avec un plan horizontal (y) ou vertical (z)
  const ray = new THREE.Raycaster();
  function pickPlane(x, y, plane) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  return {
    THREE, scene, camera, renderer, players, goals,
    addShadow, addBall, burst, netHit, ringMaterial, beamMaterial,
    camSet, camTo,
    get camMoving() { return !!cam.to; },
    camOffset(v, roll = 0) { cam.offset.copy(v); cam.roll = roll; },
    shake(k = 1) { cam.shake = Math.min(1.2, cam.shake + k); },
    onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
    toScreen, pickPlane,
    keep,
    get time() { return clock; },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      tickers.clear();
      forest?.dispose();
      players.dispose();
      photo.dispose();
      ground.material?.userData.noise?.dispose();
      ground.material?.dispose();
      disposables.forEach((d) => d.dispose?.());
      sweep(scene, lent);
      sweep(camera, lent);
      renderer.renderLists.dispose();
      canvas.remove();
      renderer.setSize(1, 1, false); // la toile garde son contexte pour la séance suivante, sans image en mémoire
    },
  };
}
