// The demo's back end: a stepwise port of the ROTA explainer video's simulation (sim.ts), which
// is itself a compact port of the adaptive coordinator's allocation and start pacing
// (scheduler/adaptive_coordinator.py: allocate, _start_grants, _pace_start_grants).
// sim.ts replays a fixed script; here the same rules run one coordinator tick (one simulated
// second) at a time, so a visitor can change priorities, pause queues or unplug a host mid-run.
//
// Simplifications carried over from sim.ts: plans reach hosts at once (one tick), there is no
// shared-I/O admission (the example pool has shared_io_capacity=0), live capacity equals the
// budget, and memory charges equal declarations. Added here: leases, dependencies, failure holds,
// share interruptions and queue lifecycles, following the scheduler's rules.

export const LEASE_SECONDS = 20;
export const START_INTERVAL_SECONDS = 4;

/** FNV-1a with an avalanche, from sim.ts: deterministic values in [0, 1]. */
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

/** A pool of hosts with no queues, at simulated second 0. */
export function createSim({ hosts, epoch }) {
  return {
    t: 0,
    epoch,
    pool: { state: 'ACTIVE', created: epoch, generation: 0 },
    hosts: hosts.map((h) => ({
      id: h.id, cpu: h.cpu_units, mem: h.memory_mib, enabled: h.enabled !== false,
      reachable: true, lastContact: 0, cableOutSince: null, away: false, awayReason: '',
      budgetGeneration: 0, stateGeneration: 0,
    })),
    queues: [],
    cursor: {},
    pacing: Object.fromEntries(hosts.map((h) => [h.id, { slots: 0, next: 0, cursor: '', gen: 0 }])),
    holds: Object.fromEntries(hosts.map((h) => [h.id, {}])),
    failures: Object.fromEntries(hosts.map((h) => [h.id, {}])),
    reservations: [],
    events: [],
  };
}

const sortedIds = (sim) => sim.hosts.map((h) => h.id).sort();
const hostById = (sim, id) => sim.hosts.find((h) => h.id === id);

/** Jobs the coordinator still charges to a host: running, or ended but not yet reported. */
export const charged = (j) => j.state === 'running' || (j.state === 'ended' && !j.reported);
export const pendingJobs = (q) => q.jobs.filter((j) => j.state === 'pending');
const runningOn = (q, h) => q.jobs.filter((j) => j.host === h && charged(j)).length;
export const registered = (sim) => sim.queues.filter((q) => !q.retired);

/** Whether the coordinator can give this host new work at all. */
export function hostOpen(sim, h) {
  return h.enabled && h.reachable && !h.away && sim.pool.state === 'ACTIVE';
}

/** A queue's priority on a host, or null where the host is closed to it. */
export function level(sim, q, hostId) {
  const h = hostById(sim, hostId);
  if (!hostOpen(sim, h) || sim.holds[hostId][q.id]) return null;
  const v = q.hostPriority[hostId] ?? q.priority;
  return v === 'off' ? null : v;
}

/** The hold a dependency places on a queue: '', or the coordinator's blocking reason. */
export function dependencyHold(sim, q) {
  for (const id of q.after) {
    const p = sim.queues.find((x) => x.id === id);
    if (!p) return 'dependency_unavailable';
    if (p.lifecycle === 'FINISHED_INCOMPLETE') return 'dependency_failed';
    if (p.lifecycle !== 'COMPLETED' || !p.retired) return 'dependency_wait';
    if (p.jobs.some((j) => j.interrupted && !j.confirmed)) return 'dependency_unverified';
  }
  return '';
}

/** Whether a queue may receive targets this tick. */
function admits(sim, q) {
  return q.admission === 'enabled' && !q.depHold && sim.pool.state === 'ACTIVE';
}

/**
 * One allocation pass (allocate(): two ledgers, strict levels, round robin, dominant share,
 * drain reservations), then start grants and, with an interval, pacing. Shared by the live tick
 * and the ETA forecast. Returns {targets, grants, limits, unpaced}.
 */
