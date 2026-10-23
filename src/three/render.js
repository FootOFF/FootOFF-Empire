// Rendu de chaque image : la scène dessinée directement dans la toile, multi-échantillonnée (bords lisses, feuillages
// au bord adouci par alpha-to-coverage), sans ombres portées ni post-traitement. C'est l'ancienne qualité
// « Économie », jugée la plus belle et la plus nette : seul rendu du jeu depuis le 2026-10-23 (plus de réglage).
// Les feuillages écrivent un alpha partiel : l'alpha de la toile est ramené à 1 après chaque image (effacement de
// l'alpha seul, quasi gratuit), sinon le fond de la page se verrait en pointillés autour des arbres.
export function createFrameRenderer(renderer, scene, camera) {
  const gl = renderer.getContext();
  return () => {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    gl.colorMask(false, false, false, true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, true);
    renderer.state.buffers.color.reset(); // three réapplique ensuite son masque et sa couleur d'effacement
  };
}
