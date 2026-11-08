// Landing page artwork, playback, grid reading order and thematic outlines.
import { drawClusters } from './landing-clusters.js';
import { landingLayouts } from './landing-order.js';
import { mountMosaic } from '../shared/mosaic.js';
//
// Card pictures: each .card-art[data-art=name] is filled with assets/cards/<name>.svg (drawn
// by scripts/landing-art/ from the tool itself) when it comes near the viewport. The SVG is
// inlined rather than shown as an <img> so that it paints in the page's theme colours.
//
// Hover loops start on the first mouse/pen hover or keyboard focus. data-started keeps
// the CSS animations attached; removing data-playing pauses them at their current time.
// A scripted canvas player keeps its current frame too. Both resume on the next interaction.
// Players load on first play, before their matching CSS clocks start.
// Touch never plays (a tap opens the tool), and nothing plays under prefers-reduced-motion.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** @param {HTMLElement} art */
async function load(art) {
  const response = await fetch(`assets/cards/${art.dataset.art}.svg`);
  if (!response.ok) throw new Error(`card picture ${art.dataset.art}: HTTP ${response.status}`);
  art.innerHTML = await response.text();
  if (wanted.has(art)) start(art);
}

/** Pictures hovered or keyboard-focused now, and their persistent canvas players. */
const wanted = new WeakSet();
/** @type {WeakMap<HTMLElement, {play:()=>void,pause:()=>void,destroy:()=>void}>} */
const players = new WeakMap();

/** Starts the picture's loop: CSS alone, or with its script once that is ready. @param {HTMLElement} art */
async function start(art) {
  if (reducedMotion.matches || !wanted.has(art)) return;
  const svg = art.querySelector('svg');
  if (!svg) return;   // it starts when it loads
  const name = svg.dataset.player;
  if (!name) { art.dataset.started = ''; art.dataset.playing = ''; return; }
  const player = await import(`./players/${name}.js`);
  const plan = await player.prepare();
  if (reducedMotion.matches || !wanted.has(art)) return;
  art.dataset.started = '';
  art.dataset.playing = '';
  let controller = players.get(art);
  if (!controller) {
    controller = player.create(art, plan);
    players.set(art, /** @type {NonNullable<typeof controller>} */ (controller));
  }
  controller?.play();
}

/** @param {HTMLElement} art */
function stop(art) {
  wanted.delete(art);
  delete art.dataset.playing;
  players.get(art)?.pause();
}

/** Reduced motion returns to the authored still and releases the canvas. @param {HTMLElement} art */
function reset(art) {
  stop(art);
  delete art.dataset.started;
  players.get(art)?.destroy();
  players.delete(art);
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
  let hovered = false, focused = false;
  const update = () => {
    if (reducedMotion.matches || !(hovered || focused)) { stop(art); return; }
    if (wanted.has(art)) return;
    wanted.add(art);
    start(art);
  };
  card.addEventListener('pointerenter', (event) => { hovered = /** @type {PointerEvent} */ (event).pointerType !== 'touch'; update(); });
  card.addEventListener('pointerleave', () => { hovered = false; update(); });
  card.addEventListener('focus', () => { focused = card.matches(':focus-visible'); update(); });
  card.addEventListener('blur', () => { focused = false; update(); });
}
// Cancel pending starts as well as active players when the preference changes.
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    for (const art of document.querySelectorAll('.card-art')) reset(/** @type {HTMLElement} */ (art));
  }
});
// Back/forward navigation keeps the last frame without running an unseen loop.
addEventListener('pagehide', () => {
  for (const art of document.querySelectorAll('.card-art')) stop(/** @type {HTMLElement} */ (art));
});
addEventListener('pageshow', () => {
  for (const art of document.querySelectorAll('.card-art')) stop(/** @type {HTMLElement} */ (art));
});

// Shared rectangular packing keeps the visual order, keyboard order and lower edge aligned.
const wall = document.querySelector('#projects > .grid');
if (!(wall instanceof HTMLElement)) throw new Error('Missing landing mosaic');
mountMosaic(wall, { layouts: landingLayouts, onLayout: () => drawClusters(wall) });

// The browser's toolbar colour follows the page's theme, which may be the visitor's choice
// rather than the system's.
function themeColor() {
  const background = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) /** @type {HTMLMetaElement} */ (meta).content = background;
}
themeColor();
document.addEventListener('themechange', themeColor);
