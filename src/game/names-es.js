// Noms en espagnol (partie jouée en espagnol, src/i18n) : ceux qu'on entend dans le football espagnol et
// latino-américain, avec toutes ses origines (Castille, Andalousie, Catalogne, Pays basque, Galice, Amérique latine ;
// familles afro-latines, italiennes, portugaises et brésiliennes, maghrébines et levantines, d'Afrique de l'Ouest et
// de Guinée équatoriale), dans les mêmes proportions et en aussi grand nombre que la version française (names.js). Les
// combinaisons qui tomberaient sur une personne réelle sont interdites (block). Clubs : un type puis un lieu imaginaire
// (« Real Valdelobos », « Racing de Fuentedorada »), avec l'article de la langue (« el Real… », « la Gimnástica… »).

const first = {
  fr: [ // Espagne et Amérique latine
    'Hugo', 'Martín', 'Lucas', 'Mateo', 'Leo', 'Daniel', 'Alejandro', 'Pablo', 'Manuel', 'Álvaro', 'Adrián', 'David',
    'Mario', 'Diego', 'Marcos', 'Izan', 'Javier', 'Miguel', 'Antonio', 'Carlos', 'Ángel', 'Juan', 'Gonzalo', 'Gael',
    'Sergio', 'Nicolás', 'Gabriel', 'Jorge', 'José', 'Samuel', 'Darío', 'Héctor', 'Iker', 'Rodrigo', 'Saúl', 'Víctor',
    'Francisco', 'Iván', 'Jesús', 'Jaime', 'Aarón', 'Rubén', 'Guillermo', 'Julen', 'Luis', 'Unai', 'Rafael', 'Joel',
    'Alberto', 'Pedro', 'Raúl', 'Aitor', 'Santiago', 'Fernando', 'Alonso', 'Matías', 'Andrés', 'Axel', 'Ismael',
    'Ignacio', 'Elías', 'Isaac', 'Jon', 'Teo', 'Óscar', 'Cristian', 'Marc', 'Pau', 'Pol', 'Nil', 'Jan', 'Biel',
    'Martí', 'Arnau', 'Aleix', 'Asier', 'Ibai', 'Eneko', 'Oier', 'Ander', 'Mikel', 'Gorka', 'Iñaki', 'Xabier',
    'Jordi', 'Oriol', 'Gerard', 'Joan', 'Sergi', 'Ferran', 'Albert', 'Roger', 'Bernat', 'Brais', 'Iago', 'Xoán',
    'Anxo', 'Uxío', 'Antón', 'Roi', 'Xurxo', 'Emilio', 'Ernesto', 'Esteban', 'Eduardo', 'Enrique', 'Felipe',
    'Federico', 'Fabián', 'Gustavo', 'Gerardo', 'Germán', 'Gregorio', 'Hernán', 'Horacio', 'Humberto', 'Jacinto',
    'Joaquín', 'Julián', 'Julio', 'Lorenzo', 'Marcelo', 'Mariano', 'Mauricio', 'Maximiliano', 'Moisés', 'Octavio',
    'Orlando', 'Patricio', 'Ramiro', 'Ramón', 'Reinaldo', 'Ricardo', 'Roberto', 'Rogelio', 'Salvador', 'Sebastián',
    'Silvio', 'Tomás', 'Valentín', 'Vicente', 'Agustín', 'Alfonso', 'Alfredo', 'Ambrosio', 'Aníbal', 'Arturo',
    'Augusto', 'Benjamín', 'Bernardo', 'Camilo', 'César', 'Claudio', 'Cristóbal', 'Damián', 'Domingo', 'Eliseo',
    'Emiliano', 'Facundo', 'Fausto', 'Franco', 'Gaspar', 'Gilberto', 'Jacobo', 'Jerónimo', 'Leandro', 'Lisandro',
    'Mauro', 'Nahuel', 'Néstor', 'Norberto', 'Pascual', 'Rolando', 'Rufino', 'Simón', 'Sixto', 'Teodoro', 'Tobías',
    'Ulises', 'Benito', 'Bautista', 'Thiago', 'Dante', 'Bruno', 'Íñigo', 'Borja', 'Nacho', 'Paco', 'Pepe', 'Chema',
    'Manu', 'Rafa', 'Dani', 'Edu', 'Fran', 'Quique', 'Álex', 'Josema', 'Juanma', 'Josué', 'Juanjo',
    'Brayan', 'Jhon', 'Yeferson', 'Wilmer', 'Duván', 'Jhonatan', 'Jefferson', 'Anderson', 'Wilson', 'Edwin', 'Fredy',
    'Harold', 'Jair', 'Johan', 'Ronald', 'Steven', 'Wilfrido', 'Yeison', 'Brahian', 'Cristhian', 'Jonathan',
    'Emerson', 'Nelson', 'Milton', 'Rigoberto', 'Efraín', 'Luciano', 'Hernando', 'Abel', 'Adolfo', 'Amador',
    'Anselmo', 'Baltasar', 'Basilio', 'Blas', 'Ciro', 'Dámaso', 'Desiderio', 'Eusebio', 'Evaristo', 'Fermín',
    'Florencio', 'Gervasio', 'Hilario', 'Inocencio', 'Isidro', 'Leoncio', 'Macario', 'Marcial', 'Nazario', 'Pelayo',
    'Prudencio', 'Remigio', 'Severino', 'Tadeo', 'Urbano', 'Venancio', 'Zacarías', 'Bastián', 'Benicio', 'Lautaro',
    'Valentino', 'Joaquim', 'Kevin', 'Yair',
  ],
  itpt: [ // familles italiennes du Río de la Plata, portugaises et brésiliennes
    'Gianluca', 'Luca', 'Enzo', 'Renzo', 'Piero', 'Gino', 'Gianfranco', 'Paolo', 'Fabrizio', 'Stefano', 'Mirko',
    'Giuliano', 'Alessandro', 'Marcello', 'Lucca', 'Ezequiel', 'Raffaele', 'Emanuele', 'Massimo', 'Dario',
    'Tiago', 'João', 'Rui', 'Diogo', 'Nuno', 'Duarte', 'Gonçalo', 'Rúben', 'Afonso', 'Vasco', 'Henrique',
    'Simão', 'Caio', 'Murilo', 'Vinícius', 'Renan', 'Everton', 'Leonardo', 'Matheus',
    'Guilherme', 'Kauan', 'Davi', 'Arthur', 'Heitor', 'Luiz', 'Otávio', 'Ítalo', 'Wellington',
    'Thales', 'Cauã', 'Ruan', 'Igor', 'Fábio', 'Rogério', 'Marcílio', 'Ronan',
  ],
  mag: [ // familles maghrébines d'Espagne et levantines d'Amérique latine
    'Mohamed', 'Ahmed', 'Ayoub', 'Ilias', 'Hamza', 'Nassim', 'Achraf', 'Anuar', 'Karim', 'Bilal', 'Nabil', 'Samir',
    'Zakaria', 'Adam', 'Amir', 'Rayan', 'Imran', 'Youssef', 'Omar', 'Hicham', 'Soufiane', 'Mehdi', 'Ismail', 'Yahya',
    'Adil', 'Anas', 'Aymán', 'Badr', 'Driss', 'Faisal', 'Hakim', 'Hassan', 'Houssam', 'Ibrahim', 'Jalil', 'Khalid',
    'Marouane', 'Mounir', 'Mustafá', 'Nordin', 'Oussama', 'Rachid', 'Redouane', 'Said', 'Salim', 'Tarik', 'Walid',
    'Yunes', 'Zaid', 'Abdelkader', 'Abderrahim', 'Aziz', 'Brahim', 'Farid', 'Hamid', 'Idris', 'Jamal', 'Kamal',
    'Larbi', 'Mourad', 'Nasser', 'Riad', 'Selim', 'Sofian', 'Yasser', 'Elian', 'Emir', 'Habib', 'Nayib',
    'Salomón', 'Farouk', 'Antún', 'Kamel', 'Nazir', 'Fuad', 'Michel', 'Naim', 'Rami', 'Sami', 'Tufic', 'Wadih',
    'Yamil',
  ],
  afr: [ // familles d'Afrique de l'Ouest et centrale, et de Guinée équatoriale
    'Mamadou', 'Ousmane', 'Ibrahima', 'Cheikh', 'Lamine', 'Moussa', 'Abdoulaye', 'Seydou', 'Bakary', 'Sekou',
    'Alassane', 'Amadou', 'Boubacar', 'Fodé', 'Idrissa', 'Kalidou', 'Modou', 'Pape', 'Samba', 'Souleymane', 'Kwame',
    'Kofi', 'Yaw', 'Emmanuel', 'Samuel', 'Chidi', 'Emeka', 'Obinna', 'Tunde', 'Femi', 'Ayo', 'Tobi', 'Kunle', 'Musa',
    'Junior', 'Ezequiel', 'Salomón', 'Benjamín', 'Teodoro', 'Celestino', 'Florentino', 'Saturnino', 'Gaudencio',
    'Marcelino', 'Policarpo', 'Babacar', 'Mamadi', 'Lassana', 'Siaka', 'Youssouf', 'Usman', 'Yannick', 'Fortunato',
    'Christian', 'Joël', 'Bertrand', 'Didier', 'Arnaud', 'Wilfried', 'Serge', 'Plácido', 'Patrick', 'Thierry',
  ],
};

