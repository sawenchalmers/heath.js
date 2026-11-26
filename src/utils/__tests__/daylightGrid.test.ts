import { describe, expect, it } from 'vitest';
import { cellsOf, cellTexels, cellUV, gridFrameOf, type PlanPoint } from '../daylightGrid';

/** A 3 × 2 grid of points 0.5 m apart, rotated by `degrees` around (1, 1). */
const grid = (degrees: number): PlanPoint[] => {
  const a = degrees * Math.PI / 180, points: PlanPoint[] = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const s = i * 0.5, t = j * 0.5;
    points.push({ x: 1 + s * Math.cos(a) - t * Math.sin(a), z: 1 + s * Math.sin(a) + t * Math.cos(a) });
  }
  return points;
};

describe('gridFrameOf', () => {
  it("finds the plan's axes for a straight grid, and the rotation of a slanted one", () => {
    expect(gridFrameOf(grid(0)).u.x).toBeCloseTo(1);
    const slanted = gridFrameOf(grid(15.2));
    expect(Math.atan2(slanted.u.z, slanted.u.x) * 180 / Math.PI).toBeCloseTo(15.2);
    expect(slanted.u.x * slanted.v.x + slanted.u.z * slanted.v.z).toBeCloseTo(0);
  });

  it('folds a neighbour found along the other axis into the same frame', () => {
    // The first point's nearest neighbour lies along v here (0.4 m apart in t, 0.5 m in s).
    const points = [{ x: 0, z: 0 }, { x: 0, z: 0.4 }, { x: 0.5, z: 0 }];
    const frame = gridFrameOf(points);
    expect(frame.u.x).toBeCloseTo(1);
    expect(frame.u.z).toBeCloseTo(0);
  });
});

describe('cellsOf and cellTexels', () => {
  it('gives each point of a slanted grid its own cell, with no two points sharing one', () => {
    const points = grid(15.2), frame = gridFrameOf(points);
    const cells = cellsOf(points, frame, 0.5, 0.5);
    expect(new Set(cells.cells.map(c => `${c.i},${c.j}`)).size).toBe(points.length);
    expect([cells.iMax - cells.iMin, cells.jMax - cells.jMin]).toEqual([2, 1]);
  });

  it('fills the cells next to the grid with a neighbour, and leaves the rest transparent', () => {
    const points = grid(0), frame = gridFrameOf(points);
    const colors = points.map((_, k) => [k * 40, 0, 0] as const);
    const texels = cellTexels(cellsOf(points, frame, 0.5, 0.5), colors, 1);
    expect([texels.width, texels.height]).toEqual([5, 4]);
    const at = (x: number, y: number) => Array.from(texels.data.subarray((y * texels.width + x) * 4, (y * texels.width + x) * 4 + 4));
    expect(at(1, 1)).toEqual([0, 0, 0, 255]);       // the first point's own cell
    expect(at(0, 1)).toEqual([0, 0, 0, 255]);       // left of it: filled from it
    expect(at(0, 0)).toEqual([0, 0, 0, 0]);         // the corner, two steps away: transparent
  });

  it('maps a cell centre to the middle of its texel', () => {
    const points = grid(15.2), frame = gridFrameOf(points);
    const texels = cellTexels(cellsOf(points, frame, 0.5, 0.5), points.map(() => [0, 0, 0] as const), 2);
    const [u, v] = cellUV(points[0], frame, 0.5, 0.5, texels);
    expect(u * texels.width).toBeCloseTo(2.5);
    expect(v * texels.height).toBeCloseTo(2.5);
  });
});
