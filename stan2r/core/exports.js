import { Stan2RError } from './request.js';
import { validateSimulation, validateOverrides } from './simulation.js';
import { expressionVariables } from './expressions.js';

/** @typedef {import('./model.js').Model} Model */
/** @typedef {import('./model.js').ModelNode} ModelNode */
/** @typedef {import('./expressions.js').Expr} Expr */
/** @typedef {import('./simulation.js').SimulationOptions} SimulationOptions */

/** @param {string} message @returns {never} */
function fail(message) { throw new Stan2RError('EXPORT_ERROR', message); }

const greek = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega']);
/** @param {string} word */
const latexWord = word => greek.has(word) ? `\\${word}` : word.length === 1 || /^\d+$/.test(word) ? word : `\\mathrm{${word.replaceAll('_', '\\_')}}`;
/** @param {string} name */
export function latexName(name) {
  const [base, ...suffix] = name.split('_');
  return latexWord(base) + (suffix.length ? `_{${suffix.map(latexWord).join(',')}}` : '');
}

/** @param {Expr} expr @param {Set<string>} [indexed] @returns {string} */
function latexExpression(expr, indexed = new Set()) {
  switch (expr.kind) {
    case 'number': return String(expr.value);
    case 'variable': return indexed.has(expr.name) ? `{${latexName(expr.name)}}_i` : latexName(expr.name);
    case 'unary': return `${expr.op}\\left(${latexExpression(expr.arg, indexed)}\\right)`;
    case 'binary': {
      const a = latexExpression(expr.left, indexed), b = latexExpression(expr.right, indexed);
      if (expr.op === '/' || expr.op === './') return `\\frac{${a}}{${b}}`;
      if (['^', '.^'].includes(expr.op)) return `\\left(${a}\\right)^{${b}}`;
      return `\\left(${a} ${expr.op === '.*' ? '\\odot' : expr.op === '*' ? '\\cdot' : expr.op} ${b}\\right)`;
    }
    case 'call': {
      const args = expr.args.map(e => latexExpression(e, ['sum', 'mean', 'max', 'min'].includes(expr.name) ? new Set() : indexed));
      if (indexed.size && ['rep_vector', 'rep_row_vector', 'rep_array', 'to_vector'].includes(expr.name)) return args[0];
      if (expr.name === 'sqrt') return `\\sqrt{${args[0]}}`;
      if (expr.name === 'square') return `\\left(${args[0]}\\right)^2`;
      return `\\operatorname{${expr.name.replaceAll('_', '\\_')}}\\!\\left(${args.join(', ')}\\right)`;
    }
    case 'index': return `{${latexExpression(expr.arg)}}_{${expr.indices.map(e => latexExpression(e, expr.gather ? indexed : new Set())).join(',')}}`;
    case 'array': return `\\left[${expr.items.map(e => latexExpression(e, indexed)).join(', ')}\\right]`;
    default: return fail('Unsupported expression in LaTeX export.');
  }
}

/** @param {ModelNode} node @param {SimulationOptions['overrides']} overrides */
export function distributionArgs(node, overrides) {
  return node.distribution?.args.map((arg, index) => {
    const value = overrides?.[node.id]?.args?.[index];
    return value === undefined ? arg : /** @type {Expr} */ ({ kind: 'number', value });
  }) ?? [];
}

/** Bounds on observed data are not predictive truncations. @param {ModelNode} node @param {(e:Expr)=>string} render */
export function support(node, render) {
  const lower = [node.kind === 'stochastic' ? node.bounds.lower : undefined, node.distribution?.lower].filter(e => e !== undefined);
  const upper = [node.kind === 'stochastic' ? node.bounds.upper : undefined, node.distribution?.upper].filter(e => e !== undefined);
  return { lower: lower.map(render), upper: upper.map(render) };
}

