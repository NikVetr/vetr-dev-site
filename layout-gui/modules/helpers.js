import { state, history, PALETTE } from './state.js';
import { canvas, rowsEl, colsEl, aspectEl } from './dom.js';
import { cursor } from './controls.js';
import { repaint } from './canvas.js';

/* ---------- helpers ---------- */

/* ------ aliases / labels ------------------------------------------ */
export const nameOf = i => state.aliases[i] || 
(state.labelMode === 'alpha' ? alpha(i) : String(i + 1));
export const pastel = i => `hsl(${(i * 137.508) % 360} 70% 75%)`;

/* ------ maths ----------------------------------------------------- */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);

/* ------ grid → canvas -------------------------------------------- */
export const cell = () => ({
    w: canvas.width / state.cols,
    h: canvas.height / state.rows
});

export function cellAtPx(x, y) {
  const eps = 1e-7;
  const r = Math.floor(((y / canvas.height) * state.rows) - eps);
  const c = Math.floor(((x / canvas.width)  * state.cols) - eps);
  return {
    r: Math.min(Math.max(r, 0), state.rows - 1),
    c: Math.min(Math.max(c, 0), state.cols - 1),
  };
}

export const snap = (x, y) => {
    const {
        w,
        h
    } = cell();
    return {
        r: clamp(Math.round(y / h), 0, state.rows),
        c: clamp(Math.round(x / w), 0, state.cols)
    };
};

export const norm = ({
    r0,
    c0,
    r1,
    c1
}) => ({
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1)
});

export const zero = r => r.r0 === r.r1 || r.c0 === r.c1;
export const cor = r => [{
        r: r.r0,
        c: r.c0
    }, {
        r: r.r0,
        c: r.c1
    },
    {
        r: r.r1,
        c: r.c0
    }, {
        r: r.r1,
        c: r.c1
    }
];
export const inside = (R, p) =>
    p.r > R.r0 && p.r < R.r1 && p.c > R.c0 && p.c < R.c1;

/* --------- validity & collisions --------- */
export function ok(R, ignore = -1) {
    if (zero(R)) return false;
    const A = norm(R);

    for (let i = 0; i < state.rects.length; i++) {
        if (i === ignore) continue;
        const B = norm(state.rects[i]);

        /* forbid any positive-area intersection */
        const overlap =
            A.r0 < B.r1 && A.r1 > B.r0 && // rows overlap strictly
            A.c0 < B.c1 && A.c1 > B.c0; // cols overlap strictly
        if (overlap) return false;
    }
    return true;
}

// --- indicators ---------------------------------------------------
function setModIndicators() {
  const set = (id, {on, latched}) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.classList.toggle('latched', !!latched);
  };
  set('modIndMod',   { on: state.modActive,  latched: state.modLatch });
  set('modIndPwr',   { on: state.pwrActive,  latched: state.pwrLatch });
  set('modIndShift', { on: state.invActive,  latched: state.invLatch });
}

// compute effective = latch XOR physical-function
function recomputeEffectiveMods() {
  // derive function “Down” flags from physical keys
  state.modDown = !!(state.ctrlDown || state.cmdDown);
  state.pwrDown = !!(state.altDown  || state.optDown); // opt is alias of alt
  state.invDown = !!state.shiftDown;

  // effective (what to use everywhere in behavior)
  state.modActive = !!(state.modLatch ^ state.modDown);
  state.pwrActive = !!(state.pwrLatch ^ state.pwrDown);
  state.invActive = !!(state.invLatch ^ state.invDown);
}

export const updateMods = (e) => {
  // read physical keys from the event if present
  const next = {
    shiftDown: !!e?.shiftKey,
    altDown:   !!e?.altKey,
    ctrlDown:  !!e?.ctrlKey,
    cmdDown:   !!e?.metaKey,
    optDown:   !!e?.altKey
  };

  const changed =
      next.shiftDown !== state.shiftDown ||
      next.altDown   !== state.altDown   ||
      next.ctrlDown  !== state.ctrlDown  ||
      next.cmdDown   !== state.cmdDown   ||
      next.optDown   !== state.optDown;

  if (!changed) return;

  Object.assign(state, next);
  recomputeEffectiveMods();
  setModIndicators();
  updatePwrButtons();
  cursor();
  if (state.stickyFocus != null) repaint?.();
  //console.log('inv = ' + state.invActive + ', pwr = ' + state.pwrActive, ', mod = ' + state.modActive);
};

// public toggles for latching via chip clicks / hotkeys
export function toggleLatch(which) {
  if (which === 'mod') state.modLatch = !state.modLatch;
  if (which === 'pwr') state.pwrLatch = !state.pwrLatch;
  if (which === 'inv') state.invLatch = !state.invLatch;

  recomputeEffectiveMods();
  setModIndicators();
  if (state.stickyFocus != null) repaint?.();
}

// clear physical flags (not latches) e.g., on blur
export function clearPhysicalMods() {
  if (!state.shiftDown && !state.altDown && !state.ctrlDown && !state.cmdDown) return;
  state.shiftDown = state.altDown = state.ctrlDown = state.cmdDown = state.optDown = false;
  recomputeEffectiveMods();
  setModIndicators();
  if (state.stickyFocus != null) repaint?.();
}

/* ------ rectangle → canvas-pixel box ----------------------------- */
export const rectBox = r => {
    const {
        w,
        h
    } = cell();
    return {
        x: r.c0 * w,
        y: r.r0 * h,
        W: (r.c1 - r.c0) * w,
        H: (r.r1 - r.r0) * h
    };
};

