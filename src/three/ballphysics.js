// Ballon physique des temps forts (1.0.18, chantier du PDG : « le ballon doit avoir une vraie physique »).
// Unités du jeu : 1 = 10 m, y vers le haut, temps en secondes. Ballon de 22 cm, 430 g.
//  - en l'air : pesanteur, frottement de l'air (quadratique, Cd 0,25), effet Magnus (frappe enroulée, frappe brossée),
//    rotation qui s'use ;
//  - au sol : rebonds amortis (herbe : 60 % de la vitesse verticale aux faibles chocs, moins aux forts), glissade puis
//    roulement qui ralentit (résistance de l'herbe + air) ;
//  - montants et barre : chocs sur des cylindres de 12 cm ;
//  - filet : le ballon y entre, freiné avant le fond (1,6 m), puis retombe.
// Le moteur garde la main sur l'issue (but, arrêt, à côté, poteau) : chaque frappe et chaque passe sont résolues
// (solveLaunch) pour arriver au point voulu à l'instant voulu malgré l'air et l'effet. Tout est déterministe.

export const BALL_R = 0.011;
export const G = 0.981; // 9,81 m/s²
const K_DRAG = 0.135; // ½ρ·Cd·A/m, par unité de jeu (0,0135 /m)
const K_MAG = 0.16; // ½ρ·Cl·A/m pour un effet plein (Cl 0,3 : frappe enroulée bien brossée)
const SPIN_DECAY = 0.18; // par seconde (la rotation dure plusieurs secondes)
const ROLL = 0.085; // résistance au roulement sur l'herbe (×g : 0,8 m/s²)
const SKID = 0.38; // glissade après un rebond (×g) avant de rouler
const POST_R = 0.006; // montants et barre : 12 cm de diamètre

export const GOAL = { x: 5.25, half: 0.366, bar: 0.244, depth: 0.16 }; // filet de 1,6 m (celui du stade)

// un état de ballon : position (x, y, z), vitesse (vx, vy, vz), rotation (sx, sy, sz : axe × intensité 0..1)
export function makeBall() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, ground: true };
}

// un pas d'intégration (dt court : 1/240 s au plus) ; renvoie true si le ballon a touché le sol pendant ce pas
export function stepFree(s, dt) {
  const v = Math.hypot(s.vx, s.vy, s.vz);
  let ax = 0, ay = 0, az = 0;
  const air = s.noGround || s.y > 0.0005 || s.vy > 0.02;
  if (air) {
    ay -= G;
    // frottement de l'air
    ax -= K_DRAG * v * s.vx; ay -= K_DRAG * v * s.vy; az -= K_DRAG * v * s.vz;
    // effet Magnus : a = k·|v|·(ŝ × v)
    if (s.sx || s.sy || s.sz) {
      const cx = s.sy * s.vz - s.sz * s.vy;
      const cy = s.sz * s.vx - s.sx * s.vz;
      const cz = s.sx * s.vy - s.sy * s.vx;
      ax += K_MAG * v * cx; ay += K_MAG * v * cy; az += K_MAG * v * cz; // |v|·(ŝ × v) : la norme de ŝ porte l'intensité
    }
    s.vx += ax * dt; s.vy += ay * dt; s.vz += az * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    const k = Math.exp(-SPIN_DECAY * dt);
    s.sx *= k; s.sy *= k; s.sz *= k;
    s.ground = false;
    if (s.y <= 0 && !s.noGround) {
      s.y = 0;
      if (s.vy < -0.035) { // rebond : l'herbe rend moins aux chocs forts
        const vy = -s.vy;
        const e = 0.7 - 0.15 * Math.min(1, vy / 1.2);
        s.vy = vy * e;
        const keep = 1 - Math.min(0.3, 0.12 + vy * 0.18); // le choc freine aussi la vitesse au sol
        s.vx *= keep; s.vz *= keep;
        s.sx *= 0.5; s.sy *= 0.5; s.sz *= 0.5;
      } else { s.vy = 0; s.ground = true; s.skid = 0.12; } // posé : il glisse un instant avant de rouler
      return true;
    }
    return false;
  }
  // au sol : glisse un instant puis roule ; l'herbe et l'air le freinent
  s.y = 0; s.vy = 0; s.ground = true;
  const sp = Math.hypot(s.vx, s.vz);
  if (sp > 0) {
    const dec = (ROLL + (s.skid > 0 ? SKID : 0)) * G + K_DRAG * sp * sp;
    const f = Math.max(0, sp - dec * dt) / sp;
    s.vx *= f; s.vz *= f;
    s.x += s.vx * dt; s.z += s.vz * dt;
  }
  if (s.skid > 0) s.skid -= dt;
  const k = Math.exp(-SPIN_DECAY * 3 * dt);
  s.sx *= k; s.sy *= k; s.sz *= k;
  return true;
}

