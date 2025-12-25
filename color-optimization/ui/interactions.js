import {
  channelOrder,
  csRanges,
  convertColorValues,
  decodeColor,
  encodeColor,
  normalizeWithRange,
  projectToGamut,
  GAMUTS,
} from "../core/colorSpaces.js";
import { parsePalette } from "./configRead.js";
import { refreshSwatches } from "./panels.js";
import { setResults } from "./resultsBox.js";
import { setStatusState } from "./status.js";

const HIT_RADIUS = 8;
const EDGE_HIT = 6;
const PANEL_MESSAGE_MS = 900;
const cursorCache = new Map();

function currentVizOpts(ui) {
  return {
    clipToGamut: ui?.clipGamut ? ui.clipGamut.checked : false,
    gamutPreset: ui?.gamutPreset?.value || "srgb",
    gamutMode: ui?.gamutMode?.value || "auto",
    cvdModel: ui?.cvdModel?.value || "legacy",
  };
}

function clampRange(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v) {
  return clampRange(v, 0, 1);
}

function syncRawInputField(ui, state) {
  if (!ui?.rawInputValues) return;
  if (!state?.rawInputOverride) {
    ui.rawInputValues.value = "";
    return;
  }
  ui.rawInputValues.value = JSON.stringify(state.rawInputOverride);
}

function flashPanelMessage(refs, text) {
  if (!refs?.panel) return;
  let toast = refs.panel.querySelector(".panel-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "panel-toast";
    refs.panel.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, PANEL_MESSAGE_MS);
}

