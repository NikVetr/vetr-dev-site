// Wires the simulated desktop together: lays out the screen for the page, renders the top bar, windows, dock and
// dropdown from the simulation, handles clicks, keys and window drags, runs the timer (paused while the tab is
// hidden), and exposes window.AgentBarDemo for tests and scripts.
import { createSim } from './sim.js';
import { esc, patch } from './dom.js';
import { renderPanel } from './bar.js';
import { WORK, bannerHtml, renderDock, renderWindows } from './desktop.js';
import { TABS, bare, bodyHtml, choosePicker, footerText, headingHtml, menuState, moreHtml, navHtml, pickerOptions, query, searchHint, sideHtml, tabsHtml, toolbarHtml, trayHtml } from './dropdown.js';
import { createTour } from './tour.js';

const TICK_MS = 1000;
const MIN_W = 1500, MIN_H = 780, PHONE = 760;
const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
const screen = /** @type {HTMLElement} */ (document.getElementById('screen'));
const panel = /** @type {HTMLElement} */ (document.getElementById('panel'));
const desktop = /** @type {HTMLElement} */ (document.getElementById('desktop'));
const dock = /** @type {HTMLElement} */ (document.getElementById('dock'));
const menus = /** @type {HTMLElement} */ (document.getElementById('menus'));
const banners = /** @type {HTMLElement} */ (document.getElementById('banners'));

const sim = createSim();
const m = menuState();
/** What the page shows beyond the simulation: which menu is open, the screen's size and scale, drafts. */
const ui = {
  open: /** @type {null|'menu'|'nav'|'more'|'tray'} */ (null), get view() { return m.view; }, get page() { return m.page; },
  scale: 1, workW: WORK[0], workH: WORK[1], phone: false, fitQuick: true, quickHidden: [], drafts: /** @type {Record<string, string>} */ ({}),
  running: true, banner: /** @type {any} */ (null), bannerQueue: /** @type {any[]} */ ([]), returnFocus: /** @type {HTMLElement|null} */ (null),
};
const listeners = new Set();
/** Tells the tour (and tests) what the visitor just did. */
function told(kind, detail = {}) { for (const fn of listeners) fn(kind, detail); }

// ------------------------------------------------------------------ layout
function layout() {
  const width = stage.clientWidth || document.documentElement.clientWidth;
  const top = stage.getBoundingClientRect().top + scrollY;
  const height = Math.max(420, innerHeight - top);
  ui.phone = width < PHONE;
  screen.classList.toggle('phone', ui.phone);
  stage.classList.toggle('phone', ui.phone);
  if (ui.phone) {
    ui.scale = 1;
    screen.style.cssText = '';
    stage.style.height = '';
    ui.workW = width;
    ui.workH = Math.max(380, innerHeight * 0.72);
    screen.style.setProperty('--phone-desk', `${ui.workH}px`);
  } else {
    const scale = Math.min(1, width / MIN_W, height / MIN_H);
    const vw = width / scale, vh = height / scale;
    ui.scale = scale;
    Object.assign(screen.style, { width: `${vw}px`, height: `${vh}px`, transform: `scale(${scale})` });
    stage.style.height = `${height}px`;
    ui.workW = vw - 64;
    ui.workH = vh - 32;
  }
  ui.fitQuick = true;
  render();
}

// ------------------------------------------------------------------ rendering
function render() {
  renderPanel(panel, sim, ui);
  renderWindows(desktop, sim, ui);
  renderDock(dock, sim, ui);
  renderMenus();
  screen.classList.toggle('tracker-colorblind', sim.state.settings.palette === 'colorblind');
}

