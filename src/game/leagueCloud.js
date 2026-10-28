import { fetchSave, sendSave } from './leagueNet';

// Sauvegarde du club de ligue sur le serveur (son « casier », table ligue_saves du site) : la partie de l'appareil
// (leagueClub.js), compressée (gzip, puis base64url derrière « gz1: »), envoyée après chaque journée et chaque saison,
// toutes les quinze minutes de jeu si elle a changé, et quand le joueur quitte son club ou l'onglet. Le code de reprise
// ouvre le casier : sur un nouvel appareil, le club revient tel qu'il a été laissé.
// Chaque copie du serveur porte un numéro (version) qui augmente à chaque envoi. L'appareil retient le numéro de la copie
// dont sa partie est partie (base) et l'empreinte de la dernière copie envoyée ou reçue (sent) : si le serveur a une copie
// plus récente et que la partie de l'appareil a changé depuis, les deux ont été jouées, et le joueur choisit.
// Rien n'est bloquant : sans réseau, la partie continue sur l'appareil et part à la prochaine occasion.

const SYNC = (code) => `fo-ligue-sync-${code}`;
const OLD = (code) => `fo-ligue-club-${code}.remplacee`; // la partie de l'appareil remplacée par celle du serveur

// { base, sent, at, bad } ; bad : le numéro d'une copie du serveur illisible ici (plus redemandée)
export function syncOf(code) {
  try {
    const v = JSON.parse(localStorage.getItem(SYNC(code)) || 'null');
    return v && Number.isSafeInteger(v.base) ? v : { base: 0, sent: null, at: null };
  } catch {
    return { base: 0, sent: null, at: null };
  }
}
export const markUnreadable = (code, version) => writeSync(code, { ...syncOf(code), bad: version });
function writeSync(code, v) {
  try { localStorage.setItem(SYNC(code), JSON.stringify(v)); } catch { /* stockage plein : renvoyée à la prochaine occasion */ }
}
export function dropSync(code) {
  try { localStorage.removeItem(SYNC(code)); localStorage.removeItem(OLD(code)); } catch { /* rien à effacer */ }
}

// Compression du navigateur (Chrome 80, Safari 16.4, Firefox 113) : sans elle, la partie reste sur l'appareil.
export const cloudReady = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// Empreinte d'une partie (FNV-1a sur le texte, et sa longueur) : a-t-elle changé depuis le dernier envoi ? Seulement ce
// que le joueur a fait (effectif, bâtiments, argent, journées appliquées, ordres) : ce que la ligue réécrit à chaque
// visite (marché commun, joueurs des amis, adversaires, clubs et échéance : syncLeagueClub) n'en fait pas partie.
// Listes et objets vides ignorés : une partie relue de l'appareil en reçoit par défaut (repairSave), sans rien de joué ;
// de même la date de la dernière écriture sur l'appareil (lastSeen, saveLeagueClub) et le numéro de format.
const noEmpty = (k, v) => ((Array.isArray(v) ? !v.length : v && typeof v === 'object' && !Object.keys(v).length) ? undefined : v);
const played = (s) => JSON.stringify({
  ...s, market: null, transfers: null, rivals: null, lastSeen: null, version: null,
  league: { season: s.league?.season, round: s.league?.round, results: s.league?.results, sent: s.league?.sent, orders: s.league?.orders },
}, noEmpty);
export const playedPrint = (s) => fingerprint(played(s));
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}.${text.length}`;
}

// limit : une copie décompressée ne dépasse jamais 16 Mo (une copie piégée ne fait pas tomber l'onglet)
async function streamBytes(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('copie trop lourde'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
async function pack(text) {
  const gz = await streamBytes(new TextEncoder().encode(text), new CompressionStream('gzip'));
  let bin = '';
  for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  return `gz1:${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
async function unpack(data) {
  if (typeof data !== 'string' || !data.startsWith('gz1:')) throw new Error('format');
  const b64 = data.slice(4).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const gz = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await streamBytes(gz, new DecompressionStream('gzip'), 16 * 1024 * 1024));
}

