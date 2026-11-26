// The guided tour: Pip, a cat, leaps to the next thing to try, suggests the command, and reacts
// when it is done. Pip's flight shows where to look next; with reduced motion it simply appears
// beside the target. The tour can be skipped, replayed and driven from the keyboard.
import { ANALYSIS } from '../core/scenario.js';
import { latest, PILOT_SUBMIT, PREPARE, SUBMIT_A, SUBMIT_B, SUBMIT_C, ETA } from './commands.js';
import { lease } from '../core/sim.js';

const CAT = `<svg class="pip" role="button" tabindex="0" aria-label="Pip, the tour guide: show or fold the tour" viewBox="0 0 72 72" width="72" height="72">
  <path class="tail" d="M50 56c10 0 14-8 12-16-1-5-6-6-7-2 2 5 1 11-6 12z"/>
  <ellipse class="fur" cx="34" cy="50" rx="17" ry="15"/>
  <path class="stripe" d="M24 45q4 2 3 7M44 45q-4 2-3 7"/>
  <ellipse class="belly" cx="34" cy="54" rx="8" ry="8"/>
  <g class="paws"><ellipse class="white" cx="27" cy="64" rx="5" ry="3.4"/><ellipse class="white" cx="41" cy="64" rx="5" ry="3.4"/></g>
  <g class="paw-up"><path class="fur" d="M46 46q9-6 12-16l4 2q-2 12-12 18z"/><ellipse class="white" cx="60" cy="30" rx="3.6" ry="3"/></g>
  <path class="fur" d="M17 20 19 4l11 9zM51 20 49 4 38 13z"/>
  <path class="ear" d="M20 16 21 8l5 5zM48 16l-1-8-5 5z"/>
  <circle class="fur" cx="34" cy="25" r="16"/>
  <path class="stripe" d="M34 10v6M29 11l1.5 5M39 11l-1.5 5"/>
  <g class="eyes-open"><ellipse class="eye" cx="27.5" cy="24" rx="3" ry="3.6"/><ellipse class="eye" cx="40.5" cy="24" rx="3" ry="3.6"/>
    <circle class="glint" cx="28.6" cy="22.8" r="1"/><circle class="glint" cx="41.6" cy="22.8" r="1"/></g>
  <g class="eyes-happy"><path class="lid" d="M24.5 25q3-4 6 0M37.5 25q3-4 6 0"/></g>
  <ellipse class="white" cx="34" cy="31" rx="7" ry="5"/>
  <path class="nose" d="M32 28.5h4l-2 2.4z"/>
  <path class="lid" d="M34 31v1.2M34 32.2q-2 2-4 .4M34 32.2q2 2 4 .4"/>
  <path class="whisker" d="M22 30l-9-2M22 32.5l-9 1M46 30l9-2M46 32.5l9 1"/>
  <path class="collar" d="M22 37q12 7 24 0" />
  <rect class="tag" x="31" y="38.5" width="6" height="6" rx="1.5"/>
</svg>`;

