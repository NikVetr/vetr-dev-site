(() => {
  "use strict";

  const DATA = window.CEO_BENCHMARK_DATA;
  if (!DATA) throw new Error("Benchmark data did not load.");

  const $ = (selector) => document.querySelector(selector);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const money = (value) => value == null || !Number.isFinite(value)
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const compactMoney = (value) => value == null || !Number.isFinite(value)
    ? "—"
    : value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
      : `$${Math.round(value / 1_000)}K`;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  const state = {
    stream: "incumbents",
    measure: "base",
    sample: "primary",
    fit: "empirical",
    weighting: "equal",
    targetExpense: 7_500_000,
    bandwidth: 0.7,
    bins: 12,
    showDensity: true,
    showRug: true,
    showReference: true,
    quantileGranularity: "quintiles",
    sortKey: "organization",
    sortDirection: "asc",
    search: "",
    filters: { organization: "", tier: "", topic: "" },
    focusedId: "",
    hoverQuantile: null,
  };

  const inclusion = {
    incumbents: new Map(DATA.incumbents.map((row) => [row.id, Boolean(row.defaultIncluded)])),
    jobAds: new Map(DATA.jobAds.map((row) => [row.id, Boolean(row.defaultIncluded)])),
  };
  const customWeights = {
    incumbents: new Map(DATA.incumbents.map((row) => [row.id, 1])),
    jobAds: new Map(DATA.jobAds.map((row) => [row.id, 1])),
  };

  const refs = {
    stream: $("#stream-select"), measure: $("#measure-select"), measureField: $("#measure-field"),
    sample: $("#sample-select"), fit: $("#fit-select"), weighting: $("#weighting-select"),
    sizeControls: $("#size-controls"), targetExpense: $("#target-expense"), bandwidth: $("#size-bandwidth"),
    bandwidthValue: $("#bandwidth-value"), bins: $("#bin-count"), binValue: $("#bin-value"),
    showDensity: $("#show-density"), showRug: $("#show-rug"), showReference: $("#show-reference"),
    reset: $("#reset-settings"), chart: $("#salary-chart"), chartWrap: $("#chart-wrap"),
    tooltip: $("#chart-tooltip"), chartKicker: $("#chart-kicker"), chartTitle: $("#chart-title"),
    statN: $("#stat-n"), statNeff: $("#stat-neff"), statCenter: $("#stat-center"),
    quantileGranularity: $("#quantile-granularity"), quantileGrid: $("#quantile-grid"),
    tableBody: $("#organization-table tbody"), tableSearch: $("#table-search"),
    includedCount: $("#included-count"), dialog: $("#source-dialog"),
  };

  function rows() {
    return state.stream === "incumbents" ? DATA.incumbents : DATA.jobAds;
  }

  function salary(row) {
    return row.salary?.[state.stream === "jobAds" ? "base" : state.measure] ?? null;
  }

  function baseWeight(row) {
    const scoreWeight = clamp((row.comparabilityScore || 50) / 75, 0.25, 1.75);
    const expense = row.expenses;
    const sizeWeight = expense && expense > 0
      ? Math.exp(-0.5 * (Math.log(expense / state.targetExpense) / state.bandwidth) ** 2)
      : 0.45;
    if (state.weighting === "comparability") return scoreWeight;
    if (state.weighting === "size") return sizeWeight;
    if (state.weighting === "blended") return scoreWeight * sizeWeight;
    return 1;
  }

  function effectiveWeight(row) {
    if (!inclusion[state.stream].get(row.id)) return 0;
    return baseWeight(row) * (customWeights[state.stream].get(row.id) ?? 1);
  }

  function selectedRows() {
    return rows()
      .map((row) => ({ row, value: salary(row), weight: effectiveWeight(row) }))
      .filter((item) => item.value != null && item.weight > 0);
  }

  function applyPreset() {
    for (const row of rows()) {
      let selected = row.defaultIncluded;
      if (state.sample === "clean") selected = row.defaultIncluded && row.structurallyClean;
      if (state.sample === "tierA") {
        selected = row.defaultIncluded && (row.tier === "A" || row.tier === "strict_primary");
      }
      if (state.sample === "observed") selected = salary(row) != null;
      inclusion[state.stream].set(row.id, selected);
    }
  }

  function weightedMean(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    return total ? items.reduce((sum, item) => sum + item.value * item.weight, 0) / total : NaN;
  }

  function weightedQuantile(items, probability) {
    if (!items.length) return NaN;
    const sorted = [...items].sort((a, b) => a.value - b.value);
    const total = sorted.reduce((sum, item) => sum + item.weight, 0);
    const target = probability * total;
    let cumulative = 0;
    for (const item of sorted) {
      cumulative += item.weight;
      if (cumulative >= target) return item.value;
    }
    return sorted.at(-1).value;
  }

  function normalQuantile(p) {
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const plow = 0.02425;
    if (p < plow) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - plow) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  function logGamma(z) {
    const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.5073432786869, -0.13857109526572, 9.98436957801957e-6, 1.50563273514931e-7];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    let x = 0.9999999999998099;
    z -= 1;
    coefficients.forEach((coefficient, index) => { x += coefficient / (z + index + 1); });
    const t = z + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function gammaP(shape, x) {
    if (x <= 0) return 0;
    const epsilon = 1e-10;
    if (x < shape + 1) {
      let sum = 1 / shape;
      let term = sum;
      let ap = shape;
      for (let n = 1; n < 200; n += 1) {
        ap += 1;
        term *= x / ap;
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * epsilon) break;
      }
      return sum * Math.exp(-x + shape * Math.log(x) - logGamma(shape));
    }
    let b = x + 1 - shape;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 200; i += 1) {
      const an = -i * (i - shape);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < epsilon) break;
    }
    return 1 - Math.exp(-x + shape * Math.log(x) - logGamma(shape)) * h;
  }

  function fitModel(items) {
    if (items.length < 2) return null;
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    if (state.fit === "lognormal") {
      const mu = items.reduce((sum, item) => sum + Math.log(item.value) * item.weight, 0) / totalWeight;
      const variance = items.reduce((sum, item) => sum + (Math.log(item.value) - mu) ** 2 * item.weight, 0) / totalWeight;
      const sigma = Math.sqrt(Math.max(variance, 1e-9));
      return {
        quantile: (p) => Math.exp(mu + sigma * normalQuantile(p)),
        density: (x) => x <= 0 ? 0 : Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma ** 2)) / (x * sigma * Math.sqrt(2 * Math.PI)),
      };
    }
    if (state.fit === "gamma") {
      const mean = weightedMean(items);
      const variance = items.reduce((sum, item) => sum + (item.value - mean) ** 2 * item.weight, 0) / totalWeight;
      const shape = Math.max(mean ** 2 / Math.max(variance, 1), 0.01);
      const scale = Math.max(variance / mean, 1);
      return {
        quantile: (p) => {
          let low = 0;
          let high = Math.max(mean * 4, 1);
          while (gammaP(shape, high / scale) < p) high *= 2;
          for (let i = 0; i < 80; i += 1) {
            const mid = (low + high) / 2;
            if (gammaP(shape, mid / scale) < p) low = mid; else high = mid;
          }
          return (low + high) / 2;
        },
        density: (x) => x <= 0 ? 0 : Math.exp((shape - 1) * Math.log(x) - x / scale - logGamma(shape) - shape * Math.log(scale)),
      };
    }
    return null;
  }

  function distributionQuantile(items, p) {
    const model = fitModel(items);
    return model ? model.quantile(p) : weightedQuantile(items, p);
  }

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function tierColor(row) {
    if (row.tier === "A" || row.tier === "strict_primary") return "#174f43";
    if (row.tier === "B" || row.tier.includes?.("secondary")) return "#2f7d71";
    return "#4f708d";
  }

  function referenceRange() {
    if (state.stream === "jobAds") return [250_000, 340_000];
    if (state.measure === "total") return [340_000, 435_000];
    return [290_000, 350_000];
  }

  function renderChart() {
    const items = selectedRows();
    const svg = refs.chart;
    svg.replaceChildren();
    const width = Math.max(520, refs.chartWrap.clientWidth || 720);
    const height = Math.max(330, refs.chartWrap.clientHeight || 360);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 14, right: 18, bottom: 46, left: 54 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (!items.length) {
      const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#66716b", "font-size": 13 });
      empty.textContent = "No organizations have a value for the current selection.";
      svg.append(empty);
      refs.statN.textContent = "0"; refs.statNeff.textContent = "0"; refs.statCenter.textContent = "—";
      return;
    }

    const values = items.map((item) => item.value);
    const reference = referenceRange();
    const rawMin = Math.min(...values, ...(state.showReference ? reference : []));
    const rawMax = Math.max(...values, ...(state.showReference ? reference : []));
    const pad = Math.max((rawMax - rawMin) * 0.08, 25_000);
    const domainMin = Math.max(0, Math.floor((rawMin - pad) / 50_000) * 50_000);
    const domainMax = Math.ceil((rawMax + pad) / 50_000) * 50_000;
    const xScale = (value) => margin.left + ((value - domainMin) / (domainMax - domainMin)) * innerWidth;
    const binWidthValue = (domainMax - domainMin) / state.bins;
    const bins = Array.from({ length: state.bins }, (_, index) => ({ index, total: 0, items: [] }));
    items.forEach((item) => {
      const index = clamp(Math.floor((item.value - domainMin) / binWidthValue), 0, state.bins - 1);
      bins[index].items.push(item);
      bins[index].total += item.weight;
    });
    const maxWeight = Math.max(...bins.map((bin) => bin.total), 1);
    const yScale = (weight) => innerHeight - (weight / maxWeight) * innerHeight;

    const gridTicks = 4;
    for (let i = 0; i <= gridTicks; i += 1) {
      const value = (maxWeight * i) / gridTicks;
      const y = margin.top + yScale(value);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgElement("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", fill: "#66716b", "font-size": 9 });
      label.textContent = value.toFixed(value < 10 ? 1 : 0);
      svg.append(label);
    }

    if (state.showReference) {
      const x1 = xScale(reference[0]);
      const x2 = xScale(reference[1]);
      svg.append(svgElement("rect", { x: x1, y: margin.top, width: Math.max(0, x2 - x1), height: innerHeight, class: "reference-band" }));
      const label = svgElement("text", { x: (x1 + x2) / 2, y: margin.top + 11, "text-anchor": "middle", class: "chart-annotation" });
      label.textContent = "RP judgment band";
      svg.append(label);
    }

    const plotBottom = margin.top + innerHeight;
    bins.forEach((bin) => {
      const x0 = xScale(domainMin + bin.index * binWidthValue) + 1;
      const x1 = xScale(domainMin + (bin.index + 1) * binWidthValue) - 1;
      let cumulative = 0;
      [...bin.items].sort((a, b) => b.weight - a.weight).forEach((item) => {
        const y0 = margin.top + yScale(cumulative + item.weight);
        const y1 = margin.top + yScale(cumulative);
        const rect = svgElement("rect", {
          x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(2, y1 - y0),
          fill: tierColor(item.row), class: `bar-block${state.focusedId === item.row.id ? " is-focused" : ""}`,
          tabindex: "0", role: "button", "aria-label": `${item.row.organization}, ${money(item.value)}`,
        });
        rect.addEventListener("pointerenter", (event) => showTooltip(event, item));
        rect.addEventListener("pointermove", (event) => positionTooltip(event));
        rect.addEventListener("pointerleave", hideTooltip);
        rect.addEventListener("click", () => focusRow(item.row.id));
        rect.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") focusRow(item.row.id); });
        svg.append(rect);
        cumulative += item.weight;
      });
    });

    const model = fitModel(items);
    if (model && state.showDensity) {
      const sumWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let path = "";
      for (let i = 0; i <= 180; i += 1) {
        const value = domainMin + (i / 180) * (domainMax - domainMin);
        const expectedBinWeight = model.density(value) * sumWeight * binWidthValue;
        const x = xScale(value);
        const y = margin.top + yScale(expectedBinWeight);
        path += `${i ? "L" : "M"}${x.toFixed(2)},${clamp(y, margin.top, plotBottom).toFixed(2)}`;
      }
      svg.append(svgElement("path", { d: path, class: "density-line" }));
    }

    if (state.showRug) {
      items.forEach((item) => {
        const x = xScale(item.value);
        svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom + 2, y2: plotBottom + 8, class: "rug-line" }));
      });
    }

    if (state.hoverQuantile != null) {
      const x = xScale(state.hoverQuantile);
      svg.append(svgElement("line", { x1: x, x2: x, y1: margin.top, y2: plotBottom, class: "quantile-guide" }));
    }

    const tickCount = width < 650 ? 5 : 8;
    for (let i = 0; i <= tickCount; i += 1) {
      const value = domainMin + (i / tickCount) * (domainMax - domainMin);
      const x = xScale(value);
      svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4, stroke: "#929991" }));
      const label = svgElement("text", { x, y: plotBottom + 20, "text-anchor": "middle", fill: "#66716b", "font-size": 10 });
      label.textContent = compactMoney(value);
      svg.append(label);
    }
    const axisTitle = svgElement("text", { x: margin.left + innerWidth / 2, y: height - 6, "text-anchor": "middle", fill: "#4e5853", "font-size": 10, "font-weight": 700 });
    axisTitle.textContent = `Annual compensation (${DATA.priceBasis})`;
    svg.append(axisTitle);

    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = compactMoney(distributionQuantile(items, 0.5));
  }

  function showTooltip(event, item) {
    refs.tooltip.innerHTML = `<b>${escapeHtml(item.row.organization)}</b>${money(item.value)} · weight ${item.weight.toFixed(2)}<br>${escapeHtml(item.row.title || item.row.topic || "")}`;
    refs.tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const bounds = refs.chartWrap.getBoundingClientRect();
    refs.tooltip.style.left = `${clamp(event.clientX - bounds.left + 12, 5, bounds.width - 270)}px`;
    refs.tooltip.style.top = `${clamp(event.clientY - bounds.top - 56, 5, bounds.height - 75)}px`;
  }

  function hideTooltip() { refs.tooltip.hidden = true; }

  function renderQuantiles() {
    const items = selectedRows();
    const probabilities = state.quantileGranularity === "deciles"
      ? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
      : [0.1, 0.25, 0.5, 0.75, 0.9];
    refs.quantileGrid.replaceChildren();
    probabilities.forEach((probability) => {
      const value = items.length ? distributionQuantile(items, probability) : NaN;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quantile-cell";
      button.innerHTML = `<span>${Math.round(probability * 100)}th percentile</span><strong>${compactMoney(value)}</strong>`;
      button.addEventListener("pointerenter", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("pointerleave", () => { state.hoverQuantile = null; renderChart(); });
      button.addEventListener("focus", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("blur", () => { state.hoverQuantile = null; renderChart(); });
      refs.quantileGrid.append(button);
    });
  }

  function tableRows() {
    const search = state.search.toLowerCase();
    const filtered = rows().filter((row) => {
      const haystack = [row.organization, row.title, row.topic, row.eaAffinity, row.location].join(" ").toLowerCase();
      if (search && !haystack.includes(search)) return false;
      return Object.entries(state.filters).every(([key, value]) => {
        if (!value) return true;
        const field = key === "tier" ? row.tier : row[key];
        return String(field || "").toLowerCase().includes(value.toLowerCase());
      });
    });
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const value = (row) => {
        if (state.sortKey === "salary") return salary(row) ?? -Infinity;
        if (state.sortKey === "weight") return effectiveWeight(row);
        if (state.sortKey === "expenses") return row.expenses ?? -Infinity;
        return String(row[state.sortKey] || "").toLowerCase();
      };
      const av = value(a); const bv = value(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * direction;
    });
  }

  function renderTable() {
    refs.tableBody.replaceChildren();
    tableRows().forEach((row) => {
      const tr = document.createElement("tr");
      if (!inclusion[state.stream].get(row.id)) tr.classList.add("is-excluded");
      if (state.focusedId === row.id) tr.classList.add("is-focused");
      tr.dataset.id = row.id;

      const toggleCell = document.createElement("td");
      toggleCell.className = "check-column";
      const toggle = document.createElement("input");
      toggle.type = "checkbox"; toggle.className = "row-toggle"; toggle.checked = inclusion[state.stream].get(row.id);
      toggle.setAttribute("aria-label", `Include ${row.organization}`);
      toggle.addEventListener("change", () => { inclusion[state.stream].set(row.id, toggle.checked); renderAll(); });
      toggleCell.append(toggle);

      const org = document.createElement("td");
      org.className = "org-cell";
      org.innerHTML = `<strong>${escapeHtml(row.organization)}</strong><span title="${escapeHtml(row.title || "")}">${escapeHtml(row.title || row.analysisStatus || "")}</span>`;

      const salaryCell = document.createElement("td");
      salaryCell.className = "money-cell"; salaryCell.textContent = compactMoney(salary(row));

      const weightCell = document.createElement("td");
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "10"; weightInput.step = "0.1";
      weightInput.value = customWeights[state.stream].get(row.id) ?? 1; weightInput.className = "weight-input";
      weightInput.title = `Effective weight: ${effectiveWeight(row).toFixed(2)}`;
      weightInput.setAttribute("aria-label", `Custom weight for ${row.organization}`);
      weightInput.addEventListener("change", () => {
        const value = clamp(Number(weightInput.value) || 0, 0, 10);
        customWeights[state.stream].set(row.id, value);
        if (value === 0) inclusion[state.stream].set(row.id, false);
        renderAll();
      });
      weightCell.append(weightInput);

      const tier = document.createElement("td"); tier.textContent = row.tier || "—";
      const topic = document.createElement("td"); topic.className = "topic-cell"; topic.title = row.topic || ""; topic.textContent = row.topic || "—";
      const expenses = document.createElement("td"); expenses.className = "money-cell"; expenses.textContent = compactMoney(row.expenses);
      const preview = document.createElement("td");
      const previewButton = document.createElement("button"); previewButton.type = "button"; previewButton.className = "preview-button"; previewButton.textContent = "Preview";
      previewButton.addEventListener("click", () => openSourceDialog(row)); preview.append(previewButton);
      const source = document.createElement("td");
      if (row.sourceUrl) {
        const link = document.createElement("a"); link.className = "source-link"; link.href = row.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open ↗"; source.append(link);
      } else source.textContent = "—";
      tr.append(toggleCell, org, salaryCell, weightCell, preview, source, tier, topic, expenses);
      refs.tableBody.append(tr);
    });
    const count = selectedRows().length;
    refs.includedCount.textContent = `${count} included`;
    document.querySelectorAll("thead button[data-sort]").forEach((button) => {
      const active = button.dataset.sort === state.sortKey;
      button.dataset.active = active;
      button.dataset.direction = active ? state.sortDirection : "";
    });
  }

  function focusRow(id) {
    state.focusedId = id;
    renderChart();
    renderTable();
    requestAnimationFrame(() => {
      refs.tableBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function openSourceDialog(row) {
    $("#dialog-source-type").textContent = `${row.sourceType} · ${row.auditStatus || "source record"}`;
    $("#dialog-title").textContent = row.organization;
    $("#dialog-measure-label").textContent = measureLabel();
    $("#dialog-value").textContent = money(salary(row));
    $("#dialog-evidence").textContent = row.evidenceText;
    const meta = $("#dialog-meta");
    meta.replaceChildren();
    [
      ["Executive / role", [row.executive, row.title].filter(Boolean).join(" · ") || "Not reported"],
      ["Evidence year", row.compensationYear || "Not reported"],
      ["Tier", row.tier || "Not coded"],
      ["Topic / model", row.topic || "Not coded"],
      ["Scale", `${compactMoney(row.expenses)} expenses · ${row.staff ?? "—"} staff`],
      ["Local provenance", row.localPath || "No cached original"],
    ].forEach(([term, description]) => {
      const dt = document.createElement("dt"); dt.textContent = term;
      const dd = document.createElement("dd"); dd.textContent = description;
      meta.append(dt, dd);
    });
    const cached = $("#dialog-cached");
    cached.hidden = !row.cachedSource; cached.href = row.cachedSource || "#";
    const external = $("#dialog-external");
    external.hidden = !row.sourceUrl; external.href = row.sourceUrl || "#";
    refs.dialog.showModal();
  }

  function measureLabel() {
    if (state.stream === "jobAds") return "Posting midpoint, July 2026 USD";
    return { base: "Schedule J base, July 2026 USD", cash: "Part VII cash / W-2 proxy, July 2026 USD", total: "Filing total proxy, July 2026 USD" }[state.measure];
  }

  function updateHeadings() {
    const isJobs = state.stream === "jobAds";
    refs.measureField.hidden = isJobs;
    refs.chartKicker.textContent = isJobs ? "Recruitment evidence" : "Incumbent compensation";
    refs.chartTitle.textContent = isJobs
      ? "Validated CEO / ED posting midpoints"
      : { base: "Validated Schedule J base salaries", cash: "Validated Part VII cash / W-2 proxies", total: "Validated filing total compensation" }[state.measure];
    refs.sizeControls.hidden = !["size", "blended"].includes(state.weighting);
    refs.bandwidthValue.value = `${state.bandwidth.toFixed(2)}×`;
    refs.binValue.value = state.bins;
  }

  function renderAll() {
    updateHeadings();
    renderChart();
    renderQuantiles();
    renderTable();
  }

  function reset() {
    Object.assign(state, {
      stream: "incumbents", measure: "base", sample: "primary", fit: "empirical", weighting: "equal",
      targetExpense: 7_500_000, bandwidth: 0.7, bins: 12, showDensity: true, showRug: true,
      showReference: true, quantileGranularity: "quintiles", sortKey: "organization", sortDirection: "asc",
      search: "", filters: { organization: "", tier: "", topic: "" }, focusedId: "", hoverQuantile: null,
    });
    Object.entries({ incumbents: DATA.incumbents, jobAds: DATA.jobAds }).forEach(([stream, streamRows]) => {
      streamRows.forEach((row) => { inclusion[stream].set(row.id, Boolean(row.defaultIncluded)); customWeights[stream].set(row.id, 1); });
    });
    refs.stream.value = state.stream; refs.measure.value = state.measure; refs.sample.value = state.sample;
    refs.fit.value = state.fit; refs.weighting.value = state.weighting; refs.targetExpense.value = 7.5;
    refs.bandwidth.value = state.bandwidth; refs.bins.value = state.bins; refs.showDensity.checked = true;
    refs.showRug.checked = true; refs.showReference.checked = true; refs.quantileGranularity.value = "quintiles";
    refs.tableSearch.value = ""; document.querySelectorAll("[data-filter]").forEach((input) => { input.value = ""; });
    renderAll();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  refs.stream.addEventListener("change", () => { state.stream = refs.stream.value; state.focusedId = ""; applyPreset(); renderAll(); });
  refs.measure.addEventListener("change", () => { state.measure = refs.measure.value; state.focusedId = ""; renderAll(); });
  refs.sample.addEventListener("change", () => { state.sample = refs.sample.value; applyPreset(); renderAll(); });
  refs.fit.addEventListener("change", () => { state.fit = refs.fit.value; renderAll(); });
  refs.weighting.addEventListener("change", () => { state.weighting = refs.weighting.value; renderAll(); });
  refs.targetExpense.addEventListener("change", () => { state.targetExpense = clamp(Number(refs.targetExpense.value) || 7.5, 1, 100) * 1_000_000; renderAll(); });
  refs.bandwidth.addEventListener("input", () => { state.bandwidth = Number(refs.bandwidth.value); renderAll(); });
  refs.bins.addEventListener("input", () => { state.bins = Number(refs.bins.value); renderAll(); });
  refs.showDensity.addEventListener("change", () => { state.showDensity = refs.showDensity.checked; renderChart(); });
  refs.showRug.addEventListener("change", () => { state.showRug = refs.showRug.checked; renderChart(); });
  refs.showReference.addEventListener("change", () => { state.showReference = refs.showReference.checked; renderChart(); });
  refs.quantileGranularity.addEventListener("change", () => { state.quantileGranularity = refs.quantileGranularity.value; renderQuantiles(); });
  refs.tableSearch.addEventListener("input", () => { state.search = refs.tableSearch.value; renderTable(); });
  refs.reset.addEventListener("click", reset);
  document.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("input", () => { state.filters[input.dataset.filter] = input.value; renderTable(); }));
  document.querySelectorAll("thead button[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    else { state.sortKey = key; state.sortDirection = "asc"; }
    renderTable();
  }));

  const observer = new ResizeObserver(() => renderChart());
  observer.observe(refs.chartWrap);
  $("#archive-status").textContent = `${DATA.summary.retrievedManifestRecords} / ${DATA.summary.retrievedManifestRecords} sources archived`;
  renderAll();
})();
