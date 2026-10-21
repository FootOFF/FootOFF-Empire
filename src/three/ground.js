import * as THREE from 'three';

// Sols photo du complexe : matériaux ground_* de build_site.py (matières CC0 préparées par tools/grounds/prepare.py).
// Chaque photo se répète tous les 1,4 à 3 m ; vue de loin, la répétition dessinerait un quadrillage. Sans rien
// télécharger de plus, le jeu ajoute :
//  - des taches à grande échelle (bruit périodique de 64 m généré ici) sur la couleur et la rugosité ;
//  - sur l'esplanade, une mosaïque : chaque dalle d'un mètre prend l'une des neuf dalles de la photo, tournée au
//    hasard, avec sa propre nuance (joints calés au mètre par prepare.py) ;
//  - les bandes de tonte des pelouses (2 m), estompées quand elles deviennent plus fines qu'un pixel (pas de moiré) ;
// et un filtrage anisotrope léger (2x : sols nets jusqu'au loin ; 8x ne se voyait pas et coûtait 1,7 ms en 4 Mpx).
// Ni la carte de métal (vide au sol), ni l'occlusion des photos (1,2 ms pour un effet invisible sous l'occlusion
// d'écran) ne sont lues. Tous les sols partagent deux programmes (avec ou sans mosaïque de dalles).
// Ordre de dessin (mesuré, vue rapprochée en 4 Mpx : -4,5 ms) : les sols passent après tout le reste (arbres,
// bâtiments, mobilier cachent déjà une partie du sol : ses pixels cachés ne sont plus calculés), les couches posées
// dessus (bordures, bandes, caniveaux, peinture, paillage) avant les surfaces qu'elles recouvrent, et la pelouse, qui
// s'étend sous tout le site, en tout dernier (-2,7 ms à elle seule). Un sol plat ne projette pas d'ombre (seul le
// granit des jardinières, des margelles et des bancs en pierre en garde une).
// Extras glTF lus dans material.userData : tile (mètres par répétition), slabs (dalles par tuile), mean (couleur
// moyenne, lumière linéaire : sert aussi au terrain et aux routes du paysage, landscape.js), factor (teinte
// multipliée : l'esplanade et l'axe d'honneur, plus clair, partagent la même photo).
// Le stade (build_stadium.py) reprend ces matières photo pour ses gradins, toits, murs et petits gradins en bois (taches
// et rugosité nuancées de même, mais ombres et ordre de dessin ordinaires), et sa pelouse a son propre traitement
// (pitch_L*, plus bas).

// x : taches (couleur), y : rugosité, z : nuance par dalle, w : bandes de tonte
const VARIATION = {
  ground_esplanade: [0.09, 0.12, 0.03, 0],
  ground_prestige: [0.07, 0.12, 0.02, 0],
  ground_band: [0.07, 0.1, 0, 0],
  ground_granite: [0.07, 0.1, 0, 0],
  ground_sidewalk: [0.1, 0.1, 0, 0],
  ground_asphalt: [0.2, 0.12, 0, 0],
  ground_paint: [0.08, 0.08, 0, 0],
  ground_lawn: [0.16, 0.05, 0, 0.09],
  ground_concrete: [0.1, 0.1, 0, 0],
  ground_gravel: [0.1, 0.06, 0, 0],
  ground_mulch: [0.1, 0.04, 0, 0],
  // stade
  stand_concrete: [0.08, 0.1, 0, 0],
  stand_concrete_dark: [0.08, 0.1, 0, 0],
  roof_deck: [0.06, 0.1, 0, 0],
  roof_membrane: [0.06, 0.1, 0, 0],
  brick_wall: [0.06, 0.06, 0, 0],
  wood_bleacher: [0.08, 0.05, 0, 0],
};
const PITCH_NAME = /^pitch_L\d+$/;
// Ordre de dessin du stade (mesuré, vue face à une tribune en 4 Mpx : -3 ms) : toits et sièges d'abord, puis le reste,
// béton des gradins et façades en dernier : les parties que cachent sièges, garde-corps et toits ne sont plus calculées.
const STADIUM_ORDER = {
  roof_deck: -1, roof_membrane: -1, seats: -1, seats_accent: -1, stand_concrete: 1, stand_concrete_dark: 1, stadium_facade: 1,
};

let noise = null;
let anisotropy = 2;
const TOP_LAYERS = new Set(['ground_band', 'ground_granite', 'ground_concrete', 'ground_paint', 'ground_mulch']);

