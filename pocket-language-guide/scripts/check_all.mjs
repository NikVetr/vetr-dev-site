// Run every generated-file check, and report all of them.
//
//   node scripts/check_all.mjs
//
// **`npm run check` used to be a `&&` chain, and the last link in it had never
// run.** `build_ipa.py --check` sits in the middle and cannot pass on a machine
// whose espeak predates the Ukrainian and Marathi voices -- those two packs are
// built against the newer library `espeakng-loader` ships, and the plain `--check`
// asks espeak for `uk` and gets `RuntimeError: language "uk" is not supported`. In a
// `&&` chain that is the end of the run, so `respell_check --charset --check`, which
// comes after it, was silently never reached. `data/respell/charset.json` went stale
// and was committed and pushed that way.
//
// So: run them all, collect the failures, and report every one. A check that cannot
// pass in this environment should cost the checks after it nothing.
//
// The espeak split is handled here rather than left to fail, because it is a fact
// about the machine and not about the data: everything but `uk` and `mr` against the
// system library, then those two alone with `PHONEMIZER_ESPEAK_LIBRARY` pointed at
// the loader's copy. `content/PROMPTS/add-a-language.md` records why mixing them is
// not a rebuild but a different phonemiser.

import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Every ready language except the two that need the newer espeak. */
function systemVoices() {
  const csv = readFileSync(`${ROOT}/data/registry/languages.csv`, 'utf8');
  const [head, ...lines] = csv.split(/\r?\n/).filter(Boolean);
  const cols = head.split(',');
  const code = cols.indexOf('bcp47');
  const status = cols.indexOf('status');
  return lines.map((l) => l.split(','))
    .filter((f) => f[status] === 'ready' && !['uk', 'mr'].includes(f[code]))
    .map((f) => f[code]).join(',');
}

/** Where `espeakng-loader` keeps the library the two late voices need. */
function loaderEnv() {
  try {
    const read = (/** @type {string} */ fn) => execFileSync('python3',
      ['-c', `import espeakng_loader; print(espeakng_loader.${fn}())`], { encoding: 'utf8' }).trim();
    return {
      PHONEMIZER_ESPEAK_LIBRARY: read('get_library_path'),
      PHONEMIZER_ESPEAK_DATA_PATH: read('get_data_path'),
    };
  } catch {
    return null;
  }
}

const env = loaderEnv();
/** @type {{name:string, cmd:string, args:string[], env?:Record<string,string>}[]} */
const checks = [
  { name: 'types', cmd: 'npx', args: ['tsc', '-p', 'jsconfig.json'] },
  { name: 'shell', cmd: 'node', args: ['scripts/build_shell.mjs', '--check'] },
  { name: 'i18n', cmd: 'node', args: ['scripts/check_i18n.mjs', '--check'] },
  { name: 'native', cmd: 'python3', args: ['scripts/transliterate_native.py', '--check'] },
  { name: 'ipa', cmd: 'python3', args: ['scripts/build_ipa.py', '--check', '--only', systemVoices()] },
  ...(env ? [
    { name: 'ipa:uk', cmd: 'python3', args: ['scripts/build_ipa.py', '--check', '--only', 'uk'], env },
    { name: 'ipa:mr', cmd: 'python3', args: ['scripts/build_ipa.py', '--check', '--only', 'mr'], env },
  ] : []),
  { name: 'respell', cmd: 'node', args: ['scripts/respell_check.mjs', '--charset', '--check'] },
];

/** @type {string[]} */ const failed = [];
for (const check of checks) {
  const run = spawnSync(check.cmd, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(check.env ?? {}) },
  });
  const ok = run.status === 0;
  if (!ok) failed.push(check.name);
  const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').filter(Boolean);
  // On success the summary is the last line; on failure it is the first line that
  // says what went wrong. Taking the last line either way printed `Node.js v22.22.1`
  // for anything that threw, which is the least useful line in the output.
  const say = ok ? lines.at(-1) : (lines.find((l) => /error|stale|fail/i.test(l)) ?? lines[0]);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${check.name.padEnd(8)} ${(say ?? '').trim().slice(0, 96)}`);
}

if (!env) {
  // Not a failure: a machine without the loader simply cannot check those two, and
  // saying so is better than a silent gap where two languages used to be.
  console.log('note  ipa:uk and ipa:mr skipped -- espeakng-loader is not installed');
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nall ${checks.length} checks passed`);
