export const meanKinds = [
  "harmonic",
  "geometric",
  "arithmetic",
  "quadratic",
  "lehmer",
  "power",
  "minimum",
];

export function defaultPForMean(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "lehmer") return -2;
  if (k === "power") return -2;
  return 1;
}

function safeVals(values) {
  const out = [];
  for (const v of values || []) {
    if (!Number.isFinite(v) || v < 0) throw new Error("Distances must be finite and nonnegative.");
    out.push(v);
  }
  return out;
}

export function aggregateDistances(values, kind = "harmonic", p = null) {
  const k = String(kind || "").toLowerCase();
  const vals = safeVals(values);
  if (!vals.length) return 0;

  if (k === "minimum" || k === "min") {
    return Math.min(...vals);
  }

  if (k === "arithmetic" || k === "mean") {
    return vals.reduce((acc, v) => acc + v, 0) / vals.length;
  }

  if (k === "quadratic" || k === "rms") {
    const m2 = vals.reduce((acc, v) => acc + v * v, 0) / vals.length;
    return Math.sqrt(m2);
  }

  if (k === "geometric") {
    const mlog = vals.reduce((acc, v) => acc + Math.log(v), 0) / vals.length;
    return Math.exp(mlog);
  }

  if (k === "harmonic") {
    const inv = vals.reduce((acc, v) => acc + 1 / v, 0) / vals.length;
    return inv > 0 ? 1 / inv : 0;
  }

  const pp = Number.isFinite(p) ? p : defaultPForMean(k);

  if (k === "power") {
    if (Math.abs(pp) < 1e-12) {
      const mlog = vals.reduce((acc, v) => acc + Math.log(v), 0) / vals.length;
      return Math.exp(mlog);
    }
    const mp = vals.reduce((acc, v) => acc + Math.pow(v, pp), 0) / vals.length;
    return Math.pow(mp, 1 / pp);
  }

  if (k === "lehmer") {
    if (pp < 0 && vals.includes(0)) return 0;
    const num = vals.reduce((acc, v) => acc + Math.pow(v, pp + 1), 0);
    const den = vals.reduce((acc, v) => acc + Math.pow(v, pp), 0);
    return den > 0 ? num / den : 0;
  }

  throw new Error(`Unknown distance aggregation: ${kind}`);
}
