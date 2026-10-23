// Défilement sans barre. Aucune barre de défilement nulle part (styles.css), ni celle du système ni une barre du
// jeu : c'est plus net. Pour qu'on sache qu'il y a une suite, une zone qui défile s'estompe sur le bord où il reste
// du contenu à voir (attribut data-fade, dessiné par styles.css).

// Zones suivies pour l'estompe : celles sans pied collé (un pied « sticky » s'estomperait avec le contenu).
const FADE = '.panel-body, .ins-body, .bw-body, .post-body, .cmp-list, .cine-events, .feed-list, .cm-settings, .chips, .sq-table-wrap, .sp-table-wrap, .sc-track';
const EDGE = 2; // px de tolérance (arrondis du défilement)

function fadeOf(el) {
  const dy = el.scrollHeight - el.clientHeight;
  const dx = el.scrollWidth - el.clientWidth;
  let f = '';
  if (dy > EDGE && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
    if (el.scrollTop > EDGE) f += 't';
    if (el.scrollTop < dy - EDGE) f += 'b';
  } else if (dx > EDGE && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) {
    if (el.scrollLeft > EDGE) f += 'l';
    if (el.scrollLeft < dx - EDGE) f += 'r';
  }
  return f;
}
function paintFade(el) {
  const f = fadeOf(el);
  if (f) { if (el.dataset.fade !== f) el.dataset.fade = f; } else if (el.dataset.fade) delete el.dataset.fade;
}

export function installScrollCues() {
  if (typeof window === 'undefined' || window.__scrollCues) return;
  window.__scrollCues = true;

  // estompe des bords : au défilement, et quand le contenu change (nouvelle fenêtre, liste qui s'allonge), au plus
  // une fois toutes les 120 ms
  let pending = 0;
  const scan = () => {
    pending = 0;
    document.querySelectorAll(FADE).forEach(paintFade);
  };
  const soon = () => { if (!pending) pending = window.setTimeout(scan, 120); };
  new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', soon);

  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (el instanceof Element && el.matches(FADE)) paintFade(el);
  }, { capture: true, passive: true });

  scan();
}
