import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from './panels';
import { SectionHead } from './kit';
import { COLOR_KEYS, ClubCrest, ColorValue, Crest, CrestArt } from './crest';
import { CREST_ROWS } from './title';
import { IconCheck, IconChevron, IconChevronLeft, IconClock, IconDice, IconPlay, IconPlus, IconRefresh, IconUsers } from './icons';
import { leftText, mmss, useCountdown } from './hud';
import { typeSound, uiSound } from './uisound';
import { capitalize, isPluralClub, randomClubName, withArticle } from '../game/names';
import { CLUB_BLACK, clubInitials, defaultCrest, hexLum, normalizeCrest, randomCrest, withStyle } from '../game/crest';
import {
  AI_LABEL, AI_PSEUDO, LEAGUE_CLUBS, LEAGUE_COLORS, LEAGUE_MIN_HUMANS, MAX_MY_LEAGUES, cleanCode, deadlineText,
  deviceZone, hourText, isLeagueCode, leagueClubs, leagueFixtures, leagueLang, leagueRounds, leagueTable, replayOf,
} from '../game/league';
import {
  createLeague, deadlineAt, deleteLeague, forgetLeague, inviteLink, joinLeague, kickMember, kickoffAt, leagueInfo, leagueState, leaveLeague, myLeagues, pulseUrgent, userActive, watchPulse,
  parseResumeCode, refreshLeague, rememberLeague, resumeCodeOf, startLeague, updateLeague,
} from '../game/leagueNet';
import { dropLeagueClub, leagueClubProgress } from '../game/leagueClub';
import { cloudNote, dropSync, syncOf } from '../game/leagueCloud';
import { colon, LANGS, LANG_NAMES, gameLang, langName, plural, reloadInLang, t, tn, tr } from '../i18n/index';

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
const okPseudo = (p) => okText(p, 20) && ![AI_PSEUDO, AI_LABEL].includes(clean(p)) && clean(p).toLowerCase() !== AI_PSEUDO.toLowerCase() && clean(p).toLowerCase() !== AI_LABEL.toLowerCase();
const LOGO_ROWS = CREST_ROWS.filter(([key]) => key !== 'ground' && !COLOR_KEYS.includes(key)); // le logo : les couleurs de la ligue
const LEAGUE_NAMES = [
  t('Ligue du Quartier'), t('Championnat des Copains'), t('Trophée du Dimanche'), t('Ligue de la Place'), t('Coupe des Voisins'),
  t('Championnat du Vendredi'), t('Ligue des Lumières'), t('Ligue des Anciens'), t('Trophée de la Rue'), t('Ligue du Soir'),
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
  return <CrestArt spec={spec} initials={clubInitials(name)} name={name} short={name} full={full} className={`lig-logo ${className}`} title={t('Logo : {name}', { name })} />;
}

// Club d'une ligue : l'écusson d'un ami à ses couleurs, celui d'un club de l'ordinateur tiré de son nom.
function ClubMark({ club, className = '' }) {
  return club.crest ? <ClubCrest crest={club.crest} name={club.name} className={className} /> : <Crest name={club.name} className={className} />;
}

