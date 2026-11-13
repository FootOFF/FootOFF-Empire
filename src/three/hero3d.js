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
let studio = null;
let queue = Promise.resolve(); // une photo à la fois : le studio n'a qu'un plateau
const JOY = 'Celebrate_2'; // la célébration des photos de but, la même pour tous : bras en V, face à l'objectif (planche du 13/11)

function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(19, W / H, 0.1, 60);
  // éclairage de portrait (1.0.38) : une lumière principale chaude de trois quarts, haute (elle modèle le visage, au lieu
  // de l'aplatir de face), un débouché froid et faible de l'autre côté, deux contre-jours dorés qui découpent la
  // silhouette sur le noir
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x140f08, 0.22));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.5); key.position.set(-2.3, 2.9, 3.1); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfcad8, 0.55); fill.position.set(2.6, 1.3, 2.6); scene.add(fill);
  const rimL = new THREE.DirectionalLight(0xe8c983, 7.5); rimL.position.set(-2.8, 2.2, -2.2); scene.add(rimL);
  const rimR = new THREE.DirectionalLight(0xc7a15a, 6.5); rimR.position.set(2.9, 1.6, -2.4); scene.add(rimR);
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
  const ag = { x: 0, z: 0, h: Math.PI / 2 + (pose === 'joy' ? 0.15 : 0.42), speed: 0, cheer: pose === 'joy' ? 1 : 0, scorer: false, pose: 0, celeb: pose === 'joy' ? celeb || JOY : undefined }; // (scorer faux : célébrations debout seulement)
  S.players.setAgent(i, ag, 0, 1); // échelle 1 (au match : 0,1) : le joueur mesure sa taille en mètres
  // l'animation se pose : attente (respiration) ou célébration, jusqu'à son geste le plus parlant
  const steps = at ?? (pose === 'joy' ? 100 : 22); // célébration : les bras en V, le visage vers l'avant (planche du 13/11)
  for (let k = 0; k < steps; k++) S.players.commit(2, 1 / 30);
  if (pose !== 'joy') S.players.portrait(i); // debout : les mains jointes dans le dos
  // cadrage en pied, la tête près du haut de l'image (la carte la laisse déborder)
  const h = 1.85;
  if (frame === 'head') { S.camera.position.set(0.18, 1.72, 1.35); S.camera.lookAt(0, 1.66, 0); } // gros plan (bancs d'essai)
  else if (frame === 'bust') { S.camera.position.set(0.25, 1.5, 2.6); S.camera.lookAt(0, 1.42, 0); }
  else {
    S.camera.position.set(0.15, h * 0.4, 6.4); // légère contre-plongée : un plan de héros
    S.camera.lookAt(0, h * 0.52, 0);
  }
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
export function heroOf(p, { kit = ourKit(), pose = 'stand', steps, celeb, frame } = {}) {
  if (!p) return Promise.resolve(null);
  const look = { id: p.id, name: p.name, age: p.age, pos: p.pos, face: p.face };
  const key = `${p.id ?? p.name}|${p.age}|${p.pos}|${kit.shirt}|${kit.trim}|${kit.keeper}|${pose}|${steps ?? ''}|${celeb ?? ''}|${frame ?? ''}`;
  if (!cache.has(key)) {
    const job = queue.then(() => shoot(look, { kit, pose, steps, celeb, frame })).catch((e) => { console.warn('[studio] photo impossible', e); cache.delete(key); return null; });
    queue = job.then(() => null, () => null);
    cache.set(key, job);
  }
  return cache.get(key);
}

if (import.meta.env.DEV) window.__heroOf = heroOf; // bancs d'essai
