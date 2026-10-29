import React, { useEffect, useRef, useState } from 'react';
import { BUILDINGS, upgradeCost } from '../game/constants';
import { BUILDING_KIND, buildingStats, investmentPreview } from '../game/economy';
import { duesNow, matchesToAfford, seasonEndForecast } from '../game/advice';
import { fmtMoney } from './format';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { useInputMode } from './input';
import { holdCharge } from './charge';
import { PHONE, useSwipe } from './gestures';
import { IconCheck, IconChevron, IconClose, IconLock, IconStar } from './icons';
import { Eyebrow } from './kit';
import { t, tn, tr } from '../i18n/index';

// Vitrine de construction (fiche d'une parcelle, src/ui/inspector.jsx) : cartes illustrées des bâtiments, fenêtre
// d'aperçu des niveaux (avant / après), bouton d'achat à maintenir au doigt. Les vignettes (public/ui/buildings,
// un bâtiment par niveau) sont rendues avec les modèles 3D du jeu.

export const imgOf = (key, lvl) => `${import.meta.env.BASE_URL}ui/buildings/${key}_L${lvl}.webp`;

// Rôle de chaque bâtiment, en une phrase.
export const BLURB = {
  terrain: t('Plus de places, plus de recettes les jours de match.'),
  training: t('Entre deux matchs, quatre de tes joueurs passent une épreuve en 3D : à jouer toi-même ou à simuler.'),
  academy: t('Ton équipe de jeunes : six places gratuites, de nouveaux talents repérés après chaque journée.'),
  fans: t('Plus de public, des recettes annexes et de la réputation à chaque match.'),
  sponsor: t('Des partenaires qui paient chaque saison, et des revenus pendant ton absence.'),
  transfers: t('Des recruteurs qui t’ouvrent le marché des joueurs sous contrat.'),
  direction: t('Le bureau du président : tu y négocies les droits TV, les salaires et la billetterie.'),
  medical: t('Tes kinés soignent les blessés pour les faire revenir plus vite, et la prévention en évite.'),
  league: t('Crée tes championnats entre amis : invite-les par un lien, chacun avec son club, journée chaque soir.'),
};

// Ce que rapporte un niveau, avant de cliquer : recettes en plus par saison, entretien, rentabilité.
const SPORTING = { training: t('il fait progresser l’équipe'), academy: t('il forme de jeunes talents'), transfers: t('il ouvre le marché des joueurs sous contrat'), medical: t('il soigne et protège tes joueurs') };
export function Payoff({ state, k, target, compact = false }) {
  const inv = investmentPreview(state, k, target);
  if (SPORTING[k]) {
    return <span className="ins-money">{tr('Investissement sportif<0/> · entretien +<1/> par saison', [compact ? '' : t(' : il ne rapporte pas d’argent, {v}', { v: SPORTING[k] }), fmtMoney(inv.upkeep)])}</span>;
  }
  if (inv.gain <= 0) {
    return <span className="ins-money muted">{tr('<0/> · entretien +<1/>', [k === 'terrain' ? t('Aucune recette en plus tant que le stade n’est pas plein') : t('Aucune recette en plus pour l’instant'), fmtMoney(inv.upkeep)])}</span>;
  }
  const when = inv.payback === null ? t('ne couvre pas son entretien')
    : tn(inv.payback, 'rentabilisé en moins d’une saison', 'rentabilisé en {ceil} saisons environ', { ceil: Math.ceil(inv.payback) }, !(inv.payback <= 1));
  return (
    <span className={`ins-money ${inv.payback === null ? 'muted' : 'good'}`}>{tr('+<0/> de recettes par saison<1/> · <2/>', [fmtMoney(inv.gain), compact ? '' : t(' · entretien +{upkeep}', { upkeep: fmtMoney(inv.upkeep) }), when])}</span>
  );
}

