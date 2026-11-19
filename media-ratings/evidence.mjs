// Combined predictors can share a directly fitted table from the same classes.
export function modelEvidence(catalog, model, key) {
  const value = model[key];
  if (typeof value !== 'string') return value;
  const source = Object.hasOwn(catalog.models, value) ? catalog.models[value] : null;
  return source?.kind === 'class-similarity' && source.base === model.base && typeof source[key] === 'object'
    ? source[key]
    : undefined;
}

export function pairIndex(i, j) {
  const hi = Math.max(i, j);
  return (hi * (hi - 1)) / 2 + Math.min(i, j);
}

async function packedCounts(file, length) {
  const response = await fetch('./' + file);
  if (!response.ok) throw new Error('Co-rating counts unavailable.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const buffer =
    bytes[0] === 31 && bytes[1] === 139
      ? await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer()
      : bytes.buffer;
  if (buffer.byteLength !== length * 2) throw new Error('Incomplete paired counts.');
  return new Uint16Array(buffer);
}

export async function prepareCounts(data) {
  const count = data.ids.length,
    pairs = (count * (count - 1)) / 2;
  const overlap = data.packedLayout === 'binary-overlap';
  if (
    overlap &&
    (data.scale.join(',') !== '0,1' ||
      !Number.isSafeInteger(data.cohortSize) ||
      data.cohortSize < 1 ||
      data.counts.some(([a, b]) => a + b !== data.cohortSize))
  )
    throw new Error('Invalid binary response totals.');
  if (data.packedFiles) {
    if (
      !Number.isSafeInteger(data.pairsPerFile) ||
      data.pairsPerFile < 1 ||
      data.packedFiles.length !== Math.ceil(pairs / data.pairsPerFile)
    )
      throw new Error('Incomplete co-rating directory.');
  } else if (data.packedFile) {
    data.packed = await packedCounts(data.packedFile, pairs * (overlap ? 1 : data.scale.length ** 2));
  }
}

// Keep at most eight decompressed blocks across all open catalogs.
const partCache = new Map();
export async function comparisonGrids(data, target, ids, stillVisible = () => true) {
  const i = data.ids.indexOf(target);
  const needed = new Map();
  for (const id of ids) {
    const pair = pairIndex(i, data.ids.indexOf(id)),
      file = Math.floor(pair / data.pairsPerFile);
    if (!needed.has(file)) needed.set(file, []);
    needed.get(file).push(pair);
  }
  const grids = new Map();
  const cells = data.packedLayout === 'binary-overlap' ? 1 : data.scale.length ** 2;
  const totalPairs = (data.ids.length * (data.ids.length - 1)) / 2;
  for (const [index, requested] of needed) {
    if (!stillVisible()) break;
    const file = data.packedFiles[index];
    let promise = partCache.get(file);
    if (!promise) {
      const pairs = Math.min(data.pairsPerFile, totalPairs - index * data.pairsPerFile);
      promise = packedCounts(file, pairs * cells);
    }
    partCache.delete(file);
    partCache.set(file, promise);
    if (partCache.size > 8) partCache.delete(partCache.keys().next().value);
    try {
      const part = await promise;
      for (const pair of requested) {
        const offset = (pair % data.pairsPerFile) * cells;
        grids.set(pair, part.slice(offset, offset + cells));
      }
    } catch (e) {
      if (partCache.get(file) === promise) partCache.delete(file);
      throw e;
    }
  }
  return grids;
}
