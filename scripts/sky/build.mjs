// Ciels photographiés : assets-src/hdri/*.hdr (Poly Haven, CC0, voir assets-src/skies.json)
//                    -> public/sky/<moment>.webp (+ -2k) et src/three/skies.generated.js
//
//   npm run skies            analyse et convertit les 8 ciels
//   npm run skies -- night   ne traite que les ciels dont le moment contient « night »
//
// Chaque ciel est mesuré dans son HDR d'origine (direction, couleur et éclairement du soleil, éclairement du ciel,
// couleur de l'horizon par direction), puis stocké en WebP 8 bits : seule la moitié haute (de -5,6° au zénith),
// en radiance normalisée (médiane du ciel = 1) et compressée x / (1 + x), que le shader du ciel inverse. Le soleil
// et les nuages lumineux gardent ainsi leur intensité (halo, reflets) dans une image de quelques centaines de Ko.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(ROOT, 'assets-src', 'hdri');
const OUT = join(ROOT, 'public', 'sky');
const MANIFEST = join(ROOT, 'assets-src', 'skies.json');
const GENERATED = join(ROOT, 'src', 'three', 'skies.generated.js');
const HEIGHT_FRACTION = 1088 / 2048; // lignes gardées : zénith -> -5,625° (multiple de 16 en 4K comme en 2K)
const HORIZON_BINS = 32;

const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DEG = Math.PI / 180;

// --- Lecture Radiance RGBE (RLE « nouveau style ») -> Float32 RGB linéaire --------------------------------
function readHDR(buf) {
  let pos = 0;
  const line = () => {
    const start = pos;
    while (pos < buf.length && buf[pos] !== 0x0a) pos++;
    return buf.toString('latin1', start, pos++);
  };
  if (!line().startsWith('#?')) throw new Error('pas un fichier Radiance');
  for (let l = line(); l !== ''; l = line()) {
    if (l.startsWith('FORMAT=') && !l.includes('32-bit_rle_rgbe')) throw new Error(`format non géré : ${l}`);
  }
  const m = line().match(/^-Y (\d+) \+X (\d+)$/);
  if (!m) throw new Error('orientation non gérée');
  const H = Number(m[1]), W = Number(m[2]);
  const data = new Float32Array(W * H * 3);
  const scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[pos] !== 2 || buf[pos + 1] !== 2 || ((buf[pos + 2] << 8) | buf[pos + 3]) !== W) throw new Error('RLE ancien non géré');
    pos += 4;
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < W;) {
        let n = buf[pos++];
        if (n > 128) {
          n -= 128;
          const v = buf[pos++];
          while (n--) scan[(x++) * 4 + c] = v;
        } else {
          while (n--) scan[(x++) * 4 + c] = buf[pos++];
        }
      }
    }
    for (let x = 0; x < W; x++) {
      const e = scan[x * 4 + 3];
      const o = (y * W + x) * 3;
      if (!e) continue;
      const f = 2 ** (e - 136);
      data[o] = (scan[x * 4] + 0.5) * f;
      data[o + 1] = (scan[x * 4 + 1] + 0.5) * f;
      data[o + 2] = (scan[x * 4 + 2] + 0.5) * f;
    }
  }
  return { W, H, data };
}

const lum = (d, o) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
const r3 = (v) => Math.round(v * 1000) / 1000;
const rgb3 = (a) => a.map(r3);

// --- Lueur au ras de l'horizon atténuée (« tame » dans skies.json) ---------------------------------------------
// La nuit, la lueur de ville de la photo, une douzaine de fois plus claire que le reste de l'horizon, faisait une tache
// blanche (halo) et une brume claire sur tout le complexe dès que la caméra se tournait vers elle. Sous `below` degrés,
// ce qui dépasse `max` fois la médiane de sa ligne est ramené en douceur (compression logarithmique), avec un fondu sur
// les cinq derniers degrés. La lune et les étoiles plus hautes ne bougent pas.
function tame({ W, H, data }, { below, max }) {
  const lums = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    const el = 90 - ((y + 0.5) / H) * 180;
    if (el > below) continue;
    if (el < -6) break;
    const fade = Math.min(1, (below - el) / 5);
    for (let x = 0; x < W; x++) lums[x] = lum(data, (y * W + x) * 3);
    const cap = max * Float32Array.from(lums).sort()[W >> 1];
    for (let x = 0; x < W; x++) {
      const l = lums[x];
      if (l <= cap) continue;
      const k = 1 + ((cap * (1 + 0.25 * Math.log(l / cap))) / l - 1) * fade;
      const o = (y * W + x) * 3;
      data[o] *= k; data[o + 1] *= k; data[o + 2] *= k;
    }
  }
}

