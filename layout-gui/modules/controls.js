import {
  canvas, wrap, rowsEl, colsEl, squareEl,
  showGridEl, showIdxEl, rcodeEl, copyBtn
}                        from './dom.js';
import { state, history }         from './state.js';
import { clamp, syncURL, ok, norm, rectBox }         from './helpers.js';
import { repaint }       from './canvas.js';
import { legend }       from './legend.js';
import { generateCode } from './code-generator.js'

/* ---------- controls ---------- */
export function cursor() {
    if (!state.hover) {
        canvas.style.cursor = 'crosshair';
        return;
    }
    canvas.style.cursor = {
        inside: 'move',
        edgeN: 'ns-resize',
        edgeS: 'ns-resize',
        edgeE: 'ew-resize',
        edgeW: 'ew-resize',
        cornerNW: 'nwse-resize',
        cornerSE: 'nwse-resize',
        cornerNE: 'nesw-resize',
        delete: 'pointer',
        cornerSW: 'nesw-resize'
    } [state.hover.kind] || 'crosshair';
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

[rowsEl, colsEl].forEach(el => el.onchange = () => {
    const r = Math.max(1, +rowsEl.value || 1),
        c = Math.max(1, +colsEl.value || 1);
    if (r !== state.rows || c !== state.cols) {
        history();
        state.rows = r;
        state.cols = c;
        resizeCanvas();
        update();
        syncURL();
    }
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
    resizeCanvas();
};

const main = document.querySelector('.main');
const MIN_LEFT = 260,
    MIN_MID = 150,
    MIN_RIGHT = 260; // px
const setCss = (name, px) =>
    document.documentElement.style.setProperty(name, px + 'px');
const getCss = name =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

/* ----- initial 50 / 25 / 25 proportions ----- */
const splitW = 6; // splitter width in CSS
const colGap = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--gap')) || 10; // .main { gap: var(--gap) }
const TOTAL_GAPS = splitW * 2 + colGap * 4; // 5 cols → 4 gaps
const gridW = main.getBoundingClientRect().width - TOTAL_GAPS;
setCss('--w-left', gridW * 0.50);
setCss('--w-mid', gridW * 0.25);
setCss('--w-right', gridW * 0.25);


function dragFactory(id) {
    const splitter = document.getElementById(id);

    splitter.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.clientX;

        const G = main.getBoundingClientRect().width - TOTAL_GAPS;

        /* -------- freeze the starting widths -------- */
        const L0 = getCss('--w-left');
        const M0 = getCss('--w-mid');
        const R0 = getCss('--w-right'); // not strictly needed but nice for symmetry

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const G = main.getBoundingClientRect().width - TOTAL_GAPS; // full free width

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

    const deleteOffset = tol + 2;
    const delHot =
        px >= b.x + b.W - deleteOffset - 12 && px <= b.x + b.W - deleteOffset &&
        py >= b.y + deleteOffset && py <= b.y + deleteOffset + 12;
    if (delHot) return 'delete'; // give it top priority

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

export function rescaleSplitWidths () {
  const total = main.getBoundingClientRect().width - TOTAL_GAPS;
  const L = getCss('--w-left');
  const M = getCss('--w-mid');
  const R = getCss('--w-right');
  const sum = L + M + R || 1;               // guard-rail

  const k = total / sum;                    // zoom-factor
  setCss('--w-left',  L * k);
  setCss('--w-mid',   M * k);
  setCss('--w-right', R * k);
}

/* one central refresh */
export const update = () => {
    repaint();
    legend();
    rcodeEl.value = generateCode();
    dimText.textContent = `(${state.rows}×${state.cols})`;
    cursor();
    syncURL();
};

