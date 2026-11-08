import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { glyphColors } from '../core/colors.js';
import { adjustedContrastColour } from '../core/contrast.js';
import { inkCoverage, measureChars } from '../core/font.js';
import { DEFAULTS, TextInImageError, renderSvg, submit } from '../core/index.js';
import { fitTextSize, layoutPass, prepareText } from '../core/layout.js';
import { quantizeOklab, toRaster } from '../core/quantize.js';
import { columnRuns, regionRows, rotateRaster, unrotatePosition } from '../core/region.js';
import { mulberry32 } from '../../shared/rng.js';
import { decodePng } from '../../shared/decode-png.mjs';

const here = (/** @type {string} */ path) => fileURLToPath(new URL(path, import.meta.url));
const example = {
  image: decodePng(readFileSync(here('../examples/alice-drink-me.png'))),
  text: readFileSync(here('../examples/alice-chapter-1.txt'), 'utf8'),
};

/** Throws and returns the TextInImageError. @param {unknown} request */
function rejection(request) {
  try {
    submit(request);
  } catch (error) {
    assert.ok(error instanceof TextInImageError);
    return error;
  }
  assert.fail('request was accepted');
}

/** An opaque grey image whose paintable pixels are where mask(r, c) is true (rows and columns 1-based, as in R). */
function maskImage(/** @type {number} */ rows, /** @type {number} */ cols, /** @type {(r: number, c: number) => boolean} */ mask) {
  const data = new Uint8ClampedArray(rows * cols * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) data.set(mask(r + 1, c + 1) ? [77, 77, 77, 255] : [0, 0, 0, 0], 4 * (r * cols + c));
  }
  return { width: cols, height: rows, data };
}
const maskRegion = (/** @type {Parameters<typeof maskImage>} */ ...args) => regionRows(toRaster(maskImage(...args), 'white'), 0.2);

/** n copies of "ab " laid out with fixed-width glyphs, as the R tests' layout_on_mask. */
function layoutOnMask(/** @type {ReturnType<typeof maskRegion>} */ region, /** @type {Partial<import('../core/layout.js').LayoutOptions>} */ options, n = 400, w = 0.03, h = 0.06) {
  const txt = Array.from({ length: n }, (_, i) => 'ab '[i % 3]);
  return layoutPass(txt, txt.map(() => w), h * 1.21, h, region, w, { lineWidths: 'band', skipGaps: true, justify: false, ...options });
}

test('requests are validated in full, listing every problem', () => {
  const error = rejection({
    text: 42, seed: -1, colour: 'red',
    layout: { rotaton: 5, n_rounds: 0 }, quantize: { k: 2.5 }, render: { backgrounds: ['black'] },
    font: { family: 'Arial' },
  });
  assert.equal(error.code, 'invalid_request');
  assert.deepEqual(error.issues.map((i) => `${i.code} ${i.path}`).sort(), [
    'missing_field image', 'out_of_range seed', 'r_only font.family', 'r_only render.backgrounds',
    'unknown_field colour', 'unknown_field layout.rotaton', 'out_of_range layout.n_rounds', 'wrong_type quantize.k', 'wrong_type text',
  ].sort());
  assert.match(error.message, /^Invalid request: /);
  assert.deepEqual(JSON.parse(JSON.stringify(error)).error.issues.length, 9);

  const image = { width: 2, height: 1, data: [0, 0, 0, 255, 255, 255, 255] };
  assert.deepEqual(rejection({ image, text: 'a' }).issues.map((i) => i.path), ['image.data']);
  assert.deepEqual(rejection({ image: { ...image, data: [0, 0, 0, 255, 256, 0, 0, 255] }, text: 'a' }).issues.map((i) => i.path), ['image.data[4]']);
  assert.deepEqual(rejection({ image: { ...image, depth: 8 }, text: ' \n ' }).issues.map((i) => `${i.code} ${i.path}`), ['unknown_field image.depth', 'out_of_range image.data', 'out_of_range text']);
});

