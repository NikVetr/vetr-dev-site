// The precached shell: what a content blocker would refuse to let through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// **A blocked shell file costs the reader the whole app.** The service worker only
// installs a complete shell, so one refused file keeps them on the old version
// forever, and a page whose module graph includes it does not start at all. That
// is what `ui/platform/beacon.js` did under EasyPrivacy's generic `/beacon.js` rule.
// An audit of every shipped path against EasyList, EasyPrivacy and uBlock's own
// lists found no other match; these are the stems their generic rules are built on.
const TRACKER_STEMS = /^(beacon|analytics|tracking|tracker|track|telemetry|pixel|ads|adserver|advert)[._-]/i;

test('no shell file is named the way blockers expect a tracker to be', async () => {
  const { files } = JSON.parse(await readFile('data/shell.json', 'utf8'));
  const named = files.filter((/** @type {string} */ f) => TRACKER_STEMS.test(f.split('/').pop() ?? ''));
  assert.deepEqual(named, []);
});
