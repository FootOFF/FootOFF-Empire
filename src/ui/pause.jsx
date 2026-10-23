import React, { useState } from 'react';
import { ClubCard, Hints, MenuList, SettingsView, useMenu } from './console';
import { IconCheck } from './icons';
import { ClubCrest } from './crest';
import { DIVISIONS } from '../game/constants';
import { clubStars } from '../game/crest';

// Menu pause, façon jeu de console : le jeu se fige (la vue 3D s'arrête et se floute derrière), le menu à gauche,
// la saison en cours à droite. Échap, B ou Start (manette) reprennent la partie.

export function PauseMenu({ state, settings, onResume, onTitle, onNewGame, inMatch = false, blocked = false }) {
  const [view, setView] = useState('menu');
  const div = DIVISIONS[state.divisionIndex];
  const total = state.schedule?.length || 7;
  const items = [
    { id: 'resume', label: 'Reprendre', sub: 'Retour au complexe', onSelect: onResume },
    { id: 'settings', label: 'Réglages', sub: 'Son et vibrations', onSelect: () => setView('settings') },
    { id: 'title', label: 'Écran titre', sub: inMatch ? 'Indisponible pendant un match' : 'Ta partie reste sauvegardée', disabled: inMatch, onSelect: onTitle },
    { id: 'new', label: 'Nouvelle partie', sub: 'Efface la partie en cours', tone: 'danger', onSelect: onNewGame },
    { id: 'media', label: 'FootOFF Media', sub: 'footoff.media', href: 'https://footoff.media' },
  ];
  const menu = useMenu(items, { onBack: onResume, active: view === 'menu' && !blocked });
  return (
    <div className={`pz pz-view-${view}`} role="dialog" aria-modal="true" aria-label="Pause">
      <div className="pz-shade" aria-hidden="true" />
      <div className="pz-col">
        <header className="pz-head">
          <span className="eyebrow">Pause</span>
          <div className="pz-club">
            <ClubCrest crest={state.crest} name={state.clubName} className="pz-crest" stars={clubStars(state)} />
            <h2 className={state.clubName.length > 16 ? 'long' : ''}>{state.clubName}</h2>
          </div>
          <p>{div.name} · Saison {state.seasonNumber} · {state.round ? `journée ${Math.min(state.round, total)}/${total}` : 'avant la 1re journée'}</p>
        </header>
        {view === 'menu' ? (
          <MenuList items={items} menu={menu} label="Menu pause" />
        ) : (
          <div className="pz-settings">
            <span className="eyebrow pz-view-title">Réglages</span>
            <SettingsView settings={settings} active={!blocked} onBack={() => setView('menu')} />
          </div>
        )}
      </div>
      {view === 'menu' && (
        <aside className="pz-side">
          <ClubCard state={state} eyebrow="Ta saison" objective head={false} />
        </aside>
      )}
      <footer className="pz-bottom">
        <Hints items={view === 'menu' ? [['nav', 'Choisir'], ['select', 'Valider'], ['back', 'Reprendre']] : [['nav', 'Choisir'], ['select', 'Valider'], ['back', 'Retour']]} />
        <span className="pz-save"><IconCheck /> Sauvegarde automatique</span>
      </footer>
    </div>
  );
}
