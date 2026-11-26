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

  const mono = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
  const cell = (/** @type {any} */ c, x, y) => {
    if (!c) return `<rect x="${x}" y="${y}" width="22" height="22" rx="4" fill="#151b25" stroke="#2a3344" stroke-width="1.5"/>`;
    const col = COLORS[c.key] ?? '#7fd46b';
    const h = Math.round(22 * c.p);
    return `<rect x="${x}" y="${y}" width="22" height="22" rx="4" fill="${col}" fill-opacity=".2" stroke="${col}" stroke-width="1.5"/>`
      + `<rect x="${x + 0.75}" y="${y + 22 - h}" width="20.5" height="${h}" fill="${col}" opacity=".9"/>`
      + `<text x="${x + 11}" y="${y + 15}" class="letter">${esc(c.key.toUpperCase())}</text>`;
  };
  const host = (/** @type {any} */ h, x, y) => {
    const perRow = 4;
    const rows = Math.ceil(h.cells.length / perRow);
    const height = 22 + rows * 26;
    return `<rect x="${x}" y="${y}" width="150" height="${height}" rx="8" fill="#1b2230" stroke="#2a3344" stroke-width="1.5"/>`
      + `<text x="${x + 9}" y="${y + 14}" class="host">${esc(h.id)}</text>`
      + `<text x="${x + 141}" y="${y + 14}" class="units">${h.cells.length} CPU</text>`
      + h.cells.map((c, i) => cell(c, x + 9 + (i % perRow) * 34, y + 20 + Math.floor(i / perRow) * 26)).join('');
  };
  const typed = (k) => k < 3;
  const frame = (/** @type {any} */ f, k, caption) => {
    // xml:space keeps the command's continuation indents and the table's columns.
    const command = typed(k)
      ? ['$ rota set-priority', '   --batch_dir "$B"', '   --schedule_priority 90']
      : ['$ rota submit ... --run_name B', '   (priority 50 by default)', '$ ▉'];
    const rows = f.active.slice(0, 2).map((r, i) => `<text x="12" y="${118 + i * 11}" class="row" xml:space="preserve">${esc(`${r.queue.padEnd(6)}${r.workers.padEnd(8)}${r.priority.padEnd(9)}${r.admission}`)}</text>`).join('');
    return `<rect width="320" height="180" fill="${PAPER}"/>
<rect x="5" y="5" width="149" height="146" rx="8" fill="#0a0d12" stroke="#2a3344" stroke-width="1.5"/>
<circle cx="14" cy="13" r="2.6" fill="#ff5f57"/><circle cx="22" cy="13" r="2.6" fill="#febc2e"/><circle cx="30" cy="13" r="2.6" fill="#28c840"/>
<text x="38" y="15.5" class="title">storage</text>
${command.map((line, i) => `<text x="12" y="${33 + i * 11}" class="cmd" xml:space="preserve">${esc(line)}</text>`).join('')}
<text x="12" y="${92}" class="title">rota monitor: QUEUE PROGRESS</text>
<text x="12" y="${105}" class="head" xml:space="preserve">${esc(`${'Queue'.padEnd(6)}${'Workers'.padEnd(8)}${'Priority'.padEnd(9)}Admission`)}</text>
${rows}
${host(f.hosts[0], 164, 5)}
${host(f.hosts[1], 164, 59)}
<text x="160" y="172" class="caption" text-anchor="middle">${esc(caption)}</text>`;
  };
  const book = flipbook('rota', [
    frame(frames[0], 0, 'B at priority 90 takes each slot that frees up'),
    frame(frames[1], 1, 'A’s running jobs are never stopped'),
    frame(frames[2], 2, 'As A’s jobs finish, B gets the hosts'),
    frame(frames[3], 3, 'A and B at priority 50 share the slots'),
  ], PERIOD);
  return art({
    name: 'rota', period: PERIOD, frames: book.frames, body: book.body,
    css: `${book.css}
& text { font-family: ${mono}; }
& .title { font: 600 6.5px system-ui,sans-serif; fill: #8b95a7; }
& .cmd { font-size: 7.4px; fill: #e6eaf2; white-space: pre; }
& .head { font-size: 6.4px; fill: #808080; white-space: pre; }
& .row { font-size: 6.4px; fill: #afd7ff; white-space: pre; }
& .host { font: 700 8.5px system-ui,sans-serif; fill: #e6eaf2; }
& .units { font: 6.5px system-ui,sans-serif; fill: #8b95a7; text-anchor: end; }
& .letter { font-size: 9px; font-weight: 700; fill: #fff; text-anchor: middle; paint-order: stroke; stroke: #0d1117; stroke-width: 2px; }
& .caption { font: 600 8.6px system-ui,sans-serif; fill: ${INK}; }`,
    loop: book.loop,
  });
}
