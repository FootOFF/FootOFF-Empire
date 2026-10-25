// Nouveautés du jeu, de la plus récente à la plus ancienne : l'écran « Nouveautés » (écran titre et menu pause) les
// affiche, et une pastille signale une version pas encore lue (version vue : stockage local, src/ui/news.jsx).
// La version courante est celle de package.json (__APP_VERSION__), à faire avancer avec chaque entrée ajoutée ici.

export const CHANGELOG = [
  {
    version: '0.3.13', date: '2026-10-25', title: 'Plus de loupe, tarifs à la Direction',
    items: [
      'iPhone : un double toucher maintenu n’ouvre plus la loupe de texte de Safari, nulle part dans le jeu ; un bouton touché deux fois de suite répond toujours deux fois.',
      'Les tarifs des billets se règlent uniquement à la Direction du club (onglet Billetterie) ; la fiche du stade affiche le tarif en vigueur et y mène.',
    ],
  },
  {
    version: '0.3.12', date: '2026-10-25', title: 'Ventes encadrées',
    items: [
      'Un joueur blessé ou suspendu ne peut plus être vendu : ni mise en vente, ni offre acceptée ; les clubs reviennent à son retour.',
      'Une recrue ne peut pas être revendue avant le match qui suit sa signature.',
      'Fiche joueur : « Arrivée au club » montre ce qu’il a coûté (indemnité ou prime), quand et d’où il est venu.',
    ],
  },
  {
    version: '0.3.11', date: '2026-10-25', title: 'Le direct, rien que le direct',
    items: [
      'Pendant un match, la caméra reste à la réalisation : plus de rotation, de zoom ni de déplacement, et les bâtiments ne s’ouvrent plus d’un toucher.',
      'Un changement met vraiment le match en pause : les joueurs et le ballon s’immobilisent jusqu’à la reprise.',
    ],
  },
  {
    version: '0.3.10', date: '2026-10-25', title: 'Fiche joueur sur place',
    items: [
      'Saison et Statistiques : la fiche d’un joueur s’ouvre par-dessus l’écran en cours ; la fermer ramène au même endroit (même onglet, même défilement, fiche carrière comprise) au lieu de l’Équipe.',
    ],
  },
  {
    version: '0.3.9', date: '2026-10-25', title: 'Cartes et liserés',
    items: [
      'Cartes des joueurs : la note, le poste, « XI » et le numéro forment une colonne à gauche, le portrait se place à côté ; une note à deux chiffres (11,6) ne chevauche plus le visage.',
      'Le liseré doré fait tout le tour, coin coupé compris : succès tout juste débloqué, parcelle choisie, recrue conseillée, niveau de l’académie.',
    ],
  },
  {
    version: '0.3.8', date: '2026-10-25', title: 'Mercato réparé',
    items: [
      'Le mercato s’ouvre de nouveau : la 0.3.7 le faisait planter (« Le jeu a rencontré un problème »).',
      'Réglages : « Signaler un problème » prépare enfin son rapport (le bouton ne faisait rien).',
    ],
  },
  {
    version: '0.3.7', date: '2026-10-25', title: 'Corrections au téléphone',
    items: [
      'Équipe : le menu « Trier par » s’ouvre par-dessus les cartes et répond au doigt (les cartes le recouvraient : le tri semblait cassé).',
      'Après-match : « Stats du match » et « Voir le classement » l’un sous l’autre, en entier.',
      'Fiche carrière : même en-tête que la fiche joueur (niveau en grand et sa légende, portrait, étiquettes) ; le bouton « Voir sa fiche joueur » tient dans l’écran.',
    ],
  },
  {
    version: '0.3.6', date: '2026-10-24', title: 'Mises à jour plus discrètes',
    items: [
      'Le bandeau « Nouvelle version » ne revient plus à chaque lancement quand le jeu tourne déjà la dernière version : il ne s’affiche que si une version plus récente reste à charger.',
    ],
  },
  {
    version: '0.3.5', date: '2026-10-24', title: 'Négociation plus claire',
    items: [
      'Achat, mise en vente et vente négociée : la chance d’accord s’affiche juste au-dessus du bouton et suit la somme en direct, sans faire défiler.',
    ],
  },
  {
    version: '0.3.4', date: '2026-10-24', title: 'Lisibilité',
    items: [
      'Entraînement : la qualité choisie se lit enfin (son gain vert et le point de la qualité conseillée disparaissaient sur le fond doré).',
      'Même correction partout où un élément choisi est doré : académie, mercato, menu de l’écran titre.',
    ],
  },
  {
    version: '0.3.3', date: '2026-10-24', title: 'Notification d’origine',
    items: [
      'Les notifications retrouvent leur dessin d’origine, plus élégant : coins arrondis, lettres fines et espacées.',
    ],
  },
  {
    version: '0.3.2', date: '2026-10-24', title: 'Corrections',
    items: [
      'La « Subvention de la mairie » ne s’annonce plus à chaque action : une prime du tutoriel s’annonce une seule fois (elle n’a jamais été versée deux fois).',
      'Académie plus lisible : nombres des onglets visibles sur l’onglet choisi, fiche d’un jeune au même modèle que la fiche joueur.',
      'Plus de sursaut en passant d’un onglet à l’autre d’une section (Finances, Journal, Notoriété, Direction…) ; Direction a la taille des autres écrans du Club.',
    ],
  },
  {
    version: '0.3.1', date: '2026-10-24', title: 'Retour du logo',
    items: [
      'Le logo FootOFF Empire d’origine revient sur l’écran de chargement et l’écran titre.',
      '« Nouvelle partie » reste proposée sur une partie en cours, après confirmation : la partie actuelle est alors effacée.',
    ],
  },
  {
    version: '0.3.0', date: '2026-10-24', title: 'Nouvelle interface',
    items: [
      'Toute l’interface refaite façon habillage télé : plaques sombres, or FootOFF, grands chiffres en capitales condensées.',
      'Menu du bas en cinq sections, Complexe, Équipe, Mercato, Saison et Club, chacune avec ses onglets.',
      'Match en direct : bandeau du score avec les clubs en trois lettres, bandeau du but, temps forts et pronostic exact pendant tout le match.',
      'Nouvelles cartes de joueurs et nouvelle fiche joueur ; le mercato s’affiche en tableau sur ordinateur.',
      'Saison : frise des dates avec les résultats, classement avec victoires, nuls et défaites, course à la montée et meilleurs joueurs du club.',
      'Nouvel écran titre et nouveau menu pause.',
    ],
  },
  {
    version: '0.2.1', date: '2026-10-24', title: 'La mémoire du club',
    items: [
      'Le journal garde toute l’histoire du club, saison par saison, au lieu des quarante dernières nouvelles.',
      'Le direct raconte mieux : bien plus d’occasions, d’arrêts, de buts selon le score, de cartons et d’ambiance.',
      'Un lien partagé (messages, réseaux) montre désormais le titre, une description et une image du jeu.',
    ],
  },
  {
    version: '0.2.0', date: '2026-10-24', title: 'Prêt pour les premiers joueurs',
    items: [
      'Sauvegarde protégée : copie de secours à chaque session, code de sauvegarde à copier et à coller d’un appareil à l’autre (réglages).',
      'Le jeu s’ouvre hors ligne après une première visite et annonce lui-même les nouvelles versions.',
      'Un écran clair si le jeu rencontre un problème, avec retour à la copie de secours et rapport à copier.',
      '« Signaler un problème » dans les réglages : un rapport complet, avec ta partie si tu l’acceptes, pour reproduire chaque bug.',
      'Cet écran Nouveautés, le numéro de version au bas de l’écran titre, et les Règles du jeu en langage joueur.',
      'Le tutoriel explique la condition physique, les blessures, les suspensions et les changements en cours de match.',
    ],
  },
  {
    version: '0.1.3', date: '2026-10-24', title: 'Équilibre et cohérence',
    items: [
      'Une seule valeur de marché par joueur, référence des primes, des indemnités et des offres reçues.',
      'Les stars de l’Elite coûtent vraiment cher ; salaires et entretien se paient à chaque journée.',
      'La réputation se gagne selon la division et s’oublie un peu chaque été ; nouveaux statuts jusqu’à « Club de légende » à 80.',
      'Effectif de départ au milieu de la Départementale, haut de l’Elite relevé, recruteurs et notoriété qui attirent des joueurs jusqu’à 19.',
    ],
  },
  {
    version: '0.1.2', date: '2026-10-24', title: 'Le banc compte enfin',
    items: [
      'Condition physique : un match fatigue selon l’endurance, chaque date repose ; un joueur fatigué joue moins bien et se blesse plus souvent.',
      'Blessures (une à neuf dates d’absence) et suspensions (rouge direct : deux matchs ; second jaune ou trois jaunes : un).',
      'Changements à toute minute pendant le direct : le match s’arrête, composition, tactique et pronostic final se règlent ; cinq changements par match.',
      'Lecture du jeu ne se fige plus, et une erreur pendant une épreuve propose de la simuler.',
    ],
  },
  {
    version: '0.1.0', date: '2026-10-24', title: 'Version de départ',
    items: [
      'Direction du club : droits TV, salaires et billetterie à négocier.',
      'Tutoriel en sept étapes mené par la directrice sportive, objectifs du président à chaque saison.',
      'Centre d’entraînement avec huit épreuves en 3D, académie, mercato négocié, Coupe nationale et Coupe d’Europe.',
    ],
  },
];

export const CURRENT = CHANGELOG[0].version;
