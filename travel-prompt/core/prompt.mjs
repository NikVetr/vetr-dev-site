import { checkRequestKeys, invalidRequest } from '../../shared/request.js';
import {
  modes,
  tastes,
  preferenceLevels,
  venueOptions,
  substitutionOptions,
  waysToTravel,
  orderingOptions,
  menuFocus,
  personKeys,
  newRequest,
  traveler
} from './catalog.mjs';

function record(input, keys, path) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw invalidRequest(path, 'Expected an object.');
  for (const key of Object.keys(input))
    if (!keys.includes(key)) throw invalidRequest(path + '.' + key, 'Unknown field.');
}
function choice(value, allowed, path) {
  if (!allowed.includes(value))
    throw invalidRequest(path, 'Expected one of ' + allowed.join(', ') + '.');
  return value;
}
function string(value, path) {
  if (typeof value !== 'string') throw invalidRequest(path, 'Expected text.');
  return value.trim();
}
function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw invalidRequest(path, 'Expected an integer from ' + min + ' to ' + max + '.');
  return value;
}
function date(value, path) {
  if (!value) return '';
  const parsed = new Date(value + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw invalidRequest(path, 'Use a valid date in YYYY-MM-DD format.');
  return value;
}

export function readTraveler(raw, index) {
  const path = 'people[' + index + ']';
  record(raw, personKeys, path);
  const p = { ...traveler(index === 0 ? 'Me' : 'Guest ' + (index + 1)), ...raw };
  for (const key of ['name', 'diet', 'allergies', 'access', 'foodNotes', 'stayNeeds', 'outingNotes'])
    p[key] = string(p[key], path + '.' + key);
  choice(p.venue, Object.keys(venueOptions), path + '.venue');
  choice(p.substitutions, Object.keys(substitutionOptions), path + '.substitutions');
  record(p.preferences, Object.keys(tastes), path + '.preferences');
  for (const [k, v] of Object.entries(p.preferences)) integer(v, -2, 2, path + '.preferences.' + k);
  return p;
}

function readRequest(input) {
  const defaults = newRequest();
  checkRequestKeys(input, Object.keys(defaults));
  const r = { ...defaults, ...input };
  choice(r.mode, Object.keys(modes), 'mode');
  choice(r.party, ['solo', 'group'], 'party');
  choice(r.ordering, Object.keys(orderingOptions), 'ordering');
  choice(r.focus, menuFocus, 'focus');
  choice(r.budgetBasis, ['night', 'stay'], 'budgetBasis');
  if (
    !Array.isArray(r.people) ||
    (r.party === 'solo' ? r.people.length !== 1 : r.people.length < 2)
  )
    throw invalidRequest(
      'people',
      r.party === 'solo'
        ? 'A solo request needs one traveler.'
        : 'Add at least two travelers for a group.'
    );
  r.people = r.people.map(readTraveler);
  for (const key of [
    'place',
    'shortlist',
    'travelTime',
    'budget',
    'flexibility',
    'timing',
    'needs',
    'notes',
    'hunger',
    'menuText',
    'checkIn',
    'checkOut',
    'room',
    'property',
    'visitDate',
    'visitLength'
  ])
    r[key] = string(r[key], key);
  date(r.checkIn, 'checkIn');
  date(r.checkOut, 'checkOut');
  date(r.visitDate, 'visitDate');
  if (r.checkIn && r.checkOut && r.checkOut <= r.checkIn)
    throw invalidRequest('checkOut', 'Check-out must be after check-in.');
  for (const [key, label] of Object.entries({ roomCount: 'Rooms', adults: 'Adults', children: 'Children' })) {
    if (r[key] === null) continue;
    const min = key === 'roomCount' ? 1 : 0;
    if (!Number.isSafeInteger(r[key]) || r[key] < min)
      throw invalidRequest(key, label + ' must be a whole number of ' + min + ' or more.');
  }
  if (r.adults === 0 && r.children === 0)
    throw invalidRequest('children', 'Include at least one guest or leave the guest counts blank.');
  if (!Array.isArray(r.childAges))
    throw invalidRequest('childAges', 'Supply ages as an array of whole years.');
  r.childAges.forEach((age, i) => {
    if (!Number.isInteger(age) || age < 0 || age > 17)
      throw invalidRequest('childAges[' + i + ']', 'Use whole ages from 0 to 17, separated by commas.');
  });
  if (r.children !== null && r.childAges.length > r.children)
    throw invalidRequest('childAges', 'There are more ages than children in the booking.');
  integer(r.results, 1, 10, 'results');
  integer(r.photoCount, 0, Number.MAX_SAFE_INTEGER, 'photoCount');
  if (!Array.isArray(r.travel)) throw invalidRequest('travel', 'Expected a list of travel modes.');
  r.travel.forEach((t) => choice(t, waysToTravel, 'travel'));
  if (r.coordinates !== null) {
    record(r.coordinates, ['latitude', 'longitude'], 'coordinates');
    for (const [key, max] of [
      ['latitude', 90],
      ['longitude', 180]
    ]) {
      const v = r.coordinates[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > Number(max))
        throw invalidRequest('coordinates.' + key, 'Coordinate outside geographic bounds.');
    }
  }
  return r;
}

function travelerLines(p, index, group) {
  const lines = [];
  if (p.access) lines.push('Accessibility requirements: ' + p.access);
  if (group === 'lodging') {
    if (p.stayNeeds) lines.push('Required amenities or arrangements: ' + p.stayNeeds);
  } else if (group === 'outing') {
    if (p.outingNotes) lines.push('Outing interests and preferences: ' + p.outingNotes);
  } else {
    if (p.diet) {
      lines.push('Dietary requirements: ' + p.diet);
      lines.push(venueOptions[p.venue] + '. ' + substitutionOptions[p.substitutions] + '.');
    }
    if (p.allergies)
      lines.push(
        'Allergies / cross-contact requirements: ' +
          p.allergies +
          '. Flag anything that needs confirmation with staff.'
      );
    if (p.foodNotes) lines.push('Food and drink preferences: ' + p.foodNotes);
  }
  for (const value of [-2, -1, 1, 2]) {
    const terms = Object.entries(tastes)
      .filter(([key, t]) => t.group === group && p.preferences[key] === value)
      .map(([, t]) => t.label.toLowerCase());
    if (terms.length) lines.push(preferenceLevels[value + 2] + ': ' + terms.join(', ') + '.');
  }
  return { name: p.name || 'Traveler ' + (index + 1), lines };
}

export function submit(input) {
  const r = readRequest(input);
  const stay = r.mode === 'lodging',
    outing = r.mode === 'outing',
    menu = r.mode === 'menu';
  const n = r.results;
  const { result: task, group: domain } = modes[r.mode];
  const quantity = n + ' ' + task + (n === 1 ? '' : 's');
  let goal = 'Research ' + quantity + ' that fit this request.';
  if (menu)
    goal = 'Recommend ' + quantity + ' from this menu. Focus on ' + r.focus.toLowerCase() + '.';
  else if (r.shortlist)
    goal =
      'Compare only the places on my shortlist and return up to ' +
      quantity +
      ' that fit this request.';
  const sections = [goal];
  const context = [];
  if (!menu) {
    if (r.shortlist) context.push('My shortlist:\n' + r.shortlist);
    if (r.place) context.push('Search area or landmark: ' + r.place);
    if (r.coordinates)
      context.push(
        'Location supplied by me: ' +
          r.coordinates.latitude.toFixed(5) +
          ', ' +
          r.coordinates.longitude.toFixed(5)
      );
    if (!r.place && !r.coordinates && !r.shortlist)
      context.push('Ask me where to search before looking up options.');
    if (r.travel.length || r.travelTime)
      context.push(
        'Getting around: ' + [r.travel.join(' or '), r.travelTime].filter(Boolean).join(', ')
      );
  }
  if (stay) {
    if (r.checkIn || r.checkOut) {
      const nights = (Date.parse(r.checkOut) - Date.parse(r.checkIn)) / 86400000;
      const length = Number.isFinite(nights) ? ' (' + nights + (nights === 1 ? ' night)' : ' nights)') : '';
      context.push('Stay dates: ' + (r.checkIn || 'arrival to confirm') +
        ' to ' + (r.checkOut || 'departure to confirm') + length);
    }
    const occupancy = [];
    if (r.roomCount !== null) occupancy.push(r.roomCount + (r.roomCount === 1 ? ' room' : ' rooms'));
    if (r.adults !== null) occupancy.push(r.adults + (r.adults === 1 ? ' adult' : ' adults'));
    if (r.children !== null) occupancy.push(r.children + (r.children === 1 ? ' child' : ' children'));
    if (occupancy.length) context.push('Booking: ' + occupancy.join(', '));
    if (r.childAges.length) context.push('Child ages supplied (years at check-in): ' + r.childAges.join(', '));
    if (r.property) context.push('Property type: ' + r.property);
    if (r.room) context.push('Rooms and beds: ' + r.room);
  } else if (outing) {
    if (r.visitDate) context.push('Visit date: ' + r.visitDate);
    if (r.visitLength) context.push('Total time available, including travel: ' + r.visitLength);
  } else if (r.hunger) context.push('Appetite / occasion: ' + r.hunger);
  if (r.budget)
    context.push(
      (stay ? (r.budgetBasis === 'stay' ? 'Budget for the whole stay: ' : 'Budget per night: ') : 'Budget per person: ') +
        r.budget +
        (r.flexibility ? ' (' + r.flexibility + ')' : '')
    );
  else if (r.flexibility) context.push('Price preference: ' + r.flexibility);
  if (r.timing) context.push('Timing: ' + r.timing);
  if (r.needs) context.push('Requirements for this request: ' + r.needs);
  if (r.notes) context.push('Other preferences today: ' + r.notes);
  if (context.length) sections.push(context.join('\n'));

  const who = [];
  if (r.party === 'group') {
    const sharedPlan = {
      outing: 'Find outings everyone can access. Explain whose interests each option fits and where preferences differ.',
      lodging: 'Find places that can accommodate the whole group.',
      food: r.ordering === 'shared'
        ? 'We are sharing dishes. Each shared dish must meet every diner’s requirements.'
        : 'We are ordering separately. Identify a suitable order for each diner at the same venue.'
    };
    const group = stay && (r.adults !== null || r.children !== null || r.childAges.length)
      ? 'Preferences from ' + r.people.length + ' travelers'
      : 'Group of ' + r.people.length;
    who.push(group + '. ' + sharedPlan[domain]);
  }
  r.people.forEach((p, index) => {
    const { name, lines } = travelerLines(p, index, domain);
    if (lines.length || r.party === 'group')
      who.push(name + ': ' + (lines.length ? lines.join(' ') : 'No preferences specified.'));
  });
  if (who.length) sections.push(who.join('\n'));
  if (menu) {
    if (r.photoCount)
      sections.push(
        'Use the ' +
          r.photoCount +
          ' menu ' +
          (r.photoCount === 1 ? 'photo' : 'photos') +
          ' in the supplied order. Ask for any missing or illegible page.'
      );
    if (r.menuText) sections.push('Menu text supplied by me:\n' + r.menuText);
    if (!r.photoCount && !r.menuText)
      sections.push('Ask me to attach menu photos or paste the text before making a suggestion.');
    sections.push(
      'For each order, quote the menu wording and listed price, explain the fit, and give me a short line to order it in the menu language. Flag unclear ingredients, substitutions, or prices for confirmation.'
    );
  } else {
    const comparisons = {
      outing: 'Give travel and visit times including the return trip, admission per person with currency and fees, and access along the route and on site. Check official opening hours, last entry, timed tickets and booking requirements. Flag any scheduling or availability details to confirm.',
      lodging: 'Include location and transit, nightly and whole-stay price for all rooms and guests with currency, taxes and mandatory fees, relevant accessibility and amenities, and cancellation terms. Verify dates, room capacity and any child pricing before quoting availability or a total. Flag any missing detail that affects the price.',
      food: 'Give a dish to order, expected price and currency per person, travel time by the indicated mode, opening hours at arrival, and any reservation or access issue.'
    };
    sections.push('Compare the options in a concise table. ' + comparisons[domain]);
    sections.push(
      'For each option explain the fit and one trade-off. Link the official site' +
        (r.mode === 'restaurant' ? ' or current menu' : '') +
        ' and map. Cite recent reviews relevant to my priorities, including the source, score and review count when available. Mark anything you could not verify.'
    );
  }
  return { mode: r.mode, prompt: sections.join('\n\n') };
}
