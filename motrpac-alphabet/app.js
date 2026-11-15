const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "motrpac-alphabet-editor-v4";
const LEGACY_STORAGE_KEYS = ["motrpac-alphabet-editor-v2", "motrpac-alphabet-editor-v1"];
const ARTBOARD = { width: 6000, height: 4800 };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const STEM_FALLBACK_MIN = -900;
const STEM_MAX = 1300;
const STEM_HANDLE_OFFSET = 140;
const ROTATE_HANDLE_OFFSET = 355;
const CURVE_PAIR_HANDLE_OFFSET = 360;
const CURVE_PAIR_GUIDE_START_OFFSET = 190;
const CURVE_PAIR_HANDLE_T = { outer: 0.5, inner: 0.5 };
const DEFAULT_STEM_DISPLACEMENT = 104.366;
const POLISH_MAX_ROTATION = 8;
const POLISH_ROTATION_FRACTION = 0.35;
const POLISH_POSITION_FRACTION = 0.18;
const POLISH_OVERLAP_FRACTION = 0.14;
const POLISH_LENGTH_STEP = 30;
const POLISH_HEAD_OVERLAP_MARGIN = 12;
const POLISH_STAGE2_ANGLE_STEP = 15;
const POLISH_STAGE2_POSITION_FRACTION = 0.22;
const POLISH_STAGE2_ROTATION_FRACTION = 0.2;
const POLISH_STAGE2_LENGTH_STEP = 8;
const POLISH_STAGE2_GUIDE_THRESHOLD = 12;
const POLISH_STAGE2_MAX_ROTATION = 5;
const POLISH_CURVE_ANGLE_STEP = 120;
const POLISH_STAGE2_CURVE_ANGLE_STEP = 45;
const POLISH_SIZE_STEP = 90;
const ALIGNMENT_GUIDE_STEP = 15;
const ALIGNMENT_GUIDE_THRESHOLD = 12;
const ALIGNMENT_GUIDE_MIN_DISTANCE = 80;
const ALIGNMENT_GUIDE_STEM_ANGLE_THRESHOLD = 3;
const ALIGNMENT_GUIDE_LABEL_SCREEN_SPACING = 58;
const MAX_VIEW = { width: 12000, height: 9600 };
let originalStemDisplacementCache = null;
let originalStemEndGapCache = null;
let originalAnchorHeightCache = null;
const resizeCursorCache = new Map();
let shapeClipboardPayload = null;

const templates = {
  "lollipop-long": {
    label: "Long lollipop",
    path: "M 1576.102,551.187 A 246.736,246.736 0 1 1 1775.244,551.388 L 1774.814,977.015 A 246.736,246.736 0 0 0 1575.672,976.814 Z",
    pivot: { x: 1675.901, y: 325.535 }
  },
  "lollipop-long-alt": {
    label: "Long lollipop alt",
    path: "M 421.549,1079.349 A 246.736,246.736 0 1 1 222.407,1079.273 L 222.571,651.894 A 246.736,246.736 0 0 0 421.712,651.970 Z",
    pivot: { x: 321.892, y: 1305.064 }
  },
  "lollipop-short-left": {
    label: "Short lollipop",
    path: "M 451.598,535.850 A 246.736,246.736 0 1 1 564.517,371.817 L 809.501,540.461 A 246.736,246.736 0 0 0 696.583,704.494 Z",
    pivot: { x: 322.105, y: 325.825 }
  },
  "lollipop-short-right": {
    label: "Reverse lollipop",
    path: "M 1265.168,755.072 A 246.736,246.736 0 1 1 1145.825,595.652 L 1350.844,442.172 A 246.736,246.736 0 0 0 1470.187,601.592 Z",
    pivot: { x: 1024.774, y: 810.653 }
  },
  "double-stem": {
    label: "Double stem",
    type: "stem",
    path: "M -420,-99.571 L 420,-99.571 A 246.736,246.736 0 0 0 420,99.571 L -420,99.571 A 246.736,246.736 0 0 0 -420,-99.571 Z",
    pivot: { x: 0, y: 0 }
  },
  "curved-double-stem": {
    label: "Curved double stem",
    type: "curved-stem",
    path: "M -420,-99.571 Q 0,-340 420,-99.571 A 246.736,246.736 0 0 0 420,99.571 Q 0,-140 -420,99.571 A 246.736,246.736 0 0 0 -420,-99.571 Z",
    pivot: { x: 0, y: 0 }
  },
  "curved-lollipop": {
    label: "Curved lollipop",
    type: "curved-lollipop",
    path: "M 226,-99.571 C 360,-300 600,-300 760,-99.571 A 246.736,246.736 0 0 0 760,99.571 C 600,-100 360,-100 226,99.571 A 246.736,246.736 0 1 1 226,-99.571 Z",
    pivot: { x: 0, y: 0 }
  },
  circle: {
    label: "Circle",
    path: "M 1922.463,1305.529 A 246.736,246.736 0 1 1 1428.992,1305.529 A 246.736,246.736 0 1 1 1922.463,1305.529 Z",
    pivot: { x: 1675.727, y: 1305.529 }
  }
};

const styles = [
  { id: "purple", label: "Purple", preview: "#46257e", fill: "#46257e" },
  { id: "red", label: "Red", preview: "#b40e2c", fill: "#b40e2c" },
  { id: "green", label: "Green", preview: "#62a746", fill: "#62a746" },
  { id: "blue", label: "Blue", preview: "#3a9fd1", fill: "#3a9fd1" },
  { id: "yellow", label: "Yellow", preview: "#cb9f1c", fill: "#cb9f1c" }
];

const state = {
  activeLetter: "A",
  letters: makeEmptyLetters(),
  selectedIds: new Set(),
  activeTemplate: "lollipop-long",
  activeStyle: "purple",
  gridSize: 25,
  angleStep: 5,
  polishIterations: 50,
  polishStage: 1,
  view: { x: -200, y: -200, width: 6400, height: 5200 },
  hoveredId: null,
  drag: null,
  alignmentGuides: []
};

const els = {};
const historyState = {
  entries: [],
  index: -1,
  max: 100
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  writeDefs();
  measureTemplates();
  restoreState();
  initializeHistory("Initial");
  initControls();
  initLetters();
  renderGrid();
  renderAll();
  updateViewBox();
}

function cacheElements() {
  els.stage = document.getElementById("stage");
  els.viewport = document.getElementById("viewport");
  els.defs = document.getElementById("stage-defs");
  els.gridLayer = document.getElementById("grid-layer");
  els.guideLayer = document.getElementById("guide-layer");
  els.guideOverlay = document.getElementById("guide-overlay");
  els.shapeLayer = document.getElementById("shape-layer");
  els.handleLayer = document.getElementById("handle-layer");
  els.selectionBox = document.getElementById("selection-box");
  els.letterStrip = document.getElementById("letter-strip");
  els.activeLetterLabel = document.getElementById("active-letter-label");
  els.undoAction = document.getElementById("undo-action");
  els.redoAction = document.getElementById("redo-action");
  els.resetApp = document.getElementById("reset-app");
  els.historyJump = document.getElementById("history-jump");
  els.headerExportJson = document.getElementById("header-export-json");
  els.headerImportJson = document.getElementById("header-import-json");
  els.copyCurrentJson = document.getElementById("copy-current-json");
  els.copyShapes = document.getElementById("copy-shapes");
  els.pasteShapes = document.getElementById("paste-shapes");
  els.alignButtons = [...document.querySelectorAll("[data-align-axis][data-align-mode]")];
  els.distributeX = document.getElementById("distribute-x");
  els.distributeY = document.getElementById("distribute-y");
  els.globalVariantButtons = [...document.querySelectorAll("[data-global-variant]")];
  els.selectionCount = document.getElementById("selection-count");
  els.shapeTemplate = document.getElementById("shape-template");
  els.shapeStyle = document.getElementById("shape-style");
  els.styleSwatches = document.getElementById("style-swatches");
  els.shapeX = document.getElementById("shape-x");
  els.shapeY = document.getElementById("shape-y");
  els.shapeAngle = document.getElementById("shape-angle");
  els.shapeStem = document.getElementById("shape-stem");
  els.letterVariant = document.getElementById("letter-variant");
  els.polishIterations = document.getElementById("polish-iterations");
  els.polishStageButtons = [...document.querySelectorAll("[data-polish-stage]")];
  els.gridSize = document.getElementById("grid-size");
  els.angleStep = document.getElementById("angle-step");
}

function writeDefs() {
  els.defs.innerHTML = svgDefsMarkup();
}

function svgDefsMarkup() {
  return "";
}

function measureTemplates() {
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("visibility", "hidden");
  els.shapeLayer.appendChild(group);

  Object.values(templates).forEach((template) => {
    template.geometry = parseTemplateGeometry(template);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", template.path);
    group.appendChild(path);
    const box = path.getBBox();
    template.bbox = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height
    };
    template.anchor = template.pivot;
    group.removeChild(path);
  });

  els.shapeLayer.removeChild(group);
}

function makeEmptyLetters() {
  return LETTERS.reduce((acc, letter) => {
    acc[letter] = makeLetterState();
    return acc;
  }, {});
}

function makeLetterState(shapes = []) {
  return {
    activeVariant: 0,
    variants: [shapes]
  };
}

function defaultLetters() {
  const letters = makeEmptyLetters();
  const seeded = seedAlphabetVariants();
  LETTERS.forEach((letter) => {
    letters[letter] = {
      activeVariant: 0,
      variants: seeded[letter]
    };
  });
  letters.A.variants[0] = defaultAShapes();
  letters.D.variants[0] = defaultDShapes();
  letters.G.variants[0] = defaultGShapes();
  letters.M = makeLetterState(originalMShapes());
  letters.M.variants.push(originalMShapes());
  letters.W.variants[0] = rotateShapes(originalMShapes(), 180);
  letters.W.variants[1] = rotateShapes(originalMShapes(), 180);
  letters.Z.variants[0] = defaultZShapes();
  return letters;
}

function originalMShapes() {
  return [
    makeShape("lollipop-long", "blue", 0, 0, 0),
    makeShape("lollipop-short-left", "purple", 0, 0, 0),
    makeShape("lollipop-short-right", "green", 0, 0, 0),
    makeShape("lollipop-long-alt", "red", 0, 0, 0),
    makeShape("circle", "yellow", 0, 0, 0)
  ];
}

function defaultAShapes() {
  return [
    makeShapeFromConfig({
      template: "lollipop-short-left",
      style: "purple",
      x: 2077.895,
      y: 674.175,
      angle: 37.42264142351917,
      stemOffset: 277.23440962340476,
      stemSeedAngle: 69.17244371320714,
      lastLollipopTemplate: "lollipop-short-left"
    }),
    makeShapeFromConfig({
      template: "lollipop-short-left",
      style: "green",
      x: 1602.895,
      y: 1749.175,
      angle: 325.45692699311167,
      stemOffset: -28.307495836096678,
      stemSeedAngle: 359.1128852047218,
      lastLollipopTemplate: "lollipop-short-left"
    }),
    makeShapeFromConfig({
      template: "circle",
      style: "red",
      x: 1074.273,
      y: 769.471,
      angle: 320,
      stemOffset: 0,
      stemSeedAngle: 0,
      lastLollipopTemplate: null
    }),
    makeShapeFromConfig({
      template: "lollipop-long-alt",
      style: "blue",
      x: 1234.3858412265663,
      y: 1869.936,
      angle: 18.50937094290481,
      stemOffset: 176.88626293335705,
      stemSeedAngle: 0,
      lastLollipopTemplate: "lollipop-long-alt"
    }),
    makeShapeFromConfig({
      template: "lollipop-long-alt",
      style: "yellow",
      x: 2828.108,
      y: 1869.936,
      angle: 339.995011571649,
      stemOffset: 187.20280278839527,
      stemSeedAngle: 252.39951790888358,
      lastLollipopTemplate: "lollipop-long-alt"
    })
  ];
}

function defaultDShapes() {
  return [
    makeShapeFromConfig({
      template: "lollipop-long",
      style: "red",
      x: -1106.1653852871266,
      y: 723.2448475174139,
      angle: 0.6101565736846624,
      stemOffset: 138.3672340834601,
      stemSeedAngle: 0,
      curveOffset: 0,
      curveStartOffset: 0,
      curveEndOffset: 0,
      curveStartPull: 0,
      curveEndPull: 0,
      lastLollipopTemplate: "lollipop-long"
    }),
    makeShapeFromConfig({
      template: "curved-double-stem",
      style: "green",
      x: 893.007564947867,
      y: 1612.8424925403215,
      angle: 270.66666666666674,
      stemOffset: 126.0711217289089,
      stemSeedAngle: 269.76772478600014,
      curveOffset: 900,
      curveStartOffset: 1200,
      curveEndOffset: 1146.6666666666667,
      curveStartPull: 49.3472,
      curveEndPull: 49.3472,
      lastLollipopTemplate: "lollipop-short-right"
    }),
    makeShapeFromConfig({
      template: "circle",
      style: "purple",
      x: -1119.0480061467028,
      y: 863.0566991963983,
      angle: 0,
      stemOffset: 0,
      stemSeedAngle: 0,
      curveOffset: 0,
      curveStartOffset: 0,
      curveEndOffset: 0,
      curveStartPull: 0,
      curveEndPull: 0,
      lastLollipopTemplate: null
    })
  ];
}

function defaultGShapes() {
  return [
    makeShapeFromConfig({
      template: "circle",
      style: "blue",
      x: 974.2729999999999,
      y: -255.529,
      angle: 0,
      stemOffset: 0,
      stemSeedAngle: 179.281753334295,
      curveOffset: 0,
      curveStartOffset: 0,
      curveEndOffset: 0,
      curveStartPull: 0,
      curveEndPull: 0,
      lastLollipopTemplate: "lollipop-short-right"
    }),
    makeShapeFromConfig({
      template: "curved-double-stem",
      style: "red",
      x: 2450.0430566520904,
      y: 1902.6105140536495,
      angle: 260.9452107871319,
      stemOffset: 374.4354062135442,
      stemSeedAngle: -99.0547892128681,
      curveOffset: -900,
      curveStartOffset: -1200,
      curveEndOffset: -1200,
      curveStartPull: 49.3472,
      curveEndPull: 49.3472,
      lastLollipopTemplate: null
    }),
    makeShapeFromConfig({
      template: "circle",
      style: "green",
      x: 1224.273,
      y: 1344.471,
      angle: 0,
      stemOffset: 0,
      stemSeedAngle: 0,
      curveOffset: -260,
      curveStartOffset: -260,
      curveEndOffset: -260,
      curveStartPull: 0,
      curveEndPull: 0,
      lastLollipopTemplate: null
    }),
    makeShapeFromConfig({
      template: "circle",
      style: "yellow",
      x: 674.2729999999999,
      y: 644.471,
      angle: 0,
      stemOffset: 0,
      stemSeedAngle: 0,
      curveOffset: 0,
      curveStartOffset: 0,
      curveEndOffset: 0,
      curveStartPull: 0,
      curveEndPull: 0,
      lastLollipopTemplate: null
    }),
    makeShapeFromConfig({
      template: "curved-double-stem",
      style: "purple",
      x: 2837.4236267112833,
      y: 2096.951893492418,
      angle: 236.50552438989587,
      stemOffset: -135.27742410151876,
      stemSeedAngle: 235.1721910565625,
      curveOffset: 456.66666666666663,
      curveStartOffset: 326.6666666666667,
      curveEndOffset: 586.6666666666666,
      curveStartPull: 250,
      curveEndPull: 250,
      lastLollipopTemplate: null
    })
  ];
}

function defaultZShapes() {
  return [
    makeShapeFromConfig({
      template: "lollipop-short-left",
      style: "green",
      x: 397.895,
      y: 254.175,
      angle: 325.4569269931119,
      stemOffset: 506.6925041639033,
      stemSeedAngle: 0,
      curveOffset: 0,
      lastLollipopTemplate: "lollipop-short-left"
    }),
    makeShapeFromConfig({
      template: "lollipop-short-right",
      style: "blue",
      x: 1055.226,
      y: -230.65300000000002,
      angle: 164.8304421550057,
      stemOffset: 292.22824103394385,
      stemSeedAngle: 0,
      curveOffset: 0,
      lastLollipopTemplate: "lollipop-short-right"
    }),
    makeShapeFromConfig({
      template: "circle",
      style: "yellow",
      x: -275.7270000000001,
      y: 144.471,
      angle: 0,
      stemOffset: 0,
      stemSeedAngle: 115.75711484172518,
      curveOffset: 0,
      lastLollipopTemplate: "lollipop-short-right"
    }),
    makeShapeFromConfig({
      template: "lollipop-short-left",
      style: "purple",
      x: 397.895,
      y: 1974.175,
      angle: 274.1167352472021,
      stemOffset: 235.22362452748757,
      stemSeedAngle: -51.334161957279264,
      curveOffset: 0,
      lastLollipopTemplate: "lollipop-short-left"
    }),
    makeShapeFromConfig({
      template: "lollipop-long",
      style: "red",
      x: 404.09899999999993,
      y: 1974.465,
      angle: 89.94213419201606,
      stemOffset: 378.48526673033507,
      stemSeedAngle: 178.57204369995193,
      curveOffset: 0,
      lastLollipopTemplate: "lollipop-long"
    })
  ];
}

function makeShapeFromConfig(config) {
  const shape = makeShape(
    config.template,
    config.style,
    config.x,
    config.y,
    config.angle
  );
  shape.stemOffset = normalizeStemOffset(config.stemOffset, config.template);
  shape.stemSeedAngle = Number.isFinite(config.stemSeedAngle) ? config.stemSeedAngle : 0;
  shape.curveOffset = normalizeCurveOffset(config.curveOffset, config.template);
  shape.curveStartOffset = normalizeCurveEndpointOffset(config.curveStartOffset, shape.curveOffset);
  shape.curveEndOffset = normalizeCurveEndpointOffset(config.curveEndOffset, shape.curveOffset);
  shape.curveStartPull = normalizeCurvePull(config.curveStartPull, config.template, shape.stemOffset);
  shape.curveEndPull = normalizeCurvePull(config.curveEndPull, config.template, shape.stemOffset);
  shape.lastLollipopTemplate = config.lastLollipopTemplate;
  return shape;
}

function explicitSeedSegment(start, end, style, stemOffset = null) {
  const shape = seedSegmentShape(start, end, style);
  if (Number.isFinite(stemOffset)) {
    shape.stemOffset = snapStem(stemOffset, shape.template);
  }
  return shape;
}

function seedAlphabetVariants() {
  const plans = seedLetterPlans();
  return LETTERS.reduce((acc, letter) => {
    const [first, second] = plans[letter] || [[], []];
    acc[letter] = [
      buildSeedVariant(first, { colorOffset: LETTERS.indexOf(letter) }),
      buildSeedVariant(second, {
        colorOffset: LETTERS.indexOf(letter) + 2,
        baseX: 720,
        baseY: 580,
        width: second.some((segment) => segment.includes("QT")) ? 1250 : 1360,
        height: 1720
      })
    ];
    return acc;
  }, {});
}

function seedLetterPlans() {
  return {
    A: [["L4->C0", "R4->C0", "L2->R2"], ["L4->C0", "R4->C0", "C2->R2"]],
    B: [["L0->L2", "L2->L4", "R1->L0", "R2->L2", "R3->L4"], ["L0->L4", "R0->L0", "L2->R2", "R2->L2", "R4->L4"]],
    C: [["R0->C0", "C0->L1", "L1->L3", "L3->C4", "C4->R4"], ["R1->C0", "C0->L0", "L0->L3", "L3->C4", "C4->R3"]],
    D: [["L0->L4", "R1->L0", "R2->R1", "R3->L4"], ["L0->L4", "R0->L0", "R2->R0", "R3->R2", "R4->L4"]],
    E: [["L0->L4", "R0->L0", "R2->L2", "R4->L4"], ["L0->L4", "L1->R1", "L2->R2", "L4->R4"]],
    F: [["L0->L4", "R0->L0", "R2->L2"], ["L0->L4", "L1->R1", "L2->R2"]],
    G: [["R0->C0", "C0->L1", "L1->L3", "L3->C4", "C4->R4", "R3->C3", "C3->R2"], ["R1->C0", "C0->L1", "L1->L3", "L3->C4", "C4->R3", "R3->R2", "R2->C2"]],
    H: [["L0->L4", "R0->R4", "L2->R2"], ["L0->L4", "R0->R4", "C2->R2"]],
    I: [["L0->R0", "C0->C4", "L4->R4"], ["L0->C0", "R0->C0", "C0->C4", "L4->C4", "R4->C4"]],
    J: [["L0->R0", "R0->R3", "R3->C4", "C4->L3"], ["C0->R0", "R0->R3", "R3->C4", "C4->L4"]],
    K: [["L0->L4", "R0->L2", "L2->R4"], ["L0->L4", "R1->L2", "L2->R3"]],
    L: [["L0->L4", "L4->R4"], ["L0->L4", "L4->C4", "C4->R4"]],
    M: [[], []],
    N: [["L4->L0", "L0->R4", "R4->R0"], ["L0->L4", "C1->R4", "R4->R0"]],
    O: [["C0->R1", "R1->R3", "R3->C4", "C4->L3", "L3->L1", "L1->C0"], ["C0->R1", "R1->R3", "R3->C4", "C4->L3", "L3->L1", "L1->C0"]],
    P: [["L0->L4", "R0->L0", "R1->R0", "R2->L2"], ["L0->L4", "R0->L0", "R1->R2", "R2->L2"]],
    Q: [["C0->R1", "R1->R3", "R3->C4", "C4->L3", "L3->L1", "L1->C0", "QT->R3"], ["C0->R1", "R1->R3", "R3->C4", "C4->L3", "L3->L1", "L1->C0", "QT->C4"]],
    R: [["L0->L4", "R0->L0", "R1->R0", "R2->L2", "L2->R4"], ["L0->L4", "R0->L0", "R1->R2", "R2->L2", "L2->R4"]],
    S: [["R0->C0", "C0->L1", "L1->C2", "C2->R3", "R3->C4", "C4->L4"], ["R1->C0", "C0->L0", "L1->L2", "L2->R2", "R2->R3", "R3->C4", "C4->L4"]],
    T: [["L0->R0", "C0->C4"], ["L0->C0", "R0->C0", "C0->C4"]],
    U: [["L0->L3", "L3->C4", "C4->R3", "R3->R0"], ["L0->L2", "L2->C4", "C4->R2", "R2->R0"]],
    V: [["L0->C4", "R0->C4"], ["L1->C4", "R1->C4"]],
    W: [[], []],
    X: [["L0->C2", "R0->C2", "L4->C2", "R4->C2"], ["L1->C2", "R1->C2", "L3->C2", "R3->C2"]],
    Y: [["L0->C2", "R0->C2", "C2->C4"], ["L1->C2", "R1->C2", "C2->C4"]],
    Z: [["L0->R0", "R0->L4", "L4->R4"], ["L0->R0", "R0->C2", "C2->L4", "L4->R4"]]
  };
}

