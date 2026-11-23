import {
  moves,
  locations,
  targets,
  limitations,
  equipment,
  reachableLocations,
  sources,
} from './core/catalog.js';
import { submit, reviewRoutine } from './core/plan.js';
import { renderMovement } from './demo.js';
import { setupSavedRoutines } from './saved-routines.js';
import { startSession } from './session.js';
import { setupCheckIn, showFeedback } from './check-in.js';
import { get, make, button, setPressed, formatTime, readLocal, writeLocal } from './dom.js';

const moveById = new Map(moves.map((move) => [move.id, move]));
const profileFields = [
  'limitations',
  'equipment',
  'discretion',
  'heightCm',
  'armspanCm',
  'avoidIds',
  'favoriteIds',
];
const blankProfile = { limitations: [], equipment: [], discretion: 'quiet', avoidIds: [], favoriteIds: [] };
let profile = readLocal('profile', null);
const withoutBackrest = (items) => items.filter(id => id !== 'firm-back');
// A previous profile can include the backrest from a different seat.
if (profile?.equipment) profile.equipment = withoutBackrest(profile.equipment);
const feedback = readLocal('movement-feedback', {});
const prefs = {
  location: 'plane-seat',
  seconds: 120,
  targets: [],
  availableLocations: [],
  allowFloor: false,
  ...blankProfile,
  ...(profile || {}),
  feedback,
};
const place = get('location', 'select');
const visibilityOptions = get('discretion', 'div').querySelectorAll('input');
const library = get('library', 'dialog');
const editor = get('edit', 'dialog');
const editMove = get('edit-move', 'select');
const editSeconds = get('edit-seconds', 'input');
const editReps = get('edit-reps', 'input');
const previewCanvas = get('preview-canvas', 'canvas');
const preview = get('preview', 'section');
const start = get('start', 'button');
const delayMotion = matchMedia('(prefers-reduced-motion: reduce)');
let previewPlaying = !delayMotion.matches,
  previewTime = delayMotion.matches ? 2 : 0,
  previous = 0,
  frame = 0,
  visible = true;
let plan,
  customSteps = null,
  selectedId = '',
  editing = -1;
const formError = get('form-error', 'p');
const poseLabel = { seated: 'Seated', standing: 'Standing', supine: 'Reclined' };
const poseName = (move) => poseLabel[move.pose] || move.pose;
const librarySelect = get('library-query', 'input');
const meas = ['heightCm', 'armspanCm', 'forwardCm', 'sideCm'];
const compact = matchMedia('(max-width:700px)');
const settingsToggle = get('toggle-settings', 'button');
let editingSettings = !compact.matches;
function showSetup() {
  settingsToggle.hidden = !compact.matches;
  const collapsed = compact.matches && !editingSettings;
  settingsToggle.setAttribute('aria-expanded', String(!collapsed));
  settingsToggle.textContent = collapsed ? 'Edit' : 'Done';
  get('settings', 'form').hidden = collapsed;
  document.querySelector('.settings-actions').toggleAttribute('hidden', collapsed);
  get('profile-status', 'output').hidden = collapsed;
  const summary = get('space-summary', 'p');
  summary.hidden = !collapsed;
  summary.textContent = [
    locations[prefs.location],
    Number.isFinite(prefs.seconds) ? formatTime(prefs.seconds) : '',
    ...prefs.targets.map((t) => targets[t]),
  ]
    .filter(Boolean)
    .join(' · ');
}
settingsToggle.addEventListener('click', () => {
  editingSettings = !editingSettings;
  showSetup();
});
compact.addEventListener('change', () => {
  editingSettings = !compact.matches;
  showSetup();
});

