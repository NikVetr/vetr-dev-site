// ROTA: the demo page's simulated pool, driven through window.RotaDemo in headless Chromium. Queues A and B
// share both hosts at priority 50; then `rota set-priority` raises B to 90, and as A's jobs finish, each freed
// CPU unit goes to B while A's running jobs carry on. Each frame pairs the storage shell and the dashboard's own
// queue rows (read from the page) with the hosts' CPU units, coloured by queue as the page's pool view draws
// them. The still is the moment after the command, with B already taking slots.
import { openPage } from '../browser.mjs';
import { art, esc, flipbook, INK, PAPER } from '../svg.mjs';

const PERIOD = 9;
const COLORS = { a: '#4fb6d8', b: '#f0a04b' };
const SUBMIT = (file, run, mem) => `rota submit --model_dir /srv/cluster/projects/my-analysis --queue ${file} --project my-analysis --run_name ${run} --cpu_units_per_job 1 --memory_mib_per_job ${mem}`;

/** What one frame shows, read from the page. */
async function capture(page) {
  return page.evaluate(() => {
    const demo = /** @type {any} */ (window).RotaDemo;
    const { sim } = demo.world;
    const hosts = sim.hosts.map((/** @type {any} */ h) => {
      const cells = Array.from({ length: h.cpu }, () => null);
      for (const q of sim.queues) {
        for (const j of q.jobs) {
          if (j.host !== h.id || j.state !== 'running') continue;
          for (const c of j.cells) cells[c] = { key: q.runName.toLowerCase(), p: Math.min(1, (sim.t - j.start) / j.duration) };
        }
      }
      return { id: h.id, cells };
    });
    // The dashboard's ACTIVE rows: Queue | Project | Workers | Priority | Admission | ...
    const rows = [...document.querySelectorAll('#dashboard .tty-row')].map((r) => r.textContent ?? '');
    const start = rows.findIndex((r) => r.startsWith('-- ACTIVE --'));
    const active = [];
    for (let i = start + 1; i < rows.length && !rows[i].startsWith('TOTAL'); i++) {
      const cols = rows[i].split('|').map((c) => c.trim());
      active.push({ queue: cols[0], workers: cols[2], priority: cols[3], admission: cols[4] });
    }
    return { hosts, active };
  });
}