function buildSeedVariant(plan, options = {}) {
  const points = seedPoints(options);
  const shapes = [];
  const startKeys = new Set();
  const endKeys = new Set();
  const styleIds = styles.map((style) => style.id);
  let colorIndex = options.colorOffset || 0;

  plan.forEach((segment) => {
    const [startKey, endKey] = segment.split("->");
    const start = points[startKey];
    const end = points[endKey];
    if (!start || !end) {
      throw new Error(`Unknown seed segment endpoint: ${segment}`);
    }
    startKeys.add(startKey);
    endKeys.add(endKey);
    shapes.push(seedSegmentShape(start, end, styleIds[colorIndex % styleIds.length]));
    colorIndex += 1;
  });

  endKeys.forEach((key) => {
    if (!startKeys.has(key)) {
      shapes.push(seedCircleShape(points[key], styleIds[colorIndex % styleIds.length]));
      colorIndex += 1;
    }
  });

  validateSeedVariant(shapes);
  return shapes;
}

function seedPoints(options = {}) {
  const baseX = options.baseX ?? 650;
  const baseY = options.baseY ?? 540;
  const width = options.width ?? 1500;
  const height = options.height ?? 1800;
  const xs = { L: 0, C: 0.5, R: 1 };
  const ys = { 0: 0, 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 };
  const points = {};
  Object.entries(xs).forEach(([xKey, xNorm]) => {
    Object.entries(ys).forEach(([yKey, yNorm]) => {
      points[`${xKey}${yKey}`] = {
        x: baseX + xNorm * width,
        y: baseY + yNorm * height
      };
    });
  });
  points.QT = {
    x: baseX + 1.15 * width,
    y: baseY + 1.15 * height
  };
  return points;
}

function seedSegmentShape(start, end, style) {
  const templateId = templateForSeedSegment(start, end);
  const template = templates[templateId];
  const axisAngle = pointAngle(start, end);
  const shape = makeShape(
    templateId,
    style,
    start.x - template.anchor.x,
    start.y - template.anchor.y,
    normalizeAngle(axisAngle - localStemAxisAngle(template))
  );
  const desiredTailDistance = Math.max(
    stemHandleDistanceForOffset(template, stemCollapseOffsetForTemplate(template)) - STEM_HANDLE_OFFSET,
    distance(start, end) - originalStemDisplacement()
  );
  const stemOffset = desiredTailDistance - distance(template.anchor, template.geometry.tailArcCenter);
  shape.stemOffset = snapStem(stemOffset, templateId);
  return shape;
}

function templateForSeedSegment(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < Math.abs(dy) * 0.35) {
    return dy >= 0 ? "lollipop-long" : "lollipop-long-alt";
  }
  if (dy >= 0) {
    return dx >= 0 ? "lollipop-short-left" : "lollipop-short-right";
  }
  return dx >= 0 ? "lollipop-short-right" : "lollipop-short-left";
}

function seedCircleShape(point, style) {
  const template = templates.circle;
  return makeShape(
    "circle",
    style,
    point.x - template.anchor.x,
    point.y - template.anchor.y,
    0
  );
}

function validateSeedVariant(shapes) {
  const seen = new Set();
  shapes.forEach((shape) => {
    const anchor = shapeAnchor(shape);
    const key = `${Math.round(anchor.x)}:${Math.round(anchor.y)}`;
    if (seen.has(key)) {
      throw new Error(`Seed variant has duplicate head centroid at ${key}.`);
    }
    seen.add(key);
  });
}

function rotateShapes(shapes, angle, options = {}) {
  const bounds = letterBounds(shapes);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
  return shapes.map((shape) => {
    const anchor = shapeAnchor(shape);
    const rotated = rotatePointAround(anchor, center, angle);
    const template = templates[shape.template];
    const styleIndex = styles.findIndex((style) => style.id === shape.style);
    return {
      ...shape,
      id: makeId(),
      style: styles[(styleIndex + (options.colorOffset || 0) + styles.length) % styles.length].id,
      x: rotated.x + (options.x || 0) - template.anchor.x,
      y: rotated.y + (options.y || 0) - template.anchor.y,
      angle: normalizeAngle(shape.angle + angle)
    };
  });
}

function rotatePointAround(point, center, angle) {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

function restoreState() {
  const saved = localStorage.getItem(STORAGE_KEY)
    || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  if (!saved) {
    state.letters = defaultLetters();
    return;
  }

  const parsed = JSON.parse(saved);
  if (!parsed || typeof parsed !== "object" || !parsed.letters) {
    throw new Error("Saved MotRPAC alphabet state is not a valid object.");
  }

  state.letters = makeEmptyLetters();
  LETTERS.forEach((letter) => {
    state.letters[letter] = normalizeLetterState(parsed.letters[letter]);
  });
  if (LETTERS.includes(parsed.activeLetter)) {
    state.activeLetter = parsed.activeLetter;
  }
  if (Number.isFinite(parsed.gridSize)) {
    state.gridSize = parsed.gridSize;
  }
  if (Number.isFinite(parsed.angleStep)) {
    state.angleStep = parsed.angleStep;
  }
  if (Number.isFinite(parsed.polishIterations)) {
    state.polishIterations = clamp(Math.floor(parsed.polishIterations), 1, 50);
  }
  if (Number.isFinite(parsed.polishStage)) {
    state.polishStage = clamp(Math.floor(parsed.polishStage), 1, 2);
  }
}

function normalizeLetterState(rawLetter) {
  if (Array.isArray(rawLetter)) {
    return makeLetterState(normalizeShapes(rawLetter));
  }

  if (rawLetter && typeof rawLetter === "object" && Array.isArray(rawLetter.variants)) {
    const variants = rawLetter.variants.map(normalizeShapes);
    if (variants.length === 0) {
      variants.push([]);
    }
    return {
      activeVariant: clamp(Math.floor(Number(rawLetter.activeVariant) || 0), 0, variants.length - 1),
      variants
    };
  }

  return makeLetterState();
}

function normalizeShapes(shapes) {
  return (Array.isArray(shapes) ? shapes : [])
    .filter((shape) => templates[shape.template])
    .map((shape) => ({
      id: shape.id || makeId(),
      template: shape.template,
      style: normalizeStyleId(shape.style),
      x: Number(shape.x) || 0,
      y: Number(shape.y) || 0,
      angle: normalizeAngle(Number(shape.angle) || 0),
      stemOffset: normalizeStemOffset(shape.stemOffset, shape.template),
      stemSeedAngle: Number.isFinite(Number(shape.stemSeedAngle))
        ? normalizeAngle(Number(shape.stemSeedAngle))
        : null,
      curveOffset: normalizeCurveOffset(shape.curveOffset, shape.template),
      curveStartOffset: normalizeCurveEndpointOffset(shape.curveStartOffset, normalizeCurveOffset(shape.curveOffset, shape.template)),
      curveEndOffset: normalizeCurveEndpointOffset(shape.curveEndOffset, normalizeCurveOffset(shape.curveOffset, shape.template)),
      curveStartPull: normalizeCurvePull(shape.curveStartPull, shape.template, shape.stemOffset),
      curveEndPull: normalizeCurvePull(shape.curveEndPull, shape.template, shape.stemOffset),
      lastLollipopTemplate: isLollipopTemplate(shape.lastLollipopTemplate)
        ? shape.lastLollipopTemplate
        : null
    }));
}

function initControls() {
  els.undoAction.addEventListener("click", undoHistory);
  els.redoAction.addEventListener("click", redoHistory);
  els.resetApp.addEventListener("click", resetAppState);
  els.historyJump.addEventListener("change", () => jumpToHistory(Number(els.historyJump.value)));
  els.globalVariantButtons.forEach((button) => {
    button.addEventListener("click", () => switchAllLettersToVariant(Number(button.dataset.globalVariant)));
  });
  els.alignButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const axis = button.dataset.alignAxis;
      const mode = button.dataset.alignMode;
      if (!["x", "y"].includes(axis) || !["min", "mean", "max"].includes(mode)) {
        return;
      }
      alignSelectedShapes(axis, mode);
    });
  });
  els.distributeX.addEventListener("click", () => distributeSelectedShapes("x"));
  els.distributeY.addEventListener("click", () => distributeSelectedShapes("y"));

  styles.forEach((style) => {
    const option = document.createElement("option");
    option.value = style.id;
    option.textContent = style.label;
    els.shapeStyle.appendChild(option);

    const swatch = document.createElement("button");
    swatch.className = "swatch";
    swatch.type = "button";
    swatch.title = style.label;
    swatch.dataset.style = style.id;
    if (style.preview === "texture") {
      swatch.style.backgroundImage = "url(assets/motrpac-M.png)";
      swatch.style.backgroundSize = "72px 58px";
    } else {
      swatch.style.background = style.preview;
    }
    swatch.addEventListener("click", () => setSelectedStyle(style.id));
    els.styleSwatches.appendChild(swatch);
  });

  els.shapeTemplate.addEventListener("change", () => setSelectedTemplate(els.shapeTemplate.value));
  els.shapeStyle.addEventListener("change", () => setSelectedStyle(els.shapeStyle.value));
  els.letterVariant.addEventListener("change", () => switchVariant(Number(els.letterVariant.value)));
  els.shapeX.addEventListener("change", () => setSelectedAnchor("x", Number(els.shapeX.value)));
  els.shapeY.addEventListener("change", () => setSelectedAnchor("y", Number(els.shapeY.value)));
  els.shapeAngle.addEventListener("change", () => setSelectedAngle(Number(els.shapeAngle.value)));
  els.shapeStem.addEventListener("change", () => setSelectedStem(Number(els.shapeStem.value)));
  els.polishIterations.addEventListener("change", () => {
    state.polishIterations = clamp(Math.floor(Number(els.polishIterations.value) || 1), 1, 50);
    els.polishIterations.value = String(state.polishIterations);
    saveState();
  });
  els.polishStageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.polishStage = clamp(Math.floor(Number(button.dataset.polishStage) || 1), 1, 2);
      renderPolishStageControls();
      saveState("Polish stage");
    });
  });
  els.gridSize.addEventListener("change", () => {
    state.gridSize = Number(els.gridSize.value);
    renderGrid();
    saveState();
  });
  els.angleStep.addEventListener("change", () => {
    state.angleStep = Number(els.angleStep.value);
    saveState();
  });

  document.getElementById("add-shape").addEventListener("click", () => {
    addShapeAt(ARTBOARD.width / 2, ARTBOARD.height / 2);
  });
  document.getElementById("duplicate-side").addEventListener("click", duplicateSelected);
  document.getElementById("delete-side").addEventListener("click", deleteSelected);
  els.copyShapes.addEventListener("click", copySelectedShapes);
  els.pasteShapes.addEventListener("click", pasteShapesFromClipboard);
  document.getElementById("duplicate-selected").addEventListener("click", duplicateSelected);
  document.getElementById("delete-selected").addEventListener("click", deleteSelected);
  document.getElementById("clear-letter").addEventListener("click", clearActiveLetter);
  document.getElementById("add-variant").addEventListener("click", addVariant);
  document.getElementById("duplicate-variant").addEventListener("click", duplicateVariant);
  document.getElementById("delete-variant").addEventListener("click", deleteVariant);
  document.getElementById("polish-lengths").addEventListener("click", () => polishDesign("lengths"));
  document.getElementById("polish-positions").addEventListener("click", () => polishDesign("positions"));
  document.getElementById("polish-angles").addEventListener("click", () => polishDesign("angles"));
  document.getElementById("polish-curve").addEventListener("click", () => polishDesign("curve"));
  document.getElementById("polish-size").addEventListener("click", () => polishDesign("size"));
  document.getElementById("polish-colors").addEventListener("click", () => polishDesign("colors"));
  document.getElementById("polish-all").addEventListener("click", () => polishDesign("all"));
  document.getElementById("reset-view").addEventListener("click", resetView);
  document.getElementById("export-json").addEventListener("click", exportJson);
  document.getElementById("export-current-svg").addEventListener("click", () => exportSvg(state.activeLetter));
  document.getElementById("export-all-svg").addEventListener("click", exportAllSvg);
  initFontExport();
  document.getElementById("import-json").addEventListener("click", () => {
    document.getElementById("import-json-file").click();
  });
  els.headerExportJson.addEventListener("click", exportJson);
  els.headerImportJson.addEventListener("click", () => {
    document.getElementById("import-json-file").click();
  });
  els.copyCurrentJson.addEventListener("click", copyCurrentLetterVariantJson);
  document.getElementById("import-json-file").addEventListener("change", importJson);
  document.querySelectorAll("[data-add-shape]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTemplate = button.dataset.addShape;
      addShapeAt(ARTBOARD.width / 2, ARTBOARD.height / 2);
    });
  });

  els.stage.addEventListener("pointerdown", onPointerDown);
  els.stage.addEventListener("pointermove", onPointerMove);
  els.stage.addEventListener("pointerup", onPointerUp);
  els.stage.addEventListener("pointercancel", cancelDrag);
  els.stage.addEventListener("pointerleave", clearHover);
  els.stage.addEventListener("dblclick", onDoubleClick);
  els.stage.addEventListener("wheel", onWheel, { passive: false });
  initMenus();
  window.addEventListener("keydown", onKeyDown);
}

function initMenus() {
  const menus = [...document.querySelectorAll(".menu")];
  menus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) {
        return;
      }
      menus.forEach((other) => {
        if (other !== menu) {
          other.open = false;
        }
      });
    });
    menu.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", closeMenus);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".menu")) {
      closeMenus();
    }
  });
}

function closeMenus() {
  document.querySelectorAll(".menu[open]").forEach((menu) => {
    menu.open = false;
  });
}

function initLetters() {
  LETTERS.forEach((letter) => {
    const card = document.createElement("div");
    card.className = "letter-card";
    card.dataset.letter = letter;
    card.innerHTML = `
      <div class="letter-card-top">
        <button class="letter-label-button" type="button">${letter}</button>
        <div class="variant-pills" aria-label="${letter} variants"></div>
      </div>
      <button class="letter-preview-button" type="button" aria-label="Open ${letter}">
        <svg class="letter-preview" aria-hidden="true"></svg>
      </button>
    `;
    card.querySelector(".letter-label-button").addEventListener("click", () => switchLetter(letter));
    card.querySelector(".letter-preview-button").addEventListener("click", () => switchLetter(letter));
    els.letterStrip.appendChild(card);
  });
}

function currentShapes() {
  return letterShapes(state.activeLetter);
}

function letterState(letter) {
  return state.letters[letter];
}

function letterShapes(letter) {
  const entry = letterState(letter);
  return entry.variants[entry.activeVariant];
}

function letterVariantCount(letter) {
  return letterState(letter).variants.length;
}

function activeVariantIndex(letter = state.activeLetter) {
  return letterState(letter).activeVariant;
}

function ensureVariant(letter, index) {
  const entry = letterState(letter);
  while (entry.variants.length <= index) {
    entry.variants.push([]);
  }
}

function onVariantDragStart(event) {
  const letter = event.currentTarget.dataset.letter;
  const variantIndex = Number(event.currentTarget.dataset.variantIndex);
  ensureVariant(letter, variantIndex);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify({ letter, variantIndex }));
}

function onVariantDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function onVariantDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const targetLetter = event.currentTarget.dataset.letter;
  const targetIndex = Number(event.currentTarget.dataset.variantIndex);
  const payload = JSON.parse(event.dataTransfer.getData("application/json") || "{}");
  if (payload.letter !== targetLetter || !Number.isFinite(payload.variantIndex)) {
    return;
  }
  reorderVariant(targetLetter, payload.variantIndex, targetIndex);
}

function reorderVariant(letter, fromIndex, toIndex) {
  const entry = letterState(letter);
  ensureVariant(letter, Math.max(fromIndex, toIndex));
  if (fromIndex === toIndex) {
    switchLetter(letter, toIndex);
    return;
  }

  const activeVariant = entry.variants[entry.activeVariant];
  const moved = entry.variants.splice(fromIndex, 1)[0];
  entry.variants.splice(toIndex, 0, moved);
  entry.activeVariant = entry.variants.indexOf(activeVariant);
  if (entry.activeVariant < 0) {
    entry.activeVariant = toIndex;
  }
  state.activeLetter = letter;
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function makeShape(template, style, x, y, angle = 0) {
  return {
    id: makeId(),
    template,
    style,
    x,
    y,
    angle: normalizeAngle(angle),
    stemOffset: 0,
    stemSeedAngle: null,
    curveOffset: templates[template]?.geometry?.defaultCurveOffset || 0,
    curveStartOffset: templates[template]?.geometry?.defaultCurveOffset || 0,
    curveEndOffset: templates[template]?.geometry?.defaultCurveOffset || 0,
    curveStartPull: curveDefaultPull(template, 0),
    curveEndPull: curveDefaultPull(template, 0),
    lastLollipopTemplate: isLollipopTemplate(template) ? template : null
  };
}

function makeId() {
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderAll() {
  renderAlignmentGuides();
  renderShapes();
  renderHandles();
  renderLetters();
  renderInspector();
  renderGlobalVariantControls();
  renderLayoutControls();
  renderHistoryControls();
}

function renderAlignmentGuides() {
  els.guideLayer.replaceChildren();
  const canvas = els.guideOverlay;
  const context = canvas.getContext("2d");
  const width = els.stage.clientWidth;
  const height = els.stage.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = "800 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  state.alignmentGuides.forEach((guide) => {
    guideLabelPoints(guide).forEach((point) => {
      const screenPoint = svgWorldToOverlayPoint(point);
      context.save();
      context.translate(screenPoint.x, screenPoint.y);
      context.rotate(uprightGuideLabelAngle(guideScreenAngle(guide)) * Math.PI / 180);
      context.fillStyle = guide.color || "#cf1e32";
      context.fillText(`${Math.round(guide.displayAngle ?? polarLineDisplayAngle(guide.angle))}°`, 0, 0);
      context.restore();
    });
  });
}

function svgWorldToOverlayPoint(point) {
  const svgPoint = els.stage.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const screenPoint = svgPoint.matrixTransform(els.stage.getScreenCTM());
  const overlayBox = els.guideOverlay.getBoundingClientRect();
  return {
    x: screenPoint.x - overlayBox.left,
    y: screenPoint.y - overlayBox.top
  };
}

function guideScreenAngle(guide) {
  const unit = angleUnit(guide.angle);
  const start = svgWorldToOverlayPoint(guide.origin);
  const end = svgWorldToOverlayPoint(addVector(guide.origin, unit, 100));
  return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
}

function uprightGuideLabelAngle(angle) {
  const normalized = normalizeAngle(angle);
  return normalized > 90 && normalized <= 270
    ? normalizeAngle(normalized + 180)
    : normalized;
}

function polarDirectionalDisplayAngle(screenAngle) {
  return normalizeAngle(-screenAngle);
}

function polarLineDisplayAngle(screenAngle) {
  const angle = polarDirectionalDisplayAngle(screenAngle);
  return angle > 180 ? angle - 180 : angle;
}

function guideLabelPoints(guide) {
  const unit = angleUnit(guide.angle);
  const spacing = alignmentGuideLabelSpacing();
  const center = {
    x: state.view.x + state.view.width / 2,
    y: state.view.y + state.view.height / 2
  };
  const corners = [
    { x: state.view.x, y: state.view.y },
    { x: state.view.x + state.view.width, y: state.view.y },
    { x: state.view.x + state.view.width, y: state.view.y + state.view.height },
    { x: state.view.x, y: state.view.y + state.view.height }
  ];
  const guideOriginProjection = dot(guide.origin, unit);
  const centerProjection = dot(center, unit) - guideOriginProjection;
  const projections = corners.map((corner) => dot(corner, unit) - guideOriginProjection);
  const minProjection = Math.min(...projections) - spacing;
  const maxProjection = Math.max(...projections) + spacing;
  const firstProjection = Math.ceil((minProjection - centerProjection) / spacing) * spacing + centerProjection;
  const points = [];
  for (let projection = firstProjection; projection <= maxProjection; projection += spacing) {
    points.push(addVector(guide.origin, unit, projection));
  }
  return points;
}

function alignmentGuideLabelSpacing() {
  return ALIGNMENT_GUIDE_LABEL_SCREEN_SPACING * svgUserUnitsPerScreenPixel();
}

