// The `rota monitor` dashboard as text: ports of ROTA's pane renderers and the tmux layout
// around them. A line is an array of [text, style] runs; style names a colour of the 256-colour
// palette the real scripts use (see style.css, .tty-*), or '' for the default.
//   monitor/render_queue_progress.sh  queueProgress()
//   monitor/monitor_cpu.py render()   cpuMeters()
//   monitor/monitor_linux.py          memoryLines()
//   monitor/monitor_cluster_io.sh     clusterIo()
//   monitor/monitor_mount_status.sh   mountLines()
//   monitor/start_tmux_monitoring.sh  composeDashboard() (pane sizes, borders, titles, status)

const plain = (text) => [[text, '']];
/** Python's round(): halves go to the even neighbour. */
export const pyRound = (x) => (Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x));

// -- QUEUE PROGRESS (render_queue_progress.sh) ---------------------------------------------

const trunc = (s, m) => (s.length <= m ? s : s.slice(0, m - 1) + '~');
const pad = (s, w) => trunc(s, w).padEnd(w);
const projectLabel = (s) => (s.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) ? s : '?');
const PRIORITY_TOKEN = / P-?[0-9]+[*]?( |$)/;

export function dur(sec) {
  if (sec < 0) return 'n/a';
  if (sec >= 86400) return `${(sec / 86400).toFixed(2)}d`;
  if (sec >= 3600) return `${(sec / 3600).toFixed(2)}h`;
  if (sec >= 60) return `${Math.trunc(sec / 60)}m`;
  return `${Math.trunc(sec)}s`;
}
function dynamicInfo(s) {
  if (s === 'adaptive:n/a') return 'n/a';
  const m = PRIORITY_TOKEN.exec(s);
  return m ? s.slice(m.index + 1) : '';
}
function workerCounts(s) {
  if (s === 'adaptive:n/a') return '?';
  const m = PRIORITY_TOKEN.exec(s);
  return m ? s.slice(0, m.index) : s;
}
function priorityInfo(s) {
  if (s === 'n/a') return '?';
  const m = /^P-?[0-9]+[*]?/.exec(s);
  return m ? m[0].slice(1) : '-';
}
const HOLD_LABELS = {
  PAUSED: 'Paused', DRAIN: 'Draining', CLOSED: 'Closed', WAIT: 'Wait', EMPTY: 'No pending', DEP: 'Dependency',
  DEPFAIL: 'Dep failed', VERIFY: 'Verify deps', DEPMISSING: 'Dep missing', IO: 'I/O wait', CPU: 'CPU wait',
  RAM: 'RAM wait', FAIL: 'Failure hold', HOST: 'Host wait', CAP: 'Worker cap', 'SMB!': 'SMB stuck', SMB: 'SMB wait',
  STALE: 'Stale',
};
function admissionInfo(s) {
  if (s === '') return '-';
  if (s === 'n/a') return 'Unknown';
  const hold = s.replace(/^P-?[0-9]+[*]?\s*/, '');
  return hold === '' ? 'Ready' : HOLD_LABELS[hold] ?? hold;
}
function runningCount(s, state) {
  if (state === 'UNKNOWN') return -1;
  if (/^[0-9]+ run( |$)/.test(s)) return parseInt(s, 10);
  let count = 0, known = false;
  for (const part of s.split('-')) if (/^[0-9]+$/.test(part)) { count += +part; known = true; }
  return known ? count : -1;
}
function makeProgress(done, total, pct, cells) {
  if (total > 0) {
    const filled = Math.max(0, Math.min(cells, Math.floor((pct / 100) * cells + 0.5)));
    return `[${'#'.repeat(filled)}${'-'.repeat(cells - filled)}${pct.toFixed(1)}%]`;
  }
  return `[${'.'.repeat(cells)}${done > 0 ? 'n/a' : '0.0%'}]`;
}
const completionCount = (done, total) => (total > 0 ? `(${done} / ${total})` : `(${done} / ?)`);
function failedText(failed, when, rerun, style) {
  if (failed > 0) return style === 0 ? `!${failed}` : `${failed} failed${style === 2 && when ? ` ${when}` : ''}`;
  return rerun > 0 && style > 0 ? `${rerun} rerun` : '';
}
function completeText(done, total, failed, when, rerun, style) {
  const note = failedText(failed, when, rerun, style);
  return completionCount(done, total) + (note ? ` ${note}` : '');
}

