import { createRequire } from 'node:module';
import { compileCompatible } from './compilation.js';
const require = createRequire(import.meta.url);
const { stanc } = require('../vendor/stanc.js');
/** @param {string} source */
export function compile(source) {
  return compileCompatible(source, stanc, () => require('../vendor/stanc-2.32.2.js').stanc);
}
