// The ROTA demo page: a simulated pool (core/), two shells, the dashboard, the pool diagram, the
// Commands palette and the tour, driven by one timer that pauses with the tab.
import { createWorld, step, epochNow, stamp, queueRows } from './core/world.js';
import { setCable, lease } from './core/sim.js';
import { createTerminal } from './ui/terminal.js';
import { createDashboard } from './ui/dashboard.js';
import { createPoolView } from './ui/poolview.js';
import { createPalette } from './ui/palette.js';
import { createTour } from './ui/tour.js';

const TICK_MS = 250;
const BANNERS = {
  storage: [
    '# demo: a simulated shell on storage, the coordinator, which has the shared drive attached.',
    '# The inventory environment is sourced (ROTA_ROOT=/srv/cluster) and the pool is started.',
    '# Try: rota pool-status    (Tab completes; type help for more)',
  ],
  worker: [
    '# demo: a shell on worker, the second host. It mounts /srv/cluster from storage and runs',
    '# jobs, but has no rota checkout. Try: ps, uptime, ls /srv/cluster',
  ],
};
const phone = matchMedia('(max-width: 759px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const app = {
  world: null, terminals: {}, dashboard: null, pool: null, speed: 10, clockRunning: true, carry: 0,
  timer: null, lastDraw: 0, lastPool: 0, lastLease: {},
};

function boot() {
  app.world = createWorld();
  for (const host of ['storage', 'worker']) {
    const body = /** @type {HTMLElement} */ (document.querySelector(`[data-shell="${host}"]`));
    body.replaceChildren();
    app.terminals[host] = createTerminal(body, app.world, host, {
      banner: BANNERS[host].map((text) => ({ text })),
      onRun: (e) => { handleEffects(e.result.effects); app.tour?.notify({ type: 'run', ...e }); redraw(true); },
    });
  }
  const dash = document.getElementById('dashboard');
  dash.replaceChildren();
  app.dashboard = createDashboard(dash, app.world);
  app.pool = createPoolView(document.getElementById('pool-view'), app.world);
  app.lastLease = {};
  fitText();
  redraw(true);
  updateCable();
}

function handleEffects(effects) {
  for (const e of effects) {
    if (e.type === 'monitor') { show('#win-monitor'); document.getElementById('dashboard').focus({ preventScroll: true }); }
    if (e.type === 'focus') { show(`#win-${e.host}`); app.terminals[e.host].input.focus({ preventScroll: true }); }
  }
}

function redraw(force) {
  const now = performance.now();
  if (force || now - app.lastDraw > 950) {
    app.dashboard.draw();
    app.lastDraw = now;
    summarize();
  }
  if (force || now - app.lastPool > 450) {
    app.pool.draw();
    app.lastPool = now;
  }
  const t = epochNow(app.world);
  document.getElementById('clock').textContent = `Simulated ${stamp(t, '%H:%M:%S')} · ${app.clockRunning ? `${app.speed}× real time` : 'clock stopped'}`;
}

/** A plain-language line for screen readers, next to the dashboard. */
function summarize() {
  const rows = queueRows(app.world).filter((r) => r.group === 0);
  const text = rows.length
    ? rows.map((r) => `Queue ${r.label.replace(/ \[.*$/, '')}: ${r.done} of ${r.total} done, ${r.state.toLowerCase()}, workers ${r.workers}.`).join(' ')
    : 'No active queues.';
  document.getElementById('dashboard-summary').textContent = `Pool ${app.world.sim.pool.state}. ${text}`;
}

function loop() {
  app.timer = null;
  if (document.hidden) return;
  if (app.clockRunning) {
    app.carry += (app.speed * TICK_MS) / 1000;
    const n = Math.floor(app.carry);
    app.carry -= n;
    if (n) {
      step(app.world, n);
      // The tour waits on a lease running out; tell it as that happens.
      for (const h of app.world.sim.hosts) {
        const expired = !h.reachable && lease(app.world.sim, h).expired;
        if (expired && !app.lastLease[h.id]) app.tour?.notify({ type: 'lease-expired', host: h.id });
        app.lastLease[h.id] = expired;
      }
      app.tour?.notify({ type: 'tick' });
      redraw(false);
    }
  }
  app.timer = setTimeout(loop, TICK_MS);
}
function resume() { if (!app.timer && !document.hidden) app.timer = setTimeout(loop, TICK_MS); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(app.timer); app.timer = null; } else resume(); });

// -- Windows --------------------------------------------------------------------------------------

const tabs = /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll('[role="tab"]')]);
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).classList.toggle('shown', on);
  }
  if (focus) tab.focus();
  redraw(true);
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
  });
});

/** Bring a window (or the element inside one) into view; on a phone, open its tab. */
function show(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  const win = el.closest('.term, .panel');
  if (phone.matches && win) {
    const tab = tabs.find((t) => t.getAttribute('aria-controls') === win.id);
    if (tab && tab.getAttribute('aria-selected') !== 'true') selectTab(tab);
  }
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}
app.show = show;

