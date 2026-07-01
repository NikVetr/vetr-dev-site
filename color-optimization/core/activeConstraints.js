export function individualConstraintsReplaceGlobal(context = {}) {
  return Boolean(context.individualConstraintsReplaceGlobal);
}

export function useLocalConstraintSets(bounds, context = {}) {
  const topology =
    context.constraintTopology ||
    bounds?.constraintSets?.topology ||
    bounds?.globalConstraintSets?.topology ||
    "contiguous";
  return topology === "custom" || individualConstraintsReplaceGlobal(context);
}

export function activeConstraintSets(bounds, context = {}) {
  if (!bounds) return null;
  return useLocalConstraintSets(bounds, context)
    ? bounds.constraintSets
    : (bounds.globalConstraintSets || bounds.constraintSets);
}
