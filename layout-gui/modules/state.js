import {
  rowsEl, colsEl,
  showGridEl, squareEl, showIdxEl
} from './dom.js';
import { update }                from './controls.js';
import { syncURL }               from './helpers.js';

export const state = {
    rows: +rowsEl.value,
    cols: +colsEl.value,

    showGrid: showGridEl.checked,
    square: squareEl.checked,
    showIdx: showIdxEl.checked,

    rects: [],
    aliases: [],
    mode: 'idle',
    active: -1,
    start: null,
    hover: null,
    past: [],
    future: [],
    aspect: null,
    cursorPos: { x: 0, y: 0 },
    focus : null, prevFocus : null
};

/* ---------- history ---------- */
export const history = () => {
    state.past.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects
    }));
    if (state.past.length > 100) state.past.shift();
    state.future.length = 0;
};

export const applySnap = snap => {
    const o = JSON.parse(snap);
    Object.assign(state, {
        rows: o.rows,
        cols: o.cols,
        rects: o.rects
    });
    rowsEl.value = o.rows;
    colsEl.value = o.cols;
    update();
    syncURL();
};