/** Model equations for the current exploratory model. @param {Model} model @param {SimulationOptions} [options] */
export function modelEquations(model, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return fail('Export options must be an object.');
  const overrides = validateOverrides(model, options.overrides);
  const vectorNames = new Set(model.nodes.filter(n => n.dimensions.length).map(n => n.id));
  const rows = [];
  for (const id of model.order) {
    const node = model.nodes.find(n => n.id === id);
    if (!node) return fail(`Unknown graph node: ${id}`);
    const fixed = overrides[node.id]?.fixed;
    const indexed = node.dimensions.length ? vectorNames : new Set();
    const name = node.dimensions.length ? `{${latexName(node.id)}}_i` : latexName(node.id);
    const plate = node.dimensions.length ? `,\\quad i=1,\\ldots,${latexExpression(node.dimensions[0])}` : '';
    const render = (/** @type {Expr} */ e) => latexExpression(e, indexed);
    if (fixed !== undefined) {
      const value = Array.isArray(fixed) ? `\\left[${fixed.join(', ')}\\right]_i` : String(fixed);
      rows.push(`${name} &:= ${value}${plate}\\quad \\text{fixed intervention}`);
    } else if (node.distribution) {
      const argumentsLatex = distributionArgs(node, overrides).map(render);
      // Mathematical N(mu, variance) differs from Stan normal(mu, SD).
      if (node.distribution.name === 'normal') argumentsLatex[1] = `\\left(${argumentsLatex[1]}\\right)^2`;
      const args = argumentsLatex.join(', ');
      const family = node.distribution.name === 'normal' ? '\\mathcal{N}' : `\\operatorname{${node.distribution.name.replaceAll('_', '\\_')}}`;
      const { lower, upper } = support(node, render);
      const lo = lower.length > 1 ? `\\max\\left(${lower.join(',')}\\right)` : lower[0] ?? '-\\infty';
      const hi = upper.length > 1 ? `\\min\\left(${upper.join(',')}\\right)` : upper[0] ?? '\\infty';
      const truncated = lower.length || upper.length ? `\\big|_{[${lo},${hi}]}` : '';
      const dependencies = new Set([...distributionArgs(node, overrides), ...node.dimensions, ...Object.values(node.bounds), ...[node.distribution.lower,node.distribution.upper].filter(e => e !== undefined)].flatMap(expressionVariables));
      const parents = node.parents.filter(parent => dependencies.has(parent) && model.nodes.some(n => n.id === parent && n.kind !== 'input'));
      const given = parents.length ? ` \\mid ${parents.map(latexName).join(', ')}` : '';
      rows.push(`${name}${given} &\\sim ${family}\\!\\left(${args}\\right)${truncated}${plate}`);
    } else if (node.expression) {
      const lhs = node.dimensions.length ? `\\boldsymbol{${latexName(node.id)}}` : name;
      rows.push(`${lhs} &= ${latexExpression(node.expression)}`);
    } else {
      const lhs = node.dimensions.length ? `\\boldsymbol{${latexName(node.id)}}` : name;
      const shape = node.dimensions.length ? `,\\quad \\dim=${latexExpression(node.dimensions[0])}` : '';
      rows.push(`${lhs} &\\quad \\text{given data}${shape}`);
    }
  }
  return rows.map((latex, index) => ({ id: model.order[index], latex }));
}

/** Model equations for download. @param {Model} model @param {SimulationOptions} [options] */
export function exportLatex(model, options = {}) {
  const rows = modelEquations(model, options).map(row => row.latex);
  const overrides = options.overrides ?? {};
  return `% Generated by Stan Studio from the supported generative graph.\n% Requires the amsmath package.\n% Normal is written as N(mean, variance); other distribution parameters use Stan conventions (gamma: shape, rate).\n${Object.keys(overrides).length ? '% EXPLORATORY OVERRIDES: changed arguments/fixed interventions alter the original model; this is not posterior conditioning.\n' : ''}\\[\n\\begin{aligned}\n${rows.join(' \\\\\n')}\n\\end{aligned}\n\\]\n`;
}

