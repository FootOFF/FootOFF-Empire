import * as THREE from 'three';

// Projecteurs réels aux positions « light_* » d'un modèle (mâts, pylônes, bord de toiture).
// Ils visent le centre de la zone éclairée (barycentre des projecteurs, au sol), sans ombres pour rester
// légers. Ici, seule l'intensité varie ; Empire3D (syncSpots) les sort tous ensemble du calcul de la lumière
// quand aucun n'éclaire (le jour).
// aim : part du chemin vers ce centre où vise chaque projecteur (1 : le centre). Les mâts aux coins de l'esplanade
// éclairent l'esplanade devant eux (0,4) : visant le centre du complexe, ils inondaient le stade, déjà éclairé par
// ses propres projecteurs, et la nuit le halo noyait tout le stade dès qu'on s'en approchait.

export function plotLights(scene, contentNode, { max = 6, power = 4, aim = 1 } = {}) {
  const anchors = contentNode.userData.lightAnchors || [];
  if (!anchors.length) return null;
  contentNode.updateMatrixWorld(true);
  const positions = anchors.map((a) => a.getWorldPosition(new THREE.Vector3()));
  const center = positions.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(positions.length);
  center.y = 0;
  const step = positions.length / Math.min(max, positions.length);
  const picked = Array.from({ length: Math.min(max, positions.length) }, (_, i) => positions[Math.floor(i * step)]);
  const targets = picked.map((p) => p.clone().lerp(center, aim).setY(0));
  // portée limitée à la zone éclairée et bords de faisceau doux : pas de coin de lumière qui s'étire sur l'esplanade
  const reach = Math.max(...picked.map((p, i) => p.distanceTo(targets[i]))) * 1.9 + 1;
  const lights = picked.map((p, i) => {
    const spot = new THREE.SpotLight(0xfff1dc, 0, reach, Math.PI / 4.2, 0.9, 0);
    spot.position.copy(p);
    spot.target.position.copy(targets[i]);
    scene.add(spot, spot.target);
    return spot;
  });
  const base = power / lights.length * 4;
  return {
    count: lights.length,
    // 0 : éteint (jour) · 1 : nuit · 1,4 : jour de match
    setLevel(level) { lights.forEach((l) => { l.intensity = base * level; }); },
    dispose() { lights.forEach((l) => { scene.remove(l, l.target); l.dispose(); }); },
  };
}
