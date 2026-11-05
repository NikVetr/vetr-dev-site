// The page: editors for guests, pairs and groups, tables and settings that build a request
// for the core's submit(), which runs in a Web Worker (worker.js), and the replay of its
// result (replay.js). window.Seating exposes the same submit() to scripts and agents.

import { SeatingError, fromRRequest, renderSeatingSvg } from './core/index.js';
import { tableLabel } from './core/chart.js';
import { buildProblem } from './core/request.js';
import { loadReplay, pause, replayState } from './replay.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/request.js').Issue} Issue
 * @typedef {{ name: string, category: string }} GuestRow
 * @typedef {'together' | 'apart' | 'score' | 'cost'} PairKind
 * @typedef {{ kind: PairKind, guests: string, value: string }} PairRow
 * @typedef {{ name: string, seats: string, x: string, y: string }} TableRow
 */

const STORAGE_KEY = 'seating:v1';
const KINDS = /** @type {const} */ ([['together', 'Together'], ['apart', 'Apart'], ['score', 'Pair score'], ['cost', 'Room cost']]);

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const part = (/** @type {Element} */ root, /** @type {string} */ selector) => /** @type {any} */ (root.querySelector(selector));
/** @type {Record<string, any>} */
const el = {
  guestRows: byId('guest-rows'), pairRows: byId('pair-rows'), tableRows: byId('table-rows'),
  guestCount: byId('guest-count'), pairCount: byId('pair-count'), issues: byId('issues'),
  tablesMode: byId('tables-mode'), seats: byId('seats'), layout: byId('layout'), seatsNote: byId('seats-note'),
  tableObjective: byId('table-objective'), wTable: byId('w-table'), wPairs: byId('w-pairs'), wGeography: byId('w-geography'),
  constraintPenalty: byId('constraint-penalty'), geography: byId('geography'), tablemates: byId('tablemates'),
  iterations: byId('iterations'), logitScale: byId('logit-scale'), seed: byId('seed'),
  arrangement: byId('arrangement'), traceAxis: byId('trace-axis'), speed: byId('speed'), animate: byId('animate'),
  run: byId('run'), stop: byId('stop'), status: byId('status'), noResult: byId('no-result'), result: byId('result'), stale: byId('stale'),
  undoNote: byId('undo-note'), undoText: byId('undo-text'),
  dialog: byId('json-dialog'), jsonText: byId('json-text'), jsonIssues: byId('json-issues'), requestFile: byId('request-file'),
};

/** @type {GuestRow[]} */
let guests = [];
/** @type {PairRow[]} */
let pairs = [];
/** @type {TableRow[]} */
let tableRows = [];
/** @type {Result | null} */
let result = null;
/** The request the result on view answers. @type {any} */
let resultRequest = null;
/** The same request as the page's inputs write it, to tell when they no longer match. @type {any} */
let resultInputs = null;
/** Whether the last run from the page failed, leaving the earlier seating on view. */
let failed = false;
/** What Load example or Clear replaced, until the inputs are next edited. @type {any} */
let replaced = null;
/** @type {Worker | null} */
let worker = null;
/** @type {((error: Error) => void) | null} */
let cancelRun = null;

// ---------- page <-> request ----------

const splitNames = (/** @type {string} */ s) => s.split(',').map((x) => x.trim()).filter(Boolean);
/** A number typed in a field, or the text itself, which the core then reports. @param {string} s */
const numberOr = (s) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : s);

/**
 * The request the inputs describe, where each pair row went in it, and the problems only the
 * page can see (a pair score or room cost naming other than two guests).
 */
