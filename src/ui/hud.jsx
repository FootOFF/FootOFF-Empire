import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGlass } from './glass';
import { DIVISIONS } from '../game/constants';
import { repLevel } from '../game/reputation';
import { activeGoal } from '../game/goals';
import { seasonObjectives } from '../game/objectives';
import { prematchOdds } from '../game/live';
import { matchContext, standingsOf } from '../game/season';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { roundPercents } from './format';
import {
  IconCal, IconCheck, IconChevron, IconCoin, IconEmpire, IconMenu, IconMoon, IconPlay, IconStadium, IconStar, IconSun,
  IconTarget, IconTrophy, IconUsers, IconClock, IconEye, IconCrane, IconStaff, IconClose, IconTransfer, IconShield,
} from './icons';
import { sectionOf } from './nav';
import { clubStars } from '../game/crest';
import { useFitText } from './fittext';

// HUD du jeu : couches fixes au-dessus de la vue 3D plein écran, en plaques façon habillage télé (docs/DESIGN.md).

const euros = (v) => `${new Intl.NumberFormat('fr-FR').format(v)} €`;
const ordinal = (n) => <>{n}<sup>{n === 1 ? 'er' : 'e'}</sup></>;

// Bandeaux du haut, découpés en cases comme un score télé : à gauche le club (écusson, nom, division et saison,
// journée, classement en or), à droite la trésorerie et la notoriété, puis le menu. Téléphone : le club et le menu
// sur la première ligne, les ressources dessous (la journée passe dans la ligne du club).
export function TopHud({ state, onMenu, onFinances, onReputation, onTable }) {
  const div = DIVISIONS[state.divisionIndex];
  const rl = repLevel(state.reputation); // statut de notoriété et avancée vers le suivant (reputation.js)
  const rounds = state.schedule.length;
  const round = Math.min(state.round + 1, rounds); // journée à jouer (la dernière une fois le championnat fini)
  const rank = state.table[0].played ? standingsOf(state).findIndex((t) => t.i === 0) + 1 : null; // avant la 1re journée : « – »
  const nameRef = useFitText(state.clubName, 17);
  return (
    <header className="hud-top">
      <div className="hud-bug hud-club" aria-label="Club">
        <span className="hud-cell hud-crest"><ClubCrest crest={state.crest} name={state.clubName} className="hud-mark" stars={clubStars(state)} /></span>
        <span className="hud-cell hud-id">
          <span className="hud-club-name" ref={nameRef}>{state.clubName}</span>
          <span className="hud-club-meta">{div.name}<span className="hud-meta-season"> · Saison {state.seasonNumber}</span><span className="hud-meta-round"> · J{round}/{rounds}</span></span>
        </span>
        <span className="hud-cell hud-round"><small>Journée</small><b>{round}/{rounds}</b></span>
        <button className="hud-cell hud-rank" onClick={onTable} title="Voir le classement"
          aria-label={rank ? `Classement : ${rank === 1 ? '1er' : `${rank}e`}, voir le classement` : 'Classement : aucune journée jouée, voir le classement'}>
          <small>Classement</small><b className={rank ? '' : 'none'}>{rank ? ordinal(rank) : '–'}</b>
        </button>
      </div>
      <div className="hud-bug hud-res" aria-label="Ressources">
        <button className={`hud-cell hud-money ${state.money < 0 ? 'neg' : ''}`} onClick={onFinances} title="Trésorerie : voir les finances" aria-label="Trésorerie : voir les finances" data-money-target>
          <IconCoin />
          <span className="hud-stack"><small>Trésorerie</small><b className="hud-val"><AnimatedMoney value={state.money} /></b></span>
        </button>
        <button className="hud-cell hud-rep" onClick={onReputation} aria-label={`Notoriété : ${rl.level.name}, réputation ${Math.round(state.reputation)}`}
          title={`${rl.level.name}${rl.next ? ` · prochain statut : ${rl.next.name} à ${rl.next.min} de réputation` : ''} · voir ce qu’elle apporte`}>
          <IconStar />
          <span className="hud-stack">
            <small>{rl.level.name}</small>
            <span className="hud-repline">
              <b className="hud-val">{Math.round(state.reputation)}</b>
              <span className="hud-rep-bar" aria-hidden="true"><i style={{ width: `${rl.progress * 100}%` }} /></span>
              {rl.next && <em className="hud-rep-next">{rl.next.min}</em>}
            </span>
          </span>
        </button>
      </div>
      <button className="hud-bug hud-menu" onClick={onMenu} aria-label="Menu"><IconMenu /></button>
    </header>
  );
}

