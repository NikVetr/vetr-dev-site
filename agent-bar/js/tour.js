// The guided tour: Pipsqueak, an Italian greyhound in a green turtleneck (after the dogs in the wallpaper photo), runs
// to the next thing to try with its panel beside it (one unit, shared/tour-guide/), says what it does and cheers when
// the visitor does it. The run shows where to look; with reduced motion the unit is placed at once. The visitor can
// drag it aside, or move it with the arrow keys on the panel's grip. Keys: ← → step, Esc ends (when no menu is open),
// T starts or ends it. Pipsqueak's poses are image files listed in ../guide/manifest.js.
import { createTourGuide, poseFor } from '../../shared/tour-guide/tour-guide.js';
import PIPSQUEAK from '../guide/manifest.js';

/** @param {{stage: HTMLElement, screen: HTMLElement, ui: any, sim: any, on: (fn: (kind: string, detail: any) => void) => () => void, openMenu: Function, closeMenus: Function}} deps */
export function createTour({ stage, screen, ui, sim, on, openMenu, closeMenus }) {
  const root = /** @type {HTMLElement} */ (document.getElementById('tour'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const q = (selector) => /** @type {HTMLElement|null} */ (screen.querySelector(selector));
  const key = (name) => sim.state.rows.find((r) => r.name === name)?.key;
  const shortcut = (name) => q(`[data-act="shortcut"][data-key="${CSS.escape(key(name) ?? '')}"]`);
  const winOf = (name) => sim.byKey(key(name))?.window;

  /** Each step: where Pipsqueak goes, what it says, what counts as having tried it, and what it says then. */
  const steps = [
    { target: () => q('.tracker-bar-chats'), text: 'This is a pretend Ubuntu desktop with Agent Bar in its top bar. <b>✳ 3 / 5</b> means three of the five open Claude chats need review; ⌘ is Codex. Click the counts to open the dropdown.',
      done: (k, d) => k === 'open' && d.view === 'conversations', already: () => ui.open === 'menu' && ui.view === 'conversations',
      cheer: 'That is every open chat, by project and window.' },
    { target: () => shortcut('tune') || q('.tracker-quick [data-act="shortcut"]'), text: 'These review buttons are chats that need you, one button per project, the longest waiting first. Click <b>✳ sampler-study</b>.',
      done: (k, d) => k === 'focused' && d.mode === 'focus', cheer: 'Its window came forward, maximized, with that exact chat showing, even though three chats share that window.' },
    { target: () => q('.tracker-bar-chats'), text: 'Now open the dropdown and click that same chat’s row again (it says “click to return”). Its window goes back where it was.',
      done: (k) => k === 'returned', cheer: 'Back where it was. One click there, one click back.' },
    { target: () => q('.tracker-quick-group') || q('.tracker-quick'), text: 'Several chats in one project share a button: its name opens the longest-waiting one, and each <b>numbered bubble</b> opens one chat. Try a bubble.',
      done: (k, d) => k === 'focused' && d.mode === 'focus', cheer: 'Each bubble is one chat in that project.' },
    { target: () => q('.window.front .chat-suggest .suggest') || q('.window.front .chat-input, .window.front .term-prompt'), text: 'Answer the chat: pick a suggestion (or type and press Enter). Its turn starts, ● in the top bar counts it, and it comes back for review when it is done.',
      done: (k) => k === 'prompt', cheer: 'Working now. Opening a chat from Agent Bar, or writing to it, clears its review.' },
    { target: () => q('[data-part="queues"]'), text: 'Each part of the top bar opens its own tab. Click <b>Q 0 / 3</b>, the finished job queues, for Queues, then look through the other tabs.',
      done: (k, d) => k === 'open' && d.view === 'queues', cheer: 'Queues and Cluster follow the optional ROTA job scheduler.' },
    { target: () => q('.tracker-popup [data-view="history"]') || q('.tracker-bar-chats'), before: () => { if (ui.open !== 'menu') openMenu('queues'); },
      text: 'In <b>History</b>, search for words you or an agent wrote. Open History and type <b>warmup step</b> in the search box.',
      done: (k, d) => k === 'search' && d.view === 'history' && /\S+\s+\S+/.test(d.query), cheer: 'Every word has to start a word in the same message.' },
    { target: () => q('.tracker-popup [data-act="context"]'), text: 'Click <b>Show context</b> to read the conversation around a match.',
      done: (k) => k === 'context', already: () => !!q('.tracker-popup .tracker-context'), cheer: '' },
    { target: () => q('.tracker-popup [data-act="hit"][data-step="1"]'), text: 'Use <b>›</b> to step to the next match, newest message first.',
      done: (k) => k === 'hit', cheer: 'That is how you find which chat it was in.' },
    { target: () => q(`[data-win="${CSS.escape(winOf('retry') ?? '')}"] .suggest.send`) || shortcut('retry') || q(`[data-win="${CSS.escape(winOf('retry') ?? '')}"]`),
      before: () => { if (ui.open) closeMenus({ restore: false }); const w = winOf('retry'); if (w) sim.focusWindow(w); },
      text: 'Chats can message each other. This Codex chat in a terminal waits for approval: click <b>Allow</b>. It will run <code>agent-bar send</code> to the QC chat in the other terminal.',
      done: (k, d) => k === 'prompt' && d.key === key('retry'), cheer: 'Watch its terminal: it sends the note, and ✉ in the top bar counts chats whose mail waits for you.' },
    { target: () => q(`[data-win="${CSS.escape(winOf('qc') ?? '')}"] .suggest`) || q(`[data-win="${CSS.escape(winOf('qc') ?? '')}"]`),
      before: () => { const w = winOf('qc'); if (w) sim.focusWindow(w); },
      text: 'The QC chat sees the note at its next turn. Start one: pick its suggestion. (Waking idle chats instead is an opt-in setting.)',
      done: (k, d) => k === 'prompt' && d.key === key('qc'), cheer: 'At turn start the hook told it about the unread note, and it read it with agent-bar inbox.' },
    { target: () => q('[data-part="quota"]'), text: 'That is the tour. Quota (here) shows limits and estimated costs at API prices; Tickets keeps work for later. Everything here is made up and runs in your browser. Agent Bar itself runs on GNOME 42 under X11, as in Ubuntu 22.04.',
      done: () => false, last: true },
  ];

  let index = -1, cheered = false;
  const changes = new Set();
  root.innerHTML = `<div class="tour-ring" hidden></div><div class="tour-unit"><div class="tour-guide" role="img" aria-label="${PIPSQUEAK.label}"></div><div class="tour-bubble"></div></div>`;
  const ring = /** @type {HTMLElement} */ (root.querySelector('.tour-ring'));
  const dog = /** @type {HTMLElement} */ (root.querySelector('.tour-guide'));
  const guide = createTourGuide(/** @type {HTMLElement} */ (root.querySelector('.tour-unit')), {
    character: dog, panel: /** @type {HTMLElement} */ (root.querySelector('.tour-bubble')), art: PIPSQUEAK,
    area: () => { const s = stage.getBoundingClientRect(); return { left: 0, top: 0, width: s.width, height: s.height }; },
    sides: ['below', 'above', 'right', 'left'],
    onBack: () => go(index - 1), onNext: () => go(index + 1), onEnd: () => stop(), onReplay: () => go(0),
  });
  /** What Pipsqueak does between runs: waves at the start and end, points while a step waits, cheers when it is done. */
  const restPose = () => poseFor({ done: cheered, first: index === 0, last: !!steps[index].last, task: !steps[index].last });

  function show() {
    if (index < 0) return;
    const step = steps[index];
    const target = step.target();
    root.hidden = false;
    guide.update({ index, total: steps.length, ready: cheered });
    guide.body.innerHTML = `<p>${step.text}</p>${cheered && step.cheer ? `<p class="tour-done">✓ ${step.cheer}</p>` : ''}`;
    guide.show();
    guide.pose(restPose());
    place(target);
  }
  /** Pipsqueak runs to the target with the panel beside it (or, with reduced motion, appears there); the ring marks it. */
  function place(target, glide = true) {
    const s = stage.getBoundingClientRect();
    const r = target?.getBoundingClientRect();
    if (!r || !r.width) {
      ring.hidden = true;
      guide.moveTo(24, 60, { glide });
      return;
    }
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - s.left - 4}px`, top: `${r.top - s.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const size = dog.offsetWidth || 96;
    // Beside the target, nose towards it: below it when there is room, and left of it near the right edge.
    const flip = r.left - s.left > s.width * 0.6;
    let x = flip ? r.left - s.left - size + 6 : r.right - s.left - 6;
    let y = r.bottom - s.top + 2;
    if (y + size > s.height) y = r.top - s.top - size;
    x = Math.max(0, Math.min(s.width - size, x));
    y = Math.max(0, Math.min(Math.max(0, s.height - size), y));
    dog.classList.toggle('flip', flip && PIPSQUEAK.mirror);
    guide.moveTo(x, y, { avoid: new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height), glide });
  }

  function go(next) {
    index = Math.max(0, Math.min(steps.length - 1, next));
    cheered = false;
    steps[index].before?.();
    // A step the visitor has already done counts as done.
    if (steps[index].already?.()) {
      cheered = true;
      const step = steps[index];
      setTimeout(() => { if (steps[index] === step && cheered) go(index + 1); }, step.cheer ? 2600 : 500);
    }
    // The step's target may appear only after the page has drawn what `before` changed.
    requestAnimationFrame(() => requestAnimationFrame(show));
    for (const fn of changes) fn(true);
    clearInterval(follow);
    follow = window.setInterval(() => { if (index >= 0 && !document.hidden) place(steps[index].target()); }, 500);
  }
  function start() { go(0); }
  function stop() {
    index = -1;
    ring.hidden = true;
    clearInterval(follow);
    for (const fn of changes) fn(false);
    guide.hide().then(() => { if (index < 0) root.hidden = true; });
  }

  on((kind, detail) => {
    if (index < 0) return;
    const step = steps[index];
    if (!cheered && step.done(kind, detail)) {
      cheered = true;
      if (!reduce.matches) {
        dog.classList.remove('cheer');
        void dog.offsetWidth;
        dog.classList.add('cheer');
      }
      show();
      // Then on to the next thing to try, after a moment to read the remark.
      setTimeout(() => { if (steps[index] === step && cheered) go(index + 1); }, step.cheer ? 2600 : 500);
    } else if (!cheered && ['open', 'close', 'focused', 'returned'].includes(kind)) requestAnimationFrame(() => place(step.target()));
  });
  // Targets move as the desktop changes: keep Pipsqueak and the ring on them, twice a second while the tour runs.
  let follow = 0;
  addEventListener('resize', () => { if (index >= 0) place(steps[index].target(), false); });
  document.addEventListener('keydown', (event) => {
    if (index < 0 || /** @type {HTMLElement} */ (event.target).closest('input, textarea')) return;
    if (event.key === 'ArrowRight' && !ui.open) go(index + 1);
    else if (event.key === 'ArrowLeft' && !ui.open) go(index - 1);
    else if (event.key === 'Escape' && !ui.open) stop();
  });

  return {
    start, stop, next: () => go(index + 1), active: () => index >= 0,
    state: () => ({ active: index >= 0, step: index, tried: cheered, pose: guide.currentPose, pinned: guide.pinned, side: guide.side }),
    onChange: (fn) => changes.add(fn),
  };
}
