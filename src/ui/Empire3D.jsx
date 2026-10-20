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
import { createSquad } from '../three/players';
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

const MATCH_VIEW = { pos: new THREE.Vector3(11, 8.5, 14), target: new THREE.Vector3(0, 0.4, -0.5) };
// match en direct : caméra « télé » en tribune latérale, et plan rapproché sur la surface pour les ralentis
const TV_VIEW = { pos: new THREE.Vector3(0, 5.4, 10.8), target: new THREE.Vector3(0, 0, 0.8) };
const GOAL_VIEW = { pos: new THREE.Vector3(3.2, 0.62, 1.95), target: new THREE.Vector3(4.4, 0.1, 0) }; // plan serré du ralenti

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

// Vue 3D plein écran : décor permanent du jeu, pilotée par le HUD (nuit, jour de match, recentrage,
// parcelle sélectionnée). Garde ses propres interactions : survol (étiquette) et clic (sélection).
export default function Empire3D({
  state, onSelectPlot, onEmptyTap, onWebGLFail, timeMode = 'auto', weatherMode = 'auto', matchDay = false, recenter = 0, selectedPlot = null,
  live = false, matchFx = null, badges = [], quality = 'auto', onLoadProgress, onLoaded,
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

    const scene = new THREE.Scene();
    const env = createEnvironment(scene, renderer);
    const aspect0 = mount.clientWidth / Math.max(1, mount.clientHeight);
    const home0 = homeView(aspect0);
    const camera = new THREE.PerspectiveCamera(fovFor(aspect0), aspect0, 0.5, 600);
    camera.position.copy(home0.pos);
    renderer.domElement.style.cursor = 'grab';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(HOME_VIEW.target);
    controls.minDistance = 6;
    controls.maxDistance = Math.max(80, home0.dist * 1.25);
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = Math.PI * 0.08;

    const frame = hoverFrame();
    scene.add(frame.group);
    const selFrame = hoverFrame();
    scene.add(selFrame.group);
    const fireworks = new Fireworks(scene, new THREE.Vector3(0, 0, 0), 6);
    const life = createLife(scene);
    const weather = createWeather(scene);

    const ctx = {
      home: home0, scene, env, camera, controls, plots: new Map(), anims: new Set(), fireworks, camTween: null, alive: true, selFrame,
      life: null, timeScale: 1, replay: null, shake: 0, ledBoost: 1,
    };
    ctx.life = life;
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
    // le onze du club sur la pelouse (seules silhouettes humaines du stade)
    const squad = createSquad(stadium.wrapper);
    stadium.squad = squad;

    ctx.setContent = (entry, node) => {
      if (entry.content) entry.wrapper.remove(entry.content); // ressources partagées : pas de dispose ici
      entry.content = node;
      entry.wrapper.add(node);
      const real = node.name.startsWith('model:');
      // pelouse du stade : ~0,5 cm dans le GLB, plus haute dans le repli procédural
      if (entry.squad) entry.squad.setMode({ baseY: real ? 0.006 : 0.226 });
      entry.lights?.dispose();
      entry.lights = real ? plotLights(scene, node, entry.id === 't0' ? { max: 6, power: 5 } : { max: 2, power: 1.6 }) : null;
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
        const fp = footprintOf(p.id);
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
              if (anim) anim.provide(node); else ctx.setContent(entry, node);
            })
            .catch((err) => {
              console.warn(`[Empire3D] GLB ${model.url} indisponible, repli procédural.`, err);
              if (anim && entry.sig === wanted) anim.provide(proc);
            });
        }
      }
    };

    // Jour / nuit / jour de match : éclairage, foule, projecteurs, feux d'artifice.
    // Heure : réelle (mode auto), forcée jour / nuit, ou coup d'envoi en soirée les jours de match.
    ctx.applyMode = () => {
      const { timeMode: tm, weatherMode: wm, matchDay: md, live: lv } = modeRef.current;
      const s = stateRef.current;
      const now = new Date();
      const hour = md ? 21.25 : tm === 'day' ? 13 : tm === 'night' ? 23 : now.getHours() + now.getMinutes() / 60;
      const sky = wm === 'auto' ? autoWeather(now) : wm;
      const stadiumLights = stadium.lights;
      const { dark } = env.setAmbience({ hour, weather: sky, hasStadiumLights: !stadiumLights });
      ctx.ambience = { hour, weather: sky, dark };
      weather.set(sky);
      life.setMode({ dark, matchDay: md });
      setProceduralNight(dark);
      setAssetsNight(dark);
      ctx.plots.forEach((e) => {
        if (!e.lights) return;
        if (e.id === 't0') e.lights.setLevel(md ? 1.5 : dark ? 1 : 0);
        else e.lights.setLevel(dark ? 0.8 : 0);
      });
      const lm = s.lastMatch;
      const won = !!lm && lm.gf > lm.ga;
      squad.setMode({ match: md });
      fireworks.active = md && won && !lv; // en direct : salves uniquement sur nos buts
    };

    // qualité graphique appliquée à chaud : résolution, puis ombres (les matériaux se recompilent)
    ctx.setQuality = (q) => {
      renderer.setPixelRatio(pixelRatioFor(q));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
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
    ctx.tweenCamera = (view, duration = 1.6) => {
      ctx.camTween = {
        t: 0, duration,
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
      instantiateModel(siteEntry, { w: 35, d: 27 })
        .then((node) => { if (ctx.alive) { scene.add(node); env.setPlazaVisible(false); } })
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
        loadRef.current.onLoadProgress?.(1);
        loadRef.current.onLoaded?.();
      }
    }, 150);

    // --- Pointeur : clic = sélection, survol = contour + étiquette ----------------------------------
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const wrappers = [...ctx.plots.values()].map((e) => e.wrapper);
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
      if (id) {
        const [x, z] = PLOT_POS[id];
        const fp = footprintOf(id);
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
      const dt = Math.min(timer.getDelta(), 0.05);
      if (!onScreen || document.hidden) return;
      time += dt;
      if (ctx.camTween) {
        const tw = ctx.camTween;
        tw.t = Math.min(1, tw.t + dt / tw.duration);
        const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
        camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
        controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
        if (tw.t >= 1) {
          ctx.camTween = null;
          if (!ctx.replay) controls.minDistance = 6;
        }
      }
      controls.update();
      const fogBase = scene.fog && scene.userData.fogBase;
      if (fogBase) { // le brouillard suit le recul de la caméra : la vue d'ensemble reste nette sur téléphone
        const k = Math.max(1, camera.position.distanceTo(controls.target) / HOME_DIST);
        scene.fog.near = fogBase[0] * k;
        scene.fog.far = fogBase[1] * k;
      }
      if (pointer) { setHovered(pick(pointer.x, pointer.y)); pointer = null; }
      frame.update(time);
      selFrame.update(time * 0.6);
      // ralenti d'un but : vitesse normale pendant l'action, ralenti dès la frappe, retour après le filet
      const rp = ctx.replay;
      if (rp) {
        rp.t += dt;
        camera.position.lerp(controls.target, dt * 0.05); // lent travelling avant pendant le ralenti
        const bs = squad.ball.state;
        if (bs === 'shot') { rp.shot = true; ctx.timeScale = 0.4; }
        if (rp.shot && bs === 'net') {
          rp.net += dt;
          if (!rp.burst) { rp.burst = true; fireworks.burst(8); ctx.ledBoost = 2.6; }
          ctx.timeScale = 0.6;
        }
        if (rp.net > 1.3 || rp.t > 6 || (rp.shot && bs === 'held')) {
          ctx.replay = null;
          ctx.timeScale = 1;
          if (modeRef.current.live) ctx.tweenCamera(TV_VIEW);
        }
      }
      let shakeX = 0, shakeY = 0;
      if (ctx.shake > 0) { // tremblement de caméra (but encaissé), appliqué le temps du rendu seulement
        ctx.shake = Math.max(0, ctx.shake - dt);
        shakeX = (Math.random() - 0.5) * ctx.shake * 0.05;
        shakeY = (Math.random() - 0.5) * ctx.shake * 0.05;
      }
      if (ctx.ledBoost > 1) { ctx.ledBoost = Math.max(1, ctx.ledBoost - dt * 0.7); setAssetsBoost(ctx.ledBoost); }
      const sdt = dt * ctx.timeScale;
      squad.update(sdt, time);
      ctx.anims.forEach((a) => { a.update(dt); if (a.done) ctx.anims.delete(a); });
      fireworks.update(sdt);
      life.update(dt, time);
      weather.update(dt, time, controls.target);
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
        tmp.set(e.wrapper.position.x, e.height * (e.content?.scale.y ?? 1) + 0.5, e.wrapper.position.z).project(camera);
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
      const sheet = ctx.sheetOpen && !modeRef.current.live;
      const wantX = modeRef.current.live && !narrow ? 188 : sheet && !narrow ? -170 : 0;
      const wantY = modeRef.current.live && narrow ? H * 0.18 : sheet && narrow ? H * 0.31 : 0;
      viewShift.x += (wantX - viewShift.x) * Math.min(1, dt * 3);
      viewShift.y += (wantY - viewShift.y) * Math.min(1, dt * 3);
      if (Math.abs(viewShift.x) + Math.abs(viewShift.y) > 0.5) camera.setViewOffset(W, H, viewShift.x, viewShift.y, W, H);
      else if (camera.view?.enabled) camera.clearViewOffset();
      camera.position.x += shakeX; camera.position.y += shakeY;
      renderer.render(scene, camera);
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
      [['pointerdown', onCapDown], ['pointermove', onCapMove], ['pointerup', onCapUp], ['pointercancel', onCapUp]]
        .forEach(([ev, fn]) => mount.removeEventListener(ev, fn, capture));
      clearTimeout(tapTimer);
      controls.dispose();
      ctx.anims.forEach((a) => a.finish());
      ctx.plots.forEach((e) => { e.lights?.dispose(); });
      squad.dispose();
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
  }, [state]);

  useEffect(() => {
    modeRef.current = { timeMode, weatherMode, matchDay, live };
    ctxRef.current?.applyMode();
  }, [timeMode, weatherMode, matchDay, live, ready]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !ready) return;
    ctx.tweenCamera(live ? TV_VIEW : matchDay ? MATCH_VIEW : ctx.home);
  }, [matchDay, live, recenter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { ctxRef.current?.setQuality?.(quality); }, [quality, ready]);

  // Temps forts du direct : ralenti sur nos buts, le stade s'éteint un instant quand on encaisse.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !matchFx) return;
    const stadium = ctx.plots.get('t0');
    if (matchFx.type === 'goal') {
      if (matchFx.fast) { // vitesse accélérée : pas de ralenti, juste la fête
        ctx.fireworks.burst(6);
        ctx.ledBoost = 2.4;
      } else if (stadium.squad) { // ~4 s : conduite, frappe au ralenti, filets, retour à la vue TV
        stadium.squad.scriptGoal();
        ctx.replay = { t: 0, shot: false, net: 0, burst: false };
        ctx.cutCamera(GOAL_VIEW);
      }
    } else if (matchFx.type === 'conceded') {
      ctx.shake = 0.7;
      stadium.lights?.setLevel(0.55);
      setTimeout(() => ctxRef.current?.applyMode(), 1800);
    } else if (matchFx.type === 'fulltime' || matchFx.type === 'skip') {
      if (ctx.replay) ctx.tweenCamera(TV_VIEW);
      ctx.replay = null;
      ctx.timeScale = 1;
    }
  }, [matchFx]);

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
      const fp = footprintOf(selectedPlot);
      ctx.selFrame.show(x, z, fp.w + 0.2, fp.d + 0.2);
      // cadrage : même angle de vue, distance adaptée à la taille de la parcelle
      const target = new THREE.Vector3(x, 0.4, z);
      const dir = ctx.camera.position.clone().sub(ctx.controls.target).normalize();
      const narrow = mountRef.current && mountRef.current.clientWidth <= 760; // téléphone : moins de place au-dessus de la fiche
      const dist = Math.max(fp.w, fp.d) * (selectedPlot === 't0' ? 1.55 : 2.4) * (narrow ? 1.75 : 1);
      ctx.tweenCamera({ pos: target.clone().addScaledVector(dir, dist), target });
    } else {
      ctx.selFrame.hide();
      if (had && !modeRef.current.matchDay && !modeRef.current.live) ctx.tweenCamera(ctx.home, 1.1);
    }
  }, [selectedPlot, ready]);

  const info = hover && hover !== selectedPlot ? plotInfo(state, hover) : null;

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
