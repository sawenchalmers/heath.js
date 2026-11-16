import { describe, expect, it } from 'vitest';
import { calculateBuildingMetrics, footprintsOverlap, validateFootprint } from '../buildingMetrics';
import { rotateFootprint } from '../footprintInteraction';

const point = (x: number, z: number) => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

describe('building metrics', () => {
  it.each([
    ['counter-clockwise', [point(0, 0), point(10, 0), point(10, 8), point(0, 8)]],
    ['clockwise', [point(0, 8), point(10, 8), point(10, 0), point(0, 0)]],
  ])('reports GFA independently of %s winding', (_name, points) => {
    expect(calculateBuildingMetrics(points, 4, 3)).toEqual({ footprintArea: 80, grossFloorArea: 320, perimeter: 36, totalHeight: 12 });
  });

  it('reports irregular footprint metrics and rejects invalid edits', () => {
    const irregular = [point(0, 0), point(6, 0), point(6, 2), point(3, 5), point(0, 2)];
    expect(calculateBuildingMetrics(irregular, 3, 3.2).grossFloorArea).toBe(63);
    expect(validateFootprint(irregular)).toBeNull();
    expect(validateFootprint([point(0, 0), point(4, 4), point(0, 4), point(4, 0)])).toMatch(/cross/i);
    expect(validateFootprint([point(0, 0), point(0, 0), point(1, 0)])).toMatch(/overlap/i);
  });
});

// Visual explanation of the overlap tests below, including the comparison with the grid reference:
// https://claude.ai/artifact/C1z9tum1aTYPiRWPgXwygY (private Claude artifact; share it before others can open it)
describe('footprint overlap between buildings', () => {
  const base = box(0, 0, 10, 10);

  it.each([
    ['are apart', box(12, 0, 20, 10)],
    ['share a full edge', box(10, 0, 20, 10)],
    ['share part of an edge', box(10, 4, 20, 6)],
    ['meet at a corner', box(10, 10, 20, 20)],
    ['touch at a vertex on an edge', [point(10, 5), point(15, 0), point(15, 10)]],
  ])('allows footprints that %s', (_name, other) => {
    expect(footprintsOverlap(base, other)).toBe(false);
    expect(footprintsOverlap(other, base)).toBe(false);
  });

  it.each([
    ['cross each other', box(5, 5, 15, 15)],
    ['contain one another', box(2, 2, 8, 8)],
    ['coincide', box(0, 0, 10, 10)],
    ['share edges but cover the same area', box(0, 0, 10, 5)],
    ['reach in from a shared edge', [point(10, 2), point(10, 8), point(6, 5)]],
  ])('rejects footprints that %s', (_name, other) => {
    expect(footprintsOverlap(base, other)).toBe(true);
    expect(footprintsOverlap(other, base)).toBe(true);
  });

  it('treats rotated footprints sharing an edge as touching', () => {
    const pivot = point(10, 0);
    const left = rotateFootprint(base, Math.PI / 7, pivot);
    const right = rotateFootprint(box(10, 0, 18, 10), Math.PI / 7, pivot);
    expect(footprintsOverlap(left, right)).toBe(false);
  });

  it('reports overlaps with other buildings when validating', () => {
    expect(validateFootprint(box(10, 0, 20, 10), [base])).toBeNull();
    expect(validateFootprint(box(5, 0, 15, 10), [base])).toMatch(/cannot overlap another building/i);
  });

  // In these cases the bounding boxes overlap, so the result is decided by the edge checks rather than the box shortcut.
  const lShape = [point(0, 0), point(10, 0), point(10, 4), point(4, 4), point(4, 10), point(0, 10)];
  const uShape = [point(0, 0), point(12, 0), point(12, 10), point(8, 10), point(8, 4), point(4, 4), point(4, 10), point(0, 10)];
  const staircase = [point(0, 0), point(6, 0), point(6, 3), point(3, 3), point(3, 6), point(0, 6)];

  it.each([
    ['fill the notch of an L-shape (2 shared edges)', lShape, box(4, 4, 10, 10)],
    ['fill the slot of a U-shape (3 shared edges)', uShape, box(4, 4, 8, 10)],
    ['sit in the slot of a U-shape and extend beyond it', uShape, box(4, 4, 8, 12)],
    ['fill the step of a staircase (2 shared edges)', staircase, box(3, 3, 6, 6)],
    ['point into the inner corner of an L-shape', lShape, [point(4, 4), point(9, 9), point(4, 9)]],
  ])('allows footprints that %s', (_name, polygon, other) => {
    expect(footprintsOverlap(polygon, other)).toBe(false);
    expect(footprintsOverlap(other, polygon)).toBe(false);
  });

  it.each([
    ['are wider than the notch of an L-shape', lShape, box(3, 4, 10, 10)],
    ['are wider than the slot of a U-shape', uShape, box(3.5, 4, 8, 10)],
    ['share an edge and have a vertex inside', base, [point(0, 0), point(10, 0), point(5, 3)]],
  ])('rejects footprints that %s', (_name, polygon, other) => {
    expect(footprintsOverlap(polygon, other)).toBe(true);
    expect(footprintsOverlap(other, polygon)).toBe(true);
  });

  it.each([
    ['allows a 1 mm gap', box(10.001, 0, 20, 10), false],
    ['rejects a 1 mm overlap', box(9.999, 0, 20, 10), true],
    ['rejects a 1 cm sliver that crosses the edges', box(9.99, -5, 30, 15), true],
    ['treats a 0.1 µm overlap as touching (within tolerance)', box(9.9999999, 0, 20, 10), false],
  ])('%s', (_name, other, expected) => {
    expect(footprintsOverlap(base, other)).toBe(expected);
    expect(footprintsOverlap(other, base)).toBe(expected);
  });
});

