import React, { useEffect, useRef, useState } from 'react';
import { useKeydown } from './presence';
import { useInputMode } from './input';
import { ClubCrest, Crest } from './crest';
import { fmtMoney } from './format';
import { IconChevron, IconChevronLeft, IconExternal } from './icons';
import { DIVISIONS } from '../game/constants';
import { matchContext, standingsOf } from '../game/season';
import { seasonObjectives } from '../game/objectives';
import { ordinal } from '../game/utils';

// Briques des écrans « console » (écran titre, menu pause) : liste de menu pilotée au clavier, à la souris, au
// doigt et à la manette (voir input.js), aides de commandes, réglages, carte du club, horloge.

// Sons du menu (déplacement, validation, retour) : branchés par App sur l'ambiance sonore du stade (uisound.js).
import { uiSound } from './uisound';
import { clubStars } from '../game/crest';
import { errorReport } from './errlog';
import { canFullscreen, setFullscreen, useFullscreen } from './fullscreen';
import { t, tr } from '../i18n/index';

export { setUiSound, uiSound } from './uisound';

const firstEnabled = (items, from) => {
  for (let k = 0; k < items.length; k++) {
    const i = (from + k) % items.length;
    if (!items[i].disabled) return i;
  }
  return 0;
};

// Liste de menu : `cur` est l'entrée active (barre dorée). Flèches haut / bas (ou manette) pour la changer, la
// souris la suit au survol, Entrée / A l'active (le focus réel suit l'entrée active), Échap / B revient en arrière.
export function useMenu(items, { initial = 0, onBack, active = true } = {}) {
  const [raw, setCur] = useState(() => firstEnabled(items, initial));
  const cur = Math.min(raw, items.length - 1); // la liste peut raccourcir (partie effacée : plus de « Continuer »)
  const refs = useRef([]);
  const step = (d) => setCur((c) => {
    const from = Math.min(c, items.length - 1);
    for (let k = 1; k <= items.length; k++) {
      const n = (((from + d * k) % items.length) + items.length) % items.length;
      if (!items[n].disabled) return n;
    }
    return from;
  });
  useKeydown((e) => {
    if (!active || e.defaultPrevented) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); uiSound('move'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); uiSound('move'); }
    else if (e.key === 'Escape' && onBack) { e.preventDefault(); uiSound('back'); onBack(); }
  });
  useEffect(() => {
    const el = refs.current[cur];
    if (!active || !el) return;
    el.focus({ preventScroll: true });
    // liste qui défile (réglages sur un écran peu haut) : l'entrée choisie est ramenée dans la partie visible
    const box = el.closest('.cm-settings');
    if (box && box.scrollHeight > box.clientHeight) {
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop) box.scrollTop = top;
      else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight;
    }
  }, [cur, active]);
  // survol à la souris : l'entrée devient active (pas au doigt, où un appui suffit)
  const hover = (i) => (e) => {
    if (e.pointerType !== 'mouse' || items[i].disabled || i === cur) return;
    setCur(i);
    uiSound('move');
  };
  return { cur, setCur, refs, hover };
}

// items : [{ id, label, sub?, onSelect?, href?, disabled?, tone? }]
export function MenuList({ items, menu, className = '', label }) {
  const { cur, setCur, refs, hover } = menu;
  return (
    <div className={`cm-list ${className}`} role="menu" aria-label={label}>
      {items.map((it, i) => {
        const cls = `cm-item ${i === cur ? 'on' : ''} ${it.tone || ''}`;
        const body = (
          <>
            <span className="cm-bar" aria-hidden="true" />
            <span className="cm-text">
              <span className="cm-label">{it.label}{it.badge && <i className="cm-badge" aria-label={t('nouveau')} />}</span>
              {it.sub && <span className="cm-sub">{it.sub}</span>}
            </span>
            {it.href ? <IconExternal className="cm-go" /> : <IconChevron className="cm-go" />}
          </>
        );
        const common = { ref: (el) => { refs.current[i] = el; }, role: 'menuitem', className: cls, style: { '--i': i }, onPointerEnter: hover(i), onFocus: () => setCur(i) };
        return it.href ? (
          <a key={it.id} {...common} href={it.href} target="_blank" rel="noreferrer" onClick={() => uiSound('select')}>{body}</a>
        ) : (
          <button key={it.id} {...common} type="button" disabled={it.disabled} onClick={() => { uiSound('select'); it.onSelect?.(); }}>{body}</button>
        );
      })}
    </div>
  );
}

