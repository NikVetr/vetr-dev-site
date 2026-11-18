import assert from 'node:assert/strict';
import test from 'node:test';
import '../../b64/decoder.js';
import { submit as schedule } from '../../agendamatic/js/api.js';
import { submit as figure } from '../../layout-gui/api.js';

test('the b64 request adapter includes encoding and scanning and rejects malformed layers', () => {
  const text = 'aHR0cHM6Ly9leGFtcGxlLm9yZw==';
  assert.deepEqual(globalThis.B64.submit({ text }), globalThis.B64.transform(text, 1));
  assert.throws(() => globalThis.B64.submit({ text, layers: null }), { code: 'invalid_request' });
});

test('figure generation accepts reversed drags and rejects overlaps without editing the project', () => {
  const request = { rows: 2, cols: 3, renderer: 'csv_inds', rects: [{ r0: 2, c0: 1, r1: 0, c1: 0 }] };
  const original = structuredClone(request);
  assert.deepEqual(figure(request).matrix, [[1, 0, 0], [1, 0, 0]]);
  assert.deepEqual(request, original);
  assert.throws(() => figure({ ...request, rects: [...request.rects, ...request.rects] }), { code: 'invalid_request' });
});

test('agenda exports use the explicit local calendar date and paused clock and preserve the input', () => {
  const day = new Date(2024, 0, 6, 9);
  const at = new Date(2024, 0, 6, 10).toISOString();
  const start = day.toISOString();
  const agenda = { settings: { startTime: '09:00', buffer: 2 },
    items: [{ id: 'a', name: 'First', duration: '5m' }, { id: 'b', name: 'Second', duration: '8m' }] };
  const plan = schedule({ agenda, at, format: 'text' });
  assert.equal(plan.schedule.items[0].startTime, start);
  assert.equal(plan.schedule.items[1].startTime, new Date(+day + 7 * 60000).toISOString());
  assert.match(plan.content, /Second/);
  const paused = { ...agenda, tracker: { startedAt: start, activeItemId: 'a', isRunning: false,
    pausedAt: new Date(+day + 7 * 60000).toISOString() } };
  const original = structuredClone(paused);
  assert.equal(schedule({ agenda: paused, at }).schedule.currentOverrun, 2);
  assert.deepEqual(paused, original);
  assert.throws(() => schedule({ agenda, at: 'yesterday' }), { code: 'invalid_request' });
});
