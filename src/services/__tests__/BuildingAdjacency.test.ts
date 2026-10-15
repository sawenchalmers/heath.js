import { describe, expect, it } from 'vitest';
import { computeBuildingAdjacency, computeAllBuildingAdjacency, type AdjacencyInput, type BuildingAdjacency } from '../BuildingAdjacency';
import { calculateFootprintArea } from '../../utils/buildingMetrics';
import { rotateFootprint } from '../../utils/footprintInteraction';

const point = (x: number, z: number) => ({ x, y: 0, z });
const box = (x0: number, z0: number, x1: number, z1: number) => [point(x0, z0), point(x1, z0), point(x1, z1), point(x0, z1)];
const building = (id: string, points: ReturnType<typeof box>, floors = 3, floorHeight = 3): AdjacencyInput => ({ id, points, floors, floorHeight });

/** The edges of an adjacency result that share at least one floor, with their end points rounded for comparison. */
const sharedEdges = (adjacency: BuildingAdjacency) => adjacency.edges.flatMap((edge, i) => {
  if (!edge.sharedFloors.length) return [];
  const a = adjacency.footprint[i], b = adjacency.footprint[(i + 1) % adjacency.footprint.length];
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return [{ from: [round(a.x), round(a.z)], to: [round(b.x), round(b.z)], floors: edge.sharedFloors, neighbours: edge.neighbourIds }];
});

