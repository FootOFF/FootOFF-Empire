import { DIVISIONS, ELITE_SCALE, SAVE_KEY, SQUAD_MIN } from './constants';
import { initGoals } from './goals';
import { ensureFixedPlots } from './map';
import { ensureLineup } from './tactics';
import { ensureSquadMin } from './squadFloor';
import { addReserves } from './engine';
import { ensureTutorial } from './tutorial';
import { assignNumber, upgradePlayer } from './players';
import { ensureLedger } from './ledger';
import { fixLeagueNames, playerName, registerNames, renameRetired } from './names';
import { buildCalendar } from './cups';
import { BUYERS, roundTo, valueOf } from './mercato';
import { refreshScouting } from './academy';
import { drawObjectives } from './objectives';
import { refreshTransfers } from './transfers';
import { rebuildRecords } from './records';
import { normalizeCrest } from './crest';
import { distinctSquad, legacyFace } from './faces';
import { ensureDeals } from './contracts';
import { gameLang, t } from '../i18n/index';

// Sauvegarde : un emplacement principal (SAVE_KEY) et une copie de secours (BACKUP_KEY), prise au chargement de chaque
// session (la partie telle qu'elle était quand on a ouvert le jeu). Au chargement, une sauvegarde illisible ou
// invalide (stockage abîmé, migration ratée) laisse la place à la copie de secours, et l'interface le dit. Un code de
// sauvegarde (exportCode / importCode : JSON compressé en base64, préfixe FOE1) permet de copier la partie d'un appareil
// à l'autre ; importer une partie range l'ancienne en copie de secours, rien n'est jamais effacé sans trace.
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const lastLoad = { source: null, corrupt: false, foreign: null }; // d'où vient la partie chargée : 'main' | 'backup' | null
// Langue d'une partie (src/i18n) : fixée à la fondation ; une partie d'avant les langues est en français. Une partie ne
// s'ouvre que dans sa langue (loadGame) : réparée dans une autre, ses joueurs seraient renommés avec d'autres listes.
export const langOf = (s) => s?.lang || 'fr';
// Résumé d'une partie d'une autre langue (écran titre : « Continuer » recharge le jeu dans sa langue)
const foreignOf = (s) => ({ clubName: s.clubName, crest: s.crest, seasonNumber: s.seasonNumber, divisionIndex: s.divisionIndex, lang: langOf(s) });

// Match en direct en cours (0.5.1) : un emplacement à part, écrit pendant le direct (match.jsx, LiveMatch) ; si l'app se
// ferme, le match reprend à la minute près à la réouverture (App.jsx). key : le match concerné (live.js, liveKeyOf) ;
// un enregistrement d'un autre match, ou d'une autre version du moteur, est ignoré.
export const LIVE_KEY = `${SAVE_KEY}.live`;
export function saveLive(rec) {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify(rec)); } catch { /* stockage plein ou indisponible : pas de reprise */ }
}
export function loadLive() {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function clearLive() {
  try { localStorage.removeItem(LIVE_KEY); } catch { /* rien à nettoyer */ }
}

export function saveGame(state) {
  try {
    state.version = 4;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  } catch {
    /* stockage indisponible : le prototype reste jouable sans sauvegarde */
  }
}

// Une sauvegarde a-t-elle la forme d'une partie ? (club, effectif, saison, division)
export function validSave(s) {
  return !!s && typeof s === 'object' && typeof s.clubName === 'string' && Array.isArray(s.players) && s.players.length > 0
    && Number.isFinite(s.seasonNumber) && Number.isInteger(s.divisionIndex) && s.divisionIndex >= 0 && s.divisionIndex <= 3
    && !!s.buildings && typeof s.buildings === 'object';
}

export function hasBackup() {
  try { return !!localStorage.getItem(BACKUP_KEY); } catch { return false; }
}
// Copie de secours : la sauvegarde principale telle quelle (texte), ou une partie donnée.
export function backupSave(state = null) {
  try {
    const raw = state ? JSON.stringify(state) : localStorage.getItem(SAVE_KEY);
    if (raw) localStorage.setItem(BACKUP_KEY, raw);
  } catch { /* stockage indisponible */ }
}
// Remet la copie de secours en sauvegarde principale (écran d'erreur) ; l'ancienne principale devient la copie.
export function restoreBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return false;
    const main = localStorage.getItem(SAVE_KEY);
    localStorage.setItem(SAVE_KEY, raw);
    if (main) localStorage.setItem(BACKUP_KEY, main);
    return true;
  } catch { return false; }
}
// Résumé d'une sauvegarde (écran d'erreur, confirmation d'import) sans la réparer.
export function peekSave(raw) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return validSave(s) ? { clubName: s.clubName, season: s.seasonNumber, division: s.divisionIndex } : null;
  } catch { return null; }
}
export function peekBackup() {
  try { return peekSave(localStorage.getItem(BACKUP_KEY)); } catch { return null; }
}

