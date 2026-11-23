import { describe, expect, it } from 'vitest';
import { unpackPoints, unpackValues } from '../EngineArrayUnpacking';
import type { EngineDaylightResult, PackedArray } from '../../types/engine';
import fixture from './fixtures/v1-daylight-two-floors.json';

// A real v1 daylight result, requested once packed and once with pack: false: unpacking the first must give the second.
const packed = fixture.packed as unknown as EngineDaylightResult;
const plain = fixture.plain as unknown as EngineDaylightResult;

/** Packs numbers the way the engine does (little-endian, value * scale), for edge cases the fixture lacks. */
const packForTest = (values: number[], dtype: PackedArray['dtype'], scale: number, shape = [values.length]): PackedArray => {
  const size = { uint8: 1, uint16: 2, float32: 4 }[dtype];
  const view = new DataView(new ArrayBuffer(values.length * size));
  values.forEach((value, i) => {
    if (dtype === 'uint8') view.setUint8(i, Math.round(value * scale));
    if (dtype === 'uint16') view.setUint16(i * 2, Math.round(value * scale), true);
    if (dtype === 'float32') view.setFloat32(i * 4, value * scale, true);
  });
  const binary = String.fromCharCode(...new Uint8Array(view.buffer));
  return { dtype, scale, shape, data: btoa(binary) };
};

describe('unpackValues', () => {
  it('turns the packed daylight factors into the same numbers as the plain response', () => {
    const values = unpackValues(packed.df);
    expect(values).toHaveLength(packed.sensor_count);
    values.forEach((value, i) => expect(value).toBeCloseTo((plain.df as number[])[i], 2));
  });

  it('does the same for daylight autonomy', () => {
    const values = unpackValues(packed.da!);
    values.forEach((value, i) => expect(value).toBeCloseTo((plain.da as number[])[i], 2));
  });

  it('passes a plain array through', () => {
    expect(unpackValues(plain.df)).toEqual(plain.df);
  });

  it('reads uint8 values too', () => {
    expect(unpackValues(packForTest([0, 1, 255], 'uint8', 1))).toEqual([0, 1, 255]);
  });

  it('rejects data that does not match its shape', () => {
    expect(() => unpackValues({ ...packForTest([1, 2, 3], 'uint16', 100), shape: [4] })).toThrow(/shape/);
  });

  it('rejects an unknown type', () => {
    expect(() => unpackValues({ ...packForTest([1], 'uint16', 1), dtype: 'int64' as PackedArray['dtype'] })).toThrow(/Unknown/);
  });
});

describe('unpackPoints', () => {
  it('turns the packed sensor points into the same rows as the plain response', () => {
    const points = unpackPoints(packed.sensor_points);
    const expected = plain.sensor_points as number[][];
    expect(points).toHaveLength(expected.length);
    points.forEach((point, i) => point.forEach((value, axis) => expect(value).toBeCloseTo(expected[i][axis], 5)));
  });

  it('keeps the per-floor slices consistent with the points', () => {
    const points = unpackPoints(packed.sensor_points);
    const last = packed.sensor_grids[packed.sensor_grids.length - 1];
    expect(last.start_sensor_index + last.sensor_count).toBe(points.length);
  });

  it('rejects an array that is not (n, 3)', () => {
    expect(() => unpackPoints(packForTest([1, 2, 3, 4], 'float32', 1, [2, 2]))).toThrow(/\(n, 3\)/);
  });
});
