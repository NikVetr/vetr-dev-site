// The opening's locked title over continuously falling, repeating strips of its seeded code.
import { makeScene } from '../../../matrix-rain/core.mjs';
import { art, esc, num } from '../svg.mjs';

const title = 'The Extracellular Matrix';
const width = 480, height = 240, step = 16, period = 8;

export function build() {
  const scene = makeScene({ title });
  const defs = [], layers = [], loops = [];
  // All strips return to the same glyph at the seam. Each speed group tiles in
  // both directions so a resize can expose more rain at any point in the loop.
  for (const [band, rows] of [13, 19, 27].entries()) {
    const pitch = rows * step;
    const glyphs = [];
    for (let column = band; column < 30; column += 3) {
      const stream = scene.streams[column];
      const head = Math.floor(stream.start * rows);
      const length = Math.min(rows - 3, Math.ceil(stream.length / 2));
      for (let tail = 0; tail < length; tail++) {
        const row = (head - tail + rows) % rows;
        const char = stream.sequence[(column + rows - tail) % stream.sequence.length];
        const opacity = num(0.83 * (1 - tail / length) ** 1.4, 2);
        glyphs.push(`<text x="${column * step + step / 2}" y="${row * step + 13}" opacity="${opacity}"${!tail && stream.bright ? ' fill="#bbf8d0"' : ''}>${esc(char)}</text>`);
      }
    }
    const id = 'matrix-rain-code-' + band;
    defs.push(`<pattern id="${id}" width="${width}" height="${pitch}" patternUnits="userSpaceOnUse"><g class="glyphs">${glyphs.join('')}</g></pattern>`);
    layers.push(`<rect class="fall-${band}" y="${-pitch}" width="${width}" height="${height + pitch}" fill="url(#${id})"/>`);
    loops.push(`& .fall-${band}{animation:matrix-rain-fall-${band} ${period}s linear infinite}
@keyframes matrix-rain-fall-${band}{to{transform:translateY(${pitch}px)}}`);
  }
  return art({
    name: 'matrix-rain', period, responsive: true,
    defs: defs.join('') + `
<linearGradient id="matrix-rain-glass" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset=".23" stop-color="#010704" stop-opacity="0"/><stop offset=".5" stop-color="#010704" stop-opacity=".88"/><stop offset=".76" stop-color="#010704" stop-opacity="0"/>
</linearGradient>
<radialGradient id="matrix-rain-edges" r="69%"><stop offset=".42" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".64"/></radialGradient>
<pattern id="matrix-rain-mask" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 .5h3M.5 0v3" stroke="#021307" opacity=".45" stroke-width=".65"/></pattern>`,
    body: `<rect width="100%" height="100%" fill="#010704"/>
<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice">${layers.join('')}</svg>
<rect width="100%" height="100%" fill="url(#matrix-rain-glass)"/>
<svg x="4%" y="40%" width="92%" height="20%" viewBox="0 0 480 44"><text x="240" y="32" class="locked" textLength="470" lengthAdjust="spacing">${esc(title)}</text></svg>
<rect width="100%" height="100%" fill="url(#matrix-rain-mask)"/><rect width="100%" height="100%" fill="url(#matrix-rain-edges)"/>`,
    css: `& .glyphs{font:bold 17px ui-monospace,monospace;text-anchor:middle;fill:#27e665}
& .locked{font:bold 33px ui-monospace,monospace;text-anchor:middle;fill:#cdfbdf}`,
    loop: loops.join('\n'),
  });
}
