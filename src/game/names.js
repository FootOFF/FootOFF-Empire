import { pick } from './utils';

export const FIRST = [
  'Yanis', 'Karim', 'Léo', 'Mateo', 'Ibrahim', 'Noah', 'Rayan', 'Enzo', 'Sacha', 'Malo',
  'Amine', 'Lucas', 'Théo', 'Elias', 'Nolan', 'Ilyes', 'Marceau', 'Aadam', 'Kylian', 'Ousmane',
  'Fodé', 'Junior', 'Diego', 'Andrés', 'Marco', 'Pietro', 'Jonas', 'Mika', 'Sofiane', 'Idriss',
  'Félix', 'Aurélien', 'Bilal', 'Adam', 'Gabriel', 'Nassim', 'Sébastien', 'Oscar', 'Tiago', 'Rafael',
];

export const LAST = [
  'Ndiaye', 'Martin', 'Da Silva', 'Kébé', 'Lopez', 'Bernard', 'Okafor', 'Rossi', 'Diallo', 'Petit',
  'Moreau', 'Sissoko', 'Fontaine', 'Garcia', 'Kanté', 'Lemoine', 'Barbosa', 'Traoré', 'Marchand', 'Nkunku',
  'Pereira', 'Sow', 'Ricci', 'Dembélé', 'Cissé', 'Aubert', 'Fofana', 'Girard', 'Mendes', 'Sarr',
  'Dubois', 'Camara', 'Ferrand', 'Bamba', 'Kouassi', 'Renard', 'Vidal', 'Costa', 'Leroux', 'Zahavi',
];

const CLUB_FIRST = [
  'AS', 'FC', 'US', 'Olympique', 'Sporting', 'Racing', 'Étoile', 'Rapid', 'Atlas', 'Avenir', 'Jaunes', 'Bleus',
];

const CLUB_PLACES = [
  'du Tilleul', 'de la Plaine', 'Montfleury', 'des Bruyères', 'de la Vallée', 'Saint-Clair',
  'des Trois Rivières', 'de l’Orme', 'Beaumont', 'du Vieux Port', 'des Coteaux', 'de la Prairie',
  'Rocheval', 'des Fontaines', 'Hauts-Bois', 'de la Gare',
];

// Article d'un club selon son préfixe : l'AS, le FC, les Bleus… (un nom sans préfixe connu reste nu, comme
// celui que le joueur a choisi). clubAfter contracte avec la préposition : « de le FC » → « du FC ».
const ARTICLE = {
  AS: 'l’', US: 'l’', Olympique: 'l’', Étoile: 'l’', Atlas: 'l’', Avenir: 'l’',
  FC: 'le ', Sporting: 'le ', Racing: 'le ', Rapid: 'le ', Jaunes: 'les ', Bleus: 'les ',
};
export const withArticle = (name) => (ARTICLE[name.split(' ')[0]] || '') + name;
// club au nom pluriel (« les Jaunes ») : le verbe s'accorde
export const isPluralClub = (name) => ARTICLE[name.split(' ')[0]] === 'les ';
export function clubAfter(prep, name) {
  const a = withArticle(name);
  if (prep === 'de ' && a.startsWith('le ')) return `du ${a.slice(3)}`;
  if (prep === 'de ' && a.startsWith('les ')) return `des ${a.slice(4)}`;
  if (prep === 'à ' && a.startsWith('le ')) return `au ${a.slice(3)}`;
  if (prep === 'à ' && a.startsWith('les ')) return `aux ${a.slice(4)}`;
  return prep + a;
}
export const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// élision devant un prénom qui commence par une voyelle : « passe décisive d’Adam », « frappe d’Ilyes »
export const deName = (name) => (/^[AEIOUÉÈÊÂÎÔ]/.test(name) ? 'd’' : 'de ') + name;

export function randomClubName() {
  return `${pick(CLUB_FIRST)} ${pick(CLUB_PLACES)}`;
}
