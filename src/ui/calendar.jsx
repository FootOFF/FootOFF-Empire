import React from 'react';
import { outcomeOf, seasonFixtures } from '../game/fixtures';
import { STAGES, STAGES_SHORT } from '../game/cups';
import { kitOf } from '../game/kits';
import { TICKET_POLICIES } from '../game/economy';
import { formationOf } from '../game/tactics';
import { fmtMoney, fmtNum, fmtPrice, fmtRating } from './format';
import { IconChevron, IconPlay, IconStar, IconTrophy } from './icons';

// Calendrier de la saison, très visuel : une frise de toutes les dates (pastilles colorées selon le résultat),
// puis une carte par date, dans l'ordre du calendrier (championnat en or, Coupe nationale en argent, Coupe
// d'Europe en bleu). Une carte jouée montre le score, la formation, la formule des billets et l'affluence, et
// ouvre le Stats Pass du match ; le prochain match se lance d'ici.

const COMP_NAME = { league: 'Championnat', cup: 'Coupe nationale', c1: 'Coupe d’Europe' };
const WORD = { win: 'Victoire', draw: 'Nul', loss: 'Défaite' };
const LETTER = { win: 'V', draw: 'N', loss: 'D' };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const light = (n) => ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
export const fmtFormation = (f) => formationOf(f).name;

