// The demo's made-up world, after the public-safe fixture Agent Bar's explainer video was captured from
// (agent-bar tmp/agent-bar-video/capture/fixture.py): six projects of an imaginary user, Alex, with
// their chats, windows, messages, tickets, queues, repositories and usage. Nothing here comes from a
// real session. Times are ages in seconds before the demo starts.

const M = 60, H = 3600, D = 86400;

export const FOLDER = '/home/alex/projects';

export const PROVIDERS = {
  claude: ['✳', 'Claude'], codex: ['⌘', 'Codex'], copilot: ['◆', 'Copilot'], antigravity: ['▲', 'Antigravity'],
};

const ID = {
  tune: '5b1c0f2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', warm: '019a7e10-2b3c-7d4e-9f50-61a2b3c4d5e6',
  fig3: '7d2e4f60-3b4c-4d5e-9f60-1b2c3d4e5f61', refs: '8e3f5a71-4c5d-4e6f-a071-2c3d4e5f6172',
  retry: '019a7e21-3c4d-7e5f-a061-72b3c4d5e6f7', qc: '9f4a6b82-5d6e-4f70-b182-3d4e5f617283',
  picker: 'a05b7c93-6e7f-4081-c293-4e5f61728394', budget: 'b16c8da4-7f80-4192-d3a4-5f6172839405',
  notes: '019a7e32-4d5e-7f60-b172-83c4d5e6f708', release: 'c27d9eb5-8091-42a3-e4b5-617283940516',
};
export const KEY = Object.fromEntries(Object.entries(ID).map(([name, id]) => {
  const provider = { warm: 'codex', retry: 'codex', notes: 'codex', picker: 'copilot', budget: 'antigravity' }[name] || 'claude';
  return [name, `${provider}:${id}`];
}));

// Windows: two VS Code windows, three terminals, the Antigravity IDE and the Codex app. `rect` is where each
// sits on a 1376 × 828 work area (the screen less the top bar and dock), scaled to the screen the page has.
export const WINDOWS = [
  { id: 'w-sampler', kind: 'vscode', workspace: 'sampler-study', label: 'Visual Studio Code', file: 'adapt.py',
    rect: [16, 16, 770, 470] },
  { id: 'w-figures', kind: 'vscode', workspace: 'paper-figures', label: 'Visual Studio Code', file: 'fig3.py',
    rect: [360, 150, 700, 440] },
  { id: 'terminal:4410', kind: 'terminal', workspace: 'rnaseq-pipeline', label: 'Terminal', rect: [806, 10, 556, 292] },
  { id: 'terminal:4417', kind: 'terminal', workspace: 'rnaseq-pipeline', label: 'Terminal', rect: [826, 318, 536, 272] },
  { id: 'terminal:4242', kind: 'terminal', workspace: 'web-dashboard', label: 'Terminal', rect: [40, 520, 560, 292] },
  { id: 'ide:5151', kind: 'ide', workspace: 'grant-budget', label: 'Antigravity IDE', rect: [640, 560, 500, 250], minimized: true },
  { id: 'app:6161', kind: 'app', workspace: 'lab-notes', label: 'Codex app', rect: [420, 470, 520, 300], minimized: true },
];

