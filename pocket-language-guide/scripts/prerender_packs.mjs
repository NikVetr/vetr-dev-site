// Pre-render a gallery thumbnail for every language pair that has content.
//
//   npm run prerender
//
// Writes packs/<target>__<source>/thumb.png and face-1.svg.gz, plus packs/index.json.
// The gallery is built from these, so it loads instantly and offline without touching
// the solver, the fonts or the corpus.
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
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
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


/** Pairs worth shipping: both sides need enough content to render. */
const usable = Object.values(ctx.corpus.languages).filter((l) => l.status === 'ready');
// `--only <code>` renders one target's row of the matrix; `--force` re-renders pairs
// that already have a thumbnail. Adding one language to fifty-three used to mean
// rendering all 2,756 pairs again to get its 52.
const arg = (/** @type {string} */ flag) => (
  process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null);
const only = arg('--only');
const force = process.argv.includes('--force');
// `--jobs N` splits the pairs over N processes. The solve is single-threaded
// arithmetic, so one process left every other core idle and a full re-render after
// a corpus change took the better part of two hours. Each child renders every Nth
// pair (`--shard k/N`) and hands back what it rendered; this process writes the
// index in pair order, so it is the same file a single process writes.
const jobs = Number(arg('--jobs') ?? 1);
const shard = arg('--shard');
// A full forced run starts clean, so a pair that no longer exists leaves no pack
// behind. A partial run never wipes: the other 2,700 packs are the point of it.
if (force && !only && !shard) await rm('packs', { recursive: true, force: true });
/** @type {{target:string, source:string}[]} */ const pairs = [];
for (const target of usable) {
  if (only && target.bcp47 !== only) continue;
  // A source is a reader's own language, which Morse -- learnt, never spoken, and
  // so without an "I speak" label -- is not.
  for (const source of usable.filter((l) => l.speak_label)) {
    if (target.bcp47 !== source.bcp47) pairs.push({ target: target.bcp47, source: source.bcp47 });
  }
}
if (!pairs.length) throw new Error('no language pair has content on both sides');

// A partial run keeps the index entries of every pack it did not touch; a full
// forced run starts from nothing, as it does with the directory.
/** @type {any[]} */ const prior = (force && !only) || !existsSync('packs/index.json')
  ? [] : JSON.parse(await readFile('packs/index.json', 'utf8')).packs;
const key = (/** @type {{target:string, source:string}} */ m) => `${m.target}__${m.source}`;

/** Write the index: the packs rendered now, in pair order, over the ones kept. @param {any[]} rendered */
async function writeIndex(rendered) {
  const order = new Map(pairs.map((p, i) => [key(p), i]));
  rendered.sort((a, b) => (order.get(key(a)) ?? 0) - (order.get(key(b)) ?? 0));
  const fresh = new Set(rendered.map(key));
  const packs = [...prior.filter((m) => !fresh.has(key(m))), ...rendered];
  await writeFile('packs/index.json', `${JSON.stringify({ packs }, null, 2)}\n`);
  console.log(`packs/index.json  ${packs.length} pack(s), ${rendered.length} rendered now`);
}

if (jobs > 1) {
  const passOn = process.argv.slice(2).filter((a, i, all) => a !== '--jobs' && all[i - 1] !== '--jobs');
  const run = (/** @type {number} */ k) => new Promise((resolve, reject) => {
    spawn(process.execPath, [fileURLToPath(import.meta.url), ...passOn, '--shard', `${k}/${jobs}`], { stdio: 'inherit' })
      .on('exit', (code) => (code === 0 ? resolve(null) : reject(new Error(`shard ${k}/${jobs} exited ${code}`))));
  });
  await Promise.all(Array.from({ length: jobs }, (_, k) => run(k)));
  /** @type {any[]} */ const rendered = [];
  for (let k = 0; k < jobs; k += 1) {
    rendered.push(...JSON.parse(await readFile(`tmp/prerender-shard-${k}.json`, 'utf8')));
    await rm(`tmp/prerender-shard-${k}.json`);
  }
  await writeIndex(rendered);
  process.exit(0);
}

const [k, n] = shard ? shard.split('/').map(Number) : [0, 1];
const local = await openLocalPage({ deviceScaleFactor: 2 });
/** @type {any[]} */ const index = [];

for (const { target, source } of pairs.filter((_, i) => i % n === k)) {
  const dir = `packs/${target}__${source}`;
  if (!force && existsSync(`${dir}/thumb.png`) && existsSync(`${dir}/face-1.svg.gz`)) continue;
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

  // **The first face as vector, so the lightbox opens on the real thing.**
  //
  // Laying out a sheet is about a second of arithmetic, and none of it is network:
  // the fit is already pinned from this index, so what is left is measuring and
  // breaking 600-odd rows. For that second the reader was looking at the 480px
  // thumbnail above, upscaled to card size and dimmed -- honest about not being
  // ready, and the thing they actually complained about.
  //
  // Shipping the whole sheet is not affordable and shipping one face is: a face is
  // ~180KB of SVG, but SVG is text that repeats itself and gzip takes it to 13KB, so
  // 420 pairs of first faces is ~5.5MB against ~75MB raw. Compressed *in the repo*
  // rather than only on the wire, because these files are rewritten wholesale every
  // time the corpus or the theme moves and git would keep every revision.
  // `DecompressionStream` inflates it in the browser; the remaining faces arrive when
  // the solve finishes, by which time the reader is still on this one.
  await writeFile(`${dir}/face-1.svg.gz`, gzipSync(svgs[0], { level: 9 }));

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
if (shard) {
  await mkdir('tmp', { recursive: true });
  await writeFile(`tmp/prerender-shard-${k}.json`, JSON.stringify(index));
} else {
  await writeIndex(index);
}