/** The steps, in the brief's order. `done(e, world)` sees each run and simulation event. */
function steps(app) {
  const w = app.world;
  const batch = (run) => latest(w, run)?.batchDir;
  const ran = (e, re, host = 'storage') => e.type === 'run' && e.host === host && re.test(e.text);
  const submitted = (e, run) => e.type === 'run' && e.result.effects.some((x) => x.type === 'submitted' && w.sim.queues.find((q) => q.id === x.queue)?.runName === run);
  const controlled = (e, action, run) => e.type === 'run' && e.result.effects.some((x) => x.type === 'control' && x.action === action && w.sim.queues.find((q) => q.id === x.queue)?.runName === run);
  return [
    { target: '#win-storage', side: 'right', title: 'Hello', text: "I'm Pip. This is a simulated ROTA pool: two machines, <b>storage</b> and <b>worker</b>, sharing a drive at /srv/cluster. Whatever you type runs against that simulation, in your browser, so nothing can break. I'll show you around; choose <b>Skip tour</b> if you'd rather poke at it yourself." },
    { target: '#win-storage', side: 'right', title: 'An idle pool', text: 'The pool has already been started. Ask the scheduler what it knows about it.', commands: ['rota pool-status'], done: (e) => ran(e, /pool-status/),
      reaction: 'state=ACTIVE, and no queues yet. live_cpu_units=12: storage lends the pool 4 CPU units, worker 8.' },
    { target: '#win-monitor', side: 'below', title: 'The dashboard', text: '<code>rota monitor</code> is this tmux dashboard. Each host has a CPU pane and a MEM pane; CLUSTER I/O shows the pool and the shared drive; QUEUE PROGRESS lists every queue. For now, both hosts are idle.' },
    { target: '#win-storage', side: 'right', title: 'A first project', text: 'The first-job example makes a project with two jobs, one squaring 3 and one squaring 7.', commands: [PREPARE, 'cat "$project/queues/jobs.txt"'],
      done: () => w.prepared > 0, reaction: 'Each line is a job ID, then the command a worker runs. ROTA appends a <code>--job_tag</code> to that command, so it can find the job\'s processes later.' },
    { target: '#win-storage', side: 'right', title: 'Submit it', text: 'Tell ROTA what one job needs: one CPU unit and 512 MiB, at most one worker at a time.', commands: [PILOT_SUBMIT],
      done: (e) => submitted(e, 'pilot'), reaction: "Note the queue's <b>batch_dir</b>: every later command refers to the queue by it. With one worker allowed, the two jobs ran one after the other, each on whichever host would be least full afterward." },
    { target: '#win-storage', side: 'right', title: 'Check the answers', text: 'See the queue finish, then read what the jobs wrote.', commands: () => [batch('pilot') ? `rota queue-status --batch_dir ${batch('pilot')}` : null, 'cat "$project/results/3.txt" "$project/results/7.txt"'],
      done: (e) => ran(e, /results\/3\.txt/) && e.result.lines.some((l) => l.text === '9'), reaction: '9 and 49, as advertised. A <code>done/job_ID.done</code> marker per job is how ROTA knows each one succeeded.' },
    { target: '#win-storage', side: 'right', title: 'Something bigger', text: `A second project waits in ${ANALYSIS}: queue A has 48 jobs of three to six minutes each.`, commands: [SUBMIT_A],
      done: (e) => submitted(e, 'A'), reaction: 'Watch A spread over both hosts. New starts are paced: each host adds a slot every few seconds.' },
    { target: '#win-pool', side: 'left', title: 'A second queue', text: 'Now queue B, at the same priority, 50. Nothing running gets stopped to make room.', commands: [SUBMIT_B],
      done: (e) => submitted(e, 'B'), reaction: "As A's jobs finish, B takes the freed slots until the two run equal numbers. Equal priorities progress together." },
    { target: '#win-monitor', side: 'below', title: 'Pick a favourite', text: "Say you want B's results first. Raise its priority; the higher number wins.", commands: () => [batch('B') && `rota set-priority --batch_dir ${batch('B')} --schedule_priority 90`],
      done: (e) => controlled(e, 'set-priority', 'B'), reaction: "From now on B gets every slot that frees up, while A's running jobs carry on (priority decides who gets the next slot, never who keeps one). B's Priority column now reads 90 (#1)." },
    { target: '#win-storage', side: 'right', title: 'Pause', text: 'Pausing stops new starts for a queue. Try it on A.', commands: () => [batch('A') && `rota pause --batch_dir ${batch('A')}`],
      done: (e) => controlled(e, 'pause', 'A'),
      reaction: () => (latest(w, 'A')?.lifecycle === 'DRAINING'
        ? 'A is DRAINING: its running jobs finish, and nothing new starts. Its Admission reads Paused.'
        : "A has no jobs running just now (B took its slots), so it simply waits, PENDING, with Admission Paused.") },
    { target: '#win-storage', side: 'right', title: 'Resume', text: 'And let A start jobs again.', commands: () => [batch('A') && `rota resume --batch_dir ${batch('A')}`],
      done: (e) => controlled(e, 'resume', 'A'), reaction: 'Back in turn. Pause and resume, like priorities, affect future starts only.' },
    { target: '#win-storage', side: 'right', title: 'A dependency', text: 'Queue C summarizes B, so it should wait for B to succeed. <code>--after</code> holds it.', commands: () => [batch('B') && SUBMIT_C(w)],
      done: (e) => submitted(e, 'C'), reaction: 'C shows Admission <b>Dependency</b>. It unlocks only when B is COMPLETED, every job with a done marker.' },
    { target: '#cable-button', side: 'right', title: 'Lose a host', text: "Now some trouble. Pull the worker's network cable: it loses SSH and the shared drive together.", action: 'unplug',
      done: (e) => e.type === 'unplugged', reaction: "The coordinator can't reach worker any more, so it sends it no new plans." },
    { target: '#win-worker', side: 'right', title: 'Still running', text: 'This window is a shell on the worker itself. Its jobs are still there.', commands: ['ps'], host: 'worker',
      done: (e) => ran(e, /^\s*(ps|pgrep)/, 'worker'), reaction: "A missed lease never kills a job. The coordinator keeps charging these slots, because from where it sits it can't tell whether they're still running." },
    { target: '#win-pool', side: 'left', title: 'The lease runs out', text: "Each plan carries a lease of 20 seconds. Watch worker's run out.", auto: true,
      done: () => { const h = w.sim.hosts.find((x) => x.id === 'worker'); return !h.reachable && lease(w.sim, h).expired; },
      reaction: 'Expired. The worker now starts nothing new; storage carries on.' },
    { target: '#cable-button', side: 'right', title: 'Back online', text: 'Plug the cable back in.', action: 'plug', done: (e) => e.type === 'reconnected',
      reaction: () => {
        const a = latest(w, 'A');
        const failed = a ? a.jobs.filter((j) => j.outcome === 'infrastructure_failed').length : 0;
        return failed
          ? `${failed} of A's jobs ended while the drive was gone and could not write a done marker, so A has a <b>failure hold</b> on worker. Jobs still running when the cable came back will finish, but their open files on the share were revoked.`
          : "The jobs that ran across the outage will finish, but their open files on the share were revoked, so ROTA records each as a <b>share interruption</b> for you to check.";
      } },
    { target: '#win-storage', side: 'right', title: 'Audit before retrying', text: "ROTA re-runs nothing by itself. Look at A's records, then compare its done markers with its queue.",
      commands: () => [batch('A') && `rota queue-status --batch_dir ${batch('A')} | grep -E 'share_interrupted|failure_holds|lifecycle'`, `rota reconcile --model_dir ${ANALYSIS} --queue a.txt`],
      done: (e) => ran(e, /reconcile/), reaction: 'reconcile wrote a retry queue of the missing jobs. Clear a hold with <code>reset-failures</code>, accept checked outputs with <code>confirm-interrupted-jobs</code>, and once A finishes, <code>--rerun_missing</code> resubmits only what is missing. All are under <b>Commands</b>.' },
    { target: '#win-monitor', side: 'below', title: 'When will it finish?', text: "The ETA/End column replays the scheduler's own allocation each time a job should finish, so when one queue ends, the next one's forecast moves earlier.", commands: [ETA],
      done: (e) => ran(e, /monitor_pool_eta/), reaction: '<code>pool_eta_sec</code> counts capacity other queues will free; <code>allocation_eta_sec</code> keeps today\'s worker count.' },
    { target: '#about', side: 'below', title: "That's the tour", text: 'Keep typing, or open <b>Commands</b> for more. The real thing lives at <a href="https://github.com/NikVetr/rota">github.com/NikVetr/rota</a>, and the <a href="https://youtu.be/NRnLCDgYsQw">video</a> explains how it decides who runs.' },
  ];
}