// Each chat: where it is, its state and review reasons when the demo starts, its conversation so far, and
// what it does next. `next` is the turn the visitor can start by sending one of `prompts`; `then` is a
// turn the simulation runs on its own (a working chat finishing). A step is [ticks, kind, text].
export const CHATS = [
  {
    name: 'tune', title: 'Tune the step-size adaptation', project: 'sampler-study', window: 'w-sampler',
    surface: 'tab', state: 'finished', age: 6 * M, unread: [['Reply finished', 6 * M]], cost: 14.82,
    log: [
      ['you', 'How does the warmup choose the step size now?'],
      ['agent', 'I kept the doubling scheme. During warmup, the windows double each time (25, 50, 100, then 200 iterations), and the final step size is the average over the last window, which keeps it stable.'],
      ['you', 'Great, add a test for the final value.'],
      ['agent', 'Added test_final_step_size to tests/test_adapt.py. It runs a short warmup on the funnel model and checks the step size against the average over the last window. All 14 tests pass.'],
    ],
    prompts: ['Commit it and push the branch', 'Rerun the benchmark models with the new windows'],
    next: [[2, 'tool', 'git commit -m "Test the final step size" && git push'],
      [1, 'git', { repo: 'sampler-study', patch: { ahead: 0, staged: 0, modified: 0, untracked: 1, diff: null, commit: 'Test the final step size' } }],
      [2, 'agent', 'Committed 3f2a91c "Test the final step size" and pushed step-size. Pull request #42 picks it up; its checks are running.']],
    alt: { 1: [[3, 'agent', 'benchmark-models is still running with the old windows. Once it finishes I will rerun it with the new ones and compare effective samples per second.']] },
  },
  {
    name: 'warm', title: 'Profile the warmup loop', project: 'sampler-study', window: 'w-sampler',
    surface: 'sidebar', state: 'working', age: 40, cost: 6.10,
    log: [
      ['you', 'Profile the warmup loop with the new windows and tell the step-size chat what you find.'],
      ['tool', 'python -m cProfile -o tmp/warmup.prof scripts/warmup.py'],
    ],
    then: [[3, 'agent', 'The gradient takes 70% of warmup; the adaptation step itself is under 2%.'],
      [2, 'tool', 'agent-bar send claude:5b1c0f2e… "Warmup profile rerun with the new windows: the adaptation step is under 2% of warmup time. Details in tmp/profile-warmup.md."'],
      [1, 'send', 'tune|Warmup profile rerun with the new windows: the adaptation step is under 2% of warmup time. Details in tmp/profile-warmup.md.'],
      [1, 'output', '{"ok": true, "to": "Tune the step-size adaptation", "remaining": 9}'],
      [2, 'agent', 'Profile written to tmp/profile-warmup.md and sent to the step-size chat. The new windows cost nothing measurable.']],
    prompts: ['Profile the sampling phase too'],
    next: [[3, 'tool', 'python -m cProfile -o tmp/sampling.prof scripts/sample.py'], [3, 'agent', 'Sampling spends 81% of its time in the gradient as well; nothing in the sampler loop itself stands out.']],
  },
  {
    name: 'release', title: 'Prepare the 0.4 release', project: 'sampler-study', window: 'w-sampler',
    surface: 'tab', state: 'finished', age: 80 * M, cost: 2.41,
    log: [
      ['you', 'Draft the changelog for 0.4.'],
      ['agent', 'Drafted CHANGELOG.md for 0.4: the new warmup windows, the dual-averaging step size and two bug fixes. Tagging waits for the step-size pull request.'],
    ],
    prompts: ['Add the benchmark numbers to the changelog'],
    next: [[3, 'agent', 'Added a Performance section with the effective samples per second on the three benchmark models.']],
  },
  {
    name: 'fig3', title: 'Redraw figure 3 with shared axes', project: 'paper-figures', window: 'w-figures',
    surface: 'tab', state: 'finished', age: 9 * M, unread: [['Input needed', 9 * M]], cost: 9.45,
    log: [
      ['you', 'Redraw figure 3 so the panels share their axes.'],
      ['agent', 'Panels A and B now share a y axis, and figures/fig3.py draws them from one style. Before I go on:'],
      ['question', 'Should panel C keep its own y axis, or share it with A and B?'],
    ],
    prompts: ['Share it with A and B', 'Keep its own axis'],
    next: [[3, 'tool', 'python figures/fig3.py --check'], [2, 'agent', 'Done: all three panels share one y axis, and the caption now says so. figures/fig3.pdf is redrawn.']],
    alt: { 1: [[3, 'tool', 'python figures/fig3.py --check'], [2, 'agent', 'Done: panel C keeps its own y axis, with a note in the caption that its scale differs.']] },
  },
  {
    name: 'refs', title: 'Check the reference formatting', project: 'paper-figures', window: 'w-figures',
    surface: 'tab', state: 'finished', age: 3 * M, unread: [['Reply finished', 3 * M]], cost: 1.27,
    log: [
      ['you', 'Check the reference formatting against the journal style.'],
      ['agent', 'Fixed 11 references: journal names are abbreviated, and the DOIs are links. Two preprints have since been published; I updated both.'],
    ],
    prompts: ['Recheck the cross-references in section 4'],
    next: [[3, 'tool', 'grep -n "Figure 3" manuscript/section4.tex'], [3, 'agent', 'Section 4 now refers to figure 3 panels A–C by their new letters; the two references to the old panel D point to figure S2.']],
  },
  {
    name: 'retry', title: 'Add retries to the alignment step', project: 'rnaseq-pipeline', window: 'terminal:4410',
    surface: 'terminal', state: 'finished', age: 2 * M, unread: [['Approval needed', 2 * M]], cost: 3.96,
    log: [
      ['you', 'Three alignment shards failed overnight. Retry them with a memory cap.'],
      ['agent', 'They ran out of memory on one host. pipeline/align.py now retries a failed shard up to twice with a 6 GiB cap.'],
      ['approval', 'rota requeue align-shards --failed --memory 6G'],
    ],
    prompts: ['Allow', 'Deny'],
    next: [[2, 'output', 'requeued 3 jobs in align-shards'], [2, 'tool', 'agent-bar send claude:9f4a6b82… "The three failed shards are requeued with a 6 GiB cap; QC can rerun once align-shards finishes."'],
      [1, 'send', 'qc|The three failed shards are requeued with a 6 GiB cap; QC can rerun once align-shards finishes.'],
      [1, 'output', '{"ok": true, "to": "Summarize the QC failures", "remaining": 8}'],
      [2, 'agent', 'Requeued the three shards and told the QC chat. The queue should finish in about 20 minutes.']],
    alt: { 1: [[2, 'agent', 'Understood: I left the queue alone. The failed shards stay failed until they are requeued.']] },
  },
  {
    name: 'qc', title: 'Summarize the QC failures', project: 'rnaseq-pipeline', window: 'terminal:4417',
    surface: 'terminal', state: 'waiting', age: 12 * M, cost: 2.41,
    log: [
      ['you', 'Summarize which samples fail QC and why.'],
      ['agent', 'Six samples fail: four for low mapping rates, two for 3′ bias. The rest of the summary waits on the align-shards queue.'],
    ],
    prompts: ['Rerun QC when the shards are ready'],
    next: [[3, 'agent', 'The alignment chat says the failed shards were retried with a memory cap. I will rerun QC on them once align-shards finishes and update qc/summary.md.']],
  },
  {
    name: 'picker', title: 'Fix the date picker', project: 'web-dashboard', window: 'terminal:4242',
    surface: 'terminal', state: 'working', age: 20,
    log: [
      ['you', 'The date picker overflows on narrow screens. Fix it.'],
      ['tool', 'npm test -- date-picker'],
    ],
    then: [[4, 'output', '12 passing'], [3, 'agent', 'The calendar now wraps to two rows under 420 px, and the input keeps its full width. Tests pass.']],
    prompts: ['Check it in Safari too'],
    next: [[3, 'tool', 'npx playwright test --project=webkit date-picker'], [2, 'agent', 'It renders the same in WebKit; one focus ring was clipped, now fixed.']],
  },
  {
    name: 'budget', title: 'Draft the budget justification', project: 'grant-budget', window: 'ide:5151',
    surface: 'ide', state: 'finished', age: 35 * M,
    log: [
      ['you', 'Draft the budget justification for year 2.'],
      ['agent', 'Drafted justification.md: personnel, two conferences and cluster time, with each figure tied to the budget table.'],
    ],
    prompts: ['Shorten it to one page'],
    next: [[4, 'agent', 'Cut it to one page by merging the travel items and moving the cluster rates to a footnote.']],
  },
  {
    name: 'notes', title: 'Outline the lab meeting notes', project: 'lab-notes', window: 'app:6161',
    surface: 'app', state: 'finished', age: 50 * M, cost: 1.12,
    log: [
      ['you', 'Outline Thursday’s lab meeting notes from the agenda.'],
      ['agent', 'Outlined four sections: sampler benchmarks, figure 3, the alignment retries and next week’s cluster time.'],
    ],
    prompts: ['Add action items'],
    next: [[3, 'agent', 'Added an action item under each section, with an owner and a date.']],
  },
];