// Monogramme d'un club : initiale du premier et du dernier mot qui comptent (« US des Fontaines » → UF).
function initials(name = '') {
  const words = name.replace(/[’']/g, ' ').split(/[\s-]+/).filter((w) => w && !/^(de|des|du|la|le|les|l|d)$/i.test(w));
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

// Écusson aux couleurs du maillot du club (les mêmes que sur le terrain en 3D).
export function Crest({ name, className = '' }) {
  const kit = kitOf(name || '');
  return (
    <svg className={`crest ${className}`} viewBox="0 0 40 46" aria-hidden="true">
      <path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8Z" fill={hex(kit.shirt)} />
      <path d="M20 2 37 8v14c0 11-7.5 18.5-17 22Z" fill="rgba(0, 0, 0, .16)" />
      <path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8Z" fill="none" stroke="rgba(255, 255, 255, .45)" strokeWidth="1.4" />
      <text x="20" y="27.5" textAnchor="middle" fontSize="13" fontWeight="700" fill={light(kit.shirt) ? '#141414' : '#ffffff'}>{initials(name)}</text>
    </svg>
  );
}

const tagOf = (f) => (f.comp === 'league' ? `J${f.round}` : STAGES_SHORT[f.stage]);
const DOT_STAGE = ['8es', '¼', '½', 'F']; // frise : libellés courts sous chaque pastille
const dotOf = (f) => (f.comp === 'league' ? `J${f.round}` : DOT_STAGE[f.stage]);
const titleOf = (f) => (f.comp === 'league' ? `Championnat · Journée ${f.round}` : `${COMP_NAME[f.comp]} · ${STAGES[f.stage]}`);
const compOf = (f) => COMP_NAME[f.comp]; // le tour est déjà sur l'étiquette de la frise

function Score({ m, result }) {
  const r = m || result;
  const o = outcomeOf(r);
  return (
    <span className={`cal-score ${o}`}>
      <b>{r.gf}–{r.ga}</b>
      <small>{r.pens ? `t.a.b. ${r.pens[0]}–${r.pens[1]}` : WORD[o]}</small>
    </span>
  );
}

// Détails d'un match joué : formation, formule des billets, affluence, recette.
function PlayedFacts({ m }) {
  const policy = TICKET_POLICIES[m.tickets];
  const full = m.capacity && m.attendance >= m.capacity;
  return (
    <span className="cal-facts">
      <span title="Formation utilisée">{fmtFormation(m.formation)}</span>
      {policy && <span title="Formule des billets">Billets {policy.name}{m.ticketPrice ? ` · ${fmtPrice(m.ticketPrice)}` : ''}</span>}
      <span>{fmtNum(m.attendance || 0)} spect.{full ? ' · complet' : ''}</span>
      <span>{fmtMoney(m.revenue || 0)}</span>
    </span>
  );
}

function FixtureCard({ f, onOpenMatch, onPlay }) {
  const o = f.match || f.result ? outcomeOf(f.match || f.result) : null;
  const canOpen = !!(f.match && onOpenMatch);
  const body = (
    <>
      <Crest name={f.opp?.name} />
      <span className="cal-main">
        <span className="cal-comp">{compOf(f)}</span>
        <strong className="cal-opp">{f.opp?.name || (f.status === 'out' ? 'Tour non disputé' : 'Adversaire à tirer au sort')}</strong>
        {f.match ? <PlayedFacts m={f.match} />
          : f.status === 'played' ? <span className="cal-facts"><span>Joué</span></span>
            : f.status === 'out' ? <span className="cal-facts"><span>Éliminé avant ce tour</span></span>
              : f.status === 'tbd' ? <span className="cal-facts"><span>Tirage au sort après le tour précédent</span></span>
                : f.opp?.strength != null && <span className="cal-facts"><span>Niveau adverse {fmtRating(f.opp.strength)}</span>{f.opp.division && f.comp !== 'league' && <span>{f.opp.division}</span>}</span>}
      </span>
      <span className="cal-side">
        {f.match || f.result ? <Score m={f.match} result={f.result} />
          : f.status === 'next' ? <span className="cal-next-tag">Prochain match</span>
            : f.status === 'out' ? <span className="cal-later">—</span>
              : <span className="cal-later">À venir</span>}
        {canOpen && <IconChevron className="cal-go" />}
      </span>
    </>
  );
  return (
    <li className={`cal-item ${f.comp} ${f.status} ${o ? `o-${o}` : ''}`}>
      <span className="cal-when" aria-hidden="true">
        <span className="cal-tag">{f.comp === 'c1' ? <IconStar /> : f.comp === 'cup' ? <IconTrophy /> : null}{tagOf(f)}</span>
      </span>
      {canOpen ? (
        <button type="button" className="cal-card" onClick={() => onOpenMatch(f.match)} aria-label={`${titleOf(f)} contre ${f.opp?.name} : voir le Stats Pass`}>{body}</button>
      ) : (
        <div className="cal-card">
          {body}
          {f.status === 'next' && onPlay && <button type="button" className="btn btn-sm cal-play" onClick={onPlay}><IconPlay /> Jouer</button>}
        </div>
      )}
    </li>
  );
}

export function SeasonCalendar({ state, onOpenMatch, onPlay }) {
  const fixtures = seasonFixtures(state);
  const games = fixtures.filter((f) => f.status !== 'out');
  const done = games.filter((f) => f.status === 'played');
  const tally = { win: 0, draw: 0, loss: 0 };
  done.forEach((f) => { const r = f.match || f.result; if (r) tally[outcomeOf(r)] += 1; });
  const next = fixtures.find((f) => f.status === 'next');
  return (
    <div className="cal">
      <section className="cal-head">
        <div className="cal-count">
          <b>{done.length}<small>/{games.length}</small></b>
          <span>dates jouées</span>
        </div>
        <div className="cal-tally">
          <span className="win"><b>{tally.win}</b> V</span>
          <span className="draw"><b>{tally.draw}</b> N</span>
          <span className="loss"><b>{tally.loss}</b> D</span>
        </div>
        <div className="cal-upnext">
          <span>Prochain match</span>
          <strong>{next ? `${tagOf(next)} · ${next.opp?.name || 'à tirer au sort'}` : 'Saison terminée'}</strong>
        </div>
        <ol className="cal-strip" aria-label="Toutes les dates de la saison">
          {fixtures.map((f) => {
            const r = f.match || f.result;
            const o = r ? outcomeOf(r) : null;
            return (
              <li key={f.index} className={`cs-dot ${f.comp} ${f.status} ${o ? `o-${o}` : ''}`} title={`${titleOf(f)}${f.opp?.name ? ` · ${f.opp.name}` : ''}${r ? ` · ${r.gf}–${r.ga}` : ''}`}>
                <i>{o ? LETTER[o] : ''}</i>
                <span>{dotOf(f)}</span>
              </li>
            );
          })}
        </ol>
        <p className="cal-legend">
          <span className="league">Championnat</span>
          <span className="cup">Coupe nationale</span>
          {state.cups?.c1 && <span className="c1">Coupe d’Europe</span>}
        </p>
      </section>
      <ol className="cal-list">
        {fixtures.map((f) => <FixtureCard key={f.index} f={f} onOpenMatch={onOpenMatch} onPlay={onPlay} />)}
      </ol>
    </div>
  );
}
