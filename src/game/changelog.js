import { t } from '../i18n/index';
// Nouveautés du jeu, de la plus récente à la plus ancienne : l'historique des versions. Plus aucun écran ne les affiche
// depuis la 1.0.1 (écran titre retiré en 1.0, menu pause en 1.0.1, demandes du PDG).
// La version courante est celle de package.json (__APP_VERSION__), à faire avancer avec chaque entrée ajoutée ici.

export const CHANGELOG = [
  {
    version: '1.0.13', date: '2026-10-31', title: t('Un vrai son d’écriture'),
    items: [
      t('Écrire le nom de ton club fait le clic doux d’une touche, toujours le même ; effacer a son propre son, plus grave.'),
    ],
  },
  {
    version: '1.0.12', date: '2026-10-31', title: t('La note des négociations'),
    items: [
      t('Négociations : monter et descendre jouent la note douce du milieu de la jauge du salaire, la même pour toutes les sommes et tous les choix.'),
    ],
  },
  {
    version: '1.0.11', date: '2026-10-31', title: t('Des sons qui s’entendent'),
    items: [
      t('Les sons du jeu passent nettement au-dessus de la musique : les sons du menu montent beaucoup, le stade et les entraînements aussi.'),
      t('Négociations : salaire, prime, curseurs, durée et clause jouent tous la même note douce pour monter, et une autre pour descendre.'),
    ],
  },
  {
    version: '1.0.10', date: '2026-10-30', title: t('Fondation, sons et réglages'),
    items: [
      t('Au téléphone, l’écran « Fonde ton club » tient en entier : « Fonder le club » et « Retour » côte à côte, sans défiler, et plus rien ne se superpose.'),
      t('Réglages : le volume des sons se règle sur sa propre jauge, à côté de celle de la musique.'),
      t('Chaque lettre du nom de ton club se tape avec un petit son feutré.'),
      t('Les boutons − et + des sommes (offres, salaires, primes, prix) jouent une note douce qui monte avec la somme.'),
      t('Le tutoriel est mené par ta direction sportive.'),
    ],
  },
  {
    version: '1.0.9', date: '2026-10-30', title: t('Une musique discrète'),
    items: [
      t('Sur iPhone, la musique n’apparaît plus comme un morceau dans le lecteur du téléphone (écran verrouillé, haut de l’écran) : elle fait partie du jeu, comme ses autres sons.'),
      t('Elle n’interrompt plus ta propre musique et se tait quand l’iPhone est en mode silencieux.'),
      t('L’écran titre n’affiche plus que la version du jeu.'),
    ],
  },
  {
    version: '1.0.8', date: '2026-10-30', title: t('La musique dès le chargement'),
    items: [
      t('La musique démarre dès l’écran de chargement quand le navigateur le permet ; sinon, au premier toucher de l’écran, que l’écran de chargement propose.'),
    ],
  },
  {
    version: '1.0.7', date: '2026-10-30', title: t('La jauge de la musique'),
    items: [
      t('Réglages : le volume de la musique se règle sur une jauge, au doigt ou à la souris, et avec les flèches ou la manette.'),
    ],
  },
  {
    version: '1.0.6', date: '2026-10-30', title: t('La musique du jeu'),
    items: [
      t('La musique de FootOFF Empire joue en fond, douce, à l’écran titre et dans le complexe. Elle s’efface pendant les matchs et reprend ensuite. Son volume se règle dans les Réglages.'),
    ],
  },
  {
    version: '1.0.5', date: '2026-10-30', title: t('Offres claires entre amis'),
    items: [
      t('Une offre pour un joueur qui a déjà quitté le club de ton ami est refusée d’office, et tu sais pourquoi.'),
    ],
  },
  {
    version: '1.0.4', date: '2026-10-30', title: t('Les effectifs des amis en direct'),
    items: [
      t('Championnats entre amis : chaque club publie son effectif quand il change. L’onglet Amis du mercato suit tout : achats, ventes hors de la ligue, joueurs libérés, blessures.'),
    ],
  },
  {
    version: '1.0.3', date: '2026-10-30', title: t('Les couleurs du match'),
    items: [
      t('Temps forts en 3D : un code couleur discret, façon télé, à côté du nom de chaque équipe dans le score, pour savoir qui joue en quelle couleur.'),
    ],
  },
  {
    version: '1.0.2', date: '2026-10-30', title: t('Le mercato entre amis'),
    items: [
      t('Championnats entre amis : plus jamais d’offre au nom du club d’un ami qui ne l’a pas faite. Les clubs qui achètent tes joueurs mis en vente viennent d’en dehors de la ligue.'),
      t('Le mercato a un onglet Amis : l’effectif de chaque ami, club par club, et une offre en un geste, dès avant la première journée.'),
    ],
  },
  {
    version: '1.0.1', date: '2026-10-30', title: t('Heure limite en vue'),
    items: [
      t('Championnats entre amis : au-dessus du prochain match, l’heure limite de la journée, le temps qui reste pour valider ton équipe, et qui a validé ou pas encore.'),
      t('Une journée jouée en avance, parce que tout le monde avait validé, laisse jusqu’au lendemain pour la suivante.'),
      t('Le menu pause va à l’essentiel : plus d’entrée Nouveautés.'),
    ],
  },
  {
    version: '1.0', date: '2026-10-30', title: t('La version publique'),
    items: [
      t('FootOFF Empire passe en version 1.0, sa version publique. L’écran titre va à l’essentiel : les nouveautés se lisent depuis le menu pause.'),
      t('Monter se mérite : les adversaires de Départementale, de Régionale et de Nationale sont plus forts, en championnat comme en Coupe nationale. Un bon président quitte la Départementale vers sa troisième saison. Dans une partie en cours, ces adversaires renforcés arrivent à la saison suivante.'),
      t('La division ouvre les niveaux des bâtiments : jusqu’au niveau 2 en Départementale, 3 en Régionale, 4 en Nationale et 5 en Élite, avec l’arène du stade. Un bâtiment déjà plus haut le reste.'),
      t('À la manette, on choisit enfin un poste ou un remplaçant dans la composition, avant le match comme pendant les changements.'),
      t('Les fautes qui valent un carton rouge tombent hors de la surface : plus de faute qui mériterait aussi un penalty.'),
      t('Au ralenti, les panneaux FootOFF Media du bord du terrain se lisent à l’endroit, des quatre côtés du stade.'),
      t('En anglais, en espagnol et en arabe, plus d’espace avant les deux-points dans les fiches des bâtiments, de l’académie, du mercato et de l’entraînement.'),
    ],
  },
  {
    version: '0.8.24', date: '2026-10-30', title: t('Des appuis de footballeur'),
    items: [
      t('À chaque foulée, l’avant du pied reste planté au sol et le talon pivote autour, comme chez un vrai footballeur : les pieds ne glissent presque plus et ne s’enfoncent plus dans la pelouse.'),
      t('Nouvelles foulées à reculons et de côté, en marchant, en trottinant et en courant ; demi-tours sur un appui, buste penché dans les virages et à l’accélération.'),
      t('Tous les joueurs suivent le ballon du regard, de la tête et du haut du corps.'),
      t('Les gardiens font face au jeu en permanence, se déplacent en pas chassés et choisissent leur arrêt : prise basse, à mi-hauteur ou en l’air, arrêt du corps, plongeon, saut manqué. Le geste part dès la frappe et les mains arrivent sur le ballon au bon moment.'),
      t('Les frappes montrent enfin le vrai coup de pied, au moment exact du contact avec le ballon.'),
      t('Les expulsions se lisent d’un coup d’œil : le fautif tacle, le joueur fauché reste au sol, le fautif se relève à côté de lui et le carton rouge s’affiche juste au-dessus du fautif. Au ralenti, la caméra garde toujours des joueurs dans le cadre.'),
    ],
  },
  {
    version: '0.8.23', date: '2026-10-29', title: t('La langue au départ, chacun ses couleurs'),
    items: [
      t('Nouvelle partie : la langue se choisit juste après, une seule fois par partie. Elle n’est plus proposée à l’écran titre.'),
      t('Championnats entre amis : chaque club joue à ses couleurs, et le tien garde toujours les siennes, à domicile comme à l’extérieur. En déplacement, ton équipe ne joue plus en tenue de secours face à un adversaire habillé à tes couleurs.'),
    ],
  },
  {
    version: '0.8.22', date: '2026-10-29', title: t('Le direct ne se fige plus'),
    items: [
      t('Le direct ne s’arrête plus avant un temps fort : un événement tombé juste avant (l’occasion de l’autre équipe à la même minute, un carton, un mot du commentateur) figeait l’horloge pour de bon, à ×1 comme à ×4, en solo comme en ligue. Il s’affiche maintenant juste avant le temps fort.'),
    ],
  },
  {
    version: '0.8.21', date: '2026-10-29', title: t('Des temps forts plus vrais'),
    items: [
      t('Les gardiens portent enfin leur tenue : manches longues à la couleur de leur maillot et gants.'),
      t('La défense se place mieux : seule sa dernière ligne recule devant l’attaquant le plus avancé, le milieu tient sa ligne devant elle.'),
      t('Sur une passe en profondeur, les défenseurs les plus proches se retournent et courent vers leur but.'),
      t('Le tireur se tourne vers le but en armant sa frappe, et un joueur qui recule fait des pas en arrière au lieu de glisser.'),
      t('Après un but, le buteur célèbre à l’approche du coin et ses coéquipiers le rejoignent ; le ralenti repart de l’action, sans la célébration.'),
    ],
  },
  {
    version: '0.8.20', date: '2026-10-29', title: t('Le match d’abord'),
    items: [
      t('Championnats entre amis : le score se découvre en regardant son match. Le bouton « Regarder » s’illumine, et les résultats et le classement de la journée restent cachés tant que tu ne l’as pas vu.'),
      t('Dès que tout le monde a validé, les équipes sont verrouillées : plus de retouche pendant le compte à rebours, et le mercato rouvre après la journée.'),
      t('Mi-temps d’un match de ligue : le résumé de la première période, ses temps forts et les changements prévus par les plans de mi-temps des deux clubs.'),
      t('Séances confiées au staff : il entraîne à chaque séance les joueurs conseillés, ou celui d’un programme de signe ; un joueur choisi à la main ne vaut que pour la séance en cours.'),
      t('Écran titre sur PC : le menu ne déborde plus sur le logo ni sur les rappels des touches, même avec un club de ligue en plus.'),
      t('En arabe : les noms des clubs autour des écussons s’écrivent correctement, le potentiel des joueurs ne se coupe plus, le badge de titulaire et le nom du club tiennent dans leur cadre, et « Nouvelle partie » est mieux traduit.'),
      t('Portraits : les visages correspondent mieux aux noms des joueurs, dans toutes les langues ; ceux qui ne collaient pas sont redessinés.'),
    ],
  },
  {
    version: '0.8.19', date: '2026-10-29', title: t('Jouable à la manette'),
    items: [
      t('Le jeu se joue entièrement à la manette : croix ou stick gauche pour se déplacer, A pour valider, B pour revenir, X pour bâtir, Y pour jouer, LB et RB pour changer de section, clic des sticks pour passer d’un bâtiment à l’autre, stick droit et gâchettes pour la caméra.'),
      t('Un cadre doré montre ce qui est choisi et un rappel des boutons s’affiche à l’écran. Rien ne change au clavier, à la souris ni au doigt.'),
      t('Construire ou améliorer un bâtiment ne fige plus l’image : un anneau doré tourne au sol du chantier le temps que le bâtiment se prépare.'),
      t('En arabe, l’écran de chargement s’écrit de droite à gauche dès la première image, sa barre se remplit depuis la droite, et le logo garde partout sa forme officielle.'),
      t('Sur téléphone, les explications du menu de l’écran titre ne sont plus coupées, et sur tablette le pronostic de la carte du prochain match ne déborde plus.'),
    ],
  },
  {
    version: '0.8.18', date: '2026-10-29', title: t('Des joueurs en 3D réalistes'),
    items: [
      t('Pendant les temps forts, les joueurs ont de vrais corps : des carrures moins massives, des tailles qui changent selon le poste, et des visages tous différents.'),
      t('Chaque joueur ressemble à son portrait : même teint, même coiffure, même barbe ou moustache, cheveux gris compris.'),
      t('Une vraie tenue : maillot ajusté avec col et bords de manches à la couleur secondaire du club, short droit, chaussettes et chaussures.'),
      t('Les foulées suivent la vitesse réelle de chaque joueur, ralentis compris : plus personne ne court sur place, et frappes, arrêts et célébrations se rejouent eux aussi au ralenti.'),
    ],
  },
  {
    version: '0.8.17', date: '2026-10-29', title: t('FootOFF sur les réseaux'),
    items: [
      t('Les comptes officiels de FootOFF (Instagram, TikTok, YouTube, X et LinkedIn) au pied de l’écran titre et dans les réglages, section « Suivre FootOFF ».'),
    ],
  },
  {
    version: '0.8.16', date: '2026-10-29', title: t('Des écrans plus nets'),
    items: [
      t('Succès : un total et une tuile par famille qui filtre la liste, le choix Tous, Obtenus ou À obtenir, la date d’obtention sous chaque succès et la progression des succès à compteur.'),
      t('Mercato : des cartes de joueurs compactes, deux à trois fois plus de joueurs par écran de téléphone, et des filtres rangés : recherche et tri, postes, puis bascules.'),
      t('Au téléphone, debout comme couché, un glissement parti du bord de l’écran ne fait plus défiler la page vers l’écran d’avant ou d’après, sur tous les écrans du jeu et plus seulement en match.'),
    ],
  },
  {
    version: '0.8.15', date: '2026-10-29', title: t('Des temps forts plus vrais'),
    items: [
      t('Le hors-jeu est respecté : la défense ne laisse aucun attaquant partir dans son dos avant la passe, et l’attaquant règle sa course sur l’avant-dernier défenseur.'),
      t('Plus personne ne regarde l’action sans bouger : chacun se démarque, deux coéquipiers proposent une solution au porteur, la défense coulisse et ajuste ses pas, et ça bouge dans la surface sur un corner.'),
      t('Les gardiens ferment l’angle, sortent quand le ballon est loin et se mettent en position d’attente avant la frappe ; ils plongent bras tendus et gardent le ballon serré contre eux.'),
      t('Sur une passe au sol, le receveur se place sur la trajectoire et s’étire pour contrôler au lieu de voir le ballon filer ; sur un ballon libre, le coéquipier le plus proche y va.'),
      t('Pour une tête, les joueurs prennent leur élan bras en avant.'),
    ],
  },
  {
    version: '0.8.14', date: '2026-10-29', title: t('Le jeu en anglais, en espagnol et en arabe'),
    items: [
      t('FootOFF Empire se joue maintenant en français, en anglais, en espagnol et en arabe. La langue proposée est celle du site footoff.media ; l’entrée « Langue » de l’écran titre permet d’en choisir une autre.'),
      t('Chaque langue a ses propres noms de joueurs et de clubs, aussi nombreux et variés qu’en français. Une partie garde la langue de sa fondation : ses joueurs ne changent jamais de nom.'),
      t('En arabe, tout le jeu se lit de droite à gauche : menus, fiches, tableaux, flèches et glissés du doigt. Le terrain, lui, garde ses côtés : un arrière gauche reste à gauche.'),
      t('Les entraînements en 3D, les panneaux du complexe et les plaques des trophées parlent aussi la langue choisie.'),
    ],
  },
  {
    version: '0.8.13', date: '2026-10-29', title: t('Le jeu au téléphone couché'),
    items: [
      t('Le jeu se joue aussi au téléphone couché. Écran titre : le menu à gauche, ton complexe à droite. Complexe : le club et la trésorerie sur une ligne en haut, le menu et le prochain match côte à côte en bas, la 3D dégagée au milieu.'),
      t('Équipe, Mercato, Saison et Club s’ouvrent en plein écran sous un bandeau compact : le titre et les onglets sur une ligne, avec la trésorerie quand elle sert. On passe d’une section à l’autre d’un glissé du doigt. La composition se dessine sur un grand terrain couché.'),
      t('En match, les temps forts passent en plein écran sous un score façon télé resserré ; entre deux, le centre du match reste compact, avec Stats, Notes et Le fil en onglets sur les petits téléphones. Avant-match, mi-temps et après-match gardent leurs boutons toujours visibles.'),
      t('Écusson : le nom s’écrit tel que tu l’as choisi, « FC » compris, tant qu’il reste lisible, sans perdre de lettres au bout du ruban ; le losange moderne porte maintenant un ruban avec le nom, l’année ou les deux.'),
      t('Correction : la pastille des couleurs de l’écusson n’est plus rognée en haut et en bas.'),
    ],
  },
  {
    version: '0.8.12', date: '2026-10-29', title: t('Recruteurs en mission, nouvelles à chaque repérage'),
    items: [
      t('Les missions des recruteurs n’ont plus de régions : ils cherchent un poste ou un profil (technique, physique, mental), pendant deux, trois ou quatre repérages.'),
      t('Une mission voit deux fois plus de jeunes qu’autant de repérages ordinaires et en ramène davantage : jusqu’à six des seize jeunes vus, sur quatre repérages. Les chances affichées d’y trouver un grand potentiel restent exactes.'),
      t('Mission en cours visible : à chaque repérage, une notification et une ligne à l’académie disent combien de jeunes ils ont observés et ce que vaut le plus prometteur (un bon élément, un beau potentiel, un talent rare), sans dévoiler son potentiel.'),
      t('Corrections : « des milieux » s’écrit correctement, et une mission lancée avant cette version revient normalement.'),
    ],
  },
  {
    version: '0.8.11', date: '2026-10-28', title: t('Objectifs et succès repensés'),
    items: [
      t('Le parcours de carrière remplace la « Grande étape » : sept chapitres de la vie du club, sur plusieurs saisons (notoriété, stade à guichets fermés, académie, Europe), chacun avec sa prime versée dès qu’il est accompli. Il ne répète jamais un objectif du conseil. En ligue entre amis, un parcours à part : derbys, notoriété, titres.'),
      t('Les objectifs du conseil restent trois par saison, sans doublon avec le parcours.'),
      t('Vingt-sept nouveaux succès, rangés en familles : matchs et exploits, joueurs et académie, complexe et finances, ligue entre amis. Une ligue entre amis n’affiche que les succès qu’elle peut gagner.'),
      t('Dans la salle des trophées, le nouvel onglet Carrière montre chaque chapitre : accompli, en cours avec son avancée, ou à venir.'),
    ],
  },
  {
    version: '0.8.10', date: '2026-10-28', title: t('Match sans détour'),
    items: [
      t('En plein match et à l’avant-match, glisser le doigt depuis le bord de l’écran ne ramène plus en arrière ; les boutons du bord répondent toujours.'),
      t('L’avant-match n’affiche plus les signes distinctifs de l’adversaire : ils comptent toujours en match et dans le pronostic.'),
    ],
  },
  {
    version: '0.8.9', date: '2026-10-28', title: t('Vitesse du match'),
    items: [
      t('Un seul bouton de vitesse, qui dit où tu en es : « ×1 » à vitesse normale, « ×4 » sur fond or quand le match est accéléré. Un toucher bascule de l’un à l’autre.'),
      t('À ×4, seul le jeu entre deux temps forts file plus vite : tous les temps forts s’affichent, à vitesse normale, avec le ralenti des buts.'),
    ],
  },
  {
    version: '0.8.8', date: '2026-10-28', title: t('Économie, négociation et couleurs'),
    items: [
      t('Salaires et entretien se comptent à chaque journée et se paient en une fois au bilan de la saison. La trésorerie montre ce qu’il faudra payer en fin de saison et ce qui est réellement disponible ; un achat qui entamerait ce qui est déjà dû est signalé avant d’être conclu.'),
      t('Entre amis, la négociation est libre : accepte, fais une contre-offre ou refuse, chacun à son tour, trois contre-offres au plus. Chacun peut rompre à tout moment.'),
      t('Depuis le classement, chaque club ouvre son effectif : poste, âge, niveau et valeur (celui d’un ami après son premier match joué). Le joueur d’un ami ouvre directement l’offre, celui d’un club de l’ordinateur sa fiche du mercato.'),
      t('Dans l’onglet Bilan du mercato, les transferts des amis de la saison en cours et de la précédente : le joueur, ses clubs de départ et d’arrivée, le montant et la journée ; les tiens en or.'),
      t('Ton écusson à tes couleurs, à la fondation du club ou en rejoignant un championnat : la couleur principale habille le maillot, la secondaire le short. Si deux maillots se ressemblent, l’adversaire change de tenue. L’or et le noir restent le choix par défaut.'),
      t('« Onze frais » remplace « Onze en forme » : les meilleurs joueurs à 80 % de condition ou plus. La forme ne pèse plus en match : seules la condition physique et les capacités comptent.'),
      t('Corrections : le vrai écusson de chaque ami sur tous les écrans, plus de conflit de sauvegarde en revenant sur le même appareil, le but d’un ami n’est plus annoncé à ton nom dans un match revu, une seule ligne par joueur pour tes offres refusées, le score du bandeau de but n’est plus rogné au téléphone, « Jouer » ne recouvre plus les chances de victoire, et « Retour » est en tête des réglages.'),
    ],
  },
  {
    version: '0.8.7', date: '2026-10-28', title: t('Temps forts façon retransmission'),
    items: [
      t('Hors coups de pied arrêtés, chaque temps fort part d’une vraie situation, une relance ou une récupération, et se construit en quelques passes jusqu’au geste décisif : 8 à 12 secondes de jeu.'),
      t('Le ballon ne se téléporte plus : un joueur ne le contrôle qu’à sa portée, et s’il le manque, il court après.'),
      t('Réalisation façon télévision : un plan large du stade entre deux temps forts, un plan qui se resserre à l’approche de la surface et, après un but, le ralenti filmé derrière la cage ou au ras de la pelouse.'),
    ],
  },
  {
    version: '0.8.6', date: '2026-10-28', title: t('Championnats entre amis en direct'),
    items: [
      t('Dès que tous les amis ont validé leur équipe, un compte à rebours de dix minutes remplace « Validée » chez chacun ; à zéro, le match se regarde, sans quitter le jeu. L’heure fixée par le créateur reste la limite.'),
      t('Un ami qui rejoint, une équipe validée, une offre reçue ou la réponse à la tienne : tout se voit en quelques secondes. Le bouton Actualiser, en haut de la carte du championnat, relit tout à la demande.'),
      t('Le créateur peut supprimer son championnat pour tout le monde, en tapant son nom pour confirmer.'),
      t('En match et à l’avant-match, glisser le doigt sur le côté ne fait plus apparaître d’autres écrans.'),
    ],
  },
  {
    version: '0.8.5', date: '2026-10-28', title: t('Signes distinctifs et fatigue'),
    items: [
      t('Les signes distinctifs pèsent vraiment : un Finisseur transforme 50 % d’occasions de plus, face à un Chat l’adversaire en transforme 12 % de moins, et face à un Roc il s’en crée 10 % de moins. Chaque signe est chiffré sur la fiche du joueur.'),
      t('Les adversaires ont leurs signes, eux aussi : tu les vois à l’avant-match, et le pronostic en tient compte.'),
      t('Trois boutons, toujours visibles, pour composer ton onze : « Meilleur onze » (les meilleures notes), « Onze en forme » (notes, condition et forme réunies) et « Faire tourner » (les remplaçants du dernier match jouent).'),
      t('La fatigue se voit et se gère : l’après-match montre la condition de chacun au coup de sifflet, puis au prochain match. Un titulaire qui enchaîne descend autour de 75 %, entre 50 et 90 % selon son âge, son endurance et ton centre d’entraînement.'),
    ],
  },
  {
    version: '0.8.4', date: '2026-10-28', title: t('Tactique et effectif'),
    items: [
      t('Change de dispositif à la mi-temps, ou à n’importe quel arrêt de jeu : tes joueurs se replacent au mieux et le pronostic suit. Le bouton « Changement » reste utile même sans changement restant (dispositif, tactique, postes).'),
      t('Après un carton rouge, déplace l’expulsé sur le poste que tu veux laisser vide (jamais celui du gardien) : le poste choisi compte vraiment dans le match.'),
      t('Les tactiques se paient : attaquer rapporte quand tu es plus fort, l’équilibrée est le bon choix à niveau égal, le bloc bas face à un adversaire bien plus fort.'),
      t('Ton effectif ne descend jamais sous 13 joueurs : la vente est refusée à 13, et si une fin de contrat te fait passer en dessous, le jeune le plus utile de ton académie monte d’office.'),
    ],
  },
  {
    version: '0.8.3', date: '2026-10-28', title: t('Championnats entre amis'),
    items: [
      t('Le Siège de la Ligue ouvre ses portes : crée un championnat entre amis (bâtiment de l’Élite), ou rejoins celui d’un ami par son lien d’invitation. Ni compte ni e-mail : un pseudo et ton club suffisent.'),
      t('Huit clubs, une journée par jour à l’heure choisie par le créateur. Les places libres reviennent à des clubs de l’ordinateur qui construisent, recrutent et adaptent leur tactique à l’adversaire.'),
      t('Plans de mi-temps : le match se joue sans toi. Prépare ce que fait ton staff à la pause selon le score (tu mènes, égalité, tu es mené) : dispositif, tactique et jusqu’à cinq changements.'),
      t('Mercato de la ligue : les joueurs libres et ceux des clubs de l’ordinateur se négocient comme en solo, et le premier club qui conclut signe le joueur. Une offre à un ami part aussitôt ; acceptée, le transfert est immédiat.'),
      t('Ton club de ligue est sauvegardé en ligne : tu le retrouves sur un autre appareil.'),
    ],
  },
  {
    version: '0.8.2', date: '2026-10-28', title: t('Un staff plus juste'),
    items: [
      t('Un conseil du staff que tu masques reste masqué, même quand tu recharges le jeu, jusqu’à ce que la situation change. Quand il n’a rien d’utile à dire, le staff se tait.'),
      t('Le stade : le staff n’en parle plus que lorsque l’agrandissement est dans tes moyens, une fois par niveau ; la pastille du stade ne s’allume plus que dans ce cas.'),
      t('L’académie : la pastille de la détection s’éteint dès que tu l’as regardée, jusqu’au prochain repérage. Les jeunes qui partiront à l’intersaison ne sont signalés qu’en seconde moitié de saison.'),
      t('Nouveaux rappels : les droits TV de la saison à négocier (Direction), les blessés à soigner (centre médical), les programmes de signes à lancer (centre d’entraînement), les recruteurs à envoyer en mission (académie).'),
      t('L’onglet « Pronostic » des Statistiques disparaît. Le panneau Pronostic de l’avant-match devient opaque, le classement compte les quatorze journées de l’Élite, et le nom de la division prend son accent.'),
    ],
  },
  {
    version: '0.8.1', date: '2026-10-28', title: t('Forme, rotation et matchs à l’extérieur'),
    items: [
      t('La forme compte désormais en match : un joueur en grande forme joue un peu mieux, un joueur en méforme un peu moins bien. « Meilleur onze » en tient compte, avec la condition physique.'),
      t('Nouveau bouton « Faire tourner », avant le match et dans la Composition : les titulaires fatigués (sous 75 %) laissent leur place aux remplaçants reposés de leur poste.'),
      t('À l’extérieur, l’équipe qui reçoit passe à gauche, partout : calendrier, avant-match, match en direct, après-match et statistiques, avec le score dans l’ordre du football.'),
      t('La saison en cours s’affiche sur les écrans de contrat (négociation, fiche du joueur, Direction) et dans l’en-tête de l’Équipe.'),
    ],
  },
  {
    version: '0.8.0', date: '2026-10-28', title: t('Contrats et salaires'),
    items: [
      t('Chaque joueur a maintenant un contrat : un salaire par saison, une durée, parfois une clause de montée. Le salaire reste fixe pendant le contrat : seules une prolongation, la clause de montée ou une descente le changent.'),
      t('Recruter un joueur sous contrat se fait en deux temps : l’indemnité avec son club, puis son contrat avec lui (salaire, durée, prime à la signature, clause de montée), avec la chance exacte qu’il signe. Un joueur libre se négocie directement.'),
      t('Prolonge depuis la fiche du joueur ou le nouvel onglet Contrats de la Direction. Sans prolongation, un joueur part libre à la fin de son contrat, sans indemnité.'),
      t('Tes joueurs reçoivent un contrat de deux à quatre ans à leur salaire actuel : personne ne part à la fin de cette saison.'),
    ],
  },
  {
    version: '0.7.8', date: '2026-10-27', title: t('Une huitième parcelle'),
    items: [
      t('Le complexe compte maintenant huit parcelles : trois à l’est, comme à l’ouest. Tes bâtiments de l’est se décalent un peu, rien d’autre ne change.'),
      t('La nouvelle parcelle est libre : elle accueillera bientôt un bâtiment de prestige, réservé à l’Élite.'),
    ],
  },
  {
    version: '0.7.7', date: '2026-10-27', title: t('Plein écran sur PC'),
    items: [
      t('Nouveau réglage « Plein écran » sur PC (Réglages, à l’écran titre et dans le menu pause) : le jeu occupe tout l’écran, sans la barre du navigateur.'),
      t('Échap pour en sortir. Laissé allumé, il revient à ton premier clic quand tu rouvres le jeu (le navigateur attend toujours un geste de ta part).'),
    ],
  },
  {
    version: '0.7.6', date: '2026-10-27', title: t('C’est toi qui vends'),
    items: [
      t('Quand un club accepte ta demande en négociation, la vente ne se fait plus toute seule : son offre passe à ton prix et c’est toi qui choisis, « Vendre » ou « Refuser ». L’accord vaut jusqu’à la prochaine journée.'),
      t('De même après le dernier mot d’un club : les deux boutons, côte à côte, en bas de la négociation.'),
      t('Dans les offres reçues, « Refuser » est un vrai bouton, de la même taille que « Accepter » et « Négocier ».'),
    ],
  },
  {
    version: '0.7.5', date: '2026-10-27', title: t('Une composition plus grande'),
    items: [
      t('Sur PC, à la mi-temps et pendant un changement, la composition dépliée prend tout l’écran : le terrain couché, bien plus grand, à droite des consignes.'),
      t('Les joueurs du terrain prennent la plus grande taille possible sans jamais se toucher, selon la taille de l’écran et la formation : plus de noms qui se chevauchent, même en 3-5-2 ou en 5-3-2. Sur un grand écran, ils sont plus gros qu’avant.'),
      t('À l’avant-match et dans l’onglet Composition, le terrain est plus haut et se couche dès que la place le permet.'),
    ],
  },
  {
    version: '0.7.4', date: '2026-10-27', title: t('Petites finitions'),
    items: [
      t('Sur PC, dans l’Équipe, la trésorerie et le bouton Fermer restent en haut à droite, à côté du titre ; les onglets passent sur leur propre ligne quand ils n’y tiennent pas.'),
      t('Sur téléphone, l’avant-match se referme en le glissant vers le bas, comme les autres fenêtres : retour au complexe.'),
    ],
  },
  {
    version: '0.7.3', date: '2026-10-27', title: t('Des noms plus variés'),
    items: [
      t('Trois fois plus de prénoms et de noms pour les joueurs : environ 450 prénoms et 700 noms, toujours francophones, simples à retenir, de toutes les origines du football français.'),
      t('Dans une saison, un même prénom ou un même nom ne revient presque plus trois fois, chez toi comme chez les adversaires.'),
      t('Aucun nom ne reprend celui d’un vrai joueur ou d’une personne connue, et plus jamais de nom qui se répète (« Laurent Laurent »).'),
      t('Tes joueurs gardent leur nom. Seuls deux noms de famille trop proches de personnes réelles sont remplacés à l’ouverture de la partie.'),
    ],
  },
  {
    version: '0.7.2', date: '2026-10-27', title: t('Fluidité sur appareil lent'),
    items: [
      t('Nouveau réglage « Fluidité sur appareil lent » (Réglages, à l’écran titre et dans le menu pause), coupé par défaut : si le jeu rame, la 3D est calculée avec moins de pixels, par paliers, juste assez pour redevenir fluide. L’image est un peu moins nette ; elle remonte dès que l’appareil suit de nouveau.'),
      t('Rien ne change sur un appareil qui suit, ni quand le réglage est coupé : pleine résolution de l’écran.'),
      t('Le complexe, les temps forts du match et les épreuves d’entraînement en profitent ; l’appareil retient son réglage d’une partie à l’autre.'),
      t('Sur un appareil qui rame fort (moins de 15 images par seconde), le jeu propose une fois le réglage : la notification mène droit à lui.'),
    ],
  },
  {
    version: '0.7.1', date: '2026-10-27', title: t('Plus de rechargement surprise'),
    items: [
      t('Sur iPhone, après une longue partie, l’écran pouvait devenir blanc et le jeu se relancer sur l’écran de chargement : Safari ferme une page qui garde trop de mémoire. Le jeu en garde désormais bien moins.'),
      t('Les bâtiments partagent leurs photos (béton, brique, verre, gazon…) au lieu d’en garder chacun une copie : une fois tous les niveaux vus, quatre fois moins de mémoire pour les textures, et un tiers de moins pour un complexe complet.'),
      t('Les séances d’entraînement réutilisent la même 3D d’une séance à l’autre ; pendant une séance, le complexe caché libère son image.'),
      t('Rien n’était perdu à ces rechargements, et rien ne le serait : la partie est enregistrée à chaque action et un match en cours reprend à la minute près.'),
    ],
  },
  {
    version: '0.7.0', date: '2026-10-27', title: t('Le match façon FM'),
    items: [
      t('Plus de terrain en permanence pendant le match : le centre du match montre le score avec les buteurs, les statistiques en direct (possession, tirs, tirs cadrés, grosses occasions, buts attendus, arrêts, poteaux, cartons), les temps forts et le pronostic.'),
      t('Les notes des joueurs des deux équipes évoluent pendant le match : buts, passes décisives, tirs cadrés, arrêts, cartons, résultat. Tes joueurs gardent leur condition sous leur nom. Sur téléphone, onglets Stats, Notes et Le fil.'),
      t('La 3D seulement pour les temps forts : buts, penalties, expulsions, grosses occasions, arrêts et poteaux. Chaque action est construite comme une vraie (ouverture, contre, centre et tête, une-deux, corner, coup franc avec le mur, penalty…), filmée en plan large façon télé ; un but est suivi d’un ralenti. « Passer le temps fort » quand tu veux.'),
      t('Entre deux temps forts, la 3D ne tourne pas : le match est plus fluide et moins gourmand, sur PC comme sur iPhone.'),
      t('Des penalties pendant le match : environ un match sur quatre, réussis trois fois sur quatre. Ils ne changent pas le nombre de buts : ils en prennent une part.'),
      t('L’adversaire aligne de vrais joueurs (noms, postes selon son dispositif, numéros, visages), les mêmes à chaque rencontre de la saison, avec leurs buteurs, leurs passeurs et leurs notes.'),
      t('Pronostic encore plus juste : il compte désormais les expulsions encore à venir. Le petit écart qui restait sur les matchs très déséquilibrés a disparu (vérifié sur 60 000 matchs).'),
      t('En accéléré (×4), seulement les buts, les penalties et les expulsions, sans ralenti.'),
      t('Un match en cours au moment de la mise à jour reprend au coup d’envoi.'),
    ],
  },
  {
    version: '0.6.1', date: '2026-10-27', title: t('Des visages qu’on retient, des recruteurs en mission'),
    items: [
      t('Nouveaux visages, toujours dessinés : forme du visage, yeux et leur couleur, nez, bouche, sourcils, oreilles, une vingtaine de coiffures (afro, tresses, dreadlocks, crête, dégradé, mulet…) et toutes sortes de barbes. Les cheveux grisonnent et le front se dégarnit avec l’âge ; la barbe d’un jeune vient avec les années.'),
      t('Un joueur sur cinq a un signe particulier : taches de rousseur, grain de beauté, cicatrice au sourcil, nez cassé, bandeau ou oreilles décollées.'),
      t('Le numéro de chaque joueur sur son maillot, dans le portrait (cartes, fiche, homme du match, bandeau du but).'),
      t('Un nom et un visage qui vont ensemble : l’origine du nom oriente un peu le visage, avec des mélanges comme dans la vie.'),
      t('Aucun sosie dans ton effectif : un joueur qui ressemblerait trop à un coéquipier arrive avec une coupe ou une barbe différente.'),
      t('Tes joueurs actuels gardent leur visage (teint, cheveux, coiffure, barbe), avec les nouveaux traits en plus.'),
      t('Académie : envoie tes recruteurs en mission sur un poste, un profil (technique, physique, mental) ou une région imaginaire, pour une à trois journées. Au retour, les plus prometteurs de tous les jeunes vus ; les chances affichées d’y trouver un grand potentiel sont exactes.'),
      t('Stats : nouvel onglet Pronostic. Sur tes propres matchs, les chances annoncées avant le coup d’envoi face aux résultats obtenus, tranche par tranche.'),
    ],
  },
  {
    version: '0.6.0', date: '2026-10-27', title: t('L’Élite pro : aller-retour et vrais millions'),
    items: [
      t('Élite en aller-retour : quatorze journées, chaque adversaire reçu une fois et visité une fois. À l’extérieur, l’avantage du terrain passe chez l’adversaire (pronostic compris, vérifié sur vingt mille matchs) et seuls les droits TV reviennent au club.'),
      t('Calendrier, avant-match, après-match et Finances le disent : « Journée 4 / 14 · À l’extérieur », droits TV attendus, matchs restants à domicile et à l’extérieur.'),
      t('L’Élite change d’échelle, comme un grand championnat européen : droits TV et sponsors de plusieurs dizaines de millions, titulaires à plusieurs millions par an, stars à plus de dix millions, transferts à plusieurs dizaines de millions. Les petites divisions gardent leurs budgets modestes.'),
      t('Coupe d’Europe à vraie échelle : 15 M€ de participation, des primes de tour jusqu’à 30 M€ et 5 M€ de droits TV par match, plus de cent millions pour le vainqueur. Les clubs européens affichent leur budget (de 150 à 800 M€), et ils sont un peu plus forts.'),
      t('Mercato : les géants européens suivent tes stars d’Élite, surtout quand tu joues la Coupe d’Europe. Leurs offres dépassent largement la valeur, et une offre spontanée peut la dépasser de moitié.'),
      t('Sponsors versés à la reprise, dès la deuxième saison : un club promu touche tout de suite ceux de sa nouvelle division, de quoi se renforcer avant d’affronter des salaires bien plus lourds.'),
      t('En Élite, le calendrier est chargé : chaque séance d’entraînement compte pour deux tiers, l’académie repère ses jeunes toutes les deux journées et ils progressent moitié moins par journée. Autant de progrès par saison qu’ailleurs.'),
      t('Objectifs du conseil à l’échelle de la saison d’Élite (deux fois plus de victoires, de buts ou de cages inviolées) ; l’arène fermée coûte désormais 55 M€, puis 140 M€ pour la version agrandie.'),
      t('Calendrier : la qualification affichée en coupe est exacte, comme à l’avant-match (un nul y comptait pour une demi-qualification).'),
      t('Ta partie en cours : déjà en Élite, ta trésorerie et tes offres en cours passent à la nouvelle échelle, comme les salaires. La saison en cours garde ses sept journées ; l’aller-retour commence à la suivante.'),
    ],
  },
  {
    version: '0.5.1', date: '2026-10-27', title: t('Pronostic vérifié, match repris, entraînement délégué'),
    items: [
      t('Pronostic vérifié sur vingt mille matchs : un match annoncé à 70-80 % de victoire (74,7 % en moyenne) est gagné 75,2 % du temps, et le pronostic du direct tombe aussi juste à chaque minute.'),
      t('Quand tu passes la fin d’une mi-temps, le staff remplace un blessé (s’il reste un changement) : l’équipe ne finit plus à dix, et le pronostic reste exact.'),
      t('Si l’app se ferme pendant un match, il reprend à la minute près à la réouverture, avec le même score et la même suite (rien n’est rejoué). L’écran titre l’annonce sous « Continuer ».'),
      t('Centre d’entraînement : nouveau réglage « Confier les séances au staff ». Avant chaque match, il simule les épreuves que tu n’as pas faites, avec les joueurs choisis (par défaut, les conseillés) ; plus de rappel de séance.'),
      t('Fatigue : chaque date rend un peu moins de condition (18 à 24 points selon l’âge, +1,5 par niveau du centre d’entraînement). Un titulaire qui joue tout finit par s’user : fais tourner, « Meilleur onze » s’en charge.'),
      t('Le président, c’est toi : les objectifs de la saison viennent désormais du conseil d’administration.'),
    ],
  },
  {
    version: '0.5.0', date: '2026-10-27', title: t('Une progression qui se mérite'),
    items: [
      t('Académie : un ou deux jeunes repérés par journée selon son niveau (jusqu’à six avant), aux potentiels réalistes. Au niveau 5, moins de deux jeunes par saison peuvent viser 18 ou plus, et un 20 est rare. Les fourchettes affichées (niveau à l’arrivée, potentiel) sont celles du tirage.'),
      t('Les jeunes progressent plus lentement, à l’académie comme en équipe première : un grand espoir a besoin de plusieurs saisons pour éclore. Fini l’équipe de prodiges de 19 ans.'),
      t('Centre d’entraînement : les séances et la séance collective font progresser environ deux fois et demie moins vite. Jouer l’épreuve reste plus payant que la simuler.'),
      t('Mercato : le marché suit le niveau de ta division (il était trop fort en Départementale, trop faible en Élite). Un joueur libre demande une prime de 70 % de sa valeur.'),
      t('Une recrue, comme un jeune monté de l’académie, ne peut être vendue qu’après quatre journées de championnat au club : fini l’achat-revente qui rapportait des millions.'),
      t('Coupe d’Europe : des adversaires au niveau des meilleurs clubs d’Élite, plus forts à chaque tour. La gagner devient un exploit.'),
      t('Avant-match : le niveau de ton onze tient compte de la fatigue, comme les chances affichées (« fatigue −0,4 » à côté quand des titulaires ne sont pas frais).'),
      t('Coupes : la qualification affichée est exacte, avec ta chance de gagner une séance de tirs au but (finition de tes tireurs, réflexes de ton gardien).'),
      t('Objectifs du président : ils se fixent sur ton meilleur onze, pas sur l’onze du moment.'),
      t('Ta partie en cours garde ses joueurs et ses jeunes ; les nouvelles règles valent pour tout ce qui arrive désormais (jeunes repérés, marché, entraînement, coupes).'),
    ],
  },
  {
    version: '0.4.3', date: '2026-10-25', title: t('Condition en pourcentage sur le terrain'),
    items: [
      t('Composition, avant-match, mi-temps et changement en direct : le pourcentage de condition s’affiche sous chaque joueur, même quand il est au vert.'),
      t('3-5-2 et 5-3-2 : joueurs un peu mieux espacés, pour qu’aucune note ne cache la condition d’un voisin (sur téléphone comme sur PC).'),
    ],
  },
  {
    version: '0.4.2', date: '2026-10-25', title: t('Réponses et chances justes à la Direction'),
    items: [
      t('Direction › Salaires : quand un joueur refuse une baisse qu’il avait déjà acceptée une saison passée, l’écran annonce bien un refus (il gardait « accepte »). Sa baisse déjà obtenue reste.'),
      t('Direction et centre médical : la jauge n’écrit 0 % ou 100 % que si c’est certain ; 99,6 % s’affiche 99 %, comme au mercato.'),
    ],
  },
  {
    version: '0.4.1', date: '2026-10-25', title: t('Navigation au doigt entre les sections'),
    items: [
      t('Sur téléphone, glisse un panneau vers la gauche ou la droite pour passer à la section voisine : Équipe, Mercato, Saison, Club.'),
      t('Une barre en bas de chaque panneau, à portée du pouce, fait la même chose : « ‹ Équipe » à gauche, « Saison › » à droite, et des points qui disent où tu es.'),
      t('Revenir à une section la rouvre sur l’écran que tu y avais laissé (Classement, Journal…).'),
      t('Le bouton Retour du navigateur (ou de la souris, ou d’Android) ferme la fiche ou le panneau ouvert au lieu de quitter le jeu.'),
      t('Composition : glisser un joueur vers le bas ne ferme plus tout le panneau.'),
    ],
  },
  {
    version: '0.4.0', date: '2026-10-25', title: t('Centre médical'),
    items: [
      t('Nouveau bâtiment : le centre médical. Entre deux matchs, fais soigner tes blessés : un soin par joueur et par date, avec sa chance exacte de le faire revenir un match plus tôt (une blessure légère soignée, il est disponible pour le prochain match).'),
      t('Sa prévention réduit aussi le risque de blessure en match : −8 % par niveau, jusqu’à −40 %.'),
      t('Nouvel onglet « Médical » dans l’Équipe ; la notification des blessés y mène une fois le centre construit.'),
      t('Construction conseillée : l’académie passe juste après le centre d’entraînement, avant l’espace supporters.'),
    ],
  },
  {
    version: '0.3.17', date: '2026-10-25', title: t('Réponse claire aux baisses de salaire'),
    items: [
      t('Direction › Salaires : après ta proposition, la réponse du joueur s’affiche à sa place (accord et nouveau salaire, ou refus) ; plus de bouton « Proposer » qui menait à « Négociation impossible ».'),
    ],
  },
  {
    version: '0.3.16', date: '2026-10-25', title: t('Fiche joueur visible depuis les Stats'),
    items: [
      t('Statistiques : « Voir sa fiche joueur » depuis une fiche carrière affiche bien la fiche (elle s’ouvrait derrière la carrière) ; la fermer ramène à la carrière.'),
    ],
  },
  {
    version: '0.3.15', date: '2026-10-25', title: t('Notes entières sur le terrain'),
    items: [
      t('Composition, changement en direct et mi-temps : la note posée sur le portrait des joueurs n’est plus rognée par ses coins en biais (11,6).'),
    ],
  },
  {
    version: '0.3.14', date: '2026-10-25', title: t('Notes entières au mercato'),
    items: [
      t('Mercato : la note posée sur le portrait d’un joueur s’élargit avec elle ; une note à deux chiffres (10,5) n’est plus rognée.'),
    ],
  },
  {
    version: '0.3.13', date: '2026-10-25', title: t('Plus de loupe, tarifs à la Direction'),
    items: [
      t('iPhone : un double toucher maintenu n’ouvre plus la loupe de texte de Safari, nulle part dans le jeu ; un bouton touché deux fois de suite répond toujours deux fois.'),
      t('Les tarifs des billets se règlent uniquement à la Direction du club (onglet Billetterie) ; la fiche du stade affiche le tarif en vigueur et y mène.'),
    ],
  },
  {
    version: '0.3.12', date: '2026-10-25', title: t('Ventes encadrées'),
    items: [
      t('Un joueur blessé ou suspendu ne peut plus être vendu : ni mise en vente, ni offre acceptée ; les clubs reviennent à son retour.'),
      t('Une recrue ne peut pas être revendue avant le match qui suit sa signature.'),
      t('Fiche joueur : « Arrivée au club » montre ce qu’il a coûté (indemnité ou prime), quand et d’où il est venu.'),
    ],
  },
  {
    version: '0.3.11', date: '2026-10-25', title: t('Le direct, rien que le direct'),
    items: [
      t('Pendant un match, la caméra reste à la réalisation : plus de rotation, de zoom ni de déplacement, et les bâtiments ne s’ouvrent plus d’un toucher.'),
      t('Un changement met vraiment le match en pause : les joueurs et le ballon s’immobilisent jusqu’à la reprise.'),
    ],
  },
  {
    version: '0.3.10', date: '2026-10-25', title: t('Fiche joueur sur place'),
    items: [
      t('Saison et Statistiques : la fiche d’un joueur s’ouvre par-dessus l’écran en cours ; la fermer ramène au même endroit (même onglet, même défilement, fiche carrière comprise) au lieu de l’Équipe.'),
    ],
  },
  {
    version: '0.3.9', date: '2026-10-25', title: t('Cartes et liserés'),
    items: [
      t('Cartes des joueurs : la note, le poste, « XI » et le numéro forment une colonne à gauche, le portrait se place à côté ; une note à deux chiffres (11,6) ne chevauche plus le visage.'),
      t('Le liseré doré fait tout le tour, coin coupé compris : succès tout juste débloqué, parcelle choisie, recrue conseillée, niveau de l’académie.'),
    ],
  },
  {
    version: '0.3.8', date: '2026-10-25', title: t('Mercato réparé'),
    items: [
      t('Le mercato s’ouvre de nouveau : la 0.3.7 le faisait planter (« Le jeu a rencontré un problème »).'),
      t('Réglages : « Signaler un problème » prépare enfin son rapport (le bouton ne faisait rien).'),
    ],
  },
  {
    version: '0.3.7', date: '2026-10-25', title: t('Corrections au téléphone'),
    items: [
      t('Équipe : le menu « Trier par » s’ouvre par-dessus les cartes et répond au doigt (les cartes le recouvraient : le tri semblait cassé).'),
      t('Après-match : « Stats du match » et « Voir le classement » l’un sous l’autre, en entier.'),
      t('Fiche carrière : même en-tête que la fiche joueur (niveau en grand et sa légende, portrait, étiquettes) ; le bouton « Voir sa fiche joueur » tient dans l’écran.'),
    ],
  },
  {
    version: '0.3.6', date: '2026-10-24', title: t('Mises à jour plus discrètes'),
    items: [
      t('Le bandeau « Nouvelle version » ne revient plus à chaque lancement quand le jeu tourne déjà la dernière version : il ne s’affiche que si une version plus récente reste à charger.'),
    ],
  },
  {
    version: '0.3.5', date: '2026-10-24', title: t('Négociation plus claire'),
    items: [
      t('Achat, mise en vente et vente négociée : la chance d’accord s’affiche juste au-dessus du bouton et suit la somme en direct, sans faire défiler.'),
    ],
  },
  {
    version: '0.3.4', date: '2026-10-24', title: t('Lisibilité'),
    items: [
      t('Entraînement : la qualité choisie se lit enfin (son gain vert et le point de la qualité conseillée disparaissaient sur le fond doré).'),
      t('Même correction partout où un élément choisi est doré : académie, mercato, menu de l’écran titre.'),
    ],
  },
  {
    version: '0.3.3', date: '2026-10-24', title: t('Notification d’origine'),
    items: [
      t('Les notifications retrouvent leur dessin d’origine, plus élégant : coins arrondis, lettres fines et espacées.'),
    ],
  },
  {
    version: '0.3.2', date: '2026-10-24', title: t('Corrections'),
    items: [
      t('La « Subvention de la mairie » ne s’annonce plus à chaque action : une prime du tutoriel s’annonce une seule fois (elle n’a jamais été versée deux fois).'),
      t('Académie plus lisible : nombres des onglets visibles sur l’onglet choisi, fiche d’un jeune au même modèle que la fiche joueur.'),
      t('Plus de sursaut en passant d’un onglet à l’autre d’une section (Finances, Journal, Notoriété, Direction…) ; Direction a la taille des autres écrans du Club.'),
    ],
  },
  {
    version: '0.3.1', date: '2026-10-24', title: t('Retour du logo'),
    items: [
      t('Le logo FootOFF Empire d’origine revient sur l’écran de chargement et l’écran titre.'),
      t('« Nouvelle partie » reste proposée sur une partie en cours, après confirmation : la partie actuelle est alors effacée.'),
    ],
  },
  {
    version: '0.3.0', date: '2026-10-24', title: t('Nouvelle interface'),
    items: [
      t('Toute l’interface refaite façon habillage télé : plaques sombres, or FootOFF, grands chiffres en capitales condensées.'),
      t('Menu du bas en cinq sections, Complexe, Équipe, Mercato, Saison et Club, chacune avec ses onglets.'),
      t('Match en direct : bandeau du score avec les clubs en trois lettres, bandeau du but, temps forts et pronostic exact pendant tout le match.'),
      t('Nouvelles cartes de joueurs et nouvelle fiche joueur ; le mercato s’affiche en tableau sur ordinateur.'),
      t('Saison : frise des dates avec les résultats, classement avec victoires, nuls et défaites, course à la montée et meilleurs joueurs du club.'),
      t('Nouvel écran titre et nouveau menu pause.'),
    ],
  },
  {
    version: '0.2.1', date: '2026-10-24', title: t('La mémoire du club'),
    items: [
      t('Le journal garde toute l’histoire du club, saison par saison, au lieu des quarante dernières nouvelles.'),
      t('Le direct raconte mieux : bien plus d’occasions, d’arrêts, de buts selon le score, de cartons et d’ambiance.'),
      t('Un lien partagé (messages, réseaux) montre désormais le titre, une description et une image du jeu.'),
    ],
  },
  {
    version: '0.2.0', date: '2026-10-24', title: t('Prêt pour les premiers joueurs'),
    items: [
      t('Sauvegarde protégée : copie de secours à chaque session, code de sauvegarde à copier et à coller d’un appareil à l’autre (réglages).'),
      t('Le jeu s’ouvre hors ligne après une première visite et annonce lui-même les nouvelles versions.'),
      t('Un écran clair si le jeu rencontre un problème, avec retour à la copie de secours et rapport à copier.'),
      t('« Signaler un problème » dans les réglages : un rapport complet, avec ta partie si tu l’acceptes, pour reproduire chaque bug.'),
      t('Cet écran Nouveautés, le numéro de version au bas de l’écran titre, et les Règles du jeu en langage joueur.'),
      t('Le tutoriel explique la condition physique, les blessures, les suspensions et les changements en cours de match.'),
    ],
  },
  {
    version: '0.1.3', date: '2026-10-24', title: t('Équilibre et cohérence'),
    items: [
      t('Une seule valeur de marché par joueur, référence des primes, des indemnités et des offres reçues.'),
      t('Les stars de l’Élite coûtent vraiment cher ; salaires et entretien se paient à chaque journée.'),
      t('La réputation se gagne selon la division et s’oublie un peu chaque été ; nouveaux statuts jusqu’à « Club de légende » à 80.'),
      t('Effectif de départ au milieu de la Départementale, haut de l’Élite relevé, recruteurs et notoriété qui attirent des joueurs jusqu’à 19.'),
    ],
  },
  {
    version: '0.1.2', date: '2026-10-24', title: t('Le banc compte enfin'),
    items: [
      t('Condition physique : un match fatigue selon l’endurance, chaque date repose ; un joueur fatigué joue moins bien et se blesse plus souvent.'),
      t('Blessures (une à neuf dates d’absence) et suspensions (rouge direct : deux matchs ; second jaune ou trois jaunes : un).'),
      t('Changements à toute minute pendant le direct : le match s’arrête, composition, tactique et pronostic final se règlent ; cinq changements par match.'),
      t('Lecture du jeu ne se fige plus, et une erreur pendant une épreuve propose de la simuler.'),
    ],
  },
  {
    version: '0.1.0', date: '2026-10-24', title: t('Version de départ'),
    items: [
      t('Direction du club : droits TV, salaires et billetterie à négocier.'),
      t('Tutoriel en sept étapes mené par la direction sportive, objectifs du président à chaque saison.'),
      t('Centre d’entraînement avec huit épreuves en 3D, académie, mercato négocié, Coupe nationale et Coupe d’Europe.'),
    ],
  },
];

export const CURRENT = CHANGELOG[0].version;