// Saved Claude and Codex conversations that are no longer open, for History.
export const SAVED = [
  { provider: 'claude', id: 'd38eafc6-9102-43b4-f5c6-728394051627', title: 'Choose the warmup schedule', project: 'sampler-study',
    last: 3 * D, active: 5400, prompts: 14 },
  { provider: 'codex', id: '019a6f43-5e6f-7071-c283-94d5e6f70819', title: 'Benchmark models: first pass', project: 'sampler-study',
    last: 5 * D, active: 3600, prompts: 9 },
  { provider: 'claude', id: 'e49fb0d7-a213-44c5-a6d7-839405162738', title: 'Set up the figure style', project: 'paper-figures',
    last: 6 * D, active: 2700, prompts: 8 },
  { provider: 'codex', id: '019a6e54-6f70-7182-d394-a5e6f708192a', title: 'Alignment memory limits', project: 'rnaseq-pipeline',
    last: 9 * D, active: 4100, prompts: 11 },
  { provider: 'claude', id: 'f5a0c1e8-b324-45d6-b7e8-940516273849', title: 'Year 2 personnel costs', project: 'grant-budget',
    last: 2 * D, active: 1900, prompts: 6 },
];

// What History searches: the words people and agents wrote in each saved conversation, oldest first.
// Open chats add their own conversation (CHATS[].log) to this.
export const SAVED_MESSAGES = {
  'Choose the warmup schedule': [
    ['you', 'What warmup schedule should the sampler use by default?'],
    ['agent', 'A fixed 1,000 iterations is wasteful on easy models. Doubling windows let the step size settle early and the metric adapt later.'],
    ['you', 'Can we make the warmup shorter if the step size settles early?'],
    ['agent', 'Yes: stop once two consecutive windows agree on the step size within 5%. On the benchmark models that saves about a third of warmup.'],
  ],
  'Benchmark models: first pass': [
    ['you', 'Run the three benchmark models and report effective samples per second.'],
    ['agent', 'Funnel: 410 per second, eight schools: 2,300, logistic regression: 5,100. The funnel has 4 divergences.'],
    ['you', 'Why is the funnel so slow?'],
    ['agent', 'Its curvature changes by orders of magnitude, so the acceptance stays near 0.8 once warmup adapts the step size, but the step size is tiny in the neck.'],
  ],
  'Set up the figure style': [
    ['you', 'Make one style file for every figure in the paper.'],
    ['agent', 'figures/style.py sets the fonts, line widths and a colour-blind-safe palette; each figure script imports it.'],
    ['you', 'Use a shared legend where panels repeat the same series.'],
    ['agent', 'Figure 2 now has one legend under its panels. Figure 3 can use the same helper once its axes are shared.'],
  ],
  'Alignment memory limits': [
    ['you', 'How much memory does an alignment shard need?'],
    ['agent', 'The largest shards peak at 5.2 GiB; most stay under 3 GiB. A 6 GiB limit per job leaves headroom.'],
    ['you', 'Which hosts can run them?'],
    ['agent', 'All four, but mac-1 is often in use by its owner, so the scheduler skips it while its owner is active.'],
  ],
  'Year 2 personnel costs': [
    ['you', 'Draft the year 2 personnel costs.'],
    ['agent', 'Two postdocs at 50% effort and one graduate student, with a 3% raise; the total is in budget.md.'],
  ],
};

