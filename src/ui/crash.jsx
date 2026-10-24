import React from 'react';
import { FOMonogram } from './brand';
import { SAVE_KEY } from '../game/constants';
import { exportCode, hasBackup, peekBackup, restoreBackup } from '../game/save';
import { DIVISIONS } from '../game/constants';
import { errorReport } from './errlog';

// Barrière d'erreur globale : une erreur de rendu n'importe où dans le jeu (hors épreuves 3D, qui ont la leur) n'affiche
// plus une page noire. L'écran dit ce qui s'est passé en une phrase, propose de reprendre (la sauvegarde n'a pas été
// touchée), de revenir à la copie de secours de la session (si le problème revient à chaque fois) et de copier un
// rapport pour le signaler. Aperçu : ?ecran=erreur.

// le rapport, suivi du code de sauvegarde de la partie en cours (lu dans le stockage : l'écran d'erreur n'a pas l'état)
const withSave = async (report) => {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? `${report}\n\nPARTIE (code de sauvegarde) :\n${await exportCode(JSON.parse(raw))}` : report; } catch { return report; }
};
const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};

export function CrashScreen({ error, summary = null, preview = false }) {
  const [copied, setCopied] = React.useState(false);
  const backup = preview ? { clubName: 'FootOFF FC', season: 3, division: 1 } : peekBackup();
  const canRestore = preview ? true : hasBackup();
  const report = errorReport(error, summary);
  return (
    <div className="crash" role="alertdialog" aria-label="Le jeu a rencontré un problème">
      <div className="crash-card">
        <FOMonogram className="crash-mark" />
        <span className="eyebrow">Désolé</span>
        <h2>Le jeu a rencontré un problème</h2>
        <p className="crash-text">Ta partie est intacte : elle est sauvegardée à chaque action. Reprends là où tu en étais ; si le problème revient à chaque fois, reviens à la copie de secours prise à l’ouverture de cette session.</p>
        <p className="crash-err"><code>{String(error?.message || error || 'Erreur inconnue').slice(0, 160)}</code></p>
        <div className="crash-actions">
          <button type="button" className="btn btn-xl" onClick={() => { if (!preview) window.location.reload(); }}>Reprendre</button>
          {canRestore && (
            <button type="button" className="btn ghost btn-xl" onClick={() => { if (!preview && restoreBackup()) window.location.reload(); }}>
              Copie de secours{backup ? ` · ${backup.clubName}, saison ${backup.season} (${DIVISIONS[backup.division]?.name || ''})` : ''}
            </button>
          )}
          <span className="crash-links">
            <button type="button" className="linkbtn" onClick={async () => setCopied((await copyText(report)) ? 'short' : false)}>{copied === 'short' ? 'Rapport copié' : 'Copier le rapport'}</button>
            <button type="button" className="linkbtn" onClick={async () => setCopied((await copyText(await withSave(report))) ? 'full' : false)}>{copied === 'full' ? 'Rapport et partie copiés' : 'Copier le rapport avec la partie'}</button>
          </span>
        </div>
        <p className="crash-note">Le rapport contient la version du jeu, ton navigateur et l’erreur ; « avec la partie », il ajoute le code de ta sauvegarde pour rejouer le problème. Rien n’est envoyé : colle-le dans un message pour le signaler.</p>
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
