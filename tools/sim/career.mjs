// Simulation de carrières sans interface : un président automatique (raisonnable) gère le club pendant N saisons.
// Sert à vérifier l'équilibre du jeu : rythme des montées, premier titre d'Elite, trésorerie, part des salaires,
// réputation, plafond du marché, blessures. Lancer depuis la racine du dépôt :
//   node tools/sim/career.mjs [saisons=25] [carrières=6] [--detail]
// Le bot : meilleur onze (condition comprise), recrute quand une recrue renforce l'onze et que la caisse garde une
// réserve d'une demi-saison de salaires, agrandit le stade quand la demande dépasse la capacité, construit le bâtiment
// conseillé par le staff puis améliore, recrute les jeunes repérés, fait monter un jeune qui renforcerait l'onze,
// vend les joueurs qui ne jouent plus quand la masse salariale pèse trop.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { DIVISIONS, BUILDINGS, YOUTH_PLACES, upgradeCost } = await load('/src/game/constants.js');
const { autoLineup } = await load('/src/game/tactics.js');
const { bestSigning, recommendedBuilding } = await load('/src/game/advice.js');
const { allowedBuildingsFor } = await load('/src/game/map.js');
const { nextFixture } = await load('/src/game/cups.js');
const { expectedGate, seasonForecast } = await load('/src/game/economy.js');
const { playerRating, wageOf, saleValue, costOf, fitOf } = await load('/src/game/players.js');
const { teamLevel } = await load('/src/game/match.js');
const { fitGain, poolOf } = await load('/src/game/mercato.js');

const N = Number(process.argv[2] || 25);
const RUNS = Number(process.argv[3] || 6);
const DETAIL = process.argv.includes('--detail');
const fmt = (v) => Math.round(v).toLocaleString('fr-FR');
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

function manage(s) {
  const wages = s.players.reduce((a, p) => a + wageOf(p, s.divisionIndex), 0);
  const reserve = wages * 0.5;
  s.lineup = autoLineup(s.players, s.formation);
  // académie : recruter les jeunes repérés, faire monter ceux qui renforceraient l'onze
  for (const y of s.scouting?.list || []) if ((s.youth || []).length < YOUTH_PLACES) engine.signYouth(s, y.id);
  for (const y of [...(s.youth || [])]) if (fitGain(s, y) > 0 && s.players.length < 25) engine.promoteYouth(s, y.id);
  // recrutement : la recrue qui renforce le plus, si la caisse le permet
  const sign = bestSigning(s);
  if (sign && s.money - sign.fee > reserve) engine.signPlayer(s, sign.player.id);
  // masse salariale trop lourde : vendre un remplaçant qui ne joue pas (au prix d'une vente immédiate)
  if (seasonForecast(s, wages).wageShare > 0.8 && s.players.length > 16) {
    const bench = s.players.filter((p) => !s.lineup.includes(p.id)).sort((a, b) => wageOf(b, s.divisionIndex) - wageOf(a, s.divisionIndex));
    if (bench[0]) engine.sellPlayer(s, bench[0].id);
  }
  // stade : quand la demande dépasse la capacité
  const gate = expectedGate(s, null);
  if (gate.demand > gate.capacity * 1.05 && s.buildings.terrain < BUILDINGS.terrain.max && s.money - upgradeCost('terrain', s.buildings.terrain + 1) > reserve) engine.upgrade(s, 'terrain');
  // bâtiments : le conseillé d'abord, puis les améliorations avec une réserve double
  const rec = recommendedBuilding(s);
  if (rec && s.money - upgradeCost(rec, 1) > reserve) for (const plot of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) if (engine.build(s, plot, rec)) break;
  for (const k of Object.keys(BUILDINGS)) if (k !== 'terrain' && s.buildings[k] > 0 && s.buildings[k] < BUILDINGS[k].max && s.money - upgradeCost(k, s.buildings[k] + 1) > reserve * 2) engine.upgrade(s, k);
  s.lineup = autoLineup(s.players, s.formation);
}

