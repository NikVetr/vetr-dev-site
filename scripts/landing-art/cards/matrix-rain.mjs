// The held title is the reduced-motion still. Playback uses the app's frame and paint functions.
import { makeScene, frame } from '../../../matrix-rain/core.mjs';
import { art, esc, num } from '../svg.mjs';

export function build() {
  const scene = makeScene({ title: 'The Extracellular Matrix' });
  const shot = frame(scene, 10.31);
  const drops = shot.glyphs.filter(g => g.kind === 'rain').map(g =>
    `<text x="${num(g.x)}" y="${num(g.y)}" opacity="${num(g.alpha, 2)}" fill="${g.hot ? '#d5fce7' : '#00bb42'}">${esc(g.char)}</text>`).join('');
  return art({ name: 'matrix-rain', responsive: true, period: 10, player: 'matrix-rain',
    defs: '<pattern id="matrix-rain-slots" width="3" height="4" patternUnits="userSpaceOnUse"><path d="M0 .5h3M.5 0v4" stroke="#011508" opacity=".42" stroke-width=".65"/></pattern>',
    body: `<g class="player-still"><rect width="100%" height="100%" fill="#010704"/>
<svg width="100%" height="100%" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice"><g text-anchor="middle" dominant-baseline="central" font-family="monospace" font-weight="600" font-size="${num(shot.size)}">${drops}</g></svg>
<svg x="4%" y="39%" width="92%" height="22%" viewBox="0 0 480 44"><text class="locked" x="240" y="32" text-anchor="middle" fill="#cdfbdf" font-family="monospace" font-size="32" font-weight="bold">${esc(scene.title)}</text></svg>
<rect width="100%" height="100%" fill="url(#matrix-rain-slots)"/></g><g class="matrix-clock"/>`,
    loop: '& .matrix-clock{animation:matrix-opening-clock 10s linear infinite}@keyframes matrix-opening-clock{to{opacity:.99}}',
  });
}