export function setGroundAnisotropy(renderer) {
  anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
}

// Place d'un maillage dans l'ordre de dessin et ses ombres : sols, pelouse et pièces du stade (assets.js, au
// chargement du modèle).
export function placeGround(mesh) {
  const m = mesh.material;
  if (STADIUM_ORDER[m?.name] !== undefined) { mesh.renderOrder = STADIUM_ORDER[m.name]; return; }
  if (m?.userData?.pitch) { // pelouse du stade : plate, dessinée après ce qui en cache une partie (tribune sud, buts)
    mesh.renderOrder = 2;
    mesh.castShadow = false;
    return;
  }
  if (!m?.userData?.ground || !m.name.startsWith('ground_')) return; // gradins, toits, murs : ordinaires
  mesh.renderOrder = TOP_LAYERS.has(m.name) ? 1 : m.name === 'ground_lawn' ? 3 : 2;
  mesh.castShadow = m.name === 'ground_granite';
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// bruit de valeur périodique (raccord sans couture), octaves de `cells` à 8 x cells cellules par tuile
function layer(size, seed, cells, octaves) {
  const out = new Float32Array(size * size);
  let total = 0;
  for (let o = 0, amp = 1; o < octaves; o++, amp *= 0.5) {
    const G = cells << o;
    const r = mulberry32(seed * 977 + o);
    const g = Float32Array.from({ length: G * G }, r);
    for (let y = 0; y < size; y++) {
      const fy = (y + 0.5) / size * G, y0 = Math.floor(fy);
      let ty = fy - y0; ty = ty * ty * (3 - 2 * ty);
      const j0 = y0 % G, j1 = (y0 + 1) % G;
      for (let x = 0; x < size; x++) {
        const fx = (x + 0.5) / size * G, x0 = Math.floor(fx);
        let tx = fx - x0; tx = tx * tx * (3 - 2 * tx);
        const i0 = x0 % G, i1 = (x0 + 1) % G;
        out[y * size + x] += amp * ((g[j0 * G + i0] * (1 - tx) + g[j0 * G + i1] * tx) * (1 - ty)
          + (g[j1 * G + i0] * (1 - tx) + g[j1 * G + i1] * tx) * ty);
      }
    }
    total += amp;
  }
  return out.map((v) => v / total);
}

function noiseTexture() {
  if (noise) return noise;
  const S = 256;
  const a = layer(S, 1, 3, 4); // grandes taches (~10 à 20 m)
  const b = layer(S, 2, 12, 3); // taches moyennes (~3 à 5 m)
  const c = layer(S, 3, 6, 3); // rugosité (zones plus lisses, comme lustrées)
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = 255;
  }
  noise = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = THREE.LinearFilter;
  noise.minFilter = THREE.LinearMipmapLinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  return noise;
}

const DECLARE = /* glsl */`
uniform sampler2D uGroundNoise;
uniform float uGroundTile;
uniform float uGroundSlabs;
uniform vec4 uGroundVar;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
#ifdef GROUND_SLABS
// Mosaïque : chaque dalle prend l'une des n x n dalles de la photo, tournée d'un quart de tour au hasard (joints
// calés sur les bords des dalles par prepare.py) : plus aucune répétition visible. Gradients de la position réelle
// (tournés avec la dalle) : filtrage correct, sans liseré flou au bord des dalles.
vec2 gSlabUv, gDx, gDy;
float gRot;
vec2 gTurn( vec2 v ) {
	if ( gRot == 1.0 ) return vec2( v.y, - v.x );
	if ( gRot == 2.0 ) return - v;
	if ( gRot == 3.0 ) return vec2( - v.y, v.x );
	return v;
}
vec2 gUnturn( vec2 n ) {
	if ( gRot == 1.0 ) return vec2( - n.y, n.x );
	if ( gRot == 2.0 ) return - n;
	if ( gRot == 3.0 ) return vec2( n.y, - n.x );
	return n;
}
void gSlabs( vec2 uv ) {
	vec2 dx = dFdx( uv ), dy = dFdy( uv );
	vec2 s = uv * uGroundSlabs;
	vec2 cell = floor( s );
	vec2 f = s - cell;
	gRot = floor( gHash( cell + 3.7 ) * 4.0 );
	if ( gRot == 1.0 ) f = vec2( f.y, 1.0 - f.x );
	else if ( gRot == 2.0 ) f = 1.0 - f;
	else if ( gRot == 3.0 ) f = vec2( 1.0 - f.y, f.x );
	vec2 pick = floor( vec2( gHash( cell + 11.3 ), gHash( cell + 29.1 ) ) * uGroundSlabs );
	gSlabUv = ( pick + f ) / uGroundSlabs;
	gDx = gTurn( dx );
	gDy = gTurn( dy );
}
#define G_SAMPLE( t, uv ) textureGrad( t, gSlabUv, gDx, gDy )
#else
#define G_SAMPLE( t, uv ) texture2D( t, uv )
#endif
`;

