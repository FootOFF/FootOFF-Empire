import React from 'react';
import { POS_LABELS } from '../game/constants';
import { fmtMoney, fmtNum, fmtRating } from './format';
import { AnimatedMoney } from './moneyfx';
import { Card, Eyebrow, IconAssist, IconBall, IconStar, RatingBadge, SectionHead, VersusBar } from './kit';
import { useKeydown } from './presence';
import { Trophy } from './trophy';
import { STAGES } from '../game/cups';

// Après-match : un seul écran, au lieu de « coup de sifflet final » puis « résumé ».
// Score au centre exact (grille 1fr auto 1fr), buteurs sous chaque équipe, notes du match sur 10 et homme du
// match, le match en chiffres, recettes et réputation, un seul bouton pour continuer.

const OUTCOME = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };

const shortName = (n) => { const [first, ...rest] = n.split(' '); return rest.length ? `${first[0]}. ${rest.join(' ')}` : n; };

// buteurs regroupés (« Bilal Sarr 28′ 76′ »), sur une ligne qui passe à la ligne si besoin
function Goals({ list, align }) {
  if (!list.length) return null;
  const byName = [];
  for (const g of list) {
    const e = byName.find((x) => x.name === g.name);
    if (e) e.minutes.push(g.minute); else byName.push({ name: g.name, minutes: [g.minute] });
  }
  return (
    <ul className={`post-goals ${align}`}>
      {byName.map((g) => (
        <li key={g.name}>
          <IconBall />
          <span className="g-full">{g.name}</span><span className="g-short">{shortName(g.name)}</span>
          <em>{g.minutes.map((m) => `${m}′`).join(' ')}</em>
        </li>
      ))}
    </ul>
  );
}

export default function PostMatch({ state, onClose, onStats }) {
  const lm = state.lastMatch;
  useKeydown((e) => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); });
  if (!lm) return null;

  const outcome = lm.pens ? (lm.pens[0] > lm.pens[1] ? 'win' : 'loss') : lm.gf > lm.ga ? 'win' : lm.gf < lm.ga ? 'loss' : 'draw';
  const cup = lm.cup;
  const hl = lm.highlights || [];
  const homeGoals = (lm.scorers || []).map((x) => ({ name: x.name, minute: x.minute }));
  const awayGoals = hl.filter((h) => h.type === 'goal' && h.side === 'away').map((h) => ({ name: h.player, minute: h.minute }));
  const ratings = [...(lm.players || [])].sort((a, b) => b.rating - a.rating || (b.goals + b.assists) - (a.goals + a.assists));
  const motm = ratings[0];
  const st = lm.stats;
  const b = lm.breakdown;

  return (
    <div className="post" role="dialog" aria-label="Après-match">
      <article className="post-card">
        <header className="post-head">
          <div className="post-meta">
            <Eyebrow>{lm.label || `Journée ${lm.round}`}<span className="post-meta-long"> · coup de sifflet final</span></Eyebrow>
            <span className={`post-outcome ${outcome}`}>{lm.pens ? `${outcome === 'win' ? 'Qualifié' : 'Éliminé'} aux t.a.b. ${lm.pens[0]}–${lm.pens[1]}` : OUTCOME[outcome]}</span>
          </div>
          <div className="post-score">
            <div className="post-team home">
              <strong>{state.clubName}</strong>
              <Goals list={homeGoals} align="right" />
            </div>
            <div className="post-num"><b>{lm.gf}</b><i>–</i><b>{lm.ga}</b></div>
            <div className="post-team away">
              <strong>{lm.oppName}</strong>
              <Goals list={awayGoals} align="left" />
            </div>
          </div>
          {cup && (
            <div className={`post-cup ${cup.trophy ? 'trophy' : cup.won ? 'won' : 'out'}`}>
              {cup.trophy && <Trophy comp={cup.comp} className="post-trophy" />}
              <div>
                <b>{cup.trophy ? `${cup.comp === 'c1' ? 'Vainqueur de la C1' : 'Vainqueur de la Coupe nationale'} !` : cup.won ? `Qualifié pour la suite : ${cup.next ? STAGES[cup.stage + 1].toLowerCase() : ''}` : `Éliminé en ${STAGES[cup.stage].toLowerCase()}`}</b>
                <span>{cup.prize ? `Prime de ${fmtMoney(cup.prize)}` : 'Pas de prime pour ce tour'}{cup.next ? ` · prochain adversaire : ${cup.next.name}` : ''}{cup.trophy ? ' · le trophée rejoint la vitrine du club' : ''}</span>
              </div>
            </div>
          )}
        </header>

        <div className="post-body">
          <section className="post-col">
            <SectionHead label="Notes du match" aside="sur 10" />
            {motm && (
              <div className="post-motm">
                <span className="post-motm-tag"><IconStar /> Homme du match</span>
                <div className="post-motm-row">
                  <RatingBadge value={motm.rating} size="lg" />
                  <div>
                    <strong>{motm.name}</strong>
                    <span>{POS_LABELS[motm.pos]}{motm.goals ? ` · ${motm.goals} but${motm.goals > 1 ? 's' : ''}` : ''}{motm.assists ? ` · ${motm.assists} passe${motm.assists > 1 ? 's' : ''} déc.` : ''}</span>
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
                </li>
              ))}
            </ol>
          </section>

          <section className="post-col">
            <SectionHead label="Le match en chiffres" aside={<span className="hide-sm">{state.clubName} · {lm.oppName}</span>} />
            {st && (
              <div className="post-stats">
                <VersusBar label="Possession" home={st.possession} away={100 - st.possession} suffix=" %" />
                <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} />
                <VersusBar label="Tirs cadrés" home={st.onTarget[0]} away={st.onTarget[1]} />
                <VersusBar label="Cartons" home={st.yellow[0] + st.red[0]} away={st.yellow[1] + st.red[1]} />
              </div>
            )}

            <SectionHead label="Billetterie et recettes" aside={lm.capacity ? `${fmtNum(lm.attendance)} / ${fmtNum(lm.capacity)} places` : null} />
            <div className="post-money">
              <b className="post-money-total"><AnimatedMoney value={lm.revenue} from={0} delay={500} duration={1200} prefix="+" /></b>
              {lm.capacity ? <span className="post-fill"><i style={{ width: `${Math.min(100, (lm.attendance / lm.capacity) * 100)}%` }} /></span> : null}
              {b && (
                <dl className="post-breakdown">
                  <div><dt>Billetterie</dt><dd>{fmtMoney(b.billetterie)}</dd></div>
                  <div><dt>Buvette</dt><dd>{fmtMoney(b.buvette)}</dd></div>
                  <div><dt>Boutique</dt><dd>{fmtMoney(b.boutique)}</dd></div>
                  <div><dt>Droits TV</dt><dd>{b.tv ? fmtMoney(b.tv) : '—'}</dd></div>
                </dl>
              )}
              {lm.demand > lm.capacity && <p className="post-note">Stade complet : {fmtNum(lm.demand - lm.capacity)} supporters sont restés dehors.</p>}
            </div>
          </section>
        </div>

        <footer className="post-foot">
          <span className={`post-rep ${lm.repDelta >= 0 ? 'up' : 'down'}`}>Réputation {lm.repDelta >= 0 ? '+' : '−'}{fmtRating(Math.abs(lm.repDelta))}</span>
          {onStats && <button className="btn ghost btn-xl" onClick={onStats}>Stats du match</button>}
          <button className="btn btn-xl" onClick={onClose} autoFocus>Continuer</button>
        </footer>
      </article>
    </div>
  );
}
