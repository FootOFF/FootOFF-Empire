import {
  answerOffer, build, createInitialState, endSeason, playRound, sellPlayer, setYouthPlan, signPlayer, signYouth, startProgram, toggleShortlist, trainPlayer, upgrade,
} from '../game/engine';
import { LINES, pickOf, programsFor } from '../game/training';
import { advisedPlan } from '../game/academy';
import { seasonFixtures } from '../game/fixtures';
import { matchContext, startSeason } from '../game/season';
import { costOf, playerRating } from '../game/players';
import { BUYERS, counterFor, dateKey, lastWordOf, outbidChance, poolOf, roundKey, roundTo, valueOf } from '../game/mercato';
import { distinctClubName } from '../game/names';

// Mode aperçu (galerie d'écrans) : une partie fictive, jamais sauvegardée, et l'écran demandé déjà ouvert.

export const SCREENS = [
  ['titre', 'Écran titre · partie en cours'],
  ['accueil', 'Écran titre · nouveau joueur'],
  ['creation', 'Création du club'],
  ['reglages', 'Écran titre · réglages'],
  ['regles', 'Écran titre · règles du jeu'],
  ['nouveautes', 'Écran titre · nouveautés'],
  ['empire', 'Empire (HUD)'],
  ['tutoriel', 'Tutoriel des premiers pas'],
  ['tutoriel-effectif', 'Tutoriel · ménage ton effectif'],
  ['inspecteur', 'Inspecteur du stade'],
  ['parcelle', 'Vitrine de construction · parcelle libre'],
  ['vitrine-fonds', 'Vitrine de construction · fonds insuffisants'],
  ['apercu', 'Fenêtre d’aperçu · niveaux d’un bâtiment construit'],
  ['effectif', 'Effectif · joueurs'],
  ['fiche', 'Fiche joueur'],
  ['fiche-recrue', 'Fiche joueur · recrue du jour (arrivée, vente bloquée)'],
  ['composition', 'Effectif · composition'],
  ['anciens', 'Effectif · anciens joueurs'],
  ['marche', 'Mercato · recruter'],
  ['transferts', 'Mercato · bureau des transferts niveau 2'],
  ['negociation', 'Mercato · négociation'],
  ['contre-offre', 'Mercato · contre-offre du vendeur'],
  ['suivis', 'Mercato · joueurs suivis'],
  ['offres', 'Mercato · offres reçues'],
  ['encheres', 'Mercato · enchères entre clubs'],
  ['vente', 'Mercato · mise en vente à ton prix'],
  ['vente-negociation', 'Mercato · négociation d’une vente (dernier mot)'],
  ['vente-conclue', 'Mercato · vente conclue'],
  ['bilan-mercato', 'Mercato · bilan des transferts'],
  ['bureau', 'Inspecteur · bureau des transferts'],
  ['academie', 'Académie · mes jeunes'],
  ['academie-detection', 'Académie · détection'],
  ['academie-jeune', 'Académie · fiche d’un jeune (plan d’entraînement)'],
  ['academie-repere', 'Académie · fiche d’un jeune repéré'],
  ['academie-vide', 'Académie · équipe de jeunes vide'],
  ['academie-batiment', 'Inspecteur · académie'],
  ['entrainement', 'Centre d’entraînement · séance (deux épreuves faites)'],
  ['entrainement-joueur', 'Centre d’entraînement · choix du joueur d’une ligne'],
  ['entrainement-staff', 'Centre d’entraînement · séances confiées au staff'],
  ['entrainement-programmes', 'Centre d’entraînement · programmes de signes (niveau 3)'],
  ['entrainement-programme', 'Centre d’entraînement · programme d’un joueur'],
  ['entrainement-progres', 'Centre d’entraînement · progrès et niveaux'],
  ['entrainement-batiment', 'Inspecteur · centre d’entraînement'],
  ['direction', 'Direction du club · droits TV'],
  ['direction-salaires', 'Direction du club · salaires'],
  ['medical', 'Centre médical · blessés et soins'],
  ['medical-batiment', 'Inspecteur · centre médical'],
  ['comparateur', 'Comparateur radar'],
  ['avant-match', 'Avant-match'],
  ['avant-match-coupe', 'Avant-match · tour de coupe (titulaires fatigués, tirs au but)'],
  ['direct', 'Match en direct'],
  ['direct-but', 'Match en direct · bandeau du but'],
  ['mi-temps', 'Mi-temps (composition repliée)'],
  ['mi-temps-compo', 'Mi-temps · composition déployée'],
  ['changement', 'Direct · changement en cours de jeu'],
  ['erreur', 'Écran d’erreur (barrière globale)'],
  ['apres-match', 'Après-match'],
  ['apres-match-classement', 'Après-match · classement de la journée'],
  ['bilan', 'Bilan de saison'],
  ['bilan-champion', 'Bilan · titre de champion'],
  ['saison', 'Saison · calendrier (prochain match)'],
  ['saison-joue', 'Saison · calendrier, match joué'],
  ['saison-coupe', 'Saison · calendrier, tour de coupe à tirer'],
  ['saison-fin', 'Saison · calendrier, saison terminée'],
  ['calendrier-europe', 'Saison · calendrier en Elite avec la Coupe d’Europe'],
  ['classement', 'Saison · classement'],
  ['europe', 'Saison en Elite · Coupe d’Europe, places européennes'],
  ['finances', 'Finances'],
  ['stats', 'Statistiques'],
  ['stats-pass', 'Stats Pass d’un match'],
  ['stats-detail', 'Stats Pass · statistiques détaillées'],
  ['journal', 'Journal du club'],
  ['trophees', 'Salle des trophées (palmarès, succès, records)'],
  ['confirmation', 'Fenêtre de confirmation'],
  ['notification', 'Notification · succès débloqué'],
  ['menu', 'Menu pause'],
  ['chargement', 'Écran de chargement'],
];

