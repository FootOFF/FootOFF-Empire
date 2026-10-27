import * as THREE from 'three';
import { SKIES } from './skies.generated';
import { trackLoad } from './assets';

// Ciels photographiés (HDRI Poly Haven, CC0, convertis par scripts/sky/build.mjs) : dôme du ciel, environnement
// (reflets, lumière ambiante) et couleur de l'horizon pour la brume. L'heure réelle choisit un « moment » de la
// journée ; chaque moment tourne sa photo pour placer le soleil là où il flatte le complexe vu d'ensemble (caméra
// au sud, regard vers le nord), et le soleil du jeu suit celui de la photo : ombres et ciel concordent.

const DEG = Math.PI / 180;
const BASE = import.meta.env.BASE_URL;
const BINS = 32;
const FADE = 4; // secondes de fondu entre deux ciels

// Heures du lever et du coucher (centre de la France, ~46,6° N 2,4° E), en heure locale de l'appareil.
export function sunTimes(date = new Date()) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const g = ((2 * Math.PI) / 365) * (doy - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const lat = 46.6 * DEG;
  const cosHa = Math.cos(90.833 * DEG) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const ha = Math.acos(THREE.MathUtils.clamp(cosHa, -1, 1)) / DEG;
  const noon = 720 - 4 * 2.4 - eqt - date.getTimezoneOffset(); // minutes, heure locale
  return { sunrise: (noon - 4 * ha) / 60, sunset: (noon + 4 * ha) / 60 };
}

// Moment de la journée : heure réelle (lever et coucher de la saison), journée ou nuit forcées, soirée de match.
export function momentAt(date = new Date(), { timeMode = 'auto', matchDay = false } = {}) {
  if (matchDay || timeMode === 'night') return 'night';
  if (timeMode === 'day') return 'day';
  const { sunrise: r, sunset: s } = sunTimes(date);
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < r - 0.9 || h >= s + 1.25) return 'night';
  if (h < r + 0.1) return 'dawn';
  if (h < r + 3) return 'morning';
  if (h < s - 3) return 'day';
  if (h < s - 0.6) return 'golden';
  if (h < s + 0.3) return 'sunset';
  return 'dusk';
}

// Réglages par moment. sky : ciel ; az : direction (°, 0 = nord, 90 = est) où l'on place le soleil (ou la lueur)
// de la photo ; light : [direction, hauteur] du soleil du jeu (sinon ceux de la photo) ; sunI : intensité du soleil
// (null = éclairement mesuré sur la photo, × sunMul) ; gain : luminosité du ciel, que la lumière ambiante et les
// reflets suivent ; ambient : part de cette lumière ambiante (< 1 : ombres plus franches) ; haze : la brume prend
// cette part de la couleur de l'horizon (< 1 : relief lointain en silhouette sur un ciel lumineux) ; fogDist : brume
// repoussée ; lights : éclairage du complexe (lampadaires, fenêtres, projecteurs, mâts), 0 à 1 ; fill : lumière
// d'appoint venue du côté de la caméra (le complexe reste lisible quand le soleil est bas ou absent) ; dark : nuit
// (eau sombre, trophées sous projecteurs).
export const MOMENTS = {
  dawn: { sky: 'dusk', az: 68, light: [68, 4], sunI: 0.3, sunColor: 0xffb48c, gain: 0.06, ambient: 2.2, exposure: 1.15, haze: 0.45, fogDist: 1.4, lights: 0.9, fill: 0.55, dark: true },
  morning: { sky: 'morning', az: 112, light: [112, 24], sunI: 7.2, sunColor: 0xffd7aa, gain: 0.34, ambient: 1.05, exposure: 1.3, haze: 0.9, fill: 0.15 },
  day: { sky: 'day', az: 205, light: [205, 40], sunI: null, sunMul: 1.3, gain: 0.4, ambient: 0.8 },
  golden: { sky: 'golden', az: 248, light: [248, 22], sunI: 6.8, sunColor: 0xffb468, gain: 0.34, ambient: 1.0, exposure: 1.3, haze: 0.8, fogDist: 1.15, lights: 0.2, fill: 0.45 },
  sunset: { sky: 'sunset', az: 298, light: [298, 5], sunI: 4.0, sunColor: 0xff9a55, gain: 0.11, ambient: 1.6, exposure: 1.15, haze: 0.5, fogDist: 1.5, lights: 0.75, fill: 0.8 },
  dusk: { sky: 'dusk', az: 298, light: [298, 4], sunI: 0.3, sunColor: 0xa9b4ff, gain: 0.06, ambient: 2.2, exposure: 1.15, haze: 0.45, fogDist: 1.4, lights: 1, fill: 0.6, dark: true },
  night: { sky: 'night', az: 180, light: [140, 38], sunI: 1.1, sunColor: 0x9db0e0, gain: 0.06, ambient: 1.6, exposure: 1.1, haze: 0.7, fogDist: 1.2, lights: 1, fill: 0.15, dark: true },
};

