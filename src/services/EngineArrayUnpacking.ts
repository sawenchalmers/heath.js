import type { ArrayField, PackedArray } from '../types/engine';

// Turns the long lists of numbers in the engine's results back into ordinary arrays.
//
// A daylight result holds one value per sensor point (daylight factor, daylight autonomy) and each
// point's position, often thousands of numbers. To keep responses small, the engine (v1 API) doesn't
// send them as JSON lists but "packed": the raw bytes of the numbers, written as text (base64). This
// file reads them back. Technically: the base64 of a little-endian typed array, with
// value = raw / scale (see the engine's worker/packing.py). Plain lists (`pack: false`) pass through.

const BYTES_PER_VALUE: Record<PackedArray['dtype'], number> = { uint8: 1, uint16: 2, float32: 4 };

/** Whether a field is packed rather than a plain array. */
const isPacked = (field: ArrayField): field is PackedArray =>
  !Array.isArray(field) && typeof field === 'object' && field !== null && 'data' in field;

/** Decodes a packed array into its flat values, checking its length against its shape. */
const decodePacked = (packed: PackedArray): number[] => {
  const size = BYTES_PER_VALUE[packed.dtype];
  if (!size) throw new Error(`Unknown packed array type: ${packed.dtype}`);
  const binary = atob(packed.data);
  const view = new DataView(Uint8Array.from(binary, char => char.charCodeAt(0)).buffer);
  const count = view.byteLength / size;
  const expected = packed.shape.reduce((product, dimension) => product * dimension, 1);
  if (count !== expected) throw new Error(`Packed array has ${count} values, but its shape ${JSON.stringify(packed.shape)} needs ${expected}`);
  const read = { uint8: (i: number) => view.getUint8(i), uint16: (i: number) => view.getUint16(i * 2, true), float32: (i: number) => view.getFloat32(i * 4, true) }[packed.dtype];
  return Array.from({ length: count }, (_, i) => read(i) / packed.scale);
};

/** The values of a one-dimensional array field (e.g. daylight factor per sensor). */
export const unpackValues = (field: ArrayField): number[] => {
  if (isPacked(field)) return decodePacked(field);
  return (field as number[]).map(Number);
};

/** The rows of an (n, 3) array field (e.g. sensor positions as [x, y, z]). */
export const unpackPoints = (field: ArrayField): [number, number, number][] => {
  if (!isPacked(field)) return (field as number[][]).map(row => [row[0], row[1], row[2]]);
  if (field.shape.length !== 2 || field.shape[1] !== 3) throw new Error(`Expected points of shape (n, 3), got ${JSON.stringify(field.shape)}`);
  const values = decodePacked(field);
  return Array.from({ length: field.shape[0] }, (_, i) => [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]]);
};