export function previewState(screen) {
  if (screen === 'accueil' || screen === 'creation' || screen === 'erreur') return null;
  const s = createInitialState('FootOFF FC');
  s.tutorial = { step: screen === 'tutoriel' ? 'build' : screen === 'tutoriel-effectif' ? 'squad' : 'done' };
  if (screen === 'finances' || screen === 'stats' || screen === 'stats-pass' || screen === 'stats-detail' || screen === 'anciens' || screen === 'trophees') { // deux saisons bouclées, puis trois matchs : courbe et comptes remplis
    build(s, 'main', 'training');
    for (let k = 0; k < 2; k++) { while (s.round < 7) playRound(s); endSeason(s); s.seasonReview = null; }
    for (let k = 0; k < 3; k++) playRound(s);
    sellPlayer(s, [...s.players].sort((x, y) => (y.hist?.length || 0) - (x.hist?.length || 0))[0].id); // un ancien, pour les fiches carrière
    if (screen === 'trophees') { // un palmarès fourni : titres, coupes, Coupe d'Europe
      s.trophies = [
        { comp: 'league', season: 1, division: 'Départementale' }, { comp: 'league', season: 2, division: 'Régionale' },
        { comp: 'cup', season: 2, division: 'Régionale', opp: 'Olympique de Brévannes' }, { comp: 'league', season: 4, division: 'Nationale' },
        { comp: 'league', season: 6, division: 'Elite' }, { comp: 'c1', season: 7, division: 'Elite', opp: 'Real Valdemoro' },
      ];
      delete s.achievements; // retrouvés d'un coup, sans notification (comme une partie déjà commencée)
    }
    s.offline = null;
    return s;
  }
  if (screen === 'europe' || screen === 'calendrier-europe') { // Elite et Coupe d'Europe : places européennes au classement, dates européennes au calendrier
    s.divisionIndex = 3;
    s.reputation = 60;
    s.c1Next = true;
    startSeason(s);
  }
  if (screen !== 'tutoriel') {
    build(s, 'main', 'training');
    for (let k = 0; k < 3; k++) playRound(s); // statistiques, forme, dernier match
    s.money = 42000;
  }
  if (screen === 'avant-match-coupe') { // prochain tour de la Coupe nationale, trois titulaires pas frais
    for (let k = 0; k < 6 && matchContext(s)?.comp === 'league'; k++) playRound(s);
    s.lineup.slice(1, 4).forEach((id, k) => { s.players.find((p) => p.id === id).fit = [52, 61, 70][k]; });
  }
  if (screen === 'vitrine-fonds') s.money = 4200; // un seul bâtiment payable : les autres disent ce qui manque
  if (screen === 'saison-fin') while (matchContext(s)) playRound(s); // toutes les dates jouées, avant le bilan
  // classement de l'après-match : il suit une journée de championnat (pas un match de coupe)
  if (screen === 'apres-match-classement') for (let k = 0; k < 4 && s.lastMatch?.comp !== 'league'; k++) playRound(s);
  if (screen === 'transferts' || screen === 'bureau') { // bureau construit au niveau 2 chez les supporters
    s.reputation = 8;
    s.money = 1e6;
    build(s, 't3', 'transfers');
    upgrade(s, 'transfers');
    s.money = 60000;
  }
  if (MERCATO.includes(screen)) mercatoPreview(s, screen);
  if (screen.startsWith('academie')) academyPreview(s, screen);
  if (screen.startsWith('entrainement')) trainingPreview(s);
  if (screen === 'entrainement-staff') { s.training = { ...s.training, staff: true, done: {} }; } // le staff fera la séance avant le match
  if (screen.startsWith('medical')) { // centre médical niveau 2 : trois blessés, dont un soigné aujourd'hui avec succès
    s.money = 1e6; build(s, 't4', 'medical'); upgrade(s, 'medical'); s.money = 42000;
    const [a, b, c] = [...s.players].filter((p) => p.pos !== 'G').sort((x, y) => playerRating(y) - playerRating(x));
    a.injury = { out: 3, total: 3, label: 'Entorse' };
    b.injury = { out: 6, total: 6, label: 'Déchirure musculaire' };
    c.injury = { out: 1, total: 2, label: 'Élongation' };
    c.treated = { at: dateKey(s), ok: true, before: 2 };
  }
  if (screen.startsWith('direction')) { s.money = 1e6; build(s, 't3', 'direction'); upgrade(s, 'direction'); s.money = 42000; } // Direction du club, niveau 2
  if (screen === 'bilan' || screen === 'bilan-champion') {
    while (s.round < 7) playRound(s);
    endSeason(s);
    if (screen === 'bilan-champion') { // titre et coupe : la célébration complète
      const r = s.seasonReview;
      Object.assign(r, { position: 1, champion: true, promoted: true, titleBonus: 9000, cups: 4200 });
      r.trophies = [{ comp: 'league', season: 1, division: r.division }, { comp: 'cup', season: 1, division: r.division }];
      r.cupRuns = [{ comp: 'cup', won: true, reached: 'vainqueur' }];
      s.trophies = [...r.trophies];
    }
  }
  if (screen === 'fiche-recrue') { s.money += 50000; signPlayer(s, s.market[0].id); } // signé aujourd'hui : pas de revente avant quatre journées
  s.offline = null;
  return s;
}

