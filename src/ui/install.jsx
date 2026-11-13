import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocus, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { uiSound } from './uisound';
import { t, tr } from '../i18n/index';
import { canPrompt, inAppBrowser, iosBrowser, installKind, isIOS, onInstallChange, promptInstall } from './pwa';

// Installer le jeu (1.0.35, demande du PDG : « un message dans le jeu qui recommande d'installer l'app et explique
// comment, pour faciliter la tâche » ; 1.0.36 : « je veux recommander absolument d'installer l'app », sans l'étape qui
// copiait la partie). Une feuille noir et or qui monte du bas, comme les confirmations, à chaque visite au téléphone tant
// que le jeu n'est pas installé :
// - Android (Chrome, Edge, Samsung Internet) : un vrai bouton « Installer » (la fenêtre du navigateur) ; sinon le menu ⋮ ;
// - iPhone et iPad : Partager, « Sur l'écran d'accueil », « Ajouter » (Safari, Chrome, autres navigateurs) ;
// - navigateur intégré (Instagram, TikTok…) : l'ouvrir d'abord dans le navigateur du téléphone.

const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const Share = () => <svg viewBox="0 0 24 24" {...I}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-2" /></svg>;
const AddHome = () => <svg viewBox="0 0 24 24" {...I}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8.5v7M8.5 12h7" /></svg>;
const Home = () => <svg viewBox="0 0 24 24" {...I}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" /></svg>;
const DotsV = () => <svg viewBox="0 0 24 24" {...I} fill="currentColor" stroke="none"><circle cx="12" cy="5.5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="18.5" r="1.8" /></svg>;
const DotsH = () => <svg viewBox="0 0 24 24" {...I} fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18.5" cy="12" r="1.8" /></svg>;
const Download = () => <svg viewBox="0 0 24 24" {...I}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19.5h14" /></svg>;
// avantages de l'app, en tête de la feuille
const Expand = () => <svg viewBox="0 0 24 24" {...I}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>;
const Tap = () => <svg viewBox="0 0 24 24" {...I}><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.8-2.4L4.4 15.5a1.5 1.5 0 0 1 2.3-1.9L9 16" /></svg>;
const Bell = () => <svg viewBox="0 0 24 24" {...I}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;

const isPad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Étapes selon l'appareil. Les libellés en or sont ceux que le joueur cherche sur son téléphone, dans sa langue
// (dictionnaires : les mots exacts d'iOS et d'Android).
const L = (s) => <b className="pwa-label">{s}</b>;
function stepsOf(kind, inApp) {
  if (inApp) {
    return [
      { Icon: isIOS() ? DotsH : DotsV, title: t('Ouvre le jeu dans ton navigateur'), text: isIOS() ? t('Touche ⋯ en haut à droite et choisis de l’ouvrir dans Safari.') : t('Ouvre le menu en haut de l’écran et choisis de l’ouvrir dans Chrome ou ton navigateur.') },
      { Icon: AddHome, title: t('Installe-le depuis là'), text: t('Ce message t’y attend avec les étapes.') },
    ];
  }
  if (kind === 'ios') {
    const b = iosBrowser();
    return [
      {
        Icon: Share,
        title: b === 'other' ? tr('Ouvre le menu <0/>', [L(t('Partager'))]) : tr('Touche <0/>', [L(t('Partager'))]),
        text: b === 'chrome' ? t('Le carré avec une flèche, à droite dans la barre d’adresse.')
          : b === 'other' ? t('Dans le menu de ton navigateur. Ou ouvre le jeu dans Safari : c’est le plus simple.')
          : isPad() ? t('Le carré avec une flèche, en haut de l’écran (ou dans le menu ⋯ s’il n’y est pas).')
          : t('Le carré avec une flèche, en bas de l’écran (ou dans le menu ⋯ s’il n’y est pas).'),
      },
      { Icon: AddHome, title: tr('Choisis « <0/> »', [L(t('Sur l’écran d’accueil'))]), text: t('Fais défiler la liste si besoin.') },
      { Icon: Home, title: tr('Touche « <0/> »', [L(t('Ajouter'))]), text: t('Puis ouvre le jeu depuis sa nouvelle icône.') },
    ];
  }
  return [ // Android sans le bouton du navigateur (Firefox, ou fenêtre déjà refusée)
    { Icon: DotsV, title: t('Ouvre le menu du navigateur'), text: t('Les trois points, à côté de la barre d’adresse.') },
    { Icon: Download, title: tr('Touche « <0/> »', [L(t('Installer l’application'))]), text: tr('Ou « <0/> », selon ton navigateur.', [L(t('Ajouter à l’écran d’accueil'))]) },
    { Icon: Home, title: t('Ouvre le jeu depuis son icône'), text: t('Ta partie s’y trouve déjà.') },
  ];
}

