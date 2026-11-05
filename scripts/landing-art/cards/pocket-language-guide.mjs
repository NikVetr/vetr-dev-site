// Pocket Language Guide (Wanderwart): the top of a pocket card's first section, Social + basics,
// for an English reader, as the app prints it: five greetings, each bold in the target's own
// script with its romanisation under it, and at the other end of the row the English gloss with
// the app's respelling under it (a right-to-left target takes the far end, as on the card). Rows:
// the app's own (core/content.js, its default card for the pair), the type sizes and spacing those
// of its reference theme magnified 1.6 times, the colours its reference theme's, or its dark
// theme's under the dark site theme. Over the section's rule, the language's own name.
// The loop turns the card through seven languages and back to Japanese, the still: each fades out
// and the next fades in while the card's frame stays put.
import { readFile } from 'node:fs/promises';
import { buildContent } from '../../../pocket-language-guide/core/content.js';
import { resolveField } from '../../../pocket-language-guide/core/fonts.js';
import { defaultFieldSet, defaultSelection } from '../../../pocket-language-guide/core/pack.js';
import { createSheetContext, loadFontsFor } from '../../../pocket-language-guide/core/sheet.js';
import { art, esc, num } from '../svg.mjs';

const LANGS = ['ja', 'hi', 'ar', 'ru', 'th', 'ka', 'zh-Hans'];
const SECTION = 'social-basics';
const CONCEPTS = ['hello', 'good-morning', 'good-evening', 'goodbye', 'thank-you'];
const K = 1.6;        // canvas units per point of the card
const HOLD = 0.95;    // seconds each language is on the card, fades included
const FADE = 0.12;    // seconds to fade out, and again to fade in
// The column, the paper around it and the rows' height and baselines, in canvas units.
const [PAPER_X, PAPER_W, PAPER_PAD] = [10, 300, 7];
const [COL_L, COL_R] = [PAPER_X + 8, PAPER_X + PAPER_W - 8];
const ROW_H = 25.4;
const [BASE_1, BASE_2] = [12.6, 22.7];
const SLACK = 0.8;    // a row's two ends may take this much of its width, by the app's own fonts

const ROOT = new URL('../../../pocket-language-guide/', import.meta.url);

/** @typedef {'script'|'roman'|'gloss'|'respell'} Field */

/**
 * The app's default card for `target` read by an English speaker: scripts/spec.mjs's reference
 * sheet, with only the fields that decide its content (buildContent reads no others).
 * @param {any} corpus @param {string} target
 * @returns {import('../../../pocket-language-guide/core/types.js').SheetSpec}
 */
function specFor(corpus, target) {
  const lang = corpus.languages[target];
  if (!lang) throw new Error(`pocket-language-guide: unknown language ${target}`);
  return /** @type {any} */ ({
    target,
    source: 'en',
    accent: corpus.languages.en.default_accent,
    romanization: (lang.romanizations || '').split(';').filter(Boolean)[0] ?? '',
    register: 'neutral',
    region: (lang.regions || '').split(';').filter(Boolean)[0] ?? '',
    fieldSet: defaultFieldSet(lang),
    selection: defaultSelection({ sections: corpus.sections }),
    priority: 0,
  });
}

