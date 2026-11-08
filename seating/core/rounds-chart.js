import {renderSeating,seatingGeometry} from './chart.js';
/** Nominal hues shared with the landing preview; category numerals remain visible.
 * @param {Iterable<number>} values @param {'light'|'dark'} [theme]
 */
export function roundCategoryColours(values,theme='light'){
 const palette=theme==='dark'?['#77aadd','#ee99aa','#66bb99','#ddcc77','#bb99cc','#66ccee','#eeaa66','#bbbbbb']:['#4477aa','#ee6677','#228833','#ccbb44','#aa4499','#66ccee','#cc8844','#777777'];
 return new Map([...new Set(values)].sort((a,b)=>a-b).map((value,i)=>[value,palette[i%palette.length]]));
}
/** @param {import('./rounds.js').RoundPlan} plan @param {any} request
 * @param {{round?:number,width?:number,arrangement?:'room'|'rows',theme?:'light'|'dark'}} [options]
 */
export function renderRoundSvg(plan,request,{round=0,width=960,arrangement='room',theme='light'}={}){
 const result=plan.rounds[round];
 if(!result)throw new RangeError('Round index is outside the plan');
 const categories=new Map(/** @type {[string,number][]} */(request.guests.map((/** @type {any} */g)=>[g.id,g.category])));
 const geo=seatingGeometry(result.tables,[...categories.keys()],{width,arrangement});
 const broken=new Set([...result.violations.together,...result.violations.apart].flat().filter(id=>id!==null));
 return renderSeating(geo,{tables:result.tables,categories,colours:roundCategoryColours(categories.values(),theme),broken:/** @type {Set<string>} */(broken)},{theme,title:`Round ${round+1} of ${plan.rounds.length}`});
}
