// Shared shapes for the whole app. Types only -- this module emits nothing at runtime.
// All lengths are PostScript points (1/72in) unless a name says otherwise.

/**
 * One column of data an item can show. `script` is the target language's own
 * orthography, `gloss` is the source language's rendering of the same concept.
 * @typedef {'script'|'script_alt'|'roman'|'ipa'|'gloss'|'respell'|'literal'|'numeral'} FieldId
 */

/**
 * Where a field sits inside an item's sub-grid, and how it is drawn. No font is
 * named here: which face a field needs follows from the field itself (`script`
 * is the target language's, `gloss` the source language's, `roman`/`ipa` are
 * always Latin) so it is resolved once in render/fonts.js instead of being
 * repeated in every theme.
 * `align` is direction-relative: 'start' hugs the reading-order-leading edge.
 * @typedef {Object} FieldStyle
 * @property {FieldId} field
 * @property {number} row
 * @property {number} col
 * @property {number} size
 * @property {number} leading
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {'ink'|'muted'|'section'} color
 * @property {'start'|'end'|'center'} align
 * @property {boolean} [condensed]  use the narrow Latin face, cf. \tablelatin
 */

/**
 * A parameterised item shape. This one type replaces the reference document's
 * `\entry` / `\vocabentry` / `\routeitem` plus its eight `\reftable*` variants:
 * they differ only in grid size, type scale, and whether column widths are
 * solved per row (phrase rows) or shared across the group (reference tables).
 * @typedef {Object} ItemTemplate
 * @property {string} id
 * @property {number} rows
 * @property {number} cols
 * @property {FieldStyle[]} fields
 * @property {'per-row'|'shared'} widthMode
 * @property {[number,number,number,number]} pad  top,right,bottom,left inside the item box
 * @property {number} colGap
 * @property {number} rowGap     may be negative; the reference tucks the second line up
 * @property {boolean} shadeAlternate
 * @property {number} accentPt   left border rule, in the section colour
 * @property {number} rulePt     bottom hairline
 * @property {number} stretch    glue weight after each item (the `\rowflex` fil)
 * @property {number} [rowStretch]  multiplies grid row height, cf. `\arraystretch`
 * @property {'top'|'middle'} [valign] cell alignment within a grid row
 * @property {number} [minFrac]     column-width search bounds, as fractions of usable width
 * @property {number} [maxFrac]
 */

/**
 * @typedef {Object} ItemRow
 * @property {string} conceptId
 * @property {Partial<Record<FieldId,string>>} values
 * @property {number} weight   coverage value, used by the add/subtract solver
 * @property {string[]} [mergedFrom]  other concepts that came out as the same
 *   target text and were folded into this row. They are on the sheet, inside this
 *   row's gloss -- anything asking "is this concept shown?" has to count them, or
 *   the balance solver offers to add a phrase that is already printed.
 */

/**
 * Content is a flat, ordered list of blocks. Section grouping is carried on the
 * block rather than nested, because every consumer (breaking, reordering,
 * rendering) wants the flat sequence.
 * @typedef {Object} Block
 * @property {'heading'|'items'|'note'} kind
 * @property {string} sectionId
 * @property {string} colorRole
 * @property {number} stretch
 * @property {1|2|3} [level]        heading only
 * @property {string} [text]        heading and note
 * @property {string|null} [icon]   heading only
 * @property {string} [templateId]  items only
 * @property {ItemRow[]} [rows]     items only
 */

/**
 * @typedef {Object} Geometry
 * @property {number} pageW
 * @property {number} pageH
 * @property {number} marginTop
 * @property {number} marginBottom
 * @property {number} marginLeft
 * @property {number} marginRight
 * @property {number} columns
 * @property {number} columnGap
 * @property {number} faces
 * @property {boolean} [screen]  a preset that is displayed rather than printed --
 *   the phone card. It has no back, so there is nothing to duplex and no reason for
 *   its faces to come in pairs.
 * @property {{top:number, bottom:number}} [reserve]  fractions of the page height
 *   kept clear at each end, for the parts of a lock screen the operating system
 *   draws over. Only meaningful on a `screen` preset. Fractions rather than points
 *   because it is a fraction of a screen that gets covered whatever the screen's
 *   size, and because neither OS publishes a figure -- see `RESERVE_CHOICES`.
 */

/**
 * Printer/paper facts that change the safe area and the legibility floor.
 * @typedef {Object} PaperSpec
 * @property {string} presetId
 * @property {boolean} borderless
 * @property {number} oversprayPct     borderless enlargement to inset against
 * @property {number} nonprintablePt   hardware margin when bordered
 * @property {number} minRulePt
 * @property {number} minSizeDelta     added to each script's min size
 */

/**
 * A line along the top or bottom of every face, outside the columns.
 *
 * Two slots rather than one string, because the useful cases are a label on one
 * side and a folio on the other -- and a folio belongs in a corner. `custom` takes
 * `text`; the rest are derived, so they stay right when the pair or the region
 * changes.
 * @typedef {'none'|'page'|'pair'|'region'|'custom'} HeadSlot
 *
 * @typedef {Object} RunningHead
 * @property {'none'|'top'|'bottom'} at
 * @property {HeadSlot} [left]
 * @property {HeadSlot} [right]
 * @property {string} [text]  for a `custom` slot
 */

