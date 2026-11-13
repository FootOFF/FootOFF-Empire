import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createPlayers3D, identityOf, loadPlayers3D } from './players3d';
import { ourKit } from '../game/kits';

// Studio photo des joueurs (1.0.37, demande du PDG du 13/11 : « du moderne… faut choquer mes amis », références : visuels
// produit noir et or, personnages 3D qui débordent des cartes). Le joueur 3D du match, à son visage, sa taille, son âge,
// dans la tenue du club, photographié en pied sous un éclairage de studio noir et or : l'image (PNG transparent) sert de
// visuel dans la fiche du joueur et dans le direct. Un seul moteur de rendu, créé à la demande et gardé ; chaque image
// reste en mémoire (joueur, tenue, pose) le temps de la session.

const W = 1020, H = 1500; // la photo est ensuite recadrée au ras du joueur (assez fine pour les écrans très denses)
const cache = new Map();
const done = new Map(); // photos déjà faites (clé → { url, hx }) : la fiche les montre dès sa première image (1.0.42)
let studio = null;
let queue = Promise.resolve(); // une photo à la fois : le studio n'a qu'un plateau
const FACE_H = Math.PI / 2; // (bancs d'essai) cap du joueur face à la caméra
const JOY = 'Celebrate_2'; // la célébration des photos de but, la même pour tous : bras en V, face à l'objectif (planche du 13/11)

function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(19, W / H, 0.1, 60);
  // éclairage de portrait (1.0.38) : une lumière principale chaude de trois quarts, haute (elle modèle le visage, au lieu
  // de l'aplatir de face), un débouché froid et faible de l'autre côté, deux contre-jours dorés qui découpent la
  // silhouette sur le noir
  // (1.0.40 : plus doux ; la peau claire brûlait et jaunissait sous une principale trop forte et des contre-jours trop dorés)
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x140f08, 0.3));
  const key = new THREE.DirectionalLight(0xfff3e6, 1.95); key.position.set(-2.6, 2.7, 2.6); scene.add(key);
  const fill = new THREE.DirectionalLight(0xc6d0dc, 0.75); fill.position.set(2.6, 1.3, 2.6); scene.add(fill);
  const rimL = new THREE.DirectionalLight(0xecd3a0, 5.2); rimL.position.set(-2.8, 2.2, -2.2); scene.add(rimL);
  const rimR = new THREE.DirectionalLight(0xd7b67a, 4.4); rimR.position.set(2.9, 1.6, -2.4); scene.add(rimR);
  const group = new THREE.Group();
  scene.add(group);
  const players = createPlayers3D(group, 2);
  studio = { renderer, scene, camera, players };
  return studio;
}

