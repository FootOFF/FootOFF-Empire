import { build, createInitialState, endSeason, playRound, sellPlayer, upgrade } from '../game/engine';
import { matchContext } from '../game/season';

// Mode aperçu (galerie d'écrans) : une partie fictive, jamais sauvegardée, et l'écran demandé déjà ouvert.

export const SCREENS = [
  ['titre', 'Écran titre · partie en cours'],
  ['accueil', 'Écran titre · nouveau joueur'],
  ['creation', 'Création du club'],
  ['reglages', 'Écran titre · réglages'],
  ['empire', 'Empire (HUD)'],
  ['tutoriel', 'Tutoriel des premiers pas'],
  ['inspecteur', 'Inspecteur du stade'],
  ['parcelle', 'Inspecteur · parcelle libre'],
  ['effectif', 'Effectif · joueurs'],
  ['fiche', 'Fiche joueur'],
  ['composition', 'Effectif · composition'],
  ['marche', 'Effectif · marché'],
  ['anciens', 'Effectif · anciens joueurs'],
  ['transferts', 'Marché des transferts'],
  ['bureau', 'Inspecteur · bureau des transferts'],
  ['comparateur', 'Comparateur radar'],
  ['avant-match', 'Avant-match'],
  ['direct', 'Match en direct'],
  ['mi-temps', 'Mi-temps'],
  ['apres-match', 'Après-match'],
  ['bilan', 'Bilan de saison'],
  ['bilan-champion', 'Bilan · titre de champion'],
  ['saison', 'Classement'],
  ['finances', 'Finances'],
  ['stats', 'Statistiques'],
  ['stats-pass', 'Stats Pass d’un match'],
  ['stats-detail', 'Stats Pass · statistiques détaillées'],
  ['journal', 'Journal du club'],
  ['trophees', 'Salle des trophées (palmarès, succès, records)'],
  ['confirmation', 'Fenêtre de confirmation'],
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
  if (screen !== 'tutoriel') {
    build(s, 'main', 'training');
    for (let k = 0; k < 3; k++) playRound(s); // statistiques, forme, dernier match
    s.money = 42000;
  }
  if (screen === 'transferts' || screen === 'bureau') { // bureau construit au niveau 2 chez les supporters
    s.reputation = 8;
    s.money = 1e6;
    build(s, 'supporters', 'transfers');
    upgrade(s, 'transfers');
    s.money = 60000;
  }
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

// État d'interface de départ pour chaque écran (s est nul pour les écrans d'avant la création du club).
export function previewUi(screen, s) {
  switch (screen) {
    case 'titre': case 'accueil': return { screen: 'title' };
    case 'reglages': return { screen: 'title', titleView: 'settings' };
    case 'creation': return { screen: 'title', titleView: 'create' };
    case 'inspecteur': return { sel: { plotId: 't0', sector: 'main' } };
    case 'parcelle': return { sel: { plotId: 't2', sector: 'main' } };
    case 'effectif': return { panel: 'squad' };
    case 'fiche': return { panel: 'squad', squad: { sheet: s.players.find((p) => p.season?.apps)?.id ?? s.players[0].id } };
    case 'composition': return { panel: 'squad', squadTab: 'lineup' };
    case 'marche': return { panel: 'squad', squadTab: 'market' };
    case 'anciens': return { panel: 'squad', squadTab: 'alumni' };
    case 'transferts': return { panel: 'squad', squadTab: 'transfers' };
    case 'bureau': return { sel: { plotId: 't3', sector: 'supporters' } };
    case 'comparateur': return { panel: 'squad', squadTab: 'market', squad: { compare: true } };
    case 'saison': return { panel: 'season' };
    case 'journal': return { panel: 'journal' };
    case 'finances': return { panel: 'finances' };
    case 'stats': return { panel: 'stats' };
    case 'stats-pass': return { panel: 'stats', statsMatch: 'last' };
    case 'stats-detail': return { panel: 'stats', statsMatch: 'last' };
    case 'trophees': return { panel: 'trophies' };
    case 'avant-match': return { matchPhase: 'prematch', matchCtx: matchContext(s), matchDay: true };
    case 'direct': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { minute: 34 } };
    case 'mi-temps': return { matchPhase: 'live', matchCtx: matchContext(s), matchDay: true, live: { phase: 'halftime' } };
    case 'apres-match': return { showResult: true, matchDay: true };
    case 'menu': return { menu: true };
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
