import React, { useEffect, useRef, useState } from 'react';
import { FOMonogram } from './brand';

// Écran de chargement, façon jeu de console : logo au centre, astuce en bas à gauche, étape et pourcentage en bas
// à droite, fine barre dorée sur toute la largeur. La même mise en page existe en HTML pur dans index.html (où
// vivent aussi ses styles), pour l'instant où le code du jeu n'est pas encore arrivé : on passe de l'un à l'autre
// sans saut (même progression, mêmes animations, reprises là où elles en étaient).
//
// Progression : chaque phase a sa part de la barre et avance pour de vrai.
// - démarrage (code du jeu, lancement du moteur 3D : le processeur est pris, rien ne peut se dessiner) : le début
//   de la barre est animé par la carte graphique (index.html), le pourcentage n'est pas encore affiché ;
// - fichiers 3D (modèles, textures, ciel) : octets reçus sur octets attendus, de 18 à 84 % ;
// - préparation (décodage, compilation des matériaux pour la carte graphique) : jusqu'à 98 %, puis 100 %.
// L'affichage glisse vers la valeur visée sans jamais reculer, et la barre garde un reflet animé par la carte
// graphique : elle vit même quand le processeur est occupé à décoder un modèle.

const TIPS = [
  'Un stade plus grand accueille plus de spectateurs : billetterie, buvette et boutique en profitent.',
  'Former un jeune puis le revendre une fois progressé rapporte ; acheter et revendre aussitôt fait perdre de l’argent.',
  'Les deux premiers montent, les deux derniers descendent : chaque point compte.',
  'À la mi-temps, change de tactique ou fais entrer un remplaçant pour renverser le match.',
  'L’espace supporters remplit mieux le stade et augmente la réputation gagnée à chaque match.',
  'Le siège des partenaires rapporte même quand tu n’es pas là.',
  'L’académie révèle un jeune talent à fort potentiel à chaque fin de saison.',
  'Surveille la part des salaires dans tes revenus : c’est elle qui fait basculer une saison dans le rouge.',
  'Avant le match, « Meilleur onze » aligne d’un geste ta meilleure équipe.',
  'Le bureau des transferts ouvre un marché de joueurs sous contrat, avec des indemnités négociées.',
  'Échap (ou Start à la manette) met le jeu en pause à tout moment.',
];

const stepOf = (p, done) => (done && p >= 1 ? 'Prêt' : p < 0.18 ? 'Démarrage du moteur' : p < 0.5 ? 'Chargement du complexe' : p < 0.84 ? 'Mise en place du décor' : 'Réglage des projecteurs');

function targetOf(info, done, now, marks) {
  if (done) return 1;
  const phase = info?.phase || 'code';
  if (marks[phase] == null) marks[phase] = now;
  const t = (now - marks[phase]) / 1000;
  const ease = (tau) => 1 - Math.exp(-t / tau);
  if (phase === 'code') return 0.1 + 0.08 * ease(1.6);
  if (phase === 'assets') return 0.18 + 0.66 * Math.max(info.download || 0, 0.06 * ease(2.5));
  return 0.84 + 0.14 * ease(1.5);
}

// info : null tant que le moteur 3D n'est pas arrivé, puis { phase: 'assets' | 'prepare', download: 0 à 1 }.
// done : scène prête ; la barre file à 100 %, puis onFinished. fixed : valeur figée (galerie d'écrans).
export function LoadingScreen({ info = null, done = false, fixed = null, onFinished }) {
  const boot = typeof window !== 'undefined' ? window.__foBoot : null;
  const [t0] = useState(() => boot?.t0 ?? performance.now());
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const bar = useRef(null);
  const pct = useRef(null);
  const step = useRef(null);
  const live = useRef({ info, done, onFinished });
  live.current = { info, done, onFinished };
  const ended = useRef(false);
  const finish = () => { // une seule fois : par l'animation de la barre, ou par la minuterie de secours
    if (ended.current) return;
    ended.current = true;
    live.current.onFinished?.();
  };

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 5200);
    return () => clearInterval(t);
  }, []);

  // Onglet en arrière-plan (lien ouvert dans un nouvel onglet) : le navigateur ne dessine plus d'images, la barre
  // n'avance plus ; la scène prête, on termine quand même pour que l'écran titre attende le joueur à son retour.
  useEffect(() => {
    if (!done || fixed != null) return undefined;
    const t = setTimeout(finish, 1600);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let shown = fixed ?? 0; // sous le début de barre animé d'index.html tant qu'elle ne le dépasse pas
    let label = '';
    let lastPct = -1;
    const trace = import.meta.env.DEV ? (window.__ldLog = []) : null; // relevé de la progression (mesures)
    const paint = (isDone) => {
      if (bar.current) bar.current.style.transform = `scaleX(${shown})`;
      const p = Math.floor(shown * 100);
      if (p !== lastPct) {
        lastPct = p;
        if (pct.current) pct.current.textContent = String(p);
        trace?.push([Math.round(performance.now()), p, live.current.info?.phase || 'code']);
      }
      const l = stepOf(shown, isDone);
      if (l !== label && step.current) { label = l; step.current.textContent = l; }
    };
    paint(false);
    if (fixed != null) return undefined;
    const marks = {};
    let last = performance.now();
    let finished = 0;
    let raf = requestAnimationFrame(function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { info: inf, done: isDone } = live.current;
      const target = targetOf(inf, isDone, now, marks);
      if (target > shown) {
        const k = 1 - Math.exp(-dt / (isDone ? 0.12 : 0.35));
        shown = Math.min(target, Math.max(shown + (target - shown) * k, shown + dt * 0.004)); // jamais figée
        if (isDone && shown > 0.996) shown = 1;
      }
      paint(isDone);
      if (isDone && shown >= 1 && !finished) finished = now;
      if (finished && now - finished > 280) {
        cancelAnimationFrame(raf);
        finish();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [fixed]); // eslint-disable-line react-hooks/exhaustive-deps

  // animations de fond reprises là où l'écran HTML les avait laissées (calculé une fois : changer le délai d'une
  // animation en cours la ferait sauter)
  const [style] = useState(() => ({ '--ld-delay': `${-Math.round(performance.now() - t0)}ms` }));
  return (
    <div className="ld" style={style} data-live={info || fixed != null ? '' : undefined} role="status" aria-label="Chargement de FootOFF Empire">
      <div className="ld-glow" aria-hidden="true" />
      <div className="ld-center">
        <div className="ld-logo">
          <FOMonogram className="ld-mono" />
          <span className="ld-words"><span className="ld-name">Foot<b>OFF</b></span><span className="ld-sub">Empire</span></span>
        </div>
      </div>
      <div className="ld-bottom">
        <p className="ld-tip" key={tip}><span className="ld-tip-label">Astuce</span><span className="ld-tip-text">{TIPS[tip]}</span></p>
        <div className="ld-status">
          <svg className="ld-spin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
          <span className="ld-step" ref={step} />
          <span className="ld-pct"><b ref={pct}>0</b> %</span>
        </div>
      </div>
      <div className="ld-bar" aria-hidden="true"><b /><i ref={bar} /></div>
    </div>
  );
}
