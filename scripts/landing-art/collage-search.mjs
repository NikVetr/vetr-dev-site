// Offline, reproducible preview selection. The app's layout algorithm/defaults stay unchanged.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeCollage,normalizeRequest,loadFaces} from '../../message-collage/core/index.js';
import {measureWhitespace} from '../../message-collage/core/whitespace.js';

export const PROFILES = [{name:'portrait',ratio:.85},{name:'square',ratio:1.2},{name:'wide',ratio:1.45}];
/** A large empty rectangle counts four times its area, alongside all glyph-box whitespace.
 * Aspect mismatch is penalized separately so dense layouts cannot win by making a wrong-shaped card.
 * @param {{empty_fraction:number,largest_empty_rectangle_fraction:number}} metrics
 * @param {number} aspect @param {number} target */
export const selectionScore = (metrics,aspect,target) => metrics.empty_fraction + 4*metrics.largest_empty_rectangle_fraction + 2*Math.abs(Math.log(aspect/target));

/** @param {{starts?:number,output?:string}} options */
export async function search({starts=1024,output='tmp/output/collage-density/search'}={}) {
  if(!Number.isInteger(starts)||starts<PROFILES.length)throw new Error('starts must cover every profile');
  mkdirSync(output,{recursive:true});
  const input=readFileSync(new URL('../../message-collage/examples/request.json',import.meta.url),'utf8');
  const original=JSON.parse(input),base=normalizeRequest({...original,runs:1,rotation_deg:0,expand_messages:false,warp_strength:0});
  const faces=await loadFaces(base.fonts,base.styles);
  const selected=[],reports=[];
  for(const [profileIndex,profile] of PROFILES.entries()) {
    const count=Math.floor(starts/PROFILES.length)+(profileIndex<starts%PROFILES.length?1:0);
    const request={...base,width_in:5.5,height_in:5.5/profile.ratio*.92};
    /** @type {{seed:number,score:number,metrics:ReturnType<typeof measureWhitespace>,ratio:number}[]} */
    const ranking=[];
    for(let i=0;i<count;i++) {
      const seed=10000*(profileIndex+1)+i;
      const result=makeCollage({...request,seed},faces),metrics=measureWhitespace(result,faces);
      const ratio=result.card.width_in/result.card.height_in;
      ranking.push({seed,score:selectionScore(metrics,ratio,profile.ratio),metrics,ratio});
      if((i+1)%32===0||i+1===count)console.log(JSON.stringify({phase:'screen',profile:profile.name,completed:i+1,total:count,rss:process.memoryUsage().rss}));
    }
    const first=ranking[0];ranking.sort((a,b)=>a.score-b.score||a.seed-b.seed);
    // Expensive collision-checked finishing is applied to the best three starts and
    // the first start as a matched baseline; all finalists are reranked after finishing.
    const finalists=[...new Set([...ranking.slice(0,3).map(r=>r.seed),first.seed])];
    const finished=[];
    for(const seed of finalists) {
      const result=makeCollage({...request,seed,rotation_deg:original.rotation_deg,expand_messages:true,warp_strength:1},faces);
      const metrics=measureWhitespace(result,faces),ratio=result.card.width_in/result.card.height_in;
      const score=selectionScore(metrics,ratio,profile.ratio);
      finished.push({seed,score,metrics,ratio,result});
      console.log(JSON.stringify({phase:'finish',profile:profile.name,seed,score,metrics}));
    }
    finished.sort((a,b)=>a.score-b.score||a.seed-b.seed);
    const best=finished[0];
    selected.push({profile:profile.name,target_ratio:profile.ratio,score:best.score,metrics:best.metrics,result:best.result});
    const report={profile:profile.name,target_ratio:profile.ratio,count,ranking,finalists:finished.map(({result,...summary})=>summary),baseline_seed:first.seed,selected_seed:best.seed};
    reports.push(report);writeFileSync(resolve(output,`${profile.name}.json`),JSON.stringify({report,selected:selected.at(-1)}));
  }
  const coreFiles=['index.js','layout.js','measure.js','rotation.js','expand.js','warp.js','warp-grid.js','whitespace.js'];
  const provenance={starts,fonts_sha256:Object.fromEntries([...faces.values()].map(face=>[face.file,createHash('sha256').update(face.bytes).digest('hex')])),screening:'Unrotated glyph-box coverage at resolution160; three best starts per aspect are finished and reranked, alongside the first-start baseline.',score:'empty_fraction + 4 * largest_empty_rectangle_fraction + 2 * abs(log(actual_aspect / target_aspect))',request_sha256:createHash('sha256').update(input).digest('hex'),core_sha256:Object.fromEntries(coreFiles.map(file=>[file,createHash('sha256').update(readFileSync(new URL(`../../message-collage/core/${file}`,import.meta.url))).digest('hex')]))};
  const fixture={provenance,layouts:selected};
  writeFileSync(resolve(output,'selected.json'),JSON.stringify(fixture));
  writeFileSync(resolve(output,'report.json'),JSON.stringify({provenance,profiles:reports},null,2));
  return fixture;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);let starts=1024,output='tmp/output/collage-density/search';
  if(args.length%2||args.some((arg,i)=>i%2===1&&arg.startsWith('--')))throw new Error('Every option requires a value');
  for(let i=0;i<args.length;i+=2){if(args[i]==='--starts')starts=Number(args[i+1]);else if(args[i]==='--output')output=args[i+1];else throw new Error(`Unknown option ${args[i]}`);}
  await search({starts,output});
}
