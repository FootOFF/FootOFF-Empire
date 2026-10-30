// Ventes d'un club de championnat entre amis (1.0.2, bug relevé par le PDG) : un joueur mis en vente ne reçoit jamais
// d'offre au nom d'un club de la ligue (ami ou ordinateur), ni à la mise en vente ni après une journée ; en solo, les
// rivaux de la division font toujours partie des acheteurs. node tools/sim/ventes-ligue.mjs [essais]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vite = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const engine = await load('/src/game/engine.js');
const { refreshSales } = await load('/src/game/transfers.js');
const { valueOf } = await load('/src/game/mercato.js');

const N = Number(process.argv[2] || 400);
const LEAGUE = ['Sporting du Phare', 'Union des Quais', 'Jaunes des Trois Rivières', 'Verts du Vieux Port', 'Racing des Glycines', 'Stade des Marais', 'Étoile de la Forge'];
function club(league) {
  const s = engine.createInitialState('Olympique Clairval', null);
  if (league) {
    s.league = { code: 'ESSAI1', slot: 0, clubs: LEAGUE.map((name, i) => ({ slot: i + 1, name, human: i < 2 })) };
    s.rivals = LEAGUE.map((name, i) => ({ name, strength: 6.8, slot: i + 1, human: i < 2 }));
  }
  return s;
}
let fails = 0;
const check = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'OK ' : 'ÉCHEC'} ${label}${extra !== '' ? ` · ${extra}` : ''}`); };
for (const league of [true, false]) {
  let offers = 0;
  let fromLeague = 0;
  for (let i = 0; i < N; i++) {
    // après une journée : les clubs intéressés font leurs offres (refreshSales)
    const s1 = club(league);
    const p1 = s1.players[i % s1.players.length];
    s1.saleList = [{ id: p1.id, price: Math.round(valueOf(s1, p1) * 0.9) }];
    refreshSales(s1);
    // à la mise en vente : un club au moins se présente aussitôt (setForSale)
    const s2 = club(league);
    const p2 = s2.players[i % s2.players.length];
    const before = (s2.offers || []).length;
    engine.setForSale(s2, p2.id, true, Math.round(valueOf(s2, p2) * 0.8));
    for (const o of [...(s1.offers || []), ...(s2.offers || []).slice(before)]) {
      offers++;
      if ((league ? LEAGUE : s1.rivals.map((r) => r.name)).includes(o.club)) fromLeague++;
    }
  }
  if (league) check(`ligue : ${offers} offres reçues, aucune au nom d'un club de la ligue`, offers > 0 && fromLeague === 0, `${fromLeague} au nom d'un club de la ligue`);
  else check(`solo : les rivaux de la division restent des acheteurs`, fromLeague > 0, `${offers} offres, ${fromLeague} au nom d'un rival`);
}
await vite.close();
console.log(fails ? `${fails} échec(s)` : 'tout est bon');
