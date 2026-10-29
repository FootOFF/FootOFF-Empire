import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DIVISIONS, divisionOf } from '../game/constants';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum, fmtRating, scoreText } from './format';
import { IconClose, IconCoin } from './icons';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { Eyebrow, IconBall, RatingBadge, SectionHead, Stat } from './kit';
import { Trophy, TROPHY_NAMES } from './trophy';
import { STAGES_SHORT, STAGES, leagueLength, nextFixture, ofDiv } from '../game/cups';
import { prizeFor } from '../game/economy';
import { clubAfter } from '../game/names';
import { Portrait } from './portrait';
import { Presence, useDialogFocus, useKeydown, useLeaving } from './presence';
import { uiSound } from './uisound';
import { LANDSCAPE, PHONE, useMedia, useSwipe } from './gestures';
import { SeasonCalendar } from './calendar';
import { ClubRoster } from './roster';
import { SECTIONS, SectionPager, SectionTabs, sectionNear, sectionOf, useNav } from './nav';
import { decSep, t, tn, tr } from '../i18n/index';

// Un panneau ou une fiche qui s'ouvre fait un léger souffle qui monte, qui descend quand il se ferme. D'un onglet à
// l'autre d'une section, le clic de l'onglet suffit : ni souffle d'ouverture, ni souffle de fermeture.
export function usePanelSound() {
  const leaving = useLeaving();
  const quiet = !!useNav()?.switching;
  useEffect(() => { if (!quiet) uiSound(leaving ? 'close' : 'open'); }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Panneau du jeu : un seul modèle pour tous les écrans du menu (en-tête, barre d'outils, corps défilant,
// trésorerie à droite quand on y dépense). id : le panneau, qui le range dans sa section du menu (nav.jsx) : l'en-tête
// porte alors le nom de la section et ses onglets. Glisse depuis la droite sur PC, plein écran sur mobile.
// Téléphone : glisser le panneau vers la gauche ou la droite ouvre la section voisine (nav.jsx SectionPager), sauf
// sous une fiche ouverte et dans les zones qui ont leur propre geste (data-noswipe : la composition).
// PC, grand panneau d'une section : les onglets se rangent entre le titre et la trésorerie quand ils y tiennent, sinon
// sur leur propre ligne sous le titre (tabs-below) ; la trésorerie et le bouton Fermer restent toujours en haut à droite
// (ils passaient sous le titre quand les onglets ne tenaient pas sur la ligne).
function useTabsBelow(ref, on) {
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const head = ref.current;
    if (!on || !head) { setBelow(false); return undefined; }
    const px = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop)) || 0;
    const fit = () => {
      const tabs = head.querySelector('.section-tabs');
      const title = head.querySelector('.panel-title');
      const acts = head.querySelector('.panel-actions');
      if (!tabs || !title || !acts) return;
      const kids = [...tabs.children];
      const need = kids.reduce((w, k) => w + k.getBoundingClientRect().width, 0) + px(tabs, 'column-gap') * Math.max(0, kids.length - 1);
      const room = head.clientWidth - px(head, 'padding-left') - px(head, 'padding-right') - 2 * px(head, 'column-gap')
        - title.getBoundingClientRect().width - acts.getBoundingClientRect().width - px(head, '--s-4') - px(head, '--s-6');
      setBelow(need > room);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(head);
    return () => ro.disconnect();
  }, [ref, on]);
  return below;
}

