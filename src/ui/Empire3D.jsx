import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { PLOTS, PLOT_LABELS, SECTORS, allowedBuildingsFor, plotBuilding } from '../game/map';
import { fmtMoney } from './format';
import { IconArrowUp, IconTraining } from './icons';
import { PLOT_POS, PLAZA_CENTER, footprintOf, layoutOverlaps } from '../three/layout';
import { createRenderer, createEnvironment, outputRatioFor } from '../three/environment';
import { createFluidity } from '../three/adapt';
import { assetsProgress, initAssets, instantiateModel, preloadModel, setAssetsBoost, setAssetsNight } from '../three/assets';
import { resolveModel, resolveProp } from '../three/manifest';
import { plotLights } from '../three/lights';
import { BuildAnimation, Fireworks, hoverFrame } from '../three/fx';
import { createLife } from '../three/life';
import { createLandscape, heightAt } from '../three/landscape';
import { plantSpots } from '../three/forest';
import { createFrameRenderer } from '../three/render';
import { momentAt } from '../three/sky';
import { PARVIS, createTrophies } from '../three/trophies';
import { honoursOf, plural } from '../game/honours';
import { createMatchScene } from '../three/matchplay';
import { matchFeed } from '../game/matchFeed';
import { createCrowd } from '../three/crowd';
import { HOME_KIT, matchKitOf } from '../game/kits';
import {
  buildingMesh, padMesh, setProceduralNight, stadiumMesh,
} from '../three/procedural';
import { holdCharge } from './charge';

// Le contexte d'essai est rendu tout de suite : sur iPhone, chaque contexte 3D laissé ouvert compte jusqu'au bout.
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!(window.WebGLRenderingContext && gl);
  } catch { return false; }
}

if (import.meta.env.DEV && layoutOverlaps().length) {
  console.warn('[Empire3D] emprises qui se chevauchent :', layoutOverlaps());
}

const HOME_VIEW = { pos: new THREE.Vector3(20, 21.5, 25), target: new THREE.Vector3(PLAZA_CENTER[0], 0.5, PLAZA_CENTER[1]) };
// Vue d'ensemble : même angle que HOME_VIEW, à la distance qui fait tenir toutes les parcelles à l'écran, entre
// la barre du haut et le menu du bas. En portrait (téléphone), l'objectif s'élargit un peu pour ne pas reculer
// trop loin.
const HOME_DIR = HOME_VIEW.pos.clone().sub(HOME_VIEW.target).normalize();
const HOME_DIST = HOME_VIEW.pos.distanceTo(HOME_VIEW.target);
const FIT_POINTS = Object.keys(PLOT_POS).flatMap((id) => {
  const [x, z] = PLOT_POS[id];
  const { w, d } = footprintOf(id);
  return [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]]
    .flatMap(([a, b]) => [new THREE.Vector3(a, 0, b), new THREE.Vector3(a, 1.6, b)]);
});
const fovFor = (aspect) => (aspect < 1 ? 42 + (1 - aspect) * 26 : 42);
function homeView(aspect) {
  const cam = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.5, 600);
  const v = new THREE.Vector3();
  const fits = (d) => {
    cam.position.copy(HOME_VIEW.target).addScaledVector(HOME_DIR, d);
    cam.lookAt(HOME_VIEW.target);
    cam.updateMatrixWorld();
    return FIT_POINTS.every((p) => { v.copy(p).project(cam); return Math.abs(v.x) <= 0.94 && v.y <= 0.7 && v.y >= -0.6; });
  };
  let lo = 15;
  let hi = 200;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  const dist = aspect >= 1 ? Math.max(hi, HOME_DIST) : hi;
  return { pos: HOME_VIEW.target.clone().addScaledVector(HOME_DIR, dist), target: HOME_VIEW.target.clone(), dist };
}

// Cadrage d'une parcelle choisie : la zone libre de l'écran (sous la barre du haut, au-dessus de la fiche sur
// téléphone, à droite de la carte de l'inspecteur sur PC, au-dessus du menu du bas), puis la distance qui fait
// tenir le bâtiment entier dans cette zone, avec une marge. L'angle est un trois-quarts face un peu plus bas que
// la vue d'ensemble, pour bien voir les façades.
function freeRegion(mount) {
  const r = mount.getBoundingClientRect();
  const W = r.width;
  const H = r.height;
  const narrow = W <= 760;
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return b.width && b.height ? b : null;
  };
  let top = 0;
  let bottom = H;
  let left = 0;
  let right = W;
  const hudTop = rect('.hud-top');
  if (hudTop) top = hudTop.bottom - r.top;
  const ins = document.querySelector('.inspector');
  if (ins) { // offsetTop / offsetLeft : position finale, sans l'animation d'entrée de la fiche
    if (narrow) bottom = Math.min(bottom, ins.offsetTop);
    else left = Math.max(left, ins.offsetLeft + ins.offsetWidth);
  }
  if (!narrow) {
    for (const sel of ['.hud-dock', '.hud-match']) { const b = rect(sel); if (b && b.left < right && b.right > left) bottom = Math.min(bottom, b.top - r.top); }
    const tools = rect('.hud-tools');
    if (tools) right = Math.min(right, tools.left - r.left);
    // fenêtre d'aperçu d'un bâtiment (offsetLeft / offsetTop : position finale, sans l'animation d'entrée) : à droite
    // sur un écran large, la zone libre est à sa gauche ; posée en bas à droite (tablette en hauteur), au-dessus. Sur
    // téléphone, ouverte en grand, elle couvre la scène : le cadrage reste celui de la fiche.
    const win = document.querySelector('.bw');
    if (win?.offsetWidth) {
      if (win.offsetLeft - left > 160) right = Math.min(right, win.offsetLeft);
      else bottom = Math.min(bottom, win.offsetTop);
    }
  }
  const pad = narrow ? 12 : 24;
  return { left: left + pad, right: right - pad, top: top + pad, bottom: Math.max(top + pad + 80, bottom - pad), W, H };
}
const FRAME_ELEV = 0.5; // ~30° au-dessus de l'horizon
const FRAME_DIR = new THREE.Vector3(HOME_DIR.x, 0, HOME_DIR.z).normalize().multiplyScalar(Math.cos(FRAME_ELEV)).setY(Math.sin(FRAME_ELEV));
function frameView(camera, box, region) {
  const { W, H } = region;
  const cam = camera.clone();
  const shift = { x: W / 2 - (region.left + region.right) / 2, y: H / 2 - (region.top + region.bottom) / 2 };
  cam.aspect = W / H;
  cam.setViewOffset(W, H, shift.x, shift.y, W, H);
  const center = box.getCenter(new THREE.Vector3());
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  const fits = (d) => {
    cam.position.copy(center).addScaledVector(FRAME_DIR, d);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return corners.every((p) => {
      v.copy(p).project(cam);
      const sx = (v.x * 0.5 + 0.5) * W;
      const sy = (-v.y * 0.5 + 0.5) * H;
      return v.z < 1 && sx >= region.left && sx <= region.right && sy >= region.top && sy <= region.bottom;
    });
  };
  let lo = 2;
  let hi = 160;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  return { pos: center.clone().addScaledVector(FRAME_DIR, hi), target: center, dist: hi, shift };
}

const UP = new THREE.Vector3(0, 1, 0);
const holoRise = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2; // sortie de terre avec un léger rebond

const MATCH_VIEW = { pos: new THREE.Vector3(11, 8.5, 14), target: new THREE.Vector3(0, 0.4, -0.5) };
// match en direct : caméra « télé » en tribune latérale, et plan rapproché sur la surface pour les ralentis
const TV_VIEW = { pos: new THREE.Vector3(0, 5.4, 10.8), target: new THREE.Vector3(0, 0, 0.8) };
const GOAL_VIEW = { pos: new THREE.Vector3(3.2, 0.62, 1.95), target: new THREE.Vector3(4.4, 0.1, 0) }; // plan serré du ralenti
// arène fermée (niveaux 5 et 6) : caméras un peu plus hautes pour passer au-dessus du toit côté caméra
const MATCH_VIEW_ARENA = { pos: new THREE.Vector3(10.5, 11.2, 13.4), target: new THREE.Vector3(0, 0.4, -0.5) };
const TV_VIEW_ARENA = { pos: new THREE.Vector3(0, 6.3, 10.2), target: new THREE.Vector3(0, 0, 0.8) };

