import { download } from './app.js';
import { mediaUrl } from './sign-media.js';
import { deliver, isIOS, isNative, saveToPhotos } from './platform/shell.js';

/** @param {string} src */
async function loadStill(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** One 7 × 5 inch face at 300 dpi. Preview, PNG, print, and PDF share the same pixels.
 * @param {import('./sign-media.js').SignGroup} group @param {number} index @param {number} total */
async function drawFace(group, index, total) {
  if (!group.entries.length || group.entries.length > 4) throw new Error('A café face fits one to four signs.');
  const frames = await Promise.all(group.entries.map(async sign => Promise.all([
    loadStill(mediaUrl(sign, '1.jpg')), loadStill(mediaUrl(sign, '2.jpg')),
  ])));
  const canvas = document.createElement('canvas');
  canvas.width = 2100;
  canvas.height = 1500;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', group.title + ': ' + group.entries.map(sign => sign.label).join(', '));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not draw the pocket cards.');
  ctx.scale(3, 3); // Layout in hundredths of an inch.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 700, 500);
  ctx.fillStyle = '#15232c';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(group.title, 20, 31);
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('One-handed ASL · At the café', 680, 29);
  ctx.textAlign = 'left';
  for (const [i, sign] of group.entries.entries()) {
    const x = 20 + i % 2 * 337, y = 44 + Math.floor(i / 2) * 208;
    ctx.fillStyle = '#eff3f5';
    ctx.fillRect(x, y, 323, 200);
    ctx.fillStyle = '#15232c';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(sign.label, x + 10, y + 20);
    for (const [j, img] of frames[i].entries()) {
      const scale = Math.min(141 / img.naturalWidth, 167 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, x + 8 + j * 157 + (149-w)/2, y + 26 + (167-h)/2, w, h);
    }
    ctx.fillStyle = '#31566b';
    ctx.font = '15px sans-serif';
    ctx.fillText('→', x + 153, y + 112);
  }
  ctx.fillStyle = '#243a49';
  ctx.font = '9px sans-serif';
  ctx.fillText('3D motion adapted from PopSign v2.1 · Georgia Tech & Deaf Professional Arts Network · CC BY 4.0', 20, 473);
  ctx.fillText('signdata.cc.gatech.edu/view/datasets/popsign_v2_1/  ·  creativecommons.org/licenses/by/4.0/', 20, 485);
  ctx.textAlign = 'right';
  ctx.fillText('Watch the clips for the full movement.', 680, 473);
  ctx.fillText((index + 1) + ' / ' + total, 680, 485);
  return canvas;
}

/** @param {HTMLCanvasElement} canvas @param {string} type @returns {Promise<Blob>} */
function encode(canvas, type) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob); else reject(new Error('Image export failed.'));
  }, type, 0.94));
}

/** @param {import('./sign-media.js').SignGroup[]} groups @param {HTMLElement} host
 * @param {(error:unknown)=>void} report */
export async function showCards(groups, host, report) {
  const faces = await Promise.all(groups.map((g,i) => drawFace(g, i, groups.length)));
  for (const [i, canvas] of faces.entries()) {
    const face = document.createElement('figure');
    face.className = 'sign-face';
    const save = document.createElement('button');
    save.textContent = 'Save ' + groups[i].title + ' as PNG';
    save.onclick = async () => {
      save.disabled = true;
      try {
        const blob = await encode(canvas, 'image/png');
        const name = 'wanderwart-asl-cafe-' + (i+1) + '.png';
        if (isIOS()) await saveToPhotos(new Uint8Array(await blob.arrayBuffer()), name);
        else download(blob, name);
      } catch (err) { report(err); }
      finally { save.disabled = false; }
    };
    face.append(canvas, save);
    host.append(face);
  }
  return async () => {
    // The vendored library is the runtime bundle of the project's typed pdf-lib dependency.
    const { PDFDocument } = /** @type {typeof import('pdf-lib')} */ (
      /** @type {unknown} */ (await import('../vendor/pdf-lib.esm.js')));
    const doc = await PDFDocument.create();
    doc.setTitle('Wanderwart · ASL at the café');
    for (const canvas of faces) {
      const image = await doc.embedJpg(await (await encode(canvas, 'image/jpeg')).arrayBuffer());
      doc.addPage([504,360]).drawImage(image, { x:0, y:0, width:504, height:360 });
    }
    const pdf = new Blob([new Uint8Array(await doc.save())], { type:'application/pdf' });
    const name = 'wanderwart-asl-cafe.pdf';
    if (isNative()) {
      if (!await deliver(pdf, name)) throw new Error('The device could not share the PDF.');
    } else download(pdf, name);
  };
}
