// Writes heart.txt, the example target picture: the implicit heart curve
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
