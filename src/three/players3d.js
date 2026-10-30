import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GREY, HAIRS, SKINS, agedFace, faceOf, hash } from '../game/faces';
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
const GLOVE_HEX = 0xf1efe9; // gants du gardien : blanc cassé
const LOOK_CHAIN = [['spine_02', 0.15], ['spine_03', 0.2], ['neck_01', 0.25], ['head', 0.4]]; // part du regard par os
// os retouchés après l'animation (inclinaison, regard, appuis) : leur pose animée est remise avant chaque image (0.8.24 :
// le moteur d'animation ne réécrit un os que si sa valeur a changé ; sur un joueur immobile, la retouche s'ajoutait à
// elle-même d'image en image et le joueur finissait plié en deux)
const RETOUCHED = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];

let loading = null;
let A = null; // ressources prêtes : { base, clips, gaits, marks, mask (pilosité), skins (trois peaux) }
export const players3dReady = () => !!A;
export function loadPlayers3D() {
  if (!loading) loading = build().catch((e) => { console.warn('joueurs 3D indisponibles', e); loading = null; throw e; });
  return loading;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // fichiers compressés (meshopt) : 3 Mo au lieu de 7
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));

const tex = (u, srgb) => new Promise((res, rej) => new THREE.TextureLoader().load(u, (t) => {
  t.flipY = false; // convention glTF
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  res(t);
}, undefined, rej));

