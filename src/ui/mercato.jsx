import React, { useEffect, useMemo, useRef, useState } from 'react';
import { POS_LABELS, SQUAD_MAX, SQUAD_MIN } from '../game/constants';
import { ATTRS, GK_ATTRS, costOf, playerRating, potentialRange, wageOf } from '../game/players';
import {
  CANDIDATES, SALE_TRIES, TRIES, acceptChance, auctionDone, buyerLine, ceilTo, demandChance, findOnMarket, fitGain,
  listingOutlook, moveWhen, offerBlock, offersFor, outbidChance, pctOf, pendingCounters, poolOf, roundKey, roundTo, saleBlock,
  saleReasons, stanceOf, stepFor, tagsOf, valueOf,
} from '../game/mercato';
import {
  acceptContractCounter, acceptCounter, answerOffer, contractBlock, demandOffer, makeOffer, offerContract, setForSale,
  startAuction, toggleShortlist,
} from '../game/engine';
import {
  CLAUSES, C_TRIES, MAX_YEARS, askedWage, clauseOpen, contractChance, contractStance, ctalksOf, demandOf, minYears,
  refWageOf, termReasons, wageStep,
} from '../game/contracts';
import { listedToday } from '../game/transfers';
import { duesOf, endOfSeasonForecast, officeSize, seasonForecast } from '../game/economy';
import { standingsOf } from '../game/season';
import { capitalize, clubAfter, isPluralClub, withArticle } from '../game/names';
import { ClubCrest, Crest } from './crest';
import { fmtMoney, fmtRating } from './format';
import { Tabs } from './glass';
import { FRIEND_ID, answerFriend, canSell, offerFriend, queuedFor } from '../game/leagueClub';
import { leagueTransfers, myLeagues } from '../game/leagueNet';
import { unsnapPlayer } from '../game/leagueWorld';
import { IconCheck, IconChevron, IconClose, IconRadar, IconSearch, IconSort, IconStar, IconTransfer, IconTrend } from './icons';
import { useKeydown } from './presence';
import { PHONE, useSwipe } from './gestures';
import { haptic } from './haptics';
import { uiSound } from './uisound';
import { Portrait } from './portrait';
import { tierOf } from './kit';
import { colon, comma, plural, semicolon, t, tn, tr } from '../i18n/index';

// sommes et conditions d'un contrat (1.0.10 ; 1.0.11, demande du PDG) : − / +, curseurs, durée et clause jouent le
// même son pour monter et le même pour descendre (sound.js, amount-up / amount-down) ; un curseur qu'on fait glisser,
// au plus une fois tous les 90 ms
const amountSound = (up) => uiSound(up ? 'amount-up' : 'amount-down');
let lastRange = 0;
const rangeSound = (up) => { const now = performance.now(); if (now - lastRange >= 90) { lastRange = now; amountSound(up); } };

// Mercato : un seul marché pour recruter (joueurs libres et joueurs sous contrat), des offres négociées, une liste
// de joueurs suivis, la vente de ses propres joueurs (mise en vente à son prix, clubs intéressés, négociation face à
// face, enchères) et le bilan des transferts. Le marché bouge à chaque journée (transfers.js) ; les chances affichées
// sont celles qui décident (mercato.js).

// libellés de filtre propres (0.8.16) : des lignes de jeu courtes, pas les noms de poste (« Centrocampista » débordait)
const POS_FILTERS = [['all', t('Tous')], ['G', t('Gardiens', {}, 'filtre-poste')], ['D', t('Défense', {}, 'filtre-poste')], ['M', t('Milieu', {}, 'filtre-poste')], ['A', t('Attaque', {}, 'filtre-poste')]];
const KINDS = [['all', t('Tous')], ['free', t('Libres')], ['pro', t('Sous contrat')]];
const SORTS = [['fit', t('Pour mon onze')], ['lvl', t('Niveau')], ['price', t('Prix')], ['pot', t('Potentiel')], ['age', t('Âge')]];
const TAG = {
  new: [t('Nouveau'), 'new'], gem: [t('Pépite'), 'gold'], bargain: [t('Bonne affaire'), 'good'], falling: [t('Prix en baisse'), 'good'],
  rising: [t('Prix en hausse'), 'warn'], lastyear: [t('Fin de contrat'), 'good'],
};
const attrsOf = (p) => (p.pos === 'G' ? GK_ATTRS.map((x) => ({ ...x, v: p.g[x.key] })) : ATTRS.map((x) => ({ ...x, v: p.a[x.key] })));
const topAttrs = (p, n = 3) => [...attrsOf(p)].sort((a, b) => b.v - a.v).slice(0, n);
export function heat(v, ref) { // même code couleur que l'Effectif : fort, bon, faible pour la division
  if (v >= ref + 3) return 'hi';
  if (v >= ref + 1) return 'good';
  if (v <= ref - 2) return 'low';
  return '';
}
const potMid = (s, p) => { const r = potentialRange(p, s); return r ? (r[0] + r[1]) / 2 : playerRating(p); };
// recherche sans accents ni majuscules (« leo » trouve « Léo »)
const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;
// noms de clubs dans une phrase : l'article et l'accord du verbe (« l'AS … accepte », « les Bleus … acceptent »)
const Club = (c) => capitalize(withArticle(c));
const agree = (c, one, many) => t(isPluralClub(c) ? many : one); // verbe accordé au club (pluriel : « les Jaunes acceptent »), traduit
const vsAsk = (offer, ask) => {
  if (offer === ask) return t('au prix demandé');
  const d = Math.max(1, Math.round(Math.abs(offer / ask - 1) * 100));
  return t('{d} % {v} prix demandé', { d, v: offer < ask ? t('sous le') : t('au-dessus du') });
};

// Effet d'une dépense ou d'un salaire en plus sur la fin de saison prévue, la part des salaires et ce qui reste
// disponible une fois payé le bilan (salaires et entretien dus en fin de saison, 0.8.8 : le nouveau salaire n'y compte
// que pour les journées restantes).
function impactOf(state, wageDelta, cash) {
  const wages = state.players.reduce((a, q) => a + wageOf(q, state.divisionIndex), 0);
  const position = standingsOf(state).findIndex((t) => t.i === 0) + 1;
  const endNow = endOfSeasonForecast(state, position, wages).end;
  const dueNow = duesOf(state, wages);
  const dueAfter = duesOf(state, wages + wageDelta);
  return {
    endNow, endAfter: endNow - cash - (dueAfter.total - dueNow.total),
    share: seasonForecast(state, wages).wageShare, shareAfter: seasonForecast(state, wages + wageDelta).wageShare,
    availNow: dueNow.available, availAfter: dueNow.available - cash, owed: dueNow.owed,
  };
}

// Sous les coûts d'un achat : la saison dans le rouge (le conseil vendrait), sinon une caisse qui ne couvrirait plus ce
// qui est déjà dû aux joueurs et pour l'entretien (payé au bilan).
function ReserveWarn({ imp, what }) {
  if (imp.endAfter < 0) return <p className="ng-warn">{tr('<0/>, la saison finirait dans le rouge : le conseil vendrait alors tes plus gros salaires.', [what])}</p>;
  if (imp.availAfter < 0) return <p className="ng-warn soft">{tr('<0/>, ta caisse ne couvrirait plus les <1/> déjà dus en salaires et entretien : les recettes des matchs restants devront compléter avant le bilan.', [what, fmtMoney(imp.owed)])}</p>;
  return null;
}

// --- Carte d'un joueur du marché ----------------------------------------------------------------------------
// Compacte (0.8.16, demande du PDG : « pas pratique ni pro », un seul joueur par écran de téléphone) : comme une liste
// de transferts de jeu de foot, trois bandes serrées. En haut, le portrait et sa note, le nom, le club, l'âge et le
// poste, et le prix au bout. Au milieu, les trois points forts et le potentiel, puis suivre, comparer et l'offre. En
// bas, le salaire demandé et les repères. Le toucher sur le joueur ouvre toujours sa fiche complète.

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
      <button type="button" className="mc-main" onClick={() => onOpen(p)} aria-label={t('Fiche de {name}', { name: p.name })}>
        <span className="mc-face">
          <Portrait p={p} size={46} club={p.club || null} free={!p.club} />
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b></span>
        </span>
        <span className="mc-id">
          <span className="mc-name">{p.name}</span>
          <span className="mc-club">
            {p.club ? (
              <><Crest name={p.club} className="mc-crest" /><span className="mc-club-name">{p.club}</span></>
            ) : <span className="mc-free">{t('Joueur libre')}</span>}
          </span>
          <span className="mc-pot"><span className={`pos-pill ${p.pos}`}>{p.pos}</span><span className="mc-pot-text">{tr('<0/> ans · <1/>', [p.age, POS_LABELS[p.pos]])}</span></span>
        </span>
        <span className="mc-price">
          <span className="mc-price-top">
            {p.trend ? <IconTrend className={`mc-trend ${p.trend > 0 ? 'up' : 'down'}`} aria-label={p.trend > 0 ? t('prix en hausse') : t('prix en baisse')} /> : null}
            <b className={price > state.money ? 'over' : ''}>{fmtMoney(price)}</b>
          </span>
          <em>{p.club ? t('indemnité') : t('prime à la signature')}</em>
        </span>
      </button>
      {/* points forts et fourchette du potentiel (échelle de 0 à 20), puis les gestes */}
      <div className="mc-strip">
        <span className="mc-stats">
          {topAttrs(p).map((a) => <span key={a.key} className={heat(a.v, refLvl)}><b>{Math.round(a.v)}</b><em>{a.short}</em></span>)}
          <span className="mc-potline" title={t('Potentiel')}><b><bdi dir="ltr">{pot ? `${fmtRating(pot[0])}–${fmtRating(pot[1])}` : t('atteint')}</bdi></b><em>{t('POT')}</em></span>
        </span>
        <span className="mc-acts">
          <button type="button" className={`mc-icon ${followed ? 'on' : ''}`} aria-pressed={followed} onClick={() => onFollow(p)} title={followed ? t('Ne plus suivre') : t('Suivre ce joueur')} aria-label={followed ? t('Ne plus suivre {name}', { name: p.name }) : t('Suivre {name}', { name: p.name })}><IconStar /></button>
          <button type="button" className="mc-icon" onClick={() => onCompare(p)} title={t('Comparer')} aria-label={t('Comparer {name}', { name: p.name })}><IconRadar /></button>
        </span>
      </div>
      <div className="mc-foot">
        <div className="mc-tags">
          <span className="mc-wage">{tr('Salaire demandé <0/>', [<b key="w">{fmtMoney(askedWage(state, p))}</b>])}{p.club ? <>{' · '}{t('contrat {plural}', { plural: plural(p.contract, 'an', 'ans') })}</> : null}</span>
          {recommended && <span className="mc-tag rec">{t('Recommandé')}</span>}
          {gain >= 0.3 && <span className="mc-tag good" title={t('Gain sur le titulaire le plus faible à son poste')}>{tr('Onze +<0/>', [fmtRating(gain)])}</span>}
          {p.interest > 0 && <span className="mc-tag warn">{tr('Courtisé<0/>', [tn(p.interest, '', ' par {interest} clubs', { interest: p.interest }, p.interest > 1)])}</span>}
          {tags.map((t) => <span key={t} className={`mc-tag ${TAG[t][1]}`}>{TAG[t][0]}</span>)}
          {note && <span className={`mc-tag ${noteTone}`}>{note}</span>}
        </div>
        <button
          type="button"
          className={`btn btn-sm mc-offer ${talks.counter || talks.fee ? 'counter' : ''}`}
          onClick={() => onOffer(p)}
          disabled={(full || talks.closed) && !talks.counter}
          title={full ? t('Effectif complet') : talks.closed ? t('Le vendeur ne discutera plus avant la prochaine journée') : ''}
        >
          {talks.fee ? t('Négocier son contrat') : talks.counter ? t('Contre-offre') : talks.closed ? t('Discussions closes') : t('Faire une offre')}
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
            <th className="c-who">{t('Joueur')}</th><th>{t('Poste')}</th><th>{t('Niveau')}</th><th>{t('Potentiel')}</th>
            <th title={t('Gain sur le titulaire le plus faible à son poste')}>{t('Onze')}</th><th className="c-tags">{t('Repères')}</th><th className="r">{t('Prix')}</th><th aria-label={t('Actions')} />
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
              <tr key={p.id} className={rec ? 'rec' : ''} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={t('Fiche de {name}', { name: p.name })}>
                <td className="c-who">
                  <span className="mc-row-who">
                    <Portrait p={p} size={40} club={p.club || null} free={!p.club} />
                    <span className="mc-row-id">
                      <b>{p.name}</b>
                      <em>{tr('<0/> · <1/> ans', [p.club ? <><Crest name={p.club} className="mc-crest" />{p.club}</> : <><i className="mc-free-dot" />{t('Joueur libre')}</>, p.age])}</em>
                    </span>
                  </span>
                </td>
                <td><span className={`pos-pill ${p.pos}`}>{p.pos}</span></td>
                <td className={`c-lvl ${heat(r, refLvl)}`}>{fmtRating(r)}</td>
                <td className="c-pot"><bdi dir="ltr">{pot ? `${fmtRating(pot[0])}–${fmtRating(pot[1])}` : t('atteint')}</bdi></td>
                <td className={`c-gain ${gain >= 0.05 ? 'up' : ''}`}><bdi dir="ltr">{gain >= 0.05 ? `+${fmtRating(gain)}` : '–'}</bdi></td>
                <td className="c-tags">
                  <span className="mc-row-tags">
                    {rec && <span className="mc-tag rec">{t('Recommandé')}</span>}
                    {p.interest > 0 && <span className="mc-tag warn">{tr('Courtisé<0/>', [p.interest > 1 ? ` · ${p.interest}` : ''])}</span>}
                    {tags.map((t) => <span key={t} className={`mc-tag ${TAG[t][1]}`}>{TAG[t][0]}</span>)}
                  </span>
                </td>
                <td className="c-price">
                  <b className={price > state.money ? 'over' : ''}>{fmtMoney(price)}</b>
                  {p.trend ? <IconTrend className={`mc-trend ${p.trend > 0 ? 'up' : 'down'}`} aria-label={p.trend > 0 ? t('prix en hausse') : t('prix en baisse')} /> : null}
                </td>
                <td className="c-act" onClick={(e) => e.stopPropagation()}>
                  <span className="mc-row-act">
                    <button type="button" className={`mc-icon ${followed.has(p.id) ? 'on' : ''}`} aria-pressed={followed.has(p.id)} onClick={() => onFollow(p)}
                      title={followed.has(p.id) ? t('Ne plus suivre') : t('Suivre ce joueur')} aria-label={followed.has(p.id) ? t('Ne plus suivre {name}', { name: p.name }) : t('Suivre {name}', { name: p.name })}><IconStar /></button>
                    <button type="button" className={`btn btn-sm mc-offer ${talks.counter || talks.fee ? 'counter' : ''}`} onClick={() => onOffer(p)}
                      disabled={(full || talks.closed) && !talks.counter} title={full ? t('Effectif complet') : talks.closed ? t('Le vendeur ne discutera plus avant la prochaine journée') : ''}>
                      {talks.fee ? t('Contrat') : talks.counter ? t('Contre-offre') : talks.closed ? t('Closes') : t('Offre')}
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
  if (n.season) parts.push(t('Nouvelle saison : le marché est renouvelé'));
  if (n.arrivals) parts.push(plural(n.arrivals, 'arrivée', 'arrivées'));
  if (n.departures) parts.push(plural(n.departures, 'joueur parti ailleurs', 'joueurs partis ailleurs'));
  if (n.offers) parts.push(plural(n.offers, 'offre reçue', 'offres reçues'));
  const courted = n.followedCourted || [];
  const gone = n.followedGone || [];
  if (!parts.length && !gone.length && !courted.length) return null;
  return (
    <div className="mc-news">
      <span className="eyebrow">{n.season ? t('Mercato') : t('Depuis la dernière journée')}</span>
      {parts.length > 0 && <p>{parts.join(' · ')}.</p>}
      {courted.length > 0 && (
        <p className="warn">{tr('<0/> <1/> de partir avant la prochaine journée.', [courted.join(comma()), tn(courted.length, 'est courtisé et risque', 'sont courtisés et risquent', {}, courted.length > 1)])}</p>
      )}
      {gone.length > 0 && <p className="bad">{tr('<0/> <1/> signé ailleurs.', [gone.join(comma()), tn(gone.length, 'a', 'ont', {}, gone.length > 1)])}</p>}
    </div>
  );
}

