import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGlass } from './glass';
import { divisionOf } from '../game/constants';
import { repLevel } from '../game/reputation';
import { activeChapter } from '../game/journey';
import { seasonObjectives } from '../game/objectives';
import { awayElevenOf, prematchOdds } from '../game/live';
import { matchContext, standingsOf } from '../game/season';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { fmtMoney, roundPercents } from './format';
import {
  IconCal, IconCheck, IconChevron, IconCoin, IconEmpire, IconMenu, IconMoon, IconPlay, IconStadium, IconStar, IconSun,
  IconTarget, IconTrophy, IconUsers, IconClock, IconEye, IconCrane, IconStaff, IconClose, IconTransfer, IconShield,
} from './icons';
import { sectionOf } from './nav';
import { clubStars } from '../game/crest';
import { useFitText } from './fittext';
import { deadlineText } from '../game/league';
import { duesNow } from '../game/advice';

// HUD du jeu : couches fixes au-dessus de la vue 3D plein écran, en plaques façon habillage télé (docs/DESIGN.md).

const euros = (v) => `${new Intl.NumberFormat('fr-FR').format(v)} €`;
const ordinal = (n) => <>{n}<sup>{n === 1 ? 'er' : 'e'}</sup></>;

// Bandeaux du haut, découpés en cases comme un score télé : à gauche le club (écusson, nom, division et saison,
// journée, classement en or), à droite la trésorerie et la notoriété, puis le menu. Téléphone : le club et le menu
// sur la première ligne, les ressources dessous (la journée passe dans la ligne du club).
export function TopHud({ state, onMenu, onFinances, onReputation, onTable }) {
  const div = divisionOf(state);
  const rl = repLevel(state.reputation); // statut de notoriété et avancée vers le suivant (reputation.js)
  const due = duesNow(state); // salaires et entretien à payer au bilan, et ce qui reste disponible (economy.js)
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
        <button className={`hud-cell hud-money ${state.money < 0 ? 'neg' : ''}`} onClick={onFinances} title={`Trésorerie : ${fmtMoney(due.total)} à payer en fin de saison, dont ${fmtMoney(due.owed)} déjà dus ; ${fmtMoney(due.available)} disponibles · voir les finances`}
          aria-label={`Trésorerie : ${fmtMoney(state.money)} ; à payer en fin de saison : ${fmtMoney(due.total)}, dont ${fmtMoney(due.owed)} déjà dus ; disponible : ${fmtMoney(due.available)}. Voir les finances`} data-money-target>
          <IconCoin />
          <span className="hud-stack">
            <small>Trésorerie</small>
            <b className="hud-val"><AnimatedMoney value={state.money} /></b>
            <em className={`hud-avail ${due.available < 0 ? 'neg' : ''}`}><span className="hide-sm">disponible</span><span className="show-sm">dispo</span> {fmtMoney(due.available)}</em>
          </span>
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
// leur avancée en direct (barre, chiffre du jour), leur prime ; le bonus de la saison parfaite ; puis le chapitre en cours
// du parcours de carrière (journey.js, 0.8.11), sur plusieurs saisons, avec sa prime versée dès qu'il est accompli.
// Replié : une seule ligne, « Objectifs 1/3 · jusqu'à +67 500 € » (ce qui peut encore être gagné cette saison).
export function ObjectiveWidget({ state, collapsed, onToggle }) {
  const obj = seasonObjectives(state);
  if (!obj) return null;
  const ch = state.journey ? activeChapter(state) : null;
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
          {ch && <p className="hud-goal-foot step"><span title={ch.chapter.goal}>Carrière · {ch.chapter.title} <em>{ch.progress.now}</em></span><b>{ch.reward.short}</b></p>}
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
// league (partie de championnat entre amis) : { pending : la journée est jouée, notre match est à regarder ; sent : notre
// équipe est validée ; deadline : l'heure de la journée ; onWatch(skip) ; seasonOver : la ligue est passée à la saison
// suivante ; kickoff : tous ont validé, coup d'envoi à cette heure (0.8.6) }. « Jouer » ouvre l'avant-match pour valider
// l'équipe ; une fois tous validés, un compte à rebours de dix minutes remplace « Validée » (l'équipe se retouche encore),
// puis le match se regarde.
export function MatchCta({ state, onPlay, onEndSeason, keys = false, league = null }) {
  const ctx = matchContext(state);
  const done = !ctx;
  const watch = !!league?.pending;
  const waitSeason = done && league && !league.seasonOver; // dernière journée appliquée, la ligue n'a pas encore tourné
  useHudKey(['KeyJ'], () => (watch ? league.onWatch() : done ? (waitSeason ? null : onEndSeason()) : onPlay()), keys); // J : jouer (ou bilan de fin de saison)
  const odds = useMemo(() => (ctx ? prematchOdds(state, { oppStrength: ctx.opp.strength, home: ctx.home !== false, away: awayElevenOf(state, ctx) }) : null), [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleRef = useFitText(ctx?.opp.name, 17);
  if (watch) { // la journée est jouée : notre match nous attend, comme un direct
    return (
      <section className="hud-match glass comp-league" aria-label="Match à regarder">
        {ctx ? <MatchCrest opp={ctx.opp} /> : <span className="hm-icon" aria-hidden="true"><IconPlay /></span>}
        <div className="hm-info">
          <span className="hm-eyebrow">{ctx ? <>J{state.round + 1}/{state.schedule.length} · {ctx.home === false ? 'Extérieur' : 'Domicile'}</> : 'Dernière journée'}</span>
          <strong className="hud-match-title" ref={titleRef} title={ctx?.opp.name}>{ctx ? ctx.opp.name : 'Ton match'}</strong>
          <span className="hm-odds"><button type="button" className="linkbtn" onClick={() => league.onWatch(true)}>Voir le résultat sans le match</button></span>
        </div>
        <button className="btn" onClick={() => league.onWatch()} aria-keyshortcuts="J"><IconPlay className="fill" /> Regarder<kbd className="hm-key" aria-hidden="true">J</kbd></button>
      </section>
    );
  }
  if (waitSeason) {
    return (
      <section className="hud-match glass done" aria-label="Fin de saison">
        <span className="hm-icon" aria-hidden="true"><IconTrophy /></span>
        <div className="hm-info">
          <span className="hm-eyebrow">Saison {state.seasonNumber} terminée</span>
          <strong className="hud-match-title">Le bilan arrive</strong>
          <span className="hm-odds">La ligue passe à la saison suivante</span>
        </div>
      </section>
    );
  }
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
  const champ = ctx.comp === 'league'; // journée de championnat (sinon un tour de coupe)
  const [w, d, l] = roundPercents([odds.win, odds.draw, odds.loss]); // les chiffres de l'avant-match, au point près
  return (
    <section className={`hud-match glass comp-${ctx.comp} ${league?.sent ? 'sent' : ''}`} aria-label="Prochain match">
      <MatchCrest opp={opp} />
      <div className="hm-info">
        <span className="hm-eyebrow" title={ctx.label}>
          {champ ? <>J{state.round + 1}/{state.schedule.length}</> : ctx.short} · {ctx.home === false ? 'Extérieur' : 'Domicile'}
        </span>
        <strong className="hud-match-title" ref={titleRef} title={opp.name}>{opp.name}</strong>
        <span className="hm-odds" title={`Pronostic : victoire ${w.label}, nul ${d.label}, défaite ${l.label}`}>
          <span className="tri" aria-hidden="true"><i style={{ flexGrow: odds.win * 100 }} /><i style={{ flexGrow: odds.draw * 100 }} /><i style={{ flexGrow: odds.loss * 100 }} /></span>
          <span className="hm-odds-text"><b>{w.label}</b> de victoire</span>
        </span>
      </div>
      {league ? (
        league.kickoff ? (
          <KickoffButton at={league.kickoff} onPlay={onPlay} />
        ) : league.sent ? (
          <button className="btn ghost" onClick={onPlay} title={`Équipe validée : le match se joue ${deadlineText(league.deadline)} au plus tard (J pour la modifier)`} aria-keyshortcuts="J"><IconCheck /> Validée<kbd className="hm-key" aria-hidden="true">J</kbd></button>
        ) : (
          <button className="btn" onClick={onPlay} title="Préparer et valider ton équipe (J)" aria-keyshortcuts="J"><IconPlay className="fill" /> Jouer<kbd className="hm-key" aria-hidden="true">J</kbd></button>
        )
      ) : (
        <button className="btn" onClick={onPlay} title="Jouer le match (J)" aria-label="Jouer le match" aria-keyshortcuts="J"><IconPlay className="fill" /> Jouer<kbd className="hm-key" aria-hidden="true">J</kbd></button>
      )}
    </section>
  );
}

// Compte à rebours du coup d'envoi (0.8.6) : tous ont validé, le match part dans m:ss (libellé « Coup d'envoi » au-dessus,
// lisible sur téléphone sans infobulle) ; l'équipe se retouche encore (J).
export function useCountdown(at) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function KickoffButton({ at, onPlay }) {
  const left = useCountdown(at);
  return left > 0 ? (
    <button className="btn ghost hm-kickoff" onClick={onPlay} title="Tout le monde a validé : coup d’envoi à la fin du compte à rebours (J pour retoucher ton équipe)" aria-keyshortcuts="J" aria-label={`Coup d’envoi dans ${mmss(left)}`}>
      <span className="hm-kickoff-label">Coup d’envoi</span>
      <span className="hm-kickoff-row"><IconClock /><span className="hm-kickoff-time">{mmss(left)}</span></span><kbd className="hm-key" aria-hidden="true">J</kbd>
    </button>
  ) : (
    <button className="btn ghost hm-kickoff" disabled title="Le match se joue">
      <span className="hm-kickoff-label">Coup d’envoi</span>
      <span className="hm-kickoff-row"><IconClock /><span className="hm-kickoff-time">…</span></span>
    </button>
  );
}

// Écusson de l'adversaire : celui d'un club d'ami (noir et or, composé par lui), sinon celui tiré du nom.
function MatchCrest({ opp }) {
  return opp.human && opp.crest ? <ClubCrest crest={opp.crest} name={opp.name} className="hm-crest" /> : <Crest name={opp.name} className="hm-crest" />;
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
