import { drawStatusGraph } from "./statusGraph.js";

export function setStatus(text, pct, ui, state) {
  ui.statusText.textContent = text;
  ui.progressBar.style.width = `${pct}%`;
  drawStatusGraph(state, ui);
}

export function showError(text, ui) {
  ui.errorText.textContent = text || "";
}

export function setStatusState(ui, label, opts = {}) {
  if (!ui?.statusState || !ui?.statusBlock) return;
  if (label) ui.statusState.textContent = label;
  const stale = opts.stale === true;
  ui.statusBlock.classList.toggle("status-stale", stale);
}