function svgUserUnitsPerScreenPixel() {
  const matrix = els.stage.getScreenCTM();
  if (!matrix) {
    return 1;
  }
  const scale = Math.hypot(matrix.a, matrix.b);
  return scale > 0 ? 1 / scale : 1;
}

function alignmentGuidesForMovingShapes(movingIds) {
  const movingSet = new Set(movingIds);
  const shapes = currentShapes();
  const moving = shapes.filter((shape) => movingSet.has(shape.id));
  const stationary = shapes.filter((shape) => !movingSet.has(shape.id));
  const guides = [];
  const seen = new Set();

  moving.forEach((movingShape) => {
    const movingAnchor = shapeAnchor(movingShape);
    stationary.forEach((stationaryShape) => {
      const stationaryAnchor = shapeAnchor(stationaryShape);
      const separation = distance(movingAnchor, stationaryAnchor);
      if (separation < ALIGNMENT_GUIDE_MIN_DISTANCE) {
        return;
      }

      const actualAngle = pointAngle(stationaryAnchor, movingAnchor);
      const guideAngle = nearestAlignmentGuideAngle(actualAngle);
      const unit = angleUnit(guideAngle);
      const delta = {
        x: movingAnchor.x - stationaryAnchor.x,
        y: movingAnchor.y - stationaryAnchor.y
      };
      const perpendicularDistance = Math.abs(delta.x * unit.y - delta.y * unit.x);
      if (perpendicularDistance > ALIGNMENT_GUIDE_THRESHOLD) {
        return;
      }

      const key = [
        Math.round(stationaryAnchor.x),
        Math.round(stationaryAnchor.y),
        guideAngle
      ].join(":");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      guides.push(guideLineThroughPoint(
        stationaryAnchor,
        actualAngle,
        guideColorForShape(stationaryShape),
        polarLineDisplayAngle(actualAngle)
      ));
    });
  });

  return guides.slice(0, 12);
}