/** @param {Expr} expr @param {boolean} [symbolic] @returns {string} */
export function pythonExpression(expr, symbolic = false) {
  const emit = (/** @type {Expr} */ child) => pythonExpression(child, symbolic);
  const namespace = symbolic ? 'pt' : 'np';
  switch (expr.kind) {
    case 'number': return String(expr.value);
    case 'variable': return `v[${JSON.stringify(expr.name)}]`;
    case 'unary': return `(${expr.op}${emit(expr.arg)})`;
    case 'binary': return `(${emit(expr.left)} ${{ '^': '**', '.^': '**', '.*': '*', './': '/' }[expr.op] ?? expr.op} ${emit(expr.right)})`;
    case 'array': return `${symbolic ? 'pt.stack' : 'np.asarray'}([${expr.items.map(emit).join(', ')}])`;
    case 'index': return `${emit(expr.arg)}[${expr.indices.map(e => `_index(${pythonExpression(e)}, gather=${expr.gather ? 'True' : 'False'})`).join(', ')}]`;
    case 'call': {
      const args = expr.args.map(emit);
      const simple = { exp: 'np.exp', log: 'np.log', log1p: 'np.log1p', expm1: 'np.expm1', sqrt: 'np.sqrt', square: 'np.square', fabs: 'np.abs', abs: 'np.abs', pow: 'np.power', sum: 'np.sum', mean: 'np.mean', fmin: 'np.minimum', fmax: 'np.maximum', max: 'np.max', min: 'np.min' };
      if (expr.name in simple) return `${simple[/** @type {keyof typeof simple} */ (expr.name)].replace('np.', `${namespace}.`)}(${args.join(', ')})`;
      if (expr.name === 'inv_logit') return `${symbolic ? 'pt.sigmoid' : '_inv_logit'}(${args[0]})`;
      if (expr.name === 'logit') return `(${namespace}.log(${args[0]}) - ${namespace}.log1p(-(${args[0]})))`;
      if (expr.name === 'inv') return `(1.0 / (${args[0]}))`;
      if (['rep_vector', 'rep_row_vector', 'rep_array'].includes(expr.name)) return `${namespace}.full((_dimension(${pythonExpression(expr.args[1])}),), ${args[0]})`;
      if (expr.name === 'to_vector') return `${symbolic ? 'pt.as_tensor_variable' : 'np.asarray'}(${args[0]}).reshape((-1,))`;
      return fail(`Python export does not support function ${expr.name}.`);
    }
    default: return fail('Unsupported expression in Python export.');
  }
}

/** @param {string} name @param {string[]} args */
function pythonRandom(name, args) {
  const [a, b, c] = args;
  switch (name) {
    case 'normal': return `rng.normal(${a}, ${b}, size=shape)`;
    case 'lognormal': return `rng.lognormal(${a}, ${b}, size=shape)`;
    case 'exponential': return `rng.exponential(1.0 / (${a}), size=shape)`;
    case 'gamma': return `rng.gamma(${a}, 1.0 / (${b}), size=shape)`;
    case 'beta': return `_beta(rng, ${a}, ${b}, shape)`;
    case 'uniform': return `rng.uniform(${a}, ${b}, size=shape)`;
    case 'student_t': return `((${b}) + (${c}) * rng.standard_t(${a}, size=shape))`;
    case 'cauchy': return `((${a}) + (${b}) * rng.standard_cauchy(size=shape))`;
    case 'bernoulli': return `rng.binomial(1, ${a}, size=shape)`;
    case 'bernoulli_logit': return `rng.binomial(1, _inv_logit(${a}), size=shape)`;
    case 'binomial': return `rng.binomial(_integer(${a}), ${b}, size=shape)`;
    case 'beta_binomial': return `rng.binomial(_integer(${a}), _beta(rng, ${b}, ${c}, shape), size=shape)`;
    case 'poisson': return `rng.poisson(${a}, size=shape)`;
    case 'poisson_log': return `rng.poisson(np.exp(${a}), size=shape)`;
    default: return fail(`Python export does not support distribution ${name}.`);
  }
}

// Standalone NumPy helpers deliberately validate inputs rather than relying on broadcasting
// to conceal incorrect vector lengths or allowing zero-SD "normal" draws.
export const pythonNumericHelpers = `
def _numeric(value):
    value = np.asarray(value)
    if value.dtype.kind not in "iuf":
        if value.dtype.kind != "O" or not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in value.flat):
            raise ValueError("Expected numeric values")
    return value.astype(float)


def _dimension(value):
    value = _numeric(value)
    if value.ndim or not np.isfinite(value) or value < 0 or value != np.floor(value):
        raise ValueError("Dimensions must be nonnegative integers")
    return int(value)


def _integer(value):
    value = _numeric(value)
    if not np.all(np.isfinite(value)) or not np.all(value == np.floor(value)):
        raise ValueError("Expected integers")
    if np.any((value < -2147483648) | (value > 2147483647)):
        raise ValueError("Expected 32-bit Stan integers")
    return value.astype(np.int64)


def _index(value, gather=False):
    value = _integer(value)
    if value.ndim != (1 if gather else 0):
        raise ValueError("Index shape does not match the Stan selector")
    if np.any(value < 1):
        raise ValueError("Stan indexes start at 1")
    return value - 1


def _inv_logit(value):
    value = np.asarray(value)
    return np.exp(-np.logaddexp(0, -value))


def _checked(value, shape, name, integer=False, lower=None, upper=None, broadcast=False):
    value = _numeric(value)
    if broadcast and value.ndim == 0:
        value = np.full(shape, value)
    if value.shape != shape:
        raise ValueError(f"{name}: expected shape {shape}, got {value.shape}")
    if not np.all(np.isfinite(value)):
        raise ValueError(f"{name}: non-finite value")
    if integer:
        value = _integer(value)
    if lower is not None and np.any(value < lower):
        raise ValueError(f"{name}: below declared lower bound")
    if upper is not None and np.any(value > upper):
        raise ValueError(f"{name}: above declared upper bound")
    return value

`;

