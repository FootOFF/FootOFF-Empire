import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import { ATTRS, GK_ATTRS, costOf, playerRating, potentialRange, wageOf } from '../game/players';
import {
  BUYERS, CANDIDATES, SALE_TRIES, TRIES, acceptChance, auctionDone, ceilTo, demandChance, findOnMarket, fitGain,
  listingOutlook, offerBlock, offersFor, outbidChance, pctOf, pendingCounters, poolOf, roundKey, roundTo, saleReasons,
  stanceOf, stepFor, tagsOf, valueOf,
} from '../game/mercato';
import {
  acceptCounter, answerOffer, demandOffer, makeOffer, setForSale, startAuction, toggleShortlist,
} from '../game/engine';
import { listedToday } from '../game/transfers';
import { endOfSeasonForecast, officeSize, seasonForecast } from '../game/economy';
import { standingsOf } from '../game/season';
import { capitalize, clubAfter, isPluralClub, withArticle } from '../game/names';
import { Crest } from './crest';
import { fmtMoney, fmtRating } from './format';
import { Tabs } from './glass';
import { IconCheck, IconChevron, IconClose, IconRadar, IconSearch, IconStar, IconTransfer, IconTrend } from './icons';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { haptic } from './haptics';
import { Portrait } from './portrait';

// Mercato : un seul marché pour recruter (joueurs libres et joueurs sous contrat), des offres négociées, une liste
// de joueurs suivis, la vente de ses propres joueurs (mise en vente à son prix, clubs intéressés, négociation face à
// face, enchères) et le bilan des transferts. Le marché bouge à chaque journée (transfers.js) ; les chances affichées
// sont celles qui décident (mercato.js).

const POS_FILTERS = [['all', 'Tous'], ['G', 'Gardiens'], ['D', 'Défense'], ['M', 'Milieu'], ['A', 'Attaque']];
const KINDS = [['all', 'Tous'], ['free', 'Libres'], ['pro', 'Sous contrat']];
const SORTS = [['fit', 'Pour mon onze'], ['lvl', 'Niveau'], ['price', 'Prix'], ['pot', 'Potentiel'], ['age', 'Âge']];
const TAG = {
  new: ['Nouveau', 'new'], gem: ['Pépite', 'gold'], bargain: ['Bonne affaire', 'good'], falling: ['Prix en baisse', 'good'],
  rising: ['Prix en hausse', 'warn'], lastyear: ['Fin de contrat', 'good'],
};
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
export function heat(v, ref) { // même code couleur que l'Effectif : fort, bon, faible pour la division
  if (v >= ref + 3) return 'hi';
  if (v >= ref + 1) return 'good';
  if (v <= ref - 2) return 'low';
  return '';
}
const potMid = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 : playerRating(p); };
// rang d'un joueur pour la division (teinte de sa carte, comme dans l'Effectif) : élite, or, argent, bronze
const tierOf = (r, ref) => (r >= ref + 3 ? 'elite' : r >= ref + 1 ? 'gold' : r <= ref - 2 ? 'bronze' : 'silver');
// recherche sans accents ni majuscules (« leo » trouve « Léo »)
const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;
// noms de clubs dans une phrase : l'article et l'accord du verbe (« l'AS … accepte », « les Bleus … acceptent »)
const Club = (c) => capitalize(withArticle(c));
const agree = (c, one, many) => (isPluralClub(c) ? many : one);
const vsAsk = (offer, ask) => {
  if (offer === ask) return 'au prix demandé';
  const d = Math.max(1, Math.round(Math.abs(offer / ask - 1) * 100));
  return `${d} % ${offer < ask ? 'sous le' : 'au-dessus du'} prix demandé`;
};

// Effet d'une dépense ou d'un salaire en plus sur la fin de saison prévue et la part des salaires.
function impactOf(state, wageDelta, cash) {
  const wages = state.players.reduce((a, q) => a + wageOf(q, state.divisionIndex), 0);
  const position = standingsOf(state).findIndex((t) => t.i === 0) + 1;
  const endNow = endOfSeasonForecast(state, position, wages).end;
  return {
    endNow, endAfter: endNow - cash - wageDelta,
    share: seasonForecast(state, wages).wageShare, shareAfter: seasonForecast(state, wages + wageDelta).wageShare,
  };
}

// --- Carte d'un joueur du marché ----------------------------------------------------------------------------

export function MarketCard({ p, state, refLvl, followed, recommended, onOpen, onCompare, onFollow, onOffer, note = null, noteTone = 'note' }) {
  const r = playerRating(p);
  const price = costOf(p, state);
  const pot = potentialRange(p, state);
  const gain = fitGain(state, p);
  const tags = tagsOf(state, p).filter((t) => t !== 'courted');
  const talks = p.talks || {};
  const full = state.players.length >= SQUAD_MAX;
  return (
    <li className={`mc-card t-${tierOf(r, refLvl)} ${recommended ? 'rec' : ''} ${p.club ? 'pro' : 'free'}`}>
      <div className="mc-head">
        <button type="button" className="mc-main" onClick={() => onOpen(p)} aria-label={`Fiche de ${p.name}`}>
          <span className="mc-face">
            <Portrait p={p} size={58} club={p.club || null} free={!p.club} />
            <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          </span>
          <span className="mc-id">
            <span className="mc-name">{p.name}</span>
            <span className="mc-club">
              {p.club ? (
                <><Crest name={p.club} className="mc-crest" /><span className="mc-club-name">{p.club}</span></>
              ) : <span className="mc-free">Joueur libre</span>}
            </span>
            <span className="mc-pot">{p.age} ans · {POS_LABELS[p.pos]} · salaire {fmtMoney(wageOf(p, state.divisionIndex))}</span>
          </span>
        </button>
        <div className="mc-quick">
          <button type="button" className={`mc-icon ${followed ? 'on' : ''}`} aria-pressed={followed} onClick={() => onFollow(p)} title={followed ? 'Ne plus suivre' : 'Suivre ce joueur'} aria-label={followed ? `Ne plus suivre ${p.name}` : `Suivre ${p.name}`}><IconStar /></button>
          <button type="button" className="mc-icon" onClick={() => onCompare(p)} title="Comparer" aria-label={`Comparer ${p.name}`}><IconRadar /></button>
        </div>
      </div>
      {/* points forts en grand, puis le niveau et la fourchette du potentiel sur l'échelle de 0 à 20 */}
      <div className="mc-body">
        <span className="mc-stats">
          {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}><b>{Math.round(a.v)}</b><em>{a.short}</em></span>)}
        </span>
        <span className="mc-potential">
          <span className="mc-potential-top"><em>Potentiel</em><b>{pot ? `${fmtRating(pot[0])} – ${fmtRating(pot[1])}` : 'atteint'}</b></span>
          <span className="sh-scale" aria-hidden="true">
            <i className="now" style={{ width: `${(r / 20) * 100}%` }} />
            {pot && <i className="pot" style={{ left: `${(pot[0] / 20) * 100}%`, width: `${((pot[1] - pot[0]) / 20) * 100}%` }} />}
          </span>
        </span>
      </div>
      {(recommended || gain >= 0.3 || tags.length > 0 || p.interest > 0 || note) && (
        <div className="mc-tags">
          {recommended && <span className="mc-tag rec">Recommandé</span>}
          {gain >= 0.3 && <span className="mc-tag good" title="Gain sur le titulaire le plus faible à son poste">Onze +{fmtRating(gain)}</span>}
          {p.interest > 0 && <span className="mc-tag warn">Courtisé{p.interest > 1 ? ` par ${p.interest} clubs` : ''}</span>}
          {tags.map((t) => <span key={t} className={`mc-tag ${TAG[t][1]}`}>{TAG[t][0]}</span>)}
          {note && <span className={`mc-tag ${noteTone}`}>{note}</span>}
        </div>
      )}
      <div className="mc-foot">
        <span className="mc-price">
          <span className="mc-price-top">
            <b className={price > state.money ? 'over' : ''}>{fmtMoney(price)}</b>
            {p.trend ? <IconTrend className={`mc-trend ${p.trend > 0 ? 'up' : 'down'}`} aria-label={p.trend > 0 ? 'prix en hausse' : 'prix en baisse'} /> : null}
          </span>
          <em>{p.club ? `indemnité · contrat ${plural(p.contract, 'an', 'ans')}` : 'prime de signature'}</em>
        </span>
        <button
          type="button"
          className={`btn btn-sm mc-offer ${talks.counter ? 'counter' : ''}`}
          onClick={() => onOffer(p)}
          disabled={(full || talks.closed) && !talks.counter}
          title={full ? 'Effectif complet' : talks.closed ? 'Le vendeur ne discutera plus avant la prochaine journée' : ''}
        >
          {talks.counter ? 'Contre-offre' : talks.closed ? 'Discussions closes' : 'Faire une offre'}
        </button>
      </div>
    </li>
  );
}

