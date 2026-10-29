// Chantier des langues : relève toutes les clés à traduire (le français est la clé, src/i18n) dans les sources.
// t('…') et tr('…') : leur 1er argument ; tn(n, '…', '…') : les deux formes ; plural(n, 'mot', 'mots') : '{n} mot' et
// '{n} mots'. Un appel dont le texte n'est pas écrit en clair (t(variable)) est signalé à part, pour être vu à la main.
// node scripts/i18n/extract.cjs [sortie.json]  → { keys: [{ k, kind, where }], dynamic: [where] }
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.join(__dirname, '../..');
const files = execSync('git ls-files src', { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((f) => /\.(js|jsx)$/.test(f) && !/^src\/(i18n\/|sw\.js)|game\/names(-\w+)?\.js$/.test(f));

const keys = new Map();
const dynamic = [];
const add = (k, kind, where) => {
  if (!k.trim()) return;
  const key = k.trim();
  const e = keys.get(key) || { k: key, kind, where: [] };
  if (e.where.length < 4) e.where.push(where);
  if (kind !== 't' && e.kind === 't') e.kind = kind;
  keys.set(key, e);
};
const lit = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null);
// texte(s) possibles d'un argument : un littéral, ou les deux branches d'une condition
const both = (x, y) => { const l = [...(lits(x) || []), ...(lits(y) || [])]; return l.length ? l : null; };
const lits = (n) => (n?.type === 'ConditionalExpression' ? both(n.consequent, n.alternate)
  : n?.type === 'LogicalExpression' ? both(n.left, n.right) : lit(n) != null ? [lit(n)] : null);

for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  let ast;
  try { ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] }); } catch (e) { console.error(f, e.message); continue; }
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      const name = c.type === 'Identifier' ? c.name : null;
      if (!['t', 'tn', 'tr', 'plural', 'pluralRaw', 'agree'].includes(name)) return;
      const where = `${f.replace(/^src\//, '')}:${p.node.loc.start.line}`;
      const a = p.node.arguments;
      if (name === 'agree') { // agree(club, 'accepte', 'acceptent') : les deux formes, traduites par agree (mercato.jsx)
        for (const x of a.slice(1, 3)) { const v = lits(x); if (v) v.forEach((y) => add(y, 't', where)); else dynamic.push(`${where} agree(${src.slice(x?.start, x?.end).slice(0, 60)})`); }
        return;
      }
      if (name === 't' || name === 'tr') {
        const v = lits(a[0]);
        if (v) v.forEach((x) => add(x, name, where)); else dynamic.push(`${where} ${name}(${src.slice(a[0]?.start, a[0]?.end).slice(0, 60)})`);
      } else if (name === 'tn') {
        const one = lits(a[1]); const other = lits(a[2]);
        if (one) one.forEach((x) => add(x, 'one', where)); else dynamic.push(`${where} tn one(${src.slice(a[1]?.start, a[1]?.end).slice(0, 60)})`);
        if (other) other.forEach((x) => add(x, 'other', where)); else dynamic.push(`${where} tn other(${src.slice(a[2]?.start, a[2]?.end).slice(0, 60)})`);
      } else {
        const one = lit(a[1]); const many = a[2] ? lit(a[2]) : one != null ? `${one}s` : null;
        if (one != null) add(`{n} ${one}`, 'one', where); else dynamic.push(`${where} plural one(${src.slice(a[1]?.start, a[1]?.end).slice(0, 60)})`);
        if (many != null) add(`{n} ${many}`, 'other', where); else dynamic.push(`${where} plural many(${src.slice(a[2]?.start, a[2]?.end).slice(0, 60)})`);
      }
    },
  });
}
const out = { keys: [...keys.values()], dynamic };
fs.writeFileSync(process.argv[2] || path.join(root, 'scripts/i18n/keys.json'), JSON.stringify(out, null, 1));
console.log(`${out.keys.length} clés, ${dynamic.length} appels dynamiques, ${out.keys.reduce((s, e) => s + e.k.length, 0)} caractères`);
