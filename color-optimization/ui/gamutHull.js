import { channelOrder, convertColorValues, csRanges, GAMUTS, isInGamut, projectToGamut } from "../core/colorSpaces.js";

const CUBE_EDGES = [
  [[0, 0, 0], [1, 0, 0]],
  [[0, 0, 0], [0, 1, 0]],
  [[0, 0, 0], [0, 0, 1]],
  [[1, 1, 1], [0, 1, 1]],
  [[1, 1, 1], [1, 0, 1]],
  [[1, 1, 1], [1, 1, 0]],
  [[1, 0, 0], [1, 1, 0]],
  [[1, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [1, 1, 0]],
  [[0, 1, 0], [0, 1, 1]],
  [[0, 0, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1]],
];

export function buildGamutHullPaths(gamutKey, vizSpace, toPoint, steps = 15) {
  const gamut = GAMUTS[gamutKey] || GAMUTS.srgb || GAMUTS["srgb"];
  if (!gamut || !toPoint) return [];
  return CUBE_EDGES.map(([a, b]) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = a[0] + (b[0] - a[0]) * t;
      const g = a[1] + (b[1] - a[1]) * t;
      const bl = a[2] + (b[2] - a[2]) * t;
      const xyz = gamut.toXYZ(r, g, bl);
      const vals = convertColorValues(xyz, "xyz", vizSpace);
      const pt = toPoint(vals);
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        pts.push({ x: pt.x, y: pt.y });
      }
    }
    return pts;
  }).filter((edge) => edge.length > 1);
}

export function strokeHull(ctx, paths) {
  if (!ctx || !paths?.length) return;
  const stroke = (width, color) => {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    paths.forEach((edge) => {
      ctx.beginPath();
      edge.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });
  };
  stroke(4, "rgba(255,255,255,0.95)");
  stroke(2, "rgba(15,23,42,0.9)");
}

export function strokeBoundary(ctx, boundary) {
  if (!ctx || !boundary?.length) return;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(boundary[0].x, boundary[0].y);
  for (let i = 1; i < boundary.length; i++) {
    ctx.lineTo(boundary[i].x, boundary[i].y);
  }
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(15,23,42,0.9)";
  ctx.stroke();
}

export function smoothBoundary(points, iterations = 2) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  let out = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const p0 = out[i];
      const p1 = out[(i + 1) % out.length];
      next.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25,
      });
      next.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75,
      });
    }
    out = next;
  }
  return out;
}

// Sample points on all 6 faces of the RGB cube (dense sampling for accurate hull)
const FACE_SAMPLES = (() => {
  const samples = [];
  const steps = 48; // Increased for better accuracy
  // Sample each face of the unit cube
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const u = i / steps;
      const v = j / steps;
      // 6 faces: fix each of R, G, B at 0 and 1
      samples.push([0, u, v], [1, u, v]); // R=0, R=1
      samples.push([u, 0, v], [u, 1, v]); // G=0, G=1
      samples.push([u, v, 0], [u, v, 1]); // B=0, B=1
    }
  }
  return samples;
})();

export function buildGamutBoundaryPoints(gamutKey, vizSpace, toPoint) {
  const gamut = GAMUTS[gamutKey] || GAMUTS.srgb || GAMUTS["srgb"];
  if (!gamut || !toPoint) return [];
  const points = [];
  for (const [r, g, b] of FACE_SAMPLES) {
    const xyz = gamut.toXYZ(r, g, b);
    const vals = convertColorValues(xyz, "xyz", vizSpace);
    const pt = toPoint(vals);
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      points.push({ x: pt.x, y: pt.y });
    }
  }
  return points;
}

