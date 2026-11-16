import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { buildModel } from '../core/model.js';
import { simulate } from '../core/simulation.js';
import { checkedAST } from '../core/request.js';
import { exportPyMC, PYMC_VERSION } from '../core/pymc.js';
import { examples } from '../examples.js';

const {stanc}=createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
const model=source=>buildModel(checkedAST(stanc('pymc_export',source,['debug-typed-ast'])).ast,source);
const localPython=fileURLToPath(new URL('../../tmp/venvs/stan2r-pymc/bin/python',import.meta.url));
const pythonPath=process.env.STAN2R_PYMC_PYTHON || (existsSync(localPython)?localPython:'');
const executableOptions={skip:pythonPath?false:'Set STAN2R_PYMC_PYTHON to Python with pymc==6.4.0; no runtime is installed automatically.'};
const cache=fileURLToPath(new URL('../../tmp/output/stan2r-pymc/compiledir',import.meta.url));
/** @param {string} code @param {string} expression */
function runPython(code,expression) {
  mkdirSync(cache,{recursive:true});
  const dir=mkdtempSync(join(tmpdir(),'stan2r-pymc-test-'));
  try {
    const path=join(dir,'model.py');
    writeFileSync(path,code.replace('if __name__ == "__main__":','if False:')+'\n'+expression);
    return JSON.parse(execFileSync(pythonPath,[path],{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',NUMBA_NUM_THREADS:'1',PYTENSOR_FLAGS:`compiledir=${cache},openmp=False`}}));
  } finally {rmSync(dir,{recursive:true,force:true});}
}

test('PyMC fitting export requires real observed values and validates declared data shapes and bounds',()=>{
  const graph=model(examples.normal.source);
  assert.throws(()=>exportPyMC(graph,{data:{N:4}}),{code:'EXPORT_ERROR'});
  assert.throws(()=>exportPyMC(graph,{data:{N:4,y:[1,2]}}),/shape|elements/i);
  assert.throws(()=>exportPyMC(model(examples.binomial.source),{data:{trials:3,successes:4}}),/bounds/i);
  const code=exportPyMC(graph,{data:examples.normal.data});
  assert.match(code,new RegExp(`pymc==${PYMC_VERSION.replaceAll('.','\\.')}`));
  assert.match(code,/observed=dat\["y"\]/);
  assert.match(code,/def build_model/);
});

test('PyMC normal model matches analytical log density and JS prior moments',executableOptions,()=>{
  const code=exportPyMC(model(examples.normal.source),{data:examples.normal.data,seed:42});
  const result=runPython(code,`from scipy import stats
model=build_model()
point=model.initial_point()
point["mu"]=np.array(0.3)
point["sigma_interval__"]=np.array(np.log(0.8))
actual=float(model.compile_logp(jacobian=False)(point))
expected=float(stats.norm.logpdf(0.3,0,2)+stats.halfnorm.logpdf(0.8,scale=1)+stats.norm.logpdf(DEFAULT_DATA["y"],0.3,0.8).sum())
with model:
    prior=pm.sample_prior_predictive(draws=4000,random_seed=42,return_inferencedata=False)
print(json.dumps({"version":pm.__version__,"logp":actual,"expected":expected,"mu_mean":float(prior["mu"].mean()),"mu_sd":float(prior["mu"].std()),"sigma_mean":float(prior["sigma"].mean()),"y_variance":float(prior["y"].var()),"shape":list(prior["y"].shape)}))`);
  assert.equal(result.version,PYMC_VERSION);
  // PyMC6.4's direct truncated-normal CDF differs from SciPy by about2e-8.
  assert.ok(Math.abs(result.logp-result.expected)<1e-7);
  assert.ok(Math.abs(result.mu_mean)<0.08);
  assert.ok(Math.abs(result.mu_sd-2)<0.07);
  assert.ok(Math.abs(result.sigma_mean-Math.sqrt(2/Math.PI))<0.025);
  assert.ok(Math.abs(result.y_variance-5)<0.3);
  assert.deepEqual(result.shape,[4000,4]);
  const js=simulate(model(examples.normal.source),{data:examples.normal.data,draws:4000,seed:42});
  const muMean=js.samples.mu.reduce((total,[x])=>total+x,0)/4000;
  const sigmaMean=js.samples.sigma.reduce((total,[x])=>total+x,0)/4000;
  assert.ok(Math.abs(result.mu_mean-muMean)<0.15,'independent Monte Carlo mean agrees with browser sampler');
  assert.ok(Math.abs(result.sigma_mean-sigmaMean)<0.05,'half-normal mean agrees with browser sampler');
});

test('original multilevel beta-binomial builds, preserves gathered groups and matches the analytical likelihood',executableOptions,()=>{
  const example=examples.multilevel;
  const code=exportPyMC(model(example.source),{data:example.data,seed:71});
  const result=runPython(code,`from scipy import stats
model=build_model()
point=model.initial_point()
point["theta_intercept"]=np.array(0.0)
point["theta_slope"]=np.array(0.0)
point["theta_group"]=np.zeros(DEFAULT_DATA["n_groups"])
point["theta_group_sd_interval__"]=np.array(0.0)
point["conc_offset_log__"]=np.array(np.log(10.0))
actual=float(model.compile_logp(jacobian=False)(point))
expected=float((2+DEFAULT_DATA["n_groups"])*stats.norm.logpdf(0)+stats.halfnorm.logpdf(1)+stats.expon.logpdf(10,scale=10)+stats.betabinom.logpmf(DEFAULT_DATA["x"],DEFAULT_DATA["k"],36,36).sum())
with model:
    prior=pm.sample_prior_predictive(draws=200,random_seed=71,return_inferencedata=False)
groups=np.asarray(DEFAULT_DATA["group"])-1
k_scaled=np.asarray(DEFAULT_DATA["k"])/max(DEFAULT_DATA["k"])
expected_theta=prior["theta_intercept"][:,None]+prior["theta_slope"][:,None]*k_scaled+prior["theta_group"][:,groups]*prior["theta_group_sd"][:,None]
print(json.dumps({"logp":actual,"expected":expected,"theta_error":float(np.max(np.abs(prior["theta"]-expected_theta))),"shape":list(prior["x"].shape),"bounded":bool(np.all((prior["x"]>=0)&(prior["x"]<=DEFAULT_DATA["k"]))),"mu_bounded":bool(np.all((prior["mu"]>0)&(prior["mu"]<1)))}))`);
  assert.ok(Math.abs(result.logp-result.expected)<1e-8);
  assert.ok(result.theta_error<1e-12);
  assert.deepEqual(result.shape,[200,example.data.n]);
  assert.equal(result.bounded,true);
  assert.equal(result.mu_bounded,true);
});

test('PyMC fixed interventions remove that prior factor and enforce fixed declared bounds',executableOptions,()=>{
  const graph=model(examples.normal.source);
  const code=exportPyMC(graph,{data:examples.normal.data,overrides:{mu:{fixed:1.5}}});
  assert.match(code,/not conditioning the original posterior/);
  const result=runPython(code,`model=build_model()
with model:
    prior=pm.sample_prior_predictive(draws=30,random_seed=1,return_inferencedata=False)
print(json.dumps({"free":[rv.name for rv in model.free_RVs],"mu":np.unique(prior["mu"]).tolist()}))`);
  assert.deepEqual(result.free,['sigma']);
  assert.deepEqual(result.mu,[1.5]);
  const invalid=exportPyMC(graph,{data:examples.normal.data,overrides:{sigma:{fixed:-1}}});
  assert.throws(()=>runPython(invalid,'build_model()'),/lower bound/);
});

test('PyMC generic truncation keeps its normalizer when a hyperparameter changes',executableOptions,()=>{
  const graph=model('parameters {real mu;real<lower=0> x;} model {mu~normal(0,1);x~normal(mu,1) T[0,];}');
  const code=exportPyMC(graph);
  const result=runPython(code,`from scipy import stats
model=build_model()
logp=model.compile_logp(jacobian=False)
values=[]
for mu in [-0.7,0.4]:
    point={"mu":np.array(mu),"x_interval__":np.array(np.log(0.8))}
    expected=stats.norm.logpdf(mu)+stats.norm.logpdf(0.8,mu,1)-stats.norm.logsf(0,mu,1)
    values.append([float(logp(point)),float(expected)])
print(json.dumps(values))`);
  assert.ok(result.every((/** @type {number[]} */ pair)=>Math.abs(pair[0]-pair[1])<1e-7));
});


test('PyMC numeric index and replication helpers use static expressions and reject random selectors',executableOptions,()=>{
  const graph=model('data {array[2] int n;} parameters {vector[2] z;real mu;} transformed parameters {vector[2] reversed=z[{2,1}];vector[2] repeated=rep_vector(mu,max(n));} model {z~std_normal();mu~std_normal();}');
  const code=exportPyMC(graph,{data:{n:[1,2]}});
  const result=runPython(code,`model=build_model()
with model:
    prior=pm.sample_prior_predictive(draws=10,random_seed=5,return_inferencedata=False)
print(json.dumps({"reverse":bool(np.allclose(prior["reversed"],prior["z"][:,::-1])),"repeat":bool(np.allclose(prior["repeated"],prior["mu"][:,None]))}))`);
  assert.equal(result.reverse,true);assert.equal(result.repeat,true);
  const random=model('data {int<lower=1,upper=2> index;} parameters {vector[2] z;} transformed parameters {real value=z[index];} model {index~binomial(2,0.5);z~std_normal();}');
  assert.throws(()=>exportPyMC(random,{data:{index:1}}),/data-only index/);
});

test('PyMC family mappings preserve Stan shape/rate, scale and link parameterizations',executableOptions,()=>{
  const graph=model(`data {int a;int b;int c;int d;int e;}
parameters {real<lower=0> g;real<lower=0,upper=1> p;real<lower=0> l;real t;real h;real<lower=-1,upper=1> u;}
model {g~gamma(3,2);p~beta(2,3);l~lognormal(0.2,0.4);t~student_t(5,0.5,1.2);h~cauchy(0,1.4);u~uniform(-1,1);a~bernoulli(p);b~bernoulli_logit(t);c~binomial(5,p);d~poisson(g);e~poisson_log(h);}`);
  const code=exportPyMC(graph,{data:{a:1,b:0,c:2,d:1,e:2}});
  const result=runPython(code,`from scipy import stats
model=build_model()
point={"g_log__":np.array(np.log(2.0)),"p_logodds__":np.array(np.log(0.3/0.7)),"l_log__":np.array(np.log(1.2)),"t":np.array(0.3),"h":np.array(0.2),"u_interval__":np.array(0.0)}
actual=float(model.compile_logp(jacobian=False)(point))
expected=float(stats.gamma.logpdf(2,3,scale=0.5)+stats.beta.logpdf(0.3,2,3)+stats.lognorm.logpdf(1.2,0.4,scale=np.exp(0.2))+stats.t.logpdf(0.3,5,loc=0.5,scale=1.2)+stats.cauchy.logpdf(0.2,scale=1.4)+stats.uniform.logpdf(0,loc=-1,scale=2)+stats.bernoulli.logpmf(1,0.3)+stats.bernoulli.logpmf(0,1/(1+np.exp(-0.3)))+stats.binom.logpmf(2,5,0.3)+stats.poisson.logpmf(1,2)+stats.poisson.logpmf(2,np.exp(0.2)))
with model:
    prior=pm.sample_prior_predictive(draws=20,random_seed=14,return_inferencedata=False)
print(json.dumps({"logp":actual,"expected":expected,"finite":all(bool(np.all(np.isfinite(x))) for x in prior.values())}))`);
  assert.ok(Math.abs(result.logp-result.expected)<1e-7);
  assert.equal(result.finite,true);
});
