// Export a solved plan as PDF, PNG or SVG, entirely in the browser.
//
// Every path runs client-side with no network, which is what makes the app usable
// where it is actually needed -- abroad, on a phone, with no data.

import { zip } from '../core/zip.js';
import { planToSvg } from '../render/svg.js';
import { planToPdf } from '../render/pdf.js';
import { cssFaces, fontFaceCss } from '../render/fonts.js';
import { loadBytes, loadText, download } from './app.js';
import { t } from './i18n.js';

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
 * @property {(files:{name:string,bytes:Uint8Array,type:string}[])=>void} [showInline]
 *   render the images into the page, for a touch device with no share sheet: the
 *   only way left to get a picture out of the browser is a press-and-hold save
 */

/**
 * Thrown when a solve produced no pages, so the caller can say so in the reader's
 * own language rather than handing over an empty archive.
 *
 * A sheet that does not fit yields a plan with no faces, which used to reach `zip`
 * as an empty list and download a valid, empty `.zip` -- the most confusing
 * possible answer to "export my sheet".
 */
export class NothingToExport extends Error {}

/**
 * Hand several files to the platform's share sheet, which on iOS and Android is
 * where "Save N Images to Photos" lives.
 *
 * Gated on a coarse pointer as well as on support, because the question is not
 * whether the browser *can* share but whether the reader can unzip: a desktop
 * about to print wants the archive, and Chrome on Windows would otherwise open a
 * share dialog in front of them.
 * @param {ZipEntry[]} files @param {string} name
 */
async function shareFiles(files, name) {
  if (!matchMedia('(pointer: coarse)').matches) return false;
  const list = files.map((f) => new File([/** @type {BlobPart} */ (f.bytes.slice())], f.name,
    { type: f.type }));
  if (!navigator.canShare?.({ files: list })) return false;
  try {
    await navigator.share({ files: list, title: name });
    return true;
  } catch (err) {
    // Dismissing the sheet is a finished interaction, not a failure -- falling
    // through to a zip download would be answering a cancel with a file.
    return /** @type {any} */ (err)?.name === 'AbortError';
  }
}

/**
 * Deliver one file, or several. Firing download() once per face made Chrome raise
 * its "Download multiple files?" prompt and gate all but the first, which is why
 * the many-file case is an archive.
 *
 * On a phone an archive is the wrong answer -- there is no unzip on either mobile
 * OS by default, so the file a reader gets is one they cannot open. So a touch
 * device is offered the share sheet first, and where that is unavailable the caller
 * may render the images into the page for a press-and-hold save.
 * @param {ZipEntry[]} files @param {string} name
 * @param {((files:ZipEntry[])=>void)} [showInline]
 */
async function deliver(files, name, showInline) {
  if (!files.length) throw new NothingToExport('the solve produced no pages');
  if (files.length === 1) {
    download(new Blob([/** @type {BlobPart} */ (files[0].bytes)], { type: files[0].type }), files[0].name);
    return;
  }
  if (await shareFiles(files, name)) return;
  if (showInline && matchMedia('(pointer: coarse)').matches) {
    showInline(files);
    return;
  }
  download(
    new Blob([/** @type {BlobPart} */ (zip(files).slice())], { type: 'application/zip' }),
    `${name}.zip`,
  );
}

/** @typedef {{name:string, bytes:Uint8Array, type:string}} ZipEntry */

/** Object URLs for whatever is on screen now, revoked when the set is replaced. */
/** @type {string[]} */ let shownUrls = [];

/**
 * Put the rendered pages in the page itself, captioned, as the last delivery route.
 *
 * Both pages need this and it is delivery rather than layout, so it lives beside
 * the other delivery in this module rather than being written twice. Neither mobile
 * OS unzips by default, so on a touch device with no share sheet the archive is a
 * file the reader cannot open -- but a plain `<img>` is something both platforms
 * save to the camera roll on a press and hold.
 * @param {HTMLElement|null} box @param {ZipEntry[]} files
 */
export function showSavedImages(box, files) {
  if (!box) return;
  for (const url of shownUrls) URL.revokeObjectURL(url);
  shownUrls = [];
  const caption = document.createElement('figcaption');
  caption.textContent = t('quick.pressAndHold');
  box.replaceChildren(caption);
  for (const [i, file] of files.entries()) {
    const url = URL.createObjectURL(new Blob([/** @type {BlobPart} */ (file.bytes.slice())],
      { type: file.type }));
    shownUrls.push(url);
    const img = document.createElement('img');
    img.src = url;
    img.alt = t('quick.imageOf', { n: i + 1, total: files.length });
    box.append(img);
  }
  box.hidden = false;
}

/**
 * Report an export that had nothing to export as a sentence rather than as a crash.
 *
 * `showFatal` replaces the page, which is far too much for "your selection does not
 * fit yet" -- and before the guard existed the reader was handed an empty `.zip`
 * instead, which said nothing at all.
 * @param {unknown} err @param {HTMLElement|null} status @param {(e:unknown)=>void} fatal
 */
export function reportExportError(err, status, fatal) {
  if (err instanceof NothingToExport) {
    if (status) status.textContent = t('quick.nothingToExport');
    return;
  }
  fatal(err);
}

/**
 * SVG strings for each face, ready to draw or save. Typed to the three things it
 * reads rather than to a whole `ExportInput`, because the gallery's lightbox draws
 * faces without ever intending to save a file.
 * @param {{plan:import('../core/types.js').LayoutPlan, manifest:any, icons:any, [k:string]:any}} input
 */
export function faceSvgs({ plan, manifest, icons }) {
  return planToSvg(plan, { faces: cssFaces(manifest), icons });
}

/** @param {ExportInput} input */
export async function exportSvg(input) {
  const css = await inlineFontCss(input.manifest, input.stacks);
  const svgs = faceSvgs(input).map((s) => withStyle(s, css));
  const encoder = new TextEncoder();
  await deliver(svgs.map((svg, i) => ({
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
  await deliver(files, `${input.name}-${dpi}dpi`, input.showInline);
}

/** @param {ExportInput} input @param {{title?:string, language?:string}} meta */
export async function exportPdf(input, meta = {}) {
  // The same guard `deliver` applies: a sheet that does not fit has no faces, and a
  // PDF of nothing is as unhelpful as an empty zip.
  if (!input.plan.faces.length) throw new NothingToExport('the solve produced no pages');
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