export function buildGamutProjectionBoundary(space, gamutPreset, ranges, isRectWheel, rectKeys, steps = 360, lSteps = 24) {
  const channels = channelOrder[space] || [];
  const out = [];
  const lKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : channels[0] || "l";
  const lMin = ranges?.min?.[lKey] ?? csRanges[space]?.min?.[lKey] ?? 0;
  const lMax = ranges?.max?.[lKey] ?? csRanges[space]?.max?.[lKey] ?? 1;
  const lVals = Array.from({ length: Math.max(2, lSteps) }, (_, i) => lMin + (i / (lSteps - 1)) * (lMax - lMin));
  const lMid = lMin + 0.5 * (lMax - lMin);

  if (isRectWheel) {
    const xKey = rectKeys?.x || channels[1] || "a";
    const yKey = rectKeys?.y || channels[2] || "b";
    const maxX = Math.max(Math.abs(ranges?.min?.[xKey] || 0), Math.abs(ranges?.max?.[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges?.min?.[yKey] || 0), Math.abs(ranges?.max?.[yKey] || 0)) || 1;
    const maxR = Math.hypot(maxX, maxY);

    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      let bestR = 0;
      for (let li = 0; li < lVals.length; li++) {
        let lo = 0;
        let hi = maxR;
        const lVal = lVals[li];
        for (let iter = 0; iter < 12; iter++) {
          const mid = (lo + hi) / 2;
          const vals = {
            [lKey]: lVal,
            [xKey]: mid * Math.cos(ang),
            [yKey]: mid * Math.sin(ang),
          };
          if (isInGamut(vals, space, gamutPreset)) lo = mid;
          else hi = mid;
        }
        if (lo > bestR) bestR = lo;
      }
      out.push({
        [lKey]: lMid,
        [xKey]: bestR * Math.cos(ang),
        [yKey]: bestR * Math.sin(ang),
      });
    }
    return out;
  }

  const scKey = channels.find((c) => c === "s" || c === "c") || "c";
  const hKey = "h";
  const maxC = ranges?.max?.[scKey] ?? csRanges[space]?.max?.[scKey] ?? 1;

  for (let i = 0; i < steps; i++) {
    const hue = (i / steps) * 360;
    let bestC = 0;
    for (let li = 0; li < lVals.length; li++) {
      let lo = 0;
      let hi = maxC;
      const lVal = lVals[li];
      for (let iter = 0; iter < 12; iter++) {
        const mid = (lo + hi) / 2;
        const vals = { [hKey]: hue, [scKey]: mid, [lKey]: lVal };
        if (isInGamut(vals, space, gamutPreset)) lo = mid;
        else hi = mid;
      }
      if (lo > bestC) bestC = lo;
    }
    out.push({ [hKey]: hue, [scKey]: bestC, [lKey]: lMid });
  }

  return out;
}

export function buildGamutSliceBoundary(space, gamutPreset, ranges, isRectWheel, rectKeys, steps = 360) {
  const channels = channelOrder[space] || [];
  const out = [];
  const lKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : channels[0] || "l";
  const lMin = ranges?.min?.[lKey] ?? csRanges[space]?.min?.[lKey] ?? 0;
  const lMax = ranges?.max?.[lKey] ?? csRanges[space]?.max?.[lKey] ?? 1;
  const fixedLNorm = space === "hsl" ? 0.5 : 0.75;
  const lVal = lMin + fixedLNorm * (lMax - lMin);

  if (isRectWheel) {
    const xKey = rectKeys?.x || channels[1] || "a";
    const yKey = rectKeys?.y || channels[2] || "b";
    const maxX = Math.max(Math.abs(ranges?.min?.[xKey] || 0), Math.abs(ranges?.max?.[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges?.min?.[yKey] || 0), Math.abs(ranges?.max?.[yKey] || 0)) || 1;
    const maxR = Math.hypot(maxX, maxY);

    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      let lo = 0;
      let hi = maxR;
      for (let iter = 0; iter < 12; iter++) {
        const mid = (lo + hi) / 2;
        const vals = {
          [lKey]: lVal,
          [xKey]: mid * Math.cos(ang),
          [yKey]: mid * Math.sin(ang),
        };
        if (isInGamut(vals, space, gamutPreset)) lo = mid;
        else hi = mid;
      }
      out.push({
        [lKey]: lVal,
        [xKey]: lo * Math.cos(ang),
        [yKey]: lo * Math.sin(ang),
      });
    }
    return out;
  }

  const scKey = channels.find((c) => c === "s" || c === "c") || "c";
  const hKey = "h";
  const maxC = ranges?.max?.[scKey] ?? csRanges[space]?.max?.[scKey] ?? 1;

  for (let i = 0; i < steps; i++) {
    const hue = (i / steps) * 360;
    let lo = 0;
    let hi = maxC;
    for (let iter = 0; iter < 12; iter++) {
      const mid = (lo + hi) / 2;
      const vals = { [hKey]: hue, [scKey]: mid, [lKey]: lVal };
      if (isInGamut(vals, space, gamutPreset)) lo = mid;
      else hi = mid;
    }
    out.push({ [hKey]: hue, [scKey]: lo, [lKey]: lVal });
  }

  return out;
}

