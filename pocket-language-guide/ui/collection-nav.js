// Help opens the tool's existing explanation or invokes its existing dialog button.
/** @param {Element} target @param {HTMLElement} [invoker] */
function revealToolHelp(target, invoker) {
    if (target instanceof HTMLDialogElement) {
      target.showModal();
      return;
    }
    if (target instanceof HTMLButtonElement) {
      const dialogId = target.getAttribute('aria-controls');
      const dialog = dialogId ? document.getElementById(dialogId) : null;
      if (dialog instanceof HTMLDialogElement && invoker) {
        dialog.addEventListener('close', () => invoker.focus({ preventScroll: true }), { once: true });
      }
      target.click();
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
    revealToolHelp(target, /** @type {HTMLElement} */ (link));
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