function buildRequest() {
  /** @type {Issue[]} */
  const pageIssues = [];
  /** @type {Record<PairKind, number[]>} rows of each kind, in request order */
  const rowsOf = { together: [], apart: [], score: [], cost: [] };
  /** @type {Record<string, any>} */
  const request = {
    guests: guests.map((g) => ({ id: g.name.trim(), ...(g.category.trim() !== '' && { category: numberOr(g.category) }) })),
  };
  request.tables = el.tablesMode.value === 'seats'
    ? { seats: numberOr(el.seats.value), layout: el.layout.value }
    : tableRows.map((t) => ({
      id: t.name.trim(), capacity: numberOr(t.seats),
      ...(t.x.trim() !== '' && { x: numberOr(t.x) }), ...(t.y.trim() !== '' && { y: numberOr(t.y) }),
    }));
  /** @type {Record<PairKind, any[]>} */
  const lists = { together: [], apart: [], score: [], cost: [] };
  pairs.forEach((p, row) => {
    const names = splitNames(p.guests);
    if (p.kind === 'together' || p.kind === 'apart') {
      lists[p.kind].push(names);
    } else {
      if (names.length !== 2) {
        pageIssues.push({ code: 'wrong_count', path: `page.pairs[${row}]`, message: `a ${p.kind === 'score' ? 'pair score' : 'room cost'} needs exactly two guests, not ${names.length}` });
        return;
      }
      lists[p.kind].push({ a: names[0], b: names[1], [p.kind === 'score' ? 'score' : 'cost']: numberOr(p.value) });
    }
    rowsOf[p.kind].push(row);
  });
  if (lists.score.length) request.pairs = lists.score;
  if (lists.together.length) request.together = lists.together;
  if (lists.apart.length) request.apart = lists.apart;
  if (el.geography.value !== 'off') {
    request.geography = { cost: el.geography.value === 'category' ? 'category' : lists.cost, tablemates: el.tablemates.checked };
  }
  request.options = {
    tableObjective: el.tableObjective.value,
    weights: { table: numberOr(el.wTable.value), pairs: numberOr(el.wPairs.value), geography: numberOr(el.wGeography.value) },
    constraintPenalty: numberOr(el.constraintPenalty.value),
    ...(el.iterations.value.trim() !== '' && { iterations: numberOr(el.iterations.value) }),
    logitScale: numberOr(el.logitScale.value),
    seed: numberOr(el.seed.value),
    record: 'moves',
  };
  return { request, rowsOf, pageIssues };
}

const currentRequest = () => buildRequest().request;

/** Puts a request (this tool's spelling) into the inputs. @param {any} request */
function loadRequest(request) {
  const o = request.options ?? {};
  guests = (request.guests ?? []).map((/** @type {any} */ g) => ({ name: String(g.id ?? ''), category: g.category === undefined ? '' : String(g.category) }));
  pairs = [
    ...(request.together ?? []).map((/** @type {string[]} */ g) => ({ kind: 'together', guests: g.join(', '), value: '' })),
    ...(request.apart ?? []).map((/** @type {string[]} */ g) => ({ kind: 'apart', guests: g.join(', '), value: '' })),
    ...(request.pairs ?? []).map((/** @type {any} */ p) => ({ kind: 'score', guests: `${p.a}, ${p.b}`, value: String(p.score) })),
    ...(Array.isArray(request.geography?.cost) ? request.geography.cost : []).map((/** @type {any} */ p) => ({ kind: 'cost', guests: `${p.a}, ${p.b}`, value: String(p.cost) })),
  ];
  if (Array.isArray(request.tables)) {
    el.tablesMode.value = 'list';
    tableRows = request.tables.map((/** @type {any} */ t) => ({ name: String(t.id ?? ''), seats: String(t.capacity ?? ''), x: t.x === undefined ? '' : String(t.x), y: t.y === undefined ? '' : String(t.y) }));
  } else {
    el.tablesMode.value = 'seats';
    el.seats.value = String(request.tables?.seats ?? 8);
    el.layout.value = request.tables?.layout ?? 'spiral';
  }
  el.geography.value = !request.geography ? 'off' : request.geography.cost === 'category' ? 'category' : 'pairs';
  el.tablemates.checked = request.geography?.tablemates ?? true;
  el.tableObjective.value = o.tableObjective ?? 'sqrt_distance';
  el.wTable.value = String(o.weights?.table ?? 1);
  el.wPairs.value = String(o.weights?.pairs ?? 1);
  el.wGeography.value = String(o.weights?.geography ?? 1);
  el.constraintPenalty.value = String(o.constraintPenalty ?? 1000);
  el.iterations.value = o.iterations === undefined ? '' : String(o.iterations);
  el.logitScale.value = String(o.logitScale ?? 1);
  el.seed.value = String(o.seed ?? 1);
  renderEditors();
}

