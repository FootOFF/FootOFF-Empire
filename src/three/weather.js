import * as THREE from 'three';

// Météo : pluie (traits obliques rapides) et neige (flocons qui dérivent), dans un volume qui suit le
// point visé par la caméra. Une seule géométrie par type, mise à jour sur place (pas d'allocation).

const BOX = { w: 46, h: 22, d: 36 };

// Météo « automatique » : déterministe pour une date donnée (tout le monde a le même temps le même
// jour), saisonnière : neige possible de décembre à février, pluie plus fréquente en automne.
export function autoWeather(date = new Date()) {
  const seed = date.getFullYear() * 400 + date.getMonth() * 32 + date.getDate();
  const r = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const m = date.getMonth();
  if (m === 11 || m <= 1) return r < 0.4 ? 'snow' : r < 0.6 ? 'rain' : 'clear';
  if (m >= 8 && m <= 10) return r < 0.35 ? 'rain' : 'clear';
  return r < 0.18 ? 'rain' : 'clear';
}

function rainLayer(n = 2600) {
  const pos = new Float32Array(n * 6);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * BOX.w, y = Math.random() * BOX.h, z = (Math.random() - 0.5) * BOX.d;
    pos.set([x, y, z, x + 0.06, y + 0.42, z], i * 6);
    speed[i] = 15 + Math.random() * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.32, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.userData.speed = speed;
  return lines;
}

function snowLayer(n = 3200) {
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * BOX.w, Math.random() * BOX.h, (Math.random() - 0.5) * BOX.d], i * 3);
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.11, transparent: true, opacity: 0.85, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.phase = phase;
  return pts;
}

export function createWeather(scene) {
  const group = new THREE.Group();
  const rain = rainLayer();
  const snow = snowLayer();
  group.add(rain, snow);
  scene.add(group);
  let kind = 'clear';

  const set = (k) => {
    kind = k;
    rain.visible = k === 'rain';
    snow.visible = k === 'snow';
  };
  set('clear');

  return {
    set,
    get kind() { return kind; },
    update(dt, time, focus) {
      if (kind === 'clear') return;
      group.position.set(focus.x, 0, focus.z);
      if (kind === 'rain') {
        const p = rain.geometry.attributes.position.array;
        const sp = rain.userData.speed;
        for (let i = 0; i < sp.length; i++) {
          const k = i * 6;
          const dy = sp[i] * dt;
          p[k + 1] -= dy; p[k + 4] -= dy;
          p[k] -= dy * 0.14; p[k + 3] -= dy * 0.14; // léger vent
          if (p[k + 1] < 0) {
            const x = (Math.random() - 0.5) * BOX.w, z = (Math.random() - 0.5) * BOX.d;
            p[k] = x; p[k + 1] = BOX.h; p[k + 2] = z;
            p[k + 3] = x + 0.06; p[k + 4] = BOX.h + 0.42; p[k + 5] = z;
          }
        }
        rain.geometry.attributes.position.needsUpdate = true;
      } else {
        const p = snow.geometry.attributes.position.array;
        const ph = snow.userData.phase;
        for (let i = 0; i < ph.length; i++) {
          const k = i * 3;
          p[k + 1] -= (0.9 + (i % 7) * 0.08) * dt;
          p[k] += Math.sin(time * 0.8 + ph[i]) * 0.25 * dt;
          p[k + 2] += Math.cos(time * 0.6 + ph[i]) * 0.18 * dt;
          if (p[k + 1] < 0) {
            p[k] = (Math.random() - 0.5) * BOX.w; p[k + 1] = BOX.h; p[k + 2] = (Math.random() - 0.5) * BOX.d;
          }
        }
        snow.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(group);
      [rain, snow].forEach((o) => { o.geometry.dispose(); o.material.dispose(); });
    },
  };
}
