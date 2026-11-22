import test from 'node:test';
import assert from 'node:assert/strict';
import { submit } from '../core/prompt.mjs';

test('separate and shared dishes preserve requirements for each traveler', () => {
  const request = {
    party: 'group',
    people: [
      {
        name: 'Lee',
        diet: 'Vegan',
        venue: 'prefer',
        substitutions: 'fine',
        preferences: { spice: -2 }
      },
      { name: 'Sam', allergies: 'Sesame' }
    ]
  };
  const p = submit(request).prompt;
  assert.match(p, /ordering separately/);
  assert.match(p, /Lee: Dietary requirements: Vegan/);
  assert.match(p, /Prefer a venue dedicated/);
  assert.match(p, /Routine substitutions/);
  assert.match(p, /Strongly avoid: spicy food/);
  assert.match(p, /Sam: Allergies/);
  assert.match(
    submit({ ...request, ordering: 'shared' }).prompt,
    /Each shared dish must meet every diner/
  );
});
test('separates lodging from food preferences and preserves verified-price context', () => {
  const p = submit({
    mode: 'lodging',
    place: 'Kyoto',
    budget: 'JPY 20000',
    people: [{ diet: 'vegetarian', stayNeeds: 'fridge', preferences: { quiet: 2, bitter: -1 } }]
  }).prompt;
  assert.match(p, /Budget per night: JPY 20000/);
  assert.match(p, /fridge/);
  assert.match(p, /Strongly prefer: quiet at night/);
  assert.match(p, /whole-stay price/);
  assert.doesNotMatch(p, /vegetarian|bitter/);
});
test('menu handles absent pages, supplied text or pages in order; missing location triggers a question', () => {
  assert.match(submit({ mode: 'menu' }).prompt, /Ask me to attach/);
  const p = submit({
    mode: 'menu',
    photoCount: 3,
    focus: 'Drinks',
    menuText: 'Cider 6',
    results: 1
  }).prompt;
  assert.match(p, /1 order from this menu. Focus on drinks/);
  assert.match(p, /3 menu photos in the supplied order/);
  assert.match(p, /Cider 6/);
  assert.doesNotMatch(p, /Ask me to attach|where to search/);
  assert.match(submit({}).prompt, /Ask me where to search/);
  assert.match(
    submit({ place: 'fountain', coordinates: { latitude: 0, longitude: 0 } }).prompt,
    /fountain\nLocation supplied by me: 0.00000, 0.00000/
  );
});
test('lodging compares occupancy and budget across dates independently of named profiles', () => {
  const booking = {
    mode: 'lodging', checkIn: '2028-02-28', checkOut: '2028-03-02',
    roomCount: 2, adults: 2, children: 2, childAges: [0], budgetBasis: 'stay', budget: 'CAD 900',
    party: 'group', people: [{ name: 'Jo' }, { name: 'Ari' }], room: 'Connecting rooms'
  };
  const brief = submit(booking).prompt;
  for (const phrase of [
    '2028-02-28 to 2028-03-02 (3 nights)', 'Booking: 2 rooms, 2 adults, 2 children',
    'Child ages supplied (years at check-in): 0', 'Rooms and beds: Connecting rooms',
    'Budget for the whole stay: CAD 900', 'Preferences from 2 travelers', 'taxes and mandatory fees'
  ]) assert.ok(brief.includes(phrase), phrase);
  assert.doesNotMatch(submit({ ...booking, mode: 'outing' }).prompt, /Booking:|Child ages|Connecting rooms|whole stay|2028-03-02/);
  const partial = submit({ mode: 'lodging', children: 0, checkIn: '2028-02-28', budget: 'CAD 90' }).prompt;
  assert.match(partial, /Booking: 0 children/);
  assert.match(partial, /Budget per night: CAD 90/);
  assert.doesNotMatch(partial, /0 adults|Child ages supplied|NaN/);
  assert.doesNotMatch(submit({ mode: 'lodging' }).prompt, /Booking:|Child ages supplied/);
});
test('rejects errors in nested inputs and ambiguous party state', () => {
  for (const [input, path] of [
    [{ foo: true }, 'foo'],
    [{ people: [{ allergy: 'unexpected' }] }, 'people[0].allergy'],
    [{ people: [{ preferences: { spice: 3 } }] }, 'people[0].preferences.spice'],
    [{ people: [{ preferences: { access: 1 } }] }, 'people[0].preferences.access'],
    [{ party: 'group', people: [{}] }, 'people'],
    [{ party: 'solo', people: [{}, {}] }, 'people'],
    [{ mode: 'lodging', checkIn: '2027-02-31' }, 'checkIn'],
    [{ mode: 'outing', visitDate: '2027-02-29' }, 'visitDate'],
    [{ mode: 'lodging', checkIn: '2027-02-01', checkOut: '2027-02-01' }, 'checkOut'],
    [{ mode: 'lodging', budgetBasis: 'per person' }, 'budgetBasis'],
    [{ mode: 'lodging', roomCount: 0 }, 'roomCount'],
    [{ mode: 'lodging', adults: 1.5 }, 'adults'],
    [{ mode: 'lodging', adults: 0, children: 0 }, 'children'],
    [{ mode: 'lodging', childAges: '5, 8' }, 'childAges'],
    [{ mode: 'lodging', childAges: [2, 18] }, 'childAges[1]'],
    [{ mode: 'lodging', children: 1, childAges: [3, 5] }, 'childAges'],
    [{ coordinates: { latitude: 91, longitude: 1 } }, 'coordinates.latitude'],
    [{ photoCount: -1 }, 'photoCount'],
    [{ results: '3' }, 'results']
  ])
    assert.throws(
      () => submit(input),
      (e) => e instanceof Error && 'code' in e && e.code === 'invalid_request' &&
      'issues' in e && Array.isArray(e.issues) && e.issues[0]?.path === path
    );
});

