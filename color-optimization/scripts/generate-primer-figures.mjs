import { writeFileSync } from 'node:fs';
import { encodeColor, isInGamut } from '../core/colorSpaces.js';
import { applyCvdHex } from '../core/cvd.js';
import { coordsFromHexForDistanceMetric, distanceBetweenCoords } from '../core/distance.js';

const text = (x, y, value, cls = '', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${value}</text>`;
const box = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
function save(name, height, title, content) {
  writeFileSync(new URL(`../assets/scientific-summary/${name}.svg`, import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" width="690" height="${height}" viewBox="0 0 690 ${height}" role="img">
<title>${title}</title><style>text{font-family:Arial,Helvetica,sans-serif;font-size:14px;fill:#243746}.small{font-size:12px;fill:#526471}.heading{font-size:17px;font-weight:700}</style>
${box(0, 0, 690, height, '#fff')}${content}</svg>\n`);
}
function lch(l, c, h) {
  const raw = { l, c, h };
  if (!isInGamut(raw, 'oklch', 'srgb')) throw new Error(`Primer swatch outside sRGB: ${JSON.stringify(raw)}`);
  return encodeColor(raw, 'oklch');
}

let plane = text(10, 24, 'A · One color, two coordinate systems', 'heading') + text(10, 48, 'OKLab a–b slice at L = 0.65', 'small');
const cx = 160, cy = 190, scale = 380;
// The irregular footprint is a sampled constant-lightness sRGB slice, not a decorative circle.
for (let a = -0.4; a <= 0.4; a += 0.008) {
  for (let b = -0.4; b <= 0.4; b += 0.008) {
    const raw = { l: 0.65, a, b };
    if (isInGamut(raw, 'oklab', 'srgb')) plane += box(cx + a * scale - 2, cy - b * scale - 2, 4.2, 4.2, encodeColor(raw, 'oklab'));
  }
}
plane += `<path d="M35 ${cy}H285 M${cx} 70V310" fill="none" stroke="#526471" stroke-width="1"/>`;
plane += text(283, 211, '+a', 'small') + text(148, 66, '+b', 'small') + text(29, 211, '−a', 'small') + text(166, 317, '−b', 'small');
const h = 40 * Math.PI / 180, c = 0.19, px = cx + c * Math.cos(h) * scale, py = cy - c * Math.sin(h) * scale;
plane += `<path d="M${cx} ${cy}L${px} ${py} M${px} ${py}V${cy}" fill="none" stroke="#fff" stroke-width="4"/>`;
plane += `<path d="M${cx} ${cy}L${px} ${py}" fill="none" stroke="#243746" stroke-width="1.5"/>`;
plane += `<path d="M${px} ${py}V${cy}" fill="none" stroke="#243746" stroke-dasharray="3 3"/>`;
plane += `<path d="M${cx + 35} ${cy}A35 35 0 0 0 ${cx + 35 * Math.cos(h)} ${cy - 35 * Math.sin(h)}" fill="none" stroke="#243746"/>`;
plane += `<circle cx="${cx}" cy="${cy}" r="3" fill="#243746"/><circle cx="${px}" cy="${py}" r="5" fill="${lch(0.65, c, 40)}" stroke="#fff" stroke-width="2"/>`;
plane += text(193, 145, 'C') + text(198, 183, 'h') + text(119, 234, 'neutral', 'small');
plane += text(10, 342, 'a = C cos(h)     b = C sin(h)', 'small');
plane += text(350, 24, 'B · Change one property at a time', 'heading');
const ramps = [
  ['Lightness L', 'fixed C = 0.07, h = 250°', [0.35, 0.46, 0.57, 0.68, 0.79], (v) => lch(v, 0.07, 250)],
  ['Chroma C', 'fixed L = 0.65, h = 40°', [0, 0.04, 0.08, 0.12, 0.16], (v) => lch(0.65, v, 40)],
  ['Hue h', 'fixed L = 0.65, C = 0.08', [0, 72, 144, 216, 288], (v) => lch(0.65, 0.08, v)],
];
ramps.forEach(([label, subtitle, values, convert], i) => {
  const y = 66 + i * 99;
  plane += text(350, y, label) + text(350, y + 18, subtitle, 'small');
  values.forEach((v, j) => {
    const x = 350 + j * 62;
    plane += box(x, y + 28, 54, 31, convert(v), 'rx="2"');
    plane += text(x + 27, y + 76, String(v), 'small', 'text-anchor="middle"');
  });
});
save('color-space-primer', 362, 'OKLab and OKLCh coordinates, with lightness, chroma and hue ramps', plane);

