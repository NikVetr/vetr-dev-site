// Pre-render the default pack for every language pair that has content.
//
//   npm run prerender
//
// Writes packs/<target>__<source>/{sheet.pdf, face-N.png, thumb.png, pack.json}.
// The gallery is built from these, so it loads instantly and offline without
// touching the solver, the fonts or the corpus.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { planToPdf } from '../render/pdf.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { openLocalPage } from './local_page.mjs';
import { referenceSpec } from './spec.mjs';

const THUMB_WIDTH = 480;
const FACE_DPI = 144;
// Pinned so re-running the script does not churn the committed PDFs.
const PACK_DATE = new Date('2026-01-01T00:00:00Z');

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));

/** Pairs worth shipping: both sides need enough content to render. */
const usable = Object.values(ctx.corpus.languages).filter((l) => l.status === 'ready');
/** @type {{target:string, source:string}[]} */ const pairs = [];
for (const target of usable) {
  for (const source of usable) {
    if (target.bcp47 !== source.bcp47) pairs.push({ target: target.bcp47, source: source.bcp47 });
  }
}
if (!pairs.length) throw new Error('no language pair has content on both sides');

const local = await openLocalPage({ deviceScaleFactor: FACE_DPI / 72 });
/** @type {any[]} */ const index = [];

for (const { target, source } of pairs) {
  const dir = `packs/${target}__${source}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const spec = {
    ...(await referenceSpec(target, source)),
    // The country a language is most associated with, for local emergency numbers.
    region: (ctx.corpus.languages[target].regions || '').split(';')[0] ?? '',
    scale: 0,
  };
  const { plan } = await buildSheet(ctx, spec);
  const errors = plan.warnings.filter((w) => w.severity === 'error');
  if (errors.length) throw new Error(`${dir}: ${errors.map((e) => e.message).join('; ')}`);

  const pdf = await planToPdf(plan, {
    loadFont: (file) => readFile(`data/fonts/${file}`),
    icons,
    title: `${ctx.corpus.languages[target].exonym_en} pocket guide`,
    language: source,
    date: PACK_DATE,
  });
  await writeFile(`${dir}/sheet.pdf`, pdf);

  const stacks = stacksFor(ctx.corpus, target, source);
  const svgs = planToSvg(plan, { faces: cssFaces(manifest), icons });
  await local.page.setViewportSize({
    width: Math.ceil(plan.pageW), height: Math.ceil(plan.pageH),
  });
  for (const [i, svg] of svgs.entries()) {
    await local.show(`<!doctype html><meta charset="utf-8"><style>
      ${fontFaceCss(manifest, stacks)}
      html,body{margin:0;padding:0;background:#fff}
      svg{display:block;width:${plan.pageW}px;height:${plan.pageH}px}
    </style>${svg}`);
    await local.page.locator('svg').screenshot({ path: `${dir}/face-${i + 1}.png` });
    if (i === 0) {
      await local.page.locator('svg').screenshot({
        path: `${dir}/thumb.png`, scale: 'css', style: `svg{width:${THUMB_WIDTH}px;height:auto}`,
      });
    }
  }

  const meta = {
    target,
    source,
    scale: Number(plan.scale.toFixed(4)),
    faces: plan.faces.length,
    pageW: plan.pageW,
    pageH: plan.pageH,
    items: plan.faces.reduce((n, f) => n + f.hits.filter((h) => h.conceptId).length, 0),
    warnings: plan.warnings,
  };
  await writeFile(`${dir}/pack.json`, `${JSON.stringify(meta, null, 2)}\n`);
  index.push(meta);
  console.log(`${dir}  ${meta.faces} faces  ${meta.items} items  `
    + `scale ${meta.scale}  pdf ${(pdf.length / 1024).toFixed(0)} KB`);
}

await local.close();
await writeFile('packs/index.json', `${JSON.stringify({ packs: index }, null, 2)}\n`);
console.log(`packs/index.json  ${index.length} pack(s)`);
