import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

// Rendu « cinéma » : ombres de contact (occlusion ambiante GTAO), halo des lumières (bloom, plus présent la nuit),
// étalonnage des couleurs selon l'ambiance (saturation, contraste, chaleur, vignettage discret), anticrénelage FXAA
// sur les écrans peu denses, puis agrandisseur net (FSR 1) si la scène est calculée plus petite que l'écran.
// Qualité économie : rendu direct, sans post-traitement. Téléphone en qualité auto : halo et étalonnage seulement.
//
// Mesuré sur une puce graphique intégrée (écran 2880 × 1620) : l'anticrénelage multi-échantillons coûtait ~7,5 ms en
// pleine résolution (tampons HDR) et chaque passe plein écran 1 à 2 ms ; agrandir une image calculée plus petite
// (FXAA, EASU, RCAS : 5 à 7 ms) coûte presque autant que la calculer en pleine résolution. D'où :
//  - scène dessinée directement dans le tampon du composer, sans multi-échantillons ;
//  - occlusion et halo calculés à basse résolution puis posés dans la passe de sortie, avec le tone mapping et
//    l'étalonnage (deux passes plein écran de moins) ; halo au quart de la résolution de la scène (4,5 -> 1,7 ms,
//    même image) ;
//  - pleine résolution au repos comme en mouvement (image nette pendant les déplacements et le zoom) ; seulement si
//    l'appareil ne suit plus, une densité plus faible, agrandie par EASU et accentuée par RCAS (AMD FidelityFX Super
//    Resolution 1, licence MIT) au lieu de l'étirement flou du navigateur ;
//  - anticrénelage FXAA seulement sur écran peu dense : sur un écran très dense, une marche d'escalier fait un
//    demi-pixel CSS (4 à 6 ms économisées en 2880 × 1620 pour une différence invisible), et l'agrandisseur suit les
//    bords.
// Chaîne « mouvement » à part, réservée à la demande : seulement quand la caméra en mouvement doit descendre sous la
// densité du repos (passer de l'une à l'autre ne crée alors aucun à-coup).

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

