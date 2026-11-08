// @ts-check
// Regenerate the curated landing trajectory with the committed optimizer, never
// an unrelated working-tree experiment: node scripts/landing-art/palette-trace.mjs
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const REVISION='40e5aeed2';
export const WIDTHS=[.88,.82,.90];

export async function generatePaletteTrace(){
 const scratch=join(root,'tmp/agent');mkdirSync(scratch,{recursive:true});
 const directory=mkdtempSync(join(scratch,'palette-trace-'));
 try{
  const revision=execFileSync('git',['rev-parse',REVISION],{cwd:root,encoding:'utf8'}).trim();
  const archive=execFileSync('git',['archive',revision,'color-optimization/core','color-optimization/optimizer','color-optimization/package.json'],{cwd:root});
  execFileSync('tar',['-xf','-','-C',directory],{input:archive});
  const example=JSON.parse(execFileSync('git',['show',`${revision}:color-optimization/assets/scientific-summary/example.json`],{cwd:root,encoding:'utf8'}));
  const config={...example.config,widths:WIDTHS};
  const {optimizePalette}=await import(pathToFileURL(join(directory,'color-optimization/optimizer/optimizePalette.js')).href);
  /** @type {any[]} */const runs=[];
  /** @type {{run:number,score:number}[]} */const scores=[];
  let winnerRun=0;
  const result=await optimizePalette(example.inputs,config,{
   onProgress:(/** @type {any} */ p)=>runs.push(p),
   onVerbose:(/** @type {any} */ p)=>{if(p.stage==='end')scores.push({run:p.run,score:p.score});if(p.stage==='best')winnerRun=p.run;},
  });
  const winner=runs.find(p=>p.run===winnerRun);
  if(!winner||JSON.stringify(winner.endHex)!==JSON.stringify(result.newHex))throw new Error('Palette trace does not end at the winning restart');
  return {revision,inputs:example.inputs,config,added:result.newHex,score:-result.value,winnerRun,scores,trace:winner.trajectory};
 }finally{rmSync(directory,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const fixture=await generatePaletteTrace();
 writeFileSync(new URL('./fixtures/palette-trace.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
 console.log(`Palette: restart ${fixture.winnerRun}/${fixture.config.nOptimRuns}, ${fixture.trace.length} states, ${fixture.added.join(' ')}`);
}