// ---------- editors ----------

function renderEditors() {
  el.guestRows.replaceChildren(...guests.map((g, i) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(i);
    tr.innerHTML = `<th scope="row" class="index"></th>
      <td><textarea class="name" rows="1" spellcheck="false"></textarea></td>
      <td class="category-col"><input class="category" inputmode="decimal" autocomplete="off"></td>
      <td class="remove-col"><button type="button" class="remove">×</button></td>`;
    part(tr, '.index').textContent = String(i + 1);
    Object.assign(part(tr, '.name'), { value: g.name, ariaLabel: `Guest ${i + 1} name` });
    Object.assign(part(tr, '.category'), { value: g.category, ariaLabel: `Guest ${i + 1} category` });
    part(tr, '.remove').setAttribute('aria-label', `Remove guest ${i + 1}`);
    return tr;
  }));
  el.pairRows.replaceChildren(...pairs.map((p, i) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(i);
    tr.dataset.kind = p.kind;
    tr.innerHTML = `<th scope="row" class="index"></th>
      <td class="kind-col"><select class="kind">${KINDS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></td>
      <td class="guests-col"><textarea class="guests" rows="1" spellcheck="false"></textarea></td>
      <td class="value-col"><input class="value" inputmode="decimal" autocomplete="off"></td>
      <td class="remove-col"><button type="button" class="remove">×</button></td>`;
    part(tr, '.index').textContent = String(i + 1);
    Object.assign(part(tr, '.kind'), { value: p.kind, ariaLabel: `Row ${i + 1} kind` });
    Object.assign(part(tr, '.guests'), { value: p.guests, ariaLabel: `Row ${i + 1} guests` });
    const value = part(tr, '.value');
    const grouped = p.kind === 'together' || p.kind === 'apart';
    Object.assign(value, { value: grouped ? '' : p.value, disabled: grouped, placeholder: grouped ? 'n/a' : '', ariaLabel: `Row ${i + 1} value` });
    part(tr, '.remove').setAttribute('aria-label', `Remove row ${i + 1}`);
    return tr;
  }));
  el.tableRows.replaceChildren(...tableRows.map((t, i) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(i);
    tr.innerHTML = `<th scope="row" class="index"></th>
      <td><textarea class="name" rows="1" spellcheck="false"></textarea></td>
      <td class="num-col"><input class="seats" inputmode="numeric" autocomplete="off"></td>
      <td class="num-col"><input class="x" inputmode="decimal" autocomplete="off"></td>
      <td class="num-col"><input class="y" inputmode="decimal" autocomplete="off"></td>
      <td class="remove-col"><button type="button" class="remove">×</button></td>`;
    part(tr, '.index').textContent = String(i + 1);
    for (const f of /** @type {const} */ (['name', 'seats', 'x', 'y'])) Object.assign(part(tr, `.${f}`), { value: t[f], ariaLabel: `Table ${i + 1} ${f === 'name' ? 'name' : f}` });
    part(tr, '.remove').setAttribute('aria-label', `Remove table ${i + 1}`);
    return tr;
  }));
  /** @param {HTMLElement} body @param {number} columns @param {string} text */
  const emptyRow = (body, columns, text) => {
    if (body.children.length) return;
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.append(Object.assign(document.createElement('td'), { colSpan: columns, textContent: text }));
    body.append(tr);
  };
  emptyRow(el.guestRows, 4, 'No guests yet: add one, paste or open a request, or load the example.');
  emptyRow(el.pairRows, 5, 'No pairs or groups: every guest is free to sit anywhere.');
  for (const area of document.querySelectorAll('.editor textarea')) fitHeight(/** @type {HTMLTextAreaElement} */ (area));
  showTablesMode();
  changed({ keepUndo: true });
}

