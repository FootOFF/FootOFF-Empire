import { LEAGUE_ENGINE, MAX_MY_LEAGUES, isLeagueCode } from './league';

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
export const leagueState = (m) => call(`/${m.code}/state`, { auth: m });
export const startLeague = (m) => call(`/${m.code}/start`, { method: 'POST', body: {}, auth: m });
export const kickMember = (m, member) => call(`/${m.code}/kick`, { method: 'POST', body: { member }, auth: m });
export const leaveLeague = (m) => call(`/${m.code}/leave`, { method: 'POST', body: {}, auth: m });

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
export const forgetLeague = (code) => store(myLeagues().filter((x) => x.code !== code));
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
