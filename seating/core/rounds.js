// Event rounds are distinct from the static optimizer's search trajectory.
import {buildRoundProblem} from './rounds-request.js';
import {scoreRounds,swapProposal,acceptSwap,travelDistance,changeCount} from './rounds-objective.js';
import {SeatingError} from './request.js';
import {rMersenneTwister} from '../../shared/rng.js';
/** @typedef {import('./rounds-request.js').RoundProblem} Problem */

/** Balanced, seeded starting rounds. Repeated meetings and travel influence each placement;
 * the subsequent joint search scores the complete schedule, including both adjacent trips.
 * @param {Problem} p @param {ReturnType<typeof rMersenneTwister>} rng
 */
function startingRounds(p,rng){
 const n=p.base.nGuests,N=p.base.nSeats,T=p.base.tableIds.length,w=p.options.weights;
 const offsets=p.base.capacity.map((_,t)=>p.base.capacity.slice(0,t).reduce((a,b)=>a+b,0));
 /** @type {number[][]} */const states=[];
 /** @type {Map<number,number>} */const met=new Map();
 let previous=new Int32Array(N);
 for(let r=0;r<p.rounds;r++){
  const state=Array(N).fill(-1),members=Array.from({length:T},()=>/** @type {number[]} */([]));
  const counts=Array.from({length:T},()=>new Int32Array(p.categories.length));
  for(const [g,slot]of p.anchors){state[slot]=g;members[p.slotTable[slot]].push(g);counts[p.slotTable[slot]][p.categoryIndex[g]]++}
  const order=rng.uniform(n,n).filter(g=>!p.anchors.has(g));
  for(const g of order){
   let best=Infinity,chosen=-1;
   for(let t=0;t<T;t++){
    if(members[t].length>=p.base.capacity[t])continue;
    const c=p.categoryIndex[g],target=p.base.capacity[t]*p.totals[c]/N;
    let cost=w.balance*(2*(counts[t][c]-target)+1)/p.base.capacity[t];
    for(const other of members[t]){const key=Math.min(g,other)*n+Math.max(g,other);cost+=w.repeatPairs*(met.has(key)?1:0)-w.pairs*p.base.W[g*N+other]-p.base.K[g*N+other]}
    if(r){const trip=p.distances[p.slotTable[previous[g]]*T+t]*p.travelWeights[g];cost+=w.totalTravel*trip+w.maxTravel*trip/Math.max(1,n)}
    // Random tie-breaking is seeded; no random perturbation changes a non-tie.
    if(cost<best-1e-12||(Math.abs(cost-best)<=1e-12&&rng.unif()<.5)){best=cost;chosen=t}
   }
   if(chosen<0)throw new SeatingError('internal_error','No available seat during round initialization');
   const free=Array.from({length:p.base.capacity[chosen]},(_,j)=>offsets[chosen]+j).filter(s=>state[s]<0);
   const slot=r&&free.includes(previous[g])?previous[g]:free[0];
   state[slot]=g;members[chosen].push(g);counts[chosen][p.categoryIndex[g]]++;
  }
  let empty=n;state.forEach((g,s)=>{if(g<0)state[s]=empty++});
  previous=new Int32Array(N);state.forEach((g,s)=>{previous[g]=s});states.push(state);
  for(const group of members)for(let a=0;a<group.length;a++)for(let b=a+1;b<group.length;b++)changeCount(met,Math.min(group[a],group[b])*n+Math.max(group[a],group[b]),1);
 }
 return states;
}

/** Plan an event with real successive rounds. Lower objective cost is better.
 * @param {unknown} request
 * @param {{onProgress?:(progress:import('./search.js').Progress)=>void}} [hooks]
 */