function errorText(error) {
  const issue = error.issues?.[0];
  return issue ? issue.path + ' · ' + issue.message : error.message;
}
function drawPreview(now = performance.now()) {
  cancelAnimationFrame(frame);
  frame = 0;
  const move = moveById.get(selectedId);
  if (!move || preview.hidden || !visible || document.hidden || document.querySelector('dialog[open]')) {
    previous = 0;
    return;
  }
  const repaint = !previous || now - previous >= 1000 / 30 - 1;
  if (repaint) {
    if (previous && previewPlaying) previewTime += Math.min(now - previous, 160) / 1000;
    previous = now;
    renderMovement(previewCanvas, move, previewTime, {
      location: prefs.location,
      dark: document.documentElement.dataset.theme === 'dark',
    });
  }
  if (previewPlaying) frame = requestAnimationFrame(drawPreview);
}
function restartPreview() {
  previous = 0;
  drawPreview();
}
function syncAnimation() {
  const animate = get('animate', 'button');
  animate.textContent = previewPlaying ? 'Ⅱ' : '▶';
  animate.setAttribute('aria-label', previewPlaying ? 'Pause demonstration' : 'Play demonstration');
  restartPreview();
}
function watchPreview() {
  const watch = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    restartPreview();
  });
  watch.observe(previewCanvas);
  new ResizeObserver(restartPreview).observe(previewCanvas);
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', restartPreview);
  document.addEventListener('visibilitychange', restartPreview);
  document.addEventListener('themechange', restartPreview);
  delayMotion.addEventListener('change', () => {
    previewPlaying = !delayMotion.matches;
    if (delayMotion.matches) previewTime = 2;
    syncAnimation();
  });
  get('animate', 'button').addEventListener('click', () => {
    previewPlaying = !previewPlaying;
    syncAnimation();
  });
  syncAnimation();
}
function showMovement(id) {
  const move = moveById.get(id);
  preview.hidden = !move;
  if (!move) {
    selectedId = '';
    restartPreview();
    return;
  }
  if (selectedId !== id) {
    previewTime = previewPlaying ? 0 : 2;
    get('evidence', 'details').open = false;
  }
  selectedId = id;
  get('preview-name', 'h3').textContent = move.name;
  get('preview-cue', 'p').textContent = move.cue;
  const info = get('source-info', 'div');
  const links = sourceLinks(move);
  info.replaceChildren(make('p', move.caution), make('p', move.evidence), links);
  for (const row of document.querySelectorAll('#steps .step')) {
    const active = row.getAttribute('data-move') === id;
    row.classList.toggle('selected', active);
    setPressed(row.querySelector('button'), active);
  }
  restartPreview();
}
function sourceLinks(move) {
  const links = make('p');
  move.sourceIds.forEach((key, i) => {
    const source = sources[key],
      a = make('a', source.title);
    a.href = source.url;
    a.target = '_blank';
    a.rel = 'noopener';
    if (i) links.append(' · ');
    links.append(a);
  });
  return links;
}
function renderPlan() {
  showSetup();
  const steps = plan?.steps || [];
  const list = get('steps', 'ol');
  list.replaceChildren(
    ...steps.map((step, i) => {
      const move = moveById.get(step.id);
      const row = make('li', '', 'step');
      row.dataset.move = move.id;
      const pick = button('', () => showMovement(move.id), 'step-picker'),
        text = make('span');
      pick.setAttribute('aria-label', 'Preview ' + move.name);
      text.append(
        make('strong', move.name),
        make(
          'small',
          step.seconds + ' s' + (step.reps ? ' · ' + step.reps + ' reps' : '') + ' · ' + poseName(move),
        ),
      );
      pick.append(make('span', String(i + 1).padStart(2, '0'), 'step-num'), text);
      const edit = button('Edit', () => openEditor(i), 'edit-step');
      edit.setAttribute('aria-label', 'Edit ' + move.name);
      row.append(pick, edit);
      return row;
    }),
  );
  get('routine-summary', 'p').textContent = steps.length
    ? formatTime(plan.totalSeconds) +
      ' · ' +
      steps.length +
      ' movement' +
      (steps.length === 1 ? '' : 's') +
      ' · ' +
      locations[prefs.location]
    : 'No routine for the current settings';
  start.disabled = !steps.length;
  const available = prefs.seconds - (plan?.totalSeconds || 0);
  get('add-step', 'button').hidden = !plan?.eligibleIds.length || available < 5;
  showMovement(steps.some((s) => s.id === selectedId) ? selectedId : steps[0]?.id);
  const messages = [];
  if (plan && !steps.length)
    messages.push(
      'No movement in this routine. You can adjust your selections or choose another available location.',
    );
  if (plan?.unmetTargets.length)
    messages.push('Outside this routine: ' + plan.unmetTargets.map((t) => targets[t]).join(', ') + '.');
  if (plan?.unmetFavorites.length)
    messages.push(
      'Favorites outside this routine: ' +
        plan.unmetFavorites.map((id) => moveById.get(id).name).join(', ') +
        '.',
    );
  const note = get('plan-note', 'div');
  note.replaceChildren(...messages.map((t) => make('p', t)));
  note.hidden = !messages.length;
  const alt = get('alternatives', 'div');
  alt.replaceChildren();
  alt.hidden = !plan?.alternatives.length;
  if (!alt.hidden) {
    alt.append(make('strong', 'More options when you can move'));
    for (const { location, additionalIds } of plan.alternatives) {
      const b = button('Use ' + locations[location] + ' (' + additionalIds.length + ' more)', () => {
        place.value = location;
        place.dispatchEvent(new Event('change'));
      });
      alt.append(b);
    }
  }
}
function buildPlan(reset = true) {
  if (reset) customSteps = null;
  try {
    plan = submit(customSteps ? { ...prefs, steps: customSteps } : prefs);
    formError.hidden = true;
  } catch (error) {
    plan = null;
    formError.textContent = errorText(error);
    formError.hidden = false;
  }
  renderPlan();
}
function checks(id, choices, field) {
  const parent = get(id, 'div');
  parent.replaceChildren(
    ...Object.entries(choices).map(([value, name]) => {
      const label = make('label', '', 'check'),
        input = make('input');
      input.type = 'checkbox';
      input.value = value;
      input.checked = prefs[field].includes(value);
      input.addEventListener('change', () => {
        prefs[field] = Array.from(
          parent.querySelectorAll('input:checked'),
          (n) => /** @type {HTMLInputElement} */ (n).value,
        );
        buildPlan();
      });
      label.append(input, document.createTextNode(name));
      return label;
    }),
  );
}
function showPlaces() {
  const options = Object.fromEntries(reachableLocations[prefs.location].map((id) => [id, locations[id]]));
  prefs.availableLocations = prefs.availableLocations.filter((id) => id in options);
  checks('available', options, 'availableLocations');
}
function showFields() {
  place.value = prefs.location;
  for (const option of visibilityOptions) option.checked = option.value === prefs.discretion;
  const targetNodes = Object.entries(targets).map(([id, label]) => {
    const item = button(label, () => {
      prefs.targets = prefs.targets.includes(id)
        ? prefs.targets.filter((t) => t !== id)
        : [...prefs.targets, id];
      setPressed(item, prefs.targets.includes(id));
      buildPlan();
    });
    setPressed(item, prefs.targets.includes(id));
    return item;
  });
  get('targets', 'div').replaceChildren(...targetNodes);
  checks('limitations', limitations, 'limitations');
  checks('equipment', equipment, 'equipment');
  get('allow-floor', 'input').checked = prefs.allowFloor;
  for (const key of meas) get(key, 'input').value = prefs[key] ?? '';
  showPlaces();
  get('load-profile', 'button').hidden = !profile;
}
function updateBudget(seconds) {
  prefs.seconds = seconds;
  const preserve = customSteps && customSteps.reduce((total, step) => total + step.seconds, 0) <= seconds;
  buildPlan(!preserve);
}
function showTimes(custom = false) {
  const field = get('custom-time', 'input');
  const entries = [
    [60, '1 min'],
    [120, '2 min'],
    [300, '5 min'],
    [0, 'Custom'],
  ];
  field.parentElement.hidden = !custom;
  const items = entries.map(([n, label]) => {
    const sec = Number(n);
    const item = button(String(label), () => {
      if (sec) {
        updateBudget(sec);
        showTimes();
      } else {
        field.value = String(prefs.seconds);
        showTimes(true);
        field.focus();
      }
    });
    setPressed(item, custom ? sec === 0 : sec === prefs.seconds);
    return item;
  });
  get('time-options', 'div').replaceChildren(...items);
}
function bindSettings() {
  for (const [id, label] of Object.entries(locations)) place.add(new Option(label, id));
  place.addEventListener('change', () => {
    prefs.location = place.value;
    prefs.equipment = withoutBackrest(prefs.equipment);
    checks('equipment', equipment, 'equipment');
    prefs.availableLocations = [];
    prefs.allowFloor = false;
    get('allow-floor', 'input').checked = false;
    for (const key of ['sideCm', 'forwardCm']) {
      delete prefs[key];
      get(key, 'input').value = '';
    }
    showPlaces();
    buildPlan();
  });
  for (const option of visibilityOptions) {
    option.addEventListener('change', () => {
      prefs.discretion = option.value;
      buildPlan();
    });
  }
  const floor = get('allow-floor', 'input');
  floor.addEventListener('change', () => {
    prefs.allowFloor = floor.checked;
    buildPlan();
  });
  const seconds = get('custom-time', 'input');
  seconds.addEventListener('input', () => {
    updateBudget(seconds.valueAsNumber);
  });
  for (const key of meas) {
    const input = get(key, 'input');
    input.addEventListener('input', () => {
      if (input.value === '') delete prefs[key];
      else prefs[key] = input.valueAsNumber;
      buildPlan();
    });
  }
  get('settings', 'form').addEventListener('submit', (e) => e.preventDefault());
  get('save-profile', 'button').addEventListener('click', () => {
    if (!plan) return;
    const saved = Object.fromEntries(
      profileFields.filter((k) => prefs[k] !== undefined).map((k) => [k, prefs[k]]),
    );
    saved.equipment = withoutBackrest(prefs.equipment);
    const ok = writeLocal('profile', saved);
    if (ok) {
      profile = JSON.parse(JSON.stringify(saved));
      get('load-profile', 'button').hidden = false;
    }
    get('profile-status', 'output').textContent = ok
      ? 'Saved mobility, equipment, size, discretion and movement preferences on this device.'
      : 'Storage is unavailable in this browser.';
  });
  get('load-profile', 'button').addEventListener('click', () => {
    if (!profile) return;
    const hasFirmBack = prefs.equipment.includes('firm-back');
    profileFields.forEach((k) => delete prefs[k]);
    Object.assign(prefs, blankProfile, JSON.parse(JSON.stringify(profile)));
    if (hasFirmBack) prefs.equipment = [...prefs.equipment, 'firm-back'];
    showFields();
    buildPlan();
    get('profile-status', 'output').textContent = 'Restored your saved preferences.';
  });
  showFields();
  showTimes();
}
function showCatalog() {
  const query = librarySelect.value.trim().toLocaleLowerCase();
  const visibleMoves = moves.filter((m) =>
    [m.name, poseName(m), ...m.targets.map((t) => targets[t])].join(' ').toLocaleLowerCase().includes(query),
  );
  const items = visibleMoves.map((move) => {
    const detail = make('details', '', 'library-entry'),
      summary = make('summary', move.name);
    summary.append(make('small', poseName(move)));
    const select = make('select');
    select.setAttribute('aria-label', 'Preference for ' + move.name + ' (' + poseName(move) + ')');
    for (const [id, lbl] of Object.entries({
      regular: 'Include normally',
      favorite: 'Favorite',
      avoid: 'Leave out',
    }))
      select.add(new Option(lbl, id));
    select.value = prefs.avoidIds.includes(move.id)
      ? 'avoid'
      : prefs.favoriteIds.includes(move.id)
        ? 'favorite'
        : 'regular';
    select.addEventListener('change', () => {
      prefs.avoidIds = prefs.avoidIds.filter((x) => x !== move.id);
      prefs.favoriteIds = prefs.favoriteIds.filter((x) => x !== move.id);
      if (select.value === 'avoid') prefs.avoidIds.push(move.id);
      if (select.value === 'favorite') prefs.favoriteIds.push(move.id);
      buildPlan();
    });
    detail.append(
      summary,
      make('p', move.cue),
      make('p', move.caution),
      make('p', move.evidence),
      sourceLinks(move),
      select,
    );
    if (feedback[move.id]) {
      const clear = button('Clear earlier movement feedback', () => {
        delete feedback[move.id];
        writeLocal('movement-feedback', feedback);
        clear.remove();
        buildPlan();
      });
      detail.append(clear);
    }
    return detail;
  });
  get('library-items', 'div').replaceChildren(
    ...(items.length ? items : [make('p', 'No movements match your search.', 'hint')]),
  );
}
function openEditor(index) {
  if (!plan) return;
  editing = index;
  const row = plan.steps[index],
    available = prefs.seconds - plan.totalSeconds + (row?.seconds ?? 0);
  editMove.replaceChildren(
    ...plan.eligibleIds.map((id) => {
      const m = moveById.get(id);
      return new Option(m.name + ' · ' + poseName(m), id);
    }),
  );
  const firstUnused = plan.eligibleIds.find((id) => !plan.steps.some((s) => s.id === id));
  editMove.value = row?.id || firstUnused || plan.eligibleIds[0];
  get('edit-title', 'h2').textContent = row ? 'Edit movement' : 'Add movement';
  get('edit-cue', 'p').textContent = moveById.get(editMove.value).cue;
  editSeconds.value = String(row?.seconds ?? Math.min(30, available));
  editSeconds.max = String(Math.min(180, available));
  editReps.value = row?.reps ?? '';
  get('edit-max', 'p').textContent =
    'Up to ' +
    editSeconds.max +
    ' seconds available. Shorten another movement or increase your time budget for more.';
  get('edit-error', 'p').textContent = '';
  get('remove-step', 'button').hidden = !row;
  editor.showModal();
}
function applySteps(rows) {
  try {
    const updated = submit({ ...prefs, steps: rows });
    customSteps = updated.steps;
    plan = updated;
    selectedId = editMove.value;
    editor.close();
    renderPlan();
  } catch (error) {
    get('edit-error', 'p').textContent = errorText(error);
  }
}
bindSettings();
setupSavedRoutines({
  prefs,
  getPlan: () => plan,
  apply: (updated) => {
    customSteps = updated.steps;
    plan = updated;
    renderPlan();
  },
});
get('open-library', 'button').addEventListener('click', () => {
  librarySelect.value = '';
  showCatalog();
  library.showModal();
});
librarySelect.addEventListener('input', showCatalog);
get('add-step', 'button').addEventListener('click', () => openEditor(-1));
editMove.addEventListener('change', () => {
  get('edit-cue', 'p').textContent = moveById.get(editMove.value).cue;
});
get('edit-form', 'form').addEventListener('submit', (e) => {
  e.preventDefault();
  const rows = plan.steps.slice(),
    row = {
      id: editMove.value,
      seconds: editSeconds.valueAsNumber,
      ...(editReps.value ? { reps: editReps.valueAsNumber } : {}),
    };
  if (editing < 0) rows.push(row);
  else rows[editing] = row;
  applySteps(rows);
});
get('remove-step', 'button').addEventListener('click', () =>
  applySteps(plan.steps.filter((s, i) => i !== editing)),
);
for (const node of document.querySelectorAll('button[data-close]'))
  node.addEventListener('click', () => get(node.getAttribute('data-close'), 'dialog').close());