/** Grows a one-line text box to show all of its text, wrapped. @param {HTMLTextAreaElement} area */
function fitHeight(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

/**
 * One editor's input and remove handling: each input's class names its row field.
 * @param {HTMLElement} body @param {() => any[]} rows
 */
function wireEditor(body, rows) {
  body.addEventListener('input', (event) => {
    const target = /** @type {any} */ (event.target);
    const tr = target.closest('tr');
    const row = rows()[Number(tr.dataset.index)];
    if (target.tagName === 'TEXTAREA') {
      if (/\n/.test(target.value)) target.value = target.value.replace(/\n/g, ' '); // one line, wrapped
      fitHeight(target);
    }
    row[target.classList[0]] = target.value;
    if (target.classList.contains('kind')) {
      // together and apart groups have no value
      const value = part(tr, '.value');
      const grouped = row.kind === 'together' || row.kind === 'apart';
      Object.assign(value, { disabled: grouped, placeholder: grouped ? 'n/a' : '' });
      if (grouped) value.value = '';
      tr.dataset.kind = row.kind;
    }
    changed();
  });
  body.addEventListener('click', (event) => {
    const button = /** @type {any} */ (event.target).closest('.remove');
    if (!button) return;
    dropUndo();
    rows().splice(Number(button.closest('tr').dataset.index), 1);
    renderEditors();
  });
}
// Narrower columns wrap names onto more lines, so refit every text box.
let editorWidth = 0;
new ResizeObserver(() => {
  if (el.guestRows.clientWidth === editorWidth) return;
  editorWidth = el.guestRows.clientWidth;
  for (const area of document.querySelectorAll('.editor textarea')) fitHeight(/** @type {HTMLTextAreaElement} */ (area));
}).observe(el.guestRows);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && /** @type {HTMLElement} */ (event.target).matches?.('.editor textarea')) event.preventDefault();
});
wireEditor(el.guestRows, () => guests);
wireEditor(el.pairRows, () => pairs);
wireEditor(el.tableRows, () => tableRows);

/** @param {any} body @param {string} selector */
function addRow(body, selector) {
  dropUndo();
  renderEditors();
  body.lastElementChild?.querySelector(selector)?.focus();
}
byId('add-guest').addEventListener('click', () => {
  guests.push({ name: '', category: guests.at(-1)?.category ?? '1' });
  addRow(el.guestRows, '.name');
});
byId('add-pair').addEventListener('click', () => {
  pairs.push({ kind: 'together', guests: '', value: '' });
  addRow(el.pairRows, '.guests');
});
byId('add-table').addEventListener('click', () => {
  tableRows.push({ name: `Table ${tableRows.length + 1}`, seats: tableRows.at(-1)?.seats ?? '8', x: '', y: '' });
  addRow(el.tableRows, '.name');
});
byId('make-tables').addEventListener('click', () => {
  const count = Math.max(2, Math.min(300, Math.round(byId('make-count').valueAsNumber || 2)));
  const seats = byId('make-seats').value;
  dropUndo();
  tableRows = Array.from({ length: count }, (_, i) => ({ name: `Table ${i + 1}`, seats, x: '', y: '' }));
  renderEditors();
});

function showTablesMode() {
  for (const node of document.querySelectorAll('#tables-card [data-mode]')) /** @type {HTMLElement} */ (node).hidden = /** @type {HTMLElement} */ (node).dataset.mode !== el.tablesMode.value;
  if (el.tablesMode.value === 'list' && !tableRows.length) {
    const n = Math.max(2, Math.floor(guests.length / (Number(el.seats.value) || 8)));
    tableRows = Array.from({ length: n }, (_, i) => ({ name: `Table ${i + 1}`, seats: el.seats.value || '8', x: '', y: '' }));
    renderEditors();
  }
}

// ---------- checking, staleness, persistence ----------

