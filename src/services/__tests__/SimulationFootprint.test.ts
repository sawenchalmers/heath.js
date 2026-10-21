import { describe, expect, it } from 'vitest';
import {
  buildSimulationFootprint,
  buildSimulationFootprints,
  reverseEdgeValues,
  sharedFloorsByEdge,
  simplifyFootprint,
} from '../SimulationFootprint';

const point = (x: number, z: number) => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];

// Visual explanation of the tests in this file (groups 1, 2 and 5):
// https://claude.ai/artifact/G3TizxVrAig6HLK3U61E8Y (private Claude artifact; share it before others can open it)
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

  it('gives the same result for a single building as for the whole workspace', () => {
    const a = building('a', [point(0, 0), point(10, 0), point(10, 2), point(10, 10), point(0, 10)]);
    const b = building('b', box(10, 4, 20, 6));
    expect(buildSimulationFootprint(a, [a, b])).toEqual(buildSimulationFootprints([a, b]).get('a'));
  });
});

describe('sharedFloorsByEdge', () => {
  const building = { id: 'a', points: box(0, 0, 10, 10), floors: 3, floorHeight: 3 };

  it('lists the shared floors of every wall, including walls shared on only some floors', () => {
    // A 1-storey neighbour in the middle of the x = 10 wall, and a 3-storey one along the z = 10 wall.
    const low = { id: 'low', points: box(10, 4, 20, 6), floors: 1, floorHeight: 3 };
    const back = { id: 'back', points: box(0, 10, 10, 20), floors: 3, floorHeight: 3 };
    const footprint = buildSimulationFootprint(building, [building, low, back]);
    expect(sharedFloorsByEdge(footprint)).toEqual([[], [], [1], [], [1, 2, 3], []]);
  });

  it('is undefined when no wall is shared, so the request stays unchanged', () => {
    const corner = { id: 'corner', points: box(10, 10, 20, 20), floors: 3, floorHeight: 3 };
    expect(sharedFloorsByEdge(buildSimulationFootprint(building, [building, corner]))).toBeUndefined();
  });
});

describe('reverseEdgeValues', () => {
  it('keeps each value on the same wall after the points are reversed', () => {
    const points = ['p0', 'p1', 'p2', 'p3', 'p4'];
    const wallName = (list: string[], i: number) => [list[i], list[(i + 1) % list.length]].sort().join('-');
    const valuesByWall = points.map((_, i) => wallName(points, i));
    const reversed = [...points].reverse();

    const reorderedValues = reverseEdgeValues(valuesByWall);
    reversed.forEach((_, i) => expect(reorderedValues[i]).toBe(wallName(reversed, i)));
  });
});
