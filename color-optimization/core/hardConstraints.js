import {
  channelOrder,
  csRanges,
  isInGamut,
  normalizeWithRange,
  projectToGamut,
  unscaleWithRange,
} from "./colorSpaces.js";
import { clamp } from "./util.js";
import { activeConstraintSets } from "./activeConstraints.js";

const TAU = Math.PI * 2;

export function projectToGamutWithinHardConstraints(row, prep) {
  const space = prep.colorSpace;
  const gamutPreset = prep.gamutPreset || "srgb";
  const ranges = prep.ranges || csRanges[space];
  const rawConstraintSets = prep.bounds?.constraintSets;
  const rawTopology = prep.constraintTopology || rawConstraintSets?.topology || "contiguous";
  const constraintSets = activeConstraintSets(prep.bounds, prep) || rawConstraintSets;
  const topology = rawTopology;
  if (!ranges || !constraintSets?.channels) {
    return projectToGamut(row, space, gamutPreset, space);
  }

  const originalNorm = normalizeWithRange(row, ranges, space);
  let projected = projectToGamut(row, space, gamutPreset, space);
  let constrained = rawFromNorm(
    clampNormToHardConstraints(normalizeWithRange(projected, ranges, space), constraintSets, topology, originalNorm),
    ranges,
    space
  );
  if (isInGamut(constrained, space, gamutPreset)) return constrained;
  if (isInGamut(row, space, gamutPreset) && normSatisfiesHardConstraints(originalNorm, constraintSets, topology)) return row;

  for (let i = 0; i < 8; i++) {
    projected = projectToGamut(constrained, space, gamutPreset, space);
    constrained = rawFromNorm(
      clampNormToHardConstraints(normalizeWithRange(projected, ranges, space), constraintSets, topology, originalNorm),
      ranges,
      space
    );
    if (isInGamut(constrained, space, gamutPreset)) return constrained;
  }

  const anchor = rawFromNorm(hardConstraintAnchorNorm(originalNorm, constraintSets, topology), ranges, space);
  if (isInGamut(anchor, space, gamutPreset)) {
    let best = anchor;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2;
      const mid = interpolateRaw(anchor, constrained, t, space);
      const midNorm = normalizeWithRange(mid, ranges, space);
      if (isInGamut(mid, space, gamutPreset) && normSatisfiesHardConstraints(midNorm, constraintSets, topology)) {
        best = mid;
        lo = t;
      } else {
        hi = t;
      }
    }
    return best;
  }

  return constrained;
}

export function rawFromNorm(norm, ranges, space) {
  const wrapped = { ...norm };
  (channelOrder[space] || []).forEach((ch) => {
    if (ch === "h" && Number.isFinite(wrapped[ch])) wrapped[ch] = wrap01(wrapped[ch]);
    else if (Number.isFinite(wrapped[ch])) wrapped[ch] = clamp(wrapped[ch], 0, 1);
  });
  return unscaleWithRange(wrapped, ranges, space);
}

export function clampNormToHardConstraints(norm, constraintSets, topology, referenceNorm = norm) {
  if (!constraintSets?.channels) return { ...norm };
  if (topology === "custom" || topology === "discontiguous") {
    const idx = nearestHardPointWindowIndex(referenceNorm, constraintSets);
    return clampNormToPointWindow(norm, constraintSets, idx);
  }
  const out = { ...norm };
  Object.entries(constraintSets.channels).forEach(([ch, c]) => {
    if (!c || c.mode !== "hard") return;
    out[ch] = c.type === "hue"
      ? clampHueNormToIntervals(out[ch], c.intervalsRad)
      : clampLinearNormToIntervals(out[ch], c.intervals);
  });
  return out;
}

export function normSatisfiesHardConstraints(norm, constraintSets, topology) {
  return hardConstraintRegionIndex(norm, constraintSets, topology) != null;
}

