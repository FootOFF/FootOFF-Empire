// Chantier des langues : t('… an{v} …', { v: n > 1 ? 's' : '' }) → tn(n, '… an …', '… ans …', vars, n > 1).
// Un suffixe d'accord passé en valeur ne se traduit pas ; la phrase entière au singulier et au pluriel, si.
// node scripts/i18n/plural.cjs fichier…
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

let total = 0;
for (const file of process.argv.slice(2)) {
  let code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, {
    CallExpression(p) {
      const n = p.node;
      if (n.callee.type !== 'Identifier' || n.callee.name !== 't' || n.arguments.length !== 2) return;
      const [s, o] = n.arguments;
      if (s.type !== 'StringLiteral' || o.type !== 'ObjectExpression') return;
      const sfx = o.properties.filter((pr) => pr.type === 'ObjectProperty' && pr.value.type === 'ConditionalExpression' && pluralTest(pr.value.test) && short(pr.value.consequent) && short(pr.value.alternate));
      if (!sfx.length) return;
      const counts = new Set(sfx.map((pr) => code.slice(pr.value.test.left.start, pr.value.test.left.end)));
      if (counts.size !== 1) { console.log(`À LA MAIN ${file}:${n.loc.start.line} (plusieurs nombres)`); return; }
      let one = s.value;
      let other = s.value;
      for (const pr of sfx) {
        const key = pr.key.type === 'Identifier' ? pr.key.name : pr.key.value;
        const pt = pluralTest(pr.value.test);
        const [pl, sg] = pt.plural === 'cons' ? [pr.value.consequent.value, pr.value.alternate.value] : [pr.value.alternate.value, pr.value.consequent.value];
        one = one.split(`{${key}}`).join(sg);
        other = other.split(`{${key}}`).join(pl);
      }
      const test = sfx[0].value.test;
      const rest = o.properties.filter((pr) => !sfx.includes(pr)).map((pr) => code.slice(pr.start, pr.end));
      const count = code.slice(test.left.start, test.left.end);
      const vars = rest.length ? `{ ${rest.join(', ')} }` : '{}';
      edits.push({ start: n.start, end: n.end, text: `tn(${count}, ${q(one)}, ${q(other)}, ${vars}, ${code.slice(test.start, test.end)})` });
    },
  });
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  if (edits.length) {
    if (!/\btn\b[^(]*\} from '[^']*i18n/.test(code)) code = code.replace(/import \{([^}]*)\} from '([^']*i18n(?:\/index)?)';/, (m, names, from) => `import { ${[...new Set([...names.split(',').map((x) => x.trim()).filter(Boolean), 'tn'])].sort().join(', ')} } from '${from}';`);
    fs.writeFileSync(file, code);
    total += edits.length;
    console.log(`${String(edits.length).padStart(4)}  ${file}`);
  }
}
console.log(`${total} accords convertis`);