// onClose(how, kind) : 'later' (Plus tard), 'ok' (J'installe), 'installed' (fenêtre du navigateur acceptée)
export function InstallSheet({ onClose }) {
  const cardRef = useRef(null);
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []); // le bouton du navigateur arrive souvent après l'écran titre
  useDialogFocus(cardRef, { autoFocus: false });
  useSwipe(cardRef, { onDown: () => onClose('later'), downMedia: PHONE });
  useKeydown((e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose('later'); } }, { capture: true });

  const inApp = inAppBrowser();
  const kind = installKind() || (inApp ? (isIOS() ? 'ios' : 'android') : null);
  const native = !inApp && canPrompt() && kind !== 'ios';
  const steps = native ? [] : stepsOf(kind, inApp);
  const install = async () => {
    uiSound('select');
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === 'accepted') onClose('installed', kind);
    else if (kind === 'pc') onClose('later'); // ordinateur : refusée, rien de plus à montrer
    else bump((n) => n + 1); // refusée : les étapes du menu prennent le relais
  };
  const lead = inApp ? t('Ce navigateur intégré ne peut pas installer le jeu : ouvre-le d’abord dans le navigateur de ton téléphone.')
    : kind === 'pc' ? t('Le jeu dans sa propre fenêtre, ouvert d’un clic, comme une application. Ta partie reste la même.')
    : kind === 'ios' ? t('FootOFF Empire se joue en app. Sur iPhone et iPad, c’est aussi la seule façon de recevoir les notifications de tes championnats.')
    : t('FootOFF Empire se joue en app, et ta partie reste la même.');
  const perks = kind === 'pc' ? [] : [[Expand, t('Plein écran')], [Tap, t('Ouvert d’un geste')], [Bell, t('Notifications des championnats')]];

  return (
    <div className="scrim confirm-scrim pwa-scrim" onClick={() => onClose('later')}>
      <div ref={cardRef} className="confirm-card glass pwa-card" role="dialog" aria-modal="true" aria-labelledby="pwa-title" onClick={(e) => e.stopPropagation()}>
        <span className="grip" aria-hidden="true" />
        <div className="pwa-scroll">
          <div className="pwa-head">
            <img className="pwa-icon" src="icons/icon-192.png" alt="" width="56" height="56" />
            <div className="pwa-titles">
              <span className="eyebrow pwa-reco">{kind === 'pc' ? t('Sur ton ordinateur') : t('Fortement recommandé')}</span>
              <h3 id="pwa-title">{t('Installe l’app FootOFF Empire')}</h3>
            </div>
          </div>
          <p className="confirm-text">{lead}</p>
          {perks.length > 0 && (
            <ul className="pwa-perks">
              {perks.map(([Icon, label]) => <li key={label}><Icon /><span>{label}</span></li>)}
            </ul>
          )}
          {steps.length > 0 && (
            <ol className="pwa-steps">
              {steps.map(({ Icon, title, text }, i) => (
                <li key={i} className="pwa-step">
                  <span className="pwa-num" aria-hidden="true"><Icon /></span>
                  <span className="pwa-step-text"><strong>{title}</strong><span>{text}</span></span>
                </li>
              ))}
            </ol>
          )}
          {native && <p className="pwa-native">{kind === 'pc' ? t('Ton navigateur te demande de confirmer, puis le jeu s’ouvre dans sa fenêtre.') : t('Ton navigateur te demande de confirmer, puis le jeu arrive sur ton écran d’accueil.')}</p>}
        </div>
        <div className="confirm-actions pwa-actions">
          <button type="button" className="btn ghost pwa-later" onClick={() => { uiSound('back'); onClose('later'); }}>{t('Plus tard')}</button>
          {native
            ? <button type="button" className="btn pwa-install" disabled={busy} onClick={install}><Download />{t('Installer')}</button>
            : <button type="button" className="btn" onClick={() => { uiSound('select'); onClose('ok'); }}>{t('J’installe')}</button>}
        </div>
      </div>
    </div>
  );
}
