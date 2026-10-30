import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FootOFFLockup } from './brand';
import { ClubCard, Hints, MenuList, SettingsView, uiSound, useMenu, MediaView } from './console';
import { RulesView } from './rules';
import { CURRENT } from '../game/changelog';
import { useInputMode } from './input';
import { useKeydown } from './presence';
import { IconChevron, IconChevronLeft, IconDice } from './icons';
import { SocialStrip } from './socials';
import { COLOR_KEYS, ClubCrest, ColorValue, colorList } from './crest';
import { randomClubName } from '../game/names';
import { DIVISIONS } from '../game/constants';
import { CREST_EMBLEMS, CREST_GROUNDS, CREST_PATTERNS, CREST_SHAPES, CREST_STYLES, CREST_TEXTS, clubStars, normalizeCrest, randomCrest, withStyle } from '../game/crest';
import { LANGS, LANG_NAMES, langName, preferredLang, t, tn, tr } from '../i18n/index';

// Écran titre, façon jeu de console : le complexe tourne lentement en 3D derrière (mode vitrine d'Empire3D), le
// menu à gauche (en bas sur téléphone), la carte de l'entrée choisie à droite. Trois vues : menu, réglages,
// création du club. Clavier, souris, doigt et manette (voir console.jsx et input.js).

// Logo FootOFF Empire, le même que sur l'écran de chargement : monogramme, FootOFF, et « Empire » intégré au logo en
// sous-titre espacé (comme « Media » sur le logo FootOFF Media).
export function Wordmark() {
  return <FootOFFLockup sub={t('Empire')} size="lg" className="ts-mark" />;
}

const PILLARS = [
  [t('Construis'), t('Ton complexe grandit parcelle après parcelle, dans l’ordre que tu veux : entraînement, académie, supporters, partenaires.')],
  [t('Développe'), t('Forme tes talents, déniche les futurs cracks, accomplis l’objectif de saison.')],
  [t('Gravis'), t('De la Départementale jusqu’à l’Élite : ta réputation attire le public, les sponsors et les joueurs.')],
];

function Pillars() {
  return (
    <ul className="ts-pillars">
      {PILLARS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}
    </ul>
  );
}

// Carte de droite (PC) : le détail de l'entrée active du menu.
function SideCard({ id, state, foreign = null, settings, leagues = null }) {
  if (id === 'continue' && state) return <ClubCard state={state} eyebrow={t('Continuer la partie')} />;
  if (id === 'continue' && foreign) { // partie fondée dans une autre langue : elle s'ouvre dans la sienne
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('Continuer la partie')}</span>
        <p className="cm-card-lead">{foreign.clubName}</p>
        <p className="cm-card-note">{t('Partie fondée dans une autre langue ({lang}) : le jeu se recharge dans sa langue pour la reprendre. Les noms des joueurs et des clubs restent ceux de sa fondation.', { lang: langName(foreign.lang) })}</p>
      </section>
    );
  }
  if (id === 'new') {
    const saved = state || foreign;
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('Nouvelle partie')}</span>
        <p className="cm-card-lead">{tr('Ton club. Ton complexe. <0>Ton empire.</0>', [(c) => <em>{c}</em>])}</p>
        {saved && <p className="cm-card-warn">{tr('Ta partie avec <0/> (saison <1/>) sera effacée.', [saved.clubName, saved.seasonNumber])}</p>}
        <Pillars />
        <p className="cm-card-note">{t('Première étape : la langue de la partie, choisie une seule fois.')}</p>
      </section>
    );
  }
  if (id === 'rules') {
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('Règles du jeu')}</span>
        <p className="cm-card-lead">{tr('Tout ce qui décide, <0>en clair.</0>', [(c) => <em>{c}</em>])}</p>
        <p className="cm-card-note">{t('Le match et son pronostic exact, les joueurs et leur condition, le mercato et la valeur, l’argent, la réputation.')}</p>
      </section>
    );
  }
  if (id === 'settings') {
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('Réglages')}</span>
        <dl className="cm-card-rows">
          <div><dt>{t('Musique')}</dt><dd>{settings.musicVolume ? `${Math.round(settings.musicVolume * 100)} %` : t('Coupée')}</dd></div>
          <div><dt>{t('Sons')}</dt><dd>{settings.sfxVolume ? `${Math.round(settings.sfxVolume * 100)} %` : t('Coupés')}</dd></div>
          <div><dt>{t('Vibrations')}</dt><dd>{!settings.canVibrate ? t('Indisponibles') : settings.vibration ? t('Activées') : t('Coupées')}</dd></div>
        </dl>
        <p className="cm-card-note">{t('Enregistrés sur cet appareil.')}</p>
      </section>
    );
  }
  if (id.startsWith('club-')) { // un club de championnat entre amis : une partie à part, comme une carrière
    const m = leagues?.clubs?.find((x) => `club-${x.code}` === id);
    return m ? (
      <section className="cm-card">
        <span className="eyebrow">{t('Championnat entre amis')}</span>
        <p className="cm-card-lead">{m.club.name}</p>
        <p className="cm-card-note">{tr('<0/> · ton club de ligue se joue comme une partie solo, à part de ta carrière : son complexe, son effectif, ses finances. Ses matchs se jouent à l’heure de la ligue.', [m.name || m.code])}</p>
      </section>
    ) : null;
  }
  if (id === 'leagues') {
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('Championnats entre amis')}</span>
        <p className="cm-card-lead">{tr('Huit clubs. <0>Tes amis.</0>', [(c) => <em>{c}</em>])}</p>
        <p className="cm-card-note">{t('Rejoins le championnat d’un ami avec son code, ou crée le tien depuis le Siège de la Ligue. Un club neuf pour chacun, une journée par jour.')}</p>
      </section>
    );
  }
  if (id === 'media') {
    return (
      <section className="cm-card">
        <span className="eyebrow">{t('FootOFF Media')}</span>
        <p className="cm-card-lead">{tr('Le football, <0>autrement.</0>', [(c) => <em>{c}</em>])}</p>
        <p className="cm-card-note">{t('Actualités, analyses et Stats Pass sur footoff.media, et les coulisses de FootOFF sur Instagram, TikTok, YouTube, X et LinkedIn.')}</p>
      </section>
    );
  }
  return null;
}

