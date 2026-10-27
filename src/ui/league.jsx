import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from './panels';
import { PreMatch } from './match';
import { SectionHead } from './kit';
import { ClubCrest, Crest, CrestArt } from './crest';
import { CREST_ROWS } from './title';
import { IconCheck, IconChevron, IconChevronLeft, IconClock, IconDice, IconPlay, IconPlus, IconUsers } from './icons';
import { uiSound } from './uisound';
import { capitalize, isPluralClub, randomClubName, withArticle } from '../game/names';
import { CLUB_BLACK, clubInitials, defaultCrest, hexLum, normalizeCrest, randomCrest, withStyle } from '../game/crest';
import {
  AI_PSEUDO, LEAGUE_CLUBS, LEAGUE_COLORS, LEAGUE_MIN_HUMANS, MAX_MY_LEAGUES, autoSheet, cleanCode, cleanSheet, deadlineText,
  deviceZone, hourText, isLeagueCode, leagueClubs, leagueFixtures, leagueRounds, leagueTable, replayOf, squadsOf,
} from '../game/league';
import { LINES, START_BUDGET, paceOfLeague, sessionPreview, trainingPlan } from '../game/leagueWorld';
import { catsFor } from '../game/training';
import { playerRating } from '../game/players';
import { fmtMoney, fmtRating } from './format';
import {
  createLeague, forgetLeague, inviteLink, joinLeague, kickMember, leagueInfo, leagueState, leaveLeague, myLeagues,
  parseResumeCode, refreshLeague, rememberLeague, resumeCodeOf, sendSheet, startLeague, updateLeague,
} from '../game/leagueNet';
import { lineupRating } from '../game/tactics';

// Siège de la Ligue : les championnats entre amis (league.js, leagueNet.js). Une fenêtre, cinq vues :
//   home     mes championnats (trois au plus sur cet appareil), créer, rejoindre, reprendre
//   create   le créateur (propriétaire du Siège) : nom, logo et couleurs, format, heure des journées, son club
//   join     un code (ou un lien d'invitation) : le championnat, puis son pseudo et son club
//   resume   reprendre un club sur cet appareil avec son code de reprise
//   league   un championnat : salle d'attente (invitation, clubs, lancement) ou saison (journée, matchs, classement)
// Ouverte en jeu (clic sur le bâtiment) ou depuis l'écran titre (un invité n'a pas besoin du Siège, ni même d'une
// partie). Les retours (lien copié, erreur du serveur) s'affichent dans la fenêtre : sur l'écran titre, les
// notifications du jeu attendent.

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const okText = (t, max) => { const c = clean(t); return c.length >= 2 && c.length <= max && !/[<>]/.test(c); };
const okPseudo = (p) => okText(p, 20) && clean(p).toLowerCase() !== AI_PSEUDO.toLowerCase();
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const LOGO_ROWS = CREST_ROWS.filter(([key]) => key !== 'ground'); // le fond du logo : les couleurs de la ligue
const LEAGUE_NAMES = [
  'Ligue du Quartier', 'Championnat des Copains', 'Trophée du Dimanche', 'Ligue de la Place', 'Coupe des Voisins',
  'Championnat du Vendredi', 'Ligue des Lumières', 'Ligue des Anciens', 'Trophée de la Rue', 'Ligue du Soir',
];
const HOURS = [...Array(24).keys()];
const MINUTES = [0, 15, 30, 45];

// Logo d'une ligue : son écusson aux deux couleurs choisies (le noir et or par défaut). Son nom s'écrit en entier ; sur le
// ruban d'un blason ou d'un badge, seulement s'il y tient (18 signes avec l'année), sinon l'année seule.
export function LeagueLogo({ name, settings, className = '', full = false }) {
  const crest = normalizeCrest(settings?.crest || defaultCrest());
  const long = crest.style !== 'medaillon' && name.length + (crest.text === 'les-deux' ? 7 : 0) > 18;
  const c = long && (crest.text === 'nom' || crest.text === 'les-deux') ? { ...crest, text: 'annee' } : crest;
  const [base, second] = settings?.colors?.length === 2 ? settings.colors : [CLUB_BLACK, 'gold'];
  const spec = { ...c, base, second, metal: 'or', ink: hexLum(base) > 150 ? 'dark' : 'metal', band: '#15120c', crown: false };
  return <CrestArt spec={spec} initials={clubInitials(name)} name={name} short={name} full={full} className={`lig-logo ${className}`} title={`Logo : ${name}`} />;
}

// Club d'une ligue : l'écusson noir et or d'un ami, celui d'un club de l'ordinateur tiré de son nom.
function ClubMark({ club, className = '' }) {
  return club.crest ? <ClubCrest crest={club.crest} name={club.name} className={className} /> : <Crest name={club.name} className={className} />;
}