// Académie en aperçu (niveau 3, parcelle 2) : trois jeunes recrutés (deux repérés à l'ouverture, un après la première
// journée) puis deux journées d'entraînement, dont un dans sa dernière saison (18 ans) et un au plan changé ; équipe
// vide pour « academie-vide ».
function academyPreview(s, screen) {
  s.money = 1e6;
  build(s, 't2', 'academy');
  upgrade(s, 'academy');
  upgrade(s, 'academy');
  s.money = 42000;
  if (screen === 'academie-vide') return;
  const leagueRounds = (n) => { // journées de championnat (les matchs de coupe ne comptent pas)
    const from = s.round;
    for (let k = 0; k < 4 * n && s.round < from + n; k++) playRound(s);
  };
  for (const p of s.scouting.list.slice(0, 3)) signYouth(s, p.id);
  for (let k = 0; k < 3 && s.youth.length < 3; k++) {
    leagueRounds(1);
    for (const p of s.scouting.list.slice(0, 3 - s.youth.length)) signYouth(s, p.id);
  }
  s.youth[0].age = 18;
  const other = Object.keys({ tech: 1, phys: 1, mental: 1 }).find((k) => k !== advisedPlan(s.youth[1]));
  setYouthPlan(s, s.youth[1].id, other);
  leagueRounds(2);
}

