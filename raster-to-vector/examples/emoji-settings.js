// A reproducible illustration of colour simplification and contour smoothing.
// The application and landing preview share this named example; core defaults
// remain the original settings in core/request.js.
import { DEFAULTS } from '../core/request.js';

export const EMOJI_GLYPH = '🍥';
export const EMOJI_FONT_PIXELS = 100;
export const EMOJI_JPEG_QUALITY = 0.7;
export const EMOJI_RIM_RGB = [240, 182, 200];
export const EMOJI_SETTINGS = {
  ...structuredClone(DEFAULTS),
  preprocess: { ...DEFAULTS.preprocess, maxDim: 600 },
  quantize: { ...DEFAULTS.quantize, k: 3 },
  smooth: {
    ...DEFAULTS.smooth,
    method: /** @type {'wavelet'} */ ('wavelet'),
    wavelet: { ...DEFAULTS.smooth.wavelet, filter: /** @type {'mb4'} */ ('mb4'), thresholdMultiplier: 8 },
  },
};
