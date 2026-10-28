import React, { useEffect, useState } from 'react';
import { FootOFFLockup } from './brand';
import { ClubCard, Hints, MenuList, SettingsView, uiSound, useMenu } from './console';
import { RulesView } from './rules';
import { NewsView, unseenNews } from './news';
import { CHANGELOG, CURRENT } from '../game/changelog';
import { useInputMode } from './input';
import { useKeydown } from './presence';
import { IconChevron, IconChevronLeft, IconDice } from './icons';
import { ClubCrest } from './crest';
import { randomClubName } from '../game/names';
import { DIVISIONS } from '../game/constants';
import { CREST_EMBLEMS, CREST_GROUNDS, CREST_PATTERNS, CREST_SHAPES, CREST_STYLES, CREST_TEXTS, clubStars, randomCrest, withStyle } from '../game/crest';

// Écran titre, façon jeu de console : le complexe tourne lentement en 3D derrière (mode vitrine d'Empire3D), le
// menu à gauche (en bas sur téléphone), la carte de l'entrée choisie à droite. Trois vues : menu, réglages,
// création du club. Clavier, souris, doigt et manette (voir console.jsx et input.js).

// Logo FootOFF Empire, le même que sur l'écran de chargement : monogramme, FootOFF, et « Empire » intégré au logo en
// sous-titre espacé (comme « Media » sur le logo FootOFF Media).
export function Wordmark() {
  return <FootOFFLockup sub="Empire" size="lg" className="ts-mark" />;
}

const PILLARS = [
  ['Construis', 'Ton complexe grandit parcelle après parcelle, dans l’ordre que tu veux : entraînement, académie, supporters, partenaires.'],
  ['Développe', 'Forme tes talents, déniche les futurs cracks, accomplis l’objectif de saison.'],
  ['Gravis', 'De la Départementale jusqu’à l’Elite : ta réputation attire le public, les sponsors et les joueurs.'],
];

function Pillars() {
  return (
    <ul className="ts-pillars">
      {PILLARS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}
    </ul>
  );
}

