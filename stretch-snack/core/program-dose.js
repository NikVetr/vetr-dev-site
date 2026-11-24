// Program seconds are active time. The player accounts for travel before calling this.
export function doseReading(dose, elapsed, duration, cycle) {
  if (!dose || duration !== dose.seconds * (dose.sides ?? 1)) return null;
  const side = dose.sides === 2 && elapsed >= dose.seconds ? 1 : 0;
  const local = Math.max(0, Math.min(dose.seconds - 0.001, elapsed - side*dose.seconds));
  const sideLabel = dose.sides === 2 ? (side ? 'Second side' : 'First side') : '';
  if (dose.protocol === 'pulses-and-holds') {
    const round = local < 20 ? 0 : local < 50 ? 1 : 2;
    const start = [0,20,50][round], hold = [10,20,30][round], t = local-start;
    const pulse = t < 10;
    const label = pulse ? 'Gentle pulse '+(Math.floor(t)+1)+' of 10' : 'Hold · '+Math.ceil(10+hold-t)+' s';
    return {label:[sideLabel,'Round '+(round+1)+' of 3',label].filter(Boolean).join(' · '),
      phase:(side + (pulse ? 0.33 - 0.10*Math.cos(2*Math.PI*t) : 0.5))*cycle,
      cue:pulse ? 'Gentle pulses.' : 'Hold the stretch.', section:side+'-'+round+'-'+pulse};
  }
  if (dose.sides === 2) {
    // Keep the demonstrated side in step with the timer. Ease into and out of a static hold.
    const reps = dose.reps ?? 1;
    const repTime = dose.seconds / reps;
    const withinRep = local % repTime;
    const entry = Math.min(cycle / 2, repTime / 3);
    const dynamic = dose.reps || dose.id === 'long-sitting-ball-glute';
    const fraction = dynamic ? (dose.reps ? withinRep / repTime : (local % cycle) / cycle)
      : 0.5 * Math.min(1, withinRep / entry, (repTime - withinRep) / entry);
    return {label:sideLabel, phase:(side + fraction)*cycle, cue:'', section:''};
  }
  return {label:'', phase:undefined, cue:'', section:''};
}