const last = {
  fr: [ // Espagne et Amérique latine
    'García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín',
    'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro',
    'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Molina', 'Morales', 'Suárez',
    'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Núñez', 'Iglesias', 'Medina', 'Garrido',
    'Cortés', 'Castillo', 'Santos', 'Lozano', 'Guerrero', 'Cano', 'Prieto', 'Méndez', 'Cruz', 'Calvo', 'Gallego',
    'Herrera', 'Márquez', 'León', 'Peña', 'Flores', 'Cabrera', 'Campos', 'Vega', 'Fuentes', 'Carrasco', 'Díez',
    'Reyes', 'Caballero', 'Nieto', 'Aguilar', 'Pascual', 'Santana', 'Herrero', 'Montero', 'Lorenzo', 'Hidalgo',
    'Giménez', 'Ibáñez', 'Ferrer', 'Durán', 'Santiago', 'Benítez', 'Vargas', 'Mora', 'Vicente', 'Arias', 'Carmona',
    'Crespo', 'Román', 'Pastor', 'Soto', 'Sáez', 'Velasco', 'Moya', 'Soler', 'Parra', 'Esteban', 'Bravo', 'Gallardo',
    'Rojas', 'Pardo', 'Merino', 'Franco', 'Espinosa', 'Izquierdo', 'Lara', 'Rivas', 'Silva', 'Rivera', 'Casado',
    'Arroyo', 'Redondo', 'Camacho', 'Rey', 'Vera', 'Otero', 'Luque', 'Galán', 'Montes', 'Ríos', 'Sierra', 'Segura',
    'Carrillo', 'Marcos', 'Mir', 'Soriano', 'Mendoza', 'Robles', 'Bernal', 'Vila', 'Valero', 'Palacios', 'Pereira',
    'Benito', 'Varela', 'Macías', 'Heredia', 'Roldán', 'Andrés', 'Vallejo', 'Guerra', 'Bueno', 'Mateo', 'Villar',
    'Contreras', 'Miranda', 'Salazar', 'Guillén', 'Trujillo', 'Aguirre', 'Beltrán', 'Bermúdez', 'Calderón', 'Cuesta',
    'Escudero', 'Gálvez', 'Hurtado', 'Jurado', 'Lucas', 'Manzano', 'Mesa', 'Mohedano', 'Naranjo', 'Ochoa', 'Pacheco',
    'Padilla', 'Plaza', 'Quintana', 'Rosales', 'Salinas', 'Tapia', 'Toledo', 'Valencia', 'Valle', 'Zamora', 'Zapata',
    'Ávila', 'Barrios', 'Bautista', 'Cabello', 'Cárdenas', 'Cobo', 'Conde', 'Cordero', 'Correa', 'Dorado', 'Espejo',
    'Estévez', 'Exposito', 'Figueroa', 'Gallo', 'Garzón', 'Godoy', 'Granados', 'Lillo', 'Linares', 'Lorente',
    'Maldonado', 'Mejía', 'Melero', 'Millán', 'Montoya', 'Moral', 'Nogales', 'Olmedo', 'Orozco', 'Paredes', 'Polo',
    'Ponce', 'Porras', 'Quesada', 'Quiroga', 'Rincón', 'Salgado', 'Sevilla', 'Tejada', 'Tirado', 'Toro', 'Uribe',
    'Valdés', 'Vidal', 'Villalba', 'Zambrano', 'Arenas', 'Barrera', 'Becerra', 'Bustos', 'Cantero', 'Carretero',
    'Ceballos', 'Cepeda', 'Collado', 'Chacón', 'Duarte', 'Echeverría', 'Elizondo', 'Escobar', 'Falcón', 'Fajardo',
    'Galindo', 'Gamboa', 'Gaona', 'Garcés', 'Huerta', 'Infante', 'Lagos', 'Lamas', 'Losada', 'Lucena', 'Luna',
    'Madrigal', 'Mancebo', 'Mariscal', 'Mata', 'Mena', 'Monreal', 'Montaño', 'Morillo', 'Murcia', 'Nava', 'Osorio',
    'Pantoja', 'Peralta', 'Pineda', 'Pizarro', 'Quintero', 'Recio', 'Ribera', 'Robledo', 'Rueda', 'Saavedra',
    'Salcedo', 'Sandoval', 'Solís', 'Tello', 'Terán', 'Vergel', 'Vergara', 'Villegas', 'Yáñez', 'Zúñiga',
    'Etxeberria', 'Agirre', 'Goikoetxea', 'Urrutia', 'Arrieta', 'Zabala', 'Larrañaga', 'Garmendia', 'Olano',
    'Iturralde', 'Mendizábal', 'Ibarra', 'Uriarte', 'Elorza', 'Arregui', 'Azpeitia', 'Lizaso', 'Ugarte',
    'Zubiaurre', 'Arana', 'Gorostiza', 'Olaizola', 'Bengoetxea', 'Aranburu', 'Puig', 'Vilanova', 'Sala', 'Roca',
    'Font', 'Serra', 'Pujol', 'Riera', 'Bosch', 'Mas', 'Casals', 'Ferrés', 'Vidiella', 'Coll', 'Roig',
    'Prats', 'Rovira', 'Sabaté', 'Soldevila', 'Planas', 'Batlle', 'Castells', 'Comas', 'Dalmau', 'Fabra',
    'Gispert', 'Llopis', 'Masip', 'Oliveras', 'Pagès', 'Ribas', 'Sendra', 'Tort', 'Valls', 'Vives', 'Lamela',
    'Rial', 'Lema', 'Castiñeira', 'Seoane', 'Piñeiro', 'Freire', 'Souto', 'Fariña', 'Vilariño', 'Couto',
    'Barreiro', 'Carballo', 'Rivadulla', 'Tabeayo', 'Abalde', 'Castro Rey', 'Paz', 'Bouzas', 'Cancela', 'Doval',
    'Outeiro', 'Pazos', 'Regueiro', 'Sanmartín', 'Torreiro', 'Lago', 'Aranda', 'Bejarano', 'Carrión',
    'Cebrián', 'Del Río', 'Fuster', 'Jaén', 'Lobato', 'Llorens', 'Montalvo', 'Peinado', 'Rosado', 'Toribio',
  ],
  ant: [ // familles afro-latines (Pacifique colombien, Esmeraldas, Caraïbe)
    'Mosquera', 'Caicedo', 'Palacio', 'Murillo', 'Angulo', 'Quiñónez', 'Arboleda', 'Riascos', 'Mina', 'Rentería',
    'Lucumí', 'Banguera', 'Cuero', 'Perlaza', 'Valoyes', 'Cassiani', 'Hinestroza', 'Córdoba', 'Rivas Mena',
    'Chalá', 'Preciado', 'Estupiñán', 'Corozo', 'Bolaños', 'Ayala', 'Ayoví', 'Bone', 'Plata', 'Hurtado Cuero',
    'Arrollo', 'Sinisterra', 'Lerma', 'Copete', 'Advíncula', 'Rengifo', 'Viveros', 'Grueso',
    'Obregón', 'Balanta', 'Carabalí', 'Congo', 'Mancilla',
  ],
  itpt: [ // familles italiennes du Río de la Plata, portugaises et brésiliennes
    'Rossi', 'Bianchi', 'Ferrari', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Conti', 'De Luca',
    'Mancini', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi',
    'Caruso', 'Ferrara', 'Galli', 'Martinelli', 'Vitale', 'Leone', 'Longo', 'Gentile', 'Coppola', 'Marchetti',
    'Parisi', 'Pellegrini', 'Palumbo', 'Farina', 'Rizzi', 'Monti', 'Cattaneo', 'Morelli', 'Benedetto', 'Bellini',
    'Bertolini', 'Biagini', 'Cabrini', 'Castelli', 'Cavallero', 'Ciampi', 'Damiani', 'D’Alessandro', 'Della Valle',
    'Di Pietro', 'Falcone', 'Fiore', 'Gagliardi', 'Iacovelli', 'Lanza', 'Lo Russo', 'Lucarelli',
    'Mazza', 'Montanari', 'Negri', 'Orsini', 'Pagano', 'Pastorino', 'Piccolo', 'Rossetti', 'Ferri',
    'Scarpa', 'Spinelli', 'Toscano', 'Valentini', 'Zanardi', 'Lima', 'Prado', 'Ferreira', 'Portela',
    'Oliveira', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gomes', 'Lopes', 'Marques', 'Almeida', 'Ribeiro',
    'Pinto', 'Carvalho', 'Teixeira', 'Moreira', 'Correia', 'Mendes', 'Nunes', 'Soares', 'Vieira', 'Monteiro',
    'Cardoso', 'Rocha', 'Barbosa', 'Araújo', 'Cavalcanti', 'Nascimento', 'Batista', 'Freitas', 'Azevedo', 'Brandão',
    'Coelho', 'Dias', 'Fonseca', 'Macedo', 'Magalhães', 'Leite', 'Queiroz', 'Tavares',
  ],
  mag: [ // familles maghrébines d'Espagne et levantines d'Amérique latine
    'El Amrani', 'Benali', 'Bensaïd', 'El Haddad', 'Bouazza', 'El Khalfi', 'Ait Ali', 'Belhaj', 'Benamar', 'Bouchiba',
    'Chaouki', 'Dahmani', 'El Ghazi', 'El Hamdaoui', 'El Kaddouri', 'Farhat', 'Ghanem', 'Hadri', 'Haddou', 'Kaddour',
    'Mansour', 'Mansouri', 'Mekki', 'Messaoudi', 'Naciri', 'Ouali', 'Rahmouni', 'Saidi', 'Tahiri', 'Yahyaoui',
    'Zaidi', 'Zerrouki', 'Abdelaziz', 'Ait Brahim', 'Amri', 'Azzouzi', 'Belkacem', 'Benhamou', 'Benjelloul',
    'Boukhari', 'Chakir', 'Driouech', 'El Bakkali', 'El Yamani', 'Essafi', 'Hamdi', 'Jebari', 'Karimi', 'Laaroussi',
    'Mahdaoui', 'Moussaoui', 'Nouri', 'Rachidi', 'Sabri', 'Selmani', 'Talbi', 'Zahraoui', 'Haddad', 'Saab',
    'Nasr', 'Jadue', 'Abuchaibe', 'Name', 'Kattan', 'Hasbún', 'Yunis', 'Facusse', 'Sapag', 'Chahín', 'Massuh',
    'Majluf', 'Nazal', 'Abdala', 'Bujana', 'Daccarett', 'Farah', 'Handal', 'Jabbour', 'Mattar', 'Salomón',
  ],
  afr: [ // familles d'Afrique de l'Ouest et centrale, et de Guinée équatoriale
    'Diallo', 'Ndiaye', 'Diop', 'Fall', 'Sow', 'Ba', 'Cissé', 'Traoré', 'Koné', 'Keita', 'Camara', 'Touré', 'Sangaré',
    'Doumbia', 'Bamba', 'Kouyaté', 'Sylla', 'Diarra', 'Diaby', 'Fofana', 'Sissoko', 'Coulibaly', 'Dembaga',
    'Konté', 'Ndoye', 'Gueye', 'Seck', 'Faye', 'Sarr', 'Mbaye', 'Thiam', 'Niang', 'Badji', 'Mendy', 'Sagna',
    'Mensah', 'Owusu', 'Asante', 'Osei', 'Appiah', 'Boakye', 'Okafor', 'Okonkwo', 'Eze', 'Nwosu', 'Okeke', 'Adeyemi',
    'Adebayo', 'Afolabi', 'Bello', 'Ojo', 'Nsue', 'Ndong', 'Mba', 'Esono', 'Ela', 'Owono', 'Bacale', 'Mangue',
    'Abeso', 'Asumu', 'Edjang', 'Mikue', 'Nchama', 'Oyono', 'Mbomio', 'Ebang', 'Eyama', 'Nzang', 'Ondo', 'Bibang',
    'Eneme', 'Ekang', 'Nsogo', 'Engonga', 'Avomo', 'Mbengono', 'Etoundi', 'Nkoulou', 'Mbida', 'Choupo', 'Aboubakar',
    'Kamga', 'Tchami', 'Ngadeu', 'Fotsing',
  ],
};