const distance = (a, b) => distanceBetweenCoords(coordsFromHexForDistanceMetric(a, 'de2000'), coordsFromHexForDistanceMetric(b, 'de2000'), 'de2000');
// Select an illustrative pair from a declared fixed-L, fixed-C hue grid.
const candidates = Array.from({ length: 24 }, (_, i) => lch(0.65, 0.08, i * 15));
let pair = null, bestRatio = -Infinity;
for (let i = 0; i < candidates.length; i++) {
  for (let j = i + 1; j < candidates.length; j++) {
    const normal = distance(candidates[i], candidates[j]);
    const simulated = distance(...[candidates[i], candidates[j]].map((hex) => applyCvdHex(hex, 'deutan', 1, 'machado2009')));
    const ratio = normal / Math.max(simulated, 0.01);
    if (normal > 15 && ratio > bestRatio) { bestRatio = ratio; pair = [candidates[i], candidates[j]]; }
  }
}
let cvd = text(10, 25, 'A · A model of altered color discrimination', 'heading');
const steps = [['Display signal', 'linear sRGB'], ['CVD simulation', 'Machado matrix'], ['Displayed comparison', 'sRGB → color distance']];
steps.forEach(([label, subtitle], i) => {
  const x = 10 + i * 233;
  cvd += box(x, 44, 207, 65, '#f1f6f7', 'rx="4"');
  cvd += text(x + 103, 70, label, '', 'text-anchor="middle"') + text(x + 103, 92, subtitle, 'small', 'text-anchor="middle"');
  if (i < 2) cvd += text(x + 215, 83, '→');
});
cvd += text(10, 144, 'B · One pair under increasing deutan model severity', 'heading');
const values = [];
[0, 0.5, 1].forEach((severity, i) => {
  const x = 10 + i * 233;
  const simulated = pair.map((hex) => applyCvdHex(hex, 'deutan', severity, 'machado2009'));
  const delta = distance(...simulated);
  values.push({ severity, simulated, deltaE2000: delta });
  cvd += text(x, 174, ['0 · no alteration', '0.5 · intermediate model', '1 · app’s endpoint'][i], 'small');
  simulated.forEach((hex, j) => {
    cvd += box(x + j * 100, 188, 93, 58, hex, 'rx="3"');
    cvd += text(x + j * 100 + 46, 236, j ? 'B' : 'A', '', 'text-anchor="middle" style="fill:#fff;paint-order:stroke;stroke:#243746;stroke-width:2px"');
  });
  cvd += text(x, 270, `ΔE00 = ${delta.toFixed(1)}`);
});
cvd += text(10, 303, `Original sRGB pair: A ${pair[0]} · B ${pair[1]}`, 'small');
cvd += text(10, 326, 'Severity is a model parameter, not a percentage of vision lost. This is an illustrative pair.', 'small');
save('cvd-primer', 346, 'CVD simulation pipeline and a color pair losing modeled separation under deutan simulation', cvd);
writeFileSync(new URL('../assets/scientific-summary/primer-data.json', import.meta.url), JSON.stringify({
  colorSpace: 'oklch', hueGrid: { l: 0.65, c: 0.08, stepDegrees: 15 },
  pairSelection: 'Largest trichromatic/deutan distance ratio among pairs with trichromatic CIEDE2000 > 15; illustrative selection, not a representative sample.',
  pair, cvdModel: 'machado2009', vision: 'deutan', values,
}, null, 2) + '\n');
console.log(JSON.stringify({ pair, values }));
