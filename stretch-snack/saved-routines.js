import { locations, moves } from './core/catalog.js';
import { reviewRoutine, submit } from './core/plan.js';
import { formatTime, get, make, readLocal, setPressed, writeLocal } from './dom.js';

const byId = new Map(moves.map(move => [move.id, move]));
const key = 'saved-routines';
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const stored = () => readLocal(key, []);

/** @param {{prefs: {location: string, seconds: number}, getPlan: () => ReturnType<typeof submit> | null, apply: (plan: ReturnType<typeof submit>) => void}} options */
export function setupSavedRoutines({ prefs, getPlan, apply }) {
  const dialog = get('saved-routines', 'dialog');
  const name = get('routine-name', 'input');
  const choice = get('routine-choice', 'select');
  const list = get('review-steps', 'ol');
  const fit = get('review-fit', 'p');
  const use = get('use-routine', 'button');
  const save = get('save-routine', 'button');
  const notice = get('saved-notice', 'output');
  const form = get('save-routine-form', 'form');
  const browse = get('browse-routines', 'button');
  const saveMode = get('name-routine', 'button');
  const recall = get('routine-recall', 'section');
  let rows = [];

  function updateSaveButton() {
    const hasName = Boolean(name.value.trim());
    const replaces = hasName && stored().some(entry => sameName(entry.name, name.value));
    save.disabled = !hasName || !getPlan()?.steps.length;
    save.textContent = replaces ? 'Replace saved copy' : 'Save on this device';
  }
  function showMode(saving) {
    notice.textContent = '';
    form.hidden = !saving;
    recall.hidden = saving;
    setPressed(saveMode, saving);
    setPressed(browse, !saving);
    if (saving) {
      const plan = getPlan();
      get('save-routine-summary', 'p').textContent = plan?.steps.length
        ? plan.steps.length + ' movements · ' + formatTime(plan.totalSeconds) + '. Saves their order, times and repetitions.'
        : 'Add a movement to your routine before saving.';
      updateSaveButton();
    } else {
      showRoutine();
    }
  }
  function draft() {
    return rows.flatMap(({ original, movement, duration }) => {
      const id = movement.value;
      if (!id) return [];
      const row = { id, seconds: duration.valueAsNumber };
      if (id === original.id && original.reps !== undefined) return [{...row, reps: original.reps}];
      return [row];
    });
  }
  function checkDraft() {
    const steps = draft();
    use.disabled = true;
    let report;
    try {
      report = reviewRoutine({...prefs, steps});
    } catch (error) {
      fit.textContent = error.message;
      return;
    }
    let included = 0;
    for (const row of rows) {
      const step = row.movement.value ? report.rows[included++] : null;
      const reasons = step?.issues.slice() ?? [];
      if (step?.needsTransferTime) reasons.push('Allow at least 20 seconds when changing posture.');
      row.issue.textContent = reasons.join(' ');
      row.issue.hidden = !reasons.length;
    }
    const problems = report.rows.filter(row => row.issues.length || row.needsTransferTime).length;
    const messages = [formatTime(report.totalSeconds) + ' of ' + formatTime(prefs.seconds) + ' available.'];
    if (problems) messages.push('Edit or omit ' + problems + (problems === 1 ? ' marked step.' : ' marked steps.'));
    if (report.overBudgetSeconds) messages.push('Shorten by ' + report.overBudgetSeconds + ' seconds or omit a step.');
    if (!steps.length) messages.push('Choose at least one movement.');
    fit.textContent = messages.join(' ');
    use.disabled = !steps.length || !report.fits;
  }
  function editRow(original, i, eligible) {
    const entry = make('li', '', 'review-step');
    const movement = make('select'), duration = make('input');
    const move = byId.get(original.id);
    const title = make('strong', (i + 1) + '. ' + (move?.name ?? original.id));
    if (original.reps) title.append(make('small', ' · ' + original.reps + ' saved reps'));
    const movementLabel = make('label', 'Movement', 'field');
    const timeLabel = make('label', 'Seconds', 'field');
    const issue = make('p', '', 'error');
    issue.id = 'step-issue-' + i;
    movement.setAttribute('aria-describedby', issue.id);
    duration.setAttribute('aria-describedby', issue.id);
    const keep = new Option(eligible.includes(original.id) ? 'Keep movement' : 'Choose a substitute', original.id);
    keep.disabled = !eligible.includes(original.id);
    movement.add(keep);
    movement.add(new Option('Omit this step', ''));
    const swaps = make('optgroup');
    swaps.label = 'Substitutes that fit here';
    for (const id of eligible) {
      if (id === original.id) continue;
      const other = byId.get(id);
      swaps.append(new Option(other.name + ' · ' + other.pose, id));
    }
    movement.append(swaps);
    movement.value = original.id;
    duration.type = 'number';
    duration.min = '5';
    duration.max = '180';
    duration.step = '1';
    duration.required = true;
    duration.value = String(original.seconds);
    movement.addEventListener('change', () => {
      duration.disabled = !movement.value;
      checkDraft();
    });
    duration.addEventListener('input', checkDraft);
    movementLabel.append(movement);
    timeLabel.append(duration);
    entry.append(title, movementLabel, timeLabel, issue);
    list.append(entry);
    return {original, movement, duration, issue};
  }
  function showRoutine() {
    const selected = stored().find(entry => entry.name === choice.value);
    list.replaceChildren();
    rows = [];
    use.disabled = true;
    get('review-context', 'p').textContent = '';
    if (!selected) { fit.textContent = 'Select a saved routine.'; return; }
    try {
      const report = reviewRoutine({...prefs, steps: selected.steps});
      get('review-context', 'p').textContent = locations[prefs.location] + ' · ' + formatTime(prefs.seconds) + ' available';
      rows = report.rows.map((step, i) => editRow(step, i, report.eligibleIds));
      checkDraft();
    } catch (error) {
      fit.textContent = error.message;
    }
  }
  function refresh(preferred = '') {
    const entries = stored();
    choice.replaceChildren(...entries.map(entry => new Option(entry.name, entry.name)));
    if (entries.some(entry => entry.name === preferred)) choice.value = preferred;
    browse.disabled = !entries.length;
    showMode(!entries.length);
  }
  get('open-routines', 'button').addEventListener('click', () => {
    name.value = '';
    refresh(choice.value);
    dialog.showModal();
  });
  browse.addEventListener('click', () => showMode(false));
  saveMode.addEventListener('click', () => showMode(true));
  choice.addEventListener('change', () => { notice.textContent = ''; showRoutine(); });
  name.addEventListener('input', updateSaveButton);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const plan = getPlan();
    const title = name.value.trim();
    if (!title || !plan?.steps.length) return;
    const entries = stored();
    const index = entries.findIndex(entry => sameName(entry.name, title));
    const entry = {name: title, steps: plan.steps};
    if (index < 0) entries.push(entry);
    else entries[index] = entry;
    if (!writeLocal(key, entries)) { notice.textContent = 'Storage is unavailable in this browser.'; return; }
    refresh(title);
    notice.textContent = 'Saved “' + title + '” on this device.';
  });
  get('delete-routine', 'button').addEventListener('click', () => {
    const title = choice.value;
    if (!window.confirm('Delete the saved routine “' + title + '” from this device?')) return;
    if (!writeLocal(key, stored().filter(entry => entry.name !== title))) {
      notice.textContent = 'Storage is unavailable in this browser.';
      return;
    }
    name.value = '';
    refresh();
    notice.textContent = 'Deleted “' + title + '”.';
  });
  use.addEventListener('click', () => {
    try {
      const steps = draft();
      if (!steps.length) return;
      apply(submit({...prefs, steps}));
      dialog.close();
    } catch (error) {
      fit.textContent = error.message;
      use.disabled = true;
    }
  });
}
