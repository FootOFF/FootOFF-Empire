import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAZA_CENTER, PLAZA_SIZE } from './layout';
import { GRADE, MOMENTS, createPhotoSky, lookFor } from './sky';

// Rendu physique : sRGB + ACES, ciel photographié (dôme, environnement, brume) selon le moment de la journée,
// soleil calé sur celui de la photo, ombres douces.

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
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = quality !== 'economie';
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft supprimé en r18x : PCF + shadow.radius
  return renderer;
}

const FADE = 4; // secondes : les lumières suivent le fondu du ciel

export function createEnvironment(scene, renderer, { quality = 'auto' } = {}) {
  // environnement provisoire (studio neutre) le temps que le premier ciel arrive
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = roomTex;
  scene.environmentIntensity = 0.5;

  scene.fog = new THREE.Fog(0xc9d6e3, 70, 190);
  scene.background = new THREE.Color(0xc9d6e3); // couvert par le dôme du ciel dès qu'il est chargé

  const hemi = new THREE.HemisphereLight(0xdbe8ff, 0x4a5a3a, 0.5); // provisoire, éteinte avec le ciel photo
  scene.add(hemi);

  // ciel photographié : dôme, environnement (reflets et lumière ambiante), couleur d'horizon pour la brume
  const photo = createPhotoSky(renderer, { quality });
  scene.add(photo.dome);
  const skyEnvListeners = new Set();
  let dark = false;
  photo.onEnv((tex) => {
    scene.environment = tex;
    scene.environmentIntensity = cur ? cur.ambient : 1; // radiance du ciel : ambiance et soleil restent cohérents
    hemi.intensity = 0;
    skyEnvListeners.forEach((fn) => fn(tex, dark));
  });

  const sun = new THREE.DirectionalLight(0xfff1dc, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd() ? 1024 : 2048, lowEnd() ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; // tout le complexe (profondeur : 0,5 - 500 par défaut)
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.target.position.set(PLAZA_CENTER[0], 0, PLAZA_CENTER[1]);
  scene.add(sun, sun.target);

  // Lumière d'appoint (sans ombre, coût minime) : venue du côté de la caméra, elle garde le complexe lisible au
  // coucher du soleil, à l'aube et la nuit, comme l'éclairage public et le ciel réfléchi le feraient.
  const fill = new THREE.DirectionalLight(0xffe4c8, 0);
  fill.target.position.copy(sun.target.position);
  scene.add(fill, fill.target);

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

  // état des lumières, fondu d'une ambiance à l'autre en même temps que le ciel
  const snap = (look) => ({
    sunDir: look.sunDir.clone(), sunI: look.sunI, sunColor: look.sunColor.clone(), ambient: look.ambient, exposure: look.exposure, haze: look.haze,
    fill: look.fill, fillDir: look.fillDir.clone(), fillColor: look.fillColor.clone(),
    grade: { ...look.grade, bloom: [...look.grade.bloom] },
  });
  let cur = null;
  let from = null;
  let target = null;
  let k = 1;
  let ambienceKey = '';
  const grade = { sat: 1, contrast: 1, warm: 0, vignette: 0, bloom: [0, 0, 1] };

  // Ambiance : moment de la journée (sky.js) et météo ('clear' | 'rain' | 'snow'). Renvoie { dark, lights } :
  // lights (0 à 1) règle l'éclairage du complexe (fenêtres, LED, lampadaires, projecteurs), dark la nuit.
  function setAmbience({ moment = 'day', weather = 'clear', hasStadiumLights = true } = {}) {
    const key = `${moment}|${weather}`;
    if (key !== ambienceKey) {
      ambienceKey = key;
      target = lookFor(moment, weather);
      if (!cur) cur = snap(target);
      else { from = snap(cur); k = 0; }
      photo.set(target);
      dark = target.dark;
      scene.userData.fogBase = target.fog; // distances de référence, reculées avec la caméra (vue d'ensemble)
    }
    flood.intensity = hasStadiumLights ? 60 * target.lights : 0;
    return { dark, lights: target.lights };
  }

  // réglage à chaud (développement) : réapplique l'ambiance courante après modification de MOMENTS ou GRADE
  function retune() {
    const [moment, weather] = ambienceKey.split('|');
    target = lookFor(moment, weather);
    cur = snap(target);
    from = null;
    k = 1;
    photo.set(target);
  }

  const view = new THREE.Vector3();
  const fogCol = new THREE.Color();
  const lerpN = THREE.MathUtils.lerp;
  function update(dt, camera) {
    if (!target) return;
    photo.update(dt);
    if (from && k < 1) {
      k = Math.min(1, k + dt / FADE);
      const t = THREE.MathUtils.smoothstep(k, 0, 1);
      cur.sunDir.copy(from.sunDir).lerp(target.sunDir, t).normalize();
      cur.sunI = lerpN(from.sunI, target.sunI, t);
      cur.ambient = lerpN(from.ambient, target.ambient, t);
      cur.exposure = lerpN(from.exposure, target.exposure, t);
      cur.haze = lerpN(from.haze, target.haze, t);
      cur.fill = lerpN(from.fill, target.fill, t);
      cur.fillDir.copy(from.fillDir).lerp(target.fillDir, t).normalize();
      cur.fillColor.copy(from.fillColor).lerp(target.fillColor, t);
      cur.sunColor.copy(from.sunColor).lerp(target.sunColor, t);
      for (const g of ['sat', 'contrast', 'warm', 'vignette']) cur.grade[g] = lerpN(from.grade[g], target.grade[g], t);
      cur.grade.bloom = from.grade.bloom.map((v, i) => lerpN(v, target.grade.bloom[i], t));
      if (k >= 1) from = null;
    }
    sun.position.copy(cur.sunDir).multiplyScalar(60).add(sun.target.position);
    sun.intensity = cur.sunI;
    sun.color.copy(cur.sunColor);
    fill.position.copy(cur.fillDir).multiplyScalar(60).add(fill.target.position);
    fill.intensity = cur.fill;
    fill.color.copy(cur.fillColor);
    if (photo.envTexture) scene.environmentIntensity = cur.ambient;
    renderer.toneMappingExposure = cur.exposure;
    Object.assign(grade, cur.grade);
    // brume : couleur de l'horizon du ciel dans la direction du regard (le relief lointain s'y fond)
    camera.getWorldDirection(view);
    const phi = Math.atan2(view.x, -view.z);
    if (!photo.horizon(phi, fogCol)) photo.horizonOfLook(target, phi, fogCol);
    scene.fog.color.copy(fogCol.multiplyScalar(cur.haze));
    scene.background.copy(fogCol);
  }

  function dispose() {
    photo.dispose();
    roomTex.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    plaza.geometry.dispose();
    plaza.material.dispose();
  }

  // Le site GLB (voirie, pelouses) remplace l'esplanade procédurale une fois chargé.
  const setPlazaVisible = (v) => { plaza.visible = v; };

  // L'écrin naturel (landscape.js) remplace le sol uni d'origine.
  const setGroundVisible = (v) => { ground.visible = v; };

  const onSkyEnv = (fn) => { skyEnvListeners.add(fn); if (photo.envTexture) fn(photo.envTexture, dark); };

  return {
    setAmbience, update, dispose, sun, setPlazaVisible, setGroundVisible, onSkyEnv,
    setQuality: (q) => photo.setQuality(q),
    veilMaterial: (lo, hi) => photo.veilMaterial(lo, hi),
    tune: { MOMENTS, GRADE, retune },
    get grade() { return grade; },
    get skySettled() { return photo.settled; },
    get sunDir() { return cur ? cur.sunDir : sun.position; },
  };
}
