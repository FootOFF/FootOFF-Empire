import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

// Rendu « cinéma » : ombres de contact (occlusion ambiante GTAO), halo des lumières (bloom, plus présent la nuit),
// étalonnage des couleurs selon l'ambiance (saturation, contraste, chaleur, vignettage discret), anticrénelage FXAA
// sur les écrans peu denses. La scène est toujours calculée à la densité de l'écran (Empire3D), au repos comme en
// mouvement : aucune image agrandie.
// Qualité économie : rendu direct, sans post-traitement. Téléphone en qualité auto : halo et étalonnage seulement.
//
// Mesuré sur une puce graphique intégrée (écran 2880 × 1620) : l'anticrénelage multi-échantillons coûtait ~7,5 ms en
// pleine résolution (tampons HDR) et chaque passe plein écran 1 à 2 ms. D'où :
//  - scène dessinée directement dans le tampon du composer, sans multi-échantillons ;
//  - occlusion et halo calculés à basse résolution puis posés dans la passe de sortie, avec le tone mapping et
//    l'étalonnage (deux passes plein écran de moins) ; halo au quart de la résolution de la scène (4,5 -> 1,7 ms,
//    même image) ;
//  - anticrénelage FXAA seulement sur écran peu dense : sur un écran très dense, une marche d'escalier fait un
//    demi-pixel CSS (4 à 6 ms économisées en 2880 × 1620 pour une différence invisible).

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

// Occlusion (multipliée) et halo (ajouté), calculés à basse résolution, posés avant le tone mapping.
const COMPOSE = /* glsl */`
      gl_FragColor.rgb *= mix( vec3( 1.0 ), texture2D( tAO, vUv ).rgb, uAO );
      gl_FragColor.rgb += texture2D( tBloom, vUv ).rgb * uBloom;
`;

// Sélection des zones claires du halo, au quart de la résolution de la scène : moyenne de quatre lectures bilinéaires
// qui couvrent les 4 × 4 pixels de la scène (une petite lampe ne scintille pas quand la caméra bouge), seuil appliqué
// à chaque lecture. Garde-fou : un seul pixel invalide (NaN, infini : reflet du soleil rasant sur l'eau, cas limite
// d'un calcul) serait étalé par le flou sur tout l'écran, qui deviendrait noir ; pixels invalides ramenés à zéro,
// reflets extrêmes bornés (ils restent éblouissants).
const HIGH_PASS = /* glsl */`
  #include <common>
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  float safe( float v ) { return v >= 0.0 ? min( v, 48.0 ) : 0.0; } // NaN : toute comparaison est fausse
  vec3 bright( vec2 uv ) {
    vec3 c = texture2D( tDiffuse, uv ).rgb;
    c = vec3( safe( c.r ), safe( c.g ), safe( c.b ) );
    return mix( defaultColor, c, smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, luminance( c ) ) );
  }
  void main() {
    vec2 t = 1.0 / vec2( textureSize( tDiffuse, 0 ) );
    gl_FragColor = vec4( 0.25 * ( bright( vUv - t ) + bright( vUv + vec2( t.x, - t.y ) ) + bright( vUv + vec2( - t.x, t.y ) ) + bright( vUv + t ) ), 1.0 );
  }`;

// Scène dessinée directement dans le tampon du composer.
class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(readBuffer);
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }
}

const narrow = () => Math.min(window.innerWidth, window.innerHeight) < 600;
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

// Une chaîne de rendu complète, à la densité `ratio` (pixels de rendu par pixel CSS).
function createChain(renderer, scene, camera, q) {
  const chain = { ratio: 1, aoScale: 0.5, gtao: null };
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
  chain.composer = composer;
  composer.addPass(new ScenePass(scene, camera));
  // occlusion ambiante : sur téléphone seulement en qualité haute
  if (!(narrow() && q !== 'haute')) {
    const gtao = new GTAOPass(scene, camera, 1, 1);
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
    // calcul à une fraction de la résolution de l'écran (pixels CSS) : moitié, quart en vue lointaine (setAODetail) ;
    // effet doux, débruité puis étiré
    const setSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => {
      const k = chain.aoScale / chain.ratio;
      setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
    };
    // occlusion posée par la passe de sortie : ici, seulement calculée
    gtao.output = GTAOPass.OUTPUT.Off;
    gtao.needsSwap = false;
    composer.addPass(gtao);
    chain.gtao = gtao;
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.55, 0.92);
  // halo au quart de la résolution de la scène (three le calcule à la moitié) : zones claires lues sur 4 × 4 pixels,
  // noyaux de flou divisés par deux, même étendue à l'écran pour quatre fois moins de pixels
  bloom.materialHighPassFilter.fragmentShader = HIGH_PASS;
  bloom.separableBlurMaterials.forEach((m) => m.dispose());
  bloom.separableBlurMaterials = [3, 5, 7, 9, 11].map((k) => bloom._getSeparableBlurMaterial(k));
  const bloomSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  bloom.blendMaterial.visible = false; // halo ajouté par la passe de sortie (une passe plein écran de moins)
  composer.addPass(bloom);
  chain.bloom = bloom;
  const output = new OutputPass();
  Object.assign(output.uniforms, {
    uSat: { value: 1.1 }, uContrast: { value: 1.06 }, uWarm: { value: 0.025 }, uVignette: { value: 0.3 },
    tAO: { value: chain.gtao ? chain.gtao.pdRenderTarget.texture : WHITE }, uAO: { value: chain.gtao ? chain.gtao.blendIntensity : 0 },
    tBloom: { value: bloom.renderTargetsHorizontal[0].texture ?? BLACK }, uBloom: { value: 1 },
  });
  const fs = output.material.fragmentShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\n\t\tuniform float uSat, uContrast, uWarm, uVignette, uAO, uBloom;\n\t\tuniform sampler2D tAO, tBloom;')
    .replace('gl_FragColor = texture2D( tDiffuse, vUv );', `gl_FragColor = texture2D( tDiffuse, vUv );\n${COMPOSE}`);
  output.material.fragmentShader = `${fs.slice(0, fs.lastIndexOf('}'))}${GRADE}}`; // étalonnage en fin de sortie
  composer.addPass(output);
  chain.output = output;
  chain.fxaa = new FXAAPass();
  composer.addPass(chain.fxaa);
  return chain;
}

