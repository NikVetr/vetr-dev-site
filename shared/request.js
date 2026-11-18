// Small JSON entry points share the site's issue shape and reject misspelled options.
export function invalidRequest(path, message) {
  const code = 'invalid_request';
  return Object.assign(new Error(message), { code, issues: [{ code, path, message }] });
}

/** @param {unknown} value @param {string[]} allowed */
export function checkRequestKeys(value, allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw invalidRequest('$', 'Expected a JSON request object.');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw invalidRequest(key, 'Unknown request field: ' + key);
  }
}
