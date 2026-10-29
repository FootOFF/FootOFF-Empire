import React from 'react';
import { DIVISIONS, divisionOf } from '../game/constants';
import { isInjured, playerRating } from '../game/players';
import { injuryCut, treatChance, treatFee, treatOpen, treatPlayer, treatedToday } from '../game/medical';
import { Panel } from './panels';
import { Portrait } from './portrait';
import { Chance } from './direction';
import { fmtMoney, fmtRating } from './format';
import { t, tn, tr } from '../i18n/index';

// Centre médical (src/game/medical.js) : les joueurs blessés, chacun avec sa blessure, la chance exacte d'un soin et son
// prix ; un soin par joueur et par date. Réponse sur place : réussi (un match d'absence en moins, ou guéri) ou sans
// effet. La prévention (risque de blessure en match) est rappelée en tête.

const matches = (n) => tn(n, '{n} match', '{n} matchs', { n }, n > 1);

export function MedicalView({ state, run, onClose, onBuilding }) {
  const lvl = state.buildings.medical || 0;
  // blessés, et joueurs soignés aujourd'hui (un guéri reste affiché avec sa bonne nouvelle jusqu'au prochain match)
  const list = state.players
    .filter((p) => isInjured(p) || treatedToday(state, p))
    .sort((a, b) => (b.injury?.out || 0) - (a.injury?.out || 0) || playerRating(b) - playerRating(a));
  return (
    <Panel
      id="medical"
      title={t('Centre médical')}
      eyebrow={<>{t('Niveau ')}{lvl} / 5<span className="hide-sm"> · {divisionOf(state).name}</span></>}
      money={state.money}
      onClose={onClose}
      toolbar={(
        <p className="dir-intro">{tr('L’infirmerie du club : les chances affichées sont celles qui décident.<0/>', [onBuilding && <> <button type="button" className="linkbtn" onClick={onBuilding}>{t('bâtiment')}</button></>])}</p>
      )}
    >
      <section className="dir-card med-prev">
        <span className="eyebrow">{t('Prévention')}</span>
        <p className="dir-big">{tr('<0/> de risque de blessure en match', [<b>−{Math.round(injuryCut(lvl) * 100)} %</b>])}</p>
        <p className="dir-note">{t('Kinés, préparation et récupération : plus le centre grandit, moins tes joueurs se blessent, surtout fatigués.')}</p>
      </section>
      {list.length === 0 ? (
        <p className="dir-note med-empty">{t('Aucun blessé : tout l’effectif est disponible. Après un match, les blessés apparaissent ici, avec la chance exacte de les soigner.')}</p>
      ) : (
        <ul className="dir-list med-list">
          {list.map((p) => {
            const done = treatedToday(state, p) ? p.treated : null;
            const fee = treatFee(state, p);
            const chance = treatChance(state, p);
            const first = p.name.split(' ')[0];
            return (
              <li key={p.id} className={`med-card ${p.injury ? '' : 'cured'}`}>
                <div className="dir-row med-head">
                  <Portrait p={p} size={34} />
                  <span className="dir-who"><strong>{p.name}</strong><em>{tr('<0/> · niveau <1/>', [p.pos, fmtRating(playerRating(p))])}</em></span>
                  <span className="dir-wage"><b>{p.injury ? matches(p.injury.out) : t('Guéri')}</b><em>{p.injury ? p.injury.label.toLowerCase() : t('disponible')}</em></span>
                </div>
                {done ? (
                  <div className={`dir-talk dir-answer ${done.ok ? 'ok' : 'ko'}`} role="status">
                    <strong>{done.ok ? (p.injury ? t('Soin réussi : {first} revient un match plus tôt', { first }) : t('{first} est guéri', { first })) : t('Soin sans effet')}</strong>
                    <p className="dir-note">
                      {done.ok
                        ? (p.injury ? t('Encore {matches} d’absence au lieu de {before}.', { matches: matches(p.injury.out), before: done.before }) : t('Disponible pour le prochain match.'))
                        : t('La blessure suit son cours : {matches} d’absence. Nouveau soin possible après le prochain match.', { matches: matches(p.injury?.out || 0) })}
                    </p>
                  </div>
                ) : (
                  <div className="dir-talk">
                    <p className="dir-big">{tr('<0/> le soin · <1/>', [<b>{fmtMoney(fee)}</b>, tn(p.injury.out, 'guéri pour le prochain match', 'un match d’absence en moins', {}, p.injury.out > 1)])}</p>
                    <Chance value={chance} label={t('Chance de réussite')} />
                    <button type="button" className="btn" disabled={!treatOpen(state, p) || state.money < fee} onClick={() => run((s) => treatPlayer(s, p.id), t('Soin impossible.'))}>
                      {state.money < fee ? t('Il manque {v}', { v: fmtMoney(fee - state.money) }) : t('Soigner {first}', { first })}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="dir-note">{t('Un soin par blessé et par date, payé 15 % de son salaire annuel. La chance monte avec le niveau du centre et baisse avec la gravité de la blessure.')}</p>
    </Panel>
  );
}
