import test from 'node:test';
import assert from 'node:assert/strict';
import { seqLength } from '../rstats.js';

test('seqLength matches R seq(from, to, length.out = n) at the small lengths', () => {
  assert.deepEqual(seqLength(1, 5, 0), []); // seq(1, 5, length.out = 0) is integer(0)
  assert.deepEqual(seqLength(3, 3, 0), []);
  assert.deepEqual(seqLength(1, 5, 1), [1]);
  assert.deepEqual(seqLength(1, 5, 2), [1, 5]);
  assert.deepEqual(seqLength(1, 5, 3), [1, 3, 5]);
  assert.deepEqual(seqLength(2, 2, 3), [2, 2, 2]);
});