/** Replace the first literal occurrence of `part` in a coloured run list with another colour. */
function recolor(runs, part, style, after) {
  if (!part) return runs;
  const [text] = runs[0];
  const at = text.indexOf(part);
  if (at < 0) return runs;
  return [[text.slice(0, at), runs[0][1]], [part, style], [text.slice(at + part.length), after ?? runs[0][1]]];
}

/**
 * Render queue rows (the collected TSV's columns, as objects) for a pane `termCols` wide.
 * A row: {group, state, label, workers, done, total, elapsed, eta, pct, startTxt, endTxt,
 * project, failed, failedWhen, rerun, etaWarning}. Returns lines, or throws if too narrow.
 */
export function queueProgress(input, termCols) {
  if (!input.length) return [plain('Queue Progress: no queues match the history selection.')];
  if (termCols < 120) throw new Error('--term_cols must be an integer between 120 and 1000');
  const rows = input.map((r) => {
    const dynamic = dynamicInfo(r.workers);
    return {
      ...r, label: r.label.replace(/ \[b[0-9]+\]$/, ''), workers: workerCounts(r.workers), dynamic,
      priority: priorityInfo(dynamic), admission: admissionInfo(dynamic), project: projectLabel(r.project),
    };
  });
  const maxOf = (f) => Math.max(0, ...rows.map(f));
  const maxCount = [0, 1, 2].map((style) => maxOf((r) => completeText(r.done, r.total, r.failed, r.failedWhen, r.rerun, style).length));
  const active = rows.filter((r) => r.group === 0);
  let activeWorkers = 0, activeUnknown = false, activeFailed = 0, hostCount = 0;
  const hostWorkers = [], hostUnknown = [];
  for (const r of active) {
    r.rank = runningCount(r.workers, r.state);
    activeFailed += r.failed;
    const stale = r.state === 'UNKNOWN' && r.dynamic !== '';
    const parts = r.workers.replace(/ .*/, '').split('-');
    hostCount = Math.max(hostCount, parts.length);
    parts.forEach((part, i) => {
      if (part === '.') return;
      if (/^[0-9]+$/.test(part) && !stale) {
        activeWorkers += +part;
        hostWorkers[i] = (hostWorkers[i] ?? 0) + +part;
      } else {
        activeUnknown = true;
        hostUnknown[i] = true;
      }
    });
  }
  const ranked = (r) => r.group === 0 && /^-?[0-9]+[*]?$/.test(r.priority) && /^(RUNNING|PENDING|DRAINING|UNKNOWN)$/.test(r.state);
  const scores = new Set(active.filter(ranked).map((r) => parseInt(r.priority, 10)));
  for (const r of rows) {
    if (ranked(r)) r.priority += ` (#${1 + [...scores].filter((s) => s > parseInt(r.priority, 10)).length})`;
  }
  // Stable sort of active rows by running workers, descending; history order stays intact.
  const sortedActive = active.map((r, i) => [r, i]).sort((a, b) => b[0].rank - a[0].rank || a[1] - b[1]).map(([r]) => r);
  let k = 0;
  const display = rows.map((r) => (r.group === 0 ? sortedActive[k++] : r));
  const vector = () => Array.from({ length: hostCount }, (_, i) => (hostUnknown[i]
    ? (hostWorkers[i] > 0 ? `${hostWorkers[i]}+?` : '?') : String(hostWorkers[i] ?? 0))).join('-');

  const layoutCols = termCols - 1;
  let sep = termCols >= 180 ? '  |  ' : termCols >= 157 ? ' | ' : '|';
  const workersW = Math.max(7, maxOf((r) => r.workers.length), vector().length);
  const priorityW = Math.max(8, maxOf((r) => r.priority.length));
  const admissionW = Math.max(9, maxOf((r) => r.admission.length));
  let startW = 11, failedStyle = 2, maxCountSeen = maxCount[2];
  let countW = maxCountSeen > 14 ? maxCountSeen : 14;
  let elapsedW = 8, timeW = 11;
  const stateW = 12;
  let fixed = workersW + priorityW + admissionW + startW + countW + elapsedW + timeW + stateW;
  while (sep.length > 1 && layoutCols - fixed - 10 * sep.length < 50) sep = sep.length === 5 ? ' | ' : '|';
  const sepTotal = 10 * sep.length;
  let flexible = layoutCols - fixed - sepTotal;
  let compact = false;
  if (flexible < 36) {
    compact = true;
    startW = 5; timeW = 7; elapsedW = 6;
    countW = maxCountSeen > 11 ? maxCountSeen : 11;
    fixed = workersW + priorityW + admissionW + startW + countW + elapsedW + timeW + stateW;
    flexible = layoutCols - fixed - sepTotal;
  }
  if (compact && flexible === 26) { timeW--; flexible++; }
  while (flexible < 24 && failedStyle > 0) {
    maxCountSeen = maxCount[--failedStyle];
    const countMin = compact ? 11 : 14;
    flexible += countW;
    countW = maxCountSeen > countMin ? maxCountSeen : countMin;
    flexible -= countW;
  }
  if (flexible < 24) throw new Error(`Terminal too narrow for complete worker counts; use --term_cols ${termCols + 24 - flexible} or more.`);
  let labelW = 14;
  const maxProject = maxOf((r) => r.project.length);
  const projectGoal = Math.max(7, Math.min(maxProject, 30));
  let projectW = Math.min(projectGoal, 20);
  let progressW = 16;
  if (flexible < labelW + projectW + progressW) {
    labelW = Math.min(12, flexible - 15);
    projectW = 7;
    progressW = Math.min(16, flexible - labelW - projectW);
  }
  let extra = flexible - labelW - projectW - progressW;
  const labelGoal = Math.max(labelW, Math.min(160, maxOf((r) => r.label.length)));
  while (extra > 0) {
    let changed = false;
    if (projectW < projectGoal && extra > 0) { projectW++; extra--; changed = true; }
    if (labelW < labelGoal && extra > 0) { labelW++; extra--; changed = true; }
    if (projectW < projectGoal && extra > 0) { projectW++; extra--; changed = true; }
    if (progressW < 40 && extra > 0) { progressW++; extra--; changed = true; }
    if (!changed) break;
  }
  const progressCells = Math.max(0, progressW - 8);
  const rowText = (...c) => [pad(c[0], labelW), pad(c[1], projectW), pad(c[2], workersW), pad(c[3], priorityW),
    pad(c[4], admissionW), pad(c[5], startW), pad(c[6], progressW), pad(c[7], countW), pad(c[8], elapsedW),
    pad(c[9], timeW), pad(c[10], stateW)].join(sep);

  const out = [];
  const header = rowText('Queue', 'Project', 'Workers', 'Priority', 'Admission', 'Start', 'Progress', 'Complete', 'Elapsed', 'ETA/End', 'State');
  out.push(plain(header), plain('-'.repeat(header.length)));
  const summary = () => {
    if (!active.length) return;
    const workerTxt = activeUnknown && activeWorkers === 0 ? '? workers' : `${activeWorkers}${activeUnknown ? '+' : ''} workers`;
    const failedTxt = activeFailed > 0 ? `${activeFailed} job${activeFailed === 1 ? '' : 's'} failed` : '';
    const row = rowText(labelW < 12 ? 'TOTAL' : 'TOTAL ACTIVE', '', vector(), '', '', '', failedTxt, workerTxt, '', '', `[${active.length} queues]`);
    out.push(recolor([[row, 'summary']], trunc(failedTxt, progressW), 'failed'));
  };
  let previous = -1;
  display.forEach((r, index) => {
    if (r.group !== previous) {
      if (previous === 0) summary();
      if (index > 0) out.push(plain(''));
      const section = r.group === 0 ? 'ACTIVE' : r.group === 1 ? 'LAST 24 HOURS' : 'EARLIER (5 MOST RECENT)';
      out.push([[`-- ${section} --`, 'fade']]);
      previous = r.group;
    }
    let startShort = `${r.startTxt.slice(5, 10)} ${r.startTxt.slice(13, 18)}`;
    let endShort = r.endTxt ? `${r.endTxt.slice(5, 10)} ${r.endTxt.slice(13, 18)}` : '';
    if (compact) { startShort = r.startTxt.slice(13, 18); endShort = r.endTxt.slice(13, 18); }
    const progress = makeProgress(r.done, r.total, r.pct, progressCells);
    const failed = failedText(r.failed, r.failedWhen, r.rerun, failedStyle);
    const complete = completeText(r.done, r.total, r.failed, r.failedWhen, r.rerun, failedStyle);
    let etaEnd = endShort;
    if (r.group === 0) {
      etaEnd = /^(RUNNING|DRAINING|PENDING)$/.test(r.state) && r.eta >= 0 ? dur(r.eta) : '';
      if (etaEnd && /^(recent_slower|recent_faster|long_running)$/.test(r.etaWarning)) etaEnd += '?';
    }
    const stateTxt = `[${r.state === 'FINISHED_INCOMPLETE' ? 'INCOMPLETE' : r.state}]`;
    const row = rowText(r.label, r.project, r.workers, r.priority, r.admission, startShort, progress, complete, dur(r.elapsed), etaEnd, stateTxt);
    const color = /^(RUNNING|PENDING|DRAINING)$/.test(r.state) ? 'run'
      : /^(KILLED|FAILED|FINISHED_INCOMPLETE)$/.test(r.state) ? 'killed' : r.state === 'UNKNOWN' ? 'unknown' : 'done';
    const pctTxt = r.total > 0 ? `${r.pct.toFixed(1)}%` : r.done > 0 ? 'n/a' : '0.0%';
    let runs = recolor([[row, color]], pctTxt, 'fade', color);
    if (failed) {
      const last = runs.length - 1;
      const tail = recolor([runs[last]], failed, r.failed > 0 ? 'failed' : 'fade', color);
      runs = [...runs.slice(0, last), ...tail];
    }
    out.push(runs.filter(([t]) => t));
  });
  if (previous === 0) summary();
  return out;
}

