// Agent Bar's dropdown, as extension.js `_buildMenu` and its `_render*` methods lay it out: the heading with its
// counts, the nine tabs, search, sort and filter, the tab's rows, and a footer line; also the Settings and Guide
// pages, the side panels (checklists, scheduling a message), the ▾ window list and +N more.
import { CHECKLISTS, PROVIDERS } from './fixture.js';
import { esc, icon } from './dom.js';
import { age, clock, dollars, duration, plural, quotaProjection, quotaStyle, resetTime, tokenCount } from './text.js';
import { matchSpans } from './sim.js';

export const TABS = [['conversations', 'Chats'], ['queues', 'Queues'], ['cluster', 'Cluster'], ['git', 'Git'], ['messages', 'Messages'],
  ['tickets', 'Tickets'], ['history', 'History'], ['quota', 'Quota'], ['info', 'Info']];
const FILTERS = [['all', 'All'], ...Object.entries(PROVIDERS).map(([key, [symbol, name]]) => [key, `${symbol} ${name}`]),
  ['review', 'Needs review'], ['active', 'Working or waiting']];
const PICKERS = {
  projectOrder: [['activity', 'Activity'], ['total', 'Total activity'], ['review', 'Review first'], ['completion', 'Latest reply'], ['name', 'Name']],
  historyOrder: [['activity', 'Activity'], ['total', 'Total activity'], ['name', 'Name']],
  queueOrder: [['completion', 'Completion'], ['activity', 'Recent activity'], ['name', 'Name']],
  gitOrder: [['changes', 'Changes first'], ['recent', 'Last commit'], ['name', 'Name']],
  queueFilter: [['counted', 'Since last turn'], ['active', 'Running or queued'], ['finished', 'Finished'], ['all', 'All seen']],
  gitFilter: [['all', 'All'], ['changes', 'Uncommitted'], ['unpushed', 'Unpushed']],
  messageFilter: [['all', 'All'], ['unread', 'Unread']],
};
const SEARCH_HINTS = { info: 'Search hooks and skills…', tickets: 'Search tickets…', queues: 'Search projects and queues…',
  git: 'Search repositories and branches…', messages: 'Search messages and chats…' };
const symbolOf = (key) => PROVIDERS[key.split(':')[0]]?.[0] || '•';
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const stateStyle = (state) => ({ working: 'working', RUNNING: 'working', waiting: 'waiting', finished: 'finished', COMPLETED: 'finished',
  failed: 'failed', FAILED: 'failed' })[state] || 'muted';

/** The dropdown's state that the page keeps between renders. */
export function menuState() {
  return {
    view: 'conversations', page: null, picker: null, side: null, chatQuery: '', otherQuery: '',
    filter: 'all', historyFilter: 'all', queueFilter: 'counted', gitFilter: 'all', messageFilter: 'all',
    order: { projectOrder: 'activity', historyOrder: 'activity', queueOrder: 'completion', gitOrder: 'changes' },
    collapsed: new Set(), collapsedSeen: new Set(), openMessages: new Map(), context: null, infoProject: 'sampler-study',
    openHooks: new Set(), openControls: new Set(), ticketDraft: null, copied: null,
  };
}
const isChatList = (m) => m.view === 'conversations' || m.view === 'history';
export const searchHint = (m) => isChatList(m) ? 'Search titles and messages · filter with repo:name' : SEARCH_HINTS[m.view] || 'Search…';
export const query = (m) => (isChatList(m) ? m.chatQuery : m.otherQuery);
export const bare = (m) => m.view === 'quota' || m.view === 'cluster';

// ------------------------------------------------------------------ the frame
export function headingHtml(sim, m) {
  const snap = sim.snapshot();
  const cluster = !m.page && m.view === 'cluster';
  const title = { settings: 'Settings', help: 'Guide' }[m.page] || (cluster ? 'Cluster' : 'Agents');
  const subtitle = m.page === 'settings' ? 'Saved to ~/.config/agent-bar/settings.json' : m.page === 'help' ? 'What the top bar and this menu show'
    : cluster ? `${sim.state.hosts.length} hosts · updated just now` : `${snap.rows.length} chats open · ${snap.windows.length} windows`;
  let stats = [];
  if (cluster) {
    const hosts = sim.state.hosts;
    const cores = hosts.reduce((n, h) => n + h.cores, 0);
    const cpu = Math.round(hosts.reduce((n, h) => n + h.busy * h.cores, 0) / cores);
    const [used, total] = hosts.reduce(([u, t], h) => [u + h.memory[0], t + h.memory[1]], [0, 0]);
    const busy = sim.state.queues.reduce((n, q) => n + (q.state === 'RUNNING' ? q.workers : 0), 0) + 19;
    stats = [[`${cpu}%`, 'CPU', 'muted'], [`${busy} / ${hosts.reduce((n, h) => n + h.slots, 0)}`, 'busy / job slots', 'muted'], [`${Math.round(100 * used / total)}%`, 'memory', 'muted']];
  } else if (!m.page) {
    stats = [[snap.counts.review, 'needs review', 'attention'], [snap.counts.working, 'working', 'working'], [snap.counts.waiting, 'waiting', 'waiting']];
  }
  const button = (target, child, name) => {
    const back = m.page === target;
    return `<button type="button" class="tracker-gear${back ? ' tracker-back' : ''}" data-act="page" data-page="${target}" data-fid="page-${target}" aria-label="${back ? 'Back to the current tab' : name}" title="${back ? 'Back' : name}">${back ? '◀' : child}</button>`;
  };
  return `<div class="tracker-heading"><div class="tracker-heading-main"><span class="tracker-heading-title">${title}</span><span class="tracker-detail">${esc(subtitle)}</span></div>
${stats.map(([value, caption, tone]) => `<div class="tracker-summary"><span class="tracker-summary-value tracker-${tone}">${value}</span><span class="tracker-detail">${caption}</span></div>`).join('')}
<div class="tracker-header-actions">${button('help', '<span class="tracker-help-mark">?</span>', 'What the symbols and colors mean')}${button('settings', icon.gear(16), 'Settings')}</div></div>`;
}

export function tabsHtml(m) {
  if (m.page) return '';
  return `<div class="tracker-item"><div class="tracker-filters tracker-tabs" role="tablist" aria-label="Agent Bar tabs">${TABS.map(([value, label]) =>
    `<button type="button" class="tracker-filter" role="tab" id="tab-${value}" aria-selected="${m.view === value}" aria-controls="tracker-panel" tabindex="${m.view === value ? 0 : -1}" data-act="tab" data-view="${value}" data-fid="tab-${value}">${label}</button>`).join('')}</div></div>`;
}

function pickerButton(name, caption, options, current, active) {
  const value = options.find(([v]) => v === current)?.[1] ?? current;
  return `<button type="button" class="tracker-picker${active ? ' tracker-picker-active' : ''}" data-act="picker" data-picker="${name}" data-fid="picker-${name}" aria-haspopup="listbox" aria-expanded="false" aria-label="${caption}: ${esc(value)}"><span class="tracker-picker-caption">${caption}:</span> <span class="tracker-picker-value">${esc(value)}</span> <span class="tracker-picker-caption">▾</span></button>`;
}
/** The pickers a tab offers, as [name, caption, options, current, active]. */
function pickers(sim, m) {
  const v = m.view;
  if (v === 'info') return [['infoProject', 'Project', infoProjects(sim).map((p) => [p, p]), m.infoProject, true]];
  if (v === 'tickets') return [];
  if (v === 'messages') return [['messageFilter', 'Filter', PICKERS.messageFilter, m.messageFilter, m.messageFilter !== 'all']];
  const sortKey = { history: 'historyOrder', queues: 'queueOrder', git: 'gitOrder' }[v] || 'projectOrder';
  const filter = v === 'queues' ? ['queueFilter', PICKERS.queueFilter, m.queueFilter] : v === 'git' ? ['gitFilter', PICKERS.gitFilter, m.gitFilter]
    : v === 'history' ? ['historyFilter', FILTERS.slice(0, 3), m.historyFilter] : ['filter', FILTERS, m.filter];
  return [[sortKey, 'Sort', PICKERS[sortKey], m.order[sortKey], false], [filter[0], 'Filter', filter[1], filter[2], filter[2] !== 'all']];
}
export function pickerOptions(sim, m, name) {
  return pickers(sim, m).find(([n]) => n === name);
}
export function choosePicker(m, name, value) {
  if (name in m.order) m.order[name] = value;
  else m[name] = value;
}

export function toolbarHtml(sim, m) {
  if (m.page || bare(m)) return '';
  const buttons = pickers(sim, m).map(([name, caption, options, current, active]) => pickerButton(name, caption, options, current, active)).join('');
  const history = m.view === 'history' ? `<span class="tracker-toolbar-fill"></span><span class="tracker-sort-note">Scanned 3h ago</span><button type="button" class="tracker-bulk" data-act="rescan" data-fid="rescan" aria-label="Rescan saved conversations" title="Rescan saved conversations">${icon.refresh(16)}</button>` : '<span class="tracker-toolbar-fill"></span>';
  const bulk = ['git', 'messages', 'info'].includes(m.view) ? '' : `<button type="button" class="tracker-filter tracker-bulk-toggle" data-act="bulk" data-fid="bulk">${m.collapsedAny ? 'Expand all' : 'Collapse all'}</button>`;
  return `<div class="tracker-item"><div class="tracker-toolbar">${buttons}${history}${bulk}</div></div>`;
}

