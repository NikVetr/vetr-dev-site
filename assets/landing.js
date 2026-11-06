// The landing page's only script, besides the theme.
//
// Card pictures: each .card-art[data-art=name] is filled with assets/cards/<name>.svg (drawn
// by scripts/landing-art/ from the tool itself) when it comes near the viewport. The SVG is
// inlined rather than shown as an <img> so that it paints in the page's theme colours.
//
// Hover loops: hovering a card with a mouse or pen, or focusing it from the keyboard, sets
// data-playing on its picture, which starts the picture's CSS loop; leaving or blurring it
// removes the attribute, which stops the loop and shows the still again. A picture whose SVG
// names a data-player also has a script, assets/players/<name>.js, loaded on its first play; its
// CSS loop starts once the script is ready, so the two run together.
// Touch never plays (a tap opens the tool), and nothing plays under prefers-reduced-motion.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** @param {HTMLElement} art */
async function load(art) {
  const response = await fetch(`assets/cards/${art.dataset.art}.svg`);
  if (!response.ok) throw new Error(`card picture ${art.dataset.art}: HTTP ${response.status}`);
  art.innerHTML = await response.text();
  if (wanted.has(art)) start(art);
}

/** Pictures hovered or focused now, and the stop functions of those whose script is running. */
const wanted = new WeakSet();
/** @type {WeakMap<HTMLElement, () => void>} */
const stops = new WeakMap();

/** Starts the picture's loop: CSS alone, or with its script once that is ready. @param {HTMLElement} art */
async function start(art) {
  if (reducedMotion.matches || !wanted.has(art)) return;
  const svg = art.querySelector('svg');
  if (!svg) return;   // it starts when it loads
  const name = svg.dataset.player;
  if (!name) { art.dataset.playing = ''; return; }
  const player = await import(`./players/${name}.js`);
  await player.prepare();
  if (reducedMotion.matches || !wanted.has(art) || stops.has(art)) return;
  art.dataset.playing = '';
  stops.set(art, player.play(art));
}

/** @param {HTMLElement} art */
function stop(art) {
  wanted.delete(art);
  delete art.dataset.playing;
  stops.get(art)?.();
  stops.delete(art);
}

const nearViewport = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    nearViewport.unobserve(entry.target);
    load(/** @type {HTMLElement} */ (entry.target));
  }
}, { rootMargin: '50% 0px' });

for (const card of document.querySelectorAll('.project-card')) {
  const art = /** @type {HTMLElement} */ (card.querySelector('.card-art'));
  nearViewport.observe(art);
  const play = () => {
    if (reducedMotion.matches || wanted.has(art)) return;
    wanted.add(art);
    start(art);
  };
  card.addEventListener('pointerenter', (event) => { if (/** @type {PointerEvent} */ (event).pointerType !== 'touch') play(); });
  card.addEventListener('pointerleave', () => stop(art));
  card.addEventListener('focus', () => { if (card.matches(':focus-visible')) play(); });
  card.addEventListener('blur', () => stop(art));
}
// Cancel pending starts as well as active players when the preference changes.
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    for (const art of document.querySelectorAll('.card-art')) stop(/** @type {HTMLElement} */ (art));
  }
});
// Coming back to the page (Back button, bfcache) starts with every picture still.
addEventListener('pageshow', () => {
  for (const art of document.querySelectorAll('.card-art')) stop(/** @type {HTMLElement} */ (art));
});

// Reading order. Dense placement can set a later card beside or above an earlier one; so that
// Tab and screen readers meet the cards in the order they appear, each card is pinned to the
// cell CSS placed it in and the list is put in that order, row by row. Again whenever the
// layout changes; without this script the wall is the same and Tab follows the card order.
/** A tile's span, from the custom properties style.css sets for its shape (1 when unset). @param {HTMLElement} li @param {string} name */
const span = (li, name) => Number(getComputedStyle(li).getPropertyValue(name)) || 1;
for (const wall of document.querySelectorAll('.grid')) {
  const cards = /** @type {HTMLElement[]} */ ([...wall.children]);
  let layout = '';
  function readingOrder() {
    // Placement depends only on the column count (as declared: pinned cards can add implicit
    // columns to the computed one) and the tiles' spans.
    const columnCount = getComputedStyle(wall).getPropertyValue('--cols').trim();
    const key = `${columnCount} ${cards.map((li) => `${span(li, '--w')}x${span(li, '--h')}`).join()}`;
    if (key === layout) return;
    layout = key;
    const focused = document.activeElement;
    for (const li of cards) { li.style.gridRow = ''; li.style.gridColumn = ''; }
    wall.append(...cards);
    // The grid's lines, from its tracks and gaps, and the line nearest each tile's corner.
    const style = getComputedStyle(wall);
    const lines = (/** @type {string} */ tracks, /** @type {number} */ gap) => tracks.split(' ').map(parseFloat).reduce((at, size) => [...at, at[at.length - 1] + size + gap], [0]);
    const columns = lines(style.gridTemplateColumns, parseFloat(style.columnGap));
    const rows = lines(style.gridTemplateRows, parseFloat(style.rowGap));
    const origin = wall.getBoundingClientRect();
    const line = (/** @type {number[]} */ at, /** @type {number} */ x) => at.reduce((best, v, i) => (Math.abs(v - x) < Math.abs(at[best] - x) ? i : best), 0) + 1;
    const placed = cards.map((li) => {
      const r = li.getBoundingClientRect();
      return { li, row: line(rows, r.top - origin.top), column: line(columns, r.left - origin.left) };
    });
    for (const { li, row, column } of placed) {
      li.style.gridRow = `${row} / span ${span(li, '--h')}`;
      li.style.gridColumn = `${column} / span ${span(li, '--w')}`;
    }
    wall.append(...placed.sort((a, b) => a.row - b.row || a.column - b.column).map((p) => p.li));
    if (focused instanceof HTMLElement && wall.contains(focused)) focused.focus({ preventScroll: true });
  }
  readingOrder();
  new ResizeObserver(() => requestAnimationFrame(readingOrder)).observe(wall);
}

// The browser's toolbar colour follows the page's theme, which may be the visitor's choice
// rather than the system's.
function themeColor() {
  const background = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) /** @type {HTMLMetaElement} */ (meta).content = background;
}
themeColor();
document.addEventListener('themechange', themeColor);
