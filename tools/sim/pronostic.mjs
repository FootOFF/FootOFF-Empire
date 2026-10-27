// Vérification du pronostic (« les chances affichées sont exactes ») : des milliers de matchs joués par le vrai moteur
// du direct (live.js), comparés aux chances annoncées avant le coup d'envoi (prematchOdds, celles de l'avant-match) et
// pendant le match (oddsShown, celles de l'écran du direct). Lancer depuis la racine du dépôt :
//   node tools/sim/pronostic.mjs [matchs=20000]
// Chaque match : un effectif tiré au hasard (niveau de 5 à 18, condition physique variée, signes distinctifs), un
// adversaire de 4 points en dessous à 4 points au-dessus, dispositif et tactique au hasard, une coupe une fois sur quatre
// (tirs au but), un match de championnat sur trois à l'extérieur (Elite : l'avantage du terrain change de camp). Trois façons de jouer chaque match : d'un bloc (le staff remplace les blessés), en direct en remplaçant
// chaque blessé comme le direct le propose, et à dix après chaque blessure (le pronostic suppose un blessé remplacé : il
// y est un peu optimiste). Une tranche bien calibrée a un écart proche de zéro (moins de deux erreurs types).
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { available, makePlayer, ratingAt } = await load('/src/game/players.js');
const { FORMATION_ORDER, TACTIC_ORDER, autoLineup, lineupRating, slotsOf } = await load('/src/game/tactics.js');
const { SUBS_MAX, createLiveMatch, prematchOdds } = await load('/src/game/live.js');
const { penaltySkills, shootoutWinChance } = await load('/src/game/cups.js');
const { clamp, pick, ri, rnd } = await load('/src/game/utils.js');

const N = Number(process.argv[2] || 20000);
const MARKS = [30, 60, 75, 85]; // minutes de jeu où l'on relève le pronostic du direct (et la mi-temps)

// Club tiré au hasard : onze et remplaçants autour d'un niveau, condition physique d'avant-match variée.
function randomClub() {
  const s = engine.createInitialState('Club Test');
  const level = rnd(0, 6.4); // note moyenne de 5,3 à 18 (makePlayer)
  s.players = [];
  for (const pos of ['G', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'A', 'A', 'A', 'G', 'D', 'D', 'M', 'M', 'A', 'A']) {
    const p = makePlayer({ level: level + rnd(-0.6, 0.6), pos });
    p.id = s.nextId++;
    p.fit = Math.random() < 0.5 ? 100 : Math.round(rnd(45, 100));
    s.players.push(p);
  }
  s.formation = pick(FORMATION_ORDER);
  s.tactic = pick(TACTIC_ORDER);
  s.lineup = autoLineup(s.players, s.formation);
  s.buildings.medical = ri(0, 5);
  return s;
}

// Un match joué minute par minute ; replace : chaque blessé est remplacé à la minute suivante par le meilleur
// remplaçant disponible à son poste (s'il reste un changement), comme quand tu acceptes le changement que le direct
// propose ; sinon l'équipe finit à dix. marks : relevés du pronostic du direct.
function play(s, ctx, { replace = false, marks = false } = {}) {
  const lm = createLiveMatch(s, ctx);
  const m = lm.state;
  const seen = [];
  for (const half of [1, 2]) {
    lm.beginHalf(half);
    while (!lm.halfDone) {
      const minute = lm.simTo + 1;
      const before = m.injuries.length;
      lm.advanceTo(minute);
      if (replace && m.injuries.length > before && !lm.halfDone) {
        for (const inj of m.injuries.slice(before)) {
          const k = m.lineup.indexOf(inj.id);
          if (k < 0 || m.subsUsed >= SUBS_MAX) continue;
          const slot = slotsOf(m.formation)[k];
          const bench = s.players.filter((p) => !m.lineup.includes(p.id) && !m.gone.has(p.id) && available(p))
            .sort((a, b) => ratingAt(b, slot) - ratingAt(a, slot));
          if (!bench.length) continue;
          const next = [...m.lineup];
          next[k] = bench[0].id;
          lm.change(lm.simTo + 1, { lineup: next });
        }
      }
      if (marks && MARKS.includes(minute) && !lm.halfDone) {
        seen.push({ at: minute, odds: lm.oddsShown(minute, [...lm.eventsOf(1), ...(half === 2 ? lm.eventsOf(2) : [])]) });
      }
    }
    if (marks && half === 1) seen.push({ at: 'mi-temps', odds: lm.oddsShown(lm.halfEnd, lm.eventsOf(1)) });
  }
  const { home, away } = m.score;
  const outcome = home > away ? 'win' : home === away ? 'draw' : 'loss';
  const qualified = home > away || (home === away && m.pens && m.pens[0] > m.pens[1]);
  return { outcome, qualified, seen };
}

// Match joué d'un bloc, comme le moteur le fait sans toi (quickMatch) : le staff remplace les blessés.
function block(s, ctx) {
  const lm = createLiveMatch(s, ctx);
  lm.playHalf(1);
  lm.playHalf(2);
  const { home, away } = lm.state.score;
  const pens = lm.state.pens;
  return { outcome: home > away ? 'win' : home === away ? 'draw' : 'loss', qualified: home > away || (home === away && pens && pens[0] > pens[1]) };
}

