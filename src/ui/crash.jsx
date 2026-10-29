import React from 'react';
import { FOMonogram } from './brand';
import { SAVE_KEY } from '../game/constants';
import { exportCode, hasBackup, peekBackup, restoreBackup } from '../game/save';
import { DIVISIONS } from '../game/constants';
import { errorReport } from './errlog';
import { t, tr } from '../i18n/index';

// Barrière d'erreur globale : une erreur de rendu n'importe où dans le jeu (hors épreuves 3D, qui ont la leur) n'affiche
// plus une page noire. L'écran dit ce qui s'est passé en une phrase, propose de reprendre (la sauvegarde n'a pas été
// touchée), de revenir à la copie de secours de la session (si le problème revient à chaque fois) et de copier un
// rapport pour le signaler. Aperçu : ?ecran=erreur.

// le rapport, suivi du code de sauvegarde de la partie en cours (lu dans le stockage : l'écran d'erreur n'a pas l'état)
const withSave = async (report) => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? t('{report}\n\nPARTIE (code de sauvegarde) :\n{v}', { report, v: await exportCode(JSON.parse(raw)) }) : report; } catch { return report; }
};
const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

export function CrashScreen({ error, summary = null, preview = false }) {
  const [copied, setCopied] = React.useState(false);
  const backup = preview ? { clubName: t('FootOFF FC'), season: 3, division: 1 } : peekBackup();
  const canRestore = preview ? true : hasBackup();
  const report = errorReport(error, summary);
  return (
    <div className="crash" role="alertdialog" aria-label={t('Le jeu a rencontré un problème')}>
      <div className="crash-card">
        <FOMonogram className="crash-mark" />
        <span className="eyebrow">{t('Désolé')}</span>
        <h2>{t('Le jeu a rencontré un problème')}</h2>
        <p className="crash-text">{t('Ta partie est intacte : elle est sauvegardée à chaque action. Reprends là où tu en étais ; si le problème revient à chaque fois, reviens à la copie de secours prise à l’ouverture de cette session.')}</p>
        <p className="crash-err"><code>{String(error?.message || error || t('Erreur inconnue')).slice(0, 160)}</code></p>
        <div className="crash-actions">
          <button type="button" className="btn btn-xl" onClick={() => { if (!preview) window.location.reload(); }}>{t('Reprendre')}</button>
          {canRestore && (
            <button type="button" className="btn ghost btn-xl crash-restore" onClick={() => { if (!preview && restoreBackup()) window.location.reload(); }}>
              <span>{t('Copie de secours')}</span>
              {backup && <small>{tr('<0/>, saison <1/><2/>', [backup.clubName, backup.season, DIVISIONS[backup.division] ? ` (${DIVISIONS[backup.division].name})` : ''])}</small>}
            </button>
          )}
          <span className="crash-links">
            <button type="button" className="linkbtn" onClick={async () => setCopied((await copyText(report)) ? 'short' : false)}>{copied === 'short' ? t('Rapport copié') : t('Copier le rapport')}</button>
            <button type="button" className="linkbtn" onClick={async () => setCopied((await copyText(await withSave(report))) ? 'full' : false)}>{copied === 'full' ? t('Rapport et partie copiés') : t('Copier le rapport avec la partie')}</button>
          </span>
        </div>
        <p className="crash-note">{t('Le rapport contient la version du jeu, ton navigateur et l’erreur ; « avec la partie », il ajoute le code de ta sauvegarde pour rejouer le problème. Rien n’est envoyé : colle-le dans un message pour le signaler.')}</p>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.warn('[jeu] erreur de rendu', error, info?.componentStack); }
  render() {
    if (this.state.error) return <CrashScreen error={this.state.error} summary={this.props.summary?.() || null} />;
    return this.props.children;
  }
}
