/* events.js (no exports – listeners only) --------------------------- */

import {
  canvas, legendList, copyBtn, trimBtn, reduceBtn, expandBtn,
  clearBtn, undoBtn, redoBtn, exportBtn, importBtn,
  darkEl, rowsEl, colsEl, squareEl, showIdxEl, showGridEl,
  renderRadios, rcodeEl, aspectEl, labelSwitch,
  helpBtn, helpModal, helpClose, helpBackdrop, helpContent

} from './dom.js';

import { state, history, applySnap, PALETTE }          from './state.js';
import {
  nameOf, clamp, gcd, snap, norm, ok, rectBox, col,
  syncURL, cell, cellAtPx, moveRect, deleteRect, expandRect, contractRect,
  growAllSidesOnce, shrinkTowardCellOnce, shrinkTargetCellForKeyboard,
  expandRectToLimit
} from './helpers.js';

import {
  repaint, grid, drawRects, drawPreview, drawLiveTransform, indices, updateMods
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
const { x, y } = pos(e);
const hv = hit(x, y);

// 1) dbl-click ON an existing rect → rename (unchanged)
if (hv && hv.kind === 'inside') {
    const idx = hv.idx;
    const current = state.aliases[idx] || '';
    const name = prompt('Rectangle name:', current);
    if (name == null) return;
    history();
    state.aliases[idx] = name.trim();
    update();
    syncURL();
    return;
}

  // 2) dbl-click NOT on a rect → create a 1×1 rect at the cell under the pointer
    const { r, c } = cellAtPx(x, y);
    const R = norm({ r0: r, c0: c, r1: r + 1, c1: c + 1 });

    if (!ok(R)) return;

    history();
    state.rects.push(R);
    state.aliases.push('');
    const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`;
    state.colours.push(colour);

    // NEW: focus the freshly created rectangle (so the wheel works immediately)
    const newIdx   = state.rects.length - 1;
    state.focus    = newIdx;                  // used by wheel listener + canvas tint
    // optional: make hover consistent with focus
    state.hover    = { kind: 'inside', idx: newIdx };

    update();
    // optional: if you want the legend row to show the .focus style immediately:
    requestAnimationFrame(() => {
    legendList.querySelector(`.legend-item[data-idx="${newIdx}"]`)
            ?.classList.add('focus');
    });
});

// Helper function to toggle sticky focus... can maybe move into helpers later
function toggleStickyFocus(hv) {
    if (hv && state.mode === 'idle') {
        if (state.stickyFocus === null) {
            state.stickyFocus = hv.idx;  // Set sticky focus
        } else if (state.stickyFocus === hv.idx) {
            state.stickyFocus = null;  // Remove sticky focus
        } else {
            state.stickyFocus = hv.idx;  // Switch focus to the new rectangle
        }
    } else if (!hv && state.stickyFocus !== null) {
        state.stickyFocus = null;  // Remove sticky focus if clicked outside
    }
}

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

    const { x, y } = pos(e);
    const hv = hit(x, y);  // Check if the mouse is inside a rectangle
    let moved = false; // Track if a move or resize has happened

    if (state.mode === 'drawing') {

        //first clear stickyfocus
        state.stickyFocus = null
        repaint();

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
        const movedRect = {
            r0: R.r0 + dr,
            c0: R.c0 + dc,
            r1: R.r1 + dr,
            c1: R.c1 + dc
        };
        if (dr || dc) {
            history();
            state.rects[state.active] = movedRect;
            if(state.active !== state.stickyFocus){
                state.stickyFocus = null;
                repaint();
            }
            moved = true;  // Track that the rectangle has moved
        }
        state.mode = 'idle';
        update();
        syncURL();
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
            if (state.active !== state.stickyFocus) {
                state.stickyFocus = null;
                repaint();
            }
            moved = true;  // Track that the rectangle has moved
        }
        state.mode = 'idle';
        update();
        syncURL();
    }

    if (!moved) {
        toggleStickyFocus(hv);  // Call the dedicated function to toggle sticky focus
        repaint();  // Redraw the canvas with updated focus
    }

});


canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'idle' || state.focus == null) return;
  e.preventDefault();

  const { x, y } = pos(e);
  const { r: tr, c: tc } = cellAtPx(x, y);
  const idx = state.focus;
  const R   = norm(state.rects[idx]);

  let next = null;

  if (e.deltaY > 0) {
    // shrink toward hovered cell
    next = shrinkTowardCellOnce(R, tr, tc);
  } else if (e.deltaY < 0) {
    // expand one tick on all sides
    next = growAllSidesOnce(R, idx);
  }

  if (next) {
    history();
    state.rects[idx] = next;
    update();
    syncURL();
  }
}, { passive: false });


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

//events for undo / redo
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;     // Ctrl on Win/Linux, Cmd on macOS
  if (!mod || e.altKey) return;           // ignore if Alt is held

  if (e.key.toLowerCase() === 'z') {
    e.preventDefault();                   // stop the browser’s own undo
    if (e.shiftKey)   redoBtn.click();
    else              undoBtn.click();
  }
});

/*
//events for moving a sticky focused rectangle
document.addEventListener('keydown', e => {
    
    // Only proceed if stickyFocus is set and focus is on the canvas
    //if (state.stickyFocus !== null && state.focusSource === 'canvas') {
    if (state.stickyFocus !== null) {

        const idx = state.stickyFocus;  // Get the sticky-focused rectangle index
        let moved = false;

        switch (e.key) {
            case 'ArrowLeft':
                moved = moveRect(idx, 0, -1);  // Move rectangle up
                break;
            case 'ArrowRight':
                moved = moveRect(idx, 0, 1);  // Move rectangle down
                break;
            case 'ArrowUp':
                moved = moveRect(idx, -1, 0);  // Move rectangle left
                break;
            case 'ArrowDown':
                moved = moveRect(idx, 1, 0);  // Move rectangle right
                break;
            case 'Delete':
                deleteRect(idx);  // Delete focused rectangle
                break;
            default:
                break;
        }

        if (moved) {
            update();
            syncURL();
        }
    }
});
*/

document.addEventListener('keydown', e => {
  // nothing to do if no sticky focus AND the key isn't Tab (which can set it)
  const hasFocus = state.stickyFocus !== null;

  // --- Tab / Shift+Tab: cycle sticky focus with rollover
  if (e.key === 'Tab') {
    const n = state.rects.length;
    if (!n) return;
    e.preventDefault();

    if (!hasFocus) {
      state.stickyFocus = e.shiftKey ? (n - 1) : 0;
    } else {
      const delta = e.shiftKey ? -1 : 1;
      state.stickyFocus = (state.stickyFocus + delta + n) % n;
    }
    state.focusSource = 'canvas';
    repaint();
    return;
  }

  if (!hasFocus) return; // from here on we need a sticky focused rect

  const idx = state.stickyFocus;
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  let changed = false;

  // --- Cmd/Ctrl + Enter: expand to maximum
  if ((e.key === 'Enter' || e.key === 'NumpadEnter') && ctrl) {
    e.preventDefault();
    // expand to limit using your existing helper
    changed = expandRectToLimit(idx);
    if (changed) { update(); syncURL(); }
    return;
  }

  // --- Cmd/Ctrl + '+' / '-' one-tick grow/shrink (wheel semantics)
  if (ctrl) {
    const isPlus  = (e.key === '+' || e.key === '=' || e.key === 'Add');
    const isMinus = (e.key === '-' || e.key === 'Subtract');

    if (isPlus || isMinus) {
      e.preventDefault(); // stop browser zoom
      const R = norm(state.rects[idx]);
      let next = null;

      if (isPlus) {
        next = growAllSidesOnce(R, idx);
      } else { // isMinus
        const { r: tr, c: tc } = shrinkTargetCellForKeyboard(idx);
        next = shrinkTowardCellOnce(R, tr, tc);
      }

      if (next) {
        history();
        state.rects[idx] = next;
        update();
        syncURL();
      }
      return;
    }
  }

  switch (e.key) {
    case 'Delete': {
      e.preventDefault();
      const old = idx;
      history();
      // deleteRect already does history() in your version; if so, remove the history() above
      deleteRect(old);            // does update() + syncURL()
      if (state.rects.length) {
        state.stickyFocus = Math.min(old, state.rects.length - 1);
        state.focusSource = 'canvas';
      } else {
        state.stickyFocus = null;
        state.focusSource = null;
      }
      repaint();
      return;
    }

    case 'ArrowLeft':
      if (ctrl && shift) { changed = contractRect(idx, 'E'); }
      else if (ctrl)     { changed = expandRect(idx, 'W'); }
      else               { changed = moveRect(idx, 0, -1); }
      break;

    case 'ArrowRight':
      if (ctrl && shift) { changed = contractRect(idx, 'W'); }
      else if (ctrl)     { changed = expandRect(idx, 'E'); }
      else               { changed = moveRect(idx, 0,  1); }
      break;

    case 'ArrowUp':
      if (ctrl && shift) { changed = contractRect(idx, 'S'); }
      else if (ctrl)     { changed = expandRect(idx, 'N'); }
      else               { changed = moveRect(idx, -1, 0); }
      break;

    case 'ArrowDown':
      if (ctrl && shift) { changed = contractRect(idx, 'N'); }
      else if (ctrl)     { changed = expandRect(idx, 'S'); }
      else               { changed = moveRect(idx,  1, 0); }
      break;

    default:
      return; // not a key we handle
  }

  if (changed) {
    e.preventDefault();   // stop page scroll / key repeat side-effects
    history();
    update();
    syncURL();
  }
});

//visual modifiers for stickyfocus
document.addEventListener('keydown', updateMods);
document.addEventListener('keyup',   updateMods);
// When the window loses focus, clear modifiers (prevents stuck visuals)
window.addEventListener('blur', () => {
  if (state.modDown || state.shiftDown) {
    state.modDown = false;
    state.shiftDown = false;
    if (state.stickyFocus != null) repaint();
  }
});

//help information
// Detect platform modifier label
const MOD_LABEL = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// Build the modal content (HTML) — uses your current behaviors
function renderHelpHTML() {
  return `
  <div class="controls-grid">
    <div class="section">
      <h3>Canvas — Mouse</h3>
      <div class="row"><span class="chip">Click</span> <span class="desc">Toggle sticky focus on a rectangle; click empty grid to clear</span></div>
      <div class="row"><span class="kbd">Click + drag</span> <span class="desc">Draw new rectangle (empty space) or move (inside rect) or resize (edge/corner)</span></div>
      <div class="row"><span class="kbd">Double-click (rect)</span> <span class="desc">Rename rectangle</span></div>
      <div class="row"><span class="kbd">Double-click (empty)</span> <span class="desc">Create 1×1 rectangle at cell</span></div>
      <div class="row"><span class="chip">Scroll</span> <span class="desc">On highlighted rect: expand (up) on all sides; shrink (down) toward hovered cell</span></div>
      <div class="row"><span class="kbd">× (red)</span> <span class="desc">Delete rectangle</span></div>
    </div>

    <div class="section">
      <h3>Canvas — Keyboard (requires sticky focus)</h3>
      <div class="row"><span class="kbd">Tab</span>/<span class="kbd">Shift</span><span class="kbd">Tab</span> <span class="desc">Cycle focused rectangle (rollover)</span></div>
      <div class="row"><span class="kbd">←</span><span class="kbd">→</span><span class="kbd">↑</span><span class="kbd">↓</span> <span class="desc">Move rectangle by 1 cell (blocked by borders/overlap)</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">←/→/↑/↓</span> <span class="desc">Expand 1 cell from that side</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Shift</span> + <span class="kbd">←/→/↑/↓</span> <span class="desc">Contract 1 cell from that side</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Enter</span> <span class="desc">Expand to maximum space</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">+</span> / <span class="kbd">−</span> <span class="desc">Grow/shrink 1 tick (same as scroll)</span></div>
      <div class="row"><span class="kbd">Delete</span> <span class="desc">Delete focused rectangle</span></div>
    </div>

    <div class="section">
      <h3>Legend</h3>
      <div class="row"><span class="kbd">Drag rows</span> <span class="desc">Reorder rectangles (color/name travel with it)</span></div>
      <div class="row"><span class="kbd">Hover row</span> <span class="desc">Highlight rectangle in canvas</span></div>
    </div>

    <div class="section">
      <h3>History & Export</h3>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Z</span> <span class="desc">Undo</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Shift</span> + <span class="kbd">Z</span> <span class="desc">Redo</span></div>
      <div class="row"><b>Export / Import</b> <span class="desc">JSON snapshot; shareable URL is updated automatically</span></div>
    </div>
  </div>`;
}

// Open/close helpers (with focus trap)
let _helpPrevFocus = null;

function openHelp() {
  helpContent.innerHTML = renderHelpHTML();
  helpModal.classList.remove('hidden');
  helpModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  _helpPrevFocus = document.activeElement;
  helpClose.focus();
}

function closeHelp() {
  helpModal.classList.add('hidden');
  helpModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (_helpPrevFocus && _helpPrevFocus instanceof HTMLElement) _helpPrevFocus.focus();
}

// click + keyboard bindings
helpBtn?.addEventListener('click', openHelp);
helpClose?.addEventListener('click', closeHelp);
helpBackdrop?.addEventListener('click', closeHelp);

// ESC closes
document.addEventListener('keydown', (e) => {
  if (helpModal.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeHelp();
  }
});

// focus trap inside modal
helpModal.addEventListener('keydown', (e) => {
  if (helpModal.classList.contains('hidden')) return;
  if (e.key !== 'Tab') return;

  const focusables = helpModal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last  = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
});

// Optional: keyboard 'H' toggles help
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'h') return;
  // avoid typing in inputs
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (helpModal.classList.contains('hidden')) openHelp();
  else closeHelp();
});
