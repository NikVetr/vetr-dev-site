// Types for the vendored Clipper build: the parts core/geometry.js uses.
declare const ClipperLib: {
  Clipper: { new(): { AddPath(path: { X: number, Y: number }[], type: number, closed: boolean): boolean, Execute(op: number, out: unknown, subjectFill: number, clipFill: number): boolean }, Area(path: { X: number, Y: number }[]): number },
  PolyTree: new () => unknown,
  Paths: new () => { X: number, Y: number }[][],
  PolyType: { ptSubject: number, ptClip: number },
  ClipType: { ctUnion: number, ctDifference: number, ctIntersection: number, ctXor: number },
  PolyFillType: Record<'pftEvenOdd' | 'pftNonZero' | 'pftPositive' | 'pftNegative', number>,
  JS: { PolyTreeToExPolygons(tree: unknown): { outer: { X: number, Y: number }[], holes: { X: number, Y: number }[][] }[] },
};
export default ClipperLib;
