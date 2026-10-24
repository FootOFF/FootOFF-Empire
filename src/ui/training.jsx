import React, { useMemo, useState } from 'react';
import { BUILDINGS, DIVISIONS, POS_LABELS, PROGRAM_STEPS, TRAINING_COLLECTIVE, TRAINING_MULT, upgradeCost } from '../game/constants';
import { ATTRS, GK_ATTRS, TRAITS, playerRating, potentialRange } from '../game/players';
import {
  DRILLS, GREAT, LINES, PLAY_MAX, PLAY_MIN, PROGRAMS, attrsAfter, bestCat, catsFor, drillsFor, pickOf, programDesc, programLabel, programNeed,
  programOf, programsFor, sessionOf, sessionPreview, suggestFor,
} from '../game/training';
import { fixtureShort, nextFixture } from '../game/cups';
import { setTrainingPick, startProgram, stopProgram, trainPlayer } from '../game/engine';
import { fmtMoney, fmtRating } from './format';
import { IconArrowUp, IconCheck, IconChevron, IconClose, IconLock, IconPlay, IconStar, IconTraining } from './icons';
import { Eyebrow } from './kit';
import { Panel } from './panels';
import { Tabs } from './glass';
import { Presence } from './presence';
import { Portrait } from './portrait';
import { heat } from './mercato';

// Centre d'entraînement (training.js), ouvert d'un clic sur le bâtiment dans la vue 3D, depuis sa fiche ou un conseil
// du staff. Trois onglets :
//  - Séance : entre deux matchs, quatre joueurs, un par ligne, chacun sur la catégorie choisie ; une épreuve chacun,
//    jouée en 3D (drill.jsx) ou simulée. Le gain attendu est affiché avant (simulée, et la fourchette d'une épreuve
//    jouée), exactement celui que donnera la séance ;
//  - Programmes (dès le niveau 3) : apprendre un signe distinctif en quelques séances ;
//  - Progrès : les séances de la saison, la séance collective, ce que chaque niveau du centre apporte.

const gainTxt = (g) => `+${(Math.max(0, Math.round(g * 100)) / 100).toFixed(2).replace('.', ',')}`;
const dec = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR');
const dec2 = (v) => v.toFixed(2).replace('.', ','); // qualités : toujours deux décimales (8,00 et non 8)
const newDrill = (l) => Object.values(DRILLS).find((d) => d.level === l && l > 1)?.label || null;
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const attrInfo = (p, key) => (p.pos === 'G' ? GK_ATTRS : ATTRS).find((a) => a.key === key);
const poolOf = (p) => (p.pos === 'G' ? p.g : p.a);
const potText = (r) => (r ? `${fmtRating(r[0])} – ${fmtRating(r[1])}` : 'atteint');
const divRef = (s) => { const d = DIVISIONS[s.divisionIndex]; return (d.oppMin + d.oppMax) / 2; };
const latest = (lvl, pos, cat) => drillsFor(Math.max(1, lvl), pos, cat).at(-1);
// séance d'une fenêtre (« saison:indice du match ») : le match qu'elle préparait
function windowLabel(s, key) {
  const [season, at] = String(key).split(':');
  if (at === 'fin') return 'Fin de saison';
  const i = Number(at);
  const f = Number(season) === s.seasonNumber ? s.calendar?.[i] : null;
  if (!f) return 'Séance';
  const round = (s.calendar || []).slice(0, i + 1).filter((x) => x.comp === 'league').length;
  return `Avant : ${fixtureShort(f, round)}`;
}

// Textes des épreuves : ce qu'on y fait, et comment on y joue (rappelé au début de l'épreuve).
export const DRILL_TEXT = {
  precision: 'Tirs au but sur cibles : arrête le viseur au bon moment, le plus près du centre.',
  sprint: 'Course de haies chronométrée : saute au bon moment pour garder ta vitesse.',
  lecture: 'Sur la tablette de l’analyste, l’action se fige : trouve vite la bonne passe.',
  arrets: 'Huit tirs, à ras de terre, en lucarne ou enroulés : plonge vers le ballon, le plus tôt possible.',
  coupsFrancs: 'Un mur et un gardien : vise haut pour passer le mur, loin du gardien, dans la lucarne.',
  penalties: 'Juste avant de frapper, le tireur se tourne vers son côté : plonge à cet instant. Trop tôt, il te voit partir.',
  centres: 'L’ailier déborde et centre : lance ta course vers le point de chute, puis saute pour reprendre de la tête.',
  contre: 'Trois contre deux à pleine vitesse : au ralenti, choisis la passe ou le tir. Le défenseur qui sort libère quelqu’un.',
};

