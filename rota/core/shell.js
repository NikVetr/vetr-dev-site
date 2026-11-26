// A small Bash for the demo's terminals: quoting, variables, $(...), ;, && and ||, pipes into a
// few filters, the file tools a visitor reaches for, and the ROTA commands (cli.js). Each host
// has its own shell; the worker's sees its own processes and loses the share with its cable.
import { ROOT, HOME, CHECKOUT, STATE_ROOT } from './scenario.js';
import { runCommand, ROTA_COMMANDS, SCHEDULER_COMMANDS } from './cli.js';
import { lookup, fileTable, prepareFirstJob, epochNow, dateText, hostTruth, stamp } from './world.js';

const ENV_FILE = `${ROOT}/config/environment-20261124-1.sh`;

export function createShell(world, host) {
  const storage = host === 'storage';
  return {
    world, host, history: [],
    cwd: storage ? CHECKOUT : HOME,
    vars: {
      HOME, USER: 'user', HOSTNAME: host, SHELL: '/bin/bash', PATH: `${HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin`,
      ...(storage ? { ROTA_ROOT: ROOT, ROTA_COORDINATOR: 'storage', ROTA_CONFIG_DIR: `${ROOT}/config`, ROTA_RESOURCES_FILE: `${ROOT}/config/adaptive-resources.tsv` } : {}),
    },
  };
}

export const prompt = (shell) => `user@${shell.host}:${shell.cwd === HOME ? '~' : shell.cwd.startsWith(`${HOME}/`) ? `~${shell.cwd.slice(HOME.length)}` : shell.cwd}$ `;

// -- Parsing ---------------------------------------------------------------------------------------

/** Split on an operator outside quotes and $(...). */
function splitTop(text, ops) {
  const parts = [];
  let depth = 0, quote = '', start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { i++; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '\\') { i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '$' && text[i + 1] === '(') { depth++; i++; continue; }
    if (ch === ')' && depth) { depth--; continue; }
    if (depth) continue;
    if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) { parts.push({ text: text.slice(start, i), op: null }); return parts; }
    const op = ops.find((o) => text.startsWith(o, i) && !(o === '|' && text[i + 1] === '|') && !(o === '&' && text[i + 1] === '&'));
    if (op) {
      parts.push({ text: text.slice(start, i), op });
      i += op.length - 1;
      start = i + 1;
    }
  }
  if (quote) throw new SyntaxError(`unexpected EOF while looking for matching \`${quote}'`);
  parts.push({ text: text.slice(start), op: null });
  return parts;
}

/** Words of one simple command, with expansions; each word is {text, glob}. */
function words(shell, text) {
  const out = [];
  let cur = null, glob = false;
  const push = () => { if (cur !== null) out.push({ text: cur, glob }); cur = null; glob = false; };
  const add = (s) => { cur = (cur ?? '') + s; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { push(); continue; }
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      add(text.slice(i + 1, end));
      i = end;
      continue;
    }
    if (ch === '"') {
      i++;
      let s = '';
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\' && '"\\$`'.includes(text[i + 1])) { s += text[++i]; continue; }
        if (text[i] === '$') { const [v, n] = expandDollar(shell, text, i); s += v; i = n - 1; continue; }
        s += text[i];
      }
      add(s);
      continue;
    }
    if (ch === '\\') { add(text[++i] ?? ''); continue; }
    if (ch === '$') {
      const [v, n] = expandDollar(shell, text, i);
      i = n - 1;
      // Unquoted expansions split into words.
      const pieces = v.split(/\s+/);
      pieces.forEach((p, k) => { if (k) push(); if (p || k === 0) add(p); });
      if (v === '' && cur === '') cur = cur ?? null;
      continue;
    }
    if (ch === '~' && cur === null && (text[i + 1] === undefined || text[i + 1] === '/' || /\s/.test(text[i + 1]))) { add(HOME); continue; }
    if (ch === '*' || ch === '?') glob = true;
    add(ch);
  }
  push();
  return out;
}

