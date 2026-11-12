// The standalone Helix editor owns drawing/validation; this dialog owns only
// the draft lifetime and the one explicit application to a Name Tags workspace.
import { normalizeDecorationDesign } from './core/request.js';

/** @param {{getRequest:()=>unknown,onApply:(request:NonNullable<ReturnType<typeof normalizeDecorationDesign>>)=>void}} options */
export function decorationEditor({ getRequest, onApply }) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('decoration-dialog'));
  const opener = /** @type {HTMLButtonElement} */ (document.getElementById('customize-decoration'));
  const apply = /** @type {HTMLButtonElement} */ (document.getElementById('apply-decoration'));
  const status = /** @type {HTMLElement} */ (document.getElementById('decoration-editor-status'));
  const host = /** @type {HTMLElement} */ (document.getElementById('decoration-editor-host'));
  /** @type {HTMLIFrameElement | null} */ let frame = null;
  /** @type {ReturnType<typeof normalizeDecorationDesign>} */ let draft = null;
  let sessionId = 0;
  let loaded = false;

  const close = () => dialog.close();
  opener.addEventListener('click', () => {
    sessionId++;
    draft = null; loaded = false; apply.disabled = true;
    status.textContent = 'Loading the editor…';
    frame = document.createElement('iframe');
    frame.title = 'Helix and Braid drawing controls';
    frame.src = '../helix/?embed=name-tags';
    host.replaceChildren(frame);
    dialog.showModal();
  });
  for (const id of ['cancel-decoration', 'close-decoration']) document.getElementById(id)?.addEventListener('click', close);
  dialog.addEventListener('close', () => {
    frame = null; draft = null; loaded = false;
    host.replaceChildren();
    opener.focus();
  });
  window.addEventListener('message', event => {
    if (!dialog.open || !frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'helix:ready' && !loaded) {
      loaded = true;
      frame.contentWindow?.postMessage({ type: 'helix:load', request: structuredClone(getRequest() ?? null), sessionId }, location.origin);
      return;
    }
    if (!loaded || data.sessionId !== sessionId) return;
    if (data.type === 'helix:close') { close(); return; }
    if (data.type === 'helix:invalid') {
      draft = null; apply.disabled = true;
      status.textContent = typeof data.message === 'string' && data.message ? data.message : 'Finish a valid drawing to apply it.';
    } else if (data.type === 'helix:change') {
      try {
        draft = normalizeDecorationDesign(data.request);
        if (!draft) throw new Error('Choose a helix or braid drawing.');
        apply.disabled = false;
        status.textContent = 'Ready. Apply uses this drawing in the existing decoration space.';
      } catch (error) {
        draft = null; apply.disabled = true;
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  });
  apply.addEventListener('click', () => {
    if (!draft || apply.disabled) return;
    onApply(structuredClone(draft));
    close();
  });
  return { close: () => { if (dialog.open) close(); } };
}
