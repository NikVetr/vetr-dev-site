const defaultPalette = "#4477AA #6D4B08 #228833 #F3A02B #882255 #D687B5";

const channelOrder = {
  hsl: ["h", "s", "l"],
  lab: ["l", "a", "b"],
  lch: ["l", "c", "h"],
  oklab: ["l", "a", "b"],
  oklch: ["l", "c", "h"],
};

const csRanges = {
  hsl: { min: { h: 0, s: 0, l: 0 }, max: { h: 360, s: 100, l: 100 } },
  lab: { min: { l: 0, a: -128, b: -128 }, max: { l: 100, a: 127, b: 127 } },
  lch: { min: { l: 0, c: 0, h: 0 }, max: { l: 100, c: 140, h: 360 } },
  oklab: { min: { l: 0, a: -0.5, b: -0.5 }, max: { l: 1, a: 0.5, b: 0.5 } },
  oklch: { min: { l: 0, c: 0, h: 0 }, max: { l: 1, c: 0.4, h: 360 } },
};

const plotOrder = ["none", "deutan", "protan", "tritan"];

const cvdMatrices = {
  deutan: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  protan: [
    [0.56667, 0.43333, 0],
    [0.55833, 0.44167, 0],
    [0, 0.24167, 0.75833],
  ],
  tritan: [
    [0.95, 0.05, 0],
    [0, 0.43333, 0.56667],
    [0, 0.475, 0.525],
  ],
};

const state = {
  currentColors: [],
  newColors: [],
  running: false,
  bestScores: [],
  copyTimeout: null,
  lastRuns: 0,
  bounds: null,
  mutedInput: false,
};

const ui = {};

document.addEventListener("DOMContentLoaded", () => {
  bindInputs();
  createPanels();
  setDefaultValues();
  refreshSwatches();
});

window.addEventListener("resize", () => {
  refreshSwatches();
});

window.addEventListener("error", (e) => {
  if (ui && ui.errorText) {
    ui.errorText.textContent = e.message || "Unexpected error";
  }
});

function bindInputs() {
  ui.paletteInput = document.getElementById("palette-input");
  ui.colorSpace = document.getElementById("color-space");
  ui.colorsToAdd = document.getElementById("colors-to-add");
  ui.optimRuns = document.getElementById("optim-runs");
  ui.nmIters = document.getElementById("nm-iters");
  ui.constrainToggle = document.getElementById("constrain-toggle"); // optional (removed from UI)
  ui.colorwheelSpace = document.getElementById("colorwheel-space");
  ui.wNone = document.getElementById("w-none");
  ui.wDeutan = document.getElementById("w-deutan");
  ui.wProtan = document.getElementById("w-protan");
  ui.wTritan = document.getElementById("w-tritan");
  ui.runBtn = document.getElementById("run-btn");
  ui.resetBtn = document.getElementById("reset-btn");
  ui.progressBar = document.getElementById("progress-bar");
  ui.statusText = document.getElementById("status-text");
  ui.errorText = document.getElementById("error-text");
  ui.panels = document.getElementById("panels");
  ui.resultsBox = document.getElementById("results-box");
  ui.copyBtn = document.getElementById("copy-btn");
  ui.statusGraph = document.getElementById("status-graph");
  ui.formatQuotes = document.getElementById("format-quotes");
  ui.formatCommas = document.getElementById("format-commas");
  ui.formatLines = document.getElementById("format-lines");
  ui.wH = document.getElementById("w-h");
  ui.wSC = document.getElementById("w-sc");
  ui.wL = document.getElementById("w-l");
  ui.wHLabel = document.getElementById("w-h-label");
  ui.wSCLabel = document.getElementById("w-sc-label");
  ui.wLLabel = document.getElementById("w-l-label");
  ui.wHVal = document.getElementById("w-h-val");
  ui.wSCVal = document.getElementById("w-sc-val");
  ui.wLVal = document.getElementById("w-l-val");

  ui.paletteInput.addEventListener("input", refreshSwatches);
  ui.paletteInput.addEventListener("input", () => {
    refreshSwatches();
  });
  if (ui.constrainToggle) {
    ui.constrainToggle.addEventListener("change", updateBoundsAndRefresh);
  }
  ui.colorSpace.addEventListener("change", () => {
    updateWidthLabels();
    updateBoundsAndRefresh();
  });
  ui.colorwheelSpace.addEventListener("change", () => {
    updateChannelHeadings();
    refreshSwatches();
  });
  ui.runBtn.addEventListener("click", () => runOptimization());
  ui.resetBtn.addEventListener("click", () => {
    setDefaultValues();
    refreshSwatches();
  });
  ui.copyBtn.addEventListener("click", () => copyResults());
  ui.formatQuotes.addEventListener("change", () => setResults(state.newColors));
  ui.formatCommas.addEventListener("change", () => setResults(state.newColors));
  ui.formatLines.addEventListener("change", () => setResults(state.newColors));
  [ui.wH, ui.wSC, ui.wL].forEach((el) => {
    el.addEventListener("input", () => {
      updateWidthChips();
      updateBoundsAndRefresh();
    });
  });
  updateWidthLabels();
  updateWidthChips();
}

function setDefaultValues() {
  ui.paletteInput.value = defaultPalette;
  ui.paletteInput.classList.remove("muted-input");
  state.mutedInput = false;
  ui.colorSpace.value = "oklab";
  ui.colorwheelSpace.value = "hsl";
  updateWidthChips();
  updateWidthLabels();
  updateChannelHeadings();
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  state.newColors = [];
  setResults([]);
  state.bestScores = [];
  drawStatusGraph();
}

