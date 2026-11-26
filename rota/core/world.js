// The simulated cluster as the CLI and dashboard see it: the scheduler simulation (sim.js) plus
// the shared drive's projects, batch directories and records, laid out as ROTA lays them out.
import {
  createSim, tick, addQueue, charged, pendingJobs, registered, lease, forecast, allocationEta, hash01, START_INTERVAL_SECONDS, LEASE_SECONDS,
} from './sim.js';
import {
  ROOT, STATE_ROOT, CHECKOUT, HOME, ANALYSIS, CLUSTER, ANALYSIS_QUEUES, analysisLines, firstJobLines, jobDuration, mktempSuffix, hex,
  SQUARE_PY, PREPARE_SH, CLUSTER_JSON,
} from './scenario.js';
import { cpuMeters, memoryLines, clusterIo, storageRows, mountLines, queueProgress, composeDashboard, totalPercent, wrapText, dur } from './render.js';

/** Hardware behind each host's budget (cluster.json sets the budget, a ceiling). */
const HARDWARE = { storage: { cores: 4, memGiB: 16, baseGiB: 2.1, cacheGiB: 3.2 }, worker: { cores: 8, memGiB: 32, baseGiB: 1.6, cacheGiB: 4.5 } };

export function createWorld({ epoch = Math.floor(Date.now() / 1000) } = {}) {
  const sim = createSim({ hosts: CLUSTER.hosts, epoch });
  const poolName = `adaptive-${stamp(epoch - 3600, '%Y%m%d-%H%M%S')}`;
  sim.pool.id = `${poolName}.${epoch - 3600}.48211.${Math.floor(hash01(`pool:${epoch}`) * 32767)}`;
  sim.pool.name = poolName;
  sim.pool.created = epoch - 3600;
  const world = {
    sim,
    projects: new Map(),
    prepared: 0,
    batchCount: new Map(),
    batches: new Map(),
    forecastAt: -1,
    eta: {},
  };
  addProject(world, ANALYSIS, 'my-analysis', Object.fromEntries(Object.keys(ANALYSIS_QUEUES).map((f) => [f, analysisLines(f)])));
  return world;
}

export const epochNow = (world) => world.sim.epoch + world.sim.t;

