// The flash-rate ceiling is arithmetic, so it is tested as arithmetic: a pattern is
// laid out on a simulated clock and the busiest rolling second is counted. Nothing
// here flashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUnits, unitMs, safeUnitMs, peakFlashRate, MIN_UNIT_MS } from '../core/morse.js';

test('a unit is never shorter than the floor, however fast the speed asked for', () => {
  assert.equal(safeUnitMs(unitMs(20)), MIN_UNIT_MS);
  assert.equal(safeUnitMs(unitMs(12)), MIN_UNIT_MS);
  assert.equal(safeUnitMs(300), 300);
  assert.equal(safeUnitMs(0), MIN_UNIT_MS);
  assert.equal(safeUnitMs(Number.NaN), MIN_UNIT_MS);
});

test('the worst pattern at the floor stays under three flashes in any second', () => {
  // A run of E is a run of dots: one unit lit, one dark, the fastest Morse can strobe.
  const dots = toUnits('EEEEEEEEEEEEEEEE');
  assert.ok(peakFlashRate(dots, MIN_UNIT_MS) <= 3, `${peakFlashRate(dots, MIN_UNIT_MS)} flashes/s`);
  // Which is exactly what the unclamped 20 wpm would have broken.
  assert.ok(peakFlashRate(dots, unitMs(20)) > 3);
  // And the mixed case: short letters with letter gaps between them.
  const mixed = toUnits('EE EIE TE E EE SOS');
  assert.ok(peakFlashRate(mixed, safeUnitMs(unitMs(20))) <= 3);
});

test('SOS at its own fixed dot is slower still: two dots in a second, never three', () => {
  assert.equal(peakFlashRate(toUnits('SOS'), 300), 2);
});
