import { DIVISIONS } from './constants';
import { officeSize } from './economy';
import { makePlayer, playerRating } from './players';
import { distinctClubName, leagueNames, randomClubName } from './names';
import { euroName } from './cups';
import {
  BUYERS, CANDIDATES, buyerView, drawBuyer, formOf, openingOffer, roundTo, saleBlock, spontaneousBuyer, valueOf, withinReach,
} from './mercato';
import { clamp, pick, ri, rnd } from './utils';

// Mercato vivant : un seul marché, deux sortes de joueurs.
// - Joueurs libres (s.market) : sans club, ils signent contre une prime de signature.
// - Joueurs sous contrat (s.transfers) : leur club demande une indemnité de transfert. Quelques-uns sont listés
//   publiquement ; le Bureau des transferts (réseau de recruteurs) en suit beaucoup plus, avec de meilleurs profils.
// À chaque journée le marché bouge : des joueurs signent ailleurs (surtout ceux que des clubs rivaux courtisent),
// d'autres arrivent, les prix varient ; les négociations du jour se referment ; les clubs adverses font des offres
// pour les joueurs que tu as mis sur le marché (dès la mise en vente, puis après chaque journée), et parfois pour des
// joueurs qui ne sont pas à vendre, s'ils brillent.

export const FREE_POOL = 5; // joueurs libres disponibles en même temps
const roundKey = (s) => `${s.seasonNumber}:${s.round}`;

// Niveau du marché, calé sur le milieu de la division (makePlayer : note moyenne 5,3 + 2 × level) : `delta` points
// au-dessus (ou au-dessous) du club moyen de la division. Avant la 0.5.0, le marché suivait l'indice de la division :
// un cran au-dessus du club moyen en Départementale (on montait aussitôt), deux crans en dessous en Élite.
// 1.0 : calé sur `market` (le club moyen de la division avant que les adversaires ne soient relevés), pas sur eux.
const marketLevel = (s, delta) => ((DIVISIONS[s.divisionIndex].market + delta - 5.3) / 2);

// Les recruteurs vont plus haut avec le bureau des transferts, et la notoriété attire les grands noms : le meilleur du
// marché reste un cran au-dessus du club moyen de la division, plus haut avec un réseau complet et un grand nom.
function scoutPlayer(s) {
  const lvl = s.buildings.transfers || 0;
  const fame = clamp((s.reputation || 0) / 100, 0, 0.6);
  const p = makePlayer({ level: marketLevel(s, -0.3 + fame) + rnd(-0.3, 0.2 + lvl * 0.15) });
  if (Math.random() < 0.25) { // un espoir sur quatre : jeune, avec de la marge
    p.age = ri(18, 21);
    p.pot = clamp(p.pot + ri(1, 3), 8, 20);
  }
  p.id = s.nextId++;
  p.club = s.rivals?.length && Math.random() < 0.4 ? pick(s.rivals).name : randomClubName();
  p.contract = ri(1, 4); // années de contrat restantes : un long contrat coûte plus cher à racheter
  return p;
}

