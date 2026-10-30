import { knownCrest } from './crest';

// Couleurs des maillots adverses : propres à chaque club, toujours les mêmes pour un même nom, et contrastées avec
// notre tenue (noir et or par défaut). Les « Bleus » jouent en bleu, les « Jaunes » en jaune citron, les « Verts » en vert.

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
  if (/^Verts\b/.test(name)) return PALETTE[3];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const HOME_KIT = { shirt: 0xc7a15a, keeper: 0x2f343c, trim: 0x171719 };

// Tenue d'un club à ses deux couleurs d'écusson (0.8.8) : le maillot à la principale, le short et le col à la secondaire
// (le noir FootOFF garde son anthracite), le gardien en anthracite, ou en violet si le maillot est déjà sombre.
const hexInt = (h) => parseInt(h.slice(1), 16);
export function kitOfCrest(c) {
  if (!c?.primary || !c?.secondary) return HOME_KIT;
  const shirt = hexInt(c.primary);
  const trim = c.secondary === '#0d0d0e' ? HOME_KIT.trim : hexInt(c.secondary);
  return { shirt, trim, keeper: clash(shirt, HOME_KIT.keeper) ? 0x8e44ad : HOME_KIT.keeper };
}

// Notre tenue, posée par App à chaque rendu (setOurKit) : scène 3D, portraits, exercices d'entraînement.
let OURS = HOME_KIT;
export const setOurKit = (crest) => { OURS = kitOfCrest(crest); };
export const ourKit = () => OURS;

// Tenue d'un autre club : celle qu'un ami a composée (son écusson, connu ou donné), sinon celle tirée de son nom.
export const teamKitOf = (name = '', crest = knownCrest(name)) => (crest ? kitOfCrest(crest) : { ...kitOf(name), trim: HOME_KIT.trim });

// Tenue de match en 3D (0.8.7, 0.8.8) : les temps forts se jouent de nuit, sous des projecteurs chauds, où le blanc se
// confond avec l'or, l'orange ou le jaune ; deux maillots trop proches, l'adversaire change de tenue : sa seconde couleur
// si elle se lit, sinon le blanc, le marine, le rouge ou le vert (son écusson ne change pas).
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const light = (c) => Math.min(...rgb(c)) > 200; // blanc et presque blanc : crème sous les projecteurs
const warm = (c) => { const [r, g, b] = rgb(c); return r > 150 && g > 110 && r > b + 50; }; // or, jaune, orange
function clash(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 110 || (light(a) && warm(b)) || (light(b) && warm(a));
}
const ALTS = [0xf2f2f2, 0x1d2c5e, 0xc0392b, 0x1f8a4c, 0x151515];
export function matchKitOf(name = '', ours = OURS, crest = undefined) {
  const k = teamKitOf(name, crest || undefined);
  const kit = clash(k.shirt, ours.shirt) ? (() => {
    const shirt = [k.trim, ...ALTS].find((c) => c !== HOME_KIT.trim && !clash(c, ours.shirt)) ?? 0x1d2c5e;
    return { shirt, trim: shirt === k.trim ? k.shirt : HOME_KIT.trim, keeper: k.keeper };
  })() : k;
  // son gardien ne se confond ni avec nos joueurs, ni avec notre gardien, ni avec ses propres coéquipiers (0.8.15) : un
  // gardien jaune face à un maillot or, on ne voyait plus qui encaissait
  const keeper = [kit.keeper, ...KEEPERS].find((c) => !clash(c, ours.shirt) && !clash(c, ours.keeper) && !clash(c, kit.shirt)) ?? kit.keeper;
  return keeper === kit.keeper ? kit : { ...kit, keeper };
}
const KEEPERS = [0x2ecc71, 0xe84393, 0x2980b9, 0x8e44ad, 0xd35400, 0x151515, 0xf2f2f2];

// Les deux tenues d'un match, côté du moteur « home » et « away » (0.8.23 ; 1.0.3 : aussi pour le code couleur du score
// façon télé, à côté du nom de chaque équipe). info : { opp } en solo (notre club, côté « home » du moteur, garde sa
// tenue d'écusson), ou { opp, oppCrest, home, homeCrest, side } pour un match revu de ligue : chaque club à ses couleurs,
// notre club garde toujours les siennes, l'autre change de tenue si les deux se confondent.
export function matchKits(info) {
  const opp = info?.opp || '';
  if (info?.home && info.side === 'away') {
    const away = teamKitOf(opp, info.oppCrest || undefined);
    return { home: matchKitOf(info.home, away, info.homeCrest), away };
  }
  if (info?.home) {
    const home = teamKitOf(info.home, info.homeCrest || undefined);
    return { home, away: matchKitOf(opp, home, info.oppCrest) };
  }
  const home = ourKit();
  return { home, away: matchKitOf(opp, home) };
}
export const kitHex = (c) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
