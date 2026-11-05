// Request checking shared by every entry: one typed error that lists every problem,
// and small checkers that append issues instead of throwing, so a caller sees all of
// them at once. Nothing is coerced: a string "2.5" is not a number.

/** @typedef {{ code: string, path: string, message: string }} Issue */

export class IntuitionsError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'IntuitionsError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/**
 * The error for a request with problems; the message names the first three.
 * @param {Issue[]} issues
 */
export function invalidRequest(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issue.path || 'request'}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new IntuitionsError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reports keys of `object` that are not in `allowed`.
 * @param {Record<string, unknown>} object
 * @param {readonly string[]} allowed
 * @param {string} path prefix, such as "params"
 * @param {Issue[]} issues
 */
export function rejectUnknown(object, allowed, path, issues) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      issues.push({ code: 'unknown_field', path: `${path}.${key}`, message: `unknown field; the fields are ${allowed.join(', ')}` });
    }
  }
}

/**
 * A finite number in [min, max], or the fallback after recording an issue.
 * @param {unknown} value
 * @param {string} path
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @param {Issue[]} issues
 */
export function checkNumber(value, path, min, max, fallback, issues) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ code: 'wrong_type', path, message: `must be a number from ${min} to ${max}` });
    return fallback;
  }
  if (value < min || value > max) {
    issues.push({ code: 'out_of_range', path, message: `is ${value}; it must be from ${min} to ${max}` });
    return fallback;
  }
  return value;
}

/**
 * An integer in [min, max], or the fallback after recording an issue.
 * @param {unknown} value
 * @param {string} path
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @param {Issue[]} issues
 */
export function checkInteger(value, path, min, max, fallback, issues) {
  const range = `${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}`;
  if (!Number.isInteger(value)) {
    issues.push({ code: 'wrong_type', path, message: `must be an integer from ${range}` });
    return fallback;
  }
  if (Number(value) < min || Number(value) > max) {
    issues.push({ code: 'out_of_range', path, message: `is ${value}; it must be an integer from ${range}` });
    return fallback;
  }
  return Number(value);
}

/**
 * One of a fixed set of strings, or the fallback after recording an issue.
 * @template {string} T
 * @param {unknown} value
 * @param {string} path
 * @param {readonly T[]} choices
 * @param {T} fallback
 * @param {Issue[]} issues
 * @returns {T}
 */
export function checkChoice(value, path, choices, fallback, issues) {
  if (typeof value === 'string' && choices.includes(/** @type {T} */ (value))) return /** @type {T} */ (value);
  issues.push({ code: typeof value === 'string' ? 'out_of_range' : 'wrong_type', path, message: `must be one of ${choices.map((c) => `"${c}"`).join(', ')}` });
  return fallback;
}
