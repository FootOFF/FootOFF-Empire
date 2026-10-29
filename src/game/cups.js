import { DIVISIONS } from './constants';
import { distinctClubName } from './names';
import { clamp, pick, rnd } from './utils';
import { LANG, t } from '../i18n/index';

// Coupes : la Coupe nationale (tous les clubs du pays, à élimination directe) et la Coupe d'Europe des clubs
// (réservée aux deux premiers de l'Élite la saison précédente ; identifiant interne « c1 »). Quatre tours chacune, matchs à
// élimination directe : en cas d'égalité après 90 minutes, tirs au but. Les tours s'intercalent entre les journées
// du championnat ; un club éliminé saute simplement les dates restantes.

export const COMPS = {
  league: { id: 'league', name: t('Championnat'), short: t('Championnat') },
  cup: { id: 'cup', name: t('Coupe nationale'), short: t('Coupe') },
  c1: { id: 'c1', name: t('Coupe d’Europe des clubs'), short: t('Coupe d’Europe') },
};
export const STAGES = [t('Huitièmes de finale'), t('Quarts de finale'), t('Demi-finale'), t('Finale')];
export const STAGES_SHORT = [t('8es'), t('Quarts'), t('Demies'), t('Finale')];

// ordre de la saison : championnat, puis les tours de coupe glissés entre les journées ; en Élite, quatorze journées
// (aller-retour), deux journées entre deux tours de coupe
const ORDER = [
  ['league'], ['league'], ['cup', 0], ['league'], ['c1', 0], ['league'], ['cup', 1], ['c1', 1],
  ['league'], ['cup', 2], ['c1', 2], ['league'], ['cup', 3], ['league'], ['c1', 3],
];
const ORDER_ELITE = [
  ['league'], ['league'], ['cup', 0], ['league'], ['league'], ['c1', 0], ['league'], ['league'], ['cup', 1], ['c1', 1],
  ['league'], ['league'], ['cup', 2], ['c1', 2], ['league'], ['league'], ['cup', 3], ['league'], ['league'], ['c1', 3],
  ['league'], ['league'],
];

// Journées de championnat de la saison : 7 (une rencontre contre chacun, toutes à domicile), 14 en Élite depuis la
// 0.6.0 (aller-retour : chaque adversaire reçu une fois, visité une fois, une journée sur deux à l'extérieur).
export const leagueLength = (s) => s.schedule?.length || 7;
// Journée `round` (0 = la première) jouée à l'extérieur (s.away, tiré au début de la saison ; jamais hors de l'Élite).
export const isAwayRound = (s, round = s.round) => !!s.away?.[round];

// Primes : Coupe nationale à l'échelle de la division (part de la prime du champion), Coupe d'Europe en montants européens.
const CUP_SHARE = [0.06, 0.12, 0.25, 0.75]; // tour gagné
// Coupe d'Europe à l'échelle des vraies (0.6.0 ; 4 M€ de participation et 28 M€ de primes de tour avant) : 15 M€ de
// participation, puis 10, 12, 18 et 30 M€ par tour gagné, et 5 M€ de droits TV par match (economy.js, C1_TV) : plus de
// cent millions pour le vainqueur.
export const C1_ENTRY = 15000000; // participation
const C1_WIN = [10000000, 12000000, 18000000, 30000000];

export const cupPrize = (comp, stage, divIndex) => (comp === 'c1' ? C1_WIN[stage] : Math.round(DIVISIONS[divIndex].prize * CUP_SHARE[stage]));

// Clubs européens fictifs (aucun vrai club) : un préfixe et une ville imaginaire.
const EURO_PREFIX = [t('Real'), t('Inter'), t('Sporting'), t('Dynamo'), t('Athletic'), t('Union'), t('Olympia'), t('Rapid'), t('Vitoria'), t('Royal')];
const EURO_CITY = [t('Valmora'), t('Castellano'), t('Lisvar'), t('Kravets'), t('Norrhavn'), t('Melithi'), t('Bergamonte'), t('Aldenburg'), t('Zurvic'),
  t('Halmstrand'), t('Corvina'), t('Ostrava Nova'), t('Belmira'), t('Sankt Arlen'), t('Varnacci'), t('Tirelli'), t('Doruva'), t('Lindhaven')];
export const euroName = (taken = []) => {
  let name = '';
  for (let k = 0; k < 20 && (!name || taken.includes(name)); k++) name = `${pick(EURO_PREFIX)} ${pick(EURO_CITY)}`;
  return name;
};

// Adversaire d'un tour : en Coupe d'Europe, un cador européen, au-dessus du milieu de l'Élite dès les huitièmes et au
// niveau des meilleurs en finale (de 15,1 à 18,5 ; de 14,8 à 18,2 en 0.5.x ; avant la 0.5.0, de 13,7 à 17,3 : une Coupe
// d'Europe sur deux gagnée),
// avec son budget de saison (de 150 à 800 M€, à la mesure de son niveau : rien qu'une indication, le match se joue sur
// le niveau) ; en Coupe nationale, un club d'une division voisine, plus fort à chaque tour.
export function drawOpponent(s, comp, stage) {
  if (comp === 'c1') {
    const strength = Math.round(clamp(15.9 + stage * 0.6 + rnd(-0.8, 0.8), 14, 19) * 10) / 10;
    const budget = Math.round(clamp(220 + (strength - 15.9) * 160 + rnd(-40, 40), 150, 800) / 10) * 10 * 1e6;
    return { name: euroName(), strength, division: t('Europe'), budget };
  }
  const di = clamp(s.divisionIndex + pick([-1, 0, 0, 0, 1]) + (stage >= 2 && Math.random() < 0.4 ? 1 : 0), 0, 3);
  const d = DIVISIONS[di];
  const row = clamp(0.45 + stage * 0.12 + rnd(-0.3, 0.3), 0, 1);
  const name = distinctClubName([s.clubName, ...(s.rivals || []).map((r) => r.name)]); // ni un club de la division, ni son lieu
  return { name, strength: Math.round((d.oppMin + (d.oppMax - d.oppMin) * row) * 10) / 10, division: d.name };
}