export async function build() {
  const { page, errors, close } = await openPage('rota/?tour=0', { width: 1440, height: 900, scheme: 'dark' });
  const frames = [];
  try {
    const run = (/** @type {string} */ c) => page.evaluate((cmd) => /** @type {any} */ (window).RotaDemo.run(cmd), c);
    const advance = (/** @type {number} */ s) => page.evaluate((n) => /** @type {any} */ (window).RotaDemo.advance(n), s);
    await page.evaluate(() => /** @type {any} */ (window).RotaDemo.setClock(false));
    await run(SUBMIT('a.txt', 'A', 1024));
    await advance(120);
    const b = await run(SUBMIT('b.txt', 'B', 1536));
    const batch = b.lines.find((/** @type {string} */ l) => l.startsWith('batch_dir=')).slice('batch_dir='.length);
    await advance(480);
    const equal = await capture(page);
    await run(`rota set-priority --batch_dir ${batch} --schedule_priority 90`);
    for (const s of [70, 90, 110]) {
      await advance(s);
      frames.push(await capture(page));
    }
    frames.push(equal);
    if (errors.length) throw new Error(`rota: ${errors.join('; ')}`);
  } finally {
    await close();
  }
  if (frames[2].active[0]?.queue !== 'B') throw new Error('rota: expected B to lead after the priority change');

  // One HTML composition per frame, sized with container units so it fills whatever well the tile gets:
  // the shell and the dashboard's rows beside the two hosts, or, in a short wide well, the command across
  // the top and both hosts' CPU units in one strip.
  const cell = (/** @type {any} */ c) => (c
    ? `<span class="cell q-${c.key}"><i style="height:${Math.round(c.p * 100)}%"></i><b>${esc(c.key.toUpperCase())}</b></span>`
    : '<span class="cell"></span>');
  const host = (/** @type {any} */ h) => `<div class="host"><p><b>${esc(h.id)}</b><span>${h.cells.length} CPU</span></p><div class="cells n${h.cells.length}">${h.cells.map(cell).join('')}</div></div>`;
  const frame = (/** @type {any} */ f, k, caption) => {
    const typed = k < 3;
    const command = typed
      ? ['$ rota set-priority', '    --batch_dir "$B"', '    --schedule_priority 90']
      : ['$ rota submit ... --run_name B', '  (priority 50 by default)', '$ ▉'];
    const line = typed ? '$ rota set-priority --batch_dir "$B" --schedule_priority 90' : '$ rota submit ... --run_name B   (priority 50)';
    const table = [`${'Queue'.padEnd(6)}${'Workers'.padEnd(8)}${'Priority'.padEnd(9)}Admission`,
      ...f.active.slice(0, 2).map((r) => `${r.queue.padEnd(6)}${r.workers.padEnd(8)}${r.priority.padEnd(9)}${r.admission}`)];
    return `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="rc"><div class="in">
<div class="term"><p class="bar"><i></i><i></i><i></i><span>storage</span></p><pre class="cmd">${esc(command.join('\n'))}</pre><pre class="line">${esc(line)}</pre>
<p class="mon">rota monitor: QUEUE PROGRESS</p><pre class="tbl"><span class="head">${esc(table[0])}</span>\n${esc(table.slice(1).join('\n'))}</pre></div>
<div class="hosts">${f.hosts.map(host).join('')}</div>
<p class="caption">${esc(caption)}</p></div></div></foreignObject>`;
  };
  const book = flipbook('rota', [
    frame(frames[0], 0, 'B at priority 90 takes each slot that frees up'),
    frame(frames[1], 1, 'A’s running jobs are never stopped'),
    frame(frames[2], 2, 'As A’s jobs finish, B gets the hosts'),
    frame(frames[3], 3, 'A and B at priority 50 share the slots'),
  ], PERIOD);
  const u = (h, w) => `min(${h}cqh, ${w}cqw)`;
  return art({
    name: 'rota', responsive: true, period: PERIOD, frames: book.frames, body: book.body,
    css: `${book.css}
& .rc { box-sizing: border-box; width: 100%; height: 100%; container-type: size; background: ${PAPER}; color: #e6eaf2; overflow: hidden;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
& .in { box-sizing: border-box; width: 100%; height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.04fr);
  grid-template-rows: minmax(0, 1fr) auto; gap: ${u(3, 1.8)} ${u(3, 2)}; padding: ${u(3, 1.8)}; }
& .rc p, & .rc pre { margin: 0; }
& .term { background: #0a0d12; border: 1.5px solid #2a3344; border-radius: ${u(4.5, 2.5)}; padding: ${u(3.2, 1.8)} ${u(4, 2.2)}; display: flex; flex-direction: column; gap: ${u(2.4, 1.3)}; min-width: 0; }
& .bar { display: flex; align-items: center; gap: ${u(1.6, 0.9)}; font: 600 ${u(4, 2.2)} system-ui, sans-serif; color: #8b95a7; }
& .bar i { width: ${u(3.2, 1.8)}; height: ${u(3.2, 1.8)}; border-radius: 50%; background: #ff5f57; }
& .bar i:nth-child(2) { background: #febc2e; } & .bar i:nth-child(3) { background: #28c840; }
& .cmd { font-size: ${u(4.6, 2.5)}; line-height: 1.4; white-space: pre; }
& .line { display: none; font-size: ${u(7, 1.75)}; white-space: pre; }
& .mon { margin-top: auto !important; font: 600 ${u(3.8, 2.1)} system-ui, sans-serif; color: #8b95a7; }
& .tbl { font-size: ${u(3.9, 2.1)}; line-height: 1.45; color: #afd7ff; white-space: pre; }
& .tbl .head { color: #808080; }
& .hosts { display: grid; gap: ${u(3, 1.7)}; align-content: start; min-width: 0; }
& .host { background: #1b2230; border: 1.5px solid #2a3344; border-radius: ${u(4.5, 2.5)}; padding: ${u(2.6, 1.5)} ${u(3.2, 1.8)}; }
& .host p { display: flex; justify-content: space-between; align-items: baseline; font: 700 ${u(5, 2.8)} system-ui, sans-serif; margin-bottom: ${u(2, 1.1)} !important; }
& .host p span { font-weight: 400; font-size: 0.75em; color: #8b95a7; }
& .cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: ${u(2.2, 1.2)}; }
& .cell { position: relative; aspect-ratio: 1; max-height: ${u(14, 8)}; border-radius: 18%; border: 1.5px solid #2a3344; background: #151b25; overflow: hidden; }
& .cell.q-a { --c: ${COLORS.a}; } & .cell.q-b { --c: ${COLORS.b}; }
& .cell[class*="q-"] { border-color: var(--c); background: color-mix(in srgb, var(--c) 22%, #151b25); }
& .cell i { position: absolute; left: 0; bottom: 0; width: 100%; background: var(--c); opacity: .9; }
& .cell b { position: absolute; inset: 0; display: grid; place-items: center; font-size: ${u(5, 2.6)}; color: #fff; text-shadow: 0 0 2px #000, 0 0 3px #000; }
& .caption { grid-column: 1 / -1; text-align: center; font: 600 ${u(5.2, 2.9)} system-ui, sans-serif; color: ${INK}; }
@container (min-aspect-ratio: 5 / 2) {
  & .in { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) auto; gap: ${u(3, 0.8)}; }
  & .term { flex-direction: row; align-items: center; padding: ${u(3, 1)} ${u(4, 1.4)}; }
  & .cmd, & .mon, & .tbl { display: none; }
  & .line { display: block; }
  & .hosts { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-content: stretch; }
  & .host { display: flex; flex-direction: column; justify-content: center; padding: ${u(2.5, 0.6)} ${u(3, 0.9)}; }
  & .host p { margin-bottom: ${u(2, 0.4)} !important; }
  & .cell { max-height: ${u(30, 6)}; }
  & .cells.n8 { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  & .host p { font-size: ${u(9, 1.9)}; }
  & .cell b { font-size: ${u(9, 1.6)}; }
  & .caption { font-size: ${u(9, 1.9)}; }
}`,
    loop: book.loop,
  });
}
