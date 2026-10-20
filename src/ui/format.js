const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Montants complets jusqu'à 100 000 €, puis compacts (125 k€, 1,25 M€) pour rester lisibles.
export const fmtMoney = (n) => {
  const a = Math.abs(n);
  if (a < 100000) return euros.format(n);
  const sign = n < 0 ? '-' : '';
  if (a < 1e6) return `${sign}${Math.round(a / 1000)}\u00a0k€`;
  return `${sign}${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: a < 1e7 ? 2 : 1 })}\u00a0M€`;
};

export const fmtNum = (n) => new Intl.NumberFormat('fr-FR').format(n);

// Montant complet, sans abréviation (écran Finances : une colonne de chiffres se lit à l'euro près).
export const fmtEuros = (n) => euros.format(n);

// Note sur 20 avec une décimale, virgule à la française : 7,8.
export const fmtRating = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

// Pourcentages qui tombent juste (pronostic victoire / nul / défaite) : arrondis par la méthode du plus fort reste,
// leur somme fait toujours 100. Arrondis un par un, 93,6 + 5,6 + 0,8 donnaient 94 + 6 + 1 = 101 %.
// Une probabilité non nulle sous 0,5 % s'affiche « < 1 % » : jamais « 0 % » pour un résultat encore possible.
export function roundPercents(values) {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const exact = values.map((v) => (Math.max(0, v) / total) * 100);
  const tiny = exact.map((x) => x > 0 && x < 0.5);
  const whole = exact.map((x, i) => (tiny[i] ? 0 : Math.floor(x)));
  let left = 100 - whole.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((x, i) => i).filter((i) => !tiny[i]).sort((a, b) => (exact[b] % 1) - (exact[a] % 1));
  for (const i of byRemainder) { if (left <= 0) break; whole[i] += 1; left -= 1; }
  return whole.map((n, i) => ({ value: n, label: n === 0 && exact[i] > 0 ? '< 1 %' : `${n} %` }));
}