function expandDollar(shell, text, i) {
  if (text[i + 1] === '(') {
    let depth = 1, j = i + 2;
    for (; j < text.length && depth; j++) {
      if (text[j] === '(') depth++;
      else if (text[j] === ')') depth--;
    }
    const inner = text.slice(i + 2, j - 1);
    const result = execute(shell, inner, { capture: true });
    shell.captureErrors?.push(...result.lines.filter((l) => l.err));
    return [result.lines.filter((l) => !l.err).map((l) => l.text).join('\n').replace(/\n+$/, ''), j];
  }
  if (text[i + 1] === '{') {
    const end = text.indexOf('}', i);
    return [shell.vars[text.slice(i + 2, end)] ?? '', end + 1];
  }
  if (text[i + 1] === '?') return [String(shell.status ?? 0), i + 2];
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i + 1));
  if (!m) return ['$', i + 1];
  return [shell.vars[m[0]] ?? '', i + 1 + m[0].length];
}

// -- Paths ------------------------------------------------------------------------------------------

export function resolve(shell, path) {
  if (!path) return shell.cwd;
  const parts = (path.startsWith('/') ? path : `${shell.cwd}/${path}`).split('/');
  const out = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return `/${out.join('/')}`;
}

/** Whether a path is out of reach from this shell (the worker without its cable). */
function unreachable(shell, path) {
  if (shell.host !== 'worker' || !(path === ROOT || path.startsWith(`${ROOT}/`))) return false;
  return !shell.world.sim.hosts.find((h) => h.id === 'worker').reachable;
}

function files(shell) {
  const table = fileTable(shell.world);
  if (shell.host === 'worker') {
    for (const k of Object.keys(table)) if (k === CHECKOUT || k.startsWith(`${CHECKOUT}/`)) delete table[k];
    table[HOME] = [];
  }
  return table;
}

