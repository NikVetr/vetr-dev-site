// Event-round navigation displays saved assignments, never optimization iterations.
import {renderRoundSvg} from './core/rounds-chart.js';
import {seatingGeometry,tableLabel} from './core/chart.js';
const get=(/** @type {string} */id)=>/** @type {HTMLElement} */(document.getElementById(id));
const select=/** @type {HTMLSelectElement} */(get('round-number'));
/** @type {import('./core/rounds.js').RoundPlan|null} */let plan=null;
/** @type {any} */let request=null;
let selected=0,redrawFrame=0;
export const selectedRound=()=>selected;
export function clearRoundPlan(){plan=null;request=null;cancelAnimationFrame(redrawFrame)}
/** @param {number} value */
export function selectRound(value){if(!plan)return;selected=Math.max(0,Math.min(plan.rounds.length-1,value));select.value=String(selected);draw()}
/** @param {import('./core/rounds.js').RoundPlan} next @param {any} input */
export function loadRoundPlan(next,input){
 plan=next;request=input;selected=0;
 select.replaceChildren(...plan.rounds.map((r,i)=>Object.assign(document.createElement('option'),{value:String(i),textContent:`Round ${r.round}`})));
 draw();
}
function draw(){
 if(!plan)return;
 const width=Math.max(280,get('chart').clientWidth),theme=document.documentElement.dataset.theme==='dark'?'dark':'light';
 const setting=/** @type {HTMLSelectElement} */(get('arrangement')).value;
 const names=request.guests.map((/** @type {any} */g)=>g.id);
 const arrangement=setting==='rows'||(setting==='auto'&&seatingGeometry(plan.rounds[selected].tables,names,{width}).font<9)?'rows':'room';
 get('chart').innerHTML=renderRoundSvg(plan,request,{round:selected,width,arrangement,theme});
 const m=plan.metrics,fmt=(/** @type {number} */n)=>n.toLocaleString('en-US',{maximumFractionDigits:2});
 const items=[['Schedule cost',plan.objective.cost],['Repeat pair meetings',m.repeatedPairEncounters],['Repeated table groups',m.repeatedTableSets],['Total travel',m.totalTravel],['Longest single trip',m.maxTravel],['Weighted total travel',m.weightedTotalTravel],['Weighted longest trip',m.weightedMaxTravel]];
 get('round-readout').replaceChildren(...items.map(([label,value])=>{const box=document.createElement('div');box.append(Object.assign(document.createElement('dt'),{textContent:String(label)}),Object.assign(document.createElement('dd'),{textContent:fmt(Number(value))}));return box}));
 const round=plan.rounds[selected];
 get('round-status').textContent=`${m.repeatedPairEncounters} repeat pair meetings · total travel ${fmt(m.totalTravel)} · longest trip ${fmt(m.maxTravel)} coordinate units.${round.violations.together.length+round.violations.apart.length?` ${round.violations.together.length+round.violations.apart.length} broken pair constraints this round.`:''}`;
 get('round-metric-note').textContent="Travel is straight-line distance between table centers, in the tables' coordinate units. Weighted figures multiply each guest's trip by their travel weight. The longest trip is one switch, not cumulative travel. Lower schedule cost is better.";
 get('list-heading').textContent=`Tables — round ${selected+1}`;
 get('table-list').replaceChildren(...round.tables.map(t=>{const box=document.createElement('div');box.className='table-card';const list=document.createElement('ol');list.replaceChildren(...t.seats.map(id=>Object.assign(document.createElement('li'),{textContent:id??'Empty seat',className:id===null?'empty':''})));box.append(Object.assign(document.createElement('h4'),{textContent:tableLabel(t.id)}),list);return box}));
 const travel=document.createElement('table');travel.className='travel-table';
 const head=document.createElement('thead');head.innerHTML='<tr><th>Guest</th><th>Weight</th><th>Total travel</th><th>Longest trip</th><th>Fixed seat</th></tr>';travel.append(head);
 const body=document.createElement('tbody');body.replaceChildren(...m.perGuest.map(g=>{const row=document.createElement('tr');for(const value of [g.id,g.travelWeight,fmt(g.total),fmt(g.max),g.fixedSeat?`${g.fixedSeat.table}, seat ${g.fixedSeat.seat+1}`:'—'])row.append(Object.assign(document.createElement('td'),{textContent:String(value)}));return row}));travel.append(body);get('travel-list').replaceChildren(travel);
 /** @type {HTMLButtonElement} */(get('round-back')).disabled=selected===0;
 /** @type {HTMLButtonElement} */(get('round-next')).disabled=selected===plan.rounds.length-1;
}
select.addEventListener('change',()=>selectRound(Number(select.value)));
get('round-back').addEventListener('click',()=>{selectRound(selected-1);select.dispatchEvent(new Event('change',{bubbles:true}))});
get('round-next').addEventListener('click',()=>{selectRound(selected+1);select.dispatchEvent(new Event('change',{bubbles:true}))});
get('arrangement').addEventListener('change',draw);
document.addEventListener('themechange',draw);
let lastWidth=0;new ResizeObserver(([entry])=>{if(entry.contentRect.width!==lastWidth){lastWidth=entry.contentRect.width;cancelAnimationFrame(redrawFrame);redrawFrame=requestAnimationFrame(draw)}}).observe(get('chart'));
