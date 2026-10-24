import React, { createContext, useContext, useEffect, useRef } from 'react';
import { IconLock } from './icons';
import { uiSound } from './uisound';

// Navigation du jeu : cinq sections au menu du bas (Complexe, Équipe, Mercato, Saison, Club). Chaque panneau
// appartient à une section ; son en-tête porte le nom de la section et, en onglets, les écrans voisins de la même
// section (Équipe : Joueurs, Composition, Entraînement, Académie, Anciens). Un onglet est un panneau, ou un panneau
// ouvert sur un de ses onglets internes (« squad:lineup » : l'Effectif sur la Composition).

export const SECTIONS = {
  equipe: {
    title: 'Équipe',
    items: [
      ['squad:players', 'Joueurs'],
      ['squad:lineup', 'Composition'],
      ['training', 'Entraînement'],
      ['academy', 'Académie'],
      ['squad:alumni', 'Anciens'],
    ],
  },
  mercato: {
    title: 'Mercato',
    items: [
      ['mercato:buy', 'Recruter'],
      ['mercato:watch', 'Suivis'],
      ['mercato:offers', 'Offres'],
      ['mercato:log', 'Bilan'],
    ],
  },
  saison: {
    title: 'Saison',
    items: [
      ['season:calendar', 'Calendrier'],
      ['season:table', 'Classement'],
      ['stats', 'Statistiques'],
      ['trophies', 'Palmarès'],
    ],
  },
  club: {
    title: 'Club',
    items: [
      ['finances', 'Finances'],
      ['journal', 'Journal'],
      ['reputation', 'Notoriété'],
      ['direction', 'Direction'],
    ],
  },
};

const SECTION_OF = {
  squad: 'equipe', training: 'equipe', academy: 'equipe',
  mercato: 'mercato',
  season: 'saison', stats: 'saison', trophies: 'saison',
  finances: 'club', journal: 'club', reputation: 'club', direction: 'club',
};
export const sectionOf = (panel) => SECTION_OF[panel] || null;

// Bâtiments qui ouvrent un onglet : tant qu'ils ne sont pas construits, l'onglet reste visible, cadenassé.
export const LOCKS = { training: 'training', academy: 'academy', direction: 'direction' };

// Contexte fourni par App : panneau ouvert, onglets internes, bâtiments construits, et l'aller vers un onglet.
// { panel, squadTab, seasonTab, mercatoView, built: { training, academy, direction }, go(key), badges }
// Pastille d'un onglet (badges[clé]) : 'dot', un nombre (à traiter), ou { n, tone, label } (un compte discret).
export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);

// Onglet actif d'une section : le panneau, précisé par son onglet interne pour l'Effectif et la Saison.
export function activeKey(nav) {
  if (!nav) return null;
  if (nav.panel === 'squad') return `squad:${nav.squadTab === 'market' ? 'players' : nav.squadTab || 'players'}`;
  if (nav.panel === 'season') return `season:${nav.seasonTab || 'calendar'}`;
  if (nav.panel === 'mercato') return `mercato:${nav.mercatoView || 'buy'}`;
  return nav.panel;
}

// Barre des onglets de la section, dans l'en-tête du panneau (une rangée qui défile en largeur sur téléphone).
export function SectionTabs({ section }) {
  const nav = useNav();
  const ref = useRef(null);
  const def = SECTIONS[section];
  const current = activeKey(nav);
  useEffect(() => { // téléphone : l'onglet actif reste en vue dans la rangée qui défile
    const row = ref.current;
    const on = row?.querySelector('[aria-current="page"]');
    if (row && on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
  }, [current]);
  if (!nav || !def || !def.items.length) return null;
  return (
    <nav ref={ref} className="section-tabs sq-tabs" aria-label={`${def.title} : écrans`}>
      {def.items.map(([key, label]) => {
        const on = key === current;
        const lock = LOCKS[key] && !nav.built?.[LOCKS[key]];
        const badge = nav.badges?.[key];
        return (
          <button
            key={key}
            type="button"
            data-key={key}
            className={`${on ? 'on' : ''} ${lock ? 'locked' : ''}`}
            aria-current={on ? 'page' : undefined}
            title={lock ? 'À construire dans le complexe' : undefined}
            onClick={() => { if (on) return; uiSound('tab'); nav.go(key); }}
          >
            {lock && <IconLock />}
            {label}
            {badge === 'dot' && <i className="sq-tab-dot" aria-label="à voir" />}
            {typeof badge === 'number' && <em className="sq-tab-count" aria-label={`${badge} à traiter`}>{badge}</em>}
            {badge?.n > 0 && <em className={`sq-tab-count ${badge.tone || ''}`} aria-label={badge.label || String(badge.n)}>{badge.n}</em>}
          </button>
        );
      })}
    </nav>
  );
}
