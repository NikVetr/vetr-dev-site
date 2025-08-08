/* events.js (no exports – listeners only) --------------------------- */

import {
  canvas, legendList, copyBtn, trimBtn, reduceBtn, expandBtn,
  clearBtn, undoBtn, redoBtn, exportBtn, importBtn,
  darkEl, rowsEl, colsEl, squareEl, showIdxEl, showGridEl,
  renderRadios, rcodeEl, aspectEl, labelSwitch
} from './dom.js';

import { state, history, applySnap, PALETTE }          from './state.js';
import {
  nameOf, clamp, gcd, snap, norm, ok, rectBox, col,
  syncURL
} from './helpers.js';

import {
  repaint, grid, drawRects, drawPreview, drawLiveTransform, indices
} from './canvas.js';

import {
  generateCode, renderer
} from './code-generator.js';

import { update, resizeCanvas, pos, hit, cursor, maxDelta } from './controls.js';

function flashCopied() {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = 'Copy';
    }, 900);
}

legendList.addEventListener('dblclick', e => {
    const item = e.target.closest('.legend-item');
    if (!item) return;
    const idx = +item.dataset.idx;
    const current = state.aliases[idx] || '';
    const name = prompt('Rectangle name:', current);
    if (name === null) return; // cancelled
    history();
    state.aliases[idx] = name.trim();
    update();
    syncURL();
});

canvas.addEventListener('mousemove', e => {
    state.cursorPos = pos(e);
    const {
        x,
        y
    } = state.cursorPos;

    if (state.mode === 'drawing') {
        state.start.end = snap(x, y);
        repaint();
        return;
    }
    if (state.mode === 'moving' || state.mode === 'resizing') {
        repaint();
        return;
    }

    /* idle hover */
    state.hover  = hit(x, y);
    state.prevFocus  = state.focus;
    state.focus      = state.hover ? state.hover.idx : null;
    cursor();

    /* update legend highlight */
    if (state.focus !== state.prevFocus) {
        const oldEl = legendList.querySelector('.legend-item.focus');
        if (oldEl) oldEl.classList.remove('focus');

        if (state.focus != null) {
            legendList
            .querySelector(`.legend-item[data-idx="${state.focus}"]`)
            ?.classList.add('focus');
        }
    }

    repaint();
});

canvas.addEventListener('mouseleave', () => {
  state.focus = null;
  const oldEl = legendList.querySelector('.legend-item.focus');
  if (oldEl) oldEl.classList.remove('focus');
  repaint();                       // remove the tint, too
});

canvas.addEventListener('dblclick', e => {
    const {
        x,
        y
    } = pos(e);
    const hitInfo = hit(x, y);
    if (!hitInfo || hitInfo.kind !== 'inside') return;
    const idx = hitInfo.idx;
    const current = state.aliases[idx] || '';
    const name = prompt('Rectangle name:', current);
    if (name === null) return;
    history();
    state.aliases[idx] = name.trim();
    update();
    syncURL();
});

canvas.addEventListener('mousedown', e => {
    const {
        x,
        y
    } = pos(e), hv = hit(x, y);

    if (hv && hv.kind === 'delete') {
        history(); // enable undo
        state.rects.splice(hv.idx, 1);
        state.aliases.splice(hv.idx, 1);
        state.pool.unshift(state.colours[hv.idx]);
        state.colours.splice(hv.idx, 1);
        update();
        syncURL();
        return;
    }

    if (hv) {
        state.active = hv.idx;
        state.base = norm(state.rects[hv.idx]);
        if (hv.kind === 'inside') {
            state.mode = 'moving';
            state.grab = snap(x, y);
        } else {
            state.mode = 'resizing';
            state.resize = hv.kind;
        }
    } else {
        state.mode = 'drawing';
        state.start = {
            begin: snap(x, y),
            end: null
        };
    }
});

