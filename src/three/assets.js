import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { placeGround, prepareGround, setGroundAnisotropy } from './ground';

// Chargement des GLB : Draco + KTX2 + Meshopt, cache par URL, instances clonées
// (géométries/matériaux/textures partagés entre instances).
// Les décodeurs Draco / Basis sont embarqués par three (import.meta.url) et émis par Vite.

const BASE = import.meta.env.BASE_URL;
let loader = null;
let ktx2 = null;
let draco = null;
const templates = new Map(); // url -> Promise<THREE.Object3D>
// Écran de chargement : fichiers demandés / arrivés (réussis ou non) et octets reçus / attendus. Un fichier dont
// la taille n'est pas encore connue (réponse pas encore commencée) compte pour une taille supposée.
let requested = 0;
let settled = 0;
const jobs = new Set();
const nightMats = new Set();
const poolMats = new Set(); // flaques de lumière au sol (lampadaires du site) : ajoutées à l'image, la nuit seulement
const POOL = 0.28; // intensité d'une flaque en pleine nuit (lumière linéaire ajoutée au sol)
let isNight = 0; // niveau d'éclairage courant (0 à 1) : un modèle chargé après la bascule doit le respecter

// Photos partagées d'un modèle à l'autre. Les niveaux d'un bâtiment et les bâtiments entre eux reprennent les mêmes
// images (béton, brique, verre, gazon…), chaque GLB avec sa copie ; un modèle chargé reste en mémoire jusqu'à la
// fermeture du jeu (améliorations, aperçus de la vitrine). Une image aux mêmes octets n'est plus décodée qu'une fois,
// et ses textures partagent la même image sur le GPU (Texture.source) : tous les modèles chargés, 517 Mo de textures
// avant, 134 Mo désormais ; le complexe complet de l'Élite, 178 -> 115 Mo. Sur iPhone, la mémoire qui montait au fil
// d'une longue partie finissait par faire recharger la page par Safari (écran blanc, puis l'écran de chargement).
const images = new Map(); // empreinte des octets -> Promise<THREE.Texture> (la première texture créée)
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
function digest(buf) {
  if (globalThis.crypto?.subtle) return crypto.subtle.digest('SHA-1', buf).then(hex);
  // hors contexte sécurisé (essai sur le réseau local, en http) : empreinte calculée ici
  const a = new Uint8Array(buf);
  let h1 = 0x811c9dc5;
  let h2 = a.length;
  for (let i = 0; i < a.length; i++) {
    h1 = Math.imul(h1 ^ a[i], 0x01000193);
    h2 = Math.imul(h2 ^ a[i], 0x5bd1e995) ^ (h2 >>> 13);
  }
  return Promise.resolve(`${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`);
}
// Extension du chargeur GLTF : la lecture d'une image passe d'abord par le registre commun. Une copie reprend les
// réglages d'une texture neuve (le chargeur, puis ground.js, règlent les leurs selon l'usage dans ce modèle).
function sharedImages(parser) {
  const own = parser.loadImageSource.bind(parser);
  parser.loadImageSource = (index, imageLoader) => {
    const def = parser.json.images[index];
    if (def.bufferView === undefined) return own(index, imageLoader);
    return parser.getDependency('bufferView', def.bufferView).then(digest).then((print) => {
      const key = `${def.mimeType}:${print}`;
      const first = images.get(key);
      if (!first) {
        const p = own(index, imageLoader);
        images.set(key, p);
        p.catch(() => images.delete(key)); // image illisible : un autre modèle pourra réessayer
        return p;
      }
      return first.then((t) => {
        const copy = t.clone();
        copy.colorSpace = THREE.NoColorSpace;
        copy.anisotropy = 1;
        return copy;
      });
    });
  };
  return { name: 'FO_shared_images' };
}

export function initAssets(renderer) {
  if (loader) return;
  draco = new DRACOLoader();
  ktx2 = new KTX2Loader().detectSupport(renderer);
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  loader.register(sharedImages);
  setGroundAnisotropy(renderer);
}

function prepareTemplate(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (/^crowd_/i.test(o.name)) { o.visible = false; return; } // zones techniques, jamais affichées
    if (o.material?.name === 'emissive_pool') {
      // flaques de lumière : texture ajoutée à l'image (rien à éclairer, pas d'ombre, ni occlusion), cachées le jour
      const src = o.material;
      const m = new THREE.MeshBasicMaterial({
        map: src.emissiveMap, color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        fog: false, // ajoutée à l'image : la brume l'éclaircirait au lieu de l'éteindre
      });
      m.name = src.name;
      m.color.setScalar(POOL * isNight);
      m.visible = isNight > 0.01;
      src.dispose();
      o.material = m;
      o.castShadow = false;
      o.receiveShadow = false;
      poolMats.add(m);
      return;
    }
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material?.name === 'net') { // filets de but : mailles fondues au loin en voile blanc, sans ombre pleine
      Object.assign(o.material, { transparent: true, depthWrite: false, alphaTest: 0, side: THREE.DoubleSide });
      o.castShadow = false;
    }
    [].concat(o.material).forEach(prepareGround); // matières photo : sols ground_*, stade (ground.js)
    placeGround(o); // ordre de dessin et ombres des sols
    // emissive_* : allumé la nuit, éteint le jour.
    if (/^emissive_/i.test(o.name) || /^emissive_/i.test(o.parent?.name || '')) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m.emissive) return;
        if (m.emissive.getHex() === 0) m.emissive.set(0xffe2b0);
        m.userData.nightEmissive = { day: 0, night: m.emissiveIntensity > 0 ? m.emissiveIntensity : 1.5 };
        m.emissiveIntensity = m.userData.nightEmissive.night * isNight;
        nightMats.add(m);
      });
    }
  });
  return root;
}