export function footerText(sim, m) {
  if (m.page === 'settings') return 'Changes apply immediately';
  if (m.page === 'help') return 'Colors follow Settings › Appearance › State colors';
  const t = sim.now();
  return {
    queues: `ROTA updated ${age(sim.state.queueUpdated, t)} · a new turn clears that project’s finished queues`,
    history: 'Saved chats · scanned daily · click to open or resume',
    messages: 'Chats receive unread counts when their next turn starts.',
    tickets: 'A ticket is ready when all its conditions are met.',
    info: 'Project hooks, skills and instructions · refreshed when viewed',
    cluster: 'From the ROTA collector · CPU over job slots, all hosts',
    quota: 'Local Claude and Codex usage · checked every minute',
    git: 'Open repositories, 1m ago · ↑ ahead / ↓ behind at last fetch · click for Source Control',
  }[m.view] || 'Top bar: needs review / open chats   ·   Q finished / total tracked';
}

// A collapsible group: heading button with ⌄ or ›, context and summary, optional controls and a line below.
function section(m, key, title, context, summary, { highlight = false, controls = '', below = '', body = '', search = '' } = {}) {
  m.keys.push(key);
  const collapsed = m.collapsed.has(key) && !search;
  return `<div class="tracker-project${collapsed ? ' collapsed' : ''}"><div class="tracker-project-header-item">${below ? '<div style="flex:1;min-width:0">' : ''}<button type="button" class="tracker-project-header${below ? ' tracker-project-header-stacked' : ''}" data-act="collapse" data-section="${esc(key)}" data-fid="sec-${esc(key)}" aria-expanded="${!collapsed}"><span class="tracker-project-heading"><span class="tracker-muted" aria-hidden="true">${collapsed ? '›' : '⌄'}</span><span class="tracker-project-name">${mark(title, search)}</span>${context ? `<span class="tracker-project-context">${esc(context)}</span>` : ''}<span class="tracker-project-total${highlight ? ' tracker-attention' : ''}">${esc(summary)}</span></span></button>${below}${below ? '</div>' : ''}${controls}</div>${collapsed ? '' : body}</div>`;
}
/** Bold underlined matches of the search words in a label. */
function mark(text, search) {
  const words = (search || '').toLowerCase().replace(/repo:\S+/g, '').split(/\s+/).filter(Boolean);
  const spans = words.length ? matchSpans(text, words) : null;
  if (!spans) return esc(text);
  let out = '', at = 0;
  for (const [a, b] of spans) {
    if (a < at) continue;
    out += `${esc(text.slice(at, a))}<b>${esc(text.slice(a, b))}</b>`;
    at = b;
  }
  return out + esc(text.slice(at));
}
const windowControls = (id) => `<span class="tracker-window-controls"><button type="button" class="tracker-window-control" data-act="return-window" data-win="${id}" data-fid="ret-${id}" aria-label="Return the window to its previous place" data-tip="Return the window to its previous place">${icon.restore()}</button><button type="button" class="tracker-window-control" data-act="place-window" data-win="${id}" data-fid="place-${id}" aria-label="Maximize the window on the main display" data-tip="Maximize the window on the main display">${icon.maximize()}</button></span>`;
const providerLabel = (provider, search = '') => `<span class="tracker-row-provider"><span class="tracker-provider-symbol tracker-${provider}">${PROVIDERS[provider][0]}</span><span class="tracker-provider-name tracker-${provider}">${mark(PROVIDERS[provider][1], search)}</span></span>`;
const copyButton = (m, text, name, id, compact = true) => `<button type="button" class="tracker-copy${compact ? ' tracker-copy-compact' : ''}" data-act="copy" data-text="${esc(text)}" data-fid="copy-${esc(id)}" aria-label="${esc(name)}" data-tip="${esc(name)}">${m.copied === id ? '<span class="tracker-copied">✓</span>' : icon.copy()}${compact ? '' : ' Copy'}</button>`;

function chatIdentity(sim, row) {
  const resume = { claude: `claude --resume ${row.id}`, codex: `codex resume ${row.id}` }[row.provider];
  return [row.title, `Chat: ${row.key}`, `Project: ${row.project}`, `Folder: ${sim.folder}/${row.project}`, ...(resume ? [`Resume: ${resume}`] : [])].join('\n');
}

// ------------------------------------------------------------------ Chats
function groupProjects(rows, order) {
  const projects = new Map();
  for (const row of rows) {
    if (!projects.has(row.project)) projects.set(row.project, { name: row.project, rows: [], windows: new Map() });
    const p = projects.get(row.project);
    p.rows.push(row);
    if (!p.windows.has(row.window)) p.windows.set(row.window, []);
    p.windows.get(row.window).push(row);
  }
  const completion = (row) => (row.state === 'finished' ? row.stateAt : 0);
  const recent = (a, b) => b.stateAt - a.stateAt || a.title.localeCompare(b.title);
  for (const p of projects.values()) {
    for (const list of p.windows.values()) list.sort(order === 'completion' ? (a, b) => completion(b) - completion(a) || recent(a, b) : recent);
    p.review = p.rows.filter((r) => r.unread.length).length;
    p.active = Math.max(...p.rows.map((r) => r.stateAt));
    p.completed = Math.max(...p.rows.map(completion));
  }
  const by = { activity: (a, b) => b.active - a.active, total: (a, b) => b.rows.length - a.rows.length || b.active - a.active,
    review: (a, b) => Number(b.review > 0) - Number(a.review > 0) || b.completed - a.completed,
    completion: (a, b) => b.completed - a.completed, name: () => 0 }[order];
  return [...projects.values()].sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
}
function matchesFilter(row, filter) {
  if (filter === 'all') return true;
  if (filter === 'review') return row.unread.length > 0;
  if (filter === 'active') return row.state === 'working' || row.state === 'waiting';
  return row.provider === filter;
}

function chatsBody(sim, m, snap) {
  const q = m.chatQuery;
  const lookup = q.trim() ? new Map(sim.search(q).filter((h) => h.chat.open).map((h) => [h.chat.key, h])) : null;
  const rows = snap.rows.filter((row) => matchesFilter(row, m.filter) && (!lookup || lookup.has(row.key) || !['claude', 'codex'].includes(row.provider) && titleMatch(row, q)));
  if (!rows.length) return `<div class="tracker-empty">${q ? 'No matching open conversations' : 'No open conversations'}</div>`;
  return groupProjects(rows, m.order.projectOrder).map((p) => {
    const queues = sim.queueCounts().projects[p.name];
    const summary = (p.review ? `${p.review} review / ${p.rows.length}` : `${p.rows.length} open`) + (queues?.total ? ` · Q ${queues.done}/${queues.total}` : '');
    const multiple = p.windows.size > 1;
    let index = 0;
    const body = [...p.windows].map(([id, list]) => {
      const win = snap.windows.find((w) => w.id === id);
      const heading = multiple ? `<div class="tracker-window-row"><span class="tracker-window-heading">${win.kind === 'vscode' ? `Window ${++index}` : win.label} · Main display</span>${windowControls(id)}</div>` : '';
      return heading + list.map((row) => conversation(sim, m, snap, row, lookup?.get(row.key))).join('');
    }).join('');
    return section(m, `chats:${p.name}`, p.name, multiple ? `${p.windows.size} windows` : 'Main display', summary,
      { highlight: !!(p.review || queues?.done), controls: multiple ? '' : windowControls([...p.windows.keys()][0]), body, search: q });
  }).join('');
}
function titleMatch(row, q) {
  const words = q.toLowerCase().replace(/repo:\S+/g, '').split(/\s+/).filter(Boolean);
  return !words.length || !!matchSpans(`${row.title} ${row.project} ${PROVIDERS[row.provider][1]}`, words);
}

