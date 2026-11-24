import test from 'node:test';
import assert from 'node:assert/strict';
import {equipment, moves, programs, sources} from '../core/catalog.js';
import {prescriptionFor, reviewRoutine, submit} from '../core/plan.js';
import {doseReading} from '../core/program-dose.js';

const studio = {location:'open-area', intensity:'vigorous', allowFloor:true, discretion:'any',
  equipment:Object.keys(equipment), seconds:7200};

test('each named program keeps its order and its active dose across review, application and recall', () => {
  assert.equal(new Set(programs.map(p => p.id)).size, 12);
  for (const program of programs) {
    const request = {...studio, programId:program.id};
    const report = reviewRoutine(request);
    assert.ok(report.fits, program.id);
    assert.ok(program.sourceIds.every(id => sources[id]?.url.startsWith('https://')));
    const plan = submit(request);
    assert.deepEqual(plan.steps.map(s => s.id), program.steps.map(s => s.id));
    for (const [i, step] of plan.steps.entries()) {
      const dose = program.steps[i];
      assert.equal(step.seconds - plan.transitionSeconds[i], dose.seconds * (dose.sides ?? 1));
      assert.equal(prescriptionFor(step), dose);
      assert.ok(moves.find(m=>m.id===step.id).tags.includes(program.style));
    }
    assert.deepEqual(submit({...studio, steps:plan.steps}).steps, plan.steps);
  }
  assert.throws(()=>submit({...studio,programId:'agile-8',steps:[]}));
  assert.throws(()=>submit({...studio,steps:[{id:'standing-tree',seconds:15,prescription:'limber-11/0'}]}));
});

test('intensity, floor permission, supports and precautions apply to individual program steps', () => {
  const programId = 'limber-11';
  const gentle = reviewRoutine({...studio, programId, intensity:'gentle'});
  const roll = gentle.rows.find(r=>r.id==='supine-rollover-straddle');
  assert.ok(roll.issues.some(issue=>issue.includes('vigorous')));
  assert.ok(!reviewRoutine({...studio, programId, limitations:['no-inversion']}).fits);
  const short = reviewRoutine({...studio, programId, seconds:120});
  assert.equal(short.overBudgetSeconds, short.totalSeconds-120);
  const bed = submit({...studio,allowFloor:false,limitations:['no-floor']}).eligibleIds;
  assert.ok(bed.includes('supine-bed-edge-hip-stretch'));
  for (const id of ['hands-and-knees-bird-dog','standing-inchworm','supine-rollover-straddle','prone-roller-adductor'])
    assert.ok(!bed.includes(id), id);
  const bare = submit({...studio,equipment:[],allowFloor:false}).eligibleIds;
  for (const id of ['supine-bed-edge-hip-stretch','seated-mountain']) assert.ok(!bare.includes(id));
  const limited = submit({...studio, limitations:['hip-precautions','no-prone','hands-loaded']});
  assert.ok(limited.eligibleIds.every(id => {
    const m=moves.find(m=>m.id===id);
    return m.pose!=='prone' && !/hip replacement/i.test(m.caution) && !m.restrictions.includes('hands-loaded');
  }));
  assert.ok(!submit({...studio,equipment:['doorway','band']}).eligibleIds.includes('standing-band-row'));
});

test('progressive holds, per-side demonstrations and custom durations use the appropriate clock', () => {
  const program=programs.find(p=>p.id==='starting-to-stretch');
  const dose=program.steps.find(s=>s.sides===2);
  const at=t=>doseReading(dose,t,180,4);
  assert.match(at(0).label,/First side.*Round 1.*pulse 1 of 10/);
  assert.match(at(10).label,/Hold · 10 s/);
  assert.match(at(30).label,/Round 2.*Hold · 20 s/);
  assert.match(at(60).label,/Round 3.*Hold · 30 s/);
  assert.match(at(90).label,/Second side.*Round 1/);
  assert.equal(at(110).phase-at(20).phase,4);
  assert.equal(doseReading(dose,20,160,4),null);
  const hold = {id:'supine-knee-roll',seconds:300,sides:2};
  assert.equal(doseReading(hold,15,600,4).phase,2);
  assert.equal(doseReading(hold,320,600,4).phase,6);
});
