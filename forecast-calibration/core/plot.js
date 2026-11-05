// Calibration plot as SVG text, built without a DOM so the page, the PNG export
// and the CLI all draw the same figure.

/**
 * @typedef {ReturnType<typeof import('./analysis.js').analyze>} Result
 * @typedef {{ width?: number, height?: number, theme?: 'light' | 'dark', worldOpacity?: number }} PlotOptions
 */

export const THEMES = {
  light: { background: '#ffffff', text: '#1b1b1b', muted: '#5a5a5a', grid: '#ebebeb', world: '#000000', observed: '#c62828' },
  dark: { background: '#16181d', text: '#e8e8e8', muted: '#a9a9a9', grid: '#2b2e35', world: '#ffffff', observed: '#ff6b6b' },
};

/**
 * Stated probability against realized frequency per bin, over the simulated worlds
 * of a calibrated forecaster (one thin line per world, as in playingPreds.R).
 * Markers are circles inside the interval and triangles pointing the way out of it.
 * @param {Result} result
 * @param {PlotOptions} [options]
 */
export function renderSvg(result, { width = 720, height = 600, theme = 'light', worldOpacity = 0.01 } = {}) {
  const c = THEMES[theme];
  const font = Math.min(13, Math.max(10, width / 34));
  const row = font * 1.7;
  const legend = [
    'Observed frequency',
    `Outside the middle ${percentLabel(result.settings.interval, 2)} of worlds`,
    `Calibrated worlds (${result.worlds.length.toLocaleString('en-US')} drawn)`,
    'Perfect calibration',
  ];
  const margin = { top: font, right: font * 1.6, bottom: font * 3.8 + legend.length * row, left: font * 4.4 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const xMin = result.bins.every((bin) => bin.probabilityRange[0] >= 0.5) ? 0.5 : 0;
  const x = (/** @type {number} */ p) => round(margin.left + ((p - xMin) / (1 - xMin)) * plotW);
  const y = (/** @type {number} */ f) => round(margin.top + (1 - f) * plotH);
  const bins = result.bins;
  const points = (/** @type {number[]} */ freqs) => freqs.map((f, b) => `${x(bins[b].meanProbability)},${y(f)}`).join(' ');

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" font-size="${round(font)}">`);
  out.push('<title>Calibration plot</title>');
  out.push(`<desc>Realized frequency against stated probability for ${bins.length} bins, over ${result.worlds.length} simulated worlds of a calibrated forecaster.</desc>`);
  out.push(`<rect width="${width}" height="${height}" fill="${c.background}"/>`);

  // Grid and axes.
  const yStep = plotH >= 220 ? 0.1 : 0.2;
  const xStep = (plotW * 0.1) / (1 - xMin) >= 42 ? 0.1 : 0.2;
  out.push(`<g stroke="${c.grid}" stroke-width="1">`);
  for (const t of ticks(0, 1, yStep)) out.push(`<line x1="${x(xMin)}" x2="${x(1)}" y1="${y(t)}" y2="${y(t)}"/>`);
  for (const t of ticks(xMin, 1, xStep)) out.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${y(0)}" y2="${y(1)}"/>`);
  out.push('</g>');
  out.push(`<g fill="${c.muted}">`);
  for (const t of ticks(0, 1, yStep)) out.push(`<text x="${round(x(xMin) - font * 0.5)}" y="${round(y(t) + font * 0.35)}" text-anchor="end">${percentLabel(t)}</text>`);
  for (const t of ticks(xMin, 1, xStep)) out.push(`<text x="${x(t)}" y="${round(y(0) + font * 1.4)}" text-anchor="middle">${percentLabel(t)}</text>`);
  out.push('</g>');
  out.push(`<g fill="${c.text}" font-size="${round(font * 1.08)}">`);
  out.push(`<text x="${round(margin.left + plotW / 2)}" y="${round(y(0) + font * 2.9)}" text-anchor="middle">Stated probability</text>`);
  out.push(`<text transform="translate(${round(font * 1.2)} ${round(margin.top + plotH / 2)}) rotate(-90)" text-anchor="middle">Realized frequency</text>`);
  out.push('</g>');

  // Simulated worlds: separate elements so their opacity accumulates where they overlap.
  out.push(`<g fill="none" stroke="${c.world}" stroke-opacity="${worldOpacity}" stroke-width="1">`);
  for (const world of result.worlds) out.push(`<polyline points="${points(world.map((hits, b) => hits / bins[b].n))}"/>`);
  out.push('</g>');

  out.push(`<line x1="${x(xMin)}" y1="${y(xMin)}" x2="${x(1)}" y2="${y(1)}" stroke="${c.muted}" stroke-width="1.5" stroke-dasharray="6 5"/>`);
  out.push(`<polyline points="${points(bins.map((bin) => bin.frequency))}" fill="none" stroke="${c.observed}" stroke-width="3" stroke-linejoin="round"/>`);
  out.push(`<g fill="${c.observed}" stroke="${c.background}" stroke-width="1.5">`);
  for (const bin of bins) {
    const title = `${bin.label}: ${bin.hits} of ${bin.n} happened (${percentLabel(bin.frequency, 1)}); middle ${percentLabel(result.settings.interval, 2)} of worlds ${percentLabel(bin.interval[0], 1)} to ${percentLabel(bin.interval[1], 1)}`;
    out.push(marker(bin.position, x(bin.meanProbability), y(bin.frequency), font, `<title>${escapeXml(title)}</title>`));
  }
  out.push('</g>');

  // Legend, one row per mark, below the axes so it never covers data. Its type shrinks
  // if the longest label would otherwise run past the edge (0.6 em per character is a
  // generous estimate for sans-serif text).
  const legendTop = height - legend.length * row;
  const sampleX = Math.min(margin.left, font * 2);
  const textX = sampleX + font * 3.6;
  const legendFont = Math.min(font, (width - textX - 4) / (0.6 * Math.max(...legend.map((label) => label.length))));
  legend.forEach((label, i) => {
    const cy = round(legendTop + i * row + row / 2);
    const sample = [
      `<line x1="${sampleX}" x2="${round(sampleX + font * 2.6)}" y1="${cy}" y2="${cy}" stroke="${c.observed}" stroke-width="3"/>${marker('inside', round(sampleX + font * 1.3), cy, font)}`,
      `${marker('above', round(sampleX + font * 0.6), cy, font)}${marker('below', round(sampleX + font * 2), cy, font)}`,
      `<line x1="${sampleX}" x2="${round(sampleX + font * 2.6)}" y1="${cy}" y2="${cy}" stroke="${c.world}" stroke-opacity="0.45" stroke-width="1"/>`,
      `<line x1="${sampleX}" x2="${round(sampleX + font * 2.6)}" y1="${cy}" y2="${cy}" stroke="${c.muted}" stroke-width="1.5" stroke-dasharray="6 5"/>`,
    ][i];
    out.push(`<g fill="${c.observed}" stroke="${c.background}" stroke-width="1.5">${sample}</g>`);
    out.push(`<text x="${round(textX)}" y="${round(cy + font * 0.35)}" fill="${c.text}" font-size="${round(legendFont)}">${escapeXml(label)}</text>`);
  });

  out.push('</svg>');
  return out.join('\n');
}

/**
 * @param {string} position 'inside' | 'above' | 'below'
 * @param {number} cx
 * @param {number} cy
 * @param {number} font
 * @param {string} [title]
 */
function marker(position, cx, cy, font, title = '') {
  if (position === 'inside') return `<circle cx="${cx}" cy="${cy}" r="${round(font * 0.4)}">${title}</circle>`;
  const s = font * 0.62;
  const tip = position === 'above' ? -1 : 1;
  const d = `M${round(cx)},${round(cy + tip * s)} L${round(cx - s)},${round(cy - tip * s * 0.75)} L${round(cx + s)},${round(cy - tip * s * 0.75)} Z`;
  return `<path d="${d}">${title}</path>`;
}

/** @param {number} from @param {number} to @param {number} step */
function ticks(from, to, step) {
  const out = [];
  for (let i = 0; from + i * step <= to + 1e-9; i++) out.push(Number((from + i * step).toFixed(6)));
  return out;
}

/** @param {number} value @param {number} [digits] */
function percentLabel(value, digits = 0) {
  return `${Number((value * 100).toFixed(digits))}%`;
}

/** @param {number} value */
function round(value) {
  return Math.round(value * 10) / 10;
}

/** @param {string} text */
function escapeXml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}
