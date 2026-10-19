// Contrôles d'un GLB source (export Blender, en mètres) avant optimisation.
// Chaque contrôle renvoie des issues { level: 'error' | 'warn' | 'info', code, msg }.
// Une erreur bloque la publication du modèle (il n'entre pas dans le manifeste).

import { getBounds, getGLPrimitiveCount } from '@gltf-transform/functions';
import { SPECIAL_NODE } from './config.mjs';

const fmt = (n) => Math.round(n * 10) / 10;

// Nombre d'instances d'un nœud (EXT_mesh_gpu_instancing compris).
function instanceCount(node) {
  const inst = node.getExtension('EXT_mesh_gpu_instancing');
  if (!inst) return 1;
  const attr = inst.listAttributes()[0];
  return attr ? attr.getCount() : 1;
}

// Statistiques de rendu réelles : triangles et draw calls par instance de nœud.
export function sceneStats(doc) {
  let triangles = 0, drawCalls = 0;
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const n = instanceCount(node);
    for (const prim of mesh.listPrimitives()) {
      const mode = prim.getMode();
      if (mode >= 4) triangles += getGLPrimitiveCount(prim) * n; // TRIANGLES / STRIP / FAN
      drawCalls += 1; // une instance GPU = un seul draw call
    }
  });
  const root = doc.getRoot();
  return {
    triangles,
    drawCalls,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    meshes: root.listMeshes().length,
  };
}

