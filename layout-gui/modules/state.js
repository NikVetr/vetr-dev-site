import {
  rowsEl, colsEl,
  showGridEl, squareEl, showIdxEl
} from './dom.js';
import { update }                from './controls.js';
import { syncURL, pastel }               from './helpers.js';

//define a color palette
export const PALETTE = Array.from({length:40}, (_,i) => pastel(i));

export const state = {
    rows: +rowsEl.value,
    cols: +colsEl.value,

    showGrid: showGridEl.checked,
    square: squareEl.checked,
    showIdx: showIdxEl.checked,

    rects: [],
    aliases: [],
    pool : [...PALETTE],
    colours : [],
    mode: 'idle',
    active: -1,
    start: null,
    hover: null,
    past: [],
    future: [],
    aspect: null,
    cursorPos: { x: 0, y: 0 },
    focus : null, 
    prevFocus : null,
    labelMode : 'num'
};

/* ---------- history ---------- */
export const history = () => {
    state.past.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases : state.aliases,
        colours: state.colours,
        pool: state.pool
    }));
    if (state.past.length > 100) state.past.shift();
    state.future.length = 0;
};

export const applySnap = snap => {
    const o = JSON.parse(snap);
    Object.assign(state, {
        rows: o.rows,
        cols: o.cols,
        rects: o.rects,
        aliases : o.aliases,
        colours: o.colours,
        pool : o.pool
    });
    rowsEl.value = o.rows;
    colsEl.value = o.cols;
    update();
    syncURL();
};