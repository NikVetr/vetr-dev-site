// A recitation is a sequence of displays, utterances and pauses, without grading.
import { printedAlternatives } from '../core/alternation.js';
import { sayable } from '../core/pack.js';
import { resolveSpokenLocale } from './platform/speech.js';

/** @typedef {import('../core/types.js').FieldId} FieldId */
/** @typedef {{screen:string[], audio:string[], delayMs:number}} Phase */
/** @typedef {{phases:Phase[], floor:number, rate:number, repeat:boolean}} RecitationConfig */
/** @typedef {{key:string,text:string,lang:string}} Display */
/** @typedef {{id:string,conceptId:string,colorRole:string,screen:Display[],audio:{text:string,locale:string,rate:number}[],delayMs:number}} Step */
const FIELDS = new Set(['script', 'script_alt', 'roman', 'ipa', 'respell', 'literal']);

/** @returns {RecitationConfig} */
export function defaultRecitation() {
  return { phases: [
    { screen: ['source:script'], audio: ['source:script'], delayMs: 5000 },
    { screen: ['target:script'], audio: ['target:script'], delayMs: 3000 },
  ], floor: 0, rate: 1, repeat: true };
}

/** Validate saved settings and editor input before generating any audio. @param {unknown} value @returns {RecitationConfig} */
export function validateRecitation(value) {
  const config = /** @type {RecitationConfig} */ (value);
  if (!config || !Array.isArray(config.phases) || !config.phases.length || config.phases.length > 8
    || !Number.isFinite(config.floor) || config.floor < 0 || config.floor > 1
    || !Number.isFinite(config.rate) || config.rate < 0.5 || config.rate > 2
    || typeof config.repeat !== 'boolean') throw new Error('Invalid recitation settings.');
  for (const phase of config.phases) {
    if (!phase || !Number.isFinite(phase.delayMs) || phase.delayMs < 0 || phase.delayMs > 600000
      || !Array.isArray(phase.screen) || !Array.isArray(phase.audio)) throw new Error('Invalid recitation phase.');
    for (const fields of [phase.screen, phase.audio]) {
      if (fields.length > 12 || fields.some((key) => {
        if (typeof key !== 'string') return true;
        const [side, field, extra] = key.split(':');
        return !['source', 'target'].includes(side) || !FIELDS.has(field) || extra !== undefined;
      })) throw new Error('Invalid recitation fields.');
    }
    if (!phase.screen.length && !phase.audio.length) throw new Error('Choose a screen or audio field for every phase.');
    if (!phase.audio.length && phase.delayMs < 100) throw new Error('A screen-only phase needs at least 0.1 seconds.');
  }
  return config;
}

/**
 * The reverse pair supplies the source language's own IPA and romanisation. Missing
 * representations exclude that phrase, with a count for the setup to explain.
 * @param {import('../core/types.js').Block[]} blocks
 * @param {import('../core/types.js').Block[]} reverseBlocks
 * @param {{source:string,target:string}} pair
 * @param {RecitationConfig} config
 * @returns {{steps:Step[], phrases:number, skipped:number}}
 */
export function recitationPlan(blocks, reverseBlocks, pair, config) {
  validateRecitation(config);
  const reverse = new Map(reverseBlocks.flatMap((b) => (b.rows ?? []).flatMap((row) =>
    [row.conceptId, ...(row.mergedFrom ?? [])].map((id) => [id, row]))));
  /** @type {Step[]} */ const steps = [];
  let phrases = 0;
  let skipped = 0;
  for (const block of blocks) for (const row of block.kind === 'items' ? block.rows ?? [] : []) {
    if (row.weight < config.floor) continue;
    const source = reverse.get(row.conceptId);
    /** @param {string} key */
    const cell = (key) => {
      const [side, fieldName] = key.split(':');
      const field = /** @type {FieldId} */ (fieldName);
      const own = side === 'target' ? row : source;
      const value = side === 'source' && field === 'script' ? row.values.gloss : own?.values[field];
      const lang = field === 'literal' || field === 'respell'
        ? (side === 'source' ? pair.target : pair.source) : pair[/** @type {'source'|'target'} */ (side)];
      return { key, text: value ?? '', lang };
    };
    const missing = config.phases.some((p) => [...p.screen, ...p.audio].some((key) => !cell(key).text.trim()));
    if (missing) { skipped += 1; continue; }
    const phraseSteps = config.phases.map((phase, index) => {
      /** @type {Step['audio']} */ const audio = [];
      for (const key of phase.audio) {
        const [side, field] = key.split(':');
        // Phonetic spellings describe the same sound; do not read IPA symbols aloud.
        const spokenKey = field === 'literal' ? key : `${side}:script`;
        const spoken = cell(spokenKey);
        const locale = resolveSpokenLocale(spoken.lang);
        if (!locale) throw new Error(`No speech language is available for ${spoken.lang}.`);
        const own = side === 'target' ? row : source;
        const spokenField = field === 'literal' ? 'literal' : side === 'source' ? 'gloss' : 'script';
        const text = sayable(printedAlternatives(spoken.text, (side === 'source' && field !== 'literal' ? row : own)?.alternates?.[spokenField])[0] ?? '');
        if (!text) throw new Error(`No speakable text for ${row.conceptId}.`);
        if (!audio.some((a) => a.locale === locale && a.text === text)) audio.push({ text, locale, rate: config.rate });
      }
      return { id: `${row.conceptId}:${index}`, conceptId: row.conceptId,
        colorRole: block.colorRole, screen: phase.screen.map(cell), audio, delayMs: phase.delayMs };
    });
    steps.push(...phraseSteps);
    phrases += 1;
  }
  if (steps.length > 10000) throw new Error('Choose fewer phrases or phases (maximum 10,000 steps).');
  return { steps, phrases, skipped };
}
