import React, { useRef } from 'react';
import { slotOfIndex } from '../game/leagueSeason';
import { Crest } from './crest';
import { fmtMoney } from './format';
import { IconClose } from './icons';
import { divRef } from './kit';
import { RosterRows, sortRoster } from './mercato';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { t, tn } from '../i18n/index';

// Effectif d'un autre club de la ligue (0.8.8), ouvert depuis le classement : poste, âge, niveau et valeur de chaque
// joueur (s.league.rosters, relus du serveur avec le mercato). Le joueur d'un ami ouvre l'offre, celui d'un club de
// l'ordinateur sa fiche du marché ; un club de l'ordinateur au minimum ne vend personne. Un ami se lit dans ses matchs
// joués, et avant le premier dans son effectif de départ ou de la saison passée (1.0.2, leagueMercato).

export function ClubRoster({ state, index, onClose, onPlayer, blocked = false }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  useKeydown((e) => { if (!blocked && e.key === 'Escape') onClose(); });
  const L = state.league;
  const slot = slotOfIndex(L, index);
  const club = L.clubs.find((c) => c.slot === slot);
  if (!club) return null;
  const rows = sortRoster(L.rosters?.[slot]);
  const refLvl = divRef(state);
  const order = rows.filter((x) => x.id !== null).map((x) => x.id);
  const value = rows.reduce((a, x) => a + x.v, 0);
  const friend = club.human;
  const open = (x) => (friend ? onPlayer({ id: x.id, renew: true }) : onPlayer({ id: x.id, order }));
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass roster" onClick={(e) => e.stopPropagation()} aria-label={t('Effectif de {name}', { name: club.name })}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="eyebrow">{friend ? t('Club de {v}', { v: club.pseudo || t('ton ami') }) : t('Club de l’ordinateur')}</span>
          <button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button>
        </header>
        <section className="ro-head">
          <Crest name={club.name} className="ro-crest" />
          <div>
            <h3>{club.name}</h3>
            <span>{rows.length ? tn(rows.length, '{length} joueur · valeur {value}', '{length} joueurs · valeur {value}', { length: rows.length, value: fmtMoney(value) }, rows.length > 1) : t('Effectif inconnu')}</span>
          </div>
        </section>
        {rows.length === 0 ? (
          <p className="mc-hint">{friend ? t('L’effectif d’un ami se découvre avec ses matchs : il s’affichera après son premier match joué.') : t('Effectif indisponible pour l’instant.')}</p>
        ) : (
          <>
            {!friend && order.length === 0 && <p className="mc-hint">{t('Effectif au minimum : ce club ne vend personne pour l’instant.')}</p>}
            <RosterRows rows={rows} refLvl={refLvl} ghost={!friend} onOpen={open} label={() => (friend ? t('Faire une offre') : t('Sa fiche'))} />
          </>
        )}
      </article>
    </div>
  );
}
