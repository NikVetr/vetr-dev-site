// What a reader makes their own, and the two things it must never do: lose a
// sentence they wrote, or change what their printed card says.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  read, write, addPhrase, editPhrase, removePlacement, deletePhrase,
  placementsOf, movePlacement, placedOn, fromSheetExtra, screenContents, graftContents,
  showBuiltIn, setOrder, arranged,
} from '../ui/board-store.js';

/** A `localStorage` that behaves, and can be told to misbehave. */
function fakeStorage() {
  /** @type {Map<string,string>} */ const map = new Map();
  return {
    quota: false,
    getItem: (/** @type {string} */ k) => map.get(k) ?? null,
    setItem(/** @type {string} */ k, /** @type {string} */ v) {
      if (this.quota) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (/** @type {string} */ k) => { map.delete(k); },
    raw: map,
  };
}
const install = () => {
  const store = fakeStorage();
  /** @type {any} */ (globalThis).localStorage = store;
  return store;
};

const PAIR = 'zh-Hans__en';
const AT = 'spa/main';
const sample = { label: 'No peanuts', owner: 'I cannot eat peanuts', listener: '我不能吃花生', pair: PAIR };

test('a phrase round-trips through storage', async () => {
  install();
  const { data, id } = addPhrase(read().data, sample, AT);
  await write(data);
  const back = read();
  assert.equal(back.damaged, false);
  assert.equal(back.data.phrases[id].listener, '我不能吃花生');
  assert.deepEqual(back.data.placements[AT], [id]);
  assert.deepEqual(placedOn(back.data, AT, PAIR).map((p) => p.label), ['No peanuts']);
});

test('corrupt storage is reported, never silently presented as empty', () => {
  // **The failure that would cost a reader their own words.** Someone whose storage
  // is damaged has lost sentences they typed by hand, possibly about an allergy. An
  // editor that opens blank invites them to type over what is still there; one that
  // says so does not. Nothing here writes on a record it could not read.
  const store = install();
  store.raw.set('plg.boards', '{not json at all');
  const back = read();
  assert.equal(back.damaged, true);
  assert.deepEqual(back.data.phrases, {});
  // ...and the damaged text is still on disk, not overwritten by the read.
  assert.match(store.raw.get('plg.boards') ?? '', /not json/);
});

test('a version this build does not know is refused rather than guessed at', () => {
  const store = install();
  store.raw.set('plg.boards', JSON.stringify({ schemaVersion: 99, phrases: { x: {} } }));
  assert.equal(read().damaged, true);
});

test('a full disk is loud, and does not stop every later save', async () => {
  const store = install();
  store.quota = true;
  const { data } = addPhrase(read().data, sample, AT);
  await assert.rejects(() => write(data), /could not save/);
  // **And the queue recovers.** Chaining the next write off a rejected promise
  // would reject it too, so one full disk would stop the reader saving anything
  // again -- even after they freed space or shortened the sentence.
  store.quota = false;
  await write(data);
  assert.equal(read().damaged, false);
  assert.equal(Object.keys(read().data.phrases).length, 1);
});

test('writes cannot land out of order', async () => {
  // An editor with a live preview produces rapid saves, and the last one has to be
  // the one on disk.
  const store = install();
  let d = read().data;
  for (const n of ['one', 'two', 'three']) {
    d = addPhrase(d, { ...sample, label: n }, AT).data;
    write(d);
  }
  await write(d);
  assert.deepEqual(
    Object.values(read().data.phrases).map((p) => p.label).sort(),
    ['one', 'three', 'two'],
  );
});

test('removing a button is not deleting the sentence', () => {
  // The distinction the whole two-record shape exists for. A reader tidying a board
  // has not asked to destroy something they wrote, and may have it elsewhere.
  install();
  let d = read().data;
  const { data, id } = addPhrase(d, sample, AT);
  d = data;
  d = { ...d, placements: { ...d.placements, 'spa/comfort': [id] } };
  assert.deepEqual(placementsOf(d, id).sort(), ['spa/comfort', 'spa/main']);

  d = removePlacement(d, id, AT);
  assert.deepEqual(d.placements[AT], []);
  assert.ok(d.phrases[id], 'the phrase itself must survive losing a placement');
  assert.deepEqual(placementsOf(d, id), ['spa/comfort']);

  // Deleting is the other operation, and it takes every placement with it.
  d = deletePhrase(d, id);
  assert.equal(d.phrases[id], undefined);
  assert.deepEqual(placementsOf(d, id), []);
});

test('an edit reaches every board the phrase sits on', () => {
  install();
  const { data, id } = addPhrase(read().data, sample, AT);
  const d = editPhrase(data, id, { listener: '我对花生过敏' });
  assert.equal(d.phrases[id].listener, '我对花生过敏');
  // One record, so there is no second copy to go stale -- which also means any
  // audio keyed to the old wording is stale, and the caller has to drop it.
  assert.equal(Object.keys(d.phrases).length, 1);
});

test('order is the reader’s, and only an explicit move changes it', () => {
  install();
  let d = read().data;
  /** @type {string[]} */ const ids = [];
  for (const n of ['a', 'b', 'c']) {
    const added = addPhrase(d, { ...sample, label: n }, AT);
    d = added.data; ids.push(added.id);
  }
  assert.deepEqual(placedOn(d, AT, PAIR).map((p) => p.label), ['a', 'b', 'c']);
  d = movePlacement(d, AT, ids[2], -1);
  assert.deepEqual(placedOn(d, AT, PAIR).map((p) => p.label), ['a', 'c', 'b']);
  // Off either end is a no-op rather than an error: it is a button, pressed twice.
  const same = movePlacement(d, AT, ids[0], -1);
  assert.deepEqual(placedOn(same, AT, PAIR).map((p) => p.label), ['a', 'c', 'b']);
});

test('what the reader switched off and the order they dragged a screen into survive a reload', async () => {
  // The record was rebuilt from its phrases and placements alone, so a board's own
  // button switched off came back on every reload.
  install();
  const { data, id } = addPhrase(read().data, sample, AT);
  await write(setOrder(showBuiltIn(data, AT, 'stop', false), AT, [id, 'thanks', 'hurts']));
  const back = read().data;
  assert.deepEqual(back.hidden, { [AT]: ['stop'] });
  assert.deepEqual(back.order, { [AT]: [id, 'thanks', 'hurts'] });
});

test('a dragged order puts the board\'s buttons and the reader\'s together, and a move follows it', () => {
  install();
  let d = read().data;
  /** @type {string[]} */ const ids = [];
  for (const n of ['a', 'b']) {
    const added = addPhrase(d, { ...sample, label: n }, AT);
    d = added.data; ids.push(added.id);
  }
  const shown = [{ id: 'stop' }, { id: 'thanks' }, { id: ids[0] }, { id: ids[1] }];
  d = setOrder(d, AT, [ids[1], 'thanks', ids[0], 'stop']);
  assert.deepEqual(arranged(shown, d.order?.[AT]).map((b) => b.id), [ids[1], 'thanks', ids[0], 'stop']);
  // The reader's own follow it in their placements, so the editor lists them so.
  assert.deepEqual(placedOn(d, AT, PAIR).map((p) => p.label), ['b', 'a']);
  // A button added since comes after the ones the order names.
  assert.deepEqual(arranged([...shown, { id: 'new' }], d.order?.[AT]).at(-1), { id: 'new' });
  // The editor's move trades the two places in the dragged order too.
  d = movePlacement(d, AT, ids[0], -1);
  assert.deepEqual(arranged(shown, d.order?.[AT]).map((b) => b.id), [ids[0], 'thanks', ids[1], 'stop']);
});

test('a phrase written for another pair stays stored and stays off the board', () => {
  // The listener text is in a language nobody on this board reads, so showing it
  // would be showing a stranger a sentence in the wrong language.
  install();
  const { data } = addPhrase(read().data, { ...sample, pair: 'ja__en' }, AT);
  assert.deepEqual(placedOn(data, AT, PAIR), []);
  assert.equal(Object.keys(data.phrases).length, 1);
});

test('a board button never touches what a sheet prints', async () => {
  // **The semantic boundary in §5.2, asserted rather than described.** The studio
  // keeps `plg.edits.<pair>`, whose `include` flags decide what is printed. Making a
  // button to say "no peanuts" to a waiter must not add a row to every card the
  // reader prints for that pair.
  const store = install();
  store.raw.set('plg.edits.zh-Hans__en', JSON.stringify({
    overrides: { 'social-basics.thank-you': { gloss: 'Ta' } },
    extras: [{ concept_id: 'own-1', gloss: 'My own row', script: '我的' }],
  }));
  const before = store.raw.get('plg.edits.zh-Hans__en');

  let d = read().data;
  const { data, id } = addPhrase(d, sample, AT);
  await write(data);
  d = deletePhrase(data, id);
  await write(d);

  assert.equal(store.raw.get('plg.edits.zh-Hans__en'), before,
    'the sheet’s own edits must be byte-identical after a board round-trip');
  assert.ok(store.raw.has('plg.boards'), 'and the board store is a different key');
});

test('a sheet extra can be copied onto a board, and it is a copy', () => {
  // The one deliberate bridge. A reader who already typed a sentence in the studio
  // should not type it again -- but editing the board's copy must not rewrite what
  // their card prints, so it is copied rather than shared.
  install();
  const extra = { concept_id: 'own-1', gloss: 'I am vegetarian', script: '我吃素' };
  const phrase = fromSheetExtra(extra, PAIR);
  assert.equal(phrase.owner, 'I am vegetarian');
  assert.equal(phrase.listener, '我吃素');
  const { data, id } = addPhrase(read().data, phrase, AT);
  const edited = editPhrase(data, id, { owner: 'I eat no meat' });
  // The source object is untouched: nothing here holds a reference back to it.
  assert.equal(extra.gloss, 'I am vegetarian');
  assert.equal(edited.phrases[id].owner, 'I eat no meat');
});

/** A screen of the reader's own, placed at `at`. @param {any} data @param {string} label @param {string} at */
const screen = (data, label, at) => addPhrase(data, { label, owner: '', listener: '', pair: PAIR, screen: true }, at);
const blank = () => ({ schemaVersion: 1, phrases: {}, placements: {} });

test('a screen holds its own buttons, and deleting it takes them unless they are elsewhere', () => {
  const s = screen(blank(), 'Allergies', AT);
  const inside = `spa/${s.id}`;
  const a = addPhrase(s.data, sample, inside);
  const b = addPhrase(a.data, { ...sample, label: 'Also here' }, inside);
  // The second button is on the screen and on the board's own node too.
  const data = { ...b.data, placements: { ...b.data.placements, [AT]: [...b.data.placements[AT], b.id] } };
  const after = deletePhrase(data, s.id);
  assert.equal(after.phrases[s.id], undefined);
  assert.equal(after.phrases[a.id], undefined, 'a button only on the screen goes with it');
  assert.ok(after.phrases[b.id], 'a button also placed elsewhere stays there');
  assert.deepEqual(after.placements[AT], [b.id]);
  assert.equal(inside in after.placements, false);
});

test('a screen\'s buttons travel under fresh ids, keyed relative to where they were', () => {
  // AT: phrase A and screen S; on S: phrase C and screen T; on T: phrase D -- and one
  // phrase written for another pair, which does not travel with this one.
  let d = addPhrase(blank(), { ...sample, label: 'A' }, AT);
  const A = d.id;
  const S = screen(d.data, 'S', AT);
  d = addPhrase(S.data, { ...sample, label: 'C' }, `spa/${S.id}`);
  const T = screen(d.data, 'T', `spa/${S.id}`);
  d = addPhrase(T.data, { ...sample, label: 'D' }, `spa/${T.id}`);
  d = addPhrase(d.data, { ...sample, label: 'other pair', pair: 'ja__en' }, AT);
  const contents = screenContents(d.data, AT, PAIR);
  assert.deepEqual(contents.placements['.'], [A, S.id]);
  assert.equal(Object.keys(contents.phrases).length, 5);
  assert.equal(contents.placements[T.id].length, 1);
  // Two screens inside each other -- which a file written by hand can say -- are
  // walked once each rather than for ever.
  const looped = { ...d.data, placements: { ...d.data.placements, [`spa/${T.id}`]: [...d.data.placements[`spa/${T.id}`], S.id] } };
  assert.equal(Object.keys(screenContents(looped, AT, PAIR).phrases).length, 5);

  const landed = graftContents(blank(), contents, 'food/main');
  const top = landed.placements['food/main'];
  assert.equal(top.length, 2);
  assert.ok(top.every((id) => !(id in contents.phrases)), 'every phrase under a new id');
  const newS = top[1];
  assert.equal(landed.phrases[newS].label, 'S');
  assert.equal(landed.phrases[newS].screen, true);
  const onS = landed.placements[`food/${newS}`];
  assert.deepEqual(onS.map((id) => landed.phrases[id].label), ['C', 'T']);
  assert.deepEqual(landed.placements[`food/${onS[1]}`].map((id) => landed.phrases[id].label), ['D']);
  // Loaded twice, it adds rather than collides.
  const twice = graftContents(landed, contents, 'food/main');
  assert.equal(twice.placements['food/main'].length, 4);
  assert.equal(Object.keys(twice.phrases).length, 10);
});
