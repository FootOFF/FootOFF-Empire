// Pipeline GLB : assets-src/models (exports Blender bruts, en mètres)
//             -> contrôles -> optimisation -> public/models + src/three/models.generated.js
//
//   npm run models            contrôle, optimise, publie, régénère le manifeste
//   npm run models:check      contrôle seulement (aucune écriture) — code de sortie 1 si erreur
//   npm run models -- fans    ne traite que les modèles dont le nom contient « fans »

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, flatten, instance, join as joinMeshes, meshopt, normals, prune, resample, textureCompress, weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import {
  BUILDING_NAME, BUILDINGS, CATEGORIES, PROPS, GENERATED_MANIFEST, OUT_DIR, REPORT_FILE, ROOT, SPECIAL_NODE, SRC_DIR, UNIT_SCALE,
} from './config.mjs';
import { checkOutput, checkSource, sceneStats } from './checks.mjs';

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const filter = args.find((a) => !a.startsWith('--'));

const c = { red: (s) => `\x1b[31m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m` };
const kb = (b) => `${(b / 1024).toFixed(b < 102400 ? 1 : 0)} Ko`;

// ---------- Inventaire des sources ----------
function listSources() {
  const out = [];
  const bDir = join(SRC_DIR, 'buildings');
  if (existsSync(bDir)) {
    for (const folder of readdirSync(bDir)) {
      const dir = join(bDir, folder);
      if (!statSync(dir).isDirectory()) continue;
      for (const f of readdirSync(dir)) {
        if (!/\.(glb|gltf)$/i.test(f)) continue;
        out.push({ kind: 'building', folder, file: join(dir, f), name: basename(f, extname(f)) });
      }
    }
  }
  const pDir = join(SRC_DIR, 'props');
  if (existsSync(pDir)) {
    for (const f of readdirSync(pDir)) {
      if (/\.(glb|gltf)$/i.test(f)) out.push({ kind: 'prop', file: join(pDir, f), name: basename(f, extname(f)) });
    }
  }
  return out.filter((s) => !filter || s.name.includes(filter));
}

// Nom, dossier et niveau conformes à la convention ?
function identify(src) {
  if (src.kind === 'prop') {
    if (!/^[a-z0-9_]+$/.test(src.name)) return { error: `Nom « ${src.name} » invalide (minuscules, chiffres, _).` };
    const categoryName = CATEGORIES[PROPS[src.name]] ? PROPS[src.name] : 'prop';
    return { category: CATEGORIES[categoryName], categoryName, out: join(OUT_DIR, 'props', `${src.name}.glb`) };
  }
  const m = BUILDING_NAME.exec(src.name);
  if (!m) return { error: `Nom « ${src.name} » invalide : attendu <bâtiment>_L<niveau>, ex. fans_L2.` };
  const [, key, lvlStr] = m;
  const level = Number(lvlStr);
  const def = BUILDINGS[key];
  if (!def) return { error: `Bâtiment « ${key} » inconnu (${Object.keys(BUILDINGS).join(', ')}).` };
  if (key !== src.folder) return { error: `Fichier dans buildings/${src.folder}/ au lieu de buildings/${key}/.` };
  if (level < 1 || level > def.maxLevel) return { error: `Niveau ${level} hors limites (1 à ${def.maxLevel} pour ${key}).` };
  const categoryName = def.levelCategories?.[level] || def.category; // ex. stade : arène plus large aux niveaux 5 et 6
  return {
    key, level, category: CATEGORIES[categoryName], categoryName,
    out: join(OUT_DIR, 'buildings', `${src.name}.glb`),
  };
}

// Réglages par modèle facultatifs : <nom>.json à côté de la source ({ rotY, fit, offset, scale }).
function readOverrides(src) {
  const f = src.file.replace(/\.(glb|gltf)$/i, '.json');
  if (!existsSync(f)) return {};
  return JSON.parse(readFileSync(f, 'utf8'));
}

