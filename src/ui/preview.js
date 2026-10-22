import { build, createInitialState, endSeason, playRound, sellPlayer, setForSale, signPlayer, toggleShortlist, upgrade } from '../game/engine';
import { matchContext, startSeason } from '../game/season';
import { costOf, playerRating } from '../game/players';
import { counterFor, poolOf, roundKey, roundTo, valueOf } from '../game/mercato';

// Mode aperçu (galerie d'écrans) : une partie fictive, jamais sauvegardée, et l'écran demandé déjà ouvert.

export const SCREENS = [
  ['titre', 'Écran titre · partie en cours'],
  ['accueil', 'Écran titre · nouveau joueur'],
  ['creation', 'Création du club'],
  ['reglages', 'Écran titre · réglages'],
  ['empire', 'Empire (HUD)'],
  ['tutoriel', 'Tutoriel des premiers pas'],
  ['inspecteur', 'Inspecteur du stade'],
  ['parcelle', 'Vitrine de construction · parcelle libre'],
  ['vitrine-fonds', 'Vitrine de construction · fonds insuffisants'],
  ['apercu', 'Fenêtre d’aperçu · niveaux d’un bâtiment construit'],
  ['effectif', 'Effectif · joueurs'],
  ['fiche', 'Fiche joueur'],
  ['composition', 'Effectif · composition'],
  ['anciens', 'Effectif · anciens joueurs'],
  ['marche', 'Mercato · recruter'],
  ['transferts', 'Mercato · bureau des transferts niveau 2'],
  ['negociation', 'Mercato · négociation'],
  ['contre-offre', 'Mercato · contre-offre du vendeur'],
  ['suivis', 'Mercato · joueurs suivis'],
  ['offres', 'Mercato · offres reçues'],
  ['bilan-mercato', 'Mercato · bilan des transferts'],
  ['bureau', 'Inspecteur · bureau des transferts'],
  ['comparateur', 'Comparateur radar'],
  ['avant-match', 'Avant-match'],
  ['direct', 'Match en direct'],
  ['mi-temps', 'Mi-temps (composition repliée)'],
  ['mi-temps-compo', 'Mi-temps · composition déployée'],
  ['apres-match', 'Après-match'],
  ['bilan', 'Bilan de saison'],
  ['bilan-champion', 'Bilan · titre de champion'],
  ['saison', 'Saison · calendrier'],
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
  if (screen === 'accueil' || screen === 'creation') return null;
  const s = createInitialState('FootOFF FC');
  s.tutorial = { step: screen === 'tutoriel' ? 'build' : 'done' };
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
  if (screen === 'europe') { // Elite et Coupe d'Europe : places européennes au classement, dates européennes au calendrier
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
  if (screen === 'vitrine-fonds') s.money = 4200; // un seul bâtiment payable : les autres disent ce qui manque
  if (screen === 'transferts' || screen === 'bureau') { // bureau construit au niveau 2 chez les supporters
    s.reputation = 8;
    s.money = 1e6;
    build(s, 't3', 'transfers');
    upgrade(s, 'transfers');
    s.money = 60000;
  }
  if (MERCATO.includes(screen)) mercatoPreview(s, screen);
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
  s.offline = null;
  return s;
}

// Mercato en aperçu : une négociation (avec ou sans contre-offre), des joueurs suivis dont un parti ailleurs, des
// offres reçues (dont une spontanée), un bilan avec une arrivée et un départ.
const MERCATO = ['negociation', 'contre-offre', 'suivis', 'offres', 'bilan-mercato'];
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
  if (screen === 'offres') {
    setForSale(s, mine[0].id, true);
    setForSale(s, mine[1].id, true);
    s.offerSeq = 0;
    const offer = (p, k, club, unsolicited = false) => ({ id: ++s.offerSeq, playerId: p.id, club, amount: roundTo(valueOf(s, p) * k), unsolicited, at: roundKey(s), haggled: false });
    const best = mine[mine.length - 1];
    s.offers = [offer(mine[0], 1.18, s.rivals[0].name), offer(mine[1], 0.97, s.rivals[3].name), offer(best, 1.42, s.rivals[5].name, true)];
    target.talks = { tries: 1, counter: counterFor(s, target), closed: false }; // une contre-offre à conclure
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
    case 'creation': return { screen: 'title', titleView: 'create' };
    case 'inspecteur': return { sel: { plotId: 't0', sector: 'main' } };
    case 'parcelle': case 'vitrine-fonds': return { sel: { plotId: 't2', sector: 'main' } };
    case 'apercu': return { sel: { plotId: 't1', sector: 'main', window: true } };
    case 'effectif': return { panel: 'squad' };
    case 'fiche': return { panel: 'squad', squad: { sheet: s.players.find((p) => p.season?.apps)?.id ?? s.players[0].id } };
    case 'composition': return { panel: 'squad', squadTab: 'lineup' };
    case 'anciens': return { panel: 'squad', squadTab: 'alumni' };
    case 'marche': case 'transferts': return { panel: 'squad', squadTab: 'market' };
    case 'negociation': case 'contre-offre': return { panel: 'squad', squadTab: 'market', squad: { deal: s.transfers[0].id } };
    case 'suivis': return { panel: 'squad', squadTab: 'market', squad: { mercato: 'watch' } };
    case 'offres': return { panel: 'squad', squadTab: 'market', squad: { mercato: 'offers' } };
    case 'bilan-mercato': return { panel: 'squad', squadTab: 'market', squad: { mercato: 'log' } };
    case 'bureau': return { sel: { plotId: 't3', sector: 'main' } };
    case 'comparateur': return { panel: 'squad', squadTab: 'market', squad: { compare: true } };
    case 'saison': return { panel: 'season' };
    case 'classement': return { panel: 'season', seasonTab: 'table' };
    case 'europe': return { panel: 'season', seasonTab: 'table' };
    case 'journal': return { panel: 'journal' };
    case 'finances': return { panel: 'finances' };
    case 'stats': return { panel: 'stats' };
    case 'stats-pass': return { panel: 'stats', statsMatch: 'last' };
    case 'stats-detail': return { panel: 'stats', statsMatch: 'last' };
    case 'trophees': return { panel: 'trophies' };
    case 'avant-match': return { matchPhase: 'prematch', matchCtx: matchContext(s), matchDay: true };
    case 'direct': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { minute: 34 } };
    case 'mi-temps': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'halftime' } };
    case 'mi-temps-compo': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'halftime', board: true } };
    case 'apres-match': return { showResult: true, matchDay: true };
    case 'menu': return { menu: true };
    case 'notification': return {
      notes: [
        { kind: 'achievement', eyebrow: 'Succès débloqué', title: 'Première victoire', text: 'Gagner un premier match officiel.', action: { panel: 'trophies', tab: 'achievements' } },
        { kind: 'mercato', eyebrow: 'Mercato · pendant la journée', title: '2 offres reçues pour tes joueurs', action: { panel: 'squad', tab: 'market' } },
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
  muted: true, start() {}, setMuted() {}, whistle() {}, chance() {}, goal() {}, conceded() {}, card() {}, coins() {}, spend() {}, ui() {}, stop() {},
};