function globExpand(shell, table, word) {
  if (!word.glob) return [word.text];
  const path = resolve(shell, word.text);
  const dir = path.slice(0, path.lastIndexOf('/')) || '/';
  const pattern = new RegExp(`^${path.slice(path.lastIndexOf('/') + 1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
  const entries = Array.isArray(table[dir]) ? table[dir].filter((n) => pattern.test(n) && !n.startsWith('.')) : [];
  if (!entries.length) return [word.text];
  const prefix = word.text.slice(0, word.text.lastIndexOf('/') + 1);
  return entries.map((n) => prefix + n);
}

// -- Execution ------------------------------------------------------------------------------------

/** Run one input line. Returns {lines: [{text, err}], code, effects, clear}. */
export function execute(shell, line, { capture = false } = {}) {
  const result = { lines: [], code: 0, effects: [], clear: false };
  const text = line.replace(/\\\n/g, ' ');
  if (!capture && text.trim()) shell.history.push(text);
  let parts;
  try {
    parts = splitTop(text, ['&&', '||', ';']);
  } catch (error) {
    result.lines.push({ text: `bash: ${error.message}`, err: true });
    result.code = 2;
    return result;
  }
  let skip = false;
  for (let k = 0; k < parts.length; k++) {
    const { text: piece } = parts[k];
    const prev = k ? parts[k - 1].op : null;
    if (prev === '&&' && shell.status !== 0) skip = true;
    else if (prev === '||' && shell.status === 0) skip = true;
    else if (prev === ';' || prev === null) skip = false;
    else skip = false;
    if (skip || !piece.trim()) continue;
    const r = pipeline(shell, piece);
    result.lines.push(...r.lines);
    result.effects.push(...r.effects);
    if (r.clear) { result.clear = true; result.lines = []; }
    shell.status = r.code;
    result.code = r.code;
  }
  return result;
}

function pipeline(shell, text) {
  const stages = splitTop(text, ['|']).map((p) => p.text);
  let input = null;
  /** @type {{lines: {text: string, err: boolean}[], code: number, effects?: object[], clear?: boolean}} */
  let last = { lines: [], code: 0, effects: [] };
  const errors = [];
  const effects = [];
  for (const stage of stages) {
    shell.captureErrors = [];
    let argv;
    try {
      argv = words(shell, stage.trim());
    } catch (error) {
      return { lines: [{ text: `bash: ${error.message}`, err: true }], code: 2, effects };
    }
    errors.push(...shell.captureErrors);
    const table = files(shell);
    argv = argv.flatMap((w) => globExpand(shell, table, w));
    last = simple(shell, argv, input, table);
    effects.push(...(last.effects ?? []));
    errors.push(...last.lines.filter((l) => l.err));
    input = last.lines.filter((l) => !l.err).map((l) => l.text);
    if (last.clear) return { lines: [], code: 0, effects, clear: true };
  }
  return { lines: [...errors, ...input.map((t) => ({ text: t, err: false }))], code: last.code, effects };
}

const outLines = (text) => String(text).split('\n').map((t) => ({ text: t, err: false }));
const errLine = (text) => ({ text, err: true });
const done = (lines, code = 0, extra = {}) => ({ lines, code, ...extra });

const DEMO_HELP = `demo: this shell runs a simulation of ROTA. Things to try:
  rota pool-status                 the pool's record (ACTIVE, budgets, capacity)
  rota help                        the rota command's usage; rota help-scheduler for every subcommand
  project=$(bash examples/first-job/prepare.sh)
  rota submit --model_dir "$project" --queue jobs.txt --project my-analysis --run_name pilot \\
    --cpu_units_per_job 1 --memory_mib_per_job 512 --max_workers 1
  rota queue-status --batch_dir "$batch"   (set batch= to the printed batch_dir)
  ls /srv/cluster/projects/my-analysis/queues   a second project, queues a.txt, b.txt and c.txt
Also: ls, cat, cd, head, tail, grep, wc, echo, ps, history, clear. Tab completes; the Commands
button lists ready-made commands with the right paths.`;

function simple(shell, argv, input, table) {
  if (!argv.length) return done([]);
  // Assignments.
  const assign = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
  let i = 0;
  while (i < argv.length && assign.test(argv[i])) i++;
  if (i === argv.length) {
    for (const a of argv) { const [, k, v] = assign.exec(a); shell.vars[k] = v; }
    return done([]);
  }
  argv = argv.slice(i);
  // Redirections are not simulated; 2>&1 is harmless.
  argv = argv.filter((a) => a !== '2>&1');
  if (argv.some((a) => /^[0-9]?>{1,2}/.test(a) || a === '<')) {
    return done([errLine('demo: redirection is not simulated; files here are read-only.')], 1);
  }
  const [cmd, ...args] = argv;
  const world = shell.world;
  const storage = shell.host === 'storage';
  const program = cmd.split('/').pop();
  const path = cmd.includes('/') ? resolve(shell, cmd) : null;
  switch (cmd) {
    case 'cd': {
      const target = resolve(shell, args[0] ?? HOME);
      if (unreachable(shell, target)) return done([errLine(`bash: cd: ${args[0]}: Host is down`)], 1);
      if (!Array.isArray(table[target])) return done([errLine(`bash: cd: ${args[0]}: ${table[target] === undefined ? 'No such file or directory' : 'Not a directory'}`)], 1);
      shell.cwd = target;
      shell.vars.PWD = target;
      return done([]);
    }
    case 'pwd': return done(outLines(shell.cwd));
    case 'echo': {
      const n = args[0] === '-n';
      return done(outLines((n ? args.slice(1) : args).join(' ')));
    }
    case 'printf': return done(outLines((args[0] ?? '').replace(/\\n$/, '').replace(/%s/g, () => args.splice(1, 1)[0] ?? '')));
    case 'export': for (const a of args) { const m = assign.exec(a); if (m) shell.vars[m[1]] = m[2]; } return done([]);
    case 'unset': for (const a of args) delete shell.vars[a]; return done([]);
    case 'env': case 'printenv': return done(outLines(Object.entries(shell.vars).map(([k, v]) => `${k}=${v}`).join('\n')));
    case 'clear': return done([], 0, { clear: true });
    case 'history': return done(outLines(shell.history.map((h, k) => `${String(k + 1).padStart(5)}  ${h}`).join('\n')));
    case 'exit': case 'logout': return done(outLines('demo: this window stays open; there is nothing to log out of.'));
    case 'true': return done([]);
    case 'false': return done([], 1);
    case 'help': return done(outLines(DEMO_HELP));
    case 'which': case 'type': {
      const lines = [];
      let code = 0;
      for (const a of args.filter((x) => !x.startsWith('-'))) {
        if (a === 'rota' && storage) lines.push({ text: cmd === 'type' ? `rota is ${HOME}/.local/bin/rota` : `${HOME}/.local/bin/rota`, err: false });
        else if (['python3', 'bash', 'tmux', 'ssh', 'ls', 'cat'].includes(a)) lines.push({ text: `/usr/bin/${a}`, err: false });
        else { code = 1; if (cmd === 'type') lines.push(errLine(`bash: type: ${a}: not found`)); }
      }
      return done(lines, code);
    }
    case 'source': case '.': {
      if (args[0] && /environment.*\.sh$/.test(args[0])) return done([]);
      return done([errLine(`bash: ${args[0] ?? 'source: filename argument required'}: No such file or directory`)], 1);
    }
    case 'ls': return ls(shell, args, table);
    case 'cat': case 'less': case 'more': return cat(shell, cmd, args, input, table);
    case 'head': case 'tail': return headTail(shell, cmd, args, input, table);
    case 'wc': return filter(shell, args, input, table, (lines, opts) => {
      const n = lines.length;
      return opts.includes('-l') ? [String(n)] : [`${String(n).padStart(7)} ${String(lines.join(' ').split(/\s+/).filter(Boolean).length).padStart(7)} ${String(lines.join('\n').length + 1).padStart(7)}`];
    });
    case 'sort': return filter(shell, args, input, table, (lines, opts) => { const s = [...lines].sort(); return opts.includes('-r') ? s.reverse() : s; });
    case 'grep': return grep(shell, args, input, table);
    case 'date': return done(outLines(dateText(epochNow(world))));
    case 'hostname': return done(outLines(shell.host));
    case 'whoami': return done(outLines('user'));
    case 'uname': return done(outLines(args.includes('-a') ? `Linux ${shell.host} 6.8.0 #1 SMP x86_64 GNU/Linux` : 'Linux'));
    case 'nproc': return done(outLines(storage ? '4' : '8'));
    case 'uptime': {
      const t = hostTruth(world, shell.host);
      const load = (t.jobs.length + 0.1).toFixed(2);
      return done(outLines(` ${stamp(epochNow(world), '%H:%M:%S')} up 12 days,  3:41,  1 user,  load average: ${load}, ${load}, ${load}`));
    }
    case 'ps': case 'pgrep': return ps(shell);
    case 'top': case 'htop': return done(outLines(`demo: ${cmd} is interactive; try ps here, or the dashboard's CPU panes.`));
    case 'sleep': return done([]);
    case 'tmux': {
      if (args[0] === 'ls' || args[0] === 'list-sessions') return done(outLines(storage ? 'monitoring: 1 windows (created today) (attached)' : 'no server running on /tmp/tmux-1000/default'), storage ? 0 : 1);
      if (storage && /^(a|attach|attach-session)$/.test(args[0] ?? '')) return done([], 0, { effects: [{ type: 'monitor' }] });
      return done(outLines('demo: only `tmux attach -t monitoring` and `tmux ls` are simulated.'));
    }
    case 'ssh': {
      const target = (args.find((a) => !a.startsWith('-')) ?? '').replace(/^.*@/, '');
      const h = world.sim.hosts.find((x) => x.id === target);
      if (!h) return done([errLine(`ssh: Could not resolve hostname ${target || '(none)'}: Name or service not known`)], 255);
      if (h.id === shell.host) return done(outLines('demo: you are already on this host.'));
      const me = world.sim.hosts.find((x) => x.id === shell.host);
      if (!h.reachable || !me.reachable) return done([errLine(`ssh: connect to host ${h.id} port 22: No route to host`)], 255);
      return done(outLines(`demo: the ${h.id} window is that host's shell.`), 0, { effects: [{ type: 'focus', host: h.id }] });
    }
    case 'sudo': return done([errLine('demo: ROTA needs no root access, and this demo has no sudo.')], 1);
    case 'man': return done(outLines('demo: no manual pages here; try rota help or rota help-scheduler.'));
    case 'mkdir': case 'touch': case 'rm': case 'mv': case 'cp': case 'chmod': case 'ln': case 'nano': case 'vim': case 'vi': case 'emacs':
      return done([errLine(`demo: files are read-only in this simulation, so ${cmd} is not available.`)], 1);
    case 'python': case 'python3': return python(shell, args, table);
    case 'bash': case 'sh': return script(shell, args[0], args.slice(1), table);
    default:
  }
  if (program === 'rota' && (cmd === 'rota' ? storage : true)) {
    if (cmd !== 'rota' && table[path] === undefined) return done([errLine(`bash: ${cmd}: No such file or directory`)], 127);
    return cli(shell, ['rota', ...args]);
  }
  if (path) return script(shell, cmd, args, table);
  return done([errLine(`bash: ${cmd}: command not found`)], 127);
}