// --- Mesures : soleil, ciel, horizon --------------------------------------------------------------------------
// fixedMedian : unité imposée (ciel atténué : mêmes unités et même orientation que la photo d'origine)
function analyse({ W, H, data }, fixedMedian = 0) {
  const elOf = (y) => (90 - ((y + 0.5) / H) * 180) * DEG;
  const dOmega = (y) => ((2 * Math.PI) / W) * (Math.PI / H) * Math.cos(elOf(y));
  const dirOf = (x, y) => {
    const az = ((x + 0.5) / W) * 2 * Math.PI, el = elOf(y);
    return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
  };

  // médiane (pondérée par l'angle solide) de la luminance du ciel entre 2° et 60°
  const samples = [];
  for (let y = 0; y < H; y += 2) {
    const el = elOf(y) / DEG;
    if (el < 2 || el > 60) continue;
    for (let x = 0; x < W; x += 2) samples.push([lum(data, (y * W + x) * 3), dOmega(y)]);
  }
  samples.sort((a, b) => a[0] - b[0]);
  const total = samples.reduce((s, v) => s + v[1], 0);
  let acc = 0, median = samples[samples.length >> 1][0];
  for (const [l, w] of samples) { acc += w; if (acc >= total / 2) { median = l; break; } }
  if (fixedMedian) median = fixedMedian;

  // soleil : pixel le plus lumineux au-dessus de -2°, puis disque et auréole proche (< 5°) très au-dessus du ciel
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < H; y++) {
    if (elOf(y) < -2 * DEG) break;
    for (let x = 0; x < W; x++) {
      const l = lum(data, (y * W + x) * 3);
      if (l > best) { best = l; bx = x; by = y; }
    }
  }
  const sd = dirOf(bx, by);
  const thr = Math.max(25 * median, 0.02 * best);
  const cosR = Math.cos(5 * DEG);
  let eSun = 0; const sunRGB = [0, 0, 0]; const cen = [0, 0, 0];
  const yr = Math.ceil((6 / 180) * H);
  for (let y = Math.max(0, by - yr); y < Math.min(H, by + yr); y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const l = lum(data, o);
      if (l < thr) continue;
      const d = dirOf(x, y);
      if (d[0] * sd[0] + d[1] * sd[1] + d[2] * sd[2] < cosR) continue;
      const w = dOmega(y);
      eSun += l * w;
      for (let c = 0; c < 3; c++) { sunRGB[c] += data[o + c] * w; cen[c] += d[c] * l * w; }
    }
  }
  const cl = Math.hypot(...cen) || 1;
  const sunDir = cen.map((v) => v / cl);
  const sunEl = Math.asin(sunDir[1]) / DEG;
  let sunU = Math.atan2(sunDir[0], -sunDir[2]) / (2 * Math.PI);
  sunU = ((sunU % 1) + 1) % 1;
  const sMax = Math.max(...sunRGB) || 1;

  // ciel seul (soleil écrêté) : éclairement horizontal, moyenne, zénith ; horizon (0,5° - 4°) par direction
  const clampL = 12 * median;
  let eSky = 0, wMean = 0, wZen = 0;
  const mean = [0, 0, 0], zen = [0, 0, 0];
  const bins = Array.from({ length: HORIZON_BINS }, () => [0, 0, 0, 0]);
  for (let y = 0; y < H; y++) {
    const el = elOf(y);
    if (el <= 0) break;
    const w = dOmega(y);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const l = lum(data, o);
      const k = l > clampL ? clampL / l : 1;
      eSky += l * k * Math.sin(el) * w;
      for (let c = 0; c < 3; c++) mean[c] += data[o + c] * k * w;
      wMean += w;
      if (el > 50 * DEG) { for (let c = 0; c < 3; c++) zen[c] += data[o + c] * k * w; wZen += w; }
      if (el > 0.5 * DEG && el < 4 * DEG) {
        const b = bins[Math.floor(((x + 0.5) / W) * HORIZON_BINS)];
        for (let c = 0; c < 3; c++) b[c] += data[o + c] * k * w;
        b[3] += w;
      }
    }
  }
  // lueur : zone la plus lumineuse du ciel à grande échelle (blocs de ~3°), soleil voilé ou couché compris
  const B = 128, bw = W / B, bh = H / (B / 2);
  let glow = { v: -1, u: 0.5, el: 0 };
  for (let j = 0; j < B / 2; j++) {
    const el = 90 - ((j + 0.5) / (B / 2)) * 180;
    if (el < -3 || el > 80) continue;
    for (let i = 0; i < B; i++) {
      let s = 0;
      for (let y = j * bh; y < (j + 1) * bh; y += 2) for (let x = i * bw; x < (i + 1) * bw; x += 2) s += Math.min(lum(data, (y * W + x) * 3), 50 * median);
      if (s > glow.v) glow = { v: s, u: (i + 0.5) / B, el };
    }
  }

  const n = (v) => v / median; // unités du jeu : médiane du ciel = 1
  return {
    median,
    sun: { u: r3(sunU), el: Math.round(sunEl * 100) / 100, color: rgb3(sunRGB.map((v) => v / sMax)), E: r3(n(eSun)), peak: Math.round(best / median) },
    glow: { u: r3(glow.u), el: Math.round(glow.el * 10) / 10 },
    skyE: r3(n(eSky)),
    mean: rgb3(mean.map((v) => n(v / wMean))),
    zenith: rgb3(zen.map((v) => n(v / wZen))),
    horizon: bins.map((b) => rgb3([0, 1, 2].map((c) => n(b[c] / b[3])))),
  };
}

