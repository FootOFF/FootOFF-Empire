import * as THREE from 'three';
import { instantiateModel } from './assets';
import { resolveProp } from './manifest';
import { TREES } from './trees.generated';

// Arbres du décor : chêne, hêtre, peuplier, pin sylvestre et sapin, modélisés dans Blender (build_trees.py) avec
// écorces photographiées et houppiers en touffes de vraies feuilles. De près (plateforme, abords, parcelles) : les
// modèles 3D, ombres portées, vent léger, soleil à travers les feuilles. Au loin (forêts des collines) : imposteurs
// — chaque espèce rendue sous 8 angles (couleur, relief, occlusion), une image par arbre face à l'écran, qui prend
// l'angle de vue le plus proche (fondu entre deux angles) et reste éclairée en direct comme le reste de la scène
// (soleil, ciel, brume). Végétation basse des jardins (buis, arbustes, haies taillées), toujours en 3D. Liste :
// [x, y, z, hauteur, largeur, espèce, orientation, arbre du site, longueur], en unités du jeu ; largeur relative à
// la hauteur comme dans site_trees.json, sauf pour une haie (largeur et longueur réelles).

const BASE = import.meta.env.BASE_URL;
const SCALE = 1.15; // hauteur réelle des arbres : la liste donne la hauteur du houppier d'origine
const FAR_SHARE = { haute: 1, auto: 1, economie: 0.5 }; // part des arbres lointains affichés
const TINT = { // teinte du feuillage par espèce (comme le rendu des imposteurs, render_impostors.py)
  chene: [0.82, 0.92, 0.72], hetre: [0.98, 1.06, 0.8], peuplier: [0.8, 0.94, 0.78], pin: [0.92, 0.98, 0.9], sapin: [0.8, 0.95, 0.85],
  buis: [0.78, 0.98, 0.62], arbuste: [0.86, 0.98, 0.68], haie: [0.8, 1.0, 0.64],
};
const SHRUBS = TREES.shrubs || {};
const UP = new THREE.Vector3(0, 1, 0);
const time = { value: 0 }; // horloge du vent, partagée par tous les feuillages
let shadows = true; // ombres portées des arbres proches : pas sur téléphone ni en économie (deuxième rendu complet)
const narrow = () => Math.min(window.innerWidth, window.innerHeight) < 600;
// au-delà de cette distance du bord du site (unités du jeu), les arbres sont toujours des imposteurs
const nearRadius = (q) => (q === 'haute' ? 9 : q === 'economie' ? 0 : narrow() ? 3 : 6);
// arbres du site et des abords : modèles 3D à moins de cette distance de la caméra (unités du jeu), imposteurs
// au-delà (écart entre les deux seuils : pas de va-et-vient quand la caméra s'arrête à la limite)
const lodDistance = (q) => (q === 'haute' ? [32, 36] : q === 'economie' || narrow() ? [16, 19] : [24, 28]);
// ombres des arbres affichés en imposteurs : leur modèle 3D, dessiné seulement dans la carte d'ombres (sommets
// envoyés hors de l'écran au rendu normal, matériau de profondeur pour l'ombre)
const GHOST = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
GHOST.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', 'vec4 mvPosition = vec4(0.0);\ngl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
};
const BARK_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const species = (kind) => (TREES.species[kind] || SHRUBS[kind] ? kind : 'chene');

export const setForestTime = (t) => { time.value = t; };

// Feuillage au loin : les niveaux réduits d'une texture détourée moyennent l'alpha des feuilles avec le vide autour,
// qui passe sous le seuil (les arbres lointains ou vus sur un petit écran perdaient leurs feuilles, il ne restait
// que les troncs). On remonte l'alpha selon le niveau de la texture lu à cet endroit.
const keepCoverage = (tex, uv) => `
  {
    vec2 tsz = vec2(textureSize(${tex}, 0));
    vec2 ddx = dFdx(${uv}) * tsz, ddy = dFdy(${uv}) * tsz;
    float lod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-8));
    diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.28;
  }
  #include <alphatest_fragment>`;

