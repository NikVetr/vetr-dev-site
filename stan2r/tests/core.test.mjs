import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { submit } from '../core/native.mjs';
import { validateRequest, conversionCall } from '../core/request.js';

const reference = JSON.parse(await readFile(new URL('./fixtures/native-reference.json', import.meta.url), 'utf8'));

test('vendored R source matches the hardened translator manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../vendor/manifest.json', import.meta.url), 'utf8'));
  for (const [name, hash] of Object.entries(manifest.files)) {
    const bytes = await readFile(new URL(`../vendor/R/${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
});

test('native adapter matches original native stanc/Stan2R in all four modes', async t => {
  for (const fixture of reference.fixtures) await t.test(`${fixture.name}: ${fixture.request.mode}`, async () => {
    const result = await submit(fixture.request);
    assert.equal(result.code, fixture.code);
    assert.deepEqual(result.warnings, []);
  });
});

test('invalid requests and compiler/converter limitations fail explicitly', async () => {
  const source = 'parameters {real x;} model {x ~ normal(0,1);}';
  for (const request of [{source, extra:true}, {source, mode:'guess'}, {source, data:{x:[1,NaN]}}, {source, data:{x:[[1],[2,3]]}}, {source, mode:'posterior_predictive'}, {source, draws:{x:[1], y:[2,3]}}, {source, sampleIndex:0}]) {
    assert.throws(() => validateRequest(request), {code:'INVALID_REQUEST'});
  }
  await assert.rejects(submit({source:'parameters {real x;} model { x ~ unknown(1); }'}), {code:'STAN_ERROR'});
  await assert.rejects(submit({source:'parameters {real x;} model {}'}), {code:'UNSUPPORTED_CONSTRUCT'});
  await assert.rejects(submit({source:'#include "absent.stan"'}), {code:'STAN_ERROR'});
});

test('data and draws use faithful R literals, including matrices and CmdStan names', () => {
  const call = conversionCall({source:'model {}',data:{matrix:[[1,2],[3,4]],empty:[]},draws:{'theta[1]':[0.2]}});
  assert.match(call,/matrix\(c\(1,2,3,4\), nrow=2, byrow=TRUE\)/);
  assert.match(call,/numeric\(0\)/);
  assert.match(call,/'theta\[1\]'|"theta\[1\]"/);
});

test('inherited prior approximations remain visible warnings', async () => {
  const result = await submit({source:'parameters {real mu; real<lower=0> sigma;} model {mu ~ normal(0,1); sigma ~ normal(mu,1);}'});
  assert.equal(result.warnings.length,1);
  assert.match(result.warnings[0],/draws differ from Stan's joint prior/);
});
