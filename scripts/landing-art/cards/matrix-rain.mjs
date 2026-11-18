import { openPage } from '../browser.mjs';
import { art, flipbook } from '../svg.mjs';
export async function build() {
  const browser = await openPage('matrix-rain/');
  try {
    const frames = await browser.page.evaluate(async () => {
      const { makeScene, frame, paint } = await import(new URL('core.mjs', location.href).href);
      const scene = makeScene({ title: 'THE MATRIX' });
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      return [10.9, 11.2, 11.5, 11.8, 12.1, 12.4].map((time) => {
        paint(ctx, frame(scene, time), null);
        return '<image width="320" height="180" href="' + canvas.toDataURL('image/webp', 0.82) + '"/>';
      });
    });
    return art({ name: 'matrix-rain', period: 1.8, ...flipbook('matrix-rain', frames, 1.8) });
  } finally {
    await browser.close();
  }
}
