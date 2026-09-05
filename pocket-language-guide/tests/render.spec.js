import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { planToPdf } from '../render/pdf.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { referenceSpec } from '../scripts/spec.mjs';
import { inflateSync } from 'node:zlib';
import * as fontkit from '../vendor/fontkit.esm.js';

/** Mean intensity of a PNG, 0 = black, 1 = white. More ink means a lower number. */
function meanInk(path) {
  return Number(execFileSync('convert',
    [path, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']).toString());
}

test.describe('renderers', () => {
  test('SVG and PDF put the same amount of ink on the page', async ({ page }) => {
    const ctx = await createSheetContext({
      loadText: (rel) => readFile(rel, 'utf8'),
      loadBytes: (rel) => readFile(rel),
    });
    const spec = { ...(await referenceSpec()), scale: 0 };
    const { plan } = await buildSheet(ctx, spec);
    const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
    const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));
    const stacks = stacksFor(ctx.corpus, spec.target, spec.source);
    await mkdir('tmp/spec', { recursive: true });

    // Same plan through both renderers. A glyph the PDF font subset dropped, or a
    // font the page failed to load, shows up as a difference in ink.
    const svg = planToSvg(plan, { faces: cssFaces(manifest), icons })[0];
    await page.setViewportSize({ width: Math.ceil(plan.pageW), height: Math.ceil(plan.pageH) });
    await page.goto('/index.html');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      ${fontFaceCss(manifest, stacks)}
      html,body{margin:0;padding:0;background:#fff}
      svg{display:block;width:${plan.pageW}px;height:${plan.pageH}px}
    </style>${svg}`, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await Promise.allSettled([...document.fonts].map((f) => f.load()));
      await document.fonts.ready;
    });
    const missing = await page.evaluate(
      () => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family),
    );
    expect(missing, 'every declared face should load').toEqual([]);
    await page.locator('svg').screenshot({ path: 'tmp/spec/svg-face-1.png' });

    const pdf = await planToPdf(plan, {
      loadFont: (file) => readFile(`data/fonts/${file}`), icons, date: new Date(0),
    });
    await writeFile('tmp/spec/sheet.pdf', pdf);
    execFileSync('pdftoppm', ['-r', '96', '-png', '-f', '1', '-l', '1',
      'tmp/spec/sheet.pdf', 'tmp/spec/pdf-face']);

    const svgInk = meanInk('tmp/spec/svg-face-1.png');
    const pdfInk = meanInk('tmp/spec/pdf-face-1.png');
    expect(Math.abs(svgInk - pdfInk), `svg ${svgInk} vs pdf ${pdfInk}`).toBeLessThan(0.02);
    // A blank or near-blank page would pass an equality check, so assert real ink.
    expect(svgInk).toBeLessThan(0.95);
  });

  test('the exported PDF is vector, selectable and exactly the requested size', async () => {
    const info = execFileSync('pdfinfo', ['tmp/spec/sheet.pdf']).toString();
    expect(info).toContain('Page size:       504 x 360 pts');
    // One PDF page per face, however many the content needed, and always an even
    // number because a sheet is printed on both sides.
    const pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(pages % 2).toBe(0);

    const fonts = execFileSync('pdffonts', ['tmp/spec/sheet.pdf']).toString();
    expect(fonts).toContain('CID TrueType');
    expect(fonts.split('\n').filter((l) => l.includes('yes')).length).toBeGreaterThan(2);

    const text = execFileSync('pdftotext', ['-f', '1', '-l', '1', 'tmp/spec/sheet.pdf', '-']).toString();
    expect(text).toContain('你好');
    expect(text).toContain('nǐ hǎo');
    expect(text).toContain('Social + basics');
  });
});

/** Every `x` a text-showing operation was placed at, in order. */
function drawnAt(bytes) {
  // The page's content stream is deflated -- `useObjectStreams: false` keeps the
  // object structure plain but not the streams -- so it has to be inflated before the
  // operators are readable.
  const raw = Buffer.from(bytes);
  const text = [...raw.toString('binary').matchAll(/stream\r?\n/g)]
    .map((m) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = raw.indexOf('endstream', start, 'binary');
      try {
        return inflateSync(raw.subarray(start, end)).toString('binary');
      } catch {
        return raw.subarray(start, end).toString('binary');
      }
    })
    .find((body) => body.includes('Tj')) ?? '';
  /** @type {{x:number, glyphs:string}[]} */ const out = [];
  // pdf-lib writes an uncompressed `1 0 0 1 x y Tm` before each `<...> Tj`.
  const re = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*\n?<([0-9A-Fa-f]+)> Tj/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ x: Number(m[1]), glyphs: m[3] });
  }
  return out;
}

test.describe('mark positioning in the PDF', () => {
  /**
   * **`pdf-lib` emits one `Tj` of glyph ids and no positioning**, so every GPOS
   * offset it is handed is discarded. Twenty of the twenty-two languages do not care:
   * their marks are drawn near their own origin. Hebrew's niqqud are zero-advance
   * glyphs whose outlines sit at positive x and rely wholly on the `mark` feature, so
   * the points landed under the next letter along -- on the pointed column, which is
   * the learner's column, in the artifact that gets printed.
   */
  test('a mark the shaper offset is drawn where it asked, letter by letter', async () => {
    const font = fontkit.create(await readFile('data/fonts/hebrew-400.ttf'));
    const size = 12;
    const laid = font.layout('שָׁלוֹם');
    expect(laid.positions.some((/** @type {any} */ p) => p.xOffset),
      'this string is only a test if the shaper does offset something').toBeTruthy();

    // One run, so every drawn position can be checked against the arithmetic.
    const plan = {
      pageW: 200,
      pageH: 60,
      scale: 1,
      looseness: [],
      warnings: [],
      geometry: /** @type {any} */ ({}),
      faces: [{
        rects: [],
        icons: [],
        hits: [],
        runs: [{ x: 20, y: 30, size, text: 'שָׁלוֹם', fontId: 'hebrew-400', fill: '#000000' }],
      }],
    };
    const bytes = await planToPdf(/** @type {any} */ (plan), {
      loadFont: (file) => readFile(`data/fonts/${file}`),
      icons: JSON.parse(await readFile('data/icons.json', 'utf8')),
      date: new Date(0),
    });

    // One block per *offset* glyph, plus one for each stretch of unoffset ones. On this
    // word that is all seven, because no two unpointed letters are adjacent in
    // `shalom` pointed -- the saving shows on ordinary text, not here. What matters is
    // that it is more than the single block the run would otherwise take and never
    // more than one per glyph.
    const drawn = drawnAt(bytes);
    expect(drawn.length).toBeGreaterThan(1);
    expect(drawn.length).toBeLessThanOrEqual(laid.glyphs.length);

    // Every offset glyph is drawn at exactly the position the shaper asked for.
    const em = size / font.unitsPerEm;
    let pen = 0;
    /** @type {number[]} */ const wanted = [];
    laid.positions.forEach((/** @type {any} */ pos) => {
      if (pos.xOffset || pos.yOffset) wanted.push(20 + (pen + pos.xOffset) * em);
      pen += pos.xAdvance;
    });
    for (const x of wanted) {
      expect(drawn.some((d) => Math.abs(d.x - x) < 0.01),
        `nothing was drawn at ${x.toFixed(3)}`).toBeTruthy();
    }
    // The last two glyphs of `shalom` pointed are the shin dot and the qamats, which
    // ask for +539 and +227 of an em -- more than half a letter. Dropping that is what
    // put them over the wrong consonant, and it is the number this test exists for.
    const worst = Math.max(...laid.positions.map((/** @type {any} */ p) => Math.abs(p.xOffset)));
    expect(worst, 'the offset being applied is a large one').toBeGreaterThan(400);
  });

  test('a script whose glyphs change shape in context is left whole', async () => {
    // Arabic is the counter-case and the reason the guard is a proof rather than a
    // list: drawing an Arabic glyph alone would hand back the isolated form and undo
    // the joining, so a run whose glyphs do not survive being drawn alone keeps the
    // single-call path -- and Arabic's rendering is unchanged by any of this.
    const font = fontkit.create(await readFile('data/fonts/arabic-400.ttf'));
    const text = 'مرحباً';
    const laid = font.layout(text);
    expect(laid.positions.some((/** @type {any} */ p) => p.xOffset || p.yOffset),
      'Arabic does carry offsets, so the guard is what spares it').toBeTruthy();

    const plan = {
      pageW: 200,
      pageH: 60,
      scale: 1,
      looseness: [],
      warnings: [],
      geometry: /** @type {any} */ ({}),
      faces: [{
        rects: [],
        icons: [],
        hits: [],
        runs: [{ x: 20, y: 30, size: 12, text, fontId: 'arabic-400', fill: '#000000' }],
      }],
    };
    const bytes = await planToPdf(/** @type {any} */ (plan), {
      loadFont: (file) => readFile(`data/fonts/${file}`),
      icons: JSON.parse(await readFile('data/icons.json', 'utf8')),
      date: new Date(0),
    });
    expect(drawnAt(bytes).length, 'one draw for the whole run').toBe(1);
  });

  test('a run the shaper does not offset is still one draw', async () => {
    // The short-circuit, which is what keeps this off the twenty languages that do not
    // need it: Latin, Cyrillic, Greek and all three CJK faces come back at zero offset
    // throughout, so they take the single-call path and their PDFs are byte-identical
    // to before. Measured across seven targets, `ar`, `ja` and `en` differ by zero
    // pixels at 300dpi.
    const plan = {
      pageW: 200,
      pageH: 60,
      scale: 1,
      looseness: [],
      warnings: [],
      geometry: /** @type {any} */ ({}),
      faces: [{
        rects: [],
        icons: [],
        hits: [],
        runs: [{
          x: 20, y: 30, size: 12, text: 'Where is the pharmacy?', fontId: 'latin-400', fill: '#000000',
        }],
      }],
    };
    const bytes = await planToPdf(/** @type {any} */ (plan), {
      loadFont: (file) => readFile(`data/fonts/${file}`),
      icons: JSON.parse(await readFile('data/icons.json', 'utf8')),
      date: new Date(0),
    });
    expect(drawnAt(bytes).length).toBe(1);
  });
});
