// Photos stay in memory until the user hands them to a share target or saves a copy.
function isPhoto(file) {
  return file.type.startsWith('image/') ||
    (!file.type && /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(file.name));
}

export function setupPhotos(update, getPrompt) {
  /** @type {{file: File, url: string}[]} */
  const files = [];
  const byId = (id) => document.getElementById(id);
  const button = (id) => /** @type {HTMLButtonElement} */ (byId(id));
  const list = byId('photo-list'), status = byId('photo-status');
  const dialog = /** @type {HTMLDialogElement} */ (byId('page-review'));
  const image = /** @type {HTMLImageElement} */ (byId('review-image'));
  const savePdf = /** @type {HTMLAnchorElement} */ (byId('save-pdf'));
  const replace = /** @type {HTMLInputElement} */ (byId('replace-page'));
  let pageIndex = 0, conversion = null, pdf = null;

  function review(index) {
    pageIndex = index;
    byId('page-heading').textContent = 'Menu page ' + (index + 1) + ' of ' + files.length;
    byId('review-image-status').textContent = '';
    button('zoom-page').setAttribute('aria-pressed', 'false');
    image.classList.remove('actual-size');
    image.alt = 'Menu page ' + (index + 1);
    image.src = files[index].url;
    image.parentElement.scrollTo(0, 0);
    button('previous-page').disabled = index === 0;
    button('next-page').disabled = index === files.length - 1;
    if (!dialog.open) dialog.showModal();
  }
  image.addEventListener('error', () => {
    byId('review-image-status').textContent = 'This browser cannot display this photo. You can replace it or share the original.';
  });
  button('previous-page').addEventListener('click', () => review(pageIndex - 1));
  button('next-page').addEventListener('click', () => review(pageIndex + 1));
  button('zoom-page').addEventListener('click', () => {
    const actual = image.classList.toggle('actual-size');
    button('zoom-page').setAttribute('aria-pressed', String(actual));
  });
  button('close-page').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const thumbnail = /** @type {HTMLButtonElement} */ (list.getElementsByClassName('review-page')[pageIndex]);
    thumbnail?.focus();
  });
  replace.addEventListener('change', () => {
    const file = replace.files[0];
    replace.value = '';
    if (!file) return;
    if (!isPhoto(file)) {
      byId('review-image-status').textContent = 'Choose an image file to replace this page.';
      return;
    }
    const previous = files[pageIndex];
    files[pageIndex] = { file, url: URL.createObjectURL(file) };
    render();
    review(pageIndex);
    URL.revokeObjectURL(previous.url);
    status.textContent = 'Page ' + (pageIndex + 1) + ' replaced.';
    update();
  });

  button('prepare-pdf').addEventListener('click', async () => {
    const job = new AbortController();
    conversion = job;
    const pages = files.map(({ file }) => file);
    button('prepare-pdf').disabled = true;
    status.textContent = 'Preparing menu PDF…';
    try {
      const { menuPdf } = await import('./menu-pdf.mjs');
      const result = await menuPdf(pages, job.signal);
      if (job.signal.aborted) return;
      pdf = result;
      savePdf.href = URL.createObjectURL(pdf);
      savePdf.hidden = false;
      button('share-pdf').hidden = !supportsShare([pdf]);
      button('prepare-pdf').hidden = true;
      if (byId('photo-pdf-tools').getClientRects().length) savePdf.focus();
      status.textContent = pages.length === 1 ? 'One page ready.' : pages.length + ' pages ready in order.';
    } catch (error) {
      if (!job.signal.aborted) status.textContent = error.message;
    } finally {
      if (conversion === job) {
        conversion = null;
        button('prepare-pdf').disabled = false;
      }
    }
  });
  button('share-pdf').addEventListener('click', async () => {
    const text = getPrompt();
    if (!pdf || !text.trim()) {
      status.textContent = 'Complete the prompt before sharing.';
      return;
    }
    try {
      await navigator.share({ text, files: [pdf] });
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Save the PDF and attach it with a copy of the prompt.';
    }
  });
  function render() {
    conversion?.abort();
    conversion = null;
    if (pdf) URL.revokeObjectURL(savePdf.href);
    pdf = null;
    savePdf.removeAttribute('href');
    savePdf.hidden = true;
    button('share-pdf').hidden = true;
    button('prepare-pdf').disabled = button('prepare-pdf').hidden = false;
    byId('photo-pdf-tools').hidden = !files.length;
    list.replaceChildren();
    files.forEach(({ file, url }, i) => {
      const row = document.createElement('div');
      row.className = 'photo-row';
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.className = 'review-page';
      inspect.setAttribute('aria-label', 'Review menu page ' + (i + 1));
      inspect.append(img);
      inspect.addEventListener('click', () => review(i));
      const caption = document.createElement('div');
      caption.className = 'photo-caption';
      caption.textContent = 'Page ' + (i + 1);
      const name = document.createElement('span');
      name.className = 'photo-name';
      name.textContent = file.name;
      caption.append(name);
      const save = document.createElement('a');
      save.href = url;
      save.download = file.name;
      save.textContent = 'Save';
      save.setAttribute('aria-label', 'Save a copy of page ' + (i + 1));
      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      actions.append(save);
      row.append(inspect, caption, actions);
      for (const [action, label] of [
        ['up', '↑'],
        ['down', '↓'],
        ['remove', '×']
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute(
          'aria-label',
          action === 'remove' ? 'Remove page ' + (i + 1) : 'Move page ' + (i + 1) + ' ' + action
        );
        b.disabled = (action === 'up' && i === 0) || (action === 'down' && i === files.length - 1);
        b.addEventListener('click', () => {
          const j = action === 'up' ? i - 1 : i + 1;
          if (action === 'remove') {
            files.splice(i, 1);
            URL.revokeObjectURL(url);
          } else [files[i], files[j]] = [files[j], files[i]];
          render();
          update();
          status.textContent =
            action === 'remove' ? 'Page removed.' : 'Page moved to position ' + (j + 1) + '.';
          const next = list.children[Math.min(action === 'remove' ? i : j, files.length - 1)];
          if (next) next.querySelector('button').focus();
          else byId('photos').focus();
        });
        actions.append(b);
      }
      list.append(row);
    });
  }
  for (const id of ['photos', 'camera']) {
    const input = /** @type {HTMLInputElement} */ (document.getElementById(id));
    input.addEventListener('change', () => {
      let rejected = 0;
      const previousCount = files.length;
      for (const file of input.files || []) {
        if (!isPhoto(file)) {
          rejected++;
          continue;
        }
        files.push({ file, url: URL.createObjectURL(file) });
      }
      input.value = '';
      if (files.length !== previousCount) {
        render();
        update();
      }
      status.textContent = rejected ? 'Only image files can be added as menu pages.' : '';
    });
  }
  return () => files.map((entry) => entry.file);
}

export function supportsShare(files) {
  if (typeof navigator.share !== 'function') return false;
  if (!files.length) return true;
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}