// className : classe de plus (le Siège de la Ligue ouvert depuis l'écran titre passe au-dessus de lui).
export function Panel({ id = null, title, eyebrow, size = 'md', money = null, toolbar = null, overlay = null, className = '', onClose, onEscape, children }) {
  const ref = useRef(null);
  const headRef = useRef(null);
  const nav = useNav();
  const phone = useMedia(PHONE);
  const landscape = useMedia(LANDSCAPE); // téléphone couché : on passe aussi d'une section à l'autre au doigt
  const section = sectionOf(id);
  const pages = (phone || landscape) && !!nav?.step && !!section;
  const tabsBelow = useTabsBelow(headRef, !!section && size === 'lg' && !phone && !landscape);
  useDialogFocus(ref);
  useKeydown((e) => { if (e.key === 'Escape') (onEscape || onClose)(); });
  useSwipe(ref, {
    onDown: onClose,
    downMedia: PHONE,
    onLeft: pages && sectionNear(section, 1) ? () => nav.step(1) : undefined,
    onRight: pages && sectionNear(section, -1) ? () => nav.step(-1) : undefined,
    sideIf: (t) => !t.closest('.sq-overlay'),
    sideExit: true,
  });
  usePanelSound();
  return (
    <section ref={ref} tabIndex={-1} className={`panel ${size} ${section ? `in-section s-${section}` : ''} ${className}`} role="dialog" aria-label={title}>
      <span className="grip" aria-hidden="true" />
      <header ref={headRef} className={`panel-head ${tabsBelow ? 'tabs-below' : ''}`}>
        <div className="panel-title">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2>{section ? SECTIONS[section].title : title}</h2>
        </div>
        {section && <SectionTabs section={section} />}
        <div className="panel-actions">
          {money !== null && (
            <span className={`panel-money ${money < 0 ? 'neg' : ''}`} data-money-target title={t('Trésorerie')}><IconCoin /><AnimatedMoney value={money} /></span>
          )}
          <button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button>
        </div>
      </header>
      {toolbar && <div className="panel-bar">{toolbar}</div>}
      <div className="panel-body">{children}</div>
      {section && <SectionPager section={section} />}
      {overlay}
    </section>
  );
}

// --- Saison : calendrier, classement, dernier match, palmarès ---------------------------------------------

// Zone d'une place au classement : montée (2 premiers, hors Élite), Coupe d'Europe des clubs (2 premiers de
// l'Élite, qualifiés pour la saison suivante), descente (2 derniers, hors Départementale).
export function zoneOf(divisionIndex, i) {
  const elite = divisionIndex === DIVISIONS.length - 1;
  if (i < 2) return elite ? 'europe' : 'promo';
  if (i >= 6 && divisionIndex > 0) return 'releg';
  return null;
}
const ZONE_TAG = { promo: t('montée'), europe: t('Coupe d’Europe'), releg: t('descente') };
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

