// Small DOM helpers and the symbolic icons the simulated desktop draws (stand-ins for GNOME's Adwaita
// symbolic icons and Agent Bar's painted glyphs: mail, ticket, gear).

/** @param {unknown} text */
export function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sets `el.innerHTML` only when it changed, keeping focus on the element with the same data-fid.
 * @param {Element} el @param {string} html */
export function patch(el, html) {
  if (/** @type {any} */ (el)._html === html) return false;
  const active = /** @type {HTMLInputElement|null} */ (document.activeElement);
  const fid = active && el.contains(active) ? active.getAttribute('data-fid') : null;
  const typed = fid && active.matches('input, textarea') ? [active.value, active.selectionStart, active.selectionEnd] : null;
  // A scrolled pane keeps its place, unless it was at its end (a log), where it follows what arrives.
  const scrolls = [...el.querySelectorAll('[data-keep-scroll]')].map((node) => [node.getAttribute('data-keep-scroll'), node.scrollTop,
    node.scrollTop + node.clientHeight >= node.scrollHeight - 4]);
  el.innerHTML = html;
  /** @type {any} */ (el)._html = html;
  for (const [key, top, atEnd] of scrolls) {
    const node = el.querySelector(`[data-keep-scroll="${key}"]`);
    if (node) node.scrollTop = atEnd && node.hasAttribute('data-follow') ? node.scrollHeight : Number(top);
  }
  for (const node of el.querySelectorAll('[data-follow]')) if (!scrolls.some(([key]) => key === node.getAttribute('data-keep-scroll'))) node.scrollTop = node.scrollHeight;
  if (fid) {
    const next = /** @type {HTMLInputElement|null} */ (el.querySelector(`[data-fid="${CSS.escape(fid)}"]`));
    next?.focus({ preventScroll: true });
    if (next && typed && next.matches('input, textarea')) {
      next.value = /** @type {string} */ (typed[0]);
      next.setSelectionRange(/** @type {number} */ (typed[1]), /** @type {number} */ (typed[2]));
    }
  }
  return true;
}

const svg = (body, size = 16, view = 16) => `<svg class="tracker-glyph" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  copy: (s = 14) => svg('<rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5" fill="currentColor" stroke="none"/><path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h6"/>', s),
  save: (s = 14) => svg('<path d="M8 2v8.5M4.5 7.5 8 11l3.5-3.5M2.5 14h11"/>', s),
  alarm: (s = 14) => svg('<circle cx="8" cy="9" r="5"/><path d="M8 6.5V9l1.8 1.2M2.5 3.5l2-1.5M13.5 3.5l-2-1.5"/>', s),
  list: (s = 14) => svg('<path d="M6 4h8M6 8h8M6 12h8"/><circle cx="2.8" cy="4" r=".9" fill="currentColor"/><circle cx="2.8" cy="8" r=".9" fill="currentColor"/><circle cx="2.8" cy="12" r=".9" fill="currentColor"/>', s),
  restore: (s = 16) => svg('<rect x="5.5" y="5.5" width="5" height="5" rx=".5" stroke-width="2"/>', s),
  maximize: (s = 16) => svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke-width="2"/>', s),
  gear: (s = 16) => svg('<circle cx="8" cy="8" r="2.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke-width="2.2"/>', s),
  refresh: (s = 14) => svg('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>', s),
  open: (s = 16) => svg('<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7"/>', s),
  mail: (s = 16) => svg('<rect x="1.5" y="3.5" width="13" height="9" rx="1" fill="currentColor" stroke="none"/><path d="M2 4.2 8 8.6l6-4.4" stroke="#1d2025" stroke-width="1.4"/>', s),
  mailOpen: (s = 16) => svg('<path d="M1.8 7 8 2.8 14.2 7v6.2H1.8z"/><path d="M1.8 7 8 11l6.2-4"/>', s),
  ticket: (s = 16) => svg('<path d="M1.5 4.5h13v2a1.5 1.5 0 0 0 0 3v2h-13v-2a1.5 1.5 0 0 0 0-3z" fill="currentColor" stroke="none"/>', s),
  minimize: (s = 16) => svg('<path d="M4.5 11.5h7" stroke-width="1.6"/>', s),
  close: (s = 16) => svg('<path d="m4.8 4.8 6.4 6.4M11.2 4.8l-6.4 6.4" stroke-width="1.6"/>', s),
  max: (s = 16) => svg('<rect x="4.5" y="4.5" width="7" height="7" rx="1" stroke-width="1.4"/>', s),
  unmax: (s = 16) => svg('<rect x="4" y="6" width="6" height="6" rx="1" stroke-width="1.4"/><path d="M6.5 4h5.5v5.5" stroke-width="1.4"/>', s),
  wifi: () => svg('<path d="M1.5 6.2a9.5 9.5 0 0 1 13 0M3.6 8.6a6.3 6.3 0 0 1 8.8 0M5.8 11a3 3 0 0 1 4.4 0" stroke-width="1.8"/><circle cx="8" cy="13.2" r="1" fill="currentColor" stroke="none"/>'),
  volume: () => svg('<path d="M2 6h2.5L8 3v10l-3.5-3H2z" fill="currentColor" stroke="none"/><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.3 3.6a6 6 0 0 1 0 8.8" stroke-width="1.6"/>'),
  power: () => svg('<path d="M8 1.8v6M4.4 4a5.3 5.3 0 1 0 7.2 0" stroke-width="1.8"/>'),
  search: (s = 14) => svg('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>', s),
  bulb: (s = 30) => svg('<path d="M5 10.5a5 5 0 1 1 6 0c-.8.6-1 1.2-1 2H6c0-.8-.2-1.4-1-2z" fill="currentColor" stroke="none"/><path d="M6 14.2h4" stroke-width="1.6"/><path d="m6.5 7.5 1.5 1.5 1.5-1.5" stroke="#3f3f3f" stroke-width="1.2"/>', s),
};

/** App icons for the dock: plain drawings, not the apps' logos. */
export const appIcon = {
  files: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="M4 9a3 3 0 0 1 3-3h8l3 3h15a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#e3a34b"/><rect x="4" y="13" width="32" height="21" rx="3" fill="#f6c35f"/></svg>',
  terminal: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="5" width="34" height="30" rx="5" fill="#3b0f2e"/><rect x="3" y="5" width="34" height="7" rx="3" fill="#5b5b5b"/><path d="m9 18 5 4-5 4" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 27h9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  vscode: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="7" fill="#1f6fc1"/><path d="m16 13-7 7 7 7M24 13l7 7-7 7" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ide: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="7" fill="#243150"/><path d="M20 10 31 30H9z" fill="none" stroke="#9fb4ff" stroke-width="2.6" stroke-linejoin="round"/></svg>',
  app: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="9" fill="#e9e9ec"/><path d="M14 15h12M14 20h12M14 25h7" stroke="#222" stroke-width="2.4" stroke-linecap="round"/></svg>',
  grid: '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><g fill="#f2f2f2">' + [12, 20, 28].flatMap((y) => [12, 20, 28].map((x) => `<circle cx="${x}" cy="${y}" r="2.4"/>`)).join('') + '</g></svg>',
};
