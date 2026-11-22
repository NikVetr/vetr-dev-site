import { prepareGroup, groupRankings } from './group-profiles.mjs';
import { importRatingEntries } from './exchange.mjs';
import { node, percent, scoreText, signed } from './detail.mjs';

const el = (id) => document.getElementById(id);
const colors = ['#388a7b', '#ad6550', '#7868c2', '#4b83b9', '#b17924', '#9f5c94'];
const gap = signed;
export function openGroupDialog({
  catalog,
  state,
  titles,
  matches,
  scaleLabel,
  scaleChoices,
  markChoices,
  inspect,
}) {
  const dialog = /** @type {HTMLDialogElement} */ (el('group-dialog'));
  if (dialog.open) return;
  const saved = (state.group ??= { files: [], useMine: true, order: 'joint' });
  const mine = {
    name: 'Your ratings',
    ratings: state.applied,
    ratedOn: state.appliedDates,
    volunteered: Object.keys(state.applied).filter((id) => state.appliedSources[id] === 'volunteered'),
  };
  const mineCount = Object.keys(mine.ratings).length;
  const include = /** @type {HTMLInputElement} */ (el('group-mine'));
  const uploader = /** @type {HTMLInputElement} */ (el('group-files'));
  const sort = /** @type {HTMLSelectElement} */ (el('group-sort'));
  const axisOrder = /** @type {HTMLSelectElement} */ (el('group-axis-order'));
  const more = /** @type {HTMLButtonElement} */ (el('group-more'));
  const message = el('group-message');
  let group,
    limit = 30,
    rows = [],
    threshold = saved.threshold ?? state.threshold;
  const memberList = () => [...(include.checked ? [mine] : []), ...saved.files];
  const color = (i) => colors[i % colors.length];
  const label = (itemId) => titles.get(itemId) ?? itemId;
  const short = (n) => scoreText(n, 2);
  const choose = (id) => {
    dialog.close();
    inspect(id);
  };
  const itemButton = (id) => {
    const b = node('button', label(id));
    b.type = 'button';
    b.className = 'group-title';
    b.onclick = () => choose(id);
    return b;
  };
  include.checked = !!mineCount && saved.useMine;
  include.disabled = !mineCount;
  el('group-my-count').textContent = '(' + mineCount + ')';
  el('group-source').textContent = catalog.name;
  sort.value = saved.order;
  axisOrder.value = 'far';
  const cutoff = scaleChoices('group-cutoff', 'Minimum answer for everyone');
  const cutoffCaption = el('group-cutoff-label');
  const cutoffHost = el('group-cutoff');
  cutoffHost.replaceChildren(cutoff);
  function setCutoff(value) {
    threshold = value;
    saved.threshold = value;
    cutoffCaption.textContent = 'At least ' + scaleLabel(value);
    markChoices(cutoff, value);
    rerank();
  }
  cutoff.onchange = (e) => {
    if (e.target instanceof HTMLInputElement) setCutoff(Number(e.target.value));
  };
  function drawPicks() {
    const head = el('group-table-head'),
      body = el('group-table-body');
    head.replaceChildren(
      ...[
        'Title',
        'Everyone ≥ ' + scaleLabel(threshold),
        'Group mean',
        ...memberList().map((p) => p.name),
      ].map((t) => node('th', t)),
    );
    body.replaceChildren();
    for (const row of rows.slice(0, limit)) {
      const tr = document.createElement('tr');
      tr.insertCell().append(itemButton(row.itemId));
      tr.insertCell().textContent = percent(row.joint);
      tr.insertCell().textContent = short(row.expected);
      row.means.forEach((v, i) => {
        tr.insertCell().textContent = sort.value === 'joint' ? percent(row.chances[i]) : short(v);
      });
      body.append(tr);
    }
    more.hidden = rows.length <= limit;
    el('group-count').textContent = rows.length
      ? 'Showing ' + Math.min(limit, rows.length) + ' of ' + rows.length + ' entries unrated by everyone.'
      : 'No jointly unrated entries match the current filters.';
  }
  function rerank() {
    if (!group) return;
    rows = groupRankings(group, threshold, sort.value).filter((row) => matches(row.itemId));
    limit = 30;
    drawPicks();
  }
  function drawAxes() {
    const host = el('group-axes');
    host.replaceChildren();
    if (!group) return;
    const axes = axisOrder.value === 'near' ? [...group.axes].reverse() : group.axes;
    if (!axes.length) {
      host.textContent = 'This model has no distinctly labeled preference axes.';
      return;
    }
    for (const axis of axes) {
      const row = node('div');
      row.className = 'group-axis';
      const rail = node('div');
      rail.className = 'group-rail';
      const extent = Math.max(2, ...axis.positions.map(Math.abs));
      axis.positions.forEach((v, i) => {
        const dot = node('span');
        dot.className = 'group-dot';
        dot.style.left = 50 + (47 * v) / extent + '%';
        dot.style.top = 7 + i * 7 + 'px';
        dot.style.backgroundColor = color(i);
        rail.append(dot);
      });
      rail.style.height = 14 + axis.positions.length * 7 + 'px';
      const values = axis.positions.map((v, i) => memberList()[i].name + ' ' + gap(v)).join(' · ');
      row.title = values;
      row.append(
        node('span', axis.low),
        rail,
        node('span', axis.high),
        node('small', values + ' · gap ' + short(axis.range) + ' SD'),
      );
      host.append(row);
    }
  }
  function drawDifferences() {
    const host = el('group-surprises');
    host.replaceChildren();
    for (const row of group.surprises.slice(0, 12)) {
      const li = node('li');
      li.append(
        itemButton(row.itemId),
        node(
          'span',
          memberList()[row.profile].name +
            ' rated ' +
            scaleLabel(row.observed) +
            ' · others predicted ' +
            short(row.expected) +
            ' (' +
            gap(row.delta) +
            ')',
        ),
      );
      host.append(li);
    }
    if (!host.children.length)
      host.append(node('li', 'No ratings were unique to a subset of these profiles.'));
    const shared = el('group-shared');
    shared.replaceChildren();
    for (const row of group.shared.slice(0, 12)) {
      const li = node('li');
      li.append(
        itemButton(row.itemId),
        node(
          'span',
          row.observed
            .flatMap((v, i) => (v === null ? [] : [memberList()[i].name + ' ' + scaleLabel(v)]))
            .join(' · '),
        ),
      );
      shared.append(li);
    }
    if (!shared.children.length) shared.append(node('li', 'No entries rated by two or more profiles.'));
  }
  function refresh() {
    group = null;
    message.textContent = '';
    const host = el('group-members');
    host.replaceChildren();
    const profiles = memberList();
    for (const [i, profile] of profiles.entries()) {
      const chip = node('div');
      chip.className = 'group-chip';
      chip.style.borderInlineStartColor = color(i);
      if (profile === mine) chip.append(node('span', mine.name));
      else {
        const name = document.createElement('input');
        name.type = 'text';
        name.value = profile.name;
        name.ariaLabel = 'Profile name';
        name.onchange = () => {
          profile.name = name.value.trim() || profile.name;
          refresh();
        };
        const remove = node('button', '×');
        remove.ariaLabel = 'Remove ' + profile.name;
        remove.onclick = () => {
          saved.files.splice(saved.files.indexOf(profile), 1);
          refresh();
        };
        chip.append(name, node('small', String(Object.keys(profile.ratings).length)), remove);
      }
      host.append(chip);
    }
    const results = el('group-results');
    results.hidden = true;
    if (profiles.length < 2) {
      message.textContent = 'Use Export supplied ratings under Import / export to save each person’s CSV. Include at least two people to compare.';
      return;
    }
    try {
      group = prepareGroup(catalog, { profiles, model: state.model });
      results.hidden = false;
      rerank();
      drawAxes();
      drawDifferences();
    } catch (e) {
      message.textContent = e.message;
    }
  }
  include.onchange = () => {
    saved.useMine = include.checked;
    refresh();
  };
  sort.onchange = () => {
    saved.order = sort.value;
    rerank();
  };
  axisOrder.onchange = drawAxes;
  more.onclick = () => {
    limit += 50;
    drawPicks();
  };
  let generation = 0;
  uploader.onchange = async () => {
    const files = Array.from(uploader.files);
    uploader.value = '';
    const seq = ++generation;
    try {
      const imports = await Promise.all(
        files.map(async (file) => {
          try {
            const entry = importRatingEntries(await file.text(), catalog);
            return {
              name: file.name.replace(/\.csv$/i, '') || 'Guest',
              ratings: entry.ratings,
              ratedOn: entry.ratedOn,
              volunteered: Object.keys(entry.ratings).filter((id) => entry.sources[id] === 'volunteered'),
            };
          } catch (e) {
            throw new Error(file.name + ' · ' + e.message);
          }
        }),
      );
      if (!dialog.open || seq !== generation) return;
      const names = new Set(memberList().map((p) => p.name));
      for (const profile of imports) {
        const base = profile.name;
        let n = 2;
        while (names.has(profile.name)) profile.name = base + ' (' + n++ + ')';
        names.add(profile.name);
      }
      saved.files.push(...imports);
      refresh();
    } catch (e) {
      if (dialog.open && seq === generation) message.textContent = e.message;
    }
  };
  dialog.onclose = () => {
    generation++;
    group = null;
    rows = [];
  };
  setCutoff(threshold);
  refresh();
  dialog.showModal();
}
