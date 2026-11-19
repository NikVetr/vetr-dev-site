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
    const dots = values.map((_, j) => `<i class="${j <= i ? 'done' : ''} ${j === i ? 'current' : ''}"></i>`).join('');
    return `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="decode-stage">
<span class="caption">${final ? 'Decoded link' : `${values.length - 1 - i} encoded layer${i === values.length - 2 ? '' : 's'}`}</span>
<code class="value ${final ? 'decoded' : ''}">${esc(value)}</code><span class="steps">${dots}</span></div></foreignObject>`;
  });
  const last = stages.at(-1);
  if (!last) throw new Error('b64 has no decoding stages');
  const book = flipbook('b64', [last, ...stages, last], 6);
  return art({ name: 'b64', responsive: true, period: 6, frames: book.frames,
    body: book.body,
    css: `${book.css}
& .decode-stage{box-sizing:border-box;width:100%;height:100%;padding:5cqh 5cqw;display:grid;grid-template-rows:auto minmax(0,1fr) auto;align-items:center;justify-items:center;border:1px solid var(--art-line);color:var(--art-ink);text-align:center}
& .caption{font:clamp(11px,min(4.6cqw,11cqh),20px) system-ui,sans-serif;color:var(--art-muted)}
& .value{font:clamp(12px,min(5.2cqw,13cqh),28px)/1.3 ui-monospace,monospace;overflow-wrap:anywhere;min-width:0}
& .decoded{font-size:clamp(15px,min(7.8cqw,20cqh),40px);color:var(--primary)}
& .steps{width:55%;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(var(--art-line),var(--art-line)) center / 100% 2px no-repeat}
& .steps i{width:clamp(6px,2.4cqw,11px);aspect-ratio:1;border-radius:50%;background:var(--art-line)}
& .steps .done{background:var(--primary)} & .steps .current{transform:scale(1.45)}`,
    loop: book.loop,
  });
}
