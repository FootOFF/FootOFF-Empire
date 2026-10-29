import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { STAGES } from '../game/cups';
import { HONOURS, honoursOf } from '../game/honours';
import { ACH_CATS, MONEY_ACHIEVEMENTS, achievementProgress, achievementsFor } from '../game/achievements';
import { IconCheck, IconLeague, IconLock, IconPitch, IconStadium, IconStar, IconTrophy, IconUsers } from './icons';
import { uiSound } from './uisound';
import { rebuildRecords } from '../game/records';
import { allCareers } from '../game/career';
import { activeChapter, chaptersOf, rewardOf } from '../game/journey';
import { fmtMoney, fmtNum } from './format';
import { SectionHead, Stat } from './kit';
import { Panel } from './panels';
import { Tabs } from './glass';
import { plural, t, tr } from '../i18n/index';

// Salle des trophées et succès (clic sur le parvis) : le palmarès (un trophée par compétition, ses victoires), le
// parcours de carrière (journey.js), les succès datés de la vie du club, et les records de toujours.

const IMG = (id) => `${import.meta.env.BASE_URL}ui/trophies/${id}.webp`;
const when = (d) => (d ? t('Saison {season}{v}', { season: d.season, v: d.round ? t(' · journée {round}', { round: d.round }) : '' }) : '');
const compLabel = (d) => (d.comp === 'cup' ? t('Coupe nationale · {v}', { v: STAGES[d.stage] || '' }) : d.comp === 'c1' ? t('Coupe d’Europe · {v}', { v: STAGES[d.stage] || '' }) : t('Saison {season} · journée {round}', { season: d.season, round: d.round }));
const matchCtx = (d) => `${d.opp ? t('contre {opp} · ', { opp: d.opp }) : ''}${d.comp && d.comp !== 'league' ? t('{compLabel} (saison {season})', { compLabel: compLabel(d), season: d.season }) : when(d)}`;

const HINTS = {
  league1: t('Finir premier de Départementale.'), league2: t('Finir premier de Régionale.'), league3: t('Finir premier de Nationale.'),
  league4: t('Finir premier de l’Élite.'), cup: t('Aller au bout de la Coupe nationale.'), c1: t('Gagner la Coupe d’Europe des clubs.'),
};

function Honours({ state }) {
  const won = new Map(honoursOf(state).map((h) => [h.id, h]));
  const total = [...won.values()].reduce((n, h) => n + h.count, 0);
  return (
    <>
      <SectionHead label={t('Palmarès')} aside={total ? `${plural(won.size, 'trophée')} · ${plural(total, 'victoire')}` : t('vitrine vide')} />
      {!won.size && <p className="st-muted">{t('Le parvis attend son premier trophée : chaque compétition gagnée y prend place, sur son socle.')}</p>}
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
                    <p className="tr-seasons">{h.wins.map((w, i) => <span key={i}>{tr('Saison <0/>', [w.season])}</span>)}</p>
                    {h.wins.some((w) => w.opp) && <p className="tr-meta">{tr('Dernière finale gagnée contre <0/>', [[...h.wins].reverse().find((w) => w.opp).opp])}</p>}
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
      <SectionHead label={t('Parcours de carrière')} aside={t('{n} / {length} chapitres', { n, length: list.length })} />
      {cur ? (
        <section className="jr-hero" aria-label={t('Chapitre en cours : {title}', { title: cur.chapter.title })}>
          <span className="jr-kicker">{tr('Chapitre <0/> · en cours', [ROMAN[cur.index]])}</span>
          <h4>{cur.chapter.title}</h4>
          <p>{cur.chapter.goal}</p>
          <div className="jr-meter">
            <span className="jr-track" aria-hidden="true"><i style={{ width: `${Math.round(cur.progress.ratio * 100)}%` }} /></span>
            <span className="jr-count"><bdi><b>{cur.progress.cur}</b><span>/ {cur.progress.max}</span></bdi><em>{cur.progress.unit}</em></span>
          </div>
          <Prize reward={cur.reward} className="hero" />
        </section>
      ) : (
        <section className="jr-hero done">
          <span className="jr-kicker">{t('Parcours accompli')}</span>
          <h4>{t('Tous les chapitres sont écrits')}</h4>
          <p>{t('Le club a gravi chaque marche de sa carrière.')}</p>
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
              {d ? <span className="jr-when">{d.season ? t('Saison {season}', { season: d.season }) : t('Acquis')}</span> : <Prize reward={rewardOf(state, c)} />}
            </li>
          );
        })}
      </ol>
      <p className="jr-lead">{t('Chaque chapitre verse sa prime dès qu’il est accompli. Les objectifs du conseil, eux, se jouent saison par saison.')}</p>
    </>
  );
}

