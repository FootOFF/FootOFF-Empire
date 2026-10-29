// Assemble les traductions (traductions/*.tsv : id<TAB>en<TAB>es<TAB>ar, ou k:clé<TAB>…) en dictionnaires src/i18n/{en,es,ar}.js et contrôle
// chaque ligne : mêmes variables {x} et mêmes balises <k/> que le français (les accords français {n} et {v} de live.js
// peuvent tomber), une valeur arabe en écriture arabe, un objet de pluriel bien formé.
// node merge.cjs [--write]
const fs = require('fs');
const path = require('path');
const D = __dirname; // scripts/i18n
const ROOT = path.join(__dirname, '../..');
const ids = JSON.parse(fs.readFileSync(path.join(D, 'ids.json'), 'utf8'));
const { keys } = JSON.parse(fs.readFileSync(path.join(D, 'keys.json'), 'utf8'));
const kind = Object.fromEntries(keys.map((e) => [e.k, e.kind]));
const LANGS = ['en', 'es', 'ar'];
const dict = { en: {}, es: {}, ar: {} };
const problems = [];
const vars = (s) => [...new Set((s.match(/\{\w+\}/g) || []))].sort();
const tags = (s) => [...(s.match(/<\/?\d+\/?>/g) || [])].sort();
const OPTIONAL = new Set(['{n}', '{v}', '{v2}', '{v3}', '{tn}', '{agree}', '{s}', '{e}', '{x}']); // accords qui peuvent tomber
let lines = 0;
for (const f of fs.readdirSync(path.join(D, 'traductions')).filter((x) => x.endsWith('.tsv')).sort()) {
  for (const [i, line] of fs.readFileSync(path.join(D, 'traductions', f), 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    lines++;
    const [id, ...vals] = line.split('\t');
    const fr = id.startsWith('k:') ? id.slice(2) : ids[id]; // k:contexte|clé : clé ajoutée à la main (t(fr, vars, contexte))
    const at = `${f}:${i + 1} #${id}`;
    if (fr == null) { problems.push(`${at} : id inconnu`); continue; }
    if (id.startsWith('k:')) kind[fr] ||= 't';
    if (!vals.length || vals.every((x) => !x)) continue; // clé laissée en français (identifiant)
    while (vals.length < 3 && vals.length > 1) vals.push(''); // colonnes vides en fin de ligne (rognées à l'écriture)
    if (vals.length !== 3) { problems.push(`${at} : ${vals.length} colonnes`); continue; }
    LANGS.forEach((l, j) => {
      let v = vals[j];
      if (v === '') return; // identique au français (nom propre, identifiant)
      if (!v.startsWith('{"')) v = v.replace(/\\n/g, '\n'); // « \n » écrit dans le fichier : un vrai retour à la ligne
      if (v.startsWith('{"')) {
        try { v = JSON.parse(v); } catch (e) { problems.push(`${at} ${l} : objet illisible`); return; }
        if (!v.other) problems.push(`${at} ${l} : pluriel sans « other »`);
        if (kind[fr] !== 'other') problems.push(`${at} ${l} : objet de pluriel sur une clé ${kind[fr]}`);
      }
      const forms = typeof v === 'string' ? [v] : Object.values(v);
      for (const s of forms) {
        const frBase = fr.includes('|') && fr.startsWith('k') === false ? fr.split('|').pop() : fr.split('|').pop();
        const miss = vars(frBase).filter((x) => !s.includes(x) && !OPTIONAL.has(x) && typeof v === 'string' && !(l === 'ar' && kind[fr] === 'one'));
        const extra = vars(s).filter((x) => !fr.includes(x));
        if (miss.length) problems.push(`${at} ${l} : variable perdue ${miss.join(' ')} → ${s}`);
        if (extra.length) problems.push(`${at} ${l} : variable inventée ${extra.join(' ')} → ${s}`);
        if (tags(fr).join() !== tags(s).join()) problems.push(`${at} ${l} : balises ${tags(fr).join('')} ≠ ${tags(s).join('')}`);
        if (l === 'ar' && /[A-Za-z]{3,}/.test(s.replace(/FootOFF( Empire| FC)?|Stats Pass|\{\w+\}|<\/?\d+\/?>|[A-Z]{1,4}\b|GK|XI/g, '')) && !/[\u0600-\u06FF]/.test(s)) problems.push(`${at} ar : pas d'arabe → ${s}`);
        if (l !== 'ar' && /[\u0600-\u06FF]/.test(s)) problems.push(`${at} ${l} : arabe dans la mauvaise colonne`);
      }
      dict[l][fr] = v;
    });
  }
}
const total = keys.length;
console.log(`${lines} lignes, ${Object.keys(dict.en).length}/${total} clés en, ${Object.keys(dict.es).length} es, ${Object.keys(dict.ar).length} ar`);
if (problems.length) console.log(problems.join('\n'));
if (process.argv.includes('--write')) {
  for (const l of LANGS) {
    const body = `// Dictionnaire ${l} (chantier des langues) : le français est la clé. Généré depuis les traductions relues.\n/* eslint-disable */\nexport default ${JSON.stringify(dict[l], null, 0)};\n`;
    fs.writeFileSync(path.join(ROOT, 'src/i18n', `${l}.js`), body);
  }
  console.log('dictionnaires écrits');
}