export function buildGamutProjectedBoundary(space, gamutPreset, ranges, isRectWheel, rectKeys, steps = 360, lSteps = 1) {
  const channels = channelOrder[space] || [];
  const out = [];
  const lKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : channels[0] || "l";
  const lMin = ranges?.min?.[lKey] ?? csRanges[space]?.min?.[lKey] ?? 0;
  const lMax = ranges?.max?.[lKey] ?? csRanges[space]?.max?.[lKey] ?? 1;
  const fixedLNorm = space === "hsl" ? 0.5 : 0.75;
  const lFixed = lMin + fixedLNorm * (lMax - lMin);
  const count = Math.max(1, lSteps);
  const lVals = count === 1
    ? [lFixed]
    : Array.from({ length: count }, (_, i) => lMin + (i / (count - 1)) * (lMax - lMin));

  if (isRectWheel) {
    const xKey = rectKeys?.x || channels[1] || "a";
    const yKey = rectKeys?.y || channels[2] || "b";
    const maxX = Math.max(Math.abs(ranges?.min?.[xKey] || 0), Math.abs(ranges?.max?.[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges?.min?.[yKey] || 0), Math.abs(ranges?.max?.[yKey] || 0)) || 1;
    const perSide = Math.max(2, Math.floor(steps / 4));
    const lerp = (a, b, t) => a + (b - a) * t;

    lVals.forEach((lVal) => {
      for (let i = 0; i < perSide; i++) {
        const t = perSide === 1 ? 0 : i / (perSide - 1);
        const vals = { [lKey]: lVal, [xKey]: lerp(-maxX, maxX, t), [yKey]: maxY };
        out.push(projectToGamut(vals, space, gamutPreset, space));
      }
      for (let i = 0; i < perSide; i++) {
        const t = perSide === 1 ? 0 : i / (perSide - 1);
        const vals = { [lKey]: lVal, [xKey]: maxX, [yKey]: lerp(maxY, -maxY, t) };
        out.push(projectToGamut(vals, space, gamutPreset, space));
      }
      for (let i = 0; i < perSide; i++) {
        const t = perSide === 1 ? 0 : i / (perSide - 1);
        const vals = { [lKey]: lVal, [xKey]: lerp(maxX, -maxX, t), [yKey]: -maxY };
        out.push(projectToGamut(vals, space, gamutPreset, space));
      }
      for (let i = 0; i < perSide; i++) {
        const t = perSide === 1 ? 0 : i / (perSide - 1);
        const vals = { [lKey]: lVal, [xKey]: -maxX, [yKey]: lerp(-maxY, maxY, t) };
        out.push(projectToGamut(vals, space, gamutPreset, space));
      }
    });
    return out;
  }

  const scKey = channels.find((c) => c === "s" || c === "c") || "c";
  const maxC = ranges?.max?.[scKey] ?? csRanges[space]?.max?.[scKey] ?? 1;

  lVals.forEach((lVal) => {
    for (let i = 0; i < steps; i++) {
      const hue = (i / steps) * 360;
      const vals = { h: hue, [scKey]: maxC, [lKey]: lVal };
      out.push(projectToGamut(vals, space, gamutPreset, space));
    }
  });

  return out;
}

export function buildGamutProjectedHull(space, gamutPreset, ranges, isRectWheel, rectKeys, toPoint, steps = 64, radialSteps = 32) {
  const channels = channelOrder[space] || [];
  const lKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : channels[0] || "l";
  const lMin = ranges?.min?.[lKey] ?? csRanges[space]?.min?.[lKey] ?? 0;
  const lMax = ranges?.max?.[lKey] ?? csRanges[space]?.max?.[lKey] ?? 1;
  const fixedLNorm = space === "hsl" ? 0.5 : 0.75;
  const lVal = lMin + fixedLNorm * (lMax - lMin);
  const points = [];

  if (isRectWheel) {
    const xKey = rectKeys?.x || channels[1] || "a";
    const yKey = rectKeys?.y || channels[2] || "b";
    const maxX = Math.max(Math.abs(ranges?.min?.[xKey] || 0), Math.abs(ranges?.max?.[xKey] || 0)) || 1;
    const maxY = Math.max(Math.abs(ranges?.min?.[yKey] || 0), Math.abs(ranges?.max?.[yKey] || 0)) || 1;
    const stepsX = Math.max(4, steps);
    const stepsY = Math.max(4, steps);
    const lerp = (a, b, t) => a + (b - a) * t;

    for (let yi = 0; yi <= stepsY; yi++) {
      const ty = yi / stepsY;
      const yVal = lerp(maxY, -maxY, ty);
      for (let xi = 0; xi <= stepsX; xi++) {
        const tx = xi / stepsX;
        const xVal = lerp(-maxX, maxX, tx);
        const vals = { [lKey]: lVal, [xKey]: xVal, [yKey]: yVal };
        const projected = projectToGamut(vals, space, gamutPreset, space);
        const pt = toPoint(projected);
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          points.push({ x: pt.x, y: pt.y });
        }
      }
    }
  } else {
    const scKey = channels.find((c) => c === "s" || c === "c") || "c";
    const maxC = ranges?.max?.[scKey] ?? csRanges[space]?.max?.[scKey] ?? 1;
    const tSteps = Math.max(12, steps);
    const rSteps = Math.max(6, radialSteps);

    for (let ti = 0; ti <= tSteps; ti++) {
      const hue = (ti / tSteps) * 360;
      for (let ri = 0; ri <= rSteps; ri++) {
        const rNorm = ri / rSteps;
        const vals = { h: hue, [scKey]: rNorm * maxC, [lKey]: lVal };
        const projected = projectToGamut(vals, space, gamutPreset, space);
        const pt = toPoint(projected);
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          points.push({ x: pt.x, y: pt.y });
        }
      }
    }
  }

  return convexHull(points);
}

