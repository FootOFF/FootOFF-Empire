import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TACTICS, TACTIC_ORDER, fitWeight, formationOf, lineupRating, reshapeLineup, slotsOf } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { LIVE_VERSION, SUBS_MAX, createLiveMatch, highlightOf, liveKeyOf, pairSubs, prematchOdds, prematchXg, statsOf, subMinute } from '../game/live';
import { saveLive } from '../game/save';
import { available, fitAt, fitFactor, fitOf } from '../game/players';
import { Portrait } from './portrait';
import { teamCodes } from './teamcode';
import { BestEleven, FormationPicker, LineupBoard, RotateButton, displayNames, formationEffect } from './lineup';
import { IconCheck, IconChevron, IconClose, IconMute, IconPlay, IconSound, IconUsers } from './icons';
import { IconAssist, IconBall, IconMedic, IconSwap, IconWhistle, RatingBadge, VersusBar } from './kit';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';
import { ClubCrest, Crest } from './crest';
import { clubStars } from '../game/crest';
import { divisionOf } from '../game/constants';
import { penaltySkills, shootoutWinChance } from '../game/cups';
import { pctOf } from '../game/mercato';
import { standingsOf } from '../game/season';
import { useFitText } from './fittext';
import { HT_CASES } from '../game/league';
import { arrangeFor, planView } from '../game/leagueClub';

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

// --- Plans de mi-temps (championnat entre amis, 0.8.3) ---------------------------------------------------------------
// Le match d'une ligue se joue sans que personne soit connecté : pour chaque score possible à la pause (tu mènes,
// égalité, tu es mené), un plan règle le dispositif, la tactique et jusqu'à cinq changements de la seconde période.
// Le staff applique celui du score (league.js) ; les blessés restent remplacés par le staff, à la minute. Le plan se
// relit sur le onze de l'avant-match (planView) : changer un titulaire ne casse que les changements qui le concernaient.
const HT_LABELS = { lead: 'Je mène', draw: 'Égalité', trail: 'Je suis mené' };
const movedOnly = (v, formation, lineup) => {
  if (v.f !== formation) return false;
  const plain = [...lineup];
  for (const [o, i] of v.s) plain[plain.indexOf(o)] = i;
  return v.l.some((id, k) => id !== plain[k]);
};
const planText = (v, formation, tactic, lineup) => {
  const bits = [];
  if (v.f !== formation) bits.push(formationOf(v.f).name);
  if (v.t !== tactic) bits.push(TACTICS[v.t].name);
  if (v.s.length) bits.push(`${v.s.length} changement${v.s.length > 1 ? 's' : ''}`);
  if (movedOnly(v, formation, lineup)) bits.push('postes modifiés');
  return bits.length ? bits.map((b) => b.replace(/ /g, '\u00a0')).join(' · ').replace(/^p/, 'P') : 'Rien ne change';
};
const planSet = (v, formation, tactic, lineup) => v.f !== formation || v.t !== tactic || v.s.length > 0 || v.l.some((id, k) => id !== lineup[k]);

// Résumé dans l'avant-match : une ligne par situation, un toucher ouvre son plan.
function PlansSummary({ players, lineup, formation, tactic, plans, onOpen }) {
  return (
    <div className="htp-sum">
      {HT_CASES.map((k) => {
        const v = planView(players, lineup, formation, tactic, plans[k]);
        const set = planSet(v, formation, tactic, lineup);
        return (
          <button key={k} type="button" className={`htp-row ${set ? 'set' : ''}`} onClick={() => onOpen(k)}>
            <b>{HT_LABELS[k]}</b>
            <em>{planText(v, formation, tactic, lineup)}</em>
            <IconChevron className="htp-go" />
          </button>
        );
      })}
    </div>
  );
}

// La fenêtre des plans : les trois situations en onglets ; pour chacune, l'équipe de la seconde période sur le terrain
// (changements depuis le banc, cinq au plus ; condition estimée à la pause), le dispositif et la tactique.
function HalftimePlans({ players, lineup, formation, tactic, plans, onChange, start, onClose }) {
  const [k, setK] = useState(start || 'trail');
  const v = planView(players, lineup, formation, tactic, plans[k]);
  const names = useMemo(() => displayNames(players), [players]);
  const set = (patch) => onChange({ ...plans, [k]: { f: v.f, t: v.t, s: v.s, l: v.l, ...patch } });
  const onBoard = (next) => set({ l: next, s: pairSubs(lineup, next).map(([i, o]) => [o, i]) });
  const reshape = (f) => set({ f, l: arrangeFor(players, v.l, f) });
  const clear = () => { const next = { ...plans }; delete next[k]; onChange(next); };
  const fitness = (p) => fitAt(p, 45, lineup.includes(p.id) ? 0 : 45); // titulaires : condition à la pause ; banc : frais
  const ref = useRef(null);
  useKeydown((e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } });
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  const isSet = planSet(v, formation, tactic, lineup);
  return (
    <div className="sq-overlay ng-overlay htp-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass htp" onClick={(e) => e.stopPropagation()} aria-label="Plans de mi-temps">
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar"><span className="eyebrow">Plans de mi-temps</span><button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button></header>
        <p className="htp-intro">Le match se joue sans toi. À la pause, ton staff applique le plan qui correspond au score. Tes plans partent avec ton équipe validée.</p>
        <div className="htp-tabs" role="tablist" aria-label="Score à la pause">
          {HT_CASES.map((c) => {
            const cv = planView(players, lineup, formation, tactic, plans[c]);
            return (
              <button key={c} role="tab" aria-selected={k === c} className={`${k === c ? 'active' : ''} ${planSet(cv, formation, tactic, lineup) ? 'set' : ''}`} onClick={() => setK(c)}>
                <b>{HT_LABELS[c]}</b><em>{planText(cv, formation, tactic, lineup)}</em>
              </button>
            );
          })}
        </div>
        <section className="htp-col htp-board" aria-label="Équipe de la seconde période">
          <span className="ht-label">Seconde période · condition estimée à la pause</span>
          <LineupBoard players={players} lineup={v.l} formation={v.f} onChange={onBoard} original={lineup} maxIn={SUBS_MAX} fitness={fitness} />
        </section>
        <section className="htp-col htp-set" aria-label="Réglages du plan">
          <h3 className="pm-sh mark-head">Dispositif</h3>
          <FormationPicker value={v.f} onChange={reshape} />
          <h3 className="pm-sh mark-head">Tactique</h3>
          <TacticPicker value={v.t} onChange={(t) => set({ t })} compact />
          <h3 className="pm-sh mark-head">Changements <small>{v.s.length} sur {SUBS_MAX}</small></h3>
          {v.s.length ? (
            <div className="ht-changes">
              {v.s.map(([out, id]) => {
                const p = players.find((q) => q.id === id);
                const pos = slotsOf(v.f)[v.l.indexOf(id)];
                const off = p && pos && p.pos !== pos;
                return (
                  <div key={id} className="ht-swap">
                    <span className="sub-way in">Entre</span><b>{names[id]}</b>
                    <span className="sub-way out">Sort</span><b>{names[out]}</b>
                    {off && <em className="htp-off">{names[id]} jouera hors de son poste</em>}
                  </div>
                );
              })}
            </div>
          ) : <p className="ht-none">Aucun changement : fais entrer un remplaçant sur le terrain.</p>}
          <div className="htp-foot">
            {isSet && <button type="button" className="linkbtn" onClick={clear}>Effacer ce plan</button>}
            <button type="button" className="btn" onClick={onClose}><IconCheck /> Terminé</button>
          </div>
        </section>
      </article>
    </div>
  );
}