// Calendrier et parcours en coupe d'une nouvelle saison.
export function buildCalendar(s) {
  s.calendar = (leagueLength(s) > 7 ? ORDER_ELITE : ORDER).filter(([c]) => c !== 'c1' || s.c1).map(([comp, stage]) => ({ comp, stage: stage ?? null }));
  s.calIndex = 0;
  s.cups = {
    cup: { alive: true, stage: 0, results: [], opp: drawOpponent(s, 'cup', 0), won: false },
    c1: s.c1 ? { alive: true, stage: 0, results: [], opp: drawOpponent(s, 'c1', 0), won: false } : null,
  };
}

// Prochain match à jouer (les tours d'une coupe dont on est sorti sont sautés), ou null en fin de saison.
export function nextFixture(s) {
  const len = leagueLength(s);
  if (!s.calendar) return s.round < len ? { index: -1, comp: 'league', stage: null } : null;
  for (let i = s.calIndex || 0; i < s.calendar.length; i++) {
    const f = s.calendar[i];
    if (f.comp === 'league') { if (s.round < len) return { index: i, ...f }; continue; }
    const c = s.cups?.[f.comp];
    if (c && c.alive && c.stage === f.stage) return { index: i, ...f };
  }
  return null;
}

// Libellé d'un match : « Journée 3 / 7 » (« / 14 » en Élite), « Coupe nationale · Quarts de finale », « Coupe d'Europe ·
// Finale ».
export function fixtureLabel(f, round, total = 7) {
  if (!f || f.comp === 'league') return t('Journée {round} / {total}', { round, total });
  return `${f.comp === 'c1' ? t('Coupe d’Europe') : t('Coupe nationale')} · ${STAGES[f.stage]}`;
}
// Version courte (bouton « Jouer », petits espaces) : « Coupe · 8es de finale », « Coupe d'Europe · Finale ».
const STAGES_MID = [t('8es de finale'), t('Quarts'), t('Demies'), t('Finale')];
export function fixtureShort(f, round, total = 7) {
  if (!f || f.comp === 'league') return t('Journée {round} / {total}', { round, total });
  return `${f.comp === 'c1' ? t('Europe') : t('Coupe')} · ${STAGES_MID[f.stage]}`;
}
// « de Nationale », « d'Élite » : élision devant une voyelle ; le nom d'une ligue entre amis prend son article (« de la
// Ligue du Soir », « du Trophée du Dimanche »)
export const ofDiv = (name) => (LANG !== 'fr' ? (LANG === 'es' && /^Trofeo/.test(name) ? `del ${name}` : t('de la {name}', { name }))
  : /^(Ligue|Coupe)/.test(name) ? t('de la {name}', { name }) : /^(Championnat|Trophée|Tournoi)/.test(name) ? `du ${name}`
  : /^[AEIOUÉÈÊ]/i.test(name) ? `d’${name}` : `de ${name}`);

// Réussite aux tirs au but : la nôtre selon la finition de nos cinq meilleurs tireurs (joueurs de champ sur le
// terrain), celle de l'adversaire selon les réflexes de notre gardien (et son signe « Chat »).
export function penaltySkills(onPitch) {
  const fin = onPitch.filter((p) => p.pos !== 'G').map((p) => p.a.fin).sort((x, y) => y - x).slice(0, 5);
  const home = clamp(0.62 + (fin.reduce((a, b) => a + b, 0) / Math.max(1, fin.length)) / 100, 0.66, 0.84);
  const keeper = onPitch.find((p) => p.pos === 'G');
  const away = 0.77 - (keeper ? (keeper.g?.ref || 10) / 400 : 0) - (keeper && keeper.traits?.includes('chat') ? 0.03 : 0);
  return { home, away };
}

// Chance exacte de gagner la séance (même tirage que shootout) : plus de tirs réussis sur cinq, ou, à égalité, la
// mort subite (premier à marquer quand l'autre manque).
export function shootoutWinChance(homeSkill, awaySkill) {
  const bin = (p) => [0, 1, 2, 3, 4, 5].map((k) => [1, 5, 10, 10, 5, 1][k] * p ** k * (1 - p) ** (5 - k));
  const h = bin(homeSkill);
  const a = bin(awaySkill);
  let win = 0;
  let tie = 0;
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) { if (i > j) win += h[i] * a[j]; else if (i === j) tie += h[i] * a[j]; }
  const sw = homeSkill * (1 - awaySkill);
  const sl = awaySkill * (1 - homeSkill);
  return win + tie * (sw + sl > 0 ? sw / (sw + sl) : 0.5);
}

// Tirs au but : cinq tentatives chacun, puis mort subite. Notre réussite dépend un peu de la finition de nos
// tireurs et de notre gardien (penaltySkills).
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