function cli(shell, argv) {
  const r = runCommand(shell.world, argv);
  return done(r.lines, r.code, { effects: r.effects });
}

/** A script by path: the deployed scheduler scripts, the example's prepare.sh, ./rota. */
function script(shell, file, args, table) {
  if (!file) return done([]);
  const path = resolve(shell, file);
  const name = path.split('/').pop();
  if (unreachable(shell, path)) return done([errLine(`bash: ${file}: Host is down`)], 1);
  if (table[path] === undefined && !(path.startsWith(`${ROOT}/`) && ['adaptive_scheduler.sh', 'reconcile_queue_batch.sh', 'start_workers.sh', 'kill_workers.sh'].includes(name) && path === `${ROOT}/${name}`)) {
    return done([errLine(`bash: ${file}: No such file or directory`)], 127);
  }
  if (name === 'prepare.sh' && path === `${CHECKOUT}/examples/first-job/prepare.sh`) {
    if (!shell.vars.ROTA_ROOT) return done([errLine(`${path}: line 5: ROTA_ROOT: Source the generated environment.sh first`)], 1);
    return done(outLines(prepareFirstJob(shell.world)));
  }
  if (path === `${CHECKOUT}/rota`) return cli(shell, ['rota', ...args]);
  if (path === `${ROOT}/adaptive_scheduler.sh` || path === `${ROOT}/reconcile_queue_batch.sh`) {
    if (shell.host !== 'storage') return done(outLines('demo: run scheduler commands from the coordinator, storage.'));
    return cli(shell, [name, ...args]);
  }
  if (name === 'start_workers.sh' || name === 'kill_workers.sh') return cli(shell, ['rota', name === 'start_workers.sh' ? 'start' : 'kill']);
  return done(outLines(`demo: running ${file} is not simulated.`));
}

