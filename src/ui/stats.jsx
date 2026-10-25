import React, { useEffect, useRef, useState } from 'react';
import { DIVISIONS } from '../game/constants';
import { TACTICS, formationOf } from '../game/tactics';
import { TICKET_POLICIES } from '../game/economy';
import { ordinal } from '../game/utils';
import { fmtMoney, fmtNum, fmtPrice, fmtRating } from './format';
import { IconBall, RatingBadge, SectionHead, Stat, VersusBar } from './kit';
import { IconChevron, IconChevronLeft, IconClose } from './icons';
import { Panel } from './panels';
import { Tabs } from './glass';
import { PlayerCareer } from './career';
import { TrophyCase } from './panels';
import { STAGES_SHORT } from '../game/cups';
import { allCareers } from '../game/career';
import { Presence } from './presence';
import { PHONE, useSwipe } from './gestures';
import { ClubCrest, Crest } from './crest';
import { Portrait } from './portrait';
import { clubStars } from '../game/crest';

// Stats : le club (saison et records), tous les matchs, les joueurs (classements saison ou carrière), et pour chaque
// match une fiche « Stats Pass » au format de footoff.media (en-tête, rapport de forces, fil du match, Note FootOFF,
// compositions, dynamique, confrontations, chiffres). Domicile en or, adversaire en blanc cassé.

const outcome = (m) => (m.pens ? (m.pens[0] > m.pens[1] ? 'win' : 'loss') : m.gf > m.ga ? 'win' : m.gf < m.ga ? 'loss' : 'draw');
const mkey = (m) => `${m.season}-${m.round}-${m.comp || 'league'}-${m.stage ?? ''}`;
const whenOf = (m) => (m.comp === 'cup' ? `Coupe ${STAGES_SHORT[m.stage]}` : m.comp === 'c1' ? `Europe ${STAGES_SHORT[m.stage]}` : `J${m.round}`);
const LETTER = { win: 'V', draw: 'N', loss: 'D' };
const WORD = { win: 'Victoire', draw: 'Match nul', loss: 'Défaite' };
const pensOf = (m) => (m.pens ? ` (t.a.b. ${m.pens[0]}–${m.pens[1]})` : ''); // coupe : égalité tranchée aux tirs au but
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const shortName = (n) => { const [f, ...r] = n.split(' '); return r.length ? `${f[0]}. ${r.join(' ')}` : n; };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

function summary(list) {
  const t = { played: list.length, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, clean: 0, poss: 0, shots: 0, onT: 0, shotsA: 0, yellow: 0, red: 0, att: 0, rev: 0 };
  for (const m of list) {
    t[outcome(m)]++;
    t.gf += m.gf; t.ga += m.ga; if (m.ga === 0) t.clean++;
    t.att += m.attendance || 0; t.rev += m.revenue || 0;
    if (m.stats) {
      t.poss += m.stats.possession; t.shots += m.stats.shots[0]; t.onT += m.stats.onTarget[0]; t.shotsA += m.stats.shots[1];
      t.yellow += m.stats.yellow[0]; t.red += m.stats.red[0];
    }
  }
  return t;
}

function streak(list, ok) {
  let best = 0, cur = 0;
  for (const m of list) { cur = ok(m) ? cur + 1 : 0; best = Math.max(best, cur); }
  return best;
}

function FormPills({ list, onOpen }) {
  if (!list.length) return <span className="st-muted">Aucun match</span>;
  return (
    <div className="st-form">
      {list.map((m) => (
        <button key={mkey(m)} className={`st-pill ${outcome(m)}`} onClick={() => onOpen?.(m)} title={`${whenOf(m)} · ${m.gf}–${m.ga}${pensOf(m)} contre ${m.opp}`}>
          {LETTER[outcome(m)]}
        </button>
      ))}
    </div>
  );
}

