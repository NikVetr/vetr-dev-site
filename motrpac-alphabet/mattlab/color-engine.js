/* Perceptual color controls for Cardinal Studio; no external dependencies.
 *
 * OKLab matrices: Björn Ottosson, public-domain reference implementation
 * https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
 * Terminology / polar coordinates: https://www.w3.org/TR/css-color-4/#ok-lab
 *
 * L is perceived lightness, not relative luminance Y. Before 8-bit encoding,
 * gamut mapping reduces C at fixed L and h until the color is inside sRGB.
 * This intentionally uses strict chroma reduction, not CSS local-MINDE.
 */
(function (global) {
  'use strict';

  const CARDINAL = '#8C1515';
  const MODES = Object.freeze(['perceptual', 'chroma', 'lightness', 'reference']);
  const DEG = Math.PI / 180;
  const GAMUT_EPSILON = 1e-8;
  const NEUTRAL_EPSILON = 1e-6;
  const clamp = function (value, low, high) { return Math.min(high, Math.max(low, value)); };
  const wrapHue = function (value) { return ((value % 360) + 360) % 360; };
  const finite = function (value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  function normalizeHex(value) {
    if (typeof value !== 'string') throw new Error('A solid hex color is required.');
    const hex = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      return '#' + Array.from(hex.slice(1)).map(function (char) { return char + char; }).join('').toUpperCase();
    }
    throw new Error('Use a solid color in #RRGGBB or #RGB form.');
  }

  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(value) {
    return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }
  function hexToLinearRgb(value) {
    const hex = normalizeHex(value);
    return [1, 3, 5].map(function (offset) {
      return srgbToLinear(parseInt(hex.slice(offset, offset + 2), 16) / 255);
    });
  }
  function linearRgbToHex(rgb) {
    // Values are already in gamut; clamping only absorbs matrix/boundary noise.
    return '#' + rgb.map(function (value) {
      return Math.round(clamp(linearToSrgb(value), 0, 1) * 255).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }
  function linearRgbToOklab(rgb) {
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      L:0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      a:1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      b:0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    };
  }
  function oklabToLinearRgb(lab) {
    const l = Math.pow(lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b, 3);
    const m = Math.pow(lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b, 3);
    const s = Math.pow(lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }
  function oklabToOklch(lab) {
    const C = Math.hypot(lab.a, lab.b);
    return {L:lab.L, C:C < NEUTRAL_EPSILON ? 0 : C,
      h:C < NEUTRAL_EPSILON ? 0 : wrapHue(Math.atan2(lab.b, lab.a) / DEG)};
  }
  function hexToOklch(hex) { return oklabToOklch(linearRgbToOklab(hexToLinearRgb(hex))); }
  function oklchToLinearRgb(lch) {
    return oklabToLinearRgb({L:lch.L, a:lch.C * Math.cos(lch.h * DEG), b:lch.C * Math.sin(lch.h * DEG)});
  }
  function isInGamut(rgb) {
    return rgb.every(function (value) {
      return Number.isFinite(value) && value >= -GAMUT_EPSILON && value <= 1 + GAMUT_EPSILON;
    });
  }
  function checkedLch(value) {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.L) || !Number.isFinite(value.C) ||
      (value.h !== undefined && !Number.isFinite(value.h))) {
      throw new Error('OKLCH needs finite L, C, and h coordinates.');
    }
    return {L:clamp(value.L, 0, 1), C:clamp(value.C, 0, 2), h:wrapHue(value.h === undefined ? 0 : value.h)};
  }
  function relativeLuminance(hex) {
    const rgb = hexToLinearRgb(hex);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  function mapToSrgb(value) {
    const requested = checkedLch(value);
    const mapped = {L:requested.L, C:requested.C, h:requested.h};
    let rgb;
    if (mapped.L <= 0 || mapped.L >= 1) {
      mapped.C = 0;
      rgb = [mapped.L, mapped.L, mapped.L];
    } else {
      rgb = oklchToLinearRgb(mapped);
      if (!isInGamut(rgb)) {
        let low = 0, high = mapped.C;
        for (let step = 0; step < 32; step += 1) {
          const middle = (low + high) / 2;
          const candidate = oklchToLinearRgb({L:mapped.L, C:middle, h:mapped.h});
          if (isInGamut(candidate)) low = middle;
          else high = middle;
        }
        mapped.C = low;
        rgb = oklchToLinearRgb(mapped);
      }
    }
    const hex = linearRgbToHex(rgb);
    return {
      hex:hex,
      requested:requested,
      mapped:mapped,
      actual:hexToOklch(hex),
      gamutReduced:requested.C - mapped.C > 1e-7,
      relativeLuminance:relativeLuminance(hex)
    };
  }
  function oklchToHex(value) { return mapToSrgb(value).hex; }

  const CARDINAL_OKLCH = Object.freeze(hexToOklch(CARDINAL));
  const DEFAULTS = Object.freeze({
    mode:'perceptual',
    lightness:CARDINAL_OKLCH.L,
    lightnessRange:0.18,
    chroma:1,
    chromaRange:0.35,
    hueShift:0
  });
  const RANGES = Object.freeze({
    lightness:Object.freeze([0, 1]),
    lightnessRange:Object.freeze([0, 0.45]),
    chroma:Object.freeze([0, 3]),
    chromaRange:Object.freeze([0, 1]),
    hueShift:Object.freeze([-180, 180])
  });

  function normalizeConfig(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {mode:MODES.includes(source.mode) ? source.mode : DEFAULTS.mode};
    Object.keys(RANGES).forEach(function (key) {
      result[key] = clamp(finite(source[key], DEFAULTS[key]), RANGES[key][0], RANGES[key][1]);
    });
    return result;
  }
  function columnParameters(value) {
    const config = normalizeConfig(value);
    const varyL = config.mode !== 'chroma';
    const varyC = config.mode !== 'lightness';
    return {
      lightness:[-1, 0, 1].map(function (direction) {
        return clamp(config.lightness + (varyL ? direction * config.lightnessRange : 0), 0, 1);
      }),
      chromaFactors:[-1, 0, 1].map(function (direction) {
        return config.chroma * Math.max(0, 1 + (varyC ? direction * config.chromaRange : 0));
      }),
      labels:config.mode === 'chroma' ? ['Muted', 'Medium', 'Vivid'] : ['Dark', 'Medium', 'Light']
    };
  }
  function columnLabels(config) { return columnParameters(config).labels; }
  function checkedFamily(family) {
    if (!family || typeof family !== 'object' || typeof family.id !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(family.id) || typeof family.name !== 'string' ||
      !Array.isArray(family.colors) || family.colors.length !== 3) {
      throw new Error('A color family needs an identifier, name, and three solid hex colors.');
    }
    return {id:family.id, name:family.name, colors:family.colors.map(normalizeHex)};
  }
  function buildPalettes(seedFamilies, value) {
    if (!Array.isArray(seedFamilies) || seedFamilies.length > 256) throw new Error('Choose a valid array of color families.');
    const config = normalizeConfig(value);
    const columns = columnParameters(config);
    return seedFamilies.map(function (family) {
      const seed = checkedFamily(family);
      const base = hexToOklch(seed.colors[1]);
      let meta;
      if (config.mode === 'reference') {
        meta = seed.colors.map(function (hex) {
          const lch = hexToOklch(hex);
          return {hex:hex, requested:lch, mapped:lch, actual:lch, gamutReduced:false,
            relativeLuminance:relativeLuminance(hex)};
        });
      } else {
        meta = [0, 1, 2].map(function (column) {
          return mapToSrgb({L:columns.lightness[column], C:base.C * columns.chromaFactors[column],
            h:base.C === 0 ? 0 : wrapHue(base.h + config.hueShift)});
        });
      }
      return {
        id:seed.id,
        name:seed.name,
        colors:meta.map(function (tone) { return tone.hex; }),
        seed:seed.colors[1],
        sourceColors:seed.colors.slice(),
        meta:meta
      };
    });
  }
  function paletteStats(families) {
    if (!Array.isArray(families) || !families.length) return {columns:[], gamutReduced:0};
    const columns = [0, 1, 2].map(function (column) {
      const values = families.map(function (family) { return hexToOklch(family.colors[column]); });
      const lightness = values.map(function (lch) { return lch.L; });
      const chroma = values.map(function (lch) { return lch.C; });
      return {
        lightnessMin:Math.min.apply(null, lightness),
        lightnessMax:Math.max.apply(null, lightness),
        lightnessSpread:Math.max.apply(null, lightness) - Math.min.apply(null, lightness),
        chromaMin:Math.min.apply(null, chroma),
        chromaMax:Math.max.apply(null, chroma)
      };
    });
    return {
      columns:columns,
      gamutReduced:families.reduce(function (count, family) {
        return count + (family.meta || []).filter(function (tone) { return tone.gamutReduced; }).length;
      }, 0)
    };
  }

  const API = Object.freeze({
    CARDINAL:CARDINAL, CARDINAL_OKLCH:CARDINAL_OKLCH, DEFAULTS:DEFAULTS, RANGES:RANGES, MODES:MODES,
    normalizeHex:normalizeHex, normalizeConfig:normalizeConfig, hexToOklch:hexToOklch,
    oklchToHex:oklchToHex, mapToSrgb:mapToSrgb, isInGamut:isInGamut,
    hexToLinearRgb:hexToLinearRgb, linearRgbToOklab:linearRgbToOklab,
    oklabToLinearRgb:oklabToLinearRgb, oklchToLinearRgb:oklchToLinearRgb,
    relativeLuminance:relativeLuminance, buildPalettes:buildPalettes,
    columnParameters:columnParameters, columnLabels:columnLabels, paletteStats:paletteStats
  });
  global.PainterColor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
