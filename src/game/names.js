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

export function randomClubName() {
  return `${pick(CLUB_FIRST)} ${pick(CLUB_PLACES)}`;
}