function renderMenus() {
  if (ui.open !== 'menu') menus.querySelector('.tracker-popup.main')?.remove();
  if (ui.open !== 'menu' || !m.side) menus.querySelector('.tracker-popup.side')?.remove();
  for (const kind of ['nav', 'more', 'tray']) if (ui.open !== kind) menus.querySelector(`[data-menu="${kind}"]`)?.remove();
  if (ui.open === 'menu') renderDropdown();
  else if (ui.open) {
    let el = /** @type {HTMLElement} */ (menus.querySelector(`[data-menu="${ui.open}"]`));
    if (!el) {
      el = document.createElement('div');
      el.dataset.menu = ui.open;
      el.className = 'menu-holder';
      menus.append(el);
    }
    patch(el, ui.open === 'nav' ? navHtml(sim) : ui.open === 'more' ? moreHtml(ui.quickHidden) : trayHtml(sim));
    const anchor = panel.querySelector(ui.open === 'nav' ? '[data-act="nav"]' : ui.open === 'more' ? '.tracker-quick-more' : '[data-act="clock"]');
    const box = /** @type {HTMLElement} */ (el.firstElementChild);
    if (ui.phone) Object.assign(box.style, { position: 'relative', left: '0', top: '0', width: 'auto' });
    else {
      const left = Math.min(offsetX(anchor) - (ui.open === 'tray' ? 150 : 0), screen.offsetWidth / 1 - box.offsetWidth - 8);
      Object.assign(box.style, { left: `${Math.max(8, left)}px`, top: '39px' });
    }
  }
}
/** An element's left edge in screen pixels, before scaling. */
function offsetX(el) {
  return (el.getBoundingClientRect().left - screen.getBoundingClientRect().left) / ui.scale;
}

function renderDropdown() {
  let el = /** @type {HTMLElement} */ (menus.querySelector('.tracker-popup.main'));
  const fresh = !el;
  if (fresh) {
    el = document.createElement('div');
    el.className = 'tracker-popup main';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Agent Bar');
    el.innerHTML = `<div class="tracker-menu"><div data-region="heading"></div><div data-region="tabs"></div>
<div class="tracker-item search-item"><input class="tracker-search" type="search" data-fid="search" aria-label="Search" autocomplete="off" spellcheck="false"></div>
<div data-region="toolbar"></div><div class="tracker-body"><div class="tracker-scroll" id="tracker-panel" role="tabpanel" data-region="body"></div><div data-region="picker"></div></div>
<div class="tracker-separator"></div><div class="tracker-footer" data-region="footer"></div></div>`;
    menus.append(el);
  }
  const region = (name) => /** @type {HTMLElement} */ (el.querySelector(`[data-region="${name}"]`));
  const body = bodyHtml(sim, m);
  patch(region('heading'), headingHtml(sim, m));
  patch(region('tabs'), tabsHtml(m));
  patch(region('toolbar'), toolbarHtml(sim, m));
  const changed = patch(region('body'), body);
  region('footer').textContent = footerText(sim, m);
  const search = /** @type {HTMLInputElement} */ (el.querySelector('.tracker-search'));
  search.placeholder = searchHint(m);
  search.parentElement.hidden = !!m.page || bare(m);
  if (document.activeElement !== search && search.value !== query(m)) search.value = query(m);
  const scroll = region('body');
  scroll.setAttribute('aria-labelledby', `tab-${m.view}`);
  if (!ui.phone) {
    scroll.style.maxHeight = `${Math.min(650, screen.offsetHeight - 270)}px`;
    const anchor = panel.querySelector('.panel-agent');
    const left = Math.max(8, Math.min(offsetX(anchor) + 4, screen.offsetWidth - 700));
    Object.assign(el.style, { left: `${left}px`, top: '39px' });
  } else {
    scroll.style.maxHeight = `${Math.max(320, innerHeight - 260)}px`;
    el.style.cssText = '';
  }
  // The picker list hangs under its button, over the rows.
  const picker = region('picker');
  if (m.picker) {
    const [, , options, current] = pickerOptions(sim, m, m.picker) || [, , [], null];
    patch(picker, `<div class="tracker-picker-list" role="listbox" aria-label="${esc(m.picker)}">${options.map(([value, label]) => `<button type="button" role="option" aria-selected="${value === current}" class="tracker-picker-option${value === current ? ' tracker-picker-current' : ''}" data-act="pick" data-value="${esc(value)}" data-fid="pick-${esc(value)}">${value === current ? '✓' : '  '}  ${esc(label)}</button>`).join('')}</div>`);
    const button = el.querySelector(`[data-picker="${m.picker}"]`);
    const list = /** @type {HTMLElement} */ (picker.firstElementChild);
    if (button && list) {
      const b = button.getBoundingClientRect(), base = el.querySelector('.tracker-body').getBoundingClientRect();
      Object.assign(list.style, { left: `${(b.left - base.left) / ui.scale}px`, top: `${(b.bottom - base.top) / ui.scale + 3 - 0}px` });
      list.style.top = `${(b.bottom - base.top) / ui.scale + 3}px`;
      button.setAttribute('aria-expanded', 'true');
    }
  } else patch(picker, '');
  // The side dropdown sits beside the main one.
  let side = /** @type {HTMLElement} */ (menus.querySelector('.tracker-popup.side'));
  if (m.side) {
    if (!side) {
      side = document.createElement('div');
      side.className = 'tracker-popup side';
      side.setAttribute('role', 'dialog');
      side.setAttribute('aria-label', m.side.kind === 'schedule' ? 'Schedule a message' : 'Checklists');
      menus.append(side);
    }
    patch(side, `<div class="tracker-side">${sideHtml(sim, m)}</div>`);
    if (!ui.phone) {
      const right = el.offsetLeft + el.offsetWidth + 8;
      Object.assign(side.style, { left: `${Math.min(right, screen.offsetWidth - 380)}px`, top: '39px' });
    } else side.style.cssText = '';
  }
  if (fresh) search.addEventListener('input', () => {
    if (m.view === 'conversations' || m.view === 'history') m.chatQuery = search.value;
    else m.otherQuery = search.value;
    m.context = null;
    m.picker = null;
    renderDropdown();
    if (search.value.trim()) told('search', { view: m.view, query: search.value });
  });
  return changed;
}

