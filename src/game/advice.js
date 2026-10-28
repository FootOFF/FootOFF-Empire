import { leagueLength, nextFixture } from './cups';
import { BUILDINGS, POS_LABELS, SQUAD_MAX, YOUTH_LEAVE_AGE, YOUTH_PLACES, upgradeCost } from './constants';
import { leavingYouth } from './academy';
import { LINES, programsFor, sessionOf, staffOn, windowKey } from './training';
import { tvOpen } from './direction';
import { PLOTS, allowedBuildingsFor, plotBuilding, plotOf } from './map';
import { treatFee, treatOpen } from './medical';
import { autoLineup, fitWeight, lineupRating, slotsOf } from './tactics';
import { costOf, ratingAt, wageOf } from './players';
import { dateKey, fitGain, pendingCounters, poolOf } from './mercato';
import { capacity, duesOf, endOfSeasonForecast, expectedGate, investmentPreview, seasonForecast } from './economy';
import { standingsOf } from './season';
import { lastYear } from './contracts';

// Signaux et conseils : ce que le joueur peut faire d'utile maintenant (pastilles dorées du dock et de
// la vue 3D, recrue recommandée, bouton du staff de la colonne d'outils). Tout est calculé à partir de l'état.

const n = (v) => new Intl.NumberFormat('fr-FR').format(Math.round(v));
const money = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M€` : `${n(v)} €`);
const LINE = { G: 'Ton gardien', D: 'Ta défense', M: 'Ton milieu', A: 'Ton attaque' };
// « A, B et C »
const names = (list) => { const n = list.map((p) => p.name); return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n.at(-1)}` : n[0]; };

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

// À payer au bilan (salaires et entretien, 0.8.8) et ce qui reste réellement disponible : bandeau, travaux, mercato.
export const duesNow = (s) => duesOf(s, wageBill(s));

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
  const options = allowedBuildingsFor(s).filter((k) => k !== 'league'); // le Siège : un choix, jamais un conseil
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
// Jeunes de l'académie qui partiront à l'intersaison : on n'en parle qu'en seconde moitié de saison (0.8.2 : la
// pastille de l'Équipe restait allumée toute la saison).
const secondHalf = (s) => s.round * 2 >= leagueLength(s);
const leavingSoon = (s) => (secondHalf(s) ? leavingYouth(s) : []);

