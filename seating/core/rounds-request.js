// Round scheduling is an explicit mode. Static requests and their R-parity path
// continue through request.js unchanged.
import {buildProblem,SeatingError} from './request.js';

export const ROUND_WEIGHTS=Object.freeze({balance:8,repeatPairs:5,repeatTables:10,totalTravel:.15,maxTravel:1,pairs:1});
/** @typedef {{balance:number,repeatPairs:number,repeatTables:number,totalTravel:number,maxTravel:number,pairs:number}} RoundWeights */
/** @typedef {{weights:RoundWeights,constraintPenalty:number,iterations:number,seed:number,logitScale:number}} RoundOptions */
/** @typedef {{base:import('./request.js').Problem,rounds:number,options:RoundOptions,travelWeights:Float64Array,anchors:Map<number,number>,slotTable:Int32Array,initial:number[],categories:number[],categoryIndex:Int32Array,totals:number[],distances:Float64Array}} RoundProblem */
const object=(/** @type {unknown} */ x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const finite=(/** @type {unknown} */ x)=>typeof x==='number'&&Number.isFinite(x);

/** @param {unknown} input @returns {RoundProblem} */
export function buildRoundProblem(input){
 /** @type {import('./request.js').Issue[]} */const issues=[];
 const add=(/** @type {string} */ path,/** @type {string} */ message,code='invalid_value')=>issues.push({code,path,message});
 const fail=()=>{if(issues.length)throw new SeatingError('invalid_request',`Invalid round request: ${issues.slice(0,3).map(i=>`${i.path}: ${i.message}`).join('; ')}`,issues)};
 if(!object(input))throw new SeatingError('invalid_request','A round request must be an object',[{code:'wrong_type',path:'',message:'must be an object'}]);
 const request=/** @type {Record<string,any>} */(input);
 const fields=['mode','guests','tables','rounds','roundOptions','pairs','together','apart'];
 for(const key of Object.keys(request))if(!fields.includes(key))add(key,'not a round-planning field','unknown_field');
 if(request.mode!==undefined&&request.mode!=='rounds')add('mode','must be "rounds"');
 const rounds=request.rounds??3;
 if(!Number.isInteger(rounds)||rounds<2||rounds>12)add('rounds','must be an integer from 2 to 12');
 if(!Array.isArray(request.guests))add('guests','must be an array','wrong_type');
 fail();
 const n=request.guests.length;
 if(n>1000)add('guests','at most 1,000 guests are supported in round mode');
 const raw=request.roundOptions??{};
 if(!object(raw))add('roundOptions','must be an object','wrong_type');
 fail();
 for(const key of Object.keys(raw))if(!['weights','constraintPenalty','iterations','seed','logitScale'].includes(key))add(`roundOptions.${key}`,'unknown setting','unknown_field');
 const givenWeights=raw.weights??{};
 if(!object(givenWeights))add('roundOptions.weights','must be an object','wrong_type');
 fail();
 for(const key of Object.keys(givenWeights))if(!Object.hasOwn(ROUND_WEIGHTS,key))add(`roundOptions.weights.${key}`,'unknown objective term','unknown_field');
 const weights={...ROUND_WEIGHTS,...givenWeights};
 for(const [key,value]of Object.entries(weights))if(!finite(value)||value<0)add(`roundOptions.weights.${key}`,'must be a finite non-negative number');
 const options={weights,constraintPenalty:raw.constraintPenalty??1000,iterations:raw.iterations??Math.min(250000,100*n*rounds),seed:raw.seed??1,logitScale:raw.logitScale??1};
 if(!finite(options.constraintPenalty)||options.constraintPenalty<=0)add('roundOptions.constraintPenalty','must be positive');
 if(!Number.isInteger(options.iterations)||options.iterations<0||options.iterations>250000)add('roundOptions.iterations','must be an integer from 0 to 250,000');
 if(!Number.isInteger(options.seed)||options.seed<0||options.seed>2147483647)add('roundOptions.seed','must be an integer from 0 to 2,147,483,647');
 if(!finite(options.logitScale)||options.logitScale<=0)add('roundOptions.logitScale','must be positive');
 const travelWeights=new Float64Array(n);
 const guests=request.guests.map((/** @type {any} */ g,/** @type {number} */ i)=>{
  if(!object(g)){add(`guests[${i}]`,'must be an object','wrong_type');return g}
  for(const key of Object.keys(g))if(!['id','category','travelWeight','fixedSeat'].includes(key))add(`guests[${i}].${key}`,'unknown guest field','unknown_field');
  if(!finite(g.category))add(`guests[${i}].category`,'every guest needs a finite category code');
  const weight=g.travelWeight??1;
  if(!finite(weight)||weight<0||weight>1000)add(`guests[${i}].travelWeight`,'must be from 0 to 1,000');
  travelWeights[i]=weight;
  if(g.fixedSeat!==undefined&&typeof g.fixedSeat!=='boolean'&&!object(g.fixedSeat))add(`guests[${i}].fixedSeat`,'must be true, false, or {table, seat}');
  return {id:g.id,category:g.category};
 });
 fail();
 const base=buildProblem({guests,tables:request.tables,...(request.pairs&&{pairs:request.pairs}),...(request.together&&{together:request.together}),...(request.apart&&{apart:request.apart}),options:{tableObjective:'none',weights:{table:0,pairs:1,geography:0},constraintPenalty:options.constraintPenalty,iterations:0,seed:options.seed}});
 if(base.nSeats>1000)add('tables','at most 1,000 seats are supported in round mode');
 fail();
 const initial=base.initial.flat(),slotTable=new Int32Array(base.nSeats);let offset=0;
 base.capacity.forEach((capacity,t)=>{slotTable.fill(t,offset,offset+capacity);offset+=capacity});
 /** @type {Map<number,number>} */const anchors=new Map();
 request.guests.forEach((/** @type {any} */ g,/** @type {number} */ i)=>{
  if(!g.fixedSeat)return;
  let slot=initial.indexOf(i);
  if(object(g.fixedSeat)){
   for(const key of Object.keys(g.fixedSeat))if(!['table','seat'].includes(key))add(`guests[${i}].fixedSeat.${key}`,'unknown fixed-seat field','unknown_field');
   const t=base.tableIds.indexOf(g.fixedSeat.table),seat=g.fixedSeat.seat;
   if(t<0)add(`guests[${i}].fixedSeat.table`,'must name an existing table','unknown_table');
   if(!Number.isInteger(seat)||seat<0||(t>=0&&seat>=base.capacity[t]))add(`guests[${i}].fixedSeat.seat`,'must be a zero-based seat index within that table');
   slot=base.capacity.slice(0,t).reduce((a,b)=>a+b,0)+seat;
  }
  if([...anchors.values()].includes(slot))add(`guests[${i}].fixedSeat`,'another guest is fixed in this seat','duplicate_seat');
  anchors.set(i,slot);
 });
 fail();
 const categories=[...new Set(guests.map((/** @type {{category:number}} */g)=>g.category))].sort((a,b)=>a-b);
 const categoryIndex=Int32Array.from({length:base.nSeats},(_,i)=>i<n?categories.indexOf(base.category[i]):-1);
 const totals=categories.map((_,c)=>Array.from(categoryIndex).filter(v=>v===c).length);
 const T=base.tableIds.length,distances=new Float64Array(T*T);
 for(let a=0;a<T;a++)for(let b=0;b<T;b++)distances[a*T+b]=Math.hypot(base.xy[a][0]-base.xy[b][0],base.xy[a][1]-base.xy[b][1]);
 if([...distances].some(d=>!Number.isFinite(d)))throw new SeatingError('invalid_request','Table coordinates produce non-finite travel distances',[{code:'out_of_range',path:'tables',message:'coordinates must produce finite distances'}]);
 return {base,rounds,options,travelWeights,anchors,slotTable,initial,categories,categoryIndex,totals,distances};
}