// ------------------------------------------------------------------ opening and closing
function openMenu(view, { focus = false } = {}) {
  const wasOpen = ui.open === 'menu';
  if (wasOpen && m.view === view && !m.page) return closeMenus();
  if (!wasOpen) {
    ui.returnFocus = /** @type {HTMLElement} */ (document.activeElement);
    m.menuFocus = sim.state.focus;
  }
  if (m.view !== view) { m.otherQuery = ''; m.context = null; }
  m.view = view;
  m.page = null;
  m.picker = null;
  m.side = null;
  ui.open = 'menu';
  render();
  const scroll = menus.querySelector('[data-region="body"]');
  if (scroll && (!wasOpen || true)) scroll.scrollTop = 0;
  if (focus) /** @type {HTMLElement|null} */ (menus.querySelector(`[data-fid="tab-${view}"]`))?.focus();
  told('open', { view });
}
function closeMenus({ restore = true } = {}) {
  const was = ui.open;
  ui.open = null;
  m.picker = null;
  m.side = null;
  render();
  if (restore && was && ui.returnFocus?.isConnected) ui.returnFocus.focus({ preventScroll: true });
  ui.returnFocus = null;
  if (was === 'menu') told('close');
}
function toggleSmall(kind, anchor) {
  if (ui.open === kind) return closeMenus();
  ui.returnFocus = anchor;
  ui.open = kind;
  render();
  /** @type {HTMLElement|null} */ (menus.querySelector(`[data-menu="${kind}"] button`))?.focus();
}

