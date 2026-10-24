// Code de trois lettres d'un club, comme à la télé (bandeau du score du direct). Tiré du nom, sans accents, sans les
// mots génériques (FC, Étoile, Olympique…) ni les petits mots (de, des, du…) ; on garde le dernier mot qui reste, le
// lieu le plus souvent : « Étoile Vaudrémont » → VAU, « US du Lac » → LAC. Un nom composé prend une lettre de chaque
// partie (« Saint-Clair » → SCL), un nom à capitales intérieures prend ses capitales (« FootOFF FC » → FOF). Les deux
// clubs d'un match n'ont jamais le même code (teamCodes). Le nom complet reste partout ailleurs.

const STOP = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'sur', 'sous', 'a', 'au', 'aux']);
const GENERIC = new Set([
  'as', 'fc', 'us', 'sc', 'rc', 'ac', 'cs', 'ca', 'sa', 'so', 'js', 'es', 'ss', 'cf', 'afc', 'asc', 'usm',
  'olympique', 'sporting', 'racing', 'stade', 'etoile', 'union', 'entente', 'avenir', 'jeunesse', 'rapid', 'atlas',
  'bleus', 'jaunes', 'verts', 'club', 'football', 'foot', 'real', 'united', 'association', 'amicale', 'sport', 'sports',
]);
const plain = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '');
const letters = (w) => plain(w).replace(/[^A-Za-z]/g, '');

function mainWord(name) {
  const tokens = String(name || '').split(/[\s’']+/).filter((t) => letters(t));
  const low = (t) => letters(t).toLowerCase();
  const sig = tokens.filter((t) => !STOP.has(low(t)) && !GENERIC.has(low(t)));
  const pool = sig.length ? sig : tokens.filter((t) => !STOP.has(low(t)));
  return { main: (pool.length ? pool : tokens)[(pool.length ? pool : tokens).length - 1] || 'Club', all: pool.length ? pool : tokens };
}

// code principal d'un nom
export function teamCode(name) {
  const { main, all } = mainWord(name);
  const parts = main.split('-').map(letters).filter(Boolean);
  let code;
  if (parts.length > 1) code = parts[0][0] + parts[1].slice(0, 2); // nom composé : Saint-Clair → SCL
  else {
    const w = parts[0] || letters(main);
    const caps = w.slice(1).replace(/[^A-Z]/g, '');
    code = /[a-z]/.test(w) && caps.length >= 2 ? w[0] + caps.slice(0, 2) : w.slice(0, 3); // FootOFF → FOF
  }
  if (code.length < 3) code = (code + all.map(letters).join('')).slice(0, 3); // mot trop court : on complète
  return code.padEnd(3, 'X').toUpperCase();
}

// variantes, si le code principal est déjà pris par l'autre club du match
function alternatives(name) {
  const { main, all } = mainWord(name);
  const w = letters(main).toUpperCase();
  const cons = w.slice(1).replace(/[AEIOUY]/g, '');
  const out = [];
  if (cons.length >= 2) out.push(w[0] + cons.slice(0, 2)); // Valmont → VLM
  if (all.length > 1) out.push(all.slice(-3).map((t) => letters(t)[0]).join('').toUpperCase().padEnd(3, w[1] || 'X'));
  if (w.length >= 3) out.push(w[0] + w.slice(-2)); // Valmont → VNT
  return out.filter((c) => /^[A-Z]{3}$/.test(c));
}

// codes des deux clubs d'un match : le nôtre ne change jamais, l'adversaire prend une variante en cas d'égalité
export function teamCodes(home, away) {
  const h = teamCode(home);
  let a = teamCode(away);
  if (a === h) a = alternatives(away).find((c) => c !== h) || `${a.slice(0, 2)}2`;
  return [h, a];
}
