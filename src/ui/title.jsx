import React, { useEffect, useState } from 'react';
import { FOMonogram } from './brand';
import { Clock, ClubCard, Hints, MenuList, SettingsView, uiSound, useMenu } from './console';
import { useInputMode } from './input';
import { IconDice } from './icons';
import { randomClubName } from '../game/names';
import { DIVISIONS } from '../game/constants';

// Écran titre, façon jeu de console : le complexe tourne lentement en 3D derrière (mode vitrine d'Empire3D), le
// menu à gauche (en bas sur téléphone), la carte de l'entrée choisie à droite. Trois vues : menu, réglages,
// création du club. Clavier, souris, doigt et manette (voir console.jsx et input.js).

export function Wordmark() {
  return (
    <div className="ts-mark">
      <FOMonogram className="ts-mono" />
      <div className="ts-words">
        <span className="ts-foot">Foot<b>OFF</b></span>
        <span className="ts-empire">Empire</span>
      </div>
    </div>
  );
}

const PILLARS = [
  ['Construis', 'Ton complexe grandit secteur par secteur : entraînement, académie, supporters, partenaires.'],
  ['Développe', 'Forme tes talents, déniche les futurs cracks, accomplis l’objectif de saison.'],
  ['Gravis', 'De la Départementale jusqu’à l’Elite, ta réputation ouvre les quartiers de ton Empire.'],
];

function Pillars() {
  return (
    <ul className="ts-pillars">
      {PILLARS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}
    </ul>
  );
}

// Carte de droite (PC) : le détail de l'entrée active du menu.
function SideCard({ id, state, settings }) {
  if (id === 'continue' && state) return <ClubCard state={state} eyebrow="Continuer la partie" />;
  if (id === 'new') {
    return (
      <section className="cm-card">
        <span className="eyebrow">Nouvelle partie</span>
        <p className="cm-card-lead">Ton club. Ton complexe. <em>Ton empire.</em></p>
        {state && <p className="cm-card-warn">Ta partie avec {state.clubName} (saison {state.seasonNumber}) sera effacée.</p>}
        <Pillars />
      </section>
    );
  }
  if (id === 'settings') {
    const q = settings.qualities.find((x) => x.id === settings.quality);
    const m = settings.motions.find((x) => x.id === settings.motion);
    return (
      <section className="cm-card">
        <span className="eyebrow">Réglages</span>
        <dl className="cm-card-rows">
          <div><dt>Son</dt><dd>{settings.muted ? 'Coupé' : 'Activé'}</dd></div>
          <div><dt>Vibrations</dt><dd>{!settings.canVibrate ? 'Indisponibles' : settings.vibration ? 'Activées' : 'Coupées'}</dd></div>
          <div><dt>Qualité graphique</dt><dd>{q?.label}</dd></div>
          {settings.quality !== 'economie' && <div><dt>Image en mouvement</dt><dd>{m?.label}</dd></div>}
        </dl>
        <p className="cm-card-note">Enregistrés sur cet appareil.</p>
      </section>
    );
  }
  if (id === 'media') {
    return (
      <section className="cm-card">
        <span className="eyebrow">FootOFF Media</span>
        <p className="cm-card-lead">Le football, <em>autrement.</em></p>
        <p className="cm-card-note">Actualités, analyses et Stats Pass sur footoff.media. S’ouvre dans un nouvel onglet.</p>
      </section>
    );
  }
  return null;
}

// Entrées du menu principal : Continuer (s'il y a une partie), Nouvelle partie, Réglages, FootOFF Media.
function menuItems(state, { onContinue, onNew, onSettings }) {
  const div = state && DIVISIONS[state.divisionIndex];
  return [
    ...(state ? [{ id: 'continue', label: 'Continuer', sub: `${state.clubName} · ${div.name} · saison ${state.seasonNumber}`, onSelect: onContinue }] : []),
    { id: 'new', label: 'Nouvelle partie', sub: state ? 'Fonder un autre club' : 'Fonde ton club et bâtis ton empire', onSelect: onNew },
    { id: 'settings', label: 'Réglages', sub: 'Son, vibrations, qualité graphique', onSelect: onSettings },
    { id: 'media', label: 'FootOFF Media', sub: 'footoff.media', href: 'https://footoff.media' },
  ];
}

