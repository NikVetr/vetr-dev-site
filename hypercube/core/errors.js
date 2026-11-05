// The one error type of the tool. A request or plan with problems throws a single
// HypercubeError listing every issue found, so a caller can fix them all at once.

/** @typedef {{ code: string, path: string, message: string }} Issue */

export class HypercubeError extends Error {
  /**
   * @param {string} code 'invalid_request', 'invalid_plan' or 'plan_unavailable'
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'HypercubeError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** @param {unknown} value @returns {value is Record<string, any>} */
export function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