export function TrainingView({ state, run, ask, notify = () => {}, onClose, onBuilding, onPlay, initialTab = 'session', preview = null }) {
  const [tab, setTab] = useState(initialTab);
  const [chooser, setChooser] = useState(preview?.chooser || null); // ligne dont on choisit le joueur
  const [programFor, setProgramFor] = useState(preview?.program || null); // joueur dont on choisit le programme
  const lvl = state.buildings.training || 0;
  const session = sessionOf(state);
  const picks = useMemo(() => Object.fromEntries(LINES.map((pos) => [pos, pickOf(state, pos)])), [state]);
  const todo = LINES.filter((pos) => picks[pos] && !session.done[pos]);
  const programs = Object.keys(state.training?.programs || {}).filter((id) => state.players.some((p) => String(p.id) === id));

  const setPick = (pos, next) => run((s) => setTrainingPick(s, pos, next));
  // simuler : les épreuves sont comptées tout de suite, au gain moyen
  const simulate = (lines) => {
    const res = [];
    const ok = run((s) => {
      for (const pos of lines) if (trainPlayer(s, pos, { ...picks[pos], score: null })) res.push(s.training.done[pos]);
      return res.length ? s : null;
    }, 'Séance impossible.');
    if (!ok) return;
    const learned = res.find((r) => r.learned);
    notify({
      kind: 'training', eyebrow: res.length > 1 ? 'Séance simulée' : 'Épreuve simulée',
      title: learned ? `${learned.name} acquiert le signe ${programLabel(learned.learned)}` : `${gainTxt(res.reduce((a, r) => a + r.gain, 0))} de niveau`,
      text: res.length > 1 ? res.map((r) => `${r.name} ${gainTxt(r.gain)}`).join(' · ') : `${res[0].name} : ${fmtRating(res[0].before)} → ${fmtRating(res[0].after)}`,
      action: { panel: 'training', tab: learned ? 'programs' : 'session' },
    });
  };
  const play = (lines) => onPlay(lines.map((pos) => ({ pos, ...picks[pos] })));
  const begin = (p, id) => {
    if (!run((s) => startProgram(s, p.id, id), 'Programme impossible.')) return;
    setProgramFor(null);
    notify({
      kind: 'training', eyebrow: 'Centre d’entraînement', title: `Programme ${programLabel(id)} pour ${p.name}`,
      text: `${PROGRAM_STEPS[lvl]} séances en ${catsFor(p.pos)[PROGRAMS[id].cat].label.toLowerCase()}.`,
      action: { panel: 'training', tab: 'programs' },
    });
  };
  const stop = (p) => ask({
    tone: 'danger',
    title: `Arrêter le programme de ${p.name} ?`,
    text: 'Les séances déjà faites pour ce programme seront perdues.',
    confirmLabel: 'Arrêter',
    cancelLabel: 'Continuer',
    onConfirm: () => run((s) => stopProgram(s, p.id)),
  });
  const onEscape = () => { if (chooser) setChooser(null); else if (programFor) setProgramFor(null); else onClose(); };
  const chooserPlayer = programFor ? state.players.find((p) => p.id === programFor) : null;

  return (
    <Panel
      size="lg"
      title="Centre d’entraînement"
      eyebrow={<>Niveau {lvl} / {BUILDINGS.training.max}<span className="hide-sm"> · progrès ×{dec(TRAINING_MULT[lvl] || 0)} par séance</span></>}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <>
          <SessionMeter state={state} todo={todo} />
          <Tabs
            items={[
              ['session', 'Séance', todo.length ? <em className="mc-count-badge ac-tab-n hot">{todo.length}</em> : null],
              ['programs', 'Programmes', programs.length ? <em className="mc-count-badge ac-tab-n">{programs.length}</em> : lvl < 3 ? <IconLock className="tr-tab-lock" aria-label="dès le niveau 3" /> : null],
              ['progress', 'Progrès'],
            ]}
            value={tab}
            onChange={setTab}
          />
        </>
      )}
      overlay={(
        <Presence>
          {chooser && (
            <Chooser
              state={state}
              pos={chooser}
              current={picks[chooser]?.id}
              onPick={(p) => { const cat = bestCat(state, p); setPick(chooser, { id: p.id, cat, drill: latest(lvl, chooser, cat) }); setChooser(null); }}
              onClose={() => setChooser(null)}
            />
          )}
          {chooserPlayer && (
            <ProgramSheet state={state} p={chooserPlayer} onStart={(id) => begin(chooserPlayer, id)} onClose={() => setProgramFor(null)} />
          )}
        </Presence>
      )}
    >
      {lvl < 1 ? (
        <div className="ac-empty">
          <span className="ac-empty-ico"><IconTraining /></span>
          <h3>Ton centre d’entraînement n’est pas construit</h3>
          <p>Construis-le sur une parcelle libre du complexe : entre deux matchs, quatre de tes joueurs y passeront une épreuve.</p>
        </div>
      ) : tab === 'session' ? (
        <SessionTab
          state={state}
          picks={picks}
          todo={todo}
          onPick={setPick}
          onChoose={setChooser}
          onPlay={play}
          onSimulate={simulate}
        />
      ) : tab === 'programs' ? (
        <ProgramsTab state={state} onNew={(p) => setProgramFor(p.id)} onStop={stop} onBuilding={onBuilding} />
      ) : (
        <ProgressTab state={state} onBuilding={onBuilding} />
      )}
    </Panel>
  );
}