// Notes between chats when the demo starts: sender, recipient, body, age, whether read.
export const MESSAGES = [
  ['warm', 'tune', 'Warmup profile is in tmp/profile-warmup.md: 70% of the time is the gradient. The adaptation step itself is cheap, so the new windows are fine to keep.', 40 * M, true],
  ['tune', 'warm', 'Thanks. I kept the windows and added a test for the final step size (commit 3f2a91c).', 30 * M, true],
  ['retry', 'qc', 'Three alignment shards failed on one host with out-of-memory errors; the retries now cap memory. QC can rerun once the queue finishes.', 8 * M, false],
  ['fig3', 'refs', 'Figure 3 now has a shared y axis; its caption numbers changed, please recheck the cross-references in section 4.', 5 * M, false],
];

// Tickets: body, project, conditions, age, and for a scheduled message its recipient and repeat.
export const TICKETS = [
  { id: 1, body: 'Rerun the QC summary on the retried shards', project: 'rnaseq-pipeline', age: 3 * H,
    after: [{ kind: 'date', in: -2 * H, label: 'an hour after it was written' }] },
  { id: 2, body: 'Fable audit of the sampler code before the release', project: 'sampler-study', age: 2 * H,
    after: [{ kind: 'reset', provider: 'claude', label: 'Claude weekly limit resets' }] },
  { id: 3, body: 'Draft the weekly progress update from the checklists', project: 'paper-figures', age: D,
    after: [{ kind: 'date', in: 4 * D + H, label: 'then every week' }], to: 'fig3', repeat: 'week' },
  { id: 4, body: 'Check the benchmark results against the reference runs', project: 'sampler-study', age: 5 * H,
    after: [{ kind: 'date', in: -H }] },
  { id: 5, body: 'Update the docs once the step-size PR merges', project: 'sampler-study', age: H, author: 'tune',
    after: [{ kind: 'ticket', ticket: 2, label: 'ticket #2 is done' }] },
];

