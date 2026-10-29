// Chantier des langues : plural(n, 'mot', 'mots') construit lui-même ses clés ('{n} mot', '{n} mots') et les traduit ;
// ses mots doivent donc rester en français dans le code. Retire le t() que l'enveloppement automatique y a mis :
// plural(n, t('trophée')) → plural(n, 'trophée'). De même pour agree (mercato.jsx), qui traduit la forme qu'il choisit.
// node scripts/i18n/unwrap-plural.cjs fichier…
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

let total = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== 'Identifier' || !['plural', 'pluralRaw', 'agree'].includes(c.name)) return; // agree(club, 'accepte', 'acceptent') : verbe accordé, traduit par agree
      for (const a of p.node.arguments.slice(1, 3)) {
        if (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 't' && a.arguments.length === 1
          && a.arguments[0].type === 'StringLiteral') edits.push([a.start, a.end, src.slice(a.arguments[0].start, a.arguments[0].end)]);
      }
    },
  });
  if (!edits.length) continue;
  let out = src;
  for (const [s, e, txt] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + txt + out.slice(e);
  fs.writeFileSync(f, out);
  total += edits.length;
  console.log(`${f} : ${edits.length}`);
}
console.log(`${total} mots rendus au français`);