// Carte de droite (PC) : le détail de l'entrée active du menu.
function SideCard({ id, state, settings, leagues = null }) {
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
  if (id === 'rules') {
    return (
      <section className="cm-card">
        <span className="eyebrow">Règles du jeu</span>
        <p className="cm-card-lead">Tout ce qui décide, <em>en clair.</em></p>
        <p className="cm-card-note">Le match et son pronostic exact, les joueurs et leur condition, le mercato et la valeur, l’argent, la réputation.</p>
      </section>
    );
  }
  if (id === 'news') {
    const v = CHANGELOG[0];
    return (
      <section className="cm-card">
        <span className="eyebrow">Nouveautés · version {v.version}</span>
        <p className="cm-card-lead">{v.title}</p>
        <ul className="cm-card-list">{v.items.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}</ul>
        <p className="cm-card-note">{v.date}{CHANGELOG.length > 1 ? ` · et les versions précédentes` : ''}</p>
      </section>
    );
  }
  if (id === 'settings') {
    return (
      <section className="cm-card">
        <span className="eyebrow">Réglages</span>
        <dl className="cm-card-rows">
          <div><dt>Son</dt><dd>{settings.muted ? 'Coupé' : 'Activé'}</dd></div>
          <div><dt>Vibrations</dt><dd>{!settings.canVibrate ? 'Indisponibles' : settings.vibration ? 'Activées' : 'Coupées'}</dd></div>
        </dl>
        <p className="cm-card-note">Enregistrés sur cet appareil.</p>
      </section>
    );
  }
  if (id.startsWith('club-')) { // un club de championnat entre amis : une partie à part, comme une carrière
    const m = leagues?.clubs?.find((x) => `club-${x.code}` === id);
    return m ? (
      <section className="cm-card">
        <span className="eyebrow">Championnat entre amis</span>
        <p className="cm-card-lead">{m.club.name}</p>
        <p className="cm-card-note">{m.name || m.code} · ton club de ligue se joue comme une partie solo, à part de ta carrière : son complexe, son effectif, ses finances. Ses matchs se jouent à l’heure de la ligue.</p>
      </section>
    ) : null;
  }
  if (id === 'leagues') {
    return (
      <section className="cm-card">
        <span className="eyebrow">Championnats entre amis</span>
        <p className="cm-card-lead">Huit clubs. <em>Tes amis.</em></p>
        <p className="cm-card-note">Rejoins le championnat d’un ami avec son code, ou crée le tien depuis le Siège de la Ligue. Un club neuf pour chacun, une journée par jour.</p>
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

// Entrées du menu principal : Continuer (s'il y a une partie ; liveNote : un match interrompu qui reprendra à la minute
// près), Nouvelle partie, Championnats entre amis (leagues, quand ils sont ouverts), Réglages, FootOFF Media.
function menuItems(state, { onContinue, onNew, onSettings, onRules, onNews }, liveNote = null, leagues = null) {
  const div = state && DIVISIONS[state.divisionIndex];
  return [
    ...(state ? [{ id: 'continue', label: 'Continuer', sub: liveNote || `${state.clubName} · ${div.name} · Saison ${state.seasonNumber}`, onSelect: onContinue }] : []),
    { id: 'new', label: 'Nouvelle partie', sub: state ? 'Fonder un autre club' : 'Fonde ton club et bâtis ton empire', onSelect: onNew },
    ...(leagues ? (leagues.clubs || []).map((m) => ({ id: `club-${m.code}`, label: m.club.name, sub: `Championnat entre amis · ${m.name || m.code}`, onSelect: () => leagues.onPlay(m) })) : []),
    ...(leagues ? [{ id: 'leagues', label: 'Championnats entre amis', sub: leagues.count ? `${leagues.count} championnat${leagues.count > 1 ? 's' : ''} · créer, rejoindre, classements` : 'Rejoins tes amis avec leur code', onSelect: leagues.onOpen }] : []),
    { id: 'rules', label: 'Règles du jeu', sub: 'Matchs, joueurs, mercato, argent, réputation', onSelect: onRules },
    { id: 'news', label: 'Nouveautés', sub: `Version ${CURRENT}${unseenNews() ? ' · à lire' : ''}`, badge: unseenNews(), onSelect: onNews },
    { id: 'settings', label: 'Réglages', sub: 'Son, vibrations, fluidité, sauvegarde, signaler un problème', onSelect: onSettings },
    { id: 'media', label: 'FootOFF Media', sub: 'footoff.media', href: 'https://footoff.media' },
  ];
}

// Création du club : nom (proposé au hasard, modifiable), écusson composé ici (style, forme, symbole ou animal, motif,
// inscription du nom et de l'année de fondation, fond) avec son aperçu, puis « Fonder le club ». Les couleurs ne se choisissent pas : notre club est noir et or, la charte
// FootOFF. Au doigt, le champ du nom n'est pas sélectionné d'office (le clavier du téléphone masquerait la moitié
// de l'écran). Au clavier et à la manette : haut / bas pour choisir la ligne, gauche / droite pour changer.
export const CREST_ROWS = [ // [champ, libellé, choix possibles selon l'écusson en cours] (aussi pour les ligues : league.jsx)
  ['style', 'Style', () => CREST_STYLES],
  ['shape', 'Forme', (c) => CREST_SHAPES[c.style]],
  ['emblem', 'Symbole', () => CREST_EMBLEMS],
  ['pattern', 'Motif', () => CREST_PATTERNS],
  ['text', 'Inscription', () => CREST_TEXTS],
  ['ground', 'Fond', () => CREST_GROUNDS],
];

function CreateClub({ onCreate, onBack, active }) {
  const [name, setName] = useState(randomClubName);
  const [crest, setCrest] = useState(() => randomCrest());
  const mode = useInputMode();
  const fields = [{ id: 'name' }, ...CREST_ROWS.map(([id]) => ({ id })), { id: 'go' }, { id: 'back' }];
  const menu = useMenu(fields, { onBack, active: active && mode !== 'touch' });
  const GO = CREST_ROWS.length + 1;
  const ok = name.trim().length > 0;
  const step = (key, list, d) => {
    const i = Math.max(0, list.findIndex(([id]) => id === crest[key]));
    const v = list[(i + d + list.length) % list.length][0];
    setCrest((c) => (key === 'style' ? withStyle(c, v) : { ...c, [key]: v })); // un autre style : sa forme suit
    uiSound('move');
  };
  useKeydown((e) => {
    const row = CREST_ROWS[menu.cur - 1];
    if (!active || e.defaultPrevented || !row) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(row[0], row[2](crest), -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(row[0], row[2](crest), 1); }
  });
  const submit = (e) => {
    e.preventDefault();
    if (!ok) return;
    uiSound('select');
    onCreate(name.trim(), crest);
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
      <div className="ts-crest">
        <div className="ts-crest-side">
          <ClubCrest crest={crest} name={name} className="ts-crest-art" full title={`Écusson de ${name || 'ton club'}`} />
          <button type="button" className="ts-dice" onClick={() => { setCrest(randomCrest()); uiSound('move'); }} aria-label="Écusson au hasard" title="Écusson au hasard">
            <IconDice />
          </button>
        </div>
        <div className="ts-crest-rows">
          <span className="ts-field-label">Écusson · noir et or, aux couleurs FootOFF</span>
          {CREST_ROWS.map(([key, label, listOf], k) => { const list = listOf(crest); return (
            <div
              key={key}
              ref={(el) => { menu.refs.current[k + 1] = el; }}
              tabIndex={0}
              role="group"
              aria-label={`${label} : ${list.find(([id]) => id === crest[key])?.[1]}`}
              onFocus={() => menu.setCur(k + 1)}
              className={`ts-pick ${menu.cur === k + 1 ? 'on' : ''}`}
            >
              <span className="ts-pick-label">{label}</span>
              <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={`${label} précédent`} onClick={() => step(key, list, -1)}><IconChevronLeft /></button>
              <span className="ts-pick-value">{list.find(([id]) => id === crest[key])?.[1]}</span>
              <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={`${label} suivant`} onClick={() => step(key, list, 1)}><IconChevron /></button>
            </div>
          ); })}
        </div>
      </div>
      <div className="ts-actions">
        <button ref={(el) => { menu.refs.current[GO] = el; }} onFocus={() => menu.setCur(GO)} type="submit" className={`btn btn-xl ${menu.cur === GO ? 'on' : ''}`} disabled={!ok}>
          Fonder le club
        </button>
        <button ref={(el) => { menu.refs.current[GO + 1] = el; }} onFocus={() => menu.setCur(GO + 1)} type="button" className={`btn ghost btn-xl ${menu.cur === GO + 1 ? 'on' : ''}`} onClick={() => { uiSound('back'); onBack(); }}>
          Retour
        </button>
      </div>
    </form>
  );
}

export function TitleScreen({ state, view, onView, onContinue, onNewGame, onCreate, settings, blocked = false, liveNote = null, leagues = null }) {
  const active = !blocked;
  const items = menuItems(state, { onContinue, onNew: () => (state ? onNewGame() : onView('create')), onSettings: () => onView('settings'), onRules: () => onView('rules'), onNews: () => onView('news') }, liveNote, leagues);
  const menu = useMenu(items, { active: active && view === 'menu' }); // l'entrée active est gardée au retour des réglages
  const current = items[Math.min(menu.cur, items.length - 1)].id;
  const [entered, setEntered] = useState(false); // la première apparition joue l'animation d'entrée complète
  useEffect(() => { const t = setTimeout(() => setEntered(true), 1400); return () => clearTimeout(t); }, []);
  const hints = view === 'settings' || view === 'rules' || view === 'news'
    ? [['nav', 'Choisir'], ['select', 'Valider'], ['back', 'Retour']]
    : view === 'create'
      ? [['nav', 'Choisir'], ['select', 'Valider'], ['back', 'Retour']]
      : [['nav', 'Choisir'], ['select', 'Valider']];
  return (
    <div className={`ts ts-${view} ${entered ? 'entered' : ''}`} role="dialog" aria-label="Écran titre de FootOFF Empire">
      <div className="ts-shade" aria-hidden="true" />
      <header className="ts-top">
        <span className="ts-presents">FootOFF Media présente</span>
        <div className="ts-status">
          {state && <span className="ts-profile"><ClubCrest crest={state.crest} name={state.clubName} className="ts-profile-mark" stars={clubStars(state)} />{state.clubName}</span>}
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
        {view === 'rules' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">FootOFF Empire</span>
            <h2>Règles du jeu</h2>
            <RulesView active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'news' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">FootOFF Empire</span>
            <h2>Nouveautés</h2>
            <NewsView active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'create' && <CreateClub active={active} onCreate={onCreate} onBack={() => onView('menu')} />}
      </div>
      {view !== 'settings' && view !== 'rules' && view !== 'news' && (
        <aside className="ts-side" key={view === 'create' ? 'create' : current}>
          <SideCard id={view === 'create' ? 'new' : current} state={view === 'create' ? null : state} settings={settings} leagues={leagues} />
        </aside>
      )}
      <footer className="ts-bottom">
        <Hints items={hints} />
        <span className="ts-legal">FootOFF Empire · bêta {__APP_VERSION__} · {__BUILD_DATE__}</span>
      </footer>
    </div>
  );
}