// Mode d'emploi en trois temps, à la première visite (jusqu'à « Compris »).
// Championnat entre amis : marché commun et clubs de l'ordinateur négociés comme en solo, offres aux amis (LeagueOffer).
function HowTo({ run, league = false }) {
  return (
    <section className="mc-howto" aria-label={t('Comment marche le mercato')}>
      {league ? (
        <ol>
          <li><b>{t('Repère')}</b><span>{t('Le marché commun et les clubs de l’ordinateur sont les mêmes pour toute la ligue ; de nouveaux joueurs libres arrivent à chaque journée.')}</span></li>
          <li><b>{t('Négocie')}</b><span>{t('Comme en solo : l’indemnité avec le club du joueur, puis son contrat. Le premier club de la ligue à conclure l’emporte. Les joueurs de tes amis sont dans l’onglet Amis : c’est ton ami qui répond à ton offre.')}</span></li>
          <li><b>{t('Vends')}</b><span>{t('Mets des joueurs en vente : des clubs hors de la ligue font aussitôt leurs offres, d’autres après chaque journée. Tes amis te font les leurs depuis leur onglet Amis.')}</span></li>
        </ol>
      ) : (
        <ol>
          <li><b>{t('Repère')}</b><span>{t('Filtre, trie, suis les joueurs avec l’étoile : leur prix bouge à chaque journée.')}</span></li>
          <li><b>{t('Négocie')}</b><span>{t('Fais une offre : la jauge affiche tes vraies chances. Refusée, elle peut amener une contre-offre.')}</span></li>
          <li><b>{t('Vends')}</b><span>{t('Mets des joueurs en vente : les clubs font leurs offres après chaque journée.')}</span></li>
        </ol>
      )}
      <button type="button" className="linkbtn mc-howto-ok" onClick={() => run((s) => { s.mercatoTips = true; return s; })}>{t('Compris')}</button>
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
        <p><b>{tr('Réseau de recrutement · bureau niveau <0/>', [lvl])}</b>{plural((state.transfers || []).length, 'joueur sous contrat suivi', 'joueurs sous contrat suivis')}{t(' par tes recruteurs · indemnités −')}{lvl * 3}{t(' % · vendeurs plus conciliants · potentiel mieux cerné.')}</p>
      ) : (
        <p>{tr('<0>Envie de plus de choix ?</0>Sans réseau de recruteurs, seuls <1/> joueurs sous contrat sont listés publiquement. Le Bureau des transferts (sur n’importe quelle parcelle libre) en suit <2/> dès le niveau 1 et fait baisser les indemnités.', [(c) => <b>{c}</b>, officeSize(0), officeSize(1)])}</p>
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
        <IconSort className="mc-sort-ico" /><span>{t('Trier')}</span><b>{current[1]}</b><IconChevron />
      </button>
      {open && (
        <div className="mc-sortlist" role="listbox" aria-label={t('Trier par')}>
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
      {!state.mercatoTips && <HowTo run={run} league={!!state.league} />}
      <News state={state} />
      {/* filtres (0.8.16) : recherche et tri sur une ligne, les postes en barre segmentée qui tient toujours en largeur,
          puis des bascules qui passent à la ligne au lieu de défiler hors de l'écran */}
      <div className="mc-filters">
        <div className="mc-filter-top">
          <label className="mc-search">
            <IconSearch />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Joueur ou club')} aria-label={t('Rechercher un joueur ou un club')} enterKeyHint="search" autoComplete="off" spellCheck={false} />
            {query && <button type="button" className="mc-search-clear" onClick={() => setQuery('')} aria-label={t('Effacer la recherche')}><IconClose /></button>}
          </label>
          <SortMenu value={sort} onChange={setSort} />
          <div className="sq-view mc-layout" role="group" aria-label={t('Affichage du marché')}>
            <button type="button" className={layout === 'cards' ? 'on' : ''} aria-pressed={layout === 'cards'} onClick={() => pickLayout('cards')}>{t('Cartes')}</button>
            <button type="button" className={layout === 'table' ? 'on' : ''} aria-pressed={layout === 'table'} onClick={() => pickLayout('table')}>{t('Tableau')}</button>
          </div>
        </div>
        <Tabs className="segmented mc-pos" role="radiogroup" label={t('Poste')} items={POS_FILTERS} value={pos} onChange={setPos} />
        <div className="mc-toggles">
          {chip(kind === 'free', () => setKind(kind === 'free' ? 'all' : 'free'), t('Libres'), kind === 'free')}
          {chip(kind === 'pro', () => setKind(kind === 'pro' ? 'all' : 'pro'), t('Sous contrat'), kind === 'pro')}
          {chip(only.afford, () => toggle('afford'), t('Dans mes moyens'), only.afford)}
          {chip(only.fit, () => toggle('fit'), t('Renforce mon onze'), only.fit)}
          {chip(only.gem, () => toggle('gem'), t('Pépites'), only.gem)}
        </div>
      </div>
      <p className="mc-count">{tr('<0/> · <1/>, <2/> sous contrat · le marché bouge à chaque journée', [list.length === pool.length ? plural(pool.length, 'joueur', 'joueurs') : t('{length} sur {length2} joueurs', { length: list.length, length2: pool.length }), plural(state.market.length, 'libre', 'libres'), (state.transfers || []).length])}</p>
      {layout === 'table' && list.length > 0 && (
        <MarketTable list={list} state={state} refLvl={refLvl} followed={followed} recommended={recommended}
          onOpen={(q) => onOpen(q, list)} onFollow={onFollow} onOffer={onOffer} />
      )}
      {/* le tableau ne tient pas sur un téléphone : les cartes y restent */}
      <ul className={`mc-grid ${layout === 'table' ? 'mc-grid-sm' : ''}`}>
        {list.length === 0 && <li className="empty">{t('Aucun joueur ne correspond à ces filtres pour l’instant.')}</li>}
        {list.map((p) => (
          <MarketCard key={p.id} p={p} state={state} refLvl={refLvl} followed={followed.has(p.id)} recommended={p.id === recommended}
            onOpen={(q) => onOpen(q, list)} onCompare={onCompare} onFollow={onFollow} onOffer={onOffer} />
        ))}
        {!state.league && <Network state={state} />}
      </ul>
    </>
  );
}

// --- Suivis -------------------------------------------------------------------------------------------

function WatchView({ state, refLvl, recommended, onOpen, onCompare, onFollow, onOffer, run }) {
  const list = state.shortlist || [];
  if (!list.length) {
    return <p className="mc-empty">{tr('<0/> Suis un joueur avec l’étoile de sa carte : son prix, l’intérêt des autres clubs et son départ éventuel s’afficheront ici.', [<IconStar />])}</p>;
  }
  const live = list.map((x) => ({ x, p: findOnMarket(state, x.id) })).filter((e) => e.p);
  const gone = list.filter((x) => !findOnMarket(state, x.id));
  const shown = live.map((e) => e.p);
  return (
    <>
      <p className="mc-count">{tr('<0/><1/> · l’écart de prix se compte depuis le jour où tu l’as suivi', [plural(live.length, 'joueur suivi', 'joueurs suivis'), gone.length ? t(' · {plural} ailleurs', { plural: plural(gone.length, 'parti', 'partis') }) : ''])}</p>
      {live.length > 0 && (
        <ul className="mc-grid">
          {live.map(({ x, p }) => {
            const now = costOf(p, state);
            const d = Math.round((now / x.price - 1) * 100);
            return (
              <MarketCard key={x.id} p={p} state={state} refLvl={refLvl} followed recommended={p.id === recommended}
                note={d ? t('{pct} depuis ton suivi', { pct: pct(now / x.price - 1) }) : t('Prix stable depuis ton suivi')}
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
              <span>{tr('<0/> a signé <1/>.', [<b>{x.name}</b>, x.gone ? clubAfter('à ', x.gone) : t('ailleurs')])}</span>
              <button className="linkbtn" onClick={() => run((s) => toggleShortlist(s, x.id))}>{t('Retirer')}</button>
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
  if (!price) return [o.amount >= o.v ? 'up' : 'down', t('{pct} sur sa valeur', { pct: pct(o.amount / o.v - 1) })];
  if (o.amount === price) return ['up', t('ton prix')];
  const d = Math.max(1, Math.round(Math.abs(o.amount / price - 1) * 100));
  return o.amount > price ? ['up', t('{d} % au-dessus de ton prix', { d })] : ['', t('{d} % sous ton prix', { d })];
}

// Réponse à la dernière offre traitée (vue Offres) : vente, refus, départ du club, dernier mot.
function SaleFlash({ sale }) {
  const c = sale.club;
  return (
    <p className={`mc-flash ${sale.result}`} role="status">
      {sale.result === 'sold' && tr('<0/> rejoint <1/> pour <2/>.', [sale.name, withArticle(c), <b>{fmtMoney(sale.amount)}</b>])}
      {sale.result === 'refused' && tr('Offre <0/> pour <1/> refusée : le club se retire.', [clubAfter('de ', c), sale.name])}
      {sale.result === 'walked' && tr('<0/> <1/> (<2/>).', [Club(c), agree(c, 'juge ta demande excessive et se retire', 'jugent ta demande excessive et se retirent'), sale.name])}
      {sale.result === 'agreed' && tr('<0/> <1/> ta demande de <2/> pour <3/> : à toi de vendre ou de refuser.', [Club(c), agree(c, 'accepte', 'acceptent'), <b>{fmtMoney(sale.amount)}</b>, sale.name])}
      {sale.result === 'countered' && tr('<0/> <1/> à <2/> pour <3/> : c’est <4/> dernier mot.', [Club(c), agree(c, 'monte', 'montent'), <b>{fmtMoney(sale.amount)}</b>, sale.name, agree(c, 'son', 'leur')])}
      {sale.result === 'held' && tr('<0/> <1/> offre de <2/> pour <3/> : c’est <4/> dernier mot.', [Club(c), agree(c, 'maintient son', 'maintiennent leur'), <b>{fmtMoney(sale.amount)}</b>, sale.name, agree(c, 'son', 'leur')])}
    </p>
  );
}

// Résultat des enchères : qui a battu la meilleure offre, qui s'est retiré.
function AuctionFlash({ a }) {
  const up = a.moves.filter((m) => m.to !== null);
  const best = Math.max(a.best, ...up.map((m) => m.to));
  return (
    <p className={`mc-flash ${up.length ? 'sold' : 'walked'}`} role="status">{tr('Enchères pour <0/> :', [a.name])}{' '}
      {a.moves.map((m, i) => (
        <React.Fragment key={m.offerId}>
          {i > 0 && semicolon()}
          {m.to !== null
            ? tr('<0/> <1/> à <2/>', [withArticle(m.club), agree(m.club, 'monte', 'montent'), <b>{fmtMoney(m.to)}</b>])
            : tr('<0/> <1/>', [withArticle(m.club), agree(m.club, 'se retire', 'se retirent')])}
        </React.Fragment>
      ))}
      . {best > a.best
        ? tr('Meilleure offre : <0/>.', [<b>{fmtMoney(best)}</b>])
        : tr('<0/> <1/> la meilleure offre (<2/>).', [Club(a.club), agree(a.club, 'garde', 'gardent'), <b>{fmtMoney(a.best)}</b>])}
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
      title: t('Vendre {name} {clubAfter} ?', { name: p.name, clubAfter: clubAfter('à ', o.club) }),
      text: t('{name} ({age} ans, {toLowerCase}, note {fmtRating}) rejoindra {withArticle}.{v}', { name: p.name, age: p.age, toLowerCase: POS_LABELS[p.pos].toLowerCase(), fmtRating: fmtRating(playerRating(p)), withArticle: withArticle(o.club), v: state.lineup?.includes(p.id) ? t(' C’est un titulaire : ton onze sera recomposé.') : '' }),
      rows: [
        [t('Montant du transfert'), `+${fmtMoney(o.amount)}`, 'up'],
        [t('Salaire économisé'), t('{wageOf} / saison', { wageOf: fmtMoney(wageOf(p, state.divisionIndex)) }), 'up'],
        [t('Fin de saison prévue'), `${fmtMoney(imp.endNow)} → ${fmtMoney(imp.endAfter)}`],
      ],
      confirmLabel: t('Vendre · {amount}', { amount: fmtMoney(o.amount) }),
      onConfirm: () => {
        const since = Date.now();
        if (run((s) => answerOffer(s, o.id, 'accept'), t('Effectif au minimum ({SQUAD_MIN} joueurs).', { SQUAD_MIN }))) onSale(o.id, since); // écran de vente conclue
      },
    });
  };
  const bidUp = (g) => {
    const [top, ...rest] = g.list;
    ask({
      title: t('Faire monter les enchères pour {name} ?', { name: g.p.name }),
      text: t('{Club} {agree} offre de {amount}. Chaque autre club doit la battre, sinon il se retire. Une seule fois par journée.', { Club: Club(top.club), agree: agree(top.club, 'garde son', 'gardent leur'), amount: fmtMoney(top.amount) }),
      rows: rest.map((o) => {
        const c = pctOf(outbidChance(o, top.amount));
        return [o.club, t('{c} % de la battre', { c }), c >= 50 ? 'up' : c === 0 ? 'down' : ''];
      }),
      confirmLabel: t('Lancer les enchères'),
      onConfirm: () => run((s) => startAuction(s, g.p.id)),
    });
  };
  return (
    <>
      {counters.length > 0 && (
        <section className="mc-sec">
          <span className="eyebrow">{t('À conclure avant la prochaine journée')}</span>
          <ul className="mc-rows">
            {counters.map((p) => (
              <li key={p.id} className="mc-row counter">
                <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                <span className="mc-row-main"><b>{p.name}</b><em>{pendingText(state, p)}</em></span>
                <button className="btn btn-sm" onClick={() => onOffer(p)}>{t('Voir')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mc-sec">
        <span className="eyebrow">{t('Offres reçues')}</span>
        {sale && <SaleFlash key={sale.at} sale={sale} />}
        {auction && <AuctionFlash key={auction.at} a={auction} />}
        {groups.length === 0 ? (
          <p className="mc-hint">{t('Aucune offre pour l’instant. Mets un joueur en vente, à ton prix : les clubs intéressés font aussitôt leur offre, d’autres suivent après chaque journée, et un joueur en grande forme peut aussi recevoir une offre spontanée. Une offre vaut jusqu’à la journée suivante.')}</p>
        ) : (
          <>
            <p className="mc-hint">{t('Valables jusqu’à la prochaine journée. « Négocier » : tu fixes ta demande, avec ta chance exacte d’accord. « Faire monter les enchères » : chaque club tente de battre la meilleure offre, ou se retire.')}</p>
            {groups.map((g) => {
              const done = auctionDone(state, g.p.id);
              const block = saleBlock(state, g.p); // blessé ou suspendu : ni acceptée, ni négociée
              const hopeless = g.list.length >= 2 && g.list.slice(1).every((o) => outbidChance(o, g.list[0].amount) <= 0);
              return (
                <div key={g.p.id} className="mc-group">
                  <div className="mc-group-head">
                    <span className={`mc-medal sm ${heat(playerRating(g.p), refLvl)}`}><b>{fmtRating(playerRating(g.p))}</b><span>{g.p.pos}</span></span>
                    <span className="mc-row-main"><b>{g.p.name}</b><em>{block ? block.text : <>{g.sale ? t('En vente à {price}', { price: fmtMoney(g.sale.price) }) : t('Pas à vendre')}{t(' · valeur ')}{fmtMoney(valueOf(state, g.p))}</>}</em></span>
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
                            <em>{buyerLine(o)}{o.unsolicited ? t(' · offre spontanée') : ''}</em>
                          </span>
                          <span className="mc-amount"><b>{fmtMoney(o.amount)}</b><em className={o.talks?.agreed ? 'up' : o.talks?.closed ? '' : tone}>{o.talks?.agreed ? t('accord à ton prix') : o.talks?.closed ? t('dernier mot') : note}</em></span>
                          <div className="mc-row-actions">
                            <button className="btn btn-sm" disabled={!canSell || !!block} onClick={() => accept(o, g.p)} title={block ? block.text : canSell ? '' : t('Effectif au minimum ({SQUAD_MIN} joueurs)', { SQUAD_MIN })}>{t('Accepter')}</button>
                            {!o.talks?.closed && !block && <button className="btn ghost btn-sm" onClick={() => onSale(o.id)}>{t('Négocier')}</button>}
                            <button className="btn ghost btn-sm refuse" onClick={() => run((s) => answerOffer(s, o.id, 'refuse'))}>{t('Refuser')}</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {g.list.length >= 2 && (
                    <button className="btn ghost mc-auction" disabled={done || hopeless} onClick={() => bidUp(g)}>
                      {done ? t('Enchères déjà lancées aujourd’hui') : hopeless ? t('Aucun club ne peut battre la meilleure offre') : t('Faire monter les enchères · {length} clubs', { length: g.list.length })}
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
          <span className="eyebrow">{t('Mes joueurs en vente')}</span>
          <button className="linkbtn mc-pick" onClick={() => setPicking(!picking)}>{picking ? t('Terminer') : t('Choisir des joueurs')}</button>
        </div>
        {picking ? (
          <ul className="mc-rows">
            {[...state.players].sort((a, b) => 'GDMA'.indexOf(a.pos) - 'GDMA'.indexOf(b.pos) || playerRating(b) - playerRating(a)).map((p) => {
              const on = listed.some((x) => x.p === p);
              const block = saleBlock(state, p);
              return (
                <li key={p.id} className={`mc-row pick ${on ? 'on' : ''} ${block && !on ? 'blocked' : ''}`}>
                  <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                  <span className="mc-row-main"><b>{p.name}</b><em>{block && !on ? t('{short} : vente impossible', { short: block.short }) : <>{p.age}{t(' ans · valeur ')}{fmtMoney(valueOf(state, p))}{state.lineup?.includes(p.id) ? t(' · titulaire') : ''}</>}</em></span>
                  {/* mise en vente : la fenêtre du prix s'ouvre ; retrait immédiat */}
                  <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={t('{name} en vente', { name: p.name })} disabled={!!block && !on} title={block && !on ? block.text : ''} onClick={() => (on ? run((s) => setForSale(s, p.id, false)) : onList(p.id))}><i /></button>
                </li>
              );
            })}
          </ul>
        ) : listed.length === 0 ? (
          <p className="mc-hint">{t('Aucun joueur en vente. Choisis-en ici ou depuis la fiche d’un joueur de l’effectif : tu fixes ton prix, et les clubs intéressés font aussitôt leur offre.')}</p>
        ) : (
          <ul className="mc-rows">
            {listed.map(({ p, price }) => {
              const n = offersFor(state, p.id).length;
              const block = saleBlock(state, p);
              return (
                <li key={p.id} className="mc-row">
                  <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
                  <span className="mc-row-main"><b>{p.name}</b><em>{tr('En vente à <0/> · <1/>', [fmtMoney(price), block ? t('{toLowerCase} : les clubs reviendront à son retour', { toLowerCase: block.short.toLowerCase() }) : n ? plural(n, 'club intéressé', 'clubs intéressés') : t('d’autres clubs après la journée')])}</em></span>
                  <button className="linkbtn" onClick={() => run((s) => setForSale(s, p.id, false))}>{t('Retirer')}</button>
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

// Transferts de la ligue (0.8.8, demande du PDG) : ceux des amis, saison en cours et précédente, journée par journée,
// relus du serveur à l'ouverture du Bilan. Chaque ligne : le joueur (niveau d'après ses qualités, poste, âge), club de
// départ → club d'arrivée, montant, journée ; les nôtres en or. Les négociations refusées n'y figurent pas.
function LeagueTransfers({ state, refLvl }) {
  const L = state.league;
  const [data, setData] = useState(null); // null : chargement ; { list } ou { error }
  const [season, setSeason] = useState(L.server?.season || state.seasonNumber);
  useEffect(() => {
    let live = true;
    const m = myLeagues().find((x) => x.code === L.code);
    if (!m) { setData({ error: true }); return undefined; }
    leagueTransfers(m).then((d) => { if (live) setData({ list: Array.isArray(d?.transfers) ? d.transfers : [] }); }, () => { if (live) setData({ error: true }); });
    return () => { live = false; };
  }, [L.code]);
  const club = (member) => L.clubs.find((c) => c.member === member)?.name || t('un club');
  const from = (x) => (x.kind === 'm' ? t('Marché commun') : x.kind === 'a' ? L.clubs.find((c) => c.slot === Number(x.seller))?.name || t('un club') : club(x.seller));
  const seasons = data?.list ? [...new Set(data.list.map((x) => x.season))].sort((a, b) => b - a) : [];
  const shown = (data?.list || []).filter((x) => x.season === season);
  const level = (x) => {
    if (!x.pos || !x.a) return null;
    try { return playerRating(unsnapPlayer({ n: x.n, pos: x.pos, g: x.g, a: x.a, ...(x.k ? { k: x.k } : {}) })); } catch { return null; }
  };
  return (
    <section className="mc-sec lt">
      <div className="lt-head">
        <span className="eyebrow">{t('Transferts de la ligue')}</span>
        {seasons.length > 1 && (
          <div className="chips">
            {seasons.map((n) => <button key={n} type="button" className={n === season ? 'active' : ''} onClick={() => setSeason(n)}>{tr('Saison <0/>', [n])}</button>)}
          </div>
        )}
      </div>
      {!data ? <p className="mc-hint">{t('Chargement des transferts…')}</p>
        : data.error ? <p className="mc-hint">{t('Historique indisponible pour l’instant : il revient avec la connexion à la ligue.')}</p>
          : shown.length === 0 ? <p className="mc-hint">{t('Aucun transfert entre amis cette saison. Chaque signature au marché commun, chez un club de l’ordinateur ou entre amis s’inscrira ici.')}</p>
            : (
              <ul className="mc-rows lt-rows">
                {shown.map((x, i) => {
                  const r = level(x);
                  const mine = x.buyer === L.me || x.seller === L.me;
                  return (
                    <li key={`${x.season}-${x.round}-${i}`} className={`mc-row ${mine ? 'mine' : ''}`}>
                      {r !== null
                        ? <span className={`mc-medal sm ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{x.pos}</span></span>
                        : <span className="mc-medal sm" aria-hidden="true"><b>–</b><span>{x.pos || ''}</span></span>}
                      <span className="mc-row-main">
                        <b>{x.n || t('Joueur')}</b>
                        <em>{from(x)}{' '}→ {club(x.buyer)}{x.g ? t(' · {g} ans', { g: x.g }) : ''}</em>
                      </span>
                      <span className="mc-amount"><b>{x.fee ? fmtMoney(x.fee) : t('Libre')}</b><em>{x.round ? t('après la journée {round}', { round: x.round }) : t('avant la 1re journée')}</em></span>
                    </li>
                  );
                })}
              </ul>
            )}
    </section>
  );
}

function LogView({ state, refLvl }) {
  const log = state.mercatoLog || [];
  const season = log.filter((x) => x.season === state.seasonNumber);
  const sum = (list, kind) => list.filter((x) => x.kind === kind).reduce((a, x) => a + x.fee, 0);
  const count = (list, kind) => list.filter((x) => x.kind === kind).length;
  const net = sum(season, 'out') - sum(season, 'in');
  const allNet = sum(log, 'out') - sum(log, 'in');
  const bestBuy = state.records?.bestBuy;
  const bestSale = log.filter((x) => x.kind === 'out' && x.fee > 0).sort((a, b) => b.fee - a.fee)[0];
  return (
    <>
      {state.league && <LeagueTransfers state={state} refLvl={refLvl} />}
      <span className="eyebrow">{tr('Saison <0/>', [state.seasonNumber])}</span>
      <div className="mc-tiles">
        <div><span>{t('Achats')}</span><b>{fmtMoney(sum(season, 'in'))}</b><em>{plural(count(season, 'in'), 'arrivée', 'arrivées')}</em></div>
        <div><span>{t('Ventes')}</span><b>{fmtMoney(sum(season, 'out'))}</b><em>{plural(count(season, 'out'), 'départ', 'départs')}</em></div>
        <div><span>{t('Solde')}</span><b className={net > 0 ? 'up' : net < 0 ? 'down' : ''}>{net > 0 ? '+' : ''}{fmtMoney(net)}</b><em>{net >= 0 ? t('bénéfice') : t('investissement')}</em></div>
      </div>
      {log.length > season.length && (
        <p className="mc-hint">{tr('Depuis la création du club : <0/> d’achats, <1/> de ventes, solde <2/><3/>.', [fmtMoney(sum(log, 'in')), fmtMoney(sum(log, 'out')), allNet > 0 ? '+' : '', fmtMoney(allNet)])}</p>
      )}
      {(bestBuy || bestSale) && (
        <div className="mc-records">
          {bestBuy && <span>{tr('Plus gros achat du club : <0/> · <1/> (saison <2/>)', [<b>{bestBuy.name}</b>, fmtMoney(bestBuy.fee), bestBuy.season])}</span>}
          {bestSale && <span>{tr('Plus grosse vente : <0/> · <1/> (saison <2/>)', [<b>{bestSale.name}</b>, fmtMoney(bestSale.fee), bestSale.season])}</span>}
        </div>
      )}
      {log.length === 0 ? (
        <p className="mc-hint">{t('Aucun transfert pour l’instant. Chaque arrivée et chaque départ s’inscriront ici, avec leur montant.')}</p>
      ) : (
        <ul className="mc-rows mc-log">
          {[...log].reverse().map((x, i) => (
            <li key={i} className={`mc-row ${x.kind}`}>
              <span className={`mc-way ${x.kind}`}>{x.kind === 'in' ? t('Arrivée') : t('Départ')}</span>
              <span className="mc-row-main">
                <b>{x.name}</b>
                <em>{tr('<0/> · <1/> ans · <2/> · <3/> · <4/>', [x.pos, x.age, fmtRating(x.rating), x.kind === 'in' ? (x.club ? clubAfter('de ', x.club) : t('joueur libre')) : (x.club ? t('vers {withArticle}{v}', { withArticle: withArticle(x.club), v: x.board ? t(' (vendu par le conseil)') : '' }) : t('parti libre, en fin de contrat')), moveWhen(x.season, x.round)])}</em>
              </span>
              {x.kind === 'out' && !x.club ? <b className="mc-fee">{t('Libre')}</b> : <b className={`mc-fee ${x.kind === 'in' ? 'down' : 'up'}`}>{x.kind === 'in' ? '−' : '+'}{fmtMoney(x.fee)}</b>}
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
  const asked = viewProp ?? viewState;
  const view = asked === 'friends' && !state.league ? 'buy' : asked; // l'onglet Amis n'existe qu'en ligue
  const setView = onView || setViewState;
  const followed = new Set((state.shortlist || []).filter((x) => !x.gone).map((x) => x.id));
  const follow = (p) => run((s) => toggleShortlist(s, p.id));
  // à traiter : offres reçues, contre-offres en attente, négociations entre amis où c'est notre tour (0.8.8)
  const L = state.league;
  const todo = (state.offers || []).length + pendingCounters(state).length + (L?.offersIn || []).filter((o) => o.w !== 'b').length
    + (L?.offersOut || []).filter((o) => o.status === 'open' && o.w === 'b').length;
  const common = { state, refLvl, recommended, onOpen, onCompare, onFollow: follow, onOffer };
  return (
    <div className="mc">
      {!onView && <Tabs
        className={`segmented mc-views ${L ? 'with-friends' : ''}`}
        items={[
          ['buy', t('Recruter')],
          ...(L ? [['friends', t('Amis')]] : []),
          ['watch', t('Suivis'), followed.size ? <em className="mc-count-badge">{followed.size}</em> : null],
          ['offers', t('Offres'), todo ? <em className="mc-count-badge hot">{todo}</em> : null],
          ['log', t('Bilan')],
        ]}
        value={view}
        onChange={setView}
        label={t('Mercato')}
      />}
      {view === 'buy' && <BuyView {...common} run={run} followed={followed} />}
      {view === 'friends' && L && <FriendsView state={state} refLvl={refLvl} onOffer={onOffer} />}
      {view === 'watch' && <WatchView {...common} run={run} />}
      {view === 'offers' && state.league && <LeagueOffersBlock state={state} run={run} ask={ask} refLvl={refLvl} onOffer={onOffer} />}
      {view === 'offers' && <OffersView state={state} refLvl={refLvl} run={run} ask={ask} onOffer={onOffer} onSale={onSale} onList={onList} />}
      {view === 'log' && <LogView state={state} refLvl={refLvl} />}
    </div>
  );
}

// --- Amis (championnat entre amis, 1.0.2) -----------------------------------------------------------------

// Lignes d'un effectif d'un autre club de la ligue (rows de s.league.rosters : id, n, pos, age, r, v), par poste puis
// niveau ; aussi pour l'effectif ouvert depuis le classement (roster.jsx). open(x) : le bouton de la ligne (id non nul) ;
// note(x) : une mention sous le nom (offre en cours).
const ROSTER_ORDER = { G: 0, D: 1, M: 2, A: 3 };
export const sortRoster = (rows) => [...(rows || [])].sort((a, b) => ROSTER_ORDER[a.pos] - ROSTER_ORDER[b.pos] || b.r - a.r);
export function RosterRows({ rows, refLvl, label, ghost = false, onOpen, note = () => null }) {
  return (
    <ul className="mc-rows ro-rows">
      {rows.map((x, k) => (
        <li key={`${x.n}-${k}`} className={`mc-row ${x.id === null ? 'muted' : ''}`}>
          <span className={`mc-medal sm ${heat(x.r, refLvl)}`}><b>{fmtRating(x.r)}</b><span>{x.pos}</span></span>
          <span className="mc-row-main"><b>{x.n}</b><em>{note(x) || <>{tr('<0/> · <1/> ans', [POS_LABELS[x.pos], x.age])}<span className="ro-val">{fmtMoney(x.v)}</span></>}</em></span>
          <span className="mc-amount"><b>{fmtMoney(x.v)}</b><em>{t('valeur')}</em></span>
          {x.id !== null && <button className={`btn btn-sm ${ghost ? 'ghost' : ''}`} onClick={() => onOpen(x)}>{label(x)}</button>}
        </li>
      ))}
    </ul>
  );
}

// L'onglet Amis du mercato (1.0.2, demande du PDG) : l'effectif de chaque ami, club par club, et une offre en un geste,
// dès avant la première journée. Une offre en cours se lit sur la ligne du joueur.
function FriendsView({ state, refLvl, onOffer }) {
  const L = state.league;
  const friends = L.clubs.filter((c) => c.human && c.slot !== L.slot).sort((a, b) => a.slot - b.slot);
  const pool = poolOf(state);
  const out = new Map((L.offersOut || []).map((o) => [o.l, o]));
  if (!friends.length) return <p className="mc-empty">{t('Aucun ami dans ce championnat pour l’instant.')}</p>;
  const mine = (x) => (x.id === null ? null : out.get(x.id - FRIEND_ID));
  const note = (x) => {
    const o = mine(x);
    if (!o) return null;
    if (o.status === 'no') return t('Ton offre a été refusée');
    return o.w === 'b' ? t('Contre-offre de ton ami · {x}', { x: fmtMoney(o.x) }) : t('Ton offre · {x} · en attente', { x: fmtMoney(o.x) });
  };
  const open = (x) => { const p = pool.find((q) => q.id === x.id); if (p) onOffer(p); };
  return (
    <>
      <p className="mc-count">{t('Les effectifs de tes amis : fais une offre, ton ami l’accepte, la refuse ou te répond par une contre-offre.')}</p>
      {friends.map((c) => {
        const rows = sortRoster(L.rosters?.[c.slot]);
        return (
          <section key={c.slot} className="mc-friend">
            <header className="ro-head">
              {c.crest ? <ClubCrest crest={c.crest} name={c.name} className="ro-crest" /> : <Crest name={c.name} className="ro-crest" />}
              <div>
                <h3>{c.name}</h3>
                <span>{rows.length ? tn(rows.length, '{pseudo} · {length} joueur', '{pseudo} · {length} joueurs', { pseudo: c.pseudo || t('ton ami'), length: rows.length }, rows.length > 1) : c.pseudo}</span>
              </div>
            </header>
            {L.rosterFrom?.[c.slot] === 'prev' && <p className="mc-hint">{t('Effectif de la saison passée : il se met à jour avec ses achats et ses matchs.')}</p>}
            {rows.length ? (
              <RosterRows rows={rows} refLvl={refLvl} onOpen={open} note={note} label={(x) => (!mine(x) || mine(x).status === 'no' ? t('Faire une offre') : mine(x).w === 'b' ? t('Voir') : t('Mon offre'))} />
            ) : (
              <p className="mc-hint">{t('L’effectif de ton ami s’affichera après son prochain match joué.')}</p>
            )}
          </section>
        );
      })}
    </>
  );
}

// --- Négociation ----------------------------------------------------------------------------------------

const QUICK = [[0.8, '−20 %'], [0.9, '−10 %'], [1, t('Prix demandé')]];
const vsDemand = (x, d) => {
  if (x === d) return t('sa demande');
  const k = Math.max(1, Math.round(Math.abs(x / d - 1) * 100));
  return t('{k} % {v} sa demande', { k, v: x < d ? t('sous') : t('au-dessus de') });
};
const yearsOf = (n) => plural(n, 'an', 'ans'); // durée d'un contrat (une saison = un an)
// Championnat entre amis : la raison d'un refus du serveur des ligues, dite par le jeu (jamais le texte brut du serveur) ;
// aussi pour les notifications (App.jsx). kind : sign, offer ou answer.
export function leagueNote(note, kind) {
  if (/journée se joue/.test(note || '')) return t('Le mercato est fermé le temps de jouer la journée. Réessaie après le match.');
  if (/au plus/.test(note || '')) return kind === 'sign' ? t('Six signatures au plus par journée : réessaie après le prochain match.') : t('Trois offres en attente au plus : retire-en une, ou attends une réponse.');
  if (/transféré|retirée|répondue|quitté/.test(note || '')) return t('Ce joueur vient de changer de situation : rouvre le mercato pour voir où il en est.');
  if (kind === 'answer') return t('Ta réponse n’est pas partie. Réessaie dans un moment.');
  return kind === 'sign' ? t('La ligue n’a pas pu confirmer la signature. Réessaie dans un moment.') : t('Ton offre n’est pas partie. Réessaie dans un moment.');
}
// La négociation à l'écran (son joueur) : une réponse de la ligue qu'elle affiche déjà ne repart pas en notification.
export const dealOnScreen = { id: null };
const NICE = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1e6];
const niceStep = (v) => NICE.find((x) => x >= v) || 1e6; // pas rond de la prime (dix pas environ jusqu'à ce qu'il attend)
// Négociation en cours, à conclure avant la prochaine journée (vue Offres) : contre-proposition de l'agent, indemnité
// convenue (contrat à négocier) ou contre-offre du club.
function pendingText(state, p) {
  const c = ctalksOf(state, p).counter;
  if (c) return t('Contre-proposition de son agent : {wage} par saison sur {yearsOf}', { wage: fmtMoney(c.wage), yearsOf: yearsOf(c.years) });
  if (p.talks?.fee) return t('Indemnité convenue ({fee}) : son contrat reste à négocier', { fee: fmtMoney(p.talks.fee) });
  return t('Contre-offre {clubAfter} : {counter} (prix demandé {costOf})', { clubAfter: clubAfter('de ', p.club), counter: fmtMoney(p.talks.counter), costOf: fmtMoney(costOf(p, state)) });
}
const clauseText = (c) => (c ? t('clause de montée +{round} %', { round: Math.round(c * 100) }) : '');
// Conditions signées, en une phrase (écran d'accord) ; une prolongation rappelle seulement la prime et la clause.
function termsLine(row, renew) {
  const parts = [renew ? '' : t('contrat de {yearsOf} à {wage} par saison', { yearsOf: yearsOf(row.years), wage: fmtMoney(row.wage) }), row.bonus ? t('prime de {bonus}', { bonus: fmtMoney(row.bonus) }) : '', row.clause ? t('clause de montée de +{round} %', { round: Math.round(row.clause * 100) }) : ''].filter(Boolean);
  return parts.length ? `${capitalize(parts.join(comma()))}.` : '';
}

// Négociation d'une recrue (0.8.0), en deux temps : l'indemnité avec son club (joueur sous contrat), puis le contrat
// avec le joueur (salaire, durée, prime, clause de montée) ; un joueur libre passe directement au contrat. La même
// fenêtre sert à prolonger un joueur de l'effectif. Sur PC, une grande fenêtre centrée en deux colonnes (réglages à
// gauche, raisons, coûts et chances à droite) ; au téléphone, une feuille, jauge et bouton collés en bas. Les chances
// affichées sont celles qui décident (mercato.js, contracts.js).
export function Negotiation({ state, p, run, refLvl, onClose, onSheet, onLineup }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  const [opened] = useState(() => Date.now());
  const [mode] = useState(() => (state.players.some((q) => q.id === p.id) ? 'renew' : 'sign'));
  const fresh = (x) => (x && x.id === p.id && x.at >= opened ? x : null); // réponse donnée dans cette fenêtre
  const done = fresh(state.lastContract)?.result === 'accepted' ? state.lastContract : null;
  useEffect(() => { if (done) haptic('build'); }, [done?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMarket = !!findOnMarket(state, p.id);
  // championnat entre amis : l'accord trouvé attend la confirmation de la ligue (le premier club qui signe l'emporte)
  const waiting = state.league ? queuedFor(state, (x) => x.k === 'sign' && x.id === p.id) : null;
  const lost = ['taken', 'blocked'].includes(fresh(state.lastContract)?.result) ? state.lastContract : null;
  useEffect(() => { dealOnScreen.id = p.id; return () => { if (dealOnScreen.id === p.id) dealOnScreen.id = null; }; }, [p.id]);
  const shell = (cls, label, body) => (
    <div className="sq-overlay ng-overlay" onClick={onClose}>
      <article ref={ref} className={`sq-sheet glass ng ng-deal ${cls}`} onClick={(e) => e.stopPropagation()} aria-label={label}>
        <span className="grip" aria-hidden="true" />
        {body}
      </article>
    </div>
  );
  const bar = (eyebrow) => <header className="sh-bar"><span className="eyebrow">{eyebrow}</span><button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button></header>;

  if (!done && (waiting || lost)) {
    return shell('ng-done', waiting ? t('Signature en cours') : t('Signature manquée'), (
      <>
        {bar(t('Mercato'))}
        <section className="ng-win">
          {waiting ? (
            <>
              <span className="ng-win-ico wait"><IconTransfer /></span>
              <h3>{t('Accord trouvé')}</h3>
              <p>{tr('La ligue doit encore confirmer la signature de <0/> : si un autre club a conclu avant toi, il l’emporte.', [<b>{p.name}</b>])}</p>
              {waiting.fee > 0 && <p className="ng-terms-line">{tr('Indemnité convenue <0/> : <1/>.', [clubAfter('avec ', p.club), fmtMoney(waiting.fee)])}</p>}
              {termsLine(waiting.terms, false) && <p className="ng-terms-line">{termsLine(waiting.terms, false)}</p>}
            </>
          ) : (
            <>
              <span className="ng-win-ico lost"><IconClose /></span>
              <h3>{lost.result === 'taken' ? t('Trop tard') : t('Signature non confirmée')}</h3>
              <p>{lost.result === 'taken' ? <>{t('Un autre club de la ligue a signé ')}<b>{p.name}</b>{t(' juste avant toi.')}</> : leagueNote(lost.note, 'sign')}</p>
            </>
          )}
          <div className="ng-actions"><button className="btn ghost" onClick={onClose}>{t('Retour au mercato')}</button></div>
        </section>
      </>
    ));
  }

  if (done || (mode === 'sign' && !onMarket)) {
    const signed = done && state.players.find((q) => q.id === p.id);
    const gain = signed && mode === 'sign' ? fitGain(state, signed) : 0;
    const row = done?.terms;
    const deal = fresh(state.lastDeal) || (state.lastDeal?.id === p.id ? state.lastDeal : null);
    const saved = mode === 'sign' && deal?.result === 'agreed' ? deal.ask - deal.amount : 0;
    return shell('ng-done', mode === 'renew' ? t('Contrat prolongé') : t('Transfert conclu'), (
      <>
        {bar(mode === 'renew' ? t('Prolongation') : t('Mercato'))}
        {signed ? (
          <section className="ng-win">
            <span className="ng-win-ico"><IconCheck /></span>
            <h3>{mode === 'renew' ? t('Contrat prolongé !') : t('Accord conclu !')}</h3>
            {mode === 'renew' ? (
              <p>{tr('<0/> est sous contrat jusqu’à la saison <1/>, à <2/> par saison<3/>.', [<b>{p.name}</b>, <b>{signed.deal.until}</b>, <b>{fmtMoney(row.wage)}</b>, done.before ? t(' ({before} jusqu’ici)', { before: fmtMoney(done.before) }) : ''])}</p>
            ) : (
              <p>{tr('<0/> rejoint ton effectif<1/>.', [<b>{p.name}</b>, done.fee ? <>{t(' pour ')}<b>{fmtMoney(done.fee)}</b></> : ''])}</p>
            )}
            {termsLine(row, mode === 'renew') && <p className="ng-terms-line">{termsLine(row, mode === 'renew')}</p>}
            {saved > 0 && <p className="ng-saved">{tr('<0/> économisés sur l’indemnité demandée (<1/>).', [fmtMoney(saved), fmtMoney(deal.ask)])}</p>}
            {saved < 0 && <p className="ng-paid">{tr('<0/> de plus que l’indemnité demandée (<1/>).', [fmtMoney(-saved), fmtMoney(deal.ask)])}</p>}
            {gain >= 0.3 && <p className="ng-fit">{tr('Il renforce ton onze : +<0/> sur le titulaire le plus faible à son poste.', [fmtRating(gain)])}</p>}
            <div className="ng-actions">
              {gain >= 0.3 && onLineup && <button className="btn" onClick={onLineup}>{t('Composer l’équipe')}</button>}
              <button className={`btn ${gain >= 0.3 && onLineup ? 'ghost' : ''}`} onClick={() => onSheet(p.id)}>{t('Voir sa fiche')}</button>
              <button className="btn ghost" onClick={onClose}>{mode === 'renew' ? t('Fermer') : t('Retour au mercato')}</button>
            </div>
          </section>
        ) : (
          <section className="ng-win">
            <h3>{t('Joueur indisponible')}</h3>
            <p>{tr('<0/> n’est plus sur le marché.', [p.name])}</p>
            <div className="ng-actions"><button className="btn ghost" onClick={onClose}>{t('Retour au mercato')}</button></div>
          </section>
        )}
      </>
    ));
  }

  const own = mode === 'renew' ? state.players.find((q) => q.id === p.id) : null;
  if (mode === 'renew' && !own) return shell('ng-done', t('Prolongation'), <>{bar(t('Prolongation'))}<section className="ng-win"><h3>{t('Joueur parti')}</h3><p>{tr('<0/> n’est plus au club.', [p.name])}</p></section></>);
  const feeStage = mode === 'sign' && !!p.club && !p.talks?.fee;
  const r = playerRating(p);
  return shell('', t('{v} pour {name}', { v: mode === 'renew' ? t('Prolongation') : t('Négociation'), name: p.name }), (
    <>
      {bar(mode === 'renew' ? t('Prolongation') : feeStage ? t('Négociation · indemnité') : t('Négociation · contrat'))}
      <section className="ng-player">
        <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
        <div>
          <h3>{p.name}</h3>
          <span className="ng-club">
            {mode === 'renew'
              ? <>{t('Saison en cours : ')}{state.seasonNumber} · {own.deal.until <= state.seasonNumber ? t('dernière année de contrat') : t('sous contrat jusqu’à la saison {until}', { until: own.deal.until })} · {fmtMoney(own.deal.wage)}{t(' par saison · ')}{p.age}{t(' ans')}</>
              : p.club ? <><Crest name={p.club} className="mc-crest" />{p.club}{t(' · encore ')}{plural(p.contract, 'an', 'ans')}{t(' de contrat avec son club · ')}{p.age}{t(' ans')}</> : <>{t('Joueur libre · pas d’indemnité · ')}{p.age}{t(' ans')}</>}
          </span>
        </div>
        <button className="linkbtn ng-sheet" onClick={() => onSheet(p.id)}>{t('Sa fiche')}</button>
      </section>
      {mode === 'sign' && p.club && (
        <div className="ng-steps" aria-label={t('Étapes de la négociation')}>
          <span className={`ng-step ${feeStage ? 'on' : 'done'}`}>{tr('<0/>Indemnité<1/>', [<i>{feeStage ? '1' : <IconCheck />}</i>, !feeStage && <b>{fmtMoney(p.talks.fee)}</b>])}</span>
          <span className={`ng-step ${feeStage ? '' : 'on'}`}>{tr('<0/>Contrat du joueur', [<i>2</i>])}</span>
        </div>
      )}
      {feeStage
        ? <FeeStep state={state} p={p} run={run} opened={opened} />
        : <ContractStep state={state} p={own || p} run={run} opened={opened} renew={mode === 'renew'} feeAgreed={fresh(state.lastDeal)?.result === 'agreed' ? state.lastDeal : null} />}
    </>
  ));
}

// Première étape : l'indemnité de transfert avec le club du joueur (offre au curseur, chance exacte, contre-offre).
function FeeStep({ state, p, run, opened }) {
  const ask = costOf(p, state);
  const step = stepFor(ask || 1000);
  const lo = roundTo(ask * 0.6, step);
  const hi = roundTo(ask * 1.25, step);
  // départ : le prix demandé, ou la contre-offre du vendeur si elle est moins chère (signature assurée à ce prix),
  // dans la limite de la trésorerie
  const [offer, setOffer] = useState(() => Math.min(ask, p.talks?.counter || ask, Math.max(lo, Math.floor(state.money / step) * step)));
  // réponse du vendeur à la dernière offre faite dans cette fenêtre
  const result = state.lastDeal && state.lastDeal.id === p.id && state.lastDeal.at >= opened && state.lastDeal.result !== 'agreed' ? state.lastDeal : null;
  const talks = p.talks || {};
  const chance = acceptChance(state, p, offer, ask);
  const shown = pctOf(chance);
  const { reasons } = stanceOf(state, p);
  const wage = askedWage(state, p);
  const imp = impactOf(state, wage, offer);
  const block = offerBlock(state, p, offer);
  const left = TRIES - (talks.tries || 0);
  const set = (v) => setOffer(Math.min(hi, Math.max(lo, roundTo(v, step))));
  const send = () => run((s) => makeOffer(s, p.id, offer));
  const take = () => run((s) => acceptCounter(s, p.id), t('Trésorerie insuffisante ou effectif complet.'));
  return (
    <>
      <div className="ng-col">
        {result && (
          <section className={`ng-answer ${result.result}`}>
            <b>{result.result === 'countered' ? t('Offre refusée… mais le vendeur fait un pas') : t('Offre refusée : jugée trop basse')}</b>
            <span>{tr('Tu proposais <0/>.<1/>', [fmtMoney(result.amount), talks.closed ? t(' Le vendeur ne discutera plus avant la prochaine journée.') : t(' Encore {plural} aujourd’hui.', { plural: plural(left, 'tentative', 'tentatives') })])}</span>
          </section>
        )}
        {talks.counter && (
          <section className="ng-counter">
            <div>
              <span className="eyebrow">{tr('Contre-offre <0/>', [clubAfter('de ', p.club)])}</span>
              <b>{fmtMoney(talks.counter)}</b>
              <em>{talks.counter > state.money ? t('Il te manque {v} pour l’accepter.', { v: fmtMoney(talks.counter - state.money) }) : t('Indemnité assurée à ce prix, jusqu’à la prochaine journée.')}</em>
            </div>
            <button className="btn" disabled={talks.counter > state.money || state.players.length >= SQUAD_MAX} onClick={take}>{tr('Accepter · <0/>', [fmtMoney(talks.counter)])}</button>
          </section>
        )}
        {!talks.closed && (
          <section className="ng-offer">
            <div className="ng-ask"><span>{t('Indemnité demandée')}</span><b>{fmtMoney(ask)}</b></div>
            <span className="eyebrow">{t('Ton offre')}</span>
            <div className="ng-amount">
              <button className="hud-icon" onClick={() => { set(offer - step); amountSound(false); }} aria-label={t('Baisser l’offre')} disabled={offer <= lo}>−</button>
              <output className="ng-value" aria-live="polite">{fmtMoney(offer)}<em>{vsAsk(offer, ask)}</em></output>
              <button className="hud-icon" onClick={() => { set(offer + step); amountSound(true); }} aria-label={t('Monter l’offre')} disabled={offer >= hi}>+</button>
            </div>
            <input className="ng-range" type="range" min={lo} max={hi} step={step} value={offer} style={{ '--fill': `${((offer - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => { const v = Number(e.target.value); rangeSound(v > offer); set(v); }} aria-label={t('Montant de l’offre')} />
            <div className="chips ng-quick">
              {QUICK.map(([k, label]) => <button key={label} className={roundTo(ask * k, step) === offer ? 'active' : ''} onClick={() => set(ask * k)}>{label}</button>)}
            </div>
          </section>
        )}
      </div>
      <div className="ng-col">
        {!talks.closed && (
          <section className="ng-chance">
            <span className="eyebrow">{t('Ce qui joue sur sa réponse')}</span>
            <ul className="ng-reasons">
              {reasons.map(([tone, text]) => <li key={text} className={tone}>{text}</li>)}
            </ul>
          </section>
        )}
        <dl className="ng-costs">
          <div><dt>{t('Salaire demandé ensuite')}</dt><dd>{tr('<0/> / saison', [fmtMoney(wage)])}</dd></div>
          <div><dt>{t('Salaires / revenus')}</dt><dd className={imp.shareAfter > 0.75 ? 'down' : ''}>{Math.round(imp.share * 100)} % → {Math.round(imp.shareAfter * 100)} %</dd></div>
          <div><dt>{t('Disponible')}</dt><dd className={imp.availAfter < 0 ? 'down' : ''}>{fmtMoney(imp.availNow)} → {fmtMoney(imp.availAfter)}</dd></div>
          <div><dt>{t('Fin de saison prévue')}</dt><dd className={imp.endAfter < 0 ? 'down' : ''}>{fmtMoney(imp.endNow)} → {fmtMoney(imp.endAfter)}</dd></div>
        </dl>
        <ReserveWarn imp={imp} what={t('Avec cette recrue')} />
        <footer className="ng-foot">
          {talks.closed ? (
            <p className="ng-closed">{tr('Le vendeur ne discutera plus avant la prochaine journée<0/>.', [talks.counter ? t(' (sa contre-offre tient toujours)') : ''])}</p>
          ) : (
            <>
              <LiveChance label={t('Chances d’accord')} shown={shown} note={shown === 0 ? t('Offre trop basse : refus assuré') : shown === 100 ? t('Accord assuré à ce prix') : null} />
              <button className="btn btn-xl" disabled={!!block} onClick={send} title={block || ''}>{tr('Envoyer l’offre · <0/>', [fmtMoney(offer)])}</button>
              {block ? <span className="ng-block">{block}</span> : <span className="ng-tries">{tr('<0/> aujourd’hui · puis le contrat du joueur', [plural(left, 'tentative', 'tentatives')])}</span>}
            </>
          )}
        </footer>
      </div>
    </>
  );
}

// Le contrat du joueur : salaire (réglage principal), durée, prime à la signature et clause de montée, avec ses demandes,
// ce qui joue sur sa réponse, le coût du contrat et la chance exacte. renew : prolongation d'un joueur de l'effectif.
function ContractStep({ state, p, run, opened, renew, feeAgreed }) {
  const demand = demandOf(state, p, renew);
  const ref = refWageOf(state, p);
  const ct = ctalksOf(state, p);
  const step = wageStep(Math.max(demand.wage, 1));
  const lo = roundTo(Math.max(ref * 0.6, step), step);
  const hi = roundTo(Math.max(demand.wage * 1.3, ref * 1.5), step);
  const bStep = niceStep(Math.max(demand.bonus, demand.wage, 1) / 10);
  const bHi = roundTo(Math.max(demand.bonus * 1.6, demand.wage * 2), bStep);
  const minY = minYears(state, p, renew);
  const open = clauseOpen(state);
  const start = ct.counter || demand;
  const [wage, setWage] = useState(() => Math.min(hi, Math.max(lo, start.wage)));
  const [years, setYears] = useState(() => Math.max(minY, start.years));
  const [bonus, setBonus] = useState(() => Math.min(bHi, start.bonus));
  const [clause, setClause] = useState(() => (open ? start.clause : 0));
  const terms = { wage, years, bonus, clause: open ? clause : 0 };
  const chance = contractChance(state, p, terms, renew);
  const shown = pctOf(chance);
  const reasons = [...contractStance(state, p, renew).reasons, ...termReasons(state, p, terms)];
  const fee = !renew && p.club ? p.talks?.fee || 0 : 0;
  const block = contractBlock(state, p, terms);
  const result = state.lastContract && state.lastContract.id === p.id && state.lastContract.at >= opened && state.lastContract.result !== 'accepted' ? state.lastContract : null;
  const left = C_TRIES - (ct.tries || 0);
  const now = renew ? p.deal.wage : 0;
  const imp = impactOf(state, wage - now, fee + bonus);
  const setW = (v) => setWage(Math.min(hi, Math.max(lo, roundTo(v, step))));
  const setB = (v) => setBonus(Math.min(bHi, Math.max(0, Math.round(v / bStep) * bStep)));
  const send = () => run((s) => offerContract(s, p.id, terms));
  const counter = ct.counter;
  const counterBlock = counter ? contractBlock(state, p, counter) : null;
  const take = () => run((s) => acceptContractCounter(s, p.id), t('Trésorerie insuffisante ou effectif complet.'));
  const club = p.club ? Club(p.club) : '';
  return (
    <>
      <div className="ng-col">
        {feeAgreed && !result && (
          <section className="ng-answer agreed">
            <b>{club} {agree(p.club, 'accepte', 'acceptent')}{colon()}{fmtMoney(feeAgreed.amount)}</b>
            <span>{state.league ? t('Place au contrat : l’indemnité tient jusqu’à la prochaine journée, mais le premier club de la ligue qui conclut signe le joueur.') : t('Place au contrat : l’indemnité est réservée jusqu’à la prochaine journée.')}</span>
          </section>
        )}
        {result && (
          <section className={`ng-answer ${result.result}`}>
            <b>{result.result === 'countered' ? t('Proposition refusée… mais son agent fait un pas') : t('Proposition refusée : jugée trop basse')}</b>
            <span>{tr('Tu proposais <0/> par saison sur <1/>.<2/>', [fmtMoney(result.terms.wage), yearsOf(result.terms.years), ct.closed ? t(' Il ne discutera plus avant la prochaine journée.') : t(' Encore {plural} aujourd’hui.', { plural: plural(left, 'tentative', 'tentatives') })])}</span>
          </section>
        )}
        {counter && (
          <section className="ng-counter">
            <div>
              <span className="eyebrow">{t('Contre-proposition de son agent')}</span>
              <b>{fmtMoney(counter.wage)}<small>{t(' par saison')}</small></b>
              <em>{[yearsOf(counter.years), counter.bonus ? t('prime de {bonus}', { bonus: fmtMoney(counter.bonus) }) : '', clauseText(counter.clause)].filter(Boolean).join(' · ')}. {counterBlock || t('Signature assurée à ces conditions, jusqu’à la prochaine journée.')}</em>
            </div>
            <button className="btn" disabled={!!counterBlock} onClick={take}>{tr('Accepter · <0/>', [fmtMoney(counter.wage)])}</button>
          </section>
        )}
        {!ct.closed && (
          <>
            <section className="ng-offer">
              <div className="ng-ask"><span>{t('Il demande')}</span><b>{tr('<0/> par saison', [fmtMoney(demand.wage)])}</b></div>
              <span className="eyebrow">{t('Salaire par saison')}</span>
              <div className="ng-amount">
                <button className="hud-icon" onClick={() => { setW(wage - step); amountSound(false); }} aria-label={t('Baisser le salaire')} disabled={wage <= lo}>−</button>
                <output className="ng-value" aria-live="polite">{fmtMoney(wage)}<em>{vsDemand(wage, demand.wage)}</em></output>
                <button className="hud-icon" onClick={() => { setW(wage + step); amountSound(true); }} aria-label={t('Monter le salaire')} disabled={wage >= hi}>+</button>
              </div>
              <input className="ng-range" type="range" min={lo} max={hi} step={step} value={wage} style={{ '--fill': `${((wage - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => { const v = Number(e.target.value); rangeSound(v > wage); setW(v); }} aria-label={t('Salaire par saison')} />
            </section>
            <section className="ng-terms">
              <div className="ng-term">
                <div className="ng-term-top"><span className="eyebrow">{t('Durée')}</span><em>{tr('saison en cours : <0/> · fin : saison <1/>', [state.seasonNumber, state.seasonNumber + years - 1])}</em></div>
                <div className="segmented n5" role="group" aria-label={t('Durée du contrat')}>
                  {Array.from({ length: MAX_YEARS }, (_, i) => i + 1).map((y) => (
                    <button key={y} type="button" className={y === years ? 'on' : ''} aria-pressed={y === years} disabled={y < minY} title={y < minY ? t('Une prolongation doit finir après le contrat actuel') : ''} onClick={() => { if (y !== years) amountSound(y > years); setYears(y); }}>{y} {tn(y, 'an', 'ans', {}, y > 1)}</button>
                  ))}
                </div>
              </div>
              <div className="ng-term">
                <div className="ng-term-top"><span className="eyebrow">{t('Prime à la signature')}</span><em>{demand.bonus ? t('il attend {bonus}', { bonus: fmtMoney(demand.bonus) }) : t('payée une fois')}</em></div>
                <div className="ng-mini">
                  <button className="hud-icon" type="button" onClick={() => { setB(bonus - bStep); amountSound(false); }} aria-label={t('Baisser la prime')} disabled={bonus <= 0}>−</button>
                  <output aria-live="polite">{fmtMoney(bonus)}</output>
                  <button className="hud-icon" type="button" onClick={() => { setB(bonus + bStep); amountSound(true); }} aria-label={t('Monter la prime')} disabled={bonus >= bHi}>+</button>
                </div>
              </div>
              {open && (
                <div className="ng-term">
                  <div className="ng-term-top"><span className="eyebrow">{t('Clause de montée')}</span><em>{t('hausse de salaire à chaque montée')}</em></div>
                  <div className="segmented n4" role="group" aria-label={t('Clause de montée')}>
                    {CLAUSES.map((c) => <button key={c} type="button" className={c === clause ? 'on' : ''} aria-pressed={c === clause} onClick={() => { if (c !== clause) amountSound(c > clause); setClause(c); }}>{c ? `+${Math.round(c * 100)} %` : t('Aucune')}</button>)}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <div className="ng-col">
        {!ct.closed && (
          <section className="ng-chance">
            <span className="eyebrow">{t('Ce qui joue sur sa réponse')}</span>
            <ul className="ng-reasons">
              {reasons.map(([tone, text]) => <li key={text} className={tone}>{text}</li>)}
            </ul>
          </section>
        )}
        <dl className="ng-costs">
          {renew && <div><dt>{t('Salaire')}</dt><dd>{tr('<0/> → <1/> / saison', [fmtMoney(now), fmtMoney(wage)])}</dd></div>}
          {fee > 0 && <div><dt>{t('Indemnité convenue')}</dt><dd>{fmtMoney(fee)}</dd></div>}
          <div><dt>{tr('Coût du contrat (<0/>)', [yearsOf(years)])}</dt><dd>{fmtMoney(wage * years + bonus)}</dd></div>
          <div><dt>{t('Salaires / revenus')}</dt><dd className={imp.shareAfter > 0.75 ? 'down' : ''}>{Math.round(imp.share * 100)} % → {Math.round(imp.shareAfter * 100)} %</dd></div>
          <div><dt>{t('Disponible')}</dt><dd className={imp.availAfter < 0 ? 'down' : ''}>{fmtMoney(imp.availNow)} → {fmtMoney(imp.availAfter)}</dd></div>
          <div><dt>{t('Fin de saison prévue')}</dt><dd className={imp.endAfter < 0 ? 'down' : ''}>{fmtMoney(imp.endNow)} → {fmtMoney(imp.endAfter)}</dd></div>
        </dl>
        <ReserveWarn imp={imp} what={t('Avec ce contrat')} />
        <footer className="ng-foot">
          {ct.closed ? (
            <p className="ng-closed">{tr('Il ne discutera plus avant la prochaine journée<0/><1/>.', [counter ? t(' (la contre-proposition de son agent tient toujours)') : '', fee ? t(' ; l’indemnité convenue tombera alors') : ''])}</p>
          ) : (
            <>
              <LiveChance label={t('Chances d’accord')} shown={shown} note={shown === 0 ? t('Proposition trop basse : refus assuré') : shown === 100 ? t('Signature assurée à ces conditions') : null} />
              <button className="btn btn-xl" disabled={!!block} onClick={send} title={block || ''}>{renew ? t('Prolonger') : t('Proposer le contrat')} · {fmtMoney(wage)}</button>
              {block ? <span className="ng-block">{block}</span> : <span className="ng-tries">{tr('<0/> aujourd’hui<1/>', [plural(left, 'tentative', 'tentatives'), state.league ? t(' · le premier club qui conclut l’emporte') : fee ? t(' · indemnité réservée jusqu’à la prochaine journée') : ''])}</span>}
            </>
          )}
        </footer>
      </div>
    </>
  );
}
// Chance exacte du montant choisi, collée au-dessus du bouton de la négociation : elle suit le curseur et reste à
// l'écran quel que soit le défilement (sous les raccourcis, le bas de la fenêtre la cachait au téléphone). note : ce
// qui est certain à 0 % ou 100 % (refus, club qui se retire, accord assuré).
function LiveChance({ label, shown, note = null }) {
  return (
    <div className={`ng-live ${toneOf(shown)}`}>
      <span className="ng-live-label">{label}</span>
      <span className="ng-gauge" aria-hidden="true"><i style={{ width: `${shown}%` }} /></span>
      <b aria-live="polite">{shown} %</b>
      {note && <em className="ng-live-note">{note}</em>}
    </div>
  );
}

// --- Mise en vente ------------------------------------------------------------------------------------------

const LIST_QUICK = [[1, t('Sa valeur')], [1.2, '+20 %'], [1.5, '+50 %']];
const toneOf = (shown) => (shown >= 70 ? 'good' : shown >= 35 ? 'mid' : 'low');
const vsValue = (x, v, step) => {
  if (Math.abs(x - v) <= step / 2) return t('sa valeur');
  const d = Math.max(1, Math.round(Math.abs(x / v - 1) * 100));
  return t('{d} % {v} sa valeur', { d, v: x < v ? t('sous') : t('au-dessus de') });
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
      <span className="eyebrow">{t('Mise en vente')}</span>
      <button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button>
    </header>
  );

  if (done) {
    const offers = offersFor(state, p.id);
    const sale = (state.saleList || []).find((x) => x.id === p.id);
    return (
      <div className="sq-overlay" onClick={onClose}>
        <article ref={ref} className="sq-sheet glass ng ng-done" onClick={(e) => e.stopPropagation()} aria-label={t('{name} mis en vente', { name: p.name })}>
          <span className="grip" aria-hidden="true" />
          {head}
          <section className="ng-win">
            <span className="ng-win-ico"><IconTransfer /></span>
            <h3>{offers.length ? plural(offers.length, 'club intéressé', 'clubs intéressés') : t('Joueur en vente')}</h3>
            <p>{tr('<0/> est en vente à <1/>.', [<b>{p.name}</b>, <b>{fmtMoney(sale?.price || price)}</b>])}</p>
            {offers.length > 0 ? (
              <ul className="ls-clubs">
                {offers.map((o, i) => (
                  <li key={o.id} style={{ animationDelay: `${120 + i * 140}ms` }}>
                    <Crest name={o.club} className="mc-crest lg" />
                    <span className="ls-club"><b>{o.club}</b><em>{buyerLine(o)}</em></span>
                    <span className="ls-amount"><b>{fmtMoney(o.amount)}</b><em className={offerNote(o, sale?.price || price)[0]}>{offerNote(o, sale?.price || price)[1]}</em></span>
                  </li>
                ))}
              </ul>
            ) : <p className="ng-paid">{t('Pas d’offre ouverte aujourd’hui : de nouveaux clubs se présenteront après la prochaine journée.')}</p>}
            <div className="ng-actions">
              {offers.length > 0 && <button className="btn" onClick={onOffers}>{tn(offers.length, 'Voir l’offre', 'Voir les offres', {}, offers.length > 1)}</button>}
              <button className={`btn ${offers.length ? 'ghost' : ''}`} onClick={onClose}>{t('Fermer')}</button>
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
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={t('Mise en vente de {name}', { name: p.name })}>
        <span className="grip" aria-hidden="true" />
        {head}
        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{tr('<0/> · <1/> ans<2/>', [POS_LABELS[p.pos], p.age, state.lineup?.includes(p.id) ? t(' · titulaire') : ''])}</span>
          </div>
        </section>

        <section className="ng-offer">
          <div className="ng-ask"><span>{t('Sa valeur')}</span><b>{fmtMoney(v)}</b></div>
          <span className="eyebrow">{t('Ton prix')}</span>
          <div className="ng-amount">
            <button className="hud-icon" onClick={() => { set(price - step); amountSound(false); }} aria-label={t('Baisser le prix')} disabled={price <= lo}>−</button>
            <output className="ng-value" aria-live="polite">{fmtMoney(price)}<em>{vsValue(price, v, step)}</em></output>
            <button className="hud-icon" onClick={() => { set(price + step); amountSound(true); }} aria-label={t('Monter le prix')} disabled={price >= hi}>+</button>
          </div>
          <input className="ng-range" type="range" min={lo} max={hi} step={step} value={price} style={{ '--fill': `${((price - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => { const v = Number(e.target.value); rangeSound(v > price); set(v); }} aria-label={t('Prix demandé')} />
          <div className="chips ng-quick">
            {LIST_QUICK.map(([k, label]) => <button key={label} className={roundTo(v * k, step) === price ? 'active' : ''} onClick={() => set(v * k)}>{label}</button>)}
          </div>
        </section>

        {again ? (
          <section className="ng-chance">
            <p className="ls-again">{t('Déjà proposé aux clubs aujourd’hui : ceux qui ont fait une offre la retrouvent, et de nouveaux clubs se présenteront après la prochaine journée, à ce prix.')}</p>
          </section>
        ) : (
          <section className="ng-chance">
            <span className="eyebrow">{t('Ce qui joue sur les offres')}</span>
            {shown > 0 && shown < 100 && <p className="ls-duo">{t('« Payé aussitôt » : la chance qu’un club t’offre ce prix dès la mise en vente ; sinon, son offre sera plus basse, à négocier.')}</p>}
            <p className="ls-duo">{tr('Au moins deux clubs en lice, de quoi faire monter les enchères : <0/>', [<b>{pctOf(out.duo)} %</b>])}</p>
            <ul className="ng-reasons">
              {out.reasons.map(([tone, text]) => <li key={text} className={tone}>{text}</li>)}
            </ul>
          </section>
        )}

        <dl className="ng-costs">
          <div><dt>{t('Salaire économisé à la vente')}</dt><dd>{tr('<0/> / saison', [fmtMoney(wageOf(p, state.divisionIndex))])}</dd></div>
        </dl>

        <footer className="ng-foot">
          {!again && <LiveChance label={t('Payé aussitôt')} shown={shown} note={shown === 100 ? t('Au moins un club paiera ce prix dès la mise en vente') : shown === 0 ? t('Aucun club ne paiera ce prix d’emblée : offres plus basses, à négocier') : null} />}
          <button className="btn btn-xl" onClick={list} disabled={!!saleBlock(state, p)}>{tr('Mettre en vente · <0/>', [fmtMoney(price)])}</button>
          <span className="ng-tries">{again ? t('Pas de nouveau club avant la prochaine journée') : t('Au moins un club fait aussitôt une offre · jusqu’à {CANDIDATES} étudient le dossier', { CANDIDATES })}</span>
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
  useEffect(() => { if (result?.result === 'sold') haptic('build'); else if (result?.result === 'agreed') haptic('tap'); }, [result?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = stepFor(o?.amount || 1000);
  const lo = o ? Math.floor(o.amount / step) * step + step : 0; // au-dessus de son offre
  const hi = o ? Math.max(lo + step, ceilTo(o.amount * 1.5, step)) : 0;
  const [want, setWant] = useState(() => (o ? Math.min(hi, Math.max(lo, roundTo(o.amount * 1.1, step))) : 0));
  const head = (
    <header className="sh-bar">
      <span className="eyebrow">{t('Négociation · vente')}</span>
      <button className="hud-icon" onClick={onClose} aria-label={t('Fermer la négociation')}><IconClose /></button>
    </header>
  );

  if (!o || !p) {
    const sold = result?.result === 'sold';
    const imp = impactOf(state, 0, 0);
    return (
      <div className="sq-overlay" onClick={onClose}>
        <article ref={ref} className="sq-sheet glass ng ng-done" onClick={(e) => e.stopPropagation()} aria-label={sold ? t('Vente conclue') : t('Négociation terminée')}>
          <span className="grip" aria-hidden="true" />
          {head}
          {sold ? (
            <section className="ng-win">
              <span className="ng-win-ico"><IconCheck /></span>
              <h3>{t('Vente conclue !')}</h3>
              <p>{tr('<0/> rejoint <1/> pour <2/>.', [<b>{result.name}</b>, withArticle(result.club), <b>{fmtMoney(result.amount)}</b>])}</p>
              {result.offered && result.amount > result.offered && <p className="ng-saved">{tr('La négociation t’a rapporté <0/> de plus que son offre.', [fmtMoney(result.amount - result.offered)])}</p>}
              {result.value && result.amount > result.value && <p className="ng-saved">{tr('<0/> de plus que sa valeur (<1/>).', [fmtMoney(result.amount - result.value), fmtMoney(result.value)])}</p>}
              <p className="ng-paid">{tr('Salaire économisé : <0/> par saison · fin de saison prévue : <1/>.', [fmtMoney(result.wage), fmtMoney(imp.endNow)])}</p>
              <div className="ng-actions"><button className="btn" onClick={onClose}>{t('Retour aux offres')}</button></div>
            </section>
          ) : result?.result === 'walked' ? (
            <section className="ng-win">
              <h3>{Club(result.club)} {agree(result.club, 'se retire', 'se retirent')}</h3>
              <p>{tr('Ta demande de <0/> était hors de sa portée : l’offre pour <1/> est retirée.', [<b>{fmtMoney(result.demand)}</b>, result.name])}</p>
              <div className="ng-actions"><button className="btn ghost" onClick={onClose}>{t('Retour aux offres')}</button></div>
            </section>
          ) : (
            <section className="ng-win">
              <h3>{t('Offre expirée')}</h3>
              <p>{t('Cette offre n’est plus valable.')}</p>
              <div className="ng-actions"><button className="btn ghost" onClick={onClose}>{t('Retour aux offres')}</button></div>
            </section>
          )}
        </article>
      </div>
    );
  }

  const demand = Math.min(hi, Math.max(lo, want)); // l'offre a pu monter depuis (dernier mot)
  const shown = pctOf(demandChance(o, demand));
  const closed = !!o.talks?.closed;
  const agreed = !!o.talks?.agreed; // le club a dit oui à ta demande : la vente reste à décider
  const left = SALE_TRIES - (o.talks?.tries || 0);
  const sale = (state.saleList || []).find((x) => x.id === p.id);
  const wage = wageOf(p, state.divisionIndex);
  const impOffer = impactOf(state, -wage, -o.amount);
  const imp = impactOf(state, -wage, -demand);
  const blocked = state.players.length <= SQUAD_MIN ? t('Effectif au minimum ({SQUAD_MIN} joueurs) : recrute avant de vendre.', { SQUAD_MIN }) : null;
  const [tone, note] = offerNote(o, sale?.price);
  const r = playerRating(p);
  const set = (x) => setWant(Math.min(hi, Math.max(lo, roundTo(x, step))));
  const send = () => run((s) => demandOffer(s, o.id, demand));
  const take = () => run((s) => answerOffer(s, o.id, 'accept'), t('Effectif au minimum ({SQUAD_MIN} joueurs).', { SQUAD_MIN }));
  const refuse = () => { run((s) => answerOffer(s, o.id, 'refuse')); onClose(); };
  const d = Math.max(1, Math.round((demand / o.amount - 1) * 100));
  // raccourcis : un montant chacun (les petites sommes, arrondies, peuvent tomber sur le même ; « Ton prix » d'abord)
  const quick = sale && sale.price > o.amount && sale.price <= hi ? [[sale.price, t('Ton prix')]] : [];
  for (const [k, label] of SALE_QUICK) {
    const x = Math.min(hi, Math.max(lo, roundTo(o.amount * k, step)));
    if (!quick.some((q) => q[0] === x)) quick.push([x, label]);
  }
  quick.sort((a, b) => a[0] - b[0]);

  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={t('Négociation avec {club}', { club: o.club })}>
        <span className="grip" aria-hidden="true" />
        {head}
        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{tr('<0/> ans · valeur <1/><2/>', [p.age, fmtMoney(o.v), sale ? t(' · en vente à {price}', { price: fmtMoney(sale.price) }) : ''])}</span>
          </div>
          <button className="linkbtn ng-sheet" onClick={() => onSheet(p.id)}>{t('Sa fiche')}</button>
        </section>

        {result?.result === 'agreed' && (
          <section className="ng-answer agreed">
            <b>{tr('Accord ! <0/> <1/> ta demande de <2/>', [Club(o.club), agree(o.club, 'accepte', 'acceptent'), fmtMoney(o.amount)])}</b>
            <span>{tr('<0/> de plus que <1/> offre. Rien n’est signé : vends, ou refuse et garde ton joueur. L’accord vaut jusqu’à la prochaine journée.', [fmtMoney(o.amount - (result.offered || o.amount)), agree(o.club, 'son', 'leur')])}</span>
          </section>
        )}

        {result && (result.result === 'countered' || result.result === 'held') && (
          <section className={`ng-answer ${result.result === 'countered' ? 'countered' : ''}`}>
            <b>{result.result === 'countered' ? t('Demande refusée… mais {withArticle} {agree} à {amount}', { withArticle: withArticle(o.club), agree: agree(o.club, 'monte', 'montent'), amount: fmtMoney(o.amount) }) : t('Demande refusée : le club maintient son offre')}</b>
            <span>{tr('Tu demandais <0/>. C’est <1/> dernier mot : vente assurée à ce prix.<2/>', [fmtMoney(result.demand), agree(o.club, 'son', 'leur'), closed ? t(' Plus de demande possible avant la prochaine journée.') : t(' Encore {plural}.', { plural: plural(left, 'demande possible', 'demandes possibles') })])}</span>
          </section>
        )}

        <section className="ng-counter sl-club">
          <Crest name={o.club} className="mc-crest lg" />
          <div>
            <span className="eyebrow">{buyerLine(o)}</span>
            <strong className="sl-name">{o.club}</strong>
            <b>{fmtMoney(o.amount)}</b>
            <em className={agreed ? 'up' : closed ? '' : tone}>{agreed ? t('Accord à ton prix') : closed ? t('Son dernier mot') : t('Son offre · {note}', { note })}{o.unsolicited ? t(' · offre spontanée') : ''}</em>
          </div>
          {!closed && <button className="btn" disabled={!!blocked} onClick={take} title={blocked || ''}>{tr('Accepter · <0/>', [fmtMoney(o.amount)])}</button>}
        </section>

        {!closed && (
          <>
            <section className="ng-offer">
              <span className="eyebrow">{t('Ta demande')}</span>
              <div className="ng-amount">
                <button className="hud-icon" onClick={() => { set(demand - step); amountSound(false); }} aria-label={t('Baisser la demande')} disabled={demand <= lo}>−</button>
                <output className="ng-value" aria-live="polite">{fmtMoney(demand)}<em>{tr('<0/> % au-dessus de son offre', [d])}</em></output>
                <button className="hud-icon" onClick={() => { set(demand + step); amountSound(true); }} aria-label={t('Monter la demande')} disabled={demand >= hi}>+</button>
              </div>
              <input className="ng-range" type="range" min={lo} max={hi} step={step} value={demand} style={{ '--fill': `${((demand - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => { const v = Number(e.target.value); rangeSound(v > demand); set(v); }} aria-label={t('Montant demandé')} />
              <div className="chips ng-quick">
                {quick.map(([x, label]) => <button key={label} className={x === demand ? 'active' : ''} onClick={() => set(x)}>{label}</button>)}
              </div>
            </section>

            <section className="ng-chance">
              <span className="eyebrow">{t('Ce qui joue sur sa réponse')}</span>
              {shown > 0 && shown < 100 && <p className="ls-duo">{t('Refusée, le club dira son dernier mot : son offre montera à ce qu’il paie à coup sûr.')}</p>}
              <ul className="ng-reasons">
                {saleReasons(state, o).map(([t, text]) => <li key={text} className={t}>{text}</li>)}
              </ul>
            </section>
          </>
        )}

        <dl className="ng-costs">
          <div><dt>{t('Salaire économisé')}</dt><dd>{tr('<0/> / saison', [fmtMoney(wage)])}</dd></div>
          <div><dt>{t('Fin de saison prévue')}</dt><dd>{fmtMoney(imp.endNow)} → {fmtMoney(closed ? impOffer.endAfter : imp.endAfter)}</dd></div>
        </dl>

        <footer className="ng-foot">
          {closed ? (
            <>
              {!agreed && <p className="ng-closed">{tr('Le club a dit son dernier mot : <0/>, valable jusqu’à la prochaine journée.', [fmtMoney(o.amount)])}</p>}
              <div className="ng-decide">
                <button className="btn ghost btn-xl refuse" onClick={refuse}>{t('Refuser')}</button>
                <button className="btn btn-xl" disabled={!!blocked} onClick={take} title={blocked || ''}>{tr('Vendre · <0/>', [fmtMoney(o.amount)])}</button>
              </div>
              {blocked && <span className="ng-block">{blocked}</span>}
            </>
          ) : (
            <>
              <LiveChance label={t('Chances d’accord')} shown={shown} note={shown === 0 ? t('Hors de sa portée : le club se retirera') : shown === 100 ? t('Accord assuré à ce prix') : null} />
              <button className="btn btn-xl" disabled={!!blocked} onClick={send} title={blocked || ''}>{tr('Demander · <0/>', [fmtMoney(demand)])}</button>
              {blocked ? <span className="ng-block">{blocked}</span> : <span className="ng-tries">{tr('<0/> · l’offre vaut jusqu’à la prochaine journée', [plural(left, 'demande possible', 'demandes possibles')])}</span>}
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
    <button type="button" className={`sh-compare ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => run((s) => toggleShortlist(s, p.id))} title={on ? t('Ne plus suivre') : t('Suivre ce joueur')} aria-label={on ? t('Ne plus suivre') : t('Suivre ce joueur')}>
      <IconStar />
    </button>
  );
}

// Bouton « mettre en vente » de la fiche d'un joueur de l'effectif : la fenêtre du prix s'ouvre (ListingSheet) ;
// « Ne plus vendre » le retire tout de suite.
export function SaleToggle({ state, p, run, onList }) {
  const on = (state.saleList || []).some((x) => x.id === p.id);
  const block = !on && saleBlock(state, p); // la fiche dit pourquoi (squad.jsx, pied de la fiche)
  return (
    <button type="button" className={`btn ${on ? 'ghost' : ''}`} disabled={!!block} onClick={() => (on ? run((s) => setForSale(s, p.id, false)) : onList(p))}>
      {on ? t('Ne plus vendre') : t('Mettre en vente')}
    </button>
  );
}

// --- Championnat entre amis : les joueurs des amis (0.8.3) -----------------------------------------------------------
// Une offre pour le joueur d'un ami part aussitôt au serveur des ligues ; ton ami l'accepte ou la refuse depuis son
// mercato, et acceptée, le transfert est conclu sur-le-champ (le joueur arrive à la relecture suivante de la ligue, dans
// la minute). Trois offres en attente au plus ; une offre sans réponse tombe à la fin de la journée. Les joueurs libres
// et ceux des clubs de l'ordinateur se négocient comme en solo (Negotiation), et le premier club qui signe l'emporte.
const sumOf = (list) => list.reduce((a, b) => a + (b.x || 0), 0);
export function LeagueOffer({ state, p, run, refLvl, onClose, onSheet }) {
  const ref = useRef(null);
  useSwipe(ref, { onDown: onClose, downMedia: PHONE });
  useKeydown((e) => { if (e.key === 'Escape') onClose(); });
  const L = state.league;
  const ask = costOf(p, state);
  const step = stepFor(ask);
  const mine = (L.offersOut || []).find((o) => o.l === p.lid) || null;
  const open = mine?.status === 'open' ? mine : null;
  const queued = queuedFor(state, (x) => (x.k === 'offer' || x.k === 'withdraw' || x.k === 'answer') && x.lid === p.lid);
  // négociation en cours (0.8.8) : à notre tour après une contre-offre de l'ami (reply), le montant devient notre
  // contre-offre, sous son prix ; une offre déjà discutée ne se remplace plus, elle se retire
  const reply = open?.w === 'b' ? open : null;
  const talked = !!open && open.c > 0;
  const lastWord = !!reply && reply.c >= 3;
  const lo = roundTo(ask * 0.5, step);
  const hi = reply ? Math.max(lo, reply.x - step) : Math.max(lo + step, roundTo(ask * 2, step));
  const [offer, setOffer] = useState(() => (reply ? Math.max(lo, Math.min(hi, roundTo(reply.x * 0.9, step))) : open?.x ?? ask));
  const set = (v) => setOffer(Math.min(hi, Math.max(lo, roundTo(v, step))));
  const others = (L.offersOut || []).filter((o) => o.status === 'open' && o.l !== p.lid);
  const engaged = sumOf(others);
  const tooMuch = engaged + offer > state.money;
  const short = reply ? engaged + reply.x - state.money : 0; // accepter son prix
  const full = others.length >= 3 && !open;
  const squadFull = state.players.length >= SQUAD_MAX;
  const failed = state.lastLeague?.k === 'offer' && state.lastLeague.lid === p.lid && !state.lastLeague.ok ? state.lastLeague : null;
  const r = playerRating(p);
  const send = () => { run((s) => (reply ? answerFriend(s, reply, false, offer, 'b') : offerFriend(s, p, offer))); haptic('build'); };
  const remove = () => run((s) => (reply ? answerFriend(s, reply, false, null, 'b') : offerFriend(s, p, null)));
  const accept = () => { run((s) => answerFriend(s, reply, true, null, 'b')); haptic('build'); };
  const line = open?.h?.length > 1 ? open.h.map(fmtMoney).join(' → ') : null;
  const plural2 = isPluralClub(p.club);
  // état de l'offre : la file d'envoi d'abord, puis la réponse du serveur, puis celle de l'ami
  const state2 = queued ? (queued.k === 'withdraw' ? [t('Retrait en cours'), t('Retrait de ton offre…'), 'countered'] : [t('Envoi en cours'), t('Envoi de ta réponse…'), 'countered'])
    : failed ? [t('Offre non envoyée'), leagueNote(failed.note, 'offer'), '']
      : reply ? [t('Contre-offre {clubAfter} : {x}', { clubAfter: clubAfter('de ', p.club), x: fmtMoney(reply.x) }), `${line ? `${line}. ` : ''}${lastWord ? t('Dernier mot : accepte son prix ou refuse.') : tn(3 - reply.c, 'À toi : accepte son prix, fais une contre-offre (encore {v} possible) ou refuse.', 'À toi : accepte son prix, fais une contre-offre (encore {v} possibles) ou refuse.', { v: 3 - reply.c }, 3 - reply.c > 1)}`, 'countered']
        : open ? [t('En attente de la réponse de ton ami'), t('{v} envoyée{v2} : {withArticle} {v3} pas encore répondu.', { v: talked ? t('Ta contre-offre de {x}', { x: fmtMoney(open.x) }) : t('Offre de {x}', { x: fmtMoney(open.x) }), v2: line ? ` (${line})` : '', withArticle: withArticle(p.club), v3: plural2 ? t('n’ont') : 'n’a' }), 'countered']
          : mine?.status === 'no' ? [t('Négociation rompue'), t('Pas d’accord avec {withArticle} sur {x}.', { withArticle: withArticle(p.club), x: fmtMoney(mine.x) }), ''] : null;
  return (
    <div className="sq-overlay" onClick={onClose}>
      <article ref={ref} className="sq-sheet glass ng" onClick={(e) => e.stopPropagation()} aria-label={t('Offre pour {name}', { name: p.name })}>
        <span className="grip" aria-hidden="true" />
        <header className="sh-bar">
          <span className="eyebrow">{tr('Offre <0/>', [clubAfter('à ', p.club)])}</span>
          <button className="hud-icon" onClick={onClose} aria-label={t('Fermer')}><IconClose /></button>
        </header>
        <section className="ng-player">
          <span className={`mc-medal ${heat(r, refLvl)}`}><b>{fmtRating(r)}</b><span>{p.pos}</span></span>
          <div>
            <h3>{p.name}</h3>
            <span className="ng-club">{tr('<0/><1/> · <2/> ans', [<Crest name={p.club} className="mc-crest" />, p.club, p.age])}</span>
          </div>
          <button className="linkbtn ng-sheet" onClick={() => onSheet(p.id)}>{t('Sa fiche')}</button>
        </section>
        {state2 && (
          <section className={`ng-answer ${state2[2]}`}>
            <b>{state2[0]}</b>
            <span>{state2[1]}</span>
          </section>
        )}
        {!lastWord && (<section className="ng-offer">
          <div className="ng-ask"><span>{reply ? t('Son prix') : t('Sa valeur')}</span><b>{fmtMoney(reply ? reply.x : ask)}</b></div>
          <span className="eyebrow">{reply ? t('Ta contre-offre') : t('Ton offre')}</span>
          <div className="ng-amount">
            <button className="hud-icon" onClick={() => { set(offer - step); amountSound(false); }} aria-label={t('Baisser l’offre')} disabled={offer <= lo}>−</button>
            <output className="ng-value" aria-live="polite">{fmtMoney(offer)}</output>
            <button className="hud-icon" onClick={() => { set(offer + step); amountSound(true); }} aria-label={t('Monter l’offre')} disabled={offer >= hi}>+</button>
          </div>
          <input className="ng-range" type="range" min={lo} max={hi} step={step} value={offer} style={{ '--fill': `${((offer - lo) / Math.max(1, hi - lo)) * 100}%` }} onChange={(e) => { const v = Number(e.target.value); rangeSound(v > offer); set(v); }} aria-label={t('Montant de l’offre')} />
        </section>)}
        <section className="ng-chance">
          <span className="eyebrow">{t('Comment ça se joue')}</span>
          <ul className="ng-reasons">
            <li>{t('Ton offre part aussitôt : ton ami l’accepte, fait une contre-offre ou refuse depuis son mercato. Trois contre-offres au plus, des deux côtés ; puis accepter ou refuser.')}</li>
            <li>{t('Acceptée, le transfert est conclu sur-le-champ : le joueur rejoint ton effectif, l’indemnité part de ton compte.')}</li>
            <li>{t('Trois offres en attente au plus ; une offre restée sans réponse tombe à la fin de la journée.')}</li>
            {engaged > 0 && <li>{tr('Déjà promis dans tes autres offres : <0/>.', [fmtMoney(engaged)])}</li>}
          </ul>
        </section>
        <footer className="ng-foot">
          {reply ? (
            <>
              <button className="btn btn-xl" disabled={short > 0 || squadFull || !!queued} onClick={accept}>
                {squadFull ? t('Effectif complet ({SQUAD_MAX})', { SQUAD_MAX }) : short > 0 ? t('Il te manque {short}', { short: fmtMoney(short) }) : t('Accepter son prix · {x}', { x: fmtMoney(reply.x) })}
              </button>
              {!lastWord && <button className="btn" disabled={tooMuch || squadFull || !!queued} onClick={send}>{tooMuch ? t('Il te manque {v}', { v: fmtMoney(engaged + offer - state.money) }) : t('Contre-offre · {offer}', { offer: fmtMoney(offer) })}</button>}
              <button className="btn ghost" disabled={!!queued} onClick={remove}>{t('Refuser')}</button>
            </>
          ) : (
            <>
              {!talked && (
                <button className="btn btn-xl" disabled={tooMuch || full || squadFull || !!queued || (!!open && offer === open.x)} onClick={send}>
                  {squadFull ? t('Effectif complet ({SQUAD_MAX})', { SQUAD_MAX }) : full ? t('Trois offres déjà en attente') : tooMuch ? t('Il te manque {v}', { v: fmtMoney(engaged + offer - state.money) }) : open ? t('Changer mon offre · {offer}', { offer: fmtMoney(offer) }) : t('Faire cette offre · {offer}', { offer: fmtMoney(offer) })}
                </button>
              )}
              {open
                ? <button className="btn ghost" disabled={!!queued} onClick={remove}>{t('Retirer mon offre')}</button>
                : !full && <span className="ng-tries">{tr('Encore <0/>', [plural(3 - others.length, 'offre possible', 'offres possibles')])}</span>}
            </>
          )}
        </footer>
      </article>
    </div>
  );
}

// Contre-offre dans une négociation entre amis : le montant se règle au pas du prix, au-dessus de l'offre pour le vendeur,
// en dessous de son prix pour l'acheteur.
const COUNTERS = 3;
function CounterPicker({ o, role, onSend, onCancel, money = null }) {
  const step = stepFor(o.x);
  const lo = role === 's' ? o.x + step : Math.max(250, roundTo(o.x * 0.5, step));
  const hi = role === 's' ? Math.max(lo, roundTo(o.x * 2, step)) : Math.max(lo, o.x - step);
  const [v, setV] = useState(() => (role === 's' ? Math.min(hi, Math.max(lo, roundTo(o.x * 1.15, step))) : Math.min(hi, Math.max(lo, roundTo(o.x * 0.9, step)))));
  const set = (x) => setV(Math.min(hi, Math.max(lo, roundTo(x, step))));
  const short = money !== null && v > money;
  return (
    <div className="mc-row-actions mc-haggle">
      <div className="ng-mini">
        <button className="hud-icon" type="button" onClick={() => { set(v - step); amountSound(false); }} aria-label={t('Baisser la contre-offre')} disabled={v <= lo}>−</button>
        <output aria-live="polite">{fmtMoney(v)}</output>
        <button className="hud-icon" type="button" onClick={() => { set(v + step); amountSound(true); }} aria-label={t('Monter la contre-offre')} disabled={v >= hi}>+</button>
      </div>
      <button className="btn btn-sm" disabled={short} onClick={() => onSend(v)}>{short ? t('Il te manque {v}', { v: fmtMoney(v - money) }) : t('Envoyer · {v}', { v: fmtMoney(v) })}</button>
      <button className="btn btn-sm ghost" onClick={onCancel}>{t('Annuler')}</button>
    </div>
  );
}

// Prix successifs d'une négociation (offre, contre-offres) : « 10 000 € → 14 000 € → 12 000 € ».
const haggleLine = (o) => (o.h?.length > 1 ? o.h.map(fmtMoney).join(' → ') : null);

// Négociations entre amis (0.8.8), en tête de l'onglet Offres du mercato : celles où l'on vend (offres reçues) et celles
// où l'on achète. À son tour : accepter (conclu aussitôt), contre-offre (trois au plus dans une négociation) ou refuser ;
// sinon, l'attente de la réponse de l'ami, et rompre reste possible. Puis les signatures qui attendent la ligue.
function LeagueOffersBlock({ state, run, ask, refLvl, onOffer }) {
  const L = state.league;
  const [haggle, setHaggle] = useState(null); // négociation dont la contre-offre se règle
  const name = (slot) => L.clubs.find((c) => c.slot === slot)?.name || '?';
  const pool = poolOf(state);
  const target = (lid) => pool.find((p) => p.lid === lid && p.leagueKind === 'friend');
  const busy = (id) => queuedFor(state, (x) => x.k === 'answer' && x.id === id);
  const counter = (o, role) => (v) => { setHaggle(null); run((s) => answerFriend(s, o, false, v, role)); };
  // vendre à un ami se confirme, comme une vente du solo (rien ne revient en arrière)
  const sell = (o, p, club) => {
    const imp = impactOf(state, -wageOf(p, state.divisionIndex), -o.x);
    ask({
      title: t('Vendre {name} {clubAfter} ?', { name: p.name, clubAfter: clubAfter('à ', club) }),
      text: t('{name} ({age} ans, {toLowerCase}, note {fmtRating}) rejoindra {withArticle}, le club de ton ami. La vente est conclue aussitôt.{v}', { name: p.name, age: p.age, toLowerCase: POS_LABELS[p.pos].toLowerCase(), fmtRating: fmtRating(playerRating(p)), withArticle: withArticle(club), v: state.lineup?.includes(p.id) ? t(' C’est un titulaire : ton onze sera recomposé.') : '' }),
      rows: [
        [t('Montant du transfert'), `+${fmtMoney(o.x)}`, 'up'],
        [t('Salaire économisé'), t('{wageOf} / saison', { wageOf: fmtMoney(wageOf(p, state.divisionIndex)) }), 'up'],
        [t('Fin de saison prévue'), `${fmtMoney(imp.endNow)} → ${fmtMoney(imp.endAfter)}`],
      ],
      confirmLabel: t('Vendre · {x}', { x: fmtMoney(o.x) }),
      onConfirm: () => run((s) => answerFriend(s, o, true)),
    });
  };
  // acheter au prix de l'ami (sa contre-offre) : conclu aussitôt, le joueur arrive
  const buy = (o, p, club) => {
    const wage = p ? wageOf(p, state.divisionIndex) : 0;
    const imp = impactOf(state, wage, o.x);
    ask({
      title: t('Recruter {v} pour {x} ?', { v: p?.name || o.n, x: fmtMoney(o.x) }),
      text: t('Tu acceptes le prix {clubAfter} : le transfert est conclu aussitôt, le joueur rejoint ton effectif.', { clubAfter: clubAfter('de ', club) }),
      rows: [
        [t('Montant du transfert'), `−${fmtMoney(o.x)}`, 'down'],
        ...(p ? [[t('Salaire'), t('{wage} / saison', { wage: fmtMoney(wage) })]] : []),
        [t('Disponible'), `${fmtMoney(imp.availNow)} → ${fmtMoney(imp.availAfter)}`, imp.availAfter < 0 ? 'down' : ''],
        [t('Fin de saison prévue'), `${fmtMoney(imp.endNow)} → ${fmtMoney(imp.endAfter)}`, imp.endAfter < 0 ? 'down' : ''],
      ],
      confirmLabel: t('Recruter · {x}', { x: fmtMoney(o.x) }),
      onConfirm: () => run((s) => answerFriend(s, o, true, null, 'b')),
    });
  };
  const signing = (L.outbox || []).filter((x) => x.k === 'sign');
  const medal = (p) => (p
    ? <span className={`mc-medal sm ${heat(playerRating(p), refLvl)}`}><b>{fmtRating(playerRating(p))}</b><span>{p.pos}</span></span>
    : <span className="mc-medal sm" aria-hidden="true"><b>–</b></span>);
  // les trois réponses à son tour, ou la contre-offre en cours de réglage
  const answers = (o, role, accept, acceptOk, acceptLabel) => {
    const sending = busy(o.id);
    if (haggle === o.id) return <CounterPicker o={o} role={role} money={role === 'b' ? state.money : null} onSend={counter(o, role)} onCancel={() => setHaggle(null)} />;
    return (
      <div className="mc-row-actions">
        <button className="btn btn-sm" disabled={!!sending || !acceptOk} onClick={accept}>{acceptLabel}</button>
        {o.c < COUNTERS && <button className="btn btn-sm ghost" disabled={!!sending || (role === 's' && !canSell(state, o.l))} onClick={() => setHaggle(o.id)}>{t('Contre-offre')}</button>}
        <button className="btn btn-sm refuse ghost" disabled={!!sending} onClick={() => run((s) => answerFriend(s, o, false, null, role))}>{t('Refuser')}</button>
      </div>
    );
  };
  const left = (o) => (o.c < COUNTERS ? `${plural(COUNTERS - o.c, 'contre-offre possible', 'contre-offres possibles')}` : t('dernier mot : accepter ou refuser'));
  const outs = L.offersOut || [];
  return (
    <>
      <section className="mc-sec">
        <span className="eyebrow">{t('Offres de tes amis')}</span>
        {(L.offersIn || []).length === 0 ? (
          <p className="mc-hint">{t('Aucune offre d’un ami pour l’instant. À chaque offre : accepter (le transfert est conclu aussitôt), faire une contre-offre ou refuser.')}</p>
        ) : (
          <ul className="mc-rows">
            {L.offersIn.map((o) => {
              const p = state.players.find((q) => q.lid === o.l);
              const club = name(o.b);
              const sending = busy(o.id);
              const sellable = canSell(state, o.l);
              const mine = o.w === 's';
              const line = haggleLine(o);
              return (
                <li key={o.id} className="mc-row offer">
                  {medal(p)}
                  <span className="mc-row-main"><b>{o.n}</b><em>{mine
                    ? <>{capitalize(withArticle(club))} {isPluralClub(club) ? t('veulent') : t('veut')}{t(' le recruter')}{line && <> · <span className="mc-line">{line}</span></>}{!p ? t(' · ce joueur n’est plus au club') : sellable ? '' : t(' · effectif au minimum ({SQUAD_MIN} joueurs) : recrute avant de vendre', { SQUAD_MIN })}</>
                    : <>{t('Ta contre-offre · ')}<span className="mc-line">{line || fmtMoney(o.x)}</span> · {clubAfter('à ', club)}{t(' de répondre')}</>}</em></span>
                  <span className="mc-amount"><b>{fmtMoney(o.x)}</b><em>{sending ? t('envoi…') : mine ? left(o) : t('en attente de sa réponse')}</em></span>
                  {mine ? answers(o, 's', () => sell(o, p, club), sellable && !!p, t('Accepter')) : (
                    <div className="mc-row-actions">
                      <button className="btn btn-sm refuse ghost" disabled={!!sending} onClick={() => run((s) => answerFriend(s, o, false, null, 's'))}>{t('Rompre')}</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="mc-sec">
        <span className="eyebrow">{t('Mes offres en cours')}</span>
        {outs.length === 0 && signing.length === 0 ? (
          <p className="mc-hint">{t('Aucune offre en cours. Négocie sur le marché commun ou avec un club de l’ordinateur, ou fais une offre pour le joueur d’un ami.')}</p>
        ) : (
          <ul className="mc-rows">
            {signing.map((x) => (
              <li key={`s-${x.pid}`} className="mc-row counter">
                {medal(pool.find((p) => p.id === x.id))}
                <span className="mc-row-main"><b>{x.n}</b><em>{t('Accord trouvé · en attente de la ligue')}</em></span>
                <span className="mc-amount"><b>{fmtMoney(x.fee || x.terms?.bonus || 0)}</b><em>{x.fee ? (x.terms?.bonus ? t('indemnité, hors prime') : t('indemnité')) : t('prime à la signature')}</em></span>
              </li>
            ))}
            {outs.map((o) => {
              const p = target(o.l);
              const club = name(o.s);
              const line = haggleLine(o);
              const myTurn = o.status === 'open' && o.w === 'b';
              const squadFull = state.players.length >= SQUAD_MAX;
              const prices = line && <> · <span className="mc-line">{line}</span></>;
              const pseudo = L.clubs.find((c) => c.slot === o.s)?.pseudo || t('ton ami');
              const note = o.status === 'no' && o.g ? t('Offre refusée d’office : ce joueur a déjà quitté le club de {pseudo}', { pseudo })
                : o.status === 'no' ? t('{club} · {v} : tu peux en refaire une', { club, v: o.c ? t('négociation rompue') : t('offre refusée') }) : myTurn ? <>{tr('Contre-offre <0/>', [clubAfter('de ', club)])}{prices}</> : <>{club}{t(' · en attente de sa réponse')}{prices}</>;
              return (
                <li key={o.id} className={`mc-row ${myTurn ? 'offer' : ''}`}>
                  {medal(p)}
                  <span className="mc-row-main"><b>{p?.name || o.n || '?'}</b><em className={o.status === 'no' ? 'down' : ''}>{note}</em></span>
                  <span className="mc-amount"><b>{fmtMoney(o.x)}</b>{myTurn && <em>{busy(o.id) ? t('envoi…') : left(o)}</em>}</span>
                  {myTurn
                    ? answers(o, 'b', () => buy(o, p, club), !squadFull && o.x <= state.money, squadFull ? t('Effectif complet ({SQUAD_MAX})', { SQUAD_MAX }) : o.x > state.money ? t('Il te manque {v}', { v: fmtMoney(o.x - state.money) }) : t('Accepter'))
                    : p && <button className="btn btn-sm" onClick={() => onOffer(p)}>{t('Voir')}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
