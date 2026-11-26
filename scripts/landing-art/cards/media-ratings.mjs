import { readFileSync } from 'node:fs';
import { art, num } from '../svg.mjs';
import { predict, validateCatalog } from '../../../media-ratings/core.mjs';
import { tasteProfile } from '../../../media-ratings/taste.mjs';

const colors = ['#659c99', '#b78159', '#898bc1', '#c77593', '#77a26b', '#7191bc', '#b49b60', '#a783aa'];
const playback = [5, 4, 3, 2, 1, 2, 3, 4, 5];

export function build() {
  const catalog = validateCatalog(JSON.parse(readFileSync(new URL('../../../media-ratings/expanded.json', import.meta.url), 'utf8')));
  const model = catalog.defaultModel;
  const states = [1, 2, 3, 4, 5].map(rating => {
    const ratings = { 2571: rating }; // The Matrix
    const result = predict(catalog, { model, ratings });
    const profile = tasteProfile(catalog, ratings, model, result);
    const target = result.predictions.find(p => p.itemId === '589'); // Terminator 2
    if (!profile || !target) throw new Error('The landing preview requires the film taste classes and Terminator 2.');
    return { ...profile, probabilities: target.probabilities };
  });

  // Keep both axes fixed across the loop. Each spans the scores of the fitted classes.
  const axes = states[0].projection.slice(0, 2).map(({scores}) => {
    const extent = Math.max(...scores.map(Math.abs));
    return scores.map(value => extent ? value / extent : 0);
  });
  const dots = axes[0].map((x, k) => ({ x: 63 + 51 * x, y: 40 - 29 * axes[1][k] }));
  const peak = Math.max(...states.flatMap(state => state.probabilities));
  const period = 12;
  const still = [];
  const loop = [];

  // One persistent mark per quantity. Hold each fitted value for reading, then
  // interpolate to the next. The final keyframe is also the authored still.
  function animate(id, property, values) {
    const first = values[playback[0] - 1];
    still.push(`& .${id}{${property}:${first}}`);
    const stops = playback.map((rating, i) => {
      const start = i * 100 / (playback.length - 1);
      const hold = i < playback.length - 1 ? `,${num(start + 4.5)}%` : '';
      return `${num(start)}%${hold}{${property}:${values[rating - 1]}}`;
    });
    loop.push(`& .${id}{animation:media-ratings-${id} ${period}s ease-in-out infinite}
@keyframes media-ratings-${id}{${stops.join('')}}`);
  }

  const points = dots.map(({x, y}, k) => {
    animate(`class-${k}`, 'transform', states.map(s => `scale(${num(0.48 + Math.sqrt(s.weights[k]), 3)})`));
    return `<circle class="dot class-${k}" cx="${num(x)}" cy="${num(y)}" r="6.4" fill="${colors[k]}"/>`;
  }).join('');
  animate('position', 'transform', states.map(({weights}) => {
    const x = weights.reduce((s, w, i) => s + w * dots[i].x, 0);
    const y = weights.reduce((s, w, i) => s + w * dots[i].y, 0);
    return `translate(${num(x)}px,${num(y)}px)`;
  }));

  const bars = states[0].probabilities.map((_, i) => {
    animate(`bin-${i}`, 'transform', states.map(s => `scaleY(${num(s.probabilities[i] / peak, 4)})`));
    return `<rect class="bar bin-${i}" x="${i * 10 + 1}" y="3" width="8" height="76"/>`;
  }).join('');
  const stars = states.map((_, i) => {
    const x = 1 + 23 * i;
    if (i) animate(`star-${i}`, 'opacity', states.map((_, j) => j >= i ? '1' : '0'));
    return `<use href="#media-ratings-star" x="${x}" class="outline"/><use href="#media-ratings-star" x="${x}" class="star-${i}"/>`;
  }).join('');

  return art({
    name: 'media-ratings', responsive: true, period,
    defs: '<path id="media-ratings-star" d="m10 1 2.6 6.2 6.8.6-5.1 4.4 1.6 6.6-5.9-3.5-5.9 3.5 1.6-6.6L.6 7.8l6.8-.6z"/>',
    body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="forecast-layout">
<div class="rating-input"><span class="film">The Matrix</span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115 21" class="stars">${stars}</svg></div>
<div class="forecast-plot tastes"><span class="label">Taste classes</span>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 126 80"><path d="M2 40h122M63 2v76" class="axis"/>${points}<path class="position" d="m0 -4.8 4.8 4.8L0 4.8 -4.8 0z"/></svg>
<span class="caption">◇ Your position</span></div>
<div class="forecast-plot distribution"><span class="label">Terminator 2</span>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 81" preserveAspectRatio="none">${bars}<path class="baseline" d="M0 79.5h100" vector-effect="non-scaling-stroke"/></svg>
<span class="caption scale"><span>½ ★</span><span>5 ★</span></span></div></div></foreignObject>`,
    // Titles scale with their pane; side by side, the column shares and title sizes keep
    // "Taste classes" on one line, and the film title wraps in the shortest wells rather than
    // reaching its divider (scripts/landing-art/tests/media-ratings-fit.browser.mjs).
    css: `& .forecast-layout{height:100%;box-sizing:border-box;padding:2.5cqh 3cqw;display:grid;grid-template:"input input" auto "taste forecast" minmax(0,1fr) / minmax(0,1fr) minmax(0,1fr);gap:3cqh 3cqw;color:var(--art-ink);font-family:system-ui,sans-serif}
& .rating-input{grid-area:input;display:flex;align-items:center;justify-content:space-between;gap:2cqw;border-bottom:1px solid var(--art-line);padding-bottom:2cqh}
& .film{font:bold clamp(15px,min(7cqw,15cqh),38px) Georgia,serif;text-wrap:balance;overflow-wrap:break-word;min-width:0}
& .stars{width:min(40%,73cqh);height:auto;max-height:17cqh}
& .forecast-plot{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:1cqh;min-width:0;min-height:0}
& .forecast-plot svg{width:100%;height:100%;min-height:0}
& .tastes{grid-area:taste;border-right:1px solid var(--art-line);padding-right:3cqw}
& .distribution{grid-area:forecast}
& .label{font-size:clamp(11px,min(4.5cqw,10cqh),22px);font-weight:650}
& .caption{color:var(--art-muted);font-size:clamp(10px,min(3.6cqw,8cqh),15px)}
& .scale{display:flex;justify-content:space-between}
@container ratings-preview (min-aspect-ratio:2.45/1){
  & .forecast-layout{grid-template:"input taste forecast" minmax(0,1fr) / minmax(0,.85fr) minmax(0,1.15fr) minmax(0,1.1fr);padding:5cqh 2cqw;gap:2cqw}
  & .rating-input{flex-direction:column;justify-content:center;border:0;border-right:1px solid var(--art-line);padding:0 2cqw 0 0;gap:4cqh;text-align:center}
  & .film{font-size:clamp(13px,4cqw,36px)} & .stars{width:94%}
  & .label{font-size:clamp(11px,min(3.6cqw,10cqh),22px)}
}
@container ratings-preview (max-aspect-ratio:1.2/1){
  & .forecast-layout{grid-template:"input" auto "taste" minmax(0,1fr) "forecast" minmax(0,1fr) / minmax(0,1fr);padding:3cqh 5cqw;gap:2cqh}
  & .tastes{border-right:0;border-bottom:1px solid var(--art-line);padding:0 0 1.5cqh}
}
& .axis,& .baseline{stroke:var(--art-line);fill:none}
& .axis{stroke-dasharray:3 3}
& .stars{fill:var(--art-ink)}
& .outline{fill:none;stroke:var(--art-ink);stroke-width:1}
& .dot{transform-origin:center;transform-box:fill-box}
& .position{fill:var(--art-paper);stroke:var(--art-ink);stroke-width:1.8}
& .bar{fill:#58978e;transform-origin:center bottom;transform-box:fill-box}
${still.join('\n')}`,
    loop: loop.join('\n'),
  });
}