const pythonSamplingHelpers = `
def _args(name, args, shape):
    args = [_numeric(a) for a in args]
    for a in args:
        if a.shape not in [(), shape] or not np.all(np.isfinite(a)):
            raise ValueError(f"{name}: invalid argument shape or value")
    positive = {"normal": [1], "lognormal": [1], "exponential": [0],
                "gamma": [0, 1], "beta": [0, 1], "beta_binomial": [1, 2], "student_t": [0, 2], "cauchy": [1]}
    for index in positive.get(name, []):
        if np.any(args[index] <= 0):
            raise ValueError(f"{name}: argument {index + 1} must be positive; use a fixed intervention for zero spread")
    if name == "uniform" and np.any(args[0] >= args[1]):
        raise ValueError("uniform: lower must be less than upper")
    if name in ["bernoulli", "binomial"]:
        p = args[-1]
        if np.any((p < 0) | (p > 1)):
            raise ValueError(f"{name}: probability must be in [0, 1]")
    if name in ["binomial", "beta_binomial", "poisson"] and np.any(args[0] < 0):
        raise ValueError(f"{name}: first argument must be nonnegative")
    return args


def _beta(rng, alpha, beta, shape):
    # Stable gamma ratio avoids overflow in NumPy beta for very large shapes.
    u = rng.gamma(alpha, 1.0, size=shape)
    v = rng.gamma(beta, 1.0, size=shape)
    if not np.all(np.isfinite(u)) or not np.all(np.isfinite(v)) or np.any(u <= 0) or np.any(v <= 0):
        raise ValueError("beta: gamma draws overflowed or underflowed")
    ratio = np.minimum(u, v) / np.maximum(u, v)
    return np.where(u >= v, 1.0 / (1.0 + ratio), ratio / (1.0 + ratio))


def _sample(draw, shape, lower, upper, name):
    if lower is not None and upper is not None and np.any(lower > upper):
        raise ValueError(f"{name}: empty truncation interval")
    result = np.zeros(shape)
    missing = np.ones(shape, dtype=bool)
    for _ in range(10000):
        candidate = np.asarray(draw())
        if not np.all(np.isfinite(candidate)):
            raise ValueError(f"{name}: non-finite random draw")
        accepted = np.ones(shape, dtype=bool)
        if lower is not None:
            accepted &= candidate >= lower
        if upper is not None:
            accepted &= candidate <= upper
        take = missing & accepted
        result = np.where(take, candidate, result)
        missing &= ~take
        if not np.any(missing):
            return result
    raise ValueError(f"{name}: rejection sampler exceeded 10000 attempts; no draws returned")
`;

/** Generate standalone, editable NumPy prior predictive simulation (not a fitting model).
 * @param {Model} model @param {SimulationOptions} [options]
 */
