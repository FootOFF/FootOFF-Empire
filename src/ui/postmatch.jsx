import React, { useState } from 'react';
import { DIVISIONS, POS_LABELS, divisionOf } from '../game/constants';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { StandingsTable, ZoneLegend } from './panels';
import { fmtMoney, fmtNum, fmtRating, homeFirst } from './format';
import { AnimatedMoney } from './moneyfx';
import { Card, Eyebrow, IconAssist, IconBall, IconStar, RatingBadge, SectionHead, VersusBar } from './kit';
import { useKeydown } from './presence';
import { Trophy } from './trophy';
import { ClubCrest, Crest } from './crest';
import { STAGES, leagueLength } from '../game/cups';
import { Portrait } from './portrait';
import { clubStars } from '../game/crest';
import { t, tn, tr } from '../i18n/index';

// Après-match : le résultat (score au centre exact, buteurs sous chaque équipe, notes du match sur 10 et homme du
// match, le match en chiffres, recettes et réputation), puis, après une journée de championnat, le classement mis à
// jour : chaque club y montre les places gagnées ou perdues.

const OUTCOME = { win: t('Victoire'), draw: t('Match nul'), loss: t('Défaite') };

const shortName = (n) => { const [first, ...rest] = n.split(' '); return rest.length ? `${first[0]}. ${rest.join(' ')}` : n; };

// buteurs regroupés (« Bilal Sarr 28′ 76′ »), sur une ligne qui passe à la ligne si besoin
function Goals({ list, align }) {
  if (!list.length) return null;
  const byName = [];
  for (const g of list) {
    const e = byName.find((x) => x.name === g.name);
    const m = g.pen ? t('{minute}′ (pen.)', { minute: g.minute }) : `${g.minute}′`; // but sur penalty (0.7)
    if (e) e.minutes.push(m); else byName.push({ name: g.name, minutes: [m] });
  }
  return (
    <ul className={`post-goals ${align}`}>
      {byName.map((g) => (
        <li key={g.name}>
          <IconBall />
          <span className="g-full">{g.name}</span><span className="g-short">{shortName(g.name)}</span>
          <em>{g.minutes.join(' ')}</em>
        </li>
      ))}
    </ul>
  );
}

// Classement après la journée : où en est le club (place gagnée, perdue ou gardée), puis le tableau.
// Condition d'un joueur après le match (0.8.5) : au coup de sifflet final, puis au prochain match (récupération).
const fitTone = (f) => (f >= 75 ? 'good' : f >= 50 ? 'mid' : 'low');
function FitAfter({ fit }) {
  if (!fit) return null;
  const [end, next = end] = fit;
  return (
    <span className="post-fit" title={t('Condition : {round} % au coup de sifflet, {round2} % au prochain match', { round: Math.round(end), round2: Math.round(next) })}>
      <b>{Math.round(end)} %</b><i aria-hidden="true">→</i><span className={fitTone(next)}>{Math.round(next)} %</span>
    </span>
  );
}

function TableStep({ state, lm, onClose }) {
  const standings = standingsOf(state);
  const pos = standings.findIndex((t) => t.i === 0) + 1;
  const was = lm.before ? lm.before.indexOf(0) + 1 : 0;
  const tone = !was || was === pos ? 'draw' : pos < was ? 'win' : 'loss';
  let line;
  if (!was) line = tn(pos, 'Tu es en tête', 'Tu es {ordinal}', { ordinal: ordinal(pos) }, !(pos === 1));
  else if (was === pos) line = tn(pos, 'Tu restes en tête', 'Tu restes {ordinal}', { ordinal: ordinal(pos) }, !(pos === 1));
  else if (pos < was) line = tn(pos, 'Tu prends la tête', 'Tu grimpes à la {ordinal} place', { ordinal: ordinal(pos, true) }, !(pos === 1));
  else line = t('Tu recules à la {ordinal} place', { ordinal: ordinal(pos, true) });
  return (
    <div className="post" role="dialog" aria-label={t('Classement après la journée')}>
      <article className="post-card post-standings" key="table">
        <header className="post-head">
          <div className="post-meta">
            <Eyebrow>{tr('Classement · journée <0/> / <1/>', [Math.min(lm.round, leagueLength(state)), leagueLength(state)])}</Eyebrow>
            <span className={`post-outcome ${tone}`}>{line}</span>
          </div>
          <h2 className="post-standings-title">{divisionOf(state).name}</h2>
        </header>
        <div className="post-body">
          <StandingsTable state={state} before={lm.before} />
          <ZoneLegend state={state} />
        </div>
        <footer className="post-foot">
          <button className="btn btn-xl" onClick={onClose} autoFocus>{t('Continuer')}</button>
        </footer>
      </article>
    </div>
  );
}

