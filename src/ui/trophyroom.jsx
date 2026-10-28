import React, { useLayoutEffect, useRef, useState } from 'react';
import { STAGES } from '../game/cups';
import { HONOURS, honoursOf, plural } from '../game/honours';
import { ACH_CATS, achievementsFor } from '../game/achievements';
import { rebuildRecords } from '../game/records';
import { allCareers } from '../game/career';
import { activeChapter, chaptersOf, rewardOf } from '../game/journey';
import { fmtMoney, fmtNum } from './format';
import { SectionHead, Stat } from './kit';
import { Panel } from './panels';
import { Tabs } from './glass';

// Salle des trophées et succès (clic sur le parvis) : le palmarès (un trophée par compétition, ses victoires), le
// parcours de carrière (journey.js), les succès datés de la vie du club, et les records de toujours.

const IMG = (id) => `${import.meta.env.BASE_URL}ui/trophies/${id}.webp`;
const when = (d) => (d ? `Saison ${d.season}${d.round ? ` · journée ${d.round}` : ''}` : '');
const compLabel = (d) => (d.comp === 'cup' ? `Coupe nationale · ${STAGES[d.stage] || ''}` : d.comp === 'c1' ? `Coupe d’Europe · ${STAGES[d.stage] || ''}` : `Saison ${d.season} · journée ${d.round}`);
const matchCtx = (d) => `${d.opp ? `contre ${d.opp} · ` : ''}${d.comp && d.comp !== 'league' ? `${compLabel(d)} (saison ${d.season})` : when(d)}`;

const HINTS = {
  league1: 'Finir premier de Départementale.', league2: 'Finir premier de Régionale.', league3: 'Finir premier de Nationale.',
  league4: 'Finir premier de l’Élite.', cup: 'Aller au bout de la Coupe nationale.', c1: 'Gagner la Coupe d’Europe des clubs.',
};

