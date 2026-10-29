import React from 'react';
import { IconInstagram, IconLinkedIn, IconTikTok, IconXBrand, IconYouTube } from './icons';
import { t } from '../i18n/index';

// Réseaux de FootOFF (0.8.17, demande du PDG) : les comptes officiels, tels que les donne le site footoff.media (vérifiés
// le 29/10/2026), du plus suivi par les joueurs au plus institutionnel. Ils s'ouvrent dans un nouvel onglet, sans
// transmettre l'adresse du jeu. Deux places, comme dans les grands jeux : une rangée discrète au pied de l'écran titre,
// et la section « Suivre FootOFF » des réglages (écran titre et menu pause).
export const SOCIALS = [
  { id: 'instagram', name: t('Instagram'), handle: '@footoff.agency', url: 'https://www.instagram.com/footoff.agency', Icon: IconInstagram },
  { id: 'tiktok', name: t('TikTok'), handle: '@footoff.agency', url: 'https://www.tiktok.com/@footoff.agency', Icon: IconTikTok },
  { id: 'youtube', name: t('YouTube'), handle: '@FootOFFMedia', url: 'https://www.youtube.com/@FootOFFMedia', Icon: IconYouTube },
  { id: 'x', name: t('X'), handle: '@FootOFF_Agency', url: 'https://x.com/FootOFF_Agency', Icon: IconXBrand },
  { id: 'linkedin', name: t('LinkedIn'), handle: 'FootOFF', url: 'https://www.linkedin.com/company/footoff/', Icon: IconLinkedIn },
];
export const LINK = { target: '_blank', rel: 'noopener noreferrer' };

// Rangée d'icônes (pied de l'écran titre)
export function SocialStrip({ className = '' }) {
  return (
    <nav className={`social-strip ${className}`} aria-label={t('Suivre FootOFF')}>
      {SOCIALS.map(({ id, name, url, Icon }) => (
        <a key={id} href={url} {...LINK} className="social-link" aria-label={t('FootOFF sur {name}', { name })} title={t('FootOFF sur {name}', { name })}><Icon /></a>
      ))}
    </nav>
  );
}
