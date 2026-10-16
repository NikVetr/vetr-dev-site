import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wireRecitation } from '../scripts/wire_recitation.mjs';

test('generated Android wiring is repeatable and declares the actual background service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanderwart-recitation-test-'));
  const java = join(root, 'android/app/src/main/java/dev/vetr/pocketlanguageguide');
  try {
    await mkdir(java, { recursive: true });
    await writeFile(join(root, 'capacitor.config.json'), JSON.stringify({ appId: 'dev.vetr.pocketlanguageguide' }));
    await writeFile(join(java, 'MainActivity.java'), 'package dev.vetr.pocketlanguageguide;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}\n');
    const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
    await writeFile(manifest, '<manifest><application></application><queries><package android:name="example" /></queries></manifest>');
    await cp(new URL('../native/recitation/android', import.meta.url), join(root, 'native/recitation/android'), { recursive: true });
    await wireRecitation('android', root);
    const once = await readFile(manifest, 'utf8');
    await wireRecitation('android', root);
    assert.equal(await readFile(manifest, 'utf8'), once);
    assert.equal((once.match(/android:name="\.RecitationService"/g) ?? []).length, 1);
    assert.ok(once.includes('foregroundServiceType="mediaPlayback"'));
    assert.ok(once.includes('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'));
    assert.ok(once.includes('android.permission.WAKE_LOCK'));
    assert.ok(once.includes('android.intent.action.TTS_SERVICE'));
    assert.ok(!once.includes('RECORD_AUDIO'));
    const activity = await readFile(join(java, 'MainActivity.java'), 'utf8');
    assert.ok(activity.indexOf('registerPlugin(') < activity.indexOf('super.onCreate('));
    assert.ok((await readFile(join(java, 'RecitationService.java'), 'utf8')).includes('extends Service'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native wiring rejects an unregistered application identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanderwart-recitation-id-'));
  try {
    await writeFile(join(root, 'capacitor.config.json'), JSON.stringify({ appId: 'other.app' }));
    await assert.rejects(wireRecitation('android', root), /changing appId/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
