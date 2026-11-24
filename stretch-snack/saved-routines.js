import { locations, moves, programs, sources } from './core/catalog.js';
import { reviewRoutine, submit, prescriptionFor } from './core/plan.js';
import { formatTime, get, make, readLocal, setPressed, writeLocal } from './dom.js';

const byId = new Map(moves.map(move => [move.id, move]));
const key = 'saved-routines';
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const stored = () => readLocal(key, []);

/** @param {{prefs: {location: string, seconds: number}, getPlan: () => ReturnType<typeof submit> | null, apply: (plan: ReturnType<typeof submit>, budget:number) => void}} options */
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
  const programTab = get('browse-programs','button'), programTime = get('program-time','button');
  const programInfo = get('program-info','div');
  let choosingProgram = false, budget = prefs.seconds, draftSeconds = 0;
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
    setPressed(browse, !saving && !choosingProgram);
    setPressed(programTab,!saving && choosingProgram);
    programInfo.hidden = !choosingProgram || saving;
    get('delete-routine','button').hidden = choosingProgram;
    if (saving) {
      const plan = getPlan();
      get('save-routine-summary', 'p').textContent = plan?.steps.length
        ? plan.steps.length + ' movements · ' + formatTime(plan.totalSeconds) + '. Saves their places, order, times and repetitions.'
        : 'Add a movement to your routine before saving.';
      updateSaveButton();
    } else {
      showRoutine();
    }
  }
  function draft() {
    return rows.flatMap(({ original, movement, place, duration }) => {
      const id = movement.value;
      if (!id) return [];
      const row = { id, location: place.value, seconds: duration.valueAsNumber };
      if (id === original.id) return [{...row,
        ...(original.reps ? {reps:original.reps} : {}),
        ...(original.prescription && row.seconds === original.seconds ? {prescription:original.prescription} : {})}];
      return [row];
    });
  }
  function checkDraft() {
    const steps = draft();
    use.disabled = true;
    let report;
    try {
      report = reviewRoutine({...prefs, seconds:budget, steps});
    } catch (error) {
      fit.textContent = error.message;
      return;
    }
    get('review-context', 'p').textContent = report.places.map(p => locations[p.location]).join(' · ');
    let included = 0;
    for (const row of rows) {
      const step = row.movement.value ? report.rows[included++] : null;
      const reasons = step?.issues.slice() ?? [];
      if (step?.needsTransferTime) reasons.push('Allow at least ' + (step.transitionSeconds + 5) + ' seconds for the transfer and movement.');
      row.issue.textContent = reasons.join(' ');
      row.issue.hidden = !reasons.length;
      row.timingNote.hidden = !step?.transitionSeconds;
      row.timingNote.textContent = step?.transitionSeconds ? 'Includes ' + step.transitionSeconds + ' s to reach the movement.' : '';
    }
    const problems = report.rows.filter(row => row.issues.length || row.needsTransferTime).length;
    const messages = [formatTime(report.totalSeconds) + ' of ' + formatTime(budget) + ' available.'];
    if (problems) messages.push('Edit or omit ' + problems + (problems === 1 ? ' marked step.' : ' marked steps.'));
    if (report.overBudgetSeconds && !choosingProgram) messages.push('Shorten by ' + report.overBudgetSeconds + ' seconds or omit a step.');
    if (!steps.length) messages.push('Choose at least one movement.');
    fit.textContent = messages.join(' ');
    draftSeconds=report.totalSeconds;
    programTime.hidden = !choosingProgram || !report.overBudgetSeconds;
    programTime.textContent = 'Use '+formatTime(draftSeconds)+' for this routine';
    use.disabled = !steps.length || !report.fits;
  }
  function editRow(original, i, report) {
    const eligible = report.eligibleIds;
    const entry = make('li', '', 'review-step');
    const movement = make('select'), duration = make('input'), place = make('select');
    const move = byId.get(original.id);
    const title = make('strong', (i + 1) + '. ' + (move?.name ?? original.id));
    if (original.reps) title.append(make('small', ' · ' + original.reps + ' reps'));
    const dose=prescriptionFor(original);
    if (dose) {
      const detail = [dose.sides === 2 ? formatTime(dose.seconds)+' per side.' : '', dose.protocol ? '10 gentle pulses before each hold of 10, 20 and 30 seconds.' : '',dose.note].filter(Boolean).join(' ');
      if (detail) entry.append(make('p',detail,'hint'));
      if (move?.intensity === 'vigorous') entry.append(make('p',move.caution,'hint'));
    }
    const movementLabel = make('label', 'Movement', 'field');
    const placeLabel = make('label', 'Place', 'field review-place');
    const timeLabel = make('label', 'Step seconds', 'field');
    const timingNote = make('small');
    const issue = make('p', '', 'error');
    issue.id = 'step-issue-' + i;
    movement.setAttribute('aria-describedby', issue.id);
    place.setAttribute('aria-describedby', issue.id);
    duration.setAttribute('aria-describedby', issue.id);
    const keep = new Option(eligible.includes(original.id) ? 'Keep movement' : 'Choose a substitute', original.id);
    keep.disabled = !eligible.includes(original.id);
    movement.add(keep);
    movement.add(new Option('Omit this step', ''));
    const swaps = make('optgroup');
    swaps.label = 'Substitutes in your available places';
    for (const id of eligible) {
      if (id === original.id) continue;
      const other = byId.get(id);
      swaps.append(new Option(other.name + ' · ' + other.pose, id));
    }
    movement.append(swaps);
    movement.value = original.id;
    const selectedPlaces = report.places.map(p => p.location);
    function placeChoices(preferred) {
      const valid = report.eligibleLocations[movement.value] || [];
      // Retain an unavailable saved place until the reader explicitly chooses a substitute.
      const options = [...new Set([preferred, ...valid])];
      place.replaceChildren(...options.map(key => {
        const option = new Option(locations[key] + (selectedPlaces.includes(key) ? '' : ' (not selected)'), key);
        option.disabled = !valid.includes(key);
        return option;
      }));
      place.value = preferred;
      placeLabel.hidden = !movement.value || (selectedPlaces.length === 1 && selectedPlaces[0] === preferred);
      place.disabled = valid.length === 0 || (valid.length === 1 && valid[0] === preferred);
    }
    placeChoices(original.location ?? prefs.location);
    duration.type = 'number';
    duration.min = '5';
    duration.max = '900';
    duration.step = '1';
    duration.required = true;
    duration.value = String(original.seconds);
    movement.addEventListener('change', () => {
      duration.disabled = !movement.value;
      const valid = report.eligibleLocations[movement.value] || [];
      placeChoices(valid.includes(place.value) ? place.value : valid[0] ?? original.location ?? prefs.location);
      checkDraft();
    });
    place.addEventListener('change', checkDraft);
    duration.addEventListener('input', checkDraft);
    movementLabel.append(movement);
    timeLabel.append(duration, timingNote);
    entry.prepend(title);
    entry.append(movementLabel, timeLabel, issue);
    placeLabel.append(place);
    // Single-place routines keep the original two-field editing layout.
    if (selectedPlaces.length > 1 || !selectedPlaces.includes(original.location ?? prefs.location)) {
      entry.insertBefore(placeLabel, issue);
    }
    list.append(entry);
    return {original, movement, place, duration, issue, timingNote};
  }
  function showRoutine() {
    const program = choosingProgram && programs.find(p=>p.id===choice.value);
    const selected = program || stored().find(entry => entry.name === choice.value);
    programInfo.replaceChildren();
    programTime.hidden = true;
    if (program) {
      const links=make('p');
      for (const key of program.sourceIds) {
        const a=make('a',sources[key].title); a.href=sources[key].url; a.target='_blank'; a.rel='noopener';
        if (links.childNodes.length) links.append(' · ');
        links.append(a);
      }
      programInfo.append(make('p',program.summary));
      const details=make('details');
      const summary=make('summary',program.intensity+' · '+program.attribution+' · Sources');
      details.append(summary,links);
      for (const note of program.notes) details.append(make('p',note));
      if (program.estimated) details.append(make('p','Repetition-only drills use an estimated four seconds per repetition. You can edit the timer.'));
      programInfo.append(details);
    }
    list.replaceChildren();
    rows = [];
    use.disabled = true;
    get('review-context', 'p').textContent = '';
    if (!selected) { fit.textContent = 'Select a saved routine.'; return; }
    try {
      const report = reviewRoutine({...prefs, seconds:budget, ...(program ? {programId:program.id} : {steps:selected.steps})});
      rows = report.rows.map((step, i) => editRow(step, i, report));
      checkDraft();
    } catch (error) {
      fit.textContent = error.message;
    }
  }
  function refresh(preferred = '') {
    choosingProgram=false; budget=prefs.seconds;
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
  function showPrograms() {
    choosingProgram=true; budget=prefs.seconds;
    choice.replaceChildren(...programs.map(p=>new Option(p.name,p.id)));
    showMode(false);
  }
  programTab.addEventListener('click',showPrograms);
  get('open-programs','button').addEventListener('click',()=>{
    name.value=''; browse.disabled=!stored().length; showPrograms(); dialog.showModal();
  });
  programTime.addEventListener('click',()=>{budget=draftSeconds; checkDraft();});
  browse.addEventListener('click', () => refresh());
  saveMode.addEventListener('click', () => showMode(true));
  choice.addEventListener('change', () => { budget=prefs.seconds; notice.textContent = ''; showRoutine(); });
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
      apply(submit({...prefs, seconds:budget, steps}),budget);
      dialog.close();
    } catch (error) {
      fit.textContent = error.message;
      use.disabled = true;
    }
  });
}