function conversation(sim, m, snap, row, hit) {
  const t = snap.now;
  const borrowed = snap.borrowed[row.window];
  const action = borrowed?.key === row.key && m.menuFocus === row.window ? ' · click to return' : '';
  const state = cap(row.state);
  const surface = { terminal: ' · terminal', ide: ' · Antigravity IDE', app: ' · Codex app' }[row.surface] || '';
  const letters = row.letters ? ` · ✉ ${row.letters} unread` : '';
  const spent = sim.state.settings.costs && row.cost != null && ['claude', 'codex'].includes(row.provider) ? ` · ${dollars(row.cost)} at API prices` : '';
  const actions = [];
  const lists = CHECKLISTS[row.project];
  if (lists && ['claude', 'codex'].includes(row.provider)) {
    const user = lists.filter((l) => l.user).length;
    const name = `${plural(lists.length, 'checklist')} in this project · ${plural(lists.reduce((n, l) => n + l.total - l.done, 0), 'open item')}${user ? ` · ${user} need${user === 1 ? 's' : ''} you` : ''}`;
    actions.push(`<button type="button" class="tracker-copy tracker-copy-compact" data-act="side" data-side="checklists" data-key="${esc(row.key)}" data-fid="lists-${esc(row.key)}" aria-pressed="${m.side?.kind === 'checklists' && m.side.key === row.key}" aria-label="${esc(name)}" data-tip="${esc(name)}">${icon.list()}${user ? `<span class="tracker-attention">${user}</span>` : ''}</button>`);
  }
  if (['claude', 'codex'].includes(row.provider)) {
    const count = sim.state.tickets.filter((x) => x.to === row.key && x.status === 'open').length;
    const name = count ? `${plural(count, 'message')} scheduled; schedule another` : 'Schedule a message to this chat';
    actions.push(`<button type="button" class="tracker-copy tracker-copy-compact" data-act="side" data-side="schedule" data-key="${esc(row.key)}" data-fid="sched-${esc(row.key)}" aria-pressed="${m.side?.kind === 'schedule' && m.side.key === row.key}" aria-label="${esc(name)}" data-tip="${esc(name)}">${icon.alarm()}${count ? `<span>${count}</span>` : ''}</button>`);
    actions.push(`<button type="button" class="tracker-copy tracker-copy-compact" data-act="export" data-key="${esc(row.key)}" data-fid="export-${esc(row.key)}" aria-label="Export this chat's messages as HTML to Downloads and open it" data-tip="Export this chat's messages as HTML to Downloads and open it">${icon.save()}</button>`);
  }
  actions.push(copyButton(m, chatIdentity(sim, row), "Copy the chat's name, id and folder", `chat-${row.key}`));
  const chip = row.unread.length ? ['Needs review', 'attention'] : [state, stateStyle(row.state)];
  const reasons = row.unread.filter((r) => r !== 'Reply finished');
  const excerpt = hit ? historyExcerpt(sim, m, row.key, hit) : '';
  return `<div class="tracker-conversation${row.unread.length ? ' tracker-unread' : ''}" role="button" tabindex="0" data-act="row" data-key="${esc(row.key)}" data-win="${esc(row.window)}" data-fid="row-${esc(row.key)}" aria-label="${esc(`${PROVIDERS[row.provider][1]}: ${row.title}, ${row.unread.length ? 'needs review' : state}${action}`)}">
${providerLabel(row.provider, m.chatQuery)}<div class="tracker-row"><div class="tracker-row-heading"><span class="tracker-title tracker-title-full">${mark(row.title, m.chatQuery)}</span><span class="tracker-row-actions">${actions.join('')}<span class="tracker-chip tracker-chat-state tracker-chip-${chip[1]}">${chip[0]}</span></span></div>
<span class="tracker-detail tracker-${stateStyle(row.state)}">${esc(`${state} · ${age(row.stateAt, t)}${surface}${letters}${spent}${action}`)}</span>
${reasons.length ? `<span class="tracker-reason tracker-attention">${esc(reasons.join(' · '))}</span>` : ''}${excerpt}</div></div>`;
}