export function deleteGlyphMetrics(b) {
  const s = Math.min(b.W, b.H);

  // Skip when the rect is super tiny
  if (s < 18) return { draw: false };

  // Pad away from the corner, scale with rect but stay sane
  const pad    = Math.max(4, Math.min(2, s * 0.12));

  // Visual font size target (device-independent; canvas will scale by DPR)
  const fontPx = Math.max(10, Math.min(20, s * 0.50));

  // Where to place the glyph (top-right, aligned "right/top")
  const x = b.x + b.W - pad;
  const y = b.y + pad;

  // Hit radius/box ~ proportional to the glyph size
  const hit = Math.max(10, fontPx * 0.65);

  return { draw: true, x, y, fontPx, hit };
}

/* ---------- rendering ---------- */
export const colorOf = i => state.colours[i] ?? '#cccccc';   // safety fallback
export const col = i => `hsl(${(i * 137.508) % 360} 70% 75%)`;

/* State serialisation */
export const b36 = n => n.toString(36);
export const i36 = s => parseInt(s, 36);

/* serialise current state → string */
export function encodeState() {
    /* rows.cols|r0c0r1c1;r0c0r1c1;…|alias1,alias2…  (all base-36) */

    const gridPart =
        b36(state.rows) + '.' + b36(state.cols) +
        ( state.aspect ? '.' + b36(Math.round(state.aspect * 1000)) : '' );

    const rects = state.rects
        .map(r => {
            const n = norm(r);
            return b36(n.r0) + b36(n.c0) + b36(n.r1) + b36(n.c1); // 4 chars / rect
        })
        .join(';');

    const aliases = state.aliases
        .map(encodeURIComponent) // protect spaces, commas…
        .join(',');

    return (
        gridPart + '|' +
        rects + '|' +
        aliases // may be empty
    );
}

/* parse string in location.hash → patch state (returns true/false) */
export function decodeState(str) {
    try {
        const [grid, rectPart = '', aliasPart = ''] = str.split('|');
        const [rowsB36, colsB36, aspectB36] = grid.split('.');
        
        const rows = i36(rowsB36);
        const cols = i36(colsB36);
        if (!rows || !cols) return false; // malformed

        const aspect = aspectB36 ? i36(aspectB36) / 1000 : null;

        const rects = rectPart ?
            rectPart.split(';').map(s => ({
                r0: i36(s[0]),
                c0: i36(s[1]),
                r1: i36(s[2]),
                c1: i36(s[3])
            })) : [];

        /* rebuild colour arrays  */
       state.pool    = [...PALETTE];
       state.colours = rects.map(_ => state.pool.shift());

        const aliases = aliasPart ?
            aliasPart.split(',').map(decodeURIComponent) : [];
        
        Object.assign(state, { rows, cols, rects, aliases, aspect });
        
        /* reflect widgets that mirror state */
        rowsEl.value = rows;
        colsEl.value = cols;
        aspectEl.value = aspect ?? '';

        //check if we should show or omit the welcome message
        if (state.rects.length > 0) {
            state.hasEverHadRect = true;   // URL provided rects → no overlay
            state.welcomeAlpha   = 0;
            state.welcomeFading  = false;
        }

        return true;

    } catch (_) {

        return false;
    }
}

/* push state into location.hash – debounced so rapid drags don’t spam */
export let urlTimer = null;
export function syncURL() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
        location.hash = encodeState();
    }, 150);
}

