// The `rota` command and the deployed scheduler scripts it calls, answering from the simulated
// pool with the messages and key=value records of the real scripts: rota (front door),
// scheduler/adaptive_scheduler.sh, start_workers.sh (submit), reconcile_queue_batch.sh and
// monitor/monitor_pool_eta.py. A command returns {lines: [{text, err}], code, effects}.
import { ROOT, STATE_ROOT, hex } from './scenario.js';
import { control, resetFailures, registered, charged, allocationEta, meanRuntime } from './sim.js';
import {
  epochNow, submit, findBatch, poolEnv, coordinatorReady, resourcesEnv, controlEnv, statusEnv, etas, stamp,
} from './world.js';

export const ROTA_USAGE = `Usage: rota <command> [arguments...]

From a checkout:
  control describe|apply   Machine-readable pool controls (JSON) that Agent Bar uses (control/rota_control.py)
  config ...               Render or check the cluster inventory (setup/cluster_config.py)
  doctor                   Check SSH routes, tools and the shared drive (setup/doctor)
  monitor ...              Start the tmux dashboard (monitor/start_monitoring.sh)
  deploy ...               Deploy the scheduler to the shared root (setup/deploy.sh)

Through the shared root (${ROOT}):
  start ...                Launch a queue (start_workers.sh)
  kill ...                 Stop a queue's workers (kill_workers.sh)
  reconcile ...            Find and rerun a queue's missing jobs (reconcile_queue_batch.sh)
  <scheduler command> ...  Any adaptive_scheduler.sh command, for example submit,
                           pool-status, queue-status, pause, resume, set-priority,
                           pool-start or pool-drain (rota help-scheduler lists them all)`;

export const SCHEDULER_USAGE = `Usage: adaptive_scheduler.sh <command> [options]

Commands:
  submit-chain --manifest <json>   Submit an ordered list of submit argument lists
  pool-start --resources_file <file> [--pool_name <name>] [--shared_io_capacity <units>]
             [--io_pressure_host <host_id>] [--smbd_cpu_limit_pct <percent>]
             [--backfill 0|1]
  pool-start --recover-inactive [--expected-pool-id <pool_id>]
  pool-status
  set-host-budget --host_id <id> --cpu_units <int> --memory_mib <MiB>
                  [--expected-pool-id <pool_id>]
  set-host-state --host_id <id> --state away|present [--at <time>] [--until <time>]
                 [--reason <note>] [--expected-pool-id <pool_id>]
                 Away: start no new jobs there (running ones finish), from --at (default
                 now) until --until or until set present. Times: epoch or ISO local time
  pool-drain [--recover-inactive] [--expected-pool-id <pool_id>]
  submit --model_dir <dir> --queue <file> --memory_mib_per_job <MiB> [options]
  set-priority --batch_dir <dir> --schedule_priority <SPEC>  Replaces all host overrides
  set-max-workers --batch_dir <dir> --max_workers <non-negative integer>
  set-memory --batch_dir <dir> --memory_mib_per_job <positive MiB>
             [--expected-pool-id <pool_id>]
  pause|resume --batch_dir <dir>
  close-for-hard-stop --batch_dir <dir>
  queue-status --batch_dir <dir>
  wait-closed --batch_dir <dir> [--timeout_sec <seconds>]
  reset-failures --batch_dir <dir> --host_id <id> --reason <audit note>
                 [--expected-pool-id <pool_id>]
  resolve-uncertain --batch_dir <dir> --host_id <id> --reservation_id <id>
                    [--verify_lost_job]  Audit a loss for opt-in tail retry
                    --reason <audit note> [--expected-pool-id <pool_id>]
  restart-daemon --host_id <id> [--reason <audit note>] [--expected-pool-id <pool_id>]
                Restart one host's dead daemon; releases work its reboot ended
  confirm-interrupted-jobs --batch_dir <dir> --reason <audit note>
                Accept verified outputs of jobs that ran across a share interruption

Submit options:
  --run_name <label>                 Default: empty
  --project <source-repo-label>       Optional: 1-64 ASCII letters/digits/._-
  --schedule_priority <SPEC>         Default: 50. SPEC is an integer, or comma items:
                                      [default,]HOST=<integer>|HOST=off (pool host IDs)
  --cpu_units_per_job <integer>      Default: 1
  --shared_io_units_per_job <int>    Default: 1 if the pool has shared I/O capacity, else 0
  --gpu_units_per_job <int>          Default: 0. Devices per job, on hosts with gpu_units
  --memory_limit_mib <MiB>           Optional: end a job whose processes exceed this (sampled)
  --max_workers <integer>            Default: 0 (pool-limited)
  --paused                           Start with new-job admission paused
  --memory_calibration_jobs <0|20..50>  Opt in after successful jobs (default 0)
  --after <batch-dir|queue-id|unique-run-name>  Hold until successful completion; repeat for AND
  --retry_lost_jobs                Retry audited node-loss tail jobs once (default off)
  --early_eta_sample               Let the first two jobs in a queue of 20+ sample free slots early
  --memory_calibration_seconds <0|600..86400>  Opt in for long jobs (default 0)
  --memory_min_mib_per_job <MiB>       Calibration floor (default 64 when enabled)
  --recover_inactive                 Recover an audited stale queue guard

The three calibration options also apply to set-memory. Without them,
set-memory disables calibration and restores the requested memory floor.

Pool-start tuning:
  --cpu_tolerance_pct <0..100>        Background CPU tolerance, percent of one core (default 10)
  --tick_seconds <seconds>           Idle cadence (default 5); active work polls at most 1s apart
  --start_interval_seconds <seconds> Added worker spacing per host (default 4; 0 disables)

Pool-drain options:
  --recover-inactive                 Recover a dead coordinator directly into DRAINING
  --expected-pool-id <pool_id>       Refuse if the locked pool identity differs
                                      (also valid with pool-start --recover-inactive)`;

