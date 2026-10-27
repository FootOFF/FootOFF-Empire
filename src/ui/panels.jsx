import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum, fmtRating } from './format';
import { IconClose, IconCoin } from './icons';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { Eyebrow, IconBall, RatingBadge, SectionHead, Stat } from './kit';
import { Trophy, TROPHY_NAMES } from './trophy';
import { STAGES_SHORT, STAGES, leagueLength, nextFixture, ofDiv } from '../game/cups';
import { prizeFor } from '../game/economy';
import { clubAfter } from '../game/names';
import { Portrait } from './portrait';
import { useDialogFocus, useKeydown, useLeaving } from './presence';
import { uiSound } from './uisound';
import { PHONE, useMedia, useSwipe } from './gestures';
import { SeasonCalendar } from './calendar';
import { SECTIONS, SectionPager, SectionTabs, sectionNear, sectionOf, useNav } from './nav';

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

export function Panel({ id = null, title, eyebrow, size = 'md', money = null, toolbar = null, overlay = null, onClose, onEscape, children }) {
  const ref = useRef(null);
  const headRef = useRef(null);
  const nav = useNav();
  const phone = useMedia(PHONE);
  const section = sectionOf(id);
  const pages = phone && !!nav?.step && !!section;
  const tabsBelow = useTabsBelow(headRef, !!section && size === 'lg' && !phone);
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
    <section ref={ref} tabIndex={-1} className={`panel ${size} ${section ? `in-section s-${section}` : ''}`} role="dialog" aria-label={title}>
      <span className="grip" aria-hidden="true" />
      <header ref={headRef} className={`panel-head ${tabsBelow ? 'tabs-below' : ''}`}>
        <div className="panel-title">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2>{section ? SECTIONS[section].title : title}</h2>
        </div>
        {section && <SectionTabs section={section} />}
        <div className="panel-actions">
          {money !== null && (
            <span className={`panel-money ${money < 0 ? 'neg' : ''}`} data-money-target title="Trésorerie"><IconCoin /><AnimatedMoney value={money} /></span>
          )}
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
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

// Zone d'une place au classement : montée (2 premiers, hors Elite), Coupe d'Europe des clubs (2 premiers de
// l'Elite, qualifiés pour la saison suivante), descente (2 derniers, hors Départementale).
export function zoneOf(divisionIndex, i) {
  const elite = divisionIndex === DIVISIONS.length - 1;
  if (i < 2) return elite ? 'europe' : 'promo';
  if (i >= 6 && divisionIndex > 0) return 'releg';
  return null;
}
const ZONE_TAG = { promo: 'montée', europe: 'Coupe d’Europe', releg: 'descente' };
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

// Classement de la division (panneau Saison, et après chaque journée de championnat) : la zone de chaque place en
// liseré à gauche (or : montée, bleu : Europe, rouge : descente ; la légende dessous), notre ligne dorée. Colonnes
// G, N, P quand la saison les a comptés depuis la 1re journée. before : ordre des clubs avant la dernière journée
// (indices) ; chaque club montre alors ce qu'il a gagné ou perdu de places.
export function StandingsTable({ state, before = null }) {
  const standings = standingsOf(state);
  const wdl = standings.every((t) => t.w != null && t.w + t.d + t.l === t.played);
  return (
    <table className={`table standings ${before ? 'moves' : ''}`}>
      <thead>
        <tr>
          <th>#</th>{before && <th className="t-move-h" aria-label="Évolution" />}<th>Club</th><th>J</th>
          {wdl && <><th className="t-wdl" title="Gagnés">G</th><th className="t-wdl" title="Nuls">N</th><th className="t-wdl" title="Perdus">P</th></>}
          <th>Diff</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((t, i) => {
          const zone = zoneOf(state.divisionIndex, i);
          const was = before ? before.indexOf(t.i) : -1;
          const move = was < 0 ? 0 : was - i; // positif : le club remonte
          return (
            <tr key={t.i} className={[t.i === 0 && 'me', zone].filter(Boolean).join(' ')}>
              <td className="t-pos">{i + 1}</td>
              {before && (
                <td className={`t-move ${move > 0 ? 'up' : move < 0 ? 'down' : ''}`} aria-label={move ? `${move > 0 ? 'gagne' : 'perd'} ${Math.abs(move)} place${Math.abs(move) > 1 ? 's' : ''}` : 'même place'}>
                  {move ? <><i aria-hidden="true" />{Math.abs(move)}</> : '–'}
                </td>
              )}
              <td className="t-club">
                {t.i === 0 ? <ClubCrest crest={state.crest} name={t.name} className="t-crest" /> : <Crest name={t.name} className="t-crest" />}
                <span className="t-name">{t.name}</span>{zone && <span className="sr-only">, zone de {ZONE_TAG[zone]}</span>}
              </td>
              <td>{t.played}</td>
              {wdl && <><td className="t-wdl">{t.w}</td><td className="t-wdl">{t.d}</td><td className="t-wdl">{t.l}</td></>}
              <td>{signed(t.gd)}</td>
              <td className="t-pts">{t.pts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Légende des zones (montée, Europe, descente) sous le classement : la couleur du liseré, ce que la place apporte.
export function ZoneLegend({ state }) {
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < DIVISIONS.length - 1;
  return (
    <ul className="zone-legend">
      {promo ? (
        <li className="promo"><i aria-hidden="true" />Montée en {DIVISIONS[state.divisionIndex + 1].name}</li>
      ) : (
        <li className="europe"><i aria-hidden="true" />Coupe d’Europe des clubs la saison prochaine</li>
      )}
      {rel && <li className="releg"><i aria-hidden="true" />Descente en {DIVISIONS[state.divisionIndex - 1].name}</li>}
      {promo && <li className="note">La Coupe d’Europe des clubs se joue depuis l’Elite : ses deux premiers s’y qualifient.</li>}
    </ul>
  );
}

// tab : l'onglet (calendrier ou classement), piloté par les onglets de la section Saison (nav.jsx).
// sheet : la fiche joueur posée par-dessus (App) ; sheetOpen : elle a la main sur Échap
export function SeasonPanel({ state, onClose, tab = 'calendar', initialSel = null, onOpenMatch, onPlay, onPlayerSheet, sheet = null, sheetOpen = false }) {
  const standings = standingsOf(state);
  const div = DIVISIONS[state.divisionIndex];
  const lm = state.lastMatch;
  const lmPens = !!lm?.pens; // coupe : égalité tranchée aux tirs au but
  const lmWon = lm && (lm.gf > lm.ga || (lmPens && lm.pens[0] > lm.pens[1]));
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < 3;
  const pos = standings.findIndex((t) => t.i === 0) + 1;
  const me = standings[pos - 1];
  let goal;
  // écart avec le 2e : « 2 pts de la montée », ou l'égalité de points (départagés à la différence de buts)
  const behind = (what) => {
    const n = standings[1].pts - me.pts;
    return n > 0 ? `${n} pt${n > 1 ? 's' : ''} ${what}` : 'À égalité de points avec le 2e';
  };
  if (promo && pos > 2) goal = behind('de la montée');
  else if (promo) goal = 'En zone de montée';
  else goal = pos === 1 ? 'En tête de l’Elite' : pos === 2 ? 'Place européenne' : behind('de l’Europe');
  if (rel && pos >= 7) goal = 'En zone de descente';
  const motm = lm?.players?.length ? [...lm.players].sort((a, b) => b.rating - a.rating)[0] : null;

  return (
    <Panel
      id="season"
      size="lg"
      title={`Saison ${state.seasonNumber} · ${div.name}`}
      eyebrow={`${div.name} · Saison ${state.seasonNumber} · ${state.round ? `journée ${Math.min(state.round, leagueLength(state))} / ${leagueLength(state)}` : 'avant la 1re journée'}`}
      onClose={onClose}
      onEscape={sheetOpen ? () => {} : undefined}
      overlay={sheet}
      toolbar={(
        <>
          <div className="season-stats">
          <Stat label="Position" value={ordinal(pos)} sub="sur 8" tone={pos <= 2 ? 'up' : rel && pos >= 7 ? 'down' : ''} />
          <Stat label="Points" value={me.pts} sub={`${me.played} match${me.played > 1 ? 's' : ''}`} />
          <Stat label="Diff." value={signed(me.gd)} />
          {/* « Ambition » : la place visée au classement (l'« objectif de saison » du HUD est celui des primes de palier) */}
          <Stat label="Ambition" value={promo ? 'Top 2' : 'Europe'} sub={goal} />
          </div>
        </>
      )}
    >
      {tab === 'calendar' && <SeasonCalendar state={state} initialSel={initialSel} onOpenMatch={onOpenMatch} onPlay={onPlay} />}
      {tab === 'table' && (
        <div className="season-cols">
          <section className="season-plate season-table" aria-label={`Classement de ${div.name}`}>
            <SectionHead label={`Classement · ${div.name}`} aside={me.played ? `après ${me.played} journée${me.played > 1 ? 's' : ''} sur 7` : 'avant la 1re journée'} />
            <StandingsTable state={state} />
            <ZoneLegend state={state} />
          </section>

          <div className="season-col">
            <RaceCard state={state} standings={standings} pos={pos} />
            <CupRuns state={state} />
            <Leaders state={state} onPlayer={onPlayerSheet} />

            {lm && (
              <section className="season-plate">
                <SectionHead label={`Dernier match · ${lm.comp && lm.comp !== 'league' ? `${lm.comp === 'c1' ? 'Europe' : 'Coupe'} · ${STAGES_SHORT[lm.stage].toLowerCase()}` : `journée ${lm.round}`}`} aside={lmPens ? `${lmWon ? 'Qualifié' : 'Éliminé'} aux t.a.b. ${lm.pens[0]}–${lm.pens[1]}` : lm.gf > lm.ga ? 'Victoire' : lm.gf < lm.ga ? 'Défaite' : 'Match nul'} />
                <div className="last-match">
                  <div className="lm-score">
                    <span className="lm-team">{state.clubName}</span>
                    <b className={lmWon ? 'win' : lm.gf < lm.ga || lmPens ? 'loss' : ''}>{lm.gf} – {lm.ga}</b>
                    <span className="lm-team away">{lm.oppName}</span>
                  </div>
                  {lm.scorers?.length > 0 && (
                    <p className="lm-scorers"><IconBall /> {lm.scorers.map((x) => `${x.name} ${x.minute}′`).join(' · ')}</p>
                  )}
                  <div className="lm-facts">
                    {motm && <span className="lm-motm"><RatingBadge value={motm.rating} /> {motm.name}, homme du match</span>}
                    <span>{fmtNum(lm.attendance)} spectateurs · {fmtMoney(lm.revenue)}</span>
                  </div>
                </div>
              </section>
            )}

            <section className="season-plate"><TrophyCase trophies={state.trophies || []} /></section>

            {state.history.length > 0 && (
              <section className="season-plate">
                <SectionHead label="Classements" />
                <ul className="honours">
                  {state.history.slice().reverse().map((h) => (
                    <li key={h.season}><span>Saison {h.season}</span><em>{h.division}</em><b>{ordinal(h.position)}</b></li>
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

const pts = (n) => `${n} point${n > 1 ? 's' : ''}`;
const days = (n) => `${n} journée${n > 1 ? 's' : ''}`;

// Course de la saison : la place visée (montée, Europe, maintien), où en est le club, l'écart avec le club à
// rattraper (ou à tenir derrière), les journées qui restent et la prime de classement de la place actuelle.
function RaceCard({ state, standings, pos }) {
  const d = state.divisionIndex;
  const elite = d === DIVISIONS.length - 1;
  const me = standings[pos - 1];
  const left = Math.max(0, leagueLength(state) - me.played);
  const danger = d > 0 && pos >= 7;
  const target = danger ? 6 : 2; // place à atteindre (6e : maintien) ou à garder (2e)
  const title = danger ? 'Sauver sa place' : elite ? 'Jouer l’Europe' : 'Monter en fin de saison';
  const aim = danger
    ? `Les deux derniers descendent en ${DIVISIONS[d - 1].name}.`
    : elite ? 'Les deux premiers jouent la Coupe d’Europe des clubs la saison prochaine.' : `Les deux premiers montent en ${DIVISIONS[d + 1].name}.`;
  let where;
  if (pos <= target && !danger) {
    const chaser = standings[target]; // le premier club hors de la zone
    const n = me.pts - chaser.pts;
    where = n > 0
      ? <>Tu es <b>{ordinal(pos)}</b>, <b>{pts(n)}</b> devant {clubAfter('', chaser.name)}, {ordinal(target + 1)}.</>
      : <>Tu es <b>{ordinal(pos)}</b>, à égalité de points {clubAfter('avec ', chaser.name)}, {ordinal(target + 1)} : la différence de buts vous départage.</>;
  } else {
    const ahead = standings[target - 1]; // le dernier club dans la zone visée
    const n = ahead.pts - me.pts;
    where = n > 0
      ? <>Tu es <b>{ordinal(pos)}</b>, à <b>{pts(n)}</b> {clubAfter('de ', ahead.name)}, {ordinal(target)}.</>
      : <>Tu es <b>{ordinal(pos)}</b>, à égalité de points {clubAfter('avec ', ahead.name)}, {ordinal(target)} : la différence de buts vous départage.</>;
  }
  return (
    <section className={`season-plate sc-race ${danger ? 'danger' : pos <= 2 ? 'in' : ''}`} aria-label="Course de la saison">
      <SectionHead label={danger ? 'Maintien' : elite ? 'Course à l’Europe' : 'Course à la montée'} />
      <h3>{title}</h3>
      <p>{aim} {where} {left ? `Il reste ${days(left)}.` : 'Le championnat est terminé.'}</p>
      <p className="sc-race-prize">Prime de classement à ta place : <b>{fmtMoney(prizeFor(pos, d))}</b></p>
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
    rated && { r: rated, label: `Meilleure note${rated.motm ? ` · ${rated.motm} fois homme du match` : ''}`, value: fmtRating(rated.avg) },
    scorer && { r: scorer, label: 'Meilleur buteur', value: scorer.goals },
    wall && { r: wall, label: 'Matchs sans encaisser', value: wall.clean },
  ].filter(Boolean);
  const games = Math.max(0, ...rows.map((r) => r.apps));
  return (
    <section className="season-plate" aria-label="Les meilleurs du club">
      <SectionHead label="Les meilleurs du club" aside={`Saison ${state.seasonNumber}`} />
      {items.length === 0 ? (
        <p className="tc-empty">{games ? 'Encore trop tôt : la note moyenne se compte sur 3 matchs.' : 'Les premiers matchs désigneront les meilleurs du club.'}</p>
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
    const status = c.won ? 'Vainqueur' : c.alive ? `En course · ${STAGES[c.stage].toLowerCase()}` : 'Éliminé';
    const lost = c.results.find((x) => !x.won);
    return (
      <section key={k} className={`season-plate sc-cupcard ${k}`}>
        <SectionHead label={k === 'c1' ? 'Coupe d’Europe des clubs' : 'Coupe nationale'} aside={status} />
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
                    <b>{r.gf}–{r.ga}{r.pens ? ` · t.a.b. ${r.pens[0]}–${r.pens[1]}` : ''}</b>
                  </>
                ) : upcoming ? (
                  <>
                    <span className="cr-opp">{c.opp.name}<em>{c.opp.budget ? `Europe · budget ${fmtMoney(c.opp.budget)}` : c.opp.division}{next?.comp === k ? ' · prochain match' : ''}</em></span>
                    <b>niv. {String(c.opp.strength).replace('.', ',')}</b>
                  </>
                ) : <span className="cr-opp muted">—</span>}
              </li>
            );
          })}
        </ol>
        {lost && (
          <p className="cr-out">
            {lost.stage === 3 ? <>Finaliste : battu en finale {clubAfter('par ', lost.opp)}.</> : <>Éliminé en {STAGES[lost.stage].toLowerCase()} {clubAfter('par ', lost.opp)} : rendez-vous la saison prochaine.</>}
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
      <SectionHead label="Vitrine des trophées" aside={`${trophies.length} titre${trophies.length > 1 ? 's' : ''}`} />
      {trophies.length === 0 ? (
        <p className="tc-empty">Pas encore de trophée : sois champion, ou va au bout de la Coupe nationale.</p>
      ) : (
        <>
          <div className="tc-counts">
            {counts.map(([k, n]) => (
              <div key={k} className={n ? 'on' : ''}><Trophy comp={k} /><b>{n}</b><span>{TROPHY_NAMES[k]}</span></div>
            ))}
          </div>
          <ul className="tc-list">
            {[...trophies].reverse().map((t, i) => (
              <li key={i}><Trophy comp={t.comp} /><span>{t.comp === 'league' ? `Champion ${ofDiv(t.division)}` : t.comp === 'cup' ? 'Coupe nationale' : 'Coupe d’Europe des clubs'}</span><em>Saison {t.season}</em></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// --- Journal façon FootOFF Media : à la une, rubriques, titres ----------------------------------------------

const KINDS = { match: 'Match', mercato: 'Mercato', infra: 'Bâtiments', saison: 'Saison', objectif: 'Objectif', club: 'Club', academie: 'Académie', entrainement: 'Entraînement' };
const FILTERS = [['all', 'Tout'], ['match', 'Matchs'], ['mercato', 'Mercato'], ['infra', 'Bâtiments'], ['club', 'Club']];

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

const dateOf = (e) => (e.round ? `Saison ${e.season} · journée ${e.round}` : `Saison ${e.season}`);

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
      title="Le journal du club"
      eyebrow={`FootOFF Media · ${season === 'all' ? `${seasons.length} saison${seasons.length > 1 ? 's' : ''} d’histoire` : `Saison ${season}`}`}
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
        <div className="chips journal-seasons" role="tablist" aria-label="Saison">
          <button role="tab" aria-selected={season === 'all'} className={season === 'all' ? 'active' : ''} onClick={() => setSeason('all')}>Tout</button>
          {seasons.map((n) => (
            <button key={n} role="tab" aria-selected={season === n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>S{n}</button>
          ))}
        </div>
      )}
      {!lead && <p className="muted">{state.journal.length ? 'Rien dans cette rubrique pour cette saison.' : 'L’histoire commence au premier coup de sifflet.'}</p>}
      {lead && (
        <article className={`news-lead k-${lead.kind}`}>
          <span className="news-kicker"><b>À la une</b> · {KINDS[lead.kind]} · {dateOf(lead)}</span>
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

