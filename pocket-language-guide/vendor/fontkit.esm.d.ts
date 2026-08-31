// Hand-written declarations for the parts of fontkit this app uses. Kept minimal
// on purpose: it doubles as documentation of our dependency surface, and it stops
// tsc from walking the minified bundle.

export interface Glyph {
  id: number;
  codePoints: number[];
}

export interface GlyphPosition {
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface GlyphRun {
  glyphs: Glyph[];
  positions: GlyphPosition[];
  advanceWidth: number;
}

export interface Font {
  postscriptName: string;
  fullName: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  numGlyphs: number;
  layout(text: string, features?: string[], script?: string, language?: string, direction?: string): GlyphRun;
  hasGlyphForCodePoint(codePoint: number): boolean;
}

export function create(buffer: Uint8Array, postscriptName?: string): Font;
