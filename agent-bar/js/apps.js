// What each simulated window shows: VS Code with chat tabs and the Codex sidebar, GNOME Terminal running a
// chat, the Antigravity IDE and the Codex app. These are plain stand-ins drawn for the demo, not copies of
// the apps; the chats in them are the fixture's.
import { PROVIDERS } from './fixture.js';
import { esc } from './dom.js';
import { age, duration } from './text.js';

// A few lines of each project's open file, for the editor behind the chat tabs.
const CODE = {
  'sampler-study': ['<span class="kw">def</span> <span class="fn">adapt_step_size</span>(draws, windows=(<span class="num">25</span>, <span class="num">50</span>, <span class="num">100</span>, <span class="num">200</span>)):',
    '    <span class="str">"""Dual averaging over doubling warmup windows."""</span>', '    step = <span class="num">1.0</span>',
    '    <span class="kw">for</span> size <span class="kw">in</span> windows:', '        step = <span class="fn">dual_average</span>(draws[-size:], target=<span class="num">0.8</span>)',
    '    <span class="cm"># the final step size is the average over the last window</span>', '    <span class="kw">return</span> step'],
  'paper-figures': ['<span class="kw">from</span> figures.style <span class="kw">import</span> apply_style, shared_legend', '',
    '<span class="kw">def</span> <span class="fn">figure_3</span>(data):', '    fig, axes = plt.<span class="fn">subplots</span>(<span class="num">1</span>, <span class="num">3</span>, sharey=<span class="kw">True</span>)',
    '    <span class="kw">for</span> ax, panel <span class="kw">in</span> <span class="fn">zip</span>(axes, <span class="str">"ABC"</span>):', '        <span class="fn">draw_panel</span>(ax, data[panel])',
    '    <span class="fn">shared_legend</span>(fig, axes)'],
  'rnaseq-pipeline': ['<span class="kw">def</span> <span class="fn">align</span>(shard, retries=<span class="num">2</span>, memory=<span class="str">"6G"</span>):', '    <span class="kw">for</span> attempt <span class="kw">in</span> <span class="fn">range</span>(retries + <span class="num">1</span>):',
    '        result = <span class="fn">run_star</span>(shard, memory=memory)', '        <span class="kw">if</span> result.ok: <span class="kw">return</span> result'],
  'grant-budget': ['# Budget justification, year 2', '', '## Personnel', 'Two postdoctoral researchers at 50% effort…'],
};

const KIND_NAMES = { vscode: 'Visual Studio Code', terminal: 'Terminal', ide: 'Antigravity IDE', app: 'Codex app' };

/** The window's title, as the window manager shows it (and as Agent Bar matches it). */
export function windowTitle(win, rows) {
  const shown = rows.find((r) => r.key === win.shown);
  if (win.kind === 'vscode') return `${shown && shown.surface === 'tab' ? shown.title : win.file} - ${win.workspace} - Visual Studio Code`;
  if (win.kind === 'terminal') return `${shown ? `${shown.title} — ` : ''}${win.workspace}`;
  if (win.kind === 'ide') return `${win.workspace} — Antigravity`;
  return 'Codex';
}
export const appName = (win) => KIND_NAMES[win.kind];

/** The chat: its conversation, its state and what the visitor can send it. @param {any} row @param {number} now */
export function chatPanel(row, now, { terminal = false, showTitle = false } = {}) {
  const symbol = PROVIDERS[row.provider][0];
  const log = row.log.map((entry, i) => {
    const last = i === row.log.length - 1;
    if (entry.kind === 'approval') {
      return `<div class="msg msg-approval">${terminal ? '' : `${symbol} `}Allow this command?<br><code>${esc(entry.text)}</code>${last && row.pending === 'approval' ? '' : ''}</div>`;
    }
    if (entry.kind === 'question') return `<div class="msg msg-question">${esc(entry.text)}</div>`;
    if (entry.kind === 'answer') return `<div class="msg msg-answer">${terminal ? '' : '✓ '}${esc(entry.text)}</div>`;
    return `<div class="msg msg-${entry.kind}">${esc(entry.text)}</div>`;
  }).join('');
  const status = row.state === 'working' ? `<span class="dot tracker-working"></span><span class="tracker-working">Working · ${duration(Math.max(1, now - row.stateAt))}</span>`
    : row.state === 'waiting' ? '<span class="dot tracker-waiting"></span><span class="tracker-waiting">Waiting on background work</span>'
      : row.pending === 'approval' ? '<span class="dot tracker-attention"></span><span class="tracker-attention">Waiting for your approval</span>'
        : row.pending === 'question' ? '<span class="dot tracker-attention"></span><span class="tracker-attention">Waiting for your answer</span>'
          : row.state === 'idle' ? '<span>New chat</span>' : `<span>Finished · ${age(row.stateAt, now)}</span>`;
  const busy = row.state === 'working';
  const suggestions = busy ? '' : row.prompts.map((p, i) => `<button type="button" class="suggest${i === 0 && row.pending === 'approval' ? ' send' : ''}" data-act="prompt" data-key="${esc(row.key)}" data-text="${esc(p)}" data-fid="suggest-${esc(row.key)}-${i}">${esc(p.length > 80 ? `${p.split('\n')[0].slice(0, 78)}…` : p)}</button>`).join('');
  const hint = busy ? 'Working: wait for its turn to end' : 'Simulated agent: replies are scripted';
  const placeholder = busy ? 'The agent is working…' : row.pending === 'approval' ? 'Allow or deny the command' : 'Write to the agent, or pick a suggestion';
  const input = terminal
    ? `<form class="term-prompt" data-form="prompt" data-key="${esc(row.key)}"><label for="in-${esc(row.id)}">›</label><input id="in-${esc(row.id)}" data-fid="input-${esc(row.key)}" data-draft="${esc(row.key)}" autocomplete="off" spellcheck="false" ${busy ? 'disabled' : ''} aria-label="Message to ${esc(row.title)}" placeholder="${esc(placeholder)}"></form>`
    : `<form class="chat-input" data-form="prompt" data-key="${esc(row.key)}"><textarea rows="2" data-fid="input-${esc(row.key)}" data-draft="${esc(row.key)}" ${busy ? 'disabled' : ''} aria-label="Message to ${esc(row.title)}" placeholder="${esc(placeholder)}"></textarea><div class="chat-suggest"><span class="hint">${hint}</span>${suggestions}</div></form>`;
  return `<div class="chat ${row.provider}" data-chat="${esc(row.key)}">
${showTitle ? `<div class="chat-title"><span class="tracker-${row.provider}">${symbol}</span><span>${esc(row.title)}</span></div>` : ''}
<div class="chat-log" data-keep-scroll="${esc(row.key)}" data-follow tabindex="0" aria-label="Conversation: ${esc(row.title)}">${log}</div>
<div class="chat-status">${status}</div>
${input}${terminal ? `<div class="chat-suggest"><span class="hint">${hint}</span>${suggestions}</div>` : ''}
</div>`;
}

