import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decodePng } from '../../shared/decode-png.mjs';

const HERE = new URL('..', import.meta.url).pathname;
const FIXTURES = join(HERE, 'tests/fixtures');
/** @param {string[]} args @param {string} [input] */
const cli = (args, input) => spawnSync(process.execPath, [join(HERE, 'cli.mjs'), ...args], { encoding: 'utf8', input });

test('the command line builds the request from images, draws the mosaic and reruns its request', () => {
  const dir = mkdtempSync(join(tmpdir(), 'photomosaic-'));
  try {
    const png = join(dir, 'mosaic.png');
    const saved = join(dir, 'request.json');
    const run = cli(['--target', join(FIXTURES, 'target-wide.png'), '--photos', join(FIXTURES, 'photos'), '--png', png, '--tile-width', '10', '--request-out', saved]);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.deepEqual([result.grid.rows, result.grid.columns], [5, 6]);
    assert.equal(result.photos.names[0], 't01.png');
    const image = decodePng(readFileSync(png));
    assert.equal(image.width, 60); // keep: each row as tall as its tallest photo at 10 px wide
    assert.ok(image.height >= 50);
    const again = cli([saved]);
    assert.equal(again.status, 0, again.stderr);
    assert.deepEqual(JSON.parse(again.stdout).assignment, result.assignment);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line adjusts the PNG towards the cells without changing the match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'photomosaic-'));
  try {
    const args = ['--target', join(FIXTURES, 'target-wide.png'), '--photos', join(FIXTURES, 'photos'), '--tile-width', '10', '--png'];
    const plain = cli([...args, join(dir, 'plain.png')]);
    const zero = cli([...args, join(dir, 'zero.png'), '--adjust', '0,0,0', '--adjust-detail', '0.5']);
    const adjusted = cli([...args, join(dir, 'adjusted.png'), '--adjust', '1,0.5,0.5', '--adjust-detail', '0.25']);
    for (const run of [plain, zero, adjusted]) assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(adjusted.stdout).assignment, JSON.parse(plain.stdout).assignment);
    const png = (/** @type {string} */ name) => readFileSync(join(dir, name));
    assert.deepEqual(png('zero.png'), png('plain.png'));
    assert.notDeepEqual(png('adjusted.png'), png('plain.png'));
    const bad = cli([...args, join(dir, 'bad.png'), '--adjust', '1.5,0,x']);
    assert.equal(bad.status, 2);
    assert.match(JSON.parse(bad.stderr).error.message, /--adjust L must be a number from 0 to 1; --adjust b must be/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line reports problems as JSON with its exit codes', () => {
  const bad = cli(['-'], JSON.stringify({ target: { width: 1, height: 1, data: 'AAAAAA==' }, photos: [{ mean: [0, 0, 0] }] }));
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.issues[0].path, 'photos[0].mean');
  const usage = cli(['--target', join(FIXTURES, 'target-wide.png')]);
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stderr).error.code, 'usage');
});
