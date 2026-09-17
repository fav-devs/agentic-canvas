/**
 * Packaging for exported slides.
 *
 * PNGs are already deflate-compressed, so re-compressing them buys nothing —
 * a store-only (method 0) zip is a few dozen lines and avoids pulling a zip
 * dependency into the web bundle just for this one button.
 */

export type SlideFile = { name: string; blob: Blob };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair used by the zip local header. */
function dosTimestamp(date: Date) {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11);
  const day =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(0, date.getFullYear() - 1980) & 0x7f) << 9);
  return { time, day };
}

/** Bundle already-rendered slides into a single (uncompressed) zip archive. */
export async function createSlideZip(
  files: SlideFile[],
  modifiedAt: Date = new Date(),
): Promise<Blob> {
  const encoder = new TextEncoder();
  const { time, day } = dosTimestamp(modifiedAt);
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = new Uint8Array(await file.blob.arrayBuffer());
    const checksum = crc32(content);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, content.length, true);
    local.setUint32(22, content.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra length
    localParts.push(local.buffer, name, content);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, day, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, content.length, true);
    central.setUint32(24, content.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true); // comment length
    central.setUint16(34, 0, true); // disk number
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, offset, true);
    centralParts.push(central.buffer, name);

    offset += 30 + name.length + content.length;
  }

  const centralBlob = new Blob(centralParts);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralBlob.size, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return new Blob([...localParts, centralBlob, end.buffer], {
    type: "application/zip",
  });
}

/** `my-carousel-03.png` — zero-padded so slides sort correctly everywhere. */
export function slideFilename(
  documentSlug: string,
  index: number,
  total: number,
) {
  const width = String(total).length;
  return `${documentSlug}-${String(index + 1).padStart(width, "0")}.png`;
}
