import { canvas }                   from './dom.js';
import { state }         from './state.js';
import {
  norm, rectBox, col, nameOf, cell,
  snap, clamp, ok, colorOf
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


// --- Keycap (box) ---
function drawKeycapBox(x, y, w, h, {
  radius = 4,
  fillAlpha = 0.28,
  strokeAlpha = 0.35,
  strokeWidth = 3.0,
} = {}) {
  ctx.save();
  ctx.fillStyle   = `rgba(255,255,255,${fillAlpha})`;
  ctx.strokeStyle = `rgba(0,0,0,${strokeAlpha})`;
  ctx.lineWidth   = strokeWidth;

  const r = Math.min(radius, (Math.min(w, h) * 0.25));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// --- Icon (arrow + bar), canonical EAST-facing; rotate per edge ---
function drawKeycapIconRot(x, y, w, h, angleRad, mode, {
  inset = 6,     // keep icon away from keycap border
  gap   = 6,     // space between arrow tip and bar
  iconAlpha = 0.8,
} = {}) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angleRad);

  // usable square inside the keycap
  const s        = Math.min(w, h);
  const safeHalf = (s / 2) - inset;        // never draw beyond this (±safeHalf)
  const sC       = Math.max(1, (safeHalf * 2)); // content-size for scaling

  // icon metrics based on content area
  const t  = Math.max(2, sC * 0.10);   // stroke thickness
  const L  = sC * 0.52;                // arrow shaft length
  const ah = sC * 0.22;                // arrowhead length
  const aw = sC * 0.18;                // arrowhead half-width

  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';
  ctx.strokeStyle = `rgba(0,0,0,${iconAlpha})`;
  ctx.fillStyle   = `rgba(0,0,0,${iconAlpha})`;
  ctx.lineWidth   = t;

  const clampX = (xPos) =>
    Math.max(-safeHalf + t * 0.5, Math.min(safeHalf - t * 0.5, xPos));

  const drawArrow = (dir /* +1: →, -1: ← */) => {
    // shaft
    ctx.beginPath();
    if (dir > 0) { // →
      ctx.moveTo(-L/2, 0);
      ctx.lineTo(+L/2, 0);
    } else {       // ←
      ctx.moveTo(+L/2, 0);
      ctx.lineTo(-L/2, 0);
    }
    ctx.stroke();
    // head at the pointing end
    const tipX = dir > 0 ? +L/2 : -L/2;
    const base = dir > 0 ? tipX - ah : tipX + ah;
    ctx.beginPath();
    ctx.moveTo(tipX, 0);
    ctx.lineTo(base, +aw);
    ctx.lineTo(base, -aw);
    ctx.closePath();
    ctx.fill();
    return tipX; // so we can place the bar relative to tip + gap
  };

  const drawBarAtX = (xPos) => {
    const xClamped = clampX(xPos);
    const halfLen  = sC * 0.32;
    ctx.beginPath();
    ctx.moveTo(xClamped, -halfLen);
    ctx.lineTo(xClamped,  halfLen);
    ctx.stroke();
  };

  if (mode === 'move') {
    drawArrow(+1);
  } else if (mode === 'expand') {
    // arrow points outward; bar sits outside the tip with a gap
    const tip = drawArrow(+1);
    drawBarAtX(tip + gap);
  } else { // 'contract'
    // arrow points inward; bar sits toward the border with a gap from the inward tip
    const tip = drawArrow(-1);
    drawBarAtX(tip - gap);
  }

  ctx.restore();
}


// Decide which label to draw for a given side based on modifier state
// side: 'N' | 'S' | 'W' | 'E'
// mode: 'move' | 'expand' | 'contract'
export function edgeLabel(side, mode) {
  if (mode === 'move') {
    return side === 'W' ? '←'
         : side === 'E' ? '→'
         : side === 'N' ? '↑'
         :                '↓';
  }
  if (mode === 'expand') {
    // arrow points outward to a bar
    return side === 'W' ? '←│'   // growing West
         : side === 'E' ? '→│'   // growing East
         : side === 'N' ? '↑│'   // growing North
         :                '↓│';  // growing South
  }
  // contract: bar at edge, arrow pointing inward
  return side === 'W' ? '│→'
       : side === 'E' ? '│←'
       : side === 'N' ? '│↓'
       :                '│↑';
}


export const updateMods = (e) => {
  const mod  = !!(e.ctrlKey || e.metaKey);
  const shft = !!e.shiftKey;
  const changed = (mod !== state.modDown) || (shft !== state.shiftDown);
  if (changed) {
    state.modDown = mod;
    state.shiftDown = shft;
    if (state.stickyFocus != null) repaint();
  }
};

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
        ctx.fillStyle = colorOf(i);
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
        
        //draw keyboard control indicators
        if (state.stickyFocus === i) {
            // thick border
            ctx.save();
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#ff0000';
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.W - 1, b.H - 1);
            ctx.restore();

            const mode = state.modDown ? (state.shiftDown ? 'contract' : 'expand') : 'move';

            // layout constants (tweak to taste)
            const pad = Math.max(12, Math.min(24, Math.min(b.W, b.H) * 0.08));  // inset from edges
            const kw  = Math.max(28, Math.min(48, b.W * 0.22));                 // keycap width
            const kh  = Math.max(24, Math.min(40, b.H * 0.22));                 // keycap height

            // centers for top/bottom and left/right placements
            const kcx = b.x + b.W / 2 - kw / 2;
            const kcy = b.y + b.H / 2 - kh / 2;

            // Draw only if there’s room (avoid overlapping the whole rect)
            const roomH = (kh + 8 * pad) < b.H;
            const roomW = (kw + 8 * pad) < b.W;

            // North (rotate -90°)
            if (roomH){
                drawKeycapBox(kcx, b.y + pad, kw, kh);
                drawKeycapIconRot(kcx, b.y + pad, kw, kh, -Math.PI/2, mode);
            }

            // South (+90°)
            if (roomH){
                drawKeycapBox(kcx, b.y + b.H - pad - kh, kw, kh);
                drawKeycapIconRot(kcx, b.y + b.H - pad - kh, kw, kh,  Math.PI/2, mode);
            } 

            // West (180°)
            if (roomW){
                drawKeycapBox(b.x + pad, kcy, kw, kh);
                drawKeycapIconRot(b.x + pad, kcy, kw, kh, Math.PI, mode);
            }

            // East (0°)
            if (roomW){
                drawKeycapBox(b.x + b.W - pad - kw, kcy, kw, kh);
                drawKeycapIconRot(b.x + b.W - pad - kw, kcy, kw, kh, 0, mode);
            }

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
    const previewClr = state.pool[0] ?? `hsl(${Math.random()*360} 70% 75%)`;
    ctx.fillStyle   = valid ? previewClr : '#ddd';
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
    ctx.fillStyle = valid ? colorOf(state.active) : '#ddd';
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