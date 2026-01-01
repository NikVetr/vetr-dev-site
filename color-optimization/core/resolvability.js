import { distanceBetweenCoords } from "./distance.js";

export function metricJnd(metric) {
  const m = String(metric || "de2000").toLowerCase();
  if (m === "lab76") return 2.3;
  if (m === "oklab76") return 0.023;
  return 1;
}

export function discriminabilityLabel(distance, metric) {
  if (!Number.isFinite(distance)) return "";
  const jnd = metricJnd(metric);
  const thresholds = [5, 10, 20, 30].map((t) => t * jnd);
  if (distance < thresholds[0]) return "awful";
  if (distance < thresholds[1]) return "poor";
  if (distance < thresholds[2]) return "fair";
  if (distance < thresholds[3]) return "good";
  return "great";
}

export function computeDistanceMatrix(coords = [], metric = "de2000") {
  const n = coords.length;
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    out[i * n + i] = 0;
    for (let j = i + 1; j < n; j++) {
      const d = distanceBetweenCoords(coords[i], coords[j], metric);
      out[i * n + j] = d;
      out[j * n + i] = d;
    }
  }
  return out;
}

export function computeNearestNeighbors(distances, n) {
  const minDist = new Float32Array(n);
  const nearest = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    let bestIdx = -1;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = distances[i * n + j];
      if (d < best) {
        best = d;
        bestIdx = j;
      }
    }
    minDist[i] = Number.isFinite(best) ? best : Infinity;
    nearest[i] = bestIdx;
  }
  return { minDist, nearest };
}
