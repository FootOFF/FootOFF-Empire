import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HOME_KIT, kitHex, matchKits } from '../game/kits';
import { flushSync } from 'react-dom';
import { TACTICS, TACTIC_ORDER, autoLineup, fitWeight, formationOf, lineupRating, reshapeLineup, slotsOf } from '../game/tactics';
import { roundPercents, fmtMoney, fmtNum, fmtRating } from './format';
import { LIVE_VERSION, SUBS_MAX, awayElevenOf, createLiveMatch, highlightOf, liveKeyOf, pairSubs, prematchOdds, prematchXg, statsOf, subMinute } from '../game/live';
import { saveLive } from '../game/save';
import { available, fitAt, ratingAt } from '../game/players';
import { Portrait } from './portrait';
import { teamCodes } from './teamcode';
import { FormationPicker, LineupActions, LineupBoard, displayNames, formationEffect } from './lineup';
import { IconCheck, IconChevron, IconClose, IconFast, IconMute, IconPlay, IconSound, IconUsers } from './icons';
import { IconAssist, IconBall, IconMedic, IconSwap, IconWhistle, RatingBadge, VersusBar } from './kit';
import { useKeydown } from './presence';
import { deName } from '../game/names';
import { LANDSCAPE, PHONE, useSwipe } from './gestures';
import { SEC_PER_MIN, matchFeed } from '../game/matchFeed';
import { ClubCrest, Crest } from './crest';
import { clubStars } from '../game/crest';
import { POS_LABELS, divisionOf } from '../game/constants';
import { penaltySkills, shootoutWinChance } from '../game/cups';
import { pctOf } from '../game/mercato';
import { standingsOf } from '../game/season';
import { useFitText } from './fittext';
import { HT_CASES } from '../game/league';
import { arrangeFor, planView } from '../game/leagueClub';
import { ordinal as ordinalText, t, tn, tr } from '../i18n/index';

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
        <span className="w">{tr('<0/>Victoire', [<b>{w.label}</b>])}</span>
        <span className="d">{tr('<0/>Nul', [<b>{d.label}</b>])}</span>
        <span className="l">{tr('<0/>Défaite', [<b>{l.label}</b>])}</span>
      </div>
    </div>
  );
}

// Effet exact d'une tactique sur les occasions (tactics.js : les nôtres, celles de l'adversaire).
const signed = (k) => { const v = Math.round((k - 1) * 100); return `${v > 0 ? '+' : '−'}${Math.abs(v)} %`; };
export const tacticEffect = (id) => {
  const row = TACTICS[id];
  return row.for === 1 && row.against === 1 ? t('le plan de référence') : t('{signed} d’occasions · {signed2} subies', { signed: signed(row.for), signed2: signed(row.against) });
};

