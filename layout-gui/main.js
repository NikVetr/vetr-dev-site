import {
  darkEl, dimText, rowsEl, colsEl, squareEl, renderRadios, aspectEl
}                       from './modules/dom.js';

import { state, history }        from './modules/state.js';
import { decodeState, norm, syncURL }  from './modules/helpers.js';
import { repaint }      from './modules/canvas.js';
import { legend }       from './modules/legend.js';
import {
  generateCode, renderer,
}                       from './modules/code-generator.js';
import { resizeCanvas, update, rescaleSplitWidths } from './modules/controls.js';

import './modules/events.js';
import './modules/controls.js';
import './modules/tooltips.js';

/* handle viewport resizing */
function handleViewportResize () {
  rescaleSplitWidths();     // keep the three columns proportional
  resizeCanvas();           // then redraw the bitmap
}
window.addEventListener        ('resize', handleViewportResize);      // classic
window.visualViewport?.addEventListener('resize', handleViewportResize); // pinch-zoom

/* honour OS-level dark preference =========================== */
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    darkEl.checked = true; /* honour OS preference on first load (overridden by checkbox) */
}
document.body.classList.toggle('dark', darkEl.checked);

/* ---------- init ---------- */
/* --- load state from #hash if present --------------------------------- */
if (location.hash.length > 1) {
    const saved = decodeState(location.hash.slice(1));

    if (saved && saved.rows && saved.cols) {
      Object.assign(state, {
          rows: saved.rows,
          cols: saved.cols,
          rects: saved.rects.map(norm),
          aliases: saved.aliases || [],
          square: !!saved.square,
          aspect: saved.aspect ?? null
      });

      renderer.value = saved.renderer || 'layout';
      /* reflect UI widgets */
      rowsEl.value = state.rows;
      colsEl.value = state.cols;
      squareEl.checked = state.square;
      aspectEl.value = state.aspect ?? '';
      document.querySelector(`input[name="render"][value="${renderer.value}"]`).checked = true;
    
    }
}

history();
resizeCanvas();
update();
syncURL();