export async function build() {
  const ctx = await createSheetContext({
    loadText: (rel) => readFile(new URL(rel, ROOT), 'utf8'),
    loadBytes: (rel) => readFile(new URL(rel, ROOT)),
  });
  const { corpus, measurer } = ctx;
  const light = await ctx.theme('latex-reference');
  const dark = await ctx.theme('dark');
  const entry = light.templates.entry;
  const field = (/** @type {string} */ id) => {
    const f = entry.fields.find((/** @type {any} */ x) => x.field === id);
    if (!f) throw new Error(`pocket-language-guide: the entry template has no ${id} field`);
    return f;
  };
  const style = { script: field('script'), roman: field('roman'), gloss: field('gloss'), respell: field('respell') };
  const heading = light.headings['1'];
  const icons = JSON.parse(await readFile(new URL('data/icons.json', ROOT), 'utf8'));

  // Each language's rows for the five greetings, as its card has them.
  let title = '';
  let icon = '';
  const cards = [];
  for (const target of LANGS) {
    const spec = specFor(corpus, target);
    const { blocks } = await buildContent(ctx, spec);
    const head = blocks.find((b) => b.kind === 'heading' && b.sectionId === SECTION);
    if (!head?.text || !head.icon) throw new Error(`pocket-language-guide: ${target} has no ${SECTION} heading`);
    title = head.text;
    icon = head.icon;
    const rows = blocks.filter((b) => b.kind === 'items' && b.sectionId === SECTION).flatMap((b) => b.rows ?? []);
    const picked = CONCEPTS.map((c) => {
      const row = rows.find((r) => r.conceptId === `${SECTION}.${c}`);
      const v = row?.values ?? {};
      if (!v.script || !v.roman || !v.gloss || !v.respell) throw new Error(`pocket-language-guide: ${target} has no full row for ${c}`);
      // A merged row lists its concepts' glosses with slashes, which the card should not show.
      if ([v.gloss, v.respell].some((s) => s.includes(' / '))) throw new Error(`pocket-language-guide: ${target}'s ${c} row has alternatives`);
      return { script: v.script, roman: v.roman, gloss: v.gloss, respell: v.respell };
    });
    const lang = corpus.languages[target];
    const script = corpus.scripts[lang.script];
    await loadFontsFor(ctx, target, 'en');
    cards.push({ target, endonym: lang.endonym, rtl: script.direction === 'rtl', iso: lang.script, rows: picked });
  }

  const size = (/** @type {{size:number}} */ f) => f.size * K;
  const left = COL_L + entry.pad[3] * K;
  const right = COL_R - entry.pad[1] * K;
  // A row's two ends, by the app's own measure of its fonts, must leave room for the
  // system fonts the picture is drawn in.
  const width = (/** @type {string} */ text, /** @type {Field} */ f, /** @type {string} */ iso) => {
    const { stack, dir } = resolveField(f, iso, 'Latn', corpus.scripts);
    const s = style[f];
    return measurer.width(text, {
      stack, weight: s.bold ? 700 : 400, italic: s.italic, size: size(s), leading: s.leading * K,
      dir, wordBreak: /** @type {any} */ (corpus.scripts[iso].word_break || 'space'), slotAsRule: false,
    });
  };
  for (const c of cards) {
    for (const r of c.rows) {
      for (const [a, b] of /** @type {[Field, Field][]} */ ([['script', 'gloss'], ['roman', 'respell']])) {
        const used = width(r[a], a, c.iso) + width(r[b], b, c.iso) + entry.colGap * K;
        if (used > SLACK * (right - left)) throw new Error(`pocket-language-guide: ${c.target}'s "${r[a]}" row is too wide for the card`);
      }
    }
  }

  // The section heading: its icon, its title in the reader's language, its rule.
  const headSize = heading.size * K;
  const headTop = headSize * 0.8;
  const paperH = 2 * PAPER_PAD + headTop + (heading.gapBeforeRule + heading.rulePt + heading.gapAfterRule) * K + 0.25 * headSize + CONCEPTS.length * ROW_H;
  if (paperH > 176) throw new Error('pocket-language-guide: the rows do not fit the canvas');
  const paperY = (180 - paperH) / 2;
  const headBase = paperY + PAPER_PAD + headTop;
  const iconSize = heading.iconSize * K;
  const iconY = headBase + 0.08 * headSize - iconSize;
  const ruleY = headBase + heading.gapBeforeRule * K + 0.25 * headSize;
  const rowsY = ruleY + heading.rulePt * K + heading.gapAfterRule * K;
  const iconPaths = icons.paths[icon];
  if (!iconPaths) throw new Error(`pocket-language-guide: no icon ${icon}`);
  const k = iconSize / icons.viewBox;

  let frame = `<rect class="paper" x="${PAPER_X}" y="${num(paperY)}" width="${PAPER_W}" height="${num(paperH)}" rx="3"/>
<g class="icon" transform="translate(${num(COL_L)} ${num(iconY)}) scale(${num(k, 3)})" stroke-width="${icons.strokeWidth}">${iconPaths.map((/** @type {string} */ d) => `<path d="${d}"/>`).join('')}</g>
<text class="h" x="${num(COL_L + iconSize + heading.iconGap * K)}" y="${num(headBase)}">${esc(title)}</text>
<rect class="accent" x="${COL_L}" y="${num(ruleY)}" width="${COL_R - COL_L}" height="${num(heading.rulePt * K, 2)}"/>
`;
  for (let i = 0; i < CONCEPTS.length; i++) {
    const y = rowsY + i * ROW_H;
    if (entry.shadeAlternate && i % 2) frame += `<rect class="shade" x="${COL_L}" y="${num(y)}" width="${COL_R - COL_L}" height="${num(ROW_H)}"/>`;
    frame += `<rect class="accent" x="${COL_L}" y="${num(y)}" width="${num(entry.accentPt * K, 2)}" height="${num(ROW_H)}"/>`;
    frame += `<rect class="rule" x="${COL_L}" y="${num(y + ROW_H - entry.rulePt * K)}" width="${COL_R - COL_L}" height="${num(entry.rulePt * K, 2)}"/>\n`;
  }

  // One group of text per language, the first showing at rest. That one is a layer of its own at
  // rest too (will-change), as the loop makes every group: otherwise Chromium draws its text a
  // subpixel apart when the loop starts.
  const period = LANGS.length * HOLD;
  const shift = (HOLD - 2 * FADE) / 2;   // the still is the middle of Japanese's time on the card
  const text = (/** @type {string} */ cls, /** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ s) => `<text class="${cls}" x="${num(x)}" y="${num(y)}">${esc(s)}</text>`;
  const langs = cards.map((c, i) => {
    const delay = ((((i * HOLD - shift) % period) + period) % period) - period;
    /** @type {[Field, Field][]} the start and end of each line */
    const lines = c.rtl ? [['gloss', 'script'], ['respell', 'roman']] : [['script', 'gloss'], ['roman', 'respell']];
    const rows = c.rows.map((row, j) => lines.map(([a, b], k) => {
      const y = rowsY + j * ROW_H + (k ? BASE_2 : BASE_1);
      return text(a, left, y, row[a]) + text(`${b} e`, right, y, row[b]);
    }).join('')).join('');
    return `<g class="lang${i ? '' : ' still'}" lang="${c.target}" style="animation-delay:${num(delay, 3)}s">${text('n e', COL_R, headBase, c.endonym)}${rows}</g>`;
  });

  const c = (/** @type {any} */ t) => t.colors;
  const p = (/** @type {number} */ t) => num((100 * t) / period, 3);
  const font = 'ui-sans-serif, system-ui, sans-serif';
  return art({
    name: 'pocket-language-guide',
    period,
    body: `${frame}${langs.join('\n')}`,
    css: `& .paper { fill: ${c(light).paper}; stroke: var(--art-line); stroke-width: 0.8; }
& .shade { fill: ${c(light).shade}; }
& .rule { fill: ${c(light).rule}; }
& .accent { fill: ${c(light).roles.comm}; }
& .icon { fill: none; stroke: ${c(light).roles.comm}; stroke-linecap: ${icons.linecap}; stroke-linejoin: ${icons.linejoin}; }
& text { fill: ${c(light).ink}; font-family: ${font}; }
& .h { font-size: ${num(headSize, 2)}px; font-weight: 700; }
& .n { font-size: ${num(size(style.gloss) * 0.85, 2)}px; font-weight: 700; fill: ${c(light).muted}; }
& .script { font-size: ${num(size(style.script), 2)}px; font-weight: 700; }
& .roman { font-size: ${num(size(style.roman), 2)}px; font-style: italic; }
& .gloss { font-size: ${num(size(style.gloss), 2)}px; font-weight: 700; }
& .respell { font-size: ${num(size(style.respell), 2)}px; font-style: italic; fill: ${c(light).muted}; }
& .e { text-anchor: end; }
& .lang + .lang { opacity: 0; }
& .still { will-change: opacity; }
:root[data-theme="dark"] & .paper { fill: ${c(dark).paper}; }
:root[data-theme="dark"] & .shade { fill: ${c(dark).shade}; }
:root[data-theme="dark"] & .rule { fill: ${c(dark).rule}; }
:root[data-theme="dark"] & .accent { fill: ${c(dark).roles.comm}; }
:root[data-theme="dark"] & .icon { stroke: ${c(dark).roles.comm}; }
:root[data-theme="dark"] & text { fill: ${c(dark).ink}; }
:root[data-theme="dark"] & .n, :root[data-theme="dark"] & .respell { fill: ${c(dark).muted}; }`,
    // Each language: on the card, fading out, off, and fading in just before its turn.
    loop: `& .lang { animation: pocket-language-guide-lang ${num(period, 3)}s linear infinite; }
@keyframes pocket-language-guide-lang { 0% { opacity: 1; } ${p(HOLD - 2 * FADE)}% { opacity: 1; } ${p(HOLD - FADE)}% { opacity: 0; } ${p(period - FADE)}% { opacity: 0; } 100% { opacity: 1; } }`,
  });
}
