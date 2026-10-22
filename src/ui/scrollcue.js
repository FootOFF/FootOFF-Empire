// Défilement aux couleurs du jeu. Sur écran tactile (iPhone, Android, tablette), plus aucune barre grise du système
// (styles.css) : pendant qu'on fait défiler, un curseur doré fin longe la zone qui défile, puis s'efface. Partout,
// PC compris, une zone qui défile s'estompe sur le bord où il reste du contenu à voir (attribut data-fade, dessiné
// par styles.css) : on sait d'un coup d'œil qu'il y a une suite.

// Zones suivies pour l'estompe : celles sans pied collé (un pied « sticky » s'estomperait avec le contenu).
const FADE = '.panel-body, .ins-body, .bw-body, .post-body, .cmp-list, .cine-events, .feed-list, .cm-settings, .chips, .sq-table-wrap, .sp-table-wrap';
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
  const touch = window.matchMedia('(hover: none), (pointer: coarse)');

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

  // curseur doré (écran tactile) : un seul pour toute la page, posé sur la zone qu'on fait défiler
  const thumb = document.createElement('div');
  thumb.className = 'scrollcue';
  thumb.setAttribute('aria-hidden', 'true');
  document.body.appendChild(thumb);
  let hideTimer = 0;
  let frame = 0;
  let target = null;
  const place = () => {
    frame = 0;
    const el = target;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const dy = el.scrollHeight - el.clientHeight;
    const dx = el.scrollWidth - el.clientWidth;
    if (dy > EDGE && r.height > 60) {
      const track = r.height - 12;
      const size = Math.max(28, track * (el.clientHeight / el.scrollHeight));
      const at = (track - size) * Math.min(1, Math.max(0, el.scrollTop / dy));
      thumb.className = 'scrollcue on v';
      thumb.style.cssText = `width:3px;height:${size}px;transform:translate(${r.right - 6}px,${r.top + 6 + at}px)`;
    } else if (dx > EDGE && r.width > 60) {
      const track = r.width - 12;
      const size = Math.max(28, track * (el.clientWidth / el.scrollWidth));
      const at = (track - size) * Math.min(1, Math.max(0, el.scrollLeft / dx));
      thumb.className = 'scrollcue on h';
      thumb.style.cssText = `height:3px;width:${size}px;transform:translate(${r.left + 6 + at}px,${r.bottom - 5}px)`;
    } else return;
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { thumb.classList.remove('on'); }, 700);
  };

  document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.matches(FADE)) paintFade(el);
    if (!touch.matches) return;
    target = el;
    if (!frame) frame = requestAnimationFrame(place);
  }, { capture: true, passive: true });

  scan();
}
