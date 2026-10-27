import { pick } from './utils';

// Noms des joueurs : francophones, courts, faciles à prononcer et à retenir, pour s'attacher à ses joueurs ; de
// toutes les origines qu'on entend dans le football français (régions de France, Belgique, Suisse, Québec, Maghreb,
// Afrique de l'Ouest et centrale, Antilles, familles portugaises et italiennes). Aucun nom ne doit évoquer un
// footballeur connu : les noms de famille trop associés à de vrais joueurs sont écartés (pas de Griezmann, de Giroud,
// de Dembélé, de Touré ni de Payet), et les rares combinaisons qui tomberaient sur une personne réelle (joueur, autre
// sportif, personnage célèbre) sont interdites (BLOCK).
// Prénoms et noms par origine : un joueur porte le plus souvent un prénom et un nom de la même origine (comme dans
// la vie, avec des mélanges), pour des noms qui sonnent juste.
const FIRST_FR = [
  'Léo', 'Hugo', 'Louis', 'Jules', 'Gabriel', 'Arthur', 'Raphaël', 'Paul', 'Victor', 'Adam',
  'Sacha', 'Nathan', 'Théo', 'Tom', 'Baptiste', 'Mathis', 'Lucas', 'Axel', 'Clément', 'Antoine',
  'Maxime', 'Quentin', 'Romain', 'Julien', 'Bastien', 'Valentin', 'Simon', 'Robin', 'Marius', 'Gaspard',
  'Félix', 'Oscar', 'Noé', 'Malo', 'Timothée', 'Elias', 'Nolan', 'Dylan', 'Evan', 'Florent',
  'Damien', 'Benoît', 'Mathéo', 'Aurélien', 'Marceau', 'Côme', 'Basile', 'Martin', 'Lenny', 'Thibault',
  'Loïc', 'Yohan', 'Kévin', 'Jérémy', 'Anthony', 'Alexis', 'Adrien', 'Thomas', 'Nicolas', 'Pierre',
  'Vincent', 'Benjamin', 'Mathieu', 'Guillaume', 'Cédric', 'Olivier', 'Arnaud', 'Rémi', 'Fabien', 'Jordan',
  'Loris', 'Ethan', 'Gabin', 'Milo', 'Nino', 'Lino', 'Jean', 'Marc', 'Luc', 'Éric',
  'Yves', 'Gaël', 'Erwan', 'Yann', 'Ronan', 'Killian', 'Samuel', 'Émile', 'William', 'Cyril',
  'Jérôme', 'Mathias', 'Nils', 'Jonas', 'Hector', 'Achille', 'Léon', 'Lucien', 'Augustin', 'Elio',
];
const FIRST_ITPT = ['Enzo', 'Mattéo', 'Lorenzo', 'Luca', 'Tiago', 'Nuno', 'Fabio', 'Bruno', 'Sandro', 'Rui'];
const FIRST_MAG = [
  'Yanis', 'Rayan', 'Ilyes', 'Amine', 'Malik', 'Samy', 'Mehdi', 'Sofiane', 'Bilal', 'Idriss',
  'Sami', 'Nabil', 'Yacine', 'Ismaël', 'Ryad', 'Walid', 'Anis', 'Hamza', 'Omar', 'Ayoub', 'Younès', 'Naël',
];
const FIRST_AFR = [
  'Moussa', 'Ibrahim', 'Mamadou', 'Lamine', 'Cheikh', 'Aliou', 'Seydou', 'Yao', 'Koffi', 'Issa',
  'Abdou', 'Bakary', 'Oumar', 'Kader',
];

