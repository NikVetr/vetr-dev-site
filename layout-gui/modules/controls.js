import {
  canvas, wrap, rowsEl, colsEl, squareEl,
  showGridEl, showIdxEl, rcodeEl, copyBtn,
  aspectEl, sidebarEl
}                        from './dom.js';
import { state, history }         from './state.js';
import { clamp, syncURL, ok, norm, rectBox, deleteGlyphMetrics }         from './helpers.js';
import { repaint, startWelcomeFade }       from './canvas.js';
import { legend }       from './legend.js';
import { generateCode } from './code-generator.js'

/* ---------- controls ---------- */
export function cursor() {

  if (state.mode === 'cloning') {
    // mirror moving cursors; use a “power” variant if you have one
    canvas.style.cursor = state.pwrActive ? 'grabbing' : 'grabbing';
    return;
  }

  if (!state.hover) {
    canvas.style.cursor = state.pwrActive ? 
    "url('assets/cursors/crosshair.png') 16 16, crosshair" : 'crosshair';
    return;
  }

  const base = {
    inside:   'move',
    edgeN:    'ns-resize',
    edgeS:    'ns-resize',
    edgeE:    'ew-resize',
    edgeW:    'ew-resize',
    cornerNW: 'nwse-resize',
    cornerSE: 'nwse-resize',
    cornerNE: 'nesw-resize',
    cornerSW: 'nesw-resize',
    delete:   'pointer'
  };

  const pwr = {
    ...base,
    inside:   "url('assets/cursors/move.png') 16 16, move",
    edgeN:    "url('assets/cursors/ns-resize.png') 16 16, row-resize",
    edgeS:    "url('assets/cursors/ns-resize.png') 16 16, row-resize",
    edgeE:    "url('assets/cursors/ew-resize.png') 16 16, col-resize",
    edgeW:    "url('assets/cursors/ew-resize.png') 16 16, col-resize",
    cornerNE: "url('assets/cursors/nesw-resize.png') 12 12, nesw-resize",
    cornerSW: "url('assets/cursors/nesw-resize.png') 12 12, nesw-resize",
    cornerNW: "url('assets/cursors/nwse-resize.png') 12 12, nwse-resize",
    cornerSE: "url('assets/cursors/nwse-resize.png') 12 12, nwse-resize"
  };

  const map = state.pwrActive ? pwr : base;
  canvas.style.cursor = map[state.hover.kind] || 'crosshair';
}

export function resizeCanvas() {
    const box = wrap.getBoundingClientRect(); // free CSS px
    const dpr = window.devicePixelRatio || 1;

    /* -------- choose displayed (CSS) size --------------------------- */
    let wCss, hCss;

    if (state.square) { // ① exact squares
        const cell = Math.min(box.width / state.cols,
            box.height / state.rows);
        wCss = cell * state.cols;
        hCss = cell * state.rows;

    } else if (state.aspect) { // ② forced AR
        /* try to use full width – shrink if too tall                     */
        wCss = box.width;
        hCss = wCss / state.aspect;
        if (hCss > box.height) {
            hCss = box.height;
            wCss = hCss * state.aspect;
        }

    } else { // ③ fill pane
        wCss = box.width;
        hCss = box.height;
    }

    /* -------- update element + backing bitmap ----------------------- */
    canvas.style.width = wCss + 'px';
    canvas.style.height = hCss + 'px';
    canvas.width = Math.round(wCss * dpr);
    canvas.height = Math.round(hCss * dpr);

    /* cosmetic centring inside the wrap                               */
    canvas.style.marginLeft = ((box.width - wCss) / 2) + 'px';
    canvas.style.marginTop = ((box.height - hCss) / 2) + 'px';

    repaint();
}

new ResizeObserver(resizeCanvas).observe(wrap);

/* ─── grid-size widgets ──────────────────────────────────────────── */
const toast = Object.assign(document.createElement('div'), {
  className : 'toast',
});
document.body.append(toast);

/* helper – show + auto-hide little error note */
export function flashError(msg){
  toast.textContent   = msg;
  toast.style.opacity = 1;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=> toast.style.opacity = 0, 1500);
}

[rowsEl, colsEl].forEach(el => el.onchange = () => {

  const newRows = Math.max(1, +rowsEl.value || 1),
        newCols = Math.max(1, +colsEl.value || 1);

  /* early exit when nothing changed */
  if (newRows === state.rows && newCols === state.cols) return;

  /* would any rectangle stick out? */
  const bad = state.rects.find(r0 => {
    const r = norm(r0);
    return r.r1 > newRows || r.c1 > newCols;
  });

  if (bad){
    flashError('error: shrinking grid would clip existing rectangles');
    /* restore previous values in the number boxes */
    rowsEl.value = state.rows;
    colsEl.value = state.cols;
    return;
  }

  /* apply the new grid size */
  history();
  state.rows = newRows;
  state.cols = newCols;
  resizeCanvas();
  update();
  syncURL();
});

