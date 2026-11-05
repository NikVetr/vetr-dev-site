// Request validation and CSV/TSV table reading. Everything that turns outside input
// into validated predictions and settings lives here, so the API, the CLI and the
// page reject exactly the same things with the same messages.

/**
 * @typedef {{ code: string, path: string, message: string, line?: number }} Issue
 * @typedef {{ text: string, probability: number, outcome: 0 | 1 }} Prediction
 * @typedef {{ bins: 'distinct' | number, simulations: number, plotWorlds: number, interval: number, seed: number }} Settings
 */

export class ForecastCalibrationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Issue[]} [issues]
   */
  constructor(code, message, issues = []) {
    super(message);
    this.name = 'ForecastCalibrationError';
    this.code = code;
    this.issues = issues;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}

/** @type {Readonly<Settings>} */
export const DEFAULTS = Object.freeze({
  bins: 'distinct',
  simulations: 100000,
  plotWorlds: 2000,
  interval: 0.95,
  seed: 1,
});

const REQUEST_FIELDS = ['predictions', 'table', 'bins', 'simulations', 'plotWorlds', 'interval', 'seed'];
const PREDICTION_FIELDS = ['text', 'probability', 'outcome'];
const TABLE_COLUMNS = ['text', 'probability', 'outcome'];
const OUTCOME_WORDS = new Map([['1', 1], ['0', 0], ['true', 1], ['false', 0], ['yes', 1], ['no', 0]]);
const PROBABILITY_TEXT = /^(\d+(?:\.\d*)?|\.\d+)\s*(%?)$/;

/**
 * Validates a request and fills in defaults. Throws one ForecastCalibrationError
 * listing every problem found, so a caller can fix them all at once.
 * @param {unknown} request
 * @returns {{ predictions: Prediction[], settings: Settings }}
 */
export function normalizeRequest(request) {
  if (!isObject(request)) {
    throw invalid([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object' }]);
  }
  /** @type {Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!REQUEST_FIELDS.includes(key)) {
      issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${REQUEST_FIELDS.join(', ')}` });
    }
  }

  const has = (/** @type {string} */ key) => Object.hasOwn(request, key);
  /** @type {Prediction[]} */
  let predictions = [];
  if (has('predictions') && has('table')) {
    issues.push({ code: 'conflicting_fields', path: '', message: 'give either "predictions" or "table", not both' });
  } else if (has('table')) {
    if (typeof request.table === 'string') predictions = readTable(request.table, issues);
    else issues.push({ code: 'wrong_type', path: 'table', message: 'must be a string of CSV or TSV text' });
  } else if (has('predictions')) {
    predictions = readPredictions(request.predictions, issues);
  } else {
    issues.push({ code: 'missing_field', path: 'predictions', message: 'the request needs "predictions" (an array) or "table" (CSV or TSV text)' });
  }

  /** @type {Settings} */
  const settings = {
    bins: has('bins') ? checkBins(request.bins, issues) : DEFAULTS.bins,
    simulations: has('simulations') ? checkInteger(request.simulations, 'simulations', 100, 1_000_000, issues) : DEFAULTS.simulations,
    plotWorlds: has('plotWorlds') ? checkInteger(request.plotWorlds, 'plotWorlds', 0, 10_000, issues) : DEFAULTS.plotWorlds,
    interval: has('interval') ? checkInterval(request.interval, issues) : DEFAULTS.interval,
    seed: has('seed') ? checkInteger(request.seed, 'seed', 0, 4294967295, issues) : DEFAULTS.seed,
  };
  if (settings.plotWorlds > settings.simulations) {
    issues.push({ code: 'out_of_range', path: 'plotWorlds', message: `cannot exceed simulations (${settings.simulations})` });
  }

  if (issues.length) throw invalid(issues);
  return { predictions, settings };
}

/**
 * Reads CSV or TSV text into predictions. Throws a ForecastCalibrationError whose
 * issues carry 1-based line numbers.
 * @param {string} text
 * @returns {Prediction[]}
 */
export function parseTable(text) {
  /** @type {Issue[]} */
  const issues = [];
  const predictions = readTable(text, issues);
  if (issues.length) throw invalid(issues);
  return predictions;
}

/**
 * Writes rows back out as CSV with the header text,probability,outcome. Cells are
 * written as given, so a half-edited table round-trips without being "fixed".
 * @param {{ text?: string, probability?: number | string, outcome?: boolean | number | null }[]} rows
 */
export function formatTable(rows) {
  const lines = [csvLine(TABLE_COLUMNS)];
  for (const row of rows) {
    const outcome = row.outcome === true || row.outcome === 1 ? '1' : row.outcome === false || row.outcome === 0 ? '0' : '';
    lines.push(csvLine([row.text ?? '', String(row.probability ?? ''), outcome]));
  }
  return lines.join('\n') + '\n';
}

/**
 * Reads "0.7", ".7" or "70%" as a probability. Anything else gives NaN; the range
 * is checked by the caller, so "1.5" comes back as 1.5 and is then rejected.
 * @param {string} text
 */
export function parseProbability(text) {
  const match = PROBABILITY_TEXT.exec(text.trim());
  if (!match) return NaN;
  const value = Number(match[1]);
  return match[2] ? value / 100 : value;
}

/** @param {string[]} cells */
export function csvLine(cells) {
  return cells.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',');
}

