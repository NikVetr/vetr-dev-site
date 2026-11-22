import { openPage } from '../browser.mjs';
import { art } from '../svg.mjs';
import { submit } from '../../../stretch-snack/core/plan.js';
import { prepare } from '../../../assets/players/stretch-snack.js';

export async function build() {
  const { page, close } = await openPage('stretch-snack/');
  try {
    const image = await page.evaluate(async () => {
      const { renderMovement } = await import('../../../stretch-snack/demo.js');
      const { prepare } = await import('../../../assets/players/stretch-snack.js');
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'display:block;width:200px;height:232px';
      document.body.append(canvas);
      renderMovement(canvas, prepare(), 2, { location: 'plane-seat' });
      return canvas.toDataURL('image/png');
    });
    const {steps} = submit({seconds:30, location:'plane-seat', targets:['hips'], discretion:'moderate'});
    const move=prepare();
    const step=steps.find(item=>item.id===move.id);
    if(!step) throw new Error('The example routine no longer includes seated knee lifts.');
    return art({
      name: 'stretch-snack',
      player: 'stretch-snack',
      period: 8,
      responsive: true,
      body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="sample">
        <div class="description"><span>Airplane seat</span><b>${move.name}</b><span>${step.seconds} seconds</span></div>
        <img class="player-still" src="${image}" alt=""/></div></foreignObject>`,
      css: `& {background:#e1ecdf;color:#20483e;container-type:size} :root[data-theme="dark"] & {background:#263d35;color:#e6efe6}
        & .sample{height:100%;display:grid;grid-template-columns:47% 53%;align-items:center}
        & .description{min-width:0;display:grid;gap:4cqh;padding-left:8cqw;font:clamp(10px,min(6cqw,10cqh),16px)/1.1 system-ui,sans-serif}
        & b{font-size:clamp(13px,min(8cqw,17cqh),28px);letter-spacing:-.035em}
        & img{width:100%;height:100%;object-fit:contain;min-height:0}
        & .card-player{width:53%;left:47%}`,
    });
  } finally {
    await close();
  }
}
