import React, { useEffect, useRef, useState } from 'react';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { BUILDING_KIND, buildingStats, investmentPreview } from '../game/economy';
import { matchesToAfford, seasonEndForecast } from '../game/advice';
import { fmtMoney } from './format';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { useInputMode } from './input';
import { holdCharge } from './charge';
import { PHONE, useSwipe } from './gestures';
import { IconCheck, IconChevron, IconClose, IconLock, IconStar } from './icons';
import { Eyebrow } from './kit';

// Vitrine de construction (fiche d'une parcelle, src/ui/inspector.jsx) : cartes illustrées des bâtiments, fenêtre
// d'aperçu des niveaux (avant / après), bouton d'achat à maintenir au doigt. Les vignettes (public/ui/buildings,
// un bâtiment par niveau) sont rendues avec les modèles 3D du jeu.

export const imgOf = (key, lvl) => `${import.meta.env.BASE_URL}ui/buildings/${key}_L${lvl}.webp`;

// Rôle de chaque bâtiment, en une phrase.
export const BLURB = {
  terrain: 'Plus de places, plus de recettes les jours de match.',
  training: 'Tes joueurs progressent davantage à chaque intersaison.',
  academy: 'Un jeune talent rejoint ton effectif à chaque fin de saison.',
  fans: 'Plus de public, des recettes annexes et de la réputation à chaque match.',
  sponsor: 'Des partenaires qui paient chaque saison, et des revenus pendant ton absence.',
  transfers: 'Des recruteurs qui t’ouvrent le marché des joueurs sous contrat.',
};

// Ce que rapporte un niveau, avant de cliquer : recettes en plus par saison, entretien, rentabilité.
const SPORTING = { training: 'il fait progresser l’équipe', academy: 'il révèle de jeunes talents', transfers: 'il ouvre le marché des joueurs sous contrat' };
export function Payoff({ state, k, target, compact = false }) {
  const inv = investmentPreview(state, k, target);
  if (SPORTING[k]) {
    return <span className="ins-money">Investissement sportif{compact ? '' : ` : il ne rapporte pas d’argent, ${SPORTING[k]}`} · entretien +{fmtMoney(inv.upkeep)} par saison</span>;
  }
  if (inv.gain <= 0) {
    return <span className="ins-money muted">{k === 'terrain' ? 'Aucune recette en plus tant que le stade n’est pas plein' : 'Aucune recette en plus pour l’instant'} · entretien +{fmtMoney(inv.upkeep)}</span>;
  }
  const when = inv.payback === null ? 'ne couvre pas son entretien'
    : inv.payback <= 1 ? 'rentabilisé en moins d’une saison' : `rentabilisé en ${Math.ceil(inv.payback)} saisons environ`;
  return (
    <span className={`ins-money ${inv.payback === null ? 'muted' : 'good'}`}>
      +{fmtMoney(inv.gain)} de recettes par saison{compact ? '' : ` · entretien +${fmtMoney(inv.upkeep)}`} · {when}
    </span>
  );
}

// Sous le bouton d'achat : ce qui manque (et combien de matchs à domicile pour l'avoir), la fin de saison dans le
// rouge, ou la trésorerie qui restera.
export function spendHint(state, cost) {
  const missing = cost - state.money;
  if (missing > 0) {
    const m = matchesToAfford(state, missing);
    return { tone: '', text: `Il manque ${fmtMoney(missing)}${m ? ` · environ ${m} match${m > 1 ? 's' : ''} à domicile` : ''}` };
  }
  const endAfter = seasonEndForecast(state) - cost - Math.round(cost * 0.04);
  if (endAfter < 0) return { tone: 'risk', text: `Attention : fin de saison prévue dans le rouge (${fmtMoney(endAfter)})` };
  return { tone: '', text: `Trésorerie après travaux : ${fmtMoney(state.money - cost)}` };
}

