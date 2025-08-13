import { state, history, PALETTE } from './state.js';
import { canvas, rowsEl, colsEl, aspectEl } from './dom.js';

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

export function expandRectToLimit(idx) {
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
    history();              // single undo step for the whole expansion
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
function pushChain(rectsIn, idx, dir, amount, rows, cols) {
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
function pullChain(rectsIn, idx, dir, amount, rows, cols){
  if (!amount) return { ok:true, applied:0, rects:rectsIn };

  // work on a copy (like pushChain)
  const rects = rectsIn.map(r => ({ ...r }));
  const A0    = rects[idx];

  // max we can shrink without collapsing to zero
  const maxS = sizeAlong(A0, dir) - 1;
  const s    = Math.min(amount, maxS);
  if (!s) return { ok:true, applied:0, rects };

  const sgn     = signOut(dir);
  const oldEdge = edgeCoord(A0, dir);
  const [o0, o1]= orthRange(A0, dir);

  // Determine neighbors at the *old* edge BEFORE we mutate A
  const group = neighborsAtCoord(rects, idx, dir, oldEdge, o0, o1);

  // Shrink the active by s
  const A = rects[idx];
  setEdge(A, dir, oldEdge - sgn * s);

  // New edge position after shrink (the freed-space inner boundary)
  const newEdge = edgeCoord(A, dir);

  // Expand neighbors to exactly meet newEdge (no relative adds — absolute clamp)
  for (const j of group) {
    const R = rects[j];
    if (dir === 'E') {
      // neighbor sits to the East; its near edge is c0
      R.c0 = Math.min(R.c0, newEdge);
      // keep ≥ 1 cell
      if (R.c1 - R.c0 < 1) R.c0 = R.c1 - 1;
    } else if (dir === 'W') {
      // neighbor sits to the West; its near edge is c1
      R.c1 = Math.max(R.c1, newEdge);
      if (R.c1 - R.c0 < 1) R.c1 = R.c0 + 1;
    } else if (dir === 'S') {
      // neighbor sits to the South; its near edge is r0
      R.r0 = Math.min(R.r0, newEdge);
      if (R.r1 - R.r0 < 1) R.r0 = R.r1 - 1;
    } else { // 'N'
      // neighbor sits to the North; its near edge is r1
      R.r1 = Math.max(R.r1, newEdge);
      if (R.r1 - R.r0 < 1) R.r1 = R.r0 + 1;
    }
  }

  return { ok:true, applied:s, rects };
}

// PUBLIC: compose for corner/edge with Shift
export function planShiftResizeComposite(rectsIn, idx, kind, target, rows, cols){
  let rects = rectsIn.map(r => ({...r}));
  let ok    = true;

  // Start from the rect as it currently is
  const A0 = rects[idx];

  // ----- Horizontal (only if grabbing E or W) -----
  let dirH = null;
  if (/E/.test(kind)) dirH = 'E';
  else if (/W/.test(kind)) dirH = 'W';

  if (dirH) {
    // delta measured at the grabbed edge
    const dH = (dirH === 'E') ? (target.c - A0.c1) : (target.c - A0.c0);
    if (dH !== 0) {
      const outward = Math.sign(dH) === signOut(dirH);   // +E/S is outward, -W/N is outward
      const amt     = Math.abs(dH);
      const res     = outward
        ? pushChain(rects, idx, dirH, amt, rows, cols)
        : pullChain(rects, idx, dirH, amt, rows, cols);
      rects = res.rects; ok = ok && res.ok;
    }
  }

  // Re-read the (possibly updated) active rect for vertical math
  const A1 = rects[idx];

  // ----- Vertical (only if grabbing N or S) -----
  let dirV = null;
  if (/S/.test(kind)) dirV = 'S';
  else if (/N/.test(kind)) dirV = 'N';

  if (dirV) {
    // delta measured at the grabbed edge
    const dV = (dirV === 'S') ? (target.r - A1.r1) : (target.r - A1.r0);
    if (dV !== 0) {
      const outward = Math.sign(dV) === signOut(dirV);
      const amt     = Math.abs(dV);
      const res     = outward
        ? pushChain(rects, idx, dirV, amt, rows, cols)
        : pullChain(rects, idx, dirV, amt, rows, cols);
      rects = res.rects; ok = ok && res.ok;
    }
  }

  return { ok, rects };
}