const dirFrom = (azDeg, elDeg, out = new THREE.Vector3()) => {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
};

// Réglages complets d'une ambiance (moment de la journée, toujours par temps clair) : ciel, soleil, lumière, brume.
export function lookFor(moment = 'day') {
  const m = MOMENTS[moment] || MOMENTS.day;
  const key = m.sky;
  const meta = SKIES[key];
  const ref = meta.sun.E > 1 ? meta.sun : meta.glow; // soleil net, sinon zone la plus lumineuse
  const gain = m.gain;
  const [lAz, lEl] = m.light || [m.az, meta.sun.el];
  const sunI = m.sunI ?? meta.sun.E * m.gain * (m.sunMul ?? 1);
  const sunColor = new THREE.Color(m.sunColor ?? 0xffffff);
  if (m.sunColor == null) sunColor.setRGB(...meta.sun.color);
  return {
    moment, key, gain,
    off: ref.u - m.az / 360, // colonne de l'image placée à la direction m.az
    tint: new THREE.Color(1, 1, 1),
    sunDir: dirFrom(lAz, Math.max(lEl, 3)),
    sunI, sunColor,
    ambient: m.ambient ?? 1, // lumière du ciel (environnement) : < 1 = ombres plus franches
    exposure: m.exposure ?? 0.85, // exposition de la « caméra », comme un photographe qui compense la lumière
    // éclairement horizontal total (soleil + ciel), pour la couleur du sol vue par l'environnement
    groundE: (sunI * Math.max(0, Math.sin(Math.max(lEl, 0) * DEG)) + meta.skyE * gain),
    fog: [100, 420].map((v) => v * (m.fogDist ?? 1)), // air limpide : ~2 km de brume légère
    haze: m.haze ?? 1,
    dark: !!m.dark,
    lights: m.lights ?? 0,
    fill: m.fill ?? 0,
    fillDir: dirFrom(lAz + 180, 32), // à l'opposé du soleil : éclaire les façades tournées vers la caméra
    fillColor: new THREE.Color(m.dark ? 0xb8c4ff : 0xffe4c8),
  };
}

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww; // à l'infini : seul le regard compte, pas la position de la caméra
  }`;

const fragmentShader = /* glsl */ `
  uniform sampler2D tA, tB;
  uniform float uMix, uOffA, uOffB, uGainA, uGainB, uElMin, uClamp, uEnv;
  uniform vec3 uTint, uGround;
  varying vec3 vDir;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // image équirectangulaire (moitié haute) : u suit la direction (sens horaire vu du dessus), v la hauteur ;
  // dérivées corrigées à la couture u = 0 / 1 (sinon un trait du plus petit niveau de détail)
  vec3 skyAt(sampler2D t, float off, vec3 d, float dith) {
    float az = atan(d.x, -d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(az * 0.15915494 + off, (max(el, uElMin) - uElMin) / (1.5707963 - uElMin));
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);
    vec3 y = clamp(textureGrad(t, uv, dx, dy).rgb + dith, 0.0, 0.996);
    return y / (1.0 - y); // inverse de x / (1 + x)
  }

  vec3 skyColor(vec3 d) {
    float dith = (hash12(gl_FragCoord.xy) - 0.5) / 255.0; // tramage : pas de paliers dans les dégradés
    vec3 c = skyAt(tA, uOffA, d, dith) * uGainA;
    if (uMix > 0.001) c = mix(c, skyAt(tB, uOffB, d, dith) * uGainB, uMix);
    return min(c * uTint, vec3(uClamp));
  }`;

const domeFragment = /* glsl */ `${fragmentShader}
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = skyColor(d);
    if (uEnv > 0.5) c = mix(c, uGround, smoothstep(0.0, -0.08, d.y)); // sol (environnement seulement)
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// voile d'horizon : peint le ciel exactement derrière lui (opaque en bas, fondu vers le haut) pour cacher le bord du
// relief sans bande grise
const veilVertex = /* glsl */ `
  varying vec3 vDir;
  varying float vY;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    vY = wp.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const veilFragment = /* glsl */ `${fragmentShader}
  uniform vec2 uFade;
  varying float vY;
  void main() {
    vec3 d = normalize(vDir);
    gl_FragColor = vec4(skyColor(vec3(d.x, max(d.y, 0.0), d.z)), 1.0 - smoothstep(uFade.x, uFade.y, vY));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Dôme du ciel + environnement (PMREM) pour une ambiance. set() charge le ciel voulu puis fond l'ancien dans le
// nouveau ; l'environnement est régénéré pendant le fondu.
export function createPhotoSky(renderer) {
  const loader = new THREE.TextureLoader();
  const cache = new Map(); // fichier -> { promise, tex, used }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const shared = {
    tA: { value: null }, tB: { value: null }, uMix: { value: 0 },
    uOffA: { value: 0 }, uOffB: { value: 0 }, uGainA: { value: 0 }, uGainB: { value: 0 },
    uElMin: { value: -5.625 * DEG }, uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const material = (env) => new THREE.ShaderMaterial({
    uniforms: { ...shared, uEnv: { value: env ? 1 : 0 }, uClamp: { value: 1e4 }, uGround: { value: new THREE.Color() } },
    vertexShader, fragmentShader: domeFragment, depthWrite: false, side: THREE.BackSide, fog: false,
  });
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const dome = new THREE.Mesh(geo, material(false));
  dome.name = 'photo_sky';
  dome.frustumCulled = false;
  dome.renderOrder = 1000; // après le décor opaque, à la profondeur maximale : peint seulement là où le ciel se voit
  dome.visible = false;
  const envMat = material(true);
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(geo, envMat);
  envMesh.frustumCulled = false;
  envScene.add(envMesh);

  let a = null; // ambiance affichée { look, tex }
  let b = null; // ambiance qui arrive (fondu)
  let mix = 0;
  let wanted = null;
  let envRT = null;
  let envStep = 0;
  const listeners = new Set();
  let gone = false; // libéré (fin d'une séance d'épreuves) : un ciel qui arrive ensuite n'est plus envoyé au GPU

  const fileOf = (key) => `${BASE}sky/${key}.webp`; // pleine définition sur tout appareil, net aussi sur téléphone
  function load(key) {
    const url = fileOf(key);
    let e = cache.get(url);
    if (!e) {
      e = { tex: null, used: 0 };
      const job = trackLoad(360e3); // écran de chargement : taille supposée du ciel
      e.promise = new Promise((resolve, reject) => {
        loader.load(url, (t) => {
          job.done();
          if (gone) { t.dispose(); resolve(null); return; } // le rendu sert encore ailleurs : rien n'y reste
          t.colorSpace = THREE.NoColorSpace; // radiance encodée, décodée par le shader
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          renderer.initTexture(t); // envoi au GPU maintenant, pas au premier affichage
          e.tex = t;
          resolve(t);
        }, undefined, (err) => { job.done(); reject(err); });
      });
      cache.set(url, e);
      // au plus trois ciels en mémoire : on libère le plus ancien qui n'est pas affiché
      if (cache.size > 3) {
        const old = [...cache.entries()].filter(([, v]) => v.tex && v.tex !== a?.tex && v.tex !== b?.tex).sort((x, y) => x[1].used - y[1].used)[0];
        if (old) { old[1].tex.dispose(); cache.delete(old[0]); }
      }
    }
    e.used = performance.now();
    return e.promise;
  }

  function apply() {
    shared.tA.value = a.tex;
    shared.uOffA.value = a.look.off;
    shared.uGainA.value = a.look.gain;
    shared.tB.value = b ? b.tex : a.tex;
    shared.uOffB.value = b ? b.look.off : a.look.off;
    shared.uGainB.value = b ? b.look.gain : a.look.gain;
    shared.uMix.value = b ? mix : 0;
    const t = b ? THREE.MathUtils.smoothstep(mix, 0, 1) : 0;
    shared.uTint.value.copy(a.look.tint).lerp(b ? b.look.tint : a.look.tint, t);
  }

  // environnement : ciel sans le disque solaire (le soleil du jeu l'éclaire déjà) au-dessus d'un sol vert sombre
  const ALBEDO = new THREE.Color(0.08, 0.11, 0.055);
  function refreshEnv() {
    if (!a || gone) return;
    const t = b ? mix : 0;
    const gE = THREE.MathUtils.lerp(a.look.groundE, b ? b.look.groundE : a.look.groundE, t);
    envMat.uniforms.uGround.value.copy(ALBEDO).multiplyScalar(gE / Math.PI);
    envMat.uniforms.uClamp.value = 9 * Math.max(a.look.gain, b ? b.look.gain : 0);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 10);
    envRT?.dispose();
    envRT = rt;
    listeners.forEach((fn) => fn(rt.texture));
  }

  // couleur de l'horizon (radiance linéaire) dans la direction phi (radians, 0 = nord, sens horaire)
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  function horizonOf(look, phi, out) {
    const bins = SKIES[look.key].horizon;
    out.setRGB(0, 0, 0);
    for (const [dp, w] of [[-0.35, 0.25], [0, 0.5], [0.35, 0.25]]) { // moyenne sur ~40° : pas de saut en tournant
      let u = (phi + dp) / (2 * Math.PI) + look.off;
      u -= Math.floor(u);
      const f = u * BINS - 0.5;
      const i0 = ((Math.floor(f) % BINS) + BINS) % BINS, i1 = (i0 + 1) % BINS, k = f - Math.floor(f);
      for (let c = 0; c < 3; c++) out[['r', 'g', 'b'][c]] += w * THREE.MathUtils.lerp(bins[i0][c], bins[i1][c], k);
    }
    return out.multiplyScalar(look.gain).multiply(look.tint);
  }

  return {
    dome,
    get ready() { return !!a; },
    // ambience demandée affichée, sans chargement ni fondu en cours (captures, tests)
    get settled() { return !!a && !b && a.look === wanted; },
    get envTexture() { return envRT?.texture || null; },
    onEnv(fn) { listeners.add(fn); if (envRT) fn(envRT.texture); },

    // nouvelle ambiance : chargement du ciel puis fondu (immédiat la première fois)
    set(look) {
      wanted = look;
      load(look.key).then((tex) => {
        if (gone || !tex || wanted !== look) return; // libéré, ou une autre ambiance demandée entre-temps
        if (!a) {
          a = { look, tex };
          dome.visible = true;
          apply();
          refreshEnv();
          return;
        }
        if (b) a = b; // fondu en cours : on le termine net
        if (a.look.key === look.key && a.look.off === look.off) { // même photo : réglages seulement
          a = { look, tex };
          b = null;
          apply();
          refreshEnv();
          return;
        }
        b = { look, tex };
        mix = 0;
        envStep = 0;
        apply();
      }).catch((err) => console.warn('[sky] ciel indisponible', err));
    },

    update(dt) {
      if (!b) return;
      mix = Math.min(1, mix + dt / FADE);
      apply();
      // environnement régénéré à 1/3, 2/3 et à la fin du fondu
      const step = Math.floor(mix * 3);
      if (step > envStep) { envStep = step; if (mix < 1) refreshEnv(); }
      if (mix >= 1) { a = b; b = null; mix = 0; apply(); refreshEnv(); }
    },

    // couleur de brume : horizon du ciel affiché dans la direction du regard
    horizon(phi, out) {
      if (!a) return null;
      horizonOf(a.look, phi, out);
      if (b) out.lerp(horizonOf(b.look, phi, tmp2), THREE.MathUtils.smoothstep(mix, 0, 1));
      return out;
    },
    horizonOfLook(look, phi, out = tmp) { return horizonOf(look, phi, out); },

    // matériau du voile d'horizon (landscape.js) : le ciel photographié, opaque sous fadeLow, transparent au-dessus
    // de fadeHigh (hauteurs du monde)
    veilMaterial(fadeLow, fadeHigh) {
      return new THREE.ShaderMaterial({
        uniforms: {
          ...shared, uClamp: { value: 1e4 }, uEnv: { value: 0 }, uGround: { value: new THREE.Color() },
          uFade: { value: new THREE.Vector2(fadeLow, fadeHigh) },
        },
        vertexShader: veilVertex, fragmentShader: veilFragment,
        transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      });
    },

    dispose() {
      gone = true;
      cache.forEach((e) => e.tex?.dispose());
      cache.clear();
      envRT?.dispose();
      pmrem.dispose();
      geo.dispose();
      dome.material.dispose();
      envMat.dispose();
    },
  };
}
