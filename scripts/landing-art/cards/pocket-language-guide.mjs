// Wanderwart: real button → question → reply-grid → answer exchanges, followed by a short printable-card view.
import { readFile } from 'node:fs/promises';
import { buildContent } from '../../../pocket-language-guide/core/content.js';
import { resolveField } from '../../../pocket-language-guide/core/fonts.js';
import { defaultFieldSet, defaultSelection } from '../../../pocket-language-guide/core/pack.js';
import { createSheetContext, loadFontsFor } from '../../../pocket-language-guide/core/sheet.js';
import { openPage } from '../browser.mjs';
import { art, esc, num } from '../svg.mjs';

const LANGS = ['ja'];
const SECTION = 'social-basics';
const CONCEPTS = ['hello', 'good-morning', 'good-evening', 'goodbye', 'thank-you'];
const K = 1.6;        // canvas units per point of the card
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

  const period = 19;
  const text = (/** @type {string} */ cls, /** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ s) => `<text class="${cls}" x="${num(x)}" y="${num(y)}">${esc(s)}</text>`;
  const langs = cards.map((c, i) => {
    /** @type {[Field, Field][]} the start and end of each line */
    const lines = c.rtl ? [['gloss', 'script'], ['respell', 'roman']] : [['script', 'gloss'], ['roman', 'respell']];
    const rows = c.rows.map((row, j) => lines.map(([a, b], k) => {
      const y = rowsY + j * ROW_H + (k ? BASE_2 : BASE_1);
      return text(a, left, y, row[a]) + text(`${b} e`, right, y, row[b]);
    }).join('')).join('');
    return `<g class="lang${i ? '' : ' still'}" lang="${c.target}">${text('n e', COL_R, headBase, c.endonym)}${rows}</g>`;
  });

  const c = (/** @type {any} */ t) => t.colors;
  const font = 'ui-sans-serif, system-ui, sans-serif';
  const conversation = await conversePreview(period);
  return art({
    name: 'pocket-language-guide',
    period,
    body: `<g class="print-view">${frame}${langs.join('\n')}</g>${conversation.body}`,
    css: `& .print-view { opacity:0; }
& .paper { fill: ${c(light).paper}; stroke: var(--art-line); stroke-width: 0.8; }
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
:root[data-theme="dark"] & .n, :root[data-theme="dark"] & .respell { fill: ${c(dark).muted}; }
${conversation.css}`,
    loop: `${conversation.loop}
& .print-view { animation:pocket-language-guide-print ${period}s linear infinite; }
@keyframes pocket-language-guide-print { 0%,88.4%,100% { opacity:0; } 89.5%,98.5% { opacity:1; } }`,
  });
}

