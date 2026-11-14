import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { BANDS, GREY, HAIRS, SKINS, agedFace, faceOf, hash } from '../game/faces';
import { originOf } from '../game/names';

// Joueurs réalistes (chantier du PDG, 2026-10-29 : « atteindre ce modèle », carrures moins musclées, tailles et visages
// tous différents, plus jamais de course sur place). Corps MakeHuman (CC0) habillé dans Blender (tenue teintée au club),
// un squelette commun, des morphs de visage et de carrure combinés par joueur ; animations Quaternius (CC0), pack de
// football d'Anderson Rohr (usage commercial permis) et foulées captées CMU, toutes transférées sur ce squelette.
// Même interface que createPlayers (players.js) : setKit, setAgent, commit, dispose ; en plus setIdentity.
// Locomotion comme dans les grands jeux de foot : la vitesse réelle choisit le mélange des allures, phase commune alignée
// sur la pose du pied gauche, cadence = distance / foulée ; appuis verrouillés au sol (IK à deux os) selon les marqueurs
// d'appui de chaque allure. Gestes (frappe, arrêt, joie, tête) calés sur les instants du moteur de match.
// Chaque joueur ressemble à son portrait (faces.js) : teint (cinq peaux MakeHuman teintées), coiffure (huit coupes, plus
// les cheveux ras peints), barbe, moustache et bouc peints à la couleur de ses cheveux (masque de pilosité), sourcils,
// forme du visage, nez, lèvres ; taille selon le poste. Les morphs sont cuits une fois par joueur (rien à chaque image).

const BASE_H = 1.73; // taille du corps de base (m)
const URL = `${import.meta.env.BASE_URL}models/players/`;
// essais de base 3D (développement seulement) : ?base=footballer_v2 charge public/models/players/footballer_v2.glb
const BASE_GLB = (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('base')) || 'footballer';
// (1.0.29 : les allures Mixamo Walk_Mx, Jog_Mx, Run_Mx sont dans anims.glb mais pas dans l'échelle : mêlées aux foulées
// CMU, elles faisaient glisser davantage les appuis, glisse > 0,5 m/s 15,0 → 19,8 % au banc tmp/audit-locomotion)
const GAIT_NAMES = ['Idle_Loop', 'Walk_Loop', 'Jog_CMU_A', 'Run_CMU_B', 'Run_CMU_C', 'Jog_Fwd_Loop', 'Sprint_Loop'];
// Allures par direction (0.8.24, chantier « course et appuis ») : à reculons, de côté vers la droite et vers la gauche
// (gestes Mixamo, sur place), et les pas chassés du gardien. Une direction sans allure se rabat sur la course de face
// (jouée à rebours pour reculer), comme avant.
const GAIT_SETS = {
  b: ['Walk_Back', 'Jog_Back', 'Run_Back'],
  r: ['Strafe_Walk_R', 'Strafe_Jog_R', 'Strafe_Run_R'],
  l: ['Strafe_Walk_L', 'Strafe_Jog_L', 'Strafe_Run_L'],
};
const KEEPER_GAITS = { idle: 'GK_Idle', r: ['GK_Side_R'], l: ['GK_Side_L'] };
const TRAVEL = { f: [0, 1], b: [0, -1], r: [-1, 0], l: [1, 0] }; // sens de la marche dans le repère du modèle (x, z) : il regarde +z, sa gauche est +x
const ALL_GAITS = new Set([...GAIT_NAMES, ...Object.values(GAIT_SETS).flat(), KEEPER_GAITS.idle, ...KEEPER_GAITS.r, ...KEEPER_GAITS.l]);
const KICK_TIME = 0.6; const KICK_CONTACT = 0.55; // matchplay.js : la frappe dure 0,6 s, contact à 55 %
const CELEBRATIONS = ['Celebrate_1', 'Celebrate_2', 'Celebrate_3'];
const GLOVE_HEX = 0xdedad2; // gants du gardien : blanc cassé, un peu ombré (le blanc pur faisait jouet)
const LOOK_CHAIN = [['spine_02', 0.15], ['spine_03', 0.2], ['neck_01', 0.25], ['head', 0.4]]; // part du regard par os
// os retouchés après l'animation (inclinaison, regard, appuis) : leur pose animée est remise avant chaque image (0.8.24 :
// le moteur d'animation ne réécrit un os que si sa valeur a changé ; sur un joueur immobile, la retouche s'ajoutait à
// elle-même d'image en image et le joueur finissait plié en deux)
const RETOUCHED = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'];
const STANCE = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r']); // tenue droite des photos
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

let loading = null;
let A = null; // ressources prêtes : { base, clips, gaits, marks, mask (pilosité), skins (trois peaux) }
export const players3dReady = () => !!A;
export const players3dAssets = () => A; // inspection (bancs d'essai)
// inspection (bancs d'essai) : position des os d'un clip à un instant, modèle seul à l'origine (m, il regarde +z)
export const players3dProbe = (name, t, bones) => { const r = probeAt(name, t); return Object.fromEntries(bones.map((n) => [n, wpos(r, n).toArray().map((x) => +x.toFixed(3))])); };
export function loadPlayers3D() {
  if (!loading) loading = build().catch((e) => { console.warn('joueurs 3D indisponibles', e); loading = null; throw e; });
  return loading;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // fichiers compressés (meshopt) : 3 Mo au lieu de 7
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));

// cheveux peints des coupes Rocketbox (1.0.47, rb_scalp.py) : une image par avatar, dans l'espace UV de la peau, chargée à
// la première utilisation ; sans elle, le grain générique de face_mask.png
const NO_SCALP = new THREE.DataTexture(new Uint8Array([0, 128, 0, 255]), 1, 1); NO_SCALP.needsUpdate = true;
const SCALP_KEYS = ['ma01', 'ma05', 'ma06', 'ma07', 'ma08', 'ma09', 'ma10', 'ma14', 'ma20', 'bm02', 'bm03', 'md03', 'sm01', 'sm03']; // (bm07, presque chauve ; ma13, un îlot au sommet du crâne ; ma04 et ma12, crépus : le grain fin)
const scalpTex = (k) => A.scalp?.[k] || NO_SCALP; // (chargées avec le modèle : une photo de joueur ne doit pas partir avant)
const tex = (u, srgb) => new Promise((res, rej) => new THREE.TextureLoader().load(u, (t) => {
  t.flipY = false; // convention glTF
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  res(t);
}, undefined, rej));

async function build() {
  // skin_ao.jpg (1.0.40) : ombres de contact de la peau, cuites dans Blender (FootOFF_3D_Sources/scripts/bake_ao.py) : creux
  // des yeux, narines, commissures, oreilles, cou sous la mâchoire, ombre des manches et du short sur la peau
  const [base, anims, mask, knit, ao, ...skins] = await Promise.all([
    load(`${URL}${BASE_GLB}.glb`), load(`${URL}anims.glb`), tex(`${URL}face_mask.png`, false), tex(`${URL}knit.png`, false),
    tex(`${URL}skin_ao.jpg`, false).catch(() => null),
    ...[0, 1, 2, 3, 4].map((k) => tex(`${URL}skin_${k}.jpg`, true)),
  ]);
  // (?scalp=<dossier> en développement : des peintures d'essai, à côté de celles du jeu)
  const SCALP_DIR = (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('scalp')) || 'scalp';
  const scalp = Object.fromEntries((await Promise.all(SCALP_KEYS.map((k) => tex(`${URL}${SCALP_DIR}/${k}.webp`, false).then((t) => [k, t]).catch(() => null)))).filter(Boolean));
  knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
  knit.repeat.set(70, 70); // maille de 3 mm environ sur l'atlas du corps
  const clips = {};
  const rawRoot = {}; // (1.0.30) plongeons et arrêts du corps avec leur déplacement capté, pour en lire la course
  for (const c of anims.animations) {
    if (['GK_Dive_L', 'GK_Dive_R', 'GK_Block_R'].includes(c.name)) rawRoot[c.name] = new THREE.AnimationClip(`${c.name}_raw`, c.duration, c.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position'));
    // rotations de tous les os ; bassin : hauteur seulement pour les gestes (le moteur déplace le joueur), tout pour les allures
    const loco = ALL_GAITS.has(c.name);
    const tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'pelvis.position').map((t) => {
      if (t.name !== 'pelvis.position' || loco) return t;
      // (os Root du squelette MakeHuman : z vers le haut ; x et y, le plan du sol, restent ceux de la première image)
      const v = new Float32Array(t.values); for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 1] = v[1]; }
      return new THREE.VectorKeyframeTrack(t.name, t.times, v);
    });
    clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
  }
  clips.Save_1_M = mirrorClip(clips.Save_1, 'Save_1_M');
  // course de côté vers la droite : le miroir de celle vers la gauche (la capture Mixamo de droite ne boucle pas, 19°)
  if (clips.Strafe_Run_L && !clips.Strafe_Run_R) clips.Strafe_Run_R = mirrorClip(clips.Strafe_Run_L, 'Strafe_Run_R');
  // arrêt du corps vers la gauche : le miroir de celui vers la droite (la capture de gauche prend 1,5 s pour aller au sol,
  // trop lente sur un face-à-face où la frappe laisse 0,2 s ; celle de droite, 0,9 s)
  if (clips.GK_Block_R) clips.GK_Block_L = mirrorClip(clips.GK_Block_R, 'GK_Block_L');
  // plongeons (1.0.25, chantier du PDG : « la captation du gardien n'est pas naturelle ») : les deux captures Mixamo ne
  // plongent pas à la même hauteur (main à 74 cm pour celle de gauche, 108 cm pour celle de droite) ; chacune a son miroir,
  // et la hauteur du ballon choisit le plongeon bas ou haut, de chaque côté
  if (clips.GK_Dive_L) clips.GK_DiveLo_R = mirrorClip(clips.GK_Dive_L, 'GK_DiveLo_R');
  if (clips.GK_Dive_R) clips.GK_DiveHi_L = mirrorClip(clips.GK_Dive_R, 'GK_DiveHi_L');
  // Gardiens (0.8.20, remarque du PDG : ni gants ni tenue de gardien) : manches longues et gants peints sur la peau des
  // bras et des mains, d'après les os qui la portent (poids des os du bras, de la main et des doigts, par sommet) ; ils
  // suivent ainsi chaque geste. Attribut aKit : (manche, gant).
  const SLEEVE = /^(upperarm|lowerarm)_/;
  const GLOVE = /^(hand|thumb|index|middle|ring|pinky)_/;
  base.scene.traverse((o) => {
    const si = o.isSkinnedMesh && o.geometry.attributes.skinIndex;
    if (!si) return;
    const sw = o.geometry.attributes.skinWeight;
    const cls = o.skeleton.bones.map((bn) => (GLOVE.test(bn.name) ? 2 : SLEEVE.test(bn.name) ? 1 : 0));
    const kit = new Float32Array(si.count * 2);
    for (let v = 0; v < si.count; v++) {
      for (let k = 0; k < 4; k++) {
        const c = cls[si.getComponent(v, k)];
        if (c) kit[v * 2 + c - 1] += sw.getComponent(v, k);
      }
    }
    o.geometry.setAttribute('aKit', new THREE.BufferAttribute(kit, 2));
  });
  A = { base, clips, mask, knit, skins, ao, scalp };
  // buste et maillot (1.0.40) : la transformation de repos de chaque maillage, prise sur le modèle partagé (jamais animé)
  base.scene.updateMatrixWorld(true);
  A.rest = {};
  base.scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) A.rest[o.name] = restMatrix(o); });
  prepareInner(base.scene);
  { const hq = base.scene.getObjectByName('head').getWorldQuaternion(new THREE.Quaternion()); A.headFace = hq.invert(); } // (portrait : le visage regarde l'objectif)
  // célébrations : celles où le joueur se laisse glisser à genoux (le bassin descend de plus d'un quart) sont gardées au
  // buteur, qui arrive lancé ; ses coéquipiers, arrêtés près de lui, lèvent les bras debout
  A.slides = new Set(CELEBRATIONS.filter((n) => {
    const y = probe(n, (r) => wpos(r, 'pelvis').y);
    return Math.min(...y) < y[0] * 0.75;
  }));
  // gestes où le joueur se couche (plongeon, arrêt du corps, glissade à genoux) : le geste capté fait seul autorité, sans
  // verrou des appuis (0.8.24 : le pied retenu au sol pendant que le corps vole pliait la jambe à travers la pelouse)
  A.lying = new Set([...A.slides, ...['GK_Dive_L', 'GK_Dive_R', 'GK_DiveLo_R', 'GK_DiveHi_L', 'GK_Block_L', 'GK_Block_R', 'Save_1', 'Foul_Tackle', 'Foul_Fall', 'Fallen_Idle', 'Stand_Up'].filter((n) => clips[n])]);
  if (A.lying.has('Save_1')) A.lying.add('Save_1_M');
  A.gaits = GAIT_NAMES.map((n, j) => (j === 0 ? { name: n, nat: 0, contacts: { l: [[0, 1]], r: [[0, 1]] } } : { name: n, ...analyzeGait(n) }));
  A.gaits.sort((a, b) => a.nat - b.nat);
  const set = (names, dir) => names.filter((n) => A.clips[n]).map((n) => ({ name: n, ...analyzeGait(n, dir) })).sort((a, b) => a.nat - b.nat);
  A.dirGaits = Object.fromEntries(Object.entries(GAIT_SETS).map(([d, names]) => [d, set(names, d)]));
  A.keeperGaits = { idle: A.clips[KEEPER_GAITS.idle] ? KEEPER_GAITS.idle : null, r: set(KEEPER_GAITS.r, 'r'), l: set(KEEPER_GAITS.l, 'l') };
  A.marks = {
    Pass: footPeak('Pass'), Shot: footPeak('Shot'), Save_1: handPeak('Save_1'), Save_1_M: handPeak('Save_1_M'),
  };
  // contact de la frappe (1.0.18, chantier du PDG : « les joueurs frappent à côté du ballon ») : au contact du geste
  // capté, où est le pied qui frappe, et où doit être le ballon (devant le coup de pied, dans le sens du pied) ; le moteur
  // y pose le ballon avant la frappe, et la jambe s'y ajuste au contact
  A.contact = { Pass: kickContact('Pass', A.marks.Pass), Shot: kickContact('Shot', A.marks.Shot) };
  A.marks.Pass = A.contact.Pass.t; A.marks.Shot = A.contact.Shot.t; // le moteur cale son contact sur le vrai
  // l'autre pied (1.0.25) : la frappe du droit et la passe du gauche, miroirs des gestes captés (le moteur choisit selon le
  // pied fort du joueur, matchplay.js)
  if (A.clips.Shot && !A.clips.Shot_R) A.clips.Shot_R = mirrorClip(A.clips.Shot, 'Shot_R');
  if (A.clips.Pass && !A.clips.Pass_L) A.clips.Pass_L = mirrorClip(A.clips.Pass, 'Pass_L');
  for (const n of ['Shot_R', 'Pass_L']) { A.contact[n] = kickContact(n, footPeak(n)); A.marks[n] = A.contact[n].t; }
  // après la frappe, le joueur repart (1.0.18 : il restait trois secondes dans la fin du geste capté, planté)
  A.ends = { ...(A.ends || {}), Pass: A.marks.Pass + 0.5, Shot: A.marks.Shot + 0.65, Pass_L: A.marks.Pass_L + 0.5, Shot_R: A.marks.Shot_R + 0.65 };
  // arrêts du gardien (Mixamo, 0.8.24) : l'instant du contact dans chaque geste ; plongeon : la main la plus loin du
  // corps ; prise : les mains qui se rejoignent sur le ballon ; prise haute, saut manqué : les mains au plus haut ;
  // arrêt du corps : le bassin au plus bas
  const reachT = (n) => probe(n, (r, t) => ({ t, x: Math.max(Math.abs(wpos(r, 'hand_l').x), Math.abs(wpos(r, 'hand_r').x)) })).slice(8).reduce((b, x) => (x.x > b.x ? x : b), { x: -1, t: 0 }).t;
  const meetT = (n) => { const d = A.clips[n].duration; return probe(n, (r, t) => ({ t, d: wpos(r, 'hand_l').distanceTo(wpos(r, 'hand_r')) })).filter((x) => x.t > d * 0.15 && x.t < d * 0.8).reduce((b, x) => (x.d < b.d ? x : b), { d: 9, t: 0 }).t; };
  const lowT = (n) => probe(n, (r, t) => ({ t, y: wpos(r, 'pelvis').y })).slice(8).reduce((b, x) => (x.y < b.y ? x : b), { y: 9, t: 0 }).t;
  for (const [n, f] of [['GK_Dive_L', reachT], ['GK_Dive_R', reachT], ['GK_DiveLo_R', reachT], ['GK_DiveHi_L', reachT], ['GK_Catch_Low', meetT], ['GK_Catch_Mid', meetT], ['GK_Catch_High', handPeak], ['GK_Block_L', lowT], ['GK_Block_R', lowT], ['GK_Miss', handPeak], ['Foul_Tackle', lowT]]) {
    if (A.clips[n]) A.marks[n] = f(n);
  }
  // la tête (1.0.22, Mixamo « header soccerball ») : le buste part en arrière (0,5 à 0,8 s) puis le front revient frapper
  // le ballon ; contact à 0,93 s (mesuré sur le geste : la tête au plus vite vers l'avant, au plus haut)
  // 1.0.31 (contrôle de la vidéo des nouveautés : le ballon partait pendant que la tête était encore en arrière, 0,10 s
  // avant le contact du geste sur 43 têtes mesurées) : le contact est l'instant où la tête revient vers l'avant au plus
  // vite (0,97 s), mesuré sur le geste au lieu d'une valeur posée à la main
  if (A.clips.Header) {
    const s = probe('Header', (r, t) => ({ t, z: wpos(r, 'head').z }));
    let best = { v: -1, t: 0.97 };
    for (let i = 1; i < s.length; i++) {
      if (s[i].t < 0.8 || s[i].t > 1.15) continue;
      const v = (s[i].z - s[i - 1].z) / Math.max(1e-6, s[i].t - s[i - 1].t);
      if (v > best.v) best = { v, t: (s[i].t + s[i - 1].t) / 2 };
    }
    A.marks.Header = best.t;
  }
  // les mains au contact de chaque arrêt (1.0.18) : où sont-elles par rapport au gardien (prise : entre les deux mains ;
  // plongeon, arrêt du corps : la main qui va le plus loin) ; le moteur place le gardien pour qu'elles soient au ballon
  A.saveHands = {};
  for (const n of ['GK_Dive_L', 'GK_Dive_R', 'GK_DiveLo_R', 'GK_DiveHi_L', 'GK_Catch_Low', 'GK_Catch_Mid', 'GK_Catch_High', 'GK_Block_L', 'GK_Block_R', 'GK_Miss', 'Save_1', 'Save_1_M']) {
    if (!A.clips[n] || A.marks[n] === undefined) continue;
    const r = probeAt(n, A.marks[n]);
    const hl = wpos(r, 'hand_l'); const hr = wpos(r, 'hand_r');
    const both = n.startsWith('GK_Catch') || n.startsWith('GK_Block');
    const h = both ? hl.clone().add(hr).multiplyScalar(0.5) : (Math.abs(hl.x) > Math.abs(hr.x) ? hl : hr);
    A.saveHands[n] = { fwd: h.z, left: h.x, up: h.y };
  }
  // relance du gardien (1.0.28, Mixamo : lancer à la main, ballon roulé, dégagement de volée) : l'instant où le ballon
  // part, la main (ou le pied) la plus vive de la seconde moitié du geste
  const fastest = (n, bones, minY = -1) => { // (minY : la main au-dessus de l'épaule, pour un lancer par-dessus)
    const s = probe(n, (r, t) => ({ t, p: bones.map((b) => wpos(r, b)) }));
    let best = { v: 0, t: 0, b: bones[0] };
    for (let i = 8; i < s.length - 2; i++) for (let k = 0; k < bones.length; k++) { if (s[i].p[k].y < minY) continue; const v = s[i].p[k].distanceTo(s[i - 1].p[k]) / (s[i].t - s[i - 1].t); if (v > best.v) best = { v, t: s[i].t, b: bones[k] }; }
    fastest.bone = best.b;
    return best.t;
  };
  A.throwHand = {}; // la main qui lance (le ballon y est tenu pendant l'élan)
  if (A.clips.GK_Throw) { A.marks.GK_Throw = fastest('GK_Throw', ['hand_r', 'hand_l'], 1.45); A.throwHand.GK_Throw = fastest.bone; }
  if (A.clips.GK_Roll) { A.marks.GK_Roll = fastest('GK_Roll', ['hand_r', 'hand_l']); A.throwHand.GK_Roll = fastest.bone; }
  if (A.clips.GK_DropKick) A.marks.GK_DropKick = fastest('GK_DropKick', ['ball_r', 'ball_l']);
  A.ends = { ...(A.ends || {}) };
  for (const n of ['GK_Throw', 'GK_Roll', 'GK_DropKick']) if (A.marks[n] !== undefined) A.ends[n] = Math.min(A.clips[n].duration, A.marks[n] + 0.7);
  // la course captée des plongeons (1.0.30, audit du gardien : le moteur faisait glisser le gardien de côté, debout, sur
  // une courbe sans rapport avec le geste, puis il tombait sur place) : la part du déplacement latéral du bassin faite à
  // chaque instant du geste ; le moteur fait suivre cette course au gardien (lent à l'appel, vif en vol)
  A.divePath = {};
  for (const [n, raw] of Object.entries(rawRoot)) {
    const root = SkeletonUtils.clone(A.base.scene); const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(raw).play();
    const N = 120, t = new Float32Array(N + 1), x = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) { t[i] = (i / N) * raw.duration; mixer.setTime(t[i]); root.updateMatrixWorld(true); x[i] = Math.abs(wpos(root, 'pelvis').x); }
    for (let i = N; i >= 0; i--) x[i] -= x[0];
    A.divePath[n] = { t, x };
  }
  if (A.divePath.GK_Dive_L) A.divePath.GK_DiveLo_R = A.divePath.GK_Dive_L;
  if (A.divePath.GK_Dive_R) A.divePath.GK_DiveHi_L = A.divePath.GK_Dive_R;
  if (A.divePath.GK_Block_R) A.divePath.GK_Block_L = A.divePath.GK_Block_R;
  // la portée captée à chaque instant d'un plongeon (1.0.33, contrôle de la vidéo filmée dans le vrai jeu : sur un
  // ballon à 1,5 m, le corps ne parcourait que 0,7 m au lieu des 1,2 m du geste, le gardien tombait presque sur place) :
  // course du bassin + main la plus loin du corps ; un ballon plus proche est touché plus tôt dans le geste, le corps
  // ayant parcouru ce que le geste capté lui fait parcourir à cet instant
  A.diveReach = {};
  for (const n of ['GK_Dive_L', 'GK_Dive_R', 'GK_DiveLo_R', 'GK_DiveHi_L', 'GK_Block_L', 'GK_Block_R']) {
    const P = A.divePath[n];
    if (!A.clips[n] || !P || A.marks[n] === undefined) continue;
    const at = (tt) => { const k = Math.max(0, Math.min(P.t.length - 1, (tt / P.t[P.t.length - 1]) * (P.t.length - 1))); const i = Math.floor(k), f = k - i; return P.x[i] + (P.x[Math.min(i + 1, P.x.length - 1)] - P.x[i]) * f; };
    A.diveReach[n] = probe(n, (r, t) => {
      const hl = wpos(r, 'hand_l'); const hr = wpos(r, 'hand_r'); const h = Math.abs(hl.x) > Math.abs(hr.x) ? hl : hr;
      return { t, fwd: h.z, left: h.x, up: h.y, reach: at(t) + Math.abs(h.x) };
    });
  }
  if (import.meta.env?.DEV && typeof window !== 'undefined') window.__saveHands = { hands: A.saveHands, marks: A.marks, dur: Object.fromEntries(Object.entries(A.clips).map(([k, c]) => [k, c.duration])) };
  // la faute (0.8.24, audit de la charte : le porteur ne tombait jamais) : le tacle glissé touche quand le corps est au
  // plus bas ; la chute du porteur part au moment où son bassin plonge vers le sol (le trébuchement capté avant, une
  // demi-seconde debout, est sauté : fauché, il est au sol 0,4 s après le contact)
  if (A.clips.Foul_Fall) {
    const y = probe('Foul_Fall', (r, t) => ({ t, y: wpos(r, 'pelvis').y }));
    const iLow = y.reduce((m, x, i) => (i >= 8 && x.y < y[m].y ? i : m), 8);
    let i0 = iLow; while (i0 > 0 && y[i0 - 1].y < y[0].y * 0.85) i0--; // début de la plongée vers le point bas
    A.marks.Foul_Fall = Math.max(0, y[Math.max(0, i0 - 1)].t - 0.12);
    // repos au sol (audit de la charte, 0.8.24 : le porteur se relevait puis retombait) : la chute captée contient son
    // propre relevé ; elle s'arrête au dernier instant où le bassin est encore au sol, avant ce relevé, et le joueur y
    // reste figé tant que le moteur le garde à terre (la pose « au sol » de Mixamo, couchée sur le côté, ne se raccorde
    // pas à cette chute sur le ventre : 114° d'écart, le fondu passait par la position debout)
    const low = y.slice(8).reduce((m, x) => Math.min(m, x.y), 9);
    const rest = y.filter((x) => x.y < low + 0.1 * (y[0].y - low)).pop();
    A.ends = { ...(A.ends || {}), Foul_Fall: rest ? rest.t : A.clips.Foul_Fall.duration };
  }
  return A;
}

