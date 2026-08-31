import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, parseTable, serialize, stripFormulaGuard } from '../core/csv.js';

test('quoted cells keep commas, newlines and doubled quotes', () => {
  assert.deepEqual(
    parseRows('a,"b,c","d\ne","f""g"\r\n'),
    [['a', 'b,c', 'd\ne', 'f"g']],
  );
});

test('BOM is stripped and text is NFC-normalised', () => {
  const decomposed = 'nì'; // n + combining grave
  const rows = parseRows(`﻿h\n${decomposed}\n`);
  assert.equal(rows[0][0], 'h');
  assert.equal(rows[1][0], 'nì');
});

test('parseTable keys by header and rejects ragged rows', () => {
  assert.deepEqual(parseTable('id,gloss\n1,hello\n'), [{ id: '1', gloss: 'hello' }]);
  assert.throws(() => parseTable('id,gloss\n1\n', 'x.csv'), /row 2 has 1 cells, expected 2/);
});

test('round-trips through serialize, guarding formula-leading cells', () => {
  const records = [{ id: '1', v: '=SUM(A1)' }, { id: '2', v: 'plain, with comma' }];
  const rows = parseTable(serialize(['id', 'v'], records));
  assert.equal(rows[0].v, "'=SUM(A1)");
  assert.equal(stripFormulaGuard(rows[0].v), '=SUM(A1)');
  assert.equal(rows[1].v, 'plain, with comma');
});
