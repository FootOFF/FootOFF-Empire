import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, DIVISIONS, POS_LABELS, SQUAD_MAX, upgradeCost, divisionOf } from '../game/constants';
import { ATTRS, FAMILIES, GK_ATTRS, TRAITS, playerRating, potentialRange, ratingAt, wageOf } from '../game/players';
import {
  MISSION_BOOST, MISSION_KINDS, MISSION_STEPS, PLANS, PROFILES, SCOUTED, YOUTH_LEAVE_AGE, YOUTH_PLACES, advisedPlan, cancelMission,
  missionCount, missionPlan, missionReturn, missionTarget, planAttrs, planPace, scoutingWhen, startMission, markScoutingSeen,
} from '../game/academy';
import { academyTalent, scoutingError } from '../game/economy';
import { leagueLength } from '../game/cups';
import { promoteYouth, releaseYouth, setYouthPlan, signYouth } from '../game/engine';
import { fitGain } from '../game/mercato';
import { deName } from '../game/names';
import { fmtMoney, fmtRating, footLabel } from './format';
import { IconAcademy, IconArrowUp, IconChevron, IconChevronLeft, IconClock, IconClose, IconTarget } from './icons';
import { Eyebrow, divRef, tierOf } from './kit';
import { Panel } from './panels';
import { Tabs } from './glass';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';
import { Portrait } from './portrait';
import { heat } from './mercato';
import { numLocale, plural, t, tn, tr } from '../i18n/index';

// Académie : l'équipe de jeunes du club (academy.js), ouverte d'un clic sur le bâtiment dans la vue 3D. Deux onglets,
// dans le style de l'Effectif (tableau détaillé sur PC, liste compacte sur téléphone) : « Mes jeunes » (six places,
// niveau, potentiel, progrès, plan d'entraînement) et « Détection » (les jeunes repérés de la journée, à recruter
// gratuitement). La fiche d'un jeune choisit son plan, le fait monter en équipe première ou le libère.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
const plus = (v) => (v >= 0.05 ? `+${fmtRating(v)}` : '–');
const potText = (r) => (r ? `${fmtRating(r[0])} – ${fmtRating(r[1])}` : 'atteint');
const potMid = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 : playerRating(p); };
const dec = (v) => (Math.round(v * 10) / 10).toLocaleString(numLocale());
const isLeaving = (p) => p.age + 1 >= YOUTH_LEAVE_AGE; // 19 ans à l'intersaison : dernière saison à l'académie
const planOf = (p) => (PLANS[p.plan] ? p.plan : advisedPlan(p));
const forPos = (pos) => t('pour un {toLowerCase}', { toLowerCase: POS_LABELS[pos].toLowerCase() });
const attrName = (p, key) => (p.pos === 'G' ? GK_ATTRS : ATTRS).find((a) => a.key === key)?.name.toLowerCase() || key;
const listFr = (a) => (a.length > 1 ? new Intl.ListFormat(numLocale(), { type: 'conjunction' }).format(a) : a[0] || ''); // « A, B et C », dans la langue de la partie
const gainTip = (g = {}) => t('Dernière journée {plus} · cette saison {plus2}{v}', { plus: plus(g.round || 0), plus2: plus(g.season || 0), v: g.summer != null ? t(' · dernier été {plus}', { plus: plus(g.summer) }) : '' });