// --- Encodage : moitié haute, x / (1 + x), 4K et 2K ------------------------------------------------------------
function encodeRows({ W, H, data }, scale, rows) {
  const out = Buffer.alloc(W * rows * 3);
  for (let i = 0; i < W * rows * 3; i++) {
    const x = data[i] / scale;
    out[i] = Math.min(255, Math.round((x / (1 + x)) * 255));
  }
  return out;
}

function halve({ W, H, data }) {
  const w = W >> 1, h = H >> 1;
  const d = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const a = ((2 * y) * W + 2 * x) * 3 + c, b = ((2 * y + 1) * W + 2 * x) * 3 + c;
        // moyenne écrêtée : le disque solaire ne déborde pas en carré clair sur ses voisins
        d[(y * w + x) * 3 + c] = (Math.min(data[a], 1e4) + Math.min(data[a + 3], 1e4) + Math.min(data[b], 1e4) + Math.min(data[b + 3], 1e4)) / 4;
      }
    }
  }
  return { W: w, H: h, data: d };
}

async function writeWebp(buf, W, rows, file) {
  await sharp(buf, { raw: { width: W, height: rows, channels: 3 } })
    .webp({ quality: 90, smartSubsample: true, effort: 6 })
    .toFile(file);
  return statSync(file).size;
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
mkdirSync(OUT, { recursive: true });
const prev = existsSync(GENERATED) ? (await import(`file://${GENERATED.replace(/\\/g, '/')}?t=${Date.now()}`)).SKIES : {};
const result = { ...prev };
let totalBytes = 0;
for (const sky of manifest.skies) {
  if (filter && !sky.moment.includes(filter)) continue;
  const path = join(SRC, sky.file);
  if (!existsSync(path)) { console.error(`manquant : ${path} (voir l'URL dans assets-src/skies.json)`); process.exitCode = 1; continue; }
  const t0 = Date.now();
  const img = readHDR(readFileSync(path));
  let info = analyse(img);
  if (sky.tame) { // soleil et lueur repérés sur la photo d'origine : le ciel garde son orientation
    tame(img, sky.tame);
    info = { ...analyse(img, info.median), sun: info.sun, glow: info.glow };
  }
  const rows = Math.round(img.H * HEIGHT_FRACTION);
  const big = await writeWebp(encodeRows(img, info.median, rows), img.W, rows, join(OUT, `${sky.moment}.webp`));
  const half = halve(img);
  const rows2 = Math.round(half.H * HEIGHT_FRACTION);
  const small = await writeWebp(encodeRows(half, info.median, rows2), half.W, rows2, join(OUT, `${sky.moment}-2k.webp`));
  totalBytes += big + small;
  const elMin = 90 - HEIGHT_FRACTION * 180;
  result[sky.moment] = { id: sky.id, elMin, ...info, median: undefined };
  console.log(`${sky.moment.padEnd(7)} soleil ${String(info.sun.el).padStart(6)}°  u ${info.sun.u.toFixed(3)}  E ${String(info.sun.E).padStart(8)}  pic ×${info.sun.peak}  lueur ${info.glow.el}° u ${info.glow.u}  ciel E ${info.skyE}  4K ${(big / 1024).toFixed(0)} Ko  2K ${(small / 1024).toFixed(0)} Ko  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

const body = Object.entries(result).map(([k, v]) => `  ${k}: ${JSON.stringify({ ...v, median: undefined })},`).join('\n');
writeFileSync(GENERATED, `// Généré par scripts/sky/build.mjs : ne pas modifier à la main.
// Unités : radiance du ciel normalisée (médiane du ciel = 1). sun.u : colonne du soleil dans l'image (0-1, sens
// horaire vu du dessus) ; sun.el : hauteur (°) ; sun.E : éclairement du disque ; skyE : éclairement horizontal du ciel
// seul ; horizon : couleur de l'horizon (0,5° - 4°) par tranche de ${360 / HORIZON_BINS}° depuis la colonne u = 0.
export const SKIES = {
${body}
};
`);
console.log(`total publié : ${(totalBytes / 1024 / 1024).toFixed(2)} Mo`);