async function build() {
  const [base, anims, mask, knit, ...skins] = await Promise.all([
    load(`${URL}footballer.glb`), load(`${URL}anims.glb`), tex(`${URL}face_mask.png`, false), tex(`${URL}knit.png`, false),
    ...[0, 1, 2, 3, 4].map((k) => tex(`${URL}skin_${k}.jpg`, true)),
  ]);
  knit.wrapS = knit.wrapT = THREE.RepeatWrapping;
  knit.repeat.set(70, 70); // maille de 3 mm environ sur l'atlas du corps
  const clips = {};
  for (const c of anims.animations) {
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
  A = { base, clips, mask, knit, skins };
  // célébrations : celles où le joueur se laisse glisser à genoux (le bassin descend de plus d'un quart) sont gardées au
  // buteur, qui arrive lancé ; ses coéquipiers, arrêtés près de lui, lèvent les bras debout
  A.slides = new Set(CELEBRATIONS.filter((n) => {
    const y = probe(n, (r) => wpos(r, 'pelvis').y);
    return Math.min(...y) < y[0] * 0.75;
  }));
  // gestes où le joueur se couche (plongeon, arrêt du corps, glissade à genoux) : le geste capté fait seul autorité, sans
  // verrou des appuis (0.8.24 : le pied retenu au sol pendant que le corps vole pliait la jambe à travers la pelouse)
  A.lying = new Set([...A.slides, ...['GK_Dive_L', 'GK_Dive_R', 'GK_Block_L', 'GK_Block_R', 'Save_1', 'Foul_Tackle', 'Foul_Fall', 'Fallen_Idle', 'Stand_Up'].filter((n) => clips[n])]);
  if (A.lying.has('Save_1')) A.lying.add('Save_1_M');
  A.gaits = GAIT_NAMES.map((n, j) => (j === 0 ? { name: n, nat: 0, contacts: { l: [[0, 1]], r: [[0, 1]] } } : { name: n, ...analyzeGait(n) }));
  A.gaits.sort((a, b) => a.nat - b.nat);
  const set = (names, dir) => names.filter((n) => A.clips[n]).map((n) => ({ name: n, ...analyzeGait(n, dir) })).sort((a, b) => a.nat - b.nat);
  A.dirGaits = Object.fromEntries(Object.entries(GAIT_SETS).map(([d, names]) => [d, set(names, d)]));
  A.keeperGaits = { idle: A.clips[KEEPER_GAITS.idle] ? KEEPER_GAITS.idle : null, r: set(KEEPER_GAITS.r, 'r'), l: set(KEEPER_GAITS.l, 'l') };
  A.marks = {
    Pass: footPeak('Pass'), Shot: footPeak('Shot'), Save_1: handPeak('Save_1'), Save_1_M: handPeak('Save_1_M'),
  };
  // arrêts du gardien (Mixamo, 0.8.24) : l'instant du contact dans chaque geste ; plongeon : la main la plus loin du
  // corps ; prise : les mains qui se rejoignent sur le ballon ; prise haute, saut manqué : les mains au plus haut ;
  // arrêt du corps : le bassin au plus bas
  const reachT = (n) => probe(n, (r, t) => ({ t, x: Math.max(Math.abs(wpos(r, 'hand_l').x), Math.abs(wpos(r, 'hand_r').x)) })).slice(8).reduce((b, x) => (x.x > b.x ? x : b), { x: -1, t: 0 }).t;
  const meetT = (n) => { const d = A.clips[n].duration; return probe(n, (r, t) => ({ t, d: wpos(r, 'hand_l').distanceTo(wpos(r, 'hand_r')) })).filter((x) => x.t > d * 0.15 && x.t < d * 0.8).reduce((b, x) => (x.d < b.d ? x : b), { d: 9, t: 0 }).t; };
  const lowT = (n) => probe(n, (r, t) => ({ t, y: wpos(r, 'pelvis').y })).slice(8).reduce((b, x) => (x.y < b.y ? x : b), { y: 9, t: 0 }).t;
  for (const [n, f] of [['GK_Dive_L', reachT], ['GK_Dive_R', reachT], ['GK_Catch_Low', meetT], ['GK_Catch_Mid', meetT], ['GK_Catch_High', handPeak], ['GK_Block_L', lowT], ['GK_Block_R', lowT], ['GK_Miss', handPeak], ['Foul_Tackle', lowT]]) {
    if (A.clips[n]) A.marks[n] = f(n);
  }
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
    A.ends = { Foul_Fall: rest ? rest.t : A.clips.Foul_Fall.duration };
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
const SKIN_TEX = [[0], [0, 1], [1, 0], [2, 1], [2], [3, 2], [3, 4], [4, 3]]; // teint du portrait -> peaux possibles
const skinTex = (sk, seed) => { const l = SKIN_TEX[sk] || SKIN_TEX[2]; return l[(seed >>> 3) % l.length]; };
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const MESH = { // coiffure du portrait -> coupe 3D (null : cheveux ras peints, ou crâne rasé)
  short: 'fade', messy: 'short01', mullet: 'short04', side: 'short04', crop: 'fade', undercut: 'fade', slick: 'short04',
  receding: 'short04', quiff: 'short01', mohawk: 'short01', long: 'short04', bun: 'short04', ponytail: 'short04',
  curly: 'curly', afroShort: null, afro: 'curly', hightop: null, locs: null, buzz: null, braids: null, bald: null,
}; // (curly : coupe courte, ou peints ras pour des cheveux crépus ; cheveux longs, chignon, queue : plaqués en arrière)
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
  return { seed, face: f, origin: originOf(pl.name || ''), age, pos, height, style, beard, hair, beardCol, brow };
}
// morphs du visage et de la carrure (clés du modèle, 0 à 1)
const EXTRA = ['nose_wide', 'nose_narrow', 'nose_long', 'nose_hump', 'nose_flare', 'lips_full', 'mouth_wide', 'chin_strong', 'chin_narrow', 'cheekbones', 'cheeks_full', 'ears_big', 'head_square'];
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
  const shaved = MESH[id.style] === null || (MESH[id.style] === 'curly' && (f.tx === 'coily' || toneOf(f.sk) === 2));
  m.head_oval = Math.min(m.head_oval || 0, 0.3) * (shaved ? 0.5 : 1);
  m.forehead_tall = Math.min(m.forehead_tall || 0, 0.25) * (shaved ? 0.5 : 1);
  m.cheekbones = r() * 0.7;
  m.chin_strong = Math.max(m.chin_strong || 0, r() < 0.6 ? 0.3 + r() * 0.5 : 0);
  if (MESH[id.style] === 'short04') { // coupe plaquée : elle dégage tout le visage, qui doit rester marqué
    m.jaw_wide = Math.max(m.jaw_wide, 0.45); m.chin_strong = Math.max(m.chin_strong, 0.4); m.chin_narrow = Math.min(m.chin_narrow || 0, 0.2);
  }
  // carrure : défenseurs et gardiens plus solides, milieux plus fins
  const builds = { G: [0.25, 0.35, 0.4], D: [0.2, 0.35, 0.45], M: [0.5, 0.2, 0.3], A: [0.4, 0.2, 0.4] }[id.pos] || [0.4, 0.3, 0.3];
  const x = r(); const b = x < builds[0] ? 'build_lean' : x < builds[0] + builds[1] ? 'build_stocky' : 'build_strong';
  m[b] = 0.3 + r() * 0.6;
  m.neck_thick = b === 'build_lean' ? 0 : r() * 0.5;
  return m;
}
// teinte de la peau : la luminosité va vers le teint du portrait, la teinte reste celle de la peau (chaude, jamais grise)
function skinTint(sk, tex) {
  const t = new THREE.Color(SKINS[sk] || SKINS[2]); const m = new THREE.Color(FACE_MEAN[tex]);
  const k = clamp(Math.sqrt(lum(t) / lum(m)), 0.8, 1.12); // (au-delà, une peau claire tourne au blanc cireux)
  const h = (a, b) => clamp((a / b) ** 0.08, 0.94, 1.06);
  return new THREE.Color(k * h(t.r, m.r), k * h(t.g, m.g), k * h(t.b, m.b));
}
// peau : barbe, moustache, bouc et cheveux ras peints d'après le masque de pilosité (grain de poil de près, densité
// moyenne de loin)
function paintable(mat, u) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: A.mask };
    sh.uniforms.uBeard = u.beard;
    sh.uniforms.uHair = u.hair;
    sh.uniforms.uScalp = u.scalp;
    sh.uniforms.uSleeve = u.sleeve; // gardien : manches longues (couleur, 1) ; sinon (…, 0)
    sh.uniforms.uGlove = u.glove;
    sh.vertexShader = `attribute vec2 aKit;\nvarying vec2 vKit;\n${sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKit = aKit;')}`;
    sh.fragmentShader = `uniform sampler2D uMask;\nuniform vec4 uBeard;\nuniform vec3 uHair;\nuniform vec3 uScalp;\nuniform vec4 uSleeve;\nuniform vec4 uGlove;\nvarying vec2 vKit;\n${sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float hairK = 0.0;
  {
    vec4 fm = texture2D(uMask, vMapUv);
    float bd = max(max(fm.r * uBeard.x, fm.g * uBeard.y), fm.b * uBeard.z) * (1.0 - fm.g * max(0.0, -uBeard.y));
    float sd = fm.a * uBeard.w;
    float d = max(bd, sd);
    vec3 hairCol = sd > bd ? uScalp : uHair; // barbe : la couleur des poils ; cheveux ras : plus sombres (racines)
    vec2 gp = vMapUv * 1536.0;
    float n = fract(sin(dot(floor(gp), vec2(12.9898, 78.233))) * 43758.5453);
    n = mix(n, fract(sin(dot(floor(gp * 0.37), vec2(39.346, 11.135))) * 24634.6345), 0.35); // deux échelles de grain
    float far = clamp(length(fwidth(gp)) - 2.5, 0.0, 1.0);
    float k = mix(smoothstep(n - 0.18, n + 0.18, d) * min(1.0, d * 2.0), d * 0.9, far);
    hairK = clamp(k, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, hairCol, hairK * 0.9);
  }
  float sleeveK = clamp(vKit.x * 1.6, 0.0, 1.0) * uSleeve.a;
  float gloveK = clamp(vKit.y * 1.6, 0.0, 1.0) * uGlove.a;
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, uSleeve.rgb, sleeveK), uGlove.rgb, gloveK);`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(roughnessFactor, 0.95, hairK), 0.88, max(sleeveK, gloveK)); // poil, tissu et gants mats')}`;
  };
  mat.customProgramCacheKey = () => 'footoff-peau';
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
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (mesh.geometry !== g0) mesh.geometry.dispose();
  mesh.geometry = g;
  mesh.morphTargetInfluences = undefined;
  mesh.morphTargetDictionary = undefined;
}