export function AcademyView({ state, run, ask, notify = () => {}, onClose, onBuilding, initialTab = 'youth', focus = [], preview = null }) {
  const [tab, setTab] = useState(initialTab);
  const [sheet, setSheet] = useState(preview?.sheet ? { id: preview.sheet, list: preview.list || 'youth' } : null); // { id, list }
  const ref = divRef(state);
  const lvl = state.buildings.academy || 0;
  const youth = useMemo(
    () => [...(state.youth || [])].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a)),
    [state.youth],
  );
  // jeunes repérés : le plus prometteur d'abord (potentiel estimé, puis niveau)
  const scouted = useMemo(
    () => [...(state.scouting?.list || [])].sort((a, b) => potMid(state, b) - potMid(state, a) || playerRating(b) - playerRating(a)),
    [state], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const full = youth.length >= YOUTH_PLACES;
  // détection regardée : sa pastille s'éteint jusqu'à la liste de la journée suivante (0.8.2)
  const scoutSeen = !!state.scouting?.seen;
  useEffect(() => { if (tab === 'scout' && state.scouting && !scoutSeen && !preview) run(markScoutingSeen); }, [tab, state.scouting?.key, scoutSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  const upgradable = lvl < BUILDINGS.academy.max && state.money >= upgradeCost('academy', lvl + 1);

  // une notification mène au jeune annoncé : sa ligne s'éclaire et vient au centre
  useEffect(() => {
    if (!focus.length) return;
    const el = [...document.querySelectorAll(`.panel [data-id="${focus[0]}"]`)].find((e) => e.offsetParent);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = sheet?.list === 'scout' ? scouted : youth;
  const sheetPlayer = sheet ? list.find((p) => p.id === sheet.id) || null : null;
  const step = (d) => {
    const i = list.findIndex((p) => p.id === sheet.id);
    const next = list[(i + d + list.length) % list.length];
    if (next) setSheet({ ...sheet, id: next.id });
  };
  const onEscape = () => { if (sheet) setSheet(null); else onClose(); };

  // recruter : gratuit, dans la limite des places ; le plan conseillé pour son poste est choisi d'emblée
  const sign = (p) => {
    const plan = advisedPlan(p);
    if (!run((s) => signYouth(s, p.id), full ? t('Académie complète : fais monter ou libère un jeune.') : t('Recrutement impossible.'))) return;
    setSheet(null);
    notify({
      kind: 'academy', eyebrow: t('Académie'), title: t('{name} rejoint l’académie', { name: p.name }),
      text: t('Plan {toLowerCase}, conseillé {forPos}.', { toLowerCase: PLANS[plan].label.toLowerCase(), forPos: forPos(p.pos) }),
      action: { panel: 'academy', tab: 'youth', ids: [p.id] },
    });
  };
  const promote = (p) => {
    const n = state.players.length;
    if (n >= SQUAD_MAX) return;
    ask({
      title: t('Faire monter {name} en équipe première ?', { name: p.name }),
      text: t('Il rejoint l’effectif professionnel, avec un salaire, et ne pourra plus revenir à l’académie.'),
      rows: [
        [t('Niveau'), fmtRating(playerRating(p))],
        [t('Potentiel estimé'), potText(potentialRange(p, state))],
        [t('Salaire'), t('{wageOf} / saison', { wageOf: fmtMoney(wageOf(p, state.divisionIndex)) }), 'down'],
        [t('Effectif'), t('{n} → {v} joueurs', { n, v: n + 1 })],
      ],
      confirmLabel: t('Faire monter'),
      cancelLabel: t('Pas encore'),
      onConfirm: () => {
        if (!run((s) => promoteYouth(s, p.id), t('Effectif complet.'))) return;
        setSheet(null);
        notify({
          kind: 'academy', eyebrow: t('Académie'), title: t('{name} monte en équipe première', { name: p.name }),
          text: t('Formé au club, il rejoint ton effectif.'), action: { panel: 'squad', tab: 'players', sheet: p.id },
        });
      },
    });
  };
  const release = (p) => ask({
    tone: 'danger',
    title: t('Libérer {name} ?', { name: p.name }),
    text: t('Il quitte le club définitivement, et sa place à l’académie se libère.'),
    confirmLabel: t('Libérer'),
    cancelLabel: t('Le garder'),
    onConfirm: () => {
      if (!run((s) => releaseYouth(s, p.id))) return;
      setSheet(null);
      notify({ kind: 'info', title: t('{name} a quitté l’académie', { name: p.name }) });
    },
  });

  const open = (p, from) => setSheet({ id: p.id, list: from });
  return (
    <Panel
      id="academy"
      size="lg"
      title={t('Académie')}
      eyebrow={<>{t('Niveau ')}<bdi>{lvl} / {BUILDINGS.academy.max}</bdi> · <bdi>{youth.length} / {YOUTH_PLACES}</bdi>{t(' jeunes')}<span className="hide-sm"> · {divisionOf(state).name}</span></>}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <>
          <Places state={state} youth={youth} upgradable={upgradable} onBuilding={onBuilding} />
          <Tabs
            items={[
              ['youth', t('Mes jeunes'), youth.length ? <em className="mc-count-badge ac-tab-n">{youth.length}</em> : null],
              ['scout', t('Détection'), scouted.length && !scoutSeen ? <em className={`mc-count-badge ac-tab-n ${full ? '' : 'hot'}`}>{scouted.length}</em> : null],
            ]}
            value={tab}
            onChange={setTab}
          />
        </>
      )}
      overlay={(
        <Presence>{sheetPlayer && (
          <AcademySheet
            p={sheetPlayer}
            scout={sheet.list === 'scout'}
            place={`${list.findIndex((q) => q.id === sheetPlayer.id) + 1} / ${list.length}`}
            state={state}
            refLvl={ref}
            full={full}
            onClose={() => setSheet(null)}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onSign={() => sign(sheetPlayer)}
            onPromote={() => promote(sheetPlayer)}
            onRelease={() => release(sheetPlayer)}
            onPlan={(plan) => run((s) => setYouthPlan(s, sheetPlayer.id, plan))}
          />
        )}</Presence>
      )}
    >
      {tab === 'youth' ? (
        <YouthTab state={state} youth={youth} scouted={scouted} refLvl={ref} focus={focus} onOpen={(p) => open(p, 'youth')} onScout={() => setTab('scout')} />
      ) : (
        <ScoutTab state={state} scouted={scouted} full={full} refLvl={ref} onOpen={(p) => open(p, 'scout')} onSign={sign} onBuilding={onBuilding} run={run} ask={ask} notify={notify} />
      )}
    </Panel>
  );
}

// --- Places : six cases, une par jeune (orange : dernière saison avant ses 19 ans) --------------------------------

function Places({ state, youth, upgradable, onBuilding }) {
  const order = [...youth].sort((a, b) => isLeaving(a) - isLeaving(b));
  return (
    <div className="sq-budget ac-places">
      <div className="sq-budget-top"><span>{t('Places')}</span><b><bdi>{youth.length} / {YOUTH_PLACES}</bdi></b></div>
      <span className="ac-slots" aria-hidden="true">
        {Array.from({ length: YOUTH_PLACES }, (_, i) => <i key={i} className={!order[i] ? '' : isLeaving(order[i]) ? 'warn' : 'on'} />)}
      </span>
      <span className="sq-budget-sub">{t('Gratuites, sans salaire · ')}<button className="linkbtn fin-link" onClick={onBuilding}>{tr('bâtiment niveau <0/>', [state.buildings.academy || 0])}</button>
        {upgradable && <em className="ac-up">{t(' · amélioration possible')}</em>}
      </span>
    </div>
  );
}

// --- Mes jeunes -----------------------------------------------------------------------------------------------

// Prochain repérage : après la prochaine journée de championnat, dans deux journées (Élite : une liste toutes les deux
// journées), ou au début de la saison prochaine.
function nextScouting(state) {
  if (state.mission) return t('au retour de tes recruteurs, {whenText}', { whenText: whenText(state, missionReturn(state, state.mission.left)) });
  const { next } = scoutingWhen(state);
  return next == null ? t('au début de la saison prochaine') : tn(next, 'après la prochaine journée de championnat', 'dans deux journées de championnat', {}, next > 1);
}

function YouthTab({ state, youth, scouted, refLvl, focus, onOpen, onScout }) {
  const leaving = youth.filter(isLeaving);
  const rules = (
    <p className="sq-hint ac-rules">{tr('Après chaque journée de championnat, tes jeunes progressent, surtout dans les qualités de leur plan, puis ils font un bond à l’intersaison. Ils ne touchent pas de salaire. À <0/> ans, un jeune qui n’est pas monté en équipe première quitte le club.', [YOUTH_LEAVE_AGE])}</p>
  );
  if (!youth.length) {
    return (
      <>
        <div className="ac-empty">
          <span className="ac-empty-ico"><IconAcademy /></span>
          <h3>{t('Ton équipe de jeunes est vide')}</h3>
          <p>{tr('<0/> places, sans frais : <1/>', [YOUTH_PLACES, scouted.length
              ? (tn(scouted.length, 'recrute le jeune repéré par tes éducateurs.', 'recrute parmi les {length} jeunes repérés par tes éducateurs.', { length: scouted.length }, scouted.length > 1))
              : t('de nouveaux jeunes seront repérés {nextScouting}.', { nextScouting: nextScouting(state) })])}</p>
          {scouted.length > 0 && <button className="btn" onClick={onScout}>{t('Voir la détection')}</button>}
        </div>
        {rules}
      </>
    );
  }
  const names = leaving.map((p) => p.name).join(', ');
  return (
    <>
      {leaving.length > 0 && (
        <div className="ac-alert" role="note">
          <IconClock aria-hidden="true" />
          <p>{tr('<0/> <1/> <2/> ans à l’intersaison : fais-<3/> monter en équipe première avant la fin de la saison, sinon <4/> le club.', [<b>{names}</b>, tn(leaving.length, 'aura', 'auront', {}, leaving.length > 1), YOUTH_LEAVE_AGE, tn(leaving.length, 'le', 'les', {}, leaving.length > 1), tn(leaving.length, 'il quittera', 'ils quitteront', {}, leaving.length > 1)])}</p>
        </div>
      )}
      <div className="sq-tables">
        <YouthTable state={state} rows={youth} refLvl={refLvl} focus={focus} onOpen={onOpen} />
      </div>
      <ul className="sq-list ac-list">
        {youth.map((p) => <YouthRow key={p.id} p={p} state={state} refLvl={refLvl} focus={focus.includes(p.id)} onOpen={() => onOpen(p)} />)}
      </ul>
      {rules}
    </>
  );
}

// Tri d'un tableau par un clic sur l'en-tête de colonne (comme l'Effectif).
function useSort(rows, value) {
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const sorted = sort.key ? [...rows].sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * sort.dir) : rows;
  const th = (key, label, cls = '', name = label) => (
    <th
      key={key}
      className={`${cls} ${sort.key === key ? 'sorted' : ''}`}
      onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : -1 })}
      title={t('{name} · trier', { name })}
      aria-sort={sort.key === key ? (sort.dir < 0 ? 'descending' : 'ascending') : undefined}
    >
      {label}{sort.key === key && <IconChevron className={`sq-sort ${sort.dir < 0 ? 'down' : 'up'}`} aria-hidden="true" />}
    </th>
  );
  return [sorted, th];
}

