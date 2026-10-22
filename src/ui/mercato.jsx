import React, { useEffect, useMemo, useRef, useState } from 'react';
import { POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import { ATTRS, GK_ATTRS, costOf, playerRating, potentialRange, wageOf } from '../game/players';
import {
  HAGGLE_CHANCE, TRIES, acceptChance, findOnMarket, fitGain, offerBlock, pctOf, pendingCounters, poolOf, roundKey, roundTo,
  stanceOf, stepFor, tagsOf, valueOf,
} from '../game/mercato';
import { acceptCounter, answerOffer, makeOffer, setForSale, toggleShortlist } from '../game/engine';
import { endOfSeasonForecast, officeSize, seasonForecast } from '../game/economy';
import { standingsOf } from '../game/season';
import { capitalize, clubAfter, isPluralClub, withArticle } from '../game/names';
import { Crest } from './crest';
import { fmtMoney, fmtRating } from './format';
import { Tabs } from './glass';
import { IconCheck, IconChevron, IconClose, IconRadar, IconStar, IconTransfer, IconTrend } from './icons';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { haptic } from './haptics';
import { Portrait } from './portrait';

// Mercato : un seul marché pour recruter (joueurs libres et joueurs sous contrat), des offres négociées, une liste
// de joueurs suivis, les offres reçues pour ses propres joueurs et le bilan des transferts. Le marché bouge à chaque
// journée (transfers.js) ; les chances d'accord affichées sont celles qui décident (mercato.js).

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
    <li className={`mc-card ${recommended ? 'rec' : ''} ${p.club ? 'pro' : 'free'}`}>
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
            <span className="mc-attrs">{p.age} ans · {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}>{a.short} {Math.round(a.v)}</span>)}</span>
            <span className="mc-pot">Potentiel {pot ? <b>{fmtRating(pot[0])} – {fmtRating(pot[1])}</b> : 'atteint'} · salaire {fmtMoney(wageOf(p, state.divisionIndex))}</span>
          </span>
        </button>
        <div className="mc-quick">
          <button type="button" className={`mc-icon ${followed ? 'on' : ''}`} aria-pressed={followed} onClick={() => onFollow(p)} title={followed ? 'Ne plus suivre' : 'Suivre ce joueur'} aria-label={followed ? `Ne plus suivre ${p.name}` : `Suivre ${p.name}`}><IconStar /></button>
          <button type="button" className="mc-icon" onClick={() => onCompare(p)} title="Comparer" aria-label={`Comparer ${p.name}`}><IconRadar /></button>
        </div>
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
  const toggle = (k) => setOnly((o) => ({ ...o, [k]: !o[k] }));
  const pool = poolOf(state);
  const list = useMemo(() => {
    const score = {
      fit: (p) => -(p.id === recommended ? 100 : 0) - fitGain(state, p) * 10 - playerRating(p) / 10,
      lvl: (p) => -playerRating(p), price: (p) => costOf(p, state), pot: (p) => -potMid(state, p), age: (p) => p.age,
    };
    return pool
      .filter((p) => (pos === 'all' || p.pos === pos) && (kind === 'all' || (kind === 'free') === !p.club))
      .filter((p) => (!only.afford || costOf(p, state) <= state.money) && (!only.fit || fitGain(state, p) >= 0.3) && (!only.gem || tagsOf(state, p).includes('gem')))
      .sort((a, b) => score[sort](a) - score[sort](b));
  }, [state, pos, kind, only, sort, recommended]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (active, onClick, label, pressed = undefined) => (
    <button key={label} type="button" className={active ? 'active' : ''} aria-pressed={pressed} onClick={onClick}>{label}</button>
  );
  return (
    <>
      {!state.mercatoTips && <HowTo run={run} />}
      <News state={state} />
      <div className="mc-filters">
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
        </div>
      </div>
      <p className="mc-count">
        {list.length === pool.length ? plural(pool.length, 'joueur', 'joueurs') : `${list.length} sur ${pool.length} joueurs`} · {plural(state.market.length, 'libre', 'libres')}, {(state.transfers || []).length} sous contrat · le marché bouge à chaque journée
      </p>
      <ul className="mc-grid">
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

function OffersView({ state, refLvl, run, ask, onOffer }) {
  const counters = pendingCounters(state);
  const offers = state.offers || [];
  const listed = (state.saleList || []).map((x) => state.players.find((p) => p.id === x.id)).filter(Boolean);
  const [picking, setPicking] = useState(false);
  const [opened] = useState(() => Date.now());
  const sale = state.lastSale && state.lastSale.at >= opened ? state.lastSale : null; // réponse à la dernière offre traitée ici
  useEffect(() => { if (sale?.result === 'raised') haptic('gain'); }, [sale?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSell = state.players.length > SQUAD_MIN;
  const answer = (o, action) => {
    const p = state.players.find((q) => q.id === o.playerId);
    if (action === 'accept') {
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
        onConfirm: () => { if (run((s) => answerOffer(s, o.id, 'accept'), 'Effectif au minimum (11 joueurs).')) haptic('build'); },
      });
      return;
    }
    run((s) => answerOffer(s, o.id, action));
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
        {sale && (
          <p key={sale.at} className={`mc-flash ${sale.result}`} role="status">
            {sale.result === 'sold' && <>{sale.name} rejoint {withArticle(sale.club)} pour <b>{fmtMoney(sale.amount)}</b>.</>}
            {sale.result === 'raised' && <>{Club(sale.club)} {agree(sale.club, 'accepte', 'acceptent')} de monter à <b>{fmtMoney(sale.amount)}</b> pour {sale.name}. L’offre t’attend.</>}
            {sale.result === 'withdrawn' && <>{Club(sale.club)} {agree(sale.club, 'refuse de payer plus et retire son', 'refusent de payer plus et retirent leur')} offre pour {sale.name}.</>}
            {sale.result === 'refused' && <>Offre {clubAfter('de ', sale.club)} pour {sale.name} refusée.</>}
          </p>
        )}
        {offers.length > 0 && <p className="mc-hint">Valables jusqu’à la prochaine journée. « Demander +10 % » : une chance sur deux ({pctOf(HAGGLE_CHANCE)} %) que le club accepte, sinon il retire son offre.</p>}
        {offers.length === 0 ? (
          <p className="mc-hint">Aucune offre pour l’instant. Mets des joueurs en vente : les clubs font leurs offres après chaque journée, et un joueur en grande forme peut aussi recevoir une offre spontanée. Une offre vaut jusqu’à la journée suivante.</p>
        ) : (
          <ul className="mc-rows">
            {offers.map((o) => {
              const p = state.players.find((q) => q.id === o.playerId);
              if (!p) return null;
              const v = valueOf(state, p);
              return (
                <li key={o.id} className="mc-row offer">
                  <Crest name={o.club} className="mc-crest lg" />
                  <span className="mc-row-main">
                    <b>{o.club}</b>
                    <em>{agree(o.club, 'veut', 'veulent')} {p.name} ({p.pos}, {fmtRating(playerRating(p))}){o.unsolicited ? ' · offre spontanée' : ''}</em>
                  </span>
                  <span className="mc-amount"><b>{fmtMoney(o.amount)}</b><em className={o.amount >= v ? 'up' : 'down'}>{pct(o.amount / v - 1)} sur sa valeur</em></span>
                  <div className="mc-row-actions">
                    <button className="btn btn-sm" disabled={!canSell} onClick={() => answer(o, 'accept')} title={canSell ? '' : 'Effectif au minimum (11 joueurs)'}>Accepter</button>
                    {!o.haggled && <button className="btn ghost btn-sm" onClick={() => answer(o, 'haggle')} title="Une chance sur deux d’obtenir 10 % de plus ; sinon le club retire son offre">Demander +10 %</button>}
                    <button className="linkbtn" onClick={() => answer(o, 'refuse')}>Refuser</button>
                  </div>
                </li>
              );
            })}
          </ul>
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
              const on = listed.includes(p);
              return (
                <li key={p.id} className={`mc-row pick ${on ? 'on' : ''}`}>
                  <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                  <span className="mc-row-main"><b>{p.name}</b><em>{p.age} ans · valeur {fmtMoney(valueOf(state, p))}{state.lineup?.includes(p.id) ? ' · titulaire' : ''}</em></span>
                  <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={`${p.name} en vente`} onClick={() => run((s) => setForSale(s, p.id, !on))}><i /></button>
                </li>
              );
            })}
          </ul>
        ) : listed.length === 0 ? (
          <p className="mc-hint">Aucun joueur en vente. Choisis-en ici ou depuis la fiche d’un joueur de l’effectif : les clubs feront leurs offres après chaque journée.</p>
        ) : (
          <ul className="mc-rows">
            {listed.map((p) => (
              <li key={p.id} className="mc-row">
                <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                <span className="mc-row-main"><b>{p.name}</b><em>{p.age} ans · valeur {fmtMoney(valueOf(state, p))}</em></span>
                <button className="linkbtn" onClick={() => run((s) => setForSale(s, p.id, false))}>Retirer</button>
              </li>
            ))}
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

export function Mercato({ state, run, ask, refLvl, recommended, initialView = 'buy', onOpen, onCompare, onOffer }) {
  const [view, setView] = useState(initialView);
  const followed = new Set((state.shortlist || []).filter((x) => !x.gone).map((x) => x.id));
  const follow = (p) => run((s) => toggleShortlist(s, p.id));
  const todo = (state.offers || []).length + pendingCounters(state).length;
  const common = { state, refLvl, recommended, onOpen, onCompare, onFollow: follow, onOffer };
  return (
    <div className="mc">
      <Tabs
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
      />
      {view === 'buy' && <BuyView {...common} run={run} followed={followed} />}
      {view === 'watch' && <WatchView {...common} run={run} />}
      {view === 'offers' && <OffersView state={state} refLvl={refLvl} run={run} ask={ask} onOffer={onOffer} />}
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
              <input className="ng-range" type="range" min={lo} max={hi} step={step} value={offer} onChange={(e) => set(Number(e.target.value))} aria-label="Montant de l’offre" />
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

// Bouton « suivre » de la fiche joueur (marché).
export function FollowButton({ state, p, run }) {
  const on = (state.shortlist || []).some((x) => x.id === p.id && !x.gone);
  return (
    <button type="button" className={`sh-compare ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => run((s) => toggleShortlist(s, p.id))} title={on ? 'Ne plus suivre' : 'Suivre ce joueur'} aria-label={on ? 'Ne plus suivre' : 'Suivre ce joueur'}>
      <IconStar />
    </button>
  );
}

// Bouton « mettre en vente » de la fiche d'un joueur de l'effectif.
export function SaleToggle({ state, p, run }) {
  const on = (state.saleList || []).some((x) => x.id === p.id);
  return (
    <button type="button" className={`btn ${on ? 'ghost' : ''}`} onClick={() => run((s) => setForSale(s, p.id, !on))}>
      {on ? 'Retirer de la vente' : 'Mettre en vente'}
    </button>
  );
}
