// The discrete Fourier transform of any length, as R's fft() computes it
// (unnormalized; the inverse is not divided by n): radix 2 for powers of two,
// Bluestein's chirp z-transform otherwise.

/**
 * Unnormalized discrete Fourier transform of any length (radix 2, or Bluestein's
 * chirp z-transform for other lengths), forward e^{-2πi kt/n} or inverse e^{+2πi kt/n}.
 * @param {ArrayLike<number>} re @param {ArrayLike<number>} im @param {boolean} inverse
 * @returns {{ re: Float64Array, im: Float64Array }}
 */
export function dft(re, im, inverse) {
  const n = re.length;
  const outRe = Float64Array.from(re);
  const outIm = Float64Array.from(im);
  if ((n & (n - 1)) === 0) {
    fft2(outRe, outIm, inverse);
    return { re: outRe, im: outIm };
  }
  const sign = inverse ? 1 : -1;
  const m = 2 ** Math.ceil(Math.log2(2 * n - 1));
  const wRe = new Float64Array(n);
  const wIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const angle = (Math.PI * ((k * k) % (2 * n))) / n; // k^2 mod 2n keeps the angle exact for large k
    wRe[k] = Math.cos(angle);
    wIm[k] = sign * Math.sin(angle);
  }
  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  for (let k = 0; k < n; k++) {
    // a_k = x_k · w_k, b_k = conj(w_k), w_k = e^{sign·iπk²/n}
    aRe[k] = outRe[k] * wRe[k] - outIm[k] * wIm[k];
    aIm[k] = outRe[k] * wIm[k] + outIm[k] * wRe[k];
  }
  bRe[0] = wRe[0];
  bIm[0] = -wIm[0];
  for (let k = 1; k < n; k++) {
    bRe[k] = bRe[m - k] = wRe[k];
    bIm[k] = bIm[m - k] = -wIm[k];
  }
  fft2(aRe, aIm, false);
  fft2(bRe, bIm, false);
  for (let k = 0; k < m; k++) {
    const r = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = r;
  }
  fft2(aRe, aIm, true);
  for (let k = 0; k < n; k++) {
    const r = aRe[k] / m;
    const i = aIm[k] / m;
    outRe[k] = r * wRe[k] - i * wIm[k];
    outIm[k] = r * wIm[k] + i * wRe[k];
  }
  return { re: outRe, im: outIm };
}

/** In-place iterative radix-2 FFT. @param {Float64Array} re @param {Float64Array} im @param {boolean} inverse */
function fft2(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}