/** strftime for the few formats the scripts print, in the visitor's local time. */
export function stamp(epoch, format) {
  const d = new Date(epoch * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return format.replace(/%([YmdHMSbaey])/g, (_, c) => ({
    Y: d.getFullYear(), m: p(d.getMonth() + 1), d: p(d.getDate()), H: p(d.getHours()), M: p(d.getMinutes()),
    S: p(d.getSeconds()), b: months[d.getMonth()], a: days[d.getDay()], e: String(d.getDate()).padStart(2), y: p(d.getFullYear() % 100),
  })[c]);
}
/** `date`'s default output, as the worker log lines start. */
export const dateText = (epoch) => stamp(epoch, '%a %b %e %H:%M:%S %Y');

function addProject(world, path, label, queues) {
  world.projects.set(path, { path, label, queues, created: epochNow(world) });
}

/** examples/first-job/prepare.sh: a fresh project per run; returns its path. */
export function prepareFirstJob(world) {
  const path = `${ROOT}/stan_projects/first-job.${mktempSuffix(world.prepared++)}`;
  addProject(world, path, 'first-job', { 'jobs.txt': firstJobLines(path) });
  return path;
}

// -- Submission --------------------------------------------------------------------------------

/** The queue a batch directory (or its run name or queue ID) names, if any. */
export function findBatch(world, reference) {
  const clean = reference.replace(/\/+$/, '');
  return world.sim.queues.find((q) => q.batchDir === clean || q.id === clean) ?? null;
}

/** Register a queue as start_workers.sh does; returns the queue and the batch details. */
export function submit(world, { modelDir, queueFile, runName, project, cpu, mem, priority, hostPriority, maxWorkers, paused, after, colorKey, retryLines, retryOf }) {
  const { sim } = world;
  const model = modelDir.replace(/\/+$/, '');
  const proj = world.projects.get(model);
  const name = queueFile.split('/').pop();
  const lines = retryLines ?? proj.queues[name];
  const n = (world.batchCount.get(model) ?? 0) + 1;
  world.batchCount.set(model, n);
  const epoch = epochNow(world);
  const batchName = `batch_${String(n).padStart(5, '0')}_${stamp(epoch, '%Y-%m-%d')}`;
  const batchDir = `${model}/logs/${batchName}`;
  const fingerprint = hex(`${model}/queues/${name}`, 16);
  const id = `${batchName}_${epoch}_${fingerprint}`;
  const queue = addQueue(sim, {
    id, batchName, batchDir, modelDir: model, queueFile: `${model}/queues/${name}`, runName, project,
    cpu, mem, priority, hostPriority, maxWorkers, paused, after, colorKey, retryOf,
    jobs: lines.map((line, i) => {
      const [jobId, ...rest] = line.split(' ');
      return { id: jobId, cmd: rest.join(' '), duration: jobDuration(name, line, i) };
    }),
  });
  queue.tag = `${model.replace(/\//g, '_')}_queues_${name}__h${fingerprint}__b${String(n).padStart(5, '0')}`;
  queue.registeredEpoch = epoch;
  world.batches.set(batchDir, queue);
  world.forecastAt = -1;
  return queue;
}

/** Queue files waiting under a project, for completion and errors. */
export function projectQueueFiles(world, model) {
  return Object.keys(world.projects.get(model.replace(/\/+$/, ''))?.queues ?? {});
}

// -- Time --------------------------------------------------------------------------------------

/** Advance the simulation by whole seconds; job results appear on the share as jobs succeed. */
export function step(world, seconds) {
  for (let i = 0; i < seconds; i++) {
    const before = world.sim.events.length;
    tick(world.sim);
    for (const e of world.sim.events.slice(before)) {
      if (e.type === 'succeeded' || e.type === 'start' || e.type === 'retired' || e.type === 'hold') world.forecastAt = -1;
    }
  }
  if (world.sim.events.length > 4000) world.sim.events.splice(0, world.sim.events.length - 2000);
}

/** Pool ETAs, recomputed only when a job starts, finishes or a control changes. */
export function etas(world) {
  if (world.forecastAt !== world.sim.t) {
    world.eta = forecast(world.sim);
    world.forecastAt = world.sim.t;
  }
  return world.eta;
}

// -- What the panes show ---------------------------------------------------------------------

/** Per-core [user, system] fractions on a host right now (what the CPU pane samples). */
export function cpuValues(world, hostId) {
  const { sim } = world;
  const hw = HARDWARE[hostId];
  const busy = new Set();
  for (const q of sim.queues) for (const j of q.jobs) if (j.host === hostId && j.state === 'running') j.cells.forEach((c) => busy.add(c));
  const sample = Math.floor(sim.t / 2);
  return Array.from({ length: hw.cores }, (_, i) => {
    const r = hash01(`${hostId}:${i}:${sample}`);
    if (busy.has(i)) return [0.9 + 0.07 * r, 0.02 + 0.02 * hash01(`${hostId}:${i}:${sample}:s`)];
    const background = hostId === 'storage' && i === hw.cores - 1 ? 0.03 : 0;
    return [0.005 + 0.02 * r + background, 0.005 + 0.01 * hash01(`${hostId}:${i}:${sample}:s`)];
  });
}

export function memoryData(world, hostId) {
  const { sim } = world;
  const hw = HARDWARE[hostId];
  const gib = 1024 ** 3;
  let jobs = 0;
  for (const q of sim.queues) {
    for (const j of q.jobs) if (j.host === hostId && j.state === 'running') jobs += q.mem * (0.6 + 0.3 * hash01(`${q.id}:${j.id}`));
  }
  const used = (hw.baseGiB + (hash01(`${hostId}:m:${Math.floor(sim.t / 5)}`) - 0.5) * 0.04) * gib + jobs * 1024 * 1024;
  return { total: hw.memGiB * gib, used, available: hw.memGiB * gib - used, cache: hw.cacheGiB * gib, swap: 0 };
}

/** Why the collector has no fresh sample of a host, or null. */
export function hostProblem(world, hostId) {
  const h = world.sim.hosts.find((x) => x.id === hostId);
  if (h.reachable) return null;
  const age = world.sim.t - h.lastContact;
  return `${hostId} unavailable: ssh: connect to host ${hostId} port 22: No route to host (last sample ${age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago)`;
}

/** monitor_queue_progress.sh's hold token for a queue's status. */
export function holdToken(world, q) {
  const reason = q.blockingReason;
  let hold;
  switch (q.effectiveAdmission) {
    case 'closed': hold = 'CLOSED'; break;
    case 'paused': hold = reason === 'pool_draining' ? 'DRAIN' : 'PAUSED'; break;
    case 'blocked':
      hold = /failure_hold/.test(reason) ? 'FAIL' : /host_unavailable/.test(reason) ? 'HOST' : /worker_cap/.test(reason) ? 'CAP'
        : /memory/.test(reason) ? 'RAM' : /cpu/.test(reason) ? 'CPU' : reason === 'queue_empty' ? 'EMPTY'
          : reason === 'dependency_wait' ? 'DEP' : reason === 'dependency_failed' ? 'DEPFAIL' : reason === 'dependency_unverified' ? 'VERIFY'
            : reason === 'dependency_unavailable' ? 'DEPMISSING' : 'WAIT';
      break;
    default: hold = '';
  }
  if (['', 'CAP', 'IO', 'RAM', 'CPU', 'WAIT', 'EMPTY'].includes(hold) && failureHolds(world, q).length) hold = 'FAIL';
  return hold;
}

export const failureHolds = (world, q) => world.sim.hosts.filter((h) => world.sim.holds[h.id][q.id]).map((h) => `${h.id}:${world.sim.holds[h.id][q.id]}`);
export const runningByHost = (world, q) => world.sim.hosts.map((h) => q.jobs.filter((j) => j.host === h.id && charged(j)).length);
const doneCount = (q) => q.jobs.filter((j) => j.doneMarker).length;
/** Claimed jobs that ended without a done marker, and not rerun by a later batch. */
export const failedJobs = (world, q) => q.jobs.filter((j) => j.reported && !j.doneMarker && j.state === 'ended')
  .filter((j) => !world.sim.queues.some((r) => r.retryOf === q.id && r.jobs.some((x) => x.id === j.id)));

/** The queue-progress rows the collector gathers (see render.js queueProgress). */
export function queueRows(world) {
  const { sim } = world;
  const now = epochNow(world);
  const eta = etas(world);
  const rows = [];
  for (const q of sim.queues) {
    const finished = q.finishedAt !== null ? sim.epoch + q.finishedAt : null;
    if (q.retired && now - finished > 86400) continue;
    const done = doneCount(q);
    const failed = failedJobs(world, q);
    const lastFail = failed.length ? Math.max(...failed.map((j) => sim.epoch + j.endedAt)) : null;
    const reruns = q.jobs.filter((j) => sim.queues.some((r) => r.retryOf === q.id && r.jobs.some((x) => x.id === j.id))).length;
    const start = sim.epoch + q.submittedAt;
    const hold = q.retired ? 'EMPTY' : holdToken(world, q);
    const marked = Object.keys(q.hostPriority).length ? '*' : '';
    // monitor_queue_progress.sh: the allocation ETA needs a completion and workers that can still
    // start; the pool ETA, when the forecast has one, takes precedence.
    let etaSec = -1;
    if (!q.retired && /^(RUNNING|DRAINING)$/.test(q.lifecycle) && done > 0 && done < q.jobs.length) {
      const workers = q.jobs.filter(charged).length;
      const remaining = q.jobs.length - done - failed.length;
      const held = ['PAUSED', 'CLOSED', 'DRAIN', 'DEP', 'DEPFAIL', 'VERIFY', 'DEPMISSING'].includes(hold) && remaining > workers;
      if (hold !== 'HOST' && !held) etaSec = Math.round(allocationEta(sim, q) ?? -1);
    }
    if (!q.retired && /^(RUNNING|DRAINING|PENDING)$/.test(q.lifecycle) && !(q.lifecycle === 'RUNNING' && hold === 'HOST')
      && eta[q.id] !== null && eta[q.id] !== undefined) etaSec = Math.max(1, Math.round(eta[q.id]));
    rows.push({
      group: q.retired ? 1 : 0, state: q.lifecycle, label: `${q.runName || `${q.project}/${q.queueFile.split('/').pop()}`} [b${q.batchName.slice(6, 11)}]`,
      workers: `${runningByHost(world, q).join('-')} P${q.priority}${marked}${hold ? ` ${hold}` : ''}`,
      done, total: q.jobs.length, elapsed: (finished ?? now) - start, eta: etaSec,
      pct: Math.round((1000 * done) / q.jobs.length) / 10, startTxt: stamp(start, '%Y/%m/%d | %H:%M'),
      endTxt: finished ? stamp(finished, '%Y/%m/%d | %H:%M') : '', project: q.project || '?',
      failed: failed.length, failedWhen: lastFail ? stamp(lastFail, '%H:%M') : '', rerun: reruns, etaWarning: '-',
    });
  }
  // Active queues first, newest history after them.
  return [...rows.filter((r) => r.group === 0), ...rows.filter((r) => r.group === 1).reverse()];
}

export function poolCapacity(world) {
  const open = world.sim.hosts.filter((h) => h.enabled && h.reachable && !h.away);
  return {
    cpu: open.reduce((s, h) => s + h.cpu, 0), memory: open.reduce((s, h) => s + h.mem, 0),
    resourceState: open.length === world.sim.hosts.length ? 'ok' : open.length ? 'degraded' : 'unavailable',
  };
}

/** The whole `rota monitor` window at `cols` columns. */
export function dashboard(world, cols) {
  const { sim } = world;
  const hostIds = sim.hosts.map((h) => h.id);
  const content = {}, titles = {};
  for (const id of hostIds) {
    const problem = hostProblem(world, id);
    if (problem) {
      content[`cpu:${id}`] = wrapText(problem, cols - 70, 4).map((l) => [[l, '']]);
      content[`mem:${id}`] = wrapText(problem, 26, 4).map((l) => [[l, '']]);
      titles[`cpu:${id}`] = `CPU ${id}`;
    } else {
      const values = cpuValues(world, id);
      content[`cpu:${id}`] = cpuMeters(values, cols - 70, 4).map((l) => [[l, '']]);
      content[`mem:${id}`] = memoryLines(memoryData(world, id), 26, '0.00%').map((l) => [[l, '']]);
      titles[`cpu:${id}`] = `CPU ${id} ${totalPercent(values)}%`;
    }
    titles[`mem:${id}`] = `MEM ${id}`;
  }
  titles[`cpu:${hostIds[0]}`] += ' ─── * = Sys, # = User ────';
  titles[`mem:${hostIds[0]}`] += ' ─── # = Used ────';
  titles.share = 'Share';
  content.share = mountLines(sim.hosts.map((h) => (h.reachable ? true : null)), 8, 4);
  const cap = poolCapacity(world);
  const done10 = sim.events.filter((e) => e.type === 'succeeded' && e.t > sim.t - 60).length;
  const storage = storageRows({ free: 310e9, total: 500e9 }, { free: 1200e9 - doneTotal(world) * 2e6, total: 2000e9 },
    sim.hosts.map((h) => [h.id, h.reachable ? (h.id === 'storage' ? 310e9 : 455e9) : null]).filter(([, v]) => v !== null), 33);
  content.io = clusterIo({
    poolState: sim.pool.state, liveCpu: cap.cpu, liveMemory: cap.memory, resourceState: cap.resourceState, ioState: 'disabled',
    rx: (registered(sim).some((q) => q.jobs.some((j) => j.state === 'running')) ? 1.2 + hash01(`rx${Math.floor(sim.t / 3)}`) : 0.1).toFixed(1),
    tx: (registered(sim).some((q) => q.jobs.some((j) => j.state === 'running')) ? 0.8 + hash01(`tx${Math.floor(sim.t / 3)}`) : 0.1).toFixed(1),
    sessions: sim.hosts.filter((h) => h.reachable).length, diskMbps: (0.05 + done10 * 0.04).toFixed(2), diskOps: (2 + done10 * 1.5).toFixed(1),
    storage, activeQueues: registered(sim).length, registryAge: 3, donePerMin: done10.toFixed(1),
  }, 9);
  titles.io = 'CLUSTER I/O storage';
  let queueLines;
  try {
    queueLines = queueProgress(queueRows(world), cols);
  } catch (error) {
    queueLines = [[[String(error.message), '']]];
  }
  const now = epochNow(world);
  titles.queue = `QUEUE PROGRESS | Updated ${stamp(now - (now % 5), '%Y/%m/%d %H:%M:%S')}`;
  const queueHeight = Math.max(9, queueLines.length + 1);
  return composeDashboard({
    cols, hostRows: hostIds, queueRows: queueHeight, titles, content: { ...content, queue: queueLines },
    status: { title: titles.queue, clock: stamp(now, '%H:%M %d-%b-%y') },
  });
}
const doneTotal = (world) => world.sim.queues.reduce((s, q) => s + doneCount(q), 0);

// -- The shared drive as files ------------------------------------------------------------------

/** Text files and directories that exist right now: path → string (file) or string[] (dir). */
export function lookup(world, path) {
  const files = fileTable(world);
  if (path in files) return files[path];
  return undefined;
}

export function fileTable(world) {
  const { sim } = world;
  const t = {};
  const dir = (p, names) => {
    t[p] = [...new Set([...(Array.isArray(t[p]) ? t[p] : []), ...names])].sort();
    if (p !== '/') {
      const parent = p.slice(0, p.lastIndexOf('/')) || '/';
      const name = p.slice(p.lastIndexOf('/') + 1);
      if (!Array.isArray(t[parent]) || !t[parent].includes(name)) dir(parent, [name]);
    }
  };
  const file = (p, text) => {
    t[p] = text;
    const parent = p.slice(0, p.lastIndexOf('/')) || '/';
    dir(parent, [p.slice(p.lastIndexOf('/') + 1)]);
  };
  dir('/', ['home', 'srv']);
  dir('/home', ['user']);
  dir('/srv', ['cluster']);
  dir(HOME, ['rota']);
  dir(CHECKOUT, ['LICENSE', 'README.md', 'admin', 'control', 'docs', 'examples', 'monitor', 'rota', 'scheduler', 'setup', 'tests']);
  for (const d of ['admin', 'control', 'docs', 'monitor', 'scheduler', 'setup', 'tests']) dir(`${CHECKOUT}/${d}`, []);
  file(`${CHECKOUT}/examples/cluster.json`, CLUSTER_JSON);
  file(`${CHECKOUT}/examples/first-job/prepare.sh`, PREPARE_SH);
  file(`${CHECKOUT}/examples/first-job/square.py`, SQUARE_PY);
  file(`${CHECKOUT}/examples/first-job/README.md`, '# Run your first two jobs\n\nThe two jobs in this example square 3 and 7 and write one file apiece.');
  dir(ROOT, ['.rota', 'adaptive_scheduler.sh', 'monitor_pool_eta.py', 'reconcile_queue_batch.sh', 'start_workers.sh', 'kill_workers.sh', 'projects', 'stan_projects']);
  dir(`${ROOT}/.rota`, ['adaptive']);
  dir(STATE_ROOT, ['queues', 'queue-index', 'plans', 'last-known', 'resources.tsv']);
  if (sim.pool.state !== 'INACTIVE') file(`${STATE_ROOT}/pool.env`, poolEnv(world).join('\n'));
  file(`${STATE_ROOT}/coordinator.ready`, coordinatorReady(world).join('\n'));
  dir(`${ROOT}/projects`, ['my-analysis']);
  dir(`${ROOT}/stan_projects`, []);
  for (const [path, project] of world.projects) {
    dir(`${path}/queues`, Object.keys(project.queues));
    for (const [name, lines] of Object.entries(project.queues)) file(`${path}/queues/${name}`, lines.join('\n'));
    dir(`${path}/results`, []);
    if (project.label === 'first-job') file(`${path}/square.py`, SQUARE_PY);
    else file(`${path}/simulate.py`, '"""Placeholder model run for the demo project."""');
    dir(path, ['logs']);
    dir(`${path}/logs`, []);
  }
  for (const q of sim.queues) {
    const b = q.batchDir;
    dir(b, ['adaptive', 'claims', 'done', 'jobs', 'usage']);
    file(`${b}/run_meta.env`, runMeta(world, q).join('\n'));
    file(`${b}/queue-edit.txt`, q.jobs.map((j) => `${j.id} ${j.cmd}`).join('\n'));
    file(`${b}/launch_status.env`, ['state=active', `run_token=${q.id}`, 'registered=1', 'hosts_total=0', 'hosts_acknowledged=0', 'hosts_released=0', `updated_epoch=${q.registeredEpoch}`].join('\n'));
    file(`${b}/adaptive/resources.env`, resourcesEnv(world, q).join('\n'));
    file(`${b}/adaptive/control.env`, controlEnv(world, q).join('\n'));
    file(`${b}/adaptive/status.env`, statusEnv(world, q).join('\n'));
    dir(`${b}/claims`, q.jobs.filter((j) => j.state !== 'pending').map((j) => `job_${j.id}.claim`));
    dir(`${b}/done`, q.jobs.filter((j) => j.doneMarker).map((j) => `job_${j.id}.done`));
    for (const j of q.jobs.filter((x) => x.doneMarker)) t[`${b}/done/job_${j.id}.done`] = '';
    dir(`${b}/jobs`, q.jobs.filter((j) => j.state !== 'pending').map((j) => `job_${j.id}.log`));
    for (const j of q.jobs.filter((x) => x.state !== 'pending')) t[`${b}/jobs/job_${j.id}.log`] = jobLog(world, q, j);
    const interrupted = q.jobs.filter((j) => j.interrupted && j.doneMarker);
    if (interrupted.length) {
      dir(`${b}/share-interrupted`, interrupted.filter((j) => !j.confirmed).map((j) => `job_${j.id}.${j.host}`));
      for (const j of interrupted.filter((x) => !x.confirmed)) {
        file(`${b}/share-interrupted/job_${j.id}.${j.host}`, [`job_id=${j.id}`, `host=${j.host}`, 'exit_code=0', `started_epoch=${sim.epoch + j.start}`, `finished_epoch=${sim.epoch + j.endedAt}`].join('\n'));
      }
    }
    for (const h of sim.hosts) {
      const lines = workerLog(world, q, h.id);
      if (lines.length) file(`${b}/worker_${h.id}.log`, lines.join('\n'));
    }
    if (q.reconciled) {
      for (const [name, text] of Object.entries(q.reconciled.files)) file(`${b}/reconcile/${name}`, text);
    }
    const project = world.projects.get(q.modelDir);
    for (const j of q.jobs.filter((x) => x.doneMarker)) {
      const out = resultFile(q, j);
      if (out) file(out.path, out.text);
    }
    if (project && q.reconciled?.retryQueue) {
      file(q.reconciled.retryQueue.path, q.reconciled.retryQueue.text);
    }
  }
  return t;
}

/** The file a successful job writes, from its command line. */
function resultFile(q, j) {
  const square = /square\.py" (\d+) "([^"]+)"/.exec(j.cmd);
  if (square) return { path: square[2], text: `${Number(square[1]) ** 2}` };
  const out = /--out (\S+)/.exec(j.cmd);
  if (out) return { path: out[1], text: JSON.stringify({ seed: Number(/--seed (\d+)/.exec(j.cmd)?.[1]), estimate: Math.round(hash01(j.cmd) * 1000) / 1000 }) };
  return null;
}

function jobLog(world, q, j) {
  const { sim } = world;
  const lines = [`${dateText(sim.epoch + j.start)}: Starting job ${j.id} on ${j.host}`, `${j.cmd} --job_tag ${q.tag}`];
  if (j.state === 'ended') {
    const cpu = (j.endedAt - j.start) * 0.94;
    lines.push(`CPU: user ${(cpu * 0.97).toFixed(2)}s system ${(cpu * 0.03).toFixed(2)}s wall ${j.endedAt - j.start}s exit ${j.outcome === 'job_failed' ? 1 : 0}`);
  }
  return lines.join('\n');
}

/** The worker log lines mmworker.sh writes for one queue on one host. */
export function workerLog(world, q, hostId) {
  const { sim } = world;
  const lines = [];
  for (const j of q.jobs.filter((x) => x.host === hostId && x.state === 'ended')) {
    const at = dateText(sim.epoch + j.endedAt);
    if (j.interrupted) {
      lines.push(`${at}: The share connection was interrupted while job ${j.id} ran on ${hostId}: its open files on the share were revoked, so a script read from the share may have stopped early. Verify its outputs; dependent stages wait for confirm-interrupted-jobs.`);
    }
    if (j.outcome === 'infrastructure_failed') lines.push(`${at}: Failed to publish completion marker for job ${j.id} on ${hostId}; claim retained.`);
    else if (j.outcome === 'job_failed') lines.push(`${at}: Job ${j.id} failed with exit code 1 on ${hostId}.`);
    else lines.push(`${at}: Completed job ${j.id} on ${hostId}.`);
  }
  return lines;
}

// -- key=value records ----------------------------------------------------------------------------

export function poolEnv(world) {
  const { sim } = world;
  const h = (name) => hex(`${sim.pool.id}:${name}`, 64);
  return [
    'schema_version=1', `pool_id=${sim.pool.id}`, `pool_name=${sim.pool.name}`, `state=${sim.pool.state}`, `target_state=${sim.pool.state}`,
    `resources_file=${STATE_ROOT}/resources.tsv`, `resources_sha256=${h('resources')}`, 'shared_io_capacity=0', 'io_pressure_host=',
    'smbd_cpu_limit_pct=400', 'cpu_tolerance_pct=10', 'tick_seconds=5', `start_interval_seconds=${START_INTERVAL_SECONDS}`, 'backfill=0',
    `lease_seconds=${LEASE_SECONDS}`, `daemon_sha256=${h('daemon')}`, `worker_sha256=${h('worker')}`, `claim_sha256=${h('claim')}`,
    `memory_sha256=${h('memory')}`, `calibration_sha256=${h('calibration')}`, `recovery_sha256=${h('recovery')}`,
    `coordinator_sha256=${h('coordinator')}`, `workflow_sha256=${h('workflow')}`, 'workflow_version=1', 'memory_control_version=1',
    'memory_calibration_version=1', `coordinator_pid=${sim.pool.state === 'INACTIVE' ? '' : 48233}`, `created_epoch=${sim.pool.created}`,
    `updated_epoch=${sim.pool.created + 2}`,
  ];
}

export function unavailableHosts(world) {
  return world.sim.hosts.filter((h) => !h.reachable && !h.away).map((h) => `${h.id}:unreachable`);
}

export function coordinatorReady(world) {
  const { sim } = world;
  const cap = poolCapacity(world);
  return [
    'schema_version=1', `pool_id=${sim.pool.id}`, 'pid=48233', 'state=ready', `resource_state=${cap.resourceState}`,
    `live_cpu_units=${cap.cpu}`, `live_memory_mib=${cap.memory}`, 'io_pressure_state=disabled', 'smbd_cpu_tenths=0',
    'quarantined_queues=0', `away_hosts=${sim.hosts.filter((h) => h.away).map((h) => h.id).join(',')}`,
    `unavailable_hosts=${unavailableHosts(world).join(',')}`, 'memory_control_version=1', 'memory_calibration_version=1',
    'workflow_version=1', 'host_priority_version=1', 'early_eta_sample_version=1', `updated_epoch=${epochNow(world)}`,
  ];
}

function runMeta(world, q) {
  return [
    `run_name=${q.runName}`, ...(q.project ? [`project_name=${q.project}`] : []), 'execution_mode=adaptive-shared-queue',
    `queue_file=queues/${q.queueFile.split('/').pop()}`, `original_queue_file=${q.queueFile}`, `editable_queue_file=${q.batchDir}/queue-edit.txt`,
    `total_jobs=${q.jobs.length}`, `run_token=${q.id}`, `tag_clean=${q.tag}`, `pool_id=${world.sim.pool.id}`,
    `resource_file=${q.batchDir}/adaptive/resources.env`, `control_file=${q.batchDir}/adaptive/control.env`,
    `registration_file=${STATE_ROOT}/queues/${q.id}.env`,
  ];
}

export function resourcesEnv(world, q) {
  const workflow = q.after.length > 0;
  return [
    `schema_version=${workflow ? 2 : 1}`, `queue_id=${q.id}`, `cpu_units_per_job=${q.cpu}`, `memory_mib_per_job=${q.mem}`,
    'shared_io_units_per_job=0',
    ...(workflow ? [`dependencies=${JSON.stringify(q.after.map((id) => {
      const p = world.sim.queues.find((x) => x.id === id);
      return { batch_dir: p.batchDir, pool_id: world.sim.pool.id, queue_id: p.id };
    }))}`, 'retry_lost_jobs=0'] : []),
  ];
}

const hostPrioritiesText = (q) => Object.entries(q.hostPriority).map(([h, v]) => `${h}=${v}`).join(',');

export function controlEnv(world, q) {
  const hp = hostPrioritiesText(q);
  return [
    `schema_version=${hp ? 2 : 1}`, `queue_id=${q.id}`, `generation=${q.generation}`, `admission=${q.admission}`,
    `schedule_priority=${q.priority}`, ...(hp ? [`host_priorities=${hp}`] : []), `max_workers=${q.maxWorkers}`,
    `updated_epoch=${q.controlEpoch ?? q.registeredEpoch}`,
  ];
}

export function statusEnv(world, q) {
  const { sim } = world;
  const hp = hostPrioritiesText(q);
  const succeeded = q.jobs.filter((j) => j.doneMarker);
  const failed = q.jobs.filter((j) => j.reported && !j.doneMarker && j.state === 'ended');
  const cpuSeconds = (jobs) => jobs.reduce((s, j) => s + (j.endedAt - j.start) * 0.94 * q.cpu, 0).toFixed(1);
  return [
    'schema_version=1', `queue_id=${q.id}`, `lifecycle=${q.lifecycle}`, `admission=${q.admission}`,
    `effective_admission=${q.effectiveAdmission}`, `blocking_reason=${q.blockingReason}`,
    `dependency_queues=${q.after.join(',')}`, 'retry_lost_jobs=0', `failure_holds=${failureHolds(world, q).join(',')}`,
    `schedule_priority=${q.priority}`, ...(hp ? [`host_priorities=${hp}`] : []), `max_workers=${q.maxWorkers}`,
    `initial_memory_mib_per_job=${q.mem}`, `requested_memory_mib_per_job=${q.mem}`, `effective_memory_mib_per_job=${q.mem}`,
    'memory_calibration_state=off', 'memory_calibration_reason=disabled', 'memory_calibration_sample_jobs=0', 'memory_calibration_candidate_mib=',
    `share_interrupted_jobs=${q.jobs.filter((j) => j.interrupted && j.doneMarker && !j.confirmed).length}`,
    `control_generation=${q.appliedGeneration}`, `propagation=${q.appliedGeneration === q.generation ? 'complete' : 'pending'}`,
    `running_workers=${q.jobs.filter(charged).length}`, `target_workers=${q.targetWorkers}`,
    `running_by_host=${sim.hosts.map((h) => `${h.id}:${q.jobs.filter((j) => j.host === h.id && charged(j)).length}`).join(',')}`,
    'usage_state=ok', `jobs_with_usage=${succeeded.length + failed.length}`, `cpu_seconds_succeeded=${cpuSeconds(succeeded)}`,
    `cpu_seconds_failed=${cpuSeconds(failed)}`, `updated_epoch=${epochNow(world)}`,
  ];
}

/** Lease, plan and job truth on one host, for the explainer view and the host's own shell. */
export function hostTruth(world, hostId) {
  const { sim } = world;
  const h = sim.hosts.find((x) => x.id === hostId);
  const l = lease(sim, h);
  const jobs = [];
  for (const q of sim.queues) for (const j of q.jobs) if (j.host === hostId && j.state === 'running') jobs.push({ q, j });
  return { host: h, lease: l, leftSeconds: Math.max(0, LEASE_SECONDS - l.age), jobs };
}

export { pendingJobs, charged, registered, dur };
