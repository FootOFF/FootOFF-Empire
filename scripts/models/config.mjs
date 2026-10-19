// Conventions et chemins du pipeline GLB.
// Les budgets viennent de assets-src/budgets.json, lu aussi par tools/blender/footoff_export.py :
// c'est là qu'on les modifie.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC_DIR = join(ROOT, 'assets-src', 'models');
export const OUT_DIR = join(ROOT, 'public', 'models');
export const GENERATED_MANIFEST = join(ROOT, 'src', 'three', 'models.generated.js');
export const REPORT_FILE = join(ROOT, 'assets-src', 'models', 'REPORT.md');

const budgets = JSON.parse(readFileSync(join(ROOT, 'assets-src', 'budgets.json'), 'utf8'));

export const UNIT_SCALE = budgets.unitScale; // export Blender en mètres -> unités three (1 u = 10 m)
export const CATEGORIES = budgets.categories;
export const BUILDINGS = budgets.buildings; // clé -> { category, maxLevel }
export const PROPS = budgets.props || {}; // nom de prop -> catégorie (défaut : prop)
export const SPECIAL_NODE = new RegExp(`^(${budgets.specialNodePrefixes.join('|')})`, 'i');

// buildings/fans/fans_L2.glb -> { key: 'fans', level: 2 }
export const BUILDING_NAME = /^([a-z]+)_L(\d+)$/;
