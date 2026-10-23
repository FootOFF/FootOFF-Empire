import { SAVE_KEY } from './constants';
import { initGoals } from './goals';
import { ensureFixedPlots } from './map';
import { ensureLineup } from './tactics';
import { addReserves } from './engine';
import { ensureTutorial } from './tutorial';
import { assignNumber, upgradePlayer } from './players';
import { ensureLedger } from './ledger';
import { fixLeagueNames, playerName, registerNames, renameRetired } from './names';
import { buildCalendar } from './cups';
import { refreshTransfers } from './transfers';
import { rebuildRecords } from './records';
import { normalizeCrest } from './crest';

export function saveGame(state) {
  try {
    state.version = 4;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  } catch {
    /* stockage indisponible : le prototype reste jouable sans sauvegarde */
  }
}

// Migration : les sauvegardes v1 (avant l'Empire) n'ont ni goals ni seasonStats.
function migrate(s) {
  if (!s.goals) initGoals(s);
  if (!s.seasonStats) s.seasonStats = { crowd: false };
  s.version = 2;
  return s;
}

// v3 → v4 : joueurs à 9 caractéristiques (6 de plus pour les gardiens), profil et numéro de maillot.
// Chaque joueur garde exactement sa note au poste naturel.
function migratePlayers(s) {
  for (const p of s.players) upgradePlayer(p, s);
  for (const p of s.market) upgradePlayer(p, s);
  for (const p of s.players) if (!p.num) assignNumber(s.players, p);
  s.version = 4;
  return s;
}

// v2 → v3 : nouvelle économie (montants ×12 environ) ; la trésorerie suit la même échelle.
function migrateEconomy(s) {
  s.money = Math.round(s.money * 12);
  s.version = 3;
  return s;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // toute sauvegarde : le stade retrouve sa parcelle (réparation des parties déjà commencées)
    // parties commencées avant le match en direct : banc de 4 remplaçants offert une fois
    // parties commencées avant l'écran Finances : le livre de comptes démarre à la trésorerie actuelle
    // noms des joueurs : équivalents francophones pour les prénoms et noms sortis des listes, y compris dans
    // l'historique des matchs (notes, buteurs, passeurs, fil du match)
    const fix = (x) => {
      const y = ensureTutorial(ensureLineup(addReserves(ensureFixedPlots(migratePlayers(x)))));
      ensureLedger(y);
      y.buildings.transfers ??= 0; // bureau des transferts (ajouté après coup)
      y.crest = normalizeCrest(y.crest); // écusson du club (ajouté après coup : écusson par défaut, noir et or)
      y.alumni ||= []; // anciens joueurs (archivés à partir de cette version)
      y.ticketPolicy ||= 'standard';
      y.records ||= rebuildRecords(y); // records du club : reconstitués depuis l'historique des matchs
      // trophées : les titres de champion déjà gagnés sont retrouvés dans l'historique des classements
      if (!y.trophies) y.trophies = (y.history || []).filter((h) => h.position === 1).map((h) => ({ comp: 'league', season: h.season, division: h.division }));
      // calendrier avec coupes : la saison en cours reprend à la bonne journée, la coupe au prochain tour au calendrier
      if (!y.calendar) {
        buildCalendar(y);
        let leagues = 0;
        let i = 0;
        while (i < y.calendar.length && leagues < y.round) { if (y.calendar[i].comp === 'league') leagues++; i++; }
        y.calIndex = i;
        const nextCup = y.calendar.slice(i).find((f) => f.comp === 'cup');
        if (nextCup) y.cups.cup.stage = nextCup.stage; else y.cups.cup.alive = false;
      }
      y.transfers ||= [];
      y.market ||= [];
      const beforeMercato = !y.shortlist; // partie commencée avant le mercato unique
      y.shortlist ||= []; // mercato : joueurs suivis, joueurs à vendre, offres reçues, historique (ajoutés après coup)
      y.saleList ||= [];
      y.offers ||= [];
      y.mercatoLog ||= [];
      if (beforeMercato) refreshTransfers(y, 'grow'); // le mercato se remplit tout de suite (joueurs libres et sous contrat)
      const renamed = new Map(); // ancien nom → nouveau
      for (const p of [...y.players, ...(y.market || []), ...y.transfers]) {
        const before = p.name;
        renameRetired(p);
        if (p.name !== before) renamed.set(before, p.name);
      }
      if (renamed.size) {
        const nm = (n) => renamed.get(n) || n;
        for (const a of y.alumni) a.name = nm(a.name);
        for (const m of y.matches || []) {
          (m.players || []).forEach((q) => { q.name = nm(q.name); });
          (m.scorers || []).forEach((g) => { g.name = nm(g.name); if (g.assist) g.assist = nm(g.assist); });
          (m.events || []).forEach((e) => { if (e.side === 'home') e.player = nm(e.player); });
          (m.shots || []).forEach((t) => { if (t.s === 0) t.p = nm(t.p); });
        }
      }
      // noms en double (parties d'avant l'unicité des noms) : dans l'effectif, le second porteur reçoit un autre nom
      registerNames([]);
      const seenNames = new Set();
      for (const p of y.players) {
        if (seenNames.has(p.name)) p.name = playerName(seenNames);
        seenNames.add(p.name);
      }
      registerNames([...y.players, ...y.market, ...y.transfers, ...y.alumni].map((p) => p.name));
      fixLeagueNames(y); // un club adverse en double (même nom ou même lieu) dans la division est renommé
      return y;
    };
    if (s.version === 4) return fix(s);
    if (s.version === 3) return fix(s);
    if (s.version === 2) return fix(migrateEconomy(s));
    if (s.version === 1) return fix(migrateEconomy(migrate(s)));
    return null;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* rien à nettoyer */
  }
}
