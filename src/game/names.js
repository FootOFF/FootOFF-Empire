import { pick } from './utils';

// Noms des joueurs : surtout francophones, faciles à prononcer et à retenir, pour s'attacher à ses joueurs.
// Aucune combinaison ne doit donner un footballeur connu : les noms et prénoms trop associés à de vrais joueurs
// sont écartés (pas de Griezmann, de Giroud ni de Dembélé ; pas de « Nolan Roux », « Loïc Perrin »,
// « Gabriel Charpentier », « Paul Lambert »…).
export const FIRST = [
  'Léo', 'Hugo', 'Louis', 'Jules', 'Gabriel', 'Arthur', 'Raphaël', 'Paul', 'Victor', 'Adam',
  'Sacha', 'Nathan', 'Théo', 'Tom', 'Baptiste', 'Mathis', 'Lucas', 'Enzo', 'Axel', 'Clément',
  'Antoine', 'Maxime', 'Quentin', 'Romain', 'Julien', 'Bastien', 'Valentin', 'Simon', 'Robin', 'Marius',
  'Gaspard', 'Félix', 'Oscar', 'Noé', 'Malo', 'Timothée', 'Elias', 'Nolan', 'Yanis', 'Rayan',
  'Ilyes', 'Amine', 'Malik', 'Samy', 'Mehdi', 'Sofiane', 'Bilal', 'Idriss', 'Moussa', 'Ibrahim',
  'Dylan', 'Evan', 'Florent', 'Damien', 'Benoît', 'Mathéo', 'Aurélien', 'Marceau', 'Côme', 'Basile',
];
const FIRST_SET = new Set(FIRST);

export const LAST = [
  'Vasseur', 'Delorme', 'Carrel', 'Delmas', 'Hamon', 'Maillard', 'Perrot', 'Tessier', 'Vallet', 'Lefort',
  'Charron', 'Brunel', 'Masson', 'Poulain', 'Royer', 'Cordier', 'Bellanger', 'Lagarde', 'Voisin', 'Bouvier',
  'Marais', 'Joubert', 'Combes', 'Ferrière', 'Toussaint', 'Leclerc', 'Marchal', 'Rousseau', 'Faure', 'Mercier',
  'Chevalier', 'Garnier', 'Bonnet', 'Fournier', 'Picard', 'Renaud', 'Brunet', 'Morel', 'Caron', 'Barbier',
  'Collin', 'Dumas', 'Lemaire', 'Gauthier', 'Aubry', 'Lacroix', 'Moulin', 'Dupré', 'Besson', 'Rivière',
  'Loiseau', 'Duval', 'Langlois', 'Noël', 'Granger', 'Delattre', 'Berger', 'Carpentier', 'Chauvin', 'Ferrand',
  'Haddad', 'Mansouri', 'Benali', 'Kaci', 'Kassé',
];
const LAST_SET = new Set(LAST);

// Parties existantes : un joueur dont le prénom ou le nom n'est plus dans les listes reçoit un équivalent
// francophone (stable, tiré de son identifiant) ; ce qui est déjà dans les listes est conservé.
export function renameRetired(p) {
  const [first, ...rest] = (p.name || '').split(' ');
  const last = rest.join(' ');
  const id = p.id || 1;
  const f = FIRST_SET.has(first) ? first : FIRST[(id * 31) % FIRST.length];
  const l = LAST_SET.has(last) ? last : LAST[(id * 7919) % LAST.length];
  p.name = `${f} ${l}`;
  return p;
}

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