// Carte de la vitrine : vignette, famille, nom, effet phare, prix (ou ce qui manque). Au doigt, sur téléphone, elle
// se réduit à sa vignette et son prix (le détail s'affiche dessous).
export function BuildCard({ state, k, picked, recommended, onPick }) {
  const cost = upgradeCost(k, 1);
  const missing = cost - state.money;
  const hero = buildingStats(k, 1, state)[0];
  return (
    <button
      type="button"
      className={`bcard ${picked ? 'on' : ''} ${missing > 0 ? 'short' : ''}`}
      data-key={k}
      aria-pressed={picked}
      aria-label={`${BUILDINGS[k].name}, ${fmtMoney(cost)}`}
      onClick={(e) => onPick(k, e)}
    >
      <span className="bcard-img">
        <img src={imgOf(k, 1)} alt="" draggable="false" />
        <i className="bcard-kind">{BUILDING_KIND[k]}</i>
        {recommended && <i className="bcard-rec"><IconStar /><span>Conseillé</span></i>}
      </span>
      <strong className="bcard-name">{BUILDINGS[k].name}</strong>
      <span className="bcard-hero">{hero.short || hero.value}</span>
      <span className="bcard-price"><b>{fmtMoney(cost)}</b><em>Il manque {fmtMoney(missing)}</em></span>
    </button>
  );
}

// Rangée des niveaux (vignettes) : construits, prochain, à venir. Un clic montre le niveau (image, chiffres, et
// l'hologramme sur la parcelle).
export function LevelStrip({ k, current, shown, onShow }) {
  const max = BUILDINGS[k].max;
  return (
    <div className="lvstrip" role="radiogroup" aria-label="Niveaux" style={{ '--n': max }}>
      {Array.from({ length: max }, (_, i) => {
        const l = i + 1;
        const kind = l <= current ? 'built' : l === current + 1 ? 'next' : 'later';
        const label = l <= current ? 'construit' : l === current + 1 ? fmtMoney(upgradeCost(k, l)) : `après le niveau ${l - 1}`;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={shown === l}
            className={`lv ${kind} ${shown === l ? 'on' : ''}`}
            onClick={() => onShow(l)}
            title={`Niveau ${l} · ${label}`}
          >
            <i className="lv-img" style={{ backgroundImage: `url(${imgOf(k, l)})` }} />
            <b>{l <= current ? <IconCheck /> : l}</b>
          </button>
        );
      })}
    </div>
  );
}

