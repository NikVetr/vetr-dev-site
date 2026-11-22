import { rankingWeightControl } from './question-control.mjs';
import { node, shortAnnotations } from './detail.mjs';
import { recognitionLink as link, showRecognition } from './recognition.mjs';

function shortcuts(scale) {
  const nativeDigits = scale.every(v => Number.isInteger(v) && v >= 0 && v <= 10);
  return scale.map((v, i) => {
    if (nativeDigits) return v === 10 ? (scale.includes(0) ? 'T' : '0') : String(v);
    return i < 10 ? String(i) : null;
  });
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
  const keys = shortcuts(scale);
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
  if (familiarity) balance.append(rankingWeightControl('rapid-familiarity', familiarity.weight, weight => {
    familiarity.set(weight);
    order = null;
    advance();
  }));
  const focusCard = () => stage.focus({ preventScroll: true });
  const labelAt = (i) => String(catalog.scaleLabels?.[i] ?? scale[i]) + (stars ? ' ★' : '');
  el('rapid-instructions').textContent = 'Press a shortcut and release to rate, or choose with ← → and press Enter.';
  const controls = scale.map((_, i) => {
    const b = node('button');
    b.type = 'button';
    b.append(node('span', labelAt(i)));
    if (keys[i] !== null) b.append(node('kbd', keys[i]));
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
    if (reference?.ao3) article.append(link('AO3 ↗', reference.ao3));
    if (reference?.ffn) article.append(link('FanFiction.net ↗', reference.ffn));
    if (reference?.fanProgram) article.append(link('Fanfiction program ↗', reference.fanProgram));
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
  let pressed = null;
  function release() {
    pressed?.button.classList.remove('key-held');
    pressed = null;
  }
  function shortcutKey(e) {
    return /^(Digit|Numpad)\d$/.test(e.code) ? e.code.slice(-1) : e.key.toUpperCase();
  }
  dialog.onkeydown = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing || e.target === picker || (e.target instanceof Node && balance.contains(e.target))) return;
    const key = shortcutKey(e);
    const index = keys.indexOf(key);
    const button = index >= 0 && current ? controls[index]
      : key === 'S' ? skip : ['B','BACKSPACE'].includes(key) ? back
      : key === 'ENTER' && e.target === stage && current ? controls[selectedIndex] : null;
    if (button) {
      e.preventDefault();
      if (!pressed && !e.repeat && !button.disabled) {
        pressed = {key, button, item: current};
        button.classList.add('key-held');
      }
    } else if (!pressed && current && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const forward = e.key === 'ArrowRight' || e.key === 'ArrowUp';
      highlight(Math.min(scale.length - 1, Math.max(0, selectedIndex + (forward ? 1 : -1))));
      focusCard();
    }
  };
  dialog.onkeyup = (e) => {
    if (!pressed || shortcutKey(e) !== pressed.key) return;
    e.preventDefault();
    const {button, item} = pressed;
    release();
    if (item === current) button.click();
  };
  dialog.addEventListener('focusout', release);
  window.addEventListener('blur', release);
  dialog.onclose = () => {
    release();
    window.removeEventListener('blur', release);
    showRecognition(el('rapid-image'), null, '');
    dialog.removeEventListener('focusout', release);
    dialog.onkeydown = dialog.onkeyup = null;
    dialog.onclose = null;
    save(answers);
  };
  dialog.showModal();
  advance();
  focusCard();
}