window.addEventListener('mouseup', e => {
    if (state.mode === 'drawing') {
        const a = state.start.begin,
            b = snap(...Object.values(pos(e)));
        const R = norm({
            r0: a.r,
            c0: a.c,
            r1: b.r,
            c1: b.c
        });
        state.mode = 'idle';
        state.start = null;
        if (ok(R)) {
            history();
            state.rects.push(R);
            state.aliases.push('');
            const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`; // emergency new colour
            state.colours.push(colour);
        }
        update();
        syncURL();
        return;
    }
    if (state.mode === 'moving') {
        const v = snap(...Object.values(pos(e))),
            dR = v.r - state.grab.r,
            dC = v.c - state.grab.c;
        const {
            dr,
            dc
        } = maxDelta(state.active, dR, dC);
        const R = state.base;
        const moved = {
            r0: R.r0 + dr,
            c0: R.c0 + dc,
            r1: R.r1 + dr,
            c1: R.c1 + dc
        };
        if (dr || dc) {
            history();
            state.rects[state.active] = moved;
        }
        state.mode = 'idle';
        update();
        syncURL();
        return;
    }
    if (state.mode === 'resizing') {
        const v = snap(...Object.values(pos(e)));
        let R = {
            ...state.base
        };
        const k = state.resize;
        if (/N/.test(k)) R.r0 = clamp(v.r, 0, R.r1 - 1);
        if (/S/.test(k)) R.r1 = clamp(v.r, R.r0 + 1, state.rows);
        if (/W/.test(k)) R.c0 = clamp(v.c, 0, R.c1 - 1);
        if (/E/.test(k)) R.c1 = clamp(v.c, R.c0 + 1, state.cols);
        R = norm(R);
        if (ok(R, state.active)) {
            history();
            state.rects[state.active] = R;
        }
        state.mode = 'idle';
        update();
        syncURL();
        return;
    }
});

aspectEl.oninput = () => { // empty = auto
    const v = parseFloat(aspectEl.value);
    state.aspect = isFinite(v) ? Math.max(0.2, v) : null;
    if (state.square && state.aspect) { // force off – can’t mix
        squareEl.checked = state.square = false;
    }
    resizeCanvas();
    syncURL();
};

copyBtn.onclick = () => {
    /* works for <textarea>, <pre>, <code>, … */
    const code =
        'value' in rcodeEl && rcodeEl.value !== undefined ?
        rcodeEl.value :
        rcodeEl.textContent;

    /* 1 – modern Clipboard API (needs https or localhost) */
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
            .writeText(code)
            .then(flashCopied)
            .catch(fallbackCopy); // e.g. insecure context
        return;
    }

    /* 2 – fallback for file://, plain http, old browsers */
    fallbackCopy();

    function fallbackCopy() {
        const ta = document.createElement('textarea');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try {
            if (document.execCommand('copy')) flashCopied();
            else alert('Copy failed – please copy manually.');
        } finally {
            document.body.removeChild(ta);
        }
    }
};

trimBtn.onclick = () => {
    if (!state.rects.length) return; // nothing to trim

    /* 1 ── find global bounding box of all rectangles */
    let minR = Infinity,
        minC = Infinity,
        maxR = -Infinity,
        maxC = -Infinity;

    state.rects.forEach(r0 => {
        const r = norm(r0);
        if (r.r0 < minR) minR = r.r0;
        if (r.c0 < minC) minC = r.c0;
        if (r.r1 > maxR) maxR = r.r1;
        if (r.c1 > maxC) maxC = r.c1;
    });

    /* nothing to trim if bounding box already touches (0,0) and full dims */
    if (minR === 0 && minC === 0 &&
        maxR === state.rows && maxC === state.cols) return;

    history(); // enable undo

    /* 2 ── shift every rectangle so (minR,minC) becomes (0,0) */
    state.rects = state.rects.map(r0 => {
        const r = norm(r0);
        return {
            r0: r.r0 - minR,
            c0: r.c0 - minC,
            r1: r.r1 - minR,
            c1: r.c1 - minC
        };
    });

    /* 3 ── shrink the grid to the bounding-box size */
    const newRows = maxR - minR;
    const newCols = maxC - minC;
    state.rows = newRows;
    state.cols = newCols;
    rowsEl.value = newRows;
    colsEl.value = newCols;

    update();
    syncURL(); // repaint, legend, R code
};

reduceBtn.onclick = () => {
    
    /* NO RECTANGLES – use the common divisor of rows & cols */
    if (!state.rects.length) {
        const f = gcd(state.rows, state.cols);
        if (f === 1) return;

        history();
        state.rows /= f;
        state.cols /= f;
        rowsEl.value = state.rows;
        colsEl.value = state.cols;

        update();
        syncURL();
        return;
    }

    /* YES RECTANGLES - collect every horizontal & vertical boundary */
    const rSet = new Set([0, state.rows]);
    const cSet = new Set([0, state.cols]);
    state.rects.forEach(r0 => {
        const r = norm(r0);
        rSet.add(r.r0);
        rSet.add(r.r1);
        cSet.add(r.c0);
        cSet.add(r.c1);
    });

    /* 2 ── greatest common divisor of all boundary coordinates */
    const rFactor = [...rSet].reduce((g, v) => gcd(g, v));
    const cFactor = [...cSet].reduce((g, v) => gcd(g, v));

    /* if no common divisor >1 in either dimension, nothing to do */
    if (rFactor === 1 && cFactor === 1) return;

    history(); // enable undo

    /* 3 ── rescale every rectangle */
    state.rects = state.rects.map(r0 => {
        const r = norm(r0);
        return {
            r0: r.r0 / rFactor,
            c0: r.c0 / cFactor,
            r1: r.r1 / rFactor,
            c1: r.c1 / cFactor
        };
    });

    /* 4 ── rescale the grid itself */
    state.rows = Math.round(state.rows / rFactor);
    state.cols = Math.round(state.cols / cFactor);
    rowsEl.value = state.rows;
    colsEl.value = state.cols;

    update();
    syncURL(); // repaint everything
};

/* ---------- EXPAND  ––  double everything -------------------------------- */
expandBtn.onclick = () => {
  /* 0 ── sanity: nothing to do if grid would grow beyond some huge limit   */
  const MAX = 10_000;                        // arbitrary safety cap
  if (state.rows * 2 > MAX || state.cols * 2 > MAX) return;

  history();                                 // enable Undo

  /* scale the grid itself  */
  state.rows *= 2;
  state.cols *= 2;
  rowsEl.value = state.rows;
  colsEl.value = state.cols;

  /* scale every rectangle  */
  state.rects = state.rects.map(r0 => {
    const r = norm(r0);                      // be safe
    return {
      r0: r.r0 * 2,
      c0: r.c0 * 2,
      r1: r.r1 * 2,
      c1: r.c1 * 2
    };
  });
  /*  refresh everything */
  update();
  syncURL();
};

clearBtn.onclick = () => {
  if (!state.rects.length) return;

  history();
  state.rects.length   = 0;
  state.aliases.length = 0;
  state.pool    = [...PALETTE];
  state.colours = [];
  state.focus      = null;
  state.prevFocus  = null;
  update();
  syncURL();
};

undoBtn.onclick = () => {
    if (!state.past.length) return;
    state.future.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool : state.pool
    }));
    applySnap(state.past.pop());
    resizeCanvas();
};

redoBtn.onclick = () => {
    if (!state.future.length) return;
    state.past.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool : state.pool
    }));
    applySnap(state.future.pop());
    resizeCanvas();
};

exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool : state.pool
    }, null, 2)], {
        type: 'application/json'
    });
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: 'layout-mat.json'
    });
    a.click();
    URL.revokeObjectURL(a.href);
};

darkEl.onchange = () => {
    document.body.classList.toggle('dark', darkEl.checked);
    repaint(); // grid colour changes
};


importBtn.onclick = () => {
    const inp = Object.assign(document.createElement('input'), {
        type: 'file',
        accept: 'application/json'
    });
    inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const o = JSON.parse(fr.result);
                if (o.rows && o.cols && Array.isArray(o.rects)) {
                    history();
                    Object.assign(state, {
                        rows: o.rows,
                        cols: o.cols,
                        rects: o.rects.map(norm),
                        colours: o.colours,
                        pool : o.pool,
                        aliases: o.aliases || []
                    });
                    rowsEl.value = o.rows;
                    colsEl.value = o.cols;
                    update();
                    syncURL();
                }
            } catch (_) {}
        };
        fr.readAsText(f);
    };
    inp.click();
};

renderRadios.addEventListener('change', e => {
  if (e.target.name === 'render') {
    renderer.value       = e.target.value;   // ← .value!
    rcodeEl.value        = generateCode();   // live refresh
  }
});

/* mutually-exclusive buttons for code generation */
labelSwitch.addEventListener('click', e => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;

  /* visual state */
  labelSwitch.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b === btn));

  /* functional state */
  state.labelMode = btn.dataset.mode;   // 'num' | 'alpha'
  update();                             // repaint legend + canvas + code
});

/* keyboard shortcuts */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;     // Ctrl on Win/Linux, Cmd on macOS
  if (!mod || e.altKey) return;           // ignore if Alt is held

  if (e.key.toLowerCase() === 'z') {
    e.preventDefault();                   // stop the browser’s own undo
    if (e.shiftKey)   redoBtn.click();
    else              undoBtn.click();
  }
});