// Aides de commandes au bas de l'écran : touches au clavier, boutons à la manette, rien au doigt.
// items : [[type, libellé]] avec type parmi nav (haut / bas), select, back.
export function Hints({ items, className = '' }) {
  const mode = useInputMode();
  if (mode === 'touch') return null;
  return (
    <div className={`cm-hints ${className}`} aria-hidden="true">
      {items.map(([k, text]) => (
        <span key={k} className="cm-hint">{mode === 'gamepad' ? <PadGlyph k={k} /> : <KeyGlyph k={k} />}{text}</span>
      ))}
    </div>
  );
}

const ARROWS_V = <svg viewBox="0 0 24 24"><path d="M12 4.5v15M8 8.5l4-4 4 4M8 15.5l4 4 4-4" /></svg>;
const DPAD = <svg viewBox="0 0 24 24"><path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6Z" /></svg>;

function KeyGlyph({ k }) {
  if (k === 'nav') return <kbd className="cm-key icon">{ARROWS_V}</kbd>;
  return <kbd className="cm-key">{k === 'select' ? t('Entrée') : t('Échap')}</kbd>;
}

function PadGlyph({ k }) {
  if (k === 'nav') return <i className="cm-pad dpad">{DPAD}</i>;
  return <i className={`cm-pad ${k}`}>{k === 'select' ? 'A' : 'B'}</i>;
}