// ------------------------------------------------------------------ History
function historyBody(sim, m, snap) {
  const q = m.chatQuery.trim();
  const hits = sim.search(q).filter((h) => m.historyFilter === 'all' || h.chat.provider === m.historyFilter);
  if (!hits.length) return `<div class="tracker-empty">${q ? 'No saved chats match' : 'No saved chats yet'}</div>`;
  const groups = new Map();
  const value = m.order.historyOrder === 'total' ? (h) => h.chat.active : (h) => h.chat.last;
  for (const hit of [...hits].sort((a, b) => value(b) - value(a))) {
    if (!groups.has(hit.chat.project)) groups.set(hit.chat.project, []);
    groups.get(hit.chat.project).push(hit);
  }
  let list = [...groups];
  if (m.order.historyOrder === 'name') list.sort(([a], [b]) => a.localeCompare(b));
  return list.map(([project, items]) => {
    const key = `history:${project}`;
    // History folders start collapsed, unless a search is showing their hits.
    if (!m.collapsedSeen.has(key)) { m.collapsedSeen.add(key); m.collapsed.add(key); }
    const open = items.filter((h) => h.chat.open).length;
    const latest = Math.max(...items.map((h) => h.chat.last));
    const body = items.map((h) => historyItem(sim, m, snap, h)).join('');
    return section(m, key, project, sim.folder, `${plural(items.length, 'chat')} · ${open} open · ${age(latest, snap.now)}`, { body, search: q });
  }).join('');
}
function historyItem(sim, m, snap, hit) {
  const chat = hit.chat;
  const t = snap.now;
  const started = new Date(chat.started * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const detail = `${age(chat.last, t)} · ${plural(chat.prompts, 'prompt')} · ${duration(chat.active)} active · started ${started}`;
  const contextOpen = m.context?.key === chat.key;
  const showContext = hit.messages.length ? `<button type="button" class="tracker-copy" data-act="context" data-key="${esc(chat.key)}" data-fid="ctx-${esc(chat.key)}" aria-expanded="${contextOpen}">${contextOpen ? 'Hide context' : 'Show context'}</button>` : '';
  const row = snap.rows.find((r) => r.key === chat.key);
  const actions = `<button type="button" class="tracker-copy tracker-copy-compact" data-act="export" data-key="${esc(chat.key)}" data-fid="hexport-${esc(chat.key)}" aria-label="Export this chat's messages as HTML to Downloads and open it" data-tip="Export this chat's messages as HTML to Downloads and open it">${icon.save()}</button>${showContext}${copyButton(m, `${chat.title}\nChat: ${chat.key}\nProject: ${chat.project}\nFolder: ${sim.folder}/${chat.project}`, "Copy the chat's name, id and folder", `hist-${chat.key}`)}<button type="button" class="tracker-copy" data-act="${row ? 'row' : 'resume'}" data-key="${esc(chat.key)}" data-win="${esc(row?.window ?? '')}" data-fid="open-${esc(chat.key)}">${row ? 'Open' : 'Resume'}</button>`;
  return `<div class="tracker-conversation">${providerLabel(chat.provider, m.chatQuery)}<div class="tracker-row"><div class="tracker-row-heading"><span class="tracker-title tracker-title-full">${mark(chat.title, m.chatQuery)}</span><span class="tracker-row-actions">${actions}</span></div><span class="tracker-detail">${esc(detail)}</span>${historyExcerpt(sim, m, chat.key, hit)}</div></div>`;
}
const who = (kind) => (kind === 'you' ? 'You' : 'Agent');
/** The best hit's excerpt, or with Show context the message around it, with ‹ › through every hit. */
function historyExcerpt(sim, m, key, hit) {
  if (!hit.messages.length) return hit.titled ? '<span class="tracker-history-hit">Title match</span>' : '';
  if (m.context?.key !== key) {
    const best = hit.messages[0];
    return `<span class="tracker-history-hit">${who(best.who)} · ${excerpt(best.body, best.spans)}</span>`;
  }
  // Every occurrence, newest message first: [message, span].
  const stops = hit.messages.flatMap((msg) => msg.spans.map((span) => [msg, span]));
  const at = Math.min(m.context.index, stops.length - 1);
  const [msg, span] = stops[at];
  const inMessage = msg.spans.findIndex((s) => s === span);
  const chat = hit.chat;
  const before = chat.messages[msg.index - 1], after = chat.messages[msg.index + 1];
  const order = hit.messages.indexOf(msg);
  return `<div class="tracker-context"><div class="tracker-history-nav"><button type="button" class="tracker-round" data-act="hit" data-step="-1" data-fid="hit-prev" aria-label="Previous match" ${at === 0 ? 'disabled' : ''}>‹</button><span>Message ${order + 1} of ${hit.messages.length} · Hit ${inMessage + 1} of ${msg.spans.length}</span><button type="button" class="tracker-round" data-act="hit" data-step="1" data-fid="hit-next" aria-label="Next match" ${at === stops.length - 1 ? 'disabled' : ''}>›</button></div>
${before ? `<span class="tracker-help-text">${who(before[0])} · ${esc(before[1])}</span>` : ''}
<span class="tracker-help-text tracker-context-current">${who(msg.who)} · ${highlight(msg.body, [span])}</span>
${after ? `<span class="tracker-help-text">${who(after[0])} · ${esc(after[1])}</span>` : ''}</div>`;
}
function highlight(text, spans) {
  let out = '', at = 0;
  for (const [a, b] of spans) { out += `${esc(text.slice(at, a))}<b>${esc(text.slice(a, b))}</b>`; at = b; }
  return out + esc(text.slice(at));
}
function excerpt(body, spans) {
  const start = Math.max(0, spans[0][0] - 40), end = Math.min(body.length, spans.at(-1)[1] + 60);
  const shifted = spans.filter(([a, b]) => a >= start && b <= end).map(([a, b]) => [a - start, b - start]);
  return `${start ? '…' : ''}${highlight(body.slice(start, end), shifted)}${end < body.length ? '…' : ''}`;
}

// ------------------------------------------------------------------ Queues
function queuesBody(sim, m, snap) {
  const q = m.otherQuery.toLowerCase();
  const keep = { counted: (x) => sim.counted(x), active: (x) => !x.finishedAt, finished: (x) => !!x.finishedAt, all: () => true }[m.queueFilter];
  const queues = sim.state.queues.filter((x) => keep(x) && `${x.project} ${x.label} ${x.number}`.toLowerCase().includes(q));
  const projects = [...new Set(queues.map((x) => x.project))];
  const counts = sim.queueCounts().projects;
  const share = (p) => (counts[p] ? counts[p].done / counts[p].total : 0);
  projects.sort(m.order.queueOrder === 'name' ? (a, b) => a.localeCompare(b) : (a, b) => share(b) - share(a) || a.localeCompare(b));
  const t = snap.now;
  let html = projects.map((project) => {
    const list = queues.filter((x) => x.project === project).sort((a, b) => b.done / b.total - a.done / a.total);
    const c = counts[project] || { done: 0, total: 0 };
    const finished = c.done > 0;
    const controls = `${finished ? `<button type="button" class="tracker-filter tracker-control-toggle" data-act="clear-queues" data-project="${esc(project)}" data-fid="clear-${esc(project)}">Clear</button>` : ''}${windowControlsFor(snap, project)}`;
    const body = list.map((x) => queueRow(m, x, t)).join('');
    return section(m, `queues:${project}`, project, m.queueFilter === 'counted' ? 'since last turn' : '', `${c.done} / ${c.total} finished`, { highlight: finished, controls, body, search: q });
  }).join('');
  if (!queues.length) html += `<div class="tracker-empty">No queues match</div>`;
  const pool = `<div class="tracker-queue-row"><div class="tracker-queue-head"><span class="tracker-title">Pool</span><span class="tracker-detail" style="flex:1">Running jobs ${sim.state.queues.reduce((n, x) => n + (x.state === 'RUNNING' ? x.workers : 0), 0)} · Live capacity 76 CPU · Backfill on</span>${adjust(m, 'pool')}</div>${controlPanel(m, 'pool', [['State', 'ACTIVE'], ['Backfill', 'on']])}</div>`
    + sim.state.hosts.map((h) => `<div class="tracker-queue-row"><div class="tracker-queue-head"><span class="tracker-title">${h.id}</span><span class="tracker-detail" style="flex:1">Budget ${esc(h.budget)}${h.away ? ` · not used now: ${h.away}` : ''}</span>${adjust(m, `host:${h.id}`)}</div>${controlPanel(m, `host:${h.id}`, [['Budget', h.budget]])}</div>`).join('');
  html += section(m, 'queues:pool', 'Pool and hosts', 'lab', `ACTIVE · ${sim.state.hosts.length} hosts`, { body: pool, search: q });
  return html;
}
function windowControlsFor(snap, project) {
  const win = snap.windows.find((w) => w.workspace === project);
  return win ? windowControls(win.id) : '';
}
const adjust = (m, id) => `<button type="button" class="tracker-filter tracker-control-toggle" data-act="adjust" data-control="${esc(id)}" data-fid="adj-${esc(id)}" aria-expanded="${m.openControls.has(id)}">Adjust</button>`;
function controlPanel(m, id, facts) {
  if (!m.openControls.has(id)) return '';
  return `<div class="tracker-control-panel"><div class="tracker-control-facts">${facts.map(([k, v]) => `<span class="tracker-control-fact">${esc(k)}: ${esc(v)}</span>`).join('')}</div><span class="tracker-control-label">Scheduler settings</span><span class="tracker-control-sub">In Agent Bar, these come from ROTA's own control command (rota control), which applies one change at a time. This demo has no scheduler to change.</span></div>`;
}
function queueRow(m, x, t) {
  const done = !!x.finishedAt;
  const pct = (100 * x.done / x.total).toFixed(1);
  const rateSeconds = x.rate ? (x.total - x.done) / (x.rate / 1.5) : 0;
  const parts = [`${x.done} / ${x.total} jobs`, `${pct}%`];
  if (x.failed) parts.push(`${x.failed} failed, last ${x.failedAt}`);
  if (done) parts.push(`finished ${age(x.finishedAt, t)}`);
  else if (x.state === 'RUNNING') parts.push(`${x.workers} workers`, `running ${duration(t - x.started)}`, `ETA ${duration(Math.max(60, rateSeconds * 60))}`);
  else parts.push(`queued ${duration(t - x.started)}`);
  const resources = [x.gpu ? `GPU ${x.gpu} per job · reserved ${x.reserved}` : '', x.memory ? `memory limit ${x.memory} per job` : '',
    x.cpu ? `CPU ${x.cpu} h succeeded${x.cpuFailed ? `, ${x.cpuFailed} h failed` : ''} · ${x.done} jobs measured` : ''].filter(Boolean).join(' · ');
  const chip = done ? ['COMPLETED', 'finished'] : x.state === 'RUNNING' ? ['RUNNING', 'working'] : ['PENDING', 'muted'];
  const fill = done ? 'finished' : x.failed ? 'working' : x.state === 'RUNNING' ? 'working' : 'muted';
  return `<div class="tracker-queue-row"><div class="tracker-queue-head"><span class="tracker-queue-number" data-tip="${esc(`${x.label} in ${x.project}: ${chip[0]}`)}">${done ? '✓' : x.number}</span><span class="tracker-title" style="flex:1">${esc(x.label)}</span>${adjust(m, x.id)}<span class="tracker-chip tracker-chip-${chip[1]}">${chip[0]}</span></div>
<div class="tracker-progress-line"><span class="tracker-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${x.total}" aria-valuenow="${x.done}" aria-label="${esc(x.label)} progress"><span class="tracker-progress-fill tracker-progress-${fill}" style="display:block;width:${pct}%"></span></span><span class="tracker-detail" style="flex:1">${esc(parts.join(' · '))}</span><span class="tracker-queue-priority" data-tip="Default queue priority: ${x.priority}. Higher numbers get available slots first.">${x.priority}</span></div>
${resources ? `<span class="tracker-detail">${esc(resources)}</span>` : ''}${x.hold && !done ? `<span class="tracker-warning" style="padding:0">Held: ${esc(x.hold)}</span>` : ''}${controlPanel(m, x.id, [['Priority', String(x.priority)], ['Workers', String(x.workers)]])}</div>`;
}

// ------------------------------------------------------------------ Cluster
function clusterBody(sim, m) {
  const hosts = sim.state.hosts;
  const failed = sim.state.queues.filter((q) => q.failed && !q.finishedAt);
  const dot = '<span class="tracker-cluster-dot" aria-hidden="true"></span>';
  const failures = failed.length ? `<div class="tracker-cluster-section">Failed jobs · ${failed.reduce((n, q) => n + q.failed, 0)} in ${plural(new Set(failed.map((q) => q.project)).size, 'project')}</div>`
    + failed.map((q) => `<div class="tracker-cluster-card"><div class="tracker-queue-head"><span class="tracker-project-name">${esc(q.project)}</span><span class="tracker-failed">${q.failed} failed</span>${copyButton(m, `${q.failed} jobs failed in ${q.label} (${q.project}), last at ${q.failedAt}. ${q.done} of ${q.total} done; the queue is ${q.state}.`, "Copy a note about these failures for the project's agent", `fail-${q.id}`, false)}${windowControlsFor(sim.snapshot(), q.project)}</div><div class="tracker-queue-head"><span style="flex:1">${esc(q.label)} · batch 3</span><span class="tracker-detail">${q.failed} failed, last ${q.failedAt} · ${q.done} / ${q.total} done · ${q.state}</span></div></div>`).join('') : '';
  // One cell per core, filled from the bottom by how busy it is: blue from half busy, grey below.
  const cores = (h) => {
    const n = h.cores, w = 100 / n, fill = 20 * h.busy / 100;
    return `<svg class="tracker-cluster-strip" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<rect x="${(i * w + w * 0.06).toFixed(2)}" y="1" width="${(w * 0.88).toFixed(2)}" height="20" fill="#3a404a"/><rect x="${(i * w + w * 0.06).toFixed(2)}" y="${(21 - Math.max(1, fill)).toFixed(2)}" width="${(w * 0.88).toFixed(2)}" height="${Math.max(1, fill).toFixed(2)}" fill="${h.busy >= 50 ? '#7cb0f0' : '#9aa3b0'}"/>`).join('')}</svg>`;
  };
  const bar = (fraction, cache = 0) => `<svg class="tracker-cluster-line" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" fill="#343a44"/><rect width="${(100 * fraction).toFixed(1)}" height="8" fill="#7cb0f0"/>${cache ? `<rect x="${(100 * fraction).toFixed(1)}" width="${(100 * cache).toFixed(1)}" height="8" fill="#4d6585"/>` : ''}</svg>`;
  const row = (h, graphic, value, text, tone) => `<div class="tracker-cluster-measure-row">${dot}<span class="tracker-cluster-host">${h}</span>${graphic}<span class="tracker-cluster-value"><span class="tracker-${tone}">${value}</span> <span class="tracker-detail" style="font-weight:normal">${text}</span></span></div>`;
  const tone = (pct) => (pct >= 50 ? 'working' : 'muted');
  return `${failures}<div class="tracker-cluster-section">CPU</div><div class="tracker-cluster-card tracker-cluster-grid">${hosts.map((h) => row(h.id, cores(h), `${Math.round(h.busy)}%`, `${h.slots} slots · load ${(h.cores * h.busy / 100).toFixed(1)}`, tone(h.busy))).join('')}</div>
<div class="tracker-cluster-section">Memory</div><div class="tracker-cluster-card tracker-cluster-grid">${hosts.map((h) => { const pct = Math.round(100 * h.memory[0] / h.memory[1]); return row(h.id, bar(h.memory[0] / h.memory[1], 0.02), `${pct}%`, `${h.memory[0]} GB / ${h.memory[1]} GB · pressure ok`, tone(pct)); }).join('')}</div>
<div class="tracker-cluster-section">Disk</div><div class="tracker-cluster-card tracker-cluster-grid">${[...hosts.map((h) => [h.id, 55, '900 GB free of 2.0 TB']), ['shared', 65, '2.7 TB free of 7.8 TB']].map(([id, pct, text]) => row(id, bar(pct / 100), `${pct}%`, text, 'working')).join('')}</div>
<div class="tracker-cluster-card"><div class="tracker-queue-head"><span class="tracker-project-name" style="flex:none">Shared drive</span><span class="tracker-detail">served by workstation</span></div><span class="tracker-detail">Job slots: ${sim.state.queues.reduce((n, q) => n + (q.state === 'RUNNING' ? q.workers : 0), 0) + 19} running of 76 · ACTIVE</span><span class="tracker-warning" style="padding:0">holding back: resources degraded</span><span class="tracker-detail">Drive I/O: 86 MB/s · 640 ops/s</span></div>`;
}

