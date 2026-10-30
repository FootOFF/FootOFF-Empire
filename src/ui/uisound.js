// Petits sons d'interface (menus, onglets, panneaux, notifications) : un pont vers l'ambiance sonore du stade,
// branché par App, pour que n'importe quel composant joue un clic sans dépendre de l'application.
let playUi = () => {};
export function setUiSound(fn) { playUi = fn || (() => {}); }
export const uiSound = (kind) => playUi(kind);