showGridEl.onchange = () => {
    state.showGrid = showGridEl.checked;
    repaint();
};

showIdxEl.onchange = () => {
    state.showIdx = showIdxEl.checked;
    repaint();
};

squareEl.onchange = () => {
  state.square = squareEl.checked;

  if (state.square) {
    // clear the aspect-ratio value (UI + state) and send
    aspectEl.value = '';
    state.aspect  = null;
    aspectEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* redraw & sync */
  resizeCanvas();
  syncURL();
};

const main = document.querySelector('.main');
const MIN_LEFT = 260,
    MIN_MID = 150,
    MIN_RIGHT = 260; // px
const splitW = 6; // keep in sync with CSS

const getGap = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10;

// Prefer CSS var --sidebar-w; fall back to actual DOM width
const getSidebarW = () => {
  const cssVal = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) || 0;
  if (cssVal) return cssVal;
  return sidebarEl ? sidebarEl.getBoundingClientRect().width : 0;
};

// Available width for the three resizable panels (excludes sidebar, splitters, and gaps)
// width available for LEFT+MID+RIGHT (excludes sidebar, splitters, and gaps)
function budget() {
  const mainW = main.getBoundingClientRect().width;

  const styles = getComputedStyle(document.documentElement);
  const gap    = parseFloat(styles.getPropertyValue('--gap')) || 10;

  // prefer CSS var --sidebar-w; fallback to actual DOM width
  let sidebarW = parseFloat(styles.getPropertyValue('--sidebar-w')) || 0;
  if (!sidebarW) {
    const aside = document.querySelector('.sidebar');
    sidebarW = aside ? aside.getBoundingClientRect().width : 0;
  }

  // 6 grid columns ⇒ 5 gaps; 2 splitters are their own columns
  const fixed = sidebarW + (2 * splitW) + (5 * gap);
  const finalBudget = Math.max(0, mainW - fixed);

    console.log({
    step: "budget() calculation",
    mainW: mainW,
    sidebarW: sidebarW,
    gap: gap,
    fixedCost: fixed,
    finalBudget: finalBudget 
  });

  return Math.max(0, mainW - fixed);
}


const setCss = (name, px) =>
    document.documentElement.style.setProperty(name, px + 'px');
const getCss = name =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

/* exact-fit initializer: honors mins and fills the whole budget */
function initSplitWidths() {
  const G = budget();
  const MIN_SUM = MIN_LEFT + MIN_MID + MIN_RIGHT;

  // initialize
  let L = 0, M = 0, R = 0;
  L = Math.max(MIN_LEFT, G * 0.50);
  M = Math.max(MIN_MID,  G * 0.25);
  R = G - L - M;

  if (G <= 0) {
    // nothing visible; keep zeros
  } else if (G < MIN_SUM) {
    // scale mins down proportionally so we never overflow
    const s = G / MIN_SUM;
    L = MIN_LEFT  * s;
    M = MIN_MID   * s;
    R = MIN_RIGHT * s;
  } else {
    // target 50/25/25, then enforce mins and give RIGHT the exact remainder
    L = Math.max(MIN_LEFT, G * 0.55);
    M = Math.max(MIN_MID,  G * 0.2);
    R = G - L - M;

    // if RIGHT fell under its min, borrow from L then M (without dropping their mins)
    if (R < MIN_RIGHT) {
      let need = MIN_RIGHT - R;
      const giveL = Math.min(need, L - MIN_LEFT); L -= giveL; need -= giveL;
      const giveM = Math.min(need, M - MIN_MID);  M -= giveM; need -= giveM;
      R = G - L - M; // exact remainder
    }
  }

  setCss('--w-left',  L);
  setCss('--w-mid',   M);
  setCss('--w-right', R);

  console.log({ step: "initSplitWidths() applied", Left: L, Mid: M, Right: R });

};