function createPanels() {
  ui.panelMap = {};
  ui.panels.innerHTML = "";
  plotOrder.forEach((type) => {
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.dataset.cb = type;

    const title = document.createElement("h4");
    title.textContent = type === "none" ? "trichromacy" : `${type}-type simulation`;
    panel.appendChild(title);

    const labelRow = document.createElement("div");
    labelRow.className = "labels";

    const currentCol = document.createElement("div");
    currentCol.className = "swatch-column";
    const currHeader = document.createElement("div");
    currHeader.style.fontWeight = 600;
    currHeader.style.fontSize = "13px";
    currHeader.innerHTML = 'Input = <span class="legend-marker circle"></span>';
    currentCol.appendChild(currHeader);
    const currList = document.createElement("div");
    currentCol.appendChild(currList);

    const newCol = document.createElement("div");
    newCol.className = "swatch-column";
    const newHeader = document.createElement("div");
    newHeader.style.fontWeight = 600;
    newHeader.style.fontSize = "13px";
    newHeader.innerHTML = 'Output = <span class="legend-marker square"></span>';
    newCol.appendChild(newHeader);
    const newList = document.createElement("div");
    newCol.appendChild(newList);

    const channelWrapOuter = document.createElement("div");
    const channelHeadings = document.createElement("div");
    channelHeadings.className = "channel-headings";
    const headingSpans = [];
    ["H", "S/C", "L"].forEach((h) => {
      const span = document.createElement("div");
      span.textContent = h;
      channelHeadings.appendChild(span);
      headingSpans.push(span);
    });
    const channelWrap = document.createElement("div");
    channelWrap.className = "channel-bars";
    const channelBars = ["h", "s", "l"].map(() => {
      const bar = document.createElement("div");
      bar.className = "channel-bar";
      channelWrap.appendChild(bar);
      return { bar };
    });
    channelWrapOuter.appendChild(channelHeadings);
    channelWrapOuter.appendChild(channelWrap);

    labelRow.appendChild(currentCol);
    labelRow.appendChild(newCol);
    labelRow.appendChild(channelWrapOuter);
    panel.appendChild(labelRow);

    const wheel = document.createElement("div");
    wheel.className = "wheel";
    const canvas = document.createElement("canvas");
    wheel.appendChild(canvas);
    panel.appendChild(wheel);

    ui.panels.appendChild(panel);
    ui.panelMap[type] = {
      panel,
      currList,
      newList,
      channelBars,
      headingSpans,
      canvas,
    };
  });

  updateChannelHeadings();
}

function refreshSwatches() {
  const colors = parsePalette(ui.paletteInput.value);
  state.currentColors = colors;
  state.bounds = computeBoundsFromCurrent(colors);
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.panel.style.display = "flex";
    renderSwatchColumn(refs.currList, colors, type, "circle");
    renderSwatchColumn(refs.newList, state.newColors, type, "square");
    renderChannelBars(refs.channelBars, state.currentColors, state.newColors, type);
    drawWheel(type);
  });
}

function updateBoundsAndRefresh() {
  state.bounds = computeBoundsFromCurrent(parsePalette(ui.paletteInput.value));
  refreshSwatches();
}

function updateWidthLabels() {
  const channels = channelOrder[ui.colorSpace.value];
  const scChannel = channels.find((c) => c === "s" || c === "c") || channels[1] || "s";
  ui.wHLabel.textContent = (channels[0] || "h").toUpperCase();
  ui.wSCLabel.textContent = (channels[1] || "c").toUpperCase();
  ui.wLLabel.textContent = (channels[2] || "l").toUpperCase();
}

function updateWidthChips() {
  ui.wHVal.textContent = `${Math.round(parseFloat(ui.wH.value) * 100)}%`;
  ui.wSCVal.textContent = `${Math.round(parseFloat(ui.wSC.value) * 100)}%`;
  ui.wLVal.textContent = `${Math.round(parseFloat(ui.wL.value) * 100)}%`;
}

function getWidths() {
  const h = parseFloat(ui.wH.value);
  const sc = parseFloat(ui.wSC.value);
  const l = parseFloat(ui.wL.value);
  return [h, sc, l].map((v) => (isFinite(v) ? v : 0));
}

function updateChannelHeadings() {
  const vizSpace = ui.colorwheelSpace.value;
  const channels = channelOrder[vizSpace];
  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs) return;
    refs.headingSpans.forEach((span, idx) => {
      span.textContent = (channels[idx] || channels[channels.length - 1] || ["h", "s", "l"][idx] || "x").toUpperCase();
    });
  });
}

function computeBoundsFromCurrent(colors) {
  const colorSpace = ui.colorSpace.value;
  const channels = channelOrder[colorSpace];
  if (!colors.length) return null;
  const widths = getWidths();
  const normalized = colors.map((hex) => normalizeSpace(decodeColor(hex, colorSpace), colorSpace));
  const dummyConfig = {
    constrain: true,
    widths,
  };
  return computeBounds(normalized, colorSpace, dummyConfig);
}

