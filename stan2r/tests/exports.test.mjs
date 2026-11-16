import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildModel } from '../core/model.js';
import { checkedAST } from '../core/request.js';
import { exportLatex, exportPython, latexName } from '../core/exports.js';

const { stanc } = createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
const model = source => buildModel(checkedAST(stanc('export_test', source, ['debug-typed-ast'])).ast, source);
/** @param {string} code @param {string} expression */
function python(code, expression) {
  const dir = mkdtempSync(join(tmpdir(), 'stan2r-python-export-'));
  try {
    const path = join(dir, 'model.py');
    writeFileSync(path, code.replace('if __name__ == "__main__":', 'if False:') + '\n' + expression);
    return JSON.parse(execFileSync('python3', [path], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000, env: {...process.env, OPENBLAS_NUM_THREADS:'1', OMP_NUM_THREADS:'1'} }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const hierarchy = `data {int<lower=1> N; vector[N] y;}
parameters {real mu; real<lower=0> sigma; vector[N] z;}
transformed parameters {vector[N] eta = mu + sigma * z;}
model {mu ~ normal(0,2); sigma ~ normal(0,1); z ~ normal(0,1); y ~ normal(eta,0.5);}`;

test('LaTeX exposes model equations, Greek names, vector plates, transformations and interventions', () => {
  const graph = model(hierarchy);
  const text = exportLatex(graph); // symbolic sizes do not require numerical data
  assert.match(text, /\\mu &\\sim \\mathcal\{N\}/);
  assert.match(text, /\\sigma.*\[0,\\infty\]/);
  assert.match(text, /i=1,\\ldots,N/);
  assert.match(text, /\\boldsymbol\{\\eta\} &=/);
  assert.match(text, /\\mid.*\\eta/);
  assert.equal(latexName('mu_group'), '\\mu_{\\mathrm{group}}');
  const fixed = exportLatex(graph, { data: {N:3}, overrides: { mu: { fixed: 4 }, sigma: { args: {1:2} } } });
  assert.match(fixed, /EXPLORATORY OVERRIDES/);
  assert.match(fixed, /not posterior conditioning/);
  assert.match(fixed, /\\mu &:= 4/);
  assert.match(fixed, /\\sigma.*0, \\left\(2\\right\)\^2/);
});

test('NumPy export executes vectorized hierarchy with exact deterministic transforms and bounded prior moments', () => {
  const code = exportPython(model(hierarchy), {data:{N:3}, draws:5000, seed:123});
  const stats = python(code, `out = simulate(DEFAULT_DATA)
print(json.dumps({"mu_mean": out["mu"].mean(), "mu_sd": out["mu"].std(),
                  "sigma_mean": out["sigma"].mean(), "sigma_min": out["sigma"].min(),
                  "shape": list(out["y"].shape),
                  "eta_error": np.max(np.abs(out["eta"] - out["mu"] - out["sigma"]*out["z"])),
                  "residual_sd": (out["y"]-out["eta"]).std()}))`);
  assert.ok(Math.abs(stats.mu_mean)<0.08);
  assert.ok(Math.abs(stats.mu_sd-2)<0.08);
  assert.ok(Math.abs(stats.sigma_mean-Math.sqrt(2/Math.PI))<0.025);
  assert.ok(stats.sigma_min>=0);
  assert.deepEqual(stats.shape,[5000,3]);
  assert.ok(stats.eta_error<1e-12);
  assert.ok(Math.abs(stats.residual_sd-0.5)<0.015);
});

test('NumPy export preserves Stan gamma rate and beta-binomial parameterization', () => {
  const graph = model(`data {int<lower=0> trials; int<lower=0,upper=trials> successes;}
parameters {real<lower=0> rate; real<lower=0,upper=1> theta;}
model {rate ~ gamma(3,2); theta ~ beta(2,3); successes ~ binomial(trials,theta);}`);
  const stats = python(exportPython(graph,{data:{trials:20},draws:5000,seed:42}), `out=simulate(DEFAULT_DATA)
print(json.dumps({"rate":out["rate"].mean(),"rate_variance":out["rate"].var(),"theta":out["theta"].mean(),"y":out["successes"].mean(),"y_integer":bool(np.all(out["successes"]==np.floor(out["successes"])))}))`);
  assert.ok(Math.abs(stats.rate-1.5)<0.04);
  assert.ok(Math.abs(stats.rate_variance-0.75)<0.06);
  assert.ok(Math.abs(stats.theta-0.4)<0.012);
  assert.ok(Math.abs(stats.y-8)<0.25);
  assert.equal(stats.y_integer,true);
});

test('NumPy export distinguishes predictive observation bounds, explicit truncation and fixed interventions', () => {
  const graph = model(`data {real<lower=0> y;} parameters {real mu; real x;}
model {mu ~ normal(0,1); x ~ normal(mu,1) T[0,]; y ~ normal(mu,1);}`);
  const code = exportPython(graph, {data:{},draws:1000,seed:9,overrides:{mu:{fixed:0}}});
  assert.match(code,/not posterior conditioning/);
  const stats = python(code, `out=simulate(DEFAULT_DATA)
print(json.dumps({"mu":np.unique(out["mu"]).tolist(),"x_min":out["x"].min(),"y_min":out["y"].min()}))`);
  assert.deepEqual(stats.mu,[0]);
  assert.ok(stats.x_min>=0);
  assert.ok(stats.y_min<0,'data declaration bound does not truncate future observations');
});

test('exported scripts retain input and distribution domain errors instead of changing the model', () => {
  const graph = model(hierarchy);
  const code = exportPython(graph,{data:{N:3},draws:1,overrides:{sigma:{args:{1:0}}}});
  assert.throws(()=>python(code,'simulate(DEFAULT_DATA)'), /must be positive/);
  const valid = exportPython(graph,{data:{N:3},draws:1});
  assert.throws(()=>python(valid,'simulate({})'), /Missing required data/);
  assert.throws(()=>python(valid,'simulate({"N":3,"y":[1,2]})'), /expected shape/);
  const fixed = exportPython(graph,{data:{N:3},draws:1,overrides:{sigma:{fixed:-1}}});
  assert.throws(()=>python(fixed,'simulate(DEFAULT_DATA)'), /below declared lower bound/);
});

test('NumPy export executes supported families and scalar/vector expression functions', () => {
  const graph = model(`data {array[3] int coin; array[3] int count;}
parameters {real log_n; real e; real b; real u; real t; real c;}
transformed parameters {vector[3] x = rep_vector(log_n,3); real first = x[1]; real p = inv_logit(b); real total = sum(x);}
model {log_n ~ lognormal(0,0.3); e ~ exponential(2); b ~ beta(2,2); u ~ uniform(-2,2); t ~ student_t(5,1,2); c ~ cauchy(0,1); coin ~ bernoulli_logit(b); count ~ poisson_log(b);}`);
  const result = python(exportPython(graph,{draws:5}), `out=simulate(DEFAULT_DATA)
print(json.dumps({"finite":all(bool(np.all(np.isfinite(v))) for v in out.values()),"coin":list(out["coin"].shape),"first":bool(np.all(out["first"]==out["log_n"])),"sum":bool(np.allclose(out["total"],3*out["log_n"]))}))`);
  assert.equal(result.finite,true);
  assert.deepEqual(result.coin,[5,3]);
  assert.equal(result.first,true);
  assert.equal(result.sum,true);
});

test('NumPy checks supplied observation bounds against original observations and enforces integer outcomes', () => {
  const graph = model('data {int<lower=0> n;int<lower=0,upper=n> y;} model {n~poisson(2);y~binomial(n,0.5);}');
  const code = exportPython(graph,{data:{n:20,y:10},draws:10});
  const result = python(code, 'out=simulate(DEFAULT_DATA);print(json.dumps({"bounds":bool(np.all(out["y"]<=out["n"]))}))');
  assert.equal(result.bounds,true);
  assert.throws(()=>python(code,'simulate({"n":1,"y":10})'), /above declared upper bound/);
  const invalid = exportPython(model('data {int y;} model {y~normal(0,1);}'),{draws:1});
  assert.throws(()=>python(invalid,'simulate(DEFAULT_DATA)'), /Expected integers/);
  const large = exportPython(model('data {int n;} parameters {real x;} model {x~normal(n,1);}'),{data:{n:1e20},draws:1});
  assert.throws(()=>python(large,'simulate(DEFAULT_DATA)'), /32-bit Stan integers/);
});


test('NumPy export avoids the beta overflow of direct NumPy draws at large finite shapes', () => {
  const graph=model('parameters {real<lower=0,upper=1> x;} model {x~beta(1e308,1e308);}');
  const xs=python(exportPython(graph,{draws:5}), 'print(json.dumps(simulate(DEFAULT_DATA)["x"].reshape(-1).tolist()))');
  assert.ok(xs.every((/** @type {number} */ x)=>Math.abs(x-0.5)<1e-12));
});


test('NumPy export rejects zero-size stochastic variables explicitly', () => {
  for (const source of [
    'parameters {vector[0] x;} model {x~normal(0,-1);}',
    'data {vector[0] y;} model {y~normal(0,1);}',
  ]) {
    const code=exportPython(model(source),{draws:1});
    assert.throws(()=>python(code,'simulate(DEFAULT_DATA)'), /zero-size stochastic variables are not supported/);
  }
});

test('NumPy and LaTeX exports retain grouped beta-binomial gathers, std_normal and max/min reductions', async () => {
  const {examples}=await import('../examples.js');
  const example=examples.multilevel;
  const graph=model(example.source);
  const latex=exportLatex(graph);
  assert.match(latex,/beta\\_binomial/);
  assert.match(latex,/operatorname\{max\}/);
  const stats=python(exportPython(graph,{data:example.data,draws:300,seed:51}), `out=simulate(DEFAULT_DATA)
group=np.asarray(DEFAULT_DATA["group"])-1
k_scaled=np.asarray(DEFAULT_DATA["k"])/max(DEFAULT_DATA["k"])
expected=out["theta_intercept"]+out["theta_slope"]*k_scaled+out["theta_group"][:,group]*out["theta_group_sd"]
print(json.dumps({"theta_error":float(np.max(np.abs(out["theta"]-expected))),"shape":list(out["x"].shape),"valid":bool(np.all((out["x"]>=0)&(out["x"]<=DEFAULT_DATA["k"])))}))`);
  assert.ok(stats.theta_error<1e-12);
  assert.deepEqual(stats.shape,[300,example.data.n]);
  assert.equal(stats.valid,true);
});