function python(shell, args, table) {
  const file = args[0];
  if (!file || file === '-c' || file === '-m') return done(outLines('demo: an interactive Python is not simulated here.'));
  const path = resolve(shell, file);
  const name = path.split('/').pop();
  if (unreachable(shell, path)) return done([errLine(`python3: can't open file '${path}': [Errno 112] Host is down`)], 2);
  if (name === 'monitor_pool_eta.py' && path === `${ROOT}/monitor_pool_eta.py`) return cli(shell, [name, ...args.slice(1)]);
  if (table[path] === undefined) return done([errLine(`python3: can't open file '${path}': [Errno 2] No such file or directory`)], 2);
  if (name === 'square.py') {
    const rest = args.slice(1);
    if (!rest.includes('--job_tag')) {
      return done([errLine('usage: square.py [-h] --job_tag JOB_TAG number output'),
        errLine('square.py: error: the following arguments are required: --job_tag')], 2);
    }
    return done([errLine('demo: run it through the scheduler instead; this demo keeps its files read-only.')], 1);
  }
  return done(outLines(`demo: running ${file} is not simulated.`));
}

function ls(shell, args, table) {
  const opts = args.filter((a) => a.startsWith('-')).join('');
  const all = opts.includes('a');
  const long = opts.includes('l');
  const targets = args.filter((a) => !a.startsWith('-'));
  const lines = [];
  let code = 0;
  const list = targets.length ? targets : ['.'];
  for (const target of list) {
    const path = resolve(shell, target);
    if (unreachable(shell, path)) { lines.push(errLine(`ls: cannot access '${target}': Host is down`)); code = 2; continue; }
    const entry = table[path];
    if (entry === undefined) { lines.push(errLine(`ls: cannot access '${target}': No such file or directory`)); code = 2; continue; }
    if (!Array.isArray(entry)) { lines.push({ text: long ? longLine(target, entry) : target, err: false }); continue; }
    if (list.length > 1) lines.push({ text: `${target}:`, err: false });
    const names = entry.filter((n) => all || !n.startsWith('.'));
    if (long) {
      lines.push({ text: `total ${names.length * 4}`, err: false });
      for (const n of names) lines.push({ text: longLine(n, table[`${path === '/' ? '' : path}/${n}`]), err: false });
    } else if (names.length) {
      lines.push(...columns(names.map((n) => (Array.isArray(table[`${path === '/' ? '' : path}/${n}`]) ? n : n))));
    }
  }
  return done(lines, code);
}

