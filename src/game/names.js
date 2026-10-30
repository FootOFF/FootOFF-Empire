import { pick } from './utils';
import { NAMES } from '../i18n/index';

// Langue de la partie (src/i18n, 2026-10-29) : en anglais, en espagnol, en arabe, les noms des joueurs et des clubs sont
// tirés de listes propres à la langue (names-en.js, names-es.js, names-ar.js : autant de noms, autant d'origines que
// ci-dessous) ; en français, rien ne change.
const L = NAMES; // chargées par initI18n avant le jeu

// Noms des joueurs : francophones, courts, faciles à prononcer et à retenir, pour s'attacher à ses joueurs ; de
// toutes les origines qu'on entend dans le football français (régions de France, Belgique, Suisse, Québec, Maghreb,
// Afrique de l'Ouest et centrale, Antilles, familles portugaises et italiennes). Aucun nom ne doit évoquer un
// footballeur connu : les noms de famille trop associés à de vrais joueurs sont écartés (pas de Griezmann, de Giroud,
// de Dembélé, de Touré ni de Payet), et les rares combinaisons qui tomberaient sur une personne réelle (joueur, autre
// sportif, personnage célèbre) sont interdites (BLOCK), vérifiées par le fact-checker le 2026-10-27.
// Environ 450 prénoms et 700 noms (0.7.3, trois fois plus qu'avant) : dans une saison, un même prénom ou un même nom
// ne revient presque plus trois fois. Ne jamais retirer un nom des listes sans raison grave : au chargement, un
// joueur dont le nom a disparu est renommé (renameRetired).
// Prénoms et noms par origine : un joueur porte le plus souvent un prénom et un nom de la même origine (comme dans
// la vie, avec des mélanges), pour des noms qui sonnent juste.
const FIRST_FR = [
  'Léo', 'Hugo', 'Louis', 'Jules', 'Gabriel', 'Arthur', 'Raphaël', 'Paul', 'Victor', 'Adam', 'Sacha', 'Nathan',
  'Théo', 'Tom', 'Baptiste', 'Mathis', 'Lucas', 'Axel', 'Clément', 'Antoine', 'Maxime', 'Quentin', 'Romain', 'Julien',
  'Bastien', 'Valentin', 'Simon', 'Robin', 'Marius', 'Gaspard', 'Félix', 'Oscar', 'Noé', 'Malo', 'Timothée', 'Elias',
  'Nolan', 'Dylan', 'Evan', 'Florent', 'Damien', 'Benoît', 'Mathéo', 'Aurélien', 'Marceau', 'Côme', 'Basile',
  'Martin', 'Lenny', 'Thibault', 'Loïc', 'Yohan', 'Kévin', 'Jérémy', 'Anthony', 'Alexis', 'Adrien', 'Thomas',
  'Nicolas', 'Pierre', 'Vincent', 'Benjamin', 'Mathieu', 'Guillaume', 'Cédric', 'Olivier', 'Arnaud', 'Rémi', 'Fabien',
  'Jordan', 'Loris', 'Ethan', 'Gabin', 'Milo', 'Nino', 'Lino', 'Jean', 'Marc', 'Luc', 'Éric', 'Yves', 'Gaël', 'Erwan',
  'Yann', 'Ronan', 'Killian', 'Samuel', 'Émile', 'William', 'Cyril', 'Jérôme', 'Mathias', 'Nils', 'Jonas', 'Hector',
  'Achille', 'Léon', 'Lucien', 'Augustin', 'Elio', 'Alban', 'Albin', 'Alexandre', 'Amaury', 'Ambroise', 'Anatole',
  'André', 'Aristide', 'Armand', 'Auguste', 'Aymeric', 'Barnabé', 'Bertrand', 'Brice', 'Bryan', 'Camille', 'Célestin',
  'César', 'Charles', 'Charlie', 'Christophe', 'Clovis', 'Constant', 'Corentin', 'Cyprien', 'Daniel', 'David',
  'Denis', 'Dorian', 'Edgar', 'Edmond', 'Édouard', 'Eliott', 'Elouan', 'Émeric', 'Émilien', 'Ernest', 'Esteban',
  'Étienne', 'Eugène', 'Fabrice', 'Faustin', 'Ferdinand', 'Fernand', 'Firmin', 'Florian', 'Francis', 'François',
  'Frédéric', 'Gaëtan', 'Geoffrey', 'Georges', 'Gérald', 'Germain', 'Gilles', 'Grégoire', 'Grégory', 'Gustave',
  'Hadrien', 'Henri', 'Hervé', 'Hippolyte', 'Honoré', 'Ilan', 'Isaac', 'Jacques', 'Jason', 'Jérémie', 'Joachim',
  'Joël', 'Johan', 'Jonathan', 'Joris', 'Joseph', 'Josselin', 'Justin', 'Kenzo', 'Laurent', 'Lazare', 'Léandre',
  'Léonard', 'Lohan', 'Loan', 'Louka', 'Ludovic', 'Maël', 'Malone', 'Marcel', 'Marin', 'Marvin', 'Mathurin',
  'Maurice', 'Max', 'Maxence', 'Maximilien', 'Michel', 'Mickaël', 'Morgan', 'Nathanaël', 'Noah', 'Noam', 'Norbert',
  'Octave', 'Odilon', 'Owen', 'Pacôme', 'Pascal', 'Patrick', 'Philémon', 'Philibert', 'Philippe', 'Prosper', 'Raoul',
  'Régis', 'René', 'Rodolphe', 'Roger', 'Roland', 'Romuald', 'Ruben', 'Rudy', 'Sébastien', 'Séraphin', 'Serge',
  'Soan', 'Stanislas', 'Stéphane', 'Swann', 'Sylvain', 'Teddy', 'Théophile', 'Timéo', 'Titouan', 'Tony', 'Tristan',
  'Ulysse', 'Valère', 'Vianney', 'Victorien', 'Virgile', 'Warren', 'Wilfried', 'Xavier', 'Yannick', 'Yoann', 'Yvan',
  'Zacharie', 'Gédéon', 'Ghislain', 'Isidore', 'Jocelyn', 'Baudouin', 'Amédée', 'Anselme', 'Aurèle',
];
const FIRST_ITPT = [
  'Enzo', 'Mattéo', 'Lorenzo', 'Luca', 'Tiago', 'Nuno', 'Fabio', 'Bruno', 'Sandro', 'Rui', 'Alessandro', 'Andrea',
  'Angelo', 'Antonio', 'Carlo', 'Dario', 'Davide', 'Emilio', 'Federico', 'Filippo', 'Franco', 'Gianni', 'Giorgio',
  'Giulio', 'Leonardo', 'Marco', 'Massimo', 'Michele', 'Nicola', 'Paolo', 'Pietro', 'Renato', 'Riccardo', 'Roberto',
  'Salvatore', 'Simone', 'Stefano', 'Tommaso', 'Valerio', 'Vittorio', 'Afonso', 'Diogo', 'Gonçalo', 'Henrique',
  'Jorge', 'José', 'Martim', 'Miguel', 'Pedro', 'Ricardo', 'Rodrigo', 'Tomás', 'Vasco', 'Joaquim', 'Fernando',
  'Paulo',
];
const FIRST_MAG = [
  'Yanis', 'Rayan', 'Ilyes', 'Amine', 'Malik', 'Samy', 'Mehdi', 'Sofiane', 'Bilal', 'Idriss', 'Sami', 'Nabil',
  'Ismaël', 'Ryad', 'Walid', 'Anis', 'Hamza', 'Omar', 'Ayoub', 'Younès', 'Naël', 'Abdel', 'Adel', 'Adil',
  'Ali', 'Amir', 'Anouar', 'Ayman', 'Aziz', 'Badr', 'Brahim', 'Djamel', 'Farès', 'Farid', 'Fayçal', 'Fouad', 'Hakim',
  'Hicham', 'Houssem', 'Ilyas', 'Imad', 'Issam', 'Jamel', 'Kamel', 'Karim', 'Khalil', 'Lyes', 'Madjid', 'Mounir',
  'Mourad', 'Nassim', 'Nordine', 'Othmane', 'Rachid', 'Redouane', 'Réda', 'Saïd', 'Salim', 'Selim', 'Slimane',
  'Soufiane', 'Tarik', 'Wassim', 'Youssef', 'Zakaria', 'Nadir', 'Akram', 'Chakib', 'Hamid', 'Hassan',
  'Mustapha', 'Rami', 'Haroun', 'Ishak', 'Ilian', 'Kaïs', 'Marwan', 'Taha', 'Wahid', 'Yahia',
];
const FIRST_AFR = [
  'Moussa', 'Ibrahim', 'Mamadou', 'Lamine', 'Cheikh', 'Aliou', 'Seydou', 'Yao', 'Koffi', 'Issa', 'Abdou', 'Bakary',
  'Oumar', 'Kader', 'Abdoulaye', 'Adama', 'Alassane', 'Amadou', 'Aboubacar', 'Babacar', 'Boubacar', 'Daouda', 'Demba',
  'Djibril', 'Fodé', 'Habib', 'Ismaïla', 'Karamoko', 'Kwame', 'Lassana', 'Mamadi', 'Massamba', 'Modibo', 'Moustapha',
  'Ousseynou', 'Pape', 'Salif', 'Samba', 'Sékou', 'Souleymane', 'Tidiane', 'Yaya', 'Youssouf', 'Ablaye', 'Assane',
  'Birame', 'Fallou', 'Ibou', 'Malick', 'Ousmane', 'Saliou', 'Serigne', 'Thierno', 'Waly', 'Yacouba', 'Zoumana',
  'Emmanuel', 'Junior', 'Prince', 'Landry', 'Rodrigue', 'Armel', 'Herman',
];

