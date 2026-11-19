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
  assert.equal(rain.blackout, 0);
  assert.ok(rain.glyphs.length);
});
function openTitle(f) {
  return f.glyphs
    .filter((g) => g.hot && g.y === 270)
    .map((g) => g.char)
    .join('');
}
test('invalid time, controls and unknown fields produce request errors', () => {
  for (const v of [{ time: -1 }, { crt: 5 }, { seed: 0.25 }, { alphabet: '' }, { seedValue: 1 }])
    assert.throws(() => submit(v), { code: 'invalid_request' });
});

test('the title centers on the optical axis; outline precedes focus and the mask follows the image', () => {
  for (const title of ['The Extracellular Matrix', 'The Correlation Matrix', 'ODD', 'Q'.repeat(40)]) {
    const s = makeScene({ title });
    const f = frame(s, 11.15);
    const line = [...title].map((char, i) => {
      const x = 480 + (i - (title.length - 1) / 2) * (960 / 84) * f.zoom;
      return f.glyphs.find((g) => g.char === char && g.y === 270 && Math.abs(g.x - x) < 1e-9);
    });
    assert.ok(line.every(Boolean));
    const outline = frame(s, 13.5),
      midway = frame(s, 15),
      end = frame(s, 16);
    assert.equal(f.imageAlpha + f.outlineAlpha, 0);
    assert.ok(outline.outlineAlpha > 0 && outline.imageAlpha === 0 && outline.zoom > f.zoom);
    assert.ok(outline.imageZoom >= 0.75 && outline.imageZoom < 0.85);
    assert.ok(midway.imageZoom > outline.imageZoom && midway.imageZoom < end.imageZoom);
    assert.ok(0.09 * 810 * end.imageZoom > 800, 'one lens nearly spans the film');
    assert.equal(frame(s, 15.55).blackout, 0);
    assert.ok(frame(s, 15.75).blackout > 0 && frame(s, 15.75).blackout < 1);
    assert.equal(end.blackout, 1);
    assert.ok(midway.imageAlpha > 0 && midway.rainBlur > 0 && midway.zoom > outline.zoom);
    assert.equal(end.imageAlpha, 1);
    assert.ok(frame(s, 14.2).rainAlpha > end.rainAlpha);
    const progress = (t) => frame(s, t).cameraProgress;
    assert.ok(progress(14.85) - progress(14.35) > 2 * (progress(14.0) - progress(13.5)));
    for (const shot of [midway, end])
      assert.ok(Math.abs(shot.maskPitch / shot.imageZoom - outline.maskPitch / outline.imageZoom) < 1e-10);
  }
});
test('each hidden phrase is readable top to bottom during an early drop in both modes', () => {
  for (const mode of ['opening', 'rain']) {
    const s = makeScene({ mode, alphabet: '0', title: 'ODD', hiddenWords: ['Ada Lovelace', 'PAGÉ'] });
    const planted = s.streams.flatMap((stream, i) => (stream.word.length ? [{ stream, i }] : []));
    assert.equal(planted.length, 4);
    for (const { stream, i } of planted) {
      const t = stream.start + (stream.word.length + 2.1) / stream.speed;
      const f = frame(s, t);
      const column = f.glyphs
        .filter((g) => g.column === i)
        .sort((a, b) => a.y - b.y);
      assert.ok(
        column
          .map((g) => g.char)
          .join('')
          .includes(stream.word.join('')),
      );
    }
  }
  for (const hiddenWords of ['NAME', [''], ['a'.repeat(31)], Array(85).fill('a')])
    assert.throws(() => submit({ hiddenWords }), { code: 'invalid_request' });
});

test('rain becomes the title at impact, clears before blinking, and the last letters stay under the camera', () => {
  for (const aspect of [16/9, 3.8, .8]) {
    const scene = makeScene({ title: 'THE MONTGOMERY LAB' });
    const midY = 480 / aspect;
    const titles = scene.streams.map((s, i) => ({ ...s, i })).filter(s => s.letter.trim());
    for (const { i, lock, letter } of titles) {
      const before = frame(scene, lock - .001, aspect).glyphs.filter(g => g.column === i);
      assert.ok(before.some(g => g.kind === 'rain' && g.y < midY && g.y > midY - 2));
      const at = frame(scene, lock, aspect).glyphs.filter(g => g.column === i);
      assert.ok(at.some(g => g.kind === 'title' && g.char === letter && g.y === midY));
      assert.ok(at.every(g => g.kind !== 'rain' || g.y < midY));
    }
    assert.ok(frame(scene, 3, aspect).zoom > frame(scene, 1, aspect).zoom);
    for (const t of [10.86, 11.8, 12.42, 13.5])
      assert.ok(frame(scene, t, aspect).glyphs.every(g => g.kind === 'title'));
    const pair = frame(scene, 12.42, aspect).glyphs;
    assert.equal(pair.map(g => g.char).join(''), 'GO');
    assert.equal(frame(scene, 12.8, aspect).glyphs.length, 0);
    const z = t => frame(scene, t, aspect).zoom;
    assert.ok(z(12.15) - z(12) > z(11.43) - z(11.28));
  }
  for (const title of ['', '  ', 'X', '𐐷 Y']) assert.doesNotThrow(() => frame(makeScene({ title }), 12.4));
});
