// The pool as the explainer video draws it (HostCard, SlotCell, MemBar, QueueCard in its
// components.tsx): each host's CPU units coloured by the queue holding them, its memory charges
// and lease, then one card per queue. A diagram of the simulation, not a ROTA screen.
import { QUEUE_COLORS } from '../core/scenario.js';
import { hostTruth, holdToken, failureHolds, runningByHost } from '../core/world.js';
import { LEASE_SECONDS, charged } from '../core/sim.js';

const HOLD_TEXT = {
  PAUSED: 'paused', DRAIN: 'pool draining', CLOSED: 'closed', DEP: 'waiting for its dependency', DEPFAIL: 'dependency failed',
  VERIFY: 'verify dependency outputs', FAIL: 'failure hold', HOST: 'no host available', CAP: 'at its worker cap', EMPTY: 'no pending jobs',
};
const KEYS = ['a', 'b', 'c', 'd', 'e'];

/** A queue's colour key: its run name when that is A to E, else the next unused one. */
export function colorKey(world, q) {
  if (q.colorKey) return q.colorKey;
  const used = new Set(world.sim.queues.filter((x) => x.colorKey).map((x) => x.colorKey));
  const others = world.sim.queues.filter((x) => !x.colorKey);
  const free = KEYS.filter((k) => !used.has(k)).reverse();
  return free[others.indexOf(q) % free.length] ?? 'e';
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (q) => q.runName || q.queueFile.split('/').pop();

export function createPoolView(el, world) {
  let html = '';
  function draw() {
    const { sim } = world;
    const parts = ['<div class="hosts">'];
    for (const h of sim.hosts) {
      const truth = hostTruth(world, h.id);
      const cells = Array.from({ length: h.cpu }, () => null);
      for (const { q, j } of truth.jobs) {
        for (const c of j.cells) if (c < cells.length) cells[c] = { q, p: Math.min(1, (sim.t - j.start) / j.duration) };
      }
      const status = h.away ? ['away', 'warn', 'set away: nothing new starts']
        : !h.reachable ? (truth.lease.expired ? ['lease expired', 'bad', 'unreachable: starts nothing new; running jobs continue']
          : [`lease ${truth.leftSeconds} s left`, 'warn', 'unreachable: no new plans'])
          : ['lease 20 s', 'good', h.id === 'storage' ? 'coordinator · shared drive attached' : 'runs jobs · mounts /srv/cluster'];
      const leaseFrac = h.reachable ? 1 : truth.leftSeconds / LEASE_SECONDS;
      const memSegs = [];
      for (const q of sim.queues) {
        const n = q.jobs.filter((j) => j.host === h.id && charged(j)).length;
        if (n) memSegs.push({ key: colorKey(world, q), mib: n * q.mem, label: short(q) });
      }
      parts.push(`<article class="host-card${h.reachable ? '' : ' lost'}" aria-label="${esc(h.id)}">
        <div class="host-head"><h3>${esc(h.id)}</h3><span class="badge badge-${status[1]}">${status[1] === 'good' ? '' : status[1] === 'bad' ? '✕ ' : '! '}${esc(status[0])}</span></div>
        <p class="host-role">${esc(status[2])}</p>
        <p class="cap">CPU UNITS <span>${h.cpu} budgeted</span></p>
        <div class="cells">${cells.map((c) => (c
          ? `<span class="cell q-${colorKey(world, c.q)}${h.reachable ? '' : ' unseen'}" title="${esc(short(c.q))}"><i style="height:${Math.round(c.p * 100)}%"></i><b>${esc(short(c.q).slice(0, 1))}</b></span>`
          : '<span class="cell idle" title="free"></span>')).join('')}</div>
        <p class="cap">MEMORY <span>${Math.round(h.mem / 1024)} GiB budget</span></p>
        <div class="mem">${memSegs.map((s) => `<i class="q-${s.key}" style="width:${(100 * s.mib) / h.mem}%" title="${esc(s.label)}: ${s.mib} MiB"></i>`).join('')}</div>
        <p class="cap">LEASE</p>
        <div class="lease"><i class="${h.reachable ? 'good' : truth.lease.expired ? 'bad' : 'warn'}" style="width:${Math.round(leaseFrac * 100)}%"></i></div>
      </article>`);
    }
    parts.push('</div><div class="queues">');
    const shown = sim.queues.filter((q) => !q.retired || sim.t - q.finishedAt < 900).slice(-6);
    if (!shown.length) parts.push('<p class="empty">No queues yet. Submit one from the storage window.</p>');
    for (const q of shown) {
      const key = colorKey(world, q);
      const done = q.jobs.filter((j) => j.doneMarker).length;
      const running = q.jobs.filter(charged).length;
      const hold = q.retired ? '' : holdToken(world, q);
      const holds = failureHolds(world, q);
      const note = q.retired ? (q.lifecycle === 'COMPLETED' ? '✓ completed' : `✕ finished incomplete: ${q.jobs.length - done} without a done marker`)
        : `${running} running (${runningByHost(world, q).join(' + ')}) · ${q.cpu} CPU, ${q.mem} MiB each`;
      const holdText = HOLD_TEXT[hold] ? `${hold === 'FAIL' && holds.length ? `failure hold on ${holds.map((x) => x.split(':')[0]).join(', ')}` : HOLD_TEXT[hold]}` : '';
      parts.push(`<article class="queue-card q-${key}${q.retired ? ' retired' : ''}">
        <div class="queue-head"><h3>${esc(short(q))}</h3><span class="prio">p ${q.priority}${Object.keys(q.hostPriority).length ? '*' : ''}</span></div>
        <div class="bar"><i style="width:${(100 * done) / q.jobs.length}%"></i></div>
        <p>${done} / ${q.jobs.length} done · ${esc(note)}</p>
        ${holdText ? `<p class="hold">⏸ ${esc(holdText)}</p>` : ''}
      </article>`);
    }
    parts.push('</div>');
    const next = parts.join('');
    if (next !== html) { el.innerHTML = next; html = next; }
  }
  return { draw };
}

export { QUEUE_COLORS };
