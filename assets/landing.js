// Landing page artwork, playback, grid reading order and thematic outlines.
import { drawClusters } from './landing-clusters.js';
import { landingLayouts } from './landing-order.js';
import { mountMosaic } from '../shared/mosaic.js';
import { lightSwitch } from '../shared/light-switch.js';
//
// Card pictures: each .card-art[data-art=name] is filled with assets/cards/<name>.svg (drawn
// by scripts/landing-art/ from the tool itself) when it comes near the viewport. The SVG is
// inlined rather than shown as an <img> so that it paints in the page's theme colours.
//
// Hover loops start on the first mouse/pen hover or keyboard focus. data-started keeps
// the CSS animations attached; removing data-playing pauses them at their current time.
// A scripted canvas player keeps its current frame too. Both resume on the next interaction.
// Players load on first play, before their matching CSS clocks start.
// On phones/touch screens, the card nearest the viewport centre plays automatically.
// The compact bar can pause all previews; reduced motion always shows authored stills.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 47.99rem), (hover: none) and (pointer: coarse)');
const motionControl = document.querySelector('#preview-motion');
if (!(motionControl instanceof HTMLButtonElement)) throw new Error('Missing preview motion control');
const motionButton = motionControl;
let enabled = true;
try { enabled = localStorage.getItem('vetr-preview-motion') !== 'off'; } catch { /* Storage may be unavailable. */ }
let pageActive = true;
const canPlay = () => enabled && !reducedMotion.matches && pageActive && !document.hidden;
const motionSwitch = lightSwitch({
  button: motionButton, label: 'Animations', dark: () => enabled && !reducedMotion.matches,
  marks: [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14M17 5v14" stroke="currentColor" stroke-width="4"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 3 15 9-15 9Z" fill="currentColor"/></svg>',
  ],
  flip: () => {
    enabled = !enabled;
    try { localStorage.setItem('vetr-preview-motion', enabled ? 'on' : 'off'); } catch { /* Keep the in-memory choice. */ }
    updatePlayback();
  },
});

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
  if (!canPlay() || !wanted.has(art)) return;
  const svg = art.querySelector('svg');
  if (!svg) return;   // it starts when it loads
  const name = svg.dataset.player;
  if (!name) { art.dataset.started = ''; art.dataset.playing = ''; return; }
  const player = await import(`./players/${name}.js`);
  const plan = await player.prepare();
  if (!canPlay() || !wanted.has(art)) return;
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

/** Each interaction contributes intent; mobile playback chooses exactly one card. */
const cards = [...document.querySelectorAll('.project-card')].map(card => ({
  card, art: /** @type {HTMLElement} */ (card.querySelector('.card-art')), hovered: false, focused: false,
}));
/** @type {HTMLElement | null} */
let centred = null;
function updatePlayback() {
  for (const state of cards) {
    const active = mobile.matches ? state.art === centred : state.hovered || state.focused;
    if (!canPlay() || !active) { stop(state.art); continue; }
    if (!wanted.has(state.art)) { wanted.add(state.art); start(state.art); }
  }
  motionSwitch.show();
  motionButton.disabled = reducedMotion.matches;
  motionButton.title = reducedMotion.matches ? 'Motion is reduced in your device settings' : 'Play or pause panel animations';
}
for (const state of cards) {
  nearViewport.observe(state.art);
  state.card.addEventListener('pointerenter', event => { state.hovered = /** @type {PointerEvent} */ (event).pointerType !== 'touch'; updatePlayback(); });
  state.card.addEventListener('pointerleave', () => { state.hovered = false; updatePlayback(); });
  state.card.addEventListener('focus', () => { state.focused = state.card.matches(':focus-visible'); updatePlayback(); });
  state.card.addEventListener('blur', () => { state.focused = false; updatePlayback(); });
}
// Measure only once per frame, including layout changes after lazy pictures/fonts arrive.
let selectionFrame = 0;
function selectCentre() {
  selectionFrame = 0;
  centred = null;
  if (mobile.matches) {
    const top = document.querySelector('.mobile-bar')?.getBoundingClientRect().bottom ?? 0;
    const cy = (top + innerHeight) / 2, cx = innerWidth / 2;
    let closest = Infinity;
    for (const { card, art } of cards) {
      const r = card.getBoundingClientRect();
      if (r.bottom <= top || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const distance = Math.hypot((r.top + r.bottom) / 2 - cy, (r.left + r.right) / 2 - cx);
      if (distance < closest) { closest = distance; centred = art; }
    }
  }
  updatePlayback();
}
function scheduleSelection() {
  if (!selectionFrame) selectionFrame = requestAnimationFrame(selectCentre);
}
addEventListener('scroll', scheduleSelection, { passive: true });
addEventListener('resize', scheduleSelection);
mobile.addEventListener('change', scheduleSelection);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) for (const { art } of cards) reset(art);
  scheduleSelection();
});
// Back/forward and background tabs retain their frame without running unseen loops.
addEventListener('pagehide', () => { pageActive = false; updatePlayback(); });
addEventListener('pageshow', () => { pageActive = true; scheduleSelection(); });
document.addEventListener('visibilitychange', () => { updatePlayback(); scheduleSelection(); });

updatePlayback();

// Shared rectangular packing keeps the visual order, keyboard order and lower edge aligned.
const wall = document.querySelector('#projects > .grid');
if (!(wall instanceof HTMLElement)) throw new Error('Missing landing mosaic');
mountMosaic(wall, { layouts: landingLayouts, onLayout: () => { drawClusters(wall); scheduleSelection(); } });

// The browser's toolbar colour follows the page's theme, which may be the visitor's choice
// rather than the system's.
function themeColor() {
  const background = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) /** @type {HTMLMetaElement} */ (meta).content = background;
}
themeColor();
document.addEventListener('themechange', themeColor);
