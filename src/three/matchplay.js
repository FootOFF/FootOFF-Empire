import * as THREE from 'three';
import { Agent, createBallMesh, placeBall } from './motion';
import { createPlayers } from './players';
import { formationOf } from '../game/tactics';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';

// Le match sur la pelouse du stade : notre onze contre le onze adverse, seulement les jours de match.
//  - Avant le coup d'envoi (jour de match, pas encore de direct) : échauffement, chaque équipe dans sa moitié.
//  - En direct : jeu ouvert (conduites, passes, pressing, tacles, interceptions, sans tir), et chaque action du
//    commentaire est jouée au bon moment et du bon côté : l'attaque se construit vers un point de frappe dans les
//    20 derniers mètres, le tireur (celui du commentaire s'il peut y être à temps) frappe, et le tir finit comme dans
//    le commentaire (but, arrêt du gardien souvent en plongeant, à côté, poteau). Le ballon arrive à l'instant où
//    le commentaire affiche l'action ; si la 3D est en retard, le direct l'attend quelques secondes au plus
//    (matchFeed.waitAt). Cartons : faute, carton au-dessus du fautif, expulsé qui sort. But : course de joie du
//    buteur vers le public, ses coéquipiers l'entourent bras levés le temps du bandeau « BUT ! », puis engagement.
//    Les équipes changent de côté à la mi-temps, rentrent aux vestiaires à la pause et au coup de sifflet final.
// Unités du jeu (1 = 10 m), repère du stade : pelouse 10,5 × 6,8, buts en x = ±5,25.

const N = 22;
const GOAL_X = 5.25;
const GOAL_HALF = 0.37; // demi-largeur du but (7,32 m)
const LIM_X = 5.0;
const LIM_Z = 3.15;
const KICK_TIME = 0.6;
const KICK_CONTACT = 0.55;
const GRAVITY = 0.98;
const ROLL_DECEL = 0.15;
const BALL_R = 0.011;
const LEAD = 5.4; // secondes réelles de construction avant l'arrivée du ballon (vitesse normale)
const SLOW = 0.45; // ralenti des derniers mètres d'un but
const SLOW_ZONE = 0.9; // distance au but où le ralenti commence
const KEEPER_LINE = 0.1; // le gardien se tient 1 m devant sa ligne : un arrêt se fait là
const HOLD_MAX = 2.5; // secondes réelles (vitesse normale) pendant lesquelles le commentaire peut attendre la 3D

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const teamOf = (i) => (i < 11 ? 0 : 1);
const slotOf = (i) => i % 11;
const sideTeam = (side) => (side === 'home' ? 0 : 1);

// Schéma de l'avant-match (en %, attaque vers le haut) → repère d'équipe : u vers le but adverse, v en travers.
const anchorsOf = (formation) => formationOf(formation).pitch.map(([x, y]) => [-4.7 + (88 - y) * (6.7 / 73), ((x - 50) / 36) * 2.3]);

