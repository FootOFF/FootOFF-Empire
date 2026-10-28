import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DIVISIONS, POS_LABELS, SQUAD_MAX, SQUAD_MIN, divisionOf } from '../game/constants';
import {
  ATTRS, FAMILIES, GK_ATTRS, TRAITS, WEIGHTS, costOf, playerRating, potentialRange, ratingAt, marketValue, wageOf, absenceOf, fitOf, matchCost, recoveryRate } from '../game/players';
import { seasonForecast } from '../game/economy';
import { teamLevel } from '../game/match';
import { clubAfter, deName } from '../game/names';
import { bestSigning } from '../game/advice';
import { arrivalOf, findOnMarket, moveWhen, offersFor, poolOf, saleBlock, valueOf } from '../game/mercato';
import { askedWage, clauseOpen, lastYear, renewOpen, yearsLeft } from '../game/contracts';
import { slotsOf } from '../game/tactics';
import { fmtMoney, fmtRating } from './format';
import { IconChevron, IconChevronLeft, IconClose, IconRadar } from './icons';
import { Panel } from './panels';
import { PlayerCareer, departureText, reasonTag } from './career';
import { LineupEditor } from './lineup';
import { careerOf } from '../game/career';
import { Presence, useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { FollowButton, LeagueOffer, ListingSheet, Mercato, Negotiation, SaleNegotiation, SaleToggle, heat } from './mercato';
import { Portrait } from './portrait';
import { divRef, tierOf } from './kit';

// Effectif : vue d'ensemble, puis les joueurs en cartes rangées par ligne (teinte du rang pour ta division : bronze,
// argent, or, élite) ou, sur PC, en tableau d'analyste ; fiche joueur façon magazine FootOFF Media, comparateur
// radar. Les couleurs des cases disent si une valeur est forte ou faible pour ta division.

const ORDER = { G: 0, D: 1, M: 2, A: 3 };
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const FILTERS = [['all', 'Tous'], ['G', 'Gardiens'], ['D', 'Défenseurs'], ['M', 'Milieux'], ['A', 'Attaquants']];
// tri des cartes : par poste (rangées par ligne), ou d'un seul tenant par niveau, âge ou condition
const SORTS = [['pos', 'poste'], ['level', 'niveau'], ['age', 'âge'], ['fit', 'condition']];
const SORT_FN = {
  level: (a, b) => playerRating(b) - playerRating(a),
  age: (a, b) => a.age - b.age || playerRating(b) - playerRating(a),
  fit: (a, b) => fitOf(b) - fitOf(a) || playerRating(b) - playerRating(a),
};
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
const formAvg = (p) => (p.form?.length ? p.form.reduce((a, b) => a + b, 0) / p.form.length : null);
const fitTone = (f) => (f >= 75 ? 'good' : f >= 50 ? 'mid' : 'low');
// Blessé ou suspendu : une pastille rouge ou ambre, partout où l'on voit le joueur.
function AbsentTag({ p, long = false }) {
  const a = absenceOf(p);
  if (!a) return null;
  return <span className={`abs-tag ${a.kind}`} title={a.label}>{long ? a.label : a.short}</span>;
}
const onSale = (s, p) => (s.saleList || []).some((x) => x.id === p.id); // mis en vente au mercato
const VIEW_KEY = 'fo-squad-view';
const LINES = [['G', 'Gardiens'], ['D', 'Défenseurs'], ['M', 'Milieux'], ['A', 'Attaquants']];

// Pastille d'un joueur mis en vente ou convoité : le nombre de clubs intéressés, sinon « En vente ».
function SaleTag({ state, p }) {
  const n = (state.offers || []).filter((o) => o.playerId === p.id).length;
  if (!n && !onSale(state, p)) return null;
  if (!n) return <em className="sq-sale">En vente</em>;
  return (
    <em className="sq-sale hot">
      {n} club{n > 1 ? 's' : ''}<span className="hide-sm"> intéressé{n > 1 ? 's' : ''}</span>
    </em>
  );
}

// mode : « squad » (section Équipe : joueurs, composition, anciens) ou « mercato » (section Mercato). L'onglet de
// l'Effectif est piloté par les onglets de la section (tab, onTab) ; aller au mercato depuis l'Effectif (offres reçues
// pour un joueur) passe par onMercato, et l'inverse (composer l'équipe après une signature) par onTab.
export function SquadView({ state, run, ask, onClose, onFinances, mode = 'squad', tab: tabProp = null, onTab = null, onMercato = null, initialTab = 'players', preview = null, initialSheet = null, initialDeal = null, mercatoView = null, onMercatoView = null }) {
  const [tabState, setTabState] = useState(initialTab);
  const tab = mode === 'mercato' ? 'market' : tabProp ?? tabState;
  const setTab = (t) => {
    if (mode !== 'mercato' && t === 'market') { onMercato?.('buy'); return; }
    if (mode === 'mercato' && t === 'market') return;
    if (onTab) onTab(t); else setTabState(t);
  };
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('pos');
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards'; } catch { return 'cards'; } });
  const pickView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* préférence non conservée */ } };
  const [sheet, setSheet] = useState(preview?.sheet ? { id: preview.sheet } : initialSheet ? (typeof initialSheet === 'object' ? initialSheet : { id: initialSheet }) : null); // { id, market, order }
  const [compare, setCompare] = useState(null); // { a, b } identifiants
  const [career, setCareer] = useState(null); // fiche carrière (joueur actuel ou ancien)
  const [deal, setDeal] = useState(initialDeal); // négociation en cours (identifiant du joueur visé : recrue, ou joueur du club à prolonger)
  const [listing, setListing] = useState(null); // mise en vente en cours (identifiant du joueur)
  const [saleDeal, setSaleDeal] = useState(null); // négociation d'une vente : { id de l'offre, since }
  // vue du mercato (recruter, suivis, offres, bilan) : choisie par les onglets de la section, dans l'en-tête
  const ref = divRef(state);
  const squad = useMemo(
    () => [...state.players].sort((a, b) => ORDER[a.pos] - ORDER[b.pos] || playerRating(b) - playerRating(a)),
    [state.players],
  );
  const wages = squad.reduce((s, p) => s + wageOf(p, state.divisionIndex), 0);
  const forecast = seasonForecast(state, wages);
  const recommended = bestSigning(state)?.player.id;

  // Échap ferme d'abord la négociation (achat, vente) ou la mise en vente, puis la carrière, le comparateur, la fiche,
  // et enfin le panneau
  const onEscape = () => {
    if (saleDeal !== null) setSaleDeal(null);
    else if (listing !== null) setListing(null);
    else if (deal !== null) setDeal(null);
    else if (career !== null) setCareer(null);
    else if (compare) setCompare(null);
    else if (sheet) setSheet(null);
    else onClose();
  };

  const shown = filter === 'all' ? squad : squad.filter((p) => p.pos === filter);
  const count = (id) => (id === 'all' ? squad.length : squad.filter((p) => p.pos === id).length);
  const find = (id) => state.players.find((p) => p.id === id) || findOnMarket(state, id);

  // vendre : une seule voie, la mise en vente puis la négociation des offres reçues (vue Offres du mercato)
  const openOffers = () => {
    setListing(null);
    setSheet(null);
    if (mode !== 'mercato') { onMercato?.('offers'); return; }
    onMercatoView?.('offers');
  };
  // recrutement : toujours par une offre négociée (fenêtre de négociation, chances d'accord affichées)
  const offer = (p) => setDeal(p.id);
  // comparaison par défaut : la recrue face au titulaire le plus faible à son poste, un joueur du club face
  // au meilleur autre joueur de sa ligne
  const openCompare = (p) => {
    const mates = state.players.filter((q) => q.id !== p.id && q.pos === p.pos);
    let other;
    if (!state.players.includes(p)) {
      const starters = state.lineup.map((id, k) => (slotsOf(state.formation)[k] === p.pos ? find(id) : null)).filter(Boolean);
      other = starters.sort((a, b) => playerRating(a) - playerRating(b))[0] || mates[0];
    } else {
      other = mates.sort((a, b) => playerRating(b) - playerRating(a))[0] || poolOf(state).find((q) => q.pos === p.pos);
    }
    if (other) setCompare({ a: other.id, b: p.id });
  };

  useEffect(() => {
    if (preview?.compare && state.market[0]) openCompare(state.market[0]);
    if (preview?.deal) setDeal(preview.deal);
    if (preview?.listing) setListing(preview.listing);
    if (preview?.sale) setSaleDeal({ id: preview.sale });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetPlayer = sheet && find(sheet.id);
  const list = sheet?.order ? sheet.order.map(find).filter(Boolean) : sheet?.market ? poolOf(state) : squad;
  // la négociation garde son joueur quand il quitte le marché pendant qu'elle est ouverte (signé par un autre club de la
  // ligue, marché renouvelé) : la fenêtre dit alors ce qui s'est passé au lieu de disparaître
  const lastDeal = useRef(null);
  const found = deal !== null ? find(deal) : null;
  if (found) lastDeal.current = found;
  const dealPlayer = deal === null ? null : found || (lastDeal.current?.id === deal ? lastDeal.current : null);
  const listingPlayer = listing !== null ? state.players.find((p) => p.id === listing) : null;
  const step = (d) => {
    const i = list.findIndex((p) => p.id === sheet.id);
    const next = list[(i + d + list.length) % list.length];
    if (next) setSheet({ ...sheet, id: next.id });
  };

  // mode « sheet » : Échap passe par onEscape (pas de Panel ici), et le tout se retire quand plus rien n'est ouvert
  useKeydown((e) => { if (mode === 'sheet' && e.key === 'Escape') onEscape(); });
  const empty = !sheetPlayer && !compare && career === null && deal === null && listing === null && saleDeal === null;
  useEffect(() => { if (mode === 'sheet' && empty) onClose(); }, [empty]); // eslint-disable-line react-hooks/exhaustive-deps

  // fenêtres posées sur le panneau : fiche, comparateur, carrière, négociations, mise en vente
  const overlays = (
    <>
      <Presence>{sheetPlayer && (
        <PlayerSheet
          p={sheetPlayer}
          place={`${list.findIndex((q) => q.id === sheetPlayer.id) + 1} / ${list.length}`}
          state={state}
          run={run}
          refLvl={ref}
          market={!state.players.some((q) => q.id === sheetPlayer.id)}
          onClose={() => setSheet(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onCompare={() => openCompare(sheetPlayer)}
          onOffers={openOffers}
          onList={() => setListing(sheetPlayer.id)}
          onOffer={() => offer(sheetPlayer)}
          onRenew={() => offer(sheetPlayer)}
          onCareer={() => setCareer(sheetPlayer.id)}
        />
      )}</Presence>
      <Presence>{compare && find(compare.a) && find(compare.b) && (
        <CompareView
          state={state}
          a={find(compare.a)}
          b={find(compare.b)}
          onPick={(id) => setCompare({ ...compare, a: id })}
          onClose={() => setCompare(null)}
          onOffer={offer}
        />
      )}</Presence>
      <Presence>{career !== null && <PlayerCareer state={state} id={career} onClose={() => setCareer(null)} onSheet={(pid) => { setCareer(null); setSheet({ id: pid }); }} />}</Presence>
      <Presence>{dealPlayer && dealPlayer.leagueKind === 'friend' && state.league && (
        <LeagueOffer
          key={dealPlayer.id}
          state={state}
          p={dealPlayer}
          run={run}
          refLvl={ref}
          onClose={() => setDeal(null)}
          onSheet={(id) => { setDeal(null); setCompare(null); setSheet({ id }); }}
        />
      )}</Presence>
      <Presence>{dealPlayer && !(dealPlayer.leagueKind === 'friend' && state.league) && (
        <Negotiation
          key={dealPlayer.id}
          state={state}
          p={dealPlayer}
          run={run}
          refLvl={ref}
          onClose={() => setDeal(null)}
          onSheet={(id) => { setDeal(null); setCompare(null); setSheet({ id }); }}
          onLineup={() => { setDeal(null); setCompare(null); setSheet(null); setTab('lineup'); }}
        />
      )}</Presence>
      <Presence>{listingPlayer && (
        <ListingSheet
          key={listingPlayer.id}
          state={state}
          p={listingPlayer}
          run={run}
          refLvl={ref}
          onClose={() => setListing(null)}
          onOffers={openOffers}
        />
      )}</Presence>
      <Presence>{saleDeal && (
        <SaleNegotiation
          key={saleDeal.id}
          state={state}
          offerId={saleDeal.id}
          since={saleDeal.since}
          run={run}
          refLvl={ref}
          onClose={() => setSaleDeal(null)}
          onSheet={(id) => { setSaleDeal(null); setSheet({ id }); }}
        />
      )}</Presence>
    </>
  );
  if (mode === 'sheet') return overlays; // la fiche seule, posée sur un autre panneau (Saison, Stats : voir App)

  return (
    <Panel
      id={mode === 'mercato' ? 'mercato' : 'squad'}
      size="lg"
      title={tab === 'market' ? 'Mercato' : 'Effectif'}
      eyebrow={<>{squad.length}/{SQUAD_MAX} joueurs<span className="hide-sm"> · {divisionOf(state).name}</span> · saison {state.seasonNumber}</>}
      money={state.money}
      onClose={onClose}
      onEscape={onEscape}
      toolbar={(
        <>
        <div className="sq-budget">
          <div className="sq-budget-top"><span>Salaires</span><b className={forecast.net < 0 ? 'bad' : forecast.wageShare > 0.75 ? 'warn' : ''}>{Math.round(forecast.wageShare * 100)} % des revenus</b></div>
          <span className="sq-gauge"><i className={forecast.net < 0 ? 'bad' : forecast.wageShare > 0.75 ? 'warn' : ''} style={{ width: `${Math.min(100, forecast.wageShare * 100)}%` }} /></span>
          <span className="sq-budget-sub">{fmtMoney(wages)} par saison · revenus attendus {fmtMoney(forecast.income)}{onFinances && <> · <button className="linkbtn fin-link" onClick={onFinances}>finances</button></>}</span>
        </div>
        </>
      )}
      overlay={overlays}
    >
        {tab === 'players' ? (
          <>
            <SquadOverview state={state} squad={squad} />
            <div className="sq-controls">
              <div className="chips">
                {FILTERS.map(([id, label]) => (
                  <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}<b>{count(id)}</b></button>
                ))}
              </div>
              {view === 'table'
                ? <span className="sq-legend"><i className="hi" /> fort pour la division <i className="low" /> faible</span>
                : <SortMenu value={sort} onChange={setSort} />}
              <div className="sq-view" role="group" aria-label="Affichage de l’effectif">
                <button type="button" className={view === 'cards' ? 'on' : ''} aria-pressed={view === 'cards'} onClick={() => pickView('cards')}>Cartes</button>
                <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => pickView('table')}>Tableau</button>
              </div>
            </div>
            {view === 'table' && (
              <div className="sq-tables">
                {shown.some((p) => p.pos === 'G') && (
                  <PlayerTable title="Gardiens" cols={GK_ATTRS} span={ATTRS.length} players={shown.filter((p) => p.pos === 'G')} state={state} refLvl={ref} onOpen={(p) => setSheet({ id: p.id })} />
                )}
                {shown.some((p) => p.pos !== 'G') && (
                  <PlayerTable title="Joueurs de champ" cols={ATTRS} span={ATTRS.length} players={shown.filter((p) => p.pos !== 'G')} state={state} refLvl={ref} onOpen={(p) => setSheet({ id: p.id })} />
                )}
              </div>
            )}
            {/* le tableau ne tient pas sur un téléphone : les cartes y restent */}
            <SquadCards className={view === 'table' ? 'only-sm' : ''} players={shown} sort={sort} state={state} refLvl={ref} onOpen={(p) => setSheet({ id: p.id })} />
          </>
        ) : tab === 'market' ? (
          <Mercato
            state={state}
            run={run}
            ask={ask}
            refLvl={ref}
            recommended={recommended}
            view={mercatoView || preview?.mercato || 'buy'}
            onView={onMercatoView}
            onOpen={(p, order) => setSheet({ id: p.id, market: true, order: (order || [p]).map((q) => q.id) })}
            onCompare={openCompare}
            onOffer={offer}
            onSale={(id, since) => setSaleDeal({ id, since })}
            onList={setListing}
          />
        ) : tab === 'lineup' ? (
          <LineupEditor state={state} run={run} />
        ) : (
          <Alumni state={state} onOpen={setCareer} />
        )}
    </Panel>
  );
}

// --- Vue d'ensemble et cartes ---------------------------------------------------------------------------------
// Quatre chiffres de l'effectif, puis une carte par joueur, rangées par ligne : la teinte dit son rang pour la
// division (élite, or, argent, bronze), le niveau en grand avec le poste, le portrait, le prénom et le nom, ses
// trois points forts (dorés s'ils sont forts pour la division), l'âge et la forme ; « XI » pour un titulaire.

function SquadOverview({ state, squad }) {
  if (!squad.length) return null;
  const forms = squad.map(formAvg).filter((f) => f !== null);
  const value = squad.reduce((a, p) => a + valueOf(state, p), 0);
  const fit = squad.reduce((a, p) => a + fitOf(p), 0) / squad.length;
  const tiles = [
    ['Niveau du onze', fmtRating(teamLevel(state)), 'gold'],
    ['Condition moyenne', <>{Math.round(fit)} %</>, fitTone(fit)],
    ['Âge moyen', <>{fmtRating(squad.reduce((a, p) => a + p.age, 0) / squad.length)}<small> ans</small></>],
    ['Forme', forms.length ? fmtRating(forms.reduce((a, b) => a + b, 0) / forms.length) : '–'],
    ['Valeur totale', fmtMoney(value)],
  ];
  return (
    <div className="sq-overview">
      {tiles.map(([label, v, tone]) => <div key={label} className={tone || ''}><span>{label}</span><b>{v}</b></div>)}
    </div>
  );
}

// « Trier par … » : une petite liste qui s'ouvre sous le bouton (pas de liste du système)
function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true); };
  }, [open]);
  const label = SORTS.find(([id]) => id === value)?.[1];
  return (
    <div className="sq-sorter" ref={ref}>
      <button type="button" className="sq-sorter-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Trier par <b>{label}</b><IconChevron />
      </button>
      {open && (
        <ul className="sq-sorter-menu" role="listbox" aria-label="Trier les joueurs">
          {SORTS.map(([id, name]) => (
            <li key={id}><button type="button" role="option" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => { onChange(id); setOpen(false); }}>{name}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SquadCards({ players, sort = 'pos', state, refLvl, onOpen, className = '' }) {
  let k = 0;
  if (sort !== 'pos') { // d'un seul tenant, sans rangées par ligne
    return (
      <div className={`sq-cards ${className}`}>
        <ul className="sqc-grid">
          {[...players].sort(SORT_FN[sort]).map((p) => <PlayerCard key={p.id} p={p} state={state} refLvl={refLvl} index={k++} onOpen={() => onOpen(p)} />)}
        </ul>
      </div>
    );
  }
  return (
    <div className={`sq-cards ${className}`}>
      {LINES.map(([pos, label]) => {
        const group = players.filter((p) => p.pos === pos);
        if (!group.length) return null;
        const avg = group.reduce((a, p) => a + playerRating(p), 0) / group.length;
        return (
          <section key={pos} className="sq-line">
            <header className="sq-line-head">
              <h3 className="mark-head">{label}</h3>
              <span className="sq-line-meta">{group.length} · moyenne {fmtRating(avg)}</span>
            </header>
            <ul className="sqc-grid">
              {group.map((p) => <PlayerCard key={p.id} p={p} state={state} refLvl={refLvl} index={k++} onOpen={() => onOpen(p)} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Forme en cinq barres : les cinq dernières notes de match (hauteur sur 10 ; vert à 7,5 et plus, rouge sous 5,5),
// des tirets pour les matchs pas encore joués.
function Form5({ form = [] }) {
  const last = form.slice(-5);
  const pad = Array.from({ length: 5 - last.length });
  return (
    <span className="form5" title={last.length ? `Forme : ${last.map(fmtRating).join(' · ')}` : 'Pas encore joué'}>
      {pad.map((_, i) => <i key={`p${i}`} className="none" />)}
      {last.map((v, i) => <i key={i} className={v >= 7.5 ? 'g' : v < 5.5 ? 'b' : ''} style={{ height: `${Math.max(3, Math.min(14, (v / 10) * 14))}px` }} />)}
    </span>
  );
}

function PlayerCard({ p, state, refLvl, index, onOpen }) {
  const r = playerRating(p);
  const starter = state.lineup?.includes(p.id);
  const [first, ...rest] = p.name.split(' ');
  const absent = absenceOf(p);
  const fit = Math.round(fitOf(p));
  const pot = potentialRange(p, state);
  return (
    <li style={{ '--k': Math.min(index, 18) }}>
      <button type="button" className={`sqc ${tierOf(r, refLvl)} ${absent ? 'out' : ''}`} onClick={onOpen} aria-label={`Fiche de ${p.name}, niveau ${fmtRating(r)}${absent ? `, ${absent.short.toLowerCase()}` : ''}`}>
        {/* colonne de gauche (note, poste, XI, numéro) à la largeur de « 20,0 », portrait dans la place qui reste :
            une note à deux chiffres ne mord plus sur le médaillon */}
        <span className="sqc-top">
          <span className="sqc-rating">
            <b>{fmtRating(r)}</b>
            <span className="sqc-tags"><span className={`pos-pill ${p.pos}`}>{p.pos}</span>{starter && <span className="sqc-xi" title="Titulaire">XI</span>}</span>
            {p.num != null && <em className="sqc-num">n°{p.num}</em>}
          </span>
          <span className="sqc-face"><Portrait p={p} size={96} /></span>
        </span>
        <span className="sqc-name">{rest.length > 0 && <small>{first}</small>}<strong>{rest.length ? rest.join(' ') : first}</strong></span>
        {lastYear(state, p) && <span className="sqc-end">Dernière année de contrat</span>}
        <SaleTag state={state} p={p} />
        <span className="sqc-stats">
          {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}><b>{Math.round(a.v)}</b><em>{a.short}</em></span>)}
        </span>
        {absent
          ? <span className={`sqc-strap ${absent.kind}`}>{absent.short}</span>
          : <span className={`sqc-fit ${fitTone(fit)}`} title="Condition physique"><span className="sqc-fit-bar"><i style={{ width: `${fit}%` }} /></span><em>{fit} %</em></span>}
        <span className="sqc-foot">
          <span>{p.age} ans{pot ? <> · pot. {fmtRating(pot[0])}–{fmtRating(pot[1])}</> : ''}</span>
          <Form5 form={p.form} />
        </span>
      </button>
    </li>
  );
}

// --- Tableau d'analyste (PC) ------------------------------------------------------------------------
// Gardiens et joueurs de champ partagent la même grille (largeurs fixes, styles.css) : les 6 caractéristiques des
// gardiens sont complétées par des cases vides jusqu'aux 9 des joueurs de champ (span), pour que Poste, Âge,
// Niveau, Forme et Salaire tombent exactement l'une sous l'autre d'un tableau à l'autre.

function PlayerTable({ title, cols, span = cols.length, players, state, refLvl, onOpen }) {
  const pad = Array.from({ length: Math.max(0, span - cols.length) }, (_, i) => i);
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const value = (p, key) => {
    if (key === 'lvl') return playerRating(p);
    if (key === 'age') return p.age;
    if (key === 'form') return formAvg(p) ?? -1;
    if (key === 'fit') return fitOf(p);
    if (key === 'wage') return wageOf(p, state.divisionIndex);
    return (p.pos === 'G' ? p.g : p.a)[key];
  };
  const rows = sort.key ? [...players].sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * sort.dir) : players;
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
  return (
    <div className="sq-table-wrap">
      <div className="sq-table-title">{title}</div>
      <table className="sq-table">
        <thead>
          <tr>
            <th className="c-name">Joueur</th>
            <th className="c-pos">Poste</th>
            {th('age', 'Âge', 'c-age')}
            {th('lvl', 'Niveau', 'c-lvl')}
            {cols.map((c) => th(c.key, c.short, 'c-attr', c.name))}
            {pad.map((i) => <th key={`pad${i}`} className="c-attr c-pad" aria-hidden="true" />)}
            {th('form', 'Forme', 'c-form')}
            {th('fit', 'Cond.', 'c-fit', 'Condition physique')}
            {th('wage', 'Salaire', 'c-wage')}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const starter = state.lineup?.includes(p.id);
            const f = formAvg(p);
            return (
              <tr key={p.id} onClick={() => onOpen(p)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p); }}>
                <td className="c-name">
                  <span className="sq-who">
                    <Portrait p={p} size={34} />
                    <span className="sq-who-text">
                      <span className="sq-num">{p.num ?? '–'}</span>
                      <span className="sq-name">{p.name}</span>
                      {starter && <i className="sq-starter" title="Titulaire" />}
                      <AbsentTag p={p} />
                      <SaleTag state={state} p={p} />
                      {p.traits?.length > 0 && <span className="sq-traits">{p.traits.map((t) => TRAITS[t]?.name).join(' · ')}</span>}
                    </span>
                  </span>
                </td>
                <td className="c-pos"><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>
                <td className="c-age">{p.age}</td>
                <td className={`c-lvl ${heat(playerRating(p), refLvl)}`}>{fmtRating(playerRating(p))}</td>
                {cols.map((c) => {
                  const v = (p.pos === 'G' ? p.g : p.a)[c.key];
                  return <td key={c.key} className={`c-attr ${heat(v, refLvl)}`}>{Math.round(v)}</td>;
                })}
                {pad.map((i) => <td key={`pad${i}`} className="c-attr c-pad" aria-hidden="true" />)}
                <td className="c-form">{f === null ? '–' : fmtRating(f)}</td>
                <td className={`c-fit ${fitTone(fitOf(p))}`}>{Math.round(fitOf(p))} %</td>
                <td className="c-wage">
                  {fmtMoney(wageOf(p, state.divisionIndex))}
                  {p.deal && <small className={`sq-end ${lastYear(state, p) ? 'last' : ''}`}>{lastYear(state, p) ? 'dernière année' : `jusqu’à S${p.deal.until}`}</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Anciens joueurs : ceux qui sont partis (vendus, retraités), pour retrouver leur carrière ---------------------

function Alumni({ state, onOpen }) {
  const list = [...(state.alumni || [])].reverse();
  if (!list.length) {
    return <p className="sq-hint">Aucun ancien pour l’instant. Les joueurs vendus ou partis à la retraite apparaîtront ici, avec toute leur carrière au club.</p>;
  }
  return (
    <>
      <p className="sq-hint">{list.length} {list.length > 1 ? 'anciens joueurs' : 'ancien joueur'}. Choisis un joueur pour revoir sa carrière au club.</p>
      <ul className="sq-list al-list">
        {list.map((a) => {
          const c = careerOf(state, a.id);
          if (!c) return null;
          return (
            <li key={a.id}>
              <button className="sq-row" onClick={() => onOpen(a.id)}>
                <span className="sq-face"><Portrait p={{ id: a.id, name: a.name, pos: a.pos, age: c.age }} size={42} /><span className={`pos-pill ${a.pos}`}>{a.pos}</span></span>
                <span className="sq-row-main">
                  <span className="sq-row-name">{a.name}<em className={`al-tag ${a.reason}`}>{reasonTag(c)}</em></span>
                  <span className="sq-row-meta">{departureText(c)}</span>
                  <span className="sq-row-meta">{plural(c.totals.apps, 'match', 'matchs')} · {plural(c.totals.goals, 'but', 'buts')} · {plural(c.totals.assists, 'passe', 'passes')} · homme du match {c.totals.motm} fois · {c.age} ans aujourd’hui</span>
                </span>
                <span className="sq-row-side"><b>{fmtRating(a.rating)}</b><span>au départ</span></span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Contrat d'un joueur du club (fiche) : salaire, fin, clause de montée, ce qui arrive sans prolongation, et le bouton
// qui ouvre la négociation de prolongation (même fenêtre que le recrutement, mercato.jsx).
function ContractBlock({ state, p, onRenew }) {
  const last = lastYear(state, p);
  const left = yearsLeft(state, p);
  const open = renewOpen(state, p);
  const ask = open ? askedWage(state, p) : 0;
  return (
    <section className="sh-sec sh-contract">
      <div className="sh-row">
        <span className="sh-cap">Contrat</span>
        <span className="sh-pot">Saison en cours : <b>{state.seasonNumber}</b></span>
      </div>
      <div className="sh-deal">
        <div><b>{fmtMoney(p.deal.wage)}</b><span>par saison</span></div>
        <div><b className={last ? 'amber' : ''}>Saison {p.deal.until}</b><span>{last ? <>fin du contrat · <em className="amber">dernière année</em></> : `fin du contrat · encore ${left} ans`}</span></div>
        {clauseOpen(state) || p.deal.clause
          ? <div><b>{p.deal.clause ? `+${Math.round(p.deal.clause * 100)} %` : 'Aucune'}</b><span>clause de montée</span></div>
          : <div><b>Saison {p.deal.since}</b><span>signé en</span></div>}
      </div>
      <p className="sh-empty">
        {last ? `Sans prolongation, il partira libre à la fin de la saison ${p.deal.until}, sans indemnité. ` : ''}
        {open ? `Pour prolonger, il demande aujourd’hui ${fmtMoney(ask)} par saison.` : 'Contrat au plus long : rien à prolonger pour l’instant.'}
      </p>
      {open && <button className="btn sh-renew" type="button" onClick={onRenew}>Prolonger son contrat</button>}
    </section>
  );
}

// --- Fiche joueur (magazine FootOFF Media) ---------------------------------------------------------------

function PlayerSheet({ p, state, run, refLvl, market, place, onClose, onPrev, onNext, onCompare, onOffers, onList, onOffer, onRenew, onCareer }) {
  const r = playerRating(p);
  const pot = potentialRange(p, state);
  const f = formAvg(p);
  const st = p.season || {};
  const fams = p.pos === 'G' ? ['gk'] : ['tech', 'phys', 'tac'];
  const all = attrsOf(p);
  const keys = new Set(Object.entries(WEIGHTS[p.pos]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k));
  const fee = costOf(p, state);
  // valeur de marché (avec ses saisons de contrat pour un joueur du club) ; une vente rapporte autour de 85 % (plus avec
  // un grand club ou en négociant)
  const value = market ? marketValue(p, state.divisionIndex) : valueOf(state, p);
  const prev = p.hist?.length ? p.hist[p.hist.length - 1] : null;
  const role = market ? (p.club ? `${p.club} · contrat ${p.contract} an${p.contract > 1 ? 's' : ''}` : 'Joueur libre') : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant';
  const sale = market ? null : (state.saleList || []).find((x) => x.id === p.id) || null;
  const listed = !!sale;
  // offres reçues pour ce joueur, la meilleure d'abord (mis en vente, les clubs intéressés font aussitôt la leur)
  const offers = market ? [] : offersFor(state, p.id);
  const bid = offers[0] || null;
  const block = market ? null : saleBlock(state, p); // blessé, suspendu ou recruté depuis le dernier match : pas de vente
  const arrival = market ? null : arrivalOf(state, p); // montant, club d'origine et moment de sa signature
  const talks = (market && p.talks) || {};
  const avg = st.apps ? st.sum / st.apps : null;
  const plural = (n, one, many) => (n > 1 ? many : one);
  const [nameFirst, ...nameRest] = p.name.split(' ');
  const note = market ? f : avg; // joueur du mercato : sa forme ; joueur du club : sa note moyenne de la saison
  const noteTone = note >= 7 ? 'good' : note !== null && note < 5.5 ? 'low' : '';

  // changement de joueur : la fiche remonte en haut et le nouveau joueur arrive du côté du geste
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
      <article ref={ref} className="sq-sheet glass" onClick={(e) => e.stopPropagation()} aria-label={`Fiche ${deName(p.name)}`}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <div className="sh-pager">
            <button className="hud-icon" onClick={goPrev} aria-label="Joueur précédent"><IconChevronLeft /></button>
            <span>{place}</span>
            <button className="hud-icon" onClick={goNext} aria-label="Joueur suivant"><IconChevron /></button>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la fiche"><IconClose /></button>
        </header>

        <section className={`sh-hero ${tierOf(r, refLvl)}`}>
          {p.num != null && <span className="sh-bignum" aria-hidden="true">{p.num}</span>}
          <div className="sh-id">
            <div className="sh-rate">
              <b>{fmtRating(r)}</b>
              {!market && p.lastDelta ? <em className={p.lastDelta > 0 ? 'up' : 'down'} title="Progression du dernier été">{p.lastDelta > 0 ? '+' : ''}{fmtRating(p.lastDelta)}</em> : null}
            </div>
            <div className="sh-meta">
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span>{POS_LABELS[p.pos]}{p.num ? ` · n°${p.num}` : ''}</span>
            </div>
            <h3 className="sh-name">{nameRest.length > 0 && <small>{nameFirst}</small>}<b>{nameRest.length ? nameRest.join(' ') : nameFirst}</b></h3>
          </div>
          <Portrait p={p} size={136} club={market ? p.club || null : null} free={market && !p.club} className="sh-face" />
          <div className="sh-tags">
            <span className={`sh-tag ${role === 'Titulaire' ? 'on' : ''}`}>{role}</span>
            <span className="sh-tag">{p.foot === 'les deux' ? 'Des deux pieds' : `Pied ${p.foot}`}</span>
            {!market && <AbsentTag p={p} long />}
            {!market && p.academy && <span className="sh-tag on">Formé au club</span>}
            {listed && <span className="sh-tag sale">En vente</span>}
            {market && p.interest > 0 && <span className="sh-tag warn">Courtisé{p.interest > 1 ? ` par ${p.interest} clubs` : ''}</span>}
            {p.alt && <span className="sh-tag">Dépanne : {POS_LABELS[p.alt].toLowerCase()} {fmtRating(ratingAt(p, p.alt))}</span>}
          </div>
        </section>

        <section className="sh-sec sh-levelsec">
          <div className="sh-row">
            <span className="sh-cap">Niveau <b className={heat(r, refLvl)}>{fmtRating(r)}</b><small> / 20</small></span>
            <span className="sh-pot">{pot ? <>Potentiel <b>{fmtRating(pot[0])}–{fmtRating(pot[1])}</b></> : 'Plafond atteint'}</span>
          </div>
          <div className="sh-scale" aria-hidden="true">
            <i className="now" style={{ width: `${(r / 20) * 100}%` }} />
            {pot && <i className="pot" style={{ left: `${(pot[0] / 20) * 100}%`, width: `${((pot[1] - pot[0]) / 20) * 100}%` }} />}
          </div>
          <div className="sh-ticks" aria-hidden="true"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span></div>
        </section>

        {!market && p.deal && <ContractBlock state={state} p={p} onRenew={onRenew} />}

        <div className="sh-tiles">
          <div><span>Âge</span><b>{p.age}<small> ans</small></b></div>
          {!market && <div><span>Condition</span><b className={fitTone(fitOf(p))}>{Math.round(fitOf(p))} %</b></div>}
          {!market && <div><span>Saison</span><b>{st.apps || 0}<small> {plural(st.apps || 0, 'match', 'matchs')}</small></b></div>}
          <div><span>{market ? 'Forme' : 'Note moy.'}</span><b className={noteTone}>{note !== null ? fmtRating(note) : '–'}</b></div>
        </div>

        {!market && (
          <section className="sh-sec sh-arrival">
            <div className="sh-row">
              <span className="sh-cap">Arrivée au club</span>
              {arrival && <span className="sh-pot">{arrival.from ? 'Indemnité' : 'Prime'} <b className="gold">{fmtMoney(arrival.fee)}</b></span>}
            </div>
            <p className="sh-empty">
              {arrival
                ? `${moveWhen(arrival.season, arrival.round)} · ${arrival.from ? `venu ${clubAfter('de ', arrival.from)}` : 'joueur libre'}`
                : p.academy
                  ? `Formé au club · en équipe première depuis la saison ${p.joined ?? 1}`
                  : `Au club depuis la saison ${p.joined ?? 1}${(p.joined ?? 1) === 1 ? ' · effectif de départ' : ''}`}
            </p>
          </section>
        )}

        {!market && (
          <section className="sh-sec">
            <span className="sh-cap">Saison {state.seasonNumber}</span>
            <div className="sh-stats">
              <div><b>{st.goals || 0}</b><span>{plural(st.goals || 0, 'but', 'buts')}</span></div>
              <div><b>{st.assists || 0}</b><span>{plural(st.assists || 0, 'passe', 'passes')}</span></div>
              <div><b>{(st.yellow || 0) + (st.red || 0)}</b><span>{plural((st.yellow || 0) + (st.red || 0), 'carton', 'cartons')}</span></div>
              <div className="sh-wrap"><b className={st.motm ? 'gold' : ''}>{st.motm || 0}</b><span>homme du match</span></div>
            </div>
            <button className="btn ghost wide sh-career" onClick={onCareer}>Toute sa carrière au club</button>
            {(p.lastDelta !== undefined || prev) && (
              <p className="sh-evo">
                {p.lastDelta !== undefined && <>Dernier été <b className={p.lastDelta > 0 ? 'up' : p.lastDelta < 0 ? 'down' : ''}>{p.lastDelta > 0 ? '+' : ''}{fmtRating(p.lastDelta)}</b></>}
                {p.lastDelta !== undefined && prev && ' · '}
                {prev && <>saison {prev.season} : {prev.apps} {plural(prev.apps, 'match', 'matchs')}, {prev.goals} {plural(prev.goals, 'but', 'buts')}{prev.avg ? `, note ${fmtRating(prev.avg)}` : ''}</>}
              </p>
            )}
          </section>
        )}

        {!market && (
          <section className="sh-sec">
            <div className="sh-row">
              <span className="sh-cap">Condition physique</span>
              <span className="sh-pot"><b className={fitTone(fitOf(p))}>{Math.round(fitOf(p))} %</b></span>
            </div>
            <div className="sh-scale sh-fit" aria-hidden="true"><i className={`now ${fitTone(fitOf(p))}`} style={{ width: `${fitOf(p)}%` }} /></div>
            <p className="sh-empty">Un match complet lui coûte environ {Math.round(matchCost(p))} points ; d’ici le match suivant, il récupère {Math.round(recoveryRate(p, state.buildings.training || 0) * 100)} % de sa fatigue. Titulaire à chaque match, il se stabilise vers {Math.round(100 + matchCost(p) - matchCost(p) / recoveryRate(p, state.buildings.training || 0))} % : fatigué, il joue moins bien et se blesse plus souvent.</p>
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Forme · notes de match sur 10</span>
            {f !== null && <span className="sh-pot">moyenne <b>{fmtRating(f)}</b></span>}
          </div>
          {p.form?.length ? (
            <div className="sh-form">
              {p.form.map((v, i) => <span key={i} className={v >= 7.5 ? 'good' : v < 5.5 ? 'low' : ''}>{fmtRating(v)}</span>)}
            </div>
          ) : <p className="sh-empty">Pas encore joué{market ? ' pour le club' : ' cette saison'}.</p>}
        </section>

        {p.traits?.length > 0 && (
          <section className="sh-sec">
            <span className="sh-cap">{plural(p.traits.length, 'Signe distinctif', 'Signes distinctifs')}</span>
            <ul className="sh-traits">
              {p.traits.map((t) => <li key={t}><i aria-hidden="true" /><b>{TRAITS[t].name}</b><span>{TRAITS[t].desc}</span></li>)}
            </ul>
          </section>
        )}

        <section className="sh-sec">
          <div className="sh-row">
            <span className="sh-cap">Attributs</span>
            <span className="sh-legend"><i className="key" /> clés au poste · <em>or</em> : fort pour ta division</span>
          </div>
          <div className={`sh-fams n${fams.length}`}>
            {fams.map((fam) => (
              <div className="sh-fam" key={fam}>
                <span className="sh-famname">{fams.length > 1 ? FAMILIES[fam].split(' ')[0] : FAMILIES[fam]}</span>
                {all.filter((a) => a.fam === fam).map((a) => (
                  <div className={`sh-attr ${keys.has(a.key) ? 'key' : ''}`} key={a.key}>
                    <span>{a.name}</span>
                    <b className={heat(a.v, refLvl)}>{Math.round(a.v)}</b>
                    <span className="sh-track"><i className={heat(a.v, refLvl)} style={{ width: `${(a.v / 20) * 100}%` }} /></span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <footer className={`sh-foot ${market ? 'market' : 'own'}`}>
          {market ? (
            <span>{p.club ? 'Indemnité' : 'Prime'} <b>{fmtMoney(fee)}</b> · salaire demandé <b>{fmtMoney(askedWage(state, p))}</b></span>
          ) : sale && bid ? (
            <span key={bid.id} className="sh-bid">En vente à <b>{fmtMoney(sale.price)}</b> · {offers.length} {plural(offers.length, 'club intéressé', 'clubs intéressés')} · meilleure offre <b className="gold">{fmtMoney(bid.amount)}</b></span>
          ) : sale ? (
            <span>En vente à <b>{fmtMoney(sale.price)}</b> · valeur <b>{fmtMoney(value)}</b> · de nouveaux clubs après chaque journée</span>
          ) : bid ? (
            <span key={bid.id} className="sh-bid">Offre spontanée {clubAfter('de ', bid.club)} : <b className="gold">{fmtMoney(bid.amount)}</b> · valeur <b>{fmtMoney(value)}</b></span>
          ) : (
            <span>Salaire <b>{fmtMoney(wageOf(p, state.divisionIndex))}</b> par saison · valeur <b>{fmtMoney(value)}</b></span>
          )}
          {block && <span className="sh-block">{block.text}</span>}
          <div className="sh-actions">
            {market && <FollowButton state={state} p={p} run={run} />}
            <button className="sh-compare" onClick={onCompare} aria-label="Comparer" title="Comparer"><IconRadar /></button>
            {market ? (
              <button
                className="btn"
                disabled={(state.players.length >= SQUAD_MAX || talks.closed) && !talks.counter}
                onClick={onOffer}
                title={state.players.length >= SQUAD_MAX ? 'Effectif complet' : ''}
              >
                {talks.fee ? 'Négocier son contrat' : talks.counter ? 'Contre-offre' : talks.closed ? 'Discussions closes' : 'Faire une offre'}
              </button>
            ) : (
              <>
                <SaleToggle state={state} p={p} run={run} onList={onList} />
                {bid && <button className="btn" onClick={onOffers}>{offers.length > 1 ? 'Voir les offres' : 'Voir l’offre'}</button>}
              </>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}

// --- Comparateur radar ----------------------------------------------------------------------------------

// Radar à l'échelle des joueurs comparés (pas toujours sur 20 : des joueurs à 6–9 rempliraient à peine le centre).
function Radar({ a, b, axes }) {
  const cx = 150, cy = 128, R = 92, n = axes.length;
  const max = Math.min(20, Math.max(10, Math.ceil((Math.max(...a, ...b) + 1) / 5) * 5));
  const pt = (i, r) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; };
  const poly = (vals) => vals.map((v, i) => pt(i, (R * Math.min(v, max)) / max).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 300 262" role="img" aria-label={`Comparaison des caractéristiques, échelle de 0 à ${max}`}>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={axes.map((_, i) => pt(i, R * k).join(',')).join(' ')} className="radar-grid" />)}
      {axes.map((ax, i) => { const [x, y] = pt(i, R); return <line key={ax.key} x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />; })}
      <polygon points={poly(a)} className="radar-a" />
      <polygon points={poly(b)} className="radar-b" />
      {axes.map((ax, i) => { const [x, y] = pt(i, R + 16); return <text key={ax.key} x={x} y={y + 4} textAnchor="middle" className="radar-label">{ax.short}</text>; })}
      <text x={cx + 4} y={cy - R + 12} className="radar-scale">{max}</text>
    </svg>
  );
}

// Choix du joueur comparé : liste du jeu (effectif puis joueurs libres), triée par niveau au poste comparé.
function ComparePicker({ state, a, b, onPick, onClose }) {
  const gk = b.pos === 'G';
  const rows = (list) => list
    .filter((p) => p.id !== b.id && (p.pos === 'G') === gk)
    .sort((x, y) => ratingAt(y, b.pos) - ratingAt(x, b.pos));
  const groups = [['Ton effectif', rows(state.players)], ['Mercato', rows(poolOf(state))]].filter(([, l]) => l.length);
  return (
    <div className="cmp-list" role="listbox" aria-label="Joueur à comparer">
      <div className="cmp-list-head">
        <span className="sh-cap">Comparer {b.name.split(' ').slice(-1)[0]} avec…</span>
        <button className="linkbtn" onClick={onClose}>Fermer</button>
      </div>
      {groups.map(([title, list]) => (
        <section key={title} className="cmp-list-sec">
          <span className="eyebrow muted-eyebrow">{title}</span>
          {list.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === a.id} className={`cmp-opt ${p.id === a.id ? 'on' : ''}`} onClick={() => { onPick(p.id); onClose(); }}>
              <span className={`pos-pill ${p.pos}`}>{p.pos}</span>
              <span className="cmp-opt-name">{p.name}<em>{p.age} ans{state.lineup?.includes(p.id) ? ' · titulaire' : ''}</em></span>
              <b>{fmtRating(ratingAt(p, b.pos))}</b>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function CompareView({ state, a, b, onPick, onClose, onOffer }) {
  const gk = b.pos === 'G';
  const axes = gk ? GK_ATTRS : ATTRS;
  const vals = (p) => axes.map((x) => (gk ? p.g?.[x.key] ?? 1 : p.a[x.key]));
  const va = vals(a);
  const vb = vals(b);
  const isMarket = !state.players.includes(b);
  const fee = costOf(b, state);
  const roleOf = (p) => (p.club ? p.club : state.market.includes(p) ? 'Joueur libre' : state.lineup?.includes(p.id) ? 'Titulaire' : 'Remplaçant');
  const la = ratingAt(a, b.pos);
  const lb = ratingAt(b, b.pos);
  const ref = useRef(null);
  const [picking, setPicking] = useState(false);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  return (
    <div className="sq-overlay center" onClick={onClose}>
      <div ref={ref} className="sq-compare glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comparaison">
        <span className="grip" aria-hidden="true" />
        <header className="cmp-head">
          <div>
            <h3>Comparaison</h3>
            <span>Au poste {/^[aeiouyéh]/i.test(POS_LABELS[b.pos]) ? 'd’' : 'de '}{POS_LABELS[b.pos].toLowerCase()}</span>
          </div>
          <button className="hud-icon" onClick={onClose} aria-label="Fermer la comparaison"><IconClose /></button>
        </header>

        <div className="cmp-vs">
          <div className="cmp-side a">
            <span className="cmp-role"><i />{roleOf(a)}</span>
            <button className={`cmp-pick ${picking ? 'open' : ''}`} onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={`Joueur comparé : ${a.name}. Changer`}>
              <span className="cmp-name">{a.name}</span>
              <IconChevron />
            </button>
            <b className={la > lb ? 'lead' : ''}>{fmtRating(la)}</b>
          </div>
          <span className="cmp-x">contre</span>
          <div className="cmp-side b">
            <span className="cmp-role"><i />{roleOf(b)}</span>
            <span className="cmp-name">{b.name}</span>
            <b className={lb >= la ? 'lead' : ''}>{fmtRating(lb)}</b>
          </div>
        </div>

        {picking ? <ComparePicker state={state} a={a} b={b} onPick={onPick} onClose={() => setPicking(false)} /> : <>
        <Radar a={va} b={vb} axes={axes} />

        <section className="cmp-sec">
          <span className="sh-cap">Écart {deName(b.name.split(' ').slice(-1)[0])} par rapport à {a.name.split(' ').slice(-1)[0]}</span>
          <ul className="cmp-deltas">
            {axes.map((x, i) => {
              const d = Math.round(vb[i]) - Math.round(va[i]);
              return <li key={x.key} className={d > 0 ? 'up' : d < 0 ? 'down' : ''}><span>{x.name}</span><b>{d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d)}</b></li>;
            })}
          </ul>
        </section>
        </>}

        {isMarket && (
          <footer className="cmp-foot">
            <span>{b.club ? 'Indemnité' : 'Prime'} <b>{fmtMoney(fee)}</b> · salaire demandé <b>{fmtMoney(askedWage(state, b))}</b></span>
            <button className="btn" disabled={state.players.length >= SQUAD_MAX || (b.talks?.closed && !b.talks?.counter)} onClick={() => onOffer(b)}>{b.talks?.fee ? 'Négocier son contrat' : b.talks?.counter ? 'Contre-offre' : 'Faire une offre'}</button>
          </footer>
        )}
      </div>
    </div>
  );
}