// ------------------------------------------------------------------ Git
function gitBody(sim, m) {
  const q = m.otherQuery.toLowerCase();
  const changes = (r) => r.staged + r.modified + r.untracked;
  const keep = { changes: (r) => changes(r) > 0, unpushed: (r) => r.ahead > 0 }[m.gitFilter];
  const urgency = (r) => (changes(r) || r.ahead ? 1 : 0);
  const sort = { changes: (a, b) => urgency(b) - urgency(a) || b.commitAt - a.commitAt, recent: (a, b) => b.commitAt - a.commitAt, name: (a, b) => a.name.localeCompare(b.name) }[m.order.gitOrder];
  const repos = sim.state.repos.filter((r) => (!keep || keep(r)) && `${r.name} ${r.branch}`.toLowerCase().includes(q)).sort(sort);
  if (!repos.length) return '<div class="tracker-empty">No repositories match</div>';
  const t = sim.now();
  return repos.map((r) => {
    const tracking = [r.ahead && `↑${r.ahead}`, r.behind && `↓${r.behind}`].filter(Boolean).join(' ') || `even with origin/${r.branch}`;
    const detail = [[r.staged, 'staged'], [r.modified, 'modified'], [r.untracked, 'untracked']].filter(([n]) => n).map(([n, name]) => `${n} ${name}`).join(', ') || 'nothing uncommitted';
    const diff = r.diff ? `+${r.diff[0]} −${r.diff[1]} in ${plural(r.diff[2], 'file')} since the last commit` : '';
    const pull = r.pull ? `PR #${r.pull.number} · ${r.pull.state} · ${r.pull.review} · checks ${r.pull.checks}: ${r.pull.title}` : '';
    const n = changes(r);
    return `<div class="tracker-project" style="border-width:0 0 0 2px;border-radius:8px 0 0 8px;background:transparent;border-color:#3b414a;margin-bottom:6px"><div class="tracker-conversation" style="border-top:0" role="button" tabindex="0" data-act="git" data-repo="${esc(r.name)}" data-fid="git-${esc(r.name)}" aria-label="${esc(`${r.name}: open Source Control`)}">
<div class="tracker-row"><span class="tracker-title" style="font-size:15px">${mark(r.name, q)}</span><span class="tracker-detail">${esc(`${r.branch} · ${tracking} · ${detail}`)}</span><span class="tracker-detail">${esc(`Last commit ${age(r.commitAt, t)}: ${r.commit}`)}</span>${r.open ? '' : '<span class="tracker-detail">Not open in a VS Code window</span>'}${diff ? `<span class="tracker-detail">${esc(diff)}</span>` : ''}${pull ? `<span class="tracker-detail tracker-${r.pull.checks === 'passing' ? 'working' : 'attention'}">${esc(pull)}</span>` : ''}</div>
<span class="tracker-chip tracker-chip-${n ? 'working' : 'finished'}">${n ? `${n} changed` : 'Clean'}</span><span class="tracker-window-control" aria-hidden="true">${icon.open()}</span></div></div>`;
  }).join('');
}

// ------------------------------------------------------------------ Messages
function messagesBody(sim, m, snap) {
  const q = m.otherQuery.toLowerCase();
  // A scheduled message comes from the user, not from a chat.
  /** A chat's title, or for a scheduled message its stored sender title ("You (ticket #N)"). */
  const title = (key, msg = null) => (key === 'user' ? msg?.senderTitle ?? 'You' : sim.byKey(key)?.title ?? key);
  const projectOf = (key, other = '') => (key === 'user' ? sim.byKey(other)?.project ?? '?' : sim.byKey(key)?.project ?? '?');
  const all = sim.state.messages.filter((msg) => `${msg.body} ${title(msg.sender, msg)} ${title(msg.recipient)} ${projectOf(msg.sender, msg.recipient)} ${projectOf(msg.recipient)}`.toLowerCase().includes(q)
    && (m.messageFilter !== 'unread' || !msg.readAt));
  const threads = new Map();
  for (const msg of all) {
    const key = [msg.sender, msg.recipient].sort().join(' ');
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key).push(msg);
  }
  const list = [...threads.values()].map((items) => items.sort((a, b) => a.at - b.at)).sort((a, b) => b.at(-1).at - a.at(-1).at);
  const t = snap.now;
  // The loop guard's limits, per sending chat this hour.
  const hour = sim.state.messages.filter((msg) => msg.at > t - 3600 && msg.sender !== 'user');
  const senders = [...new Set(hour.map((msg) => msg.sender))].map((key) => [key, hour.filter((msg) => msg.sender === key).length]).sort((a, b) => b[1] - a[1]);
  let html = '';
  if (senders.length) {
    html += section(m, 'messages:limits', 'Sending limits', 'per chat', `${senders[0][1]} of 10 this hour from the busiest sender`, {
      body: `<div class="tracker-sending-list"><span class="tracker-detail">Each chat can send 10 messages an hour, and up to 10 to one recipient between your prompts to the sender.</span>${senders.map(([key, n]) => `<span class="tracker-detail">${n} of 10 this hour · ${symbolOf(key)} ${esc(title(key))}</span>`).join('')}</div>`,
    });
  }
  if (!list.length) html += `<div class="tracker-empty">${sim.state.messages.length ? 'No matching messages' : 'No messages yet. Agents send them with `agent-bar send`.'}</div>`;
  for (const items of list) {
    const [first] = items;
    const pair = [first.sender, first.recipient];
    const unread = items.filter((msg) => !msg.readAt).length;
    const agents = `<div class="tracker-thread-agents">${pair.map((key, i) => {
      const row = snap.rows.find((r) => r.key === key);
      const sent = items.filter((msg) => msg.recipient === key);
      const waiting = sent.filter((msg) => !msg.readAt).length;
      const stranded = waiting > 0 && snap.stranded.includes(key);
      const mail = !sent.length ? '' : waiting ? `, ${waiting} unread${stranded ? ' until you start a turn there' : ''}` : ', read its messages';
      const envelope = sent.length ? `<span class="tracker-${stranded ? 'attention' : waiting ? 'help-bright' : 'muted'}">${waiting ? icon.mail(14) : icon.mailOpen(14)}</span>` : '';
      if (key === 'user') return `${i ? '<span class="tracker-muted" aria-hidden="true">⇄</span>' : ''}<span class="tracker-thread-agent tracker-bright">${symbolOf(key)} ${esc(title(key, items.find((msg) => msg.sender === 'user')))}</span>`;
      return `${i ? '<span class="tracker-muted" aria-hidden="true">⇄</span>' : ''}<button type="button" class="tracker-thread-agent tracker-${key.split(':')[0]}" data-act="row" data-key="${esc(key)}" data-win="${esc(row?.window ?? '')}" data-fid="thread-${esc(key)}-${esc(first.id)}" aria-label="${esc(`Open ${title(key)}${mail}`)}"><span>${symbolOf(key)} ${esc(title(key))}</span>${envelope}</button>`;
    }).join('')}</div>`;
    const [from, to] = [projectOf(pair[0], pair[1]), projectOf(pair[1], pair[0])];
    const body = items.map((msg) => {
      const open = m.openMessages.get(msg.id) ?? (!msg.readAt || msg === items.at(-1));
      return `<div class="tracker-conversation${msg.readAt ? '' : ' tracker-unread'}"><button type="button" class="tracker-message-button" data-act="fold-message" data-id="${msg.id}" data-fid="msg-${msg.id}" aria-expanded="${open}" aria-label="Expand or collapse message from ${esc(title(msg.sender, msg))}"><span class="tracker-row"><span class="tracker-detail">${esc(`${symbolOf(msg.sender)} ${title(msg.sender, msg)} → ${symbolOf(msg.recipient)} ${title(msg.recipient)} · ${age(msg.at, t)}`)}</span><span class="tracker-help-text">${esc(open ? msg.body : `${msg.body.split('\n')[0].slice(0, 90)}${msg.body.length > 90 ? '…' : ''}`)}</span></span></button><span class="tracker-chip tracker-chip-${msg.readAt ? 'muted' : 'attention'}">${msg.readAt ? 'Read' : 'Unread'}</span></div>`;
    }).join('');
    html += section(m, `messages:${pair.join(' ')}`, from === to ? from : `${from} ⇄ ${to}`, '', `${plural(items.length, 'message')}${unread ? ` · ${unread} unread` : ''}`,
      { highlight: unread > 0, below: agents, body });
  }
  return html;
}

