// Title loadings and viewer positions use different PCA coordinates. The two
// scales share their poles and zero, so a title can illustrate either direction.
const loadingOrder = new WeakMap();
function nearestTitles(axis, titles, position) {
  let order = loadingOrder.get(axis.loadings);
  if (!order) {
    order = axis.loadings.map((_, i) => i).sort((a, b) => axis.loadings[a] - axis.loadings[b]);
    loadingOrder.set(axis.loadings, order);
  }
  const low = axis.loadings[axis.low], high = axis.loadings[axis.high];
  const target = low < 0 && high > 0 ? Math.abs(position) / 100 * (position < 0 ? low : high)
    : low + (position + 100) / 200 * (high - low);
  let lo = 0, hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (axis.loadings[order[mid]] < target) lo = mid + 1;
    else hi = mid;
  }
  return order.slice(Math.max(0, lo - 3), lo + 3)
    .sort((a, b) => Math.abs(axis.loadings[a] - target) - Math.abs(axis.loadings[b] - target))
    .slice(0, 3).map(i => titles[i].title);
}

export function renderAxisRails(host, summaries, axes, items, rated, continuous) {
  const rows = document.createDocumentFragment();
  summaries.forEach((summary, i) => {
    const axis = axes[i];
    const row = document.createElement('div');
    row.className = 'axis-row';
    const number = document.createElement('small');
    number.className = 'axis-number';
    number.textContent = 'PC' + (axis.index + 1);
    const variance = document.createElement('small');
    variance.className = 'axis-fraction';
    variance.textContent = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1}).format(axis.fraction);
    variance.title = 'Share of ' + (continuous ? 'latent variance' : 'between-group variance');
    const [left, right] = [summary.low, summary.high].map(text => {
      const pole = document.createElement('span');
      pole.className = 'axis-pole';
      pole.textContent = pole.title = text;
      return pole;
    });
    const track = document.createElement('div');
    track.className = 'axis-track';
    const score = Math.max(-3, Math.min(3, summary.standardScore));
    track.style.setProperty('--position', (50 + score * 50 / 3) + '%');
    track.style.setProperty('--band-start', (50 + Math.min(0, score) * 50 / 3) + '%');
    track.style.setProperty('--band-width', (Math.abs(score) * 50 / 3) + '%');
    const mark = document.createElement('i');
    const position = (rated ? 'Your position' : 'Catalog center') + ' · ' + summary.standardScore.toFixed(2) + ' SD';
    const control = document.createElement('input');
    control.type = 'range';
    control.min = '-100'; control.max = '100'; control.step = '1'; control.value = '0';
    control.setAttribute('aria-label', number.textContent + ' · Explore ' + summary.low + ' to ' + summary.high + '. ' + position);
    const examples = document.createElement('div');
    examples.className = 'axis-examples';
    examples.hidden = true;
    const display = () => {
      const value = control.valueAsNumber;
      const side = value === 0 ? 'Near neutral' : value < 0 ? 'Toward ' + summary.low : 'Toward ' + summary.high;
      const desc = side + ' · ' + nearestTitles(axis, items, value).join(' · ');
      examples.textContent = desc;
      control.setAttribute('aria-valuetext', desc);
      examples.hidden = false;
    };
    control.oninput = display;
    control.onfocus = display;
    control.onblur = () => { examples.hidden = true; };
    control.onpointermove = e => {
      if (e.pointerType === 'touch') return;
      const rect = control.getBoundingClientRect();
      control.value = String(Math.round((e.clientX - rect.left) / rect.width * 200 - 100));
      display();
    };
    control.onpointerleave = () => { if (control !== document.activeElement) examples.hidden = true; };
    control.onclick = display;
    track.title = position;
    track.append(mark, control);
    row.append(number, left, track, right, variance, examples);
    rows.append(row);
  });
  host.replaceChildren(rows);
  if (!summaries.length) host.textContent = 'No measurable variation on these axes.';
}