/** Subcommands and their options, for completion and the command list. */
export const SCHEDULER_COMMANDS = {
  'pool-status': [],
  'pool-start': ['--pool_name', '--start_interval_seconds', '--backfill'],
  'pool-drain': [],
  submit: ['--model_dir', '--queue', '--project', '--run_name', '--cpu_units_per_job', '--memory_mib_per_job', '--max_workers',
    '--schedule_priority', '--after', '--paused'],
  'queue-status': ['--batch_dir'],
  pause: ['--batch_dir'],
  resume: ['--batch_dir'],
  'set-priority': ['--batch_dir', '--schedule_priority'],
  'set-max-workers': ['--batch_dir', '--max_workers'],
  'close-for-hard-stop': ['--batch_dir'],
  'set-host-state': ['--host_id', '--state', '--reason'],
  'set-host-budget': ['--host_id', '--cpu_units', '--memory_mib'],
  'reset-failures': ['--batch_dir', '--host_id', '--reason'],
  'confirm-interrupted-jobs': ['--batch_dir', '--reason'],
};
export const ROTA_COMMANDS = ['help', 'help-scheduler', 'monitor', 'reconcile', 'control', 'config', 'doctor', 'deploy', 'start', 'kill',
  ...Object.keys(SCHEDULER_COMMANDS)];

class Exit extends Error {
  constructor(code) { super(`exit ${code}`); this.code = code; }
}

function context(world, effects) {
  const lines = [];
  const out = (text) => { for (const line of String(text).split('\n')) lines.push({ text: line, err: false }); };
  const err = (text) => { for (const line of String(text).split('\n')) lines.push({ text: line, err: true }); };
  const die = (message, code = 1) => { err(`Error: ${message}`); throw new Exit(code); };
  return { world, sim: world.sim, lines, out, err, die, effects };
}

/** Run argv (argv[0] names rota, adaptive_scheduler.sh, reconcile_queue_batch.sh or monitor_pool_eta.py). */
export function runCommand(world, argv) {
  const effects = [];
  const c = context(world, effects);
  let code = 0;
  try {
    const program = argv[0].split('/').pop();
    if (program === 'rota') rota(c, argv.slice(1));
    else if (program === 'adaptive_scheduler.sh') scheduler(c, argv.slice(1));
    else if (program === 'reconcile_queue_batch.sh') reconcile(c, argv.slice(1));
    else if (program === 'monitor_pool_eta.py') poolEta(c, argv.slice(1));
    else throw new Error(`unknown program ${program}`);
  } catch (error) {
    if (!(error instanceof Exit)) throw error;
    code = error.code;
  }
  return { lines: c.lines, code, effects };
}

function notSimulated(c, what) {
  c.out(`demo: ${what}`);
}

function rota(c, args) {
  const [command = 'help', ...rest] = args;
  switch (command) {
    case 'help': case '-h': case '--help': c.out(ROTA_USAGE); return;
    case 'help-scheduler': c.out(SCHEDULER_USAGE); return;
    case 'monitor': c.effects.push({ type: 'monitor' }); c.out('demo: attached to the dashboard window (tmux session "monitoring").'); return;
    case 'control': notSimulated(c, '`rota control` is the JSON interface Agent Bar reads; it is not simulated here. The Agent Bar demo on vetr.dev shows what it drives.'); return;
    case 'config': case 'doctor': case 'deploy':
      notSimulated(c, `\`rota ${command}\` is a setup step. This pool's inventory is already checked, deployed and started (see examples/cluster.json).`); return;
    case 'start': notSimulated(c, '`rota start` launches the fixed shared-queue and host-local-shard modes; this demo simulates the adaptive pool only.'); return;
    case 'kill': notSimulated(c, '`rota kill` deliberately stops a queue\'s workers; it is left out here. To stop new starts without stopping anything, use pause.'); return;
    case 'reconcile': reconcile(c, rest); return;
    default: scheduler(c, args);
  }
}

