// The `rota monitor` window: the tmux screen from core/world.js dashboard(), sized in columns to
// the window, redrawn line by line where it changed.
import { dashboard } from '../core/world.js';

const MIN_COLS = 120; // render_queue_progress.sh refuses narrower panes
const MAX_COLS = 200;

export function createDashboard(el, world) {
  const screen = document.createElement('div');
  screen.className = 'tty';
  screen.setAttribute('role', 'img');
  el.append(screen);
  const probe = document.createElement('span');
  probe.className = 'tty-probe';
  probe.textContent = '0'.repeat(100);
  probe.setAttribute('aria-hidden', 'true');
  el.append(probe);
  let shown = [];
  let cols = MIN_COLS;
  let ratio = 0.6;

  /** Columns that fit at the chosen text size; shrink the text, not the columns, below 120. */
  function fit(fontSize) {
    el.style.fontSize = `${fontSize}px`;
    probe.style.fontSize = `${fontSize}px`;
    ratio = probe.getBoundingClientRect().width / 100 / fontSize || 0.6;
    const avail = el.clientWidth - 16;
    const fitting = Math.floor(avail / (ratio * fontSize));
    if (fitting >= MIN_COLS) {
      cols = Math.min(MAX_COLS, fitting);
      screen.style.fontSize = '';
    } else {
      cols = MIN_COLS;
      // Below a readable size the window scrolls sideways instead.
      const size = Math.max(10, avail / MIN_COLS / ratio);
      screen.style.fontSize = `${Math.min(fontSize, size)}px`;
    }
  }

  function draw() {
    const d = dashboard(world, cols);
    const lines = d.lines;
    while (screen.childElementCount < lines.length) screen.append(document.createElement('div'));
    while (screen.childElementCount > lines.length) screen.lastElementChild.remove();
    lines.forEach((runs, i) => {
      const key = runs.map(([t, s]) => `${s}\u0000${t}`).join('\u0001');
      if (shown[i] === key) return;
      shown[i] = key;
      const row = screen.children[i];
      row.className = 'tty-row';
      row.replaceChildren(...runs.map(([text, style]) => {
        if (!style) return document.createTextNode(text);
        const span = document.createElement('span');
        span.className = `tty-${style}`;
        span.textContent = text;
        return span;
      }));
    });
    shown.length = lines.length;
    screen.setAttribute('aria-label', 'rota monitor dashboard: per-host CPU and memory meters, shared drive status and the queue progress table');
    return d;
  }

  return { draw, fit, get cols() { return cols; }, screen };
}
