import React, { createContext, useContext, useEffect, useRef } from 'react';
import { IconChevron, IconChevronLeft, IconLock } from './icons';
import { uiSound } from './uisound';
import { isRTL, t } from '../i18n/index';

// Navigation du jeu : cinq sections au menu du bas (Complexe, Équipe, Mercato, Saison, Club). Chaque panneau
// appartient à une section ; son en-tête porte le nom de la section et, en onglets, les écrans voisins de la même
// section (Équipe : Joueurs, Composition, Entraînement, Académie, Médical, Anciens). Un onglet est un panneau, ou un panneau
// ouvert sur un de ses onglets internes (« squad:lineup » : l'Effectif sur la Composition).

export const SECTIONS = {
  equipe: {
    title: t('Équipe'),
    items: [
      ['squad:players', t('Joueurs')],
      ['squad:lineup', t('Composition')],
      ['training', t('Entraînement')],
      ['academy', t('Académie')],
      ['medical', t('Médical')],
      ['squad:alumni', t('Anciens')],
    ],
  },
  mercato: {
    title: t('Mercato'),
    items: [
      ['mercato:buy', t('Recruter')],
      ['mercato:friends', t('Amis'), 'league'], // championnat entre amis seulement (1.0.2) : l'effectif de chaque ami
      ['mercato:watch', t('Suivis')],
      ['mercato:offers', t('Offres')],
      ['mercato:log', t('Bilan')],
    ],
  },
  saison: {
    title: t('Saison'),
    items: [
      ['season:calendar', t('Calendrier')],
      ['season:table', t('Classement')],
      ['stats', t('Statistiques')],
      ['trophies', t('Trophées')],
    ],
  },
  club: {
    title: t('Club'),
    items: [
      ['finances', t('Finances')],
      ['journal', t('Journal')],
      ['reputation', t('Notoriété')],
      ['direction', t('Direction')],
    ],
  },
};

const SECTION_OF = {
  squad: 'equipe', training: 'equipe', academy: 'equipe', medical: 'equipe',
  mercato: 'mercato',
  season: 'saison', stats: 'saison', trophies: 'saison',
  finances: 'club', journal: 'club', reputation: 'club', direction: 'club',
};
export const sectionOf = (panel) => SECTION_OF[panel] || null;

// Ordre des sections au menu du bas (après le Complexe), et le panneau qui ouvre chacune.
export const SECTION_ORDER = ['equipe', 'mercato', 'saison', 'club'];
export const SECTION_ENTRY = { equipe: 'squad', mercato: 'mercato', saison: 'season', club: 'club' };
export function sectionNear(section, dir) {
  const i = SECTION_ORDER.indexOf(section);
  return i < 0 ? null : SECTION_ORDER[i + dir] || null;
}

// Bâtiments qui ouvrent un onglet : tant qu'ils ne sont pas construits, l'onglet reste visible, cadenassé.
export const LOCKS = { training: 'training', academy: 'academy', direction: 'direction', medical: 'medical' };

// Contexte fourni par App : panneau ouvert, onglets internes, bâtiments construits, et l'aller vers un onglet.
// { panel, squadTab, seasonTab, mercatoView, built: { training, academy, direction, medical }, go(key), step(dir), badges }
// Pastille d'un onglet (badges[clé]) : 'dot', un nombre (à traiter), ou { n, tone, label } (un compte discret).
export const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);

// Un onglet réservé à un mode (troisième valeur : 'league', une partie de championnat entre amis) ne s'affiche qu'en ce mode.
const shown = (nav) => ([, , only]) => !only || !!nav?.[only];

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
    if (row && on && row.scrollWidth > row.clientWidth) { // position de l'onglet dans la rangée, quel que soit ce qui la précède (0.8.13)
      const x = row.scrollLeft + on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
      row.scrollLeft = isRTL() ? Math.min(0, x) : Math.max(0, x); // en arabe, 0 au début (à droite), négatif ensuite
    }
  }, [current]);
  if (!nav || !def || !def.items.length) return null;
  return (
    <nav ref={ref} className="section-tabs sq-tabs" aria-label={t('{title} : écrans', { title: def.title })}>
      {def.items.filter(shown(nav)).map(([key, label]) => {
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
            title={lock ? t('À construire dans le complexe') : undefined}
            onClick={() => { if (on) return; uiSound('tab'); nav.go(key); }}
          >
            {lock && <IconLock />}
            {label}
            {badge === 'dot' && <i className="sq-tab-dot" aria-label={t('à voir')} />}
            {typeof badge === 'number' && <em className="sq-tab-count" aria-label={t('{badge} à traiter', { badge })}>{badge}</em>}
            {badge?.n > 0 && <em className={`sq-tab-count ${badge.tone || ''}`} aria-label={badge.label || String(badge.n)}>{badge.n}</em>}
          </button>
        );
      })}
    </nav>
  );
}

// Téléphone : sous un panneau plein écran, le menu du bas s'efface. On passe d'une section à sa voisine (Équipe,
// Mercato, Saison, Club) en glissant le panneau du doigt vers la gauche ou la droite, ou par ces deux boutons, en bas
// du panneau, à portée du pouce ; les points disent où l'on est. Sur PC, le menu du bas reste visible : barre masquée.
export function SectionPager({ section }) {
  const nav = useNav();
  if (!nav?.step || !SECTION_ORDER.includes(section)) return null;
  const prev = sectionNear(section, -1);
  const next = sectionNear(section, 1);
  return (
    <nav className="section-pager" aria-label={t('Sections')}>
      <button type="button" className="sp-prev" disabled={!prev} aria-label={prev ? t('Section précédente : {title}', { title: SECTIONS[prev].title }) : undefined} onClick={() => nav.step(-1)}>
        <IconChevronLeft />{prev && SECTIONS[prev].title}
      </button>
      <span className="sp-dots" aria-hidden="true">
        {SECTION_ORDER.map((k) => <i key={k} className={k === section ? 'on' : ''} />)}
      </span>
      <button type="button" className="sp-next" disabled={!next} aria-label={next ? t('Section suivante : {title}', { title: SECTIONS[next].title }) : undefined} onClick={() => nav.step(1)}>
        {next && SECTIONS[next].title}<IconChevron />
      </button>
    </nav>
  );
}