const LAST_FR = [
  'Vasseur', 'Delorme', 'Carrel', 'Delmas', 'Hamon', 'Maillard', 'Perrot', 'Tessier', 'Vallet', 'Lefort',
  'Charron', 'Brunel', 'Masson', 'Poulain', 'Royer', 'Cordier', 'Bellanger', 'Lagarde', 'Voisin', 'Bouvier',
  'Marais', 'Joubert', 'Combes', 'Ferrière', 'Toussaint', 'Leclerc', 'Marchal', 'Rousseau', 'Faure', 'Mercier',
  'Chevalier', 'Garnier', 'Bonnet', 'Fournier', 'Picard', 'Renaud', 'Brunet', 'Morel', 'Caron', 'Barbier',
  'Collin', 'Dumas', 'Lemaire', 'Gauthier', 'Aubry', 'Lacroix', 'Moulin', 'Dupré', 'Besson', 'Rivière',
  'Loiseau', 'Duval', 'Langlois', 'Noël', 'Granger', 'Delattre', 'Berger', 'Carpentier', 'Chauvin', 'Ferrand',
  'Bernard', 'Durand', 'Leroy', 'Moreau', 'Laurent', 'Lefebvre', 'Girard', 'Dupont', 'Legrand', 'Guérin',
  'Roussel', 'Morin', 'Dumont', 'Fontaine', 'Boyer', 'Joly', 'Roche', 'Marchand', 'Dufour', 'Blanchard',
  'Brun', 'Leroux', 'Colin', 'Renard', 'Rolland', 'Aubert', 'Vidal', 'Lemoine', 'Gaillard', 'Fabre',
  'Dupuis', 'Hubert', 'Guillot', 'Lecomte', 'Ménard', 'Fleury', 'Jacquet', 'Collet', 'Prévost', 'Poirier',
  'Huet', 'Baron', 'Dupuy', 'Pons', 'Breton', 'Guyot', 'Marty', 'Cousin', 'Bouchet', 'Delage',
  'Vallée', 'Bertin', 'Chauvet', 'Maréchal', 'Pasquier', 'Rigaud', 'Sauvage', 'Tissot', 'Verdier', 'Lebrun',
  'Clerc', 'Gillet', 'Perret', 'Bailly', 'Lacoste', 'Raynaud', 'Carré', 'Monnier', 'Bouvet', 'Hardy',
  'Millet', 'Texier', 'Barre',
  // Bretagne, Alsace
  'Tanguy', 'Morvan', 'Le Gall', 'Le Floch', 'Le Bihan', 'Guillou', 'Schmitt', 'Meyer', 'Weber', 'Klein',
  'Roth', 'Kessler', 'Haas',
];
const LAST_ANT = ['Lubin', 'Grondin', 'Calixte', 'Bellance', 'Lauret', 'Técher']; // Antilles, Réunion
const LAST_ITPT = [
  'Bianchi', 'Moretti', 'Romano', 'Marino', 'Greco', 'Rinaldi', 'Colombo', 'Lombardi', 'Ferreira', 'Moreira',
  'Teixeira', 'Cardoso', 'Pinto', 'Fonseca', 'Rocha', 'Monteiro',
];
const LAST_MAG = [
  'Haddad', 'Mansouri', 'Benali', 'Kaci', 'Belkacem', 'Amrani', 'Saïdi', 'Hamdi', 'Bouzid', 'Chérif',
  'Meziane', 'Taleb', 'Rahmani', 'Ouali', 'Sabri', 'Naceri',
];
const LAST_AFR = [
  'Kassé', 'Ndour', 'Faye', 'Thiam', 'Seck', 'Kaba', 'Barry', 'Mbaye', 'Diakité', 'Dramé',
  'Tall', 'Gassama', 'Konan', 'Aka', 'Tano', 'Etoundi', 'Essomba', 'Mballa', 'Bilong',
];

// origine du nom : [part des joueurs, prénoms, part de prénoms tirés de la liste française, noms]
const ORIGINS = [
  [0.55, FIRST_FR, 0, LAST_FR],
  [0.06, FIRST_FR, 0, LAST_ANT],
  [0.1, FIRST_ITPT, 0.4, LAST_ITPT],
  [0.16, FIRST_MAG, 0.2, LAST_MAG],
  [0.13, FIRST_AFR, 0.3, LAST_AFR],
];

export const FIRST = [...FIRST_FR, ...FIRST_ITPT, ...FIRST_MAG, ...FIRST_AFR];
const FIRST_SET = new Set(FIRST);
export const LAST = [...LAST_FR, ...LAST_ANT, ...LAST_ITPT, ...LAST_MAG, ...LAST_AFR];
const LAST_SET = new Set(LAST);

// Un prénom et un nom qui vont ensemble.
function drawName() {
  let r = Math.random();
  const o = ORIGINS.find(([w]) => (r -= w) < 0) || ORIGINS[0];
  const first = Math.random() < o[2] ? pick(FIRST_FR) : pick(o[1]);
  return [first, pick(o[3])];
}

