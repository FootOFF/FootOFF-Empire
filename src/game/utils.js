export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clone = (x) => JSON.parse(JSON.stringify(x));
// Ordinal à la française : 1er (1re au féminin), 2e, 3e…
export const ordinal = (n, feminine = false) => (n === 1 ? (feminine ? '1re' : '1er') : `${n}e`);
