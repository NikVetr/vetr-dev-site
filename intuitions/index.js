// The gallery index: thumbnails drawn by each entry's own figure code at its default
// parameters, and window.Intuitions with the shared submit().

import { compute as backpackFallacy } from './backpack-fallacy/compute.js';
import { curvesFigure } from './backpack-fallacy/figure.js';
import { compute as correlationGeometry } from './correlation-geometry/compute.js';
import { compute as dagAdjustment, PRESETS as DAG_PRESETS } from './dag-adjustment/compute.js';
import { dagFigure } from './dag-adjustment/figure.js';
import { coneScene, sceneCamera } from './correlation-geometry/figure.js';
import { orientation } from './lib/geom3d.js';
import { compute as jacobianAdjustment, jointLogDensity } from './jacobian-adjustment/compute.js';
import { sampledFigure } from './jacobian-adjustment/figure.js';
import { installApi } from './lib/page.js';
import { el, linePath, marker, svgRoot } from './lib/plot.js';
import { submit as calibrate } from '../forecast-calibration/core/index.js';
import { mountMosaic } from '../shared/mosaic.js';
import { galleryLayouts } from './gallery-layout.js';
import { compute as marchenkoPastur } from './marchenko-pastur/compute.js';
import { spectrumFigure } from './marchenko-pastur/figure.js';
import { compute as nullPvalues } from './null-pvalues/compute.js';
import { compute as probabilityPuzzles } from './probability-puzzles/compute.js';
import { boxesFigure } from './probability-puzzles/figure.js';
import { compute as samplers } from './samplers/compute.js';
import { chainFigure, chainLayer } from './samplers/figure.js';
import { pairThumbnail } from './null-pvalues/figure.js';
import { compute as thresholdModel } from './threshold-model/compute.js';
import { compute as traitEvolution } from './trait-evolution/compute.js';
import { phenogramFigure } from './trait-evolution/figure.js';
import { compute as treeCovariance } from './tree-covariance/compute.js';
import { covarianceThumbnail } from './tree-covariance/figure.js';
import { liabilityFigure } from './threshold-model/figure.js';
import { compute as zscoreOutliers } from './zscore-outliers/compute.js';
import { compute as typicalSet } from './typical-set/compute.js';
import { shellFigure } from './typical-set/figure.js';
import { densityFigure } from './zscore-outliers/figure.js';

const example = await fetch(new URL('../forecast-calibration/examples/synthetic.csv', import.meta.url));
if (!example.ok) throw new Error(`Could not load the calibration example (${example.status})`);
const calibration = calibrate({ table: await example.text() });