// miroir gauche / droite d'un clip (os symétriques : _l <-> _r ; rotation (x, -y, -z, w) ; bassin x -> -x)
function mirrorClip(src, name) {
  const swap = (n) => n.replace(/_l\./, '_TMP.').replace(/_r\./, '_l.').replace(/_TMP\./, '_r.');
  return new THREE.AnimationClip(name, src.duration, src.tracks.map((t) => {
    const v = new Float32Array(t.values);
    if (t.name.endsWith('.quaternion')) for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2]; }
    else for (let i = 0; i < v.length; i += 3) v[i] = -v[i];
    return new t.constructor(swap(t.name), t.times, v);
  }));
}

function probe(name, fn) { // échantillonne un clip sur un modèle seul, à l'origine
  const root = SkeletonUtils.clone(A.base.scene);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(A.clips[name]).play();
  const out = [];
  const dur = A.clips[name].duration;
  for (let i = 0; i <= 120; i++) { const t = (i / 120) * dur; mixer.setTime(t); root.updateMatrixWorld(true); out.push(fn(root, t)); }
  return out;
}
const wpos = (root, n) => root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
// contact de la frappe : le pied le plus vif près du sol (0.8.24 : la dernière image, qui reboucle sur la première, donnait
// un faux pic ; la frappe montrait la fin du geste au lieu du coup de pied)
function footPeak(name) {
  const s = probe(name, (r, t) => ({ t, l: wpos(r, 'ball_l'), r: wpos(r, 'ball_r') }));
  let best = { v: 0, t: 0 };
  for (let i = 8; i < s.length - 3; i++) {
    for (const f of ['l', 'r']) {
      if (s[i][f].y > 0.3) continue;
      const v = s[i][f].distanceTo(s[i - 1][f]) / (s[i].t - s[i - 1].t);
      if (v > best.v) best = { v, t: s[i].t };
    }
  }
  return best.t;
}
// Où frappe le pied au contact d'un geste de frappe : le pied le plus vif à cet instant, le point du ballon (son centre)
// juste devant le coup de pied dans le sens du mouvement du pied, et, pour la jambe, ce centre vu depuis l'os de la pointe
// du pied. Repère du modèle à l'origine (il regarde +z, sa gauche est +x), en mètres, taille de base.
function kickContact(name, peak) {
  const dt = 1 / 120;
  const at = (tt) => { const r = probeAt(name, tt); return { l: wpos(r, 'ball_l'), r: wpos(r, 'ball_r'), al: wpos(r, 'foot_l'), ar: wpos(r, 'foot_r') }; };
  const p0 = at(Math.max(0, peak - dt)); const p1 = at(peak);
  const foot = p1.r.distanceTo(p0.r) >= p1.l.distanceTo(p0.l) ? 'r' : 'l';
  // le contact : le bas de la course du pied qui frappe, juste avant son pic de vitesse (au pic, le pied est déjà dans
  // l'accompagnement, 30 à 40 cm plus loin et en train de remonter). 1.0.25 (audit du contact pied-ballon) : seulement
  // parmi les instants où ce pied file vers l'avant (au moins 60 % de sa vitesse de pointe) ; le point le plus bas de la
  // fenêtre était, pour la passe, le pied encore posé 0,11 s avant le coup de pied : le ballon partait d'un pied immobile
  // après avoir été tiré à travers le tibia
  const speedAt = (tt) => at(tt)[foot].distanceTo(at(tt - 1 / 240)[foot]) * 240;
  const vPk = speedAt(peak);
  let t = peak; let low = Infinity;
  for (let tt = peak - 0.3; tt <= peak + 0.005; tt += 1 / 240) {
    if (tt < 1 / 240 || speedAt(tt) < 0.6 * vPk) continue;
    const y = at(tt)[foot].y; if (y < low) { low = y; t = tt; }
  }
  const a0 = at(Math.max(0, t - dt)); const a1 = at(t);
  const toe = a1[foot]; const ankle = a1[foot === 'r' ? 'ar' : 'al'];
  const dir = toe.clone().sub(a0[foot]); dir.y = 0;
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
  dir.normalize();
  // le ballon touché par le pied, au ras de la chaussure (1.0.25) : le sommet de la chaussure le plus avancé dans le sens
  // du coup de pied (à hauteur du ballon), plus un rayon (11 cm) et 5 mm ; avant, un point fixe à 13 cm du milieu du pied
  // laissait la chaussure 4 à 6 cm dans le ballon au contact
  const mid = toe.clone().add(ankle).multiplyScalar(0.5);
  const front = bootFront(probeAt(name, t), foot, mid, dir);
  const c = mid.clone().addScaledVector(dir, (front ?? 0.11) + 0.11 + 0.005); c.y = 0.11;
  return { foot, t, fwd: c.z, left: c.x, ball: c, fromToe: c.clone().sub(toe), dir: [dir.x, dir.z] };
}
// l'avancée de la chaussure (sommets du pied à hauteur du ballon, peau animée) le long de dir, depuis le point mid (m)
function bootFront(root, foot, mid, dir) {
  let front = null; const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const ids = new Set(); o.skeleton.bones.forEach((bn, k) => { if (bn.name === `foot_${foot}` || bn.name === `ball_${foot}`) ids.add(k); });
    if (!ids.size) return;
    const si = o.geometry.attributes.skinIndex; const sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld);
      if (Math.abs(v.y - 0.11) > 0.06) continue;
      const proj = (v.x - mid.x) * dir.x + (v.z - mid.z) * dir.z;
      if (front === null || proj > front) front = proj;
    }
  });
  return front;
}
function probeAt(name, t) { // un clip à un instant donné, sur un modèle seul à l'origine (modèle réutilisé)
  if (!probeAt.root) { probeAt.root = SkeletonUtils.clone(A.base.scene); probeAt.mixer = new THREE.AnimationMixer(probeAt.root); }
  const { root, mixer } = probeAt;
  mixer.stopAllAction();
  mixer.clipAction(A.clips[name]).reset().play();
  mixer.setTime(t);
  root.updateMatrixWorld(true);
  return root;
}
function handPeak(name) { // le plongeon : la main au plus haut
  const s = probe(name, (r, t) => ({ t, y: Math.max(wpos(r, 'hand_l').y, wpos(r, 'hand_r').y) }));
  return s.slice(8).reduce((b, x) => (x.y > b.y ? x : b), { y: -1, t: 0 }).t;
}
// Allure : vitesse naturelle (recul du pied posé, dans le sens de la marche dir), alignement sur la pose du pied gauche,
// marqueurs d'appui
function analyzeGait(name, dir = 'f') {
  const [tx, tz] = TRAVEL[dir];
  const N = 120;
  const s = probe(name, (r) => [wpos(r, 'ball_l'), wpos(r, 'ball_r')]).slice(0, N);
  const dur = A.clips[name].duration;
  const floor = Math.min(...s.map(([l, r]) => Math.min(l.y, r.y)));
  const dt = dur / N;
  // posé : au ras du sol (3 cm) et reculant sous le corps (0.8.24 : en marche arrière, le pied qui revient frôle le sol ;
  // compté comme posé, il faussait la vitesse naturelle et donc la cadence, et le verrou des appuis le clouait au sol)
  const rec = (i, k) => { const j = (i + 1) % N; return -((s[j][k].x - s[i][k].x) * tx + (s[j][k].z - s[i][k].z) * tz) / dt; };
  const low = s.map(([l, r]) => [l.y < floor + 0.03, r.y < floor + 0.03]);
  const rs = [];
  for (let i = 0; i < N; i++) for (const k of [0, 1]) if (low[i][k]) rs.push(rec(i, k));
  rs.sort((a, b) => a - b);
  const typ = rs.length ? rs[Math.floor(rs.length * 0.75)] : 0; // recul d'un pied bien posé
  const inC = low.map((c, i) => [0, 1].map((k) => c[k] && (typ <= 0 || rec(i, k) > 0.35 * typ)));
  // marqueurs d'appui : un appui coupé de quelques images (8 sur 120 au plus) reste un seul appui, le verrou ne lâche
  // pas en plein appui (la vitesse naturelle, elle, se mesure sur les seules images franches)
  const inM = inC.map((c) => [...c]);
  for (const k of [0, 1]) {
    if (inM.every((c) => c[k]) || !inM.some((c) => c[k])) continue;
    let i0 = 0; while (inM[i0][k]) i0++; // départ sur un trou
    for (let n = 0, i = i0; n < N; ) {
      if (inM[i % N][k]) { i++; n++; continue; }
      let L = 0; while (L < N && !inM[(i + L) % N][k]) L++;
      if (L <= 8) for (let q = 0; q < L; q++) inM[(i + q) % N][k] = true;
      i += L; n += L;
    }
  }
  let strike = 0; let best = -1;
  for (let i = 0; i < N; i++) if (inM[i][0] && !inM[(i + N - 1) % N][0]) { let L = 0; while (L < N && inM[(i + L) % N][0]) L++; if (L > best) { best = L; strike = i; } }
  let sum = 0; let n = 0;
  for (let i = 0; i < N; i++) for (const k of [0, 1]) { const j = (i + 1) % N; if (inC[i][k] && inC[j][k]) { sum += -((s[j][k].x - s[i][k].x) * tx + (s[j][k].z - s[i][k].z) * tz) / dt; n++; } }
  const iv = (k) => { const out = []; for (let i = 0; i < N; i++) { const ii = (i + strike) % N; if (inM[ii][k] && !inM[(ii + N - 1) % N][k]) { let L = 0; while (L < N && inM[(ii + L) % N][k]) L++; out.push([i / N, ((i + L - 1) % N) / N]); } } return out; };
  const sh = (strike / N) * dur; const K = Math.max(2, Math.round(dur * 120));
  A.clips[name] = new THREE.AnimationClip(name, dur, A.clips[name].tracks.map((t) => {
    const it = t.createInterpolant(); const size = t.getValueSize(); const times = new Float32Array(K + 1); const vals = new Float32Array((K + 1) * size);
    for (let k = 0; k <= K; k++) { const tt = (k / K) * dur; times[k] = tt; vals.set(it.evaluate((sh + tt) % dur), k * size); }
    return new t.constructor(t.name, times, vals);
  }));
  return { nat: Math.max(0.3, sum / Math.max(1, n)), contacts: { l: iv(0), r: iv(1) } };
}

