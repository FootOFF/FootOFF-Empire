// Chantier des langues : les petites fonctions locales plural(n, un, plusieurs) laissent place à celle de src/i18n
// (« {n} but » / « {n} buts », accordés dans chaque langue) ; leurs unités passent en français brut (clés du
// dictionnaire). node scripts/i18n/plurals.cjs
const fs = require('fs');
const path = require('path');
const NM = path.resolve(__dirname, '../../node_modules') + '/';
const parser = require(NM + '@babel/parser');
const traverse = require(NM + '@babel/traverse').default;
const SRC = path.resolve(__dirname, '../../src');
const FILES = ['ui/academy.jsx', 'ui/calendar.jsx', 'ui/career.jsx', 'ui/league.jsx', 'ui/mercato.jsx', 'ui/squad.jsx', 'ui/stats.jsx', 'ui/training.jsx', 'ui/trophyroom.jsx', 'ui/Empire3D.jsx', 'three/trophies.js'];
for (const rel of FILES) {
  const file = path.join(SRC, rel);
  let code = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  let fmt = false;
  traverse(ast, {
    VariableDeclarator(p) {
      if (p.node.id.name !== 'plural' || p.parentPath.parentPath.type !== 'Program') return;
      fmt = /fmtNum/.test(code.slice(p.node.init.start, p.node.init.end));
      const decl = p.parentPath.node;
      edits.push({ start: decl.start, end: decl.end + (code[decl.end] === '\n' ? 1 : 0), text: '' });
    },
    CallExpression(p) {
      if (p.node.callee.type !== 'Identifier' || p.node.callee.name !== 'plural') return;
      for (const a of p.node.arguments.slice(1)) {
        if (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 't' && a.arguments[0]?.type === 'StringLiteral' && a.arguments.length === 1) {
          edits.push({ start: a.start, end: a.end, text: code.slice(a.arguments[0].start, a.arguments[0].end) });
        }
      }
    },
  });
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  // import : plural depuis src/i18n (au lieu de honours, ou de la fonction locale)
  const from = path.relative(path.dirname(file), path.join(SRC, 'i18n/index')).replace(/\\/g, '/');
  code = code.replace(/import \{([^}]*)\bplural\b,?\s*([^}]*)\} from '\.\.\/game\/honours';/, (m, a, b) => {
    const rest = `${a}${b}`.split(',').map((x) => x.trim()).filter(Boolean);
    return rest.length ? `import { ${rest.join(', ')} } from '../game/honours';` : '';
  });
  const im = code.match(/import \{([^}]*)\} from '((?:\.\.\/|\.\/)+i18n(?:\/index)?)';/);
  const name = fmt ? 'plural as pluralRaw' : 'plural';
  if (im) code = code.replace(im[0], `import { ${[...new Set([...im[1].split(',').map((x) => x.trim()).filter(Boolean), name])].sort().join(', ')} } from '${im[2]}';`);
  else code = `import { ${name} } from '${from.startsWith('.') ? from : `./${from}`}';\n${code}`;
  if (fmt) code = code.replace(/(\nimport [^\n]*\n)(?![\s\S]*\nimport )/, `$1// nombres au format de la langue (1 234)\nconst plural = (n, one, many) => pluralRaw(n, one, many, fmtNum(n));\n`);
  fs.writeFileSync(file, code);
  console.log(`${rel} : ${edits.length} modifications${fmt ? ' (fmtNum)' : ''}`);
}
