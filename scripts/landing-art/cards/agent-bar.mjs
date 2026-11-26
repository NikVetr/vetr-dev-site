// Agent Bar: the demo page's own simulated desktop, captured in headless Chromium at a fixed clock. The loop is
// the app's one recognizable task: the pointer clicks a project's review button in the top bar, that chat's VS
// Code window comes forward maximized with the chat showing, and clicking the chat again in the dropdown sends the
// window back. Each frame pairs the top bar's clock and review buttons with the desktop under them; the still is the
// pointer on the button.
import { openPage } from '../browser.mjs';
import { art, esc, flipbook } from '../svg.mjs';

const PERIOD = 8;
const SCALE = 2;

export async function build() {
  const { page, errors, close } = await openPage('agent-bar/', { width: 1700, height: 900 });
  let frames;
  try {
    await page.clock.install({ time: new Date('2026-11-25T13:09:00') });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => /** @type {any} */ (window).AgentBarDemo.pause());
    const capture = async () => {
      await page.waitForTimeout(150);
      return page.evaluate(async (scale) => {
        const screen = /** @type {HTMLElement} */ (document.querySelector('#screen'));
        const box = (el) => el.getBoundingClientRect();
        const clock = box(/** @type {Element} */ (document.querySelector('.panel-clock')));
        const quick = [...document.querySelectorAll('.tracker-quick > [data-group]:not([hidden])')].map(box);
        const right = Math.max(clock.right, ...quick.map((r) => r.right)) + 10;
        const desk = box(/** @type {Element} */ (document.querySelector('#desktop')));
        const target = document.querySelector('.tracker-quick [data-key^="claude:5b1c"]')?.getBoundingClientRect();
        return { bar: [clock.left - 4, 0, Math.max(560, right - clock.left + 4), 32], desk: [desk.left, desk.top, desk.width, desk.height],
          target: target && [target.right - 8, target.bottom - 5], scale, width: screen.offsetWidth };
      }, SCALE);
    };
    // A capture of a region as WebP, by way of a PNG screenshot redrawn in the page.
    const webp = async (/** @type {number[]} */ [x, y, width, height], out, quality = 0.8) => {
      const png = await page.screenshot({ clip: { x, y, width, height }, type: 'png' });
      return page.evaluate(async ([data, w, h, q]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, w, h);
        return canvas.toDataURL('image/webp', q);
      }, [png.toString('base64'), Math.round(out), Math.round(out * height / width), quality]);
    };
    const key = await page.evaluate(() => /** @type {any} */ (window).AgentBarDemo.state().chats.find((c) => c.title === 'Tune the step-size adaptation').key);
    const rest = await capture();
    const bar = rest.bar;
    // About twice the picture's 320 px width: the bar's text stays sharp, the desktop is a miniature.
    const frame = async (pointer) => ({ bar: await webp(bar, bar[2], 0.9), desk: await webp(rest.desk, 640 * SCALE / 2), pointer });
    const atRest = await frame(rest.target && [(rest.target[0] - bar[0]) / bar[2], (rest.target[1] - bar[1]) / bar[3]]);
    await page.evaluate((k) => /** @type {any} */ (window).AgentBarDemo.activate(k, 'focus'), key);
    await capture();
    const forward = await frame(null);
    await page.evaluate((k) => /** @type {any} */ (window).AgentBarDemo.activate(k, 'toggle'), key);
    await capture();
    const back = await frame(null);
    frames = [atRest, forward, back];
    if (errors.length) throw new Error(`agent-bar: ${errors.join('; ')}`);
  } finally {
    await close();
  }
  const pointer = ([x, y]) => `<svg class="pointer" viewBox="0 0 26 26" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%" aria-hidden="true"><circle class="ring" cx="2" cy="2" r="9"/><path d="M2 2v17l4.5-4.2 3.2 7 3-1.4-3.2-6.9h6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const html = (f, caption) => `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="ab-card">
<div class="bar"><img alt="" src="${f.bar}"/>${f.pointer ? pointer(f.pointer) : ''}</div>
<div class="desk"><img alt="" src="${f.desk}"/><span class="caption">${esc(caption)}</span></div></div></foreignObject>`;
  const book = flipbook('agent-bar', [html(frames[0], 'Click a project’s review button'), html(frames[1], 'Its chat comes forward, maximized'),
    html(frames[2], 'Click the chat again: the window goes back')], PERIOD);
  return art({
    name: 'agent-bar', responsive: true, period: PERIOD, frames: book.frames, body: book.body,
    css: `${book.css}
& .ab-card {box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;background:#000;overflow:hidden;container-type:size}
& .bar {position:relative;flex:none;line-height:0;background:#000}
& .bar img {display:block;width:100%;height:auto}
& .desk {position:relative;flex:1 1 0;min-height:0;line-height:0}
& .desk img {display:block;width:100%;height:100%;object-fit:cover;object-position:center top}
& .caption {position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);line-height:1.25;font:600 clamp(9px,3.4cqw,13px) system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.78);padding:2px 6px;border-radius:5px;overflow-wrap:break-word}
& .pointer {position:absolute;width:7%;max-width:24px;overflow:visible}
& .ring {fill:none;stroke:#f4c36a;stroke-width:2.5}`,
    loop: book.loop,
  });
}
