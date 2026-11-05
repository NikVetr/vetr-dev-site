// The gallery index: thumbnails drawn by each entry's own figure code at its default
// parameters, and window.Intuitions with the shared submit().

import { compute as backpackFallacy } from './backpack-fallacy/compute.js';
import { curvesFigure } from './backpack-fallacy/figure.js';
import { compute as correlationGeometry } from './correlation-geometry/compute.js';
import { compute as dagAdjustment, PRESETS as DAG_PRESETS } from './dag-adjustment/compute.js';
import { dagFigure } from './dag-adjustment/figure.js';
import { coneScene, sceneCamera } from './correlation-geometry/figure.js';
import { orientation } from './lib/geom3d.js';
import { installApi, onWidth } from './lib/page.js';
import { compute as marchenkoPastur } from './marchenko-pastur/compute.js';
import { spectrumFigure } from './marchenko-pastur/figure.js';
import { compute as nullPvalues } from './null-pvalues/compute.js';
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

const backpack = backpackFallacy({ prior: 'normal', scale: 0.3, sizes: [2, 16, 128, 1024], upTo: 5, window: 0 });
const thumbs = [
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-correlation-geometry')),
    draw: (/** @type {number} */ width) => {
      const height = Math.round(Math.min(280, Math.max(200, width * 0.6)));
      // Without labels the sphere can fill more of the thumbnail.
      const camera = { ...sceneCamera(orientation(-20, 30), width, height), scale: height * 0.42 };
      return coneScene(/** @type {any} */ (correlationGeometry({ view: 'cone' })), camera, { compact: true });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-zscore-outliers')),
    draw: (/** @type {number} */ width) => densityFigure(zscoreOutliers({}), { width, height: 150, compact: true, id: 'thumb-zscore' }).svg,
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-threshold-model')),
    draw: (/** @type {number} */ width) => liabilityFigure(/** @type {any} */ (thresholdModel({ means: [0.4], thresholds: [[-0.6, 0.5, 1.4]] })).traits[0], { width, height: 150, compact: true }).svg,
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-typical-set')),
    draw: (/** @type {number} */ width) => shellFigure(typicalSet({ view: 'shell', k: 25, radius: 0 }), { width, height: 150, compact: true }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-dag-adjustment')),
    draw: (/** @type {number} */ width) => {
      const params = { graph: DAG_PRESETS.collider.graph, exposure: 'X', outcome: 'Y', adjust: ['C'], mediator: null };
      return dagFigure(params, dagAdjustment(params), { width, height: 150, id: 'thumb-dag' }).svg;
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-null-pvalues')),
    draw: (/** @type {number} */ width) => pairThumbnail(/** @type {any} */ (nullPvalues({ scenario: 'batch', treatedShare: 0.8 })), { width, height: 150 }),
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-marchenko-pastur')),
    draw: (/** @type {number} */ width) => {
      const r = /** @type {any} */ (marchenkoPastur({ view: 'noise', n: 200, p: 60, replicates: 30 }));
      return spectrumFigure({ histogram: r.sample.histogram, curve: r.curve, edges: r.edges, variance: 1, zeroShare: 0 }, { width, height: 150, compact: true });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-trait-evolution')),
    draw: (/** @type {number} */ width) => {
      const params = { model: 'shift', tree: { tips: 12, seed: 1 } };
      return phenogramFigure(traitEvolution(params), { width, height: 150, id: 'thumb-te', compact: true, params: { theta: 1.5, theta2: -1.5 } }).svg;
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-tree-covariance')),
    draw: (/** @type {number} */ width) => {
      const r = treeCovariance({ newick: '(((A:1,B:1):1,C:2):0.6,(D:1.2,E:1.2):1.4);', sample: null });
      return covarianceThumbnail(r, ['A', 'B'], { width, height: 150 });
    },
  },
  {
    box: /** @type {HTMLElement} */ (document.getElementById('thumb-backpack-fallacy')),
    draw: (/** @type {number} */ width) => curvesFigure(backpack, { width, height: 150, smaller: 2, at: 2, compact: true }),
  },
];
for (const { box, draw } of thumbs) onWidth(box, (width) => { box.innerHTML = draw(width); });
installApi({});
