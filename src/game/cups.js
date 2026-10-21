import { DIVISIONS } from './constants';
import { randomClubName } from './names';
import { clamp, pick, rnd } from './utils';

// Coupes : la Coupe nationale (tous les clubs du pays, à élimination directe) et la C1 (coupe d'Europe des
// champions, réservée aux deux premiers de l'Elite la saison précédente). Quatre tours chacune, matchs à
// élimination directe : en cas d'égalité après 90 minutes, tirs au but. Les tours s'intercalent entre les journées
// du championnat ; un club éliminé saute simplement les dates restantes.

export const COMPS = {
  league: { id: 'league', name: 'Championnat', short: 'Championnat' },
  cup: { id: 'cup', name: 'Coupe nationale', short: 'Coupe' },
  c1: { id: 'c1', name: 'C1, la coupe d’Europe des champions', short: 'C1' },
};
export const STAGES = ['Huitièmes de finale', 'Quarts de finale', 'Demi-finale', 'Finale'];
export const STAGES_SHORT = ['8es', 'Quarts', 'Demies', 'Finale'];

// ordre de la saison : championnat, puis les tours de coupe glissés entre les journées
const ORDER = [
  ['league'], ['league'], ['cup', 0], ['league'], ['c1', 0], ['league'], ['cup', 1], ['c1', 1],
  ['league'], ['cup', 2], ['c1', 2], ['league'], ['cup', 3], ['league'], ['c1', 3],
];

// Primes : Coupe nationale à l'échelle de la division (part de la prime du champion), C1 en montants européens.
const CUP_SHARE = [0.06, 0.12, 0.25, 0.75]; // tour gagné
export const C1_ENTRY = 4000000; // participation
const C1_WIN = [2500000, 4000000, 6500000, 15000000];

export const cupPrize = (comp, stage, divIndex) => (comp === 'c1' ? C1_WIN[stage] : Math.round(DIVISIONS[divIndex].prize * CUP_SHARE[stage]));

// Clubs européens fictifs (aucun vrai club) : un préfixe et une ville imaginaire.
const EURO_PREFIX = ['Real', 'Inter', 'Sporting', 'Dynamo', 'Athletic', 'Union', 'Olympia', 'Rapid', 'Vitoria', 'Royal'];
const EURO_CITY = ['Valmora', 'Castellano', 'Lisvar', 'Kravets', 'Norrhavn', 'Melithi', 'Bergamonte', 'Aldenburg', 'Zurvic',
  'Halmstrand', 'Corvina', 'Ostrava Nova', 'Belmira', 'Sankt Arlen', 'Varnacci', 'Tirelli', 'Doruva', 'Lindhaven'];
const euroName = () => `${pick(EURO_PREFIX)} ${pick(EURO_CITY)}`;

// Adversaire d'un tour : en Coupe nationale, un club d'une division voisine (plus fort à chaque tour) ; en C1,
// un cador européen.
export function drawOpponent(s, comp, stage) {
  if (comp === 'c1') {
    return { name: euroName(), strength: Math.round(clamp(14.6 + stage * 0.6 + rnd(-0.9, 0.9), 13, 18.6) * 10) / 10, division: 'Europe' };
  }
  const di = clamp(s.divisionIndex + pick([-1, 0, 0, 0, 1]) + (stage >= 2 && Math.random() < 0.4 ? 1 : 0), 0, 3);
  const d = DIVISIONS[di];
  const t = clamp(0.45 + stage * 0.12 + rnd(-0.3, 0.3), 0, 1);
  let name;
  do name = randomClubName(); while (name === s.clubName || s.rivals?.some((r) => r.name === name) && Math.random() < 0.5);
  return { name, strength: Math.round((d.oppMin + (d.oppMax - d.oppMin) * t) * 10) / 10, division: d.name };
}

// Calendrier et parcours en coupe d'une nouvelle saison.
export function buildCalendar(s) {
  s.calendar = ORDER.filter(([c]) => c !== 'c1' || s.c1).map(([comp, stage]) => ({ comp, stage: stage ?? null }));
  s.calIndex = 0;
  s.cups = {
    cup: { alive: true, stage: 0, results: [], opp: drawOpponent(s, 'cup', 0), won: false },
    c1: s.c1 ? { alive: true, stage: 0, results: [], opp: drawOpponent(s, 'c1', 0), won: false } : null,
  };
}

// Prochain match à jouer (les tours d'une coupe dont on est sorti sont sautés), ou null en fin de saison.
export function nextFixture(s) {
  if (!s.calendar) return s.round < 7 ? { index: -1, comp: 'league', stage: null } : null;
  for (let i = s.calIndex || 0; i < s.calendar.length; i++) {
    const f = s.calendar[i];
    if (f.comp === 'league') { if (s.round < 7) return { index: i, ...f }; continue; }
    const c = s.cups?.[f.comp];
    if (c && c.alive && c.stage === f.stage) return { index: i, ...f };
  }
  return null;
}

// Libellé d'un match : « Journée 3 / 7 », « Coupe nationale · Quarts de finale », « C1 · Finale ».
export function fixtureLabel(f, round) {
  if (!f || f.comp === 'league') return `Journée ${round} / 7`;
  return `${f.comp === 'c1' ? 'C1' : 'Coupe nationale'} · ${STAGES[f.stage]}`;
}

// Tirs au but : cinq tentatives chacun, puis mort subite. Notre réussite dépend un peu de la finition de nos
// tireurs et de notre gardien.
export function shootout(homeSkill = 0.76, awaySkill = 0.76) {
  let h = 0, a = 0;
  const kicks = [];
  for (let k = 0; k < 5; k++) {
    const hs = Math.random() < homeSkill; if (hs) h++; kicks.push(['home', hs]);
    if (h > a + (5 - k)) break;
    const as = Math.random() < awaySkill; if (as) a++; kicks.push(['away', as]);
    if (a > h + (4 - k) || h > a + (4 - k)) break;
  }
  while (h === a) {
    const hs = Math.random() < homeSkill; const as = Math.random() < awaySkill;
    if (hs) h++; if (as) a++;
    kicks.push(['home', hs], ['away', as]);
  }
  return { home: h, away: a, kicks };
}
