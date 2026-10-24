import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BUILDINGS, DIVISIONS, POS_LABELS, SQUAD_MAX, upgradeCost } from '../game/constants';
import { ATTRS, FAMILIES, GK_ATTRS, TRAITS, playerRating, potentialRange, ratingAt, wageOf } from '../game/players';
import { PLANS, SCOUTED, YOUTH_LEAVE_AGE, YOUTH_PLACES, advisedPlan, planAttrs, planPace } from '../game/academy';
import { academyTalent, scoutingError } from '../game/economy';
import { promoteYouth, releaseYouth, setYouthPlan, signYouth } from '../game/engine';
import { fitGain } from '../game/mercato';
import { deName } from '../game/names';
import { fmtMoney, fmtRating } from './format';
import { IconAcademy, IconArrowUp, IconChevron, IconChevronLeft, IconClock, IconClose } from './icons';
import { Eyebrow } from './kit';
import { Panel } from './panels';
import { Tabs } from './glass';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';
import { Portrait } from './portrait';
import { heat } from './mercato';

// Académie : l'équipe de jeunes du club (academy.js), ouverte d'un clic sur le bâtiment dans la vue 3D. Deux onglets,
// dans le style de l'Effectif (tableau détaillé sur PC, liste compacte sur téléphone) : « Mes jeunes » (six places,
// niveau, potentiel, progrès, plan d'entraînement) et « Détection » (les jeunes repérés de la journée, à recruter
// gratuitement). La fiche d'un jeune choisit son plan, le fait monter en équipe première ou le libère.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };
const plus = (v) => (v >= 0.05 ? `+${fmtRating(v)}` : '–');
const potText = (r) => (r ? `${fmtRating(r[0])} – ${fmtRating(r[1])}` : 'atteint');
const potMid = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 : playerRating(p); };
const dec = (v) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');
const isLeaving = (p) => p.age + 1 >= YOUTH_LEAVE_AGE; // 19 ans à l'intersaison : dernière saison à l'académie
const planOf = (p) => (PLANS[p.plan] ? p.plan : advisedPlan(p));
const forPos = (pos) => `pour un ${POS_LABELS[pos].toLowerCase()}`;
const attrName = (p, key) => (p.pos === 'G' ? GK_ATTRS : ATTRS).find((a) => a.key === key)?.name.toLowerCase() || key;
const listFr = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}` : a[0] || '');
const gainTip = (g = {}) => `Dernière journée ${plus(g.round || 0)} · cette saison ${plus(g.season || 0)}${g.summer != null ? ` · dernier été ${plus(g.summer)}` : ''}`;

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
    if (!run((s) => signYouth(s, p.id), full ? 'Académie complète : fais monter ou libère un jeune.' : 'Recrutement impossible.')) return;
    setSheet(null);
    notify({
      kind: 'academy', eyebrow: 'Académie', title: `${p.name} rejoint l’académie`,
      text: `Plan ${PLANS[plan].label.toLowerCase()}, conseillé ${forPos(p.pos)}.`,
      action: { panel: 'academy', tab: 'youth', ids: [p.id] },
    });
  };
  const promote = (p) => {
    const n = state.players.length;
    if (n >= SQUAD_MAX) return;
    ask({
      title: `Faire monter ${p.name} en équipe première ?`,
      text: 'Il rejoint l’effectif professionnel, avec un salaire, et ne pourra plus revenir à l’académie.',
      rows: [
        ['Niveau', fmtRating(playerRating(p))],
        ['Potentiel estimé', potText(potentialRange(p, state))],
        ['Salaire', `${fmtMoney(wageOf(p, state.divisionIndex))} / saison`, 'down'],
        ['Effectif', `${n} → ${n + 1} joueurs`],
      ],
      confirmLabel: 'Faire monter',
      cancelLabel: 'Pas encore',
      onConfirm: () => {
        if (!run((s) => promoteYouth(s, p.id), 'Effectif complet.')) return;
        setSheet(null);
        notify({
          kind: 'academy', eyebrow: 'Académie', title: `${p.name} monte en équipe première`,
          text: 'Formé au club, il rejoint ton effectif.', action: { panel: 'squad', tab: 'players', sheet: p.id },
        });
      },
    });
  };
  const release = (p) => ask({
    tone: 'danger',
    title: `Libérer ${p.name} ?`,
    text: 'Il quitte le club définitivement, et sa place à l’académie se libère.',
    confirmLabel: 'Libérer',
    cancelLabel: 'Le garder',
    onConfirm: () => {
      if (!run((s) => releaseYouth(s, p.id))) return;
      setSheet(null);
      notify({ kind: 'info', title: `${p.name} a quitté l’académie` });
    },
  });

  const open = (p, from) => setSheet({ id: p.id, list: from });
  return (
    <Panel
      id="academy"
      size="lg"
      title="Académie"
      eyebrow={<>Niveau {lvl} / {BUILDINGS.academy.max} · {youth.length} / {YOUTH_PLACES} jeunes<span className="hide-sm"> · {DIVISIONS[state.divisionIndex].name}</span></>}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <>
          <Places state={state} youth={youth} upgradable={upgradable} onBuilding={onBuilding} />
          <Tabs
            items={[
              ['youth', 'Mes jeunes', youth.length ? <em className="mc-count-badge ac-tab-n">{youth.length}</em> : null],
              ['scout', 'Détection', scouted.length ? <em className={`mc-count-badge ac-tab-n ${full ? '' : 'hot'}`}>{scouted.length}</em> : null],
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
        <ScoutTab state={state} scouted={scouted} full={full} refLvl={ref} onOpen={(p) => open(p, 'scout')} onSign={sign} onBuilding={onBuilding} />
      )}
    </Panel>
  );
}

// --- Places : six cases, une par jeune (orange : dernière saison avant ses 19 ans) --------------------------------

function Places({ state, youth, upgradable, onBuilding }) {
  const order = [...youth].sort((a, b) => isLeaving(a) - isLeaving(b));
  return (
    <div className="sq-budget ac-places">
      <div className="sq-budget-top"><span>Places</span><b>{youth.length} / {YOUTH_PLACES}</b></div>
      <span className="ac-slots" aria-hidden="true">
        {Array.from({ length: YOUTH_PLACES }, (_, i) => <i key={i} className={!order[i] ? '' : isLeaving(order[i]) ? 'warn' : 'on'} />)}
      </span>
      <span className="sq-budget-sub">
        Gratuites, sans salaire · <button className="linkbtn fin-link" onClick={onBuilding}>bâtiment niveau {state.buildings.academy || 0}</button>
        {upgradable && <em className="ac-up"> · amélioration possible</em>}
      </span>
    </div>
  );
}

// --- Mes jeunes -----------------------------------------------------------------------------------------------

function YouthTab({ state, youth, scouted, refLvl, focus, onOpen, onScout }) {
  const leaving = youth.filter(isLeaving);
  const rules = (
    <p className="sq-hint ac-rules">
      Après chaque journée de championnat, tes jeunes progressent, surtout dans les qualités de leur plan, puis ils font un
      bond à l’intersaison. Ils ne touchent pas de salaire. À {YOUTH_LEAVE_AGE} ans, un jeune qui n’est pas monté en équipe
      première quitte le club.
    </p>
  );
  if (!youth.length) {
    return (
      <>
        <div className="ac-empty">
          <span className="ac-empty-ico"><IconAcademy /></span>
          <h3>Ton équipe de jeunes est vide</h3>
          <p>
            {YOUTH_PLACES} places, sans frais :{' '}
            {scouted.length
              ? `recrute parmi les ${plural(scouted.length, 'jeune repéré', 'jeunes repérés')} par tes éducateurs.`
              : 'de nouveaux jeunes seront repérés après la prochaine journée de championnat.'}
          </p>
          {scouted.length > 0 && <button className="btn" onClick={onScout}>Voir la détection</button>}
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
          <p>
            <b>{names}</b> {leaving.length > 1 ? 'auront' : 'aura'} {YOUTH_LEAVE_AGE} ans à l’intersaison : fais-{leaving.length > 1 ? 'les' : 'le'} monter
            en équipe première avant la fin de la saison, sinon {leaving.length > 1 ? 'ils quitteront' : 'il quittera'} le club.
          </p>
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
      title={`${name} · trier`}
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
            <th className="c-name">Joueur</th>
            <th className="c-pos">Poste</th>
            {th('age', 'Âge', 'c-age')}
            {th('lvl', 'Niveau', 'c-lvl')}
            {th('pot', 'Potentiel', 'c-pot', 'Potentiel estimé')}
            {th('prog', 'Progrès', 'c-prog', 'Progrès cette saison')}
            <th className="c-best">Points forts</th>
            <th className="c-plan">Plan</th>
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
                          {ready && <em className="ac-tag good">Niveau titulaire</em>}
                          {leaving && <em className="ac-tag warn">Dernière saison</em>}
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
          <span className="sq-row-meta">
            {p.age} ans · {PLANS[planOf(p)].label}<span className={heat(potMid(state, p), refLvl)}>pot. {potText(potentialRange(p, state))}</span>
          </span>
        </span>
        <span className="sq-row-side">
          <b className={heat(r, refLvl)}>{fmtRating(r)}</b>
          {isLeaving(p) ? <span className="ac-warn">dernière saison</span>
            : (g.season || 0) >= 0.05 ? <span className="ac-gain">{plus(g.season)} cette saison</span> : <span>à l’entraînement</span>}
        </span>
      </button>
    </li>
  );
}

// --- Détection : les jeunes repérés de la journée -----------------------------------------------------------------

function ScoutTab({ state, scouted, full, refLvl, onOpen, onSign, onBuilding }) {
  const lvl = state.buildings.academy || 0;
  const when = state.round >= 7 ? 'au début de la saison prochaine' : 'après la prochaine journée de championnat';
  return (
    <>
      <p className="sq-hint ac-intro">
        {state.round > 0 ? `Repérés après la journée ${state.round}` : 'Repérés pour le début de saison'} · d’autres jeunes {when} · recrutement gratuit
      </p>
      {full && (
        <div className="ac-alert" role="note">
          <IconAcademy aria-hidden="true" />
          <p>Ton équipe de jeunes est complète ({YOUTH_PLACES} / {YOUTH_PLACES}) : fais monter ou libère un jeune pour en recruter un autre.</p>
        </div>
      )}
      {scouted.length === 0 ? (
        <p className="ac-none">
          {lvl > 0
            ? `Tu as recruté tous les jeunes repérés. Tes éducateurs en proposeront ${SCOUTED[lvl]} autres ${when}.`
            : 'Construis l’académie pour que tes éducateurs repèrent des jeunes.'}
        </p>
      ) : (
        <>
          <div className="sq-tables">
            <ScoutTable state={state} rows={scouted} refLvl={refLvl} full={full} onOpen={onOpen} onSign={onSign} />
          </div>
          <ul className="sq-list ac-list">
            {scouted.map((p) => <ScoutRow key={p.id} p={p} state={state} refLvl={refLvl} onOpen={() => onOpen(p)} />)}
          </ul>
        </>
      )}
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
            <th className="c-name">Joueur</th>
            <th className="c-pos">Poste</th>
            {th('age', 'Âge', 'c-age')}
            {th('lvl', 'Niveau', 'c-lvl')}
            {th('pot', 'Potentiel', 'c-pot', 'Potentiel estimé')}
            <th className="c-best">Points forts</th>
            <th className="c-plan">Plan conseillé</th>
            <th className="c-act" aria-label="Recruter" />
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
                  <button className="btn btn-sm" disabled={full} title={full ? 'Équipe de jeunes complète' : `Recruter ${p.name}, gratuitement`} onClick={(e) => { e.stopPropagation(); onSign(p); }}>
                    Signer
                  </button>
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
          <span className="sq-row-meta">{p.age} ans<span className={heat(potMid(state, p), refLvl)}>pot. {potText(potentialRange(p, state))}</span></span>
        </span>
        <span className="sq-row-side">
          <b className={heat(r, refLvl)}>{fmtRating(r)}</b>
          <span>à recruter</span>
        </span>
      </button>
    </li>
  );
}

// Ce que l'académie apporte à son niveau, et au niveau suivant (l'amélioration se fait sur la fiche du bâtiment).
function LevelCard({ state, onBuilding }) {
  const lvl = state.buildings.academy || 0;
  const max = BUILDINGS.academy.max;
  const line = (l) => {
    const t = academyTalent(l);
    return `${plural(SCOUTED[l], 'jeune repéré', 'jeunes repérés')} après chaque journée · potentiel ${t.pot[0]} à ${t.pot[1]} · fourchette de ${dec(2 * scoutingError(l))} points`;
  };
  return (
    <section className="ac-level">
      <div className="ac-level-head">
        <span className="ac-level-ico"><IconAcademy /></span>
        <div className="panel-title">
          <Eyebrow>Académie · niveau {lvl} / {max}</Eyebrow>
          <strong>{line(lvl)}</strong>
        </div>
      </div>
      {lvl < max ? (
        <div className="ac-level-next">
          <span><b>Niveau {lvl + 1}</b> : {line(lvl + 1)}</span>
          <button className="btn ghost btn-sm" onClick={onBuilding}><IconArrowUp /> Améliorer · {fmtMoney(upgradeCost('academy', lvl + 1))}</button>
        </div>
      ) : <span className="ac-level-max">Niveau maximum atteint</span>}
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
      <article ref={ref} className="sq-sheet glass ac-sheet" onClick={(e) => e.stopPropagation()} aria-label={`Fiche ${deName(p.name)}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={goPrev} aria-label={scout ? 'Jeune repéré précédent' : 'Jeune précédent'}><IconChevronLeft /></button>
            <span>{place}</span>
            <button className="hud-icon" onClick={goNext} aria-label={scout ? 'Jeune repéré suivant' : 'Jeune suivant'}><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la fiche"><IconClose /></button>
        </header>

        <section className="sh-hero">
          <Portrait p={p} size={76} className="sh-face" />
          <div className="sh-id">
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{p.age} ans · {p.foot === 'les deux' ? 'des deux pieds' : `pied ${p.foot}`}</span>
            </div>
            <h3>{p.name}</h3>
            <div className="sh-tags">
              <span className="sh-tag on">{scout ? 'Repéré par tes éducateurs' : `Académie depuis la saison ${p.youthSince ?? state.seasonNumber}`}</span>
              {leaving && <span className="sh-tag warn">{YOUTH_LEAVE_AGE} ans à l’intersaison</span>}
              {gain >= 0.3 && <span className="sh-tag sale">Niveau titulaire</span>}
              {p.alt && <span className="sh-tag">Dépanne : {POS_LABELS[p.alt].toLowerCase()} {fmtRating(ratingAt(p, p.alt))}</span>}
            </div>
          </div>
          <div className={`sh-level ${heat(r, refLvl)}`}>
            <b>{fmtRating(r)}</b>
            <span>niveau / 20</span>
          </div>
        </section>

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Niveau et potentiel</span>
            <span className="sh-pot">{pot ? <>potentiel estimé <b>{potText(pot)}</b></> : 'plafond atteint'}</span>
          </div>
          <div className="sh-scale" aria-hidden="true">
            <i className="now" style={{ width: `${(r / 20) * 100}%` }} />
            {pot && <i className="pot" style={{ left: `${(pot[0] / 20) * 100}%`, width: `${((pot[1] - pot[0]) / 20) * 100}%` }} />}
          </div>
          <div className="sh-ticks" aria-hidden="true"><span>0</span><span>10</span><span>20</span></div>
        </section>

        {!scout && (
          <section className="sh-sec">
            <span className="sh-cap">Progrès</span>
            <div className="sh-stats ac-prog">
              <div><b className={(g.round || 0) >= 0.05 ? 'good' : ''}>{plus(g.round || 0)}</b><span>dernière journée</span></div>
              <div><b className={(g.season || 0) >= 0.05 ? 'good' : ''}>{plus(g.season || 0)}</b><span>cette saison</span></div>
              <div><b className={(g.summer || 0) >= 0.05 ? 'good' : ''}>{g.summer != null ? plus(g.summer) : '–'}</b><span>dernier été</span></div>
            </div>
            <p className="sh-evo">
              Prochain bond à l’intersaison, d’autant plus grand qu’il est loin de son potentiel.
            </p>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">{scout ? 'Plan d’entraînement conseillé' : 'Plan d’entraînement'}</span>
          {!scout && (
            <Tabs
              className="segmented ac-plans"
              role="radiogroup"
              label="Plan d’entraînement"
              items={Object.keys(PLANS).map((k) => [k, PLANS[k].label, k === advised ? <i className="ac-advised" title={`Conseillé ${forPos(p.pos)}`} aria-label="conseillé" /> : null])}
              value={plan}
              onChange={onPlan}
            />
          )}
          <p className="ac-plan-text">
            {scout
              ? <><b>{PLANS[plan].label}</b>, choisi d’emblée s’il rejoint l’académie : {workedNames}. C’est avec ce plan que son niveau progresse le plus vite ; tu pourras le changer à tout moment.</>
              : plan === advised || slower <= 0
                ? <>Qualités travaillées en priorité : {workedNames}. C’est le plan conseillé {forPos(p.pos)} : son niveau y progresse le plus vite.</>
                : <>Qualités travaillées en priorité : {workedNames}. Son niveau progresse <b className="ac-slow">{slower} % moins vite</b> qu’avec le plan conseillé ({PLANS[advised].label.toLowerCase()}).</>}
          </p>
        </section>

        {p.traits?.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">{p.traits.length > 1 ? 'Signes distinctifs' : 'Signe distinctif'}</span>
            <ul className="sh-traits">
              {p.traits.map((t) => <li key={t}><b>{TRAITS[t].name}</b><span>{TRAITS[t].desc}</span></li>)}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Attributs</span>
            <span className="sh-legend"><i className="key" /> travaillés par {scout ? 'ce' : 'son'} plan · <em>or</em> : fort pour ta division</span>
          </div>
          {fams.map((fam) => (
            <div className="sh-fam" key={fam}>
              {fams.length > 1 && <span className="sh-famname">{FAMILIES[fam]}</span>}
              {all.filter((a) => a.fam === fam).map((a) => (
                <div className={`sh-attr ${worked.has(a.key) ? 'key' : ''}`} key={a.key}>
                  <span>{a.name}</span>
                  <span className="sh-track"><i className={heat(a.v, refLvl)} style={{ width: `${(a.v / 20) * 100}%` }} /></span>
                  <b className={heat(a.v, refLvl)}>{Math.round(a.v)}</b>
                </div>
              ))}
            </div>
          ))}
        </section>

        <footer className={`sh-foot ${scout ? 'market' : 'own'}`}>
          {scout ? (
            <span>Recrutement <b>gratuit</b> · pas de salaire tant qu’il est à l’académie</span>
          ) : squadFull ? (
            <span>Effectif complet ({SQUAD_MAX} joueurs) : vends un joueur pour faire monter un jeune.</span>
          ) : gain >= 0.3 ? (
            <span>Il renforcerait ton onze : <b className="gold">+{fmtRating(gain)}</b> sur le titulaire le plus faible à son poste · salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b></span>
          ) : (
            <span>En équipe première : salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b> par saison</span>
          )}
          <div className="sh-actions">
            {scout ? (
              <button className="btn" disabled={full} onClick={onSign}>{full ? 'Équipe de jeunes complète' : 'Signer · gratuit'}</button>
            ) : (
              <>
                <button className="btn ghost" onClick={onRelease}>Libérer</button>
                <button className="btn" disabled={squadFull} onClick={onPromote}><IconArrowUp /> Faire monter</button>
              </>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
