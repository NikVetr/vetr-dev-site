import { node, percent, scoreText } from './detail.mjs';

// Keep the point cloud on one canvas, with separate DOM markers for hover and
// selection. Moving the pointer never repaints thousands of recommendations.
export function recommendationPlot(inspect) {
  const panel = node('section'),
    head = node('div'),
    heading = node('h3', 'Recommendation scatterplot');
  panel.className = 'board recommendation-plot';
  const metric = document.createElement('select');
  metric.ariaLabel = 'Scatterplot vertical axis';
  const options = { shift: 'Rating change', rank: 'Rank change', sd: 'Predicted SD' };
  for (const [key, label] of Object.entries(options)) metric.add(new Option(label, key));
  head.className = 'plot-head';
  head.append(heading, metric);
  const meta = node('div'),
    count = node('span'),
    key = node('span');
  meta.className = 'plot-meta';
  key.className = 'plot-key';
  for (const [word, color] of [
    ['Above catalog', 'rise'],
    ['Below catalog', 'fall'],
    ['At catalog', 'flat'],
  ]) {
    const label = node('span', word);
    label.className = color;
    key.append(label);
  }
  meta.append(count, key);
  const area = node('div'),
    canvas = document.createElement('canvas');
  area.className = 'plot-area';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute(
    'aria-label',
    'Explore recommendations. Arrow keys move through entries. Enter opens item information.',
  );
  const marker = node('i'),
    cursor = node('i'),
    tip = node('div');
  marker.className = 'plot-marker';
  cursor.className = 'plot-marker hover-marker';
  tip.className = 'plot-tip';
  const readout = node('button'),
    footer = node('div'),
    previous = node('button', '‹'),
    next = node('button', '›');
  previous.ariaLabel = 'Previous plotted recommendation';
  next.ariaLabel = 'Next plotted recommendation';
  readout.className = 'plot-readout';
  readout.setAttribute('aria-live', 'polite');
  footer.className = 'plot-footer';
  footer.append(previous, readout, next);
  area.append(canvas, marker, cursor, tip);
  panel.append(head, meta, area, footer);
  let data,
    points = [],
    selected,
    hover = -1,
    active = 0,
    pointer = false;
  const number = (n) => scoreText(n, 2);
  const sign = (n) => (n > 0 ? '+' : '');
  function yText(n) {
    if (metric.value === 'rank') return sign(n) + n + ' places';
    if (metric.value === 'shift') return sign(n) + (data.binary ? number(n * 100) + ' pp' : number(n));
    return number(n);
  }
  function place(pin, point) {
    pin.hidden = !point;
    if (point) {
      pin.style.left = point.x + 'px';
      pin.style.top = point.y + 'px';
    }
  }
  function focusPoint() {
    const point = points[hover] ?? points[active];
    place(
      marker,
      points.find((pt) => pt.row.itemId === selected),
    );
    place(cursor, point);
    tip.hidden = !point || !pointer;
    previous.disabled = next.disabled = points.length < 2;
    readout.disabled = !point;
    if (!point) {
      readout.removeAttribute('aria-label');
      readout.textContent = 'No matching unrated entries';
      return;
    }
    const title = data.titles.get(point.row.itemId) ?? point.row.title;
    const expected = data.binary ? percent(point.row.expected) : number(point.row.expected);
    const values =
      expected +
      ' expected · ' +
      (metric.value === 'rank'
        ? yText(point.v)
        : yText(point.v) + ' ' + options[metric.value].toLowerCase());
    readout.ariaLabel = 'Open information for ' + title + '. ' + values;
    readout.replaceChildren(node('strong', title), node('small', values));
    if (!tip.hidden) {
      tip.replaceChildren(node('strong', title), node('small', values));
      const w = area.clientWidth,
        h = area.clientHeight;
      tip.style.left = Math.max(2, Math.min(point.x + 12, w - tip.offsetWidth - 3)) + 'px';
      tip.style.top =
        Math.max(2, Math.min(point.y - tip.offsetHeight - 10, h - tip.offsetHeight - 3)) + 'px';
    }
  }
  function draw() {
    if (!data || !panel.isConnected || !area.clientWidth) return;
    const w = area.clientWidth,
      h = area.clientHeight,
      dpr = Math.min(3, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'),
      style = getComputedStyle(panel);
    ctx.scale(dpr, dpr);
    const color = (k) => style.getPropertyValue('--' + k).trim();
    ctx.font = '12px ' + style.fontFamily;
    const L = 64,
      R = w - 18,
      T = 36,
      B = h - 52;
    const rows = data.rows;
    const val = (r) => (metric.value === 'rank' ? data.ranks.get(r.itemId).change : r[metric.value]);
    const [smin, smax] = [data.scale[0], data.scale.at(-1)];
    let xl = smax,
      xh = smin,
      yl = 0,
      yh = 0;
    for (const r of rows) {
      xl = Math.min(xl, r.expected);
      xh = Math.max(xh, r.expected);
      const y = val(r);
      yl = Math.min(yl, y);
      yh = Math.max(yh, y);
    }
    if (!rows.length) {
      xl = smin;
      xh = smax;
    }
    const pad = Math.max((xh - xl) * 0.04, (smax - smin) * 0.005);
    xl = Math.max(smin, xl - pad);
    xh = Math.min(smax, xh + pad);
    const extent = Math.max(Math.abs(yl), Math.abs(yh));
    if (!extent) {
      yh = metric.value === 'rank' ? 1 : (smax - smin) * 0.05;
      yl = metric.value === 'sd' ? 0 : -yh;
    } else {
      if (yl < 0) yl -= extent * 0.06;
      if (yh > 0) yh += extent * 0.06;
    }
    const x = (v) => L + ((R - L) * (v - xl)) / (xh - xl),
      y = (v) => B - ((B - T) * (v - yl)) / (yh - yl);
    const targetTicks = w < 405 ? 4 : 6;
    function ticks(lo, hi, integer = false) {
      const rough = (hi - lo) / (targetTicks - 1),
        unit = 10 ** Math.floor(Math.log10(rough)),
        fraction = rough / unit;
      const multiple = fraction <= 1.5 ? 1 : fraction <= 3 ? 2 : fraction <= 7 ? 5 : 10;
      const step = Math.max(integer ? 1 : 0, unit * multiple);
      return Array.from({ length: Math.max(0, Math.floor(hi / step) - Math.ceil(lo / step) + 1) }, (_, i) =>
        Number(((Math.ceil(lo / step) + i) * step).toPrecision(10)),
      );
    }
    function line(x1, y1, x2, y2, stroke) {
      ctx.beginPath();
      ctx.strokeStyle = stroke;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.fillStyle = color('muted');
    ctx.textAlign = 'center';
    for (const xv of ticks(xl, xh)) {
      line(x(xv), T, x(xv), B, color('edge'));
      ctx.fillText(data.binary ? Number((100 * xv).toPrecision(6)) + '%' : String(xv), x(xv), B + 17);
    }
    ctx.textAlign = 'right';
    for (const yv of ticks(yl, yh, metric.value === 'rank')) {
      line(L, y(yv), R, y(yv), color('edge'));
      ctx.fillText(
        metric.value === 'shift' && data.binary ? String(Number((100 * yv).toPrecision(6))) : String(yv),
        L - 7,
        y(yv) + 4,
      );
    }
    ctx.fillStyle = color('text');
    ctx.textAlign = 'left';
    ctx.fillText(
      options[metric.value] +
        (metric.value === 'rank'
          ? ' (places)'
          : metric.value === 'shift' && data.binary
            ? ' (percentage points)'
            : ''),
      L,
      T - 14,
    );
    ctx.textAlign = 'center';
    ctx.fillText(data.expectedLabel, (L + R) / 2, h - 12);
    if (yl <= 0 && yh >= 0) {
      ctx.setLineDash([4, 3]);
      line(L, y(0), R, y(0), color('muted'));
      ctx.setLineDash([]);
    }
    const colors = [color('fall'), color('muted'), color('rise')];
    ctx.globalAlpha = rows.length > 2000 ? 0.44 : 0.7;
    points = rows.map((row) => {
      const v = val(row),
        px = x(row.expected),
        py = y(v);
      ctx.fillStyle = colors[1 + Math.sign(row.shift)];
      ctx.beginPath();
      ctx.arc(px, py, rows.length > 2000 ? 2 : 3, 0, 2 * Math.PI);
      ctx.fill();
      return { row, x: px, y: py, v };
    });
    focusPoint();
  }
  function nearest(e) {
    const rect = canvas.getBoundingClientRect();
    let best = -1,
      distance = (e.pointerType === 'touch' ? 24 : 14) ** 2;
    points.forEach((pt, i) => {
      const d = (pt.x - e.clientX + rect.left) ** 2 + (pt.y - e.clientY + rect.top) ** 2;
      if (d < distance) {
        best = i;
        distance = d;
      }
    });
    return best;
  }
  canvas.onpointermove = (e) => {
    const i = nearest(e);
    if (i !== hover || !pointer) {
      hover = i;
      pointer = i >= 0;
      focusPoint();
    }
  };
  canvas.onpointerleave = () => {
    hover = -1;
    pointer = false;
    focusPoint();
  };
  function step(i) {
    if (!points.length) return;
    active = (i + points.length) % points.length;
    hover = -1;
    pointer = false;
    focusPoint();
  }
  function open(i, visit = false) {
    if (!points[i]) return;
    active = i;
    selected = points[i].row.itemId;
    hover = -1;
    pointer = false;
    focusPoint();
    inspect(selected, visit);
  }
  canvas.onclick = (e) => open(nearest(e));
  canvas.onkeydown = (e) => {
    const move = {
      ArrowRight: active + 1,
      ArrowDown: active + 1,
      ArrowLeft: active - 1,
      ArrowUp: active - 1,
      Home: 0,
      End: points.length - 1,
    };
    if (e.key in move) {
      e.preventDefault();
      step(move[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(active);
    } else if (e.key === 'Escape') {
      hover = -1;
      pointer = false;
      focusPoint();
    }
  };
  previous.onclick = () => step(active - 1);
  next.onclick = () => step(active + 1);
  readout.onclick = () => open(active, true);
  metric.onchange = () => {
    hover = -1;
    pointer = false;
    draw();
  };
  new ResizeObserver(draw).observe(area);
  new MutationObserver(draw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return {
    panel,
    render(view, id) {
      data = { ...view, rows: [...view.rows].reverse() };
      selected = id;
      hover = -1;
      pointer = false;
      options.shift = view.binary ? 'Probability change' : 'Rating change';
      metric.options[0].textContent = options.shift;
      count.textContent =
        view.rows.length.toLocaleString() + ' unrated' + (view.rated ? '' : ' · Catalog baseline');
      active = Math.max(
        0,
        data.rows.findIndex((r) => r.itemId === id),
      );
      draw();
    },
    select(id) {
      selected = id;
      if (panel.isConnected) {
        const i = points.findIndex((p) => p.row.itemId === id);
        if (i >= 0) active = i;
        focusPoint();
      }
    },
  };
}