// Objectifs du conseil d'administration (objectives.js ; le président, c'est le joueur) : les trois défis de la saison,
// leur avancée en direct (barre, chiffre du jour), leur prime ; le bonus de la saison parfaite ; puis la grande étape
// de réputation en cours (goals.js).
// Replié : une seule ligne, « Objectifs 1/3 · jusqu'à +67 500 € » (ce qui peut encore être gagné cette saison).
export function ObjectiveWidget({ state, collapsed, onToggle }) {
  const obj = seasonObjectives(state);
  if (!obj) return null;
  const g = state.goals ? activeGoal(state) : null;
  // grande étape atteinte en cours de saison : la prime n'arrive qu'au bilan, on le dit
  const step = g && !state.goals.completed[g.tier] && g.active.done(state);
  const n = obj.list.length;
  const failed = obj.list.some((o) => o.state === 'failed');
  const max = obj.list.reduce((a, o) => a + (o.state === 'failed' ? 0 : o.prize.money), 0) + (failed ? 0 : obj.perfect.money);
  const all = obj.done === n;
  return (
    <aside className={`hud-goal glass ${collapsed ? 'collapsed' : ''} ${all ? 'achieved' : ''}`} aria-label="Objectifs du conseil">
      <button className="hud-goal-head" onClick={onToggle} aria-expanded={!collapsed}>
        {collapsed ? (
          <>
            <span className="hud-goal-k">Objectifs {obj.done}/{n}</span>
            <span className="hud-goal-max">{all ? <><b>+{euros(max)}</b> au bilan</> : max ? <>jusqu’à <b>+{euros(max)}</b></> : 'manqués'}</span>
          </>
        ) : (
          <>
            <span className="hud-goal-k mark-head">Objectifs du conseil</span>
            <span className="hud-goal-count">{obj.done} sur {n}</span>
          </>
        )}
        <IconChevron className="hud-goal-chev" />
      </button>
      {!collapsed && (
        <div className="hud-goal-body">
          <ul className="hud-objs">
            {obj.list.map((o) => (
              <li key={o.id} className={`hud-obj ${o.state}`}>
                <i className="hud-obj-mark" aria-hidden="true">{o.state === 'done' ? <IconCheck /> : o.state === 'failed' ? <IconClose /> : null}</i>
                <strong className="hud-obj-title">{o.title}</strong>
                <b className="hud-obj-prize">+{euros(o.prize.money)}</b>
                <span className="hud-obj-sub">
                  <span className="hud-obj-bar" aria-hidden="true"><i style={{ width: `${Math.round(o.ratio * 100)}%` }} /></span>
                  <em>{o.state === 'done' ? 'atteint, prime au bilan' : o.state === 'failed' ? 'manqué' : o.now}</em>
                </span>
              </li>
            ))}
          </ul>
          <p className="hud-goal-foot"><span>Les trois réussis : bonus</span><b>+{euros(obj.perfect.money)}</b></p>
          {g && <p className="hud-goal-foot step"><span>Grande étape · {g.active.name}{step ? ' (atteinte)' : ''}</span><b>{g.goal.reward.short || g.goal.reward.label}</b></p>}
        </div>
      )}
    </aside>
  );
}

