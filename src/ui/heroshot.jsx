import React, { useEffect, useState } from 'react';

// Photo de studio d'un joueur 3D (three/hero3d.js), chargée à la demande : la 3D (three.js, joueurs réalistes) n'entre
// dans l'écran qu'au premier usage. En attendant (ou si la 3D est indisponible), le repli (fallback).
// 1.0.42 (PDG : « un petit millième de seconde où on voyait l'image du joueur avant sa modélisation 3D ») : une photo
// déjà faite s'affiche dès la première image (heroReady, sans attendre une promesse) ; les écrans préparent la photo dès
// que le doigt touche le joueur (prefetchHero) ; la fiche n'affiche plus le portrait en attendant, mais un emplacement.
let mod = null; // le studio, une fois chargé
const studio = () => (mod ? Promise.resolve(mod) : import('../three/hero3d').then((m) => { mod = m; return m; }));
// prépare la photo d'un joueur (même tenue, même pose que la fiche qui va s'ouvrir), sans rien afficher
export function prefetchHero(p, opts = {}) {
  if (!p) return;
  studio().then((m) => m.heroOf(p, opts)).catch(() => {});
}
// fallback : pendant l'attente ; unavailable : si la 3D ne vient pas (réseau coupé, contexte perdu), à la place d'une
// attente sans fin (relecture de la 1.0.42)
export function HeroShot({ p, kit, pose = 'stand', className = '', fallback = null, unavailable = null }) {
  const key = `${p?.id ?? p?.name}|${p?.age}|${p?.pos}|${kit?.shirt}|${kit?.trim}|${kit?.keeper}|${pose}`;
  const ready = mod && p ? mod.heroReady(p, { kit, pose }) : null;
  const [got, setGot] = useState(null); // { key, shot } : la photo arrivée pour ce joueur (url, position de la tête)
  useEffect(() => {
    let alive = true;
    if (!p || ready) return undefined;
    studio().then((m) => m.heroOf(p, { kit, pose })).then((s) => { if (alive) setGot({ key, shot: s }); }, () => { if (alive) setGot({ key, shot: null }); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = ready || (got?.key === key ? got.shot : null);
  if (!shot) return got?.key === key ? (unavailable ?? fallback) : fallback;
  return <img className={`hero-shot ${className}`} src={shot.url} style={{ '--hx': shot.hx }} alt="" draggable="false" />;
}
