// Regenerate against the original native Stan2R checkout, never this browser adapter.
// STAN2R_SOURCE=/path/to/hardened/Stan2R node stan2r/tests/refresh-reference.mjs
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { examples } from '../examples.js';
import { conversionCall, rString, MODES } from '../core/request.js';
const source = process.env.STAN2R_SOURCE;
if (!source) throw new Error('Set STAN2R_SOURCE to the hardened Stan2R checkout.');
const models = [...Object.values(examples), {
 name: 'Student t with user function',
 source: 'functions { real shift(real x) { return x + 2; } }\ndata { real y; }\nparameters { real theta; }\nmodel { theta ~ student_t(3, 1, 2.5); y ~ normal(shift(theta), 1); }\ngenerated quantities { real location = shift(theta); }',
 data: {y: 1.5}, draws: {theta: [1.2, 0.9]},
}];
const dir = await mkdtemp(join(tmpdir(), 'stan2r-reference-'));
try {
 const sources = (await readdir(join(source, 'R'))).filter(f=>f.endsWith('.R'));
 const fixtures = [];
 for (const {name, ...model} of models) for (const mode of MODES) {
  const request = {...model, mode, sampleIndex: 2};
  await writeFile(join(dir,'model.stan'), model.source);
  // Reuse only JSON-to-R literal mapping; parsing and conversion use native stanc/Stan2R.
  const code = sources.map(f=>`source(${rString(join(source,'R',f))})`).join('\n') + `
stan2r_browser_convert <- function(ast, lines, mode, dat, samps, sample_index) {
  stan2r(stan_program(lines), mode, dat, samps, sample_index)
}
result <- ${conversionCall(request)}
writeChar(result, "result.R", eos=NULL, useBytes=TRUE)
`;
  await writeFile(join(dir,'reference.R'),code);
  execFileSync('Rscript',['--vanilla','reference.R'],{cwd:dir,stdio:'pipe'});
  fixtures.push({name,request,code:await readFile(join(dir,'result.R'),'utf8')});
 }
 await writeFile(new URL('./fixtures/native-reference.json',import.meta.url),JSON.stringify({sourceCommit:'e4f4b15',compiler:'stanc 2.38.0',fixtures},null,2)+'\n');
 console.log(`Generated ${fixtures.length} native reference fixtures.`);
} finally {await rm(dir,{recursive:true,force:true});}