test('a supplied place shortlist bounds research, even without a location', () => {
  const p = submit({ mode: 'lodging', shortlist: 'Kyoto Station Hotel\nHanamachi Inn' }).prompt;
  assert.match(p, /Compare only the places on my shortlist/);
  assert.match(p, /Kyoto Station Hotel\nHanamachi Inn/);
  assert.doesNotMatch(p, /Ask me where to search/);
});

test('outings combine the time window and individual interests with hard access requirements', () => {
  const request = {
    mode: 'outing', party: 'group', results: 1, ordering: 'shared',
    place: 'Toronto Union Station', visitDate: '2027-04-03', timing: 'before the 5 pm train',
    travel: ['Public transit'], visitLength: '2 hours', budget: 'CAD 40', flexibility: 'Firm limit',
    hunger: 'Light lunch', room: 'Two beds', menuText: 'Coffee', photoCount: 1,
    people: [
      { name: 'Pat', access: 'Step-free paths', preferences: { museums: 2, quiet: 1 } },
      { name: 'Ari', outingNotes: 'Architectural drawing', diet: 'Vegan', preferences: { outdoors: 1, tours: -1 } }
    ]
  };
  const prompt = submit(request).prompt;
  for (const expected of [
    'Research 1 outing ', 'Toronto Union Station', 'Public transit', '2027-04-03',
    '2 hours', 'before the 5 pm train', 'CAD 40 (Firm limit)', 'Group of 2',
    'Pat: Accessibility requirements: Step-free paths', 'Strongly prefer: museums and galleries',
    'Ari: Outing interests and preferences: Architectural drawing', 'Prefer less: guided tours',
    'Prefer: parks and nature', 'last entry', 'timed tickets', 'return trip'
  ]) assert.ok(prompt.includes(expected), expected);
  assert.doesNotMatch(prompt, /Light lunch|Two beds|menu|coffee|vegan|dishes|quiet at night/i);
  for (const mode of ['lodging', 'restaurant', 'menu']) {
    const other = submit({ ...request, mode }).prompt;
    assert.match(other, /Step-free paths/);
    assert.doesNotMatch(other, /Architectural drawing|guided tours|museums|2027-04-03|2 hours/);
  }
});
