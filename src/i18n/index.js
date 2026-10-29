// Langues du jeu (demande du PDG, 2026-10-29) : français, anglais, espagnol, arabe (écrit de droite à gauche).
// - La langue d'une partie est fixée à sa création (les noms des joueurs et des clubs sont tirés dans cette langue) :
//   elle ne change plus ensuite. Une partie d'avant les langues est en français.
// - Langue proposée par défaut : celle du site footoff.media (même origine : sa préférence « footoff-lang »), sinon le
//   français ; l'écran titre permet d'en choisir une autre pour la prochaine partie.
// - Un changement de langue recharge le jeu : chaque module lit la langue une fois, à son chargement (ses tableaux de
//   textes sont écrits dans cette langue).
// Les textes sont écrits en français dans le code ; t() les remplace par leur traduction (dictionnaires en, es, ar).

export const LANGS = ['fr', 'en', 'es', 'ar'];
export const LANG_NAMES = { fr: 'Français', en: 'English', es: 'Español', ar: 'العربية' };
const PREF_KEY = 'footoff-empire-lang'; // langue choisie à l'écran titre pour la prochaine partie
const SITE_KEY = 'footoff-lang'; // langue du site footoff.media
const NEXT_KEY = 'footoff-empire-lang-next'; // langue d'une partie à reprendre après rechargement
const INTENT_KEY = 'footoff-empire-lang-intent'; // ce qu'il faut faire juste après ce rechargement (reprendre, fonder…)
const SAVE_KEY = 'footoff-empire-save-v1'; // la carrière (game/constants.js), qui porte sa langue (state.lang)
// Chiffres latins partout (comme le site, y compris en arabe)
export const NUM_LOCALE = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', ar: 'ar-u-nu-latn' };

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };
const ok = (l) => (LANGS.includes(l) ? l : null);

// Langue proposée à l'écran titre (pour une nouvelle partie) : le choix fait dans le jeu, sinon celle du site.
export const preferredLang = () => ok(read(PREF_KEY)) || ok(read(SITE_KEY)) || 'fr';

// Langue de la carrière enregistrée : null s'il n'y en a pas ; une partie d'avant les langues est en français. Une
// partie ne s'ouvre que dans sa langue : la relire dans une autre renommerait ses joueurs (listes de noms de la langue).
export function savedGameLang() {
  const raw = read(SAVE_KEY);
  if (raw == null) return null;
  try { return ok(JSON.parse(raw)?.lang) || 'fr'; } catch { return 'fr'; } // illisible : game/save.js tranchera
}

// Langue de cette session : celle posée juste avant un rechargement (partie à reprendre, club à fonder, club de ligue),
// sinon celle de la carrière enregistrée, sinon la préférée (choix de l'écran titre, ou langue du site).
function sessionLang() {
  const next = ok(read(NEXT_KEY));
  if (next) { write(NEXT_KEY, null); return next; }
  return savedGameLang() || preferredLang();
}
let INTENT = null;
// Ce que le rechargement devait faire : { go: 'continue' | 'create' | 'lang' } ou { league: code } (effacé du stockage
// dès la lecture : un nouveau chargement de la page ne le refait pas).
export const bootIntent = () => INTENT;

export let LANG = 'fr';
// listes de noms de la langue (game/names-*.js), chargées avec le dictionnaire ; null en français
export let NAMES = null;
let DICT = {};
export const isRTL = () => LANG === 'ar';
export const numLocale = () => NUM_LOCALE[LANG] || 'fr-FR';

// À appeler avant de charger le reste du jeu (main.jsx) : choisit la langue et charge son dictionnaire.
export async function initI18n() {
  try { INTENT = JSON.parse(read(INTENT_KEY) || 'null'); } catch { INTENT = null; }
  write(INTENT_KEY, null);
  LANG = sessionLang();
  if (read(PREF_KEY) === 'xx') { // pseudo-langue de contrôle (tests) : chaque texte traduit entre ⟦ ⟧, un oubli se voit
    LANG = 'xx';
    DICT = new Proxy({}, { get: (_, k) => (typeof k === 'string' ? `⟦${k}⟧` : undefined) });
  } else if (LANG !== 'fr') {
    const [mod, names] = await Promise.all(LANG === 'en' ? [import('./en.js'), import('../game/names-en.js')]
      : LANG === 'es' ? [import('./es.js'), import('../game/names-es.js')] : [import('./ar.js'), import('../game/names-ar.js')]);
    DICT = mod.default || {};
    NAMES = names.default;
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = LANG;
    document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
    if (LANG === 'ar') { // l'écriture arabe : Cairo (styles.css, html[lang="ar"]), du même fournisseur que les autres polices
      if (!document.getElementById('fo-cairo')) { // déjà demandée par index.html quand l'arabe était connu au démarrage
        const link = document.createElement('link');
        link.id = 'fo-cairo';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(link);
      }
      watchText((s) => s.replaceAll('→', '←'), '→', 'kbd');
    }
    // anglais : pas d'espace avant « % » (« 66% »), y compris quand le nombre est un texte à part (« {n} % » en JSX)
    if (LANG === 'en') {
      watchText((s, n) => {
        const v = s.replace(/(\d)[ \u00a0\u202f]%/g, '$1%');
        return /^[ \u00a0\u202f]%/.test(v) && /\d$/.test(n.previousSibling?.nodeValue || '') ? v.slice(1) : v;
      }, '%');
    }
  }
  return LANG;
}

