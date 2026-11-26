// The guided tour: Biscuit, an original Italian greyhound in a green jumper (after the dogs in the wallpaper
// photo), runs to the next thing to try, says what it does and cheers when the visitor does it. The run shows
// where to look, so it is the one deliberate motion on the page; with reduced motion Biscuit appears beside the
// target instead. Keys: ← → step, Esc ends (when no menu is open), T starts or ends it.

const DOG = `<svg viewBox="0 0 100 100" aria-hidden="true">
<path d="M40 98 L40 84 M62 98 L62 84" stroke="#e7dccd" stroke-width="7" stroke-linecap="round"/>
<path d="M26 70c0-14 12-24 28-24s26 10 26 24v14c0 6-4 9-10 9H36c-6 0-10-3-10-9z" fill="#1f6b46"/>
<path d="M30 74h46M30 80h46M30 86h46" stroke="#18563a" stroke-width="2" stroke-linecap="round"/>
<path d="M44 48c1-6 16-8 20-2l2 10c-8 5-17 5-24 1z" fill="#2a8a5b"/>
<path d="M46 50h18M45 54h20" stroke="#217149" stroke-width="2" stroke-linecap="round"/>
<path d="M47 47c-1-10 3-18 9-23l9 4c-4 6-6 12-6 19z" fill="#e9ddcc"/>
<path d="M52 15c6-7 19-7 23 0 2 3 2 7 1 9l17 6c3 1 3 6-1 6l-17 2c-7 3-17 1-22-6-3-5-4-13-1-17z" fill="#f1e7d8"/>
<path d="M76 26l17 5c2 1 2 4-1 5l-14 1" fill="#e3d4c0"/>
<circle cx="93" cy="33.5" r="3" fill="#2b2220"/>
<path d="M58 13c-4-7-13-6-16 1 4 0 9 2 13 7z" fill="#b98f6e"/>
<circle cx="68" cy="21" r="2.7" fill="#2b2220"/><circle cx="68.8" cy="20.2" r=".8" fill="#fff"/>
<path d="M78 37c3 2 7 2 10 0" stroke="#c9b49a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>`;

