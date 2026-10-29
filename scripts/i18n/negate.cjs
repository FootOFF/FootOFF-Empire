// Chantier des langues : tn(n, un, plusieurs, vars, test) prend en 5e argument « c'est le pluriel » ; un test écrit au
// singulier (n === 1, n <= 1, n < 2) y devient sa négation. node scripts/i18n/negate.cjs fichier…
const fs = require('fs');
const path = require('path');
const NM = path.resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;
let total = 0;
for (const file of process.argv.slice(2)) {
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('tn(')) continue;
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, {
    CallExpression(p) {
      const n = p.node;
      if (n.callee.type !== 'Identifier' || n.callee.name !== 'tn' || n.arguments.length < 5) return;
      const x = n.arguments[4];
      if (x.type !== 'BinaryExpression' || x.right.type !== 'NumericLiteral') return;
      const v = x.right.value;
      const single = (['===', '=='].includes(x.operator) && v === 1) || (x.operator === '<=' && v === 1) || (x.operator === '<' && v === 2);
      if (single) edits.push({ start: x.start, end: x.end, text: `!(${code.slice(x.start, x.end)})` });
    },
  });
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  if (edits.length) { fs.writeFileSync(file, code); total += edits.length; console.log(`${edits.length}  ${file}`); }
}
console.log(`${total} tests inversés`);
