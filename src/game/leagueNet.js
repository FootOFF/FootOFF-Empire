import { LEAGUE_ENGINE, MAX_MY_LEAGUES, isLeagueCode, roundPayload } from './league';

// Le serveur des ligues (site footoff.media, app/api/ligue) : même origine que le jeu en ligne
// (www.footoff.media/footoffempire/), et en développement le relais de Vite (vite.config.js) vers le site lancé en
// local. Jamais de cookie (credentials omis) ; un membre se présente par l'en-tête x-ligue-auth « identifiant.secret ».
// Les messages d'erreur du serveur sont écrits pour le joueur : on les montre tels quels.
const API = '/api/ligue';

export class LeagueError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(path, { method = 'GET', body, auth } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers['x-ligue-auth'] = `${auth.id}.${auth.secret}`;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store',
    });
  } catch {
    throw new LeagueError('Serveur des ligues injoignable : vérifie ta connexion.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* réponse vide ou qui n'est pas du JSON */ }
  if (!res.ok) {
    const fallback = res.status === 429 ? 'Trop de demandes : réessaie dans un moment.' : 'Le serveur des ligues ne répond pas comme prévu. Réessaie.';
    throw new LeagueError(data?.error || fallback, res.status);
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
export const startLeague = (m) => call(`/${m.code}/start`, { method: 'POST', body: {}, auth: m });
export const kickMember = (m, member) => call(`/${m.code}/kick`, { method: 'POST', body: { member }, auth: m });
export const leaveLeague = (m) => call(`/${m.code}/leave`, { method: 'POST', body: {}, auth: m });
export const sendSheet = (m, season, round, sheet) => call(`/${m.code}/sheet`, { method: 'POST', body: { season, round, sheet }, auth: m });
export const sendResult = (m, body) => call(`/${m.code}/result`, { method: 'POST', body: { ...body, engine: LEAGUE_ENGINE }, auth: m });

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
  return { ...d, results, world: worldAt(Infinity), worldBefore: worldAt };
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
    const full = await syncedState(m, { teams: true });
    if (!full.due || !full.teams) return full;
    await sendResult(m, { season: full.league.season, round: full.league.round, ...roundPayload(full, full.world) });
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
