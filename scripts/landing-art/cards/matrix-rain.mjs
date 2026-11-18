import { openPage } from '../browser.mjs';
import { art, flipbook } from '../svg.mjs';
export async function build() {
  const browser = await openPage('matrix-rain/');
  try {
    const frames = await browser.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const scene = makeScene({ title: 'The Extracellular Matrix' });
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      return [11.05, 11.23, 11.41, 11.59, 11.77, 11.95].map((time) => {
        paint(ctx, frame(scene, time), null);
        return '<image width="100%" y="50%" href="' + canvas.toDataURL('image/webp', 0.82) + '"/>';
      });
    });
    const book = flipbook('matrix-rain', frames, 1.8);
    return art({
      name: 'matrix-rain',
      period: 1.8,
      responsive: true,
      ...book,
      css:
        book.css +
        ' & {background:#010704} & image {height:auto;transform-box:fill-box;transform:translateY(-50%)}',
    });
  } finally {
    await browser.close();
  }
}
