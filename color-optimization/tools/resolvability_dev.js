import { createResolvabilityPanel } from "../ui/resolvability.js";
import { metricJnd } from "../core/resolvability.js";

const palette = [
  "#FF0000",
  "#FF0200",
  "#00FF00",
  "#00FE00",
  "#0000FF",
  "#0000FE",
  "#FDD835",
  "#00BCD4",
];

const host = document.getElementById("resolvability-host");
const readout = document.getElementById("resolvability-readout");
const metricSelect = document.getElementById("metric-select");

let mode = "heatmap";
let metric = metricSelect?.value || "de2000";
let threshold = metricJnd(metric) * 2;

const panel = createResolvabilityPanel("none", {
  onModeChange: (nextMode) => {
    mode = nextMode;
    refresh();
  },
  onSyncChange: () => {},
  onThresholdChange: (val) => {
    threshold = val;
    refresh();
  },
});

host.appendChild(panel.root);

const updateReadout = (text) => {
  if (!readout) return;
  readout.textContent = text;
};

const onHighlightPair = (i, j) => {
  if (!Number.isFinite(i) || !Number.isFinite(j)) {
    updateReadout("Hover a cell or node to inspect a pair or color.");
    return;
  }
  updateReadout(`pair: ${i} -> ${j}`);
};

const onHighlightColor = (i) => {
  if (!Number.isFinite(i)) {
    updateReadout("Hover a cell or node to inspect a pair or color.");
    return;
  }
  updateReadout(`color: ${i}`);
};

const refresh = () => {
  panel.update({
    colors: palette,
    metric,
    threshold,
    mode,
    sync: true,
    cvdModel: "machado2009",
    background: "#ffffff",
    onHighlightPair,
    onHighlightColor,
  });
};

if (metricSelect) {
  metricSelect.addEventListener("change", () => {
    metric = metricSelect.value || "de2000";
    threshold = metricJnd(metric) * 2;
    refresh();
  });
}

refresh();