// Une ligne de choix (style, forme, couleurs…) : flèches à la souris ou au doigt, gauche / droite au clavier. onPick :
// une ligne de couleur, dont la pastille ouvre le sélecteur du système.
function PickRow({ label, list, value, onStep, onPick = null }) {
  const cur = list.find(([id]) => id === value) || list[0];
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${label}${colon()}${cur[1]}`}
      className="ts-pick"
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); onStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onStep(1); }
      }}
    >
      <span className="ts-pick-label">{label}</span>
      <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={t('{label} précédent', { label })} onClick={() => onStep(-1)}><IconChevronLeft /></button>
      {onPick ? <ColorValue value={value} label={label} onPick={onPick} /> : <span className="ts-pick-value">{cur[1]}</span>}
      <button type="button" tabIndex={-1} className="ts-pick-arrow" aria-label={t('{label} suivant', { label })} onClick={() => onStep(1)}><IconChevron /></button>
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
        <button type="button" className="ts-dice" onClick={() => { onChange({ ...randomCrest(), primary: crest.primary, secondary: crest.secondary }); uiSound('move'); }} aria-label={t('Écusson au hasard')} title={t('Écusson au hasard')}><IconDice /></button>
      </div>
      <div className="ts-crest-rows">
        <span className="ts-field-label">{label}</span>
        {rows.map(([key, lab, listOf]) => (
          <PickRow key={key} label={lab} list={listOf(crest)} value={crest[key]} onStep={(d) => step(key, listOf(crest), d)} onPick={COLOR_KEYS.includes(key) ? (v) => onChange({ ...crest, [key]: v }) : null} />
        ))}
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
        <input value={value} onChange={(e) => { typeSound(e, value); onChange(e.target.value); }} maxLength={max} autoComplete="off" spellCheck={false} placeholder={placeholder} />
        {dice && <button type="button" className="ts-dice" onClick={() => { dice(); uiSound('move'); }} aria-label={t('{label} : autre proposition', { label })} title={t('Autre proposition')}><IconDice /></button>}
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
      <SectionHead label={t('Ton club')} aside={t('un club de quartier neuf, à égalité')} />
      <Field
        label={t('Ton pseudo')}
        value={pseudo}
        onChange={setPseudo}
        max={20}
        placeholder={t('Comment tes amis te connaissent')}
        hint={pseudoTaken ? t('Ce pseudo est déjà pris dans ce championnat.') : clean(pseudo).toLowerCase() === AI_PSEUDO.toLowerCase() ? t('Ce pseudo est réservé aux clubs de l’ordinateur.') : null}
      />
      <Field label={t('Nom du club')} value={club} onChange={setClub} max={32} placeholder={t('Nom de ton club')} dice={() => setClub(randomClubName())} hint={clubTaken ? t('Ce nom de club est déjà pris dans ce championnat.') : null} />
      <CrestPicker
        crest={crest}
        onChange={setCrest}
        rows={CREST_ROWS}
        label={t('Écusson · or et noir FootOFF, ou tes couleurs')}
        preview={<ClubCrest crest={crest} name={clean(club) || t('Ton club')} className="ts-crest-art" full title={t('Écusson de {v}', { v: clean(club) || t('ton club') })} />}
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
      <p className="dir-intro">{t('Huit clubs de quartier, neufs et à égalité : le tien, ceux de tes amis et l’ordinateur aux places libres. Une journée par jour, chacun gère son club.')}</p>
      {mine.length === 0 ? (
        <section className="dir-card lig-empty">
          <h3>{t('Aucun championnat pour l’instant')}</h3>
          <p className="dir-note">{canBuild ? t('Crée le tien et envoie le lien à tes amis, ou rejoins le leur avec leur code.') : t('Un ami t’a donné un code ? Rejoins son championnat. Pour créer le tien, construis le Siège de la Ligue en Élite.')}</p>
        </section>
      ) : (
        <ul className="lig-list">
          {mine.map((m) => {
            const d = live[m.code];
            const league = d?.league;
            let status = t('Mise à jour…');
            if (d?.error) status = d.error.status === 401 || d.error.status === 404 ? t('Introuvable : ce championnat a fermé') : t('Hors ligne pour l’instant');
            else if (league?.status === 'lobby') status = t('Salle d’attente · {plural} sur {LEAGUE_CLUBS}', { plural: plural(d.members.length, 'club'), LEAGUE_CLUBS });
            else if (league) {
              const ready = d.members.find((x) => x.id === m.id)?.validated;
              status = t('Saison {season} · journée {min} / {leagueRounds} · {v}', { season: league.season, min: Math.min(league.round + 1, leagueRounds(league)), leagueRounds: leagueRounds(league), v: ready ? t('équipe validée') : t('équipe à valider{v}', { v: league.deadline ? t(' avant {deadlineText}', { deadlineText: deadlineText(league.deadline) }) : '' }) });
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
        {canBuild && <button type="button" className="btn" disabled={full} onClick={onCreate}>{tr('<0/> Créer un championnat', [<IconPlus />])}</button>}
        <button type="button" className={`btn ${canBuild ? 'ghost' : ''}`} disabled={full} onClick={onJoin}>{tr('<0/> Rejoindre avec un code', [<IconUsers />])}</button>
      </div>
      {full && <p className="dir-note">{t('Trois championnats à la fois au plus : quittes-en un pour en rejoindre un autre.')}</p>}
      <button type="button" className="linkbtn lig-resume-link" disabled={full} onClick={onResume}>{t('Reprendre mon club sur cet appareil (code de reprise)')}</button>
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
  const [lang, setLang] = useState(gameLang); // langue du championnat : celle de la partie en cours, par défaut
  const [pseudo, setPseudo] = useState('');
  const [club, setClub] = useState(randomClubName);
  const [crest, setCrest] = useState(() => normalizeCrest(randomCrest()));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const ok = okText(name, 40) && okPseudo(pseudo) && okText(club, 32);
  const settings = { crest: logo, colors: LEAGUE_COLORS.find(([id]) => id === colors)[2], format, hour, minute, lang };
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
      // un serveur qui ne garde pas encore la langue : le championnat se joue en français, et la fenêtre le dit
      onDone(m, leagueLang(d.league) === lang ? t('Championnat créé : envoie le lien à tes amis.')
        : t('Championnat créé en français : le serveur ne garde pas encore la langue choisie. Envoie le lien à tes amis.'));
    } catch (x) {
      setProblem(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={submit}>
      <SectionHead label={t('Le championnat')} />
      <Field label={t('Nom du championnat')} value={name} onChange={setName} max={40} placeholder={t('Nom de ta ligue')} dice={() => setName((n) => stepIn(LEAGUE_NAMES.map((x) => [x, x]), n, 1))} />
      <CrestPicker
        crest={logo}
        onChange={setLogo}
        rows={LOGO_ROWS}
        label={t('Logo de la ligue')}
        preview={<LeagueLogo name={clean(name) || t('Ligue')} settings={settings} className="ts-crest-art" full />}
        extra={<PickRow label={t('Couleurs')} list={LEAGUE_COLORS} value={colors} onStep={(d) => { setColors((c) => stepIn(LEAGUE_COLORS, c, d)); uiSound('move'); }} />}
      />
      <div className="lig-field">
        <span className="ts-field-label">{t('Format')}</span>
        <div className="segmented lig-seg" role="radiogroup" aria-label={t('Format')}>
          {[['single', t('Aller simple'), 7], ['double', t('Aller-retour'), 14]].map(([id, label, n]) => (
            <button key={id} type="button" role="radio" aria-checked={format === id} className={format === id ? 'on' : ''} onClick={() => { setFormat(id); uiSound('move'); }}>
              {label}<small>{tr('<0/> journées', [n])}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="lig-field">
        <span className="ts-field-label">{t('Langue du championnat')}</span>
        <div className="segmented lig-seg lig-langs" role="radiogroup" aria-label={t('Langue du championnat')}>
          {LANGS.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? 'on' : ''} lang={l} onClick={() => { setLang(l); uiSound('move'); }}>{LANG_NAMES[l]}</button>
          ))}
        </div>
        <small className="lig-hint">{t('La même pour tous les amis : les noms des joueurs et des clubs de l’ordinateur y sont tirés, et chacun ouvre le championnat dans cette langue. Elle ne change plus ensuite.')}</small>
      </div>
      <div className="lig-field">
        <span className="ts-field-label">{t('Heure des journées')}</span>
        <span className="lig-time">
          <IconClock />
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label={t('Heure')}>
            {HOURS.map((h) => <option key={h} value={h}>{t('{h} h', { h })}</option>)}
          </select>
          <select value={minute} onChange={(e) => setMinute(Number(e.target.value))} aria-label={t('Minutes')}>
            {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
          </select>
        </span>
        <small className="lig-hint">{tr('Les journées se jouent au plus tard chaque jour à <0/> (heure de cet appareil). Dès que tous les amis ont validé leur équipe, un compte à rebours de dix minutes s’affiche pour tous, puis les matchs commencent ; une journée jouée ainsi en avance laisse jusqu’au lendemain pour la suivante. Un retardataire joue avec une équipe choisie pour lui.', [hourText(hour, minute)])}</small>
      </div>
      <ClubFields pseudo={pseudo} setPseudo={setPseudo} club={club} setClub={setClub} crest={crest} setCrest={setCrest} />
      <Problem text={problem} />
      <button type="submit" className="btn btn-xl" disabled={!ok || busy}>{busy ? t('Création…') : t('Créer le championnat')}</button>
      {!okPseudo(pseudo) && <small className="lig-hint">{t('Choisis ton pseudo pour créer le championnat.')}</small>}
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
  const [crest, setCrest] = useState(() => normalizeCrest(randomCrest()));
  const look = async (c) => {
    if (!isLeagueCode(c) || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setInfo(await leagueInfo(c));
    } catch (x) {
      setInfo(null);
      setProblem(x.status === 404 ? t('Aucun championnat avec ce code. Vérifie-le avec ton ami.') : x.message);
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
      onDone(m, t('C’est fait : {name} t’attend. Le créateur lancera la saison.', { name: d.league.name }));
    } catch (x) {
      setProblem(x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={info ? join : (e) => { e.preventDefault(); look(code); }}>
      <SectionHead label={t('Rejoindre un championnat')} />
      <Field label={t('Code du championnat')} value={code} mono max={6} placeholder={t('ABC234')} onChange={(v) => { setCode(cleanCode(v)); setInfo(null); setProblem(null); }} hint={t('Six signes, donnés par ton ami (ou déjà dans son lien).')} />
      {!info && <button type="submit" className="btn" disabled={!isLeagueCode(code) || busy}>{busy ? t('Recherche…') : t('Voir le championnat')}</button>}
      {info && (
        <section className="dir-card lig-info">
          <div className="lig-head">
            <LeagueLogo name={info.name} settings={info.settings} className="lig-head-logo" />
            <span>
              <strong>{info.name}</strong>
              <em>{tr('<0/> · au plus tard à <1/>, heure du créateur', [info.settings.format === 'single' ? t('Aller simple · 7 journées') : t('Aller-retour · 14 journées'), hourText(info.settings.hour, info.settings.minute)])}</em>
              <em>{t('Langue du championnat : {lang}', { lang: langName(leagueLang(info)) })}</em>
            </span>
          </div>
          <ul className="lig-mini">
            {info.clubs.map((c) => <li key={c.slot}><ClubMark club={c.club} className="lig-mini-crest" /><span>{c.club.name}<em>{c.pseudo}</em></span></li>)}
          </ul>
          <p className="dir-note">{info.status !== 'lobby' ? t('La saison a déjà commencé : demande au créateur de t’inviter dans un prochain championnat.') : info.open ? t('{plural} : l’ordinateur prendra celles qui resteront au coup d’envoi.', { plural: plural(info.open, 'place libre', 'places libres') }) : t('Ce championnat est complet.')}</p>
        </section>
      )}
      {member && (
        <div className="lig-actions">
          <p className="dir-note">{tr('Tu fais déjà partie de ce championnat, avec <0/>.', [member.club.name])}</p>
          <button type="button" className="btn" onClick={() => onOpen(member)}>{t('Ouvrir le championnat')}</button>
        </div>
      )}
      {info && !member && info.status === 'lobby' && info.open > 0 && (
        mine.length >= MAX_MY_LEAGUES
          ? <p className="dir-note">{t('Tu joues déjà trois championnats : quittes-en un pour rejoindre celui-ci.')}</p>
          : (
            <>
              <ClubFields pseudo={pseudo} setPseudo={setPseudo} club={club} setClub={setClub} crest={crest} setCrest={setCrest} taken={taken} />
              <button type="submit" className="btn btn-xl" disabled={!ok || busy}>{busy ? t('Inscription…') : t('Rejoindre le championnat')}</button>
              {!okPseudo(pseudo) && <small className="lig-hint">{t('Choisis ton pseudo pour rejoindre le championnat.')}</small>}
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
    if (mine.length >= MAX_MY_LEAGUES && !mine.some((m) => m.code === parsed.code)) { setProblem(t('Tu joues déjà trois championnats sur cet appareil : quittes-en un d’abord.')); return; }
    setBusy(true);
    setProblem(null);
    try {
      const d = await leagueState(parsed);
      const m = { ...parsed, pseudo: d.me.pseudo, club: d.me.club, name: d.league.name, settings: d.league.settings, at: Date.now() };
      rememberLeague(m);
      uiSound('select');
      onDone(m, t('{capitalize} {v} de retour sur cet appareil.', { capitalize: capitalize(withArticle(d.me.club.name)), v: isPluralClub(d.me.club.name) ? t('sont') : t('est') }));
    } catch (x) {
      setProblem(x.status === 401 || x.status === 404 ? t('Ce code ne correspond à aucun club : vérifie-le, ou il a peut-être quitté son championnat.') : x.message);
      setBusy(false);
    }
  };
  return (
    <form className="lig-form" onSubmit={submit}>
      <SectionHead label={t('Reprendre mon club')} />
      <p className="dir-intro">{t('Sur ton autre appareil, ouvre ton championnat : son code de reprise est en bas. Colle-le ici.')}</p>
      <Field label={t('Code de reprise')} value={raw} mono max={160} placeholder={t('ABC234.…')} onChange={(v) => { setRaw(v.trim()); setProblem(null); }} />
      <Problem text={problem || (raw && !parsed ? t('Ce n’est pas un code de reprise complet.') : null)} />
      <button type="submit" className="btn" disabled={!parsed || busy}>{busy ? t('Vérification…') : t('Reprendre mon club')}</button>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------- un championnat

// reload : relire tout de suite (équipe tout juste validée) ; onTeam : ouvrir l'avant-match pour valider son équipe.
// onPlayClub : jouer son club de ligue (App : la partie de ligue, comme une partie solo).
function LeagueDetail({ m, ask, flash, onGone, onReplay, onPlayClub, reload = 0 }) {
  const [data, setData] = useState(null);
  const dataRef = useRef(null);
  dataRef.current = data;
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
    // les amis qui arrivent, valident, font une offre ou y répondent, la journée qui se joue : vus en quelques secondes
    // (le pouls, 0.8.6), et relu de toute façon chaque minute tant que la fenêtre est à l'écran
    const stopPulse = watchPulse(m, load, () => pulseUrgent(dataRef.current));
    const t = setInterval(() => { if (userActive()) load(); }, 60000);
    return () => { clearInterval(t); stopPulse(); };
  }, [load, reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fresh, setFresh] = useState(false);
  const refresh = async () => { // « Actualiser » : relu tout de suite, à la demande
    setFresh(true);
    await load();
    if (alive.current) setTimeout(() => { if (alive.current) setFresh(false); }, 600);
  };

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
    try { await navigator.clipboard.writeText(text); flash(t('{what} copié.', { what })); } catch { flash(`${what}${colon()}${text}`); }
  };

  if (!data) {
    const gone = problem && (problem.status === 401 || problem.status === 404);
    return (
      <section className="dir-card">
        <h3>{m.name || m.code}</h3>
        <p className="dir-note">{!problem ? t('Chargement du championnat…') : gone ? t('Ce championnat a fermé, ou ton club n’en fait plus partie.') : problem.message}</p>
        {gone && <button type="button" className="btn ghost" onClick={() => { forgetLeague(m.code); dropLeagueClub(m.code); dropSync(m.code); onGone(); }}>{t('Retirer de mes championnats')}</button>}
        {problem && !gone && <button type="button" className="btn ghost" onClick={load}>{t('Réessayer')}</button>}
      </section>
    );
  }

  const { league, members, me } = data;
  const lang = leagueLang(league);
  if (league.status !== 'lobby' && lang !== gameLang()) { // ses clubs et ses joueurs portent des noms de sa langue
    return (
      <section className="dir-card">
        <h3>{league.name}</h3>
        <p className="dir-note">{t('Langue du championnat : {lang}. Les noms de ses joueurs et de ses clubs y sont tirés, les mêmes pour tous les amis : le jeu se recharge dans cette langue pour l’ouvrir.', { lang: langName(lang) })}</p>
        <button type="button" className="btn" onClick={() => reloadInLang(lang, { hub: m.code })}>{t('Ouvrir le championnat')}</button>
      </section>
    );
  }
  const creator = league.creator === me.id;
  const clubs = leagueClubs(league, members);
  const lobby = league.status === 'lobby';
  const rounds = leagueRounds(league);
  const link = inviteLink(league.code);
  const humans = clubs.filter((c) => c.human);

  const leave = () => ask({
    tone: 'danger',
    title: lobby ? (creator ? t('Fermer la salle d’attente ?') : t('Quitter la salle d’attente ?')) : t('Quitter {name} ?', { name: league.name }),
    text: lobby
      ? (creator ? t('Le championnat est supprimé pour tout le monde : tes amis devront en rejoindre un autre.') : t('Ta place se libère. Tu pourras revenir avec le code tant que la saison n’a pas commencé.'))
      : t('L’ordinateur reprend {withArticle} jusqu’au bout. Ton accès est effacé : tu ne pourras pas revenir dans ce championnat.', { withArticle: withArticle(me.club.name) }),
    confirmLabel: lobby && creator ? t('Fermer la salle') : t('Quitter'),
    cancelLabel: t('Rester'),
    onConfirm: () => act(() => leaveLeague(m), () => { forgetLeague(m.code); dropLeagueClub(m.code); dropSync(m.code); onGone(lobby && creator ? t('Le championnat {name} est fermé.', { name: league.name }) : t('Tu as quitté le championnat {name}.', { name: league.name })); }),
  });
  // suppression par le créateur (0.8.6) : pour tout le monde, définitive, confirmée en tapant le nom du championnat
  const remove = () => {
    const friends = humans.length - 1;
    ask({
      tone: 'danger',
      eyebrow: t('Suppression définitive'),
      title: t('Supprimer {name} pour tout le monde ?', { name: league.name }),
      text: t('Ton club, {v}le classement et le palmarès de ce championnat disparaissent. {v2}Rien ne pourra être récupéré.', { v: friends === 1 ? t('celui de ton ami, ') : tn(friends, '', 'ceux de tes {friends} amis, ', { friends }, friends > 1), v2: friends === 1 ? t('Ton ami verra qu’il a fermé. ') : tn(friends, '', 'Tes amis verront qu’il a fermé. ', {}, friends > 1) }),
      typed: league.name,
      confirmLabel: t('Supprimer'),
      cancelLabel: t('Garder'),
      onConfirm: () => act(() => deleteLeague(m, league.name), () => { forgetLeague(m.code); dropLeagueClub(m.code); dropSync(m.code); onGone(t('Le championnat {name} est supprimé.', { name: league.name })); }),
    });
  };
  const start = () => {
    const free = LEAGUE_CLUBS - members.length;
    ask({
      title: t('Lancer {name} ?', { name: league.name }),
      text: t('Plus personne ne pourra s’inscrire{v}. La 1re journée se jouera dix minutes après que tous auront validé leur équipe, au plus tard à {hourText}.', { v: free ? t(', et {tn} à l’ordinateur', { tn: tn(free, 'la place libre ira', 'les {free} places libres iront', { free }, free > 1) }) : '', hourText: hourText(league.settings.hour, league.settings.minute) }),
      confirmLabel: t('Lancer la saison'),
      cancelLabel: t('Attendre encore'),
      onConfirm: () => act(() => startLeague(m), () => { flash(t('La saison est lancée.')); load(); }),
    });
  };
  const kick = (c) => ask({
    tone: 'danger',
    title: t('Retirer {pseudo} ?', { pseudo: c.pseudo }),
    text: t('{capitalize} {v} la salle d’attente. {pseudo} pourra revenir avec le code.', { capitalize: capitalize(withArticle(c.name)), v: isPluralClub(c.name) ? t('quittent') : t('quitte'), pseudo: c.pseudo }),
    confirmLabel: t('Retirer'),
    cancelLabel: t('Garder'),
    onConfirm: () => act(() => kickMember(m, c.member), load),
  });

  return (
    <>
      <section className="dir-card lig-top">
        <div className="lig-head">
          <LeagueLogo name={league.name} settings={league.settings} className="lig-head-logo" full />
          <span>
            <strong>{league.name}</strong>
            <em>{tr('<0/> · code<1/><2/>', [lobby ? t('Salle d’attente') : t('Saison {season} · journée {min} / {rounds}', { season: league.season, min: Math.min(league.round + 1, rounds), rounds }), '\u00a0', <b className="lig-code-inline">{league.code}</b>])}</em>
            <small>{tr('<0/> · journées au plus tard à <1/>, heure du créateur', [league.settings.format === 'single' ? t('Aller simple') : t('Aller-retour'), hourText(league.settings.hour, league.settings.minute)])}</small>
          </span>
          <button type="button" className={`lig-refresh ${fresh ? 'spin' : ''}`} onClick={refresh} disabled={fresh} aria-label={t('Actualiser le championnat')} title={t('Actualiser')}><IconRefresh /></button>
        </div>
      </section>

      {lobby ? (
        <>
          <section className="dir-card lig-invite">
            <SectionHead label={t('Invite tes amis')} aside={`${members.length} / ${LEAGUE_CLUBS}`} />
            <p className="lig-bigcode" aria-label={t('Code {join}', { join: league.code.split('').join(' ') })}>{league.code}</p>
            <div className="lig-actions">
              <button type="button" className="btn btn-sm" onClick={() => copy(link, t('Lien d’invitation'))}>{t('Copier le lien')}</button>
              {typeof navigator.share === 'function' && (
                <button type="button" className="btn btn-sm ghost" onClick={() => navigator.share({ title: t('{name} · FootOFF Empire', { name: league.name }), text: t('Rejoins mon championnat {name} sur FootOFF Empire (code {code}).', { name: league.name, code: league.code }), url: link }).catch(() => {})}>{t('Partager')}</button>
              )}
              <button type="button" className="btn btn-sm ghost" onClick={() => copy(league.code, t('Code'))}>{t('Copier le code')}</button>
            </div>
          </section>
          <section className="lig-block">
            <SectionHead label={t('Les clubs')} aside={t('deux amis au moins pour lancer')} />
            <ul className="lig-clubs">
              {clubs.map((c) => (c.open ? (
                <li key={c.slot} className="open"><span className="lig-slot" aria-hidden="true" /><span className="lig-who"><strong>{t('Place libre')}</strong><em>{t('l’ordinateur la prendra au coup d’envoi')}</em></span></li>
              ) : (
                <li key={c.slot} className={c.member === me.id ? 'me' : ''}>
                  <ClubMark club={c} className="lig-club-crest" />
                  <span className="lig-who"><strong>{c.name}</strong><em>{c.pseudo}{c.member === league.creator ? t(' · créateur') : ''}{c.member === me.id ? t(' · toi') : ''}</em></span>
                  {creator && c.member !== me.id && <button type="button" className="linkbtn" disabled={busy} onClick={() => kick(c)}>{t('Retirer')}</button>}
                </li>
              )))}
            </ul>
          </section>
          {creator ? (
            <div className="lig-actions">
              <button type="button" className="btn" disabled={busy || members.length < LEAGUE_MIN_HUMANS} onClick={start}>{t('Lancer la saison')}</button>
              {members.length < LEAGUE_MIN_HUMANS && <p className="dir-note">{t('En attente d’au moins un ami.')}</p>}
            </div>
          ) : <p className="dir-note">{t('Le créateur lancera la saison quand tout le monde sera là.')}</p>}
          <p className="dir-note">{t('Une salle d’attente jamais lancée ferme d’elle-même au bout de 48 heures.')}</p>
        </>
      ) : (
        <RunningLeague league={league} clubs={clubs} humans={humans} results={data.results} worldBefore={data.worldBefore} me={me} kickoff={kickoffAt(data)} deadline={deadlineAt(data)} onPlayClub={() => onPlayClub(m)} onReplay={onReplay} flash={flash} />
      )}

      {!lobby && (
        <section className="dir-card lig-resume">
          <SectionHead label={t('Code de reprise')} />
          <p className="dir-note">{t('Pour retrouver ton club sur un autre appareil. Garde‑le pour toi : il donne la main sur ton club.')}</p>
          {showCode && <code className="lig-secret">{resumeCodeOf(m)}</code>}
          <div className="lig-actions">
            <button type="button" className="btn btn-sm ghost" onClick={() => setShowCode((s) => !s)}>{showCode ? t('Masquer') : t('Afficher')}</button>
            <button type="button" className="btn btn-sm ghost" onClick={() => copy(resumeCodeOf(m), t('Code de reprise'))}>{t('Copier')}</button>
          </div>
        </section>
      )}
      <button type="button" className="linkbtn lig-leave" disabled={busy} onClick={leave}>
        {lobby ? (creator ? t('Fermer la salle d’attente') : t('Quitter la salle d’attente')) : t('Quitter ce championnat')}
      </button>
      {creator && !lobby && <button type="button" className="linkbtn lig-delete" disabled={busy} onClick={remove}>{t('Supprimer le championnat')}</button>}
    </>
  );
}

// Saison en cours : la journée (échéance, qui a validé), ses matchs, le classement, le palmarès de la ligue.
// tous ont validé : « coup d'envoi dans m:ss » (0.8.6)
function KickoffNote({ at }) {
  const left = useCountdown(at);
  return <span className="lig-kickoff">{left > 0 ? <>{t('tous ont validé · coup d’envoi dans ')}<b>{mmss(left)}</b></> : t('coup d’envoi…')}</span>;
}
// Heure limite de la journée et temps qui reste (1.0.1)
function DeadlineNote({ iso, at }) {
  const left = useCountdown(at);
  return <span className="lig-deadline">{t('au plus tard {deadlineText}', { deadlineText: deadlineText(iso) })}{left > 0 ? <b>{t('reste {left}', { left: leftText(left) })}</b> : left === 0 ? <b>{t('heure passée')}</b> : null}</span>;
}
function RunningLeague({ league, clubs, humans, results: all, worldBefore, me, kickoff = null, deadline = null, onPlayClub, onReplay, flash }) {
  const rounds = leagueRounds(league);
  // Une journée se découvre en regardant son match (0.8.20, règle du PDG) : celles que ton club n'a pas encore regardées
  // sur cet appareil restent cachées, scores, classement et palmarès compris.
  const club = leagueClubProgress(league.code);
  const seenUpTo = !club || club.season < league.season ? 0 : club.season > league.season ? Infinity : club.round;
  const results = all.filter((x) => x.round < seenUpTo);
  const unseen = all.length - results.length;
  const honours = (league.honours || []).filter((h) => club && (club.season > h.season || (club.season === h.season && club.round >= rounds)));
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
          <SectionHead label={t('Ton club')} aside={kickoff ? <KickoffNote at={kickoff} /> : mine.validated ? t('équipe validée') : t('équipe à valider')} />
          <div className="lig-vs">
            <ClubMark club={mine} className="lig-vs-crest" />
            <span><strong>{atHome ? t('À domicile') : t('À l’extérieur')}</strong><em>{tr('Adversaire · <0/><1/>', [opp.name, opp.human ? ` · ${opp.pseudo}` : ''])}</em></span>
            <ClubMark club={opp} className="lig-vs-crest" />
          </div>
          <button type="button" className="btn" onClick={onPlayClub}>{tr('<0/> Jouer mon club', [<IconPlay className="fill" />])}</button>
          {unseen > 0 && <p className="dir-note lig-unseen">{tn(unseen, 'Une journée jouée t’attend : entre dans ton club et regarde ton match pour découvrir les scores et le classement.', '{n} journées jouées t’attendent : entre dans ton club et regarde ton match pour découvrir les scores et le classement.', { n: unseen }, unseen > 1)}</p>}
          <p className="dir-note">{t('Ton club se gère comme une partie solo : complexe, effectif, entraînement, mercato. « Jouer » valide ton équipe avant l’heure ; une fois la journée jouée, tu regardes ton match.')}</p>
          {(syncOf(league.code).at || leagueClubProgress(league.code)) && <p className="lig-cloud">{cloudNote(league.code).text}</p>}
        </section>
      )}
      <section className="dir-card lig-round">
        <SectionHead label={t('Journée {min} / {rounds}', { min: Math.min(league.round + 1, rounds), rounds })} aside={league.deadline ? <DeadlineNote iso={league.deadline} at={deadline} /> : null} />
        <ul className="lig-ready">
          {humans.map((c) => (
            <li key={c.slot} className={c.validated ? 'ok' : ''}>
              {c.validated ? <IconCheck /> : <i aria-hidden="true" />}
              <span>{c.pseudo}{c.member === me.id ? t(' · toi') : ''}</span>
              <em>{c.validated ? t('équipe validée') : c.active ? t('à valider') : t('absent · l’ordinateur joue pour lui')}</em>
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
      {played > 0 && <Results league={league} clubs={clubs} results={results} worldBefore={worldBefore} bySlot={bySlot} mine={mine} onReplay={onReplay} flash={flash} />}
      <section className="lig-block">
        <SectionHead label={t('Classement')} aside={played ? t('après {plural}', { plural: plural(played, 'journée') }) : t('avant la 1re journée')} />
        <table className="table standings lig-table">
          <thead>
            <tr><th>#</th><th>{t('Club')}</th><th>{t('J')}</th><th className="t-wdl">{t('G')}</th><th className="t-wdl">{t('N')}</th><th className="t-wdl">{t('P')}</th><th>{t('Diff')}</th><th>{t('Pts')}</th></tr>
          </thead>
          <tbody>
            {table.map((t, i) => (
              <tr key={t.slot} className={t.member === me.id ? 'me' : ''}>
                <td className="t-pos">{i + 1}</td>
                <td className="t-club">
                  <span className="lig-tclub">
                    <ClubMark club={t} className="t-crest" />
                    <span className="lig-tname"><span className="t-name">{t.name}</span><em>{t.human ? t.pseudo : AI_LABEL}</em></span>
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
      {honours.length > 0 && (
        <section className="lig-block">
          <SectionHead label={t('Palmarès de la ligue')} />
          <ul className="honours">
            {[...honours].reverse().map((h, i) => <li key={i}><span>{tr('Saison <0/>', [h.season])}</span><em>{h.club}</em><b>{h.pseudo || ''}</b></li>)}
          </ul>
        </section>
      )}
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
      <SectionHead label={t('Résultats')} aside={t('journée {v}', { v: r.round + 1 })} />
      {results.length > 1 && (
        <div className="chips lig-rounds" role="tablist" aria-label={t('Journée')}>
          {[...results].reverse().map((x) => (
            <button key={x.round} type="button" role="tab" aria-selected={x.round === r.round} className={x.round === r.round ? 'active' : ''} onClick={() => { setRound(x.round); setOpen(null); uiSound('tab'); }}>{t('J')}{x.round + 1}</button>
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
                      {goals.map((g, i) => <li key={i} className={g.s ? 'away' : 'home'}><em>{g.m}′</em>{g.p}{g.pen ? t(' (penalty)') : ''}</li>)}
                    </ul>
                  ) : <p className="dir-note">{t('Aucun but.')}</p>}
                  {onReplay && x.sh && (
                    <button type="button" className="btn btn-sm ghost" onClick={() => {
                      const rp = replayOf(league, clubs, r.round, x, worldBefore(r.round));
                      if (rp) { uiSound('select'); onReplay(rp); } else flash(t('Ce match ne peut plus être revu avec cette version du jeu. Son résumé reste disponible.'), 'warn');
                    }}>{tr('<0/> Revoir le match en 3D', [<IconPlay className="fill" />])}</button>
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
export function LeagueView({ state, ask, invite = null, openCode = null, overTitle = false, onClose, onReplay, onPlayClub, replaying = false }) {
  const [mine, setMine] = useState(myLeagues);
  const [view, setView] = useState(() => {
    const m = openCode && myLeagues().find((x) => x.code === openCode); // rouvert après un rechargement dans sa langue
    return invite ? { id: 'join', code: invite } : m ? { id: 'league', m } : { id: 'home' };
  });
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
  const current = view.id === 'league' ? (mine.find((x) => x.code === view.m.code) || view.m) : null;
  const eyebrow = view.id === 'league' ? t('Ton club · {name}', { name: current.club.name }) : t('Championnats entre amis · {length} / {MAX_MY_LEAGUES}', { length: mine.length, MAX_MY_LEAGUES });
  return (
    <>
      {overTitle && <div className="lig-scrim" onClick={onClose} aria-hidden="true" />}
      <Panel
        id="league"
        title={t('Siège de la Ligue')}
        eyebrow={eyebrow}
        className={`lig ${overTitle ? 'over-title' : ''}`}
        onClose={onClose}
        onEscape={replaying ? () => {} : view.id !== 'home' ? back : undefined}
        toolbar={note ? <p className={`lig-note ${note.tone}`} role="status" key={note.at}>{note.text}</p> : null}
      >
        {view.id !== 'home' && (
          <button type="button" className="lig-back" onClick={back}>{tr('<0/> Mes championnats', [<IconChevronLeft />])}</button>
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
        {view.id === 'league' && <LeagueDetail key={current.code} m={current} ask={ask} flash={flash} onGone={home} onReplay={onReplay} onPlayClub={onPlayClub} />}
      </Panel>
    </>
  );
}
