// The gallery index: thumbnails drawn by each entry's own figure code at its default
// parameters, and window.Intuitions with the shared submit().

import { compute as correlationGeometry } from './correlation-geometry/compute.js';
import { coneScene, sceneCamera } from './correlation-geometry/figure.js';
import { orientation } from './lib/geom3d.js';
import { installApi, onWidth } from './lib/page.js';
import { compute as thresholdModel } from './threshold-model/compute.js';
import { liabilityFigure } from './threshold-model/figure.js';
import { compute as zscoreOutliers } from './zscore-outliers/compute.js';
import { densityFigure } from './zscore-outliers/figure.js';

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
];
for (const { box, draw } of thumbs) onWidth(box, (width) => { box.innerHTML = draw(width); });
installApi({});