const LAST_FR = [
  'Vasseur', 'Delorme', 'Carrel', 'Delmas', 'Hamon', 'Maillard', 'Perrot', 'Tessier', 'Vallet', 'Lefort', 'Charron',
  'Brunel', 'Masson', 'Poulain', 'Royer', 'Cordier', 'Bellanger', 'Lagarde', 'Voisin', 'Bouvier', 'Marais', 'Joubert',
  'Combes', 'Ferrière', 'Toussaint', 'Leclerc', 'Marchal', 'Rousseau', 'Faure', 'Mercier', 'Chevalier', 'Garnier',
  'Bonnet', 'Fournier', 'Picard', 'Renaud', 'Brunet', 'Morel', 'Caron', 'Barbier', 'Collin', 'Dumas', 'Lemaire',
  'Gauthier', 'Aubry', 'Lacroix', 'Moulin', 'Dupré', 'Besson', 'Rivière', 'Loiseau', 'Duval', 'Langlois', 'Noël',
  'Granger', 'Delattre', 'Berger', 'Carpentier', 'Chauvin', 'Ferrand', 'Bernard', 'Durand', 'Leroy', 'Moreau',
  'Laurent', 'Lefebvre', 'Girard', 'Dupont', 'Legrand', 'Guérin', 'Roussel', 'Morin', 'Dumont', 'Fontaine', 'Boyer',
  'Joly', 'Roche', 'Marchand', 'Dufour', 'Blanchard', 'Brun', 'Leroux', 'Colin', 'Renard', 'Rolland', 'Aubert',
  'Vidal', 'Lemoine', 'Gaillard', 'Fabre', 'Dupuis', 'Hubert', 'Guillot', 'Lecomte', 'Ménard', 'Fleury', 'Collet',
  'Prévost', 'Poirier', 'Huet', 'Baron', 'Dupuy', 'Pons', 'Breton', 'Guyot', 'Marty', 'Cousin', 'Bouchet', 'Delage',
  'Vallée', 'Bertin', 'Chauvet', 'Maréchal', 'Pasquier', 'Rigaud', 'Sauvage', 'Tissot', 'Verdier', 'Lebrun', 'Clerc',
  'Gillet', 'Perret', 'Bailly', 'Lacoste', 'Raynaud', 'Carré', 'Monnier', 'Bouvet', 'Hardy', 'Millet', 'Texier',
  'Barre', 'Tanguy', 'Morvan', 'Le Gall', 'Le Floch', 'Le Bihan', 'Guillou', 'Schmitt', 'Meyer', 'Weber', 'Klein',
  'Roth', 'Kessler', 'Haas', 'Allard', 'Andrieu', 'Arnoux', 'Aubin', 'Bazin', 'Bénard', 'Benoist', 'Berthier',
  'Besnard', 'Billard', 'Blondel', 'Boisseau', 'Bonnard', 'Bordier', 'Bossard', 'Bouchard', 'Boucher', 'Bourdon',
  'Bourgeois', 'Boutin', 'Brault', 'Briand', 'Brossard', 'Buisson', 'Cabanel', 'Castel', 'Chabert', 'Chapuis',
  'Charpentier', 'Chartier', 'Chatelain', 'Clavel', 'Cochet', 'Collignon', 'Corbin', 'Coste', 'Courtin', 'Couturier',
  'Cuvelier', 'Delaunay', 'Delcroix', 'Delhaye', 'Desmarais', 'Devaux', 'Drouet', 'Dubois', 'Dubreuil', 'Duclos',
  'Ducret', 'Dufresne', 'Dumoulin', 'Duprat', 'Duret', 'Esnault', 'Évrard', 'Fauvel', 'Ferrier', 'Forestier',
  'Fouquet', 'Fournel', 'Gallet', 'Garcin', 'Gautier', 'Genet', 'Giraud', 'Gosselin', 'Goulet', 'Grandin', 'Guichard',
  'Hébert', 'Humbert', 'Jamet', 'Josse', 'Jourdan', 'Jullien', 'Labbé', 'Lafon', 'Lambert', 'Lamy', 'Langlais',
  'Larcher', 'Laval', 'Lebon', 'Leclercq', 'Ledoux', 'Lefèvre', 'Lemaître', 'Lenoir', 'Lepage', 'Lévêque', 'Loison',
  'Macé', 'Mahé', 'Maillet', 'Mallet', 'Martel', 'Maurin', 'Michaud', 'Mignot', 'Moine', 'Morand', 'Naudin',
  'Normand', 'Pagès', 'Parent', 'Payen', 'Pelletier', 'Petitjean', 'Peyrot', 'Pichon', 'Pineau', 'Prieur', 'Régnier',
  'Rey', 'Ribot', 'Rocher', 'Rossignol', 'Rouault', 'Roux', 'Roy', 'Sabatier', 'Salmon', 'Samson', 'Savary',
  'Schneider', 'Sénéchal', 'Simonet', 'Tardy', 'Teyssier', 'Thiébaut', 'Tixier', 'Tournier', 'Turpin', 'Vaillant',
  'Valette', 'Vauthier', 'Verdon', 'Verger', 'Vernet', 'Viard', 'Viguier', 'Villard', 'Vivier', 'Wagner', 'Weiss',
  'Dubuisson', 'Lambotte', 'Hennebert', 'Delvaux', 'Hublet', 'Wauters', 'Michiels', 'Lejeune', 'Leblanc', 'Delforge',
  'Gilson', 'Remacle', 'Rochat', 'Jaquier', 'Pittet', 'Dubey', 'Crausaz', 'Perrenoud', 'Jeanneret', 'Rapin', 'Cuche',
  'Schaller', 'Roulin', 'Tremblay', 'Gagnon', 'Côté', 'Lavoie', 'Bergeron', 'Gagné', 'Ouellet', 'Paquette',
  'Lapointe', 'Beaulieu', 'Desjardins', 'Lachance', 'Bélanger', 'Poulin', 'Boivin', 'Fortin', 'Cloutier', 'Thibodeau',
  'Lévesque', 'Simard', 'Gendron', 'Labelle', 'Vachon', 'Turcotte', 'Guay', 'Bilodeau', 'Le Goff', 'Le Roux',
  'Le Corre', 'Kerjean', 'Le Meur', 'Quéré', 'Coadou', 'Le Bars', 'Jaouen', 'Hoffmann', 'Keller', 'Bauer', 'Fischer',
  'Wolff', 'Becker', 'Ritter', 'Stoll', 'Zimmer', 'Kieffer', 'Lang', 'Castan', 'Arnal', 'Bousquet', 'Cazals', 'Galy',
  'Puech', 'Rouquette', 'Soulié', 'Teulière', 'Delcourt', 'Dewailly', 'Lecocq', 'Delplanque', 'Desmet', 'Verhaeghe',
  'Hennion', 'Taffin', 'Wattel',
];
// Antilles, Réunion
const LAST_ANT = [
  'Lubin', 'Grondin', 'Calixte', 'Bellance', 'Lauret', 'Técher', 'Bélaise', 'Céleste', 'Cyrille', 'Dorival', 'Éloi',
  'Félicité', 'Labéda', 'Lancelot', 'Lafleur', 'Lamothe', 'Laurencin', 'Marie-Sainte', 'Montout', 'Pétricien',
  'Pierre-Louis', 'Saint-Éloi', 'Sainte-Rose', 'Sylvestre', 'Théodose', 'Valérius', 'Victorin', 'Clairville',
  'Hilaire', 'Ramassamy', 'Sinapin', 'Nativel', 'Damour', 'Ethève', 'Gonthier', 'Mussard', 'Ramin', 'Sautron',
  'Clain', 'Dijoux', 'Mardaye', 'Cadet',
];
const LAST_ITPT = [
  'Bianchi', 'Moretti', 'Romano', 'Marino', 'Greco', 'Rinaldi', 'Colombo', 'Lombardi', 'Ferreira', 'Moreira',
  'Teixeira', 'Cardoso', 'Pinto', 'Fonseca', 'Rocha', 'Monteiro', 'Benedetti', 'Bellini', 'Caruso', 'Fabbri', 'Galli',
  'Gallo', 'Giordano', 'Grasso', 'Leone', 'Longo', 'Martini', 'Mazza', 'Messina', 'Monti', 'Morelli', 'Neri',
  'Orlando', 'Palumbo', 'Parisi', 'Rizzo', 'Ruggiero', 'Russo', 'Santoro', 'Serra', 'Testa', 'Valentini', 'Vitale',
  'Barbieri', 'Bassi', 'Cattaneo', 'De Luca', 'Fiore', 'Fontana', 'Mariani', 'Pace', 'Pagano', 'Piras', 'Sartori',
  'Ferri', 'Farina', 'Colonna', 'Amato', 'Ricci', 'Sorrentino', 'Vecchio', 'Cirillo', 'Montanari', 'Orsini',
  'Bernardi', 'Carli', 'Guidi', 'Tosi', 'Zanella', 'Bertolini', 'Pozzi', 'Matos', 'Antunes', 'Azevedo', 'Barros',
  'Brito', 'Campos', 'Coelho', 'Faria', 'Freitas', 'Lobo', 'Machado', 'Magalhães', 'Marques', 'Medeiros', 'Melo',
  'Miranda', 'Morais', 'Paiva', 'Peixoto', 'Rebelo', 'Reis', 'Salgado', 'Simões', 'Soares', 'Valente', 'Vaz',
  'Amaral', 'Baptista', 'Bastos', 'Borges', 'Cabral', 'Carneiro', 'Duarte', 'Esteves', 'Leite', 'Macedo', 'Mota',
  'Pacheco', 'Sequeira', 'Trindade', 'Varela', 'Nunes', 'Correia',
];
const LAST_MAG = [
  'Haddad', 'Mansouri', 'Benali', 'Kaci', 'Belkacem', 'Amrani', 'Saïdi', 'Hamdi', 'Bouzid', 'Chérif', 'Meziane',
  'Taleb', 'Rahmani', 'Ouali', 'Sabri', 'Amari', 'Aouadi', 'Ayadi', 'Azzouz', 'Belaïd', 'Benamar', 'Benaïssa',
  'Bendaoud', 'Benmoussa', 'Bensalem', 'Benyahia', 'Bouaziz', 'Boukhari', 'Bouras', 'Chaouch', 'Chaoui', 'Dahmani',
  'Djebbar', 'Djellal', 'Ferhat', 'Gharbi', 'Guerraoui', 'Hadjadj', 'Hamidi', 'Hammadi', 'Hassani', 'Kaddour',
  'Kadri', 'Larbi', 'Lounès', 'Madani', 'Mebarki', 'Messaoudi', 'Mokrani', 'Rachidi', 'Saadi', 'Salhi', 'Sebbar',
  'Touati', 'Yahiaoui', 'Zitouni', 'Belarbi', 'Bensaïd', 'Benchikh', 'Hafsi', 'Kherbache', 'Merabet', 'Rezgui',
  'Sahraoui', 'Smaïl', 'Allouche', 'Chalabi', 'Hachemi', 'Kebir', 'Maarouf', 'Abdelli', 'Aïssaoui', 'Daoudi',
  'Fellah', 'Bouchama', 'Laribi', 'Tebbal', 'Nemri', 'Kerroum', 'Mekki', 'Bekkouche',
];
const LAST_AFR = [
  'Kassé', 'Ndour', 'Faye', 'Thiam', 'Seck', 'Kaba', 'Barry', 'Mbaye', 'Diakité', 'Dramé', 'Tall', 'Gassama', 'Konan',
  'Aka', 'Tano', 'Etoundi', 'Essomba', 'Mballa', 'Bilong', 'Adjovi', 'Agbo', 'Amoussou', 'Anoh', 'Assi', 'Atangana',
  'Badji', 'Bah', 'Bitang', 'Coffi', 'Dagnogo', 'Djiba', 'Dossou', 'Edou', 'Ekané', 'Elong', 'Essama', 'Eyenga',
  'Fall', 'Gnassou', 'Goudiaby', 'Guiro', 'Kambou', 'Kassi', 'Kouadio', 'Kouakou', 'Kpadé', 'Lawson', 'Mbengue',
  'Mvondo', 'Ndao', 'Ndong', 'Ngom', 'Ngoran', 'Obame', 'Okomo', 'Owona', 'Sambou', 'Soumah', 'Tine', 'Yapi', 'Zongo',
  'Zinsou', 'Hounsou', 'Akpa', 'Abalo', 'Amegan', 'Djossou', 'Ahanda', 'Abena', 'Ebanda', 'Ewane', 'Mbida', 'Ngono',
  'Nkeng', 'Simo', 'Tagne', 'Tamo', 'Wandji', 'Yondo', 'Ebongue', 'Ekwalla', 'Kingue', 'Mouelle', 'Njoh', 'Penda',
  'Sone',
];

