// Small, bounded histories for browser tools. Adapters own their snapshots: copy
// editable values and retain immutable results/assets, rather than cloning pixels.

/**
 * @template T
 * @param {{capture:()=>T, restore:(state:T)=>void, equal?:(a:T,b:T)=>boolean,
 * limit?:number, onChange?:(history:any)=>void}} options
 */
export function createHistory({ capture, restore, equal = (a, b) => JSON.stringify(a) === JSON.stringify(b), limit = 40, onChange }) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('History limit must be a positive integer');
  let current = capture();
  /** @type {T[]} */
  const past = [];
  /** @type {T[]} */
  const future = [];
  let restoring = false;
  const notify = () => onChange?.(history);
  const changed = () => !equal(current, capture());
  const commit = (_label = '') => {
    if (restoring) return false;
    const next = capture();
    if (equal(current, next)) return false;
    past.push(current);
    if (past.length > limit) past.shift();
    current = next;
    future.length = 0;
    notify();
    return true;
  };
  const move = (/** @type {T[]} */ from, /** @type {T[]} */ to) => {
    if (restoring) return false;
    commit(); // Include a field edit that has not blurred yet.
    if (!from.length) return false;
    const next = from[from.length - 1];
    restoring = true;
    try {
      restore(next); // A failed restore must not advance the history cursor.
      to.push(current);
      current = next;
      from.pop();
    } finally {
      restoring = false;
      notify();
    }
    return true;
  };
  const history = {
    commit,
    record: commit,
    replace() { if (!restoring) { current = capture(); notify(); } },
    reset() { if (!restoring) { current = capture(); past.length = future.length = 0; notify(); } },
    refresh: notify,
    undo: () => move(past, future),
    redo: () => move(future, past),
    get canUndo() { return past.length > 0 || (!restoring && changed()); },
    get canRedo() { return future.length > 0 && (restoring || !changed()); },
    get restoring() { return restoring; },
  };
  return history;
}

/** @param {EventTarget|null} target */
export function isTextEditor(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return true;
  return target instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(target.type);
}

/**
 * @param {{undo:()=>boolean,redo:()=>boolean}} history
 * @param {{root?:Document|HTMLElement,filter?:(event:KeyboardEvent)=>boolean}} [options]
 */
export function bindHistoryShortcuts(history, { root = document, filter = () => true } = {}) {
  const listener = (/** @type {Event} */ rawEvent) => {
    const event = /** @type {KeyboardEvent} */ (rawEvent);
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)
      || event.key.toLowerCase() !== 'z' || isTextEditor(event.target)
      || (event.target instanceof Element && event.target.closest('dialog,[role="dialog"]')) || !filter(event)) return;
    if (event.shiftKey ? history.redo() : history.undo()) event.preventDefault();
  };
  root.addEventListener('keydown', listener);
  return () => root.removeEventListener('keydown', listener);
}

/**
 * Checkpoint a whole field gesture, after the application's own event handlers.
 * Async uploads and controls outside the document state should be excluded.
 * @param {{commit:()=>unknown,refresh?:()=>void,restoring?:boolean}} history
 * @param {{root?:Document|HTMLElement,filter?:(element:Element,event:Event)=>boolean}} [options]
 */
export function bindFormHistory(history, { root = document, filter = () => true } = {}) {
  const accepts = (/** @type {Event} */ event) => event.target instanceof Element
    && event.target.matches('input:not([type="file"]),select,textarea,[contenteditable="true"]') && filter(event.target, event);
  const checkpoint = (/** @type {Event} */ event) => {
    if (!history.restoring && accepts(event)) queueMicrotask(() => history.commit());
  };
  const refresh = (/** @type {Event} */ event) => {
    if (!history.restoring && accepts(event)) queueMicrotask(() => history.refresh?.());
  };
  root.addEventListener('change', checkpoint);
  root.addEventListener('focusout', checkpoint);
  root.addEventListener('input', refresh);
  return () => {
    root.removeEventListener('change', checkpoint);
    root.removeEventListener('focusout', checkpoint);
    root.removeEventListener('input', refresh);
  };
}

/** @typedef {{id:string,name:string,index:number,type:string,value:string,checked:boolean}} FieldSnapshot */
/** @param {ParentNode} root */
const formFields = (root) => /** @type {(HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)[]} */ ([...root.querySelectorAll('input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]),select,textarea')]);

/** @param {ParentNode} root @param {{filter?:(element:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)=>boolean}} [options] @returns {FieldSnapshot[]} */
export function captureForm(root, { filter = () => true } = {}) {
  return formFields(root).flatMap((el, index) => filter(el) ? [{ id: el.id, name: el.name, index, type: el.type, value: el.value, checked: el instanceof HTMLInputElement && el.checked }] : []);
}

/** Restore raw values, including invalid/blank numbers. The adapter redraws once.
 * @param {ParentNode} root @param {FieldSnapshot[]} snapshot */
export function restoreForm(root, snapshot) {
  const fields = formFields(root);
  for (const saved of snapshot) {
    const el = saved.id ? fields.find((field) => field.id === saved.id) : fields[saved.index];
    if (!el || el.type !== saved.type || el.name !== saved.name) continue;
    el.value = saved.value;
    if (el instanceof HTMLInputElement) el.checked = saved.checked;
  }
}
