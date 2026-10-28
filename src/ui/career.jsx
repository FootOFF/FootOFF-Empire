import React, { useEffect, useRef } from 'react';
import { POS_LABELS } from '../game/constants';
import { ATTRS, GK_ATTRS } from '../game/players';
import { allCareers, careerOf, topScorers } from '../game/career';
import { fmtMoney, fmtNum, fmtRating } from './format';
import { RatingBadge, divRef, tierOf } from './kit';
import { Portrait } from './portrait';
import { IconClose } from './icons';
import { PHONE, useSwipe } from './gestures';

// Fiche carrière d'un joueur passé par le club (actuel ou ancien) : statut et départ, âge aujourd'hui, niveau,
// totaux au club, saison par saison, plus grands matchs et distinctions. Ouverte depuis les classements et
// records de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et la liste des anciens de l'effectif.

const plural = (n, one, many) => `${fmtNum(n)} ${n > 1 ? many : one}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function departureText(c) {
  const o = c.old;
  if (!o) return `Au club depuis la saison ${c.joined}`;
  if (o.reason === 'retraite') return `Retraite à ${o.age} ans, à la fin de la saison ${o.left}`;
  if (o.reason === 'libre') return `Parti libre à ${o.age} ans, en fin de contrat, à la fin de la saison ${o.left}`;
  if (o.reason === 'conseil') return `Vendu par le conseil (plan de redressement) à ${o.club || 'un autre club'} pour ${fmtMoney(o.fee || 0)}, saison ${o.left}`;
  return `Vendu à ${o.club || 'un autre club'} pour ${fmtMoney(o.fee || 0)}, saison ${o.left}${o.leftRound ? ` (journée ${o.leftRound})` : ''}`;
}
export const reasonTag = (c) => (!c.old ? 'Au club' : c.old.reason === 'retraite' ? 'Retraité' : c.old.reason === 'libre' ? 'Parti libre' : 'Vendu');

export function PlayerCareer({ state, id, onClose, onSheet }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [id]);
  const c = careerOf(state, id);
  if (!c) return null;
  const t = c.totals;
  const p = c.p;
  const [nameFirst, ...nameRest] = p.name.split(' ');
  const keeper = p.pos === 'G' || p.pos === 'D';
  const gk = p.pos === 'G'; // gardien : pas de cases d'attaque
  const scorers = topScorers(allCareers(state));
  const bestSeasons = Object.entries(scorers).filter(([, v]) => v.ids.includes(id)).map(([season, v]) => ({ season: Number(season), goals: v.goals }));
  const awards = [
    ...c.titles.map((h) => `Champion de ${h.division} (saison ${h.season})`),
    ...c.promotions.filter((h) => h.position !== 1).map((h) => `Montée depuis la ${h.division} (saison ${h.season})`),
    ...bestSeasons.map((b) => `Meilleur buteur du club en saison ${b.season} (${plural(b.goals, 'but', 'buts')})`),
    ...(t.motm ? [`Homme du match ${t.motm} fois`] : []),
  ];
  return (
    <div className="sq-overlay cr-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass cr" onClick={(e) => e.stopPropagation()} aria-label={`Carrière de ${p.name}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="cr-title">Carrière au club</span>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>

        {/* même en-tête que la fiche joueur (squad.jsx PlayerSheet) : niveau en grand et sa légende, poste, nom, portrait, étiquettes */}
        <section className={`sh-hero ${tierOf(c.rating, divRef(state))}`}>
          <div className="sh-id">
            <div className="sh-rate">
              <b>{fmtRating(c.rating)}</b>
              <em className="cap">{c.current ? 'niveau / 20' : 'au départ / 20'}</em>
            </div>
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{POS_LABELS[p.pos]}{p.num ? ` · n°${p.num}` : ''}{c.old ? ` · ${c.age} ans aujourd’hui` : ` · ${c.age} ans`}</span>
            </div>
            <h3 className="sh-name">{nameRest.length > 0 && <small>{nameFirst}</small>}<b>{nameRest.length ? nameRest.join(' ') : nameFirst}</b></h3>
          </div>
          <Portrait p={p} size={136} className="sh-face" />
          <div className="sh-tags">
            <span className={`sh-tag ${c.current ? 'on' : ''}`}>{reasonTag(c)}</span>
            <span className="sh-tag">Saisons {c.joined}{c.until > c.joined ? `–${c.until}` : ''}</span>
          </div>
        </section>
        <p className="cr-status">{departureText(c)}.</p>
        {c.current && onSheet && <button className="btn ghost wide cr-sheet" onClick={() => onSheet(id)}>Voir sa fiche joueur</button>}
        {!c.current && (c.old.a || c.old.g) && (
          <section className="sh-sec">
            <span className="sh-cap">Ses qualités au moment du départ</span>
            <div className="cr-attrs">
              {[...(p.pos === 'G' ? GK_ATTRS.map((x) => [x, c.old.g?.[x.key]]) : []), ...ATTRS.map((x) => [x, c.old.a?.[x.key]])]
                .filter(([, v]) => v != null)
                .slice(0, p.pos === 'G' ? 6 : 9)
                .map(([x, v]) => (
                  <div key={x.key}><span>{x.name}</span><i><b style={{ width: `${(v / 20) * 100}%` }} /></i><em>{Math.round(v)}</em></div>
                ))}
            </div>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">Au club</span>
          <div className="cr-tiles">
            <div><b>{fmtNum(t.apps)}</b><span>matchs</span></div>
            {!gk && <div><b>{fmtNum(t.goals)}</b><span>buts</span></div>}
            {!gk && <div><b>{fmtNum(t.assists)}</b><span>passes déc.</span></div>}
            <div><b className="gold">{fmtNum(t.motm)}</b><span>hommes du match</span></div>
            <div><b className={t.avg >= 7 ? 'good' : t.avg !== null && t.avg < 5.5 ? 'low' : ''}>{t.avg !== null ? fmtRating(t.avg) : '–'}</b><span>note moyenne</span></div>
            <div><b>{fmtNum(t.minutes)}</b><span>minutes</span></div>
            {!gk && <div><b>{fmtNum(t.shots)}</b><span>tirs · {pct(t.onTarget, t.shots)} % cadrés</span></div>}
            {!gk && <div><b>{t.shots ? `${pct(t.goals, t.shots)} %` : '–'}</b><span>tirs transformés</span></div>}
            {keeper && <div><b>{fmtNum(t.clean)}</b><span>matchs sans encaisser</span></div>}
            {keeper && <div><b>{t.apps ? `${pct(t.clean, t.apps)} %` : '–'}</b><span>de matchs sans encaisser</span></div>}
            {!gk && <div><b>{t.apps ? fmtRating((t.goals + t.assists) / t.apps) : '–'}</b><span>buts + passes par match</span></div>}
            {!gk && <div><b>{t.goals ? fmtNum(Math.round(t.minutes / t.goals)) : '–'}</b><span>minutes par but</span></div>}
            <div><b>{t.yellow} · {t.red}</b><span>cartons jaunes · rouges</span></div>
          </div>
          <ul className="sp-facts">
            <li><span>Niveau le plus haut</span><b>{fmtRating(c.peak)} / 20</b></li>
            <li><span>Matchs enregistrés en détail</span><b>{c.games}</b></li>
            {c.old && !['retraite', 'libre'].includes(c.old.reason) && <li><span>Montant de la vente</span><b>{fmtMoney(c.old.fee || 0)}</b></li>}
          </ul>
        </section>

        {c.hist.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">Saison par saison</span>
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead><tr><th className="l">Saison</th><th>Âge</th><th>Niv.</th><th>MJ</th><th>Buts</th><th>Passes</th><th>HdM</th><th>Note</th></tr></thead>
                <tbody>
                  {[...c.hist].reverse().map((h) => (
                    <tr key={h.season}>
                      <td className="l"><span className="cr-season">S{h.season}{h.current ? ' · en cours' : ''}</span><em className="cr-div">{h.division || ''}</em></td>
                      <td>{h.age ?? '–'}</td>
                      <td>{h.rating ? fmtRating(h.rating) : '–'}</td>
                      <td>{h.apps}</td>
                      <td>{h.goals || '·'}</td>
                      <td>{h.assists || '·'}</td>
                      <td>{h.motm || '·'}</td>
                      <td>{h.avg ? <RatingBadge value={h.avg} /> : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {c.best.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">Ses plus grands matchs</span>
            <ul className="cr-games">
              {c.best.map(({ m, row }) => (
                <li key={`${m.season}-${m.round}-${m.comp || 'league'}-${m.stage ?? ''}`}>
                  <RatingBadge value={row.rating} />
                  <span className="cr-game-main">
                    <b>{m.gf}–{m.ga}{m.pens ? ` (t.a.b. ${m.pens[0]}–${m.pens[1]})` : ''} contre {m.opp}</b>
                    <em>Saison {m.season} · {m.comp && m.comp !== 'league' && m.label ? m.label : `journée ${m.round}`}{row.goals ? ` · ${plural(row.goals, 'but', 'buts')}` : ''}{row.assists ? ` · ${plural(row.assists, 'passe', 'passes')}` : ''}{m.motm === id ? ' · homme du match' : ''}</em>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">Distinctions</span>
          {awards.length ? <ul className="cr-awards">{awards.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="st-muted">Pas encore de distinction.</p>}
        </section>
      </article>
    </div>
  );
}