// pose : 'stand' (debout, de trois quarts) ou 'joy' (en pleine célébration)
async function shoot(look, { kit, pose, steps: at, celeb, frame }) {
  await loadPlayers3D();
  const S = getStudio();
  const keeper = look.pos === 'G';
  // une place de joueur de champ, même pour le gardien : il pose debout (son attente de match est accroupie), avec ses
  // manches longues et ses gants (keeperLook)
  const i = 1;
  S.players.reset(); // la photo d'avant ne déborde pas sur celle-ci (célébration en cours, appuis)
  S.players.setAgent(0, { x: 99, z: 99, h: 0 }, 0, 0); // l'autre place du plateau reste vide
  S.players.setKit(i, keeper ? kit.keeper : kit.shirt, kit.trim);
  S.players.keeperLook(i, keeper);
  S.players.setIdentity(i, identityOf(look, look.pos));
  const DIAG = frame && !['head', 'bust'].includes(frame);
  const ag = { x: 0, z: 0, h: DIAG ? FACE_H : Math.PI / 2 + (pose === 'joy' ? 0.15 : 0.42), speed: 0, cheer: pose === 'joy' ? 1 : 0, scorer: false, pose: 0, celeb: pose === 'joy' ? celeb || JOY : undefined }; // (scorer faux : célébrations debout seulement)
  S.players.setAgent(i, ag, 0, 1); // échelle 1 (au match : 0,1) : le joueur mesure sa taille en mètres
  // l'animation se pose : attente (respiration) ou célébration, jusqu'à son geste le plus parlant
  const steps = at ?? (pose === 'joy' ? 100 : 22); // célébration : les bras en V, le visage vers l'avant (planche du 13/11)
  for (let k = 0; k < steps; k++) S.players.commit(2, 1 / 30);
  // cadrage en pied, la tête près du haut de l'image (la carte la laisse déborder)
  const h = 1.85;
  const CAM = [0.15, h * 0.4, 6.4]; // légère contre-plongée : un plan de héros
  const DEV_FRAMES = { // gros plans des bancs d'essai : [position de la caméra, point visé]
    head: [[0.18, 1.72, 1.35], [0, 1.66, 0]], bust: [[0.25, 1.5, 2.6], [0, 1.42, 0]],
    profile: [[3.2, 1.3, 0], [0, 1.3, 0]], chest: [[0, 1.3, 1.9], [0, 1.3, 0]], armpit: [[1.1, 1.32, 1.0], [0.18, 1.3, 0]],
    collar: [[0.2, 1.55, 0.85], [0, 1.47, 0.05]], shorts: [[0.5, 0.85, 1.7], [0, 0.85, 0]], back: [[0, 1.3, -1.9], [0, 1.3, 0]], hand: [[0.75, 0.82, 0.7], [0.25, 0.78, 0]],
    boots: [[0.55, 0.3, 1.0], [0.08, 0.1, 0]], hem: [[0.55, 0.62, 0.75], [0.12, 0.63, 0]], backfull: [[0, 1.0, -4.2], [0, 1.0, 0]], face: [[0, 1.67, 0.75], [0, 1.66, 0]], face34: [[0.42, 1.67, 0.62], [0, 1.65, 0]], armback: [[0.75, 1.3, -0.95], [0.19, 1.3, 0]], armfront: [[0.55, 1.22, 0.85], [0.19, 1.3, 0]],
  };
  // debout : bras le long du corps, mains détendues, le regard vers l'objectif (1.0.40)
  const LOOKERS = new Set(['head', 'bust', 'face', 'face34']);
  if (pose !== 'joy') S.players.portrait(i, !DEV_FRAMES[frame] ? new THREE.Vector3(...CAM) : LOOKERS.has(frame) ? new THREE.Vector3(...DEV_FRAMES[frame][0]) : null);
  if (DEV_FRAMES[frame]) { S.camera.position.set(...DEV_FRAMES[frame][0]); S.camera.lookAt(...DEV_FRAMES[frame][1]); }
  else {
    S.camera.position.set(...CAM);
    S.camera.lookAt(0, h * 0.52, 0);
  }
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__heroDebug) window.__heroDebug(S, i); // (bancs d'essai)
  S.renderer.render(S.scene, S.camera);
  // recadrage au ras du joueur (quelques pixels de marge) : la carte place sa tête où elle veut, quelle que soit la pose
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g = c2.getContext('2d', { willReadFrequently: true });
  g.drawImage(S.renderer.domElement, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null; // rien sur la photo
  // où est la tête dans la photo (de 0 à 1 sur la largeur) : la carte la centre, quels que soient les bras ou les appuis.
  // Debout : le milieu des pixels du haut de la silhouette (la tête) ; en célébration, les bras peuvent passer au-dessus,
  // on prend alors l'axe du joueur (le centre de l'image du plateau : la caméra vise l'aplomb de ses pieds).
  let headX = W / 2;
  if (pose !== 'joy') {
    const band = Math.max(4, Math.round((y1 - y0) * 0.07));
    let sx = 0, n = 0;
    for (let y = y0; y < Math.min(y1, y0 + band); y++) {
      for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 12) { sx += x; n++; }
    }
    if (n) headX = sx / n;
  }
  const m = 6;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c2, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  return blob ? { url: URL.createObjectURL(blob), hx: Math.min(1, Math.max(0, (headX - x0) / out.width)) } : null;
}

// Photo d'un joueur (players.js) : promesse de { url, hx } (adresse d'une image PNG, position de la tête sur sa largeur),
// ou null si la 3D est indisponible. kit : la tenue (game/kits.js) ; par défaut la nôtre.
const keyOf = (p, { kit = ourKit(), pose = 'stand', steps, celeb, frame } = {}) => `${p.id ?? p.name}|${p.age}|${p.pos}|${kit.shirt}|${kit.trim}|${kit.keeper}|${pose}|${steps ?? ''}|${celeb ?? ''}|${frame ?? ''}`;
export function heroOf(p, { kit = ourKit(), pose = 'stand', steps, celeb, frame } = {}) {
  if (!p) return Promise.resolve(null);
  const look = { id: p.id, name: p.name, age: p.age, pos: p.pos, face: p.face };
  const key = keyOf(p, { kit, pose, steps, celeb, frame });
  if (!cache.has(key)) {
    const job = queue.then(() => shoot(look, { kit, pose, steps, celeb, frame }))
      .then((s) => { if (s) done.set(key, s); return s; })
      .catch((e) => { console.warn('[studio] photo impossible', e); cache.delete(key); return null; });
    queue = job.then(() => null, () => null);
    cache.set(key, job);
  }
  return cache.get(key);
}
// la photo, si elle est déjà faite (sinon null) : sans attente, donc sans image de repli entre deux fiches
export const heroReady = (p, opts) => (p ? done.get(keyOf(p, opts)) || null : null);

if (import.meta.env.DEV) window.__heroOf = heroOf; // bancs d'essai
