import { applyCvdHex } from "../core/cvd.js";
import { deltaE2000 } from "../core/metrics.js";
import {
  channelOrder,
  decodeColor,
  encodeColor,
  effectiveRangeFromValues,
  normalizeWithRange,
  unscaleWithRange,
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
  return {
    currCols: normalized,
    currHex,
    currRaw: decoded,
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
  const newHex = rawHex.map((hex) => {
    const decoded = decodeColor(hex, colorSpace);
    const norm = normalizeWithRange(decoded, ranges, colorSpace);
    const clamped = { ...norm };
    const scCh = cn.find((c) => c === "s" || c === "c");
    if (bounds.boundsH && typeof clamped.h === "number") {
      const start = bounds.boundsH[0];
      const end = bounds.boundsH[1];
      const span = (end - start + 1) % 1 || 1;
      let off = ((clamped.h - start + 1) % 1);
      if (off > span) off = span;
      clamped.h = (start + off) % 1;
    }
    if (scCh && typeof clamped[scCh] === "number") {
      const b = bounds.boundsByName?.[scCh] || bounds.boundsSc;
      clamped[scCh] = clamp(clamped[scCh], b[0], b[1]);
    }
    if (typeof clamped.l === "number") {
      const b = bounds.boundsByName?.l || bounds.boundsL;
      clamped.l = clamp(clamped.l, b[0], b[1]);
    }
    cn.forEach((ch) => {
      if (ch === "l" || ch === scCh || ch === "h") return;
      const b = bounds.boundsByName?.[ch];
      if (b && typeof clamped[ch] === "number") clamped[ch] = clamp(clamped[ch], b[0], b[1]);
    });
    return encodeColor(unscaleWithRange(clamped, ranges, colorSpace), colorSpace);
  });
  const currHexLocal = currHex;

  const cvdStates = colorblindSafe ? ["deutan", "protan", "tritan", "none"] : ["none"];
  const dists = {};

  for (const state of cvdStates) {
    const nh = newHex.map((h) => applyCvdHex(h, state));
    const ch = currHexLocal.map((h) => applyCvdHex(h, state));
    const nLabs = nh.map((h) => decodeColor(h, "lab"));
    const cLabs = ch.map((h) => decodeColor(h, "lab"));

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
