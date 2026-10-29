// Chantier des langues : abréviations et petits mots restés en clair dans le JSX (J pour journée, S pour saison,
// G N P, t.a.b., n°, « à » entre deux valeurs) : chacun passe par t(), avec ses espaces autour.
// node scripts/i18n/abbr.cjs fichier…
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const WORDS = new Set(['J', 'S', 'G', 'N', 'P', 't.a.b.', 'n°', 'V-N-D', 'à', '· J']);
let total = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, {
    JSXText(p) {
      const m = /^(\s*)(.*?)(\s*)$/s.exec(p.node.value);
      if (!WORDS.has(m[2])) return;
      const word = m[2] === '· J' ? `· {t('J')}` : `{t('${m[2]}')}`;
      edits.push([p.node.start, p.node.end, m[2] === 'à' ? `{t('${p.node.value}')}` : `${m[1]}${word}${m[3]}`]);
    },
  });
  let out = src;
  for (const [s, e, txt] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, s) + txt + out.slice(e);
  if (edits.length) fs.writeFileSync(f, out);
  total += edits.length;
}
console.log(`${total} abréviations traduites`);
