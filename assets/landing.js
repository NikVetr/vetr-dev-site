// The landing page's only script, besides the theme.
//
// Card pictures: each .card-art[data-art=name] is filled with assets/cards/<name>.svg (drawn
// by scripts/landing-art/ from the tool itself) when it comes near the viewport. The SVG is
// inlined rather than shown as an <img> so that it paints in the page's theme colours.
//
// Hover loops: hovering a card with a mouse or pen, or focusing it from the keyboard, sets
// data-playing on its picture, which starts the picture's CSS loop; leaving or blurring it
// removes the attribute, which stops the loop and shows the still again. Touch never plays
// (a tap opens the tool), and nothing plays under prefers-reduced-motion.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** @param {HTMLElement} art */
async function load(art) {
  const response = await fetch(`assets/cards/${art.dataset.art}.svg`);
  if (!response.ok) throw new Error(`card picture ${art.dataset.art}: HTTP ${response.status}`);
  art.innerHTML = await response.text();
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
  const play = () => { if (!reducedMotion.matches) art.dataset.playing = ''; };
  const stop = () => { delete art.dataset.playing; };
  card.addEventListener('pointerenter', (event) => { if (/** @type {PointerEvent} */ (event).pointerType !== 'touch') play(); });
  card.addEventListener('pointerleave', stop);
  card.addEventListener('focus', () => { if (card.matches(':focus-visible')) play(); });
  card.addEventListener('blur', stop);
}
// Coming back to the page (Back button, bfcache) starts with every picture still.
addEventListener('pageshow', () => {
  for (const art of document.querySelectorAll('.card-art[data-playing]')) delete /** @type {HTMLElement} */ (art).dataset.playing;
});

// The browser's toolbar colour follows the page's theme, which may be the visitor's choice
// rather than the system's.
function themeColor() {
  const background = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) /** @type {HTMLMetaElement} */ (meta).content = background;
}
themeColor();
document.addEventListener('themechange', themeColor);
