// Explicit round costs. Categories are nominal labels: only equality/counts matter.
/** @typedef {import('./rounds-request.js').RoundProblem} Problem */
/** @typedef {{balance:number,pairs:number,constraints:number,pairKeys:number[],configuration:string}} TableStats */
/** @typedef {{balance:number,repeatPairs:number,repeatTables:number,totalTravel:number,maxTravel:number,pairs:number,constraints:number}} Terms */
/** @param {number} n */
export const repeats=n=>Math.max(0,n-1);
/** @param {Map<any,number>} counts @param {any} key @param {number} change */
export function changeCount(counts,key,change){const next=(counts.get(key)??0)+change;if(next)counts.set(key,next);else counts.delete(key)}
/** @param {Problem} p @param {number[]} members @param {number} table @returns {TableStats} */
export function roundTableStats(p,members,table){
 const counts=new Int32Array(p.categories.length),real=members.filter(i=>i<p.base.nGuests),pairKeys=[];
 for(const i of real)counts[p.categoryIndex[i]]++;
 let balance=0,pairs=0,constraints=0;
 for(let c=0;c<counts.length;c++)balance+=(counts[c]-p.base.capacity[table]*p.totals[c]/p.base.nSeats)**2/p.base.capacity[table];
 for(let a=0;a<real.length;a++)for(let b=a+1;b<real.length;b++){
  const i=Math.min(real[a],real[b]),j=Math.max(real[a],real[b]);pairKeys.push(i*p.base.nGuests+j);
  pairs+=p.base.W[i*p.base.nSeats+j];constraints-=p.base.K[i*p.base.nSeats+j];
 }
 return {balance,pairs,constraints,pairKeys,configuration:real.length?[...real].sort((a,b)=>a-b).join(','):''};
}
/** @param {Problem} p @param {Terms} raw */
export function weightedTerms(p,raw){const w=p.options.weights;return {balance:w.balance*raw.balance,repeatPairs:w.repeatPairs*raw.repeatPairs,repeatTables:w.repeatTables*raw.repeatTables,totalTravel:w.totalTravel*raw.totalTravel,maxTravel:w.maxTravel*raw.maxTravel,pairs:-w.pairs*raw.pairs,constraints:raw.constraints}}
/** @param {Terms} terms */
export const totalCost=terms=>Object.values(terms).reduce((a,b)=>a+b,0);
/** @param {Problem} p @param {number} first @param {number} second */
export const travelDistance=(p,first,second)=>p.distances[p.slotTable[first]*p.base.tableIds.length+p.slotTable[second]];

/** Full evaluation, also used to verify the incremental search before returning.
 * @param {Problem} p @param {number[][]} states
 */
export function scoreRounds(p,states){
 const n=p.base.nGuests,T=p.base.tableIds.length;
 const positions=states.map(state=>{const pos=new Int32Array(p.base.nSeats);state.forEach((g,s)=>{pos[g]=s});return pos});
 /** @type {Map<number,number>} */const pairs=new Map();
 /** @type {Map<string,number>} */const configurations=new Map();
 const offsets=p.base.capacity.map((_,t)=>p.base.capacity.slice(0,t).reduce((a,b)=>a+b,0));
 const tables=states.map(state=>p.base.capacity.map((cap,t)=>roundTableStats(p,state.slice(offsets[t],offsets[t]+cap),t)));
 /** @type {Terms} */const raw={balance:0,repeatPairs:0,repeatTables:0,totalTravel:0,maxTravel:0,pairs:0,constraints:p.rounds*p.options.constraintPenalty*p.base.together.length};
 for(const round of tables)for(const table of round){raw.balance+=table.balance;raw.pairs+=table.pairs;raw.constraints+=table.constraints;for(const key of table.pairKeys)changeCount(pairs,key,1);if(table.configuration)changeCount(configurations,table.configuration,1)}
 for(const count of pairs.values())raw.repeatPairs+=repeats(count);
 for(const count of configurations.values())raw.repeatTables+=repeats(count);
 const travel=new Float64Array((p.rounds-1)*n),weightedTravel=new Float64Array(travel.length);
 for(let r=1;r<p.rounds;r++)for(let g=0;g<n;g++){
  const i=(r-1)*n+g,d=travelDistance(p,positions[r-1][g],positions[r][g]);
  travel[i]=d;weightedTravel[i]=d*p.travelWeights[g];raw.totalTravel+=weightedTravel[i];raw.maxTravel=Math.max(raw.maxTravel,weightedTravel[i]);
 }
 const terms=weightedTerms(p,raw);
 return {cost:totalCost(terms),terms,raw,tables,pairs,configurations,positions,travel,weightedTravel,offsets};
}
/** @typedef {ReturnType<typeof scoreRounds>} Evaluation */

