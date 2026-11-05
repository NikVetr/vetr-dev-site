import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { decodePng } from '../../crossword/decode-png.mjs';

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

test('the command line reports problems as JSON with its exit codes', () => {
  const bad = cli(['-'], JSON.stringify({ target: { width: 1, height: 1, data: 'AAAAAA==' }, photos: [{ mean: [0, 0, 0] }] }));
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).error.issues[0].path, 'photos[0].mean');
  const usage = cli(['--target', join(FIXTURES, 'target-wide.png')]);
  assert.equal(usage.status, 2);
  assert.equal(JSON.parse(usage.stderr).error.code, 'usage');
});
