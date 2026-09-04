// UI translation.
//
// The interface language is the reader's *own* language -- the one already chosen
// in the header and persisted -- not a separate setting. Somebody who reads Korean
// wants a Korean interface and Korean glosses; asking twice would be asking the
// same question twice. It also means the picker that was already there now does
// something more useful than it did.
//
// English is the source of truth. `data/i18n/en.json` holds every key, and any
// other catalogue is a partial overlay: a missing key falls back to English rather
// than showing a bare key, so a half-translated language degrades to a mixed
// interface instead of a broken one. A language with no catalogue at all is
// therefore just English, which is exactly what it was before.
//
// Static markup carries `data-i18n="key"`; anything built in JavaScript calls `t`.
// Both read the same catalogue, so a string exists in one place regardless of
// which side of the line it is drawn on.

/**
 * Languages whose *interface* reads right to left. Deliberately a short explicit
 * list rather than a lookup through `data/registry/scripts.csv`: that file is about
 * the direction of a sheet's target script, which is a different question, and the
 * gallery is built to load without touching the registries it does not need.
 */
const RTL_UI = new Set(['ar', 'he', 'fa', 'ur']);

/** Loaded catalogue for the chosen language, then English underneath it. */
/** @type {Record<string,string>} */ let overlay = {};
/** @type {Record<string,string>} */ let english = {};
/** @type {'ltr'|'rtl'} */ let direction = 'ltr';
let active = 'en';

/**
 * Load the interface language and apply its direction to the document.
 *
 * @param {string} code                 the reader's language
 * @param {(rel:string)=>Promise<string>} loadText
 */
export async function loadUiLanguage(code, loadText) {
  english = JSON.parse(await loadText('data/i18n/en.json'));
  overlay = {};
  active = code;
  if (code !== 'en') {
    try {
      overlay = JSON.parse(await loadText(`data/i18n/${code}.json`));
    } catch {
      // Not translated yet. English is a perfectly good answer.
      active = 'en';
    }
  }
  // Follows the language actually rendered, not the one asked for: if Arabic has no
  // catalogue yet we show English, and English in a right-to-left document would be
  // worse than either.
  direction = RTL_UI.has(active.split('-')[0]) ? 'rtl' : 'ltr';
  document.documentElement.lang = active;
  document.documentElement.dir = direction;
  return { code: active, dir: direction };
}

/**
 * A translated string. `vars` fills `{name}` placeholders.
 *
 * Placeholders rather than concatenation, because word order is exactly what
 * differs between languages: "4 faces at 0.87x" cannot be assembled from parts and
 * still read correctly in Japanese or Arabic.
 *
 * **An insert that carries letters is bidi-isolated; one that is only digits is not.**
 * What fills a placeholder is often a language, region or script name, written in its
 * own script, so it routinely runs the other way from the sentence around it. Left
 * alone the bidi algorithm resolves the two as one paragraph and punctuation
 * migrates: `Spoken in {language}` with a Latin-script insert in an Arabic sentence
 * put the full stop at the far end of the line, and `{target} → {source}` with two
 * right-to-left names swallowed the arrow into the run and drew it pointing the wrong
 * way. FSI/PDI says the insert settles its own direction from its own first strong
 * character while the sentence keeps its own.
 *
 * A number needs none of that and is worse for having it. Digits are bidi class EN --
 * weak, and already resolved sensibly against the surrounding direction -- so the
 * isolates buy nothing, and they are real characters in the string: `8 faces at 0.65x`
 * became `⁨8⁩ faces at ⁨0.65⁩x`, which reads the same and matches nothing, breaking
 * seventeen tests that quite reasonably looked for the number they had asked for.
 * Testing for a letter is the same question as "could this be in another script".
 *
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  const template = overlay[key] ?? english[key];
  if (template === undefined) {
    // A missing key is a bug in the catalogue, not in the caller, and it should be
    // loud in development without breaking the page for a reader.
    console.warn(`[plg] no such message: ${key}`);
    return key;
  }
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) => (
    name in vars ? isolate(String(vars[name])) : whole
  ));
}

/** Whether a catalogue has been loaded yet. A fatal can fire before one has. */
export function messagesReady() {
  return Object.keys(english).length > 0;
}

/** The interface language actually in use, which may be the English fallback. */
export function uiLanguage() {
  return active;
}