// ------------------------------------------------------------------ Tickets
function ticketsBody(sim, m, snap) {
  const q = m.otherQuery.toLowerCase();
  const t = snap.now;
  const tickets = sim.state.tickets.filter((x) => `${x.body} ${x.project}`.toLowerCase().includes(q));
  const groups = [['Ready', tickets.filter((x) => sim.ticketReady(x) && !x.to)], ['Scheduled', tickets.filter((x) => x.status === 'open' && x.to)],
    ['Waiting', tickets.filter((x) => x.status === 'open' && !x.to && !sim.ticketReady(x))], ['In progress', tickets.filter((x) => x.status === 'started')],
    ['Recently closed', tickets.filter((x) => x.status === 'done' || x.status === 'dropped')]];
  const ready = groups[0][1].length, scheduled = groups[1][1].length, waiting = groups[2][1].length;
  let html = m.ticketDraft ? ticketForm(sim, m) : `<div class="tracker-ticket-bar"><button type="button" class="tracker-control-primary" data-act="new-ticket" data-fid="new-ticket">＋ New ticket</button><span class="tracker-toolbar-fill"></span><span class="tracker-detail">${ready} ready · ${scheduled} scheduled · ${waiting} waiting</span></div>`;
  for (const [name, items] of groups) {
    if (!items.length) continue;
    const body = items.map((x) => ticketItem(sim, m, x, t)).join('');
    html += section(m, `tickets:${name}`, name, '', String(items.length), { highlight: name === 'Ready', body, search: q });
  }
  return html;
}
function ticketItem(sim, m, x, t) {
  const who = x.author === 'user' ? 'by you' : `by ${symbolOf(x.author)} ${sim.byKey(x.author)?.title ?? 'a chat'}`;
  const status = sim.ticketReady(x) && !x.to ? ['Ready', 'attention'] : x.status === 'open' ? (x.to ? ['Scheduled', 'working'] : ['Waiting', 'waiting'])
    : x.status === 'started' ? ['In progress', 'working'] : x.status === 'done' ? ['Done', 'finished'] : ['Dropped', 'muted'];
  const waits = sim.waits(x);
  let note = '';
  if (x.to && x.status === 'open') {
    const date = new Date((x.after[0]?.at ?? t) * 1000);
    const when = `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    note = `Sends to ${symbolOf(x.to)} ${sim.byKey(x.to)?.title ?? 'a chat'} when ${when}${x.repeat ? `, then every ${x.repeat}` : ''}`;
  } else if (waits.length && x.status === 'open') {
    note = `Waits until ${waits.map((c) => c.kind === 'reset' ? 'Claude weekly limit resets' : c.kind === 'ticket' ? `ticket #${c.ticket} is done` : c.kind === 'queues' ? 'this project’s queues finish' : new Date(c.at * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })).join(' and ')}`;
  } else if (x.status === 'started' && x.takenBy) note = `Started by ${symbolOf(x.takenBy)} ${sim.byKey(x.takenBy)?.title ?? 'a chat'}`;
  else if (x.note) note = x.note;
  const prompt = `Agent Bar ticket #${x.id} in ${x.project} (${sim.folder}/${x.project}), written by your user:\n\n${x.body}`;
  const button = (act, label, primary = false) => `<button type="button" class="${primary ? 'tracker-control-primary' : 'tracker-control-action'}" data-act="ticket" data-ticket="${x.id}" data-do="${act}" data-fid="ticket-${x.id}-${act}">${label}</button>`;
  const actions = x.status === 'open' ? [sim.ticketReady(x) && !x.to ? button('start', 'Start', true) : '', copyButton(m, prompt, 'Copy the ticket prompt', `ticket-${x.id}`, false), x.to ? '' : button('done', 'Done'), button('drop', 'Drop')]
    : x.status === 'started' ? [button('done', 'Done'), button('drop', 'Drop')] : [button('reopen', 'Reopen')];
  return `<div class="tracker-conversation${status[0] === 'Ready' ? ' tracker-unread' : ''}"><div class="tracker-ticket-row"><span class="tracker-ticket-body">${esc(x.body)}</span><span class="tracker-ticket-meta"><span class="tracker-chip tracker-chip-${status[1]}">${status[0]}</span><span class="tracker-detail">#${x.id} · ${esc(x.project)} · ${esc(who)} · ${age(x.at, t)}</span></span>${note ? `<span class="tracker-ticket-wait">${esc(note)}</span>` : ''}<span class="tracker-ticket-actions">${actions.join('')}</span></div></div>`;
}
function ticketForm(sim, m) {
  const d = m.ticketDraft;
  const projects = [...new Set(sim.state.rows.map((r) => r.project))];
  const chip = (field, value, label) => `<button type="button" class="tracker-ticket-chip" data-act="draft" data-field="${field}" data-value="${esc(value)}" aria-pressed="${d[field] === value}" data-fid="draft-${field}-${esc(value)}">${esc(label)}</button>`;
  return `<div class="tracker-ticket-card" style="margin:0 0 12px"><span class="tracker-ticket-heading" style="font-weight:bold">New ticket</span><textarea class="tracker-ticket-entry" data-fid="ticket-body" data-field-input="body" aria-label="What should be done" placeholder="What should be done, for a later chat">${esc(d.body)}</textarea>
<span class="tracker-ticket-caption">Project</span><div class="tracker-ticket-chips">${projects.map((p) => chip('project', p, p)).join('')}</div>
<span class="tracker-ticket-caption">Ready when</span><div class="tracker-ticket-chips">${[['now', 'Now'], ['reset', 'Claude weekly limit resets'], ['queues', 'Its queues finish'], ['hour', 'In an hour']].map(([v, l]) => chip('when', v, l)).join('')}</div>
<div class="tracker-ticket-actions"><button type="button" class="tracker-control-action" data-act="cancel-ticket" data-fid="cancel-ticket">Cancel</button><button type="button" class="tracker-control-primary" data-act="add-ticket" data-fid="add-ticket" ${d.body.trim() ? '' : 'disabled'}>Add ticket</button></div></div>`;
}

