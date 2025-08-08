import { state } from './state.js';
import { canvas, rowsEl, colsEl, aspectEl } from './dom.js';

/* ---------- helpers ---------- */

/* ------ aliases / labels ------------------------------------------ */
export const nameOf = i => state.aliases[i] || String(i + 1);
export const labelOf = i => state.aliases?.[i] || String(i + 1);

/* ------ maths ----------------------------------------------------- */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);

/* ------ grid → canvas -------------------------------------------- */
export const cell = () => ({
    w: canvas.width / state.cols,
    h: canvas.height / state.rows
});
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

/* ---------- rendering ---------- */
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

        const aliases = aliasPart ?
            aliasPart.split(',').map(decodeURIComponent) : [];
        
        Object.assign(state, { rows, cols, rects, aliases, aspect });
        
        /* reflect widgets that mirror state */
        rowsEl.value = rows;
        colsEl.value = cols;
        aspectEl.value = aspect ?? '';
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