function TacticPicker({ value, onChange, compact }) {
  return (
    <div className={`tactics ${compact ? 'compact' : ''}`} role="radiogroup" aria-label={t('Tactique')}>
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

const narrowScreen = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;
// centre du match en onglets (Stats, Notes, Le fil) : téléphone en portrait, ou couché sur moins de 900 px (0.8.13)
const tabbedScreen = () => narrowScreen() || (typeof window !== 'undefined' && window.matchMedia(`${LANDSCAPE} and (max-width: 900px)`).matches);

// --- Plans de mi-temps (championnat entre amis, 0.8.3) ---------------------------------------------------------------
// Le match d'une ligue se joue sans que personne soit connecté : pour chaque score possible à la pause (tu mènes,
// égalité, tu es mené), un plan règle le dispositif, la tactique et jusqu'à cinq changements de la seconde période.
// Le staff applique celui du score (league.js) ; les blessés restent remplacés par le staff, à la minute. Le plan se
// relit sur le onze de l'avant-match (planView) : changer un titulaire ne casse que les changements qui le concernaient.
const HT_LABELS = { lead: t('Je mène'), draw: t('Égalité'), trail: t('Je suis mené') };
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
  if (v.s.length) bits.push(tn(v.s.length, '{n} changement', '{n} changements', { n: v.s.length }, v.s.length > 1));
  if (movedOnly(v, formation, lineup)) bits.push(t('postes modifiés'));
  return bits.length ? bits.map((b) => b.replace(/ /g, '\u00a0')).join(' · ').replace(/^p/, 'P') : t('Rien ne change');
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
      <article ref={ref} className="sq-sheet glass htp" onClick={(e) => e.stopPropagation()} aria-label={t('Plans de mi-temps')}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar"><span className="eyebrow">{t('Plans de mi-temps')}</span><button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button></header>
        <p className="htp-intro">{t('Le match se joue sans toi. À la pause, ton staff applique le plan qui correspond au score. Tes plans partent avec ton équipe validée.')}</p>
        <div className="htp-tabs" role="tablist" aria-label={t('Score à la pause')}>
          {HT_CASES.map((c) => {
            const cv = planView(players, lineup, formation, tactic, plans[c]);
            return (
              <button key={c} role="tab" aria-selected={k === c} className={`${k === c ? 'active' : ''} ${planSet(cv, formation, tactic, lineup) ? 'set' : ''}`} onClick={() => setK(c)}>
                <b>{HT_LABELS[c]}</b><em>{planText(cv, formation, tactic, lineup)}</em>
              </button>
            );
          })}
        </div>
        <section className="htp-col htp-board" aria-label={t('Équipe de la seconde période')}>
          <span className="ht-label">{t('Seconde période · condition estimée à la pause')}</span>
          <LineupBoard players={players} lineup={v.l} formation={v.f} onChange={onBoard} original={lineup} maxIn={SUBS_MAX} fitness={fitness} />
        </section>
        <section className="htp-col htp-set" aria-label={t('Réglages du plan')}>
          <h3 className="pm-sh mark-head">{t('Dispositif')}</h3>
          <FormationPicker value={v.f} onChange={reshape} />
          <h3 className="pm-sh mark-head">{t('Tactique')}</h3>
          <TacticPicker value={v.t} onChange={(t) => set({ t })} compact />
          <h3 className="pm-sh mark-head">{tr('Changements <0/>', [<small>{tr('<0/> sur <1/>', [v.s.length, SUBS_MAX])}</small>])}</h3>
          {v.s.length ? (
            <div className="ht-changes">
              {v.s.map(([out, id]) => {
                const p = players.find((q) => q.id === id);
                const pos = slotsOf(v.f)[v.l.indexOf(id)];
                const off = p && pos && p.pos !== pos;
                return (
                  <div key={id} className="ht-swap">
                    <span className="sub-way in">{t('Entre')}</span><b>{names[id]}</b>
                    <span className="sub-way out">{t('Sort')}</span><b>{names[out]}</b>
                    {off && <em className="htp-off">{tr('<0/> jouera hors de son poste', [names[id]])}</em>}
                  </div>
                );
              })}
            </div>
          ) : <p className="ht-none">{t('Aucun changement : fais entrer un remplaçant sur le terrain.')}</p>}
          <div className="htp-foot">
            {isSet && <button type="button" className="linkbtn" onClick={clear}>{t('Effacer ce plan')}</button>}
            <button type="button" className="btn" onClick={onClose}>{tr('<0/> Terminé', [<IconCheck />])}</button>
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
  // niveau de l'onze au coup d'envoi, condition physique comprise (comme le pronostic) ; au repos, il vaudrait `rested` :
  // la fatigue se lit à côté du niveau. La forme ne pèse plus en match (0.8.8).
  const rating = lineupRating(state.players, lineup, formation, fitWeight);
  const rested = lineupRating(state.players, lineup, formation);
  const tired = rested - rating >= 0.05 ? rested - rating : 0;
  const home = ctx.home !== false; // à l'extérieur (Élite) : l'avantage du terrain est à l'adversaire, pronostic compris
  // même moteur que le pronostic (calcul exact, expulsions à venir comprises : gardé tant que rien ne change)
  // le onze adverse et ses signes (0.8.5) : ils comptent dans le pronostic ; ils ne s'affichent plus (0.8.10, demande du PDG)
  const away = useMemo(() => awayElevenOf(state, ctx), [state, ctx]);
  const xg = useMemo(() => prematchXg(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength, home, away }), [state, lineup, tactic, formation, ctx.opp.strength, home, away]);
  const odds = useMemo(() => prematchOdds(state, { lineup, tactic, formation, oppStrength: ctx.opp.strength, home, away }), [state, lineup, tactic, formation, ctx.opp.strength, home, away]);
  // coupe : qualifié en gagnant, ou en gagnant la séance de tirs au but après un nul (chance exacte, tireurs et gardien de
  // ce onze) ; le nul ne compte plus pour une demi-qualification
  const pens = ctx.knockout ? penaltySkills(lineup.map((id) => state.players.find((p) => p.id === id)).filter(Boolean)) : null;
  const qualify = pens ? odds.win + odds.draw * shootoutWinChance(pens.home, pens.away) : null;
  const reshape = (f) => { setFormation(f); setLineup(reshapeLineup(state.players, lineup, f)); };
  const form = formationOf(formation);
  // classement des deux clubs (championnat), dès la première journée jouée
  const table = ctx.comp === 'friends' ? [] : standingsOf(state);
  const rowOf = (i) => { const k = table.findIndex((t) => t.i === i); return k < 0 || !table[k].played ? null : { rank: k + 1, pts: table[k].pts }; };
  const standing = (r) => (r ? tn(r.pts, '{v} · {pts} pt · ', '{v} · {pts} pts · ', { v: ordinalText(r.rank), pts: r.pts }, r.pts > 1) : '');
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
    title: tired ? t('{fmtRating} au repos, {fmtRating2} de moins avec la fatigue', { fmtRating: fmtRating(rested), fmtRating2: fmtRating(tired) }) : undefined,
    sub: <>{standing(me)}{t('niveau ')}<strong>{fmtRating(rating)}</strong></>,
  };
  const themTeam = {
    crest: ctx.opp.crest ? <ClubCrest crest={ctx.opp.crest} name={ctx.opp.name} className="pm-crest" /> : <Crest name={ctx.opp.name} className="pm-crest" />,
    name: ctx.opp.name, ref: awayRef, title: undefined,
    sub: <>{standing(them)}{ctx.opp.budget ? t('budget {budget} · ', { budget: fmtMoney(ctx.opp.budget) }) : ''}{t('niveau ')}<strong>{fmtRating(ctx.opp.strength)}</strong></>,
  };
  const [left, right] = home ? [usTeam, themTeam] : [themTeam, usTeam];
  return (
    <div ref={ref} className={`matchscreen prematch ${board ? 'board-open' : 'board-closed'}`}>
      <span className="grip" aria-hidden="true" />
      <header className="pm-head">
        <p className={`pm-eyebrow comp-${ctx.comp || 'league'}`}>{league ? `${divisionOf(state).name} · ` : ''}{ctx.label || t('Journée {v} / {length}', { v: state.round + 1, length: state.schedule.length })} · {home ? t('À domicile') : t('À l’extérieur')}</p>
        <div className="pm-top">
          <div className="pm-matchup">
            <div className="pm-team home">
              {left.crest}
              <div className="pm-tname"><b ref={left.ref}>{left.name}</b><small title={left.title}>{left.sub}</small></div>
            </div>
            <span className="pm-vs" aria-label={t('contre')}>{t('VS')}</span>
            <div className="pm-team away">
              <div className="pm-tname"><b ref={right.ref}>{right.name}</b><small title={right.title}>{right.sub}</small></div>
              {right.crest}
            </div>
          </div>
          {ctx.gate && (home ? (
            <div className="pm-gate glass" aria-label={t('Billetterie du jour')}>
              <div><small>{t('Affluence attendue')}</small><b>{fmtNum(ctx.gate.attendance)} <em>/ {fmtNum(ctx.gate.capacity)}</em></b></div>
              <div><small>{t('Recettes')}</small><b>≈ {fmtMoney(ctx.gate.revenue)}</b></div>
            </div>
          ) : (
            <div className="pm-gate glass" aria-label={t('Match à l’extérieur')}>
              <div><small>{t('Stade adverse')}</small><b>{t('Extérieur')}</b></div>
              <div><small>{t('Droits TV')}</small><b>≈ {fmtMoney(ctx.gate.revenue)}</b></div>
            </div>
          ))}
          <button className="pm-close" onClick={onCancel} aria-label={t('Retour au complexe')}><IconClose /></button>
        </div>
      </header>

      <div className="pm-grid">
        {board ? (
          <section className="pm-xi glass" aria-label={t('Onze de départ')}>
            <div className="pm-xi-head">
              <h3 className="pm-sh mark-head">{tr('Onze de départ · <0/>', [<span className="nowrap">{form.name}</span>])}</h3>
              <span className="pm-level">{tr('Niveau <0/><1/>', [<b>{fmtRating(rating)}</b>, tired > 0 && <em className="pm-tired" title={t('{fmtRating} au repos', { fmtRating: fmtRating(rested) })}>{tr('fatigue −<0/>', [fmtRating(tired)])}</em>])}</span>
              <LineupActions state={state} lineup={lineup} formation={formation} onApply={setLineup} />
              <button type="button" className="pm-fold" onClick={() => setBoard(false)}>{t('Replier')}</button>
            </div>
            <LineupBoard players={state.players} lineup={lineup} formation={formation} onChange={setLineup} fitness={(p) => fitAt(p, 0)} />
          </section>
        ) : (
          <div className="pm-compo">
            <CompoCard title={t('Composition')} detail={t('Onze en {name} · niveau {fmtRating}{v}', { name: form.name, fmtRating: fmtRating(rating), v: tired ? t(' (fatigue −{fmtRating})', { fmtRating: fmtRating(tired) }) : '' })} onOpen={() => setBoard(true)} />
            <LineupActions state={state} lineup={lineup} formation={formation} onApply={setLineup} />
          </div>
        )}
        <section className="pm-plan glass" aria-label={t('Dispositif et tactique')}>
          <h3 className="pm-sh mark-head">{t('Dispositif')}</h3>
          <FormationPicker value={formation} onChange={reshape} />
          <p className="pm-blurb">{form.blurb} <span className="pm-effect">{formationEffect(formation)}</span></p>
          <h3 className="pm-sh mark-head">{t('Tactique')}</h3>
          <TacticPicker value={tactic} onChange={setTactic} />
          {friends && <>
            <h3 className="pm-sh mark-head">{t('Plans de mi-temps')}</h3>
            <PlansSummary players={state.players} lineup={lineup} formation={formation} tactic={tactic} plans={plans} onOpen={setPlansOpen} />
          </>}
        </section>
        <div className="pm-go">
          <section className="pm-odds glass" aria-label={t('Pronostic')}>
            <div className="pm-odds-head">
              <h3 className="pm-sh mark-head">{t('Pronostic')}</h3>
              <span className="pm-xg">{tr('Buts attendus <0/> – <1/>', [<b>{fmtRating(home ? xg.for : xg.against)}</b>, <b>{fmtRating(home ? xg.against : xg.for)}</b>])}</span>
            </div>
            <OddsBar odds={odds} />
            {ctx.knockout && <p className="pm-xg pm-ko">{tr('Élimination directe, tirs au but en cas d’égalité (<0/> % pour toi) · qualification <1/>', [pctOf(shootoutWinChance(pens.home, pens.away)), <b>{pctOf(qualify)} %</b>])}</p>}
            <button className="btn btn-xl" onClick={() => onKickoff(lineup, tactic, formation, friends ? plans : undefined)}>{ctx.goLabel ? <><IconCheck /> {ctx.goLabel}</> : <><IconPlay className="fill" />{t(' Coup d’envoi')}</>}</button>
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
const HL_PRE = 0.2; // minutes de jeu entre le début d'un temps fort et son instant décisif (l'action se construit : 8 à 12 s, 0.8.7)
const HL_ACK = 1500; // ms : une scène 3D qui ne répond pas laisse le direct continuer sans elle
const HL_MAX = 50000; // ms : au-delà, le temps fort se termine quoi qu'il arrive (onglet caché, scène bloquée)
const HL_LABEL = { goal: t('Temps fort'), big: t('Temps fort'), save: t('Temps fort'), post: t('Temps fort'), penalty: t('Penalty'), red: t('Temps fort') };

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
        <span>{t('Temps forts')}</span>
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
// sa saison), le score. Tout se lit du côté qui marque (banner.side), pas du nôtre : un match revu où l'on jouait à
// l'extérieur (replay, side « away ») a l'équipe qui reçoit dans state et nous dans m.awayRoster (0.8.8 : le but d'un
// ami s'affichait à notre nom).
function GoalBanner({ banner, state, m, shown, codes, flip = false, replay = false }) {
  const ours = banner.ours;
  const home = banner.side === 'home';
  const p = home ? state.players.find((q) => q.id === banner.playerId) : (m.awayRoster || []).find((q) => q.name === banner.player);
  const nth = home && !replay && p ? (p.season?.goals || 0) + shown.filter((e) => e.type === 'goal' && e.playerId === banner.playerId
    && (e.half < banner.half || (e.half === banner.half && e.at <= banner.at))).length : 0;
  // passeur : « passe d’Eliott », « passe de Marc » (élision, 0.8.24)
  const facts = [`${banner.minute}′`, banner.q === 'pen' && t('sur penalty'), banner.assist && t('passe {deName}', { deName: deName(banner.assist) }), nth && t('{v} but de la saison', { v: tn(nth, 'premier', '{nth}e', { nth }, !(nth === 1)) })].filter(Boolean);
  return (
    <div className={`lv-goal ${ours ? 'ours' : 'theirs'} ${banner.fast ? 'fast' : ''}`} role="status">
      <span className="lv-goal-word">{ours ? t('But !') : t('But {v}', { v: codes[home ? 0 : 1] })}</span>
      <span className="lv-goal-who">
        {p && <Portrait p={p} club={home ? (replay ? m.home : null) : m.away} size={64} />}
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
      goals.get(k).push(`${e.minute}′${e.q === 'pen' ? t(' (pen.)') : ''}`);
    } else if (e.type === 'red') reds.push({ who: e.player, minute: e.minute });
  }
  if (!goals.size && !reds.length) return <ul className={`lv-facts ${pos}`} />;
  return (
    <ul className={`lv-facts ${pos}`}>
      {[...goals].map(([who, mins]) => <li key={`g${who}`}><IconBall /><span><b>{lastName(who)}</b> {mins.join(', ')}</span></li>)}
      {reds.map((r) => <li key={`r${r.who}`}><i className="card red" aria-label={t('carton rouge')} /><span><b>{lastName(r.who)}</b> {r.minute}′</span></li>)}
    </ul>
  );
}