function alignmentGuidesForStemShape(shape) {
  if (!shape) {
    return [];
  }

  const anchor = shapeAnchor(shape);
  const axisAngle = stemAxisAngleForShape(shape);
  const guideAngle = nearestDirectionalAlignmentGuideAngle(axisAngle);
  const guides = [];
  if (Math.abs(shortestAngleDelta(axisAngle, guideAngle)) <= ALIGNMENT_GUIDE_STEM_ANGLE_THRESHOLD) {
    guides.push(guideLineThroughPoint(
      anchor,
      guideAngle,
      guideColorForShape(shape),
      polarDirectionalDisplayAngle(guideAngle)
    ));
  }

  const unit = angleUnit(axisAngle);
  const seen = new Set();

  currentShapes().forEach((target) => {
    if (target.id === shape.id) {
      return;
    }
    const targetAnchor = shapeAnchor(target);
    const separation = distance(anchor, targetAnchor);
    if (separation < ALIGNMENT_GUIDE_MIN_DISTANCE) {
      return;
    }
    const delta = {
      x: targetAnchor.x - anchor.x,
      y: targetAnchor.y - anchor.y
    };
    const projection = dot(delta, unit);
    if (projection <= 0) {
      return;
    }

    const perpendicularDistance = Math.abs(delta.x * unit.y - delta.y * unit.x);
    if (perpendicularDistance > ALIGNMENT_GUIDE_THRESHOLD) {
      return;
    }

    const key = `${Math.round(targetAnchor.x)}:${Math.round(targetAnchor.y)}:${Math.round(axisAngle)}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    guides.push(guideLineThroughPoint(
      targetAnchor,
      axisAngle,
      guideColorForShape(target),
      polarDirectionalDisplayAngle(axisAngle)
    ));
  });

  return guides.slice(0, 8);
}

function guideColorForShape(shape) {
  return styleById(shape?.style)?.fill || "#cf1e32";
}

function nearestAlignmentGuideAngle(angle) {
  const lineAngle = ((angle % 180) + 180) % 180;
  const snapped = Math.round(lineAngle / ALIGNMENT_GUIDE_STEP) * ALIGNMENT_GUIDE_STEP;
  return snapped === 180 ? 0 : snapped;
}

function nearestDirectionalAlignmentGuideAngle(angle) {
  return normalizeAngle(Math.round(angle / ALIGNMENT_GUIDE_STEP) * ALIGNMENT_GUIDE_STEP);
}

function angleUnit(angle) {
  const radians = angle * Math.PI / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function guideLineThroughPoint(point, angle, color, displayAngle = null) {
  const unit = angleUnit(angle);
  const length = Math.max(ARTBOARD.width, ARTBOARD.height, state.view.width, state.view.height) * 1.5;
  return {
    origin: point,
    angle,
    displayAngle,
    color,
    start: addVector(point, unit, -length),
    end: addVector(point, unit, length)
  };
}

function renderGlobalVariantControls() {
  const activeIndexes = new Set(LETTERS.map((letter) => letterState(letter).activeVariant));
  const commonIndex = activeIndexes.size === 1 ? [...activeIndexes][0] : null;
  els.globalVariantButtons.forEach((button) => {
    const isActive = Number(button.dataset.globalVariant) === commonIndex;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderLayoutControls() {
  const selectedCount = state.selectedIds.size;
  const canAlign = selectedCount >= 2;
  const canDistribute = selectedCount >= 3;
  els.distributeX.disabled = !canDistribute;
  els.distributeY.disabled = !canDistribute;
  els.alignButtons.forEach((button) => {
    button.disabled = !canAlign;
  });
}

function renderShapes() {
  els.shapeLayer.replaceChildren();
  currentShapes().forEach((shape) => {
    const template = templates[shape.template];
    const style = styleById(shape.style);
    const pathData = shapePath(shape);
    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add("shape");
    if (state.selectedIds.has(shape.id)) {
      group.classList.add("selected");
    }
    group.dataset.id = shape.id;
    group.setAttribute("transform", shapeTransform(shape));

    if (state.selectedIds.has(shape.id)) {
      const glowPath = document.createElementNS(SVG_NS, "path");
      glowPath.classList.add("selection-glow");
      glowPath.setAttribute("d", pathData);
      group.appendChild(glowPath);
    }

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", style.fill);
    group.appendChild(path);
    els.shapeLayer.appendChild(group);
  });
}

function renderHandles() {
  els.handleLayer.replaceChildren();
  const selected = selectedShapes();
  if (selected.length > 1) {
    return;
  }

  const hoverShape = state.hoveredId ? shapeById(state.hoveredId) : null;
  const hoverOnly = selected.length === 0;
  const shape = selected[0] || hoverShape;
  if (!shape) {
    return;
  }
  const template = templates[shape.template];
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("edit-handles");
  if (hoverOnly) {
    group.classList.add("hover-handles");
  }
  group.dataset.id = shape.id;
  group.setAttribute("transform", shapeTransform(shape));

  if (isLollipop(shape)) {
    const stemPoint = stemHandlePoint(shape);
    const stemBase = isCurvedLollipop(shape)
      ? curvedStemLocalCenter(shape, 1)
      : {
        x: stemPoint.x - template.geometry.axis.x * STEM_HANDLE_OFFSET,
        y: stemPoint.y - template.geometry.axis.y * STEM_HANDLE_OFFSET
      };
    group.appendChild(handleLine(stemBase, stemPoint, "stem-guide"));
    group.appendChild(handleRect(stemPoint, "stem-combo", "stem-combo-handle", worldStemAxisAngle(shape)));
    if (isCurvedLollipop(shape)) {
      appendCurvedShapeHandles(group, shape);
    }
  } else if (isCircle(shape)) {
    const arc = circleStemArcPath(shape);
    const arcCenter = circleStemArcCenter(shape);
    const seedPoint = circleStemSeedPoint(shape);
    const growAngle = circleStemGrowAngle(shape);
    group.appendChild(handlePath(arc, null, "circle-stem-arc", null));
    group.appendChild(handleLine(arcCenter, seedPoint, "stem-seed-guide"));
    group.appendChild(handleRect(seedPoint, "stem-combo", "stem-seed-handle stem-combo-handle", growAngle));
  } else if (isDoubleStem(shape)) {
    [-1, 1].forEach((endSign) => {
      const stemPoint = doubleStemHandlePoint(shape, endSign);
      const stemBase = isCurvedStem(shape)
        ? curvedStemLocalCenter(shape, endSign === 1 ? 1 : 0)
        : addVector(stemPoint, template.geometry.axis, -endSign * STEM_HANDLE_OFFSET);
      group.appendChild(handleLine(stemBase, stemPoint, "stem-guide"));
      const handle = handleRect(stemPoint, "stem-combo", "stem-combo-handle", doubleStemHandleAngle(shape, endSign));
      handle.dataset.endSign = String(endSign);
      group.appendChild(handle);
    });
    if (isCurvedStem(shape)) {
      appendCurvedShapeHandles(group, shape);
    }
  }

  els.handleLayer.appendChild(group);
}

function appendCurvedShapeHandles(group, shape) {
  group.appendChild(handleCurveRotateWidget(shape));
  ["outer", "inner"].forEach((pairSide) => {
    const frame = curvedStemPairHandleFrame(shape, pairSide);
    group.appendChild(handleLine(frame.guideStart, frame.origin, "stem-guide curve-pair-guide"));
    group.appendChild(handleCurvePairWidget(frame, pairSide));
  });
  [
    { curveSide: "start" },
    { curveSide: "end" }
  ].forEach(({ curveSide }) => {
    const controls = curvedStemControlPoints(shape);
    const bendPoint = curvedStemBendHandlePoint(shape, curveSide);
    const endpoint = curveSide === "start" ? controls.p0 : controls.p3;
    group.appendChild(handleLine(endpoint, bendPoint, "stem-guide curve-control-guide"));
    const handle = handleRect(bendPoint, "curve-bend", "stem-combo-handle", worldStemAxisAngle(shape) + 90);
    handle.dataset.curveSide = curveSide;
    group.appendChild(handle);
  });
}

function shapeTransform(shape) {
  const anchor = templates[shape.template].anchor;
  return `translate(${shape.x} ${shape.y}) rotate(${shape.angle} ${anchor.x} ${anchor.y})`;
}

function renderLetters() {
  els.activeLetterLabel.textContent = state.activeLetter;
  [...els.letterStrip.children].forEach((button) => {
    const letter = button.dataset.letter;
    const shapes = letterShapes(letter);
    button.classList.toggle("active", letter === state.activeLetter);
    button.classList.toggle("has-shapes", shapes.length > 0);
    button.dataset.count = shapes.length;
    renderVariantPills(letter, button.querySelector(".variant-pills"));
    renderLetterPreview(letter, button.querySelector(".letter-preview"));
  });
}

function renderVariantPills(letter, container) {
  container.replaceChildren();
  const entry = letterState(letter);
  const shown = 3;
  for (let index = 0; index < shown; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variant-pill";
    button.textContent = String(index + 1);
    button.draggable = true;
    button.dataset.letter = letter;
    button.dataset.variantIndex = String(index);
    button.classList.toggle("empty", index >= entry.variants.length);
    button.classList.toggle("active", index === entry.activeVariant);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      ensureVariant(letter, index);
      switchLetter(letter, index);
    });
    button.addEventListener("dragstart", onVariantDragStart);
    button.addEventListener("dragover", onVariantDragOver);
    button.addEventListener("drop", onVariantDrop);
    container.appendChild(button);
  }
}

function renderLetterPreview(letter, svg) {
  const shapes = letterShapes(letter);
  svg.replaceChildren();

  const bounds = letterBounds(shapes) || {
    x: 0,
    y: 0,
    width: ARTBOARD.width,
    height: ARTBOARD.height
  };
  svg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);

  const background = document.createElementNS(SVG_NS, "rect");
  background.classList.add("letter-preview-bg");
  background.setAttribute("x", bounds.x);
  background.setAttribute("y", bounds.y);
  background.setAttribute("width", bounds.width);
  background.setAttribute("height", bounds.height);
  svg.appendChild(background);

  if (shapes.length === 0) {
    const empty = document.createElementNS(SVG_NS, "rect");
    empty.classList.add("letter-preview-empty");
    empty.setAttribute("x", 180);
    empty.setAttribute("y", 145);
    empty.setAttribute("width", ARTBOARD.width - 360);
    empty.setAttribute("height", ARTBOARD.height - 290);
    empty.setAttribute("rx", 36);
    svg.appendChild(empty);
    return;
  }

  shapes.forEach((shape) => {
    const template = templates[shape.template];
    const style = styleById(shape.style);
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", shapeTransform(shape));

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shapePath(shape));
    path.setAttribute("fill", style.fill);
    path.setAttribute("stroke", "#17202a");
    path.setAttribute("stroke-width", "12");
    group.appendChild(path);
    svg.appendChild(group);
  });
}

function renderInspector() {
  const selected = selectedShapes();
  els.gridSize.value = String(state.gridSize);
  els.angleStep.value = String(state.angleStep);
  els.polishIterations.value = String(state.polishIterations);
  renderPolishStageControls();
  els.shapeTemplate.value = state.activeTemplate;
  els.shapeStyle.value = state.activeStyle;

  els.selectionCount.textContent = selected.length === 0
    ? "No shapes selected"
    : `${selected.length} shape${selected.length === 1 ? "" : "s"} selected`;

  renderVariantInspector();

  const disabled = selected.length === 0;
  [els.shapeX, els.shapeY, els.shapeAngle, els.shapeStem].forEach((input) => {
    input.disabled = disabled;
  });

  if (selected.length === 1) {
    const shape = selected[0];
    const anchor = shapeAnchor(shape);
    els.shapeTemplate.value = shape.template;
    els.shapeStyle.value = shape.style;
    els.shapeX.value = roundForInput(anchor.x);
    els.shapeY.value = roundForInput(anchor.y);
    els.shapeAngle.value = roundForInput(shape.angle);
    els.shapeStem.value = roundForInput(shape.stemOffset || 0);
    els.shapeStem.disabled = !isLengthEditable(shape);
    state.activeTemplate = shape.template;
    state.activeStyle = shape.style;
  } else if (selected.length > 1) {
    els.shapeX.value = "";
    els.shapeY.value = "";
    els.shapeAngle.value = "";
    els.shapeStem.value = "";
    els.shapeStem.disabled = true;
  } else {
    els.shapeX.value = "";
    els.shapeY.value = "";
    els.shapeAngle.value = "";
    els.shapeStem.value = "";
  }

  els.styleSwatches.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.style === state.activeStyle);
  });
}

function renderVariantInspector() {
  const entry = letterState(state.activeLetter);
  els.letterVariant.replaceChildren();
  entry.variants.forEach((variant, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `Variant ${index + 1}${variant.length > 0 ? ` (${variant.length})` : ""}`;
    els.letterVariant.appendChild(option);
  });
  els.letterVariant.value = String(entry.activeVariant);
}

function renderGrid() {
  els.gridLayer.replaceChildren();
  const step = state.gridSize;
  for (let x = 0; x <= ARTBOARD.width; x += step) {
    els.gridLayer.appendChild(gridLine(x, 0, x, ARTBOARD.height, x % (step * 4) === 0));
  }
  for (let y = 0; y <= ARTBOARD.height; y += step) {
    els.gridLayer.appendChild(gridLine(0, y, ARTBOARD.width, y, y % (step * 4) === 0));
  }
}

function renderPolishStageControls() {
  els.polishStageButtons.forEach((button) => {
    const isActive = Number(button.dataset.polishStage) === state.polishStage;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function gridLine(x1, y1, x2, y2, major) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.classList.add("grid-line");
  line.style.pointerEvents = "none";
  if (major) {
    line.classList.add("major");
  }
  return line;
}

function selectedShapes() {
  return currentShapes().filter((shape) => state.selectedIds.has(shape.id));
}

function shapeById(id) {
  return currentShapes().find((shape) => shape.id === id);
}

function styleById(id) {
  return styles.find((style) => style.id === id);
}

function normalizeStyleId(id) {
  if (id === "logo-texture" || id === "gold") {
    return "yellow";
  }
  return styleById(id) ? id : "purple";
}

function normalizeStemOffset(value, templateId = null) {
  const number = Number(value);
  const min = stemMinimumForTemplate(templateId);
  return Number.isFinite(number) ? clamp(number, min, STEM_MAX) : 0;
}

function normalizeCurveOffset(value, templateId = null) {
  const template = templates[templateId];
  const fallback = template?.geometry?.defaultCurveOffset || 0;
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, -900, 900) : fallback;
}

function normalizeCurveEndpointOffset(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, -1200, 1200) : fallback;
}

function curveDefaultPull(templateId, stemOffset = 0) {
  const geometry = templates[templateId]?.geometry;
  if (!geometry || !["curved-stem", "curved-lollipop"].includes(geometry.type)) {
    return 0;
  }
  const length = geometry.type === "curved-lollipop"
    ? curvedLollipopLengthForOffset({ template: templateId, stemOffset })
    : geometry.baseHalfLength + normalizeStemOffset(stemOffset, templateId);
  return Math.max(length * 0.62, geometry.radius * 0.8);
}

function normalizeCurvePull(value, templateId = null, stemOffset = 0) {
  const fallback = curveDefaultPull(templateId, stemOffset);
  const geometry = templates[templateId]?.geometry;
  if (!geometry || !["curved-stem", "curved-lollipop"].includes(geometry.type)) {
    return 0;
  }
  const number = Number(value);
  const min = geometry.radius * 0.2;
  const max = Math.max(fallback * 2.5, geometry.radius * 4);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

function isLollipop(shape) {
  return ["lollipop", "curved-lollipop"].includes(templates[shape.template].geometry.type);
}

function isCircle(shape) {
  return templates[shape.template].geometry.type === "circle";
}

function isDoubleStem(shape) {
  return ["stem", "curved-stem"].includes(templates[shape.template].geometry.type);
}

function isCurvedStem(shape) {
  return templates[shape.template].geometry.type === "curved-stem";
}

function isCurvedLollipop(shape) {
  return templates[shape.template].geometry.type === "curved-lollipop";
}

function isCurvedShape(shape) {
  return isCurvedStem(shape) || isCurvedLollipop(shape);
}

function isLollipopTemplate(templateId) {
  return ["lollipop", "curved-lollipop"].includes(templates[templateId]?.geometry.type);
}

function isLengthEditable(shape) {
  return isLollipop(shape) || isDoubleStem(shape);
}

function isStemPolishable(shape) {
  return isLollipop(shape) || isDoubleStem(shape);
}

function parseTemplateGeometry(template) {
  if (template.type === "curved-lollipop") {
    return {
      type: "curved-lollipop",
      radius: 246.736,
      halfWidth: 99.571,
      baseLength: 760,
      defaultCurveOffset: -220,
      axis: { x: 1, y: 0 },
      tailMid: { x: 760, y: 0 },
      tailArcCenter: { x: 760 + doubleStemArcCenterOffset({ geometry: { radius: 246.736, halfWidth: 99.571 } }), y: 0 }
    };
  }

  if (template.type === "curved-stem") {
    return {
      type: "curved-stem",
      radius: 246.736,
      halfWidth: 99.571,
      baseHalfLength: 420,
      defaultCurveOffset: -260,
      axis: { x: 1, y: 0 }
    };
  }

  if (template.type === "stem") {
    return {
      type: "stem",
      radius: 246.736,
      halfWidth: 99.571,
      baseHalfLength: 420,
      axis: { x: 1, y: 0 }
    };
  }

  if (template.path.includes(" L ")) {
    const nums = template.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const p1 = { x: nums[0], y: nums[1] };
    const radius = nums[2];
    const p2 = { x: nums[7], y: nums[8] };
    const p3 = { x: nums[9], y: nums[10] };
    const p4 = { x: nums[16], y: nums[17] };
    const tailMid = midpoint(p3, p4);
    const tailArcCenter = svgArcCenter(p3, p4, radius, 0, 0);
    const axis = normalizeVector({
      x: tailArcCenter.x - template.pivot.x,
      y: tailArcCenter.y - template.pivot.y
    });
    return {
      type: "lollipop",
      radius,
      p1,
      p2,
      p3,
      p4,
      tailMid,
      tailArcCenter,
      axis
    };
  }

  return {
    type: "circle",
    axis: { x: 0, y: -1 }
  };
}

function shapePath(shape) {
  const template = templates[shape.template];
  if (isDoubleStem(shape)) {
    return doubleStemPath(shape);
  }
  if (isCurvedLollipop(shape)) {
    return curvedLollipopPath(shape);
  }
  if (!isLollipop(shape)) {
    return template.path;
  }

  const geometry = template.geometry;
  const offset = normalizeStemOffset(shape.stemOffset, shape.template);
  const p3 = addVector(geometry.p3, geometry.axis, offset);
  const p4 = addVector(geometry.p4, geometry.axis, offset);
  return [
    `M ${formatNumber(geometry.p1.x)},${formatNumber(geometry.p1.y)}`,
    `A ${formatNumber(geometry.radius)},${formatNumber(geometry.radius)} 0 1 1 ${formatNumber(geometry.p2.x)},${formatNumber(geometry.p2.y)}`,
    `L ${formatNumber(p3.x)},${formatNumber(p3.y)}`,
    `A ${formatNumber(geometry.radius)},${formatNumber(geometry.radius)} 0 0 0 ${formatNumber(p4.x)},${formatNumber(p4.y)}`,
    "Z"
  ].join(" ");
}

function doubleStemPath(shape) {
  if (isCurvedStem(shape)) {
    return curvedDoubleStemPath(shape);
  }
  const geometry = templates[shape.template].geometry;
  const halfLength = doubleStemHalfLength(shape);
  const halfWidth = geometry.halfWidth;
  const radius = geometry.radius;
  return [
    `M ${formatNumber(-halfLength)},${formatNumber(-halfWidth)}`,
    `L ${formatNumber(halfLength)},${formatNumber(-halfWidth)}`,
    `A ${formatNumber(radius)},${formatNumber(radius)} 0 0 0 ${formatNumber(halfLength)},${formatNumber(halfWidth)}`,
    `L ${formatNumber(-halfLength)},${formatNumber(halfWidth)}`,
    `A ${formatNumber(radius)},${formatNumber(radius)} 0 0 0 ${formatNumber(-halfLength)},${formatNumber(-halfWidth)}`,
    "Z"
  ].join(" ");
}

function doubleStemHalfLength(shape) {
  return doubleStemHalfLengthForOffset(shape, shape.stemOffset);
}

function curvedDoubleStemPath(shape) {
  const geometry = templates[shape.template].geometry;
  const halfWidth = geometry.halfWidth;
  const radius = geometry.radius;
  const steps = 24;
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const center = curvedStemLocalCenter(shape, t);
    const normal = curvedStemLocalNormal(shape, t);
    left.push(addVector(center, normal, halfWidth));
    right.push(addVector(center, normal, -halfWidth));
  }
  const startArc = curvedStemLocalArcCenter(shape, -1);
  const endArc = curvedStemLocalArcCenter(shape, 1);
  const commands = [
    `M ${formatPoint(left[0])}`,
    ...left.slice(1).map((point) => `L ${formatPoint(point)}`),
    arcCommandMatchingCenter(left[left.length - 1], right[right.length - 1], radius, endArc),
    ...right.slice(0, -1).reverse().map((point) => `L ${formatPoint(point)}`),
    arcCommandMatchingCenter(right[0], left[0], radius, startArc),
    "Z"
  ];
  if (!Number.isFinite(startArc.x) || !Number.isFinite(endArc.x)) {
    throw new Error("Could not compute curved double-stem arc centers.");
  }
  return commands.join(" ");
}

function curvedLollipopPath(shape) {
  const geometry = templates[shape.template].geometry;
  const halfWidth = geometry.halfWidth;
  const radius = geometry.radius;
  const steps = 24;
  const left = [];
  const right = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const center = curvedStemLocalCenter(shape, t);
    const normal = curvedStemLocalNormal(shape, t);
    left.push(addVector(center, normal, halfWidth));
    right.push(addVector(center, normal, -halfWidth));
  }
  const startTangent = curvedStemLocalTangent(shape, 0);
  const startNormal = curvedStemLocalNormal(shape, 0);
  const headJoinOffset = doubleStemArcCenterOffset({ geometry });
  const headLeft = addVector(addVector(templates[shape.template].anchor, startTangent, headJoinOffset), startNormal, halfWidth);
  const headRight = addVector(addVector(templates[shape.template].anchor, startTangent, headJoinOffset), startNormal, -halfWidth);
  const endArc = curvedStemLocalArcCenter(shape, 1);
  return [
    `M ${formatPoint(headLeft)}`,
    ...left.slice(1).map((point) => `L ${formatPoint(point)}`),
    arcCommandMatchingCenter(left[left.length - 1], right[right.length - 1], radius, endArc),
    ...right.slice(0, -1).reverse().map((point) => `L ${formatPoint(point)}`),
    arcCommandMatchingCenterWithLargeArc(headRight, headLeft, radius, templates[shape.template].anchor, 1),
    "Z"
  ].join(" ");
}

function arcCommandMatchingCenter(start, end, radius, desiredCenter) {
  return arcCommandMatchingCenterWithLargeArc(start, end, radius, desiredCenter, 0);
}

function arcCommandMatchingCenterWithLargeArc(start, end, radius, desiredCenter, largeArcFlag) {
  const candidates = [0, 1].map((sweepFlag) => ({
    sweepFlag,
    center: svgArcCenter(start, end, radius, largeArcFlag, sweepFlag)
  }));
  candidates.sort((a, b) => distance(a.center, desiredCenter) - distance(b.center, desiredCenter));
  if (distance(candidates[0].center, desiredCenter) > 0.01) {
    throw new Error("Could not match SVG arc sweep to desired concave stem end.");
  }
  return `A ${formatNumber(radius)},${formatNumber(radius)} 0 ${largeArcFlag} ${candidates[0].sweepFlag} ${formatPoint(end)}`;
}

function formatPoint(point) {
  return `${formatNumber(point.x)},${formatNumber(point.y)}`;
}

function curvedStemLocalCenter(shape, t, offset = shape.stemOffset) {
  const controls = curvedStemControlPoints(shape, offset);
  const oneMinusT = 1 - t;
  return {
    x:
      oneMinusT * oneMinusT * oneMinusT * controls.p0.x
      + 3 * oneMinusT * oneMinusT * t * controls.p1.x
      + 3 * oneMinusT * t * t * controls.p2.x
      + t * t * t * controls.p3.x,
    y:
      oneMinusT * oneMinusT * oneMinusT * controls.p0.y
      + 3 * oneMinusT * oneMinusT * t * controls.p1.y
      + 3 * oneMinusT * t * t * controls.p2.y
      + t * t * t * controls.p3.y
  };
}

function curvedStemLocalTangent(shape, t, offset = shape.stemOffset) {
  const controls = curvedStemControlPoints(shape, offset);
  const oneMinusT = 1 - t;
  return normalizeVector({
    x:
      3 * oneMinusT * oneMinusT * (controls.p1.x - controls.p0.x)
      + 6 * oneMinusT * t * (controls.p2.x - controls.p1.x)
      + 3 * t * t * (controls.p3.x - controls.p2.x),
    y:
      3 * oneMinusT * oneMinusT * (controls.p1.y - controls.p0.y)
      + 6 * oneMinusT * t * (controls.p2.y - controls.p1.y)
      + 3 * t * t * (controls.p3.y - controls.p2.y)
  });
}

function curvedStemLocalSecondDerivative(shape, t, offset = shape.stemOffset) {
  const controls = curvedStemControlPoints(shape, offset);
  const oneMinusT = 1 - t;
  return {
    x:
      6 * oneMinusT * (controls.p2.x - 2 * controls.p1.x + controls.p0.x)
      + 6 * t * (controls.p3.x - 2 * controls.p2.x + controls.p1.x),
    y:
      6 * oneMinusT * (controls.p2.y - 2 * controls.p1.y + controls.p0.y)
      + 6 * t * (controls.p3.y - 2 * controls.p2.y + controls.p1.y)
  };
}

function curvedStemControlPoints(shape, offset = shape.stemOffset) {
  const startOffset = curvedStemStartOffset(shape);
  const endOffset = curvedStemEndOffset(shape);
  const startPull = curvedStemStartPull(shape);
  const endPull = curvedStemEndPull(shape);
  if (isCurvedLollipop(shape)) {
    const length = curvedLollipopLengthForOffset(shape, offset);
    return {
      p0: { x: 0, y: 0 },
      p1: { x: startPull, y: startOffset },
      p2: { x: length - endPull, y: endOffset },
      p3: { x: length, y: 0 }
    };
  }
  const halfLength = doubleStemHalfLengthForOffset(shape, offset);
  return {
    p0: { x: -halfLength, y: 0 },
    p1: { x: -halfLength + startPull, y: startOffset },
    p2: { x: halfLength - endPull, y: endOffset },
    p3: { x: halfLength, y: 0 }
  };
}

function curvedLollipopLengthForOffset(shape, offset = shape.stemOffset) {
  const geometry = templates[shape.template].geometry;
  return geometry.baseLength + normalizeStemOffset(offset, shape.template);
}

function curvedStemStartOffset(shape) {
  const fallback = normalizeCurveOffset(shape.curveOffset, shape.template);
  return normalizeCurveEndpointOffset(shape.curveStartOffset, fallback);
}

function curvedStemEndOffset(shape) {
  const fallback = normalizeCurveOffset(shape.curveOffset, shape.template);
  return normalizeCurveEndpointOffset(shape.curveEndOffset, fallback);
}

function curvedStemStartPull(shape) {
  return normalizeCurvePull(shape.curveStartPull, shape.template, shape.stemOffset);
}

function curvedStemEndPull(shape) {
  return normalizeCurvePull(shape.curveEndPull, shape.template, shape.stemOffset);
}

function curvedStemLocalNormal(shape, t, offset = shape.stemOffset) {
  const tangent = curvedStemLocalTangent(shape, t, offset);
  return {
    x: -tangent.y,
    y: tangent.x
  };
}

function curvedStemLocalOuterNormal(shape, t = 0.5) {
  const normal = curvedStemLocalNormal(shape, t);
  const sign = curvedStemOuterSign(shape, t);
  return multiplyVector(normal, sign);
}

function curvedStemOuterSign(shape, t = 0.5) {
  const samples = [t, 0.35, 0.65, 0.2, 0.8];
  for (const sample of samples) {
    const tangent = curvedStemLocalTangent(shape, sample);
    const second = curvedStemLocalSecondDerivative(shape, sample);
    const curvature = tangent.x * second.y - tangent.y * second.x;
    if (Math.abs(curvature) > 0.001) {
      return -Math.sign(curvature);
    }
  }
  const center = curvedStemLocalCenter(shape, t);
  return center.y < 0 ? -1 : 1;
}

function curvedStemLocalArcCenter(shape, endSign, offset = shape.stemOffset) {
  const t = endSign === 1 ? 1 : 0;
  const endpoint = curvedStemLocalCenter(shape, t, offset);
  const tangent = curvedStemLocalTangent(shape, t, offset);
  const outward = multiplyVector(tangent, endSign);
  return addVector(endpoint, outward, doubleStemArcCenterOffset(templates[shape.template]));
}

function doubleStemHalfLengthForOffset(shape, offset) {
  const geometry = templates[shape.template].geometry;
  return geometry.baseHalfLength + normalizeStemOffset(offset, shape.template);
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function svgArcCenter(start, end, radius, largeArcFlag, sweepFlag) {
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq === 0) {
    throw new Error("Cannot compute arc center for coincident endpoints.");
  }
  const factorSq = Math.max(0, (radius * radius - distanceSq) / distanceSq);
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const factor = sign * Math.sqrt(factorSq);
  return {
    x: midpoint.x + factor * dy,
    y: midpoint.y - factor * dx
  };
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    throw new Error("Cannot normalize a zero-length vector.");
  }
  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function addVector(point, vector, amount) {
  return {
    x: point.x + vector.x * amount,
    y: point.y + vector.y * amount
  };
}

function multiplyVector(vector, amount) {
  return {
    x: vector.x * amount,
    y: vector.y * amount
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function formatNumber(value) {
  return String(Math.round(value * 1000) / 1000);
}

function shapeAnchor(shape) {
  const anchor = templates[shape.template].anchor;
  return {
    x: shape.x + anchor.x,
    y: shape.y + anchor.y
  };
}

function letterBounds(shapes) {
  if (shapes.length === 0) {
    return null;
  }

  const trimmed = trimmedLetterBounds(shapes);
  const pad = Math.max(70, Math.max(trimmed.width, trimmed.height) * 0.08);
  return {
    x: trimmed.x - pad,
    y: trimmed.y - pad,
    width: Math.max(1, trimmed.width + pad * 2),
    height: Math.max(1, trimmed.height + pad * 2)
  };
}

function trimmedLetterBounds(shapes) {
  if (shapes.length === 0) {
    return null;
  }

  const boxes = shapes.map(transformedShapeBox);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function transformedShapeBox(shape) {
  const box = dynamicLocalBox(shape);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height }
  ].map((point) => transformShapePoint(point, shape));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function dynamicLocalBox(shape) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", shapePath(shape));
  path.setAttribute("visibility", "hidden");
  els.shapeLayer.appendChild(path);
  const box = path.getBBox();
  els.shapeLayer.removeChild(path);
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height
  };
}

function transformShapePoint(point, shape) {
  const anchor = templates[shape.template].anchor;
  const radians = shape.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  return {
    x: shape.x + anchor.x + dx * cos - dy * sin,
    y: shape.y + anchor.y + dx * sin + dy * cos
  };
}

function inverseTransformShapePoint(point, shape) {
  const anchor = templates[shape.template].anchor;
  const radians = -shape.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - shape.x - anchor.x;
  const dy = point.y - shape.y - anchor.y;
  return {
    x: anchor.x + dx * cos - dy * sin,
    y: anchor.y + dx * sin + dy * cos
  };
}

function stemHandlePoint(shape) {
  if (isCurvedLollipop(shape)) {
    const endpoint = curvedStemLocalCenter(shape, 1);
    const tangent = curvedStemLocalTangent(shape, 1);
    return addVector(endpoint, tangent, STEM_HANDLE_OFFSET);
  }
  const geometry = templates[shape.template].geometry;
  return addVector(
    geometry.tailMid,
    geometry.axis,
    normalizeStemOffset(shape.stemOffset, shape.template) + STEM_HANDLE_OFFSET
  );
}

function doubleStemHandlePoint(shape, endSign = 1) {
  if (isCurvedStem(shape)) {
    const t = endSign === 1 ? 1 : 0;
    const endpoint = curvedStemLocalCenter(shape, t);
    const tangent = curvedStemLocalTangent(shape, t);
    return addVector(endpoint, multiplyVector(tangent, endSign), STEM_HANDLE_OFFSET);
  }
  const geometry = templates[shape.template].geometry;
  return addVector(templates[shape.template].anchor, geometry.axis, endSign * (doubleStemHalfLength(shape) + STEM_HANDLE_OFFSET));
}

function doubleStemEndPoint(shape, endSign = 1) {
  if (isCurvedStem(shape)) {
    return transformShapePoint(curvedStemLocalCenter(shape, endSign === 1 ? 1 : 0), shape);
  }
  return transformShapePoint(addVector(templates[shape.template].anchor, templates[shape.template].geometry.axis, endSign * doubleStemHalfLength(shape)), shape);
}

function curvedStemBendHandlePoint(shape, curveSide) {
  const controls = curvedStemControlPoints(shape);
  return curveSide === "start" ? controls.p1 : controls.p2;
}

function doubleStemArcCenterPoint(shape, endSign = 1) {
  if (isCurvedStem(shape)) {
    return transformShapePoint(curvedStemLocalArcCenter(shape, endSign), shape);
  }
  const template = templates[shape.template];
  const distanceFromAnchor = doubleStemHalfLength(shape) + doubleStemArcCenterOffset(template);
  return transformShapePoint(addVector(template.anchor, template.geometry.axis, endSign * distanceFromAnchor), shape);
}

function doubleStemArcCenterOffset(template) {
  const geometry = template.geometry;
  return Math.sqrt(Math.max(0, geometry.radius * geometry.radius - geometry.halfWidth * geometry.halfWidth));
}

function doubleStemHandleAngle(shape, endSign = 1) {
  if (isCurvedStem(shape)) {
    const t = endSign === 1 ? 1 : 0;
    const tangent = curvedStemLocalTangent(shape, t);
    const localAngle = Math.atan2(tangent.y * endSign, tangent.x * endSign) * 180 / Math.PI;
    return normalizeAngle(shape.angle + localAngle);
  }
  return worldStemAxisAngle(shape);
}

function rotateHandlePoint(shape) {
  const template = templates[shape.template];
  const axis = isLollipop(shape) ? template.geometry.axis : { x: 0, y: -1 };
  return addVector(template.anchor, axis, -ROTATE_HANDLE_OFFSET);
}

function circleStemSeedPoint(shape) {
  const template = templates[shape.template];
  const radius = headRadius(shape);
  return pointOnCircle(template.anchor, radius + STEM_HANDLE_OFFSET, circleStemLocalAngle(shape));
}

function circleStemGrowAngle(shape) {
  return normalizeAngle(circleStemWorldAngle(shape));
}

function circleStemArcCenter(shape) {
  const template = templates[shape.template];
  return pointOnCircle(template.anchor, headRadius(shape), circleStemLocalAngle(shape));
}

function circleStemArcPath(shape) {
  const template = templates[shape.template];
  const center = template.anchor;
  const radius = headRadius(shape);
  const localAngle = circleStemLocalAngle(shape);
  const start = pointOnCircle(center, radius, localAngle - 26);
  const end = pointOnCircle(center, radius, localAngle + 26);
  return [
    `M ${formatNumber(start.x)},${formatNumber(start.y)}`,
    `A ${formatNumber(radius)},${formatNumber(radius)} 0 0 1 ${formatNumber(end.x)},${formatNumber(end.y)}`
  ].join(" ");
}

function circleStemWorldAngle(shape) {
  return Number.isFinite(shape.stemSeedAngle)
    ? normalizeAngle(shape.stemSeedAngle)
    : normalizeAngle((shape.angle || 0) - 90);
}

function circleStemLocalAngle(shape) {
  return normalizeAngle(circleStemWorldAngle(shape) - (shape.angle || 0));
}

function pointOnCircle(center, radius, angle) {
  const radians = angle * Math.PI / 180;
  return {
    x: center.x + Math.cos(radians) * radius,
    y: center.y + Math.sin(radians) * radius
  };
}

function headRadius(shape) {
  const template = templates[shape.template];
  if (template.geometry.radius) {
    return template.geometry.radius;
  }
  return Math.min(template.bbox.width, template.bbox.height) / 2;
}

function stemMinimumForTemplate(templateId) {
  const template = templates[templateId];
  if (!template) {
    return STEM_FALLBACK_MIN;
  }
  if (template.geometry.type === "stem" || template.geometry.type === "curved-stem") {
    return 80 - template.geometry.baseHalfLength;
  }
  if (template.geometry.type === "curved-lollipop") {
    return 80 - template.geometry.baseLength;
  }
  if (template.geometry.type !== "lollipop") {
    return STEM_FALLBACK_MIN;
  }
  return stemCollapseOffsetForTemplate(template);
}

function stemCollapseOffsetForShape(shape) {
  return stemMinimumForTemplate(shape.template);
}

function stemCollapseOffsetForTemplate(template) {
  const geometry = template.geometry;
  const tailDistance = distance(template.anchor, geometry.tailArcCenter);
  return geometry.radius * 2 - tailDistance;
}

function stemHandleDistanceForOffset(template, offset) {
  if (template.geometry.type === "curved-lollipop") {
    return template.geometry.baseLength + offset + STEM_HANDLE_OFFSET;
  }
  const geometry = template.geometry;
  return dot({
    x: geometry.tailMid.x - template.anchor.x,
    y: geometry.tailMid.y - template.anchor.y
  }, geometry.axis) + offset + STEM_HANDLE_OFFSET;
}

function stemOffsetFromHandleDistance(template, handleDistance) {
  return handleDistance - stemHandleDistanceForOffset(template, 0);
}

function handleLine(start, end, className) {
  const line = document.createElementNS(SVG_NS, "line");
  line.classList.add("edit-handle-guide");
  if (className) {
    line.classList.add(...className.split(" ").filter(Boolean));
  }
  line.setAttribute("x1", start.x);
  line.setAttribute("y1", start.y);
  line.setAttribute("x2", end.x);
  line.setAttribute("y2", end.y);
  return line;
}

function handleCircle(point, type, extraClass = "") {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.classList.add("edit-handle", "rotate-handle");
  if (extraClass) {
    circle.classList.add(...extraClass.split(" ").filter(Boolean));
  }
  circle.dataset.handle = type;
  circle.setAttribute("cx", point.x);
  circle.setAttribute("cy", point.y);
  circle.setAttribute("r", 28);
  return circle;
}

function handleCurveRotateWidget(shape) {
  const frame = curvedStemRotateHandleFrame(shape);
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("edit-handle", "curve-rotate-handle");
  group.dataset.handle = "shape-rotate";
  group.setAttribute(
    "transform",
    `matrix(${formatNumber(frame.tangent.x)} ${formatNumber(frame.tangent.y)} ${formatNumber(frame.outward.x)} ${formatNumber(frame.outward.y)} ${formatNumber(frame.origin.x)} ${formatNumber(frame.origin.y)})`
  );

  const rail = document.createElementNS(SVG_NS, "path");
  rail.classList.add("curve-rotate-rail");
  rail.setAttribute("d", curvedRotateRailPath(shape, frame));
  group.appendChild(rail);

  const box = document.createElementNS(SVG_NS, "rect");
  box.classList.add("curve-rotate-box");
  box.setAttribute("x", -25);
  box.setAttribute("y", -28);
  box.setAttribute("width", 50);
  box.setAttribute("height", 36);
  box.setAttribute("rx", 8);
  group.appendChild(box);

  return group;
}

function handleCurvePairWidget(frame, pairSide) {
  const group = document.createElementNS(SVG_NS, "g");
  group.classList.add("edit-handle", "curve-pair-handle");
  group.dataset.handle = "curve-pair";
  group.dataset.curvePair = pairSide;
  group.setAttribute(
    "transform",
    `matrix(${formatNumber(frame.tangent.x)} ${formatNumber(frame.tangent.y)} ${formatNumber(frame.normal.x)} ${formatNumber(frame.normal.y)} ${formatNumber(frame.origin.x)} ${formatNumber(frame.origin.y)})`
  );

  const diamond = document.createElementNS(SVG_NS, "path");
  diamond.classList.add("curve-pair-diamond");
  diamond.setAttribute("d", "M 0 -28 L 28 0 L 0 28 L -28 0 Z");
  group.appendChild(diamond);

  const mark = document.createElementNS(SVG_NS, "path");
  mark.classList.add("curve-pair-mark");
  mark.setAttribute("d", "M -11 0 H 11 M 0 -11 V 11");
  group.appendChild(mark);

  return group;
}

function curvedStemRotateHandlePoint(shape) {
  return curvedStemRotateHandleFrame(shape).origin;
}

function curvedStemRotateHandleFrame(shape) {
  const geometry = templates[shape.template].geometry;
  const center = curvedStemLocalCenter(shape, 0.5);
  const tangent = curvedStemLocalTangent(shape, 0.5);
  const outerSign = curvedStemOuterSign(shape, 0.5);
  const outward = curvedStemLocalOuterNormal(shape, 0.5);
  return {
    origin: addVector(center, outward, geometry.halfWidth + 82),
    tangent,
    outward,
    outerSign,
    offset: geometry.halfWidth + 82
  };
}

function curvedStemPairHandleFrame(shape, pairSide) {
  const geometry = templates[shape.template].geometry;
  const t = CURVE_PAIR_HANDLE_T[pairSide] || 0.5;
  const center = curvedStemLocalCenter(shape, t);
  const tangent = curvedStemLocalTangent(shape, t);
  const baseNormal = curvedStemLocalNormal(shape, t);
  const outerSign = curvedStemOuterSign(shape, t);
  const sideSign = pairSide === "outer" ? outerSign : -outerSign;
  const normal = multiplyVector(baseNormal, sideSign);
  const borderPoint = addVector(center, normal, geometry.halfWidth);
  return {
    origin: addVector(center, normal, geometry.halfWidth + CURVE_PAIR_HANDLE_OFFSET),
    borderPoint,
    guideStart: addVector(center, normal, geometry.halfWidth + CURVE_PAIR_GUIDE_START_OFFSET),
    tangent,
    normal,
    sideSign
  };
}

function curvedRotateRailPath(shape, frame) {
  return [
    curvedRotateRailSegmentPath(shape, frame, [-104, -78, -52, -26]),
    curvedRotateRailSegmentPath(shape, frame, [26, 52, 78, 104])
  ].join(" ");
}

function curvedRotateRailSegmentPath(shape, frame, targetXs) {
  const points = targetXs.map((targetX) => curvedRotateRailPointAtX(shape, frame, targetX));
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPoint(point)}`).join(" ");
}

function curvedRotateRailPointAtX(shape, frame, targetX) {
  const t = curvedRotateRailTForX(shape, frame, targetX);
  const point = curvedRotateRailPoint(shape, frame, t);
  return {
    x: targetX,
    y: point.y
  };
}

function curvedRotateRailTForX(shape, frame, targetX) {
  let low = targetX < 0 ? 0 : 0.5;
  let high = targetX < 0 ? 0.5 : 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const point = curvedRotateRailPoint(shape, frame, mid);
    if (point.x < targetX) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

function curvedRotateRailPoint(shape, frame, t) {
  const center = curvedStemLocalCenter(shape, t);
  const normal = multiplyVector(curvedStemLocalNormal(shape, t), frame.outerSign);
  const railPoint = addVector(center, normal, frame.offset);
  return projectPointToFrame(railPoint, frame);
}

function projectPointToFrame(point, frame) {
  const delta = {
    x: point.x - frame.origin.x,
    y: point.y - frame.origin.y
  };
  return {
    x: dot(delta, frame.tangent),
    y: dot(delta, frame.outward)
  };
}

function handlePath(pathData, type, extraClass, cursorAngle = null) {
  const path = document.createElementNS(SVG_NS, "path");
  if (type) {
    path.classList.add("edit-handle");
    path.dataset.handle = type;
  }
  if (extraClass) {
    path.classList.add(...extraClass.split(" ").filter(Boolean));
  }
  path.setAttribute("d", pathData);
  setResizeCursor(path, cursorAngle);
  return path;
}

function handleRect(point, type, extraClass = "", cursorAngle = null) {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.classList.add("edit-handle", "length-handle");
  if (extraClass) {
    rect.classList.add(...extraClass.split(" ").filter(Boolean));
  }
  rect.dataset.handle = type;
  rect.setAttribute("x", point.x - 24);
  rect.setAttribute("y", point.y - 24);
  rect.setAttribute("width", 48);
  rect.setAttribute("height", 48);
  rect.setAttribute("rx", 8);
  setResizeCursor(rect, cursorAngle);
  return rect;
}

function setResizeCursor(element, angle) {
  if (!Number.isFinite(angle)) {
    return;
  }
  element.style.cursor = resizeCursorForAngle(angle);
}

function resizeCursorForAngle(angle) {
  const snapped = normalizeAngle(Math.round(angle / 5) * 5);
  if (resizeCursorCache.has(snapped)) {
    return resizeCursorCache.get(snapped);
  }
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <g transform="rotate(${snapped} 16 16)" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 16h20" stroke="white" stroke-width="6"/>
        <path d="M6 16h20" stroke="#17202a" stroke-width="3"/>
        <path d="M6 16l5-5M6 16l5 5M26 16l-5-5M26 16l-5 5" stroke="white" stroke-width="6"/>
        <path d="M6 16l5-5M6 16l5 5M26 16l-5-5M26 16l-5 5" stroke="#17202a" stroke-width="3"/>
      </g>
    </svg>
  `.trim();
  const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, ew-resize`;
  resizeCursorCache.set(snapped, cursor);
  return cursor;
}

function onPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  const point = svgPoint(event);
  const handle = event.target.closest(".edit-handle");
  if (handle) {
    const handleGroup = handle.closest(".edit-handles");
    const shape = shapeById(handleGroup.dataset.id);
    if (!shape) {
      return;
    }
    els.stage.setPointerCapture(event.pointerId);
    state.selectedIds = new Set([shape.id]);

    if (handle.dataset.handle === "stem-combo") {
      const doubleStemEndSign = isDoubleStem(shape) ? Number(handle.dataset.endSign) || 1 : null;
      state.drag = {
        type: "stem-combo",
        pointerId: event.pointerId,
        start: point,
        center: shapeAnchor(shape),
        shapeId: shape.id,
        templateId: lollipopTemplateForGrow(shape),
        stemOnly: event.shiftKey,
        axisAngle: stemAxisAngleForShape(shape),
        endSign: doubleStemEndSign,
        pinnedEnd: isDoubleStem(shape) ? doubleStemEndPoint(shape, -doubleStemEndSign) : null,
        moved: false
      };
    } else if (handle.dataset.handle === "curve-bend" && isCurvedShape(shape)) {
      state.drag = {
        type: "curve-bend",
        pointerId: event.pointerId,
        start: point,
        center: shapeAnchor(shape),
        shapeId: shape.id,
        axisAngle: worldStemAxisAngle(shape),
        curveSide: handle.dataset.curveSide || "start",
        moved: false
      };
    } else if (handle.dataset.handle === "curve-pair" && isCurvedShape(shape)) {
      const pairSide = handle.dataset.curvePair === "inner" ? "inner" : "outer";
      const frame = curvedStemPairHandleFrame(shape, pairSide);
      state.drag = {
        type: "curve-pair",
        pointerId: event.pointerId,
        start: point,
        startLocal: inverseTransformShapePoint(point, shape),
        shapeId: shape.id,
        tangent: frame.tangent,
        normal: frame.normal,
        sideSign: frame.sideSign,
        startCurveStartOffset: curvedStemStartOffset(shape),
        startCurveEndOffset: curvedStemEndOffset(shape),
        startCurveStartPull: curvedStemStartPull(shape),
        startCurveEndPull: curvedStemEndPull(shape),
        moved: false
      };
    } else if (handle.dataset.handle === "shape-rotate" && isCurvedShape(shape)) {
      const center = shapeAnchor(shape);
      state.drag = {
        type: "rotate",
        pointerId: event.pointerId,
        start: point,
        center,
        shapeId: shape.id,
        startAngle: shape.angle,
        startPointerAngle: pointAngle(center, point),
        moved: false
      };
    } else {
      return;
    }
    renderAll();
    return;
  }

  const group = event.target.closest(".shape");

  if (group) {
    const target = shapeById(group.dataset.id);
    if (!target) {
      return;
    }
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (state.selectedIds.has(target.id)) {
        state.selectedIds.delete(target.id);
      } else {
        state.selectedIds.add(target.id);
      }
      renderAll();
      return;
    }

    els.stage.setPointerCapture(event.pointerId);
    if (event.ctrlKey || event.metaKey) {
      const duplicated = duplicateShapeSet(state.selectedIds.has(target.id) ? selectedShapes() : [target]);
      state.selectedIds = new Set(duplicated.map((shape) => shape.id));
      renderAll();
    } else if (!state.selectedIds.has(target.id)) {
      state.selectedIds = new Set([target.id]);
      renderAll();
    }

    state.drag = {
      type: "move",
      pointerId: event.pointerId,
      start: point,
      moved: false,
      shapes: selectedShapes().map((shape) => ({
        id: shape.id,
        x: shape.x,
        y: shape.y,
        anchor: shapeAnchor(shape)
      }))
    };
  } else {
    els.stage.setPointerCapture(event.pointerId);
    state.selectedIds.clear();
    state.drag = {
      type: "select",
      pointerId: event.pointerId,
      start: point,
      current: point,
      moved: false
    };
    updateSelectionBox(point, point);
    renderAll();
  }
}

