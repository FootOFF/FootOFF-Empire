import React from 'react';
import { BUILDINGS } from '../game/constants';
import { PLOTS, SECTORS, plotBuilding } from '../game/map';
import { IconAcademy, IconDirection, IconFans, IconMedical, IconPitch, IconPlus, IconSponsor, IconTransfer, IconTraining } from './icons';

const ICONS = { terrain: IconPitch, training: IconTraining, academy: IconAcademy, fans: IconFans, sponsor: IconSponsor, transfers: IconTransfer, direction: IconDirection, medical: IconMedical };

// Repli 2D quand WebGL est indisponible : plan du complexe (toutes les parcelles ouvertes), mêmes interactions que
// la 3D.
export default function Empire2D({ state, onSelect }) {
  return (
    <div className="empire2d">
      {SECTORS.map((sec) => (
        <section key={sec.id} className="e2d-sector glass">
          <header>
            <span className="eyebrow">{sec.name}</span>
          </header>
          <div className="e2d-plots">
            {PLOTS.filter((p) => p.sector === sec.id).map((p) => {
              const key = plotBuilding(state, p.id);
              const Icon = key ? ICONS[key] : IconPlus;
              return (
                <button key={p.id} className={`e2d-plot ${key ? '' : 'empty'}`} onClick={() => onSelect(p.id, sec.id)}>
                  <Icon />
                  <span>{key ? BUILDINGS[key].name : 'Construire'}</span>
                  {key && <em>Niv. {state.buildings[key]}</em>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
