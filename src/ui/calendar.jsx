import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { outcomeOf, seasonFixtures } from '../game/fixtures';
import { STAGES, STAGES_SHORT, cupPrize, leagueLength, penaltySkills, shootoutWinChance } from '../game/cups';
import { TICKET_POLICIES, awayGate, expectedGate, ticketPrice } from '../game/economy';
import { TACTICS, formationOf, lineupRating } from '../game/tactics';
import { standingsOf } from '../game/season';
import { prematchOdds } from '../game/live';
import { kitOf } from '../game/kits';
import { ordinal } from '../game/utils';
import { ClubCrest, Crest } from './crest';
import { Eyebrow } from './kit';
import { IconCheck, IconChevron, IconClose, IconLock, IconPlay, IconStar, IconTrophy } from './icons';
import { fmtMoney, fmtNum, fmtPrice, fmtRating, homeFirst, roundPercents, scoreText } from './format';
import { useSwipe } from './gestures';
import { uiSound } from './uisound';
import { clubStars } from '../game/crest';

// Calendrier de la saison (panneau Saison). Trois parties :
// - la frise : toutes les dates dans l'ordre où elles se jouent (couleur de la compétition en tête : championnat or,
//   Coupe nationale argent, Coupe d'Europe bleu ; résultat ou adversaire en bas), la date choisie levée ;
// - l'affiche de la date choisie, dessinée comme le terrain vu du dessus (notre moitié dorée, celle de l'adversaire à
//   ses couleurs) : écussons, score ou pronostic exact (le même moteur que l'avant-match), affluence, recette, prime ;
// - le bilan de la saison : victoires, nuls, défaites, forme, et le parcours de chaque compétition.
// Choisir une date : un clic dans la frise ou dans le bilan, les flèches du clavier, ou un geste sur l'affiche.

const COMP = { league: 'Championnat', cup: 'Coupe nationale', c1: 'Coupe d’Europe' };
const COMP_ICON = { cup: IconTrophy, c1: IconStar };
const LETTER = { win: 'V', draw: 'N', loss: 'D' };
const NEXT_STAGE = ['les quarts', 'la demi-finale', 'la finale']; // après un tour gagné
const AFTER = ['', 'les huitièmes de finale', 'les quarts de finale', 'la demi-finale']; // tirage du tour suivant
const plural = (n, one, many) => `${fmtNum(n)} ${n > 1 ? many : one}`;
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].join(', ');
// « J4 », « J4 ext » chez l'adversaire (Élite), « Quarts »
const tagOf = (f) => (f.comp === 'league' ? <>J{f.round}{f.away && <small className="sc-away">ext</small>}</> : STAGES_SHORT[f.stage]);
const roundOf = (f, total) => (f.comp === 'league' ? `Journée ${f.round} / ${total}` : STAGES[f.stage]);
const nameOf = (f, r) => `${COMP[f.comp]} · ${f.comp === 'league' ? `journée ${f.round}` : STAGES[f.stage].toLowerCase()}`
  + `${f.away ? ' · à l’extérieur' : ''}${f.opp?.name ? ` · ${f.opp.name}` : ''}${r ? ` · ${scoreText({ ...r, away: f.away })}` : ''}`;
const minus = (v) => `−${fmtRating(Math.abs(v))}`;

// Issue d'une date jouée : en championnat Victoire / Match nul / Défaite ; en coupe Qualifié / Éliminé / Vainqueur.
function verdictOf(f, r) {
  const o = outcomeOf(r);
  if (f.comp === 'league') return { o, text: o === 'win' ? 'Victoire' : o === 'loss' ? 'Défaite' : 'Match nul' };
  if (o === 'win') return { o, text: f.stage === 3 ? 'Vainqueur' : 'Qualifié' };
  return { o, text: 'Éliminé' };
}

