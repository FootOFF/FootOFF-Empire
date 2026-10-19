import React from 'react';

// Icônes fines (trait 1,6) cohérentes avec l'interface FootOFF : viewBox 24, couleur = currentColor.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
const I = (children) => (p) => <svg viewBox="0 0 24 24" aria-hidden="true" {...S} {...p}>{children}</svg>;

export const IconPitch = I(<><rect x="2.5" y="5" width="19" height="14" rx="1.5" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.6" /><path d="M2.5 9.5h2.5v5H2.5M21.5 9.5H19v5h2.5" /></>);
export const IconEmpire = I(<><path d="M3 20h18" /><path d="M5 20V10l4-3v13M9 20V7l6-3v16M15 20v-8l4 2v6" /><path d="M11.5 9h1M11.5 12h1M11.5 15h1" /></>);
export const IconTraining = I(<><path d="M4 12h16" /><rect x="5.5" y="8" width="2.5" height="8" rx="0.8" /><rect x="16" y="8" width="2.5" height="8" rx="0.8" /><path d="M3 10.5v3M21 10.5v3" /></>);
export const IconAcademy = I(<><path d="M12 4 22 9l-10 5L2 9Z" /><path d="M6 11v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3V11" /><path d="M22 9v5" /></>);
export const IconFans = I(<><path d="M4 10.5 14 6v12L4 13.5Z" /><path d="M4 10.5v3M17.5 9.5v5M20.5 8v8" /></>);
export const IconSponsor = I(<><rect x="4" y="3" width="10" height="18" rx="1" /><path d="M14 9h5a1 1 0 0 1 1 1v11h-6M7 7h4M7 11h4M7 15h4" /></>);
export const IconCoin = I(<><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9a3.2 3.2 0 1 0 0 6M8.5 11h5M8.5 13.2h5" /></>);
export const IconStar = I(<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8Z" />);
export const IconPlay = I(<path d="M8 5.5v13l10.5-6.5Z" />);
export const IconUsers = I(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0 1 12 0" /><circle cx="17" cy="9.5" r="2.5" /><path d="M16 14.2a5 5 0 0 1 5.5 4.8" /></>);
export const IconCal = I(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconNews = I(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>);
export const IconPlus = I(<path d="M12 5v14M5 12h14" />);
export const IconClose = I(<path d="M6 6l12 12M18 6 6 18" />);
export const IconSun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const IconMoon = I(<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />);
export const IconStadium = I(<><ellipse cx="12" cy="13" rx="9" ry="5" /><ellipse cx="12" cy="13" rx="4.5" ry="2.2" /><path d="M3 13v2.5c0 2.8 4 5 9 5s9-2.2 9-5V13M6 5v4M18 5v4M6 5l-1.2 1M18 5l1.2 1" /></>);
export const IconTarget = I(<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IconMenu = I(<path d="M4 7h16M4 12h16M4 17h10" />);
export const IconTrophy = I(<><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M9.5 17h5" /></>);
export const IconArrowUp = I(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconLock = I(<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>);
export const IconChevron = I(<path d="m9 6 6 6-6 6" />);
export const IconChevronLeft = I(<path d="m15 6-6 6 6 6" />);
export const IconRadar = I(<><path d="M12 3 20.5 9.2 17.3 19H6.7L3.5 9.2Z" /><path d="m12 7.5 4.2 3-1.6 4.8H9.4L7.8 10.5Z" /></>);
export const IconTrend = I(<path d="M3 17 9 11l4 4 8-8M15 7h6v6" />);
export const IconClock = I(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>);
export const IconCloud = I(<path d="M7 18h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 9.6 4.3 4.3 0 0 0 7 18Z" />);
export const IconRain = I(<><path d="M7 15h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 6.6 4.3 4.3 0 0 0 7 15Z" /><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" /></>);
export const IconSnow = I(<><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /><path d="M10 4.5 12 6l2-1.5M10 19.5 12 18l2 1.5" /></>);
export const IconShield = I(<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6Z" />);
export const IconEye = I(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>);
