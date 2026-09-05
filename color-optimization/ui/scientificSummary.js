export function attachScientificSummary() {
  const trigger = document.getElementById('scientific-summary-btn');
  const dialog = document.getElementById('scientific-summary-dialog');
  const body = dialog.querySelector('.science-body');
  let loaded = false;
  let loading = false;
  trigger.addEventListener('click', async () => {
    if (!dialog.open) dialog.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    if (loaded || loading) return;
    loading = true;
    body.setAttribute('aria-busy', 'true');
    body.innerHTML = '<p class="science-message" role="status">Loading scientific summary…</p>';
    try {
      const response = await fetch('scientific-summary.html');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      const article = document.querySelector('.research-note');
      if (!article) throw new Error('Research note content is missing.');
      body.replaceChildren(article);
      // Keep citation navigation inside the note without changing the app's URL or history.
      article.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#science-"]');
        if (!link) return;
        const target = article.querySelector(link.getAttribute('href'));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ block: 'start' });
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      });
      loaded = true;
    } catch (error) {
      body.innerHTML = '<p class="science-message" role="alert">The scientific summary could not be loaded. Close and reopen to retry, or use the “Open page” link.</p>';
      console.error('Scientific summary:', error);
    } finally {
      loading = false;
      body.setAttribute('aria-busy', 'false');
    }
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus({ preventScroll: true });
  });
}
