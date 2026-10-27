import { LEAGUE_OPEN } from './constants';
import { hash } from './faces';
import { distinctClubName } from './names';
import { seeded } from './opponents';

// Championnats entre amis (Siège de la Ligue). Le serveur des ligues (site footoff.media, /api/ligue ; leagueNet.js)
// garde chaque ligue, ses membres, les équipes validées et les résultats officiels. Le jeu calcule le reste à
// l'identique chez chaque ami, à partir de la graine de la ligue : les clubs de l'ordinateur, le calendrier, le
// classement tiré des résultats.

// Version du moteur des matchs entre amis : le serveur (ENGINE_CURRENT de src/lib/ligue/core.ts du site) refuse un
// numéro plus haut que le sien. À relever là-bas, et publier le site, AVANT de publier un jeu au moteur relevé.
export const LEAGUE_ENGINE = 1;
export const LEAGUE_CLUBS = 8; // amis complétés par l'ordinateur
export const LEAGUE_MIN_HUMANS = 2;
export const MAX_MY_LEAGUES = 3; // championnats à la fois sur un appareil
export const leagueRounds = (league) => (LEAGUE_CLUBS - 1) * (league.settings?.format === 'single' ? 1 : 2);
// Championnats ouverts au public (LEAGUE_OPEN), ou en développement (npm run dev) pour les essayer contre le serveur
// des ligues lancé en local. Le bâtiment, lui, ne se construit qu'une fois LEAGUE_OPEN (map.js).
export const leagueOpen = () => LEAGUE_OPEN || !!import.meta.env?.DEV;

// Code d'invitation : six signes, sans I, O, 0 ni 1 (rien à confondre en le dictant), comme sur le serveur.
export const isLeagueCode = (c) => /^[A-HJ-NP-Z2-9]{6}$/.test(c || '');
export const cleanCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[IO01]/g, '').slice(0, 6);

// Couleurs du logo de la ligue, choisies par le créateur : le noir et or FootOFF, ou deux couleurs bien contrastées.
export const LEAGUE_COLORS = [
  ['noir-or', 'Noir et or', []],
  ['marine', 'Marine et ciel', ['#1d2c5e', '#9fd0f5']],
  ['rouge', 'Rouge et blanc', ['#c0392b', '#ffffff']],
  ['bleu', 'Bleu et blanc', ['#2463c9', '#ffffff']],
  ['vert', 'Vert et blanc', ['#1f8a4c', '#ffffff']],
  ['grenat', 'Grenat et ciel', ['#7b1e3a', '#9fd0f5']],
  ['violet', 'Violet et jaune', ['#6c3fa0', '#f2c94c']],
  ['orange', 'Orange et noir', ['#e67e22', '#151515']],
  ['blanc', 'Blanc et noir', ['#f2f2f2', '#151515']],
];

// Les huit clubs de la ligue, place par place : les amis (club, écusson, pseudo), puis l'ordinateur aux places restées
// libres au coup d'envoi (avant, en salle d'attente : des places libres). Un ami parti a rendu son club à l'ordinateur
// (pseudo « Ordinateur », refusé à l'inscription : human faux) ; son club garde son nom et son écusson. Un ami absent
// depuis 7 jours (active faux) reste membre : l'ordinateur fait seulement jouer son club en attendant son retour.
export const AI_PSEUDO = 'Ordinateur';
export function leagueClubs(league, members) {
  const bySlot = new Map(members.map((m) => [m.slot, m]));
  const free = [...Array(LEAGUE_CLUBS).keys()].filter((k) => !bySlot.has(k));
  const taken = members.map((m) => m.club.name);
  const ai = league.status === 'lobby' ? [] : seeded(hash(`${league.code}|${league.seed}|clubs`), () => {
    const out = [];
    for (const _ of free) out.push(distinctClubName([...taken, ...out]));
    return out;
  });
  return [...Array(LEAGUE_CLUBS).keys()].map((slot) => {
    const m = bySlot.get(slot);
    if (m) {
      const human = m.pseudo !== AI_PSEUDO;
      return { slot, name: m.club.name, crest: m.club.crest, pseudo: human ? m.pseudo : null, member: m.id, human, validated: !!m.validated, active: human && m.active !== false };
    }
    const i = free.indexOf(slot);
    return ai[i] ? { slot, name: ai[i], crest: null, pseudo: null, member: null, human: false } : { slot, open: true };
  });
}