// Combinaisons interdites : de vrais joueurs (ou d'autres personnes connues) que le hasard pourrait recomposer.
export const BLOCK = new Set([
  'Lucas Chevalier', 'Jérémy Morel', 'Benjamin Lecomte', 'Fabien Lemoine', 'Thibault Moulin', 'Mamadou Thiam',
  'Lamine Gassama', 'Tiago Pinto', 'Nuno Pinto', 'Pierre Bernard', 'Thomas Fontaine', 'Vincent Guérin',
  'Pierre Laurent', 'Jérôme Leroy', 'Éric Bailly', 'Léon Bailly', 'Gabriel Faure', 'Jean Moulin', 'Émile Picard',
  'Luc Picard', 'Antoine Dupont', 'Léon Marchand', 'Louis Renaud', 'Paul Faure', 'Marc Lavoine', 'Jean Renard',
]);

// Noms déjà portés dans la partie (registerNames au chargement et à la création) : un nouveau joueur n'en reprend
// jamais un, et autant que possible pas même le nom de famille.
const inUse = new Set();
const lastInUse = new Set();
const lastOf = (full) => full.split(' ').slice(1).join(' ');

// Origine d'un nom, d'après la liste de son nom de famille (à défaut, de son prénom) : 'fr' (régions de France,
// Belgique, Suisse, Québec), 'ant' (Antilles, Réunion), 'itpt' (familles italiennes et portugaises), 'mag' (Maghreb),
// 'afr' (Afrique de l'Ouest et centrale). Les portraits s'en servent pour un visage qui va avec le nom (faces.js).
const ORIGIN_OF = new Map([
  ...LAST_FR.map((x) => [x, 'fr']), ...LAST_ANT.map((x) => [x, 'ant']), ...LAST_ITPT.map((x) => [x, 'itpt']),
  ...LAST_MAG.map((x) => [x, 'mag']), ...LAST_AFR.map((x) => [x, 'afr']),
]);
export function originOf(full = '') {
  const o = ORIGIN_OF.get(lastOf(full));
  if (o) return o;
  const first = full.split(' ')[0];
  return FIRST_MAG.includes(first) ? 'mag' : FIRST_AFR.includes(first) ? 'afr' : FIRST_ITPT.includes(first) ? 'itpt' : 'fr';
}
export function registerNames(names) {
  inUse.clear();
  lastInUse.clear();
  for (const n of names) {
    if (!n) continue;
    inUse.add(n);
    lastInUse.add(lastOf(n));
  }
}

// Nom d'un nouveau joueur. taken : noms à éviter en plus (ex. l'onze adverse d'un match, déjà nommé).
export function playerName(taken = null) {
  for (let i = 0; i < 80; i++) {
    const [f, l] = drawName();
    const full = `${f} ${l}`;
    if (BLOCK.has(full) || inUse.has(full) || taken?.has(full)) continue;
    if (i < 50 && lastInUse.has(l)) continue; // un nom de famille que personne ne porte encore, si possible
    inUse.add(full);
    lastInUse.add(l);
    return full;
  }
  return drawName().join(' ');
}

// Nom d'un joueur d'un onze adverse (0.7, opponents.js), tiré sous une graine : le même à chaque rencontre, sans passer
// par les noms de la partie. Jamais un nom interdit ni celui d'un de nos joueurs (taken) ; dans l'onze, chaque nom de
// famille une seule fois, si possible (lasts).
export function squadName(taken, lasts) {
  for (let i = 0; i < 80; i++) {
    const [f, l] = drawName();
    const full = `${f} ${l}`;
    if (BLOCK.has(full) || taken.has(full) || (i < 50 && lasts.has(l))) continue;
    lasts.add(l);
    return full;
  }
  return drawName().join(' ');
}

// Parties existantes : un joueur dont le prénom ou le nom n'est plus dans les listes, ou dont la combinaison est
// interdite, reçoit un équivalent francophone (stable, tiré de son identifiant) ; le reste est conservé.
export function renameRetired(p) {
  const [first, ...rest] = (p.name || '').split(' ');
  const last = rest.join(' ');
  const id = p.id || 1;
  const f = FIRST_SET.has(first) ? first : FIRST[(id * 31) % FIRST.length];
  let l = LAST_SET.has(last) ? last : LAST[(id * 7919) % LAST.length];
  for (let k = 1; BLOCK.has(`${f} ${l}`); k++) l = LAST[(id * 7919 + k * 13) % LAST.length];
  p.name = `${f} ${l}`;
  return p;
}

