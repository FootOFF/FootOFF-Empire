import React, { useMemo } from 'react';
import { makePlayer } from '../game/players';
import { createInitialState } from '../game/engine';
import { faceOf, silhouetteOf } from '../game/faces';
import { POS_LABELS } from '../game/constants';
import { Portrait } from './portrait';

// Planche de visages (galerie : ?ecran=visages), pour juger la variété d'un coup d'œil : 40 joueurs tirés comme sur le
// marché (18 à 36 ans), les mêmes en petit (taille des listes), un effectif de départ (aucun sosie) et des jeunes de
// l'académie.
export function FacesSheet() {
  const { crowd, squad, youth } = useMemo(() => {
    let id = 1;
    const mk = (opts, age) => {
      const p = makePlayer(age ? { ...opts, age } : opts);
      p.id = id++;
      p.num = (p.id % 30) + 1;
      return p;
    };
    const crowdList = Array.from({ length: 40 }, (_, k) => mk({ level: 2 + (k % 5) }, 18 + ((k * 7) % 19)));
    const s = createInitialState('FootOFF FC');
    const youthList = Array.from({ length: 8 }, () => mk({ youth: true, academy: 3 }));
    return { crowd: crowdList, squad: s.players, youth: youthList };
  }, []);
  const twins = new Set();
  const seen = new Map();
  for (const p of squad) {
    const k = silhouetteOf(faceOf(p), p.age);
    if (seen.has(k)) { twins.add(p.id); twins.add(seen.get(k)); }
    seen.set(k, p.id);
  }
  const cell = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 104, textAlign: 'center' };
  const name = { font: '600 12px/1.15 var(--font-body, Inter, sans-serif)', color: '#d8d4cc' };
  const sub = { font: '11px/1.2 var(--font-body, Inter, sans-serif)', color: '#8f8a80' };
  const head = { font: '700 15px var(--font-disp)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#c7a15a', margin: '18px 0 10px' };
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: '#0d0d10', padding: '16px 16px 40px' }}>
      <div style={head}>Visages · marché (96 px)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {crowd.map((p) => (
          <div key={p.id} style={cell}>
            <Portrait p={p} size={96} />
            <span style={name}>{p.name}</span>
            <span style={sub}>{p.age} ans · {POS_LABELS[p.pos]}</span>
          </div>
        ))}
      </div>
      <div style={head}>Les mêmes en petit (34 px)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {crowd.map((p) => <Portrait key={p.id} p={p} size={34} />)}
      </div>
      <div style={head}>Effectif de départ (52 px) · {twins.size ? `${twins.size} sosies` : 'aucun sosie'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {squad.map((p) => (
          <div key={p.id} style={{ ...cell, width: 76 }}>
            <Portrait p={p} size={52} />
            <span style={sub}>{p.name}</span>
          </div>
        ))}
      </div>
      <div style={head}>Académie (64 px)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {youth.map((p) => (
          <div key={p.id} style={{ ...cell, width: 84 }}>
            <Portrait p={p} size={64} club="Racing de Montfleury" />
            <span style={sub}>{p.name} · {p.age} ans</span>
          </div>
        ))}
      </div>
    </div>
  );
}
