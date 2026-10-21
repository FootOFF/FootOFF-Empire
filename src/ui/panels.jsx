import React, { useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum } from './format';
import { IconClose, IconCoin } from './icons';
import { AnimatedMoney } from './moneyfx';
import { Eyebrow, IconBall, RatingBadge, SectionHead, Stat } from './kit';
import { Trophy, TROPHY_NAMES } from './trophy';
import { STAGES_SHORT, STAGES, nextFixture } from '../game/cups';
import { useDialogFocus, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';

// Panneau du jeu : un seul modèle pour l'Effectif, la Saison et le Journal (en-tête, barre d'outils, corps
// défilant, trésorerie à droite quand on y dépense). Glisse depuis la droite sur PC, plein écran sur mobile.
export function Panel({ title, eyebrow, size = 'md', money = null, toolbar = null, overlay = null, onClose, onEscape, children }) {
  const ref = useRef(null);
  useDialogFocus(ref);
  useKeydown((e) => { if (e.key === 'Escape') (onEscape || onClose)(); });
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
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

// --- Saison : situation, classement, dernier match, palmarès -----------------------------------------------

export function SeasonPanel({ state, onClose }) {
  const standings = standingsOf(state);
  const div = DIVISIONS[state.divisionIndex];
  const lm = state.lastMatch;
  const rel = state.divisionIndex > 0;
  const promo = state.divisionIndex < 3;
  const pos = standings.findIndex((t) => t.i === 0) + 1;
  const me = standings[pos - 1];
  let goal;
  if (promo && pos > 2) goal = `${standings[1].pts - me.pts} pt${standings[1].pts - me.pts > 1 ? 's' : ''} de la montée`;
  else if (promo) goal = 'En zone de montée';
  else goal = pos === 1 ? 'En tête de l’Elite' : `${standings[0].pts - me.pts} pts du titre`;
  if (rel && pos >= 7) goal = 'En zone de descente';
  const motm = lm?.players?.length ? [...lm.players].sort((a, b) => b.rating - a.rating)[0] : null;

  return (
    <Panel
      title={div.name}
      eyebrow={`Saison ${state.seasonNumber} · journée ${Math.min(state.round, 7)} / 7`}
      onClose={onClose}
      toolbar={(
        <div className="season-stats">
          <Stat label="Position" value={ordinal(pos)} sub="sur 8" tone={promo && pos <= 2 ? 'up' : rel && pos >= 7 ? 'down' : ''} />
          <Stat label="Points" value={me.pts} sub={`${me.played} match${me.played > 1 ? 's' : ''}`} />
          <Stat label="Diff." value={`${me.gd > 0 ? '+' : ''}${me.gd}`} />
          <Stat label="Objectif" value={promo ? 'Top 2' : 'Titre'} sub={goal} />
        </div>
      )}
    >
      <SectionHead label="Classement" aside={[promo && 'or : montée', rel && 'rouge : descente'].filter(Boolean).join(' · ')} />
      <table className="table standings">
        <thead><tr><th>#</th><th>Club</th><th>J</th><th>Diff</th><th>Pts</th></tr></thead>
        <tbody>
          {standings.map((t, i) => (
            <tr key={t.i} className={[t.i === 0 && 'me', promo && i < 2 && 'promo', rel && i >= 6 && 'releg'].filter(Boolean).join(' ')}>
              <td className="t-pos">{i + 1}</td>
              <td className="t-club">{t.name}</td>
              <td>{t.played}</td>
              <td>{t.gd > 0 ? '+' : ''}{t.gd}</td>
              <td className="t-pts">{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <CupRuns state={state} />

      {lm && (
        <>
          <SectionHead label={`Dernier match · ${lm.comp && lm.comp !== 'league' ? `${lm.comp === 'c1' ? 'C1' : 'Coupe'} · ${STAGES_SHORT[lm.stage].toLowerCase()}` : `journée ${lm.round}`}`} aside={lm.gf > lm.ga ? 'Victoire' : lm.gf < lm.ga ? 'Défaite' : 'Match nul'} />
          <div className="last-match">
            <div className="lm-score">
              <span className="lm-team">{state.clubName}</span>
              <b className={lm.gf > lm.ga ? 'win' : lm.gf < lm.ga ? 'loss' : ''}>{lm.gf} – {lm.ga}</b>
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
        <SectionHead label={k === 'c1' ? 'C1 · coupe d’Europe des champions' : 'Coupe nationale'} aside={status} />
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
              <li key={i}><Trophy comp={t.comp} /><span>{t.comp === 'league' ? `Champion de ${t.division}` : t.comp === 'cup' ? 'Coupe nationale' : 'C1, coupe d’Europe des champions'}</span><em>Saison {t.season}</em></li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// --- Journal façon FootOFF Media : à la une, rubriques, titres ----------------------------------------------

const KINDS = { match: 'Match', mercato: 'Mercato', infra: 'Bâtiments', saison: 'Saison', objectif: 'Objectif', club: 'Club' };
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
    : filter === 'club' ? all.filter((a) => ['club', 'saison', 'objectif'].includes(a.kind))
      : all.filter((a) => a.kind === filter);
  const [lead, ...rest] = list;
  return (
    <Panel
      title="Le journal du club"
      eyebrow={`FootOFF Media · saison ${state.seasonNumber}`}
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

