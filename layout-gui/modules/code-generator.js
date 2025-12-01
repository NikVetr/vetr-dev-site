import { state }                    from './state.js';
import { norm, nameOf, encodeState } from './helpers.js';
import {
  rcodeEl,                          // where the generated code lands
  renderRadios,
  incSetupEl, incURLEl, incExampleEl, incLabelsEl,
  labelSwitch
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
export let incExample = incExampleEl.checked;
export let incLabels  = incLabelsEl.checked;

[incSetupEl, incURLEl, incExampleEl, incLabelsEl].forEach(el => {
  el.onchange = () => {
    incSetup   = incSetupEl.checked;
    incURL     = incURLEl.checked;
    incExample = incExampleEl.checked;
    incLabels  = incLabelsEl.checked;
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

/* ----- helpers for Example generation (refined) ----- */

/* ----- shape → type, with diversity (alternate per shape) ----- */
function classifyShape(r0) {
  const r = norm(r0);
  const w = (r.c1 - r.c0), h = (r.r1 - r.r0);
  const ar = w / Math.max(1e-9, h);
  if (ar > 1.3) return 'wide';
  if (ar < 0.77) return 'tall';
  return 'square';
}

function pickTypeForShape(shape, k) {
  const cycles = {
    wide:   ['manhattan', 'hist', 'scatter'],  // NEW: manhattan for long skinny
    tall:   ['vline', 'heatmap'],
    square: ['scatter', 'heatmap', 'hist']
  };
  const arr = cycles[shape] || ['scatter'];
  return arr[k % arr.length];
}

// prefer state.colours[i], fallback to rect color-ish fields
function rectColor(i) {
  const fromPalette = (state.colours && state.colours[i]) ? state.colours[i] : null;
  if (fromPalette) return fromPalette;
  const r = state.rects[i] || {};
  return r.color || r.fill || r.stroke || r.col || '#1f77b4';
}

// label/comment: "# <id> <alias?>"
function rectCommentHeader(i) {
  const id = i + 1;
  const alias = (state.aliases && state.aliases[i] != null)
    ? String(state.aliases[i]).trim()
    : '';
  const nm = alias || nameOf(i) || String(id);
  return (String(nm) === String(id)) ? `# ${id}` : `# ${id} ${nm}`;
}

// parse CSS hsl()/hsla() and return hex (ignore alpha; we add transparency via adjustcolor in R)
function hslStringToHex(s) {
  // extract inside of parentheses, normalize separators (commas, spaces, slash)
  const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')).trim();
  const tokens = inner
    .replace(/,/g, ' ')
    .replace(/\s+\/\s+/, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // tokens: [h, s%, l%, (alpha?)] — hue may include 'deg'
  const rawH = tokens[0].replace(/deg$/i, '');
  const rawS = tokens[1].replace('%', '');
  const rawL = tokens[2].replace('%', '');

  const h = parseFloat(rawH);
  const S = Math.max(0, Math.min(1, parseFloat(rawS) / 100));
  const L = Math.max(0, Math.min(1, parseFloat(rawL) / 100));

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  let r, g, b;
  if (S === 0) {
    r = g = b = L;
  } else {
    const hh = ((h % 360) + 360) % 360 / 360;
    const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
    const p = 2 * L - q;
    r = hue2rgb(p, q, hh + 1/3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1/3);
  }

  const R = Math.round(r * 255).toString(16).padStart(2, '0');
  const G = Math.round(g * 255).toString(16).padStart(2, '0');
  const B = Math.round(b * 255).toString(16).padStart(2, '0');
  return `#${R}${G}${B}`;
}

// parse CSS rgb()/rgba() and return hex (ignore alpha in rgba)
function rgbStringToHex(s) {
  const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')).trim();
  const parts = inner.split(',').map(x => x.trim());
  // handle both "rgb(r,g,b)" and "rgb(r g b)" (CSS4 allows spaces)
  const nums = (parts.length === 1 ? inner.split(/\s+/) : parts).slice(0, 3);
  const [r, g, b] = nums.map(v => {
    if (/%$/.test(v)) {
      // percentage form: 100% → 255
      return Math.round(255 * (parseFloat(v) / 100));
    }
    return Math.max(0, Math.min(255, parseFloat(v)));
  });
  const R = Math.round(r).toString(16).padStart(2, '0');
  const G = Math.round(g).toString(16).padStart(2, '0');
  const B = Math.round(b).toString(16).padStart(2, '0');
  return `#${R}${G}${B}`;
}

// css-ish → hex (keep your existing rgb/hsl helpers)
// NOTE: use your upgraded hsl/rgb → hex helpers here
function toRColorLiteral(css) {
  if (!css) return '"#1f77b4"';
  const c = String(css).trim();
  if (c.startsWith('#')) {
    if (c.length === 4) { const r = c[1], g = c[2], b = c[3]; return `"#${r}${r}${g}${g}${b}${b}"`; }
    return `"${c}"`;
  }
  if (/^hsla?\(/i.test(c)) return `"${hslStringToHex(c)}"`;
  if (/^rgba?\(/i.test(c)) return `"${rgbStringToHex(c)}"`;
  return `"${c}"`;
}

// generate code for a single plot (base-R + ggplot2 supported; focus base-R)
export function plot_code({
  color,
  type,
  language = 'R',
  style = 'base_r'
} = {}) {
  if (language !== 'R') return `# TODO: language "${language}" not yet supported\n`;

  const COL = toRColorLiteral(color);

  // --- base R (focus) ---
  if (style === 'base_r') {
    if (type === 'scatter') {
      return [
        `n <- 700L; x <- rnorm(n); y <- 0.7*x + rnorm(n)`,
        `plot(x, y, pch=19, cex=0.6, col=${COL},`,
        `     xaxt="n", yaxt="n", xlab="", ylab="", bty="n")`,
        `box(col=${COL}, lwd=2)`,
        ``
      ].join('\n');
    }

    if (type === 'hist') {
      return [
        `x <- c(rnorm(500L), rexp(300L) - 1)`,
        `hist(x, breaks=30, col=${COL}, border=NA,`,
        `     xaxt="n", yaxt="n", xlab="", main="")`,
        `box(col=${COL}, lwd=2)`,
        ``
      ].join('\n');
    }

    if (type === 'vline') { // vertical sine with smaller amplitude
      return [
        `t <- seq(0, 2*pi, length.out=1000L)`,
        `plot(sin(3*t), t, type="l", lwd=2, col=${COL},`,
        `     xlim = c(-1.25, 1.25),`,
        `     xaxt="n", yaxt="n", xlab="", ylab="", bty="n")`,
        `box(col=${COL}, lwd=2)`,
        ``
      ].join('\n');
    }

    if (type === 'heatmap') { // block-diagonal structure
      return [
        `nr <- 60L; nc <- 40L`,
        `z <- matrix(rnorm(nr*nc, sd=0.6), nr, nc)`,
        `blk <- 4L`,
        `rs <- round(seq(0, nr, length.out=blk+1))`,
        `cs <- round(seq(0, nc, length.out=blk+1))`,
        `for (i in seq_len(blk)) {`,
        `  r <- (rs[i]+1):rs[i+1]; c <- (cs[i]+1):cs[i+1]`,
        `  z[r, c] <- z[r, c] + 2`,
        `}`,
        `pal <- colorRampPalette(c("#ffffff", ${COL}))(64)`,
        `image(z, col=pal, axes=FALSE, useRaster=TRUE)`,
        `box(col=${COL}, lwd=2)`,
        ``
      ].join('\n');
    }

    if (type === 'manhattan') { // long skinny (wide) rectangles
      return [
        `n <- 1200L`,
        `x <- seq_len(n)`,
        `y <- -log10(runif(n))`,
        `peaks <- sample.int(n, max(15L, n %/% 25L))`,
        `y[peaks] <- y[peaks] + rexp(length(peaks), rate=0.6) + 1`,
        `plot(x, y, col=NA,`,
        `     xaxt="n", yaxt="n", xlab="", ylab="", bty="n")`,
        `segments(x, 0, x, y, col=${COL})`,
        `box(col=${COL}, lwd=2)`,
        ``
      ].join('\n');
    }

    // fallback
    type = 'scatter';
    return [
      `n <- 700L; x <- rnorm(n); y <- 0.7*x + rnorm(n)`,
      `plot(x, y, pch=19, cex=0.6, col=${COL},`,
      `     xaxt="n", yaxt="n", xlab="", ylab="", bty="n")`,
      `box(col=${COL}, lwd=2)`,
      ``
    ].join('\n');
  }

  // --- ggplot2 (unchanged for now; we’ll expand later) ---
  if (type === 'scatter') {
    return [
      `n <- 600L; x <- rnorm(n); y <- 0.7*x + rnorm(n)`,
      `print(ggplot(data.frame(x,y), aes(x,y)) +`,
      `  geom_point(shape=16, size=1.3, alpha=0.6, color=${COL}) +`,
      `  theme_void())`,
      ``
    ].join('\n');
  }
  if (type === 'hist') {
    return [
      `x <- c(rnorm(500L), rexp(300L) - 1)`,
      `print(ggplot(data.frame(x), aes(x)) +`,
      `  geom_histogram(bins=30, fill=${COL}, alpha=0.65, color=NA) +`,
      `  theme_void())`,
      ``
    ].join('\n');
  }
  return `# TODO: ggplot2 "${type}" not yet implemented\n`;
}

function buildRExampleSnippets(style = 'base_r') {
  const counters = { square: 0, wide: 0, tall: 0 };

  return state.rects.map((r0, i) => {
    const shape   = classifyShape(r0);
    const typ     = pickTypeForShape(shape, counters[shape]++);
    const col     = rectColor(i);
    const comment = rectCommentHeader(i);  // "# id alias"
    const body    = plot_code({ color: col, type: typ, language: 'R', style }).trimEnd();

    return { comment, body };
  });
}


function buildExampleBlockLayoutR(style = 'base_r') {
  const lines = [];

  lines.push(`par(mar=c(2,2,1,1)+0.1, xaxs="i", yaxs="i")`);
  if (style === 'ggplot2' && !incSetup) {
    lines.push(`suppressPackageStartupMessages(library(ggplot2))`);
  }

  const snippets = buildRExampleSnippets(style);

  snippets.forEach(({ comment, body }) => {
    lines.push('');
    lines.push(comment);
    lines.push(body);
    lines.push('');
  });

  return lines.join('\n');
}

function buildExampleBlockParfigR(style = 'base_r') {
  if (!state.rects.length) return '# (no rectangles yet)';

  const R = state.rows;
  const C = state.cols;

  // coords matrix (same geometry as existing par(fig) code)
  const coordRows = state.rects
    .map((r0, i, arr) => {
      const r = norm(r0);
      const row = [
        f(r.c0 / C),              // x-min
        f(r.c1 / C),              // x-max
        f(1 - r.r1 / R),          // y-min (flip)
        f(1 - r.r0 / R)           // y-max
      ].join(', ');
      const sep = (i < arr.length - 1) ? ',' : '';
      return `  c(${row})${sep}  # ${nameOf(i)}`;
    })
    .join('\n');

  const coordsBlock = ['coords <- rbind(', coordRows, ')'].join('\n');
  const snippets    = buildRExampleSnippets(style);

  const lines = [];

  lines.push(coordsBlock);
  lines.push('');
  lines.push('plot.new()');
  lines.push('par(oma = c(0,0,0,0))');
  lines.push('par(mar=c(2,2,1,1)+0.1, xaxs="i", yaxs="i")');
  lines.push('');

  snippets.forEach(({ comment, body }, idx) => {
    const i = idx + 1;
    lines.push(comment);
    lines.push(`par(fig = coords[${i}, ], new = TRUE)`);
    lines.push(body);
    lines.push('');
  });

  return lines.join('\n');
}


// generic base-R panel labels for any grid-based layout (layout(), par(fig), …)
function buildRPanelLabels() {
  if (!incLabels || !state.rects.length) return '';

  // 123s vs ABCs from the toggle
  let mode = 'num';
  if (labelSwitch) {
    const activeBtn = labelSwitch.querySelector('button.active');
    if (activeBtn && activeBtn.dataset.mode === 'alpha') {
      mode = 'alpha';
    }
  }

  // index → "1)" / "2)" / … or "a)" / "b)" / … / "aa)" etc.
  const mkLabel = i => {
    if (mode === 'num') return `${i + 1})`;

    const base = 'abcdefghijklmnopqrstuvwxyz';
    let n = i;
    let s = '';
    while (true) {
      const rem = n % 26;
      s = base[rem] + s;
      n = Math.floor(n / 26) - 1;
      if (n < 0) break;
    }
    return `${s})`;
  };

  const R = state.rows;
  const C = state.cols;
  const xInset = 2;  // % inward from left
  const yInset = 4;  // % downward from top

  const out = [];

  // 1) define fig_lab once
  out.push('');
  out.push('# figure labels');
  out.push(
`fig_lab <- function(xp = 0, yp = 0, cex = 2, label = "", xpd = NA){
  ds <- dev.size("in")
  xb <- grconvertX(c(0, ds[1]), from = "in", to = "user")
  yb <- grconvertY(c(0, ds[2]), from = "in", to = "user")
  text(x = xb[1] + diff(xb) * xp / 100,
       y = yb[1] + diff(yb) * yp / 100,
       label = label, cex = cex, xpd = xpd)
}`
  );
  out.push('');

  // 2) one fig_lab() call per rectangle (reading order)
  state.rects.forEach((r0, i) => {
    const r = norm(r0);

    const fracLeft = r.c0 / C;
    const fracTop  = 1 - r.r0 / R;

    const xp = f(fracLeft * 100 + xInset, 2);
    const yp = f(fracTop  * 100 - yInset, 2);

    const lab = mkLabel(i).replace(/"/g, '\\"');
    out.push(`fig_lab(label = "${lab}", xp = ${xp}, yp = ${yp})`);
  });

  return out.join('\n');
}



// which extras are supported per renderer
const FEATURE_SUPPORT = {
  // R
  layout:   { example: true,  labels: true },
  grid:     { example: false, labels: false },
  gridExtra:{ example: false, labels: false },
  cowplot:  { example: false, labels: false },
  patchwork:{ example: false, labels: false },
  parfig:   { example: true, labels: true },

  // Python
  mpl:         { example: false, labels: false },
  mpl_mosaic:  { example: false, labels: false },
  mpl_axes:    { example: false, labels: false },
  plotly:      { example: false, labels: false },
  bokeh:       { example: false, labels: false },

  // Julia
  makie: { example: false, labels: false },
  plots: { example: false, labels: false },

  // MATLAB
  tiled: { example: false, labels: false },

  // Wolfram
  mma_grid: { example: false, labels: false },

  // LaTeX
  textpos:  { example: false, labels: false },
  tikz:     { example: false, labels: false },
  tabularx: { example: false, labels: false },

  // Other / CSV / JSON / YAML
  csv_inds:   { example: false, labels: false },
  csv_dims:   { example: false, labels: false },
  csv_coords: { example: false, labels: false },
  json:       { example: false, labels: false },
  yaml:       { example: false, labels: false }
};

function syncExtraOptionVisibility() {
  const key = renderer.value;
  const cfg = FEATURE_SUPPORT[key] || { example: false, labels: false };

  if (incExampleEl) {
    const wrapper = incExampleEl.closest('label') || incExampleEl;
    wrapper.style.display = cfg.example ? '' : 'none';
  }

  if (incLabelsEl) {
    const wrapper = incLabelsEl.closest('label') || incLabelsEl;
    wrapper.style.display = cfg.labels ? '' : 'none';
  }
}

export function generateCode() {
  syncExtraOptionVisibility();
  switch (renderer.value) {

    /* ──────────────────────  R  ────────────────────── */
    case 'layout':    return gc_R_layout();
    case 'grid':      return gc_R_grid();
    case 'gridExtra': return gc_R_gridExtra();
    case 'cowplot':   return gc_R_cowplot();
    case 'patchwork': return gc_R_patchwork();
    case 'parfig':    return gc_R_parfig();

    /* ────────────────────  Python  ──────────────────── */
    case 'mpl':         return gc_Python_mpl();
    case 'mpl_mosaic':  return gc_Python_mpl_mosaic();
    case 'mpl_axes':    return gc_Python_mpl_axes();
    case 'plotly':      return gc_Python_plotly();
    case 'bokeh':       return gc_Python_bokeh();

    /* ────────────────────  Julia  ───────────────────── */
    case 'makie':       return gc_Julia_makie();
    case 'plots':       return gc_Julia_plots();

    /* ────────────────────  MATLAB / Octave  ─────────── */
    case 'tiled':       return gc_MATLAB_tiled();

    /* ────────────────────  Wolfram  ─────────────────── */
    case 'mma_grid':    return gc_Wolfram_mma_grid();

    /* ────────────────────  Other formats  ───────────── */
    case 'csv_inds':    return gc_Other_csv_inds();
    case 'csv_dims':    return gc_Other_csv_dims();
    case 'csv_coords':  return gc_Other_csv_coords();
    case 'json':        return gc_Other_json();
    case 'yaml':        return gc_Other_yaml();

    /* ────────────────────  LaTeX  ───────────────────── */
    case 'textpos':     return gc_LATEX_textpos();
    case 'tikz':        return gc_LATEX_tikz();
    case 'tabularx':    return gc_LATEX_tabularx();

    default:
      return '# unknown renderer';
  }
}

function gc_R_layout() {

    /* ---- 1) matrix rows (always emitted) -------------------- */
    const rowsTxt = designMatrix().map(r => '  c(' + r.join(', ') + ')').join(',\n');

    const matDef = [
        'mat <- matrix(c(',
        rowsTxt,
        `), nrow = ${state.rows}, byrow = TRUE)`
    ].join('\n');

    const needLayout = incSetup || incExample;
    const includeLayoutShow = incSetup && !incExample;

    const parts = [];

    // ensure exactly one newline after the URL header, not two
    const hdr = urlHeader().trim();
    if (hdr) parts.push(hdr);

    parts.push(matDef);
    if (needLayout) parts.push('layout(mat)');
    if (includeLayoutShow) parts.push(`layout.show(${state.rects.length || 1})`);

    if (incExample) {
        const style = 'base_r';
        parts.push(buildExampleBlockLayoutR(style));
    }

    if (incLabels) {
      parts.push(buildRPanelLabels());
    }

    return parts.filter(Boolean).join('\n');

}

function gc_R_grid() {
    // R grid viewports; origin at top-left (grid uses bottom-left Y, so flip)
    const R = state.rows,
        C = state.cols;
    const rects = normalizedRects().map(r => ({
        id: r.id,
        alias: r.alias,
        x0: r.fx0, // left
        x1: r.fx1, // right
        y0: f(1 - r.fy1), // flip: data top -> grid bottom
        y1: f(1 - r.fy0), // flip
        w: r.fw,
        h: r.fh
    }));

    const df = [
        'mat <- data.frame(',
        '  id = c(' + rects.map(r => r.id).join(', ') + '),',
        '  x  = c(' + rects.map(r => r.x0).join(', ') + '),',
        '  y  = c(' + rects.map(r => r.y0).join(', ') + '),',
        '  w  = c(' + rects.map(r => r.w).join(', ') + '),',
        '  h  = c(' + rects.map(r => r.h).join(', ') + ')',
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

function gc_R_gridExtra() {
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


function gc_R_cowplot() {
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

function gc_R_patchwork() {
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
function gc_R_parfig() {
  const hdr = urlHeader().trim();
  const parts = [];
  if (hdr) parts.push(hdr);

  // If Example is requested, emit a self-contained par(fig) demo
  if (incExample) {
    const style = 'base_r';
    parts.push(buildExampleBlockParfigR(style));

    if (incLabels) {
      parts.push(buildRPanelLabels());
    }

    return parts.filter(Boolean).join('\n');
  }

  // --- original non-example behavior -------------------------

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
        f(r.c0 / state.cols),         // x-min
        f(r.c1 / state.cols),         // x-max
        f(1 - r.r1 / state.rows),     // y-min (flip)
        f(1 - r.r0 / state.rows)      // y-max
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

  parts.push(incSetup ? fullScript : coordsBlock);

  if (incLabels) {
    parts.push(buildRPanelLabels());
  }

  return parts.filter(Boolean).join('\n');
}


/* ────────────────────  Python  ──────────────────── */
function gc_Python_mpl() {
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

function gc_Python_mpl_mosaic() {
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

function gc_Python_mpl_axes() {
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
function gc_Python_plotly() {
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
function gc_Python_bokeh() {
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
function gc_Julia_makie() {
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

function gc_Julia_plots() {
    const ascii = asciiMosaic(); // '#' = blank
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
function gc_MATLAB_tiled() {
    const R = state.rows,
        C = state.cols;
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
function gc_Wolfram_mma_grid() {
    // ownership grid: 0=blank, else rect id (1-based)
    const G = Array.from({
        length: state.rows
    }, () => Array(state.cols).fill(0));
    state.rects.forEach((r0, i) => {
        const r = norm(r0),
            id = i + 1;
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
            const up = r > 0 ? G[r - 1][c] : -1;
            const left = c > 0 ? G[r][c - 1] : -1;
            if (id === left && id !== up) {
                cells.push('SpanFromLeft');
            } else if (id === up && id !== left) {
                cells.push('SpanFromAbove');
            } else if (id === up && id === left) {
                // interior of a merged block; prefer SpanFromLeft to continue horizontal span
                cells.push('SpanFromLeft');
            } else {
                const label = nameOf(id - 1);
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
function gc_Other_csv_inds() {
  const M = designMatrix();
  const csvBody = M.map(r => r.join(',')).join('\n');
  return urlHeader() + csvBody;
}

function gc_Other_csv_dims() {
    const rows = rectsUnitBL();
    const header = 'idx,name,x,y,w,h';
    const body = rows.map(r => `${r.idx},${r.name},${r.x},${r.y},${r.w},${r.h}`).join('\n');
    return urlHeader() + header + '\n' + body;
}

function gc_Other_csv_coords() {
    const rows = rectsUnitBL();
    const header = 'idx,name,x1,x2,x3,x4,y1,y2,y3,y4';
    const line = r => [
        r.idx, r.name, r.x1, r.x2, r.x3, r.x4, r.y1, r.y2, r.y3, r.y4
    ].join(',');
    const body = rows.map(line).join('\n');
    return urlHeader() + header + '\n' + body;
}

function gc_Other_json() {
    const payload = {
        rows: state.rows,
        cols: state.cols,
        rects: normalizedRects().map(r => ({
            id: r.id,
            name: nameOf(r.id - 1),
            r0: r.r0,
            r1: r.r1,
            c0: r.c0,
            c1: r.c1,
            fx0: r.fx0,
            fx1: r.fx1,
            fy0: r.fy0,
            fy1: r.fy1,
            fw: r.fw,
            fh: r.fh
        })),
        ascii: asciiLayout()
    };
    const s = JSON.stringify(payload, null, 2);
    return (incURL ? urlHeader() : '') + s;
}

function gc_Other_yaml() {
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


function gc_LATEX_textpos() {
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

function gc_LATEX_tikz() {
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

function gc_LATEX_tabularx() {
    const G = cellOwners();
    const R = state.rows,
        C = state.cols;

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
                const {
                    h,
                    w
                } = spanHW(G, r, c);
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