// Listes de la langue de la partie, rangées par origine (celle des portraits, faces.js : fr, ant, itpt, mag, afr).
const P = L || {
  first: { fr: FIRST_FR, itpt: FIRST_ITPT, mag: FIRST_MAG, afr: FIRST_AFR },
  last: { fr: LAST_FR, ant: LAST_ANT, itpt: LAST_ITPT, mag: LAST_MAG, afr: LAST_AFR },
  // origine du nom : [part des joueurs, prénoms, part de prénoms tirés de la liste principale, noms]
  origins: [[0.55, 'fr', 0, 'fr'], [0.06, 'fr', 0, 'ant'], [0.1, 'itpt', 0.4, 'itpt'], [0.16, 'mag', 0.2, 'mag'], [0.13, 'afr', 0.3, 'afr']],
};
const MAIN_FIRST = P.first.fr; // prénoms de la liste principale (les plus portés dans la langue)
const ORIGINS = P.origins.map(([w, f, mix, l]) => [w, P.first[f], mix, P.last[l]]);

export const FIRST = Object.values(P.first).flat();
const FIRST_SET = new Set(FIRST);
export const LAST = Object.values(P.last).flat();
const LAST_SET = new Set(LAST);

// Un prénom et un nom qui vont ensemble.
function drawName() {
  let r = Math.random();
  const o = ORIGINS.find(([w]) => (r -= w) < 0) || ORIGINS[0];
  const first = Math.random() < o[2] ? pick(MAIN_FIRST) : pick(o[1]);
  return [first, pick(o[3])];
}

