// Phylogenetic trees for the gallery's two tree entries: a small rooted-tree type, seeded
// pure-birth (Yule) trees, Newick reading and writing, rectangular and fan layouts, the
// tips' Brownian-motion covariance, Felsenstein's independent contrasts (the pruning
// algorithm) and re-rooting. It stands in for the parts of ape and phytools the original
// R scripts used. No DOM access.

/**
 * A rooted tree as arrays over its nodes; node 0 is the root and parent[0] is −1.
 * length[i] is the branch above node i, and length[0] the root edge (0 when there is
 * none). children[i] lists node i's children in drawing order, none for a tip; label[i]
 * is its name or null. A node may have a single child: a bend in a branch, as the old
 * root becomes when a tree is re-rooted.
 * @typedef {{ parent: number[], children: number[][], length: number[], label: (string | null)[] }} Tree
 */

/**
 * A Newick text that cannot be read; `position` is the 0-based character where reading
 * stopped.
 */
export class NewickError extends Error {
  /** @param {string} message @param {number} position */
  constructor(message, position) {
    super(message);
    this.name = 'NewickError';
    this.position = position;
  }
}

// ---------- Traversal ----------

/** @param {Tree} tree @param {number} node */
export const isTip = (tree, node) => tree.children[node].length === 0;

/** Every node, each before its children, children in drawing order. @param {Tree} tree */
export function preorder(tree) {
  const order = [];
  const stack = [0];
  while (stack.length) {
    const node = /** @type {number} */ (stack.pop());
    order.push(node);
    for (let k = tree.children[node].length - 1; k >= 0; k--) stack.push(tree.children[node][k]);
  }
  return order;
}