// ROTA queues (an optional extra).
export const QUEUES = [
  { id: 'q-bench', project: 'sampler-study', number: 1, label: 'benchmark-models', state: 'RUNNING', done: 268, total: 400,
    workers: 6, age: 2 * H, priority: 60, gpu: 1, reserved: 'gpu-1 2', cpu: 83.1, rate: 3 },
  { id: 'q-sens', project: 'sampler-study', number: 2, label: 'sensitivity-grid', state: 'PENDING', done: 0, total: 120,
    workers: 0, age: 10 * M, priority: 40, hold: 'the shared drive is busy (smb_high)' },
  { id: 'q-align', project: 'rnaseq-pipeline', number: 1, label: 'align-shards', state: 'RUNNING', done: 611, total: 700,
    workers: 10, age: 5 * H, priority: 50, failed: 3, failedAt: '10:42', memory: '6 GiB', cpu: 73.3, cpuFailed: 0.4, rate: 2 },
];

export const HOSTS = [
  { id: 'workstation', cores: 16, busy: 38, load: 6.1, slots: 14, memory: [31, 64], budget: '14 CPU · 48 GiB' },
  { id: 'gpu-1', cores: 24, busy: 52, load: 12.5, slots: 22, memory: [52, 128], budget: '22 CPU · 112 GiB · GPU 2 slots' },
  { id: 'node-2', cores: 32, busy: 71, load: 22.7, slots: 30, memory: [161, 256], budget: '30 CPU · 224 GiB' },
  { id: 'mac-1', cores: 12, busy: 9, load: 1.1, slots: 10, memory: [7, 32], budget: '10 CPU · 24 GiB', away: 'its owner is active' },
];

// Repositories with an open chat, for Git.
export const REPOS = [
  { name: 'rnaseq-pipeline', branch: 'retries', ahead: 1, staged: 1, modified: 0, untracked: 0, commit: 'Retry failed alignment shards',
    commitAge: 21 * M, diff: [6, 4, 1], open: true,
    pull: { number: 7, state: 'open', review: 'review required', checks: 'pending', title: 'Retry failed alignment shards' } },
  { name: 'sampler-study', branch: 'step-size', ahead: 2, staged: 1, modified: 2, untracked: 1, commit: 'Adapt the step size during warmup',
    commitAge: 51 * M, diff: [139, 12, 3], open: true,
    pull: { number: 42, state: 'open', review: 'approved', checks: 'passing', title: 'Adapt the step size during warmup' } },
  { name: 'paper-figures', branch: 'main', ahead: 0, staged: 1, modified: 1, untracked: 0, commit: 'Redraw figure 2 with a shared legend',
    commitAge: 3 * H, diff: [47, 8, 2], open: true },
  { name: 'grant-budget', branch: 'main', ahead: 0, staged: 1, modified: 0, untracked: 2, commit: 'Draft year 2 personnel costs',
    commitAge: 6 * H, diff: [16, 4, 1], open: false },
  { name: 'web-dashboard', branch: 'main', ahead: 0, staged: 0, modified: 0, untracked: 0, commit: 'Fix the date picker on narrow screens',
    commitAge: 2 * D, open: false },
];

