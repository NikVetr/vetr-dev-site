// Statistical Intuitions: the gallery's threshold-model figure at the parameters of its index
// thumbnail (one trait, liability mean 0.4, thresholds -0.6, 0.5 and 1.4): the normal liability
// with each category's area filled in the gallery's ordinal teal ramp, numbered as the entry's
// full figure numbers them. The loop is the entry's main interaction, moving the mean: it swings
// one SD either way and back, a sine, so the category areas grow and shrink under the fixed
// thresholds. The density's shape does not depend on its mean, so the move is a translation
// of the curve, clipped to each category's band.
import { compute } from '../../../intuitions/threshold-model/compute.js';
import { DOMAIN } from '../../../intuitions/threshold-model/figure.js';
import { dnorm } from '../../../intuitions/lib/normal.js';
import { H, W, art, num, polyline } from '../svg.mjs';

const PERIOD = 6;
const SWING = 1;   // SD units

/** The entry's ramp class of category c of k (figure.js rampClass). @param {number} c @param {number} k */
const ramp = (c, k) => (k === 1 ? 0 : Math.round((c * 5) / (k - 1)));
// The gallery's --cat-0 to --cat-5, light and dark (intuitions/style.css).
const CAT = {
  light: ['#77bfa8', '#5fa690', '#488e79', '#317663', '#175f4d', '#004939'],
  dark: ['#115a48', '#2f7460', '#4a8e7a', '#64a994', '#7fc6af', '#9ae3cb'],
};

export function build() {
  const trait = /** @type {any} */ (compute({ means: [0.4], thresholds: [[-0.6, 0.5, 1.4]] })).traits[0];
  const [pad, top, bottom] = [10, 24, 12];
  const base = H - bottom;
  const x = (/** @type {number} */ v) => pad + ((v - DOMAIN[0]) / (DOMAIN[1] - DOMAIN[0])) * (W - 2 * pad);
  const y = (/** @type {number} */ d) => base - (d / 0.5) * (base - top);
  const perSd = (W - 2 * pad) / (DOMAIN[1] - DOMAIN[0]);

  // The density over the domain widened by the swing, at the still's mean, sampled every 2 units.
  const [lo, hi] = [DOMAIN[0] - SWING, DOMAIN[1] + SWING];
  const n = Math.ceil(((hi - lo) * perSd) / 2);
  const curve = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n).map((v) => [x(v), y(dnorm(v, trait.mean, 1))]);
  const area = `${polyline(curve)}L${num(x(hi))} ${num(base)}L${num(x(lo))} ${num(base)}Z`;

  const edges = [DOMAIN[0], ...trait.thresholds, DOMAIN[1]];
  const k = edges.length - 1;
  const clip = (/** @type {number} */ a, /** @type {number} */ b) => `<rect x="${num(x(a))}" y="0" width="${num(x(b) - x(a))}" height="${H}"/>`;
  const defs = `<path id="intuitions-area" d="${area}"/>
${edges.slice(0, -1).map((a, c) => `<clipPath id="intuitions-band${c}">${clip(a, edges[c + 1])}</clipPath>`).join('\n')}
<clipPath id="intuitions-domain">${clip(DOMAIN[0], DOMAIN[1])}</clipPath>`;
  const bands = edges.slice(0, -1).map((a, c) => `<g clip-path="url(#intuitions-band${c})"><use class="move cat-${ramp(c, k)}" href="#intuitions-area"/></g>`).join('\n');
  const labels = edges.slice(0, -1).map((a, c) => `<text x="${num((x(a) + x(edges[c + 1])) / 2)}" y="${top - 8}">${c}</text>`).join('');
  const thresholds = trait.thresholds.map((/** @type {number} */ t) => `M${num(x(t))} ${base}V${top - 2}`).join('');
  const body = `${bands}
<g clip-path="url(#intuitions-domain)"><path class="move ink-line" d="${polyline(curve)}"/></g>
<path class="baseline" d="M${pad} ${base}H${W - pad}"/>
<path class="threshold" d="${thresholds}"/>
<g class="labels">${labels}</g>`;

  // The mean's swing, a sine sampled at 24 stops.
  const stops = Array.from({ length: 25 }, (_, i) => `${num((100 * i) / 24, 3)}% { transform: translateX(${num(SWING * perSd * Math.sin((2 * Math.PI * i) / 24), 2)}px); }`).join(' ');
  const cats = [0, 1, 2, 3, 4, 5].map((i) => `& .cat-${i} { fill: ${CAT.light[i]}; } :root[data-theme="dark"] & .cat-${i} { fill: ${CAT.dark[i]}; }`).join('\n');
  return art({
    name: 'intuitions',
    period: PERIOD,
    defs,
    body,
    css: `${cats}
& .ink-line { fill: none; stroke: var(--art-ink); stroke-width: 2; }
& .baseline { stroke: var(--art-muted); stroke-width: 1; }
& .threshold { stroke: var(--art-ink); stroke-width: 1.5; }
& .labels { fill: var(--art-muted); font: 600 11px ui-sans-serif, system-ui, sans-serif; text-anchor: middle; }`,
    loop: `& .move { animation: intuitions-mean ${PERIOD}s linear infinite; }
@keyframes intuitions-mean { ${stops} }`,
  });
}
