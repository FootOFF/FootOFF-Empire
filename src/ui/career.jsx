import React, { useEffect, useRef } from 'react';
import { ofDiv } from '../game/cups';
import { POS_LABELS } from '../game/constants';
import { ATTRS, GK_ATTRS } from '../game/players';
import { allCareers, careerOf, topScorers } from '../game/career';
import { fmtMoney, fmtNum, fmtRating } from './format';
import { RatingBadge, divRef, tierOf } from './kit';
import { Portrait } from './portrait';
import { IconClose } from './icons';
import { PHONE, useSwipe } from './gestures';
// nombres au format de la langue (1 234)
const plural = (n, one, many) => pluralRaw(n, one, many, fmtNum(n));
import { plural as pluralRaw, t, tr } from '../i18n/index';

// Fiche carrière d'un joueur passé par le club (actuel ou ancien) : statut et départ, âge aujourd'hui, niveau,
// totaux au club, saison par saison, plus grands matchs et distinctions. Ouverte depuis les classements et
// records de l'onglet Stats, le Stats Pass d'un match, la fiche joueur et la liste des anciens de l'effectif.


const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function departureText(c) {
  const o = c.old;
  if (!o) return t('Au club depuis la saison {joined}', { joined: c.joined });
  if (o.reason === 'retraite') return t('Retraite à {age} ans, à la fin de la saison {left}', { age: o.age, left: o.left });
  if (o.reason === 'libre') return t('Parti libre à {age} ans, en fin de contrat, à la fin de la saison {left}', { age: o.age, left: o.left });
  if (o.reason === 'conseil') return t('Vendu par le conseil (plan de redressement) à {v} pour {v2}, saison {left}', { v: o.club || t('un autre club'), v2: fmtMoney(o.fee || 0), left: o.left });
  return t('Vendu à {v} pour {v2}, saison {left}{v3}', { v: o.club || t('un autre club'), v2: fmtMoney(o.fee || 0), left: o.left, v3: o.leftRound ? t(' (journée {leftRound})', { leftRound: o.leftRound }) : '' });
}
export const reasonTag = (c) => (!c.old ? t('Au club') : c.old.reason === 'retraite' ? t('Retraité') : c.old.reason === 'libre' ? t('Parti libre') : t('Vendu'));