// Que faire en entrant dans son club, d'après la fiche de la copie du serveur (card : { version, season, round, at },
// relue avec l'état de la ligue) et la partie de l'appareil (local, ou null) :
//   local      jouer la partie de l'appareil (ou une nouvelle), envoyée ensuite
//   pull       reprendre la copie du serveur (nouvel appareil, ou partie avancée sur un autre et pas ici)
//   conflict   les deux ont changé : au joueur de choisir
//   blocked    une copie existe, mais ce navigateur ne sait pas l'ouvrir (et l'appareil n'a rien)
export function cloudPlan(code, local, card) {
  const server = Number(card?.version) || 0;
  const sync = syncOf(code);
  if (!server) return 'local';
  if (!cloudReady()) return local ? 'local' : 'blocked';
  if (server === sync.base || server === sync.bad) return 'local'; // déjà la nôtre, ou illisible ici
  if (server < sync.base) { // la copie du serveur a été perdue ou remplacée par une plus ancienne : la nôtre repart
    writeSync(code, { ...sync, base: server, sent: null });
    return 'local';
  }
  if (!local) return 'pull';
  return sync.sent && sync.sent === playedPrint(local) ? 'pull' : 'conflict';
}

// La copie du serveur : { s (la partie, telle quelle), card } ; null s'il n'y en a pas.
export async function pullClub(m) {
  const r = await fetchSave(m);
  if (!r?.data) return null;
  return { s: JSON.parse(await unpack(r.data)), card: { version: r.version, season: r.season, round: r.round, at: r.at } };
}
// La copie reçue devient la partie de l'appareil (fp : l'empreinte de la partie relue, playedPrint) ; l'ancienne partie
// de l'appareil est gardée à côté, au cas où.
export function adoptPulled(m, card, fp, replaced = null) {
  if (replaced) { try { localStorage.setItem(OLD(m.code), JSON.stringify(replaced)); } catch { /* stockage plein */ } }
  writeSync(m.code, { base: card.version, sent: fp, at: card.at });
}

// Envoie la partie si elle a changé depuis le dernier envoi (force : remplacer la copie du serveur, choix du joueur ;
// keepalive : l'onglet se ferme, la demande doit partir quand même). Renvoie { version, at }, { unchanged } ou { skipped }.
// Une copie plus récente sur le serveur : LeagueError 409, avec sa fiche (error.data.conflict).
const busy = new Set();
export async function pushClub(m, s, { force = false, keepalive = false } = {}) {
  if (!cloudReady()) return { skipped: true };
  if (busy.has(m.code)) return { skipped: true };
  const fp = playedPrint(s);
  const sync = syncOf(m.code);
  if (!force && sync.sent === fp) return { unchanged: true };
  busy.add(m.code);
  try {
    const data = await pack(JSON.stringify(s));
    const send = (base, again) => sendSave(m, { base, season: s.seasonNumber, round: s.round || 0, data, force: again }, { keepalive: keepalive && data.length < 60000 });
    const r = await send(sync.base, force).catch((x) => {
      // plus aucune copie sur le serveur (championnat repris à zéro, ménage) : la nôtre devient la première
      if (x?.status === 409 && x.data?.conflict?.version === 0) return send(0, false);
      throw x;
    });
    writeSync(m.code, { base: r.version, sent: fp, at: r.at });
    return r;
  } finally {
    busy.delete(m.code);
  }
}
export const isPushing = (code) => busy.has(code);

// Où en est une partie (fenêtres, bandeaux) : « saison 2 · 3 journées jouées ».
export const stageOf = (season, round) => `saison ${season} · ${round ? `${round} journée${round > 1 ? 's' : ''} jouée${round > 1 ? 's' : ''}` : 'avant la 1re journée'}`;
// « le 28 octobre à 21 h 04 », à l'heure de l'appareil
export function savedWhen(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'récemment';
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

// Mention pour le joueur (menu pause, Siège) : où en est la sauvegarde en ligne de son club ; ok : elle est faite.
export function cloudNote(code, at = Date.now()) {
  if (!cloudReady()) return { ok: false, text: 'Sauvegarde en ligne indisponible sur ce navigateur' };
  const { at: when } = syncOf(code);
  if (!when) return { ok: false, text: 'En attente de sauvegarde en ligne' };
  const min = Math.max(0, Math.round((at - Date.parse(when)) / 60000));
  const h = Math.round(min / 60);
  const ago = min < 1 ? 'à l’instant' : min < 60 ? `il y a ${min} min` : h < 24 ? `il y a ${h} h`
    : `le ${new Date(when).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  return { ok: true, text: `Club sauvegardé en ligne ${ago}` };
}