// Club de ligue de l'appareil : son championnat, sa saison et sa journée (comme « Continuer » pour la carrière).
const clubProgress = ({ name, code, progress: p }) => {
  if (!p || !p.rounds) return t('{v} · ton club t’attend', { v: name || code });
  return t('{v} · Saison {season} · {v2}', { v: name || code, season: p.season, v2: p.round >= p.rounds ? t('terminée') : `${t('J')}${p.round + 1}/${p.rounds}` });
};

// Entrées du menu principal : Continuer (s'il y a une partie ; liveNote : un match interrompu qui reprendra à la minute
// près), Nouvelle partie, Championnats entre amis (leagues, quand ils sont ouverts), Réglages, FootOFF Media.
function menuItems(state, { onContinue, onNew, onSettings, onRules, onMedia }, liveNote = null, leagues = null, foreign = null) {
  const saved = state || foreign; // la carrière enregistrée (foreign : fondée dans une autre langue)
  const div = saved && DIVISIONS[saved.divisionIndex];
  const summary = saved && t('{clubName} · {name} · Saison {seasonNumber}', { clubName: saved.clubName, name: div.name, seasonNumber: saved.seasonNumber });
  return [
    ...(saved ? [{ id: 'continue', label: t('Continuer'), sub: state ? liveNote || summary : `${summary} · ${LANG_NAMES[foreign.lang]}`, onSelect: onContinue }] : []),
    { id: 'new', label: t('Nouvelle partie'), sub: saved ? t('Fonder un autre club') : t('Fonde ton club et bâtis ton empire'), onSelect: onNew },
    ...(leagues ? (leagues.clubs || []).map((m) => ({ id: `club-${m.code}`, label: m.club.name, sub: clubProgress(m), onSelect: () => leagues.onPlay(m) })) : []),
    ...(leagues ? [{ id: 'leagues', label: t('Championnats entre amis'), sub: leagues.count ? tn(leagues.count, '{count} championnat · créer, rejoindre, classements', '{count} championnats · créer, rejoindre, classements', { count: leagues.count }, leagues.count > 1) : t('Rejoins tes amis avec leur code'), onSelect: leagues.onOpen }] : []),
    { id: 'rules', label: t('Règles du jeu'), sub: t('Matchs, joueurs, mercato, argent, réputation'), onSelect: onRules },
    { id: 'settings', label: t('Réglages'), sub: t('Son, vibrations, fluidité, sauvegarde, signaler un problème'), onSelect: onSettings },
    { id: 'media', label: t('FootOFF Media'), sub: t('Le site et nos réseaux'), onSelect: onMedia }, // 0.8.17 : site et réseaux réunis (MediaView)
  ];
}

