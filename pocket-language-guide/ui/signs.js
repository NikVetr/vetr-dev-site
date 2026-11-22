import { deferUpdates, keepOffline, loadText, registerOffline, withBusy } from './app.js';
import { el } from './board-menu.js';
import { isNative, onBack } from './platform/shell.js';
import { ready } from './platform/store.js';
import { applyTheme, readTheme } from './theme.js';
import { mediaUrl, showSign, signRoot } from './sign-media.js';
import { startQuiz } from './sign-quiz.js';

/** @param {string} id */
function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing sign workspace element: ' + id);
  return node;
}
/** @param {unknown} err */
function report(err) {
  const msg = byId('sign-error');
  msg.hidden = false;
  msg.textContent = String(err);
}
async function main() {
  registerOffline();
  await ready();
  applyTheme(readTheme());
  /** @type {import('./sign-media.js').SignGroup[]} */
  const groups = JSON.parse(await loadText(signRoot + 'pack.json'));
  const signs = groups.flatMap(g => g.entries);
  const dialog = /** @type {HTMLDialogElement} */ (byId('sign-dialog'));
  const body = byId('dialog-body');
  let selection = new AbortController();
  dialog.addEventListener('close', () => { selection.abort(); body.replaceChildren(); });
  byId('close-sign').onclick = () => dialog.close();
  /** @param {string} title */
  function open(title) {
    selection.abort();
    selection = new AbortController();
    byId('dialog-title').textContent = title;
    body.replaceChildren();
    if (!dialog.open) dialog.showModal();
  }
  for (const group of groups) {
    const grid = el('div', { class:'sign-grid' });
    for (const sign of group.entries) {
      const tile = el('button', { class:'sign-tile', type:'button' }, [
        el('img', { src:mediaUrl(sign,'1.jpg'), alt:'', width:'66', height:'75' }), sign.label,
      ]);
      tile.onclick = () => { open(sign.label); showSign(body, sign, selection.signal); };
      grid.append(tile);
      byId('sign-sources').append(el('a', { href:sign.source, text:sign.label }));
    }
    byId('sign-board').append(el('h2', { text:group.title }), grid);
  }
  byId('write-reply').onclick = () => {
    open('Exchange a written message');
    const input = document.createElement('textarea');
    input.id = 'cafe-message';
    input.rows = 3;
    input.maxLength = 600;
    const show = document.createElement('button');
    show.textContent = 'Show message';
    const compose = el('div', {}, [el('label', { for:input.id, text:'Your message' }), input, show]);
    const display = el('p', { class:'sign-message', 'aria-live':'polite' });
    const reply = document.createElement('button');
    reply.textContent = 'Write a reply';
    const presented = el('div', {}, [display, reply]);
    const prompts = el('div', { class:'sign-actions' });
    /** @param {string} text */
    const present = text => {
      if (!text.trim()) { input.focus(); return; }
      display.textContent = text.trim();
      compose.hidden = true;
      presented.hidden = false;
      reply.focus();
    };
    for (const label of ['How much is it?', 'Please type your reply.']) {
      const btn = el('button', { text:label });
      btn.onclick = () => present(label);
      prompts.append(btn);
    }
    compose.prepend(prompts);
    presented.hidden = true;
    show.onclick = () => present(input.value);
    reply.onclick = () => { input.value = ''; presented.hidden = true; compose.hidden = false; input.focus(); };
    body.append(compose, presented);
    input.focus();
  };
  let section = '', activity = new AbortController();
  /** @type {Promise<void>|undefined} */ let printing;
  const pdf = /** @type {HTMLButtonElement} */ (byId('save-pdf'));
  const print = /** @type {HTMLButtonElement} */ (byId('print-signs'));
  function route() {
    const hash = location.hash.slice(1);
    const mode = ['converse','quiz','cards'].includes(hash) ? hash : section || 'converse';
    if (section === mode) return;
    section = mode;
    activity.abort(); activity = new AbortController();
    if (dialog.open) dialog.close();
    for (const tab of document.querySelectorAll('.sign-tabs a')) {
      const id = /** @type {HTMLAnchorElement} */ (tab).hash.slice(1);
      byId('sign-' + id).hidden = id !== mode;
      if (id === mode) tab.setAttribute('aria-current','page');
      else tab.removeAttribute('aria-current');
    }
    if (mode === 'quiz') startQuiz(signs, activity.signal, report);
    if (mode === 'cards') {
      printing ??= import('./sign-cards.js').then(async ({showCards}) => {
        const exportPdf = await showCards(groups, byId('sign-faces'), report);
        if (isNative()) {
          pdf.textContent = 'Share or print PDF';
          print.hidden = true;
        }
        pdf.disabled = print.disabled = false;
        pdf.onclick = () => { void withBusy(pdf, 'Preparing PDF…', exportPdf).catch(report); };
        print.onclick = () => window.print();
      }).catch(err => { printing = undefined; report(err); });
    }
  }
  window.addEventListener('hashchange', route);
  onBack(() => false, './');
  deferUpdates(() => section !== 'quiz' && !dialog.open);
  route();

  const status = byId('offline-status');
  const retry = byId('retry-offline');
  if (JSON.parse(await loadText('data/native.json')).native) {
    status.textContent = 'Café available offline';
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const savePack = async () => {
    retry.hidden = true;
    status.textContent = 'Saving café for offline use…';
    try {
      const urls = signs.flatMap(s => [mediaUrl(s,'mp4'), mediaUrl(s,'1.jpg'), mediaUrl(s,'2.jpg')]);
      const result = await keepOffline(urls, true);
      if (!result.ok) throw new Error('Incomplete pack');
      status.textContent = 'Café available offline';
    } catch {
      status.textContent = 'Offline café incomplete.';
      retry.hidden = false;
    }
  };
  retry.onclick = savePack;
  void savePack();
}
main().catch(report);
