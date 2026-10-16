import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** @type {{language:string, axes:string[], rows:number, unknownKeys:string[], templateAlternates:string[], slashed:string[]}[]} */
const report = JSON.parse(execFileSync(process.execPath, ['scripts/speaker_coverage.mjs', '--json'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
}));

test('coverage accepts shipped listener and combined register keys, including languages without speaker axes', () => {
  assert.ok(report.find((row) => row.language === 'ko')?.axes.includes('register'));
  assert.ok(report.find((row) => row.language === 'ha')?.axes.includes('listener_gender'));
  assert.ok((report.find((row) => row.language === 'pl')?.rows ?? 0) > 0);
  for (const row of report) assert.deepEqual(row.unknownKeys, [], row.language);
});

test('coverage separates printed noun-gender alternatives and lexical slashes from speaker migration', () => {
  const spanish = report.find((row) => row.language === 'es');
  assert.ok(spanish);
  assert.ok(spanish.templateAlternates.includes('directions.where-is-the-nearest'));
  assert.ok(!spanish.slashed.includes('directions.where-is-the-nearest'));
  assert.ok(!spanish.slashed.includes('pronouns-verbs.i-me'));
  const list = execFileSync(process.execPath, ['scripts/speaker_coverage.mjs', 'es', '--slashed'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.deepEqual(list.trim().split('\n').filter(Boolean).map((line) => line.split('\t')[0]), spanish.slashed.sort());
});