// --- Avant-match -------------------------------------------------------------------------------------
// En haut, l'affiche (les deux clubs, leur classement et leur niveau), la billetterie du jour et le retour ; puis le
// onze sur le terrain et le banc, le dispositif et la tactique (chacun avec son effet exact sur les occasions) ; en
// bas de la colonne, collés à l'écran, le pronostic et le coup d'envoi : chaque réglage montre aussitôt son effet sur
// les chances de victoire, juste au-dessus du bouton qui lance le match. Sur téléphone, la composition est repliée
// dans une carte, comme à la mi-temps (dépliée, elle cachait tout le reste de l'avant-match).

// Championnat entre amis (ctx.comp « friends », league.jsx) : la même affiche pour valider son équipe d'une journée,
// sans classement de division ni billetterie ; ctx.opp.crest : l'écusson d'un club d'ami ; ctx.goLabel : le bouton.
export function PreMatch({ state, ctx, onCancel, onKickoff }) {
  const [lineup, setLineup] = useState(() => [...state.lineup]);
  const [tactic, setTactic] = useState(state.tactic || 'balanced');
  const [formation, setFormation] = useState(formationOf(state.formation).id);
  const [board, setBoard] = useState(() => !narrowScreen()); // composition dépliée sur PC, repliée sur téléphone
  const friends = !!state.league; // partie de championnat entre amis : son match se joue sans elle (plans de mi-temps)
  const [plans, setPlans] = useState(() => ({ ...(state.league?.plans || {}) })); // plans de mi-temps (ligue)
  const [plansOpen, setPlansOpen] = useState(null); // situation ouverte dans la fenêtre des plans
  // niveau de l'onze au coup d'envoi, condition physique et forme comprises (comme le pronostic et le meilleur onze) ;
  // au repos, il vaudrait `rested` : la fatigue et la forme se lisent à côté du niveau, les pourcentages ne les cachent plus
  const rating = lineupRating(state.players, lineup, formation, fitWeight);
  const rested = lineupRating(state.players, lineup, formation);
  const fitOnly = lineupRating(state.players, lineup, formation, (p) => fitFactor(fitOf(p)));
  const tired = rested - fitOnly >= 0.05 ? rested - fitOnly : 0;
  const formGap = Math.abs(rating - fitOnly) >= 0.05 ? rating - fitOnly : 0;
  const home = ctx.home !== false; // à l'extérieur (Élite) : l'avantage du terrain est à l'adversaire, pronostic compris
  // même moteur que le pronostic (calcul exact, expulsions à venir comprises : gardé tant que rien ne change)
  const xg = useMemo(() => prematchXg(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength, home }), [state, lineup, tactic, formation, ctx.opp.strength, home]);
  const odds = useMemo(() => prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength, home }), [state, lineup, tactic, formation, ctx.opp.strength, home]);
  // coupe : qualifié en gagnant, ou en gagnant la séance de tirs au but après un nul (chance exacte, tireurs et gardien de
  // ce onze) ; le nul ne compte plus pour une demi-qualification
  const pens = ctx.knockout ? penaltySkills(lineup.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)) : null;
  const qualify = pens ? odds.win + odds.draw * shootoutWinChance(pens.home, pens.away) : null;
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); };
  const form = formationOf(formation);
  // classement des deux clubs (championnat), dès la première journée jouée
  const table = ctx.comp === 'friends' ? [] : standingsOf(state);
  const rowOf = (i) => { const k = table.findIndex((t) => t.i === i); return k < 0 || !table[k].played ? null : { rank: k + 1, pts: table[k].pts }; };
  const standing = (r) => (r ? `${r.rank === 1 ? '1er' : `${r.rank}e`} · ${r.pts} pt${r.pts > 1 ? 's' : ''} · ` : '');
  const me = rowOf(0);
  const them = ctx.comp === 'league' ? rowOf(ctx.oppIdx) : null;
  const league = ctx.comp === 'league';
  const homeRef = useFitText(state.clubName, 22);
  const awayRef = useFitText(ctx.opp.name, 22);

  useKeydown((e) => { if (e.key === 'Escape' && !plansOpen) onCancel(); });
  // téléphone : glisser vers le bas (contenu tout en haut) ramène au complexe, comme pour les autres fenêtres ; la
  // composition dépliée garde son propre geste (data-noswipe, lineup.jsx)
  const ref = useRef(null);
  useSwipe(ref, { onDown: () => { if (!plansOpen) onCancel(); }, downMedia: PHONE });

  // les deux équipes, l'équipe qui reçoit à gauche (0.8.1) : à l'extérieur, l'adversaire passe à gauche
  const usTeam = {
    crest: <ClubCrest crest={state.crest} name={state.clubName} className="pm-crest" stars={clubStars(state)} />, name: state.clubName, ref: homeRef,
    title: tired ? `${fmtRating(rested)} au repos, ${fmtRating(tired)} de moins avec la fatigue` : undefined,
    sub: <>{standing(me)}niveau <strong>{fmtRating(rating)}</strong></>,
  };
  const themTeam = {
    crest: ctx.opp.crest ? <ClubCrest crest={ctx.opp.crest} name={ctx.opp.name} className="pm-crest" /> : <Crest name={ctx.opp.name} className="pm-crest" />,
    name: ctx.opp.name, ref: awayRef, title: undefined,
    sub: <>{standing(them)}{ctx.opp.budget ? `budget ${fmtMoney(ctx.opp.budget)} · ` : ''}niveau <strong>{fmtRating(ctx.opp.strength)}</strong></>,
  };
  const [left, right] = home ? [usTeam, themTeam] : [themTeam, usTeam];
  return (
    <div ref={ref} className={`matchscreen prematch ${board ? 'board-open' : 'board-closed'}`}>
      <span className="grip" aria-hidden="true" />
      <header className="pm-head">
        <p className={`pm-eyebrow comp-${ctx.comp || 'league'}`}>{league ? `${divisionOf(state).name} · ` : ''}{ctx.label || `Journée ${state.round + 1} / ${state.schedule.length}`} · {home ? 'À domicile' : 'À l’extérieur'}</p>
        <div className="pm-top">
          <div className="pm-matchup">
            <div className="pm-team home">
              {left.crest}
              <div className="pm-tname"><b ref={left.ref}>{left.name}</b><small title={left.title}>{left.sub}</small></div>
            </div>
            <span className="pm-vs" aria-label="contre">VS</span>
            <div className="pm-team away">
              <div className="pm-tname"><b ref={right.ref}>{right.name}</b><small title={right.title}>{right.sub}</small></div>
              {right.crest}
            </div>
          </div>
          {ctx.gate && (home ? (
            <div className="pm-gate glass" aria-label="Billetterie du jour">
              <div><small>Affluence attendue</small><b>{fmtNum(ctx.gate.attendance)} <em>/ {fmtNum(ctx.gate.capacity)}</em></b></div>
              <div><small>Recettes</small><b>≈ {fmtMoney(ctx.gate.revenue)}</b></div>
            </div>
          ) : (
            <div className="pm-gate glass" aria-label="Match à l’extérieur">
              <div><small>Stade adverse</small><b>Extérieur</b></div>
              <div><small>Droits TV</small><b>≈ {fmtMoney(ctx.gate.revenue)}</b></div>
            </div>
          ))}
          <button className="pm-close" onClick={onCancel} aria-label="Retour au complexe"><IconClose /></button>
        </div>
      </header>

      <div className="pm-grid">
        {board ? (
          <section className="pm-xi glass" aria-label="Onze de départ">
            <div className="pm-xi-head">
              <h3 className="pm-sh mark-head">Onze de départ · <span className="nowrap">{form.name}</span></h3>
              <span className="pm-level">Niveau <b>{fmtRating(rating)}</b>{tired > 0 && <em className="pm-tired" title={`${fmtRating(rested)} au repos`}>fatigue −{fmtRating(tired)}</em>}{formGap !== 0 && <em className={`pm-form ${formGap > 0 ? 'up' : 'down'}`} title="Moyenne des notes des derniers matchs">forme {formGap > 0 ? '+' : '−'}{fmtRating(Math.abs(formGap))}</em>}</span>
              <span className="lu-acts">
                <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
                <RotateButton players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
              </span>
              <button type="button" className="pm-fold" onClick={() => setBoard(false)}>Replier</button>
            </div>
            <LineupBoard players={state.players} lineup={lineup} formation={formation} onChange={setLineup} fitness={(p) => fitAt(p, 0)} />
          </section>
        ) : (
          <div className="pm-compo">
            <CompoCard title="Composition" detail={`Onze en ${form.name} · niveau ${fmtRating(rating)}${tired || formGap ? ` (${[tired ? `fatigue −${fmtRating(tired)}` : '', formGap ? `forme ${formGap > 0 ? '+' : '−'}${fmtRating(Math.abs(formGap))}` : ''].filter(Boolean).join(', ')})` : ''}`} onOpen={() => setBoard(true)} />
            <span className="lu-acts">
              <BestEleven players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
              <RotateButton players={state.players} lineup={lineup} formation={formation} onApply={setLineup} />
            </span>
          </div>
        )}
        <section className="pm-plan glass" aria-label="Dispositif et tactique">
          <h3 className="pm-sh mark-head">Dispositif</h3>
          <FormationPicker value={formation} onChange={reshape} />
          <p className="pm-blurb">{form.blurb} <span className="pm-effect">{formationEffect(formation)}</span></p>
          <h3 className="pm-sh mark-head">Tactique</h3>
          <TacticPicker value={tactic} onChange={setTactic} />
          {friends && <>
            <h3 className="pm-sh mark-head">Plans de mi-temps</h3>
            <PlansSummary players={state.players} lineup={lineup} formation={formation} tactic={tactic} plans={plans} onOpen={setPlansOpen} />
          </>}
        </section>
        <div className="pm-go">
          <section className="pm-odds glass" aria-label="Pronostic">
            <div className="pm-odds-head">
              <h3 className="pm-sh mark-head">Pronostic</h3>
              <span className="pm-xg">Buts attendus <b>{fmtRating(home ? xg.for : xg.against)}</b> – <b>{fmtRating(home ? xg.against : xg.for)}</b></span>
            </div>
            <OddsBar odds={odds} />
            {ctx.knockout && <p className="pm-xg pm-ko">Élimination directe, tirs au but en cas d’égalité ({pctOf(shootoutWinChance(pens.home, pens.away))} % pour toi) · qualification <b>{pctOf(qualify)} %</b></p>}
            <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation, friends ? plans : undefined)}>{ctx.goLabel ? <><IconCheck /> {ctx.goLabel}</> : <><IconPlay className="fill" /> Coup d’envoi</>}</button>
          </section>
        </div>
      </div>
      {plansOpen && (
        <HalftimePlans players={state.players} lineup={lineup} formation={formation} tactic={tactic} plans={plans} onChange={setPlans} start={plansOpen} onClose={() => setPlansOpen(null)} />
      )}
    </div>
  );
}