// Avancement de la séance : une case par ligne (or : faite), et le match qu'elle prépare.
function SessionMeter({ state, todo }) {
  const f = nextFixture(state);
  const lines = LINES.filter((pos) => state.players.some((p) => p.pos === pos));
  const done = lines.length - todo.length;
  return (
    <div className="sq-budget tr-meter">
      <div className="sq-budget-top"><span>Séance</span><b>{done} / {lines.length}</b></div>
      <span className="ac-slots tr-slots" aria-hidden="true">
        {lines.map((pos) => <i key={pos} className={sessionOf(state).done[pos] ? 'on' : ''} />)}
      </span>
      <span className="sq-budget-sub">{f ? `Avant : ${fixtureShort(f, state.round + 1)}` : 'Avant la fin de la saison'}</span>
    </div>
  );
}

// --- Séance ------------------------------------------------------------------------------------------------------

function SessionTab({ state, picks, todo, onPick, onChoose, onPlay, onSimulate }) {
  const session = sessionOf(state);
  const lines = LINES.filter((pos) => picks[pos]);
  const total = lines.reduce((a, pos) => a + (session.done[pos]?.gain || 0), 0);
  return (
    <>
      <div className={`tr-lead ${todo.length ? '' : 'done'}`}>
        <div className="tr-lead-text">
          <strong>{todo.length ? (todo.length === lines.length ? 'Quatre épreuves avant le match' : `${plural(todo.length, 'épreuve', 'épreuves')} à faire`) : 'Séance terminée'}</strong>
          <span>
            {todo.length
              ? 'Une épreuve par ligne, en 3D, d’environ 25 secondes. Bien jouée, elle rapporte plus que simulée.'
              : <>Tes joueurs ont gagné <b>{gainTxt(total)}</b> de niveau. Prochaine séance après le match.</>}
          </span>
        </div>
        {todo.length > 0 && (
          <div className="tr-lead-cta">
            <button type="button" className="btn ghost" onClick={() => onSimulate(todo)}>Tout simuler</button>
            <button type="button" className="btn" onClick={() => onPlay(todo)}><IconPlay /> {todo.length > 1 ? 'Lancer la séance' : 'Lancer l’épreuve'}</button>
          </div>
        )}
      </div>
      <div className="tr-lines">
        {LINES.map((pos) => (
          <LineCard
            key={pos}
            state={state}
            pos={pos}
            pick={picks[pos]}
            done={session.done[pos]}
            onPick={(next) => onPick(pos, next)}
            onChoose={() => onChoose(pos)}
            onPlay={() => onPlay([pos])}
            onSimulate={() => onSimulate([pos])}
          />
        ))}
      </div>
      <p className="sq-hint tr-rules">
        Les progrès sont définitifs et ne dépassent jamais le potentiel du joueur ; un jeune progresse plus vite qu’un
        trentenaire. Une épreuve jouée rapporte de ×{dec(PLAY_MIN)} (score nul) à ×{dec(PLAY_MAX)} (score parfait) du gain
        simulé : le tiers des points suffit pour faire aussi bien. Après chaque match, les joueurs qui n’étaient pas à la
        séance progressent un peu (séance collective).
      </p>
    </>
  );
}

