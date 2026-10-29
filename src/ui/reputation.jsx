import React from 'react';
import { Panel } from './panels';
import { SectionHead } from './kit';
import { ClubCrest } from './crest';
import { IconStar } from './icons';
import { fmtRating } from './format';
import { REP_LEVELS, repLevel } from '../game/reputation';
import { repEffects } from '../game/economy';
import { clubStars } from '../game/crest';
import { t, tr } from '../i18n/index';

// Panneau Notoriété (bouton étoile du HUD) : statut du club, ce que la réputation apporte aujourd'hui (comparé à la
// fondation), les statuts, et comment la faire grandir. Rien n'y est verrouillé : la réputation attire, elle ne
// ferme rien (reputation.js).

const flat = (x) => Math.abs(x) < 0.005; // moins d'un demi-point : effet nul pour l'instant
const pct = (x) => (flat(x) ? '0 %' : `${x > 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)} %`);
const tone = (x) => (flat(x) ? '' : x > 0 ? 'up' : 'down');

export function ReputationPanel({ state, onClose }) {
  const rep = state.reputation;
  const rl = repLevel(rep);
  const fx = repEffects(rep);
  const fans = state.buildings.fans || 0;
  const mult = 1 + fans * 0.1;
  const effects = [
    [fx.crowd, t('Public au stade'), t('Les gens se déplacent pour un club qui compte.')],
    [fx.shop, t('Boutique'), t('Maillots et écharpes se vendent mieux.')],
    [fx.sponsors, t('Sponsors'), t('Contrats de sponsoring mieux payés chaque saison.')],
    [fx.mercato, t('Mercato'), flat(fx.mercato) ? t('Ni avantage ni handicap pour l’instant : les vendeurs écouteront mieux un club réputé.')
      : fx.mercato > 0 ? t('Les vendeurs écoutent plus volontiers un club réputé : prix plus bas.') : t('Club encore peu connu : les vendeurs se montrent un peu plus durs.'), true],
  ];
  return (
    <Panel id="reputation" title={t('Notoriété du club')} eyebrow={t('Réputation {fmtRating}', { fmtRating: fmtRating(rep) })} onClose={onClose}>
      <section className="rp-head">
        <ClubCrest crest={state.crest} name={state.clubName} className="rp-crest" full stars={clubStars(state)} />
        <div className="rp-score">
          <span className="rp-value"><IconStar /> {fmtRating(rep)}</span>
          <strong>{rl.level.name}</strong>
          <span className="rp-bar"><i style={{ width: `${rl.progress * 100}%` }} /></span>
          <span className="rp-next">{rl.next ? t('Prochain statut : {name}, à {min} de réputation', { name: rl.next.name, min: rl.next.min }) : t('Le statut le plus haut : ton club est une légende.')}</span>
        </div>
      </section>

      <SectionHead label={t('Ce qu’elle t’apporte')} aside={t('par rapport à la fondation')} />
      <ul className="rp-effects">
        {effects.map(([v, label, hint, price]) => (
          <li key={label}>
            <b className={tone(v)}>{price ? (flat(v) ? '0 %' : `${v > 0 ? '−' : '+'}${Math.round(Math.abs(v) * 100)} %`) : pct(v)}</b>
            <span><strong>{label}</strong><em>{hint}</em></span>
          </li>
        ))}
      </ul>

      <SectionHead label={t('Les statuts du club')} />
      <ol className="rp-levels">
        {REP_LEVELS.map((l, i) => (
          <li key={l.name} className={i < rl.index ? 'done' : i === rl.index ? 'on' : ''}>
            <b>{l.min}</b><span>{l.name}</span>
          </li>
        ))}
      </ol>

      <SectionHead label={t('La faire grandir')} />
      <ul className="rp-how">
        <li><strong>{t('Chaque match')}</strong><span>{tr('Victoire +<0/> · nul +<1/> · défaite −<2/><3/>. En coupe ×1,2, en Coupe d’Europe ×1,6.', [fmtRating(mult), fmtRating(0.2 * mult), fmtRating(0.6 * mult), fans ? t(' (espace supporters niveau {fans} : +{v} %)', { fans, v: fans * 10 }) : t(' (l’espace supporters les augmente)')])}</span></li>
        <li><strong>{t('Fin de saison')}</strong><span>{t('Montée +4 · titre de champion +3 · descente −3.')}</span></li>
        <li><strong>{t('Trophées')}</strong><span>{t('Coupe nationale +3 · Coupe d’Europe +6.')}</span></li>
      </ul>
    </Panel>
  );
}