// --- Match en direct ---------------------------------------------------------------------------------
// Façon FM (0.7) : pas de terrain en permanence. Le centre du match montre le tableau de score (buteurs, expulsions),
// les statistiques en direct, les temps forts, le pronostic et les notes des joueurs des deux équipes, qui évoluent au
// fil du match ; le fil du commentaire reste dans un onglet. La 3D ne se montre (et ne se dessine) que pour les temps
// forts (live.js, highlightOf) : l'horloge s'arrête au début de l'action, la scène la construit et la joue (matchplay.js),
// l'événement s'affiche à l'instant décisif (ballon au fond des filets, arrêt, poteau, carton), puis vient le ralenti et
// le retour au centre du match. Sans 3D (WebGL indisponible, galerie), le direct se passe des temps forts.

const ICON = { goal: <IconBall />, sub: <IconSwap />, injury: <IconMedic />, kickoff: <IconWhistle />, halftime: <IconWhistle />, fulltime: <IconWhistle /> };
const LOOKAHEAD = 14; // minutes simulées d'avance sur l'horloge : les temps forts se préparent avant leur instant
const HL_PRE = 0.12; // minutes de jeu entre le début d'un temps fort et son instant décisif (l'action se construit)
const HL_ACK = 1500; // ms : une scène 3D qui ne répond pas laisse le direct continuer sans elle
const HL_MAX = 32000; // ms : au-delà, le temps fort se termine quoi qu'il arrive (onglet caché, scène bloquée)
const HL_LABEL = { goal: 'Temps fort', big: 'Temps fort', save: 'Temps fort', post: 'Temps fort', penalty: 'Penalty', red: 'Temps fort' };

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
function Momentum({ shown, upTo, possHalf, names, codes, flip = false }) {
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
        {/* légende dans l'ordre de l'écran (à l'extérieur, l'équipe qui reçoit d'abord) ; chaque équipe garde sa couleur */}
        <span className={`lv-legend ${flip ? 'flip' : ''}`}>
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

// Bandeau du but, façon habillage télé : « BUT ! », le buteur (portrait, minute, passeur, penalty, combientième but de
// sa saison), le score.
function GoalBanner({ banner, state, m, shown, codes, flip = false }) {
  const ours = banner.ours;
  const p = ours ? state.players.find((q) => q.id === banner.playerId) : (m.awayRoster || []).find((q) => q.name === banner.player);
  const nth = ours && p ? (p.season?.goals || 0) + shown.filter((e) => e.type === 'goal' && e.playerId === banner.playerId
    && (e.half < banner.half || (e.half === banner.half && e.at <= banner.at))).length : 0;
  const facts = [`${banner.minute}′`, banner.q === 'pen' && 'sur penalty', banner.assist && `passe de ${banner.assist}`, nth && `${nth === 1 ? 'premier' : `${nth}e`} but de la saison`].filter(Boolean);
  return (
    <div className={`lv-goal ${ours ? 'ours' : 'theirs'} ${banner.fast ? 'fast' : ''}`} role="status">
      <span className="lv-goal-word">{ours ? 'But !' : `But ${codes[1]}`}</span>
      <span className="lv-goal-who">
        {p && <Portrait p={p} club={ours ? null : m.away} size={64} />}
        <span className="lv-goal-text"><b>{banner.player}</b><small>{facts.join(' · ')}</small></span>
      </span>
      <span className="lv-goal-score">{flip ? `${banner.score.away}-${banner.score.home}` : `${banner.score.home}-${banner.score.away}`}</span>
    </div>
  );
}

// Faits du match sous le tableau de score : buteurs (minutes, penalty) et expulsés de chaque équipe, comme à la télé.
const lastName = (n) => n.split(' ').slice(1).join(' ') || n;
function ScoreFacts({ shown, side, pos = side }) {
  const goals = new Map();
  const reds = [];
  for (const e of [...shown].reverse()) {
    if (e.side !== side) continue;
    if (e.type === 'goal') {
      const k = e.player;
      if (!goals.has(k)) goals.set(k, []);
      goals.get(k).push(`${e.minute}′${e.q === 'pen' ? ' (pen.)' : ''}`);
    } else if (e.type === 'red') reds.push({ who: e.player, minute: e.minute });
  }
  if (!goals.size && !reds.length) return <ul className={`lv-facts ${pos}`} />;
  return (
    <ul className={`lv-facts ${pos}`}>
      {[...goals].map(([who, mins]) => <li key={`g${who}`}><IconBall /><span><b>{lastName(who)}</b> {mins.join(', ')}</span></li>)}
      {reds.map((r) => <li key={`r${r.who}`}><i className="card red" aria-label="carton rouge" /><span><b>{lastName(r.who)}</b> {r.minute}′</span></li>)}
    </ul>
  );
}

// Statistiques en direct : seulement ce que le direct a déjà montré (statsOf, live.js) ; la possession ondule minute
// après minute autour de la tendance de la mi-temps.
function LiveStats({ st, poss, flip = false }) {
  const n = (v) => fmtNum(v);
  return (
    <div className="lv-srows">
      <VersusBar label="Possession" home={poss} away={100 - poss} suffix=" %" flip={flip} />
      <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} format={n} flip={flip} />
      <VersusBar label="Tirs cadrés" home={st.on[0]} away={st.on[1]} format={n} flip={flip} />
      <VersusBar label="Grosses occasions" home={st.big[0]} away={st.big[1]} format={n} flip={flip} />
      <VersusBar label="Buts attendus" home={st.xg[0]} away={st.xg[1]} format={(v) => fmtRating(v)} flip={flip} />
      <VersusBar label="Arrêts" home={st.saves[0]} away={st.saves[1]} format={n} flip={flip} />
      <VersusBar label="Poteaux" home={st.post[0]} away={st.post[1]} format={n} flip={flip} />
      <VersusBar label="Cartons jaunes" home={st.yellow[0]} away={st.yellow[1]} format={n} flip={flip} />
      <VersusBar label="Cartons rouges" home={st.red[0]} away={st.red[1]} format={n} flip={flip} />
      {st.pens[0] + st.pens[1] > 0 && <VersusBar label="Penalties" home={st.pens[0]} away={st.pens[1]} format={n} flip={flip} />}
    </div>
  );
}

