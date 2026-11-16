import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { buildModel } from '../core/model.js';
import { simulate, validateOverrides } from '../core/simulation.js';
import { checkedAST } from '../core/request.js';
import { examples } from '../examples.js';
const { stanc } = createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
const model=source=>buildModel(checkedAST(stanc('explorer',source,['debug-typed-ast'])).ast,source);
/** @param {number[][]} draws */
function moments(draws) {const xs=draws.map(x=>x[0]),mean=xs.reduce((a,b)=>a+b,0)/xs.length;return {mean,variance:xs.reduce((a,b)=>a+(b-mean)**2,0)/xs.length};}
/** @param {number} actual @param {number} expected @param {number} tolerance */
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} should be within ${tolerance} of ${expected}`);

test('normal model: DAG, half-normal parameter, predictive moments and reproducibility',()=>{
  const m=model(examples.normal.source);
  assert.deepEqual(m.order,['N','mu','sigma','y']);
  assert.ok(m.edges.some(e=>e.from==='sigma'&&e.to==='y'));
  const r=simulate(m,{data:{N:2},draws:10000,seed:812});
  near(moments(r.samples.mu).mean,0,.07);near(moments(r.samples.mu).variance,4,.2);
  near(moments(r.samples.sigma).mean,Math.sqrt(2/Math.PI),.025);
  assert.ok(r.samples.sigma.every(x=>x[0]>=0));
  near(moments(r.samples.y).mean,0,.08);near(moments(r.samples.y).variance,5,.25);
  assert.ok(r.samples.y.every(x=>x.length===2));
  assert.deepEqual(simulate(m,{data:{N:2},draws:20,seed:812}).samples.mu,r.samples.mu.slice(0,20));
});

test('beta-binomial moments and integer support; observed data are optional',()=>{
  const r=simulate(model(examples.binomial.source),{data:{trials:20},draws:10000,seed:98});
  near(moments(r.samples.theta).mean,.5,.01);near(moments(r.samples.theta).variance,.05,.003);
  near(moments(r.samples.successes).mean,10,.2);near(moments(r.samples.successes).variance,24,1);
  assert.ok(r.samples.successes.every(([x])=>Number.isInteger(x)&&x>=0&&x<=20));
});

test('hierarchical transformed parameters preserve joint dependence, vector shape and deterministic identities',()=>{
  const m=model(`data { int<lower=1> N; vector[N] y; } parameters { real mu; real<lower=0> tau; vector[N] z; }
  transformed parameters { vector[N] theta = mu + tau * z; real variance = square(tau); }
  model { y ~ normal(theta,0.5); z ~ normal(0,1); tau ~ normal(0,1); mu ~ normal(0,2); }`);
  const r=simulate(m,{data:{N:3},draws:1000});
  for(let i=0;i<1000;i++) {
    assert.equal(r.samples.variance[i][0],r.samples.tau[i][0]**2);
    for(let j=0;j<3;j++)near(r.samples.theta[i][j],r.samples.mu[i][0]+r.samples.tau[i][0]*r.samples.z[i][j],1e-12);
  }
  const fixed=simulate(m,{data:{N:3},draws:1000,overrides:{tau:{fixed:0}}});
  assert.ok(fixed.samples.theta.every((x,i)=>x.every(v=>v===fixed.samples.mu[i][0])));
  assert.deepEqual(fixed.samples.mu,r.samples.mu,'fixing one parameter preserves unrelated RNG streams');
  assert.deepEqual(fixed.samples.z,r.samples.z,'per-variable streams keep standardized innovations stable');
  assert.ok(fixed.warnings.some(x=>x.includes('Scenario')));
});

test('independent full-range loops normalize exactly to vectorized sampling',()=>{
  const prefix='data {int<lower=1> N;vector[N] y;} parameters {vector[N] theta;real sigma;} model {theta~normal(0,1);sigma~uniform(0.1,2);';
  const vector=model(prefix+'y~normal(theta,sigma);}');
  const loop=model(prefix+'for(n in 1:N){y[n]~normal(theta[n],sigma);}}');
  assert.deepEqual(simulate(loop,{data:{N:4},draws:100}),simulate(vector,{data:{N:4},draws:100}));
  assert.throws(()=>model(prefix+'for(n in 1:N)y[n]~normal(theta,sigma);}'),/multiple density factors/);
  assert.throws(()=>model(prefix+'for(n in 2:N)y[n]~normal(theta[n],sigma);}'),/starting at 1/);
  assert.throws(()=>model(prefix+'for(n in 1:N)y[n]~normal(n,sigma);}'),/loop counter/);
});

test('distribution parameterizations agree with analytic moments',()=>{
  const source=`parameters {real g;real l;real e;real t;real u;}model{g~gamma(4,2);l~lognormal(0,0.5);e~exponential(2);t~student_t(8,2,1.5);u~uniform(-2,4);}`;
  const r=simulate(model(source),{draws:10000,seed:42});
  near(moments(r.samples.g).mean,2,.06);near(moments(r.samples.g).variance,1,.08);
  near(moments(r.samples.l).mean,Math.exp(.125),.04);
  near(moments(r.samples.e).mean,.5,.02);
  near(moments(r.samples.t).mean,2,.07);near(moments(r.samples.t).variance,3,.25);
  near(moments(r.samples.u).mean,1,.08);near(moments(r.samples.u).variance,3,.1);
  const p=simulate(model('data {int y; int z;} model {y~poisson(60);z~bernoulli_logit(1);}'),{draws:10000,seed:53});
  near(moments(p.samples.y).mean,60,.3);near(moments(p.samples.y).variance,60,2);
  near(moments(p.samples.z).mean,1/(1+Math.exp(-1)),.015);
});

test('data declaration bounds do not silently truncate predictive outcomes',()=>{
  const m=model('data {real<lower=0> y;} model {y ~ normal(0,1);}');
  const r=simulate(m,{data:{y:1},draws:1000});
  assert.ok(r.samples.y.some(([x])=>x<0));
  assert.throws(()=>simulate(m,{data:{y:-1}}),/violates declared bounds/);
  const explicit=simulate(model('data {real<lower=0> y;} model {y ~ normal(0,1) T[0,];}'),{draws:1000});
  assert.ok(explicit.samples.y.every(([x])=>x>=0));
});

test('parameter-dependent normalization is rejected unless explicit truncation or natural support makes it exact',()=>{
  assert.throws(()=>model('parameters {real mu;real<lower=0> x;}model{mu~normal(0,1);x~normal(mu,1);}'),/normalizing constant/);
  const explicit=model('parameters {real mu;real<lower=0> x;}model{mu~normal(0,1);x~normal(mu,1) T[0,];}');
  assert.ok(simulate(explicit,{draws:100}).samples.x.every(([x])=>x>=0));
  const natural=model('parameters {real<lower=0> rate;real<lower=0> x;}model{rate~gamma(3,1);x~exponential(rate);}');
  assert.ok(simulate(natural,{draws:100}).samples.x.every(([x])=>x>=0));
});

test('missing priors, multiple factors, cycles and unsupported constructs fail explicitly',()=>{
  assert.throws(()=>model('parameters {real x;} model {}'),/no supported proper prior/);
  assert.throws(()=>model('parameters {real x;}model{x~normal(0,1);x~normal(1,1);}'),/Multiple density factors/);
  assert.throws(()=>model('parameters {real x;real z;}model{x~normal(z,1);z~normal(x,1);}'),/Circular dependency/);
  assert.throws(()=>model('parameters {real x;}model{target += normal_lpdf(x|0,1);}'),/TargetPE/);
  assert.throws(()=>model('parameters {real x;}transformed parameters {real<lower=0> z=x;}model{x~normal(0,1);}'),/Constrained transformed/);
  assert.throws(()=>model('data {int N;}transformed data {int k=N/2;}parameters{real x;}model{x~normal(k,1);}'),/integer division/);
  assert.throws(()=>model('parameters {matrix[2,2] x;}model{to_vector(x)~normal(0,1);}'),/declared type/);
});

test('shape, data, overrides, domains and resource limits fail explicitly',()=>{
  const m=model(examples.normal.source);
  assert.throws(()=>simulate(m),/Missing required data N/);
  assert.throws(()=>simulate(m,{data:{N:2,y:[1]}}),/declared shape/);
  assert.throws(()=>simulate(m,{data:{N:1.5}}),/integer/);
  assert.throws(()=>simulate(m,{data:{N:600}}),/dimension/);
  assert.throws(()=>simulate(m,{data:{N:2},overrides:{mu:{args:{1:0}}}}),/standard deviation/);
  assert.throws(()=>simulate(m,{data:{N:2},overrides:{sigma:{fixed:-1}}}),/bounds/);
  assert.throws(()=>simulate(m,{data:{N:2},overrides:{y:{fixed:0}}}),/Only parameters/);
  assert.throws(()=>simulate(m,{data:{N:2},overrides:{mu:{args:{5:2}}}}),/Invalid prior argument/);
  assert.throws(()=>simulate(m,{data:{N:512},draws:10000}),/1,000,000/);
  assert.doesNotThrow(()=>validateOverrides(m,{mu:{fixed:3}}));
});

test('integer arrays, static transformed data and indexed right-hand expressions retain Stan shapes',()=>{
  const m=model(`data {int<lower=1> N;vector[N] x;array[N] int y;} transformed data {real center=mean(x);}
  parameters {real beta;} transformed parameters {vector[N] eta=beta*(x-center);real first=eta[1];}
  model {beta~normal(0,1);for(n in 1:N)y[n]~bernoulli_logit(eta[n]);}`);
  const r=simulate(m,{data:{N:3,x:[-1,0,1]},draws:50});
  assert.ok(r.samples.center.every(([x])=>x===0));
  assert.ok(r.samples.y.every(x=>x.length===3&&x.every(v=>v===0||v===1)));
  assert.ok(r.samples.first.every(([x],i)=>x===r.samples.eta[i][0]));
  assert.throws(()=>model('data {real y;} transformed data {real location=y;}parameters{real x;}model{y~normal(0,1);x~normal(location,1);}'),/outcome-dependent preprocessing/);
});


test('zero-length sampled variables fail explicitly rather than bypassing distribution validation',()=>{
  const m=model('parameters {vector[0] x;} model {x~normal(0,-1);}');
  assert.throws(()=>simulate(m,{draws:1}),/zero-length sampled variables/);
  const observed=model('data {array[0] int y;} model {y~bernoulli(2);}');
  assert.throws(()=>simulate(observed,{draws:1}),/zero-length sampled variables/);
  const emptyInput=model('data {vector[0] x;}transformed data {real total=sum(x);}parameters{real z;}model{z~normal(total,1);}');
  assert.deepEqual(simulate(emptyInput,{data:{x:[]},draws:1}).samples.total,[[0]]);
});

test('static group gathers preserve repeated group effects, coordinates and dependence',()=>{
  const source=`data {int<lower=1> N;int<lower=1> J;array[N] int<lower=1,upper=J> group;vector[N] y;}
  parameters {real mu;real<lower=0> tau;vector[J] theta;}
  transformed parameters {vector[N] eta=theta[group];}
  model {mu~std_normal();tau~exponential(1);theta~normal(mu,tau);y~normal(eta,0.5);}`;
  const m=model(source),data={N:4,J:2,group:[1,1,2,2]};
  assert.ok(m.edges.some(e=>e.from==='group'&&e.to==='eta'));
  assert.ok(m.edges.some(e=>e.from==='theta'&&e.to==='eta'));
  const r=simulate(m,{data,draws:10000,seed:530,overrides:{mu:{fixed:0},tau:{fixed:2}}});
  for(let i=0;i<r.draws;i++)assert.deepEqual(r.samples.eta[i],[r.samples.theta[i][0],r.samples.theta[i][0],r.samples.theta[i][1],r.samples.theta[i][1]]);
  /** @param {number} a @param {number} b */
  const covariance=(a,b)=>{
    const meanA=r.samples.y.reduce((v,row)=>v+row[a],0)/r.draws,meanB=r.samples.y.reduce((v,row)=>v+row[b],0)/r.draws;
    return r.samples.y.reduce((v,row)=>v+(row[a]-meanA)*(row[b]-meanB),0)/r.draws;
  };
  near(covariance(0,1),4,.2);near(covariance(0,2),0,.15);
  const single=simulate(m,{data:{N:1,J:2,group:[2]},draws:20});
  assert.ok(single.samples.eta.every((x,i)=>x.length===1&&x[0]===single.samples.theta[i][1]),'length-one gathers keep a vector dimension');
  assert.throws(()=>simulate(m,{data:{N:1,J:2,group:[0]}}),/bounds|Index/);
  assert.throws(()=>simulate(m,{data:{N:1,J:2,group:[3]}}),/bounds|Index/);
  assert.throws(()=>simulate(m,{data:{N:1,J:2,group:[1.5]}}),/integer/);
  assert.throws(()=>simulate(m,{data:{N:1,J:2,group:1}}),/shape/);
});

test('indexed group loops and vectorized gathers are identical generative programs',()=>{
  const prefix=`data {int N;int J;array[N] int group;vector[N] x;vector[N] y;}
  parameters {vector[J] alpha;vector[J] beta;real<lower=0> sigma;}model{alpha~std_normal();beta~std_normal();sigma~exponential(1);`;
  const vector=model(prefix+'y~normal(alpha[group]+beta[group].*x,sigma);}');
  const loop=model(prefix+'for(n in 1:N)y[n]~normal(alpha[group[n]]+beta[group[n]]*x[n],sigma);}');
  const options={data:{N:4,J:2,group:[2,1,2,1],x:[-2,0,1,3]},draws:100};
  assert.deepEqual(simulate(loop,options),simulate(vector,options));
  const invalid={...options,data:{...options.data,group:[2,1,3,1]}};
  assert.throws(()=>simulate(loop,invalid),/Index.*valid range 1:2/);
  assert.throws(()=>model(prefix+'for(n in 1:N)y[n]~normal(alpha[group[n]+1],sigma);}'),/index arithmetic/);
  assert.throws(()=>model(prefix+'group~bernoulli(0.5);y~normal(alpha[group],sigma);}'),/fixed data/);
});

test('std_normal is an exact alias and symmetric half-normal hyperpriors retain the right scale mixture',()=>{
  const alias=model('parameters{real a;vector[2] b;}model{a~std_normal();b~std_normal();}');
  const explicit=model('parameters{real a;vector[2] b;}model{a~normal(0,1);b~normal(0,1);}');
  assert.deepEqual(simulate(alias,{draws:100}),simulate(explicit,{draws:100}));
  const m=model('parameters{real<lower=0> tau;real<lower=0> sigma;real<upper=0> negative;}model{tau~exponential(1);sigma~normal(0,tau);negative~normal(0,tau);}');
  const r=simulate(m,{draws:10000,seed:70});
  near(moments(r.samples.sigma).mean,Math.sqrt(2/Math.PI),.035);
  near(r.samples.sigma.reduce((v,x)=>v+x[0]**2,0)/r.draws,2,.2);
  assert.ok(r.samples.negative.every(([x])=>x<=0));
  assert.throws(()=>simulate(m,{draws:1,overrides:{sigma:{args:{0:1}}}}),/normalizing constant/);
  assert.doesNotThrow(()=>simulate(m,{draws:1,overrides:{sigma:{args:{0:1}},tau:{fixed:2}}}));
  assert.throws(()=>model('parameters{real<lower=0> tau;real<lower=0,upper=1> x;}model{tau~exponential(1);x~normal(0,tau);}'),/normalizing constant/);
  assert.throws(()=>model('parameters{real<lower=0> tau;real<lower=0> x;}model{tau~exponential(1);x~normal(0,tau) T[-1,];}'),/normalizing constant/);
});

test('compound beta-binomial agrees with analytic moments and max/min preserve array reductions',()=>{
  const m=model('data{array[3]int trials;int y;}transformed data{int nmax=max(trials);int nmin=min(trials);}model{y~beta_binomial(nmax,2,3);}');
  const r=simulate(m,{data:{trials:[10,20,4]},draws:10000,seed:75});
  assert.ok(r.samples.nmax.every(([x])=>x===20));assert.ok(r.samples.nmin.every(([x])=>x===4));
  near(moments(r.samples.y).mean,8,.2);near(moments(r.samples.y).variance,20,.8);
  assert.ok(r.samples.y.every(([x])=>Number.isInteger(x)&&x>=0&&x<=20));
  assert.throws(()=>simulate(model('data{int y;}model{y~beta_binomial(5,0,2);}'),{draws:1}),/shape parameters/);
});
