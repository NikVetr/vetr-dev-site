// Solve the reference sheet and print what the solver decided. A fast check that
// geometry, measurement, splitting, breaking and flushing all still agree.
//
//   node scripts/smoke_layout.mjs [target] [source]
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { contentBox } from '../core/solve/index.js';
import { referenceSpec } from './spec.mjs';

const [target = 'zh-Hans', source = 'en'] = process.argv.slice(2);
const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});

const spec = await referenceSpec(target, source);
const box = contentBox(spec.geometry, spec.paper);
console.log(`column ${box.colWidth.toFixed(2)}pt x ${box.height.toFixed(2)}pt`
  + '   (reference: 119.66 x 347.76)');

for (const scale of [1, 0]) {
  const t0 = performance.now();
  const { blocks, plan } = await buildSheet(ctx, { ...spec, scale });
  const ms = (performance.now() - t0).toFixed(0);
  const runs = plan.faces.reduce((n, f) => n + f.runs.length, 0);
  const rects = plan.faces.reduce((n, f) => n + f.rects.length, 0);
  console.log(`\nscale ${scale === 0 ? 'auto' : scale} -> ${plan.scale.toFixed(4)}   ${ms}ms`);
  console.log(`  blocks ${blocks.length}  faces ${plan.faces.length}  runs ${runs}  rects ${rects}`);
  console.log(`  residual slack per column: ${plan.looseness.map((r) => r.toFixed(1)).join(' ')}`);
  for (const w of plan.warnings) console.log(`  [${w.severity}] ${w.code}: ${w.message}`);
}
console.log('\nmeasure cache:', ctx.measurer.stats());
