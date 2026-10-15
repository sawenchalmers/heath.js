import { describe, expect, it } from 'vitest';
import { buildSimulationFootprints, simplifyFootprint } from '../SimulationFootprint';

const point = (x: number, z: number) => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

describe('simplifyFootprint', () => {
  it.each([
    ['repeated points', [point(0, 0), point(10, 0), point(10, 0), point(10, 8), point(0, 8)]],
    ['a closing point equal to the first', [...box(0, 0, 10, 8), point(0, 0)]],
    ['points on a straight edge', [point(0, 0), point(5, 0), point(10, 0), point(10, 8), point(0, 8), point(0, 4)]],
  ])('removes %s and keeps the corners in order', (_name, points) => {
    expect(simplifyFootprint(points)).toEqual(box(0, 0, 10, 8));
  });

  it('keeps a footprint that has only real corners unchanged', () => {
    const lShape = [point(0, 0), point(10, 0), point(10, 4), point(4, 4), point(4, 10), point(0, 10)];
    expect(simplifyFootprint(lShape)).toEqual(lShape);
  });
});

describe('buildSimulationFootprints', () => {
  const building = (id: string, points: ReturnType<typeof box>, floors = 3) => ({ id, points, floors, floorHeight: 3 });

  it('simplifies before splitting, so only the neighbour decides where walls are cut', () => {
    const withExtraPoint = building('a', [point(0, 0), point(10, 0), point(10, 2), point(10, 10), point(0, 10)]);
    const neighbour = building('b', box(10, 4, 20, 6));
    const { footprint, edges } = buildSimulationFootprints([withExtraPoint, neighbour]).get('a')!;
    expect(footprint).toEqual([point(0, 0), point(10, 0), point(10, 4), point(10, 6), point(10, 10), point(0, 10)]);
    expect(edges.map(edge => edge.sharedFloors)).toEqual([[], [], [1, 2, 3], [], [], []]);
  });

  it('returns the plain simplified footprint for a building without neighbours', () => {
    const alone = building('alone', [...box(0, 0, 10, 8), point(0, 0)]);
    expect(buildSimulationFootprints([alone]).get('alone')!.footprint).toEqual(box(0, 0, 10, 8));
  });
});
