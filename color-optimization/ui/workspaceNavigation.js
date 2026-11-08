// Navigation and disclosure state only; settings remain owned by the optimizer UI.
const narrow = matchMedia('(max-width: 1100px)');
const sections = /** @type {HTMLDetailsElement[]} */ ([...document.querySelectorAll('.settings-section')]);
const narrowOpen = new Map(sections.map((section) => [section, false]));
let wasNarrow = narrow.matches;

function adaptSections() {
  if (wasNarrow && !narrow.matches) {
    for (const section of sections) narrowOpen.set(section, section.open);
  }
  for (const section of sections) section.open = narrow.matches ? narrowOpen.get(section) === true : true;
  wasNarrow = narrow.matches;
}
narrow.addEventListener('change', adaptSections);
adaptSections();

for (const link of document.querySelectorAll('.workspace-nav a')) {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href') || '');
    if (!(target instanceof HTMLElement)) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
}

// A browser validation message must never point into a closed disclosure.
document.addEventListener('invalid', (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  const section = event.target.closest('.settings-section');
  if (section instanceof HTMLDetailsElement) section.open = true;
}, true);
