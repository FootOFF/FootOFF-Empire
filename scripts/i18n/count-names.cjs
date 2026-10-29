// Taille des listes de noms d'une langue (src/game/names*.js) : prénoms et noms par origine, types et lieux de clubs.
// node scripts/i18n/count-names.cjs [fichier]
const fs = require('fs');
const f = process.argv[2] || 'src/game/names.js';
const s = fs.readFileSync(f, 'utf8');
const out = {};
for (const m of s.matchAll(/(?:const|export const) ([A-Z_]+) = (?:new Set\()?\[([\s\S]*?)\]\)?;/g)) out[m[1]] = (m[2].match(/'[^']+'/g) || []).length;
console.log(out);
