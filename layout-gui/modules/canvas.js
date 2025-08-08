import { canvas }                   from './dom.js';
import { state }         from './state.js';
import {
  norm, rectBox, col, nameOf, cell,
  snap, clamp, ok
}                                   from './helpers.js';
import { maxDelta }                 from './controls.js';

/* ------ canvas context ------------------------------------------- */
export const ctx = canvas.getContext('2d', {alpha: false});

/* Grid and helpers */
export function crisp(v, max, dpr) {
    let p = Math.round(v) + 0.5 / dpr; // centre the 1-px stroke
    if (p > max - 0.5) p = max - 0.5; // keep it inside the bitmap
    return p;
}

export function grid() {
    if (!state.showGrid) return;

    ctx.save();
    const d = window.devicePixelRatio || 1;

    ctx.lineWidth = window.devicePixelRatio >= 2 ? 1 : 2;
    ctx.strokeStyle = getComputedStyle(document.body)
        .getPropertyValue('--canvas-grid').trim() || '#d0d0d0';

    /* verticals */
    for (let c = 0; c <= state.cols; c++) {
        const x = crisp(c * canvas.width / state.cols, canvas.width, d);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    /* horizontals */
    for (let r = 0; r <= state.rows; r++) {
        const y = crisp(r * canvas.height / state.rows, canvas.height, d);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();
}

/* TODO: rectangle color code */

/* Text */
export function drawTextFixed(xCSS, yCSS, txt,
    align = 'center',
    font = 'bold 16px system-ui') {

    /* canvas’ displayed size, not its internal bitmap */
    const box = canvas.getBoundingClientRect();
    const scaleX = box.width / box.height;
    const invX = 1 / scaleX;

    ctx.save();
    ctx.scale(invX, 1); // undo the horizontal stretch
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    /* pre‑scale x so the glyph lands correctly after inverse scaling */
    ctx.fillText(txt, xCSS * scaleX, yCSS);
    ctx.restore();
}

/* Main Layers */
export function drawRects() {
    ctx.save();
    ctx.lineWidth = 2;

    state.rects.forEach((R0, i) => {
        const R = norm(R0),
            b = rectBox(R);
        ctx.fillStyle = col(i + 1);
        ctx.strokeStyle = '#00000025';
        ctx.fillRect(b.x + 0.5, b.y + 0.5, b.W - 1, b.H - 1);
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.W - 1, b.H - 1);

        const deleteOffset = 10; // same as edgeKind

        // centred number
        ctx.fillStyle = '#222';
        drawTextFixed(b.x + b.W / 2, b.y + b.H / 2, nameOf(i),
            'center', 'bold 32px system-ui');

        // red ×
        ctx.fillStyle = '#e53935';
        drawTextFixed(b.x + b.W - deleteOffset, b.y + deleteOffset * 2,
            '×', 'right', 'bold 32px system-ui');

        if (i === state.focus) {                 // <- only the hovered one
            ctx.save();
            ctx.globalAlpha = 0.25;                // 25 % darker
            ctx.fillStyle  = '#000';               // plain black tint
            ctx.fillRect(b.x + .5, b.y + .5, b.W - 1, b.H - 1);
            ctx.restore();
        }

    });

    ctx.restore();
}

export function drawPreview() {
    if (state.mode !== 'drawing' || !state.start?.end) return;
    const a = state.start.begin,
        b = state.start.end,
        R = norm({
            r0: a.r,
            c0: a.c,
            r1: b.r,
            c1: b.c
        }),
        valid = ok(R);
    const bpx = rectBox(R);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = valid ? col(state.rects.length + 1) : '#ddd';
    ctx.fillRect(bpx.x, bpx.y, bpx.W, bpx.H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? '#3b82f6' : '#e53935';
    ctx.lineWidth = valid ? 1.5 : 2.5;
    ctx.strokeRect(bpx.x, bpx.y, bpx.W, bpx.H);
    if (!valid) {
        ctx.beginPath();
        ctx.moveTo(bpx.x, bpx.y);
        ctx.lineTo(bpx.x + bpx.W, bpx.y + bpx.H);
        ctx.moveTo(bpx.x + bpx.W, bpx.y);
        ctx.lineTo(bpx.x, bpx.y + bpx.H);
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

export function drawLiveTransform() {
    if (state.mode !== 'moving' && state.mode !== 'resizing') return;

    let R;
    if (state.mode === 'moving') {
        const v = snap(...Object.values(state.cursorPos)),
            dR = v.r - state.grab.r,
            dC = v.c - state.grab.c,
            {
                dr,
                dc
            } = maxDelta(state.active, dR, dC),
            B = state.base;
        R = norm({
            r0: B.r0 + dr,
            c0: B.c0 + dc,
            r1: B.r1 + dr,
            c1: B.c1 + dc
        });
    } else {
        const v = snap(...Object.values(state.cursorPos));
        R = {
            ...state.base
        };
        const k = state.resize;
        if (/N/.test(k)) R.r0 = clamp(v.r, 0, R.r1 - 1);
        if (/S/.test(k)) R.r1 = clamp(v.r, R.r0 + 1, state.rows);
        if (/W/.test(k)) R.c0 = clamp(v.c, 0, R.c1 - 1);
        if (/E/.test(k)) R.c1 = clamp(v.c, R.c0 + 1, state.cols);
        R = norm(R);
    }

    const valid = ok(R, state.active),
        b = rectBox(R);

    ctx.globalAlpha = 0.35;
    ctx.fillStyle = valid ? col(state.active + 1) : '#ddd';
    ctx.fillRect(b.x, b.y, b.W, b.H);
    ctx.globalAlpha = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = valid ? '#3b82f6' : '#e53935';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.W, b.H);
    ctx.setLineDash([]);
}

export function indices() {
    if (!state.showIdx) return;
    ctx.save();
    ctx.fillStyle = '#999';
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const {
        w,
        h
    } = cell();
    for (let r = 0; r < state.rows; r++)
        for (let c = 0; c < state.cols; c++)
            ctx.fillText(`${r + 1},${c + 1}`, c * w + 2, r * h + 2);
    ctx.restore();
}

export const repaint = () => {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    grid();
    drawRects();
    drawPreview();
    drawLiveTransform();
    indices();
};