let checkTimer = 0;
/** After any change to the inputs: recount, recheck and save. @param {{ keepUndo?: boolean }} [options] */
function changed({ keepUndo = false } = {}) {
  if (!keepUndo) dropUndo();
  el.guestCount.textContent = `${guests.length} guest${guests.length === 1 ? '' : 's'}`;
  el.pairCount.textContent = `${pairs.length} row${pairs.length === 1 ? '' : 's'}`;
  const n = guests.length;
  el.iterations.placeholder = `${(50 * n).toLocaleString('en-US')} (50 per guest)`;
  const seats = Number(el.seats.value);
  if (Number.isInteger(seats) && seats >= 1 && n >= 2) {
    const count = Math.floor(n / seats);
    const extra = n % seats;
    const sizes = Array.from({ length: count }, (_, t) => seats + Math.floor(extra / count) + (t < extra % count ? 1 : 0));
    el.seatsNote.textContent = count >= 2
      ? `${n} guests at ${seats} a table: ${count} tables, of ${[...new Set(sizes)].sort((a, b) => b - a).join(' and ')} seats (the guests left over join the first tables, one each).`
      : `${n} guests at ${seats} a table make fewer than 2 tables.`;
  } else {
    el.seatsNote.textContent = '';
  }
  window.clearTimeout(checkTimer);
  checkTimer = window.setTimeout(check, 150);
  showStale();
  save();
}

/** Validates the inputs as the core will, and lists the problems where they can be fixed. */
function check() {
  const { request, rowsOf, pageIssues } = buildRequest();
  /** @type {Issue[]} */
  let issues = [...pageIssues];
  try {
    buildProblem(request);
  } catch (error) {
    if (!(error instanceof SeatingError)) throw error;
    issues.push(...error.issues);
  }
  if (!guests.length) issues = issues.filter((i) => i.path !== 'guests');
  showIssues(issues, rowsOf);
  return issues;
}

/**
 * Where a problem is, in the page's words, and the field to mark.
 * @param {Issue} issue @param {Record<PairKind, number[]>} rowsOf
 * @returns {[string, Element | null]}
 */
function locate(issue, rowsOf) {
  const p = issue.path;
  /** @type {[RegExp, (m: RegExpExecArray) => [string, Element | null]][]} */
  const rules = [
    [/^guests\[(\d+)\](?:\.(id|category))?$/, (m) => [`Guest ${+m[1] + 1}${m[2] ? `, ${m[2] === 'id' ? 'name' : 'category'}` : ''}`, el.guestRows.children[+m[1]]?.querySelector(m[2] === 'category' ? '.category' : '.name') ?? null]],
    [/^page\.pairs\[(\d+)\]$/, (m) => [`Pairs and groups row ${+m[1] + 1}`, el.pairRows.children[+m[1]]?.querySelector('.guests') ?? null]],
    [/^(pairs|together|apart|geography\.cost)\[(\d+)\](?:\[(\d+)\]|\.(a|b|score|cost))?$/, (m) => {
      const kind = /** @type {PairKind} */ ({ pairs: 'score', together: 'together', apart: 'apart', 'geography.cost': 'cost' }[m[1]]);
      const row = rowsOf[kind][+m[2]];
      const tr = el.pairRows.children[row];
      const field = m[4] === 'score' || m[4] === 'cost' ? '.value' : '.guests';
      let where = `Pairs and groups row ${row + 1}`;
      if (issue.code === 'unknown_guest') {
        const names = splitNames(pairs[row].guests);
        const name = m[3] !== undefined ? names[+m[3]] : names[m[4] === 'b' ? 1 : 0];
        where += `: "${name}"`;
      }
      return [where, tr?.querySelector(field) ?? null];
    }],
    [/^tables\[(\d+)\](?:\.(id|capacity|x|y))?$/, (m) => [`Table ${+m[1] + 1}${m[2] ? `, ${{ id: 'name', capacity: 'seats', x: 'x', y: 'y' }[m[2]]}` : ''}`, el.tableRows.children[+m[1]]?.querySelector(`.${m[2] === 'capacity' ? 'seats' : m[2] === 'id' ? 'name' : m[2] ?? 'name'}`) ?? null]],
    [/^tables\.seats$/, () => ['Seats per table', el.seats]],
    [/^tables$/, () => ['Tables', null]],
    [/^guests$/, () => ['Guests', null]],
    [/^options\.weights\.(\w+)$/, (m) => [`${{ table: 'Table term', pairs: 'Pair score', geography: 'Geography' }[m[1]]} weight`, el[`w${m[1][0].toUpperCase()}${m[1].slice(1)}`]]],
    [/^options\.(\w+)$/, (m) => {
      const field = el[m[1]];
      return [field ? labelOf(field) : m[1], field ?? null];
    }],
    [/^geography\.tablemates$/, () => ['Tablemates', el.tablemates]],
  ];
  for (const [re, f] of rules) {
    const m = re.exec(p);
    if (m) return f(m);
  }
  return [p, null];
}