app.insert = (host, command) => {
  show(`#win-${host}`);
  app.terminals[host].insert(command);
};

app.cable = (connected) => {
  setCable(app.world.sim, 'worker', connected);
  app.world.forecastAt = -1;
  updateCable();
  app.tour?.notify({ type: connected ? 'reconnected' : 'unplugged', host: 'worker' });
  redraw(true);
};

function updateCable() {
  const out = !app.world.sim.hosts.find((h) => h.id === 'worker').reachable;
  const b = document.getElementById('cable-button');
  b.setAttribute('aria-pressed', String(out));
  b.querySelector('.cable-label').textContent = out ? 'Cable out: plug it back in' : 'Pull the network cable';
  document.getElementById('win-worker').classList.toggle('offline', out);
}
document.getElementById('cable-button').addEventListener('click', () => {
  app.cable(!app.world.sim.hosts.find((h) => h.id === 'worker').reachable);
});

// -- Controls -------------------------------------------------------------------------------------

const clockButton = document.getElementById('clock-toggle');
function setClock(running) {
  app.clockRunning = running;
  clockButton.setAttribute('aria-pressed', String(!running));
  clockButton.textContent = running ? '❚❚ Stop clock' : '▶ Start clock';
  redraw(true);
}
clockButton.addEventListener('click', () => setClock(!app.clockRunning));
function setSpeed(x) {
  app.speed = x;
  for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-speed]'))) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === x));
  redraw(true);
}
for (const b of /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-speed]'))) b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));

const textSize = /** @type {HTMLInputElement} */ (document.getElementById('text-size'));
function fitText() {
  const size = Number(textSize.value);
  document.documentElement.style.setProperty('--tty-size', `${size}px`);
  document.getElementById('text-size-value').textContent = `${size} px`;
  app.dashboard?.fit(size);
  app.dashboard && (app.dashboard.draw(), (app.lastDraw = performance.now()));
}
try { const saved = localStorage.getItem('rota-demo:text-size'); if (saved) textSize.value = saved; } catch { /* storage unavailable */ }
textSize.addEventListener('input', () => {
  fitText();
  try { localStorage.setItem('rota-demo:text-size', textSize.value); } catch { /* storage unavailable */ }
});
new ResizeObserver(() => fitText()).observe(document.getElementById('dashboard'));

document.getElementById('reset-button').addEventListener('click', () => {
  boot();
  if (app.tour.active) app.tour.start(0);
});

const palette = createPalette(document.getElementById('palette'), () => app.world, {
  choose(item) {
    if (item.action) { app.cable(item.action === 'plug'); return; }
    app.insert(item.host, item.command);
  },
});
document.getElementById('palette-button').addEventListener('click', (e) => palette.open(e.currentTarget));
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open(); }
});

// -- Start -----------------------------------------------------------------------------------------

boot();
selectTab(tabs[0]);
app.tour = createTour(document.getElementById('guide'), app);
document.getElementById('tour-button').addEventListener('click', () => app.tour.start(0));
let tourSeen = false;
try { tourSeen = localStorage.getItem('rota-demo:tour') === 'seen'; localStorage.setItem('rota-demo:tour', 'seen'); } catch { /* storage unavailable */ }
const params = new URLSearchParams(location.search);
if (params.get('tour') !== '0' && (!tourSeen || params.get('tour') === '1')) app.tour.start(0);
resume();

/** For tests and scripts: read and set the simulation. */
/** @type {any} */ (window).RotaDemo = {
  run(command, host = 'storage') {
    const r = app.terminals[host].submit(command);
    return { code: r.code, lines: r.lines.map((l) => l.text), stderr: r.lines.filter((l) => l.err).map((l) => l.text) };
  },
  advance(seconds) { step(app.world, Math.round(seconds)); redraw(true); return app.world.sim.t; },
  setSpeed, setClock,
  cable: (connected) => app.cable(connected),
  reset: () => boot(),
  dashboardText: () => app.dashboard.screen.innerText,
  state() {
    const { sim } = app.world;
    return {
      t: sim.t, epoch: epochNow(app.world), pool: sim.pool.state,
      hosts: sim.hosts.map((h) => ({ id: h.id, reachable: h.reachable, away: h.away, leaseExpired: lease(sim, h).expired, cpu: h.cpu, mem: h.mem })),
      queues: sim.queues.map((q) => ({
        runName: q.runName, batchDir: q.batchDir, lifecycle: q.lifecycle, admission: q.admission, priority: q.priority,
        blockingReason: q.blockingReason, done: q.jobs.filter((j) => j.doneMarker).length, total: q.jobs.length, retired: q.retired,
        running: Object.fromEntries(sim.hosts.map((h) => [h.id, q.jobs.filter((j) => j.host === h.id && (j.state === 'running' || (j.state === 'ended' && !j.reported))).length])),
      })),
    };
  },
  tour: { start: (i) => app.tour.start(i ?? 0), stop: () => app.tour.stop(), go: (i) => app.tour.go(i), get index() { return app.tour.index; }, get active() { return app.tour.active; } },
  get world() { return app.world; },
};