// Cinq sections (nav.jsx) : Complexe (la vue 3D), Équipe, Mercato, Saison, Club. Le stade n'a pas de bouton : on
// l'ouvre en le touchant dans la vue 3D.
const DOCK = [
  { id: null, section: null, label: 'Complexe', Icon: IconEmpire },
  { id: 'squad', section: 'equipe', label: 'Équipe', Icon: IconUsers },
  { id: 'mercato', section: 'mercato', label: 'Mercato', Icon: IconTransfer },
  { id: 'season', section: 'saison', label: 'Saison', Icon: IconCal },
  { id: 'club', section: 'club', label: 'Club', Icon: IconShield },
];

// Pastille du dock : point doré (action utile), « ! » rouge (alerte) ou nombre (rouge, comme une notification).
function DockBadge({ value }) {
  if (!value) return null;
  if (value === 'dot') return <i className="dock-badge dot" aria-label="Action disponible" />;
  if (value === 'warn') return <i className="dock-badge warn" aria-label="Alerte">!</i>;
  return <i className="dock-badge" aria-label={`${value} à traiter`}>{value}</i>;
}

// Raccourci clavier du HUD (PC) : touche physique (code), sans modificateur, jamais pendant une saisie ; actif
// seulement quand le HUD est utilisable (pas de menu, d'écran de match ni de confirmation).
export function useHudKey(codes, onKey, enabled) {
  const fn = useRef(onKey);
  fn.current = onKey;
  useEffect(() => {
    if (!enabled) return undefined;
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const i = codes.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      fn.current(i);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
const DOCK_KEYS = [1, 2, 3, 4, 5];
const DOCK_CODES = [...DOCK_KEYS.map((n) => `Digit${n}`), ...DOCK_KEYS.map((n) => `Numpad${n}`)];

// Menu du bas : la sélection est une pastille en verre liquide (façon iOS) qui glisse d'un bouton à l'autre en
// s'étirant ; on peut aussi la faire glisser au doigt le long du menu, la section s'ouvre au relâché. Sur PC, les
// touches 1 à 5 ouvrent les sections (rappelées au survol).
export function Dock({ panel, onPanel, badges = {}, keys = false }) {
  const section = sectionOf(panel);
  const active = DOCK.find((d) => d.section && d.section === section)?.id ?? null; // panneau hors menu : le Complexe
  const keyOf = (id) => id || 'empire';
  const { ref, glass, handlers, hoverKey } = useGlass(keyOf(active), (k) => {
    const d = DOCK.find((x) => keyOf(x.id) === k);
    if (d) onPanel(d.id);
  });
  useHudKey(DOCK_CODES, (i) => {
    const { id } = DOCK[i % DOCK.length];
    onPanel(active === id ? null : id);
  }, keys);
  return (
    <nav ref={ref} className="hud-dock" aria-label="Navigation" {...handlers}>
      {glass}
      {DOCK.map(({ id, label, Icon }, i) => {
        const lit = hoverKey === null ? active === id : hoverKey === keyOf(id);
        return (
          <button
            key={label}
            className={lit ? 'active' : ''}
            data-id={keyOf(id)}
            data-key={keyOf(id)}
            onClick={() => onPanel(active === id ? null : id)}
            aria-current={active === id ? 'page' : undefined}
            aria-keyshortcuts={String(DOCK_KEYS[i])}
          >
            <Icon />
            <span>{label}</span>
            <kbd className="dock-key" aria-hidden="true">{DOCK_KEYS[i]}</kbd>
            <DockBadge value={badges[keyOf(id)]} />
          </button>
        );
      })}
    </nav>
  );
}

// Prochain match : écusson de l'adversaire, compétition et journée, nom, chances de victoire (le pronostic de
// l'avant-match, calculé sur le même moteur avec le onze et la tactique enregistrés), bouton Jouer (touche J).
export function MatchCta({ state, onPlay, onEndSeason, keys = false }) {
  const ctx = matchContext(state);
  const done = !ctx;
  useHudKey(['KeyJ'], () => (done ? onEndSeason() : onPlay()), keys); // J : jouer (ou bilan de fin de saison)
  const odds = useMemo(() => (ctx ? prematchOdds(state, { oppStrength: ctx.opp.strength, home: ctx.home !== false }) : null), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleRef = useFitText(ctx?.opp.name, 17);
  if (done) {
    return (
      <section className="hud-match glass done" aria-label="Fin de saison">
        <span className="hm-icon" aria-hidden="true"><IconTrophy /></span>
        <div className="hm-info">
          <span className="hm-eyebrow">Saison {state.seasonNumber} terminée</span>
          <strong className="hud-match-title">Place au bilan</strong>
        </div>
        <button className="btn" onClick={onEndSeason} aria-keyshortcuts="J"><IconTrophy /> Bilan<kbd className="hm-key" aria-hidden="true">J</kbd></button>
      </section>
    );
  }
  const opp = ctx.opp;
  const league = ctx.comp === 'league';
  const [w, d, l] = roundPercents([odds.win, odds.draw, odds.loss]); // les chiffres de l'avant-match, au point près
  return (
    <section className={`hud-match glass comp-${ctx.comp}`} aria-label="Prochain match">
      <Crest name={opp.name} className="hm-crest" />
      <div className="hm-info">
        <span className="hm-eyebrow" title={ctx.label}>
          {league ? <><span className="hm-long">Journée </span><span className="hm-short">J</span>{state.round + 1}/{state.schedule.length}</> : ctx.short} · {ctx.home === false ? 'À l’extérieur' : 'À domicile'}
        </span>
        <strong className="hud-match-title" ref={titleRef} title={opp.name}>{opp.name}</strong>
        <span className="hm-odds" title={`Pronostic : victoire ${w.label}, nul ${d.label}, défaite ${l.label}`}>
          <span className="tri" aria-hidden="true"><i style={{ flexGrow: odds.win * 100 }} /><i style={{ flexGrow: odds.draw * 100 }} /><i style={{ flexGrow: odds.loss * 100 }} /></span>
          <b>{w.label}</b> de victoire
        </span>
      </div>
      <button className="btn" onClick={onPlay} title="Jouer le match (J)" aria-label="Jouer le match" aria-keyshortcuts="J"><IconPlay className="fill" /> Jouer<kbd className="hm-key" aria-hidden="true">J</kbd></button>
    </section>
  );
}

const TIME_UI = {
  auto: { Icon: IconClock, label: 'Auto', title: 'Heure réelle (cycle jour / nuit)' },
  day: { Icon: IconSun, label: 'Jour', title: 'Toujours en journée' },
  night: { Icon: IconMoon, label: 'Nuit', title: 'Toujours la nuit' },
};

// Colonne d'outils, à droite : Bâtir (vitrine des bâtiments, touche B), Staff (conseil), Vue (réglages de la vue,
// repliés : heure, jour de match, recentrer). build vaut null (rien à construire), 'idle', 'dot' (un bâtiment est
// payable tout de suite : pastille dorée) ou 'open' (vitrine ouverte).
// Conseil du staff : présent tant que le staff a un conseil (point doré, rouge pour une alerte, tant qu'on ne l'a pas
// lu). Un conseil nouveau s'annonce quelques secondes dans une bulle à gauche de la colonne, puis la bulle se range
// dans le bouton ; un appui la rouvre, un appui ailleurs la range.
const PEEK_MS = 7000;
function useStaffBubble(tip) {
  const [open, setOpen] = useState(false); // false | 'peek' (annonce) | 'open' (ouverte par le joueur)
  const [read, setRead] = useState(() => new Set());
  const seen = useRef(new Set());
  const id = tip?.id;
  useEffect(() => {
    if (!id) { setOpen(false); return undefined; }
    if (seen.current.has(id)) return undefined;
    seen.current.add(id);
    setOpen('peek');
    const t = setTimeout(() => setOpen((o) => (o === 'peek' ? false : o)), PEEK_MS);
    return () => clearTimeout(t);
  }, [id]);
  useEffect(() => { if (id && open === 'open') setRead((r) => (r.has(id) ? r : new Set(r).add(id))); }, [id, open]);
  return { open, setOpen, unread: !!id && !read.has(id) };
}

// row : rang du bouton Staff dans la colonne (la bulle se pose à sa hauteur, sa pointe vers lui)
function StaffBubble({ tip, row, onAction, onDismiss, onClose }) {
  const ref = useRef(null);
  useEffect(() => { // un appui ailleurs ou Échap range la bulle (le bouton du staff la gère lui-même)
    const away = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.('.tools-staff')) onClose(); };
    const esc = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <aside ref={ref} className={`staff-bubble ${tip.tone || ''}`} style={{ '--row': row }} aria-live="polite" aria-label="Conseil du staff">
      <span className="staff-eyebrow mark-head">Conseil du staff</span>
      <strong className="staff-title">{tip.title}</strong>
      <p className="staff-text">{tip.text}</p>
      <div className="staff-actions">
        <button className="btn btn-sm" onClick={onAction}>{tip.action.label}</button>
        <button className="staff-hide" onClick={onDismiss} aria-label="Masquer ce conseil">Masquer</button>
      </div>
    </aside>
  );
}

export function SceneTools({ timeMode, matchDay, onTime, onMatchDay, onRecenter, build = null, onBuild, keys = false, tip = null, onTipAction, onTipDismiss }) {
  const T = TIME_UI[timeMode] || TIME_UI.auto;
  const [view, setView] = useState(false); // réglages de la vue, repliés derrière « Vue »
  const staff = useStaffBubble(tip);
  useHudKey(['KeyB'], () => onBuild?.(), keys && !!build);
  return (
    <>
    <nav className={`hud-tools ${view ? 'open' : ''}`} aria-label="Outils du complexe">
      {build && (
        <button className={`tools-build ${build === 'open' ? 'on' : ''}`} onClick={onBuild} aria-pressed={build === 'open'} aria-keyshortcuts="B" title="Construire · touche B">
          <IconCrane /><span>Bâtir</span>
          {build === 'dot' && <i className="tools-dot" aria-hidden="true" />}
        </button>
      )}
      {tip && (
        <button className={`tools-staff ${staff.open ? 'on' : ''} ${tip.tone || ''}`} onClick={() => staff.setOpen((o) => (o === 'open' ? false : 'open'))}
          aria-expanded={!!staff.open} title="Conseil du staff">
          <IconStaff /><span>Staff</span>
          {staff.unread && !staff.open && <i className="tools-dot" aria-hidden="true" />}
        </button>
      )}
      <button className={`tools-view ${view ? 'on' : ''}`} onClick={() => setView((v) => !v)} aria-expanded={view} title="Réglages de la vue">
        <IconEye /><span>Vue</span>
      </button>
      {view && (
        <>
          <button className={`tools-sub ${timeMode !== 'auto' ? 'set' : ''}`} onClick={onTime} disabled={matchDay} title={`${T.title} : toucher pour changer`}>
            <T.Icon /><span>{T.label}</span>
          </button>
          <button className={`tools-sub ${matchDay ? 'set' : ''}`} onClick={onMatchDay} aria-pressed={matchDay} title="Jour de match : stade plein, projecteurs">
            <IconStadium /><span>Match</span>
          </button>
          <button className="tools-sub" onClick={onRecenter} title="Recentrer la vue"><IconTarget /><span>Centrer</span></button>
        </>
      )}
    </nav>
    {tip && staff.open && (
      <StaffBubble key={tip.id} tip={tip} row={build ? 1 : 0} onClose={() => staff.setOpen(false)}
        onAction={() => { staff.setOpen(false); onTipAction?.(); }} onDismiss={() => { staff.setOpen(false); onTipDismiss?.(); }} />
    )}
    </>
  );
}