// Combinaisons interdites : vrais joueurs et entraîneurs du football espagnol et latino-américain, et célébrités, que le
// hasard pourrait recomposer avec les listes ci-dessus.
const block = [
  'Sergio Ramos', 'Fernando Torres', 'David Villa', 'Andrés Iniesta', 'Xavi Hernández', 'Carles Puyol', 'Iker Casillas',
  'Gerard Piqué', 'Cesc Fàbregas', 'Xabi Alonso', 'David Silva', 'Jordi Alba', 'Sergio Busquets', 'Raúl González',
  'Fernando Hierro', 'Pedro Rodríguez', 'Juan Mata', 'Marco Asensio', 'Álvaro Morata', 'Dani Carvajal', 'Rodrigo Hernández',
  'Pedro González', 'Pablo Gavira', 'Ferran Torres', 'Dani Olmo', 'Nico Williams', 'Iñaki Williams', 'Unai Simón',
  'Mikel Merino', 'Mikel Oyarzabal', 'Fabián Ruiz', 'Álex Baena', 'Martín Zubimendi', 'Aymeric Laporte', 'Marc Cucurella',
  'Pau Cubarsí', 'Alejandro Grimaldo', 'Luis Enrique', 'Vicente Del Bosque', 'Pep Guardiola', 'Lionel Messi',
  'Ángel Di María', 'Sergio Agüero', 'Diego Maradona', 'Gabriel Batistuta', 'Carlos Tevez', 'Javier Mascherano',
  'Lautaro Martínez', 'Julián Álvarez', 'Emiliano Martínez', 'Rodrigo De Paul', 'Enzo Fernández', 'Nicolás Otamendi',
  'Luis Suárez', 'Edinson Cavani', 'Diego Forlán', 'Diego Godín', 'Federico Valverde', 'Darwin Núñez', 'Radamel Falcao',
  'James Rodríguez', 'Carlos Valderrama', 'Luis Díaz', 'Juan Cuadrado', 'Alexis Sánchez', 'Arturo Vidal', 'Claudio Bravo',
  'Javier Hernández', 'Rafael Márquez', 'Hugo Sánchez', 'Guillermo Ochoa', 'Raúl Jiménez', 'Hirving Lozano', 'Keylor Navas',
  'Fernando Alonso', 'Carlos Sainz', 'Rafael Nadal', 'Carlos Alcaraz', 'Pau Gasol', 'Marc Gasol', 'Antonio Banderas',
  'Javier Bardem', 'Julio Iglesias', 'Enrique Iglesias', 'Alejandro Sanz', 'David Bisbal', 'Pablo Picasso', 'Salvador Dalí',
  'Pedro Almodóvar', 'Diego Simeone', 'Unai Emery', 'Julen Lopetegui', 'Roberto Martínez', 'Mauricio Pochettino',
  'Marcelo Bielsa', 'Gerardo Martino', 'Jorge Sampaoli', 'Rafael Benítez', 'Míchel Salgado', 'Joaquín Sánchez',
  'Santi Cazorla', 'Raúl Albiol', 'Joan Capdevila', 'Carlos Marchena', 'Xabi Prieto', 'Aritz Aduriz', 'Saúl Ñíguez',
  'Jesús Navas', 'Álvaro Arbeloa', 'Pepe Reina', 'Víctor Valdés', 'David De Gea', 'Raúl Asencio', 'Fermín López',
  'Marc Casadó', 'Pablo Barrios', 'Diego Llorente', 'Marcos Llorente', 'Iago Aspas', 'Gerard Moreno', 'Rodrigo Moreno',
  'Adama Traoré', 'Bryan Gil', 'Sergio Canales', 'Dani Parejo', 'Borja Iglesias', 'Luis Alberto', 'Felipe González',
  'Pedro Sánchez', 'Mariano Rajoy', 'Pablo Iglesias', 'Mateo Kovačić', 'Rubén Baraja', 'Gonzalo Higuaín', 'Paulo Dybala',
  'Javier Zanetti', 'Juan Sebastián Verón', 'Hernán Crespo', 'Pablo Aimar', 'Esteban Cambiasso', 'Leandro Paredes',
  'Nahuel Molina', 'Cristian Romero', 'Lisandro Martínez', 'Alexis Mac Allister', 'Giovani Lo Celso', 'Ronaldo Nazário',
  'Vinícius Júnior', 'Roberto Carlos', 'Marcelo Vieira', 'Thiago Silva', 'Gabriel Jesus', 'Lucas Paquetá', 'Iván Zamorano',
  'Marcelo Salas', 'Gary Medel', 'Charles Aránguiz', 'Mario Kempes', 'Daniel Passarella', 'Óscar Ruggeri',
  'Jorge Valdano', 'Emilio Butragueño', 'Manuel Sanchís', 'Míchel González', 'Raúl García', 'Fernando Morientes',
  'Gaizka Mendieta', 'Joseba Etxeberria', 'Julio Salinas', 'Andoni Zubizarreta', 'Luis Arconada', 'Pep Reina',
  'José Mourinho', 'Gabriel García', 'Antonio Machado', 'Miguel Cervantes', 'Francisco Franco', 
  'Felipe Borbón', 'Rafa Nadal', 'Pau Torres', 'Pablo Sarabia', 'Dani Ceballos', 'Robert Lewandowski', 'Ansu Fati',
  'Lamine Yamal', 'Mohamed Salah', 'Achraf Hakimi', 'Ilias Akhomach', 'Bilal El Khannouss', 'Brahim Díaz',
];

