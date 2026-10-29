// Chantier des langues : `${n} match${n > 1 ? 's' : ''}` → tn(n, '{n} match', '{n} matchs', { n }, n > 1) : un gabarit
// dont un morceau est un suffixe d'accord devient l'accord entier (phrase au singulier, phrase au pluriel).
// node scripts/i18n/unitplural.cjs fichier…
const fs = require('fs');
const path = require('path');
const NM = path.resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function pluralTest(test) {
  if (test.type !== 'BinaryExpression') return null;
  const lit = (x) => (x.type === 'NumericLiteral' ? x.value : null);
  if (lit(test.right) === 1 && ['>', '!==', '!='].includes(test.operator)) return { count: test.left, plural: 'cons' };
  if (lit(test.right) === 2 && test.operator === '>=') return { count: test.left, plural: 'cons' };
  if (lit(test.right) === 1 && ['===', '=='].includes(test.operator)) return { count: test.left, plural: 'alt' };
  return null;
}
const short = (n) => n.type === 'StringLiteral' && n.value.length <= 4 && /^[a-zà-ÿ’ ]*$/i.test(n.value);
function name(code, node, used) {
  let n = node.type === 'Identifier' ? node.name : node.type === 'MemberExpression' && !node.computed ? node.property.name : node.type === 'CallExpression' && node.callee.type === 'Identifier' ? node.callee.name : 'v';
  n = n.replace(/[^\w]/g, '') || 'v';
  let k = n;
  for (let i = 2; used.has(k); i++) k = `${n}${i}`;
  used.add(k);
  return k;
}
let total = 0;
for (const file of process.argv.slice(2)) {
  let code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, {
    TemplateLiteral(p) {
      const n = p.node;
      // déjà traduit seulement si c'est le texte d'un appel t / tn / tr (pas une de ses valeurs ou un emplacement)
      for (let c = p; c.parentPath; c = c.parentPath) {
        const pp = c.parentPath;
        if (pp.isCallExpression() && pp.node.callee.type === 'Identifier' && ['t', 'tn', 'tr'].includes(pp.node.callee.name)) {
          const i = pp.node.arguments.indexOf(c.node);
          if (pp.node.callee.name === 'tn' ? i === 1 || i === 2 : i === 0) return;
          if (i >= 0) break;
        }
      }
      const sfx = n.expressions.filter((e) => e.type === 'ConditionalExpression' && pluralTest(e.test) && short(e.consequent) && short(e.alternate));
      if (sfx.length !== 1) return;
      if (!/[a-zà-ÿ]{2,}/i.test(n.quasis.map((x) => x.value.cooked).join(' '))) return;
      if (n.expressions.some((e) => e !== sfx[0] && e.type === 'TemplateLiteral')) return; // gabarit imbriqué : à la main
      const c = sfx[0];
      const pt = pluralTest(c.test);
      const countSrc = code.slice(pt.count.start, pt.count.end);
      const used = new Set();
      const vars = [];
      let one = '';
      let other = '';
      const [pl, sg] = pt.plural === 'cons' ? [c.consequent.value, c.alternate.value] : [c.alternate.value, c.consequent.value];
      n.quasis.forEach((qq, i) => {
        one += qq.value.cooked;
        other += qq.value.cooked;
        if (i < n.expressions.length) {
          const e = n.expressions[i];
          if (e === c) { one += sg; other += pl; return; }
          const src = code.slice(e.start, e.end);
          let v = vars.find(([, s]) => s === src)?.[0];
          if (!v) { v = src === countSrc ? 'n' : name(code, e, used); if (v === 'n') used.add('n'); vars.push([v, src]); }
          one += `{${v}}`;
          other += `{${v}}`;
        }
      });
      const obj = vars.filter(([v]) => v !== 'n' || true).map(([v, s]) => (v === s ? v : `${v}: ${s}`)).join(', ');
      edits.push({ start: n.start, end: n.end, text: `tn(${countSrc}, ${q(one)}, ${q(other)}, { ${obj} }, ${pt.plural === 'cons' ? code.slice(c.test.start, c.test.end) : `!(${code.slice(c.test.start, c.test.end)})`})` });
    },
  });
  // la plus intérieure d'abord : pas deux modifications qui se chevauchent dans une passe
  edits.sort((a, b) => a.start - b.start);
  const keep = [];
  for (const e of edits) if (!keep.some((k) => e.start < k.end && e.end > k.start)) keep.push(e);
  keep.sort((a, b) => b.start - a.start);
  for (const e of keep) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  if (keep.length) {
    if (!/import \{[^}]*\btn\b[^}]*\} from '[^']*i18n/.test(code)) {
      const m = code.match(/import \{([^}]*)\} from '((?:\.\.\/|\.\/)+i18n(?:\/index)?)';/);
      if (m) code = code.replace(m[0], `import { ${[...new Set([...m[1].split(',').map((x) => x.trim()).filter(Boolean), 'tn'])].sort().join(', ')} } from '${m[2]}';`);
      else {
        const rel = path.relative(path.dirname(file), path.resolve(__dirname, '../../src/i18n/index')).replace(/\\/g, '/');
        code = `import { tn } from '${rel.startsWith('.') ? rel : `./${rel}`}';\n${code}`;
      }
    }
    fs.writeFileSync(file, code);
    total += keep.length;
    console.log(`${keep.length}  ${file}`);
  }
}
console.log(`${total} unités accordées`);