export function createTour(root, app) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML = `${CAT}<div class="bubble" role="region" aria-label="Tour" tabindex="-1">
    <p class="bubble-step"></p><h2 class="bubble-title"></h2><div class="bubble-text"></div><div class="bubble-commands"></div>
    <p class="bubble-reaction" aria-live="polite"></p>
    <button type="button" class="bubble-min" data-min aria-expanded="true" aria-label="Fold the tour away" title="Fold the tour away">–</button>
    <div class="bubble-nav"><button type="button" data-back>← Back</button><button type="button" data-next class="primary">Next →</button><button type="button" data-skip>Skip tour</button></div></div>`;
  const cat = root.querySelector('.pip');
  const bubble = root.querySelector('.bubble');
  let list = steps(app);
  let index = 0, active = false, solved = new Set(), flight = null, pos = null;

  function targetRect() {
    const el = document.querySelector(list[index].target);
    return el?.getBoundingClientRect();
  }
  const phoneView = matchMedia('(max-width: 759px)');
  /** Where Pip sits for the current step, in page coordinates: on the target's top edge. */
  function perch() {
    const r = targetRect();
    if (!r) return { x: 16, y: 16 };
    const size = 72;
    // Beside a small target, such as the cable button, so as not to hide it.
    if (r.height < 60) return { x: Math.max(8, r.left - size - 2) + scrollX, y: Math.max(8, r.top - 20) + scrollY };
    const x = Math.min(window.innerWidth - size - 8, Math.max(8, r.right - size - 12));
    // On a phone Pip sits on the window bar, clear of the tabs above it.
    const y = Math.max(8, phoneView.matches ? r.top - size + 40 : r.top - size + 22);
    return { x: x + scrollX, y: y + scrollY };
  }
  /**
   * The bubble hangs from Pip on the step's side, over the neighbour that matters least to it,
   * and stays in the viewport. On a phone it sits under the tabs, clear of the prompt.
   */
  function placeBubble() {
    const { x, y } = pos;
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(phoneView.matches ? vw - 16 : 340, vw - 16);
    bubble.style.width = `${width}px`;
    const side = phoneView.matches ? 'below' : list[index].side ?? 'below';
    const h = bubble.offsetHeight;
    let left = side === 'right' ? x + 64 : side === 'left' ? x - width + 8 : x + 72 - width;
    let top = side === 'below' ? y + 70 : y + 40;
    // A short target (the phone's dashboard) keeps its view: the bubble goes under it instead.
    const r = targetRect();
    if (phoneView.matches && r && r.height < vh * 0.55 && r.bottom + h + 8 < vh) top = r.bottom + scrollY + 6;
    // Clear of the phone's sticky tabs, and inside the viewport.
    const tabs = document.querySelector('.tabs');
    const floor = phoneView.matches && tabs ? Math.max(8, tabs.getBoundingClientRect().bottom + 4) : 8;
    left = Math.min(Math.max(scrollX + 8, left), scrollX + vw - width - 8);
    top = Math.max(scrollY + floor, Math.min(top, scrollY + vh - h - 8));
    bubble.style.left = `${left - x}px`;
    bubble.style.top = `${top - y}px`;
  }
  function moveTo(next, animate) {
    const from = pos;
    pos = next;
    root.style.transform = `translate(${next.x}px, ${next.y}px)`;
    if (!animate || !from || reduced.matches || (from.x === next.x && from.y === next.y)) { placeBubble(); return; }
    flight?.cancel();
    const lift = Math.min(from.y, next.y) - 90;
    root.classList.add('flying');
    flight = root.animate([
      { transform: `translate(${from.x}px, ${from.y}px) rotate(0deg)` },
      { transform: `translate(${(from.x + next.x) / 2}px, ${lift}px) rotate(${next.x < from.x ? 12 : -12}deg)`, offset: 0.5 },
      { transform: `translate(${next.x}px, ${next.y}px) rotate(0deg)` },
    ], { duration: Math.min(900, 380 + Math.hypot(next.x - from.x, next.y - from.y) / 3), easing: 'cubic-bezier(.45,.05,.4,1)' });
    flight.onfinish = () => { root.classList.remove('flying'); placeBubble(); };
  }

  function render(animate = true) {
    const s = list[index];
    root.querySelector('.bubble-step').textContent = `Tour ${index + 1} of ${list.length}`;
    root.querySelector('.bubble-title').textContent = s.title;
    root.querySelector('.bubble-text').innerHTML = s.text;
    const box = root.querySelector('.bubble-commands');
    box.replaceChildren();
    const commands = (typeof s.commands === 'function' ? s.commands() : s.commands ?? []).filter(Boolean);
    for (const command of commands) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest';
      b.title = `Put this in the ${s.host ?? 'storage'} window`;
      const code = document.createElement('code');
      code.textContent = command;
      b.append(code);
      b.addEventListener('click', () => app.insert(s.host ?? 'storage', command));
      box.append(b);
    }
    if (s.action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest action';
      b.textContent = s.action === 'unplug' ? '⏚ Pull the cable' : '⏚ Plug it back in';
      b.addEventListener('click', () => app.cable(s.action === 'plug'));
      box.append(b);
    }
    const isSolved = solved.has(index);
    const reaction = root.querySelector('.bubble-reaction');
    reaction.innerHTML = isSolved && s.reaction ? `<span aria-hidden="true">✓ </span>${typeof s.reaction === 'function' ? s.reaction() : s.reaction}` : '';
    root.classList.toggle('happy', isSolved);
    root.classList.toggle('pointing', !isSolved && !!s.done);
    root.querySelector('[data-back]').disabled = index === 0;
    const next = root.querySelector('[data-next]');
    const last = index === list.length - 1;
    next.textContent = last ? 'Done' : s.done && !isSolved ? 'Skip step →' : 'Next →';
    next.classList.toggle('primary', !s.done || isSolved);
    app.show(s.target);
    requestAnimationFrame(() => moveTo(perch(), animate));
  }

  function go(i) {
    index = Math.max(0, Math.min(list.length - 1, i));
    root.classList.remove('folded');
    render();
  }
  function start(at = 0) {
    list = steps(app);
    active = true;
    root.hidden = false;
    pos = null;
    solved = new Set();
    index = at;
    render(false);
  }
  function stop() {
    active = false;
    root.hidden = true;
    flight?.cancel();
  }

  root.querySelector('[data-back]').addEventListener('click', () => go(index - 1));
  root.querySelector('[data-next]').addEventListener('click', () => (index === list.length - 1 ? stop() : go(index + 1)));
  root.querySelector('[data-skip]').addEventListener('click', stop);
  const fold = (folded) => {
    root.classList.toggle('folded', folded);
    root.querySelector('[data-min]').setAttribute('aria-expanded', String(!folded));
    if (!folded) placeBubble();
  };
  root.querySelector('[data-min]').addEventListener('click', () => fold(true));
  cat.addEventListener('click', () => fold(!root.classList.contains('folded')));
  cat.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fold(!root.classList.contains('folded')); }
  });
  bubble.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); } else if (e.key === 'Escape') { e.preventDefault(); stop(); }
  });
  addEventListener('resize', () => { if (active) moveTo(perch(), false); });
  // Scrolling (including the scroll that brings a target into view) keeps the bubble on screen.
  let queued = false;
  addEventListener('scroll', () => {
    if (!active || queued || !pos) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!root.classList.contains('flying')) placeBubble(); });
  }, { passive: true });

  return {
    start, stop, go,
    get active() { return active; }, get index() { return index; }, get length() { return list.length; },
    /** Let the current step see an event; react if it completes the step. */
    notify(event) {
      if (!active) return;
      const s = list[index];
      if (!s.done || solved.has(index) || !s.done(event)) return;
      solved.add(index);
      root.classList.remove('folded');
      render(false);
      if (!reduced.matches) root.animate([{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out', composite: 'add' });
    },
  };
}