// ---------- Optimisation ----------
// Supprime les nœuds vides laissés par join(), sauf les nœuds spéciaux (empties light_*, ...).
function pruneEmptyLeaves() {
  return (doc) => {
    let removed;
    do {
      removed = 0;
      for (const node of doc.getRoot().listNodes()) {
        if (node.getMesh() || node.getCamera() || node.getSkin() || node.listChildren().length) continue;
        if (SPECIAL_NODE.test(node.getName())) continue;
        node.dispose();
        removed++;
      }
    } while (removed);
  };
}

async function optimize(doc, category) {
  const root = doc.getRoot();
  root.listCameras().forEach((cam) => cam.dispose());
  root.listExtensionsUsed().filter((e) => e.extensionName === 'KHR_lights_punctual').forEach((e) => e.dispose());
  const size = category.maxTextureSize;
  const nsize = category.maxNormalTextureSize || size; // reliefs : souvent moins fins que la couleur
  await doc.transform(
    dedup(),
    instance({ min: 5 }),
    // cleanup: false partout : le nettoyage automatique supprime les empties light_* (nœuds sans maillage).
    flatten({ cleanup: false }),
    // Les nœuds spéciaux (emissive_*, light_*, ...) gardent leur nom et leur identité.
    joinMeshes({ filter: (node) => !SPECIAL_NODE.test(node.getName()), cleanup: false }),
    // normals() désindexe toujours les maillages (même s'il ne calcule rien) : avant weld(), qui les réindexe ;
    // sinon chaque triangle garde ses trois sommets (fichiers ~3 fois plus lourds, réordonnancement impossible).
    normals({ overwrite: false }),
    weld(),
    resample(),
    pruneEmptyLeaves(),
    prune({ keepLeaves: true, keepExtras: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(?!normalTexture).*$/, resize: [size, size], quality: 82 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, resize: [nsize, nsize], quality: 95 }),
    // UV sur 16 bits : les textures répétées (sièges, béton, toiture) ont des UV bien au-delà de [0, 1].
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16 }),
  );
}

// ---------- Traitement d'un modèle ----------
async function processOne(io, src) {
  const res = { name: src.name, kind: src.kind, issues: [], published: false };
  const id = identify(src);
  if (id.error) {
    res.issues.push({ level: 'error', code: 'naming', msg: id.error });
    return res;
  }
  Object.assign(res, { key: id.key, level: id.level, category: id.categoryName, out: id.out });
  res.srcBytes = statSync(src.file).size;

  let doc;
  try {
    doc = await io.read(src.file);
    doc.setLogger(new Logger(Logger.Verbosity.ERROR)); // les transforms signalent en WARN des cas sans gravité
  } catch (err) {
    res.issues.push({ level: 'error', code: 'read', msg: `Lecture impossible : ${err.message}` });
    return res;
  }
  const source = checkSource(doc, { category: id.category, name: src.name });
  res.issues.push(...source.issues);
  res.special = source.special;
  res.size = source.bounds?.size;
  if (!source.stats) return res;

  await optimize(doc, id.category);
  const glb = await io.writeBinary(doc);
  res.outBytes = glb.byteLength;
  res.stats = sceneStats(doc);
  res.issues.push(...checkOutput(res.stats, glb.byteLength, id.category));

  const blocked = res.issues.some((i) => i.level === 'error');
  if (!blocked && !CHECK_ONLY) {
    mkdirSync(join(id.out, '..'), { recursive: true });
    writeFileSync(id.out, glb);
    res.published = true;
  }
  res.overrides = readOverrides(src);
  return res;
}