// Prénom et nom qui se répètent (Laurent Laurent, Benoît Benoist, Martin Martini, Louis Pierre-Louis) : un nom qui
// prête à sourire, jamais tiré pour un nouveau joueur.
const plain = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function echoes(first, last) {
  const f = plain(first);
  const l = plain(last);
  return l.split('-').includes(f) || l.startsWith(f.slice(0, 4)) || f.startsWith(l.slice(0, 4));
}

// Combinaisons interdites : de vrais joueurs (ou d'autres personnes connues) que le hasard pourrait recomposer ; dans
// une autre langue, celles de cette langue (vrais joueurs et célébrités de ses pays).
const BLOCK_FR = new Set([
  'Lucas Chevalier', 'Jérémy Morel', 'Benjamin Lecomte', 'Fabien Lemoine', 'Thibault Moulin', 'Mamadou Thiam',
  'Lamine Gassama', 'Tiago Pinto', 'Nuno Pinto', 'Pierre Bernard', 'Thomas Fontaine', 'Vincent Guérin',
  'Pierre Laurent', 'Jérôme Leroy', 'Éric Bailly', 'Léon Bailly', 'Gabriel Faure', 'Jean Moulin', 'Émile Picard',
  'Luc Picard', 'Antoine Dupont', 'Léon Marchand', 'Louis Renaud', 'Paul Faure', 'Marc Lavoine', 'Jean Renard',
  'Charles Leclerc', 'Christophe Lemaître', 'Georges Lemaître', 'Evan Fournier', 'Vincent Poirier', 'Clément Noël',
  'Kévin Rolland', 'Vincent Clerc', 'Julien Marchand', 'Julien Clerc', 'Patrick Roy', 'Éric Roy', 'René Lévesque',
  'Charles Martel', 'Benoît Hamon', 'Olivier Faure', 'Fabien Roussel', 'Fernand Raynaud', 'Jean Marais',
  'Michel Legrand', 'Laurent Fournier', 'Jacques Rousseau', 'Hervé Renard', 'Stéphane Moulin', 'René Girard',
  'Stéphane Dumont', 'Léo Dubois', 'Benjamin Leroy', 'Lucas Perrin', 'Loïc Perrin', 'Jordan Ferri',
  'Alexandre Bonnet', 'Quentin Bernard', 'Maxime Marchand', 'Vincent Le Goff', 'Sylvain Marchal', 'Baptiste Valette',
  'Nolan Roux', 'Idriss Saadi', 'Marc Gagnon', 'Michel Tremblay', 'Lucien Bouchard', 'Simon Gagné', 'Michel Bergeron',
  'Sylvain Côté', 'Paul Desmarais', 'Marc Fleury', 'Félix Leclerc', 'Edgar Morin', 'Xavier Dupont', 'Michel Fournier',
  'Christophe Lambert', 'Maurice Leblanc', 'Théophile Gautier', 'Jean Genet', 'Hervé Bazin', 'Pascal Lamy',
  'Henri Cochet', 'Aristide Briand', 'Louis Jourdan', 'Michel Vaillant', 'René Arnoux', 'Nicolas Fouquet',
  'Pierre Laval', 'Jean Giraud', 'Éric Guay', 'René Simard', 'David Pelletier', 'Ludovic Sylvestre', 'Filippo Galli',
  'Paolo Sorrentino', 'Bruno Giordano', 'Bruno Martini', 'Jorge Campos', 'Paulo Coelho', 'Michel Salgado',
  'Jorge Borges', 'Pedro Cabral', 'Pedro Rocha', 'Tomás Esteves', 'Paulo Ferreira', 'Anthony Lopes', 'Ismaël Gharbi',
  'Valentin Atangana', 'Stéphane Badji', 'Jonathan Zongo', 'Demba Seck', 'Abdoulaye Seck', 'Adama Mbengue',
  'Mamadou Fall', 'Gaëtan Perrin', 'Anthony Rouault', 'Jérémy Jacquet', 'Louis Leroux', 'Clément Akpa',
  'Jordan Lefort', 'Jonathan Fischer', 'Félix Correia', 'Afonso Moreira', 'Ibrahim Mbaye', 'Oumar Diakité',
  'Thierno Barry', 'Michel Bastos', 'Rui Barros', 'Nuno Valente', 'Boubacar Barry', 'Guillaume Gillet',
  'Daniel Cousin', 'Stefano Fiore', 'Riccardo Ferri', 'Paulo Fonseca', 'Paul Joly', 'Ghislain Konan',
  'Abdoulaye Faye', 'Modibo Diakité', 'Samba Diakité', 'Olivier Verdon', 'Jocelyn Blanchard', 'Diogo Leite',
  'Rui Faria', 'Grégoire Mbida', 'Francis Benali', 'Fabrice Santoro', 'Jules Bianchi', 'Frédéric Vasseur',
  'Éric Perrot', 'Luc Abalo', 'Djamel Bouras', 'Angelo Parisi', 'René Lacoste', 'Georges Carpentier',
  'Romain Lagarde', 'Pierre Rolland', 'Christophe Moreau', 'Jérôme Pineau', 'Florian Sénéchal', 'Roger Rivière',
  'Jacques Brunel', 'Arthur Leclerc', 'Lucien Bianchi', 'Tiago Monteiro', 'Jorge Fonseca', 'Alexandre Bilodeau',
  'Éric Gagné', 'Jacques Lemaire', 'Michel Goulet', 'Gaëtan Boucher', 'Alexandre Dumas', 'Romain Rolland',
  'Jules Renard', 'André Breton', 'Roland Dumas', 'Félix Faure', 'Edgar Faure', 'Émile Combes', 'Philippe Leclerc',
  'Henri Rousseau', 'Gustave Moreau', 'Pierre Bonnard', 'François Boucher', 'Yves Klein', 'Charles Garnier',
  'Michel Berger', 'Maurice Chevalier', 'Pierre Perret', 'Laurent Garnier', 'Marin Marais', 'Éric Serra',
  'Daniel Lavoie', 'Luc Besson', 'Jean Lefebvre', 'Olivier Marchal', 'Samy Naceri', 'Sami Naceri', 'Yves Rocher',
  'Alexis Carrel', 'Giorgio Parisi', 'Chakib Benmoussa', 'Norbert Zongo', 'Rui Pinto', 'Djamel Zitouni',
  'Olivier Giraud', 'Charles Perrot', 'Jules Ferri', 'Demba Bah', 'Tidiane Thiam', 'Imad Abdelli',
  'Alban Lafon', 'Mickaël Sylvestre', 'Tiago Mota', 'Amir Rahmani', 'Pascal Duprat', 'Morgan Samson', 'Anthony Kaci',
  'Christophe Jullien', 'Ousseynou Bah', 'Vittorio Pozzi', 'Kévin Meyer', 'Hugo Humbert', 'Henri Lecomte',
  'Marc Marques', 'Anthony Hubert', 'Frédéric Bousquet', 'Jason Lamy', 'Luc Ferri', 'Christophe Mahé', 'Paul Raynaud',
  'Alexandre Benali', 'Francis Weber', 'Hervé Villard', 'Patrick Fiore', 'Henri Michaud', 'Henri Konan',
  'Brahim Aïssaoui', 'Maxime Dupré', 'Diogo Moreira', 'Victor Cousin', 'Paul Morand', 'Michel Tournier',
  'Tristan Bernard', 'Henri Lefebvre', 'Jacques Le Goff', 'Antonio Machado', 'Nicolas Bouvier', 'Tony Garnier',
  'Auguste Perret', 'Yves Tanguy', 'Georges Rouault', 'Paul Delvaux', 'André Masson', 'Alexandre Cabanel',
  'Jacques Weber', 'Jacques Becker', 'Charles Boyer', 'Henri Langlois', 'André Bazin', 'François Morel',
  'Daniel Russo', 'Léon Bourgeois', 'Ferdinand Buisson', 'Jacques Duclos', 'Félix Gaillard', 'Éric Besson',
  'Hervé Morin', 'Frédéric Lefebvre', 'René Dumont', 'Fernando Cardoso', 'Jacques Hébert', 'Henri Giraud',
  'Philippe Kieffer', 'Daniel Cordier', 'Nicolas Chauvin', 'René Bousquet', 'Christophe Barbier', 'Guillaume Durand',
  'Honoré Mercier', 'Marc Ouellet', 'Stéphane Rousseau', 'Daniel Bélanger', 'Pierre Lapointe', 'Éric Lapointe',
  'Kévin Parent', 'Arthur Lancelot',
]);
export const BLOCK = L ? new Set(L.block) : BLOCK_FR;