export function hardConstraintRegionIndex(norm, constraintSets, topology, tolerance = 1e-8) {
  if (!constraintSets?.channels) return 0;
  if (topology === "custom" || topology === "discontiguous") {
    return containingHardPointWindowIndex(norm, constraintSets, tolerance);
  }
  const clamped = clampNormToHardConstraints(norm, constraintSets, topology, norm);
  return Object.keys(clamped).every((ch) => Math.abs((norm[ch] ?? 0) - (clamped[ch] ?? 0)) <= tolerance)
    ? 0
    : null;
}

export function hardConstraintAnchorNorm(norm, constraintSets, topology) {
  if (topology === "custom" || topology === "discontiguous") {
    const idx = nearestHardPointWindowIndex(norm, constraintSets);
    const out = clampNormToPointWindow(norm, constraintSets, idx);
    Object.entries(constraintSets.channels || {}).forEach(([ch, c]) => {
      if (!c || c.mode !== "hard" || !Array.isArray(c.pointWindows) || !c.pointWindows.length || idx == null) return;
      const w = c.pointWindows[idx % c.pointWindows.length];
      if (!w) return;
      out[ch] = c.type === "hue" ? wrap01(w.center / TAU) : clamp(w.center, 0, 1);
    });
    return out;
  }
  const out = clampNormToHardConstraints(norm, constraintSets, topology, norm);
  Object.entries(constraintSets.channels || {}).forEach(([ch, c]) => {
    if (!c || c.mode !== "hard") return;
    if (c.type === "hue" && Array.isArray(c.intervalsRad) && c.intervalsRad.length) {
      const [lo, hi] = c.intervalsRad[0];
      out[ch] = wrap01(((lo + hi) / 2) / TAU);
    } else if (Array.isArray(c.intervals) && c.intervals.length) {
      const [lo, hi] = c.intervals[0];
      out[ch] = clamp((lo + hi) / 2, 0, 1);
    }
  });
  return out;
}

export function nearestHardPointWindowIndex(norm, constraintSets) {
  return pointWindowIndex(norm, constraintSets, false);
}

export function containingHardPointWindowIndex(norm, constraintSets, tolerance = 1e-8) {
  return pointWindowIndex(norm, constraintSets, true, tolerance);
}

function pointWindowIndex(norm, constraintSets, requireInside, tolerance = 1e-8) {
  const channels = Object.keys(constraintSets.channels || {});
  let count = 0;
  channels.forEach((ch) => {
    const c = constraintSets.channels[ch];
    if (c?.mode === "hard" && Array.isArray(c.pointWindows)) {
      count = Math.max(count, c.pointWindows.length);
    }
  });
  if (!count) return 0;

  let bestIndex = null;
  let bestViolation = Infinity;
  let bestTie = Infinity;
  for (let i = 0; i < count; i++) {
    let violation = 0;
    let tie = 0;
    let used = false;
    channels.forEach((ch) => {
      const c = constraintSets.channels[ch];
      if (!c || c.mode !== "hard" || !Array.isArray(c.pointWindows) || !c.pointWindows.length) return;
      const w = c.pointWindows[i % c.pointWindows.length];
      if (!w) return;
      used = true;
      if (c.type === "hue") {
        const d = circularDistance(wrap01(norm[ch] ?? 0) * TAU, w.center);
        const excess = Math.max(0, d - Math.max(w.radius, 0));
        violation += excess * excess;
        tie += d * d;
        return;
      }
      const v = norm[ch];
      const min = Number.isFinite(w.min) ? w.min : Math.max(0, w.center - w.radius);
      const max = Number.isFinite(w.max) ? w.max : Math.min(1, w.center + w.radius);
      const excess = v < min ? min - v : v > max ? v - max : 0;
      violation += excess * excess;
      tie += Math.pow((v ?? 0.5) - w.center, 2);
    });
    if (used && (violation < bestViolation || (Math.abs(violation - bestViolation) <= 1e-12 && tie < bestTie))) {
      bestViolation = violation;
      bestTie = tie;
      bestIndex = i;
    }
  }
  if (requireInside && bestViolation > tolerance * tolerance) return null;
  return bestIndex;
}