/** A field's name as its label shows it, without a parenthetical hint. @param {HTMLElement} field */
function labelOf(field) {
  const label = /** @type {HTMLLabelElement} */ (field.closest('label'));
  const text = [...label.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
  return text.replace(/\s*\(.*\)\s*$/, '').trim();
}

/** @param {Issue[]} issues @param {Record<PairKind, number[]>} rowsOf */
function showIssues(issues, rowsOf) {
  for (const marked of document.querySelectorAll('main [aria-invalid]')) marked.removeAttribute('aria-invalid');
  for (const tr of document.querySelectorAll('main tr.has-issue')) tr.classList.remove('has-issue');
  el.issues.hidden = !issues.length;
  if (!issues.length) {
    el.issues.replaceChildren();
    return;
  }
  const list = document.createElement('ul');
  for (const issue of issues) {
    const [where, field] = locate(issue, rowsOf);
    const message = issue.code === 'unknown_guest' ? 'is not on the guest list' : issue.message;
    list.append(Object.assign(document.createElement('li'), { textContent: `${where}${issue.code === 'unknown_guest' ? ' ' : ': '}${message}` }));
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.closest('tr')?.classList.add('has-issue');
    }
  }
  el.issues.replaceChildren(Object.assign(document.createElement('p'), { className: 'issues-head', textContent: 'Fix these before finding a seating:' }), list);
}

/** Says whether, and why, the seating on view no longer matches the inputs. */
function showStale() {
  if (!result || !resultInputs) return;
  const now = currentRequest();
  const same = (/** @type {(r: any) => unknown} */ f) => JSON.stringify(f(now)) === JSON.stringify(f(resultInputs));
  const parts = [
    !same((r) => r.guests) && 'guests',
    !same((r) => [r.pairs, r.together, r.apart, Array.isArray(r.geography?.cost) && r.geography.cost]) && 'pairs and groups',
    !same((r) => r.tables) && 'tables',
    !same((r) => [r.options, r.geography?.tablemates, r.geography && (r.geography.cost === 'category')]) && 'settings',
  ].filter(Boolean);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const reason = failed
    ? 'the last search did not run (see the problems above). This is the seating found before it.'
    : what ? `the ${what} changed since this seating was found. Press Find a seating to update it.` : '';
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
}

function save() {
  const view = Object.fromEntries(['arrangement', 'traceAxis', 'speed'].map((k) => [k, el[k].value]));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ request: currentRequest(), view: { ...view, animate: el.animate.checked } })); } catch { /* not remembered */ }
}

function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { /* start fresh */ }
  if (!saved?.request) return false;
  loadRequest(saved.request);
  for (const k of ['arrangement', 'traceAxis', 'speed']) if (saved.view?.[k] !== undefined) el[k].value = saved.view[k];
  if (typeof saved.view?.animate === 'boolean') el.animate.checked = saved.view.animate;
  return true;
}

for (const input of document.querySelectorAll('#tables-card select, #tables-card > .settings input, #settings-card input, #settings-card select')) {
  if (input.closest('.inline-make')) continue;
  input.addEventListener('input', () => {
    if (input === el.tablesMode) showTablesMode();
    changed();
  });
}
for (const k of ['speed', 'animate']) el[k].addEventListener('change', save);
byId('new-seed').addEventListener('click', () => {
  el.seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0] % 2147483648);
  changed();
});

// ---------- example, clear, undo ----------

/** Replaces every input at once and offers the old ones back. @param {any} next @param {string} note */
function replaceAll(next, note) {
  const before = currentRequest();
  loadRequest(next);
  replaced = before.guests.length ? before : null;
  el.undoText.textContent = note;
  el.undoNote.hidden = !replaced;
}

function dropUndo() {
  replaced = null;
  el.undoNote.hidden = true;
}