// Succès (0.8.16, demande du PDG : un affichage de jeu professionnel) : en tête, le total et une tuile par famille (sa
// part obtenue, elle filtre la liste), puis Tous / Obtenus / À obtenir. Chaque succès : un médaillon au pictogramme de
// sa famille (doré obtenu, gris à obtenir), le titre, la règle, et une ligne d'état sous la règle (date d'obtention,
// progression d'un succès à compteur, ou « À obtenir ») : plus de colonne de droite qui se coupait en deux lignes.
// focus : succès tout juste débloqués (notification touchée) : la liste s'ouvre sur eux, mis en évidence.
const FAMILY_ICON = { honours: IconTrophy, matches: IconPitch, players: IconUsers, club: IconStadium, league: IconLeague };
const SHOW = [['all', t('Tous')], ['got', t('Obtenus')], ['todo', t('À obtenir')]];
function Achievements({ state, focus = [] }) {
  const have = state.achievements || {};
  const all = achievementsFor(state); // une ligue entre amis n'affiche que ce qu'elle peut gagner
  const n = all.filter((a) => have[a.id]).length;
  const prog = useMemo(() => achievementProgress(state), [state]);
  const [fam, setFam] = useState('all');
  const [show, setShow] = useState('all');
  const fams = ACH_CATS.filter(([cat]) => all.some((a) => a.cat === cat));
  const keep = (a) => (fam === 'all' || a.cat === fam) && (show === 'all' || (show === 'got') === !!have[a.id]);
  const pickFam = (cat) => { if (cat !== fam) uiSound('tab'); setFam(cat); };
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
  const sections = fams.map(([cat, label]) => [cat, label, all.filter((a) => a.cat === cat && keep(a))]).filter(([, , list]) => list.length);
  const amount = (id, v) => (MONEY_ACHIEVEMENTS.has(id) ? fmtMoney(v) : fmtNum(v));
  return (
    <div ref={root} className="ach">
      <div className="ach-fams" role="tablist" aria-label={t('Familles de succès')}>
        <button type="button" role="tab" aria-selected={fam === 'all'} className={`ach-sum ${fam === 'all' ? 'on' : ''}`} onClick={() => pickFam('all')}>
          <span className="ach-sum-count"><b><bdi>{n}</bdi></b><span><bdi>/ {all.length}</bdi></span></span>
          <span className="ach-sum-side">
            <span className="ach-sum-label">{t('Tous les succès')}</span>
            <span className="ach-sum-pct"><bdi>{Math.round((n / all.length) * 100)} %</bdi></span>
            <i className="ach-progress" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={n} style={{ '--p': `${(n / all.length) * 100}%` }} />
          </span>
        </button>
        {fams.map(([cat, label]) => {
          const Icon = FAMILY_ICON[cat] || IconStar;
          const list = all.filter((a) => a.cat === cat);
          const got = list.filter((a) => have[a.id]).length;
          return (
            <button key={cat} type="button" role="tab" aria-selected={fam === cat} className={`ach-fam ${fam === cat ? 'on' : ''}`} onClick={() => pickFam(fam === cat ? 'all' : cat)}>
              <span className="ach-fam-top"><Icon /><b><bdi>{got}/{list.length}</bdi></b></span>
              <span className="ach-fam-label">{label}</span>
              <i className="ach-fam-bar" style={{ '--p': `${(got / list.length) * 100}%` }} />
            </button>
          );
        })}
      </div>
      <Tabs className="ach-show" role="radiogroup" label={t('Succès à afficher')} items={SHOW} value={show} onChange={setShow} />
      {!sections.length && <p className="ach-empty">{show === 'got' ? t('Aucun succès obtenu dans cette famille pour l’instant.') : t('Tous les succès de cette famille sont obtenus.')}</p>}
      {sections.map(([cat, label, list]) => {
        const Icon = FAMILY_ICON[cat] || IconStar;
        const fullList = all.filter((a) => a.cat === cat);
        return (
          <section key={cat} className="ach-cat">
            {fam === 'all' && <h5><Icon />{label}<em><bdi>{fullList.filter((a) => have[a.id]).length} / {fullList.length}</bdi></em></h5>}
            <ul className="ach-list">
              {list.map((a) => {
                const d = have[a.id];
                const lit = focus.includes(a.id);
                const p = !d && prog[a.id];
                return (
                  <li key={a.id} className={`${d ? 'on' : 'off'} ${lit ? 'focus' : ''}`}>
                    <span className="ach-medal" aria-hidden="true"><Icon /></span>
                    <div className="ach-text">
                      <b>{a.title}</b>
                      <span className="ach-desc">{a.desc}</span>
                      {d ? (
                        <span className="ach-state">{lit && <i className="ach-new">{t('Nouveau')}</i>}<IconCheck /><span>{t('Obtenu')} · <bdi>{when(d)}</bdi></span></span>
                      ) : p ? (
                        <span className="ach-state ach-count">
                          <i className="ach-bar" style={{ '--p': `${(p[0] / p[1]) * 100}%` }} />
                          <bdi>{amount(a.id, p[0])} / {amount(a.id, p[1])}</bdi>
                        </span>
                      ) : (
                        <span className="ach-state"><IconLock /><span>{t('À obtenir')}</span></span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Records({ state }) {
  const r = state.records || rebuildRecords(state);
  const row = r.totals;
  const careers = allCareers(state);
  const bestSeason = careers.flatMap((c) => c.hist.map((h) => ({ name: c.p.name, goals: h.goals || 0, season: h.season }))).sort((a, b) => b.goals - a.goals)[0];
  const scorer = [...careers].sort((a, b) => b.totals.goals - a.totals.goals)[0];
  const loyal = [...careers].sort((a, b) => b.totals.apps - a.totals.apps)[0];
  const sale = [...(state.alumni || [])].filter((a) => a.fee).sort((a, b) => b.fee - a.fee)[0];
  const span = (b) => (!b ? '' : when(b.from) === when(b.to) ? when(b.to) : `${when(b.from)} → ${when(b.to)}`);
  const rows = [
    r.bestWin && [t('Plus large victoire'), `${r.bestWin.gf}–${r.bestWin.ga}`, matchCtx(r.bestWin)],
    r.worstLoss && [t('Plus lourde défaite'), `${r.worstLoss.gf}–${r.worstLoss.ga}`, matchCtx(r.worstLoss)],
    r.mostGoals && [t('Match le plus prolifique'), plural(r.mostGoals.gf + r.mostGoals.ga, 'but'), `${r.mostGoals.gf}–${r.mostGoals.ga} ${matchCtx(r.mostGoals)}`],
    r.best.win && [t('Plus longue série de victoires'), plural(r.best.win.n, 'match'), span(r.best.win)],
    r.best.unbeaten && [t('Plus longue série sans défaite'), plural(r.best.unbeaten.n, 'match'), span(r.best.unbeaten)],
    r.best.clean && [t('Plus longue série sans encaisser'), plural(r.best.clean.n, 'match'), span(r.best.clean)],
    r.crowd && [t('Record d’affluence'), t('{fmt} spectateurs', { fmt: fmtNum(r.crowd.attendance) }), matchCtx(r.crowd)],
    r.gate && [t('Recette record'), fmtMoney(r.gate.revenue), matchCtx(r.gate)],
    bestSeason?.goals > 0 && [t('Meilleur buteur sur une saison'), plural(bestSeason.goals, 'but'), t('{name} · Saison {season}', { name: bestSeason.name, season: bestSeason.season })],
    scorer?.totals.goals > 0 && [t('Meilleur buteur de l’histoire'), plural(scorer.totals.goals, 'but'), scorer.p.name],
    loyal?.totals.apps > 0 && [t('Le plus capé'), plural(loyal.totals.apps, 'match'), loyal.p.name],
    sale && [t('Plus grosse vente'), fmtMoney(sale.fee), t('{name}{v} · Saison {left}', { name: sale.name, v: sale.club ? t(' · vers {club}', { club: sale.club }) : '', left: sale.left })],
    r.bestBuy && [t('Plus gros achat'), fmtMoney(r.bestBuy.fee), t('{name} · Saison {season}', { name: r.bestBuy.name, season: r.bestBuy.season })],
  ].filter(Boolean);
  return (
    <>
      <SectionHead label={t('Bilan de toujours')} aside={plural(row.played, 'match')} />
      {row.played ? (
        <div className="st-tiles">
          <Stat label={t('Victoires')} value={fmtNum(row.win)} sub={t('{draw} N · {loss} D', { draw: row.draw, loss: row.loss })} />
          <Stat label={t('Buts')} value={`${fmtNum(row.gf)} – ${fmtNum(row.ga)}`} sub={t('diff. {v}{v2}', { v: row.gf - row.ga > 0 ? '+' : '', v2: row.gf - row.ga })} />
          <Stat label={t('Cages inviolées')} value={fmtNum(row.clean)} sub={row.played ? t('{round} % des matchs', { round: Math.round((row.clean / row.played) * 100) }) : ''} />
        </div>
      ) : <p className="st-muted">{t('Aucun match joué pour l’instant.')}</p>}
      {rows.length > 0 && (
        <>
          <SectionHead label={t('Records du club')} />
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
      title={t('Salle des trophées')}
      eyebrow={won ? t('Allée d’honneur · {plural}', { plural: plural(won, 'trophée') }) : t('Allée d’honneur')}
      onClose={onClose}
      toolbar={<Tabs items={[['honours', t('Palmarès')], ['career', t('Carrière')], ['achievements', t('Succès')], ['records', t('Records')]]} value={tab} onChange={pick} />}
    >
      {tab === 'honours' && <Honours state={state} />}
      {tab === 'career' && <Career state={state} />}
      {tab === 'achievements' && <Achievements state={state} focus={focus} />}
      {tab === 'records' && <Records state={state} />}
    </Panel>
  );
}