const backpack = backpackFallacy({ prior: 'normal', scale: 0.3, sizes: [2, 16, 128, 1024], upTo: 5, window: 0 });
const chain = /** @type {any} */ (samplers({ view: 'funnel', iterations: 400 }));
const thumbs = [
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-correlation-geometry')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      // Without labels the sphere can fill more of the thumbnail.
      const camera = { ...sceneCamera(orientation(-20, 30), width, height), scale: height * 0.42 };
      return coneScene(/** @type {any} */ (correlationGeometry({ view: 'cone' })), camera, { compact: true });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-zscore-outliers')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => densityFigure(zscoreOutliers({}), { width, height, compact: true, id: 'thumb-zscore' }).svg,
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-threshold-model')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => liabilityFigure(/** @type {any} */ (thresholdModel({ means: [0.4], thresholds: [[-0.6, 0.5, 1.4]] })).traits[0], { width, height, compact: true }).svg,
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-typical-set')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => shellFigure(typicalSet({ view: 'shell', k: 25, radius: 0 }), { width, height, compact: true }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-dag-adjustment')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const params = { graph: DAG_PRESETS.collider.graph, exposure: 'X', outcome: 'Y', adjust: ['C'], mediator: null };
      return dagFigure(params, dagAdjustment(params), { width, height, id: 'thumb-dag' }).svg;
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-null-pvalues')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => pairThumbnail(/** @type {any} */ (nullPvalues({ scenario: 'batch', treatedShare: 0.8 })), { width, height }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-marchenko-pastur')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const r = /** @type {any} */ (marchenkoPastur({ view: 'noise', n: 200, p: 60, replicates: 30 }));
      return spectrumFigure({ histogram: r.sample.histogram, curve: r.curve, edges: r.edges, variance: 1, zeroShare: 0 }, { width, height, compact: true });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-trait-evolution')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const params = { model: 'shift', tree: { tips: 12, seed: 1 } };
      return phenogramFigure(traitEvolution(params), { width, height, id: 'thumb-te', compact: true, params: { theta: 1.5, theta2: -1.5 } }).svg;
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-tree-covariance')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const r = treeCovariance({ newick: '(((A:1,B:1):1,C:2):0.6,(D:1.2,E:1.2):1.4);', sample: null });
      return covarianceThumbnail(r, ['A', 'B'], { width, height });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-backpack-fallacy')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => curvesFigure(backpack, { width, height, smaller: 2, at: 2, compact: true }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-samplers')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const X = 1.96 * Math.exp(1.645 * 1.5);
      const path = { a: chain.draws.x, b: chain.draws.y, accepted: chain.accepted, divergent: chain.divergent, trajectories: null, proposals: null };
      return chainFigure({
        width, height, domain: { x: [-X, X], y: [-4.5, 4.5] }, walls: 0, xLabel: 'x', yLabel: 'y', id: 'thumb-samplers', label: '', compact: true,
        layer: (x, y) => chainLayer(path, x, y, chain.accepted.length),
      }).svg;
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-jacobian-adjustment')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const params = /** @type {any} */ ({ view: 'transform', transform: 'product-normal', jacobian: true });
      return sampledFigure(jacobianAdjustment(params), jointLogDensity(params), { width, height, id: 'thumb-jacobian', compact: true });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-probability-puzzles')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => boxesFigure(probabilityPuzzles({ view: 'prisoners', seed: 20, replicates: 0 }), { width, t: Infinity, columns: 20 }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-forecast-calibration')),
    draw: (/** @type {number} */ width, /** @type {number} */ height) => {
      const x = (/** @type {number} */ p) => 12 + p * (width - 24);
      const y = (/** @type {number} */ f) => height - 12 - f * (height - 24);
      const curve = (/** @type {number[]} */ frequencies) => linePath(frequencies.map((f, i) => [x(calibration.bins[i].meanProbability), y(f)]));
      // A compact thumbnail of the same seeded calibrated worlds and observed bins.
      return svgRoot({ width, height, label: 'Forecast calibration', className: 'plot' },
        el('path', { d: `M12 12V${height - 12}H${width - 12}`, class: 'axis-line', fill: 'none' }),
        el('g', { fill: 'none', stroke: 'var(--ink)', 'stroke-opacity': 0.035 }, calibration.worlds.slice(0, 150).map(world => el('path', { d: curve(world.map((hits, i) => hits / calibration.bins[i].n)) }))),
        el('path', { d: `M12 ${height - 12}L${width - 12} 12`, class: 'muted-line' }),
        el('path', { d: curve(calibration.bins.map(bin => bin.frequency)), class: 'calibration-observed', fill: 'none', 'stroke-width': 2.3 }),
        calibration.bins.map(bin => marker(bin.position === 'inside' ? 'circle' : 'triangle', x(bin.meanProbability), y(bin.frequency), bin.position === 'below' ? -4 : 4, 'calibration-marker')),
      );
    },
  },
];
mountMosaic(/** @type {HTMLElement} */ (document.querySelector('.gallery')), { layouts: galleryLayouts });
for (const { box, draw } of thumbs) {
  let previous = '';
  const render = () => {
    const width = Math.floor(box.clientWidth), height = Math.floor(box.clientHeight);
    const size = `${width}:${height}`;
    if (width > 0 && height > 0 && size !== previous) {
      previous = size;
      box.innerHTML = draw(width, height);
    }
  };
  new ResizeObserver(render).observe(box);
  render();
}
installApi({});
