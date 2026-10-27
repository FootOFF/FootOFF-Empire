import { leagueLength, nextFixture } from './cups';
import { BUILDINGS, POS_LABELS, SQUAD_MAX, YOUTH_LEAVE_AGE, YOUTH_PLACES, upgradeCost } from './constants';
import { leavingYouth } from './academy';
import { LINES, sessionOf, staffOn, windowKey } from './training';
import { PLOTS, allowedBuildingsFor, plotBuilding, plotOf } from './map';
import { treatFee, treatOpen } from './medical';
import { autoLineup, fitWeight, lineupRating, slotsOf } from './tactics';
import { costOf, ratingAt, wageOf } from './players';
import { fitGain, pendingCounters, poolOf } from './mercato';
import { capacity, endOfSeasonForecast, expectedGate, investmentPreview, seasonForecast } from './economy';
import { nextOpponent, standingsOf } from './season';

// Signaux et conseils : ce que le joueur peut faire d'utile maintenant (pastilles dorées du dock et de
// la vue 3D, recrue recommandée, bouton du staff de la colonne d'outils). Tout est calculé à partir de l'état.

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
// Une seule pastille pour les parcelles libres (la première), toutes ouvertes à tous les bâtiments.
export function actionablePlots(s) {
  const out = [];
  let free = false;
  for (const p of PLOTS) {
    const key = plotBuilding(s, p.id);
    if (key) {
      const lvl = s.buildings[key];
      if (lvl < BUILDINGS[key].max && s.money >= upgradeCost(key, lvl + 1)) out.push(p.id);
    } else if (!free && allowedBuildingsFor(s).some((k) => s.money >= upgradeCost(k, 1))) {
      free = true;
      out.push(p.id);
    }
  }
  return out;
}

// Bâtiment conseillé par le staff dans la vitrine de construction : le centre d'entraînement d'abord (toute
// l'équipe progresse), puis l'académie, puis celui qui rembourse le plus vite son prix et son entretien, sinon le
// premier proposé.
export function recommendedBuilding(s) {
  const options = allowedBuildingsFor(s);
  if (!options.length) return null;
  // l'académie avant les bâtiments qui rapportent : des jeunes gratuits à fort potentiel, qui font monter le club et
  // se revendent (classée sur la seule rentabilité, elle passait après tous les autres)
  if (options.includes('training')) return 'training';
  if (options.includes('academy')) return 'academy';
  const paying = options
    .map((k) => [k, investmentPreview(s, k).payback])
    .filter(([, p]) => p !== null)
    .sort((a, b) => a[1] - b[1]);
  return paying.length ? paying[0][0] : options[0];
}

// Argent qui manque pour une dépense : combien de matchs à domicile (recettes du jour, sans aléa) pour l'avoir.
export function matchesToAfford(s, missing) {
  if (missing <= 0) return 0;
  const per = expectedGate(s, null).revenue;
  return per > 0 ? Math.ceil(missing / per) : null;
}

// Lignes (gardien, défense, milieu, attaque) dont l'épreuve d'entraînement reste à faire avant le prochain match ; rien
// quand les séances sont confiées au staff (il les fera avant le match).
export function trainingTodo(s) {
  if (!s.buildings.training || !nextFixture(s) || staffOn(s)) return [];
  return LINES.filter((pos) => !sessionOf(s).done[pos] && s.players.some((p) => p.pos === pos));
}

// Épingle « Séance » posée sur le centre d'entraînement de la vue 3D : le nombre d'épreuves encore à jouer avant le
// prochain match (une par ligne), ou null.
export function sessionPin(s) {
  const todo = trainingTodo(s);
  const plot = todo.length ? plotOf(s, 'training') : null;
  return plot ? { plotId: plot.id, count: todo.length } : null;
}

const followedCount = (s) => (s.shortlist || []).filter((x) => !x.gone).length;