/** Clicking a chat: a review shortcut always brings it forward; a dropdown row returns a window it borrowed. */
function activate(key, window, mode, byKeyboard = false) {
  const focused = ui.open === 'menu' ? m.menuFocus : sim.state.focus;
  if (ui.open) closeMenus({ restore: false });
  const result = sim.activate({ key, window }, mode, focused);
  if (result.ok && result.action === 'focused') requestAnimationFrame(() => {
    const chat = /** @type {HTMLElement|null} */ (desktop.querySelector(`[data-win="${CSS.escape(window)}"] [data-chat="${CSS.escape(key)}"] .chat-log`));
    // Keyboard focus follows the chat that came forward; on a phone, so does the page.
    if (byKeyboard) chat?.focus({ preventScroll: true });
    if (ui.phone) desktop.scrollIntoView({ block: 'nearest' });
  });
  told(result.action, { key, window, mode });
  return result;
}

// ------------------------------------------------------------------ clicks
const actions = {
  part: (el) => openMenu(el.dataset.part),
  shortcut: (el, keyboard) => activate(el.dataset.key, sim.byKey(el.dataset.key).window, 'focus', keyboard),
  more: (el) => toggleSmall('more', el),
  nav: (el) => toggleSmall('nav', el),
  clock: (el) => toggleSmall('tray', el),
  'nav-window': (el) => { const id = el.dataset.win; closeMenus({ restore: false }); sim.activate({ key: null, window: id }, 'place'); },
  'nav-new': () => { closeMenus(); notifyLocal('Visual Studio Code', 'In Agent Bar this opens a new VS Code window, maximized. The demo has no more windows to open.'); },
  'nav-saved': () => { ui.open = null; openMenu('history'); },
  tab: (el) => { openMenu(el.dataset.view); /** @type {HTMLElement|null} */ (menus.querySelector(`[data-fid="tab-${el.dataset.view}"]`))?.focus(); },
  page: (el) => { const target = el.dataset.page; m.page = m.page === target ? null : target; m.picker = null; m.side = null; render(); told('page', { page: m.page }); },
  picker: (el) => { m.picker = m.picker === el.dataset.picker ? null : el.dataset.picker; render(); /** @type {HTMLElement|null} */ (menus.querySelector('.tracker-picker-list [aria-selected="true"]'))?.focus(); },
  pick: (el) => {
    const [, , options] = pickerOptions(sim, m, m.picker);
    const value = options.find(([v]) => String(v) === el.dataset.value)[0];
    const name = m.picker;
    choosePicker(m, name, value);
    m.picker = null;
    render();
    /** @type {HTMLElement|null} */ (menus.querySelector(`[data-picker="${name}"]`))?.focus();
  },
  collapse: (el) => { const key = el.dataset.section; m.collapsed.has(key) ? m.collapsed.delete(key) : m.collapsed.add(key); render(); },
  bulk: () => { if (m.collapsedAny) for (const k of m.keys) m.collapsed.delete(k); else for (const k of m.keys) m.collapsed.add(k); render(); },
  row: (el, keyboard) => {
    if (!el.dataset.win) return;
    activate(el.dataset.key, el.dataset.win, 'toggle', keyboard);
  },
  resume: (el) => { closeMenus(); notifyLocal('Agent Bar', `In Agent Bar, Resume reopens “${sim.inventory().find((c) => c.key === el.dataset.key)?.title}” in VS Code in its folder. This demo has no closed chats to reopen.`); },
  'return-window': (el) => { closeMenus({ restore: false }); const r = sim.activate({ key: null, window: el.dataset.win }, 'return'); told(r.action, { window: el.dataset.win }); },
  'place-window': (el) => { closeMenus({ restore: false }); sim.activate({ key: null, window: el.dataset.win }, 'place'); },
  copy: (el) => {
    navigator.clipboard?.writeText(el.dataset.text).catch(() => {});
    m.copied = el.dataset.fid.replace(/^copy-/, '');
    render();
    setTimeout(() => { m.copied = null; render(); }, 1500);
  },
  export: (el) => {
    const row = sim.inventory().find((c) => c.key === el.dataset.key);
    notifyLocal('Agent Bar', `Exported ${row.messages.length} messages to ~/Downloads/${row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html (simulated: nothing was saved)`);
  },
  context: (el) => {
    m.context = m.context?.key === el.dataset.key ? null : { key: el.dataset.key, index: 0 };
    render();
    /** @type {HTMLElement|null} */ (menus.querySelector(`[data-fid="ctx-${CSS.escape(el.dataset.key)}"]`))?.focus();
    if (m.context) told('context', { key: el.dataset.key });
  },
  hit: (el) => { m.context.index = Math.max(0, m.context.index + Number(el.dataset.step)); render(); told('hit', { index: m.context.index }); },
  rescan: () => notifyLocal('Agent Bar', 'Scanned saved chats: nothing new (simulated).'),
  'clear-queues': (el) => { sim.clearQueues(el.dataset.project); },
  adjust: (el) => { const id = el.dataset.control; m.openControls.has(id) ? m.openControls.delete(id) : m.openControls.add(id); render(); },
  git: (el) => { closeMenus(); notifyLocal('Visual Studio Code', `In Agent Bar this opens Source Control for ${el.dataset.repo} in its VS Code window.`); },
  'fold-message': (el) => { const id = Number(el.dataset.id); m.openMessages.set(id, el.getAttribute('aria-expanded') !== 'true'); render(); },
  ticket: (el) => {
    const result = sim.ticket(Number(el.dataset.ticket), el.dataset.do);
    if (el.dataset.do === 'start') { closeMenus({ restore: false }); ui.drafts[result.key] = sim.byKey(result.key).draft; render(); told('ticket-start', result); }
  },
  'new-ticket': () => { m.ticketDraft = { body: '', project: sim.state.rows[0].project, when: 'now' }; render(); /** @type {HTMLElement|null} */ (menus.querySelector('[data-fid="ticket-body"]'))?.focus(); },
  draft: (el) => { m.ticketDraft[el.dataset.field] = el.dataset.value; render(); },
  'cancel-ticket': () => { m.ticketDraft = null; render(); },
  'add-ticket': () => { sim.addTicket(m.ticketDraft); m.ticketDraft = null; render(); },
  hook: (el) => { const id = el.dataset.hook; m.openHooks.has(id) ? m.openHooks.delete(id) : m.openHooks.add(id); render(); },
  setting: (el) => {
    const raw = el.dataset.value;
    sim.setting(el.dataset.setting, raw === 'true' ? true : raw === 'false' ? false : raw);
  },
  side: (el) => {
    const same = m.side?.kind === el.dataset.side && m.side.key === el.dataset.key;
    m.side = same ? null : { kind: el.dataset.side, key: el.dataset.key, when: 'hour', repeat: 'never', text: '' };
    render();
  },
  'side-close': () => { m.side = null; render(); },
  'side-pick': (el) => { m.side[el.dataset.field] = el.dataset.value; render(); },
  schedule: () => { sim.schedule(m.side.key, m.side.text, m.side.when, m.side.repeat); m.side.text = ''; render(); },
  banner: (el) => {
    const key = el.dataset.key;
    ui.banner = null;
    renderBanner();
    if (ui.open) closeMenus({ restore: false });
    if (sim.byKey(key)) activate(key, sim.byKey(key).window, 'focus');
  },
  min: (el) => sim.minimize(el.closest('[data-win]').dataset.win),
  max: (el) => sim.toggleMaximize(el.closest('[data-win]').dataset.win),
  'file': (el) => sim.showFile(el.dataset.win),
  dock: (el) => {
    const kind = el.dataset.kind;
    const windows = sim.state.windows.filter((w) => w.kind === kind).sort((a, b) => b.z - a.z);
    if (!windows.length) return;
    const focused = windows.findIndex((w) => w.id === sim.state.focus && !w.minimized);
    sim.focusWindow((focused >= 0 ? windows[(focused + 1) % windows.length] : windows[0]).id);
  },
  raise: (el) => sim.focusWindow(el.dataset.win),
  prompt: (el) => sendPrompt(el.dataset.key, el.dataset.text),
  activities: () => {}, system: () => {}, apps: () => {}, noop: () => {},
};
// VS Code chat tabs are buttons with data-act="tab" too; inside a window they show that chat.
function onClick(event) {
  const target = /** @type {HTMLElement} */ (event.target);
  const el = /** @type {HTMLElement|null} */ (target.closest('[data-act], [data-part]'));
  const inWindow = target.closest('[data-win].window');
  if (inWindow && !target.closest('[data-act="min"], [data-act="max"]')) {
    const id = /** @type {HTMLElement} */ (inWindow).dataset.win;
    if (sim.state.focus !== id) sim.focusWindow(id);
  }
  // A click outside an open menu closes it, as on GNOME's top bar; a click on another top-bar part switches tabs.
  if (ui.open && !target.closest('.tracker-popup, .menu-holder') && !el?.closest('#panel')) closeMenus({ restore: false });
  if (!el) return;
  if (el.dataset.part) return actions.part(el);
  const act = el.dataset.act;
  if (act === 'tab' && el.closest('.window')) return sim.showChat(el.dataset.key);
  if (act === 'picker' || act === 'pick') event.stopPropagation();
  // A click with no pointer position is a key press on the button.
  actions[act]?.(el, event.detail === 0);
}
screen.addEventListener('click', onClick);

