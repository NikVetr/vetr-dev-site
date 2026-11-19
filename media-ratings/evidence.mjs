// Combined predictors can share a directly fitted table from the same classes.
export function modelEvidence(catalog, model, key) {
  const value = model[key];
  if (typeof value !== 'string') return value;
  const source = Object.hasOwn(catalog.models, value) ? catalog.models[value] : null;
  return source?.kind === 'class-similarity' && source.base === model.base && typeof source[key] === 'object'
    ? source[key]
    : undefined;
}
