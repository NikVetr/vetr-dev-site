import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { planToPdf } from '../render/pdf.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { referenceSpec } from '../scripts/spec.mjs';

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