export function plan(sim, t, interval) {
  const hostIds = sortedIds(sim);
  const host = Object.fromEntries(sim.hosts.map((h) => [h.id, h]));
  const queues = registered(sim).sort((a, b) => (a.id < b.id ? -1 : 1));
  const queueIds = queues.map((q) => q.id);
  const queue = Object.fromEntries(queues.map((q) => [q.id, q]));
  const env = Object.fromEntries(hostIds.map((h) => [h, Object.fromEntries(queueIds.map((q) => [q, runningOn(queue[q], h)]))]));
  const pending = Object.fromEntries(queueIds.map((q) => [q, pendingJobs(queue[q]).length]));
  const lvl = Object.fromEntries(queueIds.map((q) => [q, Object.fromEntries(hostIds.map((h) => [h, level(sim, queue[q], h)]))]));

  const targets = Object.fromEntries(hostIds.map((h) => [h, Object.fromEntries(queueIds.map((q) => [q, 0]))]));
  const curCpu = {}, curMem = {}, futCpu = {}, futMem = {};
  for (const h of hostIds) {
    curCpu[h] = queueIds.reduce((s, q) => s + env[h][q] * queue[q].cpu, 0);
    curMem[h] = queueIds.reduce((s, q) => s + env[h][q] * queue[q].mem, 0);
    futCpu[h] = 0;
    futMem[h] = 0;
  }
  const total = (q) => hostIds.reduce((s, h) => s + targets[h][q], 0);
  const demand = (q) => {
    // The coordinator gives a paused, closed, held or exhausted queue no targets.
    if (pending[q] === 0 || !admits(sim, queue[q])) return 0;
    const replaceable = hostIds.filter((h) => lvl[q][h] !== null).reduce((s, h) => s + env[h][q], 0);
    const max = queue[q].maxWorkers;
    return max ? Math.min(replaceable + pending[q], max) : replaceable + pending[q];
  };
  const candidates = (q, p) => {
    const out = [];
    for (const h of hostIds) {
      if (lvl[q][h] !== p) continue;
      const additional = targets[h][q] + 1 > env[h][q];
      const cpu = curCpu[h] + (additional ? queue[q].cpu : 0);
      const mem = curMem[h] + (additional ? queue[q].mem : 0);
      if (cpu > host[h].cpu || mem > host[h].mem) continue;
      if (futCpu[h] + queue[q].cpu > host[h].cpu || futMem[h] + queue[q].mem > host[h].mem) continue;
      out.push([Math.max(cpu / host[h].cpu, mem / host[h].mem), h, additional]);
    }
    return out.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
  };
  const levels = [...new Set(queueIds.flatMap((q) => hostIds.map((h) => lvl[q][h])))]
    .filter((v) => v !== null).sort((a, b) => b - a);
  const reservations = [];
  for (const p of levels) {
    let peers = queueIds.filter((q) => hostIds.some((h) => lvl[q][h] === p));
    const last = sim.cursor[String(p)];
    if (last && peers.includes(last)) {
      const k = peers.indexOf(last) + 1;
      peers = [...peers.slice(k), ...peers.slice(0, k)];
    }
    for (;;) {
      let progress = false;
      for (const q of peers) {
        if (total(q) >= demand(q)) continue;
        const c = candidates(q, p);
        if (!c.length) continue;
        const [, h, additional] = c[0];
        targets[h][q] += 1;
        futCpu[h] += queue[q].cpu;
        futMem[h] += queue[q].mem;
        if (additional) {
          curCpu[h] += queue[q].cpu;
          curMem[h] += queue[q].mem;
          sim.cursor[String(p)] = q;
        }
        progress = true;
      }
      if (!progress) break;
    }
    // Drain reservation for the first blocked peer at this level.
    for (const q of peers) {
      if (total(q) >= demand(q) || candidates(q, p).length) continue;
      const choices = [];
      for (const h of hostIds) {
        if (lvl[q][h] !== p) continue;
        if (futCpu[h] + queue[q].cpu > host[h].cpu || futMem[h] + queue[q].mem > host[h].mem) continue;
        const deficit = Math.max(
          Math.max(0, curCpu[h] + queue[q].cpu - host[h].cpu) / host[h].cpu,
          Math.max(0, curMem[h] + queue[q].mem - host[h].mem) / host[h].mem,
        );
        choices.push([deficit, h]);
      }
      if (choices.length) {
        choices.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
        const h = choices[0][1];
        futCpu[h] += queue[q].cpu;
        futMem[h] += queue[q].mem;
        reservations.push({ host: h, queue: q });
        break;
      }
    }
  }

  // Why a queue without a start is waiting (the coordinator's plan["limits"]).
  const limits = {};
  for (const q of queueIds) {
    const available = hostIds.filter((h) => lvl[q][h] !== null);
    const reasons = [];
    if (!available.length) {
      reasons.push(hostIds.some((h) => hostOpen(sim, host[h]) && sim.holds[h][q]) ? 'failure_hold' : 'host_unavailable');
    }
    const max = queue[q].maxWorkers;
    const envTotal = hostIds.reduce((s, h) => s + env[h][q], 0);
    if (max && Math.max(envTotal, total(q)) >= max) reasons.push('worker_cap');
    if (available.length && !available.some((h) => curCpu[h] + queue[q].cpu <= host[h].cpu)) reasons.push('cpu');
    if (available.length && !available.some((h) => curMem[h] + queue[q].mem <= host[h].mem)) reasons.push('memory');
    if (!reasons.length && !candidates(q, lvl[q][available[0]])?.length) reasons.push('placement');
    limits[q] = reasons;
  }

  // Start grants, capped by pending lines and worker caps.
  const grants = Object.fromEntries(hostIds.map((h) => [h, Object.fromEntries(queueIds.map((q) => [q, 0]))]));
  for (const q of queueIds) {
    if (!admits(sim, queue[q])) continue;
    let remaining = Math.min(pending[q], hostIds.reduce((s, h) => s + Math.max(0, targets[h][q] - env[h][q]), 0));
    const max = queue[q].maxWorkers;
    if (max) remaining = Math.min(remaining, Math.max(0, max - hostIds.reduce((s, h) => s + env[h][q], 0)));
    for (const h of hostIds) {
      const g = Math.min(remaining, Math.max(0, targets[h][q] - env[h][q]));
      grants[h][q] = g;
      remaining -= g;
    }
  }
  const unpaced = new Set();
  if (interval) {
    // Pacing: refill established slots at once, add one new slot per interval.
    for (const h of hostIds) {
      const st = sim.pacing[h];
      st.gen += 1;
      const occupied = queueIds.reduce((s, q) => s + env[h][q], 0);
      const desired = queueIds.reduce((s, q) => s + Math.max(targets[h][q], env[h][q]), 0);
      let slots = Math.min(Math.max(st.slots, occupied), Math.max(occupied, desired));
      let next = st.next;
      const jitter = hash01(`${h}/${st.gen}`);
      if (!occupied && !desired) [slots, next] = [0, 0];
      if (desired > slots && next === 0) next = t + (interval * jitter) / 2;
      let allowance = Math.max(0, slots - occupied) + (desired > slots && t >= next ? 1 : 0);
      const lv = [...new Set(queueIds.map((q) => lvl[q][h]))].filter((v) => v !== null).sort((a, b) => b - a);
      let cur = st.cursor;
      for (const p of lv) {
        let peers = queueIds.filter((q) => lvl[q][h] === p);
        if (peers.includes(cur)) {
          const k = peers.indexOf(cur) + 1;
          peers = [...peers.slice(k), ...peers.slice(0, k)];
        }
        const remaining = Object.fromEntries(peers.map((q) => [q, grants[h][q]]));
        for (const q of peers) grants[h][q] = 0;
        while (allowance && peers.some((q) => remaining[q])) {
          for (const q of peers) {
            if (!allowance) break;
            if (remaining[q]) {
              grants[h][q] += 1;
              remaining[q] -= 1;
              allowance -= 1;
              cur = q;
            }
          }
        }
        for (const q of peers) if (remaining[q]) unpaced.add(q);
      }
      const iss = occupied + queueIds.reduce((s, q) => s + grants[h][q], 0);
      if (iss > slots) {
        slots = iss;
        next = t + interval * (0.75 + jitter / 2);
      }
      sim.pacing[h] = { slots, next, cursor: cur, gen: st.gen };
    }
  }
  return { targets, grants, limits, unpaced, reservations, env };
}

