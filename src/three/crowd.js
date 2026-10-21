import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Public du stade, les jours de match seulement : supporters assis sur les gradins (places tirées sur le dessus
// des rangées de sièges du modèle), tournés vers la pelouse. Leur nombre suit l'affluence du match, en remplissant
// d'abord les rangs bas et le centre. Un parcage visiteurs aux couleurs adverses occupe un virage.
// Animation dans le vertex shader (aucun calcul par supporter côté processeur) : léger balancement, et sur un but
// le camp concerné se lève, saute et lève les bras.

const SKINS = [0xf1c9a5, 0xe0ac84, 0xc68863, 0x9c6644, 0x7a4b2f, 0x5a3420];
const HOME_COLORS = [0xc7a15a, 0xc7a15a, 0xc7a15a, 0xdec17f, 0x161618, 0x161618, 0x161618, 0xeeeeee, 0xeeeeee, 0x4a4a4e];

function piece(geo, part) {
  const g = geo.toNonIndexed();
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  g.deleteAttribute('uv');
  return g;
}
// supporter assis, en mètres, face vers +X : buste, bras le long du corps (articulés à l'épaule), tête
function fanGeometries() {
  const body = mergeGeometries([
    piece(new THREE.BoxGeometry(0.26, 0.5, 0.42).translate(0, 0.27, 0), 0),
    piece(new THREE.BoxGeometry(0.34, 0.1, 0.4).translate(0.12, 0.05, 0), 0), // cuisses
    piece(new THREE.BoxGeometry(0.09, 0.42, 0.09).translate(0.02, 0.29, 0.25), 1),
    piece(new THREE.BoxGeometry(0.09, 0.42, 0.09).translate(0.02, 0.29, -0.25), 1),
  ]);
  const head = piece(new THREE.SphereGeometry(0.1, 8, 6).translate(0.01, 0.66, 0), 0);
  return { body, head };
}

const SHADER = `
  attribute float aPart;
  attribute vec2 aSeed; // x : phase, y : camp (0 club, 1 visiteurs)
  uniform float uTime;
  uniform vec2 uCheer;
  vec3 fanPose(vec3 p) {
    float cheer = aSeed.y < 0.5 ? uCheer.x : uCheer.y;
    float ph = aSeed.x * 6.2831;
    if (aPart > 0.5) { // bras levés au-dessus de la tête
      float a = cheer * (2.5 + 0.35 * sin(uTime * 8.0 + ph));
      vec2 q = vec2(p.x, p.y - 0.5);
      p.x = q.x * cos(a) - q.y * sin(a);
      p.y = q.x * sin(a) + q.y * cos(a) + 0.5;
    }
    float jump = cheer * max(0.0, sin(uTime * 9.0 + ph)) * 0.16;
    p.y += cheer * 0.32 + jump;
    p.z += sin(uTime * 1.3 + ph) * 0.015 * (1.0 - cheer);
    return p;
  }`;

function crowdMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCheer = uniforms.uCheer;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SHADER}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = fanPose(transformed);');
  };
  return m;
}

// Places sur le dessus des rangées de sièges (matériaux « seats ») du stade, dans le repère de `root`.
function sampleSeats(node, root, maxPts, groundY, standing = true) {
  node.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const pts = [];
  const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  const CELL = 0.0042; // une place ≈ 0,5 × 0,85 m
  node.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const mats = [].concat(o.material);
    if (!mats.some((m) => /seat/i.test(m?.name || ''))) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const M = inv.clone().multiply(o.matrixWorld);
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(M);
      b2.fromBufferAttribute(pos, i1).applyMatrix4(M);
      c.fromBufferAttribute(pos, i2).applyMatrix4(M);
      ab.subVectors(b2, a); ac.subVectors(c, a);
      n.crossVectors(ab, ac);
      const area = n.length() / 2;
      if (area < 1e-6 || Math.abs(n.y) / (2 * area) < 0.75) continue; // dessus des sièges seulement
      let k = area / CELL;
      k = Math.floor(k) + (Math.random() < k % 1 ? 1 : 0);
      for (let s = 0; s < k; s++) {
        let u = Math.random(), v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        pts.push([a.x + ab.x * u + ac.x * v, Math.max(a.y, b2.y, c.y), a.z + ab.z * u + ac.z * v]);
      }
    }
  });
  // petit stade (peu de sièges) : le public se tient debout le long de la main courante, comme au stade de quartier
  if (standing && pts.length < 350) {
    const stand = (x, z) => pts.push([x, groundY + 0.045, z, -1]);
    for (let x = -5.5; x <= 5.5; x += 0.055) {
      for (const row of [0, 1]) {
        stand(x + row * 0.027, 3.85 + row * 0.07); // côté caméra
        if (Math.abs(x) > 1.7) stand(x + row * 0.027, -(3.85 + row * 0.07)); // côté club-house, de part et d'autre
      }
    }
    for (let z = -3.1; z <= 3.1; z += 0.06) for (const sx of [-1, 1]) stand(sx * 5.85, z);
  }
  // rangs bas et centre d'abord : avec une affluence partielle, le stade se remplit comme en vrai
  const ext = pts.reduce((m, p) => Math.max(m, Math.abs(p[0])), 1);
  const minY = pts.reduce((m, p) => Math.min(m, p[1]), Infinity);
  for (const p of pts) p[4] = (p[3] === -1 ? 0.4 : 0) + Math.abs(p[0]) / ext * 0.35 + (p[1] - minY) * 1.6 + Math.random() * 0.9;
  pts.sort((x, y) => x[4] - y[4]);
  return pts.slice(0, maxPts);
}