// Centre d'entraînement en aperçu (niveau 3) : deux séances complètes et leurs matchs, puis, avant le match suivant,
// une épreuve jouée (attaquant) et une simulée (gardien) ; un programme de signe en cours.
function trainingPreview(s) {
  s.money = 1e6;
  upgrade(s, 'training');
  upgrade(s, 'training');
  s.money = 42000;
  const scores = [0.82, null, 0.64, 0.38];
  for (let w = 0; w < 2; w++) {
    LINES.forEach((pos, i) => { const pk = pickOf(s, pos); if (pk) trainPlayer(s, pos, { ...pk, score: scores[(i + w) % 4] }); });
    playRound(s);
  }
  const m = s.players.find((p) => p.pos === 'M' && programsFor(s, p).length);
  if (m) {
    startProgram(s, m.id, programsFor(s, m)[0]);
    s.training.programs[m.id].steps = 2;
  }
  trainPlayer(s, 'A', { ...pickOf(s, 'A'), score: 0.86 });
  trainPlayer(s, 'G', { ...pickOf(s, 'G'), score: null });
}

// Mercato en aperçu : une négociation (avec ou sans contre-offre), des joueurs suivis dont un parti ailleurs, des
// offres reçues (trois clubs pour un joueur, un pour un autre, une offre spontanée), des enchères, une négociation de
// vente au dernier mot, une vente conclue, un bilan avec une arrivée et un départ.
const MERCATO = ['negociation', 'contre-offre', 'suivis', 'offres', 'encheres', 'vente-negociation', 'vente-conclue', 'bilan-mercato'];
const SALES = ['offres', 'encheres', 'vente-negociation', 'vente-conclue'];
const later = () => Date.now() + 60000; // réponse affichée à l'ouverture de la vue
function mercatoPreview(s, screen) {
  const mine = [...s.players].sort((a, b) => playerRating(a) - playerRating(b));
  const target = s.transfers[0];
  if (screen === 'contre-offre') { // offre sérieuse refusée : le vendeur propose son prix
    const counter = counterFor(s, target);
    target.talks = { tries: 1, counter, closed: false };
    const amount = roundTo(costOf(target, s) * 0.84);
    s.lastDeal = { id: target.id, name: target.name, result: 'countered', amount, counter, at: Date.now() + 60000 }; // affichée à l'ouverture
  }
  if (screen === 'suivis') {
    for (const p of poolOf(s).slice(0, 4)) toggleShortlist(s, p.id);
    s.shortlist[0].price = roundTo(s.shortlist[0].price * 1.12); // suivi plus cher : son prix a baissé depuis
    const gone = s.shortlist[3];
    s.market = s.market.filter((p) => p.id !== gone.id);
    s.transfers = s.transfers.filter((p) => p.id !== gone.id);
    Object.assign(gone, { gone: s.rivals[2].name, goneAt: roundKey(s) });
  }
  if (SALES.includes(screen)) { // deux joueurs en vente : trois clubs pour l'un, un pour l'autre, plus une offre spontanée
    const [a, b] = mine;
    const key = roundKey(s);
    s.saleList = [{ id: a.id, at: key, price: roundTo(valueOf(s, a) * 1.25) }, { id: b.id, at: key, price: roundTo(valueOf(s, b)) }];
    s.saleOffered = { [a.id]: key, [b.id]: key };
    s.offerSeq = 0;
    const offer = (p, tier, k, cap, club, unsolicited = false) => ({
      id: ++s.offerSeq, playerId: p.id, club, tier, div: Math.min(3, Math.max(0, s.divisionIndex + BUYERS[tier].step)), b: cap,
      v: valueOf(s, p), amount: roundTo(valueOf(s, p) * k), atAsk: false, unsolicited, at: key, talks: { tries: 0, closed: false },
    });
    const far = distinctClubName([s.clubName, ...s.rivals.map((r) => r.name)]);
    s.offers = [
      offer(a, 'big', 1.12, 1.32, far),
      offer(a, 'mid', 1.02, 1.14, s.rivals[0].name),
      offer(a, 'small', 0.9, 0.99, s.rivals[3].name),
      { ...offer(b, 'mid', 1, 1.12, s.rivals[5].name), amount: s.saleList[1].price, atAsk: true },
      offer(mine[mine.length - 1], 'big', 1.38, 1.5, distinctClubName([s.clubName, far]), true),
    ];
    const [top, second, third] = s.offers;
    // plafonds choisis pour que les enchères se jouent vraiment (les petites sommes, arrondies, sont tranchées)
    for (const [o, want] of [[second, 0.6], [third, 0.15]]) {
      for (let k = 0.9; k < 1.8 && outbidChance(o, top.amount) < want; k += 0.005) o.b = k;
    }
    if (screen === 'offres') target.talks = { tries: 1, counter: counterFor(s, target), closed: false }; // une contre-offre à conclure
    if (screen === 'encheres') { // le club ambitieux bat l'offre du grand club, le petit club se retire
      const from = second.amount;
      second.amount = roundTo(top.amount * 1.07);
      s.offers = s.offers.filter((o) => o !== third);
      s.auctions = { [a.id]: key };
      s.lastAuction = {
        playerId: a.id, name: a.name, club: top.club, best: top.amount, at: later(),
        moves: [{ offerId: second.id, club: second.club, from, to: second.amount }, { offerId: third.id, club: third.club, from: third.amount, to: null }],
      };
    }
    if (screen === 'vente-negociation') { // demande refusée : le grand club monte à son dernier mot
      const before = top.amount;
      top.talks = { tries: 1, closed: false };
      top.amount = lastWordOf(top);
      s.lastSale = {
        offerId: top.id, playerId: a.id, name: a.name, club: top.club, tier: top.tier, div: top.div, amount: top.amount, value: top.v,
        result: 'countered', demand: roundTo(before * 1.3), offered: before, at: later(),
      };
    }
    if (screen === 'vente-conclue') {
      answerOffer(s, top.id, 'accept');
      s.lastSale.at = later();
    }
  }
  if (screen === 'bilan-mercato') {
    signPlayer(s, s.market[1].id);
    sellPlayer(s, mine[0].id, roundTo(valueOf(s, mine[0]) * 1.15), s.rivals[1].name);
  }
  return s;
}

