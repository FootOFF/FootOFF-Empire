import { nextFixture } from './cups';
import { BUILDINGS, POS_LABELS, SQUAD_MAX, upgradeCost } from './constants';
import { PLOTS, allowedBuildingsFor, isSectorUnlocked, nextLockedSector, plotBuilding } from './map';
import { autoLineup, lineupRating, slotsOf } from './tactics';
import { costOf, ratingAt, wageOf } from './players';
import { fitGain, pendingCounters, poolOf } from './mercato';
import { capacity, endOfSeasonForecast, expectedGate, seasonForecast } from './economy';
import { nextOpponent, standingsOf } from './season';

// Signaux et conseils : ce que le joueur peut faire d'utile maintenant (pastilles dorées du dock et de
// la vue 3D, recrue recommandée, carte « Conseil du staff »). Tout est calculé à partir de l'état.

const n = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v));
const money = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€` : `${n(v)} €`);
const LINE = { G: 'Ton gardien', D: 'Ta défense', M: 'Ton milieu', A: 'Ton attaque' };

// Ligne la plus faible de l'onze aligné (moyenne des notes à leur poste).
export function weakestLine(s) {
  const lines = { G: [], D: [], M: [], A: [] };
  const slots = slotsOf(s.formation);
  s.lineup.forEach((id, k) => {
    const p = s.players.find((q) => q.id === id);
    if (p && slots[k]) lines[slots[k]].push(ratingAt(p, slots[k]));
  });
  let weak = null;
  for (const pos of ['A', 'M', 'D', 'G']) {
    const a = lines[pos];
    if (!a.length) continue;
    const avg = a.reduce((x, y) => x + y, 0) / a.length;
    if (!weak || avg < weak.avg) weak = { pos, avg };
  }
  return weak;
}

// Recrue abordable qui améliore le plus l'onze (elle remplace le titulaire le plus faible à son poste).
// Recrue recommandée : sur tout le mercato (joueurs libres et sous contrat), celle qui renforce le plus l'onze parmi
// celles qu'on peut s'offrir au prix demandé.
export function bestSigning(s) {
  if (s.players.length >= SQUAD_MAX) return null;
  let best = null;
  for (const p of poolOf(s)) {
    const fee = costOf(p, s);
    if (fee > s.money) continue;
    const gain = fitGain(s, p);
    if (gain >= 0.5 && (!best || gain > best.gain)) best = { player: p, fee, gain };
  }
  return best;
}

const wageBill = (s) => s.players.reduce((a, p) => a + wageOf(p, s.divisionIndex), 0);

// Trésorerie prévue au coup de sifflet final de la saison (matchs restants, sponsors, prime au classement actuel,
// moins salaires et entretien) : sert à prévenir avant une dépense qui ferait finir la saison dans le rouge.
export function seasonEndForecast(s) {
  const position = standingsOf(s).findIndex((t) => t.i === 0) + 1;
  return endOfSeasonForecast(s, position, wageBill(s)).end;
}

// Parcelles où une construction ou une amélioration est payable tout de suite (pastilles dorées 3D).
// Une seule pastille par secteur pour les parcelles libres.
export function actionablePlots(s) {
  const out = [];
  const freeSectors = new Set();
  for (const p of PLOTS) {
    if (!isSectorUnlocked(s, p.sector)) continue;
    const key = plotBuilding(s, p.id);
    if (key) {
      const lvl = s.buildings[key];
      if (lvl < BUILDINGS[key].max && s.money >= upgradeCost(key, lvl + 1)) out.push(p.id);
    } else if (!freeSectors.has(p.sector) && allowedBuildingsFor(s, p.sector).some((k) => s.money >= upgradeCost(k, 1))) {
      freeSectors.add(p.sector);
      out.push(p.id);
    }
  }
  return out;
}

// Pastilles du dock : recrue intéressante ou salaires dangereux (Effectif), stade à agrandir (Stade),
// bâtiment prêt à être construit ou amélioré (Empire).
export function dockSignals(s) {
  const forecast = seasonForecast(s, wageBill(s));
  const plots = actionablePlots(s);
  const gate = expectedGate(s, null);
  return {
    // mercato : offres reçues et contre-propositions à traiter avant la prochaine journée, en nombre
    squad: forecast.net < 0 ? 'warn' : ((s.offers || []).length + pendingCounters(s).length) || (bestSigning(s) ? 'dot' : null),
    stadium: plots.includes('t0') || (gate.demand > gate.capacity * 1.05 && s.buildings.terrain < BUILDINGS.terrain.max) ? 'dot' : null,
    empire: plots.some((id) => id !== 't0') ? 'dot' : null,
  };
}

// Le conseil le plus utile du moment, par ordre de priorité.
export function staffTip(s) {
  if (!nextFixture(s)) return null; // fin de saison : le bilan prend le relais
  const wages = wageBill(s);
  // comptes de fin de saison : ce qu'il restera après les salaires et l'entretien
  const position = standingsOf(s).findIndex((t) => t.i === 0) + 1;
  const end = endOfSeasonForecast(s, position, wages).end;
  if (end < 0) {
    return {
      id: `red-${s.seasonNumber}`, tone: 'warn', title: 'Fin de saison dans le rouge',
      text: `Prévision : −${money(-end)} après les salaires (${money(wages)}). Vends un remplaçant ou évite les recrues coûteuses.`,
      action: { kind: 'panel', panel: 'finances', label: 'Voir les finances' },
    };
  }
  const forecast = seasonForecast(s, wages);
  if (forecast.net < 0) {
    return {
      id: 'wages', tone: 'warn', title: 'Masse salariale trop lourde',
      text: `Les salaires (${money(wages)}) dépassent ce que la saison doit rapporter. Vends un remplaçant ou agrandis le stade.`,
      action: { kind: 'panel', panel: 'finances', label: 'Voir les finances' },
    };
  }
  const best = autoLineup(s.players, s.formation);
  if (lineupRating(s.players, best, s.formation) > lineupRating(s.players, s.lineup, s.formation) + 0.15) {
    return {
      id: `lineup-${s.seasonNumber}-${s.round}`, title: 'Ton onze peut faire mieux',
      text: 'Des remplaçants sont plus forts que certains titulaires. Touche « Meilleur onze » dans l’avant-match.',
      action: { kind: 'match', label: 'Préparer le match' },
    };
  }
  const gate = expectedGate(s, null);
  const lvl = s.buildings.terrain;
  if (lvl >= BUILDINGS.terrain.max && gate.demand > gate.capacity * 1.3 && ['popular', 'standard'].includes(s.ticketPolicy || 'standard')) {
    return {
      id: `pricing-${s.seasonNumber}`, title: 'Ton stade affiche complet',
      text: `${n(gate.demand - gate.capacity)} supporters restent dehors. Passe en tarif Premium ou Prestige : l’enceinte reste pleine et chaque billet rapporte plus.`,
      action: { kind: 'plot', plot: 't0', sector: 'main', label: 'Régler les tarifs' },
    };
  }
  if (lvl < BUILDINGS.terrain.max && gate.demand > gate.capacity * 1.05) {
    const cost = upgradeCost('terrain', lvl + 1);
    const out = gate.demand - gate.capacity;
    return {
      id: `stadium-${lvl}`, title: s.money >= cost ? 'Agrandis ton stade' : 'Ton stade est trop petit',
      text: s.money >= cost
        ? `${n(out)} supporters restent dehors à chaque match. Le niveau ${lvl + 1} offre ${n(capacity(lvl + 1))} places.`
        : `${n(out)} supporters restent dehors à chaque match. Objectif : ${money(cost)} pour passer à ${n(capacity(lvl + 1))} places.`,
      action: { kind: 'plot', plot: 't0', sector: 'main', label: 'Voir le stade' },
    };
  }
  const sign = bestSigning(s);
  if (sign) {
    const weak = weakestLine(s);
    const pos = sign.player.pos;
    return {
      id: `sign-${sign.player.id}`,
      title: weak && weak.pos === pos ? `${LINE[pos]} est ta ligne la plus faible` : 'Une recrue renforcerait ton onze',
      text: `${sign.player.name} (${POS_LABELS[pos].toLowerCase()}, note ${ratingAt(sign.player, pos).toFixed(1).replace('.', ',')}) ${sign.player.club ? `est à vendre (${sign.player.club}) pour` : 'est libre pour'} ${money(sign.fee)}.`,
      action: { kind: 'panel', panel: 'squad', tab: 'market', label: 'Voir le mercato' },
    };
  }
  const plot = actionablePlots(s).find((id) => id !== 't0');
  if (plot) {
    const p = PLOTS.find((q) => q.id === plot);
    const key = plotBuilding(s, plot);
    const name = key ? BUILDINGS[key].name : BUILDINGS[allowedBuildingsFor(s, p.sector).find((k) => s.money >= upgradeCost(k, 1))].name;
    return {
      id: `build-${plot}-${key ? s.buildings[key] : 0}`,
      title: key ? `Améliore : ${name}` : `Construis : ${name}`,
      text: key ? `Le niveau ${s.buildings[key] + 1} est à ta portée.` : 'Une parcelle libre t’attend, et tu as les fonds.',
      action: { kind: 'plot', plot, sector: p.sector, label: key ? 'Voir le bâtiment' : 'Voir la parcelle' },
    };
  }
  const locked = nextLockedSector(s);
  if (locked && locked.repNeeded - s.reputation <= 2) {
    return {
      id: `sector-${locked.id}`, title: `${locked.name} en approche`,
      text: `Plus que ${Math.ceil(locked.repNeeded - s.reputation)} de réputation : chaque victoire te rapproche de l’ouverture.`,
      action: { kind: 'match', label: 'Jouer le match' },
    };
  }
  const opp = nextOpponent(s);
  return opp
    ? {
      id: `match-${s.seasonNumber}-${s.round}`, title: `Prochain match : ${opp.name}`,
      text: 'Une victoire rapporte de la réputation et remplit les tribunes.',
      action: { kind: 'match', label: 'Jouer le match' },
    }
    : null;
}