// -- adaptive_scheduler.sh ---------------------------------------------------------------------

function options(c, args, command, known, flags = []) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flags.includes(a)) { values[a] = true; continue; }
    if (!known.includes(a)) c.die(`unknown ${command} argument: ${a}`);
    if (i + 1 >= args.length) c.die(`${a} requires a value`);
    if (a === '--after') (values[a] ??= []).push(args[++i]);
    else values[a] = args[++i];
  }
  return values;
}

const isUint = (s) => /^[0-9]+$/.test(s ?? '');
const isInt = (s) => /^-?[0-9]+$/.test(s ?? '');

function scheduler(c, args) {
  if (!args.length) { c.err(SCHEDULER_USAGE); throw new Exit(2); }
  const [command, ...rest] = args;
  switch (command) {
    case 'pool-status': if (rest.length) c.die('pool-status takes no arguments'); poolStatus(c); return;
    case 'pool-start': poolStart(c, rest); return;
    case 'pool-drain': poolDrain(c, rest); return;
    case 'submit': submitQueue(c, rest); return;
    case 'queue-status': queueStatus(c, rest); return;
    case 'pause': case 'resume': case 'set-priority': case 'set-max-workers': case 'close-for-hard-stop': controlCommand(c, command, rest); return;
    case 'set-host-state': setHostState(c, rest); return;
    case 'set-host-budget': setHostBudget(c, rest); return;
    case 'reset-failures': resetCommand(c, rest); return;
    case 'confirm-interrupted-jobs': confirmInterrupted(c, rest); return;
    case 'submit-chain': case 'set-memory': case 'wait-closed': case 'resolve-uncertain': case 'restart-daemon':
    case 'verify-memory-calibration': case 'finalize-drain':
      notSimulated(c, `\`${command}\` is a real subcommand (rota help-scheduler describes it) that this demo does not simulate.`); return;
    case '-h': case '--help': case 'help': c.out(SCHEDULER_USAGE); return;
    default: c.err(SCHEDULER_USAGE); c.die(`unknown command: ${command}`);
  }
}

function poolStatus(c) {
  const { world, sim } = c;
  if (sim.pool.state === 'INACTIVE') { c.out('state=INACTIVE'); return; }
  c.out(poolEnv(world).join('\n'));
  if (sim.budgets) c.out(`host_budgets=${pyJson(sim.budgets)}`);
  if (sim.hostStates) c.out(`host_states=${pyJson(sim.hostStates)}`);
  const ready = Object.fromEntries(coordinatorReady(world).map((l) => l.split(/=(.*)/s).slice(0, 2)));
  c.out(['coordinator_live=1', 'coordinator_ready=1', 'heartbeat_age_sec=1', `resource_state=${ready.resource_state}`,
    `live_cpu_units=${ready.live_cpu_units}`, `live_memory_mib=${ready.live_memory_mib}`, 'io_pressure_state=disabled',
    'smbd_cpu_tenths=0', 'drain_complete=0'].join('\n'));
}

/** json.dumps() with Python's default separators. */
export const pyJson = (value) => JSON.stringify(value).replace(/([^\\])":/g, '$1": ').replace(/,"/g, ', "').replace(/,(\{|\[|[0-9-]|true|false|null)/g, ', $1');

function poolStart(c, args) {
  const { sim } = c;
  const known = ['--resources_file', '--pool_name', '--shared_io_capacity', '--io_pressure_host', '--smbd_cpu_limit_pct',
    '--cpu_tolerance_pct', '--tick_seconds', '--start_interval_seconds', '--lease_seconds', '--backfill', '--expected-pool-id'];
  const o = options(c, args.filter((a) => a !== '--recover-inactive'), 'pool-start', known);
  if (sim.pool.state !== 'INACTIVE') c.die(`an adaptive pool marker already exists or is ambiguous: ${STATE_ROOT}/pool.env`);
  const epoch = epochNow(c.world);
  const name = o['--pool_name'] ?? `adaptive-${stamp(epoch, '%Y%m%d-%H%M%S')}`;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) c.die('pool name and ID must be identifiers');
  sim.pool = { state: 'ACTIVE', name, created: epoch, id: `${name}.${epoch}.${48000 + sim.t % 997}.${Math.floor(Math.random() * 32767)}` };
  for (const h of sim.hosts) { h.lastContact = sim.t; }
  c.out(`pool_id=${sim.pool.id}\nstate=ACTIVE`);
}

