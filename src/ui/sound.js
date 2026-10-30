// Ambiance sonore du stade, synthétisée avec Web Audio (aucun fichier) : rumeur de foule, « ooh » sur
// les occasions, clameur sur les buts, soupir quand on encaisse, sifflet de l'arbitre.
// Le contexte audio est créé au premier geste de l'utilisateur (coup d'envoi), comme l'exigent les navigateurs.

const KEY = 'fo-sound';
// Musique de fond (1.0.6, demande du PDG) : la chanson du jeu en boucle, douce, à son volume (Réglages : une jauge de 0 à
// 100 %, 50 % par défaut), dans son propre contexte audio (celui du stade s'éteint après chaque match). Elle s'efface en fondu
// pendant les matchs, les rejeux, les épreuves et les cérémonies, quand le jeu est caché ou le son coupé, puis reprend là
// où elle en était. Fichier : public/audio/footoff-empire.mp3 (-16 LUFS, 96 kb/s, 3 min 18), jamais précaché.
// Sans élément audio (1.0.9, demande du PDG) : téléchargée puis décodée dans le contexte audio du jeu ; un élément audio en
// faisait, sur iPhone, un morceau du lecteur du téléphone (écran verrouillé, Dynamic Island, pause). Session « ambient »
// (Safari 16.4+) : un son de jeu, qui se mêle à la musique du joueur et se tait en mode silencieux. Décodée à 32 kHz (le
// fichier n'a rien au-dessus de 16 kHz) : 51 Mo en mémoire au lieu de 76.
const MUSIC_KEY = 'fo-music';
const MUSIC_URL = `${import.meta.env.BASE_URL}audio/footoff-empire.mp3`;
const MUSIC_RATE = 32000;
const MUSIC_LEVEL = 0.55; // à 100 % : la chanson sous le stade et les sons du menu
// Musique en attente d'un geste (1.0.8) : la lecture a été refusée par le navigateur (règle des sites qui jouent du son :
// il faut un toucher, un clic ou une touche) ; l'écran de chargement le dit (loading.jsx, useMusicWaiting).
let musicWaitingNow = false;
const musicSubs = new Set();
export const musicWaiting = {
  get: () => musicWaitingNow,
  subscribe(f) { musicSubs.add(f); return () => musicSubs.delete(f); },
};
const setMusicWaiting = (w) => {
  if (w === musicWaitingNow) return;
  musicWaitingNow = w;
  for (const f of musicSubs) f();
};
const musicLevel = (v) => (Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 20) / 20 : 0.5); // pas de 5 %

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
  let base = 0; // niveau de la rumeur entre deux clameurs : celui du match (start), sinon le silence
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch { /* préférence indisponible */ }
  let musicVol = 0.5;
  try {
    const v = localStorage.getItem(MUSIC_KEY);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) musicVol = musicLevel(Number(v));
  } catch { /* préférence indisponible : douce par défaut */ }
  let mctx = null;
  let mgain = null;
  let mbuf = null; // la chanson décodée
  let mload = null; // téléchargement et décodage en cours
  let msrc = null; // la lecture en cours
  let mpos = 0; // où en est la chanson (s) au départ de la lecture en cours, ou à son arrêt
  let mat = 0; // départ de la lecture en cours (horloge du contexte)
  let mwanted = false;
  let mtimer = 0;
  let mwait = 0;
  const musicOn = () => mwanted && !muted && musicVol > 0;
  // en attente d'un geste : voulue, mais le navigateur garde le contexte audio suspendu
  const musicCheck = () => setMusicWaiting(!!mctx && musicOn() && mctx.state !== 'running');
  function musicReady() {
    if (mctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* navigateur sans session audio */ }
    mctx = new AC();
    mgain = mctx.createGain();
    mgain.gain.value = 0;
    mgain.connect(mctx.destination);
    mctx.onstatechange = () => { if (mctx.state === 'running' && musicOn() && !msrc) music(); musicCheck(); };
    return true;
  }
  const decode = (c, data) => new Promise((ok, ko) => { const p = c.decodeAudioData(data, ok, ko); p?.then?.(ok, ko); });
  function musicLoad() {
    if (mbuf || mload) return;
    mload = fetch(MUSIC_URL)
      .then((r) => { if (!r.ok) throw new Error(`musique ${r.status}`); return r.arrayBuffer(); })
      .then((data) => {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        let c = mctx;
        try { if (OAC) c = new OAC(2, 1, MUSIC_RATE); } catch { /* décodée au rythme du contexte */ }
        return decode(c, data);
      })
      .then((b) => { mbuf = b; if (musicOn()) music(); })
      .catch(() => { mload = null; }); // réseau perdu : nouvel essai au prochain geste
  }
  function musicStart() { // vrai si une lecture vient de partir (là où la chanson s'était arrêtée)
    if (msrc || !mbuf || mctx.state !== 'running') return false;
    msrc = mctx.createBufferSource();
    msrc.buffer = mbuf;
    msrc.loop = true;
    msrc.connect(mgain);
    mpos %= mbuf.duration;
    mat = mctx.currentTime;
    msrc.start(0, mpos);
    return true;
  }
  function musicStop() {
    if (!msrc) return;
    mpos = (mpos + mctx.currentTime - mat) % mbuf.duration;
    try { msrc.stop(); } catch { /* déjà arrêtée */ }
    msrc.disconnect();
    msrc = null;
  }
  function music(quick = false) { // quick : le joueur règle le volume, il l'entend aussitôt
    const on = musicOn();
    if (!mctx && !on) return;
    // dès l'écran de chargement (1.0.8, demande du PDG) : la lecture est tentée tout de suite ; un navigateur qui exige un
    // geste garde le contexte suspendu, elle part alors au premier toucher, clic ou touche
    if (!musicReady()) return;
    const t = mctx.currentTime;
    const g = mgain.gain;
    clearTimeout(mtimer);
    if (on) {
      musicLoad();
      if (mctx.state !== 'running') {
        mctx.resume?.()?.then?.(musicCheck, musicCheck);
        // iPhone : un son muet lancé pendant le geste déverrouille le contexte
        const s = mctx.createBufferSource();
        s.buffer = mctx.createBuffer(1, 1, mctx.sampleRate);
        s.connect(mctx.destination);
        s.start(0);
        clearTimeout(mwait);
        mwait = setTimeout(musicCheck, 600);
      }
      const fresh = musicStart();
      g.cancelScheduledValues(t);
      g.setValueAtTime(fresh ? 0 : g.value, t);
      g.linearRampToValueAtTime(musicVol * MUSIC_LEVEL, t + (quick && !fresh ? 0.15 : 2));
    } else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 1.2);
      mtimer = setTimeout(() => { if (!musicOn()) musicStop(); }, 1300);
      setMusicWaiting(false);
    }
  }
  if (typeof window !== 'undefined') {
    const kick = () => { if (musicOn() && (!mctx || mctx.state !== 'running' || !msrc)) music(); };
    // l'iPhone ne débloque le son qu'à la fin d'un toucher (touchend, click) ; la souris et le clavier dès l'appui
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, kick, { capture: true, passive: true });
  }

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
    g.linearRampToValueAtTime(base, t + attack + release);
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
    start() { if (ensure()) { ctx.resume?.(); base = 0.18; swell(0.18, 1.5, 0.1); } },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch { /* idem */ }
      if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
      music();
    },
    // musique de fond : voulue ou non à cet instant (App : hors match, rejeu, épreuves, cérémonies, jeu visible)
    setMusic(on) { mwanted = !!on; music(); },
    get musicVolume() { return musicVol; },
    setMusicVolume(v) {
      musicVol = musicLevel(v);
      try { localStorage.setItem(MUSIC_KEY, String(musicVol)); } catch { /* gardé pour la session */ }
      music(true);
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
    // Épreuves du centre d'entraînement : frappe, filet, cible touchée, montant, appui du viseur, compte à rebours,
    // arrêt du gardien, saut d'une haie, haie renversée, bonne ou mauvaise lecture. Tout est synthétisé. Pas de
    // public à l'entraînement : aucun de ces sons ne touche à la rumeur de la foule.
    sfx(kind) {
      if (muted || !ensure()) return;
      ctx.resume?.();
      const t = ctx.currentTime;
      const tone = (f0, f1, at, len, vol, type = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t + at);
        osc.frequency.exponentialRampToValueAtTime(f1, t + at + len);
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(vol, t + at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        osc.connect(g).connect(master);
        osc.start(t + at);
        osc.stop(t + at + len + 0.02);
      };
      const hiss = (at, len, vol, freq, q = 0.8, type = 'bandpass') => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, Math.max(0.2, len + 0.05));
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(vol, t + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        src.connect(f).connect(g).connect(master);
        src.start(t + at);
        src.stop(t + at + len + 0.05);
      };
      if (kind === 'kick') { tone(150, 48, 0, 0.16, 0.22); hiss(0, 0.05, 0.35, 2400, 0.7); } // frappe : coup sourd + claquement du cuir
      else if (kind === 'net') hiss(0, 0.32, 0.5, 3200, 0.6); // filet qui se gonfle
      else if (kind === 'hit') { tone(1320, 1330, 0, 0.22, 0.05, 'triangle'); tone(1980, 1990, 0.05, 0.3, 0.03, 'triangle'); }
      else if (kind === 'perfect') {
        [[1047, 0], [1568, 0.06], [2093, 0.12]].forEach(([fq, at]) => tone(fq, fq * 1.003, at, 0.4, 0.04, 'triangle'));
        hiss(0.02, 0.5, 0.06, 6000, 1.2);
      } else if (kind === 'post') { tone(940, 930, 0, 0.6, 0.07, 'triangle'); tone(1480, 1470, 0, 0.45, 0.04); tone(2210, 2200, 0, 0.3, 0.02); }
      else if (kind === 'miss') tone(330, 250, 0, 0.24, 0.035, 'triangle'); // raté : une note qui retombe
      else if (kind === 'lock') tone(1700, 1650, 0, 0.05, 0.03, 'square');
      else if (kind === 'beep') tone(880, 880, 0, 0.12, 0.05, 'triangle');
      else if (kind === 'go') { tone(1320, 1320, 0, 0.32, 0.07, 'triangle'); tone(1760, 1760, 0, 0.32, 0.03); }
      else if (kind === 'save') { tone(110, 60, 0, 0.14, 0.2); hiss(0, 0.08, 0.3, 1200, 0.8); } // gants qui claquent
      else if (kind === 'goal') hiss(0, 0.35, 0.45, 3000, 0.6); // le ballon gonfle le filet
      else if (kind === 'jump') hiss(0, 0.18, 0.12, 900, 0.9, 'lowpass');
      else if (kind === 'step') tone(90, 60, 0, 0.05, 0.06);
      else if (kind === 'clip') { tone(420, 300, 0, 0.08, 0.08, 'square'); hiss(0, 0.06, 0.12, 1800); } // haie touchée
      else if (kind === 'crash') { tone(300, 120, 0, 0.18, 0.1, 'square'); hiss(0, 0.25, 0.25, 900); }
      else if (kind === 'good') { tone(990, 1000, 0, 0.16, 0.04, 'triangle'); tone(1485, 1490, 0.07, 0.22, 0.03, 'triangle'); }
      else if (kind === 'bad') { tone(300, 260, 0, 0.14, 0.05, 'triangle'); tone(240, 200, 0.12, 0.18, 0.05, 'triangle'); }
      else if (kind === 'whistle') whistle(1);
      else if (kind === 'finish') whistle(3);
    },
    stop() {
      if (!ctx) return;
      const old = ctx;
      const t = old.currentTime;
      crowdGain.gain.cancelScheduledValues(t);
      crowdGain.gain.setTargetAtTime(0, t, 0.4);
      base = 0;
      ctx = null; // un prochain start() repart sur un contexte neuf pendant que l'ancien s'éteint
      setTimeout(() => old.close(), 1500);
    },
  };
}
