// Canal du match en direct vers la scène 3D : l'écran du direct y écrit l'horloge, la vitesse et les événements
// de la mi-temps (connus d'avance) ; la scène les lit à chaque image pour jouer chaque action au bon moment.
// Un simple objet partagé : pas de rendu React vingt fois par seconde pour transmettre l'horloge.

// Durée réelle d'une minute de jeu à vitesse normale : assez pour voir chaque action se construire en 3D
// (environ 70 s pour 90 minutes, hors célébrations).
export const SEC_PER_MIN = 0.78;

export const matchFeed = {
  active: false, // un direct est à l'écran
  ended: false, // le match vient de se terminer (le stade se vide, les joueurs sont rentrés)
  phase: 'off', // playing | halftime | fulltime
  half: 1,
  clock: 0, // minute de jeu (décimale)
  speed: 1,
  pause: 0, // secondes réelles de pause restantes (célébration d'un but)
  events: [], // événements de la mi-temps en cours (triés)
  formation: '433',
  homeNames: [], // noms des onze, dans l'ordre des postes du dispositif
  awayNames: [], // noms des onze adverses (4-3-3)
  awayName: '',
  skipped: 0, // incrémenté quand le joueur passe directement à la fin d'une mi-temps
};

export function resetFeed() {
  Object.assign(matchFeed, {
    active: false, phase: 'off', half: 1, clock: 0, speed: 1, pause: 0, events: [], homeNames: [], awayNames: [], skipped: 0,
  });
}
