import { art, esc } from '../svg.mjs';
import { openPage } from '../browser.mjs';

export async function build() {
  const {page, errors, close} = await openPage('stretch-snack/');
  let snapshot;
  try {
    snapshot = await page.evaluate(async () => {
      const {prepare, heldSeconds, sessionReading, paintStep} =
        await import(new URL('../assets/players/stretch-snack.js', location.href).href);
      const plan = prepare(), reading = sessionReading(plan, heldSeconds);
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;width:240px;height:240px';
      document.body.append(canvas);
      const samples = [false, true].map(dark => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        paintStep(canvas, reading.step, heldSeconds, dark);
        const styles = getComputedStyle(document.documentElement);
        const palette = ['page', 'paper', 'ink', 'stage', 'muted', 'line', 'green', 'on-green'].map(
          key => '--sn-' + key + ':' + styles.getPropertyValue('--' + key).trim(),
        ).join(';');
        return {palette, pose: canvas.toDataURL('image/webp', .94)};
      });
      const text = id => document.getElementById(id).textContent;
      return {reading, samples, total: plan.total, heldSeconds, end: text('finish'), pause: text('pause')};
    });
    if (errors.length) throw new Error('Stretch Snack preview: ' + errors.join('; '));
  } finally { await close(); }
  const {reading, samples: [light, dark], heldSeconds, total} = snapshot;
  const field = key => `<span data-reading="${key}">${esc(reading[key])}</span>`;
  return art({
    name: 'stretch-snack', player: 'stretch-snack', responsive: true, period: total,
    body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="session">
      <div class="bar">${field('counter')}<span class="end">${esc(snapshot.end)}</span></div>
      <div class="track"><i class="progress"></i></div>
      <div class="scene"><div class="pose"><img alt="" class="light-pose" src="${light.pose}"/><img alt="" class="dark-pose" src="${dark.pose}"/></div></div>
      <div class="reading">
        <div class="heading">${field('name')}<span class="time">${field('clock')}${field('remaining')}</span></div>
        <div class="next">${field('next')}</div><div class="controls"><span class="pause">${esc(snapshot.pause)}</span>${field('skip')}</div>
      </div>
    </div></foreignObject>`,
    css: `& {container:stretch-card/size;${light.palette}}
:root[data-theme="dark"] & {${dark.palette}}
& .session {box-sizing:border-box;display:grid;width:100%;height:100%;padding:clamp(4px,min(2.5cqw,4cqh),14px);gap:clamp(3px,min(1.4cqw,2.5cqh),8px);grid-template:"bar bar" auto "track track" 3px "scene reading" minmax(0,1fr) / minmax(0,.9fr) minmax(0,1.05fr);background:var(--sn-page);color:var(--sn-ink);font-family:"DM Sans","Avenir Next",system-ui,sans-serif;line-height:1.12}
& .bar {grid-area:bar;display:flex;align-items:center;justify-content:space-between;font-size:clamp(10px,min(3.9cqw,8.4cqh),17px);font-weight:650}
& .end,& .controls span {border:1px solid var(--sn-line);border-radius:.4em;padding:.23em .5em;background:var(--sn-paper);font-size:.86em}
& .track {grid-area:track;border-radius:4px;background:var(--sn-line);overflow:hidden}
& .progress {display:block;height:100%;width:100%;transform:scaleX(${heldSeconds / total});transform-origin:left;background:var(--sn-green)}
& .scene {grid-area:scene;min-height:0;min-width:0;display:grid;place-items:center;container:stretch-stage/size;background:var(--sn-stage);border-radius:clamp(4px,2cqw,12px)}
& .pose {position:relative;width:min(100cqw,100cqh);aspect-ratio:1}
& .pose img,& .pose canvas {position:absolute;inset:0;width:100%;height:100%;display:block}
& .pose .dark-pose,:root[data-theme="dark"] & .light-pose {display:none}
:root[data-theme="dark"] & .dark-pose {display:block}
& .pose:has(canvas) img {visibility:hidden}
& .reading {grid-area:reading;min-width:0;align-self:center;display:grid;align-content:center;gap:.33em;font-size:clamp(12px,min(5.7cqw,13cqh),28px)}
& .heading {display:grid;gap:.24em;font-weight:710;letter-spacing:-.035em;line-height:1.06}
& .time {display:flex;align-items:baseline;gap:.45em;font-variant-numeric:tabular-nums}
& [data-reading="clock"] {font-size:1.1em;font-weight:720}
& [data-reading="remaining"],& .next {font-weight:480;letter-spacing:0;color:var(--sn-muted);font-size:clamp(10px,.65em,16px)}
& .controls {display:flex;gap:.3em;align-items:center;font-size:clamp(10px,.72em,16px);font-weight:650}
& .controls .pause {background:var(--sn-green);border-color:var(--sn-green);color:var(--sn-on-green)}
@container stretch-card (max-aspect-ratio:1.45/1) {
  & .session {grid-template:"bar" auto "track" 3px "scene" minmax(0,1fr) "reading" auto / minmax(0,1fr)}
  & .heading {display:flex;align-items:start;justify-content:space-between;gap:.6em}
  & .time {flex-direction:column;align-items:end;gap:.05em;white-space:nowrap}
  & .reading {display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}
  & .heading {grid-column:1/-1}
}
@container stretch-card (max-height:135px) {& .controls {display:none}}
@container stretch-card (max-height:100px) and (min-aspect-ratio:1.5/1) {
  & .session {grid-template:"scene bar" auto "scene track" 2px "scene reading" minmax(0,1fr) / minmax(0,.82fr) minmax(0,1.18fr)}
  & .next,& .end {display:none}
}
@container stretch-card (max-width:190px) {& .end,& .controls {display:none}}
@container stretch-card (max-width:150px) {& [data-reading="remaining"],& .next {display:none} & .reading {font-size:12px}}
`,
  });
}
