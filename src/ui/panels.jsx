import React, { useEffect, useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum } from './format';
import { IconClose, IconCoin } from './icons';
import { ClubCrest, Crest } from './crest';
import { AnimatedMoney } from './moneyfx';
import { Eyebrow, IconBall, RatingBadge, SectionHead, Stat } from './kit';
import { Trophy, TROPHY_NAMES } from './trophy';
import { STAGES_SHORT, STAGES, nextFixture, ofDiv } from '../game/cups';
import { useDialogFocus, useKeydown, useLeaving } from './presence';
import { uiSound } from './uisound';
import { PHONE, useSwipe } from './gestures';
import { Tabs } from './glass';
import { SeasonCalendar } from './calendar';

// Un panneau ou une fiche qui s'ouvre fait un léger souffle qui monte, qui descend quand il se ferme.
export function usePanelSound() {
  const leaving = useLeaving();
  useEffect(() => { uiSound(leaving ? 'close' : 'open'); }, [leaving]);
}

// Panneau du jeu : un seul modèle pour l'Effectif, la Saison et le Journal (en-tête, barre d'outils, corps
// défilant, trésorerie à droite quand on y dépense). Glisse depuis la droite sur PC, plein écran sur mobile.
export function Panel({ title, eyebrow, size = 'md', money = null, toolbar = null, overlay = null, onClose, onEscape, children }) {
  const ref = useRef(null);
  useDialogFocus(ref);
  useKeydown((e) => { if (e.key === 'Escape') (onEscape || onClose)(); });
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  usePanelSound();
  return (
    <section ref={ref} tabIndex={-1} className={`panel ${size}`} role="dialog" aria-label={title}>
      <span className="grip" aria-hidden="true" />
      <header className="panel-head">
        <div className="panel-title">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h2>{title}</h2>
        </div>
        <div className="panel-actions">
          {money !== null && (
            <span className={`panel-money ${money < 0 ? 'neg' : ''}`} data-money-target title="Trésorerie"><IconCoin /><AnimatedMoney value={money} /></span>
          )}
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </div>
      </header>
      {toolbar && <div className="panel-bar">{toolbar}</div>}
      <div className="panel-body">{children}</div>
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
const ZONE_TAG = { promo: 'Montée', europe: 'Europe', releg: 'Descente' };

// Classement de la division (panneau Saison, et après chaque journée de championnat). before : ordre des clubs
// avant la dernière journée (indices) ; chaque club montre alors ce qu'il a gagné ou perdu de places.
export function StandingsTable({ state, before = null }) {
  const standings = standingsOf(state);
  return (
    <table className={`table standings ${before ? 'moves' : ''}`}>
      <thead><tr><th>#</th>{before && <th className="t-move-h" aria-label="Évolution" />}<th>Club</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead>
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
                <span className="t-name">{t.name}</span>{zone && <span className={`t-zone ${zone}`}>{ZONE_TAG[zone]}</span>}
              </td>
              <td>{t.played}</td>
              <td>{t.gd > 0 ? '+' : ''}{t.gd}</td>
              <td className="t-pts">{t.pts}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Légende des places (montée, Europe, descente) sous le classement.
export function ZoneLegend({ state }) {
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < 3;
  return (
    <ul className="zone-legend">
      {promo ? (
        <li className="promo"><b>1 – 2</b>Montée en {DIVISIONS[state.divisionIndex + 1].name}</li>
      ) : (
        <li className="europe"><b>1 – 2</b>Qualifiés pour la Coupe d’Europe des clubs la saison prochaine</li>
      )}
      {rel && <li className="releg"><b>7 – 8</b>Descente en {DIVISIONS[state.divisionIndex - 1].name}</li>}
      {promo && <li className="europe"><b>Europe</b>La Coupe d’Europe des clubs se joue depuis l’Elite : ses deux premiers s’y qualifient.</li>}
    </ul>
  );
}

export function SeasonPanel({ state, onClose, initialTab = 'calendar', initialSel = null, onOpenMatch, onPlay }) {
  const [tab, setTab] = useState(initialTab);
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
      size="lg"
      title={div.name}
      eyebrow={`Saison ${state.seasonNumber} · ${state.round ? `journée ${Math.min(state.round, 7)} / 7` : 'avant la 1re journée'}`}
      onClose={onClose}
      toolbar={(
        <>
          <div className="season-stats">
          <Stat label="Position" value={ordinal(pos)} sub="sur 8" tone={pos <= 2 ? 'up' : rel && pos >= 7 ? 'down' : ''} />
          <Stat label="Points" value={me.pts} sub={`${me.played} match${me.played > 1 ? 's' : ''}`} />
          <Stat label="Diff." value={`${me.gd > 0 ? '+' : ''}${me.gd}`} />
          {/* « Ambition » : la place visée au classement (l'« objectif de saison » du HUD est celui des primes de palier) */}
          <Stat label="Ambition" value={promo ? 'Top 2' : 'Europe'} sub={goal} />
          </div>
          <Tabs className="sq-tabs season-tabs" items={[['calendar', 'Calendrier'], ['table', 'Classement']]} value={tab} onChange={setTab} label="Saison" />
        </>
      )}
    >
      {tab === 'calendar' && <SeasonCalendar state={state} initialSel={initialSel} onOpenMatch={onOpenMatch} onPlay={onPlay} />}
      {tab === 'table' && <div className="season-cols">
      <div className="season-col">
      <SectionHead label="Classement" aside={`${div.name} · ${standings.length} clubs`} />
      <StandingsTable state={state} />
      <ZoneLegend state={state} />
      </div>

      <div className="season-col">
      <CupRuns state={state} />

      {lm && (
        <>
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
        </>
      )}

      <TrophyCase trophies={state.trophies || []} />

      {state.history.length > 0 && (
        <>
          <SectionHead label="Classements" />
          <ul className="honours">
            {state.history.slice().reverse().map((h) => (
              <li key={h.season}><span>Saison {h.season}</span><em>{h.division}</em><b>{ordinal(h.position)}</b></li>
            ))}
          </ul>
        </>
      )}
      </div>
      </div>}
    </Panel>
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
    return (
      <React.Fragment key={k}>
        <SectionHead label={k === 'c1' ? 'Coupe d’Europe des clubs' : 'Coupe nationale'} aside={status} />
        <ol className="cup-run">
          {STAGES.map((st, i) => {
            const r = c.results.find((x) => x.stage === i);
            const upcoming = c.alive && c.stage === i;
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
                    <span className="cr-opp">{c.opp.name}<em>{c.opp.division}{next?.comp === k ? ' · prochain match' : ''}</em></span>
                    <b>niv. {String(c.opp.strength).replace('.', ',')}</b>
                  </>
                ) : <span className="cr-opp muted">—</span>}
              </li>
            );
          })}
        </ol>
      </React.Fragment>
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

export function JournalPanel({ state, onClose }) {
  const [filter, setFilter] = useState('all');
  const all = state.journal.map(article);
  const list = filter === 'all' ? all
    : filter === 'club' ? all.filter((a) => ['club', 'saison', 'objectif', 'academie', 'entrainement'].includes(a.kind))
      : all.filter((a) => a.kind === filter);
  const [lead, ...rest] = list;
  return (
    <Panel
      title="Le journal du club"
      eyebrow={`FootOFF Media · Saison ${state.seasonNumber}`}
      onClose={onClose}
      toolbar={(
        <div className="chips journal-filters">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      )}
    >
      {!lead && <p className="muted">{state.journal.length ? 'Rien dans cette rubrique pour l’instant.' : 'L’histoire commence au premier coup de sifflet.'}</p>}
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

