// Nouveautés du jeu, de la plus récente à la plus ancienne : l'écran « Nouveautés » (écran titre et menu pause) les
// affiche, et une pastille signale une version pas encore lue (version vue : stockage local, src/ui/news.jsx).
// La version courante est celle de package.json (__APP_VERSION__), à faire avancer avec chaque entrée ajoutée ici.

export const CHANGELOG = [
  {
    version: '0.8.4', date: '2026-10-28', title: 'Tactique et effectif',
    items: [
      'Change de dispositif à la mi-temps, ou à n’importe quel arrêt de jeu : tes joueurs se replacent au mieux et le pronostic suit. Le bouton « Changement » reste utile même sans changement restant (dispositif, tactique, postes).',
      'Après un carton rouge, déplace l’expulsé sur le poste que tu veux laisser vide (jamais celui du gardien) : le poste choisi compte vraiment dans le match.',
      'Les tactiques se paient : attaquer rapporte quand tu es plus fort, l’équilibrée est le bon choix à niveau égal, le bloc bas face à un adversaire bien plus fort.',
      'Ton effectif ne descend jamais sous 13 joueurs : la vente est refusée à 13, et si une fin de contrat te fait passer en dessous, le jeune le plus utile de ton académie monte d’office.',
    ],
  },
  {
    version: '0.8.3', date: '2026-10-28', title: 'Championnats entre amis',
    items: [
      'Le Siège de la Ligue ouvre ses portes : crée un championnat entre amis (bâtiment de l’Élite), ou rejoins celui d’un ami par son lien d’invitation. Ni compte ni e-mail : un pseudo et ton club suffisent.',
      'Huit clubs, une journée par jour à l’heure choisie par le créateur. Les places libres reviennent à des clubs de l’ordinateur qui construisent, recrutent et adaptent leur tactique à l’adversaire.',
      'Plans de mi-temps : le match se joue sans toi. Prépare ce que fait ton staff à la pause selon le score (tu mènes, égalité, tu es mené) : dispositif, tactique et jusqu’à cinq changements.',
      'Mercato de la ligue : les joueurs libres et ceux des clubs de l’ordinateur se négocient comme en solo, et le premier club qui conclut signe le joueur. Une offre à un ami part aussitôt ; acceptée, le transfert est immédiat.',
      'Ton club de ligue est sauvegardé en ligne : tu le retrouves sur un autre appareil.',
    ],
  },
  {
    version: '0.8.2', date: '2026-10-28', title: 'Un staff plus juste',
    items: [
      'Un conseil du staff que tu masques reste masqué, même quand tu recharges le jeu, jusqu’à ce que la situation change. Quand il n’a rien d’utile à dire, le staff se tait.',
      'Le stade : le staff n’en parle plus que lorsque l’agrandissement est dans tes moyens, une fois par niveau ; la pastille du stade ne s’allume plus que dans ce cas.',
      'L’académie : la pastille de la détection s’éteint dès que tu l’as regardée, jusqu’au prochain repérage. Les jeunes qui partiront à l’intersaison ne sont signalés qu’en seconde moitié de saison.',
      'Nouveaux rappels : les droits TV de la saison à négocier (Direction), les blessés à soigner (centre médical), les programmes de signes à lancer (centre d’entraînement), les recruteurs à envoyer en mission (académie).',
      'L’onglet « Pronostic » des Statistiques disparaît. Le panneau Pronostic de l’avant-match devient opaque, le classement compte les quatorze journées de l’Élite, et le nom de la division prend son accent.',
    ],
  },
  {
    version: '0.8.1', date: '2026-10-28', title: 'Forme, rotation et matchs à l’extérieur',
    items: [
      'La forme compte désormais en match : un joueur en grande forme joue un peu mieux, un joueur en méforme un peu moins bien. « Meilleur onze » en tient compte, avec la condition physique.',
      'Nouveau bouton « Faire tourner », avant le match et dans la Composition : les titulaires fatigués (sous 75 %) laissent leur place aux remplaçants reposés de leur poste.',
      'À l’extérieur, l’équipe qui reçoit passe à gauche, partout : calendrier, avant-match, match en direct, après-match et statistiques, avec le score dans l’ordre du football.',
      'La saison en cours s’affiche sur les écrans de contrat (négociation, fiche du joueur, Direction) et dans l’en-tête de l’Équipe.',
    ],
  },
  {
    version: '0.8.0', date: '2026-10-28', title: 'Contrats et salaires',
    items: [
      'Chaque joueur a maintenant un contrat : un salaire par saison, une durée, parfois une clause de montée. Le salaire reste fixe pendant le contrat : seules une prolongation, la clause de montée ou une descente le changent.',
      'Recruter un joueur sous contrat se fait en deux temps : l’indemnité avec son club, puis son contrat avec lui (salaire, durée, prime à la signature, clause de montée), avec la chance exacte qu’il signe. Un joueur libre se négocie directement.',
      'Prolonge depuis la fiche du joueur ou le nouvel onglet Contrats de la Direction. Sans prolongation, un joueur part libre à la fin de son contrat, sans indemnité.',
      'Tes joueurs reçoivent un contrat de deux à quatre ans à leur salaire actuel : personne ne part à la fin de cette saison.',
    ],
  },
  {
    version: '0.7.8', date: '2026-10-27', title: 'Une huitième parcelle',
    items: [
      'Le complexe compte maintenant huit parcelles : trois à l’est, comme à l’ouest. Tes bâtiments de l’est se décalent un peu, rien d’autre ne change.',
      'La nouvelle parcelle est libre : elle accueillera bientôt un bâtiment de prestige, réservé à l’Élite.',
    ],
  },
  {
    version: '0.7.7', date: '2026-10-27', title: 'Plein écran sur PC',
    items: [
      'Nouveau réglage « Plein écran » sur PC (Réglages, à l’écran titre et dans le menu pause) : le jeu occupe tout l’écran, sans la barre du navigateur.',
      'Échap pour en sortir. Laissé allumé, il revient à ton premier clic quand tu rouvres le jeu (le navigateur attend toujours un geste de ta part).',
    ],
  },
  {
    version: '0.7.6', date: '2026-10-27', title: 'C’est toi qui vends',
    items: [
      'Quand un club accepte ta demande en négociation, la vente ne se fait plus toute seule : son offre passe à ton prix et c’est toi qui choisis, « Vendre » ou « Refuser ». L’accord vaut jusqu’à la prochaine journée.',
      'De même après le dernier mot d’un club : les deux boutons, côte à côte, en bas de la négociation.',
      'Dans les offres reçues, « Refuser » est un vrai bouton, de la même taille que « Accepter » et « Négocier ».',
    ],
  },
  {
    version: '0.7.5', date: '2026-10-27', title: 'Une composition plus grande',
    items: [
      'Sur PC, à la mi-temps et pendant un changement, la composition dépliée prend tout l’écran : le terrain couché, bien plus grand, à droite des consignes.',
      'Les joueurs du terrain prennent la plus grande taille possible sans jamais se toucher, selon la taille de l’écran et la formation : plus de noms qui se chevauchent, même en 3-5-2 ou en 5-3-2. Sur un grand écran, ils sont plus gros qu’avant.',
      'À l’avant-match et dans l’onglet Composition, le terrain est plus haut et se couche dès que la place le permet.',
    ],
  },
  {
    version: '0.7.4', date: '2026-10-27', title: 'Petites finitions',
    items: [
      'Sur PC, dans l’Équipe, la trésorerie et le bouton Fermer restent en haut à droite, à côté du titre ; les onglets passent sur leur propre ligne quand ils n’y tiennent pas.',
      'Sur téléphone, l’avant-match se referme en le glissant vers le bas, comme les autres fenêtres : retour au complexe.',
    ],
  },
  {
    version: '0.7.3', date: '2026-10-27', title: 'Des noms plus variés',
    items: [
      'Trois fois plus de prénoms et de noms pour les joueurs : environ 450 prénoms et 700 noms, toujours francophones, simples à retenir, de toutes les origines du football français.',
      'Dans une saison, un même prénom ou un même nom ne revient presque plus trois fois, chez toi comme chez les adversaires.',
      'Aucun nom ne reprend celui d’un vrai joueur ou d’une personne connue, et plus jamais de nom qui se répète (« Laurent Laurent »).',
      'Tes joueurs gardent leur nom. Seuls deux noms de famille trop proches de personnes réelles sont remplacés à l’ouverture de la partie.',
    ],
  },
  {
    version: '0.7.2', date: '2026-10-27', title: 'Fluidité sur appareil lent',
    items: [
      'Nouveau réglage « Fluidité sur appareil lent » (Réglages, à l’écran titre et dans le menu pause), coupé par défaut : si le jeu rame, la 3D est calculée avec moins de pixels, par paliers, juste assez pour redevenir fluide. L’image est un peu moins nette ; elle remonte dès que l’appareil suit de nouveau.',
      'Rien ne change sur un appareil qui suit, ni quand le réglage est coupé : pleine résolution de l’écran.',
      'Le complexe, les temps forts du match et les épreuves d’entraînement en profitent ; l’appareil retient son réglage d’une partie à l’autre.',
      'Sur un appareil qui rame fort (moins de 15 images par seconde), le jeu propose une fois le réglage : la notification mène droit à lui.',
    ],
  },
  {
    version: '0.7.1', date: '2026-10-27', title: 'Plus de rechargement surprise',
    items: [
      'Sur iPhone, après une longue partie, l’écran pouvait devenir blanc et le jeu se relancer sur l’écran de chargement : Safari ferme une page qui garde trop de mémoire. Le jeu en garde désormais bien moins.',
      'Les bâtiments partagent leurs photos (béton, brique, verre, gazon…) au lieu d’en garder chacun une copie : une fois tous les niveaux vus, quatre fois moins de mémoire pour les textures, et un tiers de moins pour un complexe complet.',
      'Les séances d’entraînement réutilisent la même 3D d’une séance à l’autre ; pendant une séance, le complexe caché libère son image.',
      'Rien n’était perdu à ces rechargements, et rien ne le serait : la partie est enregistrée à chaque action et un match en cours reprend à la minute près.',
    ],
  },
  {
    version: '0.7.0', date: '2026-10-27', title: 'Le match façon FM',
    items: [
      'Plus de terrain en permanence pendant le match : le centre du match montre le score avec les buteurs, les statistiques en direct (possession, tirs, tirs cadrés, grosses occasions, buts attendus, arrêts, poteaux, cartons), les temps forts et le pronostic.',
      'Les notes des joueurs des deux équipes évoluent pendant le match : buts, passes décisives, tirs cadrés, arrêts, cartons, résultat. Tes joueurs gardent leur condition sous leur nom. Sur téléphone, onglets Stats, Notes et Le fil.',
      'La 3D seulement pour les temps forts : buts, penalties, expulsions, grosses occasions, arrêts et poteaux. Chaque action est construite comme une vraie (ouverture, contre, centre et tête, une-deux, corner, coup franc avec le mur, penalty…), filmée en plan large façon télé ; un but est suivi d’un ralenti. « Passer le temps fort » quand tu veux.',
      'Entre deux temps forts, la 3D ne tourne pas : le match est plus fluide et moins gourmand, sur PC comme sur iPhone.',
      'Des penalties pendant le match : environ un match sur quatre, réussis trois fois sur quatre. Ils ne changent pas le nombre de buts : ils en prennent une part.',
      'L’adversaire aligne de vrais joueurs (noms, postes selon son dispositif, numéros, visages), les mêmes à chaque rencontre de la saison, avec leurs buteurs, leurs passeurs et leurs notes.',
      'Pronostic encore plus juste : il compte désormais les expulsions encore à venir. Le petit écart qui restait sur les matchs très déséquilibrés a disparu (vérifié sur 60 000 matchs).',
      'En accéléré (×4), seulement les buts, les penalties et les expulsions, sans ralenti.',
      'Un match en cours au moment de la mise à jour reprend au coup d’envoi.',
    ],
  },
  {
    version: '0.6.1', date: '2026-10-27', title: 'Des visages qu’on retient, des recruteurs en mission',
    items: [
      'Nouveaux visages, toujours dessinés : forme du visage, yeux et leur couleur, nez, bouche, sourcils, oreilles, une vingtaine de coiffures (afro, tresses, dreadlocks, crête, dégradé, mulet…) et toutes sortes de barbes. Les cheveux grisonnent et le front se dégarnit avec l’âge ; la barbe d’un jeune vient avec les années.',
      'Un joueur sur cinq a un signe particulier : taches de rousseur, grain de beauté, cicatrice au sourcil, nez cassé, bandeau ou oreilles décollées.',
      'Le numéro de chaque joueur sur son maillot, dans le portrait (cartes, fiche, homme du match, bandeau du but).',
      'Un nom et un visage qui vont ensemble : l’origine du nom oriente un peu le visage, avec des mélanges comme dans la vie.',
      'Aucun sosie dans ton effectif : un joueur qui ressemblerait trop à un coéquipier arrive avec une coupe ou une barbe différente.',
      'Tes joueurs actuels gardent leur visage (teint, cheveux, coiffure, barbe), avec les nouveaux traits en plus.',
      'Académie : envoie tes recruteurs en mission sur un poste, un profil (technique, physique, mental) ou une région imaginaire, pour une à trois journées. Au retour, les plus prometteurs de tous les jeunes vus ; les chances affichées d’y trouver un grand potentiel sont exactes.',
      'Stats : nouvel onglet Pronostic. Sur tes propres matchs, les chances annoncées avant le coup d’envoi face aux résultats obtenus, tranche par tranche.',
    ],
  },
  {
    version: '0.6.0', date: '2026-10-27', title: 'L’Élite pro : aller-retour et vrais millions',
    items: [
      'Élite en aller-retour : quatorze journées, chaque adversaire reçu une fois et visité une fois. À l’extérieur, l’avantage du terrain passe chez l’adversaire (pronostic compris, vérifié sur vingt mille matchs) et seuls les droits TV reviennent au club.',
      'Calendrier, avant-match, après-match et Finances le disent : « Journée 4 / 14 · À l’extérieur », droits TV attendus, matchs restants à domicile et à l’extérieur.',
      'L’Élite change d’échelle, comme un grand championnat européen : droits TV et sponsors de plusieurs dizaines de millions, titulaires à plusieurs millions par an, stars à plus de dix millions, transferts à plusieurs dizaines de millions. Les petites divisions gardent leurs budgets modestes.',
      'Coupe d’Europe à vraie échelle : 15 M€ de participation, des primes de tour jusqu’à 30 M€ et 5 M€ de droits TV par match, plus de cent millions pour le vainqueur. Les clubs européens affichent leur budget (de 150 à 800 M€), et ils sont un peu plus forts.',
      'Mercato : les géants européens suivent tes stars d’Élite, surtout quand tu joues la Coupe d’Europe. Leurs offres dépassent largement la valeur, et une offre spontanée peut la dépasser de moitié.',
      'Sponsors versés à la reprise, dès la deuxième saison : un club promu touche tout de suite ceux de sa nouvelle division, de quoi se renforcer avant d’affronter des salaires bien plus lourds.',
      'En Élite, le calendrier est chargé : chaque séance d’entraînement compte pour deux tiers, l’académie repère ses jeunes toutes les deux journées et ils progressent moitié moins par journée. Autant de progrès par saison qu’ailleurs.',
      'Objectifs du conseil à l’échelle de la saison d’Élite (deux fois plus de victoires, de buts ou de cages inviolées) ; l’arène fermée coûte désormais 55 M€, puis 140 M€ pour la version agrandie.',
      'Calendrier : la qualification affichée en coupe est exacte, comme à l’avant-match (un nul y comptait pour une demi-qualification).',
      'Ta partie en cours : déjà en Élite, ta trésorerie et tes offres en cours passent à la nouvelle échelle, comme les salaires. La saison en cours garde ses sept journées ; l’aller-retour commence à la suivante.',
    ],
  },
  {
    version: '0.5.1', date: '2026-10-27', title: 'Pronostic vérifié, match repris, entraînement délégué',
    items: [
      'Pronostic vérifié sur vingt mille matchs : un match annoncé à 70-80 % de victoire (74,7 % en moyenne) est gagné 75,2 % du temps, et le pronostic du direct tombe aussi juste à chaque minute.',
      'Quand tu passes la fin d’une mi-temps, le staff remplace un blessé (s’il reste un changement) : l’équipe ne finit plus à dix, et le pronostic reste exact.',
      'Si l’app se ferme pendant un match, il reprend à la minute près à la réouverture, avec le même score et la même suite (rien n’est rejoué). L’écran titre l’annonce sous « Continuer ».',
      'Centre d’entraînement : nouveau réglage « Confier les séances au staff ». Avant chaque match, il simule les épreuves que tu n’as pas faites, avec les joueurs choisis (par défaut, les conseillés) ; plus de rappel de séance.',
      'Fatigue : chaque date rend un peu moins de condition (18 à 24 points selon l’âge, +1,5 par niveau du centre d’entraînement). Un titulaire qui joue tout finit par s’user : fais tourner, « Meilleur onze » s’en charge.',
      'Le président, c’est toi : les objectifs de la saison viennent désormais du conseil d’administration.',
    ],
  },
  {
    version: '0.5.0', date: '2026-10-27', title: 'Une progression qui se mérite',
    items: [
      'Académie : un ou deux jeunes repérés par journée selon son niveau (jusqu’à six avant), aux potentiels réalistes. Au niveau 5, moins de deux jeunes par saison peuvent viser 18 ou plus, et un 20 est rare. Les fourchettes affichées (niveau à l’arrivée, potentiel) sont celles du tirage.',
      'Les jeunes progressent plus lentement, à l’académie comme en équipe première : un grand espoir a besoin de plusieurs saisons pour éclore. Fini l’équipe de prodiges de 19 ans.',
      'Centre d’entraînement : les séances et la séance collective font progresser environ deux fois et demie moins vite. Jouer l’épreuve reste plus payant que la simuler.',
      'Mercato : le marché suit le niveau de ta division (il était trop fort en Départementale, trop faible en Élite). Un joueur libre demande une prime de 70 % de sa valeur.',
      'Une recrue, comme un jeune monté de l’académie, ne peut être vendue qu’après quatre journées de championnat au club : fini l’achat-revente qui rapportait des millions.',
      'Coupe d’Europe : des adversaires au niveau des meilleurs clubs d’Élite, plus forts à chaque tour. La gagner devient un exploit.',
      'Avant-match : le niveau de ton onze tient compte de la fatigue, comme les chances affichées (« fatigue −0,4 » à côté quand des titulaires ne sont pas frais).',
      'Coupes : la qualification affichée est exacte, avec ta chance de gagner une séance de tirs au but (finition de tes tireurs, réflexes de ton gardien).',
      'Objectifs du président : ils se fixent sur ton meilleur onze, pas sur l’onze du moment.',
      'Ta partie en cours garde ses joueurs et ses jeunes ; les nouvelles règles valent pour tout ce qui arrive désormais (jeunes repérés, marché, entraînement, coupes).',
    ],
  },
  {
    version: '0.4.3', date: '2026-10-25', title: 'Condition en pourcentage sur le terrain',
    items: [
      'Composition, avant-match, mi-temps et changement en direct : le pourcentage de condition s’affiche sous chaque joueur, même quand il est au vert.',
      '3-5-2 et 5-3-2 : joueurs un peu mieux espacés, pour qu’aucune note ne cache la condition d’un voisin (sur téléphone comme sur PC).',
    ],
  },
  {
    version: '0.4.2', date: '2026-10-25', title: 'Réponses et chances justes à la Direction',
    items: [
      'Direction › Salaires : quand un joueur refuse une baisse qu’il avait déjà acceptée une saison passée, l’écran annonce bien un refus (il gardait « accepte »). Sa baisse déjà obtenue reste.',
      'Direction et centre médical : la jauge n’écrit 0 % ou 100 % que si c’est certain ; 99,6 % s’affiche 99 %, comme au mercato.',
    ],
  },
  {
    version: '0.4.1', date: '2026-10-25', title: 'Navigation au doigt entre les sections',
    items: [
      'Sur téléphone, glisse un panneau vers la gauche ou la droite pour passer à la section voisine : Équipe, Mercato, Saison, Club.',
      'Une barre en bas de chaque panneau, à portée du pouce, fait la même chose : « ‹ Équipe » à gauche, « Saison › » à droite, et des points qui disent où tu es.',
      'Revenir à une section la rouvre sur l’écran que tu y avais laissé (Classement, Journal…).',
      'Le bouton Retour du navigateur (ou de la souris, ou d’Android) ferme la fiche ou le panneau ouvert au lieu de quitter le jeu.',
      'Composition : glisser un joueur vers le bas ne ferme plus tout le panneau.',
    ],
  },
  {
    version: '0.4.0', date: '2026-10-25', title: 'Centre médical',
    items: [
      'Nouveau bâtiment : le centre médical. Entre deux matchs, fais soigner tes blessés : un soin par joueur et par date, avec sa chance exacte de le faire revenir un match plus tôt (une blessure légère soignée, il est disponible pour le prochain match).',
      'Sa prévention réduit aussi le risque de blessure en match : −8 % par niveau, jusqu’à −40 %.',
      'Nouvel onglet « Médical » dans l’Équipe ; la notification des blessés y mène une fois le centre construit.',
      'Construction conseillée : l’académie passe juste après le centre d’entraînement, avant l’espace supporters.',
    ],
  },
  {
    version: '0.3.17', date: '2026-10-25', title: 'Réponse claire aux baisses de salaire',
    items: [
      'Direction › Salaires : après ta proposition, la réponse du joueur s’affiche à sa place (accord et nouveau salaire, ou refus) ; plus de bouton « Proposer » qui menait à « Négociation impossible ».',
    ],
  },
  {
    version: '0.3.16', date: '2026-10-25', title: 'Fiche joueur visible depuis les Stats',
    items: [
      'Statistiques : « Voir sa fiche joueur » depuis une fiche carrière affiche bien la fiche (elle s’ouvrait derrière la carrière) ; la fermer ramène à la carrière.',
    ],
  },
  {
    version: '0.3.15', date: '2026-10-25', title: 'Notes entières sur le terrain',
    items: [
      'Composition, changement en direct et mi-temps : la note posée sur le portrait des joueurs n’est plus rognée par ses coins en biais (11,6).',
    ],
  },
  {
    version: '0.3.14', date: '2026-10-25', title: 'Notes entières au mercato',
    items: [
      'Mercato : la note posée sur le portrait d’un joueur s’élargit avec elle ; une note à deux chiffres (10,5) n’est plus rognée.',
    ],
  },
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
      'Les stars de l’Élite coûtent vraiment cher ; salaires et entretien se paient à chaque journée.',
      'La réputation se gagne selon la division et s’oublie un peu chaque été ; nouveaux statuts jusqu’à « Club de légende » à 80.',
      'Effectif de départ au milieu de la Départementale, haut de l’Élite relevé, recruteurs et notoriété qui attirent des joueurs jusqu’à 19.',
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