function parsePalette(raw) {
  const cleaned = raw.replace(/['"]/g, " ");
  const parts = cleaned
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = [];
  parts.forEach((p) => {
    let hex = p.startsWith("#") ? p : `#${p}`;
    if (/^#?[0-9a-fA-F]{6}$/.test(p) || /^#[0-9a-fA-F]{6}$/.test(hex)) {
      hex = hex.toUpperCase();
      if (!hex.startsWith("#")) hex = `#${hex}`;
      valid.push(hex);
    }
  });
  return valid;
}

function renderSwatchColumn(container, colors, type, shape) {
  container.innerHTML = "";
  if (!colors || !colors.length) {
    const empty = document.createElement("div");
    empty.style.color = "#94a3b8";
    empty.style.fontSize = "12px";
    empty.textContent = "—";
    container.appendChild(empty);
    return;
  }
  colors.forEach((c) => {
    const sw = document.createElement("div");
    sw.className = "swatch";
    const sim = applyCvdHex(c, type);
    sw.style.background = sim;
    sw.style.color = contrastColor(sim);
    sw.textContent = c;
    container.appendChild(sw);
  });
}

function renderChannelBars(barObjs, current, added, type) {
  if (!barObjs) return;
  const barSpace = ui.colorwheelSpace.value || "hsl"; // visualization space governs bars
  if (!csRanges[barSpace]) return;
  const combined = [
    ...current.map((c) => ({ color: c, shape: "circle" })),
    ...added.map((c) => ({ color: c, shape: "square" })),
  ];

  const vizChannels = channelOrder[barSpace];
  const configs = vizChannels.map((key) => ({
    key,
    min: csRanges[barSpace].min[key],
    max: csRanges[barSpace].max[key],
  }));
  while (configs.length < 3) {
    configs.push({ key: vizChannels[vizChannels.length - 1] || "l", min: 0, max: 1 });
  }

  barObjs.forEach((obj, idx) => {
    const cfg = configs[idx];
    obj.bar.innerHTML = "";
    obj.bar.style.background = channelGradientForSpace(cfg.key, barSpace, type);
    obj.bar.dataset.key = cfg.key;
  });

  combined.forEach((entry) => {
    const sim = applyCvdHex(entry.color, type);
    const decoded = decodeColor(entry.color, barSpace); // positions in visualization space
    barObjs.forEach((obj, idx) => {
      const cfg = configs[idx];
      const val = normalize(decoded[cfg.key] || 0, cfg.min, cfg.max);
      const dot = document.createElement("div");
      dot.className = `channel-dot ${entry.shape === "square" ? "square" : ""}`;
      dot.style.top = `${val * 100}%`;
      dot.style.width = "12px";
      dot.style.height = "12px";
      dot.style.background = sim;
      obj.bar.appendChild(dot);
    });
  });

  // Only show overlays when visualization space matches optimization space to avoid mismatch
  if (state.bounds && ui.colorSpace.value === barSpace) {
    const lRange = csRanges[barSpace];
    const lMin = normalize(state.bounds.boundsL[0], lRange.min["l"] ?? 0, lRange.max["l"] ?? 1);
    const lMax = normalize(state.bounds.boundsL[1], lRange.min["l"] ?? 0, lRange.max["l"] ?? 1);
    const scMin = normalize(state.bounds.boundsSc[0], 0, 1);
    const scMax = normalize(state.bounds.boundsSc[1], 0, 1);
    const overlays = [
      { idx: vizChannels.indexOf("h"), type: "h", range: state.bounds.boundsH },
      { idx: vizChannels.indexOf("s") !== -1 ? vizChannels.indexOf("s") : vizChannels.indexOf("c"), min: scMin, max: scMax },
      { idx: vizChannels.indexOf("l"), min: lMin, max: lMax },
    ];
    overlays.forEach((o) => {
      const bar = o.idx >= 0 ? barObjs[o.idx]?.bar : null;
      if (!bar) return;
      if (o.type === "h" && o.range) {
        const [lo, hiRaw] = o.range;
        const span = (hiRaw - lo + 1) % 1 || 1;
        if (span >= 0.999) return; // full range, skip overlay
        const hi = lo + span;
        const segments = hi > 1 ? [[lo, 1], [0, hi - 1]] : [[lo, hi]];
        segments.forEach((seg) => {
          const overlay = document.createElement("div");
          overlay.style.position = "absolute";
          overlay.style.left = "-2px";
          overlay.style.right = "-2px";
          overlay.style.top = `${seg[0] * 100}%`;
          overlay.style.height = `${Math.max((seg[1] - seg[0]) * 100, 1)}%`;
          overlay.style.background = "rgba(0,0,0,0.08)";
          overlay.style.pointerEvents = "none";
          overlay.style.borderTop = "1px dashed rgba(0,0,0,0.35)";
          overlay.style.borderBottom = "1px dashed rgba(0,0,0,0.35)";
          bar.appendChild(overlay);
        });
      } else if (o.min !== undefined && o.max !== undefined) {
        const overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.left = "-2px";
        overlay.style.right = "-2px";
        const heightPct = Math.max((o.max - o.min) * 100, 1);
        overlay.style.top = `${o.min * 100}%`;
        overlay.style.height = `${heightPct}%`;
        overlay.style.background = "rgba(0,0,0,0.08)";
        overlay.style.pointerEvents = "none";
        overlay.style.borderTop = "1px dashed rgba(0,0,0,0.35)";
        overlay.style.borderBottom = "1px dashed rgba(0,0,0,0.35)";
        bar.appendChild(overlay);
      }
    });
  }
}

function runOptimization() {
  if (state.running) return;
  const palette = parsePalette(ui.paletteInput.value);
  if (!palette.length) {
    showError("Please enter at least one valid hex color.");
    return;
  }
  showError("");
  const config = readConfig();
  state.running = true;
  ui.runBtn.disabled = true;
  ui.runBtn.textContent = "Running…";
  setStatus("starting optimizer…", 0);
  setResults([]);
  state.bestScores = [];
  state.bounds = computeBoundsFromCurrent(palette);
  drawStatusGraph();

  setTimeout(async () => {
    try {
      const best = await optimizePalette(palette, config);
      state.newColors = best.newHex || [];
      const convergence = best.meta?.reason || "finished";
      setStatus(`done. best score = ${(-best.value).toFixed(3)} (${convergence})`, 100);
      setResults(state.newColors);
    } catch (err) {
      showError(err.message || "Optimization failed.");
      console.error(err);
    } finally {
      state.running = false;
      ui.runBtn.disabled = false;
      ui.runBtn.textContent = "Run optimization";
      refreshSwatches();
    }
  }, 20);
}

function readConfig() {
  const colorblindWeights = {
    none: parseFloat(ui.wNone.value) || 0,
    deutan: parseFloat(ui.wDeutan.value) || 0,
    protan: parseFloat(ui.wProtan.value) || 0,
    tritan: parseFloat(ui.wTritan.value) || 0,
  };
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  const widths = getWidths();
  return {
    colorSpace: ui.colorSpace.value,
    colorwheelSpace: ui.colorwheelSpace.value,
    nColsToAdd: Math.max(1, parseInt(ui.colorsToAdd.value, 10) || 1),
    nOptimRuns: state.lastRuns,
    nmIterations: Math.max(10, parseInt(ui.nmIters.value, 10) || 260),
    constrain: true,
    widths,
    colorblindSafe: true,
    colorblindWeights,
  };
}

async function optimizePalette(palette, config) {
  const colorSpace = config.colorSpace;
  const channels = channelOrder[colorSpace];
  const prep = prepareData(palette, colorSpace, config);
  const dim = config.nColsToAdd * channels.length;
  let best = { value: Infinity, par: null, newHex: [] };
  state.bestScores = [];

  for (let run = 0; run < config.nOptimRuns; run++) {
    const start = randomNormalArray(dim, 0, 1);
    const res = nelderMead(
      (p) => objectiveValue(p, prep),
      start,
      { maxIterations: config.nmIterations, step: 1.2 }
    );
    if (res.fx < best.value) {
      const info = objectiveInfo(res.x, prep);
      best = { value: res.fx, par: res.x, newHex: info.newHex, meta: { reason: res.reason } };
    }
    const bestScore = best.value === Infinity ? 0 : -best.value;
    state.bestScores.push(bestScore);
    const pct = Math.round(((run + 1) / config.nOptimRuns) * 100);
    setStatus(`restart ${run + 1}/${config.nOptimRuns}`, pct);
    drawStatusGraph();
    await nextFrame();
  }
  return best;
}

function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const normalized = palette.map((hex) => {
    const vals = decodeColor(hex, colorSpace);
    return normalizeSpace(vals, colorSpace);
  });

  const bounds = computeBounds(normalized, colorSpace, config);
  const currHex = normalized.map((row) =>
    encodeColor(unscaleSpace(row, colorSpace), colorSpace)
  );
  state.bounds = bounds;
  return {
    currCols: normalized,
    currHex,
    bounds,
    colorSpace,
    csRanges,
    colorblindWeights: config.colorblindWeights,
    colorblindSafe: config.colorblindSafe,
    nColsToAdd: config.nColsToAdd,
  };
}

function computeBounds(normalized, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const values = (channel) => normalized.map((r) => r[channel]);
  const widths = config.widths || [];
  const boundsByName = {};
  let boundsSc = [0, 1];
  let boundsL = [0, 1];
  let boundsH = null;
  if (config.constrain) {
    channels.forEach((ch, idx) => {
      const probs = ch === "l" ? [0.1, 0.9] : [0.05, 0.95];
      const qs = quantiles(values(ch), probs);
      const width = widths[idx] ?? widths[widths.length - 1] ?? 0;
      const b = widthBounds(qs, width, ch === "h");
      boundsByName[ch] = b;
      if (ch === "h") boundsH = b;
      else if (ch === "l") boundsL = b;
      else boundsSc = b;
    });
  }
  return { boundsSc, boundsL, boundsH, boundsByName };
}

function objectiveValue(par, prep) {
  return meanDistance(par, prep, false).value;
}

function objectiveInfo(par, prep) {
  return meanDistance(par, prep, true);
}

function meanDistance(par, prep, returnInfo) {
  const { currCols, currHex, bounds, colorSpace, csRanges, colorblindWeights, colorblindSafe, nColsToAdd } = prep;
  const channels = channelOrder[colorSpace];
  const cn = channels;

  const m = [];
  for (let i = 0; i < nColsToAdd; i++) {
    const row = {};
    for (let j = 0; j < cn.length; j++) {
      row[cn[j]] = par[i * cn.length + j];
    }
    m.push(row);
  }

  if (cn.includes("l")) {
    if (m.length > 1) {
      for (let i = 1; i < m.length; i++) {
        m[i].l = Math.exp(m[i].l);
      }
      let acc = 0;
      for (let i = 0; i < m.length; i++) {
        acc += m[i].l;
        m[i].l = acc;
      }
    }
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.l || bounds.boundsL;
      m[i].l = logistic(m[i].l) * (b[1] - b[0]) + b[0];
    }
  }

  const scChannel = cn.find((c) => c === "s" || c === "c");
  if (scChannel) {
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.[scChannel] || bounds.boundsSc;
      m[i][scChannel] =
        logistic(m[i][scChannel]) * (b[1] - b[0]) +
        b[0];
    }
  }

  if (cn.includes("h") && bounds.boundsH) {
    for (let i = 0; i < m.length; i++) {
      const span = (bounds.boundsH[1] - bounds.boundsH[0] + 1) % 1 || 1;
      m[i].h = logistic(m[i].h);
      m[i].h = (bounds.boundsH[0] + m[i].h * span) % 1;
    }
  }

  for (let i = 0; i < m.length; i++) {
    cn.forEach((ch) => {
      if (ch === "l" || ch === scChannel || ch === "h") return;
      const b = bounds.boundsByName?.[ch] || [0,1];
      m[i][ch] = logistic(m[i][ch]) * (b[1]-b[0]) + b[0];
    });
  }

  const scaled = m.map((row) => unscaleSpace(row, colorSpace));
  const newHex = scaled.map((row) => encodeColor(row, colorSpace));
  const currHexLocal = currHex;

  const cvdStates = colorblindSafe ? ["deutan", "protan", "tritan", "none"] : ["none"];
  const dists = {};

  for (const state of cvdStates) {
    const nh = newHex.map((h) => applyCvdHex(h, state));
    const ch = currHexLocal.map((h) => applyCvdHex(h, state));
    const nLabs = nh.map((h) => decodeColor(h, "lab"));
    const cLabs = ch.map((h) => decodeColor(h, "lab"));

    const pairwise = [];
    for (let i = 0; i < cLabs.length; i++) {
      for (let j = 0; j < nLabs.length; j++) {
        pairwise.push(deltaE2000(cLabs[i], nLabs[j]));
      }
    }
    for (let i = 0; i < nLabs.length; i++) {
      for (let j = i + 1; j < nLabs.length; j++) {
        pairwise.push(deltaE2000(nLabs[i], nLabs[j]));
      }
    }
    const eps = 1e-6;
    const hm = 1 / (pairwise.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0) / pairwise.length);
    dists[state] = hm;
  }

  const weights = colorblindWeights;
  let wd = 0;
  for (const k of Object.keys(weights)) {
    wd += (dists[k] || 0) * (weights[k] || 0);
  }

  const penaltyWeight = 1e-1;
  const penalty = par.reduce((acc, v) => acc + v * v, 0);
  const value = -wd + penaltyWeight * penalty;

  if (returnInfo) {
    return { value, newHex, distance: wd };
  }
  return { value };
}

