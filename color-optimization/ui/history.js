export function createHistoryManager({ capture, apply, onUpdate, limit = 60 } = {}) {
  let past = [];
  let future = [];
  let isApplying = false;
  let debounceTimer = null;

  const snapshotKey = (snapshot) => JSON.stringify(snapshot);

  const pushSnapshot = (snapshot, { force = false } = {}) => {
    if (!snapshot) return;
    const key = snapshotKey(snapshot);
    const last = past[past.length - 1];
    if (!force && last && last._key === key) return;
    snapshot._key = key;
    past.push(snapshot);
    if (past.length > limit) past.shift();
    future = [];
    onUpdate?.();
  };

  const record = (options = {}) => {
    if (isApplying) return;
    if (options.debounce) {
      schedule(options.debounceDelay);
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pushSnapshot(capture());
  };

  const schedule = (delay = 350) => {
    if (isApplying) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      pushSnapshot(capture());
    }, delay);
  };

  const undo = () => {
    if (isApplying || past.length <= 1) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const current = past.pop();
    future.push(current);
    const prev = past[past.length - 1];
    isApplying = true;
    apply(prev);
    isApplying = false;
    onUpdate?.();
  };

  const redo = () => {
    if (isApplying || !future.length) return;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const next = future.pop();
    past.push(next);
    isApplying = true;
    apply(next);
    isApplying = false;
    onUpdate?.();
  };

  const reset = () => {
    past = [];
    future = [];
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    onUpdate?.();
  };

  return {
    record,
    schedule,
    undo,
    redo,
    reset,
    canUndo: () => past.length > 1,
    canRedo: () => future.length > 0,
    isApplying: () => isApplying,
    push: (snapshot) => pushSnapshot(snapshot, { force: true }),
  };
}