// Imposteurs : matériau standard (mêmes lumières, ciel et brume que les arbres proches), image et relief lus dans
// l'atlas, quad tourné vers l'écran dans le shader.
function impostorMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, alphaTest: 0.5 });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tColor: atlas.color, tNormal: atlas.normal, uTime: time,
      uViews: { value: TREES.views }, uRows: { value: TREES.rows },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aCenter;
        attribute vec2 aSize;
        attribute float aYaw;
        attribute float aRow;
        attribute vec3 aTint;
        attribute float aPhase;
        uniform float uTime;
        uniform float uViews;
        uniform float uRows;
        varying vec2 vUvA;
        varying vec2 vUvB;
        varying float vMix;
        varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `
        // angle de vue horizontal relatif à l'arbre -> deux colonnes voisines de l'atlas et leur fondu
        vec3 toCam = cameraPosition - aCenter;
        float f = fract((atan(toCam.x, toCam.z) - aYaw) / 6.2831853) * uViews;
        float c0 = floor(f);
        vMix = f - c0;
        float c1 = mod(c0 + 1.0, uViews);
        vec2 inCell = position.xy + 0.5;
        float v0 = 1.0 - (aRow + 1.0) / uRows;
        vUvA = vec2((c0 + inCell.x) / uViews, v0 + inCell.y / uRows);
        vUvB = vec2((c1 + inCell.x) / uViews, v0 + inCell.y / uRows);
        vTint = aTint;
        // image face à l'écran, centrée sur le milieu de l'arbre (comme le rendu orthographique d'origine)
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float sway = sin(uTime * 0.9 + aPhase) * 0.008 * aSize.y * max(0.0, position.y + 0.1);
        vec3 transformed = aCenter + camRight * (position.x * aSize.x + sway) + camUp * (position.y * aSize.y);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tColor;
        uniform sampler2D tNormal;
        varying vec2 vUvA;
        varying vec2 vUvB;
        varying float vMix;
        varying vec3 vTint;`)
      .replace('#include <map_fragment>', `
        vec4 impC = mix(texture2D(tColor, vUvA), texture2D(tColor, vUvB), vMix);
        diffuseColor *= vec4(impC.rgb * vTint, impC.a);`)
      .replace('#include <alphatest_fragment>', keepCoverage('tColor', 'vUvA'))
      .replace('#include <normal_fragment_begin>', `
        float faceDirection = 1.0;
        vec4 impN = mix(texture2D(tNormal, vUvA), texture2D(tNormal, vUvB), vMix);
        vec3 normal = normalize(impN.xyz * 2.0 - 1.0); // repère de la vue (celui de la caméra du rendu)
        vec3 nonPerturbedNormal = normal;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * max(0.0, -dot(normal, directionalLights[0].direction)) * 0.22;
        #endif`)
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= mix(0.35, 1.0, impN.a); // ciel caché : cœur du houppier, dessous des touffes
        reflectedLight.directDiffuse *= mix(0.7, 1.0, impN.a);`);
  };
  return m;
}

// Feuillage des arbres proches : alpha détouré, normales arrondies du houppier, soleil à travers les feuilles, vent
// léger (le haut du houppier ondule, le pied reste immobile). Faces avant seulement : les cartes vues de dos sont
// surtout au fond du houppier, cachées par celles de devant, et coûtaient la moitié du rendu du feuillage ; les
// ombres, elles, prennent les deux faces.
function leafMaterial(base, tint) {
  const m = base.clone();
  m.color.setRGB(...tint, THREE.SRGBColorSpace);
  m.side = THREE.FrontSide;
  m.shadowSide = THREE.DoubleSide;
  m.alphaTest = 0.42;
  m.transparent = false;
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          float hgt = mvPosition.y - instanceMatrix[3].y; // hauteur au-dessus du pied (unités du parent)
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
          float sway = smoothstep(0.2, 1.8, hgt) * 0.012;
          mvPosition.x += sin(uTime * 1.3 + ph + hgt * 2.5) * sway;
          mvPosition.z += cos(uTime * 1.05 + ph * 1.3) * sway * 0.7;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <alphatest_fragment>', keepCoverage('map', 'vMapUv'))
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * max(0.0, -dot(normal, directionalLights[0].direction)) * 0.22;
        #endif`);
  };
  return m;
}

// Modèle des arbres, chargé une fois (comme tous les GLB, assets.js) : espèce -> parties
// [{ geometry, material, depth, leaves, local }], local = repère de la partie dans le modèle, en mètres.
let treesPromise = null;
function loadTrees() {
  const entry = resolveProp('trees');
  if (!treesPromise && entry) {
    treesPromise = instantiateModel(entry, { w: 1, d: 1 }).then((wrapper) => {
      const model = wrapper.children[0];
      wrapper.updateMatrixWorld(true);
      const toModel = model.matrixWorld.clone().invert(); // sans l'échelle du jeu
      const lib = new Map();
      wrapper.traverse((o) => {
        const m = o.isMesh && /^tree_([a-z]+)__(bark|leaves|core)/.exec(o.name);
        if (!m) return;
        const leaves = m[2] === 'leaves';
        if (!lib.has(m[1])) lib.set(m[1], []);
        lib.get(m[1]).push({
          geometry: o.geometry,
          material: leaves ? leafMaterial(o.material, TINT[m[1]] || [1, 1, 1]) : o.material,
          depth: leaves ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.material.map, alphaTest: 0.42 }) : null,
          leaves,
          part: m[2],
          local: toModel.clone().multiply(o.matrixWorld),
        });
      });
      return lib;
    }).catch((err) => {
      console.warn('[forest] modèles des arbres indisponibles', err);
      treesPromise = null;
      return null;
    });
  }
  return treesPromise || Promise.resolve(null);
}