function longLine(name, entry) {
  const dir = Array.isArray(entry);
  const size = dir ? 4096 : (entry ?? '').length + 1;
  return `${dir ? 'drwxrwxr-x' : '-rw-rw-r--'} 1 user user ${String(size).padStart(6)} Nov 25 09:30 ${name}`;
}

function columns(names) {
  const width = Math.max(...names.map((n) => n.length)) + 2;
  const perRow = Math.max(1, Math.floor(80 / width));
  const rows = Math.ceil(names.length / perRow);
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < perRow; c++) {
      const n = names[c * rows + r];
      if (n !== undefined) line += n.padEnd(width);
    }
    out.push({ text: line.trimEnd(), err: false });
  }
  return out;
}

function readFile(shell, cmd, target, table) {
  const path = resolve(shell, target);
  if (unreachable(shell, path)) return { error: `${cmd}: ${target}: Host is down` };
  const entry = table[path];
  if (entry === undefined) return { error: `${cmd}: ${target}: No such file or directory` };
  if (Array.isArray(entry)) return { error: `${cmd}: ${target}: Is a directory` };
  return { text: entry };
}

function cat(shell, cmd, args, input, table) {
  const targets = args.filter((a) => !a.startsWith('-'));
  if (!targets.length) return done((input ?? []).map((t) => ({ text: t, err: false })));
  const lines = [];
  let code = 0;
  for (const target of targets) {
    const r = readFile(shell, cmd, target, table);
    if (r.error) { lines.push(errLine(r.error)); code = 1; } else if (r.text !== '') lines.push(...outLines(r.text));
  }
  return done(lines, code);
}