// --- Tableau du marché (PC) ----------------------------------------------------------------------------------
// Une ligne par joueur, comme un écran de recruteur : portrait, nom, club et âge, poste, niveau, potentiel, ce qu'il
// apporterait au onze, les repères (recommandé, pépite, nouveau…), le prix ; suivre et faire une offre au bout de la
// ligne. Un clic sur la ligne ouvre sa fiche.
function MarketTable({ list, state, refLvl, followed, recommended, onOpen, onFollow, onOffer }) {
  const full = state.players.length >= SQUAD_MAX;
  return (
    <div className="mc-table-wrap">
      <table className="mc-table">
        <thead>
          <tr>
            <th className="c-who">Joueur</th><th>Poste</th><th>Niveau</th><th>Potentiel</th>
            <th title="Gain sur le titulaire le plus faible à son poste">Onze</th><th className="c-tags">Repères</th><th className="r">Prix</th><th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const r = playerRating(p);
            const price = costOf(p, state);
            const pot = potentialRange(p, state);
            const gain = fitGain(state, p);
            const tags = tagsOf(state, p).filter((t) => t !== 'courted');
            const talks = p.talks || {};
            const rec = p.id === recommended;
            const open = () => onOpen(p);
            return (
              <tr key={p.id} className={rec ? 'rec' : ''} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={`Fiche de ${p.name}`}>
                <td className="c-who">
                  <span className="mc-row-who">
                    <Portrait p={p} size={40} club={p.club || null} free={!p.club} />
                    <span className="mc-row-id">
                      <b>{p.name}</b>
                      <em>{p.club ? <><Crest name={p.club} className="mc-crest" />{p.club}</> : <><i className="mc-free-dot" />Joueur libre</>} · {p.age} ans</em>
                    </span>
                  </span>
                </td>
                <td><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>
                <td className={`c-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</td>
                <td className="c-pot">{pot ? `${fmtRating(pot[0])}–${fmtRating(pot[1])}` : 'atteint'}</td>
                <td className={`c-gain ${gain >= 0.05 ? 'up' : ''}`}>{gain >= 0.05 ? `+${fmtRating(gain)}` : '–'}</td>
                <td className="c-tags">
                  <span className="mc-row-tags">
                    {rec && <span className="mc-tag rec">Recommandé</span>}
                    {p.interest > 0 && <span className="mc-tag warn">Courtisé{p.interest > 1 ? ` · ${p.interest}` : ''}</span>}
                    {tags.map((t) => <span key={t} className={`mc-tag ${TAG[t][1]}`}>{TAG[t][0]}</span>)}
                  </span>
                </td>
                <td className="c-price">
                  <b className={price > state.money ? 'over' : ''}>{fmtMoney(price)}</b>
                  {p.trend ? <IconTrend className={`mc-trend ${p.trend > 0 ? 'up' : 'down'}`} aria-label={p.trend > 0 ? 'prix en hausse' : 'prix en baisse'} /> : null}
                </td>
                <td className="c-act" onClick={(e) => e.stopPropagation()}>
                  <span className="mc-row-act">
                    <button type="button" className={`mc-icon ${followed.has(p.id) ? 'on' : ''}`} aria-pressed={followed.has(p.id)} onClick={() => onFollow(p)}
                      title={followed.has(p.id) ? 'Ne plus suivre' : 'Suivre ce joueur'} aria-label={followed.has(p.id) ? `Ne plus suivre ${p.name}` : `Suivre ${p.name}`}><IconStar /></button>
                    <button type="button" className={`btn btn-sm mc-offer ${talks.counter ? 'counter' : ''}`} onClick={() => onOffer(p)}
                      disabled={(full || talks.closed) && !talks.counter} title={full ? 'Effectif complet' : talks.closed ? 'Le vendeur ne discutera plus avant la prochaine journée' : ''}>
                      {talks.counter ? 'Contre-offre' : talks.closed ? 'Closes' : 'Offre'}
                    </button>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MARKET_VIEW_KEY = 'fo-market-view';

// --- Recruter -------------------------------------------------------------------------------------------

function News({ state }) {
  const n = state.mercatoNews;
  if (!n || n.key !== roundKey(state)) return null;
  const parts = [];
  if (n.season) parts.push('Nouvelle saison : le marché est renouvelé');
  if (n.arrivals) parts.push(plural(n.arrivals, 'arrivée', 'arrivées'));
  if (n.departures) parts.push(plural(n.departures, 'joueur parti ailleurs', 'joueurs partis ailleurs'));
  if (n.offers) parts.push(plural(n.offers, 'offre reçue', 'offres reçues'));
  const courted = n.followedCourted || [];
  const gone = n.followedGone || [];
  if (!parts.length && !gone.length && !courted.length) return null;
  return (
    <div className="mc-news">
      <span className="eyebrow">{n.season ? 'Mercato' : 'Depuis la dernière journée'}</span>
      {parts.length > 0 && <p>{parts.join(' · ')}.</p>}
      {courted.length > 0 && (
        <p className="warn">{courted.join(', ')} {courted.length > 1 ? 'sont courtisés et risquent' : 'est courtisé et risque'} de partir avant la prochaine journée.</p>
      )}
      {gone.length > 0 && <p className="bad">{gone.join(', ')} {gone.length > 1 ? 'ont' : 'a'} signé ailleurs.</p>}
    </div>
  );
}

// Mode d'emploi en trois temps, à la première visite (jusqu'à « Compris »).
function HowTo({ run }) {
  return (
    <section className="mc-howto" aria-label="Comment marche le mercato">
      <ol>
        <li><b>Repère</b><span>Filtre, trie, suis les joueurs avec l’étoile : leur prix bouge à chaque journée.</span></li>
        <li><b>Négocie</b><span>Fais une offre : la jauge affiche tes vraies chances. Refusée, elle peut amener une contre-offre.</span></li>
        <li><b>Vends</b><span>Mets des joueurs en vente : les clubs font leurs offres après chaque journée.</span></li>
      </ol>
      <button type="button" className="linkbtn mc-howto-ok" onClick={() => run((s) => { s.mercatoTips = true; return s; })}>Compris</button>
    </section>
  );
}

// Réseau de recruteurs (bureau des transferts), en fin de liste : ce qu'il apporte, ou ce qu'il apporterait.
function Network({ state }) {
  const lvl = state.buildings.transfers || 0;
  return (
    <li className={`mc-net ${lvl ? '' : 'none'}`}>
      <span className="mc-net-ico"><IconTransfer /></span>
      {lvl ? (
        <p><b>Réseau de recrutement · bureau niveau {lvl}</b>{plural((state.transfers || []).length, 'joueur sous contrat suivi', 'joueurs sous contrat suivis')} par tes recruteurs · indemnités −{lvl * 3} % · vendeurs plus conciliants · potentiel mieux cerné.</p>
      ) : (
        <p><b>Envie de plus de choix ?</b>Sans réseau de recruteurs, seuls {officeSize(0)} joueurs sous contrat sont listés publiquement. Le Bureau des transferts (sur n’importe quelle parcelle libre) en suit {officeSize(1)} dès le niveau 1 et fait baisser les indemnités.</p>
      )}
    </li>
  );
}

// Tri : menu compact (le choix courant reste lisible, la liste s'ouvre au clic).
function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useKeydown((e) => { // Échap referme le menu, pas le panneau
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
  }, { capture: true });
  const current = SORTS.find(([id]) => id === value);
  return (
    <div className="mc-sortmenu" ref={ref}>
      <button type="button" className={`mc-sortbtn ${open ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Trier</span><b>{current[1]}</b><IconChevron />
      </button>
      {open && (
        <div className="mc-sortlist" role="listbox" aria-label="Trier par">
          {SORTS.map(([id, text]) => (
            <button key={id} type="button" role="option" aria-selected={id === value} className={id === value ? 'on' : ''} onClick={() => { onChange(id); setOpen(false); }}>
              {text}{id === value && <IconCheck />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BuyView({ state, run, refLvl, recommended, followed, onOpen, onCompare, onFollow, onOffer }) {
  const [pos, setPos] = useState('all');
  const [kind, setKind] = useState('all');
  const [only, setOnly] = useState({ afford: false, fit: false, gem: false });
  const [sort, setSort] = useState('fit');
  const [query, setQuery] = useState('');
  // PC : tableau (par défaut) ou cartes ; le téléphone garde les cartes
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem(MARKET_VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; } });
  const pickLayout = (v) => { setLayout(v); try { localStorage.setItem(MARKET_VIEW_KEY, v); } catch { /* préférence non conservée */ } };
  const toggle = (k) => setOnly((o) => ({ ...o, [k]: !o[k] }));
  const pool = poolOf(state);
  const list = useMemo(() => {
    const score = {
      fit: (p) => -(p.id === recommended ? 100 : 0) - fitGain(state, p) * 10 - playerRating(p) / 10,
      lvl: (p) => -playerRating(p), price: (p) => costOf(p, state), pot: (p) => -potMid(state, p), age: (p) => p.age,
    };
    const q = fold(query.trim());
    return pool
      .filter((p) => !q || fold(`${p.name} ${p.club || 'libre'}`).includes(q))
      .filter((p) => (pos === 'all' || p.pos === pos) && (kind === 'all' || (kind === 'free') === !p.club))
      .filter((p) => (!only.afford || costOf(p, state) <= state.money) && (!only.fit || fitGain(state, p) >= 0.3) && (!only.gem || tagsOf(state, p).includes('gem')))
      .sort((a, b) => score[sort](a) - score[sort](b));
  }, [state, pos, kind, only, sort, recommended, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (active, onClick, label, pressed = undefined) => (
    <button key={label} type="button" className={active ? 'active' : ''} aria-pressed={pressed} onClick={onClick}>{label}</button>
  );
  return (
    <>
      {!state.mercatoTips && <HowTo run={run} />}
      <News state={state} />
      <div className="mc-filters">
        <label className="mc-search">
          <IconSearch />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un joueur ou un club" aria-label="Rechercher un joueur ou un club" enterKeyHint="search" autoComplete="off" spellCheck={false} />
          {query && <button type="button" className="mc-search-clear" onClick={() => setQuery('')} aria-label="Effacer la recherche"><IconClose /></button>}
        </label>
        <div className="chips">
          {POS_FILTERS.map(([id, label]) => chip(pos === id, () => setPos(id), label))}
          <span className="mc-sep" aria-hidden="true" />
          {KINDS.map(([id, label]) => chip(kind === id, () => setKind(id), id === 'all' ? 'Tous statuts' : label))}
        </div>
        <div className="mc-filters-row">
          <div className="chips">
            {chip(only.afford, () => toggle('afford'), 'Dans mes moyens', only.afford)}
            {chip(only.fit, () => toggle('fit'), 'Renforce mon onze', only.fit)}
            {chip(only.gem, () => toggle('gem'), 'Pépites', only.gem)}
          </div>
          <SortMenu value={sort} onChange={setSort} />
          <div className="sq-view mc-layout" role="group" aria-label="Affichage du marché">
            <button type="button" className={layout === 'cards' ? 'on' : ''} aria-pressed={layout === 'cards'} onClick={() => pickLayout('cards')}>Cartes</button>
            <button type="button" className={layout === 'table' ? 'on' : ''} aria-pressed={layout === 'table'} onClick={() => pickLayout('table')}>Tableau</button>
          </div>
        </div>
      </div>
      <p className="mc-count">
        {list.length === pool.length ? plural(pool.length, 'joueur', 'joueurs') : `${list.length} sur ${pool.length} joueurs`} · {plural(state.market.length, 'libre', 'libres')}, {(state.transfers || []).length} sous contrat · le marché bouge à chaque journée
      </p>
      {layout === 'table' && list.length > 0 && (
        <MarketTable list={list} state={state} refLvl={refLvl} followed={followed} recommended={recommended}
          onOpen={(q) => onOpen(q, list)} onFollow={onFollow} onOffer={onOffer} />
      )}
      {/* le tableau ne tient pas sur un téléphone : les cartes y restent */}
      <ul className={`mc-grid ${layout === 'table' ? 'mc-grid-sm' : ''}`}>
        {list.length === 0 && <li className="empty">Aucun joueur ne correspond à ces filtres pour l’instant.</li>}
        {list.map((p) => (
          <MarketCard key={p.id} p={p} state={state} refLvl={refLvl} followed={followed.has(p.id)} recommended={p.id === recommended}
            onOpen={(q) => onOpen(q, list)} onCompare={onCompare} onFollow={onFollow} onOffer={onOffer} />
        ))}
        <Network state={state} />
      </ul>
    </>
  );
}

// --- Suivis -------------------------------------------------------------------------------------------

function WatchView({ state, refLvl, recommended, onOpen, onCompare, onFollow, onOffer, run }) {
  const list = state.shortlist || [];
  if (!list.length) {
    return <p className="mc-empty"><IconStar /> Suis un joueur avec l’étoile de sa carte : son prix, l’intérêt des autres clubs et son départ éventuel s’afficheront ici.</p>;
  }
  const live = list.map((x) => ({ x, p: findOnMarket(state, x.id) })).filter((e) => e.p);
  const gone = list.filter((x) => !findOnMarket(state, x.id));
  const shown = live.map((e) => e.p);
  return (
    <>
      <p className="mc-count">
        {plural(live.length, 'joueur suivi', 'joueurs suivis')}{gone.length ? ` · ${plural(gone.length, 'parti', 'partis')} ailleurs` : ''} · l’écart de prix se compte depuis le jour où tu l’as suivi
      </p>
      {live.length > 0 && (
        <ul className="mc-grid">
          {live.map(({ x, p }) => {
            const now = costOf(p, state);
            const d = Math.round((now / x.price - 1) * 100);
            return (
              <MarketCard key={x.id} p={p} state={state} refLvl={refLvl} followed recommended={p.id === recommended}
                note={d ? `${pct(now / x.price - 1)} depuis ton suivi` : 'Prix stable depuis ton suivi'}
                noteTone={d < 0 ? 'good' : d > 0 ? 'warn' : 'note'}
                onOpen={(q) => onOpen(q, shown)} onCompare={onCompare} onFollow={onFollow} onOffer={onOffer} />
            );
          })}
        </ul>
      )}
      {gone.length > 0 && (
        <ul className="mc-rows">
          {gone.map((x) => (
            <li key={x.id} className="mc-gone">
              <span className={`pos-pill ${x.pos}`}>{x.pos}</span>
              <span><b>{x.name}</b> a signé {x.gone ? clubAfter('à ', x.gone) : 'ailleurs'}.</span>
              <button className="linkbtn" onClick={() => run((s) => toggleShortlist(s, x.id))}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- Offres : négociations en cours, offres reçues, joueurs à vendre ----------------------------------------

// Une offre reçue face au prix demandé (joueur en vente) ou à sa valeur (offre spontanée) : [ton, texte].
function offerNote(o, price) {
  if (!price) return [o.amount >= o.v ? 'up' : 'down', `${pct(o.amount / o.v - 1)} sur sa valeur`];
  if (o.amount === price) return ['up', 'ton prix'];
  const d = Math.max(1, Math.round(Math.abs(o.amount / price - 1) * 100));
  return o.amount > price ? ['up', `${d} % au-dessus de ton prix`] : ['', `${d} % sous ton prix`];
}

// Réponse à la dernière offre traitée (vue Offres) : vente, refus, départ du club, dernier mot.
function SaleFlash({ sale }) {
  const c = sale.club;
  return (
    <p className={`mc-flash ${sale.result}`} role="status">
      {sale.result === 'sold' && <>{sale.name} rejoint {withArticle(c)} pour <b>{fmtMoney(sale.amount)}</b>.</>}
      {sale.result === 'refused' && <>Offre {clubAfter('de ', c)} pour {sale.name} refusée : le club se retire.</>}
      {sale.result === 'walked' && <>{Club(c)} {agree(c, 'juge ta demande excessive et se retire', 'jugent ta demande excessive et se retirent')} ({sale.name}).</>}
      {sale.result === 'countered' && <>{Club(c)} {agree(c, 'monte', 'montent')} à <b>{fmtMoney(sale.amount)}</b> pour {sale.name} : c’est {agree(c, 'son', 'leur')} dernier mot.</>}
      {sale.result === 'held' && <>{Club(c)} {agree(c, 'maintient son', 'maintiennent leur')} offre de <b>{fmtMoney(sale.amount)}</b> pour {sale.name} : c’est {agree(c, 'son', 'leur')} dernier mot.</>}
    </p>
  );
}

// Résultat des enchères : qui a battu la meilleure offre, qui s'est retiré.
function AuctionFlash({ a }) {
  const up = a.moves.filter((m) => m.to !== null);
  const best = Math.max(a.best, ...up.map((m) => m.to));
  return (
    <p className={`mc-flash ${up.length ? 'sold' : 'walked'}`} role="status">
      Enchères pour {a.name} :{' '}
      {a.moves.map((m, i) => (
        <React.Fragment key={m.offerId}>
          {i > 0 && ' ; '}
          {m.to !== null
            ? <>{withArticle(m.club)} {agree(m.club, 'monte', 'montent')} à <b>{fmtMoney(m.to)}</b></>
            : <>{withArticle(m.club)} {agree(m.club, 'se retire', 'se retirent')}</>}
        </React.Fragment>
      ))}
      . {best > a.best
        ? <>Meilleure offre : <b>{fmtMoney(best)}</b>.</>
        : <>{Club(a.club)} {agree(a.club, 'garde', 'gardent')} la meilleure offre (<b>{fmtMoney(a.best)}</b>).</>}
    </p>
  );
}

function OffersView({ state, refLvl, run, ask, onOffer, onSale, onList }) {
  const counters = pendingCounters(state);
  const listed = (state.saleList || []).map((x) => ({ ...x, p: state.players.find((q) => q.id === x.id) })).filter((x) => x.p);
  const [picking, setPicking] = useState(false);
  const [opened] = useState(() => Date.now());
  const sale = state.lastSale && state.lastSale.at >= opened ? state.lastSale : null; // réponse à la dernière offre traitée ici
  const auction = state.lastAuction && state.lastAuction.at >= opened ? state.lastAuction : null;
  const canSell = state.players.length > SQUAD_MIN;
  // offres groupées par joueur : les joueurs mis en vente d'abord, puis les offres spontanées
  const groups = [...new Set((state.offers || []).map((o) => o.playerId))]
    .map((id) => ({ p: state.players.find((q) => q.id === id), list: offersFor(state, id), sale: listed.find((x) => x.id === id) }))
    .filter((g) => g.p)
    .sort((a, b) => (a.sale ? 0 : 1) - (b.sale ? 0 : 1) || b.list[0].amount - a.list[0].amount);
  const accept = (o, p) => {
    const imp = impactOf(state, -wageOf(p, state.divisionIndex), -o.amount);
    ask({
      title: `Vendre ${p.name} ${clubAfter('à ', o.club)} ?`,
      text: `${p.name} (${p.age} ans, ${POS_LABELS[p.pos].toLowerCase()}, note ${fmtRating(playerRating(p))}) rejoindra ${withArticle(o.club)}.${state.lineup?.includes(p.id) ? ' C’est un titulaire : ton onze sera recomposé.' : ''}`,
      rows: [
        ['Montant du transfert', `+${fmtMoney(o.amount)}`, 'up'],
        ['Salaire économisé', `${fmtMoney(wageOf(p, state.divisionIndex))} / saison`, 'up'],
        ['Fin de saison prévue', `${fmtMoney(imp.endNow)} → ${fmtMoney(imp.endAfter)}`],
      ],
      confirmLabel: `Vendre · ${fmtMoney(o.amount)}`,
      onConfirm: () => {
        const since = Date.now();
        if (run((s) => answerOffer(s, o.id, 'accept'), 'Effectif au minimum (11 joueurs).')) onSale(o.id, since); // écran de vente conclue
      },
    });
  };
  const bidUp = (g) => {
    const [top, ...rest] = g.list;
    ask({
      title: `Faire monter les enchères pour ${g.p.name} ?`,
      text: `${Club(top.club)} ${agree(top.club, 'garde son', 'gardent leur')} offre de ${fmtMoney(top.amount)}. Chaque autre club doit la battre, sinon il se retire. Une seule fois par journée.`,
      rows: rest.map((o) => {
        const c = pctOf(outbidChance(o, top.amount));
        return [o.club, `${c} % de la battre`, c >= 50 ? 'up' : c === 0 ? 'down' : ''];
      }),
      confirmLabel: 'Lancer les enchères',
      onConfirm: () => run((s) => startAuction(s, g.p.id)),
    });
  };
  return (
    <>
      {counters.length > 0 && (
        <section className="mc-sec">
          <span className="eyebrow">À conclure avant la prochaine journée</span>
          <ul className="mc-rows">
            {counters.map((p) => (
              <li key={p.id} className="mc-row counter">
                <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                <span className="mc-row-main"><b>{p.name}</b><em>Contre-offre {p.club ? clubAfter('de ', p.club) : 'de son agent'} : {fmtMoney(p.talks.counter)} (prix demandé {fmtMoney(costOf(p, state))})</em></span>
                <button className="btn btn-sm" onClick={() => onOffer(p)}>Voir</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mc-sec">
        <span className="eyebrow">Offres reçues</span>
        {sale && <SaleFlash key={sale.at} sale={sale} />}
        {auction && <AuctionFlash key={auction.at} a={auction} />}
        {groups.length === 0 ? (
          <p className="mc-hint">Aucune offre pour l’instant. Mets un joueur en vente, à ton prix : les clubs intéressés font aussitôt leur offre, d’autres suivent après chaque journée, et un joueur en grande forme peut aussi recevoir une offre spontanée. Une offre vaut jusqu’à la journée suivante.</p>
        ) : (
          <>
            <p className="mc-hint">Valables jusqu’à la prochaine journée. « Négocier » : tu fixes ta demande, avec ta chance exacte d’accord. « Faire monter les enchères » : chaque club tente de battre la meilleure offre, ou se retire.</p>
            {groups.map((g) => {
              const done = auctionDone(state, g.p.id);
              const hopeless = g.list.length >= 2 && g.list.slice(1).every((o) => outbidChance(o, g.list[0].amount) <= 0);
              return (
                <div key={g.p.id} className="mc-group">
                  <div className="mc-group-head">
                    <span className={`mc-medal sm ${heat(playerRating(g.p), refLvl)}`}><b>{fmtRating(playerRating(g.p))}</b><span>{g.p.pos}</span></span>
                    <span className="mc-row-main"><b>{g.p.name}</b><em>{g.sale ? `En vente à ${fmtMoney(g.sale.price)}` : 'Pas à vendre'} · valeur {fmtMoney(valueOf(state, g.p))}</em></span>
                    <span className="mc-group-count">{plural(g.list.length, 'club', 'clubs')}</span>
                  </div>
                  <ul className="mc-rows">
                    {g.list.map((o, i) => {
                      const [tone, note] = offerNote(o, g.sale?.price);
                      return (
                        <li key={o.id} className={`mc-row offer ${i === 0 && g.list.length > 1 ? 'best' : ''}`}>
                          <Crest name={o.club} className="mc-crest lg" />
                          <span className="mc-row-main">
                            <b>{o.club}</b>
                            <em>{BUYERS[o.tier].label} · {DIVISIONS[o.div].name}{o.unsolicited ? ' · offre spontanée' : ''}</em>
                          </span>
                          <span className="mc-amount"><b>{fmtMoney(o.amount)}</b><em className={o.talks?.closed ? '' : tone}>{o.talks?.closed ? 'dernier mot' : note}</em></span>
                          <div className="mc-row-actions">
                            <button className="btn btn-sm" disabled={!canSell} onClick={() => accept(o, g.p)} title={canSell ? '' : 'Effectif au minimum (11 joueurs)'}>Accepter</button>
                            {!o.talks?.closed && <button className="btn ghost btn-sm" onClick={() => onSale(o.id)}>Négocier</button>}
                            <button className="linkbtn" onClick={() => run((s) => answerOffer(s, o.id, 'refuse'))}>Refuser</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {g.list.length >= 2 && (
                    <button className="btn ghost mc-auction" disabled={done || hopeless} onClick={() => bidUp(g)}>
                      {done ? 'Enchères déjà lancées aujourd’hui' : hopeless ? 'Aucun club ne peut battre la meilleure offre' : `Faire monter les enchères · ${g.list.length} clubs`}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="mc-sec">
        <div className="mc-sec-head">
          <span className="eyebrow">Mes joueurs en vente</span>
          <button className="linkbtn mc-pick" onClick={() => setPicking(!picking)}>{picking ? 'Terminer' : 'Choisir des joueurs'}</button>
        </div>
        {picking ? (
          <ul className="mc-rows">
            {[...state.players].sort((a, b) => 'GDMA'.indexOf(a.pos) - 'GDMA'.indexOf(b.pos) || playerRating(b) - playerRating(a)).map((p) => {
              const on = listed.some((x) => x.p === p);
              return (
                <li key={p.id} className={`mc-row pick ${on ? 'on' : ''}`}>
                  <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                  <span className="mc-row-main"><b>{p.name}</b><em>{p.age} ans · valeur {fmtMoney(valueOf(state, p))}{state.lineup?.includes(p.id) ? ' · titulaire' : ''}</em></span>
                  {/* mise en vente : la fenêtre du prix s'ouvre ; retrait immédiat */}
                  <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={`${p.name} en vente`} onClick={() => (on ? run((s) => setForSale(s, p.id, false)) : onList(p.id))}><i /></button>
                </li>
              );
            })}
          </ul>
        ) : listed.length === 0 ? (
          <p className="mc-hint">Aucun joueur en vente. Choisis-en ici ou depuis la fiche d’un joueur de l’effectif : tu fixes ton prix, et les clubs intéressés font aussitôt leur offre.</p>
        ) : (
          <ul className="mc-rows">
            {listed.map(({ p, price }) => {
              const n = offersFor(state, p.id).length;
              return (
                <li key={p.id} className="mc-row">
                  <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                  <span className="mc-row-main"><b>{p.name}</b><em>En vente à {fmtMoney(price)} · {n ? plural(n, 'club intéressé', 'clubs intéressés') : 'd’autres clubs après la journée'}</em></span>
                  <button className="linkbtn" onClick={() => run((s) => setForSale(s, p.id, false))}>Retirer</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// --- Bilan des transferts -----------------------------------------------------------------------------

function LogView({ state }) {
  const log = state.mercatoLog || [];
  const season = log.filter((x) => x.season === state.seasonNumber);
  const sum = (list, kind) => list.filter((x) => x.kind === kind).reduce((a, x) => a + x.fee, 0);
  const count = (list, kind) => list.filter((x) => x.kind === kind).length;
  const net = sum(season, 'out') - sum(season, 'in');
  const allNet = sum(log, 'out') - sum(log, 'in');
  const bestBuy = state.records?.bestBuy;
  const bestSale = log.filter((x) => x.kind === 'out').sort((a, b) => b.fee - a.fee)[0];
  return (
    <>
      <span className="eyebrow">Saison {state.seasonNumber}</span>
      <div className="mc-tiles">
        <div><span>Achats</span><b>{fmtMoney(sum(season, 'in'))}</b><em>{plural(count(season, 'in'), 'arrivée', 'arrivées')}</em></div>
        <div><span>Ventes</span><b>{fmtMoney(sum(season, 'out'))}</b><em>{plural(count(season, 'out'), 'départ', 'départs')}</em></div>
        <div><span>Solde</span><b className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>{net > 0 ? '+' : ''}{fmtMoney(net)}</b><em>{net >= 0 ? 'bénéfice' : 'investissement'}</em></div>
      </div>
      {log.length > season.length && (
        <p className="mc-hint">Depuis la création du club : {fmtMoney(sum(log, 'in'))} d’achats, {fmtMoney(sum(log, 'out'))} de ventes, solde {allNet > 0 ? '+' : ''}{fmtMoney(allNet)}.</p>
      )}
      {(bestBuy || bestSale) && (
        <div className="mc-records">
          {bestBuy && <span>Plus gros achat du club : <b>{bestBuy.name}</b> · {fmtMoney(bestBuy.fee)} (saison {bestBuy.season})</span>}
          {bestSale && <span>Plus grosse vente : <b>{bestSale.name}</b> · {fmtMoney(bestSale.fee)} (saison {bestSale.season})</span>}
        </div>
      )}
      {log.length === 0 ? (
        <p className="mc-hint">Aucun transfert pour l’instant. Chaque arrivée et chaque départ s’inscriront ici, avec leur montant.</p>
      ) : (
        <ul className="mc-rows mc-log">
          {[...log].reverse().map((x, i) => (
            <li key={i} className={`mc-row ${x.kind}`}>
              <span className={`mc-way ${x.kind}`}>{x.kind === 'in' ? 'Arrivée' : 'Départ'}</span>
              <span className="mc-row-main">
                <b>{x.name}</b>
                <em>{x.pos} · {x.age} ans · {fmtRating(x.rating)} · {x.kind === 'in' ? (x.club ? clubAfter('de ', x.club) : 'joueur libre') : `vers ${withArticle(x.club)}${x.board ? ' (vendu par le conseil)' : ''}`} · Saison {x.season}{x.round ? `, après la journée ${x.round}` : ', avant la reprise'}</em>
              </span>
              <b className={`mc-fee ${x.kind === 'in' ? 'down' : 'up'}`}>{x.kind === 'in' ? '−' : '+'}{fmtMoney(x.fee)}</b>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// --- Mercato ------------------------------------------------------------------------------------------

// view, onView : la vue choisie par les onglets de la section Mercato (nav.jsx), dans l'en-tête du panneau ; sans
// eux, le mercato garde sa propre barre de vues.
export function Mercato({ state, run, ask, refLvl, recommended, initialView = 'buy', view: viewProp = null, onView = null, onOpen, onCompare, onOffer, onSale, onList }) {
  const [viewState, setViewState] = useState(initialView);
  const view = viewProp ?? viewState;
  const setView = onView || setViewState;
  const followed = new Set((state.shortlist || []).filter((x) => !x.gone).map((x) => x.id));
  const follow = (p) => run((s) => toggleShortlist(s, p.id));
  const todo = (state.offers || []).length + pendingCounters(state).length;
  const common = { state, refLvl, recommended, onOpen, onCompare, onFollow: follow, onOffer };
  return (
    <div className="mc">
      {!onView && <Tabs
        className="segmented mc-views"
        items={[
          ['buy', 'Recruter'],
          ['watch', 'Suivis', followed.size ? <em className="mc-count-badge">{followed.size}</em> : null],
          ['offers', 'Offres', todo ? <em className="mc-count-badge hot">{todo}</em> : null],
          ['log', 'Bilan'],
        ]}
        value={view}
        onChange={setView}
        label="Mercato"
      />}
      {view === 'buy' && <BuyView {...common} run={run} followed={followed} />}
      {view === 'watch' && <WatchView {...common} run={run} />}
      {view === 'offers' && <OffersView state={state} refLvl={refLvl} run={run} ask={ask} onOffer={onOffer} onSale={onSale} onList={onList} />}
      {view === 'log' && <LogView state={state} />}
    </div>
  );
}

// --- Négociation ----------------------------------------------------------------------------------------

const QUICK = [[0.8, '−20 %'], [0.9, '−10 %'], [1, 'Prix demandé']];

export function Negotiation({ state, p, run, refLvl, onClose, onSheet, onLineup }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  const [opened] = useState(() => Date.now());
  const onMarket = !!findOnMarket(state, p.id);
  const ask = onMarket ? costOf(p, state) : 0;
  const step = stepFor(ask || 1000);
  const lo = roundTo(ask * 0.6, step);
  const hi = roundTo(ask * 1.25, step);
  // départ : le prix demandé, ou la contre-offre du vendeur si elle est moins chère (signature assurée à ce prix),
  // dans la limite de la trésorerie
  const [offer, setOffer] = useState(() => Math.min(ask, p.talks?.counter || ask, Math.max(lo, Math.floor(state.money / step) * step)));
  // réponse du vendeur à la dernière offre faite dans cette fenêtre
  const result = state.lastDeal && state.lastDeal.id === p.id && state.lastDeal.at >= opened ? state.lastDeal : null;
  useEffect(() => { if (result?.result === 'accepted') haptic('build'); }, [result?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (result?.result === 'accepted' || !onMarket) {
    const signed = state.players.find((q) => q.id === p.id);
    const gain = signed ? fitGain(state, signed) : 0;
    const saved = result?.ask ? result.ask - result.amount : 0;
    return (
      <div className="sq-overlay" onClick={onClose}>
        <article ref={ref} className="sq-sheet glass ng ng-done" onClick={(e) => e.stopPropagation()} aria-label="Transfert conclu">
          <span className="grip" aria-hidden="true" />
          <header className="sh-bar"><span className="eyebrow">Mercato</span><button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button></header>
          {signed ? (
            <section className="ng-win">
              <span className="ng-win-ico"><IconCheck /></span>
              <h3>Accord conclu !</h3>
              <p><b>{p.name}</b> rejoint ton effectif{result ? <> pour <b>{fmtMoney(result.amount)}</b></> : ''}.</p>
              {saved > 0 && <p className="ng-saved">{fmtMoney(saved)} économisés sur le prix demandé ({fmtMoney(result.ask)}).</p>}
              {saved < 0 && <p className="ng-paid">{fmtMoney(-saved)} de plus que le prix demandé ({fmtMoney(result.ask)}).</p>}
              {gain >= 0.3 && <p className="ng-fit">Il renforce ton onze : +{fmtRating(gain)} sur le titulaire le plus faible à son poste.</p>}
              <div className="ng-actions">
                {gain >= 0.3 && onLineup && <button className="btn" onClick={onLineup}>Composer l’équipe</button>}
                <button className={`btn ${gain >= 0.3 && onLineup ? 'ghost' : ''}`} onClick={() => onSheet(p.id)}>Voir sa fiche</button>
                <button className="btn ghost" onClick={onClose}>Retour au mercato</button>
              </div>
            </section>
          ) : (
            <section className="ng-win">
              <h3>Joueur indisponible</h3>
              <p>{p.name} n’est plus sur le marché.</p>
              <div className="ng-actions"><button className="btn ghost" onClick={onClose}>Retour au mercato</button></div>
            </section>
          )}
        </article>
      </div>
    );
  }

  const talks = p.talks || {};
  const chance = acceptChance(state, p, offer, ask);
  const shown = pctOf(chance);
  const { reasons } = stanceOf(state, p);
  const wage = wageOf(p, state.divisionIndex);
  const imp = impactOf(state, wage, offer);
  const block = offerBlock(state, p, offer);
  const left = TRIES - (talks.tries || 0);
  const set = (v) => setOffer(Math.min(hi, Math.max(lo, roundTo(v, step))));
  const send = () => run((s) => makeOffer(s, p.id, offer));
  const take = () => run((s) => acceptCounter(s, p.id), 'Trésorerie insuffisante ou effectif complet.');
  const r = playerRating(p);

  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={`Négociation pour ${p.name}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="eyebrow">Négociation</span>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la négociation"><IconClose /></button>
        </header>

        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{p.club ? <><Crest name={p.club} className="mc-crest" />{p.club} · {plural(p.contract, 'an', 'ans')} de contrat</> : 'Joueur libre'} · {p.age} ans</span>
          </div>
          <button className="linkbtn ng-sheet" onClick={() => onSheet(p.id)}>Sa fiche</button>
        </section>

        {result && result.result !== 'accepted' && (
          <section className={`ng-answer ${result.result}`}>
            <b>{result.result === 'countered' ? 'Offre refusée… mais le vendeur fait un pas' : 'Offre refusée : jugée trop basse'}</b>
            <span>Tu proposais {fmtMoney(result.amount)}.{talks.closed ? ' Le vendeur ne discutera plus avant la prochaine journée.' : ` Encore ${plural(left, 'tentative', 'tentatives')} aujourd’hui.`}</span>
          </section>
        )}

        {talks.counter && (
          <section className="ng-counter">
            <div>
              <span className="eyebrow">Contre-offre {p.club ? clubAfter('de ', p.club) : 'de son agent'}</span>
              <b>{fmtMoney(talks.counter)}</b>
              <em>{talks.counter > state.money ? `Il te manque ${fmtMoney(talks.counter - state.money)} pour l’accepter.` : 'Signature assurée à ce prix, jusqu’à la prochaine journée.'}</em>
            </div>
            <button className="btn" disabled={talks.counter > state.money || state.players.length >= SQUAD_MAX} onClick={take}>Accepter · {fmtMoney(talks.counter)}</button>
          </section>
        )}

        {!talks.closed && (
          <>
            <section className="ng-offer">
              <div className="ng-ask"><span>{p.club ? 'Indemnité demandée' : 'Prime de signature demandée'}</span><b>{fmtMoney(ask)}</b></div>
              <span className="eyebrow">Ton offre</span>
              <div className="ng-amount">
                <button className="hud-icon" onClick={() => set(offer - step)} aria-label="Baisser l’offre" disabled={offer <= lo}>−</button>
                <output className="ng-value" aria-live="polite">{fmtMoney(offer)}<em>{vsAsk(offer, ask)}</em></output>
                <button className="hud-icon" onClick={() => set(offer + step)} aria-label="Monter l’offre" disabled={offer >= hi}>+</button>
              </div>
              <input className="ng-range" type="range" min={lo} max={hi} step={step} value={offer} style={{ '--fill': `${((offer - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => set(Number(e.target.value))} aria-label="Montant de l’offre" />
              <div className="chips ng-quick">
                {QUICK.map(([k, label]) => <button key={label} className={roundTo(ask * k, step) === offer ? 'active' : ''} onClick={() => set(ask * k)}>{label}</button>)}
              </div>
            </section>

            <section className={`ng-chance ${shown >= 70 ? 'good' : shown >= 35 ? 'mid' : 'low'}`}>
              <div className="ng-chance-top"><span className="eyebrow">Chances d’accord</span><b>{shown} %</b></div>
              <span className="ng-gauge"><i style={{ width: `${shown}%` }} /></span>
              {shown === 0 && <p className="ng-sure low">Offre trop basse : refus assuré.</p>}
              {shown === 100 && <p className="ng-sure good">Accord assuré à ce prix.</p>}
              <ul className="ng-reasons">
                {reasons.map(([tone, text]) => <li key={text} className={tone}>{text}</li>)}
              </ul>
            </section>
          </>
        )}

        <dl className="ng-costs">
          <div><dt>Salaire</dt><dd>{fmtMoney(wage)} / saison</dd></div>
          <div><dt>Salaires / revenus</dt><dd className={imp.shareAfter > 0.75 ? 'down' : ''}>{Math.round(imp.share * 100)} % → {Math.round(imp.shareAfter * 100)} %</dd></div>
          <div><dt>Fin de saison prévue</dt><dd className={imp.endAfter < 0 ? 'down' : ''}>{fmtMoney(imp.endNow)} → {fmtMoney(imp.endAfter)}</dd></div>
        </dl>
        {imp.endAfter < 0 && <p className="ng-warn">Avec cette recrue, la saison finirait dans le rouge : le conseil vendrait alors tes plus gros salaires.</p>}

        <footer className="ng-foot">
          {talks.closed ? (
            <p className="ng-closed">Le vendeur ne discutera plus avant la prochaine journée{talks.counter ? ' (sa contre-offre tient toujours)' : ''}.</p>
          ) : (
            <>
              <span className="ng-tries">{plural(left, 'tentative', 'tentatives')} aujourd’hui</span>
              <button className="btn btn-xl" disabled={!!block} onClick={send} title={block || ''}>Envoyer l’offre · {fmtMoney(offer)}</button>
              {block && <span className="ng-block">{block}</span>}
            </>
          )}
        </footer>
      </article>
    </div>
  );
}

// --- Mise en vente ------------------------------------------------------------------------------------------

const LIST_QUICK = [[1, 'Sa valeur'], [1.2, '+20 %'], [1.5, '+50 %']];
const toneOf = (shown) => (shown >= 70 ? 'good' : shown >= 35 ? 'mid' : 'low');
const vsValue = (x, v, step) => {
  if (Math.abs(x - v) <= step / 2) return 'sa valeur';
  const d = Math.max(1, Math.round(Math.abs(x / v - 1) * 100));
  return `${d} % ${x < v ? 'sous' : 'au-dessus de'} sa valeur`;
};

// Fenêtre de mise en vente : le prix au curseur, la chance exacte qu'un club le paie tout de suite et celle d'avoir
// au moins deux clubs en lice ; puis les clubs qui se présentent aussitôt.
export function ListingSheet({ state, p, run, refLvl, onClose, onOffers }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  const v = valueOf(state, p);
  const step = stepFor(v);
  const lo = roundTo(v * 0.6, step);
  const hi = roundTo(v * 2, step);
  const [price, setPrice] = useState(() => roundTo(v, step));
  const [done, setDone] = useState(false);
  // déjà proposé aux clubs aujourd'hui (retiré puis remis en vente) : pas de nouveaux clubs avant la prochaine journée
  const [again] = useState(() => listedToday(state, p.id));
  const r = playerRating(p);
  const head = (
    <header className="sh-bar">
      <span className="eyebrow">Mise en vente</span>
      <button className="hud-icon" onClick={onClose} aria-label="Fermer"><IconClose /></button>
    </header>
  );

  if (done) {
    const offers = offersFor(state, p.id);
    const sale = (state.saleList || []).find((x) => x.id === p.id);
    return (
      <div className="sq-overlay" onClick={onClose}>
        <article ref={ref} className="sq-sheet glass ng ng-done" onClick={(e) => e.stopPropagation()} aria-label={`${p.name} mis en vente`}>
          <span className="grip" aria-hidden="true" />
          {head}
          <section className="ng-win">
            <span className="ng-win-ico"><IconTransfer /></span>
            <h3>{offers.length ? plural(offers.length, 'club intéressé', 'clubs intéressés') : 'Joueur en vente'}</h3>
            <p><b>{p.name}</b> est en vente à <b>{fmtMoney(sale?.price || price)}</b>.</p>
            {offers.length > 0 ? (
              <ul className="ls-clubs">
                {offers.map((o, i) => (
                  <li key={o.id} style={{ animationDelay: `${120 + i * 140}ms` }}>
                    <Crest name={o.club} className="mc-crest lg" />
                    <span className="ls-club"><b>{o.club}</b><em>{BUYERS[o.tier].label} · {DIVISIONS[o.div].name}</em></span>
                    <span className="ls-amount"><b>{fmtMoney(o.amount)}</b><em className={offerNote(o, sale?.price || price)[0]}>{offerNote(o, sale?.price || price)[1]}</em></span>
                  </li>
                ))}
              </ul>
            ) : <p className="ng-paid">Pas d’offre ouverte aujourd’hui : de nouveaux clubs se présenteront après la prochaine journée.</p>}
            <div className="ng-actions">
              {offers.length > 0 && <button className="btn" onClick={onOffers}>{offers.length > 1 ? 'Voir les offres' : 'Voir l’offre'}</button>}
              <button className={`btn ${offers.length ? 'ghost' : ''}`} onClick={onClose}>Fermer</button>
            </div>
          </section>
        </article>
      </div>
    );
  }

  const out = listingOutlook(state, p, price);
  const shown = pctOf(out.pays);
  const set = (x) => setPrice(Math.min(hi, Math.max(lo, roundTo(x, step))));
  const list = () => {
    if (run((s) => setForSale(s, p.id, true, price))) { setDone(true); haptic('gain'); }
  };
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={`Mise en vente de ${p.name}`}>
        <span className="grip" aria-hidden="true" />
        {head}
        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{POS_LABELS[p.pos]} · {p.age} ans{state.lineup?.includes(p.id) ? ' · titulaire' : ''}</span>
          </div>
        </section>

        <section className="ng-offer">
          <div className="ng-ask"><span>Sa valeur</span><b>{fmtMoney(v)}</b></div>
          <span className="eyebrow">Ton prix</span>
          <div className="ng-amount">
            <button className="hud-icon" onClick={() => set(price - step)} aria-label="Baisser le prix" disabled={price <= lo}>−</button>
            <output className="ng-value" aria-live="polite">{fmtMoney(price)}<em>{vsValue(price, v, step)}</em></output>
            <button className="hud-icon" onClick={() => set(price + step)} aria-label="Monter le prix" disabled={price >= hi}>+</button>
          </div>
          <input className="ng-range" type="range" min={lo} max={hi} step={step} value={price} style={{ '--fill': `${((price - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => set(Number(e.target.value))} aria-label="Prix demandé" />
          <div className="chips ng-quick">
            {LIST_QUICK.map(([k, label]) => <button key={label} className={roundTo(v * k, step) === price ? 'active' : ''} onClick={() => set(v * k)}>{label}</button>)}
          </div>
        </section>

        {again ? (
          <section className="ng-chance">
            <p className="ls-again">Déjà proposé aux clubs aujourd’hui : ceux qui ont fait une offre la retrouvent, et de nouveaux clubs se présenteront après la prochaine journée, à ce prix.</p>
          </section>
        ) : (
          <section className={`ng-chance ${toneOf(shown)}`}>
            <div className="ng-chance-top"><span className="eyebrow">Ce prix payé aussitôt</span><b>{shown} %</b></div>
            <span className="ng-gauge"><i style={{ width: `${shown}%` }} /></span>
            {shown === 100 && <p className="ng-sure good">Au moins un club paiera ce prix dès la mise en vente.</p>}
            {shown === 0 && <p className="ng-sure low">Aucun club ne paiera ce prix d’emblée : leurs offres seront plus basses, à négocier.</p>}
            {shown > 0 && shown < 100 && <p className="ls-duo">Chance qu’un club t’offre ce prix dès la mise en vente ; sinon, son offre sera plus basse, à négocier.</p>}
            <p className="ls-duo">Au moins deux clubs en lice, de quoi faire monter les enchères : <b>{pctOf(out.duo)} %</b></p>
            <ul className="ng-reasons">
              {out.reasons.map(([tone, text]) => <li key={text} className={tone}>{text}</li>)}
            </ul>
          </section>
        )}

        <dl className="ng-costs">
          <div><dt>Salaire économisé à la vente</dt><dd>{fmtMoney(wageOf(p, state.divisionIndex))} / saison</dd></div>
        </dl>

        <footer className="ng-foot">
          <span className="ng-tries">{again ? 'Pas de nouveau club avant la prochaine journée' : `Au moins un club fait aussitôt une offre · jusqu’à ${CANDIDATES} étudient le dossier`}</span>
          <button className="btn btn-xl" onClick={list}>Mettre en vente · {fmtMoney(price)}</button>
        </footer>
      </article>
    </div>
  );
}

// --- Négociation d'une vente -----------------------------------------------------------------------------

const SALE_QUICK = [[1.05, '+5 %'], [1.1, '+10 %'], [1.2, '+20 %']];

// Face à face avec un club qui a fait une offre : on demande plus, la chance affichée est celle qui décide ; refusée,
// le club dit son dernier mot ; une demande hors de sa portée le fait partir. Écran de vente conclue à la fin.
export function SaleNegotiation({ state, offerId, since, run, refLvl, onClose, onSheet }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  const [opened] = useState(() => since || Date.now());
  const o = (state.offers || []).find((x) => x.id === offerId) || null;
  const result = state.lastSale && state.lastSale.offerId === offerId && state.lastSale.at >= opened ? state.lastSale : null;
  const p = o && state.players.find((q) => q.id === o.playerId);
  useEffect(() => { if (result?.result === 'sold') haptic('build'); }, [result?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = stepFor(o?.amount || 1000);
  const lo = o ? Math.floor(o.amount / step) * step + step : 0; // au-dessus de son offre
  const hi = o ? Math.max(lo + step, ceilTo(o.amount * 1.5, step)) : 0;
  const [want, setWant] = useState(() => (o ? Math.min(hi, Math.max(lo, roundTo(o.amount * 1.1, step))) : 0));
  const head = (
    <header className="sh-bar">
      <span className="eyebrow">Négociation · vente</span>
      <button className="hud-icon" onClick={onClose} aria-label="Fermer la négociation"><IconClose /></button>
    </header>
  );

  if (!o || !p) {
    const sold = result?.result === 'sold';
    const imp = impactOf(state, 0, 0);
    return (
      <div className="sq-overlay" onClick={onClose}>
        <article ref={ref} className="sq-sheet glass ng ng-done" onClick={(e) => e.stopPropagation()} aria-label={sold ? 'Vente conclue' : 'Négociation terminée'}>
          <span className="grip" aria-hidden="true" />
          {head}
          {sold ? (
            <section className="ng-win">
              <span className="ng-win-ico"><IconCheck /></span>
              <h3>Vente conclue !</h3>
              <p><b>{result.name}</b> rejoint {withArticle(result.club)} pour <b>{fmtMoney(result.amount)}</b>.</p>
              {result.offered && result.amount > result.offered && <p className="ng-saved">La négociation t’a rapporté {fmtMoney(result.amount - result.offered)} de plus que son offre.</p>}
              {result.value && result.amount > result.value && <p className="ng-saved">{fmtMoney(result.amount - result.value)} de plus que sa valeur ({fmtMoney(result.value)}).</p>}
              <p className="ng-paid">Salaire économisé : {fmtMoney(result.wage)} par saison · fin de saison prévue : {fmtMoney(imp.endNow)}.</p>
              <div className="ng-actions"><button className="btn" onClick={onClose}>Retour aux offres</button></div>
            </section>
          ) : result?.result === 'walked' ? (
            <section className="ng-win">
              <h3>{Club(result.club)} {agree(result.club, 'se retire', 'se retirent')}</h3>
              <p>Ta demande de <b>{fmtMoney(result.demand)}</b> était hors de sa portée : l’offre pour {result.name} est retirée.</p>
              <div className="ng-actions"><button className="btn ghost" onClick={onClose}>Retour aux offres</button></div>
            </section>
          ) : (
            <section className="ng-win">
              <h3>Offre expirée</h3>
              <p>Cette offre n’est plus valable.</p>
              <div className="ng-actions"><button className="btn ghost" onClick={onClose}>Retour aux offres</button></div>
            </section>
          )}
        </article>
      </div>
    );
  }

  const demand = Math.min(hi, Math.max(lo, want)); // l'offre a pu monter depuis (dernier mot)
  const shown = pctOf(demandChance(o, demand));
  const closed = !!o.talks?.closed;
  const left = SALE_TRIES - (o.talks?.tries || 0);
  const sale = (state.saleList || []).find((x) => x.id === p.id);
  const wage = wageOf(p, state.divisionIndex);
  const impOffer = impactOf(state, -wage, -o.amount);
  const imp = impactOf(state, -wage, -demand);
  const blocked = state.players.length <= SQUAD_MIN ? 'Effectif au minimum (11 joueurs) : recrute avant de vendre.' : null;
  const [tone, note] = offerNote(o, sale?.price);
  const r = playerRating(p);
  const set = (x) => setWant(Math.min(hi, Math.max(lo, roundTo(x, step))));
  const send = () => run((s) => demandOffer(s, o.id, demand));
  const take = () => run((s) => answerOffer(s, o.id, 'accept'), 'Effectif au minimum (11 joueurs).');
  const d = Math.max(1, Math.round((demand / o.amount - 1) * 100));
  // raccourcis : un montant chacun (les petites sommes, arrondies, peuvent tomber sur le même ; « Ton prix » d'abord)
  const quick = sale && sale.price > o.amount && sale.price <= hi ? [[sale.price, 'Ton prix']] : [];
  for (const [k, label] of SALE_QUICK) {
    const x = Math.min(hi, Math.max(lo, roundTo(o.amount * k, step)));
    if (!quick.some((q) => q[0] === x)) quick.push([x, label]);
  }
  quick.sort((a, b) => a[0] - b[0]);

  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={`Négociation avec ${o.club}`}>
        <span className="grip" aria-hidden="true" />
        {head}
        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{p.age} ans · valeur {fmtMoney(o.v)}{sale ? ` · en vente à ${fmtMoney(sale.price)}` : ''}</span>
          </div>
          <button className="linkbtn ng-sheet" onClick={() => onSheet(p.id)}>Sa fiche</button>
        </section>

        {result && (result.result === 'countered' || result.result === 'held') && (
          <section className={`ng-answer ${result.result === 'countered' ? 'countered' : ''}`}>
            <b>{result.result === 'countered' ? `Demande refusée… mais ${withArticle(o.club)} ${agree(o.club, 'monte', 'montent')} à ${fmtMoney(o.amount)}` : 'Demande refusée : le club maintient son offre'}</b>
            <span>Tu demandais {fmtMoney(result.demand)}. C’est {agree(o.club, 'son', 'leur')} dernier mot : vente assurée à ce prix.{closed ? ' Plus de demande possible avant la prochaine journée.' : ` Encore ${plural(left, 'demande possible', 'demandes possibles')}.`}</span>
          </section>
        )}

        <section className="ng-counter sl-club">
          <Crest name={o.club} className="mc-crest lg" />
          <div>
            <span className="eyebrow">{BUYERS[o.tier].label} · {DIVISIONS[o.div].name}</span>
            <strong className="sl-name">{o.club}</strong>
            <b>{fmtMoney(o.amount)}</b>
            <em className={closed ? '' : tone}>{closed ? 'Son dernier mot' : `Son offre · ${note}`}{o.unsolicited ? ' · offre spontanée' : ''}</em>
          </div>
          <button className="btn" disabled={!!blocked} onClick={take} title={blocked || ''}>Accepter · {fmtMoney(o.amount)}</button>
        </section>

        {!closed && (
          <>
            <section className="ng-offer">
              <span className="eyebrow">Ta demande</span>
              <div className="ng-amount">
                <button className="hud-icon" onClick={() => set(demand - step)} aria-label="Baisser la demande" disabled={demand <= lo}>−</button>
                <output className="ng-value" aria-live="polite">{fmtMoney(demand)}<em>{d} % au-dessus de son offre</em></output>
                <button className="hud-icon" onClick={() => set(demand + step)} aria-label="Monter la demande" disabled={demand >= hi}>+</button>
              </div>
              <input className="ng-range" type="range" min={lo} max={hi} step={step} value={demand} style={{ '--fill': `${((demand - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => set(Number(e.target.value))} aria-label="Montant demandé" />
              <div className="chips ng-quick">
                {quick.map(([x, label]) => <button key={label} className={x === demand ? 'active' : ''} onClick={() => set(x)}>{label}</button>)}
              </div>
            </section>

            <section className={`ng-chance ${toneOf(shown)}`}>
              <div className="ng-chance-top"><span className="eyebrow">Chances d’accord</span><b>{shown} %</b></div>
              <span className="ng-gauge"><i style={{ width: `${shown}%` }} /></span>
              {shown === 0 && <p className="ng-sure low">Demande hors de sa portée : le club se retirera.</p>}
              {shown === 100 && <p className="ng-sure good">Accord assuré à ce prix.</p>}
              {shown > 0 && shown < 100 && <p className="ls-duo">Refusée, le club dira son dernier mot : son offre montera à ce qu’il paie à coup sûr.</p>}
              <ul className="ng-reasons">
                {saleReasons(state, o).map(([t, text]) => <li key={text} className={t}>{text}</li>)}
              </ul>
            </section>
          </>
        )}

        <dl className="ng-costs">
          <div><dt>Salaire économisé</dt><dd>{fmtMoney(wage)} / saison</dd></div>
          <div><dt>Fin de saison prévue</dt><dd>{fmtMoney(imp.endNow)} → {fmtMoney(closed ? impOffer.endAfter : imp.endAfter)}</dd></div>
        </dl>

        <footer className="ng-foot">
          {closed ? (
            <p className="ng-closed">Le club a dit son dernier mot : {fmtMoney(o.amount)}, valable jusqu’à la prochaine journée.</p>
          ) : (
            <>
              <span className="ng-tries">{plural(left, 'demande possible', 'demandes possibles')} · l’offre vaut jusqu’à la prochaine journée</span>
              <button className="btn btn-xl" disabled={!!blocked} onClick={send} title={blocked || ''}>Demander · {fmtMoney(demand)}</button>
              {blocked && <span className="ng-block">{blocked}</span>}
            </>
          )}
        </footer>
      </article>
    </div>
  );
}

// Bouton « suivre » de la fiche joueur (marché).
export function FollowButton({ state, p, run }) {
  const on = (state.shortlist || []).some((x) => x.id === p.id && !x.gone);
  return (
    <button type="button" className={`sh-compare ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => run((s) => toggleShortlist(s, p.id))} title={on ? 'Ne plus suivre' : 'Suivre ce joueur'} aria-label={on ? 'Ne plus suivre' : 'Suivre ce joueur'}>
      <IconStar />
    </button>
  );
}

// Bouton « mettre en vente » de la fiche d'un joueur de l'effectif : la fenêtre du prix s'ouvre (ListingSheet) ;
// « Ne plus vendre » le retire tout de suite.
export function SaleToggle({ state, p, run, onList }) {
  const on = (state.saleList || []).some((x) => x.id === p.id);
  return (
    <button type="button" className={`btn ${on ? 'ghost' : ''}`} onClick={() => (on ? run((s) => setForSale(s, p.id, false)) : onList(p))}>
      {on ? 'Ne plus vendre' : 'Mettre en vente'}
    </button>
  );
}
