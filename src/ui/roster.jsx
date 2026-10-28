import React, { useRef } from 'react';
import { POS_LABELS } from '../game/constants';
import { slotOfIndex } from '../game/leagueSeason';
import { Crest } from './crest';
import { fmtMoney, fmtRating } from './format';
import { IconClose } from './icons';
import { divRef } from './kit';
import { heat } from './mercato';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';

// Effectif d'un autre club de la ligue (0.8.8), ouvert depuis le classement : poste, âge, niveau et valeur de chaque
// joueur (s.league.rosters, relus du serveur avec le mercato). Le joueur d'un ami ouvre l'offre, celui d'un club de
// l'ordinateur sa fiche du marché ; un club de l'ordinateur au minimum ne vend personne. Un ami se lit dans ses matchs
// joués : avant le premier, son effectif reste inconnu.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };

export function ClubRoster({ state, index, onClose, onPlayer, blocked = false }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  useKeydown((e) => { if (!blocked && e.key === 'Escape') onClose(); });
  const L = state.league;
  const slot = slotOfIndex(L, index);
  const club = L.clubs.find((c) => c.slot === slot);
  if (!club) return null;
  const rows = [...(L.rosters?.[slot] || [])].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || b.r - a.r);
  const refLvl = divRef(state);
  const order = rows.filter((x) => x.id !== null).map((x) => x.id);
  const value = rows.reduce((a, x) => a + x.v, 0);
  const friend = club.human;
  const open = (x) => (friend ? onPlayer({ id: x.id, renew: true }) : onPlayer({ id: x.id, order }));
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass roster" onClick={(e) => e.stopPropagation()} aria-label={`Effectif de ${club.name}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="eyebrow">{friend ? `Club de ${club.pseudo || 'ton ami'}` : 'Club de l’ordinateur'}</span>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>
        <section className="ro-head">
          <Crest name={club.name} className="ro-crest" />
          <div>
            <h3>{club.name}</h3>
            <span>{rows.length ? `${rows.length} joueur${rows.length > 1 ? 's' : ''} · valeur ${fmtMoney(value)}` : 'Effectif inconnu'}</span>
          </div>
        </section>
        {rows.length === 0 ? (
          <p className="mc-hint">{friend ? 'L’effectif d’un ami se découvre avec ses matchs : il s’affichera après son premier match joué.' : 'Effectif indisponible pour l’instant.'}</p>
        ) : (
          <>
            {!friend && order.length === 0 && <p className="mc-hint">Effectif au minimum : ce club ne vend personne pour l’instant.</p>}
            <ul className="mc-rows ro-rows">
              {rows.map((x, k) => (
                <li key={`${x.n}-${k}`} className={`mc-row ${x.id === null ? 'muted' : ''}`}>
                  <span className={`mc-medal sm ${heat(x.r, refLvl)}`}><b>{fmtRating(x.r)}</b><span>{x.pos}</span></span>
                  <span className="mc-row-main"><b>{x.n}</b><em>{POS_LABELS[x.pos]} · {x.age} ans</em></span>
                  <span className="mc-amount"><b>{fmtMoney(x.v)}</b><em>valeur</em></span>
                  {x.id !== null && (
                    <button className={`btn btn-sm ${friend ? '' : 'ghost'}`} onClick={() => open(x)}>{friend ? 'Faire une offre' : 'Sa fiche'}</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