describe('footprint overlap against an independent reference', () => {
  /** Deterministic pseudo-random numbers in [0, 1), so failures are reproducible. */
  const seededRandom = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  /** Random rectangle, L-shape or U-shape with whole-metre corners inside a 20 × 20 m area. */
  const randomOrthogonalFootprint = (random: () => number) => {
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const x = int(0, 10), z = int(0, 10), width = int(2, 8), depth = int(2, 8), kind = int(0, 2);
    if (kind === 0 || (kind === 2 && width < 3)) return box(x, z, x + width, z + depth);
    const cutX = int(1, width - 1), cutZ = int(1, depth - 1);
    if (kind === 1) {
      return [point(x, z), point(x + width, z), point(x + width, z + cutZ), point(x + cutX, z + cutZ), point(x + cutX, z + depth), point(x, z + depth)];
    }
    const slotStart = int(1, width - 2), slotEnd = int(slotStart + 1, width - 1);
    return [point(x, z), point(x + width, z), point(x + width, z + depth), point(x + slotEnd, z + depth),
      point(x + slotEnd, z + cutZ), point(x + slotStart, z + cutZ), point(x + slotStart, z + depth), point(x, z + depth)];
  };

  /** Ray-casting point-in-polygon test, written separately from the code under test. */
  const isInside = (px: number, pz: number, polygon: { x: number; z: number }[]) => polygon.reduce((inside, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (a.z > pz) !== (b.z > pz) && px < (b.x - a.x) * (pz - a.z) / (b.z - a.z) + a.x ? !inside : inside;
  }, false);

  /**
   * With whole-metre corners, every 1 × 1 m cell is entirely inside or outside a footprint,
   * so two footprints share area exactly when some cell centre is inside both.
   */
  const shareAreaOnGrid = (a: { x: number; z: number }[], b: { x: number; z: number }[]) => {
    for (let i = 0; i < 20; i += 1) {
      for (let j = 0; j < 20; j += 1) {
        if (isInside(i + 0.5, j + 0.5, a) && isInside(i + 0.5, j + 0.5, b)) return true;
      }
    }
    return false;
  };

  it.each([
    ['axis-aligned pairs', false],
    ['pairs rotated by a shared random angle', true],
  ])('agrees with the grid reference on 2,000 random %s', (_name, rotate) => {
    const random = seededRandom(12345);
    for (let pair = 0; pair < 2000; pair += 1) {
      const gridA = randomOrthogonalFootprint(random), gridB = randomOrthogonalFootprint(random);
      const expected = shareAreaOnGrid(gridA, gridB);
      const angle = random() * 2 * Math.PI, pivot = point(random() * 20, random() * 20);
      const a = rotate ? rotateFootprint(gridA, angle, pivot) : gridA;
      const b = rotate ? rotateFootprint(gridB, angle, pivot) : gridB;
      if (footprintsOverlap(a, b) !== expected || footprintsOverlap(b, a) !== expected) {
        expect.fail(`pair ${pair} disagrees with the reference (expected overlap: ${expected}): ${JSON.stringify({ a, b })}`);
      }
    }
  });
});