// Retouches typographiques d'une langue sur tout texte affiché (un seul endroit pour tout le jeu : textes traduits comme
// valeurs mises bout à bout dans le code). Arabe : « A → B » se lit de droite à gauche, la flèche pointe vers la gauche ;
// les touches du clavier (<kbd>) restent physiques. Anglais : « 66% », sans espace.
function watchText(edit, mark, skip = null) {
  const fix = (n) => {
    if (n.nodeType !== 3 || !n.nodeValue.includes(mark) || (skip && n.parentElement?.closest(skip))) return;
    const v = edit(n.nodeValue, n);
    if (v !== n.nodeValue) n.nodeValue = v;
  };
  const walk = (root) => {
    if (root.nodeType === 3) { fix(root); return; }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) fix(n);
  };
  const start = () => {
    walk(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') fix(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
}

// Choisir la langue de la prochaine partie (écran titre, sans partie en cours) : enregistrée, puis le jeu se recharge
// dans cette langue (intent : l'écran à rouvrir).
export function chooseLang(l, intent = null) {
  if (!ok(l) || l === LANG) return;
  write(PREF_KEY, l);
  if (intent) write(INTENT_KEY, JSON.stringify(intent));
  window.location.reload();
}
// Langue proposée pour la prochaine partie, enregistrée sans recharger (une partie en cours garde la sienne).
export const setPreferredLang = (l) => { if (ok(l)) write(PREF_KEY, l); };
// Ouvrir une partie écrite dans une autre langue, ou fonder un club dans la langue choisie : le jeu se recharge dans
// cette langue, puis fait ce qui était demandé (intent). La préférence ne change pas.
export function reloadInLang(l, intent = null) {
  write(NEXT_KEY, ok(l) || 'fr');
  if (intent) write(INTENT_KEY, JSON.stringify(intent));
  window.location.reload();
}
// Langue des parties (la pseudo-langue de contrôle « xx » joue en français)
export const gameLang = () => (LANG === 'xx' ? 'fr' : LANG);
// Nom d'une langue au fil d'une phrase, dans la langue de l'interface (« garde sa langue (anglais) »)
export const langName = (l) => ({ fr: t('français'), en: t('anglais'), es: t('espagnol'), ar: t('arabe') }[l] || l);

// t('Texte {x}', { x }) : la traduction du texte français (lui-même en français, ou s'il manque au dictionnaire),
// les {noms} remplacés par leurs valeurs.
// Arabe : « 3 / 7 » s'afficherait « 7 / 3 » (entourée d'espaces, la barre est neutre et l'écriture de droite à gauche
// inverse l'ordre des deux nombres) ; collée aux chiffres, « 3/7 » garde son ordre.
const arFrac = (s) => s.replace(/(\d)\s+\/\s+(?=\d)/g, '$1/');
const fill = (s, vars) => {
  const out = vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  return LANG === 'ar' ? arFrac(out) : out;
};
// Les espaces autour d'un morceau de phrase (« · saison ») restent ceux du code : le dictionnaire ne connaît que le
// texte du milieu.
// ctx : contexte, quand un même mot français se traduit autrement selon l'endroit (t('Rose', undefined, 'couleur'))
export function t(fr, vars, ctx) {
  if (LANG === 'fr') return fill(fr, vars);
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(fr);
  const s = (ctx && DICT[`${ctx}|${m[2]}`]) ?? DICT[m[2]] ?? m[2];
  return m[1] + fill(typeof s === 'string' ? s : s.other ?? m[2], vars) + m[3];
}
// tn(n, 'un jeune', '{n} jeunes', vars) : accord selon le nombre. Le dictionnaire donne, pour la forme plurielle
// française, les formes de la langue (one, two, few, many, other ; zero en arabe), choisies par Intl.PluralRules.
// frPlural : le test d'accord écrit dans le code français (n > 1, n !== 1…), gardé tel quel en français.
const rules = {};
const EDGES = /^(\s*)([\s\S]*?)(\s*)$/; // les espaces autour d'un morceau de phrase restent ceux du code (comme t)
export function tn(n, one, other, vars = {}, frPlural = n >= 2) {
  const v = { n, ...vars };
  if (LANG === 'fr') return fill(frPlural ? other : one, v);
  const [, a, key, z] = EDGES.exec(other);
  const d = DICT[key];
  if (d && typeof d === 'object') {
    rules[LANG] ||= new Intl.PluralRules(numLocale());
    const cat = n === 0 && d.zero != null ? 'zero' : rules[LANG].select(n);
    return a + fill(d[cat] ?? d.other, v) + z;
  }
  // un nombre entier : singulier pour 1 seulement (« 0 matches ») ; sinon (0,7 saison, choix entre deux phrases) la
  // condition d'origine du code décide
  const many = Number.isInteger(n) ? n !== 1 : frPlural;
  if (many) return a + fill(typeof d === 'string' ? d : key, v) + z;
  const [, a1, key1, z1] = EDGES.exec(one);
  return a1 + fill(DICT[key1] ?? key1, v) + z1;
}
export const fmtNum = (n, opts) => (typeof n === 'number' ? n.toLocaleString(numLocale(), opts) : String(n));
// Montants hors du français : le symbole et l'abrégé de la langue (« €5,000 », « €1.25m », « 125 mil € », « 125 ألف € »).
// Le français garde ses écritures d'origine, dans le code (« 5 000 € », « 1,5 M€ »).
const eurFormats = {};
export function eur(n, { compact = false, digits = 2 } = {}) {
  const k = `${compact}${digits}`;
  eurFormats[k] ||= new Intl.NumberFormat(numLocale(), compact
    ? { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: digits }
    : { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  return eurFormats[k].format(n);
}
// séparateur décimal de la langue (« 6,3 » en français et en espagnol, « 6.3 » en anglais et en arabe)
export const decSep = () => (1.5).toLocaleString(numLocale()).charAt(1);

// Texte riche (un bloc qui mêle texte, valeurs et balises) : tr('Ils verront <0/> et ramèneront <1>les plus
// prometteurs</1>.', [valeur, (c) => <b>{c}</b>]) rend la phrase traduite, en morceaux React : <k/> reçoit la valeur k
// telle quelle (texte, nombre ou élément), <k>…</k> passe son texte traduit à la fonction k. La traduction peut
// déplacer les morceaux, jamais en perdre.
export function tr(fr, slots = []) {
  const s = LANG === 'xx' ? fr : t(fr); // pseudo-langue : chaque morceau est marqué plus bas
  const out = [];
  const re = /<(\d+)\/>|<(\d+)>(.*?)<\/\2>/gs;
  let last = 0;
  let m;
  let key = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] != null) out.push(keyed(slots[+m[1]], key++));
    else { const w = slots[+m[2]]; const inner = LANG === 'xx' ? `⟦${m[3]}⟧` : m[3]; out.push(keyed(typeof w === 'function' ? w(inner) : inner, key++)); }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return LANG === 'xx' ? out.map((x) => (typeof x === 'string' && x.trim() ? `⟦${x}⟧` : x)) : out;
}
// élément React dans une liste : une clé, pour que React ne s'en plaigne pas
const keyed = (el, k) => (el && typeof el === 'object' && '$$typeof' in el && el.key == null ? { ...el, key: `tr${k}` } : el);

// Ordinal d'un rang : 1er, 2e (fr) ; 1st, 2nd, 3rd, 4th (en) ; 1.º (es) ; le nombre seul (ar). feminine : 1re, 1.ª.
export function ordSuffix(n, feminine = false) {
  if (LANG === 'en') { const m = n % 100; return m >= 11 && m <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; }
  if (LANG === 'es') return feminine ? '.ª' : '.º';
  if (LANG === 'ar') return '';
  return n === 1 ? (feminine ? 're' : 'er') : 'e';
}
export const ordinal = (n, feminine = false) => `${n}${ordSuffix(n, feminine)}`;
// Minute d'un but : « 34e » en français, « 34′ » ailleurs (l'usage des feuilles de match).
export const minuteLabel = (m) => (LANG === 'fr' ? `${m}e` : `${m}′`);

// Un nombre et son unité, accordés : plural(3, 'but', 'buts') → « 3 buts ». Les clés du dictionnaire sont « {n} but » et
// « {n} buts » (l'arabe y met ses formes : un, deux, quelques-uns, beaucoup). show : le nombre tel qu'affiché.
export const plural = (n, one, many = `${one}s`, show = n) => tn(n, `{n} ${one}`, `{n} ${many}`, { n: show }, n > 1);