export function PlayerCareer({ state, id, onClose, onSheet }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [id]);
  const c = careerOf(state, id);
  if (!c) return null;
  const row = c.totals;
  const p = c.p;
  const [nameFirst, ...nameRest] = p.name.split(' ');
  const keeper = p.pos === 'G' || p.pos === 'D';
  const gk = p.pos === 'G'; // gardien : pas de cases d'attaque
  const scorers = topScorers(allCareers(state));
  const bestSeasons = Object.entries(scorers).filter(([, v]) => v.ids.includes(id)).map(([season, v]) => ({ season: Number(season), goals: v.goals }));
  const awards = [
    ...c.titles.map((h) => t('Champion {ofDiv} (saison {season})', { ofDiv: ofDiv(h.division), season: h.season })),
    ...c.promotions.filter((h) => h.position !== 1).map((h) => t('Montée depuis la {division} (saison {season})', { division: h.division, season: h.season })),
    ...bestSeasons.map((b) => t('Meilleur buteur du club en saison {season} ({plural})', { season: b.season, plural: plural(b.goals, 'but', 'buts') })),
    ...(row.motm ? [t('Homme du match {motm} fois', { motm: row.motm })] : []),
  ];
  return (
    <div className="sq-overlay cr-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass cr" onClick={(e) => e.stopPropagation()} aria-label={t('Carrière de {name}', { name: p.name })}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="cr-title">{t('Carrière au club')}</span>
          <button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button>
        </header>

        {/* même en-tête que la fiche joueur (squad.jsx PlayerSheet) : niveau en grand et sa légende, poste, nom, portrait, étiquettes */}
        <section className={`sh-hero ${tierOf(c.rating, divRef(state))}`}>
          <div className="sh-id">
            <div className="sh-rate">
              <b>{fmtRating(c.rating)}</b>
              <em className="cap">{c.current ? t('niveau / 20') : t('au départ / 20')}</em>
            </div>
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{POS_LABELS[p.pos]}{p.num ? ` · ${t('n°')}${p.num}` : ''}{c.old ? t(' · {age} ans aujourd’hui', { age: c.age }) : t(' · {age} ans', { age: c.age })}</span>
            </div>
            <h3 className="sh-name">{nameRest.length > 0 && <small>{nameFirst}</small>}<b>{nameRest.length ? nameRest.join(' ') : nameFirst}</b></h3>
          </div>
          <Portrait p={p} size={136} className="sh-face" />
          <div className="sh-tags">
            <span className={`sh-tag ${c.current ? 'on' : ''}`}>{reasonTag(c)}</span>
            <span className="sh-tag">{tr('Saisons <0/><1/>', [c.joined, c.until > c.joined ? `–${c.until}` : ''])}</span>
          </div>
        </section>
        <p className="cr-status">{departureText(c)}.</p>
        {c.current && onSheet && <button className="btn ghost wide cr-sheet" onClick={() => onSheet(id)}>{t('Voir sa fiche joueur')}</button>}
        {!c.current && (c.old.a || c.old.g) && (
          <section className="sh-sec">
            <span className="sh-cap">{t('Ses qualités au moment du départ')}</span>
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
          <span className="sh-cap">{t('Au club')}</span>
          <div className="cr-tiles">
            <div><b>{fmtNum(row.apps)}</b><span>{t('matchs')}</span></div>
            {!gk && <div><b>{fmtNum(row.goals)}</b><span>{t('buts')}</span></div>}
            {!gk && <div><b>{fmtNum(row.assists)}</b><span>{t('passes déc.')}</span></div>}
            <div><b className="gold">{fmtNum(row.motm)}</b><span>{t('hommes du match')}</span></div>
            <div><b className={row.avg >= 7 ? 'good' : row.avg !== null && row.avg < 5.5 ? 'low' : ''}>{row.avg !== null ? fmtRating(row.avg) : '–'}</b><span>{t('note moyenne')}</span></div>
            <div><b>{fmtNum(row.minutes)}</b><span>{t('minutes')}</span></div>
            {!gk && <div><b>{fmtNum(row.shots)}</b><span>{tr('tirs · <0/> % cadrés', [pct(row.onTarget, row.shots)])}</span></div>}
            {!gk && <div><b>{row.shots ? `${pct(row.goals, row.shots)} %` : '–'}</b><span>{t('tirs transformés')}</span></div>}
            {keeper && <div><b>{fmtNum(row.clean)}</b><span>{t('matchs sans encaisser')}</span></div>}
            {keeper && <div><b>{row.apps ? `${pct(row.clean, row.apps)} %` : '–'}</b><span>{t('de matchs sans encaisser')}</span></div>}
            {!gk && <div><b>{row.apps ? fmtRating((row.goals + row.assists) / row.apps) : '–'}</b><span>{t('buts + passes par match')}</span></div>}
            {!gk && <div><b>{row.goals ? fmtNum(Math.round(row.minutes / row.goals)) : '–'}</b><span>{t('minutes par but')}</span></div>}
            <div><b>{row.yellow} · {row.red}</b><span>{t('cartons jaunes · rouges')}</span></div>
          </div>
          <ul className="sp-facts">
            <li><span>{t('Niveau le plus haut')}</span><b>{fmtRating(c.peak)} / 20</b></li>
            <li><span>{t('Matchs enregistrés en détail')}</span><b>{c.games}</b></li>
            {c.old && !['retraite', 'libre'].includes(c.old.reason) && <li><span>{t('Montant de la vente')}</span><b>{fmtMoney(c.old.fee || 0)}</b></li>}
          </ul>
        </section>

        {c.hist.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">{t('Saison par saison')}</span>
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead><tr><th className="l">{t('Saison')}</th><th>{t('Âge')}</th><th>{t('Niv.')}</th><th>{t('MJ')}</th><th>{t('Buts')}</th><th>{t('Passes')}</th><th>{t('HdM')}</th><th>{t('Note')}</th></tr></thead>
                <tbody>
                  {[...c.hist].reverse().map((h) => (
                    <tr key={h.season}>
                      <td className="l"><span className="cr-season">{t('S')}{h.season}{h.current ? t(' · en cours') : ''}</span><em className="cr-div">{h.division || ''}</em></td>
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
            <span className="sh-cap">{t('Ses plus grands matchs')}</span>
            <ul className="cr-games">
              {c.best.map(({ m, row }) => (
                <li key={`${m.season}-${m.round}-${m.comp || 'league'}-${m.stage ?? ''}`}>
                  <RatingBadge value={row.rating} />
                  <span className="cr-game-main">
                    <b>{tr('<0/>–<1/><2/> contre <3/>', [m.gf, m.ga, m.pens ? t(' (t.a.b. {a}–{b})', { a: m.pens[0], b: m.pens[1] }) : '', m.opp])}</b>
                    <em>{tr('Saison <0/> · <1/><2/><3/><4/>', [m.season, m.comp && m.comp !== 'league' && m.label ? m.label : t('journée {round}', { round: m.round }), row.goals ? ` · ${plural(row.goals, 'but', 'buts')}` : '', row.assists ? ` · ${plural(row.assists, 'passe', 'passes')}` : '', m.motm === id ? t(' · homme du match') : ''])}</em>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">{t('Distinctions')}</span>
          {awards.length ? <ul className="cr-awards">{awards.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="st-muted">{t('Pas encore de distinction.')}</p>}
        </section>
      </article>
    </div>
  );
}