setupCheckIn(feedback, () => buildPlan());
start.addEventListener('click', () => {
  if (!plan?.steps.length) return;
  const steps = plan.steps.map((s, i) => ({
    ...s,
    move: moveById.get(s.id),
    transition: plan.transitionSeconds[i],
  }));
  startSession(steps, prefs.location, (ids, location) =>
    showFeedback(
      ids.map((id) => moveById.get(id)),
      locations[location],
    ),
  );
});
buildPlan();
watchPreview();
Object.assign(window, { StretchSnack: { submit, reviewRoutine } });
async function prepareOffline() {
  const status = get('offline-status', 'output');
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Offline access unavailable in this browser.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    function watchInstallation() {
      const installing = registration.installing;
      const stateChanged = () => {
        if (installing.state === 'redundant' && !registration.active) {
          status.textContent = 'Offline setup failed. Reload when connected to retry.';
        }
      };
      if (installing) {
        installing.addEventListener('statechange', stateChanged);
        stateChanged();
      }
    }
    registration.addEventListener('updatefound', watchInstallation);
    watchInstallation();
    await navigator.serviceWorker.ready;
    status.textContent = 'Ready offline · narration included';
  } catch {
    status.textContent = 'Offline setup unavailable. Reload when connected to retry.';
  }
}
prepareOffline();
