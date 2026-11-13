import React, { useEffect, useState } from 'react';

// Photo de studio d'un joueur 3D (three/hero3d.js), chargée à la demande : la 3D (three.js, joueurs réalistes) n'entre
// dans l'écran qu'au premier usage. En attendant (ou si la 3D est indisponible), le repli : le portrait du joueur.
export function HeroShot({ p, kit, pose = 'stand', className = '', fallback = null }) {
  const [shot, setShot] = useState(null); // { url, hx } : l'image et la position de la tête sur sa largeur
  const key = `${p?.id ?? p?.name}|${kit?.shirt}|${kit?.trim}|${kit?.keeper}|${pose}`;
  useEffect(() => {
    let alive = true;
    setShot(null);
    if (!p) return undefined;
    import('../three/hero3d').then((m) => m.heroOf(p, { kit, pose })).then((s) => { if (alive) setShot(s); }, () => {});
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shot) return fallback;
  return <img className={`hero-shot ${className}`} src={shot.url} style={{ '--hx': shot.hx }} alt="" draggable="false" />;
}