function sendPrompt(key, text) {
  const row = sim.byKey(key);
  if (!text.trim() || !row) return;
  const result = sim.prompt(key, text.trim());
  if (result.ok) {
    ui.drafts[key] = '';
    told('prompt', { key, text });
  }
}
screen.addEventListener('submit', (event) => {
  const form = /** @type {HTMLFormElement} */ (event.target);
  if (form.dataset.form !== 'prompt') return;
  event.preventDefault();
  const field = /** @type {HTMLInputElement} */ (form.querySelector('[data-draft]'));
  sendPrompt(form.dataset.key, field.value);
});
screen.addEventListener('input', (event) => {
  const field = /** @type {HTMLInputElement} */ (event.target);
  if (field.dataset.draft) ui.drafts[field.dataset.draft] = field.value;
  if (field.dataset.fieldInput) { m.ticketDraft.body = field.value; renderDropdown(); }
  if (field.hasAttribute('data-side-input')) { m.side.text = field.value; renderDropdown(); }
});

// ------------------------------------------------------------------ keys
screen.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  if (event.key === 'Escape' && ui.open) {
    event.preventDefault();
    if (m.picker) { const name = m.picker; m.picker = null; render(); /** @type {HTMLElement|null} */ (menus.querySelector(`[data-picker="${name}"]`))?.focus(); return; }
    if (m.side) { m.side = null; render(); return; }
    closeMenus();
    return;
  }
  if (target.matches('textarea[data-draft]') && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendPrompt(target.dataset.draft, /** @type {HTMLTextAreaElement} */ (target).value);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && target.matches('[role="button"][data-act]')) {
    event.preventDefault();
    target.click();
    return;
  }
  if (target.matches('[role="tab"].tracker-filter') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const index = TABS.findIndex(([v]) => v === m.view);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    openMenu(TABS[next][0], { focus: true });
    return;
  }
  if (target.closest('[role="menu"], [role="listbox"]') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    const items = /** @type {HTMLElement[]} */ ([...target.closest('[role="menu"], [role="listbox"]').querySelectorAll('button')]);
    const i = items.indexOf(target);
    items[(i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
});

// ------------------------------------------------------------------ dragging windows by their title bars
let drag = null;
screen.addEventListener('pointerdown', (event) => {
  const bar = /** @type {HTMLElement} */ (event.target).closest('[data-drag]');
  if (!bar || ui.phone || /** @type {HTMLElement} */ (event.target).closest('button')) return;
  const el = /** @type {HTMLElement} */ (bar.closest('[data-win]'));
  const win = sim.state.windows.find((w) => w.id === el.dataset.win);
  if (win.maximized) return;
  drag = { win, el, x: event.clientX, y: event.clientY, rect: [...win.rect], moved: false };
  bar.setPointerCapture(event.pointerId);
});
screen.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const dx = (event.clientX - drag.x) / ui.scale / (ui.workW / WORK[0]), dy = (event.clientY - drag.y) / ui.scale / (ui.workH / WORK[1]);
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  const [x, y, w, h] = drag.rect;
  sim.moveWindow(drag.win.id, [Math.max(-w + 80, Math.min(WORK[0] - 80, x + dx)), Math.max(0, Math.min(WORK[1] - 40, y + dy)), w, h]);
});
screen.addEventListener('pointerup', () => { drag = null; });
screen.addEventListener('dblclick', (event) => {
  const bar = /** @type {HTMLElement} */ (event.target).closest('[data-drag]');
  if (bar && !ui.phone && !/** @type {HTMLElement} */ (event.target).closest('button')) sim.toggleMaximize(/** @type {HTMLElement} */ (bar.closest('[data-win]')).dataset.win);
});

