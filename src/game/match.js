import { lineupRating } from './tactics';
import { playerRating } from './players';

function lineAvg(players, pos, n) {
  const list = players.filter((p) => p.pos === pos).map(playerRating).sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += list[i] !== undefined ? list[i] : 3; // poste non pourvu = pénalité
  return sum / n;
}

// Niveau d'équipe : celui de l'onze aligné s'il existe, sinon des meilleurs joueurs par poste.
export function teamLevel(s) {
  return s.lineup ? lineupRating(s.players, s.lineup, s.formation) : teamRating(s.players);
}

export function teamRating(players) {
  return (
    0.12 * lineAvg(players, 'G', 1) +
    0.3 * lineAvg(players, 'D', 4) +
    0.26 * lineAvg(players, 'M', 3) +
    0.32 * lineAvg(players, 'A', 3)
  );
}
