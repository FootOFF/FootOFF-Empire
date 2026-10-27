import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TACTICS, TACTIC_ORDER, fitWeight, formationOf, lineupRating, reshapeLineup } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { LIVE_VERSION, SUBS_MAX, createLiveMatch, liveKeyOf, pairSubs, prematchOdds, prematchXg, subMinute } from '../game/live';
import { saveLive } from '../game/save';
import { available, fitAt } from '../game/players';
import { Portrait } from './portrait';
import { teamCodes } from './teamcode';
import { BestEleven, FormationPicker, LineupBoard, displayNames, formationEffect } from './lineup';
import { IconChevron, IconClose, IconMute, IconPlay, IconSound, IconUsers } from './icons';
import { IconMedic } from './kit';
import { IconBall, IconSwap, IconWhistle } from './kit';
import { useKeydown } from './presence';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';
import { ClubCrest, Crest } from './crest';
import { clubStars } from '../game/crest';
import { DIVISIONS } from '../game/constants';
import { penaltySkills, shootoutWinChance } from '../game/cups';
import { pctOf } from '../game/mercato';
import { standingsOf } from '../game/season';
import { useFitText } from './fittext';

// Avant-match (onze + tactique + pronostic) et match en direct (score, chrono, fil de commentaires,
// vitesse, mi-temps avec changements sur le terrain). La 3D derrière est en mode « jour de match ».

// Pronostic : la barre victoire / nul / défaite, puis les trois chances en grand (les chiffres du moteur, arrondis
// pour faire 100 %).
function OddsBar({ odds }) {
  const [w, d, l] = roundPercents([odds.win, odds.draw, odds.loss]); // somme toujours égale à 100 %
  return (
    <div className="odds">
      <div className="odds-bar" aria-hidden="true">
        <i className="w" style={{ flexGrow: odds.win * 100 }} />
        <i className="d" style={{ flexGrow: odds.draw * 100 }} />
        <i className="l" style={{ flexGrow: odds.loss * 100 }} />
      </div>
      <div className="odds-legend">
        <span className="w"><b>{w.label}</b>Victoire</span>
        <span className="d"><b>{d.label}</b>Nul</span>
        <span className="l"><b>{l.label}</b>Défaite</span>
      </div>
    </div>
  );
}

// Effet exact d'une tactique sur les occasions (tactics.js : les nôtres, celles de l'adversaire).
const signed = (k) => { const v = Math.round((k - 1) * 100); return `${v > 0 ? '+' : '−'}${Math.abs(v)} %`; };
export const tacticEffect = (id) => {
  const t = TACTICS[id];
  return t.for === 1 && t.against === 1 ? 'le plan de référence' : `${signed(t.for)} d’occasions · ${signed(t.against)} subies`;
};