// --- Le club : saison choisie, forme, records, saison par saison -------------------------------------------------
function ClubTab({ state, matches, season, onOpen, onCareer }) {
  const list = matches.filter((m) => m.season === season);
  const t = summary(list);
  const withStats = list.filter((m) => m.stats).length || 1;
  const all = matches;
  const best = (score) => all.reduce((b, m) => (!b || score(m) > score(b) ? m : b), null);
  const bigWin = best((m) => m.gf - m.ga);
  const bigLoss = best((m) => m.ga - m.gf);
  const goals = best((m) => m.gf + m.ga);
  const crowd = best((m) => m.attendance || 0);
  const cash = best((m) => m.revenue || 0);
  const seasons = [...new Set([...state.history.map((h) => h.season), ...all.map((m) => m.season)])].sort((a, b) => b - a);

  return (
    <>
      <TrophyCase trophies={state.trophies || []} />
      <SectionHead label={`Saison ${season}`} aside={list[0]?.division || DIVISIONS[state.divisionIndex].name} />
      {list.length === 0 ? <p className="st-muted">Aucun match enregistré pour cette saison : les statistiques détaillées démarrent au prochain match joué.</p> : (
        <>
          <div className="st-tiles">
            <Stat label="Matchs" value={t.played} sub={`${t.win} V · ${t.draw} N · ${t.loss} D`} />
            <Stat label="Buts" value={`${t.gf} – ${t.ga}`} sub={`diff. ${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}`} />
            <Stat label="Possession" value={`${Math.round(t.poss / withStats)} %`} sub="en moyenne" />
            <Stat label="Cages inviolées" value={t.clean} sub={plural(t.clean, 'match sans encaisser', 'matchs sans encaisser')} />
            <Stat label="Tirs par match" value={fmtRating(t.shots / withStats)} sub={`${fmtRating(t.shotsA / withStats)} concédés`} />
            <Stat label="Précision" value={`${pct(t.onT, t.shots)} %`} sub="tirs cadrés" />
            <Stat label="Efficacité" value={`${pct(t.gf, t.shots)} %`} sub="tirs transformés" />
            <Stat label="Affluence" value={fmtNum(Math.round(t.att / (t.played || 1)))} sub="par match" />
          </div>
          <div className="st-row"><span className="st-cap">Forme</span><FormPills list={list.slice(-7)} onOpen={onOpen} /></div>
          <div className="st-row"><span className="st-cap">Discipline</span><span>{plural(t.yellow, 'carton jaune', 'cartons jaunes')} · {plural(t.red, 'carton rouge', 'cartons rouges')}</span></div>
          <div className="st-row"><span className="st-cap">Recettes des matchs</span><b>{fmtMoney(t.rev)}</b></div>
        </>
      )}

      {all.length > 0 && (
        <>
          <SectionHead label="Records du club" aside="toutes saisons" />
          <ul className="st-records">
            {bigWin && bigWin.gf > bigWin.ga && <Record label="Plus large victoire" m={bigWin} value={`${bigWin.gf}–${bigWin.ga}`} onOpen={onOpen} />}
            {bigLoss && bigLoss.ga > bigLoss.gf && <Record label="Plus lourde défaite" m={bigLoss} value={`${bigLoss.gf}–${bigLoss.ga}`} onOpen={onOpen} />}
            {goals && <Record label="Match le plus prolifique" m={goals} value={plural(goals.gf + goals.ga, 'but', 'buts')} onOpen={onOpen} />}
            {crowd && <Record label="Record d’affluence" m={crowd} value={fmtNum(crowd.attendance)} onOpen={onOpen} />}
            {cash && <Record label="Recette record" m={cash} value={fmtMoney(cash.revenue)} onOpen={onOpen} />}
            <li><span>Plus longue série sans défaite</span><b>{plural(streak(all, (m) => m.gf >= m.ga), 'match', 'matchs')}</b></li>
            <li><span>Plus longue série de victoires</span><b>{plural(streak(all, (m) => m.gf > m.ga), 'match', 'matchs')}</b></li>
          </ul>
        </>
      )}

      <Legends state={state} matches={all} onCareer={onCareer} />

      {seasons.length > 0 && (
        <>
          <SectionHead label="Saison par saison" />
          <table className="table st-seasons">
            <thead><tr><th>Saison</th><th>Division</th><th>Place</th><th>V-N-D</th><th>Buts</th></tr></thead>
            <tbody>
              {seasons.map((n) => {
                const h = state.history.find((x) => x.season === n);
                const ms = all.filter((m) => m.season === n);
                const s2 = summary(ms);
                return (
                  <tr key={n}>
                    <td className="t-pos">{n}</td>
                    <td className="t-club">{h?.division || ms[0]?.division || '—'}</td>
                    <td>{h ? ordinal(h.position, true) : 'en cours'}</td>
                    <td>{ms.length ? `${s2.win}-${s2.draw}-${s2.loss}` : '—'}</td>
                    <td>{ms.length ? `${s2.gf}–${s2.ga}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

// Légendes du club : records individuels de toute l'histoire, chacun ouvre la fiche carrière du joueur.
function Legends({ state, matches, onCareer }) {
  const careers = allCareers(state);
  if (!careers.some((c) => c.totals.apps)) return null;
  const top = (score) => careers.reduce((b, c) => (score(c) > (b ? score(b) : 0) ? c : b), null);
  const scorer = top((c) => c.totals.goals);
  const passer = top((c) => c.totals.assists);
  const loyal = top((c) => c.totals.apps);
  const star = top((c) => c.totals.motm);
  const rated = top((c) => (c.totals.apps >= 10 ? c.totals.avg : 0));
  const keeper = top((c) => ((c.p.pos === 'G' || c.p.pos === 'D') ? c.totals.clean : 0));
  let bestSeason = null;
  for (const c of careers) for (const h of c.hist) if (h.goals && (!bestSeason || h.goals > bestSeason.h.goals)) bestSeason = { c, h };
  let bestGame = null;
  for (const m of matches) for (const r of m.players || []) if (r.goals && (!bestGame || r.goals > bestGame.r.goals)) bestGame = { m, r };
  const name = (c) => c.p.name + (c.current ? '' : ' (ancien)');
  const rows = [
    scorer?.totals.goals ? ['Meilleur buteur de l’histoire', name(scorer), plural(scorer.totals.goals, 'but', 'buts'), scorer.id] : null,
    passer?.totals.assists ? ['Meilleur passeur', name(passer), plural(passer.totals.assists, 'passe', 'passes'), passer.id] : null,
    loyal?.totals.apps ? ['Le plus de matchs', name(loyal), plural(loyal.totals.apps, 'match', 'matchs'), loyal.id] : null,
    star?.totals.motm ? ['Le plus d’hommes du match', name(star), `${star.totals.motm} fois`, star.id] : null,
    rated ? ['Meilleure note moyenne (10 matchs min.)', name(rated), `${fmtRating(rated.totals.avg)} / 10`, rated.id] : null,
    keeper?.totals.clean ? ['Le plus de matchs sans encaisser', name(keeper), plural(keeper.totals.clean, 'match', 'matchs'), keeper.id] : null,
    bestSeason ? ['Record de buts sur une saison', `${name(bestSeason.c)} · Saison ${bestSeason.h.season}`, plural(bestSeason.h.goals, 'but', 'buts'), bestSeason.c.id] : null,
    bestGame ? ['Record de buts sur un match', `${bestGame.r.name} · contre ${bestGame.m.opp}`, plural(bestGame.r.goals, 'but', 'buts'), bestGame.r.id] : null,
  ].filter(Boolean);
  return (
    <>
      <SectionHead label="Légendes du club" aside="records individuels" />
      <ul className="st-records">
        {rows.map(([label, who, value, id]) => (
          <li key={label}>
            <button className="st-record" onClick={() => onCareer(id)}>
              <span>{label}<em>{who}</em></span>
              <b>{value}</b>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Record({ label, m, value, onOpen }) {
  return (
    <li>
      <button className="st-record" onClick={() => onOpen(m)}>
        <span>{label}<em>S{m.season} · J{m.round} · {m.opp}</em></span>
        <b>{value}</b>
      </button>
    </li>
  );
}

// --- Tous les matchs ---------------------------------------------------------------------------------------------
function MatchesTab({ matches, onOpen }) {
  const seasons = [...new Set(matches.map((m) => m.season))].sort((a, b) => b - a);
  const [season, setSeason] = useState('all');
  const list = (season === 'all' ? matches : matches.filter((m) => m.season === season)).slice().reverse();
  if (!matches.length) return <p className="st-muted">Aucun match enregistré pour l’instant : chaque match joué apparaîtra ici, avec sa fiche Stats Pass.</p>;
  return (
    <>
      <div className="chips">
        <button className={season === 'all' ? 'active' : ''} onClick={() => setSeason('all')}>Toutes</button>
        {seasons.map((n) => <button key={n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>Saison {n}</button>)}
      </div>
      <ul className="st-matches">
        {list.map((m) => (
          <li key={mkey(m)}>
            <button className="st-match" onClick={() => onOpen(m)}>
              <span className={`st-when ${m.comp && m.comp !== 'league' ? `st-comp ${m.comp}` : ''}`}>S{m.season} · {whenOf(m)}</span>
              <span className="st-opp">{m.opp}</span>
              <span className={`st-score ${outcome(m)}`}>{m.gf}–{m.ga}{m.pens && <small>t.a.b. {m.pens[0]}–{m.pens[1]}</small>}</span>
              <span className="st-mini">{formationOf(m.formation).name}{m.stats ? ` · ${m.stats.possession} % · ${m.stats.shots[0]}–${m.stats.shots[1]} tirs` : ''}</span>
              <IconChevron />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Joueurs : classements de la saison ou de toute l'histoire du club ----------------------------------------------
// Saison : joueurs actuels. Histoire du club : tous ceux qui sont passés par le club, anciens compris. Chaque
// ligne ouvre la fiche carrière du joueur.
function PlayersTab({ state, onCareer }) {
  const [scope, setScope] = useState('season');
  const season = scope === 'season';
  const rows = season
    ? state.players.map((p) => {
      const st = p.season || {};
      return {
        id: p.id, p, old: false, apps: st.apps || 0, goals: st.goals || 0, assists: st.assists || 0, motm: st.motm || 0,
        yellow: st.yellow || 0, red: st.red || 0, minutes: st.minutes || 0, shots: st.shots || 0, onTarget: st.onTarget || 0,
        clean: st.clean || 0, avg: st.apps ? st.sum / st.apps : 0,
      };
    })
    : allCareers(state).map((c) => ({ id: c.id, p: c.p, old: !c.current, ...c.totals, avg: c.totals.avg || 0 }));
  const minApps = season ? 3 : 10;
  const minShots = season ? 6 : 15;
  const boards = [
    ['Buteurs', (r) => r.goals, (r) => plural(r.goals, 'but', 'buts')],
    ['Passeurs décisifs', (r) => r.assists, (r) => plural(r.assists, 'passe', 'passes')],
    ['Décisifs (buts + passes)', (r) => r.goals + r.assists, (r) => `${r.goals + r.assists} (${r.goals} + ${r.assists})`],
    ['Hommes du match', (r) => r.motm, (r) => `${r.motm} fois`],
    [`Note moyenne (${minApps} matchs min.)`, (r) => (r.apps >= minApps ? r.avg : 0), (r) => `${fmtRating(r.avg)} / 10`],
    ['Matchs joués', (r) => r.apps, (r) => plural(r.apps, 'match', 'matchs')],
    ['Minutes jouées', (r) => r.minutes, (r) => `${fmtNum(r.minutes)} min`],
    ['Tirs cadrés', (r) => r.onTarget, (r) => `${r.onTarget} sur ${r.shots}`],
    [`Efficacité (${minShots} tirs min.)`, (r) => (r.shots >= minShots ? r.goals / r.shots : 0), (r) => `${pct(r.goals, r.shots)} %`],
    ['Matchs sans encaisser', (r) => ((r.p.pos === 'G' || r.p.pos === 'D') ? r.clean : 0), (r) => plural(r.clean, 'match', 'matchs')],
    ['Discipline', (r) => r.yellow + r.red * 3, (r) => `${r.yellow} J · ${r.red} R`],
  ];
  return (
    <>
      <Tabs className="segmented st-scope" role="radiogroup" label="Période" items={[['season', `Saison ${state.seasonNumber}`], ['career', 'Histoire du club']]} value={scope} onChange={setScope} />
      <div className="st-boards">
        {boards.map(([title, score, label]) => {
          const top = rows.filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a)).slice(0, 5);
          return (
            <section key={title} className="st-board">
              <span className="st-cap">{title}</span>
              {top.length === 0 ? <span className="st-muted">—</span> : (
                <ol>
                  {top.map((r, i) => (
                    <li key={r.id}>
                      <button className="st-player" onClick={() => onCareer(r.id)}>
                        <span className="st-rank">{i + 1}</span>
                        <Portrait p={r.p} size={28} />
                        <span className="st-name">{shortName(r.p.name)}{r.old && <em className="st-old">ancien</em>}</span>
                        <b>{label(r)}</b>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      <p className="st-muted">{season ? 'Joueurs actuellement au club.' : 'Tous les joueurs passés par le club, anciens compris.'} Choisis un joueur pour ouvrir sa carrière.</p>
    </>
  );
}

// --- Fiche Stats Pass d'un match ---------------------------------------------------------------------------------
// --- Détail complet d'un match (onglets du Stats Pass) -------------------------------------------------------

const OUTCOME = { g: 'But', s: 'Arrêté', w: 'À côté', p: 'Sur le poteau' };
const POS_ORDER = { G: 0, D: 1, M: 2, A: 3 };
const xgFmt = (v) => fmtRating(v);
const xgShot = (v) => v.toFixed(2).replace('.', ','); // xG d'un tir : deux décimales
// minute « 45+2 » → minute de jeu (47) ; tranche de 15 minutes (0 à 5) selon la mi-temps
const minuteOf = (label) => String(label).split('+').reduce((a, b) => a + Number(b), 0);
const sliceOf = (shot) => {
  const base = shot.h === 2 ? 45 : 0;
  const t = minuteOf(shot.m) - base;
  return (shot.h === 2 ? 3 : 0) + Math.min(2, Math.max(0, Math.floor((t - 1) / 15)));
};

function MatchStats({ m }) {
  const st = m.stats;
  if (!st) return <p className="st-muted">Statistiques indisponibles pour ce match.</p>;
  const shots = m.shots || [];
  const miss = (i) => st.shots[i] - st.onTarget[i];
  const savePct = (i) => { const conceded = i === 0 ? m.ga : m.gf; const sv = st.saves?.[i] ?? 0; return sv + conceded ? pct(sv, sv + conceded) : 0; };
  const half = (h, i) => ({ goals: shots.filter((x) => x.h === h && x.s === i && x.o === 'g').length, shots: shots.filter((x) => x.h === h && x.s === i).length });
  return (
    <>
      <section className="sh-sec">
        <span className="sh-cap">Attaque</span>
        <VersusBar label="Buts" home={m.gf} away={m.ga} />
        {st.xg && <VersusBar label="Buts attendus (xG)" home={st.xg[0]} away={st.xg[1]} format={xgFmt} />}
        <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} />
        {st.big && <VersusBar label="Occasions franches" home={st.big[0]} away={st.big[1]} />}
        <VersusBar label="Tirs cadrés" home={st.onTarget[0]} away={st.onTarget[1]} />
        <VersusBar label="Tirs non cadrés" home={miss(0)} away={miss(1)} />
        {st.post && <VersusBar label="Sur les montants" home={st.post[0]} away={st.post[1]} />}
        <VersusBar label="Précision" home={pct(st.onTarget[0], st.shots[0])} away={pct(st.onTarget[1], st.shots[1])} suffix=" %" />
        <VersusBar label="Tirs transformés" home={pct(m.gf, st.shots[0])} away={pct(m.ga, st.shots[1])} suffix=" %" />
        {st.xg && <p className="sp-note">Buts attendus : la somme des chances de marquer de chaque tir. Au-dessus, l’équipe a été réaliste ; en dessous, elle a manqué d’efficacité.</p>}
      </section>
      {st.saves && (
        <section className="sh-sec">
          <span className="sh-cap">Gardiens</span>
          <VersusBar label="Arrêts" home={st.saves[0]} away={st.saves[1]} />
          <VersusBar label="Tirs cadrés arrêtés" home={savePct(0)} away={savePct(1)} suffix=" %" />
          <VersusBar label="Buts encaissés" home={m.ga} away={m.gf} />
        </section>
      )}
      <section className="sh-sec">
        <span className="sh-cap">Possession</span>
        <VersusBar label="Sur le match" home={st.possession} away={100 - st.possession} suffix=" %" />
        {st.possHalf?.[0] != null && <VersusBar label="1re mi-temps" home={st.possHalf[0]} away={100 - st.possHalf[0]} suffix=" %" />}
        {st.possHalf?.[1] != null && <VersusBar label="2de mi-temps" home={st.possHalf[1]} away={100 - st.possHalf[1]} suffix=" %" />}
      </section>
      {shots.length > 0 && (
        <section className="sh-sec">
          <span className="sh-cap">Mi-temps par mi-temps</span>
          {[1, 2].map((h) => {
            const a = half(h, 0);
            const b = half(h, 1);
            return (
              <div key={h} className="sp-half">
                <span>{h === 1 ? '1re mi-temps' : '2de mi-temps'}</span>
                <b className={a.goals > b.goals ? 'win' : a.goals < b.goals ? 'loss' : ''}>{a.goals} – {b.goals}</b>
                <em>tirs {a.shots} – {b.shots}</em>
              </div>
            );
          })}
        </section>
      )}
      <section className="sh-sec">
        <span className="sh-cap">Discipline</span>
        <VersusBar label="Cartons jaunes" home={st.yellow[0]} away={st.yellow[1]} />
        <VersusBar label="Cartons rouges" home={st.red[0]} away={st.red[1]} />
      </section>
      <section className="sh-sec">
        <span className="sh-cap">Le contexte</span>
        <ul className="sp-facts">
          <li><span>Niveau du onze</span><b>{fmtRating(m.myRating || 0)} contre {fmtRating(m.oppStrength || 0)}</b></li>
          <li><span>Tactique</span><b>{TACTICS[m.tactic]?.name || '—'}</b></li>
          {st.longShots > 0 && <li><span>Frappes de loin</span><b>{st.longShots}</b></li>}
          <li><span>Affluence</span><b>{fmtNum(m.attendance || 0)}{m.capacity ? ` · ${pct(m.attendance, m.capacity)} %` : ''}</b></li>
          <li><span>Recette du jour</span><b>{fmtMoney(m.revenue || 0)}</b></li>
        </ul>
      </section>
    </>
  );
}

function MatchPlayers({ m, clubName, onCareer }) {
  const players = (m.players || []).slice().sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.rating - a.rating);
  const oppGoals = (m.events || []).filter((e) => e.side === 'away' && e.type === 'goal');
  const oppShots = (m.shots || []).filter((x) => x.s === 1);
  const byOpp = Object.values(oppShots.reduce((acc, x) => {
    const r = (acc[x.p] ||= { name: x.p, shots: 0, on: 0, goals: 0 });
    r.shots++; if (x.o === 'g' || x.o === 's') r.on++; if (x.o === 'g') r.goals++;
    return acc;
  }, {})).sort((a, b) => b.goals - a.goals || b.shots - a.shots);
  const dash = (v) => (v === undefined || v === null ? '–' : v);
  return (
    <>
      <section className="sh-sec">
        <span className="sh-cap">{clubName}</span>
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead><tr><th className="l">Joueur</th><th>Note</th><th>Min.</th><th>Buts</th><th>Passes</th><th>Tirs</th><th>Cartons</th></tr></thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className={`sp-click ${p.id === m.motm ? 'motm' : ''}`} onClick={() => onCareer?.(p.id)}>
                  <td className="l"><span className={`pos-pill ${p.pos}`}>{p.pos}</span><span className="sp-pname">{shortName(p.name)}</span></td>
                  <td><RatingBadge value={p.rating} /></td>
                  <td>{dash(p.minutes)}</td>
                  <td>{p.goals || '·'}</td>
                  <td>{p.assists || '·'}</td>
                  <td>{p.shots === undefined ? '–' : p.shots ? `${p.shots} (${p.onTarget} cadré${p.onTarget > 1 ? 's' : ''})` : '·'}</td>
                  <td>{p.red ? <i className="card red" /> : p.yellow ? <i className="card yellow" /> : '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sp-note">En or : l’homme du match. Les tirs entre parenthèses sont ceux cadrés. Choisis un joueur pour ouvrir sa carrière.</p>
      </section>
      <section className="sh-sec">
        <span className="sh-cap">{m.opp}</span>
        {byOpp.length ? (
          <ul className="sp-facts">
            {byOpp.map((r) => <li key={r.name}><span>{r.name}</span><b>{r.goals ? `${plural(r.goals, 'but', 'buts')} · ` : ''}{plural(r.shots, 'tir', 'tirs')}, {r.on} cadré{r.on > 1 ? 's' : ''}</b></li>)}
          </ul>
        ) : oppGoals.length ? (
          <ul className="sp-facts">{oppGoals.map((e, i) => <li key={i}><span>{e.player}</span><b>but · {e.minute}′</b></li>)}</ul>
        ) : <p className="st-muted">Aucun tir adverse enregistré.</p>}
      </section>
    </>
  );
}

function MatchTimeline({ m }) {
  const shots = m.shots || [];
  if (!shots.length) return <p className="st-muted">Le déroulé tir par tir existe pour les matchs joués depuis cette mise à jour.</p>;
  const slices = Array.from({ length: 6 }, () => ({ h: 0, a: 0, gh: 0, ga: 0 }));
  for (const x of shots) {
    const sl = slices[sliceOf(x)];
    if (x.s === 0) { sl.h++; if (x.o === 'g') sl.gh++; } else { sl.a++; if (x.o === 'g') sl.ga++; }
  }
  const max = Math.max(1, ...slices.map((x) => Math.max(x.h, x.a)));
  const LABELS = ['0′', '15′', '30′', '45′', '60′', '75′'];
  const cards = (m.events || []).filter((e) => e.type === 'yellow' || e.type === 'red')
    .map((e) => ({ kind: e.type, m: e.minute, s: e.side === 'home' ? 0 : 1, p: e.player }));
  const all = [...shots.map((x) => ({ kind: 'shot', ...x })), ...cards]
    .sort((a, b) => minuteOf(a.m) - minuteOf(b.m));
  return (
    <>
      <section className="sh-sec">
        <span className="sh-cap">Les temps forts</span>
        <div className="sp-tl" role="img" aria-label="Tirs par tranche de quinze minutes, club en haut, adversaire en bas">
          {slices.map((x, i) => (
            <div key={i} className="sp-tl-col">
              <div className="sp-tl-up">{x.gh > 0 && <span className="sp-tl-goal">{'●'.repeat(x.gh)}</span>}<i style={{ height: `${(x.h / max) * 100}%` }} />{x.h > 0 && <em>{x.h}</em>}</div>
              <span className="sp-tl-axis">{LABELS[i]}</span>
              <div className="sp-tl-down"><i style={{ height: `${(x.a / max) * 100}%` }} />{x.a > 0 && <em>{x.a}</em>}{x.ga > 0 && <span className="sp-tl-goal">{'●'.repeat(x.ga)}</span>}</div>
            </div>
          ))}
        </div>
        <div className="sp-legend"><span><i className="dom" /> tirs du club</span><span><i className="ext" /> tirs adverses</span><span>● but</span></div>
      </section>
      <section className="sh-sec">
        <span className="sh-cap">Tir par tir</span>
        <ul className="sp-events sp-all">
          {all.map((x, i) => (
            <li key={i} className={`${x.s === 0 ? 'dom' : 'ext'} ${x.kind === 'shot' ? `o-${x.o}` : ''}`}>
              <span className="sp-min">{x.m}′</span>
              <span className="sp-ico">{x.kind === 'shot' ? (x.o === 'g' ? <IconBall /> : <i className={`sp-shot ${x.o}`} />) : <i className={`card ${x.kind}`} />}</span>
              <span className="sp-who">{x.p}<em> · {x.kind === 'shot' ? `${OUTCOME[x.o]}${x.q === 'big' ? ' · occasion franche' : x.q === 'hard' ? ' · frappe difficile' : ''}${x.x ? ` · xG ${xgShot(x.x)}` : ''}` : x.kind === 'red' ? 'carton rouge' : 'carton jaune'}</em></span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// Composition du match sur le terrain : le onze de départ à son poste dans la formation utilisée, note du match
// dans la pastille (vert ≥ 7,5, rouge < 5,5), flèche sur les remplacés ; puis les changements.
function MatchLineup({ m, onCareer }) {
  const f = formationOf(m.formation);
  const byId = Object.fromEntries((m.players || []).map((p) => [p.id, p]));
  const out = new Set((m.subs || []).map((x) => x.out));
  const nameOf = (id) => byId[id]?.name || '—';
  return (
    <>
      <div className="pitch2d sp-pitch">
        <div className="p2-lines"><i className="half" /><i className="circle" /><i className="box top" /><i className="box bottom" /></div>
        {m.lineup.map((id, k) => {
          const p = byId[id];
          if (!p || !f.pitch[k]) return null;
          const tone = p.rating >= 7.5 ? 'good' : p.rating < 5.5 ? 'bad' : '';
          return (
            <button key={id} type="button" className={`p2-chip sp-pchip ${tone}`} style={{ left: `${f.pitch[k][0]}%`, top: `${f.pitch[k][1]}%` }} onClick={() => onCareer?.(id)} title={`${p.name} · note ${fmtRating(p.rating)}${out.has(id) ? ' · remplacé' : ''}`}>
              <span className="p2-num">{fmtRating(p.rating)}{out.has(id) && <i className="sp-subout" aria-label="remplacé" />}</span>
              <span className="p2-name">{shortName(p.name)}</span>
            </button>
          );
        })}
      </div>
      {m.subs?.length > 0 && (
        <ul className="sp-subs">
          {m.subs.map((x, i) => (
            <li key={i}>
              <span className="sp-min">{x.minute}′</span>
              <span className="sub-way in">Entre</span><b>{shortName(nameOf(x.in))}</b>
              <span className="sub-way out">Sort</span><b>{shortName(nameOf(x.out))}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const GATE_LABEL = { billetterie: 'Billetterie', buvette: 'Buvette', boutique: 'Boutique', loges: 'Loges', tv: 'Droits TV' };

// Billetterie du match : formule des billets du jour, prix, affluence, recettes détaillées.
function MatchGate({ m }) {
  const policy = TICKET_POLICIES[m.tickets];
  const refused = m.demand && m.capacity && m.demand > m.capacity ? m.demand - m.capacity : 0;
  return (
    <ul className="sp-facts">
      <li><span>Formule des billets</span><b>{policy ? `${policy.name}${m.ticketPrice ? ` · ${fmtPrice(m.ticketPrice)} le billet` : ''}` : 'Non enregistrée (match ancien)'}</b></li>
      <li><span>Affluence</span><b>{fmtNum(m.attendance || 0)}{m.capacity ? ` / ${fmtNum(m.capacity)} · ${pct(m.attendance, m.capacity)} %` : ''}</b></li>
      {refused > 0 && <li><span>Restés aux guichets</span><b>{fmtNum(refused)}</b></li>}
      {m.breakdown && Object.entries(m.breakdown).filter(([, v]) => v > 0).map(([k, v]) => <li key={k}><span>{GATE_LABEL[k] || k}</span><b>{fmtMoney(v)}</b></li>)}
      <li className="sp-total"><span>Recette du match</span><b>{fmtMoney(m.revenue || 0)}</b></li>
    </ul>
  );
}

function StatsPass({ state, m, matches, onClose, onPrev, onNext, onCareer }) {
  const ref = useRef(null);
  const [view, setView] = useState('resume');
  useSwipe(ref, { onDown: onClose, onLeft: onNext, onRight: onPrev, downMedia: PHONE });
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [m]);
  const o = outcome(m);
  const idx = matches.indexOf(m);
  const before = matches.slice(Math.max(0, idx - 5), idx);
  const h2h = matches.filter((x) => x.opp === m.opp && x !== m).slice(-5).reverse();
  const players = (m.players || []).slice().sort((a, b) => b.rating - a.rating);
  const motm = players.find((p) => p.id === m.motm) || players[0];
  const lines = ['G', 'D', 'M', 'A'].map((pos) => [pos, players.filter((p) => p.pos === pos)]);
  const events = (m.events || []).filter((e) => e.type === 'goal' || e.type === 'red' || e.type === 'yellow');
  const st = m.stats;
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass sp" onClick={(e) => e.stopPropagation()} aria-label={`Stats Pass : ${state.clubName} contre ${m.opp}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={onPrev} aria-label="Match précédent"><IconChevronLeft /></button>
            <span>Stats Pass</span>
            <button className="hud-icon" onClick={onNext} aria-label="Match suivant"><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
        </header>

        <section className="sp-card">
          <span className="sp-meta">{m.label || `Journée ${m.round}`} · {m.comp === 'c1' ? 'Europe' : m.division} · Saison {m.season}</span>
          <div className="sp-grid">
            <div className="sp-team"><ClubCrest crest={state.crest} name={state.clubName} className="sp-crest" stars={clubStars(state)} />{state.clubName}</div>
            <div className={`sp-score ${o}`}>{m.gf}<i>–</i>{m.ga}</div>
            <div className="sp-team ext">{m.opp}<Crest name={m.opp} className="sp-crest" /></div>
          </div>
          <span className={`sp-state ${o}`}>{m.pens ? `${o === 'win' ? 'Qualifié' : 'Éliminé'} aux tirs au but ${m.pens[0]}–${m.pens[1]}` : WORD[o]}</span>
          <div className="sp-strip">
            <span><b>{fmtNum(m.attendance || 0)}</b> spectateurs{m.capacity ? ` · ${pct(m.attendance, m.capacity)} % de remplissage` : ''}</span>
            <span>Recette <b>{fmtMoney(m.revenue || 0)}</b></span>
          </div>
        </section>

        <Tabs className="sq-tabs sp-tabs" items={[['resume', 'Résumé'], ['stats', 'Stats'], ['players', 'Joueurs'], ['timeline', 'Déroulé']]} value={view} onChange={setView} />

        {view === 'stats' && <MatchStats m={m} />}
        {view === 'players' && <MatchPlayers m={m} clubName={state.clubName} onCareer={onCareer} />}
        {view === 'timeline' && <MatchTimeline m={m} />}
        {view === 'resume' && <>
        {st && (
          <section className="sh-sec">
            <span className="sh-cap">Le rapport de forces</span>
            <VersusBar label="Possession" home={st.possession} away={100 - st.possession} suffix=" %" />
            <VersusBar label="Tirs" home={st.shots[0]} away={st.shots[1]} />
            <VersusBar label="Tirs cadrés" home={st.onTarget[0]} away={st.onTarget[1]} />
            <VersusBar label="Cartons" home={st.yellow[0] + st.red[0]} away={st.yellow[1] + st.red[1]} />
            <div className="sp-levels"><span>Niveau du onze <b className="dom">{fmtRating(m.myRating || 0)}</b></span><span>Adversaire <b>{fmtRating(m.oppStrength || 0)}</b></span></div>
            <button className="btn ghost wide sp-more" onClick={() => setView('stats')}>Toutes les statistiques du match</button>
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">Le fil du match</span>
          {events.length === 0 && (m.scorers || []).length === 0 ? <p className="st-muted">Aucun but ni carton.</p> : (
            <ul className="sp-events">
              {(events.length ? events : (m.scorers || []).map((g) => ({ minute: g.minute, type: 'goal', side: 'home', player: g.name }))).map((e, i) => {
                const assist = e.type === 'goal' && e.side === 'home' ? (m.scorers || []).find((g) => g.name === e.player && String(g.minute) === String(e.minute).split('+')[0])?.assist : null;
                return (
                  <li key={i} className={e.side === 'home' ? 'dom' : 'ext'}>
                    <span className="sp-min">{e.minute}′</span>
                    <span className="sp-ico">{e.type === 'goal' ? <IconBall /> : <i className={`card ${e.type}`} />}</span>
                    <span className="sp-who">{e.player}{assist ? <em> · passe de {shortName(assist)}</em> : null}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {m.pens && (
            <ul className="sp-events">
              <li className={o === 'win' ? 'dom' : 'ext'}>
                <span className="sp-min">t.a.b.</span>
                <span className="sp-ico"><IconBall /></span>
                <span className="sp-who">Tirs au but {m.pens[0]}–{m.pens[1]}<em> · {o === 'win' ? state.clubName : m.opp} se qualifie</em></span>
              </li>
            </ul>
          )}
        </section>

        <section className="sh-sec">
          <span className="sh-cap">Composition · {formationOf(m.formation).name}</span>
          {m.lineup ? <MatchLineup m={m} onCareer={onCareer} /> : <p className="st-muted">Formation {formationOf(m.formation).name} · le détail du onze n’était pas encore enregistré pour ce match.</p>}
        </section>

        {motm && (
          <section className="sh-sec">
            <span className="sh-cap">Note FootOFF</span>
            <div className="sp-motm"><RatingBadge value={motm.rating} /><div><b>{motm.name}</b><span>Homme du match{motm.goals ? ` · ${plural(motm.goals, 'but', 'buts')}` : ''}{motm.assists ? ` · ${plural(motm.assists, 'passe déc.', 'passes déc.')}` : ''}</span></div></div>
            {!m.lineup && <div className="sp-lines">
              {lines.filter(([, ps]) => ps.length).map(([pos, ps]) => (
                <div key={pos} className="sp-line">
                  <span className={`pos-pill ${pos}`}>{pos}</span>
                  <div>{ps.map((p) => <button key={p.id} className="sp-chip" onClick={() => onCareer?.(p.id)}><RatingBadge value={p.rating} />{shortName(p.name)}</button>)}</div>
                </div>
              ))}
            </div>}
          </section>
        )}

        <section className="sh-sec">
          <span className="sh-cap">La dynamique avant ce match</span>
          <FormPills list={before} />
        </section>

        <section className="sh-sec">
          <span className="sh-cap">Les dernières confrontations</span>
          {h2h.length === 0 ? <p className="st-muted">Première rencontre entre les deux clubs.</p> : (
            <ul className="sp-h2h">{h2h.map((x) => <li key={mkey(x)}><span>Saison {x.season} · {whenOf(x)}</span><b className={outcome(x)}>{x.gf}–{x.ga}{pensOf(x)}</b></li>)}</ul>
          )}
        </section>

        <section className="sh-sec">
          <span className="sh-cap">La billetterie</span>
          <MatchGate m={m} />
        </section>

        <section className="sh-sec">
          <span className="sh-cap">Les chiffres</span>
          <ul className="sp-facts">
            <li><span>Formation</span><b>{formationOf(m.formation).name}</b></li>
            <li><span>Tactique</span><b>{TACTICS[m.tactic]?.name || '—'}</b></li>
            {st && <li><span>Efficacité</span><b>{pct(m.gf, st.shots[0])} % des tirs transformés</b></li>}
            {st && <li><span>Précision</span><b>{pct(st.onTarget[0], st.shots[0])} % de tirs cadrés</b></li>}
            <li><span>Joueurs utilisés</span><b>{players.length}</b></li>
          </ul>
        </section>
        </>}
      </article>
    </div>
  );
}

// sheet : la fiche joueur posée par-dessus (App), au-dessus de la fiche carrière qui l'a ouverte ; sheetOpen : elle a
// la main sur Échap
export function StatsPanel({ state, onClose, initialMatch = null, onPlayerSheet, sheet = null, sheetOpen = false }) {
  const matches = state.matches || [];
  const [tab, setTab] = useState(initialMatch ? 'matches' : 'club');
  const seasons = [...new Set([state.seasonNumber, ...matches.map((m) => m.season)])].sort((a, b) => b - a);
  const [season, setSeason] = useState(state.seasonNumber);
  // initialMatch : 'last' (dernier match) ou la fiche d'un match (ouverte depuis le calendrier)
  const [open, setOpen] = useState(initialMatch === 'last' ? matches[matches.length - 1] || null : initialMatch && typeof initialMatch === 'object' ? initialMatch : null);
  const [career, setCareer] = useState(null); // fiche carrière ouverte (identifiant du joueur)
  const go = (d) => {
    const i = matches.indexOf(open);
    const next = matches[(i + d + matches.length) % matches.length];
    if (next) setOpen(next);
  };
  const onEscape = () => { if (career) setCareer(null); else if (open) setOpen(null); else onClose(); };
  const pick = (id) => { // chaque onglet s'ouvre en haut de sa liste
    setTab(id);
    document.querySelector('.panel.lg .panel-body')?.scrollTo(0, 0);
  };
  return (
    <Panel
      id="stats"
      size="lg"
      title="Statistiques"
      eyebrow={`${plural(matches.length, 'match enregistré', 'matchs enregistrés')}`}
      onClose={onClose}
      onEscape={sheetOpen ? () => {} : onEscape}
      toolbar={(
        <Tabs items={[['club', 'Le club'], ['matches', 'Matchs'], ['players', 'Joueurs']]} value={tab} onChange={pick} />
      )}
      overlay={(
        <>
          <Presence>{open && <StatsPass state={state} m={open} matches={matches} onClose={() => setOpen(null)} onPrev={() => go(-1)} onNext={() => go(1)} onCareer={setCareer} />}</Presence>
          <Presence>{career !== null && <PlayerCareer state={state} id={career} onClose={() => setCareer(null)} onSheet={onPlayerSheet} />}</Presence>
          {sheet}
        </>
      )}
    >
      {tab === 'club' && (
        <>
          {seasons.length > 1 && (
            <div className="chips">{seasons.map((n) => <button key={n} className={season === n ? 'active' : ''} onClick={() => setSeason(n)}>Saison {n}</button>)}</div>
          )}
          <ClubTab state={state} matches={matches} season={season} onOpen={setOpen} onCareer={setCareer} />
        </>
      )}
      {tab === 'matches' && <MatchesTab matches={matches} onOpen={setOpen} />}
      {tab === 'players' && <PlayersTab state={state} onCareer={setCareer} />}
    </Panel>
  );
}
