// Keeping the screen on while a sentence is being read.
//
// The board's one hardware concern. Somebody is holding a phone out at arm's length
// and a stranger is reading a sentence off it in a script they may read slowly; the
// display timeout is typically fifteen or thirty seconds, and it going dark mid-
// sentence means taking the phone back, waking it, and starting the exchange again.
// So the lock is held for exactly as long as a message is on screen, and released
// the moment the grid comes back.
//
// **Best-effort, and silent when it fails.** `navigator.wakeLock` needs a secure
// context, a visible page and, on some browsers, a user gesture; Safari only gained
// it in 16.4 and Firefox has it behind a flag on some platforms. None of that is
// worth a message to the reader, because the failure mode is the behaviour they
// already had. The native shell replaces this file with Capacitor's equivalent,
// which is the reason it is its own module rather than six lines inside the board.
//
// The re-acquire on `visibilitychange` is not optional: the platform drops the lock
// whenever the page is hidden and does not give it back, so a reader who takes a
// call and comes back to the same sentence would silently lose the lock.

/** @type {any} */ let held = null;
let wanted = false;

async function take() {
  const api = /** @type {any} */ (navigator).wakeLock;
  if (!wanted || held || !api || globalThis.document?.visibilityState !== 'visible') return;
  try {
    held = await api.request('screen');
    // The platform can release it on its own -- a system dialog, low battery -- and
    // a stale handle would stop us ever asking again.
    held.addEventListener('release', () => { held = null; });
  } catch {
    // No lock, no complaint. The screen dims as it always did.
  }
}

/** Hold the screen awake, or let it sleep again. @param {boolean} on */
export function keepAwake(on) {
  wanted = on;
  if (on) { take(); return; }
  held?.release?.().catch(() => {});
  held = null;
}

// Guarded, like `speech.js`'s own listeners: importing this from a Node test must not
// throw before the test has asserted anything.
globalThis.document?.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') take();
});