function nelderMead(fn, start, opts = {}) {
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;
  const maxIterations = opts.maxIterations || 200;
  const tolerance = opts.tolerance || 1e-5;
  const step = opts.step || 1;

  const n = start.length;
  let simplex = Array.from({ length: n + 1 }, (_, i) => {
    if (i === 0) return start.slice();
    const point = start.slice();
    point[i - 1] += step;
    return point;
  });
  let values = simplex.map((p) => fn(p));

  for (let iter = 0; iter < maxIterations; iter++) {
    const order = simplex
      .map((p, idx) => ({ p, v: values[idx], idx }))
      .sort((a, b) => a.v - b.v);
    simplex = order.map((o) => o.p);
    values = order.map((o) => o.v);

    const best = simplex[0];
    const worst = simplex[n];

    const spread = Math.max(...values) - Math.min(...values);
    if (spread < tolerance) {
      return { x: simplex[0], fx: values[0], reason: "converged (spread)" };
    }

    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i][j];
      }
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const reflect = centroid.map((c, j) => c + alpha * (c - worst[j]));
    const fr = fn(reflect);

    if (fr < values[0]) {
      const expand = centroid.map((c, j) => c + gamma * (reflect[j] - c));
      const fe = fn(expand);
      if (fe < fr) {
        simplex[n] = expand;
        values[n] = fe;
      } else {
        simplex[n] = reflect;
        values[n] = fr;
      }
      continue;
    }

    if (fr < values[n - 1]) {
      simplex[n] = reflect;
      values[n] = fr;
      continue;
    }

    let contract;
    if (fr < values[n]) {
      contract = centroid.map((c, j) => c + rho * (reflect[j] - c));
    } else {
      contract = centroid.map((c, j) => c + rho * (worst[j] - c));
    }
    const fc = fn(contract);
    if (fc < values[n]) {
      simplex[n] = contract;
      values[n] = fc;
      continue;
    }

    for (let i = 1; i < simplex.length; i++) {
      simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
      values[i] = fn(simplex[i]);
    }
  }

  return { x: simplex[0], fx: values[0], reason: "max iterations" };
}

