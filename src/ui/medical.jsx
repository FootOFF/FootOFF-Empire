import React from 'react';
import { DIVISIONS, divisionOf } from '../game/constants';
import { isInjured, playerRating } from '../game/players';
import { injuryCut, treatChance, treatFee, treatOpen, treatPlayer, treatedToday } from '../game/medical';
import { Panel } from './panels';
import { Portrait } from './portrait';
import { Chance } from './direction';
import { fmtMoney, fmtRating } from './format';

// Centre médical (src/game/medical.js) : les joueurs blessés, chacun avec sa blessure, la chance exacte d'un soin et son
// prix ; un soin par joueur et par date. Réponse sur place : réussi (un match d'absence en moins, ou guéri) ou sans
// effet. La prévention (risque de blessure en match) est rappelée en tête.

const matches = (n) => `${n} match${n > 1 ? 's' : ''}`;

export function MedicalView({ state, run, onClose, onBuilding }) {
  const lvl = state.buildings.medical || 0;
  // blessés, et joueurs soignés aujourd'hui (un guéri reste affiché avec sa bonne nouvelle jusqu'au prochain match)
  const list = state.players
    .filter((p) => isInjured(p) || treatedToday(state, p))
    .sort((a, b) => (b.injury?.out || 0) - (a.injury?.out || 0) || playerRating(b) - playerRating(a));
  return (
    <Panel
      id="medical"
      title="Centre médical"
      eyebrow={<>Niveau {lvl} / 5<span className="hide-sm"> · {divisionOf(state).name}</span></>}
      money={state.money}
      onClose={onClose}
      toolbar={(
        <p className="dir-intro">
          L’infirmerie du club : les chances affichées sont celles qui décident.
          {onBuilding && <> <button type="button" className="linkbtn" onClick={onBuilding}>bâtiment</button></>}
        </p>
      )}
    >
      <section className="dir-card med-prev">
        <span className="eyebrow">Prévention</span>
        <p className="dir-big"><b>−{Math.round(injuryCut(lvl) * 100)} %</b> de risque de blessure en match</p>
        <p className="dir-note">Kinés, préparation et récupération : plus le centre grandit, moins tes joueurs se blessent, surtout fatigués.</p>
      </section>
      {list.length === 0 ? (
        <p className="dir-note med-empty">Aucun blessé : tout l’effectif est disponible. Après un match, les blessés apparaissent ici, avec la chance exacte de les soigner.</p>
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
                  <span className="dir-who"><strong>{p.name}</strong><em>{p.pos} · niveau {fmtRating(playerRating(p))}</em></span>
                  <span className="dir-wage"><b>{p.injury ? matches(p.injury.out) : 'Guéri'}</b><em>{p.injury ? p.injury.label.toLowerCase() : 'disponible'}</em></span>
                </div>
                {done ? (
                  <div className={`dir-talk dir-answer ${done.ok ? 'ok' : 'ko'}`} role="status">
                    <strong>{done.ok ? (p.injury ? `Soin réussi : ${first} revient un match plus tôt` : `${first} est guéri`) : 'Soin sans effet'}</strong>
                    <p className="dir-note">
                      {done.ok
                        ? (p.injury ? `Encore ${matches(p.injury.out)} d’absence au lieu de ${done.before}.` : 'Disponible pour le prochain match.')
                        : `La blessure suit son cours : ${matches(p.injury?.out || 0)} d’absence. Nouveau soin possible après le prochain match.`}
                    </p>
                  </div>
                ) : (
                  <div className="dir-talk">
                    <p className="dir-big"><b>{fmtMoney(fee)}</b> le soin · {p.injury.out > 1 ? 'un match d’absence en moins' : 'guéri pour le prochain match'}</p>
                    <Chance value={chance} label="Chance de réussite" />
                    <button type="button" className="btn" disabled={!treatOpen(state, p) || state.money < fee} onClick={() => run((s) => treatPlayer(s, p.id), 'Soin impossible.')}>
                      {state.money < fee ? `Il manque ${fmtMoney(fee - state.money)}` : `Soigner ${first}`}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="dir-note">Un soin par blessé et par date, payé 15 % de son salaire annuel. La chance monte avec le niveau du centre et baisse avec la gravité de la blessure.</p>
    </Panel>
  );
}
