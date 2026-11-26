// The guided tour: Monte, the black-and-white cat from the site's footer, leaps to the next thing to try with the tour
// panel beside it (one unit, shared/tour-guide/), suggests the command, and reacts when it is done. The leap shows
// where to look next; with reduced motion the unit is placed at once. The visitor can drag it aside, or move it with
// the arrow keys on the panel's grip. The tour can be skipped, replayed and driven from the keyboard. Monte's poses
// are image files listed in ../guide/manifest.js.
import { ANALYSIS } from '../core/scenario.js';
import { latest, PILOT_SUBMIT, PREPARE, SUBMIT_A, SUBMIT_B, SUBMIT_C, ETA } from './commands.js';
import { lease } from '../core/sim.js';
import { createTourGuide, poseFor } from '../../shared/tour-guide/tour-guide.js';
import MONTE from '../guide/manifest.js';

/** The steps, in the brief's order. `done(e, world)` sees each run and simulation event. */
function steps(app) {
  const w = app.world;
  const batch = (run) => latest(w, run)?.batchDir;
  const ran = (e, re, host = 'storage') => e.type === 'run' && e.host === host && re.test(e.text);
  const submitted = (e, run) => e.type === 'run' && e.result.effects.some((x) => x.type === 'submitted' && w.sim.queues.find((q) => q.id === x.queue)?.runName === run);
  const controlled = (e, action, run) => e.type === 'run' && e.result.effects.some((x) => x.type === 'control' && x.action === action && w.sim.queues.find((q) => q.id === x.queue)?.runName === run);
  return [
    { target: '#win-storage', title: 'Hello', text: "I'm Monte. This is a simulated ROTA pool: two machines, <b>storage</b> and <b>worker</b>, sharing a drive at /srv/cluster. Whatever you type runs against that simulation, in your browser, so nothing can break. I'll show you around; choose <b>End tour</b> if you'd rather poke at it yourself." },
    { target: '#win-storage', title: 'An idle pool', text: 'The pool has already been started. Ask the scheduler what it knows about it.', commands: ['rota pool-status'], done: (e) => ran(e, /pool-status/),
      reaction: 'state=ACTIVE, and no queues yet. live_cpu_units=12: storage lends the pool 4 CPU units, worker 8.' },
    { target: '#win-monitor', title: 'The dashboard', text: '<code>rota monitor</code> is this tmux dashboard. Each host has a CPU pane and a MEM pane; CLUSTER I/O shows the pool and the shared drive; QUEUE PROGRESS lists every queue. For now, both hosts are idle.' },
    { target: '#win-storage', title: 'A first project', text: 'The first-job example makes a project with two jobs, one squaring 3 and one squaring 7.', commands: [PREPARE, 'cat "$project/queues/jobs.txt"'],
      done: () => w.prepared > 0, reaction: 'Each line is a job ID, then the command a worker runs. ROTA appends a <code>--job_tag</code> to that command, so it can find the job\'s processes later.' },
    { target: '#win-storage', title: 'Submit it', text: 'Tell ROTA what one job needs: one CPU unit and 512 MiB, at most one worker at a time.', commands: [PILOT_SUBMIT],
      done: (e) => submitted(e, 'pilot'), reaction: "Note the queue's <b>batch_dir</b>: every later command refers to the queue by it. With one worker allowed, the two jobs ran one after the other, each on whichever host would be least full afterward." },
    { target: '#win-storage', title: 'Check the answers', text: 'See the queue finish, then read what the jobs wrote.', commands: () => [batch('pilot') ? `rota queue-status --batch_dir ${batch('pilot')}` : null, 'cat "$project/results/3.txt" "$project/results/7.txt"'],
      done: (e) => ran(e, /results\/3\.txt/) && e.result.lines.some((l) => l.text === '9'), reaction: '9 and 49, as advertised. A <code>done/job_ID.done</code> marker per job is how ROTA knows each one succeeded.' },
    { target: '#win-storage', title: 'Something bigger', text: `A second project waits in ${ANALYSIS}: queue A has 48 jobs of three to six minutes each.`, commands: [SUBMIT_A],
      done: (e) => submitted(e, 'A'), reaction: 'Watch A spread over both hosts. New starts are paced: each host adds a slot every few seconds.' },
    { target: '#win-pool', title: 'A second queue', text: 'Now queue B, at the same priority, 50. Nothing running gets stopped to make room.', commands: [SUBMIT_B],
      done: (e) => submitted(e, 'B'), reaction: "As A's jobs finish, B takes the freed slots until the two run equal numbers. Equal priorities progress together." },
    { target: '#win-monitor', title: 'Pick a favourite', text: "Say you want B's results first. Raise its priority; the higher number wins.", commands: () => [batch('B') && `rota set-priority --batch_dir ${batch('B')} --schedule_priority 90`],
      done: (e) => controlled(e, 'set-priority', 'B'), reaction: "From now on B gets every slot that frees up, while A's running jobs carry on (priority decides who gets the next slot, never who keeps one). B's Priority column now reads 90 (#1)." },
    { target: '#win-storage', title: 'Pause', text: 'Pausing stops new starts for a queue. Try it on A.', commands: () => [batch('A') && `rota pause --batch_dir ${batch('A')}`],
      done: (e) => controlled(e, 'pause', 'A'),
      reaction: () => (latest(w, 'A')?.lifecycle === 'DRAINING'
        ? 'A is DRAINING: its running jobs finish, and nothing new starts. Its Admission reads Paused.'
        : "A has no jobs running just now (B took its slots), so it simply waits, PENDING, with Admission Paused.") },
    { target: '#win-storage', title: 'Resume', text: 'And let A start jobs again.', commands: () => [batch('A') && `rota resume --batch_dir ${batch('A')}`],
      done: (e) => controlled(e, 'resume', 'A'), reaction: 'Back in turn. Pause and resume, like priorities, affect future starts only.' },
    { target: '#win-storage', title: 'A dependency', text: 'Queue C summarizes B, so it should wait for B to succeed. <code>--after</code> holds it.', commands: () => [batch('B') && SUBMIT_C(w)],
      done: (e) => submitted(e, 'C'), reaction: 'C shows Admission <b>Dependency</b>. It unlocks only when B is COMPLETED, every job with a done marker.' },
    { target: '#cable-button', title: 'Lose a host', text: "Now some trouble. Pull the worker's network cable: it loses SSH and the shared drive together.", action: 'unplug',
      done: (e) => e.type === 'unplugged', reaction: "The coordinator can't reach worker any more, so it sends it no new plans." },
    { target: '#win-worker', title: 'Still running', text: 'This window is a shell on the worker itself. Its jobs are still there.', commands: ['ps'], host: 'worker',
      done: (e) => ran(e, /^\s*(ps|pgrep)/, 'worker'), reaction: "A missed lease never kills a job. The coordinator keeps charging these slots, because from where it sits it can't tell whether they're still running." },
    { target: '#win-pool', title: 'The lease runs out', text: "Each plan carries a lease of 20 seconds. Watch worker's run out.", auto: true,
      done: () => { const h = w.sim.hosts.find((x) => x.id === 'worker'); return !h.reachable && lease(w.sim, h).expired; },
      reaction: 'Expired. Without its share, the worker already started nothing new; the expired lease keeps it that way until the coordinator reaches it again. storage carries on.' },
    { target: '#cable-button', title: 'Back online', text: 'Plug the cable back in.', action: 'plug', done: (e) => e.type === 'reconnected',
      reaction: () => {
        const a = latest(w, 'A');
        const failed = a ? a.jobs.filter((j) => j.outcome === 'infrastructure_failed').length : 0;
        return failed
          ? `${failed} of A's jobs ended while the drive was gone and could not write a done marker, so A has a <b>failure hold</b> on worker. Jobs still running when the cable came back will finish, but their open files on the share were revoked.`
          : "The jobs that ran across the outage will finish, but their open files on the share were revoked, so ROTA records each as a <b>share interruption</b> for you to check.";
      } },
    { target: '#win-storage', title: 'Audit before retrying', text: "ROTA re-runs nothing by itself. Look at A's records, then compare its done markers with its queue.",
      commands: () => [batch('A') && `rota queue-status --batch_dir ${batch('A')} | grep -E 'share_interrupted|failure_holds|lifecycle'`, `rota reconcile --model_dir ${ANALYSIS} --queue a.txt`],
      done: (e) => ran(e, /reconcile/), reaction: 'reconcile wrote a retry queue of the missing jobs. While A is still running, missing includes jobs that haven\u2019t started yet, which is why <code>--rerun_missing</code> waits until A finishes. Clear a hold with <code>reset-failures</code>, accept checked outputs with <code>confirm-interrupted-jobs</code>, and once A finishes, <code>--rerun_missing</code> resubmits only what is missing. All are under <b>Commands</b>.' },
    { target: '#win-monitor', title: 'When will it finish?', text: "The ETA/End column replays the scheduler's own allocation each time a job should finish, so when one queue ends, the next one's forecast moves earlier.", commands: [ETA],
      done: (e) => ran(e, /monitor_pool_eta/), reaction: '<code>pool_eta_sec</code> counts capacity other queues will free; <code>allocation_eta_sec</code> keeps today\'s worker count.' },
    { target: '#about', title: "That's the tour", text: 'Keep typing, or open <b>Commands</b> for more. The real thing lives at <a href="https://github.com/NikVetr/rota">github.com/NikVetr/rota</a>, and the <a href="https://youtu.be/NRnLCDgYsQw">video</a> explains how it decides who runs.' },
  ];
}

