import React from 'react';
import { BUILDINGS } from '../game/constants';
import { PLOTS, SECTORS, plotBuilding } from '../game/map';
import { IconAcademy, IconFans, IconLock, IconPitch, IconPlus, IconSponsor, IconTraining } from './icons';

const ICONS = { terrain: IconPitch, training: IconTraining, academy: IconAcademy, fans: IconFans, sponsor: IconSponsor };

// Repli 2D quand WebGL est indisponible : plan de l'Empire par secteurs, mêmes interactions que la 3D.
export default function Empire2D({ state, onSelect }) {
  return (
    <div className="empire2d">
      {SECTORS.map((sec) => {
        const open = state.reputation >= sec.repNeeded;
        return (
          <section key={sec.id} className={`e2d-sector glass ${open ? '' : 'locked'}`}>
            <header>
              <span className="eyebrow">{sec.name}</span>
              {!open && <span className="e2d-lock"><IconLock /> Réputation {sec.repNeeded}</span>}
            </header>
            <div className="e2d-plots">
              {PLOTS.filter((p) => p.sector === sec.id).map((p) => {
                const key = plotBuilding(state, p.id);
                const Icon = key ? ICONS[key] : open ? IconPlus : IconLock;
                return (
                  <button key={p.id} className={`e2d-plot ${key ? '' : 'empty'}`} disabled={!open} onClick={() => onSelect(p.id, sec.id)}>
                    <Icon />
                    <span>{key ? BUILDINGS[key].name : open ? 'Construire' : '—'}</span>
                    {key && <em>Niv. {state.buildings[key]}</em>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
