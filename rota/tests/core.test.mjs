// The demo's back end: the renderers match ROTA's own (fixtures captured from
// render_queue_progress.sh, monitor_cpu.py and monitor_linux.py), and the simulation keeps the
// scheduler's promises. Run: node --test rota/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queueProgress, cpuMeters, memoryLines } from '../core/render.js';
import { createWorld, step, dashboard } from '../core/world.js';
import { createShell, execute, complete } from '../core/shell.js';
import { setCable, lease, charged } from '../core/sim.js';
import { ANALYSIS } from '../core/scenario.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const merge = (lines) => lines.map((runs) => {
  const out = [];
  for (const [t, s] of runs) {
    if (!t) continue;
    if (out.length && out[out.length - 1][1] === s) out[out.length - 1][0] += t; else out.push([t, s]);
  }
  return out.filter(([t, s], i) => !(i === out.length - 1 && s === '' && !t.trim()));
});

test('the queue table matches render_queue_progress.sh, colours included', () => {
  for (const [name, c] of Object.entries(fixture('queue-progress.json'))) {
    assert.deepEqual(merge(queueProgress(c.rows, c.cols)), c.lines, name);
  }
});

test('CPU and memory panes match monitor_cpu.py and monitor_linux.py', () => {
  const f = fixture('meters.json');
  for (const c of f.cpu) assert.deepEqual(cpuMeters(c.values, c.width, c.height), c.lines);
  for (const c of f.memory) assert.deepEqual(memoryLines(c.data, c.width, '0.00%'), c.lines);
});

function pool() {
  const world = createWorld({ epoch: 1795700000 });
  const sh = createShell(world, 'storage');
  const run = (line, shell = sh) => {
    const r = execute(shell, line);
    return { ...r, text: r.lines.map((l) => l.text).join('\n') };
  };
  const batchOf = (r) => /batch_dir=(\S+)/.exec(r.text)[1];
  const q = (run) => world.sim.queues.find((x) => x.runName === run);
  const perHost = (x) => world.sim.hosts.map((h) => x.jobs.filter((j) => j.host === h.id && charged(j)).length);
  return { world, sh, run, batchOf, q, perHost };
}
const submit = (file, name, mem, extra = '') =>
  `rota submit --model_dir ${ANALYSIS} --queue ${file} --project my-analysis --run_name ${name} --cpu_units_per_job 1 --memory_mib_per_job ${mem}${extra}`;

test('the first-job example writes 9 and 49', () => {
  const { world, run } = pool();
  run('project=$(bash examples/first-job/prepare.sh)');
  const r = run('rota submit --model_dir "$project" --queue jobs.txt --project my-analysis --run_name pilot --cpu_units_per_job 1 --memory_mib_per_job 512 --max_workers 1');
  assert.equal(r.code, 0);
  assert.match(r.text, /^Project my-analysis: 1 registered queues \(1 waiting\); 0 workers\.$/m);
  step(world, 15);
  assert.equal(run('cat "$project/results/3.txt" "$project/results/7.txt"').text, '9\n49');
  assert.match(run('rota queue-status --batch_dir ' + world.sim.queues[0].batchDir).text, /^lifecycle=COMPLETED$/m);
});

test('a raised priority takes freed slots and never stops a running job', () => {
  const { world, run, batchOf, q, perHost } = pool();
  run(submit('a.txt', 'A', 1024));
  step(world, 90);
  assert.deepEqual(perHost(q('A')), [4, 8], 'A fills both hosts');
  const b = batchOf(run(submit('b.txt', 'B', 1536)));
  step(world, 600);
  const [a1, b1] = [perHost(q('A')), perHost(q('B'))];
  assert.equal(a1[0] + a1[1], b1[0] + b1[1], 'equal priorities share the slots');
  const runningA = q('A').jobs.filter((j) => j.state === 'running').map((j) => j.id);
  run(`rota set-priority --batch_dir ${b} --schedule_priority 90`);
  step(world, 1);
  for (const id of runningA) assert.equal(q('A').jobs.find((j) => j.id === id).state, 'running', `${id} keeps running`);
  step(world, 180);
  const a2 = perHost(q('A'));
  assert.ok(a2[0] + a2[1] < a1[0] + a1[1], 'A shrinks as its jobs end');
  assert.ok(q('A').jobs.every((j) => j.state !== 'ended' || j.endedAt - j.start === j.duration), 'every job ran to its end');
});

