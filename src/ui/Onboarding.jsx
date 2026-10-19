import React, { useState } from 'react';
import { randomClubName } from '../game/names';
import { FootOFFLockup } from './brand';

export default function Onboarding({ onCreate }) {
  const [name, setName] = useState(randomClubName());
  return (
    <div className="hero">
      <FootOFFLockup sub="Empire" size="lg" />
      <div className="eyebrow">Saison 1 · Départementale</div>
      <h1>Un terrain de quartier.<br /><em>Un empire</em> à bâtir.</h1>
      <p className="sub">
        Onze joueurs, une idée : bâtir ton univers sportif, saison après saison.
        Construis, forme, recrute et gravis les divisions.
      </p>
      <div className="create">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={26} placeholder="Nom de ton club" />
        <button className="btn ghost" title="Proposer un autre nom" onClick={() => setName(randomClubName())}>↻</button>
        <button className="btn" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>Créer mon club</button>
      </div>
      <div className="rules">
        <div><strong>Construis</strong>Ton complexe grandit secteur par secteur : entraînement, académie, supporters, partenaires.</div>
        <div><strong>Développe</strong>Fais progresser tes talents, déniche les futurs cracks, accomplis l’objectif de saison.</div>
        <div><strong>Gravis</strong>De la Départementale jusqu’à l’Elite, ta réputation ouvre les nouveaux quartiers de ton Empire.</div>
      </div>
      <div className="hero-foot">Un jeu <a href="https://footoff.media" target="_blank" rel="noreferrer">FootOFF Media</a></div>
    </div>
  );
}
