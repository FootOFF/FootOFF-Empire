import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// Chargement des GLB : Draco + KTX2 + Meshopt, cache par URL, instances clonées
// (géométries/matériaux/textures partagés entre instances).
// Les décodeurs Draco / Basis sont embarqués par three (import.meta.url) et émis par Vite.

const BASE = import.meta.env.BASE_URL;
let loader = null;
let ktx2 = null;
let draco = null;
const templates = new Map(); // url -> Promise<THREE.Object3D>
let requested = 0; // écran de chargement : modèles demandés / arrivés (réussis ou non)
let settled = 0;
const nightMats = new Set();
let isNight = 0; // niveau d'éclairage courant (0 à 1) : un modèle chargé après la bascule doit le respecter

export function initAssets(renderer) {
  if (loader) return;
  draco = new DRACOLoader();
  ktx2 = new KTX2Loader().detectSupport(renderer);
  loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
}

function prepareTemplate(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (/^crowd_/i.test(o.name)) { o.visible = false; return; } // zones techniques, jamais affichées
    o.castShadow = true;
    o.receiveShadow = true;
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

function loadTemplate(url) {
  if (!templates.has(url)) {
    const p = loader.loadAsync(`${BASE}${url}`).then((gltf) => prepareTemplate(gltf.scene));
    p.catch(() => templates.delete(url)); // autorise un nouvel essai plus tard
    requested += 1;
    p.finally(() => { settled += 1; }).catch(() => {});
    templates.set(url, p);
  }
  return templates.get(url);
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

export const assetsProgress = () => ({ requested, settled });

let boost = 1;
// Éclairage des fenêtres, LED et têtes de projecteurs : niveau de 0 (jour) à 1 (nuit) ; un booléen est accepté.
export function setAssetsNight(level) {
  isNight = typeof level === 'number' ? level : level ? 1 : 0;
  nightMats.forEach((m) => {
    const e = m.userData.nightEmissive;
    m.emissiveIntensity = (e.day + (e.night - e.day) * isNight) * boost;
  });
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
  nightMats.clear();
  draco?.dispose();
  ktx2?.dispose();
  loader = null;
}
