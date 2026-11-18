import assert from 'node:assert/strict';
import test from 'node:test';
import { makeScene, frame, submit } from './core.mjs';

test('frames are reproducible across seeking, with independent rain and opening modes', () => {
  const scene = makeScene({ seed: 83, title: 'WAKE UP' });
  const opening = frame(scene, 11.2);
  assert.deepEqual(submit({ seed: 83, title: 'WAKE UP', time: 11.2 }), opening);
  assert.ok(opening.zoom > 2.9 && openTitle(opening) === 'WAKE UP');
  assert.ok(frame(scene, 16).zoom > 11 && frame(scene, 16).imageAlpha > 0.99);
  assert.deepEqual(frame(scene, 11.2), opening);
  const rain = submit({ mode: 'rain', time: 16 });
  assert.equal(rain.zoom, 1);
  assert.equal(rain.imageAlpha, 0);
  assert.ok(rain.glyphs.length);
});
function openTitle(f) {
  return f.glyphs
    .filter((g) => g.hot && g.y === 270 + f.size / 2)
    .map((g) => g.char)
    .join('');
}
test('invalid time, controls and unknown fields produce request errors', () => {
  for (const v of [{ time: -1 }, { crt: 5 }, { seed: 0.25 }, { alphabet: '' }, { seedValue: 1 }])
    assert.throws(() => submit(v), { code: 'invalid_request' });
});