function onPointerMove(event) {
  updateHover(event);
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  const point = svgPoint(event);
  const dx = point.x - drag.start.x;
  const dy = point.y - drag.start.y;
  if (Math.hypot(dx, dy) > 3) {
    drag.moved = true;
  }

  if (drag.type === "move") {
    drag.shapes.forEach((entry) => {
      const shape = shapeById(entry.id);
      if (!shape) {
        return;
      }
      const template = templates[shape.template];
      shape.x = snap(entry.anchor.x + dx) - template.anchor.x;
      shape.y = snap(entry.anchor.y + dy) - template.anchor.y;
    });
    state.alignmentGuides = alignmentGuidesForMovingShapes(drag.shapes.map((entry) => entry.id));
    renderAlignmentGuides();
    renderShapes();
    renderHandles();
    renderInspector();
    renderLetters();
  } else if (drag.type === "stem-combo") {
    const shape = shapeById(drag.shapeId);
    if (!shape) {
      return;
    }
    updateStemDragModifier(shape, drag, event);
    if (isDoubleStem(shape)) {
      updateDoubleStemDrag(shape, drag, point);
    } else if (isCurvedLollipop(shape)) {
      updateCurvedLollipopStemDrag(shape, drag, point);
    } else {
      updateCircleGrowDrag(shape, drag, point);
    }
    state.alignmentGuides = alignmentGuidesForStemShape(shape);
    renderAlignmentGuides();
    renderShapes();
    renderHandles();
    renderInspector();
    renderLetters();
  } else if (drag.type === "curve-bend") {
    const shape = shapeById(drag.shapeId);
    if (!shape || !isCurvedShape(shape)) {
      return;
    }
    updateCurveBendDrag(shape, drag, point);
    renderShapes();
    renderHandles();
    renderInspector();
    renderLetters();
  } else if (drag.type === "curve-pair") {
    const shape = shapeById(drag.shapeId);
    if (!shape || !isCurvedShape(shape)) {
      return;
    }
    updateCurvePairDrag(shape, drag, point);
    renderShapes();
    renderHandles();
    renderInspector();
    renderLetters();
  } else if (drag.type === "rotate") {
    const shape = shapeById(drag.shapeId);
    if (!shape) {
      return;
    }
    const delta = pointAngle(drag.center, point) - drag.startPointerAngle;
    shape.angle = snapAngle(drag.startAngle + delta);
    renderShapes();
    renderHandles();
    renderInspector();
    renderLetters();
  } else if (drag.type === "select") {
    drag.current = point;
    updateSelectionBox(drag.start, drag.current);
  }
}

function onPointerUp(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (drag.type === "select") {
    if (drag.moved) {
      selectShapesInRect(drag.start, drag.current);
    } else {
      state.selectedIds.clear();
    }
    hideSelectionBox();
  }

  if (["move", "stem-combo", "curve-bend", "curve-pair", "rotate"].includes(drag.type) && drag.moved) {
    saveState();
  }

  cancelDrag(event);
  renderAll();
}

function cancelDrag(event) {
  if (event && els.stage.hasPointerCapture(event.pointerId)) {
    els.stage.releasePointerCapture(event.pointerId);
  }
  state.drag = null;
  state.alignmentGuides = [];
  renderAlignmentGuides();
  hideSelectionBox();
}

function updateHover(event) {
  if (state.drag) {
    return;
  }
  const handleGroup = event.target.closest(".edit-handles");
  const shapeGroup = event.target.closest(".shape");
  const nextId = handleGroup?.dataset.id || shapeGroup?.dataset.id || null;
  if (state.hoveredId === nextId) {
    return;
  }
  state.hoveredId = nextId;
  renderHandles();
}

function clearHover() {
  if (!state.hoveredId || state.drag) {
    return;
  }
  state.hoveredId = null;
  renderHandles();
}

function onDoubleClick(event) {
  const group = event.target.closest(".shape");
  if (group) {
    const shape = shapeById(group.dataset.id);
    if (!shape) {
      return;
    }
    state.selectedIds = new Set([shape.id]);
    toggleDoubleStem(shape);
    saveState();
    renderAll();
    return;
  }

  const point = svgPoint(event);
  addShapeAt(point.x, point.y);
}

function onWheel(event) {
  const group = event.target.closest(".shape");
  const wheelDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  const direction = wheelDelta < 0 ? 1 : -1;
  event.preventDefault();

  if (event.ctrlKey) {
    zoomAt(svgPoint(event), wheelDelta < 0 ? 0.9 : 1.1);
    return;
  }

  if (group) {
    const target = shapeById(group.dataset.id);
    if (!target) {
      return;
    }
    if (event.metaKey) {
      if (!state.selectedIds.has(target.id)) {
        state.selectedIds = new Set([target.id]);
      }
      rotateSelected(direction * state.angleStep);
      return;
    }
    if (event.shiftKey) {
      if (!state.selectedIds.has(target.id)) {
        state.selectedIds = new Set([target.id]);
      }
      cycleStyle(direction);
      return;
    }
  }

  panView(event.deltaX, event.deltaY);
}

function onKeyDown(event) {
  if (/** @type {HTMLDialogElement} */ (document.getElementById("font-dialog")).open) return;
  const active = /** @type {HTMLElement} */ (document.activeElement);
  const isFormField = ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
  if (["INPUT", "TEXTAREA"].includes(active.tagName) || active.isContentEditable) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoHistory();
    } else {
      undoHistory();
    }
    return;
  }

  if (isFormField) {
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelectedShapes();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteShapesFromClipboard();
    return;
  }
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete"].includes(event.key)) {
    return;
  }
  event.preventDefault();

  if (event.key === "Backspace" || event.key === "Delete") {
    deleteSelected();
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    const amount = event.key === "ArrowRight" || event.key === "ArrowUp"
      ? state.angleStep
      : -state.angleStep;
    rotateSelected(amount);
    return;
  }

  const amount = event.shiftKey ? state.gridSize * 4 : state.gridSize;
  const dx = event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0;
  const dy = event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0;
  moveSelected(dx, dy);
}

function addShapeAt(x, y) {
  const template = templates[state.activeTemplate];
  const shape = makeShape(
    state.activeTemplate,
    state.activeStyle,
    snap(x) - template.anchor.x,
    snap(y) - template.anchor.y,
    0
  );
  currentShapes().push(shape);
  state.selectedIds = new Set([shape.id]);
  saveState();
  renderAll();
}

function duplicateSelected() {
  const selected = selectedShapes();
  if (selected.length === 0) {
    return;
  }
  const duplicated = duplicateShapeSet(selected);
  state.selectedIds = new Set(duplicated.map((shape) => shape.id));
  saveState();
  renderAll();
}

function duplicateShapeSet(shapes) {
  const duplicated = shapes.map((shape) => ({
    ...shape,
    id: makeId(),
    x: shape.x + state.gridSize,
    y: shape.y + state.gridSize
  }));
  currentShapes().push(...duplicated);
  saveState();
  return duplicated;
}

async function copySelectedShapes() {
  const selected = selectedShapes();
  if (selected.length === 0) {
    return;
  }
  shapeClipboardPayload = {
    kind: "motrpac-shapes",
    version: 1,
    copiedAt: new Date().toISOString(),
    shapes: cloneShapesForExport(selected)
  };
  await writeClipboardText(JSON.stringify(shapeClipboardPayload, null, 2));
}

async function pasteShapesFromClipboard() {
  const payload = await readShapeClipboardPayload();
  if (!payload || !Array.isArray(payload.shapes) || payload.shapes.length === 0) {
    return;
  }
  const offset = state.gridSize * 2;
  const pasted = normalizeShapes(payload.shapes).map((shape) => ({
    ...shape,
    id: makeId(),
    x: shape.x + offset,
    y: shape.y + offset
  }));
  currentShapes().push(...pasted);
  state.selectedIds = new Set(pasted.map((shape) => shape.id));
  saveState("Paste shapes");
  renderAll();
}

async function readShapeClipboardPayload() {
  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      if (parsed?.kind === "motrpac-shapes") {
        shapeClipboardPayload = parsed;
        return parsed;
      }
    } catch (error) {
      // Browser clipboard reads can fail outside secure contexts or without focus.
    }
  }
  return shapeClipboardPayload;
}

