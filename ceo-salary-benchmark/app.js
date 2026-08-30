(() => {
  "use strict";

  const appBaseUrl = new URL(".", document.currentScript?.src || window.location.href);
  let appBase = document.querySelector("base");
  if (!appBase) {
    appBase = document.createElement("base");
    appBase.dataset.runtimeAppBase = "";
    document.head.prepend(appBase);
  }
  appBase.href = appBaseUrl.href;

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
  const RP_WEIGHT_TARGET = Object.freeze({ expenses: 7_500_000, staff: 57 });
  const RP_FORM990_PROFILE = Object.freeze({
    expenses: Number(DATA.rpReference?.expenses),
    staff: Number(DATA.rpReference?.staff),
  });
  if (!(RP_FORM990_PROFILE.expenses > 0) || !(RP_FORM990_PROFILE.staff > 0)) {
    throw new Error("The same-source RP Form 990 scale profile is unavailable.");
  }
  const AUTO_WEIGHT_TOOLTIP = `Automatic weights never use salary. Form 990 records receive more weight when their reported expenses and employee counts are closer to RP's Form 990 values (${compactMoney(RP_FORM990_PROFILE.expenses)} and ${RP_FORM990_PROFILE.staff} employees). Job postings use a separate similarity score based only on non-pay information. Missing organization-size information reduces a record's weight. The target effective sample size controls how concentrated the Form 990 weights may become; pay-source balancing and your adjustments are applied afterward.`;
  const DEFAULT_POSITION = Object.freeze({
    key: "ceo", label: "CEO", pageLabel: "CEO", defaultMeasure: "base",
    description: "Reviewed CEO pay benchmark using Form 990 filings and job postings.",
  });
  const POSITION_CATALOG = (() => {
    const supplied = Array.isArray(DATA.positionCatalog) ? DATA.positionCatalog : [];
    const catalog = supplied.some((position) => position.key === "ceo")
      ? supplied
      : [DEFAULT_POSITION, ...supplied];
    const byKey = new Map();
    catalog.filter((position) => position.key === "ceo" || !position.supportLevel || position.supportLevel === "primary").forEach((position) => {
      if (!position?.key || byKey.has(position.key)) throw new Error(`Invalid or duplicate position key: ${position?.key || "blank"}`);
      byKey.set(position.key, {
        ...position,
        label: position.label || position.key,
        pageLabel: position.pageLabel || position.label || position.key,
        defaultMeasure: ["base", "cash", "total"].includes(position.defaultMeasure)
          ? position.defaultMeasure : position.key === "ceo" ? "base" : "cash",
      });
    });
    if (!byKey.has("ceo")) byKey.set("ceo", DEFAULT_POSITION);
    return [byKey.get("ceo"), ...[...byKey.values()].filter((position) => position.key !== "ceo")];
  })();
  const POSITION_BY_KEY = new Map(POSITION_CATALOG.map((position) => [position.key, position]));
  const POSITION_ROUTE_KEY_BY_SLUG = new Map(
    POSITION_CATALOG.map((position) => [`${position.key.replaceAll("_", "-")}-salary-benchmark`, position.key]),
  );

  function positionRouteSlug(key) {
    if (!POSITION_BY_KEY.has(key)) throw new Error(`No public route for position: ${key}`);
    return `${key.replaceAll("_", "-")}-salary-benchmark`;
  }

  function positionRoutePath(key) {
    return `/${positionRouteSlug(key)}/`;
  }

  function positionFromPath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    if (segments.at(-1) === "index.html") segments.pop();
    return POSITION_ROUTE_KEY_BY_SLUG.get(segments.at(-1) || "") || "";
  }

  const INITIAL_ROUTE_POSITION = positionFromPath(window.location.pathname);
  const USE_SEMANTIC_POSITION_ROUTES = /^https?:$/.test(window.location.protocol)
    && Boolean(INITIAL_ROUTE_POSITION);
  const STANDALONE_ROUTE_PATH = window.location.pathname;

  function positionDefinition(key = state.position) {
    return POSITION_BY_KEY.get(key) || POSITION_BY_KEY.get("ceo") || DEFAULT_POSITION;
  }

  function positionIncumbents(key = state.position) {
    if (key === "ceo") return DATA.incumbents;
    return Array.isArray(DATA.positionObservations?.[key]) ? DATA.positionObservations[key] : [];
  }

  function positionJobAds(key = state.position) {
    return key === "ceo" ? DATA.jobAds : [];
  }

  function activeRpReferences(key = state.position) {
    if (key === "ceo") return DATA.rpReference ? [DATA.rpReference] : [];
    return Array.isArray(DATA.rpReferencesByPosition?.[key]) ? DATA.rpReferencesByPosition[key] : [];
  }

  const allPositionIncumbents = Object.entries(DATA.positionObservations || {})
    .filter(([key]) => key !== "ceo" && POSITION_BY_KEY.has(key))
    .flatMap(([, positionRows]) => Array.isArray(positionRows) ? positionRows : []);
  const allRowsByStream = {
    incumbents: [...DATA.incumbents, ...allPositionIncumbents],
    jobAds: [...DATA.jobAds],
  };
  Object.entries(allRowsByStream).forEach(([stream, streamRows]) => {
    const ids = new Set();
    streamRows.forEach((row) => {
      if (!row?.id || ids.has(row.id)) throw new Error(`Missing or duplicate ${stream} observation id: ${row?.id || "blank"}`);
      ids.add(row.id);
    });
  });

  const state = {
    position: "ceo",
    stream: "combined",
    measure: "base",
    inflationAdjusted: true,
    sample: "primary",
    fit: "lognormal",
    weightings: new Set(),
    autoTargetEss: 35,
    discreteWeights: {},
    targetExpense: RP_WEIGHT_TARGET.expenses,
    targetStaff: RP_WEIGHT_TARGET.staff,
    expenseBandwidth: 0.7,
    staffBandwidth: 0.7,
    recencyHalfLife: 4,
    bins: 20,
    autoBins: true,
    view: "histogram",
    axisModes: { histogram: "value", scatterX: "value", scatterY: "value" },
    axisScales: { histogram: "linear", scatterX: "log", scatterY: "linear" },
    histogramAxis: { numerator: "salary", denominator: "expenses" },
    scatterXAxis: { numerator: "expenses", denominator: "staff" },
    scatterYAxis: { numerator: "salary", denominator: "expenses" },
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
      matchScore: { min: 0, max: 100, low: 0, high: 100 },
    },
    focusedId: "",
    hoverQuantile: null,
  };

  const inclusion = {
    incumbents: new Map(allRowsByStream.incumbents.map((row) => [row.id, Boolean(row.defaultIncluded)])),
    jobAds: new Map(allRowsByStream.jobAds.map((row) => [row.id, Boolean(row.defaultIncluded)])),
  };
  const customWeights = {
    incumbents: new Map(allRowsByStream.incumbents.map((row) => [row.id, 1])),
    jobAds: new Map(allRowsByStream.jobAds.map((row) => [row.id, 1])),
  };
  const modifiedWeightIds = {
    incumbents: new Set(),
    jobAds: new Set(),
  };
  const wikipediaCache = new Map();
  let organizationPreviewHideTimer = 0;
  let helpTooltipGlobalListenersBound = false;
  let activeAxisSelector = "";

  const refs = {
    appTitle: $("#app-title"), appDescription: $("#app-description"),
    position: $("#position-select"), positionSelectedLabel: $("#position-selected-label"),
    positionDescription: $("#position-description"),
    stream: $("#stream-select"), streamDescription: $("#stream-description"),
    measure: $("#measure-select"), measureField: $("#measure-field"),
    dollarBasis: [...document.querySelectorAll('input[name="dollar-basis"]')], priceBasisStatus: $("#price-basis-status"),
    sample: $("#sample-select"), fit: [...document.querySelectorAll('input[name="distribution"]')],
    weightingComponents: [...document.querySelectorAll('.weighting-field input[type="checkbox"]')],
    sizeControls: $("#size-controls"), expenseTargetField: $("#expense-target-field"), staffTargetField: $("#staff-target-field"),
    recencyField: $("#recency-field"), targetExpense: $("#target-expense"), targetStaff: $("#target-staff"),
    expenseBandwidth: $("#expense-bandwidth"), staffBandwidth: $("#staff-bandwidth"), recencyHalfLife: $("#recency-halflife"),
    expenseBandwidthValue: $("#expense-bandwidth-value"), staffBandwidthValue: $("#staff-bandwidth-value"),
    recencyHalfLifeValue: $("#recency-halflife-value"), discreteWeightEditors: $("#discrete-weight-editors"),
    binField: $("#bin-field"), bins: $("#bin-count"), binValue: $("#bin-value"),
    view: [...document.querySelectorAll('input[name="chart-view"]')],
    axisModes: {
      histogram: [...document.querySelectorAll('input[name="histogram-axis-mode"]')],
      scatterX: [...document.querySelectorAll('input[name="scatter-x-axis-mode"]')],
      scatterY: [...document.querySelectorAll('input[name="scatter-y-axis-mode"]')],
    },
    axisScales: {
      histogram: [...document.querySelectorAll('input[name="histogram-axis-scale"]')],
      scatterX: [...document.querySelectorAll('input[name="scatter-x-axis-scale"]')],
      scatterY: [...document.querySelectorAll('input[name="scatter-y-axis-scale"]')],
    },
    histogramAxisSettings: $("#histogram-axis-settings"), scatterAxisSettings: $("#scatter-axis-settings"),
    scatterControls: $("#scatter-controls"), contourField: $("#contour-field"),
    chartColor: $("#chart-color"), colorDescription: $("#color-description"), showContours: $("#show-contours"),
    comparabilityProfileField: $("#comparability-profile-field"),
    autoTargetEssField: $("#auto-target-ess-field"),
    autoTargetEss: $("#auto-target-ess"), autoTargetEssValue: $("#auto-target-ess-value"),
    autoWeightNote: $("#auto-weight-note"),
    weightProfileSlots: new Map(["comparability", "size", "staff", "recency"].map((key) => [key, $(`#weight-profile-${key}`)])),
    rpScaleReference: $("#rp-scale-reference"),
    reset: $("#reset-settings"), chart: $("#salary-chart"), chartWrap: $("#chart-wrap"),
    tooltip: $("#chart-tooltip"), chartTitle: $("#chart-title"), scatterCorrelations: $("#scatter-correlations"),
    axisSelector: $("#axis-selector-popover"), axisSelectorTitle: $("#axis-selector-title"),
    axisNumerator: $("#axis-numerator"), axisNumeratorLabel: $("#axis-numerator-label"), axisDenominator: $("#axis-denominator"),
    axisDenominatorField: $("#axis-denominator-field"), axisSelectorClose: $("#axis-selector-close"),
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
    matchScoreMin: $("#match-score-range-min"), matchScoreMax: $("#match-score-range-max"),
    matchScoreRangeValue: $("#match-score-range-value"), matchScoreFilterSummary: $("#match-score-filter-summary"),
    matchScoreFilterStatus: $("#match-score-filter-status"),
    adjustedCompensationSort: $("#adjusted-compensation-sort"),
    adjustedCompensationTerm: $("#adjusted-compensation-term"),
    reportedCompensationSort: $("#reported-compensation-sort"),
    reportedCompensationTerm: $("#reported-compensation-term"),
    tablePanel: $("#evidence-table-panel"), tableScroll: $(".table-scroll"),
    tableBody: $("#organization-table tbody"), dialog: $("#source-dialog"),
    helpTooltip: $("#help-tooltip"), organizationPreview: $("#organization-preview"),
    urlStateError: $("#url-state-error"),
  };

  function rows() {
    const incumbents = positionIncumbents();
    const jobAds = positionJobAds();
    if (state.stream === "combined") return [...incumbents, ...jobAds];
    return state.stream === "incumbents" ? incumbents : jobAds;
  }

  function isCeoPosition() { return state.position === "ceo"; }

  function populatePositionSelect() {
    refs.position.replaceChildren();
    const groups = new Map();
    POSITION_CATALOG.forEach((position) => {
      const groupLabel = position.menuGroup || (position.key === "ceo" ? "Chief executive" : "Other positions");
      if (!groups.has(groupLabel)) {
        const group = document.createElement("optgroup");
        group.label = groupLabel;
        groups.set(groupLabel, group);
        refs.position.append(group);
      }
      const option = document.createElement("option");
      option.value = position.key;
      const count = position.counts?.defaultAvailable ?? position.counts?.defaultIncluded;
      option.textContent = Number.isFinite(count) ? `${position.label} (n = ${count})` : position.label;
      groups.get(groupLabel).append(option);
    });
    refs.position.value = state.position;
    refs.positionSelectedLabel.textContent = positionDefinition().pageLabel;
  }

  function clearAnalyticalFilters() {
    state.filters = {
      title: null, sourceType: null, tier: null, topic: null, location: null,
      eaAffinity: null, structure: null,
    };
  }

  function positionRowsForReset(key = state.position) {
    return [...positionIncumbents(key), ...positionJobAds(key)];
  }

  function rowStream(row) {
    return row.evidenceStream || (row.sourceType === "Job posting" ? "jobAds" : "incumbents");
  }

  function rowInclusion(row) { return inclusion[rowStream(row)]; }
  function rowCustomWeights(row) { return customWeights[rowStream(row)]; }
  function rowModifiedWeights(row) { return modifiedWeightIds[rowStream(row)]; }
  function roleHolder(row) { return row.executive || row.personName || ""; }

  const DISCRETE_WEIGHT_KEYS = ["tier", "eaAffinity", "sourceType", "topic", "titleGroup", "structure"];
  const WEIGHT_LABELS = {
    comparability: "Automatic weights", size: "Expenses", staff: "Staff", recency: "Recency",
    tier: "Peer group", eaAffinity: "Effective Altruism", sourceType: "Pay source", topic: "Area",
    titleGroup: "Title", structure: "Organization type", streamBalanced: "Balance pay sources",
  };
  const DISCRETE_WEIGHT_NOTES = {
    tier: "Suggested values give the closest peer groups more influence and broader comparison groups less.",
    eaAffinity: "Suggested values give more influence to organizations with a documented connection to effective altruism, while leaving unclassified records neutral.",
    sourceType: "Suggested values give reported Form 990 pay full influence and job-posting midpoints slightly less because postings are offers rather than pay already received.",
    topic: "Suggested values give more influence to RP cause areas and research, evidence, evaluation, policy, or advisory work.",
    titleGroup: "Suggested values give CEO roles full influence, followed by Executive Director, President, other executive, and unreported titles.",
    structure: "Suggested values give more influence to independent, board-accountable nonprofits and less to affiliates, sponsored projects, unclear organizations, or subordinate roles.",
  };

  function defaultDiscreteWeight(key, value) {
    const normalized = String(value || "").toLowerCase();
    if (key === "titleGroup" && !isCeoPosition()) return 1;
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
      if (normalized === "nonprofit network" || normalized.includes("membership nonprofit")) return normalized.includes("fiscal sponsor") ? 0.55 : 0.75;
      if (normalized.includes("boards of the affiliated")) return 0.85;
      if (normalized === "affiliated nonprofit group") return 0.65;
      if (normalized.includes("fiscal") || normalized.includes("international nonprofit affiliate") || normalized.includes("university-affiliated")) return 0.55;
      if (normalized.includes("nonprofit/project")) return 0.65;
      if (normalized.includes("advisory board")) return 0.7;
      if (normalized.includes("chief operating officer") || normalized === "subordinate regional unit" || normalized === "university center") return 0.35;
      if (normalized === "public agency / nonprofit hybrid") return 0.5;
      if (normalized === "nonprofit funder" || normalized === "public-private grantmaking endowment") return 0.45;
      if (normalized === "public charity / donor-advised fund") return 0.4;
      if (normalized === "private foundation") return 0.3;
      if (normalized.includes("not extracted") || normalized.includes("not reported")) return 0.6;
      return 0.7;
    }
    if (key === "topic") {
      const recruitmentTopics = {
        "research, evaluation, and policy": 0.9,
        "climate, environment, and conservation": 0.9,
        "philanthropy and nonprofit infrastructure": 0.75,
        "health, workforce, and biomedical research": 0.85,
        "justice, housing, and social policy": 0.8,
        "journalism and knowledge dissemination": 0.65,
        "education, culture, and public engagement": 0.6,
        "conflict prevention and security": 0.8,
      };
      if (recruitmentTopics[normalized] != null) return recruitmentTopics[normalized];
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
    const normalized = String(category || "Not reported").toLowerCase();
    let explanation;
    if (key === "tier") {
      if (normalized === "a") explanation = "These are the closest Form 990 peers based on role, mission, organization size, and organization type.";
      else if (normalized === "b") explanation = "These are broader Form 990 peers with one meaningful difference in size, mission, location, or organization type.";
      else if (normalized === "c") explanation = "These are the broadest usable Form 990 peers, with larger differences from RP.";
      else if (normalized === "strict_primary") explanation = "These job postings most closely match RP: a current, full-time top executive with board accountability and a similar knowledge-focused organization.";
      else if (normalized.includes("expanded_primary")) explanation = "These job postings remain close matches but differ somewhat in title, mission mix, or overall fit.";
      else if (normalized.includes("scale_unknown")) explanation = "This role is a useful match, but the available sources did not establish the organization's size.";
      else if (normalized.includes("scale")) explanation = "This is a broader comparison because its expenses or staff size differ from RP.";
      else if (normalized.includes("structural")) explanation = "This is a broader comparison because its governance, affiliation, sponsorship, grantmaking, or multi-organization leadership differs from RP.";
      else if (normalized.includes("broad_functional")) explanation = "Some duties overlap with RP, but the mission or operating model is less similar.";
      else if (normalized.includes("date_ambiguity")) explanation = "The posting's dates conflict, so it is kept only as a broader comparison case.";
      else if (normalized.includes("older_structural")) explanation = "This is an older posting with an important organization-type difference and is kept only as a broader comparison case.";
      else if (normalized.includes("fractional")) explanation = "The role is part-time or fractional rather than a standard full-time top executive role.";
      else if (normalized.includes("excluded_grantmaking")) explanation = "Excluded because grantmaking or pass-through stewardship dominates the operating model rather than RP-like knowledge production.";
      else if (normalized.includes("excluded_private_foundation")) explanation = "Excluded because private-foundation governance, endowment, and grantmaking responsibilities are not directly comparable with RP's public-charity operating model.";
      else if (normalized.includes("excluded_subordinate_regional")) explanation = "Excluded because the advertised role leads a regional unit beneath a parent organization rather than the whole organization.";
      else if (normalized.includes("excluded")) explanation = "This record is outside the recommended peer group because of its role, operating model, size, organization type, location, or source quality.";
      else if (normalized.includes("secondary")) explanation = "These postings are useful comparisons with one meaningful difference in size, operating model, location, or organization type.";
      else explanation = "This peer group was assigned from role, mission, size, organization type, location, and source quality.";
      explanation += " Salary was not used to assign the peer group.";
    } else if (key === "eaAffinity") {
      if (normalized.includes("core")) explanation = "The organization or project explicitly identifies with effective altruism.";
      else if (normalized.includes("adjacent")) explanation = "The organization is publicly linked to effective altruism or works prominently in a cause area often recommended by the community.";
      else if (normalized.includes("functional")) explanation = "No connection to effective altruism was required, but the organization uses similar research, evaluation, policy, or advisory methods.";
      else explanation = "The available review did not assign a connection category. This does not mean the organization has no connection, so the suggested weight remains neutral.";
      explanation += " Salary was not used to assign this category.";
    } else if (key === "sourceType") {
      explanation = normalized.includes("form 990")
        ? "Form 990 denotes realized incumbent compensation reported in a nonprofit filing. It is historical and measure-specific; Part VII cash is not automatically exact base salary."
        : "Job posting denotes the inflation-adjusted midpoint of an advertised base-salary range. It is forward-looking offer evidence, not realized compensation.";
    } else if (key === "titleGroup") {
      if (!isCeoPosition()) explanation = "This category groups titles within the selected position while keeping each job title exactly as written in the source. Its suggested weight is neutral and editable.";
      else if (normalized === "ceo") explanation = "CEO groups Chief Executive Officer variants and most directly matches RP's organization-wide chief-executive role.";
      else if (normalized.includes("executive director")) explanation = "Executive Director can be the organization-wide top executive, but the title is less consistent across nonprofits and sometimes denotes a narrower role.";
      else if (normalized.includes("president")) explanation = "President includes President/CEO and President titles as written in the source; similarity depends on whether the person clearly leads the whole organization.";
      else if (normalized.includes("not reported")) explanation = "The preserved record did not provide a usable title group, so role comparability cannot be confirmed from this field.";
      else explanation = "Other executive titles include leadership roles outside the main CEO, Executive Director, and President groups; their authority and scope are less consistent.";
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
      explanation = structures[normalized] || "This organization and leadership type was recorded to show how closely the role resembles RP's top-executive structure.";
    } else {
      const weight = defaultDiscreteWeight(key, category);
      let rationale = "This mission and operating category is used to assess similarity to RP.";
      if (weight === 1) rationale += " It directly overlaps an RP cause area or evidence-oriented priority and receives the reference suggestion.";
      else if (weight >= 0.9) rationale += " It strongly overlaps research, evaluation, evidence, science, policy, data, or advisory work.";
      else if (weight >= 0.75) rationale += " It has a useful field-building, membership, or knowledge role, with a moderate operating-model difference.";
      else if (weight <= 0.45) rationale += " Grantmaking, foundation, or endowment activity is materially less comparable with RP's knowledge-production model.";
      else if (weight <= 0.55) rationale += " Delivery, university, regional, cultural, or local-service features make it a broader functional comparator.";
      else rationale += " It has partial functional overlap but a less direct mission or operating-model match.";
      explanation = `${rationale} Salary was not used to assign the mission area.`;
    }
    return `${explanation} Suggested weight: ${defaultDiscreteWeight(key, category).toFixed(2)}; 1.00 is the reference. You can edit this value.`;
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

  function wikipediaUrl(row) {
    return row.wikipediaUrl || wikipediaSearchUrl(row.organization);
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

  async function wikipediaPreview(row) {
    if (!row.wikipediaTitle) return null;
    if (wikipediaCache.has(row.organization)) return wikipediaCache.get(row.organization);
    const request = (async () => {
      const parameters = new URLSearchParams({
        action: "query", titles: row.wikipediaTitle, prop: "extracts|info",
        exintro: "1", explaintext: "1", exsentences: "2",
        inprop: "url", redirects: "1", format: "json", origin: "*",
      });
      const response = await fetch(`https://en.wikipedia.org/w/api.php?${parameters}`);
      if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
      const payload = await response.json();
      return Object.values(payload.query?.pages || {})[0] || null;
    })().catch(() => null);
    wikipediaCache.set(row.organization, request);
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
    $("#organization-preview-wikipedia").textContent = row.wikipediaTitle
      ? "Loading verified Wikipedia summary…"
      : "No verified Wikipedia article is available for this organization.";
    const homepage = $("#organization-preview-homepage");
    homepage.hidden = !row.homepageUrl; homepage.href = row.homepageUrl || "#";
    const wiki = $("#organization-preview-wiki");
    wiki.href = wikipediaUrl(row);
    wiki.textContent = row.wikipediaTitle ? "Open Wikipedia article ↗" : "Search Wikipedia ↗";
    refs.organizationPreview.hidden = false;
    positionFloating(refs.organizationPreview, anchor, 10);
    const result = await wikipediaPreview(row);
    if (refs.organizationPreview.dataset.rowId !== row.id) return;
    if (!row.wikipediaTitle) return;
    if (!result) {
      $("#organization-preview-wikipedia").textContent = "The verified Wikipedia summary could not be loaded.";
      return;
    }
    $("#organization-preview-wikipedia").textContent = result.extract || "No introductory Wikipedia summary is available.";
    if (result.fullurl) wiki.href = result.fullurl;
    positionFloating(refs.organizationPreview, anchor, 10);
  }

  function salaryForBasis(row, inflationAdjusted) {
    const values = inflationAdjusted ? row.salary : row.nominalSalary;
    const value = rowStream(row) === "jobAds" || state.stream === "combined"
      ? values?.base : values?.[state.measure];
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function salary(row) { return salaryForBasis(row, state.inflationAdjusted); }

  function salaryRange(row) {
    if (rowStream(row) !== "jobAds") return null;
    return state.inflationAdjusted ? row.range : row.nominalRange;
  }

  function reportedSalaryDisplay(row) {
    if (rowStream(row) !== "jobAds" || row.nominalRange?.low == null || row.nominalRange?.high == null) {
      return compactMoney(salaryForBasis(row, false));
    }
    if (row.nominalRange.low === row.nominalRange.high) return compactMoney(row.nominalRange.low);
    return `${compactMoney(row.nominalRange.low)}–${compactMoney(row.nominalRange.high).replace(/^\$/, "")}`;
  }

  function priceBasisLabel() {
    return state.inflationAdjusted ? DATA.priceBasis : "Source-year USD";
  }

  function compensationMeasureLabel() {
    if (isCeoPosition()) return "Salary";
    if (state.measure === "base") return "Base pay";
    if (state.measure === "total") return "Total pay";
    return "Reported pay";
  }

  function compactCompensationMeasureLabel() {
    return isCeoPosition() ? "Salary" : state.measure === "base" ? "Base pay"
      : state.measure === "total" ? "Total pay" : "Reported pay";
  }

  function compactNumber(value) {
    if (value == null || !Number.isFinite(value)) return "—";
    const absolute = Math.abs(value);
    if (absolute >= 1_000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    if (absolute >= 10) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
    if (absolute >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (absolute >= 0.01) return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return value.toPrecision(3);
  }

  const numericVariables = {
    salary: {
      get shortLabel() { return compensationMeasureLabel(); }, label: () => `Annual pay (${priceBasisLabel()})`,
      value: salary, format: compactMoney, fullFormat: money, logarithmic: false,
    },
    expenses: {
      shortLabel: "Expenses", label: () => "Annual expenses",
      value: (row) => row.expenses, format: compactMoney, fullFormat: money, logarithmic: true,
    },
    revenue: {
      shortLabel: "Revenue", label: () => "Annual revenue",
      value: (row) => row.revenue, format: compactMoney, fullFormat: money, logarithmic: true,
    },
    staff: {
      shortLabel: "Staff", label: () => "Staff count",
      value: (row) => row.staff, format: (value) => value == null ? "—" : Math.round(value).toLocaleString("en-US"),
      fullFormat: (value) => value == null ? "—" : `${Math.round(value).toLocaleString("en-US")} staff`, logarithmic: true,
    },
    comparabilityScore: {
      shortLabel: "Similarity score", label: () => "Similarity score",
      value: (row) => row.comparabilityScore, format: (value) => value == null ? "—" : `${Math.round(value)}`,
      fullFormat: (value) => value == null ? "—" : `${Number(value).toFixed(1)} / 100`, logarithmic: false,
    },
    compensationYear: {
      shortLabel: "Pay year", label: () => "Pay year",
      value: (row) => row.compensationYear, format: (value) => value == null ? "—" : `${Math.round(value)}`,
      fullFormat: (value) => value == null ? "—" : `${Math.round(value)}`, logarithmic: false,
    },
  };

  function filingSourceId(row) {
    return row?.sourceId || String(row?.id || "").split("::", 1)[0];
  }

  function sameFilingPositionMatches(row, positionKey) {
    if (!row || !POSITION_BY_KEY.has(positionKey)) return [];
    if (positionKey === state.position) return salary(row) == null ? [] : [row];
    const sourceId = filingSourceId(row);
    if (!sourceId) return [];
    const isRpReference = row.analysisStatus === "reference_not_analyzed" || row.id === DATA.rpReference?.id;
    const candidates = isRpReference
      ? activeRpReferences(positionKey)
      : positionIncumbents(positionKey).filter(presetSelected);
    return candidates.filter((candidate) => (
      filingSourceId(candidate) === sourceId
      && candidate.id !== row.id
      && salaryForBasis(candidate, state.inflationAdjusted) != null
    ));
  }

  function sameFilingPositionSalary(row, positionKey) {
    const matched = sameFilingPositionMatches(row, positionKey);
    return matched.length === 1 ? salaryForBasis(matched[0], state.inflationAdjusted) : null;
  }

  POSITION_CATALOG.forEach((position) => {
    const key = `position:${position.key}`;
    numericVariables[key] = {
      shortLabel: `${position.label} salary`,
      label: () => `${position.label} compensation (${priceBasisLabel()}; unique same-filing match)`,
      value: (row) => sameFilingPositionSalary(row, position.key),
      format: compactMoney,
      fullFormat: money,
      logarithmic: false,
      positionKey: position.key,
    };
  });

  const axisStateKeys = { histogram: "histogramAxis", scatterX: "scatterXAxis", scatterY: "scatterYAxis" };

  function axisExpression(axisKey) { return state[axisStateKeys[axisKey]]; }
  function axisMode(axisKey) { return state.axisModes[axisKey]; }

  function recommendedAxisScale(axisKey) {
    const numerator = numericVariables[axisExpression(axisKey).numerator] || numericVariables.salary;
    return axisMode(axisKey) === "ratio" || numerator.logarithmic ? "log" : "linear";
  }

  function normalizeAxisExpressions(axisKey = null) {
    const axisKeys = axisKey ? [axisKey] : Object.keys(axisStateKeys);
    axisKeys.forEach((key) => {
      if (axisMode(key) !== "ratio") return;
      const expression = axisExpression(key);
      if (expression.numerator !== expression.denominator) return;
      expression.denominator = Object.keys(numericVariables).find((key) => key !== expression.numerator);
    });
  }

  function axisDescriptor(axisKey) {
    const expression = axisExpression(axisKey);
    const numerator = numericVariables[expression.numerator] || numericVariables.salary;
    const denominator = numericVariables[expression.denominator] || numericVariables.expenses;
    const mode = axisMode(axisKey);
    const scaleSetting = state.axisScales[axisKey];
    const logarithmic = scaleSetting === "log";
    if (mode === "value") {
      return {
        axisKey, label: numerator.label(), shortLabel: numerator.shortLabel, format: numerator.format,
        fullFormat: numerator.fullFormat, mode, scaleSetting, logarithmic,
        primaryLabel: (row) => expression.numerator === "salary" ? measureLabel(row) : numerator.label(),
        value: (row) => numerator.value(row),
      };
    }
    return {
      axisKey,
      label: `${numerator.shortLabel} / ${denominator.shortLabel}`,
      shortLabel: `${numerator.shortLabel} / ${denominator.shortLabel}`,
      format: compactNumber,
      fullFormat: (value) => value == null || !Number.isFinite(value) ? "—" : value.toLocaleString("en-US", { maximumSignificantDigits: 5 }),
      mode, scaleSetting, logarithmic,
      primaryLabel: () => `${numerator.shortLabel} / ${denominator.shortLabel}`,
      value: (row) => {
        const top = numerator.value(row);
        const bottom = denominator.value(row);
        return Number.isFinite(top) && Number.isFinite(bottom) && top > 0 && bottom > 0 ? top / bottom : null;
      },
    };
  }

  function axisGeometry(descriptor) {
    return descriptor.logarithmic
      ? { transform: Math.log, inverse: Math.exp, jacobian: (value) => value }
      : { transform: (value) => value, inverse: (value) => value, jacobian: () => 1 };
  }

  function axisDisplayLabel(descriptor) {
    return descriptor.label;
  }

  function variableEligibility(row, variableKey, requirePositive = false) {
    const variable = numericVariables[variableKey];
    if (!variable) return { eligible: false, reason: "The selected measure is unavailable." };
    const value = variable.value(row);
    if (Number.isFinite(value) && (!requirePositive || value > 0)) return { eligible: true, value, reason: "" };
    if (variableKey.startsWith("position:")) {
      const positionKey = variableKey.slice("position:".length);
      const label = POSITION_BY_KEY.get(positionKey)?.label || humanizeCategory(positionKey);
      const matches = sameFilingPositionMatches(row, positionKey);
      if (matches.length > 1) {
        return { eligible: false, value: null, reason: `More than one ${label} compensation row appears in the same filing, so no unique match can be used.` };
      }
      return { eligible: false, value: null, reason: `No unique positive ${label} compensation row is available from the same filing.` };
    }
    const reasons = {
      salary: `No usable ${measureLabel(row)} record is available.`,
      expenses: "Annual expenses are not reported for this record.",
      revenue: "Annual revenue is not reported for this record.",
      staff: "A comparable staff count is not reported for this record.",
      comparabilityScore: "A similarity score is not available for this record.",
      compensationYear: "The pay year is not reported for this record.",
    };
    const label = variable.shortLabel || humanizeCategory(variableKey);
    const reason = Number.isFinite(value) && requirePositive
      ? `${label} must be greater than zero for this plot.`
      : reasons[variableKey] || `${label} is not reported for this record.`;
    return { eligible: false, value: null, reason };
  }

  function axisEligibility(axisKey, row) {
    const expression = axisExpression(axisKey);
    const descriptor = axisDescriptor(axisKey);
    const positiveValueRequired = descriptor.logarithmic || axisKey === "histogram";
    const numerator = variableEligibility(
      row,
      expression.numerator,
      axisMode(axisKey) === "ratio" || positiveValueRequired,
    );
    if (!numerator.eligible) return numerator;
    if (axisMode(axisKey) === "ratio") {
      const denominator = variableEligibility(row, expression.denominator, true);
      if (!denominator.eligible) return denominator;
    }
    const value = descriptor.value(row);
    if (!Number.isFinite(value) || (positiveValueRequired && value <= 0)) {
      return { eligible: false, value: null, reason: `${descriptor.shortLabel} cannot be plotted on the selected axis.` };
    }
    return { eligible: true, value, reason: "" };
  }

  function plotEligibility(row) {
    if (state.view === "histogram") return axisEligibility("histogram", row);
    const horizontal = axisEligibility("scatterX", row);
    if (!horizontal.eligible) return { ...horizontal, reason: `Horizontal axis: ${horizontal.reason}` };
    const vertical = axisEligibility("scatterY", row);
    if (!vertical.eligible) return { ...vertical, reason: `Vertical axis: ${vertical.reason}` };
    return { eligible: true, reason: "" };
  }

  function axisItems(axisKey) {
    const descriptor = axisDescriptor(axisKey);
    return selectedRows((row) => axisEligibility(axisKey, row).eligible)
      .map((item) => ({ ...item, value: descriptor.value(item.row) }));
  }

  function currentPlotItems() {
    if (state.view === "histogram") return axisItems("histogram");
    const xDescriptor = axisDescriptor("scatterX");
    const yDescriptor = axisDescriptor("scatterY");
    return selectedRows((row) => plotEligibility(row).eligible)
      .map((item) => ({
        ...item,
        xValue: xDescriptor.value(item.row),
        yValue: yDescriptor.value(item.row),
        value: yDescriptor.value(item.row),
      }));
  }

  function analysisAxisKey() { return state.view === "scatter" ? "scatterY" : "histogram"; }
  function analysisItems() { return state.view === "scatter" ? currentPlotItems() : axisItems(analysisAxisKey()); }

  function sampleQuantile(values, probability) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const position = clamp(probability, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(position); const upper = Math.ceil(position);
    const fraction = position - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
  }

  function effectiveSampleSize(weights) {
    const sum = weights.reduce((total, value) => total + value, 0);
    const sumSquares = weights.reduce((total, value) => total + value * value, 0);
    return sumSquares > 0 ? (sum * sum) / sumSquares : 0;
  }

  function uniformScaleCalibration(candidateRows, status, distances = null) {
    const distanceMap = distances || new Map(candidateRows.map((row) => [row.id, 0]));
    return {
      bandwidth: null,
      ess: candidateRows.length,
      maximum: candidateRows.length ? 1 : 0,
      expenseScale: null,
      staffScale: null,
      status,
      distances: distanceMap,
      weights: new Map(candidateRows.map((row) => [row.id, 1])),
    };
  }

  function scaleSimilarityCalibration(candidateRows) {
    if (!candidateRows.length) throw new Error("Auto-weight calibration received an empty Form 990 sample.");
    if (candidateRows.length === 1) return uniformScaleCalibration(candidateRows, "uniform_small_sample");
    const logExpenses = candidateRows.map((row) => row.expenses > 0 ? Math.log(row.expenses) : NaN);
    const logStaff = candidateRows.map((row) => row.staff > 0 ? Math.log(row.staff) : NaN);
    const observedExpenses = logExpenses.filter(Number.isFinite);
    const observedStaff = logStaff.filter(Number.isFinite);
    if (observedExpenses.length < 2 || observedStaff.length < 2) {
      return uniformScaleCalibration(candidateRows, "uniform_insufficient_scale");
    }
    const robustScale = (values) => Math.max(
      (sampleQuantile(values, 0.75) - sampleQuantile(values, 0.25)) / 1.349,
      0.1,
    );
    const expenseScale = robustScale(observedExpenses);
    const staffScale = robustScale(observedStaff);
    const expenseMedian = sampleQuantile(observedExpenses, 0.5);
    const staffMedian = sampleQuantile(observedStaff, 0.5);
    const rpExpense = Math.log(RP_FORM990_PROFILE.expenses);
    const rpStaff = Math.log(RP_FORM990_PROFILE.staff);
    const distances = candidateRows.map((row, index) => {
      const expenseMissing = !Number.isFinite(logExpenses[index]);
      const staffMissing = !Number.isFinite(logStaff[index]);
      const expense = expenseMissing ? expenseMedian : logExpenses[index];
      const staff = staffMissing ? staffMedian : logStaff[index];
      const d2 = ((expense - rpExpense) / expenseScale) ** 2
        + ((staff - rpStaff) / staffScale) ** 2
        + Number(expenseMissing) + Number(staffMissing);
      return { row, distance: Math.sqrt(d2) };
    });
    const targetEss = Math.min(state.autoTargetEss, distances.length);
    const distanceMap = new Map(distances.map(({ row, distance }) => [row.id, distance]));
    if (targetEss === distances.length) {
      return uniformScaleCalibration(candidateRows, "uniform_target_exceeds_sample", distanceMap);
    }
    const metricsAt = (bandwidth) => {
      const raw = distances.map(({ distance }) => Math.exp(-0.5 * (distance / bandwidth) ** 2));
      const total = raw.reduce((sum, value) => sum + value, 0);
      const normalized = total > 0 ? raw.map((value) => (raw.length * value) / total) : raw;
      return {
        raw, normalized, ess: effectiveSampleSize(raw),
        maximum: normalized.length ? Math.max(...normalized) : 0,
      };
    };
    let low = 0.05; let high = 1;
    while (high < 512) {
      const metrics = metricsAt(high);
      if (metrics.ess >= targetEss && metrics.maximum <= 6) break;
      high *= 2;
    }
    const feasible = metricsAt(high);
    if (feasible.ess + 1e-8 < targetEss || feasible.maximum > 6 + 1e-8) {
      throw new Error("Auto-weight bandwidth calibration could not satisfy its ESS and maximum-weight constraints.");
    }
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const midpoint = (low + high) / 2;
      const metrics = metricsAt(midpoint);
      if (metrics.ess >= targetEss && metrics.maximum <= 6) high = midpoint;
      else low = midpoint;
    }
    const bandwidth = high;
    const metrics = metricsAt(bandwidth);
    return {
      bandwidth, ess: metrics.ess, maximum: metrics.maximum,
      expenseScale, staffScale,
      status: "adaptive_kernel",
      distances: distanceMap,
      weights: new Map(distances.map(({ row }, index) => [row.id, metrics.normalized[index]])),
    };
  }

  function boundedMeanOneWeights(ratios, minimum = 0.5, maximum = 1.5) {
    if (!ratios.length || ratios.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("Posting Auto-weight normalization received an invalid score ratio.");
    }
    const meanAt = (multiplier) => ratios.reduce(
      (sum, value) => sum + clamp(value * multiplier, minimum, maximum), 0,
    ) / ratios.length;
    let low = 0;
    let high = 1;
    while (meanAt(high) < 1 && high < 1e6) high *= 2;
    if (meanAt(high) < 1) throw new Error("Posting Auto-weights could not be normalized to mean 1 within their bounds.");
    for (let iteration = 0; iteration < 80; iteration += 1) {
      const midpoint = (low + high) / 2;
      if (meanAt(midpoint) >= 1) high = midpoint;
      else low = midpoint;
    }
    const weights = ratios.map((value) => clamp(value * high, minimum, maximum));
    const mean = weights.reduce((sum, value) => sum + value, 0) / weights.length;
    if (Math.abs(mean - 1) > 1e-8) throw new Error("Posting Auto-weights did not normalize to mean 1.");
    return { weights, multiplier: high };
  }

  function postingMatchCalibration(candidateRows) {
    if (!candidateRows.length) throw new Error("Auto-weight calibration received an empty recruitment-posting sample.");
    const scores = candidateRows.map((row) => {
      const score = Number(row.comparabilityScore);
      if (!Number.isFinite(score) || score <= 0) {
        throw new Error(`Invalid frozen match score for recruitment posting ${row.id}.`);
      }
      return score;
    });
    const scoreMean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const ratios = scores.map((score) => score / scoreMean);
    const bounded = boundedMeanOneWeights(ratios);
    return {
      bandwidth: null,
      ess: effectiveSampleSize(bounded.weights),
      maximum: Math.max(...bounded.weights),
      minimum: Math.min(...bounded.weights),
      scoreMean,
      normalizationMultiplier: bounded.multiplier,
      status: "posting_match_score",
      scores: new Map(candidateRows.map((row, index) => [row.id, scores[index]])),
      weights: new Map(candidateRows.map((row, index) => [row.id, bounded.weights[index]])),
    };
  }

  function autoWeightCalibrations(candidateRows) {
    const incumbents = candidateRows.filter((row) => rowStream(row) === "incumbents");
    const jobAds = candidateRows.filter((row) => rowStream(row) === "jobAds");
    const calibrations = new Map();
    if (incumbents.length) calibrations.set("incumbents", scaleSimilarityCalibration(incumbents));
    if (jobAds.length) calibrations.set("jobAds", postingMatchCalibration(jobAds));
    return calibrations;
  }

  function baseWeight(row, autoCalibrations = new Map()) {
    const latestYear = Math.max(...rows().map((item) => item.compensationYear || 0));
    let weight = 1;
    if (state.weightings.has("comparability")) {
      const stream = rowStream(row);
      const autoWeight = autoCalibrations.get(stream)?.weights.get(row.id);
      if (!Number.isFinite(autoWeight) || autoWeight <= 0) throw new Error(`Missing Auto-weight for ${row.id}.`);
      weight *= autoWeight;
    }
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

  function weightedSelection(eligibleForPlot = () => true) {
    const candidateRows = rows()
      .filter((row) => (
        passesFilters(row)
        && salary(row) != null
        && rowInclusion(row).get(row.id)
        && eligibleForPlot(row)
      ));
    const autoCalibrations = state.weightings.has("comparability")
      ? autoWeightCalibrations(candidateRows)
      : new Map();
    const selected = candidateRows
      .map((row) => ({
        row, value: salary(row), automaticWeight: baseWeight(row, autoCalibrations),
        customWeight: rowCustomWeights(row).get(row.id) ?? 1,
      }))
      .filter((item) => item.automaticWeight > 0 && Number.isFinite(item.automaticWeight));
    if (!isCeoPosition()) {
      const organizationTotals = new Map();
      selected.forEach((item) => {
        const organization = String(item.row.organization || "Not reported");
        organizationTotals.set(organization, (organizationTotals.get(organization) || 0) + item.automaticWeight);
      });
      selected.forEach((item) => {
        const organization = String(item.row.organization || "Not reported");
        item.rawWeight = (item.automaticWeight / organizationTotals.get(organization)) * item.customWeight;
      });
    } else {
      const balanceGroupCounts = new Map();
      selected.forEach((item) => {
        const group = String(item.row.organizationBalanceGroup || "").trim();
        if (group) balanceGroupCounts.set(group, (balanceGroupCounts.get(group) || 0) + 1);
      });
      selected.forEach((item) => {
        const group = String(item.row.organizationBalanceGroup || "").trim();
        const organizationShare = group ? 1 / balanceGroupCounts.get(group) : 1;
        item.rawWeight = item.automaticWeight * organizationShare * item.customWeight;
      });
    }
    const positive = selected.filter((item) => item.rawWeight > 0 && Number.isFinite(item.rawWeight));
    if (state.weightings.has("streamBalanced") && state.stream === "combined") {
      const streamTotals = new Map();
      positive.forEach((item) => streamTotals.set(rowStream(item.row), (streamTotals.get(rowStream(item.row)) || 0) + item.rawWeight));
      positive.forEach((item) => { item.rawWeight /= streamTotals.get(rowStream(item.row)) || 1; });
    }
    const mean = positive.length ? positive.reduce((sum, item) => sum + item.rawWeight, 0) / positive.length : 0;
    return positive.map(({ row, value, rawWeight }) => ({ row, value, weight: mean ? rawWeight / mean : 0 }));
  }

  function selectedRows(eligibleForPlot) {
    return weightedSelection(eligibleForPlot);
  }

  function passesFilters(row) {
    const categoricalMatch = Object.entries(state.filters).every(([key, selected]) => {
      if (selected == null) return true;
      return selected.has(String(row[key] || "Not reported"));
    });
    if (!categoricalMatch) return false;
    return ["salary", "expenses", "matchScore"].every((key) => {
      const range = state.ranges[key];
      if (range.min == null || range.max == null) return true;
      const restricted = range.low > range.min || range.high < range.max;
      const value = key === "salary" ? salary(row) : key === "expenses" ? row.expenses : row.comparabilityScore;
      if (value == null) return !restricted;
      return value >= range.low && value <= range.high;
    });
  }

  function presetSelected(row) {
    const available = salary(row) != null;
    if (state.sample === "sensitivity") return Boolean(available && (
      row.defaultIncluded || ["sensitivity_only", "structural_sensitivity"].includes(row.analysisStatus)
    ));
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
    const salaryMin = salaries.length ? Math.floor(Math.min(...salaries) / 10_000) * 10_000 : 0;
    const salaryMax = salaries.length ? Math.max(salaryMin + 10_000, Math.ceil(Math.max(...salaries) / 10_000) * 10_000) : 10_000;
    const expenseMin = expenses.length ? Math.min(...expenses) : 1;
    const expenseMax = expenses.length ? Math.max(expenseMin + 1, Math.max(...expenses)) : 2;
    state.ranges.salary = { min: salaryMin, max: salaryMax, low: salaryMin, high: salaryMax };
    state.ranges.expenses = {
      min: expenseMin, max: expenseMax, low: expenseMin, high: expenseMax,
    };
    state.ranges.matchScore = { min: 0, max: 100, low: 0, high: 100 };
    Object.assign(refs.salaryMin, { min: salaryMin, max: salaryMax, step: 5_000, value: salaryMin });
    Object.assign(refs.salaryMax, { min: salaryMin, max: salaryMax, step: 5_000, value: salaryMax });
    refs.salaryMin.disabled = !salaries.length; refs.salaryMax.disabled = !salaries.length;
    refs.expenseMin.value = 0; refs.expenseMax.value = 1000;
    refs.expenseMin.disabled = !expenses.length; refs.expenseMax.disabled = !expenses.length;
    refs.matchScoreMin.value = 0; refs.matchScoreMax.value = 100;
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
    const lowInput = key === "salary" ? refs.salaryMin : key === "expenses" ? refs.expenseMin : refs.matchScoreMin;
    const highInput = key === "salary" ? refs.salaryMax : key === "expenses" ? refs.expenseMax : refs.matchScoreMax;
    if (Number(lowInput.value) > Number(highInput.value)) {
      if (changed === "low") highInput.value = lowInput.value;
      else lowInput.value = highInput.value;
    }
    state.ranges[key].low = key === "expenses" ? expenseFromSlider(lowInput.value) : Number(lowInput.value);
    state.ranges[key].high = key === "expenses" ? expenseFromSlider(highInput.value) : Number(highInput.value);
    updateRangeLabels();
    renderAll();
  }

  function updateRangeLabels() {
    const salary = state.ranges.salary;
    const expenses = state.ranges.expenses;
    const matchScore = state.ranges.matchScore;
    refs.salaryRangeValue.value = salary.low === salary.min && salary.high === salary.max
      ? "All" : `${compactMoney(salary.low)}–${compactMoney(salary.high)}`;
    refs.expenseRangeValue.value = expenses.low === expenses.min && expenses.high === expenses.max
      ? "All" : `${compactMoney(expenses.low)}–${compactMoney(expenses.high)}`;
    refs.matchScoreRangeValue.value = matchScore.low === matchScore.min && matchScore.high === matchScore.max
      ? "All" : `${Math.round(matchScore.low)}–${Math.round(matchScore.high)}`;
    const salaryActive = refs.salaryRangeValue.value !== "All";
    const expenseActive = refs.expenseRangeValue.value !== "All";
    const matchScoreActive = refs.matchScoreRangeValue.value !== "All";
    refs.salaryFilterSummary.dataset.active = String(salaryActive);
    refs.expenseFilterSummary.dataset.active = String(expenseActive);
    refs.matchScoreFilterSummary.dataset.active = String(matchScoreActive);
    refs.salaryFilterSummary.setAttribute("aria-label", salaryActive
      ? `Filter salary, active range ${refs.salaryRangeValue.value}` : "Filter salary, all values included");
    refs.expenseFilterSummary.setAttribute("aria-label", expenseActive
      ? `Filter expenses, active range ${refs.expenseRangeValue.value}` : "Filter expenses, all values included");
    refs.matchScoreFilterSummary.setAttribute("aria-label", matchScoreActive
      ? `Filter similarity score, active range ${refs.matchScoreRangeValue.value}` : "Filter similarity score, all values included");
    refs.salaryFilterStatus.textContent = salaryActive
      ? `Salary filter · ${refs.salaryRangeValue.value}` : "All salaries included";
    refs.expenseFilterStatus.textContent = expenseActive
      ? `Expense filter · ${refs.expenseRangeValue.value}` : "All expenses included";
    refs.matchScoreFilterStatus.textContent = matchScoreActive
      ? `Similarity-score filter · ${refs.matchScoreRangeValue.value}` : "All similarity scores included";
    [["salary", refs.salaryMin, refs.salaryMax], ["expenses", refs.expenseMin, refs.expenseMax], ["matchScore", refs.matchScoreMin, refs.matchScoreMax]].forEach(([key, low, high]) => {
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

  function weightedPercentilePosition(items, value, accessor) {
    const valid = items.filter((item) => Number.isFinite(accessor(item)) && item.weight > 0);
    const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
    if (!valid.length || !totalWeight || !Number.isFinite(value)) return null;
    const belowWeight = valid.reduce((sum, item) => sum + (accessor(item) < value ? item.weight : 0), 0);
    const equalWeight = valid.reduce((sum, item) => sum + (accessor(item) === value ? item.weight : 0), 0);
    return {
      percentile: ((belowWeight + equalWeight / 2) / totalWeight) * 100,
      count: valid.length,
    };
  }

  function percentilePositionLabel(items, value, accessor) {
    const valid = items.filter((item) => Number.isFinite(accessor(item)) && item.weight > 0);
    const position = weightedPercentilePosition(valid, value, accessor);
    if (!position) return "Unavailable";
    const modeled = fitModel(valid.map((item) => ({ ...item, value: accessor(item) })));
    const percentileValue = modeled?.cdf ? modeled.cdf(value) * 100 : position.percentile;
    const belowCount = valid.reduce((count, item) => count + (accessor(item) < value ? 1 : 0), 0);
    const equalCount = valid.reduce((count, item) => count + (accessor(item) === value ? 1 : 0), 0);
    const rank = belowCount + (Math.max(equalCount, 1) + 1) / 2;
    const percentile = clamp(percentileValue, 0, 100).toFixed(1).replace(/\.0$/, "");
    const formattedRank = Number.isInteger(rank) ? rank.toFixed(0) : rank.toFixed(1);
    return `${percentile} (#${formattedRank} / ${position.count})`;
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

  function normalCdf(value) {
    const absolute = Math.abs(value);
    const t = 1 / (1 + 0.2316419 * absolute);
    const density = Math.exp(-(absolute ** 2) / 2) / Math.sqrt(2 * Math.PI);
    const tail = density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return value >= 0 ? 1 - tail : tail;
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
        cdf: (x) => x <= 0 ? 0 : normalCdf((Math.log(x) - mu) / sigma),
      };
    }
    if (state.fit === "gamma") {
      const mean = weightedMean(items);
      const variance = items.reduce((sum, item) => sum + (item.value - mean) ** 2 * item.weight, 0) / totalWeight;
      const varianceFloor = Math.max(mean ** 2 * 1e-9, Number.EPSILON);
      const stableVariance = Math.max(variance, varianceFloor);
      const shape = Math.max(mean ** 2 / stableVariance, 0.01);
      const scale = Math.max(stableVariance / mean, Number.EPSILON);
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
        cdf: (x) => x <= 0 ? 0 : gammaP(shape, x / scale),
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

  function appendRpMarker(svg, x, y, item, context = {}, size = 26) {
    const primaryFormat = context.primaryFormat || money;
    const group = svgElement("g", {
      class: "rp-chart-marker", transform: `translate(${x} ${y})`, tabindex: "0", role: "button",
      "aria-label": `Rethink Priorities reference, ${primaryFormat(item.value)}; excluded from calculations`,
    });
    group.append(svgElement("image", {
      href: "assets/rethink-priorities-favicon.png", x: -size / 2, y: -size / 2,
      width: size, height: size, preserveAspectRatio: "xMidYMid meet", class: "rp-chart-marker-logo",
    }));
    const tooltipEvent = (event) => {
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && (event.clientX || event.clientY)) return event;
      const bounds = group.getBoundingClientRect();
      return { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 };
    };
    const show = (event) => showTooltip(tooltipEvent(event), item, { ...context, reference: true });
    group.addEventListener("pointerenter", show);
    group.addEventListener("pointermove", (event) => positionTooltip(event));
    group.addEventListener("pointerleave", hideTooltip);
    group.addEventListener("focus", show);
    group.addEventListener("blur", hideTooltip);
    group.addEventListener("click", () => focusRpReferenceRow(item.row.id));
    group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") focusRpReferenceRow(item.row.id); });
    svg.append(group);
    return group;
  }

  function squareBinCount(items, axisMin, axisMax, innerWidth, innerHeight, geometry) {
    let best = { bins: 20, score: Infinity };
    const model = fitModel(items);
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    for (let count = 2; count <= 200; count += 1) {
      const totals = Array(count).fill(0);
      items.forEach((item) => {
        const position = geometry.transform(item.value);
        const index = clamp(Math.floor(((position - axisMin) / (axisMax - axisMin)) * count), 0, count - 1);
        totals[index] += item.weight;
      });
      const binWidth = (axisMax - axisMin) / count;
      const densityPeak = model ? Math.max(...Array.from({ length: 101 }, (_, index) => {
        const value = geometry.inverse(axisMin + (index / 100) * (axisMax - axisMin));
        return model.density(value) * geometry.jacobian(value) * totalWeight * binWidth;
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
    const rug = document.createElement("span"); rug.innerHTML = '<i class="rug-swatch"></i> Individual values'; refs.chartLegend.append(rug);
  }

  function quantilePercentiles() {
    if (state.quantileGranularity === "deciles") return Array.from({ length: 9 }, (_, index) => (index + 1) * 10);
    if (state.quantileGranularity === "percentiles") return Array.from({ length: 99 }, (_, index) => index + 1);
    if (state.quantileGranularity !== "custom") return [20, 40, 60, 80];
    const tokens = state.customQuantiles.split(",").map((value) => Number(value.trim()));
    const valid = tokens.length > 0 && tokens.every((value) => Number.isFinite(value) && value > 0 && value < 100);
    return valid ? [...new Set(tokens)].sort((a, b) => a - b) : [];
  }

  function appendCurveQuantileMarks(svg, model, percentiles, xScale, yScale, margin, sumWeight, binWidthAxis, axisMin, axisMax, formatter, geometry) {
    if (!state.markCurve || !model || !percentiles.length || percentiles.length >= 21) return;
    const expectedWeight = (value) => model.density(value) * geometry.jacobian(value) * sumWeight * binWidthAxis;
    const delta = Math.max((axisMax - axisMin) / 1500, Number.EPSILON);
    const candidates = [];
    percentiles.forEach((percentile) => {
      const value = model.quantile(percentile / 100);
      if (!Number.isFinite(value) || value <= 0) return;
      const position = geometry.transform(value);
      if (position < axisMin || position > axisMax) return;
      const x = xScale(value);
      const y = margin.top + yScale(expectedWeight(value));
      const before = geometry.inverse(Math.max(axisMin, position - delta));
      const after = geometry.inverse(Math.min(axisMax, position + delta));
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
      const percentileLine = svgElement("text", { x: 0, y: -7, "text-anchor": "middle", class: "curve-quantile-label percentile" });
      const percentilePrefix = svgElement("tspan");
      percentilePrefix.textContent = "P";
      const percentileSubscript = svgElement("tspan", { "baseline-shift": "sub", "font-size": "7.5" });
      percentileSubscript.textContent = Number.isInteger(percentile) ? percentile : percentile.toFixed(1);
      percentileLine.append(percentilePrefix, percentileSubscript);
      const amountLine = svgElement("text", { x: 0, y: 13, "text-anchor": "middle", class: "curve-quantile-label amount" });
      amountLine.textContent = formatter(value);
      label.append(percentileLine, amountLine);
      label.setAttribute("visibility", "hidden");
      svg.append(label);
      positionCurveQuantileLabelStack(label, percentileLine, amountLine);
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

  function quantileLabelMetrics(label, percentileLine, amountLine) {
    percentileLine.setAttribute("y", "0");
    amountLine.setAttribute("y", "0");
    const percentileBox = percentileLine.getBBox();
    const amountBox = amountLine.getBBox();
    const matrix = label.getScreenCTM();
    const screenScaleY = Math.max(matrix ? Math.hypot(matrix.c, matrix.d) : 1, 0.01);
    const renderedLineHeight = Math.min(percentileBox.height, amountBox.height) * screenScaleY;
    // SVG text bounds include more font-cell leading than the visible glyphs.
    // Slightly overlap those bounds so the painted labels retain only a small
    // optical gap instead of looking like two unrelated annotations.
    const lineInsetPx = clamp(renderedLineHeight * 0.34, 4, 6);
    return {
      percentileBox,
      amountBox,
      screenScaleY,
      lineInsetPx,
      lineInset: lineInsetPx / screenScaleY,
    };
  }

  function positionCurveQuantileLabelStack(label, percentileLine, amountLine) {
    const initialBox = label.getBBox();
    const initialCenter = initialBox.y + initialBox.height / 2;
    const metrics = quantileLabelMetrics(label, percentileLine, amountLine);
    const amountY = metrics.percentileBox.y + metrics.percentileBox.height
      - metrics.lineInset - metrics.amountBox.y;
    amountLine.setAttribute("y", amountY.toFixed(2));
    const positionedBox = label.getBBox();
    const centerDelta = initialCenter - (positionedBox.y + positionedBox.height / 2);
    percentileLine.setAttribute("y", centerDelta.toFixed(2));
    amountLine.setAttribute("y", (amountY + centerDelta).toFixed(2));
    label.dataset.lineInsetPx = metrics.lineInsetPx.toFixed(2);
  }

  function positionQuantileLabelStack(label, percentileLine, amountLine) {
    const metrics = quantileLabelMetrics(label, percentileLine, amountLine);
    const amountStroke = (Number.parseFloat(getComputedStyle(amountLine).strokeWidth) || 0) / 2;
    const guideGapPx = clamp(metrics.amountBox.height * metrics.screenScaleY * 0.55, 5, 8);
    const guideGap = guideGapPx / metrics.screenScaleY;
    const amountY = -guideGap - (metrics.amountBox.y + metrics.amountBox.height + amountStroke);
    amountLine.setAttribute("y", amountY.toFixed(2));
    const amountTextTop = amountY + metrics.amountBox.y;
    const percentileY = amountTextTop + metrics.lineInset
      - (metrics.percentileBox.y + metrics.percentileBox.height);
    percentileLine.setAttribute("y", percentileY.toFixed(2));
    label.dataset.lineInsetPx = metrics.lineInsetPx.toFixed(2);
    label.dataset.guideGapPx = guideGapPx.toFixed(2);
    // Start the guide slightly behind the amount line. The guide is painted
    // first, so the label's white outline masks the overlap while the visible
    // dash still meets the bottom of the annotation.
    return { guideStartOffset: -(guideGap + amountStroke * 3) };
  }

  function selectEmpiricalQuantileLabels(candidates) {
    const locationDeduplicated = [];
    [...candidates]
      .sort((first, second) => Math.abs(first.percentile - 50) - Math.abs(second.percentile - 50)
        || first.percentile - second.percentile)
      .forEach((candidate) => {
        if (!locationDeduplicated.some((existing) => Math.abs(existing.x - candidate.x) < 0.5)) {
          locationDeduplicated.push(candidate);
        }
      });
    const sorted = locationDeduplicated.sort((first, second) => first.bounds.right - second.bounds.right
      || first.bounds.left - second.bounds.left || first.percentile - second.percentile);
    const plans = [{ items: [], centrality: 0 }];
    sorted.forEach((candidate, index) => {
      let predecessor = index - 1;
      while (predecessor >= 0 && sorted[predecessor].bounds.right > candidate.bounds.left) predecessor -= 1;
      const base = plans[predecessor + 1];
      const included = {
        items: [...base.items, candidate],
        centrality: base.centrality + (100 - Math.abs(candidate.percentile - 50)),
      };
      const excluded = plans[index];
      plans.push(
        included.items.length > excluded.items.length
        || (included.items.length === excluded.items.length && included.centrality > excluded.centrality)
          ? included : excluded,
      );
    });
    return plans.at(-1).items;
  }

  function appendEmpiricalQuantileMarks(svg, items, percentiles, xScale, margin, plotBottom, formatter) {
    if (!state.markCurve || state.fit !== "empirical" || !percentiles.length || percentiles.length >= 21) return;
    const candidates = percentiles.map((percentile) => {
      const value = weightedQuantile(items, percentile / 100);
      if (!Number.isFinite(value)) return null;
      const x = xScale(value);
      const label = svgElement("g", {
        transform: `translate(${x} ${margin.top})`,
        class: "empirical-quantile-mark",
        "aria-hidden": "true",
      });
      const percentileLine = svgElement("text", { x: 0, y: 0, "text-anchor": "middle", class: "empirical-quantile-label percentile" });
      const percentilePrefix = svgElement("tspan");
      percentilePrefix.textContent = "P";
      const percentileSubscript = svgElement("tspan", { "baseline-shift": "sub", "font-size": "7.5" });
      percentileSubscript.textContent = Number.isInteger(percentile) ? percentile : percentile.toFixed(1);
      percentileLine.append(percentilePrefix, percentileSubscript);
      const amountLine = svgElement("text", { x: 0, y: 0, "text-anchor": "middle", class: "empirical-quantile-label amount" });
      amountLine.textContent = formatter(value);
      label.append(percentileLine, amountLine);
      label.setAttribute("visibility", "hidden");
      svg.append(label);
      const labelLayout = positionQuantileLabelStack(label, percentileLine, amountLine);
      const rawBounds = label.getBoundingClientRect();
      const bounds = {
        left: rawBounds.left - 3,
        right: rawBounds.right + 3,
        top: rawBounds.top - 3,
        bottom: rawBounds.bottom + 3,
      };
      const svgBounds = svg.getBoundingClientRect();
      label.remove();
      label.removeAttribute("visibility");
      if (bounds.left < svgBounds.left + 2 || bounds.right > svgBounds.right - 2) return null;
      return {
        percentile, value, x, bounds, label,
        guideY1: margin.top + labelLayout.guideStartOffset,
      };
    }).filter(Boolean);
    const retained = selectEmpiricalQuantileLabels(candidates);
    retained.sort((first, second) => first.x - second.x).forEach((candidate) => {
      svg.append(svgElement("line", {
        x1: candidate.x, x2: candidate.x, y1: candidate.guideY1, y2: plotBottom,
        class: "empirical-quantile-guide", "aria-hidden": "true",
      }));
      svg.append(candidate.label);
    });
  }

  function highlightRug(id, highlighted) {
    refs.chart.querySelectorAll(".rug-line").forEach((rug) => {
      if (rug.dataset.rugId === id) rug.classList.toggle("is-highlighted", highlighted || state.focusedId === id);
    });
  }

  function appendAxisControl(svg, axisKey, label, attributes) {
    const group = svgElement("g", {
      class: "axis-variable-control", role: "button", tabindex: "0",
      "aria-label": `Change ${axisKey === "scatterY" ? "vertical" : "horizontal"} axis; currently ${label}`,
    });
    const text = svgElement("text", { ...attributes, class: "axis-variable-label" });
    text.textContent = label;
    group.append(text);
    svg.append(group);
    const textBounds = text.getBBox();
    const isVertical = Boolean(attributes.transform);
    const triangleX = isVertical ? Number(attributes.x) + textBounds.width / 2 + 7 : textBounds.x + textBounds.width + 7;
    const triangleY = Number(attributes.y) - 6;
    const triangle = svgElement("path", {
      d: `M${triangleX},${triangleY} l7,0 l-3.5,5 z`, class: "axis-variable-triangle",
    });
    if (attributes.transform) triangle.setAttribute("transform", attributes.transform);
    group.append(triangle);
    const activate = (event) => {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openAxisSelector(axisKey, group);
    };
    group.addEventListener("click", activate);
    group.addEventListener("keydown", activate);
  }

  function populateAxisSelector(axisKey) {
    const expression = axisExpression(axisKey);
    const buildGroups = () => {
      const measures = document.createElement("optgroup");
      measures.label = "This organization or role";
      const positions = document.createElement("optgroup");
      positions.label = "One matching role in the same filing";
      Object.entries(numericVariables).forEach(([value, definition]) => {
        const option = document.createElement("option");
        option.value = value;
        if (definition.positionKey) {
          const pairCount = positionIncumbents().filter((row) => (
            row.defaultIncluded && definition.value(row) != null
          )).length;
          option.textContent = `${POSITION_BY_KEY.get(definition.positionKey).label} pay · matching records: ${pairCount}`;
          option.disabled = pairCount === 0 && value !== expression.numerator && value !== expression.denominator;
          positions.append(option);
        } else {
          option.textContent = definition.label();
          measures.append(option);
        }
      });
      return [measures, positions];
    };
    refs.axisNumerator.replaceChildren(...buildGroups());
    refs.axisDenominator.replaceChildren(...buildGroups());
    refs.axisNumerator.value = expression.numerator;
    refs.axisDenominator.value = expression.denominator;
    refs.axisNumeratorLabel.textContent = axisMode(axisKey) === "ratio" ? "Numerator" : "Measure";
    refs.axisDenominatorField.hidden = axisMode(axisKey) !== "ratio";
    refs.axisSelectorTitle.textContent = axisKey === "histogram" ? "Histogram axis"
      : axisKey === "scatterX" ? "Horizontal axis" : "Vertical axis";
  }

  function openAxisSelector(axisKey, anchor) {
    activeAxisSelector = axisKey;
    populateAxisSelector(axisKey);
    refs.axisSelector.hidden = false;
    const wrap = refs.chartWrap.getBoundingClientRect();
    const target = anchor.getBoundingClientRect();
    const width = refs.axisSelector.offsetWidth;
    const height = refs.axisSelector.offsetHeight;
    const preferredLeft = target.left - wrap.left + target.width / 2 - width / 2;
    const preferredTop = target.top - wrap.top - height - 8;
    refs.axisSelector.style.left = `${clamp(preferredLeft, 8, Math.max(8, wrap.width - width - 8))}px`;
    refs.axisSelector.style.top = `${clamp(preferredTop, 8, Math.max(8, wrap.height - height - 8))}px`;
    refs.axisNumerator.focus();
  }

  function closeAxisSelector() {
    activeAxisSelector = "";
    refs.axisSelector.hidden = true;
  }

  function updateAxisExpression(part, value) {
    if (!activeAxisSelector || !numericVariables[value]) return;
    const expression = axisExpression(activeAxisSelector);
    expression[part] = value;
    if (axisMode(activeAxisSelector) === "ratio" && expression.numerator === expression.denominator) {
      const alternative = Object.keys(numericVariables).find((key) => key !== value);
      expression[part === "numerator" ? "denominator" : "numerator"] = alternative;
    }
    state.axisScales[activeAxisSelector] = recommendedAxisScale(activeAxisSelector);
    syncAxisControls();
    if (activeAxisSelector === "histogram") state.autoBins = true;
    closeAxisSelector();
    renderAll();
  }

  function paddedDomain(values, relativePadding = 0.08, positive = true) {
    const low = Math.min(...values); const high = Math.max(...values);
    const scale = Math.max(Math.abs(low), Math.abs(high), Number.EPSILON);
    const padding = Math.max((high - low) * relativePadding, scale * 0.025, Number.EPSILON);
    return [positive ? Math.max(0, low - padding) : low - padding, high + padding];
  }

  function renderHistogram() {
    const descriptor = axisDescriptor("histogram");
    const geometry = axisGeometry(descriptor);
    const items = axisItems("histogram");
    const svg = refs.chart;
    svg.replaceChildren();
    const colors = categoryColors(items);
    renderHistogramLegend(colors);
    const markNoun = isCeoPosition() ? "organization" : "reported role";
    $("#chart-description").textContent = `A histogram of ${descriptor.label.toLowerCase()}. Each block represents one ${markNoun}; larger blocks have more influence when weighting is active.`;
    const width = Math.max(520, refs.chartWrap.clientWidth || 720);
    const height = Math.max(330, refs.chartWrap.clientHeight || 360);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const percentiles = quantilePercentiles();
    const showEmpiricalQuantileMarks = state.markCurve && state.fit === "empirical"
      && percentiles.length > 0 && percentiles.length < 21;
    const margin = { top: showEmpiricalQuantileMarks ? 44 : 14, right: 18, bottom: 46, left: 66 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (!items.length) {
      const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#52879E", "font-size": 13 });
      empty.textContent = `No ${isCeoPosition() ? "organizations" : "role records"} have a value for the current selection.`;
      svg.append(empty);
      appendAxisControl(svg, "histogram", axisDisplayLabel(descriptor), {
        x: width / 2 - 5, y: height - 6, "text-anchor": "middle",
      });
      refs.statN.textContent = "0"; refs.statNeff.textContent = "0"; refs.statCenter.textContent = "—";
      return;
    }

    const rpItems = activeRpReferences().map((row) => ({ row, value: descriptor.value(row), weight: 0 }))
      .filter((item) => Number.isFinite(item.value) && (!descriptor.logarithmic || item.value > 0));
    const values = [...items.map((item) => item.value), ...rpItems.map((item) => item.value)];
    const [axisMin, axisMax] = paddedDomain(values.map(geometry.transform), 0.08, !descriptor.logarithmic);
    const xScale = (value) => margin.left + ((geometry.transform(value) - axisMin) / (axisMax - axisMin)) * innerWidth;
    if (state.autoBins) {
      state.bins = squareBinCount(items, axisMin, axisMax, innerWidth, innerHeight, geometry);
      refs.bins.value = state.bins;
      refs.binValue.value = state.bins;
      state.autoBins = false;
    }
    const binWidthAxis = (axisMax - axisMin) / state.bins;
    const bins = Array.from({ length: state.bins }, (_, index) => ({ index, total: 0, items: [] }));
    items.forEach((item) => {
      const index = clamp(Math.floor((geometry.transform(item.value) - axisMin) / binWidthAxis), 0, state.bins - 1);
      bins[index].items.push(item);
      bins[index].total += item.weight;
    });
    const model = fitModel(items);
    const sumWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const densityPoints = model ? Array.from({ length: 181 }, (_, index) => {
      const position = axisMin + (index / 180) * (axisMax - axisMin);
      const value = geometry.inverse(position);
      return { value, expectedWeight: model.density(value) * geometry.jacobian(value) * sumWeight * binWidthAxis };
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
    appendEmpiricalQuantileMarks(svg, items, percentiles, xScale, margin, plotBottom, descriptor.format);
    const rpLogoY = margin.top + 14;
    rpItems.forEach((item) => {
      const x = xScale(item.value);
      svg.append(svgElement("line", {
        x1: x, x2: x, y1: rpLogoY + 14, y2: plotBottom,
        class: "rp-reference-guide", "aria-hidden": "true",
      }));
    });
    bins.forEach((bin) => {
      const binLow = geometry.inverse(axisMin + bin.index * binWidthAxis);
      const binHigh = geometry.inverse(axisMin + (bin.index + 1) * binWidthAxis);
      const x0 = xScale(binLow) + 1;
      const x1 = xScale(binHigh) - 1;
      let cumulative = 0;
      [...bin.items].sort((a, b) => b.weight - a.weight).forEach((item) => {
        const y0 = margin.top + yScale(cumulative + item.weight);
        const y1 = margin.top + yScale(cumulative);
        const category = chartCategory(item.row);
        const rect = svgElement("rect", {
          x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(2, y1 - y0),
          fill: colors.get(category), class: `bar-block${state.focusedId === item.row.id ? " is-focused" : ""}`,
          tabindex: "0", role: "button", "aria-label": `${item.row.organization}, ${item.row.title || "reported role"}, ${descriptor.fullFormat(item.value)}`,
        });
        rect.addEventListener("pointerenter", (event) => {
          highlightRug(item.row.id, true);
          showTooltip(event, item, {
            category,
            primaryLabel: descriptor.primaryLabel(item.row), primaryFormat: descriptor.fullFormat,
            chartDetail: ["Histogram bar", `${descriptor.format(binLow)}–${descriptor.format(binHigh)}`],
            rankDetails: [[`${descriptor.shortLabel} percentile`, percentilePositionLabel(items, item.value, (candidate) => candidate.value)]],
          });
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
        svg, model, percentiles, xScale, yScale, margin,
        sumWeight, binWidthAxis, axisMin, axisMax, descriptor.format, geometry,
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

    rpItems.forEach((item) => appendRpMarker(svg, xScale(item.value), rpLogoY, item, {
      primaryLabel: descriptor.primaryLabel(item.row), primaryFormat: descriptor.fullFormat,
      rankDetails: [[`${descriptor.shortLabel} percentile`, percentilePositionLabel(items, item.value, (candidate) => candidate.value)]],
    }));

    const tickCount = width < 650 ? 5 : 8;
    for (let i = 0; i <= tickCount; i += 1) {
      const value = geometry.inverse(axisMin + (i / tickCount) * (axisMax - axisMin));
      const x = xScale(value);
      const label = svgElement("text", { x, y: plotBottom + 20, "text-anchor": "middle", fill: "#52879E", "font-size": 10 });
      label.textContent = descriptor.format(value);
      svg.append(label);
    }
    appendAxisControl(svg, "histogram", axisDisplayLabel(descriptor), {
      x: margin.left + innerWidth / 2 - 5, y: height - 6, "text-anchor": "middle",
    });
    const yAxisTitle = svgElement("text", {
      x: 14, y: margin.top + innerHeight / 2, transform: `rotate(-90 14 ${margin.top + innerHeight / 2})`,
      "text-anchor": "middle", fill: "#3E454A", "font-size": 10, "font-weight": 700,
    });
    yAxisTitle.textContent = state.stream === "combined" || !isCeoPosition()
      ? "Weighted records per bar" : "Weighted organizations per bar";
    svg.append(yAxisTitle);

    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = descriptor.format(distributionQuantile(items, 0.5));
  }
  const categoryPalette = ["#2D6885", "#44B0DF", "#75CCEC", "#52879E", "#3E454A", "#B7E2F2"];

  function humanizeCategory(value) {
    return String(value || "Not reported")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function eaAffinityLabel(value) {
    const raw = String(value || "Not classified");
    const normalized = raw.toLowerCase();
    if (normalized.includes("core") || normalized.includes("aligned")) return "Effective-altruism organization";
    if (normalized.includes("adjacent")) return "Connected to effective altruism";
    if (normalized.includes("functional")) return "Similar work; no documented connection";
    if (/not coded|not reported|uncoded/.test(normalized)) return "Not classified";
    return humanizeCategory(raw);
  }

  function peerTierInfo(value) {
    const raw = String(value || "Not reported");
    const normalized = raw.toLowerCase();
    if (normalized === "a" || normalized === "strict_primary" || normalized === "closest peers" || normalized.startsWith("tier a")) return { label: "Closest peers", order: 0 };
    if (normalized === "b" || normalized === "secondary" || normalized === "broader peers" || normalized.startsWith("secondary_") || normalized.startsWith("tier b")) return { label: "Broader peers", order: 1 };
    if (normalized === "c" || normalized === "broadest peers" || normalized.startsWith("expanded_") || normalized.startsWith("tier c")) return { label: "Broadest peers", order: 2 };
    if (normalized === "broader case" || normalized.includes("sensitivity")) return { label: "Broader case", order: 3 };
    if (normalized === "outside recommended group" || normalized.startsWith("excluded")) return { label: "Outside recommended group", order: 4 };
    return { label: humanizeCategory(raw), order: 5 };
  }

  function peerCategoryLabel(value) {
    const raw = String(value || "Not reported");
    const normalized = raw.toLowerCase();
    const exact = {
      a: "Form 990 · closest peers",
      strict_primary: "Job posting · closest peers",
      b: "Form 990 · broader peers",
      secondary: "Job posting · broader peers",
      secondary_scale: "Broader case · organization size differs",
      secondary_structural: "Broader case · organization type differs",
      c: "Form 990 · broadest peers",
      expanded_primary_title: "Broadest case · job title differs",
      expanded_secondary_scale: "Broadest case · organization size differs",
      expanded_secondary_scale_unknown: "Broadest case · organization size unknown",
      expanded_secondary_structural: "Broadest case · organization type differs",
      expanded_broad_functional: "Broadest case · mission or work differs",
      date_ambiguity_sensitivity: "Broader case · posting date unclear",
      fractional_sensitivity: "Broader case · part-time role",
      older_structural_sensitivity: "Broader case · older posting and different organization type",
      excluded: "Outside recommended group",
      excluded_grantmaking: "Outside recommended group · grantmaking model",
      excluded_private_foundation: "Outside recommended group · private foundation",
      excluded_subordinate_regional: "Outside recommended group · regional role",
    };
    return exact[normalized] || peerTierInfo(raw).label;
  }

  function categoryDisplayLabel(key, value) {
    if (key === "tier") return peerCategoryLabel(value);
    if (key === "eaAffinity") return eaAffinityLabel(value);
    if (key === "titleGroup" && !isCeoPosition()) return humanizeCategory(value);
    return String(value || "Not reported");
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
    if (state.chartColor === "tier") return peerTierInfo(raw).label;
    return categoryDisplayLabel(state.chartColor, raw);
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
    legend.setAttribute("aria-label", "Larger marks have more influence in the results");
    const title = document.createElement("span");
    title.className = "point-size-legend-label";
    title.textContent = "Larger mark = more influence";
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
      const contour = document.createElement("span"); contour.innerHTML = '<i class="contour-swatch"></i> Approximate spread: 50 / 80 / 95%';
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

  function weightedCorrelations(items, xAccessor, yAccessor) {
    const values = items.map((item, index) => ({ index, x: xAccessor(item), y: yAccessor(item), weight: item.weight }));
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
    refs.scatterCorrelations.title = "Weighted Pearson r measures linear association; weighted Spearman ρ measures rank association. Both range from −1 to +1, and association does not imply causation.";
  }

  function renderScatter() {
    const xDescriptor = axisDescriptor("scatterX");
    const yDescriptor = axisDescriptor("scatterY");
    const xGeometry = axisGeometry(xDescriptor);
    const yGeometry = axisGeometry(yDescriptor);
    const items = currentPlotItems();
    const rpItems = activeRpReferences().map((row) => ({
      row, xValue: xDescriptor.value(row), yValue: yDescriptor.value(row), weight: 0,
    })).filter((item) => Number.isFinite(item.xValue) && (!xDescriptor.logarithmic || item.xValue > 0)
      && Number.isFinite(item.yValue) && (!yDescriptor.logarithmic || item.yValue > 0));
    const svg = refs.chart;
    svg.replaceChildren();
    $("#chart-description").textContent = `A scatterplot of ${yDescriptor.label.toLowerCase()} against ${xDescriptor.label.toLowerCase()} for ${positionDefinition().pageLabel} pay records.`;
    const width = Math.max(520, refs.chartWrap.clientWidth || 720);
    const height = Math.max(290, refs.chartWrap.clientHeight || 340);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const margin = { top: 14, right: 18, bottom: 50, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    if (!items.length) {
      const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#52879E", "font-size": 13 });
      empty.textContent = `No selected ${isCeoPosition() ? "organizations" : "role records"} have values for both axes.`;
      svg.append(empty); refs.chartLegend.replaceChildren();
      appendAxisControl(svg, "scatterX", axisDisplayLabel(xDescriptor), {
        x: width / 2 - 5, y: height - 6, "text-anchor": "middle",
      });
      appendAxisControl(svg, "scatterY", axisDisplayLabel(yDescriptor), {
        x: 14, y: height / 2, transform: `rotate(-90 14 ${height / 2})`, "text-anchor": "middle",
      });
      updateCorrelationSummary();
      refs.statN.textContent = "0"; refs.statNeff.textContent = "0"; refs.statCenter.textContent = "—";
      return;
    }
    const xTransform = xGeometry.transform;
    const yTransform = yGeometry.transform;
    const transformedX = items.map((item) => xTransform(item.xValue));
    const transformedY = items.map((item) => yTransform(item.yValue));
    rpItems.forEach((item) => {
      transformedX.push(xTransform(item.xValue));
      transformedY.push(yTransform(item.yValue));
    });
    const [xMin, xMax] = paddedDomain(transformedX, 0.08, false);
    const [yMin, yMax] = paddedDomain(transformedY, 0.08, false);
    const xScale = (value) => margin.left + ((xTransform(value) - xMin) / (xMax - xMin)) * innerWidth;
    const yScale = (value) => margin.top + innerHeight - ((yTransform(value) - yMin) / (yMax - yMin)) * innerHeight;
    for (let index = 0; index <= 4; index += 1) {
      const transformed = yMin + (index / 4) * (yMax - yMin);
      const yValue = yGeometry.inverse(transformed);
      const y = yScale(yValue);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      const label = svgElement("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", fill: "#52879E", "font-size": 9 });
      label.textContent = yDescriptor.format(yValue); svg.append(label);
    }
    const plotBottom = margin.top + innerHeight;
    for (let index = 0; index <= 5; index += 1) {
      const transformed = xMin + (index / 5) * (xMax - xMin);
      const value = xGeometry.inverse(transformed);
      const x = margin.left + (index / 5) * innerWidth;
      svg.append(svgElement("line", { x1: x, x2: x, y1: plotBottom, y2: plotBottom + 4, stroke: "#52879E" }));
      const label = svgElement("text", { x, y: plotBottom + 20, "text-anchor": "middle", fill: "#52879E", "font-size": 9 });
      label.textContent = xDescriptor.format(value); svg.append(label);
    }
    const clipId = "scatter-plot-clip";
    const defs = svgElement("defs");
    const clip = svgElement("clipPath", { id: clipId });
    clip.append(svgElement("rect", { x: margin.left, y: margin.top, width: innerWidth, height: innerHeight }));
    defs.append(clip); svg.append(defs);
    const points = items.map((item) => ({ item, x: xScale(item.xValue), y: yScale(item.yValue) }));
    const contoursShown = appendCovarianceContours(svg, points, clipId);
    if (state.hoverQuantile != null && state.hoverQuantile > 0) {
      const y = yScale(state.hoverQuantile);
      svg.append(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "quantile-guide" }));
    }
    const colors = categoryColors(items);
    const correlations = weightedCorrelations(items, (item) => xTransform(item.xValue), (item) => yTransform(item.yValue));
    points.forEach(({ item, x, y }) => {
      const category = chartCategory(item.row);
      const baseRadius = 4.5;
      const radius = baseRadius * Math.sqrt(clamp(item.weight, 0.16, 10));
      const point = svgElement("circle", {
        cx: x, cy: y, r: radius, fill: colors.get(category), "data-weight": item.weight.toFixed(6),
        class: `scatter-point${state.focusedId === item.row.id ? " is-focused" : ""}`, tabindex: "0", role: "button",
        "aria-label": `${item.row.organization}, ${item.row.title || "reported role"}, ${yDescriptor.label} ${yDescriptor.fullFormat(item.yValue)}, ${xDescriptor.label} ${xDescriptor.fullFormat(item.xValue)}`,
      });
      point.addEventListener("pointerenter", (event) => showTooltip(event, item, {
        category, primaryLabel: yDescriptor.primaryLabel(item.row), primaryFormat: yDescriptor.fullFormat,
        chartDetail: [xDescriptor.label, xDescriptor.fullFormat(item.xValue)],
        rankDetails: [
          [`${yDescriptor.shortLabel} percentile`, percentilePositionLabel(items, item.yValue, (candidate) => candidate.yValue)],
          [`${xDescriptor.shortLabel} percentile`, percentilePositionLabel(items, item.xValue, (candidate) => candidate.xValue)],
        ],
      }));
      point.addEventListener("pointermove", positionTooltip); point.addEventListener("pointerleave", hideTooltip);
      point.addEventListener("click", () => focusRow(item.row.id));
      point.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") focusRow(item.row.id); });
      svg.append(point);
    });
    rpItems.forEach((item) => {
      appendRpMarker(svg, xScale(item.xValue), yScale(item.yValue), { ...item, value: item.yValue }, {
        primaryLabel: yDescriptor.primaryLabel(item.row), primaryFormat: yDescriptor.fullFormat,
        chartDetail: [xDescriptor.label, xDescriptor.fullFormat(item.xValue)],
        rankDetails: [
          [`${yDescriptor.shortLabel} percentile`, percentilePositionLabel(items, item.yValue, (candidate) => candidate.yValue)],
          [`${xDescriptor.shortLabel} percentile`, percentilePositionLabel(items, item.xValue, (candidate) => candidate.xValue)],
        ],
      }, 28);
    });
    updateCorrelationSummary(correlations);
    appendAxisControl(svg, "scatterX", axisDisplayLabel(xDescriptor), {
      x: margin.left + innerWidth / 2 - 5, y: height - 6, "text-anchor": "middle",
    });
    appendAxisControl(svg, "scatterY", axisDisplayLabel(yDescriptor), {
      x: 14, y: margin.top + innerHeight / 2, transform: `rotate(-90 14 ${margin.top + innerHeight / 2})`, "text-anchor": "middle",
    });
    renderScatterLegend(colors, contoursShown, items);
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const squared = items.reduce((sum, item) => sum + item.weight ** 2, 0);
    refs.statN.textContent = items.length;
    refs.statNeff.textContent = squared ? (totalWeight ** 2 / squared).toFixed(1) : "0";
    refs.statCenter.textContent = yDescriptor.format(distributionQuantile(items, 0.5));
  }

  function renderChart() {
    if (state.view === "scatter") renderScatter(); else renderHistogram();
  }

  function showTooltip(event, item, context = {}) {
    const row = item.row;
    const tier = peerTierInfo(row.tier);
    const detailedPeerGroup = peerCategoryLabel(row.tier);
    const evidence = [row.sourceType, row.compensationYear].filter(Boolean).join(" · ");
    const displayedRange = salaryRange(row);
    const range = displayedRange
      ? `${money(displayedRange.low)}–${money(displayedRange.high)}`
      : "";
    const colorLabel = {
      topic: "Area", eaAffinity: "Effective Altruism", sourceType: "Pay source",
      titleGroup: "Title group", structure: "Organization type",
    }[state.chartColor];
    const details = [
      context.chartDetail,
      ...(context.rankDetails || []),
      range ? ["Advertised range", range] : null,
      context.reference ? ["How this record is used", "RP reference only · shown for context, not included in results"] : ["Peer group", tier.label],
      !context.reference && detailedPeerGroup !== tier.label ? ["Detailed peer group", detailedPeerGroup] : null,
      !context.reference && colorLabel ? [`Color · ${colorLabel}`, context.category] : null,
      evidence ? ["Pay source", evidence] : null,
      !context.reference && row.comparabilityScore != null ? ["Similarity score", `${row.comparabilityScore} / 100`] : null,
      !context.reference ? ["Weight in results", item.weight > 0 && item.weight < 0.01 ? "<0.01" : item.weight.toFixed(2)] : null,
    ].filter(Boolean);
    const primaryLabel = context.primaryLabel || measureLabel(row);
    const primaryFormat = context.primaryFormat || money;
    refs.tooltip.innerHTML = `
      <div class="chart-tooltip-heading">
        <strong>${escapeHtml(row.organization)}</strong>
        <span>${escapeHtml([row.title || "Reported role", !isCeoPosition() ? roleHolder(row) : ""].filter(Boolean).join(" · "))}</span>
      </div>
      <div class="chart-tooltip-value">
        <span>${escapeHtml(primaryLabel)}</span>
        <strong>${escapeHtml(primaryFormat(item.value))}</strong>
      </div>
      <dl>${details.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
      <p class="chart-tooltip-hint">Select this mark to highlight ${context.reference ? "the RP reference row" : "its row"} in the table.</p>`;
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
    const descriptor = axisDescriptor(analysisAxisKey());
    const items = analysisItems();
    const model = fitModel(items);
    refs.quantileBasis.textContent = state.fit === "empirical"
      ? `Based on weighted percentiles of the selected records for ${descriptor.shortLabel}`
      : `Estimated from the fitted ${state.fit} curve for ${descriptor.shortLabel}`;
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
      button.innerHTML = `<span>${label.number}<sup>${label.suffix}</sup> percentile</span><strong>${descriptor.format(value)}</strong>`;
      button.setAttribute("aria-label", `${formatPercentile(percentile)}: ${descriptor.fullFormat(value)}`);
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

  function tableRows(weightMap = new Map(), eligibilityMap = new Map()) {
    const filtered = rows().filter((row) => salary(row) != null && passesFilters(row));
    const direction = state.sortDirection === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const value = (row) => {
        if (state.sortKey === "inclusion") {
          const checked = Boolean(rowInclusion(row).get(row.id));
          const eligible = Boolean(eligibilityMap.get(row.id)?.eligible);
          if (checked && eligible) return 0;
          if (checked) return 1;
          return eligible ? 2 : 3;
        }
        if (state.sortKey === "tier") return tierSortValue(row.tier);
        if (state.sortKey === "adjustedSalary") return salaryForBasis(row, true) ?? -Infinity;
        if (state.sortKey === "reportedSalary") return salaryForBasis(row, false) ?? -Infinity;
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

  function areaFamily(value) {
    const normalized = String(value || "").toLowerCase();
    if (/\bai\b|artificial intelligence|technology|data science/.test(normalized)) return "AI, technology & data";
    if (/animal welfare|food systems/.test(normalized)) return "Animal welfare & food systems";
    if (/nuclear risk|security|foreign policy|conflict/.test(normalized)) return "Conflict, security & foreign policy";
    if (/climate|environment|conservation|clean energy/.test(normalized)) return "Climate & environment";
    if (/global health|global development|health policy|biomedical|workforce/.test(normalized)) return "Health & global development";
    if (/justice|housing|social policy/.test(normalized)) return "Justice, housing & social policy";
    if (/education|culture|public engagement/.test(normalized)) return "Education, culture & public engagement";
    if (/open science|open knowledge|journalism|knowledge dissemination|research infrastructure/.test(normalized)) return "Open science, journalism & knowledge";
    if (/philanthrop|effective giving|ea infrastructure|nonprofit infrastructure|grantmaking/.test(normalized)) return "Philanthropy & nonprofit infrastructure";
    if (/research|evaluation|policy|evidence/.test(normalized)) return "Research, evaluation & policy";
    return "Other areas";
  }

  function buildFilterMenus() {
    document.querySelectorAll("[data-filter-menu]").forEach((container) => {
      const key = container.dataset.filterMenu;
      const label = {
        title: "Title", sourceType: "Pay source", tier: "Peer group", topic: "Area",
        location: "Location", eaAffinity: "Effective Altruism", structure: "Organization type",
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
      const appendOption = (value, parent = options, afterChange = null) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox"; checkbox.checked = selected == null || selected.has(value);
        checkbox.addEventListener("change", () => {
          const next = state.filters[key] == null ? new Set(values) : new Set(state.filters[key]);
          if (checkbox.checked) next.add(value); else next.delete(value);
          state.filters[key] = next.size === values.length ? null : next;
          updateMenuState();
          if (afterChange) afterChange();
          renderAll();
        });
        const span = document.createElement("span"); span.textContent = categoryDisplayLabel(key, value);
        label.append(checkbox, span); parent.append(label);
        return checkbox;
      };
      if (key === "title" || key === "topic") {
        const grouped = new Map();
        rows().forEach((row) => {
          const group = key === "title"
            ? (!isCeoPosition()
              ? humanizeCategory(row.titleGroup || "Other reported titles")
              : row.titleGroup || "Other executive titles")
            : areaFamily(row.topic);
          const value = String(row[key] || "Not reported");
          if (!grouped.has(group)) grouped.set(group, new Set());
          grouped.get(group).add(value);
        });
        [...grouped].sort(([a], [b]) => a.localeCompare(b)).forEach(([group, groupSet]) => {
          const groupValues = [...groupSet].sort((a, b) => a.localeCompare(b));
          const wrapper = document.createElement("section"); wrapper.className = "filter-group";
          const groupLabel = document.createElement("label"); groupLabel.className = "filter-group-heading";
          const groupCheckbox = document.createElement("input"); groupCheckbox.type = "checkbox";
          const groupText = document.createElement("span"); groupText.className = "filter-group-title";
          const childCheckboxes = [];
          const syncGroupState = () => {
            const checkedCount = childCheckboxes.filter((checkbox) => checkbox.checked).length;
            groupCheckbox.checked = checkedCount === groupValues.length;
            groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupValues.length;
            groupText.textContent = `${group} · ${checkedCount}/${groupValues.length}`;
            groupCheckbox.setAttribute("aria-label", `${groupCheckbox.checked ? "Deselect" : "Select"} all ${group} ${key === "title" ? "titles" : "areas"}`);
          };
          groupCheckbox.addEventListener("change", () => {
            const next = state.filters[key] == null ? new Set(values) : new Set(state.filters[key]);
            groupValues.forEach((value) => { if (groupCheckbox.checked) next.add(value); else next.delete(value); });
            state.filters[key] = next.size === values.length ? null : next;
            childCheckboxes.forEach((checkbox) => { checkbox.checked = groupCheckbox.checked; });
            syncGroupState();
            updateMenuState();
            renderAll();
          });
          groupLabel.append(groupCheckbox, groupText);
          wrapper.append(groupLabel);
          groupValues.forEach((value) => childCheckboxes.push(appendOption(value, wrapper, syncGroupState)));
          syncGroupState();
          options.append(wrapper);
        });
      } else values.forEach((value) => appendOption(value));
      panel.append(status, actions, options); details.append(summary, panel); container.append(details);
    });
  }

  function appendRpReferenceRow(reference, index) {
    const tr = document.createElement("tr");
    tr.className = "rp-reference-row";
    tr.dataset.referenceId = reference.id;
    tr.dataset.referenceIndex = index;
    tr.setAttribute("aria-label", `Rethink Priorities ${reference.title || positionDefinition().label} reference row; shown for context, not included in peer results`);
    const values = [
      "", reference.organization, reference.title, compactMoney(salaryForBasis(reference, true)),
      compactMoney(reference.expenses), reference.staff == null ? "—" : String(reference.staff), "", "", reference.tier || "Reference", "—", reference.location || "—", "—", reference.structure || "—",
      reference.compensationYear == null ? "—" : String(reference.compensationYear), reference.sourceType || "Form 990", reportedSalaryDisplay(reference),
    ];
    values.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 0) td.className = "check-column";
      if (index === 1) td.className = "rp-reference-name";
      if (index === 5 && reference.staffYear === 2023 && reference.currentFilingStaff === 0) td.title = "RP's 2023 Form 990 reports 43 individuals employed on Part I, line 5. The 2024 filing reports zero, so the most recent usable comparable filing count is shown.";
      tr.append(td);
    });
    const source = document.createElement("td");
    source.className = "source-cell";
    const preview = document.createElement("button");
    preview.type = "button"; preview.className = "preview-button rp-reference-preview"; preview.textContent = "View";
    preview.addEventListener("click", () => openSourceDialog(reference));
    source.append(preview);
    if (reference.sourceUrl) {
      const link = document.createElement("a");
      link.className = "rp-reference-source"; link.href = reference.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "1 ↗";
      link.setAttribute("aria-label", `RP source 1: ${reference.compensationYear || "reported"} Form 990`);
      source.append(link);
    }
    if (reference.secondarySourceUrl) {
      const separator = document.createTextNode(" · ");
      const secondaryLink = document.createElement("a");
      secondaryLink.className = "rp-reference-source"; secondaryLink.href = reference.secondarySourceUrl;
      secondaryLink.target = "_blank"; secondaryLink.rel = "noopener noreferrer"; secondaryLink.textContent = "2 ↗";
      secondaryLink.setAttribute("aria-label", `RP source 2: ${reference.secondarySourceLabel || "secondary filing source"}`);
      source.append(separator, secondaryLink);
    }
    tr.append(source);
    refs.tableBody.append(tr);
  }

  function renderTable() {
    refs.tableBody.replaceChildren();
    activeRpReferences().forEach(appendRpReferenceRow);
    const selection = currentPlotItems();
    const weightMap = new Map(selection.map((item) => [item.row.id, item.weight]));
    const eligibilityMap = new Map(rows().map((row) => [row.id, plotEligibility(row)]));
    tableRows(weightMap, eligibilityMap).forEach((row) => {
      const available = salary(row) != null;
      const eligibility = eligibilityMap.get(row.id);
      const tr = document.createElement("tr");
      if (!rowInclusion(row).get(row.id)) tr.classList.add("is-excluded");
      if (!available) tr.classList.add("is-unavailable");
      if (!eligibility.eligible) tr.classList.add("is-plot-ineligible");
      if (state.focusedId === row.id) tr.classList.add("is-focused");
      tr.dataset.id = row.id;
      tr.dataset.plotEligible = String(eligibility.eligible);
      if (!eligibility.eligible) {
        tr.setAttribute("aria-label", `${row.organization} is unavailable for the current plot: ${eligibility.reason}`);
      }

      const toggleCell = document.createElement("td");
      toggleCell.className = "check-column";
      const toggle = document.createElement("input");
      toggle.type = "checkbox"; toggle.className = "row-toggle"; toggle.checked = available && rowInclusion(row).get(row.id);
      toggle.disabled = !available;
      const defaultExclusionReason = plainAnalysisStatus(row.analysisStatus || row.auditStatus);
      const inclusionHelp = !available
        ? `${row.organization} has no usable pay record for ${measureLabel(row)}. ${defaultExclusionReason}.`
        : row.defaultIncluded
          ? `Include ${row.organization}`
          : `${row.organization} is not in the recommended peer group: ${defaultExclusionReason}. Select to include it.`;
      toggle.setAttribute("aria-label", inclusionHelp);
      toggle.title = inclusionHelp;
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
      const wiki = document.createElement("a"); wiki.href = wikipediaUrl(row); wiki.target = "_blank";
      wiki.rel = "noopener noreferrer"; wiki.textContent = "Wikipedia ↗"; orgLinks.append(wiki);
      org.append(orgName, orgLinks);

      const title = document.createElement("td");
      title.className = "title-cell"; title.title = row.rawTitle || row.title || "";
      const roleTitle = document.createElement("span");
      roleTitle.className = "role-title"; roleTitle.textContent = row.title || "Not reported";
      title.append(roleTitle);
      if (!isCeoPosition() && roleHolder(row)) {
        const roleHolderLine = document.createElement("small");
        roleHolderLine.className = "role-holder"; roleHolderLine.textContent = roleHolder(row);
        title.append(roleHolderLine);
      }

      const evidenceType = document.createElement("td");
      evidenceType.className = "evidence-cell"; evidenceType.textContent = row.sourceType || "—";

      const adjustedSalaryCell = document.createElement("td");
      adjustedSalaryCell.className = "money-cell adjusted-salary-cell";
      adjustedSalaryCell.textContent = compactMoney(salaryForBasis(row, true));
      adjustedSalaryCell.title = `${money(salaryForBasis(row, true))} in ${DATA.priceBasis}`;
      const reportedSalaryCell = document.createElement("td");
      reportedSalaryCell.className = "money-cell reported-salary-cell";
      reportedSalaryCell.textContent = reportedSalaryDisplay(row);
      reportedSalaryCell.title = rowStream(row) === "jobAds"
        ? `${money(row.nominalRange?.low)}–${money(row.nominalRange?.high)} advertised in the source`
        : `${money(salaryForBasis(row, false))} reported in the source-year filing`;

      const weightCell = document.createElement("td");
      weightCell.className = "weight-cell";
      const weightInput = document.createElement("input");
      weightInput.type = "number"; weightInput.min = "0"; weightInput.max = "10"; weightInput.step = "0.1";
      const isModified = rowModifiedWeights(row).has(row.id);
      const normalizedWeight = weightMap.get(row.id) || 0;
      weightInput.value = isModified
        ? (rowCustomWeights(row).get(row.id) ?? 1)
        : eligibility.eligible ? normalizedWeight.toFixed(2) : "";
      if (!isModified && !eligibility.eligible) weightInput.placeholder = "—";
      weightInput.className = `weight-input${isModified ? " is-user-modified" : ""}`;
      weightInput.disabled = !available;
      weightInput.title = !eligibility.eligible
        ? `${isModified ? `Saved custom multiplier: ${Number(rowCustomWeights(row).get(row.id) ?? 1).toFixed(2)}. ` : ""}Not used on this chart: ${eligibility.reason}`
        : isModified
        ? `Custom multiplier: ${Number(rowCustomWeights(row).get(row.id) ?? 1).toFixed(2)} · final weight in results: ${normalizedWeight.toFixed(2)}`
        : `Automatic weight: ${normalizedWeight.toFixed(2)} (weights are scaled so included records average 1)`;
      weightInput.setAttribute("aria-label", `${isModified ? "Custom weight multiplier" : "Automatic weight"} for ${row.organization}`);
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
      const tier = document.createElement("td"); tier.className = "tier-cell"; tier.textContent = peerCategoryLabel(row.tier);
      const topic = document.createElement("td"); topic.className = "topic-cell"; topic.title = row.topic || ""; topic.textContent = row.topic || "—";
      const expenses = document.createElement("td"); expenses.className = "money-cell"; expenses.textContent = compactMoney(row.expenses);
      const location = document.createElement("td"); location.className = "metadata-cell"; location.textContent = row.location || "—";
      const staff = document.createElement("td"); staff.className = "number-cell"; staff.textContent = row.staff ?? "—";
      const ea = document.createElement("td"); ea.className = "metadata-cell"; ea.textContent = eaAffinityLabel(row.eaAffinity);
      const structure = document.createElement("td"); structure.className = "metadata-cell"; structure.textContent = row.structure || "—";
      if (/^(not coded|not classified|uncoded)$/i.test(ea.textContent)) {
        ea.classList.add("has-explainer");
        ea.title = row.categoryProvenance?.ea?.rationale
          || "The saved source did not establish the organization's connection to effective altruism; blank does not mean none.";
      }
      if (/^(not extracted|not reported|uncoded)$/i.test(structure.textContent)) {
        structure.classList.add("has-explainer");
        structure.title = row.categoryProvenance?.structure?.rationale
          || "The saved source did not provide enough information to classify the organization type.";
      }
      const year = document.createElement("td"); year.className = "number-cell"; year.textContent = row.compensationYear || "—";
      const source = document.createElement("td");
      source.className = "source-cell";
      const previewButton = document.createElement("button"); previewButton.type = "button"; previewButton.className = "preview-button"; previewButton.textContent = "View";
      previewButton.addEventListener("click", () => openSourceDialog(row)); source.append(previewButton);
      if (row.sourceUrl) {
        const link = document.createElement("a"); link.className = "source-link"; link.href = row.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "Open ↗"; source.append(link);
      }
      tr.append(toggleCell, org, title, adjustedSalaryCell, expenses, staff, weightCell, comparability, tier, topic, location, ea, structure, year, evidenceType, reportedSalaryCell, source);
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
      let referenceTop = headerHeight;
      refs.tableBody.querySelectorAll(".rp-reference-row").forEach((row) => {
        row.style.setProperty("--rp-reference-top", `${referenceTop}px`);
        referenceTop += row.getBoundingClientRect().height;
      });
    });
  }

  function alignHeaderFilterPopover(details) {
    if (!details?.open) return;
    requestAnimationFrame(() => {
      const popover = details.querySelector(".filter-popover");
      if (!popover) return;
      popover.style.transform = "";
      const bounds = refs.tableScroll.getBoundingClientRect();
      const rectangle = popover.getBoundingClientRect();
      let shift = 0;
      if (rectangle.left < bounds.left + 4) shift += bounds.left + 4 - rectangle.left;
      if (rectangle.right + shift > bounds.right - 4) shift -= rectangle.right + shift - bounds.right + 4;
      popover.style.transform = shift ? `translateX(${shift}px)` : "";
    });
  }

  function alignOpenHeaderFilterPopovers() {
    const bounds = refs.tableScroll.getBoundingClientRect();
    document.querySelectorAll(".header-filter-menu details[open]").forEach((details) => {
      const header = details.closest("th");
      const rectangle = header?.getBoundingClientRect();
      if (!rectangle || rectangle.right <= bounds.left || rectangle.left >= bounds.right) {
        details.open = false;
        return;
      }
      alignHeaderFilterPopover(details);
    });
  }

  function activateHeaderFilterPopover(details) {
    if (!details?.open) return;
    closeHeaderFilterPopovers({ except: details });
    alignHeaderFilterPopover(details);
  }

  function closeHeaderFilterPopovers({ except = null, restoreFocus = false } = {}) {
    const openDetails = [...document.querySelectorAll(".header-filter-menu details[open]")]
      .filter((details) => details !== except);
    if (!openDetails.length) return false;
    const focusedDetails = openDetails.find((details) => details.contains(document.activeElement));
    const focusTarget = restoreFocus
      ? (focusedDetails || openDetails[0]).querySelector("summary")
      : null;
    openDetails.forEach((details) => { details.open = false; });
    focusTarget?.focus();
    return true;
  }

  function focusRow(id) {
    state.focusedId = id;
    renderChart();
    renderTable();
    requestAnimationFrame(() => {
      refs.tableBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function focusRpReferenceRow(id = "") {
    const selector = id ? `.rp-reference-row[data-reference-id="${CSS.escape(id)}"]` : ".rp-reference-row";
    refs.tableBody.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function plainAuditStatus(value) {
    const raw = String(value || "").trim();
    const normalized = raw.toLowerCase();
    if (!normalized) return "Source record";
    if (normalized.startsWith("high confidence")) return "High-confidence title match";
    if (normalized.startsWith("medium confidence")) return "Medium-confidence title match";
    const labels = {
      "no compensation observation": "No usable pay record",
      no_expected_compensation_record: "No expected pay record",
      part_vii_discrepancy: "Part VII amount differs from Schedule J",
      salary_discrepancy_or_unverifiable: "Salary differs from the source or could not be confirmed",
      schedule_j_base_omitted_or_mismatched: "Schedule J base pay is missing or inconsistent",
      verified: "Verified",
      verified_official_current_form990_pdf: "Verified current official Form 990",
      verified_official_form990_pdf: "Verified official Form 990",
      verified_rendered_form990: "Verified Form 990",
      verified_rendered_form990ez: "Verified Form 990-EZ",
      verified_source_native_scanned_form990: "Verified scanned Form 990",
      verified_with_structural_flag: "Verified; organization type flagged",
      wrong_or_incomplete_source: "Source is incomplete or did not match",
      "post-freeze archived-source verification": "Verified from saved job posting",
      "verified source-native form 990 · sensitivity-only peer review": "Verified Form 990; broader peer case",
    };
    return labels[normalized] || humanizeCategory(raw);
  }

  function plainAnalysisStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const labels = {
      primary: "Included in the recommended peer group",
      primary_with_structure_flag: "Included; organization type flagged for review",
      primary_older_clean: "Included; older but usable record",
      primary_current_filing: "Included; current filing",
      primary_living_review: "Included after the latest review",
      "selected; no clean observation": "Selected peer, but no clean pay record",
      excluded_transition: "Excluded because of a leadership transition",
      excluded_partial_year: "Excluded because it covers only part of a year",
      excluded_measurement: "Excluded because the pay measure is not comparable",
      excluded_part_time: "Excluded because the role is part-time",
      structural_sensitivity: "Broader case because the organization type differs",
      sensitivity_only: "Broader comparison case",
      included: "Included",
      no: "Not included",
    };
    return labels[normalized] || (normalized ? humanizeCategory(normalized) : "Outside the recommended peer group");
  }

  function openSourceDialog(row) {
    $("#dialog-source-type").textContent = `${row.sourceType} · ${plainAuditStatus(row.auditStatus)}`;
    $("#dialog-title").textContent = row.organization;
    $("#dialog-measure-label").textContent = measureLabel(row);
    $("#dialog-value").textContent = money(salary(row));
    $("#dialog-evidence").textContent = row.evidenceText;
    const meta = $("#dialog-meta");
    meta.replaceChildren();
    [
      ["Person / role", [roleHolder(row), row.rawTitle || row.title].filter(Boolean).join(" · ") || "Not reported"],
      ["Pay year", row.compensationYear || "Not reported"],
      ["Dollar basis shown", state.inflationAdjusted ? `${DATA.priceBasis} · inflation adjustment ${Number(row.cpiFactor || 1).toFixed(4)}×` : "Original reported dollars · no inflation adjustment"],
      ["Inflation reference period", row.cpiPeriod || "Not reported"],
      ["Peer group", row.tier || "Not classified"],
      ["Area", row.topic || "Not classified"],
      ["Location / work arrangement", [row.location, row.remoteStatus].filter(Boolean).join(" · ") || "Not reported"],
      ["Effective Altruism", eaAffinityLabel(row.eaAffinity)],
      ["Organization type", row.structure || "Not classified"],
      ...(row.sourceMissionOperatingModel ? [["Mission / operating model (source wording)", row.sourceMissionOperatingModel]] : []),
      ...(row.sourceReportingRelationship ? [["Reporting line (source wording)", row.sourceReportingRelationship]] : []),
      ["Organization size", `${compactMoney(row.expenses)} expenses · ${row.staff ?? "—"} staff${row.staffFte ? ` (${row.staffFte} full-time equivalents)` : ""}`],
      ...(row.filingStaff != null ? [["Employees reported on Form 990", `${row.filingStaff} on Part I, line 5 (${row.staffYear || row.compensationYear})`]] : []),
      ...(row.currentFilingStaff != null ? [["Employees in latest Form 990", `${row.currentFilingStaff} on Part I, line 5 (${row.compensationYear})`]] : []),
      ["Website listed in filing", row.homepageUrl || "Not available in the saved source"],
      ["Saved source file", row.localPath || "No saved original"],
      ...(row.evidenceUpdate ? [["Source review status", plainAuditStatus(row.evidenceUpdate.status)]] : []),
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
    const secondaryCached = $("#dialog-secondary-cached");
    secondaryCached.hidden = !row.secondaryCachedSource; secondaryCached.href = row.secondaryCachedSource || "#";
    secondaryCached.textContent = row.secondaryCachedLabel ? `Open ${row.secondaryCachedLabel}` : "Open saved staff source";
    const secondaryExternal = $("#dialog-secondary-external");
    secondaryExternal.hidden = !row.secondarySourceUrl; secondaryExternal.href = row.secondarySourceUrl || "#";
    secondaryExternal.textContent = row.secondarySourceLabel ? `Open ${row.secondarySourceLabel} ↗` : "Open additional source ↗";
    refs.dialog.showModal();
  }

  function renderCategoryProvenance(row) {
    const details = $("#dialog-category-provenance");
    const provenance = row.categoryProvenance;
    details.hidden = !provenance;
    details.open = false;
    if (!provenance) return;

    $("#dialog-provenance-confidence").textContent = `${humanizeCategory(provenance.confidence || "Unspecified")} confidence in this classification`;
    $("#dialog-provenance-intro").textContent = [
      "These categories were assigned without using pay.",
      provenance.caveats ? `Important note: ${provenance.caveats}` : "",
    ].filter(Boolean).join(" ");

    const records = $("#dialog-provenance-records");
    records.replaceChildren();
    const categories = [
      ["Peer group", [provenance.tier.value, provenance.tier.label].filter(Boolean).join(" · "), provenance.tier.rationale, provenance.tier.citation],
      ["Effective Altruism", provenance.ea.value || "Not classified", provenance.ea.rationale, provenance.ea.citation],
      ["Organization type", [provenance.structure.expected && `Expected type: ${provenance.structure.expected}`, provenance.structure.observationFlag && `Record flag: ${provenance.structure.observationFlag}`].filter(Boolean).join(" · ") || "Not classified", provenance.structure.rationale, provenance.structure.citation],
      ["Area", [provenance.topic.value, provenance.topic.sourceDescription].filter(Boolean).join(" · ") || "Not classified", provenance.topic.rationale, provenance.topic.citation],
      ["Title", provenance.title.analysisGroup || "Not classified", provenance.title.rationale, provenance.title.citation],
    ];
    const observation = row.observationCategoryProvenance;
    if (observation) {
      const differences = [];
      if (observation.tier.value !== provenance.tier.value) differences.push(`original peer group ${provenance.tier.value || "not classified"} → filed-record peer group ${observation.tier.value || "not classified"}`);
      if (observation.topic.value !== provenance.topic.value) differences.push("the mission area used for the filed record differs from the original peer-selection label");
      categories.push([
        "Review of the filed record",
        [observation.tier.value && `Tier ${observation.tier.value}`, observation.tier.label, observation.structure.observationFlag && `Flag: ${observation.structure.observationFlag}`].filter(Boolean).join(" · "),
        [observation.tier.rationale, observation.structure.rationale, differences.length ? `Recorded difference: ${differences.join("; ")}.` : "The peer group and mission area agree between the selection and filing reviews."].filter(Boolean).join(" "),
        [observation.tier.citation, observation.structure.citation].filter(Boolean).join(" | "),
      ]);
    }
    const historical = row.historicalCategoryProvenance;
    if (historical) {
      const historicalValues = [
        `EA ${historical.ea.value || "not classified"}`,
        `organization type ${historical.structure.expected || "not classified"}`,
        `mission area ${historical.topic.value || "not classified"}`,
      ].join(" · ");
      categories.push([
        "Earlier category record",
        historicalValues,
        "The earlier record left these job-posting fields unclassified unless an exact pre-pay match existed. The categories shown above were added in a later source review; the original record was not changed.",
        [historical.ea.citation, historical.structure.citation, historical.topic.citation].filter(Boolean).join(" | "),
      ]);
    }
    categories.forEach(([label, value, rationale, citation]) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const headingLabel = document.createElement("span"); headingLabel.textContent = label;
      const headingValue = document.createElement("strong"); headingValue.textContent = value;
      heading.append(headingLabel, headingValue);
      const description = document.createElement("p"); description.textContent = rationale || "No additional explanation is available.";
      const citations = document.createElement("div"); citations.className = "provenance-citations";
      appendCitationLinks(citations, citation);
      section.append(heading, description, citations);
      records.append(section);
    });

    const links = $("#dialog-provenance-links");
    links.replaceChildren();
    const provenanceLinks = [
      ["Category definitions", DATA.categoryExplainers.dictionaryPath],
      ["Reasons for each row (CSV)", DATA.categoryExplainers.rationalesPath],
      ["How categories were assigned", DATA.categoryExplainers.methodologyPath],
      ["Data-quality report", DATA.categoryExplainers.validationPath],
    ];
    if (row.categoryEnrichment) provenanceLinks.push(
      ["Job-posting category data", DATA.categoryExplainers.jobAdEnrichmentPath],
      ["How job-posting categories were assigned", DATA.categoryExplainers.jobAdEnrichmentMethodologyPath],
    );
    if (row.evidenceUpdate) provenanceLinks.push(
      ["Job-posting source update", DATA.categoryExplainers.jobAdEvidenceUpdatesPath],
    );
    if (row.positionTaxonomy) provenanceLinks.push(
      ["Standardized position list", DATA.categoryExplainers.positionCatalogPath],
      ["How positions were grouped", DATA.categoryExplainers.positionMethodologyPath],
      ["Position-level records", DATA.categoryExplainers.positionObservationsPath],
      ["Position classification rules", DATA.categoryExplainers.positionTaxonomyPath],
    );
    provenanceLinks.forEach(([label, href]) => {
      const anchor = document.createElement("a"); anchor.href = href; anchor.target = "_blank"; anchor.textContent = `${label} ↗`;
      links.append(anchor);
    });
  }

  function appendCitationLinks(container, citation) {
    if (!citation) {
      container.textContent = "No row-specific source citation is available.";
      return;
    }
    citation.split(" | ").forEach((item, index) => {
      if (index) container.append(document.createTextNode(" · "));
      const separator = item.indexOf("#");
      const path = separator >= 0 ? item.slice(0, separator) : item;
      const locator = separator >= 0 ? item.slice(separator + 1) : "";
      if (path.startsWith("benchmark/") || path.startsWith("evidence/")) {
        const anchor = document.createElement("a");
        anchor.href = path; anchor.target = "_blank";
        anchor.textContent = `${path.split("/").pop()}${locator ? ` · ${locator.replaceAll(";", " · ")}` : ""}`;
        container.append(anchor);
      } else if (/^https?:\/\//i.test(path)) {
        const anchor = document.createElement("a");
        anchor.href = path; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
        anchor.textContent = new URL(path).hostname;
        container.append(anchor);
      } else container.append(document.createTextNode(item));
    });
  }

  function measureLabel(row = null) {
    const basis = state.inflationAdjusted ? "July 2026 USD" : "original reported USD";
    if (row && rowStream(row) === "jobAds") return `Job-posting midpoint, ${basis}`;
    if (row) {
      const rowMeasure = state.stream === "incumbents" ? state.measure : "base";
      return {
        base: `Base pay (Schedule J), ${basis}`,
        cash: `Reported cash pay (Part VII), ${basis}`,
        total: `Total reported pay, ${basis}`,
      }[rowMeasure];
    }
    if (state.stream === "combined") return `Comparable pay estimate, ${basis}`;
    if (state.stream === "jobAds") return `Job-posting midpoint, ${basis}`;
    return {
      base: `Base pay (Schedule J), ${basis}`,
      cash: `Reported cash pay (Part VII), ${basis}`,
      total: `Total reported pay, ${basis}`,
    }[state.measure];
  }

  function renderWeightControls() {
    if (!isCeoPosition()) state.weightings.delete("comparability");
    if (!isCeoPosition()) {
      state.weightings.delete("sourceType");
    }
    refs.weightingComponents.forEach((input) => {
      input.checked = state.weightings.has(input.value);
      if (input.value === "comparability") input.disabled = !isCeoPosition();
      else if (input.value === "sourceType") input.disabled = !isCeoPosition();
      else if (input.value === "streamBalanced") input.disabled = state.stream !== "combined" || !isCeoPosition();
      else input.disabled = false;
      const label = input.closest("label");
      if (label && (input.value === "comparability" || input.value === "sourceType")) {
        label.title = input.disabled
          ? (input.value === "comparability"
            ? "Unavailable: automatic weighting currently covers the CEO benchmark only."
            : "Unavailable: non-CEO positions currently contain only Form 990 records.")
          : "";
      }
    });
    const continuous = ["size", "staff", "recency"];
    refs.sizeControls.hidden = !continuous.some((key) => state.weightings.has(key));
    refs.expenseTargetField.hidden = !state.weightings.has("size");
    refs.staffTargetField.hidden = !state.weightings.has("staff");
    refs.recencyField.hidden = !state.weightings.has("recency");
    const components = [...state.weightings].filter((key) => key !== "streamBalanced").map((key) => WEIGHT_LABELS[key]);
    const balanced = state.weightings.has("streamBalanced") && state.stream === "combined";
    let baseDescription = components.length
      ? state.weightings.has("comparability")
        ? `Automatic weights compare Form 990 organizations with RP by expenses and staff (target effective sample size ${state.autoTargetEss}); job postings use reviewed non-pay similarity scores. Salary is not used.`
        : `Weights combine ${components.join(" × ")}. Records missing a selected size, staff, or year value receive a reduced weight.`
      : (isCeoPosition()
        ? "No weighting options selected: every included record counts equally."
        : "No weighting options selected: each selected organization has equal total influence.");
    if (!isCeoPosition()) {
      if (components.length) baseDescription += " The results are then balanced so each selected organization has equal total influence before any custom row adjustment.";
      baseDescription += " Automatic CEO weighting has not yet been extended to this position.";
    }
    refs.weightingDescription.textContent = balanced
      ? `${baseDescription} Form 990 records and job postings then receive equal total influence.`
      : baseDescription;
    const discrete = DISCRETE_WEIGHT_KEYS.filter((key) => state.weightings.has(key));
    refs.discreteWeightEditors.hidden = !discrete.length;
    refs.discreteWeightEditors.replaceChildren();
    discrete.forEach((key) => {
      const weights = ensureDiscreteWeights(key);
      const details = document.createElement("details");
      details.open = discrete.length === 1;
      const summary = document.createElement("summary"); summary.textContent = `${WEIGHT_LABELS[key]} category weights`;
      const note = document.createElement("p"); note.className = "discrete-weight-note";
      const componentNote = key === "titleGroup" && !isCeoPosition()
        ? "Title categories organize job titles within this position while keeping the wording from each source. They begin at a neutral 1.00."
        : DISCRETE_WEIGHT_NOTES[key];
      note.textContent = `${componentNote} Suggested weights use reviewed non-pay categories and are editable: 1.00 is the reference and 0 removes a category from the results.`;
      const grid = document.createElement("div"); grid.className = "discrete-weight-grid";
      Object.keys(weights).sort((a, b) => a.localeCompare(b)).forEach((category) => {
        const label = document.createElement("span"); label.className = "discrete-weight-category";
        const labelText = document.createElement("span");
        const categoryLabel = categoryDisplayLabel(key, category);
        labelText.textContent = categoryLabel; labelText.title = categoryLabel;
        const help = document.createElement("button");
        help.type = "button"; help.className = "info-tooltip"; help.textContent = "?";
        help.dataset.tooltip = discreteWeightExplanation(key, category);
        help.setAttribute("aria-label", `About ${WEIGHT_LABELS[key]} category ${categoryLabel}`);
        label.append(labelText, help);
        const input = document.createElement("input");
        input.type = "number"; input.min = "0"; input.max = "10"; input.step = "0.05"; input.value = weights[category];
        input.setAttribute("aria-label", `${WEIGHT_LABELS[key]} multiplier for ${categoryLabel}`);
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

  function componentResponse(key, value, autoCalibration = null) {
    if (key === "comparability") {
      if (!autoCalibration) return 0;
      if (autoCalibration.status === "posting_match_score") {
        return clamp(
          (value / autoCalibration.scoreMean) * autoCalibration.normalizationMultiplier,
          0.5, 1.5,
        );
      }
      return autoCalibration.status === "adaptive_kernel"
        ? Math.exp(-0.5 * (value / autoCalibration.bandwidth) ** 2)
        : 1;
    }
    if (key === "size") return Math.exp(-0.5 * (Math.log(value / state.targetExpense) / state.expenseBandwidth) ** 2);
    if (key === "staff") return Math.exp(-0.5 * (Math.log(value / state.targetStaff) / state.staffBandwidth) ** 2);
    const latestYear = Math.max(...rows().map((row) => row.compensationYear || 0));
    return 0.5 ** (Math.max(0, latestYear - value) / state.recencyHalfLife);
  }

  function renderWeightProfiles() {
    const keys = ["comparability", "size", "staff", "recency"].filter((key) => state.weightings.has(key));
    refs.comparabilityProfileField.hidden = !state.weightings.has("comparability");
    refs.autoTargetEssField.hidden = !state.weightings.has("comparability") || state.stream === "jobAds";
    refs.rpScaleReference.hidden = !keys.some((key) => key === "size" || key === "staff");
    refs.weightProfileSlots.forEach((slot) => slot.replaceChildren());
    keys.forEach((key) => {
      let values;
      let format;
      let logarithmic = false;
      let parameter;
      let axisTitle;
      let autoCalibration = null;
      if (key === "comparability") {
        const candidates = rows().filter((row) => (
          passesFilters(row) && salary(row) != null && rowInclusion(row).get(row.id)
          && plotEligibility(row).eligible
        ));
        const calibrations = autoWeightCalibrations(candidates);
        const filingCalibration = calibrations.get("incumbents");
        const postingCalibration = calibrations.get("jobAds");
        autoCalibration = state.stream === "jobAds" ? postingCalibration : filingCalibration || postingCalibration;
        if (!autoCalibration) return;
        if (autoCalibration.status === "posting_match_score") {
          refs.autoTargetEssField.hidden = true;
          values = [...autoCalibration.scores.values()];
          format = (value) => value.toFixed(0);
          parameter = `Job postings · average similarity score ${autoCalibration.scoreMean.toFixed(1)} · effective sample size ${autoCalibration.ess.toFixed(1)} · largest weight ${autoCalibration.maximum.toFixed(2)}`;
          axisTitle = "Reviewed similarity score (0–100)";
        } else {
          values = [0, ...autoCalibration.distances.values()];
          format = (value) => value.toFixed(1);
          parameter = autoCalibration.status === "adaptive_kernel"
            ? `Form 990 records · target effective sample size ${state.autoTargetEss} · achieved ${autoCalibration.ess.toFixed(1)} · largest weight ${autoCalibration.maximum.toFixed(2)}`
            : `Form 990 records · equal weights because the group is small or lacks enough organization-size information`;
          if (postingCalibration) {
            parameter += `; job postings · effective sample size ${postingCalibration.ess.toFixed(1)} · largest weight ${postingCalibration.maximum.toFixed(2)}`;
          }
          axisTitle = "Difference in organization size from RP (log scale)";
        }
      } else if (key === "size") {
        values = rows().map((row) => row.expenses).filter((value) => value > 0); format = compactMoney; logarithmic = true;
        parameter = `Reference ${compactMoney(state.targetExpense)} · matching range ${state.expenseBandwidth.toFixed(2)}`;
        axisTitle = "Annual expenses (USD)";
      } else if (key === "staff") {
        values = rows().map((row) => row.staff).filter((value) => value > 0); format = (value) => Math.round(value).toLocaleString(); logarithmic = true;
        parameter = `Reference ${state.targetStaff.toLocaleString()} · matching range ${state.staffBandwidth.toFixed(2)}`;
        axisTitle = "Staff count";
      } else {
        values = rows().map((row) => row.compensationYear).filter((value) => value > 0); format = (value) => value.toFixed(0);
        parameter = `${state.recencyHalfLife.toFixed(1)}-year half-life`;
        axisTitle = "Pay year";
      }
      if (!values.length) return;
      const postingProfile = key === "comparability" && autoCalibration?.status === "posting_match_score";
      let target = key === "comparability" ? (postingProfile ? null : 0) : key === "size" ? state.targetExpense : key === "staff" ? state.targetStaff : null;
      const rpReference = key === "comparability" ? (postingProfile ? null : 0) : key === "size" ? RP_WEIGHT_TARGET.expenses : key === "staff" ? RP_WEIGHT_TARGET.staff : null;
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
        return { value, weight: componentResponse(key, value, autoCalibration), x: margin.left + (index / 80) * innerWidth };
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
        help.dataset.tooltip = AUTO_WEIGHT_TOOLTIP;
        help.setAttribute("aria-label", "About auto-weights");
        heading.append(help);
      }
      const description = document.createElement("span"); description.textContent = parameter;
      const referenceDescription = rpReference == null ? "" : key === "comparability"
        ? "; RP reference"
        : `; RP operating target ${format(rpReference)}`;
      const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": `${WEIGHT_LABELS[key]}: how the record's weight changes${referenceDescription}` });
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
      yTitle.textContent = key === "comparability"
        ? (postingProfile ? "Automatic weight" : "Similarity weight (0–1)")
        : "Weight multiplier";
      svg.append(xTitle, yTitle); figure.append(heading, description, svg); refs.weightProfileSlots.get(key).append(figure);
      initializeHelpTooltips(figure);
    });
  }

  function updatePositionControls() {
    const position = positionDefinition();
    const ceo = isCeoPosition();
    refs.position.value = position.key;
    refs.positionSelectedLabel.textContent = position.pageLabel;
    const description = position.description || (ceo
      ? DEFAULT_POSITION.description
      : "Pay reported for selected roles in nonprofit Form 990 filings.");
    refs.positionDescription.textContent = ceo
      ? description
      : `${description} Records are balanced so each selected organization has equal total influence.`;
    refs.appTitle.setAttribute("aria-label", `${position.pageLabel} salary benchmark`);
    document.title = `${position.pageLabel} Salary Benchmark · vetr.dev`;
    refs.appDescription.content = `Interactive Rethink Priorities ${position.pageLabel} salary benchmark explorer`;
    refs.tablePanel.setAttribute("aria-label", ceo
      ? "Organization pay table"
      : `${position.pageLabel} pay table`);
    const tableCompensationTerm = compactCompensationMeasureLabel();
    refs.adjustedCompensationTerm.textContent = tableCompensationTerm;
    refs.reportedCompensationTerm.textContent = tableCompensationTerm;
    refs.adjustedCompensationSort.setAttribute(
      "aria-label", `Sort by July 2026 adjusted ${compensationMeasureLabel().toLowerCase()}`,
    );
    refs.reportedCompensationSort.setAttribute(
      "aria-label", `Sort by source-reported ${compensationMeasureLabel().toLowerCase()}`,
    );
    [...refs.stream.options].forEach((option) => {
      option.disabled = !ceo && option.value !== "incumbents";
    });
    refs.stream.disabled = !ceo;
    refs.streamDescription.textContent = ceo
      ? ""
      : "This position currently uses pay reported in Form 990 filings. CEO job postings are not mixed into it.";
    refs.autoWeightNote.textContent = ceo
      ? "Form 990s: similarity to RP's size · postings: non-pay similarity"
      : "Automatic CEO weighting only";
  }

  function updateHeadings() {
    updatePositionControls();
    const isJobs = state.stream === "jobAds";
    const isCombined = state.stream === "combined";
    refs.measureField.hidden = isJobs || isCombined;
    const plotted = axisDescriptor(analysisAxisKey());
    const positionPrefix = isCeoPosition() ? "" : `${positionDefinition().pageLabel} · `;
    refs.chartTitle.textContent = state.view === "scatter"
      ? `${positionPrefix}${plotted.shortLabel} by ${axisDescriptor("scatterX").shortLabel}`
      : `${positionPrefix}Distribution of ${plotted.shortLabel}`;
    refs.statNUnit.textContent = isCombined || !isCeoPosition() ? "records" : "organizations";
    refs.priceBasisStatus.textContent = priceBasisLabel();
    refs.scatterControls.hidden = state.view !== "scatter";
    refs.contourField.hidden = state.view !== "scatter";
    refs.binField.hidden = state.view !== "histogram";
    refs.histogramAxisSettings.hidden = state.view !== "histogram";
    refs.scatterAxisSettings.hidden = state.view !== "scatter";
    const roleLabel = positionDefinition().pageLabel;
    refs.sampleDescription.textContent = {
      primary: `Reviewed full-year ${roleLabel} pay records used in the main benchmark.`,
      sensitivity: "Recommended records plus broader comparisons.",
      clean: "Recommended records from organization types most similar to RP.",
      tierA: "Only the closest Form 990 peers and job-posting matches.",
      observed: "All records with usable pay, including broader comparisons.",
    }[state.sample];
    refs.colorDescription.textContent = {
      tier: "Peer groups run from closest to broader and broadest comparisons. Peer group affects optional weighting, not whether the source itself is valid.",
      topic: "Mission or operating category assigned during peer review.",
      eaAffinity: "Whether the organization has a documented connection to effective altruism or instead does similar work, assigned before reviewing pay.",
      sourceType: "Separates pay reported in Form 990 filings from salary ranges advertised in job postings.",
      titleGroup: isCeoPosition()
        ? "A broad category used for navigation; job titles remain exactly as written in the source."
        : "A reviewed role and seniority category; job titles remain exactly as written in the source.",
      structure: "Organization and leadership type recorded during source review.",
    }[state.chartColor];
    refs.expenseBandwidthValue.value = `${state.expenseBandwidth.toFixed(2)}×`;
    refs.staffBandwidthValue.value = `${state.staffBandwidth.toFixed(2)}×`;
    refs.recencyHalfLifeValue.value = `${state.recencyHalfLife.toFixed(1)} years`;
    refs.autoTargetEssValue.value = state.autoTargetEss;
    refs.binValue.value = state.bins;
  }

  const URL_STATE_VERSION = 7;
  const URL_WEIGHT_CODES = Object.freeze({
    comparability: "c", size: "e", staff: "s", recency: "r", tier: "t", eaAffinity: "a",
    sourceType: "v", topic: "o", titleGroup: "j", structure: "u", streamBalanced: "b",
  });
  const URL_FILTER_CODES = Object.freeze({ title: "h", sourceType: "v", tier: "t", topic: "o", location: "l", eaAffinity: "a", structure: "u" });
  const URL_STREAM_CODES = Object.freeze({ incumbents: "i", jobAds: "j", combined: "a" });
  const URL_MEASURE_CODES = Object.freeze({ base: "b", cash: "c", total: "t" });
  const URL_SAMPLE_CODES = Object.freeze({ primary: "p", sensitivity: "s", clean: "c", tierA: "a", observed: "o" });
  const URL_FIT_CODES = Object.freeze({ empirical: "e", lognormal: "l", gamma: "g" });
  const URL_QUANTILE_CODES = Object.freeze({ quintiles: "q", deciles: "d", percentiles: "p", custom: "c" });
  const URL_VARIABLE_CODES = Object.freeze({ salary: "s", expenses: "e", revenue: "r", staff: "f", comparabilityScore: "m", compensationYear: "y" });
  const reverseCodes = (codes) => Object.fromEntries(Object.entries(codes).map(([key, value]) => [value, key]));
  const URL_WEIGHT_KEYS = reverseCodes(URL_WEIGHT_CODES);
  const URL_FILTER_KEYS = reverseCodes(URL_FILTER_CODES);
  const URL_STREAM_KEYS = reverseCodes(URL_STREAM_CODES);
  const URL_MEASURE_KEYS = reverseCodes(URL_MEASURE_CODES);
  const URL_SAMPLE_KEYS = reverseCodes(URL_SAMPLE_CODES);
  const URL_FIT_KEYS = reverseCodes(URL_FIT_CODES);
  const URL_QUANTILE_KEYS = reverseCodes(URL_QUANTILE_CODES);
  const URL_VARIABLE_KEYS = reverseCodes(URL_VARIABLE_CODES);
  function encodeVariableKey(key) {
    if (URL_VARIABLE_CODES[key]) return URL_VARIABLE_CODES[key];
    if (key.startsWith("position:") && POSITION_BY_KEY.has(key.slice("position:".length))) {
      return `p:${key.slice("position:".length)}`;
    }
    throw new Error(`Unsupported analysis variable: ${key}`);
  }
  function decodeVariableKey(token) {
    if (URL_VARIABLE_KEYS[token]) return URL_VARIABLE_KEYS[token];
    if (typeof token !== "string" || !token.startsWith("p:")) return "";
    const key = token.slice(2);
    return POSITION_BY_KEY.has(key) ? `position:${key}` : "";
  }
  const allShareRows = [...allRowsByStream.incumbents, ...allRowsByStream.jobAds];
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
    if (state.weightings.has("size") && state.targetExpense !== RP_WEIGHT_TARGET.expenses) parameters.e = state.targetExpense;
    if (state.weightings.has("staff") && state.targetStaff !== RP_WEIGHT_TARGET.staff) parameters.s = state.targetStaff;
    if (state.weightings.has("size") && state.expenseBandwidth !== 0.7) parameters.b = state.expenseBandwidth;
    if (state.weightings.has("staff") && state.staffBandwidth !== 0.7) parameters.f = state.staffBandwidth;
    if (state.weightings.has("recency") && state.recencyHalfLife !== 4) parameters.r = state.recencyHalfLife;
    if (state.weightings.has("comparability") && state.autoTargetEss !== 35) parameters.a = state.autoTargetEss;
    const ranges = {};
    if (state.ranges.salary.low !== state.ranges.salary.min || state.ranges.salary.high !== state.ranges.salary.max) ranges.s = [state.ranges.salary.low, state.ranges.salary.high];
    if (state.ranges.expenses.low !== state.ranges.expenses.min || state.ranges.expenses.high !== state.ranges.expenses.max) ranges.e = [state.ranges.expenses.low, state.ranges.expenses.high];
    if (state.ranges.matchScore.low !== state.ranges.matchScore.min || state.ranges.matchScore.high !== state.ranges.matchScore.max) ranges.m = [state.ranges.matchScore.low, state.ranges.matchScore.high];
    const payload = { v: URL_STATE_VERSION };
    const defaultStream = isCeoPosition() ? "combined" : "incumbents";
    if (state.stream !== defaultStream) payload.e = URL_STREAM_CODES[state.stream];
    if (state.measure !== positionDefinition().defaultMeasure && state.stream === "incumbents") payload.m = URL_MEASURE_CODES[state.measure];
    if (!state.inflationAdjusted) payload.n = 1;
    if (state.sample !== "primary") payload.p = URL_SAMPLE_CODES[state.sample];
    if (state.fit !== "lognormal") payload.g = URL_FIT_CODES[state.fit];
    const expressionCode = (expression) => [
      encodeVariableKey(expression.numerator),
      encodeVariableKey(expression.denominator),
    ];
    const quantileAxisKey = analysisAxisKey();
    const quantileMode = axisMode(quantileAxisKey);
    const quantileExpression = axisExpression(quantileAxisKey);
    if (quantileMode === "ratio") payload.a = 1;
    const nondefaultQuantileExpression = quantileExpression.numerator !== "salary"
      || (quantileMode === "ratio" && quantileExpression.denominator !== "expenses");
    if (nondefaultQuantileExpression) {
      if (state.view === "scatter") payload.k = expressionCode(quantileExpression);
      else payload.h = expressionCode(quantileExpression);
    }
    if (state.view === "scatter" && (quantileMode === "ratio" || nondefaultQuantileExpression)) payload.l = 1;
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
    if (USE_SEMANTIC_POSITION_ROUTES) {
      url.pathname = positionRoutePath(state.position);
      url.searchParams.delete("position");
    } else {
      url.pathname = STANDALONE_ROUTE_PATH;
      if (state.position === "ceo") url.searchParams.delete("position");
      else url.searchParams.set("position", state.position);
    }
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
    url.pathname = USE_SEMANTIC_POSITION_ROUTES
      ? positionRoutePath("ceo")
      : STANDALONE_ROUTE_PATH;
    url.searchParams.delete("s");
    url.searchParams.delete("position");
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

  function syncAxisControls() {
    Object.entries(refs.axisModes).forEach(([axisKey, radios]) => {
      radios.forEach((radio) => { radio.checked = radio.value === state.axisModes[axisKey]; });
    });
    Object.entries(refs.axisScales).forEach(([axisKey, radios]) => {
      radios.forEach((radio) => { radio.checked = radio.value === state.axisScales[axisKey]; });
    });
  }

  function syncControlsFromState() {
    refs.position.value = state.position;
    refs.positionSelectedLabel.textContent = positionDefinition().label;
    refs.stream.value = state.stream;
    refs.measure.value = state.measure;
    refs.sample.value = state.sample;
    refs.dollarBasis.forEach((radio) => { radio.checked = radio.value === (state.inflationAdjusted ? "adjusted" : "nominal"); });
    refs.fit.forEach((radio) => { radio.checked = radio.value === state.fit; });
    refs.view.forEach((radio) => { radio.checked = radio.value === state.view; });
    syncAxisControls();
    refs.chartColor.value = state.chartColor;
    refs.showContours.checked = state.showContours;
    refs.targetExpense.value = state.targetExpense / 1_000_000;
    refs.targetStaff.value = state.targetStaff;
    refs.expenseBandwidth.value = state.expenseBandwidth;
    refs.staffBandwidth.value = state.staffBandwidth;
    refs.recencyHalfLife.value = state.recencyHalfLife;
    refs.autoTargetEss.value = state.autoTargetEss;
    refs.bins.value = state.bins;
    refs.quantileGranularity.value = state.quantileGranularity;
    refs.customQuantiles.value = state.customQuantiles;
    refs.markCurve.checked = state.markCurve;
    refs.salaryMin.value = state.ranges.salary.low;
    refs.salaryMax.value = state.ranges.salary.high;
    refs.expenseMin.value = expenseSliderPosition(state.ranges.expenses.low);
    refs.expenseMax.value = expenseSliderPosition(state.ranges.expenses.high);
    refs.matchScoreMin.value = state.ranges.matchScore.low;
    refs.matchScoreMax.value = state.ranges.matchScore.high;
    updateRangeLabels();
  }

  function expandCompactUrlState(payload, semanticPosition = "") {
    if (![2, 3, 4, 5, 6, URL_STATE_VERSION].includes(payload?.v)) return payload;
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
        pos: POSITION_BY_KEY.has(semanticPosition)
          ? semanticPosition
          : version >= 6 && POSITION_BY_KEY.has(payload.o) ? payload.o : "ceo",
        s: payload.e ? URL_STREAM_KEYS[payload.e] : version === 2 ? "incumbents" : "combined",
        m: URL_MEASURE_KEYS[payload.m], p: URL_SAMPLE_KEYS[payload.p],
        ia: payload.n !== 1,
        d: URL_FIT_KEYS[payload.g],
        am: payload.a === 1 ? "ratio" : "value",
        vw: payload.l === 1 ? "scatter" : "histogram", hx: payload.h, sx: payload.j, sy: payload.k,
        w: [...String(payload.w || "")].map((code) => URL_WEIGHT_KEYS[code]).filter(Boolean),
        te: payload.x?.e, ts: payload.x?.s, eb: payload.x?.b, sb: payload.x?.f, rh: payload.x?.r, ae: payload.x?.a,
        q: URL_QUANTILE_KEYS[payload.q], qq: payload.z,
      },
      d: discrete,
      f: filters,
      r: payload.r,
      i: (payload.i || []).map(([code, selected]) => [shareRowCodes.get(String(code))?.id, selected]).filter(([id]) => id),
      c: custom,
    };
  }

  function restoreUrlState(payload, semanticPosition = "") {
    const sourceVersion = payload?.v;
    const compactVersion = [2, 3, 4, 5, 6, URL_STATE_VERSION].includes(payload?.v);
    payload = expandCompactUrlState(payload, semanticPosition);
    if (!payload || payload.v !== 1 || typeof payload.a !== "object") throw new Error("Unsupported or incomplete state version.");
    const analysis = payload.a;
    const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    state.position = enumValue(analysis.pos, [...POSITION_BY_KEY.keys()], "ceo");
    state.stream = enumValue(analysis.s, ["incumbents", "jobAds", "combined"], sourceVersion === 1 ? "incumbents" : state.stream);
    if (!isCeoPosition()) state.stream = "incumbents";
    state.measure = enumValue(analysis.m, ["base", "cash", "total"], positionDefinition().defaultMeasure);
    state.inflationAdjusted = analysis.ia !== false;
    if (state.stream === "combined") state.measure = "base";
    state.sample = enumValue(analysis.p, ["primary", "sensitivity", "clean", "tierA", "observed"], state.sample);
    state.fit = enumValue(analysis.d, ["empirical", "lognormal", "gamma"], state.fit);
    const validWeights = [...DISCRETE_WEIGHT_KEYS, "comparability", "size", "staff", "recency", "streamBalanced"];
    state.weightings = new Set((Array.isArray(analysis.w) ? analysis.w : []).filter((value) => validWeights.includes(value)));
    if (state.weightings.has("comparability")) {
      const preserveStreamBalance = state.weightings.has("streamBalanced");
      state.weightings = new Set(["comparability"]);
      if (preserveStreamBalance) state.weightings.add("streamBalanced");
    }
    if (!isCeoPosition()) {
      state.weightings.delete("comparability");
      state.weightings.delete("sourceType");
      state.weightings.delete("streamBalanced");
    }
    state.targetExpense = finiteNumber(analysis.te, state.targetExpense, 1_000_000, 100_000_000);
    state.targetStaff = finiteNumber(analysis.ts, state.targetStaff, 1, 1000);
    state.expenseBandwidth = finiteNumber(analysis.eb, state.expenseBandwidth, 0.2, 1.5);
    state.staffBandwidth = finiteNumber(analysis.sb, state.staffBandwidth, 0.2, 1.5);
    state.recencyHalfLife = finiteNumber(analysis.rh, state.recencyHalfLife, 1, 12);
    state.autoTargetEss = Math.round(finiteNumber(analysis.ae, state.autoTargetEss, 20, 60));
    state.bins = Math.round(finiteNumber(analysis.b, state.bins, 2, 200));
    state.autoBins = compactVersion;
    state.view = enumValue(analysis.vw, ["histogram", "scatter"], state.view);
    const restoredAxisMode = enumValue(analysis.am, ["value", "ratio"], "value");
    state.axisModes = { histogram: "value", scatterX: "value", scatterY: "value" };
    state.axisScales = { histogram: "linear", scatterX: "log", scatterY: "linear" };
    if (sourceVersion === 1 || sourceVersion === 4) {
      Object.keys(state.axisModes).forEach((axisKey) => { state.axisModes[axisKey] = restoredAxisMode; });
    } else state.axisModes[state.view === "scatter" ? "scatterY" : "histogram"] = restoredAxisMode;
    const decodeExpression = (encoded, fallback) => {
      if (Array.isArray(encoded) && encoded.length === 2) {
        const numerator = decodeVariableKey(encoded[0]);
        const denominator = decodeVariableKey(encoded[1]);
        if (numericVariables[numerator] && numericVariables[denominator]) return { numerator, denominator };
        return fallback;
      }
      if (typeof encoded !== "string") return fallback;
      if (encoded.length === 2 && URL_VARIABLE_KEYS[encoded[0]] && URL_VARIABLE_KEYS[encoded[1]]) {
        return { numerator: URL_VARIABLE_KEYS[encoded[0]], denominator: URL_VARIABLE_KEYS[encoded[1]] };
      }
      return fallback;
    };
    state.histogramAxis = decodeExpression(analysis.hx, state.histogramAxis);
    state.scatterXAxis = decodeExpression(analysis.sx, state.scatterXAxis);
    state.scatterYAxis = decodeExpression(analysis.sy, state.scatterYAxis);
    if (analysis.x && numericVariables[analysis.x]) state.scatterXAxis.numerator = analysis.x;
    normalizeAxisExpressions();
    Object.keys(state.axisScales).forEach((axisKey) => { state.axisScales[axisKey] = recommendedAxisScale(axisKey); });
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
    const matchScoreRange = payload.r?.m;
    if (Array.isArray(salaryRange) && salaryRange.length === 2) {
      state.ranges.salary.low = finiteNumber(salaryRange[0], state.ranges.salary.min, state.ranges.salary.min, state.ranges.salary.max);
      state.ranges.salary.high = finiteNumber(salaryRange[1], state.ranges.salary.max, state.ranges.salary.low, state.ranges.salary.max);
    }
    if (Array.isArray(expenseRange) && expenseRange.length === 2) {
      state.ranges.expenses.low = finiteNumber(expenseRange[0], state.ranges.expenses.min, state.ranges.expenses.min, state.ranges.expenses.max);
      state.ranges.expenses.high = finiteNumber(expenseRange[1], state.ranges.expenses.max, state.ranges.expenses.low, state.ranges.expenses.max);
    }
    if (Array.isArray(matchScoreRange) && matchScoreRange.length === 2) {
      state.ranges.matchScore.low = finiteNumber(matchScoreRange[0], state.ranges.matchScore.min, state.ranges.matchScore.min, state.ranges.matchScore.max);
      state.ranges.matchScore.high = finiteNumber(matchScoreRange[1], state.ranges.matchScore.max, state.ranges.matchScore.low, state.ranges.matchScore.max);
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
      position: "ceo", stream: "combined", measure: "base", inflationAdjusted: true, sample: "primary", fit: "lognormal", weightings: new Set(), discreteWeights: {}, autoTargetEss: 35,
      targetExpense: RP_WEIGHT_TARGET.expenses, targetStaff: RP_WEIGHT_TARGET.staff, expenseBandwidth: 0.7, staffBandwidth: 0.7, recencyHalfLife: 4,
      bins: 20, autoBins: true, view: "histogram",
      axisModes: { histogram: "value", scatterX: "value", scatterY: "value" },
      axisScales: { histogram: "linear", scatterX: "log", scatterY: "linear" },
      histogramAxis: { numerator: "salary", denominator: "expenses" },
      scatterXAxis: { numerator: "expenses", denominator: "staff" },
      scatterYAxis: { numerator: "salary", denominator: "expenses" },
      chartColor: "tier", showContours: true,
      quantileGranularity: "quintiles", customQuantiles: "5, 25, 50, 75, 95", markCurve: true,
      sortKey: "tier", sortDirection: "asc",
      filters: {
        title: null, sourceType: null, tier: null, topic: null, location: null,
        eaAffinity: null, structure: null,
      },
      ranges: {
        salary: { min: null, max: null, low: null, high: null },
        expenses: { min: null, max: null, low: null, high: null },
        matchScore: { min: 0, max: 100, low: 0, high: 100 },
      },
      focusedId: "", hoverQuantile: null,
    });
    Object.entries(allRowsByStream).forEach(([stream, streamRows]) => {
      modifiedWeightIds[stream].clear();
      streamRows.forEach((row) => { inclusion[stream].set(row.id, Boolean(row.defaultIncluded)); customWeights[stream].set(row.id, 1); });
    });
    refs.position.value = state.position; refs.positionSelectedLabel.textContent = positionDefinition().label;
    refs.stream.value = state.stream; refs.measure.value = state.measure; refs.sample.value = state.sample;
    refs.dollarBasis.forEach((radio) => { radio.checked = radio.value === "adjusted"; });
    refs.fit.forEach((radio) => { radio.checked = radio.value === state.fit; });
    refs.view.forEach((radio) => { radio.checked = radio.value === state.view; });
    syncAxisControls();
    refs.chartColor.value = state.chartColor; refs.showContours.checked = true;
    refs.targetExpense.value = RP_WEIGHT_TARGET.expenses / 1_000_000; refs.targetStaff.value = RP_WEIGHT_TARGET.staff;
    refs.expenseBandwidth.value = 0.7; refs.staffBandwidth.value = 0.7; refs.recencyHalfLife.value = 4; refs.bins.value = state.bins;
    refs.autoTargetEss.value = 35; refs.autoTargetEssValue.value = 35;
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

  function activatePosition(key) {
    if (!POSITION_BY_KEY.has(key)) return;
    state.position = key;
    state.stream = isCeoPosition() ? "combined" : "incumbents";
    state.measure = positionDefinition().defaultMeasure;
    state.sample = "primary";
    state.focusedId = "";
    state.hoverQuantile = null;
    state.autoBins = true;
    state.discreteWeights = {};
    state.weightings.delete("comparability");
    state.weightings.delete("streamBalanced");
    clearAnalyticalFilters();
    positionRowsForReset().forEach((row) => {
      rowInclusion(row).set(row.id, Boolean(row.defaultIncluded));
      rowCustomWeights(row).set(row.id, 1);
      rowModifiedWeights(row).delete(row.id);
    });
    applyPreset();
    configureRanges();
    buildFilterMenus();
    renderWeightControls();
    syncControlsFromState();
    renderAll();
  }

  refs.position.addEventListener("change", () => activatePosition(refs.position.value));
  refs.stream.addEventListener("change", () => {
    state.stream = refs.stream.value; state.focusedId = ""; state.autoBins = true;
    if (state.stream === "combined") { state.measure = "base"; refs.measure.value = "base"; }
    clearAnalyticalFilters();
    applyPreset(); configureRanges(); buildFilterMenus(); renderWeightControls(); renderAll();
  });
  refs.measure.addEventListener("change", () => {
    state.measure = refs.measure.value; state.focusedId = ""; state.autoBins = true;
    applyPreset(); configureRanges(); renderAll();
  });
  refs.dollarBasis.forEach((radio) => radio.addEventListener("change", () => {
    if (!radio.checked) return;
    const expenseRange = { ...state.ranges.expenses };
    const matchScoreRange = { ...state.ranges.matchScore };
    state.inflationAdjusted = radio.value === "adjusted";
    state.autoBins = true;
    configureRanges();
    state.ranges.expenses = expenseRange;
    state.ranges.matchScore = matchScoreRange;
    refs.expenseMin.value = expenseSliderPosition(expenseRange.low);
    refs.expenseMax.value = expenseSliderPosition(expenseRange.high);
    refs.matchScoreMin.value = matchScoreRange.low;
    refs.matchScoreMax.value = matchScoreRange.high;
    updateRangeLabels();
    renderAll();
  }));
  refs.sample.addEventListener("change", () => { state.sample = refs.sample.value; applyPreset(); renderAll(); });
  refs.fit.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.fit = radio.value; renderAll(); } }));
  refs.weightingComponents.forEach((input) => input.addEventListener("change", () => {
    if (input.checked && input.value === "comparability") {
      const preserveStreamBalance = state.weightings.has("streamBalanced");
      state.weightings.clear();
      state.weightings.add("comparability");
      if (preserveStreamBalance) state.weightings.add("streamBalanced");
    } else if (input.checked) {
      if (input.value !== "streamBalanced") state.weightings.delete("comparability");
      state.weightings.add(input.value);
    } else state.weightings.delete(input.value);
    renderWeightControls(); renderAll();
  }));
  refs.targetExpense.addEventListener("change", () => { state.targetExpense = clamp(Number(refs.targetExpense.value) || RP_WEIGHT_TARGET.expenses / 1_000_000, 1, 100) * 1_000_000; renderAll(); });
  refs.targetStaff.addEventListener("change", () => { state.targetStaff = clamp(Number(refs.targetStaff.value) || RP_WEIGHT_TARGET.staff, 1, 1000); renderAll(); });
  refs.expenseBandwidth.addEventListener("input", () => { state.expenseBandwidth = Number(refs.expenseBandwidth.value); renderAll(); });
  refs.staffBandwidth.addEventListener("input", () => { state.staffBandwidth = Number(refs.staffBandwidth.value); renderAll(); });
  refs.recencyHalfLife.addEventListener("input", () => { state.recencyHalfLife = Number(refs.recencyHalfLife.value); renderAll(); });
  refs.autoTargetEss.addEventListener("input", () => { state.autoTargetEss = Number(refs.autoTargetEss.value); renderAll(); });
  refs.bins.addEventListener("input", () => { state.autoBins = false; state.bins = Number(refs.bins.value); renderAll(); });
  refs.quantileGranularity.addEventListener("change", () => { state.quantileGranularity = refs.quantileGranularity.value; renderQuantiles(); renderChart(); });
  refs.customQuantiles.addEventListener("input", () => { state.customQuantiles = refs.customQuantiles.value; renderQuantiles(); renderChart(); });
  refs.markCurve.addEventListener("change", () => { state.markCurve = refs.markCurve.checked; renderChart(); });
  refs.view.forEach((radio) => radio.addEventListener("change", () => { if (radio.checked) { state.view = radio.value; renderAll(); } }));
  Object.entries(refs.axisModes).forEach(([axisKey, radios]) => radios.forEach((radio) => radio.addEventListener("change", () => {
    if (!radio.checked) return;
    state.axisModes[axisKey] = radio.value;
    normalizeAxisExpressions(axisKey);
    state.axisScales[axisKey] = recommendedAxisScale(axisKey);
    syncAxisControls();
    if (axisKey === "histogram") state.autoBins = true;
    closeAxisSelector();
    renderAll();
  })));
  Object.entries(refs.axisScales).forEach(([axisKey, radios]) => radios.forEach((radio) => radio.addEventListener("change", () => {
    if (!radio.checked) return;
    state.axisScales[axisKey] = radio.value;
    if (axisKey === "histogram") state.autoBins = true;
    renderAll();
  })));
  refs.axisNumerator.addEventListener("change", () => updateAxisExpression("numerator", refs.axisNumerator.value));
  refs.axisDenominator.addEventListener("change", () => updateAxisExpression("denominator", refs.axisDenominator.value));
  refs.axisSelectorClose.addEventListener("click", closeAxisSelector);
  document.addEventListener("pointerdown", (event) => {
    if (refs.axisSelector.hidden || refs.axisSelector.contains(event.target) || event.target.closest?.(".axis-variable-control")) return;
    closeAxisSelector();
  });
  document.addEventListener("pointerdown", (event) => {
    closeHeaderFilterPopovers({ except: event.target.closest?.(".header-filter-menu details") || null });
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeAxisSelector();
    if (closeHeaderFilterPopovers({ restoreFocus: true })) event.preventDefault();
  });
  refs.chartColor.addEventListener("change", () => { state.chartColor = refs.chartColor.value; renderAll(); });
  refs.showContours.addEventListener("change", () => { state.showContours = refs.showContours.checked; renderChart(); });
  refs.salaryMin.addEventListener("input", () => updateRange("salary", "low"));
  refs.salaryMax.addEventListener("input", () => updateRange("salary", "high"));
  refs.expenseMin.addEventListener("input", () => updateRange("expenses", "low"));
  refs.expenseMax.addEventListener("input", () => updateRange("expenses", "high"));
  refs.matchScoreMin.addEventListener("input", () => updateRange("matchScore", "low"));
  refs.matchScoreMax.addEventListener("input", () => updateRange("matchScore", "high"));
  refs.reset.addEventListener("click", reset);
  document.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".header-filter-menu details")) activateHeaderFilterPopover(event.target);
  }, true);
  refs.tableScroll.addEventListener("scroll", alignOpenHeaderFilterPopovers);
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
  populatePositionSelect();
  const initialUrl = new URL(window.location.href);
  const encodedInitialState = initialUrl.searchParams.get("s");
  const pathPosition = positionFromPath(initialUrl.pathname);
  const legacyPosition = initialUrl.searchParams.get("position") || "";
  const semanticPosition = pathPosition && pathPosition !== "ceo"
    ? pathPosition
    : POSITION_BY_KEY.has(legacyPosition) ? legacyPosition : pathPosition;
  if (encodedInitialState || POSITION_BY_KEY.has(semanticPosition)) {
    try {
      restoreUrlState(encodedInitialState ? decodeUrlState(encodedInitialState) : { v: URL_STATE_VERSION }, semanticPosition);
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
  if (document.fonts?.ready) document.fonts.ready.then(() => renderChart());
  urlSyncReady = true;
  writeUrlState();
})();