// Instances d'une plante : foot = pied (position et orientation, repère du parent) ; hm, wm, lm : hauteur, largeur
// et longueur voulues en mètres (largeur relative à la hauteur pour les arbres et arbustes, réelle pour une haie) ;
// unit : mètres -> unités du parent. Arbres 15 % plus hauts que la valeur d'origine ; haie en modules mis bout à
// bout le long de son axe (x).
function instancesOf(kind, foot, hm, wm, lm, unit, x, z) {
  const key = species(kind);
  if (key === 'haie') {
    const [L0, W0, H0] = SHRUBS.haie.module;
    const n = Math.max(1, Math.round(lm / L0));
    return Array.from({ length: n }, (_, i) => ({
      key,
      matrix: foot.clone()
        .multiply(new THREE.Matrix4().makeTranslation((-lm / 2 + ((i + 0.5) * lm) / n) * unit, 0, 0))
        .multiply(new THREE.Matrix4().makeScale((lm / n / L0) * unit, (hm / H0) * unit, (wm / W0) * unit)),
      x: x + i * 0.37,
      z,
    }));
  }
  const tree = TREES.species[key];
  const k = ((hm * (tree ? SCALE : 1)) / (tree || SHRUBS[key]).height) * unit;
  return [{ key, matrix: foot.clone().multiply(new THREE.Matrix4().makeScale(k * wm, k, k * wm)), x, z }];
}

// Teinte d'un pied : variée d'un arbre à l'autre, quelques arbustes pourpres (comme les berbéris des massifs).
const PURPLE = new THREE.Color(1.25, 0.32, 0.55);
function tintOf(key, x, z, col) {
  const v = 0.88 + hash(x, z) * 0.24;
  col.setRGB(v * (0.95 + hash(x, z, 1) * 0.1), v, v * (0.92 + hash(x, z, 3) * 0.1));
  return key === 'arbuste' && hash(x, z, 7) < 0.25 ? col.multiply(PURPLE) : col;
}

// Plante les instances : un maillage par espèce et par partie (écorce, feuillage, cœur des haies), ombres portées.
function plantMeshes(lib, items, parent) {
  const meshes = [];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (const [key, parts] of lib) {
    const mine = items.filter((t) => t.key === key);
    if (!mine.length) continue;
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, mine.length);
      mine.forEach((t, i) => {
        mesh.setMatrixAt(i, m4.copy(t.matrix).multiply(part.local));
        mesh.setColorAt(i, tintOf(key, t.x, t.z, col));
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      if (part.leaves) mesh.customDepthMaterial = part.depth;
      mesh.name = `forest_${key}_${part.part}`;
      parent.add(mesh);
      meshes.push(mesh);
    }
  }
  return meshes;
}

// Végétation des bâtiments et des parcelles : repères tree_spot_* des modèles (hauteur h, largeur w et longueur l
// d'une haie en mètres, espèce ; l'orientation du repère donne l'axe d'une haie), remplacés par les plantes
// modélisées, enfants du modèle (elles suivent la parcelle et son chantier).
export function plantSpots(node) {
  const spots = [];
  node.traverse((o) => { if (/^tree_spot/.test(o.name)) spots.push(o); });
  if (!spots.length) return;
  loadTrees().then((lib) => {
    if (!lib) return;
    node.updateMatrixWorld(true);
    const toNode = node.matrixWorld.clone().invert();
    const items = spots.flatMap((o) => {
      const { h = 8, w = 0.75, l = 2, kind } = o.userData;
      const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      const foot = toNode.clone().multiply(o.matrixWorld);
      if (kind !== 'haie') foot.multiply(new THREE.Matrix4().makeRotationY(hash(p.x, p.z, 5) * Math.PI * 2));
      return instancesOf(kind, foot, h, w, l, 1, p.x, p.z);
    });
    plantMeshes(lib, items, node);
  });
}

