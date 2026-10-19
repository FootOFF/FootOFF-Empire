import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { PLAZA_CENTER, PLAZA_SIZE } from './layout';

// Rendu physique : sRGB + ACES, environment map PMREM, ciel physique, soleil avec ombres douces.

const lowEnd = () => (navigator.hardwareConcurrency || 4) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 600;

// Qualité graphique (menu) : économie = résolution 1 et pas d'ombres ; auto = selon l'appareil ; haute = tout.
export function pixelRatioFor(quality) {
  if (quality === 'economie') return 1;
  if (quality === 'haute') return Math.min(window.devicePixelRatio, 2);
  return Math.min(window.devicePixelRatio, lowEnd() ? 1.5 : 2);
}

export function createRenderer(mount, quality = 'auto') {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioFor(quality));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = quality !== 'economie';
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft supprimé en r18x : PCF + shadow.radius
  return renderer;
}

const DAY = {
  exposure: 0.75, env: 0.6, sun: 3.0, sunColor: 0xfff1dc, hemi: 0.5,
  fog: 0xc9d6e3, elevation: 38, azimuth: 135,
};
const NIGHT = {
  exposure: 0.85, env: 0.12, sun: 0.35, sunColor: 0x8ea4d8, hemi: 0.15,
  fog: 0x0b0c10, background: 0x0b0c10, // nuit proche du noir FootOFF (#090909)
};

export function createEnvironment(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;

  const sky = new Sky();
  sky.scale.setScalar(400);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  if (u.showSunDisc) u.showSunDisc.value = false;
  scene.add(sky);

  scene.fog = new THREE.Fog(DAY.fog, 70, 190);

  const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x4a5a3a, DAY.hemi);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd() ? 1024 : 2048, lowEnd() ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.target.position.set(PLAZA_CENTER[0], 0, PLAZA_CENTER[1]);
  scene.add(sun, sun.target);

  // Sol : herbe à perte de vue + esplanade pavée sous les parcelles.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x33442a, roughness: 1 }), // vert sombre, cohérent avec le site
  );
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(PLAZA_SIZE[0], 0.06, PLAZA_SIZE[1]),
    new THREE.MeshStandardMaterial({ color: 0x77787a, roughness: 0.92 }),
  );
  plaza.position.set(PLAZA_CENTER[0], -0.03, PLAZA_CENTER[1]); // dessus à y = 0
  plaza.receiveShadow = true;
  scene.add(plaza);

  // Projecteur du stade (sans ombre, coût faible), allumé la nuit.
  const flood = new THREE.SpotLight(0xfff4e0, 0, 40, Math.PI / 4.2, 0.5, 1.2);
  flood.position.set(0, 14, 6);
  flood.target.position.set(0, 0, 0);
  scene.add(flood, flood.target);

  const setSunFromAngles = (elevation, azimuth) => {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(60).add(sun.target.position);
  };
  setSunFromAngles(DAY.elevation, DAY.azimuth);

  // Ambiance continue selon l'heure (0-24) et la météo ('clear' | 'rain' | 'snow').
  // Soleil levé vers 6 h, couché vers 20 h, culmine à ~55° ; lumière dorée à l'aube et au crépuscule,
  // lune bleutée la nuit. Renvoie { dark, daylight } : dark déclenche fenêtres, LED et projecteurs.
  const cA = new THREE.Color(), cB = new THREE.Color();
  const mixHex = (a, b, t) => cA.set(a).lerp(cB.set(b), THREE.MathUtils.clamp(t, 0, 1));
  const WEATHER = {
    clear: { light: 1, fog: [70, 190], turbidity: 4, mie: 0.004, tint: null },
    rain: { light: 0.42, fog: [32, 130], turbidity: 12, mie: 0.02, tint: 0x6d7682 },
    snow: { light: 0.62, fog: [28, 120], turbidity: 9, mie: 0.015, tint: 0xc4cad2 },
  };

  function setAmbience({ hour = 13, weather = 'clear', hasStadiumLights = true } = {}) {
    const w = WEATHER[weather] || WEATHER.clear;
    const f = (hour - 6) / 14; // 0 au lever, 1 au coucher
    const elev = f >= 0 && f <= 1 ? 55 * Math.sin(Math.PI * f) : -12;
    const daylight = THREE.MathUtils.smoothstep(elev, -4, 14);
    const golden = elev > -4 ? THREE.MathUtils.clamp(1 - Math.abs(elev - 4) / 14, 0, 1) : 0;
    const az = 90 + 180 * THREE.MathUtils.clamp(f, 0, 1);
    setSunFromAngles(Math.max(elev, 4), az);

    renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, daylight);
    scene.environmentIntensity = THREE.MathUtils.lerp(NIGHT.env, DAY.env, daylight) * (0.6 + 0.4 * w.light);
    sun.intensity = THREE.MathUtils.lerp(NIGHT.sun, DAY.sun, daylight) * w.light;
    sun.color.copy(mixHex(NIGHT.sunColor, DAY.sunColor, daylight)).lerp(cB.set(0xff8a3d), golden * 0.9 * w.light);
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemi, DAY.hemi, daylight);

    const fog = mixHex(NIGHT.fog, DAY.fog, daylight).clone().lerp(cB.set(0xe0956a), golden * 0.8 * w.light);
    if (w.tint) fog.lerp(cB.set(w.tint), 0.7 * daylight);
    scene.fog.color.copy(fog);
    scene.fog.near = w.fog[0];
    scene.fog.far = w.fog[1];

    u.turbidity.value = w.turbidity;
    u.mieCoefficient.value = w.mie;
    u.rayleigh.value = 1.6 + golden * 1.8;
    const showSky = daylight > 0.12 && weather === 'clear';
    sky.visible = showSky;
    scene.background = showSky ? null : fog.clone().multiplyScalar(weather === 'clear' ? 1 : 0.92);

    const dark = daylight < 0.35;
    flood.intensity = dark && hasStadiumLights ? 60 : 0;
    return { dark, daylight };
  }

  // Compatibilité : ancienne bascule jour / nuit.
  function setNight(night, opts = {}) {
    return setAmbience({ ...opts, hour: night ? 23 : 13 });
  }

  function dispose() {
    envTex.dispose();
    sky.geometry.dispose();
    sky.material.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    plaza.geometry.dispose();
    plaza.material.dispose();
  }

  // Le site GLB (voirie, pelouses) remplace l'esplanade procédurale une fois chargé.
  const setPlazaVisible = (v) => { plaza.visible = v; };

  return { setAmbience, setNight, dispose, sun, setPlazaVisible };
}