// Calendrier d'une saison : chaque club rencontre les sept autres, puis une seconde fois terrain inversé en
// aller-retour. Méthode du polygone sur un ordre des places tiré de la graine et de la saison : un club au centre, les
// sept autres en cercle ; chaque club reçoit trois ou quatre fois à l'aller. [[domicile, extérieur] × 4] par journée.
export function leagueFixtures(league, season = league.season) {
  const n = LEAGUE_CLUBS;
  const m = n - 1;
  const order = seeded(hash(`${league.code}|${league.seed}|${season}|calendrier`), () => {
    const a = [...Array(n).keys()];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });
  const first = [];
  for (let r = 0; r < m; r++) {
    const center = order[m];
    const pairs = [r % 2 ? [order[r], center] : [center, order[r]]];
    for (let k = 1; k < n / 2; k++) {
      const a = order[(r + k) % m];
      const b = order[(r - k + m) % m];
      pairs.push(k % 2 ? [a, b] : [b, a]);
    }
    first.push(pairs);
  }
  if (league.settings?.format === 'single') return first;
  return [...first, ...first.map((pairs) => pairs.map(([h, a]) => [a, h]))];
}

// Classement tiré des résultats officiels de la saison ({ matches: [{ h, a, hg, ag }] } par journée, places des
// clubs) : 3 points la victoire, 1 le nul ; puis la différence de buts, les buts marqués, le nom.
export function leagueTable(clubs, results = []) {
  const rows = new Map(clubs.filter((c) => !c.open).map((c) => [c.slot, { ...c, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }]));
  const goals = (v) => Number.isInteger(v) && v >= 0 && v < 30;
  for (const r of results) {
    for (const m of r.matches || []) {
      const h = rows.get(m.h);
      const a = rows.get(m.a);
      if (!h || !a || h === a || !goals(m.hg) || !goals(m.ag)) continue;
      h.played++; a.played++;
      h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
      if (m.hg > m.ag) { h.w++; a.l++; } else if (m.hg < m.ag) { a.w++; h.l++; } else { h.d++; a.d++; }
    }
  }
  return [...rows.values()]
    .map((t) => ({ ...t, gd: t.gf - t.ga, pts: 3 * t.w + t.d }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name, 'fr'));
}

// Fuseau du créateur, envoyé au serveur pour l'heure des journées. Un fuseau sans changement d'heure dans l'année qui
// vient part en décalage fixe (Etc/GMT…) : l'échéance ne dépend plus de la base des fuseaux du serveur, qui peut
// retarder sur un pays venant de changer d'heure légale (constaté le 2026-10-27 : une heure d'écart entre le serveur
// et l'appareil). Avec changement d'heure (Europe…) ou une demi-heure de décalage : le nom du fuseau.
export function deviceZone(now = Date.now()) {
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const offsets = new Set([...Array(13).keys()].map((k) => new Date(now + k * 30 * 86400000).getTimezoneOffset()));
  const east = -[...offsets][0]; // minutes d'avance sur Greenwich
  if (offsets.size > 1 || east % 60) return name;
  return east === 0 ? 'Etc/GMT' : `Etc/GMT${east > 0 ? '-' : '+'}${Math.abs(east / 60)}`; // Etc/GMT-1 : une heure d'avance
}

// Échéance d'une journée, à l'heure de l'appareil : « ce soir à 21 h », « demain à 21 h 30 », « jeudi 30 à 21 h ».
export function deadlineText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const hour = hourText(d.getHours(), d.getMinutes());
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const gap = Math.round((day(d) - day(new Date(now))) / 86400000);
  if (gap === 0) return `${d.getHours() >= 18 ? 'ce soir' : 'aujourd’hui'} à ${hour}`;
  if (gap === 1) return `demain à ${hour}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} à ${hour}`;
}
export const hourText = (h, m = 0) => `${h}\u00a0h${m ? `\u00a0${String(m).padStart(2, '0')}` : ''}`; // espaces insécables : « 21 h » jamais coupé
