import {
  moves,
  locations,
  targets,
  limitations,
  equipment,
  fixedEquipment,
  reachableLocations,
  sources, programs,
} from './core/catalog.js';
import { submit, reviewRoutine, placeOptions, easierVariant, transfersFor, movementAtLocation, usesBed } from './core/plan.js';
import { restoreTrainerBody, setTrainerBody } from './trainer.js';
import { renderMovement } from './demo.js';
import { setupSavedRoutines } from './saved-routines.js';
import { blendCamera } from './camera.js';
import { cameraGlides, cameraTravelSeconds, demonstrationsPlay, sessionCamera, startSession } from './session.js';
import { setupCheckIn, showFeedback } from './check-in.js';
import { get, make, button, setPressed, formatTime, localKey, readLocal, writeLocal } from './dom.js';

const moveById = new Map(moves.map((move) => [move.id, move]));
const profileFields = [
  'limitations',
  'equipment',
  'discretion', 'intensity', 'style',
  'heightCm',
  'armspanCm',
  'avoidIds',
  'favoriteIds',
];
const blankProfile = { limitations: [], equipment: [], discretion: 'quiet', intensity:'gentle', style:'any', avoidIds: [], favoriteIds: [] };
let profile = readLocal('profile', null);
const portableOnly = (items) => items.filter(id => !fixedEquipment.includes(id));
if (profile?.equipment) profile.equipment = portableOnly(profile.equipment);
const feedback = readLocal('movement-feedback', {});
const prefs = {
  location: 'plane-seat',
  seconds: 120,
  targets: [],
  availableLocations: [],
  equipmentByLocation: {},
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
const editPlace = get('edit-place', 'select');
const editSeconds = get('edit-seconds', 'input');
const editReps = get('edit-reps', 'input');
const previewCanvas = get('preview-canvas', 'canvas');
const preview = get('preview', 'section');
const start = get('start', 'button');
let previewTime = demonstrationsPlay ? 0 : 2,
  previous = 0,
  frame = 0,
  visible = true;
let plan,
  customSteps = null,
  selectedId = '',
  selectedPlace = '',
  editing = -1;
/** @type {import('./camera.js').Camera | undefined} */
let previewCamera, previewTarget, previewFrom;
let panSeconds = 0;
function aimPreview(move) {
  const target = sessionCamera(move);
  if (cameraGlides() && previewTarget && Object.keys(target).every(key => target[key] === previewTarget[key])) return;
  previewFrom = cameraGlides() ? previewCamera : undefined;
  previewTarget = target;
  panSeconds = 0;
  if (!previewFrom) previewCamera = previewTarget;
}
const formError = get('form-error', 'p');
const poseLabel = { seated: 'Seated', standing: 'Standing', supine: 'Reclined', prone:'Face down', 'side-lying':'Side lying', 'hands-and-knees':'Hands and knees', kneeling:'Kneeling', 'long-sitting':'Legs extended' };
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
    prefs.availableLocations.length ? '+' + prefs.availableLocations.length + (prefs.availableLocations.length === 1 ? ' place' : ' places') : '',
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
function drawPreview(now = performance.now(), still = false) {
  cancelAnimationFrame(frame);
  frame = 0;
  const move = moveById.get(selectedId);
  if (!move || preview.hidden || !visible || document.hidden || (!still && document.querySelector('dialog[open]'))) {
    previous = 0;
    return;
  }
  const repaint = !previous || now - previous >= 1000 / 30 - 1;
  if (repaint) {
    if (previous && demonstrationsPlay) {
      const delta = Math.min(now - previous, 160) / 1000;
      previewTime += delta;
      panSeconds += delta;
    }
    if (previewFrom) {
      previewCamera = blendCamera(previewFrom, previewTarget, panSeconds / cameraTravelSeconds);
      if (panSeconds >= cameraTravelSeconds) previewFrom = undefined;
    }
    previous = now;
    renderMovement(previewCanvas, movementAtLocation(move,selectedPlace,prefs), previewTime, {
      location: selectedPlace, bed:usesBed(move,prefs,selectedPlace),
      dark: document.documentElement.dataset.theme === 'dark',
      camera: previewCamera,
    });
  }
  if (demonstrationsPlay && !still) frame = requestAnimationFrame(drawPreview);
}
function restartPreview() {
  previous = 0;
  drawPreview();
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
  document.addEventListener('stretchcamerachange', () => {
    const move = moveById.get(selectedId);
    if (move) aimPreview(move);
    restartPreview();
  });
  document.addEventListener('stretchmotionchange', event => {
    if (event instanceof CustomEvent && event.detail.deviceStill) {
      previewTime = 2;
      previewFrom = undefined;
      previewCamera = previewTarget;
    }
    restartPreview();
  });
  restartPreview();
}
function showMovement(id, location, pickedRow = null) {
  const move = moveById.get(id);
  preview.hidden = !move;
  if (!move) {
    selectedId = '';
    previewFrom = previewCamera = previewTarget = undefined;
    restartPreview();
    return;
  }
  if (selectedId !== id) {
    previewTime = demonstrationsPlay ? 0 : 2;
    get('evidence', 'details').open = false;
  }
  aimPreview(move);
  selectedId = id;
  selectedPlace = location;
  get('preview-name', 'h3').textContent = move.name;
  get('preview-cue', 'p').textContent = move.cue;
  const info = get('source-info', 'div');
  const links = sourceLinks(move);
  info.replaceChildren(make('p', move.caution), make('p', move.evidence), links);
  for (const row of document.querySelectorAll('#steps .step')) {
    if (!pickedRow && row.getAttribute('data-move') === id && row.getAttribute('data-location') === location) pickedRow = row;
    const active = row === pickedRow;
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
function visitLabel(location) {
  const seconds = plan.places.find(p => p.location === location).visitSeconds;
  return seconds >= 60 && seconds % 60 === 0 ? 'about ' + seconds / 60 + ' min away' : 'about ' + seconds + ' s away';
}
function movementRow(i) {
  const step = plan.steps[i], move = moveById.get(step.id);
  const row = make('li', '', 'step');
  row.dataset.move = move.id;
  row.dataset.location = step.location;
  const pick = button('', () => showMovement(move.id, step.location, row), 'step-picker');
  pick.setAttribute('aria-label', 'Preview ' + move.name);
  const text = make('span');
  const timing = (step.seconds - plan.transitionSeconds[i]) + ' s moving';
  const reps = step.reps ? ' · ' + step.reps + ' reps' : '';
  text.append(make('strong', move.name), make('small', timing + reps + ' · ' + poseName(move)));
  pick.append(make('span', String(i + 1).padStart(2, '0'), 'step-num'), text);
  const edit = button('Edit', () => openEditor(i), 'edit-step');
  edit.setAttribute('aria-label', 'Edit ' + move.name);
  row.append(pick, edit);
  return row;
}
function renderPlan() {
  showSetup();
  const steps = plan?.steps || [];
  const list = get('steps', 'div');
  list.replaceChildren(
    ...(plan?.segments || []).map(segment => {
      const group = make('section', '', 'place-segment');
      if (prefs.availableLocations.length) {
        const header = make('h3', locations[segment.location]);
        if (segment.location !== prefs.location) header.append(make('small', ' · ' + visitLabel(segment.location)));
        group.append(header);
      }
      const rows = make('ol');
      rows.start = segment.steps[0] + 1;
      rows.append(...segment.steps.map(movementRow));
      group.append(rows);
      return group;
    }),
  );
  get('routine-summary', 'p').textContent = steps.length
    ? formatTime(plan.totalSeconds) +
      ' · ' +
      steps.length +
      ' movement' +
      (steps.length === 1 ? '' : 's') +
      ' · ' +
      (plan.segments.length > 1 ? plan.segments.length + ' places' : locations[steps[0].location])
    : 'No routine for the current settings';
  start.disabled = !steps.length;
  const available = prefs.seconds - (plan?.totalSeconds || 0);
  get('add-step', 'button').hidden = !plan?.eligibleIds.length || available < 5;
  const selected = steps.find(s => s.id === selectedId && s.location === selectedPlace) || steps[0];
  showMovement(selected?.id, selected?.location);
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
  if (plan?.returnToLocation) messages.push('After the timer, return to your seat.');
  const note = get('plan-note', 'div');
  note.replaceChildren(...messages.map((t) => make('p', t)));
  note.hidden = !messages.length;
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
  const options = placeOptions(prefs.location, reachableLocations[prefs.location]);
  const panel = get('available','div');
  panel.replaceChildren(...options.map(({location, visitSeconds}) => {
    const wrap = make('div', '', 'place-option');
    const label = make('label', '', 'check');
    const here = location === prefs.location;
    const input = make('input');
    input.type = 'checkbox';
    input.value = location;
    input.checked = here || prefs.availableLocations.includes(location);
    input.disabled = here;
    const cost = visitSeconds % 60 === 0 ? visitSeconds / 60 + ' min' : visitSeconds + ' s';
    label.append(input, make('span', locations[location]), make('small', here ? 'Here' : '~' + cost));
    wrap.append(label);
    if (!here) {
      const extras = make('div', '', 'place-equipment');
      const seated = location.endsWith('seat');
      const fixtures = fixedEquipment.filter(key => key === 'table' || (key === 'firm-back' ? seated : ['wall','doorway','support'].includes(key) ? !seated : location === 'open-area'));
      for (const key of fixtures) {
        const check = make('input');
        check.type = 'checkbox';
        check.setAttribute('aria-label', equipment[key] + ' at ' + locations[location]);
        check.checked = (prefs.equipmentByLocation[location] || []).includes(key);
        check.addEventListener('change', () => {
          const picked = prefs.equipmentByLocation[location] || [];
          prefs.equipmentByLocation[location] = check.checked ? [...picked, key] : picked.filter(k => k !== key);
          buildPlan();
        });
        const item = make('label', '', 'check');
        item.append(check, document.createTextNode(equipment[key]));
        extras.append(item);
      }
      extras.setAttribute('role', 'group');
      extras.setAttribute('aria-label', 'Equipment at ' + locations[location]);
      extras.hidden = !input.checked;
      wrap.append(extras);
      input.addEventListener('change', () => {
        prefs.availableLocations = options.map(p => p.location).filter(id => id !== prefs.location &&
          (id === location ? input.checked : prefs.availableLocations.includes(id)));
        if (!input.checked) {
          delete prefs.equipmentByLocation[location];
          extras.querySelectorAll('input').forEach(box => { box.checked = false; });
        }
        extras.hidden = !input.checked;
        buildPlan();
      });
    }
    return wrap;
  }));
}
function showFields() {
  place.value = prefs.location;
  for (const radio of get('intensity','div').querySelectorAll('input')) radio.checked = radio.value === prefs.intensity;
  get('movement-style','select').value = prefs.style;
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
  for (const radio of get('intensity','div').querySelectorAll('input')) radio.addEventListener('change',()=>{
    prefs.intensity=radio.value; buildPlan();
  });
  const style=get('movement-style','select');
  style.addEventListener('change',()=>{prefs.style=style.value; buildPlan();});
  for (const [id, label] of Object.entries(locations)) place.add(new Option(label, id));
  place.addEventListener('change', () => {
    prefs.location = place.value;
    prefs.equipment = portableOnly(prefs.equipment);
    checks('equipment', equipment, 'equipment');
    prefs.availableLocations = [];
    prefs.equipmentByLocation = {};
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
    saved.equipment = portableOnly(prefs.equipment);
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
    const fixtures = prefs.equipment.filter(id => fixedEquipment.includes(id));
    profileFields.forEach((k) => delete prefs[k]);
    Object.assign(prefs, blankProfile, JSON.parse(JSON.stringify(profile)));
    prefs.equipment = [...prefs.equipment, ...fixtures];
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
    detail.dataset.move = move.id;
    function reopen(id) {
      showCatalog();
      const entry = get('library-items','div').querySelector('details[data-move="' + id + '"]');
      if (entry instanceof HTMLDetailsElement) {
        entry.open = true;
        entry.querySelector('summary').focus();
      }
    }
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
      reopen(move.id);
    });
    detail.append(
      summary,
      make('p', move.cue),
      make('p', move.caution),
      make('p', move.evidence),
      sourceLinks(move),
      select,
    );
    const used = plan?.steps.find(s => s.id === move.id);
    const where = used?.location || plan?.eligibleLocations[move.id]?.[0];
    const easier = where && easierVariant(plan, move.id, where);
    if (easier) {
      const hint = make('div', '', 'easier-option');
      const swap = () => {
        if (used) {
          try {
            const index = plan.steps.indexOf(used);
            const replacement = {...used, ...easier, seconds: used.seconds - plan.transitionSeconds[index]};
            const updated = submit({...prefs, steps: editedRoute(index, replacement).steps});
            plan = updated;
            customSteps = updated.steps;
            selectedId = easier.id;
            selectedPlace = easier.location;
            library.close();
            renderPlan();
          } catch (err) {
            libraryNotice.textContent = errorText(err);
          }
        } else {
          if (prefs.favoriteIds.includes(move.id)) {
            prefs.favoriteIds = [...new Set(prefs.favoriteIds.map(id => id === move.id ? easier.id : id))];
            buildPlan();
          }
          librarySelect.value = moveById.get(easier.id).name;
          reopen(easier.id);
        }
      };
      const action = used ? 'Swap this step' : prefs.favoriteIds.includes(move.id) ? 'Switch favorite' : 'View this option';
      showEasier(hint, easier, action, swap);
      const libraryNotice = make('p', '', 'error');
      libraryNotice.setAttribute('role', 'status');
      detail.append(hint, libraryNotice);
    }
    if (feedback[move.id]) {
      const clear = button('Clear earlier movement feedback', () => {
        delete feedback[move.id];
        writeLocal('movement-feedback', feedback);
        clear.remove();
        buildPlan();
        reopen(move.id);
      });
      detail.append(clear);
    }
    return detail;
  });
  get('library-items', 'div').replaceChildren(
    ...(items.length ? items : [make('p', 'No movements match your search.', 'hint')]),
  );
}
function showEasier(panel, easier, label, swap) {
  panel.replaceChildren();
  panel.hidden = !easier;
  if (!easier) return;
  const move = moveById.get(easier.id);
  const icon = make('span', '↳', 'swap-icon');
  icon.setAttribute('aria-hidden', 'true');
  const content = make('div');
  const where = easier.location === prefs.location && move.pose === 'seated' ? 'your seat' : locations[easier.location];
  content.append(make('p', 'Also works in ' + where + ' · ' + move.name), button(label, swap));
  panel.append(icon, content);
}
function editedRoute(index, replacement) {
  const rows = plan.steps.map((s, i) => ({...s, seconds: s.seconds - plan.transitionSeconds[i]}));
  if (index < 0) rows.push(replacement);
  else if (replacement) {
    const original = rows[index];
    if (original.prescription && original.id === replacement.id && original.seconds === replacement.seconds && original.reps === replacement.reps)
      replacement.prescription = original.prescription;
    rows[index] = replacement;
  }
  else rows.splice(index, 1);
  const places = plan.places.map(p => p.location);
  rows.sort((a, b) => places.indexOf(a.location) - places.indexOf(b.location));
  // Changing the first step of a visit also changes which step carries its travel time.
  const transfers = transfersFor(rows, prefs.location);
  return {
    steps: rows.map((row, i) => ({...row, seconds: row.seconds + transfers[i]})),
    transfer: transfers[rows.indexOf(replacement)] ?? 0,
  };
}
function showEditorChoice(location) {
  const id = editMove.value;
  const places = plan.eligibleLocations[id];
  editPlace.replaceChildren(...places.map(p => new Option(locations[p], p)));
  editPlace.value = places.includes(location) ? location : places[0];
  editPlace.disabled = places.length <= 1;
  get('edit-place-field','label').hidden = plan.places.length <= 1;
  get('edit-cue', 'p').textContent = moveById.get(id).cue;
  const route = editedRoute(editing, {id, location: editPlace.value, seconds: 0});
  const budget = prefs.seconds - route.steps.reduce((total, row) => total + row.seconds, 0);
  const max = Math.min(900 - route.transfer, budget);
  editSeconds.max = String(Math.max(0, max));
  get('edit-max','p').textContent = (route.transfer ? 'About ' + formatTime(route.transfer) + ' for the transfer. ' : '') +
    (max >= 5 ? 'Up to ' + max + ' seconds of movement fit.' : 'Free up ' + (5 - max) + ' more seconds to fit this movement.');
  const easier = easierVariant(plan, id, editPlace.value);
  showEasier(get('edit-easier','div'), easier, 'Use this option', () => {
    editMove.value = easier.id;
    showEditorChoice(easier.location);
    editMove.focus();
  });
}
function openEditor(index) {
  if (!plan) return;
  editing = index;
  const row = plan.steps[index];
  editMove.replaceChildren(
    ...plan.eligibleIds.map((id) => {
      const m = moveById.get(id);
      return new Option(m.name + ' · ' + poseName(m), id);
    }),
  );
  const firstUnused = plan.eligibleIds.find((id) => !plan.steps.some((s) => s.id === id));
  editMove.value = row?.id || firstUnused || plan.eligibleIds[0];
  get('edit-title', 'h2').textContent = row ? 'Edit movement' : 'Add movement';
  showEditorChoice(row?.location);
  editSeconds.value = String(row ? row.seconds - plan.transitionSeconds[index] : Math.max(5, Math.min(30, Number(editSeconds.max))));
  editReps.value = row?.reps ?? '';
  get('edit-error', 'p').textContent = '';
  get('remove-step', 'button').hidden = !row;
  editor.showModal();
}
function applyEdit(replacement) {
  try {
    const updated = submit({ ...prefs, steps: editedRoute(editing, replacement).steps });
    customSteps = updated.steps;
    plan = updated;
    selectedId = editMove.value;
    selectedPlace = editPlace.value;
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
  apply: (updated, budget) => {
    if (budget !== prefs.seconds) {
      prefs.seconds=budget; get('custom-time','input').value=String(budget); showTimes(true);
    }
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
editMove.addEventListener('change', () => showEditorChoice(editPlace.value));
editPlace.addEventListener('change', () => showEditorChoice(editPlace.value));
get('edit-form', 'form').addEventListener('submit', (e) => {
  e.preventDefault();
  const row = {
    id: editMove.value,
    location: editPlace.value,
    seconds: editSeconds.valueAsNumber,
    ...(editReps.value ? { reps: editReps.valueAsNumber } : {}),
  };
  applyEdit(row);
});
get('remove-step', 'button').addEventListener('click', () => applyEdit(null));
for (const node of document.querySelectorAll('button[data-close]'))
  node.addEventListener('click', () => get(node.getAttribute('data-close'), 'dialog').close());
setupCheckIn(feedback, () => buildPlan());
start.addEventListener('click', () => {
  if (!plan?.steps.length) return;
  const steps = plan.steps.map((s, i) => ({
    ...s,
    move: movementAtLocation(moveById.get(s.id),s.location,prefs),
    transition: plan.transitionSeconds[i],
    bed:usesBed(moveById.get(s.id),prefs,s.location),
  }));
  startSession(steps, prefs.location, (ids, location, usedLocations) =>
    showFeedback(
      ids.map((id) => moveById.get(id)),
      usedLocations.map(id => locations[id]).join(' → ') || locations[location],
    ),
  );
});
const bodyChoices = get('trainer-body', 'fieldset').querySelectorAll('input');
const fitCanvas = get('trainer-fit','canvas');
const trainerDialog = get('camera-settings','dialog');
const fitPose = moveById.get('standing-mountain');
// The same neutral stance and scale make the three silhouettes directly comparable.
const fitCamera = {yaw:.18, pitch:.03, centerY:.855, overviewY:.855, centerZ:.02, width:.74, height:1.84, offsetX:0};
function drawBodyFit() {
  if (trainerDialog.open) renderMovement(fitCanvas,fitPose,0,{
    preview:true, camera:fitCamera, dark:document.documentElement.dataset.theme === 'dark',
  });
}
function redrawBody() {
  drawBodyFit();
  previous = 0;
  drawPreview(performance.now(), trainerDialog.open);
  document.dispatchEvent(new Event('stretchbodychange'));
}
function restoreBodyChoice() {
  const name = restoreTrainerBody();
  for (const choice of bodyChoices) choice.checked = choice.value === name;
  redrawBody();
}
for (const choice of bodyChoices) {
  choice.addEventListener('change', () => {
    if (!choice.checked) return;
    setTrainerBody(choice.value);
    writeLocal('trainer-body', choice.value);
    redrawBody();
  });
}
new ResizeObserver(drawBodyFit).observe(fitCanvas);
document.addEventListener('themechange',drawBodyFit);
window.addEventListener('storage', event => {
  if (event.key === null || event.key === localKey('trainer-body')) restoreBodyChoice();
});
window.addEventListener('pageshow', event => { if (event.persisted) restoreBodyChoice(); });
restoreBodyChoice();
buildPlan();
watchPreview();
Object.assign(window, { StretchSnack: { submit, reviewRoutine, programs } });
function syncBrowserChrome() {
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor instanceof HTMLMetaElement)
    themeColor.content = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
}
syncBrowserChrome();
document.addEventListener('themechange', syncBrowserChrome);
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
