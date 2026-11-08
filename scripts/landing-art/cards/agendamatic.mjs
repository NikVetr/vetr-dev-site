// autoCHAIR: the page's default agenda, its five items with their colours, leads, durations and
// times, above its tracker: the timeline of coloured blocks under the clock times, the red "now"
// marker with its dotted guide, and the progress bar. Everything is read from the page as it
// renders (the rows, the blocks' extents, the ticks and their labels, the item colours of both
// themes and the active and completed styles), and the tracker is redrawn in the app's own
// look; a label too long for its block hangs below it on a connector, as in the app.
// The still is a quarter of an hour into the meeting, run to time: Welcome done, ED Report active.
// The loop runs the meeting on to its end, each item active in turn and then completed as the
// marker passes, holds the finished meeting, resets it while the marker fades out and back in at
// the start, and runs it again from 4:00 to the still.
import { art, esc, num } from '../svg.mjs';
import { openPage } from '../browser.mjs';

const STILL = 15;     // minutes into the meeting at rest
const RATE = 0.15;   // seconds of loop per minute of meeting
const DONE_HOLD = 0.6; // seconds the finished meeting shows
const RESET = 0.2;    // seconds the reset fades take, out and in
const START_HOLD = 0.4; // seconds before the meeting starts again
const STATE = 0.15;   // seconds a block takes to change state (the app's is 0.2)
const FONT = "'Courier New', ui-monospace, monospace";
const CHAR = 0.6;     // a monospace face's advance, em
const RIGHT = 316;    // hanging labels end by here

/**
 * @typedef {{ surface: string, border: string, input: string, text: string }} ItemColours
 * @typedef {{ themes: Record<number, ItemColours>, red: string, blue: string, muted: string,
 *   track: string, trackLine: string, progress: string, bar: string }} Colours
 * @typedef {{ opacity: number, filter: string }} Completed
 * @typedef {'planned'|'active'|'done'} State
 * @typedef {Object} PageData
 * @property {{ theme: number, name: string, lead: string, duration: string, start: string, separator: string, end: string }[]} rows
 * @property {string[]} head   the agenda's column headings
 * @property {{ theme: number, name: string, left: number, width: number }[]} blocks  extents in % of the track
 * @property {{ offset: number, major: boolean }[]} ticks  minutes from the start
 * @property {{ text: string, offset: number, color: string, major: boolean }[]} labels
 * @property {{ block: Completed, label: Completed }} done  the completed block's and hanging label's styles
 * @property {Colours} light
 * @property {Colours} dark
 */

/**
 * Everything the picture shows, as the default page renders it, in both themes.
 * @returns {Promise<PageData>}
 */
