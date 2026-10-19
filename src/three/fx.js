import * as THREE from 'three';

// Effets : chantier (échafaudage, poussière, anneau doré), feux d'artifice, contour de survol.
// Tout est en unités du jeu (1 = 10 m). Les ressources de chaque effet sont libérées à sa fin.

const GOLD = 0xc7a15a;
const GOLD_LIGHT = 0xdec17f;

function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose());
  });
}

// --- Chantier -------------------------------------------------------------------------------------

function scaffold(w, d, h) {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.6, roughness: 0.4, transparent: true });
  const netMat = new THREE.MeshStandardMaterial({
    color: GOLD, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, roughness: 0.8,
  });
  const pole = new THREE.CylinderGeometry(0.012, 0.012, h, 5);
  const stepX = w / Math.max(2, Math.round(w / 0.8));
  const stepZ = d / Math.max(2, Math.round(d / 0.8));
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += stepX) {
    for (const z of [-d / 2, d / 2]) {
      const m = new THREE.Mesh(pole, poleMat);
      m.position.set(x, h / 2, z);
      g.add(m);
    }
  }
  for (let z = -d / 2 + stepZ; z < d / 2 - 1e-6; z += stepZ) {
    for (const x of [-w / 2, w / 2]) {
      const m = new THREE.Mesh(pole, poleMat);
      m.position.set(x, h / 2, z);
      g.add(m);
    }
  }
  const levels = Math.max(2, Math.round(h / 0.35));
  const plankX = new THREE.BoxGeometry(w, 0.012, 0.06);
  const plankZ = new THREE.BoxGeometry(0.06, 0.012, d);
  for (let i = 1; i <= levels; i++) {
    const y = (h * i) / levels;
    for (const z of [-d / 2, d / 2]) { const m = new THREE.Mesh(plankX, poleMat); m.position.set(0, y, z); g.add(m); }
    for (const x of [-w / 2, w / 2]) { const m = new THREE.Mesh(plankZ, poleMat); m.position.set(x, y, 0); g.add(m); }
  }
  const net = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h, d + 0.04), netMat);
  net.position.y = h / 2;
  g.add(net);
  g.userData.mats = [poleMat, netMat];
  return g;
}

function dust(w, d, n = 140) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * w;
    pos[i * 3 + 1] = Math.random() * 0.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * d;
    vel[i * 3] = (Math.random() - 0.5) * 0.6;
    vel[i * 3 + 1] = 0.25 + Math.random() * 0.6;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x8d8478, size: 0.18, transparent: true, opacity: 0.55, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.userData.vel = vel;
  return pts;
}

