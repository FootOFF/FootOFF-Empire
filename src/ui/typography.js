// Typographie française, appliquée à tout le texte affiché par le jeu (textes fixes, journal, conseils, noms de
// clubs saisis) : le code garde des espaces ordinaires, l'écran reçoit les bons caractères.
// - espace insécable fine avant ; ! ? et insécable avant : (jamais de « ? » seul en début de ligne) ;
// - insécables à l'intérieur des « guillemets » ;
// - un nombre ne se sépare pas de son unité : 600 places, 42 000 €, 46 %, 3 pts ; ni un repère de son numéro :
//   Saison 3, journée 2, niveau 4 ; un séparateur « · » reste en fin de ligne ;
// - apostrophe typographique (l’Empire) et points de suspension (…).

const NBSP = '\u00a0';
const NNBSP = '\u202f'; // espace fine insécable

const UNITS = 'pts?|points?|ans|places?|spectateurs?|matchs?|joueurs?|buts?|saisons?|journées?|jours?|heures?|h|min|minutes?|secondes?|niveaux?|étoiles?';

const RULES = [
  // milliers (1.0.14, chasse aux défauts) : une insécable entière ; l'espace fine d'Intl ne fait que 1,8 px dans Inter à
  // 13 px, « 1 250 € » s'y lisait « 1250 € »
  [/(\d) (?=\d)/g, `$1${NBSP}`],
  [/ ([;!?])/g, `${NNBSP}$1`],
  [/ :/g, `${NBSP}:`],
  [/« /g, `«${NBSP}`],
  [/ »/g, `${NBSP}»`],
  [/(\d) (%|€|k€|M€)/g, `$1${NNBSP}$2`],
  [new RegExp(String.raw`(\d) (${UNITS})(?!\p{L})`, 'gu'), `$1${NBSP}$2`],
  // un repère ne se sépare pas de son numéro : Saison 3, journée 2, niveau 4, parcelle 5, N°7
  [/(^|[^\p{L}])((?:[Ss]aison|[Jj]ourn[ée]e|[Nn]iveau|[Pp]arcelle|N°)) (\d)/gu, `$1$2${NBSP}$3`],
  // un séparateur « · » termine la ligne, il n'ouvre jamais la suivante
  [/ · /g, `${NBSP}· `],
  [/(\p{L})'(\p{L})/gu, '$1’$2'],
  [/\.\.\./g, '…'],
];

// Nombre et unité dans deux textes voisins (JSX « {age} ans ») : l'espace de tête de l'unité devient insécable.
const LEAD = [
  [/^ (%|€|k€|M€)(?!\p{L})/u, `${NNBSP}$1`],
  [new RegExp(String.raw`^ (${UNITS})(?!\p{L})`, 'u'), `${NBSP}$1`],
];

export function frTypo(text) {
  let s = text;
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);

function fixNode(node) {
  const parent = node.parentNode;
  if (!parent || SKIP.has(parent.nodeName) || parent.isContentEditable) return;
  const v = node.nodeValue;
  if (!v || v.length < 2) return;
  let f = frTypo(v);
  if (f.charCodeAt(0) === 32 && /\d$/.test(node.previousSibling?.textContent || '')) {
    for (const [re, to] of LEAD) f = f.replace(re, to);
  }
  if (f !== v) node.nodeValue = f; // idempotent : la correction ne redéclenche rien
}

function fixTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) fixNode(n);
}

// Observe la page : chaque texte inséré ou modifié (React ne relit jamais le DOM, il réécrit le texte quand il
// change, et la correction s'applique de nouveau).
export function installFrenchTypography(root = document.body) {
  fixTree(root);
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'characterData') fixNode(m.target);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 3) fixNode(n); else if (n.nodeType === 1) fixTree(n); });
    }
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true });
  return () => obs.disconnect();
}
