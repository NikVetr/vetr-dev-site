import { state }                    from './state.js';
import { norm, nameOf, encodeState } from './helpers.js';
import {
  rcodeEl,                          // where the generated code lands
  renderRadios,
  incSetupEl, incURLEl
}                                   from './dom.js';
import { update }                   from './controls.js';

/* ---------- generate code ---------- */
export const buildMat = () => {
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

export function matrixLiteral() {
    const M = buildMat();
    return M.map(r => `c(${r.join(', ')})`).join(',\n  ');
}

export function designMatrix() {
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

export function widthsHeights() {
    /* vectors of column widths / row heights (all 1 → equal sizing)   */
    return {
        w: 'unit(rep(1, ' + state.cols + '), "null")',
        h: 'unit(rep(1, ' + state.rows + '), "null")'
    };
}

/* normalized rectangles + fractional coords (0..1) once */
function normalizedRects() {
  const R = state.rows, C = state.cols;
  return state.rects.map((r0, i) => {
    const r = norm(r0);
    const id = i + 1;
    const alias = nameOf(i);
    const x0 = r.c0 / C, x1 = r.c1 / C;
    const y0 = r.r0 / R, y1 = r.r1 / R;
    return {
      id,
      alias,
      // integer grid coords
      r0: r.r0, r1: r.r1, c0: r.c0, c1: r.c1,
      // fractional (top-left origin for R grid; flip later if needed)
      fx0: f(x0), fx1: f(x1),
      fy0: f(y0), fy1: f(y1),
      // sizes
      fw:  f(x1 - x0),
      fh:  f(y1 - y0)
    };
  });
}

/* ascii layout helper (used in patchwork and exports) */
function asciiLayout(fillChar = '#') {
  const rows = Array.from({ length: state.rows }, () => Array(state.cols).fill(fillChar));
  state.rects.forEach((r0, i) => {
    const r = norm(r0);
    const tag = String.fromCharCode('A'.charCodeAt(0) + i);
    for (let rr = r.r0; rr < r.r1; rr++)
      for (let cc = r.c0; cc < r.c1; cc++)
        rows[rr][cc] = tag;
  });
  return rows.map(r => r.join('')).join('\n');
}

/* hint for a download filename (purely advisory; UI can read it) */
export function filenameHint(ext = 'R') {
  const base = (renderer.value || 'layout');
  return `layout_${state.rows}x${state.cols}_${base}.${ext}`;
}

/* unit-square geometry with bottom-left origin */
function rectsUnitBL() {
  const R = state.rows, C = state.cols;
  return state.rects.map((r0, i) => {
    const r = norm(r0);
    const name = nameOf(i);
    const x0 = r.c0 / C, x1 = r.c1 / C;
    const yTop = r.r0 / R, yBot = r.r1 / R;      // top-origin
    const y0 = 1 - yBot, y1 = 1 - yTop;          // flip → bottom-left origin
    const w = x1 - x0, h = y1 - y0;
    return {
      idx: i + 1,
      name,
      // corners (clockwise starting bottom-left)
      x1: f(x0), y1: f(y0),            // BL
      x2: f(x1), y2: f(y0),            // BR
      x3: f(x1), y3: f(y1),            // TR
      x4: f(x0), y4: f(y1),            // TL
      // box
      x: f(x0), y: f(y0), w: f(w), h: f(h)
    };
  });
}

/* quick check: does any rect span multiple rows/cols? (for subfig grid) */
function hasSpans() {
  return state.rects.some(r0 => {
    const r = norm(r0);
    return (r.r1 - r.r0) > 1 || (r.c1 - r.c0) > 1;
  });
}

/* ownership grid: cell -> rect id (1..N) or 0 if blank */
function cellOwners() {
  const G = Array.from({ length: state.rows }, () => Array(state.cols).fill(0));
  state.rects.forEach((r0, i) => {
    const r = norm(r0), id = i + 1;
    for (let rr = r.r0; rr < r.r1; rr++)
      for (let cc = r.c0; cc < r.c1; cc++)
        G[rr][cc] = id;
  });
  return G;
}

/* true if (r,c) is the top-left anchor cell for its rectangle */
function isAnchor(G, r, c) {
  const id = G[r][c];
  if (!id) return false;
  const r0 = r === 0 ? -1 : G[r-1][c];
  const c0 = c === 0 ? -1 : G[r][c-1];
  return (r0 !== id) && (c0 !== id);
}

/* span size (height, width) for the rectangle anchored at (r,c) */
function spanHW(G, r, c) {
  const id = G[r][c];
  let h = 0, w = 0;
  // height
  for (let rr = r; rr < state.rows && G[rr][c] === id; rr++) h++;
  // width (scan first row of this rect)
  for (let cc = c; cc < state.cols && G[r][cc] === id; cc++) w++;
  return { h, w, id };
}

/* tags: 'A','B','C',… (extend to digits/lowercase if >26) */
function tagChars(n) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const a = 'abcdefghijklmnopqrstuvwxyz';
  const d = '0123456789';
  const pool = A + a + d;
  if (n > pool.length) {
    // fallback: base-36-like multi-char tokens if users go wild
    return Array.from({ length: n }, (_, i) => i.toString(36));
  }
  return pool.slice(0, n).split('');
}

/* build an ASCII mosaic (rows joined with '\n'); '#' = blank */
function asciiMosaic() {
  const tags = tagChars(state.rects.length);
  const rows = Array.from({ length: state.rows }, () => Array(state.cols).fill('#'));
  state.rects.forEach((r0, i) => {
    const r = norm(r0), t = tags[i];
    for (let rr = r.r0; rr < r.r1; rr++)
      for (let cc = r.c0; cc < r.c1; cc++)
        rows[rr][cc] = t;
  });
  return rows.map(r => r.join('')).join('\n');
}

/* unique tokens in reading order (left→right, top→bottom) */
function tokensInReadingOrder(ascii, blank = '#') {
  const seen = new Set();
  const order = [];
  ascii.split('\n').forEach(line => {
    for (const ch of line) {
      if (ch !== blank && !seen.has(ch)) {
        seen.add(ch);
        order.push(ch);
      }
    }
  });
  return order;
}

/* ---------- main factory ---------- */

/* default: include full setup, omit URL */
export let incSetup = incSetupEl.checked;
export let incURL = incURLEl.checked;

[incSetupEl, incURLEl].forEach(el => {
    el.onchange = () => {
        incSetup = incSetupEl.checked;
        incURL = incURLEl.checked;
        update(); // regenerate code immediately
    };
});

/* format numbers like 0.63636… → "0.6364", 0.250000 → "0.25" */
export const f = (x, d = 4) => +x.toFixed(d) // round
    .toString() // drop trailing zeros
    .replace(/\.0+$/, '');

export const fmt = (n, k = 6) => +n.toFixed(k); // trim long floats

export function urlHeader() {
    if (!incURL) return '';
    const url = 'https://vetr.dev/layout-gui/#' + encodeState();
    return `# ${url}\n\n`;
}

export const renderer = { value: 'layout' }; // default

export function generateCode() {
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


    switch (renderer.value) {

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

        case 'grid': {
            // R grid viewports; origin at top-left (grid uses bottom-left Y, so flip)
            const R = state.rows, C = state.cols;
            const rects = normalizedRects().map(r => ({
                id: r.id,
                alias: r.alias,
                x0: r.fx0,                 // left
                x1: r.fx1,                 // right
                y0: f(1 - r.fy1),          // flip: data top -> grid bottom
                y1: f(1 - r.fy0),          // flip
                w:  r.fw,
                h:  r.fh
            }));

            const df = [
                'mat <- data.frame(',
                '  id = c(' + rects.map(r => r.id).join(', ') + '),',
                '  x  = c(' + rects.map(r => r.x0).join(', ') + '),',
                '  y  = c(' + rects.map(r => r.y0).join(', ') + '),',
                '  w  = c(' + rects.map(r => r.w ).join(', ') + '),',
                '  h  = c(' + rects.map(r => r.h ).join(', ') + ')',
                ')'
            ].join('\n');

            const setup = [
                'library(grid)',
                '',
                df,
                '',
                'grid.newpage()',
                'pushViewport(viewport(xscale = c(0,1), yscale = c(0,1)))',
                'for (i in seq_len(nrow(mat))) {',
                '  with(mat[i,], {',
                '    vp <- viewport(x = x + w/2, y = y + h/2, width = w, height = h, just = c("center","center"))',
                '    pushViewport(vp)',
                '    # draw your grob here, e.g.: grid.rect(gp = gpar(col = "black", fill = NA))',
                '    popViewport()',
                '  })',
                '}'
            ].join('\n');

            // when Setup is off, just return data frame + loop skeleton
            const body = incSetup ? setup : df;

            return urlHeader() + body;
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

        case 'mpl_mosaic': {
            const mosaic = asciiMosaic(); // '#' as blanks
            const setup = incSetup ? [
                'import matplotlib.pyplot as plt',
                '',
                'mosaic = """',
                mosaic,
                '""".strip()',
                '',
                'fig, axd = plt.subplot_mosaic(mosaic, empty_sentinel="#", constrained_layout=True)',
                '# Example:',
                '# axd["A"].plot([0,1],[0,1])',
                'plt.show()'
            ].join('\n') : [
                'mosaic = """',
                mosaic,
                '""".strip()',
                '',
                'fig, axd = plt.subplot_mosaic(mosaic, empty_sentinel="#", constrained_layout=True)'
            ].join('\n');

            return urlHeader() + setup;
        }

        case 'mpl_axes': {
            // absolute axes with fig.add_axes([left,bottom,width,height])
            const rects = normalizedRects().map(r => ({
                name: nameOf(r.id - 1).replace(/\W+/g, '_'),
                left: r.fx0,
                right: r.fx1,
                top: r.fy0,
                bottom: r.fy1,
                // matplotlib uses bottom-left origin
                l: r.fx0,
                b: f(1 - r.fy1),
                w: r.fw,
                h: r.fh
            }));

            const setup = [
                'import matplotlib.pyplot as plt',
                '',
                'fig = plt.figure()',
                ...rects.map(r => `ax_${r.name} = fig.add_axes([${r.l}, ${r.b}, ${r.w}, ${r.h}])`),
                // minimal guidance when Setup on
                incSetup ? 'plt.show()' : ''
            ].join('\n');

            const body = incSetup ? setup : rects.map(r => `ax_${r.name} = fig.add_axes([${r.l}, ${r.b}, ${r.w}, ${r.h}])`).join('\n');

            return urlHeader() + body;
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

        case 'plots': {
            const ascii = asciiMosaic();           // '#' = blank
            const tokens = tokensInReadingOrder(ascii, '#'); // e.g., ['A','B','C']
            const hasBlanks = ascii.includes('#');

            // Build @layout text: rows like [ A B ; A C ]
            const layoutRows = ascii.split('\n').map(row => row.split('').join(' '));
            const layoutTxt = '[ ' + layoutRows.join(' ; ') + ' ]';

            // plots vector in the same order tokens appear in @layout
            // add a dummy blank if '#' appears
            const plotDecls = [
                'using Plots',
                incSetup ? 'default(size=(900,700))' : null,
                '',
                `layout_spec = @layout ${layoutTxt}`,
                hasBlanks ? 'blank = plot(framestyle=:none, grid=false, axis=false)' : null,
                '',
                '# your actual plots in order of the tokens below:',
                `# tokens: ${tokens.join(', ')}${hasBlanks ? ', #' : ''}`,
                `plots = [${tokens.map(t => `plot()  # ${t}`).join(', ')}${hasBlanks ? ', blank  # #' : ''}]`,
                '',
                'plt = plot(plots..., layout=layout_spec)',
                incSetup ? 'display(plt)' : null
            ].filter(Boolean).join('\n');

            return urlHeader() + plotDecls;
        }


        /* ────────────────────  Matlab / Octave  ──────────────────── */
        case 'tiled': {
            const R = state.rows, C = state.cols;
            // build per-rect geometry once
            const lines = [];
            if (incSetup) {
                lines.push(
                `% layout: ${R}x${C}`,
                `tiledlayout(${R}, ${C}, 'Padding','compact','TileSpacing','compact');`,
                ''
                );
            } else {
                lines.push(
                `tiledlayout(${R}, ${C});`
                );
            }

            state.rects.forEach((r0, i) => {
                const r = norm(r0);
                const nm = nameOf(i).replace(/\W+/g, '_') || `r${i+1}`;
                const rspan = r.r1 - r.r0;
                const cspan = r.c1 - r.c0;
                const tileIndex = (r.r0 * C) + r.c0 + 1; // MATLAB is 1-based
                lines.push(
                `% ${i+1} ${nameOf(i)}`,
                `nexttile(${tileIndex}, [${rspan} ${cspan}]);`,
                `ax_${nm} = gca;`,
                incSetup ? `% plot(ax_${nm}, ...);` : ''
                );
            });

            return urlHeader() + lines.join('\n');
        }

        /* ────────────────────  Mathematica  ──────────────────── */
        case 'mma_grid': {
            // ownership grid: 0=blank, else rect id (1-based)
            const G = Array.from({ length: state.rows }, () => Array(state.cols).fill(0));
            state.rects.forEach((r0, i) => {
                const r = norm(r0), id = i + 1;
                for (let rr = r.r0; rr < r.r1; rr++)
                for (let cc = r.c0; cc < r.c1; cc++)
                    G[rr][cc] = id;
            });

            // build WL rows with SpanFromLeft / SpanFromAbove
            const wlines = [];
            wlines.push('(* Grid with row/col spans; replace Style[...] with actual Graphics *)');
            wlines.push('rowMajor = {');
            for (let r = 0; r < state.rows; r++) {
                const cells = [];
                for (let c = 0; c < state.cols; c++) {
                const id = G[r][c];
                if (id === 0) {
                    cells.push('""');
                    continue;
                }
                const up = r > 0 ? G[r-1][c] : -1;
                const left = c > 0 ? G[r][c-1] : -1;
                if (id === left && id !== up) {
                    cells.push('SpanFromLeft');
                } else if (id === up && id !== left) {
                    cells.push('SpanFromAbove');
                } else if (id === up && id === left) {
                    // interior of a merged block; prefer SpanFromLeft to continue horizontal span
                    cells.push('SpanFromLeft');
                } else {
                    const label = nameOf(id-1);
                    cells.push(`Style["${label}", Bold]`);
                }
                }
                wlines.push('  {' + cells.join(', ') + '}' + (r < state.rows - 1 ? ',' : ''));
            }
            wlines.push('};');
            wlines.push('');
            wlines.push('Grid[rowMajor, Frame -> All, Spacings -> {0, 0}]');

            return urlHeader() + wlines.join('\n');
        }


        /* ────────────────────  Other  ──────────────────── */

        /* ----------------------------------------------------------- */
        /* “Other” ▸ CSV                                               */
        /* ----------------------------------------------------------- */
        case 'csv_inds': {
            /* the body never needs “setup”; just emit the matrix        */
            const csvBody = M.map(r => r.join(',')).join('\n');

            /* prepend the URL header only when “URL” is ticked */
            return urlHeader() + csvBody;
        }

        case 'csv_dims': {
            const rows = rectsUnitBL();
            const header = 'idx,name,x,y,w,h';
            const body = rows.map(r => `${r.idx},${r.name},${r.x},${r.y},${r.w},${r.h}`).join('\n');
            return urlHeader() + header + '\n' + body;
        }

        case 'csv_coords': {
            const rows = rectsUnitBL();
            const header = 'idx,name,x1,x2,x3,x4,y1,y2,y3,y4';
            const line = r => [
                r.idx, r.name, r.x1, r.x2, r.x3, r.x4, r.y1, r.y2, r.y3, r.y4
            ].join(',');
            const body = rows.map(line).join('\n');
            return urlHeader() + header + '\n' + body;
        }

        case 'json': {
            const payload = {
                rows: state.rows,
                cols: state.cols,
                rects: normalizedRects().map(r => ({
                id: r.id,
                name: nameOf(r.id - 1),
                r0: r.r0, r1: r.r1, c0: r.c0, c1: r.c1,
                fx0: r.fx0, fx1: r.fx1, fy0: r.fy0, fy1: r.fy1,
                fw: r.fw, fh: r.fh
                })),
                ascii: asciiLayout()
            };
            const s = JSON.stringify(payload, null, 2);
            return (incURL ? urlHeader() : '') + s;
        }

        case 'yaml': {
            // simple hand-rolled YAML (no deps in the target)
            const lines = [];
            if (incURL) lines.push(urlHeader().trim(), ''); // keep top comment if chosen
            lines.push(`rows: ${state.rows}`);
            lines.push(`cols: ${state.cols}`);
            lines.push('rects:');
            normalizedRects().forEach(r => {
                lines.push(`  - id: ${r.id}`);
                lines.push(`    name: "${nameOf(r.id - 1)}"`);
                lines.push(`    r0: ${r.r0}`);
                lines.push(`    r1: ${r.r1}`);
                lines.push(`    c0: ${r.c0}`);
                lines.push(`    c1: ${r.c1}`);
                lines.push(`    fx0: ${r.fx0}`);
                lines.push(`    fx1: ${r.fx1}`);
                lines.push(`    fy0: ${r.fy0}`);
                lines.push(`    fy1: ${r.fy1}`);
                lines.push(`    fw: ${r.fw}`);
                lines.push(`    fh: ${r.fh}`);
            });
            lines.push('ascii: |');
            asciiLayout().split('\n').forEach(row => lines.push(`  ${row}`));
            return lines.join('\n');
        }


        case 'textpos': {
            const rows = rectsUnitBL();
            const setup = incSetup ? [
                '% required packages:',
                '\\usepackage[absolute,overlay]{textpos}',
                '% configure page-fraction modules:',
                '\\setlength{\\TPHorizModule}{\\paperwidth}',
                '\\setlength{\\TPVertModule}{\\paperheight}',
                ''
            ].join('\n') : '';

            const blocks = rows.map(r => {
                // width = w·textwidth, height = h·textheight, placed at (x·textwidth, y·textheight)
                return [
                `% ${r.idx} ${r.name}`,
                `\\begin{textblock*}{${r.w}\\textwidth}(${r.x}\\textwidth,${r.y}\\textheight)`,
                `  \\fbox{\\parbox[t][${r.h}\\textheight][t]{${r.w}\\textwidth}{\\centering \\textbf{${r.name}}}}`,
                `\\end{textblock*}`
                ].join('\n');
            }).join('\n\n');

            return urlHeader() + setup + blocks;
        }

        case 'tikz': {
            const rows = rectsUnitBL();
            const setup = incSetup ? [
                '% required packages:',
                '\\usepackage{tikz}',
                '\\usetikzlibrary{calc}',
                ''
            ].join('\n') : '';

            const body = [
                '\\begin{tikzpicture}[remember picture,overlay]',
                ...rows.map(r => {
                // anchor at page.south west + (x,y) in fractions of page size
                const pos = `($ (current page.south west) + (${r.x}\\paperwidth, ${r.y}\\paperheight) $)`;
                return [
                    `  % ${r.idx} ${r.name}`,
                    `  \\node[anchor=south west,`,
                    `        inner sep=0,`,
                    `        minimum width=${r.w}\\paperwidth,`,
                    `        minimum height=${r.h}\\paperheight,`,
                    `        draw] at ${pos} {\\centering \\textbf{${r.name}}};`
                ].join('\n');
                }),
                '\\end{tikzpicture>'
            ].join('\n');

            return urlHeader() + setup + body;
        }

        case 'tabularx': {
            const G = cellOwners();
            const R = state.rows, C = state.cols;

            const setup = incSetup ? [
                '% grid-with-spans using tabularx + multirow',
                '\\usepackage{tabularx}',
                '\\usepackage{multirow}',
                '\\usepackage{booktabs}', // optional, for nicer rules
                ''
            ].join('\n') : '';

            // column spec: C columns of equal flex width
            const colSpec = 'X'.repeat(C).split('').join('|'); // X|X|X ... visually boxed
            const topRule = '\\toprule';
            const midRule = '\\midrule';
            const botRule = '\\bottomrule';

            const nameOfId = id => nameOf(id - 1);

            const lines = [];
            // header (optional). users can comment out if unwanted:
            lines.push(`\\begin{tabularx}{\\textwidth}{${colSpec}}`);
            lines.push(topRule);

            for (let r = 0; r < R; r++) {
                let c = 0;
                const rowCells = [];
                while (c < C) {
                const id = G[r][c];
                if (id === 0) {
                    rowCells.push(''); // empty cell
                    c += 1;
                } else if (isAnchor(G, r, c)) {
                    const { h, w } = spanHW(G, r, c);
                    // compose the cell with nested multirow+multicolumn
                    const label = nameOfId(id);
                    const cell = `\\multirow{${h}}{*}{\\multicolumn{${w}}{c}{\\fbox{${label}}}}`;
                    rowCells.push(cell);
                    c += w;
                } else {
                    // covered by a span originating to the left or above; skip it
                    c += 1;
                    // BUT we must emit nothing for this cell—tabularx needs a placeholder.
                    // We’ll fix alignment by inserting empty cells when not consumed by a multicolumn.
                    // To avoid extra &'s, we’ll mark it and prune later.
                    rowCells.push('__SKIP__');
                }
                }
                // remove placeholders that were actually spanned horizontally
                const pruned = [];
                for (let i = 0; i < rowCells.length; i++) {
                if (rowCells[i] === '__SKIP__') continue;
                pruned.push(rowCells[i]);
                }
                lines.push(pruned.join(' & ') + ' \\\\');
                if (r < R - 1) lines.push(midRule);
            }

            lines.push(botRule);
            lines.push('\\end{tabularx}');

            const body = lines.join('\n');
            return urlHeader() + setup + body;
            }

        default:
            return '# unknown renderer';
    }
}