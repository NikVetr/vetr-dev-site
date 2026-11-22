import {
  modes,
  tastes,
  preferenceLevels,
  venueOptions,
  substitutionOptions,
  traveler
} from './core/catalog.mjs';
import { readTraveler } from './core/prompt.mjs';

const storeKey = 'vetr:travel-prompt:profiles:1';
const personalFields = {
  food: {
    preferences: 'Food and drink preferences', key: 'foodNotes',
    label: 'Usual likes, dislikes or favorite examples', example: 'e.g. Citrus beers, little bitterness'
  },
  lodging: {
    preferences: 'Lodging preferences', key: 'stayNeeds',
    label: 'Required for the stay', example: 'e.g. In-room refrigerator, ground-floor room'
  },
  outing: {
    preferences: 'Outing interests', key: 'outingNotes',
    label: 'Other outing interests', example: 'e.g. Architecture, small groups'
  }
};
function defaultProfile() {
  return { party: 'solo', ordering: 'separate', people: [traveler('Me')] };
}
function readProfile(raw) {
  if (
    !raw ||
    !['solo', 'group'].includes(raw.party) ||
    !['separate', 'shared'].includes(raw.ordering) ||
    !Array.isArray(raw.people) ||
    !raw.people.length ||
    (raw.party === 'group' && raw.people.length < 2)
  )
    throw new Error('Invalid traveler profile.');
  return { party: raw.party, ordering: raw.ordering, people: raw.people.map(readTraveler) };
}
function btn(text, action, label = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', action);
  return b;
}
function textField(label, person, key, placeholder, update) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.value = person[key];
  input.placeholder = placeholder;
  input.addEventListener('input', () => {
    person[key] = input.value;
    update();
  });
  wrap.append(input);
  return wrap;
}
function selectField(label, person, key, options, update) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const select = document.createElement('select');
  for (const [value, name] of Object.entries(options)) select.add(new Option(String(name), value));
  select.value = person[key];
  select.addEventListener('change', () => {
    person[key] = select.value;
    update();
  });
  wrap.append(select);
  return wrap;
}
function details(title) {
  const section = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = title;
  const content = document.createElement('div');
  content.className = 'extra';
  section.append(summary, content);
  return { section, content };
}
function preferences(person, domain, update) {
  const { section, content } = details(personalFields[domain].preferences);
  const help = document.createElement('p');
  help.className = 'micro';
  help.textContent =
    '−− Strongly avoid · − Prefer less · ○ Neutral · + Prefer · ++ Strongly prefer';
  const grid = document.createElement('div');
  for (const [key, taste] of Object.entries(tastes)) {
    if (taste.group !== domain) continue;
    const row = document.createElement('div');
    row.className = 'preference-row';
    const title = document.createElement('span');
    title.textContent = taste.label;
    title.className = 'taste-name';
    const levels = document.createElement('div');
    levels.className = 'levels';
    levels.setAttribute('role', 'group');
    levels.setAttribute('aria-label', taste.label);
    for (let level = -2; level <= 2; level++) {
      const desc = preferenceLevels[level + 2] + ' · ' + taste.label;
      const b = btn(
        ['−−', '−', '○', '+', '++'][level + 2],
        () => {
          if (level) person.preferences[key] = level;
          else delete person.preferences[key];
          for (const x of levels.querySelectorAll('button'))
            x.setAttribute('aria-pressed', String(x === b));
          update();
        },
        desc
      );
      b.title = desc;
      b.dataset.value = String(level);
      b.setAttribute('aria-pressed', String((person.preferences[key] || 0) === level));
      levels.append(b);
    }
    row.append(title, levels);
    grid.append(row);
  }
  content.append(help, grid);
  return section;
}