/** Daemons launch granted jobs into free CPU cells, claiming queue lines in order. */
function launch(sim, t, grants) {
  for (const h of sortedIds(sim)) {
    const host = hostById(sim, h);
    for (const q of registered(sim)) {
      for (let g = 0; g < (grants[h]?.[q.id] ?? 0); g++) {
        const used = new Set(sim.queues.flatMap((x) => x.jobs.filter((j) => j.host === h && j.state === 'running').flatMap((j) => j.cells)));
        const free = Array.from({ length: host.cpu }, (_, i) => i).filter((i) => !used.has(i));
        const job = q.jobs.find((j) => j.state === 'pending');
        if (!job || free.length < q.cpu) break;
        Object.assign(job, { state: 'running', host: h, cells: free.slice(0, q.cpu), start: t, end: t + job.duration });
        sim.events.push({ t, type: 'start', queue: q.id, job: job.id, host: h });
      }
    }
  }
}

/** A job's process exits on its host. What it leaves depends on whether the share is there. */
function endJob(sim, q, j, t) {
  const host = hostById(sim, j.host);
  j.state = 'ended';
  j.endedAt = t;
  if (j.fails) {
    // A non-zero exit is job_failed whether or not the share is there: the worker only
    // attempts the done marker after exit 0.
    j.outcome = 'job_failed';
  } else if (host.cableOutSince !== null) {
    // Exit 0, but done/job_ID.done cannot be written while the share is gone: claim retained.
    j.outcome = 'infrastructure_failed';
  } else {
    j.outcome = 'succeeded';
    j.doneMarker = true;
  }
  j.reported = host.reachable;
  if (j.reported) report(sim, q, j, t);
}