// Usage limits: percent used, hours to reset, pace in points per hour (by the last day, or this window),
// and for weekly limits the points used on each of the last days (first part: a scoped model).
export const LIMITS = {
  claude: [
    { key: 'weekly', name: 'Weekly', percent: 36, reset: 3 * 24 + 5, pace: 0.46, basis: 'day',
      days: [['Sat', 0.4, 0.7], ['Sun', 2.7, 5.2], ['Mon', 3.4, 6.7], ['Tue', 3.4, 6.4], ['Wed', 2.4, 4.7]], parts: ['Fable', 'Other'] },
    { key: 'weekly:Fable', name: 'Weekly · Fable', percent: 41, reset: 3 * 24 + 5, pace: 0.53, basis: 'day', share: [12.3, 30] },
    { key: 'session', name: '5-hour', percent: 46, reset: 2 + 10 / 60, pace: 16.4, basis: 'window' },
  ],
  codex: [
    { key: 'weekly', name: 'Weekly', percent: 79, reset: 24 + 20, pace: 0.75, basis: 'day',
      days: [['Fri', 0, 5.6], ['Sat', 0, 15.4], ['Sun', 0, 17.2], ['Mon', 0, 18.2], ['Tue', 0, 16.8], ['Wed', 0, 12.3]] },
    { key: 'session', name: '5-hour', percent: 31, reset: 3 + 40 / 60, pace: 23.8, basis: 'window' },
  ],
};

// Each day's estimated cost at API prices, oldest first, by provider and model.
export const SPEND = {
  claude: { 'claude-opus-5-5': [9.41, 26.07, 14.62, 21.18, 33.54, 18.9, 12.33], 'claude-fable-5-2': [4.12, 11.86, 0, 7.45, 15.2, 6.08, 5.71] },
  codex: { 'gpt-6.2-astra': [18.37, 9.62, 31.05, 12.48, 0, 24.91, 16.26] },
};

// Info: hooks, skills and instruction files per project (the same for every project here but the skills).
export const INFO = {
  hooks: [
    ['Claude', 'Agent Bar lifecycle observer', 'Run agent_bar.hook', 'Reports turn and tool events to Agent Bar and surfaces unread agent messages at turn start.', 'UserPromptSubmit, Stop, StopFailure, PermissionRequest, SessionEnd', '~/.claude/settings.json'],
    ['Claude', 'Agent Bar message waiter', 'Run agent_bar.hook wait', 'Wakes an idle Claude chat when another agent sends it a message and waking is enabled.', 'Stop (in the background)', '~/.claude/settings.json'],
    ['Codex', 'Agent Bar lifecycle observer', 'Run agent_bar.hook', 'Reports turn events to Agent Bar and surfaces unread agent messages at turn start.', 'UserPromptSubmit, Stop', '~/.codex/hooks.json'],
  ],
  projectHooks: { 'sampler-study': [['Claude', 'Format on save', 'Run ruff format', 'Formats Python files after edits.', 'PostToolUse · Edit|Write', 'sampler-study/.claude/settings.json']] },
  skills: { 'paper-figures': [['plotting', 7]], 'sampler-study': [['plotting', 7]] },
  synced: [['agent-messages', 23]],
  instructions: { 'sampler-study': ['AGENTS.md', 'CLAUDE.md'], 'paper-figures': ['CLAUDE.md'] },
};

export const AGES = { M, H, D };

// Task checklists agents keep in tmp/agent/checklists/ (Agent Bar's list button shows them).
export const CHECKLISTS = {
  'sampler-study': [
    { title: 'Step-size adaptation', file: 'step-size-adaptation.md', age: M, done: 2, total: 5, editor: 'tune', edited: 21 * M,
      next: 'Compare acceptance rates on the three benchmark models.', user: 'Choose the target acceptance rate for the paper runs.',
      waiting: 'Benchmark queue on the cluster (about 2 hours).' },
    { title: 'Release 0.4', file: 'release.md', age: M, done: 1, total: 2, next: 'Tag and publish' },
  ],
  'paper-figures': [
    { title: 'Figure 3', file: 'figure-3.md', age: H, done: 1, total: 3, next: 'Redraw panel C with the new colors.',
      deferred: 'Supplementary version at full resolution.' },
  ],
};