// Maillage d'imposteurs : un quad par arbre, attributs par instance ; fill() les réécrit (arbres du site : à chaque
// changement de niveau de détail).
function impostorMesh(material, capacity, name) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('normal', quad.attributes.normal);
  const attrs = {};
  for (const [key, size] of [['aCenter', 3], ['aSize', 2], ['aYaw', 1], ['aRow', 1], ['aTint', 3], ['aPhase', 1]]) {
    attrs[key] = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity) * size), size);
    attrs[key].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(key, attrs[key]);
  }
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false; // positions calculées dans le shader
  mesh.name = name;
  return {
    mesh,
    fill(items) {
      items.forEach((t, i) => {
        const s = TREES.species[t[5]] || TREES.species.chene;
        const k = (t[3] * SCALE) / s.height; // mètres du modèle -> unités du jeu, à la hauteur voulue
        const hh = s.ortho * k;
        attrs.aCenter.array.set([t[0], t[1] + (s.height * k) / 2, t[2]], i * 3);
        attrs.aSize.array.set([hh * (TREES.cell[0] / TREES.cell[1]) * (t[4] / t[3]), hh], i * 2);
        attrs.aYaw.array[i] = t[6];
        attrs.aRow.array[i] = s.row;
        const v = 0.86 + hash(t[0], t[2]) * 0.28;
        attrs.aTint.array.set([v * (0.94 + hash(t[0], t[2], 1) * 0.12), v * (0.97 + hash(t[0], t[2], 2) * 0.06), v * (0.9 + hash(t[0], t[2], 3) * 0.12)], i * 3);
        attrs.aPhase.array[i] = t[0] * 0.7 + t[2] * 0.9;
      });
      geo.instanceCount = items.length;
      Object.values(attrs).forEach((attr) => { attr.needsUpdate = true; });
    },
    dispose() { geo.dispose(); },
  };
}

