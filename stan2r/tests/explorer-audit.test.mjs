import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkedAST } from '../core/request.js';
import { buildModel } from '../core/model.js';
import { simulate } from '../core/simulation.js';

const { stanc } = createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
const model = source => buildModel(checkedAST(stanc('audit', source, ['debug-typed-ast'])).ast, source);

test('independent parameters do not share random streams when their identifier hashes collide', () => {
  // These identifiers collide under the FNV-1a hash formerly used directly as the stream seed.
  const graph = model('parameters {real pe9h_2f5hmj; real p1kvw_9nlao4;} model {pe9h_2f5hmj~normal(0,1); p1kvw_9nlao4~normal(0,1);}');
  const result = simulate(graph,{draws:30,seed:31});
  assert.notDeepEqual(result.samples.pe9h_2f5hmj,result.samples.p1kvw_9nlao4);
  assert.deepEqual(simulate(graph,{draws:30,seed:31}),result,'collision resolution remains deterministic');
});

test('large finite beta shapes cannot silently collapse the distribution to zero', () => {
  const graph = model('parameters {real<lower=0,upper=1> x;} model {x~beta(1e308,1e308);}');
  const {samples} = simulate(graph,{draws:10});
  assert.ok(samples.x.every(([x])=>Math.abs(x-0.5)<1e-12));
});

test('hierarchical bound normalizers are either represented by explicit truncation or rejected', () => {
  for(const source of [
    'parameters {real mu;real<lower=0> x;} model {mu~normal(0,1);x~normal(mu,1);}',
    'parameters {real<lower=0> width;real<lower=0,upper=width> x;} model {width~exponential(1);}',
    'parameters {real mu;} transformed parameters {real<lower=0> x=mu;} model {mu~normal(0,1);}',
  ]) assert.throws(()=>model(source),{code:'UNSUPPORTED_MODEL'});
  // Keep this normalization check away from extreme rejection-sampling tails.
  const graph=model('parameters {real mu;real<lower=0> x;} model {mu~normal(0,0.3);x~normal(mu,1) T[0,];}');
  const {samples}=simulate(graph,{draws:4000,seed:9});
  assert.ok(samples.x.every(([x])=>x>=0));
  const mu=samples.mu.map(([x])=>x);
  assert.ok(Math.abs(mu.reduce((a,b)=>a+b,0)/mu.length)<0.05,'conditional truncation must not change hyperprior mean');
});

test('supplied observed constraints use observed data rather than the new predictive draw', () => {
  const graph=model('data {int<lower=0> n;int<lower=0,upper=n> y;} model {n~poisson(2);y~binomial(n,0.5);}');
  const {samples}=simulate(graph,{data:{n:20,y:10},draws:20});
  assert.ok(samples.n.some(([n])=>n<10),'predicted n can differ from the original observation');
  assert.ok(samples.y.every(([y],i)=>y<=samples.n[i][0]));
  assert.throws(()=>simulate(graph,{data:{n:1,y:10},draws:1}),{code:'SIMULATION_ERROR'});
});

test('cycles, repeated factors, transformed left-hand sides and vector product priors fail explicitly', () => {
  for(const source of [
    'parameters {real a;real b;} model {a~normal(b,1);b~normal(a,1);}',
    'parameters {real x;} model {x~normal(0,1);x~normal(2,1);}',
    'parameters {real<lower=0> x;} model {log(x)~normal(0,1);}',
    'data {real y;} transformed data {real z=y;} parameters {real x;} model {x~normal(z,1);y~normal(x,1);}',
    'data {vector[2] x;real y;} model {y~normal(x,1);}',
  ]) {
    assert.throws(()=>simulate(model(source),{data:source.includes('vector[2]')?{x:[1,2]}:{},draws:1}));
  }
});

test('whole-range independent loops retain elementwise semantics and reject extra density factors', () => {
  const vectorized=model('data {int N;vector[N] x;vector[N] y;} model {y~normal(x .* x,1);}');
  const loop=model('data {int N;vector[N] x;vector[N] y;} model {for(n in 1:N)y[n]~normal(x[n]*x[n],1);}');
  const options={data:{N:3,x:[1,2,3]},draws:20,seed:17};
  assert.deepEqual(simulate(loop,options).samples,simulate(vectorized,options).samples);
  assert.throws(()=>model('data {int N;vector[N] x;vector[N] y;} model {for(n in 1:N)y[n]~normal(x,1);}'),{code:'UNSUPPORTED_MODEL'});
});

test('Stan integer domain is enforced even where no explicit bounds appear', () => {
  const graph=model('data {int n;} parameters {real x;} model {x~normal(n,1);}');
  for(const n of [1e20,2147483648,-2147483649]) assert.throws(()=>simulate(graph,{data:{n},draws:1}),{code:'SIMULATION_ERROR'});
});

test('zero-length stochastic variables do not hide invalid scalar distribution arguments', () => {
  const graph=model('parameters {vector[0] x;} model {x~normal(0,-1);}');
  assert.throws(()=>simulate(graph,{draws:1}));
});
