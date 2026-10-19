import React, { useEffect, useState } from 'react';
import { FootOFFLockup } from './brand';

// Écran de chargement de l'Empire : logo, progression réelle des modèles 3D, étape en cours et une astuce de
// jeu qui change toutes les quelques secondes. La même mise en page existe en HTML pur dans index.html, pour
// l'instant où le code du jeu n'est pas encore arrivé : on passe de l'un à l'autre sans saut.

const TIPS = [
  'Un stade plus grand accueille plus de spectateurs : billetterie, buvette et boutique en profitent.',
  'Former un jeune puis le revendre une fois progressé rapporte ; acheter et revendre aussitôt fait perdre de l’argent.',
  'Les deux premiers montent, les deux derniers descendent : chaque point compte.',
  'À la mi-temps, change de tactique ou fais entrer un remplaçant pour renverser le match.',
  'L’espace supporters remplit mieux le stade et augmente la réputation gagnée à chaque match.',
  'La zone des partenaires rapporte même quand tu n’es pas là.',
  'L’académie révèle un jeune talent à fort potentiel à chaque fin de saison.',
  'Surveille la part des salaires dans tes revenus : c’est elle qui fait basculer une saison dans le rouge.',
  'Avant le match, « Meilleur onze » aligne d’un geste ta meilleure équipe.',
];

const stepOf = (p) => (p < 0.34 ? 'Ouverture des grilles' : p < 0.75 ? 'Mise en place des tribunes' : p < 1 ? 'Dernier coup de tondeuse' : 'Coup d’envoi');

// progress : null tant que la scène n'a pas commencé à charger (barre en attente), puis de 0 à 1.
export function LoadingScreen({ progress = null }) {
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4500);
    return () => clearInterval(t);
  }, []);
  const waiting = progress === null;
  const pct = waiting ? 0 : Math.round(progress * 100);
  return (
    <div className="loading" role="status" aria-label={waiting ? 'Chargement de l’Empire' : `Chargement de l’Empire, ${pct} %`}>
      <div className="loading-inner">
        <FootOFFLockup sub="Empire" size="lg" />
        <div className="loading-progress">
          <div className={`loading-bar ${waiting ? 'wait' : ''}`}>
            <i style={waiting ? undefined : { transform: `scaleX(${Math.max(0.04, progress)})` }} />
          </div>
          <div className="loading-meta">
            <span>{waiting ? 'Chargement…' : `${stepOf(progress)}${progress < 1 ? '…' : ' !'}`}</span>
            {!waiting && <b>{pct} %</b>}
          </div>
        </div>
        <p className="loading-tip" key={tip}><span className="eyebrow">Astuce</span>{TIPS[tip]}</p>
      </div>
    </div>
  );
}
