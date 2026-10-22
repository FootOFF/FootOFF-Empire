// Ambiance sonore du stade, synthétisée avec Web Audio (aucun fichier) : rumeur de foule, « ooh » sur
// les occasions, clameur sur les buts, soupir quand on encaisse, sifflet de l'arbitre.
// Le contexte audio est créé au premier geste de l'utilisateur (coup d'envoi), comme l'exigent les navigateurs.

const KEY = 'fo-sound';

function noiseBuffer(ctx, seconds = 3) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) { // bruit rose (filtre de Voss simplifié) : plus doux qu'un bruit blanc
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
  }
  return buf;
}

export function createStadiumSound() {
  let ctx = null;
  let master, crowdGain, crowdFilter;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* préférence indisponible */ }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 520;
    crowdFilter.Q.value = 0.55;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0;
    src.connect(crowdFilter).connect(crowdGain).connect(master);
    src.start();
    return true;
  }

  // Enveloppe de foule : monte vers `peak` en `attack` s, retombe vers le niveau de base en `release` s.
  function swell(peak, attack, release, freq = 520) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const g = crowdGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak, t + attack);
    g.linearRampToValueAtTime(0.18, t + attack + release);
    crowdFilter.frequency.cancelScheduledValues(t);
    crowdFilter.frequency.setValueAtTime(crowdFilter.frequency.value, t);
    crowdFilter.frequency.linearRampToValueAtTime(freq, t + attack);
    crowdFilter.frequency.linearRampToValueAtTime(520, t + attack + release);
  }

  function whistle(count = 1) {
    if (!ensure()) return;
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.45;
      const len = count === 3 && i === 2 ? 0.9 : 0.32;
      const osc = ctx.createOscillator();
      const trem = ctx.createOscillator();
      const tremGain = ctx.createGain();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2950;
      trem.frequency.value = 28; // roulement de la bille du sifflet
      tremGain.gain.value = 120;
      trem.connect(tremGain).connect(osc.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.setValueAtTime(0.09, t + len - 0.05);
      g.gain.linearRampToValueAtTime(0, t + len);
      osc.connect(g).connect(master);
      osc.start(t); trem.start(t);
      osc.stop(t + len + 0.05); trem.stop(t + len + 0.05);
    }
  }

  return {
    get muted() { return muted; },
    start() { if (ensure()) { ctx.resume?.(); swell(0.18, 1.5, 0.1); } },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* idem */ }
      if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
    },
    whistle,
    chance() { swell(0.42, 0.35, 1.4, 800); }, // « ooh »
    goal() { swell(0.95, 0.25, 4.5, 1150); }, // clameur
    conceded() { swell(0.06, 0.4, 2.5, 380); }, // le stade se tait
    card() { whistle(1); swell(0.3, 0.3, 1.2, 640); }, // sifflet + bronca
    // pièces qui tombent dans la caisse : petits tintements aigus, légèrement désaccordés
    coins(count = 5, delay = 0.4) {
      if (!ensure()) return;
      ctx.resume?.();
      for (let i = 0; i < count; i++) {
        const t = ctx.currentTime + delay + i * 0.055 + Math.random() * 0.02;
        for (const [mult, vol] of [[1, 0.05], [2.76, 0.018]]) {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = (2100 + Math.random() * 600) * mult;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(vol, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          osc.connect(g).connect(master);
          osc.start(t);
          osc.stop(t + 0.18);
        }
      }
    },
    // dépense : un « toc » sourd
    spend() {
      if (!ensure()) return;
      ctx.resume?.();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.14);
    },
    // sons des menus (écran titre, pause) : déplacement (petit clic), validation (deux notes qui montent), retour
    // (une note qui descend). Rien avant le premier geste de l'utilisateur (le navigateur refuserait le son).
    ui(kind) {
      if (muted || (navigator.userActivation && !navigator.userActivation.hasBeenActive) || !ensure()) return;
      ctx.resume?.();
      const t = ctx.currentTime;
      const tone = (f0, f1, at, len, vol, type = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t + at);
        osc.frequency.exponentialRampToValueAtTime(f1, t + at + len);
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(vol, t + at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        osc.connect(g).connect(master);
        osc.start(t + at);
        osc.stop(t + at + len + 0.02);
      };
      if (kind === 'move') tone(1500, 1250, 0, 0.045, 0.018);
      else if (kind === 'select') { tone(660, 680, 0, 0.09, 0.035, 'triangle'); tone(990, 1010, 0.06, 0.14, 0.03, 'triangle'); }
      else if (kind === 'back') tone(720, 480, 0, 0.11, 0.03, 'triangle');
      // en jeu : onglet (clic très bref), panneau qui s'ouvre (souffle qui monte) ou se ferme (qui descend),
      // notification (une note claire), succès (trois notes qui montent, scintillantes), geste refusé (deux notes
      // graves). Toujours discrets : le jeu se joue des heures.
      else if (kind === 'tab') tone(1800, 1600, 0, 0.03, 0.012);
      else if (kind === 'open') tone(420, 620, 0, 0.12, 0.016, 'triangle');
      else if (kind === 'close') tone(560, 380, 0, 0.1, 0.014, 'triangle');
      else if (kind === 'notify') { tone(1320, 1330, 0, 0.18, 0.02); tone(1980, 1990, 0.05, 0.16, 0.008); }
      else if (kind === 'achievement') {
        [[1047, 0], [1319, 0.09], [1568, 0.18], [2093, 0.27]].forEach(([f, at], k) => tone(f, f * 1.004, at, k === 3 ? 0.5 : 0.22, k === 3 ? 0.026 : 0.022, 'triangle'));
        tone(3136, 3150, 0.3, 0.35, 0.006);
      } else if (kind === 'error') { tone(260, 240, 0, 0.09, 0.03, 'triangle'); tone(220, 200, 0.11, 0.12, 0.03, 'triangle'); }
      // chantier lancé : un coup sourd (la première pierre), puis deux notes claires qui montent
      else if (kind === 'build') {
        tone(150, 62, 0, 0.22, 0.06, 'triangle');
        tone(880, 884, 0.1, 0.2, 0.022, 'triangle');
        tone(1320, 1326, 0.19, 0.34, 0.02, 'triangle');
      } else if (kind === 'hold') {
        // appui long (bouton « maintenir pour construire ») : une note qui monte tant qu'on appuie. Renvoie de quoi
        // l'arrêter en douceur si le doigt se lève avant la fin.
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(820, t + 0.75);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.016, t + 0.08);
        g.gain.setValueAtTime(0.016, t + 0.62);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        osc.connect(g).connect(master);
        osc.start(t);
        osc.stop(t + 0.82);
        return () => {
          const now = ctx.currentTime;
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(0, now, 0.025);
          try { osc.stop(now + 0.12); } catch { /* déjà arrêté */ }
        };
      }
      return null;
    },
    stop() {
      if (!ctx) return;
      const old = ctx;
      const t = old.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setTargetAtTime(0, t, 0.4);
      ctx = null; // un prochain start() repart sur un contexte neuf pendant que l'ancien s'éteint
      setTimeout(() => old.close(), 1500);
    },
  };
}