// Ce qu'une parcelle doit afficher : la scène n'est reconstruite que si cette signature change.
function plotSpec(s, plotId) {
  const key = plotBuilding(s, plotId);
  if (key) return { kind: 'building', key, lvl: s.buildings[key], sig: `${key}:${s.buildings[key]}` };
  return { kind: 'pad', sig: 'pad' }; // toutes les parcelles sont ouvertes (map.js)
}

function proceduralFor(spec) {
  if (spec.kind === 'pad') return padMesh();
  return spec.key === 'terrain' ? stadiumMesh(spec.lvl) : buildingMesh(spec.key, spec.lvl);
}

// Texte de l'étiquette de survol.
function plotInfo(s, plotId) {
  const plot = PLOTS.find((p) => p.id === plotId);
  const sec = SECTORS.find((x) => x.id === plot.sector);
  const key = plotBuilding(s, plotId);
  if (!key) return { eyebrow: `${sec.short} · ${PLOT_LABELS[plotId]}`, title: 'Parcelle libre', detail: 'Cliquer pour construire' };
  const b = BUILDINGS[key];
  const lvl = s.buildings[key];
  const detail = lvl >= b.max ? 'Niveau maximum' : `Amélioration : ${fmtMoney(upgradeCost(key, lvl + 1))}`;
  return { eyebrow: sec.short || sec.name, title: b.name, level: `Niv. ${lvl}/${b.max}`, detail };
}

// Étiquette de survol du parvis : l'allée d'honneur mène à la salle des trophées.
function parvisInfo(s) {
  const n = honoursOf(s).length;
  return {
    eyebrow: 'Parvis', title: 'Salle des trophées', level: null,
    detail: n ? `${plural(n, 'trophée')} sur l’allée d’honneur` : 'Aucun trophée pour l’instant',
  };
}

