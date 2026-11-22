// Ordering is shared by the preference controls and the assistant brief.
export const modes = {
  restaurant: { label: 'Find a table', heading: 'Find a restaurant', result: 'restaurant', group: 'food', icon: 'pin' },
  menu: { label: 'Read a menu', heading: 'Choose from a menu', result: 'order', group: 'food', icon: 'menu' },
  lodging: { label: 'Find lodging', heading: 'Find somewhere to stay', result: 'lodging option', group: 'lodging', icon: 'bed' },
  outing: { label: 'Plan an outing', heading: 'Plan an outing', result: 'outing', group: 'outing', icon: 'sights' }
};

export const tastes = {
  regional: { label: 'Regional specialties', group: 'food' },
  adventurous: { label: 'Unfamiliar dishes', group: 'food' },
  spice: { label: 'Spicy food', group: 'food' },
  bitter: { label: 'Bitter flavors', group: 'food' },
  sweet: { label: 'Sweet flavors', group: 'food' },
  hoppy: { label: 'Hoppy beers', group: 'food' },
  alcohol: { label: 'Alcoholic drinks', group: 'food' },
  quiet: { label: 'Quiet at night', group: 'lodging' },
  transit: { label: 'Near public transit', group: 'lodging' },
  kitchen: { label: 'Kitchen access', group: 'lodging' },
  aircon: { label: 'Air conditioning', group: 'lodging' },
  walkability: { label: 'Walkable neighborhood', group: 'lodging' },
  breakfast: { label: 'Breakfast included', group: 'lodging' },
  character: { label: 'Locally run properties', group: 'lodging' },
  museums: { label: 'Museums and galleries', group: 'outing' },
  heritage: { label: 'Historic sites', group: 'outing' },
  outdoors: { label: 'Parks and nature', group: 'outing' },
  markets: { label: 'Local markets', group: 'outing' },
  shows: { label: 'Live performances', group: 'outing' },
  tours: { label: 'Guided tours', group: 'outing' },
  handsOn: { label: 'Hands-on activities', group: 'outing' }
};
export const preferenceLevels = [
  'Strongly avoid',
  'Prefer less',
  'Neutral',
  'Prefer',
  'Strongly prefer'
];
export const venueOptions = {
  any: 'Any venue that can accommodate my diet',
  prefer: 'Prefer a venue dedicated to my diet',
  required: 'Require a venue dedicated to my diet'
};
export const substitutionOptions = {
  ask: 'Confirm possible changes with staff',
  fine: 'Routine substitutions are fine',
  listed: 'Only dishes listed as suitable'
};
export const waysToTravel = ['Walk', 'Public transit', 'Bicycle', 'Car or rideshare'];
export const orderingOptions = { separate: 'Order separately', shared: 'Share dishes' };
export const menuFocus = ['Food and drinks', 'Food', 'Drinks'];
export const personKeys = [
  'name',
  'diet',
  'allergies',
  'venue',
  'substitutions',
  'access',
  'foodNotes',
  'stayNeeds',
  'outingNotes',
  'preferences'
];

export function traveler(name) {
  return {
    name,
    diet: '',
    allergies: '',
    venue: 'any',
    substitutions: 'ask',
    access: '',
    foodNotes: '',
    stayNeeds: '',
    outingNotes: '',
    preferences: {}
  };
}

export function newRequest() {
  return {
    mode: 'restaurant',
    party: 'solo',
    ordering: 'separate',
    people: [traveler('Me')],
    place: '',
    shortlist: '',
    coordinates: null,
    travel: [],
    travelTime: '',
    budget: '',
    flexibility: '',
    timing: '',
    needs: '',
    notes: '',
    results: 3,
    focus: 'Food and drinks',
    hunger: '',
    photoCount: 0,
    menuText: '',
    checkIn: '',
    checkOut: '',
    roomCount: null,
    adults: null,
    children: null,
    childAges: [],
    budgetBasis: 'night',
    room: '',
    property: '',
    visitDate: '',
    visitLength: ''
  };
}