test('options that exist only in the R version are refused, naming the R repository', () => {
  const { image, text } = example;
  for (const [quantize, path] of [
    [{ method: 'tsne_kde_kmeans', ncol_range: 5 }, 'quantize.method'],
    [{ denoise: 'original' }, 'quantize.denoise'],
    [{ dist_w: 0.2 }, 'quantize.dist_w'],
  ]) {
    const [issue, ...rest] = rejection({ image, text, quantize }).issues;
    assert.deepEqual(rest, []);
    assert.equal(issue.code, 'r_only');
    assert.equal(issue.path, path);
    assert.match(issue.message, /github\.com\/NikVetr\/text-in-image/);
  }
  assert.equal(rejection({ image, text, font: { face: 1 } }).issues[0].code, 'r_only');
  assert.equal(rejection({ image, text, quantize: { method: 'median_cut' } }).issues[0].code, 'wrong_type');
});

test('OKLab k-means recovers flat colours, keeps the background transparent and is seeded', () => {
  const cols = [[230, 51, 26], [26, 102, 230], [242, 217, 51]];
  const image = { width: 30, height: 20, data: new Uint8ClampedArray(30 * 20 * 4) };
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 30; c++) image.data.set([...cols[Math.floor(c / 10)], r < 5 ? 0 : 255], 4 * (r * 30 + c));
  }
  const q = { ...DEFAULTS.quantize, k: 3 };
  const out = quantizeOklab(toRaster(image, 'white'), /** @type {any} */ (q), mulberry32(1));
  assert.equal(out.palette.colors.length, 3);
  for (let p = 0; p < 600; p++) {
    const opaque = p >= 150;
    assert.equal(out.raster.rgba[4 * p + 3], opaque ? 1 : 0);
    if (opaque) for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(out.raster.rgba[4 * p + ch] * 255 - image.data[4 * p + ch]) < 1e-9);
  }
  assert.ok(out.palette.error.mean < 1e-12);
  const again = quantizeOklab(toRaster(image, 'white'), /** @type {any} */ (q), mulberry32(1));
  assert.deepEqual(again.raster.rgba, out.raster.rgba);

  const error = rejection({ image, text: 'a' });
  assert.equal(error.code, 'unusable_input');
  assert.equal(error.issues[0].path, 'quantize.k');
  assert.match(error.issues[0].message, /only 3 distinct colours/);
});

test('an image without transparency takes its background from transparent_color, as an RGB image in R', () => {
  const image = { width: 2, height: 2, data: new Uint8ClampedArray([51, 102, 153, 255, 255, 255, 255, 255, 250, 250, 250, 255, 0, 0, 0, 255]) };
  assert.deepEqual([...toRaster(image, 'white').rgba].filter((_, i) => i % 4 === 3), [1, 0, 0, 1]);
  assert.deepEqual([...toRaster(image, 'black').rgba].filter((_, i) => i % 4 === 3), [1, 1, 1, 0]);
});

test('rotation by 0 is the identity, 90 there and back recovers the grid, and positions map back', () => {
  const raster = toRaster(maskImage(7, 9, (r, c) => (r + c) % 3 === 0), 'white');
  assert.equal(rotateRaster(raster, 0), raster);
  const back = rotateRaster(rotateRaster(raster, 90), -90);
  assert.deepEqual([back.width, back.height], [9, 7]);
  assert.deepEqual(back.rgba, raster.rgba);

  // the R test: pixel centres of the rotated picture land on the picture's own pixels
  const m = (/** @type {number} */ r, /** @type {number} */ c) => (r >= 5 && r <= 55 && c >= 10 && c <= 25) || (r >= 40 && r <= 55 && c >= 10 && c <= 70);
  for (const theta of [30, -45]) {
    const rot = rotateRaster(toRaster(maskImage(60, 80, m), 'white'), theta);
    const region = regionRows(rot, 0.2);
    for (let p = 0; p < region.px.length; p++) {
      const { x, y } = unrotatePosition(region.px[p] - 0.5 / rot.width, region.py[p] + 0.5 / rot.height, theta, rot.width, rot.height);
      const col = Math.round(x * rot.width + 0.5 - (rot.width - 80) / 2);
      const row = Math.round((1 - y) * rot.height + 0.5 - (rot.height - 60) / 2);
      assert.ok(m(row, col), `theta ${theta}: (${row}, ${col})`);
    }
  }
});

test('runs give each pixel its run width and the row its total width', () => {
  assert.deepEqual(columnRuns([0, 1, 3, 5, 6, 7], 10), { x: [0.1, 0.2, 0.4, 0.6, 0.7, 0.8], tsw: [0.2, 0.2, 0.1, 0.3, 0.3, 0.3], tw: 0.6 });
});