// ------------------------------------------------------------------ tooltips
let tipTimer = 0;
const tip = document.createElement('div');
tip.className = 'tracker-tooltip';
tip.hidden = true;
tip.setAttribute('role', 'tooltip');
screen.append(tip);
function showTip(el) {
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => {
    if (!el.isConnected) return;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), s = screen.getBoundingClientRect();
    const left = Math.min((r.left - s.left) / ui.scale, screen.offsetWidth - tip.offsetWidth - 8);
    let top = (r.bottom - s.top) / ui.scale + 6;
    if (top + tip.offsetHeight > screen.offsetHeight) top = (r.top - s.top) / ui.scale - tip.offsetHeight - 6;
    Object.assign(tip.style, { left: `${Math.max(4, left)}px`, top: `${top}px` });
  }, 350);
}
function hideTip() { clearTimeout(tipTimer); tip.hidden = true; }
screen.addEventListener('pointerover', (event) => {
  const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-tip]'));
  if (el) showTip(el); else hideTip();
});
screen.addEventListener('focusin', (event) => {
  const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-tip]'));
  if (el && el.matches(':focus-visible')) showTip(el); else hideTip();
});
screen.addEventListener('pointerleave', hideTip);

// ------------------------------------------------------------------ notifications
function renderBanner() {
  patch(banners, ui.banner ? bannerHtml(ui.banner) : '');
}
function showNext() {
  ui.banner = ui.bannerQueue.shift() ?? null;
  renderBanner();
  if (ui.banner) {
    const shown = ui.banner;
    setTimeout(() => { if (ui.banner === shown && !banners.matches(':hover, :focus-within')) showNext(); else if (ui.banner === shown) setTimeout(showNext, 2500); }, 5000);
  }
}
function notifyLocal(title, body) {
  ui.bannerQueue.push({ id: `local-${Date.now()}`, title, body, key: '' });
  if (!ui.banner) showNext();
}
sim.on((kind, detail) => {
  if (kind === 'notify') {
    // GNOME shows one banner at a time; the rest wait their turn (all stay listed under the clock).
    if (ui.bannerQueue.length < 3) ui.bannerQueue.push(detail);
    if (!ui.banner) showNext();
    told('notify', detail);
  }
  if (kind === 'change') scheduleRender();
});
let pending = false;
function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

