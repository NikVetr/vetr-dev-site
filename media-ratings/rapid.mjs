import { familiarityControl } from './question-control.mjs';
import { node, shortAnnotations } from './detail.mjs';
import { recognitionLink as link, showRecognition } from './recognition.mjs';

function shortcuts(scale, stars) {
  if (stars) return scale.map((v) => ({ digit: Math.ceil(v), shift: !Number.isInteger(v) }));
  if (scale.length === 11 && scale.every((v, i) => v === i))
    return scale.map(v => ({ digit: v % 10, shift: v === 10 }));
  const sameValue = scale.every((v) => Number.isInteger(v) && v >= 0 && v <= 9);
  return scale.map((v, i) => ({ digit: sameValue ? v : i < 10 ? (i + 1) % 10 : null, shift: false }));
}

export function openRapidRating({ catalog, stars, ids, titles, links, criteria, rank, familiarity, save }) {
  const dialog = /** @type {HTMLDialogElement} */ (document.getElementById('rapid-rating'));
  if (dialog.open) return;
  const el = (id) => document.getElementById(id);
  const stage = el('rapid-card'),
    picker = /** @type {HTMLSelectElement} */ (el('rapid-order')),
    scale = catalog.scale;
  const buttons = el('rapid-values'),
    back = /** @type {HTMLButtonElement} */ (el('rapid-back')),
    skip = /** @type {HTMLButtonElement} */ (el('rapid-skip'));
  const items = new Map(catalog.items.map((it) => [it.itemId, it]));
  const keys = shortcuts(scale, stars);
  const answers = new Map(),
    skipped = new Set(),
    history = [];
  let current,
    selectedIndex,
    order;
  picker.replaceChildren(...criteria.map(([key, caption]) => new Option(caption, key)));
  const balance = el('rapid-balance');
  balance.replaceChildren();
  balance.hidden = !familiarity || picker.value !== 'info';
  if (familiarity) balance.append(familiarityControl('rapid-familiarity', familiarity.weight, weight => {
    familiarity.set(weight);
    order = null;
    advance();
  }));
  const focusCard = () => stage.focus({ preventScroll: true });
  const labelAt = (i) => String(catalog.scaleLabels?.[i] ?? scale[i]) + (stars ? ' ★' : '');
  el('rapid-instructions').textContent = stars
    ? '1–5 rate whole stars. ' +
      (scale.some((v) => !Number.isInteger(v)) ? 'Hold Shift for the half-star below. ' : '') +
      'Or choose with ← → and press Enter.'
    : 'Use the keys shown, or choose with ← → and press Enter.';
  const controls = scale.map((_, i) => {
    const b = node('button');
    b.type = 'button';
    b.append(node('span', labelAt(i)));
    if (keys[i].digit !== null) b.append(node('kbd', (keys[i].shift ? '⇧' : '') + keys[i].digit));
    b.ariaLabel = 'Rate ' + labelAt(i);
    b.onclick = () => accept(i);
    return b;
  });
  buttons.replaceChildren(...controls);
  function highlight(i) {
    selectedIndex = i;
    controls.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }
  function advance() {
    order ??= rank(picker.value, answers);
    present(order.find((id) => !answers.has(id) && !skipped.has(id)));
  }
  function present(id, lastIndex = null) {
    current = id;
    const item = items.get(id);
    const imageSlot = el('rapid-image'),
      description = el('rapid-description'),
      article = el('rapid-article');
    const reference = links?.[id];
    if (stage.dataset.id !== id || !item) description.textContent = '';
    showRecognition(imageSlot, reference, titles.get(id), text => { description.textContent = text; });
    article.replaceChildren();
    back.disabled = !history.length;
    skip.disabled = !item;
    buttons.hidden = !item;
    el('rapid-instructions').hidden = !item;
    stage.dataset.id = id ?? '';
    el('rapid-progress').textContent =
      answers.size +
      ' rated · ' +
      skipped.size +
      ' skipped · ' +
      (ids.length - answers.size - skipped.size) +
      ' remaining';
    highlight(lastIndex ?? Math.floor(scale.length / 2));
    el('rapid-title').textContent = item
      ? titles.get(id)
      : ids.length
        ? 'You’ve reached the end'
        : 'No unrated entries in this view';
    el('rapid-meta').textContent = item
      ? [catalog.responsePrompt, shortAnnotations(item.annotations ?? {})].filter(Boolean).join(' · ')
      : '';
    if (!item) return;
    if (reference?.sourceUrl) article.append(link(reference.label + ' ↗', reference.sourceUrl));
    if (reference?.royalRoad) article.append(link('Royal Road ↗', reference.royalRoad));
    if (reference?.wikipedia) article.append(link('Wikipedia ↗', reference.wikipedia));
  }
  function accept(i) {
    if (!current || i === null) return;
    history.push({ id: current, index: i });
    answers.set(current, { value: scale[i], date: new Date().toISOString().slice(0, 10) });
    order = null;
    advance();
    focusCard();
  }
  function pass() {
    if (!current) return;
    history.push({ id: current, index: null });
    skipped.add(current);
    advance();
    focusCard();
  }
  function previous() {
    const last = history.pop();
    if (!last) return;
    answers.delete(last.id);
    skipped.delete(last.id);
    order = null;
    present(last.id, last.index);
    focusCard();
  }
  skip.onclick = pass;
  back.onclick = previous;
  picker.onchange = () => {
    balance.hidden = !familiarity || picker.value !== 'info';
    order = null;
    advance();
    focusCard();
  };
  dialog.onkeydown = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.target === picker || (e.target instanceof Node && balance.contains(e.target))) return;
    if (
      e.repeat &&
      (e.key === 'Enter' ||
        /^(Digit|Numpad)\d$/.test(e.code) ||
        ['s', 'b', 'backspace'].includes(e.key.toLowerCase()))
    ) {
      e.preventDefault();
      return;
    }
    const direct = keys.findIndex(
      (k) =>
        k.digit !== null &&
        k.shift === e.shiftKey &&
        (e.key === String(k.digit) || ['Digit' + k.digit, 'Numpad' + k.digit].includes(e.code)),
    );
    const action = e.key.toLowerCase();
    if (direct >= 0) {
      e.preventDefault();
      accept(direct);
    } else if (action === 'b' || action === 'backspace') {
      e.preventDefault();
      previous();
    } else if (action === 's') {
      e.preventDefault();
      pass();
    } else if (current && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      highlight(Math.min(scale.length - 1, Math.max(0, selectedIndex + (forward ? 1 : -1))));
      focusCard();
    } else if (e.key === 'Enter' && e.target === stage && selectedIndex !== null) {
      e.preventDefault();
      accept(selectedIndex);
    }
  };
  dialog.onclose = () => {
    showRecognition(el('rapid-image'), null, '');
    dialog.onkeydown = null;
    dialog.onclose = null;
    save(answers);
  };
  dialog.showModal();
  advance();
  focusCard();
}