test('lines skip vertical gaps in the region instead of writing into them', () => {
  const region = maskRegion(60, 50, (r, c) => c >= 5 && c <= 45 && (r <= 15 || r >= 41)); // rows 16-40 are a gap
  const gap = [1 - 40.5 / 60, 1 - 15.5 / 60];
  const inGap = (/** @type {ReturnType<typeof layoutOnMask>} */ l) => l.y.filter((y) => y !== null && y > gap[0] && y < gap[1]).length;
  assert.ok(inGap(layoutOnMask(region, { lineWidths: 'row', skipGaps: false })) > 0); // the original behaviour
  assert.equal(inGap(layoutOnMask(region, { lineWidths: 'row', skipGaps: true })), 0);
  assert.equal(inGap(layoutOnMask(region, { lineWidths: 'band' })), 0);
});

test('band line widths keep glyphs inside slanted edges better than one pixel row', () => {
  const inside = (/** @type {number} */ r, /** @type {number} */ c) => c <= r; // lower-left triangle
  const region = maskRegion(80, 80, inside);
  const w = 0.03;
  const h = 0.06;
  const overflow = (/** @type {ReturnType<typeof layoutOnMask>} */ l) => {
    let out = 0;
    let total = 0;
    l.x.forEach((x, i) => {
      const y = l.y[i];
      if (x === null || y === null || i % 3 === 2) return; // placed letters only
      for (let r = 1; r <= 80; r++) {
        if (1 - r / 80 < y - h / 3 || 1 - r / 80 > y + 2 * h / 3) continue;
        for (let c = 1; c <= 80; c++) {
          if (c / 80 < x || c / 80 > x + w) continue;
          total++;
          if (!inside(r, c)) out++;
        }
      }
    });
    return out / total;
  };
  assert.ok(overflow(layoutOnMask(region, { lineWidths: 'band' }, 400, w, h)) < overflow(layoutOnMask(region, { lineWidths: 'row' }, 400, w, h)) / 2);
});

test('the final layout uses the size it reports, and the text fits when some size fits', () => {
  const region = maskRegion(50, 50, () => true);
  const txt = Array.from({ length: 300 }, (_, i) => 'ab '[i % 3]);
  const metrics = (/** @type {number} */ cex) => ({ w: new Map([['a', 0.01 * cex], ['b', 0.01 * cex], [' ', 0.01 * cex]]), h: 0.02 * cex });
  for (const init of [0.3, 3]) {
    const fit = fitTextSize(txt, region, metrics, init, { nRounds: 5, lineHeight: 1.21, justify: true, lineWidths: 'band', skipGaps: true });
    assert.equal(fit.cex, fit.history[4].cex);
    assert.ok(fit.complete);
    assert.ok(fit.pass.x.every((x) => x !== null));
  }
});

test('text is split into characters with whitespace runs collapsed', () => {
  assert.deepEqual(prepareText(' a\n\n b\tcé'), [' ', 'a', ' ', 'b', ' ', 'c', 'é']);
});

test('font metrics are the font units of Liberation Sans Bold, as R measures them', () => {
  const m = measureChars(['M', 'a', ' ']);
  // R (cairo, measured at cex 100): M 1706.667, a 1138.347, space 568.320, height 1409.707 font units
  assert.equal(m.width.get('M'), 1706 / 2048);
  assert.equal(m.width.get('a'), 1139 / 2048);
  assert.equal(m.width.get(' '), 569 / 2048);
  assert.equal(m.height, 1409 / 2048);
  assert.equal(inkCoverage(' '), 0);
  // R's raster estimate counts only pixels more than 90% inked, so it is a few percent lower (0.419 for "a")
  assert.ok(Math.abs(inkCoverage('a') - 0.445) < 0.001);
});

test('glyphs take the modal colour beneath them; ink compensation boosts colours and leaves blanks uncoloured', () => {
  const image = { width: 20, height: 10, data: new Uint8ClampedArray(800) };
  for (let p = 0; p < 200; p++) image.data.set(p % 20 < 12 ? [51, 26, 26, 255] : [200, 200, 0, 255], 4 * p);
  const raster = toRaster(image, 'white');
  const region = regionRows(raster, 0.2);
  const glyphs = { txt: ['a', ' ', 'b'], x: [0.1, 0.2, 0.8], y: [0.5, 0.5, 0.5], line: [1, 1, 1] };
  const widths = new Map([['a', 0.05], [' ', 0.05], ['b', 0.05]]);
  assert.deepEqual(glyphColors(glyphs, widths, raster, region, null, [0, 0, 0]), ['#331a1a', '#331a1a', '#c8c800']);
  const ink = new Map([['a', inkCoverage('a')], [' ', 0], ['b', inkCoverage('b')]]);
  const boosted = glyphColors(glyphs, widths, raster, region, ink, [0, 0, 0]);
  assert.equal(boosted[1], null);
  assert.ok(parseInt(/** @type {string} */ (boosted[0]).slice(1, 3), 16) > 51);
});