// ---------- Manifeste généré ----------
function writeManifest(results) {
  const entry = (r, folder) => {
    const o = { url: `models/${folder}/${r.name}.glb`, scale: UNIT_SCALE, ...r.overrides };
    if (o.fit) delete o.scale;
    return JSON.stringify(o);
  };
  const ok = results.filter((r) => r.published);
  const buildings = ok.filter((r) => r.kind === 'building').sort((a, b) => a.name.localeCompare(b.name));
  const props = ok.filter((r) => r.kind === 'prop').sort((a, b) => a.name.localeCompare(b.name));
  const lines = [
    '// FICHIER GÉNÉRÉ par `npm run models` — ne pas modifier à la main.',
    '// Réglages par modèle : assets-src/models/.../<nom>.json ; surcharges manuelles : manifest.js.',
    '',
    'export const GENERATED_MODELS = {',
    ...buildings.map((r) => `  '${r.key}:${r.level}': ${entry(r, 'buildings')},`),
    '};',
    '',
    'export const GENERATED_PROPS = {',
    ...props.map((r) => `  '${r.name}': ${entry(r, 'props')},`),
    '};',
    '',
  ];
  writeFileSync(GENERATED_MANIFEST, lines.join('\n'));
}

// ---------- Rapport ----------
function statusOf(r) {
  if (r.issues.some((i) => i.level === 'error')) return 'ERREUR';
  if (r.issues.some((i) => i.level === 'warn')) return 'ALERTES';
  return 'OK';
}

function printReport(results) {
  console.log('');
  for (const r of results) {
    const st = statusOf(r);
    const color = st === 'ERREUR' ? c.red : st === 'ALERTES' ? c.yellow : c.green;
    const stats = r.stats
      ? `${r.stats.triangles.toLocaleString('fr-FR')} tris · ${r.stats.drawCalls} draws · ${kb(r.srcBytes)} → ${kb(r.outBytes)}`
      : '';
    const pub = r.published ? c.green(' publié') : CHECK_ONLY ? c.dim(' (contrôle seul)') : c.red(' non publié');
    console.log(`${color(st.padEnd(8))} ${r.name.padEnd(16)} ${c.dim(stats)}${pub}`);
    for (const i of r.issues) {
      const tag = i.level === 'error' ? c.red('  ✖') : i.level === 'warn' ? c.yellow('  ⚠') : c.dim('  ·');
      console.log(`${tag} ${i.level === 'info' ? c.dim(i.msg) : i.msg}`);
    }
  }
}

function writeReportFile(results) {
  const rows = results.map((r) => {
    const s = r.stats;
    const dims = r.size ? `${r.size.map((v) => Math.round(v)).join(' × ')} m` : '—';
    return `| ${r.name} | ${statusOf(r)} | ${s ? s.triangles.toLocaleString('fr-FR') : '—'} | ${s ? s.drawCalls : '—'} | ${s ? s.materials : '—'} | ${r.outBytes ? kb(r.outBytes) : '—'} | ${dims} | ${(r.special || []).length} |`;
  });
  const details = results.flatMap((r) => (r.issues.length
    ? [`### ${r.name}`, ...r.issues.map((i) => `- **${i.level}** \`${i.code}\` — ${i.msg}`), '']
    : []));
  const md = [
    '# Rapport du pipeline GLB',
    '',
    `Généré par \`npm run models\` le ${new Date().toLocaleString('fr-FR')}.`,
    '',
    '| Modèle | Statut | Triangles | Draw calls | Matériaux | Poids final | Dimensions (L × H × P) | Nœuds spéciaux |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    ...details,
  ];
  writeFileSync(REPORT_FILE, md.join('\n'));
}

// ---------- Main ----------
const sources = listSources();
if (!sources.length) {
  console.log(`Aucun modèle dans ${relative(ROOT, SRC_DIR)}/ (attendu : buildings/<bâtiment>/<bâtiment>_L<n>.glb).`);
  if (!CHECK_ONLY && !filter) writeManifest([]);
  process.exit(0);
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const results = [];
for (const src of sources) results.push(await processOne(io, src));
printReport(results);

if (!CHECK_ONLY) {
  if (!filter) {
    writeManifest(results);
    writeReportFile(results);
  } else {
    console.log(c.dim('\nFiltre actif : manifeste et rapport non régénérés (relancer sans filtre).'));
  }
}

const errors = results.filter((r) => statusOf(r) === 'ERREUR').length;
console.log(`\n${results.length} modèle(s) · ${results.filter((r) => r.published).length} publié(s) · ${errors ? c.red(`${errors} en erreur`) : c.green('0 erreur')}`);
process.exit(errors ? 1 : 0);
