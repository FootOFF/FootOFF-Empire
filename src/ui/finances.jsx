import React from 'react';
import { DIVISIONS, divisionOf } from '../game/constants';
import { endOfSeasonForecast, seasonForecast } from '../game/economy';
import { EXPENSE, INCOME, totals } from '../game/ledger';
import { wageOf } from '../game/players';
import { standingsOf } from '../game/season';
import { ordinal } from '../game/utils';
import { fmtEuros, fmtMoney } from './format';
import { SectionHead, Stat } from './kit';
import { Panel } from './panels';
import { t, tn, tr } from '../i18n/index';

// Finances : où va l'argent du club. La caisse, ce qu'il faudra payer au bilan (salaires et entretien, dus journée après
// journée et payés en une fois en fin de saison) et ce qui reste réellement disponible ; prévision de fin de saison,
// recettes et dépenses de la saison poste par poste, et trésorerie au fil des saisons.

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtEuros(Math.abs(v))}`;

// Une ligne de compte : libellé, barre proportionnelle au plus gros poste, montant.
function Line({ label, value, max, kind }) {
  return (
    <li className={`fin-line ${kind}`}>
      <span>{label}</span>
      <span className="fin-bar"><i style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></span>
      <b>{kind === 'out' ? '−' : '+'}{fmtEuros(value)}</b>
    </li>
  );
}

// Trésorerie en fin de saison, saison après saison ; la dernière colonne est la trésorerie d'aujourd'hui.
function TreasuryChart({ seasons, now }) {
  const bars = [...seasons.map((p) => ({ label: `${t('S')}${p.season}`, v: p.end })), { label: t('Auj.'), v: now, current: true }];
  const top = Math.max(1, ...bars.map((b) => Math.abs(b.v)));
  return (
    <div className="fin-chart" role="img" aria-label={t('Trésorerie en fin de saison : {join}', { join: bars.map((b) => `${b.label} ${fmtMoney(b.v)}`).join(', ') })}>
      {bars.map((b) => (
        <div key={b.label} className={`fin-col ${b.current ? 'cur' : ''} ${b.v < 0 ? 'neg' : ''}`} title={`${b.label} : ${fmtMoney(b.v)}`}>
          {b.current && <span className="fin-col-v">{fmtMoney(b.v)}</span>}
          <i style={{ height: `${Math.max(3, (Math.abs(b.v) / top) * 100)}%` }} />
          <span className="fin-col-l">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

export function FinancesPanel({ state, onClose, onOpenSquad }) {
  const l = state.ledger || { lines: {}, past: [], start: state.money };
  const standings = standingsOf(state);
  const pos = standings.findIndex((t) => t.i === 0) + 1;
  const wages = state.players.reduce((a, p) => a + wageOf(p, state.divisionIndex), 0);
  const fc = endOfSeasonForecast(state, pos, wages);
  const share = seasonForecast(state, wages).wageShare;
  const now = totals(l.lines);
  const income = INCOME.filter(([k]) => l.lines[k] > 0).map(([k, label]) => ({ k, label, v: l.lines[k] })).sort((a, b) => b.v - a.v);
  const spent = EXPENSE.filter(([k]) => l.lines[k] > 0).map(([k, label]) => ({ k, label, v: l.lines[k] })).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...income.map((x) => x.v), ...spent.map((x) => x.v));
  const shareTone = share > 1 ? 'down' : share > 0.75 ? 'warn' : '';

  return (
    <Panel
      id="finances"
      title={t('Finances')}
      eyebrow={t('Saison {seasonNumber} · {name}', { seasonNumber: state.seasonNumber, name: divisionOf(state).name })}
      onClose={onClose}
      toolbar={(
        <div className="season-stats fin-stats">
          <Stat label={t('Trésorerie')} value={fmtMoney(state.money)} sub={t('disponible {available}', { available: fmtMoney(fc.available) })} tone={state.money < 0 ? 'down' : ''} />
          <Stat label={t('À payer')} value={fmtMoney(fc.due)} sub={t('fin de saison · {owed} déjà dus', { owed: fmtMoney(fc.owed) })} />
          <Stat label={t('Fin de saison')} value={fmtMoney(fc.end)} sub={t('prévision')} tone={fc.end < 0 ? 'down' : ''} />
          <Stat label={t('Salaires')} value={`${Math.round(share * 100)} %`} sub={t('des revenus')} tone={shareTone} />
        </div>
      )}
    >
      <SectionHead label={t('Prévision de fin de saison')} aside={fc.left ? tn(fc.left, '{left} match à jouer', '{left} matchs à jouer', { left: fc.left }, fc.left > 1) : t('saison terminée')} />
      <ul className="fin-flow">
        <li><span>{tr('Trésorerie actuelle <0/>', [<em>{fc.owed ? t('dont {owed} déjà dus en salaires et entretien · ', { owed: fmtEuros(fc.owed) }) : ''}{fc.available < 0 ? t('il manque {v}', { v: fmtEuros(-fc.available) }) : t('{available} disponibles', { available: fmtEuros(fc.available) })}</em>])}</span><b>{fmtEuros(state.money)}</b></li>
        {fc.left > 0 && (
          <li className="in">
            <span>{tr('Matchs restants <0/>', [<em>{fc.homes < fc.left ? t('{homes} à domicile, {v} à l’extérieur (droits TV)', { homes: fc.homes, v: fc.left - fc.homes }) : t('{left} × environ {perMatch}', { left: fc.left, perMatch: fmtEuros(fc.perMatch) })}</em>])}</span>
            <b>{signed(fc.matches)}</b>
          </li>
        )}
        <li className="in"><span>{tr('Sponsors <0/>', [<em>{fc.sponsorsPaid ? t('{v} reçus à la reprise', { v: fmtEuros(state.seasonStats?.sponsors || 0) }) : t('versés au bilan')}</em>])}</span><b>{fc.sponsorsPaid ? t('déjà en caisse') : signed(fc.sponsors)}</b></li>
        <li className="in"><span>{t('Prime de classement ')}<em>{tr('à la <0/> place', [ordinal(pos, true)])}</em></span><b>{signed(fc.prize)}</b></li>
        <li className="out"><span>{t('Salaires de la saison ')}<em>{tr('payés au bilan · <0/>', [fc.left ? tn(fc.left, '{length} joueurs · {left} journée sur {len} à venir', '{length} joueurs · {left} journées sur {len} à venir', { length: state.players.length, left: fc.left, len: fc.len }, fc.left > 1) : t('{len} journées', { len: fc.len })])}</em></span><b>{signed(-fc.wages)}</b></li>
        {fc.upkeep > 0 && <li className="out"><span>{tr('Entretien de la saison <0>payé au bilan</0>', [(c) => <em>{c}</em>])}</span><b>{signed(-fc.upkeep)}</b></li>}
        <li className={`fin-total ${fc.end < 0 ? 'neg' : ''}`}><span>{t('Trésorerie en fin de saison')}</span><b>{fmtEuros(fc.end)}</b></li>
      </ul>
      {fc.end < 0 ? (
        <div className="fin-advice bad">
          <p>{tr('Il manquera <0/> au coup de sifflet final : le conseil vendrait alors tes plus gros salaires. Vends un remplaçant ou allège l’effectif avant.', [<b>{fmtEuros(-fc.end)}</b>])}</p>
          {onOpenSquad && <button className="btn btn-sm ghost" onClick={onOpenSquad}>{t('Voir l’effectif')}</button>}
        </div>
      ) : share > 0.75 ? (
        <div className="fin-advice">
          <p>{tr('Les salaires pèsent <0/> des revenus d’une saison. Au-delà de 75 %, une mauvaise série suffit à finir dans le rouge.', [<b>{Math.round(share * 100)} %</b>])}</p>
        </div>
      ) : null}

      <SectionHead label={t('Cette saison')} aside={now.income || now.expense ? t('résultat {signed}', { signed: signed(now.net) }) : null} />
      {income.length === 0 && spent.length === 0 ? (
        <p className="fin-empty">{t('Rien d’encaissé pour l’instant : billetterie, buvette et boutique tombent à chaque match.')}</p>
      ) : (
        <>
          {income.length > 0 && (
            <ul className="fin-lines">
              {income.map((x) => <Line key={x.k} label={x.label} value={x.v} max={max} kind="in" />)}
            </ul>
          )}
          {spent.length > 0 && (
            <ul className="fin-lines">
              {spent.map((x) => <Line key={x.k} label={x.label} value={x.v} max={max} kind="out" />)}
            </ul>
          )}
          <p className="fin-note">{tr('Salaires et entretien se comptent à chaque journée de championnat (un <0/> de la saison) et se paient en une fois au bilan.', [state.schedule?.length > 7 ? t('quatorzième') : t('septième')])}</p>
        </>
      )}

      {l.past.length > 0 && (
        <>
          <SectionHead label={t('Saisons précédentes')} aside={t('trésorerie en fin de saison')} />
          <TreasuryChart seasons={l.past} now={state.money} />
          <ul className="fin-past">
            {l.past.slice().reverse().map((p) => {
              const t = totals(p.lines);
              return (
                <li key={p.season}>
                  <span>{tr('Saison <0/> <1/>', [p.season, <em>{p.division}</em>])}</span>
                  <b className={t.net < 0 ? 'loss' : 'gain'}>{signed(t.net)}</b>
                  <b>{fmtEuros(p.end)}</b>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