/** @param {Issue[]} issues */
function invalid(issues) {
  const shown = issues.slice(0, 3).map((issue) => `${issueLocation(issue)}: ${issue.message}`);
  if (issues.length > 3) shown.push(`and ${issues.length - 3} more`);
  return new ForecastCalibrationError('invalid_request', `Invalid request: ${shown.join('; ')}`, issues);
}

/** @param {Issue} issue */
export function issueLocation(issue) {
  if (issue.line) return `${issue.path} line ${issue.line}`;
  return issue.path || 'request';
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {Issue[]} issues
 * @returns {Prediction[]}
 */
function readPredictions(value, issues) {
  if (!Array.isArray(value)) {
    issues.push({ code: 'wrong_type', path: 'predictions', message: 'must be an array of {text, probability, outcome} objects' });
    return [];
  }
  if (value.length === 0) issues.push({ code: 'out_of_range', path: 'predictions', message: 'needs at least one prediction' });
  return value.map((item, i) => {
    const path = `predictions[${i}]`;
    if (!isObject(item)) {
      issues.push({ code: 'wrong_type', path, message: 'must be an object with probability and outcome' });
      return { text: '', probability: NaN, outcome: 0 };
    }
    for (const key of Object.keys(item)) {
      if (!PREDICTION_FIELDS.includes(key)) {
        issues.push({ code: 'unknown_field', path: `${path}.${key}`, message: `unknown field; a prediction has ${PREDICTION_FIELDS.join(', ')}` });
      }
    }
    if (Object.hasOwn(item, 'text') && typeof item.text !== 'string') {
      issues.push({ code: 'wrong_type', path: `${path}.text`, message: 'must be a string' });
    }
    const probabilityIssue = probabilityProblem(item.probability);
    if (probabilityIssue) issues.push({ code: probabilityIssue.code, path: `${path}.probability`, message: probabilityIssue.message });
    const outcome = outcomeValue(item.outcome);
    if (typeof outcome !== 'number') issues.push({ code: outcome.code, path: `${path}.outcome`, message: outcome.message });
    return { text: typeof item.text === 'string' ? item.text : '', probability: item.probability, outcome: outcome === 1 ? 1 : 0 };
  });
}

/**
 * @param {unknown} value
 * @returns {{ code: string, message: string } | null}
 */
function probabilityProblem(value) {
  if (value === undefined || value === null) return { code: 'missing_field', message: 'is missing' };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { code: 'wrong_type', message: 'must be a number strictly between 0 and 1' };
  }
  if (value === 0 || value === 1) {
    return {
      code: 'out_of_range',
      message: `is exactly ${value}: a 0% or 100% forecast that turns out wrong has infinite log loss, so stated probabilities must lie strictly between 0 and 1 (for example 0.01 or 0.99)`,
    };
  }
  if (value < 0 || value > 1) return { code: 'out_of_range', message: `is ${value}, outside 0 to 1` };
  return null;
}

/**
 * @param {unknown} value
 * @returns {0 | 1 | { code: string, message: string }}
 */
function outcomeValue(value) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  if (value === undefined || value === null) return { code: 'missing_field', message: 'is missing; give true if it happened and false if not' };
  return { code: 'wrong_type', message: 'must be true or false (or 1 or 0)' };
}

/** @param {unknown} value @param {Issue[]} issues */
function checkBins(value, issues) {
  if (value === 'distinct' || (Number.isInteger(value) && Number(value) >= 2 && Number(value) <= 100)) {
    return /** @type {'distinct' | number} */ (value);
  }
  issues.push({ code: 'wrong_type', path: 'bins', message: 'must be "distinct" (one bin per stated probability) or an integer from 2 to 100 (equal-width bins)' });
  return DEFAULTS.bins;
}

