import { applyCvdHex } from "../core/cvd.js";
import { hexToRgb, rgbToXyz } from "../core/colorSpaces.js";
import { coordsFromXyzForDistanceMetric } from "../core/distance.js";
import { computeDistanceMatrix, computeNearestNeighbors, discriminabilityLabel, metricJnd } from "../core/resolvability.js";
import { contrastColor } from "../core/metrics.js";
import { clamp } from "../core/util.js";

const MODES = ["heatmap", "scatter", "voronoi", "graph"];
const SCATTER_POINT_COUNT = 500;
const SCATTER_RHO = 0.75;
const SCATTER_RADIUS = 3.2;
const SCATTER_HOVER_RADIUS = 4.6;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SCATTER_POINTS = buildScatterPoints();

function buildScatterPoints() {
  const out = new Float32Array(SCATTER_POINT_COUNT * 2);
  const sigma = Math.sqrt(1 - SCATTER_RHO * SCATTER_RHO);
  for (let i = 0; i < SCATTER_POINT_COUNT; i++) {
    const u1 = Math.max(Math.random(), 1e-9);
    const u2 = Math.max(Math.random(), 1e-9);
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    const x = r * Math.cos(theta);
    const y0 = r * Math.sin(theta);
    const y = SCATTER_RHO * x + sigma * y0;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

function buildScatterClusters(colorCount) {
  const means = new Float32Array(colorCount * 2);
  const scales = new Float32Array(colorCount);
  for (let i = 0; i < colorCount; i++) {
    const ang = hash01(i * 11 + 2) * Math.PI * 2;
    const rad = 1.0 + hash01(i * 11 + 3) * 0.8;
    means[i * 2] = Math.cos(ang) * rad;
    means[i * 2 + 1] = Math.sin(ang) * rad;
    scales[i] = 0.5 + hash01(i * 11 + 4) * 0.4;
  }
  return { means, scales };
}

function buildDeBruijnSequence(k) {
  if (k <= 1) return [0];
  const n = 2;
  const a = new Array(k * n).fill(0);
  const sequence = [];
  const db = (t, p) => {
    if (t > n) {
      if (n % p === 0) {
        for (let i = 1; i <= p; i++) sequence.push(a[i]);
      }
      return;
    }
    a[t] = a[t - p];
    db(t + 1, p);
    for (let j = a[t - p] + 1; j < k; j++) {
      a[t] = j;
      db(t + 1, t);
    }
  };
  db(1, 1);
  return sequence;
}

function colorsKey(colors, metric, type, cvdModel) {
  return `${type}|${metric}|${cvdModel}|${colors.join("|")}`;
}

function simulateColors(colors, type, cvdModel) {
  return colors.map((hex) => applyCvdHex(hex, type, 1, cvdModel));
}

function coordsForHexes(hexes, metric) {
  return hexes.map((hex) => {
    const xyz = rgbToXyz(hexToRgb(hex));
    return coordsFromXyzForDistanceMetric(xyz, metric);
  });
}

function maxDistanceForMetric(metric) {
  const jnd = metricJnd(metric);
  return Math.max(1e-6, 30 * jnd);
}

function hash01(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildVoronoiSeeds(colorCount) {
  if (!colorCount) {
    return { seeds: new Float32Array(0), colors: new Uint16Array(0), count: 0 };
  }
  const maxSeeds = 400;
  const base = Math.max(colorCount * 10, 60);
  const pairTarget = colorCount * colorCount;
  const usePairSequence = pairTarget <= maxSeeds;
  const sequence = usePairSequence ? buildDeBruijnSequence(colorCount) : [];
  let seedCount = base;
  if (usePairSequence) seedCount = Math.max(base, sequence.length);
  else seedCount = Math.max(base, Math.round(colorCount * 8));
  seedCount = Math.max(colorCount, Math.min(seedCount, maxSeeds));
  const grid = Math.ceil(Math.sqrt(seedCount));
  const jitterScale = 0.22 / grid;
  const seeds = new Float32Array(seedCount * 2);
  const colors = new Uint16Array(seedCount);
  for (let s = 0; s < seedCount; s++) {
    const gy = Math.floor(s / grid);
    const gxRaw = s % grid;
    const gx = gy % 2 === 1 ? grid - 1 - gxRaw : gxRaw;
    const baseX = (gx + 0.5) / grid;
    const baseY = (gy + 0.5) / grid;
    const jx = (hash01(s * 3 + 1) - 0.5) * jitterScale;
    const jy = (hash01(s * 3 + 2) - 0.5) * jitterScale;
    seeds[s * 2] = clamp(baseX + jx, 0.04, 0.96);
    seeds[s * 2 + 1] = clamp(baseY + jy, 0.04, 0.96);
    let colorIdx = 0;
    if (sequence.length) {
      colorIdx = sequence[s % sequence.length];
    } else if (s < colorCount) {
      colorIdx = s;
    } else {
      colorIdx = (s * 7 + gy * 3) % colorCount;
    }
    colors[s] = colorIdx;
  }
  return { seeds, colors, count: seedCount };
}

function computeMdsPositions(distances, n) {
  const coords = new Float32Array(n * 2);
  if (n <= 1) return coords;
  const d2 = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const d = distances[i];
    d2[i] = d * d;
  }
  const rowMean = new Float64Array(n);
  let totalMean = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += d2[i * n + j];
    rowMean[i] = sum / n;
    totalMean += rowMean[i];
  }
  totalMean /= n;
  const B = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = -0.5 * (d2[i * n + j] - rowMean[i] - rowMean[j] + totalMean);
      B[i * n + j] = v;
    }
  }

  const powerIter = (mat, seed) => {
    const v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.sin((i + 1) * (seed + 1));
    normalizeVec(v);
    const w = new Float64Array(n);
    for (let iter = 0; iter < 40; iter++) {
      mulMatVec(mat, v, w);
      normalizeVec(w);
      v.set(w);
    }
    const mv = new Float64Array(n);
    mulMatVec(mat, v, mv);
    const lambda = dot(v, mv);
    return { v, lambda };
  };

  const first = powerIter(B, 0);
  const B2 = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      B2[i * n + j] = B[i * n + j] - first.lambda * first.v[i] * first.v[j];
    }
  }
  const second = powerIter(B2, 1);
  const lam1 = Math.max(first.lambda, 0);
  const lam2 = Math.max(second.lambda, 0);
  const s1 = Math.sqrt(lam1);
  const s2 = Math.sqrt(lam2);
  for (let i = 0; i < n; i++) {
    coords[i * 2] = first.v[i] * s1;
    coords[i * 2 + 1] = second.v[i] * s2;
  }
  return coords;
}