// Création du club : nom (proposé au hasard, modifiable), écusson composé ici (style, forme, symbole ou animal, motif,
// inscription du nom et de l'année de fondation, deux couleurs et le fond) avec son aperçu, puis « Fonder le club ».
// L'or et le noir FootOFF par défaut, toute couleur au choix (0.8.8) : la principale habille aussi le maillot, la
// secondaire le short. Au doigt, le champ du nom n'est pas sélectionné d'office (le clavier du téléphone masquerait la moitié
// de l'écran). Au clavier et à la manette : haut / bas pour choisir la ligne, gauche / droite pour changer.
export const CREST_ROWS = [ // [champ, libellé, choix possibles selon l'écusson en cours] (aussi pour les ligues : league.jsx)
  ['style', t('Style'), () => CREST_STYLES],
  ['shape', t('Forme'), (c) => CREST_SHAPES[c.style]],
  ['emblem', t('Symbole'), () => CREST_EMBLEMS],
  ['pattern', t('Motif'), () => CREST_PATTERNS],
  ['text', t('Inscription'), () => CREST_TEXTS],
  ['primary', t('Principale'), (c) => colorList(c.primary)],
  ['secondary', t('Secondaire'), (c) => colorList(c.secondary)],
  ['ground', t('Fond'), () => CREST_GROUNDS],
];

function CreateClub({ onCreate, onBack, active }) {
  const [name, setName] = useState(randomClubName);
  const [crest, setCrest] = useState(() => normalizeCrest(randomCrest()));
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
      <span className="eyebrow">{t('Nouvelle partie')}</span>
      <h2>{t('Fonde ton club')}</h2>
      <p className="ts-form-lead">{t('Onze joueurs, un terrain de quartier et la Départementale pour commencer. Le reste, c’est toi qui le bâtis.')}</p>
      <label className={`ts-field ${menu.cur === 0 ? 'on' : ''}`}>
        <span className="ts-field-label">{t('Nom du club')}</span>
        <span className="ts-input">
          <input
            ref={(el) => { menu.refs.current[0] = el; }}
            value={name}
            onChange={(e) => { uiSound(e.target.value.length < name.length ? 'keyback' : 'key'); setName(e.target.value); }}
            onFocus={() => menu.setCur(0)}
            maxLength={26}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('Nom de ton club')}
          />
          <button type="button" className="ts-dice" onClick={() => { setName(randomClubName()); uiSound('move'); }} aria-label={t('Proposer un autre nom')} title={t('Proposer un autre nom')}>
            <IconDice />
          </button>
        </span>
      </label>
      <div className="ts-crest">
        <div className="ts-crest-side">
          <ClubCrest crest={crest} name={name} className="ts-crest-art" full title={t('Écusson de {v}', { v: name || t('ton club') })} />
          <button type="button" className="ts-dice" onClick={() => { setCrest((c) => ({ ...randomCrest(), primary: c.primary, secondary: c.secondary })); uiSound('move'); }} aria-label={t('Écusson au hasard')} title={t('Écusson au hasard')}>
            <IconDice />
          </button>
        </div>
        <div className="ts-crest-rows">
          <span className="ts-field-label">{t('Écusson · or et noir FootOFF, ou tes couleurs')}</span>
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
              <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={t('{label} précédent', { label })} onClick={() => step(key, list, -1)}><IconChevronLeft /></button>
              {COLOR_KEYS.includes(key)
                ? <ColorValue value={crest[key]} label={label} onPick={(v) => setCrest((c) => ({ ...c, [key]: v }))} />
                : <span className="ts-pick-value">{list.find(([id]) => id === crest[key])?.[1]}</span>}
              <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={t('{label} suivant', { label })} onClick={() => step(key, list, 1)}><IconChevron /></button>
            </div>
          ); })}
        </div>
      </div>
      <div className="ts-actions">
        <button ref={(el) => { menu.refs.current[GO] = el; }} onFocus={() => menu.setCur(GO)} type="submit" className={`btn btn-xl ${menu.cur === GO ? 'on' : ''}`} disabled={!ok}>{t('Fonder le club')}</button>
        <button ref={(el) => { menu.refs.current[GO + 1] = el; }} onFocus={() => menu.setCur(GO + 1)} type="button" className={`btn ghost btn-xl ${menu.cur === GO + 1 ? 'on' : ''}`} onClick={() => { uiSound('back'); onBack(); }}>{t('Retour')}</button>
      </div>
    </form>
  );
}