// Suivi d'un fichier pour l'écran de chargement : progress(octets reçus, taille) puis done() (une seule fois).
export function trackLoad(estimate = 400e3) {
  const job = { loaded: 0, total: 0, estimate, done: false };
  jobs.add(job);
  requested += 1;
  return {
    progress(loaded, total) {
      job.loaded = loaded;
      if (total) job.total = Math.max(total, loaded); // réponse compressée : les octets reçus dépassent l'annonce
    },
    done() {
      if (job.done) return;
      job.done = true;
      settled += 1;
      job.total = job.total || job.loaded || job.estimate;
      job.loaded = job.total;
    },
  };
}

function loadTemplate(url) {
  if (!templates.has(url)) {
    const job = trackLoad();
    const p = loader.loadAsync(`${BASE}${url}`, (e) => job.progress(e.loaded, e.lengthComputable ? e.total : 0))
      .then((gltf) => prepareTemplate(gltf.scene));
    p.catch(() => templates.delete(url)); // autorise un nouvel essai plus tard
    p.finally(job.done).catch(() => {});
    templates.set(url, p);
  }
  return templates.get(url);
}

// Charge un modèle à l'avance (aperçus de la vitrine de construction) : l'instancier ensuite est immédiat.
export function preloadModel(entry) {
  if (loader && entry?.url) loadTemplate(entry.url).catch(() => {});
}

// Instancie un modèle du manifeste, normalisé pour une emprise { w, d }.
export async function instantiateModel(entry, footprint) {
  if (!loader) throw new Error('initAssets() non appelé');
  const template = await loadTemplate(entry.url);
  const model = cloneSkinned(template);
  const wrapper = new THREE.Group();
  wrapper.name = `model:${entry.id}`;
  if (entry.rotY) model.rotation.y = entry.rotY;
  wrapper.add(model);

  if (entry.fit) {
    const b = new THREE.Box3().setFromObject(model);
    const size = b.getSize(new THREE.Vector3());
    const k = Math.min((footprint.w * 0.96) / (size.x || 1), (footprint.d * 0.96) / (size.z || 1));
    model.scale.multiplyScalar(k);
  } else if (entry.scale) {
    model.scale.multiplyScalar(entry.scale);
  }
  // L'origine du modèle fait foi (convention : centre de l'emprise, au sol) : un stade asymétrique
  // (tribune principale plus profonde) ne doit pas être décalé. Seul `fit` recentre et recale au sol.
  if (entry.fit) {
    const b = new THREE.Box3().setFromObject(model);
    const c = b.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= b.min.y;
  }
  if (entry.offset) model.position.add(new THREE.Vector3(...entry.offset));

  // positions des projecteurs déclarés dans le modèle
  const lights = [];
  model.traverse((o) => { if (/^light_/i.test(o.name)) lights.push(o); });
  wrapper.userData.lightAnchors = lights;
  return wrapper;
}

export function assetsProgress() {
  let loaded = 0;
  let total = 0;
  for (const j of jobs) {
    const t = j.total || Math.max(j.estimate, j.loaded);
    total += t;
    loaded += Math.min(j.loaded, t);
  }
  return { requested, settled, loaded, total };
}

let boost = 1;
// Éclairage des fenêtres, LED et têtes de projecteurs : niveau de 0 (jour) à 1 (nuit) ; un booléen est accepté.
export function setAssetsNight(level) {
  isNight = typeof level === 'number' ? level : level ? 1 : 0;
  nightMats.forEach((m) => {
    const e = m.userData.nightEmissive;
    m.emissiveIntensity = (e.day + (e.night - e.day) * isNight) * boost;
  });
  poolMats.forEach((m) => { m.color.setScalar(POOL * isNight); m.visible = isNight > 0.01; });
}

// Surintensité des éléments lumineux (LED, écrans) : 1 = normal.
export function setAssetsBoost(f) {
  if (Math.abs(f - boost) < 0.01) return;
  boost = f;
  setAssetsNight(isNight);
}

export async function disposeAssets() {
  const all = await Promise.allSettled([...templates.values()]);
  all.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    r.value.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    });
  });
  templates.clear();
  images.clear();
  nightMats.clear();
  poolMats.clear();
  draco?.dispose();
  ktx2?.dispose();
  loader = null;
}
