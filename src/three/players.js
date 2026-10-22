import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Agent, PassingGame, createBallMesh, placeBall } from './motion';
import { formationOf } from '../game/tactics';

// Joueurs : silhouette humaine low-poly réaliste (crampons, chaussettes, jambes, short, maillot, bras,
// tête et cheveux), modélisée en mètres (1,80 m), face vers +X. Deux maillages instanciés partagent
// les mêmes matrices : la tenue (maillot + chaussettes, couleur du club) et le corps (teint de peau
// varié ; short, crampons et cheveux sombres par couleurs de sommets).
// Squelette animé dans le vertex shader : hanches, genoux, épaules, coudes. La phase de foulée est
// calculée par la locomotion (liée à la distance parcourue : pas de pieds qui glissent) ; la frappe de
// balle a sa propre courbe (armé de la jambe, frappe, accompagnement, bras opposé en équilibre).

const HIP = 0.92;
const KNEE = 0.53;
const SHOULDER = 1.42;
const ELBOW = 1.19;
// parties articulées : 1/2 cuisses, 5/6 jambes (sous le genou), 3/4 bras, 7/8 avant-bras.
// Le côté « a » (+Z local) porte le pied de frappe.
const PART = { torso: 0, thighA: 1, thighB: 2, armA: 3, armB: 4, shinA: 5, shinB: 6, foreA: 7, foreB: 8 };

// Pièce colorée (couleur de sommet, multipliée par la couleur d'instance) et rattachée à un membre.
function piece(geo, color, part) {
  const g = geo.toNonIndexed();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) { c.set(color, i * 3); p[i] = part; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(p, 1));
  g.deleteAttribute('uv');
  return g;
}

// Volume de révolution (profil [rayon, hauteur]) aplati en profondeur : torse et bassin anatomiques.
const lathe = (profile, depth = 0.62, seg = 14) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(depth, 1, 1);
const cyl = (rt, rb, h, y, z = 0, x = 0, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);
const ellipsoid = (rx, ry, rz, y, z = 0, x = 0) => new THREE.SphereGeometry(1, 10, 8).scale(rx, ry, rz).translate(x, y, z);

const WHITE = [1, 1, 1];
const SHORTS = [0.09, 0.09, 0.1];
const BOOTS = [0.04, 0.04, 0.045];
const HAIR = [0.07, 0.06, 0.05];

function buildGeometries() {
  const kit = [];
  const body = [];
  for (const [side, thigh, shin, arm, fore] of [[1, PART.thighA, PART.shinA, PART.armA, PART.foreA], [-1, PART.thighB, PART.shinB, PART.armB, PART.foreB]]) {
    const z = side * 0.1;
    body.push(piece(new THREE.BoxGeometry(0.25, 0.07, 0.1).translate(0.04, 0.035, z), BOOTS, shin)); // crampon
    kit.push(piece(cyl(0.05, 0.042, 0.4, 0.07, z), WHITE, shin)); // chaussette
    body.push(piece(cyl(0.065, 0.05, 0.12, 0.47, z), WHITE, shin)); // genou (peau)
    body.push(piece(cyl(0.08, 0.066, 0.2, 0.59, z), WHITE, thigh)); // cuisse (peau)
    body.push(piece(cyl(0.088, 0.082, 0.16, 0.76, z), SHORTS, thigh)); // jambe de short
    // bras légèrement écartés du corps (rotation autour de l'axe avant-arrière, à l'épaule)
    const tilt = (g) => g.translate(0, -SHOULDER, -side * 0.235).rotateX(-side * 0.1).translate(0, SHOULDER, side * 0.235);
    kit.push(piece(tilt(cyl(0.056, 0.05, 0.2, 1.2, side * 0.225)), WHITE, arm)); // manche
    body.push(piece(tilt(cyl(0.043, 0.035, 0.31, 0.88, side * 0.24)), WHITE, fore)); // avant-bras
    body.push(piece(tilt(ellipsoid(0.038, 0.05, 0.03, 0.85, side * 0.24)), WHITE, fore)); // main
  }
  body.push(piece(lathe([[0.001, 0.8], [0.17, 0.81], [0.19, 0.88], [0.18, 0.97], [0.16, 1.0], [0.001, 1.0]], 0.66), SHORTS, PART.torso)); // bassin (short)
  kit.push(piece(lathe([[0.001, 0.95], [0.165, 0.95], [0.17, 1.05], [0.2, 1.22], [0.215, 1.34], [0.19, 1.42], [0.12, 1.465], [0.06, 1.48], [0.001, 1.48]]), WHITE, PART.torso)); // maillot
  kit.push(piece(ellipsoid(0.095, 0.055, 0.205, 1.405), WHITE, PART.torso)); // épaules
  body.push(piece(new THREE.TorusGeometry(0.058, 0.012, 5, 14).rotateX(Math.PI / 2).translate(0, 1.47, 0), SHORTS, PART.torso)); // col
  body.push(piece(cyl(0.05, 0.055, 0.1, 1.43), WHITE, PART.torso)); // cou
  body.push(piece(ellipsoid(0.1, 0.12, 0.092, 1.62), WHITE, PART.torso)); // tête
  body.push(piece(ellipsoid(0.104, 0.07, 0.096, 1.68, 0, -0.01), HAIR, PART.torso)); // cheveux
  return { kit: mergeGeometries(kit), body: mergeGeometries(body) };
}