const ALBEDO = /* glsl */`
vec2 gM = vec2( vMapUv.x, - vMapUv.y ) * uGroundTile; // mètres dans le plan du site
vec4 gN = texture2D( uGroundNoise, gM / 64.0 );
float gSpots = ( gN.r - 0.5 ) * 1.6 + ( gN.g - 0.5 ) * 0.8;
float gRough = ( gN.b - 0.5 ) * 2.0;
diffuseColor.rgb *= 1.0 + uGroundVar.x * gSpots;
if ( uGroundSlabs > 0.0 ) {
	float gH = gHash( floor( vMapUv * uGroundSlabs ) );
	diffuseColor.rgb *= 1.0 + uGroundVar.z * ( gH * 2.0 - 1.0 );
}
if ( uGroundVar.w > 0.0 ) { // pelouses : touffes (~1 m), zones un peu plus sèches, bandes de tonte
	float gClump = texture2D( uGroundNoise, gM / 9.0 ).g - 0.5;
	diffuseColor.rgb *= 1.0 + 0.16 * gClump;
	float gDry = smoothstep( 0.56, 0.85, gN.r ) * 0.55;
	diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.12, 1.04, 0.8 ), gDry );
	float gFade = clamp( 1.0 - fwidth( gM.x ) * 0.6, 0.0, 1.0 );
	diffuseColor.rgb *= 1.0 + uGroundVar.w * clamp( sin( gM.x * 1.5707963 ) * 4.0, - 1.0, 1.0 ) * gFade;
}
`;

const ROUGHNESS = /* glsl */`
roughnessFactor = clamp( roughnessFactor * ( 1.0 + uGroundVar.y * gRough ), 0.04, 1.0 );
`;

// morceaux de three dont les lectures de texture passent par G_SAMPLE (mosaïque des dalles ou lecture normale)
const chunk = (name, from, to) => {
  const src = THREE.ShaderChunk[name];
  if (!src.includes(from)) throw new Error(`ground.js : ${name} a changé (three)`);
  return src.replace(from, to);
};
const MAP = chunk('map_fragment', 'texture2D( map, vMapUv )', 'G_SAMPLE( map, vMapUv )');
const NORMAL = chunk('normal_fragment_maps', 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
  'vec3 mapN = G_SAMPLE( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;\n\t#ifdef GROUND_SLABS\n\t\tmapN.xy = gUnturn( mapN.xy );\n\t#endif');
const ROUGH = chunk('roughnessmap_fragment', 'texture2D( roughnessMap, vRoughnessMapUv )', 'G_SAMPLE( roughnessMap, vRoughnessMapUv )');
const AO = chunk('aomap_fragment', 'texture2D( aoMap, vAoMapUv )', 'G_SAMPLE( aoMap, vAoMapUv )');