function dragFactory(id) {
    const splitter = document.getElementById(id);

    splitter.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.clientX;

        /* -------- freeze the starting widths -------- */
        const L0 = getCss('--w-left');
        const M0 = getCss('--w-mid');
        const R0 = getCss('--w-right'); // not strictly needed but nice for symmetry

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const G = budget();

            let L = L0,
                M = M0,
                R = R0; // start widths for this drag

            if (id === 'splitLeft') {
                /* slide border between LEFT and MIDDLE, keep RIGHT fixed */
                L = clamp(L0 + dx, MIN_LEFT, G - MIN_MID - R0);
                M = G - L - R0; // whatever space remains

                /* final safeguard */
                if (M < MIN_MID) { // shouldn’t happen, but keep gap visible
                    M = MIN_MID;
                    L = G - R0 - M;
                }

            } else { // splitRight
                /* slide border between MIDDLE and RIGHT, keep LEFT fixed */
                R = clamp(R0 - dx, MIN_RIGHT, G - L0 - MIN_MID); // note R0 - dx (drag right → dx>0 shrinks R)
                M = G - L0 - R;

                if (M < MIN_MID) { // keep 6 px splitter + 10 px gap visible
                    M = MIN_MID;
                    R = G - L0 - M;
                }
            }

            setCss('--w-left', L);
            setCss('--w-mid', M);
            setCss('--w-right', R);

            resizeCanvas(); // keep canvas crisp while dragging
        }


        const stop = () => window.removeEventListener('mousemove', onMove);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', stop, {
            once: true
        });
    });
}

dragFactory('splitLeft');
dragFactory('splitRight');

export function rescaleSplitWidths () {
  const G = budget(); // new: true free width for the 3 resizable columns

  let L = getCss('--w-left');
  let M = getCss('--w-mid');
  let R = getCss('--w-right');
  let sum = L + M + R || 1;

  // scale current widths to the new budget
  const k = G / sum;
  L = L * k;
  M = M * k;
  R = R * k;

  // enforce mins without reintroducing overflow
  const MIN_SUM = MIN_LEFT + MIN_MID + MIN_RIGHT;
  if (G < MIN_SUM) {
    // viewport is so small that mins don't fit — scale mins down proportionally
    const s = G / MIN_SUM;
    L = MIN_LEFT  * s;
    M = MIN_MID   * s;
    R = MIN_RIGHT * s;
  } else {
    // clamp to mins, then put exact remainder in R to avoid rounding drift
    L = Math.max(MIN_LEFT, L);
    M = Math.max(MIN_MID,  M);
    R = Math.max(MIN_RIGHT, G - L - M);
    if (R < MIN_RIGHT) {
      R = MIN_RIGHT;
      M = Math.max(MIN_MID, G - L - R);
      L = Math.max(MIN_LEFT, G - M - R);
    }
  }

  setCss('--w-left',  L);
  setCss('--w-mid',   M);
  setCss('--w-right', R);
}

export const pos = e => {
    const r = canvas.getBoundingClientRect(),
        x = (e.clientX - r.left) * (canvas.width / r.width),
        y = (e.clientY - r.top) * (canvas.height / r.height);
    return {
        x,
        y
    };
};

export function edgeKind(px, py, R, tol = 10) {
    const b = rectBox(R);

    {
        const m = deleteGlyphMetrics(b);
        if (m.draw) {
        // '×' is drawn at (m.x, m.y) with right/top alignment.
        // Make a hit region that extends left/down from that anchor,
        // with a tiny padding that scales with tol.
        const pad = Math.max(0, Math.min(tol, m.hit * 0.3));
        const x0 = m.x - m.hit - pad;   // extend left
        const x1 = m.x + pad;           // tiny buffer to the right
        const y0 = m.y - pad;           // tiny buffer above
        const y1 = m.y + m.hit + pad;   // extend down

        if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return 'delete';
        }
    }

    // Edges/corners
    const onN = Math.abs(py - b.y) <= tol &&
        px >= b.x - tol && px <= b.x + b.W + tol;
    const onS = Math.abs(py - (b.y + b.H)) <= tol &&
        px >= b.x - tol && px <= b.x + b.W + tol;
    const onW = Math.abs(px - b.x) <= tol &&
        py >= b.y - tol && py <= b.y + b.H + tol;
    const onE = Math.abs(px - (b.x + b.W)) <= tol &&
        py >= b.y - tol && py <= b.y + b.H + tol;

    if (onN && onW) return 'cornerNW';
    if (onN && onE) return 'cornerNE';
    if (onS && onW) return 'cornerSW';
    if (onS && onE) return 'cornerSE';
    if (onN) return 'edgeN';
    if (onS) return 'edgeS';
    if (onW) return 'edgeW';
    if (onE) return 'edgeE';

    return null;
}

/* one central refresh */
export const update = () => {
    //face out welcome message if it has never faded out before
    if (!state.hasEverHadRect && state.rects.length > 0) {
        startWelcomeFade();
    }
    repaint();
    legend();
    rcodeEl.value = generateCode();
    dimText.textContent = `(${state.rows}×${state.cols})`;
    cursor();
    syncURL();
};