test('pause stops new starts; --after waits for the predecessor to complete', () => {
  const { world, run, batchOf, q, perHost } = pool();
  const a = batchOf(run(submit('a.txt', 'A', 1024)));
  const b = batchOf(run(submit('b.txt', 'B', 1536)));
  step(world, 120);
  run(`rota pause --batch_dir ${a}`);
  const startedA = q('A').jobs.filter((j) => j.state !== 'pending').length;
  step(world, 300);
  assert.equal(q('A').jobs.filter((j) => j.state !== 'pending').length, startedA, 'no new A starts while paused');
  run(`rota submit --model_dir ${ANALYSIS} --queue c.txt --project my-analysis --run_name C --memory_mib_per_job 768 --after ${b}`);
  step(world, 2);
  assert.equal(q('C').blockingReason, 'dependency_wait');
  run(`rota resume --batch_dir ${a}`);
  for (let i = 0; i < 60 && q('B').lifecycle !== 'COMPLETED'; i++) step(world, 60);
  assert.equal(q('B').lifecycle, 'COMPLETED');
  step(world, 30);
  assert.ok(q('C').jobs.some((j) => j.state !== 'pending'), 'C starts once B completes');
  assert.deepEqual(perHost(q('C')).length, 2);
});

test('a lost host keeps its jobs; an expired lease starts nothing; the audit finds what is missing', () => {
  const { world, run, q } = pool();
  const worker = createShell(world, 'worker');
  run(submit('a.txt', 'A', 1024));
  step(world, 100);
  const onWorker = q('A').jobs.filter((j) => j.host === 'worker' && j.state === 'running');
  assert.equal(onWorker.length, 8);
  setCable(world.sim, 'worker', false);
  step(world, 25);
  assert.ok(lease(world.sim, world.sim.hosts[1]).expired);
  assert.match(run('cat /srv/cluster/.rota/adaptive/coordinator.ready').text, /^unavailable_hosts=worker:unreachable$/m);
  assert.match(run('ps', worker).text, /simulate\.py/, 'jobs still run on the worker');
  const started = q('A').jobs.filter((j) => j.host === 'worker' && j.start > world.sim.t - 25);
  assert.equal(started.length, 0, 'nothing new starts on the unreachable host');
  assert.match(run('ls /srv/cluster', worker).text, /Host is down/);
  setCable(world.sim, 'worker', true);
  for (let i = 0; i < 40 && !q('A').retired; i++) step(world, 120);
  const interrupted = q('A').jobs.filter((j) => j.interrupted && j.doneMarker);
  assert.ok(interrupted.length > 0, 'jobs that ran across the drop are recorded');
  assert.match(run(`rota queue-status --batch_dir ${q('A').batchDir}`).text, new RegExp(`^share_interrupted_jobs=${interrupted.length}$`, 'm'));
  const r = run(`rota reconcile --model_dir ${ANALYSIS} --queue a.txt`);
  assert.match(r.text, /^expected_count=48$/m);
  assert.equal(q('A').jobs.filter((j) => j.state === 'running').length, 0);
  const c = run(`rota confirm-interrupted-jobs --batch_dir ${q('A').batchDir} --reason "checked"`);
  assert.match(c.text, new RegExp(`^confirmed_jobs=${interrupted.length}$`, 'm'));
});

test('a job that ends while the share is gone holds its queue on that host until reset', () => {
  const { world, run, q } = pool();
  run(submit('a.txt', 'A', 1024));
  step(world, 100);
  setCable(world.sim, 'worker', false);
  step(world, 400);
  setCable(world.sim, 'worker', true);
  step(world, 2);
  assert.equal(world.sim.holds.worker[q('A').id], 'infrastructure_failed');
  assert.match(run(`rota queue-status --batch_dir ${q('A').batchDir}`).text, /^failure_holds=worker:infrastructure_failed$/m);
  assert.match(dashboard(world, 132).lines.map((l) => l.map(([t]) => t).join('')).join('\n'), /Failure hold/);
  const r = run(`rota reset-failures --batch_dir ${q('A').batchDir} --host_id worker --reason "audited"`);
  assert.match(r.text, /"reset_requested": "1"/);
  assert.equal(world.sim.holds.worker[q('A').id], undefined);
});

test('the CLI answers like the real one', () => {
  const { run } = pool();
  const unknown = run('rota frobnicate');
  assert.equal(unknown.code, 1);
  assert.equal(unknown.lines.at(-1).text, 'Error: unknown command: frobnicate');
  assert.equal(run('frob').lines[0].text, 'bash: frob: command not found');
  assert.equal(run('rota submit --model_dir /x').lines[0].text, 'Error: submit requires --model_dir, --queue, and --memory_mib_per_job');
  assert.match(run('rota pause').text, /^Error: pause requires --batch_dir$/m);
  assert.match(run('rota pool-status').text, /^live_cpu_units=12$/m);
  assert.match(run(submit('a.txt', 'A', 1024)).text, /batch_dir=/);
  assert.match(run(submit('a.txt', 'A', 1024)).text, /^Error: the prior adaptive queue is still registered/m);
});

test('completion knows subcommands, options and batch directories', () => {
  const { sh, run } = pool();
  assert.deepEqual(complete(sh, 'rota set-pr').replacement, 'set-priority ');
  assert.ok(complete(sh, 'rota se').candidates.includes('set-host-state'));
  run(submit('a.txt', 'A', 1024));
  assert.match(complete(sh, 'rota pause --batch_dir /srv/cluster/projects/my-analysis/logs/b').replacement, /batch_00001_\d{4}-\d\d-\d\d $/);
});
