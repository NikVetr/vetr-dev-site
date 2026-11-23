import { readFileSync } from 'node:fs';
import { modes, preferenceLevels, tastes } from '../../../travel-prompt/core/catalog.mjs';
import { submit } from '../../../travel-prompt/core/prompt.mjs';
import { art, esc } from '../svg.mjs';

const period = 24;
const place = 'Kyoto Station';
const budget = '¥18,000';
const menuText = 'Yuzu soda · ¥600';
const app = readFileSync(new URL('../../../travel-prompt/index.html', import.meta.url), 'utf8');

function icon(id) {
  const paths = app.match(new RegExp('<symbol id="' + id + '-icon"[^>]*>([\\s\\S]*?)</symbol>'))?.[1];
  if (!paths) throw new Error('Missing Travel Prompt icon ' + id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

// Each pair edits one real control and passes its new value through the app's prompt builder.
const examples = [
  {
    mode: 'lodging', label: 'Budget period', values: ['night', 'stay'],
    choices: [['night', 'Per night'], ['stay', 'Whole stay']],
    request: value => ({ place, budget, budgetBasis: value }),
    detail: ['Budget for all rooms', budget], excerpt: /^Budget (?:per night|for the whole stay): .+$/m
  },
  {
    mode: 'restaurant', label: tastes.spice.label, values: [1, -2],
    request: value => ({ place, people: [{ preferences: { spice: value } }] }),
    detail: ['Where?', place], excerpt: /^Me: (.+)$/m
  },
  {
    mode: 'menu', label: 'Recommend from the menu', values: ['Food', 'Drinks'],
    choices: [['Food and drinks', 'Both'], ['Food', 'Food'], ['Drinks', 'Drinks']],
    request: value => ({ menuText, focus: value }),
    detail: ['Menu text', menuText], excerpt: /Focus on [^.]+\./
  },
  {
    mode: 'outing', label: tastes.museums.label, values: [-1, 2],
    request: value => ({ place, people: [{ preferences: { museums: value } }] }),
    detail: ['Where?', place], excerpt: /^Me: (.+)$/m
  }
];

function choiceControl(options, selected) {
  return `<div class="tp-choices">${options.map(([value, label]) =>
    `<span class="tp-option${value === selected ? ' tp-selected' : ''}">${esc(label)}</span>`).join('')}</div>`;
}

function preferenceControl(value, previous) {
  const point = level => 5 + (level + 2) * 22.5;
  return `<div class="tp-slider" style="--point:${point(value)}%;--from:${point(previous)}%">
    <span class="tp-value">${esc(preferenceLevels[value + 2])}</span>
    <span class="tp-track"><span class="tp-fill"></span><span class="tp-thumb"></span></span>
  </div>`;
}

function sample(example, step, index) {
  const mode = modes[example.mode];
  const value = example.values[step];
  const { prompt } = submit({ mode: example.mode, ...example.request(value) });
  const match = prompt.match(example.excerpt);
  if (!match) throw new Error('Missing generated prompt excerpt for ' + example.mode);
  const excerpt = match[1] ?? match[0];
  const goal = prompt.slice(0, prompt.indexOf('.') + 1);
  const control = example.choices
    ? choiceControl(example.choices, value)
    : preferenceControl(value, example.values[0]);
  return `<div class="tp-frame${index === 0 ? ' tp-first' : ''}" data-sample="${example.mode}-${step}" style="--phase:${index * 3 - period}s">
    <div class="tp-editor">
      <span class="tp-mode">${icon(example.mode === 'restaurant' ? 'dining' : mode.icon)}${esc(mode.label)}</span>
      <div class="tp-extra-field"><span class="tp-label">${esc(example.detail[0])}</span><span class="tp-input">${esc(example.detail[1])}</span></div>
      <div class="tp-control"><span class="tp-label">${esc(example.label)}</span>${control}</div>
    </div>
    <div class="tp-output"><span class="tp-heading">${icon('note')}Your prompt</span>
      <div class="tp-text"><span class="tp-goal">${esc(goal)}</span><span class="tp-excerpt">${esc(excerpt)}</span></div>
    </div>
  </div>`;
}

export function build() {
  const frames = examples.flatMap((example, i) => example.values.map((_, j) => sample(example, j, i * 2 + j)));
  return art({
    name: 'travel-prompt', responsive: true, period,
    body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="tp-demo">${frames.join('')}</div></foreignObject>`,
    css: `& {container:travel-brief / size;background:#f6f5ef}
& .tp-demo {--tp-ink:#21372e;--tp-muted:#506557;--tp-accent:#195e49;--tp-paper:#fffef9;--tp-tint:#eaf0e5;--tp-line:#b9cbbb;--tp-picked:#d8e9d9;--tp-gold:#d9ae67;position:absolute;inset:0;color:var(--tp-ink);font:550 14px/1.15 system-ui,sans-serif}
:root[data-theme="dark"] & .tp-demo {--tp-ink:#edf1e9;--tp-muted:#b1c2b8;--tp-accent:#a4d9b6;--tp-paper:#202d28;--tp-tint:#283c31;--tp-line:#4e6555;--tp-picked:#324e3d;--tp-gold:#dcaf6b}
& .tp-demo * {box-sizing:border-box}
& .tp-frame {position:absolute;inset:0;display:grid;grid-template-rows:55% minmax(0,1fr);background:var(--tp-paper);visibility:hidden}
& .tp-first {visibility:visible}
& .tp-editor,& .tp-output {display:flex;flex-direction:column;justify-content:center;align-items:stretch;min-width:0;gap:clamp(3px,min(1.1cqh,1.2cqw),10px);padding:clamp(5px,min(3cqh,4cqw),18px) clamp(7px,4cqw,24px)}
& .tp-demo svg {width:1em;height:1em;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
& .tp-mode,& .tp-heading {display:flex;align-items:center;gap:.38em;font-size:clamp(12px,min(5.3cqw,9cqh),26px);font-weight:720;line-height:1.06;letter-spacing:-.03em}
& .tp-mode {align-self:flex-start;background:var(--tp-accent);color:var(--tp-paper);padding:.23em .48em;border-radius:.32em;white-space:nowrap}
& .tp-control,& .tp-extra-field {display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(2px,.8cqh,6px);min-width:0}
& .tp-extra-field,& .tp-goal {display:none}
& .tp-label,& .tp-value {font-size:clamp(10px,min(3.9cqw,6.4cqh),18px);font-weight:600;line-height:1.1}
& .tp-value {color:var(--tp-muted);font-weight:500}
& .tp-input,& .tp-option {color:var(--tp-ink);border:1px solid var(--tp-line);border-radius:.28em;background:var(--tp-paper);padding:.24em .48em;font-size:clamp(10px,min(4cqw,6.7cqh),20px);line-height:1.14}
& .tp-input {font-weight:450}
& .tp-choices {display:flex;gap:.28em}
& .tp-option {flex:1 1 0;min-width:0;text-align:center;white-space:nowrap;font-weight:600}
& .tp-selected {color:var(--tp-accent);border-color:var(--tp-accent);background:var(--tp-picked)}
& .tp-slider {display:flex;align-items:center;gap:.6em;min-height:1.1em}
& .tp-track {position:relative;flex:1;height:clamp(4px,.8cqh,7px);border-radius:6px;background:var(--tp-line)}
& .tp-fill {position:absolute;inset:0 auto 0 0;width:var(--point);background:var(--tp-accent);border-radius:inherit}
& .tp-thumb {position:absolute;left:var(--point);top:50%;width:clamp(9px,4.3cqh,18px);aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:var(--tp-accent)}
& .tp-output {background:var(--tp-tint);border-top:2px solid var(--tp-gold)}
& .tp-heading {color:var(--tp-accent);font-size:clamp(10px,min(3.9cqw,6.4cqh),19px)}
& .tp-text {font:500 clamp(15px,min(6cqw,10.5cqh),31px)/1.14 Georgia,serif;letter-spacing:-.015em}
& .tp-excerpt {display:block}
@container travel-brief (min-aspect-ratio:1.85/1) {
 & .tp-frame {grid-template-columns:49% minmax(0,1fr);grid-template-rows:100%}
 & .tp-editor,& .tp-output {padding-inline:clamp(6px,2.5cqw,20px)}
 & .tp-output {border-top:0;border-left:2px solid var(--tp-gold)}
}
@container travel-brief (min-height:222px) {
 & .tp-extra-field {display:grid}
 & .tp-goal {display:block;color:var(--tp-muted);font-size:.8em;margin-bottom:.4em}
}
@container travel-brief (min-aspect-ratio:1.85/1) and (min-height:135px) {
 & .tp-extra-field {display:grid}
 & .tp-goal {display:block;color:var(--tp-muted);font-size:.8em;margin-bottom:.4em}
}
@container travel-brief (max-width:265px) and (max-height:110px) {
 & .tp-mode {max-width:100%;white-space:normal;font-size:11px;padding:.22em .33em}
 & .tp-option:not(.tp-selected) {display:none}
 & .tp-slider {flex-direction:column;align-items:stretch;gap:.3em}
 & .tp-track {flex:none}
}`,
    // Keep whole frames readable on transition. Only the edited control and its resulting line move.
    loop: `& .tp-frame {animation:travel-show ${period}s step-end var(--phase) infinite both}
& .tp-excerpt {animation:travel-write ${period}s ease-out var(--phase) infinite both}
& .tp-thumb {animation:travel-position ${period}s ease-out var(--phase) infinite both}
& .tp-fill {animation:travel-fill ${period}s ease-out var(--phase) infinite both}
@keyframes travel-show {0%,100%{visibility:visible}12.5%{visibility:hidden}}
@keyframes travel-write {0%{opacity:.72;transform:translateY(.09em)}1.6%,100%{opacity:1;transform:translateY(0)}}
@keyframes travel-position {0%{left:var(--from)}1.6%,100%{left:var(--point)}}
@keyframes travel-fill {0%{width:var(--from)}1.6%,100%{width:var(--point)}}`,
  });
}