function clampNormToPointWindow(norm, constraintSets, idx) {
  if (idx == null) return { ...norm };
  const out = { ...norm };
  Object.entries(constraintSets.channels || {}).forEach(([ch, c]) => {
    if (!c || c.mode !== "hard" || !Array.isArray(c.pointWindows) || !c.pointWindows.length) return;
    const w = c.pointWindows[idx % c.pointWindows.length];
    if (!w) return;
    if (c.type === "hue") {
      const phi = wrap01(out[ch] ?? 0) * TAU;
      const delta = wrapToPi(phi - w.center);
      const radius = Math.max(w.radius, 0);
      const clampedPhi = Math.abs(delta) <= radius ? phi : w.center + (delta >= 0 ? radius : -radius);
      out[ch] = wrap01(clampedPhi / TAU);
      return;
    }
    const min = Number.isFinite(w.min) ? w.min : Math.max(0, w.center - w.radius);
    const max = Number.isFinite(w.max) ? w.max : Math.min(1, w.center + w.radius);
    out[ch] = clamp(out[ch], min, max);
  });
  return out;
}

function clampLinearNormToIntervals(v, intervals) {
  const list = Array.isArray(intervals) && intervals.length ? intervals : [[0, 1]];
  const x = clamp(Number.isFinite(v) ? v : 0.5, 0, 1);
  if (list.some(([lo, hi]) => x >= lo - 1e-12 && x <= hi + 1e-12)) return x;
  let best = x;
  let bestDist = Infinity;
  list.forEach(([lo, hi]) => {
    [lo, hi].forEach((edge) => {
      const clamped = clamp(edge, 0, 1);
      const dist = Math.abs(x - clamped);
      if (dist < bestDist) {
        bestDist = dist;
        best = clamped;
      }
    });
  });
  return best;
}

function clampHueNormToIntervals(v, intervalsRad) {
  const list = Array.isArray(intervalsRad) && intervalsRad.length ? intervalsRad : [[0, TAU]];
  const phi = wrap01(Number.isFinite(v) ? v : 0) * TAU;
  if (list.some(([lo, hi]) => hueInInterval(phi, lo, hi))) return wrap01(phi / TAU);
  let bestPhi = phi;
  let bestDist = Infinity;
  list.forEach(([lo, hi]) => {
    [lo, hi].forEach((edge) => {
      const d = circularDistance(phi, edge);
      if (d < bestDist) {
        bestDist = d;
        bestPhi = edge;
      }
    });
  });
  return wrap01(bestPhi / TAU);
}

function hueInInterval(phi, lo, hi) {
  const span = hi - lo;
  if (span >= TAU - 1e-12) return true;
  let p = phi;
  while (p < lo) p += TAU;
  while (p > hi) p -= TAU;
  return p >= lo - 1e-12 && p <= hi + 1e-12;
}

function interpolateRaw(a, b, t, space) {
  const out = {};
  (channelOrder[space] || []).forEach((ch) => {
    if (ch === "h") {
      const span = csRanges[space].max.h - csRanges[space].min.h || 360;
      const aNorm = (a[ch] - csRanges[space].min.h) / span;
      const bNorm = (b[ch] - csRanges[space].min.h) / span;
      const delta = ((bNorm - aNorm + 0.5) % 1) - 0.5;
      out[ch] = csRanges[space].min.h + wrap01(aNorm + delta * t) * span;
    } else {
      out[ch] = (a[ch] ?? 0) + ((b[ch] ?? 0) - (a[ch] ?? 0)) * t;
    }
  });
  return out;
}

function wrap01(x) {
  return ((x % 1) + 1) % 1;
}

function wrapToPi(phi) {
  return ((phi + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function circularDistance(a, b) {
  const aNorm = ((a % TAU) + TAU) % TAU;
  const bNorm = ((b % TAU) + TAU) % TAU;
  const d = Math.abs(aNorm - bNorm);
  return Math.min(d, TAU - d);
}