// État d'interface de départ pour chaque écran (s est nul pour les écrans d'avant la création du club).
export function previewUi(screen, s) {
  switch (screen) {
    case 'titre': case 'accueil': return { screen: 'title' };
    case 'reglages': return { screen: 'title', titleView: 'settings' };
    case 'regles': return { screen: 'title', titleView: 'rules' };
    case 'nouveautes': return { screen: 'title', titleView: 'news' };
    case 'creation': return { screen: 'title', titleView: 'create' };
    case 'inspecteur': return { sel: { plotId: 't0', sector: 'main' } };
    case 'parcelle': case 'vitrine-fonds': return { sel: { plotId: 't2', sector: 'main' } };
    case 'apercu': return { sel: { plotId: 't1', sector: 'main', window: true } };
    case 'effectif': return { panel: 'squad' };
    case 'fiche': return { panel: 'squad', squad: { sheet: s.players.find((p) => p.season?.apps)?.id ?? s.players[0].id } };
    case 'fiche-recrue': return { panel: 'squad', squad: { sheet: (s.players.find((p) => p.signed) || s.players[0]).id } };
    case 'composition': return { panel: 'squad', squadTab: 'lineup' };
    case 'anciens': return { panel: 'squad', squadTab: 'alumni' };
    case 'marche': case 'transferts': return { panel: 'mercato' };
    case 'negociation': case 'contre-offre': return { panel: 'mercato', squad: { deal: s.transfers[0].id } };
    case 'suivis': return { panel: 'mercato', squad: { mercato: 'watch' } };
    case 'offres': case 'encheres': return { panel: 'mercato', squad: { mercato: 'offers' } };
    case 'vente': return { panel: 'mercato', squad: { mercato: 'offers', listing: [...s.players].sort((a, b) => playerRating(a) - playerRating(b))[2].id } };
    case 'vente-negociation': case 'vente-conclue': return { panel: 'mercato', squad: { mercato: 'offers', sale: 1 } };
    case 'bilan-mercato': return { panel: 'mercato', squad: { mercato: 'log' } };
    case 'bureau': return { sel: { plotId: 't3', sector: 'main' } };
    case 'academie': case 'academie-vide': return { panel: 'academy' };
    case 'academie-detection': return { panel: 'academy', academyTab: 'scout' };
    case 'academie-jeune': return { panel: 'academy', academy: { sheet: s.youth[1].id } };
    case 'academie-repere': return { panel: 'academy', academyTab: 'scout', academy: { sheet: s.scouting.list[0].id, list: 'scout' } };
    case 'academie-batiment': return { sel: { plotId: 't2', sector: 'main' } };
    case 'entrainement': case 'entrainement-staff': return { panel: 'training' };
    case 'direction': return { panel: 'direction' };
    case 'direction-salaires': return { panel: 'direction', directionTab: 'wages' };
    case 'medical': return { panel: 'medical' };
    case 'medical-batiment': return { sel: { plotId: 't4', sector: 'main' } };
    case 'entrainement-joueur': return { panel: 'training', training: { chooser: 'D' } };
    case 'entrainement-programmes': return { panel: 'training', trainingTab: 'programs' };
    case 'entrainement-programme': return { panel: 'training', trainingTab: 'programs', training: { program: s.players.find((p) => !s.training?.programs?.[p.id] && programsFor(s, p).length)?.id } };
    case 'entrainement-progres': return { panel: 'training', trainingTab: 'progress' };
    case 'entrainement-batiment': return { sel: { plotId: 't1', sector: 'main' } };
    case 'comparateur': return { panel: 'mercato', squad: { compare: true } };
    case 'saison': case 'saison-fin': case 'calendrier-europe': return { panel: 'season' };
    case 'saison-joue': return { panel: 'season', seasonSel: seasonFixtures(s).find((f) => f.match)?.index };
    case 'saison-coupe': return { panel: 'season', seasonSel: seasonFixtures(s).find((f) => f.status === 'tbd' || f.status === 'out')?.index };
    case 'classement': return { panel: 'season', seasonTab: 'table' };
    case 'europe': return { panel: 'season', seasonTab: 'table' };
    case 'journal': return { panel: 'journal' };
    case 'finances': return { panel: 'finances' };
    case 'stats': return { panel: 'stats' };
    case 'stats-pass': return { panel: 'stats', statsMatch: 'last' };
    case 'stats-detail': return { panel: 'stats', statsMatch: 'last' };
    case 'trophees': return { panel: 'trophies' };
    case 'avant-match': case 'avant-match-coupe': return { matchPhase: 'prematch', matchCtx: matchContext(s), matchDay: true };
    case 'direct': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { minute: 34 } };
    case 'direct-but': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { minute: 34, goal: true } };
    case 'mi-temps': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'halftime' } };
    case 'mi-temps-compo': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'halftime', board: true } };
    case 'changement': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'subs', minute: 31 } };
    case 'apres-match': return { showResult: true, matchDay: true };
    case 'apres-match-classement': return { showResult: true, matchDay: true, postStep: 'table' };
    case 'menu': return { menu: true };
    case 'notification': return {
      notes: [
        { kind: 'achievement', eyebrow: 'Succès débloqué', title: 'Première victoire', text: 'Gagner un premier match officiel.', action: { panel: 'trophies', tab: 'achievements', ids: ['first_win'] } },
        { kind: 'mercato', eyebrow: 'Mercato · pendant la journée', title: '2 offres reçues pour tes joueurs', action: { panel: 'mercato', view: 'offers' } },
      ],
    };
    case 'chargement': return { loading: 0.42 };
    case 'confirmation': {
      const p = s.players[s.players.length - 1];
      return {
        confirm: {
          title: `Vendre ${p.name} ?`,
          text: `${p.name} (${p.age} ans) rejoindra un autre club.`,
          rows: [['Montant de la vente', '+2 564 €', 'up'], ['Salaire économisé', '2 137 € / saison', 'up']],
          confirmLabel: 'Vendre · 2 564 €',
          onConfirm: () => {},
        },
      };
    }
    default: return {};
  }
}

// Son coupé en aperçu (pas d'AudioContext dans les vignettes).
export const silentSound = {
  muted: true, start() {}, setMuted() {}, whistle() {}, chance() {}, goal() {}, conceded() {}, card() {}, coins() {}, spend() {}, ui() {}, sfx() {}, stop() {},
};