/** Score one within-round seat swap without changing the accepted state/cache.
 * @param {Problem} p @param {number[][]} states @param {Evaluation} current
 * @param {number} round @param {number} a @param {number} b
 */
export function swapProposal(p,states,current,round,a,b){
 const state=states[round],ga=state[a],gb=state[b],ta=p.slotTable[a],tb=p.slotTable[b];
 const A=state.slice(current.offsets[ta],current.offsets[ta]+p.base.capacity[ta]);
 const B=state.slice(current.offsets[tb],current.offsets[tb]+p.base.capacity[tb]);
 A[a-current.offsets[ta]]=gb;B[b-current.offsets[tb]]=ga;
 const nextTables=[roundTableStats(p,A,ta),roundTableStats(p,B,tb)],oldTables=[current.tables[round][ta],current.tables[round][tb]];
 /** @type {Map<number,number>} */const pairChanges=new Map();
 /** @type {Map<string,number>} */const configurationChanges=new Map();
 for(const table of oldTables){for(const key of table.pairKeys)changeCount(pairChanges,key,-1);if(table.configuration)changeCount(configurationChanges,table.configuration,-1)}
 for(const table of nextTables){for(const key of table.pairKeys)changeCount(pairChanges,key,1);if(table.configuration)changeCount(configurationChanges,table.configuration,1)}
 const raw={...current.raw};
 for(let k=0;k<2;k++){raw.balance+=nextTables[k].balance-oldTables[k].balance;raw.pairs+=nextTables[k].pairs-oldTables[k].pairs;raw.constraints+=nextTables[k].constraints-oldTables[k].constraints}
 for(const [key,delta]of pairChanges){const before=current.pairs.get(key)??0;raw.repeatPairs+=repeats(before+delta)-repeats(before)}
 for(const [key,delta]of configurationChanges){const before=current.configurations.get(key)??0;raw.repeatTables+=repeats(before+delta)-repeats(before)}
 /** @type {{index:number,distance:number,weighted:number}[]} */const travelChanges=[];
 for(const [g,slot]of [[ga,b],[gb,a]])if(g<p.base.nGuests)for(const r of [round-1,round])if(r>=0&&r<p.rounds-1){
  const first=r===round?slot:current.positions[r][g],second=r+1===round?slot:current.positions[r+1][g];
  const index=r*p.base.nGuests+g,distance=travelDistance(p,first,second),weighted=distance*p.travelWeights[g];
  travelChanges.push({index,distance,weighted});raw.totalTravel+=weighted-current.weightedTravel[index];
 }
 raw.maxTravel=Math.max(current.raw.maxTravel,...travelChanges.map(c=>c.weighted));
 if(travelChanges.some(c=>current.weightedTravel[c.index]===current.raw.maxTravel)&&travelChanges.every(c=>c.weighted<current.raw.maxTravel)){
  const replacements=new Map(travelChanges.map(c=>[c.index,c.weighted]));raw.maxTravel=0;
  current.weightedTravel.forEach((v,i)=>{raw.maxTravel=Math.max(raw.maxTravel,replacements.get(i)??v)});
 }
 const terms=weightedTerms(p,raw);
 return {round,a,b,ga,gb,ta,tb,nextTables,pairChanges,configurationChanges,travelChanges,raw,terms,cost:totalCost(terms)};
}
/** @param {number[][]} states @param {Evaluation} current @param {ReturnType<typeof swapProposal>} proposal */
export function acceptSwap(states,current,proposal){
 const q=proposal;states[q.round][q.a]=q.gb;states[q.round][q.b]=q.ga;
 current.positions[q.round][q.ga]=q.b;current.positions[q.round][q.gb]=q.a;
 current.tables[q.round][q.ta]=q.nextTables[0];current.tables[q.round][q.tb]=q.nextTables[1];
 for(const [key,d]of q.pairChanges)changeCount(current.pairs,key,d);
 for(const [key,d]of q.configurationChanges)changeCount(current.configurations,key,d);
 for(const c of q.travelChanges){current.travel[c.index]=c.distance;current.weightedTravel[c.index]=c.weighted}
 current.raw=q.raw;current.terms=q.terms;current.cost=q.cost;
}