export function createPlayers3D(parent, max = 22) {
  if (!A) throw new Error('loadPlayers3D() d’abord');
  const slots = [];
  const clock = new THREE.Clock();
  const V = () => new THREE.Vector3();
  function make(i) {
    const root = SkeletonUtils.clone(A.base.scene);
    const mats = {}; const hairs = {}; const brows = {}; const meshes = [];
    const u = { beard: { value: new THREE.Vector4() }, hair: { value: new THREE.Color() }, scalp: { value: new THREE.Color() }, sleeve: { value: new THREE.Vector4() }, glove: { value: new THREE.Vector4() } };
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      meshes.push(o);
      const n = (o.material.name || '').split('.')[0];
      const key = n.startsWith('Kit_') ? n : n.startsWith('Hair_') ? 'Hair' : n.startsWith('Brows_') ? 'Brows' : n === 'Eyes' || n === 'Lashes' ? n : 'Skin';
      (mats[key] ||= []).push(o.material);
      if (key === 'Hair') hairs[n.slice(5)] = o;
      if (key === 'Brows') brows[n.slice(6)] = o;
      if (key === 'Hair') { // cartes de cheveux : découpe nette, lissée par l'antialias
        Object.assign(o.material, { transparent: false, depthWrite: true, alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide });
      }
      if (key === 'Brows' || key === 'Lashes') { // poils fins posés sur la peau : fondus
        Object.assign(o.material, { transparent: true, depthWrite: false, alphaTest: 0.02, side: THREE.DoubleSide });
        o.castShadow = false; o.renderOrder = 1;
      }
      if (key === 'Skin') { o.material.map = A.skins[1]; o.material.needsUpdate = true; paintable(o.material, u); }
      if (['Kit_Shirt', 'Kit_Shorts', 'Kit_Socks', 'Kit_Trim'].includes(key)) { // tissu : maille, mat, peu de reflets
        Object.assign(o.material, { normalMap: A.knit, roughness: 0.86, envMapIntensity: 0.7 });
        o.material.normalScale.set(0.38, 0.38);
      }
      if (key === 'Kit_Boots' || key === 'Kit_Sole') Object.assign(o.material, { roughness: 0.8, envMapIntensity: 0.6 }); // synthétique mat
    });
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
    const p = { i, root, mixer, mats, hairs, brows, meshes, u, gaits, dg, legs, keeper, idleBall, holdW: 0, mod, base: mod.map(() => new THREE.Quaternion()), hasBase: false, pelvis, spine, k: 1, dirF: 1, dirR: 0, phase: 0, locoW: 1, fade: 0, shot: null, shotEnd: 0, prevKick: 0, cheering: false, pose: 0, speed: 0, height: BASE_H, seed: i + 1 };
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
    const tex = skinTex(f.sk ?? 2, id.seed);
    for (const mat of p.mats.Skin || []) { mat.map = A.skins[tex]; mat.color.copy(skinTint(f.sk ?? 2, tex)); }
    let mesh = MESH[id.style] === undefined ? 'fade' : MESH[id.style];
    if (mesh === 'curly') mesh = f.tx === 'coily' || toneOf(f.sk) === 2 ? null : 'short01';
    for (const [k, o] of Object.entries(p.hairs)) o.visible = k === mesh;
    for (const mat of p.mats.Hair || []) mat.color.set(id.hair).multiplyScalar(2);
    // sourcils : jamais des sourcils d'épilation (le portrait « fin » prend la ligne normale, « normal » l'une ou l'autre)
    const bw = f.bw === 'thick' || (f.bw !== 'fine' && id.seed % 3 === 0) ? 'thick' : 'normal';
    for (const [k, o] of Object.entries(p.brows)) o.visible = k === bw;
    for (const mat of p.mats.Brows || []) mat.color.set(id.brow).multiplyScalar(2);
    // barbe : celle du portrait ; un adulte imberbe garde une ombre de barbe
    const [bR, bG, bB] = id.beard === 'none' && id.age >= 21 ? [0.18, 0, 0] : BEARD[id.beard] || BEARD.none;
    // cheveux ras : partout sous une coupe (la lisière se fond), pleine densité sans coupe
    p.u.beard.value.set(bR, bG, bB, SCALP[id.style] ?? (mesh ? 0.9 : 0.95));
    // poils : toujours plus sombres que la peau ; barbe à la couleur des cheveux (assombrie, jamais grise), cheveux ras
    // plus sombres encore (racines, ombre)
    const skinL = lum(new THREE.Color(FACE_MEAN[tex]).multiply(skinTint(f.sk ?? 2, tex)));
    const tone = (k, capK) => { const c = new THREE.Color(id.beardCol).multiplyScalar(k); if (lum(c) > capK * skinL) c.multiplyScalar((capK * skinL) / lum(c)); return c; };
    p.u.hair.value.copy(tone(0.75, 0.55));
    const sc = tone(0.55, 0.42);
    p.u.scalp.value.copy(sc.lerp(new THREE.Color().setScalar(lum(sc)), 0.45)); // ras : moins saturé (jamais une calotte rousse)
  }
  function gesture(p, name, { fade = 0.18, at = 0 } = {}) {
    if (p.shot) p.shot.fadeOut(fade);
    const a = p.mixer.clipAction(A.clips[name]);
    a.reset(); a.time = Math.max(0, at); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.fadeIn(fade); a.play();
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
      let planted;
      if (air) planted = false;
      else if (p.locoW > 0.5 && p.contact) planted = li === 0 ? p.contact.l : p.contact.r;
      else { const still = L.prevB ? Math.hypot(B.x - L.prevB.x, B.z - L.prevB.z) / Math.max(dt, 1e-3) < 2.2 * s : false; planted = B.y - g < 0.03 * s && still; }
      L.prevB = B.clone();
      // trop loin de l'animation (pas glissé, demi-tour) : le pied se relève et se repose plus loin
      if (L.lock && !L.free && Math.hypot(L.lock.x - B.x, L.lock.z - B.z) > 0.5 * s) L.free = true;
      if (planted && (!L.lock || L.free) && !L.held) { L.lock = B.clone(); L.free = false; L.w = 1; L.held = true; }
      if (!planted) { L.held = false; if (L.lock) L.free = true; }
      if (L.lock && L.free) { L.w -= 12 * dt; if (L.w <= 0) { L.w = 0; L.lock = null; } }
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
      const name = ag.kickKind === 'shot' ? 'Shot' : 'Pass';
      gesture(p, name, { at: A.marks[name] - KICK_CONTACT * KICK_TIME, fade: 0.12 });
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
    if (p.pending) { p.pending.wait -= dt; if (p.pending.wait <= 0) { gesture(p, p.pending.name, { fade: 0.15 }); p.pending = null; } }
    // l'arrêt du gardien (0.8.24) : dès la frappe, le geste qui convient, son contact calé sur l'arrivée du ballon (le
    // plongeon du moteur, 0,1 à 0,4 s avant le contact, laissait trop peu de temps : le gardien se retrouvait couché d'un
    // coup, jambes à travers la pelouse) ; sans arrêt annoncé, l'ancien plongeon au signal du moteur
    if (ag.saveId && ag.saveId !== p.saveSeen && A.clips.GK_Dive_L) {
      p.saveSeen = ag.saveId;
      const name = saveClip(ag);
      const off = (A.marks[name] ?? 0) - (ag.saveLead || 0);
      if (off >= 0) gesture(p, name, { at: off, fade: 0.15 }); else p.pending = { name, wait: -off };
    } else if (pose === 2 && p.pose !== 2 && !ag.saveId) {
      const name = (ag.lean || 0) >= 0 ? 'Save_1' : 'Save_1_M';
      gesture(p, name, { at: A.marks[name] - 0.32, fade: 0.1 });
    }
    p.pose = pose;
    if (ag.cheer > 0.3 && !p.cheering) { // le buteur : toutes les célébrations ; ses coéquipiers : debout (jamais à genoux)
      const pool = ag.scorer ? CELEBRATIONS : CELEBRATIONS.filter((n) => !A.slides.has(n));
      p.cheering = true;
      gesture(p, (pool.length ? pool : CELEBRATIONS)[p.seed % (pool.length || CELEBRATIONS.length)], { fade: 0.3 });
    }
    if (ag.cheer < 0.05) p.cheering = false;
    if (p.shot && !p.frozen && p.shot.time >= p.shotEnd - 0.05 && !p.cheering && pose !== 2) {
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
  function saveClip(ag) {
    const side = ag.saveSide || 0; const h = ag.saveH || 0; const far = Math.abs(side);
    if (!ag.saveKind || !A.clips.GK_Dive_L) return (ag.lean || 0) >= 0 ? 'Save_1' : 'Save_1_M';
    const left = side > 0 || (side === 0 && (ag.lean || 0) >= 0);
    if (ag.saveKind === 3 && h > 1.9 && far < 1.2) return 'GK_Miss';
    if (far < 0.45 && !(ag.saveKind === 2 && h < 0.9)) return h < 0.55 ? 'GK_Catch_Low' : h < 1.5 ? 'GK_Catch_Mid' : 'GK_Catch_High';
    if (far < 1.3 && h < 0.9) return left ? 'GK_Block_L' : 'GK_Block_R';
    return left ? 'GK_Dive_L' : 'GK_Dive_R';
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
      for (const m of p.mats.Kit_Trim || []) m.color.setHex(trim); // col et bords des manches
      // le gardien (premier de chaque onze) : manches longues de son maillot, gants
      const keeper = i % 11 === 0;
      const c = new THREE.Color(hex);
      p.u.sleeve.value.set(c.r, c.g, c.b, keeper ? 1 : 0);
      const g = new THREE.Color(GLOVE_HEX);
      p.u.glove.value.set(g.r, g.g, g.b, keeper ? 1 : 0);
    },
    reset() { // ralenti (matchplay.js) : chacun repart de sa place au début de l'action, sans le geste en cours ni l'appui
      for (const p of slots) {
        if (!p) continue;
        if (p.shot) { p.shot.stop(); p.shot = null; }
        p.cheering = false; p.locoW = 1; p.fade = 0; p.prevKick = 0; p.pose = 0; p.lx = undefined; p.back = 0; p.pending = null; p.holding = false; p.saveSeen = 0; p.tackleSeen = 0; p.fell = false; p.after = null; p.frozen = false;
        p.lh = undefined; p.roll = 0; p.pitch = 0; p.yaw = undefined; p.lookUp = undefined; p.gw = 0; p.dirF = 1; p.dirR = 0;
        for (const L of p.legs) { L.lock = null; L.w = 0; L.prevB = null; L.free = false; L.held = false; }
      }
    },
    setIdentity(i, id) { identity(slots[i] || make(i), id); },
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
    commit(count) {
      const dt = Math.min(0.05, clock.getDelta()) * ts;
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
      }
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
    setAgent: (...a) => cur.setAgent(...a),
    commit: (n) => cur.commit(n),
    dispose() { gone = true; cur.dispose(); },
  };
}