function poolDrain(c, args) {
  options(c, args.filter((a) => a !== '--recover-inactive'), 'pool-drain', ['--expected-pool-id']);
  if (c.sim.pool.state === 'INACTIVE') c.die('no adaptive pool is active');
  c.sim.pool.state = 'DRAINING';
  c.world.forecastAt = -1;
  c.out('state=DRAINING');
}

const PROJECT_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** submit_queue() and the adaptive registration in start_workers.sh. */
function submitQueue(c, args, retry) {
  const { world, sim } = c;
  const known = ['--model_dir', '--queue', '--run_name', '--project', '--schedule_priority', '--cpu_units_per_job', '--memory_mib_per_job',
    '--shared_io_units_per_job', '--max_workers', '--after', '--gpu_units_per_job', '--memory_limit_mib', '--memory_calibration_jobs',
    '--memory_calibration_seconds', '--memory_min_mib_per_job'];
  const flags = ['--paused', '--retry_lost_jobs', '--early_eta_sample', '--recover_inactive', '--allow_network_coordinator'];
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flags.includes(a)) { o[a] = true; continue; }
    if (!known.includes(a)) c.die(`unknown submit argument: ${a}`);
    if (i + 1 >= args.length) c.die(`${a} requires a value`);
    if (a === '--after') (o[a] ??= []).push(args[++i]);
    else o[a] = args[++i];
  }
  const model = o['--model_dir'], queueArg = o['--queue'], memory = o['--memory_mib_per_job'];
  if (!model || !queueArg || !memory) c.die('submit requires --model_dir, --queue, and --memory_mib_per_job');
  const priority = o['--schedule_priority'] ?? '50';
  if (!isInt(priority) && !/[,=]/.test(priority)) c.die('schedule priority must be an integer or a per-host SPEC');
  const cpu = o['--cpu_units_per_job'] ?? '1';
  if (!isUint(cpu) || +cpu <= 0) c.die('CPU units must be a positive integer');
  if (!isUint(memory) || +memory <= 0) c.die('memory MiB must be a positive integer');
  const max = o['--max_workers'] ?? '0';
  if (!isUint(max)) c.die('max workers must be a non-negative integer');
  for (const k of ['--gpu_units_per_job', '--memory_limit_mib', '--memory_calibration_jobs', '--memory_calibration_seconds', '--early_eta_sample', '--retry_lost_jobs']) {
    if (o[k] !== undefined && o[k] !== '0') {
      c.out(`demo: ${k} is a real, opt-in option that this simulation leaves out; submitting without it.`);
    }
  }
  if (!model.startsWith('/')) c.die('adaptive --model_dir must be an absolute path.');
  const project = o['--project'];
  if (project !== undefined && !PROJECT_LABEL.test(project)) {
    c.die("--project must be 1-64 characters: an ASCII letter or digit followed by letters, digits, '.', '_' or '-'.");
  }
  const modelDir = model.replace(/\/+$/, '');
  const proj = world.projects.get(modelDir);
  const queueName = queueArg.startsWith('/') ? queueArg.split('/').pop() : queueArg.replace(/^queues\//, '');
  const queuePath = queueArg.startsWith('/') ? queueArg : `${modelDir}/queues/${queueName}`;
  if (!proj || !(queueName in proj.queues) || queuePath !== `${modelDir}/queues/${queueName}`) c.die(`queue file not found: ${queuePath}`);
  if (sim.pool.state === 'INACTIVE') c.die(`no adaptive pool is active: ${STATE_ROOT}/pool.env`);
  if (sim.pool.state !== 'ACTIVE') c.die(`adaptive pool is not admitting queues (state=${sim.pool.state}).`);
  const prior = registered(sim).find((q) => q.queueFile === queuePath);
  if (prior) c.die(`the prior adaptive queue is still registered: ${STATE_ROOT}/queues/${prior.id}.env`);
  let spec;
  try {
    spec = prioritySpec(sim, priority);
  } catch (error) {
    c.die(`--schedule_priority must be an integer or a per-host SPEC for adaptive mode.`, 2);
  }
  if (!sim.hosts.some((h) => h.enabled && h.cpu >= +cpu && h.mem >= +memory)) c.die('this job profile does not fit any enabled adaptive host.');
  const after = [];
  for (const ref of o['--after'] ?? []) {
    let found;
    if (ref.includes('/')) {
      found = findBatch(world, ref);
      if (!found) { c.err(`adaptive workflow: missing or unsafe workflow metadata: ${ref.replace(/\/+$/, '')}/run_meta.env`); throw new Exit(1); }
    } else {
      const matches = sim.queues.filter((q) => q.id === ref || q.runName === ref);
      if (matches.length !== 1) { c.err(`adaptive workflow: dependency '${ref}' has ${matches.length} matches; use its batch path`); throw new Exit(1); }
      found = matches[0];
    }
    if (!after.includes(found.id)) after.push(found.id);
  }
  const colorKey = (o['--run_name'] ?? '').toLowerCase();
  const q = submit(world, {
    modelDir, queueFile: queueName, runName: o['--run_name'] ?? '', project: project ?? '', cpu: +cpu, mem: +memory,
    priority: spec.priority, hostPriority: spec.hostPriority, maxWorkers: +max, paused: !!o['--paused'], after,
    colorKey: /^[a-e]$/.test(colorKey) ? colorKey : null, retryLines: retry?.lines, retryOf: retry?.of,
  });
  c.out(`Creating new batch directory: ${modelDir}/logs/${q.batchName}`);
  c.out(`Creating batch-specific editable queue: ${q.batchDir}/queue-edit.txt`);
  c.out(`batch_dir=${q.batchDir}`);
  c.out(`queue_id=${q.id}`);
  if (q.project) {
    const mine = registered(sim).filter((x) => x.project === q.project);
    const counts = { running: 0, paused: 0, waiting: 0, closing: 0 };
    let workers = 0;
    for (const x of mine) {
      const running = x.jobs.filter(charged).length;
      workers += running;
      counts[x.admission === 'paused' ? 'paused' : x.admission === 'closed' ? 'closing' : running ? 'running' : 'waiting'] += 1;
    }
    const details = Object.entries(counts).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ');
    c.out(`Project ${q.project}: ${mine.length} registered queues (${details}); ${workers} workers.`);
  } else {
    c.err('no project label; submit with --project <source-repo>');
    c.err('Queue registered successfully; project summary failed. Do not resubmit this queue.');
  }
  c.out("Job compatibility: scripts, dependencies and binaries must support every enabled worker's OS/architecture; the scheduler does not select hosts by platform.");
  c.effects.push({ type: 'submitted', queue: q.id });
}

