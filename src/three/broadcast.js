// Réalisation télé des temps forts (1.0.26) : caméra au téléobjectif qui cadre un groupe (ballon, porteur, receveur,
// cage et gardien quand une frappe se prépare), ressorts amortis critiques. Partagée par le jeu (Empire3D.jsx) et le banc
// des temps forts (tools/sim/temps-forts.js) : on filme au banc exactement ce que le jeu montre.
import * as THREE from 'three';
import { simulate as simulateBall } from './ballphysics';

export function createTvCamera(camera) {
  // Réalisation télé (1.0.26, audit de la caméra : au téléphone, la cage n'était entière à l'image que pour 57 % des
  // frappes, le gardien 62 %, le ballon sortait du cadre 8 % du temps ; à-coups à chaque frappe et au but). Caméra au
  // téléobjectif, dans l'axe de la tribune principale (au-dessus du toit, comme avant), qui cadre un groupe : le ballon,
  // où il sera dans une demi-seconde, le porteur, le receveur (s'il tient dans le plan), et, quand une frappe se prépare,
  // la cage et le gardien ; le zoom fait la place. Ressorts amortis critiques (vitesse continue, jamais d'à-coup) ;
  // zone de sécurité : sous le score, au-dessus des commandes. Mesuré au banc (192 temps forts, iPhone en portrait) :
  // cage entière à la frappe 57 → 78 %, gardien 62 → 94 %, ballon hors champ 8 → 3,6 %, à-coup maximal 91 → 38.
  const ORBIT = {
    phone: { R: 6.5, elev: 0.8, zFollow: 0.85, wMin: 1.5, wMax: 3.6, wPlay: 2.0, wAttack: 1.7, wSet: 2.2, wCel: 1.8, loose: true, wShould: 2.4, omegaAim: 3.0, omegaIn: 1.2, omegaOut: 3.5, top: 112, bottom: 100, side: 6 },
    // (1.0.31, maquettes pour le PDG) caméra derrière l'attaque, pour le téléphone tenu droit : la profondeur du terrain
    // occupe la hauteur de l'écran, le tireur, le gardien et la cage s'alignent sans élargir le plan ; le ballon pèse plus
    // dans la visée et la caméra suit vite de côté (la largeur étroite de l'écran). Mesuré (camstats, 72 frappes, 22 600
    // images, téléphone droit) : joueur au ballon 45 → 87 px à l'écran, cage entière à la frappe 92 → 97 %, gardien 94 →
    // 100 %, ballon au bord de l'écran 2,4 → 3,3 % des images
    phoneEnd: { end: true, R: 3.6, elev: 0.42, zFollow: 1, boxMix: 0.2, omegaLat: 5, wMin: 0.9, wMax: 2.3, wPlay: 1.3, wAttack: 1.2, wSet: 1.6, wCel: 1.3, loose: true, wShould: 1.8, omegaAim: 3.0, omegaIn: 1.2, omegaOut: 3.5, top: 112, bottom: 100, side: 6 },
    // la télé de côté, plus serrée : joueur 83 px, mais la cage n'est entière qu'à 60 % des frappes
    phoneClose: { R: 6.5, elev: 0.55, zFollow: 0.85, wMin: 0.95, wMax: 2.2, wPlay: 1.25, wAttack: 1.15, wSet: 1.6, wCel: 1.3, loose: true, wShould: 1.6, omegaAim: 3.0, omegaIn: 1.2, omegaOut: 3.5, top: 112, bottom: 100, side: 6 },
    land: { R: 6.5, elev: 0.5, zFollow: 0.7, wMin: 2.2, wMax: 5.5, wPlay: 3.8, wAttack: 3.0, wSet: 3.2, wCel: 2.2, loose: false, omegaAim: 3.0, omegaIn: 1.2, omegaOut: 3.5, top: 70, bottom: 70, side: 50 },
    desk: { R: 7.0, elev: 0.5, zFollow: 0.7, wMin: 2.8, wMax: 6.5, wPlay: 5.0, wAttack: 3.9, wSet: 4.0, wCel: 2.6, loose: false, omegaAim: 3.0, omegaIn: 1.2, omegaOut: 3.2, top: 80, bottom: 80, side: 10 },
  };
  const sd = (x, v, goal, omega, dt) => { // ressort amorti critique : position et vitesse
    const x2 = x - goal; const e = Math.exp(-omega * dt);
    return [goal + (x2 + (v + omega * x2) * dt) * e, (v - omega * (v + omega * x2) * dt) * e];
  };
  const orb = { init: false, x: 0, vx: 0, z: 0, vz: 0, lf: 0, vlf: 0 };
  const orbV = new THREE.Vector3(); const orbOff = new THREE.Vector3(); const orbAim = new THREE.Vector3();
  const orbBall = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, skid: 0 };
  const pick = { phone: null }; // (maquettes) profil du téléphone tenu droit : null = 'phone', ou 'phoneEnd', 'phoneClose'
  function step(mi, dt, W, H, tvElev) {
    const w = mi.world; const { b, ag } = w;
    const aspect = W / H;
    const key = aspect >= 1 && H <= 500 ? 'land' : W <= 760 && aspect < 1 ? 'phone' : 'desk';
    const o = ORBIT[(key === 'phone' && pick.phone) || key];
    const dirA = Math.sign(mi.goalX || 1);
    // derrière l'attaque : la caméra ne recule jamais au-delà de la ligne de but opposée (pas de tribune entre elle et le jeu)
    const elev = o.end ? o.elev : Math.max(o.elev, tvElev + 0.02); // jamais sous le couloir de la caméra télé (toit de l'arène)
    const R = o.end ? Math.max(2.4, Math.min(o.R, ((orb.init ? orb.x : b.x) * dirA + 5.3) / Math.cos(elev))) : o.R;
    const safeX = 0.8 * (1 - (2 * o.side) / W), safeY = 0.8 * (1 - (o.top + o.bottom) / H);
    const yShift = (o.top - o.bottom) / 2 / H;
    const place = (fov) => {
      if (o.end) orbOff.set(-dirA * Math.cos(elev), Math.sin(elev), 0).multiplyScalar(R);
      else orbOff.set(0, Math.sin(elev), Math.cos(elev)).multiplyScalar(R);
      camera.position.copy(orbAim).add(orbOff);
      camera.fov = fov; camera.updateProjectionMatrix();
      camera.lookAt(orbAim);
      camera.rotateX(yShift * THREE.MathUtils.degToRad(fov)); // le centre optique au milieu de la zone sûre
      camera.updateMatrixWorld();
    };
    // les points à cadrer : [x, y, z, poids, obligatoire (true), souhaité si la place le permet ('should')]
    const pts = [];
    let lx = b.x, lz = b.z;
    if (b.state === 'pass' || b.state === 'shot' || b.state === 'free') {
      Object.assign(orbBall, { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, sx: b.sx || 0, sy: b.sy || 0, sz: b.sz || 0, skid: b.skid || 0 });
      const e = simulateBall(orbBall, 0.5); lx = e.x; lz = e.z;
    } else if (b.state === 'held' && b.owner >= 0) { lx = b.x + ag[b.owner].vx * 0.5; lz = b.z + ag[b.owner].vz * 0.5; }
    const subjectBall = mi.cam !== 'celebrate' && mi.cam !== 'card';
    if (subjectBall) {
      pts.push([b.x, b.y, b.z, 3, true], [lx, 0, lz, 1.5, true]);
      if (b.state === 'held' && b.owner >= 0) pts.push([ag[b.owner].x, 0.18, ag[b.owner].z, 1, true]);
      const rcv = w.recvTo >= 0 ? w.recvTo : w.recvNext;
      if (rcv >= 0) { const r = ag[rcv]; pts.push([r.x, 0, r.z, 1, o.loose ? 'should' : true], [r.x, 0.18, r.z, 0, o.loose ? 'should' : true]); }
      const gx = mi.goalX; const fu = Math.abs(b.x - gx);
      const shooting = b.state === 'shot' || w.bt === 'shot' || (w.recvTo >= 0 && w.recvTo === w.shooter) || (b.state === 'held' && b.owner === w.shooter && fu < 3.2);
      if (shooting || mi.cam === 'set' || fu < 2.6) { // frappe qui se prépare, coup de pied arrêté, dernier quart : la cage et le gardien
        const must = shooting || mi.cam === 'set' || (fu < 2.0 ? (o.loose ? 'should' : true) : false);
        pts.push([gx, 0.244, -0.366, 0.5, must], [gx, 0.244, 0.366, 0.5, must], [gx, 0, 0, 0.5, must]);
        if (w.keeper >= 0) pts.push([ag[w.keeper].x, 0.18, ag[w.keeper].z, 0.5, must]);
      }
    } else if (mi.cam === 'celebrate' && w.shooter >= 0) {
      const s = ag[w.shooter]; pts.push([s.x, 0.1, s.z, 3, true], [s.x, 0.19, s.z, 1, true], [s.x, 0, s.z, 1, true]);
    } else pts.push([mi.x, 0.1, mi.z, 3, true], [mi.x, 0.24, mi.z, 1, true], [mi.x, 0, mi.z, 1, true]);
    // cadrage souple : les points souhaités n'entrent que s'ils tiennent dans la largeur wShould
    let use = pts.filter((p) => p[4] && p[4] !== 'should');
    const want = pts.filter((p) => p[4]);
    if (want.length > use.length) {
      const xs = want.map((p) => p[0]), zs = want.map((p) => p[2]);
      const sx = Math.max(...xs) - Math.min(...xs), sz = Math.max(...zs) - Math.min(...zs);
      const k = aspect < 1 ? 0.3 : 0.9; // la profondeur (en hauteur à l'écran) coûte moins de largeur
      const span = o.end ? Math.max(sz, sx * k) : Math.max(sx, sz * k);
      if (span / 0.8 <= (o.wShould || 0)) use = want;
    }
    const opt = pts.filter((p) => !p[4]);
    let sw = 0, cx = 0, cz = 0;
    for (const [x, , z, wt] of [...use, ...opt]) { sw += wt; cx += x * wt; cz += z * wt; }
    cx /= sw || 1; cz /= sw || 1;
    const bx = Math.min(...use.map((p) => p[0])), Bx = Math.max(...use.map((p) => p[0]));
    const bz = Math.min(...use.map((p) => p[2])), Bz = Math.max(...use.map((p) => p[2]));
    const mix = o.boxMix ?? 0.6; // part du centre du groupe (le reste : le barycentre, où pèse le ballon)
    const ax = ((bx + Bx) / 2) * mix + cx * (1 - mix), az = (((bz + Bz) / 2) * mix + cz * (1 - mix)) * o.zFollow;
    // le zoom : le plan de base, élargi pour tenir les points obligatoires (mesurés dans la vue visée)
    const wPlan = { play: o.wPlay, attack: o.wAttack, set: o.wSet, celebrate: o.wCel, card: o.wCel }[mi.cam] || o.wAttack;
    const vF = (h) => 2 * Math.atan(Math.tan(h) / aspect);
    orbAim.set(ax, 0, az); place(30);
    let needH = 0, needV = 0;
    for (const p of use) {
      orbV.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse);
      const zf = Math.max(0.05, -orbV.z);
      needH = Math.max(needH, Math.abs(Math.atan(orbV.x / zf)) / safeX);
      needV = Math.max(needV, Math.abs(Math.atan(orbV.y / zf) + yShift * THREE.MathUtils.degToRad(30)) / safeY);
    }
    const hPlan = Math.atan(wPlan / 2 / R), hMin = Math.atan(o.wMin / 2 / R), hMax = Math.atan(o.wMax / 2 / R);
    const fov = THREE.MathUtils.clamp(Math.max(vF(Math.max(hPlan, needH)), 2 * needV), vF(hMin), vF(hMax));
    if (!orb.init || mi.cut) Object.assign(orb, { x: ax, vx: 0, z: az, vz: 0, lf: Math.log(fov), vlf: 0, init: true });
    else {
      // (derrière l'attaque, le côté du terrain est la largeur étroite de l'écran : la caméra y suit plus vite)
      [orb.x, orb.vx] = sd(orb.x, orb.vx, ax, o.omegaAim, dt);
      [orb.z, orb.vz] = sd(orb.z, orb.vz, az, o.end ? (o.omegaLat ?? o.omegaAim) : o.omegaAim * 0.8, dt);
      const lf = Math.log(fov);
      [orb.lf, orb.vlf] = sd(orb.lf, orb.vlf, lf, lf > orb.lf ? o.omegaOut : o.omegaIn, dt);
    }
    orbAim.set(orb.x, 0, orb.z);
    const fovDeg = THREE.MathUtils.radToDeg(Math.exp(orb.lf));
    place(fovDeg);
    // zone souple : le ballon ne sort jamais de la zone sûre (rattrapage limité, sans à-coup)
    if (subjectBall) {
      orbV.set(b.x, b.y, b.z).project(camera);
      const yC = -2 * yShift, lxs = safeX * 1.12, lys = safeY * 1.12;
      const ex = Math.abs(orbV.x) > lxs ? orbV.x - Math.sign(orbV.x) * lxs : 0;
      const ey = Math.abs(orbV.y - yC) > lys ? (orbV.y - yC) - Math.sign(orbV.y - yC) * lys : 0;
      if (ex || ey) {
        const t2 = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
        const lim = 2.5 * dt;
        const right = THREE.MathUtils.clamp(ex * t2 * aspect * R, -lim, lim); // vers la droite de l'écran
        const ahead = THREE.MathUtils.clamp((ey * t2 * R) / Math.sin(elev), -lim, lim); // vers le haut de l'écran
        if (o.end) { orb.z += dirA * right; orb.x += dirA * ahead; } // regard vers +x (ou -x) : la droite est +z (ou -z)
        else { orb.x += right; orb.z -= ahead; } // regard vers -z : la droite est +x
        orbAim.set(orb.x, 0, orb.z); place(fovDeg);
      }
    }
  }
  if (import.meta.env?.DEV && typeof window !== 'undefined') window.__tv = { orb, aim: orbAim, camera, ORBIT, pick };
  return { step, aim: orbAim, pick, orbit: ORBIT, reset() { orb.init = false; } };
}