// Réglages partagés par l'écran titre et le menu pause : son, vibrations, fluidité, plein écran (PC), retour. Pas de qualité graphique :
// un seul rendu, le plus net (render.js) ; « Fluidité sur appareil lent » ne fait que calculer moins de pixels quand
// le jeu rame (adapt.js), et rien sur un appareil qui suit.
// Réglages : son, vibrations, puis la sauvegarde (code à copier pour la retrouver sur un autre appareil, code à coller
// pour restaurer une partie). Le code est copié dans le presse-papiers ; s'il ne peut pas l'être, il s'affiche dans un
// champ à copier soi-même. Coller un code mène à une confirmation du jeu (App) avant de remplacer la partie.
const sizeOf = (code) => t('{max} Ko', { max: Math.max(1, Math.round(code.length / 1024)) });
// focus : l'entrée choisie à l'ouverture (« fluid » : la notification « Le jeu rame » mène au réglage lui-même)
export function SettingsView({ settings, onBack, active = true, focus = null }) {
  const { muted, onToggleSound, vibration, canVibrate, onToggleVibration, fluid = false, onToggleFluid = null, save = null, onExport = null, onImport = null } = settings;
  const [mode, setMode] = useState('menu'); // menu | export (code affiché) | import (code à coller)
  const [code, setCode] = useState('');
  const [note, setNote] = useState(null);
  const [fsOk] = useState(canFullscreen); // PC seulement (fullscreen.js)
  const fullscreen = useFullscreen();
  // Retour en tête (0.8.8, demande du PDG) : la même ligne qu'avant, fixe au-dessus de la liste qui défile, première de
  // la navigation ; le curseur s'ouvre sur Son
  const rows = [{ id: 'back' }, { id: 'sound' }, { id: 'vibration', disabled: !canVibrate }, { id: 'fluid', disabled: !onToggleFluid }, ...(fsOk ? [{ id: 'fullscreen' }] : []),
    { id: 'export', disabled: !save || !onExport }, { id: 'import', disabled: !onImport }, { id: 'report' }];
  const at = (id) => rows.findIndex((r) => r.id === id); // rang d'une entrée (le plein écran n'existe que sur PC)
  const menu = useMenu(rows, { initial: focus ? Math.max(0, at(focus)) : at('sound'), onBack: () => (mode === 'menu' ? onBack() : setMode('menu')), active: active && mode === 'menu' });
  const { cur, setCur, refs, hover } = menu;
  const row = (i) => ({ ref: (el) => { refs.current[i] = el; }, onPointerEnter: hover(i), onFocus: () => setCur(i), style: { '--i': i } });
  const vibOn = vibration && canVibrate;
  const doExport = async () => {
    uiSound('select');
    const c = await onExport();
    setCode(c);
    let copied = false;
    try { await navigator.clipboard.writeText(c); copied = true; } catch { /* presse-papiers refusé : le code s'affiche */ }
    setNote(copied ? t('Code copié ({sizeOf}). Colle-le dans les réglages du jeu sur ton autre appareil.', { sizeOf: sizeOf(c) }) : t('Copie-le toi-même ci-dessous.'));
    setMode('export');
  };
  const doImport = async () => {
    const err = await onImport(code);
    if (err) { uiSound('back'); setNote(err); return; }
    setMode('menu');
    setCode('');
    setNote(null);
  };
  // Signaler un problème : un rapport à coller dans un message (version, navigateur, dernières erreurs), avec ou sans la
  // partie en cours (son code de sauvegarde, pour rejouer le problème) : c'est le joueur qui choisit.
  const doReport = async (withSave) => {
    uiSound('select');
    let text = errorReport(null, save ? t('{clubName} · saison {season} · {division}', { clubName: save.clubName, season: save.season, division: save.division }) : t('aucune partie'));
    if (withSave && onExport) text += t('\n\nPARTIE (code de sauvegarde) :\n{v}', { v: await onExport() });
    setCode(text);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* presse-papiers refusé : le texte s'affiche */ }
    setNote(copied ? t('Rapport copié ({sizeOf}). Colle-le dans ton message, avec ce que tu faisais au moment du problème.', { sizeOf: sizeOf(text) }) : t('Copie-le toi-même ci-dessous.'));
    setMode('report-done');
  };
  if (mode === 'report') {
    return (
      <div className="cm-settings cm-save" role="group" aria-label={t('Signaler un problème')}>
        <p className="cm-save-lead">{t('Le rapport contient la version du jeu, ton navigateur, la taille de l’écran et les vingt dernières erreurs. Avec la partie, il contient aussi son code de sauvegarde : c’est ce qui permet de rejouer exactement ce qui s’est passé. Rien n’est envoyé : tu le colles toi-même dans un message.')}</p>
        <div className="cm-save-actions">
          <button type="button" className="btn ghost" onClick={() => { uiSound('back'); setMode('menu'); }}>{t('Retour')}</button>
          <button type="button" className="btn ghost" onClick={() => doReport(false)}>{t('Sans la partie')}</button>
          <button type="button" className="btn" disabled={!save || !onExport} onClick={() => doReport(true)}>{t('Avec la partie')}</button>
        </div>
      </div>
    );
  }
  if (mode !== 'menu') {
    return (
      <div className="cm-settings cm-save" role="group" aria-label={mode === 'export' ? t('Code de sauvegarde') : t('Restaurer une sauvegarde')}>
        <p className="cm-save-lead">{mode === 'export' ? t('Code de sauvegarde de {v} · saison {v2}', { v: save?.clubName, v2: save?.season }) : mode === 'report-done' ? t('Rapport à signaler') : t('Colle ici un code de sauvegarde copié depuis un autre appareil.')}</p>
        <textarea
          className="cm-code"
          value={code}
          readOnly={mode !== 'import'}
          onChange={(e) => setCode(e.target.value)}
          onFocus={(e) => { if (mode !== 'import') e.target.select(); }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={mode === 'import' ? t('FOE1:…') : ''}
          aria-label={t('Code de sauvegarde')}
        />
        {note && <p className={`cm-save-note ${mode === 'import' && note ? 'warn' : ''}`}>{note}</p>}
        <div className="cm-save-actions">
          <button type="button" className="btn ghost" onClick={() => { uiSound('back'); setMode('menu'); setNote(null); if (mode === 'import') setCode(''); }}>{t('Retour')}</button>
          {mode === 'import' && <button type="button" className="btn" disabled={!code.trim()} onClick={doImport}>{t('Restaurer')}</button>}
        </div>
      </div>
    );
  }
  return (
    <>
    <button type="button" className={`cm-row back top ${cur === at('back') ? 'on' : ''}`} {...row(at('back'))} onClick={() => { uiSound('back'); onBack(); }}>
      <span className="cm-bar" aria-hidden="true" />
      <IconChevronLeft className="cm-back-icon" />
      <span className="cm-row-text"><strong>{t('Retour')}</strong></span>
    </button>
    <div className="cm-settings" role="menu" aria-label={t('Réglages')}>
      <button type="button" role="menuitemcheckbox" aria-checked={!muted} className={`cm-row ${cur === at('sound') ? 'on' : ''}`} {...row(at('sound'))} onClick={() => { onToggleSound(); uiSound('select'); }}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text"><strong>{t('Son')}</strong><span>{t('Ambiance du stade, sifflet, pièces et sons du menu.')}</span></span>
        <span className={`switch ${muted ? '' : 'on'}`} aria-hidden="true"><i /></span>
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={vibOn} disabled={!canVibrate} className={`cm-row ${cur === at('vibration') ? 'on' : ''}`} {...row(at('vibration'))} onClick={() => { onToggleVibration(); uiSound('select'); }}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text">
          <strong>{t('Vibrations')}</strong>
          <span>{canVibrate ? t('But marqué, vente, construction.') : t('Non disponibles sur ce navigateur (c’est le cas sur iPhone).')}</span>
        </span>
        <span className={`switch ${vibOn ? 'on' : ''}`} aria-hidden="true"><i /></span>
      </button>
      <button type="button" role="menuitemcheckbox" aria-checked={fluid} disabled={!onToggleFluid} className={`cm-row ${cur === at('fluid') ? 'on' : ''}`} {...row(at('fluid'))} onClick={() => { onToggleFluid(); uiSound('select'); }}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text">
          <strong>{t('Fluidité sur appareil lent')}</strong>
          <span>{t('Si le jeu rame, la 3D est calculée avec moins de pixels (un peu moins nette) pour redevenir fluide. Sans effet sur un appareil qui suit.')}</span>
        </span>
        <span className={`switch ${fluid ? 'on' : ''}`} aria-hidden="true"><i /></span>
      </button>
      {fsOk && (
        <button type="button" role="menuitemcheckbox" aria-checked={fullscreen} className={`cm-row ${cur === at('fullscreen') ? 'on' : ''}`} {...row(at('fullscreen'))} onClick={() => { setFullscreen(!fullscreen); uiSound('select'); }}>
          <span className="cm-bar" aria-hidden="true" />
          <span className="cm-row-text">
            <strong>{t('Plein écran')}</strong>
            <span>{t('Le jeu occupe tout l’écran, sans la barre du navigateur. Échap pour en sortir ; allumé, il revient à ton premier clic quand tu rouvres le jeu.')}</span>
          </span>
          <span className={`switch ${fullscreen ? 'on' : ''}`} aria-hidden="true"><i /></span>
        </button>
      )}
      <button type="button" role="menuitem" disabled={!save || !onExport} className={`cm-row ${cur === at('export') ? 'on' : ''}`} {...row(at('export'))} onClick={doExport}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text">
          <strong>{t('Copier le code de sauvegarde')}</strong>
          <span>{save ? t('{clubName} · saison {season}, {division} · pour continuer sur un autre appareil.', { clubName: save.clubName, season: save.season, division: save.division }) : t('Aucune partie en cours.')}</span>
        </span>
      </button>
      <button type="button" role="menuitem" disabled={!onImport} className={`cm-row ${cur === at('import') ? 'on' : ''}`} {...row(at('import'))} onClick={() => { uiSound('select'); setCode(''); setNote(null); setMode('import'); }}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text">
          <strong>{t('Restaurer un code de sauvegarde')}</strong>
          <span>{save ? t('La partie actuelle sera gardée en copie de secours.') : t('Reprends une partie copiée depuis un autre appareil.')}</span>
        </span>
      </button>
      <button type="button" role="menuitem" className={`cm-row ${cur === at('report') ? 'on' : ''}`} {...row(at('report'))} onClick={() => { uiSound('select'); setMode('report'); setNote(null); }}>
        <span className="cm-bar" aria-hidden="true" />
        <span className="cm-row-text">
          <strong>{t('Signaler un problème')}</strong>
          <span>{t('Un rapport à coller dans un message : version, erreurs, et ta partie si tu l’acceptes.')}</span>
        </span>
      </button>
    </div>
    </>
  );
}

const outcomeOf = (m) => (m.pens ? (m.pens[0] > m.pens[1] ? 'win' : 'loss') : m.gf > m.ga ? 'win' : m.gf < m.ga ? 'loss' : 'draw');
const LETTER = { win: t('V', undefined, 'résultat'), draw: t('N', undefined, 'résultat'), loss: t('D', undefined, 'résultat') };

// Carte de la partie en cours : club, classement, points, journée, forme, prochain match, objectif, trésorerie.
// head : en-tête du club (nom, division), inutile quand l'écran l'affiche déjà en grand (pause).
export function ClubCard({ state, eyebrow, objective = false, head = true }) {
  const div = DIVISIONS[state.divisionIndex];
  const pos = standingsOf(state).findIndex((t) => t.i === 0) + 1;
  const me = state.table?.[0] || { pts: 0, played: 0 };
  const total = state.schedule?.length || 7;
  const ctx = matchContext(state);
  const form = (state.matches || []).filter((m) => m.season === state.seasonNumber).slice(-5);
  const goals = objective ? seasonObjectives(state) : null; // objectifs du conseil d'administration (objectives.js)
  const rank = ordinal(pos); // « 4e », « 1er » : le chiffre en grand, le suffixe en petit
  const num = rank.match(/^\d+/)?.[0] || rank;
  return (
    <section className={`cm-card cm-club ${head ? '' : 'flat'}`}>
      {head ? (
        <header className="cm-card-head">
          <ClubCrest crest={state.crest} name={state.clubName} className="cm-card-mark" stars={clubStars(state)} />
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <strong>{state.clubName}</strong>
            <span>{tr('<0/> · Saison <1/>', [div.name, state.seasonNumber])}</span>
          </div>
        </header>
      ) : <span className="eyebrow">{eyebrow}</span>}
      <div className="cm-card-stats">
        <div><span>{t('Classement')}</span><b>{me.played ? <>{num}<small>{rank.slice(num.length)}</small></> : '—'}</b></div>
        <div><span>{t('Points')}</span><b>{me.pts}</b></div>
        <div><span>{t('Journées')}</span><b>{Math.min(state.round, total)}<small>/ {total}</small></b></div>
      </div>
      <dl className="cm-card-rows">
        {form.length > 0 && (
          <div><dt>{t('Forme')}</dt><dd className="cm-form">{form.map((m, i) => { const o = outcomeOf(m); return <i key={i} className={o}>{LETTER[o]}</i>; })}</dd></div>
        )}
        {ctx ? (
          <div><dt>{tr('Prochain match · <0/>', [ctx.short || ctx.label])}</dt><dd className="cm-opp"><Crest name={ctx.opp.name} className="cm-opp-crest" /><span>{ctx.opp.name}</span></dd></div>
        ) : (
          <div><dt>{t('Prochain match')}</dt><dd>{t('Saison terminée, place au bilan')}</dd></div>
        )}
        {goals && <div className="stack"><dt>{tr('Objectifs de la saison · <0/>/<1/>', [goals.done, goals.list.length])}</dt><dd>{goals.list.map((o) => `${o.state === 'done' ? '✓ ' : o.state === 'failed' ? '✗ ' : ''}${o.title}`).join(' · ')}</dd></div>}
        <div><dt>{t('Trésorerie')}</dt><dd className={state.money < 0 ? 'neg' : ''}>{fmtMoney(state.money)}</dd></div>
      </dl>
    </section>
  );
}
