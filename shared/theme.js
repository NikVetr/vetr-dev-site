// The site's light or dark theme: one choice for every page, kept in this browser under
// "vetr:theme", or else the system setting. Load it as a plain script in <head>, so the theme
// is set before the first paint. A page's button#theme-toggle switches it; a page that draws
// in theme colours redraws on the document's "themechange" event.
(() => {
  const KEY = 'vetr:theme';
  // These three tools previously stored their own choice. Adopt the current page's
  // preference only until the visitor has made a valid collection-wide choice.
  /** @type {Record<string, string>} */
  const LEGACY_KEYS = {
    crossword: 'crossword:theme',
    'raster-to-vector': 'raster-to-vector:theme',
    'forecast-calibration': 'forecast-calibration:theme',
  };
  const root = document.documentElement;
  const system = matchMedia('(prefers-color-scheme: dark)');
  const chosen = () => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      const legacyKey = LEGACY_KEYS[location.pathname.split('/')[1]];
      const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
      if (legacy === 'light' || legacy === 'dark') {
        try { localStorage.setItem(KEY, legacy); } catch { /* use it for this page */ }
        return legacy;
      }
    } catch { /* storage may be unavailable */ }
    return null;
  };
  const current = () => chosen() ?? (system.matches ? 'dark' : 'light');

  function showToggle() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const dark = root.dataset.theme === 'dark';
    button.textContent = dark ? '☾ Dark' : '☀ Light';
    button.setAttribute('aria-pressed', String(dark));
    button.title = `Switch to the ${dark ? 'light' : 'dark'} theme`;
  }

  /** @param {string} theme */
  function apply(theme) {
    root.dataset.theme = theme;
    showToggle();
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }

  root.dataset.theme = current();
  system.addEventListener('change', () => { if (!chosen()) apply(current()); });
  document.addEventListener('DOMContentLoaded', () => {
    showToggle();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* the choice just is not remembered */ }
      apply(next);
    });
  });
})();