function Honours({ state }) {
  const won = new Map(honoursOf(state).map((h) => [h.id, h]));
  const total = [...won.values()].reduce((n, h) => n + h.count, 0);
  return (
    <>
      <SectionHead label="Palmarès" aside={total ? `${plural(won.size, 'trophée')} · ${plural(total, 'victoire')}` : 'vitrine vide'} />
      {!won.size && <p className="st-muted">Le parvis attend son premier trophée : chaque compétition gagnée y prend place, sur son socle.</p>}
      <div className="tr-grid">
        {HONOURS.map((d) => {
          const h = won.get(d.id);
          return (
            <article key={d.id} className={`tr-card ${h ? 'on' : 'locked'} ${d.id === 'c1' ? 'c1' : ''}`}>
              <div className="tr-img"><img src={IMG(d.id)} alt={d.trophy} loading="lazy" />{h && <b className="tr-count">×{h.count}</b>}</div>
              <div className="tr-body">
                <span className="tr-eyebrow">{d.trophy}</span>
                <h4>{d.name}</h4>
                {h ? (
                  <>
                    <p className="tr-seasons">{h.wins.map((w, i) => <span key={i}>Saison {w.season}</span>)}</p>
                    {h.wins.some((w) => w.opp) && <p className="tr-meta">Dernière finale gagnée contre {[...h.wins].reverse().find((w) => w.opp).opp}</p>}
                  </>
                ) : <p className="tr-meta">{HINTS[d.id]}</p>}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

// Parcours de carrière (0.8.11, « frise dorée » choisie par le PDG) : le chapitre en cours en grande carte (objectif,
// avancée en chiffres nets, prime en médaille), puis la frise des chapitres reliés par un fil d'or : accomplis pleins et
// datés, à venir éteints avec leur prime.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function Prize({ reward, className = '' }) {
  return (
    <span className={`jr-prize ${className}`}>
      <b>{reward.short}</b>
      {reward.extra && <em>{reward.extra}</em>}
    </span>
  );
}
function Career({ state }) {
  const list = chaptersOf(state);
  const done = state.journey?.done || {};
  const cur = activeChapter(state);
  const n = list.filter((c) => done[c.id]).length;
  return (
    <>
      <SectionHead label="Parcours de carrière" aside={`${n} / ${list.length} chapitres`} />
      {cur ? (
        <section className="jr-hero" aria-label={`Chapitre en cours : ${cur.chapter.title}`}>
          <span className="jr-kicker">Chapitre {ROMAN[cur.index]} · en cours</span>
          <h4>{cur.chapter.title}</h4>
          <p>{cur.chapter.goal}</p>
          <div className="jr-meter">
            <span className="jr-track" aria-hidden="true"><i style={{ width: `${Math.round(cur.progress.ratio * 100)}%` }} /></span>
            <span className="jr-count"><b>{cur.progress.cur}</b><span>/ {cur.progress.max}</span><em>{cur.progress.unit}</em></span>
          </div>
          <Prize reward={cur.reward} className="hero" />
        </section>
      ) : (
        <section className="jr-hero done">
          <span className="jr-kicker">Parcours accompli</span>
          <h4>Tous les chapitres sont écrits</h4>
          <p>Le club a gravi chaque marche de sa carrière.</p>
        </section>
      )}
      <ol className="jr-line">
        {list.map((c, i) => {
          const d = done[c.id];
          const live = cur?.chapter.id === c.id;
          return (
            <li key={c.id} className={d ? 'on' : live ? 'live' : 'next'}>
              <span className="jr-node" aria-hidden="true">{ROMAN[i]}</span>
              <div className="jr-text">
                <b>{c.title}</b>
                <span>{c.goal}</span>
              </div>
              {d ? <span className="jr-when">{d.season ? `Saison ${d.season}` : 'Acquis'}</span> : <Prize reward={rewardOf(state, c)} />}
            </li>
          );
        })}
      </ol>
      <p className="jr-lead">Chaque chapitre verse sa prime dès qu’il est accompli. Les objectifs du conseil, eux, se jouent saison par saison.</p>
    </>
  );
}

// focus : succès tout juste débloqués (notification touchée) : la liste s'ouvre sur eux, mis en évidence.
function Achievements({ state, focus = [] }) {
  const have = state.achievements || {};
  const all = achievementsFor(state); // une ligue entre amis n'affiche que ce qu'elle peut gagner
  const n = all.filter((a) => have[a.id]).length;
  const root = useRef(null);
  useLayoutEffect(() => {
    // le panneau arrive déjà positionné : le premier succès mis en évidence au milieu de la liste (on ne fait défiler
    // que la liste, jamais l'écran du jeu)
    if (!focus.length) return;
    const body = root.current?.closest('.panel-body');
    const el = body?.querySelector('.ach-list li.focus');
    if (!body || !el) return;
    const dy = el.getBoundingClientRect().top - body.getBoundingClientRect().top;
    body.scrollTop += dy - (body.clientHeight - el.offsetHeight) / 2;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <SectionHead label="Succès" aside={`${n} / ${all.length}`} />
      <div ref={root} className="ach-progress" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={n}>
        <i style={{ width: `${(n / all.length) * 100}%` }} />
      </div>
      {ACH_CATS.map(([cat, label]) => {
        const list = all.filter((a) => a.cat === cat);
        if (!list.length) return null;
        return (
          <section key={cat} className="ach-cat">
            <h5>{label}<em>{list.filter((a) => have[a.id]).length} / {list.length}</em></h5>
            <ul className="ach-list">
              {list.map((a) => {
                const d = have[a.id];
                const lit = focus.includes(a.id);
                return (
                  <li key={a.id} className={`${d ? 'on' : ''} ${lit ? 'focus' : ''}`}>
                    <span className="ach-medal" aria-hidden="true" />
                    <div><b>{a.title}{lit && <i className="ach-new">Nouveau</i>}</b><span>{a.desc}</span></div>
                    <em>{d ? when(d) : 'À débloquer'}</em>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Records({ state }) {
  const r = state.records || rebuildRecords(state);
  const t = r.totals;
  const careers = allCareers(state);
  const bestSeason = careers.flatMap((c) => c.hist.map((h) => ({ name: c.p.name, goals: h.goals || 0, season: h.season }))).sort((a, b) => b.goals - a.goals)[0];
  const scorer = [...careers].sort((a, b) => b.totals.goals - a.totals.goals)[0];
  const loyal = [...careers].sort((a, b) => b.totals.apps - a.totals.apps)[0];
  const sale = [...(state.alumni || [])].filter((a) => a.fee).sort((a, b) => b.fee - a.fee)[0];
  const span = (b) => (!b ? '' : when(b.from) === when(b.to) ? when(b.to) : `${when(b.from)} → ${when(b.to)}`);
  const rows = [
    r.bestWin && ['Plus large victoire', `${r.bestWin.gf}–${r.bestWin.ga}`, matchCtx(r.bestWin)],
    r.worstLoss && ['Plus lourde défaite', `${r.worstLoss.gf}–${r.worstLoss.ga}`, matchCtx(r.worstLoss)],
    r.mostGoals && ['Match le plus prolifique', plural(r.mostGoals.gf + r.mostGoals.ga, 'but'), `${r.mostGoals.gf}–${r.mostGoals.ga} ${matchCtx(r.mostGoals)}`],
    r.best.win && ['Plus longue série de victoires', plural(r.best.win.n, 'match'), span(r.best.win)],
    r.best.unbeaten && ['Plus longue série sans défaite', plural(r.best.unbeaten.n, 'match'), span(r.best.unbeaten)],
    r.best.clean && ['Plus longue série sans encaisser', plural(r.best.clean.n, 'match'), span(r.best.clean)],
    r.crowd && ['Record d’affluence', `${fmtNum(r.crowd.attendance)} spectateurs`, matchCtx(r.crowd)],
    r.gate && ['Recette record', fmtMoney(r.gate.revenue), matchCtx(r.gate)],
    bestSeason?.goals > 0 && ['Meilleur buteur sur une saison', plural(bestSeason.goals, 'but'), `${bestSeason.name} · Saison ${bestSeason.season}`],
    scorer?.totals.goals > 0 && ['Meilleur buteur de l’histoire', plural(scorer.totals.goals, 'but'), scorer.p.name],
    loyal?.totals.apps > 0 && ['Le plus capé', plural(loyal.totals.apps, 'match'), loyal.p.name],
    sale && ['Plus grosse vente', fmtMoney(sale.fee), `${sale.name}${sale.club ? ` · vers ${sale.club}` : ''} · Saison ${sale.left}`],
    r.bestBuy && ['Plus gros achat', fmtMoney(r.bestBuy.fee), `${r.bestBuy.name} · Saison ${r.bestBuy.season}`],
  ].filter(Boolean);
  return (
    <>
      <SectionHead label="Bilan de toujours" aside={plural(t.played, 'match')} />
      {t.played ? (
        <div className="st-tiles">
          <Stat label="Victoires" value={fmtNum(t.win)} sub={`${t.draw} N · ${t.loss} D`} />
          <Stat label="Buts" value={`${fmtNum(t.gf)} – ${fmtNum(t.ga)}`} sub={`diff. ${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}`} />
          <Stat label="Cages inviolées" value={fmtNum(t.clean)} sub={t.played ? `${Math.round((t.clean / t.played) * 100)} % des matchs` : ''} />
        </div>
      ) : <p className="st-muted">Aucun match joué pour l’instant.</p>}
      {rows.length > 0 && (
        <>
          <SectionHead label="Records du club" />
          <ul className="st-records rec-list">
            {rows.map(([label, value, ctx]) => <li key={label}><span>{label}<em>{ctx}</em></span><b>{value}</b></li>)}
          </ul>
        </>
      )}
    </>
  );
}

export function TrophyRoom({ state, initialTab = 'honours', focus = [], onClose }) {
  const [tab, setTab] = useState(initialTab);
  const won = honoursOf(state).length;
  const pick = (id) => {
    setTab(id);
    document.querySelector('.panel.lg .panel-body')?.scrollTo(0, 0);
  };
  return (
    <Panel
      id="trophies"
      size="lg"
      title="Salle des trophées"
      eyebrow={won ? `Allée d’honneur · ${plural(won, 'trophée')}` : 'Allée d’honneur'}
      onClose={onClose}
      toolbar={<Tabs items={[['honours', 'Palmarès'], ['career', 'Carrière'], ['achievements', 'Succès'], ['records', 'Records']]} value={tab} onChange={pick} />}
    >
      {tab === 'honours' && <Honours state={state} />}
      {tab === 'career' && <Career state={state} />}
      {tab === 'achievements' && <Achievements state={state} focus={focus} />}
      {tab === 'records' && <Records state={state} />}
    </Panel>
  );
}