// trajectoire libre (sans montants ni joueurs) pendant T secondes : position finale
const tmp = makeBall();
export function simulate(start, T, sub = 1 / 240, onStep = null) {
  Object.assign(tmp, start);
  tmp.skid = start.skid || 0;
  tmp.noGround = !!start.noGround;
  let t = 0;
  while (t < T - 1e-9) {
    const h = Math.min(sub, T - t);
    stepFree(tmp, h);
    t += h;
    if (onStep && onStep(tmp, t)) break;
  }
  return tmp;
}

// Résout la vitesse de départ pour que le ballon parti de (x, y, z), avec la rotation donnée, soit en (tx, ty, tz) au
// bout de T secondes (frappe, centre, passe) ; au sol (ground) : roulé tout du long, ty ignoré. Renvoie { vx, vy, vz }.
export function solveLaunch(from, to, T, { spin = [0, 0, 0], ground = false, air = false } = {}) {
  const [tx, ty, tz] = to;
  const T1 = Math.max(0.08, T);
  // première estimation : sans air
  let vx = (tx - from.x) / T1;
  let vz = (tz - from.z) / T1;
  let vy = ground ? 0 : (ty - from.y + 0.5 * G * T1 * T1) / T1;
  if (ground) { // au sol : résistance + air, résolu sur la distance seule
    const d = Math.hypot(tx - from.x, tz - from.z);
    const ux = d > 1e-6 ? (tx - from.x) / d : 1, uz = d > 1e-6 ? (tz - from.z) / d : 0;
    let v0 = d / T1 + 0.5 * ROLL * G * T1;
    for (let it = 0; it < 14; it++) {
      const e = simulate({ x: from.x, y: 0, z: from.z, vx: ux * v0, vy: 0, vz: uz * v0, sx: spin[0], sy: spin[1], sz: spin[2], skid: 0 }, T1);
      const got = (e.x - from.x) * ux + (e.z - from.z) * uz;
      const err = d - got;
      if (Math.abs(err) < 0.0008) break;
      v0 += (err / T1) * 1.15;
      v0 = Math.max(0.02, Math.min(4.5, v0));
    }
    // l'effet éventuel (rare au sol) est ignoré : direction droite vers la cible
    return { vx: ux * v0, vy: 0, vz: uz * v0 };
  }
  // air (1.0.25) : la cible est atteinte en vol, sans rebond avant (sinon le calcul pouvait converger vers un ballon
  // rasant qui rebondit et roule jusqu'au point visé : un « lob » à hauteur de genou)
  for (let it = 0; it < 16; it++) {
    const e = simulate({ x: from.x, y: from.y, z: from.z, vx, vy, vz, sx: spin[0], sy: spin[1], sz: spin[2], skid: 0, noGround: air }, T1);
    const ex = tx - e.x, ey = ty - e.y, ez = tz - e.z;
    if (Math.hypot(ex, ey, ez) < 0.0006) break;
    vx += (ex / T1) * 1.05; vy += (ey / T1) * 1.05; vz += (ez / T1) * 1.05;
  }
  return { vx, vy, vz };
}