// Squelette en GLSL (angles dans le plan avant / haut ; angle positif = vers l'avant).
const SKELETON_GLSL = `
  attribute float aPart;
  attribute vec3 aAnim; // x : phase de foulée, y : allure (0 arrêt .. 1 sprint), z : frappe (0 .. 1)
  vec3 foRot(vec3 p, float pivot, float a) {
    vec2 q = vec2(p.x, p.y - pivot);
    return vec3(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a) + pivot, p.z);
  }
  float foSeg(float k, float a, float b, float x0, float x1) { return mix(x0, x1, clamp((k - a) / (b - a), 0.0, 1.0)); }
  vec3 foPose(vec3 p) {
    float ph = aAnim.x, g = aAnim.y, k = aAnim.z;
    float A = 0.72 * g;
    float hipA = sin(ph) * A, hipB = -hipA;
    float K = 0.25 + 1.25 * g;
    // le genou se plie surtout quand la jambe revient vers l'avant
    float kneeA = -(0.06 * g + K * max(0.0, -sin(ph - 0.6)));
    float kneeB = -(0.06 * g + K * max(0.0, sin(ph - 0.6)));
    float armA = -hipA * 0.85, armB = hipA * 0.85;
    float elbowCheer = -1.0;
    if (k < 0.0) { // joie (k = -intensité) : bras levés au-dessus de la tête, qui battent un peu au rythme de la course
      float c = -k;
      armA = mix(armA, 2.75 + 0.22 * sin(ph * 2.0), c);
      armB = mix(armB, 2.75 + 0.22 * sin(ph * 2.0 + 1.3), c);
      elbowCheer = c;
    }
    if (k > 0.0) { // frappe : armé (jambe en arrière, genou plié), frappe, accompagnement
      hipA = k < 0.42 ? foSeg(k, 0.0, 0.42, 0.0, -0.8) : k < 0.62 ? foSeg(k, 0.42, 0.62, -0.8, 1.15) : foSeg(k, 0.62, 1.0, 1.15, 0.0);
      kneeA = k < 0.42 ? foSeg(k, 0.0, 0.42, 0.0, -1.5) : k < 0.58 ? foSeg(k, 0.42, 0.58, -1.5, -0.05) : foSeg(k, 0.58, 1.0, -0.05, 0.0);
      hipB = -0.12 * sin(3.14159 * k); kneeB = -0.25 * sin(3.14159 * k); // jambe d'appui fléchie
      float s = sin(3.14159 * k);
      armB = 0.9 * s; armA = -0.45 * s; // bras opposé vers l'avant pour l'équilibre
    }
    float elbow = 0.25 + 1.15 * g;
    if (elbowCheer > 0.0) elbow = mix(elbow, 0.3, elbowCheer);
    if (aPart > 4.5 && aPart < 6.5) p = foRot(p, ${KNEE.toFixed(2)}, aPart < 5.5 ? kneeA : kneeB);
    if (aPart > 6.5) p = foRot(p, ${ELBOW.toFixed(2)}, elbow);
    if (aPart == 1.0 || aPart == 5.0) p = foRot(p, ${HIP.toFixed(2)}, hipA);
    else if (aPart == 2.0 || aPart == 6.0) p = foRot(p, ${HIP.toFixed(2)}, hipB);
    else if (aPart == 3.0 || aPart == 7.0) p = foRot(p, ${SHOULDER.toFixed(2)}, armA);
    else if (aPart == 4.0 || aPart == 8.0) p = foRot(p, ${SHOULDER.toFixed(2)}, armB);
    p.y += (0.5 - 0.5 * cos(2.0 * ph)) * 0.035 * g; // rebond à chaque appui
    return foRot(p, 0.0, -0.13 * g); // buste penché en avant quand il accélère
  }`;