function deltaE2000(lab1, lab2) {
  const L1 = lab1.l;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const L2 = lab2.l;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const kL = 1;
  const kC = 1;
  const kH = 1;
  const rad = (deg) => (deg * Math.PI) / 180;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const Cbarp = (C1p + C2p) / 2;

  const h1pDeg = (Math.atan2(b1, a1p) * 180) / Math.PI + 360;
  const h2pDeg = (Math.atan2(b2, a2p) * 180) / Math.PI + 360;
  const h1 = h1pDeg % 360;
  const h2 = h2pDeg % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let hDiff = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h2 - h1) <= 180) {
      hDiff = h2 - h1;
    } else if (h2 <= h1) {
      hDiff = h2 - h1 + 360;
    } else {
      hDiff = h2 - h1 - 360;
    }
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(hDiff) / 2);

  let hbarp = 0;
  if (C1p * C2p === 0) {
    hbarp = h1 + h2;
  } else if (Math.abs(h1 - h2) <= 180) {
    hbarp = (h1 + h2) / 2;
  } else if (h1 + h2 < 360) {
    hbarp = (h1 + h2 + 360) / 2;
  } else {
    hbarp = (h1 + h2 - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));
  const Lbarp = (L1 + L2) / 2;
  const Sl =
    1 +
    (0.015 * Math.pow(Lbarp - 50, 2)) /
      Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const deltaTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
  const Rt = -Rc * Math.sin(rad(deltaTheta));

  const termL = dLp / (kL * Sl);
  const termC = dCp / (kC * Sc);
  const termH = dHp / (kH * Sh);
  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}

