import { applyCvdLinear } from "../core/cvd.js";
import { deltaE2000 } from "../core/metrics.js";
import {
  channelOrder,
  convertColorValues,
  decodeColor,
  encodeColor,
  effectiveRangeFromValues,
  linearRgbToXyz,
  normalizeWithRange,
  unscaleWithRange,
  xyzToLab,
} from "../core/colorSpaces.js";
import { clamp, logistic } from "../core/util.js";
import { computeBounds } from "./bounds.js";

export function prepareData(palette, colorSpace, config) {
  const channels = channelOrder[colorSpace];
  const decoded = palette.map((hex) => decodeColor(hex, colorSpace));
  const ranges = effectiveRangeFromValues(decoded, colorSpace);
  const normalized = decoded.map((vals) => normalizeWithRange(vals, ranges, colorSpace));

  const bounds = computeBounds(normalized, colorSpace, config);
  const currHex = normalized.map((row) =>
    encodeColor(unscaleWithRange(row, ranges, colorSpace), colorSpace)
  );
  const cvdStates = config.colorblindSafe ? ["deutan", "protan", "tritan", "none"] : ["none"];
  const currLinear = decoded.map((row) => convertColorValues(row, colorSpace, "rgb"));
  const currLabsByState = {};
  cvdStates.forEach((state) => {
    currLabsByState[state] = currLinear.map((lin) => {
      const sim = state === "none" ? lin : applyCvdLinear(lin, state);
      return xyzToLab(linearRgbToXyz(sim));
    });
  });
  return {
    currCols: normalized,
    currHex,
    currRaw: decoded,
    currLabsByState,
    cvdStates,
    bounds,
    colorSpace,
    ranges,
    colorblindWeights: config.colorblindWeights,
    colorblindSafe: config.colorblindSafe,
    nColsToAdd: config.nColsToAdd,
  };
}

export function meanDistance(par, prep, returnInfo) {
  const { currHex, bounds, colorSpace, colorblindWeights, colorblindSafe, nColsToAdd, ranges } = prep;
  const channels = channelOrder[colorSpace];
  const cn = channels;

  const m = [];
  for (let i = 0; i < nColsToAdd; i++) {
    const row = {};
    for (let j = 0; j < cn.length; j++) {
      row[cn[j]] = par[i * cn.length + j];
    }
    m.push(row);
  }

  if (cn.includes("l")) {
    if (m.length > 1) {
      for (let i = 1; i < m.length; i++) {
        m[i].l = Math.exp(m[i].l);
      }
      let acc = 0;
      for (let i = 0; i < m.length; i++) {
        acc += m[i].l;
        m[i].l = acc;
      }
    }
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.l || bounds.boundsL;
      m[i].l = logistic(m[i].l) * (b[1] - b[0]) + b[0];
    }
  }

  const scChannel = cn.find((c) => c === "s" || c === "c");
  if (scChannel) {
    for (let i = 0; i < m.length; i++) {
      const b = bounds.boundsByName?.[scChannel] || bounds.boundsSc;
      m[i][scChannel] =
        clamp(logistic(m[i][scChannel]), 0, 1) * (b[1] - b[0]) +
        b[0];
      m[i][scChannel] = clamp(m[i][scChannel], b[0], b[1]);
    }
  }

  if (cn.includes("h") && bounds.boundsH) {
    for (let i = 0; i < m.length; i++) {
      const span = (bounds.boundsH[1] - bounds.boundsH[0] + 1) % 1 || 1;
      let h = clamp(logistic(m[i].h), 0, 1);
      h = (bounds.boundsH[0] + h * span) % 1;
      const offset = ((h - bounds.boundsH[0] + 1) % 1);
      if (offset > span) {
        h = (bounds.boundsH[0] + span) % 1;
      }
      m[i].h = h;
    }
  }

  for (let i = 0; i < m.length; i++) {
    cn.forEach((ch) => {
      if (ch === "l" || ch === scChannel || ch === "h") return;
      const b = bounds.boundsByName?.[ch] || [0, 1];
      m[i][ch] = clamp(logistic(m[i][ch]), 0, 1) * (b[1] - b[0]) + b[0];
      m[i][ch] = clamp(m[i][ch], b[0], b[1]);
    });
  }

  const scaled = m.map((row) => unscaleWithRange(row, ranges, colorSpace));
  const rawHex = scaled.map((row) => encodeColor(row, colorSpace));
  const newHex = rawHex;

  const cvdStates = prep.cvdStates;
  const newLabsByState = {};
  cvdStates.forEach((state) => {
    newLabsByState[state] = scaled.map((row) => {
      const lin = convertColorValues(row, colorSpace, "rgb");
      const sim = state === "none" ? lin : applyCvdLinear(lin, state);
      return xyzToLab(linearRgbToXyz(sim));
    });
  });
  const dists = {};

  for (const state of cvdStates) {
    const nLabs = newLabsByState[state];
    const cLabs = prep.currLabsByState[state];

    const pairwise = [];
    for (let i = 0; i < cLabs.length; i++) {
      for (let j = 0; j < nLabs.length; j++) {
        pairwise.push(deltaE2000(cLabs[i], nLabs[j]));
      }
    }
    for (let i = 0; i < nLabs.length; i++) {
      for (let j = i + 1; j < nLabs.length; j++) {
        pairwise.push(deltaE2000(nLabs[i], nLabs[j]));
      }
    }
    const eps = 1e-6;
    const hm = 1 / (pairwise.reduce((acc, v) => acc + 1 / Math.max(v, eps), 0) / pairwise.length);
    dists[state] = hm;
  }

  const weights = colorblindWeights;
  let wd = 0;
  for (const k of Object.keys(weights)) {
    wd += (dists[k] || 0) * (weights[k] || 0);
  }

  const penaltyWeight = 1e-3;
  const penalty = par.reduce((acc, v) => acc + v * v, 0);
  const value = -wd + penaltyWeight * penalty;

  if (returnInfo) {
    return { value, newHex, newRaw: scaled.map((row) => ({ ...row })), distance: wd };
  }
  return { value };
}

export function objectiveValue(par, prep) {
  return meanDistance(par, prep, false).value;
}

export function objectiveInfo(par, prep) {
  return meanDistance(par, prep, true);
}
