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