function radialCursor(angleRad) {
  const angleDeg = Math.round((((angleRad * 180) / Math.PI) % 360 + 360) % 360);
  const snapped = Math.round(angleDeg / 10) * 10;
  if (cursorCache.has(snapped)) return cursorCache.get(snapped);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <g transform="translate(16 16) rotate(${snapped})">
      <line x1="-10" y1="0" x2="10" y2="0" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/>
      <polygon points="-12,0 -6,-4 -6,4" fill="#0f172a"/>
      <polygon points="12,0 6,-4 6,4" fill="#0f172a"/>
    </g>
  </svg>`;
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  const cursor = `url("data:image/svg+xml,${encoded}") 16 16, grab`;
  cursorCache.set(snapped, cursor);
  return cursor;
}

function getPaletteHexes(ui) {
  return parsePalette(ui.paletteInput.value);
}

function setPaletteHexes(ui, hexes, state) {
  if (state) state.keepInputOverride = true;
  ui.paletteInput.value = hexes.join(", ");
  ui.paletteInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function replacePaletteIndex(ui, state, idx, hex) {
  const hexes = getPaletteHexes(ui);
  if (idx < 0 || idx >= hexes.length) return;
  hexes[idx] = hex;
  setPaletteHexes(ui, hexes, state);
}

function removePaletteIndex(ui, state, idx) {
  const hexes = getPaletteHexes(ui);
  if (idx < 0 || idx >= hexes.length) return;
  hexes.splice(idx, 1);
  setPaletteHexes(ui, hexes, state);
}

function appendPaletteHex(ui, state, hex) {
  const hexes = getPaletteHexes(ui);
  hexes.push(hex);
  setPaletteHexes(ui, hexes, state);
}

function paletteChannelStats(space, ch, hexes, range) {
  let values = null;
  if (arguments.length > 4) {
    values = arguments[4];
  }
  const source = values && values.length ? values : hexes.map((h) => decodeColor(h, space));
  if (!source.length) {
    return { min: 0.5, max: 0.5 };
  }
  const vals = source
    .map((v) => clamp01(normalizeWithRange(v, range, space)[ch]))
    .filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function getInputOverrideValues(state, ui, space) {
  if (state.rawInputOverride?.space === space && Array.isArray(state.rawInputOverride.values)) {
    return state.rawInputOverride.values.map((v) => ({ ...v }));
  }
  const palette = getPaletteHexes(ui);
  return palette.map((hex) => decodeColor(hex, space));
}

function setInputOverride(state, ui, space, values) {
  state.rawInputOverride = { space, values };
  state.keepInputOverride = true;
  syncRawInputField(ui, state);
}

function sliderForChannel(ui, space, ch) {
  const channels = channelOrder[space] || [];
  const sc = channels.find((c) => c === "s" || c === "c") || channels[1];
  if (ch === channels[0]) return ui.wH;
  if (ch === sc) return ui.wSC;
  if (ch === channels[2]) return ui.wL;
  return null;
}

function setWidthForChannel(ui, space, ch, width) {
  const slider = sliderForChannel(ui, space, ch);
  if (!slider) return;
  slider.value = String(clamp01(width));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

function thirdKeyForMeta(meta) {
  if (meta.isRectWheel && meta.rectKeys) return meta.rectKeys.l;
  const channels = channelOrder[meta.wheelSpace] || [];
  const sc = channels.find((c) => c === "s" || c === "c");
  return channels.find((c) => c !== "h" && c !== sc) || "l";
}

function midpointForChannel(ui, state, meta, ch) {
  if (ui.colorSpace.value === meta.wheelSpace && state.bounds?.boundsByName?.[ch] && state.bounds?.ranges) {
    const b = state.bounds.boundsByName[ch];
    const min = state.bounds.ranges.min[ch];
    const max = state.bounds.ranges.max[ch];
    if (Number.isFinite(min) && Number.isFinite(max) && Array.isArray(b)) {
      const midN = (b[0] + b[1]) / 2;
      return min + midN * (max - min);
    }
  }
  const range = meta.ranges || csRanges[meta.wheelSpace];
  return (range.min[ch] + range.max[ch]) / 2;
}

function maybeProject(vals, meta) {
  if (!meta.clipToGamut) return vals;
  try {
    const gamut = GAMUTS[meta.gamutPreset] || GAMUTS["srgb"];
    const xyz = convertColorValues(vals, meta.wheelSpace, "xyz");
    const lin = gamut.fromXYZ(xyz.x, xyz.y, xyz.z);
    const inGamut = lin.r >= 0 && lin.r <= 1 && lin.g >= 0 && lin.g <= 1 && lin.b >= 0 && lin.b <= 1;
    return inGamut ? vals : projectToGamut(vals, meta.wheelSpace, meta.gamutPreset, meta.wheelSpace);
  } catch (e) {
    return vals;
  }
}

function maybeProjectWithFlag(vals, meta, flag) {
  if (!meta.clipToGamut) return vals;
  try {
    const gamut = GAMUTS[meta.gamutPreset] || GAMUTS["srgb"];
    const xyz = convertColorValues(vals, meta.wheelSpace, "xyz");
    const lin = gamut.fromXYZ(xyz.x, xyz.y, xyz.z);
    const inGamut = lin.r >= 0 && lin.r <= 1 && lin.g >= 0 && lin.g <= 1 && lin.b >= 0 && lin.b <= 1;
    if (inGamut) return vals;
    if (flag) flag.projected = true;
    return projectToGamut(vals, meta.wheelSpace, meta.gamutPreset, meta.wheelSpace);
  } catch (e) {
    return vals;
  }
}

function pointToValues(meta, ui, state, x, y, baseVals = null, projectionFlag = null) {
  const space = meta.wheelSpace;
  const ranges = meta.ranges || csRanges[space];
  const thirdKey = thirdKeyForMeta(meta);
  const thirdVal = baseVals?.[thirdKey] ?? midpointForChannel(ui, state, meta, thirdKey);
  if (meta.isRectWheel && meta.rectKeys) {
    const xKey = meta.rectKeys.x;
    const yKey = meta.rectKeys.y;
    const maxX = Math.max(Math.abs(ranges.min[xKey] || 0), Math.abs(ranges.max[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges.min[yKey] || 0), Math.abs(ranges.max[yKey] || 0)) || 1;
    const nx = clampRange((x - meta.cx) / meta.radius, -1, 1);
    const ny = clampRange((meta.cy - y) / meta.radius, -1, 1);
    const v = {
      [xKey]: nx * maxX,
      [yKey]: ny * maxY,
      [thirdKey]: thirdVal,
    };
    return projectionFlag ? maybeProjectWithFlag(v, meta, projectionFlag) : maybeProject(v, meta);
  }

  // Polar wheel.
  const channels = channelOrder[space] || [];
  const scKey = channels.find((c) => c === "s" || c === "c") || "c";
  const dx = x - meta.cx;
  const dy = y - meta.cy;
  const dist = Math.hypot(dx, dy);
  const rNorm = clamp01(dist / meta.radius);
  const hueDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const maxSC = scKey === "s" ? ranges.max.s : ranges.max.c;
  const scVal = rNorm * Math.max(maxSC, 1e-6);
  const v = {
    h: hueDeg,
    [scKey]: scVal,
    [thirdKey]: thirdVal,
  };
  return projectionFlag ? maybeProjectWithFlag(v, meta, projectionFlag) : maybeProject(v, meta);
}

function hitPoint(refs, x, y, role = null) {
  const pts = refs.wheelPoints || [];
  let hit = null;
  let best = Infinity;
  pts.forEach((p) => {
    if (role && p.role !== role) return;
    const dx = x - p.x;
    const dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= HIT_RADIUS && d < best) {
      best = d;
      hit = p;
    }
  });
  return hit;
}

function updateOutputColor(state, ui, plotOrder, idx, vals, space) {
  if (!Number.isFinite(idx)) return;
  const hex = encodeColor(vals, space);
  if (!state.newColors) state.newColors = [];
  if (!state.rawNewColors) state.rawNewColors = [];
  state.newColors[idx] = hex;
  state.rawNewColors[idx] = { ...vals };
  state.newRawSpace = space;
  setResults(state.newColors, ui);
  const viz = currentVizOpts(ui);
  refreshSwatches(ui, state, plotOrder, ui.colorwheelSpace.value, ui.colorSpace.value, ui.gamutMode?.value, viz);
  setStatusState(ui, "Outputs edited", { stale: true });
}

function hueArcStats(values) {
  if (!values.length) return { arcSpan: 1, center: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const extended = sorted.concat([sorted[0] + 1]);
  let maxGap = -1;
  let gapStart = sorted[0];
  for (let i = 0; i < sorted.length; i++) {
    const gap = extended[i + 1] - extended[i];
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = extended[i];
    }
  }
  const arcSpan = 1 - maxGap;
  const arcStart = (gapStart + maxGap) % 1;
  const center = (arcStart + arcSpan / 2) % 1;
  return { arcSpan, center };
}

function hueDistance(a, b) {
  const d = Math.abs(((a - b + 0.5) % 1) - 0.5);
  return d;
}

function constraintHit(meta, ui, state, x, y) {
  if (!state.bounds || ui.colorSpace.value !== meta.wheelSpace) return null;
  const bounds = state.bounds.boundsByName || {};
  const baseRange = state.bounds.ranges || csRanges[meta.wheelSpace];
  const channels = channelOrder[meta.wheelSpace] || [];
  if (meta.isRectWheel && meta.rectKeys) {
    const xKey = meta.rectKeys.x;
    const yKey = meta.rectKeys.y;
    const bx = bounds[xKey];
    const by = bounds[yKey];
    if (!bx || !by) return null;
    const maxX = Math.max(Math.abs(meta.ranges.min[xKey] || 0), Math.abs(meta.ranges.max[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(meta.ranges.min[yKey] || 0), Math.abs(meta.ranges.max[yKey] || 0)) || 1;
    const toVal = (bnd, min, max) => min + bnd * (max - min);
    const xMin = toVal(bx[0], baseRange.min[xKey], baseRange.max[xKey]);
    const xMax = toVal(bx[1], baseRange.min[xKey], baseRange.max[xKey]);
    const yMin = toVal(by[0], baseRange.min[yKey], baseRange.max[yKey]);
    const yMax = toVal(by[1], baseRange.min[yKey], baseRange.max[yKey]);
    const x0 = meta.cx + clampRange(xMin / maxX, -1, 1) * meta.radius;
    const x1 = meta.cx + clampRange(xMax / maxX, -1, 1) * meta.radius;
    const y0 = meta.cy - clampRange(yMax / maxY, -1, 1) * meta.radius;
    const y1 = meta.cy - clampRange(yMin / maxY, -1, 1) * meta.radius;
    const withinY = y >= Math.min(y0, y1) - EDGE_HIT && y <= Math.max(y0, y1) + EDGE_HIT;
    const withinX = x >= Math.min(x0, x1) - EDGE_HIT && x <= Math.max(x0, x1) + EDGE_HIT;
    const nearX0 = Math.abs(x - x0) <= EDGE_HIT && withinY;
    const nearX1 = Math.abs(x - x1) <= EDGE_HIT && withinY;
    const nearY0 = Math.abs(y - y0) <= EDGE_HIT && withinX;
    const nearY1 = Math.abs(y - y1) <= EDGE_HIT && withinX;
    if (nearX0 || nearX1 || nearY0 || nearY1) {
      return {
        kind: "rect",
        xKey,
        yKey,
        xEdge: nearX0 ? "min" : nearX1 ? "max" : null,
        yEdge: nearY0 ? "max" : nearY1 ? "min" : null,
      };
    }
    return null;
  }

  // Polar constraints (hue / s-c).
  const scKey = channels.find((c) => c === "s" || c === "c");
  const bSc = scKey ? bounds[scKey] : null;
  const bH = state.bounds.boundsH;
  const candidates = [];
  const dx = x - meta.cx;
  const dy = y - meta.cy;
  const dist = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);

  if (bSc && scKey) {
    const maxSC = scKey === "s" ? meta.ranges.max.s : meta.ranges.max.c;
    const toVal = (bnd, min, max) => min + bnd * (max - min);
    const scMin = toVal(bSc[0], baseRange.min[scKey], baseRange.max[scKey]);
    const scMax = toVal(bSc[1], baseRange.min[scKey], baseRange.max[scKey]);
    const rMin = clamp01(scMin / Math.max(maxSC, 1e-6)) * meta.radius;
    const rMax = clamp01(scMax / Math.max(maxSC, 1e-6)) * meta.radius;
    const dMin = Math.abs(dist - rMin);
    const dMax = Math.abs(dist - rMax);
    if (dMin <= EDGE_HIT) candidates.push({ kind: "polar", type: "sc", edge: "min", dist: dMin });
    if (dMax <= EDGE_HIT) candidates.push({ kind: "polar", type: "sc", edge: "max", dist: dMax });
  }

  if (bH && Array.isArray(bH)) {
    const tau = Math.PI * 2;
    const normEdge = (v) => ((v % 1) + 1) % 1;
    const angleTol = Math.asin(Math.min(EDGE_HIT / Math.max(dist, 1), 1));
    const edges = [
      { edge: "min", angle: normEdge(bH[0]) * tau },
      { edge: "max", angle: normEdge(bH[1]) * tau },
    ];
    edges.forEach((e) => {
      const diff = Math.abs((((angle - e.angle + Math.PI) % tau) + tau) % tau - Math.PI);
      if (diff <= angleTol) candidates.push({ kind: "polar", type: "hue", edge: e.edge, dist: diff * dist });
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0];
}

function barConstraintHit(barObj, ui, state, evt) {
  if (!barObj?.meta) return null;
  const { barSpace, cfg, ranges, hueBarOffsetDeg } = barObj.meta;
  if (!state.bounds || ui.colorSpace.value !== barSpace) return null;
  const bounds = state.bounds.boundsByName || {};
  const baseRange = state.bounds.ranges || csRanges[barSpace];
  const rect = barObj.bar.getBoundingClientRect();
  const t = clamp01((evt.clientY - rect.top) / rect.height);
  const tol = EDGE_HIT / Math.max(rect.height, 1);
  if (cfg.key === "h") {
    const bH = state.bounds.boundsH;
    if (!bH || !Array.isArray(bH)) return null;
    const hueRange = ranges.max.h - ranges.min.h || 360;
    const hueBarOffsetNorm = hueBarOffsetDeg / hueRange;
    let low = (bH[0] - hueBarOffsetNorm + 1) % 1;
    let high = (bH[1] - hueBarOffsetNorm + 1) % 1;
    const span = (high - low + 1) % 1 || 1;
    if (span >= 0.999) return null;
    const edges = [];
    if (high < low) {
      edges.push({ edge: "min", pos: low });
      edges.push({ edge: "max", pos: high });
    } else {
      edges.push({ edge: "min", pos: low });
      edges.push({ edge: "max", pos: high });
    }
    let closest = null;
    edges.forEach((e) => {
      const d = Math.abs(t - e.pos);
      if (d <= tol && (!closest || d < closest.dist)) {
        closest = { ...e, dist: d, kind: "hue" };
      }
    });
    return closest;
  }
  const b = bounds[cfg.key];
  if (!b || (b[0] <= 0 && b[1] >= 1)) return null;
  const denom = Math.max(baseRange.max[cfg.key] - baseRange.min[cfg.key], 1e-6);
  const toBar = (bnd) => {
    const val = baseRange.min[cfg.key] + bnd * denom;
    return clamp01((val - cfg.min) / Math.max(cfg.max - cfg.min, 1e-6));
  };
  const edges = [
    { edge: "min", pos: toBar(b[0]) },
    { edge: "max", pos: toBar(b[1]) },
  ];
  let closest = null;
  edges.forEach((e) => {
    const d = Math.abs(t - e.pos);
    if (d <= tol && (!closest || d < closest.dist)) {
      closest = { ...e, dist: d, kind: "linear" };
    }
  });
  return closest;
}

function updateBarConstraintFromPointer(ui, state, barObj, hit, evt) {
  if (!hit || !barObj?.meta) return;
  const { barSpace, cfg, ranges, hueBarOffsetDeg } = barObj.meta;
  const rect = barObj.bar.getBoundingClientRect();
  const t = clamp01((evt.clientY - rect.top) / rect.height);
  const palette = getPaletteHexes(ui);
  const values = getInputOverrideValues(state, ui, barSpace);
  const baseRange = state.bounds?.ranges || csRanges[barSpace];

  if (cfg.key === "h") {
    const span = cfg.max - cfg.min || 360;
    const hVal = (t * span + cfg.min + hueBarOffsetDeg) % span;
    const hueDenom = Math.max(baseRange.max.h - baseRange.min.h, 1e-6);
    const hueNorm = clamp01((hVal - baseRange.min.h) / hueDenom);
    let arcSpan = 1;
    let center = hueNorm;
    if (values.length) {
      const hues = values
        .map((v) => normalizeWithRange(v, baseRange, barSpace).h)
        .filter((v) => Number.isFinite(v));
      if (hues.length) {
        ({ arcSpan, center } = hueArcStats(hues));
      }
    } else if (Array.isArray(state.bounds?.boundsH)) {
      const spanNorm = (state.bounds.boundsH[1] - state.bounds.boundsH[0] + 1) % 1 || 1;
      arcSpan = spanNorm;
      center = (state.bounds.boundsH[0] + spanNorm / 2) % 1;
    }
    const delta = hueDistance(hueNorm, center);
    const desiredSpan = clampRange(2 * delta, 0, 1);
    const width = arcSpan >= 0.999 ? 1 - desiredSpan : (1 - clampRange(desiredSpan, arcSpan, 1)) / (1 - arcSpan);
    setWidthForChannel(ui, barSpace, "h", width);
    return;
  }

  const stats = paletteChannelStats(barSpace, cfg.key, palette, baseRange, values);
  if (stats) {
    const denom = Math.max(baseRange.max[cfg.key] - baseRange.min[cfg.key], 1e-6);
    const val = cfg.min + t * (cfg.max - cfg.min);
    const norm = clamp01((val - baseRange.min[cfg.key]) / denom);
    const target = hit.edge === "min" ? Math.min(norm, stats.min) : Math.max(norm, stats.max);
    const width = hit.edge === "min"
      ? (stats.min <= 1e-6 ? 0 : target / stats.min)
      : (stats.max >= 1 - 1e-6 ? 0 : (1 - target) / (1 - stats.max));
    setWidthForChannel(ui, barSpace, cfg.key, width);
  }
}

function updateConstraintFromPointer(ui, state, meta, hit, x, y) {
  if (!hit) return;
  const space = meta.wheelSpace;
  const palette = getPaletteHexes(ui);
  const values = getInputOverrideValues(state, ui, space);
  const baseRange = state.bounds?.ranges || csRanges[space];

  if (hit.kind === "rect") {
    const maxX = Math.max(Math.abs(meta.ranges.min[hit.xKey] || 0), Math.abs(meta.ranges.max[hit.xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(meta.ranges.min[hit.yKey] || 0), Math.abs(meta.ranges.max[hit.yKey] || 0)) || 1;
    const nx = clampRange((x - meta.cx) / meta.radius, -1, 1) * maxX;
    const ny = clampRange((meta.cy - y) / meta.radius, -1, 1) * maxY;
    const normX = clamp01((nx - baseRange.min[hit.xKey]) / Math.max(baseRange.max[hit.xKey] - baseRange.min[hit.xKey], 1e-6));
    const normY = clamp01((ny - baseRange.min[hit.yKey]) / Math.max(baseRange.max[hit.yKey] - baseRange.min[hit.yKey], 1e-6));
    if (hit.xEdge) {
      const stats = paletteChannelStats(space, hit.xKey, palette, baseRange, values);
      if (stats) {
        const target = hit.xEdge === "min" ? Math.min(normX, stats.min) : Math.max(normX, stats.max);
        const width = hit.xEdge === "min"
          ? (stats.min <= 1e-6 ? 0 : target / stats.min)
          : (stats.max >= 1 - 1e-6 ? 0 : (1 - target) / (1 - stats.max));
        setWidthForChannel(ui, space, hit.xKey, width);
      }
    }
    if (hit.yEdge) {
      const stats = paletteChannelStats(space, hit.yKey, palette, baseRange, values);
      if (stats) {
        const target = hit.yEdge === "min" ? Math.min(normY, stats.min) : Math.max(normY, stats.max);
        const width = hit.yEdge === "min"
          ? (stats.min <= 1e-6 ? 0 : target / stats.min)
          : (stats.max >= 1 - 1e-6 ? 0 : (1 - target) / (1 - stats.max));
        setWidthForChannel(ui, space, hit.yKey, width);
      }
    }
    return;
  }

  if (hit.kind === "polar") {
    const channels = channelOrder[space] || [];
    const scKey = channels.find((c) => c === "s" || c === "c") || "c";
    const dx = x - meta.cx;
    const dy = y - meta.cy;
    const dist = Math.hypot(dx, dy);
    const rNorm = clamp01(dist / meta.radius);
    const hueNorm = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 / 360;

    if (hit.type === "sc") {
      const maxSC = scKey === "s" ? meta.ranges.max.s : meta.ranges.max.c;
      const scVal = rNorm * Math.max(maxSC, 1e-6);
      const norm = clamp01((scVal - baseRange.min[scKey]) / Math.max(baseRange.max[scKey] - baseRange.min[scKey], 1e-6));
      const stats = paletteChannelStats(space, scKey, palette, baseRange, values);
      if (stats) {
        const target = hit.edge === "min" ? Math.min(norm, stats.min) : Math.max(norm, stats.max);
        const width = hit.edge === "min"
          ? (stats.min <= 1e-6 ? 0 : target / stats.min)
          : (stats.max >= 1 - 1e-6 ? 0 : (1 - target) / (1 - stats.max));
        setWidthForChannel(ui, space, scKey, width);
      }
      return;
    }

    if (hit.type === "hue") {
      const stats = paletteChannelStats(space, "h", palette, baseRange, values);
      if (!stats) return;
      let arcSpan = 1;
      let center = hueNorm;
      if (values.length) {
        const hues = values
          .map((v) => normalizeWithRange(v, baseRange, space).h)
          .filter((v) => Number.isFinite(v));
        if (hues.length) {
          ({ arcSpan, center } = hueArcStats(hues));
        }
      } else if (Array.isArray(state.bounds?.boundsH)) {
        const span = (state.bounds.boundsH[1] - state.bounds.boundsH[0] + 1) % 1 || 1;
        arcSpan = span;
        center = (state.bounds.boundsH[0] + span / 2) % 1;
      }
      const delta = hueDistance(hueNorm, center);
      const desiredSpan = clampRange(2 * delta, 0, 1);
      const width = arcSpan >= 0.999 ? 1 - desiredSpan : (1 - clampRange(desiredSpan, arcSpan, 1)) / (1 - arcSpan);
      setWidthForChannel(ui, space, "h", width);
    }
  }
}

export function attachVisualizationInteractions(ui, state, plotOrder) {
  const drag = {
    active: false,
    mode: null,
    refs: null,
    index: null,
    role: null,
    barObj: null,
    startX: 0,
    startY: 0,
    moved: false,
    constraint: null,
    raf: null,
    suppressClick: false,
  };

  const applyDragUpdate = (refs, x, y) => {
    const meta = refs.wheelMeta;
    if (!meta) return;
    if (drag.mode === "constraint") {
      updateConstraintFromPointer(ui, state, meta, drag.constraint, x, y);
      return;
    }
    if (drag.mode !== "color" && drag.mode !== "output") return;
    if (drag.index == null) return;
    const space = meta.wheelSpace;
    if (drag.mode === "output") {
      const baseHex = state.newColors?.[drag.index];
      if (!baseHex) return;
      const baseVals = decodeColor(baseHex, space);
      const vals = pointToValues(meta, ui, state, x, y, baseVals);
      updateOutputColor(state, ui, plotOrder, drag.index, vals, space);
      return;
    }
    const palette = getPaletteHexes(ui);
    if (!palette.length) return;
    const overrideVals = getInputOverrideValues(state, ui, space);
    const baseVals = overrideVals[drag.index] || decodeColor(palette[drag.index], space);
    const vals = pointToValues(meta, ui, state, x, y, baseVals);
    const hex = encodeColor(vals, space);
    overrideVals[drag.index] = { ...vals };
    setInputOverride(state, ui, space, overrideVals);
    replacePaletteIndex(ui, state, drag.index, hex);
  };

  const onPointerDown = (evt, refs) => {
    const meta = refs.wheelMeta;
    if (!meta) return;
    const rect = refs.canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    drag.suppressClick = false;
    drag.active = true;
    drag.startX = x;
    drag.startY = y;
    drag.moved = false;
    drag.refs = refs;

    const hitConstraint = constraintHit(meta, ui, state, x, y);
    if (hitConstraint) {
      drag.mode = "constraint";
      drag.constraint = hitConstraint;
      drag.role = null;
      drag.index = null;
      if (hitConstraint.kind === "polar") {
        const baseAngle = Math.atan2(y - meta.cy, x - meta.cx);
        const angle = hitConstraint.type === "hue" ? baseAngle + Math.PI / 2 : baseAngle;
        refs.canvas.style.cursor = radialCursor(angle);
      } else {
        refs.canvas.style.cursor = "grabbing";
      }
      refs.canvas.setPointerCapture?.(evt.pointerId);
      evt.preventDefault();
      return;
    }

    const hitInput = hitPoint(refs, x, y, "input");
    if (hitInput) {
      drag.mode = "color";
      drag.index = hitInput.index;
      drag.role = "input";
      refs.canvas.style.cursor = "grabbing";
      refs.canvas.setPointerCapture?.(evt.pointerId);
      evt.preventDefault();
      return;
    }
    const hitOutput = hitPoint(refs, x, y, "output");
    if (hitOutput) {
      drag.mode = "output";
      drag.index = hitOutput.index;
      drag.role = "output";
      refs.canvas.style.cursor = "grabbing";
      refs.canvas.setPointerCapture?.(evt.pointerId);
      evt.preventDefault();
      return;
    }

    drag.mode = "add";
    drag.index = null;
    drag.role = null;
    refs.canvas.setPointerCapture?.(evt.pointerId);
    evt.preventDefault();
  };

  const onPointerMove = (evt, refs) => {
    const meta = refs.wheelMeta;
    if (!meta) return;
    const rect = refs.canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (drag.active && drag.refs === refs) {
      const dx = Math.abs(x - drag.startX);
      const dy = Math.abs(y - drag.startY);
      if (dx + dy > 2) drag.moved = true;
      if (drag.mode === "color" || drag.mode === "output" || drag.mode === "constraint") {
        if (!drag.raf) {
          drag.raf = requestAnimationFrame(() => {
            drag.raf = null;
            applyDragUpdate(refs, x, y);
          });
        }
        if (drag.mode === "constraint" && drag.constraint?.kind === "polar") {
          const baseAngle = Math.atan2(y - meta.cy, x - meta.cx);
          const angle = drag.constraint.type === "hue" ? baseAngle + Math.PI / 2 : baseAngle;
          refs.canvas.style.cursor = radialCursor(angle);
        }
        evt.preventDefault();
        return;
      }
      return;
    }

    const hitConstraint = constraintHit(meta, ui, state, x, y);
    if (hitConstraint) {
      if (hitConstraint.kind === "polar") {
        const baseAngle = Math.atan2(y - meta.cy, x - meta.cx);
        const angle = hitConstraint.type === "hue" ? baseAngle + Math.PI / 2 : baseAngle;
        refs.canvas.style.cursor = radialCursor(angle);
      } else {
        const cursor =
          hitConstraint.kind === "rect" && hitConstraint.xEdge && hitConstraint.yEdge
            ? ((hitConstraint.xEdge === "min" && hitConstraint.yEdge === "max") ||
               (hitConstraint.xEdge === "max" && hitConstraint.yEdge === "min")
              ? "nwse-resize"
              : "nesw-resize")
            : hitConstraint.kind === "rect" && hitConstraint.xEdge ? "ew-resize"
            : hitConstraint.kind === "rect" && hitConstraint.yEdge ? "ns-resize"
            : hitConstraint.type === "hue" ? "col-resize"
            : "row-resize";
        refs.canvas.style.cursor = cursor;
      }
      return;
    }

    const hitInput = hitPoint(refs, x, y, "input");
    const hitOutput = hitPoint(refs, x, y, "output");
    if (hitInput || hitOutput) {
      refs.canvas.style.cursor = "grab";
      return;
    }
    refs.canvas.style.cursor = "crosshair";
  };

  const onPointerUp = (evt, refs) => {
    if (!drag.active || drag.refs !== refs) return;
    const meta = refs.wheelMeta;
    drag.active = false;
    refs.canvas.releasePointerCapture?.(evt.pointerId);

    const rect = refs.canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    if (drag.mode === "color") {
      if (!drag.moved) {
        if (state.rawInputOverride?.space === meta?.wheelSpace && Array.isArray(state.rawInputOverride.values)) {
          state.rawInputOverride.values.splice(drag.index, 1);
          if (!state.rawInputOverride.values.length) state.rawInputOverride = null;
          else state.keepInputOverride = true;
          syncRawInputField(ui, state);
        }
        removePaletteIndex(ui, state, drag.index);
      }
      drag.mode = null;
      drag.index = null;
      drag.role = null;
      refs.canvas.style.cursor = "crosshair";
      return;
    }
    if (drag.mode === "output") {
      drag.mode = null;
      drag.index = null;
      drag.role = null;
      refs.canvas.style.cursor = "crosshair";
      return;
    }

    if (drag.mode === "constraint") {
      drag.mode = null;
      drag.constraint = null;
      drag.role = null;
      drag.index = null;
      refs.canvas.style.cursor = "crosshair";
      return;
    }

    if (drag.mode === "add" && meta) {
      const space = meta.wheelSpace;
      if (meta.isRectWheel) {
        const inside =
          x >= meta.cx - meta.radius &&
          x <= meta.cx + meta.radius &&
          y >= meta.cy - meta.radius &&
          y <= meta.cy + meta.radius;
        if (!inside) {
          drag.mode = null;
          refs.canvas.style.cursor = "crosshair";
          return;
        }
      } else {
        const dist = Math.hypot(x - meta.cx, y - meta.cy);
        if (dist > meta.radius) {
          drag.mode = null;
          refs.canvas.style.cursor = "crosshair";
          return;
        }
      }
      const projection = { projected: false };
      const vals = pointToValues(meta, ui, state, x, y, null, projection);
      if (projection.projected) {
        flashPanelMessage(refs, "Projecting to gamut...");
      }
      const hex = encodeColor(vals, space);
      const overrideVals = getInputOverrideValues(state, ui, space);
      overrideVals.push({ ...vals });
      setInputOverride(state, ui, space, overrideVals);
      appendPaletteHex(ui, state, hex);
    }
    drag.mode = null;
    drag.index = null;
    drag.role = null;
    refs.canvas.style.cursor = "crosshair";
  };

  const onWheel = (evt, refs) => {
    const meta = refs.wheelMeta;
    if (!meta) return;
    const rect = refs.canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const hitInput = hitPoint(refs, x, y, "input");
    const hitOutput = hitPoint(refs, x, y, "output");
    const hit = hitInput || hitOutput;
    if (!hit) return;
    evt.preventDefault();
    const space = meta.wheelSpace;
    const sourceHex = hit.role === "output" ? state.newColors?.[hit.index] : getPaletteHexes(ui)[hit.index];
    if (!sourceHex) return;
    const vals = decodeColor(sourceHex, space);
    const thirdKey = thirdKeyForMeta(meta);
    const range = meta.ranges || csRanges[space];
    const min = range.min[thirdKey];
    const max = range.max[thirdKey];
    const step = (max - min) * 0.03;
    const dir = evt.deltaY > 0 ? -1 : 1;
    vals[thirdKey] = clampRange((vals[thirdKey] ?? midpointForChannel(ui, state, meta, thirdKey)) + dir * step, min, max);
    const updatedVals = maybeProject(vals, meta);
    if (hit.role === "output") {
      updateOutputColor(state, ui, plotOrder, hit.index, updatedVals, space);
    } else {
      const updated = encodeColor(updatedVals, space);
      const overrideVals = getInputOverrideValues(state, ui, space);
      overrideVals[hit.index] = { ...updatedVals };
      setInputOverride(state, ui, space, overrideVals);
      replacePaletteIndex(ui, state, hit.index, updated);
    }
  };

  const onBarClick = (evt, barObj, refs) => {
    if (!barObj?.meta) return;
    if (drag.suppressClick) return;
    if (evt.target && evt.target.classList?.contains("channel-dot")) return;
    const { barSpace, ranges, cfg, hueBarOffsetDeg, clipToGamut, gamutPreset } = barObj.meta;
    const rect = barObj.bar.getBoundingClientRect();
    const t = clamp01((evt.clientY - rect.top) / rect.height);
    const vals = {};
    const thirdKey = thirdKeyForMeta({ wheelSpace: barSpace, ranges, isRectWheel: !channelOrder[barSpace]?.includes("h"), rectKeys: null });
    const thirdVal = midpointForChannel(ui, state, { wheelSpace: barSpace, ranges }, thirdKey);
    const channels = channelOrder[barSpace] || [];
    const scKey = channels.find((c) => c === "s" || c === "c");
    const otherKey = channels.find((c) => c !== cfg.key && c !== scKey && c !== "h") || thirdKey;

    if (cfg.key === "h") {
      const span = cfg.max - cfg.min || 360;
      const hVal = (t * span + cfg.min + hueBarOffsetDeg) % 360;
      vals.h = hVal;
      if (scKey) vals[scKey] = midpointForChannel(ui, state, { wheelSpace: barSpace, ranges }, scKey);
      vals[otherKey] = thirdVal;
    } else {
      vals[cfg.key] = cfg.min + t * (cfg.max - cfg.min);
      if (scKey && cfg.key !== scKey) vals[scKey] = midpointForChannel(ui, state, { wheelSpace: barSpace, ranges }, scKey);
      vals[otherKey] = thirdVal;
    }

    let finalVals = vals;
    if (clipToGamut) {
      const meta = { wheelSpace: barSpace, clipToGamut, gamutPreset };
      const projection = { projected: false };
      finalVals = maybeProjectWithFlag(vals, meta, projection);
      if (projection.projected) {
        flashPanelMessage(refs, "Projecting to gamut...");
      }
    }
    const hex = encodeColor(finalVals, barSpace);
    const overrideVals = getInputOverrideValues(state, ui, barSpace);
    overrideVals.push({ ...finalVals });
    setInputOverride(state, ui, barSpace, overrideVals);
    appendPaletteHex(ui, state, hex);
  };

  const updateBarDrag = (evt, barObj, refs) => {
    const { barSpace, ranges, cfg, hueBarOffsetDeg, clipToGamut, gamutPreset } = barObj.meta;
    const rect = barObj.bar.getBoundingClientRect();
    const t = clamp01((evt.clientY - rect.top) / rect.height);
    const space = barSpace;
    const role = drag.role;
    const index = drag.index;
    if (role !== "input" && role !== "output") return;
    const baseHex =
      role === "output" ? state.newColors?.[index] : getPaletteHexes(ui)[index];
    if (!baseHex) return;
    let vals = null;
    if (role === "output" && state.newRawSpace === space && state.rawNewColors?.[index]) {
      vals = { ...state.rawNewColors[index] };
    } else if (role === "input" && state.rawInputOverride?.space === space && state.rawInputOverride.values?.[index]) {
      vals = { ...state.rawInputOverride.values[index] };
    }
    if (!vals) vals = decodeColor(baseHex, space);
    if (cfg.key === "h") {
      const span = cfg.max - cfg.min || 360;
      vals.h = (t * span + cfg.min + hueBarOffsetDeg) % 360;
    } else {
      vals[cfg.key] = cfg.min + t * (cfg.max - cfg.min);
    }
    const meta = { wheelSpace: space, clipToGamut, gamutPreset };
    const finalVals = maybeProject(vals, meta);
    if (role === "output") {
      updateOutputColor(state, ui, plotOrder, index, finalVals, space);
    } else {
      const hex = encodeColor(finalVals, space);
      const overrideVals = getInputOverrideValues(state, ui, space);
      overrideVals[index] = { ...finalVals };
      setInputOverride(state, ui, space, overrideVals);
      replacePaletteIndex(ui, state, index, hex);
    }
  };

  const onBarPointerDown = (evt, barObj, refs) => {
    if (!barObj?.meta) return;
    const hitConstraint = barConstraintHit(barObj, ui, state, evt);
    if (hitConstraint) {
      drag.active = true;
      drag.mode = "bar-constraint";
      drag.refs = refs;
      drag.barObj = barObj;
      drag.constraint = hitConstraint;
      drag.suppressClick = false;
      drag.startX = evt.clientX;
      drag.startY = evt.clientY;
      barObj.bar.setPointerCapture?.(evt.pointerId);
      barObj.bar.style.cursor = "ns-resize";
      updateBarConstraintFromPointer(ui, state, barObj, hitConstraint, evt);
      evt.preventDefault();
      return;
    }
    const dot = evt.target?.classList?.contains("channel-dot") ? evt.target : null;
    if (!dot) return;
    const role = dot.dataset.role;
    const index = parseInt(dot.dataset.index, 10);
    if (!Number.isFinite(index)) return;
    drag.suppressClick = false;
    drag.active = true;
    drag.mode = "bar-color";
    drag.refs = refs;
    drag.barObj = barObj;
    drag.index = index;
    drag.role = role;
    drag.startX = evt.clientX;
    drag.startY = evt.clientY;
    drag.moved = false;
    barObj.bar.setPointerCapture?.(evt.pointerId);
    barObj.bar.style.cursor = "grabbing";
    updateBarDrag(evt, barObj, refs);
    evt.preventDefault();
  };

  const onBarPointerMove = (evt, barObj, refs) => {
    if (drag.active && drag.mode === "bar-constraint" && drag.barObj === barObj) {
      const dx = Math.abs(evt.clientX - drag.startX);
      const dy = Math.abs(evt.clientY - drag.startY);
      if (dx + dy > 2) drag.moved = true;
      updateBarConstraintFromPointer(ui, state, barObj, drag.constraint, evt);
      evt.preventDefault();
      return;
    }
    if (drag.active && drag.mode === "bar-color" && drag.barObj === barObj) {
      const dx = Math.abs(evt.clientX - drag.startX);
      const dy = Math.abs(evt.clientY - drag.startY);
      if (dx + dy > 2) drag.moved = true;
      updateBarDrag(evt, barObj, refs);
      evt.preventDefault();
      return;
    }
    const hitConstraint = barConstraintHit(barObj, ui, state, evt);
    if (hitConstraint) {
      barObj.bar.style.cursor = "ns-resize";
      return;
    }
    if (evt.target?.classList?.contains("channel-dot")) {
      barObj.bar.style.cursor = "grab";
    } else {
      barObj.bar.style.cursor = "crosshair";
    }
  };

  const onBarPointerUp = (evt, barObj, refs) => {
    if (!drag.active || (drag.mode !== "bar-color" && drag.mode !== "bar-constraint") || drag.barObj !== barObj) return;
    drag.active = false;
    drag.mode = null;
    drag.barObj = null;
    drag.index = null;
    drag.role = null;
    drag.constraint = null;
    barObj.bar.releasePointerCapture?.(evt.pointerId);
    barObj.bar.style.cursor = "crosshair";
    if (drag.moved) {
      drag.suppressClick = true;
      setTimeout(() => {
        drag.suppressClick = false;
      }, 0);
    }
  };

  plotOrder.forEach((type) => {
    const refs = ui.panelMap[type];
    if (!refs?.canvas) return;
    refs.canvas.style.cursor = "crosshair";
    refs.canvas.addEventListener("pointerdown", (evt) => onPointerDown(evt, refs));
    refs.canvas.addEventListener("pointermove", (evt) => onPointerMove(evt, refs));
    refs.canvas.addEventListener("pointerup", (evt) => onPointerUp(evt, refs));
    refs.canvas.addEventListener("pointerleave", (evt) => {
      if (!drag.active) refs.canvas.style.cursor = "crosshair";
    });
    refs.canvas.addEventListener("wheel", (evt) => onWheel(evt, refs), { passive: false });

    (refs.channelBars || []).forEach((barObj) => {
      barObj.bar.addEventListener("click", (evt) => onBarClick(evt, barObj, refs));
      barObj.bar.addEventListener("pointerdown", (evt) => onBarPointerDown(evt, barObj, refs));
      barObj.bar.addEventListener("pointermove", (evt) => onBarPointerMove(evt, barObj, refs));
      barObj.bar.addEventListener("pointerup", (evt) => onBarPointerUp(evt, barObj, refs));
      barObj.bar.addEventListener("pointerleave", () => {
        if (!drag.active) barObj.bar.style.cursor = "crosshair";
      });
    });
  });
}
