#!/usr/bin/env bash
# Chantier des langues : toute la chaîne d'enveloppement, dans l'ordre (sans effet si tout est déjà fait).
# bash scripts/i18n/chain.sh
set -e
cd "$(dirname "$0")/../.."
FILES=$(git ls-files src | grep -E "\.(js|jsx)$" | grep -vE "^src/(three/|i18n/|sw\.js|main\.jsx|boot\.jsx)|game/names\.js|ui/preview\.js|ui/gallery\.jsx|ui/errlog\.js|ui/typography\.js|ui/scrollcue\.js")
node scripts/i18n/unitplural.cjs $FILES | tail -1
node scripts/i18n/wrap.cjs $FILES | tail -1
node scripts/i18n/plural.cjs $FILES | tail -1
node scripts/i18n/negate.cjs $FILES | tail -1
node scripts/i18n/shadow.cjs --fix | tail -1
node scripts/i18n/shadow.cjs | tail -1
python -X utf8 scripts/i18n/spaces.py | head -1
grep -rl "｛\|｝" src | xargs -r sed -i 's/｛/{/g; s/｝/}/g'
npx vite build 2>&1 | grep -v "^    at " | grep -iE "error|built in|file:" | head -3
