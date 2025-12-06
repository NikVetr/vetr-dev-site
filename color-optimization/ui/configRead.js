export function parsePalette(raw) {
  const cleaned = raw.replace(/['"]/g, " ");
  const parts = cleaned
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = [];
  parts.forEach((p) => {
    let hex = p.startsWith("#") ? p : `#${p}`;
    if (/^#?[0-9a-fA-F]{6}$/.test(p) || /^#[0-9a-fA-F]{6}$/.test(hex)) {
      hex = hex.toUpperCase();
      if (!hex.startsWith("#")) hex = `#${hex}`;
      valid.push(hex);
    }
  });
  return valid;
}

export function getWidths(ui) {
  const h = parseFloat(ui.wH.value);
  const sc = parseFloat(ui.wSC.value);
  const l = parseFloat(ui.wL.value);
  return [h, sc, l].map((v) => (isFinite(v) ? v : 0));
}

export function readConfig(ui, state) {
  const colorblindWeights = {
    none: parseFloat(ui.wNone.value) || 0,
    deutan: parseFloat(ui.wDeutan.value) || 0,
    protan: parseFloat(ui.wProtan.value) || 0,
    tritan: parseFloat(ui.wTritan.value) || 0,
  };
  state.lastRuns = Math.max(1, parseInt(ui.optimRuns.value, 10) || 20);
  const widths = getWidths(ui);
  return {
    colorSpace: ui.colorSpace.value,
    colorwheelSpace: ui.colorwheelSpace.value,
    nColsToAdd: Math.max(1, parseInt(ui.colorsToAdd.value, 10) || 1),
    nOptimRuns: state.lastRuns,
    nmIterations: Math.max(10, parseInt(ui.nmIters.value, 10) || 260),
    constrain: true,
    widths,
    colorblindSafe: true,
    colorblindWeights,
  };
}