function lightnessKey(space) {
  const ch = channelOrder[space] || [];
  if (ch.includes("l")) return "l";
  if (ch.includes("jz")) return "jz";
  return ch[0] || "l";
}

// Build a convex hull of the gamut projected to 2D for clipping
export function buildGamutClipPath(gamutKey, vizSpace, toPoint) {
  const gamut = GAMUTS[gamutKey] || GAMUTS.srgb || GAMUTS["srgb"];
  if (!gamut || !toPoint) return null;

  // Project all face samples to 2D
  const points = [];
  for (const [r, g, b] of FACE_SAMPLES) {
    const xyz = gamut.toXYZ(r, g, b);
    const vals = convertColorValues(xyz, "xyz", vizSpace);
    const pt = toPoint(vals);
    if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
      points.push({ x: pt.x, y: pt.y });
    }
  }

  if (points.length < 3) return null;

  // Compute 2D convex hull using Graham scan
  return convexHull(points);
}

// Graham scan convex hull algorithm
export function convexHull(points) {
  if (points.length < 3) return points;

  // Find the point with lowest y (and leftmost if tie)
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y < points[start].y ||
        (points[i].y === points[start].y && points[i].x < points[start].x)) {
      start = i;
    }
  }
  const pivot = points[start];

  // Sort points by polar angle with respect to pivot
  const sorted = points
    .filter((_, i) => i !== start)
    .map((p) => ({ p, angle: Math.atan2(p.y - pivot.y, p.x - pivot.x) }))
    .sort((a, b) => a.angle - b.angle || dist2(pivot, a.p) - dist2(pivot, b.p))
    .map((o) => o.p);

  // Build hull
  const hull = [pivot];
  for (const p of sorted) {
    while (hull.length > 1 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
      hull.pop();
    }
    hull.push(p);
  }

  return hull;
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function dist2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// Apply gamut clip path to context
export function applyGamutClip(ctx, hull) {
  if (!hull || hull.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) {
    ctx.lineTo(hull[i].x, hull[i].y);
  }
  ctx.closePath();
  ctx.clip();
}