/** Read the actual question, listener-side choices and translated reply for two exchanges. */
async function conversePreview(/** @type {number} */ period) {
  const { page, errors, close } = await openPage('pocket-language-guide/conversation.html?target=ja&source=en&board=intro');
  try {
    await page.waitForSelector('#board-grid [data-button="hello"]');
    const ids = ['hello','doyou','slowly','write','thanks','bye'];
    /** @type {string[]} */
    const buttons = await page.evaluate((/** @type {string[]} */ ids) => ids.map(id => {
      const el = document.querySelector(`#board-grid [data-button="${id}"] .board-cell-label`);
      if (!el?.textContent) throw new Error(`Missing Converse button ${id}`);
      return el.textContent;
    }), ids);
    const palette = () => page.evaluate(() => {
      const style = (/** @type {string} */ selector) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`Missing Converse element ${selector}`);
        return getComputedStyle(el);
      };
      const button = style('#board-grid [data-button="hello"]');
      const stage = style('#board-stage');
      return { fill:button.backgroundColor, border:button.borderColor, ink:button.color,
        paper:getComputedStyle(document.body).backgroundColor, stage:stage.backgroundColor,
        messageInk:style('.board-message-text').color };
    });
    const message = () => page.evaluate(() => ({
      text:document.querySelector('.board-message-text')?.textContent ?? '',
      gloss:document.querySelector('.gloss-own')?.textContent ?? '',
      say:document.querySelector('.gloss-say')?.textContent ?? '',
      reply:document.querySelector('.board-reply')?.textContent?.trim() ?? '',
    }));
    /** @type {{question:Awaited<ReturnType<typeof message>>,response:Awaited<ReturnType<typeof message>>,answers:string[],choice:number}[]} */
    const exchanges = [];
    let light, dark;
    for (const [button, choice] of [['doyou',2],['slowly',0]]) {
      await page.locator(`#board-grid [data-button="${button}"]`).click();
      const question = await message();
      light ??= await palette();
      await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
      dark ??= await palette();
      await page.evaluate(() => delete document.documentElement.dataset.theme);
      await page.locator('.board-reply').click();
      const answers = await page.locator('.board-answer').allTextContents();
      await page.locator('.board-answer').nth(Number(choice)).click();
      const response = await message();
      if (!question.text || !response.text || answers.length < 2) throw new Error('Incomplete Converse exchange');
      exchanges.push({ question, answers, response, choice:Number(choice) });
      await page.locator('.board-message').click();
    }
    if (!light || !dark) throw new Error('Missing Converse theme colours');
    if (errors.length) throw new Error(`Converse preview: ${errors.join('; ')}`);
    const lines = (/** @type {string} */ text, /** @type {number} */ limit) => {
      const words = /[\u3000-\u9fff]/u.test(text) ? [...text] : text.split(' ');
      const space = words.length && words[0].length === 1 && /[\u3000-\u9fff]/u.test(text) ? '' : ' ';
      const result = [];
      for (const word of words) {
        if (result.length && (result.at(-1) + space + word).length <= limit) result[result.length-1] += space + word;
        else result.push(word);
      }
      return result;
    };
    const text = (/** @type {string} */ cls, /** @type {string} */ value, /** @type {number} */ x, /** @type {number} */ y, limit=25, pitch=17) => {
      const rows = lines(value,limit);
      return `<text class="${cls}" x="${x}" y="${y-(rows.length-1)*pitch/2}">${rows.map((r,i)=>`<tspan x="${x}" dy="${i?pitch:0}">${esc(r)}</tspan>`).join('')}</text>`;
    };
    const background = '<rect class="converse-paper" x="5" y="4" width="310" height="172" rx="4"/>';
    const board = (/** @type {number} */ selected) => background + text('converse-heading','Converse · English → 日本語',160,21,40) + buttons.map((label,i)=>{
      const x=11+(i%2)*152,y=34+Math.floor(i/2)*45;
      return `<rect class="converse-cell${i===selected?' selected':''}" x="${x}" y="${y}" width="146" height="39" rx="5"/>${text('converse-label',label,x+73,y+20,20,14)}`;
    }).join('');
    const phrase = (/** @type {Awaited<ReturnType<typeof message>>} */ m, incoming=false) => `<rect class="message-paper${incoming?' incoming':''}" x="5" y="4" width="310" height="172" rx="4"/>`
      + text('message-script',m.text,160,65,15,28) + text('message-gloss',m.gloss,160,125,36,17)
      + text('message-respell',m.say,160,151,45,13)
      + (m.reply?text('reply-control',m.reply,280,101,12,13):'');
    const answers = (/** @type {typeof exchanges[number]} */ exchange) => background + text('asked',exchange.question.text,160,21,22,16)
      + exchange.answers.map((label,i)=>{
        const x=11+(i%2)*152,y=39+Math.floor(i/2)*44;
        // The app's choice label starts with its keyboard shortcut.
        label=label.replace(/^\s*\d+\s*/,'');
        return `<rect class="converse-cell${i===exchange.choice?' selected':''}" x="${x}" y="${y}" width="146" height="38" rx="5"/>${text('answer-label',label,x+73,y+19,11,16)}`;
      }).join('');
    /** @type {[number,number,string][]} */
    const scenes = [
      [0,2.2,board(1)], [2.2,4.2,phrase(exchanges[0].question)],
      [4.2,7,answers(exchanges[0])], [7,8.8,phrase(exchanges[0].response,true)],
      [8.8,11,board(2)], [11,13,phrase(exchanges[1].question)],
      [13,15.2,answers(exchanges[1])], [15.2,16.8,phrase(exchanges[1].response,true)],
    ];
    let loop = '';
    const percent = (/** @type {number} */ t) => num(100*t/period,3);
    const body = scenes.map(([start,end,body],i)=>{
      const a=Number(start),b=Number(end);
      const stops=i===0?`0% {opacity:1;} ${percent(b-.15)}% {opacity:1;} ${percent(b)}%,99.2% {opacity:0;} 100% {opacity:1;}`:
        `0%,${percent(a-.15)}%,${percent(b)}%,100% {opacity:0;} ${percent(a)}%,${percent(b-.15)}% {opacity:1;}`;
      loop+=`& .conversation-${i} {animation:pocket-language-guide-scene-${i} ${period}s linear infinite;}\n@keyframes pocket-language-guide-scene-${i} {${stops}}\n`;
      return `<g class="conversation conversation-${i}">${body}</g>`;
    }).join('');
    const colours = (/** @type {Awaited<ReturnType<typeof palette>>} */ c, /** @type {string} */ pre) => `${pre}.converse-paper {fill:${c.paper};}
${pre}.converse-cell {fill:${c.fill};stroke:${c.border};stroke-width:.8;}
${pre}.selected {stroke:${c.ink};stroke-width:1.8;}
${pre}.conversation text {fill:${c.ink};}
${pre}.message-paper {fill:${c.stage};}
${pre}.incoming {fill:${c.fill};}
${pre}.message-script,${pre}.message-gloss,${pre}.message-respell {fill:${c.messageInk};}`;
    return { body, loop, css:`& .conversation {opacity:0;} & .conversation-0 {opacity:1;}
& .conversation text {text-anchor:middle;dominant-baseline:central;font-family:ui-sans-serif,system-ui,sans-serif;}
& .converse-label {font-size:12px;} & .converse-heading {font-size:13px;font-weight:700;}
& .answer-label {font-size:13px;} & .asked {font-size:15px;font-weight:600;}
& .message-script {font-size:25px;font-weight:600;} & .message-gloss {font-size:15px;font-weight:600;}
& .message-respell,& .reply-control {font-size:11px;}
${colours(light,'& ')}\n${colours(dark,':root[data-theme="dark"] & ')}` };
  } finally { await close(); }
}