export function createMatchScene(parent) {
  const players = createPlayers(parent, N);
  const ballMesh = createBallMesh();
  parent.add(ballMesh);
  const warmBalls = [createBallMesh(), createBallMesh()];
  warmBalls.forEach((m) => parent.add(m));
  const cardMats = { yellow: new THREE.SpriteMaterial({ color: 0xf5d020, depthTest: false }), red: new THREE.SpriteMaterial({ color: 0xe03b2f, depthTest: false }) };
  const card = new THREE.Sprite(cardMats.yellow);
  card.scale.set(0.05, 0.07, 1);
  card.visible = false;
  card.renderOrder = 10;
  parent.add(card);

  const agents = Array.from({ length: N }, () => new Agent(0, 0, 0));
  const S = {
    baseY: 0.006,
    matchDay: false,
    play: 'off', // off | warmup | kickoff | play | celebrate | restart | foul | break | walkoff | gone
    timer: 0,
    now: 0,
    half: 0,
    dir: [1, -1],
    formation: ['433', '433'],
    anchors: [anchorsOf('433'), anchorsOf('433')],
    out: new Array(N).fill(false), // expulsés sortis du terrain
    leaving: new Set(), // expulsés en train de sortir
    kickoffTeam: 0,
    queue: [], // actions à venir (attaques, cartons), recalées à chaque image sur l'horloge du direct
    handled: new WeakSet(),
    seq: null, // attaque en cours
    foul: null, // carton en cours
    restart: null, // remise en jeu (dégagement, coup franc, relance du gardien)
    celebrate: null,
    skipped: 0,
    rewound: 0,
    names: [], // noms de notre onze, poste par poste (un nom qui change : un remplaçant entre)
    hold: null, // le porteur : contrôle, conduite, frappe
    warm: null,
    cardTimer: 0,
    slow: 1, // ralenti (dernier geste d'un but)
  };
  const b = { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, state: 'dead', owner: -1, team: -1, receiver: -1, shot: null, roll: 0, rollAxis: new THREE.Vector3(0, 0, 1), prev: [0, 0] };
  const on = { goal: null, save: null, post: null, miss: null }; // réactions du public

  const active = (i) => !S.out[i] && !S.leaving.has(i);
  const world = (t, u, v) => [u * S.dir[t], v * S.dir[t]];
  const local = (t, x, z) => [x * S.dir[t], z * S.dir[t]];
  const footSpot = (p, ahead = 0.042) => {
    const [fx, fz] = p.forward();
    const [sx, sz] = p.side();
    return [p.x + fx * ahead + sx * 0.012, p.z + fz * ahead + sz * 0.012];
  };
  const teamIdx = (t) => Array.from({ length: 11 }, (_, k) => t * 11 + k);
  const dist = (i, x, z) => Math.hypot(agents[i].x - x, agents[i].z - z);
  const nearestOf = (t, x, z, exclude = -1, keepers = false) => {
    let best = -1, bd = Infinity;
    for (const j of teamIdx(t)) {
      if (j === exclude || !active(j) || (!keepers && slotOf(j) === 0)) continue;
      const d = dist(j, x, z);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };
  const nearestAll = (x, z) => {
    let best = -1, bd = Infinity;
    for (let j = 0; j < N; j++) {
      if (!active(j)) continue;
      const d = dist(j, x, z);
      if (d < bd) { bd = d; best = j; }
    }
    return best;
  };

  // --- Équipes, couleurs, positions -----------------------------------------------------------------------
  function setKits(home, away) {
    for (let k = 0; k < 11; k++) {
      players.setKit(k, k === 0 ? home.keeper : home.shirt);
      players.setKit(11 + k, k === 0 ? away.keeper : away.shirt);
    }
  }
  function setFormation(formation) {
    S.formation[0] = formationOf(formation).id;
    S.anchors[0] = anchorsOf(S.formation[0]);
  }
  // positions d'engagement : chacun dans sa moitié, deux joueurs au rond central pour l'équipe qui engage
  function kickoffSpot(i) {
    const t = teamOf(i);
    const [au, av] = S.anchors[t][slotOf(i)];
    let u = Math.min(-0.25, au * 0.82 - 0.35);
    let v = av;
    if (t === S.kickoffTeam) {
      const strikers = teamIdx(t).filter((j) => active(j)).slice(-2);
      if (i === strikers[1]) { u = -0.02; v = 0.02; }
      else if (i === strikers[0]) { u = -0.45; v = -0.35; }
    } else if (Math.hypot(u, v) < 0.95) { const k = 0.95 / Math.max(0.01, Math.hypot(u, v)); u *= k; v *= k; }
    return world(t, u, v);
  }
  function placeAll(spotFn) { for (let i = 0; i < N; i++) { const [x, z] = spotFn(i); const a = agents[i]; a.x = x; a.z = z; a.vx = a.vz = 0; a.speed = 0; a.h = teamOf(i) === 0 ? (S.dir[0] > 0 ? 0 : Math.PI) : (S.dir[1] > 0 ? 0 : Math.PI); } }

  function give(i, phase = 'control') {
    // le ballon garde sa hauteur : un ballon aérien amorti redescend au pied pendant le contrôle (carrier)
    b.state = 'held'; b.owner = i; b.team = teamOf(i); b.receiver = -1; b.vx = b.vz = b.vy = 0;
    S.hold = { phase, timer: phase === 'control' ? 0.24 : rnd(0.7, 1.6), t: null, held: 0 };
  }
  function deadBall(x, z) { b.state = 'dead'; b.owner = -1; b.x = x; b.z = z; b.y = 0; b.vx = b.vz = b.vy = 0; }

  // --- Frappe et ballon ----------------------------------------------------------------------------------
  function startKick(i, tx, tz, kind, extra = {}) {
    agents[i].kick = 0.001;
    S.hold = { phase: 'kick', tx, tz, kind, ...extra };
  }
  function launch(tx, tz, kind, extra) {
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.max(0.05, Math.hypot(dx, dz));
    let v0;
    b.vy = 0;
    if (kind === 'shot') {
      // Vitesse choisie pour que le ballon ARRIVE à l'instant où le commentaire affiche l'action : au fond des
      // filets quand « BUT ! » s'affiche, dans les gants du gardien pour un arrêt, sur le poteau, au-delà de la
      // ligne pour un tir à côté (ralenti des buts compris). Une frappe imprévue garde une vitesse réaliste.
      const remain = extra.seq ? extra.seq.tAt - S.now : 0;
      // (au plus 36 m/s, une frappe puissante : plus en retard, le commentaire attend le ballon)
      v0 = remain > 0.2 ? clamp(shotPath(extra.outcome, extra.team, d) / remain, 1.5, 3.6) : rnd(2.9, 3.4) + Math.max(0, d - 1.6) * 0.2;
      const T = d / v0;
      b.vy = (extra.height + 0.5 * GRAVITY * T * T) / T;
    } else if (kind === 'long' || d > 3.2) { // passe longue, relance : ballon aérien qui retombe devant le receveur
      const T = 0.7 + d * 0.18;
      b.vy = (GRAVITY * T) / 2;
      v0 = (d * 0.95) / T;
    } else {
      v0 = Math.min(kind === 'fast' ? 2.5 : 2.2, Math.sqrt((kind === 'fast' ? 1.2 : 1.0) ** 2 + 2 * ROLL_DECEL * d));
    }
    b.vx = (dx / d) * v0; b.vz = (dz / d) * v0;
    b.state = kind === 'shot' ? 'shot' : 'pass';
    b.owner = -1;
    b.receiver = extra.receiver ?? -1;
    b.shot = kind === 'shot' ? { outcome: extra.outcome, team: extra.team, tz } : null;
    b.passer = extra.passer ?? -1;
    b.flight = 0;
  }

  // Trajet d'un tir, en « distance à vitesse normale » : jusqu'aux gants du gardien pour un arrêt ; jusqu'à la
  // ligne sinon, les derniers mètres d'un but comptant plus (ralenti). Sert à choisir l'instant de la frappe et
  // sa vitesse, pour que le ballon arrive à l'heure du commentaire.
  function shotPath(outcome, team, d, fromX = b.x, fromZ = b.z) {
    if (outcome === 's') {
      const [bu] = local(team, fromX, fromZ);
      const f = clamp((GOAL_X - KEEPER_LINE - bu) / Math.max(0.05, GOAL_X - bu), 0.2, 1);
      return d * f;
    }
    if (outcome === 'g') { const slow = Math.min(SLOW_ZONE, d); return d - slow + slow / SLOW; }
    return d;
  }
  // Durée d'une passe, de la frappe à la réception, d'après la physique de launch() : ballon aérien qui retombe
  // devant le receveur, ou ballon au sol qui ralentit en roulant.
  function passTime(kind, d) {
    if (kind === 'long' || d > 3.2) return 0.7 + d * 0.18 + 0.1;
    const vEnd = kind === 'fast' ? 1.2 : 1.0;
    const v0 = Math.min(kind === 'fast' ? 2.5 : 2.2, Math.sqrt(vEnd * vEnd + 2 * ROLL_DECEL * d));
    return (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * ROLL_DECEL * d))) / ROLL_DECEL;
  }
  const ARMED = KICK_CONTACT * KICK_TIME; // de l'élan au contact du pied
  // Avance de la frappe sur l'instant du commentaire : armé de la jambe, puis vol du ballon à la vitesse prévue,
  // depuis (x, z) ; kickLead : depuis le tireur s'il a le ballon, sinon depuis son point de frappe.
  function leadFrom(seq, x, z) {
    const [gx, gz] = world(seq.team, GOAL_X, 0);
    return ARMED + shotPath(seq.outcome, seq.team, Math.hypot(gx - x, gz - z), x, z) / seq.v;
  }
  const spotOf = (seq) => world(seq.team, seq.spot[0], seq.spot[1]);
  const kickLead = (seq, i) => (b.owner === i ? leadFrom(seq, agents[i].x, agents[i].z) : leadFrom(seq, ...spotOf(seq)));
  // Distance d'un joueur au point de frappe du tireur (là où arrive la passe décisive)
  const toSpot = (seq, x, z) => { const [sx, sz] = spotOf(seq); return Math.hypot(sx - x, sz - z); };

  // --- Directeur : les actions du commentaire, au bon moment -------------------------------------------------
  // temps réel avant qu'un événement s'affiche dans le commentaire (une pause en cours le repousse d'autant ; un
  // événement déjà affiché est en retard, la pause qui suit ne compte pas)
  const realUntil = (e) => {
    const base = ((e.at - matchFeed.clock) * SEC_PER_MIN) / Math.max(1, matchFeed.speed);
    return base > 0 ? base + (matchFeed.pause || 0) : base;
  };
  const lead = () => LEAD / Math.sqrt(Math.max(1, matchFeed.speed));
  function nameToAgent(side, name) {
    const t = sideTeam(side);
    const names = t === 0 ? matchFeed.homeNames : matchFeed.awayNames;
    const k = names.indexOf(name);
    if (k >= 0 && active(t * 11 + k)) return t * 11 + k;
    const att = teamIdx(t).filter((j) => active(j) && slotOf(j) > 0);
    return att[att.length - 1] ?? t * 11 + 10;
  }
  function scan() {
    for (const e of matchFeed.events) {
      if (S.handled.has(e)) continue;
      if (!['chance', 'goal', 'yellow', 'red', 'injury'].includes(e.type)) continue;
      if (realUntil(e) > Math.max(lead(), 6.2 / Math.sqrt(Math.max(1, matchFeed.speed))) + 0.4) break; // buildUp() compris
      S.handled.add(e);
      if (realUntil(e) < -1) continue; // déjà annoncé depuis longtemps (scène remise en place en cours de jeu) : jamais rejoué
      const t = sideTeam(e.side);
      if (e.type === 'injury') { // blessé : il quitte le terrain à l'instant du commentaire
        S.queue.push({ kind: 'exit', e, team: t, who: nameToAgent(e.side, e.player), started: false });
      } else if (e.type === 'chance' || e.type === 'goal') {
        const shooter = nameToAgent(e.side, e.player);
        const [su, sv] = [rnd(3.5, 4.15), clamp(rnd(-0.9, 0.9), -1.2, 1.2)];
        // v : vitesse prévue de la frappe (u/s), recalculée au contact pour arriver pile à l'heure
        S.queue.push({ kind: 'attack', e, team: t, shooter, outcome: e.type === 'goal' ? 'g' : (e.outcome || 'wide')[0], spot: [su, sv], started: false, passed: false, shot: false, v: rnd(2.8, 3.3) });
      } else {
        S.queue.push({ kind: 'card', e, team: t, offender: nameToAgent(e.side, e.player), color: e.type, started: false, done: false });
      }
    }
  }
  // Des minutes simulées mais pas encore vues ont été reprises (changement à toute minute) : les actions préparées
  // pour des événements disparus sont oubliées ; une frappe déjà lancée pour un événement disparu finit à côté.
  function dropVanished() {
    const live = new Set(matchFeed.events);
    S.queue = S.queue.filter((q) => live.has(q.e) || (q.started && q === S.seq));
    if (S.seq && !live.has(S.seq.e)) { S.seq.outcome = 'w'; S.seq.e = { ...S.seq.e, type: 'chance', outcome: 'wide' }; }
    if (S.foul && !live.has(S.foul.e)) finishItem(S.foul);
    matchFeed.waitAt = -1;
  }
  function director() {
    scan();
    let it = S.queue[0];
    if (it && it.kind === 'exit') { // blessé : sort dès que son commentaire tombe
      it.tAt = S.now + realUntil(it.e);
      if (it.tAt - S.now <= 0.3) { S.leaving.add(it.who); finishItem(it); }
      return;
    }
    // 3D en retard sur le direct (×4, actions rapprochées) : une action déjà annoncée qui n'a pas encore commencé
    // est sautée, sauf un but, pour rattraper le commentaire (jouée après coup, elle le contredirait)
    while (it && !it.started && it.e.type !== 'goal' && realUntil(it.e) < -0.2) { finishItem(it); it = S.queue[0]; }
    if (!it) return;
    it.tAt = S.now + realUntil(it.e);
    // une action qui n'a pas pu aboutir bien après son instant est abandonnée : la suivante reste à l'heure
    if (it.started && !it.shot && !it.contact && it.tAt - S.now < (it.kind === 'attack' ? -1.2 : -1.8)) {
      finishItem(it);
      if (b.state === 'dead' && S.play === 'play') give(nearestAll(b.x, b.z), 'dribble');
      it = S.queue[0];
      if (!it) return;
      it.tAt = S.now + realUntil(it.e);
    }
    if (!it.started) {
      const start = it.kind === 'attack' ? Math.max(lead(), buildUp(it)) : 2.2 / Math.sqrt(Math.max(1, matchFeed.speed));
      if (it.tAt - S.now > start) return;
      it.started = true;
      if (it.kind === 'attack') {
        // point de frappe dans les 20 derniers mètres, à portée de course du tireur avant la frappe. Le tireur
        // nommé par le commentaire, sauf s'il est trop bas pour y arriver à temps : alors le partenaire le mieux
        // placé (les noms ne s'affichent pas sur la pelouse ; une frappe de 40 m, si)
        const avail = Math.max(0, it.tAt - S.now - 1.6); // course possible avant la passe décisive et la frappe
        const reachOf = (j) => local(it.team, agents[j].x, agents[j].z)[0] + avail * 0.6;
        if (reachOf(it.shooter) < 3.0) {
          let best = it.shooter;
          for (const j of teamIdx(it.team)) if (active(j) && slotOf(j) > 0 && reachOf(j) > reachOf(best) + 0.3) best = j;
          it.shooter = best;
        }
        const sh = agents[it.shooter];
        const [, v0] = local(it.team, sh.x, sh.z);
        it.spot = [clamp(Math.min(rnd(3.3, 4.1), reachOf(it.shooter)), 2.2, 4.2), clamp(v0 * 0.5 + rnd(-0.35, 0.35), -1.0, 1.0)];
        S.seq = it; S.foul = null;
      } else { S.foul = it; }
      // ballon arrêté (dégagement, touche) : on relance tout de suite, l'action n'attend pas ; un engagement se
      // joue normalement, sans traîner (update), sauf en accéléré où le temps manque
      if (S.play === 'restart' || (S.play === 'kickoff' && matchFeed.speed > 1)) { S.play = 'play'; if (b.state === 'dead') give(nearestAll(b.x, b.z), 'dribble'); }
    }
    // Le commentaire n'annonce pas ce que la 3D n'a pas encore montré : tant que le ballon n'est pas arrivé (ou la
    // faute pas commise), l'événement attend dans le direct, au plus quelques secondes (matchFeed.js, match.jsx).
    if (it.tAt - S.now < 0.25 && !it.contact && matchFeed.waitAt !== it.e.at) {
      matchFeed.waitAt = it.e.at;
      matchFeed.waitUntil = performance.now() + (HOLD_MAX / Math.sqrt(Math.max(1, matchFeed.speed))) * 1000;
    }
  }
  // Temps qu'il faut pour amener le ballon au tireur et frapper, d'après où est le ballon maintenant : une attaque
  // qui part de loin (ballon dans sa moitié, chez l'adversaire) commence plus tôt, au plus 6,2 s avant.
  function buildUp(it) {
    if (S.play !== 'play' && S.play !== 'restart') return 0;
    const d = toSpot(it, b.x, b.z);
    const ours = b.team === it.team && (b.state === 'held' || b.state === 'pass');
    return Math.min(6.2 / Math.sqrt(Math.max(1, matchFeed.speed)), (ours ? 0.3 : 0.9) + ARMED + passTime(d > 2.6 ? 'long' : 'fast', d) + 0.3 + kickLead(it, it.shooter));
  }
  const release = (it) => { if (matchFeed.waitAt === it.e.at) matchFeed.waitAt = -1; };
  const finishItem = (it) => { release(it); if (S.queue[0] === it) S.queue.shift(); if (S.seq === it) S.seq = null; if (S.foul === it) S.foul = null; };

  // L'équipe qui doit frapper a besoin du ballon à temps : pressing appuyé, puis récupération assurée au plus tard
  // quand il reste juste le temps de servir le tireur ; un tir qui n'est pas parti un peu après l'instant prévu
  // part quand même (le ballon revient au tireur).
  function seqControl() {
    const s = S.seq;
    if (!s || s.shot) return;
    const left = s.tAt - S.now - kickLead(s, s.shooter); // temps restant avant la frappe
    const ours = b.state === 'held' && b.team === s.team;
    const theirPass = b.state === 'pass' && b.passer >= 0 && teamOf(b.passer) !== s.team && b.y < 0.05;
    if (!ours && (b.state === 'held' || b.state === 'loose' || b.state === 'dead' || theirPass)) {
      const j = nearestOf(s.team, b.x, b.z);
      const far = j >= 0 ? toSpot(s, agents[j].x, agents[j].z) : 0;
      const serve = j === s.shooter ? 0.3 : 0.45 + ARMED + passTime(far > 2.6 ? 'long' : 'fast', far); // comme carrier()
      if (j >= 0 && (left < serve || dist(j, b.x, b.z) < 0.06)) give(j, 'dribble');
    }
    if (left < -0.25 && b.owner !== s.shooter && b.state !== 'pass') give(s.shooter, 'dribble');
  }

  // --- Porteur du ballon -------------------------------------------------------------------------------------
  function choosePass(i, { recycle = false, prefer = -1 } = {}) {
    const t = teamOf(i);
    const [pu] = local(t, agents[i].x, agents[i].z);
    let best = -1, bs = -Infinity;
    for (const j of teamIdx(t)) {
      if (j === i || !active(j)) continue;
      const d = dist(j, agents[i].x, agents[i].z);
      if (d < 0.5 || d > 3.6) continue;
      const [ju] = local(t, agents[j].x, agents[j].z);
      let open = Infinity;
      for (const o of teamIdx(1 - t)) if (active(o)) open = Math.min(open, dist(o, agents[j].x, agents[j].z));
      let s = (recycle ? -(ju - pu) * 0.6 : (ju - pu) * 0.8) + Math.min(open, 1) * 2 + rnd(0, 0.8);
      if (slotOf(j) === 0) s -= recycle ? 0.5 : 2.5;
      if (j === prefer) s += 3;
      if (s > bs) { bs = s; best = j; }
    }
    return best;
  }
  function passTo(i, j, kind = 'pass', target = null) {
    const r = agents[j];
    const d = Math.hypot(r.x - agents[i].x, r.z - agents[i].z);
    const T = passTime(kind, d) + ARMED; // armé de la frappe, puis vol
    let [tx, tz] = target || [r.x + r.vx * T, r.z + r.vz * T];
    tx = clamp(tx, -LIM_X, LIM_X); tz = clamp(tz, -LIM_Z, LIM_Z);
    startKick(i, tx, tz, kind, { receiver: j });
  }
  function carrier(dt) {
    const i = b.owner;
    const p = agents[i];
    const t = teamOf(i);
    const h = S.hold;
    h.held = (h.held || 0) + dt;
    const seq = S.seq && S.seq.team === t && !S.seq.shot ? S.seq : null;
    if (h.phase === 'kick') {
      p.steer(p.x, p.z, 0, dt, h.tx, h.tz);
      const [sx, sz] = footSpot(p);
      b.x += (sx - b.x) * Math.min(1, dt * 12); b.z += (sz - b.z) * Math.min(1, dt * 12);
      if (p.kick >= KICK_CONTACT || p.kick === 0) {
        launch(h.tx, h.tz, h.kind, { ...h, passer: i });
        S.hold = null;
      }
      return;
    }
    if (h.phase === 'keep') { // gardien : ballon dans les mains (au bout des bras s'il a plongé), puis relance
      const down = Math.abs(p.lean) > 0.25; // encore au sol après un plongeon : il se relève avant de relancer
      if (down) { p.vx = p.vz = 0; p.speed = 0; } else p.steer(p.x + S.dir[t] * 0.15, p.z * 0.9, 0.12, dt);
      b.x = p.x + Math.cos(p.h) * 0.02; b.z = p.z + Math.sin(p.h) * 0.02 + p.lean * 0.11; b.y = 0.09 * (1 - Math.abs(p.lean) * 0.55);
      if (seq && h.timer > 0.35) h.timer = 0.35; // une action de son équipe arrive : le gardien relance vite
      if (down) h.timer = Math.max(h.timer, 0.25);
      if ((h.timer -= dt) <= 0) {
        b.y = 0;
        if (seq) { // contre-attaque : relance longue vers le point de frappe du tireur si le temps presse
          const d = toSpot(seq, p.x, p.z);
          if (seq.tAt - S.now <= passTime('long', d) + ARMED + 0.12 + kickLead(seq, seq.shooter) + 0.6) {
            seq.passed = true;
            passTo(i, seq.shooter, 'long', spotOf(seq));
            return;
          }
        }
        let j = choosePass(i, seq ? { prefer: seq.shooter } : {});
        if (j < 0) j = nearestOf(t, p.x, p.z, i);
        if (j >= 0) passTo(i, j, dist(j, p.x, p.z) > 2.2 ? 'long' : 'pass');
        else give(i, 'dribble');
      }
      return;
    }
    const [sx, sz] = footSpot(p, h.phase === 'dribble' ? 0.04 + 0.03 * Math.abs(Math.sin(p.phase * 0.5)) : 0.042);
    b.x += (sx - b.x) * Math.min(1, dt * 12); b.z += (sz - b.z) * Math.min(1, dt * 12);
    b.y = Math.max(0, b.y - dt * 1.2); // ballon amorti (poitrine, cuisse) qui redescend au pied
    if (h.phase === 'control') {
      p.steer(p.x, p.z, 0, dt, p.x + Math.cos(p.h), p.z + Math.sin(p.h));
      if ((h.timer -= dt) <= 0) S.hold = { phase: 'dribble', timer: rnd(0.6, 1.4), held: h.held };
      return;
    }
    // conduite
    const [pu, pv] = local(t, p.x, p.z);
    let tu, tv;
    if (seq) {
      const left = seq.tAt - S.now;
      if (i === seq.shooter) {
        // le tireur fonce vers le but (conduite rapide de loin) et frappe à l'heure ; trop loin (plus de 23 m), il
        // s'approche encore jusqu'à une seconde de plus : le commentaire attend le ballon (director). Ballon reçu
        // très bas (plus de 30 m) avec du temps devant lui : il le remet à un partenaire et file vers son point de
        // frappe, où la passe décisive lui revient.
        const dGoal = Math.hypot(...world(t, GOAL_X, 0).map((g, k) => g - (k ? p.z : p.x)));
        if (dGoal > 3.0 && !seq.laid && h.held > 0.2) {
          const j = nearestOf(t, p.x, p.z, i);
          if (j >= 0) {
            const dj = dist(j, p.x, p.z), dS = toSpot(seq, agents[j].x, agents[j].z);
            const back = ARMED + passTime('pass', dj) + 0.45 + ARMED + passTime(dS > 2.6 ? 'long' : 'fast', dS) + 0.12 + leadFrom(seq, ...spotOf(seq));
            if (left > back) { seq.laid = true; passTo(i, j, 'pass'); return; }
          }
        }
        tu = Math.min(pu + 0.35, GOAL_X - 0.95); tv = pv * 0.9;
        const [wx, wz] = world(t, tu, tv);
        p.steer(wx, wz, 0.32 + 0.24 * clamp((dGoal - 1.6) / 1.6, 0, 1), dt);
        const early = left - kickLead(seq, i);
        if (early <= 0.02 && (dGoal < 2.3 || early < -1)) shoot(i, seq);
        return;
      }
      tu = pu + 0.6; tv = pv + (seq.spot[1] - pv) * 0.2;
      const [wx, wz] = world(t, clamp(tu, -4.5, 4.3), clamp(tv, -3, 3));
      p.steer(wx, wz, 0.48, dt);
      const d = toSpot(seq, p.x, p.z);
      const longWay = d > 2.6; // ballon loin de la surface : transversale ou passe en profondeur aérienne
      // la passe part juste à temps : vol du ballon, puis frappe immédiate du tireur (armé de la jambe compris)
      const passAt = passTime(longWay ? 'long' : 'fast', d) + ARMED + 0.12 + kickLead(seq, seq.shooter);
      if (!seq.passed && h.held > 0.15 && left <= passAt + 0.1) {
        seq.passed = true;
        // au point de frappe si le tireur y sera à l'arrivée du ballon, sinon sur sa course vers ce point, là où
        // il sera (jamais dans ses pieds, loin du but)
        const sh = agents[seq.shooter];
        const T = passTime(longWay ? 'long' : 'fast', d) + ARMED;
        const [sx, sz] = spotOf(seq);
        const run = Math.hypot(sx - sh.x, sz - sh.z);
        const k = run > 1e-3 ? Math.min(1, (0.62 * T) / run) : 1;
        passTo(i, seq.shooter, longWay ? 'long' : 'fast', [sh.x + (sx - sh.x) * k, sh.z + (sz - sh.z) * k]);
      } else if (!seq.passed && h.held > 0.9 && left > passAt + 1.0) { // une passe vers l'avant pour faire progresser
        const j = choosePass(i, { prefer: seq.shooter });
        if (j >= 0 && j !== seq.shooter) {
          // seulement si le relais aura encore le temps de servir le tireur (réception, contrôle, passe, frappe)
          const dj = dist(j, p.x, p.z);
          const dS = toSpot(seq, agents[j].x, agents[j].z);
          const relay = ARMED + passTime('pass', dj) + 0.45 + passTime(dS > 2.6 ? 'long' : 'fast', dS) + ARMED + 0.12 + kickLead(seq, seq.shooter);
          if (left > relay) passTo(i, j, 'pass');
        }
      }
      return;
    }
    const f = S.foul && !S.foul.contact && S.foul.team !== t ? S.foul : null;
    if (f) { // un adversaire va commettre la faute : le porteur garde le ballon et file droit sur lui
      const o = agents[f.offender];
      p.steer(o.x, o.z, 0.36, dt);
      return;
    }
    const finalThird = pu > 3.0;
    tu = finalThird ? pu - 0.2 : pu + 0.5;
    tv = pv + Math.sin(S.now * 0.7 + i) * 0.3;
    const [wx, wz] = world(t, clamp(tu, -4.6, 4.3), clamp(tv, -3, 3));
    p.steer(wx, wz, slotOf(i) === 0 ? 0.2 : 0.34, dt);
    if ((h.timer -= dt) <= 0 || (finalThird && h.held > 0.6)) {
      const j = choosePass(i, { recycle: finalThird });
      if (j >= 0) passTo(i, j, dist(j, p.x, p.z) > 3 ? 'long' : 'pass');
      else S.hold = { phase: 'dribble', timer: rnd(0.4, 0.9), held: h.held };
    }
  }
  function shoot(i, seq) {
    if (seq.shot) return;
    seq.shot = true;
    const t = seq.team;
    const keeper = (1 - t) * 11;
    const kz = agents[keeper].z * S.dir[t];
    let v;
    let height = rnd(0.02, 0.14);
    if (seq.outcome === 'g') v = (kz > 0 ? -1 : 1) * rnd(0.16, 0.31);
    else if (seq.outcome === 's') v = clamp(kz + (Math.random() < 0.5 ? -1 : 1) * rnd(0.02, 0.2), -0.32, 0.32); // à portée du gardien, souvent en plongeant
    else if (seq.outcome === 'p') { v = (Math.random() < 0.5 ? -1 : 1) * GOAL_HALF; height = rnd(0.03, 0.18); }
    else { v = (Math.random() < 0.5 ? -1 : 1) * rnd(0.55, 1.0); height = rnd(0.02, 0.25); }
    const [tx, tz] = world(t, GOAL_X + 0.02, v);
    startKick(i, tx, tz, 'shot', { outcome: seq.outcome, team: t, height, seq });

  }

  // --- Ballon libre ----------------------------------------------------------------------------------------
  function ballPhysics(dt) {
    b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    if (b.y > 0) b.vy -= GRAVITY * dt;
    else {
      b.y = 0;
      if (b.vy < -0.06) { b.vy = -b.vy * 0.32; b.vx *= 0.55; b.vz *= 0.55; } else b.vy = 0;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const f = Math.max(0, sp - (b.state === 'net' ? 1.6 : ROLL_DECEL) * dt) / sp; b.vx *= f; b.vz *= f; }
    }
  }
  // distance d'un point au trajet du ballon pendant l'image (un ballon rapide ne « traverse » pas un joueur)
  function segDist(px, pz, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = dx * dx + dz * dz;
    const t = L > 1e-9 ? clamp(((px - x0) * dx + (pz - z0) * dz) / L, 0, 1) : 0;
    return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
  }
  function freeBall(dt) {
    const x0 = b.x, z0 = b.z;
    ballPhysics(dt);
    b.flight = (b.flight || 0) + dt;
    if (b.state === 'pass' && b.flight > 2.4) { b.state = 'loose'; b.receiver = -1; } // passe que personne n'a pu atteindre
    const sp = Math.hypot(b.vx, b.vz);
    if (b.state === 'shot') return shotFlight(x0, z0);
    if (b.state === 'net') {
      const t = b.shot?.team ?? 0;
      const gx = S.dir[t] * (GOAL_X + 0.16);
      if (Math.abs(b.x) > Math.abs(gx)) { b.x = gx; b.vx = 0; }
      if (Math.abs(b.z) > GOAL_HALF - 0.02) { b.z = Math.sign(b.z) * (GOAL_HALF - 0.02); b.vz = 0; }
      if (b.y > 0.2) { b.y = 0.2; b.vy = 0; }
      return;
    }
    // passe ou ballon libre : réception par le receveur (un ballon aérien qui redescend s'amortit de la poitrine),
    // interception par un adversaire tout proche (ballon au sol)
    if (b.y < 0.15) {
      for (let j = 0; j < N; j++) {
        if (!active(j) || j === b.passer) continue;
        if (b.y > 0.05 && !(j === b.receiver && b.vy <= 0)) continue;
        const a = agents[j];
        const [fx, fz] = a.forward();
        if (segDist(a.x + fx * 0.03, a.z + fz * 0.03, x0, z0, b.x, b.z) > (j === b.receiver ? 0.07 : 0.05)) continue;
        const intended = j === b.receiver;
        const sameTeam = b.passer >= 0 && teamOf(j) === teamOf(b.passer);
        const protectedPass = S.seq && b.passer >= 0 && teamOf(b.passer) === S.seq.team;
        if (intended || b.state === 'loose' || sp < 0.35 || (!sameTeam && !protectedPass && Math.random() < 0.16)) {
          give(j, S.seq && !S.seq.shot && j === S.seq.shooter ? 'dribble' : 'control'); // le tireur frappe sans contrôle
          return;
        }
      }
    }
    if (b.state === 'pass' && sp < 0.06) b.state = 'loose';
    if (Math.abs(b.x) > LIM_X + 0.3 || Math.abs(b.z) > LIM_Z + 0.3) { // sorti : remise en jeu de l'autre équipe
      const t = b.passer >= 0 ? 1 - teamOf(b.passer) : 0;
      deadBall(clamp(b.x, -LIM_X, LIM_X), clamp(b.z, -LIM_Z, LIM_Z));
      S.restart = { team: t, timer: 0.9, kind: 'throw' };
      S.play = 'restart';
    }
  }
  function shotFlight(x0, z0) {
    const { outcome, team } = b.shot;
    const dirT = S.dir[team];
    if (outcome === 'g' && GOAL_X - b.x * dirT < SLOW_ZONE) S.slow = SLOW; // ralenti : le ballon file au fond des filets
    const keeper = (1 - team) * 11;
    const kp = agents[keeper];
    // arrêt : le gardien se jette sur la trajectoire et capte le ballon ; au plus tard quand le ballon atteint sa
    // ligne (un arrêt annoncé par le commentaire n'est jamais un tir à côté), en plongeant vers lui
    const [bu1] = local(team, b.x, b.z);
    if (outcome === 's' && ((segDist(kp.x, kp.z, x0, z0, b.x, b.z) < 0.1 && b.y < 0.22) || bu1 >= GOAL_X - KEEPER_LINE)) {
      kp.z += clamp(b.z - kp.z - kp.lean * 0.11, -0.04, 0.04); // dernier ajustement
      kp.leanTo = clamp((b.z - kp.z) / 0.11, -1, 1); // plongeon du côté du ballon : les gants vont au ballon
      kp.leanHold = 0.7;
      b.vx = b.vz = b.vy = 0;
      give(keeper, 'keep');
      S.hold.timer = 1.1;
      on.save?.(team);
      endSeq();
      return;
    }
    if (b.x * dirT >= GOAL_X) {
      const inFrame = Math.abs(b.z) < GOAL_HALF - 0.01 && b.y < 0.24;
      if (outcome === 'p') { // poteau : le ballon revient en jeu
        b.x = dirT * (GOAL_X - 0.01);
        b.vx = -b.vx * 0.42; b.vz = rnd(-0.5, 0.5); b.vy = Math.abs(b.vy) * 0.3;
        b.state = 'loose'; b.passer = -1;
        on.post?.(team);
        endSeq();
      } else if (outcome === 'g' && inFrame) { // but
        b.state = 'net';
        b.vx *= 0.3; b.vz *= 0.3;
        S.slow = 1;
        startCelebration(team);
      } else { // à côté (ou arrêt manqué) : dégagement aux six mètres
        on.miss?.(team);
        deadBall(dirT * (GOAL_X - 0.55), 0);
        S.restart = { team: 1 - team, timer: 1.1, kind: 'goalkick' };
        S.play = 'restart';
        endSeq();
      }
    } else if (Math.hypot(b.vx, b.vz) < 0.1 || b.flight > 2.6) { b.state = 'loose'; b.shot = null; endSeq(); }
  }
  function endSeq() { if (S.seq && S.seq.shot) finishItem(S.seq); }

  // --- Phases arrêtées -------------------------------------------------------------------------------------
  function startCelebration(team) {
    const scorer = S.seq ? S.seq.shooter : nearestOf(team, b.x, b.z);
    const sc = agents[scorer];
    const [, sv] = local(team, sc.x, sc.z);
    // course de joie vers le poteau de corner le plus proche (au plus 18 m : elle tient dans la pause du direct)
    const [fx, fz] = world(team, 4.95, (sv >= 0 ? 1 : -1) * 3.05);
    const d = Math.hypot(fx - sc.x, fz - sc.z);
    const k = d > 1.8 ? 1.8 / d : 1;
    S.celebrate = { team, scorer, corner: [sc.x + (fx - sc.x) * k, sc.z + (fz - sc.z) * k], fans: [fx * 1.15, fz * 1.25], t: 0 };
    S.play = 'celebrate';
    on.goal?.(team);
    if (S.seq) finishItem(S.seq);
  }
  function setKickoff(team) {
    S.kickoffTeam = team;
    S.play = 'kickoff';
    S.timer = 0;
    S.hold = null;
    deadBall(0, 0);
  }
  function restartUpdate(dt) {
    const r = S.restart;
    const t = r.team;
    if (r.taker === undefined || !active(r.taker)) r.taker = r.kind === 'goalkick' ? t * 11 : nearestOf(t, b.x, b.z);
    const taker = r.taker;
    if (taker < 0) { S.play = 'play'; return; }
    const p = agents[taker];
    const [fx, fz] = [b.x - S.dir[t] * 0.04, b.z];
    p.steer(fx, fz, 0.45, dt, b.x + S.dir[t], b.z);
    if ((r.timer -= dt) <= 0 && Math.hypot(p.x - fx, p.z - fz) < 0.06) {
      give(taker, 'dribble');
      const j = choosePass(taker, {});
      if (j >= 0) passTo(taker, j, r.kind === 'goalkick' ? 'long' : 'pass');
      S.restart = null;
      S.play = 'play';
    }
  }
  function foulUpdate(dt) {
    const f = S.foul;
    const off = agents[f.offender];
    if (!f.contact) {
      // le fautif fonce sur le porteur adverse ; sans porteur adverse, le joueur adverse le plus proche du ballon le
      // récupère (une passe adverse en vol est d'abord reçue)
      const theirPass = b.state === 'pass' && b.team !== f.team;
      if (!(b.state === 'held' && b.team !== f.team) && !theirPass) {
        const j = nearestOf(1 - f.team, b.x, b.z);
        if (j >= 0) give(j, 'dribble');
      }
      const c = b.state === 'held' ? agents[b.owner] : b;
      off.steer(c.x, c.z, 0.8, dt);
      // au plus tard un peu après l'heure du commentaire, qui attend la faute (director)
      if (f.tAt - S.now < 0.05) f.late = (f.late || 0) + dt;
      if (b.state === 'held' && (Math.hypot(off.x - c.x, off.z - c.z) < 0.05 || f.late > 0.8 / Math.sqrt(Math.max(1, matchFeed.speed)))) {
        f.contact = true;
        release(f); // la faute est commise : le carton peut s'afficher
        f.victim = b.owner;
        f.timer = 2.0 / Math.sqrt(Math.max(1, matchFeed.speed)); // arrêt de jeu, carton brandi
        deadBall(b.x, b.z);
        card.material = cardMats[f.color === 'red' ? 'red' : 'yellow'];
        S.cardTimer = 2.2;
        S.cardOf = f.offender;
        if (f.color === 'red') S.leaving.add(f.offender);
      }
      return false;
    }
    if ((f.timer -= dt) <= 0) {
      S.restart = { team: 1 - f.team, timer: 0.2, kind: 'free' };
      S.play = 'restart';
      finishItem(f);
    }
    return true;
  }

  // --- Sans le ballon ----------------------------------------------------------------------------------------
  function offBall(i, dt, stopped) {
    const a = agents[i];
    const t = teamOf(i);
    const k = slotOf(i);
    const [bu, bv] = local(t, b.x, b.z);
    if (S.leaving.has(i)) { // expulsé : sort par la ligne de touche la plus proche
      const tz = Math.sign(a.z || 1) * 3.75;
      a.steer(a.x, tz, 0.16, dt);
      if (Math.abs(a.z - tz) < 0.05) { S.leaving.delete(i); S.out[i] = true; }
      return;
    }
    if (k === 0) { // gardien : sur sa ligne, suit le ballon ; plonge sur un tir qui arrive
      const own = -GOAL_X * S.dir[t];
      let tz = clamp(b.z * 0.2, -0.28, 0.28);
      let speed = 0.25;
      if (b.state === 'shot' && b.shot && b.shot.team !== t) {
        const T = Math.abs(own - b.x) / Math.max(0.3, Math.abs(b.vx));
        const zAt = b.z + b.vz * T;
        const o = b.shot.outcome;
        if (o === 's') { tz = clamp(zAt, -0.36, 0.36); speed = 0.4; } // pas chassés, puis plongeon
        else if (o === 'g') { tz = clamp(-zAt * 0.6, -0.3, 0.3); speed = 0.7; } // plonge du mauvais côté
        else { tz = clamp(zAt, -0.36, 0.36); speed = 0.6; }
        if (T < 0.45) { // plongeon dans les derniers instants
          a.leanTo = o === 'g' ? -Math.sign(zAt - a.z || 1) * 0.95 : clamp((zAt - a.z) / 0.12, -1, 1) * (o === 's' ? 1 : 0.6);
          a.leanHold = 0.6;
        }
      }
      // toujours face au jeu : au ballon, ou pendant un tir à d'où il vient (le plongeon reste de côté, face au
      // tireur, même quand le ballon passe à sa hauteur)
      const shot = b.state === 'shot' && b.shot && b.shot.team !== t;
      a.steer(own + S.dir[t] * 0.1, tz, speed, dt, shot ? b.x - b.vx * 0.6 : b.x, shot ? b.z - b.vz * 0.6 : b.z, true);
      return;
    }
    if (stopped) { // arrêt de jeu : chacun reprend calmement sa place
      const [u, v] = S.anchors[t][k];
      const [wx, wz] = world(t, u + clamp(bu * 0.4, -1, 1), v * 0.95 + bv * 0.1);
      a.steer(wx, wz, 0.14, dt, b.x, b.z);
      return;
    }
    if (b.state === 'pass' && i === b.receiver) { // le receveur va au-devant du ballon
      const sp = Math.hypot(b.vx, b.vz);
      let tx = b.x, tz = b.z;
      if (b.y > 0.02 && b.vy !== 0) { // ballon aérien : là où il retombe
        const T = (b.vy + Math.sqrt(b.vy * b.vy + 2 * GRAVITY * b.y)) / GRAVITY;
        tx = b.x + b.vx * T; tz = b.z + b.vz * T;
      } else if (sp > 0.25) {
        const tt = Math.max(0, ((a.x - b.x) * b.vx + (a.z - b.z) * b.vz) / (sp * sp));
        tx = b.x + b.vx * tt; tz = b.z + b.vz * tt;
      }
      a.steer(tx, tz, 0.6, dt, b.x, b.z);
      return;
    }
    const seq = S.seq && !S.seq.shot ? S.seq : null;
    if (seq && i === seq.shooter && b.owner !== i) { // le tireur file vers son point de frappe (appel de balle)
      const [wx, wz] = spotOf(seq);
      a.steer(wx, wz, Math.hypot(wx - a.x, wz - a.z) > 0.5 ? 0.7 : 0.45, dt, b.x, b.z);
      return;
    }
    const attacking = b.team === t && b.state !== 'loose';
    if (b.state === 'loose' && i === nearestOf(t, b.x, b.z)) { a.steer(b.x, b.z, 0.62, dt); return; }
    if (b.state === 'held' && !attacking) { // pressing : le plus proche harcèle, le deuxième ferme l'axe
      const carrierProtected = S.seq && S.seq.team !== t && !S.seq.shot;
      const p1 = nearestOf(t, b.x, b.z);
      if (i === p1) {
        const rush = S.seq && S.seq.team === t && !S.seq.shot; // l'équipe qui va frapper récupère vite le ballon
        a.steer(b.x, b.z, carrierProtected ? 0.3 : rush ? 0.62 : 0.46, dt, b.x, b.z);
        tackle(i, dt, carrierProtected, rush);
        return;
      }
    }
    const [au, av] = S.anchors[t][k];
    let u, v;
    if (attacking) { u = au + clamp(bu * 0.55 + 1.15, -0.3, 2.6); v = av * 1.05 + (bv - av) * 0.12; }
    else { u = au + clamp(bu * 0.5 - 0.45, -1.3, 1.3); v = av * 0.8 + bv * 0.22; }
    u += Math.sin(S.now * 0.31 + i * 1.7) * 0.18;
    v += Math.cos(S.now * 0.27 + i) * 0.16;
    const [wx, wz] = world(t, clamp(u, -4.8, 4.7), clamp(v, -3.05, 3.05));
    const far = Math.hypot(wx - a.x, wz - a.z) > 0.5;
    a.steer(wx, wz, far ? 0.4 : 0.18, dt, b.x, b.z);
  }
  // tacle : au contact du porteur, le défenseur peut chiper le ballon (jamais pendant une action du commentaire)
  function tackle(i, dt, protectedCarrier, rush = false) {
    if (protectedCarrier || S.foul || b.state !== 'held') return;
    const c = agents[b.owner];
    if (Math.hypot(agents[i].x - c.x, agents[i].z - c.z) < 0.055) {
      S.pressT = (S.pressT || 0) + dt;
      if (S.pressT > (rush ? 0.1 : 0.35) && Math.random() < dt * (rush ? 8 : 1.4)) {
        S.pressT = 0;
        c.vx *= 0.2; c.vz *= 0.2;
        give(i, 'control');
      }
    } else S.pressT = 0;
  }

  // --- Échauffement ------------------------------------------------------------------------------------------
  function warmupSetup() {
    S.warm = [0, 1].map((t) => ({ from: t * 11 + 1, to: t * 11 + 2, timer: 0.5, x: 0, z: 0, flight: 0, sx: 0, sz: 0 }));
  }
  function warmupUpdate(dt) {
    for (let i = 0; i < N; i++) {
      const t = teamOf(i);
      const k = slotOf(i);
      const a = agents[i];
      if (k === 0) { // gardien : pas chassés sur sa ligne
        const own = -GOAL_X * S.dir[t];
        a.steer(own + S.dir[t] * 0.1, Math.sin(S.now * 0.8 + t) * 0.25, 0.18, dt, 0, 0);
        continue;
      }
      const ang = ((k - 1) / 10) * Math.PI * 2 + S.now * 0.05;
      const [wx, wz] = world(t, -2.3 + Math.cos(ang) * 1.05, Math.sin(ang) * 1.05);
      const w = S.warm[t];
      const busy = i === w.from && w.flight === 0;
      if (!busy) a.steer(wx, wz, 0.2, dt, ...world(t, -2.3, 0));
    }
    S.warm.forEach((w, t) => {
      const from = agents[w.from];
      const to = agents[w.to];
      if (w.flight === 0) { // le passeur contrôle, s'oriente, frappe
        const [sx, sz] = footSpot(from);
        w.x += (sx - w.x) * Math.min(1, dt * 10); w.z += (sz - w.z) * Math.min(1, dt * 10);
        from.steer(from.x, from.z, 0, dt, to.x, to.z);
        if ((w.timer -= dt) <= 0 && from.kick === 0) from.kick = 0.001;
        if (from.kick >= KICK_CONTACT) { w.flight = 0.001; w.sx = w.x; w.sz = w.z; w.dur = Math.hypot(to.x - w.x, to.z - w.z) / 0.9; }
      } else {
        w.flight += dt / Math.max(0.3, w.dur);
        const f = Math.min(1, w.flight);
        const [tx, tz] = footSpot(to);
        w.x = w.sx + (tx - w.sx) * f; w.z = w.sz + (tz - w.sz) * f;
        to.steer(to.x, to.z, 0, dt, w.x, w.z);
        if (f >= 1) {
          w.from = w.to;
          let next;
          do next = t * 11 + 1 + Math.floor(Math.random() * 10); while (next === w.from);
          w.to = next; w.flight = 0; w.timer = rnd(0.35, 0.9);
        }
      }
      warmBalls[t].visible = true;
      placeBall(warmBalls[t], { x: w.x, z: w.z, y: 0, roll: 0 }, S.baseY);
    });
  }

  // --- Mise en scène générale ----------------------------------------------------------------------------------
  function setupHalf(half) {
    S.half = half;
    S.dir = half === 2 ? [-1, 1] : [1, -1];
    S.queue = [];
    S.handled = new WeakSet();
    S.seq = S.foul = S.restart = S.celebrate = null;
    matchFeed.waitAt = -1;
    if (half === 1) { S.out.fill(false); S.leaving.clear(); }
    // changements de la pause : un blessé remplacé rend sa place à l'entrant
    for (let k = 0; k < 11; k++) if (half === 2 && S.names[k] !== undefined && matchFeed.homeNames[k] !== S.names[k]) { S.out[k] = false; S.leaving.delete(k); }
    S.names = [...matchFeed.homeNames];
    setFormation(matchFeed.formation);
    setKickoff(half === 1 ? 0 : 1);
    placeAll(kickoffSpot);
  }
  function wantedPhase() {
    if (!S.matchDay) return 'off';
    if (matchFeed.active) {
      if (matchFeed.phase === 'halftime') return 'break';
      if (matchFeed.phase === 'fulltime') return 'walkoff';
      return 'live';
    }
    if (matchFeed.ended) return S.play === 'walkoff' ? 'walkoff' : 'gone';
    return 'warmup';
  }
  function syncPhase() {
    const want = wantedPhase();
    if (want === 'off' || want === 'gone') { S.play = want; return; }
    if (want === 'warmup') {
      if (S.play !== 'warmup') { S.play = 'warmup'; S.dir = [1, -1]; setFormation(S.formation[0]); warmupSetup(); placeAll((i) => world(teamOf(i), slotOf(i) === 0 ? -5.1 : -2.3 + Math.cos(i) * 1.05, slotOf(i) === 0 ? 0 : Math.sin(i) * 1.05)); }
      return;
    }
    if (want === 'break' || want === 'walkoff') {
      if (S.play !== want) { S.play = want; S.seq = S.foul = null; S.queue = []; matchFeed.waitAt = -1; deadBall(0, 0); }
      return;
    }
    // direct
    if (matchFeed.half !== S.half || ['off', 'gone', 'warmup', 'break', 'walkoff'].includes(S.play)) setupHalf(matchFeed.half);
    if (matchFeed.skipped !== S.skipped) { S.skipped = matchFeed.skipped; S.queue = []; S.seq = S.foul = null; matchFeed.waitAt = -1; }
    if (matchFeed.rewound !== S.rewound) { S.rewound = matchFeed.rewound; dropVanished(); }
    // changement : un autre nom sur un poste du onze, c'est un remplaçant qui entre par la touche (à la place d'un
    // joueur sorti, blessé ou remplacé)
    for (let k = 0; k < 11; k++) {
      const name = matchFeed.homeNames[k];
      if (name === S.names[k]) continue;
      if (S.names[k] !== undefined && (S.out[k] || S.leaving.has(k) || name)) {
        S.leaving.delete(k);
        S.out[k] = false;
        agents[k].x = clamp(agents[k].x, -3, 3);
        agents[k].z = Math.sign(agents[k].z || 1) * 3.72;
        agents[k].vx = agents[k].vz = 0;
      }
      S.names[k] = name;
    }
  }

  function walkTo(tx, tz, dt, speed) {
    for (let i = 0; i < N; i++) if (active(i)) agents[i].steer(tx + (slotOf(i) - 5) * 0.06 * (teamOf(i) ? 1 : -1), tz, speed, dt);
  }

  function update(dtReal, time) {
    // changement en cours (matchFeed.hold) : le match est en pause, l'image se fige (joueurs, ballon, carton) ;
    // le décor (public, ciel) continue de vivre autour
    if (matchFeed.hold && S.play !== 'off' && S.play !== 'gone') dtReal = 0;
    const dt = Math.min(dtReal, 0.05) * S.slow;
    S.now += Math.min(dtReal, 0.05);
    syncPhase();
    const visible = S.play !== 'off' && S.play !== 'gone';
    ballMesh.visible = visible && S.play !== 'warmup' && S.play !== 'break' && S.play !== 'walkoff';
    warmBalls.forEach((m) => { m.visible = S.play === 'warmup'; });
    if (!visible) { players.commit(0); card.visible = false; S.lastPlay = S.play; return null; }

    if (S.play === 'warmup') warmupUpdate(dt);
    else if (S.play === 'break') walkTo(0, -3.55, dt, 0.16);
    else if (S.play === 'walkoff') { // retour aux vestiaires, par le tunnel sous la tribune principale
      S.timer = S.play === S.lastPlay ? S.timer + dt : 0;
      walkTo(0, -3.7, dt, 0.34);
      if (S.timer > 8 || agents.every((a, i) => !active(i) || Math.abs(a.z + 3.7) < 0.25)) S.play = 'gone';
    } else {
      director();
      if (S.play === 'kickoff') {
        S.timer += dt;
        for (let i = 0; i < N; i++) if (active(i)) { const [x, z] = kickoffSpot(i); agents[i].steer(x, z, 0.35, dt, 0, 0); }
        b.x = 0; b.z = 0;
        const urgent = S.queue[0]?.started; // une action du commentaire attend : on engage sans traîner
        if ((S.timer > 0.9 || (urgent && S.timer > 0.25)) && !(matchFeed.pause > 0)) {
          const team = S.kickoffTeam;
          const strikers = teamIdx(team).filter((j) => active(j)).slice(-2);
          give(strikers[1], 'dribble');
          passTo(strikers[1], strikers[0], 'pass');
          S.play = 'play';
        }
      } else if (S.play === 'celebrate') {
        const c = S.celebrate;
        c.t += dt;
        const [cx, cz] = c.corner;
        const sc = agents[c.scorer];
        for (let i = 0; i < N; i++) {
          if (!active(i)) continue;
          const a = agents[i];
          // le buteur file vers le public, puis s'arrête face à la tribune ; ses coéquipiers le rejoignent et
          // l'entourent ; les autres regagnent leur moitié au pas
          if (i === c.scorer) a.steer(cx, cz, 0.7, dt, ...c.fans);
          else if (teamOf(i) === c.team && slotOf(i) !== 0) {
            const ang = slotOf(i) * 2.4, r = 0.075 + (slotOf(i) % 3) * 0.03;
            a.steer(sc.x + Math.cos(ang) * r, sc.z + Math.sin(ang) * r, 0.62, dt, sc.x, sc.z);
          } else { const [kx, kz] = kickoffSpot(i); a.steer(kx, kz, 0.12, dt, 0, 0); }
        }
        if (b.state === 'net') freeBall(dt);
        // la joie dure le temps de la pause du direct (bandeau « BUT ! »), puis chacun se replace pour l'engagement
        if ((c.t > 1.2 && !(matchFeed.pause > 0)) || c.t > 6) setKickoff(1 - c.team);
      } else if (S.play === 'restart') {
        restartUpdate(dt);
        for (let i = 0; i < N; i++) if (active(i) && i !== S.restart?.taker) offBall(i, dt, true);
      } else { // jeu
        let stopped = false;
        if (S.foul) stopped = foulUpdate(dt);
        if (S.play === 'play') {
          if (!stopped) seqControl();
          if (!stopped && b.state === 'held') carrier(dt);
          else if (!stopped && b.state !== 'dead') freeBall(dt);
          for (let i = 0; i < N; i++) {
            if (!active(i) && !S.leaving.has(i)) continue;
            if (b.state === 'held' && i === b.owner && !stopped) continue;
            if (S.foul && !S.foul.contact && i === S.foul.offender) continue;
            offBall(i, dt, stopped);
          }
        }
      }
      if (S.leaving.size && S.play !== 'play') for (const i of S.leaving) offBall(i, dt, true);
    }

    S.lastPlay = S.play;
    // frappes, plongeons, joie (bras levés de l'équipe qui vient de marquer), rendu des joueurs, ballon, carton
    const cheerTeam = S.play === 'celebrate' ? S.celebrate.team : -1;
    agents.forEach((a, i) => {
      if (a.kick > 0) { a.kick += dt / KICK_TIME; if (a.kick >= 1) a.kick = 0; }
      if (a.leanHold > 0) a.leanHold -= dt; else a.leanTo *= Math.max(0, 1 - dt * 2.5); // le gardien se relève
      a.lean += (a.leanTo - a.lean) * Math.min(1, dt * 12);
      if (Math.abs(a.lean) < 0.003 && Math.abs(a.leanTo) < 0.003) a.lean = a.leanTo = 0;
      const cheer = teamOf(i) === cheerTeam && slotOf(i) !== 0 ? 1 : 0;
      a.cheer += (cheer - a.cheer) * Math.min(1, dt * (cheer ? 5 : 2.5));
      if (a.cheer < 0.005) a.cheer = 0;
    });
    for (let i = 0; i < N; i++) {
      if (S.out[i]) players.setAgent(i, agents[i], -2, 0.0001);
      else players.setAgent(i, agents[i], S.baseY);
    }
    players.commit(N);
    const mx = b.x - b.prev[0], mz = b.z - b.prev[1];
    const moved = Math.hypot(mx, mz);
    if (moved > 1e-5 && b.y < 0.01) { b.roll += moved / BALL_R; b.rollAxis.set(mz, 0, -mx).normalize(); }
    b.prev = [b.x, b.z];
    placeBall(ballMesh, b, S.baseY);
    if (S.cardTimer > 0) {
      S.cardTimer -= dtReal;
      const a = agents[S.cardOf];
      card.visible = true;
      card.position.set(a.x, S.baseY + 0.27 + Math.sin(time * 4) * 0.008, a.z);
    } else card.visible = false;
    // Plan demandé à la réalisation (Empire3D) : jeu, attaque (ballon dans le dernier tiers, tir, et la seconde qui
    // suit), carton brandi (sur le fautif), joie du buteur (sur lui). vx, vz : le ballon (ou son porteur) en
    // mouvement, pour cadrer un peu devant l'action.
    const seq = S.seq && S.seq.started ? S.seq : null;
    if (seq && (b.state === 'shot' || (b.team === seq.team && local(seq.team, b.x, b.z)[0] > 1.8))) S.camHold = 1.2;
    else S.camHold = Math.max(0, (S.camHold || 0) - dtReal);
    const booked = S.foul && S.foul.contact && S.cardTimer > 0;
    const cam = S.play === 'celebrate' ? 'celebrate' : booked ? 'card' : S.camHold > 0 ? 'attack' : 'play';
    const focus = S.play === 'celebrate' ? agents[S.celebrate.scorer] : booked ? agents[S.cardOf] : b;
    const mover = b.state === 'held' && b.owner >= 0 ? agents[b.owner] : b;
    return { x: focus.x, z: focus.z, vx: mover.vx, vz: mover.vz, cam, live: ['kickoff', 'play', 'celebrate', 'restart', 'foul'].includes(S.play), slow: S.slow < 1 };
  }

  return {
    update,
    setKits,
    setFormation(f) { if (S.play === 'warmup' || S.play === 'off') setFormation(f); },
    setMode(m) {
      if (m.baseY !== undefined) S.baseY = m.baseY;
      if (m.matchDay !== undefined) {
        if (!m.matchDay) matchFeed.ended = false; // jour de match terminé : le prochain recommence à l'échauffement
        S.matchDay = m.matchDay;
      }
    },
    on,
    get ball() { return b; },
    get agents() { return agents; }, // lecture seule (inspection en développement)
    get debug() { return { play: S.play, half: S.half, queue: S.queue.map((q) => `${q.kind}:${q.e.minute}:${q.outcome || q.color}:${q.started ? 'go' : '…'}`), seq: S.seq && { shooter: S.seq.shooter, left: +(S.seq.tAt - S.now).toFixed(2), passed: S.seq.passed, shot: S.seq.shot }, ball: { state: b.state, owner: b.owner, x: +b.x.toFixed(2), z: +b.z.toFixed(2) }, clock: +matchFeed.clock.toFixed(1), pause: +(+matchFeed.pause).toFixed(1) }; },
    dispose() {
      players.dispose();
      [ballMesh, ...warmBalls].forEach((m) => { parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      parent.remove(card);
      Object.values(cardMats).forEach((m) => m.dispose());
    },
  };
}
