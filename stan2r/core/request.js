export const MODES = ['prior_predictive', 'posterior_predictive', 'posterior_density', 'prior_density'];

export class Stan2RError extends Error {
  /** @param {string} code @param {string} message @param {string} [path] */
  constructor(code, message, path = '') {
    super(message);
    this.name = 'Stan2RError';
    this.code = code;
    this.issues = [{ code, path, message }];
  }
}

/** @param {string} message @param {string} [path] @returns {never} */
function fail(message, path = '') { throw new Stan2RError('INVALID_REQUEST', message, path); }
/** @param {any} value */
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** @param {any} value @param {string} path */
function numeric(value, path) {
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value) && value.every(x => typeof x === 'number' && Number.isFinite(x))) return;
  if (Array.isArray(value) && value.length && value.every(row => Array.isArray(row) && row.length === value[0].length && row.every(x => typeof x === 'number' && Number.isFinite(x)))) return;
  fail('Data values must be finite numbers, numeric vectors, or rectangular numeric matrices.', path);
}

/** @param {any} request */
export function validateRequest(request) {
  if (!object(request)) fail('Expected a request object.');
  for (const key of Object.keys(request)) if (!['source', 'mode', 'data', 'draws', 'sampleIndex'].includes(key)) fail(`Unknown field: ${key}`, key);
  if (typeof request.source !== 'string' || !request.source.trim()) fail('Provide Stan source text.', 'source');
  if (request.source.length > 200000) fail('Stan source must be at most 200,000 characters.', 'source');
  const mode = request.mode ?? 'prior_predictive';
  if (!MODES.includes(mode)) fail(`Unknown conversion mode: ${mode}`, 'mode');
  const data = request.data ?? null;
  if (data !== null) {
    if (!object(data)) fail('Data must be an object keyed by Stan variable name.', 'data');
    for (const [name, value] of Object.entries(data)) numeric(value, `data.${name}`);
  }
  const draws = request.draws ?? null;
  if (draws !== null) {
    if (!object(draws) || !Object.keys(draws).length) fail('Draws must be an object of numeric columns.', 'draws');
    let length;
    for (const [name, values] of Object.entries(draws)) {
      if (!Array.isArray(values) || !values.length || !values.every(x => typeof x === 'number' && Number.isFinite(x))) fail('Each draws column must be a nonempty array of finite numbers.', `draws.${name}`);
      if (length !== undefined && length !== values.length) fail('Draws columns must have equal lengths.', 'draws');
      length = values.length;
    }
  }
  const sampleIndex = request.sampleIndex ?? 1;
  if (!Number.isInteger(sampleIndex) || sampleIndex < 1) fail('sampleIndex must be a positive integer (one-based).', 'sampleIndex');
  if (mode.startsWith('posterior') && !draws) fail('This mode needs posterior draws.', 'draws');
  if (draws && sampleIndex > Object.values(draws)[0].length) fail('sampleIndex exceeds the available draws.', 'sampleIndex');
  return { source: request.source, mode, data, draws, sampleIndex };
}

// JSON string escapes are accepted by R; escape U+2028/U+2029 for source files too.
/** @param {string} value */
export const rString = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
/** @param {number | number[] | number[][]} value */
function rNumeric(value) {
  if (typeof value === 'number') return String(value);
  if (!value.length) return 'numeric(0)';
  if (Array.isArray(value[0])) return `matrix(c(${value.flat().join(',')}), nrow=${value.length}, byrow=TRUE)`;
  return `c(${value.join(',')})`;
}
/** @param {Record<string, number | number[] | number[][]> | null} value */
function rList(value) {
  if (value === null) return 'NULL';
  return `setNames(list(${Object.values(value).map(rNumeric).join(',')}), c(${Object.keys(value).map(rString).join(',')}))`;
}
/** @param {Parameters<typeof validateRequest>[0]} request */
export function conversionCall(request) {
  const r = validateRequest(request);
  return `stan2r_browser_convert(readChar('model.ast', file.info('model.ast')$size, useBytes=TRUE), readLines('model.stan', warn=FALSE), ${rString(r.mode)}, ${rList(r.data)}, ${r.draws ? `as.data.frame(${rList(r.draws)}, check.names=FALSE)` : 'NULL'}, ${r.sampleIndex})`;
}

/** @param {{errors?: string[], result?: string, warnings?: string[]}} compilation */
export function checkedAST(compilation) {
  if (compilation.errors?.length) {
    // stanc.js 2.38 prefixes its error tuple with the OCaml variant tag "0".
    const errors = compilation.errors[0] === '0' ? compilation.errors.slice(1) : compilation.errors;
    throw new Stan2RError('STAN_ERROR', errors.join('\n'), 'source');
  }
  if (typeof compilation.result !== 'string' || !compilation.result.startsWith('((functionblock')) throw new Stan2RError('COMPILER_ERROR', 'The Stan compiler did not return a typed syntax tree.');
  return { ast: compilation.result, warnings: compilation.warnings || [] };
}
