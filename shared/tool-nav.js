// Direct explanation links open their destination without adding header controls.
/** @param {HTMLDetailsElement} target */
function revealToolHelp(target) {
    if (target instanceof HTMLDetailsElement) target.open = true;
    const focus = target instanceof HTMLDetailsElement ? target.querySelector('summary') : target;
    if (focus instanceof HTMLElement) {
      if (!focus.hasAttribute('tabindex') && focus.tagName !== 'SUMMARY') focus.tabIndex = -1;
      focus.focus({ preventScroll: true });
    }
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
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