// Pastilles du menu du bas, par section (nav.jsx) : bâtiment prêt à être construit ou amélioré (Complexe), séance
// d'entraînement à faire (Équipe), offres reçues en nombre ou recrue intéressante (Mercato), saison qui finirait
// dans le rouge (Club). items : les mêmes signaux sur les onglets des sections.
export function dockSignals(s) {
  const forecast = seasonForecast(s, wageBill(s));
  const plots = actionablePlots(s);
  const deals = (s.offers || []).length + pendingCounters(s).length;
  const session = trainingTodo(s).length > 0;
  const youth = s.buildings.academy > 0 && leavingSoon(s).length > 0;
  // un blessé à soigner aujourd'hui, et de quoi payer le soin (centre médical)
  const care = s.players.some((p) => treatOpen(s, p) && s.money >= treatFee(s, p));
  const red = forecast.net < 0;
  return {
    empire: plots.some((id) => id !== 't0') ? 'dot' : null,
    // stade : seulement quand l'agrandissement est payable (0.8.2 : plus de pastille pour un stade « trop petit »)
    stadium: plots.includes('t0') ? 'dot' : null,
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

// Conseils écartés (« Masquer ») : gardés dans la partie (0.8.2 ; avant, ils revenaient au rechargement). Chaque conseil a
// un identifiant qui change avec la situation (saison, journée, niveau du stade, joueur visé…) : écarté, il ne revient
// que si elle change. Les 80 derniers suffisent.
export function dismissTip(s, id) {
  const seen = Object.keys(s.staffSeen || {}).filter((k) => k !== id).slice(-79);
  s.staffSeen = Object.fromEntries([...seen, id].map((k) => [k, 1]));
  return s;
}

// Les conseils du moment, du plus important au moins important (0.8.2) : d'abord l'argent, puis ce qui se perd si on
// attend (contrats, jeunes qui partent, droits TV de la saison, soins du jour), le match à préparer, puis ce qui fait
// grandir le club. Rien à dire : aucun conseil (plus de « prochain match » de remplissage).
export function staffTips(s) {
  if (!nextFixture(s)) return []; // fin de saison : le bilan prend le relais
  const out = [];
  const wages = wageBill(s);
  // comptes de fin de saison : ce qu'il restera après les salaires et l'entretien
  const position = standingsOf(s).findIndex((t) => t.i === 0) + 1;
  const end = endOfSeasonForecast(s, position, wages).end;
  if (end < 0) {
    out.push({
      id: `red-${s.seasonNumber}`, tone: 'warn', title: 'Fin de saison dans le rouge',
      text: `Prévision : −${money(-end)} après les salaires (${money(wages)}). Vends un remplaçant ou évite les recrues coûteuses.`,
      action: { kind: 'panel', panel: 'finances', label: 'Voir les finances' },
    });
  } else if (seasonForecast(s, wages).net < 0) {
    out.push({
      id: `wages-${s.seasonNumber}`, tone: 'warn', title: 'Masse salariale trop lourde',
      text: `Les salaires (${money(wages)}) dépassent ce que la saison doit rapporter. Vends un remplaçant, ou laisse partir un joueur en fin de contrat.`,
      action: { kind: 'panel', panel: 'finances', label: 'Voir les finances' },
    });
  }
  // contrats : en seconde moitié de saison, les joueurs en dernière année (ils partiront libres à l'intersaison)
  const ending = secondHalf(s) ? s.players.filter((p) => lastYear(s, p)) : [];
  if (ending.length) {
    const many = ending.length > 1;
    out.push({
      id: `contracts-${s.seasonNumber}-${ending.length}`,
      title: many ? `${ending.length} contrats se terminent cette saison` : `${ending[0].name} : dernière année de contrat`,
      text: `${many ? `${names(ending)} partiront` : 'Il partira'} libre${many ? 's' : ''} à l’intersaison, sans indemnité. ${many ? 'Prolonge-les depuis leur fiche ou l’onglet Contrats de la Direction, ou vends-les' : 'Prolonge-le depuis sa fiche ou l’onglet Contrats de la Direction, ou vends-le'} avant la fin de la saison.`,
      action: { kind: 'panel', panel: 'squad', ...(many ? {} : { sheet: ending[0].id }), label: many ? 'Voir l’effectif' : 'Voir sa fiche' },
    });
  }
  // académie : en seconde moitié de saison, les jeunes qui auront 19 ans à l'intersaison (ils partiront s'ils ne sont
  // pas montés en équipe première)
  const leaving = leavingSoon(s);
  if (s.buildings.academy > 0 && leaving.length) {
    const many = leaving.length > 1;
    out.push({
      id: `academy-leaving-${s.seasonNumber}`,
      title: many ? `${leaving.length} jeunes dans leur dernière saison` : `${leaving[0].name} : dernière saison à l’académie`,
      text: `${many ? `${names(leaving)} auront` : 'Il aura'} ${YOUTH_LEAVE_AGE} ans à l’intersaison. Fais-${many ? 'les' : 'le'} monter en équipe première avant la fin de la saison, sinon ${many ? 'ils quitteront' : 'il quittera'} le club.`,
      action: { kind: 'panel', panel: 'academy', tab: 'youth', ids: leaving.map((p) => p.id), label: 'Voir l’académie' },
    });
  }
  // Direction : la hausse des droits TV se demande une fois par saison, et ne vaut que pour les matchs qui suivent
  if (tvOpen(s)) {
    out.push({
      id: `tv-${s.seasonNumber}`, title: 'Négocie les droits TV de la saison',
      text: 'Une fois par saison, ta Direction peut demander au diffuseur une hausse des droits TV. Elle vaut pour les matchs qui suivent : plus tôt tu la demandes, plus elle rapporte.',
      action: { kind: 'panel', panel: 'direction', tab: 'tv', label: 'Aller à la Direction' },
    });
  }
  // centre médical : un soin possible avant le prochain match (un par blessé et par date)
  const hurt = s.players.filter((p) => treatOpen(s, p) && s.money >= treatFee(s, p));
  if (hurt.length) {
    out.push({
      id: `care-${dateKey(s)}`, title: hurt.length > 1 ? `${hurt.length} blessés à soigner` : `${hurt[0].name} peut être soigné`,
      text: hurt.length > 1
        ? `Le centre médical peut tenter de soigner ${names(hurt)} avant le prochain match : chaque soin réussi fait revenir un blessé un match plus tôt.`
        : 'Le centre médical peut tenter un soin avant le prochain match : réussi, il le fait revenir un match plus tôt.',
      action: { kind: 'panel', panel: 'medical', label: 'Aller au centre médical' },
    });
  }
  const best = autoLineup(s.players, s.formation);
  if (lineupRating(s.players, best, s.formation, fitWeight) > lineupRating(s.players, s.lineup, s.formation, fitWeight) + 0.15) {
    out.push({
      id: `lineup-${s.seasonNumber}`, title: 'Ton onze peut faire mieux',
      text: 'Des remplaçants sont plus forts ou plus frais que certains titulaires. Choisis « Onze frais » ou « Faire tourner » dans l’avant-match.',
      action: { kind: 'match', label: 'Préparer le match' },
    });
  }
  // centre d'entraînement : la séance d'avant-match n'est pas finie
  const todo = trainingTodo(s);
  if (todo.length) {
    out.push({
      id: `training-${windowKey(s)}`, title: todo.length === LINES.length ? 'Séance d’entraînement avant le match' : 'Séance d’entraînement à finir',
      text: `${todo.length > 1 ? `${todo.length} joueurs peuvent encore progresser avant le prochain match : une épreuve chacun` : 'Un joueur peut encore progresser avant le prochain match : une épreuve'}, à jouer en 3D, à simuler ou à confier au staff (réglage du centre).`,
      action: { kind: 'panel', panel: 'training', label: 'Aller à l’entraînement' },
    });
  }
  // programmes de signes distinctifs (centre niveau 3) : aucun en cours alors que des joueurs peuvent en suivre un ;
  // écarté, le rappel revient après le prochain signe appris (ou la saison suivante)
  const running = Object.keys(s.training?.programs || {}).filter((id) => s.players.some((p) => String(p.id) === id)).length;
  const eligible = (s.buildings.training || 0) >= 3 && !running ? s.players.filter((p) => programsFor(s, p).length).length : 0;
  if (eligible) {
    out.push({
      id: `programs-${s.seasonNumber}-${s.training?.learned || 0}`, title: 'Lance un programme de signes',
      text: `${eligible > 1 ? `${eligible} joueurs peuvent` : 'Un joueur peut'} apprendre un signe distinctif au centre d’entraînement (Finisseur, Passeur, Roc…) : aucun programme n’est en cours, et chacun avance à chaque séance.`,
      action: { kind: 'panel', panel: 'training', tab: 'programs', label: 'Voir les programmes' },
    });
  }
  const gate = expectedGate(s, null);
  const lvl = s.buildings.terrain;
  // les tarifs se règlent à la Direction du club (onglet Billetterie) : le conseil n'a de sens qu'une fois construite
  if (lvl >= BUILDINGS.terrain.max && s.buildings.direction > 0 && gate.demand > gate.capacity * 1.3 && ['popular', 'standard'].includes(s.ticketPolicy || 'standard')) {
    out.push({
      id: `pricing-${s.seasonNumber}`, title: 'Ton stade affiche complet',
      text: `${n(gate.demand - gate.capacity)} supporters restent dehors. Passe en tarif Premium ou Prestige : l’enceinte reste pleine et chaque billet rapporte plus.`,
      action: { kind: 'panel', panel: 'direction', tab: 'tickets', label: 'Régler les tarifs' },
    });
  }
  // stade : seulement quand l'agrandissement est payable, une fois par niveau (0.8.2 : plus de « trop petit » à chaque
  // match quand on ne peut rien y faire)
  if (lvl < BUILDINGS.terrain.max && gate.demand > gate.capacity * 1.05 && s.money >= upgradeCost('terrain', lvl + 1)) {
    out.push({
      id: `stadium-${lvl}`, title: 'Agrandis ton stade',
      text: `${n(gate.demand - gate.capacity)} supporters restent dehors à chaque match à domicile. Le niveau ${lvl + 1} offre ${n(capacity(lvl + 1))} places, et tu as les fonds.`,
      action: { kind: 'plot', plot: 't0', sector: 'main', label: 'Voir le stade' },
    });
  }
  // académie : des jeunes repérés à la journée, des places libres, et la détection pas encore regardée (vue : plus rien
  // jusqu'à la liste de la journée suivante)
  const scouted = s.scouting?.list || [];
  const free = YOUTH_PLACES - (s.youth || []).length;
  if (s.buildings.academy > 0 && scouted.length && free > 0 && !s.scouting.seen) {
    out.push({
      id: `academy-scout-${s.scouting.key}`, title: scouted.length > 1 ? 'Ton académie a repéré des jeunes' : 'Ton académie a repéré un jeune',
      text: `${scouted.length > 1 ? `${scouted.length} jeunes à recruter` : 'Un jeune à recruter'} gratuitement, et ${free > 1 ? `${free} places libres` : 'une place libre'} dans ton équipe de jeunes. La liste change au prochain repérage.`,
      action: { kind: 'panel', panel: 'academy', tab: 'scout', label: 'Voir la détection' },
    });
  }
  // académie : les recruteurs à la maison et des places libres (une fois par saison)
  if (s.buildings.academy > 0 && !s.mission && free > 0) {
    out.push({
      id: `mission-${s.seasonNumber}`, title: 'Envoie tes recruteurs en mission',
      text: `Ils ciblent un poste, un profil ou une région, et reviennent avec les jeunes les plus prometteurs qu’ils ont vus : de quoi remplir ${free > 1 ? `les ${free} places libres` : 'la place libre'} de ton équipe de jeunes.`,
      action: { kind: 'panel', panel: 'academy', tab: 'scout', label: 'Préparer une mission' },
    });
  }
  const sign = bestSigning(s);
  if (sign) {
    const weak = weakestLine(s);
    const pos = sign.player.pos;
    out.push({
      id: `sign-${sign.player.id}`,
      title: weak && weak.pos === pos ? (pos === 'G' ? 'Ton gardien est ton point faible' : `${LINE[pos]} est ta ligne la plus faible`) : 'Une recrue renforcerait ton onze',
      text: `${sign.player.name} (${POS_LABELS[pos].toLowerCase()}, niveau ${ratingAt(sign.player, pos).toFixed(1).replace('.', ',')}) ${sign.player.club ? `est à vendre (${sign.player.club}) : indemnité de ${money(sign.fee)}` : `est libre : prime à la signature de ${money(sign.fee)}`}.`,
      action: { kind: 'panel', panel: 'mercato', label: 'Voir le mercato' },
    });
  }
  const plot = actionablePlots(s).find((id) => id !== 't0');
  const key = plot ? plotBuilding(s, plot) : null;
  // bâtiment neuf : celui que conseille la vitrine s'il est payable ; jamais une dépense qui ferait finir la saison
  // dans le rouge
  const pickNew = plot && !key ? [recommendedBuilding(s), ...allowedBuildingsFor(s)].find((k) => k && s.money >= upgradeCost(k, 1)) : null;
  const spend = key ? upgradeCost(key, s.buildings[key] + 1) : pickNew ? upgradeCost(pickNew, 1) : 0;
  if (plot && (key || pickNew) && end - spend >= 0) {
    const p = PLOTS.find((q) => q.id === plot);
    const name = BUILDINGS[key || pickNew].name;
    out.push({
      id: `build-${plot}-${key ? s.buildings[key] : 0}`,
      title: key ? `Améliore : ${name}` : `Construis : ${name}`,
      text: key ? `Le niveau ${s.buildings[key] + 1} est à ta portée, et la saison finirait encore dans le vert.` : 'Une parcelle libre t’attend : tu as les fonds, et la saison finirait encore dans le vert.',
      action: { kind: 'plot', plot, sector: p.sector, label: key ? 'Voir le bâtiment' : 'Voir la parcelle' },
    });
  }
  return out;
}

// Le conseil le plus utile du moment que le joueur n'a pas écarté, ou null.
export function staffTip(s) {
  const seen = s.staffSeen || {};
  return staffTips(s).find((t) => !seen[t.id]) || null;
}
