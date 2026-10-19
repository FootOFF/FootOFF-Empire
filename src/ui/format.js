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

// Note sur 20 avec une décimale, virgule à la française : 7,8.
export const fmtRating = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