export function SeasonCalendar({ state, onOpenMatch, onPlay, initialSel = null }) {
  const fixtures = useMemo(() => seasonFixtures(state), [state]);
  const next = fixtures.find((f) => f.status === 'next');
  const last = [...fixtures].reverse().find((f) => f.status === 'played');
  const [sel, setSel] = useState(() => {
    const start = initialSel ?? (next || last || fixtures[0])?.index ?? 0;
    return fixtures.some((f) => f.index === start) ? start : fixtures[0]?.index ?? 0;
  });
  const dir = useRef(0); // sens du changement de date : l'affiche arrive du bon côté
  const pick = (i) => {
    if (i === sel) return;
    dir.current = Math.sign(i - sel);
    setSel(i);
    uiSound('tab');
  };
  const step = (d) => {
    const k = fixtures.findIndex((f) => f.index === sel);
    const n = fixtures[k + d];
    if (n) pick(n.index);
  };
  const f = fixtures.find((x) => x.index === sel) || fixtures[0];
  if (!f) return null;
  return (
    <div className="sc">
      <Rail state={state} fixtures={fixtures} sel={sel} onPick={pick} />
      <div className="sc-main">
        <Poster f={f} state={state} dir={dir} onStep={step} onPlay={onPlay} onOpenMatch={onOpenMatch} />
        <SeasonSide state={state} fixtures={fixtures} sel={sel} onPick={pick} />
      </div>
    </div>
  );
}

// --- Frise des dates ------------------------------------------------------------------------------------------

