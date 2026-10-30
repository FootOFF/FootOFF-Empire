import { AI_PSEUDO, LEAGUE_ENGINE, MAX_MY_LEAGUES, isLeagueCode, roundPayload } from './league';
import { LANG, t } from '../i18n/index';

// Le serveur des ligues (site footoff.media, app/api/ligue) : même origine que le jeu en ligne
// (www.footoff.media/footoffempire/), et en développement le relais de Vite (vite.config.js) vers le site lancé en
// local. Jamais de cookie (credentials omis) ; un membre se présente par l'en-tête x-ligue-auth « identifiant.secret ».
// Les messages d'erreur du serveur sont écrits pour le joueur : on les montre tels quels.
const API = '/api/ligue';

// data : la réponse du serveur (une sauvegarde refusée y porte la fiche de la copie du serveur, conflict)
// Messages du serveur des ligues (écrits en français) : traduits à l'affichage. Un nombre dans le message (« 3 offres en
// attente au plus ») passe par {n} dans le dictionnaire.
function serverText(msg) {
  if (LANG === 'fr' || typeof msg !== 'string') return msg;
  const direct = t(msg);
  if (direct !== msg) return direct;
  const n = msg.match(/\d+/)?.[0];
  if (!n) return msg;
  const key = msg.replace(/\d+/, '{n}');
  const out = t(key, { n });
  return out === key.replace('{n}', n) ? msg : out;
}

export class LeagueError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Activité du joueur (pouls des ligues, 0.8.6) : son dernier geste, et sa dernière demande au serveur des ligues.
let lastInput = Date.now();
let lastAction = 0;
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
}