/** The coordinator reads a finished job's result from its host. */
function report(sim, q, j, t) {
  j.reported = true;
  j.reportedAt = t;
  sim.events.push({ t, type: j.outcome, queue: q.id, job: j.id, host: j.host });
  if (j.outcome === 'infrastructure_failed') {
    sim.holds[j.host][q.id] = 'infrastructure_failed';
    sim.events.push({ t, type: 'hold', queue: q.id, host: j.host, reason: 'infrastructure_failed' });
  } else if (j.outcome === 'job_failed') {
    const f = sim.failures[j.host][q.id] ?? (sim.failures[j.host][q.id] = { count: 0 });
    f.count = j.endedAt - j.start <= 30 ? f.count + 1 : 0;
    // Like the host daemon, keep an existing hold reason rather than overwriting it.
    if (f.count >= 3 && !sim.holds[j.host][q.id]) sim.holds[j.host][q.id] = 'rapid_job_failures';
  } else if (sim.failures[j.host][q.id]) {
    sim.failures[j.host][q.id].count = 0;
  }
}

/** Queue lifecycle, admission display and status, as the coordinator writes status.env. */
function updateStatus(sim, q, p, t) {
  const pending = pendingJobs(q).length;
  const running = q.jobs.filter(charged).length;
  const draining = sim.pool.state === 'DRAINING';
  let lifecycle;
  if (running && (q.admission === 'paused' || draining)) lifecycle = 'DRAINING';
  else if (running) lifecycle = 'RUNNING';
  else if (pending && !draining && q.admission !== 'closed') lifecycle = 'PENDING';
  else lifecycle = q.jobs.every((j) => j.doneMarker) ? 'COMPLETED' : 'FINISHED_INCOMPLETE';
  q.lifecycle = lifecycle;

  let reason, effective = q.admission;
  if (q.admission !== 'enabled') reason = draining ? 'pool_draining' : q.admission;
  else if (draining) { reason = 'pool_draining'; effective = 'paused'; }
  else if (q.depHold) { reason = q.depHold; effective = 'blocked'; }
  else if (!pending) { reason = 'queue_empty'; effective = 'blocked'; }
  else if (Object.values(p.grants).some((g) => g[q.id])) reason = 'none';
  else if (p.unpaced.has(q.id)) { reason = 'start_pacing'; effective = 'blocked'; }
  else { reason = (p.limits[q.id] ?? []).join('+') || 'awaiting_plan'; effective = 'blocked'; }
  q.blockingReason = reason;
  q.effectiveAdmission = effective;
  q.targetWorkers = Object.values(p.targets).reduce((s, x) => s + (x[q.id] ?? 0), 0);
  // A control change is applied once every enabled host acknowledges a plan carrying it.
  if (sim.hosts.every((h) => !h.enabled || h.reachable)) q.appliedGeneration = q.generation;
  if (q.lifecycle === 'COMPLETED' || q.lifecycle === 'FINISHED_INCOMPLETE') {
    if (q.appliedGeneration === q.generation && !q.finishedAt) {
      q.finishedAt = t;
      q.retired = true;
      sim.events.push({ t, type: 'retired', queue: q.id, lifecycle: q.lifecycle });
    }
  }
}