function sourceLines(shell, cmd, args, input, table) {
  const target = args.find((a) => !a.startsWith('-') && !/^[0-9]+$/.test(a));
  if (!target) return { lines: input ?? [] };
  const r = readFile(shell, cmd, target, table);
  return r.error ? { error: r.error } : { lines: r.text === '' ? [] : r.text.split('\n') };
}

function headTail(shell, cmd, args, input, table) {
  if (cmd === 'tail' && args.includes('-f')) return done(outLines('demo: tail -f is not simulated; run it again, or watch the dashboard.'));
  let n = 10;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n') n = parseInt(args[++i], 10);
    else if (/^-[0-9]+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
    else rest.push(args[i]);
  }
  const src = sourceLines(shell, cmd, rest, input, table);
  if (src.error) return done([errLine(src.error)], 1);
  const lines = cmd === 'head' ? src.lines.slice(0, n) : src.lines.slice(-n);
  return done(lines.map((t) => ({ text: t, err: false })));
}

function filter(shell, args, input, table, fn) {
  const opts = args.filter((a) => a.startsWith('-'));
  const src = sourceLines(shell, 'wc', args.filter((a) => !a.startsWith('-')), input, table);
  if (src.error) return done([errLine(src.error)], 1);
  return done(fn(src.lines, opts).map((t) => ({ text: t, err: false })));
}

function grep(shell, args, input, table) {
  const opts = args.filter((a) => a.startsWith('-')).join('');
  const rest = args.filter((a) => !a.startsWith('-'));
  const pattern = rest.shift();
  if (pattern === undefined) return done([errLine('Usage: grep [OPTION]... PATTERNS [FILE]...')], 2);
  let re;
  try { re = new RegExp(pattern, opts.includes('i') ? 'i' : ''); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); }
  const src = sourceLines(shell, 'grep', rest, input, table);
  if (src.error) return done([errLine(src.error)], 2);
  const hits = src.lines.filter((l) => re.test(l) !== opts.includes('v'));
  if (opts.includes('c')) return done(outLines(String(hits.length)), hits.length ? 0 : 1);
  return done(hits.map((t) => ({ text: t, err: false })), hits.length ? 0 : 1);
}

