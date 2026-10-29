# Langues de FootOFF Empire (0.8.14)

Le français est écrit dans le code et sert de clé ; `t()`, `tn()` et `tr()` (src/i18n/index.js) le remplacent par la
traduction de la langue de la partie. Les dictionnaires `src/i18n/{en,es,ar}.js` sont générés : ne pas les modifier à la main.

## Ajouter ou changer un texte

1. Écrire le texte en français dans le code, dans `t('…')` (ou `tn`, `tr`).
2. Ajouter une ligne dans un fichier de `traductions/` (le plus récent, ou un nouveau `0NN.tsv`) :
   `k:Texte français<TAB>anglais<TAB>espagnol<TAB>arabe`.
   - Les variables `{x}` et les balises `<0/>`, `<1>…</1>` doivent rester les mêmes.
   - Un pluriel arabe s'écrit en objet JSON : `{"zero":"…","one":"…","two":"…","few":"…","many":"…","other":"…"}`.
   - Une même clé française qui se traduit autrement selon l'endroit : `t('Rose', undefined, 'couleur')` et la ligne
     `k:couleur|Rose<TAB>…`.
3. `node scripts/i18n/merge.cjs` contrôle tout ; `node scripts/i18n/merge.cjs --write` écrit les dictionnaires.

`extract.cjs` relève toutes les clés du code (`keys.json`) ; `ids.json` relie les numéros des premiers fichiers aux clés.
Ne jamais relancer `wrap.cjs` ni `chain.sh` sur tout le code : ils envelopperaient aussi des identifiants techniques
(graines des ligues, clés de stockage, chemins du serveur), qui doivent rester tels quels.

Choix de vocabulaire : `GLOSSAIRE.md`. Écriture de droite à gauche : `scripts/rtl/postcss-rtl.cjs` (règles en miroir,
`/* rtl:ignore */` pour les terrains et les éléments placés par des coordonnées).
