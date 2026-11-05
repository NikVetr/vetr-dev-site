// R's optimizers, ported line for line so a fit from the same start follows
// the same path: optim(method = "BFGS") with its central-difference gradient
// (vmmin in src/appl/optim.c, fmingr in src/library/stats/src/optim.c), and
// optimize() (Brent_fmin in src/library/stats/src/optimize.c).

/**
 * @typedef {{ par: number[], value: number, fevals: number, gevals: number, convergence: 0 | 1 }} BfgsResult
 */

/**
 * Minimises `fn` from `start` as optim(start, fn, method = "BFGS",
 * control = list(maxit)) does with no gradient function: optim's defaults
 * reltol = sqrt(.Machine$double.eps), abstol = -Inf, ndeps = 1e-3, no
 * parameter or function scaling.
 * @param {(x: number[]) => number} fn
 * @param {number[]} start
 * @param {{ maxit?: number, reltol?: number, abstol?: number, ndeps?: number }} [options]
 * @returns {BfgsResult}
 */
export function bfgs(fn, start, { maxit = 100, reltol = 1.4901161193847656e-8, abstol = -Infinity, ndeps = 1e-3 } = {}) {
  const n = start.length;
  const b = start.slice();
  /** central differences, as fmingr */
  const gradient = (/** @type {number[]} */ p) => {
    const x = p.slice();
    return p.map((pi, i) => {
      x[i] = pi + ndeps;
      const val1 = fn(x);
      x[i] = pi - ndeps;
      const val2 = fn(x);
      x[i] = pi;
      const df = (val1 - val2) / (2 * ndeps);
      if (!Number.isFinite(df)) throw new Error(`non-finite finite-difference value [${i + 1}]`);
      return df;
    });
  };
  if (maxit <= 0) return { par: b, value: fn(b), fevals: 0, gevals: 0, convergence: 0 };

  const stepredn = 0.2;
  const acctol = 0.0001;
  const reltest = 10.0;
  const t = new Array(n).fill(0);
  const X = new Array(n).fill(0);
  const c = new Array(n).fill(0);
  const B = Array.from({ length: n }, () => new Array(n).fill(0));
  let f = fn(b);
  if (!Number.isFinite(f)) throw new Error("initial value in 'vmmin' is not finite");
  let Fmin = f;
  let funcount = 1;
  let gradcount = 1;
  let g = gradient(b);
  let iter = 1;
  let ilast = gradcount;
  let count = 0;

  do {
    if (ilast === gradcount) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < i; j++) B[i][j] = 0;
        B[i][i] = 1;
      }
    }
    for (let i = 0; i < n; i++) {
      X[i] = b[i];
      c[i] = g[i];
    }
    let gradproj = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) s -= B[i][j] * g[j];
      for (let j = i + 1; j < n; j++) s -= B[j][i] * g[j];
      t[i] = s;
      gradproj += s * g[i];
    }

    if (gradproj < 0) { // search direction is downhill
      let steplength = 1.0;
      let accpoint = false;
      do {
        count = 0;
        for (let i = 0; i < n; i++) {
          b[i] = X[i] + steplength * t[i];
          if (reltest + X[i] === reltest + b[i]) count++; // no change
        }
        if (count < n) {
          f = fn(b);
          funcount++;
          accpoint = Number.isFinite(f) && f <= Fmin + gradproj * steplength * acctol;
          if (!accpoint) steplength *= stepredn;
        }
      } while (!(count === n || accpoint));
      const enough = f > abstol && Math.abs(f - Fmin) > reltol * (Math.abs(Fmin) + reltol);
      // stop if value is small or if relative change is low
      if (!enough) {
        count = n;
        Fmin = f;
      }
      if (count < n) { // making progress
        Fmin = f;
        g = gradient(b);
        gradcount++;
        iter++;
        let D1 = 0;
        for (let i = 0; i < n; i++) {
          t[i] = steplength * t[i];
          c[i] = g[i] - c[i];
          D1 += t[i] * c[i];
        }
        if (D1 > 0) {
          let D2 = 0;
          for (let i = 0; i < n; i++) {
            let s = 0;
            for (let j = 0; j <= i; j++) s += B[i][j] * c[j];
            for (let j = i + 1; j < n; j++) s += B[j][i] * c[j];
            X[i] = s;
            D2 += s * c[i];
          }
          D2 = 1.0 + D2 / D1;
          for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) B[i][j] += (D2 * t[i] * t[j] - X[i] * t[j] - t[i] * X[j]) / D1;
          }
        } else { // D1 < 0
          ilast = gradcount;
        }
      } else if (ilast < gradcount) { // no progress
        count = 0;
        ilast = gradcount;
      }
    } else { // uphill search
      count = 0;
      if (ilast === gradcount) count = n;
      else ilast = gradcount;
      // resets unless it has just been reset
    }
    if (iter >= maxit) break;
    if (gradcount - ilast > 2 * n) ilast = gradcount; // periodic restart
  } while (count !== n || ilast !== gradcount);

  return { par: b, value: Fmin, fevals: funcount, gevals: gradcount, convergence: iter < maxit ? 0 : 1 };
}

/**
 * Minimises `f` on [ax, bx] as optimize(f, c(ax, bx), tol = tol) does.
 * @param {(x: number) => number} f
 * @param {number} ax
 * @param {number} bx
 * @param {number} [tol] R's default, .Machine$double.eps^0.25
 */
export function brentMin(f, ax, bx, tol = 2.220446049250313e-16 ** 0.25) {
  const c = (3 - Math.sqrt(5)) * 0.5;
  const eps = Math.sqrt(2.220446049250313e-16);
  let a = ax;
  let b = bx;
  let v = a + c * (b - a);
  let w = v;
  let x = v;
  let d = 0;
  let e = 0;
  let fx = f(x);
  let fv = fx;
  let fw = fx;
  const tol3 = tol / 3;

  for (;;) {
    const xm = (a + b) * 0.5;
    const tol1 = eps * Math.abs(x) + tol3;
    const t2 = tol1 * 2;
    if (Math.abs(x - xm) <= t2 - (b - a) * 0.5) break;
    let p = 0;
    let q = 0;
    let r = 0;
    if (Math.abs(e) > tol1) { // fit parabola
      r = (x - w) * (fx - fv);
      q = (x - v) * (fx - fw);
      p = (x - v) * q - (x - w) * r;
      q = (q - r) * 2;
      if (q > 0) p = -p;
      else q = -q;
      r = e;
      e = d;
    }
    let u;
    if (Math.abs(p) >= Math.abs(q * 0.5 * r) || p <= q * (a - x) || p >= q * (b - x)) { // golden-section step
      e = x < xm ? b - x : a - x;
      d = c * e;
    } else { // parabolic-interpolation step
      d = p / q;
      u = x + d;
      if (u - a < t2 || b - u < t2) { // f must not be evaluated too close to ax or bx
        d = tol1;
        if (x >= xm) d = -d;
      }
    }
    // f must not be evaluated too close to x
    if (Math.abs(d) >= tol1) u = x + d;
    else if (d > 0) u = x + tol1;
    else u = x - tol1;
    const fu = f(u);
    if (fu <= fx) {
      if (u < x) b = x;
      else a = x;
      v = w; w = x; x = u;
      fv = fw; fw = fx; fx = fu;
    } else {
      if (u < x) a = u;
      else b = u;
      if (fu <= fw || w === x) {
        v = w; fv = fw;
        w = u; fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u; fv = fu;
      }
    }
  }
  return x;
}