function groundCompile(shader) {
  const p = this.userData.ground;
  shader.uniforms.uGroundNoise = { value: noiseTexture() };
  shader.uniforms.uGroundTile = { value: p.tile };
  shader.uniforms.uGroundSlabs = { value: p.slabs };
  shader.uniforms.uGroundVar = { value: p.variation };
  shader.fragmentShader = (p.slabs > 0 ? '#define GROUND_SLABS\n' : '') + shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${DECLARE}`)
    .replace('void main() {', 'void main() {\n#ifdef GROUND_SLABS\n\tgSlabs( vMapUv );\n#endif')
    .replace('#include <map_fragment>', `${MAP}\n${ALBEDO}`)
    .replace('#include <normal_fragment_maps>', NORMAL)
    .replace('#include <roughnessmap_fragment>', `${ROUGH}\n${ROUGHNESS}`)
    .replace('#include <aomap_fragment>', AO);
}
function groundKey() { return this.userData.ground.slabs > 0 ? 'ground-slabs' : 'ground'; }

// Pelouse du stade (pitch_L*, build_stadium.py). L'image du modèle ne porte que la teinte du gazon et l'usure : la
// caméra du jeu reste à 60 m et plus, où une photo de gazon se fond en aplat et où une image de 120 m rendrait les
// lignes floues. Le jeu dessine donc :
//  - les bandes de tonte (5,25 m ; croisées de 5 m au niveau 4) selon le point de vue, comme un vrai gazon : brins
//    couchés vers la caméra (sombres) ou à l'opposé (clairs) ; les bandes s'inversent quand on fait le tour du stade
//    et s'effacent vues dans l'autre sens ;
//  - touffes (bruit des pelouses du complexe), atténuées sur l'usure (les grandes taches sont dans l'image) ;
//  - les marquages réglementaires de 12 cm, calculés au pixel : nets et sans scintillement à toute distance (à la chaux
//    et usés au terrain municipal).
// Réglages par niveau : extras stripes, cross, chalk.
const PITCH_DECLARE = /* glsl */`
uniform sampler2D uGroundNoise;
uniform vec3 uPitchStyle;
uniform vec3 uPitchAxX, uPitchAxY; // axes du terrain (longueur, largeur vers le nord) dans l'espace de vue
// couverture d'un trait de 12 cm par un pixel qui couvre w mètres en travers du trait (d : distance à son axe)
float pCov( float d, float w ) {
	w = max( w, 1e-4 );
	return clamp( ( min( d + 0.5 * w, 0.06 ) - max( d - 0.5 * w, - 0.06 ) ) / w, 0.0, 1.0 );
}
// marquages réglementaires ; p : mètres depuis le centre (x le long du terrain), a = |p| : un quart du terrain suffit ;
// r0, r1, r2 : distances aux centres du rond central, des points de réparation et des coins. Largeur du pixel mesurée
// en travers de chaque famille de traits (fw : x, y ; fr : rayons) : aucun trait ne se hache au loin. Couvertures
// calculées seulement près d'un trait.
float pLines( vec2 p, vec2 a, float r0, float r1, float r2, vec2 fw, vec3 fr ) {
	const float P = 52.5, Q = 34.0, E = 0.06;
	float dx = a.y < Q + E ? min( a.x, abs( a.x - P ) ) : 1e3; // ligne médiane, lignes de but
	dx = min( dx, a.y < 20.16 + E ? abs( a.x - P + 16.5 ) : 1e3 ); // surfaces de réparation
	dx = min( dx, a.y < 9.16 + E ? abs( a.x - P + 5.5 ) : 1e3 ); // surfaces de but
	float dy = a.x < P + E ? abs( a.y - Q ) : 1e3; // touches
	dy = min( dy, a.x > P - 16.5 - E && a.x < P ? abs( a.y - 20.16 ) : 1e3 );
	dy = min( dy, a.x > P - 5.5 - E && a.x < P ? abs( a.y - 9.16 ) : 1e3 );
	float d0 = min( abs( r0 - 9.15 ), max( r0 - 0.09, 0.0 ) ); // rond et point central (15 cm)
	float d1 = min( a.x < P - 16.5 ? abs( r1 - 9.15 ) : 1e3, max( r1 - 0.09, 0.0 ) ); // arcs et points de réparation
	float d2 = a.x < P && a.y < Q ? abs( r2 - 1.0 ) : 1e3; // arcs de coin
	if ( min( min( dx, dy ), min( d0, min( d1, d2 ) ) ) > 0.06 + max( max( fw.x, fw.y ), max( fr.x, max( fr.y, fr.z ) ) ) ) return 0.0;
	float c = max( pCov( dx, fw.x ), pCov( dy, fw.y ) );
	c = max( c, pCov( d0, fr.x ) );
	c = max( c, pCov( d1, fr.y ) );
	return max( c, pCov( d2, fr.z ) );
}
`;

const PITCH = /* glsl */`
vec2 pM = vec2( vMapUv.x * 120.0 - 60.0, 40.0 - vMapUv.y * 80.0 ); // mètres depuis le centre (y vers le nord)
vec3 pV = normalize( vViewPosition ); // vers la caméra
float pVx = dot( uPitchAxX, pV ), pVy = dot( uPitchAxY, pV );
vec2 pFw = vec2( fwidth( pM.x ), fwidth( pM.y ) );
float pFade = clamp( 2.0 - 0.5 * ( pFw.x + pFw.y ), 0.0, 1.0 ); // bandes plus fines qu'un pixel : unies
float pBx = clamp( sin( ( pM.x + 52.5 ) * 0.5983986 ) * 8.0, - 1.0, 1.0 ); // bandes de 5,25 m, tondues en largeur
float pBy = clamp( sin( ( pM.y + 34.0 ) * 0.6283185 ) * 8.0, - 1.0, 1.0 ); // bandes croisées de 5 m, tondues en long
float pWear = smoothstep( 0.8, 1.3, diffuseColor.r / max( diffuseColor.g, 1e-4 ) ); // terre
float pStripe = ( uPitchStyle.x * pBx * ( 0.015 - 0.12 * pVy ) + uPitchStyle.y * pBy * ( 0.015 - 0.12 * pVx ) )
	* pFade * ( 1.0 - pWear );
vec4 pN = texture2D( uGroundNoise, pM / 9.0 ); // touffes (g) ; chaux usée par plaques de quelques mètres (r)
diffuseColor.rgb *= ( 1.0 + pStripe ) * ( 1.0 + 0.14 * ( pN.g - 0.5 ) * ( 1.0 - 0.5 * pWear ) );
vec2 pA = abs( pM );
float pR0 = length( pM ), pR1 = length( vec2( pA.x - 41.5, pM.y ) ), pR2 = length( pA - vec2( 52.5, 34.0 ) );
float pLine = pLines( pM, pA, pR0, pR1, pR2, pFw, vec3( fwidth( pR0 ), fwidth( pR1 ), fwidth( pR2 ) ) ); // marquages
pLine *= 1.0 - uPitchStyle.z * 0.5 * smoothstep( 0.4, 0.7, pN.r );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.7 ) * ( 1.0 + 0.5 * pStripe ), pLine );
`;

function pitchCompile(shader) {
  const u = this.userData;
  shader.uniforms.uGroundNoise = { value: noiseTexture() };
  shader.uniforms.uPitchStyle = { value: u.pitch };
  shader.uniforms.uPitchAxX = { value: u.pitchAxes.x };
  shader.uniforms.uPitchAxY = { value: u.pitchAxes.y };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${PITCH_DECLARE}`)
    .replace('#include <map_fragment>', `#include <map_fragment>\n${PITCH}`);
}
// axes du terrain dans l'espace de vue, une fois par dessin plutôt qu'à chaque pixel : longueur (+x du modèle) et
// largeur vers le nord (-z du modèle, +y de Blender)
const _mv = new THREE.Matrix4();
function pitchView(renderer, scene, camera, geometry, object) {
  const a = this.userData.pitchAxes;
  _mv.multiplyMatrices(camera.matrixWorldInverse, object.matrixWorld);
  a.x.set(1, 0, 0).transformDirection(_mv);
  a.y.set(0, 0, -1).transformDirection(_mv);
}
function pitchKey() { return 'pitch'; }