/** The body of one window. @param {any} win @param {any[]} rows @param {number} now @param {boolean} phone */
export function windowBody(win, rows, now, phone) {
  const chats = rows.filter((r) => r.window === win.id);
  if (win.kind === 'terminal') {
    const row = chats[0];
    return `<div class="term">${row ? chatPanel(row, now, { terminal: true }) : ''}</div>`;
  }
  if (win.kind === 'vscode') {
    const tabs = chats.filter((r) => r.surface === 'tab');
    const side = chats.find((r) => r.surface === 'sidebar');
    const shown = chats.find((r) => r.key === win.shown);
    const tab = shown?.surface === 'tab' ? shown : win.shown === null ? null : tabs.find((r) => r.key === win.lastTab) ?? null;
    const tabButtons = [`<button type="button" class="code-tab${tab ? '' : ' active'}" role="tab" aria-selected="${!tab}" data-act="file" data-win="${win.id}" data-fid="tab-${win.id}-file"><span class="tab-label">${esc(win.file)}</span></button>`,
      ...tabs.map((r) => `<button type="button" class="code-tab${tab?.key === r.key ? ' active' : ''}" role="tab" aria-selected="${tab?.key === r.key}" data-act="tab" data-key="${esc(r.key)}" data-fid="tab-${esc(r.key)}"><span class="tracker-claude">✳</span><span class="tab-label">${esc(r.title)}</span></button>`)].join('');
    const code = (CODE[win.workspace] || ['']).map((line, i) => `<div><span class="ln">${i + 1}</span>${line}</div>`).join('');
    const sideFocused = shown?.surface === 'sidebar';
    // On a phone the window shows one pane: the sidebar's chat when it was brought forward, else the editor.
    return `<div class="code-activity" aria-hidden="true"><i class="on"></i><i></i><i></i><i></i></div>
<div class="code-main${phone && sideFocused ? ' hidden' : ''}">
  <div class="code-tabs" role="tablist" aria-label="Editor tabs">${tabButtons}</div>
  ${tab ? chatPanel(tab, now) : `<div class="code-editor" aria-label="${esc(win.file)}">${code}</div>`}
  <div class="code-status"><span class="remote">⇄</span><span>${esc(win.workspace)}</span><span>Python</span><span>UTF-8</span></div>
</div>
${side ? `<aside class="code-side${sideFocused ? ' with-editor' : ''}" aria-label="Codex sidebar"${phone && !sideFocused ? ' hidden' : ''}><div class="code-side-head"><span class="tracker-codex">⌘</span>Codex${sideFocused ? ' · selected' : ''}</div>${chatPanel(side, now, { showTitle: true })}</aside>` : ''}`;
  }
  if (win.kind === 'ide') {
    const row = chats[0];
    return `<div class="ide-side" aria-hidden="true">▾ ${esc(win.workspace)}<br>&nbsp;&nbsp;budget.md<br>&nbsp;&nbsp;justification.md<br>&nbsp;&nbsp;personnel.csv</div>${row ? chatPanel(row, now, { showTitle: true }) : ''}`;
  }
  const row = chats[0];
  return `<nav class="app-side" aria-label="Codex threads"><div class="thread on">${esc(row?.title ?? '')}</div><div class="thread">Plan the spring seminar</div><div class="thread">Reading list for rotation students</div></nav>${row ? chatPanel(row, now, { showTitle: true }) : ''}`;
}
