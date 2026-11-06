// The same three-layer link and decoded trace that the b64 tool produces.
import '../../../b64/decoder.js';
import { art, esc } from '../svg.mjs';

export function build() {
  const decoder = /** @type {typeof globalThis & { B64: { encodeLayers: (text: string, layers: number) => { value: string }, findLinks: (text: string) => { links: { url: string, steps: { text: string }[] }[] } } }} */ (globalThis).B64;
  const encoded = decoder.encodeLayers('https://vetr.dev/', 3);
  const link = decoder.findLinks(encoded.value).links[0];
  if (link?.url !== 'https://vetr.dev/') throw new Error('b64 landing example did not decode');
  const lines = [encoded.value, ...link.steps.map((step) => step.text)];
  const rows = lines.map((text, i) => `<g class="layer layer-${i}">
    <rect x="12" y="${12 + i * 39}" width="296" height="32" rx="5"/>
    <text class="number" x="23" y="${32 + i * 39}">${i === lines.length - 1 ? '↗' : lines.length - 1 - i}</text>
    <text x="46" y="${32 + i * 39}" textLength="${Math.min(248, text.length * 6.1)}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text>
  </g>`).join('');
  return art({ name: 'b64', period: 4, body: rows,
    css: `& rect { fill: var(--art-paper); stroke: var(--art-line); }
& text { fill: var(--art-ink); font: 11px ui-monospace, monospace; }
& .number { fill: var(--art-muted); }
& .layer-3 text { fill: var(--primary); }`,
    loop: `& .layer rect { animation: b64-layer 4s linear infinite; }
& .layer-1 rect { animation-delay: 1s; } & .layer-2 rect { animation-delay: 2s; } & .layer-3 rect { animation-delay: 3s; }
@keyframes b64-layer { 0%, 25%, 100% { stroke: var(--art-line); } 12.5% { stroke: var(--primary); } }`,
  });
}
