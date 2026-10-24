// Journal des erreurs du navigateur (les vingt dernières) : erreurs non attrapées, promesses rejetées, avertissements du
// jeu (console.warn préfixés par un crochet). Sert au rapport de l'écran d'erreur (crash.jsx) et au bouton « Copier le
// rapport ». Rien n'est envoyé nulle part : le rapport ne quitte l'appareil que si le joueur le copie.

const MAX = 20;
export const errlog = [];
const push = (kind, message, detail = '') => {
  errlog.push({ at: new Date().toISOString(), kind, message: String(message).slice(0, 400), detail: String(detail || '').slice(0, 1200) });
  if (errlog.length > MAX) errlog.shift();
};

export function installErrorLog() {
  window.addEventListener('error', (e) => push('error', e.message || e.type, e.error?.stack || `${e.filename || ''}:${e.lineno || ''}`));
  window.addEventListener('unhandledrejection', (e) => push('promise', e.reason?.message || e.reason, e.reason?.stack));
  const warn = console.warn.bind(console);
  console.warn = (...args) => { if (typeof args[0] === 'string' && args[0].startsWith('[')) push('warn', args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '), args.find((a) => a instanceof Error)?.stack); warn(...args); };
}

// Rapport lisible : version, appareil, état de la partie (résumé, jamais les joueurs), erreurs.
export function errorReport(error = null, summary = null) {
  const lines = [
    `FootOFF Empire ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?'} (${typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '?'})`,
    `${new Date().toISOString()} · ${navigator.userAgent}`,
    `écran ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio} · ${navigator.language}`,
  ];
  if (summary) lines.push(`partie : ${summary}`);
  if (error) lines.push('', `erreur : ${error.message || error}`, error.stack || '');
  if (errlog.length) { lines.push('', 'dernières erreurs :'); for (const e of errlog) lines.push(`${e.at} [${e.kind}] ${e.message}`, e.detail ? `  ${e.detail.split('\n').slice(0, 4).join('\n  ')}` : ''); }
  return lines.filter((l) => l !== undefined).join('\n');
}
