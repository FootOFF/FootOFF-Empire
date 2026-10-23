import * as THREE from 'three';

// Outils communs aux épreuves : pose d'un joueur, courbes, allers-retours, matériel d'entraînement.

export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// aller-retour régulier entre a et b (période complète p, en secondes), départ en a
export const pingPong = (t, a, b, p) => { const f = (t / p) % 1; const k = f < 0.5 ? f * 2 : 2 - f * 2; return a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * k)); };

// État d'un joueur pour createPlayers (players.js) : cap h (0 = vers +x, -π/2 = vers -z), foulée, frappe, joie,
// bascule (roll, autour de l'axe du regard), soulèvement (lift).
export function agent(x, z, h = -Math.PI / 2) {
  return { x, z, h, phase: Math.random() * Math.PI * 2, gait: 0, kick: 0, cheer: 0, roll: 0, lift: 0, lean: 0 };
}
// avance la foulée d'un joueur qui se déplace à `speed` (unités du jeu par seconde)
export function stride(ag, speed, dt) {
  const g = Math.min(1, speed / 0.7);
  ag.gait += (g - ag.gait) * Math.min(1, dt * 10);
  ag.phase += (2 * Math.PI * speed * dt) / (0.16 + 0.22 * ag.gait);
}
// déplace un joueur vers (x, z) à la vitesse donnée ; renvoie true à l'arrivée
export function walkTo(ag, x, z, speed, dt, face = null) {
  const dx = x - ag.x, dz = z - ag.z;
  const d = Math.hypot(dx, dz);
  const step = Math.min(d, speed * dt);
  if (d > 1e-5) { ag.x += (dx / d) * step; ag.z += (dz / d) * step; }
  const h = face ?? (d > 0.002 ? Math.atan2(dz, dx) : ag.h);
  const diff = Math.atan2(Math.sin(h - ag.h), Math.cos(h - ag.h));
  ag.h += Math.max(-8 * dt, Math.min(8 * dt, diff));
  stride(ag, d > 0.002 ? speed : 0, dt);
  return d <= 0.002;
}

// Courbe de Bézier quadratique (trajectoire du ballon).
export function bezier(out, a, c, b, t) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}

// Plots d'entraînement (orange fluo), petits et nombreux : un seul maillage instancié.
export function cones(stage, spots, color = 0xff7a1a, parent = stage.scene) {
  const geo = stage.keep(new THREE.ConeGeometry(0.012, 0.03, 16, 1, true).translate(0, 0.015, 0));
  const mat = stage.keep(new THREE.MeshStandardMaterial({ color, roughness: 0.55, side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z], i) => mesh.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
  parent.add(mesh);
  return mesh;
}
