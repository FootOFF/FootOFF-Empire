import { officeSize } from './economy';
import { makePlayer } from './players';
import { randomClubName } from './names';
import { clamp, pick, ri, rnd } from './utils';

// Marché des transferts (bureau des transferts) : des joueurs sous contrat dans d'autres clubs, suivis par
// les recruteurs du club. Plus le bureau est développé, plus la liste est longue et plus les profils repérés
// sont forts. La liste est renouvelée à chaque saison et bouge à chaque journée : certains joueurs signent
// ailleurs, d'autres sont mis sur le marché.

function scoutPlayer(s) {
  const lvl = s.buildings.transfers || 0;
  const p = makePlayer({ level: s.divisionIndex + 0.8 + rnd(-0.6, 0.4 + lvl * 0.25) });
  if (Math.random() < 0.25) { // un espoir sur quatre : jeune, avec de la marge
    p.age = ri(18, 21);
    p.pot = clamp(p.pot + ri(1, 3), 8, 20);
  }
  p.id = s.nextId++;
  p.club = s.rivals?.length && Math.random() < 0.4 ? pick(s.rivals).name : randomClubName();
  p.contract = ri(1, 4); // années de contrat restantes : un long contrat coûte plus cher à racheter
  return p;
}

// mode 'full' : nouvelle liste complète (début de saison, bureau tout juste construit) ;
// 'round' : après une journée, environ un joueur sur cinq signe ailleurs ;
// 'grow' : bureau amélioré, la liste s'allonge sans que personne ne parte.
// Les nouveaux arrivants (hors liste complète) sont marqués pour l'affichage « Nouveau ».
export function refreshTransfers(s, mode = 'round') {
  const full = mode === 'full';
  const size = officeSize(s.buildings.transfers || 0);
  const stay = full ? [] : (s.transfers || []).filter(() => mode !== 'round' || Math.random() > 0.2);
  while (stay.length < size) {
    const p = scoutPlayer(s);
    if (!full) p.listedAt = `${s.seasonNumber}:${s.round}`;
    stay.push(p);
  }
  s.transfers = stay.slice(0, size);
  return s;
}
