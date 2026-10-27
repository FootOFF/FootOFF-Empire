// Canal du direct vers la scène 3D (0.7) : l'écran du direct y écrit l'état du match (onze, dispositifs, horloge) et
// le temps fort à jouer (hl) ; la scène y répond (hlAck : commencé, hlReveal : instant décisif passé, hlDone : fini,
// hlPhase : « replay » pendant le ralenti, hlClock : minute de jeu pendant l'action) et dit qu'elle existe (scene).
// show3D : la 3D est à l'écran (sinon la boucle de rendu ne dessine rien pendant le direct). Un simple objet partagé :
// pas de rendu React vingt fois par seconde pour transmettre l'horloge.

// Durée réelle d'une minute de jeu à vitesse normale, entre deux temps forts (environ 70 s pour 90 minutes).
export const SEC_PER_MIN = 0.78;

export const matchFeed = {
  active: false, // un direct est à l'écran
  ended: false, // le match vient de se terminer (la pelouse se vide)
  phase: 'off', // playing | halftime | fulltime
  half: 1,
  clock: 0, // minute de jeu (décimale)
  speed: 1,
  formation: '433',
  awayFormation: '433',
  homeNames: [], // noms de notre onze, dans l'ordre des postes du dispositif
  awayNames: [], // noms du onze adverse, dans l'ordre des postes de son dispositif
  awayName: '',
  scene: false, // la scène du match existe (WebGL disponible)
  hl: null, // temps fort demandé : { id, e (événement du moteur), type, half, replay, onze et dispositifs, absents }
  hlAck: 0,
  hlReveal: 0,
  hlDone: 0,
  hlClock: 0,
  hlPhase: '',
  show3D: false,
};

if (import.meta.env?.DEV && typeof window !== 'undefined') window.__matchFeed = matchFeed; // inspection en développement

export function resetFeed() {
  Object.assign(matchFeed, {
    active: false, phase: 'off', half: 1, clock: 0, speed: 1, homeNames: [], awayNames: [], hl: null, hlAck: 0, hlReveal: 0, hlDone: 0, hlPhase: '', show3D: false,
  });
}
