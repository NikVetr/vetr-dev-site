// Declarations for the vendored fontkit bundle: only create(). Each tool types the
// font with the parts of it that tool reads. They also stop tsc from walking the
// minified bundle.

export function create(buffer: Uint8Array, postscriptName?: string): unknown;
