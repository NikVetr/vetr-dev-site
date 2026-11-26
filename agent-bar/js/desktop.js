// The desktop under the top bar: windows (placed, stacked, maximized and dragged), Ubuntu's dock, and GNOME's
// notification banners. Window geometry lives in the simulation, in the fixture's 1376 × 828 work-area units.
import { appIcon, esc, icon, patch } from './dom.js';
import { appName, windowBody, windowTitle } from './apps.js';

export const WORK = [1376, 828];

/** @param {HTMLElement} desktop @param {any} sim @param {any} ui */
export function renderWindows(desktop, sim, ui) {
  const snap = sim.snapshot();
  const rows = snap.rows;
  const [fx, fy] = [ui.workW / WORK[0], ui.workH / WORK[1]];
  const front = sim.topWindow();
  for (const win of snap.windows) {
    let el = /** @type {HTMLElement} */ (desktop.querySelector(`[data-win="${CSS.escape(win.id)}"]`));
    if (!el) {
      el = document.createElement('section');
      el.dataset.win = win.id;
      el.innerHTML = '<header class="titlebar" data-drag></header><div class="window-body"></div>';
      desktop.append(el);
    }
    const shown = rows.find((r) => r.key === win.shown);
    if (shown?.surface === 'tab') win.lastTab = shown.key;
    const focused = snap.focus === win.id && !win.minimized;
    el.className = `window ${win.kind}${win.maximized ? ' maximized' : ' restored'}${focused ? ' focused' : ''}${front?.id === win.id ? ' front' : ''}`;
    el.hidden = win.minimized;
    el.setAttribute('aria-label', `${windowTitle(win, rows)}${focused ? ' (focused)' : ''}`);
    el.style.zIndex = String(win.z);
    if (win.maximized) Object.assign(el.style, { left: '0px', top: '0px', width: `${ui.workW}px`, height: `${ui.workH}px` });
    else {
      const [x, y, w, h] = win.rect;
      Object.assign(el.style, { left: `${x * fx}px`, top: `${y * fy}px`, width: `${w * fx}px`, height: `${h * fy}px` });
    }
    const title = windowTitle(win, rows);
    const buttons = `<div class="wm-buttons"><button type="button" class="wm-button" data-act="min" aria-label="Minimize" data-fid="min-${win.id}">${icon.minimize()}</button><button type="button" class="wm-button" data-act="max" aria-label="${win.maximized ? 'Restore' : 'Maximize'}" data-fid="max-${win.id}">${win.maximized ? icon.unmax() : icon.max()}</button><button type="button" class="wm-button close" data-act="min" aria-label="Close (this demo hides the window instead)" data-tip="Close: this demo hides the window instead" data-fid="close-${win.id}">${icon.close()}</button></div>`;
    const lead = win.kind === 'vscode' ? '<div class="menu" aria-hidden="true"><span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span>Terminal</span></div>'
      : '<div class="lead" aria-hidden="true"></div>';
    patch(/** @type {Element} */ (el.firstElementChild), `${lead}<div class="title">${esc(title)}</div>${buttons}`);
    if (!win.minimized) patch(/** @type {Element} */ (el.lastElementChild), windowBody(win, rows, snap.now, ui.phone));
    for (const field of /** @type {NodeListOf<HTMLInputElement>} */ (el.querySelectorAll('[data-draft]'))) {
      const draft = ui.drafts[field.dataset.draft] ?? '';
      if (document.activeElement !== field && field.value !== draft) field.value = draft;
    }
  }
}

/** Ubuntu's dock: an icon per app, with a dot per open window. */
export function renderDock(dock, sim, ui) {
  const windows = sim.state.windows;
  const apps = [['files', 'Files', null], ['terminal', 'Terminal', 'terminal'], ['vscode', 'Visual Studio Code', 'vscode'],
    ['ide', 'Antigravity IDE', 'ide'], ['app', 'Codex app', 'app']];
  const focus = windows.find((w) => w.id === sim.state.focus);
  const items = apps.map(([key, name, kind]) => {
    const open = windows.filter((w) => w.kind === kind);
    const dots = open.slice(0, 4).map(() => '<i></i>').join('');
    return `<button type="button" class="dock-item${focus?.kind === kind && !focus.minimized ? ' focused' : ''}" data-act="dock" data-kind="${kind ?? ''}" data-fid="dock-${key}" aria-label="${esc(name)}${open.length ? `, ${open.length} window${open.length === 1 ? '' : 's'}` : ''}" data-tip="${esc(name)}${kind ? '' : ': not part of this demo'}">${appIcon[key]}${dots ? `<span class="dots" aria-hidden="true">${dots}</span>` : ''}${ui.phone && kind ? `<span>${open.length}</span>` : ''}</button>`;
  }).join('');
  // On a phone the strip lists the windows themselves, so any one can come to the front.
  const strip = ui.phone ? windows.map((w) => `<button type="button" class="dock-item${focus?.id === w.id && !w.minimized ? ' focused' : ''}" data-act="raise" data-win="${w.id}" data-fid="raise-${w.id}" aria-label="${esc(w.workspace)} · ${esc(appName(w))}${w.minimized ? ' (minimized)' : ''}">${appIcon[w.kind]}<span>${esc(w.workspace)}</span></button>`).join('') : items;
  patch(dock, `${strip}${ui.phone ? '' : `<button type="button" class="dock-item dock-apps" data-act="apps" data-fid="dock-apps" aria-label="Show Applications: not part of this demo" data-tip="Show Applications: not part of this demo">${appIcon.grid}</button>`}`);
}

/** GNOME's banner for the newest notification; clicking it opens the chat. @param {any} notice */
export function bannerHtml(notice) {
  return `<button type="button" class="banner" data-act="banner" data-key="${esc(notice.key)}" data-fid="banner-${notice.id}"><span aria-hidden="true">${icon.bulb(30)}</span><span class="text"><strong>${esc(notice.title)}</strong><span>${esc(notice.body)}</span></span></button>`;
}