// Types de club et lieux imaginaires : « Real Valdelobos », « Racing de Fuentedorada », « UD Peñaserena ».
const clubTypes = ['Real', 'Atlético', 'Racing', 'Sporting', 'Deportivo', 'Recreativo', 'CD', 'UD', 'SD', 'CF',
  'Club Atlético', 'Unión', 'Real Unión', 'Gimnástica', 'Juventud', 'Estudiantes', 'Arenas', 'Cultural'];
const clubPlaces = ['Valdelobos', 'Fuentedorada', 'Peñaserena', 'Villalumbre', 'Castroluna', 'Robledo Alto',
  'Arroyoclaro', 'Montealegre', 'Valdeestrellas', 'Puertoclaro', 'Torrealba', 'Sotoverde', 'Villanieve',
  'Campohermoso', 'Peñalba del Mar', 'Navalrosa', 'Riofrío Alto', 'Vallehondo', 'Altozano', 'Monteolivo',
  'Fuenteserena', 'Lagunablanca', 'Villacerezo', 'Castilnuevo', 'Encinar del Sol', 'Robledal', 'Valdemoro Alto',
  'San Alejo', 'Santa Brígida', 'Bahía Serena', 'Puerto Albor', 'Cerro Dorado', 'Llano Verde', 'Las Almenas',
  'Los Olivares', 'Las Salinas', 'El Pinar Viejo', 'La Ensenada', 'Miravalles', 'Peñaflorida', 'Torremar',
  'Ribaclara', 'Vegaluz', 'Sierranegra'];

