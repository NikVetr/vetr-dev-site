// The browser's laser layout preference. Core/CLI defaults retain the original R style.
import { DEFAULT_STYLE } from './core/request.js';

export const BALANCED_STYLE = Object.freeze({
  degree_name_overlap: 0.8,
  optimizer: Object.freeze({
    // Leave room for short or unequal lines: overly narrow width/twist
    // preferences can collapse the lower line or eliminate every whole twist.
    ratio_mean_b2b3_w: 0.2, ratio_sd_b2b3_w: 0.2,
    ratio_mean_b1_b2b3_w: 0.98, ratio_sd_b1_b2b3_w: 0.025,
    sd_ntwists: 0.7,
  }),
});

// The angled-corners design's proportions: the R drawer's "rethink_priorities" group
// settings, which keep the top line about three quarters of the bottom row's width so
// the corner can turn down beside it.
export const CORNERS_STYLE = Object.freeze({
  degree_name_overlap: DEFAULT_STYLE.degree_name_overlap,
  optimizer: Object.freeze({
    ratio_mean_b2b3_w: 0.5, ratio_sd_b2b3_w: 0.5,
    ratio_mean_b1_b2b3_w: 0.75, ratio_sd_b1_b2b3_w: DEFAULT_STYLE.optimizer.ratio_sd_b1_b2b3_w,
    sd_ntwists: DEFAULT_STYLE.optimizer.sd_ntwists,
  }),
});

/** @type {Record<string, {degree_name_overlap: number, optimizer: Record<string, number>}>} */
export const LAYOUT_PRESETS = {
  balanced: BALANCED_STYLE,
  original: {
    degree_name_overlap: DEFAULT_STYLE.degree_name_overlap,
    optimizer: Object.fromEntries(Object.keys(BALANCED_STYLE.optimizer).map(key => [key, DEFAULT_STYLE.optimizer[/** @type {keyof typeof BALANCED_STYLE.optimizer} */ (key)]])),
  },
  corners: CORNERS_STYLE,
};
