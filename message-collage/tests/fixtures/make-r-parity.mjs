// Makes r-parity.json, the R parity fixture: four requests run by the R version
// (make-r-parity.R, on this tool's font files), keeping what the tests compare. Run from the
// repository root:  node message-collage/tests/fixtures/make-r-parity.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = new URL('.', import.meta.url).pathname;
const messages = readFileSync(new URL('../../examples/messages.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const requests = [
  { name: 'example-best-of-3', messages, seed: 1, runs: 3 },
  { name: 'a6-landscape', messages, seed: 7, runs: 1, width_in: 5.83, height_in: 4.13, fill: 0.75, palette: ['#aa3355', '#AA3355', '#1b9e77', '#D95F02', '#7570b3', '#e7298a'], background: '#ffffff' },
  { name: 'two-fonts-fixed-order', messages: messages.slice(0, 12), seed: 3, runs: 2, fonts: ['Lobster Two', 'Courier Prime'], styles: ['italic', 'plain'], size_range: [1, 1], shuffle: false, line_gap: 0.3, message_gap: 0.2, grid_res: 25 },
  { name: 'punctuation-portrait', seed: 11, runs: 2, width_in: 3, height_in: 4, fill: 0.45, size_range: [1, 2],
    messages: ['You’re the best — truly, 100% & then some!', 'Thanks for {everything}; if in doubt, ask for help.', '“Onward” $5 says you’ll be great #1', 'Cheers', 'Merci beaucoup, Zoë — à bientôt!', 'Dziękuję za wszystko, Łukasz… powodzenia.'] },
];

const dir = mkdtempSync(join(tmpdir(), 'collage-parity-'));
try {
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(requests));
  execFileSync('Rscript', [join(here, 'make-r-parity.R'), join(dir, 'cases.json'), join(dir, 'r.json')], { stdio: 'inherit' });
  const cases = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  const arr = (/** @type {any} */ x) => (Array.isArray(x) ? x : [x]); // R's JSON writes one-element arrays as scalars
  const versions = execFileSync('Rscript', ['-e', 'cat(R.version$major, R.version$minor, as.character(packageVersion("showtext")))'], { encoding: 'utf8' }).split(' ');
  const out = {
    source: `NikVetr/message-collage, R ${versions[0]}.${versions[1]}, showtext ${versions[2]}, run by make-r-parity.R on the bundled font files`,
    cases: cases.map((/** @type {any} */ c, /** @type {number} */ i) => {
      if (c.error) throw new Error(`R failed on ${requests[i].name}: ${c.error}`);
      const kept = c.r_runs.find((/** @type {any} */ r) => r.seed === c.card.seed);
      return {
        request: requests[i],
        card: c.card,
        messages: c.messages.map((/** @type {any} */ m, /** @type {number} */ k) => ({ input_index: m.input_index, family: m.family, style: m.style, size: m.size, color: m.color, restarts: m.restarts, label: c.regions[k].label })),
        lines: c.lines.map((/** @type {any} */ l) => ({ message: l.message, text: l.text, col: l.col, layout_col: l.layout_col, row: l.row, end_col: l.end_col, end_row: l.end_row, just: l.just ?? null, snapped: l.snapped, width: l.width, x_in: l.x_in, baseline_in: l.baseline_in, font_size_pt: l.font_size_pt })),
        runs: c.runs.map((/** @type {any} */ r) => ({ seed: r.seed, empty_fraction: r.empty_fraction, height_in: r.height_in })),
        kept_dims: kept.dims.map((/** @type {any} */ d) => ({ w: arr(d.w), ws: d.ws, h: d.h, total: d.total })),
      };
    }),
  };
  writeFileSync(join(here, 'r-parity.json'), `${JSON.stringify(out)}\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
