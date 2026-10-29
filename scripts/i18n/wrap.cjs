// Chantier des langues (0.9.0) : enveloppe les textes français affichés par le jeu dans t() / tn() / tr()
// (src/i18n/index.js), sans rien changer au rendu en français. Les textes restent écrits en français dans le code ; ils
// deviennent les clés des dictionnaires (en, es, ar). node scripts/i18n/wrap.cjs fichier… [--dry]
// - texte JSX : {t('…')} ; un bloc qui mêle texte, balises et valeurs devient une seule phrase tr('… <0/> …', [ … ]) ;
// - attributs lisibles (title, aria-label, placeholder, alt, label…) et chaînes du code : t('…') ;
// - gabarits `… ${x} …` : t('… {x} …', { x }) ; un accord « n > 1 ? 'les …' : 'le …' » : tn(n, 'le …', 'les …', vars, n > 1).
// Les comparaisons (===, switch, includes, startsWith…) ne sont jamais touchées : la liste en est donnée pour relecture.
const fs = require('fs');
const NM = require('path').resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;

const TEXT_ATTRS = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label', 'eyebrow', 'cta', 'hint', 'confirmLabel', 'cancelLabel', 'text', 'sub', 'note', 'heading', 'caption', 'tooltip', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'summary', 'empty', 'emptyText', 'kicker', 'subtitle']);
const INLINE = new Set(['b', 'strong', 'em', 'i', 'span', 'small', 'u', 'mark', 'sup', 'sub', 'abbr', 'q', 's']);
const WRAPPERS = new Set(['t', 'tn', 'tr']);

