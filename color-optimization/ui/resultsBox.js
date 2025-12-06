export function setResults(colors, ui) {
  const list = colors || [];
  const withQuotes = ui.formatQuotes?.checked;
  const useCommas = ui.formatCommas?.checked;
  const useLines = ui.formatLines?.checked;
  const mapped = list.map((c) => (withQuotes ? `"${c}"` : c));
  let txt;
  if (useLines) {
    txt = mapped.join("\n");
  } else if (useCommas) {
    txt = mapped.join(", ");
  } else {
    txt = mapped.join(" ");
  }
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
