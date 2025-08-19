import { canvas }                   from './dom.js';
import { state }         from './state.js';
import {
  norm, rectBox, col, nameOf, cell,
  snap, clamp, ok, colorOf, deleteGlyphMetrics,
  planShiftResizeComposite, planAggressiveMoveStep
}                                   from './helpers.js';
import { maxDelta, cursor }                 from './controls.js';

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

function scaleFontPxStr(fontPx) {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(fontPx * dpr);
}

/* Text */
export function drawTextFixed(x, y, txt, align = 'center', font = 'bold 16px system-ui') {
  const dpr = window.devicePixelRatio || 1;
  // convert “… 16px …” to “… 16*dpr px …”
  const fontDPR = font.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(parseFloat(n) * dpr)}px`);

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = fontDPR;
  ctx.fillText(txt, x, y);
  ctx.restore();
}

function setFont(weight, px, family = 'system-ui') {
  ctx.font = `${weight} ${scaleFontPxStr(px)}px ${family}`;
}

function wrapLines(text, maxWpx, fontPx, weight = 'bold', family = 'system-ui') {
  setFont(weight, fontPx, family);
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines = [];
  let line = words[0];

  for (let i = 1; i < words.length; i++) {
    const test = line + ' ' + words[i];
    if (ctx.measureText(test).width <= maxWpx) line = test;
    else { lines.push(line); line = words[i]; }
  }
  lines.push(line);
  return lines;
}

function fitTextMultiline(text, boxW, boxH, {
  minPx = 10,
  maxPx = 48,
  lineHeight = 1.15,
  weight = 'bold',
  family = 'system-ui',
} = {}) {
  let lo = minPx, hi = maxPx, best = null;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = wrapLines(text, boxW, mid, weight, family);
    const totalH = lines.length * mid * lineHeight;
    if (totalH <= boxH) {
      best = { fontPx: mid, lines, totalH };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best; // {fontPx, lines, totalH} or null
}

function drawMultilineCentered(xCenter, yCenter, lines, fontPx, {
  fill = '#222',
  lineHeight = 1.15,
  weight = 'bold',
  family = 'system-ui',
} = {}) {
  const dpr = window.devicePixelRatio || 1;
  const lhDev = fontPx * lineHeight * dpr;
  setFont(weight, fontPx, family);

  ctx.save();
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const totalHDev = lines.length * lhDev;
  // vertical center: first baseline at yCenter - total/2 + lh/2
  let y = yCenter - totalHDev / 2 + lhDev / 2;
  for (const line of lines) {
    ctx.fillText(line, xCenter, y);
    y += lhDev;
  }
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

        // centred label (fit + wrap)
        {
        const pad = Math.max(6, Math.min(b.W, b.H) * 0.12);
        const boxW = Math.max(0, b.W - 2 * pad);
        const boxH = Math.max(0, b.H - 2 * pad);

        if (boxW > 0 && boxH > 0) {
            const label = nameOf(i);
            // try to fit up to 48px or half the rect height, whichever is smaller
            const fit = fitTextMultiline(label, boxW, boxH, {
            minPx: 10,
            maxPx: Math.min(48, Math.floor(b.H * 0.5)),
            lineHeight: 1.12,
            weight: 'bold',
            family: 'system-ui'
            });
            if (fit) {
            drawMultilineCentered(b.x + b.W / 2, b.y + b.H / 2, fit.lines, fit.fontPx, {
                fill: '#222',
                lineHeight: 1.12,
                weight: 'bold',
                family: 'system-ui'
            });
            }
        }
        }

        // red × (consistent target size, shrink if rect is tiny)
        {
            const m = deleteGlyphMetrics(b);
            if (m.draw) {
                ctx.fillStyle = '#e53935';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.font = `bold ${scaleFontPxStr(m.fontPx)}px system-ui`; // your DPR helper
                ctx.fillText('×', m.x, m.y);
            }
        }

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

function drawPreviewOverlay(baseRects, nextRects, valid, activeIdx) {
  // Draws only rectangles that changed between baseRects and nextRects
  // `valid` controls blue vs red stroke; `activeIdx` is optional (for colorOf)
  const n = Math.min(baseRects.length, nextRects.length);
  const was = baseRects, now = nextRects;

  ctx.save();

  // filled delta areas
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < n; i++) {
    const A = was[i], B = now[i];
    if (!A || !B) continue;
    if (A.r0===B.r0 && A.c0===B.c0 && A.r1===B.r1 && A.c1===B.c1) continue;
    const b = rectBox(B);
    ctx.fillStyle = valid ? colorOf(i) : '#ddd';
    ctx.fillRect(b.x, b.y, b.W, b.H);
  }

  // dashed strokes
  ctx.globalAlpha = 1;
  ctx.setLineDash([6,4]);
  ctx.strokeStyle = valid ? '#3b82f6' : '#e53935';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const A = was[i], B = now[i];
    if (!A || !B) continue;
    if (A.r0===B.r0 && A.c0===B.c0 && A.r1===B.r1 && A.c1===B.c1) continue;
    const b = rectBox(B);
    ctx.strokeRect(b.x, b.y, b.W, b.H);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawLiveTransform() {
  if (state.mode !== 'moving' && state.mode !== 'resizing') return;

  // Useful locals
  const baseRects = state.baseAll ?? state.rects.map(r => norm(r));

  if (state.mode === 'moving') {
    const v   = snap(...Object.values(state.cursorPos));
    const dR  = v.r - state.grab.r;
    const dC  = v.c - state.grab.c;
      
    // baseline: what we compare against in the overlay
    const baseRects = (state.baseAll ?? state.rects).map(r => norm(r));

    if (state.aggrDown) {
        let remR = Math.abs(dR), remC = Math.abs(dC);
        const sR = Math.sign(dR), sC = Math.sign(dC);

        let plan         = baseRects.map(r => ({ ...r }));
        let appliedSteps = 0;       // <- NEW
        let blocked      = false;

        while ((remR > 0 || remC > 0) && !blocked) {
            const stepDr = remR > 0 ? sR : 0;
            const stepDc = remC > 0 ? sC : 0;

            const res = planAggressiveMoveStep(plan, state.active, stepDr, stepDc, state.rows, state.cols);
            if (!res.ok) { blocked = true; break; }

            plan = res.rects;
            appliedSteps++;
            if (stepDr) remR--;
            if (stepDc) remC--;
        }

        // If we applied at least one step, preview is "valid" (blue); 
        // if literally nothing can move this tick, mark invalid (red).
        const previewValid = appliedSteps > 0;

        drawPreviewOverlay(baseRects, plan, previewValid, state.active);
        return;
  }

    // Normal MOVE preview (single rect)
    const { dr, dc } = maxDelta(state.active, dR, dC);
    const B = state.base;
    const R = norm({ r0:B.r0+dr, c0:B.c0+dc, r1:B.r1+dr, c1:B.c1+dc });

    const plan = baseRects.slice();
    plan[state.active] = R;
    const valid = ok(R, state.active);

    drawPreviewOverlay(baseRects, plan, valid, state.active);
    return;
  }

  // ---- RESIZING ----
  {
    const v = snap(...Object.values(state.cursorPos));

    if (state.aggrDown) {
      // Aggressive RESIZE preview (push/pull)
      const kind = state.resize;
      const { ok: valid, rects: plan } =
        planShiftResizeComposite(baseRects, state.active, kind, v, state.rows, state.cols);

      drawPreviewOverlay(baseRects, plan, valid, state.active);
      return;
    }

    // Normal RESIZE preview (single rect)
    let R = { ...state.base };
    const k = state.resize;
    if (/N/.test(k)) R.r0 = clamp(v.r, 0, R.r1 - 1);
    if (/S/.test(k)) R.r1 = clamp(v.r, R.r0 + 1, state.rows);
    if (/W/.test(k)) R.c0 = clamp(v.c, 0, R.c1 - 1);
    if (/E/.test(k)) R.c1 = clamp(v.c, R.c0 + 1, state.cols);
    R = norm(R);

    const plan   = baseRects.slice();
    plan[state.active] = R;
    const valid = ok(R, state.active);

    drawPreviewOverlay(baseRects, plan, valid, state.active);
    return;
  }
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
    drawWelcomeOverlay();
    drawRects();
    drawPreview();
    drawLiveTransform();
    indices();
};

function textWH(txt, px, weight='900', family='system-ui'){
  setFont(weight, px, family);
  const m = ctx.measureText(txt);
  const w = m.width;
  // robust fallback if metrics are missing
  const asc = m.actualBoundingBoxAscent  ?? px * 0.82;
  const desc= m.actualBoundingBoxDescent ?? px * 0.18;
  const h = asc + desc;
  return { w, h };
}

// welcome message for first-time drawers (no overlap, true metrics)
function drawWelcomeOverlay() {
  if (state.hasEverHadRect) return;
  const a = state.welcomeAlpha;
  if (a <= 0) return;

  const W = canvas.width, H = canvas.height;
  const margin = Math.round(Math.min(W, H) * 0.06);
  const boxW = Math.max(0, W - 2*margin);
  const boxH = Math.max(0, H - 2*margin);
  if (boxW <= 0 || boxH <= 0) return;

  const line1 = 'CLICK & DRAG';
  const line2 = 'OR';
  const line3 = 'DOUBLE-CLICK';

  // Fit base size by binary search using real metrics
  let lo = 12, hi = Math.max(28, Math.floor(H * 0.25)), best = 18;
  const gapRatio = 0.22;         // space between lines relative to base px

  while (lo <= hi) {
    const mid  = Math.floor((lo + hi)/2);
    const big  = mid;
    const huge = Math.round(mid * 1.5);

    const m1 = textWH(line1, big);
    const m2 = textWH(line2, huge);
    const m3 = textWH(line3, big);

    const gap = Math.round(gapRatio * big);
    const fitsW = (m1.w <= boxW) && (m2.w <= boxW) && (m3.w <= boxW);
    const totalH = m1.h + gap + m2.h + gap + m3.h;

    if (fitsW && totalH <= boxH) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }

  const big  = best;
  const huge = Math.round(best * 1.5);
  const m1 = textWH(line1, big);
  const m2 = textWH(line2, huge);
  const m3 = textWH(line3, big);
  const gap = Math.round(gapRatio * best);
  const totalH = m1.h + gap + m2.h + gap + m3.h;

  const cx = W/2;
  let y = H/2 - totalH/2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // line 1
  ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#666';
  setFont('900', big, 'system-ui');
  ctx.fillText(line1, cx, y);
  y += m1.h + gap;

  // line 2
  ctx.globalAlpha = a * 0.5;
  setFont('900', huge, 'system-ui');
  ctx.fillText(line2, cx, y);
  y += m2.h + gap;

  // line 3
  ctx.globalAlpha = a * 0.5;
  setFont('900', big, 'system-ui');
  ctx.fillText(line3, cx, y);

  ctx.restore();
}

// 1s fade; rectangles should paint over the text (so we draw text before rects)
export function startWelcomeFade(duration = 1000) {
  if (state.hasEverHadRect || state.welcomeFading) return;
  state.welcomeFading = true;
  const t0 = performance.now();

  const tick = (t) => {
    const k = Math.min(1, (t - t0) / duration);
    state.welcomeAlpha = 1 - k;
    repaint();                        // animate
    if (k < 1 && state.welcomeFading) requestAnimationFrame(tick);
    else {
      state.welcomeFading = false;
      state.welcomeAlpha  = 0;
      state.hasEverHadRect = true;    // never show again
    }
  };
  requestAnimationFrame(tick);
}