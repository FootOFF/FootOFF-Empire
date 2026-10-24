import React from 'react';
import { Panel } from './panels';
import { SectionHead } from './kit';
import { ClubCrest } from './crest';
import { IconStar } from './icons';
import { fmtRating } from './format';
import { REP_LEVELS, repLevel } from '../game/reputation';
import { repEffects } from '../game/economy';
import { clubStars } from '../game/crest';

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
    [fx.crowd, 'Public au stade', 'Les gens se déplacent pour un club qui compte.'],
    [fx.shop, 'Boutique', 'Maillots et écharpes se vendent mieux.'],
    [fx.sponsors, 'Sponsors', 'Contrats de sponsoring mieux payés chaque saison.'],
    [fx.mercato, 'Mercato', flat(fx.mercato) ? 'Ni avantage ni handicap pour l’instant : les vendeurs écouteront mieux un club réputé.'
      : fx.mercato > 0 ? 'Les vendeurs écoutent plus volontiers un club réputé : prix plus bas.' : 'Club encore peu connu : les vendeurs se montrent un peu plus durs.', true],
  ];
  return (
    <Panel id="reputation" title="Notoriété du club" eyebrow={`Réputation ${fmtRating(rep)}`} onClose={onClose}>
      <section className="rp-head">
        <ClubCrest crest={state.crest} name={state.clubName} className="rp-crest" full stars={clubStars(state)} />
        <div className="rp-score">
          <span className="rp-value"><IconStar /> {fmtRating(rep)}</span>
          <strong>{rl.level.name}</strong>
          <span className="rp-bar"><i style={{ width: `${rl.progress * 100}%` }} /></span>
          <span className="rp-next">{rl.next ? `Prochain statut : ${rl.next.name}, à ${rl.next.min} de réputation` : 'Le statut le plus haut : ton club est une légende.'}</span>
        </div>
      </section>

      <SectionHead label="Ce qu’elle t’apporte" aside="par rapport à la fondation" />
      <ul className="rp-effects">
        {effects.map(([v, label, hint, price]) => (
          <li key={label}>
            <b className={tone(v)}>{price ? (flat(v) ? '0 %' : `${v > 0 ? '−' : '+'}${Math.round(Math.abs(v) * 100)} %`) : pct(v)}</b>
            <span><strong>{label}</strong><em>{hint}</em></span>
          </li>
        ))}
      </ul>

      <SectionHead label="Les statuts du club" />
      <ol className="rp-levels">
        {REP_LEVELS.map((l, i) => (
          <li key={l.name} className={i < rl.index ? 'done' : i === rl.index ? 'on' : ''}>
            <b>{l.min}</b><span>{l.name}</span>
          </li>
        ))}
      </ol>

      <SectionHead label="La faire grandir" />
      <ul className="rp-how">
        <li><strong>Chaque match</strong><span>Victoire +{fmtRating(mult)} · nul +{fmtRating(0.2 * mult)} · défaite −{fmtRating(0.6 * mult)}{fans ? ` (espace supporters niveau ${fans} : +${fans * 10} %)` : ' (l’espace supporters les augmente)'}. En coupe ×1,2, en Coupe d’Europe ×1,6.</span></li>
        <li><strong>Fin de saison</strong><span>Montée +4 · titre de champion +3 · descente −3.</span></li>
        <li><strong>Trophées</strong><span>Coupe nationale +3 · Coupe d’Europe +6.</span></li>
      </ul>
    </Panel>
  );
}
