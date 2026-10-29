// Écriture de droite à gauche (arabe) : pour chaque règle qui place ou oriente quelque chose à gauche ou à droite, une
// version inversée, en paire avec elle (voir plus bas : même place, même priorité),
// l'inverse : left ↔ right, marges et retraits, alignements, bords et coins, décalages (translateX, ombres), dégradés
// horizontaux, découpes en polygone (clip-path), positions de fond. Les animations qui glissent sur le côté ont leur
// version inversée (« nom-rtl »). Le texte, les rangées flex et les grilles s'inversent seuls avec dir="rtl".
// Branchée dans vite.config.js (css.postcss). Exceptions :
// - « /* rtl:ignore */ » juste avant une règle : elle reste telle quelle (terrains de football, où un arrière gauche reste
//   à gauche ; éléments placés par des coordonnées calculées en JavaScript, mesurées depuis la gauche) ;
// - le centre ne bouge pas : left / right à 50 % et les décalages de ±50 % (centrage) restent tels quels.

const SWAP = {
  left: 'right', right: 'left',
  'margin-left': 'margin-right', 'margin-right': 'margin-left',
  'padding-left': 'padding-right', 'padding-right': 'padding-left',
  'border-left': 'border-right', 'border-right': 'border-left',
  'border-left-width': 'border-right-width', 'border-right-width': 'border-left-width',
  'border-left-color': 'border-right-color', 'border-right-color': 'border-left-color',
  'border-left-style': 'border-right-style', 'border-right-style': 'border-left-style',
  'border-top-left-radius': 'border-top-right-radius', 'border-top-right-radius': 'border-top-left-radius',
  'border-bottom-left-radius': 'border-bottom-right-radius', 'border-bottom-right-radius': 'border-bottom-left-radius',
  'scroll-margin-left': 'scroll-margin-right', 'scroll-margin-right': 'scroll-margin-left',
};

// découpe d'une liste de valeurs au premier niveau (hors parenthèses)
function split(v, sep = ' ') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of v) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const neg = (x) => {
  x = x.trim();
  if (/^0(px|%|em|rem)?$/.test(x)) return x;
  if (/^-/.test(x)) return x.slice(1);
  if (/^[\d.]/.test(x)) return `-${x}`;
  return `calc(-1 * ${x})`;
};
// x d'un point de polygone, miroir : 100% - x
const mirrorX = (x) => {
  x = x.trim();
  if (x === '0' || x === '0%' || x === '0px') return '100%';
  if (x === '100%') return '0';
  let m = x.match(/^([\d.]+)%$/);
  if (m) return `${+(100 - +m[1]).toFixed(4)}%`;
  m = x.match(/^calc\(100% - (.+)\)$/);
  if (m) return m[1].trim().startsWith('(') || /\s[+-]\s/.test(m[1]) ? `calc(${m[1]})` : m[1];
  return `calc(100% - ${x})`;
};

const half = (x) => /^-?50%$/.test(x.trim());