export default function PostMatch({ state, onClose, onStats, initialStep = 'result' }) {
  const lm = state.lastMatch;
  const [step, setStep] = useState(initialStep);
  // après une journée de championnat, le classement suit le résultat (une coupe ne le change pas)
  const withTable = !!lm && (lm.comp || 'league') === 'league' && !!state.table;
  const next = () => (step === 'result' && withTable ? setStep('table') : onClose());
  useKeydown((e) => {
    if (e.key === 'Enter') next();
    else if (e.key === 'Escape') onClose();
  });
  if (!lm) return null;
  if (step === 'table') return <TableStep state={state} lm={lm} onClose={onClose} />;

  const outcome = lm.pens ? (lm.pens[0] > lm.pens[1] ? 'win' : 'loss') : lm.gf > lm.ga ? 'win' : lm.gf < lm.ga ? 'loss' : 'draw';
  const cup = lm.cup;
  const hl = lm.highlights || [];
  const homeGoals = (lm.scorers || []).map((x) => ({ name: x.name, minute: x.minute, pen: x.pen }));
  const awayGoals = hl.filter((h) => h.type === 'goal' && h.side === 'away').map((h) => ({ name: h.player, minute: h.minute, pen: h.pen }));
  const ratings = [...(lm.players || [])].sort((a, b) => b.rating - a.rating || (b.goals + b.assists) - (a.goals + a.assists));
  const motm = ratings[0];
  const st = lm.stats;
  const b = lm.breakdown;

  return (
    <div className="post" role="dialog" aria-label={t('Après-match')}>
      <article className="post-card">
        <header className="post-head">
          <div className="post-meta">
            <Eyebrow>{lm.label || t('Journée {round}', { round: lm.round })}{lm.away ? t(' · Extérieur') : ''}<span className="post-meta-long">{t(' · coup de sifflet final')}</span></Eyebrow>
            <span className={`post-outcome ${outcome}`}>{lm.pens ? t('{v} aux t.a.b. {v2}–{v3}', { v: outcome === 'win' ? t('Qualifié') : t('Éliminé'), v2: lm.pens[0], v3: lm.pens[1] }) : OUTCOME[outcome]}</span>
          </div>
          <div className="post-score">
            {/* l'équipe qui reçoit à gauche (0.8.1) : à l'extérieur, l'adversaire */}
            <div className="post-team home">
              {lm.away ? <Crest name={lm.oppName} className="post-crest" /> : <ClubCrest crest={state.crest} name={state.clubName} className="post-crest" stars={clubStars(state)} />}
              <strong>{lm.away ? lm.oppName : state.clubName}</strong>
              <Goals list={lm.away ? awayGoals : homeGoals} align="right" />
            </div>
            <div className="post-num">{homeFirst(lm).map((g, i) => <React.Fragment key={i}>{i ? <i>–</i> : null}<b>{g}</b></React.Fragment>)}</div>
            <div className="post-team away">
              {lm.away ? <ClubCrest crest={state.crest} name={state.clubName} className="post-crest" stars={clubStars(state)} /> : <Crest name={lm.oppName} className="post-crest" />}
              <strong>{lm.away ? state.clubName : lm.oppName}</strong>
              <Goals list={lm.away ? homeGoals : awayGoals} align="left" />
            </div>
          </div>
          {cup && (
            <div className={`post-cup ${cup.trophy ? 'trophy' : cup.won ? 'won' : 'out'}`}>
              {cup.trophy && <Trophy comp={cup.comp} className="post-trophy" />}
              <div>
                <b>{cup.trophy ? `${cup.comp === 'c1' ? t('Vainqueur de la Coupe d’Europe des clubs') : t('Vainqueur de la Coupe nationale')} !` : cup.won ? t('Qualifié pour la suite : {v}', { v: cup.next ? STAGES[cup.stage + 1].toLowerCase() : '' }) : t('Éliminé en {toLowerCase}', { toLowerCase: STAGES[cup.stage].toLowerCase() })}</b>
                <span>{cup.prize ? t('Prime de {prize}', { prize: fmtMoney(cup.prize) }) : t('Pas de prime pour ce tour')}{cup.next ? t(' · prochain adversaire : {name}', { name: cup.next.name }) : ''}{cup.trophy ? t(' · le trophée rejoint la vitrine du club') : ''}</span>
              </div>
            </div>
          )}
        </header>

        <div className="post-body">
          <section className="post-col">
            <SectionHead label={t('Notes du match')} aside={t('sur 10')} />
            {lm.fitness && <p className="post-fit-note">{t('Condition au coup de sifflet, puis au prochain match.')}</p>}
            {motm && (
              <div className="post-motm">
                <span className="post-motm-tag">{tr('<0/> Homme du match', [<IconStar />])}</span>
                <div className="post-motm-row">
                  <Portrait p={state.players.find((x) => x.id === motm.id) || motm} size={52} />
                  <RatingBadge value={motm.rating} size="lg" />
                  <div>
                    <strong>{motm.name}</strong>
                    <span>{POS_LABELS[motm.pos]}{motm.goals ? tn(motm.goals, ' · {goals} but', ' · {goals} buts', { goals: motm.goals }, motm.goals > 1) : ''}{motm.assists ? tn(motm.assists, ' · {assists} passe déc.', ' · {assists} passes déc.', { assists: motm.assists }, motm.assists > 1) : ''}</span>
                    <FitAfter fit={lm.fitness?.[motm.id]} />
                  </div>
                </div>
              </div>
            )}
            <ol className="post-ratings">
              {ratings.slice(1).map((p) => (
                <li key={p.id}>
                  <RatingBadge value={p.rating} />
                  <span className="pr-num">{p.num ?? ''}</span>
                  <span className="pr-main" title={`${p.name} · ${POS_LABELS[p.pos]}`}>
                    <span className="pr-name">{shortName(p.name)}</span>
                    <span className="pr-events">
                      {Array.from({ length: p.goals }, (_, i) => <IconBall key={`g${i}`} />)}
                      {Array.from({ length: p.assists }, (_, i) => <IconAssist key={`a${i}`} />)}
                      {p.yellow > 0 && <Card />}
                      {p.red > 0 && <Card color="red" />}
                    </span>
                  </span>
                  <FitAfter fit={lm.fitness?.[p.id]} />
                </li>
              ))}
            </ol>
          </section>

          <section className="post-col">
            <SectionHead label={t('Le match en chiffres')} aside={<span className="hide-sm">{lm.away ? `${lm.oppName} · ${state.clubName}` : `${state.clubName} · ${lm.oppName}`}</span>} />
            {st && (
              <div className="post-stats">
                <VersusBar label={t('Possession')} home={st.possession} away={100 - st.possession} suffix=" %" flip={!!lm.away} />
                <VersusBar label={t('Tirs')} home={st.shots[0]} away={st.shots[1]} flip={!!lm.away} />
                <VersusBar label={t('Tirs cadrés')} home={st.onTarget[0]} away={st.onTarget[1]} flip={!!lm.away} />
                <VersusBar label={t('Cartons')} home={st.yellow[0] + st.red[0]} away={st.yellow[1] + st.red[1]} flip={!!lm.away} />
              </div>
            )}

            {/* à l'extérieur (Élite) : la billetterie est celle de l'adversaire, seuls les droits TV reviennent au club */}
            <SectionHead label={lm.away ? t('Recettes du match') : t('Billetterie et recettes')} aside={lm.away ? t('à l’extérieur') : lm.capacity ? t('{attendance} / {capacity} places', { attendance: fmtNum(lm.attendance), capacity: fmtNum(lm.capacity) }) : null} />
            <div className="post-money">
              <b className="post-money-total"><AnimatedMoney value={lm.revenue} from={0} delay={500} duration={1200} prefix="+" /></b>
              {lm.capacity ? <span className="post-fill"><i style={{ width: `${Math.min(100, (lm.attendance / lm.capacity) * 100)}%` }} /></span> : null}
              {b && !lm.away && (
                <dl className="post-breakdown">
                  <div><dt>{t('Billetterie')}</dt><dd>{fmtMoney(b.billetterie)}</dd></div>
                  <div><dt>{t('Buvette')}</dt><dd>{fmtMoney(b.buvette)}</dd></div>
                  <div><dt>{t('Boutique')}</dt><dd>{fmtMoney(b.boutique)}</dd></div>
                  <div><dt>{t('Droits TV')}</dt><dd>{b.tv ? fmtMoney(b.tv) : '—'}</dd></div>
                </dl>
              )}
              {b && lm.away && (
                <dl className="post-breakdown">
                  <div><dt>{t('Droits TV')}</dt><dd>{fmtMoney(b.tv || 0)}</dd></div>
                </dl>
              )}
              {lm.away && <p className="post-note">{t('Pas de billetterie chez l’adversaire : seuls les droits TV reviennent au club.')}</p>}
              {lm.demand > lm.capacity && <p className="post-note">{tr('Stade complet : <0/> supporters sont restés dehors.', [fmtNum(lm.demand - lm.capacity)])}</p>}
            </div>
            {lm.absences?.length > 0 && (
              <>
                <SectionHead label={t('Infirmerie et suspensions')} aside={tn(lm.absences.length, '{n} absent', '{n} absents', { n: lm.absences.length }, lm.absences.length > 1)} />
                <ul className="post-absent">
                  {lm.absences.map((a) => (
                    <li key={`${a.kind}-${a.id}`} className={a.kind}>
                      <b>{a.name}</b>
                      <span>{tr('<0/> · <1/> match<2/> · <3/>', [a.kind === 'injury' ? t('blessé') : t('suspendu'), a.matches, a.matches > 1 ? 's' : '', a.why])}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <footer className="post-foot">
          <span className={`post-rep ${lm.repDelta >= 0 ? 'up' : 'down'}`}>{tr('Réputation <0/><1/><2/>', [lm.repDelta >= 0 ? '+' : '−', fmtRating(Math.abs(lm.repDelta)), lm.status && <b className="post-status">{' '}{tr('· Nouveau statut : <0/>', [lm.status])}</b>])}</span>
          {onStats && <button className="btn ghost btn-xl" onClick={onStats}>{t('Stats du match')}</button>}
          <button className="btn btn-xl" onClick={next} autoFocus>{withTable ? t('Voir le classement') : t('Continuer')}</button>
        </footer>
      </article>
    </div>
  );
}