// ------------------------------------------------------------------ Quota
function quotaBody(sim, m) {
  const t = sim.now();
  const order = (l) => (l.key === 'weekly' ? 0 : l.key.startsWith('weekly:') ? 1 : 2);
  let html = '';
  for (const provider of ['claude', 'codex']) {
    const limits = [...sim.state.limits[provider]].sort((a, b) => order(a) - order(b));
    const weekly = sim.limitOf(provider, 'weekly');
    const body = limits.map((l) => quotaLimit(l, t)).join('');
    html += section(m, `quota:${provider}`, PROVIDERS[provider][1], `reading ${age(sim.state.usageAt, t)}`, `${Math.floor(weekly.left)}% of weekly quota left`, { highlight: weekly.left < 25, body });
  }
  const spend = sim.state.spend;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date((t - (6 - i) * 86400) * 1000).toLocaleDateString('en-US', { weekday: 'short' });
    const claude = Object.values(spend.claude).reduce((n, v) => n + v[i], 0), codex = Object.values(spend.codex).reduce((n, v) => n + v[i], 0);
    return [date, claude, codex];
  });
  const models = Object.values(spend).flatMap((ms) => Object.entries(ms)).map(([model, v]) => [model, v.reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]);
  const week = models.reduce((n, [, v]) => n + v, 0);
  const cost = `<div class="tracker-quota-note"><span class="tracker-detail">Estimated API cost of local Claude and Codex usage, including cached tokens. Subscription billing is separate.</span></div><div class="tracker-queue-row">${dayChart(days.map(([d, a, b]) => [d, a, b]), 1)}<span class="tracker-quota-legend"><span class="tracker-muted tracker-quota-small">Each day's cost</span><span style="color:#c4a6f2">■</span><span class="tracker-quota-small">Claude</span><span style="color:#82baf9">■</span><span class="tracker-quota-small">Codex</span></span>${models.map(([model, v]) => `<span class="tracker-detail">${esc(model)}: ${dollars(v)} for ${tokenCount(v * 160000)} tokens in 7 days</span>`).join('')}</div>`;
  html += section(m, 'quota:cost', 'Cost at API prices', 'prices as of 2026-11-24', `${dollars(days[6][1] + days[6][2])} today · ${dollars(week)} in 7 days`, { body: cost });
  return html;
}
function quotaLimit(l, t) {
  const style = quotaStyle(l.left);
  const fill = { failed: 'failed', attention: 'attention' }[style] || 'working';
  let html = `<div class="tracker-queue-row"><div class="tracker-row-title"><span class="tracker-title" style="flex:1">${esc(l.name)}</span><span class="tracker-quota-figure tracker-quota-${style}">${Math.round(l.percent)}% used · ${Math.floor(l.left)}% left</span></div>
<div class="tracker-progress-line"><span class="tracker-progress tracker-quota-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(l.percent)}" aria-label="${esc(l.name)} used"><span class="tracker-progress-fill tracker-progress-${fill}" style="display:block;width:${l.percent}%"></span></span><span class="tracker-detail">${resetTime(l.resets_at, t)}, in ${duration(Math.round(l.resets_at - t))}</span></div>
<span class="tracker-detail">${esc(quotaProjection(l, t))}</span>`;
  if (l.share) html += `<span class="tracker-detail">${esc(`${l.name.split(' · ').pop()} has ${l.share[1]}% of the weekly limit to itself and has used ${Math.round(l.share[0])} points of it.`)}</span>`;
  if (l.days) {
    html += dayChart(l.days.map(([d, a, b]) => [d, a, b]), 20);
    html += `<span class="tracker-quota-legend"><span class="tracker-muted tracker-quota-small">Points of the weekly limit used each day</span>${l.parts ? `<span style="color:#c4a6f2">■</span><span class="tracker-quota-small">${l.parts[0]}</span><span style="color:#82baf9">■</span><span class="tracker-quota-small">${l.parts[1]}</span>` : ''}</span>`;
  }
  return `${html}</div>`;
}
/** Stacked day bars, the first part violet, the rest blue, scaled to the busiest day or `floor`. */
function dayChart(days, floor) {
  const most = Math.max(floor, ...days.map(([, a, b]) => a + b));
  const slot = 100 / days.length, bar = Math.min(8, slot * 0.6);
  const bars = days.map(([, a, b], i) => {
    const x = i * slot + (slot - bar) / 2;
    const ha = 64 * a / most, hb = 64 * b / most;
    return `${hb > 0 ? `<rect x="${x.toFixed(2)}" y="${(64 - ha - hb).toFixed(2)}" width="${bar.toFixed(2)}" height="${hb.toFixed(2)}" fill="#82baf9"/>` : ''}${ha > 0 ? `<rect x="${x.toFixed(2)}" y="${(64 - ha).toFixed(2)}" width="${bar.toFixed(2)}" height="${ha.toFixed(2)}" fill="#c4a6f2"/>` : ''}${a + b > 0 ? '' : `<rect x="${x.toFixed(2)}" y="63" width="${bar.toFixed(2)}" height="1" fill="rgba(255,255,255,.12)"/>`}`;
  }).join('');
  return `<svg class="tracker-quota-chart" viewBox="0 0 100 64" preserveAspectRatio="none" role="img" aria-label="${esc(days.map(([d, a, b]) => `${d}: ${(a + b).toFixed(1)}`).join(', '))}">${bars}</svg><span class="tracker-quota-days" aria-hidden="true">${days.map(([d]) => `<span class="tracker-quota-day">${d}</span>`).join('')}</span>`;
}

// ------------------------------------------------------------------ Info
function infoProjects(sim) { return [...new Set(sim.state.windows.filter((w) => w.kind !== 'app').map((w) => w.workspace))]; }
function infoBody(sim, m) {
  const q = m.otherQuery.toLowerCase();
  const project = m.infoProject;
  const hooks = [...sim.info.hooks, ...(sim.info.projectHooks[project] || [])].filter((h) => h.join(' ').toLowerCase().includes(q));
  const hookRows = hooks.map((h, i) => {
    const id = `${h[0]}:${h[1]}`;
    const open = m.openHooks.has(id);
    return `<div><div class="tracker-info-row"><button type="button" class="tracker-expander" data-act="hook" data-hook="${esc(id)}" data-fid="hook-${i}" aria-expanded="${open}"><span class="tracker-muted">${open ? '⌄' : '›'}</span>&nbsp; ${esc(`${h[0]} · ${h[1]} · Configured`)}</button></div>${open ? `<div class="tracker-info-detail"><span>${esc(h[3])}</span><span>When: ${esc(h[4])}</span><span>Action: ${esc(h[2])}</span><span>Configured in ${esc(h[5])}</span></div>` : ''}</div>`;
  }).join('');
  const skills = (sim.info.skills[project] || []).filter((s) => s[0].includes(q));
  const synced = sim.info.synced;
  const files = sim.info.instructions[project] || [];
  return `<div class="tracker-info-section">Hooks</div><div class="tracker-project">${hookRows || '<div class="tracker-empty">No hooks match</div>'}</div>
<div class="tracker-info-section">Skills</div><div class="tracker-project"><div class="tracker-info-row"><span class="tracker-muted">›</span> ${synced.length} synced from claude.ai</div>${skills.map(([name, uses]) => `<div class="tracker-info-row"><span style="flex:1;font-size:14px;color:#edf0f5">${esc(name)}</span><span class="tracker-claude">✳</span><span class="tracker-detail">used ${uses}×</span></div>`).join('')}${skills.length ? '' : '<div class="tracker-info-row tracker-detail">No project skills</div>'}</div>
<div class="tracker-info-section">Agent Bar health</div><div class="tracker-project"><div class="tracker-info-row">${providerLabel('claude')}<span>chat status hook</span><span class="tracker-check">✓</span><span>message wake-up hook</span><span class="tracker-check">✓</span><span>last event 1m ago</span></div><div class="tracker-info-row">${providerLabel('codex')}<span>chat status hook</span><span class="tracker-check">✓</span><span>last event 1m ago</span></div><div class="tracker-info-row">All ${sim.state.windows.filter((w) => w.kind === 'vscode').length} VS Code windows run the current Agent Bar bridge</div><div class="tracker-info-row">Last service update: just now</div></div>
<div class="tracker-info-section">Agent instructions</div><div class="tracker-project"><div class="tracker-info-row">Everywhere <span class="tracker-file-chip">CLAUDE.md</span><span class="tracker-file-chip">AGENTS.md</span></div><div class="tracker-info-row">${esc(project)} ${files.map((f) => `<span class="tracker-file-chip">${esc(f)}</span>`).join('') || '<span class="tracker-detail">none of its own</span>'}</div></div>`;
}

// ------------------------------------------------------------------ Settings and Guide pages (a subset)
/** @type {[string, string, string, string, [string|boolean, string][]][]} */
const SETTINGS = [
  ['Integrations', 'wake', 'Wake idle chats', 'Wake Claude Code chats active in the past week. Codex chats must be open in VS Code. Busy chats can wake after the current turn.', [[true, 'On'], [false, 'Off']]],
  ['Integrations', 'costs', 'Cost at API prices', 'Estimate Claude and Codex costs from local token counts. Subscription billing is separate.', [[true, 'On'], [false, 'Off']]],
  ['Windows', 'focusedClick', 'Click a focused chat again', 'Return its window to its previous position or leave it in place.', [['return', 'Send back'], ['stay', 'Keep']]],
  ['Appearance', 'palette', 'State colors', 'Choose the colors used for chat and queue status.', [['default', 'Default'], ['colorblind', 'Color-blind safe']]],
];
function settingsBody(sim) {
  const sections = [...new Set(SETTINGS.map(([s]) => s))];
  return `<div class="tracker-help-text-block">Agent Bar has about thirty settings. This demo has these four.</div>${sections.map((name) => `<div class="tracker-settings-section">${name}</div><div class="tracker-settings-card">${SETTINGS.filter(([s]) => s === name).map(([, key, label, help, options]) => `<div class="tracker-setting"><div style="flex:1"><div class="tracker-setting-label">${label}</div><div class="tracker-detail">${esc(help)}</div></div><div class="tracker-segments" role="group" aria-label="${label}">${options.map(([value, text]) => `<button type="button" class="tracker-segment" data-act="setting" data-setting="${key}" data-value="${String(value)}" aria-pressed="${sim.state.settings[key] === value}" data-fid="set-${key}-${value}">${text}</button>`).join('')}</div></div>`).join('')}</div>`).join('')}`;
}
function helpBody() {
  const line = (a, b) => `<div class="tracker-info-row"><span style="min-width:7em" class="tracker-bright">${a}</span><span class="tracker-help-text">${b}</span></div>`;
  return `<div class="tracker-project">${line('✳ 3 / 5', 'Three of five open Claude chats need review. ⌘ Codex, ◆ Copilot and ▲ Antigravity work the same way.')}${line('✳ 64%', 'Weekly quota left: amber below 25%, red below 10%, dim when the reading is over six hours old.')}${line('<span class="tracker-working">● 2</span> <span class="tracker-waiting">◌ 1</span>', 'Chats working, and chats waiting on background work or quiet for five minutes.')}${line('<span class="tracker-attention">✉ 2</span>', 'Chats with unread agent mail that need a prompt from you to read it.')}${line('🎫 2', 'Tickets whose waits have passed.')}${line('Q 0 / 3', 'Finished queues of those tracked since each project’s last turn.')}${line('<span class="tracker-quick-bubble tracker-quick-bubble-claude" style="display:inline-block">1</span>', 'A review button: click the project for its longest-waiting chat, or a bubble for one chat.')}</div>
<div class="tracker-project">${line('<span class="tracker-chip tracker-chip-attention">Needs review</span>', 'A reply finished, a turn failed, it asks a question or for approval, or its project’s queues finished.')}${line('<span class="tracker-chip tracker-chip-working">Working</span>', 'A turn is running.')}${line('<span class="tracker-chip tracker-chip-waiting">Waiting</span>', 'Background work, or a quiet open turn.')}${line('<span class="tracker-chip tracker-chip-finished">Finished</span>', 'Its last turn ended, and you have seen it.')}</div>`;
}

