// Wording shared by the simulation and the views, ported from the GNOME extension (extension.js) so the
// demo says what Agent Bar says: ages, durations, dollars, reset times and quota forecasts.

/** @param {number} at seconds @param {number} now seconds */
export function age(at, now) {
  if (!at) return 'not observed yet';
  const seconds = Math.max(0, now - at);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** @param {number} seconds */
export function duration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
}

/** @param {number} value */
export function dollars(value) {
  if (!(value > 0)) return '$0';
  return value < 0.01 ? '<$0.01' : `$${value >= 1000 ? Math.round(value).toLocaleString('en-US') : value.toFixed(2)}`;
}

/** @param {number} value */
export function tokenCount(value) {
  return value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : `${Math.round(value / 1e3)}k`;
}

/** @param {number} at seconds @param {Intl.DateTimeFormatOptions} [options] */
export function clock(at, options = { hour: 'numeric', minute: '2-digit' }) {
  return new Date(at * 1000).toLocaleTimeString('en-US', options);
}

/** @param {number} at @param {number} now */
export function resetTime(at, now) {
  if (at < now) return 'reset since';
  const date = new Date(at * 1000);
  const time = clock(at);
  return at - now < 20 * 3600 ? `resets ${time}` : `resets ${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

/** Amber under a quarter left, red under a tenth. @param {number} left */
export function quotaStyle(left) {
  return left < 10 ? 'failed' : left < 25 ? 'attention' : 'muted';
}

/** What a limit's pace implies, in a sentence.
 * @param {{percent: number, left: number, resets_at: number, pace: number, basis: string}} limit @param {number} now */
export function quotaProjection(limit, now) {
  if (limit.left <= 0) return `Used up until it resets, in ${duration(Math.round(limit.resets_at - now))}.`;
  const pace = `${limit.pace.toFixed(limit.pace < 1 ? 2 : 1)}%/h`;
  const basis = limit.basis === 'day' ? `At the last day's pace (${pace})` : `At this window's average pace (${pace})`;
  const out = now + limit.left / limit.pace * 3600;
  if (out >= limit.resets_at) {
    const atReset = limit.percent + limit.pace * (limit.resets_at - now) / 3600;
    return `${basis}, it lasts to the reset, about ${Math.round(atReset)}% used by then.`;
  }
  const when = new Date(out * 1000).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `${basis}, it runs out ${when}, in ${duration(Math.round(out - now))}, ${duration(Math.round(limit.resets_at - out))} before the reset.`;
}

/** @param {number} n @param {string} one @param {string} [many] */
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