/* default labels */
const alpha = n => {           // 0→A, 1→B … 25→Z, 26→AA …
  let s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s;
       n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export function moveRect(idx, dr, dc) {
    const rect = state.rects[idx];
    
    // Calculate new proposed position
    const newRect = {
        r0: rect.r0 + dr,
        c0: rect.c0 + dc,
        r1: rect.r1 + dr,
        c1: rect.c1 + dc
    };

    // Check if moving would go out of bounds and adjust the deltas (dr, dc) accordingly
    if (newRect.r0 < 0) {
        dr = -rect.r0;  // Stop movement if it would go above the top
    }
    if (newRect.c0 < 0) {
        dc = -rect.c0;  // Stop movement if it would go beyond the left side
    }
    if (newRect.r1 > state.rows) {
        dr = state.rows - rect.r1;  // Stop movement if it would go beyond the bottom
    }
    if (newRect.c1 > state.cols) {
        dc = state.cols - rect.c1;  // Stop movement if it would go beyond the right side
    }

    // Apply the adjusted deltas to the rectangle's position
    const adjustedRect = {
        r0: rect.r0 + dr,
        c0: rect.c0 + dc,
        r1: rect.r1 + dr,
        c1: rect.c1 + dc
    };

    // Ensure that the rectangle stays within the grid bounds and does not overlap
    if (!ok(adjustedRect, idx)) return false;

    // Update the rectangle's position
    state.rects[idx] = adjustedRect;
    return true;
}

export function deleteRectInPlace(idx) {
  const colour = state.colours[idx];
  state.rects.splice(idx, 1);
  state.aliases.splice(idx, 1);
  state.colours.splice(idx, 1);
  state.pool.unshift(colour);
}

export function expandRect(idx, dir) {
  const R = norm(state.rects[idx]);
  let cand = { ...R };

  if (dir === 'N') { if (R.r0 === 0) return false;           cand.r0 = R.r0 - 1; }
  if (dir === 'S') { if (R.r1 === state.rows) return false;  cand.r1 = R.r1 + 1; }
  if (dir === 'W') { if (R.c0 === 0) return false;           cand.c0 = R.c0 - 1; }
  if (dir === 'E') { if (R.c1 === state.cols) return false;  cand.c1 = R.c1 + 1; }

  cand = norm(cand);
  if (cand.r0 === R.r0 && cand.r1 === R.r1 && cand.c0 === R.c0 && cand.c1 === R.c1) return false;
  if (!ok(cand, idx)) return false;

  state.rects[idx] = cand;  // (no history here; caller handles it)
  return true;
}

export function contractRect(idx, dir) {
  const R = norm(state.rects[idx]);
  const w = R.c1 - R.c0, h = R.r1 - R.r0;
  let cand = { ...R };

  if (dir === 'N') { if (h <= 1) return false; cand.r0 = R.r0 + 1; }
  if (dir === 'S') { if (h <= 1) return false; cand.r1 = R.r1 - 1; }
  if (dir === 'W') { if (w <= 1) return false; cand.c0 = R.c0 + 1; }
  if (dir === 'E') { if (w <= 1) return false; cand.c1 = R.c1 - 1; }

  cand = norm(cand);
  if (cand.r0 === R.r0 && cand.r1 === R.r1 && cand.c0 === R.c0 && cand.c1 === R.c1) return false;

  state.rects[idx] = cand;
  return true;
}

export function expandRectToLimit(idx, { recordHistory = true } = {}) {
  let R = norm(state.rects[idx]);
  let grewAny = false;

  const tryGrowSide = (side) => {
    let cand = { ...R };
    if (side === 'N') { if (R.r0 === 0) return false;            cand.r0 = R.r0 - 1; }
    if (side === 'S') { if (R.r1 === state.rows) return false;    cand.r1 = R.r1 + 1; }
    if (side === 'W') { if (R.c0 === 0) return false;            cand.c0 = R.c0 - 1; }
    if (side === 'E') { if (R.c1 === state.cols) return false;    cand.c1 = R.c1 + 1; }

    cand = norm(cand);
    if (!ok(cand, idx)) return false;

    R = cand;       // commit this single-side growth to the working rect
    return true;
  };

  // keep growing until a full pass makes no progress
  for (;;) {
    const grewThisPass = !!(tryGrowSide('N') | tryGrowSide('S') | tryGrowSide('W') | tryGrowSide('E'));
    if (!grewThisPass) break;
    grewAny = true;
  }

  if (grewAny) {
    if (recordHistory) history();
    state.rects[idx] = R;
  }
  return grewAny;
}

// center cell (floor for even dims)
export function rectCenterCell(R) {
  R = norm(R);
  const r = Math.floor((R.r0 + R.r1 - 1) / 2);
  const c = Math.floor((R.c0 + R.c1 - 1) / 2);
  return { r, c };
}

// choose target cell for keyboard shrink: cursor cell if inside, else center
export function shrinkTargetCellForKeyboard(idx) {
  const R = norm(state.rects[idx]);
  const { x, y } = state.cursorPos || { x: 0, y: 0 };
  const { r, c } = cellAtPx(x, y);
  return inside(R, { r, c }) ? { r, c } : rectCenterCell(R);
}

// one-tick grow on all sides (same as wheel expand pass)
export function growAllSidesOnce(R, idx) {
  R = norm(R);
  let cur = { ...R };
  const trySide = (side) => {
    let cand = { ...cur };
    if (side === 'N') { if (cur.r0 === 0) return false;          cand.r0 = cur.r0 - 1; }
    if (side === 'S') { if (cur.r1 === state.rows) return false;  cand.r1 = cur.r1 + 1; }
    if (side === 'W') { if (cur.c0 === 0) return false;          cand.c0 = cur.c0 - 1; }
    if (side === 'E') { if (cur.c1 === state.cols) return false;  cand.c1 = cur.c1 + 1; }
    cand = norm(cand);
    if (!ok(cand, idx)) return false;
    cur = cand;
    return true;
  };
  const grew = !!(trySide('N') | trySide('S') | trySide('W') | trySide('E'));
  return grew ? cur : null;
}

// one-tick shrink toward a target cell (wheel’s deltaY>0 path)
export function shrinkTowardCellOnce(R, tr, tc) {
  R = norm(R);
  const insideTarget = (tr >= R.r0 && tr < R.r1 && tc >= R.c0 && tc < R.c1);
  if (!insideTarget) return null;

  let nR = {
    r0: (R.r0 < tr)     ? R.r0 + 1 : R.r0,
    r1: (R.r1 > tr + 1) ? R.r1 - 1 : R.r1,
    c0: (R.c0 < tc)     ? R.c0 + 1 : R.c0,
    c1: (R.c1 > tc + 1) ? R.c1 - 1 : R.c1
  };

  // guarantee target remains inside and ≥1×1
  if (nR.r0 > tr)     nR.r0 = tr;
  if (nR.r1 < tr + 1) nR.r1 = tr + 1;
  if (nR.c0 > tc)     nR.c0 = tc;
  if (nR.c1 < tc + 1) nR.c1 = tc + 1;
  nR.r0 = Math.min(nR.r0, nR.r1 - 1);
  nR.c0 = Math.min(nR.c0, nR.c1 - 1);

  nR = norm(nR);
  return (nR.r0 !== R.r0 || nR.r1 !== R.r1 || nR.c0 !== R.c0 || nR.c1 !== R.c1) ? nR : null;
}

//shift-resize helpers
/* ================= SHIFT-RESIZE CHAIN HELPERS ================= */

const overlaps1D = (a0,a1,b0,b1) => (a0 < b1) && (a1 > b0);
const opp = d => (d==='E'?'W':d==='W'?'E':d==='S'?'N':'S');
const signOut = d => (d==='E'||d==='S') ? +1 : -1;

const edgeCoord = (R, d) => (d==='E'?R.c1 : d==='W'?R.c0 : d==='S'?R.r1 : R.r0);
const setEdge  = (R, d, v) => {
  if (d==='E') R.c1=v; else if (d==='W') R.c0=v;
  else if (d==='S') R.r1=v; else R.r0=v;
};
const sizeAlong = (R, d) => (d==='E'||d==='W') ? (R.c1 - R.c0) : (R.r1 - R.r0);
const orthRange = (R, d) => (d==='E'||d==='W') ? [R.r0, R.r1] : [R.c0, R.c1];

const border = (rows, cols, d) => (d==='E'?cols : d==='W'?0 : d==='S'?rows : 0);

// neighbors whose near-edge (w.r.t dir) lies exactly at coord and overlap orthogonally
function neighborsAtCoord(rects, excludeIdx, dir, coord, o0, o1) {
  const res = [];
  for (let i=0;i<rects.length;i++){
    if (i===excludeIdx) continue;
    const R = rects[i];
    const overl = (dir==='E'||dir==='W') ? overlaps1D(o0,o1,R.r0,R.r1) : overlaps1D(o0,o1,R.c0,R.c1);
    if (!overl) continue;
    if (dir==='E' && R.c0===coord) res.push(i);
    else if (dir==='W' && R.c1===coord) res.push(i);
    else if (dir==='S' && R.r0===coord) res.push(i);
    else if (dir==='N' && R.r1===coord) res.push(i);
  }
  return res;
}

// frontier ahead of pos in 'dir'; if an adjacent group is exactly at pos, return pos
function nextFrontier(rects, excludeIdx, dir, pos, o0, o1, rows, cols) {
  // treat adjacency as immediate frontier (gap=0)
  if (neighborsAtCoord(rects, excludeIdx, dir, pos, o0, o1).length) return pos;

  let f = border(rows, cols, dir);
  if (dir==='E') {
    for (let i=0;i<rects.length;i++){
      if (i===excludeIdx) continue;
      const R=rects[i];
      if (overlaps1D(o0,o1,R.r0,R.r1) && R.c0>pos) f = Math.min(f, R.c0);
    }
  } else if (dir==='W') {
    for (let i=0;i<rects.length;i++){
      if (i===excludeIdx) continue;
      const R=rects[i];
      if (overlaps1D(o0,o1,R.r0,R.r1) && R.c1<pos) f = Math.max(f, R.c1);
    }
  } else if (dir==='S') {
    for (let i=0;i<rects.length;i++){
      if (i===excludeIdx) continue;
      const R=rects[i];
      if (overlaps1D(o0,o1,R.c0,R.c1) && R.r0>pos) f = Math.min(f, R.r0);
    }
  } else { // 'N'
    for (let i=0;i<rects.length;i++){
      if (i===excludeIdx) continue;
      const R=rects[i];
      if (overlaps1D(o0,o1,R.c0,R.c1) && R.r1<pos) f = Math.max(f, R.r1);
    }
  }
  return f;
}

function shrinkGroupNearEdge(rects, group, dir, s){
  if (!s) return;
  for (const i of group){
    const R = rects[i];
    if (dir==='E') R.c0 += s;
    else if (dir==='W') R.c1 -= s;
    else if (dir==='S') R.r0 += s;
    else R.r1 -= s; // 'N'
  }
}

function collectBarriers(rects, excludeIdx, dir, pos, o0, o1, rows, cols) {
  const barriers = [];

  for (let i = 0; i < rects.length; i++) {
    if (i === excludeIdx) continue;
    const R = rects[i];
    const overl = (dir === 'E' || dir === 'W')
      ? overlaps1D(o0, o1, R.r0, R.r1)
      : overlaps1D(o0, o1, R.c0, R.c1);
    if (!overl) continue;

    if (dir === 'E' && R.c0 > pos) barriers.push(R.c0);
    else if (dir === 'W' && R.c1 < pos) barriers.push(R.c1);
    else if (dir === 'S' && R.r0 > pos) barriers.push(R.r0);
    else if (dir === 'N' && R.r1 < pos) barriers.push(R.r1);
  }

  // Add the canvas border as a last resort barrier
  const borderCoord = (dir === 'E') ? cols
                     : (dir === 'W') ? 0
                     : (dir === 'S') ? rows
                     : /* 'N' */       0;
  barriers.push(borderCoord);

  // Sort in outward order
  if (dir === 'E' || dir === 'S') barriers.sort((a, b) => a - b);      // increasing
  else                            barriers.sort((a, b) => b - a);      // decreasing

  return barriers;
}

// OUTWARD push: move active edge in 'dir' by at most 'amount', shrinking chains ahead
// returns { ok, applied, rects }
export function pushChain(rectsIn, idx, dir, amount, rows, cols) {
  if (!amount) return { ok: true, applied: 0, rects: rectsIn };

  const rects = rectsIn.map(r => ({ ...r }));
  const A     = rects[idx];
  const sgn   = signOut(dir);               // +1 for E/S, -1 for W/N
  const [o0, o1] = orthRange(A, dir);       // orthogonal span is fixed while pushing

  let pos     = edgeCoord(A, dir);          // current active edge coord
  let applied = 0;
  let ok      = true;

  const borderCoord = border(rows, cols, dir);

  while (applied < amount) {
    // If we’re already at the border, can’t move further
    if (pos === borderCoord) { ok = false; break; }

    // Who’s touching the active edge *right now*?
    const group = neighborsAtCoord(rects, idx, dir, pos, o0, o1);

    if (group.length) {
      // Need at least 2 cells along dir to shrink by 1
      const blocked = group.some(i => sizeAlong(rects[i], dir) <= 1);
      if (blocked) { ok = false; break; }

      // Shrink everyone touching this edge by 1, then advance the edge by 1
      shrinkGroupNearEdge(rects, group, dir, 1);
      pos += sgn * 1;
      applied += 1;
      continue;
    }

    // No neighbor at the edge → this cell is free space (gap). Just move 1.
    const nextPos = pos + sgn * 1;
    // Don’t cross border
    if ((sgn > 0 && nextPos > borderCoord) || (sgn < 0 && nextPos < borderCoord)) {
      ok = false; break;
    }
    pos = nextPos;
    applied += 1;
  }

  // Commit the active edge to where we actually got
  setEdge(A, dir, pos);

  return { ok, applied, rects };
}

// INWARD pull: shrink active by 'amount' and let its immediate neighbors
// expand into freed space; to create that room, chains *behind* them are pushed
// in the opposite direction (reusing pushChain). Returns { ok, applied, rects }.
export function pullChain(rectsIn, idx, dir, amount, rows, cols) {
  if (!amount) return { ok: true, applied: 0, rects: rectsIn };

  // Work on a fresh copy
  const rects = rectsIn.map(r => ({ ...r }));
  const A     = rects[idx];

  const sgn        = signOut(dir);     // +1 for E/S, -1 for W/N
  const oppDir     = opp(dir);         // neighbors expand toward this
  const [o0, o1]   = orthRange(A, dir);

  // Max we can shrink active without collapsing
  const maxS = sizeAlong(A, dir) - 1;
  const want = Math.min(amount, maxS);
  if (!want) return { ok: true, applied: 0, rects };

  let applied = 0;
  let ok      = true;

  // Edge position we’re shrinking from (moves inward each step)
  let edgePos = edgeCoord(A, dir);

  while (applied < want) {
    // 1) Find neighbors *currently* touching the active's edge
    const group = neighborsAtCoord(rects, idx, dir, edgePos, o0, o1);
    // Shrink the active inward by 1 cell immediately (this frees one cell)
    setEdge(A, dir, edgePos - sgn * 1);
    const newEdge = edgeCoord(A, dir); // for reference

    if (!group.length) {
      // No one to pull along: just leave a 1-cell gap this step (allowed).
      edgePos = newEdge;
      applied += 1;
      continue;
    }

    // 2) Collect *all* blockers that sit at the neighbors’ expansion edge.
    // Neighbors expand toward oppDir; blockers sit at each neighbor's near edge in oppDir.
    const blockers = new Set();
    for (const j of group) {
      const Rn = rects[j];
      const [no0, no1] = orthRange(Rn, oppDir);    // neighbor's orth span
      const nEdge = edgeCoord(Rn, oppDir);         // near edge in oppDir (the side we move)
      // union of blockers across all neighbors (deduplicated)
      neighborsAtCoord(rects, j, oppDir, nEdge, no0, no1).forEach(k => blockers.add(k));
    }

    // 3) If any blocker is at min-size in this axis, the whole step is blocked.
    let blocked = false;
    for (const k of blockers) {
      if (sizeAlong(rects[k], oppDir) <= 1) { blocked = true; break; }
    }
    if (blocked) { ok = false; break; }

    // 4) Shrink every blocker by 1 toward oppDir (once per step, no duplicates).
    if (blockers.size) {
      const grp = Array.from(blockers);
      shrinkGroupNearEdge(rects, grp, oppDir, 1);
    }

    // 5) Now expand *all* pulled neighbors by 1 toward the active (into the freed space).
    for (const j of group) {
      const Rn = rects[j];
      if (oppDir === 'W')      Rn.c0 -= 1;
      else if (oppDir === 'E') Rn.c1 += 1;
      else if (oppDir === 'N') Rn.r0 -= 1;
      else                     Rn.r1 += 1;

      // keep ≥1×1 safety (very defensive; should not trigger if blockers handled)
      if (Rn.c1 - Rn.c0 < 1) Rn.c1 = Rn.c0 + 1;
      if (Rn.r1 - Rn.r0 < 1) Rn.r1 = Rn.r0 + 1;
    }

    // Move inward to the new edge and count the step
    edgePos = newEdge;
    applied += 1;
  }

  return { ok, applied, rects };
}

// PUBLIC: compose for corner/edge with Shift
export function planShiftResizeComposite(rectsIn, idx, kind, target, rows, cols) {
  let rects = rectsIn.map(r => ({ ...r }));
  let ok    = true;

  // Helper: detect which horizontal/vertical edge was actually grabbed
  const dirH = /E/.test(kind) ? 'E' : /W/.test(kind) ? 'W' : null;
  const dirV = /S/.test(kind) ? 'S' : /N/.test(kind) ? 'N' : null;

  // Compute desired integer deltas *against the grabbed edges*
  const A0 = rects[idx];
  let dH = 0, dV = 0;
  if (dirH === 'E') dH = target.c - A0.c1;
  if (dirH === 'W') dH = target.c - A0.c0;
  if (dirV === 'S') dV = target.r - A0.r1;
  if (dirV === 'N') dV = target.r - A0.r0;

  // Remaining steps and outward flags
  let remH = Math.abs(dH);
  let remV = Math.abs(dV);
  const outH = dirH ? (Math.sign(dH) === signOut(dirH)) : false;
  const outV = dirV ? (Math.sign(dV) === signOut(dirV)) : false;

  // Take 1-cell steps, interleaving H then V so geometry updates in between.
  while ((remH > 0 || remV > 0) && ok) {
    if (dirH && remH > 0) {
      const resH = outH
        ? pushChain(rects, idx, dirH, 1, rows, cols)
        : pullChain(rects, idx, dirH, 1, rows, cols);
      if (resH.applied === 0) { ok = false; break; }
      rects = resH.rects;
      remH -= 1;
    }

    if (dirV && remV > 0) {
      const resV = outV
        ? pushChain(rects, idx, dirV, 1, rows, cols)
        : pullChain(rects, idx, dirV, 1, rows, cols);
      if (resV.applied === 0) { ok = false; break; }
      rects = resV.rects;
      remV -= 1;
    }
  }

  return { ok, rects };
}

// One outward tick on all four sides using pushChain (Shift-expand).
export function expandAllSidesWithPushStep(rectsIn, idx, rows, cols) {
  let rects   = rectsIn.map(r => ({ ...r }));
  let changed = false;

  for (const dir of ['N','S','W','E']) {
    const res = pushChain(rects, idx, dir, 1, rows, cols);
    if (res.applied > 0) changed = true;
    rects = res.rects;
  }
  return { rects, changed };
}

// One inward tick toward a hovered cell using pullChain (Shift-shrink).
export function shrinkTowardCellWithPullStep(rectsIn, idx, tr, tc, rows, cols) {
  let rects   = rectsIn.map(r => ({ ...r }));
  let changed = false;

  const shouldPull = (R, side) => (
    side === 'N' ? (R.r0 < tr)     :
    side === 'S' ? (R.r1 > tr + 1) :
    side === 'W' ? (R.c0 < tc)     :
                   (R.c1 > tc + 1)     // 'E'
  );

  // Try each side once; re-evaluate rect after each successful pull.
  for (const side of ['N','S','W','E']) {
    const Rnow = norm(rects[idx]);
    if (!shouldPull(Rnow, side)) continue;

    const res = pullChain(rects, idx, side, 1, rows, cols);
    if (res.applied > 0) {
      rects   = res.rects;
      changed = true;
    }
  }
  return { rects, changed };
}

// Count whether this step would *shrink* anyone at the *leading* edge.
// We treat "shrink happened" as a boolean (0/1) per step for order choice.
function moveOnceWithPullMetrics(rectsIn, idx, dir, rows, cols, opts = {}) {
  const pullTrailing = opts.pullTrailing !== false; // default = true
  let rects = rectsIn.map(r => ({ ...r }));

  // Record trailing edge before the move
  const trailing = opp(dir);
  const A0 = rects[idx];
  const [o0, o1] = orthRange(A0, dir);
  const leadCoord = edgeCoord(A0, dir);
  const trailingCoord = edgeCoord(A0, trailing);

  // Will this step shrink anyone at the leading edge?
  const leadingNeighbors = neighborsAtCoord(rects, idx, dir, leadCoord, o0, o1);
  const shrinks = leadingNeighbors.length > 0 ? 1 : 0;

  // 1) Open space by 1 cell at leading edge
  const res = pushChain(rects, idx, dir, 1, rows, cols);
  if (res.applied === 0) return { ok: false, shrinks: 0, rects: rectsIn };
  rects = res.rects;

  // 2) Complete translation: shift trailing edge 1 cell
  const A = rects[idx];
  if (dir === 'E')      A.c0 += 1;
  else if (dir === 'W') A.c1 -= 1;
  else if (dir === 'S') A.r0 += 1;
  else                  A.r1 -= 1; // 'N'

  // 3) Pull along neighbors that were attached at the *old* trailing edge
  if (pullTrailing) {
    const trailingGroup = neighborsAtCoord(rects, idx, trailing, trailingCoord, o0, o1);
    for (const j of trailingGroup) {
      const r2 = pushChain(rects, j, dir, 1, rows, cols);
      rects = r2.rects;
    }
  }

  return { ok: true, shrinks, rects };
}

// --- local helpers for zero-shrink probe ---
const overlapsStrict = (A, B) =>
  A.r0 < B.r1 && A.r1 > B.r0 && A.c0 < B.c1 && A.c1 > B.c0;

function inBounds(R, rows, cols) {
  return R.r0 >= 0 && R.c0 >= 0 && R.r1 <= rows && R.c1 <= cols &&
         (R.r1 - R.r0) >= 1 && (R.c1 - R.c0) >= 1;
}

function overlapsAny(rects, idx, cand) {
  const A = norm(cand);
  for (let i = 0; i < rects.length; i++) {
    if (i === idx) continue;
    const B = norm(rects[i]);
    if (overlapsStrict(A, B)) return true;
  }
  return false;
}

// Try a pure translation by exactly 1 cell along dir with NO changes to others.
function canTranslateOne(rectsIn, idx, dir, rows, cols) {
  const rects = rectsIn; // read only
  const A0 = rects[idx];
  let cand = { ...A0 };

  if (dir === 'E') { cand.c0 += 1; cand.c1 += 1; }
  else if (dir === 'W'){ cand.c0 -= 1; cand.c1 -= 1; }
  else if (dir === 'S'){ cand.r0 += 1; cand.r1 += 1; }
  else /* 'N' */        { cand.r0 -= 1; cand.r1 -= 1; }

  cand = norm(cand);
  if (!inBounds(cand, rows, cols)) return { ok:false, rects:rectsIn };
  if (overlapsAny(rects, idx, cand)) return { ok:false, rects:rectsIn };

  const out = rects.map(r => ({...r}));
  out[idx] = cand;
  return { ok:true, rects: out };
}

function expandOneToward(rects, j, dir, rows, cols) {
  const R = rects[j];
  if (dir === 'E')      { if (R.c1 < cols) R.c1 += 1; }
  else if (dir === 'W') { if (R.c0 > 0)    R.c0 -= 1; }
  else if (dir === 'S') { if (R.r1 < rows) R.r1 += 1; }
  else /* dir === 'N' */{ if (R.r0 > 0)    R.r0 -= 1; }
  // safety: keep ≥ 1×1
  if (R.c1 - R.c0 < 1) R.c1 = R.c0 + 1;
  if (R.r1 - R.r0 < 1) R.r1 = R.r0 + 1;
}

// Expand all pre-step trailing neighbors into the 1-cell strip freed by moving idx
// one step in `dir`. Use pushChain so we *respect other rectangles*.
// If any neighbor cannot expand (blocked at min-size), abort the gapless step.
function fillTrailingStrip(rectsBefore, rectsAfter, idx, dir, rows, cols) {
  const trailing = opp(dir);
  const A0       = rectsBefore[idx];            // pre-step geometry = reference
  const [o0, o1] = orthRange(A0, dir);
  const trailPos = edgeCoord(A0, trailing);

  // neighbors that *shared the original trailing edge* (don’t glue new ones mid-step)
  const trailingIdxs = neighborsAtCoord(rectsBefore, idx, trailing, trailPos, o0, o1);

  let rects = rectsAfter.map(r => ({ ...r }));  // work on a copy we can mutate

  for (const j of trailingIdxs) {
    // Try to expand this neighbor 1 cell toward `dir` while shrinking blockers if needed.
    const res = pushChain(rects, j, dir, 1, rows, cols);
    if (res.applied === 0) {
      // Couldn’t fill without violating min-size / borders → abort gapless
      return { ok: false, rects: rectsAfter };
    }
    rects = res.rects;
  }
  return { ok: true, rects };
}

// Pure-translate if possible, then *safely* pull trailing neighbors into the freed strip.
// If filling the strip can’t be done safely, report failure so caller can fall back.
function tryGaplessTranslateOne(rectsIn, idx, dir, rows, cols, opts = {}) {
  const t = canTranslateOne(rectsIn, idx, dir, rows, cols);
  if (!t.ok) return t;

  if (opts.pullTrailing === false) {
    return t; // ok, gapless move with no trailing fill on this half-tick
  }

  const after = t.rects.map(r => ({ ...r }));                 // copy before filling
  const filled = fillTrailingStrip(rectsIn, after, idx, dir, rows, cols);
  return filled.ok ? filled : { ok: false, rects: rectsIn };
}

export function planPwrMoveStep(rectsIn, idx, dr, dc, rows, cols, opts = {}) {
  const allowSinglePull = (opts.allowSinglePull !== false); // default true
  if (!dr && !dc) return { ok: true, rects: rectsIn };

  // Single axis
  if (dc && !dr) {
    const dirH = dc > 0 ? 'E' : 'W';
    const gapless = tryGaplessTranslateOne(rectsIn, idx, dirH, rows, cols, { pullTrailing: allowSinglePull });
    if (gapless.ok) return gapless; // ✅ pull trailing neighbors safely
    const h = moveOnceWithPullMetrics(rectsIn, idx, dirH, rows, cols); // fallback
    return h.ok ? { ok:true, rects:h.rects } : { ok:false, rects:rectsIn };
  }
  if (dr && !dc) {
    const dirV = dr > 0 ? 'S' : 'N';
    const gapless = tryGaplessTranslateOne(rectsIn, idx, dirV, rows, cols, { pullTrailing: allowSinglePull });
    if (gapless.ok) return gapless;
    const v = moveOnceWithPullMetrics(rectsIn, idx, dirV, rows, cols, { pullTrailing: allowSinglePull });
    return v.ok ? { ok:true, rects:v.rects } : { ok:false, rects:rectsIn };
  }

  // ----- diagonal tick: NO-PULL on first half, PULL on second -----
    const dirH = dc > 0 ? 'E' : 'W';
    const dirV = dr > 0 ? 'S' : 'N';

    // Gapless H→V
    const H1 = tryGaplessTranslateOne(rectsIn, idx, dirH, rows, cols, { pullTrailing:false });
    if (H1.ok) {
      const HV = tryGaplessTranslateOne(H1.rects, idx, dirV, rows, cols, { pullTrailing:true });
      if (HV.ok) return HV;
    }

    // Gapless V→H
    const V1 = tryGaplessTranslateOne(rectsIn, idx, dirV, rows, cols, { pullTrailing:false });
    if (V1.ok) {
      const VH = tryGaplessTranslateOne(V1.rects, idx, dirH, rows, cols, { pullTrailing:true });
      if (VH.ok) return VH;
    }

    // If only one axis can move gaplessly, keep your behavior
    if (H1.ok) return H1;
    if (V1.ok) return V1;

    // Aggressive single-axis progress (unchanged except explicit pullTrailing)
    const H2 = moveOnceWithPullMetrics(rectsIn, idx, dirH, rows, cols, { pullTrailing:true });
    if (H2.ok) return { ok: true, rects: H2.rects };
    const V2 = moveOnceWithPullMetrics(rectsIn, idx, dirV, rows, cols, { pullTrailing:true });
    if (V2.ok) return { ok: true, rects: V2.rects };

    // Fallback chooser with the same no-pull-first policy
    const H = moveOnceWithPullMetrics(rectsIn, idx, dirH, rows, cols, { pullTrailing:false });
    const HV = H.ok ? moveOnceWithPullMetrics(H.rects, idx, dirV, rows, cols, { pullTrailing:true })
                    : { ok:false, rects:rectsIn };

    const V = moveOnceWithPullMetrics(rectsIn, idx, dirV, rows, cols, { pullTrailing:false });
    const VH = V.ok ? moveOnceWithPullMetrics(V.rects, idx, dirH, rows, cols, { pullTrailing:true })
                    : { ok:false, rects:rectsIn };

    if (H.ok && HV.ok) return { ok:true, rects: HV.rects };
    if (V.ok && VH.ok) return { ok:true, rects: VH.rects };
    if (H.ok)          return { ok:true, rects: H.rects  };
    if (V.ok)          return { ok:true, rects: V.rects  };

    return { ok:false, rects: rectsIn };
}

//Fill button functionality

// Build an occupancy grid of the current layout (0 = empty, 1 = covered)
export function buildOccupancy(rects, rows, cols) {
  const occ = Array.from({ length: rows }, () => new Uint8Array(cols));
  for (const r0 of rects) {
    const r = norm(r0);
    for (let rr = r.r0; rr < r.r1; rr++) {
      for (let cc = r.c0; cc < r.c1; cc++) {
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) occ[rr][cc] = 1;
      }
    }
  }
  return occ;
}