async function readPage() {
  const { page, errors, close } = await openPage('agendamatic/');
  try {
    if (errors.length) throw new Error(`agendamatic: the page failed: ${errors.join('; ')}`);
    return await page.evaluate(() => {
      const all = (/** @type {string} */ s, /** @type {ParentNode} */ el = document) => /** @type {HTMLElement[]} */ ([...el.querySelectorAll(s)]);
      const theme = (/** @type {Element} */ el) => Number(/\btheme-(\d)\b|\bblock-(\d)\b/.exec(el.className)?.slice(1).find(Boolean));
      const rows = all('#agenda-container .agenda-row').map((r) => ({
        theme: theme(r),
        ...Object.fromEntries(all('input[data-field]', r).map((i) => [/** @type {HTMLInputElement} */ (i).dataset.field, /** @type {HTMLInputElement} */ (i).value])),
        start: all('.interval-start-btn', r)[0]?.textContent?.trim(),
        separator: all('.interval-separator', r)[0]?.textContent?.trim(),
        end: all('.interval-end-btn', r)[0]?.textContent?.trim(),
      }));
      const head = all('.agenda-header > *').map((h) => h.textContent?.trim() ?? '');
      const blocks = all('#timeline-track .timeline-block').map((b) => ({
        theme: theme(b), name: b.textContent ?? '', left: parseFloat(b.style.left), width: parseFloat(b.style.width),
      }));
      const ticks = all('#timeline-axis .axis-tick').map((t) => ({ offset: Number(t.dataset.offset), major: t.classList.contains('major') }));
      const labels = all('.axis-tick-label').map((l) => ({ text: l.textContent ?? '', offset: Number(l.dataset.tickOffset), color: l.dataset.followColor ?? '', major: l.classList.contains('axis-label-major') }));
      // The completed styles, as the stylesheet has them.
      const probe = (/** @type {string} */ cls) => {
        const el = document.createElement('div');
        el.className = cls;
        document.body.append(el);
        const cs = getComputedStyle(el);
        const out = { opacity: Number(cs.opacity), filter: cs.filter };
        el.remove();
        return out;
      };
      const done = { block: probe('timeline-block block-1 completed'), label: probe('overflow-label completed') };
      const colours = (/** @type {'light'|'dark'} */ mode) => {
        if (mode === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        const root = getComputedStyle(document.documentElement);
        const v = (/** @type {string} */ n) => root.getPropertyValue(n).trim();
        const q = (/** @type {string} */ s, /** @type {string} */ p) => getComputedStyle(/** @type {Element} */ (document.querySelector(s))).getPropertyValue(p);
        return {
          themes: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, { surface: v(`--theme-${n}`), border: v(`--theme-${n}-border`), input: v(`--theme-${n}-input`), text: v(`--theme-${n}-text`) }])),
          red: v('--accent-red'), blue: v('--accent-blue'), muted: v('--text-muted'),
          track: q('.timeline-track', 'background-color'), trackLine: q('.timeline-track', 'border-top-color'),
          progress: q('.progress-bar-container', 'background-color'), bar: q('.progress-bar', 'background-color'),
        };
      };
      const light = colours('light');
      const dark = colours('dark');
      document.documentElement.removeAttribute('data-theme');
      return { rows, head, blocks, ticks, labels, done, light, dark };
    });
  } finally {
    await close();
  }
}

/** [r, g, b] of a #rrggbb or rgb() colour. @param {string} c */
function rgb(c) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const fn = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (!fn) throw new Error(`agendamatic: unreadable colour ${c}`);
  return fn.slice(1, 4).map(Number);
}
const hex = (/** @type {number[]} */ c) => `#${c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`;

/**
 * A CSS filter of saturate() and brightness() steps, applied to a colour (in sRGB, as browsers
 * apply the filter functions).
 * @param {string} colour @param {string} filter
 */
