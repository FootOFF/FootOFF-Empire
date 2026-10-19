import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { PLOTS, PLOT_LABELS, SECTORS, plotBuilding } from '../game/map';
import { fmtMoney } from './format';
import { PLOT_POS, PLAZA_CENTER, footprintOf, layoutOverlaps } from '../three/layout';
import { createRenderer, createEnvironment } from '../three/environment';
import { initAssets, instantiateModel, setAssetsBoost, setAssetsNight } from '../three/assets';
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
  state, onSelectPlot, onWebGLFail, timeMode = 'auto', weatherMode = 'auto', matchDay = false, recenter = 0, selectedPlot = null,
  live = false, matchFx = null,
}) {
  const mountRef = useRef(null);
  const labelRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ctxRef = useRef(null);
  const selectRef = useRef(onSelectPlot);
  selectRef.current = onSelectPlot;
  const modeRef = useRef({ timeMode: 'auto', weatherMode: 'auto', matchDay: false, live: false });

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
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.5, 600);
    camera.position.copy(HOME_VIEW.pos);
    renderer.domElement.style.cursor = 'grab';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(HOME_VIEW.target);
    controls.minDistance = 6;
    controls.maxDistance = 80;
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
      scene, env, camera, controls, plots: new Map(), anims: new Set(), fireworks, camTween: null, alive: true, selFrame,
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

    ctx.cutCamera = (view) => { // plan de coupe (ralenti) : pas de transition
      ctx.camTween = null;
      controls.minDistance = 1.5; // plan serré autorisé le temps du ralenti (rétabli à la fin du retour caméra)
      camera.position.copy(view.pos);
      controls.target.copy(view.target);
    };
    ctx.tweenCamera = (view) => {
      ctx.camTween = {
        t: 0,
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

    // --- Pointeur : clic = sélection, survol = contour + étiquette ----------------------------------
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const wrappers = [...ctx.plots.values()].map((e) => e.wrapper);
    let down = null;
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
      if (id && selectRef.current) { // parcelle verrouillée : l'inspecteur affiche la condition d'ouverture
        selectRef.current(id, PLOTS.find((p) => p.id === id).sector);
      }
    };
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
      camera.updateProjectionMatrix();
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
        tw.t = Math.min(1, tw.t + dt / 1.6);
        const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
        camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
        controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
        if (tw.t >= 1) {
          ctx.camTween = null;
          if (!ctx.replay) controls.minDistance = 6;
        }
      }
      controls.update();
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
      const wantX = modeRef.current.live && !narrow ? 188 : 0;
      const wantY = modeRef.current.live && narrow ? H * 0.18 : 0;
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
      controls.dispose();
      ctx.anims.forEach((a) => a.finish());
      ctx.plots.forEach((e) => { e.lights?.dispose(); });
      squad.dispose();
      clearInterval(clockTimer);
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
    ctx.tweenCamera(live ? TV_VIEW : matchDay ? MATCH_VIEW : HOME_VIEW);
  }, [matchDay, live, recenter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Parcelle sélectionnée (inspecteur ouvert) : contour doré persistant.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (selectedPlot) {
      const [x, z] = PLOT_POS[selectedPlot];
      const fp = footprintOf(selectedPlot);
      ctx.selFrame.show(x, z, fp.w + 0.2, fp.d + 0.2);
      // cadrage : même angle de vue, distance adaptée à la taille de la parcelle
      const target = new THREE.Vector3(x, 0.4, z);
      const dir = ctx.camera.position.clone().sub(ctx.controls.target).normalize();
      const dist = Math.max(fp.w, fp.d) * (selectedPlot === 't0' ? 1.55 : 2.4);
      ctx.tweenCamera({ pos: target.clone().addScaledVector(dir, dist), target });
    } else ctx.selFrame.hide();
  }, [selectedPlot, ready]);

  const info = hover && hover !== selectedPlot ? plotInfo(state, hover) : null;

  return (
    <div className="scene3d">
      <div className="scene3d-canvas" ref={mountRef} />
      {!ready && <div className="scene3d-fallback"><span className="eyebrow">Chargement de l’Empire…</span></div>}
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
