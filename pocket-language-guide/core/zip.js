// A store-only ZIP writer, so a multi-face export is one file.
//
// Exporting a four-face sheet used to call download() four times, which Chrome
// answers with a "Download multiple files?" permission prompt and then delivers
// out of order with ambiguous names. One archive is the honest shape for a
// multi-file export.
//
// Store-only, no deflate: the bulk of any archive here is 600dpi PNG, which is
// already compressed, and it keeps this to one readable function. Timestamps are
// pinned rather than taken from the clock, because identical input producing an
// identical file is an invariant the rest of the app holds to.

/** @type {Uint32Array|null} */ let crcTable = null;

function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c >>> 0;
  }
  return crcTable;
}

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 2026-01-01 00:00:00 in the DOS pair ZIP has used since 1989: date is
// (year-1980)<<9 | month<<5 | day, time is hour<<11 | minute<<5 | second/2.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/** UTF-8 names, so a non-Latin sheet name survives the round trip. */
const FLAG_UTF8 = 0x0800;

/**
 * @typedef {{name:string, bytes:Uint8Array}} ZipEntry
 */

/**
 * Pack entries into a ZIP archive.
 * @param {ZipEntry[]} entries
 * @returns {Uint8Array}
 */
export function zip(entries) {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    bytes: entry.bytes,
    crc: crc32(entry.bytes),
  }));

  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.bytes.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let at = 0;

  /** @type {number[]} */ const offsets = [];
  for (const file of files) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true);           // version needed
    view.setUint16(at + 6, FLAG_UTF8, true);
    view.setUint16(at + 8, 0, true);            // method: store
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, file.crc, true);
    view.setUint32(at + 18, file.bytes.length, true);
    view.setUint32(at + 22, file.bytes.length, true);
    view.setUint16(at + 26, file.name.length, true);
    view.setUint16(at + 28, 0, true);           // no extra field
    at += 30;
    out.set(file.name, at);
    at += file.name.length;
    out.set(file.bytes, at);
    at += file.bytes.length;
  }

  const centralAt = at;
  files.forEach((file, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true);           // version made by
    view.setUint16(at + 6, 20, true);           // version needed
    view.setUint16(at + 8, FLAG_UTF8, true);
    view.setUint16(at + 10, 0, true);           // method: store
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, file.crc, true);
    view.setUint32(at + 20, file.bytes.length, true);
    view.setUint32(at + 24, file.bytes.length, true);
    view.setUint16(at + 28, file.name.length, true);
    view.setUint16(at + 30, 0, true);           // extra
    view.setUint16(at + 32, 0, true);           // comment
    view.setUint16(at + 34, 0, true);           // disk number
    view.setUint16(at + 36, 0, true);           // internal attrs
    view.setUint32(at + 38, 0, true);           // external attrs
    view.setUint32(at + 42, offsets[i], true);
    at += 46;
    out.set(file.name, at);
    at += file.name.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, files.length, true);
  view.setUint16(at + 10, files.length, true);
  view.setUint32(at + 12, at - centralAt, true);
  view.setUint32(at + 16, centralAt, true);
  return out;
}