function injectSkeleton(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKELETON_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = foPose(transformed);');
  };
  return mat;
}

const SKINS = [0xf1c9a5, 0xe0ac84, 0xc68863, 0x9c6644, 0x7a4b2f, 0x5a3420];

export function createPlayers(parent, max = 64) {
  const { kit, body } = buildGeometries();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  anim.setUsage(THREE.DynamicDrawUsage);
  kit.setAttribute('aAnim', anim);
  body.setAttribute('aAnim', anim);
  const mKit = new THREE.InstancedMesh(kit, injectSkeleton(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })), max);
  const mBody = new THREE.InstancedMesh(body, injectSkeleton(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })), max);
  const depth = injectSkeleton(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })); // ombres fidèles à la pose
  const col = new THREE.Color();
  for (let i = 0; i < max; i++) {
    mBody.setColorAt(i, col.setHex(SKINS[(i * 7 + 3) % SKINS.length]));
    mKit.setColorAt(i, col.setHex(0xc7a15a));
  }
  [mKit, mBody].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    m.frustumCulled = false;
    m.count = 0;
    parent.add(m);
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const FWD = new THREE.Vector3(1, 0, 0);
  return {
    max,
    setKit(i, hex) { mKit.setColorAt(i, col.setHex(hex)); mKit.instanceColor.needsUpdate = true; },
    // un joueur d'après son état de locomotion (Agent) ; y = sol, échelle 0,1 = taille réelle en unités du jeu
    setAgent(i, ag, y, scale = 0.1) {
      P.set(ag.x, y, ag.z);
      Q.setFromAxisAngle(UP, -ag.h);
      if (ag.lean) { // plongeon : le corps bascule vers le côté du ballon (vers +z ou -z du terrain) et s'y décale
        Q2.setFromAxisAngle(FWD, ag.lean * 1.25 * Math.cos(ag.h));
        Q.multiply(Q2);
        P.z += ag.lean * 0.035;
      }
      S.setScalar(scale);
      M.compose(P, Q, S);
      mKit.setMatrixAt(i, M);
      mBody.setMatrixAt(i, M);
      anim.setXYZ(i, ag.phase, ag.gait, ag.cheer > 0.01 && !ag.kick ? -ag.cheer : ag.kick);
    },
    commit(count) {
      mKit.count = mBody.count = count;
      mKit.instanceMatrix.needsUpdate = mBody.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
    },
    dispose() {
      [mKit, mBody].forEach((m) => { parent.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); });
      depth.dispose();
    },
  };
}

// --- Le onze du club sur la pelouse du stade ---------------------------------------------------------
// 4-3-3, attaque vers +x. Le bloc coulisse avec le ballon ; conduite, passes au sol ou lobées, frappes
// au but pour les attaquants, relance du gardien. Hors match : rythme d'entraînement ; en match : plus vif.
// Coordonnées en unités du jeu, centrées sur le stade (pelouse 10,5 × 6,8).
const FORMATION = [
  [-4.7, 0], [-3.1, -2.3], [-3.4, -0.8], [-3.4, 0.8], [-3.1, 2.3],
  [-1.4, -1.5], [-1.0, 0], [-1.4, 1.5], [1.4, -2.2], [2.0, 0], [1.4, 2.2],
];
// Dispositif choisi par le joueur : schéma de l'avant-match (en %, attaque vers le haut) → pelouse (attaque vers +x).
const anchorsOf = (formation) => formationOf(formation).pitch.map(([x, y]) => [-4.7 + (88 - y) * (6.7 / 73), ((x - 50) / 36) * 2.3]);
const PX = 5.0, PZ = 3.25; // limites de jeu (légèrement à l'intérieur des lignes)
const clampX = (x) => THREE.MathUtils.clamp(x, -PX, PX);
const clampZ = (z) => THREE.MathUtils.clamp(z, -PZ, PZ);
const rnd = (a, b) => a + Math.random() * (b - a);

