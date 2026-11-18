import { readFileSync } from 'node:fs';
import { art, esc, flipbook } from '../svg.mjs';
import { predict, validateCatalog } from '../../../media-ratings/core.mjs';
export function build() {
  const catalog = validateCatalog(
    JSON.parse(readFileSync(new URL('../../../media-ratings/movielens.json', import.meta.url), 'utf8')),
  );
  const frames = [5, 3, 1].map((rating) => {
    const result = predict(catalog, { model: 'ordinal', ratings: { 2571: rating }, threshold: 4 });
    const rows = result.predictions.sort((a, b) => b.shift - a.shift).slice(0, 3);
    return (
      '<text x="12" y="28" font-size="18">The Matrix · ' +
      rating +
      ' ★</text>' +
      rows
        .map((p, i) => {
          const title = p.title.replace(/ \(\d{4}\)$/, '').replace(/:.*$/, '');
          const y = 60 + 42 * i;
          return (
            '<text x="12" y="' +
            y +
            '" font-size="14">' +
            esc(title) +
            '</text><text x="308" y="' +
            y +
            '" text-anchor="end">' +
            p.expected.toFixed(2) +
            '</text><rect x="12" y="' +
            (y + 6) +
            '" width="' +
            (290 * p.chance).toFixed(1) +
            '" height="5" rx="2" fill="#5da893"/>'
          );
        })
        .join('')
    );
  });
  const book = flipbook('media-ratings', frames, 5);
  return art({
    name: 'media-ratings',
    period: 5,
    ...book,
    css: book.css + ' & text {fill:var(--art-ink);font-family:system-ui,sans-serif}',
  });
}