const QUAD_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`;

// EASU (Edge Adaptive Spatial Upsampling) d'AMD FSR 1 : noyau de 12 pixels source, orienté et étiré le long des
// bords, sans halo (borné par les quatre pixels les plus proches).
const EASU = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uIn;
  varying vec2 vUv;
  vec3 tx( vec2 p ) { return texture2D( tDiffuse, ( p + 0.5 ) / uIn ).rgb; }
  float lu( vec3 c ) { return c.g + 0.5 * ( c.r + c.b ); }
  void easuSet( inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE ) {
    float lenX = max( abs( lD - lC ), abs( lC - lB ) );
    float dirX = lD - lB;
    dir.x += dirX * w;
    lenX = clamp( abs( dirX ) / max( lenX, 1e-5 ), 0.0, 1.0 );
    len += lenX * lenX * w;
    float lenY = max( abs( lE - lC ), abs( lC - lA ) );
    float dirY = lE - lA;
    dir.y += dirY * w;
    lenY = clamp( abs( dirY ) / max( lenY, 1e-5 ), 0.0, 1.0 );
    len += lenY * lenY * w;
  }
  void easuTap( inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c ) {
    vec2 v = vec2( dot( off, dir ), dot( off, vec2( - dir.y, dir.x ) ) ) * len;
    float d2 = min( dot( v, v ), clp );
    float wB = 0.4 * d2 - 1.0;
    float wA = lob * d2 - 1.0;
    wB *= wB;
    wA *= wA;
    wB = 1.5625 * wB - 0.5625;
    float w = wB * wA;
    aC += c * w;
    aW += w;
  }
  void main() {
    vec2 pp = vUv * uIn - 0.5;
    vec2 fp = floor( pp );
    pp -= fp;
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    vec3 b = tx( fp + vec2( 0.0, - 1.0 ) ), c = tx( fp + vec2( 1.0, - 1.0 ) );
    vec3 e = tx( fp + vec2( - 1.0, 0.0 ) ), f = tx( fp ), g = tx( fp + vec2( 1.0, 0.0 ) ), h = tx( fp + vec2( 2.0, 0.0 ) );
    vec3 i = tx( fp + vec2( - 1.0, 1.0 ) ), j = tx( fp + vec2( 0.0, 1.0 ) ), k = tx( fp + vec2( 1.0, 1.0 ) ), l = tx( fp + vec2( 2.0, 1.0 ) );
    vec3 n = tx( fp + vec2( 0.0, 2.0 ) ), o = tx( fp + vec2( 1.0, 2.0 ) );
    float bL = lu( b ), cL = lu( c ), eL = lu( e ), fL = lu( f ), gL = lu( g ), hL = lu( h );
    float iL = lu( i ), jL = lu( j ), kL = lu( k ), lL = lu( l ), nL = lu( n ), oL = lu( o );
    vec2 dir = vec2( 0.0 );
    float len = 0.0;
    easuSet( dir, len, ( 1.0 - pp.x ) * ( 1.0 - pp.y ), bL, eL, fL, gL, jL );
    easuSet( dir, len, pp.x * ( 1.0 - pp.y ), cL, fL, gL, hL, kL );
    easuSet( dir, len, ( 1.0 - pp.x ) * pp.y, fL, iL, jL, kL, nL );
    easuSet( dir, len, pp.x * pp.y, gL, jL, kL, lL, oL );
    float dirR = dot( dir, dir );
    bool zro = dirR < 1.0 / 32768.0;
    dir = zro ? vec2( 1.0, 0.0 ) : dir * inversesqrt( dirR );
    len *= 0.5;
    len *= len;
    float stretch = 1.0 / max( abs( dir.x ), abs( dir.y ) );
    vec2 len2 = vec2( 1.0 + ( stretch - 1.0 ) * len, 1.0 - 0.5 * len );
    float lob = 0.5 + ( ( 1.0 / 4.0 - 0.04 ) - 0.5 ) * len;
    float clp = 1.0 / lob;
    vec3 aC = vec3( 0.0 );
    float aW = 0.0;
    easuTap( aC, aW, vec2( 0.0, - 1.0 ) - pp, dir, len2, lob, clp, b );
    easuTap( aC, aW, vec2( 1.0, - 1.0 ) - pp, dir, len2, lob, clp, c );
    easuTap( aC, aW, vec2( - 1.0, 1.0 ) - pp, dir, len2, lob, clp, i );
    easuTap( aC, aW, vec2( 0.0, 1.0 ) - pp, dir, len2, lob, clp, j );
    easuTap( aC, aW, vec2( 0.0, 0.0 ) - pp, dir, len2, lob, clp, f );
    easuTap( aC, aW, vec2( - 1.0, 0.0 ) - pp, dir, len2, lob, clp, e );
    easuTap( aC, aW, vec2( 1.0, 1.0 ) - pp, dir, len2, lob, clp, k );
    easuTap( aC, aW, vec2( 2.0, 1.0 ) - pp, dir, len2, lob, clp, l );
    easuTap( aC, aW, vec2( 2.0, 0.0 ) - pp, dir, len2, lob, clp, h );
    easuTap( aC, aW, vec2( 1.0, 0.0 ) - pp, dir, len2, lob, clp, g );
    easuTap( aC, aW, vec2( 1.0, 2.0 ) - pp, dir, len2, lob, clp, o );
    easuTap( aC, aW, vec2( 0.0, 2.0 ) - pp, dir, len2, lob, clp, n );
    vec3 mn = min( min( f, g ), min( j, k ) );
    vec3 mx = max( max( f, g ), max( j, k ) );
    gl_FragColor = vec4( clamp( aC / max( aW, 1e-5 ), mn, mx ), 1.0 );
  }`;

