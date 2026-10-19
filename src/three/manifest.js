import { GENERATED_MODELS, GENERATED_PROPS } from './models.generated';

// Manifeste des modèles GLB (semi-réalistes) par bâtiment et par niveau.
// Les entrées sont générées par `npm run models` (models.generated.js) ; MODELS ci-dessous
// permet de les surcharger ou d'en ajouter à la main.
// Clé : '<bâtiment>:<niveau>'. Les URLs sont relatives à public/ (base Vite './').
//
// Options par entrée :
//   url    : chemin du .glb (obligatoire)
//   scale  : facteur d'échelle appliqué (export Blender en mètres -> 0.1, car 1 unité = 10 m)
//   fit    : true = ajuster à l'emprise, recentrer et recaler au sol (ignore `scale`) ;
//            sans fit, l'origine du modèle est posée au centre de la parcelle telle quelle
//   rotY   : rotation en radians si la façade du modèle n'est pas orientée +Z
//   offset : [x, y, z] décalage après normalisation
//
// Convention d'export : origine au centre de l'emprise, posé au sol (y = 0), façade vers +Z.
// Nœuds nommés reconnus par le loader :
//   emissive_*  -> fenêtres / LED qui s'allument la nuit
//   light_*     -> empties : positions des projecteurs (lues par le loader, exploitées en phase 4)
//
// Un niveau sans entrée utilise le niveau inférieur le plus proche disponible, sinon le procédural.
// Exemple :
//   'terrain:1': { url: 'models/buildings/terrain_L1.glb', scale: 0.1 },
//   'fans:2':    { url: 'models/buildings/fans_L2.glb', fit: true },

export const MODELS = {
  ...GENERATED_MODELS,
  // surcharges manuelles éventuelles
};

// Décor et parcelles : 'site' (voirie, arbres, lampadaires), 'plot_empty', 'plot_locked'.
export function resolveProp(name) {
  const entry = GENERATED_PROPS[name];
  return entry ? { ...entry, id: `prop:${name}` } : null;
}

export function resolveModel(key, lvl) {
  for (let l = lvl; l >= 1; l--) {
    const entry = MODELS[`${key}:${l}`];
    if (entry) return { ...entry, id: `${key}:${l}` };
  }
  return null;
}