const agg = { promo: [], elite: [], title: [], relegations: 0, red: 0, eliteTitles: 0, eliteSeasons: 0, money: {}, share: {}, rep: {}, team: {}, market: {}, injuries: 0, matches: 0 };
const band = (season) => (season <= 5 ? 'S1-5' : season <= 10 ? 'S6-10' : season <= 15 ? 'S11-15' : season <= 25 ? 'S16-25' : 'S26+');
const push = (obj, k, v) => (obj[k] ||= []).push(v);
for (let r = 0; r < RUNS; r++) {
  const s = engine.createInitialState('Club Test');
  s.tutorial = { step: 'done' };
  let firstReg = null, firstElite = null, firstTitle = null;
  for (let season = 1; season <= N; season++) {
    while (nextFixture(s)) { manage(s); engine.playRound(s); agg.matches++; agg.injuries += (s.lastMatch?.injuries || []).length; }
    const wages = s.players.reduce((a, p) => a + wageOf(p, s.divisionIndex), 0);
    const share = seasonForecast(s, wages).wageShare;
    engine.endSeason(s);
    const h = s.history.at(-1);
    const b = band(season);
    push(agg.money, b, s.money); push(agg.share, b, share); push(agg.rep, b, s.reputation); push(agg.team, b, teamLevel(s));
    push(agg.market, b, Math.max(0, ...poolOf(s).map(playerRating)));
    if (!firstReg && s.divisionIndex >= 1) firstReg = season;
    if (!firstElite && s.divisionIndex === 3) firstElite = season;
    if (h.division === 'Elite') { agg.eliteSeasons++; if (h.position === 1) { agg.eliteTitles++; if (!firstTitle) firstTitle = season; } }
    if (DIVISIONS.findIndex((d) => d.name === h.division) > s.divisionIndex) agg.relegations++;
    if (s.money < 0) agg.red++;
    if (DETAIL && r === 0) console.log(`S${String(season).padStart(2)} ${h.division.padEnd(14)} ${h.position}e  caisse ${fmt(s.money).padStart(13)} €  salaires ${Math.round(share * 100)} %  rep ${s.reputation.toFixed(0).padStart(3)}  onze ${teamLevel(s).toFixed(1)}  marché max ${Math.max(0, ...poolOf(s).map(playerRating)).toFixed(1)}  stade L${s.buildings.terrain}  effectif ${s.players.length}`);
  }
  agg.promo.push(firstReg); agg.elite.push(firstElite); agg.title.push(firstTitle);
}
console.log(`\n${RUNS} carrières de ${N} saisons`);
console.log(`première montée (médiane) : S${med(agg.promo)} · Elite : S${med(agg.elite) ?? '—'} (${agg.elite.filter(Boolean).length}/${RUNS}) · premier titre d'Elite : S${med(agg.title) ?? '—'} (${agg.title.filter(Boolean).length}/${RUNS})`);
console.log(`saisons d'Elite gagnées : ${agg.eliteSeasons ? Math.round((100 * agg.eliteTitles) / agg.eliteSeasons) : 0} % · descentes : ${agg.relegations} · fins de saison dans le rouge : ${agg.red} · blessures par match : ${(agg.injuries / agg.matches).toFixed(2)}`);
console.log('période   caisse (méd.)     salaires/revenus  réputation  onze   marché max');
for (const b of ['S1-5', 'S6-10', 'S11-15', 'S16-25', 'S26+']) {
  if (!agg.money[b]) continue;
  console.log(`${b.padEnd(9)} ${fmt(med(agg.money[b])).padStart(13)} €   ${String(Math.round(med(agg.share[b]) * 100)).padStart(3)} %             ${String(Math.round(med(agg.rep[b]))).padStart(4)}       ${med(agg.team[b]).toFixed(1)}   ${med(agg.market[b]).toFixed(1)}`);
}
await vite.close();
