// Help opens the tool's explanation. Native help buttons keep their own handlers.
/** @param {Element} target */
function revealToolHelp(target) {
    if (target instanceof HTMLDialogElement) {
      target.showModal();
      return;
    }
    if (target instanceof HTMLDetailsElement) target.open = true;
    const focus = target instanceof HTMLDetailsElement ? target.querySelector('summary') : target;
    if (focus instanceof HTMLElement) {
      if (!focus.hasAttribute('tabindex') && focus.tagName !== 'SUMMARY') focus.tabIndex = -1;
      focus.focus({ preventScroll: true });
    }
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
}

for (const link of document.querySelectorAll('.tool-nav [data-tool-help]')) {
  link.addEventListener('click', (event) => {
    const selector = /** @type {HTMLElement} */ (link).dataset.toolHelp;
    const target = selector ? document.querySelector(selector) : null;
    if (!target) return; // Cross-page help links use ordinary navigation.
    event.preventDefault();
    revealToolHelp(target);
  });
}

// A subpage's Help link lands on a closed <details>; open it on arrival too.
function revealLinkedHelp() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) revealToolHelp(target);
}
addEventListener('hashchange', revealLinkedHelp);
revealLinkedHelp();
// Native fragment navigation can reset focus after deferred scripts have run.
addEventListener('load', () => requestAnimationFrame(revealLinkedHelp), { once: true });