function filtered(colour, filter) {
  let [r, g, b] = rgb(colour);
  for (const [, fn, arg] of filter.matchAll(/(\w+)\(([\d.]+)\)/g)) {
    const s = Number(arg);
    if (fn === 'saturate') {
      [r, g, b] = [
        (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
        (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
      ];
    } else if (fn === 'brightness') {
      [r, g, b] = [r * s, g * s, b * s];
    } else {
      throw new Error(`agendamatic: the completed style uses ${fn}(), which this picture does not draw`);
    }
  }
  return hex([r, g, b]);
}

export async function build() {
  const pageData = await readPage();
  const { rows, blocks, ticks, labels, done, light, dark } = pageData;
  if (!rows.length || rows.length !== blocks.length) throw new Error('agendamatic: the agenda and the tracker disagree');
  if (rows.some((r) => !r.name || !r.lead || !r.duration || !r.start || !r.end || !r.theme)) throw new Error('agendamatic: an agenda row is incomplete');
  const header = ['Item', 'Lead', 'Duration', 'Time'];
  if (header.some((h) => !pageData.head.includes(h))) throw new Error('agendamatic: the agenda has no Item, Lead, Duration or Time column');
  const total = Math.max(...ticks.map((t) => t.offset));
  // Each block's minutes, from its extent on the track.
  const span = blocks.map((b) => [(b.left / 100) * total, ((b.left + b.width) / 100) * total].map((m) => Math.round(m * 1000) / 1000));
  if (Math.abs(span[span.length - 1][1] - total) > 0.01) throw new Error('agendamatic: the blocks do not fill the tracker');

  // ---- The agenda, as rows: colour bar, item, lead, duration, time.
  const size = 8.5;
  const w = (/** @type {string} */ s, /** @type {number} */ fs) => s.length * CHAR * fs;
  const itemW = Math.max(...rows.map((r) => w(r.name, size))) + 8;
  const leadW = Math.max(...rows.map((r) => w(r.lead, size)), w('Lead', 7.5)) + 8;
  const durW = Math.max(...rows.map((r) => w(r.duration, size)), w('Duration', 7.5)) + 4;
  const time = (/** @type {typeof rows[0]} */ r) => `${r.start} ${r.separator} ${r.end}`;
  const timeW = Math.max(...rows.map((r) => w(time(r), size)));
  const [x0, x1] = [12, 308];
  const gap = (x1 - x0 - 6 - itemW - leadW - durW - timeW) / 3;
  if (gap < 6) throw new Error('agendamatic: the agenda rows do not fit');
  const col = { item: x0 + 6, lead: x0 + 6 + itemW + gap, dur: x0 + 6 + itemW + leadW + 2 * gap, time: x1 - timeW };
  const pitch = 16;
  const rowY = (/** @type {number} */ i) => 18.5 + i * pitch;
  let agenda = `<g class="head">${[['Item', col.item + 3], ['Lead', col.lead + 3], ['Duration', col.dur + 2], ['Time', col.time]]
    .map(([t, x]) => `<text x="${num(Number(x))}" y="13">${t}</text>`).join('')}</g>\n`;
  for (const [i, r] of rows.entries()) {
    const y = rowY(i);
    agenda += `<g class="row t${r.theme}"><rect class="bar" x="${x0}" y="${num(y)}" width="2.6" height="13" rx="1"/>`
      + `<rect class="chip" x="${num(col.item)}" y="${num(y)}" width="${num(itemW)}" height="13" rx="1.5"/><text class="name" x="${num(col.item + 3)}" y="${num(y + 9.3)}">${esc(r.name)}</text>`
      + `<rect class="box" x="${num(col.lead)}" y="${num(y)}" width="${num(leadW)}" height="13" rx="1.5"/><text x="${num(col.lead + 3)}" y="${num(y + 9.3)}">${esc(r.lead)}</text>`
      + `<rect class="box" x="${num(col.dur)}" y="${num(y)}" width="${num(durW)}" height="13" rx="1.5"/><text x="${num(col.dur + 2)}" y="${num(y + 9.3)}">${esc(r.duration)}</text>`
      + `<text class="time" x="${num(col.time)}" y="${num(y + 9.3)}">${esc(time(r))}</text></g>\n`;
  }

  // ---- The tracker.
  const [tl, tr] = [12, 308];
  const X = (/** @type {number} */ m) => tl + ((tr - tl) * m) / total;
  const yMark = 105;
  const yLabel = 118;
  const yAxis = 125;
  const [yTrack, hTrack] = [129, 18];
  const yHang = 158;
  const yBar = 164;
  const fs = 7;
  let tracker = `<path class="ticks" d="${ticks.map((t) => `M${num(X(t.offset))} ${yAxis}v${t.major ? -4 : -2}`).join('')}"/><rect class="axis" x="${tl}" y="${yAxis - 0.6}" width="${tr - tl}" height="1.2"/>\n`;
  const placed = labels.map((l) => ({ ...l, x: X(l.offset), w: w(l.text, fs) }));
  for (const [a, b] of placed.slice(0, -1).map((l, i) => [l, placed[i + 1]])) {
    if (a.x + a.w / 2 + 2 > b.x - b.w / 2) throw new Error(`agendamatic: the tick labels ${a.text} and ${b.text} overlap`);
  }
  tracker += placed.map((l) => `<text class="${l.major ? 'tick' : 'tick minor'}" x="${num(l.x)}" y="${yLabel}"${l.major ? ` style="fill:${l.color}"` : ''}>${esc(l.text)}</text>`).join('') + '\n';
  // The guide and the progress bar's groove sit under the track, as in the app.
  tracker += `<rect class="groove" x="${tl}" y="${yBar}" width="${tr - tl}" height="2.4" rx="1.2"/>\n`;
  tracker += `<g class="marker"><path class="guide" d="M0 ${yMark + 4.5}V${yBar + 2.4}"/><path class="now" d="M-3.6 ${yMark}h7.2l-3.6 4.5z"/></g>\n`;
  tracker += `<g class="progress" transform="translate(${tl} ${yBar})"><rect class="fill" width="${tr - tl}" height="2.4" rx="1.2"/></g>\n`;
  tracker += `<rect class="track" x="${tl}" y="${yTrack}" width="${tr - tl}" height="${hTrack}" rx="2"/>\n`;

  // Each block in three states: as planned, active and completed. Labels that do not fit
  // inside hang below, pushed apart from the right as the app does.
  const inside = blocks.map((b, i) => w(b.name, fs) + 6 <= X(span[i][1]) - X(span[i][0]));
  const hang = blocks.map((b, i) => ({ i, c: (X(span[i][0]) + X(span[i][1])) / 2, w: w(b.name, fs) })).filter(({ i }) => !inside[i]);
  let limit = RIGHT;
  for (const h of [...hang].reverse()) {
    h.c = Math.min(h.c, limit - h.w / 2);
    limit = h.c - h.w / 2 - 6;
  }
  if (hang.length && hang[0].c - hang[0].w / 2 < 4) throw new Error('agendamatic: the hanging labels do not fit');
  // The active block's glow, from the top: the item's own colour, fading out.
  const gradient = rows.map((r, i) => {
    const c = light.themes[r.theme].border;
    return `<linearGradient id="agendamatic-glow${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0.32"/><stop offset="0.42" stop-color="${c}" stop-opacity="0.1"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
  }).join('');

  const timing = runTimes(span, total);
  const { period } = timing;
  let loop = '';
  const states = blocks.map((b, i) => {
    const [a, z] = [X(span[i][0]), X(span[i][1])];
    const box = (/** @type {string} */ cls, extra = '') => `<rect class="${cls}" x="${num(a + 0.45)}" y="${num(yTrack + 0.45)}" width="${num(z - a - 0.9)}" height="${num(hTrack - 0.9)}"${extra}/>`;
    const label = inside[i] ? `<text x="${num((a + z) / 2)}" y="${num(yTrack + hTrack / 2 + 2.4)}">${esc(b.name)}</text>` : '';
    const t = rows[i].theme;
    const at = timing.state(i, STILL);
    loop += timing.keyframes(`b${i}`, (s) => (s === 'done' ? 0 : 1), i) + timing.keyframes(`a${i}`, (s) => (s === 'active' ? 1 : 0), i) + timing.keyframes(`d${i}`, (s) => (s === 'done' ? done.block.opacity : 0), i);
    let out = `<g class="block t${t}">`
      + `<g class="b${i}"${at === 'done' ? ' opacity="0"' : ''}>${box('base')}${label}</g>`
      + `<g class="a${i} active"${at === 'active' ? '' : ' opacity="0"'}>${box('base')}${box('glow', ` fill="url(#agendamatic-glow${i})"`)}${box('edge')}${label}</g>`
      + `<g class="d${i} done" opacity="${at === 'done' ? done.block.opacity : 0}">${box('base')}${label}</g>`;
    const h = hang.find((x) => x.i === i);
    if (h) {
      const c = (a + z) / 2;
      const top = yTrack + hTrack;
      const hung = `<path class="link" d="M${num(c)} ${top}C${num(c)} ${top + 3} ${num(h.c)} ${top + 2} ${num(h.c)} ${top + 5}"/><text class="hang" x="${num(h.c)}" y="${yHang}">${esc(b.name)}</text>`;
      out += `<g class="h${i}"${at === 'done' ? ' opacity="0"' : ''}>${hung}</g><g class="g${i} done-label" opacity="${at === 'done' ? done.label.opacity : 0}">${hung}</g>`;
      loop += timing.keyframes(`h${i}`, (s) => (s === 'done' ? 0 : 1), i) + timing.keyframes(`g${i}`, (s) => (s === 'done' ? done.label.opacity : 0), i);
    }
    return `${out}</g>`;
  }).join('\n');
  loop += timing.marker(X);

  // The app's colours, light and dark: blocks and rows in their item colours, the completed
  // ones through the app's own filter.
  const themeCss = (/** @type {typeof light} */ c, /** @type {string} */ pre) => {
    let css = '';
    for (const t of new Set(rows.map((r) => r.theme))) {
      const k = c.themes[t];
      css += `${pre}.row.t${t} .bar { fill: ${k.border}; } ${pre}.row.t${t} .chip { fill: ${k.surface}; stroke: ${k.input}; } ${pre}.row.t${t} .name { fill: ${k.text}; }
${pre}.block.t${t} .base { fill: ${k.surface}; stroke: ${k.border}; } ${pre}.block.t${t} text { fill: ${k.text}; } ${pre}.block.t${t} .link { stroke: ${k.border}; }
${pre}.block.t${t} .active .base { fill: ${k.text}; } ${pre}.block.t${t} .active .edge { stroke: ${k.border}; } ${pre}.block.t${t} .active text { fill: ${k.surface}; }
${pre}.block.t${t} .done .base { fill: ${filtered(k.surface, done.block.filter)}; stroke: ${filtered(k.border, done.block.filter)}; } ${pre}.block.t${t} .done text { fill: ${filtered(k.text, done.block.filter)}; }
${pre}.block.t${t} .done-label text { fill: ${filtered(k.text, done.label.filter)}; } ${pre}.block.t${t} .done-label .link { stroke: ${filtered(k.border, done.label.filter)}; }
`;
    }
    return `${css}${pre}.track { fill: ${hex(rgb(c.track))}; stroke: ${hex(rgb(c.trackLine))}; } ${pre}.groove { fill: ${hex(rgb(c.progress))}; } ${pre}.fill { fill: ${hex(rgb(c.bar))}; }
${pre}.now { fill: ${c.red}; } ${pre}.guide { stroke: ${c.blue}; }
`;
  };
  return art({
    name: 'agendamatic',
    width: 420, height: 180,
    period,
    defs: gradient,
    player: 'autochair',
    body: `<g class="agenda-scene">${agenda}${tracker}${states}</g>
<g class="logo-scene"><image class="logo-still logo-light" href="agendamatic/assets/autoChair-logo-black.svg" x="328" y="50" width="86" height="73"/>
<image class="logo-still logo-dark" href="agendamatic/assets/autoChair-logo-white.svg" x="328" y="50" width="86" height="73"/>
<svg data-checkpoints="${timing.checkpoints.join(',')}" class="logo-turn" x="328" y="50" width="86" height="73" viewBox="0 0 128 108" overflow="hidden"/></g>`,
    css: `& .logo-scene { pointer-events:none; }
& .logo-turn { visibility:hidden; }
& .logo-turn[data-ready] { visibility:visible; }
& .logo-scene:has([data-ready]) .logo-still { visibility:hidden; }
& .logo-dark { display:none; }
:root[data-theme="dark"] & .logo-light { display:none; }
:root[data-theme="dark"] & .logo-dark { display:inline; }
& text { font-family: ${FONT}; font-size: ${size}px; fill: var(--art-ink); }
& .head text { font-size: 7.5px; font-weight: 700; text-decoration: underline; }
& .name { font-weight: 700; }
& .chip { stroke-width: 0.7; }
& .box { fill: var(--surface); stroke: var(--art-line); stroke-width: 0.7; }
& .time { fill: var(--art-muted); }
& .ticks { stroke: var(--art-ink); stroke-width: 0.6; }
& .axis { fill: var(--art-ink); }
& .tick { font-size: ${fs}px; font-weight: 700; text-anchor: middle; }
& .tick.minor { font-weight: 400; fill: var(--art-muted); }
& .track { stroke-width: 0.5; }
& .block .base { stroke-width: 0.9; }
& .block .edge { fill: none; stroke-width: 0.9; }
& .block text { font-size: ${fs}px; font-weight: 700; text-anchor: middle; }
& .link { fill: none; stroke-width: 0.8; stroke-linecap: round; }
& .guide { fill: none; stroke-width: 0.9; stroke-dasharray: 0.9 1.5; opacity: 0.76; }
& .marker { transform: translateX(${num(X(STILL), 3)}px); }
& .progress .fill { transform: scaleX(${num(STILL / total, 4)}); }
${themeCss(light, '& ')}${themeCss(dark, ':root[data-theme="dark"] & ')}`,
    loop,
  });
}

/**
 * The loop's clock: when each block changes state, the marker's path, and the keyframes of both.
 * Loop time 0 is STILL minutes in; the meeting runs to its end, holds, resets, waits, and runs
 * from its start back to STILL at the period.
 * @param {number[][]} span  each block's [start, end] minutes
 * @param {number} total
 */
function runTimes(span, total) {
  const end = (total - STILL) * RATE;
  const reset = end + DONE_HOLD;
  const restart = reset + 2 * RESET + START_HOLD;
  const period = restart + STILL * RATE;
  /** Loop time at minute `m` of the meeting, on the run that contains the still or the next. */
  const at = (/** @type {number} */ m) => (m >= STILL ? (m - STILL) * RATE : restart + m * RATE);
  /** @returns {State} */
  const state = (/** @type {number} */ i, /** @type {number} */ m) => (m >= span[i][1] ? 'done' : m >= span[i][0] ? 'active' : 'planned');
  const p = (/** @type {number} */ t) => num((100 * t) / period, 3);
  /**
   * Keyframes of one layer's opacity, `value` of the block's state, changing over STATE seconds
   * at each change of state and at the reset.
   * @param {string} cls @param {(s: State) => number} value @param {number} i
   */
  const keyframes = (cls, value, i) => {
    /** @type {[number, State][]} */
    const changes = [[at(span[i][0]), 'active'], [at(span[i][1]), 'done'], [reset, 'planned']];
    changes.sort((a, b) => a[0] - b[0]);
    let current = state(i, STILL);
    const stops = [`0% { opacity: ${value(current)}; }`];
    for (const [t, s] of changes) {
      const width = s === 'planned' ? RESET : STATE;
      if (t < 0.01 || t + width > period - 0.01) throw new Error('agendamatic: a state change falls on the wrap');
      if (value(s) === value(current)) { current = s; continue; }
      stops.push(`${p(t)}% { opacity: ${value(current)}; }`, `${p(t + width)}% { opacity: ${value(s)}; }`);
      current = s;
    }
    if (value(current) !== value(state(i, STILL))) throw new Error(`agendamatic: block ${i} does not come back to its still state`);
    stops.push(`100% { opacity: ${value(current)}; }`);
    return `& .${cls} { animation: agendamatic-${cls} ${num(period, 3)}s linear infinite; }
@keyframes agendamatic-${cls} { ${stops.join(' ')} }
`;
  };
  /**
   * The marker and the progress bar: on to the end, fading out at the reset, back at the start
   * while unseen, fading in, waiting, and on to the still.
   * @param {(m: number) => number} X
   */
  const marker = (X) => {
    const path = [[0, STILL, 1], [end, total, 1], [reset, total, 1], [reset + RESET, total, 0], [reset + RESET + 0.001, 0, 0], [reset + 2 * RESET, 0, 1], [restart, 0, 1], [period, STILL, 1]];
    const m = path.map(([t, min, o]) => `${p(t)}% { transform: translateX(${num(X(min), 3)}px); opacity: ${o}; }`);
    const b = path.map(([t, min, o]) => `${p(t)}% { transform: scaleX(${num(min / total, 4)}); opacity: ${o}; }`);
    return `& .marker { animation: agendamatic-marker ${num(period, 3)}s linear infinite; }
@keyframes agendamatic-marker { ${m.join(' ')} }
& .progress .fill { animation: agendamatic-progress ${num(period, 3)}s linear infinite; }
@keyframes agendamatic-progress { ${b.join(' ')} }
`;
  };
  return { period, state, keyframes, marker, checkpoints: [...new Set(span.map(s => at(s[1])).concat(restart))].sort((a,b)=>a-b) };
}