function deleteSelected() {
  if (state.selectedIds.size === 0) {
    return;
  }
  const entry = letterState(state.activeLetter);
  entry.variants[entry.activeVariant] = currentShapes().filter((shape) => !state.selectedIds.has(shape.id));
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function clearActiveLetter() {
  const entry = letterState(state.activeLetter);
  entry.variants[entry.activeVariant] = [];
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function moveSelected(dx, dy) {
  selectedShapes().forEach((shape) => {
    const anchor = shapeAnchor(shape);
    const template = templates[shape.template];
    shape.x = snap(anchor.x + dx) - template.anchor.x;
    shape.y = snap(anchor.y + dy) - template.anchor.y;
  });
  saveState();
  renderAll();
}

function rotateSelected(delta) {
  selectedShapes().forEach((shape) => {
    shape.angle = snapAngle(shape.angle + delta);
  });
  saveState();
  renderAll();
}

function cycleStyle(direction) {
  const selected = selectedShapes();
  if (selected.length === 0) {
    return;
  }
  selected.forEach((shape) => {
    const index = styles.findIndex((style) => style.id === shape.style);
    const next = (index + direction + styles.length) % styles.length;
    shape.style = styles[next].id;
    state.activeStyle = shape.style;
  });
  saveState();
  renderAll();
}

function setSelectedTemplate(templateId) {
  if (!templates[templateId]) {
    return;
  }
  state.activeTemplate = templateId;
  selectedShapes().forEach((shape) => {
    const anchor = shapeAnchor(shape);
    const sourceAxisAngle = stemAxisAngleForShape(shape);
    const targetType = templates[templateId].geometry.type;
    shape.template = templateId;
    shape.x = anchor.x - templates[templateId].anchor.x;
    shape.y = anchor.y - templates[templateId].anchor.y;
    if (targetType === "lollipop" || targetType === "curved-lollipop" || targetType === "stem" || targetType === "curved-stem") {
      shape.angle = normalizeAngle(sourceAxisAngle - localStemAxisAngle(templates[templateId]));
      shape.stemOffset = normalizeStemOffset(shape.stemOffset, templateId);
      shape.curveOffset = normalizeCurveOffset(shape.curveOffset, templateId);
      shape.curveStartOffset = normalizeCurveEndpointOffset(shape.curveStartOffset, shape.curveOffset);
      shape.curveEndOffset = normalizeCurveEndpointOffset(shape.curveEndOffset, shape.curveOffset);
      shape.curveStartPull = normalizeCurvePull(shape.curveStartPull, templateId, shape.stemOffset);
      shape.curveEndPull = normalizeCurvePull(shape.curveEndPull, templateId, shape.stemOffset);
    } else {
      shape.stemOffset = 0;
      shape.stemSeedAngle = sourceAxisAngle;
    }
    if (isLollipopTemplate(templateId)) {
      shape.lastLollipopTemplate = templateId;
    }
  });
  saveState();
  renderAll();
}

function lollipopTemplateForGrow(shape) {
  if (isLollipopTemplate(state.activeTemplate)) {
    return state.activeTemplate;
  }
  if (shape?.lastLollipopTemplate && isLollipopTemplate(shape.lastLollipopTemplate)) {
    return shape.lastLollipopTemplate;
  }
  if (isLollipopTemplate(shape.template)) {
    return shape.template;
  }
  return "lollipop-long";
}

function updateCircleGrowDrag(shape, drag, point) {
  const desiredAxisAngle = drag.stemOnly ? drag.axisAngle : pointAngle(drag.center, point);
  const distanceFromCenter = drag.stemOnly
    ? projectedDistanceFromCenter(drag.center, point, desiredAxisAngle)
    : distance(drag.center, point);
  const templateId = isLollipop(shape) ? shape.template : drag.templateId;
  const template = templates[templateId];
  const minOffset = stemCollapseOffsetForTemplate(template);
  const minHandleDistance = stemHandleDistanceForOffset(template, minOffset);
  if (distanceFromCenter <= minHandleDistance) {
    if (isLollipop(shape)) {
      convertShapeToCircle(shape);
      state.activeTemplate = "circle";
    }
    return;
  }

  if (!isLollipop(shape)) {
    convertCircleToLollipop(shape, drag.templateId, desiredAxisAngle);
  }

  const activeTemplate = templates[shape.template];
  shape.angle = normalizeAngle(desiredAxisAngle - localStemAxisAngle(activeTemplate));
  shape.stemOffset = snapStem(stemOffsetFromHandleDistance(activeTemplate, distanceFromCenter), shape.template);
  shape.stemSeedAngle = desiredAxisAngle;
  state.activeTemplate = shape.template;
}

function updateDoubleStemDrag(shape, drag, point) {
  const template = templates[shape.template];
  const endSign = drag.endSign || 1;
  const pinnedEnd = drag.pinnedEnd || doubleStemEndPoint(shape, -endSign);
  const currentAxisAngle = drag.axisAngle;
  const pointerVector = {
    x: point.x - pinnedEnd.x,
    y: point.y - pinnedEnd.y
  };
  const pointerVectorLength = Math.hypot(pointerVector.x, pointerVector.y);
  const activeDirection = drag.stemOnly || pointerVectorLength === 0
    ? angleUnit(currentAxisAngle + (endSign === 1 ? 0 : 180))
    : { x: pointerVector.x / pointerVectorLength, y: pointerVector.y / pointerVectorLength };
  const pointerDistance = drag.stemOnly
    ? Math.max(0, dot({ x: point.x - pinnedEnd.x, y: point.y - pinnedEnd.y }, activeDirection))
    : distance(pinnedEnd, point);
  const segmentLength = Math.max(160, pointerDistance - STEM_HANDLE_OFFSET);
  const activeEnd = addVector(pinnedEnd, activeDirection, segmentLength);
  const center = midpoint(pinnedEnd, activeEnd);
  const axisAngle = endSign === 1 ? pointAngle(pinnedEnd, activeEnd) : pointAngle(activeEnd, pinnedEnd);
  const halfLength = segmentLength / 2;
  shape.x = center.x - template.anchor.x;
  shape.y = center.y - template.anchor.y;
  shape.angle = normalizeAngle(axisAngle - localStemAxisAngle(template));
  shape.stemOffset = normalizeStemOffset(halfLength - template.geometry.baseHalfLength, shape.template);
  shape.stemSeedAngle = axisAngle;
  drag.center = center;
  drag.axisAngle = worldStemAxisAngle(shape);
  state.activeTemplate = shape.template;
}

function updateCurvedLollipopStemDrag(shape, drag, point) {
  const template = templates[shape.template];
  const desiredAxisAngle = drag.stemOnly ? drag.axisAngle : pointAngle(drag.center, point);
  const distanceFromCenter = drag.stemOnly
    ? projectedDistanceFromCenter(drag.center, point, desiredAxisAngle)
    : distance(drag.center, point);
  const minOffset = stemMinimumForTemplate(shape.template);
  const minHandleDistance = stemHandleDistanceForOffset(template, minOffset);
  if (distanceFromCenter <= minHandleDistance) {
    convertShapeToCircle(shape);
    state.activeTemplate = "circle";
    return;
  }
  shape.angle = normalizeAngle(desiredAxisAngle - localStemAxisAngle(template));
  shape.stemOffset = snapStem(stemOffsetFromHandleDistance(template, distanceFromCenter), shape.template);
  shape.stemSeedAngle = desiredAxisAngle;
  state.activeTemplate = shape.template;
}

function updateStemDragModifier(shape, drag, event) {
  if (event.shiftKey) {
    if (!drag.stemOnly) {
      drag.stemOnly = true;
      drag.axisAngle = stemAxisAngleForShape(shape);
    }
    return;
  }

  drag.stemOnly = false;
}

function updateCurveBendDrag(shape, drag, point) {
  const localPoint = inverseTransformShapePoint(point, shape);
  const controls = curvedStemControlPoints(shape);
  const snappedOffset = snap(normalizeCurveEndpointOffset(localPoint.y));
  if (drag.curveSide === "end") {
    shape.curveEndOffset = snappedOffset;
    shape.curveEndPull = normalizeCurvePull(snap(controls.p3.x - localPoint.x), shape.template, shape.stemOffset);
  } else {
    shape.curveStartOffset = snappedOffset;
    shape.curveStartPull = normalizeCurvePull(snap(localPoint.x - controls.p0.x), shape.template, shape.stemOffset);
  }
  shape.curveOffset = (curvedStemStartOffset(shape) + curvedStemEndOffset(shape)) / 2;
}

function updateCurvePairDrag(shape, drag, point) {
  const localPoint = inverseTransformShapePoint(point, shape);
  const delta = {
    x: localPoint.x - drag.startLocal.x,
    y: localPoint.y - drag.startLocal.y
  };
  const sideDelta = dot(delta, drag.normal);
  const tangentDelta = dot(delta, drag.tangent);
  const offsetDelta = snap(sideDelta * drag.sideSign);
  const pullDelta = snap(tangentDelta);

  shape.curveStartOffset = normalizeCurveEndpointOffset(drag.startCurveStartOffset + offsetDelta);
  shape.curveEndOffset = normalizeCurveEndpointOffset(drag.startCurveEndOffset + offsetDelta);
  shape.curveStartPull = normalizeCurvePull(drag.startCurveStartPull + pullDelta, shape.template, shape.stemOffset);
  shape.curveEndPull = normalizeCurvePull(drag.startCurveEndPull + pullDelta, shape.template, shape.stemOffset);
  shape.curveOffset = (curvedStemStartOffset(shape) + curvedStemEndOffset(shape)) / 2;
}

function projectedDistanceFromCenter(center, point, angle) {
  const radians = angle * Math.PI / 180;
  return Math.max(0, dot({
    x: point.x - center.x,
    y: point.y - center.y
  }, {
    x: Math.cos(radians),
    y: Math.sin(radians)
  }));
}

function convertCircleToLollipop(shape, templateId, desiredAxisAngle) {
  const nextTemplateId = isLollipopTemplate(templateId) ? templateId : "lollipop-long";
  const center = shapeAnchor(shape);
  shape.template = nextTemplateId;
  shape.angle = normalizeAngle(desiredAxisAngle - localStemAxisAngle(templates[nextTemplateId]));
  shape.x = center.x - templates[nextTemplateId].anchor.x;
  shape.y = center.y - templates[nextTemplateId].anchor.y;
  shape.stemOffset = 0;
  shape.stemSeedAngle = desiredAxisAngle;
  shape.lastLollipopTemplate = nextTemplateId;
}

function convertShapeToCircle(shape) {
  const center = shapeAnchor(shape);
  const stemAngle = stemAxisAngleForShape(shape);
  const lastTemplate = isLollipop(shape) ? shape.template : shape.lastLollipopTemplate;
  shape.template = "circle";
  shape.x = center.x - templates.circle.anchor.x;
  shape.y = center.y - templates.circle.anchor.y;
  shape.stemOffset = 0;
  shape.angle = 0;
  shape.stemSeedAngle = stemAngle;
  shape.lastLollipopTemplate = lastTemplate;
}

function toggleDoubleStem(shape) {
  if (isDoubleStem(shape)) {
    convertDoubleStemToLollipop(shape);
    return;
  }
  convertShapeToDoubleStem(shape);
}

function convertShapeToDoubleStem(shape) {
  const center = shapeAnchor(shape);
  const axisAngle = stemAxisAngleForShape(shape);
  const previousTemplate = isLollipop(shape) ? shape.template : shape.lastLollipopTemplate;
  const stemDistance = isLollipop(shape) ? distance(center, worldStemArcCenter(shape)) : templates["double-stem"].geometry.baseHalfLength;
  shape.template = "double-stem";
  shape.x = center.x - templates["double-stem"].anchor.x;
  shape.y = center.y - templates["double-stem"].anchor.y;
  shape.angle = normalizeAngle(axisAngle - localStemAxisAngle(templates["double-stem"]));
  shape.stemOffset = normalizeStemOffset(stemDistance - templates["double-stem"].geometry.baseHalfLength, "double-stem");
  shape.stemSeedAngle = axisAngle;
  shape.lastLollipopTemplate = isLollipopTemplate(previousTemplate) ? previousTemplate : "lollipop-long";
  state.activeTemplate = "double-stem";
}

function convertDoubleStemToLollipop(shape) {
  const center = shapeAnchor(shape);
  const axisAngle = worldStemAxisAngle(shape);
  const nextTemplateId = isLollipopTemplate(shape.lastLollipopTemplate) ? shape.lastLollipopTemplate : "lollipop-long";
  shape.template = nextTemplateId;
  shape.x = center.x - templates[nextTemplateId].anchor.x;
  shape.y = center.y - templates[nextTemplateId].anchor.y;
  shape.angle = normalizeAngle(axisAngle - localStemAxisAngle(templates[nextTemplateId]));
  shape.stemOffset = 0;
  shape.stemSeedAngle = axisAngle;
  shape.lastLollipopTemplate = nextTemplateId;
  state.activeTemplate = nextTemplateId;
}

function stemAxisAngleForShape(shape) {
  if (isLollipop(shape) || isDoubleStem(shape)) {
    return worldStemAxisAngle(shape);
  }
  return circleStemWorldAngle(shape);
}

function localStemAxisAngle(template) {
  return normalizeAngle(Math.atan2(template.geometry.axis.y, template.geometry.axis.x) * 180 / Math.PI);
}

function setSelectedStyle(styleId) {
  if (!styleById(styleId)) {
    return;
  }
  state.activeStyle = styleId;
  selectedShapes().forEach((shape) => {
    shape.style = styleId;
  });
  saveState();
  renderAll();
}

function setSelectedAnchor(axis, value) {
  if (!Number.isFinite(value)) {
    return;
  }
  selectedShapes().forEach((shape) => {
    const template = templates[shape.template];
    shape[axis] = snap(value) - template.anchor[axis];
  });
  saveState();
  renderAll();
}

function alignSelectedShapes(axis, mode = "mean") {
  const selected = selectedShapes();
  if (!["x", "y"].includes(axis) || !["min", "mean", "max"].includes(mode) || selected.length < 2) {
    return;
  }

  const anchors = selected.map(shapeAnchor);
  const values = anchors.map((anchor) => anchor[axis]);
  const target = alignmentTarget(values, mode);
  selected.forEach((shape) => setShapeAnchorAxis(shape, axis, target));
  saveState(`Align ${axis.toUpperCase()} ${mode}`);
  renderAll();
}

function alignmentTarget(values, mode) {
  if (mode === "min") {
    return Math.min(...values);
  }
  if (mode === "max") {
    return Math.max(...values);
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distributeSelectedShapes(axis) {
  const selected = selectedShapes();
  if (!["x", "y"].includes(axis) || selected.length < 3) {
    return;
  }

  const ordered = selected
    .map((shape) => ({
      shape,
      anchor: shapeAnchor(shape)
    }))
    .sort((a, b) => a.anchor[axis] - b.anchor[axis]);
  const min = ordered[0].anchor[axis];
  const max = ordered[ordered.length - 1].anchor[axis];
  const step = (max - min) / (ordered.length - 1);

  ordered.forEach((entry, index) => {
    setShapeAnchorAxis(entry.shape, axis, min + step * index);
  });
  saveState(`Distribute ${axis.toUpperCase()}`);
  renderAll();
}

function setShapeAnchorAxis(shape, axis, value) {
  const template = templates[shape.template];
  shape[axis] = value - template.anchor[axis];
}

function setSelectedAngle(value) {
  if (!Number.isFinite(value)) {
    return;
  }
  selectedShapes().forEach((shape) => {
    shape.angle = snapAngle(value);
  });
  saveState();
  renderAll();
}

function setSelectedStem(value) {
  if (!Number.isFinite(value)) {
    return;
  }
  selectedShapes().forEach((shape) => {
    if (isLollipop(shape)) {
      if (value <= stemCollapseOffsetForShape(shape)) {
        convertShapeToCircle(shape);
      } else {
        shape.stemOffset = snapStem(value, shape.template);
      }
    } else if (isDoubleStem(shape)) {
      shape.stemOffset = snapStem(value, shape.template);
    }
  });
  saveState();
  renderAll();
}

function polishDesign(mode) {
  const steps = clamp(Math.floor(state.polishIterations), 1, 50);
  const sourceShapes = polishSourceShapes();
  if (state.polishStage === 2) {
    runPolishStage2(mode, steps, sourceShapes);
  } else {
    runPolishStage1(mode, steps, sourceShapes);
  }
  saveState(`Polish ${state.polishStage}`);
  renderAll();
}

function polishSourceShapes() {
  const selected = selectedShapes();
  return selected.length > 0 ? selected : currentShapes();
}

function runPolishStage1(mode, steps, sourceShapes = polishSourceShapes()) {
  const targetMap = makePolishTargetMap(sourceShapes);
  const stemTipTargetMap = makeAngleTargetMap(currentShapes(), sourceShapes);
  for (let step = 0; step < steps; step += 1) {
    if (mode === "all") {
      polishLengths(false, stemTipTargetMap, sourceShapes);
      polishPositions(false, targetMap, sourceShapes);
      separateOverlaps(sourceShapes);
      polishAngles(false, stemTipTargetMap, sourceShapes);
      polishCurves(false, stemTipTargetMap, sourceShapes, POLISH_CURVE_ANGLE_STEP);
    } else if (mode === "angles") {
      polishAngles(false, stemTipTargetMap, sourceShapes);
    } else if (mode === "curve") {
      polishCurves(false, stemTipTargetMap, sourceShapes, POLISH_CURVE_ANGLE_STEP);
    } else if (mode === "size") {
      polishSize(false, sourceShapes, steps);
      break;
    } else if (mode === "positions") {
      polishPositions(false, targetMap, sourceShapes);
      separateOverlaps(sourceShapes);
    } else if (mode === "lengths") {
      polishLengths(false, stemTipTargetMap, sourceShapes);
    } else if (mode === "colors") {
      polishColors(sourceShapes);
      break;
    }
  }
  if (mode === "positions") {
    snapPolishPositions(sourceShapes);
  }
  if (mode === "all") {
    const finalTargetMap = makeAngleTargetMap(currentShapes(), sourceShapes);
    polishAngles(false, finalTargetMap, sourceShapes);
    polishCurves(false, finalTargetMap, sourceShapes, POLISH_CURVE_ANGLE_STEP);
    polishColors(sourceShapes);
  }
}

function runPolishStage2(mode, steps, sourceShapes = polishSourceShapes()) {
  const stemTipTargetMap = makeAngleTargetMap(currentShapes(), sourceShapes);
  for (let step = 0; step < steps; step += 1) {
    const targetMap = makePolishTargetMap(sourceShapes);
    if (mode === "all") {
      polishStage2Lengths(false, stemTipTargetMap, sourceShapes);
      polishStage2Positions(false, targetMap, sourceShapes);
      separateOverlaps(sourceShapes);
      polishStage2Angles(false, stemTipTargetMap, sourceShapes);
      polishCurves(false, stemTipTargetMap, sourceShapes, POLISH_STAGE2_CURVE_ANGLE_STEP);
    } else if (mode === "angles") {
      polishStage2Angles(false, stemTipTargetMap, sourceShapes);
    } else if (mode === "curve") {
      polishCurves(false, stemTipTargetMap, sourceShapes, POLISH_STAGE2_CURVE_ANGLE_STEP);
    } else if (mode === "size") {
      polishSize(false, sourceShapes, steps);
      break;
    } else if (mode === "positions") {
      polishStage2Positions(false, targetMap, sourceShapes);
      separateOverlaps(sourceShapes);
    } else if (mode === "lengths") {
      polishStage2Lengths(false, stemTipTargetMap, sourceShapes);
    } else if (mode === "colors") {
      polishColors(sourceShapes);
      break;
    }
  }
  if (mode === "positions") {
    snapPolishPositions(sourceShapes);
  }
  if (mode === "all") {
    const finalTargetMap = makeAngleTargetMap(currentShapes(), sourceShapes);
    polishStage2Angles(false, finalTargetMap, sourceShapes);
    polishCurves(false, finalTargetMap, sourceShapes, POLISH_STAGE2_CURVE_ANGLE_STEP);
    polishColors(sourceShapes);
  }
}

function snapPolishPositions(shapes = currentShapes()) {
  shapes.forEach((shape) => {
    const anchor = shapeAnchor(shape);
    const template = templates[shape.template];
    shape.x = snap(anchor.x) - template.anchor.x;
    shape.y = snap(anchor.y) - template.anchor.y;
  });
}

function polishSize(snapAfter = false, sourceShapes = polishSourceShapes(), steps = 1) {
  if (sourceShapes.length < 2) {
    return;
  }
  const currentRange = anchorYRange(sourceShapes);
  if (currentRange <= 0) {
    return;
  }
  const targetRange = originalAnchorHeightRange();
  const center = anchorCenter(sourceShapes);
  const scale = targetRange / currentRange;
  moveShapeAnchorsTowardScaledTargets(sourceShapes, center, scale, POLISH_SIZE_STEP, steps);
  if (snapAfter) {
    snapPolishPositions(sourceShapes);
  }
}

function originalAnchorHeightRange() {
  if (originalAnchorHeightCache !== null) {
    return originalAnchorHeightCache;
  }
  originalAnchorHeightCache = anchorYRange(originalMShapes());
  return originalAnchorHeightCache;
}

function originalHeadDiameter() {
  return headRadius(originalMShapes()[0]) * 2;
}

function minimumHeadDistance() {
  return originalHeadDiameter() + POLISH_HEAD_OVERLAP_MARGIN;
}

function anchorYRange(shapes) {
  const ys = shapes.map((shape) => shapeAnchor(shape).y);
  return Math.max(...ys) - Math.min(...ys);
}

function anchorCenter(shapes) {
  const anchors = shapes.map(shapeAnchor);
  return {
    x: anchors.reduce((sum, anchor) => sum + anchor.x, 0) / anchors.length,
    y: anchors.reduce((sum, anchor) => sum + anchor.y, 0) / anchors.length
  };
}

function scaledShapeAroundAnchorCenter(shape, center, scale) {
  const anchor = shapeAnchor(shape);
  const template = templates[shape.template];
  const scaledAnchor = {
    x: center.x + (anchor.x - center.x) * scale,
    y: center.y + (anchor.y - center.y) * scale
  };
  return {
    ...shape,
    x: scaledAnchor.x - template.anchor.x,
    y: scaledAnchor.y - template.anchor.y
  };
}

function scaleShapeAnchors(shapes, center, scale) {
  shapes.forEach((shape) => {
    const scaled = scaledShapeAroundAnchorCenter(shape, center, scale);
    shape.x = scaled.x;
    shape.y = scaled.y;
  });
}

function moveShapeAnchorsTowardScaledTargets(shapes, center, scale, maxStep, steps = 1) {
  const targets = shapes.map((shape) => ({
    shape,
    target: shapeAnchor(scaledShapeAroundAnchorCenter(shape, center, scale))
  }));
  const maxDistance = Math.max(...targets.map(({ shape, target }) => distance(shapeAnchor(shape), target)));
  if (maxDistance <= 0) {
    return;
  }
  const stepCount = clamp(Math.floor(steps), 1, 50);
  const fraction = Math.min(1, (maxStep * stepCount) / maxDistance);
  targets.forEach(({ shape, target }) => {
    const anchor = shapeAnchor(shape);
    const template = templates[shape.template];
    const nextAnchor = {
      x: anchor.x + (target.x - anchor.x) * fraction,
      y: anchor.y + (target.y - anchor.y) * fraction
    };
    shape.x = nextAnchor.x - template.anchor.x;
    shape.y = nextAnchor.y - template.anchor.y;
  });
}

function snapPolishAngles(shapes = currentShapes()) {
  shapes.forEach((shape) => {
    shape.angle = snapAngle(shape.angle);
  });
}

function polishStage2Positions(snapAfter = true, targetMap = makePolishTargetMap(), sourceShapes = polishSourceShapes()) {
  const deltas = new Map();
  const movableIds = scopedPolishIds(sourceShapes);
  sourceShapes.forEach((shape) => {
    if (!isStemPolishable(shape)) {
      return;
    }
    targetEntriesForShape(targetMap, shape).forEach((target) => {
      const endpoint = polishEndpointForTarget(shape, target);
      const arcCenter = endpoint.point;
      const targetCenter = shapeAnchor(target.shape);
      const axis = endpoint.axis;
      const offset = {
        x: targetCenter.x - arcCenter.x,
        y: targetCenter.y - arcCenter.y
      };
      const projectedDistance = dot(offset, axis);
      if (projectedDistance <= 0) {
        return;
      }

      const desiredProjection = originalStemDisplacement();
      const desiredTarget = addVector(arcCenter, axis, desiredProjection);
      const error = {
        x: desiredTarget.x - targetCenter.x,
        y: desiredTarget.y - targetCenter.y
      };
      const weights = polishMoveWeights(shape, target.shape);
      const targetWeight = weights.target;
      const sourceWeight = movableIds && !movableIds.has(target.shape.id) ? 1 : weights.source;
      addScopedPolishDelta(
        deltas,
        target.shape,
        error.x * POLISH_STAGE2_POSITION_FRACTION * targetWeight,
        error.y * POLISH_STAGE2_POSITION_FRACTION * targetWeight,
        movableIds
      );
      addScopedPolishDelta(
        deltas,
        shape,
        -error.x * POLISH_STAGE2_POSITION_FRACTION * sourceWeight,
        -error.y * POLISH_STAGE2_POSITION_FRACTION * sourceWeight,
        movableIds
      );
    });
  });
  applyPolishDeltas(deltas);
  if (snapAfter) {
    snapPolishPositions(sourceShapes);
  }
}

function polishStage2Angles(snapAfter = true, targetMap = makeAngleTargetMap(), sourceShapes = polishSourceShapes()) {
  sourceShapes.forEach((shape) => {
    if (!isStemPolishable(shape)) {
      return;
    }
    const targets = targetEntriesForShape(targetMap, shape);
    if (targets.length === 0) {
      return;
    }

    polishAngleForTargets(shape, targets, POLISH_STAGE2_MAX_ROTATION, POLISH_STAGE2_ROTATION_FRACTION);
  });
  if (snapAfter) {
    snapPolishAngles(sourceShapes);
  }
}

function polishStage2Lengths(snapAfter = true, targetMap = makeAngleTargetMap(), sourceShapes = polishSourceShapes()) {
  const targetGap = originalStemEndGap();
  sourceShapes.filter(isStemPolishable).forEach((shape) => {
    polishStemLengthToGap(shape, targetEntriesForShape(targetMap, shape), targetGap, POLISH_STAGE2_LENGTH_STEP);
  });
  if (snapAfter) {
    snapPolishLengths(sourceShapes);
  }
}

function preferredStage2Angle(angle) {
  const candidates = [];
  for (let candidate = 0; candidate < 360; candidate += POLISH_STAGE2_ANGLE_STEP) {
    const delta = Math.abs(shortestAngleDelta(angle, candidate));
    const axisBonus = candidate % 90 === 0 ? 5 : 0;
    candidates.push({ angle: candidate, score: delta - axisBonus });
  }
  candidates.sort((a, b) => a.score - b.score || Math.abs(shortestAngleDelta(angle, a.angle)) - Math.abs(shortestAngleDelta(angle, b.angle)));
  return candidates[0].angle;
}

function snapPolishStage2Angles() {
  currentShapes().filter(isStemPolishable).forEach((shape) => {
    const axisAngle = worldStemAxisAngle(shape);
    const guideAngle = preferredStage2Angle(axisAngle);
    const delta = shortestAngleDelta(axisAngle, guideAngle);
    if (Math.abs(delta) <= POLISH_STAGE2_GUIDE_THRESHOLD) {
      shape.angle = normalizeAngle(shape.angle + delta);
    }
  });
}

function polishPositions(snapAfter = true, targetMap = makePolishTargetMap(), sourceShapes = polishSourceShapes()) {
  const deltas = new Map();
  const movableIds = scopedPolishIds(sourceShapes);
  sourceShapes.forEach((shape) => {
    if (!isStemPolishable(shape)) {
      return;
    }
    const targets = targetEntriesForShape(targetMap, shape);
    if (targets.length === 0) {
      return;
    }

    targets.forEach((target) => {
      const targetCenter = shapeAnchor(target.shape);
      const endpoint = polishEndpointForTarget(shape, target);
      const desiredTarget = addVector(endpoint.point, endpoint.axis, originalStemDisplacement());
      const error = {
        x: desiredTarget.x - targetCenter.x,
        y: desiredTarget.y - targetCenter.y
      };
      const weights = polishMoveWeights(shape, target.shape);
      const targetWeight = weights.target;
      const sourceWeight = movableIds && !movableIds.has(target.shape.id) ? 1 : weights.source;
      addScopedPolishDelta(
        deltas,
        target.shape,
        error.x * POLISH_POSITION_FRACTION * targetWeight,
        error.y * POLISH_POSITION_FRACTION * targetWeight,
        movableIds
      );
      addScopedPolishDelta(
        deltas,
        shape,
        -error.x * POLISH_POSITION_FRACTION * sourceWeight,
        -error.y * POLISH_POSITION_FRACTION * sourceWeight,
        movableIds
      );
    });
  });
  applyPolishDeltas(deltas);
  if (snapAfter) {
    snapPolishPositions(sourceShapes);
  }
}

function polishMoveWeights(source, target) {
  if (!isLollipop(target)) {
    return { source: 0.05, target: 0.95 };
  }
  return { source: 0.25, target: 0.75 };
}

function polishAngles(snapAfter = true, targetMap = makeAngleTargetMap(), sourceShapes = polishSourceShapes()) {
  sourceShapes.forEach((shape) => {
    if (!isStemPolishable(shape)) {
      return;
    }
    const targets = targetEntriesForShape(targetMap, shape);
    if (targets.length === 0) {
      return;
    }

    polishAngleForTargets(shape, targets, POLISH_MAX_ROTATION, POLISH_ROTATION_FRACTION);
  });
  if (snapAfter) {
    snapPolishAngles(sourceShapes);
  }
}

function averageAngleDeltaForTargets(shape, targets) {
  if (targets.length === 0) {
    return 0;
  }
  const total = targets.reduce((sum, target) => {
    return sum + angleDeltaForTarget(shape, target);
  }, 0);
  return total / targets.length;
}

function polishAngleForTargets(shape, targets, maxRotation, fraction) {
  if (isCurvedStem(shape)) {
    polishCurvedStemRotation(shape, targets, maxRotation);
    return;
  }
  const delta = averageAngleDeltaForTargets(shape, targets);
  const limited = clamp(delta * fraction, -maxRotation, maxRotation);
  shape.angle = normalizeAngle(shape.angle + limited);
}

function polishCurvedStemRotation(shape, targets, maxRotation) {
  const current = shape.angle;
  let bestAngle = current;
  const curveStartOffset = curvedStemStartOffset(shape);
  const curveEndOffset = curvedStemEndOffset(shape);
  let bestScore = curvedStemFullAngleScore(shape, targets, current, curveStartOffset, curveEndOffset);
  const samples = 24;
  for (let index = 0; index <= samples; index += 1) {
    const candidateAngle = normalizeAngle(current - maxRotation + (2 * maxRotation * index / samples));
    const score = curvedStemFullAngleScore(shape, targets, candidateAngle, curveStartOffset, curveEndOffset);
    if (score < bestScore) {
      bestScore = score;
      bestAngle = candidateAngle;
    }
  }
  shape.angle = bestAngle;
}

function angleDeltaForTarget(shape, target) {
  if (isCurvedStem(shape)) {
    const endpoint = polishEndpointForTarget(shape, target);
    const targetCenter = shapeAnchor(target.shape);
    const currentEndpointAngle = vectorAngle(endpoint.axis);
    const targetAxisAngle = pointAngle(endpoint.point, targetCenter);
    return shortestAngleDelta(currentEndpointAngle, targetAxisAngle);
  }

  const targetCenter = shapeAnchor(target.shape);
  const currentAxisAngle = worldStemAxisAngle(shape);
  const targetAxisAngle = targetAxisAngleForShape(shape, targetCenter, target.endSign);
  return shortestAngleDelta(currentAxisAngle, targetAxisAngle);
}

function polishCurves(snapAfter = true, targetMap = makeAngleTargetMap(), sourceShapes = polishSourceShapes(), stepLimit = POLISH_CURVE_ANGLE_STEP) {
  sourceShapes.filter(isCurvedShape).forEach((shape) => {
    const targets = targetEntriesForShape(targetMap, shape);
    if (targets.length === 0) {
      return;
    }
    polishCurvedStemBendAngles(shape, targets, stepLimit);
  });
  if (snapAfter) {
    snapPolishCurves(sourceShapes);
  }
}

function snapPolishCurves(shapes = currentShapes()) {
  shapes.filter(isCurvedShape).forEach((shape) => {
    shape.curveStartOffset = normalizeCurveEndpointOffset(snap(curvedStemStartOffset(shape)));
    shape.curveEndOffset = normalizeCurveEndpointOffset(snap(curvedStemEndOffset(shape)));
    shape.curveStartPull = normalizeCurvePull(snap(curvedStemStartPull(shape)), shape.template, shape.stemOffset);
    shape.curveEndPull = normalizeCurvePull(snap(curvedStemEndPull(shape)), shape.template, shape.stemOffset);
    shape.curveOffset = normalizeCurveOffset((shape.curveStartOffset + shape.curveEndOffset) / 2, shape.template);
  });
}

function polishCurvedStemBendAngles(shape, targets, stepLimit) {
  if (!isCurvedShape(shape) || targets.length === 0) {
    return;
  }
  const currentStart = curvedStemStartOffset(shape);
  const currentEnd = curvedStemEndOffset(shape);
  const startMin = normalizeCurveEndpointOffset(currentStart - stepLimit);
  const startMax = normalizeCurveEndpointOffset(currentStart + stepLimit);
  const endMin = normalizeCurveEndpointOffset(currentEnd - stepLimit);
  const endMax = normalizeCurveEndpointOffset(currentEnd + stepLimit);
  let bestStart = currentStart;
  let bestEnd = currentEnd;
  let bestScore = curvedStemAngleScore(shape, targets, currentStart, currentEnd);
  const samples = 18;
  for (let startIndex = 0; startIndex <= samples; startIndex += 1) {
    const candidateStart = startMin + (startMax - startMin) * (startIndex / samples);
    for (let endIndex = 0; endIndex <= samples; endIndex += 1) {
      const candidateEnd = endMin + (endMax - endMin) * (endIndex / samples);
      const score = curvedStemAngleScore(shape, targets, candidateStart, candidateEnd);
      if (score < bestScore) {
        bestScore = score;
        bestStart = candidateStart;
        bestEnd = candidateEnd;
      }
    }
  }
  shape.curveStartOffset = normalizeCurveEndpointOffset(bestStart);
  shape.curveEndOffset = normalizeCurveEndpointOffset(bestEnd);
  shape.curveOffset = normalizeCurveOffset((shape.curveStartOffset + shape.curveEndOffset) / 2, shape.template);
}

function curvedStemAngleScore(shape, targets, curveStartOffset, curveEndOffset) {
  return curvedStemFullAngleScore(shape, targets, shape.angle, curveStartOffset, curveEndOffset);
}

function curvedStemFullAngleScore(shape, targets, angle, curveStartOffset, curveEndOffset = curveStartOffset) {
  const candidateShape = {
    ...shape,
    angle,
    curveOffset: (curveStartOffset + curveEndOffset) / 2,
    curveStartOffset,
    curveEndOffset
  };
  return targets.reduce((sum, target) => {
    const delta = angleDeltaForTarget(candidateShape, target);
    return sum + delta * delta;
  }, 0);
}

function polishLengths(snapAfter = true, targetMap = makeAngleTargetMap(), sourceShapes = polishSourceShapes()) {
  const targetGap = originalStemEndGap();
  sourceShapes.forEach((shape) => {
    if (!isStemPolishable(shape)) {
      return;
    }
    polishStemLengthToGap(shape, targetEntriesForShape(targetMap, shape), targetGap, POLISH_LENGTH_STEP);
  });
  if (snapAfter) {
    snapPolishLengths(sourceShapes);
  }
}

function polishStemLengthToGap(shape, targets, targetGap, stepLimit) {
  const targetList = Array.isArray(targets) ? targets : [targets].filter(Boolean);
  if (targetList.length === 0) {
    return;
  }
  if (isDoubleStem(shape)) {
    polishDoubleStemLengthToTargets(shape, targetList, targetGap, stepLimit);
    return;
  }
  polishSingleStemLengthToGap(shape, targetList[0], targetGap, stepLimit);
}

function polishSingleStemLengthToGap(shape, target, targetGap, stepLimit) {
  const baseTail = worldStemArcCenter(shape, 0);
  const axis = worldStemAxis(shape);
  const targetCenter = shapeAnchor(target.shape);
  const targetOffset = {
    x: targetCenter.x - baseTail.x,
    y: targetCenter.y - baseTail.y
  };
  const projection = dot(targetOffset, axis);
  const perpendicularSq = Math.max(0, dot(targetOffset, targetOffset) - projection * projection);
  const current = normalizeStemOffset(shape.stemOffset, shape.template);
  let desired = projection;
  if (perpendicularSq <= targetGap * targetGap) {
    desired = projection - Math.sqrt(targetGap * targetGap - perpendicularSq);
  }
  const step = clamp(desired - current, -stepLimit, stepLimit);
  shape.stemOffset = normalizeStemOffset(current + step, shape.template);
}

function polishDoubleStemLengthToTargets(shape, targets, targetGap, stepLimit) {
  const current = normalizeStemOffset(shape.stemOffset, shape.template);
  const min = Math.max(stemMinimumForTemplate(shape.template), current - stepLimit);
  const max = Math.min(STEM_MAX, current + stepLimit);
  let bestOffset = current;
  let bestScore = doubleStemLengthScore(shape, targets, targetGap, current);
  const samples = 24;
  for (let index = 0; index <= samples; index += 1) {
    const candidateOffset = min + (max - min) * (index / samples);
    const score = doubleStemLengthScore(shape, targets, targetGap, candidateOffset);
    if (score < bestScore) {
      bestScore = score;
      bestOffset = candidateOffset;
    }
  }
  shape.stemOffset = normalizeStemOffset(bestOffset, shape.template);
}

function doubleStemLengthScore(shape, targets, targetGap, offset) {
  return targets.reduce((sum, target) => {
    const endpoint = doubleStemArcCenterPointForOffset(shape, target.endSign || 1, offset);
    return sum + Math.abs(distance(endpoint, shapeAnchor(target.shape)) - targetGap);
  }, 0);
}

function doubleStemArcCenterPointForOffset(shape, endSign, offset) {
  const offsetShape = { ...shape, stemOffset: offset };
  if (isCurvedStem(shape)) {
    return transformShapePoint(curvedStemLocalArcCenter(offsetShape, endSign, offset), offsetShape);
  }
  const template = templates[shape.template];
  const distanceFromAnchor = doubleStemHalfLengthForOffset(offsetShape, offset) + doubleStemArcCenterOffset(template);
  return transformShapePoint(addVector(template.anchor, template.geometry.axis, endSign * distanceFromAnchor), offsetShape);
}

function snapPolishLengths(shapes = currentShapes()) {
  shapes.filter(isLengthEditable).forEach((shape) => {
    shape.stemOffset = snapStem(shape.stemOffset, shape.template);
  });
}

function separateOverlaps(sourceShapes = currentShapes()) {
  const shapes = currentShapes();
  const deltas = new Map();
  const movableIds = scopedPolishIds(sourceShapes);

  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      addHeadOverlapDelta(deltas, shapes[i], shapes[j], movableIds);
    }
  }

  applyPolishDeltas(deltas);
}

function addHeadOverlapDelta(deltas, a, b, movableIds = null) {
  const centerA = shapeAnchor(a);
  const centerB = shapeAnchor(b);
  const delta = {
    x: centerB.x - centerA.x,
    y: centerB.y - centerA.y
  };
  const d = Math.hypot(delta.x, delta.y);
  const minDistance = minimumHeadDistance();
  if (d >= minDistance) {
    return;
  }

  const push = (minDistance - d) * POLISH_OVERLAP_FRACTION;
  const unit = d === 0
    ? deterministicSeparationUnit(a, b)
    : { x: delta.x / d, y: delta.y / d };
  if (!movableIds) {
    addPolishDelta(deltas, a, -unit.x * push * 0.5, -unit.y * push * 0.5);
    addPolishDelta(deltas, b, unit.x * push * 0.5, unit.y * push * 0.5);
    return;
  }

  const aMovable = movableIds.has(a.id);
  const bMovable = movableIds.has(b.id);
  if (!aMovable && !bMovable) {
    return;
  }
  if (aMovable && bMovable) {
    addPolishDelta(deltas, a, -unit.x * push * 0.5, -unit.y * push * 0.5);
    addPolishDelta(deltas, b, unit.x * push * 0.5, unit.y * push * 0.5);
    return;
  }
  if (aMovable) {
    addPolishDelta(deltas, a, -unit.x * push, -unit.y * push);
  } else {
    addPolishDelta(deltas, b, unit.x * push, unit.y * push);
  }
}

function deterministicSeparationUnit(a, b) {
  const seed = `${a.id}:${b.id}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const angle = (hash % 360) * Math.PI / 180;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function scopedPolishIds(sourceShapes) {
  return sourceShapes.length === currentShapes().length ? null : new Set(sourceShapes.map((shape) => shape.id));
}

function addScopedPolishDelta(deltas, shape, dx, dy, movableIds = null) {
  if (movableIds && !movableIds.has(shape.id)) {
    return;
  }
  addPolishDelta(deltas, shape, dx, dy);
}

function addPolishDelta(deltas, shape, dx, dy) {
  const existing = deltas.get(shape.id) || { shape, x: 0, y: 0, count: 0 };
  existing.x += dx;
  existing.y += dy;
  existing.count += 1;
  deltas.set(shape.id, existing);
}

function applyPolishDeltas(deltas) {
  deltas.forEach((entry) => {
    entry.shape.x += entry.x / Math.max(1, entry.count);
    entry.shape.y += entry.y / Math.max(1, entry.count);
  });
}

function originalStemDisplacement() {
  if (originalStemDisplacementCache !== null) {
    return originalStemDisplacementCache;
  }

  const original = originalMShapes();
  const displacements = original
    .filter(isLollipop)
    .map((shape) => {
      const target = polishTargetForShape(shape, original);
      if (!target) {
        return null;
      }
      const axis = worldStemAxis(shape);
      const arcCenter = worldStemArcCenter(shape);
      return dot({
        x: target.center.x - arcCenter.x,
        y: target.center.y - arcCenter.y
      }, axis);
    })
    .filter((value) => value !== null);
  if (displacements.length === 0) {
    throw new Error("Could not compute original stem displacement.");
  }
  displacements.sort((a, b) => a - b);
  originalStemDisplacementCache = displacements[Math.floor(displacements.length / 2)];
  return originalStemDisplacementCache;
}

function originalStemEndGap() {
  if (originalStemEndGapCache !== null) {
    return originalStemEndGapCache;
  }

  const original = originalMShapes();
  const gaps = original
    .filter(isLollipop)
    .map((shape) => {
      const target = polishTargetForShape(shape, original);
      return target ? distance(worldStemArcCenter(shape), target.center) : null;
    })
    .filter((value) => value !== null);
  if (gaps.length === 0) {
    throw new Error("Could not compute original stem-end gap.");
  }
  gaps.sort((a, b) => a - b);
  originalStemEndGapCache = gaps[Math.floor(gaps.length / 2)];
  return originalStemEndGapCache;
}

function makePolishTargetMap(sourceShapes = currentShapes(), shapes = currentShapes()) {
  const targets = new Map();
  sourceShapes.filter(isStemPolishable).forEach((shape) => {
    const shapeTargets = isDoubleStem(shape)
      ? nearestStemEndpointTargets(shape, shapes)
      : [polishTargetForShape(shape, shapes)].filter(Boolean);
    if (shapeTargets.length > 0) {
      targets.set(shape.id, shapeTargets);
    }
  });
  return targets;
}

function makeAngleTargetMap(shapes = currentShapes(), sourceShapes = shapes) {
  const targets = new Map();
  sourceShapes.filter(isStemPolishable).forEach((shape) => {
    const shapeTargets = nearestStemEndpointTargets(shape, shapes);
    if (shapeTargets.length > 0) {
      targets.set(shape.id, shapeTargets);
    }
  });
  return targets;
}

function polishColors(sourceShapes = currentShapes()) {
  const shapes = currentShapes();
  if (sourceShapes.length === 0) {
    return;
  }

  const styleIds = styles.map((style) => style.id);
  const targetMap = makePolishTargetMap(sourceShapes, shapes);
  const adjacency = colorAdjacency(shapes, targetMap);
  const sourceIds = new Set(sourceShapes.map((shape) => shape.id));
  const isScoped = sourceShapes.length !== shapes.length;
  const usage = Object.fromEntries(styleIds.map((id) => [
    id,
    isScoped ? shapes.filter((shape) => !sourceIds.has(shape.id) && shape.style === id).length : 0
  ]));

  if (!isScoped) {
    shapes.forEach((shape) => {
      shape.style = styleIds[0];
    });
  }

  sourceShapes
    .slice()
    .sort((a, b) => (adjacency.get(b.id)?.size || 0) - (adjacency.get(a.id)?.size || 0))
    .forEach((shape) => {
      const neighborColors = new Set(
        [...(adjacency.get(shape.id) || [])]
          .map((id) => shapes.find((candidate) => candidate.id === id)?.style)
          .filter(Boolean)
      );
      const bestStyle = styleIds
        .map((styleId) => ({
          styleId,
          score: usage[styleId] * 3 + (neighborColors.has(styleId) ? 100 : 0)
        }))
        .sort((a, b) => a.score - b.score || styleIds.indexOf(a.styleId) - styleIds.indexOf(b.styleId))[0].styleId;
      shape.style = bestStyle;
      usage[bestStyle] += 1;
    });
}

function colorAdjacency(shapes, targetMap) {
  const adjacency = new Map(shapes.map((shape) => [shape.id, new Set()]));

  targetMap.forEach((entry, shapeId) => {
    const targets = Array.isArray(entry) ? entry : [entry];
    targets.forEach((target) => addAdjacency(adjacency, shapeId, target.shape.id));
  });

  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const distanceBetweenHeads = distance(shapeAnchor(shapes[i]), shapeAnchor(shapes[j]));
      if (distanceBetweenHeads < minimumHeadDistance() * 1.1) {
        addAdjacency(adjacency, shapes[i].id, shapes[j].id);
      }
    }
  }

  return adjacency;
}

function addAdjacency(adjacency, a, b) {
  adjacency.get(a)?.add(b);
  adjacency.get(b)?.add(a);
}

function polishTargetForShape(shape, shapes) {
  const origin = worldStemArcCenter(shape);
  const axis = worldStemAxis(shape);
  const expectedDisplacement = originalStemDisplacementCache ?? DEFAULT_STEM_DISPLACEMENT;
  let best = null;
  let bestScore = Infinity;
  shapes.forEach((candidate) => {
    if (candidate.id === shape.id) {
      return;
    }
    const center = shapeAnchor(candidate);
    const offset = {
      x: center.x - origin.x,
      y: center.y - origin.y
    };
    const projection = dot(offset, axis);
    const perpendicular = Math.sqrt(Math.max(0, dot(offset, offset) - projection * projection));
    const behindPenalty = projection < 0 ? Math.abs(projection) * 8 : 0;
    const displacementPenalty = Math.abs(projection - expectedDisplacement) * 0.9;
    const score = perpendicular * 1.35 + displacementPenalty + behindPenalty + distance(origin, center) * 0.004;
    if (score < bestScore) {
      best = { shape: candidate, center, projection, perpendicular };
      bestScore = score;
    }
  });
  return best;
}

function nearestHeadToStemTip(shape, shapes) {
  const stemTip = worldStemArcCenter(shape);
  let best = null;
  let bestDistance = Infinity;
  shapes.forEach((candidate) => {
    if (candidate.id === shape.id) {
      return;
    }
    const center = shapeAnchor(candidate);
    const candidateDistance = distance(stemTip, center);
    if (candidateDistance < bestDistance) {
      best = { shape: candidate, center, distance: candidateDistance };
      bestDistance = candidateDistance;
    }
  });
  return best;
}

function targetEntriesForShape(targetMap, shape) {
  const entry = targetMap.get(shape.id);
  if (!entry) {
    return [];
  }
  return Array.isArray(entry) ? entry : [entry];
}

function nearestStemEndpointTargets(shape, shapes) {
  const endpoints = polishEndpointsForShape(shape);
  const usedTargetIds = new Set();
  return endpoints
    .map((endpoint) => nearestTargetForEndpoint(shape, endpoint, shapes, usedTargetIds))
    .filter(Boolean);
}

function nearestTargetForEndpoint(shape, endpoint, shapes, usedTargetIds) {
  const candidates = shapes
    .filter((candidate) => candidate.id !== shape.id)
    .map((candidate) => ({
      shape: candidate,
      center: shapeAnchor(candidate),
      distance: distance(endpoint.point, shapeAnchor(candidate)),
      endSign: endpoint.endSign
    }))
    .sort((a, b) => a.distance - b.distance);
  if (candidates.length === 0) {
    return null;
  }
  const preferred = candidates.find((candidate) => !usedTargetIds.has(candidate.shape.id)) || candidates[0];
  usedTargetIds.add(preferred.shape.id);
  return preferred;
}

function polishEndpointsForShape(shape) {
  if (isLollipop(shape)) {
    return [{
      point: worldStemArcCenter(shape),
      axis: worldStemAxis(shape),
      endSign: 1
    }];
  }
  if (isDoubleStem(shape)) {
    return [-1, 1].map((endSign) => ({
      point: doubleStemArcCenterPoint(shape, endSign),
      axis: doubleStemEndpointAxis(shape, endSign),
      endSign
    }));
  }
  return [];
}

function polishEndpointForTarget(shape, target) {
  if (isDoubleStem(shape)) {
    const endSign = target?.endSign || 1;
    return {
      point: doubleStemArcCenterPoint(shape, endSign),
      axis: doubleStemEndpointAxis(shape, endSign),
      endSign
    };
  }
  return {
    point: worldStemArcCenter(shape),
    axis: worldStemAxis(shape),
    endSign: 1
  };
}

function doubleStemEndpointAxis(shape, endSign = 1) {
  if (isCurvedStem(shape)) {
    const t = endSign === 1 ? 1 : 0;
    const localTangent = curvedStemLocalTangent(shape, t);
    return transformShapeVector(multiplyVector(localTangent, endSign), shape);
  }
  return multiplyVector(worldStemAxis(shape), endSign);
}

function targetAxisAngleForShape(shape, targetCenter, endSign = 1) {
  const anchor = shapeAnchor(shape);
  const angle = pointAngle(anchor, targetCenter);
  return isDoubleStem(shape) && endSign === -1 ? normalizeAngle(angle + 180) : angle;
}

function transformShapeVector(vector, shape) {
  const radians = shape.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

function vectorAngle(vector) {
  return normalizeAngle(Math.atan2(vector.y, vector.x) * 180 / Math.PI);
}

function worldStemArcCenter(shape, offset = shape.stemOffset) {
  if (isCurvedLollipop(shape)) {
    return transformShapePoint(curvedStemLocalArcCenter(shape, 1, offset), shape);
  }
  const geometry = templates[shape.template].geometry;
  return transformShapePoint(addVector(geometry.tailArcCenter, geometry.axis, normalizeStemOffset(offset, shape.template)), shape);
}

function worldStemAxis(shape) {
  if (isCurvedLollipop(shape)) {
    return transformShapeVector(curvedStemLocalTangent(shape, 1), shape);
  }
  const localAxis = templates[shape.template].geometry.axis;
  const radians = shape.angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: localAxis.x * cos - localAxis.y * sin,
    y: localAxis.x * sin + localAxis.y * cos
  };
}

function worldStemAxisAngle(shape) {
  const axis = worldStemAxis(shape);
  return normalizeAngle(Math.atan2(axis.y, axis.x) * 180 / Math.PI);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function selectShapesInRect(start, end) {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  state.selectedIds.clear();
  currentShapes().forEach((shape) => {
    const anchor = shapeAnchor(shape);
    if (anchor.x >= minX && anchor.x <= maxX && anchor.y >= minY && anchor.y <= maxY) {
      state.selectedIds.add(shape.id);
    }
  });
}

function updateSelectionBox(start, current) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  els.selectionBox.hidden = false;
  els.selectionBox.setAttribute("x", x);
  els.selectionBox.setAttribute("y", y);
  els.selectionBox.setAttribute("width", width);
  els.selectionBox.setAttribute("height", height);
}

function hideSelectionBox() {
  els.selectionBox.hidden = true;
  els.selectionBox.setAttribute("width", 0);
  els.selectionBox.setAttribute("height", 0);
}

function switchLetter(letter, variantIndex = null) {
  state.activeLetter = letter;
  if (variantIndex !== null) {
    const entry = letterState(letter);
    entry.activeVariant = clamp(Math.floor(variantIndex), 0, entry.variants.length - 1);
  }
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function switchVariant(index) {
  const entry = letterState(state.activeLetter);
  if (!Number.isFinite(index)) {
    return;
  }
  entry.activeVariant = clamp(Math.floor(index), 0, entry.variants.length - 1);
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function switchAllLettersToVariant(index) {
  if (!Number.isFinite(index)) {
    return;
  }
  const targetIndex = clamp(Math.floor(index), 0, 2);
  LETTERS.forEach((letter) => {
    ensureVariant(letter, targetIndex);
    letterState(letter).activeVariant = targetIndex;
  });
  state.selectedIds.clear();
  saveState(`Variant ${targetIndex + 1}`);
  renderAll();
}

function addVariant() {
  const entry = letterState(state.activeLetter);
  entry.variants.push([]);
  entry.activeVariant = entry.variants.length - 1;
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function duplicateVariant() {
  const entry = letterState(state.activeLetter);
  const copy = cloneShapes(entry.variants[entry.activeVariant]);
  entry.variants.push(copy);
  entry.activeVariant = entry.variants.length - 1;
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function deleteVariant() {
  const entry = letterState(state.activeLetter);
  if (entry.variants.length === 1) {
    entry.variants[0] = [];
    entry.activeVariant = 0;
  } else {
    entry.variants.splice(entry.activeVariant, 1);
    entry.activeVariant = clamp(entry.activeVariant, 0, entry.variants.length - 1);
  }
  state.selectedIds.clear();
  saveState();
  renderAll();
}

function cloneShapes(shapes) {
  return shapes.map((shape) => ({
    ...shape,
    id: makeId()
  }));
}

function resetView() {
  state.view = { x: -200, y: -200, width: 6400, height: 5200 };
  updateViewBox();
}

function zoomAt(point, factor) {
  const current = state.view;
  const nextWidth = clamp(current.width * factor, 360, MAX_VIEW.width);
  const nextHeight = clamp(current.height * factor, 292, MAX_VIEW.height);
  const widthFactor = nextWidth / current.width;
  const heightFactor = nextHeight / current.height;
  state.view = {
    x: point.x - (point.x - current.x) * widthFactor,
    y: point.y - (point.y - current.y) * heightFactor,
    width: nextWidth,
    height: nextHeight
  };
  updateViewBox();
}

function panView(deltaX, deltaY) {
  const xScale = state.view.width / els.stage.clientWidth;
  const yScale = state.view.height / els.stage.clientHeight;
  state.view = {
    ...state.view,
    x: state.view.x + deltaX * xScale,
    y: state.view.y + deltaY * yScale
  };
  updateViewBox();
}

function updateViewBox() {
  const view = state.view;
  els.stage.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  if (els.guideLayer && state.alignmentGuides.length > 0) {
    renderAlignmentGuides();
  }
}

function svgPoint(event) {
  const point = els.stage.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(els.stage.getScreenCTM().inverse());
}

function snap(value) {
  return Math.round(value / state.gridSize) * state.gridSize;
}

function snapStem(value, templateId = null) {
  const min = stemMinimumForTemplate(templateId);
  return clamp(Math.round(value / state.gridSize) * state.gridSize, min, STEM_MAX);
}

function snapAngle(value) {
  return normalizeAngle(Math.round(value / state.angleStep) * state.angleStep);
}

function normalizeAngle(value) {
  return ((value % 360) + 360) % 360;
}

function roundForInput(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pointAngle(center, point) {
  return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;
}

function statePayload() {
  return {
    version: 1,
    activeLetter: state.activeLetter,
    gridSize: state.gridSize,
    angleStep: state.angleStep,
    polishIterations: state.polishIterations,
    polishStage: state.polishStage,
    letters: state.letters
  };
}

function saveState(label = "Edit", record = true) {
  const payload = statePayload();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (record) {
    recordHistory(label, payload);
  }
}

function initializeHistory(label) {
  historyState.entries = [];
  historyState.index = -1;
  recordHistory(label, statePayload());
}

function recordHistory(label, payload = statePayload()) {
  const json = JSON.stringify(payload);
  if (historyState.index >= 0 && historyState.entries[historyState.index].json === json) {
    renderHistoryControls();
    return;
  }

  historyState.entries = historyState.entries.slice(0, historyState.index + 1);
  historyState.entries.push({
    label,
    json,
    timestamp: new Date().toLocaleTimeString()
  });
  if (historyState.entries.length > historyState.max) {
    historyState.entries.shift();
  }
  historyState.index = historyState.entries.length - 1;
  renderHistoryControls();
}

function undoHistory() {
  if (historyState.index <= 0) {
    return;
  }
  historyState.index -= 1;
  applyHistoryEntry(historyState.entries[historyState.index]);
}

function redoHistory() {
  if (historyState.index >= historyState.entries.length - 1) {
    return;
  }
  historyState.index += 1;
  applyHistoryEntry(historyState.entries[historyState.index]);
}

function jumpToHistory(index) {
  if (!Number.isFinite(index) || index < 0 || index >= historyState.entries.length) {
    return;
  }
  historyState.index = Math.floor(index);
  applyHistoryEntry(historyState.entries[historyState.index]);
}

function applyHistoryEntry(entry) {
  const previousSelectedIds = new Set(state.selectedIds);
  applyPayload(JSON.parse(entry.json));
  restoreSelectionById(previousSelectedIds);
  localStorage.setItem(STORAGE_KEY, entry.json);
  renderGrid();
  renderAll();
}

function applyPayload(parsed) {
  state.letters = makeEmptyLetters();
  LETTERS.forEach((letter) => {
    state.letters[letter] = normalizeLetterState(parsed.letters?.[letter]);
  });
  state.activeLetter = LETTERS.includes(parsed.activeLetter) ? parsed.activeLetter : "A";
  state.gridSize = Number.isFinite(parsed.gridSize) ? parsed.gridSize : 25;
  state.angleStep = Number.isFinite(parsed.angleStep) ? parsed.angleStep : 5;
  state.polishIterations = Number.isFinite(parsed.polishIterations)
    ? clamp(Math.floor(parsed.polishIterations), 1, 50)
    : 50;
  state.polishStage = Number.isFinite(parsed.polishStage)
    ? clamp(Math.floor(parsed.polishStage), 1, 2)
    : 1;
  state.selectedIds.clear();
}

function restoreSelectionById(selectedIds) {
  const availableIds = new Set(currentShapes().map((shape) => shape.id));
  state.selectedIds = new Set([...selectedIds].filter((id) => availableIds.has(id)));
}

function renderHistoryControls() {
  if (!els.historyJump) {
    return;
  }

  els.undoAction.disabled = historyState.index <= 0;
  els.redoAction.disabled = historyState.index >= historyState.entries.length - 1;
  els.historyJump.replaceChildren();
  historyState.entries.forEach((entry, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${index + 1}. ${entry.label} ${entry.timestamp}`;
    els.historyJump.appendChild(option);
  });
  els.historyJump.value = String(historyState.index);
}

