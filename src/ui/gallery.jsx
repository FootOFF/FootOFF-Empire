import React, { useState } from 'react';
import { SCREENS } from './preview';
import { FootOFFLockup } from './brand';

// Galerie d'écrans : chaque écran du jeu, avec des données fictives, sur téléphone et sur PC.
// Sert à relire alignements, tailles et marges d'un coup d'œil. La sauvegarde n'est jamais touchée.

const SIZES = {
  phone: { w: 390, h: 844, label: 'Téléphone · 390 × 844' },
  tablet: { w: 820, h: 1180, label: 'Tablette · 820 × 1180' },
  desktop: { w: 1280, h: 720, label: 'PC · 1280 × 720' },
};

function Frame({ screen, size, scale }) {
  const { w, h, label } = SIZES[size];
  return (
    <figure className="gal-frame">
      <div className="gal-viewport" style={{ width: w * scale, height: h * scale }}>
        <iframe
          title={`${screen} · ${label}`}
          src={`${window.location.pathname}?ecran=${screen}`}
          loading="lazy"
          style={{ width: w, height: h, transform: `scale(${scale})` }}
        />
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function Gallery() {
  const [sizes, setSizes] = useState(['phone', 'desktop']);
  const [only, setOnly] = useState('all');
  const toggle = (k) => setSizes((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const list = only === 'all' ? SCREENS : SCREENS.filter(([id]) => id === only);
  return (
    <div className="gallery">
      <header className="gal-head">
        <FootOFFLockup sub="Empire" />
        <div>
          <h1>Galerie d’écrans</h1>
          <p>Données fictives · la sauvegarde n’est pas touchée · chaque vignette est le vrai jeu, à la taille indiquée.</p>
        </div>
        <div className="gal-tools">
          {Object.entries(SIZES).map(([k, v]) => (
            <button key={k} className={`chipbtn ${sizes.includes(k) ? 'on' : ''}`} onClick={() => toggle(k)}>{v.label.split(' · ')[0]}</button>
          ))}
          <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="Écran">
            <option value="all">Tous les écrans</option>
            {SCREENS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      </header>
      {list.map(([id, name]) => (
        <section key={id} className="gal-row">
          <h2><span>{name}</span><a href={`?ecran=${id}`} target="_blank" rel="noreferrer">Ouvrir en grand ↗</a></h2>
          <div className="gal-frames">
            {sizes.includes('phone') && <Frame screen={id} size="phone" scale={0.5} />}
            {sizes.includes('tablet') && <Frame screen={id} size="tablet" scale={0.36} />}
            {sizes.includes('desktop') && <Frame screen={id} size="desktop" scale={0.5} />}
          </div>
        </section>
      ))}
    </div>
  );
}