// --- Code de sauvegarde ---------------------------------------------------------------------------------------
const bytesToB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export async function exportCode(state) {
  const text = JSON.stringify({ ...state, lastSeen: Date.now() });
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'function') return `FOE1:${bytesToB64(await pipe(bytes, new CompressionStream('gzip')))}`;
  return `FOE0:${bytesToB64(bytes)}`;
}
// Lit un code : la partie brute (non réparée), ou null s'il est illisible.
export async function decodeCode(code) {
  try {
    const m = /^\s*FOE([01]):([A-Za-z0-9+/=\s]+)$/.exec(code || '');
    if (!m) return null;
    let bytes = b64ToBytes(m[2].replace(/\s+/g, ''));
    if (m[1] === '1') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    const s = JSON.parse(new TextDecoder().decode(bytes));
    return validSave(s) ? s : null;
  } catch { return null; }
}
// Partie importée d'une autre langue : rangée telle quelle (l'ancienne devient la copie de secours), elle sera réparée au
// chargement, une fois le jeu rechargé dans sa langue.
export function importForeign(raw) {
  if (!validSave(raw)) return false;
  backupSave();
  clearLive();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...raw, lang: langOf(raw) })); return true; } catch { return false; }
}
// Installe une partie importée : l'ancienne sauvegarde devient la copie de secours. Renvoie la partie réparée.
export function importSave(raw) {
  if (!validSave(raw)) return null;
  backupSave();
  clearLive(); // un match en cours de l'ancienne partie ne reprend pas dans celle-ci
  const s = repairSave(JSON.parse(JSON.stringify(raw)));
  saveGame(s);
  return s;
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

// 0.6.0 : l'Élite passe à l'échelle d'un grand championnat (salaires, valeurs, droits TV, sponsors et primes ×4 environ).
// Une partie déjà en Élite garde sa situation : sa trésorerie, les offres reçues, les prix demandés, les contre-
// propositions en cours et la référence de l'objectif « dans le vert » suivent la même échelle (les comptes des saisons
// passées et le bilan du mercato restent tels qu'ils ont été). Ailleurs, rien ne change avant la montée en Élite.
function scaleElite(y) {
  if (y.eliteScale === ELITE_SCALE) return y;
  if (y.divisionIndex === DIVISIONS.length - 1) {
    const k = (v) => Math.round(v * ELITE_SCALE);
    y.money = k(y.money);
    if (y.objectives?.startMoney != null) y.objectives.startMoney = k(y.objectives.startMoney);
    for (const o of [...(y.offers || []), ...(y.parkedOffers || [])]) { o.amount = k(o.amount); if (o.v) o.v = k(o.v); }
    for (const x of y.saleList || []) if (x.price) x.price = k(x.price);
    for (const p of [...(y.market || []), ...(y.transfers || [])]) if (p.talks?.counter) p.talks.counter = k(p.talks.counter);
  }
  y.eliteScale = ELITE_SCALE;
  return y;
}

// v2 → v3 : nouvelle économie (montants ×12 environ) ; la trésorerie suit la même échelle.
function migrateEconomy(s) {
  s.money = Math.round(s.money * 12);
  s.version = 3;
  return s;
}

// Toute sauvegarde : le stade retrouve sa parcelle (réparation des parties déjà commencées) ; parties commencées avant
// le match en direct : banc de 4 remplaçants offert une fois ; avant l'écran Finances : le livre de comptes démarre à la
// trésorerie actuelle ; noms des joueurs : équivalents francophones pour les prénoms et noms sortis des listes, y compris
// dans l'historique des matchs (notes, buteurs, passeurs, fil du match). Migrations v1 → v4 comprises.
export function repairSave(s) {
    const fix = (x) => {
      const y = ensureTutorial(ensureLineup(addReserves(ensureFixedPlots(migratePlayers(x)))));
      ensureLedger(y);
      y.buildings.transfers ??= 0; // bureau des transferts (ajouté après coup)
      y.buildings.direction ??= 0; // direction du club (ajoutée après coup)
      y.buildings.medical ??= 0; // centre médical (ajouté après coup)
      y.buildings.league ??= 0; // Siège de la Ligue (0.8.0)
      y.crest = normalizeCrest(y.crest); // écusson du club (ajouté après coup : écusson par défaut, noir et or)
      y.alumni ||= []; // anciens joueurs (archivés à partir de cette version)
      y.ticketPolicy ||= 'standard';
      y.lang ||= 'fr'; // langue de la partie (src/i18n) : toutes les parties d'avant les langues sont en français
      if (!y.objectives) drawObjectives(y); // objectifs du conseil (ajoutés après coup) : tirés pour la saison en cours
      y.records ||= rebuildRecords(y); // records du club : reconstitués depuis l'historique des matchs
      // missions sans régions (0.8.12) : les jeunes repérés dans une région gardent une note de mission ordinaire
      // et « des milieus » s'écrit « des milieux » (notes de mission et journal)
      for (const p of [...(y.youth || []), ...(y.scouting?.list || [])]) {
        if (p.scoutNote?.startsWith(t('Repéré '))) p.scoutNote = t('Mission des recruteurs');
        else if (p.scoutNote?.includes('des milieus')) p.scoutNote = p.scoutNote.replace('des milieus', 'des milieux');
      }
      for (const j of y.journal || []) if (j.text?.includes('des milieus')) j.text = j.text.replace(/des milieus/g, 'des milieux');
      // trophées : les titres de champion déjà gagnés sont retrouvés dans l'historique des classements
      if (!y.trophies) y.trophies = (y.history || []).filter((h) => h.position === 1).map((h) => ({ comp: 'league', season: h.season, division: h.division }));
      // calendrier avec coupes : la saison en cours reprend à la bonne journée, la coupe au prochain tour au calendrier
      if (!y.calendar && !y.league) { // partie de ligue : pas de coupes (leagueSeason.js)
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
      if (y.players.length < SQUAD_MIN) { ensureSquadMin(y); ensureLineup(y); } // minimum de 13 joueurs (0.8.4)
      const beforeMercato = !y.shortlist; // partie commencée avant le mercato unique
      y.shortlist ||= []; // mercato : joueurs suivis, joueurs à vendre, offres reçues, historique (ajoutés après coup)
      y.saleList ||= [];
      y.offers ||= [];
      y.mercatoLog ||= [];
      // ventes négociées (prix demandé, clubs acheteurs au plafond secret) : les offres d'avant gardent leur montant et
      // laissent un peu de marge à la négociation
      for (const x of y.saleList) {
        const p = y.players.find((q) => q.id === x.id);
        if (p && !x.price) x.price = roundTo(valueOf(y, p));
      }
      y.offers = y.offers.filter((o) => y.players.some((q) => q.id === o.playerId)).map((o) => {
        if (o.b !== undefined) return o;
        const v = valueOf(y, y.players.find((q) => q.id === o.playerId));
        const k = o.amount / v;
        const tier = k >= 1.2 ? 'big' : k >= 1 ? 'mid' : 'small';
        const div = Math.min(3, Math.max(0, y.divisionIndex + BUYERS[tier].step));
        const { haggled, ...rest } = o; // eslint-disable-line no-unused-vars
        return { ...rest, tier, div, v, b: k + 0.14, atAsk: false, talks: { tries: 0, closed: false } };
      });
      if (beforeMercato) refreshTransfers(y, 'grow'); // le mercato se remplit tout de suite (joueurs libres et sous contrat)
      y.youth ||= []; // équipe de jeunes de l'académie (ajoutée après coup)
      const renamed = new Map(); // ancien nom → nouveau
      for (const p of y.league ? [] : [...y.players, ...(y.market || []), ...y.transfers]) { // ligue : les noms sont ceux de la ligue
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
      registerNames([...y.players, ...y.youth, ...(y.scouting?.list || []), ...y.market, ...y.transfers, ...y.alumni].map((p) => p.name));
      if (!y.scouting) refreshScouting(y); // jeunes repérés de la journée, tout de suite (noms déjà tous connus)
      if (!y.league) fixLeagueNames(y); // un club adverse en double (même nom ou même lieu) dans la division est renommé
      scaleElite(y); // Élite à l'échelle d'un grand championnat (0.6.0)
      // visages (0.6.1) : un joueur d'avant garde la base de son portrait (teint, cheveux, coiffure, barbe), avec les
      // nouveaux traits ; puis aucun sosie dans l'effectif (de deux sosies, le dernier arrivé change de coupe)
      for (const p of [...y.players, ...y.youth, ...(y.scouting?.list || []), ...y.market, ...y.transfers, ...y.alumni]) {
        if (!p.face) p.face = legacyFace(p);
      }
      distinctSquad(y.players);
      ensureDeals(y); // contrats (0.8.0) : chaque joueur reçoit un contrat au salaire du jour, de deux à quatre saisons
      // « Elite » s'écrit « Élite » (0.8.2) : les noms de division gardés dans la partie suivent
      const accent = (o) => {
        if (!o) return;
        if (o.division === 'Elite') o.division = t('Élite');
        if (o.nextDivision === 'Elite') o.nextDivision = t('Élite');
      };
      for (const x of [...(y.history || []), ...(y.trophies || []), ...(y.matches || []), ...(y.ledger?.past || []), y.seasonReview]) accent(x);
      for (const p of [...y.players, ...y.alumni]) for (const h of p.hist || []) accent(h);
      return y;
    };
    if (s.version === 4) return fix(s);
    if (s.version === 3) return fix(s);
    if (s.version === 2) return fix(migrateEconomy(s));
    if (s.version === 1) return fix(migrateEconomy(migrate(s)));
    return null;
}

// Charge la partie : la principale, sinon la copie de secours (lastLoad le dit). Une fois chargée, la principale devient
// la copie de secours de la session.
export function loadGame() {
  lastLoad.source = null;
  lastLoad.corrupt = false;
  lastLoad.foreign = null;
  let main = null;
  try { main = localStorage.getItem(SAVE_KEY); } catch { return null; }
  const attempt = (raw) => {
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (!validSave(s)) return null;
      if (langOf(s) !== gameLang()) { lastLoad.foreign = foreignOf(s); return null; } // ni réparée ni réécrite ici
      const fixed = repairSave(s);
      return validSave(fixed) ? fixed : null;
    } catch { return null; }
  };
  const fromMain = attempt(main);
  if (fromMain) {
    lastLoad.source = 'main';
    backupSave(); // la partie telle qu'elle est à l'ouverture de la session
    return fromMain;
  }
  if (lastLoad.foreign) return null; // la partie est intacte, dans une autre langue : surtout pas la copie de secours
  if (main) lastLoad.corrupt = true; // il y avait une sauvegarde, elle est illisible
  let backup = null;
  try { backup = localStorage.getItem(BACKUP_KEY); } catch { return null; }
  const fromBackup = attempt(backup);
  if (fromBackup) {
    lastLoad.source = 'backup';
    try { if (main) localStorage.setItem(`${SAVE_KEY}.corrupt`, main); } catch { /* rien */ } // gardée pour analyse, jamais effacée
    saveGame(fromBackup);
    return fromBackup;
  }
  if (!main) lastLoad.foreign = null; // pas de partie : la copie de secours d'une autre langue n'est pas à reprendre
  return null;
}

// withBackup : effacement voulu par le joueur (« Effacer et recommencer ») : la copie de secours part aussi, la partie
// effacée ne revient pas au chargement suivant (le jeu peut se recharger dans la langue du nouveau club).
export function clearGame({ withBackup = false } = {}) {
  try {
    localStorage.removeItem(SAVE_KEY);
    if (withBackup) localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* rien à nettoyer */
  }
  clearLive();
}
