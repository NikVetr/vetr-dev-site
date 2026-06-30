const EPS = 1e-4;

export function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function wrap01(v) {
  return ((v % 1) + 1) % 1;
}

export function cloneExplicitBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const out = {};
  Object.entries(bounds).forEach(([ch, b]) => {
    if (Array.isArray(b) && b.length >= 2 && Number.isFinite(b[0]) && Number.isFinite(b[1])) {
      out[ch] = [b[0], b[1]];
    }
  });
  return Object.keys(out).length ? out : null;
}

export function sanitizeLinearBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 2) return null;
  const a = clamp01(bounds[0]);
  const b = clamp01(bounds[1]);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo < EPS) return [lo, Math.min(1, lo + EPS)];
  return [lo, hi];
}

export function hueSpan(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 2) return 1;
  const diff = bounds[1] - bounds[0];
  const rawSpan = (diff + 1) % 1;
  if (rawSpan === 0) return diff >= 0.999 ? 1 : EPS;
  return Math.max(EPS, Math.min(1, rawSpan));
}

export function sanitizeHueBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 2) return null;
  const start = wrap01(bounds[0]);
  const span = hueSpan(bounds);
  return [start, start + span];
}

export function sanitizeExplicitBounds(bounds, channels = []) {
  const cloned = cloneExplicitBounds(bounds);
  if (!cloned) return null;
  const allowed = new Set(channels);
  const out = {};
  Object.entries(cloned).forEach(([ch, b]) => {
    if (allowed.size && !allowed.has(ch)) return;
    const clean = ch === "h" ? sanitizeHueBounds(b) : sanitizeLinearBounds(b);
    if (clean) out[ch] = clean;
  });
  return Object.keys(out).length ? out : null;
}

export function setLinearBoundEdge(bounds, edge, targetNorm) {
  const base = sanitizeLinearBounds(bounds) || [0, 1];
  const target = clamp01(targetNorm);
  if (edge === "min") return sanitizeLinearBounds([Math.min(target, base[1] - EPS), base[1]]);
  return sanitizeLinearBounds([base[0], Math.max(target, base[0] + EPS)]);
}

export function setHueBoundEdge(bounds, edge, targetNorm) {
  const base = sanitizeHueBounds(bounds) || [0, 1];
  const target = wrap01(targetNorm);
  if (edge === "min") {
    const endNorm = wrap01(base[1]);
    const span = Math.max(EPS, (endNorm - target + 1) % 1);
    return [target, target + span];
  }
  const startNorm = wrap01(base[0]);
  const span = Math.max(EPS, (target - startNorm + 1) % 1);
  return [startNorm, startNorm + span];
}

export function widthFromBounds(bounds, ch) {
  const span = ch === "h"
    ? hueSpan(bounds)
    : (() => {
      const b = sanitizeLinearBounds(bounds);
      return b ? b[1] - b[0] : 1;
    })();
  return clamp01(1 - span);
}
