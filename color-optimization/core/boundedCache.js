// Callers own cached values; do not mutate a value after storing it.
export function boundedCache(limit) {
  const values = new Map();
  return (key, compute) => {
    if (values.has(key)) return values.get(key);
    const value = compute();
    if (values.size >= limit) values.delete(values.keys().next().value);
    values.set(key, value);
    return value;
  };
}