function drawWheel(type) {
  const refs = ui.panelMap[type];
  if (!refs) return;
  const canvas = refs.canvas;
  const ctx = canvas.getContext("2d");
  const size = refs.panel.clientWidth - 24;
  const deviceScale = window.devicePixelRatio || 1;
  const dim = Math.max(240, Math.min(420, size));
  canvas.width = dim * deviceScale;
  canvas.height = dim * deviceScale;
  canvas.style.width = `${dim}px`;
  canvas.style.height = `${dim}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(deviceScale, deviceScale);

  const cx = dim / 2;
  const cy = dim / 2;
  const radius = (dim / 2) * 0.9;
  const slicesT = 60;
  const slicesR = 20;
  const wheelSpace = ui.colorwheelSpace.value;
  if (!csRanges[wheelSpace]) return;

  for (let t = 0; t < slicesT; t++) {
    for (let r = 0; r < slicesR; r++) {
      const t0 = (t / slicesT) * 2 * Math.PI;
      const t1 = ((t + 1) / slicesT) * 2 * Math.PI;
      const r0 = r / slicesR;
      const r1 = (r + 1) / slicesR;
      const hue = ((t + 0.5) / slicesT) * 360;
      const chroma = (r + 0.5) / slicesR;
      const color = applyCvdHex(makeWheelColor(hue, chroma, wheelSpace), type);

      ctx.beginPath();
      ctx.moveTo(cx + radius * r0 * Math.cos(t0), cy + radius * r0 * Math.sin(t0));
      ctx.lineTo(cx + radius * r1 * Math.cos(t0), cy + radius * r1 * Math.sin(t0));
      ctx.lineTo(cx + radius * r1 * Math.cos(t1), cy + radius * r1 * Math.sin(t1));
      ctx.lineTo(cx + radius * r0 * Math.cos(t1), cy + radius * r0 * Math.sin(t1));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  const allColors = state.currentColors.map((c) => ({ color: c, shape: "circle" }))
    .concat(state.newColors.map((c) => ({ color: c, shape: "square" })));
  const coords = allColors.map((entry) => {
    const vals = decodeColor(entry.color, wheelSpace);
    const hasHue = Number.isFinite(vals.h);
    let hueDeg = hasHue ? ((vals.h % 360) + 360) % 360 : ((Math.atan2(vals.b || 0, vals.a || 0) * 180) / Math.PI + 360) % 360;
    const sOrC = wheelSpace === "hsl" ? "s" : ("c" in vals ? "c" : null);
    let chroma;
    if (sOrC === "s") {
      chroma = vals.s || 0;
    } else if (sOrC === "c") {
      chroma = vals.c || 0;
    } else {
      chroma = Math.sqrt(Math.pow(vals.a || 0, 2) + Math.pow(vals.b || 0, 2));
    }
    const maxSC =
      sOrC === "s"
        ? csRanges[wheelSpace].max.s
        : sOrC === "c"
        ? csRanges[wheelSpace].max.c
        : Math.min(
            Math.max(Math.abs(csRanges[wheelSpace].min.a || 0), Math.abs(csRanges[wheelSpace].max.a || 0)),
            Math.max(Math.abs(csRanges[wheelSpace].min.b || 0), Math.abs(csRanges[wheelSpace].max.b || 0))
          );
    const rNorm = maxSC ? clamp(chroma / maxSC, 0, 1) : 0;
    const theta = (hueDeg / 180) * Math.PI;
    const lx = csRanges[wheelSpace];
    const lNorm = clamp((vals.l - lx.min.l) / (lx.max.l - lx.min.l), 0, 1);
    return {
      color: entry.color,
      shape: entry.shape,
      x: cx + radius * rNorm * Math.cos(theta),
      y: cy + radius * rNorm * Math.sin(theta),
      lNorm,
    };
  });

  coords.forEach((pt) => {
    const fill = applyCvdHex(pt.color, type);
    ctx.beginPath();
    const sizePt = 6 + 12 * pt.lNorm;
    if (pt.shape === "square") {
      ctx.rect(pt.x - sizePt / 2, pt.y - sizePt / 2, sizePt, sizePt);
    } else {
      ctx.arc(pt.x, pt.y, sizePt / 2, 0, 2 * Math.PI);
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });

  // constraint overlay
  if (state.bounds && ui.colorSpace.value === ui.colorwheelSpace.value) {
    const wheelSpace = ui.colorwheelSpace.value;
    const sOrC = wheelSpace === "hsl" ? "s" : "c";
    const maxSC = csRanges[wheelSpace].max[sOrC];
    const rMin = state.bounds.boundsSc[0] * radius;
    const rMax = state.bounds.boundsSc[1] * radius;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rMin, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    if (wheelSpace === "hsl") {
      if (state.bounds.boundsH) {
        const spanNorm = (state.bounds.boundsH[1] - state.bounds.boundsH[0] + 1) % 1;
        if (spanNorm > 0 && spanNorm < 0.999) {
          const start = state.bounds.boundsH[0] * 2 * Math.PI;
          const span = spanNorm * 2 * Math.PI;
          ctx.fillStyle = "rgba(0,0,0,0.08)";
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, radius, start, start + span);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

function makeWheelColor(hueDeg, chromaNorm, wheelSpace) {
  const fixedL = wheelSpace === "hsl" ? 0.5 : 0.75;
  if (wheelSpace === "hsl") {
    return encodeColor({ h: hueDeg, s: chromaNorm * csRanges.hsl.max.s, l: fixedL * csRanges.hsl.max.l }, "hsl");
  }
  if (wheelSpace === "lch") {
    return encodeColor({ l: fixedL * csRanges.lch.max.l, c: chromaNorm * csRanges.lch.max.c, h: hueDeg }, "lch");
  }
  if (wheelSpace === "oklch") {
    return encodeColor({ l: fixedL, c: chromaNorm * csRanges.oklch.max.c, h: hueDeg }, "oklch");
  }
  if (wheelSpace === "lab") {
    const maxA = Math.max(Math.abs(csRanges.lab.min.a), Math.abs(csRanges.lab.max.a));
    const maxB = Math.max(Math.abs(csRanges.lab.min.b), Math.abs(csRanges.lab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return encodeColor({ l: fixedL * csRanges.lab.max.l, a, b }, "lab");
  }
  if (wheelSpace === "oklab") {
    const maxA = Math.max(Math.abs(csRanges.oklab.min.a), Math.abs(csRanges.oklab.max.a));
    const maxB = Math.max(Math.abs(csRanges.oklab.min.b), Math.abs(csRanges.oklab.max.b));
    const maxC = Math.min(maxA, maxB);
    const c = chromaNorm * maxC;
    const a = c * Math.cos((hueDeg * Math.PI) / 180);
    const b = c * Math.sin((hueDeg * Math.PI) / 180);
    return encodeColor({ l: fixedL, a, b }, "oklab");
  }
  return encodeColor({ h: hueDeg, s: chromaNorm * 100, l: fixedL * 100 }, "hsl");
}

function channelGradientForSpace(key, space, type) {
  const stops = 24;
  const colors = [];
  const hueStart = 330;
  const hueSpan = 300;
  for (let i = 0; i <= stops; i++) {
    const t = i / stops;
    let hex;
    if (key === "h") {
      const h = hueStart + hueSpan * t;
      hex = encodeColor({ h, s: 100, l: 50 }, "hsl");
    } else if (key === "l") {
      const lVal = csRanges[space].min.l + t * (csRanges[space].max.l - csRanges[space].min.l);
      hex = encodeColor({ ...zeroChannels(space), l: lVal }, space);
    } else if (key === "s" || key === "c") {
      const scVal =
        csRanges[space].min[key] + t * (csRanges[space].max[key] - csRanges[space].min[key]);
      hex = encodeColor({ ...zeroChannels(space), [key]: scVal, l: midL(space) }, space);
    } else if (key === "a" || key === "b") {
      const val = csRanges[space].min[key] + t * (csRanges[space].max[key] - csRanges[space].min[key]);
      const obj = { ...zeroChannels(space), l: midL(space), [key]: val };
      hex = encodeColor(obj, space);
    } else {
      hex = encodeColor({ ...zeroChannels(space), l: midL(space) }, space);
    }
    colors.push(applyCvdHex(hex, type));
  }
  const gradient = colors.map((c, idx) => `${c} ${(idx / stops) * 100}%`).join(", ");
  return `linear-gradient(180deg, ${gradient})`;
}

function zeroChannels(space) {
  const ch = channelOrder[space];
  const obj = {};
  ch.forEach((key) => {
    if (key === "h") obj[key] = 0;
    else if (key === "l") obj[key] = midL(space);
    else obj[key] = 0;
  });
  return obj;
}

function midL(space) {
  return (csRanges[space].min.l + csRanges[space].max.l) / 2;
}

function flexBounds(vals, xlim = [0, 1], rat = 1.1) {
  const range = vals[1] - vals[0];
  const mean = (vals[0] + vals[1]) / 2;
  const low = Math.max(xlim[0], mean - 0.5 * range * rat);
  const high = Math.min(xlim[1], mean + 0.5 * range * rat);
  return [low, high];
}

function quantiles(arr, probs) {
  if (!arr.length) return probs.map(() => 0);
  const sorted = [...arr].sort((a, b) => a - b);
  return probs.map((p) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  });
}

function widthBounds(qs, width, circular = false) {
  if (width <= 0) return [0, 1]; // 0% constraint => full space
  const span = qs[1] - qs[0];
  // width in [0,1]; 0 = full space, 1 = tightest span
  const desiredSpan = span + (1 - span) * (1 - width);
  if (desiredSpan >= 1 - 1e-6) return [0, 1];
  const mean = (qs[0] + qs[1]) / 2;
  let low = mean - desiredSpan / 2;
  let high = mean + desiredSpan / 2;
  if (circular) {
    if (desiredSpan >= 1) return [0, 1];
    low = ((low % 1) + 1) % 1;
    high = ((high % 1) + 1) % 1;
    if (high < low) high += 1;
    return [low, high].map((x) => x % 1);
  }
  return [Math.max(0, low), Math.min(1, high)];
}

function normalizeSpace(vals, space) {
  const min = csRanges[space].min;
  const max = csRanges[space].max;
  const out = {};
  channelOrder[space].forEach((ch) => {
    out[ch] = (vals[ch] - min[ch]) / (max[ch] - min[ch]);
  });
  return out;
}

function unscaleSpace(vals, space) {
  const min = csRanges[space].min;
  const max = csRanges[space].max;
  const out = {};
  channelOrder[space].forEach((ch) => {
    out[ch] = vals[ch] * (max[ch] - min[ch]) + min[ch];
  });
  return out;
}

function logistic(x) {
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function applyCvdHex(hex, type) {
  if (type === "none") return hex;
  const rgb = hexToRgb(hex);
  const sim = applyCvdRgb(rgb, type);
  return rgbToHex(sim);
}

function applyCvdRgb(rgb, type) {
  const m = cvdMatrices[type];
  if (!m) return rgb;
  const r = clamp(rgb.r);
  const g = clamp(rgb.g);
  const b = clamp(rgb.b);
  return {
    r: clamp(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    g: clamp(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    b: clamp(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  };
}

function contrastColor(hex) {
  const lum = relativeLuminance(hexToRgb(hex));
  return lum > 0.5 ? "#111827" : "#f8fafc";
}

function relativeLuminance(rgb) {
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => {
    const clamped = Math.round(clamp(v) * 255).toString(16).padStart(2, "0");
    return clamped;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }) {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = l / 100;
  if (ss === 0) return { r: ll, g: ll, b: ll };
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const tc = [hh + 1 / 3, hh, hh - 1 / 3];
  const rgb = tc.map((t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  });
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

function rgbToXyz({ r, g, b }) {
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return {
    x: rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    y: rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    z: rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  };
}

function xyzToRgb({ x, y, z }) {
  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return {
    r: toSrgb(rl),
    g: toSrgb(gl),
    b: toSrgb(bl),
  };
}

function xyzToLab({ x, y, z }) {
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const fx = labFn(x / xn);
  const fy = labFn(y / yn);
  const fz = labFn(z / zn);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labToXyz({ l, a, b }) {
  const yn = 1;
  const xn = 0.95047;
  const zn = 1.08883;
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xr = labInvFn(fx);
  const yr = labInvFn(fy);
  const zr = labInvFn(fz);
  return { x: xr * xn, y: yr * yn, z: zr * zn };
}

function labToLch({ l, a, b }) {
  const c = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { l, c, h };
}

function lchToLab({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(hr), b: c * Math.sin(hr) };
}

function srgbToOklab({ r, g, b }) {
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  const l = 0.412165612 * rl + 0.536275208 * gl + 0.0514575653 * bl;
  const m = 0.211859107 * rl + 0.6807189584 * gl + 0.107406579 * bl;
  const s = 0.0883097947 * rl + 0.2818474174 * gl + 0.6302613616 * bl;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToSrgb({ l, a, b }) {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  return {
    r: clamp(toSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)),
    g: clamp(toSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)),
    b: clamp(toSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)),
  };
}

function decodeColor(hex, space) {
  const rgb = hexToRgb(hex);
  switch (space) {
    case "hsl":
      return rgbToHsl(rgb);
    case "lab": {
      const xyz = rgbToXyz(rgb);
      return xyzToLab(xyz);
    }
    case "lch": {
      const lab = xyzToLab(rgbToXyz(rgb));
      return labToLch(lab);
    }
    case "oklab":
      return srgbToOklab(rgb);
    case "oklch": {
      const lab = srgbToOklab(rgb);
      const hRaw = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
      const h = (hRaw + 360) % 360;
      return { l: lab.l, c: Math.sqrt(lab.a * lab.a + lab.b * lab.b), h };
    }
    default:
      return rgbToHsl(rgb);
  }
}

function encodeColor(vals, space) {
  switch (space) {
    case "hsl":
      return rgbToHex(hslToRgb(vals));
    case "lab":
      return rgbToHex(xyzToRgb(labToXyz(vals)));
    case "lch":
      return rgbToHex(xyzToRgb(labToXyz(lchToLab(vals))));
    case "oklab":
      return rgbToHex(oklabToSrgb(vals));
    case "oklch": {
      const hRad = (((vals.h % 360) + 360) % 360) * (Math.PI / 180);
      const a = vals.c * Math.cos(hRad);
      const b = vals.c * Math.sin(hRad);
      return rgbToHex(oklabToSrgb({ l: vals.l, a, b }));
    }
    default:
      return rgbToHex(hslToRgb(vals));
  }
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function labFn(t) {
  const delta = 6 / 29;
  return t > Math.pow(delta, 3) ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

function labInvFn(t) {
  const delta = 6 / 29;
  const delta3 = delta * delta * delta;
  return t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29);
}

function clamp(v, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v));
}

function randomNormalArray(len, mean = 0, sd = 1) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(randomNormal(mean, sd));
  return out;
}

function randomNormal(mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function setStatus(text, pct) {
  ui.statusText.textContent = text;
  ui.progressBar.style.width = `${pct}%`;
  drawStatusGraph();
}

function setResults(colors) {
  const list = colors || [];
  const withQuotes = ui.formatQuotes?.checked;
  const useCommas = ui.formatCommas?.checked;
  const useLines = ui.formatLines?.checked;
  const mapped = list.map((c) => (withQuotes ? `"${c}"` : c));
  let txt;
  if (useLines) {
    txt = mapped.join("\n");
  } else if (useCommas) {
    txt = mapped.join(", ");
  } else {
    txt = mapped.join(" ");
  }
  ui.resultsBox.value = txt;
}

function copyResults() {
  if (!ui.resultsBox.value.trim()) return;
  navigator.clipboard.writeText(ui.resultsBox.value).catch(() => {});
  ui.copyBtn.textContent = "Copied!";
  clearTimeout(state.copyTimeout);
  state.copyTimeout = setTimeout(() => {
    ui.copyBtn.textContent = "Copy";
  }, 900);
}

function showError(text) {
  ui.errorText.textContent = text || "";
}

function drawStatusGraph() {
  const canvas = ui.statusGraph;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const deviceScale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.parentElement.clientWidth || 320;
  const height = canvas.clientHeight || 100;
  canvas.width = width * deviceScale;
  canvas.height = height * deviceScale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(deviceScale, deviceScale);
  ctx.clearRect(0, 0, width, height);

  const padding = { left: 60, right: 14, top: 12, bottom: 28 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d0d7e2";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotW, plotH);

  const scores = state.bestScores;
  const xMax = Math.max(state.lastRuns, scores.length || 1);

  ctx.fillStyle = "#475467";
  ctx.font = "11px 'Space Grotesk', Arial, sans-serif";
  ctx.save();
  ctx.translate(16, padding.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText("score", 0, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillText("restarts", padding.left + plotW / 2, height - 6);

  if (!scores.length) return;
  let min = Math.min(...scores);
  let max = Math.max(...scores);
  const pad = (max - min) * 0.05 || 0.01;
  min -= pad;
  max += pad;
  const span = Math.max(max - min, 1e-6);

  ctx.fillStyle = "#6b7280";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const yTicks = niceTicks(min, max, 3);
  yTicks.forEach((v) => {
    const y = padding.top + (1 - (v - min) / span) * plotH;
    if (y < padding.top - 2 || y > padding.top + plotH + 2) return;
    const fmt =
      span < 2 ? v.toFixed(2) :
      span < 20 ? v.toFixed(1) :
      v.toFixed(0);
    ctx.fillText(fmt, padding.left - 6, y);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const xTicks = niceTicks(0, xMax - 1, 3);
  xTicks.forEach((t) => {
    const x = padding.left + (t / Math.max(xMax - 1, 1)) * plotW;
    if (x < padding.left - 2 || x > padding.left + plotW + 2) return;
    ctx.fillText(String(t), x, height - padding.bottom + 2);
    ctx.strokeStyle = "rgba(0,0,0,0.05)";
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotH);
    ctx.stroke();
  });

  ctx.strokeStyle = "#1a46ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = padding.left + ((i) / Math.max(xMax - 1, 1)) * plotW;
    const y = padding.top + (1 - (s - min) / span) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function niceTicks(min, max, count) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (count < 2) return [min, max];
  const span = max - min || 1;
  const rawStep = span / (count - 1);
  const step = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const err = rawStep / step;
  const niceStep =
    err < 1.5 ? step :
    err < 3   ? 2 * step :
    err < 7   ? 5 * step :
                10 * step;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += niceStep) ticks.push(v);
  return ticks;
}

function normalize(v, min, max) {
  const span = max - min;
  if (span === 0 || !isFinite(span)) return 0;
  return clamp((v - min) / span);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}