describe('building adjacency', () => {
  const base = building('base', box(0, 0, 10, 10));

  it('leaves a building without neighbours unchanged and unshared', () => {
    const result = computeBuildingAdjacency(base, [base]);
    expect(result.footprint).toEqual(base.points);
    expect(result.edges.every(edge => edge.sharedFloors.length === 0 && edge.neighbourIds.length === 0)).toBe(true);
  });

  it('shares a full edge between two equally tall buildings, on both sides', () => {
    const neighbour = building('east', box(10, 0, 20, 10));
    const all = computeAllBuildingAdjacency([base, neighbour]);
    expect(sharedEdges(all.get('base')!)).toEqual([{ from: [10, 0], to: [10, 10], floors: [1, 2, 3], neighbours: ['east'] }]);
    expect(sharedEdges(all.get('east')!)).toEqual([{ from: [10, 10], to: [10, 0], floors: [1, 2, 3], neighbours: ['base'] }]);
    expect(all.get('base')!.footprint).toHaveLength(4);
  });

  it('splits an edge where a narrower neighbour starts and ends', () => {
    const narrow = building('narrow', box(10, 4, 20, 6));
    const result = computeBuildingAdjacency(base, [narrow]);
    expect(result.footprint).toEqual([point(0, 0), point(10, 0), point(10, 4), point(10, 6), point(10, 10), point(0, 10)]);
    expect(result.edges.map(edge => edge.sharedFloors.length > 0)).toEqual([false, false, true, false, false, false]);
    expect(sharedEdges(computeBuildingAdjacency(narrow, [base]))).toEqual([{ from: [10, 6], to: [10, 4], floors: [1, 2, 3], neighbours: ['base'] }]);
  });

  it('splits one edge between two neighbours of different heights', () => {
    const low = building('low', box(10, 0, 20, 5), 1);
    const high = building('high', box(10, 5, 20, 10), 3);
    expect(sharedEdges(computeBuildingAdjacency(base, [low, high]))).toEqual([
      { from: [10, 0], to: [10, 5], floors: [1], neighbours: ['low'] },
      { from: [10, 5], to: [10, 10], floors: [1, 2, 3], neighbours: ['high'] },
    ]);
  });

  it('keeps separate pieces for different neighbours of the same height', () => {
    const south = building('south', box(10, 0, 20, 5));
    const north = building('north', box(10, 5, 20, 10));
    expect(sharedEdges(computeBuildingAdjacency(base, [south, north]))).toEqual([
      { from: [10, 0], to: [10, 5], floors: [1, 2, 3], neighbours: ['south'] },
      { from: [10, 5], to: [10, 10], floors: [1, 2, 3], neighbours: ['north'] },
    ]);
  });

  it('merges pieces shared with the same neighbour', () => {
    const withExtraVertex = building('east', [point(10, 0), point(20, 0), point(20, 10), point(10, 10), point(10, 5)]);
    const result = computeBuildingAdjacency(base, [withExtraVertex]);
    expect(result.footprint).toHaveLength(4);
    expect(sharedEdges(result)).toEqual([{ from: [10, 0], to: [10, 10], floors: [1, 2, 3], neighbours: ['east'] }]);
  });

  it.each([
    ['counts a 1 cm gap as shared', 10.01, true],
    ['does not count a 2 cm gap as shared', 10.02, false],
    ['counts a 1 µm overlap as shared', 9.999999, true],
  ])('%s', (_name, x, shared) => {
    const neighbour = building('east', box(x, 0, 20, 10));
    expect(sharedEdges(computeBuildingAdjacency(base, [neighbour])).length > 0).toBe(shared);
  });

  it.each([
    ['meet only at a corner', box(10, 10, 20, 20)],
    ['are apart', box(12, 0, 20, 10)],
    ['touch at a single point', [point(10, 5), point(15, 0), point(15, 10)]],
  ])('shares nothing with buildings that %s', (_name, points) => {
    expect(sharedEdges(computeBuildingAdjacency(base, [building('other', points)]))).toEqual([]);
  });

  describe('storeys covered by a lower neighbour (simplified to whole storeys, #19)', () => {
    const tall = building('tall', box(0, 0, 10, 10), 5, 3);
    it.each([
      ['6 m tall', 2, 3, [1, 2]],
      ['7.5 m tall, exactly half of floor 3', 1, 7.5, [1, 2, 3]],
      ['7.4 m tall, just under half of floor 3', 1, 7.4, [1, 2]],
      ['taller than the building', 8, 3, [1, 2, 3, 4, 5]],
    ])('shares the right floors with a neighbour %s', (_name, floors, floorHeight, expected) => {
      const neighbour = building('east', box(10, 0, 20, 10), floors, floorHeight);
      expect(computeBuildingAdjacency(tall, [neighbour]).edges[1].sharedFloors).toEqual(expected);
    });

    it('does not split an edge for a neighbour lower than half the first storey', () => {
      const shed = building('shed', box(10, 4, 20, 6), 1, 1.4);
      const result = computeBuildingAdjacency(tall, [shed]);
      expect(result.footprint).toHaveLength(4);
      expect(sharedEdges(result)).toEqual([]);
    });

    it('uses the floor height of the building being checked, not the neighbour', () => {
      const highCeilings = building('high-ceilings', box(0, 0, 10, 10), 3, 4);
      const neighbour = building('east', box(10, 0, 20, 10), 3, 3);
      expect(computeBuildingAdjacency(highCeilings, [neighbour]).edges[1].sharedFloors).toEqual([1, 2]);
    });
  });

  it('handles concave footprints touching on several edges', () => {
    const lShape = building('L', [point(0, 0), point(10, 0), point(10, 4), point(4, 4), point(4, 10), point(0, 10)]);
    const notch = building('notch', box(4, 4, 10, 10));
    expect(sharedEdges(computeBuildingAdjacency(lShape, [notch]))).toEqual([
      { from: [10, 4], to: [4, 4], floors: [1, 2, 3], neighbours: ['notch'] },
      { from: [4, 4], to: [4, 10], floors: [1, 2, 3], neighbours: ['notch'] },
    ]);
  });

  it('normalises clockwise footprints to Honeybee counter-clockwise order', () => {
    const clockwise = building('cw', [...box(10, 0, 20, 10)].reverse());
    const result = computeBuildingAdjacency(base, [clockwise]);
    expect(sharedEdges(result)).toEqual([{ from: [10, 0], to: [10, 10], floors: [1, 2, 3], neighbours: ['cw'] }]);
    expect(computeBuildingAdjacency(clockwise, [base]).footprint[0]).toEqual(point(10, 0));
  });

  it('finds shared walls between rotated buildings', () => {
    const pivot = point(10, 0), angle = Math.PI / 7;
    const left = building('left', rotateFootprint(box(0, 0, 10, 10), angle, pivot));
    const right = building('right', rotateFootprint(box(10, 4, 18, 6), angle, pivot));
    const result = computeBuildingAdjacency(left, [right]);
    expect(result.footprint).toHaveLength(6);
    expect(result.edges.filter(edge => edge.sharedFloors.length)).toHaveLength(1);
  });

  it('keeps the footprint shape when splitting edges', () => {
    const neighbours = [building('a', box(10, 2, 14, 4)), building('b', box(10, 6, 14, 9)), building('c', box(3, 10, 6, 14))];
    const result = computeBuildingAdjacency(base, neighbours);
    expect(result.footprint).toHaveLength(4 + 4 + 2);
    expect(result.edges).toHaveLength(result.footprint.length);
    expect(calculateFootprintArea(result.footprint)).toBeCloseTo(100, 10);
    expect(result.footprint.every(p => (p.x === 0 || p.x === 10 || p.z === 0 || p.z === 10))).toBe(true);
  });
});
