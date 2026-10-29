# Chantier des langues : graines de tirage, identifiants, chemins d'API, clés de stockage et fuseaux horaires
# (« {code}|{seed}|clubs », « /{code}/info », « fo-ligue-club-{code} », « Etc/GMT{v}{abs} »)
# ne se traduisent jamais. Remet en gabarit JavaScript les t() que l'enveloppement automatique y a mis.
# python -X utf8 scripts/i18n/unwrap-ids.py fichier…
import re
import sys


def split_top(s):
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur.strip())
            cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


PAT = re.compile(r"(?<![\w.])t\('((?:[^']*(?:\||Etc/GMT)[^']*)|(?:/|fo-)[^' ]*)'(?:, \{ ([^}]*) \})?\)")
total = 0
for f in sys.argv[1:]:
    s = open(f, encoding='utf-8').read()

    def rep(m):
        key, obj = m.group(1), m.group(2)
        if not obj:
            return "'" + key + "'"
        vals = {}
        for part in split_top(obj):
            k, _, v = part.partition(':')
            vals[k.strip()] = (v.strip() or k.strip())
        return '`' + re.sub(r'\{(\w+)\}', lambda x: '${' + vals[x.group(1)] + '}', key) + '`'

    n = len(PAT.findall(s))
    if n:
        open(f, 'w', encoding='utf-8', newline='').write(PAT.sub(rep, s))
        total += n
        print(f, n)
print(total, 'identifiants rendus')
