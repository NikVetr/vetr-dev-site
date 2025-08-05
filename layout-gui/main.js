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
    const darkEl = document.getElementById('darkMode');
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        darkEl.checked = true; /* honour OS preference on first load (overridden by checkbox) */
    }
    const incSetupEl = document.getElementById('incSetup');
    const incURLEl = document.getElementById('incURL');
    document.body.classList.toggle('dark', darkEl.checked);

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
        future: [],
        aspect: null,
        renderer: 'layout'
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

    function crisp(v, max, dpr) {
        let p = Math.round(v) + 0.5 / dpr; // centre the 1-px stroke
        if (p > max - 0.5) p = max - 0.5; // keep it inside the bitmap
        return p;
    }

    function grid() {
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

    /* keep the URL short-ish: base64-encode a compressed JSON subset */
    /* ---------- hash helpers  ––  ultra-compact base-36 ---------------- */
    const b36 = n => n.toString(36);
    const i36 = s => parseInt(s, 36);

    /* ①  serialise current state → string */
    function encodeState() {
        /* rows.cols|r0c0r1c1;r0c0r1c1;…|alias1,alias2…  (all base-36) */
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
            b36(state.rows) + '.' + b36(state.cols) + '|' +
            rects + '|' +
            aliases // may be empty
        );
    }

    /* ②  parse string in location.hash → patch state (returns true/false) */
    function decodeState(str) {
        try {
            const [grid, rectPart = '', aliasPart = ''] = str.split('|');
            const [rowsB36, colsB36] = grid.split('.');

            const rows = i36(rowsB36);
            const cols = i36(colsB36);
            if (!rows || !cols) return false; // malformed

            const rects = rectPart ?
                rectPart.split(';').map(s => ({
                    r0: i36(s[0]),
                    c0: i36(s[1]),
                    r1: i36(s[2]),
                    c1: i36(s[3])
                })) : [];

            const aliases = aliasPart ?
                aliasPart.split(',').map(decodeURIComponent) : [];

            Object.assign(state, {
                rows,
                cols,
                rects,
                aliases,
            });

            /* reflect widgets that mirror state */
            rowsEl.value = rows;
            colsEl.value = cols;
            return true;
        } catch (_) {
            return false;
        }
    }


    /* push state into location.hash – debounced so rapid drags don’t spam */
    let urlTimer = null;

    function syncURL() {
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            location.hash = encodeState();
        }, 150);
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
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        grid();
        drawRects();
        drawPreview();
        drawLiveTransform();
        indices();
    };


    /* ---------- legend ---------- */
    /*function legend() {
        legendList.innerHTML = '';
        state.rects.forEach((R0, i) => {
            const R = norm(R0);
            const li = document.createElement('div');
            li.className = 'legend-item';
            li.dataset.idx = i; // ← for dbl-click
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
                syncURL();
            };
            legendList.append(li);
        });
    }*/

    function legend() {
        legendList.innerHTML = '';
        state.rects.forEach((R0, i) => {
            const R = norm(R0);
            const li = document.createElement('div');
            li.className = 'legend-item';
            li.dataset.idx = i; // ← for dbl-click
            li.draggable = true; // enable dragging

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
                syncURL();
            };

            // Drag events
            li.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', i);
                e.dataTransfer.effectAllowed = 'move';
                li.classList.add('dragging');
            });

            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
            });

            li.addEventListener('dragover', e => {
                e.preventDefault();
                li.classList.add('dragover');
            });

            li.addEventListener('dragleave', () => {
                li.classList.remove('dragover');
            });

            li.addEventListener('drop', e => {
                e.preventDefault();
                li.classList.remove('dragover');

                const fromIdx = +e.dataTransfer.getData('text/plain');
                const toIdx = +li.dataset.idx;

                if (fromIdx === toIdx) return;

                history();

                // move the rect and alias in state
                const [rect] = state.rects.splice(fromIdx, 1);
                const [alias] = state.aliases.splice(fromIdx, 1);
                state.rects.splice(toIdx, 0, rect);
                state.aliases.splice(toIdx, 0, alias);

                update();
                syncURL();
            });

            legendList.append(li);
        });
    }


    legendList.addEventListener('dblclick', e => {
        const item = e.target.closest('.legend-item');
        if (!item) return;
        const idx = +item.dataset.idx;
        const current = state.aliases[idx] || '';
        const name = prompt('Rectangle name:', current);
        if (name === null) return; // cancelled
        history();
        state.aliases[idx] = name.trim();
        update();
        syncURL();
    });

    /* ---------- generate code ---------- */
    const buildMat = () => {
        const N = state.rects.length,
            blank = N + 1;
        const M = Array.from({
            length: state.rows
        }, _ => Array(state.cols).fill(blank));
        state.rects.forEach((r0, i) => {
            const r = norm(r0);
            for (let rIdx = r.r0; rIdx < r.r1; rIdx++)
                for (let c = r.c0; c < r.c1; c++) M[rIdx][c] = i + 1;
        });
        return M;
    };

    let renderer = 'layout'; // default

    document.getElementById('renderRadios')
        .addEventListener('change', e => {
            if (e.target.name === 'render') {
                renderer = e.target.value;
                rcodeEl.value = generateCode(); // refresh
            }
        });

    function matrixLiteral() {
        const M = buildMat();
        return M.map(r => `c(${r.join(', ')})`).join(',\n  ');
    }

    /* ---------- helpers used only by generateCode ---------- */
    function designMatrix() {
        /* matrix of ints (R) or strings (Python/Julia) that matches
           the current rectangle layout                                     */
        const M = Array.from({
                length: state.rows
            },
            _ => Array(state.cols).fill(0));
        state.rects.forEach((r0, i) => {
            const r = norm(r0),
                mark = i + 1; // 1-based id
            for (let rr = r.r0; rr < r.r1; rr++)
                for (let cc = r.c0; cc < r.c1; cc++)
                    M[rr][cc] = mark;
        });
        return M;
    }

    function widthsHeights() {
        /* vectors of column widths / row heights (all 1 → equal sizing)   */
        return {
            w: 'unit(rep(1, ' + state.cols + '), "null")',
            h: 'unit(rep(1, ' + state.rows + '), "null")'
        };
    }

    /* ---------- main factory ---------- */

    /* default: include full setup, omit URL */
    let incSetup = incSetupEl.checked;
    let incURL = incURLEl.checked;

    [incSetupEl, incURLEl].forEach(el => {
        el.onchange = () => {
            incSetup = incSetupEl.checked;
            incURL = incURLEl.checked;
            update(); // regenerate code immediately
        };
    });

    /* format numbers like 0.63636… → "0.6364", 0.250000 → "0.25" */
    const f = (x, d = 4) => +x.toFixed(d) // round
        .toString() // drop trailing zeros
        .replace(/\.0+$/, '');

    const fmt = (n, k = 6) => +n.toFixed(k); // trim long floats

    function urlHeader() {
        if (!incURL) return '';
        const url = 'https://vetr.dev/layout-gui/#' + encodeState();
        return `# ${url}\n\n`;
    }

    function generateCode() {
        const N = state.rects.length || 1; // at least 1 panel
        const M = designMatrix(); // 2-D array
        const matR = 'matrix(c(\n  ' +
            M.map(r => `c(${r.join(', ')})`).join(',\n  ') +
            `\n), nrow=${state.rows}, byrow=TRUE)`;

        /* helper for Python & Julia – slice syntax like 0:2,3 */
        const pySlice = (r0, r1, c0, c1) =>
            `[${r0}:${r1}, ${c0}:${c1}]`; // end exclusive

        function rowFmt(arr) {
            return '  c(' + arr.join(', ') + ')';
        }

        /* names like p_scatter, p_2 … respect aliases */
        const plotVar = i => 'p_' + nameOf(i).replace(/\W+/g, '_');

        const grobList = state.rects.map((_, i) => plotVar(i)).join(', ');


        switch (renderer) {

            /* ──────────────────────  R  ────────────────────── */

            case 'layout': {
                /* ---- 1) matrix rows (always emitted) -------------------- */
                const rowsTxt = designMatrix() // 2-space indent
                    .map(r => '  c(' + r.join(', ') + ')')
                    .join(',\n');

                const matDef = [
                    'mat <- matrix(c(',
                    rowsTxt,
                    `), nrow = ${state.rows}, byrow = TRUE)`
                ].join('\n');

                /* ---- 2) static tail (only with “Setup” ✓) --------------- */
                const post = [
                    'layout(mat)',
                    `layout.show(${state.rects.length || 1})`
                ].join('\n');

                /* ---- 3) final snippet ----------------------------------- */
                return urlHeader() // "" if URL ☐, "#https://..." if ✓
                    +
                    matDef + '\n' +
                    (incSetup ? post : ''); // omit tail when Setup ☐
            }

            case 'gridExtra': {
                const N = state.rects.length || 1; // ≥ 1 panel
                const BLANK = N + 1; // code for “empty”

                /* ---- 1) layout matrix (numbers, blank = N+1) ------------- */
                const matTxt = buildMat() // 2-space indent
                    .map(r => '  c(' + r.join(', ') + ')')
                    .join(',\n');

                /* ---- 2) grob list ---------------------------------------- */
                const grobStubs = Array.from({
                        length: N
                    }, (_, i) =>
                    `  g${i + 1} = NULL`).join(',\n');

                const grobList = [
                    'grobs <- list(',
                    grobStubs + ',',
                    '  blank = grid::nullGrob()',
                    ')'
                ].join('\n');

                /* ---- 3) body common to both “setup on/off” --------------- */
                const matDef = [
                    'mat <- matrix(c(',
                    matTxt,
                    `), nrow = ${state.rows}, byrow = TRUE)`
                ].join('\n');

                const post = `grid.arrange(grobs = grobs, layout_matrix = mat)`;

                /* ---- 4) final result ------------------------------------- */
                return urlHeader() +
                    (incSetup ? 'library(gridExtra)\nlibrary(grid)\n\n' + grobList + '\n\n' : '') +
                    matDef + '\n' +
                    (incSetup ? post : '');
            }


            case 'cowplot': {
                /* ---- gather rectangle geometry --------------------------- */
                const rows = state.rects.map((r0, i) => {
                    const r = norm(r0);
                    return {
                        id: i + 1,
                        x: f(r.c0 / state.cols),
                        y: f(1 - r.r1 / state.rows), // cowplot’s origin is bottom-left
                        w: f((r.c1 - r.c0) / state.cols),
                        h: f((r.r1 - r.r0) / state.rows)
                    };
                });

                /* ---- 1) data-frame (always included) --------------------- */
                const df = [
                    'mat <- data.frame(',
                    '  id = c(' + rows.map(r => r.id).join(', ') + '),',
                    '  x  = c(' + rows.map(r => r.x).join(', ') + '),',
                    '  y  = c(' + rows.map(r => r.y).join(', ') + '),',
                    '  w  = c(' + rows.map(r => r.w).join(', ') + '),',
                    '  h  = c(' + rows.map(r => r.h).join(', ') + ')',
                    ')'
                ].join('\n');

                /* ---- 2) fixed cowplot boiler-plate ----------------------- */
                const setupBlock = [
                    'library(cowplot)',
                    'library(ggplot2)',
                    '',
                    'plots <- list()   # your ggplots here',
                    '',
                    df,
                    '',
                    'p <- ggdraw()',
                    'for (i in seq_len(nrow(mat))) {',
                    '  p <- p + draw_plot(',
                    '    plots[[mat$id[i]]],',
                    '    x      = mat$x[i],',
                    '    y      = mat$y[i],',
                    '    width  = mat$w[i],',
                    '    height = mat$h[i]',
                    '  )',
                    '}',
                    'p'
                ].join('\n');

                /* ---- 3) final result ------------------------------------- */
                return urlHeader() +
                    (incSetup ? setupBlock : df);
            }

            case 'patchwork': {
                const TAGS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const tags = state.rects.map((_, i) => TAGS[i]); // A, B, C …

                /* ---- ASCII layout ( # = blank ) ------------------------- */
                const asciiRows = Array.from({
                        length: state.rows
                    },
                    () => Array(state.cols).fill('#'));

                state.rects.forEach((r0, i) => {
                    const r = norm(r0),
                        t = tags[i];
                    for (let rr = r.r0; rr < r.r1; rr++)
                        for (let cc = r.c0; cc < r.c1; cc++)
                            asciiRows[rr][cc] = t;
                });
                const ascii = asciiRows.map(r => r.join('')).join('\n');

                /* ---- helper blocks -------------------------------------- */
                const designTxt = ['design <- "', ascii, '"'].join('\n');

                const plotList = state.rects.map((_, i) =>
                    `  ${tags[i]} = plots[[${i + 1}]]`).join(',\n');

                const fullScript = [
                    'library(patchwork)',
                    'library(ggplot2)',
                    '',
                    'plots <- list(',
                    plotList,
                    ')',
                    '',
                    designTxt,
                    '',
                    'wrap_plots(plots, design = design)'
                ].join('\n');

                /* ---- return --------------------------------------------- */
                return urlHeader() + (incSetup ? fullScript : designTxt);
            }

            /* ---------- base-R par(fig) ------------------------------------------------ */
            case 'parfig': {
                /* 1 — placeholder list (only needed when Setup is ON) */
                const plotList = state.rects
                    .map((_, i, arr) =>
                        `  NULL${i < arr.length - 1 ? ',' : ''}  # ${nameOf(i)}`)
                    .join('\n');

                /* 2 — coords matrix (always returned) */
                const coordRows = state.rects
                    .map((r0, i, arr) => {
                        const r = norm(r0);
                        const row = [
                            f(r.c0 / state.cols), // x-min
                            f(r.c1 / state.cols), // x-max
                            f(1 - r.r1 / state.rows), // y-min (flip)
                            f(1 - r.r0 / state.rows) // y-max
                        ].join(', ');
                        return `  c(${row})${i < arr.length - 1 ? ',' : ''}  # ${nameOf(i)}`;
                    })
                    .join('\n');

                const coordsBlock = ['coords <- rbind(', coordRows, ')'].join('\n');

                /* 3 — full demo script (when Setup is ticked) */
                const fullScript = [
                    'plots <- list(',
                    plotList,
                    ')',
                    '',
                    coordsBlock,
                    '',
                    'plot.new()',
                    'par(oma = c(0,0,0,0))',
                    '',
                    'for (i in seq_along(plots)) {',
                    '  par(fig = coords[i, ], new = TRUE)',
                    '  plot(plots[[i]])',
                    '}'
                ].join('\n');

                return urlHeader() + (incSetup ? fullScript : coordsBlock);
            }

            /* ────────────────────  Python  ──────────────────── */
            case 'mpl': {
                const rows = state.rows;
                const cols = state.cols;

                /* helper → one ax_… line per rectangle -------------------- */
                const axLine = i => {
                    const nm = nameOf(i); // alias or numeric index
                    const r = norm(state.rects[i]);
                    return `ax_${nm} = fig.add_subplot(gs[${r.r0}:${r.r1}, ${r.c0}:${r.c1}])`;
                };

                /* 1 ) lines that are always variable ---------------------- */
                const varPart = [
                    `gs  = fig.add_gridspec(${rows}, ${cols})`,
                    state.rects.length ?
                    state.rects.map((_, i) => axLine(i)).join('\n') :
                    '# (no rectangles yet)'
                ].join('\n');

                /* 2 ) one-off setup (only when “Setup” is ticked) ---------- */
                const setup = [
                    'import matplotlib.pyplot as plt',
                    '',
                    'fig = plt.figure(constrained_layout=True)',
                    ''
                ].join('\n');

                /* 3 ) stitch together with URL header if requested -------- */
                return urlHeader() +
                    (incSetup ? setup + varPart : varPart);
            }

            /* 2) PLOTLY ------------------------------------------- */
            case 'plotly': {
                const rows = state.rows;
                const cols = state.cols;

                /* 1 ── build specs[][] (JS null → Python None) -------------- */
                const specs = Array.from({
                    length: rows
                }, () => Array(cols).fill(null));

                state.rects.forEach((r0, i) => {
                    const r = norm(r0);
                    specs[r.r0][r.c0] = {
                        rowspan: r.r1 - r.r0,
                        colspan: r.c1 - r.c0,
                        type: 'xy',
                        subplot: nameOf(i)
                    };
                });

                const pyVal = v =>
                    v === null ?
                    'None' :
                    '{ ' + Object.entries(v)
                    .map(([k, x]) => `'${k}': ${x}`)
                    .join(', ') + ' }';

                const specsPy = specs
                    .map(r => '    [' + r.map(pyVal).join(', ') + ']')
                    .join(',\n');

                /* 2 ── variable part (always changes with layout) ---------- */
                const varPart = [
                    'fig = sp.make_subplots(',
                    `    rows=${rows}, cols=${cols},`,
                    '    specs=[',
                    specsPy,
                    '    ]',
                    ')',
                    incSetup ? '\n# Example: fig.add_trace(trace, row=1, col=1)' : '',
                    incSetup ? 'fig.show()' : ''
                ].join('\n');

                /* 3 ── imports (only if Setup ticked) ----------------------- */
                const setup = 'import plotly.subplots as sp\n\n';

                /* 4 ── final output with optional URL header ---------------- */
                return urlHeader() + (incSetup ? setup + varPart : varPart);
            }

            /* 3) BOKEH -------------------------------------------- */
            case 'bokeh': {
                /* ---- constants ------------------------------------------ */
                const CELL = 250; // base cell size [px]
                const W = state.cols * CELL;
                const H = state.rows * CELL;

                /* ---- 1) build plot stubs + grid[][] --------------------- */
                const grid = Array.from({
                        length: state.rows
                    },
                    () => Array(state.cols).fill('None'));
                const plots = [];

                state.rects.forEach((r0, i) => {
                    const r = norm(r0);
                    const id = `p_${nameOf(i)}`;
                    plots.push(
                        `${id} = figure(plot_width=${(r.c1 - r.c0) * CELL}, ` +
                        `plot_height=${(r.r1 - r.r0) * CELL})`
                    );
                    grid[r.r0][r.c0] = id; // top-left anchor
                });

                const gridPy = grid
                    .map(r => '    [' + r.join(', ') + ']')
                    .join(',\n');

                /* ---- 2) variable section (always changes) --------------- */
                const varPart = [
                    plots.join('\n'),
                    '',
                    'grid = gridplot([',
                    gridPy,
                    `], width=${W}, height=${H}, sizing_mode='fixed')`,
                    incSetup ? '\nshow(grid)' : ''
                ].join('\n');

                /* ---- 3) optional imports -------------------------------- */
                const setup = [
                    'from bokeh.plotting import figure, show',
                    'from bokeh.layouts  import gridplot',
                    ''
                ].join('\n');

                /* ---- 4) final output ------------------------------------ */
                return urlHeader() + (incSetup ? setup + varPart : varPart);
            }

            /* ---------- Julia • Makie ---------- */
            case 'makie': {
                const R = state.rows,
                    C = state.cols; // grid size (always needed)

                /* ---- axis definitions (always vary) -------------------- */
                const axes = state.rects.map((r0, i) => {
                    const r = norm(r0),
                        n = nameOf(i);
                    return `ax_${n} = Axis(g[${r.r0+1}:${r.r1}, ${r.c0+1}:${r.c1}])`;
                }).join('\n') || '# (no rectangles)';

                /* ---- placeholder loop: **always** emitted -------------- */
                const placeholders = `
for r in 1:${R}, c in 1:${C}
    g[r, c] = GridLayout()          # keep empty cells / whitespace
end
`;

                /* ---- optional header & trailer ------------------------- */
                const header = incSetup ? `using CairoMakie
f = Figure(resolution = (800, 800))
g = f.layout
` : '';

                const trailer = incSetup ? '\ndisplay(f)' : '';

                /* ---- final Makie snippet ------------------------------- */
                return urlHeader() // only if “URL” is ticked
                    +
                    header // maybe empty
                    +
                    placeholders // always present
                    +
                    axes // always present
                    +
                    trailer; // maybe empty
            }
            /* ────────────────────  Other  ──────────────────── */

            /* ----------------------------------------------------------- */
            /* “Other” ▸ CSV                                               */
            /* ----------------------------------------------------------- */
            case 'csv': {
                /* the body never needs “setup”; just emit the matrix        */
                const csvBody = M.map(r => r.join(',')).join('\n');

                /* prepend the URL header only when “URL” is ticked */
                return urlHeader() + csvBody;
            }

            default:
                return '# unknown renderer';
        }
    }

    const update = () => {
        repaint();
        legend();
        rcodeEl.value = generateCode();
        dimText.textContent = `(${state.rows}×${state.cols})`;
        cursor();
        syncURL();
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
        syncURL();
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
        const {
            x,
            y
        } = pos(e);
        const hitInfo = hit(x, y);
        if (!hitInfo || hitInfo.kind !== 'inside') return;
        const idx = hitInfo.idx;
        const current = state.aliases[idx] || '';
        const name = prompt('Rectangle name:', current);
        if (name === null) return;
        history();
        state.aliases[idx] = name.trim();
        update();
        syncURL();
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
            update();
            syncURL(); // redraw + renumber colours
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
            syncURL();
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
            syncURL();
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
            syncURL();
            return;
        }
    });

    document.querySelectorAll('input[name="renderer"]').forEach(radio => {
        radio.onchange = () => {
            state.renderer = radio.value;
            update();
            syncURL();
        };
    });

    /* ---------- controls ---------- */
    function resizeCanvas() {
        const box = wrap.getBoundingClientRect(); // free CSS px
        const dpr = window.devicePixelRatio || 1;

        /* -------- choose displayed (CSS) size --------------------------- */
        let wCss, hCss;

        if (state.square) { // ① exact squares
            const cell = Math.min(box.width / state.cols,
                box.height / state.rows);
            wCss = cell * state.cols;
            hCss = cell * state.rows;

        } else if (state.aspect) { // ② forced AR
            /* try to use full width – shrink if too tall                     */
            wCss = box.width;
            hCss = wCss / state.aspect;
            if (hCss > box.height) {
                hCss = box.height;
                wCss = hCss * state.aspect;
            }

        } else { // ③ fill pane
            wCss = box.width;
            hCss = box.height;
        }

        /* -------- update element + backing bitmap ----------------------- */
        canvas.style.width = wCss + 'px';
        canvas.style.height = hCss + 'px';
        canvas.width = Math.round(wCss * dpr);
        canvas.height = Math.round(hCss * dpr);

        /* cosmetic centring inside the wrap                               */
        canvas.style.marginLeft = ((box.width - wCss) / 2) + 'px';
        canvas.style.marginTop = ((box.height - hCss) / 2) + 'px';

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
            resizeCanvas();
            update();
            syncURL();
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

    function flashCopied() {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = 'Copy';
        }, 900);
    }

    aspect.oninput = () => { // empty = auto
        const v = parseFloat(aspect.value);
        state.aspect = isFinite(v) ? Math.max(0.2, v) : null;
        if (state.square && state.aspect) { // force off – can’t mix
            squareEl.checked = state.square = false;
        }
        resizeCanvas();
    };

    copyBtn.onclick = () => {
        /* works for <textarea>, <pre>, <code>, … */
        const code =
            'value' in rcodeEl && rcodeEl.value !== undefined ?
            rcodeEl.value :
            rcodeEl.textContent;

        /* 1 – modern Clipboard API (needs https or localhost) */
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(code)
                .then(flashCopied)
                .catch(fallbackCopy); // e.g. insecure context
            return;
        }

        /* 2 – fallback for file://, plain http, old browsers */
        fallbackCopy();

        function fallbackCopy() {
            const ta = document.createElement('textarea');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            try {
                if (document.execCommand('copy')) flashCopied();
                else alert('Copy failed – please copy manually.');
            } finally {
                document.body.removeChild(ta);
            }
        }
    };

    trimBtn.onclick = () => {
        if (!state.rects.length) return; // nothing to trim

        /* 1 ── find global bounding box of all rectangles */
        let minR = Infinity,
            minC = Infinity,
            maxR = -Infinity,
            maxC = -Infinity;

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

        history(); // enable undo

        /* 2 ── shift every rectangle so (minR,minC) becomes (0,0) */
        state.rects = state.rects.map(r0 => {
            const r = norm(r0);
            return {
                r0: r.r0 - minR,
                c0: r.c0 - minC,
                r1: r.r1 - minR,
                c1: r.c1 - minC
            };
        });

        /* 3 ── shrink the grid to the bounding-box size */
        const newRows = maxR - minR;
        const newCols = maxC - minC;
        state.rows = newRows;
        state.cols = newCols;
        rowsEl.value = newRows;
        colsEl.value = newCols;

        update();
        syncURL(); // repaint, legend, R code
    };

    reduceBtn.onclick = () => {
        if (!state.rects.length) return; // nothing to reduce

        /* 1 ── collect every horizontal & vertical boundary */
        const rSet = new Set([0, state.rows]);
        const cSet = new Set([0, state.cols]);
        state.rects.forEach(r0 => {
            const r = norm(r0);
            rSet.add(r.r0);
            rSet.add(r.r1);
            cSet.add(r.c0);
            cSet.add(r.c1);
        });

        /* 2 ── greatest common divisor of all boundary coordinates */
        const rFactor = [...rSet].reduce((g, v) => gcd(g, v));
        const cFactor = [...cSet].reduce((g, v) => gcd(g, v));

        /* if no common divisor >1 in either dimension, nothing to do */
        if (rFactor === 1 && cFactor === 1) return;

        history(); // enable undo

        /* 3 ── rescale every rectangle */
        state.rects = state.rects.map(r0 => {
            const r = norm(r0);
            return {
                r0: r.r0 / rFactor,
                c0: r.c0 / cFactor,
                r1: r.r1 / rFactor,
                c1: r.c1 / cFactor
            };
        });

        /* 4 ── rescale the grid itself */
        state.rows = Math.round(state.rows / rFactor);
        state.cols = Math.round(state.cols / cFactor);
        rowsEl.value = state.rows;
        colsEl.value = state.cols;

        update();
        syncURL(); // repaint everything
    };


    clearBtn.onclick = () => {
        if (!state.rects.length) return;
        history();
        state.rects.length = 0;
        state.aliases.length = 0;
        update();
        syncURL();
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

    darkEl.onchange = () => {
        document.body.classList.toggle('dark', darkEl.checked);
        repaint(); // grid colour changes
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
                        syncURL();
                    }
                } catch (_) {}
            };
            fr.readAsText(f);
        };
        inp.click();
    };

    /* ---------- simple tooltip engine ---------------------------------- */
    {
        const tip = Object.assign(document.createElement('div'), {
            className: 'tooltip'
        });
        document.body.append(tip);

        let timer = null;

        function show(el) {
            tip.textContent = el.dataset.tip;
            tip.style.opacity = '1';

            const r = el.getBoundingClientRect(),
                pad = 8, // gap below the element
                x = Math.min(r.left, window.innerWidth - tip.offsetWidth - pad),
                y = Math.min(r.bottom + pad, window.innerHeight - tip.offsetHeight - pad);

            tip.style.left = x + 'px';
            tip.style.top = y + 'px';
        }

        function hide() {
            tip.style.opacity = '0';
        }

        document.addEventListener('mouseover', e => {
            const el = e.target.closest('[data-tip]');
            if (!el) return;
            timer = setTimeout(() => show(el), 1000); // 350 ms hover delay
        });

        document.addEventListener('mouseout', e => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            hide();
        });
    }


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
                    const G = main.getBoundingClientRect().width - TOTAL_GAPS; // full free width

                    let L = L0,
                        M = M0,
                        R = R0; // start widths for this drag

                    if (id === 'splitLeft') {
                        /* slide border between LEFT and MIDDLE, keep RIGHT fixed */
                        L = clamp(L0 + dx, MIN_LEFT, G - MIN_MID - R0);
                        M = G - L - R0; // whatever space remains

                        /* final safeguard */
                        if (M < MIN_MID) { // shouldn’t happen, but keep gap visible
                            M = MIN_MID;
                            L = G - R0 - M;
                        }

                    } else { // splitRight
                        /* slide border between MIDDLE and RIGHT, keep LEFT fixed */
                        R = clamp(R0 - dx, MIN_RIGHT, G - L0 - MIN_MID); // note R0 - dx (drag right → dx>0 shrinks R)
                        M = G - L0 - R;

                        if (M < MIN_MID) { // keep 6 px splitter + 10 px gap visible
                            M = MIN_MID;
                            R = G - L0 - M;
                        }
                    }

                    setCss('--w-left', L);
                    setCss('--w-mid', M);
                    setCss('--w-right', R);

                    resizeCanvas(); // keep canvas crisp while dragging
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
    /* --- load state from #hash if present --------------------------------- */
    if (location.hash.length > 1) {
        const saved = decodeState(location.hash.slice(1));
        if (saved && saved.rows && saved.cols) {
            Object.assign(state, {
                rows: saved.rows,
                cols: saved.cols,
                rects: saved.rects.map(norm),
                aliases: saved.aliases || [],
                square: !!saved.square,
                aspect: saved.aspect ?? null
            });
            renderer = saved.renderer || 'layout';
            /* reflect UI widgets */
            rowsEl.value = state.rows;
            colsEl.value = state.cols;
            squareEl.checked = state.square;
            aspect.value = state.aspect ?? '';
            document.querySelector(`input[name="render"][value="${renderer}"]`).checked = true;
        }
    }

    history();
    resizeCanvas();
    update();
    syncURL();
})();