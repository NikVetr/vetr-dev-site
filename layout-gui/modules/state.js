import {
  rowsEl, colsEl,
  showGridEl, squareEl, showIdxEl
} from './dom.js';
import { update }                from './controls.js';
import { syncURL, pastel }               from './helpers.js';

//define a color palette
export const PALETTE = Array.from({length:40}, (_,i) => pastel(i));

export const state = {

    //aesthetic parameters
    showGrid: showGridEl.checked,
    square: squareEl.checked,
    showIdx: showIdxEl.checked,

    //fundamental canvas parameters
    rows: +rowsEl.value,
    cols: +colsEl.value,
    rects: [],
    aliases: [],
    pool : [...PALETTE],
    colours : [],
    mode: 'idle',
    active: -1,
    
    //monitor parameters for user actions
    start: null,
    hover: null,
    past: [],
    future: [],
    aspect: null,
    cursorPos: { x: 0, y: 0 },
    focus : null, 
    stickyFocus : null,
    focusSource : null,
    prevFocus : null,
    labelMode : 'num',
    modalOpen: false,

    //keyboard modifier keys
    modDown: false,
    shiftDown: false,

    //initial canvas welcome message
    hasEverHadRect: false,
    welcomeAlpha: 1,
    welcomeFading: false
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