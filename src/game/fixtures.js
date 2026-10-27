import { isAwayRound, leagueLength, nextFixture } from './cups';

// Calendrier de la saison, date par date, dans l'ordre où elles se jouent : journées de championnat et tours de
// coupe glissés entre elles. Pour chaque date : compétition, adversaire (connu pour le championnat ; en coupe,
// seulement pour le prochain tour, les suivants restent à tirer au sort), et l'état :
// played (joué : la fiche du match), next (prochain match), upcoming (à venir), tbd (adversaire à tirer au sort),
// out (tour de coupe qui ne sera pas joué : éliminé avant). En Elite, `away` marque les journées jouées chez l'adversaire.
export function seasonFixtures(s) {
  const cal = s.calendar || Array.from({ length: leagueLength(s) }, () => ({ comp: 'league', stage: null })); // anciennes parties
  const played = (s.matches || []).filter((m) => m.season === s.seasonNumber);
  const next = nextFixture(s);
  let round = 0;
  return cal.map((f, index) => {
    const e = { index, comp: f.comp, stage: f.stage ?? null, round: null, opp: null, oppIdx: null, match: null, result: null, away: false };
    if (f.comp === 'league') {
      round += 1;
      e.round = round;
      e.away = isAwayRound(s, round - 1);
      const pair = s.schedule?.[round - 1]?.find((p) => p.includes(0));
      const oi = pair ? (pair[0] === 0 ? pair[1] : pair[0]) : 0;
      e.opp = s.rivals?.[oi - 1] || null;
      e.oppIdx = oi || null; // place de l'adversaire dans le tableau du championnat (standingsOf)
      e.match = played.find((m) => (m.comp || 'league') === 'league' && m.round === round) || null;
      const isNext = next && (next.index === index || (next.index === -1 && s.round + 1 === round));
      e.status = e.match || round <= s.round ? 'played' : isNext ? 'next' : 'upcoming';
    } else {
      const c = s.cups?.[f.comp];
      e.match = played.find((m) => m.comp === f.comp && m.stage === f.stage) || null;
      e.result = c?.results?.find((r) => r.stage === f.stage) || null; // résultat du tour (parties sans fiche de match)
      if (!e.match && !e.result && c?.alive && c.stage === f.stage) e.opp = c.opp;
      if (e.match || e.result) e.status = 'played';
      else if (next && next.index === index) e.status = 'next';
      else if (!c || !c.alive) e.status = 'out';
      else e.status = e.opp ? 'upcoming' : 'tbd';
      if (e.result && !e.opp) e.opp = { name: e.result.opp };
    }
    if (e.match && !e.opp) e.opp = { name: e.match.opp };
    return e;
  });
}

// Issue d'un match pour notre club (tirs au but compris) : 'win' | 'draw' | 'loss'.
export const outcomeOf = (m) => (m.pens ? (m.pens[0] > m.pens[1] ? 'win' : 'loss') : m.gf > m.ga ? 'win' : m.gf < m.ga ? 'loss' : 'draw');
