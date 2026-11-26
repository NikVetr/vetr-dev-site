// Regenerate tests/fixtures/ from ROTA's own renderers, which are pure: render_queue_progress.sh
// (awk over a TSV), monitor_cpu.py render() and monitor_linux.py memory_lines(). No scheduler
// runs. Needs a ROTA checkout: ROTA_PUBLIC=~/path/to/rota node rota/tests/capture-fixtures.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const rota = process.env.ROTA_PUBLIC;
if (!rota) throw new Error('Set ROTA_PUBLIC to a checkout of github.com/NikVetr/rota');
const scratch = mkdtempSync(path.join(tmpdir(), 'rota-fixtures-'));
for (const f of ['render_queue_progress.sh', 'monitor_cpu.py', 'monitor_linux.py']) cpSync(path.join(rota, 'monitor', f), path.join(scratch, f));
const fixtures = new URL('./fixtures/', import.meta.url);

// Queue table: three row sets at four widths, colours parsed from the ANSI output.
const stamp = '2026/11/25 | 14:05';
const row = (o) => ({ group: 0, state: 'RUNNING', label: 'A [b00001]', workers: '2-6 P50', done: 4, total: 40, elapsed: 600, eta: 1500,
  pct: 10, startTxt: stamp, endTxt: '', project: 'my-analysis', failed: 0, failedWhen: '', rerun: 0, etaWarning: '-', ...o });
const cases = {
  two: [row({}), row({ label: 'B [b00002]', workers: '1-1 P90 CPU', done: 0, total: 24, pct: 0, eta: -1 }),
    row({ group: 1, state: 'COMPLETED', label: 'pilot [b00001]', workers: '0-0 P50 EMPTY', done: 2, total: 2, pct: 100, eta: -1, elapsed: 7, endTxt: stamp })],
  holds: [row({ workers: '2-3 P50 FAIL', failed: 2, failedWhen: '14:20' }), row({ label: 'B [b00002]', workers: '0-0 P90 PAUSED', state: 'PENDING' }),
    row({ label: 'C [b00003]', workers: '0-0 P50 DEP', state: 'PENDING', done: 0, total: 6, pct: 0, eta: -1 }),
    row({ group: 1, state: 'FINISHED_INCOMPLETE', label: 'D [b00004]', workers: '0-0 P50 EMPTY', done: 5, total: 6, pct: 83.3, eta: -1, failed: 1, failedWhen: '13:00', endTxt: stamp })],
  verify: [row({ label: 'C [b00003]', workers: '0-0 P50 VERIFY', state: 'PENDING', done: 0, total: 6, pct: 0, eta: -1 }),
    row({ label: 'B [b00002]', workers: '4-8 P90*', done: 12, total: 24, pct: 50, eta: 300, etaWarning: 'recent_slower' })],
};
const tsv = (rows) => rows.map((r) => [r.group, 0, 0, 1795700000, r.state, r.label, r.workers, r.done, r.total, r.elapsed, r.eta,
  r.pct.toFixed(1), r.startTxt, 1795700000, r.endTxt, 'srv/cluster/projects/my-analysis/queues/a.txt', 'tag', r.project,
  r.failed, r.failedWhen, r.rerun, r.etaWarning].join('\t') + '\n').join('');
const ANSI = { 153: 'run', 187: 'done', 217: 'killed', 180: 'unknown', 120: 'summary', 244: 'fade', 203: 'failed' };
function parseAnsi(text) {
  return text.replace(/\n$/, '').split('\n').map((line) => {
    const runs = [];
    let style = '';
    for (const part of line.replace(/\x1b\[K/g, '').split(/(\x1b\[[0-9;]*m)/)) {
      const m = /^\x1b\[([0-9;]*)m$/.exec(part);
      if (m) { style = m[1] === '0' ? '' : ANSI[m[1].split(';').pop()] ?? style; continue; }
      if (!part) continue;
      if (runs.length && runs[runs.length - 1][1] === style) runs[runs.length - 1][0] += part; else runs.push([part, style]);
    }
    return runs.filter(([t, s], i) => !(i === runs.length - 1 && s === '' && !t.trim()));
  });
}
const queue = {};
for (const [name, rows] of Object.entries(cases)) {
  for (const cols of [120, 132, 157, 190]) {
    writeFileSync(path.join(scratch, 'q.tsv'), tsv(rows));
    const out = execFileSync('bash', [path.join(scratch, 'render_queue_progress.sh'), '--data_file', path.join(scratch, 'q.tsv'), '--term_cols', String(cols), '--color'], { encoding: 'utf8' });
    queue[`${name}@${cols}`] = { rows, cols, lines: parseAnsi(out) };
  }
}
writeFileSync(new URL('queue-progress.json', fixtures), JSON.stringify(queue, null, 1) + '\n');

// CPU meters and Linux memory lines.
const meters = execFileSync('python3', ['-c', `
import sys, json; sys.path.insert(0, sys.argv[1])
import monitor_cpu, monitor_linux
cases = []
for n, w, h in [(4, 62, 4), (8, 62, 4), (8, 40, 4), (4, 20, 4), (8, 12, 4)]:
    vals = [(0.9 if i % 3 else 0.02, 0.05 if i % 2 else 0.01) for i in range(n)]
    cases.append({'values': vals, 'width': w, 'height': h, 'lines': monitor_cpu.render(vals, w, h)})
mem = []
for total, used, cache in [(8, 3.1, 1.2), (16, 6.2, 2.0), (16, 14.9, 0.3)]:
    g = 1024 ** 3
    d = dict(total=total * g, used=used * g, available=(total - used) * g, cache=cache * g, swap=0)
    mem.append({'data': d, 'width': 26, 'lines': monitor_linux.memory_lines(d, 26, '0.00%')})
print(json.dumps({'cpu': cases, 'memory': mem}, indent=1))
`, scratch], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
writeFileSync(new URL('meters.json', fixtures), meters);
rmSync(scratch, { recursive: true });
console.log('wrote', new URL('.', fixtures).pathname);
