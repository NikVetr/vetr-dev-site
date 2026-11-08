// Core tests: the R parity fixture, placement invariants, the global scale, best of runs,
// validation errors, the exports and the command line. Run with `node --test` in message-collage/.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CollageError, loadFaces, parseMessages, renderPdf, renderSvg, STYLE_NAMES, submit } from '../core/index.js';
import { advances, faceKey } from '../core/fonts.js';
import { measureMessages } from '../core/measure.js';
import { inkBoxes, overlaps, rotated } from '../core/rotation.js';

const here = new URL('..', import.meta.url);
const example = parseMessages(readFileSync(new URL('examples/messages.txt', here), 'utf8'));
/** @type {{ cases: any[] }} */
const fixture = JSON.parse(readFileSync(new URL('tests/fixtures/r-parity.json', here), 'utf8'));

/** @param {unknown} request */
async function rejects(request) {
  try {
    await submit(request);
  } catch (error) {
    assert.ok(error instanceof CollageError, String(error));
    return error;
  }
  throw new Error('the request was accepted');
}

test('the R version\'s layouts are reproduced exactly: placements, scale, empty fraction, colours', async () => {
  for (const c of fixture.cases) {
    const { name, ...request } = c.request;
    const r = await submit(request);
    assert.deepEqual(r.card, c.card, name);
    assert.deepEqual(r.runs.map(({ seed, empty_fraction, height_in }) => ({ seed, empty_fraction, height_in })), c.runs, name);
    assert.deepEqual(r.messages.map(({ input_index, family, style, size, color, restarts, label }) => ({ input_index, family, style, size, color, restarts, label })), c.messages, name);
    assert.deepEqual(r.lines.map(({ message, text, col, layout_col, row, end_col, end_row, just, snapped, width, x_in, baseline_in, font_size_pt }) => (
      { message, text, col, layout_col, row, end_col, end_row, just, snapped, width, x_in, baseline_in, font_size_pt })), c.lines, name);
  }
});

test('fontkit measurements equal R\'s showtext measurements to the last bit', async () => {
  for (const c of fixture.cases) {
    const { name, ...request } = c.request;
    const r = await submit(request);
    const faces = await loadFaces(r.request.fonts, r.request.styles);
    const fonts = c.messages.map((/** @type {any} */ m) => ({ family: m.family, style: STYLE_NAMES[m.style - 1], size: m.size }));
    const dims = measureMessages(r.messages.map((m) => m.text), fonts, faces, c.card.n_cols, c.card.target_rows, r.request.width_in, r.request.height_in);
    assert.deepEqual(dims.map(({ w, ws, h, total }) => ({ w, ws, h, total })), c.kept_dims, name);
  }
});

const shared = submit({ messages: example, seed: 7, runs: 2 });

/** @param {Int32Array} grid @param {number} k @param {number} message */
function claim(grid, k, message) {
  assert.ok(grid[k] === 0 || grid[k] === message, `cell ${k} of message ${message}`);
  grid[k] = message;
}

test('lines lie inside the card, never overlap across messages, and make up the grid', async () => {
  const r = await shared;
  const { n_cols: cols, n_rows: rows } = r.card;
  const layout = new Int32Array(rows * cols);
  const final = new Int32Array(rows * cols);
  for (const l of r.lines) {
    assert.ok(l.col >= 1 && l.end_col <= cols && l.row >= 1 && l.end_row <= rows, `line ${l.line} of message ${l.message}`);
    const shift = l.layout_col - l.col;
    for (let row = l.row; row <= l.end_row; row++) {
      for (let c = l.col; c <= l.end_col; c++) {
        claim(layout, (row - 1) * cols + c + shift - 1, l.message);
        claim(final, (row - 1) * cols + c - 1, l.message);
      }
    }
  }
  const empty = layout.filter((v) => v === 0).length;
  assert.equal(r.card.empty_fraction, empty / layout.length);
});

test('every message is placed once, in order, with its lines flowing downward', async () => {
  const r = await shared;
  for (const m of r.messages) {
    const lines = r.lines.filter((l) => l.message === m.index);
    assert.equal(lines.map((l) => l.text).join(' '), m.text);
    assert.equal(m.text, example[m.input_index - 1]);
    for (let k = 1; k < lines.length; k++) assert.ok(lines[k].row > lines[k - 1].row);
  }
  assert.deepEqual(r.messages.map((m) => m.input_index).sort((a, b) => a - b), example.map((_, i) => i + 1));
});

test('drawn text fits the cells allocated to it', async () => {
  const r = await shared;
  const faces = await loadFaces(r.request.fonts, r.request.styles);
  const cellIn = r.card.width_in / ((1 + 2 * r.card.margin) * r.card.n_cols);
  for (const l of r.lines) {
    const face = /** @type {import('../core/fonts.js').Face} */ (faces.get(faceKey(l.family, l.style_name)));
    const drawnIn = advances(face, l.text).reduce((a, b) => a + b, 0) * l.font_size_pt / face.unitsPerEm / 72;
    assert.ok(drawnIn <= l.width * cellIn + 1e-12, `line ${l.line} of message ${l.message}`);
    assert.ok(l.x_in + drawnIn <= (r.card.margin * r.card.n_cols + l.end_col) * cellIn + 1e-12);
  }
});

