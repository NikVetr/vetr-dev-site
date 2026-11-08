import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { submit } from '../core/index.js';
import { BALANCED_STYLE, LAYOUT_PRESETS } from '../presets.js';

const names = readFileSync(new URL('../examples/historical-figures.txt', import.meta.url), 'utf8').trim().split('\n');

test('balanced laser preset improves name widths and horizontal overlap without losing whole twists', () => {
  const baseline = submit({ names });
  const balanced = submit({ names, style: BALANCED_STYLE });
  const metric = (/** @type {ReturnType<typeof submit>} */ result) => {
    const fits = result.tags.map(tag => tag.fit);
    return {
      ratio: fits.reduce((sum, f) => sum + f.w1 / (f.h2 / f.ar3), 0) / fits.length,
      overlap: fits.reduce((sum, f) => {
        const lowerWidth = f.h2 / f.ar3, lowerStart = f.w2 + 0.2 * f.h2;
        return sum + (Math.min(f.w1, lowerStart + lowerWidth) - lowerStart) / Math.min(f.w1, lowerWidth);
      }, 0) / fits.length,
    };
  };
  const old = metric(baseline), now = metric(balanced);
  assert.ok(now.ratio < old.ratio * 0.9);
  assert.ok(now.overlap > 0.89 && now.overlap > old.overlap + 0.1);
  assert.ok(balanced.tags.every(tag => tag.fit.ntwists >= 1));
  assert.equal(submit({ names, style: LAYOUT_PRESETS.original }).sheets[0].svg, baseline.sheets[0].svg);
});

test('balanced proportions retain usable fits for short and strongly unequal lines', () => {
  // Al Ng previously had no whole-twist fit; W | I collapsed to a nearly
  // invisible lower line with more than a thousand helix twists.
  for (const family of ['Inter', 'Source Serif Pro']) {
    for (const seed of [1, 42]) {
      for (const name of ['Al Ng', 'W | I', 'Christopher Li', 'Bo Konstantinopoulos']) {
        const result = submit({ names: [name], style: BALANCED_STYLE, font: { family }, seed });
        const f = result.tags[0].fit;
        const context = `${name}, ${family}, seed ${seed}`;
        assert.ok(f.ntwists >= 1 && f.ntwists <= 4, `${context}: excessive or missing helix twists`);
        assert.ok(Number.isFinite(f.objective), `${context}: non-finite fit`);
        assert.ok(f.h2 / f.ar3 > 0.005, `${context}: collapsed lower line`);
        assert.equal(result.warnings.length, 0, `${context}: fit needed retries`);
      }
    }
  }
});

test('Li Wu rejects a DNA fit with no whole twist and supports an explicit text-only request', () => {
  for (const [preset, style] of Object.entries(LAYOUT_PRESETS)) {
    const request = { names: ['Li Wu'], style };
    assert.throws(() => submit(request), (/** @type {any} */ error) => {
      assert.equal(error.code, 'fit_failed', preset);
      assert.match(error.message, /Li Wu/);
      assert.match(error.message, /Decoration → None/);
      assert.match(error.message, /more restarts may not help/);
      assert.equal(error.issues[0].path, 'style.optimizer.restarts');
      return true;
    });
    const result = submit({ ...request, decoration: 'none' });
    assert.equal(result.tags.length, 1);
    assert.equal(result.tags[0].name, 'Li Wu');
    assert.equal(result.tags[0].decoration, 'none');
    assert.equal(result.tags[0].fit, null);
    assert.doesNotMatch(result.sheets[0].svg, /NaN|Infinity/);
    assert.deepEqual(result.warnings, []);
  }
});
