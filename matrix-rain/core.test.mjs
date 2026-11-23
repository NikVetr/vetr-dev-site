import assert from 'node:assert/strict';
import test from 'node:test';
import { makeScene, frame, submit } from './core.mjs';

test('frames are reproducible across seeking, with independent rain and opening modes', () => {
  const scene = makeScene({ seed: 83, title: 'WAKE UP' });
  const opening = frame(scene, 11.2);
  assert.deepEqual(submit({ seed: 83, title: 'WAKE UP', time: 11.2 }), opening);
  assert.ok(opening.zoom > 2.9 && openTitle(opening) === 'WAKE UP');
  assert.ok(frame(scene, 16).zoom > 11 && frame(scene, 16).imageAlpha === 0);
  assert.deepEqual(frame(scene, 11.2), opening);
  const rain = submit({ mode: 'rain', time: 16 });
  assert.equal(rain.zoom, 1);
  assert.equal(rain.imageAlpha, 0);
  assert.equal(rain.blackout, 0);
  assert.ok(rain.glyphs.length);
});
function openTitle(f) {
  return f.glyphs
    .filter((g) => g.kind === 'title')
    .map((g) => g.char)
    .join('');
}
test('invalid time, controls and unknown fields produce request errors', () => {
  for (const v of [{ time: -1 }, { crt: 5 }, { seed: 0.25 }, { alphabet: '' }, { seedValue: 1 }])
    assert.throws(() => submit(v), { code: 'invalid_request' });
});

test('the opening portrait precedes both logistic title moves', () => {
  const scene = makeScene();
  for (const [time, alpha] of [[0,0],[.25,0],[.875,.5],[1.5,1],[1.75,1],[4.75,0],[14.75,0]]) {
    const shot = frame(scene, time);
    assert.equal(shot.imageAlpha, alpha);
    if (time > 0 && time < 5) assert.ok(Math.abs(shot.maskPitch / shot.imageZoom - 1.25/.78) < 1e-10);
    if (time < 8) assert.equal(openTitle(shot), '');
  }
  assert.ok(Math.abs(frame(scene, 8).zoom - 2) < 1e-6);
  assert.ok(Math.abs(frame(scene, 14.75).zoom - 7.5) < 1e-4);
  for (const title of ['The Extracellular Matrix','The Correlation Matrix','ODD','Q'.repeat(40)]) {
    const shot = frame(makeScene({title}), 11.15);
    assert.equal(openTitle(shot), title);
    assert.equal(shot.outlineAlpha + shot.imageAlpha, 0);
  }
  assert.equal(frame(scene, 15.5).blackout, 1);
});
test('rain clears the maximum portrait footprint, including during the fade', () => {
  for (const seed of [0, 1, 777, 0xffffffff]) {
    const scene = makeScene({ seed, title: 'The Extracellular Matrix', hiddenWords: ['MONTGOMERY'] });
    for (const aspect of [.625, 16/9, 4.15, 32]) {
      let firstContact = false, seenPortrait = false;
      for (let tick = 0; tick <= 60 * 5; tick++) {
        const shot = frame(scene, tick / 60, aspect);
        const imageTop = shot.viewHeight * (1 - shot.imageZoom);
        if (shot.glyphs.some(g => g.y + shot.size >= imageTop)) firstContact = true;
        if (shot.imageAlpha > 0 || shot.outlineAlpha > 0) {
          seenPortrait = true;
          assert.equal(firstContact, false, 'rain reached a visible portrait');
        }
      }
      assert.ok(firstContact && seenPortrait);
    }
  }
});