export function createForest(group, list, { quality = 'auto', site }) {
  let q = quality;
  const siteDist = (x, z) => Math.hypot(Math.max(site.x0 - x, 0, x - site.x1), Math.max(site.z0 - z, 0, z - site.z1));
  const loader = new THREE.TextureLoader();
  const atlas = { color: { value: null }, normal: { value: null }, half: null };
  const loadAtlas = () => {
    const half = q === 'economie' || (q === 'auto' && narrow());
    if (atlas.half === half) return;
    atlas.half = half;
    for (const [key, file, srgb] of [['color', 'impostors_color', true], ['normal', 'impostors_normal', false]]) {
      atlas[key].value?.dispose();
      const t = loader.load(`${BASE}vegetation/${file}${half ? '-half' : ''}.webp`);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      atlas[key].value = t;
    }
  };
  const impostor = impostorMaterial(atlas);
  let far = null; // imposteurs des forêts lointaines (fixes)
  let nearImp = null; // imposteurs des arbres proches trop loin de la caméra
  let nearMeshes = [];
  let lodGroups = []; // par espèce : { trees, state (1 = en 3D), parts: [{ mesh, mats, cols }] }
  let lastCam = null;
  let lib = null;
  let near = [];
  let alive = true; // le modèle peut arriver après dispose() (liste replantée entre-temps)

  function clearNear() {
    nearMeshes.forEach((m) => { group.remove(m); m.dispose(); });
    nearMeshes = [];
    lodGroups = [];
    if (nearImp) { group.remove(nearImp.mesh); nearImp.dispose(); nearImp = null; }
  }

  function buildNear() {
    clearNear();
    if (!lib) return;
    const rot = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const footOf = (t) => new THREE.Matrix4().compose(p.set(t[0], t[1], t[2]), rot.setFromAxisAngle(UP, t[6]), one);
    // végétation basse (buis, arbustes, haies) : toujours en 3D
    nearMeshes = plantMeshes(lib, near.filter((t) => !TREES.species[t[5]]).flatMap((t) => {
      const hedge = t[5] === 'haie';
      return instancesOf(t[5], footOf(t), t[3] * 10, hedge ? t[4] * 10 : t[4] / t[3], (t[8] || 0) * 10, 0.1, t[0], t[2]);
    }), group);
    // arbres : 3D près de la caméra, imposteurs plus loin (update) ; ombres toujours des modèles 3D (fantômes)
    const trees = near.filter((t) => TREES.species[t[5]]);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (const key of Object.keys(TREES.species)) {
      const mine = trees.filter((t) => t[5] === key);
      const parts = lib.get(key);
      if (!mine.length || !parts) continue;
      const items = mine.map((t) => instancesOf(key, footOf(t), t[3] * 10, t[4] / t[3], 0, 0.1, t[0], t[2])[0]);
      const g = { trees: mine, state: new Uint8Array(mine.length), parts: [] };
      for (const part of parts) {
        const n = mine.length;
        const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3);
        items.forEach((it, i) => {
          m4.copy(it.matrix).multiply(part.local).toArray(mats, i * 16);
          tintOf(key, it.x, it.z, col).toArray(cols, i * 3);
        });
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
        mesh.setColorAt(0, col);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false; // nombre d'instances variable
        mesh.receiveShadow = true;
        mesh.name = `forest_${key}_${part.part}`;
        group.add(mesh);
        nearMeshes.push(mesh);
        if (shadows) {
          const ghost = new THREE.InstancedMesh(part.geometry, GHOST, n);
          ghost.instanceMatrix.array.set(mats);
          ghost.computeBoundingSphere();
          ghost.castShadow = true;
          ghost.customDepthMaterial = part.leaves ? part.depth : BARK_DEPTH;
          ghost.name = `forest_${key}_${part.part}_ombre`;
          group.add(ghost);
          nearMeshes.push(ghost);
        }
        g.parts.push({ mesh, mats, cols });
      }
      lodGroups.push(g);
    }
    nearImp = impostorMesh(impostor, trees.length, 'forest_impostors_proches');
    group.add(nearImp.mesh);
    lastCam = null; // niveau de détail à recalculer
  }

  function build() {
    shadows = !(q === 'economie' || (q === 'auto' && narrow()));
    loadAtlas();
    const r = nearRadius(q);
    const isNear = (t) => t[7] || !TREES.species[t[5]] || siteDist(t[0], t[2]) < r; // végétation basse : toujours 3D
    near = list.filter(isNear);
    // économie : un arbre lointain sur deux, pris au hasard (pas une zone entière) ; du plus proche au plus lointain
    const share = FAR_SHARE[q] ?? 1;
    const kept = list.filter((t) => !isNear(t) && hash(t[0], t[2], 9) < share);
    kept.sort((a, b) => Math.hypot(a[0], a[2]) - Math.hypot(b[0], b[2]));
    if (far) { group.remove(far.mesh); far.dispose(); }
    far = impostorMesh(impostor, kept.length, 'forest_impostors');
    far.fill(kept);
    group.add(far.mesh);
    buildNear();
  }
  build();
  loadTrees().then((l) => {
    if (!alive || !l) return;
    lib = l;
    buildNear();
  });

  return {
    // Niveau de détail des arbres proches selon la caméra : instances 3D réécrites seulement quand un arbre change
    // de côté d'un seuil.
    update(camera) {
      if (!lodGroups.length) return;
      const c = camera.position;
      if (lastCam && lastCam.distanceToSquared(c) < 0.04) return;
      const first = !lastCam;
      lastCam = (lastCam || new THREE.Vector3()).copy(c);
      const [dIn, dOut] = lodDistance(q);
      let changed = first;
      for (const g of lodGroups) {
        g.trees.forEach((t, i) => {
          const d = Math.hypot(t[0] - c.x, t[1] + t[3] * 0.6 - c.y, t[2] - c.z);
          const in3d = d < (g.state[i] ? dOut : dIn) ? 1 : 0;
          if (in3d !== g.state[i]) { g.state[i] = in3d; changed = true; }
        });
      }
      if (!changed) return;
      const distant = [];
      for (const g of lodGroups) {
        let n = 0;
        g.trees.forEach((t, i) => {
          if (!g.state[i]) { distant.push(t); return; }
          for (const pt of g.parts) {
            pt.mesh.instanceMatrix.array.set(pt.mats.subarray(i * 16, i * 16 + 16), n * 16);
            pt.mesh.instanceColor.array.set(pt.cols.subarray(i * 3, i * 3 + 3), n * 3);
          }
          n++;
        });
        for (const pt of g.parts) {
          pt.mesh.count = n;
          pt.mesh.instanceMatrix.needsUpdate = true;
          pt.mesh.instanceColor.needsUpdate = true;
        }
      }
      nearImp.fill(distant);
    },
    setQuality(nq) {
      if (nq === q) return;
      q = nq;
      build();
    },
    dispose() {
      alive = false;
      if (far) { group.remove(far.mesh); far.dispose(); }
      clearNear();
      atlas.color.value?.dispose();
      atlas.normal.value?.dispose();
      impostor.dispose();
    },
  };
}