// Noms déjà portés dans la partie (registerNames au chargement et à la création) : un nouveau joueur n'en reprend
// jamais un, et autant que possible pas même le nom de famille.
const inUse = new Set();
const lastInUse = new Set();
const lastOf = (full) => full.split(' ').slice(1).join(' ');

// Origine d'un nom, d'après la liste de son nom de famille (à défaut, de son prénom) : 'fr' (régions de France,
// Belgique, Suisse, Québec), 'ant' (Antilles, Réunion), 'itpt' (familles italiennes et portugaises), 'mag' (Maghreb),
// 'afr' (Afrique de l'Ouest et centrale). Les portraits s'en servent pour un visage qui va avec le nom (faces.js).
const ORIGIN_OF = new Map(Object.entries(P.last).flatMap(([o, list]) => list.map((x) => [x, o])));
export function originOf(full = '') {
  const o = ORIGIN_OF.get(lastOf(full));
  if (o) return o;
  const first = full.split(' ')[0];
  return P.first.mag?.includes(first) ? 'mag' : P.first.afr?.includes(first) ? 'afr' : P.first.itpt?.includes(first) ? 'itpt' : 'fr';
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
    if (BLOCK.has(full) || echoes(f, l) || inUse.has(full) || taken?.has(full)) continue;
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
    if (BLOCK.has(full) || echoes(f, l) || taken.has(full) || (i < 50 && lasts.has(l))) continue;
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

// Noms des clubs : un type (AS, FC, Stade, Entente…) et un lieu imaginaire, francophone ; dans une autre langue, ses
// types et ses lieux, dans l'ordre de la langue (« Kingsbridge Rovers », « Real Valdelobos »).
const CLUB_TYPES_FR = [
  'AS', 'FC', 'US', 'SC', 'RC', 'Olympique', 'Sporting', 'Racing', 'Stade', 'Étoile', 'Union', 'Entente', 'Avenir',
  'Jeunesse', 'Rapid', 'Bleus', 'Jaunes', 'Verts',
];

const CLUB_PLACES_FR = [
  'du Tilleul', 'de la Plaine', 'Montfleury', 'des Bruyères', 'de la Vallée', 'Saint-Clair',
  'des Trois Rivières', 'de l’Orme', 'Beaumont', 'du Vieux Port', 'des Coteaux', 'de la Prairie',
  'Rocheval', 'des Fontaines', 'Hauts-Bois', 'de la Gare', 'Bellerive', 'Clairval', 'Valmont', 'Roche-Blanche',
  'Mont-Aigu', 'des Saules', 'de la Colline', 'du Moulin', 'des Remparts', 'Bois-Joli', 'du Lac', 'de la Forge',
  'des Marais', 'du Phare', 'Champfleuri', 'Pierrefonde', 'Belcourt', 'Vaudrémont', 'Sainte-Aline', 'Port-Joli',
  'des Peupliers', 'de la Côte', 'du Plateau', 'des Glycines', 'Combe-Noire', 'Fontclaire', 'Vallon-Doré',
  'du Bocage',
];
const CLUB_TYPES = L ? L.clubTypes : CLUB_TYPES_FR;
const CLUB_PLACES = L ? L.clubPlaces : CLUB_PLACES_FR;

// Article d'un club selon son préfixe : l'AS, le FC, la Jeunesse, les Bleus… (un nom sans préfixe connu reste nu,
// comme celui que le joueur a choisi). clubAfter contracte avec la préposition : « de le FC » → « du FC ».
const ARTICLE = {
  AS: 'l’', US: 'l’', Olympique: 'l’', Étoile: 'l’', Atlas: 'l’', Avenir: 'l’', Union: 'l’', Entente: 'l’',
  FC: 'le ', SC: 'le ', RC: 'le ', Sporting: 'le ', Racing: 'le ', Rapid: 'le ', Stade: 'le ',
  Jeunesse: 'la ',
  Jaunes: 'les ', Bleus: 'les ', Verts: 'les ',
};
const G = L?.grammar;
export const withArticle = (name) => (G ? G.withArticle(name) : (ARTICLE[name.split(' ')[0]] || '') + name);
// club au nom pluriel (« les Jaunes ») : le verbe s'accorde
export const isPluralClub = (name) => (G ? G.isPluralClub(name) : ARTICLE[name.split(' ')[0]] === 'les ');
export function clubAfter(prep, name) {
  if (G) return G.clubAfter(prep, name);
  const a = withArticle(name);
  if (prep === 'de ' && a.startsWith('le ')) return `du ${a.slice(3)}`;
  if (prep === 'de ' && a.startsWith('les ')) return `des ${a.slice(4)}`;
  if (prep === 'à ' && a.startsWith('le ')) return `au ${a.slice(3)}`;
  if (prep === 'à ' && a.startsWith('les ')) return `aux ${a.slice(4)}`;
  if (prep === 'de ' && a === name) return deName(name); // nom sans article connu : « d'Inter Valmont »
  return prep + a;
}
export const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// élision devant un prénom qui commence par une voyelle ou un h muet : « passe décisive d’Adam », « frappe d’Ilyes »,
// « passe d’Hugo », « d’Yves » (0.8.24) ; Hamza, Yanis, Yann, Youssef gardent « de » (dans une autre langue, le nom seul :
// la préposition est dans la phrase traduite)
export const deName = (name) => (G ? G.deName(name) : (/^(?:[AEIOUÉÈÊÂÎÔ]|Yv|H(?:ugo|ector|adrien|enri|ervé|ippolyte|onoré))/.test(name) ? 'd’' : 'de ') + name);
// prépositions qui se contractent avec l'article d'un club dans le commentaire (fr : « de », « à » ; es : « de », « a »)
export const CLUB_PREPS = G ? G.preps : ['de', 'à'];

const placeOf = (name) => CLUB_PLACES.find((pl) => name.endsWith(` ${pl}`) || (L && name.startsWith(`${pl} `))) || null;
const typeOf = (name) => (L ? CLUB_TYPES.find((tp) => name.startsWith(`${tp} `) || name.endsWith(` ${tp}`)) || name.split(' ')[0] : name.split(' ')[0]);

export function randomClubName() {
  const type = pick(CLUB_TYPES);
  const place = pick(CLUB_PLACES);
  return L ? L.clubName(type, place) : `${type} ${place}`;
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
    const t = typeOf(name);
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