export function exportPython(model, options = {}) {
  const { data, draws, seed, overrides } = validateSimulation(model, options);
  const emit = (/** @type {Expr} */ expr) => pythonExpression(expr);
  const checks = [];
  for (const node of model.nodes.filter(n => n.block === 'data')) {
    const name = JSON.stringify(node.id);
    const dimensions = node.dimensions.map(d => `_dimension(${emit(d)})`);
    checks.push(`    if ${name} in dat:`, `        shape = (${dimensions.join(', ')}${dimensions.length === 1 ? ',' : ''})`, `        _checked(dat[${name}], shape, ${name}, integer=${node.type === 'int' ? 'True' : 'False'}, lower=${node.bounds.lower ? emit(node.bounds.lower) : 'None'}, upper=${node.bounds.upper ? emit(node.bounds.upper) : 'None'})`);
    if (node.kind === 'input') checks.push('    else:', `        raise ValueError(${JSON.stringify(`Missing required data: ${node.id}`)})`);
  }
  const lines = [];
  for (const id of model.order) {
    const node = model.nodes.find(n => n.id === id);
    if (!node) return fail(`Unknown graph node: ${id}`);
    const name = JSON.stringify(id);
    const dimensions = node.dimensions.map(d => `_dimension(${emit(d)})`);
    lines.push(`        # ${node.block}: ${node.id}`, `        shape = (${dimensions.join(', ')}${dimensions.length === 1 ? ',' : ''})`);
    if (node.dimensions.length && ['stochastic', 'observed'].includes(node.kind)) lines.push('        if shape[0] == 0:', `            raise ValueError(${JSON.stringify(`${id}: zero-size stochastic variables are not supported`)})`);
    const lower = node.bounds.lower ? emit(node.bounds.lower) : 'None';
    const upper = node.bounds.upper ? emit(node.bounds.upper) : 'None';
    const integer = node.type === 'int' ? 'True' : 'False';
    const fixed = overrides[id]?.fixed;
    if (fixed !== undefined) {
      lines.push(`        v[${name}] = _checked(${JSON.stringify(fixed)}, shape, ${name}, integer=${integer}, lower=${lower}, upper=${upper}, broadcast=True)`);
    } else if (node.distribution) {
      const args = distributionArgs(node, overrides).map(emit);
      lines.push(`        args = _args(${JSON.stringify(node.distribution.name)}, [${args.join(', ')}], shape)`);
      const bounds = support(node, emit);
      const lo = bounds.lower.length > 1 ? `np.maximum(${bounds.lower.join(', ')})` : bounds.lower[0] ?? 'None';
      const hi = bounds.upper.length > 1 ? `np.minimum(${bounds.upper.join(', ')})` : bounds.upper[0] ?? 'None';
      const call = pythonRandom(node.distribution.name, args.map((_, index) => `args[${index}]`));
      lines.push(`        v[${name}] = _checked(_sample(lambda: ${call}, shape, ${lo}, ${hi}, ${name}), shape, ${name}, integer=${integer})`);
    } else if (node.expression) {
      lines.push(`        v[${name}] = _checked(${emit(node.expression)}, shape, ${name}, integer=${integer}, lower=${lower}, upper=${upper})`);
    } else {
      lines.push(`        if ${name} not in dat:`, `            raise ValueError(${JSON.stringify(`Missing required data: ${id}`)})`, `        v[${name}] = _checked(dat[${name}], shape, ${name}, integer=${integer})`);
    }
  }
  return `# Generated by Stan Studio: NumPy prior predictive Monte Carlo, not posterior fitting.\n# Requires NumPy. All distribution arguments retain Stan parameterizations.\n# Supplied observations are validated, then regenerated from the likelihood.\n# NumPy and the browser use different RNG streams; seeds are reproducible within each.\n${Object.keys(overrides).length ? '# EXPLORATORY OVERRIDES: changed arguments/fixed interventions alter the original model.\n# This is not posterior conditioning.\n' : ''}import json\nimport numpy as np\n\nDEFAULT_DATA = json.loads(${JSON.stringify(JSON.stringify(data))})\nDEFAULT_DRAWS = ${draws}\nDEFAULT_SEED = ${seed}\n${pythonNumericHelpers}\n${pythonSamplingHelpers}\n\ndef simulate(dat, draws=DEFAULT_DRAWS, seed=DEFAULT_SEED):\n    """Return arrays indexed by [draw, flattened element] for every declared variable."""\n    if isinstance(draws, bool) or not isinstance(draws, int) or draws < 1:\n        raise ValueError("draws must be a positive integer")\n    # Validate original observations separately from replicated predictions.\n    v = {name: _numeric(value) for name, value in dat.items()}\n${checks.join('\n')}\n    rng = np.random.default_rng(seed)\n    samples = {name: [] for name in ${JSON.stringify(model.nodes.map(n => n.id))}}\n    with np.errstate(over="raise", divide="raise", invalid="raise"):\n      for _ in range(draws):\n        v = {}\n${lines.join('\n')}\n        for name in samples:\n            samples[name].append(np.asarray(v[name]).reshape(-1).copy())\n    return {name: np.asarray(values) for name, values in samples.items()}\n\n\nif __name__ == "__main__":\n    out = simulate(DEFAULT_DATA)\n    print(json.dumps({name: {"mean": values.mean(axis=0).tolist(),\n                             "sd": values.std(axis=0).tolist()}\n                      for name, values in out.items()}, indent=2))\n`;
}
