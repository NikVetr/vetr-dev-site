// The tool's single entry point. The page, window.Signature and cli.mjs all
// call submit(); nothing here touches the DOM.
//
// Stages: read the strokes -> resample each at equal steps along its length ->
// smooth (Fourier over each whole stroke, then wavelet, locally scaled) ->
// widths -> filled outline (the union of each stroke's ribbon) -> SVG; and,
// when asked, morph frames into a second signature.

import { editGeometry, editWidths, timeline } from './effects.js';
export { timeline, influence, suggestEffects } from './effects.js';
import { morphFrames } from './morph.js';
import { pathData, polygonBounds, ribbon, unionRings } from './outline.js';
import { normalizeRequest, SignatureError } from './request.js';
import { cumulativeLength, resampleStroke } from './resample.js';
import { smoothPoints } from './smooth.js';
export { smoothPoints } from './smooth.js';
import { strokeWidths } from './width.js';

export { DEFAULTS, MORPH_DEFAULTS, SignatureError } from './request.js';

/**
 * @typedef {import('./resample.js').RawPoint} RawPoint
 * @typedef {import('./request.js').Settings} Settings
 * @typedef {import('./request.js').LocalRegion} LocalRegion
 * @typedef {import('./outline.js').Polygon} Polygon
 * @typedef {{ points: number[][] }} OutStroke  points [x, y, width]
 * @typedef {{ strokes: OutStroke[], outline: Polygon[], svg: string, viewBox: number[], height: number,
 *   widthSource: 'speed' | 'curvature' | 'pressure' | 'constant',
 *   morph: { frames: { p: number, strokes: OutStroke[] }[] } | null,
 *   warnings: import('./input.js').Warning[], settings: Record<string, any> }} Result
 */

/** The signature's height, the unit of the relative settings (its width when it is flat). @param {RawPoint[][]} sig */
export function signatureHeight(sig) {
  const xs = sig.flat().map((p) => p.x);
  const ys = sig.flat().map((p) => p.y);
  const h = Math.max(...ys) - Math.min(...ys);
  return h > 0 ? h : Math.max(...xs) - Math.min(...xs);
}

/** Resampling step for a signature. @param {RawPoint[][]} sig @param {Settings} s */
const stepFor = (sig, s) => (s.resample.step === 'auto' ? signatureHeight(sig) / 100 : s.resample.step);

/**
 * The strength profile of local regions along one stroke: at each point, the
 * strength of the last region covering its share of the stroke's length, else 1.
 * @param {readonly LocalRegion[]} local @param {number} stroke @param {Float64Array} s raw arc length of each point
 */
export function localProfile(local, stroke, s) {
  const mine = local.filter((r) => r.stroke === stroke);
  if (!mine.length) return undefined;
  const total = s[s.length - 1] || 1;
  return s.map((v) => {
    const share = v / total;
    let k = 1;
    for (const r of mine) if (share >= r.from && share <= r.to) k = r.strength;
    return k;
  });
}

/** Width source for a signature: "auto" is speed when every point has a time, else curvature. @param {RawPoint[][]} sig @param {Settings} s */
function widthSource(sig, s) {
  if (s.width.source !== 'auto') return s.width.source;
  return sig.flat().every((p) => p.t !== undefined) ? 'speed' : 'curvature';
}

/**
 * The correction of one signature: resampled, smoothed and given widths.
 * @param {RawPoint[][]} sig @param {Settings} s @param {readonly LocalRegion[]} local
 */
export function correct(sig, s, local) {
  const height = signatureHeight(sig);
  if (!(height > 0)) throw new SignatureError('DEGENERATE_INPUT', 'every point of the signature is in the same place', []);
  const step = stepFor(sig, s);
  const strokes = sig.map((raw, i) => {
    const rx = raw.map((p) => p.x);
    const ry = raw.map((p) => p.y);
    const rawS = cumulativeLength(rx, ry);
    const len = rawS[rawS.length - 1];
    if (len < step / 2) {
      // a dot: one point where the pen rested
      const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
      const my = ry.reduce((a, b) => a + b, 0) / ry.length;
      return { x: Float64Array.of(mx), y: Float64Array.of(my), s: Float64Array.of(0), raw, rawS, dot: true };
    }
    const r = resampleStroke(rx, ry, Math.max(2, Math.round(len / step) + 1));
    const sm = smoothPoints(r.x, r.y, s.smooth, localProfile(local, i, r.s));
    return { x: sm.x, y: sm.y, s: r.s, raw, rawS, dot: false };
  });
  if (s.effects?.length || s.warps?.length) editGeometry(strokes, sig, s.effects ?? [], s.warps ?? [], height);
  const source = widthSource(sig, s);
  const lines = strokes.filter((st) => !st.dot);
  const w = lines.length ? strokeWidths(lines, height, { ...s.width, source }) : [];
  let k = 0;
  const widths = strokes.map((st) => (st.dot ? Float64Array.of(s.width.max * height) : w[k++]));
  if (s.effects?.length) editWidths(widths, strokes, sig, s.effects);
  return { strokes, widths, height, source };
}