// Sous le bouton d'achat : ce qui manque (et combien de matchs à domicile pour l'avoir), la fin de saison dans le
// rouge, une caisse qui ne couvrirait plus ce qui est déjà dû (salaires et entretien, payés au bilan), ou ce qui restera
// réellement disponible.
export function spendHint(state, cost) {
  const missing = cost - state.money;
  if (missing > 0) {
    const m = matchesToAfford(state, missing);
    return { tone: '', text: t('Il manque {missing}{v}', { missing: fmtMoney(missing), v: m ? tn(m, ' · environ {m} match à domicile', ' · environ {m} matchs à domicile', { m }, m > 1) : '' }) };
  }
  const endAfter = seasonEndForecast(state) - cost - Math.round(cost * 0.04);
  if (endAfter < 0) return { tone: 'risk', text: t('Attention : fin de saison prévue dans le rouge ({endAfter})', { endAfter: fmtMoney(endAfter) }) };
  const due = duesNow(state);
  if (due.available - cost < 0) return { tone: 'warn', text: t('Après travaux, ta caisse ne couvre plus les {owed} déjà dus en salaires et entretien : les recettes des matchs restants devront compléter', { owed: fmtMoney(due.owed) }) };
  return { tone: '', text: t('Disponible après travaux : {v}', { v: fmtMoney(due.available - cost) }) };
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
        {recommended && <i className="bcard-rec"><IconStar /><span>{t('Conseillé')}</span></i>}
      </span>
      <strong className="bcard-name">{BUILDINGS[k].name}</strong>
      <span className="bcard-hero">{hero.short || hero.value}</span>
      <span className="bcard-price"><b>{fmtMoney(cost)}</b><em>{tr('Il manque <0/>', [fmtMoney(missing)])}</em></span>
    </button>
  );
}

// Rangée des niveaux (vignettes) : construits, prochain, à venir. Un clic montre le niveau (image, chiffres, et
// l'hologramme sur la parcelle).
export function LevelStrip({ k, current, shown, onShow }) {
  const max = BUILDINGS[k].max;
  return (
    <div className="lvstrip" role="radiogroup" aria-label={t('Niveaux')} style={{ '--n': max }}>
      {Array.from({ length: max }, (_, i) => {
        const l = i + 1;
        const kind = l <= current ? 'built' : l === current + 1 ? 'next' : 'later';
        const label = l <= current ? t('construit') : l === current + 1 ? fmtMoney(upgradeCost(k, l)) : t('après le niveau {v}', { v: l - 1 });
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={shown === l}
            className={`lv ${kind} ${shown === l ? 'on' : ''}`}
            onClick={() => onShow(l)}
            title={t('Niveau {l} · {label}', { l, label })}
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
              {before && !was && <em>{t('nouveau')}</em>}
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
      <span className="hold-label">{nudge ? t('Garde le doigt appuyé') : children}</span>
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
        <HoldButton k={k} onConfirm={onAction} disabled={state.money < cost}>{current ? t('Améliorer') : t('Construire')} · {fmtMoney(cost)}</HoldButton>
        <span className={`ins-hint ${hint.tone}`}>{hint.text}</span>
      </>
    );
  } else if (shown > next) {
    foot = (
      <>
        <p className="bw-note">{tr('<0/> Niveau <1/> : <2/>, après le niveau <3/>', [<IconLock />, shown, fmtMoney(cost), shown - 1])}</p>
        <button type="button" className="btn ghost wide" onClick={() => onShow(next)}>{tr('Revenir au niveau <0/>', [next])}</button>
      </>
    );
  } else {
    foot = <p className="bw-note built">{tr('<0/> Niveau <1/> construit<2/>', [<IconCheck />, shown, shown === current ? t(' · niveau actuel') : ''])}</p>;
  }
  return (
    <section ref={ref} className="bw" aria-label={t('Aperçu : {name}', { name: b.name })}>
      <span className="grip" aria-hidden="true" />
      <header className="bw-head">
        <div className="panel-title">
          <Eyebrow>{BUILDING_KIND[k]}{recommended ? t(' · Conseillé par le staff') : ''}</Eyebrow>
          <h3>{b.name}</h3>
        </div>
        {onClose && <button type="button" className="hud-icon" onClick={onClose} aria-label={t('Fermer l’aperçu')}><IconClose /></button>}
      </header>
      <div className="bw-body">
        <figure className="bw-hero" key={`${k}-${shown}`}>
          <img src={imgOf(k, shown)} alt={t('{name}, niveau {shown}', { name: b.name, shown })} draggable="false" />
          <figcaption>{tr('Niveau <0/><1/>', [shown, <span> / {b.max}</span>])}</figcaption>
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
