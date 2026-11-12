import React, { useEffect, useRef, useState } from 'react';
import { useDialogFocus, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { uiSound } from './uisound';
import { IconCheck } from './icons';
import { t, tr } from '../i18n/index';
import { canPrompt, inAppBrowser, iosBrowser, installKind, isIOS, onInstallChange, promptInstall } from './pwa';

// Installer le jeu (1.0.35, demande du PDG : « un message dans le jeu qui recommande d'installer l'app et explique
// comment, pour faciliter la tâche »). Une feuille noir et or qui monte du bas, comme les confirmations :
// - Android (Chrome, Edge, Samsung Internet) : un vrai bouton « Installer » (la fenêtre du navigateur) ; sinon le menu ⋮ ;
// - iPhone et iPad : Partager, « Sur l'écran d'accueil », « Ajouter » (Safari, Chrome, autres navigateurs) ;
// - navigateur intégré (Instagram, TikTok…) : l'ouvrir d'abord dans le navigateur du téléphone.
// Sur iPhone, l'app installée ne voit pas les données du navigateur (ni celles d'un navigateur intégré) : une étape
// « Garde ta partie » copie la partie et les clubs de championnat en un code, que l'app propose de coller à sa première
// ouverture (AppWelcome).

const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const Share = () => <svg viewBox="0 0 24 24" {...I}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-2" /></svg>;
const AddHome = () => <svg viewBox="0 0 24 24" {...I}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8.5v7M8.5 12h7" /></svg>;
const Home = () => <svg viewBox="0 0 24 24" {...I}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" fill="currentColor" /></svg>;
const DotsV = () => <svg viewBox="0 0 24 24" {...I} fill="currentColor" stroke="none"><circle cx="12" cy="5.5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="18.5" r="1.8" /></svg>;
const DotsH = () => <svg viewBox="0 0 24 24" {...I} fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18.5" cy="12" r="1.8" /></svg>;
const Download = () => <svg viewBox="0 0 24 24" {...I}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19.5h14" /></svg>;
const Browser = () => <svg viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.4 8.7 8.4 12s1.2 6.1 3.6 8.5" /></svg>;
const Copy = () => <svg viewBox="0 0 24 24" {...I}><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" /><path d="M15.5 5.5v-.5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" /></svg>;

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

// onCopy : le code de transfert (partie et clubs de championnat), ou null s'il n'y a rien à emporter ; leagues : nombre
// de clubs de championnat sur cet appareil. onClose(how) : 'later' (Plus tard), 'ok' (Compris), 'installed'.
export function InstallSheet({ onCopy = null, leagues = 0, onClose }) {
  const cardRef = useRef(null);
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(null); // presse-papiers refusé : le code s'affiche, à copier soi-même
  const [busy, setBusy] = useState(false);
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []); // le bouton du navigateur arrive souvent après l'écran titre
  useDialogFocus(cardRef, { autoFocus: false });
  useSwipe(cardRef, { onDown: () => onClose('later'), downMedia: PHONE });
  useKeydown((e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose('later'); } }, { capture: true });

  const inApp = inAppBrowser();
  const kind = installKind() || (inApp ? (isIOS() ? 'ios' : 'android') : null);
  const native = !inApp && canPrompt() && kind !== 'ios';
  const carry = onCopy && (kind === 'ios' || inApp); // l'app installée ne voit pas ce que garde ce navigateur
  const steps = native ? [] : stepsOf(kind, inApp);
  const install = async () => {
    uiSound('select');
    setBusy(true);
    const r = await promptInstall();
    setBusy(false);
    if (r === 'accepted') onClose('installed', kind);
    else bump((n) => n + 1); // refusée : les étapes du menu prennent le relais
  };
  // Safari ne copie que dans le geste même : le code (compressé, donc pas tout de suite prêt) part en promesse dans un
  // ClipboardItem créé pendant le toucher ; sinon (ou refusé) writeText, puis le code affiché à copier soi-même
  const copy = async () => {
    uiSound('select');
    const pending = onCopy();
    try {
      if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error('ClipboardItem');
      await navigator.clipboard.write([new window.ClipboardItem({ 'text/plain': pending.then((c) => new Blob([c], { type: 'text/plain' })) })]);
      setCopied(true); setCode(null);
      return;
    } catch { /* navigateur sans ClipboardItem à promesse : writeText */ }
    const c = await pending;
    try { await navigator.clipboard.writeText(c); setCopied(true); setCode(null); } catch { setCode(c); }
  };
  const lead = inApp ? t('Ce navigateur intégré ne peut pas installer le jeu : ouvre-le d’abord dans le navigateur de ton téléphone.')
    : kind === 'ios' ? t('Plein écran, sans la barre du navigateur, et ouvert d’un geste depuis son icône. Sur iPhone et iPad, c’est aussi la seule façon de recevoir les notifications de tes championnats.')
    : kind === 'pc' ? t('Le jeu dans sa propre fenêtre, ouvert d’un clic, comme une application. Ta partie reste la même.')
    : t('Plein écran, sans la barre du navigateur, et ouvert d’un geste depuis son icône, comme une vraie application. Ta partie reste la même.');

  return (
    <div className="scrim confirm-scrim pwa-scrim" onClick={() => onClose('later')}>
      <div ref={cardRef} className="confirm-card glass pwa-card" role="dialog" aria-modal="true" aria-labelledby="pwa-title" onClick={(e) => e.stopPropagation()}>
        <span className="grip" aria-hidden="true" />
        <div className="pwa-scroll">
        <div className="pwa-head">
          <img className="pwa-icon" src="icons/icon-192.png" alt="" width="56" height="56" />
          <div className="pwa-titles">
            <span className="eyebrow">{kind === 'pc' ? t('Sur ton ordinateur') : t('Sur ton écran d’accueil')}</span>
            <h3 id="pwa-title">{t('Installe FootOFF Empire')}</h3>
          </div>
        </div>
        <p className="confirm-text">{lead}</p>
        {(carry || steps.length > 0) && (
          <ol className="pwa-steps">
            {carry && (
              <li className={`pwa-step pwa-carry ${copied ? 'done' : ''}`}>
                <span className="pwa-num" aria-hidden="true">{copied ? <IconCheck /> : <Copy />}</span>
                <span className="pwa-step-text">
                  <strong>{t('Garde ta partie')}</strong>
                  <span>{leagues ? t('L’app installée ne retrouve pas seule ce que garde ce navigateur : copie ta partie et tes clubs de championnat, puis colle-les à sa première ouverture.')
                    : t('L’app installée ne retrouve pas seule ce que garde ce navigateur : copie ta partie, puis colle-la à sa première ouverture.')}</span>
                  {code ? (
                    <>
                      <em className="pwa-self">{t('Copie-le toi-même ci-dessous.')}</em>
                      <textarea className="cm-code pwa-code" readOnly value={code} onFocus={(e) => e.target.select()} aria-label={t('Code de sauvegarde')} />
                    </>
                  ) : (
                    <button type="button" className={`btn ${copied ? 'ghost' : ''} pwa-copy`} onClick={copy}>{copied ? t('Partie copiée') : t('Copier ma partie')}</button>
                  )}
                </span>
              </li>
            )}
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
          <button type="button" className="btn ghost" onClick={() => { uiSound('back'); onClose('later'); }}>{t('Plus tard')}</button>
          {native
            ? <button type="button" className="btn pwa-install" disabled={busy} onClick={install}><Download />{t('Installer')}</button>
            : <button type="button" className="btn" onClick={() => { uiSound('select'); onClose('ok'); }}>{t('Compris')}</button>}
        </div>
      </div>
    </div>
  );
}

// Première ouverture de l'app installée, sans partie ni championnat : coller la partie copiée dans le navigateur.
// onPaste(code) : null si c'est fait, sinon le message d'erreur à afficher.
export function AppWelcome({ onPaste, onClose }) {
  const cardRef = useRef(null);
  const [manual, setManual] = useState(false); // presse-papiers illisible : le champ où coller soi-même
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  useDialogFocus(cardRef, { autoFocus: false });
  useSwipe(cardRef, { onDown: onClose, downMedia: PHONE });
  useKeydown((e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } }, { capture: true });
  const submit = async (raw) => {
    setBusy(true);
    setProblem(null);
    const err = await onPaste(raw.trim());
    setBusy(false);
    if (err) { uiSound('back'); setProblem(err); setManual(true); }
  };
  const paste = async () => {
    uiSound('select');
    let raw = '';
    try { raw = await navigator.clipboard.readText(); } catch { /* refusé : le champ à coller */ }
    if (/^\s*FO[ET][01]:/.test(raw)) submit(raw);
    else setManual(true);
  };
  return (
    <div className="scrim confirm-scrim pwa-scrim" onClick={onClose}>
      <div ref={cardRef} className="confirm-card glass pwa-card" role="dialog" aria-modal="true" aria-labelledby="pwa-welcome" onClick={(e) => e.stopPropagation()}>
        <span className="grip" aria-hidden="true" />
        <div className="pwa-scroll">
        <div className="pwa-head">
          <img className="pwa-icon" src="icons/icon-192.png" alt="" width="56" height="56" />
          <div className="pwa-titles">
            <span className="eyebrow">{t('Bienvenue dans l’app')}</span>
            <h3 id="pwa-welcome">{t('Tu jouais déjà dans ton navigateur ?')}</h3>
          </div>
        </div>
        <p className="confirm-text">{t('Si tu as copié ta partie avant d’installer le jeu, colle-la ici : tu reprends là où tu en étais.')}</p>
        {manual && (
          <label className="pwa-paste">
            <span>{t('Touche longuement le cadre, puis « Coller ».')}</span>
            <textarea className="cm-code" value={code} onChange={(e) => { setCode(e.target.value); setProblem(null); }} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="FOT1:…" aria-label={t('Code de sauvegarde')} />
          </label>
        )}
        {problem && <p className="cm-save-note warn">{problem}</p>}
        </div>
        <div className="confirm-actions pwa-actions">
          <button type="button" className="btn ghost" onClick={() => { uiSound('back'); onClose(); }}>{t('Non, je commence')}</button>
          {manual
            ? <button type="button" className="btn" disabled={!code.trim() || busy} onClick={() => submit(code)}>{busy ? t('Vérification…') : t('Reprendre ma partie')}</button>
            : <button type="button" className="btn" disabled={busy} onClick={paste}>{busy ? t('Vérification…') : t('Coller ma partie')}</button>}
        </div>
      </div>
    </div>
  );
}