async function exampleRequest() {
  const response = await fetch('examples/party.json');
  if (!response.ok) throw new Error(`could not load the example (HTTP ${response.status})`);
  return response.json();
}

byId('load-example').addEventListener('click', async () => {
  const before = guests.length;
  replaceAll(await exampleRequest(), `Replaced your ${before} guest${before === 1 ? '' : 's'}, pairs, tables and settings with the example.`);
  runFromPage();
});
byId('clear-all').addEventListener('click', () => {
  const n = guests.length;
  const { tables, geography, options } = currentRequest();
  const keptGeography = geography && { ...geography, cost: geography.cost === 'category' ? 'category' : [] };
  replaceAll({ guests: [], tables, ...(keptGeography && { geography: keptGeography }), options }, `Cleared ${n} guest${n === 1 ? '' : 's'} and their pairs and groups.`);
});
byId('undo-replace').addEventListener('click', () => {
  if (!replaced) return;
  const back = replaced;
  dropUndo();
  loadRequest(back);
});

// ---------- request JSON: paste, edit, open ----------

/**
 * Reads request text (either spelling): the request, or the problems with it.
 * @param {string} text @returns {{ request: any, issues: string[] }}
 */
function readRequest(text) {
  /** @type {any} */
  let request;
  try {
    request = fromRRequest(JSON.parse(text));
  } catch (error) {
    return { request: null, issues: [`This is not valid JSON: ${/** @type {Error} */ (error).message}`] };
  }
  try {
    buildProblem(request);
  } catch (error) {
    if (!(error instanceof SeatingError)) throw error;
    return { request: null, issues: error.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)) };
  }
  return { request, issues: [] };
}

/** @param {HTMLElement} box @param {string[]} messages */
function listMessages(box, messages) {
  box.hidden = !messages.length;
  const list = document.createElement('ul');
  list.replaceChildren(...messages.map((m) => Object.assign(document.createElement('li'), { textContent: m })));
  box.replaceChildren(list);
}

/** @param {string} text @param {string[]} [issues] */
function openDialog(text, issues = []) {
  el.jsonText.value = text;
  listMessages(el.jsonIssues, issues);
  el.dialog.showModal();
}

byId('edit-json').addEventListener('click', () => openDialog(JSON.stringify(currentRequest(), null, 2)));
for (const button of el.dialog.querySelectorAll('.dialog-close')) button.addEventListener('click', () => el.dialog.close());
byId('json-apply').addEventListener('click', () => {
  const read = readRequest(el.jsonText.value);
  if (!read.request) {
    listMessages(el.jsonIssues, read.issues);
    return;
  }
  el.dialog.close();
  dropUndo();
  loadRequest(read.request);
  runFromPage({ autoplay: true });
});
el.requestFile.addEventListener('change', async () => {
  const file = el.requestFile.files?.[0];
  el.requestFile.value = '';
  if (!file) return;
  const text = await file.text();
  const read = readRequest(text);
  if (!read.request) {
    openDialog(text, [`${file.name} cannot be loaded as it is:`, ...read.issues]);
    return;
  }
  dropUndo();
  loadRequest(read.request);
  runFromPage({ autoplay: true });
});

// ---------- running ----------

/**
 * Runs a request in the worker. Resolves with the result; rejects with a SeatingError, or
 * an Error if stopped.
 * @param {object} request
 * @returns {Promise<Result>}
 */
