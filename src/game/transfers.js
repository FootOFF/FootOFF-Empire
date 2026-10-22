import { officeSize } from './economy';
import { makePlayer, playerRating, saleValue } from './players';
import { randomClubName } from './names';
import { clamp, pick, ri, rnd } from './utils';

// Mercato vivant : un seul marché, deux sortes de joueurs.
// - Joueurs libres (s.market) : sans club, ils signent contre une prime de signature.
// - Joueurs sous contrat (s.transfers) : leur club demande une indemnité de transfert. Quelques-uns sont listés
//   publiquement ; le Bureau des transferts (réseau de recruteurs) en suit beaucoup plus, avec de meilleurs profils.
// À chaque journée le marché bouge : des joueurs signent ailleurs (surtout ceux que des clubs rivaux courtisent),
// d'autres arrivent, les prix varient ; les négociations du jour se referment ; les clubs adverses font des offres
// pour les joueurs que tu as mis sur le marché (et parfois pour d'autres, s'ils brillent).

export const FREE_POOL = 5; // joueurs libres disponibles en même temps
const roundKey = (s) => `${s.seasonNumber}:${s.round}`;

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

function freeAgent(s) {
  const p = makePlayer({ level: s.divisionIndex + 1 + rnd(-0.3, 0.4) });
  p.id = s.nextId++;
  return p;
}

// Vie d'un joueur sur le marché entre deux journées : prix qui bouge (plus vite s'il est courtisé, à la baisse s'il
// ne trouve pas preneur), intérêt des clubs rivaux qui naît ou retombe.
function drift(p, s) {
  const before = p.priceMod || 1;
  const listedFor = p.listedRounds || 0;
  let m = before * (1 + rnd(-0.045, 0.05));
  if (p.interest) m *= 1 + 0.025 * p.interest;
  else if (listedFor >= 3) m *= 0.975;
  p.priceMod = Math.round(clamp(m, 0.8, 1.3) * 1000) / 1000;
  const d = p.priceMod / before - 1;
  p.trend = d > 0.015 ? 1 : d < -0.015 ? -1 : 0;
  p.listedRounds = listedFor + 1;
  if (p.interest && Math.random() < 0.4) p.interest -= 1;
  if ((p.interest || 0) < 3 && Math.random() < 0.16) p.interest = (p.interest || 0) + 1;
  p.talks = null; // négociation du jour refermée : nouvelles tentatives, contre-propositions expirées
  return s;
}

// Probabilité qu'un joueur du marché signe ailleurs avant la prochaine journée.
const leaveChance = (p) => (p.interest ? 0.26 + 0.12 * p.interest : 0.1);

// Offres des clubs adverses : pour chaque joueur mis sur le marché (et, plus rarement, pour un joueur en forme qui
// n'est pas à vendre). Une offre vaut jusqu'à la journée suivante.
function incomingOffers(s, key) {
  const offers = [];
  const listed = new Set((s.saleList || []).map((x) => x.id));
  const clubs = () => (s.rivals?.length && Math.random() < 0.5 ? pick(s.rivals).name : randomClubName());
  for (const p of s.players) {
    const form = p.form?.length >= 2 ? p.form.reduce((a, b) => a + b, 0) / p.form.length : 6;
    const value = saleValue(p, s.divisionIndex);
    let amount = 0;
    let unsolicited = false;
    if (listed.has(p.id)) {
      if (Math.random() < 0.6 + (form >= 7 ? 0.15 : 0)) amount = value * rnd(0.95, 1.3) * (form >= 7 ? 1.08 : 1) * (p.age <= 23 ? 1.08 : 1);
    } else if (form >= 7.3 && playerRating(p) >= 6 && Math.random() < 0.05) {
      amount = value * rnd(1.25, 1.6);
      unsolicited = true;
    }
    if (amount > 0) {
      const step = amount < 5000 ? 50 : amount < 50000 ? 250 : amount < 500000 ? 2500 : 25000;
      s.offerSeq = (s.offerSeq || 0) + 1;
      offers.push({ id: s.offerSeq, playerId: p.id, club: clubs(), amount: Math.round(amount / step) * step, unsolicited, at: key, haggled: false });
    }
  }
  return offers;
}

// mode 'full' : marché neuf (début de saison) ; 'round' : après une journée ; 'grow' : bureau construit ou amélioré,
// la liste des joueurs sous contrat s'allonge tout de suite. Les arrivants (hors marché neuf) sont marqués « Nouveau ».
export function refreshTransfers(s, mode = 'round') {
  const full = mode === 'full';
  const round = mode === 'round';
  const key = roundKey(s);
  const news = { key, arrivals: 0, departures: 0, followedGone: [], followedCourted: [], offers: 0 };
  const followed = new Set((s.shortlist || []).filter((x) => !x.gone).map((x) => x.id));
  const leave = (p) => {
    news.departures += 1;
    if (followed.has(p.id)) {
      const club = randomClubName();
      const entry = s.shortlist.find((x) => x.id === p.id);
      Object.assign(entry, { gone: club, goneAt: key });
      news.followedGone.push(p.name);
    }
  };
  const keep = (list) => {
    if (full) { // nouvelle saison : le marché est renouvelé, les joueurs suivis encore libres sont partis
      for (const p of list || []) if (followed.has(p.id)) { leave(p); news.departures -= 1; }
      return [];
    }
    return (list || []).filter((p) => {
      if (round && Math.random() < leaveChance(p)) { leave(p); return false; }
      return true;
    });
  };
  const add = (list, make, size) => {
    while (list.length < size) {
      const p = make(s);
      p.priceMod = Math.round(rnd(0.94, 1.08) * 1000) / 1000;
      p.interest = Math.random() < 0.15 ? 1 : 0;
      p.listedRounds = 0;
      if (!full) { p.listedAt = key; news.arrivals += 1; }
      list.push(p);
    }
    return list;
  };
  s.saleList = (s.saleList || []).filter((x) => s.players.some((p) => p.id === x.id)); // partis entre-temps (retraite, conseil)
  const free = keep(s.market);
  const contracted = keep(s.transfers);
  if (round) for (const p of [...free, ...contracted]) drift(p, s);
  s.market = add(free, freeAgent, Math.max(FREE_POOL, free.length)).slice(0, Math.max(FREE_POOL, free.length));
  const size = Math.max(officeSize(s.buildings.transfers || 0), mode === 'grow' ? contracted.length : 0);
  s.transfers = add(contracted, scoutPlayer, size).slice(0, size);
  for (const p of [...s.market, ...s.transfers]) if (followed.has(p.id) && p.interest) news.followedCourted.push(p.name);
  if (round) {
    s.offers = incomingOffers(s, key); // les offres non traitées expirent avec la journée
    news.offers = s.offers.length;
    s.mercatoNews = news;
  } else if (full) {
    s.offers = [];
    s.mercatoNews = { ...news, season: true };
  }
  return s;
}