// Pastilles du menu du bas, par section (nav.jsx) : bâtiment prêt à être construit ou amélioré (Complexe), séance
// d'entraînement à faire (Équipe), offres reçues en nombre ou recrue intéressante (Mercato), saison qui finirait
// dans le rouge (Club). items : les mêmes signaux sur les onglets des sections.
export function dockSignals(s) {
  const forecast = seasonForecast(s, wageBill(s));
  const plots = actionablePlots(s);
  const gate = expectedGate(s, null);
  const deals = (s.offers || []).length + pendingCounters(s).length;
  const session = trainingTodo(s).length > 0;
  const youth = s.buildings.academy > 0 && leavingYouth(s).length > 0;
  // un blessé à soigner aujourd'hui, et de quoi payer le soin (centre médical)
  const care = s.players.some((p) => treatOpen(s, p) && s.money >= treatFee(s, p));
  const red = forecast.net < 0;
  return {
    empire: plots.some((id) => id !== 't0') ? 'dot' : null,
    stadium: plots.includes('t0') || (gate.demand > gate.capacity * 1.05 && s.buildings.terrain < BUILDINGS.terrain.max) ? 'dot' : null,
    squad: session || youth || care ? 'dot' : null,
    // mercato : offres reçues et contre-propositions à traiter avant la prochaine journée, en nombre
    mercato: deals || (bestSigning(s) ? 'dot' : null),
    club: red ? 'warn' : null,
    items: {
      training: session ? 'dot' : null, academy: youth ? 'dot' : null, medical: care ? 'dot' : null, finances: red ? 'dot' : null,
      'mercato:offers': deals || null, // offres et contre-propositions à traiter
      'mercato:watch': followedCount(s) ? { n: followedCount(s), tone: 'muted', label: `${followedCount(s)} joueurs suivis` } : null,
    },
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
  // académie : en seconde moitié de saison, rappel des jeunes qui auront 19 ans à l'intersaison (ils partiront s'ils
  // ne sont pas montés en équipe première)
  const leaving = s.round * 2 >= leagueLength(s) + 1 ? leavingYouth(s) : [];
  if (leaving.length) {
    const many = leaving.length > 1;
    return {
      id: `academy-leaving-${s.seasonNumber}`,
      title: many ? `${leaving.length} jeunes dans leur dernière saison` : `${leaving[0].name} : dernière saison à l’académie`,
      text: `${many ? `${leaving.map((p) => p.name).join(', ')} auront` : 'Il aura'} ${YOUTH_LEAVE_AGE} ans à l’intersaison. Fais-${many ? 'les' : 'le'} monter en équipe première avant la fin de la saison, sinon ${many ? 'ils quitteront' : 'il quittera'} le club.`,
      action: { kind: 'panel', panel: 'academy', tab: 'youth', ids: leaving.map((p) => p.id), label: 'Voir l’académie' },
    };
  }
  const best = autoLineup(s.players, s.formation);
  if (lineupRating(s.players, best, s.formation, fitWeight) > lineupRating(s.players, s.lineup, s.formation, fitWeight) + 0.15) {
    return {
      id: `lineup-${s.seasonNumber}-${s.round}`, title: 'Ton onze peut faire mieux',
      text: 'Des remplaçants sont plus forts, ou plus frais, que certains titulaires. Choisis « Meilleur onze » dans l’avant-match.',
      action: { kind: 'match', label: 'Préparer le match' },
    };
  }
  // centre d'entraînement : la séance d'avant-match n'est pas finie
  const todo = trainingTodo(s);
  if (todo.length) {
    return {
      id: `training-${windowKey(s)}`, title: todo.length === LINES.length ? 'Séance d’entraînement avant le match' : 'Séance d’entraînement à finir',
      text: `${todo.length > 1 ? `${todo.length} joueurs peuvent` : 'Un joueur peut'} encore progresser avant le prochain match : une épreuve chacun, à jouer en 3D ou à simuler, ou à confier au staff (réglage du centre).`,
      action: { kind: 'panel', panel: 'training', label: 'Aller à l’entraînement' },
    };
  }
  const gate = expectedGate(s, null);
  const lvl = s.buildings.terrain;
  // les tarifs se règlent à la Direction du club (onglet Billetterie) : le conseil n'a de sens qu'une fois construite
  if (lvl >= BUILDINGS.terrain.max && s.buildings.direction > 0 && gate.demand > gate.capacity * 1.3 && ['popular', 'standard'].includes(s.ticketPolicy || 'standard')) {
    return {
      id: `pricing-${s.seasonNumber}`, title: 'Ton stade affiche complet',
      text: `${n(gate.demand - gate.capacity)} supporters restent dehors. Passe en tarif Premium ou Prestige : l’enceinte reste pleine et chaque billet rapporte plus.`,
      action: { kind: 'panel', panel: 'direction', tab: 'tickets', label: 'Régler les tarifs' },
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
  // académie : des places libres et des jeunes repérés à recruter (une fois par saison)
  const scouted = s.scouting?.list || [];
  const free = YOUTH_PLACES - (s.youth || []).length;
  if (s.buildings.academy > 0 && scouted.length && free > 0) {
    return {
      id: `academy-scout-${s.seasonNumber}`, title: 'Ton académie a repéré des jeunes',
      text: `${scouted.length > 1 ? `${scouted.length} jeunes à recruter` : 'Un jeune à recruter'} gratuitement · ${free > 1 ? `${free} places libres` : 'une place libre'} dans ton équipe de jeunes.`,
      action: { kind: 'panel', panel: 'academy', tab: 'scout', label: 'Voir la détection' },
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
      action: { kind: 'panel', panel: 'mercato', label: 'Voir le mercato' },
    };
  }
  const plot = actionablePlots(s).find((id) => id !== 't0');
  if (plot) {
    const p = PLOTS.find((q) => q.id === plot);
    const key = plotBuilding(s, plot);
    const name = key ? BUILDINGS[key].name : BUILDINGS[allowedBuildingsFor(s).find((k) => s.money >= upgradeCost(k, 1))].name;
    return {
      id: `build-${plot}-${key ? s.buildings[key] : 0}`,
      title: key ? `Améliore : ${name}` : `Construis : ${name}`,
      text: key ? `Le niveau ${s.buildings[key] + 1} est à ta portée.` : 'Une parcelle libre t’attend, et tu as les fonds.',
      action: { kind: 'plot', plot, sector: p.sector, label: key ? 'Voir le bâtiment' : 'Voir la parcelle' },
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

