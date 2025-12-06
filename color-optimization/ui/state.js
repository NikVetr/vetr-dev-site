export function createInitialState() {
  return {
    currentColors: [],
    newColors: [],
    running: false,
    bestScores: [],
    copyTimeout: null,
    lastRuns: 0,
    bounds: null,
    mutedInput: false,
  };
}
