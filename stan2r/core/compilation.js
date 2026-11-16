import { checkedAST, Stan2RError } from './request.js';

/** @typedef {{result?:string,errors?:string[],warnings?:string[]}} Compilation */
/** @typedef {(name:string,source:string,flags:string[])=>Compilation} Compiler */
/** @typedef {{compiler:string,detected:'legacy'|'modern'|'undetermined',description:string,migrated:boolean,normalizedSource?:string,migrationCompiler?:string}} SyntaxInfo */

/** Source text identifies syntax features, not the exact version that authored it.
 * This scanner supplies hints only; all acceptance and migration use Stan's compilers.
 * @param {string} source @returns {SyntaxInfo}
 */
export function detectSyntax(source) {
  /** @type {string[]} */
  const tokens = source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z_0-9]*|\S/g) ?? [];
  const modern = tokens.includes('array');
  return {
    compiler: 'stanc 2.38.0', detected: modern ? 'modern' : 'undetermined', migrated: false,
    description: modern ? 'Array keyword syntax (Stan 2.26 or later). Exact authoring version is unknown.' : 'No version-specific syntax identified. Exact authoring version is unknown.',
  };
}

/** First type-check with the maintained compiler. Only on failure, ask the last
 * pre-removal compiler to canonicalize its supported deprecations, then type-check
 * the result with the maintained compiler. Neither an old AST nor a regex rewrite
 * enters the translator/simulator. Original source is never overwritten.
 * @param {string} source @param {Compiler} current @param {()=>Compiler} legacy
 */
export function compileCompatible(source, current, legacy) {
  const first = current('model', source, ['debug-typed-ast']);
  if (!first.errors?.length) return { ...checkedAST(first), source, syntax: detectSyntax(source) };
  let old;
  try { old = legacy()('model', source, ['auto-format', 'canonicalize=deprecations']); }
  catch (error) {
    throw new Stan2RError('COMPILER_ERROR', `Could not load/run the Stan 2.32.2 syntax migration compiler: ${String(error)}`);
  }
  // Keep the authoritative current-compiler diagnostic for invalid source. Older
  // compilers also reject newer features, which is not evidence of old syntax.
  if (old.errors?.length || !old.result) return { ...checkedAST(first), source, syntax: detectSyntax(source) };
  const normalizedSource = old.result;
  const updated = current('model', normalizedSource, ['debug-typed-ast']);
  if (updated.errors?.length) {
    try { checkedAST(first); } catch (error) {
      if (error instanceof Stan2RError) throw new Stan2RError('STAN_ERROR', `${error.message}\nAutomatic syntax migration could not make this model valid in Stan 2.38.0. Review the original compiler diagnostic above.`, 'source');
      throw error;
    }
  }
  const parsed = checkedAST(updated);
  /** @type {SyntaxInfo} */
  const syntax = {
    compiler: 'stanc 2.38.0', detected: 'legacy', migrated: true,
    migrationCompiler: 'stanc 2.32.2', normalizedSource,
    description: 'Legacy syntax modernized by Stan 2.32.2 and checked with Stan 2.38.0. Exact authoring version is unknown.',
  };
  return { ...parsed, source: normalizedSource, syntax, warnings: [
    'Legacy Stan syntax was automatically modernized with the official compiler. The original editor text is unchanged; model line references use the normalized source.',
    ...(old.warnings ?? []), ...parsed.warnings,
  ] };
}
