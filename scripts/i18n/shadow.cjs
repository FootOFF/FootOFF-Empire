// Chantier des langues : appels t() / tn() / tr() dont le nom est masqué par une variable locale du même nom
// (« .map((t) => … t('…') … ») : l'appel viserait la variable, pas la traduction. node scripts/i18n/shadow.cjs [--fix]
// --fix renomme la variable locale (t → row, tn, tr → …) dans sa portée.
const fs = require('fs');
const path = require('path');
const NM = path.resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;
const SRC = path.resolve(__dirname, '../../src');
const fix = process.argv.includes('--fix');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f)) files.push(p); } })(SRC);
let n = 0;
for (const f of files) {
  if (/[\\/]i18n[\\/]/.test(f)) continue;
  let code = fs.readFileSync(f, 'utf8');
  if (!/\b(t|tn|tr)\(/.test(code)) continue;
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const bad = new Map(); // binding locale fautive → { name, refs }
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== 'Identifier' || !['t', 'tn', 'tr'].includes(c.name)) return;
      const b = p.scope.getBinding(c.name);
      if (!b || b.kind === 'module') return; // l'import : bon
      n++;
      console.log(`${path.relative(SRC, f)}:${p.node.loc.start.line} « ${c.name} » masqué (${b.kind}, ligne ${b.identifier.loc.start.line})`);
      bad.set(b, c.name);
    },
  });
  if (fix && bad.size) {
    const edits = [];
    for (const [b, name] of bad) {
      const to = name === 't' ? 'row' : `${name}Local`;
      const ids = [b.identifier, ...b.referencePaths.map((r) => r.node), ...b.constantViolations.map((c) => c.node.left || c.node)].filter((x) => x && x.type === 'Identifier');
      // les appels de traduction de la portée ne sont pas des références à la variable : babel les lie à elle, on les écarte
      for (const id of ids) {
        const callee = b.referencePaths.find((r) => r.node === id)?.parentPath;
        if (callee && callee.isCallExpression() && callee.node.callee === id) continue;
        edits.push({ start: id.start, end: id.end, text: to });
      }
    }
    edits.sort((a, b) => b.start - a.start);
    const seen = new Set();
    for (const e of edits) { if (seen.has(e.start)) continue; seen.add(e.start); code = code.slice(0, e.start) + e.text + code.slice(e.end); }
    fs.writeFileSync(f, code);
  }
}
console.log(`${n} appels masqués`);
