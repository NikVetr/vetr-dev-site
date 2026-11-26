// The GNOME top bar with Agent Bar's parts, as extension.js draws them: per provider "needing review / open",
// weekly quota left, working and waiting, agent mail, ready tickets and finished queues; the ▾ window list; and
// the review shortcuts after the clock, one per project, with a numbered bubble per chat when a project has several.
import { PROVIDERS } from './fixture.js';
import { esc, icon, patch } from './dom.js';
import { age, quotaStyle, resetTime } from './text.js';

const PINNED = ['claude', 'codex'];

/** @param {any} sim @param {any} ui */
export function renderPanel(el, sim, ui) {
  const snap = sim.snapshot();
  const now = snap.now;
  const open = (tab) => ui.open === 'menu' && !ui.page && ui.view === tab ? ' agent-bar-part-open' : '';
  const expanded = (tab) => ` aria-expanded="${ui.open === 'menu' && !ui.page && ui.view === tab}"`;
  const ratios = Object.keys(PROVIDERS).filter((p) => PINNED.includes(p) || snap.providers[p].open > 0).map((p) => {
    const c = snap.providers[p];
    return `<span class="tracker-provider-ratio"><span class="tracker-${p}">${PROVIDERS[p][0]}</span><span class="${c.review ? 'tracker-bright' : 'tracker-quiet'}">${c.review} / ${c.open}</span></span>`;
  }).join('');
  const chatsName = Object.keys(PROVIDERS).filter((p) => snap.providers[p].open).map((p) => `${PROVIDERS[p][1]} ${snap.providers[p].review} of ${snap.providers[p].open} need review`).join(', ');
  const quota = ['claude', 'codex'].map((p) => {
    const weekly = sim.limitOf(p, 'weekly');
    return `<span class="tracker-quota-part"><span class="tracker-${p}">${PROVIDERS[p][0]}</span><span class="tracker-quota-${quotaStyle(weekly.left)}">${Math.floor(weekly.left)}%</span></span>`;
  }).join('');
  const quotaTip = ['Usage limits left', ...['claude', 'codex'].flatMap((p) => [`${PROVIDERS[p][1]}, reading ${age(sim.state.usageAt, now)}`,
    ...sim.state.limits[p].map((l) => `  ${l.name}: ${Math.floor(l.left)}% left, ${resetTime(l.resets_at, now)}`)]), 'Click for the Quota tab'].join('\n');
  const c = snap.counts;
  const stranded = snap.stranded.length;
  const tickets = snap.readyTickets.length;
  const q = snap.queues;
  const left = `<button type="button" class="panel-button" data-act="activities" data-fid="activities" data-tip="Activities: not part of this demo">Activities</button>
<div class="panel-agent agent-bar" role="group" aria-label="Agent Bar">
  <button type="button" class="agent-bar-part tracker-bar-chats${open('conversations')}" data-part="conversations" data-fid="part-chats" aria-label="Chats: ${esc(chatsName)}. Opens Chats"${expanded('conversations')}>${ratios}</button>
  <button type="button" class="agent-bar-part tracker-quota-bar${open('quota')}" data-part="quota" data-fid="part-quota" aria-label="Weekly quota left: Claude ${Math.floor(sim.limitOf('claude', 'weekly').left)}%, Codex ${Math.floor(sim.limitOf('codex', 'weekly').left)}%. Opens Quota" data-tip="${esc(quotaTip)}"${expanded('quota')}>${quota}</button>
  <span class="tracker-bar-divider" aria-hidden="true">│</span>
  <button type="button" class="agent-bar-part tracker-bar-states${open('conversations')}" data-part="conversations" data-fid="part-states" aria-label="${c.working} working, ${c.waiting} waiting. Opens Chats"${expanded('conversations')}><span class="tracker-working">● ${c.working}</span>${c.waiting ? `<span class="tracker-waiting">◌ ${c.waiting}</span>` : ''}</button>
  ${stranded ? `<button type="button" class="agent-bar-part tracker-mail${open('messages')}" data-part="messages" data-fid="part-mail" aria-label="Agent mail waits for your turn in ${stranded} chat${stranded === 1 ? '' : 's'}. Opens Messages" data-tip="Agent mail waits for a prompt from you in ${stranded} chat${stranded === 1 ? '' : 's'}"${expanded('messages')}><span class="tracker-attention">${icon.mail(16)}</span><span class="tracker-attention">${stranded}</span></button>` : ''}
  ${tickets ? `<button type="button" class="agent-bar-part tracker-mail${open('tickets')}" data-part="tickets" data-fid="part-tickets" aria-label="${tickets} ticket${tickets === 1 ? '' : 's'} whose waits have passed. Opens Tickets" data-tip="${tickets} ticket${tickets === 1 ? '' : 's'} whose waits have passed"${expanded('tickets')}><span class="tracker-help-bright">${icon.ticket(16)}</span><span class="tracker-help-bright">${tickets}</span></button>` : ''}
  <button type="button" class="agent-bar-part${open('queues')}" data-part="queues" data-fid="part-queues" aria-label="${q.done} of ${q.total} queues finished since the last turn. Opens Queues"${expanded('queues')}><span class="${q.done ? 'tracker-bright' : 'tracker-muted'}">Q ${q.done} / ${q.total}</span></button>
</div>
<button type="button" class="panel-button tracker-nav-arrow" data-act="nav" data-fid="nav" aria-label="Project windows" aria-haspopup="menu" aria-expanded="${ui.open === 'nav'}">▾</button>`;
  const date = new Date(now * 1000);
  const clock = `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}  ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  const groups = snap.quick;
  const shortcuts = groups.map((group, index) => {
    const [first] = group;
    if (group.length === 1) {
      const symbol = PROVIDERS[first.provider][0];
      return `<button type="button" class="tracker-quick-button tracker-${first.provider}" data-act="shortcut" data-key="${esc(first.key)}" data-fid="quick-${esc(first.project)}" data-group="${index}" aria-label="Show ${esc(first.project)}: ${esc(first.title)}">${symbol} ${esc(first.project)}</button>`;
    }
    return `<span class="tracker-quick-button tracker-quick-group" data-group="${index}"><button type="button" class="tracker-quick-group-name" data-act="shortcut" data-key="${esc(first.key)}" data-fid="quick-${esc(first.project)}" aria-label="Show ${esc(first.project)}'s longest-waiting chat: ${esc(first.title)}">${esc(first.project)}</button>${group.map((row, n) => `<button type="button" class="tracker-quick-bubble tracker-quick-bubble-${row.provider}" data-act="shortcut" data-key="${esc(row.key)}" data-fid="bubble-${esc(row.key)}" aria-label="Show ${PROVIDERS[row.provider][1]} chat ${esc(row.title)}" data-tip="${PROVIDERS[row.provider][0]} ${esc(row.title)}">${n + 1}</button>`).join('')}</span>`;
  }).join('');
  const right = `<div class="tracker-quick" role="group" aria-label="Chats needing review">${shortcuts}<button type="button" class="tracker-quick-button tracker-quick-more" data-act="more" data-fid="quick-more" hidden></button></div>
<button type="button" class="panel-button panel-system" data-act="system" data-fid="system" aria-label="System menu: not part of this demo" data-tip="System menu: not part of this demo">${icon.wifi()}${icon.volume()}${icon.power()}</button>`;
  const html = `<div class="panel-left">${left}</div><div class="panel-center"><button type="button" class="panel-button panel-clock" data-act="clock" data-fid="clock" aria-label="Clock and notifications" aria-expanded="${ui.open === 'tray'}">${clock}</button></div><div class="panel-right">${right}</div>`;
  if (patch(el, html) || ui.fitQuick) fitQuick(el, groups, ui);
}

/** Shortcuts as room allows, the longest waiting first; +N more lists the chats of the rest. */
function fitQuick(el, groups, ui) {
  ui.fitQuick = false;
  const box = el.querySelector('.tracker-quick');
  const more = /** @type {HTMLElement} */ (box.querySelector('.tracker-quick-more'));
  const items = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('[data-group]')]);
  for (const item of items) item.hidden = false;
  more.hidden = true;
  ui.quickHidden = [];
  if (ui.phone) return;
  const room = el.querySelector('.panel-right').getBoundingClientRect().width / ui.scale - el.querySelector('.panel-system').getBoundingClientRect().width / ui.scale - 16;
  let used = 0, full = false;
  items.forEach((item, index) => {
    used += item.offsetWidth + 6;
    // Once one does not fit, neither do the rest; leave room for +N more while any are left.
    if (full || used > room - (index < items.length - 1 ? 90 : 0)) {
      full = true;
      item.hidden = true;
      ui.quickHidden.push(...groups[index]);
    }
  });
  if (ui.quickHidden.length) {
    more.hidden = false;
    more.textContent = `+${ui.quickHidden.length} more`;
  }
}
