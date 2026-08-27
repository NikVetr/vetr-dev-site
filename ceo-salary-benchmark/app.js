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
    weightings: new Set(),
    discreteWeights: {},
    targetExpense: 7_500_000,
    targetStaff: 57,
    expenseBandwidth: 0.7,
    staffBandwidth: 0.7,
    recencyHalfLife: 4,
    bins: 20,
    autoBins: true,
    view: "histogram",
    scatterX: "expenses",
    chartColor: "tier",
    showContours: true,
    quantileGranularity: "quintiles",
    customQuantiles: "5, 25, 50, 75, 95",
    sortKey: "organization",
    sortDirection: "asc",
    filters: {
      title: null, sourceType: null, tier: null, topic: null, location: null,
      eaAffinity: null, structure: null,
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
    sample: $("#sample-select"), fit: [...document.querySelectorAll('input[name="distribution"]')],
    weightingComponents: [...document.querySelectorAll('#weighting-components input[type="checkbox"]')],
    sizeControls: $("#size-controls"), expenseTargetField: $("#expense-target-field"), staffTargetField: $("#staff-target-field"),
    recencyField: $("#recency-field"), targetExpense: $("#target-expense"), targetStaff: $("#target-staff"),
    expenseBandwidth: $("#expense-bandwidth"), staffBandwidth: $("#staff-bandwidth"), recencyHalfLife: $("#recency-halflife"),
    expenseBandwidthValue: $("#expense-bandwidth-value"), staffBandwidthValue: $("#staff-bandwidth-value"),
    recencyHalfLifeValue: $("#recency-halflife-value"), discreteWeightEditors: $("#discrete-weight-editors"),
    binField: $("#bin-field"), bins: $("#bin-count"), binValue: $("#bin-value"),
    view: [...document.querySelectorAll('input[name="chart-view"]')], scatterControls: $("#scatter-controls"),
    scatterX: $("#scatter-x"), chartColor: $("#chart-color"), colorDescription: $("#color-description"), showContours: $("#show-contours"),
    weightProfile: $("#weight-profile"), weightProfileGrid: $("#weight-profile-grid"), rpScaleReference: $("#rp-scale-reference"),
    reset: $("#reset-settings"), chart: $("#salary-chart"), chartWrap: $("#chart-wrap"),
    tooltip: $("#chart-tooltip"), chartKicker: $("#chart-kicker"), chartTitle: $("#chart-title"),
    statN: $("#stat-n"), statNUnit: $("#stat-n-unit"), statNeff: $("#stat-neff"), statCenter: $("#stat-center"),
    quantileGranularity: $("#quantile-granularity"), quantileGrid: $("#quantile-grid"),
    customQuantilesField: $("#custom-quantiles-field"), customQuantiles: $("#custom-quantiles"),
    customQuantilesError: $("#custom-quantiles-error"), chartLegend: $("#chart-legend"),
    quantileBasis: $("#quantile-basis"), sampleDescription: $("#sample-description"),
    weightingDescription: $("#weighting-description"),
    methodNoteTitle: $("#method-note-title"), methodNoteText: $("#method-note-text"),
    showUnavailable: $("#show-unavailable"),
    showUnavailableLabel: $("#show-unavailable-label"),
    salaryMin: $("#salary-range-min"), salaryMax: $("#salary-range-max"), salaryRangeValue: $("#salary-range-value"),
    salaryFilterSummary: $("#salary-filter-summary"),
    expenseMin: $("#expense-range-min"), expenseMax: $("#expense-range-max"), expenseRangeValue: $("#expense-range-value"),
    expenseFilterSummary: $("#expense-filter-summary"),
    tableBody: $("#organization-table tbody"),
    includedCount: $("#included-count"), dialog: $("#source-dialog"),
    helpTooltip: $("#help-tooltip"), organizationPreview: $("#organization-preview"),
  };

  function rows() {
    if (state.stream === "combined") return [...DATA.incumbents, ...DATA.jobAds];
    return state.stream === "incumbents" ? DATA.incumbents : DATA.jobAds;
  }

  function rowStream(row) {
    return row.evidenceStream || (row.sourceType === "Job posting" ? "jobAds" : "incumbents");
  }

  function rowInclusion(row) { return inclusion[rowStream(row)]; }
  function rowCustomWeights(row) { return customWeights[rowStream(row)]; }

  const DISCRETE_WEIGHT_KEYS = ["tier", "eaAffinity", "sourceType", "topic", "titleGroup", "structure"];
  const WEIGHT_LABELS = {
    comparability: "Match score", size: "Expense similarity", staff: "Staff similarity", recency: "Evidence recency",
    tier: "Tier", eaAffinity: "EA relation", sourceType: "Evidence stream", topic: "Topic / model",
    titleGroup: "Job-title group", structure: "Structure", streamBalanced: "Balanced evidence streams",
  };

  function defaultDiscreteWeight(key, value) {
    const normalized = String(value || "").toLowerCase();
    if (key === "tier") return normalized === "a" || normalized.includes("strict")
      ? 1 : normalized === "b" || normalized.includes("secondary") ? 0.65 : 0.35;
    if (key === "eaAffinity") return normalized.includes("aligned")
      ? 1 : normalized.includes("adjacent") ? 0.8 : normalized.includes("functional") ? 0.55 : 0.45;
    return 1;
  }

  function ensureDiscreteWeights(key) {
    if (!state.discreteWeights[key]) state.discreteWeights[key] = {};
    rows().forEach((row) => {
      const category = String(row[key] || "Not reported");
      if (state.discreteWeights[key][category] == null) state.discreteWeights[key][category] = defaultDiscreteWeight(key, category);
    });
    return state.discreteWeights[key];
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
    if (rowStream(row) === "jobAds" || state.stream === "combined") return row.salary?.base ?? null;
    return row.salary?.[state.measure] ?? null;
  }

  function baseWeight(row) {
    const latestYear = Math.max(...rows().map((item) => item.compensationYear || 0));
    let weight = 1;
    if (state.weightings.has("comparability")) weight *= clamp((row.comparabilityScore || 50) / 75, 0.25, 1.75);
    if (state.weightings.has("size")) weight *= row.expenses && row.expenses > 0
      ? Math.exp(-0.5 * (Math.log(row.expenses / state.targetExpense) / state.expenseBandwidth) ** 2) : 0.45;
    if (state.weightings.has("staff")) weight *= row.staff && row.staff > 0
      ? Math.exp(-0.5 * (Math.log(row.staff / state.targetStaff) / state.staffBandwidth) ** 2) : 0.45;
    if (state.weightings.has("recency")) weight *= row.compensationYear
      ? 0.5 ** (Math.max(0, latestYear - row.compensationYear) / state.recencyHalfLife) : 0.45;
    DISCRETE_WEIGHT_KEYS.forEach((key) => {
      if (!state.weightings.has(key)) return;
      const category = String(row[key] || "Not reported");
      weight *= ensureDiscreteWeights(key)[category];
    });
    return weight;
  }

  function effectiveWeight(row) {
    if (!rowInclusion(row).get(row.id)) return 0;
    const weight = baseWeight(row) * (rowCustomWeights(row).get(row.id) ?? 1);
    if (!state.weightings.has("streamBalanced") || state.stream !== "combined") return weight;
    const stream = rowStream(row);
    const streamTotal = rows().reduce((sum, candidate) => {
      if (rowStream(candidate) !== stream || salary(candidate) == null || !passesFilters(candidate) || !rowInclusion(candidate).get(candidate.id)) return sum;
      return sum + baseWeight(candidate) * (rowCustomWeights(candidate).get(candidate.id) ?? 1);
    }, 0);
    return streamTotal ? weight / streamTotal : 0;
  }

  function selectedRows() {
    return rows()
      .filter(passesFilters)
      .map((row) => ({ row, value: salary(row), weight: effectiveWeight(row) }))
      .filter((item) => item.value != null && item.weight > 0);
  }

  function passesFilters(row) {
    const categoricalMatch = Object.entries(state.filters).every(([key, selected]) => {
      if (selected == null) return true;
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
      rowInclusion(row).set(row.id, selected);
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

  function appendCategoryLegend(colorMap) {
    colorMap.forEach((color, label) => {
      const item = document.createElement("span"); item.title = label;
      const swatch = document.createElement("i"); swatch.className = "swatch"; swatch.style.background = color;
      item.append(swatch, document.createTextNode(label)); refs.chartLegend.append(item);
    });
  }

  function renderHistogramLegend(colorMap) {
    refs.chartLegend.replaceChildren();
    appendCategoryLegend(colorMap);
    if (state.fit !== "empirical") {
      const density = document.createElement("span"); density.innerHTML = `<i class="line-swatch"></i> ${state.fit === "gamma" ? "Gamma" : "Lognormal"} density`;
      refs.chartLegend.append(density);
    }
    const rug = document.createElement("span"); rug.innerHTML = '<i class="rug-swatch"></i> Individual salaries'; refs.chartLegend.append(rug);
  }

  function highlightRug(id, highlighted) {
    refs.chart.querySelectorAll(".rug-line").forEach((rug) => {
      if (rug.dataset.rugId === id) rug.classList.toggle("is-highlighted", highlighted || state.focusedId === id);
    });
  }

  function renderHistogram() {
    const items = selectedRows();
    const svg = refs.chart;
    svg.replaceChildren();
    const colors = categoryColors(items);
    renderHistogramLegend(colors);
    $("#chart-description").textContent = "A weighted histogram in which each block represents one organization.";
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
        const category = String(item.row[state.chartColor] || "Not reported");
        const rect = svgElement("rect", {
          x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(2, y1 - y0),
          fill: colors.get(category), class: `bar-block${state.focusedId === item.row.id ? " is-focused" : ""}`,
          tabindex: "0", role: "button", "aria-label": `${item.row.organization}, ${money(item.value)}`,
        });
        const detail = `${escapeHtml(item.row.title || "")}<br>${escapeHtml(category)}`;
        rect.addEventListener("pointerenter", (event) => { highlightRug(item.row.id, true); showTooltip(event, item, detail); });
        rect.addEventListener("pointermove", (event) => positionTooltip(event));
        rect.addEventListener("pointerleave", () => { highlightRug(item.row.id, false); hideTooltip(); });
        rect.addEventListener("focus", () => highlightRug(item.row.id, true));
        rect.addEventListener("blur", () => highlightRug(item.row.id, false));
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
      svg.append(svgElement("line", {
        x1: x, x2: x, y1: plotBottom + 2, y2: plotBottom + 8,
        class: `rug-line${state.focusedId === item.row.id ? " is-highlighted" : ""}`, "data-rug-id": item.row.id,
      }));
    });

    if (state.hoverQuantile != null) {
      const x = xScale(state.hoverQuantile);
      svg.append(svgElement("line", { x1: x, x2: x, y1: margin.top, y2: plotBottom, class: "quantile-guide" }));
    }

    const tickCount = width < 650 ? 5 : 8;
    for (let i = 0; i <= tickCount; i += 1) {
      const value = domainMin + (i / tickCount) * (domainMax - domainMin);
      const x = xScale(value);
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
    yAxisTitle.textContent = state.stream === "combined" ? "Weighted observations per bin" : "Weighted organizations per bin";
    svg.append(yAxisTitle);

    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = compactMoney(distributionQuantile(items, 0.5));
  }

  const scatterVariables = {
    expenses: { label: "Annual expenses", format: compactMoney, logarithmic: true },
    revenue: { label: "Annual revenue", format: compactMoney, logarithmic: true },
    staff: { label: "Staff count", format: (value) => Math.round(value).toLocaleString(), logarithmic: true },
    comparabilityScore: { label: "Comparability score", format: (value) => Number(value).toFixed(0), logarithmic: false },
    compensationYear: { label: "Evidence year", format: (value) => Number(value).toFixed(0), logarithmic: false },
  };
  const categoryPalette = ["#2D6885", "#44B0DF", "#75CCEC", "#52879E", "#3E454A", "#B7E2F2"];

  function mixHex(hex, target, amount) {
    const source = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    const destination = target.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    return `#${source.map((value, index) => Math.round(value + (destination[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  }

  function categoryColors(items) {
    const categories = [...new Set(items.map((item) => String(item.row[state.chartColor] || "Not reported")))].sort((a, b) => a.localeCompare(b));
    return new Map(categories.map((category, index) => {
      const cycle = Math.floor(index / categoryPalette.length);
      const base = categoryPalette[index % categoryPalette.length];
      const color = cycle % 2 ? mixHex(base, "#ffffff", Math.min(0.18 + cycle * 0.05, 0.42)) : mixHex(base, "#000000", Math.min(cycle * 0.05, 0.25));
      return [category, color];
    }));
  }

  function renderScatterLegend(colorMap, contoursShown) {
    refs.chartLegend.replaceChildren();
    appendCategoryLegend(colorMap);
    if (contoursShown) {
      const contour = document.createElement("span"); contour.innerHTML = '<i class="contour-swatch"></i> 50 / 80 / 95% covariance contours';
      refs.chartLegend.append(contour);
    }
  }

  function appendCovarianceContours(svg, points, clipId) {
    if (!state.showContours || points.length < 3) return false;
    const total = points.reduce((sum, point) => sum + point.item.weight, 0);
    const meanX = points.reduce((sum, point) => sum + point.x * point.item.weight, 0) / total;
    const meanY = points.reduce((sum, point) => sum + point.y * point.item.weight, 0) / total;
    const varianceX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2 * point.item.weight, 0) / total;
    const varianceY = points.reduce((sum, point) => sum + (point.y - meanY) ** 2 * point.item.weight, 0) / total;
    const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY) * point.item.weight, 0) / total;
    const trace = varianceX + varianceY;
    const root = Math.sqrt(Math.max(0, ((varianceX - varianceY) / 2) ** 2 + covariance ** 2));
    const eigenA = trace / 2 + root;
    const eigenB = trace / 2 - root;
    if (!(eigenA > 0) || !(eigenB > 0)) return false;
    const angle = Math.atan2(2 * covariance, varianceX - varianceY) * 90 / Math.PI;
    const group = svgElement("g", { "clip-path": `url(#${clipId})` });
    [0.95, 0.8, 0.5].forEach((probability, index) => {
      const radius = Math.sqrt(-2 * Math.log(1 - probability));
      group.append(svgElement("ellipse", {
        cx: meanX, cy: meanY, rx: radius * Math.sqrt(eigenA), ry: radius * Math.sqrt(eigenB),
        transform: `rotate(${angle} ${meanX} ${meanY})`, class: "covariance-contour",
        opacity: [0.35, 0.55, 0.8][index], "stroke-dasharray": index === 2 ? "" : "5 4",
      }));
    });
    svg.append(group);
    return true;
  }

  function renderScatter() {
    const variable = scatterVariables[state.scatterX];
    const items = selectedRows().filter((item) => {
      const value = item.row[state.scatterX];
      return value != null && Number.isFinite(value) && (!variable.logarithmic || value > 0);
    });
    const svg = refs.chart;
    svg.replaceChildren();
    $("#chart-description").textContent = `A scatterplot of annual compensation against ${variable.label.toLowerCase()}.`;
    const width = Math.max(520, refs.chartWrap.clientWidth || 720);
    const height = Math.max(290, refs.chartWrap.clientHeight || 340);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 14, right: 18, bottom: 50, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (!items.length) {
      const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#52879E", "font-size": 13 });
      empty.textContent = `No selected organizations report ${variable.label.toLowerCase()}.`;
      svg.append(empty); refs.chartLegend.replaceChildren();
      refs.statN.textContent = "0"; refs.statNeff.textContent = "0"; refs.statCenter.textContent = "—";
      return;
    }
    const xTransform = (value) => variable.logarithmic ? Math.log(value) : value;
    const transformedX = items.map((item) => xTransform(item.row[state.scatterX]));
    const salaries = items.map((item) => item.value);
    const paddedDomain = (values, minimumPadding) => {
      const low = Math.min(...values); const high = Math.max(...values);
      const padding = Math.max((high - low) * 0.08, minimumPadding);
      return [low - padding, high + padding];
    };
    const [xMin, xMax] = paddedDomain(transformedX, variable.logarithmic ? 0.08 : 1);
    const [rawYMin, rawYMax] = paddedDomain(salaries, 25_000);
    const yMin = Math.max(0, rawYMin); const yMax = rawYMax;
    const xScale = (value) => margin.left + ((xTransform(value) - xMin) / (xMax - xMin)) * innerWidth;
    const yScale = (value) => margin.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;
    for (let index = 0; index <= 4; index += 1) {
      const yValue = yMin + (index / 4) * (yMax - yMin);
      const y = yScale(yValue);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgElement("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", fill: "#52879E", "font-size": 9 });
      label.textContent = compactMoney(yValue); svg.append(label);
    }
    const plotBottom = margin.top + innerHeight;
    for (let index = 0; index <= 5; index += 1) {
      const transformed = xMin + (index / 5) * (xMax - xMin);
      const value = variable.logarithmic ? Math.exp(transformed) : transformed;
      const x = margin.left + (index / 5) * innerWidth;
      svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4, stroke: "#52879E" }));
      const label = svgElement("text", { x, y: plotBottom + 20, "text-anchor": "middle", fill: "#52879E", "font-size": 9 });
      label.textContent = variable.format(value); svg.append(label);
    }
    const clipId = "scatter-plot-clip";
    const defs = svgElement("defs");
    const clip = svgElement("clipPath", { id: clipId });
    clip.append(svgElement("rect", { x: margin.left, y: margin.top, width: innerWidth, height: innerHeight }));
    defs.append(clip); svg.append(defs);
    const points = items.map((item) => ({ item, x: xScale(item.row[state.scatterX]), y: yScale(item.value) }));
    const contoursShown = appendCovarianceContours(svg, points, clipId);
    const colors = categoryColors(items);
    points.forEach(({ item, x, y }) => {
      const category = String(item.row[state.chartColor] || "Not reported");
      const point = svgElement("circle", {
        cx: x, cy: y, r: clamp(3.5 + Math.sqrt(item.weight), 4, 8), fill: colors.get(category),
        class: `scatter-point${state.focusedId === item.row.id ? " is-focused" : ""}`, tabindex: "0", role: "button",
        "aria-label": `${item.row.organization}, ${money(item.value)}, ${variable.label} ${variable.format(item.row[state.scatterX])}`,
      });
      const detail = `${variable.label}: ${variable.format(item.row[state.scatterX])}<br>${escapeHtml(category)}`;
      point.addEventListener("pointerenter", (event) => showTooltip(event, item, detail));
      point.addEventListener("pointermove", positionTooltip); point.addEventListener("pointerleave", hideTooltip);
      point.addEventListener("click", () => focusRow(item.row.id));
      point.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") focusRow(item.row.id); });
      svg.append(point);
    });
    const xTitle = svgElement("text", { x: margin.left + innerWidth / 2, y: height - 6, "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700 });
    xTitle.textContent = `${variable.label}${variable.logarithmic ? " (log scale)" : ""}`; svg.append(xTitle);
    const yTitle = svgElement("text", { x: 14, y: margin.top + innerHeight / 2, transform: `rotate(-90 14 ${margin.top + innerHeight / 2})`, "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700 });
    yTitle.textContent = `Annual compensation (${DATA.priceBasis})`; svg.append(yTitle);
    renderScatterLegend(colors, contoursShown);
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = compactMoney(distributionQuantile(items, 0.5));
  }

  function renderChart() {
    if (state.view === "scatter") renderScatter(); else renderHistogram();
  }

  function showTooltip(event, item, detail = escapeHtml(item.row.title || item.row.topic || "")) {
    refs.tooltip.innerHTML = `<b>${escapeHtml(item.row.organization)}</b>${money(item.value)} · weight ${item.weight.toFixed(2)}<br>${detail}`;
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
        if (["expenses", "staff", "comparabilityScore", "compensationYear"].includes(state.sortKey)) return row[state.sortKey] ?? -Infinity;
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
      summary.textContent = selected == null ? "All" : selected.size ? `${selected.size} selected` : "None";
      summary.setAttribute("aria-label", `Filter ${key}`);
      const panel = document.createElement("div");
      panel.className = "filter-popover";
      const actions = document.createElement("div");
      actions.className = "filter-actions";
      const allButton = document.createElement("button");
      allButton.type = "button"; allButton.textContent = selected == null ? "Deselect all" : "Select all";
      allButton.addEventListener("click", () => {
        state.filters[key] = selected == null ? new Set() : null;
        buildFilterMenus();
        document.querySelector(`[data-filter-menu="${key}"] details`).open = true;
        renderAll();
      });
      actions.append(allButton);
      const options = document.createElement("div");
      options.className = "filter-options";
      const appendOption = (value, parent = options) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox"; checkbox.checked = selected == null || selected.has(value);
        checkbox.addEventListener("change", () => {
          const next = state.filters[key] == null ? new Set(values) : new Set(state.filters[key]);
          if (checkbox.checked) next.add(value); else next.delete(value);
          state.filters[key] = next.size === values.length ? null : next;
          summary.textContent = state.filters[key] == null ? "All" : next.size ? `${next.size} selected` : "None";
          allButton.textContent = state.filters[key] == null ? "Deselect all" : "Select all";
          renderAll();
        });
        const span = document.createElement("span"); span.textContent = value;
        label.append(checkbox, span); parent.append(label);
      };
      if (key === "title") {
        const grouped = new Map();
        rows().forEach((row) => {
          const group = row.titleGroup || "Other executive titles";
          const value = String(row.title || "Not reported");
          if (!grouped.has(group)) grouped.set(group, new Set());
          grouped.get(group).add(value);
        });
        [...grouped].sort(([a], [b]) => a.localeCompare(b)).forEach(([group, groupSet]) => {
          const groupValues = [...groupSet].sort((a, b) => a.localeCompare(b));
          const wrapper = document.createElement("section"); wrapper.className = "filter-group";
          const groupButton = document.createElement("button"); groupButton.type = "button"; groupButton.className = "filter-group-heading";
          const checkedCount = groupValues.filter((value) => selected == null || selected.has(value)).length;
          groupButton.textContent = `${group} · ${checkedCount}/${groupValues.length}`;
          groupButton.setAttribute("aria-label", `${checkedCount === groupValues.length ? "Deselect" : "Select"} all ${group} titles`);
          groupButton.addEventListener("click", () => {
            const next = state.filters[key] == null ? new Set(values) : new Set(state.filters[key]);
            const allChecked = groupValues.every((value) => next.has(value));
            groupValues.forEach((value) => { if (allChecked) next.delete(value); else next.add(value); });
            state.filters[key] = next.size === values.length ? null : next;
            buildFilterMenus();
            document.querySelector('[data-filter-menu="title"] details').open = true;
            renderAll();
          });
          wrapper.append(groupButton);
          groupValues.forEach((value) => appendOption(value, wrapper));
          options.append(wrapper);
        });
      } else values.forEach((value) => appendOption(value));
      panel.append(actions, options); details.append(summary, panel); container.append(details);
    });
  }

  function renderTable() {
    refs.tableBody.replaceChildren();
    tableRows().forEach((row) => {
      const available = salary(row) != null;
      const tr = document.createElement("tr");
      if (!rowInclusion(row).get(row.id)) tr.classList.add("is-excluded");
      if (!available) tr.classList.add("is-unavailable");
      if (state.focusedId === row.id) tr.classList.add("is-focused");
      tr.dataset.id = row.id;

      const toggleCell = document.createElement("td");
      toggleCell.className = "check-column";
      const toggle = document.createElement("input");
      toggle.type = "checkbox"; toggle.className = "row-toggle"; toggle.checked = available && rowInclusion(row).get(row.id);
      toggle.disabled = !available;
      toggle.setAttribute("aria-label", available ? `Include ${row.organization}` : `${row.organization} has no ${measureLabel(row)} observation`);
      toggle.addEventListener("change", () => { rowInclusion(row).set(row.id, toggle.checked); renderAll(); });
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

      const evidenceType = document.createElement("td");
      evidenceType.className = "evidence-cell"; evidenceType.textContent = row.sourceType || "—";

      const salaryCell = document.createElement("td");
      salaryCell.className = "money-cell"; salaryCell.textContent = compactMoney(salary(row));

      const weightCell = document.createElement("td");
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "10"; weightInput.step = "0.1";
      weightInput.value = rowCustomWeights(row).get(row.id) ?? 1; weightInput.className = "weight-input";
      weightInput.disabled = !available;
      weightInput.title = `Effective weight: ${effectiveWeight(row).toFixed(2)}`;
      weightInput.setAttribute("aria-label", `Custom weight for ${row.organization}`);
      weightInput.addEventListener("change", () => {
        const value = clamp(Number(weightInput.value) || 0, 0, 10);
        rowCustomWeights(row).set(row.id, value);
        if (value === 0) rowInclusion(row).set(row.id, false);
        renderAll();
      });
      weightCell.append(weightInput);

      const comparability = document.createElement("td");
      comparability.className = "number-cell"; comparability.textContent = row.comparabilityScore ?? "—";
      const tier = document.createElement("td"); tier.className = "tier-cell"; tier.title = row.tier || ""; tier.textContent = row.tier || "—";
      const topic = document.createElement("td"); topic.className = "topic-cell"; topic.title = row.topic || ""; topic.textContent = row.topic || "—";
      const expenses = document.createElement("td"); expenses.className = "money-cell"; expenses.textContent = compactMoney(row.expenses);
      const location = document.createElement("td"); location.className = "metadata-cell"; location.textContent = row.location || "—";
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
      tr.append(toggleCell, org, title, evidenceType, salaryCell, expenses, weightCell, comparability, tier, topic, location, staff, ea, structure, year, preview, source);
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
    $("#dialog-measure-label").textContent = measureLabel(row);
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

  function measureLabel(row = null) {
    if (state.stream === "combined") return row && rowStream(row) === "jobAds"
      ? "Posting midpoint, July 2026 USD"
      : row ? "Schedule J base, July 2026 USD" : "Comparable salary proxy, July 2026 USD";
    if (state.stream === "jobAds") return "Posting midpoint, July 2026 USD";
    return { base: "Schedule J base, July 2026 USD", cash: "Part VII cash / W-2 proxy, July 2026 USD", total: "Filing total proxy, July 2026 USD" }[state.measure];
  }

  function renderWeightControls() {
    if (state.stream !== "combined") state.weightings.delete("streamBalanced");
    refs.weightingComponents.forEach((input) => {
      input.checked = state.weightings.has(input.value);
      if (input.value === "streamBalanced") input.disabled = state.stream !== "combined";
    });
    const continuous = ["size", "staff", "recency"];
    refs.sizeControls.hidden = !continuous.some((key) => state.weightings.has(key));
    refs.expenseTargetField.hidden = !state.weightings.has("size");
    refs.staffTargetField.hidden = !state.weightings.has("staff");
    refs.recencyField.hidden = !state.weightings.has("recency");
    const active = [...state.weightings].map((key) => WEIGHT_LABELS[key]);
    refs.weightingDescription.textContent = active.length
      ? `Base weight = ${active.join(" × ")}. Missing continuous values receive a 0.45 multiplier.`
      : "No components selected: equal base weights.";
    const discrete = DISCRETE_WEIGHT_KEYS.filter((key) => state.weightings.has(key));
    refs.discreteWeightEditors.hidden = !discrete.length;
    refs.discreteWeightEditors.replaceChildren();
    discrete.forEach((key) => {
      const weights = ensureDiscreteWeights(key);
      const details = document.createElement("details");
      details.open = discrete.length === 1;
      const summary = document.createElement("summary"); summary.textContent = `${WEIGHT_LABELS[key]} category multipliers`;
      const grid = document.createElement("div"); grid.className = "discrete-weight-grid";
      Object.keys(weights).sort((a, b) => a.localeCompare(b)).forEach((category) => {
        const label = document.createElement("label"); label.textContent = category; label.title = category;
        const input = document.createElement("input");
        input.type = "number"; input.min = "0"; input.max = "10"; input.step = "0.05"; input.value = weights[category];
        input.setAttribute("aria-label", `${WEIGHT_LABELS[key]} multiplier for ${category}`);
        input.addEventListener("change", () => {
          weights[category] = clamp(Number(input.value) || 0, 0, 10);
          input.value = weights[category];
          renderAll();
        });
        grid.append(label, input);
      });
      details.append(summary, grid); refs.discreteWeightEditors.append(details);
    });
  }

  function componentResponse(key, value) {
    if (key === "comparability") return clamp(value / 75, 0.25, 1.75);
    if (key === "size") return Math.exp(-0.5 * (Math.log(value / state.targetExpense) / state.expenseBandwidth) ** 2);
    if (key === "staff") return Math.exp(-0.5 * (Math.log(value / state.targetStaff) / state.staffBandwidth) ** 2);
    const latestYear = Math.max(...rows().map((row) => row.compensationYear || 0));
    return 0.5 ** (Math.max(0, latestYear - value) / state.recencyHalfLife);
  }

  function renderWeightProfiles() {
    const keys = ["comparability", "size", "staff", "recency"].filter((key) => state.weightings.has(key));
    refs.weightProfile.hidden = !keys.length;
    refs.rpScaleReference.hidden = !keys.some((key) => key === "size" || key === "staff");
    refs.weightProfileGrid.replaceChildren();
    keys.forEach((key) => {
      let values;
      let format;
      let logarithmic = false;
      let parameter;
      let axisTitle;
      if (key === "comparability") {
        values = [0, 100]; format = (value) => value.toFixed(0); parameter = "Score ÷ 75, capped at 0.25–1.75";
        axisTitle = "Match score (0–100)";
      } else if (key === "size") {
        values = rows().map((row) => row.expenses).filter((value) => value > 0); format = compactMoney; logarithmic = true;
        parameter = `Target ${compactMoney(state.targetExpense)} · bandwidth ${state.expenseBandwidth.toFixed(2)}`;
        axisTitle = "Annual expenses (USD, log scale)";
      } else if (key === "staff") {
        values = rows().map((row) => row.staff).filter((value) => value > 0); format = (value) => Math.round(value).toLocaleString(); logarithmic = true;
        parameter = `Target ${state.targetStaff.toLocaleString()} · bandwidth ${state.staffBandwidth.toFixed(2)}`;
        axisTitle = "Staff count (log scale)";
      } else {
        values = rows().map((row) => row.compensationYear).filter((value) => value > 0); format = (value) => value.toFixed(0);
        parameter = `${state.recencyHalfLife.toFixed(1)}-year half-life`;
        axisTitle = "Evidence year";
      }
      if (!values.length) return;
      const rawMin = Math.min(...values); const rawMax = Math.max(...values);
      const domainMin = logarithmic ? Math.log(rawMin) : rawMin;
      const domainMax = logarithmic ? Math.log(rawMax) : rawMax;
      const domainSpan = Math.max(domainMax - domainMin, 1);
      const width = 220; const height = 140; const margin = { top: 7, right: 8, bottom: 38, left: 43 };
      const innerWidth = width - margin.left - margin.right; const innerHeight = height - margin.top - margin.bottom;
      const samples = Array.from({ length: 81 }, (_, index) => {
        const transformed = domainMin + (index / 80) * domainSpan;
        const value = logarithmic ? Math.exp(transformed) : transformed;
        return { value, weight: componentResponse(key, value), x: margin.left + (index / 80) * innerWidth };
      });
      const maxWeight = Math.max(1, ...samples.map((sample) => sample.weight)) * 1.08;
      const y = (weight) => margin.top + innerHeight - (weight / maxWeight) * innerHeight;
      const figure = document.createElement("div"); figure.className = "weight-profile-figure";
      const title = document.createElement("strong"); title.textContent = WEIGHT_LABELS[key];
      const description = document.createElement("span"); description.textContent = parameter;
      const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${WEIGHT_LABELS[key]} relative weight-response curve` });
      const xTicks = Array.from({ length: 4 }, (_, index) => {
        const ratio = index / 3;
        const transformed = domainMin + ratio * domainSpan;
        return { ratio, value: logarithmic ? Math.exp(transformed) : transformed };
      });
      const yTicks = Array.from({ length: 4 }, (_, index) => (index / 3) * maxWeight);
      yTicks.forEach((tick) => {
        const tickY = y(tick);
        svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: tickY, y2: tickY, class: "weight-profile-grid-line" }));
        const label = svgElement("text", { x: margin.left - 5, y: tickY + 3, "text-anchor": "end", class: "weight-profile-label weight-profile-y-tick" });
        label.textContent = tick < 0.05 ? "0" : tick.toFixed(1); svg.append(label);
      });
      xTicks.forEach(({ ratio, value }, index) => {
        const tickX = margin.left + ratio * innerWidth;
        svg.append(svgElement("line", { x1: tickX, x2: tickX, y1: margin.top + innerHeight, y2: margin.top + innerHeight + 4, class: "weight-profile-axis" }));
        const label = svgElement("text", {
          x: tickX, y: margin.top + innerHeight + 14,
          "text-anchor": index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle",
          class: "weight-profile-label weight-profile-x-tick",
        });
        label.textContent = format(value); svg.append(label);
      });
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: margin.top + innerHeight, y2: margin.top + innerHeight, class: "weight-profile-axis" }));
      svg.append(svgElement("line", { x1: margin.left, x2: margin.left, y1: margin.top, y2: margin.top + innerHeight, class: "weight-profile-axis" }));
      const target = key === "size" ? state.targetExpense : key === "staff" ? state.targetStaff : key === "recency" ? rawMax : null;
      if (target != null && target >= rawMin && target <= rawMax) {
        const targetPosition = logarithmic ? Math.log(target) : target;
        const targetX = margin.left + ((targetPosition - domainMin) / domainSpan) * innerWidth;
        svg.append(svgElement("line", { x1: targetX, x2: targetX, y1: margin.top, y2: margin.top + innerHeight, class: "weight-profile-target" }));
      }
      const path = samples.map((sample, index) => `${index ? "L" : "M"}${sample.x.toFixed(2)},${y(sample.weight).toFixed(2)}`).join("");
      svg.append(svgElement("path", { d: path, class: "weight-profile-curve" }));
      const xTitle = svgElement("text", { x: margin.left + innerWidth / 2, y: height - 2, "text-anchor": "middle", class: "weight-profile-axis-title" });
      xTitle.textContent = axisTitle;
      const yTitle = svgElement("text", {
        x: 10, y: margin.top + innerHeight / 2, transform: `rotate(-90 10 ${margin.top + innerHeight / 2})`,
        "text-anchor": "middle", class: "weight-profile-axis-title",
      });
      yTitle.textContent = "Relative multiplier";
      svg.append(xTitle, yTitle); figure.append(title, description, svg); refs.weightProfileGrid.append(figure);
    });
  }

  function updateHeadings() {
    const isJobs = state.stream === "jobAds";
    const isCombined = state.stream === "combined";
    refs.measureField.hidden = isJobs || isCombined;
    refs.chartKicker.textContent = isCombined ? "Combined public evidence" : isJobs ? "Recruitment evidence" : "Incumbent compensation";
    refs.chartTitle.textContent = isCombined
      ? "Schedule J base salaries + posting midpoints"
      : isJobs
        ? "Validated CEO / ED posting midpoints"
        : { base: "Validated Schedule J base salaries", cash: "Validated Part VII cash / W-2 proxies", total: "Validated filing total compensation" }[state.measure];
    refs.statNUnit.textContent = isCombined ? "observations" : "organizations";
    refs.scatterControls.hidden = state.view !== "scatter";
    refs.binField.hidden = state.view !== "histogram";
    refs.sampleDescription.textContent = {
      primary: "Rows retained as primary after source validation and role-structure review.",
      clean: "Primary rows with no structural compensation or leadership flags.",
      tierA: "The narrowest peer definition: incumbent Tier A or job-ad strict-primary rows.",
      observed: "Every row with a usable salary value, including broader sensitivity cases.",
    }[state.sample];
    refs.colorDescription.textContent = {
      tier: "A / strict-primary is narrowest; B / secondary is broader; C / expanded is mainly a sensitivity set.",
      topic: "Mission or operating-model category coded during peer selection.",
      eaAffinity: "Degree of effective-altruist alignment or functional adjacency coded before compensation review.",
      sourceType: "Distinguishes realized Form 990 compensation from advertised job-posting midpoints.",
      titleGroup: "A broad grouping used only for navigation; displayed job titles remain source-native.",
      structure: "Leadership or organizational-structure coding from the validation record.",
    }[state.chartColor];
    refs.methodNoteTitle.textContent = isCombined ? "Combined-evidence caution" : "Interpretation";
    refs.methodNoteText.textContent = isCombined
      ? "This view pools incumbent Schedule J base pay with job-ad salary midpoints. Both are July 2026 USD salary proxies, but one is realized pay and the other an advertised range midpoint. Use evidence-stream coloring, filtering, or balanced weighting to test that assumption; an ‘all compensation measures’ pool is intentionally not offered because it would duplicate correlated values from each filing."
      : "Empirical, lognormal, and gamma summaries describe the selected convenience sample. They are sensitivity tools—not population estimates.";
    refs.expenseBandwidthValue.value = `${state.expenseBandwidth.toFixed(2)}×`;
    refs.staffBandwidthValue.value = `${state.staffBandwidth.toFixed(2)}×`;
    refs.recencyHalfLifeValue.value = `${state.recencyHalfLife.toFixed(1)} years`;
    refs.binValue.value = state.bins;
  }

  function renderAll() {
    updateHeadings();
    renderWeightProfiles();
    renderChart();
    renderQuantiles();
    renderTable();
  }

  function reset() {
    Object.assign(state, {
      stream: "incumbents", measure: "base", sample: "primary", fit: "lognormal", weightings: new Set(), discreteWeights: {},
      targetExpense: 7_500_000, targetStaff: 57, expenseBandwidth: 0.7, staffBandwidth: 0.7, recencyHalfLife: 4,
      bins: 20, autoBins: true, view: "histogram", scatterX: "expenses", chartColor: "tier", showContours: true,
      quantileGranularity: "quintiles", customQuantiles: "5, 25, 50, 75, 95",
      sortKey: "organization", sortDirection: "asc",
      filters: {
        title: null, sourceType: null, tier: null, topic: null, location: null,
        eaAffinity: null, structure: null,
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
    refs.view.forEach((radio) => { radio.checked = radio.value === state.view; });
    refs.scatterX.value = state.scatterX; refs.chartColor.value = state.chartColor; refs.showContours.checked = true;
    refs.targetExpense.value = 7.5; refs.targetStaff.value = 57;
    refs.expenseBandwidth.value = 0.7; refs.staffBandwidth.value = 0.7; refs.recencyHalfLife.value = 4; refs.bins.value = state.bins;
    refs.quantileGranularity.value = "quintiles";
    refs.customQuantiles.value = state.customQuantiles; refs.showUnavailable.checked = false;
    applyPreset(); configureRanges(); buildFilterMenus(); renderWeightControls();
    renderAll();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  refs.stream.addEventListener("change", () => {
    state.stream = refs.stream.value; state.focusedId = ""; state.autoBins = true; state.showUnavailable = false;
    if (state.stream === "combined") { state.measure = "base"; refs.measure.value = "base"; }
    state.filters = {
      title: null, sourceType: null, tier: null, topic: null, location: null,
      eaAffinity: null, structure: null,
    };
    refs.showUnavailable.checked = false;
    applyPreset(); configureRanges(); buildFilterMenus(); renderWeightControls(); renderAll();
  });
  refs.measure.addEventListener("change", () => {
    state.measure = refs.measure.value; state.focusedId = ""; state.autoBins = true;
    applyPreset(); configureRanges(); renderAll();
  });
  refs.sample.addEventListener("change", () => { state.sample = refs.sample.value; applyPreset(); renderAll(); });
  refs.fit.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.fit = radio.value; renderAll(); } }));
  refs.weightingComponents.forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.weightings.add(input.value); else state.weightings.delete(input.value);
    renderWeightControls(); renderAll();
  }));
  refs.targetExpense.addEventListener("change", () => { state.targetExpense = clamp(Number(refs.targetExpense.value) || 7.5, 1, 100) * 1_000_000; renderAll(); });
  refs.targetStaff.addEventListener("change", () => { state.targetStaff = clamp(Number(refs.targetStaff.value) || 57, 1, 1000); renderAll(); });
  refs.expenseBandwidth.addEventListener("input", () => { state.expenseBandwidth = Number(refs.expenseBandwidth.value); renderAll(); });
  refs.staffBandwidth.addEventListener("input", () => { state.staffBandwidth = Number(refs.staffBandwidth.value); renderAll(); });
  refs.recencyHalfLife.addEventListener("input", () => { state.recencyHalfLife = Number(refs.recencyHalfLife.value); renderAll(); });
  refs.bins.addEventListener("input", () => { state.autoBins = false; state.bins = Number(refs.bins.value); renderAll(); });
  refs.quantileGranularity.addEventListener("change", () => { state.quantileGranularity = refs.quantileGranularity.value; renderQuantiles(); });
  refs.customQuantiles.addEventListener("input", () => { state.customQuantiles = refs.customQuantiles.value; renderQuantiles(); });
  refs.view.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.view = radio.value; renderAll(); } }));
  refs.scatterX.addEventListener("change", () => { state.scatterX = refs.scatterX.value; renderChart(); });
  refs.chartColor.addEventListener("change", () => { state.chartColor = refs.chartColor.value; renderAll(); });
  refs.showContours.addEventListener("change", () => { state.showContours = refs.showContours.checked; renderChart(); });
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
  renderWeightControls();
  initializeHelpTooltips();
  renderAll();
})();