export function hit(px, py) {
  /* try to grab an edge / corner */
  let fallback = null;                   // first edge we saw (old behaviour)

  for (let i = state.rects.length - 1; i >= 0; i--) {
    const R    = norm(state.rects[i]);
    const kind = edgeKind(px, py, R);
    if (!kind) continue;

    const b = rectBox(R);

    /* does the cursor face the interior of this rectangle? */
    const facing =
         (kind === 'edgeN' && py >  b.y       ) ||
         (kind === 'edgeS' && py <  b.y + b.H ) ||
         (kind === 'edgeW' && px >  b.x       ) ||
         (kind === 'edgeE' && px <  b.x + b.W ) ||
         (kind.startsWith('corner') && (
              (kind.endsWith('N') ? py > b.y       : py < b.y + b.H) ||
              (kind.endsWith('W') ? px > b.x       : px < b.x + b.W)));

    if (facing)                 // <- preferred rectangle
        return { kind, idx: i };

    if (!fallback)              // remember first edge as a fallback
        fallback = { kind, idx: i };
  }

  if (fallback) return fallback; // at least one edge matched

  /* otherwise: inside → move */
  for (let i = state.rects.length - 1; i >= 0; i--) {
    const b = rectBox(norm(state.rects[i]));
    if (px >= b.x && px <= b.x + b.W &&
        py >= b.y && py <= b.y + b.H)
      return { kind: 'inside', idx: i };
  }

  return null;                  // hit nothing
}

export function maxDelta(idx, dr, dc) {
    const R0 = norm(state.rects[idx]);
    let bestDr = dr,
        bestDc = dc;
    // border clamp
    bestDr = clamp(bestDr, -R0.r0, state.rows - R0.r1);
    bestDc = clamp(bestDc, -R0.c0, state.cols - R0.c1);
    // obstacle clamp
    const testRect = (dR, dC) => norm({
        r0: R0.r0 + dR,
        c0: R0.c0 + dC,
        r1: R0.r1 + dR,
        c1: R0.c1 + dC
    });
    while (!ok(testRect(bestDr, bestDc), idx)) {
        if (bestDr !== 0) bestDr -= Math.sign(bestDr);
        if (bestDc !== 0) bestDc -= Math.sign(bestDc);
        if (bestDr === 0 && bestDc === 0) break;
    }
    return {
        dr: bestDr,
        dc: bestDc
    };
}

//initialize layout, avoiding race conditions
let hasInitializedLayout = false;

const mainLayoutObserver = new ResizeObserver(entries => {
  // Guard against unnecessary runs after we're done.
  if (hasInitializedLayout) {
    mainLayoutObserver.disconnect();
    return;
  }

  const mainElement = entries[0].target;
  const mainWidth = mainElement.getBoundingClientRect().width;
  const sidebarElement = document.querySelector('.sidebar');
  const sidebarWidth = sidebarElement ? sidebarElement.getBoundingClientRect().width : 0;

  // CRITICAL CHECK:
  // Only proceed if the main container has a width AND
  // the sidebar's width is a reasonable, non-zero number that is LESS than the main container's width.
  if (mainWidth > 0 && sidebarWidth > 0 && sidebarWidth < mainWidth) {
    console.log(`Layout is stable: mainW=${mainWidth}, sidebarW=${sidebarWidth}. Initializing panels.`);
    
    initSplitWidths();
    
    hasInitializedLayout = true;
    mainLayoutObserver.disconnect(); // We are done, stop observing.
  } else {
    // This log will show us if we are skipping a "bad" render frame.
    console.log(`Layout not yet stable, skipping initialization: mainW=${mainWidth}, sidebarW=${sidebarWidth}`);
  }
});

// Start observing the .main element.
const mainElement = document.querySelector('.main');
if (mainElement) {
  mainLayoutObserver.observe(mainElement);
}

export function handleViewportResize () {
  // --- START: Safety Check ---
  const mainElement = document.querySelector('.main');
  const sidebarElement = document.querySelector('.sidebar');
  if (!mainElement || !sidebarElement) return; // Exit if elements don't exist

  const mainWidth = mainElement.getBoundingClientRect().width;
  const sidebarWidth = sidebarElement.getBoundingClientRect().width;

  // Only run the resizing logic if the layout is stable and makes sense.
  // This prevents the bug on monitor wake-up or other glitchy resize events.
  if (sidebarWidth <= 0 || sidebarWidth >= mainWidth) {
    console.warn(`Skipping resize. Unstable layout detected: mainW=${mainWidth}, sidebarW=${sidebarWidth}`);
    return;
  }

  rescaleSplitWidths();     // keep the three columns proportional
  resizeCanvas();           // then redraw the bitmap
}