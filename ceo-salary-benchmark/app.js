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
    fit: "lognormal",
    weighting: "equal",
    targetExpense: 7_500_000,
    bandwidth: 0.7,
    bins: 20,
    autoBins: true,
    quantileGranularity: "quintiles",
    customQuantiles: "5, 25, 50, 75, 95",
    sortKey: "organization",
    sortDirection: "asc",
    search: "",
    filters: {
      title: new Set(), tier: new Set(), topic: new Set(), location: new Set(),
      remoteStatus: new Set(), eaAffinity: new Set(), structure: new Set(),
    },
    ranges: {
      salary: { min: null, max: null, low: null, high: null },
      expenses: { min: null, max: null, low: null, high: null },
    },
    showUnavailable: false,
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
  const wikipediaCache = new Map();
  let organizationPreviewHideTimer = 0;

  const refs = {
    stream: $("#stream-select"), measure: $("#measure-select"), measureField: $("#measure-field"),
    sample: $("#sample-select"), fit: [...document.querySelectorAll('input[name="distribution"]')], weighting: $("#weighting-select"),
    sizeControls: $("#size-controls"), targetExpense: $("#target-expense"), bandwidth: $("#size-bandwidth"),
    bandwidthValue: $("#bandwidth-value"), bins: $("#bin-count"), binValue: $("#bin-value"),
    reset: $("#reset-settings"), chart: $("#salary-chart"), chartWrap: $("#chart-wrap"),
    tooltip: $("#chart-tooltip"), chartKicker: $("#chart-kicker"), chartTitle: $("#chart-title"),
    statN: $("#stat-n"), statNeff: $("#stat-neff"), statCenter: $("#stat-center"),
    quantileGranularity: $("#quantile-granularity"), quantileGrid: $("#quantile-grid"),
    customQuantilesField: $("#custom-quantiles-field"), customQuantiles: $("#custom-quantiles"),
    customQuantilesError: $("#custom-quantiles-error"), densityLegend: $("#density-legend"),
    densityLegendLabel: $("#density-legend-label"), quantileBasis: $("#quantile-basis"),
    showUnavailable: $("#show-unavailable"),
    showUnavailableLabel: $("#show-unavailable-label"),
    salaryMin: $("#salary-range-min"), salaryMax: $("#salary-range-max"), salaryRangeValue: $("#salary-range-value"),
    salaryFilterSummary: $("#salary-filter-summary"),
    expenseMin: $("#expense-range-min"), expenseMax: $("#expense-range-max"), expenseRangeValue: $("#expense-range-value"),
    expenseFilterSummary: $("#expense-filter-summary"),
    tableBody: $("#organization-table tbody"), tableSearch: $("#table-search"),
    includedCount: $("#included-count"), dialog: $("#source-dialog"),
    helpTooltip: $("#help-tooltip"), organizationPreview: $("#organization-preview"),
  };

  function rows() {
    return state.stream === "incumbents" ? DATA.incumbents : DATA.jobAds;
  }

  function wikipediaSearchUrl(organization) {
    return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(organization)}`;
  }

  function positionFloating(element, anchor, gap = 8) {
    const anchorBox = anchor.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const left = clamp(anchorBox.left + anchorBox.width / 2 - box.width / 2, 8, window.innerWidth - box.width - 8);
    let top = anchorBox.top - box.height - gap;
    if (top < 8) top = anchorBox.bottom + gap;
    top = clamp(top, 8, window.innerHeight - box.height - 8);
    element.style.left = `${left}px`; element.style.top = `${top}px`;
  }

  function initializeHelpTooltips() {
    document.querySelectorAll(".info-tooltip[data-tooltip]").forEach((trigger) => {
      const show = () => {
        refs.helpTooltip.textContent = trigger.dataset.tooltip;
        refs.helpTooltip.hidden = false;
        positionFloating(refs.helpTooltip, trigger);
      };
      const hide = () => { refs.helpTooltip.hidden = true; };
      trigger.addEventListener("pointerenter", show); trigger.addEventListener("pointerleave", hide);
      trigger.addEventListener("focus", show); trigger.addEventListener("blur", hide);
      trigger.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    });
    window.addEventListener("resize", () => { refs.helpTooltip.hidden = true; });
    window.addEventListener("scroll", () => { refs.helpTooltip.hidden = true; }, true);
  }

  async function wikipediaPreview(organization) {
    if (wikipediaCache.has(organization)) return wikipediaCache.get(organization);
    const request = (async () => {
      const parameters = new URLSearchParams({
        action: "query", generator: "search", gsrsearch: `${organization} organization`, gsrnamespace: "0",
        gsrlimit: "1", prop: "extracts|info", exintro: "1", explaintext: "1", exsentences: "2",
        inprop: "url", redirects: "1", format: "json", origin: "*",
      });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${parameters}`);
      if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
      const payload = await response.json();
      return Object.values(payload.query?.pages || {})[0] || null;
    })().catch(() => null);
    wikipediaCache.set(organization, request);
    return request;
  }

  function scheduleOrganizationPreviewHide() {
    window.clearTimeout(organizationPreviewHideTimer);
    organizationPreviewHideTimer = window.setTimeout(() => { refs.organizationPreview.hidden = true; }, 180);
  }

  async function showOrganizationPreview(anchor, row) {
    window.clearTimeout(organizationPreviewHideTimer);
    refs.organizationPreview.dataset.rowId = row.id;
    $("#organization-preview-title").textContent = row.organization;
    const summary = [row.topic, row.location, row.staff != null ? `${row.staff} staff` : "", row.selectionNote]
      .filter(Boolean).join(" · ");
    $("#organization-preview-local").textContent = summary || "No additional local description is available.";
    $("#organization-preview-wikipedia").textContent = "Looking for a Wikipedia summary…";
    const homepage = $("#organization-preview-homepage");
    homepage.hidden = !row.homepageUrl; homepage.href = row.homepageUrl || "#";
    const wiki = $("#organization-preview-wiki"); wiki.href = wikipediaSearchUrl(row.organization); wiki.textContent = "Wikipedia search ↗";
    refs.organizationPreview.hidden = false;
    positionFloating(refs.organizationPreview, anchor, 10);
    const result = await wikipediaPreview(row.organization);
    if (refs.organizationPreview.dataset.rowId !== row.id) return;
    if (!result) {
      $("#organization-preview-wikipedia").textContent = "No unambiguous Wikipedia preview was found; use the search link to inspect results.";
      return;
    }
    $("#organization-preview-wikipedia").textContent = `Wikipedia candidate (${result.title}; verify match): ${result.extract || "No introductory summary available."}`;
    if (result.fullurl) { wiki.href = result.fullurl; wiki.textContent = "Open Wikipedia article ↗"; }
    positionFloating(refs.organizationPreview, anchor, 10);
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
      .filter(passesFilters)
      .map((row) => ({ row, value: salary(row), weight: effectiveWeight(row) }))
      .filter((item) => item.value != null && item.weight > 0);
  }

  function passesFilters(row) {
    const search = state.search.toLowerCase();
    const haystack = [row.organization, row.title, row.rawTitle, row.topic, row.eaAffinity, row.location, row.remoteStatus, row.structure].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    const categoricalMatch = Object.entries(state.filters).every(([key, selected]) => {
      if (!selected.size) return true;
      return selected.has(String(row[key] || "Not reported"));
    });
    if (!categoricalMatch) return false;
    return ["salary", "expenses"].every((key) => {
      const range = state.ranges[key];
      if (range.min == null || range.max == null) return true;
      const restricted = range.low > range.min || range.high < range.max;
      const value = key === "salary" ? salary(row) : row.expenses;
      if (value == null) return !restricted;
      return value >= range.low && value <= range.high;
    });
  }

  function applyPreset() {
    for (const row of rows()) {
      const available = salary(row) != null;
      let selected = row.defaultIncluded && available;
      if (state.sample === "clean") selected = row.defaultIncluded && row.structurallyClean && available;
      if (state.sample === "tierA") {
        selected = row.defaultIncluded && available && (row.tier === "A" || row.tier === "strict_primary");
      }
      if (state.sample === "observed") selected = available;
      inclusion[state.stream].set(row.id, selected);
    }
  }

  function configureRanges() {
    const salaries = rows().map(salary).filter((value) => value != null && Number.isFinite(value));
    const expenses = rows().map((row) => row.expenses).filter((value) => value != null && value > 0 && Number.isFinite(value));
    const salaryMin = Math.floor(Math.min(...salaries) / 10_000) * 10_000;
    const salaryMax = Math.ceil(Math.max(...salaries) / 10_000) * 10_000;
    state.ranges.salary = { min: salaryMin, max: salaryMax, low: salaryMin, high: salaryMax };
    state.ranges.expenses = {
      min: Math.min(...expenses), max: Math.max(...expenses), low: Math.min(...expenses), high: Math.max(...expenses),
    };
    Object.assign(refs.salaryMin, { min: salaryMin, max: salaryMax, step: 5_000, value: salaryMin });
    Object.assign(refs.salaryMax, { min: salaryMin, max: salaryMax, step: 5_000, value: salaryMax });
    refs.expenseMin.value = 0; refs.expenseMax.value = 1000;
    updateRangeLabels();
  }

  function expenseFromSlider(position) {
    const range = state.ranges.expenses;
    if (Number(position) <= 0) return range.min;
    if (Number(position) >= 1000) return range.max;
    if (range.min <= 0 || range.max <= range.min) return range.min;
    return Math.exp(Math.log(range.min) + (Number(position) / 1000) * Math.log(range.max / range.min));
  }

  function updateRange(key, changed) {
    const lowInput = key === "salary" ? refs.salaryMin : refs.expenseMin;
    const highInput = key === "salary" ? refs.salaryMax : refs.expenseMax;
    if (Number(lowInput.value) > Number(highInput.value)) {
      if (changed === "low") highInput.value = lowInput.value;
      else lowInput.value = highInput.value;
    }
    state.ranges[key].low = key === "salary" ? Number(lowInput.value) : expenseFromSlider(lowInput.value);
    state.ranges[key].high = key === "salary" ? Number(highInput.value) : expenseFromSlider(highInput.value);
    updateRangeLabels();
    renderAll();
  }

  function updateRangeLabels() {
    const salary = state.ranges.salary;
    const expenses = state.ranges.expenses;
    refs.salaryRangeValue.value = salary.low === salary.min && salary.high === salary.max
      ? "All" : `${compactMoney(salary.low)}–${compactMoney(salary.high)}`;
    refs.expenseRangeValue.value = expenses.low === expenses.min && expenses.high === expenses.max
      ? "All" : `${compactMoney(expenses.low)}–${compactMoney(expenses.high)}`;
    refs.salaryFilterSummary.textContent = refs.salaryRangeValue.value;
    refs.expenseFilterSummary.textContent = refs.expenseRangeValue.value;
    [["salary", refs.salaryMin, refs.salaryMax], ["expenses", refs.expenseMin, refs.expenseMax]].forEach(([key, low, high]) => {
      const minimum = Number(low.min); const maximum = Number(low.max);
      const track = document.querySelector(`[data-range-filter="${key}"] .dual-range`);
      track.style.setProperty("--range-low", `${((Number(low.value) - minimum) / (maximum - minimum)) * 100}%`);
      track.style.setProperty("--range-high", `${((Number(high.value) - minimum) / (maximum - minimum)) * 100}%`);
    });
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
    if (row.tier === "A" || row.tier === "strict_primary") return "#2D6885";
    if (row.tier === "B" || row.tier.includes?.("secondary")) return "#44B0DF";
    return "#75CCEC";
  }

  function squareBinCount(items, domainMin, domainMax, innerWidth, innerHeight) {
    let best = { bins: 20, score: Infinity };
    const model = fitModel(items);
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    for (let count = 2; count <= 200; count += 1) {
      const totals = Array(count).fill(0);
      items.forEach((item) => {
        const index = clamp(Math.floor(((item.value - domainMin) / (domainMax - domainMin)) * count), 0, count - 1);
        totals[index] += item.weight;
      });
      const binWidth = (domainMax - domainMin) / count;
      const densityPeak = model ? Math.max(...Array.from({ length: 101 }, (_, index) => {
        const value = domainMin + (index / 100) * (domainMax - domainMin);
        return model.density(value) * totalWeight * binWidth;
      })) : 0;
      const maxTotal = Math.max(...totals, densityPeak, 1) * 1.1;
      const typicalWeight = items.reduce((sum, item) => sum + item.weight, 0) / items.length;
      const blockWidth = innerWidth / count;
      const blockHeight = innerHeight * typicalWeight / maxTotal;
      const sizePenalty = Math.min(blockWidth, blockHeight) < 7 ? (7 - Math.min(blockWidth, blockHeight)) / 2 : 0;
      const score = Math.abs(Math.log(blockWidth / Math.max(blockHeight, 0.1))) + sizePenalty;
      if (score < best.score) best = { bins: count, score };
    }
    return best.bins;
  }

  function renderChart() {
    const items = selectedRows();
    const svg = refs.chart;
    svg.replaceChildren();
    const width = Math.max(520, refs.chartWrap.clientWidth || 720);
    const height = Math.max(330, refs.chartWrap.clientHeight || 360);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 14, right: 18, bottom: 46, left: 66 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (!items.length) {
      const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#52879E", "font-size": 13 });
      empty.textContent = "No organizations have a value for the current selection.";
      svg.append(empty);
      refs.statN.textContent = "0"; refs.statNeff.textContent = "0"; refs.statCenter.textContent = "—";
      return;
    }

    const values = items.map((item) => item.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = Math.max((rawMax - rawMin) * 0.08, 25_000);
    const domainMin = Math.max(0, Math.floor((rawMin - pad) / 50_000) * 50_000);
    const domainMax = Math.ceil((rawMax + pad) / 50_000) * 50_000;
    const xScale = (value) => margin.left + ((value - domainMin) / (domainMax - domainMin)) * innerWidth;
    if (state.autoBins) {
      state.bins = squareBinCount(items, domainMin, domainMax, innerWidth, innerHeight);
      refs.bins.value = state.bins;
      refs.binValue.value = state.bins;
      state.autoBins = false;
    }
    const binWidthValue = (domainMax - domainMin) / state.bins;
    const bins = Array.from({ length: state.bins }, (_, index) => ({ index, total: 0, items: [] }));
    items.forEach((item) => {
      const index = clamp(Math.floor((item.value - domainMin) / binWidthValue), 0, state.bins - 1);
      bins[index].items.push(item);
      bins[index].total += item.weight;
    });
    const model = fitModel(items);
    const sumWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const densityPoints = model ? Array.from({ length: 181 }, (_, index) => {
      const value = domainMin + (index / 180) * (domainMax - domainMin);
      return { value, expectedWeight: model.density(value) * sumWeight * binWidthValue };
    }) : [];
    const densityPeak = densityPoints.length ? Math.max(...densityPoints.map((point) => point.expectedWeight)) : 0;
    const maxWeight = Math.max(...bins.map((bin) => bin.total), densityPeak, 1) * 1.1;
    const yScale = (weight) => innerHeight - (weight / maxWeight) * innerHeight;

    const gridTicks = 4;
    for (let i = 0; i <= gridTicks; i += 1) {
      const value = (maxWeight * i) / gridTicks;
      const y = margin.top + yScale(value);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgElement("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", fill: "#52879E", "font-size": 9 });
      label.textContent = value.toFixed(value < 10 ? 1 : 0);
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

    if (model) {
      const path = densityPoints.map((point, index) => {
        const x = xScale(point.value);
        const y = margin.top + yScale(point.expectedWeight);
        return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join("");
      svg.append(svgElement("path", { d: path, class: "density-line" }));
    }

    items.forEach((item) => {
      const x = xScale(item.value);
      svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom + 2, y2: plotBottom + 8, class: "rug-line" }));
    });

    if (state.hoverQuantile != null) {
      const x = xScale(state.hoverQuantile);
      svg.append(svgElement("line", { x1: x, x2: x, y1: margin.top, y2: plotBottom, class: "quantile-guide" }));
    }

    const tickCount = width < 650 ? 5 : 8;
    for (let i = 0; i <= tickCount; i += 1) {
      const value = domainMin + (i / tickCount) * (domainMax - domainMin);
      const x = xScale(value);
      svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4, stroke: "#52879E" }));
      const label = svgElement("text", { x, y: plotBottom + 20, "text-anchor": "middle", fill: "#52879E", "font-size": 10 });
      label.textContent = compactMoney(value);
      svg.append(label);
    }
    const axisTitle = svgElement("text", { x: margin.left + innerWidth / 2, y: height - 6, "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700 });
    axisTitle.textContent = `Annual compensation (${DATA.priceBasis})`;
    svg.append(axisTitle);
    const yAxisTitle = svgElement("text", {
      x: 14, y: margin.top + innerHeight / 2, transform: `rotate(-90 14 ${margin.top + innerHeight / 2})`,
      "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700,
    });
    yAxisTitle.textContent = "Weighted organizations per bin";
    svg.append(yAxisTitle);

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
    const model = fitModel(items);
    refs.quantileBasis.textContent = state.fit === "empirical"
      ? "Derived from weighted empirical ranks"
      : `Derived from the fitted ${state.fit} distribution`;
    refs.customQuantilesField.hidden = state.quantileGranularity !== "custom";
    let percentiles = [20, 40, 60, 80];
    if (state.quantileGranularity === "deciles") percentiles = Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
    if (state.quantileGranularity === "percentiles") percentiles = Array.from({ length: 99 }, (_, index) => index + 1);
    if (state.quantileGranularity === "custom") {
      const tokens = state.customQuantiles.split(",").map((value) => Number(value.trim()));
      const valid = tokens.length > 0 && tokens.every((value) => Number.isFinite(value) && value > 0 && value < 100);
      refs.customQuantilesError.textContent = valid ? "" : "Enter comma-separated values greater than 0 and less than 100.";
      if (valid) percentiles = [...new Set(tokens)].sort((a, b) => a - b);
      else percentiles = [];
    } else refs.customQuantilesError.textContent = "";
    refs.quantileGrid.replaceChildren();
    refs.quantileGrid.classList.toggle("is-percentiles", percentiles.length > 20);
    percentiles.forEach((percentile) => {
      const probability = percentile / 100;
      const value = items.length ? (model ? model.quantile(probability) : weightedQuantile(items, probability)) : NaN;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quantile-cell";
      button.innerHTML = `<span>${formatPercentile(percentile)}</span><strong>${compactMoney(value)}</strong>`;
      button.addEventListener("pointerenter", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("pointerleave", () => { state.hoverQuantile = null; renderChart(); });
      button.addEventListener("focus", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("blur", () => { state.hoverQuantile = null; renderChart(); });
      refs.quantileGrid.append(button);
    });
  }

  function formatPercentile(value) {
    const rounded = Number.isInteger(value) ? value : value.toFixed(1);
    const integer = Math.floor(value);
    const suffix = integer % 100 >= 11 && integer % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[integer % 10] || "th");
    return `${rounded}${suffix} percentile`;
  }

  function tableRows() {
    const filtered = rows().filter((row) => (state.showUnavailable || salary(row) != null) && passesFilters(row));
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const value = (row) => {
        if (state.sortKey === "salary") return salary(row) ?? -Infinity;
        if (state.sortKey === "weight") return effectiveWeight(row);
        if (state.sortKey === "expenses") return row.expenses ?? -Infinity;
        if (state.sortKey === "staff") return row.staff ?? -Infinity;
        if (state.sortKey === "compensationYear") return row.compensationYear ?? -Infinity;
        return String(row[state.sortKey] || "").toLowerCase();
      };
      const av = value(a); const bv = value(b);
      return (av < bv ? -1 : av > bv ? 1 : 0) * direction;
    });
  }

  function buildFilterMenus() {
    document.querySelectorAll("[data-filter-menu]").forEach((container) => {
      const key = container.dataset.filterMenu;
      const values = [...new Set(rows().map((row) => String(row[key] || "Not reported")))].sort((a, b) => a.localeCompare(b));
      const selected = state.filters[key];
      container.replaceChildren();
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = selected.size ? `${selected.size} selected` : "All";
      summary.setAttribute("aria-label", `Filter ${key}`);
      const panel = document.createElement("div");
      panel.className = "filter-popover";
      const actions = document.createElement("div");
      actions.className = "filter-actions";
      const allButton = document.createElement("button");
      allButton.type = "button"; allButton.textContent = "Select all";
      allButton.addEventListener("click", () => { selected.clear(); buildFilterMenus(); renderAll(); });
      actions.append(allButton);
      const options = document.createElement("div");
      options.className = "filter-options";
      values.forEach((value) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox"; checkbox.checked = !selected.size || selected.has(value);
        checkbox.addEventListener("change", () => {
          if (!selected.size) values.forEach((option) => selected.add(option));
          if (checkbox.checked) selected.add(value); else selected.delete(value);
          if (selected.size === values.length) selected.clear();
          summary.textContent = selected.size ? `${selected.size} selected` : "All";
          renderAll();
        });
        const span = document.createElement("span"); span.textContent = value;
        label.append(checkbox, span); options.append(label);
      });
      panel.append(actions, options); details.append(summary, panel); container.append(details);
    });
  }

  function renderTable() {
    refs.tableBody.replaceChildren();
    tableRows().forEach((row) => {
      const available = salary(row) != null;
      const tr = document.createElement("tr");
      if (!inclusion[state.stream].get(row.id)) tr.classList.add("is-excluded");
      if (!available) tr.classList.add("is-unavailable");
      if (state.focusedId === row.id) tr.classList.add("is-focused");
      tr.dataset.id = row.id;

      const toggleCell = document.createElement("td");
      toggleCell.className = "check-column";
      const toggle = document.createElement("input");
      toggle.type = "checkbox"; toggle.className = "row-toggle"; toggle.checked = available && inclusion[state.stream].get(row.id);
      toggle.disabled = !available;
      toggle.setAttribute("aria-label", available ? `Include ${row.organization}` : `${row.organization} has no ${measureLabel()} observation`);
      toggle.addEventListener("change", () => { inclusion[state.stream].set(row.id, toggle.checked); renderAll(); });
      toggleCell.append(toggle);

      const org = document.createElement("td");
      org.className = "org-cell";
      const orgName = row.homepageUrl ? document.createElement("a") : document.createElement("span");
      orgName.className = "organization-name"; orgName.textContent = row.organization;
      if (row.homepageUrl) {
        orgName.href = row.homepageUrl; orgName.target = "_blank"; orgName.rel = "noopener noreferrer";
      } else orgName.tabIndex = 0;
      orgName.addEventListener("pointerenter", () => showOrganizationPreview(orgName, row));
      orgName.addEventListener("pointerleave", scheduleOrganizationPreviewHide);
      orgName.addEventListener("focus", () => showOrganizationPreview(orgName, row));
      orgName.addEventListener("blur", scheduleOrganizationPreviewHide);
      const orgLinks = document.createElement("span"); orgLinks.className = "organization-links";
      if (row.homepageUrl) {
        const homepage = document.createElement("a"); homepage.href = row.homepageUrl; homepage.target = "_blank";
        homepage.rel = "noopener noreferrer"; homepage.textContent = "Website ↗"; orgLinks.append(homepage);
      }
      const wiki = document.createElement("a"); wiki.href = wikipediaSearchUrl(row.organization); wiki.target = "_blank";
      wiki.rel = "noopener noreferrer"; wiki.textContent = "Wikipedia ↗"; orgLinks.append(wiki);
      org.append(orgName, orgLinks);

      const title = document.createElement("td");
      title.className = "title-cell"; title.title = row.rawTitle || row.title || ""; title.textContent = row.title || "Not reported";

      const salaryCell = document.createElement("td");
      salaryCell.className = "money-cell"; salaryCell.textContent = compactMoney(salary(row));

      const weightCell = document.createElement("td");
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "10"; weightInput.step = "0.1";
      weightInput.value = customWeights[state.stream].get(row.id) ?? 1; weightInput.className = "weight-input";
      weightInput.disabled = !available;
      weightInput.title = `Effective weight: ${effectiveWeight(row).toFixed(2)}`;
      weightInput.setAttribute("aria-label", `Custom weight for ${row.organization}`);
      weightInput.addEventListener("change", () => {
        const value = clamp(Number(weightInput.value) || 0, 0, 10);
        customWeights[state.stream].set(row.id, value);
        if (value === 0) inclusion[state.stream].set(row.id, false);
        renderAll();
      });
      weightCell.append(weightInput);

      const tier = document.createElement("td"); tier.className = "tier-cell"; tier.title = row.tier || ""; tier.textContent = row.tier || "—";
      const topic = document.createElement("td"); topic.className = "topic-cell"; topic.title = row.topic || ""; topic.textContent = row.topic || "—";
      const expenses = document.createElement("td"); expenses.className = "money-cell"; expenses.textContent = compactMoney(row.expenses);
      const location = document.createElement("td"); location.className = "metadata-cell"; location.textContent = row.location || "—";
      const workModel = document.createElement("td"); workModel.className = "metadata-cell"; workModel.textContent = row.remoteStatus || "—";
      const staff = document.createElement("td"); staff.className = "number-cell"; staff.textContent = row.staff ?? "—";
      const ea = document.createElement("td"); ea.className = "metadata-cell"; ea.textContent = row.eaAffinity || "—";
      const structure = document.createElement("td"); structure.className = "metadata-cell"; structure.textContent = row.structure || "—";
      const year = document.createElement("td"); year.className = "number-cell"; year.textContent = row.compensationYear || "—";
      const preview = document.createElement("td");
      const previewButton = document.createElement("button"); previewButton.type = "button"; previewButton.className = "preview-button"; previewButton.textContent = "Preview";
      previewButton.addEventListener("click", () => openSourceDialog(row)); preview.append(previewButton);
      const source = document.createElement("td");
      if (row.sourceUrl) {
        const link = document.createElement("a"); link.className = "source-link"; link.href = row.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open ↗"; source.append(link);
      } else source.textContent = "—";
      tr.append(toggleCell, org, title, salaryCell, expenses, weightCell, tier, topic, location, workModel, staff, ea, structure, year, preview, source);
      refs.tableBody.append(tr);
    });
    const count = selectedRows().length;
    const unavailable = rows().filter((row) => salary(row) == null).length;
    refs.includedCount.textContent = `${count} included`;
    refs.showUnavailableLabel.textContent = state.showUnavailable
      ? `Showing ${unavailable} rows without this salary measure`
      : `Show ${unavailable} rows without this salary measure`;
    document.querySelectorAll("thead button[data-sort]").forEach((button) => {
      const active = button.dataset.sort === state.sortKey;
      button.dataset.active = active;
      button.dataset.direction = active ? state.sortDirection : "";
      button.title = `Sort by ${button.textContent.trim()}`;
      button.closest("th").setAttribute("aria-sort", active
        ? (state.sortDirection === "asc" ? "ascending" : "descending")
        : "none");
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
      ["Executive / role", [row.executive, row.rawTitle || row.title].filter(Boolean).join(" · ") || "Not reported"],
      ["Evidence year", row.compensationYear || "Not reported"],
      ["Tier", row.tier || "Not coded"],
      ["Topic / model", row.topic || "Not coded"],
      ["Location / work model", [row.location, row.remoteStatus].filter(Boolean).join(" · ") || "Not reported"],
      ["EA relation", row.eaAffinity || "Not coded"],
      ["Organization structure", row.structure || "Not coded"],
      ["Scale", `${compactMoney(row.expenses)} expenses · ${row.staff ?? "—"} staff`],
      ["Filing-declared website", row.homepageUrl || "Not available in the preserved source"],
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
    refs.densityLegend.hidden = state.fit === "empirical";
    refs.densityLegendLabel.textContent = `${state.fit === "gamma" ? "Gamma" : "Lognormal"} density`;
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
      stream: "incumbents", measure: "base", sample: "primary", fit: "lognormal", weighting: "equal",
      targetExpense: 7_500_000, bandwidth: 0.7, bins: 20, autoBins: true,
      quantileGranularity: "quintiles", customQuantiles: "5, 25, 50, 75, 95",
      sortKey: "organization", sortDirection: "asc", search: "",
      filters: {
        title: new Set(), tier: new Set(), topic: new Set(), location: new Set(),
        remoteStatus: new Set(), eaAffinity: new Set(), structure: new Set(),
      },
      ranges: {
        salary: { min: null, max: null, low: null, high: null },
        expenses: { min: null, max: null, low: null, high: null },
      },
      showUnavailable: false,
      focusedId: "", hoverQuantile: null,
    });
    Object.entries({ incumbents: DATA.incumbents, jobAds: DATA.jobAds }).forEach(([stream, streamRows]) => {
      streamRows.forEach((row) => { inclusion[stream].set(row.id, Boolean(row.defaultIncluded)); customWeights[stream].set(row.id, 1); });
    });
    refs.stream.value = state.stream; refs.measure.value = state.measure; refs.sample.value = state.sample;
    refs.fit.forEach((radio) => { radio.checked = radio.value === state.fit; });
    refs.weighting.value = state.weighting; refs.targetExpense.value = 7.5;
    refs.bandwidth.value = state.bandwidth; refs.bins.value = state.bins;
    refs.quantileGranularity.value = "quintiles";
    refs.customQuantiles.value = state.customQuantiles; refs.tableSearch.value = ""; refs.showUnavailable.checked = false;
    applyPreset(); configureRanges(); buildFilterMenus();
    renderAll();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  refs.stream.addEventListener("change", () => {
    state.stream = refs.stream.value; state.focusedId = ""; state.autoBins = true; state.showUnavailable = false;
    state.filters = {
      title: new Set(), tier: new Set(), topic: new Set(), location: new Set(),
      remoteStatus: new Set(), eaAffinity: new Set(), structure: new Set(),
    };
    refs.showUnavailable.checked = false;
    applyPreset(); configureRanges(); buildFilterMenus(); renderAll();
  });
  refs.measure.addEventListener("change", () => {
    state.measure = refs.measure.value; state.focusedId = ""; state.autoBins = true;
    applyPreset(); configureRanges(); renderAll();
  });
  refs.sample.addEventListener("change", () => { state.sample = refs.sample.value; applyPreset(); renderAll(); });
  refs.fit.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.fit = radio.value; renderAll(); } }));
  refs.weighting.addEventListener("change", () => { state.weighting = refs.weighting.value; renderAll(); });
  refs.targetExpense.addEventListener("change", () => { state.targetExpense = clamp(Number(refs.targetExpense.value) || 7.5, 1, 100) * 1_000_000; renderAll(); });
  refs.bandwidth.addEventListener("input", () => { state.bandwidth = Number(refs.bandwidth.value); renderAll(); });
  refs.bins.addEventListener("input", () => { state.autoBins = false; state.bins = Number(refs.bins.value); renderAll(); });
  refs.quantileGranularity.addEventListener("change", () => { state.quantileGranularity = refs.quantileGranularity.value; renderQuantiles(); });
  refs.customQuantiles.addEventListener("input", () => { state.customQuantiles = refs.customQuantiles.value; renderQuantiles(); });
  refs.tableSearch.addEventListener("input", () => { state.search = refs.tableSearch.value; renderAll(); });
  refs.showUnavailable.addEventListener("change", () => { state.showUnavailable = refs.showUnavailable.checked; renderTable(); });
  refs.salaryMin.addEventListener("input", () => updateRange("salary", "low"));
  refs.salaryMax.addEventListener("input", () => updateRange("salary", "high"));
  refs.expenseMin.addEventListener("input", () => updateRange("expenses", "low"));
  refs.expenseMax.addEventListener("input", () => updateRange("expenses", "high"));
  refs.reset.addEventListener("click", reset);
  document.querySelectorAll("thead button[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    else { state.sortKey = key; state.sortDirection = "asc"; }
    renderTable();
  }));

  const observer = new ResizeObserver(() => renderChart());
  observer.observe(refs.chartWrap);
  refs.organizationPreview.addEventListener("pointerenter", () => window.clearTimeout(organizationPreviewHideTimer));
  refs.organizationPreview.addEventListener("pointerleave", scheduleOrganizationPreviewHide);
  $("#archive-status").textContent = `${DATA.summary.retrievedManifestRecords} / ${DATA.summary.retrievedManifestRecords} sources archived`;
  applyPreset();
  configureRanges();
  buildFilterMenus();
  initializeHelpTooltips();
  renderAll();
})();
