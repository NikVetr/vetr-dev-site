import { convertColorValues, GAMUTS } from "../core/colorSpaces.js";

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