// RCAS (Robust Contrast Adaptive Sharpening) d'AMD FSR 1 : accentuation bornée par le contraste local (pas de halo),
// derrière EASU, à un pixel de sortie d'écart.
const RCAS = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uSize;
  uniform float uSharp;
  varying vec2 vUv;
  void main() {
    vec2 px = 1.0 / uSize;
    vec3 b = texture2D( tDiffuse, vUv + vec2( 0.0, - px.y ) ).rgb;
    vec3 d = texture2D( tDiffuse, vUv + vec2( - px.x, 0.0 ) ).rgb;
    vec3 e = texture2D( tDiffuse, vUv ).rgb;
    vec3 f = texture2D( tDiffuse, vUv + vec2( px.x, 0.0 ) ).rgb;
    vec3 h = texture2D( tDiffuse, vUv + vec2( 0.0, px.y ) ).rgb;
    vec3 mn4 = min( min( b, d ), min( f, h ) );
    vec3 mx4 = max( max( b, d ), max( f, h ) );
    vec3 hitMin = min( mn4, e ) / max( 4.0 * mx4, vec3( 1e-5 ) );
    vec3 hitMax = ( 1.0 - max( mx4, e ) ) / min( 4.0 * mn4 - 4.0, vec3( - 1e-5 ) );
    vec3 lobeRGB = max( - hitMin, hitMax );
    float lobe = max( - 0.1875, min( max( lobeRGB.r, max( lobeRGB.g, lobeRGB.b ) ), 0.0 ) ) * uSharp;
    gl_FragColor = vec4( ( lobe * ( b + d + f + h ) + e ) / ( 4.0 * lobe + 1.0 ), 1.0 );
  }`;

// Agrandisseur net, toujours la dernière passe, désactivée quand la scène est déjà calculée à la taille de l'écran :
// EASU vers une image à la taille de l'écran, puis RCAS vers l'écran (jamais d'étirement simple : il faisait des
// marches d'escalier dès que la caméra bougeait).
class UpscalePass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.out = new THREE.Vector2();
    this.easu = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uIn: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VERTEX, fragmentShader: EASU, depthTest: false, depthWrite: false,
    }));
    this.rcas = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uSize: { value: new THREE.Vector2() }, uSharp: { value: 0.8 } },
      vertexShader: QUAD_VERTEX, fragmentShader: RCAS, depthTest: false, depthWrite: false,
    }));
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.getDrawingBufferSize(this.out);
    const rcas = this.rcas.material.uniforms;
    if (this.target.width !== this.out.x || this.target.height !== this.out.y) this.target.setSize(this.out.x, this.out.y);
    const easu = this.easu.material.uniforms;
    easu.tDiffuse.value = readBuffer.texture;
    easu.uIn.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.target);
    this.easu.render(renderer);
    rcas.tDiffuse.value = this.target.texture;
    rcas.uSize.value.copy(this.out);
    // accentuation un peu plus franche quand l'agrandissement est fort (au-delà de ×1,5)
    rcas.uSharp.value = Math.min(1, 0.55 + 0.3 * (this.out.x / readBuffer.width - 1));
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.rcas.render(renderer);
  }

  dispose() {
    this.target.dispose();
    [this.easu, this.rcas].forEach((q) => { q.material.dispose(); q.dispose(); });
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
  chain.upscale = new UpscalePass();
  composer.addPass(chain.upscale);
  return chain;
}

export function createPostFX(renderer, scene, camera, quality = 'auto') {
  let rest = null; // densité du repos (pleine résolution), aussi en mouvement tant que l'appareil suit
  let motion = null; // caméra en mouvement à une densité plus faible : tampons alloués seulement quand il le faut
  let moving = false;
  let look = null;
  let halo = 1;
  let aoNear = true;
  const ratios = { rest: 1, motion: 1 };
  const css = new THREE.Vector2();
  const out = new THREE.Vector2();

  function teardown() {
    [rest, motion].forEach((c) => {
      c?.composer.passes.forEach((p) => p.dispose?.());
      c?.composer.dispose();
    });
    rest = motion = null;
  }

  function size(chain, ratio) {
    renderer.getSize(css);
    renderer.getDrawingBufferSize(out);
    chain.ratio = ratio;
    // tailles en pixels entiers (le composer multiplierait la taille CSS par la densité sans arrondir)
    chain.composer.setPixelRatio(1);
    chain.composer.setSize(Math.max(1, Math.round(css.x * ratio)), Math.max(1, Math.round(css.y * ratio)));
    // l'agrandisseur ne sert que si la scène est calculée plus petite que l'écran ; l'anticrénelage, seulement sur un
    // écran peu dense
    chain.upscale.enabled = css.x * ratio < out.x - 0.5;
    chain.fxaa.enabled = out.x / Math.max(1, css.x) < 1.75;
  }

  // la caméra en mouvement a sa propre densité (plus faible) : sa chaîne est dimensionnée, sinon réduite au minimum
  const split = () => ratios.motion < ratios.rest - 1e-3;
  function sizeMotion() {
    if (!motion) return;
    if (split()) size(motion, ratios.motion);
    else if (motion.composer._width !== 1) { motion.ratio = 1; motion.composer.setPixelRatio(1); motion.composer.setSize(1, 1); }
  }

  function build(q) {
    teardown();
    if (q === 'economie') return;
    rest = createChain(renderer, scene, camera, q);
    motion = createChain(renderer, scene, camera, q);
    size(rest, ratios.rest);
    sizeMotion();
    applyLook();
  }

  function applyLook() {
    [rest, motion].forEach((c) => {
      if (!c) return;
      if (look) {
        [c.bloom.strength, c.bloom.radius, c.bloom.threshold] = look.bloom;
        c.bloom.strength *= halo;
        const u = c.output.uniforms;
        u.uSat.value = look.sat;
        u.uContrast.value = look.contrast;
        u.uWarm.value = look.warm;
        u.uVignette.value = look.vignette;
      }
      c.output.uniforms.uBloom.value = c.bloom.strength > 0 ? 1 : 0;
    });
  }

  // étalonnage de l'ambiance (sky.js) : saturation, contraste, chaleur, vignettage, halo [force, rayon, seuil] ;
  // h : part de la force du halo gardée (Empire3D.haloScale)
  function setLook(g, h = 1) {
    look = g;
    halo = h;
    applyLook();
  }

  build(quality);
  const active = () => (moving && split() ? motion : rest);

  return {
    render(dt) {
      const c = active();
      if (c) c.composer.render(dt);
      else renderer.render(scene, camera);
    },
    // taille de l'écran changée (pixels CSS ou densité de la toile)
    setSize() { if (rest) { size(rest, ratios.rest); sizeMotion(); } },
    // densités de rendu (pixels de rendu par pixel CSS) au repos et en mouvement ; seule la chaîne changée est
    // réallouée
    setRatios({ rest: r = ratios.rest, motion: m = ratios.motion }) {
      const changed = { rest: Math.abs(r - ratios.rest) > 1e-3, motion: Math.abs(m - ratios.motion) > 1e-3 };
      ratios.rest = r;
      ratios.motion = m;
      if (rest && changed.rest) size(rest, r);
      if (changed.rest || changed.motion) sizeMotion();
    },
    get ratios() { return { ...ratios }; },
    setMoving(v) { moving = v; },
    get moving() { return moving; },
    // occlusion : demi-résolution de près, quart en vue lointaine (Empire3D, selon le recul de la caméra)
    setAODetail(near) {
      if (near === aoNear) return;
      aoNear = near;
      [rest, motion].forEach((c) => {
        if (!c?.gtao) return;
        c.aoScale = near ? 0.5 : 0.25;
        if (c.composer._width > 1) c.gtao.setSize(c.composer._width, c.composer._height);
      });
    },
    setQuality(q) { build(q); },
    setLook,
    get enabled() { return !!rest; },
    get passes() { const c = active(); return c ? { gtao: c.gtao, bloom: c.bloom, output: c.output, fxaa: c.fxaa, upscale: c.upscale } : {}; }, // réglage et inspection
    get composer() { return active()?.composer ?? null; }, // mesures (développement)
    // cible où la scène est dessinée (null : écran) : compiler les matériaux d'avance dans la même configuration
    get sceneTarget() { return rest ? rest.composer.readBuffer : null; },
    dispose: teardown,
  };
}
