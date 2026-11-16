import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
const source='parameters {real mu;} model {mu ~ normal(0,2);}';
/** @param {Record<string,unknown>} request */
function invoke(request) {
  // Deliberately no Rscript/Python on PATH: these CLI actions must use only JS.
  return spawnSync(process.execPath,[cli],{input:JSON.stringify(request),encoding:'utf8',env:{...process.env,PATH:'/nonexistent',NODE_NO_WARNINGS:'1'},timeout:10000});
}

test('CLI graph and simulation actions work without an R installation',()=>{
  const graph=invoke({action:'graph',source});assert.equal(graph.status,0,graph.stderr);
  assert.deepEqual(JSON.parse(graph.stdout).model.order,['mu']);
  const result=invoke({action:'explore',source,draws:12,seed:3,overrides:{mu:{fixed:4}}});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).samples.mu,Array.from({length:12},()=>[4]));
});
test('CLI LaTeX, NumPy and PyMC exports describe the current scenario',()=>{
  for(const action of ['latex','python','pymc']) {
    const result=invoke({action,source,overrides:{mu:{fixed:4}}});assert.equal(result.status,0,result.stderr);
    const out=JSON.parse(result.stdout);assert.equal(out.format,action);assert.match(out.code,/4/);assert.match(out.code,/intervention|override/i);
  }
});
test('CLI unsupported models and malformed options return structured errors without partial output',()=>{
  for(const request of [{action:'explore',source,draws:0},{action:'graph',source:'parameters{real x;}model{}'},{action:'explore',source,typo:true}]) {
    const result=invoke(request);assert.equal(result.status,1);assert.equal(result.stdout,'');
    const error=JSON.parse(result.stderr).error;assert.ok(['INVALID_REQUEST','UNSUPPORTED_MODEL'].includes(error.code));assert.ok(error.message.length);
  }
});