export function hasEmptyCell(occ) {
  for (let r = 0; r < occ.length; r++) {
    const row = occ[r];
    for (let c = 0; c < row.length; c++) if (row[c] === 0) return true;
  }
  return false;
}

// Is the immediate stripe next to side 'side' empty anywhere?
export function adjacentEmptyAtSide(occ, R0, side, rows, cols) {
  const R = norm(R0);
  if (side === 'E') {
    if (R.c1 >= cols) return false;
    for (let rr = R.r0; rr < R.r1; rr++) if (occ[rr][R.c1] === 0) return true;
    return false;
  }
  if (side === 'W') {
    if (R.c0 - 1 < 0) return false;
    for (let rr = R.r0; rr < R.r1; rr++) if (occ[rr][R.c0 - 1] === 0) return true;
    return false;
  }
  if (side === 'S') {
    if (R.r1 >= rows) return false;
    for (let cc = R.c0; cc < R.c1; cc++) if (occ[R.r1][cc] === 0) return true;
    return false;
  }
  // 'N'
  if (R.r0 - 1 < 0) return false;
  for (let cc = R.c0; cc < R.c1; cc++) if (occ[R.r0 - 1][cc] === 0) return true;
  return false;
}

// Small helper: randomize side order to avoid bias
export function shuffledSides() {
  const a = ['N','S','W','E'];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

//pwr mode indicator for buttons on hover
// --- Power-aware buttons registry ------------------------------------------
const _pwrBtnMap = new Map(); // el -> { classOn, tipPower, baseTip, tipDefault }

/** Update a single registered button based on hover + power modifier. */
function _updateOnePwrBtn(el) {
  const opts = _pwrBtnMap.get(el);
  if (!opts) return;
  const hovered = el.matches(':hover');
  const power = hovered && !!state.pwrActive;

  el.classList.toggle(opts.classOn, power);

  // Tooltip handling (optional)
  if (opts.tipPower || opts.baseTip) {
    el.dataset.tip = power
      ? (opts.tipPower || opts.baseTip)
      : (opts.tipDefault || opts.baseTip);
  }
}

/** Exported: call to refresh all power-aware buttons (e.g. when Alt changes). */
export function updatePwrButtons() {
  for (const el of _pwrBtnMap.keys()) _updateOnePwrBtn(el);
}

/**
 * Exported: make any button "power-aware".
 * @param {HTMLElement} el  Button element
 * @param {object} opts     { classOn='power', tipPower, tipDefault }
 */
export function registerPwrButton(el, opts = {}) {
  if (!el) return () => {};

  const cfg = {
    classOn: 'power',
    tipPower: undefined,
    tipDefault: undefined,
    baseTip: el.dataset.tip || '',
    ...opts,
  };
  _pwrBtnMap.set(el, cfg);

  const refresh = () => _updateOnePwrBtn(el);
  el.addEventListener('mouseenter', refresh);
  el.addEventListener('mouseleave', refresh);

  // Initial hydration
  _updateOnePwrBtn(el);

  // Return disposer if you ever need to unbind
  return () => {
    el.removeEventListener('mouseenter', refresh);
    el.removeEventListener('mouseleave', refresh);
    _pwrBtnMap.delete(el);
    el.classList.remove(cfg.classOn);
    if (cfg.baseTip) el.dataset.tip = cfg.baseTip;
  };
}