function resetAppState() {
  state.activeLetter = "M";
  state.letters = defaultLetters();
  state.selectedIds.clear();
  state.activeTemplate = "lollipop-long";
  state.activeStyle = "purple";
  state.gridSize = 25;
  state.angleStep = 5;
  state.polishIterations = 50;
  state.polishStage = 1;
  resetView();
  renderGrid();
  saveState("Reset");
  renderAll();
}

function exportJson() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    artboard: ARTBOARD,
    templates: Object.fromEntries(Object.entries(templates).map(([id, template]) => [
      id,
      { label: template.label, path: template.path, anchor: template.anchor, geometry: template.geometry }
    ])),
    styles: styles.map(({ id, label }) => ({ id, label })),
    letters: state.letters
  };
  downloadText("motrpac-alphabet-config.json", JSON.stringify(payload, null, 2), "application/json");
}

async function copyCurrentLetterVariantJson() {
  const payload = currentLetterVariantPayload();
  await writeClipboardText(JSON.stringify(payload, null, 2));
  flashButtonLabel(els.copyCurrentJson, "Copied");
}

function currentLetterVariantPayload() {
  const letter = state.activeLetter;
  const variantIndex = activeVariantIndex(letter);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    letter,
    variantIndex,
    variantLabel: `Variant ${variantIndex + 1}`,
    artboard: ARTBOARD,
    shapes: cloneShapesForExport(letterShapes(letter))
  };
}