// Joueur libre : un peu en dessous du club moyen de la division, parfois au-dessus.
function freeAgent(s) {
  const p = makePlayer({ level: marketLevel(s, -0.4) + rnd(-0.2, 0.25) });
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

// Nom d'un club acheteur : un rival de la division une fois sur deux s'il joue à notre niveau, sinon un club
// d'ailleurs (un club européen pour un géant européen, div null) ; jamais le nôtre ni un club déjà en lice pour ce
// joueur (taken, complété au passage). Championnat entre amis (1.0.2, bug relevé par le PDG) : jamais un club de la
// ligue. Une offre au nom d'un ami, qu'il n'avait pas faite, se concluait sans lui (le joueur partait, l'ami ne recevait
// rien) : un ami fait ses offres par le serveur des ligues, un club de l'ordinateur de la ligue n'achète pas.
function buyerName(s, div, taken) {
  const league = s.league ? leagueNames(s) : [];
  let club = null;
  if (div == null) club = euroName([...taken, ...league]);
  else if (!s.league && div === s.divisionIndex && Math.random() < 0.5) {
    const free = (s.rivals || []).filter((r) => !taken.includes(r.name));
    if (free.length) club = pick(free).name;
  }
  club ||= distinctClubName([s.clubName, ...league, ...taken]);
  taken.push(club);
  return club;
}

// Offre d'un club acheteur (mercato.js) : sa sorte, sa division, son plafond secret (dont découlent les chances
// affichées) et la valeur du joueur à ce moment. Une offre vaut jusqu'à la journée suivante.
function newOffer(s, p, buyer, v, opening, unsolicited, key, taken) {
  const step = BUYERS[buyer.tier].step;
  const div = step == null ? null : clamp(s.divisionIndex + step, 0, DIVISIONS.length - 1);
  s.offerSeq = (s.offerSeq || 0) + 1;
  return {
    id: s.offerSeq, playerId: p.id, club: buyerName(s, div, taken), tier: buyer.tier, div, b: buyer.b, v,
    amount: opening.amount, atAsk: opening.atAsk, unsolicited, at: key, talks: { tries: 0, closed: false },
  };
}

// Clubs intéressés par un joueur mis en vente, à son prix : chacun des CANDIDATES clubs étudie le dossier (attrait)
// et s'y intéresse si le prix est à sa portée. À la mise en vente, un club au moins se présente (le plus haut
// plafond des candidats). La chance affichée à la mise en vente (mercato.js, listingOutlook) suit exactement ce tirage.
function interestFor(s, p, price, key, listing, taken = []) {
  const view = buyerView(s, p);
  const v = valueOf(s, p);
  const cands = Array.from({ length: CANDIDATES }, () => drawBuyer(view));
  let keen = cands.filter((c) => Math.random() < view.attract && withinReach(c, price, v));
  if (!keen.length && listing) keen = [cands.reduce((a, c) => (c.b > a.b ? c : a))];
  return keen.map((c) => newOffer(s, p, c, v, openingOffer(c, v, price), false, key, taken));
}

// Offres de la journée : les clubs intéressés par chaque joueur mis en vente (sans club assuré), et plus rarement une
// offre spontanée pour un joueur en grande forme qui n'est pas à vendre. Aucune pour un joueur blessé ou suspendu : mis
// en vente, il le reste, et les clubs reviennent à son retour.
function incomingOffers(s, key) {
  const offers = [];
  const listed = new Map((s.saleList || []).map((x) => [x.id, x]));
  for (const p of s.players) {
    if (saleBlock(s, p)) continue;
    const sale = listed.get(p.id);
    if (sale) {
      offers.push(...interestFor(s, p, sale.price || roundTo(valueOf(s, p)), key, false));
      s.saleOffered[p.id] = key; // les clubs de la journée sont venus : le remettre en vente n'en appelle pas d'autres
    } else if (formOf(p) >= 7.3 && playerRating(p) >= 6 && Math.random() < 0.05) {
      const buyer = spontaneousBuyer(s, p);
      const v = valueOf(s, p);
      offers.push(newOffer(s, p, buyer, v, openingOffer(buyer, v), true, key, []));
    }
  }
  return offers;
}

// Joueur déjà proposé aux clubs pendant cette journée (mise en vente ou journée qui vient de se jouer).
export const listedToday = (s, id) => s.saleOffered?.[id] === roundKey(s);

// Mise en vente : les clubs intéressés font aussitôt leur offre, sans attendre la journée suivante. Une seule vague
// par joueur et par journée : retirer le joueur de la vente puis l'y remettre ne la renouvelle pas (ses offres encore
// ouvertes, mises de côté au retrait, reviennent ; une offre refusée ne revient pas avant la prochaine journée).
export function listingOffers(s, p, price) {
  const key = roundKey(s);
  const parked = (s.parkedOffers || []).filter((o) => o.playerId === p.id && o.at === key);
  if (parked.length) {
    s.parkedOffers = s.parkedOffers.filter((o) => !parked.includes(o));
    for (const o of parked) if (o.amount > price) Object.assign(o, { amount: price, atAsk: true }); // il demande moins : le club s'aligne
    return parked;
  }
  if (listedToday(s, p.id)) return [];
  s.saleOffered = { ...(s.saleOffered || {}), [p.id]: key };
  return interestFor(s, p, price, key, true, (s.offers || []).filter((o) => o.playerId === p.id).map((o) => o.club));
}

// mode 'full' : marché neuf (début de saison) ; 'round' : après une journée ; 'grow' : bureau construit ou amélioré,
// la liste des joueurs sous contrat s'allonge tout de suite. Les arrivants (hors marché neuf) sont marqués « Nouveau ».
// Championnat entre amis : le marché vient de la ligue (leagueClub.js, leagueMercato) ; les ventes restent celles du
// solo : après chaque journée, les clubs hors de la ligue font leurs offres pour les joueurs en vente.
export function refreshSales(s) {
  const key = roundKey(s);
  s.saleList = (s.saleList || []).filter((x) => s.players.some((p) => p.id === x.id));
  s.parkedOffers = []; s.saleOffered = {}; s.auctions = {};
  s.offers = incomingOffers(s, key);
  s.mercatoNews = { key, arrivals: 0, departures: 0, followedGone: [], followedCourted: [], offers: s.offers.length };
  return s;
}

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
  if (round || full) { s.parkedOffers = []; s.saleOffered = {}; s.auctions = {}; } // ventes : propres à la journée
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