/** One coordinator tick: one simulated second. */
export function tick(sim) {
  sim.t += 1;
  const t = sim.t;
  for (const h of sim.hosts) if (h.reachable) h.lastContact = t;
  for (const q of sim.queues) {
    for (const j of q.jobs) if (j.state === 'running' && j.end <= t) endJob(sim, q, j, t);
  }
  for (const q of registered(sim)) q.depHold = dependencyHold(sim, q);
  const p = plan(sim, t, START_INTERVAL_SECONDS);
  sim.reservations = p.reservations;
  launch(sim, t, p.grants);
  for (const q of registered(sim)) updateStatus(sim, q, p, t);
  if (sim.pool.state === 'DRAINING' && !sim.queues.some((q) => q.jobs.some(charged))) {
    sim.pool.state = 'INACTIVE';
    sim.events.push({ t, type: 'drained' });
  }
  sim.lastPlan = p;
}

/** Advance whole ticks up to `seconds` of simulated time. */
export function advance(sim, seconds) {
  for (let i = 0; i < seconds; i++) tick(sim);
}

// -- Operator actions ----------------------------------------------------------------------

/** Register a queue (submit's start_workers.sh registration); returns it. */
export function addQueue(sim, spec) {
  const q = {
    id: spec.id, batchName: spec.batchName, batchDir: spec.batchDir, modelDir: spec.modelDir,
    queueFile: spec.queueFile, runName: spec.runName, project: spec.project, colorKey: spec.colorKey,
    cpu: spec.cpu, mem: spec.mem, priority: spec.priority, hostPriority: spec.hostPriority ?? {},
    maxWorkers: spec.maxWorkers ?? 0, admission: spec.paused ? 'paused' : 'enabled', after: spec.after ?? [],
    generation: 1, appliedGeneration: 0, submittedAt: sim.t, retired: false, finishedAt: null,
    lifecycle: 'PENDING', blockingReason: 'awaiting_plan', effectiveAdmission: 'blocked', targetWorkers: 0,
    depHold: '', retryOf: spec.retryOf ?? null,
    jobs: spec.jobs.map((j, n) => ({ ...j, n, state: 'pending', host: null, cells: [], start: null, end: null })),
  };
  sim.queues.push(q);
  sim.events.push({ t: sim.t, type: 'submit', queue: q.id });
  return q;
}

/** A queue control (pause, resume, set-priority, set-max-workers, close): future starts only. */
export function control(sim, q, field, value) {
  q.generation += 1;
  if (field === 'admission') q.admission = value;
  else if (field === 'priority') { q.priority = value.priority; q.hostPriority = value.hostPriority; }
  else if (field === 'maxWorkers') q.maxWorkers = value;
  sim.events.push({ t: sim.t, type: 'control', queue: q.id, field, value });
}

/** Pull or reconnect a host's network cable: its SSH route and its share mount together. */
export function setCable(sim, hostId, connected) {
  const h = hostById(sim, hostId);
  if (connected === (h.cableOutSince === null)) return;
  if (!connected) {
    h.cableOutSince = sim.t;
    h.reachable = false;
    sim.events.push({ t: sim.t, type: 'unplugged', host: hostId });
    return;
  }
  h.cableOutSince = null;
  h.reachable = true;
  h.lastContact = sim.t;
  // The share reconnects: jobs that ran across the drop had their open share files revoked.
  for (const q of sim.queues) {
    for (const j of q.jobs) {
      if (j.host === hostId && j.state === 'running') j.interrupted = true;
      if (j.host === hostId && j.state === 'ended' && !j.reported) report(sim, q, j, sim.t);
    }
  }
  sim.events.push({ t: sim.t, type: 'reconnected', host: hostId });
}