// keepalive : la demande part même si l'onglet se ferme (64 Ko au plus, règle des navigateurs)
async function call(path, { method = 'GET', body, auth, keepalive = false } = {}) {
  if (method !== 'GET') lastAction = Date.now();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers['x-ligue-auth'] = `${auth.id}.${auth.secret}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', keepalive,
    });
  } catch {
    throw new LeagueError(t('Serveur des ligues injoignable : vérifie ta connexion.'), 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide ou qui n'est pas du JSON */ }
  if (!res.ok) {
    const fallback = res.status === 429 ? t('Trop de demandes : réessaie dans un moment.') : t('Le serveur des ligues ne répond pas comme prévu. Réessaie.');
    throw new LeagueError(data?.error ? serverText(data.error) : fallback, res.status, data);
  }
  return data;
}

export const createLeague = (payload) => call('', { method: 'POST', body: { ...payload, engine: LEAGUE_ENGINE } });
export const leagueInfo = (code) => call(`/${code}/info`);
export const joinLeague = (code, payload) => call(`/${code}/join`, { method: 'POST', body: payload });
// teams : avec, si la journée est due, les équipes à faire jouer (celles validées, sinon la dernière connue) ; since :
// seulement les résultats de la saison après cette journée (ceux que l'appareil n'a pas encore)
export const leagueState = (m, { teams = false, since = null } = {}) => {
  const q = [teams && 'teams=1', since != null && `since=${since}`].filter(Boolean).join('&');
  return call(`/${m.code}/state${q ? `?${q}` : ''}`, { auth: m });
};
export const leagueResults = (m, season) => call(`/${m.code}/results?season=${season}`, { auth: m });
// Historique du mercato de la ligue (0.8.8) : les transferts conclus par les amis, saison en cours et précédente.
export const leagueTransfers = (m) => call(`/${m.code}/transfers`, { auth: m });
// Pouls (0.8.6) : une empreinte de ce qui change dans le championnat (arrivées, équipes validées, journée, offres et
// réponses entre amis), de quelques octets ; relire l'état complet seulement quand elle change.
export const leaguePulse = (m) => call(`/${m.code}/pulse`, { auth: m }).then((d) => d?.p ?? null);
// Cadence (audit cyber-auditor du 2026-10-28 : appels comptés par Vercel, pare-feu à 30 par minute et par adresse) :
// toutes les 6 s quand quelque chose est en attente (urgent, ou moins de deux minutes après une demande au serveur),
// sinon toutes les 30 s, puis 60 s tant que rien ne change ; jamais sans un geste du joueur dans les trois dernières
// minutes ni écran caché.
export const PULSE_FAST = 6000;
const PULSE_SLOW = 30000;
const PULSE_MAX = 60000;
const ACTIVE_MS = 3 * 60000;
// Quelque chose attend dans ce championnat (état relu d) : salle d'attente, coup d'envoi annoncé, offre ouverte, ou
// mon équipe validée en attendant celle d'un ami.
export function pulseUrgent(d) {
  if (!d?.league) return true;
  if (d.league.status === 'lobby' || (d.kickoff && !d.due)) return true;
  if (d.moves?.some((x) => x.kind === 'f' && x.status === 'open')) return true;
  const mine = d.members?.find((x) => x.id === d.me?.id);
  return !!mine?.validated && d.members.some((x) => x.id !== mine.id && !x.validated && x.active && x.pseudo !== 'Ordinateur');
}
// Surveille un championnat : onChange quand son empreinte change (pas au premier relevé, pris tout de suite : la
// référence est celle de l'état qu'on vient de lire). urgent() : la cadence rapide. S'arrête quand le championnat
// disparaît ou n'est plus le nôtre (401, 404, dont un serveur qui ne connaît pas encore le pouls : la relecture de
// chaque minute suffit) ; patiente une minute quand le serveur freine (429).
// Le joueur est devant le jeu : écran visible, un geste dans les trois dernières minutes (relectures de chaque minute
// comprises : un onglet oublié ne coûte plus rien).
export const userActive = () => document.visibilityState === 'visible' && Date.now() - lastInput <= ACTIVE_MS;
// Une seule surveillance par championnat sur l'appareil, partagée par les écrans qui la demandent (le club de ligue et
// le panneau du championnat), arrêtée quand plus aucun ne s'en sert.
const watchers = new Map();
export function watchPulse(m, onChange, urgent = () => true) {
  let w = watchers.get(m.code);
  if (!w) {
    const subs = new Set();
    w = { subs, stop: runPulse(m, () => [...subs].forEach((s) => s.onChange()), () => [...subs].some((s) => s.urgent())) };
    watchers.set(m.code, w);
  }
  const sub = { onChange, urgent };
  w.subs.add(sub);
  return () => {
    w.subs.delete(sub);
    if (!w.subs.size) { w.stop(); if (watchers.get(m.code) === w) watchers.delete(m.code); }
  };
}
// L'horloge locale bat toutes les 6 s sans rien demander : la cadence suit aussitôt ce qui se passe (une équipe validée,
// une offre faite) ; le serveur n'est interrogé que si c'est urgent, juste après une demande, ou le délai calme écoulé.
function runPulse(m, onChange, urgent) {
  let last = null, stop = false, timer = null, idle = PULSE_SLOW, asked = 0, pause = 0;
  const beat = async () => {
    if (stop) return;
    const now = Date.now();
    const want = urgent() || now - lastAction < 2 * 60000 || now - asked >= idle;
    if (want && now >= pause && userActive()) { // personne devant : rien n'est demandé
      asked = now;
      try {
        const p = await leaguePulse(m);
        if (stop) return;
        if (last !== null && p !== last) { idle = PULSE_SLOW; onChange(); } else if (last !== null) idle = Math.min(PULSE_MAX, idle * 2);
        last = p;
      } catch (x) {
        if (x?.status === 401 || x?.status === 404) { stop = true; return; }
        pause = Date.now() + (x?.status === 429 ? 60000 : 30000); // serveur qui freine, en panne, ou réseau coupé
      }
    }
    if (!stop) timer = setTimeout(beat, PULSE_FAST);
  };
  beat();
  return () => { stop = true; clearTimeout(timer); };
}
export const startLeague = (m) => call(`/${m.code}/start`, { method: 'POST', body: {}, auth: m });
export const kickMember = (m, member) => call(`/${m.code}/kick`, { method: 'POST', body: { member }, auth: m });
export const leaveLeague = (m) => call(`/${m.code}/leave`, { method: 'POST', body: {}, auth: m });
// le créateur supprime le championnat pour tout le monde ; name : son nom exact, tapé pour confirmer
export const deleteLeague = (m, name) => call(`/${m.code}/delete`, { method: 'POST', body: { name }, auth: m });
export const sendSheet = (m, season, round, sheet) => call(`/${m.code}/sheet`, { method: 'POST', body: { season, round, sheet }, auth: m });
export const sendResult = (m, body) => call(`/${m.code}/result`, { method: 'POST', body: { ...body, engine: LEAGUE_ENGINE }, auth: m });
// Mercato immédiat (0.8.3) : une demande de la file de la partie (leagueClub.js, leagueRequest) : sign, offer, withdraw,
// answer. Refusée par le serveur (signature prise par un autre club, mercato fermé le temps de la journée, offre déjà
// répondue) : sa réponse, avec la raison ; injoignable : l'erreur remonte (la demande repartira plus tard).
export async function sendMove(m, { action, body }) {
  try {
    return await call(`/${m.code}/${action}`, { method: 'POST', body, auth: m });
  } catch (x) {
    if (x instanceof LeagueError && x.status >= 400 && x.status < 500 && x.status !== 429) return { error: x.message, taken: !!x.data?.taken };
    throw x;
  }
}
// Sauvegarde du club (leagueCloud.js) : la copie du serveur ; l'envoi d'une copie partie de la version base
export const fetchSave = (m) => call(`/${m.code}/save`, { auth: m });
export const sendSave = (m, body, { keepalive = false } = {}) => call(`/${m.code}/save`, { method: 'POST', body, auth: m, keepalive });

// Résultats gardés sur l'appareil, avec l'état de la ligue après chaque journée (leagueWorld.js, une dizaine de Ko) :
// le serveur n'envoie que les nouveaux. { season, results, prev } ; prev : le dernier état de la saison d'avant (il sert
// au calcul de la première journée de la saison).
const RES = (code) => `fo-ligue-res-${code}`;
function readCache(code) {
  try {
    const c = JSON.parse(localStorage.getItem(RES(code)) || 'null');
    return c && Array.isArray(c.results) ? c : null;
  } catch {
    return null;
  }
}
function writeCache(code, c) {
  try { localStorage.setItem(RES(code), JSON.stringify(c)); } catch { /* stockage plein : relu du serveur la prochaine fois */ }
}
export const dropCache = (code) => { try { localStorage.removeItem(RES(code)); } catch { /* rien à effacer */ } };

// État d'un championnat avec tous les résultats de la saison (ceux de l'appareil et les nouveaux), l'état de la ligue en
// cours (world, null avant la première journée de la première saison) et celui d'avant chaque journée (worldBefore).
async function syncedState(m, { teams = false } = {}) {
  let c = readCache(m.code);
  let d = await leagueState(m, { teams, since: c?.results.length ? c.results[c.results.length - 1].round : null });
  if (c && c.season !== d.league.season) { // nouvelle saison : tout est relu, le dernier état de la précédente reste
    const last = c.results[c.results.length - 1];
    c = { season: d.league.season, results: [], prev: last?.world && c.season === d.league.season - 1 ? { season: c.season, world: last.world } : c.prev };
    d = await leagueState(m, { teams });
  }
  if (!c) c = { season: d.league.season, results: [], prev: null };
  const known = new Set(c.results.map((r) => r.round));
  const results = [...c.results, ...(d.results || []).filter((r) => !known.has(r.round))].sort((a, b) => a.round - b.round);
  let prev = c.prev?.season === d.league.season - 1 ? c.prev : null;
  if (!prev && d.league.season > 1 && d.league.status === 'running') {
    const old = await leagueResults(m, d.league.season - 1).catch(() => null);
    const last = old?.results?.[old.results.length - 1];
    if (last?.world) prev = { season: d.league.season - 1, world: last.world };
  }
  writeCache(m.code, { season: d.league.season, results, prev });
  const start = prev?.world || null;
  const worldAt = (round) => { // état d'avant la journée `round`
    const before = results.filter((r) => r.round < round && r.world);
    return before.length ? before[before.length - 1].world : start;
  };
  // skew : avance de l'horloge du serveur sur celle de l'appareil (compte à rebours du coup d'envoi, 0.8.6)
  const skew = d.serverTime ? Date.parse(d.serverTime) - Date.now() : 0;
  return { ...d, results, world: worldAt(Infinity), worldBefore: worldAt, skew };
}
// Coup d'envoi annoncé (tous ont validé, 0.8.6) en heure de l'appareil, ou null
export const kickoffAt = (d) => (d?.kickoff && !d.due ? Date.parse(d.kickoff) - (d.skew || 0) : null);
// Heure limite de la journée en cours, à l'horloge de l'appareil (bandeau du club, 1.0.1)
export const deadlineAt = (d) => (d?.league?.deadline ? Date.parse(d.league.deadline) - (d.skew || 0) : null);
// Les amis d'une ligue, dans l'ordre de leurs places, et leur équipe de la journée (bandeau du club, 1.0.1) : les places
// de l'ordinateur n'en font pas partie. active : venu dans les sept derniers jours (sinon l'ordinateur joue pour lui).
export function leagueHumans(d) {
  if (!d?.members) return [];
  return d.members.filter((m) => m.pseudo !== AI_PSEUDO).sort((a, b) => a.slot - b.slot)
    .map((m) => ({ id: m.id, pseudo: m.pseudo, ok: !!m.validated, me: m.id === d.me?.id, active: m.active !== false }));
}

// État d'un championnat, journée jouée au passage : si elle est due (tous ont validé, ou l'heure est passée), ce jeu la
// calcule (roundPayload, à l'identique chez chacun, depuis l'état de la ligue d'avant) et l'envoie ; le premier envoi
// fait foi, les autres sont ignorés. Une journée à la fois par championnat sur cet appareil.
const playing = new Set();
export async function refreshLeague(m) {
  const d = await syncedState(m);
  if (!d.due || playing.has(m.code)) return d;
  playing.add(m.code);
  try {
    for (let k = 0; k < 2; k++) { // une signature tombée au même instant : la journée se recalcule une fois avec elle
      const full = await syncedState(m, { teams: true });
      if (!full.due || !full.teams) return full;
      const sent = await sendResult(m, { season: full.league.season, round: full.league.round, ...roundPayload(full, full.world) }).catch((x) => {
        if (x instanceof LeagueError && x.data?.retry) return null;
        throw x;
      });
      if (sent) break;
    }
  } catch {
    return d; // journée prise par un autre ami au même instant, ou réseau : l'état d'avant, relu à la prochaine visite
  } finally {
    playing.delete(m.code);
  }
  return syncedState(m);
}

// ---- mes championnats, gardés sur cet appareil ----
// { code, id, secret, pseudo, club: { name, crest }, name, at } : le secret ne quitte l'appareil que dans l'en-tête
// des demandes au serveur, et dans le code de reprise que le joueur copie lui-même.
const KEY = 'fo-ligues';
const valid = (m) => m && isLeagueCode(m.code) && typeof m.id === 'string' && typeof m.secret === 'string' && m.club?.name;

export function myLeagues() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(valid).slice(0, MAX_MY_LEAGUES) : [];
  } catch {
    return [];
  }
}
function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* stockage plein ou indisponible */ }
  return list;
}
export const rememberLeague = (m) => store([m, ...myLeagues().filter((x) => x.code !== m.code)].slice(0, MAX_MY_LEAGUES));
export const forgetLeague = (code) => { dropCache(code); return store(myLeagues().filter((x) => x.code !== code)); };
export const updateLeague = (code, patch) => store(myLeagues().map((x) => (x.code === code ? { ...x, ...patch } : x)));

// Code de reprise d'un club sur un autre appareil : « CODE.identifiant.secret » (ni l'identifiant ni le secret ne
// contiennent de point).
export const resumeCodeOf = (m) => `${m.code}.${m.id}.${m.secret}`;
export function parseResumeCode(raw) {
  const [code, id, secret, ...rest] = String(raw || '').trim().split('.');
  const b64 = /^[A-Za-z0-9_-]{8,64}$/;
  if (rest.length || !isLeagueCode((code || '').toUpperCase()) || !b64.test(id || '') || !b64.test(secret || '')) return null;
  return { code: code.toUpperCase(), id, secret };
}

// Invitation reçue par lien (…/footoffempire/?ligue=CODE) : lue une fois au démarrage, puis retirée de l'adresse
// (gardée ici : un second appel rend le même code).
let invite;
export function takeInvite() {
  if (invite !== undefined) return invite;
  invite = null;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ligue')) return invite;
    const code = (url.searchParams.get('ligue') || '').toUpperCase();
    url.searchParams.delete('ligue');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    invite = isLeagueCode(code) ? code : null;
  } catch { /* adresse illisible : pas d'invitation */ }
  return invite;
}
export const inviteLink = (code) => `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}?ligue=${code}`;