/**
 * The filled outline of strokes with widths, and its SVG.
 * @param {{ x: ArrayLike<number>, y: ArrayLike<number> }[]} strokes @param {ArrayLike<number>[]} widths
 * @param {number} height the signature's height @param {Settings['output']} o
 */
export function outlineSvg(strokes, widths, height, o) {
  const outline = unionRings(strokes.map((st, i) => ribbon(st.x, st.y, widths[i])));
  const [x0, y0, x1, y1] = polygonBounds(outline);
  const pad = o.margin * height;
  const viewBox = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  const f = (/** @type {number} */ v) => Number(v.toFixed(o.digits));
  const [w, h] = o.height === null ? [`${f(viewBox[2])}`, `${f(viewBox[3])}`]
    : [`${f((o.height * viewBox[2]) / viewBox[3])}${o.unit}`, `${f(o.height)}${o.unit}`];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(f).join(' ')}" width="${w}" height="${h}">`
    + `<path fill="${o.color}" fill-rule="evenodd" d="${pathData(outline, o.digits)}"/></svg>\n`;
  return { outline, svg, viewBox };
}

/**
 * Corrects a signature, and morphs it into another when the request asks.
 * @param {unknown} request see api.md
 * @returns {Result}
 */
export function submit(request) {
  const { strokes: raw, settings: s, warnings } = normalizeRequest(request);
  const c = correct(raw, s, s.smooth.local);
  const { outline, svg, viewBox } = outlineSvg(c.strokes, c.widths, c.height, s.output);
  let morph = null;
  if (s.morph) {
    const target = s.morph.target;
    const { target: _t, ...m } = s.morph;
    const frames = morphFrames(raw, target, m, {
      step: (sig) => stepFor(sig, s),
      ...(s.effects?.length || s.warps?.length ? {edit: (strokes, widths, normalized, original) => {
        const scale=signatureHeight(normalized)/signatureHeight(original);
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for(const stroke of original) for(const p of stroke) {
          minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
        }
        const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
        const firstSpan=timeline(raw)[0].to;
        const effects=m.strokes==='first' ? (s.effects??[]).map(e=>({...e,from:e.from/firstSpan,to:e.to/firstSpan,falloff:e.falloff/firstSpan})) : s.effects??[];
        const warps=(s.warps??[]).map(w=>({x:(w.x-cx)*scale,y:(w.y-cy)*scale,dx:w.dx*scale,dy:w.dy*scale,radius:w.radius*scale}));
        editGeometry(strokes,normalized,effects,warps,signatureHeight(normalized));
        editWidths(widths,strokes,normalized,effects);
      }} : {}),
      // local regions belong to this signature
      smooth: (x, y, which, stroke, sArc) => smoothPoints(x, y, s.smooth, which === 'a' ? localProfile(s.smooth.local, stroke, sArc) : undefined),
      widths: (strokes, sig) => {
        const height = signatureHeight(sig);
        return strokeWidths(strokes.map((st) => ({ ...st, rawS: cumulativeLength(st.raw.map((p) => p.x), st.raw.map((p) => p.y)) })),
          height, { ...s.width, source: widthSource(sig, s) });
      },
    });
    morph = { frames };
  }
  const settings = { ...s, morph: s.morph ? (({ target: _t, ...m }) => m)(s.morph) : null };
  return {
    strokes: c.strokes.map((st, i) => ({ points: Array.from(st.x, (x, k) => [x, st.y[k], c.widths[i][k]]) })),
    outline,
    svg,
    viewBox,
    height: c.height,
    widthSource: c.source,
    morph,
    warnings,
    settings,
  };
}