function Rail({ state, fixtures, sel, onPick }) {
  const track = useRef(null);
  const first = useRef(true);
  const keyed = useRef(false); // choix au clavier : le focus suit la date choisie
  // la date choisie reste au centre de la frise (téléphone, ou saison à quinze dates)
  useEffect(() => {
    const t = track.current;
    const el = t?.querySelector(`[data-i="${sel}"]`);
    if (!el) return;
    const left = el.offsetLeft - (t.clientWidth - el.offsetWidth) / 2;
    t.scrollTo({ left: Math.max(0, left), behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
    if (keyed.current) { keyed.current = false; el.focus({ preventScroll: true }); }
  }, [sel]);
  const games = fixtures.filter((f) => f.status !== 'out');
  const done = games.filter((f) => f.status === 'played').length;
  const over = !fixtures.some((f) => f.status === 'next');
  const comps = ['league', 'cup', 'c1'].filter((k) => fixtures.some((f) => f.comp === k));
  // clavier et manette : flèches, début, fin (le focus suit la date choisie)
  const onKey = (e) => {
    const k = fixtures.findIndex((f) => f.index === sel);
    const to = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 0, End: fixtures.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const n = fixtures[Math.max(0, Math.min(fixtures.length - 1, to))];
    keyed.current = n.index !== sel;
    onPick(n.index);
  };
  return (
    <section className="sc-rail">
      <div className="sc-rail-head">
        <div className="sc-rail-title">
          <Eyebrow>Saison {state.seasonNumber}</Eyebrow>
          <strong>{over ? 'Saison terminée' : `${plural(done, 'date jouée', 'dates jouées')} sur ${games.length}`}</strong>
        </div>
        <ul className="sc-legend">{comps.map((k) => <li key={k} className={k}>{COMP[k]}</li>)}</ul>
      </div>
      <div className="sc-progress" aria-hidden="true"><i style={{ width: `${games.length ? (done / games.length) * 100 : 0}%` }} /></div>
      <div ref={track} className="sc-track" role="tablist" aria-label="Dates de la saison" onKeyDown={onKey}>
        {fixtures.map((f, k) => <DateChip key={f.index} f={f} k={k} on={f.index === sel} onPick={onPick} />)}
      </div>
    </section>
  );
}

// Une date de la frise : la journée (ou le tour de coupe, à la couleur de la compétition), l'écusson et le nom de
// l'adversaire, puis le résultat en pastille (V 1–0, N 0–0, D 0–1), « À suivre » pour le prochain match, « à venir »
// ensuite. Un tour de coupe qui ne sera pas disputé est cadenassé.
function DateChip({ f, k, on, onPick }) {
  const r = f.match || f.result;
  const o = r ? outcomeOf(r) : null;
  const Icon = COMP_ICON[f.comp];
  const name = nameOf(f, r);
  const res = r ? <em className={`sc-res o-${o}`}>{LETTER[o]} {scoreText({ ...r, away: f.away })}</em>
    : f.status === 'next' ? <em className="sc-res next">À suivre</em>
      : f.status === 'upcoming' ? <em className="sc-res soon">à venir</em>
        : f.status === 'tbd' ? <em className="sc-res soon">tirage</em> : null;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      tabIndex={on ? 0 : -1}
      data-i={f.index}
      title={name}
      aria-label={name}
      className={`sc-date ${f.comp} ${f.status} ${o ? `o-${o}` : ''} ${on ? 'on' : ''}`}
      style={{ '--k': k }}
      onClick={() => onPick(f.index)}
    >
      <b className="sc-date-key">{Icon && <Icon aria-hidden="true" />}{tagOf(f)}</b>
      <span className="sc-date-top" aria-hidden="true">
        {f.opp ? <Crest name={f.opp.name} className="sc-date-crest" /> : f.status === 'out' ? <IconLock className="sc-date-lock" /> : <i className="q">?</i>}
      </span>
      <span className="sc-date-opp" aria-hidden="true"><span>{f.opp?.name || (f.status === 'out' ? 'Éliminé' : 'À tirer')}</span></span>
      <span className="sc-date-foot" aria-hidden="true">{res}</span>
    </button>
  );
}

// --- Affiche de la date choisie ---------------------------------------------------------------------------------

function Fact({ label, sub, tone = '', wide = false, children }) {
  return (
    <div className={`sc-fact ${tone} ${wide ? 'wide' : ''}`}>
      <span className="sc-fact-label">{label}</span>
      <b className="sc-fact-value">{children}</b>
      {sub && <span className="sc-fact-sub">{sub}</span>}
    </div>
  );
}

// Pronostic du prochain match : les chances calculées par le moteur du match, avec le onze et la tactique actuels
// (les mêmes que celles de l'avant-match tant qu'on n'y change rien).
function Odds({ odds, qualify }) {
  const [w, d, l] = roundPercents([odds.win, odds.draw, odds.loss]); // somme toujours égale à 100 %
  return (
    <section className="sc-odds">
      <div className="sc-odds-head">
        <span>Pronostic avec ton onze actuel</span>
        {qualify != null && <span>Qualification <b>{Math.round(qualify * 100)} %</b></span>}
      </div>
      <div className="sc-odds-bar" aria-hidden="true">
        <i className="w" style={{ flexGrow: odds.win }} />
        <i className="d" style={{ flexGrow: odds.draw }} />
        <i className="l" style={{ flexGrow: odds.loss }} />
      </div>
      <div className="sc-odds-legend">
        <span className="w"><b>{w.label}</b>victoire</span>
        <span className="d"><b>{d.label}</b>nul</span>
        <span className="l"><b>{l.label}</b>défaite</span>
      </div>
    </section>
  );
}

// Buteurs groupés par joueur : « Martin 12′, 54′ · Diallo 78′ ».
function scorersOf(m) {
  const by = new Map();
  for (const x of m.scorers || []) by.set(x.name, [...(by.get(x.name) || []), x.minute]);
  return [...by].map(([name, mins]) => `${name} ${mins.map((v) => `${v}′`).join(', ')}`).join(' · ');
}

// Rapport de force d'une date à venir : écart entre notre onze et l'adversaire.
function edgeOf(ours, theirs) {
  const e = ours - theirs;
  if (Math.abs(e) < 0.75) return { text: 'Match équilibré', sub: `écart de ${fmtRating(Math.abs(e))}`, tone: '' };
  return e > 0
    ? { text: 'Tu es favori', sub: `+${fmtRating(e)} de niveau`, tone: 'good' }
    : { text: 'Adversaire favori', sub: `${minus(e)} de niveau`, tone: 'bad' };
}

function Poster({ f, state, dir, onStep, onPlay, onOpenMatch }) {
  const ref = useRef(null);
  useSwipe(ref, { onLeft: () => onStep(1), onRight: () => onStep(-1) });
  const shown = useRef(f.index);
  useEffect(() => { // nouvelle date : l'affiche glisse depuis le côté du geste
    const el = ref.current;
    if (!el || shown.current === f.index) return;
    shown.current = f.index;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate([{ opacity: 0, transform: `translateX(${dir.current * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }, [f.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = f.match;
  const r = f.match || f.result;
  const v = r ? verdictOf(f, r) : null;
  const opp = f.opp;
  const future = f.status === 'next' || f.status === 'upcoming';
  const table = standingsOf(state);
  const rank = f.oppIdx ? table.findIndex((t) => t.i === f.oppIdx) + 1 : 0;
  const ours = m?.myRating ?? (future ? lineupRating(state.players, state.lineup, state.formation) : null);
  const theirs = m?.oppStrength || opp?.strength || null;
  const oppMeta = [
    theirs ? `Niveau ${fmtRating(theirs)}` : null,
    f.comp === 'league' ? (rank ? `${ordinal(rank)} · ${plural(table[rank - 1].pts, 'point', 'points')}` : null)
      : opp?.budget ? `Budget ${fmtMoney(opp.budget)}` : opp?.division || null,
  ].filter(Boolean).join(' · ');
  const Icon = COMP_ICON[f.comp];
  const state0 = v ? v.text : { next: 'Prochain match', upcoming: 'À venir', tbd: 'Tirage au sort', out: 'Non disputé' }[f.status] || 'Joué';
  const prize = f.comp !== 'league' ? cupPrize(f.comp, f.stage, state.divisionIndex) : 0;
  // en Élite, une journée sur deux se joue chez l'adversaire : pas de billetterie, les droits TV seulement, et
  // l'avantage du terrain passe de l'autre côté (pronostic compris)
  const gate = future && opp ? (f.away ? awayGate(state) : expectedGate(state, opp, f.comp)) : null;
  const policy = TICKET_POLICIES[state.ticketPolicy || 'standard'];
  const odds = f.status === 'next' && opp ? prematchOdds(state, { oppStrength: opp.strength, home: !f.away }) : null;
  // coupe : qualifié en gagnant, ou aux tirs au but après un nul (chance exacte, comme à l'avant-match)
  const pens = odds && f.comp !== 'league' ? penaltySkills(state.lineup.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)) : null;
  const qualify = pens ? odds.win + odds.draw * shootoutWinChance(pens.home, pens.away) : null;
  const edge = future && ours != null && theirs ? edgeOf(ours, theirs) : null;
  const cup = f.comp !== 'league' ? state.cups?.[f.comp] : null;
  const lost = cup?.results?.find((x) => !x.won);

  let body = null;
  if (m) {
    const star = (m.players || []).find((p) => p.id === m.motm);
    const played = TICKET_POLICIES[m.tickets];
    const full = m.capacity && m.attendance >= m.capacity;
    body = (
      <div className="sc-facts">
        <Fact label={m.scorers?.length > 1 ? 'Buteurs' : 'Buteur'} wide>{m.scorers?.length ? scorersOf(m) : 'Aucun but marqué'}</Fact>
        {star && <Fact label="Homme du match" sub={`note ${fmtRating(star.rating)}`} tone="gold">{star.name}</Fact>}
        {f.away
          ? <Fact label="Lieu" sub="droits TV seulement">À l’extérieur</Fact>
          : <Fact label="Affluence" sub={full ? 'stade plein' : m.capacity ? `sur ${fmtNum(m.capacity)} places` : null}>{fmtNum(m.attendance || 0)}</Fact>}
        <Fact label="Recette">{fmtMoney(m.revenue || 0)}</Fact>
        <Fact label="Dispositif" sub={TACTICS[m.tactic]?.name}>{formationOf(m.formation).name}</Fact>
        {played && !f.away && <Fact label="Billets" sub={`formule ${played.name}`}>{m.ticketPrice ? fmtPrice(m.ticketPrice) : played.name}</Fact>}
      </div>
    );
  } else if (r) {
    body = <p className="sc-note">Match joué avant que le club n’archive ses fiches de match : seul le score est connu.</p>;
  } else if (future && opp) {
    body = (
      <>
        {odds && <Odds odds={odds} qualify={qualify} />}
        <div className="sc-facts">
          {edge && <Fact label="Rapport de force" sub={edge.sub} tone={edge.tone}>{edge.text}</Fact>}
          {f.away ? (
            <>
              <Fact label="Lieu" sub="pas de billetterie chez l’adversaire">À l’extérieur</Fact>
              <Fact label="Droits TV attendus">{fmtMoney(gate.revenue)}</Fact>
            </>
          ) : (
            <>
              {gate && <Fact label="Affluence attendue" sub={gate.attendance >= gate.capacity ? 'stade plein' : `sur ${fmtNum(gate.capacity)} places`}>{fmtNum(gate.attendance)}</Fact>}
              {gate && <Fact label="Recette attendue">{fmtMoney(gate.revenue)}</Fact>}
              <Fact label="Billets" sub={`formule ${policy.name}`}>{fmtPrice(ticketPrice(state, f.comp))}</Fact>
            </>
          )}
          {prize > 0 && <Fact label={f.stage === 3 ? 'Prime du vainqueur' : 'Prime si qualifié'} tone="gold">{fmtMoney(prize)}</Fact>}
        </div>
      </>
    );
  } else if (f.status === 'tbd') {
    body = (
      <>
        <p className="sc-note">L’adversaire sera tiré au sort après {AFTER[f.stage] || 'le tour précédent'}.</p>
        {prize > 0 && <div className="sc-facts"><Fact label={f.stage === 3 ? 'Prime du vainqueur' : 'Prime si qualifié'} tone="gold">{fmtMoney(prize)}</Fact></div>}
      </>
    );
  } else if (f.status === 'out') {
    body = (
      <p className="sc-note">
        {lost
          ? `Éliminé en ${STAGES[lost.stage].toLowerCase()} par ${lost.opp} (${lost.gf}–${lost.ga}${lost.pens ? `, t.a.b. ${lost.pens[0]}–${lost.pens[1]}` : ''}) : ce tour ne sera pas disputé.`
          : 'Ce tour ne sera pas disputé.'}
      </p>
    );
  }

  // nos couleurs et celles de l'adversaire, à leur place : l'équipe qui reçoit à gauche (0.8.1)
  const usEl = (
    <div className="sc-team us">
      <span className="sc-slot"><ClubCrest crest={state.crest} name={state.clubName} className="sc-crest" full stars={clubStars(state)} /></span>
      <strong>{state.clubName}</strong>
      {ours != null && <span>Niveau {fmtRating(ours)}</span>}
    </div>
  );
  const themEl = (
    <div className="sc-team them">
      <span className="sc-slot">{opp ? <Crest name={opp.name} className="sc-crest" full /> : <span className="sc-crest-q" aria-hidden="true">{f.status === 'out' ? '—' : '?'}</span>}</span>
      <strong>{opp?.name || (f.status === 'out' ? 'Aucun adversaire' : 'Adversaire à tirer')}</strong>
      {oppMeta && <span>{oppMeta}</span>}
    </div>
  );
  return (
    <article
      ref={ref}
      className={`sc-poster ${f.comp} ${f.status} ${v ? `o-${v.o}` : ''} ${f.away ? 'ext' : ''}`}
      style={{ '--opp': opp ? rgbOf(kitOf(opp.name).shirt) : '128, 128, 128' }}
      aria-label={nameOf(f, r)}
    >
      <header className="sc-top">
        <span className="sc-comp">{Icon && <Icon aria-hidden="true" />}{COMP[f.comp]}<em>{roundOf(f, leagueLength(state))}{f.away ? ' · Extérieur' : ''}</em></span>
      </header>

      <div className={`sc-versus ${f.away ? 'ext' : ''}`}>
        {f.away ? themEl : usEl}
        <div className="sc-mid">
          <div className="sc-slot sc-mid-main">{r ? <div className="sc-score" aria-label={homeFirst({ ...r, away: f.away }).join(' à ')}>{homeFirst({ ...r, away: f.away }).map((g, i) => <React.Fragment key={i}>{i ? <i>–</i> : null}<b>{g}</b></React.Fragment>)}</div> : <span className="sc-vs">VS</span>}</div>
          <span className={`sc-state ${v ? v.o : f.status}`}>{state0}</span>
          {r?.pens && <span className="sc-pens">t.a.b. {r.pens[0]}–{r.pens[1]}</span>}
          {r && f.comp !== 'league' && v.o === 'win' && f.stage < 3 && <span className="sc-pens">en route pour {NEXT_STAGE[f.stage]}</span>}
        </div>
        {f.away ? usEl : themEl}
      </div>

      {body}

      {f.status === 'next' && onPlay && (
        <div className="sc-actions"><button type="button" className="btn btn-xl" onClick={onPlay}><IconPlay /> Jouer le match</button></div>
      )}
      {m && onOpenMatch && (
        <div className="sc-actions"><button type="button" className="btn ghost" onClick={() => onOpenMatch(m)}>Voir le Stats Pass <IconChevron /></button></div>
      )}
    </article>
  );
}

// --- Bilan de la saison -------------------------------------------------------------------------------------------

function SeasonSide({ state, fixtures, sel, onPick }) {
  const played = fixtures.filter((f) => f.status === 'played' && (f.match || f.result));
  const tally = { win: 0, draw: 0, loss: 0 };
  let gf = 0;
  let ga = 0;
  for (const f of played) {
    const r = f.match || f.result;
    tally[outcomeOf(r)] += 1;
    gf += r.gf;
    ga += r.ga;
  }
  const form = played.slice(-5);
  const table = standingsOf(state);
  const pos = table.findIndex((t) => t.i === 0) + 1;
  const me = table[pos - 1];
  const league = fixtures.filter((f) => f.comp === 'league');
  const div = state.divisionIndex;
  const aim = div < DIVISIONS.length - 1
    ? `Les deux premiers montent en ${DIVISIONS[div + 1].name}${div > 0 ? ', les deux derniers descendent' : ''}.`
    : 'Les deux premiers jouent la Coupe d’Europe la saison prochaine, les deux derniers descendent.';
  return (
    <aside className="sc-side" aria-label="Bilan de la saison">
      <section className="sc-block">
        <div className="sc-block-head"><Eyebrow>Bilan</Eyebrow><span>{plural(played.length, 'match joué', 'matchs joués')}</span></div>
        <div className="sc-wdl">
          <div className="win"><b>{tally.win}</b><span>{tally.win > 1 ? 'victoires' : 'victoire'}</span></div>
          <div className="draw"><b>{tally.draw}</b><span>{tally.draw > 1 ? 'nuls' : 'nul'}</span></div>
          <div className="loss"><b>{tally.loss}</b><span>{tally.loss > 1 ? 'défaites' : 'défaite'}</span></div>
        </div>
        {played.length > 0 && (
          <div className="sc-wdl-bar" aria-hidden="true">
            <i className="win" style={{ flexGrow: tally.win }} />
            <i className="draw" style={{ flexGrow: tally.draw }} />
            <i className="loss" style={{ flexGrow: tally.loss }} />
          </div>
        )}
        <p className="sc-goals"><b>{gf}</b> {gf > 1 ? 'buts marqués' : 'but marqué'} · <b>{ga}</b> {ga > 1 ? 'encaissés' : 'encaissé'}</p>
      </section>

      {form.length > 0 && (
        <section className="sc-block">
          <div className="sc-block-head"><Eyebrow>Forme</Eyebrow><span>{form.length > 1 ? `${form.length} derniers matchs` : 'dernier match'}</span></div>
          <ol className="sc-form">
            {form.map((f) => {
              const r = f.match || f.result;
              const o = outcomeOf(r);
              return (
                <li key={f.index}>
                  <button type="button" className={`o-${o} ${f.index === sel ? 'on' : ''}`} onClick={() => onPick(f.index)} title={nameOf(f, r)} aria-label={nameOf(f, r)}>{LETTER[o]}</button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="sc-block league">
        <div className="sc-block-head"><Eyebrow>Championnat</Eyebrow><span>{ordinal(pos)} · {plural(me.pts, 'point', 'points')}</span></div>
        <ol className="sc-league">
          {league.map((f) => {
            const r = f.match || f.result;
            const o = r ? outcomeOf(r) : null;
            return (
              <li key={f.index}>
                <button type="button" className={`${f.status} ${o ? `o-${o}` : ''} ${f.index === sel ? 'on' : ''}`} onClick={() => onPick(f.index)} title={nameOf(f, r)} aria-label={nameOf(f, r)}>
                  {r ? LETTER[o] : `J${f.round}`}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="sc-aim">{aim}</p>
      </section>

      {['cup', 'c1'].filter((k) => state.cups?.[k]).map((k) => <CupPath key={k} comp={k} state={state} fixtures={fixtures} sel={sel} onPick={onPick} />)}
    </aside>
  );
}

// Parcours d'une coupe, tour par tour (gagné, perdu, prochain, à venir).
function CupPath({ comp, state, fixtures, sel, onPick }) {
  const c = state.cups[comp];
  const lost = c.results.find((x) => !x.won);
  const status = c.won ? 'Vainqueur' : c.alive ? `Prochain tour : ${STAGES_SHORT[c.stage].toLowerCase()}` : `Éliminé en ${STAGES_SHORT[lost?.stage ?? 0].toLowerCase()}`;
  return (
    <section className={`sc-block sc-cup ${comp}`}>
      <div className="sc-block-head"><Eyebrow>{COMP[comp]}</Eyebrow><span>{status}</span></div>
      <ol className="sc-path">
        {STAGES_SHORT.map((label, i) => {
          const r = c.results.find((x) => x.stage === i);
          const f = fixtures.find((x) => x.comp === comp && x.stage === i);
          const st = r ? (r.won ? 'won' : 'lost') : c.alive && c.stage === i ? 'next' : c.alive ? 'later' : 'off';
          const name = f ? nameOf(f, r) : STAGES[i];
          return (
            <li key={label} className={st}>
              <button type="button" disabled={!f} className={f && f.index === sel ? 'on' : ''} onClick={() => f && onPick(f.index)} title={name} aria-label={name}>
                <i aria-hidden="true">{st === 'won' ? <IconCheck /> : st === 'lost' ? <IconClose /> : null}</i>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