/** @param {{stage: HTMLElement, screen: HTMLElement, ui: any, sim: any, on: (fn: (kind: string, detail: any) => void) => () => void, openMenu: Function, closeMenus: Function}} deps */
export function createTour({ stage, screen, ui, sim, on, openMenu, closeMenus }) {
  const root = /** @type {HTMLElement} */ (document.getElementById('tour'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const q = (selector) => /** @type {HTMLElement|null} */ (screen.querySelector(selector));
  const key = (name) => sim.state.rows.find((r) => r.name === name)?.key;
  const shortcut = (name) => q(`[data-act="shortcut"][data-key="${CSS.escape(key(name) ?? '')}"]`);
  const winOf = (name) => sim.byKey(key(name))?.window;

  /** Each step: where Biscuit goes, what it says, what counts as having tried it, and what it says then. */
  const steps = [
    { target: () => q('.tracker-bar-chats'), text: 'This is a pretend Ubuntu desktop with Agent Bar in its top bar. <b>✳ 3 / 5</b> means three of the five open Claude chats need review; ⌘ is Codex. Click the counts to open the dropdown.',
      done: (k, d) => k === 'open' && d.view === 'conversations', already: () => ui.open === 'menu' && ui.view === 'conversations',
      cheer: 'That is every open chat, by project and window.' },
    { target: () => shortcut('tune') || q('.tracker-quick [data-act="shortcut"]'), text: 'Buttons after the clock are chats that need you, the longest waiting first. Click <b>✳ sampler-study</b>.',
      done: (k, d) => k === 'focused' && d.mode === 'focus', cheer: 'Its window came forward, maximized, with that exact chat showing, even though three chats share that window.' },
    { target: () => q('.tracker-bar-chats'), text: 'Now open the dropdown and click that same chat’s row again (it says “click to return”). Its window goes back where it was.',
      done: (k) => k === 'returned', cheer: 'Back where it was. One click there, one click back.' },
    { target: () => q('.tracker-quick-group') || q('.tracker-quick'), text: 'Several chats in one project share a button: its name opens the longest-waiting one, and each <b>numbered bubble</b> opens one chat. Try a bubble.',
      done: (k, d) => k === 'focused' && d.mode === 'focus', cheer: 'Each bubble is one chat in that project.' },
    { target: () => q('.window.front .chat-suggest .suggest') || q('.window.front .chat-input, .window.front .term-prompt'), text: 'Answer the chat: pick a suggestion (or type and press Enter). Its turn starts, ● in the top bar counts it, and it comes back for review when it is done.',
      done: (k) => k === 'prompt', cheer: 'Working now. Opening, answering or messaging a chat clears its review.' },
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

  let index = -1, cheered = false, guideAt = /** @type {[number, number]|null} */ (null);
  const changes = new Set();
  root.innerHTML = `<div class="tour-ring" hidden></div><div class="tour-guide" hidden role="img" aria-label="Biscuit, the tour guide">${DOG}</div><div class="tour-bubble" hidden role="dialog" aria-label="Tour" aria-live="polite"></div>`;
  const ring = /** @type {HTMLElement} */ (root.querySelector('.tour-ring'));
  const guide = /** @type {HTMLElement} */ (root.querySelector('.tour-guide'));
  const bubble = /** @type {HTMLElement} */ (root.querySelector('.tour-bubble'));

  function show() {
    const step = steps[index];
    const target = step.target();
    root.hidden = false;
    bubble.hidden = false;
    guide.hidden = false;
    const total = steps.length;
    bubble.innerHTML = `<p class="tour-step">Step ${index + 1} of ${total}</p><p>${step.text}</p>${cheered && step.cheer ? `<p class="tour-done">✓ ${step.cheer}</p>` : ''}
<div class="tour-actions"><button type="button" data-tour="back" ${index === 0 ? 'disabled' : ''}>Back</button><span class="grow"></span><button type="button" data-tour="${step.last ? 'replay' : 'next'}" class="${cheered || step.last ? 'primary' : ''}">${step.last ? 'Replay' : cheered ? 'Next' : 'Skip'}</button><button type="button" data-tour="stop">${step.last ? 'Close' : 'End tour'}</button></div>`;
    place(target, true);
  }
  /** Biscuit runs to the target (or, with reduced motion, appears there); the ring marks it. */
  function place(target, move) {
    const s = stage.getBoundingClientRect();
    const r = target?.getBoundingClientRect();
    if (!r || !r.width) {
      ring.hidden = true;
      const x = 24, y = 60;
      jump(x, y, move);
      layoutBubble(x, y, null);
      return;
    }
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - s.left - 4}px`, top: `${r.top - s.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const size = guide.offsetWidth || 96;
    // Beside the target, nose towards it: below it when there is room, and left of it near the right edge.
    const flip = r.left - s.left > s.width * 0.6;
    let x = flip ? r.left - s.left - size + 6 : r.right - s.left - 6;
    let y = r.bottom - s.top + 2;
    if (y + size > s.height) y = r.top - s.top - size;
    x = Math.max(0, Math.min(s.width - size, x));
    y = Math.max(0, Math.min(Math.max(0, s.height - size), y));
    guide.classList.toggle('flip', flip);
    jump(x, y, move);
    layoutBubble(x, y, r);
  }
  function jump(x, y, move) {
    const to = `translate(${x}px, ${y}px)`;
    if (move && guideAt && !reduce.matches && (Math.abs(guideAt[0] - x) > 2 || Math.abs(guideAt[1] - y) > 2)) {
      const [x0, y0] = guideAt;
      const lift = Math.min(140, Math.hypot(x - x0, y - y0) * 0.35);
      const frames = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return { transform: `translate(${x0 + (x - x0) * t}px, ${y0 + (y - y0) * t - lift * 4 * t * (1 - t)}px) rotate(${Math.sin(t * Math.PI) * (x > x0 ? 8 : -8)}deg)` };
      });
      guide.animate(frames, { duration: Math.min(900, 380 + Math.hypot(x - x0, y - y0) * 0.6), easing: 'ease-in-out' });
    }
    guide.style.transform = to;
    guideAt = [x, y];
  }
  // The bubble hangs under Biscuit (or above, near the bottom), and moves beside it when that would cover the target.
  function layoutBubble(x, y, target) {
    const s = stage.getBoundingClientRect();
    const w = bubble.offsetWidth || 320, h = bubble.offsetHeight || 160;
    const size = guide.offsetWidth || 96;
    const clampX = (v) => Math.max(8, Math.min(s.width - w - 8, v)), clampY = (v) => Math.max(8, Math.min(s.height - h - 8, v));
    const t = target && [target.left - s.left, target.top - s.top, target.right - s.left, target.bottom - s.top];
    const covers = (l, tp) => t && l < t[2] && l + w > t[0] && tp < t[3] && tp + h > t[1];
    const below = y + size + 2 + h <= s.height - 8 ? y + size + 2 : y - h - 2;
    const options = [[clampX(x + size / 2 - w / 2), clampY(below)], [clampX(x + size + 6), clampY(y)], [clampX(x - w - 6), clampY(y)],
      [clampX(t ? t[0] - w - 12 : 8), clampY(t ? t[1] : y)], [clampX(t ? t[2] + 12 : 8), clampY(t ? t[1] : y)]];
    const [left, top] = options.find(([l, tp]) => !covers(l, tp)) ?? options[0];
    Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
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
    follow = window.setInterval(() => { if (index >= 0 && !document.hidden) place(steps[index].target(), false); }, 500);
  }
  function start() {
    if (!guideAt) {
      const s = stage.getBoundingClientRect();
      guideAt = [s.width / 2, s.height - 100];
    }
    go(0);
  }
  function stop() {
    index = -1;
    root.hidden = true;
    clearInterval(follow);
    for (const fn of changes) fn(false);
  }

  bubble.addEventListener('click', (event) => {
    const action = /** @type {HTMLElement} */ (event.target).closest('[data-tour]')?.getAttribute('data-tour');
    if (action === 'next') go(index + 1);
    else if (action === 'back') go(index - 1);
    else if (action === 'replay') go(0);
    else if (action === 'stop') stop();
  });
  on((kind, detail) => {
    if (index < 0) return;
    const step = steps[index];
    if (!cheered && step.done(kind, detail)) {
      cheered = true;
      if (!reduce.matches) {
        guide.classList.remove('cheer');
        void guide.offsetWidth;
        guide.classList.add('cheer');
      }
      show();
      // Then on to the next thing to try, after a moment to read the remark.
      setTimeout(() => { if (steps[index] === step && cheered) go(index + 1); }, step.cheer ? 2600 : 500);
    } else if (!cheered && ['open', 'close', 'focused', 'returned'].includes(kind)) requestAnimationFrame(() => place(step.target(), false));
  });
  // Targets move as the desktop changes: keep Biscuit and the ring on them, twice a second while the tour runs.
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
    state: () => ({ active: index >= 0, step: index, tried: cheered }),
    onChange: (fn) => changes.add(fn),
  };
}