function LineCard({ state, pos, pick, done, onPick, onChoose, onPlay, onSimulate }) {
  const lvl = state.buildings.training || 0;
  const p = pick ? state.players.find((q) => q.id === pick.id) : null;
  if (!p) {
    return (
      <article className="tr-line empty">
        <header className="tr-line-head"><span className={`pos-pill ${pos}`}>{pos}</span><b>{POS_LABELS[pos]}</b></header>
        <p className="tr-none">Aucun {POS_LABELS[pos].toLowerCase()} dans ton effectif.</p>
      </article>
    );
  }
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const prog = programOf(state, p.id);
  const head = (
    <header className="tr-line-head">
      <span className={`pos-pill ${pos}`}>{pos}</span>
      <b>{POS_LABELS[pos]}</b>
      {done ? <em className="tr-state ok"><IconCheck /> {done.score === null ? 'Simulée' : `Jouée · ${Math.round(done.score * 100)} %`}</em>
        : <em className="tr-state">À faire</em>}
    </header>
  );
  const who = (
    <div className="tr-who">
      <Portrait p={p} size={44} />
      <span className="tr-who-text">
        <span className="tr-name">{p.name}</span>
        <span className="tr-meta">{p.age} ans · niveau <b className={heat(r, divRef(state))}>{fmtRating(r)}</b> · pot. {potText(pot)}</span>
      </span>
      {!done && <button type="button" className="btn ghost btn-sm tr-change" onClick={onChoose}>Changer<IconChevron /></button>}
    </div>
  );

  if (done) {
    const steps = done.steps;
    return (
      <article className="tr-line is-done">
        {head}
        {who}
        <div className="tr-result">
          <div><b className="tr-gain">{gainTxt(done.gain)}</b><span>niveau {fmtRating(done.before)} → {fmtRating(done.after)}</span></div>
          <div><b>{DRILLS[done.drill]?.label}</b><span>{catsFor(pos)[done.cat]?.label}</span></div>
        </div>
        {done.learned && <p className="tr-learned"><IconStar /> Signe distinctif acquis : <b>{programLabel(done.learned)}</b></p>}
        {!done.learned && steps && <ProgramBar label={programLabel(steps[2])} steps={steps[0]} need={steps[1]} />}
      </article>
    );
  }

  const cats = catsFor(pos);
  const best = bestCat(state, p);
  const preview = sessionPreview(state, p, pick.cat, pick.drill);
  const after = attrsAfter(state, p, pick.cat, pick.drill);
  const drills = drillsFor(lvl, pos, pick.cat);
  const progCat = prog ? PROGRAMS[prog.id].cat : null;
  return (
    <article className="tr-line">
      {head}
      {who}
      <Tabs
        className="segmented tr-cats"
        role="radiogroup"
        label="Catégorie travaillée"
        items={Object.keys(cats).map((c) => {
          const g = sessionPreview(state, p, c, latest(lvl, pos, c)).sim;
          return [c, <span className="tr-cat" key={c}><span>{cats[c].short}{c === best && <i className="ac-advised" title="Conseillée : son niveau y progresse le plus vite" aria-label="conseillée" />}</span><em>{gainTxt(g)}</em></span>];
        })}
        value={pick.cat}
        onChange={(c) => onPick({ id: p.id, cat: c, drill: latest(lvl, pos, c) })}
      />
      <div className="tr-attrs">
        {cats[pick.cat].attrs.map((k) => {
          const a = attrInfo(p, k);
          const was = poolOf(p)[k];
          return (
            <span key={k} className="tr-attr" title={a.name}>
              <span>{a.name}</span>
              <b>{dec2(was)}<IconArrowUp />{dec2(after[k])}</b>
            </span>
          );
        })}
      </div>
      {drills.length > 1 ? (
        <Tabs
          className="chips tr-drills"
          role="radiogroup"
          label="Épreuve"
          items={drills.map((d) => [d, DRILLS[d].label])}
          value={pick.drill}
          onChange={(d) => onPick({ ...pick, drill: d })}
        />
      ) : null}
      <p className="tr-drill"><b>{DRILLS[pick.drill].label}</b> · {DRILL_TEXT[pick.drill]}</p>
      {prog && (
        <ProgramBar
          label={programLabel(prog.id)}
          steps={prog.steps}
          need={programNeed(state, prog)}
          note={progCat === pick.cat ? 'avance avec cette séance, de deux pas si l’épreuve est très réussie' : `avance seulement en ${catsFor(pos)[progCat].label.toLowerCase()}`}
          warn={progCat !== pick.cat}
        />
      )}
      <footer className="tr-line-foot">
        <span className="tr-expect">
          {preview.sim > 0.004
            ? <>Simulée <b>{gainTxt(preview.sim)}</b> · jouée <b>{gainTxt(preview.min)}</b> à <b>{gainTxt(preview.max)}</b></>
            : 'Potentiel atteint : plus de progrès possible'}
        </span>
        <div className="tr-actions">
          <button type="button" className="btn ghost btn-sm" onClick={onSimulate}>Simuler</button>
          <button type="button" className="btn btn-sm" onClick={onPlay}><IconPlay /> Jouer</button>
        </div>
      </footer>
    </article>
  );
}

