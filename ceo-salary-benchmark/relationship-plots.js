/* Shared weighted statistics and SVG explorers for records and aligned model draws. */
((root) => {
  "use strict";
  function pearson(values) {
    const total = values.reduce((sum, p) => sum + p.weight, 0);
    if (values.length < 2 || !(total > 0)) return NaN;
    const mx = values.reduce((sum, p) => sum + p.weight * p.x, 0) / total;
    const my = values.reduce((sum, p) => sum + p.weight * p.y, 0) / total;
    const xx = values.reduce((sum, p) => sum + p.weight * (p.x - mx) ** 2, 0);
    const yy = values.reduce((sum, p) => sum + p.weight * (p.y - my) ** 2, 0);
    const xy = values.reduce((sum, p) => sum + p.weight * (p.x - mx) * (p.y - my), 0);
    return xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : NaN;
  }
  function ranks(values, key) {
    const ordered = values.map((p, i) => ({ ...p, index: i })).sort((a, b) => a[key] - b[key]);
    const result = []; let cumulative = 0;
    for (let start = 0; start < ordered.length;) {
      let end = start + 1;
      while (end < ordered.length && ordered[end][key] === ordered[start][key]) end++;
      const group = ordered.slice(start, end);
      const weight = group.reduce((sum, p) => sum + p.weight, 0);
      group.forEach((p) => { result[p.index] = cumulative + weight / 2; });
      cumulative += weight; start = end;
    }
    return result;
  }
  function correlations(points) {
    const values = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.weight) && p.weight > 0);
    const rx = ranks(values, "x"), ry = ranks(values, "y");
    const total = values.reduce((sum, p) => sum + p.weight, 0);
    return { pearson: pearson(values), spearman: pearson(values.map((p, i) => ({ ...p, x: rx[i], y: ry[i] }))),
      n: values.length, effectiveN: total ? total ** 2 / values.reduce((sum, p) => sum + p.weight ** 2, 0) : 0 };
  }
  function subsample(points, maximum = 250) {
    if (points.length <= maximum) return points;
    return Array.from({ length: maximum }, (_, i) => points[Math.floor((i + .5) * points.length / maximum)]);
  }
  const node = (tag, attrs = {}, text = "") => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text) el.textContent = text;
    return el;
  };
  const html = (tag, className = "", text = "") => {
    const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
  };
  function color(r) {
    if (!Number.isFinite(r)) return "#eef1f2";
    const target = r < 0 ? [192, 91, 38] : [0, 114, 178];
    return `rgb(${target.map((v) => Math.round(250 + (v - 250) * Math.abs(r))).join(",")})`;
  }
  function drawMatrix({ columns, getPair, mode, correlation, onCell, maximumPoints = 250, detailedPair = null, onPoint }) {
    const size = detailedPair ? 540 : 150, inset = detailedPair ? 45 : 15;
    const count = detailedPair ? 1 : columns.length;
    const pointLimit = Number.isFinite(maximumPoints) ? Math.min(maximumPoints, Math.max(20, Math.floor(30000 / count ** 2))) : maximumPoints;
    const svg = node("svg", { viewBox: `0 0 ${size * count} ${size * count}`, width: size * count, height: size * count,
      class: "relationship-matrix", role: "img", "aria-label": detailedPair ? "Selected relationship" : "Pairs and correlation matrix" });
    const cache = new Map();
    const pair = (x, y) => {
      const key = `${x.key}|${y.key}`;
      if (cache.has(key)) return cache.get(key);
      const values = getPair(x, y).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (x.key === y.key) cache.set(key, values);
      return values;
    };
    const domains = new Map(columns.map((col) => {
      const values = pair(col, col).map((p) => p.x);
      const lo = values.length ? Math.min(...values) : 0, hi = values.length ? Math.max(...values) : 1;
      const padding = (hi - lo || Math.max(Math.abs(lo), 1)) * .06;
      return [col.key, [lo - padding, hi + padding]];
    }));
    const grid = detailedPair ? [[detailedPair[0], detailedPair[1], 0, 0]]
      : columns.flatMap((y, row) => columns.map((x, col) => [x, y, row, col]));
    grid.forEach(([x, y, row, col]) => {
      const diagonal = !detailedPair && row === col;
      const points = pair(x, y), stats = correlations(points), r = stats[correlation];
      const heat = !detailedPair && !diagonal && (mode === "heatmap" || mode === "mixed" && row > col || mode === "mixed-reverse" && row < col);
      const group = node("g", { transform: `translate(${col * size},${row * size})`, class: "relationship-cell",
        "data-x": x.key, "data-y": y.key, "data-n": stats.n, "data-correlation": Number.isFinite(r) ? r : "",
        ...(diagonal || detailedPair ? {} : { role: "button", tabindex: 0, "aria-label": `Open ${y.label} against ${x.label}` }) });
      group.append(node("rect", { width: size - 2, height: size - 2, rx: 3, fill: heat ? color(r) : "#fff", stroke: "#dbe5e8" }));
      group.append(node("title", {}, `${y.label} against ${x.label}; ${correlation} ${Number.isFinite(r) ? r.toFixed(3) : "undefined"}; n = ${stats.n}; effective n = ${stats.effectiveN.toFixed(1)}`));
      const activate = () => onCell?.(x, y);
      if (!diagonal && !detailedPair) {
        group.addEventListener("click", activate);
        group.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); activate(); } });
      }
      const xd = domains.get(x.key), yd = domains.get(y.key);
      const sx = (v) => inset + (v - xd[0]) / (xd[1] - xd[0]) * (size - 2 * inset);
      const sy = (v) => size - inset - (v - yd[0]) / (yd[1] - yd[0]) * (size - 2 * inset);
      if (diagonal) {
        const bins = Array(14).fill(0);
        points.forEach((p) => { if (p.weight > 0) bins[Math.min(13, Math.max(0, Math.floor((p.x - xd[0]) / (xd[1] - xd[0]) * 14)))] += p.weight; });
        const maximum = Math.max(...bins, 1);
        bins.forEach((weight, i) => group.append(node("rect", { x: inset + i * (size - 2 * inset) / 14, y: size - 26 - 36 * weight / maximum,
          width: (size - 2 * inset) / 14 - 1, height: 36 * weight / maximum, fill: "#85bdcc" })));
        const words = x.label.split(" "), lines = [""];
        words.forEach((word) => { if ((lines.at(-1) + word).length > 19) lines.push(""); lines[lines.length - 1] += `${word} `; });
        lines.slice(0, 4).forEach((line, i) => group.append(node("text", { x: size / 2, y: 20 + i * 13, "text-anchor": "middle", "font-size": 11, "font-weight": 650 }, line.trim() + (i === 3 && lines.length > 4 ? "…" : ""))));
        group.append(node("text", { x: size / 2, y: size - 8, "text-anchor": "middle", "font-size": 10 }, `n = ${stats.n}`));
      } else if (heat) {
        const ink = Math.abs(r) > .65 ? "#fff" : "#253b42";
        group.append(node("text", { x: size / 2, y: size / 2, "text-anchor": "middle", "font-size": 25, fill: ink }, Number.isFinite(r) ? r.toFixed(2) : "—"));
        group.append(node("text", { x: size / 2, y: size / 2 + 20, "text-anchor": "middle", "font-size": 11, fill: ink }, `n = ${stats.n}`));
      } else {
        if (xd[0] <= 0 && xd[1] >= 0) group.append(node("line", { x1: sx(0), x2: sx(0), y1: inset, y2: size - inset, stroke: "#dbe5e8" }));
        if (yd[0] <= 0 && yd[1] >= 0) group.append(node("line", { x1: inset, x2: size - inset, y1: sy(0), y2: sy(0), stroke: "#dbe5e8" }));
        subsample(points, detailedPair ? 1000 : pointLimit).forEach((p) => {
          const dot = node("circle", { cx: sx(p.x), cy: sy(p.y), r: p.reference ? 4 : (detailedPair ? 3 : 1.8) * Math.sqrt(Math.max(.3, Math.min(4, p.weight))),
            fill: p.color || "#0072b2", opacity: p.reference ? 1 : .45, class: "relationship-point",
            ...(p.reference ? { stroke: "#182e37", "stroke-width": 1.4 } : {}) });
          dot.append(node("title", {}, `${p.label || "Draw"}: ${x.label} ${x.format(p.x)}, ${y.label} ${y.format(p.y)}`));
          if (onPoint && p.item) dot.addEventListener("click", (event) => { event.stopPropagation(); onPoint(p); });
          group.append(dot);
        });
        if (!stats.n) group.append(node("text", { x: size / 2, y: size / 2, "text-anchor": "middle", "font-size": 11 }, "No paired values"));
        group.append(node("text", { x: size / 2, y: 12, "text-anchor": "middle", "font-size": 10 }, `${correlation === "pearson" ? "r" : "ρ"} = ${Number.isFinite(r) ? r.toFixed(2) : "—"}`));
        [[xd[0], inset, "start"], [xd[1], size - inset, "end"]].forEach(([v, at, anchor]) => group.append(node("text", { x: at, y: size - 3, "text-anchor": anchor, "font-size": 9 }, x.format(v))));
        if (detailedPair) {
          group.append(node("text", { x: size / 2, y: size - 18, "text-anchor": "middle", "font-size": 13 }, x.label));
          group.append(node("text", { transform: `translate(13,${size / 2}) rotate(-90)`, "text-anchor": "middle", "font-size": 13 }, y.label));
          [yd[0], yd[1]].forEach((v) => group.append(node("text", { x: inset - 5, y: sy(v), "text-anchor": "end", "font-size": 9 }, y.format(v))));
        }
      }
      svg.append(group);
    });
    return svg;
  }
  function explorer(container, { columns, getPair, settings, onChange = () => {}, onCell, onPoint, note = "", scales = null, maximumPoints = 250 }) {
    let selectedPair = null;
    container.replaceChildren();
    const root = html("div", "relationship-explorer"); container.append(root);
    const controls = html("div", "relationship-controls");
    const body = html("div", "relationship-scroll"), caption = html("p", "relationship-note");
    function select(label, key, options) {
      const field = html("label", "", label), input = html("select"); input.setAttribute("aria-label", label);
      options.forEach(([value, text]) => { const option = html("option", "", text); option.value = value; input.append(option); });
      input.value = settings[key];
      input.addEventListener("change", () => { settings[key] = input.value; selectedPair = null; onChange(); render(); });
      field.append(input); controls.append(field);
    }
    select("Layout", "mode", [["mixed", "Pairs above · heatmap below"], ["mixed-reverse", "Heatmap above · pairs below"], ["pairs", "Pairs"], ["heatmap", "Heatmap"]]);
    select("Correlation", "correlation", [["spearman", "Spearman"], ["pearson", "Pearson"]]);
    if (scales) select("Values", "scale", scales);
    const details = html("fieldset", "relationship-features"), summary = html("legend", "", "Features");
    details.append(summary);
    const choices = html("div", "relationship-feature-list");
    columns.forEach((column) => {
      const label = html("label"), input = html("input"); input.type = "checkbox"; input.value = column.key;
      input.checked = settings.features.includes(column.key);
      input.addEventListener("change", () => {
        settings.features = [...choices.querySelectorAll("input:checked")].map((input) => input.value);
        selectedPair = null; onChange(); render();
      });
      label.append(input, column.label); choices.append(label);
    });
    details.append(choices);
    const back = html("button", "text-button", "Back to matrix"); back.type = "button"; back.hidden = true;
    back.addEventListener("click", () => { selectedPair = null; render(); });
    controls.append(back);
    const workspace = html("div", "relationship-workspace"); workspace.append(body, details);
    root.append(controls, caption, workspace);
    function render() {
      const selected = columns.filter((col) => settings.features.includes(col.key));
      summary.textContent = `Features (${selected.length})`;
      caption.textContent = note + (selectedPair ? ` ${selectedPair[1].label} against ${selectedPair[0].label}.` : " Select a cell to open its pair. Blue: positive; orange: negative; —: undefined correlation.");
      back.hidden = !selectedPair;
      body.replaceChildren();
      if (selected.length < 2) { body.append(html("p", "relationship-note", "Select at least two features.")); return; }
      body.append(drawMatrix({ columns: selected, getPair, mode: settings.mode, correlation: settings.correlation, detailedPair: selectedPair,
        maximumPoints, onPoint, onCell: (x, y) => { if (onCell) onCell(x, y); else { selectedPair = [x, y]; render(); } } }));
    }
    render();
    return { render };
  }
  const api = { correlations, subsample, drawMatrix, explorer };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RelationshipPlots = Object.freeze(api);
})(globalThis);