// Notes du match d'une équipe (ratingsAt, live.js) : le onze dans l'ordre des postes, puis les entrés en jeu ; numéro,
// poste, nom, faits du match (buts, passes décisives, cartons, blessure, entrée et sortie), note sur 10. Chez nous, la
// condition physique en filet sous chaque joueur.
function TeamNotes({ rows, shown, side, fitOf = null, names }) {
  const facts = useMemo(() => {
    const f = new Map();
    const at = (k) => { if (!f.has(k)) f.set(k, { goals: 0, assists: 0, yellow: 0, red: 0, hurt: false, inAt: null, outAt: null }); return f.get(k); };
    for (const e of [...shown].reverse()) {
      if (e.side !== side) continue;
      const key = side === 'home' ? e.playerId : e.player;
      if (e.type === 'goal') { at(key).goals++; if (e.assist) at(side === 'home' ? names.byName[e.assist] : e.assist).assists++; }
      else if (e.type === 'yellow') at(key).yellow++;
      else if (e.type === 'red') at(key).red++;
      else if (e.type === 'injury') at(key).hurt = true;
      else if (e.type === 'sub' && e.inId != null) { at(e.inId).inAt = e.minute; at(e.outId).outAt = e.minute; }
      else if (e.type === 'sub' && e.inName) { at(e.inName).inAt = e.minute; at(e.outName).outAt = e.minute; } // visiteur (plan de mi-temps)
    }
    return f;
  }, [shown, side, names]);
  return (
    <ol className="lv-notes">
      {rows.map((r) => {
        const key = side === 'home' ? r.id : r.name;
        const f = facts.get(key) || {};
        const fit = fitOf ? fitOf(r) : null;
        return (
          <li key={key} className={r.on ? '' : 'off'}>
            <span className="lv-n-num">{r.num ?? ''}</span>
            <span className={`pos-pill ${r.pos}`}>{r.pos}</span>
            <span className="lv-n-name">
              <b>{side === 'home' ? names.short[r.id] || lastName(r.name) : lastName(r.name)}</b>
              <span className="lv-n-facts">
                {Array.from({ length: f.goals || 0 }, (_, i) => <IconBall key={`g${i}`} />)}
                {Array.from({ length: f.assists || 0 }, (_, i) => <IconAssist key={`a${i}`} className="as" />)}
                {f.yellow > 0 && !f.red && <i className="card yellow" aria-label="averti" />}
                {f.red > 0 && <i className="card red" aria-label="expulsé" />}
                {f.hurt && <IconMedic className="hurt" />}
                {f.inAt && <em className="in">{f.inAt}′</em>}
                {f.outAt && <em className="out">{f.outAt}′</em>}
              </span>
            </span>
            <RatingBadge value={r.rating} size="sm" />
            {fit != null && r.on && <i className={`lv-n-fit ${fit >= 75 ? 'good' : fit >= 50 ? 'mid' : 'low'}`} style={{ '--fit': fit / 100 }} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
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
// Écussons du direct : le nôtre (noir et or, étoiles de titres) ; en championnat entre amis, le club de l'ordinateur qui
// reçoit garde le sien (sans écusson composé), et le club d'un ami en visite montre son écusson noir et or.
function HomeCrest({ state, name, className }) {
  return state.crest ? <ClubCrest crest={state.crest} name={name} className={className} stars={clubStars(state)} /> : <Crest name={name} className={className} />;
}
function AwayCrest({ ctx, name, className }) {
  return ctx.opp?.crest ? <ClubCrest crest={ctx.opp.crest} name={name} className={className} /> : <Crest name={name} className={className} />;
}

// replay : un match déjà joué d'un bloc (championnat entre amis, league.js replayOf), revu avec ses temps forts en 3D :
// ni changement ni consigne, rien n'est retiré, aucune sauvegarde du direct.
// side : notre camp dans le match revu (championnat entre amis, à l'extérieur : 'away') ; les buts de notre camp sont fêtés.
export function LiveMatch({ state, ctx, sound, onFx, onFinish, preview = null, restore = null, replay = null, side = 'home' }) {
  const [live] = useState(() => replay || createLiveMatch(state, ctx, restore?.engine || null)); // un seul match par montage (jamais recréé)
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
  // ce que montre le centre du match : stats, notes (téléphone : les PC les voient en colonnes) ou le fil
  const [view, setView] = useState(preview?.view || 'stats');
  // téléphone : la colonne de notes montrée (home : celle de gauche) ; d'abord la nôtre, à droite quand on joue chez
  // l'adversaire (l'équipe qui reçoit passe à gauche)
  const [notesSide, setNotesSide] = useState(() => (side === 'home' && live.state.atHome === false ? 'away' : 'home'));
  const [hl, setHl] = useState(null); // temps fort en cours (affichage) : { id, type, e, replay }
  const hlRef = useRef(null); // le même, pour l'horloge : { id, e, type, started, revealed }
  const hlSeq = useRef(0);
  const codes = useMemo(() => teamCodes(live.state.home, live.state.away), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sound.start(); sound.whistle(1); return () => sound.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sauvegarde du direct, pour le reprendre à la minute près si l'app se ferme : à chaque étape (coup d'envoi,
  // changement, mi-temps, fin), au plus toutes les deux secondes pendant le jeu, et quand l'app passe en arrière-plan.
  const uiNow = useRef({ phase, half, speed });
  uiNow.current = { phase, half, speed };
  const savedAt = useRef(0);
  const persist = () => {
    if (preview || replay) return;
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

  // scène 3D : elle lit les onze, l'horloge et les temps forts dans le canal du direct (matchFeed). Un match revu est
  // déjà joué en entier : en première période, les onze et les dispositifs du coup d'envoi (avant les plans de mi-temps)
  const kickoffView = () => !!replay && half === 1;
  const homeNames = () => (kickoffView() ? live.state.startLineup : live.state.lineup).map((id) => state.players.find((p) => p.id === id)?.name || '');
  const awayNames = () => ((kickoffView() && live.state.awayStart) || live.state.awayRoster).map((p) => p.name);
  const formationNow = () => (kickoffView() ? live.state.startFormation || live.state.formation : live.state.formation);
  const awayFormationNow = () => (kickoffView() ? live.state.awayStartFormation || live.state.awayFormation : live.state.awayFormation);
  useEffect(() => {
    Object.assign(matchFeed, {
      active: !preview, ended: false, phase, half, clock: clockRef.current, speed,
      formation: formationNow(), homeNames: homeNames(), awayNames: awayNames(),
      awayFormation: awayFormationNow(), awayName: live.state.away,
      hl: null, hlAck: 0, hlReveal: 0, hlDone: 0, hlClock: 0, hlPhase: '', show3D: false,
    });
    return () => { Object.assign(matchFeed, { active: false, hl: null, show3D: false }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Object.assign(matchFeed, { phase: phase === 'subs' ? 'playing' : phase, half, speed, homeNames: homeNames(), awayNames: awayNames(), formation: formationNow(), awayFormation: awayFormationNow() });
    if (phase === 'fulltime') matchFeed.ended = true;
  }, [phase, half, events, speed, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // aperçu (galerie) : direct déjà entamé, mi-temps, changement en cours de jeu, ou temps fort (sans la 3D)
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
    if (preview.hl) { // le temps fort qui suit (ou une action inventée pour l'aperçu, si la mi-temps n'en a pas)
      const e = events.find((x) => x.at > t && highlightOf(x)) || { type: 'chance', side: 'home', at: t + 0.5, minute: `${Math.ceil(t + 0.5)}`, q: 'big', kind: 'through', outcome: 'saved' };
      setHl({ id: 1, type: highlightOf(e), e, replay: preview.hl === 'replay' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // coup de sifflet final : un court temps de respiration (« Terminé »), puis l'écran d'après-match
  const finished = useRef(false);
  useEffect(() => {
    if (phase !== 'fulltime' || finished.current) return undefined;
    const t = setTimeout(() => { finished.current = true; onFinish(live.result()); }, 1700);
    return () => clearTimeout(t);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // la scène 3D peut-elle jouer un temps fort maintenant ? (créée, page visible, pas d'aperçu)
  const sceneReady = () => !preview && matchFeed.scene && document.visibilityState === 'visible';

  // Révèle les événements de la mi-temps jusqu'à l'instant `upTo` (compris), dans l'ordre ; s'arrête après un but sans
  // temps fort ou une blessure (la suite attend la fin de la célébration, ou le changement).
  const revealTo = (upTo, { through = null } = {}) => {
    while (revealed.current < events.length && (events[revealed.current].at <= upTo || (through && events.indexOf(through) >= revealed.current))) {
      const e = events[revealed.current++];
      setShown((s) => [e, ...s]);
      react(e, { highlighted: e === through });
      if (e === through) break;
      if (e.type === 'injury' || (e.type === 'goal' && !through)) break;
    }
  };

  // Temps fort : l'horloge s'arrête au début de l'action, la scène 3D la joue, le direct révèle l'événement à l'instant
  // décisif et reprend après le ralenti.
  const startHighlight = (e, type) => {
    const id = ++hlSeq.current;
    hlRef.current = { id, e, type, started: performance.now(), revealed: false };
    setHl({ id, type, e, replay: false });
    Object.assign(matchFeed, {
      hl: { id, e, type, half, replay: speed === 1, homeNames: homeNames(), awayNames: awayNames(), awayFormation: awayFormationNow(), formation: formationNow() },
      hlAck: 0, hlReveal: 0, hlDone: 0, hlClock: clockRef.current, hlPhase: '', show3D: true,
    });
  };
  const endHighlight = () => {
    const h = hlRef.current;
    if (!h) return;
    if (!h.revealed) { h.revealed = true; revealTo(h.e.at, { through: h.e }); } // passé, ou sans 3D : l'événement s'affiche
    hlRef.current = null;
    clockRef.current = Math.max(clockRef.current, h.e.at);
    matchFeed.clock = clockRef.current;
    matchFeed.hl = null;
    setHl(null);
    setBanner(null);
    // la 3D reste dessinée le temps que le centre du match revienne (fondu), puis elle s'arrête
    setTimeout(() => { if (!hlRef.current) matchFeed.show3D = false; }, 420);
  };

  // horloge : avance le temps de jeu, simule quelques minutes d'avance, révèle les événements, lance les temps forts,
  // marque une pause sur un but sans 3D
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const h = hlRef.current;
      if (h) { // temps fort en cours : la scène 3D mène
        if (matchFeed.hlAck !== h.id && now - h.started > HL_ACK) { endHighlight(); return; } // pas de 3D : on continue sans
        if (matchFeed.hlClock > clockRef.current && !h.revealed) {
          clockRef.current = Math.min(h.e.at, matchFeed.hlClock);
          matchFeed.clock = clockRef.current;
          setClock(Math.ceil(clockRef.current));
        }
        if (!h.revealed && matchFeed.hlReveal === h.id) { h.revealed = true; revealTo(h.e.at, { through: h.e }); }
        if (matchFeed.hlPhase === 'replay') setHl((x) => (x && !x.replay ? { ...x, replay: true } : x));
        if (matchFeed.hlDone === h.id || now - h.started > HL_MAX) endHighlight();
        return;
      }
      if (pause.current > 0) { pause.current -= dt; return; }
      const end = live.halfEnd;
      live.advanceTo(Math.ceil(clockRef.current) + LOOKAHEAD);
      let next = Math.min(end, clockRef.current + (dt * speed) / SEC_PER_MIN);
      // prochain temps fort : l'horloge s'arrête au début de son action, la 3D prend le relais
      let start = null;
      if (sceneReady()) {
        for (let k = revealed.current; k < events.length && events[k].at <= next + HL_PRE; k++) {
          const type = highlightOf(events[k], speed > 1);
          if (type) { start = { e: events[k], type }; break; }
        }
      }
      if (start) next = Math.max(clockRef.current, Math.min(next, start.e.at - HL_PRE));
      clockRef.current = next;
      matchFeed.clock = next;
      setClock(Math.ceil(next)); // l'écran n'affiche que la minute : un rendu par minute de jeu, pas vingt par seconde
      revealTo(next);
      if (start && revealed.current === events.indexOf(start.e) && pause.current <= 0 && !hlRef.current) startHighlight(start.e, start.type);
      if (now - savedAt.current > 2000) persist();
      if (!hlRef.current && next >= end && live.halfDone && revealed.current >= events.length) {
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
    setPhase('playing');
  }

  // highlighted : l'événement vient d'être joué en 3D (sa célébration y a eu lieu : pas de pause en plus)
  function react(e, { highlighted = false } = {}) {
    if (e.type === 'goal') {
      const ours = e.side === side;
      setBanner({ ...e, ours, fast: speed > 1 });
      if (!highlighted) {
        pause.current = speed > 1 ? 1.6 : 4.4;
        setTimeout(() => setBanner((b) => (b && b.at === e.at ? null : b)), (speed > 1 ? 1.6 : 4.2) * 1000);
      }
      if (ours) sound.goal(); else sound.conceded();
      onFx({ type: ours ? 'goal' : 'conceded', fast: speed > 1 });
    } else if (e.type === 'chance' && (e.outcome === 'post' || e.outcome === 'saved')) sound.chance();
    else if (e.type === 'yellow' || e.type === 'red') sound.card();
    else if (e.type === 'injury') { // un blessé : s'il reste un changement, le match s'arrête pour le faire
      sound.whistle(1);
      if (!replay && canSub()) openSubs(`${e.player} est blessé et ne peut pas continuer : fais entrer un remplaçant, ou continue à dix.`);
    } else if (e.type === 'halftime') { sound.whistle(2); onFx({ type: 'halftime' }); }
    else if (e.type === 'fulltime') { sound.whistle(3); onFx({ type: 'fulltime' }); }
  }

  const skip = () => { // fin de la mi-temps en cours, sans célébration ; le staff remplace un blessé (s'il reste un changement)
    if (hlRef.current) endHighlight();
    live.advanceTo(Infinity, { staff: true });
    setLineupKey((k) => k + 1);
    const end = live.halfEnd;
    pause.current = 0;
    const rest = events.slice(revealed.current);
    revealed.current = events.length;
    clockRef.current = end;
    matchFeed.clock = end;
    setClock(end);
    setShown((s) => [...rest.reverse(), ...s]);
    setBanner(null);
    if (rest.some((e) => e.type === 'goal')) onFx({ type: 'skip' });
    setPhase(half === 1 ? 'halftime' : 'fulltime');
    sound.whistle(half === 1 ? 2 : 3);
  };

  const resume = () => { // reprise de la seconde période, avec les changements et la tactique de la pause
    if (replay) live.state.half = 2; // match revu : la seconde période est déjà jouée, on la montre
    else live.change(45, { lineup: plan || m.lineup, tactic: tactic2, halftime: true });
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
  const base = half === 1 ? 45 : 90;
  const minute = Math.max(half === 1 ? 0 : 45, Math.ceil(clock));
  const minuteLabel = minute > base ? `${base}+${minute - base}` : `${minute}`;
  // notes du match à cet instant, d'après ce que le direct a montré (les deux équipes ; aide à choisir qui sort)
  const notesNow = useMemo(() => live.ratingsAt(shown, phase === 'fulltime' ? 90 : minute), [shown, minute, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = useMemo(() => Object.fromEntries(notesNow.home.map((x) => [x.id, x.rating])), [notesNow]);
  const since = (id) => m.perf[id]?.in ?? (m.lineup.includes(id) ? 0 : clockRef.current);
  const unavailable = useMemo(() => new Set([...state.players.filter((p) => !available(p)).map((p) => p.id), ...m.gone, ...m.out]), [boardOpen, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // score affiché = buts déjà révélés par le direct (le moteur connaît la suite de la mi-temps)
  const goalsH = shown.filter((e) => e.type === 'goal' && e.side === 'home').length;
  const goalsA = shown.filter((e) => e.type === 'goal' && e.side === 'away').length;
  // minute du pronostic : la minute affichée, la fin de la première période à la pause, la minute d'effet d'un changement
  const oddsMinute = phase === 'halftime' ? live.halfEnd : sub?.at ?? minute;
  // pronostic final, tel que le direct l'a montré (score, cartons et blessures déjà annoncés), avec le onze et la
  // tactique envisagés pendant un changement ou à la pause
  const odds = useMemo(() => (phase === 'fulltime' ? null
    : live.oddsShown(oddsMinute, shown, boardOpen ? { lineup: planned, tactic: tactic2 } : {})), [oddsMinute, shown, phase, plan, tactic2, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => statsOf(shown), [shown]);
  const poss = phase === 'halftime' || phase === 'fulltime' ? m.stats.possession : live.possessionAt(half, minute);
  const div = divisionOf(state)?.name || ''; // championnat entre amis : pas de division (ctx.label)
  const round = ctx.comp === 'league' || !ctx.comp
    ? <><span className="hm-long">{div} · Journée </span><span className="hm-short">{div} · J</span>{state.round + 1}/{state.schedule.length}</> : ctx.label;
  const period = phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Fin du match${m.pens ? ` · t.a.b. ${m.pens[0]}-${m.pens[1]}` : ''}` : half === 1 ? '1re période' : '2e période';
  const clockEl = phase === 'halftime' ? 'Mi-temps' : phase === 'fulltime' ? `Terminé${m.pens ? ` · t.a.b. ${m.pens[0]}-${m.pens[1]}` : ''}`
    : <>{replay ? <span className="lv-replay">Rejeu</span> : <i className={`live-dot ${phase === 'subs' ? 'hold' : ''}`} />}{minuteLabel}′</>; // un match revu n'est pas un direct : pas de point rouge
  const pct = odds ? roundPercents([odds.win, odds.draw, odds.loss]) : null;
  const xiNames = displayNames(state.players);
  const names = useMemo(() => ({ short: xiNames, byName: Object.fromEntries(state.players.map((p) => [p.name, p.id])) }), [lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitOf = (r) => { const p = state.players.find((q) => q.id === r.id); return p ? Math.round(fitAt(p, minute, since(r.id))) : null; };
  const homeRows = notesNow.home;
  const awayRows = notesNow.away;
  // à l'extérieur en carrière (le moteur nous garde du côté « home ») : l'équipe qui reçoit passe à gauche (0.8.1) ;
  // L et R : le côté du moteur montré à gauche et à droite (un match revu d'un ami est déjà dans le bon sens)
  const flip = side === 'home' && m.atHome === false;
  const [L, R] = flip ? ['away', 'home'] : ['home', 'away'];
  const teamName = { home: m.home, away: m.away };
  const teamCode = { home: codes[0], away: codes[1] };
  const teamGoals = { home: goalsH, away: goalsA };
  const crestOf = (k, className) => (k === 'home' ? <HomeCrest state={state} name={m.home} className={className} /> : <AwayCrest ctx={ctx} name={m.away} className={className} />);

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

  const prono = pct && (
    <div className="lv-prono" title="Chances de victoire, de nul et de défaite à la fin du match, calculées sur le moteur à partir de ce que le direct a montré">
      <div className="lv-prono-head"><span>Pronostic final</span><b><em className="w">{pct[0].label}</em> · {pct[1].label} · <em className="l">{pct[2].label}</em></b></div>
      <div className="odds-bar" aria-hidden="true"><i className="w" style={{ flexGrow: odds.win * 100 }} /><i className="d" style={{ flexGrow: odds.draw * 100 }} /><i className="l" style={{ flexGrow: odds.loss * 100 }} /></div>
    </div>
  );
  const viewNow = view === 'notes' && !narrowScreen() ? 'stats' : view;

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''} ${hl ? 'hl' : ''}`}>
      <div className="lv-centre" aria-hidden={hl ? 'true' : undefined}>
        <header className="lv-board">
          <p className="lv-eyebrow">{round}{m.atHome === false ? ' · Extérieur' : ''} · {period}</p>
          <div className="lv-sb" aria-label={`${teamName[L]} ${teamGoals[L]}, ${teamName[R]} ${teamGoals[R]}`}>
            <div className="lv-sb-team home">
              {crestOf(L, 'lv-sb-crest')}
              <b title={teamName[L]}><span className="hide-sm">{teamName[L]}</span><span className="show-sm">{teamCode[L]}</span></b>
            </div>
            <div className="lv-sb-mid">
              <span className="lv-sb-score"><b key={`${L}${teamGoals[L]}`}>{teamGoals[L]}</b><i>-</i><b key={`${R}${teamGoals[R]}`}>{teamGoals[R]}</b></span>
              <span className={`lv-sb-clock is-${phase}`}>{clockEl}</span>
            </div>
            <div className="lv-sb-team away">
              <b title={teamName[R]}><span className="hide-sm">{teamName[R]}</span><span className="show-sm">{teamCode[R]}</span></b>
              {crestOf(R, 'lv-sb-crest')}
            </div>
          </div>
          <div className="lv-sb-facts">
            <ScoreFacts shown={shown} side={L} pos="home" />
            <ScoreFacts shown={shown} side={R} pos="away" />
          </div>
        </header>

        <div className="lv-tabs" role="tablist" aria-label="Centre du match">
          {[['stats', 'Stats'], ['notes', 'Notes'], ['feed', 'Le fil']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={`${view === id ? 'on' : ''} ${id === 'notes' ? 'only-sm' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>

        <div className={`lv-cols view-${viewNow} notes-${notesSide}`}>
          <section className="lv-col home" aria-label={`Notes de ${teamName[L]}`}>
            <div className="lv-col-head">
              <h3 className="pm-sh mark-head">{teamName[L]}</h3>
              <span className="lv-col-sub">Notes du match</span>
            </div>
            <TeamNotes rows={L === 'home' ? homeRows : awayRows} shown={shown} side={L} fitOf={L === 'home' ? fitOf : null} names={names} />
          </section>
          <section className="lv-mid" aria-label="Statistiques et fil du match">
            <div className="lv-mid-tabs" role="tablist" aria-label="Statistiques ou fil">
              {[['stats', 'Statistiques'], ['feed', 'Le fil']].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={viewNow === id} className={viewNow === id ? 'on' : ''} onClick={() => setView(id)}>{label}</button>
              ))}
            </div>
            <div className="lv-sec stats">
              <LiveStats st={st} poss={poss} flip={flip} />
              {prono}
              <Momentum shown={shown} upTo={slotOf(clockRef.current, half)} possHalf={m.stats.possHalf} names={[m.home, m.away]} codes={codes} flip={flip} />
            </div>
            <div className="lv-sec feed">
              <ol className="feed-list">{shown.map((e) => <EventRow key={keyOf(e)} e={e} />)}</ol>
            </div>
          </section>
          <section className="lv-col away" aria-label={`Notes de ${teamName[R]}`}>
            <div className="lv-col-head">
              <h3 className="pm-sh mark-head">{teamName[R]}</h3>
              <span className="lv-col-sub">Notes du match</span>
            </div>
            <TeamNotes rows={R === 'home' ? homeRows : awayRows} shown={shown} side={R} fitOf={R === 'home' ? fitOf : null} names={names} />
          </section>
          <div className="lv-notes-switch" role="tablist" aria-label="Équipe">
            {[['home', teamName[L]], ['away', teamName[R]]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={notesSide === id} className={notesSide === id ? 'on' : ''} onClick={() => setNotesSide(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* pendant un temps fort : le score façon télé au-dessus de la 3D */}
      <header className="lv-top">
        <div className="lv-bug" aria-label={`${teamName[L]} ${teamGoals[L]}, ${teamName[R]} ${teamGoals[R]}`}>
          <span className="lv-team home">{crestOf(L, 'lv-crest')}<b title={teamName[L]}>{teamCode[L]}</b></span>
          <span className="lv-score"><b key={`${L}${teamGoals[L]}`}>{teamGoals[L]}</b><i>-</i><b key={`${R}${teamGoals[R]}`}>{teamGoals[R]}</b></span>
          <span className="lv-team away"><b title={teamName[R]}>{teamCode[R]}</b>{crestOf(R, 'lv-crest')}</span>
        </div>
        <span className={`lv-clock is-${phase}`}>{clockEl}</span>
      </header>
      {hl && (
        <div className={`lv-hl-tag ${hl.replay ? 'replay' : ''}`} role="status">
          <span>{hl.replay ? 'Ralenti' : HL_LABEL[hl.type] || 'Temps fort'}</span>
          <b>{hl.e.minute}′</b>
        </div>
      )}

      {banner && <GoalBanner key={`${banner.half}-${banner.at}`} banner={banner} state={state} m={m} shown={shown} codes={codes} flip={flip} />}

      {phase === 'playing' && (hl ? (
        <div className="live-controls lv-controls">
          <button className="lc-pass" onClick={endHighlight}><IconPlay className="fill" /><span>Passer le temps fort</span></button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? 'Remettre le son' : 'Couper le son'} title={muted ? 'Son coupé' : 'Son'}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      ) : (
        <div className="live-controls lv-controls">
          <div className="lc-speed" role="group" aria-label="Vitesse du match">
            <button className={speed === 1 ? 'on' : ''} aria-pressed={speed === 1} onClick={() => setSpeed(1)} title="Vitesse normale : tous les temps forts, avec les ralentis">×1</button>
            <button className={speed === 4 ? 'on' : ''} aria-pressed={speed === 4} onClick={() => setSpeed(4)} title="Accélérer : les buts, les penalties et les expulsions seulement"><span className="hide-sm">Accélérer </span>×4</button>
          </div>
          {!replay && <button className="lc-sub" onClick={() => openSubs()} disabled={!canSub()} title={canSub() ? 'Faire un changement ou changer de tactique' : subsLeftNow() <= 0 ? 'Plus de changement disponible' : 'Attends la mi-temps'}>
            <IconSwap /><span className="hide-sm">Changement</span><span className="show-sm">Changer</span><em>{subsLeftNow()}</em>
          </button>}
          <button className="lc-skip" onClick={skip}>
            <span className="hide-sm">{half === 1 ? 'Aller à la mi-temps' : 'Aller au coup de sifflet'}</span>
            <span className="show-sm">{half === 1 ? 'Mi-temps' : 'Fin du match'}</span>
          </button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? 'Remettre le son' : 'Couper le son'} title={muted ? 'Son coupé' : 'Son'}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      ))}

      {boardOpen && (
        <div className={`halftime glass ${phase === 'subs' ? 'subs' : ''} ${board ? 'board-open' : 'board-closed'}`}>
          <div className="ht-col">
            <h3 className="pm-sh mark-head">{phase === 'halftime' ? (replay ? 'Mi-temps' : 'Mi-temps · tes consignes') : `${minuteLabel}′ · changement`}</h3>
            {phase === 'subs' && (
              <p className={`ht-note ${sub?.note ? 'warn' : ''}`}>{sub?.note || `Le match est arrêté. Ce que tu décides prend effet à la ${sub?.at}e minute, au prochain arrêt de jeu.`}</p>
            )}
            <div className="lv-stats ht-stats">
              <div><b>{goalsH} - {goalsA}</b><span>Score</span></div>
              <div><b>{poss} %</b><span>Possession</span></div>
              <div><b>{st.shots[0]} - {st.shots[1]}</b><span>Tirs</span></div>
              <div><b>{st.on[0]} - {st.on[1]}</b><span>Cadrés</span></div>
            </div>
            <div className="ht-block">
              <span className="ht-label">Pronostic final{phase === 'subs' ? ' avec ces changements' : ''}</span>
              {odds && <OddsBar odds={odds} />}
            </div>
            {!board && !replay && (
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
            {!replay && <div className="ht-block ht-b-tactic">
              <span className="ht-label">{phase === 'halftime' ? 'Tactique de la seconde période' : 'Tactique'}</span>
              <TacticPicker value={tactic2} onChange={setTactic2} compact />
            </div>}
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
