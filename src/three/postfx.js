import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Rendu « cinéma » : ombres de contact (occlusion ambiante GTAO), halo des lumières (bloom, plus présent la nuit),
// étalonnage des couleurs selon l'ambiance (saturation, contraste, chaleur, vignettage discret) et anticrénelage
// multi-échantillons.
// Qualité économie : rendu direct, sans post-traitement. Téléphone en qualité auto : halo et étalonnage seulement.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uWarm: { value: 0.025 }, uVignette: { value: 0.3 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uContrast, uWarm, uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm);
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * uVignette * 1.6;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

// Garde-fou avant le halo : un seul pixel invalide (NaN, infini : reflet du soleil rasant sur l'eau, cas limite
// d'un calcul) serait étalé par le flou du halo sur tout l'écran, qui deviendrait noir. Pixels invalides ramenés
// à zéro, reflets extrêmes bornés (ils restent éblouissants).
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 48 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    float safe(float v) { return v >= 0.0 ? min(v, uMax) : 0.0; } // NaN : toute comparaison est fausse
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(safe(c.r), safe(c.g), safe(c.b), 1.0);
    }`,
};

const narrow = () => Math.min(window.innerWidth, window.innerHeight) < 600;

export function createPostFX(renderer, scene, camera, quality = 'auto') {
  let composer = null;
  let gtao = null;
  let bloom = null;
  let grade = null;
  let look = null;
  let sanitize = null;
  const size = new THREE.Vector2();

  function teardown() {
    composer?.passes.forEach((p) => p.dispose?.());
    composer?.dispose();
    composer = gtao = bloom = grade = sanitize = null;
  }

  function build(q) {
    teardown();
    if (q === 'economie') return;
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType, samples: narrow() && q !== 'haute' ? 2 : 4,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    // occlusion ambiante : la plus coûteuse (≈ 2× le rendu) ; sur téléphone seulement en qualité haute
    const phone = narrow() && q !== 'haute';
    if (!phone) {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.6, thickness: 0.5, scale: 1.0, samples: narrow() ? 8 : 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: narrow() ? 8 : 16 });
      gtao.blendIntensity = 0.9;
      composer.addPass(gtao);
    }
    sanitize = new ShaderPass(SanitizeShader);
    composer.addPass(sanitize); // avant le halo : aucun pixel invalide ne s'étale
    const bloomScale = phone ? 0.5 : 1; // halo à demi-résolution sur téléphone
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x * bloomScale, size.y * bloomScale), 0.18, 0.55, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    composer.addPass(grade);
    if (look) setLook(look);
  }

  // étalonnage de l'ambiance (sky.js) : saturation, contraste, chaleur, vignettage, halo [force, rayon, seuil]
  function setLook(g) {
    look = g;
    if (bloom) { [bloom.strength, bloom.radius, bloom.threshold] = g.bloom; }
    if (grade) {
      const u = grade.uniforms;
      u.uSat.value = g.sat;
      u.uContrast.value = g.contrast;
      u.uWarm.value = g.warm;
      u.uVignette.value = g.vignette;
    }
  }

  build(quality);

  return {
    render(dt) {
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);
    },
    setSize(w, h) { composer?.setPixelRatio(renderer.getPixelRatio()); composer?.setSize(w, h); },
    setQuality(q) { build(q); },
    setLook,
    get enabled() { return !!composer; },
    get passes() { return { gtao, bloom, grade, sanitize }; }, // réglage et inspection
    dispose: teardown,
  };
}