function ring(w, d) {
  const r = Math.max(w, d) * 0.6;
  const geo = new THREE.RingGeometry(r * 0.94, r, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.05;
  return m;
}

const easeOutBack = (t) => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

// Animation de construction / amélioration d'une parcelle.
// Phase « chantier » (≥ 0,7 s, et tant que le nouveau contenu n'est pas prêt) : l'ancien bâtiment reste
// en place sous l'échafaudage, la poussière monte. Phase « croissance » (1,4 s) : onGrow(node) remplace le
// contenu, le nouveau bâtiment sort de terre, l'échafaudage s'efface et un anneau doré se referme.
export class BuildAnimation {
  constructor(wrapper, footprint, height, onGrow) {
    this.wrapper = wrapper;
    this.onGrow = onGrow;
    this.t = 0;
    this.phase = 'site';
    this.growT = 0;
    this.content = null;
    this.pending = null;
    const h = Math.max(0.8, Math.min(height, 6));
    this.group = new THREE.Group();
    this.scaffold = scaffold(footprint.w * 0.8, footprint.d * 0.8, h);
    this.dust = dust(footprint.w, footprint.d);
    this.ring = ring(footprint.w, footprint.d);
    this.ring.visible = false;
    this.group.add(this.scaffold, this.dust, this.ring);
    wrapper.add(this.group);
    this.done = false;
  }

  // Nouveau contenu prêt (GLB ou repli procédural). Arrivé en retard, il prend la place tout de suite.
  provide(node) {
    if (this.done) { this.onGrow(node); return; }
    if (this.phase === 'grow') {
      this.content = this.onGrow(node);
      this.content.scale.y = Math.max(0.02, easeOutBack(this.growT));
    } else {
      this.pending = node;
    }
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const vel = this.dust.userData.vel;
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vel[i * 3] * dt;
      pos.array[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos.array[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos.array[i * 3 + 1] > 1.6 && this.phase === 'site') pos.array[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;
    if (this.phase === 'site') {
      this.scaffold.scale.y = Math.min(1, this.t / 0.45);
      if (this.t > 0.7 && this.pending) {
        this.phase = 'grow';
        this.content = this.onGrow(this.pending);
        this.content.scale.y = 0.02;
        this.pending = null;
        this.ring.visible = true;
      }
      return;
    }
    this.growT = Math.min(1, this.growT + dt / 1.4);
    if (this.content) this.content.scale.y = Math.max(0.02, easeOutBack(this.growT));
    const fade = 1 - this.growT;
    this.scaffold.userData.mats[0].opacity = fade;
    this.scaffold.userData.mats[1].opacity = 0.22 * fade;
    this.scaffold.position.y = -this.growT * 0.5;
    this.dust.material.opacity = 0.55 * fade;
    const rs = 0.3 + this.growT * 0.9;
    this.ring.scale.set(rs, 1, rs);
    this.ring.material.opacity = 0.9 * fade;
    if (this.growT >= 1) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (this.pending) this.content = this.onGrow(this.pending);
    if (this.content) this.content.scale.y = 1;
    this.wrapper.remove(this.group);
    disposeTree(this.group);
  }
}

// --- Feux d'artifice dorés ------------------------------------------------------------------------

export class Fireworks {
  constructor(scene, center, radius = 6) {
    this.scene = scene;
    this.center = center;
    this.radius = radius;
    this.bursts = [];
    this.cooldown = 0;
    this.active = false;
    this.queue = 0; // salve ponctuelle (but)
  }

  burst(n = 6) { this.queue += n; }

  spawn() {
    const n = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const o = new THREE.Vector3(
      this.center.x + (Math.random() - 0.5) * this.radius * 1.6,
      4 + Math.random() * 2.5,
      this.center.z + (Math.random() - 0.5) * this.radius,
    );
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1.6 + Math.random() * 1.2);
      pos.set([o.x, o.y, o.z], i * 3);
      vel.set([v.x, v.y, v.z], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: Math.random() < 0.75 ? GOLD_LIGHT : 0xf3f2ee, size: 0.16, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.userData = { vel, life: 0 };
    this.scene.add(pts);
    this.bursts.push(pts);
  }

  update(dt) {
    if (this.active || this.queue > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.spawn();
        this.cooldown = this.queue > 0 ? 0.12 + Math.random() * 0.15 : 0.35 + Math.random() * 0.5;
        if (this.queue > 0) this.queue--;
      }
    }
    this.bursts = this.bursts.filter((b) => {
      const { vel } = b.userData;
      b.userData.life += dt;
      const pos = b.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        vel[i * 3 + 1] -= 1.4 * dt; // gravité
        vel[i * 3] *= 0.985; vel[i * 3 + 1] *= 0.985; vel[i * 3 + 2] *= 0.985;
        pos.array[i * 3] += vel[i * 3] * dt;
        pos.array[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos.array[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      b.material.opacity = Math.max(0, 1 - b.userData.life / 1.8);
      if (b.userData.life > 1.8) { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); return false; }
      return true;
    });
  }

  dispose() {
    this.bursts.forEach((b) => { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); });
    this.bursts = [];
  }
}

// --- Contour de survol ----------------------------------------------------------------------------

export function hoverFrame() {
  const mat = new THREE.MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.9, depthWrite: false });
  const g = new THREE.Group();
  const bars = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), mat);
    g.add(m);
    return m;
  });
  g.visible = false;
  g.renderOrder = 2;
  return {
    group: g,
    show(x, z, w, d) {
      const t = 0.09;
      const W = w + 0.35, D = d + 0.35;
      g.position.set(x, 0.04, z);
      bars[0].scale.set(W, 1, t); bars[0].position.set(0, 0, -D / 2);
      bars[1].scale.set(W, 1, t); bars[1].position.set(0, 0, D / 2);
      bars[2].scale.set(t, 1, D); bars[2].position.set(-W / 2, 0, 0);
      bars[3].scale.set(t, 1, D); bars[3].position.set(W / 2, 0, 0);
      g.visible = true;
    },
    hide() { g.visible = false; },
    update(time) { mat.opacity = 0.55 + 0.35 * Math.sin(time * 4); },
    dispose() { bars.forEach((b) => b.geometry.dispose()); mat.dispose(); },
  };
}
