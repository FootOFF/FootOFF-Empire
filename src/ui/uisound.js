// Petits sons d'interface (menus, onglets, panneaux, notifications) : un pont vers l'ambiance sonore du stade,
// branché par App, pour que n'importe quel composant joue un clic sans dépendre de l'application.
let playUi = () => {};
export function setUiSound(fn) { playUi = fn || (() => {}); }
export const uiSound = (kind) => playUi(kind);
// frappe dans un champ (1.0.13) : effacer (retour arrière, suppression, couper) ou écrire, d'après la nature de la saisie
// (une lettre tapée sur un texte sélectionné, c'est écrire)
export const typeSound = (e, before) => uiSound((e.nativeEvent?.inputType ? e.nativeEvent.inputType.startsWith('delete') : e.target.value.length < before.length) ? 'keyback' : 'key');
