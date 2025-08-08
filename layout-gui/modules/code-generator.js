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