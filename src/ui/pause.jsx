import React, { useState } from 'react';
import { ClubCard, Hints, MenuList, SettingsView, useMenu } from './console';
import { RulesView } from './rules';
import { NewsView, unseenNews } from './news';
import { CURRENT } from '../game/changelog';
import { IconCheck } from './icons';
import { ClubCrest } from './crest';
import { DIVISIONS, divisionOf } from '../game/constants';
import { clubStars } from '../game/crest';

// Menu pause, façon jeu de console : le jeu se fige (la vue 3D s'arrête et se floute derrière), le menu à gauche,
// la saison en cours à droite. Échap, B ou Start (manette) reprennent la partie.

// focus : ouvert directement sur une entrée des réglages (notification « Le jeu rame » : la fluidité)
// saveNote : où en est la sauvegarde en ligne d'un club de ligue ({ ok, text }, leagueCloud.js), à la place de la
// sauvegarde automatique ; la coche seulement pour une sauvegarde faite
export function PauseMenu({ state, settings, onResume, onTitle, onNewGame, inMatch = false, blocked = false, focus = null, saveNote = null }) {
  const [view, setView] = useState(focus ? 'settings' : 'menu');
  const div = divisionOf(state);
  const total = state.schedule?.length || 7;
  const items = [
    { id: 'resume', label: 'Reprendre', sub: 'Retour au complexe', onSelect: onResume },
    { id: 'settings', label: 'Réglages', sub: 'Son, vibrations, fluidité, sauvegarde, signaler un problème', onSelect: () => setView('settings') },
    { id: 'rules', label: 'Règles du jeu', sub: 'Matchs, joueurs, mercato, argent, réputation', onSelect: () => setView('rules') },
    { id: 'news', label: 'Nouveautés', sub: `Version ${CURRENT}${unseenNews() ? ' · à lire' : ''}`, badge: unseenNews(), onSelect: () => setView('news') },
    { id: 'title', label: 'Écran titre', sub: inMatch ? 'Indisponible pendant un match' : 'Ta partie reste sauvegardée', disabled: inMatch, onSelect: onTitle },
    ...(onNewGame ? [{ id: 'new', label: 'Nouvelle partie', sub: 'Efface la partie en cours', tone: 'danger', onSelect: onNewGame }] : []),
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
          <p>{state.league ? state.league.name : div.name} · Saison {state.seasonNumber} · {state.round ? `journée ${Math.min(state.round, total)}/${total}` : 'avant la 1re journée'}</p>
        </header>
        {view === 'menu' ? (
          <MenuList items={items} menu={menu} label="Menu pause" />
        ) : (
          <div className="pz-settings">
            <span className="eyebrow pz-view-title">{view === 'rules' ? 'Règles du jeu' : view === 'news' ? 'Nouveautés' : 'Réglages'}</span>
            {view === 'rules' && <RulesView active={!blocked} onBack={() => setView('menu')} />}
            {view === 'news' && <NewsView active={!blocked} onBack={() => setView('menu')} />}
            {view === 'settings' && <SettingsView settings={settings} active={!blocked} focus={focus} onBack={() => setView('menu')} />}
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
        <span className={`pz-save ${saveNote && !saveNote.ok ? 'wait' : ''}`}>{(!saveNote || saveNote.ok) && <IconCheck />} {saveNote ? saveNote.text : 'Sauvegarde automatique'}</span>
      </footer>
    </div>
  );
}