/** "[default,]HOST=<integer>|HOST=off" → {priority, hostPriority}. */
export function prioritySpec(sim, spec) {
  if (isInt(spec)) return { priority: +spec, hostPriority: {} };
  let priority = 50;
  const hostPriority = {};
  spec.split(',').forEach((item, i) => {
    if (i === 0 && isInt(item)) { priority = +item; return; }
    const m = /^([A-Za-z0-9._-]+)=(-?[0-9]+|off)$/.exec(item);
    if (!m || !sim.hosts.some((h) => h.id === m[1]) || m[1] in hostPriority) throw new Error(`invalid SPEC item ${item}`);
    hostPriority[m[1]] = m[2] === 'off' ? 'off' : +m[2];
  });
  return { priority, hostPriority };
}

/** adaptive_paths(): the batch a --batch_dir names, registered unless `retired` is allowed. */
function batchFor(c, dir, allowRetired) {
  const q = findBatch(c.world, dir);
  if (!q) c.die(`batch directory not found: ${dir}`);
  if (!allowRetired && q.retired) c.die(`adaptive registration is missing or ambiguous: ${STATE_ROOT}/queues/${q.id}.env`);
  return q;
}

function queueStatus(c, args) {
  const o = options(c, args, 'queue-status', ['--batch_dir']);
  if (!o['--batch_dir']) c.die('queue-status requires --batch_dir');
  const q = batchFor(c, o['--batch_dir'], true);
  const { world } = c;
  c.out(resourcesEnv(world, q).join('\n'));
  const controlLines = controlEnv(world, q);
  for (const line of controlLines) {
    c.out(line);
    if (line.startsWith('schedule_priority=') && !controlLines.some((l) => l.startsWith('host_priorities='))) c.out('host_priorities=');
  }
  c.out([`initial_memory_mib_per_job=${q.mem}`, `requested_memory_mib_per_job=${q.mem}`, `effective_memory_mib_per_job=${q.mem}`,
    'memory_calibration_state=off', 'memory_calibration_reason=disabled', 'memory_calibration_sample_jobs=0', 'memory_calibration_candidate_mib='].join('\n'));
  const skip = /^(initial_memory_mib_per_job|requested_memory_mib_per_job|effective_memory_mib_per_job|memory_calibration_state|memory_calibration_reason|memory_calibration_sample_jobs|memory_calibration_candidate_mib)=/;
  c.out(statusEnv(world, q).filter((l) => !skip.test(l)).join('\n'));
}