function ProgramBar({ label, steps, need, note = null, warn = false }) {
  return (
    <div className={`tr-prog ${warn ? 'warn' : ''}`}>
      <div className="tr-prog-top"><span>Programme <b>{label}</b></span><em>{steps} / {need} séances</em></div>
      <span className="tr-prog-bar" aria-hidden="true"><i style={{ width: `${(steps / need) * 100}%` }} /></span>
      {note && <span className="tr-prog-note">{note}</span>}
    </div>
  );
}

// Choix du joueur d'une ligne : celui qui progresserait le plus d'abord (catégorie conseillée, séance simulée).
function Chooser({ state, pos, current, onPick, onClose }) {
  const lvl = state.buildings.training || 0;
  const advised = suggestFor(state, pos);
  const rows = state.players.filter((p) => p.pos === pos).map((p) => {
    const cat = bestCat(state, p);
    return { p, cat, g: sessionPreview(state, p, cat, latest(lvl, pos, cat)).sim };
  }).sort((a, b) => b.g - a.g || playerRating(b.p) - playerRating(a.p));
  const ref = divRef(state);
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article className="sq-sheet glass tr-sheet" onClick={(e) => e.stopPropagation()} aria-label={`Choisir le ${POS_LABELS[pos].toLowerCase()}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="panel-title"><Eyebrow>Séance · {POS_LABELS[pos].toLowerCase()}</Eyebrow><h3 className="tr-sheet-title">Qui s’entraîne ?</h3></div>
          <button type="button" className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>
        <ul className="tr-pick-list">
          {rows.map(({ p, cat, g }) => {
            const r = playerRating(p);
            const prog = programOf(state, p.id);
            return (
              <li key={p.id}>
                <button type="button" className={`tr-pick ${p.id === current ? 'on' : ''}`} onClick={() => onPick(p)}>
                  <Portrait p={p} size={40} />
                  <span className="tr-who-text">
                    <span className="tr-name">{p.name}{p === advised && <em className="ac-tag good">Conseillé</em>}</span>
                    <span className="tr-meta">
                      {p.age} ans · pot. {potText(potentialRange(p, state))} · {catsFor(pos)[cat].short.toLowerCase()}
                      {prog ? ` · programme ${programLabel(prog.id)}` : ''}
                    </span>
                  </span>
                  <span className="tr-pick-side">
                    <b className={heat(r, ref)}>{fmtRating(r)}</b>
                    <em className={g > 0.004 ? 'up' : ''}>{g > 0.004 ? gainTxt(g) : 'au maximum'}</em>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </article>
    </div>
  );
}

// --- Programmes ----------------------------------------------------------------------------------------------------

function ProgramsTab({ state, onNew, onStop, onBuilding }) {
  const lvl = state.buildings.training || 0;
  if (lvl < 3) {
    return (
      <div className="ac-empty">
        <span className="ac-empty-ico"><IconLock /></span>
        <h3>Programmes de signes distinctifs</h3>
        <p>
          Au niveau 3 du centre, un joueur peut apprendre un signe distinctif (Finisseur, Roc, Leader, Chat…) en
          {` ${PROGRAM_STEPS[3]} `}séances dans la bonne catégorie ; {PROGRAM_STEPS[5]} seulement au niveau 5.
        </p>
        <button type="button" className="btn ghost" onClick={onBuilding}><IconArrowUp /> Voir le bâtiment · niveau {lvl}</button>
      </div>
    );
  }
  const active = state.players.filter((p) => programOf(state, p.id));
  const free = LINES.flatMap((pos) => state.players.filter((p) => p.pos === pos && !programOf(state, p.id) && programsFor(state, p).length));
  return (
    <>
      <p className="sq-hint ac-intro">
        Un programme avance à chaque séance du joueur dans la catégorie du signe ; une épreuve très réussie (deux tiers
        des points) compte double. Au bout, le signe est acquis pour toujours ({PROGRAM_STEPS[lvl]} séances à ton niveau,
        trois signes au plus par joueur).
      </p>
      {active.length > 0 && (
        <section className="tr-progs">
          <Eyebrow>En cours</Eyebrow>
          {active.map((p) => {
            const prog = programOf(state, p.id);
            const g = PROGRAMS[prog.id];
            return (
              <article key={p.id} className="tr-progcard">
                <Portrait p={p} size={40} />
                <div className="tr-progcard-main">
                  <span className="tr-name"><span className={`pos-pill ${p.pos}`}>{p.pos}</span>{p.name}</span>
                  <ProgramBar label={programLabel(prog.id)} steps={prog.steps} need={programNeed(state, prog)} note={`séances en ${catsFor(p.pos)[g.cat].label.toLowerCase()} · ${programDesc(prog.id)}`} />
                </div>
                <button type="button" className="btn ghost btn-sm" onClick={() => onStop(p)}>Arrêter</button>
              </article>
            );
          })}
        </section>
      )}
      <section className="tr-progs">
        <Eyebrow>Nouveau programme</Eyebrow>
        {free.length ? (
          <ul className="tr-pick-list">
            {free.map((p) => (
              <li key={p.id}>
                <button type="button" className="tr-pick" onClick={() => onNew(p)}>
                  <Portrait p={p} size={40} />
                  <span className="tr-who-text">
                    <span className="tr-name"><span className={`pos-pill ${p.pos}`}>{p.pos}</span>{p.name}</span>
                    <span className="tr-meta">{programsFor(state, p).map(programLabel).join(' · ')}</span>
                  </span>
                  <IconChevron className="tr-pick-go" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="ac-none">Chaque joueur suit déjà un programme ou a tous les signes qu’il peut apprendre.</p>}
      </section>
    </>
  );
}

function ProgramSheet({ state, p, onStart, onClose }) {
  const lvl = state.buildings.training || 0;
  const ids = programsFor(state, p);
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article className="sq-sheet glass tr-sheet" onClick={(e) => e.stopPropagation()} aria-label={`Programme de ${p.name}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="panel-title"><Eyebrow>Programme · {PROGRAM_STEPS[lvl]} séances</Eyebrow><h3 className="tr-sheet-title">{p.name}</h3></div>
          <button type="button" className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>
        {(p.traits || []).length > 0 && <p className="tr-has">Signes actuels : {p.traits.map((t) => TRAITS[t].name).join(' · ')}</p>}
        <ul className="tr-prog-list">
          {ids.map((id) => (
            <li key={id}>
              <div>
                <b>{programLabel(id)}</b>
                <span>{programDesc(id)}</span>
                <em>Séances en {catsFor(p.pos)[PROGRAMS[id].cat].label.toLowerCase()}</em>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => onStart(id)}>Commencer</button>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

// --- Progrès -------------------------------------------------------------------------------------------------------

function ProgressTab({ state, onBuilding }) {
  const log = (state.training?.log || []).filter((e) => e.season === state.seasonNumber);
  const total = log.reduce((a, e) => a + e.gain, 0);
  const played = log.filter((e) => e.score !== null);
  const coll = state.training?.collective;
  return (
    <>
      <div className="sh-stats tr-season">
        <div><b>{log.length}</b><span>épreuves cette saison</span></div>
        <div><b className={total > 0.004 ? 'good' : ''}>{gainTxt(total)}</b><span>de niveau gagné</span></div>
        <div><b>{played.length ? `${Math.round((played.reduce((a, e) => a + e.score, 0) / played.length) * 100)} %` : '–'}</b><span>score moyen joué</span></div>
      </div>
      {coll && coll.season === state.seasonNumber && (
        <p className="sq-hint tr-coll">
          Après le dernier match, séance collective : {plural(coll.players, 'joueur a', 'joueurs ont')} progressé, {gainTxt(coll.gain)} de niveau en tout.
        </p>
      )}
      {log.length ? (
        <ol className="tr-log">
          {log.map((e, i) => (
            <React.Fragment key={i}>
            {(i === 0 || log[i - 1].key !== e.key) && <li className="tr-log-head">{windowLabel(state, e.key)}</li>}
            <li>
              <span className={`pos-pill ${e.pos}`}>{e.pos}</span>
              <span className="tr-log-main">
                <b>{e.name}</b>
                <span>{DRILLS[e.drill]?.label} · {e.score === null ? 'simulée' : `jouée, ${Math.round(e.score * 100)} %${e.score >= (GREAT - PLAY_MIN) / (PLAY_MAX - PLAY_MIN) ? ' · très réussie' : ''}`}{e.learned ? ` · signe ${programLabel(e.learned)} acquis` : ''}</span>
              </span>
              <b className="tr-gain">{gainTxt(e.gain)}</b>
            </li>
            </React.Fragment>
          ))}
        </ol>
      ) : <p className="ac-none">Aucune épreuve cette saison pour l’instant.</p>}
      <LevelCard state={state} onBuilding={onBuilding} />
    </>
  );
}

// Ce que le centre apporte à chaque niveau (l'amélioration se fait sur la fiche du bâtiment).
function LevelCard({ state, onBuilding }) {
  const lvl = state.buildings.training || 0;
  const max = BUILDINGS.training.max;
  const rows = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <section className="ac-level tr-levels">
      <div className="ac-level-head">
        <span className="ac-level-ico"><IconTraining /></span>
        <div className="panel-title">
          <Eyebrow>Niveau {lvl} / {max}</Eyebrow>
          <strong>Chaque niveau rend les séances plus fortes ; les programmes de signes s’ouvrent au niveau 3.</strong>
        </div>
      </div>
      <table className="tr-level-table">
        <thead><tr><th>Niveau</th><th>Progrès par séance</th><th>Nouvelle épreuve</th><th>Séance collective</th><th>Programmes</th></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l} className={l === lvl ? 'on' : l < lvl ? 'past' : ''}>
              <td>{l}</td>
              <td>×{dec(TRAINING_MULT[l])}</td>
              <td>{newDrill(l) || '4 de base'}</td>
              <td>{dec(TRAINING_COLLECTIVE[l] * 100)} % de la marge</td>
              <td>{PROGRAM_STEPS[l] ? `${PROGRAM_STEPS[l]} séances` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lvl < max ? (
        <div className="ac-level-next">
          <span><b>Niveau {lvl + 1}</b> : progrès ×{dec(TRAINING_MULT[lvl + 1])} par séance{newDrill(lvl + 1) ? `, nouvelle épreuve : ${newDrill(lvl + 1).toLowerCase()}` : ''}{PROGRAM_STEPS[lvl + 1] && !PROGRAM_STEPS[lvl] ? ', programmes de signes distinctifs' : ''}.</span>
          <button type="button" className="btn ghost btn-sm" onClick={onBuilding}><IconArrowUp /> Améliorer · {fmtMoney(upgradeCost('training', lvl + 1))}</button>
        </div>
      ) : <span className="ac-level-max">Niveau maximum atteint</span>}
    </section>
  );
}
