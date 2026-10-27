// Simulation de carrières sans interface : un président automatique (raisonnable) gère le club pendant N saisons.
// Sert à vérifier l'équilibre du jeu : rythme des montées, premier titre d'Elite, trésorerie, part des salaires,
// réputation, plafond du marché, blessures, âge du onze, jeunes, coupes. Lancer depuis la racine du dépôt :
//   node tools/sim/career.mjs [saisons=25] [carrières=6] [--detail] [--joueur] [--sans-rotation]
// Le bot : meilleur onze (condition comprise), recrute quand une recrue renforce l'onze et que la caisse garde une
// réserve d'une demi-saison de salaires, agrandit le stade quand la demande dépasse la capacité, construit le bâtiment
// conseillé par le staff puis améliore, recrute les jeunes repérés, fait monter un jeune qui renforcerait l'onze,
// vend les joueurs qui ne jouent plus quand la masse salariale pèse trop.
// --joueur : un président qui joue comme un bon joueur humain, en plus : la séance individuelle à chaque date
// (le joueur conseillé de chaque ligne, épreuve réussie à 85 %), la bonne tactique à chaque match (3-4-3 offensive
// si l'onze vaut au moins l'adversaire, sinon 5-3-2 bloc bas), les meilleurs jeunes repérés (il libère le moins
// prometteur pour un plus prometteur) et une place faite en équipe première au jeune qui la mérite.
// --sans-rotation : le onze ne tient jamais compte de la condition physique (le meilleur onze au repos, à chaque match) :
// ce que coûte de ne jamais faire tourner.
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
const { fitGain, poolOf, saleBlock } = await load('/src/game/mercato.js');
const { LINES, bestCat, drillsFor, suggestFor } = await load('/src/game/training.js');
const { matchContext } = await load('/src/game/season.js');

const N = Number(process.argv[2] || 25);
const RUNS = Number(process.argv[3] || 6);
const DETAIL = process.argv.includes('--detail');
const HUMAN = process.argv.includes('--joueur');
const SCORE = Number(process.env.SCORE || 0.85); // score d'un bon joueur aux épreuves en 3D
const NO_ROTATION = process.argv.includes('--sans-rotation');
// onze du match : le meilleur, condition comprise (« Meilleur onze »), ou sans jamais regarder la condition
const xiOf = (s) => (NO_ROTATION ? autoLineup(s.players.map((p) => ({ ...p, fit: 100 })), s.formation) : autoLineup(s.players, s.formation));
const fmt = (v) => Math.round(v).toLocaleString('fr-FR');
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

