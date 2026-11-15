// The browser app’s beta–binomial example and its deterministic prior-simulation output.
import { art, esc, INK, MUTED, LINE } from '../svg.mjs';
import { examples } from '../../../stan2r/examples.js';

export function build() {
  const name = 'stan2r';
  const input = examples.binomial.source.split('\n').filter(line => line.includes(' ~ ')).map(line => line.trim());
  const output = ['theta <- rbeta(1, 2, 2)', 'successes <- rbinom(1, trials, theta)'];
  const lines = (/** @type {string[]} */ items, /** @type {number} */ y, /** @type {string} */ cls) => items.map((line,i) =>
    `<text class="${cls} line-${i}" x="15" y="${y+i*22}" fill="${INK}" font-size="12" font-family="ui-monospace,monospace">${esc(line)}</text>`).join('');
  const body = `<text x="15" y="20" fill="${MUTED}" font-size="11">Stan</text>
    ${lines(input,46,'source')}
    <path d="M15 86H305" stroke="${LINE}"/>
    <text x="15" y="108" fill="${MUTED}" font-size="11">R · prior simulation</text>
    ${lines(output,134,'result')}`;
  const loop = `& .result {animation:${name}-reveal 7s ease-in-out infinite}
    & .result.line-1 {animation-delay:.35s}
    @keyframes ${name}-reveal {0%,18% {opacity:0} 30%,88% {opacity:1} 100% {opacity:0}}`;
  return art({ name, body, loop, period:7 });
}
