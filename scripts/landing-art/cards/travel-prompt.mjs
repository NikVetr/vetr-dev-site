import { readFileSync } from 'node:fs';
import { modes } from '../../../travel-prompt/core/catalog.mjs';
import { submit } from '../../../travel-prompt/core/prompt.mjs';
import { art } from '../svg.mjs';

export function build() {
  const html = readFileSync(new URL('../../../travel-prompt/index.html', import.meta.url), 'utf8');
  const cases = [
    { mode: 'lodging', symbol: 'bed', fields: { place: 'Kyoto Station', preferences: 'Quiet at night' } },
    {
      mode: 'restaurant',
      symbol: 'dining',
      fields: { place: 'Kyoto Station', preferences: 'Regional specialties' },
    },
    { mode: 'outing', symbol: 'sights', fields: { place: 'Kyoto Station', preferences: 'Gardens and galleries' } },
    { mode: 'menu', symbol: 'menu', fields: { place: 'Menu photos', preferences: 'Food and drinks' } },
  ];
  const slides = cases.map(({ mode, symbol, fields }, index) => {
    const icon = html.match(new RegExp('<symbol id="' + symbol + '-icon"[^>]*>(.*?)</symbol>', 's'))?.[1];
    if (!icon) throw new Error('Missing travel mode icon ' + symbol);
    const prompt = submit({
      mode,
      place: fields.place,
      photoCount: mode === 'menu' ? 2 : 0,
      notes: fields.preferences,
    }).prompt;
    const verb = prompt.split(' ')[0];
    return `<div class="brief brief-${index}">
      <div class="stamp"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></div>
      <div class="request"><b>${modes[mode].label}</b><span>${fields.place}</span><span>${fields.preferences}</span></div>
      <div class="outcome">${verb} 3 options →</div></div>`;
  });
  return art({
    name: 'travel-prompt',
    responsive: true,
    period: 16,
    body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="ticket">${slides.join('')}</div></foreignObject>`,
    css: `& {--surround:#c5d4b9;--ticket:#f1edda;--stamp:#285646;--ink:#173f37;background:var(--surround);container:trip-brief / size}
:root[data-theme="dark"] & {--surround:#22362e;--ticket:#e0dfcc;--stamp:#214e41}
& .ticket {position:absolute;inset:7% 5%;overflow:hidden;background:var(--ticket);border-radius:4px;color:var(--ink);font:normal 1em/1.18 system-ui,sans-serif}
& .ticket::after {content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at left center,var(--surround) 0 1.65cqw,transparent 1.8cqw),radial-gradient(circle at right center,var(--surround) 0 1.65cqw,transparent 1.8cqw)}
& .brief {position:absolute;inset:0;display:grid;grid-template:"stamp request" minmax(0,1fr) "stamp outcome" auto / 28% minmax(0,1fr)}
& .brief:not(.brief-0) {opacity:0}
& .stamp {grid-area:stamp;display:grid;place-items:center;background:var(--stamp);color:#f1d295}
& .stamp svg {width:min(70%,35cqh);height:auto;max-height:85%}
& .request {grid-area:request;display:flex;justify-content:center;flex-direction:column;gap:1cqh;margin:0 6cqw;font-size:clamp(10px,min(5cqw,9cqh),26px);line-height:1.2}
& .request b {font-size:clamp(14px,min(7.5cqw,14cqh),40px);line-height:1.08;letter-spacing:-.035em;margin-bottom:1cqh}
& .outcome {grid-area:outcome;margin:0 6cqw;padding:2.8cqh 0 4cqh;border-top:1px dashed #82977f;font-size:clamp(10px,min(4.3cqw,8.5cqh),23px);font-weight:650}
@container trip-brief (min-aspect-ratio:3/1) {
 & .brief {grid-template:"stamp request outcome" minmax(0,1fr) / 19% minmax(0,1fr) 29%}
 & .request {margin:0 3cqw;gap:1cqh;font-size:clamp(9px,13cqh,24px)}
 & .request b {font-size:clamp(12px,21cqh,32px)}
 & .outcome {align-self:stretch;display:grid;align-content:center;border:0;border-left:1px dashed #82977f;padding:0 1.6cqw;margin:7cqh 0;font-size:clamp(9px,min(12cqh,3.1cqw),18px)}
}
@container trip-brief (max-aspect-ratio:1.12/1) {
 & .brief {grid-template:"stamp" minmax(0,.78fr) "request" minmax(0,1fr) "outcome" auto / minmax(0,1fr)}
 & .stamp svg {height:68%;width:auto}
 & .request {margin:0 8cqw;font-size:clamp(11px,6cqw,24px)}
 & .request b {font-size:clamp(15px,8.5cqw,35px)}
 & .outcome {margin:0 8cqw}
}`,
    loop:
      cases
        .map(
          (_, index) =>
            '& .brief-' + index + '{animation:travel-prompt-slide 16s ' + (-16 + 4 * index) + 's infinite}',
        )
        .join('\n') + '\n@keyframes travel-prompt-slide{0%,21%{opacity:1}25%,96%{opacity:0}100%{opacity:1}}',
  });
}