function flipValue(prop, v) {
  if (/!important/.test(v)) { const r = flipValue(prop, v.replace(/\s*!important/, '')); return r == null ? null : `${r} !important`; }
  if (prop === 'text-align' || prop === 'float' || prop === 'clear') return v === 'left' ? 'right' : v === 'right' ? 'left' : null;
  if (prop === 'margin' || prop === 'padding' || prop === 'inset' || prop === 'border-width' || prop === 'border-color' || prop === 'border-style' || prop === 'scroll-padding') {
    const p = split(v);
    return p.length === 4 && p[1] !== p[3] ? [p[0], p[3], p[2], p[1]].join(' ') : null;
  }
  if (prop === 'border-radius') {
    if (v.includes('/')) return null;
    const p = split(v);
    if (p.length === 4) return [p[1], p[0], p[3], p[2]].join(' ');
    if (p.length === 3) return [p[1], p[0], p[1], p[2]].join(' ');
    if (p.length === 2) return [p[1], p[0]].join(' ');
    return null;
  }
  let out = v;
  let changed = false;
  const rep = (re, f) => { const n = out.replace(re, f); if (n !== out) { changed = true; out = n; } };
  if (/^(transform|translate|rotate)$/.test(prop) || /translate|rotate|skew/.test(v)) {
    rep(/translateX\(([^()]+|[^()]*\([^()]*\)[^()]*)\)/g, (m, a) => (half(a) ? m : `translateX(${neg(a)})`));
    rep(/translate3d\(([^,]+),/g, (m, a) => (half(a) ? m : `translate3d(${neg(a)},`));
    rep(/translate\(([^,()]+|[^,()]*\([^()]*\)[^,()]*),/g, (m, a) => (half(a) ? m : `translate(${neg(a)},`));
    rep(/rotate\((-?[\d.]+)(deg|turn|rad)\)/g, (m, a, u) => `rotate(${-a}${u})`);
    rep(/skewX\((-?[\d.]+)(deg)\)/g, (m, a, u) => `skewX(${-a}${u})`);
    rep(/skew\((-?[\d.]+)(deg)/g, (m, a, u) => `skew(${-a}${u}`);
  }
  if (prop === 'translate') { const p = split(out); if (p.length >= 1 && !half(p[0])) { p[0] = neg(p[0]); out = p.join(' '); changed = true; } }
  if (prop === 'box-shadow' || prop === 'text-shadow') {
    const parts = split(out, ',').map((sh) => {
      const t = split(sh);
      const i = t.findIndex((x) => /^-?[\d.]+(px|em|rem)?$|^calc\(|^var\(/.test(x) && x !== 'inset');
      if (i >= 0 && !/^0(px)?$/.test(t[i])) { t[i] = neg(t[i]); changed = true; }
      return t.join(' ');
    });
    out = parts.join(', ');
  }
  if (/gradient\(/.test(out)) {
    rep(/(linear-gradient\()\s*(-?[\d.]+)deg/g, (m, f, a) => `${f}${+((360 - a) % 360).toFixed(3)}deg`);
    rep(/(linear-gradient\()\s*to (left|right)/g, (m, f, d) => `${f}to ${d === 'left' ? 'right' : 'left'}`);
    rep(/(radial-gradient\([^,]*?\bat )(-?[\d.]+)%/g, (m, f, x) => `${f}${+(100 - x).toFixed(3)}%`);
  }
  if (/polygon\(/.test(out)) { // chaque polygon( … ), parenthèses imbriquées comprises (calc, var)
    let res = '';
    let i = 0;
    for (let at = out.indexOf('polygon(', i); at >= 0; at = out.indexOf('polygon(', i)) {
      let depth = 0;
      let end = at + 7;
      for (; end < out.length; end++) {
        if (out[end] === '(') depth++;
        else if (out[end] === ')' && --depth === 0) break;
      }
      const body = out.slice(at + 8, end);
      res += `${out.slice(i, at)}polygon(${split(body, ',').map((pt) => { const xy = split(pt); return xy.length === 2 ? `${mirrorX(xy[0])} ${xy[1]}` : pt; }).join(', ')})`;
      i = end + 1;
    }
    res += out.slice(i);
    if (res !== out) { changed = true; out = res; }
  }
  if (prop === 'background-position' || prop === 'object-position' || prop === 'transform-origin' || prop === 'background' || prop === 'mask-position' || prop === '-webkit-mask-position') {
    rep(/\b(left|right)\b(?= (top|bottom|center|[\d.]+%)| *$| *\/| *,)/g, (m, d) => (d === 'left' ? 'right' : 'left'));
    if (prop === 'transform-origin' || prop === 'background-position' || prop === 'object-position') rep(/^([\d.]+)%/, (m, x) => `${+(100 - x).toFixed(3)}%`);
  }
  return changed ? out : null;
}

// Chaque règle orientée devient une paire, à la même place et à la même priorité (:where ne compte pas) : la règle telle
// quelle pour l'écriture de gauche à droite, sa version inversée pour la droite à gauche. En arabe, aucune déclaration
// d'origine ne reste en vigueur : la cascade est exactement celle du français, en miroir (un réglage du téléphone écrit
// plus loin l'emporte toujours, sans valeur à remettre à zéro). En français, les règles s'appliquent comme avant
// (:where est connu de tous les navigateurs qui font tourner le jeu, qui demande déjà .at() et :has()).
const DIR = '[dir="rtl"]';
const scope = (sel, rtl) => split(sel, ',').map((s) => {
  if (/^(html|:root)\b/.test(s)) return s.replace(/^(html|:root)/, rtl ? '$1:where([dir="rtl"])' : '$1:where(:not([dir="rtl"]))');
  return `${rtl ? ':where(html[dir="rtl"])' : ':where(html:not([dir="rtl"]))'} ${s}`;
}).join(', ');

module.exports = () => ({
  postcssPlugin: 'footoff-rtl',
  Once(root) {
    // animations qui glissent : une version inversée « -rtl »
    const flipped = new Set();
    root.walkAtRules(/keyframes$/, (at) => {
      if (at.params.endsWith('-rtl')) return;
      let any = false;
      const copy = at.clone({ params: `${at.params}-rtl` });
      copy.walkDecls((d) => { const f = flipValue(d.prop, d.value); if (f != null) { d.value = f; any = true; } });
      if (any) { at.after(copy); flipped.add(at.params); }
    });
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      if (rule.selector.includes(DIR)) return; // déjà écrite pour une écriture (ou paire déjà faite)
      const before = rule.prev();
      if (before?.type === 'comment' && before.text.trim() === 'rtl:ignore') return;
      const props = new Set();
      rule.each((d) => { if (d.type === 'decl') props.add(d.prop); });
      const mirror = rule.clone();
      let any = false;
      mirror.each((d) => {
        if (d.type !== 'decl') return;
        if (d.prop.startsWith('--')) { // variables : découpes et dégradés seulement
          const f = /polygon\(|gradient\(/.test(d.value) ? flipValue('clip-path', d.value) : null;
          if (f != null) { d.value = f; any = true; }
          return;
        }
        if ((d.prop === 'left' || d.prop === 'right') && half(d.value) && (props.has('left') !== props.has('right'))) return; // centré
        if (SWAP[d.prop]) { d.prop = SWAP[d.prop]; any = true; return; }
        if ((d.prop === 'animation' || d.prop === 'animation-name') && flipped.size) {
          const v = d.value.replace(/[\w-]+/g, (w) => (flipped.has(w) ? `${w}-rtl` : w));
          if (v !== d.value) { d.value = v; any = true; }
          return;
        }
        const f = flipValue(d.prop, d.value);
        if (f != null) { d.value = f; any = true; }
      });
      if (!any) return;
      mirror.selector = scope(rule.selector, true);
      rule.selector = scope(rule.selector, false);
      rule.after(mirror);
    });
  },
});
module.exports.postcss = true;
module.exports.flipValue = flipValue;