// Identité 3D d'un joueur, tirée de son portrait (faces.js) : le même teint, les mêmes cheveux (et leur gris), la même
// barbe, la même forme de visage ; une taille et une carrure selon son poste. pl : { id, name, age, pos, face }.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function rand(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
const toneOf = (sk) => (sk <= 2 ? 0 : sk <= 4 ? 1 : 2); // peau claire, mate, foncée (faces.js)
const FACE_MEAN = ['#df997c', '#ce977e', '#d28059', '#5e372a', '#4b3125']; // teint moyen du visage des cinq peaux (prep_skins.py)
// teint du portrait -> peaux possibles (1.0.47, PDG : « 1 » ; le teint mat #a26b46 tirait une fois sur deux la peau 2, que
// la teinte ne peut foncer qu'à 70 % : un portrait brun devenait un visage clair ; la peau 3 seule le rend brun)
const SKIN_TEX = [[0], [0, 1], [1, 0], [2, 1], [2], [3], [3, 4], [4, 3]];
const skinTex = (sk, seed) => { const l = SKIN_TEX[sk] || SKIN_TEX[2]; return l[(seed >>> 3) % l.length]; };
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// Coiffures (1.0.47, PDG : « les meilleures coiffures », « n'en fabrique pas toi même, va en chercher ») : les coupes des
// avatars Microsoft Rocketbox (licence MIT), de vraies mèches en cartes, recalées sur notre crâne (coiffures_rb.py) ;
// plusieurs coupes possibles pour une même coiffure du portrait, tirées par joueur. null : cheveux ras peints, ou rasé.
const MESH = { // coiffure du portrait -> coupes 3D possibles
  short: ['rb_short', 'rb_neat'], messy: null, mullet: ['rb_short'], side: ['rb_neat'],
  crop: null, undercut: ['rb_fauxhawk', 'rb_spiky'], slick: ['rb_slick'], receding: null, quiff: ['rb_neat'],
  mohawk: ['rb_fauxhawk'], long: ['rb_tied'], bun: ['rb_tied'], ponytail: ['rb_tied'],
  curly: null, afroShort: null, afro: null, hightop: null, locs: null, buzz: null, braids: null, bald: null,
}; // (en désordre, bouclés, houppe, locks : peints ou coupe nette, les cartes de ces coupes faisaient des écailles ou des
// lanières ; afro : peints, en cartes il faisait une cage ; longs : attachés)
// cheveux peints (rb_scalp.py) : ceux de l'avatar de la coupe, sous ses mèches ; sans mèches, ceux d'un avatar à la coiffure
// rase du portrait (front dégarni : quatre avatars dégarnis)
const SCALP_OF = { rb_short: 'ma05', rb_quiff: 'ma06', rb_spiky: 'ma07', rb_fauxhawk: 'ma08', rb_tied: 'ma09', rb_neat: 'bm02', rb_slick: 'bm03', rb_locs: 'sm03' };
const SCALP_STYLE = { crop: ['sm01', 'ma20'], messy: ['ma01', 'ma10'], locs: ['sm03'], curlyStraight: ['ma01', 'ma10'], receding: ['ma14', 'md03'] }; // (rasé, crépus courts, afro : le grain fin d'origine, plus vrai sur ces cheveux que la peinture lisse ; curlyStraight : boucles sur cheveux non crépus)
const THIN = new Set(['buzz', 'bald', 'crop', 'undercut', 'receding', 'afroShort', 'afro', 'hightop']); // coupes rases du portrait (crâne visible ; crépus courts : grain de cheveux ras, pas de calotte pleine, 1.0.47)
const SCALP = { buzz: 0.95, braids: 1, locs: 1, afroShort: 1, afro: 1, curly: 1, hightop: 1, bald: 0, crop: 0.85, undercut: 0.85, receding: 0.55 }; // ras
const BEARD = { // densité peinte : barbe entière, moustache (négatif : sans moustache), bouc
  none: [0, 0, 0], stubble: [0.42, 0, 0], short: [0.78, 0.8, 0.8], full: [1, 1, 1], chinstrap: [0.75, -1, 0.75],
  goatee: [0, 0.9, 0.95], vandyke: [0, 0.95, 0.9], moustache: [0, 0.95, 0],
};
const mixHex = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
export function identityOf(pl = {}, pos = 'M') {
  const f = faceOf({ name: '', ...pl });
  const age = pl.age || 25;
  const { grey, style, beard } = agedFace(f, age);
  const seed = hash(`${pl.id ?? ''}|${pl.name || ''}|3d`);
  const r = rand(seed);
  const [mean, sd] = { G: [1.88, 0.045], D: [1.84, 0.05], M: [1.78, 0.055], A: [1.8, 0.06] }[pos] || [1.81, 0.06];
  const height = clamp(mean + (r() + r() + r() - 1.5) * 1.2 * sd, 1.66, 1.98);
  const base = HAIRS[f.hc] || HAIRS[0];
  const hair = grey ? mixHex(base, GREY, grey) : base;
  const beardCol = grey ? mixHex(base, '#6f6b66', grey) : base;
  const brow = mixHex(hair, '#17110d', f.hc === 4 || f.hc === 6 || grey >= 0.6 ? 0.55 : 0.35); // sourcils toujours lisibles
  return { seed, face: f, origin: originOf(pl.name || ''), age, pos, height, style, beard, hair, beardCol, brow, grey };
}
// morphs du visage et de la carrure (clés du modèle, 0 à 1)
// Visages sans caricature (1.0.45, PDG : « des visages qui ne soient pas difformes ») : au-delà de ces poids, les cibles
// MakeHuman font des joues en ballon, un menton en pointe, un nez démesuré ; chaque trait est plafonné, les traits
// opposés ne se cumulent pas, le nez et le bas du visage sont limités dans leur ensemble. (Appliqué après les tirages :
// les carrures et les autres traits de chaque joueur ne changent pas.)
const FACE_CAP = { nose_wide: 0.55, nose_narrow: 0.45, nose_long: 0.4, nose_hump: 0.5, nose_flare: 0.4, lips_full: 0.55, mouth_wide: 0.45, chin_strong: 0.5, chin_narrow: 0.3, jaw_wide: 0.55, cheekbones: 0.5, cheeks_full: 0.3, ears_big: 0.35, ears_flap: 0.6, head_square: 0.45, head_oval: 0.3, forehead_tall: 0.25, brow_heavy: 0.2 };
function tameFace(m) {
  for (const [k, c] of Object.entries(FACE_CAP)) if (m[k] > c) m[k] = c;
  if (m.nose_wide && m.nose_narrow) { if (m.nose_wide >= m.nose_narrow) m.nose_narrow = 0; else m.nose_wide = 0; }
  if (m.chin_strong && m.chin_narrow) { if (m.chin_strong >= m.chin_narrow) m.chin_narrow = 0; else m.chin_strong = 0; }
  const group = (ks, max) => { const sum = ks.reduce((acc, k) => acc + (m[k] || 0), 0); if (sum > max) for (const k of ks) if (m[k]) m[k] *= max / sum; };
  group(['nose_wide', 'nose_narrow', 'nose_long', 'nose_hump', 'nose_flare'], 0.9);
  group(['chin_strong', 'chin_narrow', 'jaw_wide', 'head_square'], 1.0);
  group(['cheeks_full', 'head_oval', 'head_square', 'cheekbones'], 0.8);
  if ((m.chin_narrow || 0) > 0.15) m.forehead_tall = Math.min(m.forehead_tall || 0, 0.1); // (menton fin sous un front haut : visage en amande)
}
const EXTRA = ['nose_wide', 'nose_narrow', 'nose_long', 'nose_hump', 'nose_flare', 'lips_full', 'mouth_wide', 'chin_strong', 'chin_narrow', 'cheekbones', 'cheeks_full', 'ears_big', 'head_square'];
// Visages tous différents (1.0.52, PDG 14/11 : « on retrouve les mêmes visages en boucle ») : les yeux (taille, écart,
// hauteur, inclinaison, paupière, ouverture, profondeur, cernes avec l'âge), les sourcils (hauteur, arc, arcade), la bouche
// (hauteur, largeur, coins, lèvres), la pointe du nez, le menton, les joues et la forme du crâne. Chaque axe se tire de part
// et d'autre de la moyenne (jamais deux contraires à la fois), d'une graine à part : la taille, la carrure et les traits
// déjà tirés de chaque joueur ne bougent pas. Les clés du modèle sont réglées à l'amplitude la plus forte qui reste un
// visage ordinaire (build_mh_v2.py) ; des plafonds par groupe évitent qu'un visage cumule tous les écarts.
function moreFace(id, f, m, shaved) {
  const r = rand(id.seed ^ 0x2545f491);
  const tri = () => r() + r() - 1; // -1..1, le plus souvent près de 0
  const wide = () => r() * 2 - 1; // -1..1, uniforme : les axes qui font l'identité d'un visage s'écartent franchement
  const axis = (pos, neg, v) => { if (v > 0) m[pos] = Math.max(m[pos] || 0, v); else if (v < 0 && neg) m[neg] = Math.max(m[neg] || 0, -v); };
  const maybe = (p, lo, hi) => (r() < p ? lo + r() * (hi - lo) : 0);
  const afr = m.face_african || 0; const asi = m.face_asian || 0;
  // yeux
  axis('eyes_big', 'eyes_small', wide() * 0.9);
  axis('eyes_apart', 'eyes_close', wide() * 0.9);
  axis('eyes_high', 'eyes_low', tri() * 0.8);
  axis('eyes_tilt_up', 'eyes_tilt_down', wide() * 0.9 + asi * 0.5);
  m.eyes_inner_up = maybe(0.3, 0.2, 0.8);
  axis('eyes_hooded', 'eyes_fold_up', tri() * 0.9 + clamp((id.age - 27) / 12, 0, 0.3));
  axis('eyes_open', 'eyes_narrow', wide() * 0.9);
  m.eyes_deep = maybe(0.45, 0.2, 0.8);
  m.eyes_bags = clamp((id.age - 25) / 10, 0, 1) * (0.3 + r() * 0.7);
  // sourcils
  axis('brows_high', 'brows_low', wide());
  axis('brows_arch', 'brows_flat', wide());
  m.brows_ridge = maybe(0.45, 0.3, 1);
  // bouche et lèvres (les traits du portrait d'abord : lèvres pleines ou bouche large gardent leur sens)
  axis('mouth_high', 'mouth_low', tri() * 0.8);
  if (!m.mouth_wide) m.mouth_narrow = Math.max(0, tri()) * 0.9;
  axis('mouth_up', 'mouth_down', tri() * 0.8 - clamp((id.age - 28) / 20, 0, 0.2));
  m.mouth_forward = maybe(0.3 + afr * 0.3, 0.2, 0.8);
  if (!m.lips_full) m.lips_thin = Math.max(0, tri()) * (1 - afr * 0.7);
  m.lips_lower = maybe(0.4, 0.3, 0.9);
  m.lips_bow = maybe(0.4, 0.3, 1);
  // nez : la pointe, la longueur, le profil
  axis('nose_up', 'nose_down', wide());
  if ((m.nose_long || 0) < 0.2) m.nose_short = maybe(0.35, 0.2, 0.8);
  m.nose_flat = maybe(0.25 + afr * 0.35, 0.2, 0.8);
  m.nose_tip = maybe(0.4, 0.2, 0.8);
  if (!m.nose_hump) { const p = r(); if (p < 0.25) m.nose_greek = 0.3 + r() * 0.7; else if (p < 0.4) m.nose_concave = 0.3 + r() * 0.6; }
  m.nose_bridge = maybe(0.35, 0.2, 0.8);
  // menton et mâchoire
  axis('chin_long', 'chin_short', wide() * 0.9);
  m.chin_cleft = maybe(0.2, 0.5, 1);
  m.chin_jut = maybe(0.2, 0.2, 0.7);
  if ((m.jaw_wide || 0) < 0.35 && (f.jw || 1) < 1) m.jaw_narrow = r() * 0.6;
  // joues : des visages d'athlètes, souvent secs
  if ((m.cheeks_full || 0) < 0.2) m.cheeks_hollow = maybe(0.5, 0.3, 1);
  m.cheeks_high = maybe(0.4, 0.2, 1);
  m.cheeks_inner = maybe(0.3, 0.2, 0.8);
  // crâne : une forme parmi six (ou celle du portrait), la largeur, la finesse du visage
  const shape = ['head_round', 'head_diamond', 'head_rect', 'head_tri', 'head_invtri', null][Math.floor(r() * 6)];
  if (shape && (m.head_square || 0) + (m.head_oval || 0) < 0.3) m[shape] = (0.4 + r() * 0.6) * (shaved ? 0.5 : 1);
  axis('head_wide', 'head_narrow', wide() * 0.8);
  axis('face_fat', 'face_lean', wide() * 0.9 - 0.25); // (plus souvent fin que joufflu)
  // plafonds d'ensemble (les traits tirés avant ne sont jamais réduits : seuls les nouveaux le sont)
  const cap = (ks, max, keep = []) => {
    const fixed = keep.reduce((a, k) => a + (m[k] || 0), 0);
    const sum = ks.reduce((a, k) => a + (m[k] || 0), 0);
    if (fixed + sum > max && sum > 0) { const s = Math.max(0, max - fixed) / sum; for (const k of ks) if (m[k]) m[k] *= s; }
  };
  cap(['eyes_big', 'eyes_small', 'eyes_apart', 'eyes_close', 'eyes_high', 'eyes_low', 'eyes_tilt_up', 'eyes_tilt_down', 'eyes_inner_up', 'eyes_hooded', 'eyes_fold_up', 'eyes_open', 'eyes_narrow', 'eyes_deep'], 2.2);
  cap(['brows_high', 'brows_low', 'brows_arch', 'brows_flat', 'brows_ridge'], 1.4, ['brow_heavy']);
  cap(['mouth_high', 'mouth_low', 'mouth_narrow', 'mouth_up', 'mouth_down', 'mouth_forward', 'lips_thin', 'lips_lower', 'lips_bow'], 1.8, ['lips_full', 'mouth_wide']);
  cap(['nose_up', 'nose_down', 'nose_short', 'nose_flat', 'nose_tip', 'nose_greek', 'nose_concave', 'nose_bridge'], 1.5, ['nose_wide', 'nose_narrow', 'nose_long', 'nose_hump', 'nose_flare']);
  cap(['chin_long', 'chin_short', 'chin_cleft', 'chin_jut', 'jaw_narrow'], 1.3, ['chin_strong', 'chin_narrow']);
  cap(['cheeks_hollow', 'cheeks_high', 'cheeks_inner'], 1.4, ['cheeks_full', 'cheekbones']);
  cap(['head_round', 'head_diamond', 'head_rect', 'head_tri', 'head_invtri', 'head_wide', 'head_narrow'], 1.2, ['head_square', 'head_oval']);
}
export function recipe(id) {
  const f = id.face || {}; const r = rand(id.seed ^ 0x5bd1e995);
  const m = {};
  const dark = clamp(((f.sk ?? 2) - 2.5) / 4.5, 0, 1); // le teint du portrait guide l'origine du visage
  m.face_african = clamp(dark * (0.8 + r() * 0.2) + (id.origin === 'afr' || id.origin === 'ant' ? 0.15 : 0), 0, 1);
  m.face_caucasian = clamp((1 - dark) * (0.7 + r() * 0.3) - (id.origin === 'mag' ? 0.15 : 0), 0, 1);
  m.face_asian = r() < 0.3 ? r() * 0.35 : 0;
  const sum = m.face_african + m.face_caucasian + m.face_asian;
  if (sum > 1) for (const k of ['face_african', 'face_caucasian', 'face_asian']) m[k] /= sum;
  m.face_mature = clamp((id.age - 19) / 14, 0.15, 0.75); // (un visage d'adulte, même à 19 ans)
  const sh = { oval: { head_oval: 0.4 }, round: { cheeks_full: 0.6, head_oval: 0.25 }, square: { head_square: 0.75, jaw_wide: 0.4 }, long: { forehead_tall: 0.35, chin_narrow: 0.4, nose_long: 0.25 } }[f.sh] || {};
  const no = { wide: { nose_wide: 0.8, nose_flare: 0.5 }, aquiline: { nose_hump: 0.8, nose_long: 0.3 }, button: { nose_narrow: 0.6 }, straight: { nose_long: 0.35 } }[f.no] || {};
  const mo = { full: { lips_full: 0.8 }, thin: { mouth_wide: 0.2 }, smile: { mouth_wide: 0.5 } }[f.mo] || {};
  for (const [k, v] of Object.entries({ ...sh, ...no, ...mo })) m[k] = Math.max(m[k] || 0, clamp(v * (0.9 + r() * 0.6), 0, 1));
  // deux ou trois traits propres à chacun, tirés de sa graine : deux portraits voisins donnent deux visages distincts
  for (let j = 0, n = 2 + Math.floor(r() * 2); j < n; j++) { const k = EXTRA[Math.floor(r() * EXTRA.length)]; m[k] = Math.max(m[k] || 0, 0.3 + r() * 0.5); }
  // mâchoire et menton d'homme adulte
  m.jaw_wide = Math.max(m.jaw_wide || 0, clamp(((f.jw || 1) - 0.98) * 9, 0, 1), 0.2 + r() * 0.3);
  if ((f.jw || 1) < 0.97) m.chin_narrow = Math.max(m.chin_narrow || 0, 0.5);
  if (f.bw === 'thick') m.brow_heavy = 0.1 + r() * 0.1; // (plus fort, la cible MakeHuman étire le crâne vers l'arrière)
  if (f.sg === 'ears') m.ears_flap = 0.9; else if (f.ea !== 'small') m.ears_big = r() * 0.4;
  // crâne : au-delà, il pointe ; deux fois moins encore sous des cheveux ras (rien ne le cache)
  const shaved = MESH[id.style] === null || (id.style === 'curly' && (f.tx === 'coily' || toneOf(f.sk) === 2));
  m.head_oval = Math.min(m.head_oval || 0, 0.3) * (shaved ? 0.5 : 1);
  m.forehead_tall = Math.min(m.forehead_tall || 0, 0.25) * (shaved ? 0.5 : 1);
  m.cheekbones = r() * 0.7;
  m.chin_strong = Math.max(m.chin_strong || 0, r() < 0.6 ? 0.3 + r() * 0.5 : 0);
  if (['mullet', 'side', 'slick', 'receding', 'long', 'bun', 'ponytail'].includes(id.style)) { // coupe plaquée : elle dégage tout le visage, qui doit rester marqué (les coiffures de l'ancienne coupe short04 : visages inchangés)
    m.jaw_wide = Math.max(m.jaw_wide, 0.45); m.chin_strong = Math.max(m.chin_strong, 0.4); m.chin_narrow = Math.min(m.chin_narrow || 0, 0.2);
  }
  tameFace(m);
  moreFace(id, f, m, shaved);
  // front (1.0.48, PDG : « quelques joueurs en C et d'autres en B ») : un joueur sur deux a le front plus petit (moins haut, tempes
  // plus étroites, moins bombé), les autres le front de la base ; tous ont la lisière plus basse. (Lu dans la graine, sans
  // tirage de plus : les autres traits des joueurs ne changent pas.)
  if (((id.seed >>> 11) & 1) === 1) { m.forehead_small = 0.9 + ((id.seed >>> 13) % 11) / 100; m.forehead_tall = 0; }
  // carrure : défenseurs et gardiens plus solides, milieux plus fins
  const builds = { G: [0.25, 0.35, 0.4], D: [0.2, 0.35, 0.45], M: [0.5, 0.2, 0.3], A: [0.4, 0.2, 0.4] }[id.pos] || [0.4, 0.3, 0.3];
  const x = r(); const b = x < builds[0] ? 'build_lean' : x < builds[0] + builds[1] ? 'build_stocky' : 'build_strong';
  m[b] = 0.3 + r() * 0.6;
  m.neck_thick = (b === 'build_lean' ? 0.3 : 0.45) + r() * 0.35; // (1.0.38 : un cou d'athlète, jamais filiforme)
  return m;
}
// teinte de la peau : la luminosité va vers le teint du portrait, la teinte reste celle de la peau (chaude, jamais grise)
// 1.0.40 (PDG : « les visages font peur ») : la peau claire tournait au blanc de porcelaine (éclaircie de 12 % et grisée
// vers le ton d'aplat du portrait) ; elle garde maintenant la chaleur de la photo de peau, au plus un peu assombrie
function skinTint(sk, tex) {
  const t = new THREE.Color(SKINS[sk] || SKINS[2]); const m = new THREE.Color(FACE_MEAN[tex]);
  // (les trois photos de peau claire sont très pâles : un peu plus soutenues, plus chaudes)
  // (1.0.47, relecture : le teint mat #a26b46 sur la peau 3 sortait aussi foncé que #7d4d31 ; il s'éclaircit d'un cran,
  // lui seul, pour retrouver la nuance de son portrait)
  const k = clamp(Math.sqrt(lum(t) / lum(m)), 0.8, sk === 5 && tex >= 3 ? 1.3 : 1.0) * (tex <= 2 ? 0.88 : 1);
  const h = (a, b) => clamp((a / b) ** 0.05, 0.97, 1.03);
  return new THREE.Color(k * h(t.r, m.r), k * h(t.g, m.g) * (tex <= 2 ? 0.95 : 0.985), k * h(t.b, m.b) * (tex <= 2 ? 0.88 : 0.96));
}
// Yeux (1.0.38, PDG : « ils font peur… humainement bcp plus réalistes ») : la texture d'origine a un iris presque noir,
// qui se lit de loin comme un œil tout noir, et une cornée mate (aucun reflet : un regard vide). Iris redessinés sur la
// même texture (pupille, couleur, fibres, cercle sombre du bord), six couleurs selon la graine et le teint ; la cornée
// devient brillante (le reflet de la lumière dans l'œil).
const IRIS = [['#4a2e18', '#24150b'], ['#6b4523', '#30200f'], ['#8a6a35', '#3d2c12'], ['#6a7a44', '#2f381a'], ['#6f8fae', '#2e4256'], ['#7f8a90', '#3b4246']];
let EYES = null;
function eyeTextures(src) {
  if (EYES) return EYES;
  if (!src?.image) return null;
  const img = src.image; const W = img.width, H = img.height;
  const c0 = document.createElement('canvas'); c0.width = W; c0.height = H;
  const g0 = c0.getContext('2d', { willReadFrequently: true }); g0.drawImage(img, 0, 0);
  const d = g0.getImageData(0, 0, W, H).data;
  // les deux iris : pixels sombres de chaque quart (haut droit, bas gauche), sans le petit disque gris du coin
  const iris = [[W / 2, 0, W, H / 2], [0, H / 2, W * 0.62, H]].map(([x0, y0, x1, y1]) => {
    let sx = 0, sy = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; if (d[i] + d[i + 1] + d[i + 2] < 210) { sx += x; sy += y; n++; } }
    return n ? { x: sx / n, y: sy / n, r: Math.sqrt(n / Math.PI) * 1.04 } : null;
  });
  EYES = IRIS.map(([light, dark], k) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    // blanc de l'œil à peine éclairci (1.0.40 : trop blanc, le regard paraissait fixe et effrayé)
    g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(60, 56, 52, 0.2)'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    for (const e of iris) {
      if (!e) continue;
      const r = e.r;
      const grd = g.createRadialGradient(e.x, e.y, r * 0.3, e.x, e.y, r);
      grd.addColorStop(0, '#050403'); grd.addColorStop(0.36, '#0b0806'); grd.addColorStop(0.42, light); grd.addColorStop(0.78, dark);
      grd.addColorStop(0.92, '#140d08'); grd.addColorStop(1, 'rgba(20, 14, 10, 0)');
      g.fillStyle = grd; g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
      // fibres de l'iris : rayons clairs et sombres (graine fixe par couleur)
      let sd = 97 + k * 31; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let j = 0; j < 90; j++) {
        const a = rnd() * Math.PI * 2; const r0 = r * (0.42 + rnd() * 0.08); const r1 = r * (0.7 + rnd() * 0.22);
        g.strokeStyle = rnd() < 0.5 ? `rgba(255, 236, 200, ${0.08 + rnd() * 0.1})` : `rgba(0, 0, 0, ${0.1 + rnd() * 0.12})`;
        g.lineWidth = 0.6 + rnd() * 0.8; g.beginPath(); g.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0); g.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 4;
    return t;
  });
  return EYES;
}
// couleur des yeux : celle du portrait (1.0.42, PDG : cohérence entre l'image du joueur et son joueur 3D ; elle était
// tirée au hasard d'après le teint, des yeux bleus sur le portrait devenaient bruns) ; sinon, brun foncé ou brun pour les
// teints sombres, plus variés pour les teints clairs
const IRIS_OF = { dark: 0, brown: 1, hazel: 2, green: 3, blue: 4 };
function irisOf(id) {
  if (IRIS_OF[id.face?.ec] !== undefined) return IRIS_OF[id.face.ec];
  const r = rand(id.seed ^ 0x2545f491)();
  if ((id.face?.sk ?? 2) >= 4) return r < 0.7 ? 0 : 1;
  if ((id.face?.sk ?? 2) >= 3) return r < 0.45 ? 0 : r < 0.85 ? 1 : 2;
  return r < 0.25 ? 0 : r < 0.5 ? 1 : r < 0.65 ? 2 : r < 0.75 ? 3 : r < 0.93 ? 4 : 5;
}
// Cheveux en cartes (1.0.38) : la texture MakeHuman, très contrastée, donnait un casque taché ; son grain est adouci
// (plus de taches sombres), la lumière y glisse un peu (moins mat)
function softHair(mat, strands = false, fringe = false) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', strands ? `#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    diffuseColor.rgb *= mix(0.45, 1.5, sampledDiffuseColor.g); // (texture grise de moyenne 0,5 : l'ombre entre les mèches, leurs reflets ; plus doux, les cartes ne font plus plaques)
    diffuseColor.a *= sampledDiffuseColor.a;
    ${fringe ? `if (sampledDiffuseColor.a >= ${HAIR_CORE.toFixed(2)}) discard; // (second passage : les pointes seules, fondues)` : ''}
  #endif` : `#ifdef USE_MAP
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    float hl = smoothstep(0.12, 0.88, sampledDiffuseColor.g);
    diffuseColor.rgb *= mix(0.7, 1.0, hl);
    diffuseColor.a *= sampledDiffuseColor.a;
  #endif`);
  };
  mat.customProgramCacheKey = () => (strands ? (fringe ? 'footoff-meches-pointes' : 'footoff-meches') : 'footoff-cheveux');
}
// mèches Rocketbox en deux passages (1.0.47), comme dans les jeux : le cœur des cartes opaque (découpe à HAIR_CORE, il
// écrit la profondeur), puis les pointes en transparence par-dessus ; une découpe seule faisait des bords de papier
const HAIR_CORE = 0.6;
// (1.0.47) coupes Rocketbox : le dessin des mèches est dans la couleur de la texture, la transparence ne fait que le
// contour de chaque carte ; le grain adouci des cartes MakeHuman en faisait des aplats lisses
// peau : barbe, moustache, bouc et cheveux ras peints d'après le masque de pilosité (grain de poil de près, densité
// moyenne de loin)
// manches longues et gants du gardien (1.0.43) : sans les ombres de contact cuites sur la peau ; sous le bord de la manche
// courte, elles traçaient une bande sombre à mi-bras
const AO_KEEPER = THREE.ShaderChunk.aomap_fragment.replace(/(float ambientOcclusion = [^;]+;)/, '$1\n\tambientOcclusion = mix( ambientOcclusion, 1.0, max( sleeveK, gloveK ) );');
function paintable(mat, u) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: A.mask };
    sh.uniforms.uBeard = u.beard;
    sh.uniforms.uHair = u.hair;
    sh.uniforms.uScalp = u.scalp;
    sh.uniforms.uScalpTex = u.scalpTex; // (1.0.47) cheveux peints de la coupe Rocketbox
    sh.uniforms.uScalpUse = u.scalpUse;
    sh.uniforms.uSleeve = u.sleeve; // gardien : manches longues (couleur, 1) ; sinon (…, 0)
    sh.uniforms.uGlove = u.glove;
    sh.uniforms.uShirtIn = u.shirtIn; // couches intérieures (1.0.40) : sous le maillot, sous le short
    sh.uniforms.uShortsIn = u.shortsIn;
    sh.vertexShader = `attribute vec2 aKit;\nattribute vec3 aIn;\nvarying vec2 vKit;\nvarying vec2 vIn;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKit = aKit;\n  vIn = aIn.xy;').replace('#include <project_vertex>', '#include <project_vertex>\n  if ( aIn.z > 0.001 ) gl_Position = projectionMatrix * vec4( mvPosition.xyz + normalize( mvPosition.xyz ) * 0.03 * aIn.z * length( modelMatrix[ 0 ].xyz ), 1.0 );')}`;
    sh.fragmentShader = `uniform sampler2D uMask;\nuniform sampler2D uScalpTex;\nuniform vec2 uScalpUse;\nuniform vec4 uBeard;\nuniform vec3 uHair;\nuniform vec3 uScalp;\nuniform vec4 uSleeve;\nuniform vec4 uGlove;\nuniform vec3 uShirtIn;\nuniform vec3 uShortsIn;\nvarying vec2 vKit;\nvarying vec2 vIn;\n${sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float hairK = 0.0;
  {
    vec4 fm = texture2D(uMask, vMapUv);
    float bd = max(max(fm.r * uBeard.x, fm.g * uBeard.y), fm.b * uBeard.z) * (1.0 - fm.g * max(0.0, -uBeard.y));
    vec4 st = texture2D(uScalpTex, vMapUv); // (1.0.47) cheveux peints de la coupe : R couverture, G dessin des mèches
    float sd = mix(fm.a * uBeard.w, clamp(smoothstep(0.05, 0.75, st.r) * uScalpUse.y, 0.0, 1.0), uScalpUse.x); // (sous 0,05 : rien, les traits fins disparaissent ; lisière fondue)
    float d = max(bd, sd);
    bool painted = sd > bd;
    vec3 hairCol = painted ? uScalp * mix(1.0, mix(0.4, 1.6, st.g), uScalpUse.x) : uHair; // barbe : la couleur des poils ; cheveux ras : plus sombres (racines)
    vec2 gp = vMapUv * 1536.0;
    float n = fract(sin(dot(floor(gp), vec2(12.9898, 78.233))) * 43758.5453);
    n = mix(n, fract(sin(dot(floor(gp * 0.37), vec2(39.346, 11.135))) * 24634.6345), 0.35); // deux échelles de grain
    float far = clamp(length(fwidth(gp)) - 2.5, 0.0, 1.0);
    float k = mix(smoothstep(n - 0.3, n + 0.3, d) * min(1.0, d * 2.0), d * 0.9, far); // (1.0.40 : grain plus doux, la barbe ne fait plus « sale »)
    if (painted) k = mix(k, sd, uScalpUse.x); // (la peinture de la coupe a son propre dessin : pas de grain)
    hairK = clamp(k, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, hairCol, hairK * (sd > bd ? 0.97 : 0.9)); // (cheveux : couvrants)
  }
  // gardien : manche longue et gant aux bords nets (1.0.40 : un dégradé flou faisait fondre la manche dans le gant)
  float sleeveK = smoothstep(0.3, 0.55, vKit.x) * uSleeve.a;
  float gloveK = smoothstep(0.35, 0.6, vKit.y) * uGlove.a;
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, uSleeve.rgb, sleeveK), uGlove.rgb, gloveK);
  // couches intérieures : la peau près des ouvertures (bras dans la manche, cuisse dans le short, base du cou), la couleur
  // de la tenue partout ailleurs (là où le corps peut percer le tissu, rien ne se voit)
  float inK = max(vIn.x, vIn.y);
  float shirtInK = vIn.x * (1.0 - sleeveK); // (1.0.43) gardien : le bras sous la manche courte reste à la couleur de sa manche longue
  diffuseColor.rgb = mix(diffuseColor.rgb, uShirtIn, shirtInK);
  diffuseColor.rgb = mix(diffuseColor.rgb, uShortsIn, vIn.y);`).replace('#include <opaque_fragment>', 'outgoingLight *= mix( 1.0, 0.3, max( shirtInK, vIn.y ) );\n  #include <opaque_fragment>').replace('#include <aomap_fragment>', AO_KEEPER).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(roughnessFactor, 0.95, hairK), 0.88, max(max(sleeveK, gloveK), inK)); // poil, tissu et gants mats')}`;
  };
  // la lumière traverse la peau (1.0.40) : au bord des ombres, le rouge s'étale plus loin que le vert et le bleu (éclairage
  // « enveloppé », comme la diffusion sous la peau) ; sans cela, un visage paraît en plâtre
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
      `{
    float ndlS = dot( geometryNormal, directLight.direction );
    vec3 wrapS = vec3( 0.32, 0.13, 0.08 );
    vec3 sss = clamp( ( vec3( ndlS ) + wrapS ) / ( 1.0 + wrapS ), 0.0, 1.0 );
    reflectedLight.directDiffuse += mix( irradiance, sss * directLight.color, 0.6 ) * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
  }`);
  };
  mat.customProgramCacheKey = () => 'footoff-peau-2';
}
// Buste d'homme et maillot de football (1.0.40, PDG : « les joueurs 3D ont des poitrines qui ressortent énormément, et
// des petits défauts au col et à la tenue »). Corrigé dans la géométrie, en mètres dans la pose de repos (le modèle
// regarde +z), à la cuisson de chaque joueur, morphs compris :
// - les pectoraux sous le maillot se lisaient comme une poitrine : tout ce qui dépasse la ligne du sternum, de la base
//   des pectoraux au haut du torse, est ramené vers elle (85 %), ombrage recalculé (sinon les bosses restent dessinées) ;
// - le maillot tombe droit, comme un maillot de football et non un t-shirt ajusté : un peu plus ample à la taille ;
// - la couche intérieure (le corps aux couleurs du maillot, sous le tissu) rentre de 5 mm : elle perçait le tissu au col
//   (une marche noire), sous l'aisselle (des pointes) et à l'ourlet du short.
const TORSO = { cloth: new Set(['male_casualsuit04', 'male_casualsuit04_1']), inner: new Set(['base_1', 'base_5']) };
const sinkAt = (y) => smooth01(0.98, 1.03, y) * (1 - smooth01(1.36, 1.42, y)); // (torse : sous le tissu, loin du cou et de la taille)
// taille fine (1.0.40, relecture : « silhouette en tonneau ») : jusqu'à 5 % de largeur en moins autour de la taille, rien
// sous les hanches ni au-dessus des côtes ; même fonction pour le maillot, le short et le corps dessous
const taperAt = (y) => 1 - 0.05 * smooth01(0.9, 1.0, y) * (1 - smooth01(1.1, 1.27, y));
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function restMatrix(o) { // positions quantifiées (meshopt) -> mètres dans la pose de repos ; la même pour tous les os
  const sk = o.skeleton;
  const M = sk.bones[0].matrixWorld.clone().multiply(sk.boneInverses[0]);
  return o.matrixWorld.clone().multiply(o.bindMatrixInverse).multiply(M).multiply(o.bindMatrix);
}
function reshapeTorso(name, pos, nor, index, Rm) {
  const cloth = TORSO.cloth.has(name);
  const n = pos.length / 3;
  const Ri = Rm.clone().invert();
  const scale = Rm.getMaxScaleOnAxis();
  const v = new THREE.Vector3();
  const P = new Float32Array(pos.length);
  for (let i = 0; i < n; i++) { v.fromArray(pos, i * 3).applyMatrix4(Rm); v.toArray(P, i * 3); }
  // ligne du sternum : l'avant du maillage au milieu (|x| < 3,5 cm), tranche par tranche de 1 cm
  const mid = new Map();
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (Math.abs(x) > 0.035 || z <= 0 || y < 1.0 || y > 1.5) continue;
    const k = Math.round(y * 100);
    if (!(mid.get(k) >= z)) mid.set(k, z);
  }
  const midAt = (y) => { // la tranche la plus proche qui en a une
    const k = Math.round(y * 100);
    for (let d = 0; d < 6; d++) { if (mid.has(k - d)) return mid.get(k - d); if (mid.has(k + d)) return mid.get(k + d); }
    return null;
  };
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let wt = 0;
    // pectoraux : ce qui dépasse le sternum revient vers lui
    const ax = Math.abs(x);
    const band = smooth01(1.1, 1.2, y) * (1 - smooth01(1.33, 1.43, y));
    const lat = smooth01(0.012, 0.045, ax) * (1 - smooth01(0.16, 0.21, ax));
    const front = smooth01(0.03, 0.07, z);
    const k = band * lat * front;
    if (k > 0) {
      const zm = midAt(y);
      if (zm != null && z > zm - 0.002) { z -= k * 0.85 * (z - (zm - 0.002)); wt = Math.max(wt, k); }
    }
    // galbe latéral (vu de trois quarts, le côté proche bombait encore en poitrine) : le devant du buste suit une ellipse
    // large, plate au centre, qui recule vers les flancs ; ce qui dépasse y revient
    const kb = smooth01(1.1, 1.18, y) * (1 - smooth01(1.36, 1.44, y)) * smooth01(0.03, 0.08, ax) * smooth01(0.02, 0.05, z);
    if (kb > 0) {
      const zm = midAt(y);
      if (zm != null) {
        const W = 0.215;
        const ze = zm * Math.sqrt(Math.max(0, 1 - (ax / W) ** 2)) - 0.002;
        if (z > ze) { z -= kb * 0.85 * (z - ze); wt = Math.max(wt, kb); }
      }
    }
    // silhouette en V : la taille s'affine (toutes les couches du torse de la même façon, le tissu garde son aisance)
    const tp = taperAt(y);
    if (tp < 1) { x *= tp; wt = Math.max(wt, (1 - tp) * 12); }
    P[i * 3] = x; P[i * 3 + 2] = z; w[i] = wt;
  }
  // retour aux unités du maillage pour les sommets déplacés ; la couche intérieure rentre de 5 mm sous le tissu du torse
  const inner = TORSO.inner.has(name) && nor;
  for (let i = 0; i < n; i++) {
    // (aisselle : 15 mm, le tissu y est tiré par le bras)
    const pit = inner ? smooth01(0.1, 0.14, Math.abs(P[i * 3])) * smooth01(1.2, 1.26, P[i * 3 + 1]) * (1 - smooth01(1.36, 1.42, P[i * 3 + 1])) : 0;
    const sk = inner ? sinkAt(P[i * 3 + 1]) * (1 + 2 * pit) : 0;
    if (!w[i] && !sk) continue;
    v.fromArray(P, i * 3).applyMatrix4(Ri);
    if (sk) {
      const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; const d = (0.005 / scale) * sk;
      v.x -= (nx / l) * d; v.y -= (ny / l) * d; v.z -= (nz / l) * d;
    }
    v.toArray(pos, i * 3);
  }
  // ombrage : normales recalculées là où la forme a changé (sommets soudés par position : pas de couture)
  if (!nor || !index) return;
  const acc = new Map(); const keyOf = (i) => `${Math.round(pos[i * 3] * 4000)},${Math.round(pos[i * 3 + 1] * 4000)},${Math.round(pos[i * 3 + 2] * 4000)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const idx = index.array;
  for (let f = 0; f < idx.length; f += 3) {
    const i0 = idx[f], i1 = idx[f + 1], i2 = idx[f + 2];
    if (!w[i0] && !w[i1] && !w[i2]) continue;
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2); // (aire comprise : les grandes faces pèsent plus)
    for (const j of [i0, i1, i2]) { const kk = keyOf(j); const s0 = acc.get(kk) || [0, 0, 0]; s0[0] += e1.x; s0[1] += e1.y; s0[2] += e1.z; acc.set(kk, s0); }
  }
  for (let i = 0; i < n; i++) {
    if (!w[i]) continue;
    const s0 = acc.get(keyOf(i)); if (!s0) continue;
    const l = Math.hypot(s0[0], s0[1], s0[2]); if (!l) continue;
    const ox = nor[i * 3], oy = nor[i * 3 + 1], oz = nor[i * 3 + 2]; const ol = Math.hypot(ox, oy, oz) || 1;
    // même sens que l'ancienne normale (l'enroulement des faces peut varier d'un vêtement à l'autre)
    const sg = (s0[0] * ox + s0[1] * oy + s0[2] * oz) < 0 ? -1 : 1;
    const t = Math.min(1, w[i] * 1.6);
    const nx = ox / ol * (1 - t) + sg * s0[0] / l * t, ny = oy / ol * (1 - t) + sg * s0[1] / l * t, nz = oz / ol * (1 - t) + sg * s0[2] / l * t;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / nl; nor[i * 3 + 1] = ny / nl; nor[i * 3 + 2] = nz / nl;
  }
}
// Short de football (1.0.40) : le short moulait la cuisse comme un cuissard ; il s'évase autour de chaque cuisse, de
// plus en plus vers l'ourlet (axes hanche-genou de la pose de repos, en mètres).
const LEG = { hip: [0.109, 0.923, -0.007], knee: [0.149, 0.508, 0.027] };
function reshapeShorts(pos, Rm) {
  const n = pos.length / 3;
  const Ri = Rm.clone().invert();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromArray(pos, i * 3).applyMatrix4(Rm);
    if (v.y > 0.93) continue;
    const sx = v.x >= 0 ? 1 : -1;
    const t = (LEG.hip[1] - v.y) / (LEG.hip[1] - LEG.knee[1]);
    const cx = sx * (LEG.hip[0] + (LEG.knee[0] - LEG.hip[0]) * t), cz = LEG.hip[2] + (LEG.knee[2] - LEG.hip[2]) * t;
    const f = 1 + 0.07 * smooth01(0.88, 0.64, v.y); // (jusqu'à +7 % de rayon à l'ourlet : ample, pas évasé)
    v.x = cx + (v.x - cx) * f; v.z = cz + (v.z - cz) * f;
    v.x *= taperAt(v.y); // (la taille du short suit celle du maillot)
    v.applyMatrix4(Ri).toArray(pos, i * 3);
  }
}
// Couches intérieures (1.0.40) : le corps sous le maillot (base_1), sous le short (base_2), sous le col (base_5). aIn.x :
// part de la couleur du maillot, aIn.y : de celle du short ; 0 = peau. Peau près des ouvertures (dans la manche jusqu'à
// 4 cm, à la base du cou, sur 1,5 cm au-dessus de l'ourlet du short), tenue ailleurs.
function prepareInner(scene) {
  const meshes = {};
  scene.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
  const V = new THREE.Vector3();
  const restOf = (o, i) => V.fromBufferAttribute(o.geometry.attributes.position, i).applyMatrix4(A.rest[o.name]);
  const bone = (n) => scene.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  const arm = {};
  for (const s of ['l', 'r']) {
    const S = bone(`upperarm_${s}`), E = bone(`lowerarm_${s}`);
    arm[s] = { S, axis: E.clone().sub(S).normalize(), hem: -Infinity };
  }
  // bords des manches : leur propre matériau depuis la base v2 (1.0.43, Kit_Cuff), sinon avec le col (Kit_Trim)
  const cuffs = Object.values(meshes).find((o) => (o.material?.name || '').startsWith('Kit_Cuff'));
  const trim = cuffs || meshes.male_casualsuit04_1;
  if (trim) for (let i = 0; i < trim.geometry.attributes.position.count; i++) {
    const v = restOf(trim, i);
    if (Math.abs(v.x) < 0.2) continue;
    const a = arm[v.x > 0 ? 'l' : 'r'];
    a.hem = Math.max(a.hem, v.clone().sub(a.S).dot(a.axis));
  }
  let hemY = 0.628;
  const sh = meshes.Kit_ShortsCloth;
  if (sh) { hemY = Infinity; for (let i = 0; i < sh.geometry.attributes.position.count; i++) { const v = restOf(sh, i); if (Math.abs(v.x) > 0.06) hemY = Math.min(hemY, v.y); } }
  for (const name of ['base', 'base_1', 'base_2', 'base_5']) {
    const o = meshes[name];
    if (!o || !A.rest[name]) continue;
    const n = o.geometry.attributes.position.count;
    const att = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = restOf(o, i);
      // couches intérieures : en retrait derrière le tissu (voir le shader), sauf au col (rien à y cacher, et le retrait y
      // laissait voir le bord intérieur du maillot)
      if (name === 'base_1') att[i * 3 + 2] = 1 - smooth01(1.36, 1.4, v.y);
      if (name === 'base_1') {
        // dans la manche aussi, la couleur du maillot (on y voit la doublure) : la peau y perçait aux jonctions de l'aisselle
        let kit = 1;
        kit *= 1 - smooth01(1.415, 1.448, v.y); // à la base du cou
        att[i * 3] = kit;
      } else if (name === 'base_2') {
        att[i * 3 + 1] = 1; // l'intérieur du short, dans l'ombre jusqu'à l'ourlet (relecture : un liseré plus clair que la cuisse)
      }
    }
    o.geometry.setAttribute('aIn', new THREE.BufferAttribute(att, 3));
  }
  // pied sous la chaussure : la chaussette à la cheville seulement (en haut de la chaussure) ; plus bas, la couleur de la
  // chaussure (quand le pied perce le côté de la chaussure, rien ne se voit)
  const ft = meshes.base_4;
  if (ft && A.rest.base_4) {
    const n = ft.geometry.attributes.position.count; const att = new Float32Array(n);
    // le bord de la chaussure, secteur par secteur autour de la cheville (plus bas devant, à la languette, plus haut au talon) :
    // ce qui dépasse le bord est la chaussette, ce qui reste dessous la chaussure
    const SECT = 36;
    const shoe = meshes.shoes06;
    const ank = { l: bone('foot_l'), r: bone('foot_r') };
    const rim = { l: new Float32Array(SECT).fill(-1), r: new Float32Array(SECT).fill(-1) };
    const sectOf = (v, sd) => Math.min(SECT - 1, Math.floor(((Math.atan2(v.x - ank[sd].x, v.z - ank[sd].z) + Math.PI) / (2 * Math.PI)) * SECT));
    if (shoe && A.rest.shoes06) {
      for (let i = 0; i < shoe.geometry.attributes.position.count; i++) {
        const v = restOf(shoe, i); const sd = v.x > 0 ? 'l' : 'r'; const k = sectOf(v, sd);
        rim[sd][k] = Math.max(rim[sd][k], v.y);
      }
    }
    const above = (o, att) => {
      for (let i = 0; i < att.length; i++) {
        const v = restOf(o, i); const sd = v.x > 0 ? 'l' : 'r'; const k = sectOf(v, sd);
        const r0 = Math.max(rim[sd][k], rim[sd][(k + 1) % SECT], rim[sd][(k + SECT - 1) % SECT]);
        att[i] = r0 < 0 ? smooth01(0.097, 0.105, v.y) : smooth01(r0 - 0.006, r0 + 0.002, v.y);
      }
      o.geometry.setAttribute('aFoot', new THREE.BufferAttribute(att, 1));
    };
    above(ft, att);
    // la chaussette aussi descend dans la chaussure : sous le bord, elle prend la couleur de la chaussure (sinon elle
    // perçait la languette en deux points de couleur)
    const sock = meshes.base_3;
    if (sock && A.rest.base_3) above(sock, new Float32Array(sock.geometry.attributes.position.count));
  }
  // Aisselle (1.0.40, PDG : « travaille encore plus pour que cette pointe sous l'aisselle disparaisse ») : la peau du bras
  // juste sous la manche, l'ourlet et le bas de la manche gardaient une part de poids sur le torse ; bras baissé, ils
  // restaient en arrière et s'étiraient vers le flanc en une écharde. Près de l'ourlet, ils suivent le bras seul, comme un
  // tube rigide ; le pli se fait plus haut, sous le tissu.
  const ARM = /^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_/;
  // points de l'ourlet de chaque manche (anneau en biais : plus haut côté aisselle), pour mesurer la distance à l'ourlet
  const hemPts = { l: [], r: [] };
  if (trim) for (let i = 0; i < trim.geometry.attributes.position.count; i++) {
    const v = restOf(trim, i).clone();
    if (v.y < 1.42 && Math.abs(v.x) > 0.12) hemPts[v.x > 0 ? 'l' : 'r'].push(v);
  }
  // k(v) : part « tube rigide du bras » d'un sommet, selon sa distance à l'ourlet (dans le volume de la manche seulement)
  const rigid = (o, near, far) => {
    if (!o) return;
    const g = o.geometry; const si = g.attributes.skinIndex; const sw = g.attributes.skinWeight;
    const bones = o.skeleton.bones;
    for (let i = 0; i < si.count; i++) {
      const v = restOf(o, i).clone();
      if (Math.abs(v.x) < 0.12) continue;
      const side = v.x > 0 ? 'l' : 'r'; const a = arm[side];
      const d = v.clone().sub(a.S); const t = d.dot(a.axis);
      if (t < 0.02 || d.addScaledVector(a.axis, -t).length() > 0.1) continue; // (la manche et le bras, jamais le flanc)
      let dh = Infinity; for (const h of hemPts[side]) dh = Math.min(dh, h.distanceTo(v));
      const k = 1 - smooth01(near, far, dh);
      if (k <= 0) continue;
      const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
      const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
      const isArm = idx.map((b, j) => w[j] > 0 && ARM.test(bones[b]?.name || ''));
      const armSum = w.reduce((acc, x, j) => acc + (isArm[j] ? x : 0), 0);
      if (armSum <= 1e-4 || armSum > 0.999) continue;
      const nw = w.map((x, j) => (1 - k) * x + k * (isArm[j] ? x / armSum : 0));
      sw.setXYZW(i, nw[0], nw[1], nw[2], nw[3]);
    }
    sw.needsUpdate = true;
  };
  rigid(meshes.base, 0.03, 0.07); // la peau du bras sous l'ourlet
  rigid(meshes.base_1, 0.02, 0.05); // le bras dans la manche, près de l'ourlet
  rigid(meshes.male_casualsuit04, 0.02, 0.05); // le bas de la manche
  rigid(trim, 0.03, 0.04); // l'ourlet entier (k = 1 sur tout l'anneau)
  // Envers du tissu (1.0.40, relecture : « la face intérieure grise de l'ourlet », « un liseré plus clair que la cuisse ») :
  // l'ourlet roulé des manches et du short a des faces tournées vers le membre ; vues par l'ouverture, elles restent dans
  // l'ombre (aBack, lu par le shader du tissu)
  const innerSide = (o, axisOf) => {
    if (!o || !A.rest[o.name] || !o.geometry.attributes.normal) return;
    const g = o.geometry; const n = g.attributes.position.count; const Nn = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(A.rest[o.name]);
    const att = new Float32Array(n); const nn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const v = restOf(o, i).clone();
      nn.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
      const [P, D] = axisOf(v);
      const rad = v.clone().sub(P); rad.addScaledVector(D, -rad.dot(D));
      if (rad.lengthSq() < 1e-8) continue;
      att[i] = smooth01(-0.05, -0.35, nn.dot(rad.normalize()));
    }
    g.setAttribute('aBack', new THREE.BufferAttribute(att, 1));
  };
  const legAxis = (v) => {
    const sx = v.x >= 0 ? 1 : -1;
    const H0 = new THREE.Vector3(sx * LEG.hip[0], LEG.hip[1], LEG.hip[2]); const K0 = new THREE.Vector3(sx * LEG.knee[0], LEG.knee[1], LEG.knee[2]);
    return [H0, K0.sub(H0).normalize()];
  };
  const bodyAxis = (v) => {
    const a = arm[v.x > 0 ? 'l' : 'r'];
    if (Math.abs(v.x) > 0.17 && v.clone().sub(a.S).dot(a.axis) > 0) return [a.S, a.axis];
    return [new THREE.Vector3(0, v.y, 0), new THREE.Vector3(0, 1, 0)];
  };
  innerSide(meshes.Kit_ShortsCloth, legAxis);
  // entre les jambes, le short est à l'ombre de l'autre jambe (le studio ne calcule pas cette ombre) : le pan intérieur
  // de chaque jambe, tourné vers l'autre, s'assombrit (il se voyait plus clair que la cuisse sous l'ourlet)
  { const o = meshes.Kit_ShortsCloth;
    if (o?.geometry.attributes.aBack) {
      const att = o.geometry.attributes.aBack; const Nn = o.geometry.attributes.normal; const nm = new THREE.Matrix3().getNormalMatrix(A.rest[o.name]); const nn = new THREE.Vector3();
      for (let i = 0; i < att.count; i++) {
        const v = restOf(o, i); const sx = v.x >= 0 ? 1 : -1;
        nn.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
        const between = smooth01(-0.1, -0.55, nn.x * sx) * (1 - smooth01(0.84, 0.92, v.y));
        att.setX(i, Math.max(att.getX(i), 0.65 * between));
      }
      att.needsUpdate = true;
    } }
  innerSide(trim, bodyAxis);
  if (cuffs) innerSide(meshes.male_casualsuit04_1, bodyAxis); // (le col, à part depuis la base v2)
  // le maillot lui-même : seulement l'envers roulé au bord de la manche (à 2,5 cm de l'ourlet au plus) ; ailleurs, sous
  // l'aisselle, le flanc du torse passait pour l'intérieur de la manche et s'assombrissait en losange
  innerSide(meshes.male_casualsuit04, bodyAxis);
  // le bas du maillot (1.0.46, relecture : un repli de l'ourlet, jambe levée, montrait l'envers presque noir, un trait à la
  // hanche) : près de l'ourlet du bas, l'envers garde environ 40 % de la couleur du maillot (aFold, lu par le shader)
  { const o = meshes.male_casualsuit04;
    if (o) {
      const n = o.geometry.attributes.position.count; const att = new Float32Array(n); let low = Infinity;
      for (let i = 0; i < n; i++) low = Math.min(low, restOf(o, i).y);
      for (let i = 0; i < n; i++) att[i] = 1 - smooth01(low + 0.015, low + 0.045, restOf(o, i).y);
      o.geometry.setAttribute('aFold', new THREE.BufferAttribute(att, 1));
    } }
  { const o = meshes.male_casualsuit04; const ab = o?.geometry.attributes.aBack;
    if (ab) {
      for (let i = 0; i < ab.count; i++) {
        const v = restOf(o, i).clone(); let dh = Infinity;
        for (const h of hemPts[v.x > 0 ? 'l' : 'r']) dh = Math.min(dh, h.distanceTo(v));
        ab.setX(i, ab.getX(i) * (1 - smooth01(0.015, 0.025, dh)));
      }
      ab.needsUpdate = true;
    } }
}
function taperMesh(pos, Rm) { // le corps sous le short suit la taille
  const Ri = Rm.clone().invert(); const v = new THREE.Vector3();
  for (let i = 0; i < pos.length / 3; i++) {
    v.fromArray(pos, i * 3).applyMatrix4(Rm);
    const tp = taperAt(v.y); if (tp >= 1) continue;
    v.x *= tp; v.applyMatrix4(Ri).toArray(pos, i * 3);
  }
}
// morphs cuits : positions et normales calculées une fois par joueur (le modèle partagé garde ses clés)
function bake(mesh, m) {
  const g0 = mesh.userData.g0 || (mesh.userData.g0 = mesh.geometry);
  const dict = mesh.userData.dict || (mesh.userData.dict = mesh.morphTargetDictionary);
  if (!dict || !g0.morphAttributes.position) return;
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g0.attributes)) if (k !== 'position' && k !== 'normal') g.setAttribute(k, a);
  g.setIndex(g0.index);
  for (const gr of g0.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  const src = g0.attributes.position; // (attribut quantifié et aligné par la compression : lu valeur par valeur)
  const pos = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) { pos[i * 3] = src.getX(i); pos[i * 3 + 1] = src.getY(i); pos[i * 3 + 2] = src.getZ(i); }
  const ns = g0.attributes.normal; const nor = ns ? new Float32Array(ns.count * 3) : null;
  if (ns) for (let i = 0; i < ns.count; i++) { nor[i * 3] = ns.getX(i); nor[i * 3 + 1] = ns.getY(i); nor[i * 3 + 2] = ns.getZ(i); }
  for (const [k, j] of Object.entries(dict)) {
    const w = m[k] || 0;
    if (!w) continue;
    const dp = g0.morphAttributes.position[j];
    for (let i = 0; i < dp.count; i++) { pos[i * 3] += w * dp.getX(i); pos[i * 3 + 1] += w * dp.getY(i); pos[i * 3 + 2] += w * dp.getZ(i); }
    const dn = g0.morphAttributes.normal?.[j];
    if (nor && dn) for (let i = 0; i < dn.count; i++) { nor[i * 3] += w * dn.getX(i); nor[i * 3 + 1] += w * dn.getY(i); nor[i * 3 + 2] += w * dn.getZ(i); }
  }
  const name = mesh.userData.restName ?? mesh.name;
  const Rm = A.rest?.[name];
  if (Rm && (TORSO.cloth.has(name) || TORSO.inner.has(name))) reshapeTorso(name, pos, nor, g0.index, Rm);
  if (Rm && name === 'Kit_ShortsCloth') reshapeShorts(pos, Rm);
  if (Rm && name === 'base_2') taperMesh(pos, Rm);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (mesh.geometry !== g0) mesh.geometry.dispose();
  mesh.geometry = g;
  mesh.morphTargetInfluences = undefined;
  mesh.morphTargetDictionary = undefined;
}

// Carrure d'homme (1.0.38, PDG : « ils font peur… humainement bcp plus réalistes ») : sous le maillot, le haut du
// torse bombé se lisait comme une poitrine, sur des épaules étroites. Épaules plus larges (le bras s'écarte au bout de la
// clavicule), haut du torse moins profond (os spine_03 ; le cou et les clavicules en gardent la mesure d'origine, donc
// la tête et les bras aussi). Les clips n'animent que la position du bassin : ces réglages tiennent.
// 1.0.40 (PDG : « les épaules comparées au dos, ce n'est pas naturel ») : les épaules élargies par les os étiraient le
// maillot à l'emmanchure et faisaient des épaulettes vues de dos ; la carrure revient au modèle, la silhouette en V vient
// de la taille (taperAt) et le buste plat du maillot (reshapeTorso).
const SHOULDER = 1, CHEST_Z = 1;
function athletic(root) {
  for (const s of ['l', 'r']) { const u = root.getObjectByName(`upperarm_${s}`); if (u) u.position.multiplyScalar(SHOULDER); }
  const c = root.getObjectByName('spine_03'); if (c) c.scale.set(1, 1, CHEST_Z);
  for (const n of ['neck_01', 'clavicle_l', 'clavicle_r']) { const b = root.getObjectByName(n); if (b) b.scale.set(1, 1, 1 / CHEST_Z); }
}

export function createPlayers3D(parent, max = 22) {
  if (!A) throw new Error('loadPlayers3D() d’abord');
  const slots = [];
  const clock = new THREE.Clock();
  const V = () => new THREE.Vector3();
  function make(i) {
    const root = SkeletonUtils.clone(A.base.scene);
    const mats = {}; const hairs = {}; const brows = {}; const meshes = [];
    const u = { beard: { value: new THREE.Vector4() }, hair: { value: new THREE.Color() }, scalp: { value: new THREE.Color() }, sleeve: { value: new THREE.Vector4() }, glove: { value: new THREE.Vector4() }, shirtIn: { value: new THREE.Color() }, shortsIn: { value: new THREE.Color() }, scalpTex: { value: NO_SCALP }, scalpUse: { value: new THREE.Vector2(0, 1) } };
    root.traverse((o) => {
      if (!o.isMesh || o.userData.isSoft) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      meshes.push(o);
      const n = (o.material.name || '').split('.')[0];
      const key = n.startsWith('Kit_') ? n : n.startsWith('Hair_') ? 'Hair' : n.startsWith('Brows_') ? 'Brows' : n === 'Eyes' || n === 'Lashes' || n === 'Band' ? n : 'Skin';
      (mats[key] ||= []).push(o.material);
      if (key === 'Hair') hairs[n.slice(5)] = o;
      if (key === 'Hair' && n.startsWith('Hair_rb_')) {
        const fm = o.material.clone();
        Object.assign(fm, { transparent: true, depthWrite: false, alphaTest: 0.02, alphaToCoverage: false, side: THREE.DoubleSide, roughness: 0.78 });
        softHair(fm, true, true);
        const soft = new THREE.SkinnedMesh(o.geometry, fm);
        soft.bind(o.skeleton, o.bindMatrix); soft.name = `${o.name}_pointes`; soft.renderOrder = 2; soft.frustumCulled = false; soft.castShadow = false; soft.userData.isSoft = true;
        o.parent.add(soft); o.userData.soft = soft;
        (mats.Hair ||= []).push(fm);
      }
      if (key === 'Brows') brows[n.slice(6)] = o;
      if (key === 'Hair') { // cartes de cheveux : découpe nette, lissée par l'antialias ; les cartes Rocketbox, simples
        // plans, se voient des deux côtés
        const rbh = n.startsWith('Hair_rb_');
        Object.assign(o.material, { transparent: false, depthWrite: true, alphaTest: rbh ? HAIR_CORE : 0.3, alphaToCoverage: !rbh, side: rbh ? THREE.DoubleSide : THREE.FrontSide, roughness: rbh ? 0.78 : 0.62 }); // (cartes Rocketbox : cœur opaque, pointes au second passage)
        softHair(o.material, n.startsWith('Hair_rb_'));
      }
      if (key === 'Eyes') { // cornée brillante : un reflet dans chaque œil
        Object.assign(o.material, { roughness: 0.08, envMapIntensity: 0.9 });
        o.castShadow = false;
        // (1.0.40) la paupière supérieure ombre le haut du globe, les coins de l'œil sont dans l'ombre des orbites
        o.material.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 en = normalize( vNormal );
    diffuseColor.rgb *= mix( 1.0, 0.62, smoothstep( 0.1, 0.42, en.y ) ) * mix( 1.0, 0.78, smoothstep( 0.32, 0.64, abs( en.x ) ) ); // (paupière : sans fermer l'œil, sinon le regard se renfrogne)
  }`);
        };
        o.material.customProgramCacheKey = () => 'footoff-yeux';
      }
      if (key === 'Brows' || key === 'Lashes') { // poils fins posés sur la peau : fondus
        Object.assign(o.material, { transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide });
        o.castShadow = false; o.renderOrder = 1;
      }
      if (key === 'Skin') { // (1.0.40 : peau plus mate, moins plastique ; ombres de contact)
        o.material.map = A.skins[1]; o.material.roughness = 0.6;
        if (A.ao) { o.material.aoMap = A.ao; o.material.aoMapIntensity = 1; }
        o.material.needsUpdate = true; paintable(o.material, u);
      }
      if (['Kit_Shirt', 'Kit_Shorts', 'Kit_Socks', 'Kit_Trim', 'Kit_Cuff'].includes(key)) { // tissu : maille, mat, peu de reflets
        Object.assign(o.material, { normalMap: A.knit, roughness: 0.86, envMapIntensity: 0.25 }); // (1.0.40 : moins de reflet gris : les dessous de manche restaient gris délavé)
        o.material.normalScale.set(0.22, 0.22); // (1.0.40 : maille plus douce, sans moirage au téléphone)
        // (1.0.40) l'envers du tissu, vu par l'ouverture d'une manche ou sous l'ourlet du short, reste dans l'ombre : il se
        // voyait plus clair que la cuisse
        o.material.onBeforeCompile = (sh) => {
          sh.vertexShader = `attribute float aBack;\nattribute float aFold;\nvarying float vBack;\nvarying float vFold;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBack = aBack;\n  vFold = aFold;')}`;
          sh.fragmentShader = `varying float vBack;\nvarying float vFold;\n${sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  float backK = gl_FrontFacing ? vBack : 1.0 - 0.55 * vFold;\n  diffuseColor.rgb *= mix( 1.0, 0.18, backK );').replace('#include <opaque_fragment>', 'outgoingLight *= mix( 1.0, 0.2, backK );\n  #include <opaque_fragment>')}`;
        };
        o.material.customProgramCacheKey = () => 'footoff-tissu';
      }
      if (key === 'Kit_Boots' || key === 'Kit_Sole') Object.assign(o.material, { roughness: 0.8, envMapIntensity: 0.6 }); // synthétique mat
      if (key === 'Band') { Object.assign(o.material, { roughness: 0.92, envMapIntensity: 0.2, map: null, normalMap: A.knit }); o.material.normalScale.set(0.35, 0.35); o.visible = false; } // bandeau (1.0.47) : tissu éponge mat, à maille, montré selon le portrait
      // (1.0.40) la semelle de la chaussure d'origine remonte sur le côté en une virgule claire, qu'on pourrait prendre pour un
      // logo d'équipementier : elle prend la couleur de la chaussure
      if (key === 'Kit_Sole') o.material.color.setHex(0x1d1d1d);
    });
    athletic(root);
    root.traverse((b) => { if (b.isBone && /^(index|middle|ring|pinky|thumb)_/.test(b.name)) b.userData.rest = b.quaternion.clone(); });
    // pose de construction du tronc, des épaules et des jambes, gardée pour les photos (1.0.42, PDG : « le buste est encore
    // beaucoup trop avancé, un creux dans le dos, les épaules trop en arrière ») : l'animation d'attente est une garde de
    // footballeur (un pied devant, cou et tête projetés de 14 à 18°) qui, en photo, bombait la poitrine et creusait le dos
    root.traverse((b) => { if (b.isBone && STANCE.has(b.name)) { b.userData.bind = b.quaternion.clone(); if (b.name === 'pelvis') b.userData.bindPos = b.position.clone(); } });
    // couche intérieure du maillot et de ses bords (1.0.40) : peinte comme la peau. Sous le tissu, elle ne se voit pas ; elle
    // ne paraissait qu'entre le col et le cou (une bande aux couleurs du maillot, une marche noire) ou au bord d'une manche
    // corps sous la tenue : le matériau de la peau, coloré par aIn (prepareInner) ; le pied sous la chaussure prend la
    // couleur de la chaussette (il dépassait en escalier noir au haut de la chaussure)
    const skinMat = mats.Skin?.[0];
    if (skinMat) {
      for (const o of meshes) {
        if (!['base_1', 'base_2', 'base_5'].includes(o.name)) continue;
        const old = o.material;
        o.material = skinMat;
        for (const k of ['Kit_Shirt', 'Kit_Shorts', 'Kit_Trim']) if (mats[k]) mats[k] = mats[k].filter((x) => x !== old);
      }
    }
    const foot = meshes.find((o) => o.name === 'base_4');
    if (foot && mats.Kit_Boots) {
      mats.Kit_Boots = mats.Kit_Boots.filter((x) => x !== foot.material); mats.FootIn = [foot.material];
      Object.assign(foot.material, { roughness: 0.85 });
      const boot = new THREE.Color(0x1d1d1d);
      foot.material.onBeforeCompile = (sh) => {
        sh.uniforms.uBoot = { value: boot };
        sh.vertexShader = `attribute float aFoot;\nvarying float vFoot;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFoot = aFoot;')}`;
        sh.fragmentShader = `uniform vec3 uBoot;\nvarying float vFoot;\n${sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix( uBoot, diffuseColor.rgb, vFoot );')}`;
      };
      foot.material.customProgramCacheKey = () => 'footoff-pied';
    }
    const sockM = meshes.find((o) => o.name === 'base_3');
    if (sockM?.geometry.attributes.aFoot) {
      const boot = new THREE.Color(0x1d1d1d);
      sockM.material.onBeforeCompile = (sh) => {
        sh.uniforms.uBoot = { value: boot };
        sh.vertexShader = `attribute float aFoot;\nvarying float vFoot;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFoot = aFoot;')}`;
        sh.fragmentShader = `uniform vec3 uBoot;\nvarying float vFoot;\n${sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix( uBoot, diffuseColor.rgb, vFoot );')}`;
      };
      sockM.material.customProgramCacheKey = () => 'footoff-chaussette';
    }
    parent.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const act = (g, name = g.name) => ({ ...g, name, a: mixer.clipAction(A.clips[name]), dur: A.clips[name].duration });
    const gaits = A.gaits.map((g) => act(g));
    // le gardien (premier de chaque onze) : son attente, appuis fléchis ; ses pas chassés de côté, puis la course de côté
    const keeper = i % 11 === 0;
    if (keeper && A.keeperGaits.idle) gaits[0] = act(gaits[0], A.keeperGaits.idle);
    const dg = {};
    for (const d of ['b', 'r', 'l']) {
      const own = keeper ? A.keeperGaits[d] || [] : [];
      dg[d] = [...own, ...A.dirGaits[d].filter((x) => !own.length || x.nat > own[own.length - 1].nat)].sort((a, b) => a.nat - b.nat).map((g) => act(g));
    }
    for (const g of [...gaits, ...dg.b, ...dg.r, ...dg.l]) { g.a.play(); g.a.timeScale = 0; g.a.setEffectiveWeight(0); }
    const legs = ['l', 'r'].map((s) => ({ thigh: root.getObjectByName(`thigh_${s}`), calf: root.getObjectByName(`calf_${s}`), foot: root.getObjectByName(`foot_${s}`), ball: root.getObjectByName(`ball_${s}`), lock: null, w: 0 }));
    const pelvis = root.getObjectByName('spine_01'); // l'inclinaison part du bas du dos : les jambes gardent leurs appuis
    const spine = LOOK_CHAIN.map(([n, share]) => [root.getObjectByName(n), share]);
    const idleBall = keeper && A.clips.GK_Idle_Ball ? mixer.clipAction(A.clips.GK_Idle_Ball) : null; // ballon serré dans les gants
    if (idleBall) { idleBall.play(); idleBall.setEffectiveWeight(0); }
    const mod = RETOUCHED.map((n) => root.getObjectByName(n));
    const p = { i, root, mixer, mats, hairs, brows, meshes, u, band: meshes.find((o) => (o.material.name || '').split('.')[0] === 'Band') || null, gaits, dg, legs, keeper, idleBall, holdW: 0, mod, base: mod.map(() => new THREE.Quaternion()), hasBase: false, pelvis, spine, k: 1, dirF: 1, dirR: 0, phase: 0, locoW: 1, fade: 0, shot: null, shotEnd: 0, prevKick: 0, cheering: false, pose: 0, speed: 0, height: BASE_H, seed: i + 1 };
    slots[i] = p;
    root.userData.player = p; // inspection (bancs d'essai)
    identity(p, identityOf({ id: `slot${i}` }, i % 11 === 0 ? 'G' : 'M'));
    return p;
  }
  function identity(p, id) {
    if (p.id && p.id.seed === id.seed && p.id.style === id.style && p.id.beard === id.beard && p.id.hair === id.hair) return;
    p.id = id; p.seed = id.seed; p.height = id.height;
    const f = id.face;
    const m = recipe(id);
    for (const o of p.meshes) bake(o, m);
    for (const o of p.meshes) if (o.userData.soft) { o.userData.soft.geometry = o.geometry; o.userData.soft.morphTargetInfluences = undefined; o.userData.soft.morphTargetDictionary = undefined; }
    const tex = skinTex(f.sk ?? 2, id.seed);
    for (const mat of p.mats.Skin || []) { mat.map = A.skins[tex]; mat.color.copy(skinTint(f.sk ?? 2, tex)); }
    // la coupe : l'une des coupes de sa coiffure, tirée par joueur ; cheveux crépus coupés court : peints ras
    const opts = MESH[id.style];
    let mesh = opts === undefined ? 'rb_short' : opts && opts[(id.seed >>> 5) % opts.length];
    { const hx0 = parseInt(String(id.hair).slice(1), 16); const hl0 = (0.2126 * ((hx0 >> 16) & 255) + 0.7152 * ((hx0 >> 8) & 255) + 0.0722 * (hx0 & 255)) / 255; if (mesh === 'rb_short' && hl0 < 0.25) mesh = 'rb_neat'; } // (cheveux foncés : la coupe courte en cartes se lisait comme une crête)
    if (id.style === 'curly' && (f.tx === 'coily' || toneOf(f.sk) === 2)) mesh = null;
    if (mesh && !p.hairs[mesh]) mesh = null; // (base sans cette coupe : cheveux peints)
    // cheveux noirs ou brun foncé (1.0.38) : les cartes MakeHuman faisaient un casque sombre et brillant, ils étaient peints
    // ras ; les coupes Rocketbox (1.0.47), aux mèches fines et transparentes, servent à toutes les couleurs
    // clarté des cheveux en sRGB (1.0.42 : la couleur three.js est linéaire)
    const hx = parseInt(String(id.hair).slice(1), 16); const hl = (0.2126 * ((hx >> 16) & 255) + 0.7152 * ((hx >> 8) & 255) + 0.0722 * (hx & 255)) / 255; // (sRGB, 0 à 1)
    const shortDark = !!mesh && !mesh.startsWith('rb_') && hl < 0.25; // (cheveux courts peints : plus denses et plus sombres qu'un crâne rasé)
    if (shortDark) mesh = null;
    for (const [k, o] of Object.entries(p.hairs)) { o.visible = k === mesh; if (o.userData.soft) o.userData.soft.visible = o.visible; }
    const sopt = mesh ? (SCALP_OF[mesh] ? [SCALP_OF[mesh]] : null) : SCALP_STYLE[id.style === 'curly' && f.tx !== 'coily' && toneOf(f.sk) !== 2 ? 'curlyStraight' : id.style];
    const scalpKey = sopt && sopt[(id.seed >>> 7) % sopt.length];
    p.u.scalpTex.value = scalpKey ? scalpTex(scalpKey) : NO_SCALP;
    p.u.scalpUse.value.set(scalpKey ? 1 : 0, id.style === 'receding' ? 1.3 : 1.1);
    // bandeau (1.0.47, PDG : « 3. Aussi ») : celui du portrait, à sa couleur (blanc, noir ou or)
    if (p.band) { p.band.visible = f.sg === 'band'; if (p.band.visible) p.band.material.color.set(BANDS[f.bc] || BANDS[0]).multiplyScalar(0.92); }
    for (const mat of p.mats.Hair || []) mat.color.set(id.hair).multiplyScalar(1.55); // (grain adouci : texture plus claire en moyenne)
    const eyes = A.eyeTex ||= eyeTextures(p.mats.Eyes?.[0]?.map);
    for (const mat of p.mats.Eyes || []) if (eyes) mat.map = eyes[irisOf(id)];
    // sourcils : jamais des sourcils d'épilation (le portrait « fin » prend la ligne normale, « normal » l'une ou l'autre)
    const bw = f.bw === 'thick' || (f.bw !== 'fine' && id.seed % 3 === 0) ? 'thick' : 'normal';
    for (const [k, o] of Object.entries(p.brows)) o.visible = k === bw;
    for (const mat of p.mats.Brows || []) mat.color.set(id.brow).multiplyScalar(2);
    // cils (1.0.40) : de la couleur des sourcils, assombrie (gris clair, ceux du bas faisaient une frange blanche sous l'œil)
    for (const mat of p.mats.Lashes || []) mat.color.set(id.brow).multiplyScalar(0.55);
    // barbe : celle du portrait ; un adulte imberbe garde une ombre de barbe
    const [bR, bG, bB] = id.beard === 'none' && id.age >= 21 ? [0.27, 0, 0] : BEARD[id.beard] || BEARD.none; // (1.0.40 : ombre de barbe plus marquée, un visage d'homme et non de mannequin)
    // cheveux ras : partout sous une coupe (la lisière se fond), pleine densité sans coupe
    p.u.beard.value.set(bR, bG, bB, SCALP[id.style] ?? (mesh ? 0.9 : 0.95));
    // poils : plus sombres que la peau ; barbe à la couleur des cheveux (assombrie), cheveux ras plus sombres encore
    // (racines, ombre) ; sauf le gris d'un grisonnant, qui échappe à ce plafond en proportion (1.0.46 : sur peau foncée, il
    // sortait presque noir, loin du gris de son portrait)
    const skinL = lum(new THREE.Color(FACE_MEAN[tex]).multiply(skinTint(f.sk ?? 2, tex)));
    // (relecture de la 1.0.45 : une barbe tirée d'un blond cendré virait au kaki sur peau claire) : jamais plus verte que
    // rouge, tirée vers le brun
    // les cheveux clairs (blond, blond cendré) donnent une barbe plus rousse et plus brune que la chevelure, comme dans la
    // réalité : sans cela, un blond doré mêlé à une peau rosée virait au kaki
    // (relecture de la 1.0.46 : un test de clarté prenait le gris d'un grisonnant pour du blond, et sa barbe brunissait) :
    // les deux blonds de la palette seulement, et un grisonnant garde le gris de son portrait, en proportion
    const blond = f.hc === 4 || f.hc === 6;
    const warm = (c) => {
      const o = c.clone();
      if (blond) c.lerp(new THREE.Color(0x6a3f22).multiplyScalar(c.r / 0.11), 0.5);
      if (c.g > c.r * 0.82) c.g = c.r * 0.82; if (c.b > c.g * 0.7) c.b = c.g * 0.7;
      return c.lerp(o, id.grey || 0);
    };
    const greyK = id.grey || 0;
    const tone = (k, capK) => { const c = warm(new THREE.Color(id.beardCol).multiplyScalar(k)); const cap = capK * skinL; const L = lum(c); if (L > cap) c.multiplyScalar(cap / L + (1 - cap / L) * greyK); return c; };
    p.u.hair.value.copy(tone(0.75, 0.55));
    const sc = tone(0.55, 0.42);
    p.u.scalp.value.copy(sc.lerp(new THREE.Color().setScalar(lum(sc)), 0.45)); // ras : moins saturé (jamais une calotte rousse)
    // sous une coupe en cartes, la lisière peinte prend la teinte des cartes (1.0.42 : une bande brune tachetée
    // apparaissait entre les cheveux roux ou châtains et le front)
    // (jamais plus clair que le front : même plafond que les poils peints ; le gris d'un grisonnant y échappe en proportion)
    // (1.0.47) cheveux peints d'une coupe Rocketbox : la couleur des cheveux, comme ses mèches (plus la teinte sombre des racines
    // d'un crâne ras : des cheveux châtains peints sortaient presque noirs, en bonnet)
    if (mesh || scalpKey) { const c = new THREE.Color(id.hair).multiplyScalar(1.15); const cap = 0.42 * skinL; const L = lum(c); if (L > cap) c.multiplyScalar(cap / L + (1 - cap / L) * greyK); p.u.scalp.value.copy(c); }
    // cheveux peints (1.0.42, PDG : cohérence avec le portrait) : une vraie chevelure du portrait (tout sauf ras, rasé,
    // très court ou dégarni) reste pleine en 3D, et foncée si elle est brune ou noire ; le crâne transparaissait, tous
    // paraissaient châtain clair, mèches et afros compris. Cheveux noirs ou bruns coupés court : jamais une brosse rousse.
    const full = !mesh && !THIN.has(id.style);
    if (!mesh && !scalpKey && hl < 0.25) p.u.scalp.value.multiplyScalar(0.5); // (pas sous une peinture Rocketbox : son dessin se perdrait dans le noir)
    if (full) p.u.beard.value.w = 1.7;
    else if (shortDark) p.u.beard.value.w = 1;
  }
  function gesture(p, name, { fade = 0.18, at = 0 } = {}) {
    if (p.shot) p.shot.fadeOut(fade);
    const a = p.mixer.clipAction(A.clips[name]);
    a.reset(); a.timeScale = 1; a.time = Math.max(0, at); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
    p.shot = a; p.fade = -1 / fade; p.shotEnd = A.ends?.[name] ?? A.clips[name].duration; p.noIK = A.lying.has(name); p.frozen = false;
  }
  function endGesture(p, fade = 0.3) { if (p.shot) { p.shot.fadeOut(fade); p.shot = null; } p.fade = 1 / fade; }
  // Mélange des allures (0.8.24) : dans chaque direction (de face, à reculons, à droite, à gauche), la vitesse réelle
  // choisit l'allure ; le sens du déplacement dans le repère du joueur dose les directions (cos², sin²). Toutes partagent
  // une même phase, alignée sur la pose du pied gauche : cadence = distance / foulée moyenne. Une direction sans allure
  // revient à la course de face (jouée à rebours pour reculer, comme avant).
  function loco(p, dt) {
    const v = p.speed; const g = p.gaits;
    const n = Math.hypot(p.dirF, p.dirR) || 1; const cf = p.dirF / n; const sr = p.dirR / n;
    const wd = { f: cf > 0 ? cf * cf : 0, b: cf < 0 ? cf * cf : 0, r: sr > 0 ? sr * sr : 0, l: sr < 0 ? sr * sr : 0 };
    let rev = false;
    for (const d of ['b', 'r', 'l']) if (!p.dg[d].length && wd[d] > 0) { if (d === 'b') rev = true; wd.f += wd[d]; wd[d] = 0; }
    const w = new Map(); let idle = 0;
    const blend = (set, wDir) => {
      if (wDir <= 0 || !set.length) return;
      const nat = (x) => x.nat * p.k;
      if (v < 0.05) { idle += wDir; return; }
      // sous la foulée la plus lente : elle est jouée au ralenti (la cadence suit la vitesse, le pied posé recule avec
      // le corps) ; le mélange avec l'attente, où le pied posé reculait moins vite que le corps et glissait, ne reste
      // qu'aux très faibles vitesses (moins de 45 % de la foulée)
      if (v < nat(set[0])) {
        const f = Math.min(1, Math.max(0, (v - 0.12 * nat(set[0])) / (0.33 * nat(set[0]))));
        idle += wDir * (1 - f); w.set(set[0], (w.get(set[0]) || 0) + wDir * f); return;
      }
      let i = 0;
      while (i < set.length - 1 && v > nat(set[i + 1])) i++;
      if (i < set.length - 1) {
        const f = (v - nat(set[i])) / (nat(set[i + 1]) - nat(set[i]));
        w.set(set[i], (w.get(set[i]) || 0) + wDir * (1 - f)); w.set(set[i + 1], (w.get(set[i + 1]) || 0) + wDir * f);
      } else w.set(set[i], (w.get(set[i]) || 0) + wDir);
    };
    blend(g.slice(1), wd.f);
    for (const d of ['b', 'r', 'l']) blend(p.dg[d], wd[d]);
    let stride = 0; let tw = 0;
    for (const [x, wx] of w) { stride += wx * x.nat * p.k * x.dur; tw += wx; }
    // à reculons sans allure de recul (p.back) : la foulée de face se rejoue à rebours
    if (tw > 0) p.phase = ((p.phase + (((rev && p.back > 0.5) ? -1 : 1) * v * dt) / (stride / tw)) % 1 + 1) % 1;
    g[0].a.time = (g[0].a.time + dt) % g[0].dur;
    // gardien ballon en mains : son attente, ballon serré (0.8.24)
    p.holdW += ((p.holding && p.idleBall ? 1 : 0) - p.holdW) * Math.min(1, dt * 6);
    g[0].a.setEffectiveWeight(idle * (1 - p.holdW) * p.locoW);
    if (p.idleBall) p.idleBall.setEffectiveWeight(idle * p.holdW * p.locoW);
    for (const x of [...g.slice(1), ...p.dg.b, ...p.dg.r, ...p.dg.l]) {
      const wx = w.get(x) || 0;
      if (wx > 0) x.a.time = p.phase * x.dur;
      x.a.setEffectiveWeight(wx * p.locoW);
    }
    const on = (iv) => iv.some(([a, b]) => (a <= b ? p.phase >= a && p.phase <= b : p.phase >= a || p.phase <= b));
    let cl = 0; let cr = 0;
    for (const [x, wx] of w) { cl += wx * on(x.contacts.l); cr += wx * on(x.contacts.r); }
    p.contact = tw > 0.5 ? { l: cl / tw > 0.5, r: cr / tw > 0.5 } : { l: true, r: true };
  }
  const aim = (bone, from, to) => {
    const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
    bone.updateMatrixWorld(true);
  };
  // Inclinaison (0.8.24) : dans un virage, le buste penche vers l'intérieur (accélération centripète v·ω, 12° au plus) ;
  // il se penche en avant quand il accélère, en arrière quand il freine (8° au plus). Elle part du bas du dos : incliner
  // le bassin écartait les jambes de leurs appuis (glisse mesurée en hausse de moitié).
  const qa = new THREE.Quaternion(); const qb = new THREE.Quaternion(); const axF = V(); const axS = V(); const UP = new THREE.Vector3(0, 1, 0);
  // rotation monde q appliquée à un os (sans recalculer tout le squelette en dessous : chaque lecture de position ou
  // d'orientation monde remet à jour la chaîne de ses parents, et le rendu met tout à jour une fois)
  const wq0 = new THREE.Quaternion(); const pq0 = new THREE.Quaternion(); const q0c = new THREE.Quaternion();
  const toBody = (bone, q) => {
    bone.getWorldQuaternion(wq0);
    bone.parent.getWorldQuaternion(pq0);
    bone.quaternion.copy(pq0.invert().multiply(q0c.copy(q).multiply(wq0)));
  };
  function bodyLean(p, ag, dt) {
    const h = ag.h;
    if (p.lh === undefined || dt <= 0) { p.lh = h; p.lv = p.speed; p.roll = p.roll || 0; p.pitch = p.pitch || 0; return; }
    const om = Math.atan2(Math.sin(h - p.lh), Math.cos(h - p.lh)) / dt;
    const acc = (p.speed - p.lv) / dt;
    p.lh = h; p.lv = p.speed;
    const free = !p.shot && p.locoW > 0.5 && !(ag.lift > 0.002); // un geste a sa propre posture
    const rollT = free ? clamp(Math.atan2(p.speed * om, 9.81) * 0.7, -0.21, 0.21) : 0;
    const pitchT = free ? clamp(Math.atan2(acc, 9.81) * 0.6, -0.12, 0.14) : 0;
    const k = Math.min(1, dt * 7);
    p.roll += (rollT - p.roll) * k; p.pitch += (pitchT - p.pitch) * k;
    if (Math.abs(p.roll) < 1e-3 && Math.abs(p.pitch) < 1e-3) return;
    axF.set(Math.cos(h), 0, Math.sin(h)); axS.set(-Math.sin(h), 0, Math.cos(h));
    toBody(p.pelvis, qa.setFromAxisAngle(axF, p.roll).multiply(qb.setFromAxisAngle(axS, -p.pitch)));
  }
  // Regard (0.8.24) : chacun suit le ballon de la tête et du haut du corps (75° de côté, 35° en hauteur au plus), réparti
  // du dos à la tête ; pas pendant un geste qui a son propre regard (frappe, plongeon, joie). Avant, tous regardaient
  // droit devant eux.
  const hp = V(); const toB = V();
  function gaze(p, ag, dt) {
    const want = look && !p.shot && !p.cheering && p.locoW > 0.5 ? 1 : 0;
    p.gw = (p.gw || 0) + (want - (p.gw || 0)) * Math.min(1, dt * 4);
    if (p.gw < 0.01 || !look) return;
    const h = ag.h;
    p.spine[p.spine.length - 1][0].getWorldPosition(hp);
    toB.subVectors(look, hp);
    const flat = Math.hypot(toB.x, toB.z);
    const yawT = clamp(Math.atan2(Math.sin(Math.atan2(toB.z, toB.x) - h), Math.cos(Math.atan2(toB.z, toB.x) - h)), -1.3, 1.3);
    const pitchT = clamp(Math.atan2(toB.y, Math.max(flat, 1e-4)), -0.6, 0.5);
    const k = Math.min(1, dt * 6);
    p.yaw = (p.yaw ?? yawT) + (yawT - (p.yaw ?? yawT)) * k; p.lookUp = (p.lookUp ?? pitchT) + (pitchT - (p.lookUp ?? pitchT)) * k;
    axS.set(-Math.sin(h), 0, Math.cos(h));
    // (cap moteur : h croît vers +z ; autour de la verticale, un angle positif tourne de +x vers -z, d'où le signe)
    for (const [bone, share] of p.spine) toBody(bone, qa.setFromAxisAngle(UP, -p.yaw * share * p.gw).multiply(qb.setFromAxisAngle(axS, p.lookUp * share * p.gw)));
  }
  let look = null; // le ballon que tous regardent (null : regard libre)

  // Verrou des appuis (0.8.24, chantier « course et appuis » du PDG) : c'est la pointe du pied posée qui reste fixée au
  // sol, dès qu'elle le touche ; le talon se déroule et pivote autour d'elle (un appui de footballeur), la jambe s'ajuste.
  // Avant, la cheville était verrouillée et en 70 ms : la pointe balayait la pelouse en course et dans les virages (un
  // appui sur trois glissait à vue). Une pointe sous la pelouse est remontée au ras du sol.
  function footIK(p, dt) {
    const lying = p.noIK && p.shot; // couché (plongeon…) : pas d'appui verrouillé, seulement les pieds remontés au ras du sol
    if (lying) for (const L of p.legs) { L.lock = null; L.w = 0; L.free = false; L.held = false; }
    const s = p.root.scale.x; // échelle monde du modèle
    const g = p.ground ?? 0; // niveau de la pelouse
    const air = lying || (p.ag?.lift || 0) > 0.002; // saut (tête), couché : pas d'appui
    p.legs.forEach((L, li) => {
      const A0 = L.foot.getWorldPosition(V()); const B = L.ball.getWorldPosition(V());
      // 1.0.29 (audit des déplacements : le verrou tenait le pied jusqu'à 50 cm de l'animation puis le relâchait d'un coup
      // en 83 ms ; un pied bas restait sans verrou entre deux marqueurs) : posé = pointe animée basse et lente, levé =
      // haute ou rapide (hystérésis) ; le verrou suit l'animation en douceur (0,12 m/s au-delà d'une zone morte de 4 cm,
      // plus vite au-delà de 15 cm) et ne se relâche que pied levé, en 0,15 s ; un nouvel appui part de la cible actuelle
      const vB = L.prevB ? Math.hypot(B.x - L.prevB.x, B.z - L.prevB.z) / Math.max(dt, 1e-3) : Infinity;
      L.prevB = B.clone();
      const hB = B.y - g;
      const down = !air && hB < 0.025 * s && vB < 1.2 * s;
      const up = air || hB > 0.045 * s || vB > 2.5 * s;
      if (L.lock && !L.free) {
        const dx = B.x - L.lock.x, dz = B.z - L.lock.z, dd = Math.hypot(dx, dz);
        const m = dd < 0.004 ? 0 : Math.min(dd, (0.12 * s + 3 * Math.max(0, dd - 0.015)) * dt);
        if (dd > 1e-9) { L.lock.x += (dx / dd) * m; L.lock.z += (dz / dd) * m; }
        if (up) L.free = true;
      }
      if (down && (!L.lock || L.free)) {
        const cur = L.lock && L.w > 0 ? L.lock.clone().lerp(B, 1 - L.w) : B.clone();
        L.lock = cur; L.free = false; L.w = 1;
      }
      if (L.lock && L.free) { L.w -= dt / 0.15; if (L.w <= 0) { L.w = 0; L.lock = null; } }
      let T = null; let w = 0;
      if (L.lock && L.w > 0) { T = new THREE.Vector3(L.lock.x, Math.max(B.y, g - 0.004 * s), L.lock.z); w = L.w; }
      else if (B.y < g - 0.01 * s) { T = new THREE.Vector3(B.x, g, B.z); w = 1; } // pied en l'air sous la pelouse
      if (!T) return;
      const q0 = [L.thigh.quaternion.clone(), L.calf.quaternion.clone(), L.foot.quaternion.clone()];
      T.sub(B).add(A0); // la cheville là où la pointe tombe sur sa cible, le pied gardant son orientation
      const H = L.thigh.getWorldPosition(V()); const K = L.calf.getWorldPosition(V());
      const l1 = K.distanceTo(H); const l2 = A0.distanceTo(K);
      const d = Math.min(T.distanceTo(H), l1 + l2 - 1e-5);
      const dir = T.clone().sub(H).normalize();
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
      const pole = K.clone().sub(H); pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
      if (pole.lengthSq() < 1e-12) pole.set(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
      pole.normalize();
      const K2 = H.clone().addScaledVector(dir, along).addScaledVector(pole, h);
      const fq = L.foot.getWorldQuaternion(new THREE.Quaternion());
      aim(L.thigh, K.clone().sub(H), K2.clone().sub(H));
      const K3 = L.calf.getWorldPosition(V()); const A3 = L.foot.getWorldPosition(V());
      aim(L.calf, A3.sub(K3), T.clone().sub(K3));
      L.foot.quaternion.copy(L.foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(fq));
      if (w < 1) [L.thigh, L.calf, L.foot].forEach((b, j) => b.quaternion.copy(q0[j].slerp(b.quaternion, w)));
      L.thigh.updateMatrixWorld(true);
    });
  }
  // IK à deux os (1.0.18) : amène l'os du bout (cheville, poignet) en T (monde), le genou ou le coude gardant le plan
  // où il plie ; le bout garde son orientation monde ; w dose le geste capté et la correction.
  const iq = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  function twoBone(top, mid, end, T, w, poleHint = null) {
    if (w <= 0.001) return;
    iq[0].copy(top.quaternion); iq[1].copy(mid.quaternion); iq[2].copy(end.quaternion);
    const Hp = top.getWorldPosition(V()); const K = mid.getWorldPosition(V()); const E = end.getWorldPosition(V());
    const l1 = K.distanceTo(Hp); const l2 = E.distanceTo(K);
    const d = Math.max(1e-5, Math.min(T.distanceTo(Hp), l1 + l2 - 1e-5));
    const dir = T.clone().sub(Hp).normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const pole = (poleHint ? poleHint.clone() : K.clone().sub(Hp)); pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pole.lengthSq() < 1e-12) pole.set(0, 1, 0);
    pole.normalize();
    const K2 = Hp.clone().addScaledVector(dir, along).addScaledVector(pole, h);
    const eq = end.getWorldQuaternion(new THREE.Quaternion());
    aim(top, K.clone().sub(Hp), K2.clone().sub(Hp));
    const K3 = mid.getWorldPosition(V()); const E3 = end.getWorldPosition(V());
    aim(mid, E3.sub(K3), T.clone().sub(K3));
    end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(eq));
    // dosage (1.0.25) : du geste capté (iq) vers la pose corrigée. slerpQuaternions(a, b) copie a dans le quaternion
    // avant de lire b : appelé avec b = ce même quaternion, il rendait le geste capté tel quel. Toute correction dosée
    // sous 100 % était annulée (le contrôle de la 1.0.23, les mains du gardien hors de l'instant exact du contact)
    if (w < 1) for (const [j, bone] of [top, mid, end].entries()) bone.quaternion.copy(iq[j].slerp(bone.quaternion, w));
    top.updateMatrixWorld(true);
  }
  // Contact de la frappe (1.0.18, chantier du PDG : « les joueurs frappent à côté du ballon ») : autour du contact du
  // geste (0,16 s avant, 0,1 s après), le pied qui frappe va au ballon (la pointe là où le geste capté l'aurait mise par
  // rapport au ballon) ; jamais au-delà d'une jambe tendue.
  // 1.0.25 : le geste entier est décalé de l'écart qu'il aurait au contact (la pointe du geste capté au contact, comparée à
  // celle qui touche ce ballon) ; avant, la cheville était tirée vers sa place du contact dès 0,16 s avant : le pied y
  // arrivait trop tôt, la jambe traversait le ballon (mesuré une fois le dosage réparé)
  function strikeIK(p) {
    const c = p.kickC;
    if (!c || !look) return;
    if (!p.shot || p.shot.getClip().name !== c.name) { p.kickC = null; return; }
    const x = p.shot.time - c.t;
    const w = x < -0.22 || x > 0.08 ? 0 : x < 0 ? smooth(1 + x / 0.22) : smooth(1 - x / 0.08);
    if (w <= 0.001) return;
    const L = p.legs[c.foot === 'l' ? 0 : 1];
    const s = p.root.scale.x;
    const C = A.contact[c.name];
    const q = p.root.quaternion;
    // après le contact, le pied passe là où était le ballon (il ne le poursuit plus : audit, la chaussure suivait le ballon
    // qui part et restait dedans sur les passes lentes)
    if (x >= 0 && !c.hit) c.hit = look.clone();
    const ball = x >= 0 ? c.hit : look;
    const toeC = C.ball.clone().sub(C.fromToe).multiplyScalar(s).applyQuaternion(q).add(p.root.position); // pointe du geste au contact
    const toeT = ball.clone().sub(C.fromToe.clone().multiplyScalar(s).applyQuaternion(q)); // la pointe qui touche ce ballon
    const ankle = L.foot.getWorldPosition(V());
    const T = ankle.add(toeT.sub(toeC)); // la cheville de l'instant, décalée de l'écart du contact
    const hip = L.thigh.getWorldPosition(V());
    const reach = (L.calf.getWorldPosition(V()).distanceTo(hip) + L.foot.getWorldPosition(V()).distanceTo(L.calf.getWorldPosition(V()))) * 1.02;
    const far = T.distanceTo(hip) - reach;
    const k = far > 0 ? Math.max(0, 1 - far / (0.25 * s)) : 1; // ballon hors de portée : la correction s'efface
    twoBone(L.thigh, L.calf, L.foot, T, w * k);
  }
  // Contrôle (1.0.23, chantier du PDG : « passes et contrôles ») : à la réception d'une passe au sol, le pied du côté du
  // ballon va à sa rencontre (0,18 s avant le contact annoncé par le moteur, 0,2 s après) et l'amortit de l'intérieur ;
  // jamais pendant un geste, jamais au-delà d'une jambe tendue
  const BALL_R = 0.011; // rayon du ballon (unités du jeu)
  function receiveIK(p) {
    const ag = p.ag;
    if (!look || !ag || p.shot || !(ag.recvIn > -0.25)) return;
    const x = -ag.recvIn; // temps depuis le contact (négatif : avant)
    const w = x < -0.18 || x > 0.2 ? 0 : x < 0 ? smooth(1 + x / 0.18) : smooth(1 - x / 0.2);
    if (w <= 0.001) return;
    const dx = look.x - ag.x, dz = look.z - ag.z;
    const right = dx * -Math.sin(ag.h) + dz * Math.cos(ag.h) > 0;
    const L = p.legs[right ? 1 : 0]; // le ballon à sa droite : le pied droit
    // 1.0.25 : l'intérieur du pied contre le ballon (le pied à côté de lui, le ballon à hauteur de la voûte), au lieu de la
    // cheville posée devant le ballon : la pointe, devant la cheville, entrait dans le ballon (correction réparée, mesurée)
    const sg = right ? 1 : -1; const s = p.root.scale.x;
    const sx = -Math.sin(ag.h) * sg, sz = Math.cos(ag.h) * sg; // vers l'extérieur du pied qui contrôle
    const fx = Math.cos(ag.h), fz = Math.sin(ag.h);
    const side = BALL_R + 0.045 * s, back = 0.09 * s; // 4,5 cm (demi-pied) ; 9 cm (cheville → voûte)
    const T = V().set(look.x + sx * side - fx * back, look.y - BALL_R + 0.009, look.z + sz * side - fz * back);
    const hip = L.thigh.getWorldPosition(V()); const knee = L.calf.getWorldPosition(V());
    const reach = (knee.distanceTo(hip) + L.foot.getWorldPosition(V()).distanceTo(knee)) * 1.02;
    const far = T.distanceTo(hip) - reach;
    const k = far > 0 ? Math.max(0, 1 - far / (0.25 * p.root.scale.x)) : 1; // ballon hors de portée : la correction s'efface
    twoBone(L.thigh, L.calf, L.foot, T, w * k * 0.85);
  }
  // Les mains du gardien (1.0.18, chantier du PDG : « le ballon le frappe au milieu du corps ») : autour du contact de
  // l'arrêt, les gants vont au ballon (les deux mains de part et d'autre pour une prise, la main la plus proche derrière le
  // ballon pour une parade) ; ensuite le ballon capté reste entre ses gants (ballAnchor).
  const sideV = V(); const toBall = V();
  // 1.0.25 : les gants partent plus tôt vers le ballon (0,3 s avant le contact) ; une prise garde le ballon dans les gants
  // et les mains le ramènent vers le corps en 0,35 s (le ballon suit les mains, matchplay.js), au lieu de lâcher le ballon
  // en 0,12 s pour la pose du geste ; un ballon hors de portée tend le bras vers lui (la correction ne s'efface qu'au-delà de
  // 60 cm, contre 35) ; le geste en attente de son départ garde son contact (il était perdu : aucune main au ballon)
  function keeperIK(p) {
    const c = p.saveC;
    if (!c || !look || !p.keeper || c.beaten) return; // (1.0.33) battu : ses mains ne vont pas chercher le ballon qui le passe
    if (p.pending?.name === c.name) return;
    if (!p.shot || p.shot.getClip().name !== c.name) { p.saveC = null; return; }
    const x = p.shot.time - c.t;
    const post = c.catch ? 0.35 : c.palms ? 0.28 : 0.12;
    const w = x < -0.3 || x > post ? 0 : x < 0 ? smooth(1 + x / 0.3) : smooth(1 - x / post);
    if (w <= 0.001) return;
    const s = p.root.scale.x;
    const R = 0.011; // rayon du ballon (unités du jeu : 11 cm)
    const h = p.ag.h;
    sideV.set(-Math.sin(h), 0, Math.cos(h)); // sa droite
    for (const k of [0, 1]) {
      const sfx = k ? '_r' : '_l';
      const up = p.root.getObjectByName(`upperarm${sfx}`); const lo = p.root.getObjectByName(`lowerarm${sfx}`); const ha = p.root.getObjectByName(`hand${sfx}`);
      if (!up || !lo || !ha) continue;
      const hp = ha.getWorldPosition(V());
      let T;
      if (c.catch) { // prise : une main de chaque côté du ballon, un peu derrière
        T = look.clone().addScaledVector(sideV, (k ? 1 : -1) * (R + 0.035 * s)).addScaledVector(V().set(Math.cos(h), 0, Math.sin(h)), -0.02 * s);
      } else if (c.palms) { // parade des deux mains face au tir (1.0.31 : une seule main montait) : paumes côte à côte derrière le ballon
        T = look.clone().addScaledVector(sideV, (k ? 1 : -1) * 0.6 * R).addScaledVector(V().set(Math.cos(h), 0, Math.sin(h)), -(R + 0.025 * s));
      } else { // parade : la main derrière le ballon, côté corps
        toBall.subVectors(look, hp); const dd = toBall.length() || 1;
        T = look.clone().addScaledVector(toBall, -(R + 0.03 * s) / dd);
        // la main la plus loin du ballon ne force pas
        const other = p.root.getObjectByName(`hand${k ? '_l' : '_r'}`).getWorldPosition(V());
        if (other.distanceTo(look) < hp.distanceTo(look) - 0.05 * s) continue;
      }
      const sh = up.getWorldPosition(V());
      const reach = (lo.getWorldPosition(V()).distanceTo(sh) + ha.getWorldPosition(V()).distanceTo(lo.getWorldPosition(V()))) * 1.05;
      const far = T.distanceTo(sh) - reach;
      const kk = far > 0 ? Math.max(0, 1 - far / (0.6 * s)) : 1;
      twoBone(up, lo, ha, T, w * kk, V().set(0, -1, 0).addScaledVector(sideV, k ? 0.5 : -0.5));    }
  }
  // la tête au ballon (1.0.32) : autour du contact du geste « Header », le buste, le haut du dos puis le cou se penchent
  // pour que le front aille au ballon (le geste capté est joué sur place, le moteur prend la tête à 60 cm près : sans
  // cela, le ballon repartait au-dessus de la tête ou à côté)
  const hdA = V(), hdB = V(), hdP = V(), hdT = V(), hdU = V(), hdQ = new THREE.Quaternion(), hdI = new THREE.Quaternion();
  const HEAD_CHAIN = [['spine_02', 0.4, 0.3], ['spine_03', 0.5, 0.3], ['neck_01', 1, 0.45]]; // os, part du reste, angle max (rad)
  function headIK(p) {
    if (!look || !p.shot || p.shot.getClip() !== A.clips.Header) return;
    const x = p.shot.time - A.marks.Header;
    const w = x < -0.25 || x > 0.18 ? 0 : x < 0 ? smooth(1 + x / 0.25) : smooth(1 - x / 0.18);
    if (w <= 0.001) return;
    const s = p.root.scale.x;
    const head = p.root.getObjectByName('head');
    for (const [name, share, maxA] of HEAD_CHAIN) {
      const bone = p.root.getObjectByName(name);
      if (!bone) continue;
      p.root.updateMatrixWorld(true);
      head.getWorldPosition(hdA); hdA.y += 0.09 * s; // centre de la tête (l'os est à la base du crâne)
      hdB.subVectors(look, hdA);
      const dist = hdB.length(); const touch = 0.011 + 0.1 * s; // rayon du ballon + celui de la tête
      if (dist <= touch) break;
      hdT.copy(hdA).addScaledVector(hdB, (dist - touch) / dist); // où doit venir le centre de la tête
      bone.getWorldPosition(hdP);
      hdU.subVectors(hdA, hdP).normalize(); hdB.subVectors(hdT, hdP).normalize();
      hdQ.setFromUnitVectors(hdU, hdB);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(hdQ.w)));
      const f = Math.min(share, maxA / Math.max(ang, 1e-6)) * w;
      toBody(bone, hdI.identity().slerp(hdQ, f));
    }
  }
  // gestes d'après l'état de l'agent du moteur (matchplay.js)
  function drive(p, ag, dt) {
    // vitesse réelle : le déplacement de l'agent (ralentis compris), jamais une consigne ; un saut de position (changement
    // de plan) reprend la vitesse du moteur
    const d = p.lx === undefined ? Infinity : Math.hypot(ag.x - p.lx, ag.z - p.lz) * 10; // unités du jeu (10 m) -> m
    // à reculons (0.8.20, remarque du PDG : des joueurs glissaient à l'envers) : le déplacement contre le regard fait
    // jouer la foulée à rebours, un pas en arrière, au lieu d'une course en avant qui glisse vers l'arrière
    if (d < 3 && d > 1e-4) {
      const fwd = ((ag.x - p.lx) * Math.cos(ag.h) + (ag.z - p.lz) * Math.sin(ag.h)) * 10 / d;
      const rgt = ((ag.x - p.lx) * -Math.sin(ag.h) + (ag.z - p.lz) * Math.cos(ag.h)) * 10 / d; // (côté droit du modèle)
      p.back = (p.back || 0) + ((fwd < -0.35 ? 1 : 0) - (p.back || 0)) * Math.min(1, dt * 10);
      const k = Math.min(1, dt * 10); // sens du déplacement dans le repère du joueur, lissé
      p.dirF += (fwd - p.dirF) * k; p.dirR += (rgt - p.dirR) * k;
    }
    p.lx = ag.x; p.lz = ag.z;
    const v = d > 3 ? (ag.speed || 0) * 10 : d / Math.max(dt, 1e-4);
    p.speed = d > 3 ? v : p.speed + (v - p.speed) * Math.min(1, dt * 12);
    if (ag.kick > 0 && p.prevKick === 0) { // frappe : le contact du clip tombe au contact du moteur
      const name = ag.kickKind === 'shot' ? (ag.foot === 'r' && A.contact.Shot_R ? 'Shot_R' : 'Shot') : (ag.foot === 'l' && A.contact.Pass_L ? 'Pass_L' : 'Pass');
      // (la frappe démarre en cours de geste quand le moteur la lance tard : le contact reste calé)
      // (1.0.25 : moins une image, celle que le mélangeur ajoute dès cette image-ci ; le geste avait une image d'avance)
      gesture(p, name, { at: A.marks[name] - (KICK_CONTACT - Math.min(KICK_CONTACT, ag.kick)) * KICK_TIME - dt, fade: 0.12 });
      p.kickC = { name, foot: A.contact[name].foot, t: A.marks[name] };
    }
    p.prevKick = ag.kick || 0;
    const pose = Math.floor(ag.pose || 0);
    p.holding = p.keeper && pose === 3;
    // la faute : le fautif glisse sur le porteur (contact calé sur celui du moteur) puis se relève ; le porteur trébuche
    // sur le tacle et reste au sol
    if (ag.tackleId && ag.tackleId !== p.tackleSeen && A.clips.Foul_Tackle) {
      p.tackleSeen = ag.tackleId;
      const off = A.marks.Foul_Tackle - (ag.tackleLead || 0);
      if (off >= 0) gesture(p, 'Foul_Tackle', { at: off, fade: 0.12 }); else p.pending = { name: 'Foul_Tackle', wait: -off };
      // le tacle capté se termine debout : un seul relevé (audit, 0.8.24 : enchaîné au relevé de Mixamo, qui part du
      // sol, le fautif se relevait deux fois)
    }
    // la tête (1.0.22) : le contact du geste tombe à l'arrivée du ballon annoncée par le moteur ; le saut reste celui du
    // moteur (le geste est pris sur place)
    if (ag.headId && ag.headId !== p.headSeen && A.clips.Header) {
      p.headSeen = ag.headId;
      const off = A.marks.Header - (ag.headLead || 0);
      if (off >= 0) gesture(p, 'Header', { at: off, fade: 0.12 }); else p.pending = { name: 'Header', wait: -off };
    }
    // (1.0.31) le geste reste calé sur l'arrivée du ballon, que le moteur réévalue à chaque image (le receveur lit la
    // trajectoire) : le geste accélère ou ralentit un peu pour que la tête frappe quand le ballon est là
    if (p.shot && p.headSeen === ag.headId && ag.headId && p.shot.getClip() === A.clips.Header) {
      const want = A.marks.Header - (ag.headLead || 0);
      if (p.shot.time < A.marks.Header + 0.05 && (ag.headLead || 0) > -0.05) p.shot.timeScale = Math.min(1.6, Math.max(0.6, 1 + 3 * (want - p.shot.time)));
      else p.shot.timeScale = 1;
    }
    // geste annoncé par le moteur (1.0.28 : relance du gardien) : son instant clé (marks) tombe cueLead secondes après
    if (ag.cueId && ag.cueId !== p.cueSeen && A.clips[ag.cueName]) {
      p.cueSeen = ag.cueId;
      const off = (A.marks[ag.cueName] ?? 0) - (ag.cueLead || 0);
      if (off >= 0) gesture(p, ag.cueName, { at: off, fade: 0.2 }); else p.pending = { name: ag.cueName, wait: -off };
    }
    if (Math.abs(ag.roll || 0) > 0.5 && !p.fell && A.clips.Foul_Fall) {
      p.fell = true;
      gesture(p, 'Foul_Fall', { at: A.marks.Foul_Fall, fade: 0.1 });
    }
    if (Math.abs(ag.roll || 0) < 0.2) {
      p.fell = false;
      // le moteur ne relève jamais le porteur pendant l'action : c'est l'action suivante qui le replace (sur une coupe),
      // debout à sa place d'un coup, comme au début d'un ralenti
      if (p.frozen && p.shot) { p.shot.stop(); p.shot = null; p.frozen = false; p.fade = 0; p.locoW = 1; }
    }
    if (p.pending) {
      p.pending.wait -= dt;
      if (p.pending.wait <= 0) {
        gesture(p, p.pending.name, { fade: 0.15 });
        if (p.saveC?.palms && p.saveC.name === p.pending.name) p.shotEnd = p.saveC.t + 0.35; // (parade des deux mains, ci-dessous)
        p.pending = null;
      }
    }
    // l'arrêt du gardien (0.8.24) : dès la frappe, le geste qui convient, son contact calé sur l'arrivée du ballon (le
    // plongeon du moteur, 0,1 à 0,4 s avant le contact, laissait trop peu de temps : le gardien se retrouvait couché d'un
    // coup, jambes à travers la pelouse) ; sans arrêt annoncé, l'ancien plongeon au signal du moteur
    if (ag.saveId && ag.saveId !== p.saveSeen && A.clips.GK_Dive_L) {
      p.saveSeen = ag.saveId;
      const name = saveClip(ag);
      const st = saveTime(p, ag, name).t; // (1.0.33 : plus tôt dans le plongeon pour un ballon proche)
      const off = st - (ag.saveLead || 0);
      if (off >= 0) gesture(p, name, { at: off, fade: 0.15 }); else p.pending = { name, wait: -off };
      p.saveC = { name, t: st, catch: ag.saveKind === 1, palms: ag.saveKind === 2 && name.startsWith('GK_Catch'), beaten: ag.saveKind === 3 };
      // (1.0.33) la parade des deux mains s'arrête 0,35 s après le contact : la fin du geste de prise ramenait les mains
      // contre la poitrine, comme s'il avait capté le ballon qu'il venait de repousser
      if (p.saveC.palms) p.shotEnd = st + 0.35;
    } else if (pose === 2 && p.pose !== 2 && !ag.saveId) {
      const name = (ag.lean || 0) >= 0 ? 'Save_1' : 'Save_1_M';
      gesture(p, name, { at: A.marks[name] - 0.32, fade: 0.1 });
    }
    p.pose = pose;
    if (ag.cheer > 0.3 && !p.cheering) { // le buteur : toutes les célébrations ; ses coéquipiers : debout (jamais à genoux)
      const pool = ag.scorer ? CELEBRATIONS : CELEBRATIONS.filter((n) => !A.slides.has(n));
      p.cheering = true;
      gesture(p, (ag.celeb && A.clips?.[ag.celeb] ? ag.celeb : null) || (pool.length ? pool : CELEBRATIONS)[p.seed % (pool.length || CELEBRATIONS.length)], { fade: 0.3 }); // ag.celeb : une célébration choisie (studio photo)
    }
    if (ag.cheer < 0.05) p.cheering = false;
    if (p.shot && !p.frozen && p.shot.time >= p.shotEnd - 0.05 && !p.cheering && (pose !== 2 || (p.saveC?.palms && p.shot.getClip().name === p.saveC.name))) {
      // le porteur fauché reste au sol, figé au repos de sa chute, tant que le moteur l'y garde ; sinon, le geste suivant
      // ou le retour à la course
      if (p.fell && p.shot.getClip().name === 'Foul_Fall') { p.shot.paused = true; p.frozen = true; }
      else {
        const next = p.after;
        p.after = null;
        if (next && A.clips[next]) gesture(p, next, { fade: 0.25 }); else endGesture(p);
      }
    }
  }
  // Arrêt du gardien (0.8.24, chantier gardiens du PDG : plongeons irréalistes) : face à lui, il prend le ballon (bas, à
  // mi-hauteur ou au-dessus de la tête, en sautant) ; un peu sur le côté et bas, il s'y jette du corps ; plus loin, il
  // plonge ; un ballon haut qui le bat le voit sauter en vain. Sans ces gestes (ou sans tir), l'ancien plongeon.
  // 1.0.25 (chantier du PDG : « on a l'impression que le ballon recalcule sa position pour se placer dans les mains ») : le
  // geste se choisit sur la hauteur du CENTRE du ballon comparée à celle des mains de chaque geste au contact (prise basse
  // 55 cm, à mi-hauteur 117 cm, haute 222 cm ; arrêt du corps 31 cm ; plongeon bas 74 cm, haut 108 cm). Avant, l'arrêt du
  // corps (mains à 31 cm) partait sur des ballons à 90 cm, la prise à mi-hauteur sur des ballons à 60 cm : les mains
  // passaient 30 à 55 cm à côté, et le ballon était ensuite tiré dans les gants.
  // l'instant du contact dans le geste d'arrêt (1.0.33) : pour un plongeon, le dernier instant (jusqu'au contact capté,
  // au plus 0,45 s avant) où la portée captée ne dépasse pas la distance du ballon, à la taille du gardien ; sinon le
  // contact capté. Renvoie l'échantillon (t, main : fwd, left, up) ou { t } seul
  function saveTime(p, ag, name) {
    const R = A.diveReach?.[name]; const m = A.marks[name] ?? 0;
    if (!R) return { t: m };
    const L = (Math.abs(ag.saveSide || 0) * BASE_H) / (p.height || BASE_H);
    let best = null, first = null;
    for (const q of R) {
      if (q.t > m + 1e-6 || q.t < m - 0.45) continue;
      if (!first) first = q;
      if (q.reach <= L + 1e-6) best = q;
    }
    return best || first || { t: m };
  }
  function saveClip(ag) {
    const side = ag.saveSide || 0; const h = (ag.saveH || 0) + 0.11; const far = Math.abs(side);
    if (!ag.saveKind || !A.clips.GK_Dive_L) return (ag.lean || 0) >= 0 ? 'Save_1' : 'Save_1_M';
    const left = side > 0 || (side === 0 && (ag.lean || 0) >= 0);
    if (ag.saveKind === 3 && h > 2.0 && far < 1.2) return 'GK_Miss';
    // (1.0.31, contrôle de la vidéo : sur une frappe forte à hauteur du visage, le gardien jouait la prise à hauteur de
    // poitrine, un seul gant montait, le ballon passait au-dessus de lui) parade haute : les deux mains montent et poussent
    if (far < 0.45 && ag.saveKind === 2 && h >= 1.3) return 'GK_Catch_High';
    if (far < 0.45 && !(ag.saveKind === 2 && h < 1.0)) return h < 0.82 ? 'GK_Catch_Low' : h < 1.75 ? 'GK_Catch_Mid' : 'GK_Catch_High';
    if (far < 1.1 && h < 0.6) return left ? 'GK_Block_L' : 'GK_Block_R';
    // (1.0.33) un arrêt à moins de 1,1 m, à mi-hauteur ou plus haut : un pas de côté et les mains (prise, ou parade des
    // deux mains), pas un plongeon écourté qui le couchait presque sur place
    if (ag.saveKind !== 3 && far < 1.1) return h < 1.3 || (h < 1.75 && ag.saveKind !== 2) ? 'GK_Catch_Mid' : 'GK_Catch_High';
    if (!A.clips.GK_DiveLo_R) return left ? 'GK_Dive_L' : 'GK_Dive_R';
    return h < 0.95 ? (left ? 'GK_Dive_L' : 'GK_DiveLo_R') : (left ? 'GK_DiveHi_L' : 'GK_Dive_R');
  }
  let ts = 1; // vitesse du temps (ralenti)
  return {
    max,
    set timeScale(v) { ts = v; },
    setKit(i, hex, trim = 0x23262b) {
      const p = slots[i] || make(i);
      for (const m of p.mats.Kit_Shirt || []) m.color.setHex(hex);
      for (const m of p.mats.Kit_Socks || []) m.color.setHex(hex);
      for (const m of p.mats.Kit_Shorts || []) m.color.setHex(trim);
      for (const m of p.mats.FootIn || []) m.color.setHex(hex); // (le pied dans la chaussure : la chaussette)
      p.u.shirtIn.value.setHex(hex).multiplyScalar(0.5); // (l'intérieur du maillot, vu par la manche : dans l'ombre)
      p.u.shortsIn.value.setHex(trim).multiplyScalar(0.3); // (l'intérieur du short, dans l'ombre : jamais plus clair que la cuisse)
      for (const m of p.mats.Kit_Trim || []) m.color.setHex(trim); // col (et bords des manches avant la base v2)
      // le gardien (premier de chaque onze) : manches longues de son maillot, gants
      const keeper = i % 11 === 0;
      // bords des manches courtes (base v2) : la couleur secondaire ; chez le gardien, celle du maillot (une bande sombre
      // coupait ses manches longues à mi-bras)
      for (const m of p.mats.Kit_Cuff || []) m.color.setHex(keeper ? hex : trim);
      const c = new THREE.Color(hex);
      p.u.sleeve.value.set(c.r, c.g, c.b, keeper ? 1 : 0);
      const g = new THREE.Color(GLOVE_HEX);
      p.u.glove.value.set(g.r, g.g, g.b, keeper ? 1 : 0);
    },
    reset() { // ralenti (matchplay.js) : chacun repart de sa place au début de l'action, sans le geste en cours ni l'appui
      for (const p of slots) {
        if (!p) continue;
        if (p.shot) { p.shot.stop(); p.shot = null; }
        p.cheering = false; p.locoW = 1; p.fade = 0; p.prevKick = 0; p.pose = 0; p.lx = undefined; p.back = 0; p.pending = null; p.holding = false; p.saveSeen = 0; p.tackleSeen = 0; p.headSeen = 0; p.cueSeen = 0; p.fell = false; p.after = null; p.frozen = false;
        p.lh = undefined; p.roll = 0; p.pitch = 0; p.yaw = undefined; p.lookUp = undefined; p.gw = 0; p.dirF = 1; p.dirR = 0;
        for (const L of p.legs) { L.lock = null; L.w = 0; L.prevB = null; L.free = false; L.held = false; }
      }
    },
    setIdentity(i, id) { identity(slots[i] || make(i), id); },
    // Studio photo (three/hero3d.js) : pose de portrait, à appeler après commit, avant le rendu. 1.0.40 (PDG : « des
    // poitrines qui ressortent énormément ») : les mains jointes dans le dos (1.0.37) tiraient les épaules en arrière,
    // bombaient le buste et ouvraient le maillot sous l'aisselle ; les bras tombent maintenant le long du corps, coudes à
    // peine fléchis, mains ouvertes contre les cuisses.
    portrait(i, look = null) {
      const p = slots[i];
      if (!p) return;
      const root = p.root;
      // tenue droite (1.0.42) : tronc, épaules et jambes dans leur pose de construction, buste droit, dos sans creux, pieds
      // parallèles ; les bras et le regard se posent ensuite
      root.traverse((b) => { if (b.isBone && b.userData.bind) { b.quaternion.copy(b.userData.bind); if (b.userData.bindPos) b.position.copy(b.userData.bindPos); } });
      root.updateMatrixWorld(true);
      const q = root.getWorldQuaternion(new THREE.Quaternion());
      const fwd = V().set(0, 0, 1).applyQuaternion(q);
      const down = V().set(0, -1, 0);
      const B = (n) => root.getObjectByName(n);
      const wp = (b) => b.getWorldPosition(V());
      const s = root.scale.x;
      // rotation (repère du monde) appliquée à un os autour de sa propre attache
      const turn = (bone, qd) => {
        const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        bone.quaternion.copy(pw.multiply(qd.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()))));
        bone.updateMatrixWorld(true);
      };
      const turnAxis = (bone, axis, ang) => { if (Math.abs(ang) > 1e-5 && axis.lengthSq() > 1e-10) turn(bone, new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), ang)); };
      const hl = wp(B('thigh_l')), hr = wp(B('thigh_r'));
      const c = hl.clone().add(hr).multiplyScalar(0.5);
      const D = THREE.MathUtils.degToRad;
      for (const [side, hip] of [['l', hl], ['r', hr]]) {
        const out = hip.clone().sub(c).setY(0).normalize(); // vers son côté
        const palm = out.clone().negate(); // paume vers la cuisse
        const up = B(`upperarm_${side}`); const lo = B(`lowerarm_${side}`); const ha = B(`hand_${side}`);
        if (!up || !lo || !ha) continue;
        // 1) doigts : pose de liaison (droits), on les replie plus bas
        ha.traverse((b) => { if (b !== ha && b.isBone && b.userData.rest) b.quaternion.copy(b.userData.rest); });
        root.updateMatrixWorld(true);
        // 2) bras le long du corps (1.0.40, PDG : « leur position est totalement non naturelle ») : le poignet à côté de la
        // cuisse, juste à l'écart du short, à hauteur de l'aine ; le coude légèrement fléchi, vers l'arrière
        const S = wp(up);
        const l1 = wp(lo).distanceTo(S), l2 = wp(ha).distanceTo(wp(lo));
        const lat = (v) => v.clone().sub(c).dot(out); // écart latéral au milieu du bassin
        const dx = lat(hip) + (globalThis.__ARM_OUT ?? 0.125) * s - lat(S); // le poignet : 12,5 cm à l'extérieur de la hanche
        const dz = 0.035 * s;
        const reach = 0.975 * (l1 + l2);
        const dy = Math.sqrt(Math.max(0.01, reach * reach - dx * dx - dz * dz));
        const T = S.clone().addScaledVector(out, dx).addScaledVector(fwd, dz).addScaledVector(down, dy);
        twoBone(up, lo, ha, T, 1, fwd.clone().negate().addScaledVector(out, 0.35));
        root.updateMatrixWorld(true);
        // 3) main : doigts vers le bas (un peu en avant), pouce en avant, paume vers la cuisse ; la rotation du poignet est
        // partagée avec l'avant-bras (sinon le poignet se tord)
        const fore = wp(ha).sub(wp(lo)).normalize();
        const basis = () => {
          const f = wp(B(`middle_01_${side}`)).sub(wp(ha)).normalize();
          const a = wp(B(`index_01_${side}`)).sub(wp(B(`pinky_01_${side}`)));
          a.addScaledVector(f, -a.dot(f)).normalize();
          return new THREE.Matrix4().makeBasis(f, a, V().crossVectors(f, a));
        };
        const f2 = fore.clone().addScaledVector(fwd, 0.08).addScaledVector(palm, 0.1).normalize();
        const a2 = fwd.clone().addScaledVector(f2, -fwd.dot(f2)).normalize();
        const target = new THREE.Matrix4().makeBasis(f2, a2, V().crossVectors(f2, a2));
        const need = () => new THREE.Quaternion().setFromRotationMatrix(target.clone().multiply(basis().clone().transpose()));
        // part de torsion autour de l'avant-bras, donnée à l'avant-bras pour moitié
        const qn = need();
        const tw = new THREE.Quaternion(qn.x, qn.y, qn.z, qn.w);
        const pr = V(qn.x, qn.y, qn.z).projectOnVector(fore);
        tw.set(pr.x, pr.y, pr.z, qn.w).normalize();
        const twistAng = 2 * Math.atan2(V(tw.x, tw.y, tw.z).dot(fore), tw.w);
        turnAxis(lo, fore, twistAng * 0.5);
        turn(ha, need());
        // 4) doigts détendus : serrés les uns contre les autres, légèrement repliés vers la paume, de plus en plus vers
        // l'auriculaire ; le pouce le long de l'index
        const CURL = { index: [12, 22, 14], middle: [16, 26, 16], ring: [20, 30, 18], pinky: [24, 34, 20] };
        const TOWARD = { index: 'middle', ring: 'middle', pinky: 'ring' };
        const SPREAD = { index: 4, ring: 3, pinky: 7 };
        for (const [f, angs] of Object.entries(CURL)) {
          const b1 = B(`${f}_01_${side}`); if (!b1) continue;
          if (SPREAD[f]) { // rapprocher du doigt voisin
            const nb = wp(B(`${TOWARD[f]}_01_${side}`)); const dir = wp(B(`${f}_02_${side}`)).sub(wp(b1));
            const to = nb.clone().sub(wp(b1)); to.addScaledVector(dir.clone().normalize(), -to.dot(dir.clone().normalize()));
            turnAxis(b1, V().crossVectors(dir, to), D(SPREAD[f]));
          }
          const chain = [b1, B(`${f}_02_${side}`), B(`${f}_03_${side}`)];
          chain.forEach((b, j) => {
            if (!b) return;
            const nxt = chain[j + 1];
            const dir = nxt ? wp(nxt).sub(wp(b)) : wp(b).sub(wp(chain[j - 1]));
            turnAxis(b, V().crossVectors(dir, palm), D(angs[j]));
          });
        }
        const th = [B(`thumb_01_${side}`), B(`thumb_02_${side}`), B(`thumb_03_${side}`)];
        th.forEach((b, j) => {
          if (!b || j === 0) return;
          const dir = th[j + 1] ? wp(th[j + 1]).sub(wp(b)) : wp(b).sub(wp(th[j - 1]));
          const to = wp(B(`index_02_${side}`)).sub(wp(b));
          turnAxis(b, V().crossVectors(dir, to), D(j === 1 ? 10 : 14));
        });
      }
      // 5) le regard vers l'objectif (look : position de la caméra) : la tête et le cou se tournent ensemble
      if (look) {
        const head = B('head'), neck = B('neck_01');
        const H0 = wp(head);
        const faceNow = V().set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).multiply(A.headFace));
        const want = look.clone().sub(H0).normalize();
        want.y = THREE.MathUtils.clamp(want.y, -0.18, 0.12); // (jamais le nez en l'air ni sur la poitrine)
        want.normalize();
        const qd = new THREE.Quaternion().setFromUnitVectors(faceNow, want);
        const half = new THREE.Quaternion().slerp(qd, 0.45);
        turn(neck, half);
        const faceNow2 = V().set(0, 0, 1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).multiply(A.headFace));
        turn(head, new THREE.Quaternion().setFromUnitVectors(faceNow2, want));
      }
      root.updateMatrixWorld(true);
    },
    // gardien en photo debout : manches longues et gants sur une place de joueur de champ (son attente est accroupie)
    keeperLook(i, on = true) {
      const p = slots[i];
      if (!p) return;
      p.u.sleeve.value.w = on ? 1 : 0;
      const g = new THREE.Color(GLOVE_HEX);
      p.u.glove.value.set(g.r, g.g, g.b, on ? 1 : 0);
      // bords des manches courtes (1.0.43) : la couleur du maillot du gardien, sinon la couleur secondaire (celle du col)
      const shirt = p.mats.Kit_Shirt?.[0]?.color; const col = p.mats.Kit_Trim?.[0]?.color;
      for (const m of p.mats.Kit_Cuff || []) { const c = on ? shirt : col; if (c) m.color.copy(c); }
    },
    setLook(x, y, z) { look = x === null || x === undefined ? null : (look || V()).set(x, y, z); },
    setAgent(i, ag, y, scale = 0.1) {
      const p = slots[i] || make(i);
      p.ag = ag;
      p.root.visible = scale > 0.001;
      const s = scale * (p.height / BASE_H);
      p.k = p.height / BASE_H;
      p.root.scale.setScalar(s);
      p.ground = y;
      p.root.position.set(ag.x, y + (ag.lift || 0), ag.z);
      p.root.rotation.set(0, Math.PI / 2 - ag.h, 0); // le modèle regarde +z ; le cap h du moteur vise (cos h, sin h)
    },
    commit(count, dtIn) {
      // pas de temps du moteur du match quand il le donne (1.0.18 : les gestes avancent au même pas que l'action, y compris
      // dans les captures et les bancs d'essai qui jouent plus vite que le temps réel) ; sinon l'horloge
      const real = clock.getDelta();
      const dt = Math.min(0.05, dtIn ?? real) * ts;
      for (let i = 0; i < slots.length; i++) {
        const p = slots[i];
        if (!p) continue;
        if (i >= count || !p.ag) { p.root.visible = false; continue; }
        drive(p, p.ag, dt);
        if (p.fade) p.locoW = Math.min(1, Math.max(0, p.locoW + p.fade * dt));
        loco(p, dt);
        if (p.hasBase) p.mod.forEach((b, k) => b.quaternion.copy(p.base[k])); // la pose animée, sans les retouches d'avant
        p.mixer.update(dt);
        p.mod.forEach((b, k) => p.base[k].copy(b.quaternion)); p.hasBase = true;
        bodyLean(p, p.ag, dt);
        gaze(p, p.ag, dt);
        footIK(p, dt);
        strikeIK(p);
        receiveIK(p);
        keeperIK(p);
        headIK(p);
        if (p.keeper) { // le ballon entre ses gants : le milieu des deux mains, un peu devant les paumes
          const hl = p.root.getObjectByName('hand_l'); const hr = p.root.getObjectByName('hand_r');
          const thr = p.shot && A.throwHand?.[p.shot.getClip().name]; // relance à la main (1.0.28) : dans la main qui lance
          if (thr) {
            const hand = p.root.getObjectByName(thr); const fore = p.root.getObjectByName(thr === 'hand_r' ? 'lowerarm_r' : 'lowerarm_l');
            const hp = hand.getWorldPosition(V()); const dir = hp.clone().sub(fore.getWorldPosition(V())).normalize();
            (p.anchor ||= V()).copy(hp).addScaledVector(dir, 0.011 + 0.06 * p.root.scale.x);
          } else if (hl && hr) {
            const a = (p.anchor ||= V());
            a.copy(hl.getWorldPosition(V())).add(hr.getWorldPosition(V())).multiplyScalar(0.5);
            a.x += Math.cos(p.ag.h) * 0.004; a.z += Math.sin(p.ag.h) * 0.004;
          }
        }
      }
    },
    // point du ballon au contact d'une frappe du joueur i (geste capté), dans son repère : devant (fwd), à droite (right),
    // en unités du jeu, à sa taille ; null sans joueurs réalistes
    kickSpot(i, name) {
      const p = slots[i]; const c = A.contact?.[name];
      if (!p || !c) return null;
      const s = 0.1 * (p.height / BASE_H);
      return { fwd: c.fwd * s, right: -c.left * s };
    },
    // l'instant clé d'un geste annoncé (1.0.28 : le ballon quitte la main du gardien), en secondes depuis son début
    cueMark(name) { return A?.marks?.[name] ?? null; },
    // la part de la course latérale captée d'un plongeon faite entre les instants t0 et t du geste, rapportée à celle
    // faite jusqu'à son contact (marks) ; null sans course captée
    // (1.0.33 : contact donné par le moteur, mark ; au-delà du contact, la course continue comme dans le geste capté,
    // valeur au-dessus de 1 : le gardien ne retombait pas sur place)
    diveProgress(name, t0, t, mark) {
      const P = A?.divePath?.[name]; const m = mark ?? A?.marks?.[name];
      if (!P || m === undefined) return null;
      const at = (tt) => { const k = Math.max(0, Math.min(P.t.length - 1, (tt / P.t[P.t.length - 1]) * (P.t.length - 1))); const i = Math.floor(k), f = k - i; return P.x[i] + ((P.x[Math.min(i + 1, P.x.length - 1)] - P.x[i]) * f); };
      const den = at(m) - at(t0);
      return den > 1e-3 ? Math.max(0, (at(t) - at(t0)) / den) : null;
    },
    // le ballon tenu par le gardien i : entre ses gants (position monde) ; null sans joueurs réalistes
    ballAnchor(i) { const p = slots[i]; return p && p.anchor ? p.anchor : null; },
    // l'arrêt que fera le gardien i (agent ag : saveSide, saveH, saveKind) : ses mains au contact, dans son repère
    // (devant, à droite, en haut), en unités du jeu ; null sans joueurs réalistes
    saveHand(i, ag) {
      const p = slots[i]; if (!p || !A.saveHands) return null;
      const n = saveClip(ag);
      const q = A.diveReach?.[n] ? saveTime(p, ag, n) : null; // (1.0.33) la main à l'instant du contact choisi
      const c = q && q.fwd !== undefined ? q : A.saveHands[n];
      if (!c) return null;
      const s = 0.1 * (p.height / BASE_H);
      return { fwd: c.fwd * s, right: -c.left * s, up: c.up * s, clip: n, t: q?.t ?? A.marks[n] };
    },
    dispose() {
      for (const p of slots) if (p) { parent.remove(p.root); p.mixer.stopAllAction(); for (const o of p.meshes) { o.material.dispose(); if (o.geometry !== o.userData.g0) o.geometry.dispose(); } }
      slots.length = 0;
    },
  };
}