test('the example fills its image, and the same request gives the same result', () => {
  const result = submit(example);
  assert.ok(result.complete);
  assert.equal(result.fraction_placed, 1);
  assert.equal(result.glyphs.length, Array.from(example.text.replace(/\s+/g, ' ')).length);
  assert.ok(result.glyphs.every((g) => g.placed && /^#[0-9a-f]{6}$/.test(/** @type {string} */ (g.col))));
  assert.deepEqual(result.canvas, { width: 295 * 5, height: 540 * 5 });
  assert.equal(result.palette?.colors.length, 15);
  assert.equal(result.history.length, 5);
  assert.equal(result.cex, result.history[4].cex);
  assert.deepEqual(result.warnings, []);
  const strip = (/** @type {typeof result} */ r) => ({ ...r, timings_ms: null });
  assert.deepEqual(strip(submit(example)), strip(result));

  const svg = renderSvg(result, { background: '#7f7f7f' });
  const drawn = result.glyphs.filter((g) => g.char !== ' ').length;
  assert.equal(svg.match(/<use /g)?.length, drawn);
  assert.match(svg, /^<svg [^>]*width="1475" height="2700"/);
  assert.match(svg, /<rect width="1475" height="2700" fill="#7f7f7f"\/>/);
  assert.throws(() => renderSvg(result, { background: 'grey50' }), TextInImageError);

  const turned = submit({ ...example, layout: { rotation: 15 } });
  assert.ok(turned.canvas.width > result.canvas.width);
  assert.match(renderSvg(turned), / transform="rotate\(-15 /);
});

test('optional contrast outlines preserve glyph layout and fill, and follow the export background', () => {
  const request = { image: maskImage(16, 16, () => true), text: 'Alice bright dark', quantize: null };
  const plain = submit(request);
  const outlined = submit({ ...request, render: { contrast_outline: true } });
  assert.deepEqual(outlined.glyphs, plain.glyphs);
  assert.equal(outlined.font_size_px, plain.font_size_px);
  assert.deepEqual(outlined.history, plain.history);
  assert.equal(plain.settings.render.contrast_outline, false);
  assert.doesNotMatch(renderSvg(plain), / stroke=/);
  assert.deepEqual(rejection({ ...request, render: { contrast_outline: 'yes' } }).issues.map(i => [i.path, i.code]), [['render.contrast_outline', 'wrong_type']]);

  // A light glyph needs help on white; a dark one does not. Switching the
  // export background (without refitting) reverses that decision.
  outlined.glyphs = outlined.glyphs.map((g, i) => ({ ...g, col: i % 2 ? '#101010' : '#fafafa' }));
  const white = renderSvg(outlined, { background: 'white' });
  const black = renderSvg(outlined, { background: 'black' });
  assert.match(white, /fill="#fafafa" stroke="#000000"/);
  assert.doesNotMatch(white, /fill="#101010" stroke=/);
  assert.match(black, /fill="#101010" stroke="#ffffff"/);
  assert.doesNotMatch(black, /fill="#fafafa" stroke=/);
  assert.match(white, /paint-order="stroke fill"/);
  assert.equal(white.match(/<use /g)?.length, renderSvg(plain).match(/<use /g)?.length);

  outlined.glyphs[0].col = '#fafafa80';
  assert.match(renderSvg(outlined, { background: 'white' }), /fill="#fafafa" fill-opacity="0.5" stroke="#000000"[^>]+stroke-opacity="0.5"/);
});

test('gentle colour adjustment is capped, retains hue and alpha, and does not change the fit', () => {
  assert.equal(adjustedContrastColour('#ffffff', 'white'), '#cccccc'); // no more than 20% darkening
  assert.equal(adjustedContrastColour('#ffffff80', 'white'), '#cccccc80');
  assert.equal(adjustedContrastColour('#111111', 'white'), '#111111'); // already clear
  assert.equal(adjustedContrastColour('#f5e4c0', 'white'), '#dacbab'); // warm cream stays warm
  assert.equal(adjustedContrastColour('#111111', 'black'), '#303030'); // uses actual background
  assert.equal(adjustedContrastColour('#bbbbbb', '#aaaaaa'), '#c9c9c9'); // don't darken toward a mid-grey background
  const request = { image: maskImage(16, 16, () => true), text: 'Alice pale colours', quantize: null };
  const plain = submit(request), adjusted = submit({ ...request, render: { contrast_adjust: true } });
  assert.deepEqual(adjusted.glyphs, plain.glyphs);
  assert.deepEqual(adjusted.history, plain.history);
  assert.equal(adjusted.font_size_px, plain.font_size_px);
  adjusted.glyphs[0].col = '#f5e4c0';
  const svg = renderSvg(adjusted, { background: 'white' });
  assert.match(svg, /fill="#dacbab"/);
  assert.doesNotMatch(svg, / stroke=/);
  assert.equal(adjusted.glyphs[0].col, '#f5e4c0');
  assert.deepEqual(rejection({ ...request, render: { contrast_adjust: 'yes' } }).issues.map(i => [i.path, i.code]), [['render.contrast_adjust', 'wrong_type']]);
  assert.deepEqual(rejection({ ...request, render: { contrast_outline: true, contrast_adjust: true } }).issues.map(i => [i.path, i.code]), [['render.contrast_adjust', 'conflicting_options']]);
});

test('text that cannot fit is reported with the share placed', () => {
  const tiny = { width: 3, height: 3, data: new Uint8ClampedArray(36).fill(255) };
  for (let p = 0; p < 9; p++) tiny.data.set([90, 40, 40], 4 * p);
  // one round at the first guess, with lines so far apart that only two fit
  const result = submit({ image: tiny, text: 'abc '.repeat(25), quantize: null, layout: { n_rounds: 1, line_height: 10 } });
  assert.equal(result.complete, false);
  assert.ok(result.fraction_placed < 1);
  assert.equal(result.warnings[0], `text did not fit: ${result.glyphs.filter(g => g.placed).length} of ${result.glyphs.length} characters placed`);
});

test('final completeness reports all placed characters without altering the historical size search', () => {
  const result = submit({ image: example.image, text: 'A short replacement text.', layout: { n_rounds: 30 } });
  assert.equal(result.cex, 28.860278639824866); // established character-mode geometry
  assert.equal(result.history.length, 30);
  assert.ok(result.history.every(pass => !pass.complete)); // retain the search's final-line stopping rule
  assert.equal(result.complete, true);
  assert.equal(result.fraction_placed, 1);
  assert.equal(result.glyphs.length, 25);
  assert.ok(result.glyphs.every(g => g.placed));
  assert.deepEqual(result.warnings, []);
});

/** A PNG file from raw scanlines (filter byte included) and chunks. */
function png(/** @type {number} */ width, /** @type {number} */ height, /** @type {number} */ type, /** @type {number[]} */ scanlines, /** @type {[string, number[]][]} */ chunks = []) {
  const chunk = (/** @type {string} */ name, /** @type {Uint8Array} */ body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(name, 4, 'latin1');
    out.set(body, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, type, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    ...chunks.map(([name, body]) => chunk(name, Uint8Array.from(body))),
    chunk('IDAT', deflateSync(Uint8Array.from(scanlines))), chunk('IEND', new Uint8Array(0)),
  ]);
}

test('the PNG decoder reads RGB, RGBA and palette images, filters and transparency', () => {
  // RGB with a tRNS colour key; row 2 uses the Sub filter
  const rgb = decodePng(png(2, 2, 2, [0, 10, 20, 30, 255, 255, 255, 1, 5, 5, 5, 5, 5, 5], [['tRNS', [0, 255, 0, 255, 0, 255]]]));
  assert.deepEqual([...rgb.data], [10, 20, 30, 255, 255, 255, 255, 0, 5, 5, 5, 255, 10, 10, 10, 255]);
  // palette with alpha; Up filter on row 2
  const pal = decodePng(png(2, 2, 3, [0, 0, 1, 2, 1, 0], [['PLTE', [200, 0, 0, 0, 0, 200]], ['tRNS', [128]]]));
  assert.deepEqual([...pal.data], [200, 0, 0, 128, 0, 0, 200, 255, 0, 0, 200, 255, 0, 0, 200, 255]);
  // the example, from an encoder with adaptive filtering
  const { width, height, data } = example.image;
  assert.deepEqual([width, height, data.length], [295, 540, 295 * 540 * 4]);
  assert.throws(() => decodePng(Buffer.from('not a png')), /not a PNG/);
});

test('the CLI reads an image path, prints the result and reports errors as JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'text-in-image-'));
  const request = join(dir, 'request.json');
  writeFileSync(request, JSON.stringify({ image: here('../examples/alice-drink-me.png'), text: 'Alice was beginning to get very tired.', layout: { n_rounds: 3, wrap: 'word' }, render: { contrast_outline: true } }));
  const cli = (/** @type {string[]} */ ...args) => spawnSync(process.execPath, [here('../cli.mjs'), ...args], { encoding: 'utf8' });
  const ok = cli(request, '--svg', join(dir, 'fill.svg'), '--background', 'white');
  assert.equal(JSON.parse(ok.stdout).settings.layout.wrap, 'word');
  assert.equal(JSON.parse(ok.stdout).settings.render.contrast_outline, true);
  assert.match(readFileSync(join(dir, 'fill.svg'), 'utf8'), /stroke="#000000"/);
  assert.equal(ok.status, 0, ok.stderr);
  const result = JSON.parse(ok.stdout);
  assert.equal(result.glyphs.length, 38);
  assert.match(readFileSync(join(dir, 'fill.svg'), 'utf8'), /fill="white"/);

  writeFileSync(request, JSON.stringify({ image: here('../examples/alice-drink-me.png'), text: 'Alice was beginning to get very tired.', render: { contrast_adjust: true } }));
  const adjusted = cli(request, '--svg', join(dir, 'adjusted.svg'), '--background', 'white');
  assert.equal(adjusted.status, 0, adjusted.stderr);
  assert.equal(JSON.parse(adjusted.stdout).settings.render.contrast_adjust, true);
  assert.doesNotMatch(readFileSync(join(dir, 'adjusted.svg'), 'utf8'), / stroke=/);

  writeFileSync(request, JSON.stringify({ image: 'missing.png', text: 'a' }));
  const bad = cli(request);
  assert.equal(bad.status, 1);
  assert.deepEqual(JSON.parse(bad.stderr).error.issues.map((/** @type {any} */ i) => i.code), ['unreadable_image']);
  assert.equal(cli(request, '--svg').status, 2);
});

test('optional glow preserves fitted glyphs and defaults to the original unfiltered SVG', () => {
  const request = { image: maskImage(16, 16, () => true), text: 'Alice soft glow', quantize: null };
  const plain = submit(request), glowing = submit({ ...request, render: { glow: true } });
  assert.equal(plain.settings.render.glow, 0);
  assert.deepEqual(glowing.glyphs, plain.glyphs);
  assert.deepEqual(glowing.history, plain.history);
  assert.equal(glowing.font_size_px, plain.font_size_px);
  assert.doesNotMatch(renderSvg(plain), /<filter/);
  const glowSvg = renderSvg(glowing, { background: '#14253d' });
  const plainSvg = renderSvg(plain, { background: '#14253d' });
  assert.deepEqual(glowSvg.match(/<use [^>]+\/>/g), plainSvg.match(/<use [^>]+\/>/g));
  assert.match(glowSvg, /<g filter="url\(#text-glow\)">/);
  assert.equal(glowing.settings.render.glow, 1);
  assert.equal(renderSvg(submit({ ...request, render: { glow: 1 } })), renderSvg(glowing));
  assert.equal(renderSvg(submit({ ...request, render: { glow: false } })), renderSvg(plain));
  const stronger = submit({ ...request, render: { glow: 3 } });
  assert.deepEqual(stronger.glyphs, plain.glyphs);
  assert.equal(stronger.font_size_px, plain.font_size_px);
  assert.notEqual(renderSvg(stronger), renderSvg(glowing));
  for (const glow of [-.1, 4.1]) assert.deepEqual(rejection({ ...request, render: { glow } }).issues.map(i => [i.path,i.code]), [['render.glow','out_of_range']]);
  assert.deepEqual(rejection({ ...request, render: { glow: 'yes' } }).issues.map(i => [i.path,i.code]), [['render.glow','wrong_type']]);
});