function controlCommand(c, action, args) {
  const known = ['--batch_dir', '--expected-pool-id', ...(action === 'set-priority' ? ['--schedule_priority'] : []),
    ...(action === 'set-max-workers' ? ['--max_workers'] : [])];
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['--batch_dir', '--schedule_priority', '--max_workers', '--expected-pool-id'].includes(a) && i + 1 >= args.length) c.die(`${a} requires a value`);
    if (!known.includes(a)) c.die(`unknown ${action} argument: ${a}`);
    o[a] = args[++i];
  }
  if (!o['--batch_dir']) c.die(`${action} requires --batch_dir`);
  const { sim, world } = c;
  if (action === 'resume' && sim.pool.state !== 'ACTIVE') c.die('cannot resume while the adaptive pool is not ACTIVE');
  if (action === 'set-priority' && !o['--schedule_priority']) c.die('set-priority requires --schedule_priority');
  if (action === 'set-max-workers' && o['--max_workers'] === undefined) c.die('set-max-workers requires --max_workers');
  const q = batchFor(c, o['--batch_dir'], false);
  if (q.admission === 'closed' && (action === 'pause' || action === 'resume')) c.die('hard-stop admission closure cannot be reopened for this batch');
  if (action === 'pause') control(sim, q, 'admission', 'paused');
  else if (action === 'resume') control(sim, q, 'admission', 'enabled');
  else if (action === 'close-for-hard-stop') control(sim, q, 'admission', 'closed');
  else if (action === 'set-priority') {
    let spec;
    try { spec = prioritySpec(sim, o['--schedule_priority']); } catch { c.die(`invalid schedule priority SPEC: ${o['--schedule_priority']}`); }
    control(sim, q, 'priority', spec);
  } else {
    if (!isUint(o['--max_workers'])) c.die('max workers must be a non-negative integer');
    control(sim, q, 'maxWorkers', +o['--max_workers']);
  }
  q.controlEpoch = epochNow(world);
  world.forecastAt = -1;
  const hp = Object.entries(q.hostPriority).map(([h, v]) => `${h}=${v}`).join(',');
  c.out([`queue_id=${q.id}`, `generation=${q.generation}`, `admission=${q.admission}`, `schedule_priority=${q.priority}`,
    ...(hp ? [`host_priorities=${hp}`] : []), `max_workers=${q.maxWorkers}`].join('\n'));
  c.effects.push({ type: 'control', action, queue: q.id });
}

const hostArg = (c, id) => c.sim.hosts.find((x) => x.id === id);

function setHostState(c, args) {
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (i + 1 >= args.length) c.die(`${args[i]} requires a value`);
    if (!['--host_id', '--state', '--at', '--until', '--reason', '--expected-pool-id'].includes(args[i])) c.die(`unknown set-host-state argument: ${args[i]}`);
    o[args[i]] = args[i + 1];
  }
  const state = o['--state'];
  if (!o['--host_id'] || (state !== 'away' && state !== 'present')) c.die('set-host-state requires --host_id and --state away|present');
  if (state === 'away' && !o['--reason']) c.die('set-host-state --state away requires --reason');
  if (o['--at'] || o['--until']) { c.out('demo: scheduled away windows (--at, --until) are real but not simulated; applying now.'); }
  const h = hostArg(c, o['--host_id']);
  if (!h) c.die(`host state requires an enabled pool host`);
  if (state === 'away' && /[\t,:]/.test(o['--reason'])) c.die('--reason must be one line without tabs, commas or colons');
  const { sim } = c;
  const epoch = epochNow(c.world);
  sim.hostStates ??= { schema_version: 1, pool_id: sim.pool.id, generation: 0, hosts: {} };
  sim.hostStates.generation += 1;
  if (state === 'away') {
    h.away = true;
    sim.hostStates.hosts[h.id] = { away_from: epoch, away_until: null, reason: o['--reason'], set_epoch: epoch };
  } else {
    h.away = false;
    delete sim.hostStates.hosts[h.id];
  }
  c.world.forecastAt = -1;
  const cur = sim.hostStates.hosts[h.id];
  c.out([`pool_id=${sim.pool.id}`, `host_id=${h.id}`, `away_now=${h.away ? 1 : 0}`, `away_from=${cur ? cur.away_from : ''}`,
    'away_until=', `host_state_generation=${sim.hostStates.generation}`].join('\n'));
  c.effects.push({ type: 'host-state', host: h.id, away: h.away });
}

function setHostBudget(c, args) {
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (i + 1 >= args.length) c.die(`${args[i]} requires a value`);
    if (!['--host_id', '--cpu_units', '--memory_mib', '--expected-pool-id'].includes(args[i])) c.die(`unknown set-host-budget argument: ${args[i]}`);
    o[args[i]] = args[i + 1];
  }
  if (!o['--host_id'] || !isUint(o['--cpu_units']) || +o['--cpu_units'] <= 0 || !isUint(o['--memory_mib']) || +o['--memory_mib'] <= 0) {
    c.die('set-host-budget requires --host_id and positive --cpu_units and --memory_mib');
  }
  const h = hostArg(c, o['--host_id']);
  if (!h) { c.err('Error: positive budgets and an enabled host are required'); throw new Exit(1); }
  const { sim } = c;
  sim.budgets ??= { schema_version: 1, pool_id: sim.pool.id, generation: 0, hosts: {} };
  h.cpu = +o['--cpu_units'];
  h.mem = +o['--memory_mib'];
  sim.budgets.hosts[h.id] = { cpu_units: h.cpu, memory_mib: h.mem };
  sim.budgets.generation += 1;
  c.world.forecastAt = -1;
  c.out(`pool_id=${sim.pool.id}\nhost_id=${h.id}\ncpu_units=${h.cpu}\nmemory_mib=${h.mem}\nbudget_generation=${sim.budgets.generation}`);
}

