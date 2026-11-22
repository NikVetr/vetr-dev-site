import { PDFDocument } from '../pocket-language-guide/vendor/pdf-lib.esm.js';

/** Combine local menu photos in reading order, preserving each page's aspect ratio.
 * @param {File[]} files
 * @param {AbortSignal} signal
 */
export async function menuPdf(files, signal) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Menu pages');
  for (const [index, file] of files.entries()) {
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    const image = new Image();
    const canvas = document.createElement('canvas');
    try {
      image.src = url;
      await image.decode();
      signal.throwIfAborted();
      const longest = Math.max(image.naturalWidth, image.naturalHeight);
      const scale = Math.min(1, 3072 / longest);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((resolve, reject) =>
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed.')), 'image/jpeg', 0.93)
      );
      const embedded = await pdf.embedJpg(await jpeg.arrayBuffer());
      const width = 792 * image.naturalWidth / longest, height = 792 * image.naturalHeight / longest;
      pdf.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error('Could not convert page ' + (index + 1) + '. Replace its photo or share the original.');
    } finally {
      canvas.width = canvas.height = 1;
      URL.revokeObjectURL(url);
    }
  }
  signal.throwIfAborted();
  return new File([new Uint8Array(await pdf.save())], 'menu-pages.pdf', { type: 'application/pdf' });
}
