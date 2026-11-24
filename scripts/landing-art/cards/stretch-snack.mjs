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
      // The still and live surface share the 4:5 crop, including the focal point.
      canvas.style.cssText = 'position:absolute;width:320px;height:400px';
      document.body.append(canvas);
      const samples = [false, true].map(dark => {
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        paintStep(canvas, reading.step, heldSeconds, dark);
        const styles = getComputedStyle(document.documentElement);
        const palette = ['page', 'paper', 'ink', 'stage', 'muted', 'line', 'accent', 'on-accent'].map(
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
      <div class="scene"><div class="pose"><img alt="" class="light-pose" src="${light.pose}"/><img alt="" class="dark-pose" src="${dark.pose}"/></div></div>
      <div class="session-info"><div class="bar">${field('counter')}<span class="end">${esc(snapshot.end)}</span></div>
        <div class="track"><i class="progress"></i></div><div class="reading">
        <div class="heading">${field('name')}<span class="time">${field('clock')}${field('remaining')}</span></div>
        <div class="next">${field('next')}</div><div class="controls"><span class="pause">${esc(snapshot.pause)}</span>${field('skip')}</div>
      </div></div>
    </div></foreignObject>`,
    css: `& {container:stretch-card/size;${light.palette}}
:root[data-theme="dark"] & {${dark.palette}}
& .session {box-sizing:border-box;display:grid;width:100%;height:100%;grid-template-columns:minmax(0,52fr) minmax(0,48fr);background:var(--sn-page);color:var(--sn-ink);font-family:"DM Sans","Avenir Next",system-ui,sans-serif;line-height:1.12}
& .session-info {display:flex;flex-direction:column;justify-content:center;gap:clamp(3px,min(1.7cqw,3cqh),12px);min-width:0;padding:clamp(5px,min(2.1cqw,4cqh),16px)}
& .bar {display:flex;align-items:center;justify-content:space-between;gap:.4em;white-space:nowrap;font-size:clamp(10px,min(3.2cqw,6cqh),16px);font-weight:650}
& .end,& .controls span {border:1px solid var(--sn-line);border-radius:.4em;padding:.23em .5em;background:var(--sn-paper);font-size:.86em}
& .track {flex:none;height:3px;border-radius:4px;background:var(--sn-line);overflow:hidden}
& .progress {display:block;height:100%;width:100%;transform:scaleX(${Math.floor(heldSeconds) / total});transform-origin:left;background:var(--sn-accent)}
& .scene {min-height:0;min-width:0;display:grid;place-items:end center;container:stretch-stage/size;background:var(--sn-stage)}
& .pose {position:relative;width:min(100cqw,80cqh);aspect-ratio:4/5}
& .pose img,& .pose canvas {position:absolute;inset:0;width:100%;height:100%;display:block}
& .pose .dark-pose,:root[data-theme="dark"] & .light-pose {display:none}
:root[data-theme="dark"] & .dark-pose {display:block}
& .pose:has(canvas) img {visibility:hidden}
& .reading {min-width:0;display:grid;gap:.34em;font-size:clamp(13px,min(5.2cqw,11cqh),28px)}
& .heading {display:grid;gap:.24em;font-weight:710;letter-spacing:-.035em;line-height:1.06}
& [data-reading="name"] {min-block-size:2lh}
& .time {display:flex;flex-wrap:wrap;align-items:baseline;gap:.05em .4em;font-variant-numeric:tabular-nums}
& [data-reading="clock"] {font-size:1.1em;font-weight:720}
& [data-reading="remaining"],& .next {font-weight:480;letter-spacing:0;color:var(--sn-muted);font-size:clamp(10px,.65em,16px)}
& .controls {display:flex;gap:.3em;align-items:center;font-size:clamp(10px,.72em,16px);font-weight:650}
& .controls .pause {background:var(--sn-accent);border-color:var(--sn-accent);color:var(--sn-on-accent)}
@container stretch-card (min-aspect-ratio:1.1/1) and (max-aspect-ratio:1.55/1) {
  & .session {grid-template-columns:min(80cqh,64cqw) minmax(0,1fr)}
}
@container stretch-card (max-aspect-ratio:1.1/1) {
  & .session {grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}
  & .session-info {gap:.25em}
  & .bar .end,& .controls {display:none}
  & .heading {display:flex;align-items:center;justify-content:space-between;gap:.5em}
  & [data-reading="name"] {min-block-size:0}
  & .time {flex-direction:column;align-items:end;white-space:nowrap}
}
@container stretch-card (max-width:420px) {& .end {display:none}}
@container stretch-card (max-height:150px) {& .controls,& .end {display:none}}
@container stretch-card (max-height:100px) {
  & .next {display:none}
  & .session-info {gap:2px;padding-block:2px}
  & [data-reading="name"] {min-block-size:0}
}
@container stretch-card (max-width:190px) {& .end,& .controls {display:none}}
@container stretch-card (max-width:150px) {& [data-reading="remaining"],& .next {display:none} & .reading {font-size:12px}}
`,
  });
}
