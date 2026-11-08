import assert from 'node:assert/strict';
import {test} from 'node:test';
import {planRounds} from '../core/index.js';
import {buildRoundProblem} from '../core/rounds-request.js';
import {scoreRounds,swapProposal,acceptSwap} from '../core/rounds-objective.js';

const guests=Array.from({length:7},(_,i)=>({id:`g${i}`,category:i%3,travelWeight:[0,1,2,1,3,5,1][i]}));
const tables=[{id:'A',capacity:3,x:0,y:0},{id:'B',capacity:3,x:3,y:4},{id:'C',capacity:3,x:0,y:8}];
const request={mode:'rounds',rounds:4,guests,tables,together:[['g0','g1']],apart:[['g2','g3']],pairs:[{a:'g4',b:'g5',score:2}],roundOptions:{iterations:1000,seed:152}};
const close=(/** @type {number} */ actual,/** @type {number} */ expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('incremental round swaps agree with full evaluation, including empty seats and maximum-trip changes',()=>{
 const p=buildRoundProblem(request),states=Array.from({length:4},()=>p.initial.slice());
 assert.equal(p.base.nSeats,9);
 const current=scoreRounds(p,states);let seed=152,checked=0;
 const rand=(/** @type {number} */ n)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<2000;i++){
  const round=rand(4),a=rand(p.base.nSeats),b=rand(p.base.nSeats);
  if(p.slotTable[a]===p.slotTable[b])continue;
  const proposal=swapProposal(p,states,current,round,a,b),copy=states.map(row=>row.slice());
  [copy[round][a],copy[round][b]]=[copy[round][b],copy[round][a]];
  const expected=scoreRounds(p,copy);
  for(const term of /** @type {(keyof typeof expected.raw)[]} */ (Object.keys(expected.raw)))close(proposal.raw[term],expected.raw[term]);
  acceptSwap(states,current,proposal);close(current.cost,expected.cost);checked++;
 }
 assert.ok(checked>1000);
});

test('explicit and initial-seat locks persist in every round, with one copy of each guest and all empty seats',()=>{
 const locked=guests.map((g,i)=>({...g,...(i===0?{fixedSeat:{table:'C',seat:1}}:i===2?{fixedSeat:true}:{})}));
 const result=planRounds({...request,guests:locked});
 for(const round of result.rounds){
  assert.equal(round.tables[2].seats[1],'g0');
  assert.equal(round.tables[0].seats[2],'g2');
  const seats=round.tables.flatMap(t=>t.seats);
  assert.deepEqual(seats.filter(id=>id!==null).sort(),guests.map(g=>g.id).sort());
  assert.equal(seats.filter(id=>id===null).length,2);
 }
 for(const id of ['g0','g2'])assert.equal(result.metrics.perGuest.find(g=>g.id===id)?.total,0);
 assert.ok(result.objective.cost<=result.search.initialCost+1e-8);
 for(let i=1;i<result.trace.best.length;i++)assert.ok(result.trace.best[i]<=result.trace.best[i-1]+1e-8);
});

test('category codes are nominal and seeded planning is deterministic',()=>{
 const first=planRounds(request),again=planRounds(request);
 assert.deepEqual(first,again);
 const renamed=planRounds({...request,guests:guests.map(g=>({...g,category:[100,-43,2][g.category]}))});
 assert.deepEqual(renamed.rounds,first.rounds);
 close(renamed.objective.cost,first.objective.cost);
});

test('repeated pairs and complete table configurations count encounters after the first',()=>{
 const p=buildRoundProblem({mode:'rounds',rounds:3,guests:guests.slice(0,4),tables:[{id:'A',capacity:2,x:0,y:0},{id:'B',capacity:2,x:3,y:4}]});
 const score=scoreRounds(p,[p.initial.slice(),p.initial.slice(),p.initial.slice()]);
 assert.equal(score.raw.repeatPairs,4);
 assert.equal(score.raw.repeatTables,4);
 assert.equal(score.raw.totalTravel,0);
 assert.equal(score.raw.maxTravel,0);
});

test('travel weights apply to both sum and maximum individual switch distance',()=>{
 const p=buildRoundProblem({mode:'rounds',rounds:3,guests:guests.slice(0,4).map((g,i)=>({...g,travelWeight:i===0?3:0})),tables:[{id:'A',capacity:2,x:0,y:0},{id:'B',capacity:2,x:3,y:4}]});
 const score=scoreRounds(p,[[0,1,2,3],[2,1,0,3],[0,1,2,3]]);
 assert.equal(score.raw.totalTravel,30);
 assert.equal(score.raw.maxTravel,15); // Two five-unit trips; max is one weighted trip, not their sum.
 assert.equal(score.travel.reduce((a,b)=>a+b,0),20);
 const zero=buildRoundProblem({mode:'rounds',rounds:3,guests:guests.slice(0,4).map(g=>({...g,travelWeight:0})),tables:[{id:'A',capacity:2,x:0,y:0},{id:'B',capacity:2,x:3,y:4}]});
 const noTravelCost=scoreRounds(zero,[[0,1,2,3],[2,1,0,3],[0,1,2,3]]);
 assert.equal(noTravelCost.raw.totalTravel,0);assert.equal(noTravelCost.raw.maxTravel,0);
});

test('zero objective weights and a fully locked schedule are supported without moving guests',()=>{
 const result=planRounds({...request,together:[],apart:[],guests:guests.map(g=>({...g,fixedSeat:true})),roundOptions:{iterations:100,weights:{balance:0,repeatPairs:0,repeatTables:0,totalTravel:0,maxTravel:0,pairs:0}}});
 assert.equal(result.objective.cost,0);assert.equal(result.search.iterations,0);
 assert.equal(result.metrics.totalTravel,0);
});

test('round requests reject invalid budgets, travel weights and colliding locks; defaults stay within budget',()=>{
 assert.throws(()=>buildRoundProblem({...request,rounds:1}),/rounds/);
 assert.throws(()=>buildRoundProblem({...request,roundOptions:{iterations:250001}}),/iterations/);
 assert.throws(()=>buildRoundProblem({...request,guests:guests.map((g,i)=>({...g,travelWeight:i?1:NaN}))}),/travelWeight/);
 assert.throws(()=>buildRoundProblem({...request,guests:guests.map((g,i)=>({...g,...(i<2?{fixedSeat:{table:'A',seat:0}}:{})}))}),/another guest/);
 assert.throws(()=>buildRoundProblem({...request,guests:guests.map((g,i)=>({...g,...(!i?{fixedSeat:{table:'missing',seat:0}}:{})}))}),/existing table/);
 assert.throws(()=>buildRoundProblem({...request,options:{iterations:1}}),/not a round-planning field/);
 const large=buildRoundProblem({mode:'rounds',rounds:3,guests:Array.from({length:900},(_,i)=>({id:`g${i}`,category:i%3})),tables:{seats:30,layout:'grid'}});
 assert.equal(large.options.iterations,250000);
});

test('overflowing coordinate distances fail explicitly',()=>{
 assert.throws(()=>buildRoundProblem({...request,tables:tables.map((t,i)=>({...t,x:i?1e308:-1e308}))}),/non-finite travel distances/);
});