// -- CPU and memory (monitor_cpu.py, monitor_linux.py) --------------------------------------

/** Column-major packing maximizes meter width without hiding cores. `values`: [user, system]. */
export function cpuMeters(values, width, height) {
  const count = values.length;
  const columns = Math.ceil(count / height);
  const rows = Math.ceil(count / columns);
  const cellWidth = Math.floor((width - columns + 1) / columns);
  const extra = (width - columns + 1) % columns;
  const digits = String(count).length;
  const bars = cellWidth >= digits + 9;
  if (cellWidth < digits + 5) return ['Resize to show all CPU cores'.slice(0, width)];
  const lines = [];
  for (let row = 0; row < rows; row++) {
    const cells = [];
    for (let column = 0; column < columns; column++) {
      const index = column * rows + row;
      if (index >= count) break;
      const size = cellWidth + (column < extra ? 1 : 0);
      const [user, system] = values[index];
      const percent = (user + system) * 100;
      const label = String(index + 1).padStart(digits);
      if (bars) {
        const length = size - digits - 8;
        const used = Math.min(length, pyRound((user + system) * length));
        const sys = Math.min(used, pyRound(system * length));
        cells.push(`${label}[${'#'.repeat(used - sys)}${'*'.repeat(sys)}${' '.repeat(length - used)}${percent.toFixed(1).padStart(5)}%]`);
      } else {
        cells.push(`${label}:${percent.toFixed(0).padStart(3)}%`.padEnd(size));
      }
    }
    lines.push(cells.join(' '));
  }
  return lines;
}

