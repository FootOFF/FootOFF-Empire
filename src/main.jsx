// Point d'entrée : la langue d'abord (src/i18n), puis le jeu. Chaque module lit la langue une fois, à son chargement
// (ses tableaux de textes sont écrits dans cette langue) : le reste du jeu n'est chargé qu'une fois le dictionnaire prêt.
import { initI18n } from './i18n';

initI18n().then(() => import('./boot.jsx'));
