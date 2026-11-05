// Makes r-parity.json, the R parity fixture: helix requests run by R's draw_DNA with the
// arguments this tool derives from them, and braid_segment calls from its own example, run
// by make-r-parity.R, keeping what the tests compare. Run from the repository root:
//   node helix/tests/fixtures/make-r-parity.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drawDnaOptions } from '../../core/helix.js';
import { normalizeRequest } from '../../core/request.js';

const here = new URL('.', import.meta.url).pathname;
const R_DEFAULT = { startAngle: -270, strandThickness: 0.1, box: { width: 10, height: 10 } }; // draw_DNA()
const helixRequests = [
  { name: 'draw_DNA-defaults', helix: R_DEFAULT },
  { name: 'function-example', helix: { ...R_DEFAULT, rotation: 135, extension: { strands: 'both' }, box: { width: 8, height: 14 } } },
  { name: 'extend-strand-1', helix: { ...R_DEFAULT, extension: { strands: 'strand1', length: 0.5 }, rotation: 90 } },
  { name: 'extend-strand-2-alternate', helix: { ...R_DEFAULT, extension: { strands: 'strand2', length: 1.5 }, alternateSides: true, partialDisplacement: false, basePairsPerTurn: 10 } },
  { name: 'polylines-example-2', helix: { turns: 1, startAngle: -90, amplitude: 1.25, crossingGap: 0.2, strandThickness: 0.099, extension: { strands: 'both', length: 0.5 }, alternateSides: true, box: { width: 4, height: 12 } } },
  { name: 'frequency-2-rotated', helix: { turns: 2, startAngle: 0, frequency: 2, points: 600, basePairsPerTurn: 6, basePairThickness: 1.5, basePairGap: 0.3, squareWave: 0, rotation: 30, strandThickness: 0.2, box: { width: 10, height: 6 } } },
];
const COLS = ['#E41A1C', '#377EB8', '#4DAF4A', '#984EA3', '#FF7F00'];
const braidCalls = [ // run_braid_test()'s square panel, and three more
  { name: 'diagonal-2', x0: 1, y0: 1, x1: 5, y1: 5, cols: COLS.slice(0, 2), twists: 3 },
  { name: 'vertical-3', x0: 7, y0: 2, x1: 7, y1: 8, cols: COLS.slice(0, 3), twists: 4 },
  { name: 'horizontal-2', x0: 2, y0: 8, x1: 8, y1: 8, cols: COLS.slice(0, 2), twists: 3 },
  { name: 'diagonal-5', x0: 1, y0: 9, x1: 9, y1: 1, cols: COLS, twists: 5 },
  { name: 'four-strands-negative-twist', x0: 1, y0: 2, x1: 9, y1: 4, cols: COLS.slice(0, 4), twists: -2.5, min_segments: 30 },
  { name: 'one-strand', x0: 0, y0: 0, x1: 6, y1: 3, cols: COLS.slice(0, 1), twists: 2 },
];

/** draw_DNA's arguments for a helix request (the script's draw_DNA has no forced box or extension taper). @param {any} request */
function drawDnaArgs(request) {
  const req = normalizeRequest({ mode: 'helix', helix: request.helix });
  if (req.mode !== 'helix') throw new Error('not a helix');
  const h = req.helix;
  if (h.box.fit !== 'contain' || !h.box.includeExtension || h.extension.taper) throw new Error(`${request.name}: draw_DNA.R has no such option`);
  const o = drawDnaOptions(h);
  return {
    n_strand: o.points, dh_bounds: o.dhBounds, amplitude: o.amplitude, phase_shift: o.phaseShift, frequency: o.frequency,
    base_pair_interval: o.bpInterval, proportional_distance: o.propDist, alternate_sides: o.alternateSides,
    partial_displacement: o.partialDisplacement, chirality_prop: o.chiralityProp, prop_square_wave: o.squareWave,
    bp_thickness: o.bpThickness, strand_thickness: o.strandThickness, extend_straight: String(o.extendStraight),
    extend_straight_by: o.extendStraightBy, rot: o.rot, box_dim: o.boxDim,
  };
}

const cases = [
  ...helixRequests.map((r) => ({ name: r.name, mode: 'helix', args: drawDnaArgs(r) })),
  ...braidCalls.map(({ name, ...c }) => ({ name, mode: 'braid', args: { bwidth: 20, min_segments: 50, ...c } })),
];
const dir = mkdtempSync(join(tmpdir(), 'helix-parity-'));
try {
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases));
  execFileSync('Rscript', [join(here, 'make-r-parity.R'), join(dir, 'cases.json'), join(dir, 'r.json')], { stdio: 'inherit' });
  const results = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  const version = execFileSync('Rscript', ['-e', 'cat(R.version$major, R.version$minor, sep = ".")'], { encoding: 'utf8' });
  const commit = (/** @type {string} */ repo) => execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const home = process.env.HOME;
  const out = {
    source: `draw_DNA.R and braided_lines.R (minor_scripts ${commit(`${home}/repos/minor_scripts`)}), polylines() of polylines ${commit(`${home}/repos/polylines`)}, R ${version}, run by make-r-parity.R`,
    cases: results.map((/** @type {any} */ r, /** @type {number} */ i) => {
      if (r.error) throw new Error(`R failed on ${cases[i].name}: ${r.error}`);
      const c = cases[i];
      if (c.mode === 'helix') return { name: c.name, request: { mode: 'helix', helix: helixRequests[i].helix }, r_args: c.args, ...r };
      const a = braidCalls[i - helixRequests.length];
      const request = { mode: 'braid', braid: {
        colors: a.cols, length: Math.hypot(a.x1 - a.x0, a.y1 - a.y0), width: r.width, twists: a.twists,
        minSegments: /** @type {any} */ (c.args).min_segments, rotation: -Math.atan2(a.y1 - a.y0, a.x1 - a.x0) / Math.PI * 180,
      } };
      return { name: c.name, request, r_args: c.args, ...r };
    }),
  };
  writeFileSync(join(here, 'r-parity.json'), `${JSON.stringify(out)}\n`);
  console.log(`r-parity.json: ${out.cases.length} cases`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
