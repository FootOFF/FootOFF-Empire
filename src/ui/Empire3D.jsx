import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { PLOTS, PLOT_LABELS, SECTORS, plotBuilding } from '../game/map';
import { fmtMoney } from './format';
import { IconArrowUp } from './icons';
import { PLOT_POS, PLAZA_CENTER, footprintOf, layoutOverlaps } from '../three/layout';
import { createRenderer, createEnvironment, pixelRatioFor } from '../three/environment';
import { assetsProgress, initAssets, instantiateModel, setAssetsBoost, setAssetsNight } from '../three/assets';
import { resolveModel, resolveProp } from '../three/manifest';
import { plotLights } from '../three/lights';
import { BuildAnimation, Fireworks, hoverFrame } from '../three/fx';
import { createLife } from '../three/life';
import { createLandscape, heightAt } from '../three/landscape';
import { hookShadowMap, plantSpots } from '../three/forest';
import { createPostFX } from '../three/postfx';
import { momentAt } from '../three/sky';
import { PARVIS, createTrophies } from '../three/trophies';
import { honoursOf, plural } from '../game/honours';
import { createMatchScene } from '../three/matchplay';
import { createCrowd } from '../three/crowd';
import { HOME_KIT, kitOf } from '../game/kits';
import { autoWeather, createWeather } from '../three/weather';
import {
  buildingMesh, padMesh, setProceduralNight, stadiumMesh, wastelandMesh,
} from '../three/procedural';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
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

const MATCH_VIEW = { pos: new THREE.Vector3(11, 8.5, 14), target: new THREE.Vector3(0, 0.4, -0.5) };
// match en direct : caméra « télé » en tribune latérale, et plan rapproché sur la surface pour les ralentis
const TV_VIEW = { pos: new THREE.Vector3(0, 5.4, 10.8), target: new THREE.Vector3(0, 0, 0.8) };
const GOAL_VIEW = { pos: new THREE.Vector3(3.2, 0.62, 1.95), target: new THREE.Vector3(4.4, 0.1, 0) }; // plan serré du ralenti
// arène fermée (niveaux 5 et 6) : caméras un peu plus hautes pour passer au-dessus du toit côté caméra
const MATCH_VIEW_ARENA = { pos: new THREE.Vector3(10.5, 11.2, 13.4), target: new THREE.Vector3(0, 0.4, -0.5) };
const TV_VIEW_ARENA = { pos: new THREE.Vector3(0, 6.3, 10.2), target: new THREE.Vector3(0, 0, 0.8) };

// Ce qu'une parcelle doit afficher : la scène n'est reconstruite que si cette signature change.
function plotSpec(s, plotId, sectorId) {
  const key = plotBuilding(s, plotId);
  const unlocked = s.reputation >= SECTORS.find((x) => x.id === sectorId).repNeeded;
  if (key) return { kind: 'building', key, lvl: s.buildings[key], sig: `${key}:${s.buildings[key]}` };
  return unlocked ? { kind: 'pad', sig: 'pad' } : { kind: 'waste', sig: 'waste' };
}

function proceduralFor(spec) {
  if (spec.kind === 'pad') return padMesh();
  if (spec.kind === 'waste') return wastelandMesh();
  return spec.key === 'terrain' ? stadiumMesh(spec.lvl) : buildingMesh(spec.key, spec.lvl);
}