// Une ligne de choix (style, forme, couleurs…) : flèches à la souris ou au doigt, gauche / droite au clavier.
function PickRow({ label, list, value, onStep }) {
  const cur = list.find(([id]) => id === value) || list[0];
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${label} : ${cur[1]}`}
      className="ts-pick"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onStep(1); }
      }}
    >
      <span className="ts-pick-label">{label}</span>
      <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={`${label} précédent`} onClick={() => onStep(-1)}><IconChevronLeft /></button>
      <span className="ts-pick-value">{cur[1]}</span>
      <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={`${label} suivant`} onClick={() => onStep(1)}><IconChevron /></button>
    </div>
  );
}
const stepIn = (list, value, d) => list[(Math.max(0, list.findIndex(([id]) => id === value)) + d + list.length) % list.length][0];

// Écusson composé ligne par ligne, avec son aperçu et son dé ; extra : lignes de plus (les couleurs d'une ligue).
function CrestPicker({ crest, onChange, rows, preview, label, extra = null }) {
  const step = (key, list, d) => {
    const v = stepIn(list, crest[key], d);
    onChange(key === 'style' ? withStyle(crest, v) : { ...crest, [key]: v });
    uiSound('move');
  };
  return (
    <div className="ts-crest lig-crest">
      <div className="ts-crest-side">
        {preview}
        <button type="button" className="ts-dice" onClick={() => { onChange(randomCrest()); uiSound('move'); }} aria-label="Écusson au hasard" title="Écusson au hasard"><IconDice /></button>
      </div>
      <div className="ts-crest-rows">
        <span className="ts-field-label">{label}</span>
        {rows.map(([key, lab, listOf]) => <PickRow key={key} label={lab} list={listOf(crest)} value={crest[key]} onStep={(d) => step(key, listOf(crest), d)} />)}
        {extra}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, max, placeholder = '', dice = null, hint = null, mono = false }) {
  return (
    <label className="lig-field">
      <span className="ts-field-label">{label}</span>
      <span className={`lig-input ${mono ? 'mono' : ''}`}>
        <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} autoComplete="off" spellCheck={false} placeholder={placeholder} />
        {dice && <button type="button" className="ts-dice" onClick={() => { dice(); uiSound('move'); }} aria-label={`${label} : autre proposition`} title="Autre proposition"><IconDice /></button>}
      </span>
      {hint && <small className="lig-hint">{hint}</small>}
    </label>
  );
}

// Pseudo, nom et écusson de son club : à la création comme pour rejoindre.
function ClubFields({ pseudo, setPseudo, club, setClub, crest, setCrest, taken = null }) {
  const pseudoTaken = taken?.pseudos.includes(clean(pseudo).toLowerCase());
  const clubTaken = taken?.clubs.includes(clean(club).toLowerCase());
  return (
    <>
      <SectionHead label="Ton club" aside="un club de quartier neuf, à égalité" />
      <Field
        label="Ton pseudo"
        value={pseudo}
        onChange={setPseudo}
        max={20}
        placeholder="Comment tes amis te connaissent"
        hint={pseudoTaken ? 'Ce pseudo est déjà pris dans ce championnat.' : clean(pseudo).toLowerCase() === AI_PSEUDO.toLowerCase() ? 'Ce pseudo est réservé aux clubs de l’ordinateur.' : null}
      />
      <Field label="Nom du club" value={club} onChange={setClub} max={32} placeholder="Nom de ton club" dice={() => setClub(randomClubName())} hint={clubTaken ? 'Ce nom de club est déjà pris dans ce championnat.' : null} />
      <CrestPicker
        crest={crest}
        onChange={setCrest}
        rows={CREST_ROWS}
        label="Écusson · noir et or"
        preview={<ClubCrest crest={crest} name={clean(club) || 'Ton club'} className="ts-crest-art" full title={`Écusson de ${clean(club) || 'ton club'}`} />}
      />
    </>
  );
}

function Problem({ text }) {
  return text ? <p className="lig-problem" role="alert">{text}</p> : null;
}

// ---------------------------------------------------------------------------------------------------- mes championnats

function Home({ mine, canBuild, onOpen, onCreate, onJoin, onResume }) {
  const [live, setLive] = useState({}); // code → réponse du serveur, ou { error }
  useEffect(() => {
    let alive = true;
    mine.forEach((m) => refreshLeague(m).then(
      (d) => { if (alive) setLive((x) => ({ ...x, [m.code]: d })); updateLeague(m.code, { name: d.league.name, settings: d.league.settings }); },
      (error) => { if (alive) setLive((x) => ({ ...x, [m.code]: { error } })); },
    ));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const full = mine.length >= MAX_MY_LEAGUES;
  return (
    <>
      <p className="dir-intro">Huit clubs de quartier, neufs et à égalité : le tien, ceux de tes amis et l’ordinateur aux places libres. Une journée par jour, chacun gère son club.</p>
      {mine.length === 0 ? (
        <section className="dir-card lig-empty">
          <h3>Aucun championnat pour l’instant</h3>
          <p className="dir-note">{canBuild ? 'Crée le tien et envoie le lien à tes amis, ou rejoins le leur avec leur code.' : 'Un ami t’a donné un code ? Rejoins son championnat. Pour créer le tien, construis le Siège de la Ligue en Elite.'}</p>
        </section>
      ) : (
        <ul className="lig-list">
          {mine.map((m) => {
            const d = live[m.code];
            const league = d?.league;
            let status = 'Mise à jour…';
            if (d?.error) status = d.error.status === 401 || d.error.status === 404 ? 'Introuvable : ce championnat a fermé' : 'Hors ligne pour l’instant';
            else if (league?.status === 'lobby') status = `Salle d’attente · ${plural(d.members.length, 'club')} sur ${LEAGUE_CLUBS}`;
            else if (league) {
              const ready = d.members.find((x) => x.id === m.id)?.validated;
              status = `Saison ${league.season} · journée ${Math.min(league.round + 1, leagueRounds(league))} / ${leagueRounds(league)} · ${ready ? 'équipe validée' : `équipe à valider${league.deadline ? ` avant ${deadlineText(league.deadline)}` : ''}`}`;
            }
            return (
              <li key={m.code}>
                <button type="button" className={`lig-card ${d?.error ? 'off' : ''}`} onClick={() => onOpen(m)}>
                  <LeagueLogo name={league?.name || m.name || m.code} settings={league?.settings || m.settings} className="lig-card-logo" />
                  <span className="lig-card-text">
                    <strong>{league?.name || m.name || m.code}</strong>
                    <em>{m.club.name} · {m.pseudo}</em>
                    <small>{status}</small>
                  </span>
                  <IconChevron />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="lig-actions">
        {canBuild && <button type="button" className="btn" disabled={full} onClick={onCreate}><IconPlus /> Créer un championnat</button>}
        <button type="button" className={`btn ${canBuild ? 'ghost' : ''}`} disabled={full} onClick={onJoin}><IconUsers /> Rejoindre avec un code</button>
      </div>
      {full && <p className="dir-note">Trois championnats à la fois au plus : quittes-en un pour en rejoindre un autre.</p>}
      <button type="button" className="linkbtn lig-resume-link" disabled={full} onClick={onResume}>Reprendre mon club sur cet appareil (code de reprise)</button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------- créer

function CreateForm({ onDone }) {
  const [name, setName] = useState(() => LEAGUE_NAMES[Math.floor(Math.random() * LEAGUE_NAMES.length)]);
  const [logo, setLogo] = useState(() => randomCrest());
  const [colors, setColors] = useState('noir-or');
  const [format, setFormat] = useState('double');
  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [pseudo, setPseudo] = useState('');
  const [club, setClub] = useState(randomClubName);
  const [crest, setCrest] = useState(() => randomCrest());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const ok = okText(name, 40) && okPseudo(pseudo) && okText(club, 32);
  const settings = { crest: logo, colors: LEAGUE_COLORS.find(([id]) => id === colors)[2], format, hour, minute };
  const submit = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const d = await createLeague({ name: clean(name), settings: { ...settings, tz: deviceZone() }, pseudo: clean(pseudo), club: { name: clean(club), crest } });
      const m = { code: d.league.code, id: d.me.id, secret: d.me.secret, pseudo: d.me.pseudo, club: d.me.club, name: d.league.name, settings: d.league.settings, at: Date.now() };
      rememberLeague(m);
      uiSound('select');
      onDone(m, 'Championnat créé : envoie le lien à tes amis.');
    } catch (x) {
      setProblem(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={submit}>
      <SectionHead label="Le championnat" />
      <Field label="Nom du championnat" value={name} onChange={setName} max={40} placeholder="Nom de ta ligue" dice={() => setName((n) => stepIn(LEAGUE_NAMES.map((x) => [x, x]), n, 1))} />
      <CrestPicker
        crest={logo}
        onChange={setLogo}
        rows={LOGO_ROWS}
        label="Logo de la ligue"
        preview={<LeagueLogo name={clean(name) || 'Ligue'} settings={settings} className="ts-crest-art" full />}
        extra={<PickRow label="Couleurs" list={LEAGUE_COLORS} value={colors} onStep={(d) => { setColors((c) => stepIn(LEAGUE_COLORS, c, d)); uiSound('move'); }} />}
      />
      <div className="lig-field">
        <span className="ts-field-label">Format</span>
        <div className="segmented lig-seg" role="radiogroup" aria-label="Format">
          {[['single', 'Aller simple', 7], ['double', 'Aller-retour', 14]].map(([id, label, n]) => (
            <button key={id} type="button" role="radio" aria-checked={format === id} className={format === id ? 'on' : ''} onClick={() => { setFormat(id); uiSound('move'); }}>
              {label}<small>{n} journées</small>
            </button>
          ))}
        </div>
      </div>
      <div className="lig-field">
        <span className="ts-field-label">Heure des journées</span>
        <span className="lig-time">
          <IconClock />
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Heure">
            {HOURS.map((h) => <option key={h} value={h}>{h} h</option>)}
          </select>
          <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label="Minutes">
            {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
          </select>
        </span>
        <small className="lig-hint">Une journée se joue dès que tous les amis ont validé leur équipe, et au plus tard chaque jour à {hourText(hour, minute)} (heure de cet appareil). Un retardataire joue avec une équipe choisie pour lui.</small>
      </div>
      <ClubFields pseudo={pseudo} setPseudo={setPseudo} club={club} setClub={setClub} crest={crest} setCrest={setCrest} />
      <Problem text={problem} />
      <button type="submit" className="btn btn-xl" disabled={!ok || busy}>{busy ? 'Création…' : 'Créer le championnat'}</button>
      {!okPseudo(pseudo) && <small className="lig-hint">Choisis ton pseudo pour créer le championnat.</small>}
    </form>
  );
}

// ------------------------------------------------------------------------------------------------------- rejoindre

function JoinForm({ initialCode, mine, onDone, onOpen }) {
  const [code, setCode] = useState(cleanCode(initialCode));
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [club, setClub] = useState(randomClubName);
  const [crest, setCrest] = useState(() => randomCrest());
  const look = async (c) => {
    if (!isLeagueCode(c) || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setInfo(await leagueInfo(c));
    } catch (x) {
      setInfo(null);
      setProblem(x.status === 404 ? 'Aucun championnat avec ce code. Vérifie-le avec ton ami.' : x.message);
    }
    setBusy(false);
  };
  useEffect(() => { if (isLeagueCode(code)) look(code); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const member = info && mine.find((m) => m.code === info.code);
  const taken = info && { pseudos: info.clubs.map((c) => c.pseudo.toLowerCase()), clubs: info.clubs.map((c) => c.club.name.toLowerCase()) };
  const ok = info && !member && info.status === 'lobby' && info.open > 0 && okPseudo(pseudo) && okText(club, 32)
    && !taken.pseudos.includes(clean(pseudo).toLowerCase()) && !taken.clubs.includes(clean(club).toLowerCase());
  const join = async (e) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const d = await joinLeague(info.code, { pseudo: clean(pseudo), club: { name: clean(club), crest } });
      const m = { code: d.league.code, id: d.me.id, secret: d.me.secret, pseudo: d.me.pseudo, club: d.me.club, name: d.league.name, settings: d.league.settings, at: Date.now() };
      rememberLeague(m);
      uiSound('select');
      onDone(m, `C’est fait : ${d.league.name} t’attend. Le créateur lancera la saison.`);
    } catch (x) {
      setProblem(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={info ? join : (e) => { e.preventDefault(); look(code); }}>
      <SectionHead label="Rejoindre un championnat" />
      <Field label="Code du championnat" value={code} mono max={6} placeholder="ABC234" onChange={(v) => { setCode(cleanCode(v)); setInfo(null); setProblem(null); }} hint="Six signes, donnés par ton ami (ou déjà dans son lien)." />
      {!info && <button type="submit" className="btn" disabled={!isLeagueCode(code) || busy}>{busy ? 'Recherche…' : 'Voir le championnat'}</button>}
      {info && (
        <section className="dir-card lig-info">
          <div className="lig-head">
            <LeagueLogo name={info.name} settings={info.settings} className="lig-head-logo" />
            <span>
              <strong>{info.name}</strong>
              <em>{info.settings.format === 'single' ? 'Aller simple · 7 journées' : 'Aller-retour · 14 journées'} · au plus tard à {hourText(info.settings.hour, info.settings.minute)}, heure du créateur</em>
            </span>
          </div>
          <ul className="lig-mini">
            {info.clubs.map((c) => <li key={c.slot}><ClubMark club={c.club} className="lig-mini-crest" /><span>{c.club.name}<em>{c.pseudo}</em></span></li>)}
          </ul>
          <p className="dir-note">{info.status !== 'lobby' ? 'La saison a déjà commencé : demande au créateur de t’inviter dans un prochain championnat.' : info.open ? `${plural(info.open, 'place libre', 'places libres')} : l’ordinateur prendra celles qui resteront au coup d’envoi.` : 'Ce championnat est complet.'}</p>
        </section>
      )}
      {member && (
        <div className="lig-actions">
          <p className="dir-note">Tu fais déjà partie de ce championnat, avec {member.club.name}.</p>
          <button type="button" className="btn" onClick={() => onOpen(member)}>Ouvrir le championnat</button>
        </div>
      )}
      {info && !member && info.status === 'lobby' && info.open > 0 && (
        mine.length >= MAX_MY_LEAGUES
          ? <p className="dir-note">Tu joues déjà trois championnats : quittes-en un pour rejoindre celui-ci.</p>
          : (
            <>
              <ClubFields pseudo={pseudo} setPseudo={setPseudo} club={club} setClub={setClub} crest={crest} setCrest={setCrest} taken={taken} />
              <button type="submit" className="btn btn-xl" disabled={!ok || busy}>{busy ? 'Inscription…' : 'Rejoindre le championnat'}</button>
              {!okPseudo(pseudo) && <small className="lig-hint">Choisis ton pseudo pour rejoindre le championnat.</small>}
            </>
          )
      )}
      <Problem text={problem} />
    </form>
  );
}

// -------------------------------------------------------------------------------------------------------- reprendre

function ResumeForm({ mine, onDone }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const parsed = parseResumeCode(raw);
  const submit = async (e) => {
    e.preventDefault();
    if (!parsed || busy) return;
    if (mine.length >= MAX_MY_LEAGUES && !mine.some((m) => m.code === parsed.code)) { setProblem('Tu joues déjà trois championnats sur cet appareil : quittes-en un d’abord.'); return; }
    setBusy(true);
    setProblem(null);
    try {
      const d = await leagueState(parsed);
      const m = { ...parsed, pseudo: d.me.pseudo, club: d.me.club, name: d.league.name, settings: d.league.settings, at: Date.now() };
      rememberLeague(m);
      uiSound('select');
      onDone(m, `${capitalize(withArticle(d.me.club.name))} ${isPluralClub(d.me.club.name) ? 'sont' : 'est'} de retour sur cet appareil.`);
    } catch (x) {
      setProblem(x.status === 401 || x.status === 404 ? 'Ce code ne correspond à aucun club : vérifie-le, ou il a peut-être quitté son championnat.' : x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={submit}>
      <SectionHead label="Reprendre mon club" />
      <p className="dir-intro">Sur ton autre appareil, ouvre ton championnat : son code de reprise est en bas. Colle-le ici.</p>
      <Field label="Code de reprise" value={raw} mono max={160} placeholder="ABC234.…" onChange={(v) => { setRaw(v.trim()); setProblem(null); }} />
      <Problem text={problem || (raw && !parsed ? 'Ce n’est pas un code de reprise complet.' : null)} />
      <button type="submit" className="btn" disabled={!parsed || busy}>{busy ? 'Vérification…' : 'Reprendre mon club'}</button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------- un championnat

// reload : relire tout de suite (équipe tout juste validée) ; onTeam : ouvrir l'avant-match pour valider son équipe.
function LeagueDetail({ m, ask, flash, onGone, onTeam, onReplay, reload = 0 }) {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const load = useCallback(() => refreshLeague(m).then(
    (d) => { if (!alive.current) return; setData(d); setProblem(null); updateLeague(m.code, { name: d.league.name, settings: d.league.settings }); },
    (x) => { if (alive.current) setProblem(x); },
  ), [m]);
  useEffect(() => {
    load();
    // les amis qui arrivent, valident, la journée qui se joue : relu chaque minute tant que la fenêtre est à l'écran
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => clearInterval(t);
  }, [load, reload]);

  const act = async (fn, after) => {
    setBusy(true);
    try {
      await fn();
      if (after) after();
    } catch (x) {
      flash(x.message, 'warn');
    }
    if (alive.current) setBusy(false);
  };
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); flash(`${what} copié.`); } catch { flash(`${what} : ${text}`); }
  };

  if (!data) {
    const gone = problem && (problem.status === 401 || problem.status === 404);
    return (
      <section className="dir-card">
        <h3>{m.name || m.code}</h3>
        <p className="dir-note">{!problem ? 'Chargement du championnat…' : gone ? 'Ce championnat a fermé, ou ton club n’en fait plus partie.' : problem.message}</p>
        {gone && <button type="button" className="btn ghost" onClick={() => { forgetLeague(m.code); onGone(); }}>Retirer de mes championnats</button>}
        {problem && !gone && <button type="button" className="btn ghost" onClick={load}>Réessayer</button>}
      </section>
    );
  }

  const { league, members, me } = data;
  const creator = league.creator === me.id;
  const clubs = leagueClubs(league, members);
  const lobby = league.status === 'lobby';
  const rounds = leagueRounds(league);
  const link = inviteLink(league.code);
  const humans = clubs.filter((c) => c.human);

  const leave = () => ask({
    tone: 'danger',
    title: lobby ? (creator ? 'Fermer la salle d’attente ?' : 'Quitter la salle d’attente ?') : `Quitter ${league.name} ?`,
    text: lobby
      ? (creator ? 'Le championnat est supprimé pour tout le monde : tes amis devront en rejoindre un autre.' : 'Ta place se libère. Tu pourras revenir avec le code tant que la saison n’a pas commencé.')
      : `L’ordinateur reprend ${withArticle(me.club.name)} jusqu’au bout. Ton accès est effacé : tu ne pourras pas revenir dans ce championnat.`,
    confirmLabel: lobby && creator ? 'Fermer la salle' : 'Quitter',
    cancelLabel: 'Rester',
    onConfirm: () => act(() => leaveLeague(m), () => { forgetLeague(m.code); onGone(lobby && creator ? `Le championnat ${league.name} est fermé.` : `Tu as quitté le championnat ${league.name}.`); }),
  });
  const start = () => {
    const free = LEAGUE_CLUBS - members.length;
    ask({
      title: `Lancer ${league.name} ?`,
      text: `Plus personne ne pourra s’inscrire${free ? `, et ${free > 1 ? `les ${free} places libres iront` : 'la place libre ira'} à l’ordinateur` : ''}. La 1re journée se jouera dès que tous auront validé leur équipe, au plus tard à ${hourText(league.settings.hour, league.settings.minute)}.`,
      confirmLabel: 'Lancer la saison',
      cancelLabel: 'Attendre encore',
      onConfirm: () => act(() => startLeague(m), () => { flash('La saison est lancée.'); load(); }),
    });
  };
  const kick = (c) => ask({
    tone: 'danger',
    title: `Retirer ${c.pseudo} ?`,
    text: `${capitalize(withArticle(c.name))} ${isPluralClub(c.name) ? 'quittent' : 'quitte'} la salle d’attente. ${c.pseudo} pourra revenir avec le code.`,
    confirmLabel: 'Retirer',
    cancelLabel: 'Garder',
    onConfirm: () => act(() => kickMember(m, c.member), load),
  });

  return (
    <>
      <section className="dir-card lig-top">
        <div className="lig-head">
          <LeagueLogo name={league.name} settings={league.settings} className="lig-head-logo" full />
          <span>
            <strong>{league.name}</strong>
            <em>{lobby ? 'Salle d’attente' : `Saison ${league.season} · journée ${Math.min(league.round + 1, rounds)} / ${rounds}`} · code{'\u00a0'}<b className="lig-code-inline">{league.code}</b></em>
            <small>{league.settings.format === 'single' ? 'Aller simple' : 'Aller-retour'} · journées au plus tard à {hourText(league.settings.hour, league.settings.minute)}, heure du créateur</small>
          </span>
        </div>
      </section>

      {lobby ? (
        <>
          <section className="dir-card lig-invite">
            <SectionHead label="Invite tes amis" aside={`${members.length} / ${LEAGUE_CLUBS}`} />
            <p className="lig-bigcode" aria-label={`Code ${league.code.split('').join(' ')}`}>{league.code}</p>
            <div className="lig-actions">
              <button type="button" className="btn btn-sm" onClick={() => copy(link, 'Lien d’invitation')}>Copier le lien</button>
              {typeof navigator.share === 'function' && (
                <button type="button" className="btn btn-sm ghost" onClick={() => navigator.share({ title: `${league.name} · FootOFF Empire`, text: `Rejoins mon championnat ${league.name} sur FootOFF Empire (code ${league.code}).`, url: link }).catch(() => {})}>Partager</button>
              )}
              <button type="button" className="btn btn-sm ghost" onClick={() => copy(league.code, 'Code')}>Copier le code</button>
            </div>
          </section>
          <section className="lig-block">
            <SectionHead label="Les clubs" aside="deux amis au moins pour lancer" />
            <ul className="lig-clubs">
              {clubs.map((c) => (c.open ? (
                <li key={c.slot} className="open"><span className="lig-slot" aria-hidden="true" /><span className="lig-who"><strong>Place libre</strong><em>l’ordinateur la prendra au coup d’envoi</em></span></li>
              ) : (
                <li key={c.slot} className={c.member === me.id ? 'me' : ''}>
                  <ClubMark club={c} className="lig-club-crest" />
                  <span className="lig-who"><strong>{c.name}</strong><em>{c.pseudo}{c.member === league.creator ? ' · créateur' : ''}{c.member === me.id ? ' · toi' : ''}</em></span>
                  {creator && c.member !== me.id && <button type="button" className="linkbtn" disabled={busy} onClick={() => kick(c)}>Retirer</button>}
                </li>
              )))}
            </ul>
          </section>
          {creator ? (
            <div className="lig-actions">
              <button type="button" className="btn" disabled={busy || members.length < LEAGUE_MIN_HUMANS} onClick={start}>Lancer la saison</button>
              {members.length < LEAGUE_MIN_HUMANS && <p className="dir-note">En attente d’au moins un ami.</p>}
            </div>
          ) : <p className="dir-note">Le créateur lancera la saison quand tout le monde sera là.</p>}
          <p className="dir-note">Une salle d’attente jamais lancée ferme d’elle-même au bout de 48 heures.</p>
        </>
      ) : (
        <RunningLeague league={league} clubs={clubs} humans={humans} results={data.results} world={data.world} worldBefore={data.worldBefore} me={me} m={m} onTeam={(t) => onTeam({ ...t, m, world: data.world })} onReplay={onReplay} flash={flash} onSaved={load} />
      )}

      {!lobby && (
        <section className="dir-card lig-resume">
          <SectionHead label="Code de reprise" />
          <p className="dir-note">Pour retrouver ton club sur un autre appareil. Garde&#8209;le pour toi : il donne la main sur ton club.</p>
          {showCode && <code className="lig-secret">{resumeCodeOf(m)}</code>}
          <div className="lig-actions">
            <button type="button" className="btn btn-sm ghost" onClick={() => setShowCode((s) => !s)}>{showCode ? 'Masquer' : 'Afficher'}</button>
            <button type="button" className="btn btn-sm ghost" onClick={() => copy(resumeCodeOf(m), 'Code de reprise')}>Copier</button>
          </div>
        </section>
      )}
      <button type="button" className="linkbtn lig-leave" disabled={busy} onClick={leave}>
        {lobby ? (creator ? 'Fermer la salle d’attente' : 'Quitter la salle d’attente') : 'Quitter ce championnat'}
      </button>
    </>
  );
}

// Saison en cours : la journée (échéance, qui a validé), ses matchs, le classement, le palmarès de la ligue.
function RunningLeague({ league, clubs, humans, results, world, worldBefore, me, m, onTeam, onReplay, flash, onSaved }) {
  const rounds = leagueRounds(league);
  const table = leagueTable(clubs, results);
  const fixtures = leagueFixtures(league)[league.round] || [];
  const bySlot = new Map(clubs.map((c) => [c.slot, c]));
  const mine = clubs.find((c) => c.member === me.id);
  const played = results.length;
  const pair = mine && fixtures.find(([h, a]) => h === mine.slot || a === mine.slot);
  const atHome = pair && pair[0] === mine.slot;
  const opp = pair && bySlot.get(atHome ? pair[1] : pair[0]);
  return (
    <>
      {mine && opp && (
        <section className={`dir-card lig-team ${mine.validated ? 'ok' : ''}`}>
          <SectionHead label="Ton équipe" aside={mine.validated ? 'validée' : 'à valider'} />
          <div className="lig-vs">
            <ClubMark club={mine} className="lig-vs-crest" />
            <span><strong>{atHome ? 'À domicile' : 'À l’extérieur'}</strong><em>Adversaire · {opp.name}{opp.human ? ` · ${opp.pseudo}` : ''}</em></span>
            <ClubMark club={opp} className="lig-vs-crest" />
          </div>
          <button type="button" className={`btn ${mine.validated ? 'ghost' : ''}`} onClick={() => onTeam({ league, slot: mine.slot, opp, atHome, validated: mine.validated })}>
            {mine.validated ? 'Modifier mon équipe' : 'Préparer mon équipe'}
          </button>
          <p className="dir-note">
            Onze, dispositif et tactique restent cachés à ton adversaire.
            {mine.validated
              ? ` Tu peux encore les modifier${league.deadline ? ` jusqu’à ${deadlineText(league.deadline)}` : ''}.`
              : ' Sans validation à l’heure, ton équipe est composée d’office.'}
          </p>
        </section>
      )}
      <section className="dir-card lig-round">
        <SectionHead label={`Journée ${Math.min(league.round + 1, rounds)} / ${rounds}`} aside={league.deadline ? `au plus tard ${deadlineText(league.deadline)}` : null} />
        <ul className="lig-ready">
          {humans.map((c) => (
            <li key={c.slot} className={c.validated ? 'ok' : ''}>
              {c.validated ? <IconCheck /> : <i aria-hidden="true" />}
              <span>{c.pseudo}{c.member === me.id ? ' · toi' : ''}</span>
              <em>{c.validated ? 'équipe validée' : c.active ? 'à valider' : 'absent · l’ordinateur joue pour lui'}</em>
            </li>
          ))}
        </ul>
        <ul className="lig-fixtures">
          {fixtures.map(([h, a]) => {
            const home = bySlot.get(h);
            const away = bySlot.get(a);
            const ours = h === mine?.slot || a === mine?.slot;
            return (
              <li key={`${h}-${a}`} className={ours ? 'me' : ''}>
                <span className="lig-fx-team"><ClubMark club={home} className="lig-fx-crest" />{home.name}</span>
                <b>–</b>
                <span className="lig-fx-team away">{away.name}<ClubMark club={away} className="lig-fx-crest" /></span>
              </li>
            );
          })}
        </ul>
      </section>
      {mine && <MyClub league={league} world={world} startWorld={worldBefore(0)} slot={mine.slot} m={m} validated={mine.validated} lastTrain={results[results.length - 1]?.train?.[mine.slot]} flash={flash} onSaved={onSaved} />}
      {played > 0 && <Results league={league} clubs={clubs} results={results} worldBefore={worldBefore} bySlot={bySlot} mine={mine} onReplay={onReplay} flash={flash} />}
      <section className="lig-block">
        <SectionHead label="Classement" aside={played ? `après ${plural(played, 'journée')}` : 'avant la 1re journée'} />
        <table className="table standings lig-table">
          <thead>
            <tr><th>#</th><th>Club</th><th>J</th><th className="t-wdl">G</th><th className="t-wdl">N</th><th className="t-wdl">P</th><th>Diff</th><th>Pts</th></tr>
          </thead>
          <tbody>
            {table.map((t, i) => (
              <tr key={t.slot} className={t.member === me.id ? 'me' : ''}>
                <td className="t-pos">{i + 1}</td>
                <td className="t-club">
                  <span className="lig-tclub">
                    <ClubMark club={t} className="t-crest" />
                    <span className="lig-tname"><span className="t-name">{t.name}</span><em>{t.human ? t.pseudo : AI_PSEUDO}</em></span>
                  </span>
                </td>
                <td>{t.played}</td>
                <td className="t-wdl">{t.w}</td><td className="t-wdl">{t.d}</td><td className="t-wdl">{t.l}</td>
                <td>{t.gd > 0 ? `+${t.gd}` : t.gd < 0 ? `−${-t.gd}` : '0'}</td>
                <td className="t-pts">{t.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {league.honours?.length > 0 && (
        <section className="lig-block">
          <SectionHead label="Palmarès de la ligue" />
          <ul className="honours">
            {[...league.honours].reverse().map((h, i) => <li key={i}><span>Saison {h.season}</span><em>{h.club}</em><b>{h.pseudo || ''}</b></li>)}
          </ul>
        </section>
      )}
    </>
  );
}

// Ton club : la séance de la semaine (un joueur par ligne, sur la catégorie choisie ; simulée au gain moyen, la même
// chez chaque ami, faite après le match), puis l'effectif (note, âge, progrès depuis le début de la saison) et le
// budget. La séance part avec l'équipe validée ; si l'équipe est déjà validée depuis cet appareil, elle est renvoyée.
const LINE_NAMES = { G: 'Gardien', D: 'Défense', M: 'Milieu', A: 'Attaque' };
const signed2 = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2).replace('.', ',')}`;
function MyClub({ league, world, startWorld, slot, m, validated, lastTrain, flash, onSaved }) {
  const squads = useMemo(() => squadsOf(league, world), [league, world]);
  const start = useMemo(() => squadsOf(league, startWorld), [league, startWorld]);
  const players = squads[slot];
  const byId = new Map(players.map((p) => [p.id, p]));
  const was = new Map(start[slot].map((p) => [p.id, playerRating(p)]));
  const money = world?.clubs?.[slot]?.money ?? START_BUDGET;
  const scale = paceOfLeague(league);
  const saved = trainingPlan(players, m.draft?.train);
  const [plan, setPlan] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);
  const sentHere = validated && m.draft?.sent === `${league.season}:${league.round}`;
  const choose = (pos, patch) => { setPlan((x) => ({ ...x, [pos]: { ...x[pos], ...patch } })); uiSound('move'); };
  const save = async () => {
    setBusy(true);
    const draft = { ...(m.draft || {}), train: plan };
    try {
      if (sentHere) {
        const sheet = cleanSheet(m.draft, players);
        await sendSheet(m, league.season, league.round, { formation: sheet.formation, lineup: sheet.lineup, tactic: sheet.tactic, train: plan });
      }
      updateLeague(m.code, { draft });
      flash(sentHere ? 'Séance enregistrée avec ton équipe.' : 'Séance enregistrée : elle partira avec ton équipe.');
      onSaved();
    } catch (x) {
      flash(x.message, 'warn');
    }
    setBusy(false);
  };
  return (
    <>
      <section className="dir-card lig-train">
        <SectionHead label="Séance de la semaine" aside="après le match" />
        <ul className="lig-train-rows">
          {LINES.map((pos) => {
            const pick = plan[pos];
            const p = pick && byId.get(pick.id);
            if (!p) return null;
            const gain = sessionPreview(p, pick.cat, scale);
            return (
              <li key={pos}>
                <span className="lig-train-line">{LINE_NAMES[pos]}</span>
                <select value={pick.id} aria-label={`${LINE_NAMES[pos]} : joueur`} onChange={(e) => choose(pos, { id: Number(e.target.value) })}>
                  {players.filter((q) => q.pos === pos).map((q) => <option key={q.id} value={q.id}>{q.name} · {fmtRating(playerRating(q))}</option>)}
                </select>
                <em className={gain > 0.0005 ? 'up' : ''}>{gain > 0.0005 ? signed2(gain) : 'au plafond'}</em>
                <div className="segmented lig-cats" role="radiogroup" aria-label={`${LINE_NAMES[pos]} : catégorie`}>
                  {Object.entries(catsFor(pos)).map(([id, c]) => (
                    <button key={id} type="button" role="radio" aria-checked={pick.cat === id} className={pick.cat === id ? 'on' : ''} onClick={() => choose(pos, { cat: id })}>{c.short}</button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {lastTrain?.length > 0 && (
          <p className="dir-note">Dernière séance · {lastTrain.map(([id, , g]) => `${byId.get(id)?.name || '?'} ${signed2(g / 1000)}`).join(' · ')}</p>
        )}
        <div className="lig-actions">
          <button type="button" className="btn btn-sm" disabled={busy || !dirty} onClick={save}>Enregistrer la séance</button>
          {!sentHere && <small className="lig-hint">Elle partira avec ton équipe : valide-la avant l’heure.</small>}
        </div>
      </section>
      <section className="lig-block">
        <SectionHead label="Ton effectif" aside={`${players.length} joueurs · budget ${fmtMoney(money)}`} />
        <ul className="lig-squad">
          {LINES.flatMap((pos) => players.filter((p) => p.pos === pos)).map((p) => {
            const r = playerRating(p);
            const d = r - (was.get(p.id) ?? r);
            return (
              <li key={p.id}>
                <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
                <span className="lig-who"><strong>{p.name}</strong><em>{p.age} ans · potentiel {fmtRating(p.pot)}</em></span>
                <span className="lig-rate"><b>{fmtRating(r)}</b>{d >= 0.005 && <em>{signed2(d)}</em>}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

// Résultats de la saison, journée par journée (la dernière d'abord) : les scores, notre match en or ; un match s'ouvre
// sur ses buts, minute par minute, de chaque côté, et peut se revoir en 3D avec ses temps forts.
function Results({ league, clubs, results, worldBefore, bySlot, mine, onReplay, flash }) {
  const last = results[results.length - 1].round;
  const [round, setRound] = useState(last);
  const [open, setOpen] = useState(null);
  useEffect(() => { setRound(last); setOpen(null); }, [last]);
  const r = results.find((x) => x.round === round) || results[results.length - 1];
  return (
    <section className="lig-block lig-results">
      <SectionHead label="Résultats" aside={`journée ${r.round + 1}`} />
      {results.length > 1 && (
        <div className="chips lig-rounds" role="tablist" aria-label="Journée">
          {[...results].reverse().map((x) => (
            <button key={x.round} type="button" role="tab" aria-selected={x.round === r.round} className={x.round === r.round ? 'active' : ''} onClick={() => { setRound(x.round); setOpen(null); uiSound('tab'); }}>J{x.round + 1}</button>
          ))}
        </div>
      )}
      <ul className="lig-scores">
        {(r.matches || []).map((x) => {
          const home = bySlot.get(x.h);
          const away = bySlot.get(x.a);
          if (!home || !away) return null;
          const ours = mine && (x.h === mine.slot || x.a === mine.slot);
          const key = `${x.h}-${x.a}`;
          const goals = x.g || [];
          return (
            <li key={key} className={ours ? 'me' : ''}>
              <button type="button" className="lig-score" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                <span className="lig-fx-team"><ClubMark club={home} className="lig-fx-crest" />{home.name}</span>
                <b>{x.hg} – {x.ag}</b>
                <span className="lig-fx-team away">{away.name}<ClubMark club={away} className="lig-fx-crest" /></span>
              </button>
              {open === key && (
                <div className="lig-detail">
                  {goals.length > 0 ? (
                    <ul className="lig-goals">
                      {goals.map((g, i) => <li key={i} className={g.s ? 'away' : 'home'}><em>{g.m}′</em>{g.p}{g.pen ? ' (penalty)' : ''}</li>)}
                    </ul>
                  ) : <p className="dir-note">Aucun but.</p>}
                  {onReplay && x.sh && (
                    <button type="button" className="btn btn-sm ghost" onClick={() => {
                      const rp = replayOf(league, clubs, r.round, x, worldBefore(r.round));
                      if (rp) { uiSound('select'); onReplay(rp); } else flash('Ce match ne peut plus être revu avec cette version du jeu. Son résumé reste disponible.', 'warn');
                    }}><IconPlay className="fill" /> Revoir le match en 3D</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------------- la fenêtre

// state : la partie en cours (peut manquer : invité arrivé par un lien) ; le Siège construit permet de créer.
// invite : code d'un lien d'invitation, ouvert d'emblée sur « rejoindre ». overTitle : ouverte depuis l'écran titre.
// onReplay : revoir un match en 3D (App, l'écran du direct en rejeu) ; replaying : un match est en train d'être revu.
export function LeagueView({ state, ask, invite = null, overTitle = false, onClose, onReplay, replaying = false }) {
  const [mine, setMine] = useState(myLeagues);
  const [view, setView] = useState(() => (invite ? { id: 'join', code: invite } : { id: 'home' }));
  const [note, setNote] = useState(null); // retour dans la fenêtre : { text, tone }
  const canBuild = (state?.buildings?.league || 0) > 0;
  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(null), 4200);
    return () => clearTimeout(t);
  }, [note]);
  const flash = (text, tone = 'ok') => setNote({ text, tone, at: Date.now() });
  const home = (text = null) => {
    setMine(myLeagues());
    setView({ id: 'home' });
    if (text) flash(text);
  };
  const open = (m, text = null) => {
    uiSound('select');
    setMine(myLeagues());
    setView({ id: 'league', m });
    if (text) flash(text);
  };
  const back = () => { uiSound('back'); home(); };
  // Son équipe de la journée : l'avant-match du jeu (onze, dispositif, tactique, pronostic), posé sur tout l'écran ;
  // la dernière équipe choisie revient d'une journée à l'autre (draft, sur l'appareil).
  const [team, setTeam] = useState(null); // { m, league, world, slot, opp, atHome, validated }
  const [reload, setReload] = useState(0);
  const teamScreen = team && (() => {
    const squads = squadsOf(team.league, team.world);
    const m = myLeagues().find((x) => x.code === team.m.code) || team.m;
    const draft = cleanSheet(m.draft, squads[team.slot]);
    const rounds = leagueRounds(team.league);
    return {
      state: { clubName: m.club.name, crest: m.club.crest, players: squads[team.slot], lineup: draft.lineup, formation: draft.formation, tactic: draft.tactic, trophies: [], buildings: {} },
      ctx: {
        comp: 'friends', home: team.atHome, label: `${team.league.name} · journée ${team.league.round + 1} / ${rounds}`,
        goLabel: team.validated ? 'Valider ces changements' : 'Valider mon équipe',
        opp: { name: team.opp.name, crest: team.opp.crest, strength: lineupRating(squads[team.opp.slot], autoSheet(squads[team.opp.slot]).lineup, '433') },
      },
    };
  })();
  const validate = async (lineup, tactic, formation) => {
    const { league } = team;
    const m = myLeagues().find((x) => x.code === team.m.code) || team.m;
    const train = m.draft?.train || null; // la séance de la semaine part avec l'équipe
    try {
      await sendSheet(m, league.season, league.round, { formation, lineup, tactic, ...(train ? { train } : {}) });
      updateLeague(m.code, { draft: { formation, lineup, tactic, train, sent: `${league.season}:${league.round}` } });
      setMine(myLeagues());
      setTeam(null);
      uiSound('select');
      flash(`Équipe validée pour la journée ${league.round + 1}.`);
      setReload((n) => n + 1);
    } catch (x) {
      setTeam(null);
      flash(x.message, 'warn');
      setReload((n) => n + 1);
    }
  };
  const current = view.id === 'league' ? (mine.find((x) => x.code === view.m.code) || view.m) : null;
  const eyebrow = view.id === 'league' ? `Ton club · ${current.club.name}` : `Championnats entre amis · ${mine.length} / ${MAX_MY_LEAGUES}`;
  return (
    <>
      {overTitle && <div className="lig-scrim" onClick={onClose} aria-hidden="true" />}
      <Panel
        id="league"
        title="Siège de la Ligue"
        eyebrow={eyebrow}
        className={`lig ${overTitle ? 'over-title' : ''}`}
        onClose={onClose}
        onEscape={team || replaying ? () => {} : view.id !== 'home' ? back : undefined}
        toolbar={note ? <p className={`lig-note ${note.tone}`} role="status" key={note.at}>{note.text}</p> : null}
      >
        {view.id !== 'home' && (
          <button type="button" className="lig-back" onClick={back}><IconChevronLeft /> Mes championnats</button>
        )}
        {view.id === 'home' && (
          <Home
            mine={mine}
            canBuild={canBuild}
            onOpen={(m) => open(m)}
            onCreate={() => { uiSound('select'); setView({ id: 'create' }); }}
            onJoin={() => { uiSound('select'); setView({ id: 'join', code: '' }); }}
            onResume={() => { uiSound('select'); setView({ id: 'resume' }); }}
          />
        )}
        {view.id === 'create' && <CreateForm onDone={open} />}
        {view.id === 'join' && <JoinForm initialCode={view.code} mine={mine} onDone={open} onOpen={(m) => open(m)} />}
        {view.id === 'resume' && <ResumeForm mine={mine} onDone={open} />}
        {view.id === 'league' && <LeagueDetail key={current.code} m={current} ask={ask} flash={flash} onGone={home} onTeam={setTeam} onReplay={onReplay} reload={reload} />}
      </Panel>
      {teamScreen && createPortal(
        <div className="lig-match team"><PreMatch state={teamScreen.state} ctx={teamScreen.ctx} onCancel={() => setTeam(null)} onKickoff={validate} /></div>,
        document.querySelector('.game') || document.body,
      )}
    </>
  );
}