// Langue de la partie : la première étape d'une nouvelle partie (0.8.23, demande du PDG : plus à l'écran titre), proposée
// d'après la langue du site footoff.media. Chaque langue s'annonce dans sa propre langue ; la proposée porte un point
// doré. La règle est écrite sous la liste : une partie garde la langue de sa fondation, puisque ses noms de joueurs et de
// clubs y sont tirés. Une partie enregistrée sera effacée (le choix fait, App le fait confirmer).
const LANG_INVITES = { fr: 'Jouer en français', en: 'Play in English', es: 'Jugar en español', ar: 'العب بالعربية' };
function LangView({ active, pref, saved, onPick, onBack }) {
  const items = [
    ...LANGS.map((l) => ({ id: l, label: LANG_NAMES[l], sub: LANG_INVITES[l], tone: l === pref ? 'picked' : '', onSelect: () => onPick(l) })),
    { id: 'back', label: t('Retour'), sub: t('Menu principal'), onSelect: onBack },
  ];
  const menu = useMenu(items, { initial: Math.max(0, LANGS.indexOf(pref)), onBack, active });
  return (
    <>
      <MenuList items={items} menu={menu} label={t('Langue de la partie')} className="ts-langs" />
      <p className="ts-lang-note">{t('La langue se choisit une seule fois par partie : les noms des joueurs et des clubs sont tirés dans cette langue, et elle ne change plus ensuite.')}</p>
      {saved && <p className="ts-lang-note cm-card-warn">{tr('Ta partie avec <0/> (saison <1/>) sera effacée.', [saved.clubName, saved.seasonNumber])}</p>}
    </>
  );
}