// Build the outer boundary of the gamut from hull edge paths
// Traces along the actual curved edges (not straight lines between vertices)
// Uses dense angular sampling to follow the curves precisely
export function buildGamutOuterBoundary(pointsOrPaths, cx, cy, expandPx = 0) {
  if (!pointsOrPaths || !pointsOrPaths.length) return null;

  // Collect all points from all edge paths with their polar coordinates
  const allPoints = [];
  const first = pointsOrPaths[0];
  const isPointList = first && Number.isFinite(first.x) && Number.isFinite(first.y);
  if (isPointList) {
    pointsOrPaths.forEach((pt) => {
      if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI * 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        allPoints.push({ x: pt.x, y: pt.y, angle, dist });
      }
    });
  } else {
    for (const edge of pointsOrPaths) {
      for (const pt of edge) {
        if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          const dx = pt.x - cx;
          const dy = pt.y - cy;
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += Math.PI * 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          allPoints.push({ x: pt.x, y: pt.y, angle, dist });
        }
      }
    }
  }

  if (allPoints.length < 3) return null;

  // Sort all points by angle
  allPoints.sort((a, b) => a.angle - b.angle);

  // Use very fine angular slices to capture curve detail
  // Keep the outermost radius in each slice
  const numSlices = 900; // ~0.4 degree resolution
  const sliceSize = (Math.PI * 2) / numSlices;
  const maxDistBySlice = Array.from({ length: numSlices }, () => null);

  for (const pt of allPoints) {
    const idx = Math.min(numSlices - 1, Math.floor(pt.angle / sliceSize));
    const existing = maxDistBySlice[idx];
    if (existing == null || pt.dist > existing) {
      maxDistBySlice[idx] = pt.dist;
    }
  }

  const filledCount = maxDistBySlice.reduce((acc, d) => acc + (d != null ? 1 : 0), 0);
  if (filledCount < 3) return null;

  // Interpolate missing slices using neighboring max distances.
  const tau = Math.PI * 2;
  for (let i = 0; i < numSlices; i++) {
    if (maxDistBySlice[i] != null) continue;
    let prevIdx = null;
    let nextIdx = null;
    for (let j = 1; j < numSlices; j++) {
      const prev = (i - j + numSlices) % numSlices;
      const next = (i + j) % numSlices;
      if (prevIdx == null && maxDistBySlice[prev] != null) prevIdx = prev;
      if (nextIdx == null && maxDistBySlice[next] != null) nextIdx = next;
      if (prevIdx != null && nextIdx != null) break;
    }
    if (prevIdx == null || nextIdx == null) continue;
    const prevDist = maxDistBySlice[prevIdx];
    const nextDist = maxDistBySlice[nextIdx];
    if (prevDist == null || nextDist == null) continue;

    const span = (nextIdx - prevIdx + numSlices) % numSlices;
    const offset = (i - prevIdx + numSlices) % numSlices;
    const t = span > 0 ? offset / span : 0.5;
    maxDistBySlice[i] = prevDist + (nextDist - prevDist) * t;
  }

  // Smooth the radial distance to reduce jaggedness.
  const smoothRadius = 6;
  const smoothed = maxDistBySlice.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -smoothRadius; k <= smoothRadius; k++) {
      const idx = (i + k + numSlices) % numSlices;
      const d = maxDistBySlice[idx];
      if (d != null) {
        sum += d;
        count += 1;
      }
    }
    return count ? sum / count : maxDistBySlice[i];
  });

  const finalBoundary = [];
  for (let i = 0; i < numSlices; i++) {
    const dist = smoothed[i];
    if (dist == null) continue;
    const angle = (i + 0.5) * sliceSize;
    finalBoundary.push({
      x: cx + dist * Math.cos(angle),
      y: cy + dist * Math.sin(angle),
      dist,
      angle,
    });
  }
  if (finalBoundary.length < 3) return null;

  // Expand boundary outward from center by expandPx
  if (expandPx > 0) {
    return finalBoundary.map((pt) => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-6) return { x: pt.x, y: pt.y };
      const scale = (dist + expandPx) / dist;
      return { x: cx + dx * scale, y: cy + dy * scale };
    });
  }

  return finalBoundary.map((pt) => ({ x: pt.x, y: pt.y }));
}