export function createTour(root, app) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneView = matchMedia('(max-width: 759px)');
  root.innerHTML = `<div class="tour-unit"><button type="button" class="cat" aria-label="${MONTE.label}" aria-expanded="true"></button><div class="bubble"></div></div>`;
  const cat = /** @type {HTMLElement} */ (root.querySelector('.cat'));
  const guide = createTourGuide(/** @type {HTMLElement} */ (root.querySelector('.tour-unit')), {
    character: cat, panel: /** @type {HTMLElement} */ (root.querySelector('.bubble')), art: MONTE, area: viewArea,
    sides: () => (phoneView.matches ? ['below', 'above'] : ['right', 'left', 'below', 'above']),
    onBack: () => go(index - 1), onNext: () => go(index + 1), onEnd: () => stop(), onReplay: () => start(0),
  });
  const bubble = guide.panel;
  guide.body.innerHTML = '<h2 class="bubble-title"></h2><div class="bubble-text"></div><div class="bubble-commands"></div><p class="bubble-reaction"></p>';
  guide.head.insertAdjacentHTML('beforeend', '<button type="button" class="bubble-min" data-min aria-expanded="true" aria-label="Fold the tour away" title="Fold the tour away">–</button>');
  let list = steps(app);
  let index = 0, active = false, solved = new Set();

  function targetRect() {
    const el = document.querySelector(list[index].target);
    return el?.getBoundingClientRect();
  }
  /** The viewport in page coordinates, as it will be once the target has scrolled into view, less the phone's
   * sticky tabs: where Monte and the panel stay. */
  function viewArea() {
    const r = targetRect();
    let top = scrollY;
    if (r && r.top < 0) top += r.top;
    else if (r && r.bottom > innerHeight) top += Math.min(r.top, r.bottom - innerHeight);
    top = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
    const tabs = phoneView.matches && document.querySelector('.tabs')?.getBoundingClientRect();
    const floor = tabs ? Math.max(tabs.height, tabs.bottom + scrollY - top) : 0;
    return { left: scrollX, top: top + floor, width: document.documentElement.clientWidth, height: innerHeight - floor };
  }
  /** Where Monte sits for the current step, in page coordinates: on the target's top edge, beside a small target,
   * or, on a phone, under a short one (the dashboard) when there is room, so that the panel below leaves it in view. */
  function perch() {
    const r = targetRect();
    if (!r) return { x: 16 + scrollX, y: 16 + scrollY };
    const size = 72;
    // Beside a small target, such as the cable button, so as not to hide it.
    if (r.height < 60) return { x: Math.max(8, r.left - size - 2) + scrollX, y: Math.max(8, r.top - 20) + scrollY };
    const x = Math.min(window.innerWidth - size - 8, Math.max(8, r.right - size - 12));
    const a = viewArea();
    if (phoneView.matches && r.height < innerHeight * 0.55 && r.bottom + scrollY + size + bubble.offsetHeight + 8 < a.top + a.height) return { x: x + scrollX, y: r.bottom - 14 + scrollY };
    // On a phone Monte sits on the window bar, clear of the tabs above it.
    const y = Math.max(8, phoneView.matches ? r.top - size + 40 : r.top - size + 22);
    return { x: x + scrollX, y: y + scrollY };
  }
  /** Monte, with the panel beside it, leaps to the step's window (or, under reduced motion, appears there). The
   * windows are large, so the panel keeps its side until the screen edge turns it, whatever window it covers. */
  function place(glide) {
    const { x, y } = perch();
    guide.moveTo(x, y, { glide });
  }
  /** Monte's pose between leaps: waves at the start and end, points while a step waits, pleased once it is done. */
  const restPose = () => poseFor({ done: solved.has(index), first: index === 0, last: index === list.length - 1, task: !!list[index].done });

  function render(animate = true) {
    const s = list[index];
    guide.update({ index, total: list.length, ready: !s.done || solved.has(index) });
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
    const reaction = root.querySelector('.bubble-reaction');
    reaction.innerHTML = solved.has(index) && s.reaction ? `<span aria-hidden="true">✓ </span>${typeof s.reaction === 'function' ? s.reaction() : s.reaction}` : '';
    guide.pose(restPose());
    app.show(s.target);
    requestAnimationFrame(() => place(animate));
  }

  const fold = (folded) => {
    root.classList.toggle('folded', folded);
    for (const el of [cat, root.querySelector('[data-min]')]) el.setAttribute('aria-expanded', String(!folded));
  };
  function go(i) {
    index = Math.max(0, Math.min(list.length - 1, i));
    fold(false);
    render();
  }
  function start(at = 0) {
    list = steps(app);
    active = true;
    root.hidden = false;
    solved = new Set();
    index = at;
    fold(false);
    guide.show();
    render(false);
  }
  function stop() {
    active = false;
    guide.hide().then(() => { if (!active) root.hidden = true; });
  }

  root.querySelector('[data-min]').addEventListener('click', () => fold(true));
  cat.addEventListener('click', () => fold(!root.classList.contains('folded')));
  bubble.addEventListener('keydown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('input')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); } else if (e.key === 'Escape') { e.preventDefault(); stop(); }
  });
  addEventListener('resize', () => { if (active) place(false); });

  return {
    start, stop, go,
    get active() { return active; }, get index() { return index; }, get length() { return list.length; },
    get pose() { return guide.currentPose; }, get pinned() { return guide.pinned; }, get side() { return guide.side; },
    /** Let the current step see an event; react if it completes the step. */
    notify(event) {
      if (!active) return;
      const s = list[index];
      if (!s.done || solved.has(index) || !s.done(event)) return;
      solved.add(index);
      fold(false);
      render(false);
      if (!reduced.matches) cat.animate([{ translate: '0 0' }, { translate: '0 -14px' }, { translate: '0 0' }], { duration: 420, easing: 'ease-out', composite: 'add' });
    },
  };
}
