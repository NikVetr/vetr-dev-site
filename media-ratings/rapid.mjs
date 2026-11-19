import { node, shortAnnotations } from './detail.mjs';
import { recognitionFor } from './recognition.mjs';

function shortcuts(scale, stars) {
  if (stars) return scale.map((v) => ({ digit: Math.ceil(v), shift: !Number.isInteger(v) }));
  const sameValue = scale.every((v) => Number.isInteger(v) && v >= 0 && v <= 9);
  return scale.map((v, i) => ({ digit: sameValue ? v : i < 10 ? (i + 1) % 10 : null, shift: false }));
}

function link(text, url) {
  const a = node('a', text);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function openRapidRating({ catalog, stars, ids, titles, links, criteria, rank, save }) {
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
    order,
    cardVersion = 0;
  picker.replaceChildren(...criteria.map(([key, caption]) => new Option(caption, key)));
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
    const version = ++cardVersion,
      item = items.get(id);
    const imageSlot = el('rapid-image'),
      description = el('rapid-description'),
      article = el('rapid-article');
    imageSlot.replaceChildren();
    imageSlot.hidden = true;
    description.textContent = '';
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
    el('rapid-meta').textContent = item ? shortAnnotations(item.annotations ?? {}) : '';
    if (!item) return;
    function showImages(photos) {
      const [photo, ...fallback] = photos;
      if (!photo || !dialog.open || version !== cardVersion) return;
      const img = node('img');
      img.alt = photo.title + ' · ' + titles.get(id);
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        if (version === cardVersion && dialog.open) imageSlot.hidden = false;
      };
      img.onerror = () => showImages(fallback);
      const source = link('', photo.sourceUrl);
      source.ariaLabel = photo.title + ' · image source';
      source.append(img);
      const credit = node('figcaption');
      if (photo.caption) credit.append(node('strong', photo.caption), ' · ');
      credit.append(link(photo.credit || 'Image source', photo.sourceUrl));
      if (photo.license)
        credit.append(' · ', photo.licenseUrl ? link(photo.license, photo.licenseUrl) : photo.license);
      imageSlot.replaceChildren(source, credit);
      img.src = photo.url;
    }
    const reference = links?.[id];
    if (reference?.sourceUrl) {
      article.append(link(reference.label + ' ↗', reference.sourceUrl));
      if (reference.imageUrl)
        showImages([
          {
            url: reference.imageUrl,
            sourceUrl: reference.sourceUrl,
            title: titles.get(id),
            credit: reference.label,
          },
        ]);
    }
    const wiki = reference?.wikipedia;
    if (wiki) {
      article.append(link('Wikipedia ↗', wiki));
      recognitionFor(wiki)
        .then((card) => {
          if (!dialog.open || version !== cardVersion || !card) return;
          description.textContent = card.description;
          showImages([card.poster, card.image].filter(Boolean));
        })
        .catch(() => {
          if (version === cardVersion && dialog.open)
            description.textContent = 'Article preview unavailable.';
        });
    }
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
    order = null;
    advance();
    focusCard();
  };
  dialog.onkeydown = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.target === picker) return;
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
    ++cardVersion;
    dialog.onkeydown = null;
    dialog.onclose = null;
    save(answers);
  };
  dialog.showModal();
  advance();
  focusCard();
}