function normalizeVec(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 1;
  for (let i = 0; i < v.length; i++) v[i] *= inv;
}

function mulMatVec(mat, vec, out) {
  const n = vec.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const row = i * n;
    for (let j = 0; j < n; j++) sum += mat[row + j] * vec[j];
    out[i] = sum;
  }
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function formatValue(v) {
  if (!Number.isFinite(v)) return "";
  if (v === 0) return "0";
  return Number(v).toPrecision(3).replace(/^\+/, "");
}

export function createResolvabilityPanel(type, { onModeChange, onSyncChange, onThresholdChange } = {}) {
  const root = document.createElement("div");
  root.className = "resolvability-panel";

  const header = document.createElement("div");
  header.className = "resolvability-header";
  const title = document.createElement("div");
  title.className = "resolvability-title";
  title.textContent = "Resolvability";
  header.appendChild(title);

  const controls = document.createElement("div");
  controls.className = "resolvability-controls";

  const thresholdWrap = document.createElement("div");
  thresholdWrap.className = "resolvability-threshold";
  const thresholdLabel = document.createElement("span");
  thresholdLabel.textContent = "threshold";
  const thresholdInput = document.createElement("input");
  thresholdInput.type = "range";
  thresholdInput.min = "0";
  thresholdInput.max = "10";
  thresholdInput.step = "0.1";
  thresholdInput.value = "2";
  const thresholdVal = document.createElement("span");
  thresholdVal.className = "resolvability-threshold-val";
  thresholdWrap.appendChild(thresholdLabel);
  thresholdWrap.appendChild(thresholdInput);
  thresholdWrap.appendChild(thresholdVal);

  const syncWrap = document.createElement("label");
  syncWrap.className = "resolvability-sync";
  const syncToggle = document.createElement("input");
  syncToggle.type = "checkbox";
  syncToggle.checked = true;
  const syncText = document.createElement("span");
  syncText.textContent = "sync view";
  syncWrap.appendChild(syncToggle);
  syncWrap.appendChild(syncText);
  controls.appendChild(syncWrap);

  const modeWrap = document.createElement("div");
  modeWrap.className = "resolvability-modes";
  const modeButtons = new Map();
  [
    { key: "heatmap", label: "Heat map" },
    { key: "scatter", label: "Scatter" },
    { key: "voronoi", label: "Voronoi" },
    { key: "graph", label: "Collisions" },
  ].forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mode = key;
    btn.textContent = label;
    modeWrap.appendChild(btn);
    modeButtons.set(key, btn);
  });
  controls.appendChild(modeWrap);

  header.appendChild(controls);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "resolvability-body";
  body.dataset.mode = "heatmap";

  const heatmapWrap = document.createElement("div");
  heatmapWrap.className = "resolvability-heatmap";
  const topLabels = document.createElement("div");
  topLabels.className = "resolvability-heatmap-top";
  const leftLabels = document.createElement("div");
  leftLabels.className = "resolvability-heatmap-left";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "resolvability-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "resolvability-canvas";
  const tooltip = document.createElement("div");
  tooltip.className = "resolvability-tooltip";
  const legend = document.createElement("div");
  legend.className = "resolvability-heatmap-legend";
  legend.innerHTML = `
    <span class="resolvability-legend-chip"></span>
    <span class="resolvability-legend-text">darker = less discriminable</span>
  `;
  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(tooltip);
  heatmapWrap.appendChild(topLabels);
  heatmapWrap.appendChild(leftLabels);
  heatmapWrap.appendChild(canvasWrap);
  body.appendChild(heatmapWrap);
  body.appendChild(legend);
  root.appendChild(body);

  const thresholdRow = document.createElement("div");
  thresholdRow.className = "resolvability-threshold-row";
  thresholdRow.style.display = "none";
  thresholdRow.appendChild(thresholdWrap);
  root.appendChild(thresholdRow);

  const state = {
    key: "",
    colors: [],
    simColors: [],
    coords: [],
    distances: null,
    minDist: null,
    nearest: null,
    mds: null,
    seeds: null,
    scatterAssign: null,
    scatterPoints: null,
    scatterMeans: null,
    scatterScales: null,
    voronoiSeeds: null,
    voronoiSeedColors: null,
    voronoiSeedCount: 0,
    voronoiCanvas: null,
    voronoiSize: 0,
    voronoiDirty: false,
    voronoiAssignments: null,
    voronoiGridW: 0,
    voronoiGridH: 0,
    metric: "de2000",
    threshold: 2,
    mode: "heatmap",
    cvdModel: "legacy",
    background: "#ffffff",
    onHighlightPair: null,
    onHighlightColor: null,
    hover: null,
    locked: null,
    cellSize: 10,
    labelTopEls: [],
    labelLeftEls: [],
    showHexLabels: false,
    graphNodes: null,
    graphSize: 0,
  };

  const ctx = canvas.getContext("2d");

  const getCanvasSize = () => {
    const fallback = 220;
    const width = canvasWrap.clientWidth || fallback;
    const height = canvasWrap.clientHeight || width || fallback;
    return Math.max(1, Math.floor(Math.min(width, height)));
  };

  const getHeatmapSize = () => {
    const fallback = 220;
    const width = heatmapWrap.clientWidth || fallback;
    const height = heatmapWrap.clientHeight || width || fallback;
    return Math.max(1, Math.floor(Math.min(width, height)));
  };

  const setupCanvasSquare = (size) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.width = Math.max(1, Math.floor(size * dpr));
    canvas.height = Math.max(1, Math.floor(size * dpr));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  };

  const setMode = (mode) => {
    state.mode = MODES.includes(mode) ? mode : "heatmap";
    body.dataset.mode = state.mode;
    const usesThreshold = state.mode === "voronoi" || state.mode === "graph";
    thresholdRow.style.display = usesThreshold ? "flex" : "none";
    modeButtons.forEach((btn, key) => {
      btn.classList.toggle("active", key === state.mode);
    });
  };

  const setSync = (sync) => {
    syncToggle.checked = Boolean(sync);
  };

  const setThreshold = (threshold, metric) => {
    state.threshold = threshold;
    state.voronoiDirty = true;
    const jnd = metricJnd(metric);
    const max = Math.max(jnd * 10, jnd);
    thresholdInput.min = "0";
    thresholdInput.max = max.toFixed(3);
    thresholdInput.step = Math.max(jnd / 10, 0.001).toFixed(3);
    thresholdInput.value = String(clamp(threshold, 0, max));
    thresholdVal.textContent = formatValue(threshold);
  };

  const rebuildLabels = () => {
    topLabels.innerHTML = "";
    leftLabels.innerHTML = "";
    state.labelTopEls = [];
    state.labelLeftEls = [];
    state.showHexLabels = state.simColors.length <= 10;
    state.simColors.forEach((hex, idx) => {
      const top = document.createElement("span");
      top.className = "resolvability-label resolvability-label-top";
      top.style.background = hex;
      top.style.color = contrastColor(hex);
      top.title = hex;
      top.dataset.index = String(idx);
      if (state.showHexLabels) {
        const text = document.createElement("span");
        text.className = "resolvability-label-text";
        text.textContent = hex;
        top.appendChild(text);
      }
      topLabels.appendChild(top);
      state.labelTopEls.push(top);

      const left = document.createElement("span");
      left.className = "resolvability-label resolvability-label-left";
      left.style.background = hex;
      left.style.color = contrastColor(hex);
      left.title = hex;
      left.dataset.index = String(idx);
      if (state.showHexLabels) {
        const text = document.createElement("span");
        text.className = "resolvability-label-text";
        text.textContent = hex;
        left.appendChild(text);
      }
      leftLabels.appendChild(left);
      state.labelLeftEls.push(left);
    });
  };

  const setLabelHighlight = (indices) => {
    const idxSet = new Set(indices || []);
    state.labelTopEls.forEach((el, idx) => {
      el.classList.toggle("active", idxSet.has(idx));
    });
    state.labelLeftEls.forEach((el, idx) => {
      el.classList.toggle("active", idxSet.has(idx));
    });
  };

  const renderHeatmap = () => {
    const n = state.simColors.length;
    if (n === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const heatmapSize = Math.max(160, getHeatmapSize());
    let labelSize = Math.max(8, Math.floor(heatmapSize / (n + 1)));
    let matrixSize = Math.max(1, heatmapSize - labelSize);
    let cellSize = matrixSize / n;
    const maxLabel = Math.max(8, Math.floor(cellSize * 0.7));
    if (labelSize > maxLabel) {
      labelSize = maxLabel;
      matrixSize = Math.max(1, heatmapSize - labelSize);
      cellSize = matrixSize / n;
    }
    const labelFontSize = Math.max(7, Math.min(11, Math.floor(labelSize * 0.55)));
    state.cellSize = cellSize;
    heatmapWrap.style.setProperty("--label-size", `${labelSize}px`);
    setupCanvasSquare(matrixSize);
    ctx.clearRect(0, 0, matrixSize, matrixSize);
    topLabels.style.width = `${matrixSize}px`;
    topLabels.style.height = `${labelSize}px`;
    leftLabels.style.width = `${labelSize}px`;
    leftLabels.style.height = `${matrixSize}px`;
    topLabels.style.gridTemplateColumns = `repeat(${n}, ${cellSize}px)`;
    leftLabels.style.gridTemplateRows = `repeat(${n}, ${cellSize}px)`;
    state.labelTopEls.forEach((el) => {
      el.style.width = `${cellSize}px`;
      el.style.height = `${labelSize}px`;
      const textEl = el.querySelector(".resolvability-label-text");
      if (textEl) {
        textEl.style.fontSize = `${labelFontSize}px`;
        const maxWidth = Math.max(6, cellSize - 6);
        const maxHeight = Math.max(6, labelSize - 4);
        const approxWidth = textEl.textContent.length * labelFontSize * 0.56;
        const widthScale = approxWidth > 0 ? Math.min(1, maxWidth / approxWidth) : 1;
        const heightScale = labelFontSize > 0 ? Math.min(1, maxHeight / labelFontSize) : 1;
        const scale = Math.max(0.4, Math.min(widthScale, heightScale));
        textEl.style.transform = `scale(${scale.toFixed(3)})`;
      }
    });
    state.labelLeftEls.forEach((el) => {
      el.style.width = `${labelSize}px`;
      el.style.height = `${cellSize}px`;
      const textEl = el.querySelector(".resolvability-label-text");
      if (textEl) {
        textEl.style.fontSize = `${labelFontSize}px`;
        const maxWidth = Math.max(6, cellSize - 6);
        const maxHeight = Math.max(6, labelSize - 4);
        const approxWidth = textEl.textContent.length * labelFontSize * 0.56;
        const widthScale = approxWidth > 0 ? Math.min(1, maxWidth / approxWidth) : 1;
        const heightScale = labelFontSize > 0 ? Math.min(1, maxHeight / labelFontSize) : 1;
        const scale = Math.max(0.4, Math.min(widthScale, heightScale));
        textEl.style.transform = `rotate(-90deg) scale(${scale.toFixed(3)})`;
      }
    });

    const maxDist = maxDistanceForMetric(state.metric);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const d = state.distances[i * n + j];
        const t = clamp(d / maxDist, 0, 1);
        const v = Math.round(t * 255);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
      }
    }
    if (cellSize >= 22) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let cellFontSize = Math.max(8, Math.floor(cellSize * 0.32));
      ctx.font = `${cellFontSize}px "Space Grotesk", sans-serif`;
      const maxLabelWidth = cellSize * 0.75;
      const longest = ctx.measureText("great").width || 1;
      if (longest > maxLabelWidth) {
        cellFontSize = Math.floor(cellFontSize * (maxLabelWidth / longest));
        ctx.font = `${cellFontSize}px "Space Grotesk", sans-serif`;
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const d = state.distances[i * n + j];
          const label = discriminabilityLabel(d, state.metric);
          if (!label) continue;
          const t = clamp(d / maxDist, 0, 1);
          const v = Math.round(t * 255);
          ctx.fillStyle = v < 128 ? "#f8fafc" : "#0f172a";
          ctx.fillText(label, j * cellSize + cellSize / 2, i * cellSize + cellSize / 2);
        }
      }
    }
    drawHeatmapOverlay();
  };

  const drawHeatmapOverlay = () => {
    const n = state.simColors.length;
    const cellSize = state.cellSize;
    if (!state.hover && !state.locked) return;
    const target = state.locked || state.hover;
    if (!target || target.kind !== "pair") return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(target.j * cellSize + 0.5, target.i * cellSize + 0.5, cellSize - 1, cellSize - 1);
  };

  const renderScatter = () => {
    const size = getCanvasSize();
    const width = size;
    const height = size;
    setupCanvasSquare(size);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = state.background || "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.1)";
    ctx.beginPath();
    ctx.moveTo(width / 2, 10);
    ctx.lineTo(width / 2, height - 10);
    ctx.moveTo(10, height / 2);
    ctx.lineTo(width - 10, height / 2);
    ctx.stroke();

    const n = state.simColors.length;
    if (!n) return;
    const pad = 12;
    const xScale = (width - pad * 2) / 6;
    const yScale = (height - pad * 2) / 6;
    for (let i = 0; i < SCATTER_POINT_COUNT; i++) {
      const idx = state.scatterAssign ? state.scatterAssign[i] : (i % n);
      const hex = state.simColors[idx];
      const px = state.scatterPoints ? state.scatterPoints[i * 2] : SCATTER_POINTS[i * 2];
      const py = state.scatterPoints ? state.scatterPoints[i * 2 + 1] : SCATTER_POINTS[i * 2 + 1];
      const x = (px + 3) * xScale + pad;
      const y = (py + 3) * yScale + pad;
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(x, y, SCATTER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    drawScatterOverlay(width, height);
  };

  const drawScatterOverlay = (width, height) => {
    const target = state.locked || state.hover;
    if (!target || target.kind !== "single") return;
    const pad = 12;
    const xScale = (width - pad * 2) / 6;
    const yScale = (height - pad * 2) / 6;
    const idx = target.i;
    const hex = state.simColors[idx];
    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 2;
    for (let i = 0; i < SCATTER_POINT_COUNT; i++) {
      if (state.scatterAssign[i] !== idx) continue;
      const px = state.scatterPoints ? state.scatterPoints[i * 2] : SCATTER_POINTS[i * 2];
      const py = state.scatterPoints ? state.scatterPoints[i * 2 + 1] : SCATTER_POINTS[i * 2 + 1];
      const x = (px + 3) * xScale + pad;
      const y = (py + 3) * yScale + pad;
      ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
      ctx.beginPath();
      ctx.arc(x, y, SCATTER_HOVER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hex;
  };

  const buildVoronoiCanvas = (size) => {
    const n = state.simColors.length;
    if (!n) return;
    const gridSize = Math.max(160, Math.min(420, Math.floor(size * 1.9)));
    const gridW = gridSize;
    const gridH = gridSize;
    const assignments = new Uint16Array(gridW * gridH);
    const seeds = state.voronoiSeeds?.length ? state.voronoiSeeds : state.seeds;
    const seedColors = state.voronoiSeedColors?.length ? state.voronoiSeedColors : null;
    const seedCount = seedColors ? state.voronoiSeedCount : n;

    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const px = (x + 0.5) / gridW;
        const py = (y + 0.5) / gridH;
        let best = Infinity;
        let bestIdx = 0;
        for (let i = 0; i < seedCount; i++) {
          const sx = seeds[i * 2];
          const sy = seeds[i * 2 + 1];
          const dx = px - sx;
          const dy = py - sy;
          const d = dx * dx + dy * dy;
          if (d < best) {
            best = d;
            bestIdx = i;
          }
        }
        const colorIdx = seedColors ? seedColors[bestIdx] : bestIdx;
        assignments[y * gridW + x] = colorIdx;
      }
    }
    state.voronoiAssignments = assignments;
    state.voronoiGridW = gridW;
    state.voronoiGridH = gridH;

    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = gridW;
    colorCanvas.height = gridH;
    const colorCtx = colorCanvas.getContext("2d");
    const img = colorCtx.createImageData(gridW, gridH);
    for (let i = 0; i < gridW * gridH; i++) {
      const idx = assignments[i];
      const hex = state.simColors[idx];
      const rgb = hexToRgb(hex);
      img.data[i * 4] = Math.round(rgb.r * 255);
      img.data[i * 4 + 1] = Math.round(rgb.g * 255);
      img.data[i * 4 + 2] = Math.round(rgb.b * 255);
      img.data[i * 4 + 3] = 255;
    }
    colorCtx.putImageData(img, 0, 0);

    const borderCanvas = document.createElement("canvas");
    borderCanvas.width = gridW;
    borderCanvas.height = gridH;
    const borderCtx = borderCanvas.getContext("2d");
    const border = borderCtx.createImageData(gridW, gridH);
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = assignments[y * gridW + x];
        const risk = clamp(1 - (state.minDist[idx] || 0) / Math.max(state.threshold, 1e-6), 0, 1);
        let edge = false;
        if (x < gridW - 1 && assignments[y * gridW + x + 1] !== idx) edge = true;
        if (y < gridH - 1 && assignments[(y + 1) * gridW + x] !== idx) edge = true;
        if (!edge) continue;
        const offIdx = (y * gridW + x) * 4;
        border.data[offIdx] = 10;
        border.data[offIdx + 1] = 10;
        border.data[offIdx + 2] = 10;
        border.data[offIdx + 3] = Math.round(40 + 200 * risk);
      }
    }
    borderCtx.putImageData(border, 0, 0);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = size;
    finalCanvas.height = size;
    const finalCtx = finalCanvas.getContext("2d");
    finalCtx.clearRect(0, 0, size, size);
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.drawImage(colorCanvas, 0, 0, size, size);
    finalCtx.imageSmoothingEnabled = false;
    finalCtx.drawImage(borderCanvas, 0, 0, size, size);
    state.voronoiCanvas = finalCanvas;
    state.voronoiSize = size;
    state.voronoiDirty = false;
  };

  const renderVoronoi = () => {
    const size = getCanvasSize();
    const width = size;
    const height = size;
    setupCanvasSquare(size);
    ctx.clearRect(0, 0, width, height);

    const n = state.simColors.length;
    if (!n) return;
    if (!state.voronoiCanvas || state.voronoiDirty || state.voronoiSize !== size) {
      buildVoronoiCanvas(size);
    }
    if (state.voronoiCanvas) {
      ctx.drawImage(state.voronoiCanvas, 0, 0, width, height);
    }
    drawVoronoiOverlay(width, height);
  };

  const drawVoronoiOverlay = (width, height) => {
    const target = state.locked || state.hover;
    if (!target || target.kind !== "single") return;
    const idx = target.i;
    const assignments = state.voronoiAssignments;
    const gridW = state.voronoiGridW;
    const gridH = state.voronoiGridH;
    if (!assignments || !gridW || !gridH) return;
    const cellW = width / gridW;
    const cellH = height / gridH;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const cur = assignments[y * gridW + x];
        if (x < gridW - 1 && assignments[y * gridW + x + 1] !== cur) {
          const px = (x + 1) * cellW;
          const py = y * cellH;
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cellH);
        }
        if (y < gridH - 1 && assignments[(y + 1) * gridW + x] !== cur) {
          const px = x * cellW;
          const py = (y + 1) * cellH;
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellW, py);
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(15, 23, 42, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const cur = assignments[y * gridW + x];
        if (cur !== idx) continue;
        if (x < gridW - 1 && assignments[y * gridW + x + 1] !== cur) {
          const px = (x + 1) * cellW;
          const py = y * cellH;
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + cellH);
        }
        if (y < gridH - 1 && assignments[(y + 1) * gridW + x] !== cur) {
          const px = x * cellW;
          const py = (y + 1) * cellH;
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellW, py);
        }
      }
    }
    ctx.stroke();
  };

  const renderGraph = () => {
    const size = getCanvasSize();
    const width = size;
    const height = size;
    setupCanvasSquare(size);
    ctx.clearRect(0, 0, width, height);

    const n = state.simColors.length;
    if (!n) return;
    const pts = state.mds || new Float32Array(n * 2);
    let maxAbs = 1e-6;
    for (let i = 0; i < n * 2; i++) maxAbs = Math.max(maxAbs, Math.abs(pts[i]));
    const pad = 16;
    const scaleX = (width - pad * 2) / (2 * maxAbs);
    const scaleY = (height - pad * 2) / (2 * maxAbs);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2] * scaleX + width / 2;
      const y = pts[i * 2 + 1] * scaleY + height / 2;
      nodes.push({ x, y });
    }
    state.graphNodes = nodes;
    state.graphSize = size;

    ctx.strokeStyle = "rgba(15, 23, 42, 0.3)";
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = state.distances[i * n + j];
        if (d >= state.threshold) continue;
        const weight = clamp(1 - d / Math.max(state.threshold, 1e-6), 0, 1);
        ctx.globalAlpha = 0.25 + 0.65 * weight;
        ctx.lineWidth = 1.5 + weight * 2.5;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < n; i++) {
      const risk = clamp(1 - (state.minDist[i] || 0) / Math.max(state.threshold, 1e-6), 0, 1);
      ctx.fillStyle = state.simColors[i];
      ctx.strokeStyle = `rgba(15, 23, 42, ${0.25 + 0.6 * risk})`;
      ctx.lineWidth = 1.2 + risk * 2.2;
      ctx.beginPath();
      ctx.arc(nodes[i].x, nodes[i].y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    drawGraphOverlay(nodes);
  };

  const drawGraphOverlay = (nodes) => {
    const target = state.locked || state.hover;
    if (!target || target.kind !== "single") return;
    const idx = target.i;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(nodes[idx].x, nodes[idx].y, 9, 0, Math.PI * 2);
    ctx.stroke();

    const n = state.simColors.length;
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      const d = state.distances[idx * n + j];
      if (d >= state.threshold) continue;
      const weight = clamp(1 - d / Math.max(state.threshold, 1e-6), 0, 1);
      ctx.strokeStyle = `rgba(15, 23, 42, ${0.4 + 0.5 * weight})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(nodes[idx].x, nodes[idx].y);
      ctx.lineTo(nodes[j].x, nodes[j].y);
      ctx.stroke();
    }
  };

  const render = () => {
    if (!state.simColors.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (state.mode === "heatmap") renderHeatmap();
    else if (state.mode === "scatter") renderScatter();
    else if (state.mode === "voronoi") renderVoronoi();
    else renderGraph();
  };

  const updateTooltip = (html, x, y) => {
    if (!html) {
      tooltip.classList.remove("show");
      tooltip.innerHTML = "";
      return;
    }
    tooltip.innerHTML = html;
    tooltip.style.left = `${x + 12}px`;
    tooltip.style.top = `${y + 12}px`;
    tooltip.classList.add("show");
  };

  const highlightExternal = (target) => {
    if (!target) {
      setLabelHighlight([]);
      state.onHighlightPair?.(null);
      state.onHighlightColor?.(null);
      return;
    }
    if (target.kind === "pair") {
      setLabelHighlight([target.i, target.j]);
      state.onHighlightPair?.(target.i, target.j);
    } else {
      setLabelHighlight([target.i]);
      state.onHighlightColor?.(target.i);
    }
  };

  const nearestNeighbors = (idx, k = 3) => {
    const n = state.simColors.length;
    const list = [];
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      list.push({ j, d: state.distances[idx * n + j] });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, k).map((entry) => entry.j);
  };

  const handleHeatmapHover = (evt) => {
    const n = state.simColors.length;
    if (!n) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const cell = state.cellSize;
    const i = Math.floor(y / cell);
    const j = Math.floor(x / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) {
      state.hover = null;
      render();
      updateTooltip("", 0, 0);
      highlightExternal(state.locked);
      return;
    }
    if (state.locked) return;
    state.hover = { kind: "pair", i, j };
    render();
    const dist = state.distances[i * n + j];
    const label = discriminabilityLabel(dist, state.metric);
    updateTooltip(
      `<div class="resolvability-tip-row">
        <span class="resolvability-tip-swatch" style="background:${state.simColors[i]}"></span>
        <span>${state.simColors[i]}</span>
      </div>
      <div class="resolvability-tip-row">
        <span class="resolvability-tip-swatch" style="background:${state.simColors[j]}"></span>
        <span>${state.simColors[j]}</span>
      </div>
      <div class="resolvability-tip-meta">${formatValue(dist)} · ${label}</div>`,
      x,
      y
    );
    highlightExternal(state.hover);
  };

  const handleSingleHover = (evt, coordsProvider, tooltipProvider) => {
    if (state.locked) return;
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const target = coordsProvider(x, y);
    state.hover = target;
    render();
    if (target) {
      updateTooltip(tooltipProvider(target), x, y);
    } else {
      updateTooltip("", 0, 0);
    }
    highlightExternal(state.hover);
  };

  const coordsFromScatter = (x, y) => {
    if (!state.simColors.length || !state.scatterAssign) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pad = 12;
    const xScale = (width - pad * 2) / 6;
    const yScale = (height - pad * 2) / 6;
    let best = Infinity;
    let bestIdx = null;
    for (let i = 0; i < SCATTER_POINT_COUNT; i++) {
      const sx = state.scatterPoints ? state.scatterPoints[i * 2] : SCATTER_POINTS[i * 2];
      const sy = state.scatterPoints ? state.scatterPoints[i * 2 + 1] : SCATTER_POINTS[i * 2 + 1];
      const px = (sx + 3) * xScale + pad;
      const py = (sy + 3) * yScale + pad;
      const dx = px - x;
      const dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        bestIdx = state.scatterAssign[i];
      }
    }
    if (best > 36) return null;
    return { kind: "single", i: bestIdx };
  };

  const coordsFromVoronoi = (x, y) => {
    if (!state.simColors.length || !state.seeds) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const seeds = state.voronoiSeeds?.length ? state.voronoiSeeds : state.seeds;
    const seedColors = state.voronoiSeedColors;
    const seedCount = state.voronoiSeedCount || state.simColors.length;
    let best = Infinity;
    let bestIdx = null;
    for (let i = 0; i < seedCount; i++) {
      const sx = seeds[i * 2] * width;
      const sy = seeds[i * 2 + 1] * height;
      const dx = sx - x;
      const dy = sy - y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
    if (!Number.isFinite(bestIdx)) return null;
    const colorIdx = seedColors ? seedColors[bestIdx] : bestIdx;
    return { kind: "single", i: colorIdx, seedIndex: bestIdx };
  };

  const coordsFromGraph = (x, y) => {
    if (!state.graphNodes?.length || !state.simColors.length) return null;
    let best = Infinity;
    let bestIdx = null;
    const n = state.graphNodes.length;
    for (let i = 0; i < n; i++) {
      const node = state.graphNodes[i];
      const dx = node.x - x;
      const dy = node.y - y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }
    if (best > 196) return null;
    return { kind: "single", i: bestIdx };
  };

  const tooltipForSingle = (target) => {
    const idx = target.i;
    const dist = state.minDist[idx];
    const label = discriminabilityLabel(dist, state.metric);
    return `<div class="resolvability-tip-row">
      <span class="resolvability-tip-swatch" style="background:${state.simColors[idx]}"></span>
      <span>${state.simColors[idx]}</span>
    </div>
    <div class="resolvability-tip-meta">${formatValue(dist)} · ${label}</div>`;
  };

  const clearHover = () => {
    state.hover = null;
    if (!state.locked) {
      highlightExternal(null);
    }
    updateTooltip("", 0, 0);
    render();
  };

  const toggleLock = () => {
    if (!state.hover && state.locked) {
      state.locked = null;
      highlightExternal(null);
      render();
      return;
    }
    if (state.hover) {
      const same =
        state.locked &&
        state.locked.kind === state.hover.kind &&
        state.locked.i === state.hover.i &&
        state.locked.j === state.hover.j;
      state.locked = same ? null : { ...state.hover };
      highlightExternal(state.locked || state.hover);
      render();
    }
  };

  canvas.addEventListener("mousemove", (evt) => {
    if (state.mode === "heatmap") handleHeatmapHover(evt);
    else if (state.mode === "scatter") handleSingleHover(evt, coordsFromScatter, tooltipForSingle);
    else if (state.mode === "voronoi") handleSingleHover(evt, coordsFromVoronoi, tooltipForSingle);
    else handleSingleHover(evt, coordsFromGraph, tooltipForSingle);
  });
  canvas.addEventListener("mouseleave", () => clearHover());
  canvas.addEventListener("click", () => toggleLock());

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextMode = btn.dataset.mode || "heatmap";
      onModeChange?.(nextMode, type);
    });
  });

  syncToggle.addEventListener("change", () => {
    onSyncChange?.(syncToggle.checked, type);
  });

  thresholdInput.addEventListener("input", () => {
    const val = parseFloat(thresholdInput.value);
    if (!Number.isFinite(val)) return;
    onThresholdChange?.(val, type);
  });

  const update = ({
    colors = [],
    metric = "de2000",
    threshold = 2,
    mode = "heatmap",
    sync = true,
    cvdModel = "legacy",
    background = "#ffffff",
    onHighlightPair,
    onHighlightColor,
  } = {}) => {
    state.metric = metric;
    state.cvdModel = cvdModel;
    state.background = background;
    state.onHighlightPair = onHighlightPair || null;
    state.onHighlightColor = onHighlightColor || null;
    setMode(mode);
    setSync(sync);
    setThreshold(threshold, metric);
    const key = colorsKey(colors, metric, type, cvdModel);
    if (key !== state.key) {
      state.key = key;
      state.colors = colors.slice();
      state.simColors = simulateColors(colors, type, cvdModel);
      state.coords = coordsForHexes(state.simColors, metric);
      state.distances = computeDistanceMatrix(state.coords, metric);
      const nn = computeNearestNeighbors(state.distances, state.simColors.length);
      state.minDist = nn.minDist;
      state.nearest = nn.nearest;
      state.mds = computeMdsPositions(state.distances, state.simColors.length);
      state.seeds = new Float32Array(state.simColors.length * 2);
      for (let i = 0; i < state.simColors.length; i++) {
        const r = Math.sqrt((i + 0.5) / Math.max(state.simColors.length, 1)) * 0.45;
        const ang = i * GOLDEN_ANGLE;
        state.seeds[i * 2] = 0.5 + r * Math.cos(ang);
        state.seeds[i * 2 + 1] = 0.5 + r * Math.sin(ang);
      }
      const vorSeeds = buildVoronoiSeeds(state.simColors.length);
      state.voronoiSeeds = vorSeeds.seeds;
      state.voronoiSeedColors = vorSeeds.colors;
      state.voronoiSeedCount = vorSeeds.count;
      state.voronoiDirty = true;
      state.voronoiCanvas = null;
      state.scatterAssign = new Uint16Array(SCATTER_POINT_COUNT);
      state.scatterPoints = new Float32Array(SCATTER_POINT_COUNT * 2);
      if (state.simColors.length) {
        const clusters = buildScatterClusters(state.simColors.length);
        state.scatterMeans = clusters.means;
        state.scatterScales = clusters.scales;
      } else {
        state.scatterMeans = null;
        state.scatterScales = null;
      }
      for (let i = 0; i < SCATTER_POINT_COUNT; i++) {
        const idx = state.simColors.length ? i % state.simColors.length : 0;
        state.scatterAssign[i] = idx;
        if (state.scatterMeans && state.scatterScales) {
          const meanX = state.scatterMeans[idx * 2];
          const meanY = state.scatterMeans[idx * 2 + 1];
          const scale = state.scatterScales[idx];
          const baseX = SCATTER_POINTS[i * 2];
          const baseY = SCATTER_POINTS[i * 2 + 1];
          state.scatterPoints[i * 2] = clamp(meanX + baseX * scale, -3, 3);
          state.scatterPoints[i * 2 + 1] = clamp(meanY + baseY * scale, -3, 3);
        } else {
          state.scatterPoints[i * 2] = SCATTER_POINTS[i * 2];
          state.scatterPoints[i * 2 + 1] = SCATTER_POINTS[i * 2 + 1];
        }
      }
      rebuildLabels();
    }
    render();
  };

  return { root, update, setMode, setSync, setThreshold };
}