const games = [];
const live = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const s = randomClub();
  const rating = lineupRating(s.players, s.lineup, s.formation);
  const knockout = Math.random() < 0.25;
  const away = !knockout && Math.random() < 1 / 3; // match à l'extérieur (Elite)
  const ctx = { opp: { name: 'Adversaire', strength: Math.round(clamp(rating + rnd(-4, 4), 3, 19.5) * 10) / 10 }, comp: knockout ? 'cup' : 'league', knockout, home: !away };
  const odds = prematchOdds(s, { oppStrength: ctx.opp.strength, home: !away });
  const xi = s.lineup.map((id) => s.players.find((p) => p.id === id)).filter(Boolean);
  const pens = penaltySkills(xi);
  const qualify = knockout ? odds.win + odds.draw * shootoutWinChance(pens.home, pens.away) : null;
  const a = block(s, ctx); // match joué d'un bloc : le staff remplace les blessés
  const b = play(s, ctx, { replace: true, marks: true }); // direct : blessés remplacés, pronostic relevé
  const c = play(s, ctx); // à dix après chaque blessure (aucun changement)
  games.push({ odds, knockout, away, qualify, a, b, c });
  for (const x of b.seen) live.push({ at: x.at, odds: x.odds, outcome: b.outcome });
}

const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')} %`;
const sign = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}`;
// Tableau de calibrage : par tranche de chances annoncées, la moyenne annoncée, la fréquence constatée, l'écart et
// l'erreur type de la tranche (au hasard près, l'écart reste sous deux erreurs types).
function table(title, rows, bins) {
  console.log(`\n${title}`);
  console.log('tranche        matchs   annoncé   constaté   écart   (erreur type)');
  let worst = 0;
  for (let b = 0; b < bins.length - 1; b++) {
    const r = rows.filter((x) => x.p >= bins[b] && x.p < bins[b + 1]);
    if (r.length < 50) continue;
    const said = r.reduce((t, x) => t + x.p, 0) / r.length;
    const got = r.filter((x) => x.hit).length / r.length;
    const se = Math.sqrt((said * (1 - said)) / r.length);
    worst = Math.max(worst, Math.abs(got - said) / se);
    console.log(`${`${Math.round(bins[b] * 100)}-${Math.round(bins[b + 1] * 100)} %`.padEnd(13)} ${String(r.length).padStart(7)}   ${pct(said).padStart(7)}   ${pct(got).padStart(8)}   ${sign(got - said).padStart(5)}   (${(se * 100).toFixed(1).replace('.', ',')})`);
  }
  const all = rows.reduce((t, x) => t + x.p, 0) / rows.length;
  const hit = rows.filter((x) => x.hit).length / rows.length;
  console.log(`ensemble       ${String(rows.length).padStart(7)}   ${pct(all).padStart(7)}   ${pct(hit).padStart(8)}   ${sign(hit - all).padStart(5)}   · plus grand écart : ${worst.toFixed(1).replace('.', ',')} erreurs types`);
}
const DECILES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
const DRAWS = [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 1.0001];

console.log(`${N} matchs simulés en ${Math.round((Date.now() - t0) / 1000)} s (dont ${games.filter((g) => g.knockout).length} matchs de coupe, ${games.filter((g) => g.away).length} à l’extérieur)`);
for (const [mode, key] of [['match joué d’un bloc (le staff remplace les blessés)', 'a'], ['direct, blessés remplacés', 'b'], ['à dix après chaque blessure', 'c']]) {
  console.log(`\n=== Avant-match, ${mode} ===`);
  table('Victoire', games.map((g) => ({ p: g.odds.win, hit: g[key].outcome === 'win' })), DECILES);
  table('Nul', games.map((g) => ({ p: g.odds.draw, hit: g[key].outcome === 'draw' })), DRAWS);
  table('Défaite', games.map((g) => ({ p: g.odds.loss, hit: g[key].outcome === 'loss' })), DECILES);
  table('Qualification en coupe', games.filter((g) => g.knockout).map((g) => ({ p: g.qualify, hit: g[key].qualified })), DECILES);
}
console.log('\n=== Avant-match selon le lieu (match joué d’un bloc) ===');
for (const [where, keep] of [['à domicile', (g) => !g.away], ['à l’extérieur', (g) => g.away]]) {
  const rows = games.filter(keep);
  table(`Victoire ${where}`, rows.map((g) => ({ p: g.odds.win, hit: g.a.outcome === 'win' })), DECILES);
  table(`Défaite ${where}`, rows.map((g) => ({ p: g.odds.loss, hit: g.a.outcome === 'loss' })), DECILES);
}
console.log('\n=== Pronostic du direct (blessés remplacés) ===');
for (const at of [30, 'mi-temps', 60, 75, 85]) {
  const rows = live.filter((x) => x.at === at);
  table(`Victoire annoncée à ${at === 'mi-temps' ? 'la mi-temps' : `la ${at}e minute`}`, rows.map((x) => ({ p: x.odds.win, hit: x.outcome === 'win' })), DECILES);
}
table('Nul annoncé pendant le match (toutes minutes)', live.map((x) => ({ p: x.odds.draw, hit: x.outcome === 'draw' })), DECILES);
await vite.close();
