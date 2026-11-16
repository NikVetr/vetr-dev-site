import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { checkedAST } from '../core/request.js';
import { buildModel } from '../core/model.js';
import { simulate, validateOverrides } from '../core/simulation.js';
import { examples } from '../examples.js';
const {stanc}=createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
const model=source=>buildModel(checkedAST(stanc('support_check',source,['debug-typed-ast'])).ast,source);

test('original README multilevel beta-binomial model runs unchanged with checked transformed supports',()=>{
  const e=examples.multilevel;
  assert.equal(createHash('sha256').update(e.source).digest('hex'),'30cb34f50e15b22816bfa6e57575fac03fb47d086c9e333518883e308d112297','preserve original Stan source exactly');
  const graph=model(e.source),r=simulate(graph,{data:e.data,draws:1000,seed:815});
  let residual=0,variance=0;
  for(let i=0;i<r.draws;i++) {
    assert.equal(r.samples.conc[i][0],40+3*r.samples.conc_offset[i][0]);
    for(let j=0;j<e.data.n;j++) {
      const p=r.samples.mu[i][j],conc=r.samples.conc[i][0];
      assert.ok(p>=0&&p<=1);assert.equal(r.samples.shape1[i][j],1+p*conc);assert.equal(r.samples.shape2[i][j],1+(1-p)*conc);
      const x=r.samples.x[i][j];assert.ok(Number.isInteger(x)&&x>=0&&x<=e.data.k[j]);
      assert.equal(r.samples.theta[i][j],r.samples.theta_intercept[i][0]+r.samples.theta_slope[i][0]*r.samples.k_scaled[i][j]+r.samples.theta_group[i][e.data.group[j]-1]*r.samples.theta_group_sd[i][0]);
    }
    const a=r.samples.shape1[i][0],b=r.samples.shape2[i][0],n=e.data.k[0];
    residual+=r.samples.x[i][0]-n*a/(a+b);variance+=n*a*b*(a+b+n)/((a+b)**2*(a+b+1));
  }
  assert.ok(Math.abs(residual)/Math.sqrt(variance)<4.5,'predictive outcomes agree with conditional beta-binomial means');
});

test('redundant transformed bounds are proved; restricting or unproved bounds fail explicitly',()=>{
  const safe=model('parameters{real x;}transformed parameters{real<lower=0,upper=1> p=inv_logit(x);real<lower=1> q=1+square(x);}model{x~normal(0,1);}');
  assert.doesNotThrow(()=>simulate(safe,{draws:50}));
  for(const source of [
    'parameters{real x;}transformed parameters{real<lower=0> p=x;}model{x~normal(0,1);}',
    'parameters{real x;}transformed parameters{real<lower=0,upper=1> p=1-exp(x);}model{x~normal(0,1);}',
    'parameters{real x;}transformed parameters{real<lower=2> p=1+exp(x);}model{x~normal(0,1);}',
    'data{real bound;}parameters{real x;}transformed parameters{real<lower=bound> p=square(x);}model{x~normal(0,1);}',
  ])assert.throws(()=>model(source),/not proven redundant/);
});

test('scenario overrides cannot invalidate a transformed support proof',()=>{
  const positive=model('parameters{real x;}transformed parameters{real<lower=0> p=x;}model{x~exponential(1);}');
  assert.throws(()=>validateOverrides(positive,{x:{fixed:-1}}),/not proven redundant/);
  assert.doesNotThrow(()=>simulate(positive,{draws:3,overrides:{x:{fixed:0}}}));
  const bounded=model('parameters{real x;}transformed parameters{real<lower=0,upper=1> p=x;}model{x~uniform(0,1);}');
  assert.throws(()=>simulate(bounded,{overrides:{x:{args:{1:2}}}}),/not proven redundant/);
  const fixed=simulate(bounded,{draws:4,overrides:{x:{fixed:0.5}}});
  assert.deepEqual(fixed.samples.p,[[0.5],[0.5],[0.5],[0.5]]);
});

test('observed data declaration bounds are not used to prove predictive support',()=>{
  assert.throws(()=>model('data{real<lower=0> y;} parameters{real x;} transformed parameters{real<lower=0> z=y;} model{x~normal(0,1);y~normal(x,1);}'),/not proven redundant/);
});
