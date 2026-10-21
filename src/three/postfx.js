import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

// Rendu « cinéma » : ombres de contact (occlusion ambiante GTAO), halo des lumières (bloom, plus présent la nuit),
// étalonnage des couleurs selon l'ambiance (saturation, contraste, chaleur, vignettage discret) et anticrénelage
// multi-échantillons.
// Qualité économie : rendu direct, sans post-traitement. Téléphone en qualité auto : halo et étalonnage seulement.
//
// Coût maîtrisé sans rien changer à l'image : seule la scène est rendue en multi-échantillons (les passes plein
// écran écrivent dans des tampons simples, quatre fois plus légers) ; l'occlusion est calculée à demi-résolution de
// l'écran (pixels CSS), sans ce qui n'a pas de sens pour elle, et posée directement sur l'image ; le garde-fou des
// pixels invalides est fait à l'entrée du halo, et l'étalonnage dans la passe de sortie (deux passes plein écran de
// moins).

// Étalonnage (espace d'affichage, après le tone mapping) : saturation, contraste, chaleur, vignettage.
const GRADE = /* glsl */`
  {
    vec3 col = gl_FragColor.rgb;
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSat);
    col = (col - 0.5) * uContrast + 0.5;
    col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.3, 1.0 - uWarm);
    vec2 d = vUv - 0.5;
    col *= 1.0 - dot(d, d) * uVignette * 1.6;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), gl_FragColor.a);
  }
`;

// Scène rendue dans sa propre cible multi-échantillonnée (anticrénelage), puis copiée dans le tampon du composer.
// samples() : échantillons voulus pour la densité de rendu du moment.
class ScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.samples = samples;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: samples() });
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    }));
  }

  setSize(w, h) {
    const want = this.samples();
    if (this.target.samples !== want) { this.target.samples = want; this.target.dispose(); } // recréée au prochain rendu
    this.target.setSize(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.copy.material.uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(readBuffer);
    this.copy.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.copy.material.dispose();
    this.copy.dispose();
  }
}

const narrow = () => Math.min(window.innerWidth, window.innerHeight) < 600;

export function createPostFX(renderer, scene, camera, quality = 'auto') {
  let composer = null;
  let gtao = null;
  let bloom = null;
  let output = null;
  let look = null;
  const size = new THREE.Vector2();

  function teardown() {
    composer?.passes.forEach((p) => p.dispose?.());
    composer?.dispose();
    composer = gtao = bloom = output = null;
  }

  function build(q) {
    teardown();
    if (q === 'economie') return;
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType }));
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    // anticrénelage : 4 échantillons ; 2 quand la densité de rendu dépasse 1,5 (image déjà sur-échantillonnée, bords
    // identiques à l'œil) et sur téléphone hors qualité haute
    const scenePass = new ScenePass(scene, camera, () => (narrow() && q !== 'haute') || renderer.getPixelRatio() >= 1.5 ? 2 : 4);
    composer.addPass(scenePass);
    // occlusion ambiante : la plus coûteuse (≈ 2× le rendu) ; sur téléphone seulement en qualité haute
    const phone = narrow() && q !== 'haute';
    if (!phone) {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.6, thickness: 0.5, scale: 1.0, samples: narrow() ? 8 : 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: narrow() ? 8 : 16 });
      gtao.blendIntensity = 0.9;
      // passe de normales de l'occlusion : sans ce qui n'y a pas de sens (ciel, voile d'horizon, eau et son reflet,
      // imposteurs, cartes de feuillage, marqués userData.noAO), en plus des points et des lignes déjà écartés
      const hide = gtao._overrideVisibility.bind(gtao);
      gtao._overrideVisibility = () => {
        hide();
        scene.traverse((o) => {
          if (o.userData.noAO && o.visible) { o.visible = false; gtao._visibilityCache.push(o); }
        });
      };
      // calcul à demi-résolution de l'écran (pixels CSS) : effet doux, identique à l'œil (débruité puis étiré), quatre
      // fois moins de calcul qu'à pleine résolution, seize fois moins sur un écran à densité double
      const setSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => {
        const k = 0.5 / Math.max(1, renderer.getPixelRatio());
        setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      };
      // occlusion multipliée directement sur l'image : pas de copie plein écran
      gtao.output = GTAOPass.OUTPUT.Off;
      gtao.needsSwap = false;
      const renderAO = gtao.render.bind(gtao);
      gtao.render = (r, writeBuffer, readBuffer, dt, mask) => {
        renderAO(r, writeBuffer, readBuffer, dt, mask);
        gtao.blendMaterial.uniforms.intensity.value = gtao.blendIntensity;
        gtao.blendMaterial.uniforms.tDiffuse.value = gtao.pdRenderTarget.texture;
        gtao._renderPass(r, gtao.blendMaterial, readBuffer);
      };
      composer.addPass(gtao);
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.55, 0.92);
    // garde-fou à l'entrée du halo : un seul pixel invalide (NaN, infini : reflet du soleil rasant sur l'eau, cas
    // limite d'un calcul) serait étalé par son flou sur tout l'écran, qui deviendrait noir. Pixels invalides
    // ramenés à zéro, reflets extrêmes bornés (ils restent éblouissants).
    const hp = bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader
      .replace('void main() {', 'float safe(float v) { return v >= 0.0 ? min(v, 48.0) : 0.0; } // NaN : toute comparaison est fausse\nvoid main() {')
      .replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\ttexel = vec4( safe( texel.r ), safe( texel.g ), safe( texel.b ), 1.0 );');
    composer.addPass(bloom);
    output = new OutputPass();
    Object.assign(output.uniforms, { uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uWarm: { value: 0.025 }, uVignette: { value: 0.3 } });
    const fs = output.material.fragmentShader.replace('varying vec2 vUv;', 'varying vec2 vUv;\n\t\tuniform float uSat, uContrast, uWarm, uVignette;');
    output.material.fragmentShader = `${fs.slice(0, fs.lastIndexOf('}'))}${GRADE}}`; // étalonnage en fin de sortie
    composer.addPass(output);
    if (look) setLook(look);
  }

  // étalonnage de l'ambiance (sky.js) : saturation, contraste, chaleur, vignettage, halo [force, rayon, seuil]
  function setLook(g) {
    look = g;
    if (bloom) { [bloom.strength, bloom.radius, bloom.threshold] = g.bloom; }
    if (output) {
      const u = output.uniforms;
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
    get passes() { return { gtao, bloom, output }; }, // réglage et inspection
    get composer() { return composer; }, // mesures (développement)
    // cible où la scène est dessinée (null : écran) : compiler les matériaux d'avance dans la même configuration
    get sceneTarget() { return composer ? composer.passes[0].target : null; },
    dispose: teardown,
  };
}
