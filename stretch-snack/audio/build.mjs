// Regenerate the small local speech tracks. Requires FFmpeg with libflite (CMU SLT voice).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cues } from './cues.js';

const temp = mkdtempSync(join(tmpdir(), 'stretch-voice-'));
try {
  const files = [];
  for (const [key, text] of cues) {
    writeFileSync(join(temp, 'cue.txt'), text);
    const name = 'clips/' + key + '.mp3';
    const target = fileURLToPath(new URL(name, import.meta.url));
    const run = spawnSync(
      'ffmpeg',
      [
        '-nostdin',
        '-loglevel',
        'error',
        '-y',
        '-filter_threads',
        '1',
        '-f',
        'lavfi',
        '-i',
        'flite=textfile=cue.txt:voice=slt',
        '-ac',
        '1',
        '-ar',
        '22050',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '32k',
        '-threads',
        '1',
        target,
      ],
      { cwd: temp, encoding: 'utf8' },
    );
    if (run.error || run.status !== 0) throw run.error ?? new Error(run.stderr);
    if (readFileSync(target).length < 1024) throw new Error('Empty cue ' + key);
    files.push(name);
  }
  writeFileSync(new URL('files.json', import.meta.url), JSON.stringify(files, null, 2) + '\n');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