function manage(s) {
  const wages = s.players.reduce((a, p) => a + wageOf(p, s.divisionIndex), 0);
  const reserve = wages * 0.5;
  s.lineup = xiOf(s);
  // académie : recruter les jeunes repérés, faire monter ceux qui renforceraient l'onze
  if (HUMAN) {
    // les plus prometteurs d'abord ; académie pleine : le moins prometteur laisse sa place (le potentiel se lit sur la fiche)
    for (const y of [...(s.scouting?.list || [])].sort((a, b) => b.pot - a.pot)) {
      if ((s.youth || []).length >= YOUTH_PLACES) {
        const worst = [...s.youth].sort((a, b) => a.pot - b.pot)[0];
        if (!worst || worst.pot >= y.pot - 1) continue;
        engine.releaseYouth(s, worst.id);
      }
      engine.signYouth(s, y.id);
    }
    // place faite en équipe première : le remplaçant le plus faible part pour le jeune qui renforce l'onze
    for (const y of [...(s.youth || [])]) {
      if (fitGain(s, y) <= 0) continue;
      if (s.players.length >= 25) {
        const out = s.players.filter((p) => !s.lineup.includes(p.id) && !saleBlock(s, p)).sort((a, b) => playerRating(a) - playerRating(b))[0];
        if (!out || playerRating(out) >= playerRating(y)) continue;
        engine.sellPlayer(s, out.id);
      }
      engine.promoteYouth(s, y.id);
      s.lineup = xiOf(s);
    }
  } else {
    for (const y of s.scouting?.list || []) if ((s.youth || []).length < YOUTH_PLACES) engine.signYouth(s, y.id);
    for (const y of [...(s.youth || [])]) if (fitGain(s, y) > 0 && s.players.length < 25) engine.promoteYouth(s, y.id);
  }
  // recrutement : la recrue qui renforce le plus, si la caisse le permet
  const sign = bestSigning(s);
  if (sign && s.money - sign.fee > reserve) engine.signPlayer(s, sign.player.id);
  // masse salariale trop lourde : vendre un remplaçant qui ne joue pas et qui peut être vendu (saleBlock), à 85 % de sa valeur
  if (seasonForecast(s, wages).wageShare > 0.8 && s.players.length > 16) {
    const bench = s.players.filter((p) => !s.lineup.includes(p.id) && !saleBlock(s, p)).sort((a, b) => wageOf(b, s.divisionIndex) - wageOf(a, s.divisionIndex));
    if (bench[0]) engine.sellPlayer(s, bench[0].id);
  }
  // stade : quand la demande dépasse la capacité
  const gate = expectedGate(s, null);
  if (gate.demand > gate.capacity * 1.05 && s.buildings.terrain < BUILDINGS.terrain.max && s.money - upgradeCost('terrain', s.buildings.terrain + 1) > reserve) engine.upgrade(s, 'terrain');
  // bâtiments : le conseillé d'abord, puis les améliorations avec une réserve double
  const rec = recommendedBuilding(s);
  if (rec && s.money - upgradeCost(rec, 1) > reserve) for (const plot of ['t1', 't2', 't3', 't4', 't5', 't6', 't7']) if (engine.build(s, plot, rec)) break;
  for (const k of Object.keys(BUILDINGS)) if (k !== 'terrain' && s.buildings[k] > 0 && s.buildings[k] < BUILDINGS[k].max && s.money - upgradeCost(k, s.buildings[k] + 1) > reserve * 2) engine.upgrade(s, k);
  s.lineup = xiOf(s);
  if (HUMAN) {
    // séance individuelle de la date : le joueur conseillé de chaque ligne, sa catégorie conseillée, l'épreuve la plus récente
    const lvl = s.buildings.training || 0;
    if (lvl) for (const pos of LINES) {
      const p = suggestFor(s, pos);
      if (!p) continue;
      const cat = bestCat(s, p);
      const drills = drillsFor(lvl, pos, cat);
      engine.trainPlayer(s, pos, { id: p.id, cat, drill: drills[drills.length - 1], score: SCORE });
    }
    // tactique du match : favori, 3-4-3 offensive ; outsider, 5-3-2 bloc bas
    const ctx = matchContext(s);
    if (ctx) {
      const strong = teamLevel(s) >= ctx.opp.strength;
      s.formation = strong ? '343' : '532';
      s.tactic = strong ? 'offensive' : 'low';
      s.lineup = xiOf(s);
    }
  }
}
const ageOfXi = (s) => { const xi = s.players.filter((p) => s.lineup?.includes(p.id)); return xi.reduce((a, p) => a + p.age, 0) / Math.max(1, xi.length); };