test('streams advance a whole row at a time and relight the characters in place', () => {
  const scene = makeScene({ mode: 'rain', title: '' });
  const stream = scene.streams[0];
  const column = phase => frame(scene, (stream.offset + phase) / stream.speed).glyphs.filter(g => g.column === 0);
  const first = column(4.1);
  assert.deepEqual(column(4.9), first);
  const next = column(5.1);
  assert.equal(next[0].y - first[0].y, 18);
  assert.deepEqual(next.slice(1).map(g => [g.y, g.char]), first.map(g => [g.y, g.char]));
  assert.deepEqual(column(4.1 + 30 + stream.length), first);
  const streamsAt = t => new Set(frame(scene, t).glyphs.map(g => g.column)).size;
  assert.ok(streamsAt(1) > 0 && streamsAt(1) < 20);
  assert.ok(streamsAt(3) > streamsAt(1));
});
test('each hidden phrase is readable top to bottom during an early drop in both modes', () => {
  for (const mode of ['opening', 'rain']) {
    const s = makeScene({ mode, alphabet: '0', title: 'ODD', hiddenWords: ['Ada Lovelace', 'PAGÉ'] });
    const planted = s.streams.flatMap((stream, i) => (stream.word.length ? [{ stream, i }] : []));
    assert.equal(planted.length, 4);
    const read = new Set();
    for (let t = 0; t < 8 && read.size < planted.length; t += 1/30) {
      const { glyphs } = frame(s, t);
      for (const { stream, i } of planted) {
        const text = glyphs.filter(g => g.column === i).reverse().map(g => g.char).join('');
        if (text.includes(stream.word.join(''))) read.add(i);
      }
    }
    assert.equal(read.size, planted.length);
  }
  for (const hiddenWords of ['NAME', [''], ['a'.repeat(31)], Array(85).fill('a')])
    assert.throws(() => submit({ hiddenWords }), { code: 'invalid_request' });
});

test('the opening fits a full board of maximum-length names before the zoom crops them', () => {
  const hiddenWords = Array.from({ length: 84 }, (_, i) => 'x'.repeat(27) + String(i).padStart(3, '0'));
  const scene = makeScene({ hiddenWords, seed: 0 });
  for (const aspect of [16/9, 4.15, .625]) {
    const seen = new Set();
    for (let tick = 0; tick < 6 * 30 && seen.size < hiddenWords.length; tick++) {
      const shot = frame(scene, tick / 30, aspect);
      const visible = new Map();
      const halfWidth = .45 * 960 / scene.streams.length * shot.zoom;
      for (const g of shot.glyphs) {
        if (g.x < halfWidth || g.x > 960 - halfWidth || g.y < shot.rainSize/2 || g.y > shot.viewHeight - shot.rainSize/2) continue;
        visible.set(g.column, g.char + (visible.get(g.column) ?? ''));
      }
      for (const [i, text] of visible) {
        if (text.includes(scene.streams[i].word.join(''))) seen.add(i);
      }
    }
    assert.equal(seen.size, hiddenWords.length);
  }
});

test('rain becomes the title at impact, clears before blinking, and the last letters stay under the camera', () => {
  for (const aspect of [16/9, 3.8, .8]) {
    const scene = makeScene({ title: 'THE MONTGOMERY LAB' });
    const midY = 480 / aspect;
    const titles = scene.streams.map((s, i) => ({ ...s, i })).filter(s => s.letter.trim());
    for (const { i, lock, letter } of titles) {
      const before = frame(scene, lock - .001, aspect);
      const rowPitch = midY / Math.max(1, Math.round(midY / 18)) * before.zoom;
      assert.ok(before.glyphs.some(g => g.column === i && g.kind === 'rain' && Math.abs(g.y - (midY - rowPitch)) < 1e-8));
      const at = frame(scene, lock, aspect).glyphs.filter(g => g.column === i);
      assert.ok(at.some(g => g.kind === 'title' && g.char === letter && g.y === midY));
      assert.ok(at.every(g => g.kind !== 'rain' || g.y < midY));
    }
    assert.ok(frame(scene, 3, aspect).zoom > frame(scene, 1, aspect).zoom);
    const others = titles.filter(s => !['G','O'].includes(s.letter) || Math.abs(s.i+.5-scene.targetColumn)>1);
    const afterOthers = Math.max(...others.map(s=>s.fade)) + .25;
    for (const t of [12.3,13.5,afterOthers])
      assert.ok(frame(scene, t, aspect).glyphs.every(g => g.kind === 'title'));
    assert.equal(openTitle(frame(scene, afterOthers, aspect)).trim(), 'GO');
    assert.equal(frame(scene, 15.4, aspect).glyphs.length, 0);
    const z = t => frame(scene, t, aspect).zoom;
    assert.ok(z(14.75) - z(14.5) > z(13.75) - z(13.5));
  }
  for (const title of ['', '  ', 'X', '𐐷 Y']) assert.doesNotThrow(() => frame(makeScene({ title }), 12.4));
});
