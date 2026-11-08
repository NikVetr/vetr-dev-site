// A readable, full-size view of each real layer returned by the tool's decoder.
import '../../../b64/decoder.js';
import { art, esc, flipbook } from '../svg.mjs';

export function build() {
  const decoder = /** @type {typeof globalThis & { B64: { encodeLayers: (text: string, layers: number) => { value: string }, findLinks: (text: string) => { links: { url: string, steps: { text: string }[] }[] } } }} */ (globalThis).B64;
  const encoded = decoder.encodeLayers('https://vetr.dev/', 3);
  const link = decoder.findLinks(encoded.value).links[0];
  if (link?.url !== 'https://vetr.dev/') throw new Error('b64 landing example did not decode');
  const values = [encoded.value, ...link.steps.map(step => step.text)];
  const stages = values.map((value, i) => {
    const final = i === values.length - 1;
    const chunks = final ? [value] : value.match(/.{1,28}/g) ?? [];
    const top = 86 - (chunks.length - 1) * 11;
    const dots = values.map((_, j) => `<circle cx="${112 + j * 32}" cy="153" r="${j === i ? 6 : 4}" class="${j <= i ? 'done' : 'waiting'}"/>`).join('');
    return `<text class="caption" x="160" y="30">${final ? 'Decoded link' : `${values.length - 1 - i} encoded layer${i === values.length - 2 ? '' : 's'}`}</text>
${chunks.map((chunk, row) => `<text class="value ${final ? 'decoded' : ''}" x="160" y="${top + row * 22}">${esc(chunk)}</text>`).join('')}
<path class="progress" d="M112 153h96"/>${dots}`;
  });
  const last = stages.at(-1);
  if (!last) throw new Error('b64 has no decoding stages');
  const book = flipbook('b64', [last, ...stages, last], 6);
  return art({ name: 'b64', period: 6, frames: book.frames,
    body: `<rect class="panel" x="4" y="4" width="312" height="172" rx="8"/>${book.body}`,
    css: `${book.css}
& .panel {fill:var(--art-paper);stroke:var(--art-line)}
& text {text-anchor:middle;dominant-baseline:central;fill:var(--art-ink)}
& .caption {font:13px ui-sans-serif,system-ui,sans-serif;fill:var(--art-muted)}
& .value {font:15px ui-monospace,monospace}
& .decoded {font-size:22px;fill:var(--primary)}
& .progress {fill:none;stroke:var(--art-line);stroke-width:2}
& .done {fill:var(--primary)} & .waiting {fill:var(--art-line)}`,
    loop: book.loop,
  });
}