// Joueurs du match : les joueurs actuels (players.js) le temps du chargement, puis les joueurs réalistes dès qu'ils sont
// prêts (couleurs et identités rejouées). En cas d'échec de chargement, les joueurs actuels restent.
export function createPlayersAuto(parent, max, makeProcedural) {
  let cur = makeProcedural();
  let is3d = false;
  let gone = false;
  const kits = [];
  const ids = [];
  loadPlayers3D().then(() => {
    if (gone) return;
    const next = createPlayers3D(parent, max);
    kits.forEach((k, i) => { if (k) next.setKit(i, ...k); });
    ids.forEach((d, i) => { if (d) next.setIdentity(i, d); });
    cur.dispose();
    cur = next;
    is3d = true;
  }).catch(() => {});
  return {
    max,
    get is3d() { return is3d; },
    set timeScale(v) { cur.timeScale = v; },
    setKit(i, ...a) { kits[i] = a; cur.setKit(i, ...a); },
    reset: () => cur.reset?.(),
    setIdentity(i, d) { ids[i] = d; cur.setIdentity?.(i, d); },
    setLook: (...a) => cur.setLook?.(...a),
    kickSpot: (...a) => cur.kickSpot?.(...a) ?? null,
    saveHand: (...a) => cur.saveHand?.(...a) ?? null,
    ballAnchor: (...a) => cur.ballAnchor?.(...a) ?? null,
    cueMark: (...a) => cur.cueMark?.(...a) ?? null,
    diveProgress: (...a) => cur.diveProgress?.(...a) ?? null,
    setAgent: (...a) => cur.setAgent(...a),
    commit: (n, dt) => cur.commit(n, dt),
    dispose() { gone = true; cur.dispose(); },
  };
}