/**
 * Compute the extent (min/max) of the gamut in the given color space.
 * Returns a range object { min: {channel: value}, max: {channel: value} }
 * with a margin multiplier applied (e.g., 1.1 for 10% padding).
 */
export function computeGamutExtent(space, gamutPreset, marginMultiplier = 1.1) {
  const channels = channelOrder[space] || [];
  const baseRange = csRanges[space];
  if (!baseRange) return null;

  const hasHue = channels.includes("h");
  const lKey = channels.includes("l") ? "l" : channels.includes("jz") ? "jz" : channels[0] || "l";
  const isRect = !hasHue;

  // For hue-based spaces (polar), we need to find the max chroma/saturation
  // For rect spaces (Lab, etc.), we need to find the actual extent in a/b axes
  const gamut = GAMUTS[gamutPreset] || GAMUTS.srgb;
  if (!gamut) return null;

  const min = {};
  const max = {};

  // Initialize with extreme values
  channels.forEach((ch) => {
    if (ch === "h") {
      // Hue always spans full range
      min[ch] = baseRange.min[ch] ?? 0;
      max[ch] = baseRange.max[ch] ?? 360;
    } else {
      min[ch] = Infinity;
      max[ch] = -Infinity;
    }
  });

  // Sample the RGB cube surface to find the gamut extent
  const steps = 32;
  for (let r = 0; r <= steps; r++) {
    for (let g = 0; g <= steps; g++) {
      for (let b = 0; b <= steps; b++) {
        // Only sample surface of cube (at least one coordinate is 0 or 1)
        const rn = r / steps;
        const gn = g / steps;
        const bn = b / steps;
        const onSurface =
          rn === 0 || rn === 1 || gn === 0 || gn === 1 || bn === 0 || bn === 1;
        if (!onSurface) continue;

        const xyz = gamut.toXYZ(rn, gn, bn);
        const vals = convertColorValues(xyz, "xyz", space);
        if (!vals) continue;

        channels.forEach((ch) => {
          if (ch === "h") return; // Skip hue
          const v = vals[ch];
          if (Number.isFinite(v)) {
            if (v < min[ch]) min[ch] = v;
            if (v > max[ch]) max[ch] = v;
          }
        });
      }
    }
  }

  // Apply margin and ensure valid ranges
  const result = { min: {}, max: {} };
  channels.forEach((ch) => {
    if (ch === "h") {
      result.min[ch] = min[ch];
      result.max[ch] = max[ch];
      return;
    }

    const minVal = min[ch];
    const maxVal = max[ch];

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      result.min[ch] = baseRange.min[ch] ?? 0;
      result.max[ch] = baseRange.max[ch] ?? 1;
      return;
    }

    // For symmetric axes (like a, b in Lab), expand symmetrically around 0
    const isSymmetric = minVal < 0 && maxVal > 0;
    if (isSymmetric) {
      const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal)) * marginMultiplier;
      result.min[ch] = -maxAbs;
      result.max[ch] = maxAbs;
    } else {
      // For non-symmetric axes (like L, s, c), expand the range
      const span = maxVal - minVal;
      const padding = span * (marginMultiplier - 1) / 2;
      result.min[ch] = minVal - padding;
      result.max[ch] = maxVal + padding;
    }
  });

  return result;
}
