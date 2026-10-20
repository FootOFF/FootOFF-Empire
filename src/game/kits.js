// Couleurs des maillots adverses : propres à chaque club, toujours les mêmes pour un même nom, et contrastées avec
// notre tenue noir et or. Les « Bleus » jouent en bleu, les « Jaunes » en jaune citron.

const PALETTE = [
  { shirt: 0xc0392b, keeper: 0x2ecc71 }, // rouge
  { shirt: 0x2463c9, keeper: 0xf39c12 }, // bleu
  { shirt: 0xf2f2f2, keeper: 0x8e44ad }, // blanc
  { shirt: 0x1f8a4c, keeper: 0xe84393 }, // vert
  { shirt: 0x6cb4e8, keeper: 0xd35400 }, // ciel
  { shirt: 0x7b1e3a, keeper: 0x27ae60 }, // grenat
  { shirt: 0xe67e22, keeper: 0x2980b9 }, // orange
  { shirt: 0x6c3fa0, keeper: 0xf1c40f }, // violet
  { shirt: 0x1d2c5e, keeper: 0xe74c3c }, // marine
];

export function kitOf(name = '') {
  if (/^Bleus\b/.test(name)) return PALETTE[1];
  if (/^Jaunes\b/.test(name)) return { shirt: 0xe8dc3a, keeper: 0x2c3e50 };
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const HOME_KIT = { shirt: 0xc7a15a, keeper: 0x2f343c };
