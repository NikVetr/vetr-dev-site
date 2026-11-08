// Writes heart.txt, the R-parity target picture: the implicit heart curve
// (x² + y² − 1)³ − x² y³ ≤ 0 sampled at pixel centres, "#" inside and "." outside.
//   node make-heart.mjs [size]   (default 64)
import { writeFileSync } from 'node:fs';

const size = Number(process.argv[2] ?? 64);
const rows = Array.from({ length: size }, (_, i) => {
  const y = 1.3 - (2.4 * (i + 0.5)) / size;
  return Array.from({ length: size }, (_, j) => {
    const x = -1.2 + (2.4 * (j + 0.5)) / size;
    return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0 ? '#' : '.';
  }).join('');
});
writeFileSync(new URL('heart.txt', import.meta.url), `${rows.join('\n')}\n`);

// The page example uses a deeper cleft and tapered point. Rasterise the classic
// parametric heart while retaining heart.txt unchanged for the R parity fixtures.
const outline = Array.from({ length: 720 }, (_, i) => {
  const t = 2 * Math.PI * i / 720;
  return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
});
/** @param {number} x @param {number} y */
function inside(x, y) {
  let hit = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const notched = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) =>
  inside(-17 + (c + 0.5) * 34 / size, 14 - (r + 0.5) * 34 / size) ? '#' : '.').join(''));
writeFileSync(new URL('heart-notched.txt', import.meta.url), `${notched.join('\n')}\n`);