function TacticPicker({ value, onChange, compact }) {
  return (
    <div className={`tactics ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Tactique">
      {TACTIC_ORDER.map((id) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>
          <span className="tac-top"><strong>{TACTICS[id].name}</strong><em>{tacticEffect(id)}</em></span>
          {!compact && <span className="tac-blurb">{TACTICS[id].blurb}</span>}
        </button>
      ))}
    </div>
  );
}

// Carte de la composition repliée (avant-match, mi-temps) : un toucher la déploie.
function CompoCard({ title, detail, onOpen }) {
  return (
    <button type="button" className="compo-card" onClick={onOpen} aria-expanded="false">
      <span className="compo-card-icon"><IconUsers /></span>
      <span className="compo-card-text"><b>{title}</b><em>{detail}</em></span>
      <IconChevron className="compo-card-go" />
    </button>
  );
}

const narrowScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

// --- Avant-match -------------------------------------------------------------------------------------
// En haut, l'affiche (les deux clubs, leur classement et leur niveau), la billetterie du jour et le retour ; puis le
// onze sur le terrain et le banc, le dispositif et la tactique (chacun avec son effet exact sur les occasions) ; en
// bas de la colonne, collés à l'écran, le pronostic et le coup d'envoi : chaque réglage montre aussitôt son effet sur
// les chances de victoire, juste au-dessus du bouton qui lance le match. Sur téléphone, la composition est repliée
// dans une carte, comme à la mi-temps (dépliée, elle cachait tout le reste de l'avant-match).

export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [formation, setFormation] = useState(formationOf(state.formation).id);
  const [board, setBoard] = useState(() => !narrowScreen()); // composition dépliée sur PC, repliée sur téléphone
  // niveau de l'onze au coup d'envoi, condition physique comprise (comme le pronostic et le meilleur onze) ; au repos,
  // il vaudrait `rested` : la fatigue se lit à côté du niveau, les pourcentages ne la cachent plus
  const rating = lineupRating(state.players, lineup, formation, fitWeight);
  const rested = lineupRating(state.players, lineup, formation);
  const tired = rested - rating >= 0.05 ? rested - rating : 0;
  const xg = prematchXg(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // même moteur que le pronostic
  const odds = prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength }); // calculé sur le moteur
  // coupe : qualifié en gagnant, ou en gagnant la séance de tirs au but après un nul (chance exacte, tireurs et gardien de
  // ce onze) ; le nul ne compte plus pour une demi-qualification
  const pens = ctx.knockout ? penaltySkills(lineup.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)) : null;
  const qualify = pens ? odds.win + odds.draw * shootoutWinChance(pens.home, pens.away) : null;
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); };
  const form = formationOf(formation);
  // classement des deux clubs (championnat), dès la première journée jouée
  const table = standingsOf(state);
  const rowOf = (i) => { const k = table.findIndex((t) => t.i === i); return k < 0 || !table[k].played ? null : { rank: k + 1, pts: table[k].pts }; };
  const standing = (r) => (r ? `${r.rank === 1 ? '1er' : `${r.rank}e`} · ${r.pts} pt${r.pts > 1 ? 's' : ''} · ` : '');
  const me = rowOf(0);
  const them = ctx.comp === 'league' ? rowOf(ctx.oppIdx) : null;
  const league = ctx.comp === 'league';
  const homeRef = useFitText(state.clubName, 22);
  const awayRef = useFitText(ctx.opp.name, 22);

  useKeydown((e) => { if (e.key === 'Escape') onCancel(); });

  return (
    <div className={`matchscreen prematch ${board ? 'board-open' : 'board-closed'}`}>
      <header className="pm-head">
        <p className={`pm-eyebrow comp-${ctx.comp || 'league'}`}>{league ? `${DIVISIONS[state.divisionIndex].name} · ` : ''}{ctx.label || `Journée ${state.round + 1} / 7`} · À domicile</p>
        <div className="pm-top">
          <div className="pm-matchup">
            <div className="pm-team home">
              <ClubCrest crest={state.crest} name={state.clubName} className="pm-crest" stars={clubStars(state)} />
              <div className="pm-tname"><b ref={homeRef}>{state.clubName}</b><small title={tired ? `${fmtRating(rested)} au repos, ${fmtRating(tired)} de moins avec la fatigue` : undefined}>{standing(me)}niveau <strong>{fmtRating(rating)}</strong></small></div>
            </div>
            <span className="pm-vs" aria-label="contre">VS</span>
            <div className="pm-team away">
              <div className="pm-tname"><b ref={awayRef}>{ctx.opp.name}</b><small>{standing(them)}niveau <strong>{fmtRating(ctx.opp.strength)}</strong></small></div>
              <Crest name={ctx.opp.name} className="pm-crest" />
            </div>
          </div>
          {ctx.gate && (
            <div className="pm-gate glass" aria-label="Billetterie du jour">
              <div><small>Affluence attendue</small><b>{fmtNum(ctx.gate.attendance)} <em>/ {fmtNum(ctx.gate.capacity)}</em></b></div>
              <div><small>Recettes</small><b>≈ {fmtMoney(ctx.gate.revenue)}</b></div>
            </div>
          )}
          <button className="pm-close" onClick={onCancel} aria-label="Retour au complexe"><IconClose /></button>
        </div>
      </header>

      <div className="pm-grid">
        {board ? (
          <section className="pm-xi glass" aria-label="Onze de départ">
            <div className="pm-xi-head">
              <h3 className="pm-sh mark-head">Onze de départ · <span className="nowrap">{form.name}</span></h3>
              <span className="pm-level">Niveau <b>{fmtRating(rating)}</b>{tired > 0 && <em className="pm-tired" title={`${fmtRating(rested)} au repos`}>fatigue −{fmtRating(tired)}</em>}</span>
              <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
              <button type="button" className="pm-fold" onClick={() => setBoard(false)}>Replier</button>
            </div>
            <LineupBoard players={state.players} lineup={lineup} formation={formation} onChange={setLineup} fitness={(p) => fitAt(p, 0)} />
          </section>
        ) : (
          <div className="pm-compo">
            <CompoCard title="Composition" detail={`Onze en ${form.name} · niveau ${fmtRating(rating)}${tired ? ` (fatigue −${fmtRating(tired)})` : ''}`} onOpen={() => setBoard(true)} />
            <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
          </div>
        )}
        <section className="pm-plan glass" aria-label="Dispositif et tactique">
          <h3 className="pm-sh mark-head">Dispositif</h3>
          <FormationPicker value={formation} onChange={reshape} />
          <p className="pm-blurb">{form.blurb} <span className="pm-effect">{formationEffect(formation)}</span></p>
          <h3 className="pm-sh mark-head">Tactique</h3>
          <TacticPicker value={tactic} onChange={setTactic} />
        </section>
        <div className="pm-go">
          <section className="pm-odds glass" aria-label="Pronostic">
            <div className="pm-odds-head">
              <h3 className="pm-sh mark-head">Pronostic</h3>
              <span className="pm-xg">Buts attendus <b>{fmtRating(xg.for)}</b> – <b>{fmtRating(xg.against)}</b></span>
            </div>
            <OddsBar odds={odds} />
            {ctx.knockout && <p className="pm-xg pm-ko">Élimination directe, tirs au but en cas d’égalité ({pctOf(shootoutWinChance(pens.home, pens.away))} % pour toi) · qualification <b>{pctOf(qualify)} %</b></p>}
            <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation)}><IconPlay className="fill" /> Coup d’envoi</button>
          </section>
        </div>
      </div>
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------

const ICON = { goal: <IconBall />, sub: <IconSwap />, injury: <IconMedic />, kickoff: <IconWhistle />, halftime: <IconWhistle />, fulltime: <IconWhistle /> };
const LOOKAHEAD = 14; // minutes simulées d'avance sur l'horloge : la scène 3D prépare chaque action avant son commentaire

// Les classes tirées des données du match sont toujours préfixées (ev-side-…, ev-out-…) : un nom nu comme
// « post » (tir sur le poteau) prenait les styles de l'écran d'après-match (.post) et figeait la ligne en haut du fil.
// Ligne mémorisée : l'horloge du direct avance vingt fois par seconde, le fil ne se redessine pas pour autant.
const EventRow = React.memo(function EventRow({ e }) {
  return (
    <li className={['ev', `ev-${e.type}`, e.side && `ev-side-${e.side}`, e.outcome && `ev-out-${e.outcome}`].filter(Boolean).join(' ')}>
      <span className="ev-min">{e.minute}′</span>
      <span className="ev-icon">{e.type === 'yellow' || e.type === 'red' ? <i className={`card ${e.type}`} /> : ICON[e.type] || null}</span>
      <span className="ev-text">{e.type === 'goal' && e.lead ? <><span className="ev-lead">{e.lead}</span> {e.text}</> : e.text}</span>
    </li>
  );
});

// Temps forts du match (affichage seulement, rien n'est tiré ici) : une barre toutes les deux minutes, vers le haut quand
// le FootOFF FC pousse, vers le bas quand c'est l'adversaire, un point blanc sur chaque but. La poussée d'une tranche
// vient des tirs déjà montrés par le direct (chacun selon sa qualité, les buts davantage), retombe peu à peu dans les
// tranches suivantes, et penche légèrement du côté de la possession de la mi-temps.
const SLOTS = 45; // 23 tranches pour la première période (temps additionnel dans la dernière), 22 pour la seconde
const slotOf = (at, half) => (half === 1 ? Math.min(22, Math.floor(Math.max(0, at - 0.001) / 2)) : 23 + Math.min(21, Math.floor(Math.max(0, at - 45.001) / 2)));
function Momentum({ shown, upTo, possHalf, names, codes }) {
  const { bars, goals } = useMemo(() => {
    const raw = new Array(SLOTS).fill(0);
    const gl = [];
    for (const e of shown) {
      if (e.type !== 'chance' && e.type !== 'goal') continue;
      const b = slotOf(e.at, e.half);
      const w = (e.type === 'goal' ? 1.6 : e.outcome === 'saved' || e.outcome === 'post' ? 1 : 0.6) * (0.5 + (e.xg ?? 0.1) * 4);
      raw[b] += e.side === 'home' ? w : -w;
      if (e.type === 'goal') gl.push({ b, side: e.side });
    }
    const out = [];
    let acc = 0;
    for (let b = 0; b <= upTo; b++) {
      acc = acc * 0.55 + raw[b];
      const poss = possHalf[b < 23 ? 0 : 1];
      out.push(acc + (poss == null ? 0 : ((poss - 50) / 50) * 0.5));
    }
    return { bars: out, goals: gl };
  }, [shown, upTo, possHalf]);
  const W = 450, H = 64, mid = H / 2, step = W / SLOTS, max = mid - 7;
  const hOf = (v) => Math.max(1.5, Math.min(1, Math.abs(v) / 2.4) * max);
  return (
    <div className="lv-moment">
      <div className="lv-moment-head">
        <span>Temps forts</span>
        <span className="lv-legend">
          <span><i className="h" /><span className="hide-sm">{names[0]}</span><span className="show-sm">{codes[0]}</span></span>
          <span><i className="a" /><span className="hide-sm">{names[1]}</span><span className="show-sm">{codes[1]}</span></span>
        </span>
      </div>
      <div className="lv-moment-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="past" x1={0} x2={(upTo + 1) * step} y1={mid} y2={mid} />
          <line className="base" x1={(upTo + 1) * step} x2={W} y1={mid} y2={mid} />
          {bars.map((v, b) => {
            if (Math.abs(v) < 0.1) return null; // tranche calme : pas de barre
            const h = hOf(v);
            return <rect key={b} className={v >= 0 ? 'h' : 'a'} x={b * step + 1} width={step - 2.4} y={v >= 0 ? mid - h : mid} height={h} />;
          })}
        </svg>
        {/* un point blanc par but, au bout de la barre de sa tranche (hors du dessin étiré : il reste rond) */}
        {goals.map((g, i) => {
          const h = hOf(bars[g.b] ?? 0);
          const top = g.side === 'home' ? Math.max(4, mid - h - 6) : Math.min(H - 4, mid + h + 6);
          return <i key={i} className="lv-gdot" style={{ left: `${((g.b + 0.5) * step - 0.7) / W * 100}%`, top }} aria-hidden="true" />;
        })}
      </div>
    </div>
  );
}

// Bandeau du but, façon habillage télé : « BUT ! », le buteur (portrait, minute, passeur, combientième but de sa
// saison), le score.
function GoalBanner({ banner, state, m, shown, codes }) {
  const ours = banner.ours;
  const p = ours ? state.players.find((q) => q.id === banner.playerId) : (m.awayRoster || []).find((q) => q.name === banner.player);
  const nth = ours && p ? (p.season?.goals || 0) + shown.filter((e) => e.type === 'goal' && e.playerId === banner.playerId
    && (e.half < banner.half || (e.half === banner.half && e.at <= banner.at))).length : 0;
  const facts = [`${banner.minute}′`, banner.assist && `passe de ${banner.assist}`, nth && `${nth === 1 ? 'premier' : `${nth}e`} but de la saison`].filter(Boolean);
  return (
    <div className={`lv-goal ${ours ? 'ours' : 'theirs'} ${banner.fast ? 'fast' : ''}`} role="status">
      <span className="lv-goal-word">{ours ? 'But !' : `But ${codes[1]}`}</span>
      <span className="lv-goal-who">
        {p && <Portrait p={p} club={ours ? null : m.away} size={64} />}
        <span className="lv-goal-text"><b>{banner.player}</b><small>{facts.join(' · ')}</small></span>
      </span>
      <span className="lv-goal-score">{banner.score.home}-{banner.score.away}</span>
    </div>
  );
}

// Statistiques du direct : seulement ce que le direct a déjà montré (le moteur a quelques minutes d'avance).
function shownStats(shown) {
  const x = { shots: [0, 0], on: [0, 0], saves: [0, 0], post: [0, 0], yellow: [0, 0], red: [0, 0] };
  for (const e of shown) {
    const i = e.side === 'home' ? 0 : 1;
    if (e.type === 'goal') { x.shots[i]++; x.on[i]++; } else if (e.type === 'chance') {
      x.shots[i]++;
      if (e.outcome === 'saved') { x.on[i]++; x.saves[1 - i]++; }
      if (e.outcome === 'post') x.post[i]++;
    } else if (e.type === 'yellow') x.yellow[i]++;
    else if (e.type === 'red') x.red[i]++;
  }
  return x;
}

// Changements de la mi-temps : ce qui change entre le onze de la première période et celui composé sur le terrain
// (entrants face aux sortants de leur poste, et niveau du onze avant → après).
function HalftimeChanges({ state, m, plan, onReset }) {
  const names = displayNames(state.players);
  const pairs = pairSubs(m.lineup, plan);
  const moved = plan.some((id, k) => m.lineup.includes(id) && m.lineup[k] !== id);
  if (!pairs.length && !moved) return <p className="ht-none">Aucun changement : l’équipe repart telle quelle.</p>;
  const before = lineupRating(state.players, m.lineup, m.formation);
  const after = lineupRating(state.players, plan, m.formation);
  return (
    <div className="ht-changes">
      {pairs.map(([id, out]) => (
        <div key={id} className="ht-swap">
          <span className="sub-way in">Entre</span><b>{names[id]}</b>
          <span className="sub-way out">Sort</span><b>{names[out]}</b>
        </div>
      ))}
      {moved && <span className="ht-moved">Postes réorganisés</span>}
      <div className="ht-changes-foot">
        <span>Niveau du onze {fmtRating(before)} → <b className={after >= before ? 'up' : 'down'}>{fmtRating(after)}</b></span>
        <button className="linkbtn sub-reset" onClick={onReset}>Annuler</button>
      </div>
    </div>
  );
}

// Reprise d'un direct interrompu (app fermée) : le fil tel qu'il était (la première période entière si la seconde est
// entamée), avec une ligne qui le dit en tête.
function resumedFeed(live, resume) {
  if (!resume) return [];
  const { half, revealed, clock, phase } = resume.ui;
  const seen = [...(half === 2 ? live.eventsOf(1) : []), ...live.eventsOf(half).slice(0, revealed)];
  const base = half === 1 ? 45 : 90;
  const mm = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const label = mm > base ? `${base}+${mm - base}` : `${mm}`;
  const text = phase === 'halftime' ? 'Le match reprend à la mi-temps, là où tu l’avais laissé.' : `Le match reprend à la ${label}e minute, là où tu l’avais laissé.`;
  return [{ at: clock, minute: label, type: 'info', side: null, text, half }, ...seen.reverse()];
}

// restore : direct sauvegardé à reprendre (App.jsx, après une fermeture de l'app) ; le direct se sauvegarde lui-même au
// fil du match (saveLive) pour être repris à la minute près.
export function LiveMatch({ state, ctx, sound, onFx, onFinish, preview = null, restore = null }) {
  const [live] = useState(() => createLiveMatch(state, ctx, restore?.engine || null)); // un seul match par montage (jamais recréé)
  const [half, setHalf] = useState(restore?.ui.half || 1);
  const [clock, setClock] = useState(restore ? Math.ceil(restore.ui.clock) : 0);
  const [speed, setSpeed] = useState(restore?.ui.speed || 1);
  // playing | subs (changement en cours de jeu) | halftime | fulltime ; un changement en préparation n'est pas repris
  const [phase, setPhase] = useState(['halftime', 'fulltime'].includes(restore?.ui.phase) ? restore.ui.phase : 'playing');
  // événements de la mi-temps en cours : un tableau que le moteur remplit au fil de l'horloge (advanceTo), avec
  // quelques minutes d'avance ; la scène 3D lit le même tableau
  const [events, setEvents] = useState(() => {
    if (restore) return live.eventsOf(restore.ui.half);
    live.beginHalf(1);
    live.advanceTo(LOOKAHEAD);
    return live.eventsOf(1);
  });
  const [shown, setShown] = useState(() => resumedFeed(live, restore));
  const [banner, setBanner] = useState(null);
  const [muted, setMuted] = useState(sound.muted);
  const pause = useRef(restore ? 1.2 : 0); // reprise : un court temps pour se replonger dans le match
  const clockRef = useRef(restore?.ui.clock || 0);
  const revealed = useRef(restore?.ui.revealed || 0);
  // identifiant stable par événement : un nouveau commentaire en tête du fil ne recrée pas (ni ne refait
  // apparaître) tous les autres
  const evKeys = useRef({ map: new WeakMap(), n: 0 });
  const keyOf = (e) => {
    const k = evKeys.current;
    if (!k.map.has(e)) k.map.set(e, ++k.n);
    return k.map.get(e);
  };
  const [plan, setPlan] = useState(null); // onze composé sur le terrain (mi-temps, changement en cours de jeu)
  const [tactic2, setTactic2] = useState(live.state.tactic);
  const [board, setBoard] = useState(false); // composition repliée : on la déploie pour faire ses changements
  const [sub, setSub] = useState(null); // changement en cours de jeu : { at: minute d'effet, note, err }
  const [lineupKey, setLineupKey] = useState(0); // le onze a changé : la scène 3D relit les noms
  const [tab, setTab] = useState('feed'); // téléphone : le fil, les statistiques ou le onze
  const codes = useMemo(() => teamCodes(live.state.home, live.state.away), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sauvegarde du direct, pour le reprendre à la minute près si l'app se ferme : à chaque étape (coup d'envoi,
  // changement, mi-temps, fin), au plus toutes les deux secondes pendant le jeu, et quand l'app passe en arrière-plan.
  const uiNow = useRef({ phase, half, speed });
  uiNow.current = { phase, half, speed };
  const savedAt = useRef(0);
  const persist = () => {
    if (preview) return;
    savedAt.current = performance.now();
    const { phase: ph, half: hf, speed: sp } = uiNow.current;
    saveLive({
      v: LIVE_VERSION, key: liveKeyOf(state, ctx), at: Date.now(), engine: live.save(Math.ceil(clockRef.current)),
      ui: { half: hf, clock: clockRef.current, revealed: revealed.current, phase: ph, speed: sp },
    });
  };
  useEffect(() => { persist(); }, [phase, half]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (preview) return undefined;
    const hide = () => { if (document.visibilityState === 'hidden') persist(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', persist);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', persist); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // scène 3D : elle lit l'horloge et les événements de la mi-temps dans le canal du direct
  const homeNames = () => live.state.lineup.map((id) => state.players.find((p) => p.id === id)?.name || '');
  useEffect(() => {
    Object.assign(matchFeed, {
      active: !preview, ended: false, phase, half, clock: clockRef.current, speed, pause: pause.current, events,
      formation: live.state.formation, homeNames: homeNames(), awayNames: live.state.awayRoster.map((p) => p.name),
      awayName: live.state.away, skipped: 0, rewound: 0,
    });
    return () => { matchFeed.active = false; matchFeed.hold = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Object.assign(matchFeed, { phase: phase === 'subs' ? 'playing' : phase, hold: phase === 'subs', half, events, speed, homeNames: homeNames(), rewound: live.state.rewound });
    if (phase === 'fulltime') matchFeed.ended = true;
  }, [phase, half, events, speed, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // aperçu (galerie) : direct déjà entamé, mi-temps, ou changement en cours de jeu
  useEffect(() => {
    if (!preview) return;
    const halftime = preview.phase === 'halftime';
    live.advanceTo(Infinity);
    // bandeau du but : le dernier but de la première période, figé (s'il y en a un)
    const goal = preview.goal ? [...events].reverse().find((e) => e.type === 'goal') : null;
    const upTo = halftime ? Infinity : goal ? goal.at : preview.minute;
    const seen = events.filter((e) => e.at <= upTo);
    revealed.current = seen.length;
    setShown([...seen].reverse());
    if (goal) setBanner({ ...goal, ours: goal.side === 'home', fast: false });
    const t = halftime ? live.halfEnd : goal ? goal.at : preview.minute;
    clockRef.current = t;
    setClock(t);
    if (halftime) setPhase('halftime');
    else if (preview.phase === 'subs') openSubs(null, true);
    else pause.current = Infinity; // vignette figée sur la minute demandée
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // coup de sifflet final : un court temps de respiration (« Terminé »), puis l'écran d'après-match
  const finished = useRef(false);
  useEffect(() => {
    if (phase !== 'fulltime' || finished.current) return undefined;
    const t = setTimeout(() => { finished.current = true; onFinish(live.result()); }, 1700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // horloge : avance le temps de jeu, simule quelques minutes d'avance, révèle les événements, marque une pause sur
  // les buts
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (pause.current > 0) { pause.current -= dt; matchFeed.pause = Math.max(0, pause.current); return; }
      matchFeed.pause = 0;
      const end = live.halfEnd;
      live.advanceTo(Math.ceil(clockRef.current) + LOOKAHEAD);
      let next = Math.min(end, clockRef.current + (dt * speed) / SEC_PER_MIN);
      // la 3D finit son action (tir en vol, faute pas encore commise) : le commentaire attend que le ballon arrive,
      // au plus quelques secondes (matchFeed.js)
      const up = events[revealed.current];
      if (up && matchFeed.waitAt === up.at && now < matchFeed.waitUntil && next >= up.at) next = Math.max(clockRef.current, up.at - 1e-6);
      clockRef.current = next;
      matchFeed.clock = next;
      setClock(Math.ceil(next)); // l'écran n'affiche que la minute : un rendu par minute de jeu, pas vingt par seconde
      while (revealed.current < events.length && events[revealed.current].at <= next) {
        const e = events[revealed.current++];
        setShown((s) => [e, ...s]);
        react(e);
        if (e.type === 'goal' || e.type === 'injury') break; // la suite attendra la fin de la célébration, ou le changement
      }
      if (now - savedAt.current > 2000) persist();
      if (next >= end && live.halfDone && revealed.current >= events.length) {
        setPhase(half === 1 ? 'halftime' : 'fulltime');
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase, speed, events, half]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = live.state;
  const subsLeftNow = () => SUBS_MAX - m.subsUsed;
  // remplaçants qui peuvent encore entrer : disponibles (ni blessés ni suspendus), pas déjà sortis
  const benchReady = () => state.players.some((p) => !m.lineup.includes(p.id) && available(p) && !m.gone.has(p.id) && !m.out.has(p.id));
  const canSub = () => subsLeftNow() > 0 && benchReady() && subMinute(clockRef.current) <= live.halfEnd;

  // changement en cours de jeu : le match s'arrête, la composition s'ouvre ; le changement prendra effet au prochain
  // arrêt de jeu (une à deux minutes plus tard, après tout ce que le direct a montré)
  function openSubs(note = null, open = false) {
    const at = subMinute(clockRef.current);
    setPlan([...m.lineup]);
    setTactic2(m.tactic);
    setBoard(open || !narrowScreen());
    setSub({ at, note, err: null });
    matchFeed.pause = 1e9; // la scène 3D attend
    setPhase('subs');
  }
  function closeSubs(apply) {
    if (apply && sub) {
      const err = live.change(sub.at, { lineup: plan, tactic: tactic2 });
      if (err) { setSub((x) => ({ ...x, err })); return; }
      live.advanceTo(Math.ceil(clockRef.current) + LOOKAHEAD);
      setLineupKey((k) => k + 1);
    }
    setSub(null);
    matchFeed.pause = Math.max(0, pause.current);
    setPhase('playing');
  }

  function react(e) {
    if (e.type === 'goal') {
      const ours = e.side === 'home';
      setBanner({ ...e, ours, fast: speed > 1 });
      pause.current = speed > 1 ? 1.6 : 4.4;
      matchFeed.pause = pause.current;
      setTimeout(() => setBanner(null), (speed > 1 ? 1.6 : 4.2) * 1000);
      if (ours) sound.goal(); else sound.conceded();
      onFx({ type: ours ? 'goal' : 'conceded', fast: speed > 1 });
    } else if (e.type === 'chance' && (e.outcome === 'post' || e.outcome === 'saved')) sound.chance();
    else if (e.type === 'yellow' || e.type === 'red') sound.card();
    else if (e.type === 'injury') { // un blessé : s'il reste un changement, le match s'arrête pour le faire
      sound.whistle(1);
      if (canSub()) openSubs(`${e.player} est blessé et ne peut pas continuer : fais entrer un remplaçant, ou continue à dix.`);
    } else if (e.type === 'halftime') { sound.whistle(2); onFx({ type: 'halftime' }); }
    else if (e.type === 'fulltime') { sound.whistle(3); onFx({ type: 'fulltime' }); }
  }

  const skip = () => { // fin de la mi-temps en cours, sans célébration ; le staff remplace un blessé (s'il reste un changement)
    live.advanceTo(Infinity, { staff: true });
    setLineupKey((k) => k + 1);
    const end = live.halfEnd;
    pause.current = 0;
    const rest = events.slice(revealed.current);
    revealed.current = events.length;
    clockRef.current = end;
    matchFeed.clock = end;
    matchFeed.skipped += 1;
    setClock(end);
    setShown((s) => [...rest.reverse(), ...s]);
    setBanner(null);
    if (rest.some((e) => e.type === 'goal')) onFx({ type: 'skip' });
    setPhase(half === 1 ? 'halftime' : 'fulltime');
    sound.whistle(half === 1 ? 2 : 3);
  };

  const resume = () => { // reprise de la seconde période, avec les changements et la tactique de la pause
    live.change(45, { lineup: plan || m.lineup, tactic: tactic2, halftime: true });
    live.beginHalf(2);
    live.advanceTo(45 + LOOKAHEAD);
    const h2 = live.eventsOf(2);
    setEvents(h2);
    revealed.current = 0;
    clockRef.current = 45;
    matchFeed.clock = 45;
    setClock(45);
    setHalf(2);
    setPhase('playing');
    sound.whistle(1);
  };

  useEffect(() => { if (phase === 'halftime') { setPlan([...m.lineup]); setTactic2(m.tactic); setBoard(!!preview?.board); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = plan || m.lineup;
  const plannedSubs = pairSubs(m.lineup, planned).length; // changements prévus sur le terrain
  const subsLeft = SUBS_MAX - m.subsUsed - plannedSubs; // changements encore possibles
  const boardOpen = phase === 'halftime' || phase === 'subs';
  // notes du match à cet instant (aide à choisir qui sort)
  const notes = useMemo(() => (boardOpen
    ? Object.fromEntries(live.result().players.filter(Boolean).map((x) => [x.id, x.rating])) : {}), [boardOpen, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const since = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : clockRef.current);
  const unavailable = useMemo(() => new Set([...state.players.filter((p) => !available(p)).map((p) => p.id), ...m.gone, ...m.out]), [boardOpen, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;
  // minute du pronostic : la minute affichée, la fin de la première période à la pause, la minute d'effet d'un changement
  const oddsMinute = phase === 'halftime' ? live.halfEnd : sub?.at ?? minute;
  // pronostic final, tel que le direct l'a montré (score, cartons et blessures déjà annoncés), avec le onze et la
  // tactique envisagés pendant un changement ou à la pause
  const odds = useMemo(() => (phase === 'fulltime' ? null
    : live.oddsShown(oddsMinute, shown, boardOpen ? { lineup: planned, tactic: tactic2 } : {})), [oddsMinute, shown, phase, plan, tactic2, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => shownStats(shown), [shown]);
  const div = DIVISIONS[state.divisionIndex].name;
  const round = ctx.comp === 'league' || !ctx.comp
    ? <><span className="hm-long">{div} · Journée </span><span className="hm-short">{div} · J</span>{state.round + 1}/{state.schedule.length}</> : ctx.label;
  const period = phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Fin du match${m.pens ? ` · t.a.b. ${m.pens[0]}-${m.pens[1]}` : ''}` : half === 1 ? '1re période' : '2e période';
  const clockEl = phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Terminé${m.pens ? ` · t.a.b. ${m.pens[0]}-${m.pens[1]}` : ''}`
    : <><i className={`live-dot ${phase === 'subs' ? 'hold' : ''}`} />{minuteLabel}′</>;
  const pct = odds ? roundPercents([odds.win, odds.draw, odds.loss]) : null;
  const xiNames = displayNames(state.players);

  const boardEl = (
    <LineupBoard
      players={state.players}
      lineup={planned}
      formation={m.formation}
      onChange={setPlan}
      original={m.lineup}
      maxIn={SUBS_MAX - m.subsUsed}
      locked={m.sent.home}
      hurt={m.out}
      unavailable={unavailable}
      booked={m.booked.home}
      notes={notes}
      fitness={(p) => fitAt(p, oddsMinute, since(p.id))}
    />
  );

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''}`}>
      <header className="lv-top">
        <div className="lv-bug" aria-label={`${m.home} ${goalsH}, ${m.away} ${goalsA}`}>
          <span className="lv-team home"><ClubCrest crest={state.crest} name={m.home} className="lv-crest" stars={clubStars(state)} /><b title={m.home}>{codes[0]}</b></span>
          <span className="lv-score"><b key={`h${goalsH}`}>{goalsH}</b><i>-</i><b key={`a${goalsA}`}>{goalsA}</b></span>
          <span className="lv-team away"><b title={m.away}>{codes[1]}</b><Crest name={m.away} className="lv-crest" /></span>
        </div>
        <span className={`lv-clock is-${phase}`}>{clockEl}</span>
        <p className="lv-eyebrow">{round} · {period}</p>
      </header>

      {banner && <GoalBanner key={`${banner.half}-${banner.at}`} banner={banner} state={state} m={m} shown={shown} codes={codes} />}

      <aside className="feed lv-feed" data-tab={tab} aria-label="Direct">
        <div className="lv-feed-head">
          <h3 className="pm-sh mark-head">En direct</h3>
          <span className="lv-feed-clock">{clockEl}</span>
        </div>
        <div className="lv-tabs" role="tablist" aria-label="Direct">
          {[['feed', 'Le fil'], ['stats', 'Stats'], ['compo', 'Compo']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="lv-sec stats">
          <div className="lv-stats">
            <div><b>{m.stats.possession} %</b><span>Possession</span></div>
            <div><b>{st.shots[0]} - {st.shots[1]}</b><span>Tirs</span></div>
            <div><b>{st.on[0]} - {st.on[1]}</b><span>Cadrés</span></div>
          </div>
          <ul className="lv-more">
            <li><span>Arrêts</span><b>{st.saves[0]} - {st.saves[1]}</b></li>
            <li><span>Poteaux</span><b>{st.post[0]} - {st.post[1]}</b></li>
            <li><span>Cartons jaunes</span><b>{st.yellow[0]} - {st.yellow[1]}</b></li>
            <li><span>Cartons rouges</span><b>{st.red[0]} - {st.red[1]}</b></li>
          </ul>
        </div>
        <div className="lv-sec feed">
          <Momentum shown={shown} upTo={slotOf(clockRef.current, half)} possHalf={m.stats.possHalf} names={[m.home, m.away]} codes={codes} />
          {pct && (
            <div className="lv-prono" title="Chances de victoire, de nul et de défaite à la fin du match, calculées sur le moteur à partir de ce que le direct a montré">
              <div className="lv-prono-head"><span>Pronostic final</span><b><em className="w">{pct[0].label}</em> · {pct[1].label} · <em className="l">{pct[2].label}</em></b></div>
              <div className="odds-bar" aria-hidden="true"><i className="w" style={{ flexGrow: odds.win * 100 }} /><i className="d" style={{ flexGrow: odds.draw * 100 }} /><i className="l" style={{ flexGrow: odds.loss * 100 }} /></div>
            </div>
          )}
          <ol className="feed-list">{shown.map((e) => <EventRow key={keyOf(e)} e={e} />)}</ol>
        </div>
        <div className="lv-sec compo">
          <ul className="lv-xi">
            {m.lineup.map((id) => {
              const p = state.players.find((q) => q.id === id);
              if (!p) return null;
              const gone = shown.some((e) => (e.type === 'red' || e.type === 'injury') && e.side === 'home' && e.playerId === id);
              const booked = shown.some((e) => e.type === 'yellow' && e.side === 'home' && e.player === p.name);
              const fit = Math.round(fitAt(p, minute, since(id)));
              return (
                <li key={id} className={gone ? 'gone' : ''}>
                  <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
                  <b>{xiNames[id]}</b>
                  {booked && <i className="card yellow" aria-label="averti" />}
                  {gone ? <em>Hors du terrain</em> : <span className={`lv-fit ${fit >= 75 ? 'good' : fit >= 50 ? 'mid' : 'low'}`}><i style={{ width: `${fit}%` }} /><em>{fit} %</em></span>}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {phase === 'playing' && (
        <div className="live-controls lv-controls">
          <div className="lc-speed" role="group" aria-label="Vitesse du match">
            <button className={speed === 1 ? 'on' : ''} aria-pressed={speed === 1} onClick={() => setSpeed(1)} title="Vitesse normale">×1</button>
            <button className={speed === 4 ? 'on' : ''} aria-pressed={speed === 4} onClick={() => setSpeed(4)} title="Accélérer"><span className="hide-sm">Accélérer </span>×4</button>
          </div>
          <button className="lc-sub" onClick={() => openSubs()} disabled={!canSub()} title={canSub() ? 'Faire un changement ou changer de tactique' : subsLeftNow() <= 0 ? 'Plus de changement disponible' : 'Attends la mi-temps'}>
            <IconSwap /><span className="hide-sm">Changement</span><span className="show-sm">Changer</span><em>{subsLeftNow()}</em>
          </button>
          <button className="lc-skip" onClick={skip}>
            <span className="hide-sm">{half === 1 ? 'Aller à la mi-temps' : 'Aller au coup de sifflet'}</span>
            <span className="show-sm">{half === 1 ? 'Mi-temps' : 'Fin du match'}</span>
          </button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? 'Remettre le son' : 'Couper le son'} title={muted ? 'Son coupé' : 'Son'}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      )}

      {boardOpen && (
        <div className={`halftime glass ${phase === 'subs' ? 'subs' : ''} ${board ? 'board-open' : 'board-closed'}`}>
          <div className="ht-col">
            <h3 className="pm-sh mark-head">{phase === 'halftime' ? 'Mi-temps · tes consignes' : `${minuteLabel}′ · changement`}</h3>
            {phase === 'subs' && (
              <p className={`ht-note ${sub?.note ? 'warn' : ''}`}>{sub?.note || `Le match est arrêté. Ce que tu décides prend effet à la ${sub?.at}e minute, au prochain arrêt de jeu.`}</p>
            )}
            <div className="lv-stats ht-stats">
              <div><b>{goalsH} - {goalsA}</b><span>Score</span></div>
              <div><b>{m.stats.possession} %</b><span>Possession</span></div>
              <div><b>{st.shots[0]} - {st.shots[1]}</b><span>Tirs</span></div>
              <div><b>{st.on[0]} - {st.on[1]}</b><span>Cadrés</span></div>
            </div>
            <div className="ht-block">
              <span className="ht-label">Pronostic final{phase === 'subs' ? ' avec ces changements' : ''}</span>
              {odds && <OddsBar odds={odds} />}
            </div>
            {!board && (
              <CompoCard
                title="Composition et changements"
                detail={`${formationOf(m.formation).name} · ${plannedSubs ? `${plannedSubs} changement${plannedSubs > 1 ? 's' : ''} prévu${plannedSubs > 1 ? 's' : ''} · ` : ''}${subsLeft} possible${subsLeft > 1 ? 's' : ''} sur ${SUBS_MAX}`}
                onOpen={() => setBoard(true)}
              />
            )}
            {board && ( /* repliée, la carte résume les changements : rien d'autre de la composition à l'écran */
              <div className="ht-block ht-b-changes">
                <span className="ht-label">Changements</span>
                <HalftimeChanges state={state} m={m} plan={planned} onReset={() => setPlan([...m.lineup])} />
              </div>
            )}
            <div className="ht-block ht-b-tactic">
              <span className="ht-label">{phase === 'halftime' ? 'Tactique de la seconde période' : 'Tactique'}</span>
              <TacticPicker value={tactic2} onChange={setTactic2} compact />
            </div>
            {sub?.err && <p className="ht-note warn">{sub.err}</p>}
          </div>
          {board && <div className="ht-col ht-board">
            <div className="ht-board-head">
              <span className="ht-label">Ton équipe · pastille : note du match · sous le nom : condition</span>
              <button type="button" className="linkbtn ht-board-close" onClick={() => setBoard(false)}>Replier</button>
            </div>
            {boardEl}
          </div>}
          <div className="ht-go">
            {phase === 'halftime'
              ? <button className="btn btn-xl" onClick={resume}><IconPlay className="fill" /> Reprendre la seconde période</button>
              : <>
                <button className="btn ghost btn-xl" onClick={() => closeSubs(false)}>Annuler</button>
                <button className="btn btn-xl" onClick={() => closeSubs(true)}><IconPlay className="fill" /> Reprendre</button>
              </>}
          </div>
        </div>
      )}

    </div>
  );
}