function resetCommand(c, args) {
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (i + 1 >= args.length) c.die(`recovery option requires a value: ${args[i]}`);
    if (!['--batch_dir', '--host_id', '--reason', '--expected-pool-id', '--reservation_id'].includes(args[i])) c.die(`unknown recovery option: ${args[i]}`);
    o[args[i]] = args[i + 1];
  }
  if (!o['--batch_dir'] || !o['--host_id'] || !o['--reason']) c.die('recovery requires --batch_dir, --host_id, and --reason');
  const q = batchFor(c, o['--batch_dir'], false);
  const h = hostArg(c, o['--host_id']);
  if (!h) c.die(`unknown adaptive host: ${o['--host_id']}`);
  if (!h.reachable) { c.err(`ssh: connect to host ${h.id} port 22: No route to host`); throw new Exit(255); }
  resetFailures(c.sim, q, h.id);
  c.world.forecastAt = -1;
  c.out(pyJson({ reset_requested: '1', token: hex(`${q.id}:${h.id}:${c.sim.t}`, 16), host_id: h.id, queue_id: q.id }));
  c.effects.push({ type: 'reset-failures', queue: q.id, host: h.id });
}

function confirmInterrupted(c, args) {
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--batch_dir', '--reason'].includes(args[i])) c.die(`unknown confirm-interrupted-jobs argument: ${args[i]}`);
    o[args[i]] = args[i + 1];
  }
  if (!o['--batch_dir'] || !o['--reason']) c.die('confirm-interrupted-jobs requires --batch_dir and --reason');
  const q = batchFor(c, o['--batch_dir'], true);
  const records = q.jobs.filter((j) => j.interrupted && j.doneMarker && !j.confirmed);
  if (!q.jobs.some((j) => j.interrupted && j.doneMarker)) c.die(`no share interruptions are recorded for ${q.batchDir}`);
  for (const j of records) { j.confirmed = true; c.out(`confirmed=job_${j.id}.${j.host}`); }
  c.out(`confirmed_jobs=${records.length}`);
  c.world.forecastAt = -1;
  c.effects.push({ type: 'confirmed', queue: q.id });
}

// -- reconcile_queue_batch.sh -----------------------------------------------------------------

