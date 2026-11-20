const sources = {
  games: [
    { value: 'metacritic', label: 'Metacritic', note: '0–10' },
    {
      value: 'amazon-games',
      label: 'Amazon',
      note: '1–5 stars',
      description: 'Amazon platform editions · 1–5 stars',
    },
    { value: 'games', label: 'Steam', note: 'Thumbs' },
  ],
  food: [
    { value: 'food', label: 'Food.com', note: '1–5 stars' },
    { value: 'recipes', label: 'Taste of Home', note: '1–5 stars' },
  ],
  webfiction: [
    { value: 'royalroad-kindle', label: 'Royal Road', note: 'Kindle · 1–5 stars' },
    { value: 'webfiction', label: 'AO3', note: 'Kudos' },
  ],
};

export const sourceDomains = new Map();
for (const [domain, choices] of Object.entries(sources)) {
  for (const option of choices) sourceDomains.set(option.value, domain);
}
const lastSource = new Map();
export const catalogForDomain = (domain) => lastSource.get(domain) ?? sources[domain]?.[0].value ?? domain;

/** @param {HTMLElement} host @param {string} id @param {string} label
 * @param {{value:string,label:string,note?:string,description?:string}[]} options
 * @param {string} value @param {(value:string) => void} change @param {boolean} [visibleLabel] */
export function renderChoice(host, id, label, options, value, change, visibleLabel = true) {
  const hadFocus = host.contains(document.activeElement);
  host.replaceChildren();
  host.hidden = options.length < 2;
  if (host.hidden) return;
  const title = document.createElement('span');
  title.className = 'choice-label';
  title.id = id + '-label';
  title.textContent = label;
  if (visibleLabel) host.append(title);
  if (options.length > 3) {
    const menu = document.createElement('select');
    menu.id = id;
    if (visibleLabel) menu.setAttribute('aria-labelledby', title.id);
    else menu.ariaLabel = label;
    menu.append(...options.map((o) => new Option(o.description ?? o.label, o.value)));
    menu.value = value;
    menu.onchange = () => change(menu.value);
    host.append(menu);
    if (hadFocus) menu.focus({ preventScroll: true });
    return;
  }
  const group = document.createElement('div');
  group.id = id;
  group.className = 'choice-segments';
  group.setAttribute('role', 'radiogroup');
  if (visibleLabel) group.setAttribute('aria-labelledby', title.id);
  else group.ariaLabel = label;
  for (const option of options) {
    const button = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = id;
    input.value = option.value;
    input.checked = value === option.value;
    input.onchange = () => {
      if (input.checked) change(option.value);
    };
    const caption = document.createElement('span');
    caption.textContent = option.label;
    button.append(input, caption);
    if (option.note) {
      const note = document.createElement('small');
      note.textContent = option.note;
      button.append(note);
    }
    if (option.description) button.title = option.description;
    group.append(button);
  }
  host.append(group);
  const selected = group.querySelector('input:checked');
  if (hadFocus && selected instanceof HTMLInputElement) selected.focus({ preventScroll: true });
}

export function showSources(host, key, change) {
  const domain = sourceDomains.get(key);
  if (domain) lastSource.set(domain, key);
  renderChoice(host, 'catalog-source', 'Rating source', sources[domain] ?? [], key, change, false);
}
