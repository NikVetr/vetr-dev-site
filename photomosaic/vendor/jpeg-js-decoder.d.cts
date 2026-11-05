// Types for jpeg-js-decoder.cjs (jpeg-js 0.4.4's lib/decoder.js), as far as cli.mjs uses it.
declare function decode(
  jpegData: Uint8Array,
  opts?: { useTArray?: boolean; formatAsRGBA?: boolean; tolerantDecoding?: boolean; maxResolutionInMP?: number; maxMemoryUsageInMB?: number },
): { width: number; height: number; data: Uint8Array };
export = decode;