// ------------------------------------------------------------------ side panels
export function sideHtml(sim, m) {
  if (!m.side) return '';
  const row = sim.byKey(m.side.key);
  if (!row) return '';
  const t = sim.now();
  const close = '<button type="button" class="tracker-gear" data-act="side-close" data-fid="side-close" aria-label="Close">✕</button>';
  if (m.side.kind === 'checklists') {
    const lists = CHECKLISTS[row.project] || [];
    const mine = lists.filter((l) => l.editor === row.name);
    const rest = lists.filter((l) => !mine.includes(l));
    const card = (l) => `<div class="tracker-side-ticket" style="display:flex;flex-direction:column;gap:4px;padding:8px 0 10px;border-top:1px solid #3b414a"><div style="display:flex;align-items:center"><span style="flex:1;font-size:14px;color:#edf0f5">${esc(l.title)}</span><button type="button" class="tracker-copy" data-act="noop" data-tip="In Agent Bar, this opens the file in VS Code">Open</button></div><span class="tracker-detail">${esc(`${l.file} · updated ${age(t - l.age, t)}`)}</span><span class="tracker-progress" style="width:auto"><span class="tracker-progress-fill tracker-progress-working" style="display:block;width:${100 * l.done / l.total}%"></span></span><span class="tracker-detail">${l.done} of ${l.total} done</span>${l.next ? `<span class="tracker-help-text">Suggested next: ${esc(l.next)}</span>` : ''}${l.user ? `<span class="tracker-attention" style="font-size:12px;font-weight:bold">Needs you: ${esc(l.user)}</span>` : ''}${l.waiting ? `<span class="tracker-detail">Waiting: ${esc(l.waiting)}</span>` : ''}${l.deferred ? `<span class="tracker-detail">Deferred: ${esc(l.deferred)}</span>` : ''}${l.editor ? `<span class="tracker-detail">Last edited by ✳ ${esc(sim.state.rows.find((r) => r.name === l.editor)?.title ?? '')} ${age(t - l.edited, t)}</span>` : ''}</div>`;
    return `<div class="tracker-side-heading"><span class="tracker-heading-title" style="flex:1">Checklists</span>${close}</div><span class="tracker-detail">${esc(`${row.project} · for ${symbolOf(row.key)} ${row.title}`)}</span>${mine.length ? `<div class="tracker-settings-section">Edited by this chat</div>${mine.map(card).join('')}` : ''}${rest.length ? `<div class="tracker-settings-section">Recently updated</div>${rest.map(card).join('')}` : ''}`;
  }
  const d = m.side;
  const chip = (field, value, label) => `<button type="button" class="tracker-ticket-chip" data-act="side-pick" data-field="${field}" data-value="${value}" aria-pressed="${d[field] === value}" data-fid="side-${field}-${value}">${label}</button>`;
  const scheduled = sim.state.tickets.filter((x) => x.to === row.key && x.status === 'open');
  return `<div class="tracker-side-heading"><span class="tracker-heading-title" style="flex:1">Schedule a message</span>${close}</div><span class="tracker-detail">${esc(`to ${symbolOf(row.key)} ${row.title}`)}</span>
<textarea class="tracker-ticket-entry" data-fid="side-text" data-side-input aria-label="What to send" placeholder="What to send; it arrives as your request">${esc(d.text || '')}</textarea>
<span class="tracker-ticket-caption">When</span><div class="tracker-ticket-chips">${chip('when', 'hour', 'In an hour')}${chip('when', 'tomorrow', 'Tomorrow 9:00')}${chip('when', 'monday', 'Monday 9:00')}</div>
<span class="tracker-ticket-caption">Repeat</span><div class="tracker-ticket-chips">${chip('repeat', 'never', 'Never')}${chip('repeat', 'day', 'Daily')}${chip('repeat', 'week', 'Weekly')}${chip('repeat', 'month', 'Monthly')}</div>
<span class="tracker-detail">${sim.state.settings.wake ? 'At the scheduled time, an idle chat can wake to read the message.' : 'At the scheduled time the message waits for the chat’s next turn (Wake idle chats is off).'}</span>
<div class="tracker-ticket-actions"><button type="button" class="tracker-control-primary" data-act="schedule" data-fid="side-schedule" ${d.text?.trim() ? '' : 'disabled'}>Schedule</button></div>
${scheduled.length ? `<div class="tracker-settings-section">Scheduled for this chat</div>${scheduled.map((x) => `<div class="tracker-side-ticket" style="display:flex;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #3b414a"><span style="flex:1">${esc(x.body)}</span><button type="button" class="tracker-control-action" data-act="ticket" data-ticket="${x.id}" data-do="drop" data-fid="side-drop-${x.id}">Drop</button></div>`).join('')}` : ''}`;
}

// ------------------------------------------------------------------ the rows of the current tab
export function bodyHtml(sim, m) {
  const snap = sim.snapshot();
  m.keys = [];
  if (m.page === 'settings') return settingsBody(sim);
  if (m.page === 'help') return helpBody();
  const html = {
    conversations: chatsBody, history: historyBody, queues: queuesBody, cluster: clusterBody, git: gitBody,
    messages: messagesBody, tickets: ticketsBody, quota: quotaBody, info: infoBody,
  }[m.view](sim, m, snap);
  m.collapsedAny = m.keys.some((k) => m.collapsed.has(k));
  return html;
}

// ------------------------------------------------------------------ the ▾ window list and +N more
export function navHtml(sim) {
  const snap = sim.snapshot();
  const urgency = ['review', 'attention', 'working', 'waiting', 'failed', 'finished', 'muted'];
  const items = snap.windows.map((w) => {
    const rows = snap.rows.filter((r) => r.window === w.id);
    const states = rows.map((r) => (r.unread.length ? 'review' : stateStyle(r.state)));
    return { w, state: urgency.find((s) => states.includes(s)) || 'muted', active: Math.max(0, ...rows.map((r) => r.stateAt)) };
  }).sort((a, b) => b.active - a.active);
  return `<div class="tracker-nav-menu" role="menu" aria-label="Project windows">${items.map(({ w, state, active }) => `<button type="button" role="menuitem" class="tracker-nav-item" data-act="nav-window" data-win="${w.id}" data-fid="nav-${w.id}"><span class="tracker-${state === 'review' ? 'attention' : state}" aria-hidden="true">●</span><span class="grow">${esc(w.kind === 'terminal' ? `${w.workspace} · terminal` : w.kind === 'ide' ? `${w.workspace} · ${w.label}` : w.kind === 'app' ? 'Codex app' : w.workspace)}</span><span class="tracker-detail">${active ? age(active, snap.now) : ''}</span></button>`).join('')}<div class="tracker-nav-sep"></div><button type="button" role="menuitem" class="tracker-nav-item" data-act="nav-new" data-fid="nav-new">＋ New VS Code window</button><button type="button" role="menuitem" class="tracker-nav-item" data-act="nav-saved" data-fid="nav-saved">🕘 Saved chats</button></div>`;
}
export function moreHtml(rows) {
  return `<div class="tracker-nav-menu" role="menu" aria-label="More chats needing review">${rows.map((r) => `<button type="button" role="menuitem" class="tracker-nav-item tracker-${r.provider}" data-act="shortcut" data-key="${esc(r.key)}" data-fid="more-${esc(r.key)}">${PROVIDERS[r.provider][0]} ${esc(r.project)} · ${esc(r.title)}</button>`).join('')}</div>`;
}
export function trayHtml(sim) {
  const list = [...sim.state.notifications].reverse().slice(0, 8);
  const t = sim.now();
  const date = new Date(t * 1000);
  return `<div class="tracker-nav-menu" role="dialog" aria-label="Notifications" style="width:400px"><div style="padding:6px 16px 10px;font-weight:bold">${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>${list.length ? list.map((n) => `<button type="button" class="tracker-nav-item" data-act="banner" data-key="${esc(n.key)}" data-fid="tray-${n.id}"><span class="grow"><strong>${esc(n.title)}</strong><br><span class="tracker-detail">${esc(n.body)}</span></span><span class="tracker-detail">${clock(n.at)}</span></button>`).join('') : '<div class="tracker-empty">No notifications</div>'}</div>`;
}
