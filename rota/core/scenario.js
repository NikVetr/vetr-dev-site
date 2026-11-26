// The demo's sample data, all from ROTA's public examples: the example inventory
// (examples/cluster.json), the first-job example (examples/first-job) and a second project,
// my-analysis, whose queues A, B and C match the README loops.
import { hash01 } from './sim.js';

export const ROOT = '/srv/cluster';
export const HOME = '/home/user';
export const CHECKOUT = `${HOME}/rota`;
export const STATE_ROOT = `${ROOT}/.rota/adaptive`;
export const ANALYSIS = `${ROOT}/projects/my-analysis`;

/** examples/cluster.json */
export const CLUSTER = {
  shared_root: ROOT,
  coordinator: 'storage',
  hosts: [
    { id: 'storage', ssh: 'user@storage', cpu_units: 4, memory_mib: 8192, enabled: true },
    { id: 'worker', ssh: 'user@worker', cpu_units: 8, memory_mib: 16384, enabled: true },
  ],
  shared_io_capacity: 0,
};

/** Durations rounded to seconds, deterministic per queue and line. */
const spread = (seed, i, lo, hi) => Math.round(lo + (hi - lo) * hash01(`${seed}:${i}`));

/** The second project's queue files: name → {lines, duration(i)}. */
export const ANALYSIS_QUEUES = {
  'a.txt': { count: 48, lo: 180, hi: 360, model: 'a' },
  'b.txt': { count: 36, lo: 150, hi: 270, model: 'b' },
  'c.txt': { count: 6, lo: 60, hi: 120, model: 'c' },
};

export function analysisLines(file) {
  const spec = ANALYSIS_QUEUES[file];
  return Array.from({ length: spec.count }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `${spec.model}${n} python3 ${ANALYSIS}/simulate.py --model ${spec.model} --seed ${i + 1} --out ${ANALYSIS}/results/${spec.model}/${n}.json`;
  });
}

/** How long a job runs in the simulation, from its queue file and line. */
export function jobDuration(file, line, index) {
  const spec = ANALYSIS_QUEUES[file];
  if (spec) return spread(file, index, spec.lo, spec.hi);
  // square.py does almost nothing; Python's start-up dominates.
  if (/square\.py/.test(line)) return 1;
  return spread(line, index, 30, 90);
}

/** examples/first-job/prepare.sh writes this queue into a fresh project. */
export function firstJobLines(project) {
  return [3, 7].map((n) => `square${n} python3 "${project}/square.py" ${n} "${project}/results/${n}.txt"`);
}

export const SQUARE_PY = `"""Write the square of one integer to its own result file."""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("number", type=int)
parser.add_argument("output", type=Path)
parser.add_argument("--job_tag", required=True, help="supplied by the worker")
args = parser.parse_args()
args.output.write_text(f"{args.number ** 2}\\n")`;

export const PREPARE_SH = `#!/usr/bin/env bash
set -euo pipefail

# A separate project per invocation keeps previous results and queues intact.
projects="\${ROTA_ROOT:?Source the generated environment.sh first}/stan_projects"
mkdir -p "$projects"
project="$(mktemp -d "$projects/first-job.XXXXXX")"
mkdir "$project/queues" "$project/results"
cp "$(dirname "$0")/square.py" "$project/square.py"
for number in 3 7; do
  printf 'square%s python3 "%s/square.py" %s "%s/results/%s.txt"\\n' \\
    "$number" "$project" "$number" "$project" "$number"
done > "$project/queues/jobs.txt"
chmod g+rx "$project" "$project/queues"
chmod g+rwx "$project/results"
chmod g+r "$project/square.py" "$project/queues/jobs.txt"
printf '%s\\n' "$project"`;

export const CLUSTER_JSON = `{
  "shared_root": "/srv/cluster",
  "coordinator": "storage",
  "hosts": [
    {"id": "storage", "ssh": "user@storage", "cpu_units": 4, "memory_mib": 8192, "enabled": true},
    {"id": "worker", "ssh": "user@worker", "cpu_units": 8, "memory_mib": 16384, "enabled": true}
  ],
  "shared_io_capacity": 0
}`;

/** mktemp-style suffixes for successive prepare.sh runs. */
export function mktempSuffix(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 6 }, (_, i) => chars[Math.floor(hash01(`mktemp:${n}:${i}`) * chars.length) % chars.length]).join('');
}

/** A stable lowercase hex string, for hashes and fingerprints. */
export function hex(seed, length) {
  let out = '';
  for (let i = 0; out.length < length; i++) out += Math.floor(hash01(`${seed}#${i}`) * 0xffffffff).toString(16).padStart(8, '0');
  return out.slice(0, length);
}

/** Queue colours from the explainer video's theme (theme.ts), keyed by run name where it matches. */
export const QUEUE_COLORS = { a: '#4fb6d8', b: '#f0a04b', c: '#b48cf2', d: '#ef6f8e', e: '#7fd46b' };