// Frappe à vitesse donnée (1.0.25, chantier du PDG : « les centres vont super haut ») : un vrai pied donne une vitesse au
// ballon, le temps de vol en découle. Trajectoire tendue (la branche basse : le temps le plus court pour cette vitesse) ;
// renvoie { vx, vy, vz, T } ; hors de portée à cette vitesse : la trajectoire la plus économe, marquée short. Avant,
// le temps de vol était imposé (souvent celui de la course du receveur) : le centre « attendait » l'attaquant en montant
// à 4-6,5 m.
export function solveBySpeed(from, to, v0, opts = {}) {
  const d = Math.hypot(to[0] - from.x, to[2] - from.z); const h = to[1] - from.y;
  const o = { ...opts, air: opts.ground ? false : (opts.air ?? true) };
  const speed = (T) => { const v = solveLaunch(from, to, T, o); return { v, s: Math.hypot(v.vx, v.vy, v.vz), T }; };
  let lo = Math.max(0.05, d / (v0 * 1.02));
  let hi = Math.max(lo + 0.05, Math.sqrt((2 * Math.hypot(d, h)) / G)); // le temps du lancer le plus économe (sans air)
  let rh = speed(hi);
  if (rh.s > v0) return { ...rh.v, T: hi, short: true };
  const rl = speed(lo);
  if (rl.s <= v0) return { ...rl.v, T: lo };
  for (let k = 0; k < 16 && hi - lo > 0.004; k++) {
    const m = (lo + hi) / 2; const rm = speed(m);
    if (rm.s > v0) lo = m; else { hi = m; rh = rm; }
  }
  return { ...rh.v, T: rh.T };
}

// Chocs avec les montants et la barre d'un but en x = gx (signe : côté), après un pas : renvoie 'post', 'bar' ou null.
// Rebond sur le cylindre (restitution 0,6), le ballon ressort du montant.
export function hitFrame(s, gx) {
  const rr = POST_R + BALL_R;
  // montants : cylindres verticaux en (gx, ±half)
  for (const pz of [-GOAL.half, GOAL.half]) {
    const dx = s.x - gx, dz = s.z - pz;
    const d = Math.hypot(dx, dz);
    if (d < rr && s.y < GOAL.bar + BALL_R) {
      const nx = dx / (d || 1), nz = dz / (d || 1);
      const vn = s.vx * nx + s.vz * nz;
      if (vn < 0) { s.vx -= 1.6 * vn * nx; s.vz -= 1.6 * vn * nz; s.vx *= 0.85; s.vz *= 0.85; }
      s.x = gx + nx * rr; s.z = pz + nz * rr;
      return 'post';
    }
  }
  // barre : cylindre horizontal en (gx, y = bar), z dans le but
  if (Math.abs(s.z) < GOAL.half) {
    const dx = s.x - gx, dy = s.y - GOAL.bar;
    const d = Math.hypot(dx, dy);
    if (d < rr) {
      const nx = dx / (d || 1), ny = dy / (d || 1);
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) { s.vx -= 1.6 * vn * nx; s.vy -= 1.6 * vn * ny; s.vx *= 0.85; s.vz *= 0.9; }
      s.x = gx + nx * rr; s.y = GOAL.bar + ny * rr;
      return 'bar';
    }
  }
  return null;
}

// Dans le filet : le ballon entré dans la cage (au-delà de la ligne en gx) est freiné par les mailles en quelques
// dizaines de centimètres, les côtés et le toit le retiennent, puis il retombe au fond. Renvoie l'enfoncement du filet
// (0..1) pour le gonfler à l'image.
export function stepNet(s, gx, dt) {
  const dir = Math.sign(gx) || 1;
  const depth = (s.x - gx) * dir; // profondeur dans la cage
  // les mailles : un ressort amorti qui ne pousse que vers l'intérieur du terrain, au-delà de 1,2 m de profondeur
  const back = GOAL.depth * 0.6;
  let push = 0;
  if (depth > back) {
    push = depth - back;
    const k = 120, c = 10;
    const vin = s.vx * dir;
    const a = -(k * push + c * Math.max(0, vin));
    s.vx += a * dir * dt;
  }
  // côtés et toit : les mailles amortissent
  if (Math.abs(s.z) > GOAL.half - BALL_R) { s.z = Math.sign(s.z) * (GOAL.half - BALL_R); s.vz *= -0.2; s.vx *= 0.7; }
  if (s.y > GOAL.bar - BALL_R) { s.y = GOAL.bar - BALL_R; s.vy = Math.min(0, s.vy) * 0.2; s.vx *= 0.8; }
  // le filet freine tout mouvement
  const damp = Math.exp(-2.2 * dt);
  s.vx *= damp; s.vz *= damp;
  stepFree(s, dt);
  if ((s.x - gx) * dir > GOAL.depth - BALL_R) { s.x = gx + dir * (GOAL.depth - BALL_R); s.vx = Math.min(0, s.vx * dir) * dir * 0.1; }
  return Math.min(1, push / (GOAL.depth * 0.35));
}