export function checkSource(doc, { category, name }) {
  const issues = [];
  const add = (level, code, msg) => issues.push({ level, code, msg });
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (!scene || !scene.listChildren().length) {
    add('error', 'empty', 'Scène vide : aucun nœud exporté.');
    return { issues, stats: null, bounds: null, special: [] };
  }

  // --- Dimensions, unités, ancrage ---
  const { min, max } = getBounds(scene);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const fp = category.footprint;
  const maxDim = Math.max(...size);
  if (maxDim > 2000) {
    add('error', 'units', `Taille ${fmt(maxDim)} : le modèle semble exporté en centimètres. Exporter en mètres (Unit Scale = 1).`);
  } else if (maxDim < 2) {
    add('error', 'units', `Taille ${fmt(maxDim)} : modèle minuscule. Attendu en mètres (emprise ${fp.w} × ${fp.d} m).`);
  } else {
    // L'emprise est centrée sur l'origine (le jeu ne recentre pas) : on mesure depuis l'origine.
    const spanX = 2 * Math.max(Math.abs(min[0]), Math.abs(max[0]));
    const spanZ = 2 * Math.max(Math.abs(min[2]), Math.abs(max[2]));
    if (spanX > fp.w * 1.02 || spanZ > fp.d * 1.02) {
      add('error', 'footprint', `Emprise ${fmt(spanX)} × ${fmt(spanZ)} m mesurée depuis l'origine > ${fp.w} × ${fp.d} m autorisés.`);
    } else if (size[0] < fp.w * 0.4 && size[2] < fp.d * 0.4) {
      add('warn', 'footprint-small', `Emprise ${fmt(size[0])} × ${fmt(size[2])} m : très petite pour une parcelle de ${fp.w} × ${fp.d} m.`);
    }
    if (size[1] > category.maxHeight) add('warn', 'height', `Hauteur ${fmt(size[1])} m > ${category.maxHeight} m conseillés.`);
  }
  if (Math.abs(min[1]) > 0.1) {
    add('warn', 'ground', `Base à y = ${fmt(min[1])} m (attendu 0) : origine pas au sol (le jeu ne recale pas).`);
  }
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  if (Math.abs(cx) > fp.w * 0.05 || Math.abs(cz) > fp.d * 0.05) {
    add('info', 'center', `Modèle décentré de (${fmt(cx)}, ${fmt(cz)}) m par rapport à l'origine : normal s'il est asymétrique, sinon vérifier l'origine.`);
  }

  // --- Transformations ---
  scene.traverse((node) => {
    const det = node.getWorldMatrix();
    const d = det[0] * (det[5] * det[10] - det[6] * det[9]) - det[1] * (det[4] * det[10] - det[6] * det[8]) + det[2] * (det[4] * det[9] - det[5] * det[8]);
    if (node.getMesh() && d < 0) add('warn', 'negative-scale', `« ${node.getName()} » a une échelle négative (normales inversées). Appliquer l'échelle dans Blender.`);
  });

  // --- Géométrie et matériaux ---
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat) {
        add('warn', 'no-material', `Maillage « ${mesh.getName()} » sans matériau.`);
        continue;
      }
      const textured = mat.getBaseColorTexture() || mat.getNormalTexture() || mat.getMetallicRoughnessTexture()
        || mat.getOcclusionTexture() || mat.getEmissiveTexture();
      if (textured && !prim.getAttribute('TEXCOORD_0')) {
        add('error', 'no-uv', `« ${mesh.getName()} » utilise une texture mais n'a pas d'UV.`);
      }
      if (!prim.getAttribute('NORMAL')) add('info', 'no-normals', `« ${mesh.getName()} » sans normales : elles seront calculées.`);
    }
  }
  for (const tex of root.listTextures()) {
    const s = tex.getSize();
    if (!s) { add('warn', 'texture-unreadable', `Texture « ${tex.getName() || tex.getURI()} » illisible.`); continue; }
    if (Math.max(...s) > category.maxTextureSize) {
      add('info', 'texture-resize', `Texture « ${tex.getName() || tex.getURI()} » ${s[0]}×${s[1]} : réduite à ${category.maxTextureSize} px max.`);
    }
  }

  // --- Contenu indésirable ---
  if (root.listCameras().length) add('info', 'cameras', `${root.listCameras().length} caméra(s) exportée(s) : supprimée(s).`);
  if (root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_lights_punctual')) {
    add('info', 'lights', 'Lumières Blender exportées : supprimées (utiliser des empties « light_* »).');
  }

  // --- Nœuds spéciaux ---
  const special = [];
  scene.traverse((node) => { if (SPECIAL_NODE.test(node.getName())) special.push(node.getName()); });
  if (name.startsWith('terrain_') && !special.some((n) => /^light_/i.test(n))) {
    add('info', 'no-light-anchor', 'Aucun empty « light_* » : le stade utilisera le projecteur par défaut la nuit.');
  }

  return { issues, stats: sceneStats(doc), bounds: { min, max, size }, special };
}

// Contrôles du GLB optimisé : budgets de rendu et de poids.
export function checkOutput(stats, bytes, category) {
  const issues = [];
  const add = (level, code, msg) => issues.push({ level, code, msg });
  const ratio = (v, max) => v / max;
  const budget = (v, max, code, label) => {
    if (v > max) add('error', code, `${label} ${v.toLocaleString('fr-FR')} > budget ${max.toLocaleString('fr-FR')}.`);
    else if (ratio(v, max) > 0.85) add('warn', code, `${label} ${v.toLocaleString('fr-FR')} : ${Math.round(ratio(v, max) * 100)} % du budget.`);
  };
  budget(stats.triangles, category.maxTriangles, 'triangles', 'Triangles');
  budget(bytes, category.maxBytes, 'bytes', 'Poids (octets)');
  if (stats.drawCalls > category.maxDrawCalls) add('warn', 'draw-calls', `${stats.drawCalls} draw calls > ${category.maxDrawCalls} conseillés : regrouper les matériaux.`);
  if (stats.materials > category.maxMaterials) add('warn', 'materials', `${stats.materials} matériaux > ${category.maxMaterials} conseillés : utiliser un atlas / trim sheet.`);
  if (stats.textures > category.maxTextures) add('warn', 'textures', `${stats.textures} textures > ${category.maxTextures} conseillées.`);
  return issues;
}