/** @returns {'ltr'|'rtl'} */
/**
 * Locales that write the percent sign before the number: `%50`, not `50 %`.
 *
 * A locale fact rather than a translation, so it lives here rather than as a
 * pseudo-key in the catalogues. Turkish is the case in this set; the Turkish
 * translator caught it, because the sign was rendering after the box the way the
 * other sixteen want it.
 */
export const PERCENT_FIRST = new Set(['tr']);

export function uiDirection() {
  return direction;
}

/** Wrap an insert in FSI/PDI if it carries letters. See `t` for why only then. */
/** @param {string} value */
function isolate(value) {
  return /\p{L}/u.test(value) ? `\u2068${value}\u2069` : value;
}

/**
 * A number, in the interface language's own notation.
 *
 * `toFixed` is not a formatter, it is a stringifier, and it always writes a dot: an
 * importance of `0.85` and a fitted scale of `0.76x` printed with a decimal point on
 * every Spanish, Portuguese, French, German, Italian, Russian and Turkish sheet,
 * where the separator is a comma. Here rather than at each call site because `active`
 * is here, and the call sites -- the content tree, the studio's status line, the quick
 * page and the drag readouts -- have no business knowing the locale.
 *
 * Not for coordinates or cache keys: those are machine-readable and `toFixed` is
 * exactly right for them.
 * @param {number} value @param {number} digits
 */
export function number(value, digits) {
  try {
    return new Intl.NumberFormat([active], {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

/**
 * A language's name in the interface language. `Intl.DisplayNames` already knows
 * these for every locale the browser supports, which is a better answer than
 * carrying sixteen language names in eight catalogues and keeping them in step.
 * Falls back to the registry's English exonym where the browser has no opinion.
 * @param {string} code @param {string} fallback
 */
export function languageName(code, fallback) {
  try {
    const names = new Intl.DisplayNames([active], { type: 'language' });
    return names.of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * A solver warning, in the interface language.
 *
 * The solver cannot translate -- it has no business knowing what language the
 * interface is in -- so it emits a stable `code` plus the numbers, and the lookup
 * happens here. A code with no catalogue entry falls back to the English `message`
 * the solver also carries, so a warning is never lost to a missing key.
 * @param {import('../core/types.js').Warning} warning
 */
export function warningText(warning) {
  const key = `warn.${warning.code}`;
  const template = overlay[key] ?? english[key];
  if (template === undefined) return warning.message;
  // A `region` param is an ISO 3166 code and a `field` param is a `FieldId`,
  // because the solver has no business knowing what language the interface is in --
  // the same split as `warn.<code>` itself. This is where a code becomes a name the
  // reader recognises: the field label is the one the "Columns shown" toggle uses,
  // so a warning about a column names it the way the control that switched it on
  // does.
  let params = warning.params;
  if (params?.region) params = { ...params, region: regionName(String(params.region)) };
  if (params?.field) params = { ...params, field: t(`field.${params.field}`) };
  return t(key, params);
}

/**
 * A country's name in the interface language, or its code if we cannot.
 * @param {string} code ISO 3166-1 alpha-2
 */
function regionName(code) {
  try {
    return new Intl.DisplayNames([active], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * A `;`-separated `regions` cell as a readable list in the interface language.
 *
 * `gallery.spokenIn` is the accessible name of the flag row, and it is the only
 * place the country list is ever *said* rather than drawn -- so it was the one
 * place the raw codes reached a reader: "English is spoken in GB, US, CA, AU".
 * Both callers pass the registry cell straight through, so the join belongs here
 * beside `regionName` rather than in each of them.
 * @param {string} regions the `regions` cell of `data/registry/languages.csv`
 */
export function regionList(regions) {
  return regions.split(';').filter(Boolean).map(regionName).join(', ');
}

/**
 * Translate static markup. `data-i18n` sets text; `data-i18n-title` and
 * `data-i18n-label` set the `title` and `aria-label` attributes, which need
 * translating just as much and are the ones people forget.
 * @param {ParentNode} [root]
 */
export function applyStatic(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(/** @type {string} */ (node.getAttribute('data-i18n')));
  }
  for (const [attr, target] of [['data-i18n-title', 'title'], ['data-i18n-label', 'aria-label']]) {
    for (const node of root.querySelectorAll(`[${attr}]`)) {
      node.setAttribute(target, t(/** @type {string} */ (node.getAttribute(attr))));
    }
  }
}