test('the global scale makes single-line text cover fill^2 of the card', async () => {
  const r = await shared;
  const faces = await loadFaces(r.request.fonts, r.request.styles);
  const fonts = r.messages.map((m) => ({ family: m.family, style: m.style_name, size: m.size }));
  const dims = measureMessages(r.messages.map((m) => m.text), fonts, faces, r.card.n_cols, r.card.target_rows, 5, 5);
  const area = dims.reduce((a, d) => a + d.total, 0) * r.card.cex_scale ** 2;
  assert.ok(Math.abs(area / (r.card.n_cols * r.card.target_rows) - 0.7 ** 2) < 1e-12);
});

test('the best of the runs is kept, and the same request gives the same result', async () => {
  const r = await shared;
  assert.equal(r.card.empty_fraction, Math.min(...r.runs.map((run) => run.empty_fraction)));
  assert.deepEqual(r.runs.map((run) => run.seed), [8, 9]);
  assert.deepEqual(await submit({ messages: example, seed: 7, runs: 2 }), r);
});

test('gentle angles preserve the layout and keep every message clear of other glyphs and card edges', async () => {
  const request = { ...JSON.parse(readFileSync(new URL('examples/request.json', here), 'utf8')), expand_messages: false };
  const result = await submit(request);
  const horizontal = await submit({ ...request, rotation_deg: 0 });
  assert.deepEqual(result.lines, horizontal.lines);
  assert.deepEqual(result.card, horizontal.card);
  assert.deepEqual(await submit(request), result);
  const angles = result.messages.flatMap(m => m.rotation ? [m.rotation.angle_deg] : []);
  assert.ok(angles.length > 20 && angles.some(a => a < -1) && angles.some(a => a > 1));
  assert.ok(angles.every(a => Math.abs(a) <= request.rotation_deg));
  const faces = await loadFaces(result.request.fonts, result.request.styles);
  const boxes = inkBoxes(result, faces).map(box => {
    const rotation = result.messages.find(m => m.index === box.message)?.rotation;
    return { ...box, points: rotation ? rotated(box.points, rotation) : box.points };
  });
  for (const [i, a] of boxes.entries()) {
    assert.ok(a.points.every(([x, y]) => x >= 0 && y >= 0 && x <= result.card.width_in && y <= result.card.height_in));
    for (const b of boxes.slice(i + 1)) if (a.message !== b.message) assert.ok(!overlaps(a.points, b.points), `messages ${a.message} and ${b.message}`);
  }
  assert.match(renderSvg(result, faces), /transform="rotate\(/);
  assert.match(renderSvg(result, faces, { text: 'embedded' }), /transform="rotate\(/);
  assert.ok(new TextDecoder().decode(renderPdf(result, faces)).includes(' cm\n'));
  assert.ok((await rejects({ messages: example, rotation_deg: 11 })).issues.some(i => i.path === 'rotation_deg'));
});

test('expansion fills spare space without changing text, fonts, line breaks or angles', async () => {
  const request = JSON.parse(readFileSync(new URL('examples/request.json', here), 'utf8'));
  for (const seed of [1, 2, 3, 4]) {
    const baseline = await submit({ ...request, seed, expand_messages: false });
    const result = await submit({ ...request, seed, expand_messages: true });
    const faces = await loadFaces(result.request.fonts, result.request.styles);
    assert.deepEqual(result.card, baseline.card);
    assert.deepEqual(result.lines.map(l => [l.message, l.text, l.family, l.style_name, l.color]), baseline.lines.map(l => [l.message, l.text, l.family, l.style_name, l.color]));
    assert.deepEqual(result.messages.map(m => m.rotation?.angle_deg), baseline.messages.map(m => m.rotation?.angle_deg));
    assert.ok(result.messages.every(m => typeof m.expansion === 'number' && m.expansion >= 1 && m.expansion <= 1.8));
    const raw = inkBoxes(result, faces);
    const area = (/** @type {ReturnType<typeof inkBoxes>} */ boxes) => boxes.reduce((sum, b) => sum + (b.points[1][0] - b.points[0][0]) * (b.points[2][1] - b.points[1][1]), 0);
    assert.ok(area(raw) > area(inkBoxes(baseline, faces)) * 1.08, `seed ${seed}: at least 8% larger text bounds`);
    const boxes = raw.map(box => {
      const rotation = result.messages[box.message - 1].rotation;
      return { ...box, points: rotation ? rotated(box.points, rotation) : box.points };
    });
    for (const [i, a] of boxes.entries()) {
      assert.ok(a.points.every(([x, y]) => x >= 0 && y >= 0 && x <= result.card.width_in && y <= result.card.height_in));
      for (const b of boxes.slice(i + 1)) if (a.message !== b.message) assert.ok(!overlaps(a.points, b.points), `seed ${seed}: messages ${a.message} and ${b.message}`);
    }
    if (seed === 1) assert.deepEqual(await submit({ ...request, seed }), result);
  }
  assert.ok((await rejects({ messages: example, expand_messages: 'yes' })).issues.some(i => i.path === 'expand_messages'));
});

test('a single message lays out at a low fill, and fails with a hint at the default', async () => {
  const one = await submit({ messages: ['Thank you for everything.'], seed: 2, fill: 0.2 });
  assert.equal(one.lines.map((l) => l.text).join(' '), 'Thank you for everything.');
  const error = await rejects({ messages: ['Thank you for everything.'] });
  assert.equal(error.code, 'word_too_wide');
  assert.match(error.message, /lower fill/);
});

test('invalid requests list every problem, with its path', async () => {
  const error = await rejects({
    messages: ['ok', '  ', 3], colour: 'red', fonts: ['Inter', 'Comic Sans', 'Inter'], styles: ['heavy'],
    size_range: [3, 1], width_in: -5, fill: 'lots', runs: 0, seed: 1.5, palette: ['#123456', 'red'], background: '#12345', shuffle: 'yes',
  });
  assert.equal(error.code, 'invalid_request');
  const paths = error.issues.map((i) => i.path);
  for (const path of ['colour', 'messages[1]', 'messages[2]', 'fonts[1]', 'fonts[2]', 'styles[0]', 'size_range', 'width_in', 'fill', 'runs', 'seed', 'palette[1]', 'background', 'shuffle']) {
    assert.ok(paths.includes(path), `${path} in ${paths.join(', ')}`);
  }
  assert.deepEqual((await rejects({})).issues.map((i) => i.code), ['missing_field']);
  assert.deepEqual((await rejects([])).issues.map((i) => i.code), ['wrong_type']);
});

test('characters a requested font lacks are an error naming the font', async () => {
  const error = await rejects({ messages: ['Спасибо', 'Thanks'], fonts: ['Lobster Two', 'Inter'] });
  assert.equal(error.code, 'missing_glyphs');
  assert.deepEqual(error.issues.map((i) => i.path), ['messages[0]']);
  assert.match(error.issues[0].message, /Lobster Two has no glyph for "С" \(U\+0421\)/);
});

test('exports: outlined and embedded SVG, and PDF', async () => {
  const r = await submit({ messages: example.slice(0, 5), seed: 3 });
  const faces = await loadFaces(r.request.fonts, r.request.styles);
  const outlined = renderSvg(r, faces);
  const glyphs = r.lines.reduce((n, l) => n + [...l.text].filter((ch) => ch !== ' ').length, 0);
  assert.equal(outlined.match(/<use /g)?.length, glyphs);
  assert.ok(outlined.startsWith('<svg') && outlined.includes('width="5in"'));
  const embedded = renderSvg(r, faces, { text: 'embedded' });
  assert.equal(embedded.match(/<text /g)?.length, r.lines.length);
  assert.ok(embedded.includes('@font-face') && embedded.includes(r.lines[0].text.replace(/&/g, '&amp;')));
  const pdf = new TextDecoder().decode(renderPdf(r, faces));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  const xref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
  assert.equal(pdf.slice(xref, xref + 4), 'xref');
  [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n /g)].forEach((m, i) => {
    const offset = Number(m[1]);
    assert.equal(pdf.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
});

test('the worked example in api.md is what the core returns', async () => {
  const doc = readFileSync(new URL('api.md', here), 'utf8');
  const request = JSON.parse(/** @type {string} */ (/`request.json`:\n\n```json\n([\s\S]*?)```/.exec(doc)?.[1]));
  const shown = JSON.parse(/** @type {string} */ (/prints \(abridged[^\n]*\n\n```json\n([\s\S]*?)```/.exec(doc)?.[1]));
  const r = await submit(request);
  assert.deepEqual(r.card, shown.card);
  assert.deepEqual(r.messages[0], shown.messages[0]);
  assert.deepEqual(r.lines.slice(0, 2), shown.lines);
  assert.deepEqual(r.runs, shown.runs);
  assert.equal(r.lines.length, 10);
});

test('the command line prints the result, and errors as JSON with exit status 1 or 2', () => {
  const cli = new URL('cli.mjs', here).pathname;
  const out = JSON.parse(execFileSync('node', [cli, '--messages', new URL('examples/messages.txt', here).pathname], { encoding: 'utf8' }));
  assert.equal(out.messages.length, example.length);
  const bad = spawnSync('node', [cli], { input: '{"messages": []}', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.code, 'invalid_request');
  const usage = spawnSync('node', [cli, '--svg'], { input: '', encoding: 'utf8' });
  assert.equal(usage.status, 2);
});