const looksText = (s) => {
  const x = s.trim();
  if (x.length < 2) return false;
  if (/^[a-z0-9_.:/#@%+*=?&-]+$/.test(x)) return false;
  if (/^(#|rgba?\(|hsla?\(|var\(|url\(|\.\/|\.\.\/|https?:|@media|calc\(|translate|rotate|scale|matrix|cubic-bezier|linear-gradient|radial-gradient|polygon\(|inset\()/.test(x)) return false;
  if (/^-?[0-9.]+(px|%|em|rem|vh|vw|s|ms|deg|fr)?( -?[0-9.]+(px|%|em|rem|vh|vw|s|ms|deg|fr)?)*$/.test(x)) return false; // une valeur CSS
  if (/^[A-Z0-9_]+$/.test(x)) return false;
  if (/^[\w-]+(\s+[\w-]+)*$/.test(x) && !/[A-ZÀ-Ýà-ÿ]/.test(x) && !/\s/.test(x)) return false;
  if (/^[a-z-]+( [a-z-]+)+$/.test(x) && /(^| )(on|off|is-|has-|sq-|lv-|pm-|ts-|cm-|hud-|btn|glass|wide|ghost|flat|on|active|hl)( |$)/.test(x)) return false; // listes de classes
  return /[A-Za-zÀ-ÿ]{2,}/.test(x) && (/\s/.test(x) || /[À-ÿ’]/.test(x) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(x));
};
// un mot affiché tel quel (texte JSX, ou valeur posée directement dans le JSX via ?:, &&, ||) : n'importe quel mot
const looksWord = (s) => /\p{L}{2,}/u.test(s.trim()) && !/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s.trim()) && !/^(https?:|#|\.)/.test(s.trim());
function displayed(p) {
  let c = p;
  while (c.parentPath && ['ConditionalExpression', 'LogicalExpression', 'ParenthesizedExpression'].includes(c.parent.type)) {
    if (c.parent.type === 'ConditionalExpression' && c.parent.test === c.node) return false;
    c = c.parentPath;
  }
  if (c.parent.type === 'JSXExpressionContainer') return c.parentPath.parent.type !== 'JSXAttribute' || TEXT_ATTRS.has(c.parentPath.parent.name.name);
  // valeur d'un emplacement de tr() (tableau) ou d'une variable de t() / tn() : affichée
  if (c.parent.type === 'ArrayExpression' && c.parentPath.parent.type === 'CallExpression' && c.parentPath.parent.callee.name === 'tr') return true;
  if (c.parent.type === 'ObjectProperty' && c.parent.value === c.node && c.parentPath.parent.type === 'ObjectExpression' && c.parentPath.parentPath.parent.type === 'CallExpression' && ['t', 'tn'].includes(c.parentPath.parentPath.parent.callee.name)) return true;
  return false;
}
// élément d'un composant du jeu (<SectionHead aside="…">) : ses propriétés textuelles s'affichent
const NOT_TEXT_PROPS = new Set(['className', 'id', 'key', 'href', 'src', 'type', 'role', 'name', 'kind', 'tone', 'size', 'variant', 'icon', 'mode', 'tab', 'panel', 'style', 'section', 'view', 'align', 'side', 'pos', 'comp', 'dir', 'lang', 'value', 'defaultValue', 'htmlFor', 'target', 'rel']);
const isComponent = (el) => el && el.type === 'JSXOpeningElement' && el.name.type === 'JSXIdentifier' && /^[A-Z]/.test(el.name.name) && !['Fragment'].includes(el.name.name);
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

// nom d'une valeur dans un gabarit, d'après son expression
function varName(code, node, used) {
  let n = 'v';
  if (node.type === 'Identifier') n = node.name;
  else if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') n = node.property.name;
  else if (node.type === 'CallExpression') {
    const c = node.callee;
    n = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property.type === 'Identifier' ? c.property.name : 'v';
    if (/^(fmtMoney|fmtNum|fmtEuros|fmtPrice|eur|euros|money|Math)$/.test(n) && node.arguments[0]) n = varName(code, node.arguments[0], new Set()) || n;
  }
  n = n.replace(/[^\w]/g, '') || 'v';
  let k = n;
  for (let i = 2; used.has(k); i++) k = `${n}${i}`;
  used.add(k);
  return k;
}

// gabarit → [texte avec {noms}, liste [nom, code]]
function template(code, node, used = new Set()) {
  let s = '';
  const vars = [];
  node.quasis.forEach((qq, i) => {
    s += qq.value.cooked.replace(/\{/g, '｛').replace(/\}/g, '｝');
    if (i < node.expressions.length) {
      const e = node.expressions[i];
      const src = code.slice(e.start, e.end);
      const same = vars.find(([, c]) => c === src);
      const name = same ? same[0] : varName(code, e, used);
      if (!same) vars.push([name, src]);
      s += `{${name}}`;
    }
  });
  return [s, vars];
}
const varsObj = (vars) => (vars.length ? `{ ${vars.map(([n, c]) => (n === c ? n : `${n}: ${c}`)).join(', ')} }` : null);

// accord en nombre : test « n > 1 », « n >= 2 », « n === 1 », « n !== 1 »
function pluralTest(test) {
  if (test.type !== 'BinaryExpression') return null;
  const lit = (x) => x.type === 'NumericLiteral' ? x.value : null;
  if (lit(test.right) === 1 && (test.operator === '>' || test.operator === '!==' || test.operator === '!=')) return { count: test.left, plural: 'cons' };
  if (lit(test.right) === 2 && test.operator === '>=') return { count: test.left, plural: 'cons' };
  if (lit(test.right) === 1 && (test.operator === '===' || test.operator === '==')) return { count: test.left, plural: 'alt' };
  if (lit(test.right) === 1 && test.operator === '<=') return { count: test.left, plural: 'alt' };
  if (lit(test.right) === 2 && test.operator === '<') return { count: test.left, plural: 'alt' };
  return null;
}
const isTextLit = (n) => (n.type === 'StringLiteral' && (looksText(n.value) || n.value === '' || /^[a-zà-ÿ’]{0,3}$/i.test(n.value))) || (n.type === 'TemplateLiteral' && looksText(n.quasis.map((x) => x.value.cooked).join(' ')));
const litText = (code, n, used) => (n.type === 'StringLiteral' ? [n.value.replace(/\{/g, '｛').replace(/\}/g, '｝'), []] : template(code, n, used));

function processFile(file, dry) {
  let code = fs.readFileSync(file, 'utf8');
  const review = [];
  let changes = 0;
  for (let pass = 0; pass < 8; pass++) {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
    const cands = [];
    // déjà traduit : le texte d'un appel t / tn / tr (son 1er argument ; les 2e et 3e de tn), pas ses valeurs ni ses
    // emplacements, qui portent souvent eux-mêmes du texte à afficher
    const inWrapper = (p) => {
      let c = p;
      while (c.parentPath) {
        const pp = c.parentPath;
        if (pp.isCallExpression() && pp.node.callee.type === 'Identifier' && WRAPPERS.has(pp.node.callee.name)) {
          const i = pp.node.arguments.indexOf(c.node);
          const text = pp.node.callee.name === 'tn' ? i === 1 || i === 2 : i === 0;
          if (text) return true;
          if (i >= 0) return false; // une valeur ou un emplacement : à traiter
        }
        c = pp;
      }
      return false;
    };
    const skipCtx = (p) => {
      const par = p.parent;
      if (par.type === 'ImportDeclaration' || par.type.startsWith('Export') && par.source === p.node) return 'import';
      if (par.type === 'ObjectProperty' && par.key === p.node) return 'key';
      if (par.type === 'ObjectMethod' || par.type === 'ClassMethod') return 'key';
      if (par.type === 'MemberExpression' && par.property === p.node) return 'key';
      if (par.type === 'BinaryExpression' && ['===', '!==', '==', '!=', 'in', 'instanceof'].includes(par.operator)) return 'compare';
      if (par.type === 'SwitchCase') return 'compare';
      if (par.type === 'CallExpression' && par.callee.type === 'MemberExpression' && par.callee.property.type === 'Identifier' && ['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'split', 'replace', 'replaceAll', 'match', 'test', 'getItem', 'setItem', 'removeItem', 'querySelector', 'querySelectorAll', 'closest', 'matchMedia', 'getElementById', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'get', 'has', 'set', 'delete', 'add', 'createElement', 'setAttribute', 'getAttribute', 'toLocaleString', 'toLocaleUpperCase', 'toLocaleLowerCase', 'localeCompare', 'padStart', 'padEnd', 'join', 'log', 'warn', 'error', 'info'].includes(par.callee.property.name) && par.arguments.includes(p.node)) return 'compare';
      if (par.type === 'CallExpression' && par.callee.type === 'Identifier' && ['require', 'Intl', 'Error', 'RegExp', 'Symbol', 'uiSound', 'haptic', 'useMedia', 'track', 'URLSearchParams', 'fetch'].includes(par.callee.name)) return 'call';
      if (par.type === 'NewExpression' && par.callee.type === 'Identifier' && ['RegExp', 'Intl', 'URL', 'Set', 'Map', 'Date', 'Error', 'Event', 'CustomEvent', 'MouseEvent'].includes(par.callee.name)) return 'call';
      if (par.type === 'JSXAttribute' && !TEXT_ATTRS.has(par.name.name) && !(isComponent(p.parentPath.parent) && !NOT_TEXT_PROPS.has(par.name.name) && looksText(p.node.value || ''))) return 'attr';
      if (par.type === 'JSXExpressionContainer' && p.parentPath.parent.type === 'JSXAttribute' && !TEXT_ATTRS.has(p.parentPath.parent.name.name) && !(isComponent(p.parentPath.parentPath.parent) && !NOT_TEXT_PROPS.has(p.parentPath.parent.name.name))) return 'attr';
      if (par.type === 'TaggedTemplateExpression') return 'tag';
      if (par.type === 'AssignmentExpression' && par.left.type === 'MemberExpression' && /^(className|id|style|cssText|innerHTML|href|src)$/.test(par.left.property?.name || '')) return 'attr';
      return null;
    };
    traverse(ast, {
      JSXElement(p) {
        // une phrase mêlant texte et balises : un seul tr()
        const kids = p.node.children;
        const texty = kids.some((k) => k.type === 'JSXText' && (looksText(k.value.replace(/\s+/g, ' ')) || looksWord(k.value)));
        const mixed = kids.some((k) => k.type !== 'JSXText');
        if (!texty || !mixed || inWrapper(p)) return;
        const name = p.node.openingElement.name;
        if (name.type === 'JSXIdentifier' && ['style', 'script', 'svg', 'text', 'textPath', 'title', 'option'].includes(name.name)) return;
        // pas si un enfant porte lui-même une phrase mixte (on traite d'abord la plus intérieure)
        const inner = kids.some((k) => k.type === 'JSXElement' && k.children.some((c) => c.type === 'JSXText' && looksText(c.value)) && k.children.some((c) => c.type !== 'JSXText'));
        if (inner) return;
        // pas d'enfant liste (map) : une phrase ne contient pas une liste d'éléments
        if (kids.some((k) => k.type === 'JSXExpressionContainer' && /\.map\(/.test(code.slice(k.start, k.end)))) return;
        cands.push({ kind: 'rich', node: p.node });
      },
      JSXText(p) {
        const v = p.node.value;
        if (!looksText(v.replace(/\s+/g, ' ')) && !looksWord(v)) return;
        if (p.parent.type === 'JSXElement' && p.parent.openingElement.name.type === 'JSXIdentifier' && ['kbd', 'style', 'script'].includes(p.parent.openingElement.name.name)) return;
        const par = p.parent;
        const sib = par.children || [];
        const mixed = sib.some((k) => k.type !== 'JSXText') && sib.some((k) => k.type === 'JSXText' && (looksText(k.value.replace(/\s+/g, ' ')) || looksWord(k.value)));
        if (mixed && par.type === 'JSXElement') {
          const name = par.openingElement.name;
          const inner = sib.some((k) => k.type === 'JSXElement' && k.children.some((c) => c.type === 'JSXText' && looksText(c.value)) && k.children.some((c) => c.type !== 'JSXText'));
          const hasMap = sib.some((k) => k.type === 'JSXExpressionContainer' && /\.map\(/.test(code.slice(k.start, k.end)));
          if (!(name.type === 'JSXIdentifier' && ['style', 'script', 'svg', 'text', 'textPath', 'title', 'option'].includes(name.name)) && !inner && !hasMap) return; // le bloc entier passe par tr()
        }
        cands.push({ kind: 'jsx', node: p.node });
      },
      StringLiteral(p) {
        if (inWrapper(p)) return;
        const why = skipCtx(p);
        const attrWord = p.parent.type === 'JSXAttribute' && TEXT_ATTRS.has(p.parent.name.name) && looksWord(p.node.value);
        if (!looksText(p.node.value) && !(displayed(p) && looksWord(p.node.value)) && !attrWord) return;
        if (why) { if (why === 'compare' || why === 'tag') review.push(`${why} ${p.node.loc.start.line}: ${p.node.value.slice(0, 60)}`); return; }
        if (p.parent.type === 'ConditionalExpression' && pluralTest(p.parent.test) && p.parent.test !== p.node && (isTextLit(p.parent.consequent) || displayed(p)) && (isTextLit(p.parent.alternate) || displayed(p))) return; // l'accord entier
        cands.push({ kind: p.parent.type === 'JSXAttribute' ? 'attr' : 'str', node: p.node, attr: p.parent.type === 'JSXAttribute' });
      },
      TemplateLiteral(p) {
        if (inWrapper(p)) return;
        const why = skipCtx(p);
        const flat = p.node.quasis.map((x) => x.value.cooked).join(' ');
        if (!looksText(flat) && !(displayed(p) && looksWord(flat))) return;
        if (why) { if (why === 'compare' || why === 'tag') review.push(`${why} ${p.node.loc.start.line}: ${flat.slice(0, 60)}`); return; }
        if (p.parent.type === 'ConditionalExpression' && pluralTest(p.parent.test) && p.parent.test !== p.node && isTextLit(p.parent.consequent) && isTextLit(p.parent.alternate)) return;
        // un gabarit dont une valeur contient encore un texte à traiter : plus tard (de l'intérieur vers l'extérieur)
        let pending = false;
        p.traverse({ StringLiteral(c) { if (c.node !== p.node && looksText(c.node.value) && !inWrapper(c) && !skipCtx(c)) pending = true; }, TemplateLiteral(c) { if (c.node !== p.node && looksText(c.node.quasis.map((x) => x.value.cooked).join(' ')) && !inWrapper(c) && !skipCtx(c)) pending = true; } });
        if (pending) return;
        cands.push({ kind: 'tpl', node: p.node });
      },
      ConditionalExpression(p) {
        if (inWrapper(p)) return;
        const pt = pluralTest(p.node.test);
        const lit = (n) => isTextLit(n) || (displayed(p) && (n.type === 'StringLiteral' || n.type === 'TemplateLiteral'));
        if (!pt || !lit(p.node.consequent) || !lit(p.node.alternate)) return;
        const brText = [p.node.consequent, p.node.alternate].map((x) => x.type === 'StringLiteral' ? x.value : x.quasis.map((y) => y.value.cooked).join(' ')).join(' ');
        if (!looksText(brText) && !(displayed(p) && looksWord(brText))) return;
        let pending = false;
        for (const br of [p.node.consequent, p.node.alternate]) if (br.type === 'TemplateLiteral') for (const e of br.expressions) if (/['`][^'`]*[A-Za-zÀ-ÿ]{3,} [A-Za-zÀ-ÿ]/.test(code.slice(e.start, e.end)) && !/\bt\(|tn\(/.test(code.slice(e.start, e.end))) pending = true;
        if (pending) return;
        cands.push({ kind: 'plural', node: p.node, pt });
      },
    });
    // une seule modification par zone : la plus intérieure d'abord (on recommence ensuite)
    cands.sort((a, b) => a.node.start - b.node.start || b.node.end - a.node.end);
    const edits = [];
    for (const c of cands) {
      if (edits.some((e) => c.node.start < e.end && c.node.end > e.start)) continue;
      if (cands.some((o) => o !== c && o.node.start >= c.node.start && o.node.end <= c.node.end && (o.node.start !== c.node.start || o.node.end !== c.node.end) && !(c.kind === 'plural' && (o.node === c.node.consequent || o.node === c.node.alternate)) && !(c.kind === 'rich'))) continue;
      const e = edit(code, c);
      if (e) edits.push(e);
    }
    if (!edits.length) break;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
    changes += edits.length;
  }
  if (changes) code = ensureImport(code, file);
  if (!dry && changes) fs.writeFileSync(file, code);
  return { changes, review };
}

function edit(code, c) {
  const n = c.node;
  if (c.kind === 'jsx') {
    // espaces comme React : lignes rognées, lignes vides retirées, jointes par une espace
    const lines = n.value.split(/\r?\n/);
    const kept = lines.map((l, i) => {
      let x = l.replace(/\t/g, ' ');
      if (i > 0) x = x.replace(/^ +/, '');
      if (i < lines.length - 1) x = x.replace(/ +$/, '');
      return x;
    }).filter((l) => l !== '');
    const clean = kept.join(' ');
    if (!looksText(clean) && !looksWord(clean)) return null;
    const lead = clean.match(/^ */)[0].length ? "{' '}" : '';
    const trail = clean.match(/ *$/)[0].length && clean.trim() ? "{' '}" : '';
    return { start: n.start, end: n.end, text: `${lead}{t(${q(clean.trim())})}${trail}` };
  }
  if (c.kind === 'str' || c.kind === 'attr') {
    const v = n.value.replace(/\{/g, '｛').replace(/\}/g, '｝');
    return { start: n.start, end: n.end, text: c.attr ? `{t(${q(v)})}` : `t(${q(v)})` };
  }
  if (c.kind === 'tpl') {
    const [s, vars] = template(code, n);
    const o = varsObj(vars);
    return { start: n.start, end: n.end, text: o ? `t(${q(s)}, ${o})` : `t(${q(s)})` };
  }
  if (c.kind === 'plural') {
    const used = new Set();
    const count = code.slice(c.pt.count.start, c.pt.count.end);
    const [a, va] = litText(code, n.consequent, used);
    const [b, vb] = litText(code, n.alternate, used);
    const [one, other] = c.pt.plural === 'cons' ? [b, a] : [a, b];
    const all = [...va, ...vb.filter(([x]) => !va.some(([y]) => y === x))];
    const o = varsObj(all) || '{}';
    const test = code.slice(n.test.start, n.test.end);
    return { start: n.start, end: n.end, text: `tn(${count}, ${q(one)}, ${q(other)}, ${o}, ${test})` };
  }
  if (c.kind === 'rich') {
    const kids = n.children;
    let s = '';
    const slots = [];
    for (const k of kids) {
      if (k.type === 'JSXText') {
        const lines = k.value.split(/\r?\n/);
        const kept = lines.map((l, i) => { let x = l.replace(/\t/g, ' '); if (i > 0) x = x.replace(/^ +/, ''); if (i < lines.length - 1) x = x.replace(/ +$/, ''); return x; }).filter((l) => l !== '');
        s += kept.join(' ').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/</g, '‹').replace(/>/g, '›');
        continue;
      }
      if (k.type === 'JSXExpressionContainer') {
        if (k.expression.type === 'JSXEmptyExpression') continue;
        const src = code.slice(k.expression.start, k.expression.end);
        if (/^'\s*'$/.test(src)) { s += ' '; continue; } // {' '}
        slots.push(src);
        s += `<${slots.length - 1}/>`;
        continue;
      }
      if (k.type === 'JSXElement') {
        const tag = k.openingElement.name;
        const onlyText = k.children.length > 0 && k.children.every((c) => c.type === 'JSXText');
        if (tag.type === 'JSXIdentifier' && INLINE.has(tag.name) && onlyText && looksText(k.children.map((c) => c.value).join(' ').replace(/\s+/g, ' ') + ' x')) {
          const inner = k.children.map((c) => c.value).join('').replace(/\s+/g, ' ');
          const open = code.slice(k.openingElement.start, k.openingElement.end);
          const close = code.slice(k.closingElement.start, k.closingElement.end);
          slots.push(`(c) => ${open}{c}${close}`);
          s += `<${slots.length - 1}>${inner.replace(/</g, '‹').replace(/>/g, '›')}</${slots.length - 1}>`;
          continue;
        }
        slots.push(code.slice(k.start, k.end));
        s += `<${slots.length - 1}/>`;
        continue;
      }
      if (k.type === 'JSXFragment') { slots.push(code.slice(k.start, k.end)); s += `<${slots.length - 1}/>`; }
    }
    const clean = s.replace(/^ +/, (m) => (m ? ' ' : '')).replace(/ +$/, (m) => (m ? ' ' : ''));
    const lead = /^ /.test(clean) ? "{' '}" : '';
    const trail = / $/.test(clean) ? "{' '}" : '';
    const start = kids[0].start;
    const end = kids[kids.length - 1].end;
    return { start, end, text: `${lead}{tr(${q(clean.trim())}, [${slots.join(', ')}])}${trail}` };
  }
  return null;
}

function ensureImport(code, file) {
  const need = ['t', 'tn', 'tr'].filter((f) => new RegExp(`\\b${f}\\(`).test(code));
  const rel = require('path').relative(require('path').dirname(file), require('path').resolve(__dirname, '../../src/i18n/index.js')).replace(/\\/g, '/').replace(/\.js$/, '');
  const from = rel.startsWith('.') ? rel : `./${rel}`;
  const m = code.match(new RegExp(`import \\{([^}]*)\\} from '${from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';`));
  if (m) {
    const have = new Set(m[1].split(',').map((x) => x.trim()).filter(Boolean));
    need.forEach((f) => have.add(f));
    return code.replace(m[0], `import { ${[...have].sort().join(', ')} } from '${from}';`);
  }
  // après le dernier import en tête de fichier
  const lines = code.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) { if (/^import\b/.test(lines[i])) { last = i; while (!/;\s*$/.test(lines[last]) && last < lines.length - 1) last++; i = last; } else if (lines[i].trim() && !/^\/\//.test(lines[i]) && last >= 0) break; }
  lines.splice(last + 1, 0, `import { ${need.join(', ')} } from '${from}';`);
  return lines.join('\n');
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
let total = 0;
const allReview = [];
for (const f of args.filter((a) => !a.startsWith('--'))) {
  try {
    const { changes, review } = processFile(f, dry);
    total += changes;
    if (review.length) allReview.push(`## ${f}\n${review.join('\n')}`);
    console.log(`${String(changes).padStart(5)}  ${f}`);
  } catch (e) { console.log(`ERREUR ${f} : ${e.message}`); }
}
console.log(`${total} textes enveloppés`);
fs.writeFileSync(require('path').resolve(__dirname, 'review.txt'), allReview.join('\n\n'));