function run(request) {
  stopRun();
  const started = performance.now();
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  setRunning(true);
  el.status.textContent = 'Searching…';
  return new Promise((resolve, reject) => {
    const finish = () => {
      worker?.terminate();
      worker = null;
      cancelRun = null;
      setRunning(false);
    };
    cancelRun = (error) => {
      finish();
      el.status.textContent = 'Stopped';
      reject(error);
    };
    /** @type {Worker} */ (worker).onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const p = data.progress;
        el.status.textContent = `Searching: iteration ${p.iteration.toLocaleString('en-US')} of ${p.iterations.toLocaleString('en-US')}, best ${p.best.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
      } else if (data.type === 'result') {
        finish();
        const r = /** @type {Result} */ (data.result);
        el.status.textContent = `Found in ${((performance.now() - started) / 1000).toFixed(1)} s: ${r.search.accepted.toLocaleString('en-US')} moves kept of ${r.search.iterations.toLocaleString('en-US')} tried`;
        resolve(r);
      } else {
        finish();
        el.status.textContent = 'Not run';
        reject(new SeatingError(data.error.code, data.error.message, data.error.issues));
      }
    };
    /** @type {Worker} */ (worker).onerror = (event) => {
      finish();
      el.status.textContent = 'Failed';
      reject(new Error(`the worker failed: ${event.message}`));
    };
    /** @type {Worker} */ (worker).postMessage({ request });
  });
}

function stopRun() {
  cancelRun?.(new Error('stopped'));
}

/** @param {boolean} running */
function setRunning(running) {
  el.run.disabled = running;
  el.stop.disabled = !running;
}

/** Runs the inputs' request and shows the result, playing it when asked to. */
async function runFromPage({ autoplay = false } = {}) {
  window.clearTimeout(checkTimer);
  const issues = check();
  const request = currentRequest();
  if (issues.length) {
    failed = Boolean(result);
    showStale();
    el.status.textContent = 'Not run';
    return;
  }
  try {
    showResult(await run(request), request, request, { autoplay });
  } catch (error) {
    if (!(error instanceof SeatingError)) return;
    showIssues(error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }], buildRequest().rowsOf);
    failed = Boolean(result);
    showStale();
  }
}

el.run.addEventListener('click', () => runFromPage({ autoplay: !matchMedia('(prefers-reduced-motion: reduce)').matches }));
el.stop.addEventListener('click', stopRun);

/**
 * @param {Result} next @param {any} request the request it answers
 * @param {any} inputs that request as the page's inputs write it
 * @param {{ autoplay?: boolean }} [options]
 */
function showResult(next, request, inputs, { autoplay = false } = {}) {
  result = next;
  resultRequest = request;
  resultInputs = inputs;
  failed = false;
  el.noResult.hidden = true;
  el.result.hidden = false;
  showStale();
  loadReplay(next, request, { autoplay });
  document.documentElement.dataset.ready = 'true';
}

// ---------- downloads ----------

function exportSvgText() {
  if (!result) throw new Error('there is no seating yet');
  return renderSeatingSvg(result, resultRequest, { theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
}

/** The best seating as CSV: one row per seat. */
function exportSeatingCsv() {
  if (!result) throw new Error('there is no seating yet');
  const categories = new Map(resultRequest.guests.map((/** @type {any} */ g) => [g.id, g.category]));
  const cell = (/** @type {unknown} */ v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['table', 'seat', 'guest', 'category']];
  for (const t of result.tables) t.seats.forEach((id, j) => rows.push([tableLabel(t.id), String(j + 1), id ?? '', id === null ? '' : categories.get(id)]));
  return `${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
byId('export-csv').addEventListener('click', () => download('seating.csv', new Blob([exportSeatingCsv()], { type: 'text/csv' })));
byId('export-svg').addEventListener('click', () => download('seating.svg', new Blob([exportSvgText()], { type: 'image/svg+xml' })));
byId('export-result').addEventListener('click', () => download('seating-result.json', new Blob([`${JSON.stringify(result)}\n`], { type: 'application/json' })));
byId('export-request').addEventListener('click', () => download('seating-request.json', new Blob([`${JSON.stringify(resultRequest, null, 2)}\n`], { type: 'application/json' })));

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).Seating = {
  /**
   * Runs a request (see api.md) in the worker, loads it into the page and shows the result,
   * at the best seating. An invalid request rejects with a SeatingError and leaves the page
   * as it was.
   * @param {object} request
   */
  async submit(request) {
    const next = await run(request);
    dropUndo();
    loadRequest(request);
    showResult(next, request, currentRequest());
    return next;
  },
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText,
  exportSeatingCsv,
  replay: replayState,
  pause,
  stop: stopRun,
};

// ---------- start ----------

if (!restore()) loadRequest(await exampleRequest());
await runFromPage();
if (!result) document.documentElement.dataset.ready = 'true';
