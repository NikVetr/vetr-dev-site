// Minimal declarations for the pdf-lib surface this app uses.

export interface PDFFont {
  widthOfTextAtSize(text: string, size: number): number;
}

export interface PDFPageDrawOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  size?: number;
  font?: PDFFont;
  color?: unknown;
  borderColor?: unknown;
  borderWidth?: number;
  borderLineCap?: number;
  opacity?: number;
  rotate?: unknown;
  lineHeight?: number;
}

export interface PDFPage {
  getSize(): { width: number; height: number };
  drawRectangle(options: PDFPageDrawOptions): void;
  drawText(text: string, options: PDFPageDrawOptions): void;
  drawSvgPath(path: string, options: PDFPageDrawOptions & { scale?: number }): void;
  pushOperators(...operators: unknown[]): void;
}

export interface PDFDocument {
  addPage(size?: [number, number]): PDFPage;
  embedFont(bytes: Uint8Array | ArrayBuffer, options?: { subset?: boolean; customName?: string }): Promise<PDFFont>;
  registerFontkit(fontkit: unknown): void;
  setTitle(title: string): void;
  setSubject(subject: string): void;
  setCreator(creator: string): void;
  setProducer(producer: string): void;
  setLanguage(language: string): void;
  setCreationDate(date: Date): void;
  setModificationDate(date: Date): void;
  save(options?: { useObjectStreams?: boolean }): Promise<Uint8Array>;
}

export const PDFDocument: {
  create(): Promise<PDFDocument>;
};

export function rgb(r: number, g: number, b: number): unknown;
