// Nouveautés du jeu, de la plus récente à la plus ancienne : l'écran « Nouveautés » (écran titre et menu pause) les
// affiche, et une pastille signale une version pas encore lue (version vue : stockage local, src/ui/news.jsx).
// La version courante est celle de package.json (__APP_VERSION__), à faire avancer avec chaque entrée ajoutée ici.

export const CHANGELOG = [
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
