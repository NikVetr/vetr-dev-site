export function setResults(colors, ui) {
  const list = colors || [];
  const withQuotes = ui.formatQuotes?.checked;
  const wrapR = ui.formatRC?.checked;
  const wrapPy = ui.formatPyList?.checked;
  const useCommas = ui.formatCommas?.checked || wrapR || wrapPy;
  const useLines = ui.formatLines?.checked && !wrapR && !wrapPy;
  const mapped = list.map((c) => (withQuotes ? `"${c}"` : c));
  let txt;
  const body = useLines ? mapped.join("\n") : useCommas ? mapped.join(", ") : mapped.join(" ");
  if (wrapR) txt = `c(${mapped.join(", ")})`;
  else if (wrapPy) txt = `[${mapped.join(", ")}]`;
  else txt = body;
  ui.resultsBox.value = txt;
}

export function copyResults(ui, state) {
  if (!ui.resultsBox.value.trim()) return;
  navigator.clipboard.writeText(ui.resultsBox.value).catch(() => {});
  ui.copyBtn.textContent = "Copied!";
  clearTimeout(state.copyTimeout);
  state.copyTimeout = setTimeout(() => {
    ui.copyBtn.textContent = "Copy";
  }, 900);
}
