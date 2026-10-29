# Chantier des langues : {' '}{t('…')}{' '} → {t(' … ')} : les espaces d'un morceau de phrase restent dans le même
# texte (la typographie française y pose ses insécables ; t() garde les espaces du code autour de la traduction).
import re, subprocess, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
files = [f for f in subprocess.run(['git', 'ls-files', 'src'], capture_output=True, text=True).stdout.split() if f.endswith(('.jsx', '.js'))]
STR = r"((?:[^'\\]|\\.)*)"
pat_both = re.compile(r"\{' '\}\{t\('" + STR + r"'\)\}\{' '\}")
pat_lead = re.compile(r"\{' '\}\{t\('" + STR + r"'\)\}")
pat_trail = re.compile(r"\{t\('" + STR + r"'\)\}\{' '\}")
n = 0
for f in files:
    s = open(f, encoding='utf-8').read()
    s2 = pat_both.sub(lambda m: "{t(' %s ')}" % m.group(1), s)
    s2 = pat_lead.sub(lambda m: "{t(' %s')}" % m.group(1), s2)
    s2 = pat_trail.sub(lambda m: "{t('%s ')}" % m.group(1), s2)
    if s2 != s:
        n += 1
        open(f, 'w', encoding='utf-8', newline='').write(s2)
print('fichiers', n)
