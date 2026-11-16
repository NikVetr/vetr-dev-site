import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

test('browser compiler lazily migrates older syntax and keeps its current compiler for subsequent models', {timeout:30000}, async () => {
  const browser = await openPage('stan2r/');
  try {
    const result = await browser.page.evaluate(async () => {
      const path = '/stan2r/core/explorer-browser.js';
      const { analyze } = await import(path);
      const first = await analyze('parameters{real mu;}model{mu~normal(0,1);}');
      const old = await analyze('parameters{real mu[2];}model{mu~normal(0,1);}');
      const last = await analyze('parameters{array[2] real mu;}model{mu~normal(0,1);}');
      return {first:first.syntax,old:old.syntax,last:last.syntax,shape:last.nodes[0].dimensions};
    });
    assert.equal(result.first?.migrated,false);
    assert.equal(result.old?.migrated,true);
    assert.equal(result.last?.migrated,false);
    assert.equal(result.last?.compiler,'stanc 2.38.0');
    assert.deepEqual(result.shape,[{kind:'number',value:2}]);
  } finally { await browser.close(); }
});
