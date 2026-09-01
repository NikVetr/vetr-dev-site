// Export a solved plan as PDF, PNG or SVG, entirely in the browser.
//
// Every path runs client-side with no network, which is what makes the app usable
// where it is actually needed -- abroad, on a phone, with no data.

import { zip } from '../core/zip.js';
import { planToSvg } from '../render/svg.js';
import { planToPdf } from '../render/pdf.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { loadBytes, loadText, download } from './app.js';

/** @type {Map<string,string>} */ const dataUriCache = new Map();

/**
 * woff2 as a data URI. An SVG loaded into an `<img>` is a separate document that
 * may not fetch external resources, so rasterising a sheet with linked fonts
 * silently falls back to a default face. Inlining is the only reliable way.
 * @param {string} file
 */
async function fontDataUri(file) {
  const hit = dataUriCache.get(file);
  if (hit) return hit;
  const bytes = await loadBytes(`data/fonts/${file}.woff2`);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const uri = `data:font/woff2;base64,${btoa(binary)}`;
  dataUriCache.set(file, uri);
  return uri;
}

/**
 * @param {{faces:{stack:string,weight:number,italic:boolean,file:string}[]}} manifest
 * @param {string[]} stacks
 */
async function inlineFontCss(manifest, stacks) {
  let css = fontFaceCss(manifest, stacks);
  for (const face of manifest.faces.filter((f) => stacks.includes(f.stack))) {
    css = css.replace(`url("data/fonts/${face.file}.woff2")`, `url("${await fontDataUri(face.file)}")`);
  }
  return css;
}

/** @param {string} svg @param {string} css */
function withStyle(svg, css) {
  return svg.replace('>', `><style>${css}</style>`);
}

/**
 * @typedef {Object} ExportInput
 * @property {import('../core/types.js').LayoutPlan} plan
 * @property {any} manifest
 * @property {any} icons
 * @property {string[]} stacks
 * @property {string} name
 * @property {(done:number, total:number)=>void} [onProgress] called per face, so a
 *   six-face 600dpi export can say how far along it is instead of just freezing
 */

/**
 * Deliver one file, or an archive if there are several. Firing download() once per
 * face made Chrome raise its "Download multiple files?" prompt and gate all but
 * the first.
 * @param {ZipEntry[]} files @param {string} name
 */
function deliver(files, name) {
  if (files.length === 1) {
    download(new Blob([/** @type {BlobPart} */ (files[0].bytes)], { type: files[0].type }), files[0].name);
    return;
  }
  download(
    new Blob([/** @type {BlobPart} */ (zip(files).slice())], { type: 'application/zip' }),
    `${name}.zip`,
  );
}

/** @typedef {{name:string, bytes:Uint8Array, type:string}} ZipEntry */

/** SVG strings for each face, ready to draw or save. @param {ExportInput} input */
export function faceSvgs({ plan, manifest, icons }) {
  return planToSvg(plan, { faces: cssFaces(manifest), icons });
}

/** @param {ExportInput} input */
export async function exportSvg(input) {
  const css = await inlineFontCss(input.manifest, input.stacks);
  const svgs = faceSvgs(input).map((s) => withStyle(s, css));
  const encoder = new TextEncoder();
  deliver(svgs.map((svg, i) => ({
    name: svgs.length === 1 ? `${input.name}.svg` : `${input.name}-face-${i + 1}.svg`,
    bytes: encoder.encode(svg),
    type: 'image/svg+xml',
  })), input.name);
}

/** @param {ExportInput} input @param {number} dpi */
export async function exportPng(input, dpi = 600) {
  const css = await inlineFontCss(input.manifest, input.stacks);
  const scale = dpi / 72;
  const svgs = faceSvgs(input);
  /** @type {ZipEntry[]} */ const files = [];
  for (const [i, raw] of svgs.entries()) {
    const svg = withStyle(raw, css);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.decoding = 'sync';
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(null);
        img.onerror = () => reject(new Error(`face ${i + 1} could not be rasterised`));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(input.plan.pageW * scale);
      canvas.height = Math.round(input.plan.pageH * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d canvas context');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas produced no PNG');
      const suffix = svgs.length === 1 ? '' : `-face-${i + 1}`;
      files.push({
        name: `${input.name}${suffix}-${dpi}dpi.png`,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        type: 'image/png',
      });
      input.onProgress?.(i + 1, svgs.length);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  deliver(files, `${input.name}-${dpi}dpi`);
}

/** @param {ExportInput} input @param {{title?:string, language?:string}} meta */
export async function exportPdf(input, meta = {}) {
  const bytes = await planToPdf(input.plan, {
    loadFont: (file) => loadBytes(`data/fonts/${file}`),
    icons: input.icons,
    title: meta.title,
    language: meta.language,
  });
  download(new Blob([/** @type {BlobPart} */ (bytes.slice())], { type: 'application/pdf' }), `${input.name}.pdf`);
}

/** The icon geometry every renderer needs. Cached across exports. */
let iconsPromise = /** @type {Promise<any>|null} */ (null);
export function loadIcons() {
  if (!iconsPromise) iconsPromise = loadText('data/icons.json').then(JSON.parse);
  return iconsPromise;
}
