// Records du club, tenus au fil des matchs (l'historique détaillé ne garde que les 400 derniers) : bilan de toujours,
// plus larges victoire et défaite, match le plus prolifique, séries, affluence et recette records, premières fois
// (victoire, cage inviolée, large victoire, coup du chapeau, renversement, guichets fermés), plus gros achat.

export const outcome = (m) => (m.pens ? (m.pens[0] > m.pens[1] ? 'win' : 'loss') : m.gf > m.ga ? 'win' : m.gf < m.ga ? 'loss' : 'draw');
const when = (m) => ({ season: m.season, round: m.round, comp: m.comp || 'league', stage: m.stage ?? null, opp: m.opp });

export function emptyRecords() {
  return {
    totals: { played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, clean: 0 },
    bestWin: null, worstLoss: null, mostGoals: null, crowd: null, gate: null, bestBuy: null,
    run: { win: 0, unbeaten: 0, clean: 0, winFrom: null, unbeatenFrom: null, cleanFrom: null },
    best: { win: null, unbeaten: null, clean: null },
    hatTricks: 0, comebacks: 0, soldOut: 0,
    firsts: {}, // première fois : win, clean, rout, hatTrick, comeback, soldOut -> { season, round, comp, opp }
  };
}

// Ajoute un match (format de s.matches) aux records.
export function addMatch(r, m) {
  const o = outcome(m);
  const w = when(m);
  const t = r.totals;
  const first = (k, extra) => { if (!r.firsts[k]) r.firsts[k] = { ...w, ...extra }; };
  t.played += 1;
  t[o] += 1;
  t.gf += m.gf;
  t.ga += m.ga;
  if (m.ga === 0) { t.clean += 1; first('clean'); }
  if (o === 'win') first('win');
  const diff = m.gf - m.ga;
  const margin = (x) => (x ? x.gf - x.ga : 0);
  if (diff > 0 && (!r.bestWin || diff > margin(r.bestWin) || (diff === margin(r.bestWin) && m.gf > r.bestWin.gf))) r.bestWin = { ...w, gf: m.gf, ga: m.ga };
  if (diff < 0 && (!r.worstLoss || -diff > -margin(r.worstLoss) || (-diff === -margin(r.worstLoss) && m.ga > r.worstLoss.ga))) r.worstLoss = { ...w, gf: m.gf, ga: m.ga };
  if (diff >= 5) first('rout', { gf: m.gf, ga: m.ga });
  if (m.gf + m.ga > 0 && (!r.mostGoals || m.gf + m.ga > r.mostGoals.gf + r.mostGoals.ga)) r.mostGoals = { ...w, gf: m.gf, ga: m.ga };
  if (m.attendance && (!r.crowd || m.attendance > r.crowd.attendance)) r.crowd = { ...w, attendance: m.attendance, capacity: m.capacity || null };
  if (m.attendance && m.capacity && m.attendance >= m.capacity) { r.soldOut += 1; first('soldOut', { attendance: m.attendance }); }
  if (m.revenue && (!r.gate || m.revenue > r.gate.revenue)) r.gate = { ...w, revenue: m.revenue };
  // séries : victoires, invincibilité, cages inviolées
  const run = r.run;
  const step = (key, ok) => {
    if (!ok) { run[key] = 0; run[`${key}From`] = null; return; }
    if (!run[key]) run[`${key}From`] = w;
    run[key] += 1;
    if (!r.best[key] || run[key] > r.best[key].n) r.best[key] = { n: run[key], from: run[`${key}From`], to: w };
  };
  step('win', o === 'win');
  step('unbeaten', o !== 'loss');
  step('clean', m.ga === 0);
  // coup du chapeau : trois buts d'un même joueur
  const goals = {};
  for (const sc of m.scorers || []) {
    const k = sc.id ?? sc.name;
    goals[k] = { n: (goals[k]?.n || 0) + 1, name: sc.name };
  }
  const hat = Object.values(goals).find((g) => g.n >= 3);
  if (hat) { r.hatTricks += 1; first('hatTrick', { name: hat.name }); }
  // renversement : mené au score, puis vainqueur
  if (o === 'win' && m.events?.length) {
    let us = 0, them = 0, trailed = false;
    for (const e of [...m.events].sort((a, b) => a.minute - b.minute)) {
      if (e.type !== 'goal') continue;
      if (e.side === 'home') us += 1; else them += 1;
      if (them > us) trailed = true;
    }
    if (trailed) { r.comebacks += 1; first('comeback'); }
  }
  return r;
}

// Records reconstitués depuis l'historique des matchs (parties commencées avant les records).
export function rebuildRecords(s) {
  const r = emptyRecords();
  (s.matches || []).forEach((m) => addMatch(r, m));
  return r;
}

// Achat : le plus gros transfert entrant.
export function addSigning(r, p, fee, s) {
  if (!r.bestBuy || fee > r.bestBuy.fee) r.bestBuy = { fee, name: p.name, season: s.seasonNumber, round: s.round ?? null };
}
