import { art } from '../svg.mjs';
import { prepare, figure, secondsPerSample } from '../../../assets/players/stretch-snack.js';

export function build() {
  const routine = prepare();
  const total = routine.reduce((sum, step) => sum + step.seconds, 0);
  const time = Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  const panels = routine.map((step, i) => `
    <div class="movement"${i === 0 ? ' data-current=""' : ''}>
      ${figure(step)}
      <span class="caption">${step.label}</span>
    </div>`).join('');
  return art({
    name: 'stretch-snack', player: 'stretch-snack', responsive: true,
    period: routine.length * secondsPerSample,
    body: `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="routine">
      <div class="routine-bar"><b>Seated routine</b><span class="timer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"><path d="M8 2h4m-2 0v2m5.2 1.7 1.6-1.6"/><circle cx="10" cy="11.5" r="6.5"/><path d="M10 7.5v4l2 1.5"/></svg><span class="routine-time">${time}</span></span></div>
      <div class="storyboard">${panels}</div>
      <div class="ruler"><i class="progress"></i></div>
    </div></foreignObject>`,
    css: `& {container:stretch-card/size;--banner:#193f34;--bar-ink:#f5f5d8;--paper:#e9ecd9;--stage:#bed19b;--ink:#214839;--letter:#284e3f;--distant:#839c82;--jacket:#498274;--skin:#cd9877;--shoe:#294d47;--chair:#94a991;--marker:#bd582d;--rail:#849880;--line:#aebaa2}
:root[data-theme="dark"] & {--banner:#233f34;--bar-ink:#f0f4dc;--paper:#2c4138;--stage:#48604e;--ink:#d6e5c9;--letter:#e1ebd6;--distant:#7a9381;--jacket:#76aaa0;--skin:#ddb28d;--shoe:#bccbbc;--chair:#839784;--marker:#ffb16e;--rail:#677e6a;--line:#526a58}
& .routine {display:grid;grid-template-rows:minmax(16px,18%) minmax(0,1fr) 3px;width:100%;height:100%;background:var(--paper);color:var(--letter);font-family:system-ui,sans-serif}
& .routine-bar {display:flex;align-items:center;justify-content:space-between;gap:.4em;padding:0 4%;background:var(--banner);color:var(--bar-ink);font-size:clamp(10px,min(5.7cqw,9cqh),22px);line-height:1}
& .routine-bar b {font-weight:660;letter-spacing:-.03em}
& .timer {display:inline-flex;align-items:center;gap:.3em;font:600 .84em/1 ui-monospace,monospace;font-variant-numeric:tabular-nums}
& .timer svg {width:1.2em;height:1.2em}
& .storyboard {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));min-height:0}
& .movement {display:grid;grid-template-rows:minmax(0,1fr) auto;min-width:0;min-height:0;border-inline-end:1px solid var(--line);padding:1cqh 0 3cqh}
& .movement:last-child {border:0}
& .movement[data-current] {background:var(--stage)}
& .figure {display:block;width:100%;height:100%;overflow:visible}
& .caption {text-align:center;font-size:clamp(9px,min(5cqw,8.4cqh),23px);font-weight:650;line-height:1.1;letter-spacing:-.025em}
& .ruler {background:var(--rail)}
& .progress {display:block;height:100%;width:100%;transform:scaleX(0);transform-origin:left;background:var(--marker)}
& .ground {fill:var(--chair);opacity:.48}
& .seat {stroke:var(--chair);stroke-width:3.5}
& .trail {stroke:var(--marker);stroke-width:1.7;stroke-linecap:round;stroke-dasharray:.45 3.9}
& .target {stroke:var(--marker);stroke-width:1.2}
& .limb {stroke-linecap:round;stroke-linejoin:round}
& .leg {stroke:var(--ink);stroke-width:10.5}
& .arm {stroke:var(--skin);stroke-width:7.5}
& .foot {stroke:var(--shoe);stroke-width:6.7}
& .far .limb {stroke:var(--distant)}
& .body {fill:var(--jacket)}
& .skin {stroke:var(--skin)}
& .face {fill:var(--skin)}
& .hair {fill:#3a4941}
& .working {stroke:var(--marker)}
@container stretch-card (max-aspect-ratio:1.1/1) {
  & .routine {grid-template-rows:auto minmax(0,1fr) 3px}
  & .routine-bar {padding:4% 6%}
  & .storyboard {grid-template:repeat(3,minmax(0,1fr)) / minmax(0,1fr)}
  & .movement {grid-template:minmax(0,1fr) / minmax(0,1fr) minmax(0,.8fr);align-items:center;padding:0 4% 0 0;border-inline-end:0;border-bottom:1px solid var(--line)}
  & .movement:last-child {border-bottom:0}
  & .caption {text-align:start;font-size:clamp(11px,7cqw,21px)}
}
@container stretch-card (min-aspect-ratio:3.6/1) {
  & .routine {grid-template: minmax(0,1fr) 3px / minmax(0,.56fr) minmax(0,2fr)}
  & .routine-bar {flex-direction:column;align-items:start;justify-content:center;gap:.55em;padding:0 12%;font-size:clamp(11px,min(3.9cqw,16cqh),25px)}
  & .ruler {grid-column:1/-1}
  & .movement {grid-template:minmax(0,1fr) / minmax(0,1fr) minmax(0,.85fr);align-items:center;padding:0 4% 0 0}
  & .caption {text-align:start;font-size:clamp(10px,min(2.6cqw,16cqh),21px)}
}`,
  });
}