const sortValue = (state) => (p, key) => {
  if (key === 'age') return p.age;
  if (key === 'lvl') return playerRating(p);
  if (key === 'pot') return potMid(state, p);
  if (key === 'prog') return p.gain?.season || 0;
  return 0;
};

function Strengths({ p }) {
  return <span className="ac-best">{topAttrs(p).map((a) => <span key={a.key}>{a.short} {Math.round(a.v)}</span>)}</span>;
}

function YouthTable({ state, rows, refLvl, focus, onOpen }) {
  const [sorted, th] = useSort(rows, sortValue(state));
  return (
    <div className="sq-table-wrap">
      <table className="sq-table ac-table">
        <thead>
          <tr>
            <th className="c-name">{t('Joueur')}</th>
            <th className="c-pos">{t('Poste')}</th>
            {th('age', t('Âge'), 'c-age')}
            {th('lvl', t('Niveau'), 'c-lvl')}
            {th('pot', t('Potentiel'), 'c-pot', t('Potentiel estimé'))}
            {th('prog', t('Progrès'), 'c-prog', t('Progrès cette saison'))}
            <th className="c-best">{t('Points forts')}</th>
            <th className="c-plan">{t('Plan')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const r = playerRating(p);
            const leaving = isLeaving(p);
            const ready = fitGain(state, p) >= 0.3;
            const g = p.gain || {};
            return (
              <tr key={p.id} data-id={p.id} className={focus.includes(p.id) ? 'ac-focus' : ''} onClick={() => onOpen(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}>
                <td className="c-name">
                  <span className="sq-who">
                    <Portrait p={p} size={34} />
                    <span className="sq-who-text">
                      <span className="sq-name">{p.name}</span>
                      {(ready || leaving) && (
                        <span className="ac-flags">
                          {ready && <em className="ac-tag good">{t('Niveau titulaire')}</em>}
                          {leaving && <em className="ac-tag warn">{t('Dernière saison')}</em>}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="c-pos"><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>
                <td className={`c-age ${leaving ? 'warn' : ''}`}>{p.age}</td>
                <td className={`c-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</td>
                <td className={`c-pot ${heat(potMid(state, p), refLvl)}`}>{potText(potentialRange(p, state))}</td>
                <td className={`c-prog ${(g.season || 0) >= 0.05 ? 'up' : ''}`} title={gainTip(g)}>{plus(g.season || 0)}</td>
                <td className="c-best"><Strengths p={p} /></td>
                <td className="c-plan"><span className="ac-plan">{PLANS[planOf(p)].label}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function YouthRow({ p, state, refLvl, focus, onOpen }) {
  const r = playerRating(p);
  const g = p.gain || {};
  return (
    <li>
      <button className={`sq-row ${focus ? 'ac-focus' : ''}`} data-id={p.id} onClick={onOpen}>
        <span className="sq-face"><Portrait p={p} size={42} /><span className={`pos-pill ${p.pos}`}>{p.pos}</span></span>
        <span className="sq-row-main">
          <span className="sq-row-name">{p.name}</span>
          <span className="sq-row-meta">{tr('<0/> ans · <1/><2/>', [p.age, PLANS[planOf(p)].label, <span className={heat(potMid(state, p), refLvl)}>{tr('pot. <0/>', [potText(potentialRange(p, state))])}</span>])}</span>
        </span>
        <span className="sq-row-side">
          <b className={heat(r, refLvl)}>{fmtRating(r)}</b>
          {isLeaving(p) ? <span className="ac-warn">{t('dernière saison')}</span>
            : (g.season || 0) >= 0.05 ? <span className="ac-gain">{tr('<0/> cette saison', [plus(g.season)])}</span> : <span>{t('à l’entraînement')}</span>}
        </span>
      </button>
    </li>
  );
}

// --- Détection : les jeunes repérés de la journée -----------------------------------------------------------------

function ScoutTab({ state, scouted, full, refLvl, onOpen, onSign, onBuilding, run, ask, notify }) {
  const lvl = state.buildings.academy || 0;
  const { since } = scoutingWhen(state); // en Élite (quatorze journées), une liste toutes les deux journées
  const when = nextScouting(state);
  const back = state.scouting?.mission; // liste ramenée par une mission
  return (
    <>
      <p className="sq-hint ac-intro">
        {state.scouting?.away ? t('Recruteurs en mission : la liste se renouvelle à leur retour')
          : t('{v} · d’autres jeunes {when} · recrutement gratuit', { v: back ? t('Retour de mission : {tn} parmi {missionCount}', { tn: tn(back.back, 'le plus prometteur', 'les {back} plus prometteurs', { back: back.back }, back.back > 1), missionCount: missionCount(back, back.seen) })
            : since > 0 ? t('Repérés après la journée {since}', { since }) : t('Repérés pour le début de saison'), when })}
      </p>
      {full && (
        <div className="ac-alert" role="note">
          <IconAcademy aria-hidden="true" />
          <p>{tr('Ton équipe de jeunes est complète (<0/> / <1/>) : fais monter ou libère un jeune pour en recruter un autre.', [YOUTH_PLACES, YOUTH_PLACES])}</p>
        </div>
      )}
      {scouted.length === 0 ? (!state.scouting?.away && (
        <p className="ac-none">
          {lvl === 0 ? t('Construis l’académie pour que tes éducateurs repèrent des jeunes.')
            : t('Tu as recruté tous les jeunes repérés. Tes éducateurs en proposeront {v} autres {when}.', { v: SCOUTED[lvl], when })}
        </p>
      )) : (
        <>
          <div className="sq-tables">
            <ScoutTable state={state} rows={scouted} refLvl={refLvl} full={full} onOpen={onOpen} onSign={onSign} />
          </div>
          <ul className="sq-list ac-list">
            {scouted.map((p) => <ScoutRow key={p.id} p={p} state={state} refLvl={refLvl} onOpen={() => onOpen(p)} />)}
          </ul>
        </>
      )}
      {lvl > 0 && <MissionCard state={state} run={run} ask={ask} notify={notify} />}
      {lvl > 0 && <LevelCard state={state} onBuilding={onBuilding} />}
    </>
  );
}

function ScoutTable({ state, rows, refLvl, full, onOpen, onSign }) {
  const [sorted, th] = useSort(rows, sortValue(state));
  return (
    <div className="sq-table-wrap">
      <table className="sq-table ac-table">
        <thead>
          <tr>
            <th className="c-name">{t('Joueur')}</th>
            <th className="c-pos">{t('Poste')}</th>
            {th('age', t('Âge'), 'c-age')}
            {th('lvl', t('Niveau'), 'c-lvl')}
            {th('pot', t('Potentiel'), 'c-pot', t('Potentiel estimé'))}
            <th className="c-best">{t('Points forts')}</th>
            <th className="c-plan">{t('Plan conseillé')}</th>
            <th className="c-act" aria-label={t('Recruter')} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const r = playerRating(p);
            return (
              <tr key={p.id} data-id={p.id} onClick={() => onOpen(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(p); }}>
                <td className="c-name">
                  <span className="sq-who">
                    <Portrait p={p} size={34} />
                    <span className="sq-who-text"><span className="sq-name">{p.name}</span></span>
                  </span>
                </td>
                <td className="c-pos"><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>
                <td className="c-age">{p.age}</td>
                <td className={`c-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</td>
                <td className={`c-pot ${heat(potMid(state, p), refLvl)}`}>{potText(potentialRange(p, state))}</td>
                <td className="c-best"><Strengths p={p} /></td>
                <td className="c-plan"><span className="ac-plan">{PLANS[advisedPlan(p)].label}</span></td>
                <td className="c-act">
                  <button className="btn btn-sm" disabled={full} title={full ? t('Équipe de jeunes complète') : t('Recruter {name}, gratuitement', { name: p.name })} onClick={(e) => { e.stopPropagation(); onSign(p); }}>{t('Signer')}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoutRow({ p, state, refLvl, onOpen }) {
  const r = playerRating(p);
  return (
    <li>
      <button className="sq-row" data-id={p.id} onClick={onOpen}>
        <span className="sq-face"><Portrait p={p} size={42} /><span className={`pos-pill ${p.pos}`}>{p.pos}</span></span>
        <span className="sq-row-main">
          <span className="sq-row-name">{p.name}</span>
          <span className="sq-row-meta">{tr('<0/> ans<1/>', [p.age, <span className={heat(potMid(state, p), refLvl)}>{tr('pot. <0/>', [potText(potentialRange(p, state))])}</span>])}</span>
        </span>
        <span className="sq-row-side">
          <b className={heat(r, refLvl)}>{fmtRating(r)}</b>
          <span>{t('à recruter')}</span>
        </span>
      </button>
    </li>
  );
}

// Retour d'une mission : « après la journée 9 », « au début de la saison prochaine »…
function whenText(state, ret) {
  if (ret.season > state.seasonNumber) return ret.round ? t('après la journée {round} de la saison prochaine', { round: ret.round }) : t('au début de la saison prochaine');
  return t('après la journée {round}', { round: ret.round });
}
// chance d'au moins un grand potentiel, jamais 0 % ni 100 % quand ce n'est pas certain
const pctOf = (p) => (p <= 0 ? '0 %' : p >= 1 ? '100 %' : `${Math.min(99, Math.max(1, Math.round(p * 100)))} %`);

// Mission des recruteurs (0.6.1, repensée en 0.8.12, academy.js) : une cible (poste ou profil), une durée de deux à
// quatre repérages, puis ce qu'ils verront et ramèneront, avec les chances exactes d'y trouver un grand potentiel. En
// cours : le repérage où ils en sont, leurs nouvelles (la dernière en tête), leur retour et « Rappeler ».
function MissionCard({ state, run, ask, notify }) {
  const [kind, setKind] = useState('pos');
  const [picks, setPicks] = useState({ pos: 'A', plan: 'tech' });
  const [steps, setSteps] = useState(3);
  const elite = leagueLength(state) > 7; // un repérage toutes les deux journées
  const span = (n) => (elite ? t('{v} journées', { v: 2 * n }) : t('{n} journées', { n }));
  const m = state.mission;
  if (m) {
    const back = Math.min(m.steps * m.per * MISSION_BOOST, m.per + m.steps);
    const done = m.steps - m.left;
    const news = [...(m.news || [])].reverse();
    const recall = () => ask({
      tone: 'danger',
      title: t('Rappeler les recruteurs ?'),
      text: t('La mission s’arrête sans ramener de jeunes ; les repérages reprennent aussitôt.'),
      confirmLabel: t('Rappeler'),
      cancelLabel: t('Les laisser chercher'),
      onConfirm: () => run((s) => cancelMission(s)),
    });
    return (
      <section className="ac-level ac-mission on">
        <div className="ac-level-head">
          <span className="ac-level-ico"><IconTarget /></span>
          <div className="panel-title">
            <Eyebrow>{tr('Mission en cours · <0/>', [missionTarget(m)])}</Eyebrow>
            <strong>{tr('Retour <0/>, avec <1/> des <2/> jeunes vus.', [whenText(state, missionReturn(state, m.left)), tn(back, 'le plus prometteur', 'les {back} plus prometteurs', { back }, back > 1), m.steps * m.per * MISSION_BOOST])}</strong>
          </div>
        </div>
        <div className="ac-mission-track" aria-label={t('Repérage {done} sur {steps}', { done, steps: m.steps })}>
          <span aria-hidden="true">{Array.from({ length: m.steps }, (_, k) => <i key={k} className={k < done ? 'on' : ''} />)}</span>
          <b><bdi>{done} / {m.steps}</bdi></b>
        </div>
        {news.length > 0 ? (
          <ul className="ac-mission-news" aria-label={t('Nouvelles des recruteurs')}>
            {news.map((n) => (
              <li key={n.step} className={n.best === 'rare' ? 'rare' : ''}><b>{tr('Repérage <0/>', [n.step])}</b>{' '}{n.text}</li>
            ))}
          </ul>
        ) : <p className="ac-plan-text">{t('Premières nouvelles après le prochain repérage.')}</p>}
        <div className="ac-level-next">
          <span>{t('Pendant la mission, la liste des jeunes repérés ne se renouvelle pas.')}</span>
          <button type="button" className="btn ghost btn-sm" onClick={recall}>{t('Rappeler les recruteurs')}</button>
        </div>
      </section>
    );
  }
  const target = { kind, value: picks[kind], steps };
  const plan = missionPlan(state, steps);
  const options = kind === 'pos' ? ['G', 'D', 'M', 'A'].map((k) => [k, POS_LABELS[k]])
    : Object.entries(PROFILES).map(([k, v]) => [k, v[0].toUpperCase() + v.slice(1)]);
  const launch = () => {
    if (!run((s) => startMission(s, target), t('Mission impossible.'))) return;
    notify({ kind: 'academy', eyebrow: t('Académie'), title: t('Les recruteurs partent en mission'), text: t('Ils cherchent {missionTarget} : des nouvelles à chaque repérage, retour {whenText}.', { missionTarget: missionTarget(target), whenText: whenText(state, plan.ret) }) });
  };
  return (
    <section className="ac-level ac-mission">
      <div className="ac-level-head">
        <span className="ac-level-ico"><IconTarget /></span>
        <div className="panel-title">
          <Eyebrow>{t('Mission des recruteurs')}</Eyebrow>
          <strong>{t('Envoie-les en mission sur un poste ou un profil. Ils donnent des nouvelles à chaque repérage.')}</strong>
        </div>
      </div>
      <div className="chips ac-mission-row" role="group" aria-label={t('Cible de la mission')}>
        {Object.entries(MISSION_KINDS).map(([k, label]) => <button key={k} type="button" className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{label}</button>)}
      </div>
      <div className="chips ac-mission-row" role="group" aria-label={MISSION_KINDS[kind]}>
        {options.map(([v, label]) => <button key={v} type="button" className={picks[kind] === v ? 'active' : ''} onClick={() => setPicks({ ...picks, [kind]: v })}>{label}</button>)}
      </div>
      <div className="chips ac-mission-row" role="group" aria-label={t('Durée de la mission')}>
        {MISSION_STEPS.map((n) => <button key={n} type="button" className={steps === n ? 'active' : ''} onClick={() => setSteps(n)}>{span(n)}</button>)}
      </div>
      <p className="ac-plan-text">{tr('Ils verront <0/> et ramèneront <1/> <2/>.', [<b>{missionCount(target, plan.seen)}</b>, <b>{tn(plan.back, 'le plus prometteur', 'les {back} plus prometteurs', { back: plan.back }, plan.back > 1)}</b>, whenText(state, plan.ret)])}</p>
      <div className="ac-mission-odds" aria-label={t('Chances exactes')}>
        <span>{tr('Un potentiel de 16 ou plus parmi eux <0/>', [<b>{pctOf(plan.p16)}</b>])}</span>
        <span>{tr('De 18 ou plus <0/>', [<b>{pctOf(plan.p18)}</b>])}</span>
      </div>
      <div className="ac-level-next">
        <span>{t('Pendant la mission, la liste des jeunes repérés ne se renouvelle pas ; en échange, tes recruteurs en observent deux fois plus.')}</span>
        <button type="button" className="btn btn-sm" onClick={launch}>{t('Lancer la mission')}</button>
      </div>
    </section>
  );
}

// Ce que l'académie apporte à son niveau, et au niveau suivant (l'amélioration se fait sur la fiche du bâtiment).
function LevelCard({ state, onBuilding }) {
  const lvl = state.buildings.academy || 0;
  const max = BUILDINGS.academy.max;
  const line = (l) => {
    const row = academyTalent(l);
    return t('{plural} {v} · potentiel {v2} à {v3}, rarement {top} · fourchette de {dec} points', { plural: plural(SCOUTED[l], 'jeune repéré', 'jeunes repérés'), v: leagueLength(state) > 7 ? t('toutes les deux journées') : t('après chaque journée'), v2: row.pot[0], v3: row.pot[1], top: row.top, dec: dec(2 * scoutingError(l)) });
  };
  return (
    <section className="ac-level">
      <div className="ac-level-head">
        <span className="ac-level-ico"><IconAcademy /></span>
        <div className="panel-title">
          <Eyebrow>{tr('Académie · niveau <0/> / <1/>', [lvl, max])}</Eyebrow>
          <strong>{line(lvl)}</strong>
        </div>
      </div>
      {lvl < max ? (
        <div className="ac-level-next">
          <span><b>{tr('Niveau <0/>', [lvl + 1])}</b> : {line(lvl + 1)}</span>
          <button className="btn ghost btn-sm" onClick={onBuilding}>{tr('<0/> Améliorer · <1/>', [<IconArrowUp />, fmtMoney(upgradeCost('academy', lvl + 1))])}</button>
        </div>
      ) : <span className="ac-level-max">{t('Niveau maximum atteint')}</span>}
    </section>
  );
}

// --- Fiche d'un jeune (ou d'un jeune repéré) ---------------------------------------------------------------------

function AcademySheet({ p, scout, state, refLvl, full, place, onClose, onPrev, onNext, onSign, onPromote, onRelease, onPlan }) {
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const advised = advisedPlan(p);
  const plan = scout ? advised : planOf(p);
  const worked = new Set(planAttrs(p, plan));
  const fams = p.pos === 'G' ? ['gk'] : ['tech', 'phys', 'tac'];
  const all = attrsOf(p);
  const leaving = !scout && isLeaving(p);
  const gain = fitGain(state, p);
  const squadFull = state.players.length >= SQUAD_MAX;
  const g = p.gain || {};
  const workedNames = listFr(planAttrs(p, plan).map((k) => attrName(p, k)));
  const slower = Math.round((1 - planPace(p, plan) / planPace(p, advised)) * 100); // niveau : moins vite qu'avec le plan conseillé
  const [nameFirst, ...nameRest] = p.name.split(' ');

  // changement de jeune : la fiche remonte en haut et le nouveau arrive du côté du geste (comme la fiche joueur)
  const ref = useRef(null);
  const dir = useRef(0);
  const shown = useRef(p.id);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown.current === p.id) return;
    shown.current = p.id;
    el.scrollTop = 0;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.animate([{ opacity: 0, transform: `translateX(${dir.current * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  }, [p.id]);
  const goPrev = () => { dir.current = -1; onPrev(); };
  const goNext = () => { dir.current = 1; onNext(); };
  useSwipe(ref, { onDown: onClose, onLeft: goNext, onRight: goPrev, downMedia: PHONE });

  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ac-sheet" onClick={(e) => e.stopPropagation()} aria-label={t('Fiche {deName}', { deName: deName(p.name) })}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={goPrev} aria-label={scout ? t('Jeune repéré précédent') : t('Jeune précédent')}><IconChevronLeft /></button>
            <span>{place}</span>
            <button className="hud-icon" onClick={goNext} aria-label={scout ? t('Jeune repéré suivant') : t('Jeune suivant')}><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label={t('Fermer la fiche')}><IconClose /></button>
        </header>

        {/* même en-tête que la fiche joueur (squad.jsx PlayerSheet) : niveau en grand, poste, nom, portrait, étiquettes */}
        <section className={`sh-hero ${tierOf(r, refLvl)}`}>
          <div className="sh-id">
            <div className="sh-rate"><b>{fmtRating(r)}</b></div>
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{tr('<0/> ans · <1/>', [p.age, footLabel(p.foot)])}</span>
            </div>
            <h3 className="sh-name">{nameRest.length > 0 && <small>{nameFirst}</small>}<b>{nameRest.length ? nameRest.join(' ') : nameFirst}</b></h3>
          </div>
          <Portrait p={p} size={136} className="sh-face" />
          <div className="sh-tags">
            <span className="sh-tag on">{scout ? (p.scoutNote || t('Repéré par tes éducateurs')) : t('Académie depuis la saison {v}', { v: p.youthSince ?? state.seasonNumber })}</span>
            {leaving && <span className="sh-tag warn">{tr('<0/> ans à l’intersaison', [YOUTH_LEAVE_AGE])}</span>}
            {gain >= 0.3 && <span className="sh-tag sale">{t('Niveau titulaire')}</span>}
            {p.alt && <span className="sh-tag">{tr('Dépanne : <0/> <1/>', [POS_LABELS[p.alt].toLowerCase(), fmtRating(ratingAt(p, p.alt))])}</span>}
          </div>
        </section>

        <section className="sh-sec sh-levelsec">
          <div className="sh-row">
            <span className="sh-cap">{tr('Niveau <0/><1/>', [<b className={heat(r, refLvl)}>{fmtRating(r)}</b>, <small> / 20</small>])}</span>
            <span className="sh-pot">{pot ? <>{t('Potentiel estimé ')}<b>{potText(pot)}</b></> : t('Plafond atteint')}</span>
          </div>
          <div className="sh-scale" aria-hidden="true">
            <i className="now" style={{ width: `${(r / 20) * 100}%` }} />
            {pot && <i className="pot" style={{ insetInlineStart: `${(pot[0] / 20) * 100}%`, width: `${((pot[1] - pot[0]) / 20) * 100}%` }} />}
          </div>
          <div className="sh-ticks" aria-hidden="true"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span></div>
        </section>

        {!scout && (
          <section className="sh-sec">
            <span className="sh-cap">{t('Progrès')}</span>
            <div className="sh-stats ac-prog">
              <div><b className={(g.round || 0) >= 0.05 ? 'good' : ''}>{plus(g.round || 0)}</b><span>{t('dernière journée')}</span></div>
              <div><b className={(g.season || 0) >= 0.05 ? 'good' : ''}>{plus(g.season || 0)}</b><span>{t('cette saison')}</span></div>
              <div><b className={(g.summer || 0) >= 0.05 ? 'good' : ''}>{g.summer != null ? plus(g.summer) : '–'}</b><span>{t('dernier été')}</span></div>
            </div>
            <p className="sh-evo">{t('Prochain bond à l’intersaison, d’autant plus grand qu’il est loin de son potentiel.')}</p>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">{scout ? t('Plan d’entraînement conseillé') : t('Plan d’entraînement')}</span>
          {!scout && (
            <Tabs
              className="segmented ac-plans"
              role="radiogroup"
              label={t('Plan d’entraînement')}
              items={Object.keys(PLANS).map((k) => [k, PLANS[k].label, k === advised ? <i className="ac-advised" title={t('Conseillé {forPos}', { forPos: forPos(p.pos) })} aria-label={t('conseillé')} /> : null])}
              value={plan}
              onChange={onPlan}
            />
          )}
          <p className="ac-plan-text">
            {scout
              ? <><b>{PLANS[plan].label}</b>{t(', choisi d’emblée s’il rejoint l’académie : ')}{workedNames}{t('. C’est avec ce plan que son niveau progresse le plus vite ; tu pourras le changer à tout moment.')}</>
              : plan === advised || slower <= 0
                ? <>{t('Qualités travaillées en priorité : ')}{workedNames}{t('. C’est le plan conseillé ')}{forPos(p.pos)}{t(' : son niveau y progresse le plus vite.')}</>
                : <>{t('Qualités travaillées en priorité : ')}{workedNames}{t('. Son niveau progresse ')}<b className="ac-slow">{tr('<0/> % moins vite', [slower])}</b>{t(' qu’avec le plan conseillé (')}{PLANS[advised].label.toLowerCase()}).</>}
          </p>
        </section>

        {p.traits?.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">{tn(p.traits.length, 'Signe distinctif', 'Signes distinctifs', {}, p.traits.length > 1)}</span>
            <ul className="sh-traits">
              {p.traits.map((t) => <li key={t}><i aria-hidden="true" /><b>{TRAITS[t].name}</b><span>{TRAITS[t].desc}</span></li>)}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">{t('Attributs')}</span>
            <span className="sh-legend">{tr('<0/> travaillés par <1/> plan · <2>or</2> : fort pour ta division', [<i className="key" />, scout ? t('ce') : t('son', undefined, 'plan'), (c) => <em>{c}</em>])}</span>
          </div>
          <div className={`sh-fams n${fams.length}`}>
            {fams.map((fam) => (
              <div className="sh-fam" key={fam}>
                <span className="sh-famname">{fams.length > 1 ? FAMILIES[fam].split(' ')[0] : FAMILIES[fam]}</span>
                {all.filter((a) => a.fam === fam).map((a) => (
                  <div className={`sh-attr ${worked.has(a.key) ? 'key' : ''}`} key={a.key}>
                    <span>{a.name}</span>
                    <b className={heat(a.v, refLvl)}>{Math.round(a.v)}</b>
                    <span className="sh-track"><i className={heat(a.v, refLvl)} style={{ width: `${(a.v / 20) * 100}%` }} /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <footer className={`sh-foot ${scout ? 'market' : 'own'}`}>
          {scout ? (
            <span>{tr('Recrutement <0>gratuit</0> · pas de salaire tant qu’il est à l’académie', [(c) => <b>{c}</b>])}</span>
          ) : squadFull ? (
            <span>{tr('Effectif complet (<0/> joueurs) : vends un joueur pour faire monter un jeune.', [SQUAD_MAX])}</span>
          ) : gain >= 0.3 ? (
            <span>{tr('Il renforcerait ton onze : <0/> sur le titulaire le plus faible à son poste · salaire <1/>', [<b className="gold">+{fmtRating(gain)}</b>, <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b>])}</span>
          ) : (
            <span>{tr('En équipe première : salaire <0/> par saison', [<b>{fmtMoney(wageOf(p, state.divisionIndex))}</b>])}</span>
          )}
          <div className="sh-actions">
            {scout ? (
              <button className="btn" disabled={full} onClick={onSign}>{full ? t('Équipe de jeunes complète') : t('Signer · gratuit')}</button>
            ) : (
              <>
                <button className="btn ghost" onClick={onRelease}>{t('Libérer')}</button>
                <button className="btn" disabled={squadFull} onClick={onPromote}>{tr('<0/> Faire monter', [<IconArrowUp />])}</button>
              </>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