export function TitleScreen({ state, foreign = null, view, onView, onContinue, onNewGame, onPickLang, onCreate, settings, blocked = false, liveNote = null, leagues = null }) {
  const active = !blocked;
  const pref = preferredLang(); // langue proposée pour la nouvelle partie
  const saved = state || foreign;
  const items = menuItems(state, { onContinue, onNew: onNewGame, onSettings: () => onView('settings'), onRules: () => onView('rules'), onMedia: () => onView('media') }, liveNote, leagues, foreign);
  const menu = useMenu(items, { active: active && view === 'menu' }); // l'entrée active est gardée au retour des réglages
  const current = items[Math.min(menu.cur, items.length - 1)].id;
  const [entered, setEntered] = useState(false); // la première apparition joue l'animation d'entrée complète
  useEffect(() => { const t = setTimeout(() => setEntered(true), 1400); return () => clearTimeout(t); }, []);
  // Menu plus haut que la fenêtre (partie, clubs de ligue et championnats en plus, 0.8.20) : seule l'entrée choisie
  // garde sa ligne d'explication (data-tight), puis le titre et les écarts se resserrent (data-tight="2") ; mesuré sans,
  // avant l'affichage, et à chaque changement de taille. Il débordait sur « FootOFF Media présente » et sur les rappels
  // des touches.
  const colRef = useRef(null);
  useLayoutEffect(() => {
    const col = colRef.current;
    if (!col || view !== 'menu') return undefined;
    // hauteur du contenu face à la place entre les marges (le contenu peut déborder dans la marge basse, sous les
    // rappels des touches, sans que la colonne défile)
    // (positions de mise en page : l'animation d'entrée du menu les décale à l'écran sans changer la place prise)
    const over = () => {
      const cs = getComputedStyle(col);
      const room = col.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const a = col.firstElementChild;
      const b = col.lastElementChild;
      return !!a && b.offsetTop + b.offsetHeight - a.offsetTop > room + 1;
    };
    const fit = () => {
      delete col.dataset.tight;
      if (!over()) return;
      col.dataset.tight = '';
      if (!over()) return;
      col.dataset.tight = '2';
      if (!over()) return;
      col.dataset.tight = '3'; // plus compact : sans l'accroche, petit logo, entrées serrées (tout reste visible)
      if (!over()) return;
      col.dataset.tight = '4'; // dernier recours (fenêtre minuscule) : le menu défile, sa marge basse reste vide
      col.style.setProperty('--ts-fade', getComputedStyle(col).paddingBottom);
    };
    fit();
    // la fenêtre, et le contenu (polices chargées après coup, menu qui change) ; fit() rend la même mise en page pour
    // la même place, sans nouvelle notification
    const ro = new ResizeObserver(fit);
    ro.observe(col);
    for (const el of col.children) ro.observe(el);
    let live = true;
    document.fonts?.ready.then(() => { if (live) fit(); });
    return () => { live = false; ro.disconnect(); };
  }, [view, items.length]);
  const sub = view === 'settings' || view === 'rules' || view === 'lang' || view === 'media';
  const hints = sub
    ? [['nav', t('Choisir')], ['select', t('Valider')], ['back', t('Retour')]]
    : view === 'create'
      ? [['nav', t('Choisir')], ['select', t('Valider')], ['back', t('Retour')]]
      : [['nav', t('Choisir')], ['select', t('Valider')]];
  return (
    <div className={`ts ts-${view} ${entered ? 'entered' : ''}`} role="dialog" aria-label={t('Écran titre de FootOFF Empire')}>
      <div className="ts-shade" aria-hidden="true" />
      <header className="ts-top">
        <span className="ts-presents">{t('FootOFF Media présente')}</span>
        <div className="ts-status">
          {state && <span className="ts-profile"><ClubCrest crest={state.crest} name={state.clubName} className="ts-profile-mark" stars={clubStars(state)} />{state.clubName}</span>}
          {!state && foreign && <span className="ts-profile"><ClubCrest crest={foreign.crest} name={foreign.clubName} className="ts-profile-mark" />{foreign.clubName}</span>}
        </div>
      </header>
      <div className="ts-col" ref={colRef}>
        {view === 'menu' && ( /* le grand titre sur le menu principal ; les sous-écrans ont leur propre en-tête */
          <div className="ts-head">
            <Wordmark />
            <p className="ts-tag">{tr('Un terrain de quartier. <0>Un empire</0> à bâtir.', [(c) => <em>{c}</em>])}</p>
          </div>
        )}
        {view === 'menu' && (
          <div className="ts-main">
            <MenuList items={items} menu={menu} label={t('Menu principal')} />
          </div>
        )}
        {view === 'settings' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">{t('FootOFF Empire')}</span>
            <h2>{t('Réglages')}</h2>
            <SettingsView settings={settings} active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'rules' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">{t('FootOFF Empire')}</span>
            <h2>{t('Règles du jeu')}</h2>
            <RulesView active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'lang' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">{t('Nouvelle partie')}</span>
            <h2>{t('Langue de la partie')}</h2>
            <LangView active={active} pref={pref} saved={saved} onPick={onPickLang} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'media' && (
          <div className="ts-main ts-sub">
            <span className="eyebrow">{t('FootOFF Empire')}</span>
            <h2>{t('FootOFF Media')}</h2>
            <MediaView active={active} onBack={() => onView('menu')} />
          </div>
        )}
        {view === 'create' && <CreateClub active={active} onCreate={onCreate} onBack={() => onView('lang')} />}
      </div>
      {!sub && (
        <aside className="ts-side" key={view === 'create' ? 'create' : current}>
          <SideCard id={view === 'create' ? 'new' : current} state={view === 'create' ? null : state} foreign={view === 'create' ? null : foreign} settings={settings} leagues={leagues} />
        </aside>
      )}
      <footer className="ts-bottom">
        <Hints items={hints} />
        <span className="ts-foot-end">
          <SocialStrip className="ts-social" />
          <span className="ts-legal">{tr('FootOFF Empire · version <0/>', [CURRENT])}</span>
        </span>
      </footer>
    </div>
  );
}