export function setupPeople(update) {
  const byId = (id) => document.getElementById(id);
  const list = byId('travelers'),
    saved = byId('saved-list'),
    profileDialog = /** @type {HTMLDialogElement} */ (byId('profiles'));
  const nameInput = /** @type {HTMLInputElement} */ (byId('profile-name')),
    status = byId('profile-status');
  let storage = { active: '', entries: [] };
  let storageIssue = '';
  try {
    const encoded = localStorage.getItem(storeKey);
    if (encoded) {
      const raw = JSON.parse(encoded);
      if (!raw || !Array.isArray(raw.entries) || typeof raw.active !== 'string') throw new Error();
      storage = {
        active: raw.active,
        entries: raw.entries.map((entry) => {
          if (typeof entry?.name !== 'string' || !entry.name) throw new Error();
          return { name: entry.name, profile: readProfile(entry.profile) };
        })
      };
    }
  } catch {
    storageIssue = 'Saved profiles could not be loaded on this device.';
  }
  let current = readProfile(
    structuredClone(
      storage.entries.find((x) => x.name === storage.active)?.profile || defaultProfile()
    )
  );
  let mode = 'restaurant';
  const setStorage = (next) => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
      storage = next;
      storageIssue = '';
      return true;
    } catch {
      status.textContent =
        'Could not save on this device. Your current request is still available.';
      return false;
    }
  };
  function render() {
    const group = current.party === 'group',
      domain = modes[mode].group;
    document
      .querySelectorAll('[data-party]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.getAttribute('data-party') === current.party))
      );
    document
      .querySelectorAll('[data-order]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.getAttribute('data-order') === current.ordering))
      );
    byId('ordering-field').hidden = !group || domain !== 'food';
    byId('add-person').hidden = !group;
    list.replaceChildren();
    current.people.slice(0, group ? current.people.length : 1).forEach((p, index) => {
      const section = document.createElement('div');
      section.className = 'travel-person';
      if (group) {
        const head = document.createElement('div');
        head.className = 'person-top';
        head.append(textField('Traveler ' + (index + 1), p, 'name', 'Name or nickname', update));
        if (current.people.length > 2)
          head.append(
            btn(
              'Remove',
              () => {
                current.people.splice(index, 1);
                render();
                update();
              },
              'Remove traveler ' + (index + 1)
            )
          );
        section.append(head);
      }
      const fields = document.createElement('div');
      fields.className = 'person-fields';
      if (domain === 'food') {
        const pair = document.createElement('div');
        pair.className = 'pair';
        const diet = textField(
          'Dietary requirements',
          p,
          'diet',
          'e.g. Vegan, halal, kosher',
          update
        );
        pair.append(
          diet,
          textField(
            'Allergies & cross-contact',
            p,
            'allergies',
            'e.g. Peanuts, including shared fryers',
            update
          )
        );
        fields.append(pair);
        const venue = document.createElement('div');
        venue.className = 'pair';
        venue.append(
          selectField('Venue preference', p, 'venue', venueOptions, update),
          selectField('Dish modifications', p, 'substitutions', substitutionOptions, update)
        );
        const syncVenue = () => {
          venue.hidden = !p.diet.trim();
        };
        diet.querySelector('input').setAttribute('list', 'diets');
        diet.querySelector('input').addEventListener('input', syncVenue);
        syncVenue();
        fields.append(venue);
      }
      const access = details(
        domain === 'lodging' ? 'Access and required amenities' : 'Access and personal notes'
      );
      const note = personalFields[domain];
      access.content.append(
        textField('Accessibility requirements', p, 'access', 'e.g. Step-free access', update),
        textField(note.label, p, note.key, note.example, update)
      );
      fields.append(access.section, preferences(p, domain, update));
      section.append(fields);
      list.append(section);
    });
  }
  function snapshot() {
    const people = current.party === 'solo' ? current.people.slice(0, 1) : current.people;
    return structuredClone({ ...current, people });
  }
  function showSaved() {
    saved.replaceChildren();
    for (const entry of storage.entries) {
      const row = document.createElement('div');
      row.className = 'profile-row';
      const title = document.createElement('span');
      title.textContent = entry.name;
      if (entry.name === storage.active) {
        title.className = 'profile-active';
        title.title = 'Loaded by default on this device';
      }
      row.append(
        title,
        btn(
          'Use',
          () => {
            current = readProfile(structuredClone(entry.profile));
            render();
            update();
            if (setStorage({ ...storage, active: entry.name })) profileDialog.close();
          },
          'Use profile ' + entry.name
        ),
        btn(
          'Update',
          () => {
            const entries = storage.entries.map((e) =>
              e.name === entry.name ? { name: entry.name, profile: snapshot() } : e
            );
            if (setStorage({ entries, active: entry.name })) {
              showSaved();
              status.textContent = 'Updated ' + entry.name + ' from the current travelers.';
            }
          },
          'Update profile ' + entry.name
        ),
        btn(
          'Delete',
          () => {
            const entries = storage.entries.filter((i) => i.name !== entry.name);
            if (
              setStorage({ entries, active: storage.active === entry.name ? '' : storage.active })
            ) {
              showSaved();
              status.textContent = 'Deleted ' + entry.name + '.';
            }
          },
          'Delete profile ' + entry.name
        )
      );
      saved.append(row);
    }
  }
  byId('open-profiles').addEventListener('click', () => {
    showSaved();
    status.textContent = storageIssue;
    nameInput.value = '';
    profileDialog.showModal();
  });
  byId('save-profile').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      status.textContent = 'Give this profile a name.';
      nameInput.focus();
      return;
    }
    if (storage.entries.some((e) => e.name === name)) {
      status.textContent =
        'That name is in use. Choose another name or use Update beside the existing profile.';
      return;
    }
    const entries = [...storage.entries, { name, profile: snapshot() }];
    if (setStorage({ active: name, entries })) {
      showSaved();
      status.textContent = 'Saved ' + name + '. It will load on your next visit.';
    }
  });
  document.querySelectorAll('[data-party]').forEach((b) =>
    b.addEventListener('click', () => {
      current.party = b.getAttribute('data-party');
      if (current.party === 'group' && current.people.length === 1)
        current.people.push(traveler('Guest 2'));
      render();
      update();
    })
  );
  document.querySelectorAll('[data-order]').forEach((b) =>
    b.addEventListener('click', () => {
      current.ordering = b.getAttribute('data-order');
      render();
      update();
    })
  );
  byId('add-person').addEventListener('click', () => {
    current.people.push(traveler('Guest ' + (current.people.length + 1)));
    render();
    update();
    list.lastElementChild.querySelector('input').focus();
  });
  return {
    setMode(next) {
      mode = next;
      render();
    },
    get() {
      return {
        party: current.party,
        ordering: current.ordering,
        people: current.party === 'group' ? current.people : current.people.slice(0, 1)
      };
    }
  };
}