/** Every node, each after its children, left to right. @param {Tree} tree */
export function postorder(tree) {
  const order = [];
  /** @type {[number, number][]} */
  const stack = [[0, 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const kids = tree.children[top[0]];
    if (top[1] < kids.length) stack.push([kids[top[1]++], 0]);
    else order.push(/** @type {[number, number]} */ (stack.pop())[0]);
  }
  return order;
}

/** The tips in drawing order (top to bottom of a rectangular layout). @param {Tree} tree */
export const tipNodes = (tree) => preorder(tree).filter((node) => isTip(tree, node));

/**
 * Each node's distance from the base of the root edge, so the root sits at its root
 * edge's length.
 * @param {Tree} tree
 */
export function heights(tree) {
  const h = new Array(tree.parent.length).fill(0);
  for (const node of preorder(tree)) h[node] = (node === 0 ? 0 : h[tree.parent[node]]) + tree.length[node];
  return h;
}

/** Each node's tips, in drawing order. @param {Tree} tree */
export function tipsBelow(tree) {
  /** @type {number[][]} */
  const below = tree.parent.map(() => []);
  for (const node of postorder(tree)) below[node] = isTip(tree, node) ? [node] : tree.children[node].flatMap((c) => below[c]);
  return below;
}

// ---------- Pure-birth trees ----------

/** Labels A, B, …, Z, AA, AB, … for the kth tip (0-based). @param {number} k */
export function tipLabel(k) {
  let label = '';
  for (let i = k + 1; i > 0; i = Math.floor((i - 1) / 26)) label = String.fromCharCode(65 + ((i - 1) % 26)) + label;
  return label;
}

/**
 * A pure-birth tree with n ≥ 2 tips, as phytools' pbtree(n = n, b = birth): two lineages
 * leave the root; with k lineages the wait to the next split is exponential with rate
 * k·birth and a lineage chosen uniformly splits; after the nth lineage appears the tips
 * grow for one more such wait, at rate n·birth. Tips are labelled A, B, C, … in drawing
 * order.
 * @param {number} n @param {() => number} rng uniform on [0, 1) @param {number} [birth]
 * @returns {Tree}
 */
export function yule(n, rng, birth = 1) {
  const tree = { parent: [-1, 0, 0], children: [[1, 2], [], []], length: [0, 0, 0], label: /** @type {(string | null)[]} */ ([null, null, null]) };
  const active = [1, 2];
  const grow = (/** @type {number} */ rate) => {
    const wait = -Math.log(1 - rng()) / rate;
    for (const node of active) tree.length[node] += wait;
  };
  for (let k = 2; k < n; k++) {
    grow(k * birth);
    const pick = Math.floor(rng() * k);
    const node = active[pick];
    const first = tree.parent.length;
    tree.parent.push(node, node);
    tree.children.push([], []);
    tree.length.push(0, 0);
    tree.label.push(null, null);
    tree.children[node] = [first, first + 1];
    active.splice(pick, 1, first, first + 1);
  }
  grow(n * birth);
  tipNodes(tree).forEach((node, k) => { tree.label[node] = tipLabel(k); });
  return tree;
}

/** The same tree with every branch, root edge included, multiplied by k. @param {Tree} tree @param {number} k */
export const scaleTree = (tree, k) => ({ ...tree, length: tree.length.map((l) => l * k) });

// ---------- Newick ----------

/**
 * Reads a Newick tree: nested (a,b,…) groups, each node with an optional label (bare, or
 * in single quotes with '' for a quote) and an optional :length; a length after the outer
 * group is the root edge. Comments in [ ] and whitespace between tokens are skipped. A
 * branch without a length gets NaN, so callers decide whether lengths are required.
 * Throws a NewickError.
 * @param {string} text
 * @returns {Tree}
 */
export function parseNewick(text) {
  /** @type {Tree} */
  const tree = { parent: [], children: [], length: [], label: [] };
  let at = 0;
  const skip = () => {
    for (;;) {
      while (at < text.length && /\s/.test(text[at])) at++;
      if (text[at] !== '[') return;
      const close = text.indexOf(']', at);
      if (close < 0) throw new NewickError('a comment opened with [ is never closed', at);
      at = close + 1;
    }
  };
  const label = () => {
    skip();
    if (text[at] === "'") {
      let out = '';
      for (at++; ; at++) {
        if (at >= text.length) throw new NewickError('a quoted label is never closed', at);
        if (text[at] === "'") {
          if (text[at + 1] !== "'") break;
          at++;
        }
        out += text[at];
      }
      at++;
      return out;
    }
    const start = at;
    while (at < text.length && !/[\s()[\]',:;]/.test(text[at])) at++;
    return at > start ? text.slice(start, at) : null;
  };
  const branchLength = () => {
    skip();
    if (text[at] !== ':') return NaN;
    at++;
    skip();
    const match = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(at));
    if (!match) throw new NewickError('expected a number after ":"', at);
    at += match[0].length;
    return Number(match[0]);
  };
  /** @param {number} parent @returns {number} */
  const node = (parent) => {
    const id = tree.parent.length;
    tree.parent.push(parent);
    tree.children.push([]);
    tree.length.push(NaN);
    tree.label.push(null);
    if (parent >= 0) tree.children[parent].push(id);
    skip();
    if (text[at] === '(') {
      do {
        at++;
        node(id);
        skip();
      } while (text[at] === ',');
      if (text[at] !== ')') throw new NewickError(at >= text.length ? 'the text ends before every "(" is closed' : `expected "," or ")" but found "${text[at]}"`, at);
      at++;
    }
    tree.label[id] = label();
    tree.length[id] = branchLength();
    return id;
  };
  skip();
  if (at >= text.length) throw new NewickError('the text is empty', 0);
  node(-1);
  skip();
  if (text[at] !== ';') throw new NewickError(at >= text.length ? 'a Newick tree ends with ";"' : `expected ";" but found "${text[at]}"`, at);
  at++;
  skip();
  if (at < text.length) throw new NewickError('there is text after the closing ";"; give one tree', at);
  if (Number.isNaN(tree.length[0])) tree.length[0] = 0;
  return tree;
}

/** A label as Newick writes it, quoted when it has a character Newick reserves. @param {string} label */
const newickLabel = (label) => (/^[^\s()[\]',:;]+$/.test(label) ? label : `'${label.replace(/'/g, "''")}'`);

/**
 * The tree as Newick, lengths in JavaScript's shortest round-trip form (or to `digits`
 * significant digits), and the root edge only when it is not 0.
 * @param {Tree} tree @param {number} [digits]
 */
export function writeNewick(tree, digits) {
  const number = (/** @type {number} */ v) => String(digits ? Number(v.toPrecision(digits)) : v);
  /** @param {number} node @returns {string} */
  const write = (node) => {
    const kids = tree.children[node];
    const inner = kids.length ? `(${kids.map(write).join(',')})` : '';
    const name = tree.label[node] === null ? '' : newickLabel(/** @type {string} */ (tree.label[node]));
    const length = node === 0 ? (tree.length[0] ? `:${number(tree.length[0])}` : '') : Number.isNaN(tree.length[node]) ? '' : `:${number(tree.length[node])}`;
    return `${inner}${name}${length}`;
  };
  return `${write(0)};`;
}

// ---------- Layouts ----------

/**
 * Rectangular (phylogram) positions: x is the node's height, y its row, the tips 0, 1, 2, …
 * from the top and an internal node midway between its first and last child.
 * @param {Tree} tree
 */
export function rectangularLayout(tree) {
  const x = heights(tree);
  const y = new Array(x.length).fill(0);
  let row = 0;
  for (const node of postorder(tree)) {
    const kids = tree.children[node];
    y[node] = kids.length ? (y[kids[0]] + y[kids[kids.length - 1]]) / 2 : row++;
  }
  return { x, y, rows: row };
}

/**
 * Fan (circular) positions: a node's radius is its height and its angle, in radians
 * clockwise from the top, spreads the tips evenly over `span` (a full turn leaves one
 * tip's gap between the last and the first); an internal node sits midway between its
 * first and last child.
 * @param {Tree} tree @param {number} [span]
 */
export function fanLayout(tree, span = 2 * Math.PI) {
  const { x: radius, y, rows } = rectangularLayout(tree);
  const step = span >= 2 * Math.PI - 1e-9 ? span / rows : span / Math.max(1, rows - 1);
  return { radius, angle: y.map((row) => row * step) };
}

// ---------- Brownian motion ----------

/**
 * The tips' covariance under Brownian motion at rate 1: entry (i, j) is the length of the
 * path the two tips share, the height of their most recent common ancestor. The root
 * edge counts as shared (ape's vcv leaves it out). Rows follow tipNodes().
 * @param {Tree} tree
 */
export function vcv(tree) {
  const tips = tipNodes(tree);
  const index = new Map(tips.map((node, k) => [node, k]));
  const h = heights(tree);
  const below = tipsBelow(tree);
  const C = tips.map(() => new Array(tips.length).fill(0));
  tips.forEach((node, k) => { C[k][k] = h[node]; });
  for (let node = 0; node < h.length; node++) {
    const kids = tree.children[node];
    for (let a = 0; a < kids.length; a++) {
      for (let b = a + 1; b < kids.length; b++) {
        for (const i of below[kids[a]]) {
          for (const j of below[kids[b]]) {
            const p = /** @type {number} */ (index.get(i));
            const q = /** @type {number} */ (index.get(j));
            C[p][q] = h[node];
            C[q][p] = h[node];
          }
        }
      }
    }
  }
  return { tips, matrix: C };
}

/**
 * @typedef {{ node: number, children: [number, number], values: [number[], number[]], branches: [number, number],
 *   extensions: [number, number], contrast: number[], variance: number, estimate: number[], extension: number }} PruneStep
 */

/**
 * Felsenstein's independent contrasts, in postorder. At each node with two children a and
 * b, whose values are xa and xb and whose branches, lengthened by their own pruning, are
 * va and vb: the contrast xa − xb has variance va + vb (times the rate), the node takes
 * the value (vb·xa + va·xb)/(va + vb), and its own branch is lengthened by va·vb/(va + vb).
 * A node with one child passes the value up and adds its branch. `root` is the value at
 * the root node and the variance of that estimate, root edge included. The contrasts are
 * independent, so the restricted likelihood is the product of their densities.
 * Every internal node needs one or two children.
 * @param {Tree} tree
 * @param {(number[] | null)[]} values by node id: a trait vector for every tip
 * @returns {{ steps: PruneStep[], root: { estimate: number[], variance: number } }}
 */
export function contrasts(tree, values) {
  const value = /** @type {number[][]} */ ([...values]);
  const extension = new Array(tree.parent.length).fill(0);
  /** @type {PruneStep[]} */
  const steps = [];
  for (const node of postorder(tree)) {
    const kids = tree.children[node];
    if (kids.length > 2) throw new Error(`node ${node} has ${kids.length} children; contrasts need a binary tree`);
    if (kids.length === 1) {
      value[node] = value[kids[0]];
      extension[node] = tree.length[kids[0]] + extension[kids[0]];
    } else if (kids.length === 2) {
      const [a, b] = /** @type {[number, number]} */ (kids);
      const va = tree.length[a] + extension[a];
      const vb = tree.length[b] + extension[b];
      const estimate = value[a].map((xa, k) => (vb * xa + va * value[b][k]) / (va + vb));
      value[node] = estimate;
      extension[node] = (va * vb) / (va + vb);
      steps.push({
        node, children: [a, b], values: [value[a], value[b]], branches: [tree.length[a], tree.length[b]], extensions: [extension[a], extension[b]],
        contrast: value[a].map((xa, k) => xa - value[b][k]), variance: va + vb, estimate, extension: extension[node],
      });
    }
  }
  return { steps, root: { estimate: value[0], variance: extension[0] + tree.length[0] } };
}

// ---------- Re-rooting ----------

/**
 * The same unrooted tree hung from a new root on the branch above `node`, `distance`
 * from that node (0 puts the root at the node itself; a tip at the root has one child).
 * The old root stays as a node, a bend when it had two children, and the root edge is
 * dropped. `map[old]` is each old node's new id.
 * @param {Tree} tree @param {number} node @param {number} distance from 0 to the branch's length
 */
export function reroot(tree, node, distance) {
  const N = tree.parent.length;
  /** @type {[number, number][][]} neighbour and length: children first, then the parent */
  const links = Array.from({ length: N }, (_, i) => tree.children[i].map((c) => /** @type {[number, number]} */ ([c, tree.length[c]])));
  for (let i = 1; i < N; i++) links[i].push([tree.parent[i], tree.length[i]]);
  let start = node;
  if (node !== 0 && distance > 0 && distance < tree.length[node]) {
    const up = tree.parent[node];
    start = N;
    links.push([[node, distance], [up, tree.length[node] - distance]]);
    links[node] = links[node].map((l) => (l[0] === up ? [N, distance] : l));
    links[up] = links[up].map((l) => (l[0] === node ? [N, tree.length[node] - distance] : l));
  } else if (node !== 0 && distance >= tree.length[node]) {
    start = tree.parent[node];
  }
  /** @type {Tree} */
  const out = { parent: [], children: [], length: [], label: [] };
  const map = new Array(N).fill(-1);
  /** @type {[number, number, number][]} old id, new parent, branch length */
  const stack = [[start, -1, 0]];
  const seen = new Set();
  while (stack.length) {
    const [old, parent, length] = /** @type {[number, number, number]} */ (stack.pop());
    seen.add(old);
    const id = out.parent.length;
    if (old < N) map[old] = id;
    out.parent.push(parent);
    out.children.push([]);
    out.length.push(length);
    out.label.push(old < N ? tree.label[old] : null);
    if (parent >= 0) out.children[parent].push(id);
    const next = links[old].filter(([n]) => !seen.has(n));
    for (let k = next.length - 1; k >= 0; k--) stack.push([next[k][0], id, next[k][1]]);
  }
  // The stack visits children last-pushed first, so ids are in preorder and each
  // node's children were appended in drawing order.
  return { tree: out, map };
}
