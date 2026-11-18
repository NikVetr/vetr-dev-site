import { readFileSync } from 'node:fs';
import { art, flipbook, num } from '../svg.mjs';
import { predict, validateCatalog } from '../../../media-ratings/core.mjs';
import { tasteProfile } from '../../../media-ratings/taste.mjs';

export function build() {
  const catalog = validateCatalog(
    JSON.parse(readFileSync(new URL('../../../media-ratings/expanded.json', import.meta.url), 'utf8')),
  );
  const colors = ['#659c99', '#b78159', '#898bc1', '#c77593', '#77a26b', '#7191bc', '#b49b60', '#a783aa'];
  const frames = [5, 4, 3, 2, 1, 2, 3, 4].map((rating) => {
    const given = { 2571: rating },
      model = 'latentClass';
    const result = predict(catalog, { model, ratings: given });
    const { weights, projection } = tasteProfile(catalog, given, model, result);
    const extent = Math.max(...projection.flatMap((a) => a.scores.map(Math.abs)));
    const cx = projection[0].scores.map((v) => 79 + (59 * v) / extent);
    const cy = projection[1].scores.map((v) => 109 - (49 * v) / extent);
    const mx = weights.reduce((s, w, k) => s + w * cx[k], 0),
      my = weights.reduce((s, w, k) => s + w * cy[k], 0);
    const plot = weights
      .map(
        (w, k) =>
          '<circle cx="' +
          num(cx[k]) +
          '" cy="' +
          num(cy[k]) +
          '" r="' +
          num(3 + 6 * Math.sqrt(w)) +
          '" fill="' +
          colors[k] +
          '"/>',
      )
      .join('');
    const target = result.predictions.find((p) => p.itemId === '589');
    const bars = target.probabilities
      .map(
        (p, i) =>
          '<rect x="' +
          (168 + i * 13) +
          '" y="' +
          num(149 - 116 * p) +
          '" width="10" height="' +
          num(116 * p) +
          '" fill="#58978e"/>',
      )
      .join('');
    return (
      '<text x="16" y="29" class="film">The Matrix</text><text x="303" y="29" text-anchor="end" class="stars">' +
      '★'.repeat(rating) +
      '☆'.repeat(5 - rating) +
      '</text><path d="M16 42H304M156 56V158" class="rule"/>' +
      '<text x="16" y="64">Taste classes</text><text x="168" y="64">Terminator 2</text>' +
      '<path d="M17 109H143M79 74V152M166 150H301" class="grid"/>' +
      plot +
      '<path d="M' +
      num(mx) +
      ' ' +
      num(my - 5) +
      'l5 5 -5 5 -5 -5z" fill="var(--art-paper)" stroke="var(--art-ink)" stroke-width="2"/>' +
      bars +
      '<text x="16" y="171" class="caption">◇ Your position</text><text x="168" y="171" class="caption">½ ★</text><text x="299" y="171" text-anchor="end" class="caption">5 ★</text>'
    );
  });
  const book = flipbook('media-ratings', frames, 8);
  return art({
    name: 'media-ratings',
    period: 8,
    ...book,
    css:
      book.css +
      ' & text{fill:var(--art-ink);font:600 13px system-ui} & .film{font:bold 23px Georgia,serif} & .stars{fill:var(--art-ink);font-size:20px} & .caption{font:11px system-ui} & .rule,& .grid{fill:none;stroke:var(--art-line)} & .grid{stroke-dasharray:3 3}',
  });
}
