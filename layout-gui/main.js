(() => {
    /* ---------- state ---------- */
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', {
        alpha: false
    });
    const rowsEl = document.getElementById('rows');
    const colsEl = document.getElementById('cols');
    const showGridEl = document.getElementById('showGrid');
    const showIdxEl = document.getElementById('showIndices');
    const legendList = document.getElementById('legendList');
    const rcodeEl = document.getElementById('rcode');
    const copyBtn = document.getElementById('copyBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const clearBtn = document.getElementById('clearBtn');
    const trimBtn = document.getElementById('trimBtn');
    const reduceBtn = document.getElementById('reduceBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const dimText = document.getElementById('dimText');
    const wrap = document.getElementById('canvasWrap');
    const squareEl = document.getElementById('squareCells');

    const state = {
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
        future: []
    };

    let cursorPos = {
        x: 0,
        y: 0
    };

    /* ---------- helpers ---------- */
    const nameOf = i => state.aliases[i] || String(i + 1);
    const labelOf = i => state.aliases?.[i] || String(i + 1);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
    const cell = () => ({
        w: canvas.width / state.cols,
        h: canvas.height / state.rows
    });
    const snap = (x, y) => {
        const {
            w,
            h
        } = cell();
        return {
            r: clamp(Math.round(y / h), 0, state.rows),
            c: clamp(Math.round(x / w), 0, state.cols)
        };
    };
    const norm = ({
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
    const zero = r => r.r0 === r.r1 || r.c0 === r.c1;
    const cor = r => [{
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
    const inside = (R, p) =>
        p.r > R.r0 && p.r < R.r1 && p.c > R.c0 && p.c < R.c1;

    /* --------- validity & collisions --------- */
    function ok(R, ignore = -1) {
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

    const rectBox = r => {
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
    const col = i => `hsl(${(i * 137.508) % 360} 70% 75%)`;

    function grid() {
        if (!state.showGrid) return;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#e8e8e8';
        for (let c = 0; c <= state.cols; c++) {
            const x = (c * canvas.width) / state.cols;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let r = 0; r <= state.rows; r++) {
            const y = (r * canvas.height) / state.rows;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawTextFixed(xCSS, yCSS, txt,
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


    function drawRects() {
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
        });

        ctx.restore();
    }


    function drawPreview() {
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

    function drawLiveTransform() {
        if (state.mode !== 'moving' && state.mode !== 'resizing') return;

        let R;
        if (state.mode === 'moving') {
            const v = snap(...Object.values(cursorPos)),
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
            const v = snap(...Object.values(cursorPos));
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

    function indices() {
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

    const repaint = () => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        grid();
        drawRects();
        drawPreview();
        drawLiveTransform();
        indices();
    };


    /* ---------- legend ---------- */
    function legend() {
        legendList.innerHTML = '';
        state.rects.forEach((R0, i) => {
            const R = norm(R0);
            const li = document.createElement('div');
            li.className = 'legend-item';
            li.dataset.idx = i;                                        // ← for dbl-click
            li.innerHTML = `
              <div class="swatch" style="background:${col(i+1)}">${i+1}</div>
              <div class="legend-name">${nameOf(i)}</div>
              <small class="dim">rows&nbsp;${R.r0+1}:${R.r1}, cols&nbsp;${R.c0+1}:${R.c1}</small>
              <button class="del">×</button>`;
            li.querySelector('.del').onclick = () => {
                history();
                state.rects.splice(i, 1);
                state.aliases.splice(i, 1);
                update();
            };
            legendList.append(li);
        });
    }

    legendList.addEventListener('dblclick', e => {
      const item = e.target.closest('.legend-item');
      if (!item) return;
      const idx = +item.dataset.idx;
      const current = state.aliases[idx] || '';
      const name = prompt('Rectangle name:', current);
      if (name === null) return;             // cancelled
      history();
      state.aliases[idx] = name.trim();
      update();
    });

    /* ---------- R code ---------- */
    const buildMat = () => {
        const N = state.rects.length,
            blank = N + 1;
        const M = Array.from({
            length: state.rows
        }, () => Array(state.cols).fill(blank));
        state.rects.forEach((R0, i) => {
            const R = norm(R0);
            for (let r = R.r0; r < R.r1; r++)
                for (let c = R.c0; c < R.c1; c++) M[r][c] = i + 1;
        });
        return M;
    };

    const toR = () => {
        const M = buildMat(),
            N = state.rects.length;
        const rowsR = M.map(r => `  c(${r.join(', ')})`).join(',\n');
        return [
            `# layout matrix (${state.rows} × ${state.cols})`,
            `# rectangles 1..${N}; blank = ${N + 1}`,
            `mat <- rbind(\n${rowsR}\n)`,
            `layout(mat)`,
            `layout.show(${Math.max(1, N)})`,
            `mat`
        ].join('\n');
    };

    const update = () => {
        repaint();
        legend();
        rcodeEl.value = toR();
        dimText.textContent = `(${state.rows}×${state.cols})`;
        cursor();
    };

    /* ---------- history ---------- */
    const history = () => {
        state.past.push(JSON.stringify({
            rows: state.rows,
            cols: state.cols,
            rects: state.rects
        }));
        if (state.past.length > 100) state.past.shift();
        state.future.length = 0;
    };

    const applySnap = snap => {
        const o = JSON.parse(snap);
        Object.assign(state, {
            rows: o.rows,
            cols: o.cols,
            rects: o.rects
        });
        rowsEl.value = o.rows;
        colsEl.value = o.cols;
        update();
    };

    /* ---------- interaction ---------- */
    const pos = e => {
        const r = canvas.getBoundingClientRect(),
            x = (e.clientX - r.left) * (canvas.width / r.width),
            y = (e.clientY - r.top) * (canvas.height / r.height);
        return {
            x,
            y
        };
    };

    function edgeKind(px, py, R, tol = 10) {
        const b = rectBox(R);

        const deleteOffset = tol + 2;
        const delHot =
            px >= b.x + b.W - deleteOffset - 12 && px <= b.x + b.W - deleteOffset &&
            py >= b.y + deleteOffset && py <= b.y + deleteOffset + 12;
        if (delHot) return 'delete'; // give it top priority

        const onN = Math.abs(py - b.y) <= tol &&
            px >= b.x - tol && px <= b.x + b.W + tol;
        const onS = Math.abs(py - (b.y + b.H)) <= tol &&
            px >= b.x - tol && px <= b.x + b.W + tol;
        const onW = Math.abs(px - b.x) <= tol &&
            py >= b.y - tol && py <= b.y + b.H + tol;
        const onE = Math.abs(px - (b.x + b.W)) <= tol &&
            py >= b.y - tol && py <= b.y + b.H + tol;


        if (onN && onW) return 'cornerNW';
        if (onN && onE) return 'cornerNE';
        if (onS && onW) return 'cornerSW';
        if (onS && onE) return 'cornerSE';
        if (onN) return 'edgeN';
        if (onS) return 'edgeS';
        if (onW) return 'edgeW';
        if (onE) return 'edgeE';

        return null;
    }

    function hit(px, py) {
        for (let i = state.rects.length - 1; i >= 0; i--) {
            const R = norm(state.rects[i]);
            const kind = edgeKind(px, py, R);
            if (kind) return {
                kind,
                idx: i
            };
            const b = rectBox(R);
            if (px >= b.x && px <= b.x + b.W && py >= b.y && py <= b.y + b.H) return {
                kind: 'inside',
                idx: i
            };
        }
        return null;
    }

    function cursor() {
        if (!state.hover) {
            canvas.style.cursor = 'crosshair';
            return;
        }
        canvas.style.cursor = {
            inside: 'move',
            edgeN: 'ns-resize',
            edgeS: 'ns-resize',
            edgeE: 'ew-resize',
            edgeW: 'ew-resize',
            cornerNW: 'nwse-resize',
            cornerSE: 'nwse-resize',
            cornerNE: 'nesw-resize',
            delete: 'pointer',
            cornerSW: 'nesw-resize'
        } [state.hover.kind] || 'crosshair';
    }

    function maxDelta(idx, dr, dc) {
        const R0 = norm(state.rects[idx]);
        let bestDr = dr,
            bestDc = dc;
        // border clamp
        bestDr = clamp(bestDr, -R0.r0, state.rows - R0.r1);
        bestDc = clamp(bestDc, -R0.c0, state.cols - R0.c1);
        // obstacle clamp
        const testRect = (dR, dC) => norm({
            r0: R0.r0 + dR,
            c0: R0.c0 + dC,
            r1: R0.r1 + dR,
            c1: R0.c1 + dC
        });
        while (!ok(testRect(bestDr, bestDc), idx)) {
            if (bestDr !== 0) bestDr -= Math.sign(bestDr);
            if (bestDc !== 0) bestDc -= Math.sign(bestDc);
            if (bestDr === 0 && bestDc === 0) break;
        }
        return {
            dr: bestDr,
            dc: bestDc
        };
    }

    canvas.addEventListener('mousemove', e => {
        cursorPos = pos(e);
        const {
            x,
            y
        } = cursorPos;

        if (state.mode === 'drawing') {
            state.start.end = snap(x, y);
            repaint();
            return;
        }
        if (state.mode === 'moving' || state.mode === 'resizing') {
            repaint();
            return;
        }

        state.hover = hit(x, y);
        cursor();
    });

    canvas.addEventListener('dblclick', e => {
      const { x, y } = pos(e);
      const hitInfo = hit(x, y);
      if (!hitInfo || hitInfo.kind !== 'inside') return;
      const idx = hitInfo.idx;
      const current = state.aliases[idx] || '';
      const name = prompt('Rectangle name:', current);
      if (name === null) return;
      history();
      state.aliases[idx] = name.trim();
      update();
    });


    canvas.addEventListener('mousedown', e => {
        const {
            x,
            y
        } = pos(e), hv = hit(x, y);

        if (hv && hv.kind === 'delete') {
            history(); // enable undo
            state.rects.splice(hv.idx, 1);
            state.aliases.splice(hv.idx, 1);
            update(); // redraw + renumber colours
            return; // nothing else to do
        }

        if (hv) {
            state.active = hv.idx;
            state.base = norm(state.rects[hv.idx]);
            if (hv.kind === 'inside') {
                state.mode = 'moving';
                state.grab = snap(x, y);
            } else {
                state.mode = 'resizing';
                state.resize = hv.kind;
            }
        } else {
            state.mode = 'drawing';
            state.start = {
                begin: snap(x, y),
                end: null
            };
        }
    });

    window.addEventListener('mouseup', e => {
        if (state.mode === 'drawing') {
            const a = state.start.begin,
                b = snap(...Object.values(pos(e)));
            const R = norm({
                r0: a.r,
                c0: a.c,
                r1: b.r,
                c1: b.c
            });
            state.mode = 'idle';
            state.start = null;
            if (ok(R)) {
                history();
                state.rects.push(R);
                state.aliases.push('');
            }
            update();
            return;
        }
        if (state.mode === 'moving') {
            const v = snap(...Object.values(pos(e))),
                dR = v.r - state.grab.r,
                dC = v.c - state.grab.c;
            const {
                dr,
                dc
            } = maxDelta(state.active, dR, dC);
            const R = state.base;
            const moved = {
                r0: R.r0 + dr,
                c0: R.c0 + dc,
                r1: R.r1 + dr,
                c1: R.c1 + dc
            };
            if (dr || dc) {
                history();
                state.rects[state.active] = moved;
            }
            state.mode = 'idle';
            update();
            return;
        }
        if (state.mode === 'resizing') {
            const v = snap(...Object.values(pos(e)));
            let R = {
                ...state.base
            };
            const k = state.resize;
            if (/N/.test(k)) R.r0 = clamp(v.r, 0, R.r1 - 1);
            if (/S/.test(k)) R.r1 = clamp(v.r, R.r0 + 1, state.rows);
            if (/W/.test(k)) R.c0 = clamp(v.c, 0, R.c1 - 1);
            if (/E/.test(k)) R.c1 = clamp(v.c, R.c0 + 1, state.cols);
            R = norm(R);
            if (ok(R, state.active)) {
                history();
                state.rects[state.active] = R;
            }
            state.mode = 'idle';
            update();
            return;
        }
    });

    /* ---------- controls ---------- */
    function resizeCanvas() {
        const r = wrap.getBoundingClientRect(),
            s = Math.min(r.width, r.height);
        const d = window.devicePixelRatio || 1;
        canvas.width = canvas.height = Math.round(s * d);
        repaint();
    }
    new ResizeObserver(resizeCanvas).observe(wrap);

    [rowsEl, colsEl].forEach(el => el.onchange = () => {
        const r = Math.max(1, +rowsEl.value || 1),
            c = Math.max(1, +colsEl.value || 1);
        if (r !== state.rows || c !== state.cols) {
            history();
            state.rows = r;
            state.cols = c;
            update();
        }
    });
    showGridEl.onchange = () => {
        state.showGrid = showGridEl.checked;
        repaint();
    };
    showIdxEl.onchange = () => {
        state.showIdx = showIdxEl.checked;
        repaint();
    };
    squareEl.onchange = () => {
        state.square = squareEl.checked;
        resizeCanvas();
    };
    copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(rcodeEl.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy R', 900);
    };

    trimBtn.onclick = () => {
      if (!state.rects.length) return;            // nothing to trim

      /* 1 ── find global bounding box of all rectangles */
      let minR = Infinity, minC = Infinity,
          maxR = -Infinity, maxC = -Infinity;

      state.rects.forEach(r0 => {
        const r = norm(r0);
        if (r.r0 < minR) minR = r.r0;
        if (r.c0 < minC) minC = r.c0;
        if (r.r1 > maxR) maxR = r.r1;
        if (r.c1 > maxC) maxC = r.c1;
      });

      /* nothing to trim if bounding box already touches (0,0) and full dims */
      if (minR === 0 && minC === 0 &&
          maxR === state.rows && maxC === state.cols) return;

      history();                                  // enable undo

      /* 2 ── shift every rectangle so (minR,minC) becomes (0,0) */
      state.rects = state.rects.map(r0 => {
        const r = norm(r0);
        return {
          r0 : r.r0 - minR,
          c0 : r.c0 - minC,
          r1 : r.r1 - minR,
          c1 : r.c1 - minC
        };
      });

      /* 3 ── shrink the grid to the bounding-box size */
      const newRows = maxR - minR;
      const newCols = maxC - minC;
      state.rows = newRows;
      state.cols = newCols;
      rowsEl.value = newRows;
      colsEl.value = newCols;

      update();                                   // repaint, legend, R code
    };

    reduceBtn.onclick = () => {
      if (!state.rects.length) return;                    // nothing to reduce

      /* 1 ── collect every horizontal & vertical boundary */
      const rSet = new Set([0, state.rows]);
      const cSet = new Set([0, state.cols]);
      state.rects.forEach(r0 => {
        const r = norm(r0);
        rSet.add(r.r0); rSet.add(r.r1);
        cSet.add(r.c0); cSet.add(r.c1);
      });

      /* 2 ── greatest common divisor of all boundary coordinates */
      const rFactor = [...rSet].reduce((g, v) => gcd(g, v));
      const cFactor = [...cSet].reduce((g, v) => gcd(g, v));

      /* if no common divisor >1 in either dimension, nothing to do */
      if (rFactor === 1 && cFactor === 1) return;

      history();                                          // enable undo

      /* 3 ── rescale every rectangle */
      state.rects = state.rects.map(r0 => {
        const r = norm(r0);
        return {
          r0 : r.r0 / rFactor,
          c0 : r.c0 / cFactor,
          r1 : r.r1 / rFactor,
          c1 : r.c1 / cFactor
        };
      });

      /* 4 ── rescale the grid itself */
      state.rows = Math.round(state.rows / rFactor);
      state.cols = Math.round(state.cols / cFactor);
      rowsEl.value = state.rows;
      colsEl.value = state.cols;

      update();                                           // repaint everything
    };


    clearBtn.onclick = () => {
        if (!state.rects.length) return;
        history();
        state.rects.length = 0;
        update();
    };
    
    undoBtn.onclick = () => {
        if (!state.past.length) return;
        state.future.push(JSON.stringify({
            rows: state.rows,
            cols: state.cols,
            rects: state.rects,
            aliases: state.aliases
        }));
        applySnap(state.past.pop());
    };

    redoBtn.onclick = () => {
        if (!state.future.length) return;
        state.past.push(JSON.stringify({
            rows: state.rows,
            cols: state.cols,
            rects: state.rects,
            aliases: state.aliases
        }));
        applySnap(state.future.pop());
    };

    exportBtn.onclick = () => {
        const blob = new Blob([JSON.stringify({
            rows: state.rows,
            cols: state.cols,
            rects: state.rects,
            aliases: state.aliases
        }, null, 2)], {
            type: 'application/json'
        });
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(blob),
            download: 'layout-mat.json'
        });
        a.click();
        URL.revokeObjectURL(a.href);
    };

    importBtn.onclick = () => {
        const inp = Object.assign(document.createElement('input'), {
            type: 'file',
            accept: 'application/json'
        });
        inp.onchange = () => {
            const f = inp.files[0];
            if (!f) return;
            const fr = new FileReader();
            fr.onload = () => {
                try {
                    const o = JSON.parse(fr.result);
                    if (o.rows && o.cols && Array.isArray(o.rects)) {
                        history();
                        Object.assign(state, {
                            rows: o.rows,
                            cols: o.cols,
                            rects: o.rects.map(norm),
                            aliases: o.aliases || []
                        });
                        rowsEl.value = o.rows;
                        colsEl.value = o.cols;
                        update();
                    }
                } catch (_) {}
            };
            fr.readAsText(f);
        };
        inp.click();
    };

    (() => {
        const main = document.querySelector('.main');
        const MIN_LEFT = 260,
            MIN_MID = 150,
            MIN_RIGHT = 260; // px

        /* helper – define BEFORE first use */
        const setCss = (name, px) =>
            document.documentElement.style.setProperty(name, px + 'px');
        const getCss = name =>
            parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

        /* ----- initial 50 / 25 / 25 proportions ----- */
        const splitW = 6; // splitter width in CSS
        const colGap = parseFloat(getComputedStyle(document.documentElement)
            .getPropertyValue('--gap')) || 10; // .main { gap: var(--gap) }
        const TOTAL_GAPS = splitW * 2 + colGap * 4; // 5 cols → 4 gaps
        const gridW = main.getBoundingClientRect().width - TOTAL_GAPS;
        setCss('--w-left', gridW * 0.50);
        setCss('--w-mid', gridW * 0.25);
        setCss('--w-right', gridW * 0.25);


        function dragFactory(id) {
            const splitter = document.getElementById(id);

            splitter.addEventListener('mousedown', e => {
                e.preventDefault();
                const startX = e.clientX;

                const G = main.getBoundingClientRect().width - TOTAL_GAPS;

                /* -------- freeze the starting widths -------- */
                const L0 = getCss('--w-left');
                const M0 = getCss('--w-mid');
                const R0 = getCss('--w-right'); // not strictly needed but nice for symmetry

                function onMove(ev) {
                  const dx = ev.clientX - startX;
                  const G  = main.getBoundingClientRect().width - TOTAL_GAPS;   // full free width

                  let L = L0, M = M0, R = R0;          // start widths for this drag

                  if (id === 'splitLeft') {
                    /* slide border between LEFT and MIDDLE, keep RIGHT fixed */
                    L = clamp(L0 + dx, MIN_LEFT, G - MIN_MID - R0);
                    M = G - L - R0;                    // whatever space remains

                    /* final safeguard */
                    if (M < MIN_MID) {                 // shouldn’t happen, but keep gap visible
                      M = MIN_MID;
                      L = G - R0 - M;
                    }

                  } else { // splitRight
                    /* slide border between MIDDLE and RIGHT, keep LEFT fixed */
                    R = clamp(R0 - dx, MIN_RIGHT, G - L0 - MIN_MID);  // note R0 - dx (drag right → dx>0 shrinks R)
                    M = G - L0 - R;

                    if (M < MIN_MID) {                 // keep 6 px splitter + 10 px gap visible
                      M = MIN_MID;
                      R = G - L0 - M;
                    }
                  }

                  setCss('--w-left',  L);
                  setCss('--w-mid',   M);
                  setCss('--w-right', R);

                  resizeCanvas();                       // keep canvas crisp while dragging
                }


                const stop = () => window.removeEventListener('mousemove', onMove);
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', stop, {
                    once: true
                });
            });
        }

        dragFactory('splitLeft');
        dragFactory('splitRight');
    })();


    /* ---------- init ---------- */
    history();
    resizeCanvas();
    update();
})();