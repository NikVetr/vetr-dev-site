export function createInitialState() {
  return {
    currentColors: [],
    newColors: [],
    rawCurrentColors: [],
    rawNewColors: [],
    rawBestColors: [],
    rawSpace: null,
    newRawSpace: null,
    running: false,
    bestScores: [],
    copyTimeout: null,
    lastRuns: 0,
    bounds: null,
    mutedInput: false,
    nmTrails: [],
    bestColors: [],
  };
}