// ------------------------------------------------------------------ the clock: one tick a second, paused while hidden
let timer = 0;
function startTimer() {
  clearInterval(timer);
  if (ui.running && !document.hidden) timer = window.setInterval(() => sim.tick(), TICK_MS);
}
document.addEventListener('visibilitychange', startTimer);
document.addEventListener('themechange', () => render());
new ResizeObserver(() => layout()).observe(stage);
addEventListener('resize', layout);

// ------------------------------------------------------------------ the tour
const tour = createTour({ stage, screen, ui, sim, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, openMenu, closeMenus });
const tourButton = /** @type {HTMLElement} */ (document.getElementById('tour-button'));
tourButton.addEventListener('click', () => (tour.active() ? tour.stop() : tour.start()));
tour.onChange((active) => tourButton.setAttribute('aria-pressed', String(active)));
document.addEventListener('keydown', (event) => {
  const typing = /** @type {HTMLElement} */ (event.target).closest('input, textarea, [contenteditable]');
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 't' || event.key === 'T') { event.preventDefault(); tour.active() ? tour.stop() : tour.start(); }
});

// ------------------------------------------------------------------ the API for tests and scripts
/** A plain summary of what the simulated desktop shows. */
function summary() {
  const snap = sim.snapshot();
  return {
    providers: snap.providers, counts: snap.counts, mail: snap.stranded.length, tickets: snap.readyTickets.length, queues: { done: snap.queues.done, total: snap.queues.total },
    quota: Object.fromEntries(['claude', 'codex'].map((p) => [p, Math.floor(sim.limitOf(p, 'weekly').left)])),
    shortcuts: snap.quick.map((group) => ({ project: group[0].project, chats: group.map((r) => r.key) })),
    focus: snap.focus, windows: snap.windows.map((w) => ({ id: w.id, kind: w.kind, project: w.workspace, maximized: w.maximized, minimized: w.minimized, shown: w.shown, z: w.z, borrowed: !!snap.borrowed[w.id] })),
    chats: snap.rows.map((r) => ({ key: r.key, title: r.title, project: r.project, provider: r.provider, state: r.state, unread: r.unread, letters: r.letters, window: r.window, pending: r.pending })),
    dropdown: ui.open === 'menu' ? { view: m.view, page: m.page, query: query(m) } : null, open: ui.open, running: ui.running, phone: ui.phone, tour: tour.state(),
    notifications: sim.state.notifications.map((n) => ({ title: n.title, body: n.body })),
  };
}
/** @type {any} */ (window).AgentBarDemo = {
  version: 1,
  state: summary,
  /** Advance the simulation by n ticks (a second each), whether or not the timer runs. */
  tick(n = 1) { for (let i = 0; i < n; i++) sim.tick(); render(); return summary(); },
  pause() { ui.running = false; startTimer(); return summary(); },
  resume() { ui.running = true; startTimer(); return summary(); },
  /** Open the dropdown on a tab (conversations, queues, cluster, git, messages, tickets, history, quota, info), or close it with null. */
  open(view) { if (view === null) closeMenus(); else { if (!TABS.some(([v]) => v === view)) throw new Error(`No tab ${view}`); if (!(ui.open === 'menu' && m.view === view)) openMenu(view); } return summary(); },
  /** Click a chat: mode 'focus' as its review shortcut, 'toggle' as its dropdown row, or 'return'. */
  activate(key, mode = 'focus') { const row = sim.byKey(key); if (!row) throw new Error(`No chat ${key}`); return activate(key, row.window, mode); },
  prompt(key, text) { const r = sim.prompt(key, text); render(); return r; },
  search(text) { openMenu('history'); m.chatQuery = text; render(); return sim.search(text).map((h) => ({ title: h.chat.title, project: h.chat.project, messages: h.messages.length })); },
  setting(name, value) { sim.setting(name, value); return summary(); },
  /** Set a provider's weekly or 5-hour limit, in percent used. */
  setQuota(provider, key, percent) { const l = sim.limitOf(provider, key); if (!l) throw new Error(`No ${provider} limit ${key}`); l.percent = percent; l.left = 100 - percent; render(); return summary(); },
  send(from, to, body) { if (!sim.byKey(from) || !sim.byKey(to)) throw new Error('send needs two open chat keys'); sim.send(from, to, body); render(); return summary(); },
  tour: { start: () => tour.start(), stop: () => tour.stop(), next: () => tour.next(), state: () => tour.state() },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  sim,
};

layout();
startTimer();
if (new URLSearchParams(location.search).has('tour')) tour.start();