// Classement de la division (panneau Saison, et après chaque journée de championnat) : la zone de chaque place en
// liseré à gauche (or : montée, bleu : Europe, rouge : descente ; la légende dessous), notre ligne dorée. Colonnes
// G, N, P quand la saison les a comptés depuis la 1re journée. before : ordre des clubs avant la dernière journée
// (indices) ; chaque club montre alors ce qu'il a gagné ou perdu de places. onClub : ligue entre amis, chaque autre club
// ouvre son effectif (0.8.8).
export function StandingsTable({ state, before = null, onClub = null }) {
  const standings = standingsOf(state);
  const wdl = standings.every((t) => t.w != null && t.w + t.d + t.l === t.played);
  return (
    <table className={`table standings ${before ? 'moves' : ''}`}>
      <thead>
        <tr>
          <th>#</th>{before && <th className="t-move-h" aria-label={t('Évolution')} />}<th>{t('Club')}</th><th>{t('J')}</th>
          {wdl && <><th className="t-wdl" title={t('Gagnés')}>{t('G')}</th><th className="t-wdl" title={t('Nuls')}>{t('N')}</th><th className="t-wdl" title={t('Perdus')}>{t('P')}</th></>}
          <th>{t('Diff')}</th><th>{t('Pts')}</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((row, i) => {
          const zone = state.league ? null : zoneOf(state.divisionIndex, i); // ligue entre amis : ni montée ni descente
          const was = before ? before.indexOf(row.i) : -1;
          const move = was < 0 ? 0 : was - i; // positif : le club remonte
          return (
            <tr key={row.i} className={[row.i === 0 && 'me', zone].filter(Boolean).join(' ')}>
              <td className="t-pos">{i + 1}</td>
              {before && (
                <td className={`t-move ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`} aria-label={move ? tn(Math.abs(move), '{v} {n} place', '{v} {n} places', { v: move > 0 ? t('gagne') : t('perd'), n: Math.abs(move) }, Math.abs(move) > 1) : t('même place')}>
                  {move ? <><i aria-hidden="true" />{Math.abs(move)}</> : '–'}
                </td>
              )}
              <td className="t-club">
                {row.i === 0 ? <ClubCrest crest={state.crest} name={row.name} className="t-crest" /> : <Crest name={row.name} className="t-crest" />}
                {onClub && row.i !== 0
                  ? <button type="button" className="t-name t-open" onClick={() => onClub(row.i)} title={t('Voir l’effectif de {name}', { name: row.name })}>{row.name}</button>
                  : <span className="t-name">{row.name}</span>}
                {zone && <span className="sr-only">{tr(', zone de <0/>', [ZONE_TAG[zone]])}</span>}
              </td>
              <td>{row.played}</td>
              {wdl && <><td className="t-wdl">{row.w}</td><td className="t-wdl">{row.d}</td><td className="t-wdl">{row.l}</td></>}
              <td>{signed(row.gd)}</td>
              <td className="t-pts">{row.pts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Légende des zones (montée, Europe, descente) sous le classement : la couleur du liseré, ce que la place apporte.
export function ZoneLegend({ state }) {
  if (state.league) return null;
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < DIVISIONS.length - 1;
  return (
    <ul className="zone-legend">
      {promo ? (
        <li className="promo">{tr('<0/>Montée en <1/>', [<i aria-hidden="true" />, DIVISIONS[state.divisionIndex + 1].name])}</li>
      ) : (
        <li className="europe">{tr('<0/>Coupe d’Europe des clubs la saison prochaine', [<i aria-hidden="true" />])}</li>
      )}
      {rel && <li className="releg">{tr('<0/>Descente en <1/>', [<i aria-hidden="true" />, DIVISIONS[state.divisionIndex - 1].name])}</li>}
      {promo && <li className="note">{t('La Coupe d’Europe des clubs se joue depuis l’Élite : ses deux premiers s’y qualifient.')}</li>}
    </ul>
  );
}

// tab : l'onglet (calendrier ou classement), piloté par les onglets de la section Saison (nav.jsx).
// sheet : la fiche joueur posée par-dessus (App) ; sheetOpen : elle a la main sur Échap
export function SeasonPanel({ state, onClose, tab = 'calendar', initialSel = null, onOpenMatch, onPlay, onPlayerSheet, sheet = null, sheetOpen = false }) {
  const standings = standingsOf(state);
  const [roster, setRoster] = useState(null); // ligue entre amis : club dont l'effectif est ouvert (index du classement)
  const div = divisionOf(state);
  const lm = state.lastMatch;
  const lmPens = !!lm?.pens; // coupe : égalité tranchée aux tirs au but
  const lmWon = lm && (lm.gf > lm.ga || (lmPens && lm.pens[0] > lm.pens[1]));
  const rel = !state.league && state.divisionIndex > 0;
  const promo = !state.league && state.divisionIndex < 3;
  const pos = standings.findIndex((t) => t.i === 0) + 1;
  const me = standings[pos - 1];
  let goal;
  // écart avec le 2e : « 2 pts de la montée », ou l'égalité de points (départagés à la différence de buts)
  const behind = (what) => {
    const n = standings[1].pts - me.pts;
    return n > 0 ? tn(n, '{n} pt {what}', '{n} pts {what}', { n, what }, n > 1) : t('À égalité de points avec le 2e');
  };
  if (promo && pos > 2) goal = behind(t('de la montée'));
  else if (promo) goal = t('En zone de montée');
  else if (state.league) goal = tn(pos, 'En tête de la ligue', '{v} pt{v2} du premier', { v: standings[0].pts - me.pts, v2: standings[0].pts - me.pts > 1 ? 's' : '' }, !(pos === 1));
  else goal = pos === 1 ? t('En tête de l’Élite') : pos === 2 ? t('Place européenne') : behind(t('de l’Europe'));
  if (rel && pos >= 7) goal = t('En zone de descente');
  const motm = lm?.players?.length ? [...lm.players].sort((a, b) => b.rating - a.rating)[0] : null;

  return (
    <Panel
      id="season"
      size="lg"
      title={t('Saison {seasonNumber} · {name}', { seasonNumber: state.seasonNumber, name: div.name })}
      eyebrow={t('{name} · Saison {seasonNumber} · {v}', { name: div.name, seasonNumber: state.seasonNumber, v: state.round ? t('journée {min} / {leagueLength}', { min: Math.min(state.round, leagueLength(state)), leagueLength: leagueLength(state) }) : t('avant la 1re journée') })}
      onClose={onClose}
      onEscape={sheetOpen || roster !== null ? () => {} : undefined}
      overlay={(
        <>
          <Presence>{roster !== null && state.league && <ClubRoster state={state} index={roster} blocked={sheetOpen} onClose={() => setRoster(null)} onPlayer={onPlayerSheet} />}</Presence>
          {sheet}
        </>
      )}
      toolbar={(
        <>
          <div className="season-stats">
          <Stat label={t('Position')} value={ordinal(pos)} sub={t('sur 8')} tone={pos <= 2 ? 'up' : rel && pos >= 7 ? 'down' : ''} />
          <Stat label={t('Points')} value={me.pts} sub={tn(me.played, '{n} match', '{n} matchs', { n: me.played }, me.played > 1)} />
          <Stat label={t('Diff.')} value={signed(me.gd)} />
          {/* « Ambition » : la place visée au classement (l'« objectif de saison » du HUD est celui des primes de palier) */}
          <Stat label={t('Ambition')} value={state.league ? t('Titre') : promo ? t('Top 2') : t('Europe')} sub={goal} />
          </div>
        </>
      )}
    >
      {tab === 'calendar' && <SeasonCalendar state={state} initialSel={initialSel} onOpenMatch={onOpenMatch} onPlay={onPlay} />}
      {tab === 'table' && (
        <div className="season-cols">
          <section className="season-plate season-table" aria-label={t('Classement {ofDiv}', { ofDiv: ofDiv(div.name) })}>
            <SectionHead label={t('Classement · {name}', { name: div.name })} aside={me.played ? tn(me.played, 'après {played} journée sur {leagueLength}', 'après {played} journées sur {leagueLength}', { played: me.played, leagueLength: leagueLength(state) }, me.played > 1) : t('avant la 1re journée')} />
            <StandingsTable state={state} onClub={state.league ? setRoster : null} />
            <ZoneLegend state={state} />
          </section>

          <div className="season-col">
            <RaceCard state={state} standings={standings} pos={pos} />
            <CupRuns state={state} />
            <Leaders state={state} onPlayer={onPlayerSheet} />

            {lm && (
              <section className="season-plate">
                <SectionHead label={t('Dernier match · {v}', { v: lm.comp && lm.comp !== 'league' ? `${lm.comp === 'c1' ? t('Europe') : t('Coupe')} · ${STAGES_SHORT[lm.stage].toLowerCase()}` : t('journée {round}', { round: lm.round }) })} aside={lmPens ? t('{v} aux t.a.b. {v2}–{v3}', { v: lmWon ? t('Qualifié') : t('Éliminé'), v2: lm.pens[0], v3: lm.pens[1] }) : lm.gf > lm.ga ? t('Victoire') : lm.gf < lm.ga ? t('Défaite') : t('Match nul')} />
                <div className="last-match">
                  <div className="lm-score">
                    <span className="lm-team">{lm.away ? lm.oppName : state.clubName}</span>
                    <b className={lmWon ? 'win' : lm.gf < lm.ga || lmPens ? 'loss' : ''}>{scoreText(lm, ' – ')}</b>
                    <span className="lm-team away">{lm.away ? state.clubName : lm.oppName}</span>
                  </div>
                  {lm.scorers?.length > 0 && (
                    <p className="lm-scorers"><IconBall /> {lm.scorers.map((x) => `${x.name} ${x.minute}′`).join(' · ')}</p>
                  )}
                  <div className="lm-facts">
                    {motm && <span className="lm-motm">{tr('<0/> <1/>, homme du match', [<RatingBadge value={motm.rating} />, motm.name])}</span>}
                    <span>{lm.away ? t('À l’extérieur · droits TV {revenue}', { revenue: fmtMoney(lm.revenue) }) : t('{attendance} spectateurs · {revenue}', { attendance: fmtNum(lm.attendance), revenue: fmtMoney(lm.revenue) })}</span>
                  </div>
                </div>
              </section>
            )}

            <section className="season-plate"><TrophyCase trophies={state.trophies || []} /></section>

            {state.history.length > 0 && (
              <section className="season-plate">
                <SectionHead label={t('Classements')} />
                <ul className="honours">
                  {state.history.slice().reverse().map((h) => (
                    <li key={h.season}><span>{tr('Saison <0/>', [h.season])}</span><em>{h.division}</em><b>{ordinal(h.position)}</b></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

const pts = (n) => tn(n, '{n} point', '{n} points', { n }, n > 1);
const days = (n) => tn(n, '{n} journée', '{n} journées', { n }, n > 1);

// Course de la saison : la place visée (montée, Europe, maintien), où en est le club, l'écart avec le club à
// rattraper (ou à tenir derrière), les journées qui restent et la prime de classement de la place actuelle.
function RaceCard({ state, standings, pos }) {
  const d = state.divisionIndex;
  const elite = d === DIVISIONS.length - 1;
  const lg = !!state.league; // ligue entre amis : la course au titre
  const me = standings[pos - 1];
  const left = Math.max(0, leagueLength(state) - me.played);
  const danger = !lg && d > 0 && pos >= 7;
  const target = danger ? 6 : lg ? 1 : 2; // place à atteindre (6e : maintien) ou à garder (2e ; 1re en ligue)
  const title = lg ? t('Être champion') : danger ? t('Sauver sa place') : elite ? t('Jouer l’Europe') : t('Monter en fin de saison');
  const aim = lg ? t('Le premier est champion {ofDiv} et entre à son palmarès.', { ofDiv: ofDiv(state.league.name) }) : danger
    ? t('Les deux derniers descendent en {name}.', { name: DIVISIONS[d - 1].name })
    : elite ? t('Les deux premiers jouent la Coupe d’Europe des clubs la saison prochaine.') : t('Les deux premiers montent en {name}.', { name: DIVISIONS[d + 1].name });
  let where;
  if (pos <= target && !danger) {
    const chaser = standings[target]; // le premier club hors de la zone
    const n = me.pts - chaser.pts;
    where = n > 0
      ? <>{tr('Tu es <0/>, <1/> devant <2/>, <3/>.', [<b>{ordinal(pos)}</b>, <b>{pts(n)}</b>, clubAfter('', chaser.name), ordinal(target + 1)])}</>
      : <>{tr('Tu es <0/>, à égalité de points <1/>, <2/> : la différence de buts vous départage.', [<b>{ordinal(pos)}</b>, clubAfter('avec ', chaser.name), ordinal(target + 1)])}</>;
  } else {
    const ahead = standings[target - 1]; // le dernier club dans la zone visée
    const n = ahead.pts - me.pts;
    where = n > 0
      ? <>{tr('Tu es <0/>, à <1/> <2/>, <3/>.', [<b>{ordinal(pos)}</b>, <b>{pts(n)}</b>, clubAfter('de ', ahead.name), ordinal(target)])}</>
      : <>{tr('Tu es <0/>, à égalité de points <1/>, <2/> : la différence de buts vous départage.', [<b>{ordinal(pos)}</b>, clubAfter('avec ', ahead.name), ordinal(target)])}</>;
  }
  return (
    <section className={`season-plate sc-race ${danger ? 'danger' : pos <= 2 ? 'in' : ''}`} aria-label={t('Course de la saison')}>
      <SectionHead label={lg ? t('Course au titre') : danger ? t('Maintien') : elite ? t('Course à l’Europe') : t('Course à la montée')} />
      <h3>{title}</h3>
      <p>{aim} {lg && pos === 1 && standings[1] ? <>{tr('Tu es <0/>, <1/> devant <2/>.', [<b>{t('1er')}</b>, pts(Math.max(0, me.pts - standings[1].pts)), clubAfter('', standings[1].name)])}</> : where} {left ? t('Il reste {days}.', { days: days(left) }) : t('Le championnat est terminé.')}</p>
      <p className="sc-race-prize">{tr('Prime de classement à ta place : <0/>', [<b>{fmtMoney(prizeFor(pos, d))}</b>])}</p>
    </section>
  );
}

// Les meilleurs du club cette saison : meilleure note moyenne (3 matchs au moins), meilleur buteur, et le gardien ou
// défenseur aux matchs sans encaisser. Un nom ouvre la fiche du joueur.
function Leaders({ state, onPlayer }) {
  const rows = state.players.map((p) => {
    const st = p.season || {};
    return { p, apps: st.apps || 0, goals: st.goals || 0, motm: st.motm || 0, clean: st.clean || 0, avg: st.apps ? st.sum / st.apps : 0 };
  });
  const top = (score) => rows.reduce((b, r) => (score(r) > 0 && (!b || score(r) > score(b)) ? r : b), null);
  const rated = top((r) => (r.apps >= 3 ? r.avg : 0));
  const scorer = top((r) => r.goals);
  const wall = top((r) => (r.p.pos === 'G' || r.p.pos === 'D' ? r.clean : 0));
  const items = [
    rated && { r: rated, label: t('Meilleure note{v}', { v: rated.motm ? t(' · {motm} fois homme du match', { motm: rated.motm }) : '' }), value: fmtRating(rated.avg) },
    scorer && { r: scorer, label: t('Meilleur buteur'), value: scorer.goals },
    wall && { r: wall, label: t('Matchs sans encaisser'), value: wall.clean },
  ].filter(Boolean);
  const games = Math.max(0, ...rows.map((r) => r.apps));
  return (
    <section className="season-plate" aria-label={t('Les meilleurs du club')}>
      <SectionHead label={t('Les meilleurs du club')} aside={t('Saison {seasonNumber}', { seasonNumber: state.seasonNumber })} />
      {items.length === 0 ? (
        <p className="tc-empty">{games ? t('Encore trop tôt : la note moyenne se compte sur 3 matchs.') : t('Les premiers matchs désigneront les meilleurs du club.')}</p>
      ) : (
        <ul className="sc-leaders">
          {items.map(({ r, label, value }) => (
            <li key={label}>
              <button type="button" onClick={() => onPlayer?.(r.p.id)} disabled={!onPlayer}>
                <Portrait p={r.p} size={40} />
                <span><b>{r.p.name}</b><small>{label}</small></span>
                <em>{value}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Parcours en coupes de la saison : chaque tour joué (score, tirs au but), puis le prochain adversaire.
function CupRuns({ state }) {
  const cups = state.cups;
  if (!cups) return null;
  const next = nextFixture(state);
  return ['cup', 'c1'].filter((k) => cups[k]).map((k) => {
    const c = cups[k];
    const status = c.won ? t('Vainqueur') : c.alive ? t('En course · {toLowerCase}', { toLowerCase: STAGES[c.stage].toLowerCase() }) : t('Éliminé');
    const lost = c.results.find((x) => !x.won);
    return (
      <section key={k} className={`season-plate sc-cupcard ${k}`}>
        <SectionHead label={k === 'c1' ? t('Coupe d’Europe des clubs') : t('Coupe nationale')} aside={status} />
        <ol className="cup-run">
          {STAGES.map((st, i) => {
            const r = c.results.find((x) => x.stage === i);
            const upcoming = c.alive && c.stage === i;
            if (!r && !c.alive) return null; // tours que le club ne jouera pas
            return (
              <li key={st} className={r ? (r.won ? 'won' : 'lost') : upcoming ? 'next' : 'later'}>
                <span className="cr-stage">{STAGES_SHORT[i]}</span>
                {r ? (
                  <>
                    <span className="cr-opp">{r.opp}</span>
                    <b>{r.gf}–{r.ga}{r.pens ? t(' · t.a.b. {a}–{b}', { a: r.pens[0], b: r.pens[1] }) : ''}</b>
                  </>
                ) : upcoming ? (
                  <>
                    <span className="cr-opp">{c.opp.name}<em>{c.opp.budget ? t('Europe · budget {budget}', { budget: fmtMoney(c.opp.budget) }) : c.opp.division}{next?.comp === k ? t(' · prochain match') : ''}</em></span>
                    <b>{tr('niv. <0/>', [String(c.opp.strength).replace('.', decSep())])}</b>
                  </>
                ) : <span className="cr-opp muted">—</span>}
              </li>
            );
          })}
        </ol>
        {lost && (
          <p className="cr-out">
            {lost.stage === 3 ? tr('Finaliste : battu en finale <0/>.', [clubAfter('par ', lost.opp)]) : tr('Éliminé en <0/> <1/> : rendez-vous la saison prochaine.', [STAGES[lost.stage].toLowerCase(), clubAfter('par ', lost.opp)])}
          </p>
        )}
      </section>
    );
  });
}

// Vitrine des trophées : chaque titre, avec sa saison et sa division.
export function TrophyCase({ trophies }) {
  const counts = ['league', 'cup', 'c1'].map((k) => [k, trophies.filter((t) => t.comp === k).length]);
  return (
    <>
      <SectionHead label={t('Vitrine des trophées')} aside={tn(trophies.length, '{n} titre', '{n} titres', { n: trophies.length }, trophies.length > 1)} />
      {trophies.length === 0 ? (
        <p className="tc-empty">{t('Pas encore de trophée : sois champion, ou va au bout de la Coupe nationale.')}</p>
      ) : (
        <>
          <div className="tc-counts">
            {counts.map(([k, n]) => (
              <div key={k} className={n ? 'on' : ''}><Trophy comp={k} /><b>{n}</b><span>{TROPHY_NAMES[k]}</span></div>
            ))}
          </div>
          <ul className="tc-list">
            {[...trophies].reverse().map((row, i) => (
              <li key={i}><Trophy comp={row.comp} /><span>{row.comp === 'league' ? t('Champion {ofDiv}', { ofDiv: ofDiv(row.division) }) : row.comp === 'cup' ? t('Coupe nationale') : t('Coupe d’Europe des clubs')}</span><em>{tr('Saison <0/>', [row.season])}</em></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// --- Journal façon FootOFF Media : à la une, rubriques, titres ----------------------------------------------

const KINDS = { match: t('Match'), mercato: t('Mercato'), infra: t('Bâtiments'), saison: t('Saison'), objectif: t('Objectif'), club: t('Club'), academie: t('Académie'), entrainement: t('Entraînement') };
const FILTERS = [['all', t('Tout')], ['match', t('Matchs')], ['mercato', t('Mercato')], ['infra', t('Bâtiments')], ['club', t('Club')]];

// Les anciennes entrées n'ont qu'un texte : on en tire un titre et une rubrique.
function article(e) {
  if (e.title) return { ...e, kind: e.kind || 'club', body: e.text };
  const t = e.text || '';
  let kind = 'club';
  if (e.round) kind = 'match';
  else if (/signe au club|est vendu|quitte le club/.test(t)) kind = 'mercato';
  else if (/construction|amélioré/i.test(t)) kind = 'infra';
  else if (/^Saison \d+ terminée/.test(t)) kind = 'saison';
  else if (/^Objectif/.test(t)) kind = 'objectif';
  const colon = t.indexOf(' : ');
  if (colon > 0 && colon < 60) return { ...e, kind, title: t.slice(0, colon), body: t.slice(colon + 3) };
  const dot = t.search(/[.!?](\s|$)/);
  if (dot > 0 && dot < t.length - 2) return { ...e, kind, title: t.slice(0, dot + 1).replace(/\.$/, ''), body: t.slice(dot + 1).trim() };
  return { ...e, kind, title: t.replace(/\.$/, ''), body: '' };
}

const dateOf = (e) => (e.round ? t('Saison {season} · journée {round}', { season: e.season, round: e.round }) : t('Saison {season}', { season: e.season }));

// Le journal garde l'histoire du club (jusqu'à 600 entrées, src/game/journal.js) : la rubrique en barre d'outils, et une
// rangée de saisons (la saison en cours d'abord, « Tout » pour l'histoire entière) au-dessus des articles.
export function JournalPanel({ state, onClose }) {
  const [filter, setFilter] = useState('all');
  const [season, setSeason] = useState(state.seasonNumber);
  const all = state.journal.map(article);
  const seasons = [...new Set(all.map((a) => a.season).filter((x) => x != null))].sort((a, b) => b - a);
  const inSeason = season === 'all' ? all : all.filter((a) => a.season === season);
  const list = filter === 'all' ? inSeason
    : filter === 'club' ? inSeason.filter((a) => ['club', 'saison', 'objectif', 'academie', 'entrainement'].includes(a.kind))
      : inSeason.filter((a) => a.kind === filter);
  const [lead, ...rest] = list;
  return (
    <Panel
      id="journal"
      title={t('Le journal du club')}
      eyebrow={t('FootOFF Media · {v}', { v: season === 'all' ? tn(seasons.length, '{length} saison d’histoire', '{length} saisons d’histoire', { length: seasons.length }, seasons.length > 1) : t('Saison {season}', { season }) })}
      onClose={onClose}
      toolbar={(
        <div className="chips journal-filters">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      )}
    >
      {seasons.length > 1 && (
        <div className="chips journal-seasons" role="tablist" aria-label={t('Saison')}>
          <button role="tab" aria-selected={season === 'all'} className={season === 'all' ? 'active' : ''} onClick={() => setSeason('all')}>{t('Tout')}</button>
          {seasons.map((n) => (
            <button key={n} role="tab" aria-selected={season === n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>{t('S')}{n}</button>
          ))}
        </div>
      )}
      {!lead && <p className="muted">{state.journal.length ? t('Rien dans cette rubrique pour cette saison.') : t('L’histoire commence au premier coup de sifflet.')}</p>}
      {lead && (
        <article className={`news-lead k-${lead.kind}`}>
          <span className="news-kicker"><b>{t('À la une')}</b> · {KINDS[lead.kind]} · {dateOf(lead)}</span>
          <h3>{lead.title}</h3>
          {lead.body && <p>{lead.body}</p>}
        </article>
      )}
      <ol className="news-list">
        {rest.map((a, i) => (
          <li key={i} className={`news k-${a.kind}`}>
            <span className="news-kicker"><b>{KINDS[a.kind]}</b> · {dateOf(a)}</span>
            <h4>{a.title}</h4>
            {a.body && <p>{a.body}</p>}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