export function createPostFX(renderer, scene, camera, quality = 'auto') {
  let chain = null;
  let look = null;
  let halo = 1;
  let aoNear = true;
  let ratio = 1;
  const css = new THREE.Vector2();
  const out = new THREE.Vector2();

  function teardown() {
    chain?.composer.passes.forEach((p) => p.dispose?.());
    chain?.composer.dispose();
    chain = null;
  }

  function size() {
    if (!chain) return;
    renderer.getSize(css);
    renderer.getDrawingBufferSize(out);
    chain.ratio = ratio;
    // tailles en pixels entiers (le composer multiplierait la taille CSS par la densité sans arrondir)
    chain.composer.setPixelRatio(1);
    chain.composer.setSize(Math.max(1, Math.round(css.x * ratio)), Math.max(1, Math.round(css.y * ratio)));
    // anticrénelage seulement sur un écran peu dense
    chain.fxaa.enabled = out.x / Math.max(1, css.x) < 1.75;
  }

  function applyLook() {
    if (!chain) return;
    if (look) {
      [chain.bloom.strength, chain.bloom.radius, chain.bloom.threshold] = look.bloom;
      chain.bloom.strength *= halo;
      const u = chain.output.uniforms;
      u.uSat.value = look.sat;
      u.uContrast.value = look.contrast;
      u.uWarm.value = look.warm;
      u.uVignette.value = look.vignette;
    }
    chain.output.uniforms.uBloom.value = chain.bloom.strength > 0 ? 1 : 0;
  }

  function build(q) {
    teardown();
    if (q === 'economie') return;
    chain = createChain(renderer, scene, camera, q);
    chain.aoScale = aoNear ? 0.5 : 0.25;
    size();
    applyLook();
  }

  // étalonnage de l'ambiance (sky.js) : saturation, contraste, chaleur, vignettage, halo [force, rayon, seuil] ;
  // h : part de la force du halo gardée (Empire3D.haloScale)
  function setLook(g, h = 1) {
    look = g;
    halo = h;
    applyLook();
  }

  build(quality);

  return {
    render(dt) {
      if (chain) chain.composer.render(dt);
      else renderer.render(scene, camera);
    },
    // taille de l'écran changée (pixels CSS ou densité de la toile)
    setSize: size,
    // densité de rendu (pixels de rendu par pixel CSS) : celle de la toile (Empire3D)
    setRatio(r) {
      if (Math.abs(r - ratio) < 1e-3) return;
      ratio = r;
      size();
    },
    get ratio() { return ratio; },
    // occlusion : demi-résolution de près, quart en vue lointaine (Empire3D, selon le recul de la caméra)
    setAODetail(near) {
      if (near === aoNear) return;
      aoNear = near;
      if (!chain?.gtao) return;
      chain.aoScale = near ? 0.5 : 0.25;
      if (chain.composer._width > 1) chain.gtao.setSize(chain.composer._width, chain.composer._height);
    },
    setQuality(q) { build(q); },
    setLook,
    get enabled() { return !!chain; },
    get passes() { return chain ? { gtao: chain.gtao, bloom: chain.bloom, output: chain.output, fxaa: chain.fxaa } : {}; }, // réglage et inspection
    get composer() { return chain?.composer ?? null; }, // mesures (développement)
    // cible où la scène est dessinée (null : écran) : compiler les matériaux d'avance dans la même configuration
    get sceneTarget() { return chain ? chain.composer.readBuffer : null; },
    dispose: teardown,
  };
}