export function createSquad(parent) {
  const players = createPlayers(parent, 11);
  players.setKit(0, 0x2f343c); // gardien
  const ball = createBallMesh();
  parent.add(ball);
  const agents = FORMATION.map(([x, z]) => new Agent(x, z, 0));
  let anchors = FORMATION.map((a) => [...a]);
  let defenders = 4;
  let match = false;
  let baseY = 0.006;

  const game = new PassingGame(agents, {
    start: 6,
    dribble: [0.6, 1.6],
    get dribbleSpeed() { return match ? 0.34 : 0.24; },
    dribbleTarget: (i) => {
      const p = agents[i];
      return { x: clampX(p.x + rnd(0.25, 0.7)), z: clampZ(p.z + rnd(-0.35, 0.35)) };
    },
    pickReceiver: (i) => {
      const p = agents[i];
      const cands = [];
      agents.forEach((q, j) => {
        if (j === i) return;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < 0.7 || d > 3.8) return;
        const progress = THREE.MathUtils.clamp((q.x - p.x) + 1.5, 0.2, 4);
        cands.push([j, progress / (1 + Math.abs(d - 1.9)) * (j === 0 ? 0.2 : 1)]);
      });
      if (!cands.length) return null;
      let r = Math.random() * cands.reduce((s, [, w]) => s + w, 0);
      for (const [j, w] of cands) { r -= w; if (r <= 0) return j; }
      return cands[0][0];
    },
    shoot: (i) => {
      const p = agents[i];
      if (i <= defenders || p.x < 3.1 || Math.random() > 0.7) return null;
      return { x: 5.3, z: Math.random() < 0.8 ? rnd(-0.3, 0.3) : rnd(0.45, 0.7) * Math.sign(rnd(-1, 1)) };
    },
    goal: { x: 5.25 },
    keeper: 0,
    clampTarget: (x, z) => [THREE.MathUtils.clamp(x, -4.9, 4.9), THREE.MathUtils.clamp(z, -3.1, 3.1)],
    offBall: (i, b, time) => {
      const [ax, az] = anchors[i];
      if (i === 0) return { x: -4.85, z: THREE.MathUtils.clamp(b.z * 0.2, -0.45, 0.45), speed: 0.25 };
      const shiftX = THREE.MathUtils.clamp(b.x * 0.42, -1.2, 1.6);
      const tx = clampX(ax + shiftX + Math.sin(time * 0.23 + i * 1.7) * 0.25);
      const tz = clampZ(az + (b.z - az) * 0.18 + Math.cos(time * 0.19 + i) * 0.2);
      const far = Math.hypot(tx - agents[i].x, tz - agents[i].z) > 0.6;
      return { x: tx, z: tz, speed: (far ? 0.42 : 0.2) * (match ? 1.2 : 1) };
    },
  });

  return {
    get ball() { return game.ball; }, // lecture seule (tests, inspection)
    // But du match en direct : l'avant-centre reçoit le ballon, conduit vers la surface et frappe cadré.
    // Plan de coupe du ralenti : l'attaquant est replacé à l'entrée de la surface, déjà lancé vers le but.
    scriptGoal() {
      const k = 9;
      const p = agents[k];
      const z0 = rnd(-0.55, 0.55);
      p.x = 3.35; p.z = z0; p.h = 0; p.vx = 0.3; p.vz = 0; p.speed = 0.3; p.kick = 0;
      game.give(k, 'dribble');
      game.hold.t = { x: 3.95, z: z0 * 0.55 };
      game.hold.timer = 0.45;
      game.forceShot = true;
      const [sx, sz] = game.footSpot(p);
      game.ball.x = sx; game.ball.z = sz;
      game.prev = [sx, sz];
    },
    setFormation(formation) { // les joueurs rejoignent leurs nouveaux postes en courant
      anchors = anchorsOf(formation);
      defenders = formationOf(formation).lines[0];
    },
    setMode(m) {
      if (m.match !== undefined) match = m.match;
      if (m.baseY !== undefined) baseY = m.baseY;
    },
    update(dt, time) {
      const step = Math.min(dt, 0.05);
      game.update(step, time);
      agents.forEach((ag, i) => players.setAgent(i, ag, baseY));
      players.commit(11);
      placeBall(ball, game.ball, baseY);
    },
    dispose() { players.dispose(); parent.remove(ball); ball.geometry.dispose(); ball.material.dispose(); },
  };
}
