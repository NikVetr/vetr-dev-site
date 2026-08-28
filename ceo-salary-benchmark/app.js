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
  const RP_REFERENCE = Object.freeze({ expenses: 7_500_000, staff: 57 });
  const COMPOSITE_SCORE_TOOLTIP = "Auto-weights uses the frozen 0–100 non-pay composite, which combines functional/operating-model similarity (30 points), expenses or budget (25), staff count (15), EA affinity (20), CEO structure and independence (7), and geographic/labor-market relevance (3). If staff is missing, available components are renormalized. It was assigned without using compensation. The app converts it to a multiplier of score ÷ 75, capped at 0.25–1.75, before normalizing total weights to mean 1. Select Auto-weights instead of its individual component weights to avoid double-counting those dimensions.";

  const state = {
    stream: "combined",
    measure: "base",
    inflationAdjusted: true,
    sample: "primary",
    fit: "lognormal",
    weightings: new Set(),
    discreteWeights: {},
    targetExpense: RP_REFERENCE.expenses,
    targetStaff: RP_REFERENCE.staff,
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
    markCurve: true,
    sortKey: "tier",
    sortDirection: "asc",
    filters: {
      title: null, sourceType: null, tier: null, topic: null, location: null,
      eaAffinity: null, structure: null,
    },
    ranges: {
      salary: { min: null, max: null, low: null, high: null },
      expenses: { min: null, max: null, low: null, high: null },
    },
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
  const modifiedWeightIds = {
    incumbents: new Set(),
    jobAds: new Set(),
  };
  const wikipediaCache = new Map();
  let organizationPreviewHideTimer = 0;
  let helpTooltipGlobalListenersBound = false;

  const refs = {
    stream: $("#stream-select"), measure: $("#measure-select"), measureField: $("#measure-field"),
    dollarBasis: [...document.querySelectorAll('input[name="dollar-basis"]')], priceBasisStatus: $("#price-basis-status"),
    sample: $("#sample-select"), fit: [...document.querySelectorAll('input[name="distribution"]')],
    weightingComponents: [...document.querySelectorAll('.weighting-field input[type="checkbox"]')],
    sizeControls: $("#size-controls"), expenseTargetField: $("#expense-target-field"), staffTargetField: $("#staff-target-field"),
    recencyField: $("#recency-field"), targetExpense: $("#target-expense"), targetStaff: $("#target-staff"),
    expenseBandwidth: $("#expense-bandwidth"), staffBandwidth: $("#staff-bandwidth"), recencyHalfLife: $("#recency-halflife"),
    expenseBandwidthValue: $("#expense-bandwidth-value"), staffBandwidthValue: $("#staff-bandwidth-value"),
    recencyHalfLifeValue: $("#recency-halflife-value"), discreteWeightEditors: $("#discrete-weight-editors"),
    binField: $("#bin-field"), bins: $("#bin-count"), binValue: $("#bin-value"),
    view: [...document.querySelectorAll('input[name="chart-view"]')], scatterControls: $("#scatter-controls"),
    scatterX: $("#scatter-x"), chartColor: $("#chart-color"), colorDescription: $("#color-description"), showContours: $("#show-contours"),
    comparabilityProfileField: $("#comparability-profile-field"),
    weightProfileSlots: new Map(["comparability", "size", "staff", "recency"].map((key) => [key, $(`#weight-profile-${key}`)])),
    rpScaleReference: $("#rp-scale-reference"),
    reset: $("#reset-settings"), chart: $("#salary-chart"), chartWrap: $("#chart-wrap"),
    tooltip: $("#chart-tooltip"), chartTitle: $("#chart-title"), scatterCorrelations: $("#scatter-correlations"),
    statN: $("#stat-n"), statNUnit: $("#stat-n-unit"), statNeff: $("#stat-neff"), statCenter: $("#stat-center"),
    quantileGranularity: $("#quantile-granularity"), markCurve: $("#mark-curve"), quantileGrid: $("#quantile-grid"),
    customQuantilesField: $("#custom-quantiles-field"), customQuantiles: $("#custom-quantiles"),
    customQuantilesError: $("#custom-quantiles-error"), chartLegend: $("#chart-legend"),
    quantileBasis: $("#quantile-basis"), sampleDescription: $("#sample-description"),
    weightingDescription: $("#weighting-description"),
    salaryMin: $("#salary-range-min"), salaryMax: $("#salary-range-max"), salaryRangeValue: $("#salary-range-value"),
    salaryFilterSummary: $("#salary-filter-summary"), salaryFilterStatus: $("#salary-filter-status"),
    expenseMin: $("#expense-range-min"), expenseMax: $("#expense-range-max"), expenseRangeValue: $("#expense-range-value"),
    expenseFilterSummary: $("#expense-filter-summary"), expenseFilterStatus: $("#expense-filter-status"),
    tableScroll: $(".table-scroll"),
    tableBody: $("#organization-table tbody"), dialog: $("#source-dialog"),
    helpTooltip: $("#help-tooltip"), organizationPreview: $("#organization-preview"),
    urlStateError: $("#url-state-error"),
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
  function rowModifiedWeights(row) { return modifiedWeightIds[rowStream(row)]; }

  const DISCRETE_WEIGHT_KEYS = ["tier", "eaAffinity", "sourceType", "topic", "titleGroup", "structure"];
  const WEIGHT_LABELS = {
    comparability: "Auto-weights", size: "Expense similarity", staff: "Staff similarity", recency: "Evidence recency",
    tier: "Tier", eaAffinity: "EA relation", sourceType: "Evidence stream", topic: "Topic / model",
    titleGroup: "Job-title group", structure: "Structure", streamBalanced: "50/50 evidence-stream balance",
  };
  const DISCRETE_WEIGHT_NOTES = {
    tier: "Suggested values follow the peer hierarchy: narrow primary peers receive full weight; broader, structural, and excluded sensitivity tiers receive progressively less.",
    eaAffinity: "Suggested values favor EA-core and EA-adjacent organizations, moderately weight functional-only peers, and leave uncoded observations neutral.",
    sourceType: "Suggested values give filed incumbent compensation full weight and advertised salary midpoints slightly less weight because they are offers rather than realized pay.",
    topic: "Suggested values favor RP cause areas and research, evidence, evaluation, policy, or advisory work; delivery-only, grantmaking, and structurally dissimilar settings receive less.",
    titleGroup: "Suggested values give CEO roles full weight, then moderately step down Executive Director, President, other executive, and unreported titles.",
    structure: "Suggested values favor independent, board-accountable nonprofits; affiliates, fiscally sponsored projects, unclear structures, and subordinate roles receive less.",
  };

  function defaultDiscreteWeight(key, value) {
    const normalized = String(value || "").toLowerCase();
    if (key === "tier") {
      if (normalized === "a" || normalized.includes("strict_primary") || normalized.includes("strict-primary")) return 1;
      if (normalized.includes("expanded_primary")) return 0.85;
      if (normalized === "b" || normalized === "secondary") return 0.7;
      if (normalized.includes("secondary_structural")) return 0.4;
      if (normalized.includes("secondary_scale_unknown")) return 0.45;
      if (normalized.includes("secondary_scale")) return 0.55;
      if (normalized.includes("expanded_broad")) return 0.35;
      if (normalized.includes("date_ambiguity")) return 0.3;
      if (normalized.includes("older_structural")) return 0.25;
      if (normalized.includes("fractional")) return 0.2;
      if (normalized.includes("excluded")) return 0.1;
      return normalized === "c" ? 0.35 : 0.5;
    }
    if (key === "eaAffinity") {
      if (normalized.includes("not coded") || normalized.includes("not reported")) return 1;
      if (normalized.includes("core") || normalized.includes("aligned")) return 1;
      if (normalized.includes("adjacent")) return 0.85;
      return normalized.includes("functional") ? 0.65 : 0.6;
    }
    if (key === "sourceType") return normalized.includes("form 990") ? 1 : normalized.includes("job posting") ? 0.8 : 0.7;
    if (key === "titleGroup") {
      if (normalized === "ceo" || normalized.includes("chief executive")) return 1;
      if (normalized.includes("executive director")) return 0.85;
      if (normalized.includes("president") || normalized.includes("co-lead")) return 0.75;
      if (normalized.includes("not reported")) return 0.35;
      return 0.6;
    }
    if (key === "structure") {
      if (normalized.includes("independent nonprofit") || normalized === "board of directors" || normalized.includes("board of trustees") || normalized.includes("joint board") || normalized.includes("board (implied")) return 1;
      if (normalized.includes("boards of the affiliated")) return 0.85;
      if (normalized.includes("membership nonprofit")) return normalized.includes("fiscal sponsor") ? 0.55 : 0.75;
      if (normalized.includes("fiscal") || normalized.includes("international nonprofit affiliate")) return 0.55;
      if (normalized.includes("nonprofit/project")) return 0.65;
      if (normalized.includes("advisory board")) return 0.7;
      if (normalized.includes("chief operating officer")) return 0.35;
      if (normalized.includes("not extracted") || normalized.includes("not reported")) return 0.6;
      return 0.7;
    }
    if (key === "topic") {
      if (/animal welfare|global health|catastrophic risk|biosecurity|ai,|ea infrastructure|effective giving/.test(normalized)) return 1;
      if (/grantmaking foundation|community foundation|private health foundation|endowment/.test(normalized)) return 0.45;
      if (/university|regional program leadership|direct program delivery|public-facing cultural|local investigative/.test(normalized)) return 0.55;
      if (/research|evaluation|evidence|science|data|policy|advisory|think-and-do|think tank/.test(normalized)) return 0.9;
      if (/field-building|membership|knowledge/.test(normalized)) return 0.75;
      return normalized.includes("not reported") ? 0.6 : 0.65;
    }
    return 1;
  }

  function discreteWeightExplanation(key, category) {
    const definition = categoryDefinition(key, category);
    if (definition) {
      const provenance = definition.provenanceType.replaceAll("_", " ").replaceAll(" + ", "; ");
      const caveat = definition.caveats ? ` Caveat: ${definition.caveats}` : "";
      return `${definition.shortDefinition}: ${definition.operationalRule}${caveat} Provenance: ${provenance}; ${definition.confidence || "unspecified"} confidence. App sensitivity multiplier: ${defaultDiscreteWeight(key, category).toFixed(2)} (editable analyst judgment, not a source rule).`;
    }
    const normalized = String(category || "Not reported").toLowerCase();
    let explanation;
    if (key === "tier") {
      if (normalized === "a") explanation = "Tier A is the principal expanded peer tier: generally score ≥75, functional score ≥20, a clean organization-wide chief executive, comparable scale, and no dominant structural exclusion.";
      else if (normalized === "b") explanation = "Tier B is a useful secondary peer: generally score ≥62 with strong EA affinity, or ≥68 for a functional-only peer, with one meaningful scale, model, geography, or structure deviation.";
      else if (normalized === "c") explanation = "Tier C is a broad robustness tier: generally score ≥52 with a usable chief-executive observation but a weaker scale, operating-model, or geographic match.";
      else if (normalized === "strict_primary") explanation = "Strict-primary postings describe a current, full-time organization-wide CEO or ED with board accountability, an RP-like knowledge-sector role, and generally $5M–$20M core scale or 25–100 staff.";
      else if (normalized.includes("expanded_primary")) explanation = "Expanded-primary postings retain a strong organization-wide leadership match but relax a title, mission-mix, or close-fit requirement from the strict-primary posting set.";
      else if (normalized.includes("scale_unknown")) explanation = "This expanded secondary subtype has a useful role or functional match, but accessible evidence did not establish operating scale.";
      else if (normalized.includes("scale")) explanation = "This subtype is broader because budget, expenses, or staff differ materially from RP's $7.5M and 57-FTE core anchors.";
      else if (normalized.includes("structural")) explanation = "This subtype is broader because governance, affiliation, fiscal sponsorship, grantmaking, or multi-entity leadership differs from RP's organization-wide CEO structure.";
      else if (normalized.includes("broad_functional")) explanation = "This expanded subtype is included mainly for functional sensitivity: some duties overlap with RP, but the mission or operating model is less direct.";
      else if (normalized.includes("date_ambiguity")) explanation = "The posting's publication and process dates conflict, so it is retained only as a date-ambiguity sensitivity.";
      else if (normalized.includes("older_structural")) explanation = "This is an older posting with a material structural difference and is retained only for sensitivity testing.";
      else if (normalized.includes("fractional")) explanation = "The role is fractional or otherwise not a standard full-time organization-wide chief executive, so it is sensitivity evidence only.";
      else if (normalized.includes("excluded_grantmaking")) explanation = "Excluded because grantmaking or pass-through stewardship dominates the operating model rather than RP-like knowledge production.";
      else if (normalized.includes("excluded_private_foundation")) explanation = "Excluded because private-foundation governance, endowment, and grantmaking responsibilities are not directly comparable with RP's public-charity operating model.";
      else if (normalized.includes("excluded_subordinate_regional")) explanation = "Excluded because the advertised role leads a regional unit beneath a parent organization rather than the whole organization.";
      else if (normalized.includes("excluded")) explanation = "Excluded from the primary peer set after applying preregistered non-pay criteria such as role scope, operating model, scale, structure, geography, or source adequacy.";
      else if (normalized.includes("secondary")) explanation = "Secondary postings are useful comparators with one meaningful scale, operating-model, geography, or structure deviation from the strict-primary criteria.";
      else explanation = "This is a source-native peer tier assigned under the frozen function, scale, role, structure, geography, and source-quality rules.";
      explanation += " Tiering was determined without using the observed compensation.";
    } else if (key === "eaAffinity") {
      if (normalized.includes("core")) explanation = "EA-core means an explicit effective-altruism organization or project. The frozen comparability score assigned this category 20 of 20 EA-affinity points.";
      else if (normalized.includes("adjacent")) explanation = "EA-adjacent means a publicly EA-linked organization, or a prominent organization in an EA-recommended or evaluated cause area, without being classified as EA-core. It received 14 of 20 EA-affinity points.";
      else if (normalized.includes("functional")) explanation = "Functional-only means no meaningful EA relationship was required, but the organization uses evidence-first research, evaluation, policy, advisory, or related methods. It received 7 of 20 EA-affinity points.";
      else explanation = "Not coded means the benchmark did not assign an EA-affinity category. It is not evidence that the organization has no EA relationship, so the suggested weight is neutral.";
      explanation += " This coding was frozen or verified independently of compensation.";
    } else if (key === "sourceType") {
      explanation = normalized.includes("form 990")
        ? "Form 990 denotes realized incumbent compensation reported in a nonprofit filing. It is historical and measure-specific; Part VII cash is not automatically exact base salary."
        : "Job posting denotes the inflation-adjusted midpoint of an advertised base-salary range. It is forward-looking offer evidence, not realized compensation.";
    } else if (key === "titleGroup") {
      if (normalized === "ceo") explanation = "CEO groups Chief Executive Officer variants and most directly matches RP's organization-wide chief-executive role.";
      else if (normalized.includes("executive director")) explanation = "Executive Director can be the organization-wide top executive, but the title is less consistent across nonprofits and sometimes denotes a narrower role.";
      else if (normalized.includes("president")) explanation = "President includes President/CEO and source-native President titles; comparability depends on whether the person is clearly the organization-wide top executive.";
      else if (normalized.includes("not reported")) explanation = "The preserved record did not provide a usable title group, so role comparability cannot be confirmed from this field.";
      else explanation = "Other executive titles contain source-native leadership roles outside the main CEO, Executive Director, and President groupings; their authority and scope are less uniform.";
    } else if (key === "structure") {
      const structures = {
        "independent nonprofit": "A separate nonprofit legal organization with its own governance; the cleanest structural comparator to RP.",
        "board of directors": "The posting explicitly makes the organization-wide executive accountable to a fiduciary board of directors.",
        "board of trustees": "The organization-wide executive reports to a fiduciary board called trustees; treated similarly to a board of directors.",
        "board (implied by full position description)": "Board accountability is strongly implied by the complete role description, although the reporting line is not stated verbatim.",
        "joint board": "One executive is accountable to a combined or joint governing board; broadly comparable, but potentially more complex than a single-board organization.",
        "boards of h-cap and h-cap education association": "The executive spans two related legal entities and their boards, adding multi-entity governance complexity.",
        "boards of the affiliated organizations": "The executive leads a family of affiliated organizations and reports across multiple boards rather than one standalone nonprofit.",
        "advisory board": "An advisory board guides the role but may lack the fiduciary authority of an independent nonprofit board, often in a fiscally sponsored setting.",
        "president of hopewell fund; advisory board": "The role sits within a fiscal sponsor, with accountability to the sponsor's president and an advisory board rather than an independent fiduciary board.",
        "fiscal sponsor / membership nonprofit": "The organization combines membership governance with fiscal-sponsorship responsibilities, so pass-through and hosted-project activity may differ from RP's core operations.",
        "membership nonprofit": "Governance and executive accountability are materially shaped by an institutional or professional membership base.",
        "international nonprofit affiliate": "The entity is an affiliate within an international nonprofit network rather than a fully standalone organization.",
        "nonprofit or fiscally sponsored": "Accessible evidence did not resolve whether the organization is legally independent or operates under a fiscal sponsor.",
        "nonprofit/project": "The record describes a nonprofit or project-like entity but does not establish a clean standalone governance structure.",
        "chief operating officer": "The executive reports to a Chief Operating Officer and is therefore not the organization-wide top executive.",
        "not extracted": "The preserved evidence did not yield a reliable governance or reporting structure; this is missing information, not an affirmative structure classification.",
      };
      explanation = structures[normalized] || "This is the source-derived governance, legal-entity, or executive-reporting structure used to assess whether the role is a clean organization-wide comparator.";
    } else {
      const weight = defaultDiscreteWeight(key, category);
      let rationale = "It is a source-derived mission and operating-model category used to assess functional similarity to RP.";
      if (weight === 1) rationale += " It directly overlaps an RP cause area or evidence-oriented priority and receives the reference suggestion.";
      else if (weight >= 0.9) rationale += " It strongly overlaps research, evaluation, evidence, science, policy, data, or advisory work.";
      else if (weight >= 0.75) rationale += " It has a useful field-building, membership, or knowledge role, with a moderate operating-model difference.";
      else if (weight <= 0.45) rationale += " Grantmaking, foundation, or endowment activity is materially less comparable with RP's knowledge-production model.";
      else if (weight <= 0.55) rationale += " Delivery, university, regional, cultural, or local-service features make it a broader functional comparator.";
      else rationale += " It has partial functional overlap but a less direct mission or operating-model match.";
      explanation = `${rationale} Topic coding was determined without using compensation.`;
    }
    return `${explanation} App sensitivity multiplier: ${defaultDiscreteWeight(key, category).toFixed(2)}; 1.00 is the reference. This editable value is an analyst judgment, not a source rule.`;
  }

  function categoryDefinition(key, category) {
    const fields = {
      tier: ["reference_tier", "tier"],
      eaAffinity: ["ea_affinity", "ea_relationship"],
      structure: ["expected_structure"],
      topic: ["topic_cluster"],
      titleGroup: ["title_group"],
    }[key] || [];
    const value = String(category || "Not reported");
    const candidates = value.toLowerCase() === "not coded" ? [value, "uncoded"] : [value];
    for (const field of fields) {
      for (const candidate of candidates) {
        const definition = DATA.categoryExplainers?.definitions?.[field]?.[candidate];
        if (definition) return definition;
      }
    }
    return null;
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

  function initializeHelpTooltips(root = document) {
    root.querySelectorAll(".info-tooltip[data-tooltip]").forEach((trigger) => {
      if (trigger.dataset.tooltipBound === "true") return;
      trigger.dataset.tooltipBound = "true";
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
    if (!helpTooltipGlobalListenersBound) {
      window.addEventListener("resize", () => { refs.helpTooltip.hidden = true; });
      window.addEventListener("scroll", () => { refs.helpTooltip.hidden = true; }, true);
      helpTooltipGlobalListenersBound = true;
    }
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
    const values = state.inflationAdjusted ? row.salary : row.nominalSalary;
    if (rowStream(row) === "jobAds" || state.stream === "combined") return values?.base ?? null;
    return values?.[state.measure] ?? null;
  }

  function salaryRange(row) {
    if (rowStream(row) !== "jobAds") return null;
    return state.inflationAdjusted ? row.range : row.nominalRange;
  }

  function priceBasisLabel() {
    return state.inflationAdjusted ? DATA.priceBasis : "Source-year USD";
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

  function weightedSelection() {
    const selected = rows()
      .filter((row) => passesFilters(row) && salary(row) != null && rowInclusion(row).get(row.id))
      .map((row) => ({ row, value: salary(row), rawWeight: baseWeight(row) * (rowCustomWeights(row).get(row.id) ?? 1) }))
      .filter((item) => item.rawWeight > 0 && Number.isFinite(item.rawWeight));
    if (state.weightings.has("streamBalanced") && state.stream === "combined") {
      const streamTotals = new Map();
      selected.forEach((item) => streamTotals.set(rowStream(item.row), (streamTotals.get(rowStream(item.row)) || 0) + item.rawWeight));
      selected.forEach((item) => { item.rawWeight /= streamTotals.get(rowStream(item.row)) || 1; });
    }
    const mean = selected.length ? selected.reduce((sum, item) => sum + item.rawWeight, 0) / selected.length : 0;
    return selected.map(({ row, value, rawWeight }) => ({ row, value, weight: mean ? rawWeight / mean : 0 }));
  }

  function selectedRows() {
    return weightedSelection();
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

  function presetSelected(row) {
    const available = salary(row) != null;
    if (state.sample === "clean") return Boolean(row.defaultIncluded && row.structurallyClean && available);
    if (state.sample === "tierA") return Boolean(row.defaultIncluded && available && (row.tier === "A" || row.tier === "strict_primary"));
    if (state.sample === "observed") return available;
    return Boolean(row.defaultIncluded && available);
  }

  function applyPreset() {
    for (const row of rows()) rowInclusion(row).set(row.id, presetSelected(row));
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
    const salaryActive = refs.salaryRangeValue.value !== "All";
    const expenseActive = refs.expenseRangeValue.value !== "All";
    refs.salaryFilterSummary.dataset.active = String(salaryActive);
    refs.expenseFilterSummary.dataset.active = String(expenseActive);
    refs.salaryFilterSummary.setAttribute("aria-label", salaryActive
      ? `Filter salary, active range ${refs.salaryRangeValue.value}` : "Filter salary, all values included");
    refs.expenseFilterSummary.setAttribute("aria-label", expenseActive
      ? `Filter expenses, active range ${refs.expenseRangeValue.value}` : "Filter expenses, all values included");
    refs.salaryFilterStatus.textContent = salaryActive
      ? `Salary filter · ${refs.salaryRangeValue.value}` : "All salaries included";
    refs.expenseFilterStatus.textContent = expenseActive
      ? `Expense filter · ${refs.expenseRangeValue.value}` : "All expenses included";
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

  function quantilePercentiles() {
    if (state.quantileGranularity === "deciles") return Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
    if (state.quantileGranularity === "percentiles") return Array.from({ length: 99 }, (_, index) => index + 1);
    if (state.quantileGranularity !== "custom") return [20, 40, 60, 80];
    const tokens = state.customQuantiles.split(",").map((value) => Number(value.trim()));
    const valid = tokens.length > 0 && tokens.every((value) => Number.isFinite(value) && value > 0 && value < 100);
    return valid ? [...new Set(tokens)].sort((a, b) => a - b) : [];
  }

  function appendCurveQuantileMarks(svg, model, percentiles, xScale, yScale, margin, sumWeight, binWidthValue, domainMin, domainMax) {
    if (!state.markCurve || !model || !percentiles.length || percentiles.length >= 21) return;
    const expectedWeight = (value) => model.density(value) * sumWeight * binWidthValue;
    const delta = Math.max((domainMax - domainMin) / 1500, 1);
    const candidates = [];
    percentiles.forEach((percentile) => {
      const value = model.quantile(percentile / 100);
      if (!Number.isFinite(value) || value < domainMin || value > domainMax) return;
      const x = xScale(value);
      const y = margin.top + yScale(expectedWeight(value));
      const before = Math.max(domainMin, value - delta);
      const after = Math.min(domainMax, value + delta);
      const tangentAngle = Math.atan2(
        margin.top + yScale(expectedWeight(after)) - (margin.top + yScale(expectedWeight(before))),
        xScale(after) - xScale(before),
      );
      let normalX = -Math.sin(tangentAngle);
      let normalY = Math.cos(tangentAngle);
      if (normalY > 0) { normalX *= -1; normalY *= -1; }
      const tickOuter = 9;
      const tickGap = 5;
      const tickOutlinePath = [
        `M${x - normalX * tickOuter},${y - normalY * tickOuter}L${x - normalX * tickGap},${y - normalY * tickGap}`,
        `M${x + normalX * tickGap},${y + normalY * tickGap}L${x + normalX * tickOuter},${y + normalY * tickOuter}`,
      ].join(" ");
      const tickPath = `M${x - normalX * tickOuter},${y - normalY * tickOuter}L${x + normalX * tickOuter},${y + normalY * tickOuter}`;
      let textAngle = tangentAngle * 180 / Math.PI;
      if (textAngle > 90) textAngle -= 180;
      if (textAngle < -90) textAngle += 180;
      const labelX = x + normalX * 24;
      const labelY = y + normalY * 24;
      const label = svgElement("g", { transform: `translate(${labelX} ${labelY}) rotate(${textAngle})`, class: "curve-quantile-mark" });
      const percentileLine = svgElement("text", { x: 0, y: -7, "text-anchor": "middle", class: "curve-quantile-label" });
      const percentilePrefix = svgElement("tspan");
      percentilePrefix.textContent = "P";
      const percentileSubscript = svgElement("tspan", { "baseline-shift": "sub", "font-size": "7.5" });
      percentileSubscript.textContent = Number.isInteger(percentile) ? percentile : percentile.toFixed(1);
      percentileLine.append(percentilePrefix, percentileSubscript);
      const amountLine = svgElement("text", { x: 0, y: 13, "text-anchor": "middle", class: "curve-quantile-label amount" });
      amountLine.textContent = `$${Math.round(value / 1000)}K`;
      label.append(percentileLine, amountLine);
      label.setAttribute("visibility", "hidden");
      svg.append(label);
      const bounds = label.getBoundingClientRect();
      label.remove();
      label.removeAttribute("visibility");
      candidates.push({ percentile, bounds, label, tickOutlinePath, tickPath });
    });
    const overlaps = (first, second, padding = 3) => first.right + padding > second.left
      && second.right + padding > first.left
      && first.bottom + padding > second.top
      && second.bottom + padding > first.top;
    const retained = [];
    [...candidates]
      .sort((first, second) => Math.abs(first.percentile - 50) - Math.abs(second.percentile - 50) || first.percentile - second.percentile)
      .forEach((candidate) => {
        if (retained.some((existing) => overlaps(existing.bounds, candidate.bounds))) return;
        retained.push(candidate);
      });
    retained.sort((first, second) => first.bounds.left - second.bounds.left).forEach((candidate) => {
      svg.append(svgElement("path", { d: candidate.tickOutlinePath, class: "curve-quantile-tick-outline" }));
      svg.append(svgElement("path", { d: candidate.tickPath, class: "curve-quantile-tick" }));
      svg.append(candidate.label);
    });
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
        const category = chartCategory(item.row);
        const rect = svgElement("rect", {
          x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(2, y1 - y0),
          fill: colors.get(category), class: `bar-block${state.focusedId === item.row.id ? " is-focused" : ""}`,
          tabindex: "0", role: "button", "aria-label": `${item.row.organization}, ${money(item.value)}`,
        });
        const binLow = domainMin + bin.index * binWidthValue;
        const binHigh = binLow + binWidthValue;
        rect.addEventListener("pointerenter", (event) => {
          highlightRug(item.row.id, true);
          showTooltip(event, item, { category, chartDetail: ["Histogram bin", `${compactMoney(binLow)}–${compactMoney(binHigh)}`] });
        });
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
      svg.append(svgElement("path", { d: path, class: "density-line-outline" }));
      svg.append(svgElement("path", { d: path, class: "density-line" }));
      appendCurveQuantileMarks(
        svg, model, quantilePercentiles(), xScale, yScale, margin,
        sumWeight, binWidthValue, domainMin, domainMax,
      );
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
    axisTitle.textContent = `Annual compensation (${priceBasisLabel()})`;
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

  function humanizeCategory(value) {
    return String(value || "Not reported")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function peerTierInfo(value) {
    const raw = String(value || "Not reported");
    const normalized = raw.toLowerCase();
    if (normalized === "a" || normalized === "strict_primary" || normalized.startsWith("tier a")) return { label: "Tier A · Primary", order: 0 };
    if (normalized === "b" || normalized === "secondary" || normalized.startsWith("secondary_") || normalized.startsWith("tier b")) return { label: "Tier B · Secondary", order: 1 };
    if (normalized === "c" || normalized.startsWith("expanded_") || normalized.startsWith("tier c")) return { label: "Tier C · Expanded", order: 2 };
    if (normalized.includes("sensitivity")) return { label: "Sensitivity set", order: 3 };
    if (normalized.startsWith("excluded")) return { label: "Excluded", order: 4 };
    return { label: humanizeCategory(raw), order: 5 };
  }

  function tierSortValue(value) {
    const raw = String(value || "Not reported").toLowerCase();
    const details = [
      "a", "strict_primary", "b", "secondary", "secondary_scale", "secondary_structural",
      "c", "expanded_primary_title", "expanded_secondary_scale", "expanded_secondary_scale_unknown",
      "expanded_secondary_structural", "expanded_broad_functional", "date_ambiguity_sensitivity",
      "fractional_sensitivity", "older_structural_sensitivity", "excluded", "excluded_grantmaking",
      "excluded_private_foundation", "excluded_subordinate_regional",
    ];
    const detailOrder = details.indexOf(raw);
    return peerTierInfo(raw).order * 100 + (detailOrder < 0 ? 99 : detailOrder);
  }

  function chartCategory(row) {
    const raw = String(row[state.chartColor] || "Not reported");
    return state.chartColor === "tier" ? peerTierInfo(raw).label : raw;
  }

  function mixHex(hex, target, amount) {
    const source = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    const destination = target.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    return `#${source.map((value, index) => Math.round(value + (destination[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  }

  function categoryColors(items) {
    const categories = [...new Set(items.map((item) => chartCategory(item.row)))].sort((a, b) => {
      if (state.chartColor !== "tier") return a.localeCompare(b);
      return peerTierInfo(a).order - peerTierInfo(b).order;
    });
    return new Map(categories.map((category, index) => {
      const cycle = Math.floor(index / categoryPalette.length);
      const base = categoryPalette[index % categoryPalette.length];
      const color = cycle % 2 ? mixHex(base, "#ffffff", Math.min(0.18 + cycle * 0.05, 0.42)) : mixHex(base, "#000000", Math.min(cycle * 0.05, 0.25));
      return [category, color];
    }));
  }

  function appendPointSizeLegend(items) {
    const sizingActive = state.weightings.size > 0 || items.some((item) => rowModifiedWeights(item.row).has(item.row.id));
    if (!sizingActive) return;
    const legend = document.createElement("span");
    legend.className = "point-size-legend";
    legend.setAttribute("aria-label", "Point area represents normalized analytical weight");
    const title = document.createElement("span");
    title.className = "point-size-legend-label";
    title.textContent = "Point area = weight";
    legend.append(title);
    [0.5, 1, 2].forEach((weight) => {
      const key = document.createElement("span"); key.className = "point-size-key";
      const swatch = document.createElement("i"); swatch.className = "point-size-swatch";
      const diameter = 9 * Math.sqrt(weight);
      swatch.style.width = `${diameter.toFixed(1)}px`; swatch.style.height = `${diameter.toFixed(1)}px`;
      key.append(swatch, document.createTextNode(`${weight.toFixed(1)}×`));
      legend.append(key);
    });
    refs.chartLegend.append(legend);
  }

  function renderScatterLegend(colorMap, contoursShown, items) {
    refs.chartLegend.replaceChildren();
    appendCategoryLegend(colorMap);
    if (contoursShown) {
      const contour = document.createElement("span"); contour.innerHTML = '<i class="contour-swatch"></i> 50 / 80 / 95% covariance contours';
      refs.chartLegend.append(contour);
    }
    appendPointSizeLegend(items);
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

  function weightedPearson(values) {
    const total = values.reduce((sum, item) => sum + item.weight, 0);
    if (values.length < 2 || !total) return NaN;
    const meanX = values.reduce((sum, item) => sum + item.x * item.weight, 0) / total;
    const meanY = values.reduce((sum, item) => sum + item.y * item.weight, 0) / total;
    const covariance = values.reduce((sum, item) => sum + (item.x - meanX) * (item.y - meanY) * item.weight, 0);
    const varianceX = values.reduce((sum, item) => sum + (item.x - meanX) ** 2 * item.weight, 0);
    const varianceY = values.reduce((sum, item) => sum + (item.y - meanY) ** 2 * item.weight, 0);
    return varianceX > 0 && varianceY > 0 ? covariance / Math.sqrt(varianceX * varianceY) : NaN;
  }

  function weightedRanks(values, accessor) {
    const ranked = [...values].sort((a, b) => accessor(a) - accessor(b));
    const result = new Map();
    let cumulative = 0;
    for (let start = 0; start < ranked.length;) {
      let end = start + 1;
      while (end < ranked.length && accessor(ranked[end]) === accessor(ranked[start])) end += 1;
      const groupWeight = ranked.slice(start, end).reduce((sum, item) => sum + item.weight, 0);
      const rank = cumulative + groupWeight / 2;
      ranked.slice(start, end).forEach((item) => result.set(item.index, rank));
      cumulative += groupWeight;
      start = end;
    }
    return result;
  }

  function weightedCorrelations(items, xAccessor) {
    const values = items.map((item, index) => ({ index, x: xAccessor(item), y: item.value, weight: item.weight }));
    const pearson = weightedPearson(values);
    const xRanks = weightedRanks(values, (item) => item.x);
    const yRanks = weightedRanks(values, (item) => item.y);
    const spearman = weightedPearson(values.map((item) => ({ x: xRanks.get(item.index), y: yRanks.get(item.index), weight: item.weight })));
    return { pearson, spearman };
  }

  function updateCorrelationSummary(correlations = {}) {
    const format = (value) => Number.isFinite(value) ? value.toFixed(3) : "—";
    refs.scatterCorrelations.textContent = `Weighted r = ${format(correlations.pearson)}, ρ = ${format(correlations.spearman)}`;
    refs.scatterCorrelations.setAttribute("aria-label", `Weighted Pearson r ${format(correlations.pearson)}; weighted Spearman rho ${format(correlations.spearman)}`);
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
      updateCorrelationSummary();
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
    const correlations = weightedCorrelations(items, (item) => xTransform(item.row[state.scatterX]));
    points.forEach(({ item, x, y }) => {
      const category = chartCategory(item.row);
      const baseRadius = 4.5;
      const radius = baseRadius * Math.sqrt(clamp(item.weight, 0.16, 10));
      const point = svgElement("circle", {
        cx: x, cy: y, r: radius, fill: colors.get(category), "data-weight": item.weight.toFixed(6),
        class: `scatter-point${state.focusedId === item.row.id ? " is-focused" : ""}`, tabindex: "0", role: "button",
        "aria-label": `${item.row.organization}, ${money(item.value)}, ${variable.label} ${variable.format(item.row[state.scatterX])}`,
      });
      point.addEventListener("pointerenter", (event) => showTooltip(event, item, {
        category, chartDetail: [variable.label, variable.format(item.row[state.scatterX])],
      }));
      point.addEventListener("pointermove", positionTooltip); point.addEventListener("pointerleave", hideTooltip);
      point.addEventListener("click", () => focusRow(item.row.id));
      point.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") focusRow(item.row.id); });
      svg.append(point);
    });
    updateCorrelationSummary(correlations);
    const xTitle = svgElement("text", { x: margin.left + innerWidth / 2, y: height - 6, "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700 });
    xTitle.textContent = `${variable.label}${variable.logarithmic ? " (log scale)" : ""}`; svg.append(xTitle);
    const yTitle = svgElement("text", { x: 14, y: margin.top + innerHeight / 2, transform: `rotate(-90 14 ${margin.top + innerHeight / 2})`, "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700 });
    yTitle.textContent = `Annual compensation (${priceBasisLabel()})`; svg.append(yTitle);
    renderScatterLegend(colors, contoursShown, items);
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = compactMoney(distributionQuantile(items, 0.5));
  }

  function renderChart() {
    if (state.view === "scatter") renderScatter(); else renderHistogram();
  }

  function showTooltip(event, item, context = {}) {
    const row = item.row;
    const tier = peerTierInfo(row.tier);
    const rawTier = humanizeCategory(row.tier);
    const evidence = [row.sourceType, row.compensationYear].filter(Boolean).join(" · ");
    const displayedRange = salaryRange(row);
    const range = displayedRange
      ? `${money(displayedRange.low)}–${money(displayedRange.high)}`
      : "";
    const colorLabel = {
      topic: "Topic / model", eaAffinity: "EA relation", sourceType: "Evidence stream",
      titleGroup: "Job-title group", structure: "Structure",
    }[state.chartColor];
    const details = [
      context.chartDetail,
      range ? ["Advertised range", range] : null,
      ["Peer tier", tier.label],
      rowStream(row) === "jobAds" && rawTier !== tier.label ? ["Recruitment subtype", rawTier] : null,
      colorLabel ? [`Color · ${colorLabel}`, context.category] : null,
      evidence ? ["Evidence", evidence] : null,
      row.comparabilityScore != null ? ["Match score", `${row.comparabilityScore} / 100`] : null,
      ["Effective weight", item.weight > 0 && item.weight < 0.01 ? "<0.01" : item.weight.toFixed(2)],
    ].filter(Boolean);
    refs.tooltip.innerHTML = `
      <div class="chart-tooltip-heading">
        <strong>${escapeHtml(row.organization)}</strong>
        <span>${escapeHtml(row.title || "Executive role")}</span>
      </div>
      <div class="chart-tooltip-value">
        <span>${escapeHtml(measureLabel(row))}</span>
        <strong>${money(item.value)}</strong>
      </div>
      <dl>${details.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      <p class="chart-tooltip-hint">Click the mark to focus its row in the table.</p>`;
    refs.tooltip.hidden = false;
    positionTooltip(event);
  }

  function positionTooltip(event) {
    const bounds = refs.chartWrap.getBoundingClientRect();
    const tooltipWidth = refs.tooltip.offsetWidth;
    const tooltipHeight = refs.tooltip.offsetHeight;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    let left = pointerX + 14;
    if (left + tooltipWidth > bounds.width - 5) left = pointerX - tooltipWidth - 14;
    let top = pointerY - tooltipHeight - 12;
    if (top < 5) top = pointerY + 14;
    refs.tooltip.style.left = `${clamp(left, 5, Math.max(5, bounds.width - tooltipWidth - 5))}px`;
    refs.tooltip.style.top = `${clamp(top, 5, Math.max(5, bounds.height - tooltipHeight - 5))}px`;
  }

  function hideTooltip() { refs.tooltip.hidden = true; }

  function renderQuantiles() {
    const items = selectedRows();
    const model = fitModel(items);
    refs.quantileBasis.textContent = state.fit === "empirical"
      ? "Derived from weighted empirical ranks"
      : `Derived from the fitted ${state.fit} distribution`;
    refs.customQuantilesField.hidden = state.quantileGranularity !== "custom";
    const percentiles = quantilePercentiles();
    if (state.quantileGranularity === "custom") {
      const valid = percentiles.length > 0;
      refs.customQuantilesError.textContent = valid ? "" : "Enter comma-separated values greater than 0 and less than 100.";
    } else refs.customQuantilesError.textContent = "";
    refs.quantileGrid.replaceChildren();
    refs.quantileGrid.classList.toggle("is-percentiles", percentiles.length > 20);
    percentiles.forEach((percentile) => {
      const probability = percentile / 100;
      const value = items.length ? (model ? model.quantile(probability) : weightedQuantile(items, probability)) : NaN;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quantile-cell";
      const label = percentileParts(percentile);
      button.innerHTML = `<span>${label.number}<sup>${label.suffix}</sup> percentile</span><strong>${compactMoney(value)}</strong>`;
      button.setAttribute("aria-label", `${formatPercentile(percentile)}: ${money(value)}`);
      button.addEventListener("pointerenter", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("pointerleave", () => { state.hoverQuantile = null; renderChart(); });
      button.addEventListener("focus", () => { state.hoverQuantile = value; renderChart(); });
      button.addEventListener("blur", () => { state.hoverQuantile = null; renderChart(); });
      refs.quantileGrid.append(button);
    });
  }

  function formatPercentile(value) {
    const { number, suffix } = percentileParts(value);
    return `${number}${suffix} percentile`;
  }

  function percentileParts(value) {
    const rounded = Number.isInteger(value) ? value : value.toFixed(1);
    const integer = Math.floor(value);
    const suffix = integer % 100 >= 11 && integer % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[integer % 10] || "th");
    return { number: rounded, suffix };
  }

  function tableRows(weightMap = new Map()) {
    const filtered = rows().filter((row) => salary(row) != null && passesFilters(row));
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const value = (row) => {
        if (state.sortKey === "tier") return tierSortValue(row.tier);
        if (state.sortKey === "salary") return salary(row) ?? -Infinity;
        if (state.sortKey === "weight") return weightMap.get(row.id) || 0;
        if (["expenses", "staff", "comparabilityScore", "compensationYear"].includes(state.sortKey)) return row[state.sortKey] ?? -Infinity;
        return String(row[state.sortKey] || "").toLowerCase();
      };
      const av = value(a); const bv = value(b);
      const comparison = (av < bv ? -1 : av > bv ? 1 : 0) * direction;
      return comparison || a.organization.localeCompare(b.organization);
    });
  }

  function buildFilterMenus() {
    document.querySelectorAll("[data-filter-menu]").forEach((container) => {
      const key = container.dataset.filterMenu;
      const label = {
        title: "Job title", sourceType: "Evidence", tier: "Tier", topic: "Topic / model",
        location: "Location", eaAffinity: "EA relation", structure: "Structure",
      }[key] || key;
      const values = [...new Set(rows().map((row) => String(row[key] || "Not reported")))].sort((a, b) => a.localeCompare(b));
      const selected = state.filters[key];
      container.replaceChildren();
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const panel = document.createElement("div");
      panel.className = "filter-popover";
      const status = document.createElement("div");
      status.className = "filter-status";
      status.setAttribute("aria-live", "polite");
      const actions = document.createElement("div");
      actions.className = "filter-actions";
      const allButton = document.createElement("button");
      allButton.type = "button";
      const updateMenuState = () => {
        const current = state.filters[key];
        const count = current == null ? values.length : current.size;
        const active = count !== values.length;
        summary.dataset.active = String(active);
        summary.setAttribute("aria-label", active
          ? `Filter ${label}, ${count} of ${values.length} selected`
          : `Filter ${label}, all ${values.length} selected`);
        status.textContent = active ? `${count} of ${values.length} selected` : `All ${values.length} selected`;
        allButton.textContent = active ? "Select all" : "Deselect all";
      };
      updateMenuState();
      allButton.addEventListener("click", () => {
        state.filters[key] = state.filters[key] == null ? new Set() : null;
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
          updateMenuState();
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
      panel.append(status, actions, options); details.append(summary, panel); container.append(details);
    });
  }

  function appendRpReferenceRow() {
    const tr = document.createElement("tr");
    tr.className = "rp-reference-row";
    tr.setAttribute("aria-label", "Rethink Priorities reference profile: 7.5 million dollar core budget and 57 full-time equivalents");
    const values = [
      "", "Rethink Priorities", "Reference organization", "Public RP profile", "—", compactMoney(RP_REFERENCE.expenses),
      "", "", "Reference", "—", "—", `${RP_REFERENCE.staff} FTE`, "—", "—", "2026", "",
    ];
    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 0) td.className = "check-column";
      if (index === 1) td.className = "rp-reference-name";
      tr.append(td);
    });
    const source = document.createElement("td");
    [
      ["Budget ↗", "https://rethinkpriorities.org/2025-results/"],
      ["Staff ↗", "https://rethinkpriorities.org/rethink-priorities-funding-needs/"],
    ].forEach(([label, href], index) => {
      if (index) source.append(document.createTextNode(" · "));
      const link = document.createElement("a");
      link.className = "rp-reference-source"; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = label;
      source.append(link);
    });
    tr.append(source);
    refs.tableBody.append(tr);
  }

  function renderTable() {
    refs.tableBody.replaceChildren();
    appendRpReferenceRow();
    const selection = weightedSelection();
    const weightMap = new Map(selection.map((item) => [item.row.id, item.weight]));
    tableRows(weightMap).forEach((row) => {
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
      weightCell.className = "weight-cell";
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "10"; weightInput.step = "0.1";
      const isModified = rowModifiedWeights(row).has(row.id);
      const normalizedWeight = weightMap.get(row.id) || 0;
      weightInput.value = isModified ? (rowCustomWeights(row).get(row.id) ?? 1) : normalizedWeight.toFixed(2);
      weightInput.className = `weight-input${isModified ? " is-user-modified" : ""}`;
      weightInput.disabled = !available;
      weightInput.title = isModified
        ? `User multiplier: ${Number(rowCustomWeights(row).get(row.id) ?? 1).toFixed(2)} · normalized effective weight: ${normalizedWeight.toFixed(2)}`
        : `Automatic normalized effective weight: ${normalizedWeight.toFixed(2)} (mean included weight = 1)`;
      weightInput.setAttribute("aria-label", `${isModified ? "User multiplier" : "Automatic normalized weight"} for ${row.organization}`);
      weightInput.addEventListener("change", () => {
        const value = clamp(Number(weightInput.value) || 0, 0, 10);
        rowCustomWeights(row).set(row.id, value);
        rowModifiedWeights(row).add(row.id);
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
    document.querySelectorAll("thead button[data-sort]").forEach((button) => {
      const active = button.dataset.sort === state.sortKey;
      button.dataset.active = active;
      button.dataset.direction = active ? state.sortDirection : "";
      button.title = `Sort by ${button.textContent.trim()}`;
      button.closest("th").setAttribute("aria-sort", active
        ? (state.sortDirection === "asc" ? "ascending" : "descending")
        : "none");
    });
    scheduleTableStickyOffset();
  }

  let tableStickyFrame = null;

  function scheduleTableStickyOffset() {
    if (tableStickyFrame != null) cancelAnimationFrame(tableStickyFrame);
    tableStickyFrame = requestAnimationFrame(() => {
      tableStickyFrame = null;
      const headerHeight = document.querySelector("#organization-table thead")?.getBoundingClientRect().height || 29;
      refs.tableScroll.style.setProperty("--table-header-height", `${headerHeight}px`);
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
      ["Displayed dollar basis", state.inflationAdjusted ? `${DATA.priceBasis} · CPI factor ${Number(row.cpiFactor || 1).toFixed(4)}×` : "Nominal source-year dollars · no CPI adjustment"],
      ["CPI reference period", row.cpiPeriod || "Not reported"],
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
    renderCategoryProvenance(row);
    const cached = $("#dialog-cached");
    cached.hidden = !row.cachedSource; cached.href = row.cachedSource || "#";
    const external = $("#dialog-external");
    external.hidden = !row.sourceUrl; external.href = row.sourceUrl || "#";
    refs.dialog.showModal();
  }

  function renderCategoryProvenance(row) {
    const details = $("#dialog-category-provenance");
    const provenance = row.categoryProvenance;
    details.hidden = !provenance;
    details.open = false;
    if (!provenance) return;

    $("#dialog-provenance-confidence").textContent = `${provenance.confidence || "Unspecified"} confidence`;
    $("#dialog-provenance-intro").textContent = [
      provenance.classificationTiming ? `Timing: ${provenance.classificationTiming.replaceAll("_", " ")}.` : "",
      provenance.provenanceType ? `Provenance: ${provenance.provenanceType.replaceAll("_", " ").replaceAll(" + ", "; ")}.` : "",
      provenance.caveats ? `Caveat: ${provenance.caveats}` : "",
    ].filter(Boolean).join(" ");

    const records = $("#dialog-provenance-records");
    records.replaceChildren();
    const categories = [
      ["Tier", [provenance.tier.value, provenance.tier.label].filter(Boolean).join(" · "), provenance.tier.rationale, provenance.tier.citation],
      ["EA relationship", provenance.ea.value || "Uncoded", provenance.ea.rationale, provenance.ea.citation],
      ["Structure", [provenance.structure.expected && `Expected: ${provenance.structure.expected}`, provenance.structure.observationFlag && `Observation flag: ${provenance.structure.observationFlag}`].filter(Boolean).join(" · ") || "Uncoded", provenance.structure.rationale, provenance.structure.citation],
      ["Topic / model", [provenance.topic.value, provenance.topic.sourceDescription].filter(Boolean).join(" · ") || "Uncoded", provenance.topic.rationale, provenance.topic.citation],
      ["Analysis title class", provenance.title.analysisGroup || "Uncoded", provenance.title.rationale, provenance.title.citation],
    ];
    const observation = row.observationCategoryProvenance;
    if (observation) {
      const differences = [];
      if (observation.tier.value !== provenance.tier.value) differences.push(`selection tier ${provenance.tier.value || "uncoded"} → filing tier ${observation.tier.value || "uncoded"}`);
      if (observation.topic.value !== provenance.topic.value) differences.push("filing-normalized topic differs from the selection-stage label");
      categories.push([
        "Filing observation review",
        [observation.tier.value && `Tier ${observation.tier.value}`, observation.tier.label, observation.structure.observationFlag && `Flag: ${observation.structure.observationFlag}`].filter(Boolean).join(" · "),
        [observation.tier.rationale, observation.structure.rationale, differences.length ? `Recorded difference: ${differences.join("; ")}.` : "Selection and filing tier/topic classifications agree."].filter(Boolean).join(" "),
        [observation.tier.citation, observation.structure.citation].filter(Boolean).join(" | "),
      ]);
    }
    categories.forEach(([label, value, rationale, citation]) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const headingLabel = document.createElement("span"); headingLabel.textContent = label;
      const headingValue = document.createElement("strong"); headingValue.textContent = value;
      heading.append(headingLabel, headingValue);
      const description = document.createElement("p"); description.textContent = rationale || "No additional rationale was preserved.";
      const citations = document.createElement("div"); citations.className = "provenance-citations";
      appendCitationLinks(citations, citation);
      section.append(heading, description, citations);
      records.append(section);
    });

    const links = $("#dialog-provenance-links");
    links.replaceChildren();
    [
      ["Category dictionary", DATA.categoryExplainers.dictionaryPath],
      ["Row-level rationale CSV", DATA.categoryExplainers.rationalesPath],
      ["Methodology notes", DATA.categoryExplainers.methodologyPath],
      ["Validation report", DATA.categoryExplainers.validationPath],
    ].forEach(([label, href]) => {
      const anchor = document.createElement("a"); anchor.href = href; anchor.target = "_blank"; anchor.textContent = `${label} ↗`;
      links.append(anchor);
    });
  }

  function appendCitationLinks(container, citation) {
    if (!citation) {
      container.textContent = "No record-level citation preserved.";
      return;
    }
    citation.split(" | ").forEach((item, index) => {
      if (index) container.append(document.createTextNode(" · "));
      const separator = item.indexOf("#");
      const path = separator >= 0 ? item.slice(0, separator) : item;
      const locator = separator >= 0 ? item.slice(separator + 1) : "";
      if (path.startsWith("benchmark/")) {
        const anchor = document.createElement("a");
        anchor.href = path; anchor.target = "_blank";
        anchor.textContent = `${path.split("/").pop()}${locator ? ` · ${locator.replaceAll(";", " · ")}` : ""}`;
        container.append(anchor);
      } else container.append(document.createTextNode(item));
    });
  }

  function measureLabel(row = null) {
    const basis = state.inflationAdjusted ? "July 2026 USD" : "source-year USD";
    if (state.stream === "combined") return row && rowStream(row) === "jobAds"
      ? `Posting midpoint, ${basis}`
      : row ? `Schedule J base, ${basis}` : `Comparable salary proxy, ${basis}`;
    if (state.stream === "jobAds") return `Posting midpoint, ${basis}`;
    return {
      base: `Schedule J base, ${basis}`,
      cash: `Part VII cash / W-2 proxy, ${basis}`,
      total: `Filing total proxy, ${basis}`,
    }[state.measure];
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
    const components = [...state.weightings].filter((key) => key !== "streamBalanced").map((key) => WEIGHT_LABELS[key]);
    const balanced = state.weightings.has("streamBalanced");
    const baseDescription = components.length
      ? `Base weight = ${components.join(" × ")}. Missing continuous values receive a 0.45 multiplier.`
      : "No components selected: equal base weights.";
    refs.weightingDescription.textContent = balanced
      ? `${baseDescription} Form 990s and recruitment postings are then rescaled to 50/50 total influence.`
      : baseDescription;
    const discrete = DISCRETE_WEIGHT_KEYS.filter((key) => state.weightings.has(key));
    refs.discreteWeightEditors.hidden = !discrete.length;
    refs.discreteWeightEditors.replaceChildren();
    discrete.forEach((key) => {
      const weights = ensureDiscreteWeights(key);
      const details = document.createElement("details");
      details.open = discrete.length === 1;
      const summary = document.createElement("summary"); summary.textContent = `${WEIGHT_LABELS[key]} category multipliers`;
      const note = document.createElement("p"); note.className = "discrete-weight-note"; note.textContent = `${DISCRETE_WEIGHT_NOTES[key]} Definitions and provenance come from the preserved explainer package. Suggested multipliers are editable sensitivity judgments, not source rules; 1.00 is the reference and 0 excludes a category.`;
      const grid = document.createElement("div"); grid.className = "discrete-weight-grid";
      Object.keys(weights).sort((a, b) => a.localeCompare(b)).forEach((category) => {
        const label = document.createElement("span"); label.className = "discrete-weight-category";
        const labelText = document.createElement("span");
        labelText.textContent = category; labelText.title = category;
        const help = document.createElement("button");
        help.type = "button"; help.className = "info-tooltip"; help.textContent = "?";
        help.dataset.tooltip = discreteWeightExplanation(key, category);
        help.setAttribute("aria-label", `About ${WEIGHT_LABELS[key]} category ${category}`);
        label.append(labelText, help);
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
      details.append(summary, note, grid); refs.discreteWeightEditors.append(details);
      initializeHelpTooltips(details);
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
    refs.comparabilityProfileField.hidden = !state.weightings.has("comparability");
    refs.rpScaleReference.hidden = !keys.some((key) => key === "size" || key === "staff");
    refs.weightProfileSlots.forEach((slot) => slot.replaceChildren());
    keys.forEach((key) => {
      let values;
      let format;
      let logarithmic = false;
      let parameter;
      let axisTitle;
      if (key === "comparability") {
        values = [0, 100]; format = (value) => value.toFixed(0); parameter = "Score ÷ 75, capped at 0.25–1.75";
        axisTitle = "Peer match score (0–100)";
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
      let target = key === "size" ? state.targetExpense : key === "staff" ? state.targetStaff : null;
      const rpReference = key === "size" ? RP_REFERENCE.expenses : key === "staff" ? RP_REFERENCE.staff : null;
      const domainValues = [...values, target, rpReference].filter((value) => value != null && Number.isFinite(value));
      const rawMin = Math.min(...domainValues); const rawMax = Math.max(...domainValues);
      if (key === "recency") target = rawMax;
      const domainMin = logarithmic ? Math.log(rawMin) : rawMin;
      const domainMax = logarithmic ? Math.log(rawMax) : rawMax;
      const domainSpan = Math.max(domainMax - domainMin, 1);
      const width = 220; const height = 148; const margin = { top: 17, right: 8, bottom: 38, left: 43 };
      const innerWidth = width - margin.left - margin.right; const innerHeight = height - margin.top - margin.bottom;
      const samples = Array.from({ length: 81 }, (_, index) => {
        const transformed = domainMin + (index / 80) * domainSpan;
        const value = logarithmic ? Math.exp(transformed) : transformed;
        return { value, weight: componentResponse(key, value), x: margin.left + (index / 80) * innerWidth };
      });
      const maxWeight = Math.max(1, ...samples.map((sample) => sample.weight)) * 1.08;
      const y = (weight) => margin.top + innerHeight - (weight / maxWeight) * innerHeight;
      const figure = document.createElement("div"); figure.className = "weight-profile-figure";
      const heading = document.createElement("div"); heading.className = "weight-profile-heading";
      const title = document.createElement("strong"); title.textContent = WEIGHT_LABELS[key];
      heading.append(title);
      if (key === "comparability") {
        const help = document.createElement("button");
        help.type = "button"; help.className = "info-tooltip"; help.textContent = "?";
        help.dataset.tooltip = COMPOSITE_SCORE_TOOLTIP;
        help.setAttribute("aria-label", "About auto-weights");
        heading.append(help);
      }
      const description = document.createElement("span"); description.textContent = parameter;
      const referenceDescription = rpReference == null ? "" : `; RP reference ${format(rpReference)}`;
      const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${WEIGHT_LABELS[key]} relative weight-response curve${referenceDescription}` });
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
      const positionX = (value) => {
        const position = logarithmic ? Math.log(value) : value;
        return margin.left + ((position - domainMin) / domainSpan) * innerWidth;
      };
      const targetDiffersFromRp = rpReference == null || Math.abs(positionX(target) - positionX(rpReference)) > 0.5;
      if (target != null && target >= rawMin && target <= rawMax && targetDiffersFromRp) {
        const targetX = positionX(target);
        svg.append(svgElement("line", { x1: targetX, x2: targetX, y1: margin.top, y2: margin.top + innerHeight, class: "weight-profile-target" }));
      }
      if (rpReference != null && rpReference >= rawMin && rpReference <= rawMax) {
        const referenceX = positionX(rpReference);
        svg.append(svgElement("line", { x1: referenceX, x2: referenceX, y1: margin.top, y2: margin.top + innerHeight, class: "weight-profile-rp-reference" }));
        const referenceLabel = svgElement("text", {
          x: referenceX, y: margin.top - 5, "text-anchor": referenceX < margin.left + 12 ? "start" : referenceX > width - margin.right - 12 ? "end" : "middle",
          class: "weight-profile-rp-label",
        });
        referenceLabel.textContent = "RP"; svg.append(referenceLabel);
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
      svg.append(xTitle, yTitle); figure.append(heading, description, svg); refs.weightProfileSlots.get(key).append(figure);
      initializeHelpTooltips(figure);
    });
  }

  function updateHeadings() {
    const isJobs = state.stream === "jobAds";
    const isCombined = state.stream === "combined";
    refs.measureField.hidden = isJobs || isCombined;
    refs.chartTitle.textContent = isCombined
      ? "Schedule J base salaries + posting midpoints"
      : isJobs
        ? "Validated CEO / ED posting midpoints"
        : { base: "Validated Schedule J base salaries", cash: "Validated Part VII cash / W-2 proxies", total: "Validated filing total compensation" }[state.measure];
    refs.statNUnit.textContent = isCombined ? "observations" : "organizations";
    refs.priceBasisStatus.textContent = priceBasisLabel();
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
    refs.expenseBandwidthValue.value = `${state.expenseBandwidth.toFixed(2)}×`;
    refs.staffBandwidthValue.value = `${state.staffBandwidth.toFixed(2)}×`;
    refs.recencyHalfLifeValue.value = `${state.recencyHalfLife.toFixed(1)} years`;
    refs.binValue.value = state.bins;
  }

  const URL_STATE_VERSION = 3;
  const URL_WEIGHT_CODES = Object.freeze({
    comparability: "c", size: "e", staff: "s", recency: "r", tier: "t", eaAffinity: "a",
    sourceType: "v", topic: "o", titleGroup: "j", structure: "u", streamBalanced: "b",
  });
  const URL_FILTER_CODES = Object.freeze({ title: "h", sourceType: "v", tier: "t", topic: "o", location: "l", eaAffinity: "a", structure: "u" });
  const URL_STREAM_CODES = Object.freeze({ incumbents: "i", jobAds: "j", combined: "a" });
  const URL_MEASURE_CODES = Object.freeze({ base: "b", cash: "c", total: "t" });
  const URL_SAMPLE_CODES = Object.freeze({ primary: "p", clean: "c", tierA: "a", observed: "o" });
  const URL_FIT_CODES = Object.freeze({ empirical: "e", lognormal: "l", gamma: "g" });
  const URL_QUANTILE_CODES = Object.freeze({ quintiles: "q", deciles: "d", percentiles: "p", custom: "c" });
  const reverseCodes = (codes) => Object.fromEntries(Object.entries(codes).map(([key, value]) => [value, key]));
  const URL_WEIGHT_KEYS = reverseCodes(URL_WEIGHT_CODES);
  const URL_FILTER_KEYS = reverseCodes(URL_FILTER_CODES);
  const URL_STREAM_KEYS = reverseCodes(URL_STREAM_CODES);
  const URL_MEASURE_KEYS = reverseCodes(URL_MEASURE_CODES);
  const URL_SAMPLE_KEYS = reverseCodes(URL_SAMPLE_CODES);
  const URL_FIT_KEYS = reverseCodes(URL_FIT_CODES);
  const URL_QUANTILE_KEYS = reverseCodes(URL_QUANTILE_CODES);
  const allShareRows = [...DATA.incumbents, ...DATA.jobAds];
  const shareRowCodes = new Map();
  let urlSyncReady = false;
  let urlSyncFrame = 0;

  function shareRowCode(row) {
    let hash = 0x811c9dc5;
    for (const character of row.id) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  allShareRows.forEach((row) => {
    const code = shareRowCode(row);
    if (shareRowCodes.has(code) && shareRowCodes.get(code).id !== row.id) throw new Error(`Share-state row-code collision: ${code}`);
    shareRowCodes.set(code, row);
  });

  function encodeUrlState(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function decodeUrlState(encoded) {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function sharePayload() {
    const filterState = {};
    Object.entries(state.filters).forEach(([key, values]) => { if (values != null) filterState[URL_FILTER_CODES[key]] = [...values]; });
    const discreteOverrides = {};
    Object.entries(state.discreteWeights).forEach(([key, values]) => {
      if (!state.weightings.has(key)) return;
      const overrides = Object.fromEntries(Object.entries(values).filter(([category, value]) => value !== defaultDiscreteWeight(key, category)));
      if (Object.keys(overrides).length) discreteOverrides[URL_WEIGHT_CODES[key]] = overrides;
    });
    const inclusionOverrides = rows().reduce((result, row) => {
      const current = Boolean(rowInclusion(row).get(row.id));
      if (current !== presetSelected(row)) result.push([shareRowCode(row), current ? 1 : 0]);
      return result;
    }, []);
    const customOverrides = rows().filter((row) => rowModifiedWeights(row).has(row.id))
      .map((row) => [shareRowCode(row), rowCustomWeights(row).get(row.id) ?? 1]);
    const parameters = {};
    if (state.weightings.has("size") && state.targetExpense !== RP_REFERENCE.expenses) parameters.e = state.targetExpense;
    if (state.weightings.has("staff") && state.targetStaff !== RP_REFERENCE.staff) parameters.s = state.targetStaff;
    if (state.weightings.has("size") && state.expenseBandwidth !== 0.7) parameters.b = state.expenseBandwidth;
    if (state.weightings.has("staff") && state.staffBandwidth !== 0.7) parameters.f = state.staffBandwidth;
    if (state.weightings.has("recency") && state.recencyHalfLife !== 4) parameters.r = state.recencyHalfLife;
    const ranges = {};
    if (state.ranges.salary.low !== state.ranges.salary.min || state.ranges.salary.high !== state.ranges.salary.max) ranges.s = [state.ranges.salary.low, state.ranges.salary.high];
    if (state.ranges.expenses.low !== state.ranges.expenses.min || state.ranges.expenses.high !== state.ranges.expenses.max) ranges.e = [state.ranges.expenses.low, state.ranges.expenses.high];
    const payload = { v: URL_STATE_VERSION };
    if (state.stream !== "combined") payload.e = URL_STREAM_CODES[state.stream];
    if (state.measure !== "base" && state.stream === "incumbents") payload.m = URL_MEASURE_CODES[state.measure];
    if (!state.inflationAdjusted) payload.n = 1;
    if (state.sample !== "primary") payload.p = URL_SAMPLE_CODES[state.sample];
    if (state.fit !== "lognormal") payload.g = URL_FIT_CODES[state.fit];
    if (state.weightings.size) payload.w = [...state.weightings].map((key) => URL_WEIGHT_CODES[key]).join("");
    if (Object.keys(parameters).length) payload.x = parameters;
    if (state.quantileGranularity !== "quintiles") payload.q = URL_QUANTILE_CODES[state.quantileGranularity];
    if (state.quantileGranularity === "custom") payload.z = state.customQuantiles;
    if (Object.keys(discreteOverrides).length) payload.d = discreteOverrides;
    if (Object.keys(filterState).length) payload.f = filterState;
    if (Object.keys(ranges).length) payload.r = ranges;
    if (inclusionOverrides.length) payload.i = inclusionOverrides;
    if (customOverrides.length) payload.c = customOverrides;
    return payload;
  }

  function writeUrlState() {
    urlSyncFrame = 0;
    if (!urlSyncReady) return;
    const url = new URL(window.location.href);
    const payload = sharePayload();
    if (Object.keys(payload).length === 1) url.searchParams.delete("s");
    else url.searchParams.set("s", encodeUrlState(payload));
    history.replaceState(null, "", url);
  }

  function scheduleUrlState() {
    if (!urlSyncReady || urlSyncFrame) return;
    urlSyncFrame = requestAnimationFrame(writeUrlState);
  }

  function clearUrlState() {
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    history.replaceState(null, "", url);
  }

  function finiteNumber(value, fallback, minimum = -Infinity, maximum = Infinity) {
    return Number.isFinite(Number(value)) ? clamp(Number(value), minimum, maximum) : fallback;
  }

  function expenseSliderPosition(value) {
    const range = state.ranges.expenses;
    if (value <= range.min) return 0;
    if (value >= range.max) return 1000;
    return Math.round((Math.log(value / range.min) / Math.log(range.max / range.min)) * 1000);
  }

  function syncControlsFromState() {
    refs.stream.value = state.stream;
    refs.measure.value = state.measure;
    refs.sample.value = state.sample;
    refs.dollarBasis.forEach((radio) => { radio.checked = radio.value === (state.inflationAdjusted ? "adjusted" : "nominal"); });
    refs.fit.forEach((radio) => { radio.checked = radio.value === state.fit; });
    refs.view.forEach((radio) => { radio.checked = radio.value === state.view; });
    refs.scatterX.value = state.scatterX;
    refs.chartColor.value = state.chartColor;
    refs.showContours.checked = state.showContours;
    refs.targetExpense.value = state.targetExpense / 1_000_000;
    refs.targetStaff.value = state.targetStaff;
    refs.expenseBandwidth.value = state.expenseBandwidth;
    refs.staffBandwidth.value = state.staffBandwidth;
    refs.recencyHalfLife.value = state.recencyHalfLife;
    refs.bins.value = state.bins;
    refs.quantileGranularity.value = state.quantileGranularity;
    refs.customQuantiles.value = state.customQuantiles;
    refs.markCurve.checked = state.markCurve;
    refs.salaryMin.value = state.ranges.salary.low;
    refs.salaryMax.value = state.ranges.salary.high;
    refs.expenseMin.value = expenseSliderPosition(state.ranges.expenses.low);
    refs.expenseMax.value = expenseSliderPosition(state.ranges.expenses.high);
    updateRangeLabels();
  }

  function expandCompactUrlState(payload) {
    if (![2, URL_STATE_VERSION].includes(payload?.v)) return payload;
    const version = payload.v;
    const custom = {};
    (payload.c || []).forEach(([code, value]) => {
      const row = shareRowCodes.get(String(code));
      if (!row) return;
      const stream = rowStream(row);
      if (!custom[stream]) custom[stream] = [];
      custom[stream].push([row.id, value]);
    });
    const discrete = {};
    Object.entries(payload.d || {}).forEach(([code, values]) => {
      if (URL_WEIGHT_KEYS[code]) discrete[URL_WEIGHT_KEYS[code]] = values;
    });
    const filters = {};
    Object.entries(payload.f || {}).forEach(([code, values]) => {
      if (URL_FILTER_KEYS[code]) filters[URL_FILTER_KEYS[code]] = values;
    });
    return {
      v: 1,
      a: {
        s: payload.e ? URL_STREAM_KEYS[payload.e] : version === 2 ? "incumbents" : "combined",
        m: URL_MEASURE_KEYS[payload.m], p: URL_SAMPLE_KEYS[payload.p],
        ia: payload.n !== 1,
        d: URL_FIT_KEYS[payload.g],
        w: [...String(payload.w || "")].map((code) => URL_WEIGHT_KEYS[code]).filter(Boolean),
        te: payload.x?.e, ts: payload.x?.s, eb: payload.x?.b, sb: payload.x?.f, rh: payload.x?.r,
        q: URL_QUANTILE_KEYS[payload.q], qq: payload.z,
      },
      d: discrete,
      f: filters,
      r: payload.r,
      i: (payload.i || []).map(([code, selected]) => [shareRowCodes.get(String(code))?.id, selected]).filter(([id]) => id),
      c: custom,
    };
  }

  function restoreUrlState(payload) {
    const sourceVersion = payload?.v;
    const compactVersion = [2, URL_STATE_VERSION].includes(payload?.v);
    payload = expandCompactUrlState(payload);
    if (!payload || payload.v !== 1 || typeof payload.a !== "object") throw new Error("Unsupported or incomplete state version.");
    const analysis = payload.a;
    const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    state.stream = enumValue(analysis.s, ["incumbents", "jobAds", "combined"], sourceVersion === 1 ? "incumbents" : state.stream);
    state.measure = enumValue(analysis.m, ["base", "cash", "total"], state.measure);
    state.inflationAdjusted = analysis.ia !== false;
    if (state.stream === "combined") state.measure = "base";
    state.sample = enumValue(analysis.p, ["primary", "clean", "tierA", "observed"], state.sample);
    state.fit = enumValue(analysis.d, ["empirical", "lognormal", "gamma"], state.fit);
    const validWeights = [...DISCRETE_WEIGHT_KEYS, "comparability", "size", "staff", "recency", "streamBalanced"];
    state.weightings = new Set((Array.isArray(analysis.w) ? analysis.w : []).filter((value) => validWeights.includes(value)));
    state.targetExpense = finiteNumber(analysis.te, state.targetExpense, 1_000_000, 100_000_000);
    state.targetStaff = finiteNumber(analysis.ts, state.targetStaff, 1, 1000);
    state.expenseBandwidth = finiteNumber(analysis.eb, state.expenseBandwidth, 0.2, 1.5);
    state.staffBandwidth = finiteNumber(analysis.sb, state.staffBandwidth, 0.2, 1.5);
    state.recencyHalfLife = finiteNumber(analysis.rh, state.recencyHalfLife, 1, 12);
    state.bins = Math.round(finiteNumber(analysis.b, state.bins, 2, 200));
    state.autoBins = compactVersion;
    state.view = enumValue(analysis.vw, ["histogram", "scatter"], state.view);
    state.scatterX = enumValue(analysis.x, Object.keys(scatterVariables), state.scatterX);
    state.chartColor = enumValue(analysis.c, ["tier", "topic", "eaAffinity", "sourceType", "titleGroup", "structure"], state.chartColor);
    state.showContours = analysis.co !== 0;
    state.quantileGranularity = enumValue(analysis.q, ["quintiles", "deciles", "percentiles", "custom"], state.quantileGranularity);
    state.customQuantiles = typeof analysis.qq === "string" ? analysis.qq : state.customQuantiles;
    state.markCurve = analysis.qm !== 0;
    state.sortKey = typeof analysis.sk === "string" ? analysis.sk : state.sortKey;
    state.sortDirection = analysis.sd === "desc" ? "desc" : "asc";
    state.filters = Object.fromEntries(Object.keys(state.filters).map((key) => [key, Array.isArray(payload.f?.[key]) ? new Set(payload.f[key].map(String)) : null]));
    state.discreteWeights = {};
    Object.entries(payload.d || {}).forEach(([key, overrides]) => {
      if (!DISCRETE_WEIGHT_KEYS.includes(key) || !overrides || typeof overrides !== "object") return;
      const values = ensureDiscreteWeights(key);
      Object.entries(overrides).forEach(([category, value]) => { values[category] = finiteNumber(value, defaultDiscreteWeight(key, category), 0, 10); });
    });
    Object.keys(modifiedWeightIds).forEach((stream) => {
      modifiedWeightIds[stream].clear();
      (payload.c?.[stream] || []).forEach(([id, value]) => {
        if (!customWeights[stream].has(id)) return;
        customWeights[stream].set(id, finiteNumber(value, 1, 0, 10));
        modifiedWeightIds[stream].add(id);
      });
    });
    applyPreset();
    configureRanges();
    const salaryRange = payload.r?.s;
    const expenseRange = payload.r?.e;
    if (Array.isArray(salaryRange) && salaryRange.length === 2) {
      state.ranges.salary.low = finiteNumber(salaryRange[0], state.ranges.salary.min, state.ranges.salary.min, state.ranges.salary.max);
      state.ranges.salary.high = finiteNumber(salaryRange[1], state.ranges.salary.max, state.ranges.salary.low, state.ranges.salary.max);
    }
    if (Array.isArray(expenseRange) && expenseRange.length === 2) {
      state.ranges.expenses.low = finiteNumber(expenseRange[0], state.ranges.expenses.min, state.ranges.expenses.min, state.ranges.expenses.max);
      state.ranges.expenses.high = finiteNumber(expenseRange[1], state.ranges.expenses.max, state.ranges.expenses.low, state.ranges.expenses.max);
    }
    (payload.i || []).forEach(([id, selected]) => {
      const row = rows().find((candidate) => candidate.id === id);
      if (row) rowInclusion(row).set(id, selected === 1);
    });
    syncControlsFromState();
  }

  function renderAll() {
    updateHeadings();
    renderWeightProfiles();
    renderChart();
    renderQuantiles();
    renderTable();
    scheduleUrlState();
  }

  function reset() {
    const resumeUrlSync = urlSyncReady;
    urlSyncReady = false;
    Object.assign(state, {
      stream: "combined", measure: "base", inflationAdjusted: true, sample: "primary", fit: "lognormal", weightings: new Set(), discreteWeights: {},
      targetExpense: RP_REFERENCE.expenses, targetStaff: RP_REFERENCE.staff, expenseBandwidth: 0.7, staffBandwidth: 0.7, recencyHalfLife: 4,
      bins: 20, autoBins: true, view: "histogram", scatterX: "expenses", chartColor: "tier", showContours: true,
      quantileGranularity: "quintiles", customQuantiles: "5, 25, 50, 75, 95", markCurve: true,
      sortKey: "tier", sortDirection: "asc",
      filters: {
        title: null, sourceType: null, tier: null, topic: null, location: null,
        eaAffinity: null, structure: null,
      },
      ranges: {
        salary: { min: null, max: null, low: null, high: null },
        expenses: { min: null, max: null, low: null, high: null },
      },
      focusedId: "", hoverQuantile: null,
    });
    Object.entries({ incumbents: DATA.incumbents, jobAds: DATA.jobAds }).forEach(([stream, streamRows]) => {
      modifiedWeightIds[stream].clear();
      streamRows.forEach((row) => { inclusion[stream].set(row.id, Boolean(row.defaultIncluded)); customWeights[stream].set(row.id, 1); });
    });
    refs.stream.value = state.stream; refs.measure.value = state.measure; refs.sample.value = state.sample;
    refs.dollarBasis.forEach((radio) => { radio.checked = radio.value === "adjusted"; });
    refs.fit.forEach((radio) => { radio.checked = radio.value === state.fit; });
    refs.view.forEach((radio) => { radio.checked = radio.value === state.view; });
    refs.scatterX.value = state.scatterX; refs.chartColor.value = state.chartColor; refs.showContours.checked = true;
    refs.targetExpense.value = RP_REFERENCE.expenses / 1_000_000; refs.targetStaff.value = RP_REFERENCE.staff;
    refs.expenseBandwidth.value = 0.7; refs.staffBandwidth.value = 0.7; refs.recencyHalfLife.value = 4; refs.bins.value = state.bins;
    refs.quantileGranularity.value = "quintiles";
    refs.markCurve.checked = true;
    refs.customQuantiles.value = state.customQuantiles;
    applyPreset(); configureRanges(); buildFilterMenus(); renderWeightControls();
    renderAll();
    clearUrlState();
    urlSyncReady = resumeUrlSync;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
  }

  refs.stream.addEventListener("change", () => {
    state.stream = refs.stream.value; state.focusedId = ""; state.autoBins = true;
    if (state.stream === "combined") { state.measure = "base"; refs.measure.value = "base"; }
    state.filters = {
      title: null, sourceType: null, tier: null, topic: null, location: null,
      eaAffinity: null, structure: null,
    };
    applyPreset(); configureRanges(); buildFilterMenus(); renderWeightControls(); renderAll();
  });
  refs.measure.addEventListener("change", () => {
    state.measure = refs.measure.value; state.focusedId = ""; state.autoBins = true;
    applyPreset(); configureRanges(); renderAll();
  });
  refs.dollarBasis.forEach((radio) => radio.addEventListener("change", () => {
    if (!radio.checked) return;
    const expenseRange = { ...state.ranges.expenses };
    state.inflationAdjusted = radio.value === "adjusted";
    state.autoBins = true;
    configureRanges();
    state.ranges.expenses = expenseRange;
    refs.expenseMin.value = expenseSliderPosition(expenseRange.low);
    refs.expenseMax.value = expenseSliderPosition(expenseRange.high);
    updateRangeLabels();
    renderAll();
  }));
  refs.sample.addEventListener("change", () => { state.sample = refs.sample.value; applyPreset(); renderAll(); });
  refs.fit.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.fit = radio.value; renderAll(); } }));
  refs.weightingComponents.forEach((input) => input.addEventListener("change", () => {
    if (input.checked && input.value === "comparability") {
      const balanceStreams = state.weightings.has("streamBalanced");
      state.weightings.clear();
      state.weightings.add("comparability");
      if (balanceStreams) state.weightings.add("streamBalanced");
    } else if (input.checked) {
      if (input.value !== "streamBalanced") state.weightings.delete("comparability");
      state.weightings.add(input.value);
    } else state.weightings.delete(input.value);
    renderWeightControls(); renderAll();
  }));
  refs.targetExpense.addEventListener("change", () => { state.targetExpense = clamp(Number(refs.targetExpense.value) || RP_REFERENCE.expenses / 1_000_000, 1, 100) * 1_000_000; renderAll(); });
  refs.targetStaff.addEventListener("change", () => { state.targetStaff = clamp(Number(refs.targetStaff.value) || RP_REFERENCE.staff, 1, 1000); renderAll(); });
  refs.expenseBandwidth.addEventListener("input", () => { state.expenseBandwidth = Number(refs.expenseBandwidth.value); renderAll(); });
  refs.staffBandwidth.addEventListener("input", () => { state.staffBandwidth = Number(refs.staffBandwidth.value); renderAll(); });
  refs.recencyHalfLife.addEventListener("input", () => { state.recencyHalfLife = Number(refs.recencyHalfLife.value); renderAll(); });
  refs.bins.addEventListener("input", () => { state.autoBins = false; state.bins = Number(refs.bins.value); renderAll(); });
  refs.quantileGranularity.addEventListener("change", () => { state.quantileGranularity = refs.quantileGranularity.value; renderQuantiles(); renderChart(); });
  refs.customQuantiles.addEventListener("input", () => { state.customQuantiles = refs.customQuantiles.value; renderQuantiles(); renderChart(); });
  refs.markCurve.addEventListener("change", () => { state.markCurve = refs.markCurve.checked; renderChart(); });
  refs.view.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.view = radio.value; renderAll(); } }));
  refs.scatterX.addEventListener("change", () => { state.scatterX = refs.scatterX.value; renderChart(); });
  refs.chartColor.addEventListener("change", () => { state.chartColor = refs.chartColor.value; renderAll(); });
  refs.showContours.addEventListener("change", () => { state.showContours = refs.showContours.checked; renderChart(); });
  refs.salaryMin.addEventListener("input", () => updateRange("salary", "low"));
  refs.salaryMax.addEventListener("input", () => updateRange("salary", "high"));
  refs.expenseMin.addEventListener("input", () => updateRange("expenses", "low"));
  refs.expenseMax.addEventListener("input", () => updateRange("expenses", "high"));
  refs.reset.addEventListener("click", reset);
  document.addEventListener("change", scheduleUrlState);
  document.addEventListener("input", scheduleUrlState);
  document.querySelectorAll("thead button[data-sort]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    else { state.sortKey = key; state.sortDirection = "asc"; }
    renderTable();
    scheduleUrlState();
  }));

  const observer = new ResizeObserver(() => renderChart());
  observer.observe(refs.chartWrap);
  const tableObserver = new ResizeObserver(scheduleTableStickyOffset);
  tableObserver.observe(refs.tableScroll);
  refs.organizationPreview.addEventListener("pointerenter", () => window.clearTimeout(organizationPreviewHideTimer));
  refs.organizationPreview.addEventListener("pointerleave", scheduleOrganizationPreviewHide);
  $("#archive-status").textContent = `${DATA.summary.retrievedManifestRecords} / ${DATA.summary.retrievedManifestRecords} sources`;
  const encodedInitialState = new URL(window.location.href).searchParams.get("s");
  if (encodedInitialState) {
    try {
      restoreUrlState(decodeUrlState(encodedInitialState));
    } catch (error) {
      applyPreset();
      configureRanges();
      syncControlsFromState();
      refs.urlStateError.textContent = "This shared analysis link could not be read, so the default settings were loaded.";
      refs.urlStateError.hidden = false;
      console.warn("Unable to restore shared benchmark state", error);
    }
  } else {
    applyPreset();
    configureRanges();
    syncControlsFromState();
  }
  buildFilterMenus();
  renderWeightControls();
  initializeHelpTooltips();
  renderAll();
  urlSyncReady = true;
})();