// Vue 3D plein écran : décor permanent du jeu, pilotée par le HUD (nuit, jour de match, recentrage,
// parcelle sélectionnée). Garde ses propres interactions : survol (étiquette) et clic (sélection).
export default function Empire3D({
  state, onSelectPlot, onEmptyTap, onWebGLFail, timeMode = 'auto', matchDay = false, recenter = 0, selectedPlot = null,
  live = false, matchFx = null, badges = [], onLoadProgress, onLoaded, matchInfo = null, onOpenTrophies,
  attract = false, paused = false, hidden = false, holo = null, session = null, onSession, onLag,
}) {
  const mountRef = useRef(null);
  const labelRef = useRef(null);
  const pinRefs = useRef(new Map()); // pastilles dorées (DOM), positionnées à chaque image
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ctxRef = useRef(null);
  const selectRef = useRef(onSelectPlot);
  selectRef.current = onSelectPlot;
  const emptyRef = useRef(onEmptyTap);
  emptyRef.current = onEmptyTap;
  const trophiesRef = useRef(onOpenTrophies);
  trophiesRef.current = onOpenTrophies;
  const loadRef = useRef({ onLoadProgress, onLoaded, onLag });
  loadRef.current = { onLoadProgress, onLoaded, onLag };
  // attract : écran titre (caméra en vitrine, sans interaction) ; paused : menu pause (la dernière image reste figée)
  const modeRef = useRef({ timeMode: 'auto', matchDay: false, live: false, attract, paused });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !webglAvailable()) {
      if (onWebGLFail) onWebGLFail();
      return undefined;
    }
    let renderer;
    try {
      renderer = createRenderer(mount);
    } catch {
      if (onWebGLFail) onWebGLFail();
      return undefined;
    }
    mount.appendChild(renderer.domElement);
    initAssets(renderer);

    const scene = new THREE.Scene();
    const env = createEnvironment(scene, renderer);
    const aspect0 = mount.clientWidth / Math.max(1, mount.clientHeight);
    const home0 = homeView(aspect0);
    const camera = new THREE.PerspectiveCamera(fovFor(aspect0), aspect0, 0.5, 600);
    camera.position.copy(home0.pos);
    renderer.domElement.style.cursor = 'grab';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // la caméra s'arrête dès qu'on lâche (pas d'inertie qui continue seule)
    controls.target.copy(HOME_VIEW.target);
    controls.minDistance = 6;
    controls.maxDistance = Math.max(80, home0.dist * 1.25);
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = Math.PI * 0.08;
    // Limites : la cible reste dans l'enceinte du complexe (on ne part pas se promener dans la campagne) et la
    // caméra ne s'enfonce jamais dans les collines autour (dans l'enceinte, les plans de ralenti restent libres).
    const LIMIT = { x: 25, zMin: -24, zMax: 20, y: 4 };
    const shift = new THREE.Vector3();
    controls.addEventListener('change', () => {
      const t = controls.target;
      shift.set(
        THREE.MathUtils.clamp(t.x, -LIMIT.x, LIMIT.x) - t.x,
        THREE.MathUtils.clamp(t.y, 0, LIMIT.y) - t.y,
        THREE.MathUtils.clamp(t.z, LIMIT.zMin, LIMIT.zMax) - t.z,
      );
      if (shift.lengthSq() > 0) { t.add(shift); camera.position.add(shift); }
      const ground = heightAt(camera.position.x, camera.position.z);
      if (ground > 0.2 && camera.position.y < ground + 1) camera.position.y = ground + 1;
    });

    const frame = hoverFrame();
    scene.add(frame.group);
    const selFrame = hoverFrame();
    scene.add(selFrame.group);
    const fireworks = new Fireworks(scene, new THREE.Vector3(0, 0, 0), 6);
    const life = createLife(scene);
    // écrin naturel : plateau, collines boisées, lac, route bordée de platanes ; il plante aussi les arbres du site
    const landscape = createLandscape(scene, { siteTreesUrl: `${import.meta.env.BASE_URL}models/props/site_trees.json` });
    env.setGroundVisible(false);
    landscape.setVeilMaterial(env.veilMaterial(10, 52)); // le voile d'horizon montre le ciel qui est derrière lui

    const ctx = {
      home: home0, scene, env, camera, controls, plots: new Map(), anims: new Set(), fireworks, camTween: null, alive: true, selFrame,
      life: null, timeScale: 1, replay: null, shake: 0, ledBoost: 1,
    };
    ctx.life = life;
    ctx.landscape = landscape;
    // réglage « Fluidité sur appareil lent » (adapt.js) : densité de la toile ajustée par paliers quand ça rame
    ctx.fluid = createFluidity({
      apply: (s) => { renderer.setPixelRatio(outputRatioFor() * s); ctx.frameOnce = true; },
      onLag: () => loadRef.current.onLag?.(),
    });
    renderer.setPixelRatio(outputRatioFor() * ctx.fluid.scale);
    ctx.trophies = createTrophies(scene, renderer); // allée d'honneur du parvis (trophées gagnés)
    const draw = createFrameRenderer(renderer, scene, camera); // une image : la scène dans la toile, sans post-traitement
    ctx.draw = draw;
    ctx.renderer = renderer; // mesures (développement)
    ctxRef.current = ctx;
    if (import.meta.env.DEV) window.__empire3d = ctx; // inspection en développement

    // --- Parcelles : un conteneur fixe par parcelle, seul son contenu change -----------------------
    for (const p of PLOTS) {
      const wrapper = new THREE.Group();
      const [x, z] = PLOT_POS[p.id];
      wrapper.position.set(x, 0, z);
      wrapper.userData.plotId = p.id;
      scene.add(wrapper);
      ctx.plots.set(p.id, { id: p.id, wrapper, content: null, sig: null, height: 1, lights: null, anim: null });
    }
    const stadium = ctx.plots.get('t0');
    // les jours de match : notre onze contre l'adversaire, et le public dans les tribunes
    const squad = createMatchScene(stadium.wrapper);
    squad.setFormation(stateRef.current.formation);
    stadium.squad = squad;
    const crowd = createCrowd(stadium.wrapper);
    ctx.crowd = crowd;
    if (import.meta.env.DEV) window.__empire = ctx; // inspection en développement
    squad.on.goal = (team) => {
      crowd.cheer(team, 1, 4);
      if (team === 0) { fireworks.burst(8); ctx.ledBoost = 2.6; }
      else { stadium.lights?.setLevel(0.7); setTimeout(() => ctxRef.current?.applyMode(), 1600); }
    };
    const ooh = (team) => crowd.cheer(team, 0.35, 0.5); // occasion manquée : la tribune se soulève à peine
    squad.on.save = ooh;
    squad.on.post = ooh;
    squad.on.miss = ooh;
    controls.addEventListener('start', () => { ctx.userCam = performance.now() + 5000; }); // le joueur reprend la main

    ctx.setContent = (entry, node) => {
      if (entry.content) entry.wrapper.remove(entry.content); // ressources partagées : pas de dispose ici
      entry.content = node;
      entry.wrapper.add(node);
      const real = node.name.startsWith('model:');
      // pelouse du stade : ~0,5 cm dans le GLB, plus haute dans le repli procédural
      if (entry.squad) entry.squad.setMode({ baseY: real ? 0.006 : 0.226 });
      if (entry.id === 't0') ctx.crowd?.setStadium(node, real ? 0.006 : 0.226, (Number(String(entry.sig || '').split(':')[1]) || 0) >= 5);
      entry.lights?.dispose();
      // stade : pelouse bien éclairée la nuit, sans voile de halo sur les gradins quand on s'approche
      entry.lights = real ? plotLights(scene, node, entry.id === 't0' ? { max: 6, power: 3 } : { max: 2, power: 1.6 }) : null;
      const box = new THREE.Box3().setFromObject(node);
      entry.height = Number.isFinite(box.max.y) ? Math.max(0.4, box.max.y) : 1;
      ctx.applyMode();
      return node;
    };

    // Synchronise les parcelles avec l'état de jeu. animate : animation de chantier sur les changements.
    ctx.sync = (s, animate) => {
      for (const p of PLOTS) {
        const entry = ctx.plots.get(p.id);
        const spec = plotSpec(s, p.id);
        if (entry.sig === spec.sig) continue;
        const isUpdate = animate && entry.sig !== null;
        entry.sig = spec.sig;
        const fp = footprintOf(p.id, spec.lvl);
        const proc = proceduralFor(spec);
        const model = spec.kind === 'building'
          ? resolveModel(spec.key, spec.lvl)
          : resolveProp('plot_empty');
        let anim = null;
        if (isUpdate) {
          entry.anim?.finish();
          anim = new BuildAnimation(entry.wrapper, fp, entry.height, (node) => ctx.setContent(entry, node));
          entry.anim = anim;
          ctx.anims.add(anim);
          if (!model) anim.provide(proc);
        } else {
          ctx.setContent(entry, proc);
        }
        if (model) {
          const wanted = spec.sig;
          instantiateModel(model, fp)
            .then((node) => {
              if (entry.sig !== wanted || !ctx.alive) return;
              plantSpots(node); // arbres des bâtiments et des parcelles (repères tree_spot_*)
              if (anim) anim.provide(node); else ctx.setContent(entry, node);
            })
            .catch((err) => {
              console.warn(`[Empire3D] GLB ${model.url} indisponible, repli procédural.`, err);
              if (anim && entry.sig === wanted) anim.provide(proc);
            });
        }
      }
      const fresh = ctx.trophies.sync(s);
      ctx.syncSpots?.(); // projecteurs du trophée central
      if (animate && fresh.length) ctx.showcase(fresh[fresh.length - 1]);
    };

    // Nouveau trophée (première victoire) : la caméra va le voir se poser, puis revient à la vue d'ensemble. Les
    // soirs de match, on attend le retour au complexe.
    ctx.showcase = (id) => {
      const { matchDay: md, live: lv } = modeRef.current;
      if (md || lv || ctx.sheetOpen) { ctx.pendingShowcase = id; return; }
      ctx.pendingShowcase = null;
      const view = ctx.trophies.viewOf(id);
      if (!view) return;
      const since = performance.now();
      ctx.tweenCamera(view, 1.8, () => setTimeout(() => {
        // le joueur a repris la main entre-temps (ou une fiche s'est ouverte) : on le laisse
        if (!ctxRef.current || (ctx.userCam && ctx.userCam - 5000 > since) || ctx.sheetOpen || modeRef.current.matchDay) return;
        ctx.tweenCamera(ctx.home, 1.6);
      }, 3400));
    };

    // Aperçu d'un bâtiment sur sa parcelle (vitrine de construction, fenêtre d'aperçu) : le modèle du niveau choisi
    // en hologramme doré (corps translucide, arêtes lumineuses) qui sort de terre et respire doucement ; sur une
    // parcelle déjà bâtie (aperçu d'un niveau supérieur), le bâtiment en place s'efface le temps de l'aperçu.
    // Matériaux et arêtes propres à l'aperçu (libérés à sa fin) ; géométries partagées avec le modèle.
    ctx.holo = null;
    ctx.holoToken = 0;
    ctx.clearHolo = () => {
      const h = ctx.holo;
      ctx.holoSway = null;
      if (!h) return;
      ctx.holo = null;
      h.node.parent?.remove(h.node);
      h.disposables.forEach((d) => d.dispose());
      if (h.hidden) h.hidden.visible = true;
    };
    ctx.setHolo = (spec) => {
      const cur = ctx.holo;
      if (cur && cur.plotId === spec.plotId && cur.key === spec.key && cur.lvl === spec.lvl) return;
      const token = ++ctx.holoToken;
      const entry = ctx.plots.get(spec.plotId);
      if (!entry) return;
      // la caméra part tout de suite vers la parcelle (hauteur estimée) sans attendre le modèle, et les modèles des
      // autres bâtiments proposés se chargent pendant ce temps : passer de l'un à l'autre devient immédiat
      if (ctx.holoFramed?.plotId !== spec.plotId) ctx.frameHolo(false, { plotId: spec.plotId, lvl: spec.lvl, height: 2.5 });
      if (!ctx.holoPreloaded) {
        ctx.holoPreloaded = true;
        allowedBuildingsFor(stateRef.current).forEach((k) => preloadModel(resolveModel(k, 1)));
      }
      // fenêtre d'aperçu ouverte (PC) : les autres niveaux du bâtiment montré (légers, sauf ceux du stade)
      if (spec.windowOpen && spec.key !== 'terrain') {
        for (let l = 1; l <= BUILDINGS[spec.key].max; l++) preloadModel(resolveModel(spec.key, l));
      }
      const fp = footprintOf(spec.plotId, spec.lvl);
      const proc = () => proceduralFor({ kind: 'building', key: spec.key, lvl: spec.lvl });
      const model = resolveModel(spec.key, spec.lvl);
      const show = (node) => {
        if (token !== ctx.holoToken || !ctx.alive) return;
        ctx.clearHolo();
        const height = new THREE.Box3().setFromObject(node).max.y;
        const body = new THREE.MeshBasicMaterial({ color: 0xd9b56a, transparent: true, opacity: 0.2, depthWrite: false });
        const edge = new THREE.LineBasicMaterial({ color: 0xf6dfa4, transparent: true, opacity: 0.8 });
        const disposables = [body, edge];
        const meshes = [];
        node.traverse((o) => {
          if (o.isLight) o.visible = false;
          if (o.isMesh) meshes.push(o);
        });
        for (const o of meshes) {
          o.material = body;
          o.castShadow = false;
          o.receiveShadow = false;
          o.renderOrder = 2;
          const n = o.geometry.attributes.position?.count || 0;
          if (n && n < 40000) { // arêtes dessinées (les très gros maillages du stade gardent leur seul corps)
            const eg = new THREE.EdgesGeometry(o.geometry, 32);
            disposables.push(eg);
            const lines = new THREE.LineSegments(eg, edge);
            lines.renderOrder = 3;
            o.add(lines);
          }
        }
        const hidden = entry.sig !== 'pad' && entry.content ? entry.content : null;
        if (hidden) hidden.visible = false;
        node.scale.y = 0.02;
        entry.wrapper.add(node);
        ctx.holo = { ...spec, node, body, edge, disposables, hidden, height, t: 0 };
        ctx.frameHolo();
      };
      if (model) instantiateModel(model, fp).then(show).catch(() => show(proc()));
      else show(proc());
    };
    // Cadrage de l'aperçu dans la zone libre (entre la fiche et la fenêtre d'aperçu sur PC, au-dessus sur
    // téléphone), puis la caméra oscille lentement autour, comme en vitrine. Même parcelle et hauteur proche :
    // pas de nouveau mouvement de caméra, seul l'hologramme change.
    // Cadrage d'une parcelle et de son bâtiment (hauteur réelle du modèle chargé ou procédural, au moins minH) dans la
    // zone libre de l'écran.
    ctx.framePlot = (plotId, minH = 0.8) => {
      const [x, z] = PLOT_POS[plotId];
      const fp = footprintOf(plotId, stateRef.current.buildings?.terrain);
      const entry = ctx.plots.get(plotId);
      const h = entry ? Math.min(9, Math.max(minH, new THREE.Box3().setFromObject(entry.wrapper).max.y)) : 2;
      const box = new THREE.Box3(new THREE.Vector3(x - fp.w / 2, 0, z - fp.d / 2), new THREE.Vector3(x + fp.w / 2, h, z + fp.d / 2));
      const view = frameView(ctx.camera, box, freeRegion(mountRef.current));
      ctx.frameShift = view.shift;
      ctx.controls.minDistance = Math.min(6, view.dist * 0.8);
      ctx.tweenCamera(view, 1.25);
    };
    ctx.frameHolo = (force = false, est = null) => {
      const h = est || ctx.holo;
      if (!h || !mountRef.current) return;
      const height = Math.min(9, Math.max(0.8, h.height));
      const last = ctx.holoFramed;
      if (!force && last && last.plotId === h.plotId && Math.abs(last.height - height) < 1.5) {
        if (!ctx.camTween && !ctx.holoSway && ctx.holo) ctx.holoSway = { t: 0, prev: 0 }; // cadrage déjà bon : la vitrine tourne
        return;
      }
      ctx.holoFramed = { plotId: h.plotId, height };
      const [x, z] = PLOT_POS[h.plotId];
      const fp = footprintOf(h.plotId, h.lvl);
      const box = new THREE.Box3(new THREE.Vector3(x - fp.w / 2, 0, z - fp.d / 2), new THREE.Vector3(x + fp.w / 2, height, z + fp.d / 2));
      clearTimeout(ctx.holoFrameTimer);
      ctx.holoFrameTimer = setTimeout(() => { // la fenêtre vient de s'afficher : on mesure une fois sa mise en page faite
        if (!ctx.holoSpec || !mountRef.current) return;
        const view = frameView(ctx.camera, box, freeRegion(mountRef.current));
        ctx.frameShift = view.shift;
        ctx.controls.minDistance = Math.min(6, view.dist * 0.8);
        ctx.holoSway = null;
        ctx.tweenCamera(view, 1.0, () => { if (ctx.holo) ctx.holoSway = { t: 0, prev: 0 }; });
      }, 60);
    };

    // Jour / nuit / jour de match : ciel, éclairage, foule, projecteurs, feux d'artifice.
    // Moment de la journée : heure réelle (mode auto, lever et coucher de la saison), forcé jour / nuit, ou soirée
    // les jours de match.
    ctx.applyMode = () => {
      const { timeMode: tm, matchDay: md, live: lv } = modeRef.current;
      const s = stateRef.current;
      const now = new Date();
      const moment = ctx.forceMoment || momentAt(now, { timeMode: tm, matchDay: md }); // forceMoment : réglages (dév.)
      const stadiumLights = stadium.lights;
      const { dark, lights } = env.setAmbience({ moment, hasStadiumLights: !stadiumLights });
      ctx.ambience = { moment, dark, lights };
      const lit = dark || lights > 0.5; // phares des voitures, bâtiments de repli allumés
      life.setMode({ dark: lit, matchDay: md });
      setProceduralNight(lit);
      setAssetsNight(lights); // fenêtres, LED, têtes de projecteurs : progressif
      ctx.trophies.setDark(dark);
      ctx.trophies.setLights(lights);
      ctx.siteLights?.setLevel(lights); // mâts d'éclairage de l'esplanade
      if (ctx.pendingShowcase && !md && !lv) setTimeout(() => ctxRef.current?.showcase(ctx.pendingShowcase), 900);
      ctx.plots.forEach((e) => {
        if (!e.lights) return;
        // projecteurs du stade : à moitié au coucher du soleil, pleins au crépuscule et la nuit
        if (e.id === 't0') e.lights.setLevel(md ? 1.5 : Math.max(0, lights - 0.5) * 2);
        else e.lights.setLevel(lights * 0.8);
      });
      const lm = s.lastMatch;
      const won = !!lm && lm.gf > lm.ga;
      squad.setMode({ matchDay: md });
      if (md) crowd.show(ctx.crowdFill ?? 0.6, ctx.awayColor); else crowd.hide();
      fireworks.active = md && won && !lv && !!ctx.postMatch; // en direct : salves uniquement sur nos buts
      ctx.syncSpots?.(); // projecteurs : tous dans le calcul de la lumière, ou aucun
    };

    // Projecteurs (mâts, parcelles, stade, trophée) : tous dans le calcul de la lumière ou aucun. Le jour, aucun
    // n'éclaire : ils en sortent (sinon chaque pixel de l'image les paierait, même à zéro). Jamais une partie
    // seulement : deux combinaisons de lumières en tout, compilées d'avance pour chaque nombre de projecteurs (au
    // chargement, puis quand un bâtiment en apporte), sans recompilation de plusieurs secondes à la tombée du jour.
    let loaded = false;
    let compiledFor = -1;
    const precompile = (spots) => {
      const shown = spots.map((l) => l.visible);
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(null); // même cible que le rendu (la toile) : mêmes programmes
      spots.forEach((l) => { l.visible = true; });
      const lit = renderer.compileAsync(scene, camera); // lumières relevées tout de suite, compilation en fond
      spots.forEach((l) => { l.visible = false; });
      const unlit = renderer.compileAsync(scene, camera);
      spots.forEach((l, i) => { l.visible = shown[i]; });
      renderer.setRenderTarget(target);
      return Promise.all([lit, unlit]).then(() => {
        // le jour, une image avec les projecteurs dans le calcul mais à zéro (rien ne change à l'écran) : tout est
        // prêt aussi pour le soir
        if (!ctx.alive || spots.some((l) => l.visible)) return;
        spots.forEach((l) => { l.visible = true; });
        draw();
        spots.forEach((l) => { l.visible = false; });
      }).catch(() => {});
    };
    ctx.syncSpots = () => {
      const spots = [];
      scene.traverse((o) => { if (o.isSpotLight) spots.push(o); });
      const on = spots.some((l) => l.intensity > 0);
      spots.forEach((l) => { l.visible = on; });
      if (loaded && spots.length !== compiledFor) { compiledFor = spots.length; return precompile(spots); }
      return Promise.resolve();
    };

    ctx.cutCamera = (view) => { // plan de coupe (ralenti) : pas de transition
      ctx.camTween = null;
      controls.minDistance = 1.5; // plan serré autorisé le temps du ralenti (rétabli à la fin du retour caméra)
      camera.position.copy(view.pos);
      controls.target.copy(view.target);
    };
    ctx.tweenCamera = (view, duration = 1.6, onDone = null) => {
      ctx.camTween = {
        t: 0, duration, onDone,
        fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
        toPos: view.pos.clone(), toTarget: view.target.clone(),
      };
    };

    // Réalisation des temps forts : caméra télé dans l'axe de la tribune principale, en plan large, qui suit le ballon
    // (un peu devant lui quand il file) et serre le plan selon l'action : construction (plan large), attaque dans les
    // quarante derniers mètres, coup de pied arrêté, carton, joie du buteur (jamais un gros plan : les joueurs sont
    // simples). La largeur de terrain montrée se règle sur l'écran. Tout glisse en douceur ; un nouveau temps fort (plan de
    // coupe sur le stade, puis retour au jeu) et le ralenti (derrière la cage ou au ras de la pelouse) changent de plan
    // d'un coup (cut).
    const SHOT_WIDTH = { // largeur de terrain visible (unités du jeu, 1 = 10 m)
      wide: { play: 6.2, attack: 4.8, set: 4.2, card: 3.6, celebrate: 3.3, replay: 3.4 },
      narrow: { play: 3.0, attack: 2.7, set: 2.7, card: 2.4, celebrate: 2.2, replay: 2.3 }, // téléphone : des joueurs lisibles (0.8.7)
    };
    const tvDir = new THREE.Vector3();
    const camOff = new THREE.Vector3();
    const camWant = new THREE.Vector3();
    const camAim = new THREE.Vector3();
    const POLAR = controls.maxPolarAngle; // rétabli après un ralenti au ras de la pelouse
    const NEAR = camera.near; // le ralenti rapproche le plan de coupe proche (la pelouse au pied de la caméra)
    ctx.restorePolar = () => {
      controls.maxPolarAngle = POLAR;
      if (camera.near !== NEAR) { camera.near = NEAR; camera.updateProjectionMatrix(); }
    };
    const broadcastStep = (mi, dt) => {
      // plan de coupe (0.8.7) : plan large du stade, en lent travelling, le temps de la mise en place de l'action
      if (mi.cam === 'cutaway') {
        const side = mi.side || 1, k = mi.t || 0;
        controls.target.set(0, 0, 0.6);
        camera.position.set(-side * (7.6 - k * 1.1), 8.4 - k * 0.5, 11.6);
        camera.lookAt(controls.target);
        return;
      }
      // ralenti sous un autre angle (0.8.7) : derrière la cage attaquée, ou au ras de la pelouse sur le côté de l'action
      if (mi.cam === 'replay' && mi.angle) {
        controls.minDistance = 0.3;
        controls.maxPolarAngle = Math.PI * 0.499;
        if (camera.near !== 0.06) { camera.near = 0.06; camera.updateProjectionMatrix(); }
        const sgn = Math.sign(mi.goalX) || 1;
        if (mi.angle === 'goal') camWant.set(mi.goalX + sgn * 0.95, 0.62, THREE.MathUtils.clamp(mi.bz * 0.35, -0.5, 0.5));
        else camWant.set(mi.bx - sgn * 0.85, 0.1, THREE.MathUtils.clamp(mi.bz + (mi.bz > 0 ? -1.25 : 1.25), -3.1, 3.1));
        // derrière la cage : le cadre vise entre le ballon et la cage (le but reste à l'image) ; au ras : le ballon
        if (mi.angle === 'goal') camAim.set(mi.bx * 0.65 + mi.goalX * 0.35, Math.max(0.03, (mi.by || 0) * 0.6), mi.bz * 0.65);
        else camAim.set(mi.bx * 0.8 + mi.goalX * 0.2, Math.max(0.03, (mi.by || 0) * 0.6), mi.bz * 0.85); // la cage entre dans le cadre
        if (mi.cut) { camera.position.copy(camWant); controls.target.copy(camAim); }
        else {
          camera.position.lerp(camWant, 1 - Math.exp(-dt * 2.5));
          controls.target.lerp(camAim, 1 - Math.exp(-dt * 6));
        }
        camera.lookAt(controls.target);
        return;
      }
      const arena = (stateRef.current.buildings?.terrain || 0) >= 5;
      const view = arena ? TV_VIEW_ARENA : TV_VIEW;
      tvDir.subVectors(view.pos, view.target).normalize();
      const W = mount.clientWidth, H = Math.max(1, mount.clientHeight);
      const narrow = W <= 760;
      const freeW = W; // pendant un temps fort, toute la largeur de l'écran est à la 3D
      const width = SHOT_WIDTH[narrow ? 'narrow' : 'wide'][mi.cam] || SHOT_WIDTH.wide.play;
      const perUnit = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (freeW / H);
      const want = THREE.MathUtils.clamp(width / perUnit, 2.6, 12.5);
      const lim = 5.25 - width * 0.3;
      const tx = THREE.MathUtils.clamp(mi.x + THREE.MathUtils.clamp((mi.vx || 0) * 0.3, -0.7, 0.7), -lim, lim);
      // téléphone : le ballon un peu plus bas dans le cadre, l'espace vers l'arrière-plan reste visible (0.8.7)
      const tz = THREE.MathUtils.clamp(mi.z * 0.55 + (mi.vz || 0) * 0.15, -1.6, 1.6) + (narrow ? -0.15 : 0.3);
      controls.minDistance = Math.min(controls.minDistance, 2.5);
      if (mi.cut) { // changement de plan franc : la caméra est tout de suite en place
        controls.target.set(tx, 0, tz);
        camera.position.copy(controls.target).addScaledVector(tvDir, want);
        camera.lookAt(controls.target);
        return;
      }
      camOff.subVectors(camera.position, controls.target);
      let d = camOff.length();
      camOff.divideScalar(d || 1).lerp(tvDir, 1 - Math.exp(-dt * 1.5)).normalize();
      d += (want - d) * (1 - Math.exp(-dt * (mi.cam === 'replay' ? 2.4 : 1.2)));
      const k = 1 - Math.exp(-dt * (mi.cam === 'replay' ? 3.2 : 2.2));
      controls.target.x += (tx - controls.target.x) * k;
      controls.target.z += (tz - controls.target.z) * k;
      controls.target.y += (0 - controls.target.y) * k;
      camera.position.copy(controls.target).addScaledVector(camOff, d);
      camera.lookAt(controls.target); // orientation de cette image (OrbitControls la recalcule à la suivante)
    };
    ctx.broadcastStep = broadcastStep; // aussi pour la démo du match en développement (tmp/ph3)

    ctx.sync(stateRef.current, false);
    life.setState(stateRef.current);
    ctx.applyMode();
    const clockTimer = setInterval(() => ctx.applyMode(), 60000); // heure réelle : mise à jour chaque minute

    // Site urbain (voirie, trottoirs, lampadaires, arbres) autour des parcelles.
    const siteEntry = resolveProp('site');
    if (siteEntry) {
      instantiateModel(siteEntry, { w: 60, d: 51 })
        .then((node) => {
          if (!ctx.alive) return;
          scene.add(node);
          env.setPlazaVisible(false);
          node.traverse((o) => { if (o.isMesh && /mirror_water/.test(o.material?.name || '')) landscape.adoptWater(o); }); // miroir d'eau animé
          landscape.adoptGround(node); // gazon et enrobé photo du site sur la prairie et la route extérieure
          // mâts d'éclairage de l'esplanade (empties light_site_*) : projecteurs réels, deux seulement sur téléphone
          ctx.siteLights = plotLights(scene, node, { max: Math.min(window.innerWidth, window.innerHeight) < 600 ? 2 : 4, power: 4.5, aim: 0.4 });
          ctx.applyMode();
        })
        .catch((err) => console.warn('[Empire3D] site GLB indisponible, esplanade procédurale conservée.', err));
    }
    setReady(true);

    // Écran de chargement : octets reçus des modèles, textures et ciels demandés par la scène (phase « assets »),
    // puis décodage et compilation (phase « prepare »). Fini quand tout est arrivé et que rien de neuf n'a été
    // demandé pendant deux relevés (les fichiers arrivent par vagues), ou au bout de 12 s.
    const loadStart = performance.now();
    let calm = 0;
    const loadTimer = setInterval(() => {
      const a = assetsProgress();
      const allIn = a.requested > 0 && a.settled >= a.requested;
      loadRef.current.onLoadProgress?.({ phase: allIn ? 'prepare' : 'assets', download: allIn ? 1 : a.total ? a.loaded / a.total : 0 });
      calm = allIn ? calm + 1 : 0;
      if (calm >= 2 || performance.now() - loadStart > 12000) {
        clearInterval(loadTimer);
        loadRef.current.onLoadProgress?.({ phase: 'prepare', download: 1 });
        // tous les matériaux compilés d'avance (projecteurs allumés et éteints), derrière l'écran de chargement : pas
        // d'à-coup quand un arbre passe en 3D, qu'un bâtiment apparaît ou que les projecteurs s'allument le soir
        loaded = true;
        const ready = () => {
          if (!ctx.alive) return;
          ctx.measuring = true; // fluidité mesurée seulement une fois tout chargé et compilé (pas les à-coups du départ)
          loadRef.current.onLoadProgress?.({ phase: 'done', download: 1 });
          loadRef.current.onLoaded?.();
        };
        Promise.race([ctx.syncSpots(), new Promise((r) => { setTimeout(r, 4000); })]).then(ready);
      }
    }, 150);

    // --- Pointeur : clic = sélection, survol = contour + étiquette ----------------------------------
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const wrappers = [...ctx.plots.values()].map((e) => e.wrapper).concat(ctx.trophies.group); // + parvis
    let down = null;
    let tapTimer = null;
    let hovered = null;
    let pointer = null;

    const pick = (clientX, clientY) => {
      const r = mount.getBoundingClientRect();
      ptr.x = ((clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      for (const h of ray.intersectObjects(wrappers, true)) {
        let o = h.object;
        while (o && o.userData.plotId === undefined) o = o.parent;
        if (o) return o.userData.plotId;
      }
      return null;
    };
    const setHovered = (id) => {
      if (id === hovered) return;
      hovered = id;
      setHover(id);
      if (id === 'parvis') frame.show(PARVIS.x, PARVIS.z, PARVIS.w, PARVIS.d);
      else if (id) {
        const [x, z] = PLOT_POS[id];
        const fp = footprintOf(id, stateRef.current.buildings?.terrain);
        frame.show(x, z, fp.w, fp.d);
      } else frame.hide();
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    };
    const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || modeRef.current.attract || modeRef.current.live) return; // direct : la réalisation garde la caméra
      const id = pick(e.clientX, e.clientY);
      const act = () => {
        if (id === 'parvis') { trophiesRef.current?.(); return; } // allée d'honneur : salle des trophées
        if (id && selectRef.current) { // parcelle verrouillée : l'inspecteur affiche la condition d'ouverture
          selectRef.current(id, PLOTS.find((p) => p.id === id).sector);
        } else if (!id) emptyRef.current?.(); // toucher à côté : on quitte la parcelle et la caméra revient
      };
      // au doigt, un tap attend un instant : s'il est suivi d'un second, c'est le geste de zoom, pas une sélection
      clearTimeout(tapTimer);
      if (e.pointerType === 'touch') tapTimer = setTimeout(act, 300);
      else act();
    };

    // Téléphone : double tap puis glisser, comme sur les cartes. Glisser vers le haut dézoome, vers le bas zoome ;
    // un double tap sans glisser zoome d'un cran. Le geste est intercepté avant OrbitControls et la sélection.
    let tap = null; // dernier appui court (instant, position)
    let press = null;
    let zoomDrag = null;
    const setDist = (d) => {
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, d));
      camera.position.copy(controls.target).addScaledVector(dir, dist);
    };
    const onCapDown = (e) => {
      if (e.pointerType !== 'touch' || !e.isPrimary || modeRef.current.live) return;
      const now = performance.now();
      press = { x: e.clientX, y: e.clientY, t: now };
      if (tap && now - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 40) {
        e.stopPropagation();
        clearTimeout(tapTimer); // le premier tap ne sélectionne rien
        tap = null;
        ctx.camTween = null;
        zoomDrag = { id: e.pointerId, y: e.clientY, d0: camera.position.distanceTo(controls.target), moved: false };
        controls.enabled = false;
      }
    };
    const onCapMove = (e) => {
      if (!zoomDrag || e.pointerId !== zoomDrag.id) return;
      e.stopPropagation();
      const dy = e.clientY - zoomDrag.y;
      if (Math.abs(dy) > 6) zoomDrag.moved = true;
      if (zoomDrag.moved) setDist(zoomDrag.d0 * Math.exp(-dy * 0.009));
    };
    const onCapUp = (e) => {
      if (zoomDrag && e.pointerId === zoomDrag.id) {
        e.stopPropagation();
        if (!zoomDrag.moved && e.type === 'pointerup') {
          const dir = camera.position.clone().sub(controls.target).normalize();
          const d = Math.max(controls.minDistance, zoomDrag.d0 * 0.6);
          ctx.tweenCamera({ pos: controls.target.clone().addScaledVector(dir, d), target: controls.target.clone() }, 0.45);
        }
        zoomDrag = null;
        controls.enabled = !modeRef.current.live && !modeRef.current.attract;
        return;
      }
      if (e.pointerType === 'touch' && press && e.type === 'pointerup') {
        const short = performance.now() - press.t < 280 && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10;
        tap = short ? { t: performance.now(), x: e.clientX, y: e.clientY } : null;
      }
      press = null;
    };
    const capture = { capture: true };
    mount.addEventListener('pointerdown', onCapDown, capture);
    mount.addEventListener('pointermove', onCapMove, capture);
    mount.addEventListener('pointerup', onCapUp, capture);
    mount.addEventListener('pointercancel', onCapUp, capture);
    // iPhone : un double tap maintenu est aussi le geste de sélection de texte de Safari. Le second appui est
    // bloqué à la source (pas de sélection, pas de zoom de la page), tout menu d'appui long est refusé, et une
    // sélection qui aurait quand même démarré est effacée quand le doigt se lève.
    let lastTouchEnd = 0;
    const onTouchStart = (e) => { if (e.touches.length === 1 && performance.now() - lastTouchEnd < 350) e.preventDefault(); };
    const onTouchEnd = () => { lastTouchEnd = performance.now(); window.getSelection?.()?.removeAllRanges(); };
    const noDefault = (e) => e.preventDefault();
    mount.addEventListener('touchstart', onTouchStart, { passive: false });
    mount.addEventListener('touchend', onTouchEnd);
    mount.addEventListener('selectstart', noDefault);
    mount.addEventListener('contextmenu', noDefault);
    const onMove = (e) => { pointer = down ? null : { x: e.clientX, y: e.clientY }; if (down) setHovered(null); };
    const onLeave = () => { pointer = null; setHovered(null); };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    // densité de l'écran changée sans changement de taille (fenêtre passée sur un autre écran) : même traitement
    let dprQuery = null;
    const onDpr = () => {
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onDprChange, { once: true });
    };
    const onDprChange = () => { if (!ctx.alive) return; refit(); onDpr(); };
    const refit = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.fov = fovFor(w / h);
      camera.updateProjectionMatrix();
      ctx.home = homeView(w / h);
      controls.maxDistance = Math.max(80, ctx.home.dist * 1.25);
      // densité de l'écran relue à chaque redimensionnement : zoom du navigateur, fenêtre passée sur un autre écran ;
      // la scène est toujours calculée à cette densité (un pixel calculé par pixel de l'écran, rien d'agrandi)
      const out = outputRatioFor() * ctx.fluid.scale;
      if (Math.abs(renderer.getPixelRatio() - out) > 0.01) renderer.setPixelRatio(out);
      renderer.setSize(w, h);
      ctx.frameOnce = true; // la toile redimensionnée est vide : en pause, une image pour la remplir
    };
    ctx.refit = refit;
    const ro = new ResizeObserver(refit);
    ro.observe(mount);
    onDpr();

    // --- Boucle de rendu (en pause hors écran / onglet caché) ---------------------------------------
    let onScreen = true;
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; });
    io.observe(mount);
    const timer = new THREE.Timer();
    let time = 0;
    const viewShift = { x: 0, y: 0 };
    const tmp = new THREE.Vector3();
    // Écran titre : la caméra tourne lentement autour du complexe (un tour en un peu plus de deux minutes), un peu
    // plus près et plus bas que la vue d'ensemble. Elle part de là où elle est (pas de saut) et rejoint l'orbite en
    // douceur ; au retour au jeu, elle glisse vers la vue d'ensemble.
    const orbitStep = (dt) => {
      const t = controls.target;
      let o = ctx.orbit;
      if (!o) {
        const off = camera.position.clone().sub(t);
        const r = Math.max(1, off.length());
        o = ctx.orbit = { az: Math.atan2(off.x, off.z), el: Math.asin(THREE.MathUtils.clamp(off.y / r, -1, 1)), r };
      }
      const want = ctx.home.pos.clone().sub(ctx.home.target);
      const k = Math.min(1, dt * 0.6);
      o.az += dt * 0.045;
      o.r += (want.length() * 0.86 - o.r) * k;
      o.el += (Math.asin(want.y / want.length()) * 0.82 - o.el) * k;
      t.lerp(ctx.home.target, k);
      camera.position.set(
        t.x + Math.sin(o.az) * Math.cos(o.el) * o.r,
        t.y + Math.sin(o.el) * o.r,
        t.z + Math.cos(o.az) * Math.cos(o.el) * o.r,
      );
    };
    let drewLast = false; // l'appel précédent a dessiné une image : l'écart entre les deux mesure la fluidité
    renderer.setAnimationLoop(() => {
      timer.update();
      const raw = timer.getDelta();
      const dt = Math.min(raw, 0.05);
      const measured = drewLast;
      drewLast = false;
      if (!onScreen || document.hidden) return;
      // menu pause : plus rien ne bouge ni ne se dessine, la dernière image reste à l'écran (floutée derrière le
      // menu) ; une image de plus seulement si la toile change de taille ou de qualité
      if (modeRef.current.paused && !ctx.frameOnce) return;
      // direct façon FM (0.7) : entre deux temps forts, le centre du match couvre tout l'écran : rien ne bouge ni ne se
      // dessine, la 3D ne tourne que pendant les temps forts
      if (modeRef.current.live && !matchFeed.show3D) return;
      ctx.frameOnce = false;
      time += dt;
      if (modeRef.current.attract && !ctx.camTween) orbitStep(dt);
      if (ctx.camTween) {
        const tw = ctx.camTween;
        tw.t = Math.min(1, tw.t + dt / tw.duration);
        const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
        camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
        controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
        if (tw.t >= 1) {
          ctx.camTween = null;
          tw.onDone?.();
          if (!ctx.replay) controls.minDistance = ctx.sheetOpen ? Math.min(6, camera.position.distanceTo(controls.target) * 0.8) : 6;
        }
      }
      controls.update();
      const camDist = camera.position.distanceTo(controls.target);
      const fogBase = scene.fog && scene.userData.fogBase;
      if (fogBase) {
        // Le brouillard suit le recul de la caméra : le complexe reste net (jusqu'à ~25 unités au-delà de la cible),
        // puis le décor se fond peu à peu au loin.
        const d = camDist;
        const k = Math.max(1, d / HOME_DIST);
        scene.fog.near = Math.max(fogBase[0], d + 35);
        scene.fog.far = Math.max(scene.fog.near + 120, Math.min(fogBase[1] * k, d + 320));
      }
      if (pointer) { setHovered(modeRef.current.attract || modeRef.current.live ? null : pick(pointer.x, pointer.y)); pointer = null; }
      frame.update(time);
      selFrame.update(time * 0.6);
      let shakeX = 0, shakeY = 0;
      if (ctx.shake > 0) { // tremblement de caméra (but encaissé), appliqué le temps du rendu seulement
        ctx.shake = Math.max(0, ctx.shake - dt);
        shakeX = (Math.random() - 0.5) * ctx.shake * 0.05;
        shakeY = (Math.random() - 0.5) * ctx.shake * 0.05;
      }
      if (ctx.ledBoost > 1) { ctx.ledBoost = Math.max(1, ctx.ledBoost - dt * 0.7); setAssetsBoost(ctx.ledBoost); }
      const sdt = dt * ctx.timeScale;
      const mi = squad.update(dt, time);
      crowd.update(dt, time);
      // direct : réalisation télé (sauf si le joueur déplace lui-même la caméra)
      if (mi?.cut) ctx.camTween = null; // un temps fort commence : la réalisation prend la main tout de suite
      if (!(mi?.cam === 'replay' && mi.angle)) ctx.restorePolar(); // l'angle sous l'horizon n'est permis que le temps du ralenti
      if (mi && modeRef.current.live && mi.live && !ctx.camTween && !(ctx.userCam > performance.now())) broadcastStep(mi, dt);
      ctx.anims.forEach((a) => { a.update(dt); if (a.done) ctx.anims.delete(a); });
      if (ctx.holo) { // aperçu : l'hologramme sort de terre puis respire
        const h = ctx.holo;
        h.t += dt;
        h.node.scale.y = Math.max(0.02, holoRise(Math.min(1, h.t / 0.55)));
        // appui long sur « Construire » (téléphone) : l'hologramme se charge de lumière et respire plus vite
        const c = holdCharge.value;
        h.phase = (h.phase || 0) + dt * (2.6 + 9 * c);
        const pulse = 0.5 + 0.5 * Math.sin(h.phase);
        h.body.opacity = 0.15 + 0.09 * pulse + 0.42 * c;
        h.edge.opacity = Math.min(1, 0.6 + 0.32 * pulse + 0.4 * c);
        // caméra en vitrine : lente oscillation autour de la parcelle (±24°), suspendue quand le joueur la manie
        const sw = ctx.holoSway;
        if (sw && !ctx.camTween && !(ctx.userCam > performance.now())) {
          sw.t += dt;
          const ang = Math.sin(sw.t * ((2 * Math.PI) / 14)) * 0.42;
          tmp.subVectors(camera.position, controls.target).applyAxisAngle(UP, ang - sw.prev);
          sw.prev = ang;
          camera.position.copy(controls.target).add(tmp);
          camera.lookAt(controls.target);
        }
      }
      fireworks.update(sdt);
      life.update(dt, time);
      ctx.trophies.update(dt);
      landscape.update(dt, time, camera);
      // pastilles dorées : projetées au-dessus de leur parcelle, masquées sous l'étiquette de survol
      for (const [id, el] of pinRefs.current) {
        const e = ctx.plots.get(id);
        if (!el || !e) continue;
        tmp.set(e.wrapper.position.x, e.height * (e.content?.scale.y ?? 1) + 0.28, e.wrapper.position.z).project(camera);
        const visible = tmp.z < 1 && id !== hovered;
        el.style.opacity = visible ? '1' : '0';
        if (visible) el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * mount.clientWidth}px, ${(-tmp.y * 0.5 + 0.5) * mount.clientHeight}px) translate(-50%, -100%)`;
      }
      if (hovered && labelRef.current) {
        const e = ctx.plots.get(hovered);
        if (e) tmp.set(e.wrapper.position.x, e.height * (e.content?.scale.y ?? 1) + 0.5, e.wrapper.position.z).project(camera);
        else tmp.set(PARVIS.x, 1.1, PARVIS.z).project(camera); // parvis
        const x = (tmp.x * 0.5 + 0.5) * mount.clientWidth;
        const y = (-tmp.y * 0.5 + 0.5) * mount.clientHeight;
        labelRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
      // En direct, le centre optique glisse dans la zone libre : à gauche du fil de commentaires
      // (desktop) ou au-dessus (mobile), pour que l'action et le but restent visibles.
      const W = mount.clientWidth, H = mount.clientHeight;
      const narrow = W <= 760;
      // Fiche d'une parcelle ouverte : la parcelle glisse au-dessus de la feuille (mobile) ou à droite de la
      // carte de l'inspecteur (PC), pour rester visible.
      // Écran titre : le complexe se décale vers la droite (PC) ou vers le haut (téléphone), hors du menu.
      const sheet = ctx.sheetOpen && ctx.frameShift && !modeRef.current.live;
      const attract = modeRef.current.attract;
      const wantX = attract ? (narrow ? 0 : -W * 0.15) : modeRef.current.live ? 0 : sheet ? ctx.frameShift.x : 0;
      const wantY = attract ? (narrow ? H * 0.14 : 0) : modeRef.current.live ? 0 : sheet ? ctx.frameShift.y : 0;
      viewShift.x += (wantX - viewShift.x) * Math.min(1, dt * 2.6);
      viewShift.y += (wantY - viewShift.y) * Math.min(1, dt * 2.6);
      if (Math.abs(viewShift.x) + Math.abs(viewShift.y) > 0.5) camera.setViewOffset(W, H, viewShift.x, viewShift.y, W, H);
      else if (camera.view?.enabled) camera.clearViewOffset();
      camera.updateMatrixWorld();
      env.update(dt, camera); // fondu du ciel et des lumières, brume couleur d'horizon
      camera.position.x += shakeX; camera.position.y += shakeY;
      // dessinée aussi derrière l'écran de chargement : chaque modèle compile ses matériaux dès son arrivée, pendant
      // que les suivants se téléchargent (sans cela, tout se compilait d'un bloc à la fin : 8 s au lieu de 3,5 s)
      draw();
      camera.position.x -= shakeX; camera.position.y -= shakeY;
      drewLast = true;
      if (ctx.measuring) ctx.fluid.frame(measured ? raw * 1000 : null);
    });

    return () => {
      ctx.clearHolo();
      clearTimeout(ctx.holoFrameTimer);
      ctx.alive = false;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      dprQuery?.removeEventListener('change', onDprChange);
      ['pointerdown', 'pointerup', 'pointermove', 'pointerleave'].forEach((ev, i) => {
        renderer.domElement.removeEventListener(ev, [onDown, onUp, onMove, onLeave][i]);
      });
      mount.removeEventListener('touchstart', onTouchStart);
      mount.removeEventListener('touchend', onTouchEnd);
      mount.removeEventListener('selectstart', noDefault);
      mount.removeEventListener('contextmenu', noDefault);
      [['pointerdown', onCapDown], ['pointermove', onCapMove], ['pointerup', onCapUp], ['pointercancel', onCapUp]]
        .forEach(([ev, fn]) => mount.removeEventListener(ev, fn, capture));
      clearTimeout(tapTimer);
      controls.dispose();
      ctx.anims.forEach((a) => a.finish());
      ctx.plots.forEach((e) => { e.lights?.dispose(); });
      ctx.siteLights?.dispose();
      landscape.dispose();
      ctx.trophies.dispose();
      squad.dispose();
      crowd.dispose();
      clearInterval(clockTimer);
      clearInterval(loadTimer);
      life.dispose();
      fireworks.dispose();
      frame.dispose();
      selFrame.dispose();
      env.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
  }, []);

  // Changement d'état de jeu : rendu incrémental, chantier animé sur les constructions / améliorations.
  useEffect(() => {
    if (ctxRef.current) { ctxRef.current.sync(state, true); ctxRef.current.applyMode(); }
    ctxRef.current?.life?.setState(state);
    ctxRef.current?.plots.get('t0')?.squad?.setFormation(state.formation);
  }, [state]);

  useEffect(() => {
    Object.assign(modeRef.current, { timeMode, matchDay, live });
    ctxRef.current?.applyMode();
  }, [timeMode, matchDay, live, ready]);

  useEffect(() => {
    modeRef.current.paused = paused;
    if (ctxRef.current) ctxRef.current.frameOnce = true;
  }, [paused]);

  // Épreuves d'entraînement (plein écran, opaque) : le complexe ne se voit plus. Passé le fondu d'ouverture, son image
  // rendue est réduite à un pixel (de l'ordre de 130 Mo de moins sur iPhone pendant la séance, qui a sa propre toile).
  // Au retour, elle retrouve sa taille et elle est redessinée avant le premier affichage : jamais d'image vide.
  useLayoutEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return undefined;
    if (hidden) {
      const t = setTimeout(() => { ctx.shrunk = true; ctx.renderer.setSize(1, 1, false); }, 800);
      return () => clearTimeout(t);
    }
    if (ctx.shrunk) { ctx.shrunk = false; ctx.refit(); ctx.draw(); }
    return undefined;
  }, [hidden]);

  // Écran titre : caméra en vitrine, sans interaction ; au retour au jeu, elle glisse vers la vue d'ensemble.
  useEffect(() => {
    modeRef.current.attract = attract;
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    ctx.controls.enabled = !attract && !live;
    ctx.orbit = null;
    if (attract) ctx.camTween = null;
    else ctx.tweenCamera(ctx.home, 2.2);
  }, [attract, ready]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    const arena = (stateRef.current.buildings?.terrain || 0) >= 5;
    // direct : la réalisation tient la caméra du début à la fin (ni rotation, ni zoom, ni déplacement)
    ctx.controls.enabled = !modeRef.current.attract && !live;
    ctx.tweenCamera(live ? (arena ? TV_VIEW_ARENA : TV_VIEW) : matchDay ? (arena ? MATCH_VIEW_ARENA : MATCH_VIEW) : ctx.home);
  }, [matchDay, live, recenter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jour de match : couleurs de l'adversaire, remplissage des tribunes selon l'affluence attendue (ou réelle).
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    const opp = matchInfo?.opp || '';
    const away = matchKitOf(opp); // tenue de match lisible face à notre or (0.8.7)
    ctx.plots.get('t0')?.squad?.setKits(HOME_KIT, away);
    ctx.crowdFill = matchInfo?.capacity ? Math.min(1, (matchInfo.attendance || 0) / matchInfo.capacity) : 0.6;
    ctx.awayColor = away.shirt;
    ctx.postMatch = !!matchInfo?.played;
    ctx.applyMode();
  }, [matchInfo?.opp, matchInfo?.attendance, matchInfo?.capacity, matchInfo?.played, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parcelle sélectionnée (inspecteur ouvert) : contour doré persistant. Quand on la quitte, la caméra revient
  // à la vue d'ensemble.
  const wasSelected = useRef(false);
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const had = wasSelected.current;
    wasSelected.current = !!selectedPlot;
    ctx.sheetOpen = !!selectedPlot;
    if (selectedPlot) {
      const [x, z] = PLOT_POS[selectedPlot];
      const fp = footprintOf(selectedPlot, stateRef.current.buildings?.terrain);
      ctx.selFrame.show(x, z, fp.w + 0.2, fp.d + 0.2);
      // la fiche vient d'être affichée : on mesure la zone libre à l'image suivante, une fois sa mise en page faite
      // (un aperçu de bâtiment sur cette parcelle fait son propre cadrage, fenêtre d'aperçu comprise)
      setTimeout(() => {
        if (!ctxRef.current || !mountRef.current || !ctx.sheetOpen || ctx.holoSpec?.plotId === selectedPlot) return;
        ctx.framePlot(selectedPlot);
      }, 40);
    } else {
      ctx.selFrame.hide();
      if (had && !modeRef.current.matchDay && !modeRef.current.live) ctx.tweenCamera(ctx.home, 1.1);
    }
  }, [selectedPlot, ready]);

  // Aperçu d'un bâtiment (vitrine de construction) : hologramme sur la parcelle, caméra en vitrine.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    if (holo?.key) {
      ctx.holoSpec = holo;
      ctx.setHolo(holo);
    } else {
      const shownOn = ctx.holoFramed?.plotId;
      ctx.holoSpec = null;
      ctx.holoToken += 1; // un modèle encore en chargement ne s'affichera pas
      ctx.clearHolo();
      ctx.holoFramed = null;
      // fin d'un aperçu, fiche toujours ouverte sur la même parcelle (chantier lancé, fenêtre d'aperçu refermée) : la
      // zone libre a changé, la caméra recadre le bâtiment (au moins la hauteur d'un chantier)
      if (selectedPlot && shownOn === selectedPlot) {
        setTimeout(() => { if (ctxRef.current && mountRef.current && ctx.sheetOpen && !ctx.holoSpec) ctx.framePlot(selectedPlot, 2); }, 80);
      }
    }
  }, [holo?.plotId, holo?.key, holo?.lvl, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // la fenêtre d'aperçu s'ouvre ou se ferme (PC) : la zone libre change, le cadrage suit
  useEffect(() => { if (ready && holo?.key && window.innerWidth > 760) ctxRef.current?.frameHolo(true); }, [holo?.windowOpen, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = hover === 'parvis' ? parvisInfo(state) : hover && hover !== selectedPlot ? plotInfo(state, hover) : null;

  return (
    <div className="scene3d">
      <div className="scene3d-canvas" ref={mountRef} />
      {/* épingles posées sur les bâtiments : flèche dorée (construction ou amélioration payable), « Séance » sur le
          centre d'entraînement (épreuves encore à jouer avant le match) ; les deux côte à côte sur la même parcelle */}
      {ready && [...new Set([...badges, ...(session ? [session.plotId] : [])])].filter((id) => id !== selectedPlot).map((id) => (
        <div
          key={id}
          className="plotpin"
          data-plot={id}
          ref={(el) => { if (el) pinRefs.current.set(id, el); else pinRefs.current.delete(id); }}
        >
          <span className="pin-tags">
            {session?.plotId === id && (
              <button className="pin-tag dark" onClick={() => onSession?.()} aria-label={`Séance d’entraînement : ${session.count} épreuve${session.count > 1 ? 's' : ''} à jouer avant le match`}>
                <IconTraining />Séance<em>{session.count}</em>
              </button>
            )}
            {badges.includes(id) && (
              <button className="pin-tag" onClick={() => selectRef.current(id, PLOTS.find((p) => p.id === id).sector, { pin: true })} aria-label="Construction ou amélioration disponible">
                <IconArrowUp />
              </button>
            )}
          </span>
          <i className="pin-stem" aria-hidden="true" /><i className="pin-foot" aria-hidden="true" />
        </div>
      ))}
      {info && (
        <div className="plotlabel" ref={labelRef}>
          <span className="pl-eyebrow">{info.eyebrow}</span>
          <span className="pl-title">{info.title}{info.level && <em>{info.level}</em>}</span>
          <span className="pl-detail">{info.detail}</span>
        </div>
      )}
    </div>
  );
}
