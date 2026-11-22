// A single revision owns the displayed plan. Exports join the same pending work
// as the preview, including any edit made while an earlier revision was running.
/** @param {(current:()=>boolean)=>Promise<void>} render @param {number} delay @param {(e:unknown)=>void} failed */
export function sheetRefresh(render, delay, failed) {
  let revision = 0;
  let displayed = -1;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  /** @type {Promise<void>|null} */ let working = null;
  async function flush() {
    clearTimeout(timer);
    while (displayed !== revision) {
      if (!working) {
        const wanted = revision;
        working = render(() => revision === wanted).then(() => { displayed = wanted; })
          .catch(error => { if (wanted === revision) throw error; })
          .finally(() => { working = null; });
      }
      await working;
    }
  }
  return {
    flush,
    schedule() {
      revision++;
      clearTimeout(timer);
      timer = setTimeout(() => { flush().catch(failed); }, delay);
    },
  };
}