/** Seconds since the coordinator last renewed a host's lease, and whether it has expired. */
export function lease(sim, h) {
  const age = sim.t - h.lastContact;
  return { age, expired: age >= LEASE_SECONDS };
}

/** Clear one queue's failure hold on one host (reset-failures). The retained claim stays. */
export function resetFailures(sim, q, hostId) {
  const had = sim.holds[hostId][q.id];
  delete sim.holds[hostId][q.id];
  if (sim.failures[hostId][q.id]) sim.failures[hostId][q.id].count = 0;
  return had;
}

// -- Forecasts ------------------------------------------------------------------------------

/** Mean of a queue's measured successful runtimes (claim to done marker), up to 128. */
export function meanRuntime(q) {
  const done = q.jobs.filter((j) => j.doneMarker).slice(-128);
  return done.length ? done.reduce((s, j) => s + (j.endedAt - j.start), 0) / done.length : null;
}

/**
 * Pool ETA: replay the allocator each time a job is expected to finish, with pending jobs at
 * their queue's mean runtime and running jobs credited for time already spent. Jobs on an
 * unreachable host never end in the forecast, so their queue gets no ETA. Returns
 * {queueId: seconds | null}. Allocation ETA keeps each queue at its current worker count.
 */
export function forecast(sim) {
  const copy = structuredClone(sim);
  copy.events = [];
  const means = Object.fromEntries(registered(copy).map((q) => [q.id, meanRuntime(q)]));
  const eta = {};
  for (const q of registered(copy)) {
    if (means[q.id] === null) eta[q.id] = null;
    for (const j of q.jobs) {
      if (j.state === 'pending') j.duration = means[q.id] ?? Infinity;
      if (charged(j)) {
        const reachable = hostById(copy, j.host).reachable;
        j.end = !reachable ? Infinity : j.state === 'ended' ? copy.t
          : copy.t + Math.max(1, (means[q.id] ?? Infinity) - (copy.t - j.start));
        j.state = 'running';
      }
    }
  }
  let t = copy.t;
  for (let step = 0; step < 4000; step++) {
    for (const q of registered(copy)) q.depHold = dependencyHold(copy, q);
    const p = plan(copy, t, 0);
    launch(copy, t, p.grants);
    for (const q of registered(copy)) {
      if (eta[q.id] === undefined && !q.jobs.some((j) => j.state === 'pending' || j.state === 'running')) {
        eta[q.id] = t - sim.t;
        q.lifecycle = q.jobs.every((j) => j.doneMarker || j.state === 'ended') ? 'COMPLETED' : 'FINISHED_INCOMPLETE';
        q.retired = true;
      }
    }
    const ends = copy.queues.flatMap((q) => q.jobs.filter((j) => j.state === 'running').map((j) => j.end));
    const next = Math.min(...ends);
    if (!Number.isFinite(next)) break;
    t = Math.max(t + 1e-6, next);
    for (const q of copy.queues) {
      for (const j of q.jobs) {
        if (j.state === 'running' && j.end <= t) {
          j.state = 'ended'; j.reported = true; j.doneMarker = true; j.endedAt = t;
        }
      }
    }
  }
  for (const q of registered(sim)) if (eta[q.id] === undefined) eta[q.id] = null;
  return eta;
}

/** Allocation ETA: remaining jobs at the mean runtime over the queue's current workers. */
export function allocationEta(sim, q) {
  const mean = meanRuntime(q);
  const workers = q.jobs.filter(charged).length;
  if (mean === null || !workers) return null;
  const remaining = q.jobs.filter((j) => j.state === 'pending').length;
  const running = q.jobs.filter(charged);
  const residual = Math.max(...running.map((j) => Math.max(1, mean - (sim.t - j.start))));
  return residual + Math.ceil(remaining / workers) * mean;
}
