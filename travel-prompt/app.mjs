import { modes, newRequest, waysToTravel } from './core/catalog.mjs';
import { submit } from './core/prompt.mjs';
import { setupPeople } from './people.mjs';
import { setupPhotos, supportsShare } from './photos.mjs';

const byId = (id) => document.getElementById(id);
const field = (id) =>
  /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} */ (byId(id));
const button = (id) => /** @type {HTMLButtonElement} */ (byId(id));
const promptBox = /** @type {HTMLTextAreaElement} */ (byId('prompt'));
const status = byId('output-status');
let mode = 'restaurant';
const drafts = Object.fromEntries(
  Object.keys(modes).map((key) => [key, { ...newRequest(), mode: key }])
);
const people = setupPeople(refresh);
const getPhotos = setupPhotos(refresh, () => mode === 'menu' ? promptBox.value : '');
const ids = [
  'place',
  'shortlist',
  'budget',
  'flexibility',
  'hunger',
  'notes',
  'travelTime',
  'needs',
  'checkIn',
  'checkOut',
  'property',
  'room',
  'budgetBasis',
  'visitDate',
  'visitLength',
  'focus',
  'menuText'
];
const bookingCounts = ['adults', 'children', 'roomCount'];
const geoAttempts = new Map();
const geoMessages = new Map();
let current = null;
function readDraft() {
  const d = drafts[mode];
  for (const id of ids) d[id] = field(id).value;
  if (mode === 'lodging') {
    for (const key of bookingCounts) {
      const input = /** @type {HTMLInputElement} */ (byId(key));
      d[key] = input.value || input.validity.badInput ? input.valueAsNumber : null;
    }
    const ages = field('childAges').value.trim();
    d.childAges = ages ? ages.split(',').map(age => /^\d+$/.test(age.trim()) ? Number(age) : NaN) : [];
  }
  d.timing = mode === 'menu' ? '' : field(mode + '-time').value;
  d.results = Number(field('results').value);
}
function refresh() {
  const d = drafts[mode];
  readDraft();
  d.photoCount = mode === 'menu' ? getPhotos().length : 0;
  const files = mode === 'menu' ? getPhotos() : [];
  const guestsStatus = byId('guests-status');
  guestsStatus.textContent = '';
  try {
    current = submit({ ...d, ...people.get() });
    promptBox.value = current.prompt;
    status.textContent = '';
    button('copy').disabled = false;
  } catch (error) {
    current = null;
    promptBox.value = '';
    status.textContent = error.message;
    const issueField = error.issues?.[0]?.path.split('[')[0];
    if (mode === 'lodging' && (issueField === 'childAges' || bookingCounts.includes(issueField)))
      guestsStatus.textContent = error.message;
    button('copy').disabled = true;
  }
  button('share').hidden = !supportsShare(files);
  button('share').disabled = !current;
  const shareLabel = files.length ? 'Share prompt + photos…' : 'Share…';
  if (button('share').textContent !== shareLabel) button('share').textContent = shareLabel;
  byId('share-hint').textContent = files.length
    ? 'Share the photos together, or make one PDF under Menu pages and attach it with the prompt.'
    : 'Preview what you’ll send to your assistant.';
}
function gps() {
  const d = drafts[mode],
    coords = d.coordinates;
  byId('gps-line').hidden = !coords;
  byId('gps-coords').textContent = coords
    ? coords.latitude.toFixed(5) + ', ' + coords.longitude.toFixed(5)
    : '';
  byId('location-status').textContent = geoMessages.get(mode) || '';
  button('locate').disabled = geoAttempts.has(mode);
}
function displayMode() {
  const d = drafts[mode];
  document
    .querySelectorAll('[data-mode]')
    .forEach((el) =>
      el.setAttribute('aria-pressed', String(el.getAttribute('data-mode') === mode))
    );
  document.querySelectorAll('[data-modes]').forEach((/** @type {HTMLElement} */ el) => {
    el.hidden = !el.dataset.modes.split(' ').includes(mode);
  });
  byId('mode-icon').setAttribute('href', '#' + modes[mode].icon + '-icon');
  byId('trip-title').textContent = modes[mode].heading;
  byId('budget-label').textContent = mode === 'lodging' ? 'Budget for all rooms' : 'Budget per person';
  byId('party-label').textContent = mode === 'lodging' ? 'Whose preferences?' : 'Who’s going?';
  byId('notes').setAttribute(
    'placeholder',
    mode === 'lodging'
      ? 'e.g. Near the station for an early train'
      : mode === 'outing'
        ? 'e.g. Somewhere indoors if it rains'
        : 'e.g. No pizza tonight, I had it yesterday'
  );
  for (const id of ids) field(id).value = d[id];
  if (mode !== 'menu') field(mode + '-time').value = d.timing;
  field('results').value = String(d.results);
  document
    .querySelectorAll('[data-transport]')
    .forEach((el) =>
      el.setAttribute('aria-pressed', String(d.travel.includes(el.getAttribute('data-transport'))))
    );
  people.setMode(mode);
  gps();
  refresh();
}
for (let n = 1; n <= 10; n++)
  /** @type {HTMLSelectElement} */ (byId('results')).add(new Option(String(n), String(n)));