function preparePitch(m) {
  if (!m.map || m.userData.pitch) return;
  const u = m.userData;
  u.pitch = new THREE.Vector3(u.stripes ?? 1, u.cross ?? 0, u.chalk ?? 0);
  u.pitchAxes = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1) };
  m.map.anisotropy = anisotropy;
  m.roughness = 0.92;
  m.metalness = 0;
  m.onBeforeCompile = pitchCompile;
  m.onBeforeRender = pitchView;
  m.customProgramCacheKey = pitchKey;
}

// Matériau photo d'un modèle chargé (assets.js, une fois par modèle source : les clones le partagent).
export function prepareGround(m) {
  if (PITCH_NAME.test(m.name)) { preparePitch(m); return; }
  const variation = VARIATION[m.name];
  if (!variation || !m.map || m.userData.ground) return;
  m.userData.ground = {
    tile: m.userData.tile || 1,
    slabs: m.userData.slabs || 0,
    variation: new THREE.Vector4(...variation),
  };
  [m.map, m.normalMap, m.roughnessMap].forEach((t) => { if (t) t.anisotropy = anisotropy; });
  m.metalnessMap = null; // canal B de l'ARM : vide au sol
  m.aoMap = null; // canal R : occlusion des photos, invisible sous l'occlusion d'écran
  if (m.userData.factor) m.color.setRGB(...m.userData.factor); // lumière linéaire
  m.metalness = 0;
  m.onBeforeCompile = groundCompile;
  m.customProgramCacheKey = groundKey; // deux programmes pour tous les sols : avec ou sans mosaïque de dalles
}
