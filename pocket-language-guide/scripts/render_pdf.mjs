// Solve a sheet and write a vector PDF.
//
//   node scripts/render_pdf.mjs [--target zh-Hans] [--source en] [--scale auto]
//                               [--geometry card-7x5-4col] [--out tmp/sheet.pdf]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { planToPdf } from '../render/pdf.js';
import { referenceSpec } from './spec.mjs';

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string,string>} */ const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const out = args.out ?? 'tmp/sheet.pdf';

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});

const base = await referenceSpec(args.target ?? 'zh-Hans', args.source ?? 'en');
if (args.geometry) {
  const presets = JSON.parse(await readFile('data/presets.json', 'utf8'));
  if (!presets.geometry[args.geometry]) throw new Error(`no geometry preset "${args.geometry}"`);
  base.geometry = { ...presets.geometry[args.geometry] };
}
const spec = { ...base, scale: args.scale === 'auto' ? 0 : Number(args.scale ?? 1) };

const { plan } = await buildSheet(ctx, spec);
for (const w of plan.warnings) console.log(`  [${w.severity}] ${w.code}: ${w.message}`);
if (!plan.faces.length) process.exit(1);

const bytes = await planToPdf(plan, {
  loadFont: (file) => readFile(`data/fonts/${file}`),
  icons: JSON.parse(await readFile('data/icons.json', 'utf8')),
  title: `${ctx.corpus.languages[spec.target].exonym_en} pocket guide`,
  language: spec.source,
});
await mkdir(dirname(out), { recursive: true });
await writeFile(out, bytes);
console.log(`${out}  ${(bytes.length / 1024).toFixed(0)} KB  `
  + `${plan.faces.length} faces  scale ${plan.scale.toFixed(4)}`);