/** The host's own processes: its daemon, then one worker and one job per running job. */
function ps(shell) {
  const { world } = shell;
  const t = hostTruth(world, shell.host);
  const pool = world.sim.pool.id;
  const lines = ['    PID     ELAPSED COMMAND'];
  const elapsed = (s) => { const m = Math.floor(s / 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  if (shell.host === 'storage' && world.sim.pool.state !== 'INACTIVE') lines.push(`  48233 ${elapsed(world.sim.t + 3600).padStart(11)} python3 ${ROOT}/adaptive_coordinator.py serve --state-root ${STATE_ROOT}`);
  if (world.sim.pool.state !== 'INACTIVE') {
    lines.push(`  ${shell.host === 'storage' ? 48240 : 3112} ${elapsed(world.sim.t + 3590).padStart(11)} mmhostdaemon_${pool}_${shell.host} ${HOME}/.rota/adaptive/${pool}/bin/mmhostdaemon.sh --state-dir ${HOME}/.rota/adaptive/${pool} --poll-seconds 1 --sample-seconds 5`);
  }
  let pid = shell.host === 'storage' ? 51000 : 7200;
  for (const { q, j } of t.jobs) {
    const age = world.sim.t - j.start;
    pid += 7 + (j.n % 5);
    lines.push(`  ${pid} ${elapsed(age).padStart(11)} bash ${HOME}/.rota/adaptive/${pool}/bin/mmworker.sh 1 ${q.queueFile} ${q.batchDir}/queue-edit.txt ...`);
    lines.push(`  ${pid + 3} ${elapsed(age).padStart(11)} ${j.cmd.replace(/"/g, '')} --job_tag ${q.tag}`);
  }
  return done(lines.map((text) => ({ text, err: false })));
}

// -- Completion -------------------------------------------------------------------------------------

const SHELL_COMMANDS = ['rota', 'cd', 'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'echo', 'pwd', 'history', 'clear', 'help', 'python3', 'bash', 'ps', 'tmux', 'ssh', 'date', 'uptime', 'export'];

/**
 * Complete the word before the cursor. Returns {start, end, replacement, candidates}: replace
 * line[start, end) with `replacement`; `candidates` lists the options when it is ambiguous.
 */
export function complete(shell, line) {
  const m = /(\S*)$/.exec(line);
  const word = m[1];
  const start = line.length - word.length;
  const before = line.slice(0, start).trim().split(/\s+/).filter(Boolean);
  const { world } = shell;
  let options = [];
  const quoteless = word.replace(/^["']/, '');
  if (!before.length) options = SHELL_COMMANDS;
  else {
    const isRota = before[0] === 'rota' || /adaptive_scheduler\.sh"?$/.test(before[0]) || before[0] === '"$scheduler"' || before[0] === '$scheduler';
    const sub = before[0] === 'rota' ? before[1] : isRota ? before[1] : null;
    const prev = before[before.length - 1];
    if (isRota && before.length === 1) options = before[0] === 'rota' ? ROTA_COMMANDS : Object.keys(SCHEDULER_COMMANDS);
    else if (prev === '--batch_dir' || prev === '--after') options = world.sim.queues.map((q) => q.batchDir);
    else if (prev === '--model_dir') options = [...world.projects.keys()];
    else if (prev === '--queue') {
      const i = before.indexOf('--model_dir');
      const model = i >= 0 ? expandForCompletion(shell, before[i + 1]) : null;
      options = model ? Object.keys(world.projects.get(model.replace(/\/+$/, ''))?.queues ?? {}) : [];
    } else if (prev === '--host_id') options = world.sim.hosts.map((h) => h.id);
    else if (prev === '--state') options = ['away', 'present'];
    else if (isRota && sub && quoteless.startsWith('-')) {
      const flags = sub === 'reconcile' ? ['--model_dir', '--queue', '--batch_dir', '--rerun_missing'] : SCHEDULER_COMMANDS[sub] ?? [];
      options = flags.filter((f) => !before.includes(f));
    } else options = pathOptions(shell, quoteless);
  }
  const quote = word.startsWith('"') ? '"' : '';
  const matches = [...new Set(options)].filter((o) => o.startsWith(quoteless)).sort();
  if (!matches.length) return { start, end: line.length, replacement: word, candidates: [] };
  if (matches.length === 1) {
    const only = matches[0];
    const dir = only.endsWith('/');
    return { start, end: line.length, replacement: quote + only + (dir ? '' : quote ? `${quote} ` : ' '), candidates: [] };
  }
  let common = matches[0];
  for (const o of matches) while (!o.startsWith(common)) common = common.slice(0, -1);
  return { start, end: line.length, replacement: quote + common, candidates: matches };
}

function expandForCompletion(shell, w) {
  if (!w) return null;
  return w.replace(/^"|"$/g, '').replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, k) => shell.vars[k] ?? '');
}

function pathOptions(shell, partial) {
  const table = files(shell);
  const expanded = partial.replace(/^~(?=\/|$)/, HOME).replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, k) => shell.vars[k] ?? '');
  const slash = expanded.lastIndexOf('/');
  const dirPart = slash >= 0 ? expanded.slice(0, slash + 1) : '';
  const dir = resolve(shell, dirPart || '.');
  const entries = Array.isArray(table[dir]) ? table[dir] : [];
  const shown = slash >= 0 ? partial.slice(0, partial.length - (expanded.length - slash - 1)) : '';
  return entries.filter((n) => !n.startsWith('.') || expanded.slice(slash + 1).startsWith('.'))
    .map((n) => shown + n + (Array.isArray(table[`${dir === '/' ? '' : dir}/${n}`]) ? '/' : ''));
}

export { lookup, ENV_FILE };
