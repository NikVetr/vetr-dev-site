import { node } from './detail.mjs';

// Alternatives within a field are a union. Active fields and the inclusive year interval intersect.
export function recommendationFilters(catalog, facets) {
  const groups = new Map(),
    years = new Map();
  for (const { itemId, annotations = {} } of catalog.items) {
    if (Number.isInteger(annotations.year)) years.set(itemId, annotations.year);
    for (const [group, values] of Object.entries(facets(annotations))) {
      for (const value of values ?? []) {
        if (!groups.has(group)) groups.set(group, new Map());
        const options = groups.get(group);
        if (!options.has(value)) options.set(value, new Set());
        options.get(value).add(itemId);
      }
    }
  }
  const minYear = Math.min(...years.values()),
    maxYear = Math.max(...years.values());
  const yearLabel = ['recipes', 'books', 'cocktails', 'fanfiction', 'webfiction', 'royalroad'].includes(catalog.domain)
    ? 'Publication year'
    : 'Release year';
  const blank = () => ({ choices: new Map(), years: null, forRating: false });
  let applied = blank();
  function matches(id, filter = applied) {
    if (
      filter.years &&
      (!years.has(id) || years.get(id) < filter.years[0] || years.get(id) > filter.years[1])
    )
      return false;
    for (const [group, selected] of filter.choices) {
      if (![...selected].some((value) => groups.get(group).get(value).has(id))) return false;
    }
    return true;
  }
  function attach(onApply, candidates) {
    const el = (id) => document.getElementById(id);
    const trigger = /** @type {HTMLButtonElement} */ (el('facet'));
    const dialog = /** @type {HTMLDialogElement} */ (el('recommendation-filters'));
    function updateTrigger() {
      const count = applied.choices.size + Number(!!applied.years);
      trigger.textContent = count ? 'Filters (' + count + ')' : 'Filters';
      trigger.disabled = !groups.size && !years.size;
      trigger.setAttribute('aria-label', 'Filter recommendations' + (count ? ', ' + count + ' active' : ''));
    }
    updateTrigger();
    trigger.onclick = () => {
      let draft = structuredClone(applied);
      const pool = candidates();
      const fields = el('filter-fields');
      function preview() {
        const n = pool.filter((id) => matches(id, draft)).length;
        el('filter-matches').textContent =
          n.toLocaleString() + (n === 1 ? ' matching title' : ' matching titles');
      }
      function draw() {
        const scope = /** @type {HTMLInputElement} */ (el('filter-rating-items'));
        scope.checked = draft.forRating;
        scope.onchange = () => {
          draft.forRating = scope.checked;
        };
        fields.replaceChildren();
        if (years.size) {
          const section = node('fieldset'),
            legend = node('legend', yearLabel);
          const active = node('input');
          active.type = 'checkbox';
          active.checked = Boolean(draft.years);
          const activeLabel = node('label');
          activeLabel.append(active, ' ' + yearLabel);
          legend.replaceChildren(activeLabel);
          const endpoints = node('div'),
            track = node('div');
          endpoints.className = 'year-endpoints';
          track.className = 'year-track';
          const range = [...(draft.years ?? [minYear, maxYear])];
          const handles = [],
            numbers = [];
          function updateRange() {
            for (const i of [0, 1]) {
              numbers[i].value = handles[i].value = String(range[i]);
            }
            track.style.setProperty('--lo', (100 * (range[0] - minYear)) / (maxYear - minYear || 1) + '%');
            track.style.setProperty('--hi', (100 * (range[1] - minYear)) / (maxYear - minYear || 1) + '%');
            draft.years = active.checked ? [...range] : null;
            preview();
          }
          for (const [i, label] of ['From', 'Through'].entries()) {
            const handle = node('input'),
              number = node('input');
            handle.type = 'range';
            number.type = 'number';
            handles.push(handle);
            numbers.push(number);
            for (const control of [number, handle]) {
              control.min = String(minYear);
              control.max = String(maxYear);
              control.setAttribute('aria-label', label + ' year' + (control === handle ? ' slider' : ''));
              function commit() {
                if (!Number.isInteger(control.valueAsNumber)) {
                  updateRange();
                  return;
                }
                range[i] = i
                  ? Math.max(range[0], Math.min(maxYear, control.valueAsNumber))
                  : Math.max(minYear, Math.min(range[1], control.valueAsNumber));
                active.checked = true;
                updateRange();
              }
              if (control === handle) control.oninput = commit;
              else control.onchange = commit;
            }
            const endpoint = node('label', label);
            endpoint.append(number);
            endpoints.append(endpoint);
            track.append(handle);
          }
          active.onchange = updateRange;
          updateRange();
          section.append(legend, endpoints, track);
          fields.append(section);
        }
        for (const [group, options] of groups) {
          const details = node('details'),
            heading = node('summary'),
            list = node('div');
          details.open =
            ['Genre', 'Course', 'Fandom', 'Base spirit', 'Game type', 'Topic'].includes(group) ||
            draft.choices.has(group);
          const updateHeading = () => {
            const n = draft.choices.get(group)?.size;
            heading.textContent = n ? group + ' (' + n + ')' : group;
          };
          updateHeading();
          list.className = 'filter-options';
          const search = node('input'),
            more = node('button');
          search.type = 'search';
          search.placeholder = 'Search ' + group.toLowerCase();
          search.setAttribute('aria-label', search.placeholder);
          more.type = 'button';
          more.className = 'more-options';
          let sorted,
            limit = 100;
          const fill = () => {
            if (!details.open) return;
            sorted ??= [...options].sort(
              ([a, aa], [b, bb]) => (group === 'Fandom' ? bb.size - aa.size : 0) || a.localeCompare(b),
            );
            const query = search.value.trim().toLocaleLowerCase();
            const matches = query
              ? sorted.filter(([value]) => value.toLocaleLowerCase().includes(query))
              : sorted;
            list.replaceChildren();
            more.hidden = matches.length <= limit;
            if (!more.hidden) more.textContent = 'Show ' + Math.min(100, matches.length - limit) + ' more';
            if (!matches.length) list.append(node('small', 'No matching options.'));
            for (const [value, ids] of matches.slice(0, limit)) {
              const label = node('label'),
                box = node('input');
              box.type = 'checkbox';
              box.checked = draft.choices.get(group)?.has(value) ?? false;
              box.onchange = () => {
                const set = draft.choices.get(group) ?? new Set();
                if (box.checked) set.add(value);
                else set.delete(value);
                if (set.size) draft.choices.set(group, set);
                else draft.choices.delete(group);
                updateHeading();
                preview();
              };
              label.append(box, node('span', value), node('small', String(ids.size)));
              list.append(label);
            }
          };
          search.oninput = () => {
            limit = 100;
            fill();
          };
          more.onclick = () => {
            limit += 100;
            fill();
          };
          details.append(heading);
          if (options.size > 24) details.append(search);
          details.append(list, more);
          details.ontoggle = () => {
            if (!list.childElementCount) fill();
          };
          fill();
          fields.append(details);
        }
        preview();
      }
      el('filter-close').onclick = () => dialog.close();
      el('filter-reset').onclick = () => {
        draft = blank();
        draw();
      };
      el('filter-apply').onclick = () => {
        applied = draft;
        updateTrigger();
        dialog.close();
        onApply();
      };
      draw();
      dialog.showModal();
    };
  }
  return { attach, matches, matchesRatingItem: (id) => !applied.forRating || matches(id) };
}