// Statistiques en direct : seulement ce que le direct a déjà montré (statsOf, live.js) ; la possession ondule minute
// après minute autour de la tendance de la mi-temps.
function LiveStats({ st, poss, flip = false }) {
  const n = (v) => fmtNum(v);
  return (
    <div className="lv-srows">
      <VersusBar label={t('Possession')} home={poss} away={100 - poss} suffix=" %" flip={flip} />
      <VersusBar label={t('Tirs')} home={st.shots[0]} away={st.shots[1]} format={n} flip={flip} />
      <VersusBar label={t('Tirs cadrés')} home={st.on[0]} away={st.on[1]} format={n} flip={flip} />
      <VersusBar label={t('Grosses occasions')} home={st.big[0]} away={st.big[1]} format={n} flip={flip} />
      <VersusBar label={t('Buts attendus')} home={st.xg[0]} away={st.xg[1]} format={(v) => fmtRating(v)} flip={flip} />
      <VersusBar label={t('Arrêts')} home={st.saves[0]} away={st.saves[1]} format={n} flip={flip} />
      <VersusBar label={t('Poteaux')} home={st.post[0]} away={st.post[1]} format={n} flip={flip} />
      <VersusBar label={t('Cartons jaunes')} home={st.yellow[0]} away={st.yellow[1]} format={n} flip={flip} />
      <VersusBar label={t('Cartons rouges')} home={st.red[0]} away={st.red[1]} format={n} flip={flip} />
      {st.pens[0] + st.pens[1] > 0 && <VersusBar label={t('Penalties')} home={st.pens[0]} away={st.pens[1]} format={n} flip={flip} />}
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
                {f.yellow > 0 && !f.red && <i className="card yellow" aria-label={t('averti')} />}
                {f.red > 0 && <i className="card red" aria-label={t('expulsé')} />}
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
const PLURAL = { G: 'gardiens', D: t('défenseurs'), M: 'milieux', A: 'attaquants' };
// postes laissés vides, regroupés : « défenseur », « 2 défenseurs », « milieu, défenseur »
function emptyText(empty) {
  const count = new Map();
  for (const p of empty) count.set(p, (count.get(p) || 0) + 1);
  const parts = [...count].map(([p, n]) => (n > 1 ? `${n} ${PLURAL[p]}` : POS_LABELS[p].toLowerCase()));
  return `${tn(empty.length, 'Poste laissé vide', 'Postes laissés vides', {}, empty.length > 1)} : ${parts.join(', ')}`;
}
const SHORT = ['onze', 'dix', 'neuf', 'huit', 'sept'];
function HalftimeChanges({ state, m, plan, formation, halftime = true, onReset }) {
  const names = displayNames(state.players);
  const pairs = pairSubs(m.lineup, plan);
  const isOut = (id) => m.sent.home.has(id) || m.out.has(id);
  const reshaped = formation !== m.formation;
  // qui change de poste (sans nouveau dispositif) : nommés s'ils sont trois au plus
  const oldSlots = slotsOf(m.formation);
  const newSlots = slotsOf(formation);
  const moves = reshaped ? [] : plan.map((id, k) => {
    const was = m.lineup.indexOf(id);
    return was >= 0 && was !== k && !isOut(id) && oldSlots[was] !== newSlots[k] ? `${names[id]} passe ${POS_LABELS[newSlots[k]].toLowerCase()}` : null;
  }).filter(Boolean);
  const moved = plan.some((id, k) => m.lineup.includes(id) && m.lineup[k] !== id);
  const empty = plan.map((id, k) => (isOut(id) ? newSlots[k] : null)).filter(Boolean);
  if (!pairs.length && !moved && !reshaped) {
    return (
      <>
        <p className="ht-none">{empty.length ? t('Aucun changement : l’équipe {v} à {v2}.', { v: halftime ? t('repart') : t('continue'), v2: SHORT[Math.min(empty.length, 4)] }) : t('Aucun changement : l’équipe {v}.', { v: halftime ? t('repart telle quelle') : t('continue telle quelle') })}</p>
        {empty.length > 0 && <p className="ht-none">{emptyText(empty)}</p>}
      </>
    );
  }
  // niveau du onze en jeu : un expulsé ou un blessé non remplacé laisse son poste vide
  const gone = (lineup) => lineup.map((id) => (isOut(id) ? null : id));
  const before = lineupRating(state.players, gone(m.lineup), m.formation);
  const after = lineupRating(state.players, gone(plan), formation);
  return (
    <div className="ht-changes">
      {reshaped && <span className="ht-moved">{tr('Dispositif : <0/> → <1/>', [formationOf(m.formation).name, formationOf(formation).name])}</span>}
      {pairs.map(([id, out]) => (
        <div key={id} className="ht-swap">
          <span className="sub-way in">{t('Entre')}</span><b>{names[id]}</b>
          <span className="sub-way out">{t('Sort')}</span><b>{names[out]}</b>
        </div>
      ))}
      {moved && !reshaped && <span className="ht-moved">{moves.length && moves.length <= 3 ? moves.join(' · ') : t('Postes réorganisés')}</span>}
      {empty.length > 0 && <span className="ht-moved">{emptyText(empty)}</span>}
      <div className="ht-changes-foot">
        <span>{tr('Niveau du onze <0/> → <1/>', [fmtRating(before), <b className={after >= before ? 'up' : 'down'}>{fmtRating(after)}</b>])}</span>
        <button className="linkbtn sub-reset" onClick={onReset}>{t('Annuler')}</button>
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
  const text = phase === 'halftime' ? t('Le match reprend à la mi-temps, là où tu l’avais laissé.') : t('Le match reprend à la {label}e minute, là où tu l’avais laissé.', { label });
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
  const [form2, setForm2] = useState(live.state.formation); // dispositif envisagé (mi-temps, changement en jeu)
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
  // les mêmes onze pour les joueurs 3D : portrait, âge, poste (teint, cheveux, barbe et taille suivent le portrait)
  const lookOf = (p) => (p ? { id: p.id, name: p.name, age: p.age, pos: p.pos, face: p.face } : null);
  const homeLooks = () => (kickoffView() ? live.state.startLineup : live.state.lineup).map((id) => lookOf(state.players.find((p) => p.id === id)));
  const awayLooks = () => ((kickoffView() && live.state.awayStart) || live.state.awayRoster).map(lookOf);
  const formationNow = () => (kickoffView() ? live.state.startFormation || live.state.formation : live.state.formation);
  const awayFormationNow = () => (kickoffView() ? live.state.awayStartFormation || live.state.awayFormation : live.state.awayFormation);
  // la coupe vers le ralenti (scène 3D) : l'étiquette « Ralenti » tout de suite, sans attendre le prochain tour d'horloge
  useEffect(() => {
    matchFeed.onReplay = () => flushSync(() => setHl((x) => (x && !x.replay ? { ...x, replay: true } : x)));
    return () => { matchFeed.onReplay = null; };
  }, []);
  useEffect(() => {
    Object.assign(matchFeed, {
      active: !preview, ended: false, phase, half, clock: clockRef.current, speed,
      formation: formationNow(), homeNames: homeNames(), awayNames: awayNames(), homeLooks: homeLooks(), awayLooks: awayLooks(),
      awayFormation: awayFormationNow(), awayName: live.state.away,
      hl: null, hlAck: 0, hlReveal: 0, hlDone: 0, hlClock: 0, hlPhase: '', show3D: false,
    });
    return () => { Object.assign(matchFeed, { active: false, hl: null, show3D: false }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Object.assign(matchFeed, { phase: phase === 'subs' ? 'playing' : phase, half, speed, homeNames: homeNames(), awayNames: awayNames(), homeLooks: homeLooks(), awayLooks: awayLooks(), formation: formationNow(), awayFormation: awayFormationNow() });
    if (phase === 'fulltime') matchFeed.ended = true;
  }, [phase, half, events, speed, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // aperçu (galerie) : direct déjà entamé, mi-temps, changement en cours de jeu, ou temps fort (sans la 3D)
  useEffect(() => {
    if (!preview) return;
    const halftime = preview.phase === 'halftime';
    live.advanceTo(Infinity);
    // un des nôtres expulsé avant la pause (aperçu : l'expulsé à déplacer sur le poste à laisser vide)
    if (preview.red && !live.state.sent.home.size) live.state.sent.home.add(live.state.lineup[9]);
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
  // temps fort ou une blessure (la suite attend la fin de la célébration, ou le changement). before : révèle aussi tout
  // ce qui est rangé avant ce temps fort, même un peu après upTo (voir l'horloge). Renvoie le dernier événement révélé.
  const revealTo = (upTo, { through = null, before = null } = {}) => {
    const stop = before ? events.indexOf(before) : -1;
    let last = null;
    while (revealed.current < events.length && (events[revealed.current].at <= upTo || revealed.current < stop || (through && events.indexOf(through) >= revealed.current))) {
      const e = events[revealed.current++];
      last = e;
      setShown((s) => [e, ...s]);
      react(e, { highlighted: e === through });
      if (e === through) break;
      if (e.type === 'injury' || (e.type === 'goal' && !through)) break;
    }
    return last;
  };

  // Temps fort : l'horloge s'arrête au début de l'action, la scène 3D la joue, le direct révèle l'événement à l'instant
  // décisif et reprend après le ralenti.
  const startHighlight = (e, type) => {
    const id = ++hlSeq.current;
    hlRef.current = { id, e, type, started: performance.now(), revealed: false };
    setHl({ id, type, e, replay: false });
    Object.assign(matchFeed, {
      hl: { id, e, type, half, replay: true, homeNames: homeNames(), awayNames: awayNames(), homeLooks: homeLooks(), awayLooks: awayLooks(), awayFormation: awayFormationNow(), formation: formationNow() },
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
          const type = highlightOf(events[k]); // à ×4 aussi : ×4 n'accélère que le jeu entre deux temps forts (0.8.9)
          if (type) { start = { e: events[k], type }; break; }
        }
      }
      if (start) next = Math.max(clockRef.current, Math.min(next, start.e.at - HL_PRE));
      clockRef.current = next;
      matchFeed.clock = next;
      setClock(Math.ceil(next)); // l'écran n'affiche que la minute : un rendu par minute de jeu, pas vingt par seconde
      // ce qui est rangé avant le temps fort mais tombe dans sa construction (l'occasion de l'autre équipe à la même minute,
      // un carton, un mot d'ambiance) passe juste avant lui : l'horloge, arrêtée au début de l'action, ne l'atteindrait
      // jamais, et le direct restait figé (près d'un match sur cinq, 0.8.22) ; un blessé ouvre d'abord son changement
      const lastShown = revealTo(next, { before: start?.e });
      if (start && lastShown?.type !== 'injury' && revealed.current === events.indexOf(start.e) && pause.current <= 0 && !hlRef.current) startHighlight(start.e, start.type);
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
  // le match peut s'arrêter pour réorganiser l'équipe (dispositif, tactique, postes) même sans changement restant
  const canAdjust = () => subMinute(clockRef.current) <= live.halfEnd;

  // changement en cours de jeu : le match s'arrête, la composition s'ouvre ; le changement prendra effet au prochain
  // arrêt de jeu (une à deux minutes plus tard, après tout ce que le direct a montré)
  function openSubs(note = null, open = false) {
    const at = subMinute(clockRef.current);
    setPlan([...m.lineup]);
    setTactic2(m.tactic);
    setForm2(m.formation);
    setBoard(open || !narrowScreen());
    setSub({ at, note, err: null });
    setPhase('subs');
  }
  function closeSubs(apply) {
    if (apply && sub) {
      const err = live.change(sub.at, { lineup: plan, tactic: tactic2, formation: form2 });
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
      // un but joué en 3D est un temps fort : bandeau et célébration à vitesse normale, même à ×4
      const fast = speed > 1 && !highlighted;
      setBanner({ ...e, ours, fast });
      if (!highlighted) {
        pause.current = speed > 1 ? 1.6 : 4.4;
        setTimeout(() => setBanner((b) => (b && b.at === e.at ? null : b)), (speed > 1 ? 1.6 : 4.2) * 1000);
      }
      if (ours) sound.goal(); else sound.conceded();
      onFx({ type: ours ? 'goal' : 'conceded', fast });
    } else if (e.type === 'chance' && (e.outcome === 'post' || e.outcome === 'saved')) sound.chance();
    else if (e.type === 'yellow' || e.type === 'red') sound.card();
    else if (e.type === 'injury') { // un blessé : s'il reste un changement, le match s'arrête pour le faire
      sound.whistle(1);
      if (!replay && canSub()) openSubs(t('{player} est blessé et ne peut pas continuer : fais entrer un remplaçant, ou continue à dix.', { player: e.player }));
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
    else live.change(45, { lineup: plan || m.lineup, tactic: tactic2, formation: form2, halftime: true });
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

  useEffect(() => { if (phase === 'halftime') { setPlan([...m.lineup]); setTactic2(m.tactic); setForm2(m.formation); setBoard(!!preview?.board); } }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // nouveau dispositif : les joueurs encore en jeu replacés au mieux ; un expulsé ou un blessé non remplacé prend le poste
  // qui pèse le moins (on peut l'y déplacer ensuite, le poste où on le pose est celui laissé vide)
  const reshapePlan = (f) => {
    if (f === form2) return; // déjà choisi : les déplacements faits à la main restent
    const cur = plan || m.lineup;
    const off = cur.filter((id) => id !== null && (m.sent.home.has(id) || m.out.has(id)));
    const fit = cur.filter((id) => id !== null && !off.includes(id)).map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
    let k = 0;
    const next = autoLineup(fit, f).map((id) => (id === null ? off[k++] ?? null : id));
    // jamais le but vide : si le poste laissé vide tombe au but, le meilleur gardien encore en jeu y retourne
    const gk = slotsOf(f).indexOf('G');
    if (off.includes(next[gk])) {
      const byId = (id) => state.players.find((p) => p.id === id);
      const best = next.map((id, j) => [id, j]).filter(([id, j]) => j !== gk && id !== null && !off.includes(id))
        .sort((a, b) => ratingAt(byId(b[0]), 'G') - ratingAt(byId(a[0]), 'G'))[0];
      if (best) [next[gk], next[best[1]]] = [next[best[1]], next[gk]];
    }
    setPlan(next);
    setForm2(f);
  };
  const planned = plan || m.lineup;
  const plannedSubs = pairSubs(m.lineup, planned).length; // changements prévus sur le terrain
  const subsLeft = SUBS_MAX - m.subsUsed - plannedSubs; // changements encore possibles
  const boardOpen = phase === 'halftime' || phase === 'subs';
  // match revu, à la pause : ce que les plans de mi-temps des deux clubs ont changé (remplacements, dispositif, tactique),
  // déjà joué par le moteur au début de la seconde période
  const htReplay = !!replay && phase === 'halftime';
  const htMoves = useMemo(() => (htReplay
    ? live.eventsOf(2).filter((e) => e.at <= 45.01 && (e.type === 'sub' || e.type === 'info')) : []), [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  // et les faits de la première période (buts, cartons, blessés), dans l'ordre du match
  const htFacts = useMemo(() => (htReplay ? [...shown].reverse().filter((e) => ['goal', 'yellow', 'red', 'injury'].includes(e.type)) : []), [phase]); // eslint-disable-line react-hooks/exhaustive-deps
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
    : live.oddsShown(oddsMinute, shown, boardOpen ? { lineup: planned, tactic: tactic2, formation: form2 } : {})), [oddsMinute, shown, phase, plan, tactic2, form2, lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // notre club en visiteur (match revu en ligue, 1.0.2, bug relevé par le PDG) : le moteur donne les chances du club qui
  // reçoit ; retournées, ce sont les nôtres (victoire en or, défaite en rouge). Le PDG menait 0-1 à la 83e et lisait
  // « 1 % · 15 % · 84 % ».
  const ours = odds && side === 'away' ? { ...odds, win: odds.loss, loss: odds.win } : odds;
  const st = useMemo(() => statsOf(shown), [shown]);
  const pronoBlock = ( // mi-temps et changement : le pronostic final (match revu : dans la seconde colonne)
    <div className="ht-block">
      <span className="ht-label">{tr('Pronostic final<0/>', [phase === 'subs' ? t(' avec ces changements') : ''])}</span>
      {ours && <OddsBar odds={ours} />}
    </div>
  );
  // match revu : le moteur a déjà joué les deux périodes, la possession de la pause est celle de la première
  const poss = phase === 'halftime' && replay ? live.possessionAt(1, live.halfEnd)
    : phase === 'halftime' || phase === 'fulltime' ? m.stats.possession : live.possessionAt(half, minute);
  const div = divisionOf(state)?.name || ''; // championnat entre amis : pas de division (ctx.label)
  const round = ctx.comp === 'league' || !ctx.comp
    ? <><span className="hm-long">{tr('<0/> · Journée', [div])}{' '}</span><span className="hm-short">{div} · {t('J')}</span>{state.round + 1}/{state.schedule.length}</> : ctx.label;
  const period = phase === 'halftime' ? t('Mi-temps') : phase === 'fulltime' ? t('Fin du match{v}', { v: m.pens ? t(' · t.a.b. {a}-{b}', { a: m.pens[0], b: m.pens[1] }) : '' }) : tn(half, '1re période', '2e période', {}, !(half === 1));
  const clockEl = phase === 'halftime' ? t('Mi-temps') : phase === 'fulltime' ? t('Terminé{v}', { v: m.pens ? t(' · t.a.b. {a}-{b}', { a: m.pens[0], b: m.pens[1] }) : '' })
    : <>{replay ? <span className="lv-replay">{t('Rejeu')}</span> : <i className={`live-dot ${phase === 'subs' ? 'hold' : ''}`} />}{minuteLabel}′</>; // un match revu n'est pas un direct : pas de point rouge
  const pct = ours ? roundPercents([ours.win, ours.draw, ours.loss]) : null;
  const xiNames = displayNames(state.players);
  const names = useMemo(() => ({ short: xiNames, byName: Object.fromEntries(state.players.map((p) => [p.name, p.id])) }), [lineupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitOf = (r) => { const p = state.players.find((q) => q.id === r.id); return p ? Math.round(fitAt(p, minute, since(r.id))) : null; };
  const homeRows = notesNow.home;
  const awayRows = notesNow.away;
  // à l'extérieur en carrière (le moteur nous garde du côté « home ») : l'équipe qui reçoit passe à gauche (0.8.1) ;
  // L et R : le côté du moteur montré à gauche et à droite (un match revu d'un ami est déjà dans le bon sens)
  const kits = useMemo(() => matchKits(replay ? { opp: ctx.opp.name, oppCrest: ctx.opp.crest, home: state.clubName, homeCrest: state.crest, side } : { opp: ctx.opp.name }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = side === 'home' && m.atHome === false;
  const [L, R] = flip ? ['away', 'home'] : ['home', 'away'];
  const teamName = { home: m.home, away: m.away };
  const teamCode = { home: codes[0], away: codes[1] };
  const teamGoals = { home: goalsH, away: goalsA };
  const crestOf = (k, className) => (k === 'home' ? <HomeCrest state={state} name={m.home} className={className} /> : <AwayCrest ctx={ctx} name={m.away} className={className} />);
  // tenue de chaque équipe dans les temps forts 3D (1.0.3, demande du PDG : on ne savait pas qui jouait en quelle
  // couleur) : un code couleur discret, façon télé, maillot et col, à côté de son nom dans le score
  const kitEl = (k) => <i className="lv-kit" aria-hidden="true" style={{ '--kit': kitHex(kits[k].shirt), '--kit-trim': kitHex(kits[k].trim != null && kits[k].trim !== HOME_KIT.trim ? kits[k].trim : kits[k].shirt) }} />; // col anthracite : invisible sur le bandeau, la barre reste pleine

  const boardEl = (
    <LineupBoard
      players={state.players}
      lineup={planned}
      formation={form2}
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
    <div className="lv-prono" title={t('Chances de victoire, de nul et de défaite à la fin du match, calculées sur le moteur à partir de ce que le direct a montré')}>
      <div className="lv-prono-head"><span>{t('Pronostic final')}</span><b><em className="w">{pct[0].label}</em> · {pct[1].label} · <em className="l">{pct[2].label}</em></b></div>
      <div className="odds-bar" aria-hidden="true"><i className="w" style={{ flexGrow: ours.win * 100 }} /><i className="d" style={{ flexGrow: ours.draw * 100 }} /><i className="l" style={{ flexGrow: ours.loss * 100 }} /></div>
    </div>
  );
  const viewNow = view === 'notes' && !tabbedScreen() ? 'stats' : view;

  return (
    <div className={`matchscreen live ${phase !== 'playing' ? 'paused' : ''} ${hl ? 'hl' : ''} ${side === 'away' ? 'ours-away' : ''}`}>
      <div className="lv-centre" aria-hidden={hl ? 'true' : undefined}>
        <header className="lv-board">
          <p className="lv-eyebrow">{round}{m.atHome === false ? t(' · Extérieur') : ''} · {period}</p>
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

        <div className="lv-tabs" role="tablist" aria-label={t('Centre du match')}>
          {[['stats', t('Stats')], ['notes', t('Notes')], ['feed', t('Le fil')]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={`${view === id ? 'on' : ''} ${id === 'notes' ? 'only-sm' : ''}`} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>

        <div className={`lv-cols view-${viewNow} notes-${notesSide}`}>
          <section className="lv-col home" aria-label={t('Notes de {v}', { v: teamName[L] })}>
            <div className="lv-col-head">
              <h3 className="pm-sh mark-head">{teamName[L]}</h3>
              <span className="lv-col-sub">{t('Notes du match')}</span>
            </div>
            <TeamNotes rows={L === 'home' ? homeRows : awayRows} shown={shown} side={L} fitOf={L === 'home' ? fitOf : null} names={names} />
          </section>
          <section className="lv-mid" aria-label={t('Statistiques et fil du match')}>
            <div className="lv-mid-tabs" role="tablist" aria-label={t('Statistiques ou fil')}>
              {[['stats', t('Statistiques')], ['feed', t('Le fil')]].map(([id, label]) => (
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
          <section className="lv-col away" aria-label={t('Notes de {v}', { v: teamName[R] })}>
            <div className="lv-col-head">
              <h3 className="pm-sh mark-head">{teamName[R]}</h3>
              <span className="lv-col-sub">{t('Notes du match')}</span>
            </div>
            <TeamNotes rows={R === 'home' ? homeRows : awayRows} shown={shown} side={R} fitOf={R === 'home' ? fitOf : null} names={names} />
          </section>
          <div className="lv-notes-switch" role="tablist" aria-label={t('Équipe')}>
            {[['home', teamName[L]], ['away', teamName[R]]].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={notesSide === id} className={notesSide === id ? 'on' : ''} onClick={() => setNotesSide(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* pendant un temps fort : le score façon télé au-dessus de la 3D */}
      <header className="lv-top">
        <div className="lv-bug" aria-label={`${teamName[L]} ${teamGoals[L]}, ${teamName[R]} ${teamGoals[R]}`}>
          <span className="lv-team home">{crestOf(L, 'lv-crest')}<b title={teamName[L]}>{teamCode[L]}</b>{kitEl(L)}</span>
          <span className="lv-score"><b key={`${L}${teamGoals[L]}`}>{teamGoals[L]}</b><i>-</i><b key={`${R}${teamGoals[R]}`}>{teamGoals[R]}</b></span>
          <span className="lv-team away">{kitEl(R)}<b title={teamName[R]}>{teamCode[R]}</b>{crestOf(R, 'lv-crest')}</span>
        </div>
        <span className={`lv-clock is-${phase}`}>{clockEl}</span>
      </header>
      {hl && (
        <div className={`lv-hl-tag ${hl.replay ? 'replay' : ''}`} role="status">
          <span>{hl.replay ? t('Ralenti') : HL_LABEL[hl.type] || t('Temps fort')}</span>
          <b>{hl.e.minute}′</b>
        </div>
      )}

      {banner && <GoalBanner key={`${banner.half}-${banner.at}`} banner={banner} state={state} m={m} shown={shown} codes={codes} flip={flip} replay={!!replay} />}

      {phase === 'playing' && (hl ? (
        <div className="live-controls lv-controls">
          <button className="lc-pass" onClick={endHighlight}><IconPlay className="fill" /><span>{t('Passer le temps fort')}</span></button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? t('Remettre le son') : t('Couper le son')} title={muted ? t('Son coupé') : t('Son')}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      ) : (
        <div className="live-controls lv-controls">
          {/* vitesse du match (0.8.9, demande du PDG) : un seul bouton qui dit l'état, « ▶ ×1 » ou « ⏩ ×4 » plein en or ;
              ×4 n'accélère que le jeu entre deux temps forts, qui se jouent toujours à vitesse normale */}
          <button className={speed > 1 ? 'lc-speed on' : 'lc-speed'} aria-pressed={speed > 1} aria-label={tn(speed, 'Vitesse normale : accélérer ×4', 'Match accéléré ×4 : revenir à la vitesse normale', {}, speed > 1)}
            title={tn(speed, 'Vitesse normale : toucher pour accélérer ×4 entre les temps forts', 'Accéléré ×4 entre les temps forts : toucher pour revenir à ×1', {}, speed > 1)} onClick={() => setSpeed(speed > 1 ? 1 : 4)}>
            {speed > 1 ? <IconFast className="fill" /> : <IconPlay className="fill" />}×{speed}
          </button>
          {!replay && <button className="lc-sub" onClick={() => openSubs()} disabled={!canAdjust()} title={!canAdjust() ? (tn(half, 'Attends la mi-temps', 'Trop tard : le match touche à sa fin', {}, !(half === 1))) : canSub() ? t('Faire un changement, changer de dispositif ou de tactique') : t('Plus de changement possible : dispositif, tactique et postes seulement')}>
            <IconSwap /><span className="hide-sm">{t('Changement')}</span><span className="show-sm">{t('Changer')}</span><em className={subsLeftNow() ? '' : 'none'}>{subsLeftNow()}</em>
          </button>}
          <button className="lc-skip" onClick={skip}>
            <span className="hide-sm">{tn(half, 'Aller à la mi-temps', 'Aller au coup de sifflet', {}, !(half === 1))}</span>
            <span className="show-sm">{tn(half, 'Mi-temps', 'Fin du match', {}, !(half === 1))}</span>
          </button>
          <button className="lc-sound" aria-pressed={!muted} aria-label={muted ? t('Remettre le son') : t('Couper le son')} title={muted ? t('Son coupé') : t('Son')}
            onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>
      ))}

      {boardOpen && (
        <div className={`halftime glass ${phase === 'subs' ? 'subs' : ''} ${htReplay ? 'replay' : board ? 'board-open' : 'board-closed'}`}>
          <div className="ht-col">
            <h3 className="pm-sh mark-head">{phase === 'halftime' ? (replay ? t('Mi-temps') : t('Mi-temps · tes consignes')) : t('{minuteLabel}′ · changement', { minuteLabel })}</h3>
            {phase === 'subs' && (
              <p className={`ht-note ${sub?.note ? 'warn' : ''}`}>{sub?.note || t('Le match est arrêté. Ce que tu décides prend effet à la {v}e minute, au prochain arrêt de jeu.', { v: sub?.at })}</p>
            )}
            <div className="lv-stats ht-stats">
              <div><b>{goalsH} - {goalsA}</b><span>{t('Score')}</span></div>
              <div><b>{poss} %</b><span>{t('Possession')}</span></div>
              <div><b>{st.shots[0]} - {st.shots[1]}</b><span>{t('Tirs')}</span></div>
              <div><b>{st.on[0]} - {st.on[1]}</b><span>{t('Cadrés')}</span></div>
            </div>
            {htReplay ? ( /* match revu (ligue) : rien à décider à la pause, le résumé de la première période */
              <>
                <div className="ht-block ht-b-half">
                  <span className="ht-label">{t('Première période')}</span>
                  {htFacts.length
                    ? <ol className="feed-list ht-moves">{htFacts.map((e) => <EventRow key={keyOf(e)} e={e} />)}</ol>
                    : <p className="ht-note">{t('Ni but, ni carton, ni blessé en première période.')}</p>}
                </div>
              </>
            ) : pronoBlock}
            {!board && !replay && (
              <CompoCard
                title={t('Composition et changements')}
                detail={tn(subsLeft, '{v}{name} · {v2}{n} possible sur {SUBS_MAX}', '{v}{name} · {v2}{n} possibles sur {SUBS_MAX}', { v: form2 !== m.formation ? `${formationOf(m.formation).name} → ` : '', name: formationOf(form2).name, v2: plannedSubs ? tn(plannedSubs, '{plannedSubs} changement prévu · ', '{plannedSubs} changements prévus · ', { plannedSubs }, plannedSubs > 1) : '', n: subsLeft, SUBS_MAX }, subsLeft > 1)}
                onOpen={() => setBoard(true)}
              />
            )}
            {board && ( /* repliée, la carte résume les changements : rien d'autre de la composition à l'écran */
              <div className="ht-block ht-b-changes">
                <span className="ht-label">{t('Changements')}</span>
                <HalftimeChanges state={state} m={m} plan={planned} formation={form2} halftime={phase === 'halftime'} onReset={() => { setPlan([...m.lineup]); setForm2(m.formation); }} />
              </div>
            )}
            {!replay && <div className="ht-block ht-b-formation">
              <span className="ht-label">{phase === 'halftime' ? t('Dispositif de la seconde période') : t('Dispositif')}</span>
              <FormationPicker value={form2} onChange={reshapePlan} />
            </div>}
            {!replay && <div className="ht-block ht-b-tactic">
              <span className="ht-label">{phase === 'halftime' ? t('Tactique de la seconde période') : t('Tactique')}</span>
              <TacticPicker value={tactic2} onChange={setTactic2} compact />
            </div>}
            {sub?.err && <p className="ht-note warn">{sub.err}</p>}
          </div>
          {htReplay && ( /* seconde colonne (téléphone : à la suite) : temps forts, pronostic, changements de la pause */
            <div className="ht-col">
              <div className="ht-block ht-b-momentum">
                <Momentum shown={shown} upTo={slotOf(live.halfEnd, 1)} possHalf={m.stats.possHalf} names={[m.home, m.away]} codes={codes} flip={flip} />
              </div>
              {pronoBlock}
              <div className="ht-block ht-b-replay">
                <span className="ht-label">{t('Changements de la mi-temps')}</span>
                <p className="ht-note">{t('Prévus dans les plans de mi-temps validés avant le match.')}</p>
                {htMoves.length
                  ? <ol className="feed-list ht-moves">{htMoves.map((e) => <EventRow key={keyOf(e)} e={e} />)}</ol>
                  : <p className="ht-note">{t('Aucun changement à la pause : les mêmes onze et les mêmes consignes en seconde période.')}</p>}
              </div>
            </div>
          )}
          {board && <div className="ht-col ht-board">
            <div className="ht-board-head">
              <span className="ht-label">{t('Ton équipe · pastille : note du match · sous le nom : condition')}</span>
              <button type="button" className="linkbtn ht-board-close" onClick={() => setBoard(false)}>{t('Replier')}</button>
            </div>
            {boardEl}
          </div>}
          <div className="ht-go">
            {phase === 'halftime'
              ? <button className="btn btn-xl" onClick={resume}>{tr('<0/> Reprendre la seconde période', [<IconPlay className="fill" />])}</button>
              : <>
                <button className="btn ghost btn-xl" onClick={() => closeSubs(false)}>{t('Annuler')}</button>
                <button className="btn btn-xl" onClick={() => closeSubs(true)}>{tr('<0/> Reprendre', [<IconPlay className="fill" />])}</button>
              </>}
          </div>
        </div>
      )}

    </div>
  );
}