/**
 * @typedef {Object} SheetSpec
 * @property {string} target
 * @property {string} source
 * @property {string} accent
 * @property {string} romanization
 * @property {string} register
 * @property {string} region  ISO 3166-1 alpha-2; supplies local emergency numbers
 * @property {FieldId[]} fieldSet
 * @property {Geometry} geometry
 * @property {PaperSpec} paper
 * @property {string} themeId
 * @property {Record<string,string>} [themeColors]  overrides on the theme's own
 *   palette, keyed as the theme files are: `ink`, `muted`, `rule`, `shade`,
 *   `paper`, and `roles.<role>` for a section colour. Set when the reader has
 *   picked colours of their own; `themeId` still names the theme underneath, so
 *   everything not overridden -- type sizes, leadings, rules -- comes from it.
 * @property {'sans'|'serif'|'cond'|'cond-serif'} typeface  a script with no such
 *   variant falls back to its plain stack, which is why a condensed Mandarin sheet
 *   is condensed Latin against unchanged Han
 * @property {'full'|'low-ink'|'mono'} inkMode
 * @property {boolean} autoFaces  let the solver add or drop pairs of faces
 * @property {number} padding  extra breathing room around every text element, in
 *   points at nominal type size. Named for what it does: larger means more space.
 *   It was called `density`, which meant the opposite of its effect.
 * @property {'mixed'|'two-column'|'one-row'|'stacked'} arrangement  item field layout
 * @property {'consistent'|'adaptive'} [split]  whether the divider between an
 *   item's two halves is solved once per section or once per row
 * @property {Record<string,string>} [sectionColors]  section id -> colour role,
 *   overriding the registry's own. Colour is how the sheet codes its sections, so
 *   which section takes which is an editorial choice rather than a fact.
 * @property {RunningHead} [head]  a line of furniture along the top or bottom
 * @property {number} scale
 * @property {number} priority  keep only concepts whose `importance` reaches this,
 *   0 for all of them. A floor on the corpus rather than a count, so the same
 *   setting means the same content on every pair: importance is a property of the
 *   concept, and every language realises the same bank. An item the reader ticked
 *   by hand outranks it -- see `buildBlocks`.
 * @property {{sections:Record<string,boolean>, items:Record<string,boolean>}} selection
 */

/** @typedef {{x:number,y:number,w:number,h:number,fill:string,r?:number}} Rect */

/** Text already broken to a single line and positioned. Renderers do not re-wrap.
 * @typedef {Object} TextRun
 * @property {string} text
 * @property {number} x        left edge after alignment
 * @property {number} y        baseline
 * @property {string} fontId
 * @property {number} size
 * @property {string} fill
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {'ltr'|'rtl'} dir
 */

/** Icon geometry; `name` is resolved against data/icons.json by the renderer.
 * @typedef {{x:number,y:number,size:number,name:string,fill:string}} IconMark */

/** @typedef {{x:number,y:number,w:number,h:number,conceptId?:string,sectionId?:string}} HitBox */

/** `rotate` is a whole-page rotation in degrees, set by imposition when a
 * duplex flip would otherwise print the back of a card upside down.
 * @typedef {{rects:Rect[], runs:TextRun[], icons:IconMark[], hits:HitBox[], rotate?:number}} Face */

/**
 * A remedy the reader can apply with one click. `patch` is a shallow overlay on
 * the SheetSpec, so a warning can offer the fix rather than only describe it.
 * @typedef {Object} WarningFix
 * @property {string} label
 * @property {Partial<SheetSpec>} patch
 */

/**
 * @typedef {Object} Warning
 * @property {string} code
 * @property {'info'|'warn'|'error'} severity
 * @property {string} message  English, and the fallback: Node-side scripts print this
 * @property {Record<string, string|number>} [params] values the translated form
 *   interpolates. The solver cannot translate -- it has no business knowing what
 *   language the interface is in -- so it emits a stable `code` plus the numbers,
 *   and the UI looks up `warn.<code>` and fills them in. A code with no catalogue
 *   entry falls back to `message`, so an untranslated warning is still a warning.
 * @property {WarningFix[]} [fixes]
 * @property {number} [faceIndex]
 * @property {string} [conceptId]
 */

/**
 * @typedef {Object} LayoutPlan
 * @property {number} pageW
 * @property {number} pageH
 * @property {Face[]} faces
 * @property {Warning[]} warnings
 * @property {number} scale       the scale actually used, after autofit
 * @property {number[]} looseness per-column residual slack, for diagnostics
 * @property {Geometry} geometry  as resolved: `faces` is a real count even when
 *   the spec asked for auto
 */

/** @typedef {{conceptId:string, sectionId:string, label:string, reason:string}} DiffEntry */
/** @typedef {{adds:DiffEntry[], removes:DiffEntry[]}} Diff */

/**
 * Measures text for the solver. Implemented twice -- against the DOM in the
 * browser, against HarfBuzz for headless rendering -- and the two are held to
 * agreement by tests/measure-parity.test.mjs.
 * @typedef {Object} TextMeasurer
 * @property {(text:string, fontId:string, size:number)=>number} width
 * @property {(text:string, fontId:string, size:number)=>number[]} segments
 */

export {};
