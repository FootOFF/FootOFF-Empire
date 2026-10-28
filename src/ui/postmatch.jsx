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

// Après-match : le résultat (score au centre exact, buteurs sous chaque équipe, notes du match sur 10 et homme du
// match, le match en chiffres, recettes et réputation), puis, après une journée de championnat, le classement mis à
// jour : chaque club y montre les places gagnées ou perdues.

const OUTCOME = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };

const shortName = (n) => { const [first, ...rest] = n.split(' '); return rest.length ? `${first[0]}. ${rest.join(' ')}` : n; };

// buteurs regroupés (« Bilal Sarr 28′ 76′ »), sur une ligne qui passe à la ligne si besoin
function Goals({ list, align }) {
  if (!list.length) return null;
  const byName = [];
  for (const g of list) {
    const e = byName.find((x) => x.name === g.name);
    const m = g.pen ? `${g.minute}′ (pen.)` : `${g.minute}′`; // but sur penalty (0.7)
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
    <span className="post-fit" title={`Condition : ${Math.round(end)} % au coup de sifflet, ${Math.round(next)} % au prochain match`}>
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
  if (!was) line = pos === 1 ? 'Tu es en tête' : `Tu es ${ordinal(pos)}`;
  else if (was === pos) line = pos === 1 ? 'Tu restes en tête' : `Tu restes ${ordinal(pos)}`;
  else if (pos < was) line = pos === 1 ? 'Tu prends la tête' : `Tu grimpes à la ${ordinal(pos, true)} place`;
  else line = `Tu recules à la ${ordinal(pos, true)} place`;
  return (
    <div className="post" role="dialog" aria-label="Classement après la journée">
      <article className="post-card post-standings" key="table">
        <header className="post-head">
          <div className="post-meta">
            <Eyebrow>Classement · journée {Math.min(lm.round, leagueLength(state))} / {leagueLength(state)}</Eyebrow>
            <span className={`post-outcome ${tone}`}>{line}</span>
          </div>
          <h2 className="post-standings-title">{divisionOf(state).name}</h2>
        </header>
        <div className="post-body">
          <StandingsTable state={state} before={lm.before} />
          <ZoneLegend state={state} />
        </div>
        <footer className="post-foot">
          <button className="btn btn-xl" onClick={onClose} autoFocus>Continuer</button>
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
    <div className="post" role="dialog" aria-label="Après-match">
      <article className="post-card">
        <header className="post-head">
          <div className="post-meta">
            <Eyebrow>{lm.label || `Journée ${lm.round}`}{lm.away ? ' · Extérieur' : ''}<span className="post-meta-long"> · coup de sifflet final</span></Eyebrow>
            <span className={`post-outcome ${outcome}`}>{lm.pens ? `${outcome === 'win' ? 'Qualifié' : 'Éliminé'} aux t.a.b. ${lm.pens[0]}–${lm.pens[1]}` : OUTCOME[outcome]}</span>
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
                <b>{cup.trophy ? `${cup.comp === 'c1' ? 'Vainqueur de la Coupe d’Europe des clubs' : 'Vainqueur de la Coupe nationale'} !` : cup.won ? `Qualifié pour la suite : ${cup.next ? STAGES[cup.stage + 1].toLowerCase() : ''}` : `Éliminé en ${STAGES[cup.stage].toLowerCase()}`}</b>
                <span>{cup.prize ? `Prime de ${fmtMoney(cup.prize)}` : 'Pas de prime pour ce tour'}{cup.next ? ` · prochain adversaire : ${cup.next.name}` : ''}{cup.trophy ? ' · le trophée rejoint la vitrine du club' : ''}</span>
              </div>
            </div>
          )}
        </header>

        <div className="post-body">
          <section className="post-col">
            <SectionHead label="Notes du match" aside="sur 10" />
            {lm.fitness && <p className="post-fit-note">Condition au coup de sifflet, puis au prochain match.</p>}
            {motm && (
              <div className="post-motm">
                <span className="post-motm-tag"><IconStar /> Homme du match</span>
                <div className="post-motm-row">
                  <Portrait p={state.players.find((x) => x.id === motm.id) || motm} size={52} />
                  <RatingBadge value={motm.rating} size="lg" />
                  <div>
                    <strong>{motm.name}</strong>
                    <span>{POS_LABELS[motm.pos]}{motm.goals ? ` · ${motm.goals} but${motm.goals > 1 ? 's' : ''}` : ''}{motm.assists ? ` · ${motm.assists} passe${motm.assists > 1 ? 's' : ''} déc.` : ''}</span>
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
            <SectionHead label="Le match en chiffres" aside={<span className="hide-sm">{lm.away ? `${lm.oppName} · ${state.clubName}` : `${state.clubName} · ${lm.oppName}`}</span>} />
            {st && (
              <div className="post-stats">
                <VersusBar label="Possession" home={st.possession} away={100 - st.possession} suffix=" %" flip={!!lm.away} />
                <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} flip={!!lm.away} />
                <VersusBar label="Tirs cadrés" home={st.onTarget[0]} away={st.onTarget[1]} flip={!!lm.away} />
                <VersusBar label="Cartons" home={st.yellow[0] + st.red[0]} away={st.yellow[1] + st.red[1]} flip={!!lm.away} />
              </div>
            )}

            {/* à l'extérieur (Élite) : la billetterie est celle de l'adversaire, seuls les droits TV reviennent au club */}
            <SectionHead label={lm.away ? 'Recettes du match' : 'Billetterie et recettes'} aside={lm.away ? 'à l’extérieur' : lm.capacity ? `${fmtNum(lm.attendance)} / ${fmtNum(lm.capacity)} places` : null} />
            <div className="post-money">
              <b className="post-money-total"><AnimatedMoney value={lm.revenue} from={0} delay={500} duration={1200} prefix="+" /></b>
              {lm.capacity ? <span className="post-fill"><i style={{ width: `${Math.min(100, (lm.attendance / lm.capacity) * 100)}%` }} /></span> : null}
              {b && !lm.away && (
                <dl className="post-breakdown">
                  <div><dt>Billetterie</dt><dd>{fmtMoney(b.billetterie)}</dd></div>
                  <div><dt>Buvette</dt><dd>{fmtMoney(b.buvette)}</dd></div>
                  <div><dt>Boutique</dt><dd>{fmtMoney(b.boutique)}</dd></div>
                  <div><dt>Droits TV</dt><dd>{b.tv ? fmtMoney(b.tv) : '—'}</dd></div>
                </dl>
              )}
              {b && lm.away && (
                <dl className="post-breakdown">
                  <div><dt>Droits TV</dt><dd>{fmtMoney(b.tv || 0)}</dd></div>
                </dl>
              )}
              {lm.away && <p className="post-note">Pas de billetterie chez l’adversaire : seuls les droits TV reviennent au club.</p>}
              {lm.demand > lm.capacity && <p className="post-note">Stade complet : {fmtNum(lm.demand - lm.capacity)} supporters sont restés dehors.</p>}
            </div>
            {lm.absences?.length > 0 && (
              <>
                <SectionHead label="Infirmerie et suspensions" aside={`${lm.absences.length} absent${lm.absences.length > 1 ? 's' : ''}`} />
                <ul className="post-absent">
                  {lm.absences.map((a) => (
                    <li key={`${a.kind}-${a.id}`} className={a.kind}>
                      <b>{a.name}</b>
                      <span>{a.kind === 'injury' ? 'blessé' : 'suspendu'} · {a.matches} match{a.matches > 1 ? 's' : ''} · {a.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <footer className="post-foot">
          <span className={`post-rep ${lm.repDelta >= 0 ? 'up' : 'down'}`}>Réputation {lm.repDelta >= 0 ? '+' : '−'}{fmtRating(Math.abs(lm.repDelta))}{lm.status && <b className="post-status"> · Nouveau statut : {lm.status}</b>}</span>
          {onStats && <button className="btn ghost btn-xl" onClick={onStats}>Stats du match</button>}
          <button className="btn btn-xl" onClick={next} autoFocus>{withTable ? 'Voir le classement' : 'Continuer'}</button>
        </footer>
      </article>
    </div>
  );
}
