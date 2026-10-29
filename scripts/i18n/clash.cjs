// Chantier des langues : textes traduits (t('…')) qui apparaissent aussi bruts ailleurs dans le code (comparaison,
// valeur de donnée, clé) : dans une autre langue, les deux ne seraient plus égaux. node scripts/i18n/clash.cjs
const fs = require('fs');
const path = require('path');
const NM = path.resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;
const SRC = path.resolve(__dirname, '../../src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f)) files.push(p); } })(SRC);
const wrapped = new Map();
const raw = new Map();
for (const f of files) {
  if (/[\\/]i18n[\\/]/.test(f)) continue;
  const code = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] }); } catch { continue; }
  const rel = path.relative(SRC, f).replace(/\\/g, '/');
  traverse(ast, {
    StringLiteral(p) {
      const v = p.node.value;
      if (v.length < 2) return;
      const inT = p.parent.type === 'CallExpression' && p.parent.callee.type === 'Identifier' && ['t', 'tn', 'tr'].includes(p.parent.callee.name);
      const at = `${rel}:${p.node.loc.start.line}`;
      if (inT) { if (!wrapped.has(v)) wrapped.set(v, []); wrapped.get(v).push(at); return; }
      if (p.parent.type === 'ImportDeclaration') return;
      const ctx = p.parent.type === 'BinaryExpression' ? 'compare' : p.parent.type === 'SwitchCase' ? 'case' : p.parent.type === 'ObjectProperty' && p.parent.key === p.node ? 'key' : p.parent.type === 'CallExpression' && p.parent.callee.type === 'MemberExpression' ? `call:${p.parent.callee.property.name}` : 'value';
      if (!raw.has(v)) raw.set(v, []);
      raw.get(v).push(`${at} (${ctx})`);
    },
  });
}
const out = [];
for (const [v, places] of wrapped) if (raw.has(v)) out.push(`« ${v} »\n   traduit : ${places.slice(0, 4).join(', ')}\n   brut    : ${raw.get(v).slice(0, 6).join(', ')}`);
console.log(out.join('\n'));
console.log(`${out.length} textes à la fois traduits et bruts`);