// Noms des clubs : un type (AS, FC, Stade, Entente…) et un lieu imaginaire, francophone.
const CLUB_TYPES = [
  'AS', 'FC', 'US', 'SC', 'RC', 'Olympique', 'Sporting', 'Racing', 'Stade', 'Étoile', 'Union', 'Entente', 'Avenir',
  'Jeunesse', 'Rapid', 'Atlas', 'Bleus', 'Jaunes', 'Verts',
];

const CLUB_PLACES = [
  'du Tilleul', 'de la Plaine', 'Montfleury', 'des Bruyères', 'de la Vallée', 'Saint-Clair',
  'des Trois Rivières', 'de l’Orme', 'Beaumont', 'du Vieux Port', 'des Coteaux', 'de la Prairie',
  'Rocheval', 'des Fontaines', 'Hauts-Bois', 'de la Gare', 'Bellerive', 'Clairval', 'Valmont', 'Roche-Blanche',
  'Mont-Aigu', 'des Saules', 'de la Colline', 'du Moulin', 'des Remparts', 'Bois-Joli', 'du Lac', 'de la Forge',
  'des Marais', 'du Phare', 'Champfleuri', 'Pierrefonde', 'Belcourt', 'Vaudrémont', 'Sainte-Aline', 'Port-Joli',
  'des Peupliers', 'de la Côte', 'du Plateau', 'des Glycines', 'Combe-Noire', 'Fontclaire', 'Vallon-Doré',
  'du Bocage',
];

// Article d'un club selon son préfixe : l'AS, le FC, la Jeunesse, les Bleus… (un nom sans préfixe connu reste nu,
// comme celui que le joueur a choisi). clubAfter contracte avec la préposition : « de le FC » → « du FC ».
const ARTICLE = {
  AS: 'l’', US: 'l’', Olympique: 'l’', Étoile: 'l’', Atlas: 'l’', Avenir: 'l’', Union: 'l’', Entente: 'l’',
  FC: 'le ', SC: 'le ', RC: 'le ', Sporting: 'le ', Racing: 'le ', Rapid: 'le ', Stade: 'le ',
  Jeunesse: 'la ',
  Jaunes: 'les ', Bleus: 'les ', Verts: 'les ',
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

const placeOf = (name) => CLUB_PLACES.find((pl) => name.endsWith(` ${pl}`)) || null;

export function randomClubName() {
  return `${pick(CLUB_TYPES)} ${pick(CLUB_PLACES)}`;
}

// Un club qui ne ressemble à aucun des noms donnés : ni le même nom, ni le même lieu (« Rapid de l’Orme » et
// « Sporting de l’Orme » dans la même saison prêtaient à confusion).
export function distinctClubName(avoid = []) {
  const places = new Set(avoid.map(placeOf).filter(Boolean));
  for (let i = 0; i < 200; i++) {
    const name = randomClubName();
    if (!avoid.includes(name) && !places.has(placeOf(name)) && !avoid.some((a) => a.includes(placeOf(name)))) return name;
  }
  return randomClubName();
}

// Les clubs d'une division : tous différents, jamais deux du même lieu, pas plus de deux du même type (FC,
// Racing…), et rien qui rappelle notre propre club (ni son nom ni son lieu).
export function leagueClubNames(count, ownName = '') {
  const out = [];
  const types = {};
  for (let i = 0; out.length < count && i < 600; i++) {
    const name = distinctClubName([ownName, ...out]);
    const t = name.split(' ')[0];
    if ((types[t] || 0) >= 2) continue;
    types[t] = (types[t] || 0) + 1;
    out.push(name);
  }
  while (out.length < count) out.push(distinctClubName([ownName, ...out]));
  return out;
}

// Parties existantes : un club adverse en double (même nom, ou même lieu) dans la division est renommé.
export function fixLeagueNames(s) {
  const seen = [s.clubName];
  for (const r of s.rivals || []) {
    const pl = placeOf(r.name);
    const clash = seen.includes(r.name) || (pl && seen.some((n) => n !== s.clubName && placeOf(n) === pl));
    if (clash) r.name = distinctClubName(seen);
    seen.push(r.name);
  }
  return s;
}