// Création du club : nom (proposé au hasard, modifiable), puis « Fonder le club ». Au doigt, le champ n'est pas
// sélectionné d'office (le clavier du téléphone masquerait la moitié de l'écran).
function CreateClub({ onCreate, onBack, active }) {
  const [name, setName] = useState(randomClubName);
  const mode = useInputMode();
  const fields = [{ id: 'name' }, { id: 'go' }, { id: 'back' }];
  const menu = useMenu(fields, { onBack, active: active && mode !== 'touch' });
  const ok = name.trim().length > 0;
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    uiSound('select');
    onCreate(name.trim());
  };
  return (
    <form className="ts-main ts-form" onSubmit={submit}>
      <span className="eyebrow">Nouvelle partie</span>
      <h2>Fonde ton club</h2>
      <p className="ts-form-lead">Onze joueurs, un terrain de quartier et la Départementale pour commencer. Le reste, c’est toi qui le bâtis.</p>
      <label className={`ts-field ${menu.cur === 0 ? 'on' : ''}`}>
        <span className="ts-field-label">Nom du club</span>
        <span className="ts-input">
          <input
            ref={(el) => { menu.refs.current[0] = el; }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => menu.setCur(0)}
            maxLength={26}
            autoComplete="off"
            spellCheck={false}
            placeholder="Nom de ton club"
          />
          <button type="button" className="ts-dice" onClick={() => { setName(randomClubName()); uiSound('move'); }} aria-label="Proposer un autre nom" title="Proposer un autre nom">
            <IconDice />
          </button>
        </span>
      </label>
      <div className="ts-actions">
        <button ref={(el) => { menu.refs.current[1] = el; }} onFocus={() => menu.setCur(1)} type="submit" className={`btn btn-xl ${menu.cur === 1 ? 'on' : ''}`} disabled={!ok}>
          Fonder le club
        </button>
        <button ref={(el) => { menu.refs.current[2] = el; }} onFocus={() => menu.setCur(2)} type="button" className={`btn ghost btn-xl ${menu.cur === 2 ? 'on' : ''}`} onClick={() => { uiSound('back'); onBack(); }}>
          Retour
        </button>
      </div>
    </form>
  );
}

export function TitleScreen({ state, view, onView, onContinue, onNewGame, onCreate, settings, blocked = false }) {
  const active = !blocked;
  const items = menuItems(state, { onContinue, onNew: () => (state ? onNewGame() : onView('create')), onSettings: () => onView('settings') });
  const menu = useMenu(items, { active: active && view === 'menu' }); // l'entrée active est gardée au retour des réglages
  const current = items[Math.min(menu.cur, items.length - 1)].id;
  const [entered, setEntered] = useState(false); // la première apparition joue l'animation d'entrée complète
  useEffect(() => { const t = setTimeout(() => setEntered(true), 1400); return () => clearTimeout(t); }, []);
  const hints = view === 'settings'
    ? [['nav', 'Choisir'], ['lr', 'Modifier'], ['select', 'Valider'], ['back', 'Retour']]
    : view === 'create'
      ? [['nav', 'Choisir'], ['select', 'Valider'], ['back', 'Retour']]
      : [['nav', 'Choisir'], ['select', 'Valider']];
  return (
    <div className={`ts ts-${view} ${entered ? 'entered' : ''}`} role="dialog" aria-label="Écran titre de FootOFF Empire">
      <div className="ts-shade" aria-hidden="true" />
      <header className="ts-top">
        <span className="ts-presents">FootOFF Media présente</span>
        <div className="ts-status">
          {state && <span className="ts-profile"><FOMonogram className="ts-profile-mark" />{state.clubName}</span>}
          <Clock />
        </div>
      </header>
      <div className="ts-col">
        {view === 'menu' && ( /* le grand titre sur le menu principal ; les sous-écrans ont leur propre en-tête */
          <div className="ts-head">
            <Wordmark />
            <p className="ts-tag">Un terrain de quartier. <em>Un empire</em> à bâtir.</p>
          </div>
        )}
        {view === 'menu' && (
          <div className="ts-main">
            <MenuList items={items} menu={menu} label="Menu principal" />
          </div>
        )}
        {view === 'settings' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">FootOFF Empire</span>
            <h2>Réglages</h2>
            <SettingsView settings={settings} active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'create' && <CreateClub active={active} onCreate={onCreate} onBack={() => onView('menu')} />}
      </div>
      {view !== 'settings' && (
        <aside className="ts-side" key={view === 'create' ? 'create' : current}>
          <SideCard id={view === 'create' ? 'new' : current} state={view === 'create' ? null : state} settings={settings} />
        </aside>
      )}
      <footer className="ts-bottom">
        <Hints items={hints} />
        <span className="ts-legal">FootOFF Empire · bêta 2026</span>
      </footer>
    </div>
  );
}