// Article d'un club : féminin pour l'UD, la SD, la Gimnástica, l'Unión, la Juventud, la Cultural, masculin sinon ; « de » et
// « a » se contractent avec « el » (« del Real… », « al Racing… »). Les noms sans type connu (celui que le joueur a
// choisi) restent nus.
const FEM = new Set(['UD', 'SD', 'Unión', 'Real Unión', 'Gimnástica', 'Juventud', 'Cultural']);
const typeIn = (name) => clubTypes.filter((tp) => name.startsWith(`${tp} `)).sort((a, b) => b.length - a.length)[0];
const withArticle = (name) => {
  const tp = typeIn(name);
  return tp ? `${FEM.has(tp) ? 'la' : 'el'} ${name}` : name;
};
// préposition française du code (de, à, avec, par, rien) → préposition espagnole
const PREP = { 'de ': 'de', 'à ': 'a', 'a ': 'a', 'avec ': 'con', 'par ': 'por', '': '' };
const clubAfter = (prep, name) => {
  const p = PREP[prep] ?? prep.trim();
  const a = withArticle(name);
  if (p === 'de' && a.startsWith('el ')) return `del ${a.slice(3)}`;
  if (p === 'a' && a.startsWith('el ')) return `al ${a.slice(3)}`;
  return p ? `${p} ${a}` : a;
};
const grammar = {
  withArticle,
  isPluralClub: () => false,
  clubAfter,
  deName: (name) => `de ${name}`,
  preps: ['de', 'a'],
};

export default {
  first,
  last,
  origins: [[0.55, 'fr', 0, 'fr'], [0.06, 'fr', 0, 'ant'], [0.1, 'itpt', 0.4, 'itpt'], [0.16, 'mag', 0.2, 'mag'], [0.13, 'afr', 0.3, 'afr']],
  block,
  clubTypes,
  clubPlaces,
  clubName: (type, place) => (['Racing', 'Sporting', 'Atlético', 'Recreativo', 'Gimnástica', 'Juventud', 'Estudiantes', 'Arenas'].includes(type)
    ? `${type} de ${place}` : `${type} ${place}`),
  grammar,
};
