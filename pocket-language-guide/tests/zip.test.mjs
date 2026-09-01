// The ZIP writer is verified against a real unzip implementation rather than
// against itself: a hand-rolled archive format that only this repo can read would
// be worse than useless to someone who exported a six-face sheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip } from '../core/zip.js';

const encoder = new TextEncoder();

/**
 * Read an archive back with python's zipfile, which is not our code.
 * @param {Uint8Array} bytes @returns {Record<string,string>}
 */
function readBack(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'plg-zip-'));
  const path = join(dir, 'a.zip');
  writeFileSync(path, bytes);
  const out = execFileSync('python3', ['-c', `
import json, zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'crc mismatch'
print(json.dumps({n: z.read(n).decode('utf-8', 'backslashreplace') for n in z.namelist()}))
`, path], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('a written archive is readable by a real unzip, with intact contents', () => {
  const entries = [
    { name: 'sheet-face-1.svg', bytes: encoder.encode('<svg>face one</svg>') },
    { name: 'sheet-face-2.svg', bytes: encoder.encode('<svg>face two</svg>') },
  ];
  const back = readBack(zip(entries));
  assert.deepEqual(Object.keys(back).sort(), ['sheet-face-1.svg', 'sheet-face-2.svg']);
  assert.equal(back['sheet-face-1.svg'], '<svg>face one</svg>');
  assert.equal(back['sheet-face-2.svg'], '<svg>face two</svg>');
});

test('non-Latin names and binary payloads survive', () => {
  // A sheet named in the target language is the normal case, not an edge case.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 128]);
  const back = readBack(zip([
    { name: '日本語-face-1.png', bytes: png },
    { name: 'note.txt', bytes: encoder.encode('') },
  ]));
  assert.ok('日本語-face-1.png' in back, Object.keys(back).join());
  assert.ok('note.txt' in back);
});

test('the same entries always produce the same bytes', () => {
  const make = () => zip([{ name: 'a.txt', bytes: encoder.encode('hello') }]);
  assert.deepEqual([...make()], [...make()]);
});
