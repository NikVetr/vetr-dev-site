// Agent Bar: the demo page's own simulated desktop, captured in headless Chromium at a fixed clock. The loop is the
// app's one recognizable action: on the calm opening desktop (one VS Code window and one terminal), the pointer
// clicks a project's review button in the top bar, and that chat's VS Code window comes forward from the dock,
// maximized, with the chat showing (its review clears, so its button goes). Each frame pairs the top bar's review
// buttons with the desktop under them; the still is the pointer on the button.
import { openPage } from '../browser.mjs';
import { art, esc, flipbook } from '../svg.mjs';

const PERIOD = 6;
const SCALE = 2;
// A screen at the demo's full size whose desktop is about 3:2, the middle of the wells the tile gets.
const VIEW = { width: 1600, height: 1130 };

export async function build() {
  const { page, errors, close } = await openPage('agent-bar/', VIEW);
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
        const quick = [...document.querySelectorAll('.tracker-quick > [data-group]:not([hidden])')].map(box);
        const left = Math.min(...quick.map((r) => r.left)) - 8, right = Math.max(...quick.map((r) => r.right)) + 8;
        const desk = box(/** @type {Element} */ (document.querySelector('#desktop')));
        const panel = box(/** @type {Element} */ (document.querySelector('#panel')));
        const target = document.querySelector('.tracker-quick [data-key^="claude:5b1c"]')?.getBoundingClientRect();
        return { bar: [left, panel.top + scrollY, right - left, panel.height], desk: [desk.left, desk.top + scrollY, desk.width, desk.height],
          target: target && [target.left, target.top, target.width, target.height], scale, width: screen.offsetWidth };
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
    // The button, as fractions of the bar strip: outlined, with the pointer's tip at its lower edge.
    const [tx, ty, tw, th] = rest.target;
    const atRest = await frame([(tx - bar[0]) / bar[2], (ty - bar[1]) / bar[3], tw / bar[2], th / bar[3]]);
    await page.evaluate((k) => /** @type {any} */ (window).AgentBarDemo.activate(k, 'focus'), key);
    await capture();
    const forward = await frame(null);
    frames = [atRest, forward];
    if (errors.length) throw new Error(`agent-bar: ${errors.join('; ')}`);
  } finally {
    await close();
  }
  const pct = (/** @type {number} */ v) => `${(v * 100).toFixed(1)}%`;
  const pointer = ([x, y, w, h]) => `<span class="hit" style="left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)}"></span><svg class="pointer" viewBox="0 0 26 26" style="left:${pct(x + w * 0.55)};top:${pct(y + h * 0.8)}" aria-hidden="true"><path d="M2 2v17l4.5-4.2 3.2 7 3-1.4-3.2-6.9h6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const html = (f, caption) => `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="ab-card">
<div class="bar"><img alt="" src="${f.bar}"/>${f.pointer ? pointer(f.pointer) : ''}</div>
<div class="desk"><img alt="" src="${f.desk}"/><span class="caption">${esc(caption)}</span></div></div></foreignObject>`;
  const book = flipbook('agent-bar', [html(frames[0], 'Click a project’s review button'), html(frames[1], 'That chat comes forward, maximized')], PERIOD);
  return art({
    name: 'agent-bar', responsive: true, period: PERIOD, frames: book.frames, body: book.body,
    css: `${book.css}
& .ab-card {box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;background:#000;overflow:hidden;container-type:size}
& .bar {position:relative;flex:none;line-height:0;background:#000}
& .bar img {display:block;width:100%;height:auto}
& .desk {position:relative;flex:1 1 0;min-height:0;line-height:0}
& .desk img {display:block;width:100%;height:100%;object-fit:cover;object-position:center top}
& .caption {position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);line-height:1.25;font:600 clamp(9px,3.4cqw,13px) system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.78);padding:2px 6px;border-radius:5px;overflow-wrap:break-word}
& .hit {position:absolute;box-sizing:border-box;border:2px solid #f4c36a;border-radius:999px;box-shadow:0 0 6px rgba(244,195,106,.8)}
& .pointer {position:absolute;z-index:1;width:6%;max-width:22px;overflow:visible;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}`,
    loop: book.loop,
  });
}