function cloneShapesForExport(shapes) {
  return shapes.map((shape) => ({
    id: shape.id,
    template: shape.template,
    style: shape.style,
    x: shape.x,
    y: shape.y,
    angle: shape.angle,
    stemOffset: shape.stemOffset,
    stemSeedAngle: shape.stemSeedAngle,
    curveOffset: shape.curveOffset,
    curveStartOffset: shape.curveStartOffset,
    curveEndOffset: shape.curveEndOffset,
    curveStartPull: shape.curveStartPull,
    curveEndPull: shape.curveEndPull,
    lastLollipopTemplate: shape.lastLollipopTemplate
  }));
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function flashButtonLabel(button, label) {
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const parsed = JSON.parse(reader.result);
    if (!parsed.letters) {
      throw new Error("Imported file does not contain letters.");
    }
    state.letters = makeEmptyLetters();
    LETTERS.forEach((letter) => {
      state.letters[letter] = normalizeLetterState(parsed.letters[letter]);
    });
    state.selectedIds.clear();
    saveState();
    renderAll();
  });
  reader.readAsText(file);
  event.target.value = "";
}

function exportSvg(letter, variantIndex = activeVariantIndex(letter)) {
  const suffix = letterVariantCount(letter) > 1 ? `-v${variantIndex + 1}` : "";
  downloadText(`motrpac-${letter}${suffix}.svg`, svgForLetter(letter, variantIndex), "image/svg+xml");
}

function exportAllSvg() {
  const jobs = LETTERS.flatMap((letter) => (
    letterState(letter).variants.map((_, variantIndex) => ({ letter, variantIndex }))
  ));
  jobs.forEach((job, index) => {
    setTimeout(() => exportSvg(job.letter, job.variantIndex), index * 120);
  });
}

function svgForLetter(letter, variantIndex = activeVariantIndex(letter)) {
  const entry = letterState(letter);
  const shapes = entry.variants[variantIndex] || [];
  const paths = shapes.map((shape) => {
    const style = styleById(shape.style);
    return `  <g transform="${shapeTransform(shape)}">\n    <path d="${shapePath(shape)}" fill="${style.fill}" stroke="#17202a" stroke-width="3" vector-effect="non-scaling-stroke"></path>\n  </g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ARTBOARD.width}" height="${ARTBOARD.height}" viewBox="0 0 ${ARTBOARD.width} ${ARTBOARD.height}">
  <defs>${svgDefsMarkup()}</defs>
${paths}
</svg>
`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Font outlines come from the same paths and transforms as SVG export. Native
// SVG sampling avoids a second implementation of the editor's arc geometry.
function fontLetterContours() {
  const selected = LETTERS.map(letter => ({ letter, shapes: letterShapes(letter) })).filter(entry => entry.shapes.length);
  if (!selected.length) throw new Error("There are no shapes in the selected alphabet variants.");
  const maxHeight = Math.max(...selected.map(entry => {
    const bounds = trimmedLetterBounds(entry.shapes);
    if (!bounds) throw new Error(`${entry.letter} has no outline bounds.`);
    return bounds.height;
  }));
  const samplingScale = 1600 / maxHeight;
  return selected.map(({ letter, shapes }) => ({
    letter,
    layers: shapes.map((/** @type {Parameters<typeof shapePath>[0]} */ shape) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", shapePath(shape));
      const length = path.getTotalLength();
      if (!(length > 0)) throw new Error(`${letter} contains a shape with no outline.`);
      const points = /** @type {{x:number, y:number}[]} */ ([]);
      const tolerance = 0.35 / samplingScale;
      /** @param {number} offset */
      const sample = offset => path.getPointAtLength(offset);
      /** @param {number} a @param {number} b @param {DOMPoint} p @param {DOMPoint} q @param {number} depth */
      const subdivide = (a, b, p, q, depth) => {
        const middle = (a + b) / 2;
        const m = sample(middle);
        // Compare arc length as well as midpoint deviation: opposing turns
        // may put a midpoint on the chord while the path bends away from it.
        const chord = Math.hypot(q.x - p.x, q.y - p.y);
        const deviation = chord ? Math.abs((q.x - p.x) * (p.y - m.y) - (p.x - m.x) * (q.y - p.y)) / chord : Math.hypot(m.x - p.x, m.y - p.y);
        if ((deviation > tolerance || b - a - chord > tolerance) && depth < 18) {
          subdivide(a, middle, p, m, depth + 1);
          subdivide(middle, b, m, q, depth + 1);
        } else {
          points.push(transformShapePoint(p, shape));
        }
      };
      for (let i = 0; i < 8; i++) {
        const a = length * i / 8, b = length * (i + 1) / 8;
        subdivide(a, b, sample(a), sample(b), 0);
      }
      const style = styleById(shape.style);
      if (!style) throw new Error(`${letter} contains a shape with an unknown colour.`);
      return {
        fill: style.fill,
        points
      };
    })
  }));
}

/** @param {{family?:string, color?:boolean}} [options] */
async function makeAlphabetFont(options = {}) {
  const { buildFont } = await import("./font-export.js");
  return buildFont({ ...options, letters: fontLetterContours() });
}

function initFontExport() {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById("font-dialog"));
  const form = /** @type {HTMLFormElement} */ (document.getElementById("font-form"));
  const family = /** @type {HTMLInputElement} */ (document.getElementById("font-family"));
  const color = /** @type {HTMLSelectElement} */ (document.getElementById("font-color"));
  const sample = /** @type {HTMLInputElement} */ (document.getElementById("font-sample"));
  const preview = /** @type {HTMLElement} */ (document.getElementById("font-preview"));
  const status = /** @type {HTMLElement} */ (document.getElementById("font-status"));
  const download = /** @type {HTMLButtonElement} */ (document.getElementById("font-download"));
  let result = /** @type {Awaited<ReturnType<typeof makeAlphabetFont>> | null} */ (null);
  let face = /** @type {FontFace | null} */ (null);
  let letters = /** @type {ReturnType<typeof fontLetterContours> | null} */ (null);
  let generation = 0;
  const update = async () => {
    const token = ++generation;
    result = null;
    download.disabled = true;
    status.dataset.error = "false";
    status.textContent = "Preparing selected variants…";
    try {
      const { buildFont } = await import("./font-export.js");
      if (token !== generation) return;
      // The modal freezes editing; name/appearance changes can reuse geometry.
      if (!letters) letters = fontLetterContours();
      const next = buildFont({ family: family.value, color: color.value === "color", letters });
      const nextFace = new FontFace(`MotRPACPreview${token}`, next.bytes.slice().buffer);
      await nextFace.load();
      if (token !== generation) return;
      if (face) document.fonts.delete(face);
      face = nextFace;
      document.fonts.add(face);
      preview.style.fontFamily = `"${nextFace.family}"`;
      preview.textContent = sample.value;
      result = next;
      download.disabled = false;
      status.textContent = next.missing.length
        ? `${next.letters.length} letters included. Blank selected variants omitted: ${next.missing.join(", ")}.`
        : "All 26 letters included. Numbers and punctuation are not included.";
    } catch (error) {
      if (token !== generation) return;
      status.dataset.error = "true";
      status.textContent = error instanceof Error ? error.message : String(error);
      preview.textContent = "";
    }
  };
  document.getElementById("export-font")?.addEventListener("click", () => {
    closeMenus();
    dialog.showModal();
    update();
  });
  document.getElementById("font-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    generation++;
    if (face) { document.fonts.delete(face); face = null; }
    result = null;
    letters = null;
  });
  family.addEventListener("change", update);
  color.addEventListener("change", update);
  sample.addEventListener("input", () => { preview.textContent = sample.value; });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!result || download.disabled) return;
    // A name edited immediately before submit may still be rebuilding.
    if (result.family !== family.value.trim()) { update(); return; }
    downloadText(`${result.family.replace(/[^A-Za-z0-9_-]+/g, "-")}.ttf`, result.bytes, "font/ttf");
  });
}

Object.assign(window, { MotRPACAlphabet: Object.freeze({ exportFont: makeAlphabetFont }) });
