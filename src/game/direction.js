import { DIVISIONS } from './constants';

// Direction du club : le bureau du président, où se négocient les contrats du club. Son niveau (0 à 5) pèse dans
// chaque négociation, et les chances affichées sont celles qui décident (tirage au moment de la réponse).
// - Droits TV : une fois par saison, on demande au diffuseur une hausse sur ses droits (0 à 60 %). Accordée, elle
//   s'ajoute à chaque match à domicile de la saison ; refusée, le contrat reste celui de base. Chaque niveau ajoute
//   aussi 8 % aux droits ; en Départementale (pas de télévision nationale), la Direction signe avec une télé locale.
// - Contrats (0.8.0, contracts.js) : chaque niveau baisse de 2 % les exigences de salaire des joueurs, à la signature
//   comme à la prolongation ; l'onglet Contrats de la Direction ouvre les prolongations. La baisse de salaire d'avant
//   (wageCut) est reprise dans le contrat de chaque joueur au chargement.
// - Billetterie : la formule des billets (economy.js, TICKET_POLICIES), avec la recette prévue de chacune.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TV_ASK_MAX = 0.6;
export const tvBoost = (lvl) => 0.08 * lvl;
export const localTv = (lvl) => 250 * lvl; // télé locale par match à domicile (Départementale)
import { pushJournal } from './journal';

// Droits TV d'un match de championnat (à domicile comme à l'extérieur en Elite) : base de la division (ou télé locale),
// bonus de la Direction et hausse négociée pour la saison.
export function tvPerMatch(s, deal = s.tvDeal) {
  const lvl = s.buildings.direction || 0;
  const base = DIVISIONS[s.divisionIndex].tv || localTv(lvl);
  const bonus = deal?.season === s.seasonNumber && deal.ok ? deal.ask : 0;
  return Math.round(base * (1 + tvBoost(lvl) + bonus));
}

// Chance que le diffuseur accepte une hausse `ask` (0 à 0,6) : il suit sans discuter jusqu'à une marge qui grandit
// avec le niveau et la réputation, puis de moins en moins.
export function tvChance(s, ask) {
  const lvl = s.buildings.direction || 0;
  if (!lvl) return 0;
  const free = 0.06 + 0.03 * lvl + 0.003 * clamp(s.reputation || 0, 0, 30);
  if (ask <= free) return 1;
  return clamp(1 - (ask - free) / (0.45 + 0.04 * lvl), 0, 1);
}

export const tvOpen = (s) => (s.buildings.direction || 0) > 0 && s.tvDeal?.season !== s.seasonNumber;

// Négociations (actions du jeu, appelées par l'écran de la Direction) : renvoient l'état, ou null si impossible.
export function negotiateTv(s, ask) {
  if (!tvOpen(s)) return null;
  const a = clamp(Math.round(ask * 100) / 100, 0, TV_ASK_MAX);
  const ok = Math.random() < tvChance(s, a);
  s.tvDeal = { season: s.seasonNumber, ask: a, ok };
  pushJournal(s, {
    season: s.seasonNumber, round: s.round, kind: 'club',
    title: ok ? `Droits TV : le diffuseur accepte +${Math.round(a * 100)} %` : 'Droits TV : le diffuseur refuse la hausse',
    text: ok ? `Chaque match de championnat rapportera ${tvPerMatch(s).toLocaleString('fr-FR')} € de droits TV cette saison.` : 'Le contrat de base est reconduit pour la saison.',
  });
  return s;
}