// Texte de l'étiquette de survol.
function plotInfo(s, plotId) {
  const plot = PLOTS.find((p) => p.id === plotId);
  const sec = SECTORS.find((x) => x.id === plot.sector);
  const key = plotBuilding(s, plotId);
  if (s.reputation < sec.repNeeded) {
    return { eyebrow: sec.short || sec.name, title: 'Secteur verrouillé', detail: `Réputation ${sec.repNeeded} requise`, locked: true };
  }
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
  state, onSelectPlot, onEmptyTap, onWebGLFail, timeMode = 'auto', weatherMode = 'auto', matchDay = false, recenter = 0, selectedPlot = null,
  live = false, matchFx = null, badges = [], quality = 'auto', onLoadProgress, onLoaded, matchInfo = null, onOpenTrophies,
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
  const loadRef = useRef({ onLoadProgress, onLoaded });
  loadRef.current = { onLoadProgress, onLoaded };
  const modeRef = useRef({ timeMode: 'auto', weatherMode: 'auto', matchDay: false, live: false });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !webglAvailable()) {
      if (onWebGLFail) onWebGLFail();
      return undefined;
    }
    let renderer;
    try {
      renderer = createRenderer(mount, quality);
    } catch {
      if (onWebGLFail) onWebGLFail();
      return undefined;
    }
    mount.appendChild(renderer.domElement);
    initAssets(renderer);
    hookShadowMap(renderer); // ombres des arbres affichés en imposteurs

    const scene = new THREE.Scene();
    const env = createEnvironment(scene, renderer, { quality });
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
    const weather = createWeather(scene);
    // écrin naturel : plateau, collines boisées, lac, route bordée de platanes ; il plante aussi les arbres du site
    const landscape = createLandscape(scene, { quality, siteTreesUrl: `${import.meta.env.BASE_URL}models/props/site_trees.json` });
    env.setGroundVisible(false);
    landscape.setVeilMaterial(env.veilMaterial(10, 52)); // le voile d'horizon montre le ciel qui est derrière lui
    env.onSkyEnv((tex, dark) => landscape.setSkyEnv(tex, dark));

    const ctx = {
      home: home0, scene, env, camera, controls, plots: new Map(), anims: new Set(), fireworks, camTween: null, alive: true, selFrame,
      life: null, timeScale: 1, replay: null, shake: 0, ledBoost: 1,
    };
    ctx.life = life;
    ctx.landscape = landscape;
    ctx.trophies = createTrophies(scene, renderer); // allée d'honneur du parvis (trophées gagnés)
    const post = createPostFX(renderer, scene, camera, quality); // ombres de contact, halo, étalonnage
    ctx.post = post;
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
    crowd.setQuality(quality);
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

    // Halo des lumières : de près, au-dessus du stade, les grandes surfaces lumineuses (LED de l'arène, gradins et
    // lignes sous les projecteurs) le changeaient en voile sur tout l'écran ; il y garde 40 % de sa force (comme
    // un œil qui s'habitue à la lumière), intact ailleurs et dès qu'on recule.
    ctx.haloScale = () => {
      const st = ctx.plots.get('t0')?.wrapper.position;
      if (!st) return 1;
      const near = 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(controls.target), 6, 18);
      const over = 1 - THREE.MathUtils.smoothstep(Math.hypot(controls.target.x - st.x, controls.target.z - st.z), 8, 14);
      return 1 - 0.6 * near * over;
    };
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
        const spec = plotSpec(s, p.id, p.sector);
        if (entry.sig === spec.sig) continue;
        const isUpdate = animate && entry.sig !== null;
        entry.sig = spec.sig;
        const fp = footprintOf(p.id, spec.lvl);
        const proc = proceduralFor(spec);
        const model = spec.kind === 'building'
          ? resolveModel(spec.key, spec.lvl)
          : resolveProp(spec.kind === 'pad' ? 'plot_empty' : 'plot_locked');
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

    // Jour / nuit / jour de match : ciel, éclairage, foule, projecteurs, feux d'artifice.
    // Moment de la journée : heure réelle (mode auto, lever et coucher de la saison), forcé jour / nuit, ou soirée
    // les jours de match.
    ctx.applyMode = () => {
      const { timeMode: tm, weatherMode: wm, matchDay: md, live: lv } = modeRef.current;
      const s = stateRef.current;
      const now = new Date();
      const moment = ctx.forceMoment || momentAt(now, { timeMode: tm, matchDay: md }); // forceMoment : réglages (dév.)
      const sky = ctx.forceWeather || (wm === 'auto' ? autoWeather(now) : wm);
      const stadiumLights = stadium.lights;
      const { dark, lights } = env.setAmbience({ moment, weather: sky, hasStadiumLights: !stadiumLights });
      ctx.ambience = { moment, weather: sky, dark, lights };
      const lit = dark || lights > 0.5; // phares des voitures, bâtiments de repli allumés
      weather.set(sky);
      life.setMode({ dark: lit, matchDay: md });
      setProceduralNight(lit);
      setAssetsNight(lights); // fenêtres, LED, têtes de projecteurs : progressif
      landscape.setDark(dark);
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

    // Résolution adaptative : quand l'appareil ne tient plus ~50 images par seconde (grand écran très dense,
    // téléphone), la résolution de rendu descend par paliers, puis remonte dès qu'il y a de la marge. Jamais sous un
    // pixel de rendu par pixel d'écran (CSS) : tous les effets restent, l'interface reste nette. Un palier qui ne
    // tient pas n'est réessayé qu'après un délai qui double à chaque échec (pas de va-et-vient).
    const DRS_LEVELS = [1, 0.85, 0.72, 0.6, 0.5];
    const drs = { level: 0, frames: [], time: 0, good: 0, fails: new Map(), until: new Map(), active: false };
    ctx.drs = drs; // inspection et essais (développement)
    const drsRatio = (level = drs.level) => {
      const max = pixelRatioFor(ctx.quality);
      return Math.max(Math.min(1, max), max * DRS_LEVELS[level]);
    };
    const applyRatio = () => {
      const pr = drsRatio();
      if (Math.abs(renderer.getPixelRatio() - pr) < 0.01) return;
      renderer.setPixelRatio(pr);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      post.setSize(mount.clientWidth, mount.clientHeight);
    };
    const drsStep = (raw) => {
      if (!drs.active || raw > 0.25) return; // retour d'un onglet caché, gros à-coup isolé : ne compte pas
      drs.frames.push(raw * 1000);
      drs.time += raw;
      if (drs.time < 1) return;
      const ms = drs.frames.sort((a, b) => a - b)[Math.floor(drs.frames.length / 2)]; // médiane : un à-coup isolé ne compte pas
      drs.frames = [];
      drs.time = 0;
      const now = performance.now();
      const lower = drs.level + 1 < DRS_LEVELS.length && drsRatio(drs.level + 1) < drsRatio() - 0.01;
      if (ms > 21 && lower) { // moins de ~48 images par seconde : palier en dessous, celui-ci mis de côté
        const fails = (drs.fails.get(drs.level) || 0) + 1;
        drs.fails.set(drs.level, fails);
        drs.until.set(drs.level, now + 30000 * 2 ** (fails - 1));
        drs.level += 1;
        drs.good = 0;
        applyRatio();
      } else if (ms < 18 && drs.level > 0) { // fluide : après trois secondes, on retente le palier au-dessus
        drs.good += 1;
        if (drs.good >= 3 && !((drs.until.get(drs.level - 1) || 0) > now)) {
          drs.level -= 1;
          drs.good = 0;
          applyRatio();
        }
      } else drs.good = 0;
    };
    drs.step = drsStep;

    // Projecteurs (mâts, parcelles, stade, trophée) : tous dans le calcul de la lumière ou aucun. Le jour, aucun
    // n'éclaire : ils en sortent (sinon chaque pixel de l'image les paierait, même à zéro). Jamais une partie
    // seulement : deux combinaisons de lumières en tout, compilées d'avance pour chaque nombre de projecteurs (au
    // chargement, puis quand un bâtiment en apporte), sans recompilation de plusieurs secondes à la tombée du jour.
    let loaded = false;
    let compiledFor = -1;
    const precompile = (spots) => {
      const shown = spots.map((l) => l.visible);
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(post.sceneTarget); // même cible que le rendu : mêmes programmes (sans tone mapping)
      spots.forEach((l) => { l.visible = true; });
      const lit = renderer.compileAsync(scene, camera); // lumières relevées tout de suite, compilation en fond
      spots.forEach((l) => { l.visible = false; });
      const unlit = renderer.compileAsync(scene, camera);
      spots.forEach((l, i) => { l.visible = shown[i]; });
      renderer.setRenderTarget(target);
      return Promise.all([lit, unlit]).then(() => {
        // le jour, une image avec les projecteurs dans le calcul mais à zéro (rien ne change à l'écran) : les
        // programmes hors de la scène (ombres, occlusion, reflet du lac) sont prêts aussi pour le soir
        if (!ctx.alive || spots.some((l) => l.visible)) return;
        spots.forEach((l) => { l.visible = true; });
        renderer.shadowMap.needsUpdate = true;
        post.render(0);
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

    // qualité graphique appliquée à chaud : résolution, puis ombres (les matériaux se recompilent)
    ctx.quality = quality;
    ctx.setQuality = (q) => {
      ctx.quality = q;
      Object.assign(drs, { level: 0, frames: [], time: 0, good: 0, fails: new Map(), until: new Map() });
      renderer.setPixelRatio(drsRatio());
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      post.setQuality(q);
      landscape.setQuality(q);
      env.setQuality(q);
      const shadows = q !== 'economie';
      if (renderer.shadowMap.enabled !== shadows) {
        renderer.shadowMap.enabled = shadows;
        scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
      }
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

    // Écran de chargement : progression des modèles demandés par la scène. Fini quand tout est arrivé et que
    // rien de neuf n'a été demandé pendant deux relevés (les modèles arrivent par vagues), ou au bout de 12 s.
    const loadStart = performance.now();
    let calm = 0;
    const loadTimer = setInterval(() => {
      const { requested, settled } = assetsProgress();
      loadRef.current.onLoadProgress?.(requested ? settled / requested : 1);
      calm = requested && settled >= requested ? calm + 1 : 0;
      if (calm >= 2 || performance.now() - loadStart > 12000) {
        clearInterval(loadTimer);
        // tous les matériaux compilés d'avance (projecteurs allumés et éteints), derrière l'écran de chargement : pas
        // d'à-coup quand un arbre passe en 3D, qu'un bâtiment apparaît ou que les projecteurs s'allument le soir
        loaded = true;
        const ready = () => {
          if (!ctx.alive) return;
          loadRef.current.onLoadProgress?.(1);
          loadRef.current.onLoaded?.();
          setTimeout(() => { drs.active = true; }, 3000); // résolution adaptative : après les compilations du départ
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
      if (moved > 6) return;
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
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
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
        controls.enabled = true;
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

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.fov = fovFor(w / h);
      camera.updateProjectionMatrix();
      ctx.home = homeView(w / h);
      controls.maxDistance = Math.max(80, ctx.home.dist * 1.25);
      renderer.setSize(w, h);
      post.setSize(w, h);
    });
    ro.observe(mount);

    // --- Boucle de rendu (en pause hors écran / onglet caché) ---------------------------------------
    let onScreen = true;
    const io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; });
    io.observe(mount);
    const timer = new THREE.Timer();
    let time = 0;
    const viewShift = { x: 0, y: 0 };
    const tmp = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      timer.update();
      const raw = timer.getDelta();
      const dt = Math.min(raw, 0.05);
      if (!onScreen || document.hidden) return;
      drsStep(raw);
      time += dt;
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
      const fogBase = scene.fog && scene.userData.fogBase;
      if (fogBase) {
        // Le brouillard suit le recul de la caméra : le complexe reste net (jusqu'à ~25 unités au-delà de la cible),
        // puis le décor se fond peu à peu au loin.
        const d = camera.position.distanceTo(controls.target);
        const k = Math.max(1, d / HOME_DIST);
        scene.fog.near = Math.max(fogBase[0], d + 35);
        scene.fog.far = Math.max(scene.fog.near + 120, Math.min(fogBase[1] * k, d + 320));
      }
      if (pointer) { setHovered(pick(pointer.x, pointer.y)); pointer = null; }
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
      // direct : la caméra télé glisse le long de la ligne de touche pour suivre l'action (sauf si le joueur la
      // déplace lui-même)
      if (mi && modeRef.current.live && mi.live && !ctx.camTween && !(ctx.userCam > performance.now())) {
        const want = THREE.MathUtils.clamp(mi.x * 0.6, -2.8, 2.8);
        const dx = (want - controls.target.x) * Math.min(1, dt * 1.5);
        controls.target.x += dx;
        camera.position.x += dx;
      }
      ctx.anims.forEach((a) => { a.update(dt); if (a.done) ctx.anims.delete(a); });
      fireworks.update(sdt);
      life.update(dt, time);
      ctx.trophies.update(dt);
      weather.update(dt, time, controls.target);
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
      const sheet = ctx.sheetOpen && ctx.frameShift && !modeRef.current.live;
      const wantX = modeRef.current.live && !narrow ? 188 : sheet ? ctx.frameShift.x : 0;
      const wantY = modeRef.current.live && narrow ? H * 0.18 : sheet ? ctx.frameShift.y : 0;
      viewShift.x += (wantX - viewShift.x) * Math.min(1, dt * 2.6);
      viewShift.y += (wantY - viewShift.y) * Math.min(1, dt * 2.6);
      if (Math.abs(viewShift.x) + Math.abs(viewShift.y) > 0.5) camera.setViewOffset(W, H, viewShift.x, viewShift.y, W, H);
      else if (camera.view?.enabled) camera.clearViewOffset();
      env.update(dt, camera); // fondu du ciel et des lumières, brume couleur d'horizon
      post.setLook(env.grade, ctx.haloScale());
      landscape.setSun(env.sunDir);
      camera.position.x += shakeX; camera.position.y += shakeY;
      renderer.shadowMap.needsUpdate = true; // ombres : une fois par image, au premier rendu de la scène
      post.render(dt);
      camera.position.x -= shakeX; camera.position.y -= shakeY;
    });

    return () => {
      ctx.alive = false;
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
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
      post.dispose();
      squad.dispose();
      crowd.dispose();
      clearInterval(clockTimer);
      clearInterval(loadTimer);
      life.dispose();
      weather.dispose();
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
    modeRef.current = { timeMode, weatherMode, matchDay, live };
    ctxRef.current?.applyMode();
  }, [timeMode, weatherMode, matchDay, live, ready]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    const arena = (stateRef.current.buildings?.terrain || 0) >= 5;
    ctx.tweenCamera(live ? (arena ? TV_VIEW_ARENA : TV_VIEW) : matchDay ? (arena ? MATCH_VIEW_ARENA : MATCH_VIEW) : ctx.home);
  }, [matchDay, live, recenter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ctxRef.current?.setQuality?.(quality); ctxRef.current?.crowd?.setQuality(quality); }, [quality, ready]);

  // Jour de match : couleurs de l'adversaire, remplissage des tribunes selon l'affluence attendue (ou réelle).
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    const opp = matchInfo?.opp || '';
    const away = kitOf(opp);
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
      // hauteur réelle du bâtiment affiché (modèle chargé ou procédural), emprise de la parcelle
      const entry = ctx.plots.get(selectedPlot);
      const h = entry ? Math.min(9, Math.max(0.8, new THREE.Box3().setFromObject(entry.wrapper).max.y)) : 2;
      const box = new THREE.Box3(new THREE.Vector3(x - fp.w / 2, 0, z - fp.d / 2), new THREE.Vector3(x + fp.w / 2, h, z + fp.d / 2));
      // la fiche vient d'être affichée : on mesure la zone libre à l'image suivante, une fois sa mise en page faite
      setTimeout(() => {
        if (!ctxRef.current || !mountRef.current || !ctx.sheetOpen) return;
        const view = frameView(ctx.camera, box, freeRegion(mountRef.current));
        ctx.frameShift = view.shift;
        ctx.controls.minDistance = Math.min(6, view.dist * 0.8);
        ctx.tweenCamera(view, 1.25);
      }, 40);
    } else {
      ctx.selFrame.hide();
      if (had && !modeRef.current.matchDay && !modeRef.current.live) ctx.tweenCamera(ctx.home, 1.1);
    }
  }, [selectedPlot, ready]);

  const info = hover === 'parvis' ? parvisInfo(state) : hover && hover !== selectedPlot ? plotInfo(state, hover) : null;

  return (
    <div className="scene3d">
      <div className="scene3d-canvas" ref={mountRef} />
      {ready && badges.filter((id) => id !== selectedPlot).map((id) => (
        <button
          key={id}
          className="plotpin"
          data-plot={id}
          ref={(el) => { if (el) pinRefs.current.set(id, el); else pinRefs.current.delete(id); }}
          onClick={() => selectRef.current(id, PLOTS.find((p) => p.id === id).sector)}
          aria-label="Construction ou amélioration disponible"
        >
          <i><IconArrowUp /></i>
        </button>
      ))}
      {info && (
        <div className={`plotlabel ${info.locked ? 'locked' : ''}`} ref={labelRef}>
          <span className="pl-eyebrow">{info.eyebrow}</span>
          <span className="pl-title">{info.title}{info.level && <em>{info.level}</em>}</span>
          <span className="pl-detail">{info.detail}</span>
        </div>
      )}
    </div>
  );
}
