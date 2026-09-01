// Pre-render a gallery thumbnail for every language pair that has content.
//
//   npm run prerender
//
// Writes packs/<target>__<source>/thumb.png plus packs/index.json. The gallery is
// built from these, so it loads instantly and offline without touching the solver,
// the fonts or the corpus.
//
// It used to also commit sheet.pdf and a full-resolution PNG per face. Nothing read
// them -- the gallery's Export button goes to sheet.html, which solves and exports
// in the browser, because client-side export is the whole architecture -- and they
// cost 13MB across six pairs. Twelve ready languages make 132 ordered pairs, which
// would have been half a gigabyte of unread binaries in the repository.
//
// Even the thumbnails grow as the square of the language count, so
// `scripts/optimize_thumbs.py` runs after this one (via the `postprerender` hook)
// and reindexes each screenshot to an exact palette: 16.4MB becomes 5.0MB.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { openLocalPage } from './local_page.mjs';
import { referenceSpec } from './spec.mjs';

const THUMB_WIDTH = 480;

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));

await rm('packs', { recursive: true, force: true });

/** Pairs worth shipping: both sides need enough content to render. */
const usable = Object.values(ctx.corpus.languages).filter((l) => l.status === 'ready');
/** @type {{target:string, source:string}[]} */ const pairs = [];
for (const target of usable) {
  for (const source of usable) {
    if (target.bcp47 !== source.bcp47) pairs.push({ target: target.bcp47, source: source.bcp47 });
  }
}
if (!pairs.length) throw new Error('no language pair has content on both sides');

const local = await openLocalPage({ deviceScaleFactor: 2 });
/** @type {any[]} */ const index = [];

for (const { target, source } of pairs) {
  const dir = `packs/${target}__${source}`;
  await mkdir(dir, { recursive: true });

  const spec = { ...(await referenceSpec(target, source)), scale: 0 };
  const { plan } = await buildSheet(ctx, spec);
  const errors = plan.warnings.filter((w) => w.severity === 'error');
  if (errors.length) throw new Error(`${dir}: ${errors.map((e) => e.message).join('; ')}`);

  const stacks = stacksFor(ctx.corpus, target, source);
  const svgs = planToSvg(plan, { faces: cssFaces(manifest), icons });
  await local.page.setViewportSize({
    width: Math.ceil(plan.pageW), height: Math.ceil(plan.pageH),
  });
  // Only the first face: the thumbnail is a glance at what the card looks like.
  await local.show(`<!doctype html><meta charset="utf-8"><style>
    ${fontFaceCss(manifest, stacks)}
    html,body{margin:0;padding:0;background:#fff}
    svg{display:block;width:${plan.pageW}px;height:${plan.pageH}px}
  </style>${svgs[0]}`);
  await local.page.locator('svg').screenshot({
    path: `${dir}/thumb.png`, scale: 'css', style: `svg{width:${THUMB_WIDTH}px;height:auto}`,
  });

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
  index.push(meta);
  console.log(`${dir}  ${meta.faces} faces  ${meta.items} items  scale ${meta.scale}`);
}

await local.close();
await writeFile('packs/index.json', `${JSON.stringify({ packs: index }, null, 2)}\n`);
console.log(`packs/index.json  ${index.length} pack(s)`);
