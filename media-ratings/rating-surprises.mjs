import { heldOutRatings } from './core.mjs';
import { node, percent, signed } from './detail.mjs';

// Only start work once the fingerprint is on screen. Large comparisons can be
// requested explicitly and cancelled without holding up the rating controls.
export function surprisePanel(host, inspect) {
  const list = host.querySelector('ol'),
    note = host.querySelector('p');
  const order = host.querySelector('select'),
    run = host.querySelector('.check-ratings');
  let current,
    rows,
    visible = false,
    worker;
  const stop = () => {
    if (worker) {
      worker.onmessage = worker.onerror = null;
      worker.terminate();
      worker = null;
    }
  };
  function display() {
    const { catalog, titles } = current;
    const binary = catalog.scale.length === 2 && catalog.scale[0] === 0 && catalog.scale[1] === 1;
    const names = catalog.scaleLabels;
    const sorted = [...rows].sort((a, b) =>
      order.value === 'gap'
        ? Math.abs(b.gap) - Math.abs(a.gap) || a.probability - b.probability
        : a.probability - b.probability || Math.abs(b.gap) - Math.abs(a.gap),
    );
    const single = rows.length === 1;
    note.textContent = single
      ? 'Your first answer is compared with the catalog forecast.'
      : 'Each forecast uses your other ' +
        (rows.length - 1).toLocaleString() +
        (rows.length === 2 ? ' answer.' : ' answers.');
    if (!single) {
      const mean = (key) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
      note.textContent += binary
        ? ' You chose ' +
          (names?.[1] ?? 'positive') +
          ' on ' +
          percent(mean('observed')) +
          ' of entries. The forecasts averaged ' +
          percent(mean('expected')) +
          '.'
        : ' You averaged ' +
          mean('observed').toFixed(2) +
          ' against a forecast average of ' +
          mean('expected').toFixed(2) +
          '.';
    }
    if (names && !binary)
      note.textContent += ' Scale: ' + catalog.scale.map((v, i) => v + ' = ' + names[i]).join(', ') + '.';
    list.replaceChildren(
      ...sorted.slice(0, 5).map((row) => {
        const li = node('li'),
          button = node('button');
        button.type = 'button';
        const title = node('strong', titles.get(row.itemId) ?? row.title);
        const delta = node('b', binary ? signed(100 * row.gap) + ' pp' : signed(row.gap));
        delta.className = row.gap > 0 ? 'rise' : row.gap < 0 ? 'fall' : '';
        const answer = names?.[catalog.scale.indexOf(row.observed)] ?? String(row.observed);
        const forecast = binary
          ? percent(row.expected) + ' ' + (names?.[1] ?? 'positive').toLowerCase()
          : row.expected.toFixed(2);
        const chance = percent(row.probability);
        button.ariaLabel = title.textContent + '. Predicted ' + forecast + '. Your answer ' + answer +
          '. Gap ' + delta.textContent + '. Chance of your answer ' + chance + '.';
        const summary = node('small', 'Predicted ' + forecast + ' · You gave ' + answer + ' · Chance of answer ' + chance);
        button.append(title, node('span',forecast), node('span',answer), delta, node('span',chance),summary);
        button.onclick = () => inspect(row.itemId);
        li.append(button);
        return li;
      }),
    );
    host.querySelector('.surprise-columns').hidden = false;
    order.disabled = false;
    run.hidden = true;
  }
  function failed(error) {
    stop();
    note.textContent = 'Could not calculate held-out forecasts. ' + error.message;
    run.hidden = false;
    run.textContent = 'Retry';
  }
  function calculate() {
    if (!current || rows || worker) return;
    const { catalog, request, heavy } = current;
    try {
      if (!heavy) {
        rows = heldOutRatings(catalog, request);
        display();
        return;
      }
      worker = new Worker(new URL('./surprise-worker.mjs', import.meta.url), { type: 'module' });
      run.textContent = 'Cancel';
      note.textContent = 'Checking each answer against your other ratings…';
      worker.onmessage = ({ data }) => {
        stop();
        if (data.error) {
          failed(new Error(data.error));
          return;
        }
        rows = data.rows;
        display();
      };
      worker.onerror = failed;
      worker.postMessage({ catalog, request });
    } catch (error) {
      failed(error);
    }
  }
  order.onchange = () => {
    if (rows) display();
  };
  run.onclick = () => {
    if (!worker) {
      calculate();
      return;
    }
    stop();
    run.textContent = 'Check ratings';
    note.textContent = 'Comparison cancelled.';
  };
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && current && !current.heavy) calculate();
    },
    { rootMargin: '120px' },
  ).observe(host);
  return (catalog, request, titles) => {
    stop();
    rows = null;
    current = null;
    list.replaceChildren();
    host.querySelector('.surprise-columns').hidden = true;
    order.disabled = true;
    const n = Object.keys(request?.ratings ?? {}).length;
    run.hidden = true;
    if (!n) {
      note.textContent = 'Rate an entry to compare your answer with its forecast.';
      return;
    }
    const kind = catalog.models[request.model].kind;
    const heavy = kind === 'class-similarity' ? n > 100 : kind === 'latent-class' ? n > 1000 : n > 8;
    current = { catalog, request, titles, heavy };
    run.hidden = !heavy;
    run.textContent = 'Check ' + n.toLocaleString() + ' ratings';
    note.textContent = heavy
      ? 'Calculate a forecast for each rated entry with its answer withheld.'
      : 'Checking your ratings…';
    if (visible && !heavy) calculate();
  };
}