/** @param {unknown} value @param {string} path @param {number} min @param {number} max @param {Issue[]} issues */
function checkInteger(value, path, min, max, issues) {
  if (Number.isInteger(value) && Number(value) >= min && Number(value) <= max) return Number(value);
  issues.push({
    code: Number.isInteger(value) ? 'out_of_range' : 'wrong_type',
    path,
    message: `must be an integer from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}`,
  });
  return /** @type {number} */ (DEFAULTS[/** @type {keyof Settings} */ (path)]);
}

/** @param {unknown} value @param {Issue[]} issues */
function checkInterval(value, issues) {
  if (typeof value === 'number' && value > 0 && value < 1) return value;
  issues.push({ code: typeof value === 'number' ? 'out_of_range' : 'wrong_type', path: 'interval', message: 'must be a number strictly between 0 and 1, such as 0.95' });
  return DEFAULTS.interval;
}

/**
 * @param {string} text
 * @param {Issue[]} issues
 * @returns {Prediction[]}
 */
function readTable(text, issues) {
  const before = issues.length;
  /** @param {number} line @param {string} message */
  const problem = (line, message) => issues.push({ code: 'table_syntax', path: 'table', line, message });
  const records = splitRecords(text, issues);
  if (!records.length) {
    issues.push({ code: 'table_syntax', path: 'table', message: 'is empty; its first line must be a header such as text,probability,outcome' });
    return [];
  }

  const [header, ...rows] = records;
  const columns = header.cells.map((cell) => cell.trim().toLowerCase());
  columns.forEach((name, j) => {
    if (!TABLE_COLUMNS.includes(name)) {
      problem(header.line, `unknown column "${header.cells[j].trim()}" in the header; the columns are text (optional), probability and outcome`);
    } else if (columns.indexOf(name) !== j) {
      problem(header.line, `the header repeats the column "${name}"`);
    }
  });
  for (const required of ['probability', 'outcome']) {
    if (!columns.includes(required)) problem(header.line, `the header has no "${required}" column`);
  }
  if (issues.length > before) return [];
  if (!rows.length) problem(header.line, 'the table has a header but no predictions');

  return rows.map(({ line, cells }) => {
    if (cells.length !== columns.length) {
      problem(line, `has ${cells.length} cell${cells.length === 1 ? '' : 's'} but the header has ${columns.length}`);
      return { text: '', probability: NaN, outcome: 0 };
    }
    /** @param {string} name */
    const cell = (name) => (columns.includes(name) ? cells[columns.indexOf(name)].trim() : '');

    const probabilityText = cell('probability');
    const probability = parseProbability(probabilityText);
    if (probabilityText === '') {
      problem(line, 'probability is missing');
    } else if (Number.isNaN(probability)) {
      problem(line, `probability "${probabilityText}" is not a number like 0.7 or a percentage like 70%`);
    } else {
      const issue = probabilityProblem(probability);
      if (issue) issues.push({ code: issue.code, path: 'table', line, message: `probability ${probabilityText} ${issue.message}` });
    }

    const outcomeText = cell('outcome');
    const outcome = OUTCOME_WORDS.get(outcomeText.toLowerCase());
    if (outcome === undefined) {
      problem(line, outcomeText === ''
        ? 'outcome is missing; write 1 if it happened and 0 if not'
        : `outcome "${outcomeText}" is not one of 1, 0, true, false, yes, no`);
    }
    return { text: cell('text'), probability, outcome: outcome === 1 ? 1 : 0 };
  });
}

/**
 * Splits CSV (or TSV, when the first line has a tab) into records, honouring
 * double-quoted cells. Blank lines are skipped.
 * @param {string} text
 * @param {Issue[]} issues
 * @returns {{ line: number, cells: string[] }[]}
 */
function splitRecords(text, issues) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  /** @type {{ line: number, cells: string[] }[]} */
  const records = [];
  /** @type {string[]} */
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const endRecord = () => {
    cells.push(cell);
    if (cells.length > 1 || cells[0].trim() !== '') records.push({ line: start, cells });
    cells = [];
    cell = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      start = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) issues.push({ code: 'table_syntax', path: 'table', line: start, message: 'a double quote is never closed' });
  endRecord();
  return records;
}
