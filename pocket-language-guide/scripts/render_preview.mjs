// Solve a sheet and rasterise each face to PNG via headless Chromium.
//
//   node scripts/render_preview.mjs [--target zh-Hans] [--source en] [--scale auto]
//                                   [--out tmp/preview] [--dpi 200]
//
// This is the same SVG the browser exports, rendered through the same engine, so
// it doubles as the eyeball check during development and the basis for the visual
// regression specs.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { openLocalPage } from './local_page.mjs';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { referenceSpec } from './spec.mjs';

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string,string>} */ const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const outDir = args.out ?? 'tmp/preview';
const dpi = Number(args.dpi ?? 200);
const geometry = args.geometry;

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});

const base = await referenceSpec(args.target ?? 'zh-Hans', args.source ?? 'en');
if (geometry) {
  const presets = JSON.parse(await readFile('data/presets.json', 'utf8'));
  if (!presets.geometry[geometry]) throw new Error(`no geometry preset "${geometry}"`);
  base.geometry = { ...presets.geometry[geometry] };
}
const spec = {
  ...base,
  themeId: args.theme ?? base.themeId,
  padding: args.padding === undefined ? base.padding : Number(args.padding),
  arrangement: /** @type {any} */ (args.arrangement ?? base.arrangement),
  scale: args.scale === 'auto' ? 0 : Number(args.scale ?? 1),
};

const t0 = performance.now();
const { plan } = await buildSheet(ctx, spec);
console.log(`solved in ${(performance.now() - t0).toFixed(0)}ms  scale ${plan.scale.toFixed(4)}`);
for (const w of plan.warnings) console.log(`  [${w.severity}] ${w.code}: ${w.message}`);
if (!plan.faces.length) process.exit(1);

const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
const stacks = stacksFor(ctx.corpus, spec.target, spec.source);
const svgs = planToSvg(plan, {
  faces: cssFaces(manifest),
  icons: JSON.parse(await readFile('data/icons.json', 'utf8')),
});

await mkdir(outDir, { recursive: true });
const local = await openLocalPage({ deviceScaleFactor: dpi / 72 });
await local.page.setViewportSize({
  width: Math.ceil(plan.pageW), height: Math.ceil(plan.pageH),
});
for (const [i, svg] of svgs.entries()) {
  await writeFile(`${outDir}/face-${i + 1}.svg`, svg);
  await local.show(`<!doctype html><meta charset="utf-8"><style>
    ${fontFaceCss(manifest, stacks)}
    html,body{margin:0;padding:0;background:#fff}
    svg{display:block;width:${plan.pageW}px;height:${plan.pageH}px}
  </style>${svg}`);
  await local.page.locator('svg').screenshot({ path: `${outDir}/face-${i + 1}.png` });
  console.log(`  ${outDir}/face-${i + 1}.png`);
}
await local.close();