for (const transport of waysToTravel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = transport;
  b.dataset.transport = transport;
  b.addEventListener('click', () => {
    const d = drafts[mode];
    d.travel = d.travel.includes(transport)
      ? d.travel.filter((t) => t !== transport)
      : [...d.travel, transport];
    b.setAttribute('aria-pressed', String(d.travel.includes(transport)));
    refresh();
  });
  byId('travel-modes').append(b);
}
for (const id of [...ids, ...bookingCounts, 'childAges', 'restaurant-time', 'lodging-time', 'outing-time', 'results']) {
  const control = field(id);
  control.addEventListener(control instanceof HTMLSelectElement ? 'change' : 'input', refresh);
}
document.querySelectorAll('[data-mode]').forEach((el) =>
  el.addEventListener('click', () => {
    mode = el.getAttribute('data-mode');
    displayMode();
  })
);
button('locate').addEventListener('click', () => {
  const key = mode,
    d = drafts[key];
  if (!navigator.geolocation) {
    geoMessages.set(key, 'Location is unavailable. Enter a place or landmark instead.');
    gps();
    return;
  }
  const attempt = Symbol();
  geoAttempts.set(key, attempt);
  geoMessages.set(key, 'Getting your location…');
  gps();
  function finish(coords, message) {
    if (geoAttempts.get(key) !== attempt) return;
    geoAttempts.delete(key);
    if (coords) d.coordinates = coords;
    geoMessages.set(key, message);
    if (mode === key) {
      gps();
      refresh();
    }
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, ''),
    () => finish(null, 'Could not get your location. You can enter a place or landmark.'),
    { maximumAge: 60000, timeout: 10000 }
  );
});
button('remove-location').addEventListener('click', () => {
  geoAttempts.delete(mode);
  drafts[mode].coordinates = null;
  geoMessages.delete(mode);
  gps();
  refresh();
});
button('copy').addEventListener('click', async () => {
  if (!current) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error();
    await navigator.clipboard.writeText(promptBox.value);
    status.textContent = 'Copied. Open your preferred assistant and paste the prompt.';
  } catch {
    promptBox.focus();
    promptBox.select();
    status.textContent = 'Prompt selected. Use your device’s Copy command.';
  }
});
button('share').addEventListener('click', async () => {
  if (!current) return;
  const files = mode === 'menu' ? getPhotos() : [];
  try {
    await navigator.share(
      files.length ? { text: promptBox.value, files } : { text: promptBox.value }
    );
    status.textContent = files.length
      ? 'Check that the receiving app included the text and every page.'
      : 'Share sheet closed.';
  } catch (e) {
    if (e.name !== 'AbortError')
      status.textContent =
        'Sharing did not finish. Copy the prompt and attach any photos in your assistant.';
  }
});
Object.assign(window, { TravelPrompt: { submit } });
displayMode();
