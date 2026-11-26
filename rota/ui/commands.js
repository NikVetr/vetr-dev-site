// Commands to try, with this pool's paths filled in as the visitor's queues appear. The palette
// and the tour both draw on these.
import { ANALYSIS } from '../core/scenario.js';

export const latest = (world, runName) => [...world.sim.queues].reverse().find((q) => q.runName === runName) ?? null;
const batch = (world, runName) => latest(world, runName)?.batchDir ?? null;

const analysisSubmit = (name, run, mem, extra = '') =>
  `rota submit --model_dir ${ANALYSIS} --queue ${name} --project my-analysis --run_name ${run} --cpu_units_per_job 1 --memory_mib_per_job ${mem}${extra}`;

export const PILOT_SUBMIT = 'rota submit --model_dir "$project" --queue jobs.txt --project my-analysis --run_name pilot --cpu_units_per_job 1 --memory_mib_per_job 512 --max_workers 1';
export const PREPARE = 'project=$(bash examples/first-job/prepare.sh)';
export const ETA = 'python3 "$ROTA_ROOT/monitor_pool_eta.py" --root "$ROTA_ROOT" --json';
export const SUBMIT_A = analysisSubmit('a.txt', 'A', 1024);
export const SUBMIT_B = analysisSubmit('b.txt', 'B', 1536);
export const SUBMIT_C = (world) => analysisSubmit('c.txt', 'C', 768, ` --after ${batch(world, 'B') ?? 'B'}`);

/**
 * Groups of {label, command | action, host, needs}. `needs` names the queue that must exist
 * first; such items show, marked, until it does.
 */
export function commandGroups(world) {
  const b = (run) => batch(world, run);
  const at = (run, make) => (b(run) ? make(b(run)) : null);
  return [
    { title: 'Look around', items: [
      { label: "The pool's record", command: 'rota pool-status' },
      { label: 'What rota can do', command: 'rota help' },
      { label: 'Every scheduler subcommand', command: 'rota help-scheduler' },
      { label: 'The example inventory', command: 'cat examples/cluster.json' },
      { label: 'A second project, ready to submit', command: `ls ${ANALYSIS}/queues` },
    ] },
    { title: 'Run the first job', items: [
      { label: 'Make a fresh first-job project', command: PREPARE },
      { label: 'Its two jobs', command: 'cat "$project/queues/jobs.txt"' },
      { label: 'Submit them', command: PILOT_SUBMIT },
      { label: 'Check the queue', command: at('pilot', (x) => `rota queue-status --batch_dir ${x}`), needs: 'pilot' },
      { label: 'Its done markers', command: at('pilot', (x) => `ls ${x}/done`), needs: 'pilot' },
      { label: 'Read the answers', command: 'cat "$project/results/3.txt" "$project/results/7.txt"' },
    ] },
    { title: 'Two queues and a priority', items: [
      { label: 'Queue A: 48 jobs of a few minutes', command: SUBMIT_A },
      { label: 'Queue B at the same priority', command: SUBMIT_B },
      { label: 'Raise B above A', command: at('B', (x) => `rota set-priority --batch_dir ${x} --schedule_priority 90`), needs: 'B' },
      { label: 'Back to equal priority', command: at('B', (x) => `rota set-priority --batch_dir ${x} --schedule_priority 50`), needs: 'B' },
      { label: 'Keep B off the worker', command: at('B', (x) => `rota set-priority --batch_dir ${x} --schedule_priority 90,worker=off`), needs: 'B' },
      { label: 'Cap A at 4 workers', command: at('A', (x) => `rota set-max-workers --batch_dir ${x} --max_workers 4`), needs: 'A' },
    ] },
    { title: 'Pause and dependencies', items: [
      { label: 'Pause new starts for A', command: at('A', (x) => `rota pause --batch_dir ${x}`), needs: 'A' },
      { label: 'Resume A', command: at('A', (x) => `rota resume --batch_dir ${x}`), needs: 'A' },
      { label: 'Queue C waits for B', command: b('B') ? SUBMIT_C(world) : null, needs: 'B' },
      { label: "C's status", command: at('C', (x) => `rota queue-status --batch_dir ${x} | grep -E 'lifecycle|blocking_reason|dependency'`), needs: 'C' },
    ] },
    { title: 'Lose a host', items: [
      { label: "Pull the worker's network cable", action: 'unplug' },
      { label: "The worker's own processes", command: 'ps', host: 'worker' },
      { label: 'Which hosts the coordinator can use', command: 'cat /srv/cluster/.rota/adaptive/coordinator.ready' },
      { label: 'Plug the cable back in', action: 'plug' },
      { label: "A's interruptions and holds", command: at('A', (x) => `rota queue-status --batch_dir ${x} | grep -E 'share_interrupted|failure_holds|lifecycle'`), needs: 'A' },
      { label: "The worker's log for A", command: at('A', (x) => `cat ${x}/worker_worker.log`), needs: 'A' },
      { label: 'Accept verified outputs', command: at('A', (x) => `rota confirm-interrupted-jobs --batch_dir ${x} --reason "checked outputs after cable pull"`), needs: 'A' },
      { label: "Clear A's hold on worker", command: at('A', (x) => `rota reset-failures --batch_dir ${x} --host_id worker --reason "cable pulled; outputs audited"`), needs: 'A' },
      { label: 'Audit A against its done markers', command: `rota reconcile --model_dir ${ANALYSIS} --queue a.txt`, needs: 'A' },
      { label: 'Rerun only the missing jobs (after A finishes)', command: `rota reconcile --model_dir ${ANALYSIS} --queue a.txt --rerun_missing`, needs: 'A' },
    ] },
    { title: 'Forecasts and the pool', items: [
      { label: 'Both ETAs, in seconds', command: ETA },
      { label: 'Keep the worker free', command: 'rota set-host-state --host_id worker --state away --reason "owner needs it"' },
      { label: 'Give it back', command: 'rota set-host-state --host_id worker --state present' },
      { label: 'Drain the pool', command: 'rota pool-drain' },
      { label: 'Start a fresh pool', command: 'rota pool-start' },
    ] },
  ].map((g) => ({ ...g, items: g.items.map((i) => ({ host: 'storage', ...i })) }));
}
