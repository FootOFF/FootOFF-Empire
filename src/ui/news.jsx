import React, { useEffect } from 'react';
import { CHANGELOG, CURRENT } from '../game/changelog';
import { useKeydown } from './presence';
import { uiSound } from './uisound';
import { IconChevronLeft } from './icons';

// Nouveautés : les versions du jeu et ce qu'elles apportent (src/game/changelog.js). Une pastille sur l'entrée du menu
// tant que la version courante n'a pas été lue (stockage local du navigateur) ; l'ouvrir la marque lue.

const KEY = 'fo-seen-version';
export function unseenNews() {
  try { return localStorage.getItem(KEY) !== CURRENT; } catch { return false; }
}
export function markNewsSeen() {
  try { localStorage.setItem(KEY, CURRENT); } catch { /* préférence non conservée */ }
}

export function NewsView({ onBack, active = true }) {
  useKeydown((e) => { if (active && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); uiSound('back'); onBack(); } });
  useEffect(() => { markNewsSeen(); }, []);
  return (
    <div className="cm-rules" role="document" aria-label="Nouveautés">
      <div className="cm-rules-body">
        {CHANGELOG.map((v, i) => (
          <section key={v.version} className={`news-v ${i === 0 ? 'cur' : ''}`}>
            <div className="news-head">
              <span className="news-ver">{v.version}</span>
              <h3>{v.title}</h3>
              <span className="news-date">{v.date}</span>
            </div>
            <ul>{v.items.map((t, k) => <li key={k}>{t}</li>)}</ul>
          </section>
        ))}
      </div>
      <div className="cm-save-actions">
        <button type="button" className="btn ghost" onClick={() => { uiSound('back'); onBack(); }}><IconChevronLeft /> Retour</button>
      </div>
    </div>
  );
}