function reconcile(c, args) {
  const { world, sim } = c;
  let model = '', queueFile = 'job_queue.txt', batchDir = '', rerun = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--model_dir') model = args[++i] ?? '';
    else if (a === '--queue') queueFile = args[++i] ?? '';
    else if (a === '--batch_dir') batchDir = args[++i] ?? '';
    else if (a === '--rerun_missing') rerun = true;
    else if (a === '--replace_dependency') {
      if (i + 2 >= args.length) { c.err('--replace_dependency requires OLD_BATCH NEW_BATCH'); throw new Exit(1); }
      i += 2;
      c.out('demo: --replace_dependency rebinds a waiting stage to a retried batch; it is real but not simulated here.');
    }
    else {
      c.err(`Error: Unknown argument: ${a}`);
      c.err('Usage: reconcile_queue_batch.sh --model_dir <MODEL_DIR> [--queue <queue_file>] [--batch_dir <batch_dir>] [--retry_queue <name>] [--rerun_missing]');
      throw new Exit(1);
    }
  }
  if (!model) { c.err('Error: --model_dir is required'); throw new Exit(1); }
  const modelDir = model.replace(/\/+$/, '');
  const name = queueFile.split('/').pop();
  const original = queueFile.startsWith('/') ? queueFile : `${modelDir}/queues/${name}`;
  const proj = world.projects.get(modelDir);
  if (!proj || !(name in proj.queues)) { c.err(`Error: Queue file not found: ${original}`); throw new Exit(1); }
  let q;
  if (batchDir) {
    q = findBatch(world, batchDir);
    if (!q) { c.err('Error: Could not determine a valid batch directory'); throw new Exit(1); }
    if (q.queueFile !== original) { c.err(`Error: Batch metadata points to a different queue: ${q.queueFile}`); throw new Exit(1); }
  } else {
    q = [...sim.queues].reverse().find((x) => x.queueFile === original);
    if (!q) { c.err(`Error: No batch metadata under ${modelDir}/logs/ matches ${original}`); c.err('Pass --batch_dir explicitly only for a legacy batch without run_meta.env.'); throw new Exit(1); }
  }
  const expected = [...new Set(q.jobs.map((j) => j.id))].sort();
  const done = q.jobs.filter((j) => j.doneMarker).map((j) => j.id).sort();
  const missing = expected.filter((id) => !done.includes(id));
  const base = name.replace(/\.[^.]*$/, '');
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const retryName = `${base}-retry-missing-${q.batchName}${ext}`;
  const retryPath = `${modelDir}/queues/${retryName}`;
  const retryLines = q.jobs.filter((j) => missing.includes(j.id)).map((j) => `${j.id} ${j.cmd}`);
  const summary = [`batch_dir=${q.batchDir}`, 'execution_mode=adaptive-shared-queue', `original_queue=${original}`,
    `reconciliation_queue=${q.batchDir}/queue-edit.txt`, `done_dir=${q.batchDir}/done`, `retry_queue=${retryPath}`,
    `expected_count=${expected.length}`, `done_count=${done.length}`, `missing_count=${missing.length}`, `retry_count=${retryLines.length}`];
  q.reconciled = {
    files: { 'expected_ids.txt': expected.join('\n'), 'done_ids.txt': done.join('\n'), 'missing_ids.txt': missing.join('\n'), 'summary.txt': summary.join('\n') },
    retryQueue: { path: retryPath, text: retryLines.join('\n') },
  };
  c.out(summary.join('\n'));
  c.effects.push({ type: 'reconciled', queue: q.id, missing: missing.length });
  if (!missing.length) { c.out('No missing jobs detected.'); return; }
  proj.queues[retryName] = retryLines;
  c.out(`Missing job IDs written to: ${q.batchDir}/reconcile/missing_ids.txt`);
  c.out(`Retry queue written to: ${retryPath}`);
  if (!rerun) return;
  const terminal = (q.lifecycle === 'COMPLETED' || q.lifecycle === 'FINISHED_INCOMPLETE') && !q.jobs.some(charged)
    && q.targetWorkers === 0 && q.appliedGeneration === q.generation;
  if (!terminal) { c.err('Error: adaptive retry requires exact terminal zero-admission status.'); throw new Exit(1); }
  if (!q.retired) { c.err('Error: adaptive retry is blocked while the source queue remains registered.'); throw new Exit(1); }
  c.out('Launching adaptive retry batch for missing jobs...');
  const argv = ['--model_dir', modelDir, '--queue', retryPath, '--cpu_units_per_job', String(q.cpu), '--memory_mib_per_job', String(q.mem),
    '--max_workers', String(q.maxWorkers), '--run_name', q.runName, '--schedule_priority', String(q.priority),
    ...(q.project ? ['--project', q.project] : []), ...(q.admission === 'paused' ? ['--paused'] : [])];
  try {
    submitQueue(c, argv, { lines: retryLines, of: q.id });
  } catch (error) {
    if (error instanceof Exit) {
      c.err('Retry queue retained; the adaptive pool did not accept it.');
      c.err(`Future submit command: ${ROOT}/adaptive_scheduler.sh submit ${argv.join(' ')}`);
    }
    throw error;
  }
}

// -- monitor_pool_eta.py --------------------------------------------------------------------------

function poolEta(c, args) {
  const { world, sim } = c;
  if (!args.includes('--root')) {
    c.err('usage: monitor_pool_eta.py [-h] --root ROOT [--state-root STATE_ROOT] [--json] [--allocation-only] [--with-warnings]');
    c.err('monitor_pool_eta.py: error: the following arguments are required: --root');
    throw new Exit(2);
  }
  if (sim.pool.state !== 'ACTIVE') { c.err('pool ETA unavailable: pool is inactive, stale or has quarantined queues'); throw new Exit(1); }
  const allocationOnly = args.includes('--allocation-only');
  const eta = allocationOnly ? {} : etas(world);
  const seconds = (v) => (v !== null && v !== undefined && Number.isFinite(v) ? Math.max(1, Math.round(v)) : null);
  const rows = {};
  for (const q of registered(sim)) {
    const mean = meanRuntime(q);
    rows[q.id] = {
      batch: q.batchDir, allocation_eta_sec: seconds(allocationEta(sim, q)), pool_eta_sec: allocationOnly ? null : seconds(eta[q.id]),
      sample_jobs: q.jobs.filter((j) => j.doneMarker).length, mean_runtime_sec: mean,
      dispatch_by_host: {}, eta_warning: null,
    };
  }
  if (args.includes('--json')) c.out(JSON.stringify(rows, null, 2));
  else for (const r of Object.values(rows)) c.out([r.batch, r.allocation_eta_sec ?? -1, r.pool_eta_sec ?? -1].join('\t'));
}