// Effets d'un niveau, chiffrés ; en regard, la valeur du niveau d'avant (barrée) quand elle change.
export function StatRows({ state, k, lvl, base = 0 }) {
  const now = buildingStats(k, lvl, state);
  const before = base > 0 ? buildingStats(k, base, state) : null;
  return (
    <dl className="bstats">
      {now.map((st, i) => {
        const was = before?.find((x) => x.label === st.label);
        return (
          <div key={st.label} className={i === 0 ? 'hero' : ''}>
            <dt>{st.label}{st.sub ? <small>{st.sub}</small> : null}</dt>
            <dd>
              {was && was.value !== st.value && <><s>{was.value}</s><IconChevron /></>}
              {before && !was && <em>nouveau</em>}
              <b>{st.value}</b>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// Bouton d'achat. Au doigt : appui long (0,7 s) — le bouton se remplit de lumière, l'hologramme de la parcelle se
// charge (src/ui/charge.js), une note monte, de petites vibrations rythment l'attente ; lâcher avant la fin annule,
// un simple toucher explique le geste. Souris, clavier et manette : un clic suffit.
const HOLD_MS = 700;
export function HoldButton({ onConfirm, disabled = false, k = null, children }) {
  const touch = useInputMode() === 'touch';
  const ref = useRef(null);
  const st = useRef({ raf: 0, t0: 0, pointer: null, stop: null, ticks: 0, holding: false, done: false });
  const [nudge, setNudge] = useState(false);
  useEffect(() => () => {
    cancelAnimationFrame(st.current.raf);
    st.current.stop?.();
    holdCharge.value = 0;
  }, []);
  useEffect(() => {
    if (!nudge) return undefined;
    const t = setTimeout(() => setNudge(false), 1500);
    return () => clearTimeout(t);
  }, [nudge]);

  const paint = (p) => {
    ref.current?.style.setProperty('--hold', p.toFixed(3));
    holdCharge.value = p;
  };
  const release = () => {
    const s = st.current;
    if (!s.holding) return;
    s.holding = false;
    cancelAnimationFrame(s.raf);
    s.stop?.();
    s.stop = null;
    ref.current?.classList.remove('holding');
    if (performance.now() - s.t0 < 260) setNudge(true); // simple toucher : on explique le geste
    const from = holdCharge.value;
    const t0 = performance.now();
    const fall = () => { // la jauge redescend en douceur
      const p = Math.max(0, from * (1 - (performance.now() - t0) / 220));
      paint(p);
      if (p > 0) s.raf = requestAnimationFrame(fall);
    };
    fall();
  };
  const down = (e) => {
    const s = st.current;
    s.pointer = e.pointerType;
    if (e.pointerType !== 'touch' || disabled) return;
    cancelAnimationFrame(s.raf);
    Object.assign(s, { holding: true, done: false, ticks: 0, t0: performance.now() });
    setNudge(false);
    ref.current.classList.add('holding');
    try { ref.current.setPointerCapture(e.pointerId); } catch { /* capture indisponible */ }
    s.stop = uiSound('hold') || null;
    haptic('tap');
    const step = () => {
      const p = Math.min(1, (performance.now() - s.t0) / HOLD_MS);
      paint(p);
      const tick = Math.floor(p * 4);
      if (tick > s.ticks && p < 1) { s.ticks = tick; haptic('tap'); }
      if (p < 1) { s.raf = requestAnimationFrame(step); return; }
      Object.assign(s, { holding: false, done: true, stop: null }); // la note finit seule
      ref.current?.classList.remove('holding');
      paint(0);
      onConfirm();
    };
    s.raf = requestAnimationFrame(step);
  };
  const click = (e) => {
    if (disabled) return;
    if (e.detail !== 0 && st.current.pointer === 'touch') return; // au doigt, c'est l'appui long qui décide
    onConfirm();
  };
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn-xl wide hold ${disabled ? '' : 'glow'} ${nudge ? 'nudge' : ''}`}
      data-key={k || undefined}
      data-noswipe=""
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={click}
    >
      <span className="hold-fill" aria-hidden="true" />
      {touch && !disabled && (
        <svg className="hold-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><circle className="p" cx="10" cy="10" r="7.5" pathLength="1" /></svg>
      )}
      <span className="hold-label">{nudge ? 'Garde le doigt appuyé' : children}</span>
    </button>
  );
}

// Fenêtre d'aperçu d'un bâtiment : grande vignette du niveau montré, rangée des niveaux, effets chiffrés (avant /
// après), rentabilité, et l'action du niveau suivant. À droite de l'écran sur PC, en feuille sur téléphone.
// current : niveau construit (0 sur une parcelle libre) ; shown : niveau montré.
export function BuildWindow({ state, k, current, shown, onShow, onAction, recommended = false, onClose = null }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose || undefined, downMedia: PHONE });
  const b = BUILDINGS[k];
  const next = current + 1;
  const cost = upgradeCost(k, shown);
  let foot;
  if (shown === next) {
    const hint = spendHint(state, cost);
    foot = (
      <>
        <HoldButton k={k} onConfirm={onAction} disabled={state.money < cost}>{current ? 'Améliorer' : 'Construire'} · {fmtMoney(cost)}</HoldButton>
        <span className={`ins-hint ${hint.tone}`}>{hint.text}</span>
      </>
    );
  } else if (shown > next) {
    foot = (
      <>
        <p className="bw-note"><IconLock /> Niveau {shown} : {fmtMoney(cost)}, après le niveau {shown - 1}</p>
        <button type="button" className="btn ghost wide" onClick={() => onShow(next)}>Revenir au niveau {next}</button>
      </>
    );
  } else {
    foot = <p className="bw-note built"><IconCheck /> Niveau {shown} construit{shown === current ? ' · niveau actuel' : ''}</p>;
  }
  return (
    <section ref={ref} className="bw" aria-label={`Aperçu : ${b.name}`}>
      <span className="grip" aria-hidden="true" />
      <header className="bw-head">
        <div className="panel-title">
          <Eyebrow>{BUILDING_KIND[k]}{recommended ? ' · Conseillé par le staff' : ''}</Eyebrow>
          <h3>{b.name}</h3>
        </div>
        {onClose && <button type="button" className="hud-icon" onClick={onClose} aria-label="Fermer l’aperçu"><IconClose /></button>}
      </header>
      <div className="bw-body">
        <figure className="bw-hero" key={`${k}-${shown}`}>
          <img src={imgOf(k, shown)} alt={`${b.name}, niveau ${shown}`} draggable="false" />
          <figcaption>Niveau {shown}<span> / {b.max}</span></figcaption>
        </figure>
        <p className="bw-blurb">{BLURB[k]}</p>
        <LevelStrip k={k} current={current} shown={shown} onShow={onShow} />
        <StatRows state={state} k={k} lvl={shown} base={shown - 1} />
        {shown > current && <Payoff state={state} k={k} target={shown} />}
      </div>
      <footer className="bw-foot">{foot}</footer>
    </section>
  );
}