export const totalPercent = (values) => pyRound((100 * values.reduce((s, [u, y]) => s + u + y, 0)) / values.length);

/** One Linux host's MEM pane. Sizes in bytes. */
export function memoryLines({ total, used, available, cache, swap }, width, pressure) {
  const gib = 1024 ** 3;
  const percent = pyRound((100 * used) / total);
  const prefix = `${(total / gib).toFixed(0)}G[`;
  const suffix = `${String(percent).padStart(3)}%]`;
  const cells = Math.max(0, width - prefix.length - suffix.length);
  const filled = pyRound((cells * percent) / 100);
  return [
    prefix + '#'.repeat(filled) + ' '.repeat(cells - filled) + suffix,
    `Used:${(used / gib).toFixed(1)}G Cache:${(cache / gib).toFixed(1)}G`,
    `Avail:${(available / gib).toFixed(1)} Swap:${(swap / gib).toFixed(1)}G`,
    `PSI some: ${pressure}`,
  ].map((line) => line.slice(0, width));
}

/** monitor_snapshot.py: why a host's pane has no meters. */
export function wrapText(message, width, height) {
  const words = message.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, height);
}

// -- CLUSTER I/O (monitor_cluster_io.sh) ----------------------------------------------------

function humanMib(mib) {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)}G` : `${mib}M`;
}

/**
 * The coordinator's I/O panel. Lines carry a priority (1 = keep longest); the least important,
 * bottom-most first, drop until the panel fits `rows`.
 */
export function clusterIo(f, rows) {
  const lines = [];
  const add = (priority, runs) => lines.push({ priority, runs });
  if (f.poolState === 'INACTIVE') {
    add(1, [['POOL inactive', 'label']]);
  } else {
    add(1, [[`POOL ${f.poolState}`, 'label']]);
    if (f.poolState === 'DRAINING') add(1, [[' ', ''], ['New starts OFF (draining)', 'warn']]);
    else add(9, plain(' New starts per queue admission'));
    add(7, [[' Capacity ', ''], [`${f.liveCpu} CPU / ${humanMib(f.liveMemory)}`, 'value']]);
    const resourceColor = f.resourceState === 'degraded' ? 'warn' : f.resourceState === 'unavailable' ? 'bad' : 'good';
    add(7, [[' Resources ', ''], [f.resourceState, resourceColor]]);
    add(2, [[' I/O gate ', ''], [`${f.ioState} SMB0.0%`, f.ioState === 'disabled' ? 'fade' : 'good']]);
  }
  add(6, [['NET Mb/s', 'label'], [' RX ', ''], [f.rx, 'value'], [' TX ', ''], [f.tx, 'value']]);
  add(3, [['SMB', 'label'], [' (100% CPU = 1 core)', '']]);
  add(3, [[' CPU ', ''], ['0.0%', 'good'], ['  Sessions ', ''], [String(f.sessions), 'value']]);
  add(8, [[' TCP Q R:', ''], ['0B', 'good'], [' S:', ''], ['0B', 'good']]);
  add(5, [['Shared', 'label'], [' sda', '']]);
  add(5, [[' MB/s ', ''], [f.diskMbps, 'value'], ['  Ops/s ', ''], [f.diskOps, 'value']]);
  for (const runs of f.storage) add(4, runs);
  add(6, [[`QUEUES ${f.activeQueues}`, 'label'], [' | ', ''], [`data ${f.registryAge}s old`, 'fade']]);
  add(6, [[' Claim/min ', ''], ['n/a', 'value'], [' Done/min ', ''], [f.donePerMin, 'value']]);
  add(8, [[' Locks now   ', ''], ['0', 'good'], [' oldest ', ''], ['0s', 'good']]);
  add(9, [[' Rewrite/min ', ''], ['0.0', 'value'], [' Dup/min ', ''], ['0.0', 'value']]);
  add(9, [[' Stale locks/min   ', ''], ['0.0', 'value']]);
  const keep = lines.map(() => true);
  let excess = lines.length - rows;
  for (let priority = 9; priority >= 1 && excess > 0; priority--) {
    for (let i = lines.length - 1; i >= 0 && excess > 0; i--) {
      if (keep[i] && lines[i].priority === priority) { keep[i] = false; excess--; }
    }
  }
  return lines.filter((_, i) => keep[i]).map((l) => l.runs);
}

/** monitor_storage.py rows: boot disk, shared drive, then each node's free GB. */
export function storageRows(boot, data, nodes, width) {
  const row = (label, { free, total }, color) => {
    const gb = String(Math.round(free / 1e9));
    const pct = Math.round((100 * (total - free)) / total);
    const cells = Math.max(1, width - 1 - 11 - 3 - String(pct).length);
    const filled = Math.round((cells * pct) / 100);
    return [[label.padEnd(9 - gb.length), 'label'], [`${gb}GB`, color],
      [`[${'#'.repeat(filled)}${' '.repeat(cells - filled)}${pct}%]`, 'label']];
  };
  return [
    row('Boot', boot, 'warn'),
    row('Data', data, 'good'),
    [['Node GB', 'label'], ...nodes.flatMap(([id, free]) => [[` ${id}:`, 'label'], [String(Math.round(free / 1e9)), 'warn']])],
  ];
}

// -- Share (monitor_mount_status.sh) ---------------------------------------------------------

/** One block per host: the mount glyph, separated by rules, each block `height` rows tall. */
export function mountLines(states, width, height) {
  const lines = [];
  states.forEach((state, i) => {
    if (i) lines.push(plain('─'.repeat(width)));
    const glyph = state === true ? [['[✔]', 'green']] : state === false ? [['[✗]', 'bad']] : [['[?]', 'warn']];
    for (let row = 0; row < height; row++) {
      lines.push(row === Math.floor((height - 1) / 2) ? [['  ', ''], ...glyph] : plain(''));
    }
  });
  return lines;
}

// -- tmux window -------------------------------------------------------------------------------

/**
 * Lay out the dashboard as tmux does for two hosts: Share | CPU host | MEM host | CLUSTER I/O on
 * top, one row of panes per host, QUEUE PROGRESS full width below; each pane's title in the
 * border above it, then the status line. `panes` supplies content and titles; returns
 * {cols, height, lines, rects}.
 */
export function composeDashboard({ cols, hostRows, queueRows, titles, content, status }) {
  const shareW = 8, memW = 26, ioW = 33;
  const cpuW = cols - shareW - memW - ioW - 3;
  const hostH = hostRows.length;
  const topH = hostH * 4 + (hostH - 1);
  const rects = { share: { left: 0, top: 1, width: shareW, height: topH }, io: { left: cols - ioW, top: 1, width: ioW, height: topH } };
  hostRows.forEach((id, i) => {
    rects[`cpu:${id}`] = { left: shareW + 1, top: 1 + i * 5, width: cpuW, height: 4 };
    rects[`mem:${id}`] = { left: shareW + 1 + cpuW + 1, top: 1 + i * 5, width: memW, height: 4 };
  });
  rects.queue = { left: 0, top: topH + 2, width: cols, height: queueRows };
  const height = topH + 2 + queueRows;
  const grid = Array.from({ length: height + 1 }, () => Array.from({ length: cols }, () => [' ', '']));
  const put = (x, y, ch, style = '') => { if (y >= 0 && y < grid.length && x >= 0 && x < cols) grid[y][x] = [ch, style]; };
  // Borders: a rule above every pane, a bar between side-by-side panes, junctions where they meet.
  for (const rect of Object.values(rects)) {
    for (let x = rect.left; x < rect.left + rect.width; x++) put(x, rect.top - 1, '─');
    if (rect.left > 0) for (let y = rect.top - 1; y < rect.top + rect.height; y++) put(rect.left - 1, y, '│');
  }
  const at = (x, y) => grid[y]?.[x]?.[0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < cols; x++) {
      if (at(x, y) !== '│' && at(x, y) !== '─') continue;
      const up = y > 0 && ['│', '┬', '┼', '├', '┤'].includes(at(x, y - 1));
      const down = ['│'].includes(at(x, y + 1));
      const left = x > 0 && ['─', '┬', '┼', '├', '┴'].includes(at(x - 1, y));
      const right = ['─'].includes(at(x + 1, y));
      if (at(x, y) === '│' && (left || right)) {
        const ch = up && down ? (left && right ? '┼' : left ? '┤' : '├') : down ? '┬' : '┴';
        put(x, y, ch);
      }
    }
  }
  for (const [key, rect] of Object.entries(rects)) {
    const title = ` ${titles[key] ?? ''}`.slice(0, Math.max(0, rect.width - 4));
    for (let i = 0; i < title.length; i++) put(rect.left + 2 + i, rect.top - 1, title[i]);
    (content[key] ?? []).slice(0, rect.height).forEach((runs, y) => {
      let x = 0;
      for (const [text, style] of runs) {
        for (const ch of text) {
          if (x >= rect.width) break;
          put(rect.left + x, rect.top + y, ch, style);
          x++;
        }
      }
    });
  }
  // The status line: session and window on the left, active pane title and clock on the right.
  const left = `[monitoring] 0:mac-minis*`;
  const right = `"${status.title.slice(0, 21)}" ${status.clock}`;
  const line = (left + ' '.repeat(Math.max(1, cols - left.length - right.length)) + right).slice(0, cols);
  for (let x = 0; x < cols; x++) put(x, height, line[x] ?? ' ', 'status');
  const lines = grid.map((row) => {
    const runs = [];
    for (const [ch, style] of row) {
      if (runs.length && runs[runs.length - 1][1] === style) runs[runs.length - 1][0] += ch;
      else runs.push([ch, style]);
    }
    return runs;
  });
  return { cols, height: height + 1, lines, rects };
}