export function planRounds(request,{onProgress}={}){
 const p=buildRoundProblem(request),rng=rMersenneTwister(p.options.seed),states=startingRounds(p,rng);
 const current=scoreRounds(p,states),initialCost=current.cost;
 if(!Number.isFinite(initialCost))throw new SeatingError('invalid_request','Round costs exceed the finite numeric range; reduce coordinate magnitudes, scores or weights');
 const locked=new Set(p.anchors.values()),free=p.initial.map((_,s)=>s).filter(s=>!locked.has(s));
 const groups=p.categories.map((_,c)=>p.initial.filter(g=>g<p.base.nGuests&&p.categoryIndex[g]===c&&!p.anchors.has(g)));
 let best=states.map(s=>[...s]),bestCost=current.cost,bestIteration=0,accepted=0;
 const iterations=new Set(free.map(s=>p.slotTable[s])).size<2?0:p.options.iterations;
 const every=Math.max(1,Math.ceil(iterations/200));
 const trace={iteration:[0],cost:[current.cost],best:[bestCost]};
 for(let i=1;i<=iterations;i++){
  const r=rng.index(p.rounds),a=free[rng.index(free.length)],ga=states[r][a];let b=-1;
  if(ga<p.base.nGuests&&rng.unif()<.75){const same=groups[p.categoryIndex[ga]];for(let k=0;k<8;k++){const slot=current.positions[r][same[rng.index(same.length)]];if(p.slotTable[slot]!==p.slotTable[a]){b=slot;break}}}
  if(b<0)for(let k=0;k<16;k++){const slot=free[rng.index(free.length)];if(p.slotTable[slot]!==p.slotTable[a]){b=slot;break}}
  if(b>=0&&!(ga>=p.base.nGuests&&states[r][b]>=p.base.nGuests)){
   const proposal=swapProposal(p,states,current,r,a,b);
   if(rng.unif()<1/(1+Math.exp((proposal.cost-current.cost)*p.options.logitScale))){
    acceptSwap(states,current,proposal);accepted++;
    if(current.cost<bestCost-1e-10){bestCost=current.cost;best=states.map(s=>[...s]);bestIteration=i}
   }
  }
  if(i%every===0||i===iterations){trace.iteration.push(i);trace.cost.push(current.cost);trace.best.push(bestCost);onProgress?.({iteration:i,iterations,accepted,score:-current.cost,best:-bestCost,move:null})}
 }
 const final=scoreRounds(p,best);
 if(Math.abs(final.cost-bestCost)>1e-7*Math.max(1,Math.abs(bestCost)))throw new SeatingError('internal_error','Round search cost did not match independent evaluation');
 for(const state of best){if(new Set(state).size!==p.base.nSeats)throw new SeatingError('internal_error','Round contains duplicate or missing seats');for(const [g,slot]of p.anchors)if(state[slot]!==g)throw new SeatingError('internal_error','A fixed seat moved')}
 const ids=p.base.ids;
 const rounds=best.map((state,r)=>({round:r+1,tables:p.base.capacity.map((capacity,t)=>({id:p.base.tableIds[t],capacity,x:p.base.xy[t][0],y:p.base.xy[t][1],seats:state.slice(final.offsets[t],final.offsets[t]+capacity).map(g=>ids[g])})),violations:{
  together:p.base.together.filter(([a,b])=>p.slotTable[final.positions[r][a]]!==p.slotTable[final.positions[r][b]]).map(([a,b])=>[ids[a],ids[b]]),
  apart:p.base.apart.filter(([a,b])=>p.slotTable[final.positions[r][a]]===p.slotTable[final.positions[r][b]]).map(([a,b])=>[ids[a],ids[b]])
 }}));
 const perGuest=ids.slice(0,p.base.nGuests).map((id,g)=>{
  const bySwitch=Array.from({length:p.rounds-1},(_,r)=>final.travel[r*p.base.nGuests+g]);const fixed=p.anchors.get(g);
  return {id,travelWeight:p.travelWeights[g],fixedSeat:fixed===undefined?null:{table:p.base.tableIds[p.slotTable[fixed]],seat:fixed-final.offsets[p.slotTable[fixed]]},bySwitch,total:bySwitch.reduce((a,b)=>a+b,0),max:Math.max(...bySwitch)};
 });
 const repeatedPairs=[...final.pairs].filter(([,count])=>count>1).map(([key,meetings])=>({guests:[ids[Math.floor(key/p.base.nGuests)],ids[key%p.base.nGuests]],meetings}));
 return {mode:/** @type {const} */('rounds'),rounds,objective:{cost:final.cost,terms:final.terms},metrics:{balance:final.raw.balance,repeatedPairEncounters:final.raw.repeatPairs,repeatedTableSets:final.raw.repeatTables,totalTravel:perGuest.reduce((sum,g)=>sum+g.total,0),maxTravel:perGuest.reduce((max,g)=>Math.max(max,g.max),0),weightedTotalTravel:final.raw.totalTravel,weightedMaxTravel:final.raw.maxTravel,perGuest,repeatedPairs},settings:{rounds:p.rounds,...p.options,travelMetric:'Euclidean table-center distance; maximum is one individual switch'},search:{iterations,accepted,bestIteration,initialCost},trace};
}
/** @typedef {ReturnType<typeof planRounds>} RoundPlan */