export function createCrowd(parent) {
  const uniforms = { uTime: { value: 0 }, uCheer: { value: new THREE.Vector2(0, 0) } };
  const { body, head } = fanGeometries();
  let meshes = null;
  let seats = [];
  let source = null;
  let fill = 0;
  let max = 2000;
  let boost = 1;
  let ground = 0.006;
  const cheer = [0, 0];
  const hold = [0, 0];
  const colors = { away: 0xf2f2f2 };

  function build() {
    meshes?.forEach((m) => { parent.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); });
    meshes = null;
    if (!seats.length) return;
    const count = seats.length;
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    const awayLimit = seats.reduce((m, p) => Math.max(m, p[0]), -Infinity) * 0.55;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(0.1, 0.1, 0.1);
    const UP = new THREE.Vector3(0, 1, 0);
    const bodyGeo = body.clone();
    const headGeo = head.clone();
    bodyGeo.setAttribute('aSeed', seed);
    headGeo.setAttribute('aSeed', seed);
    const mb = new THREE.InstancedMesh(bodyGeo, crowdMaterial(uniforms), count);
    const mh = new THREE.InstancedMesh(headGeo, crowdMaterial(uniforms), count);
    const col = new THREE.Color();
    seats.forEach(([x, y, z], i) => {
      const away = x > awayLimit && z > 0 ? 1 : 0; // parcage visiteurs : un quart de virage
      seed.setXY(i, Math.random(), away);
      P.set(x, y, z);
      Q.setFromAxisAngle(UP, Math.atan2(z, -x));
      M.compose(P, Q, Sc);
      mb.setMatrixAt(i, M);
      mh.setMatrixAt(i, M);
      mb.setColorAt(i, col.setHex(away ? (Math.random() < 0.7 ? colors.away : 0xf2f2f2) : HOME_COLORS[(Math.random() * HOME_COLORS.length) | 0]));
      mh.setColorAt(i, col.setHex(SKINS[(Math.random() * SKINS.length) | 0]));
    });
    meshes = [mb, mh];
    meshes.forEach((m) => { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.count = 0; parent.add(m); });
    apply();
  }
  function apply() {
    if (!meshes) return;
    const n = Math.round(seats.length * fill);
    meshes.forEach((m) => { m.count = n; m.visible = n > 0; });
  }

  return {
    // nouveau modèle de stade (niveau) : les places sont recalculées au prochain affichage
    // big : arène des niveaux 5 et 6, un tiers de supporters en plus pour ne pas paraître vide (sauf en mode économie)
    setStadium(node, groundY = 0.006, big = false) { source = node; ground = groundY; boost = big ? 1.3 : 1; seats = []; if (fill > 0) this.refresh(); },
    setQuality(q) { const next = q === 'economie' ? 800 : q === 'haute' ? 3200 : 1900; if (next !== max) { max = next; seats = []; if (fill > 0) this.refresh(); } },
    refresh() {
      if (!source) return;
      if (!seats.length) {
        seats = sampleSeats(source, parent, max > 800 ? Math.round(max * boost) : max, ground);
        build();
      }
    },
    // fraction des places occupées (affluence / capacité) et couleur du parcage visiteurs
    show(fraction, awayColor) {
      fill = Math.max(0, Math.min(1, fraction));
      if (awayColor !== undefined && awayColor !== colors.away) { colors.away = awayColor; seats.length && build(); }
      if (fill > 0) this.refresh();
      apply();
    },
    hide() { fill = 0; apply(); },
    get debug() { return { seats: seats.length, fill, shown: meshes ? meshes[0].count : 0, source: !!source }; },
    cheer(side, strength = 1, seconds = 3.5) { cheer[side] = Math.max(cheer[side], strength); hold[side] = Math.max(hold[side], seconds); },
    update(dt, time) {
      uniforms.uTime.value = time;
      for (const s of [0, 1]) {
        if (hold[s] > 0) hold[s] -= dt;
        else cheer[s] = Math.max(0, cheer[s] - dt * 0.8);
      }
      uniforms.uCheer.value.set(cheer[0], cheer[1]);
    },
    dispose() {
      meshes?.forEach((m) => { parent.remove(m); m.material.dispose(); m.dispose(); });
      body.dispose(); head.dispose();
    },
  };
}