const agg = { promo: [], elite: [], title: [], euro: [], relegations: 0, red: 0, eliteTitles: 0, eliteSeasons: 0, money: {}, share: {}, rep: {}, team: {}, market: {}, age: {}, young: {}, gap: {}, injuries: 0, matches: 0, cups: 0, euros: 0, euroSeasons: 0, kickFit: 0, tired: 0, spent: 0, out: 0, wins: 0 };
// condition du onze au coup d'envoi (moyenne des titulaires, titulaires sous 70 % et sous 50 %), absences (dates)
function kickoff(s) {
  const xi = s.lineup.map((id) => s.players.find((p) => p.id === id)).filter(Boolean);
  agg.kickFit += xi.reduce((a, p) => a + fitOf(p), 0) / Math.max(1, xi.length);
  agg.tired += xi.filter((p) => fitOf(p) < 70).length;
  agg.spent += xi.filter((p) => fitOf(p) < 50).length;
}
const band = (season) => (season <= 5 ? 'S1-5' : season <= 10 ? 'S6-10' : season <= 15 ? 'S11-15' : season <= 25 ? 'S16-25' : 'S26+');
const push = (obj, k, v) => (obj[k] ||= []).push(v);
for (let r = 0; r < RUNS; r++) {
  const s = engine.createInitialState('Club Test');
  s.tutorial = { step: 'done' };
  let firstReg = null, firstElite = null, firstTitle = null, firstEuro = null;
  for (let season = 1; season <= N; season++) {
    while (nextFixture(s)) {
      manage(s);
      kickoff(s);
      engine.playRound(s);
      agg.matches++;
      if (s.lastMatch?.gf > s.lastMatch?.ga) agg.wins++;
      for (const inj of s.lastMatch?.injuries || []) { agg.injuries++; agg.out += s.players.find((p) => p.id === inj.id)?.injury?.total || 0; }
    }
    const wages = s.players.reduce((a, p) => a + wageOf(p, s.divisionIndex), 0);
    const share = seasonForecast(s, wages).wageShare;
    s.lineup = xiOf(s);
    const age = ageOfXi(s);
    const young = s.players.filter((p) => s.lineup.includes(p.id) && p.age <= 21).length;
    const gap = teamLevel(s) - (DIVISIONS[s.divisionIndex].oppMin + DIVISIONS[s.divisionIndex].oppMax) / 2; // onze contre le milieu de la division
    if (s.c1) agg.euroSeasons++;
    engine.endSeason(s);
    const h = s.history.at(-1);
    const b = band(season);
    push(agg.money, b, s.money); push(agg.share, b, share); push(agg.rep, b, s.reputation); push(agg.team, b, teamLevel(s));
    push(agg.market, b, Math.max(0, ...poolOf(s).map(playerRating)));
    push(agg.age, b, age); push(agg.young, b, young); push(agg.gap, b, gap);
    const won = (s.trophies || []).filter((t) => t.season === season);
    agg.cups += won.filter((t) => t.comp === 'cup').length;
    if (won.some((t) => t.comp === 'c1')) { agg.euros++; if (!firstEuro) firstEuro = season; }
    if (!firstReg && s.divisionIndex >= 1) firstReg = season;
    if (!firstElite && s.divisionIndex === 3) firstElite = season;
    if (h.division === 'Elite') { agg.eliteSeasons++; if (h.position === 1) { agg.eliteTitles++; if (!firstTitle) firstTitle = season; } }
    if (DIVISIONS.findIndex((d) => d.name === h.division) > s.divisionIndex) agg.relegations++;
    if (s.money < 0) agg.red++;
    if (DETAIL && r === 0) console.log(`S${String(season).padStart(2)} ${h.division.padEnd(14)} ${h.position}e  caisse ${fmt(s.money).padStart(13)} €  salaires ${Math.round(share * 100)} %  rep ${s.reputation.toFixed(0).padStart(3)}  onze ${teamLevel(s).toFixed(1)} (${gap >= 0 ? '+' : ''}${gap.toFixed(1)})  âge ${age.toFixed(1)}  ≤21 ans ${young}  marché max ${Math.max(0, ...poolOf(s).map(playerRating)).toFixed(1)}  stade L${s.buildings.terrain}  effectif ${s.players.length}${won.length ? `  ${won.map((t) => (t.comp === 'c1' ? 'EUROPE' : t.comp === 'cup' ? 'coupe' : 'titre')).join(' + ')}` : ''}`);
  }
  agg.promo.push(firstReg); agg.elite.push(firstElite); agg.title.push(firstTitle); agg.euro.push(firstEuro);
}
console.log(`\n${RUNS} carrières de ${N} saisons${HUMAN ? ' · président « joueur »' : ''}`);
console.log(`première montée (médiane) : S${med(agg.promo)} · Elite : S${med(agg.elite) ?? '—'} (${agg.elite.filter(Boolean).length}/${RUNS}) · premier titre d'Elite : S${med(agg.title) ?? '—'} (${agg.title.filter(Boolean).length}/${RUNS}) · première Coupe d'Europe : S${med(agg.euro) ?? '—'} (${agg.euro.filter(Boolean).length}/${RUNS})`);
console.log(`saisons d'Elite gagnées : ${agg.eliteSeasons ? Math.round((100 * agg.eliteTitles) / agg.eliteSeasons) : 0} % · Coupes d'Europe gagnées : ${agg.euros}/${agg.euroSeasons} participations · Coupes nationales : ${agg.cups} · descentes : ${agg.relegations} · fins de saison dans le rouge : ${agg.red} · blessures par match : ${(agg.injuries / agg.matches).toFixed(2)}`);
console.log(`condition du onze au coup d'envoi : ${(agg.kickFit / agg.matches).toFixed(1)} % en moyenne · titulaires sous 70 % : ${(agg.tired / agg.matches).toFixed(2)} par match, sous 50 % : ${(agg.spent / agg.matches).toFixed(2)} · blessures : ${(agg.injuries / agg.matches).toFixed(2)} par match, ${(agg.out / Math.max(1, agg.injuries)).toFixed(1)} dates d'absence en moyenne · matchs gagnés : ${Math.round((100 * agg.wins) / agg.matches)} %`);
console.log('période   caisse (méd.)     salaires/revenus  réputation  onze (écart)   âge du onze  ≤21 ans  marché max');
for (const b of ['S1-5', 'S6-10', 'S11-15', 'S16-25', 'S26+']) {
  if (!agg.money[b]) continue;
  const g = med(agg.gap[b]);
  console.log(`${b.padEnd(9)} ${fmt(med(agg.money[b])).padStart(13)} €   ${String(Math.round(med(agg.share[b]) * 100)).padStart(3)} %             ${String(Math.round(med(agg.rep[b]))).padStart(4)}       ${med(agg.team[b]).toFixed(1)} (${g >= 0 ? '+' : ''}${g.toFixed(1)})    ${med(agg.age[b]).toFixed(1)}         ${med(agg.young[b])}        ${med(agg.market[b]).toFixed(1)}`);
}
await vite.close();
