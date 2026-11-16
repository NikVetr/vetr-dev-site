import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compile } from '../core/native-compiler.mjs';
import { compileCompatible, detectSyntax } from '../core/compilation.js';
import { analyze, explore } from '../core/explorer-native.mjs';
import { submit } from '../core/native.mjs';
import { declarationLines } from '../core/source-lines.js';

const legacy = 'data {int N; real y[N];} parameters {real mu; real x[N];} model {mu~normal(0,1); for(n in 1:N)x[n]~normal(mu,1); y~normal(x,1);}';
const modern = 'data {int N; array[N] real y;} parameters {real mu; array[N] real x;} model {mu~normal(0,1); for(n in 1:N)x[n]~normal(mu,1); y~normal(x,1);}';

test('legacy compiler has the pinned official-release checksum', async () => {
  const bytes = await readFile(new URL('../vendor/stanc-2.32.2.js', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'b8fb44cdab2b2fe7e4a0dfe81226a7e7a01398454896325c8f3261a9b936fa00');
});

test('syntax hints ignore comments/strings and never invent an exact authoring version', () => {
  assert.equal(detectSyntax('model { print("array"); /* array[4] real a; */ // array\n }').detected, 'undetermined');
  assert.equal(detectSyntax(modern).detected, 'modern');
  const current = compile('parameters {real x;} model {x~normal(0,1);}');
  const result = compileCompatible('source', () => ({ result:current.ast }), () => { throw Error('legacy compiler must stay unloaded'); });
  assert.equal(result.syntax.migrated, false);
  assert.match(result.syntax.description, /unknown/);
});

test('official legacy-array migration preserves graph and seeded samples, and marks normalized source', () => {
  const options = { data:{N:3}, draws:100, seed:41 };
  const old = explore({source:legacy,...options}), fresh = explore({source:modern,...options});
  assert.deepEqual(old.samples, fresh.samples);
  assert.deepEqual(old.model.edges, fresh.model.edges);
  assert.equal(old.model.syntax?.detected, 'legacy');
  assert.equal(old.model.syntax?.compiler, 'stanc 2.38.0');
  assert.match(old.model.syntax?.normalizedSource ?? '', /array\[N\] real y/);
  assert.match(old.model.warnings[0], /original editor text is unchanged/);
  const lines = old.model.syntax?.normalizedSource?.split('\n') ?? [];
  for (const node of old.model.nodes) assert.match(lines[node.line-1], new RegExp(`\\b${node.id}\\s*;`));
});

test('official migration handles removed assignment, log-density, and comment syntax', () => {
  const source = '# earlier syntax\nparameters {real x;} transformed parameters {real y; y <- x;} model {increment_log_prob(normal_log(x,0,1));}';
  const result = compile(source);
  assert.match(result.source, /target \+= normal_lpdf\(x \| 0, 1\)/);
  assert.match(result.source, /y = x/);
  assert.match(result.source, /\/\/ earlier syntax/);
  // Compiling syntax successfully does not broaden the generative interpreter.
  assert.throws(() => analyze(source), {code:'UNSUPPORTED_MODEL'});
});

test('invalid source retains current compiler errors, never an old AST or fallback simulation', () => {
  for (const source of ['parameters {real x[2];} model{x~imaginary_family(0,1);}', '#include "missing.stan"', 'parameters {real x;} model{x~normal(0);}']) {
    assert.throws(() => compile(source), {code:'STAN_ERROR'});
  }
});

test('declaration navigation locates split declarations, constraints and initializers without comments', () => {
  const source = `data {
  int N;
  // real mu;
  real<lower=0> lo;
}
parameters {
  real<lower=lo> mu,
    sigma;
  vector[N] x;
}
transformed parameters {
  real q = mu + sigma;
  vector[N] z = rep_vector(q,N);
}
model {mu~normal(0,1);sigma~normal(0,1);x~normal(0,1);}`;
  // Use the declaration mapper directly: the example is for layout, not a claim
  // that its data-dependent bounded joint prior has a generative factorization.
  const compiled = compile(source);
  assert.equal(compiled.syntax.migrated, false);
  assert.deepEqual(Object.fromEntries(declarationLines(source)), {N:2, lo:4, mu:7, sigma:8, x:9, q:12, z:13});
});

test('R conversion uses the normalized source map and matches modern-array output', async () => {
  const a = await submit({source:legacy, data:{N:3,y:[0,1,2]}});
  const b = await submit({source:modern, data:{N:3,y:[0,1,2]}});
  assert.equal(a.code,b.code);
  assert.equal(a.syntax.migrated,true);
});
