import { describe, expect, it } from 'vitest';
import { cellsOf, cellTexels, cellUV, gridFrameOf, gridPosition, type PlanPoint } from '../daylightGrid';

/** A grid of `columns` × `rows` points, `dx` × `dz` apart, rotated by `degrees` around (1, 1). */
const grid = (degrees: number, columns = 3, rows = 2, dx = 0.5, dz = 0.5): PlanPoint[] => {
  const a = degrees * Math.PI / 180, points: PlanPoint[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const s = i * dx, t = j * dz;
    points.push({ x: 1 + s * Math.cos(a) - t * Math.sin(a), z: 1 + s * Math.sin(a) + t * Math.cos(a) });
  }
  return points;
};

/** Whether every point got a cell of its own. */
const allDistinct = (cells: Array<{ i: number; j: number }>) => new Set(cells.map(c => `${c.i},${c.j}`)).size === cells.length;

/** The angle of a frame's u axis, in degrees. */
const degreesOf = (u: PlanPoint) => Math.atan2(u.z, u.x) * 180 / Math.PI;

describe('gridFrameOf', () => {
  it("finds the plan's axes for a straight grid, and the rotation of a slanted one", () => {
    expect(degreesOf(gridFrameOf(grid(0), 0.5, 0.5).u)).toBeCloseTo(0);
    const slanted = gridFrameOf(grid(15.2), 0.5, 0.5);
    expect(degreesOf(slanted.u)).toBeCloseTo(15.2);
    expect(slanted.u.x * slanted.v.x + slanted.u.z * slanted.v.z).toBeCloseTo(0);
  });

  it('ignores a diagonal nearest neighbour, as for a sensor in a narrow corner', () => {
    // The first point's only close neighbour is diagonal; the rest of the grid shows its real axes.
    const points = [{ x: 0, z: 0 }, { x: 0.5, z: 0.5 }, ...grid(0, 4, 3).map(p => ({ x: p.x + 5, z: p.z + 5 }))];
    expect(degreesOf(gridFrameOf(points, 0.5, 0.5).u)).toBeCloseTo(0);
  });

  it('puts the x spacing on the right axis for non-square cells, whichever way the grid runs', () => {
    for (const degrees of [10, 100, 170, -80]) {
      const points = grid(degrees, 5, 4, 0.5, 0.3), frame = gridFrameOf(points, 0.5, 0.3);
      expect(allDistinct(cellsOf(points, frame, 0.5, 0.3).cells)).toBe(true);
      const { s, t } = gridPosition(points[points.length - 1], frame, 0.5, 0.3);
      expect(Math.abs(s - Math.round(s)) + Math.abs(t - Math.round(t))).toBeLessThan(1e-6);
    }
  });

  it("falls back to the plan's axes for a single point, duplicates, or no neighbour one cell away", () => {
    expect(gridFrameOf([{ x: 3, z: 4 }], 0.5, 0.5).u).toEqual({ x: 1, z: 0 });
    expect(gridFrameOf([{ x: 3, z: 4 }, { x: 3, z: 4 }], 0.5, 0.5).u).toEqual({ x: 1, z: 0 });
    expect(gridFrameOf([{ x: 0, z: 0 }, { x: 2, z: 1 }], 0.5, 0.5).u).toEqual({ x: 1, z: 0 });
  });
});

describe('cellsOf and cellTexels', () => {
  it('gives each point of a slanted grid its own cell', () => {
    const points = grid(15.2, 20, 12), frame = gridFrameOf(points, 0.5, 0.5);
    const cells = cellsOf(points, frame, 0.5, 0.5);
    expect(allDistinct(cells.cells)).toBe(true);
    expect([cells.iMax - cells.iMin, cells.jMax - cells.jMin]).toEqual([19, 11]);
  });

  it('fills the cells next to the grid, keeps the outermost ring transparent, and leaves the rest empty', () => {
    const points = grid(0), frame = gridFrameOf(points, 0.5, 0.5);
    const colors = points.map((_, k) => [k * 40, 0, 0] as const);
    const texels = cellTexels(cellsOf(points, frame, 0.5, 0.5), colors, 1);
    expect([texels.width, texels.height]).toEqual([7, 6]);
    const at = (x: number, y: number) => Array.from(texels.data.subarray((y * texels.width + x) * 4, (y * texels.width + x) * 4 + 4));
    expect(at(2, 2)).toEqual([0, 0, 0, 255]);       // the first point's own cell
    expect(at(1, 2)).toEqual([0, 0, 0, 255]);       // left of it: filled from it
    expect(at(0, 2)).toEqual([0, 0, 0, 0]);         // the outermost ring: never filled
    expect(at(1, 1)).toEqual([0, 0, 0, 0]);         // the corner, two steps away: transparent
  });

  it("puts each point of a rotated grid on its own texel's centre", () => {
    const points = grid(23, 6, 4), frame = gridFrameOf(points, 0.5, 0.5);
    const colors = points.map((_, k) => [k, 100, 200] as const);
    const texels = cellTexels(cellsOf(points, frame, 0.5, 0.5), colors, 2);
    points.forEach((p, k) => {
      const [u, v] = cellUV(p, frame, 0.5, 0.5, texels);
      const x = u * texels.width - 0.5, y = v * texels.height - 0.5;
      expect(x).toBeCloseTo(Math.round(x));
      expect(y).toBeCloseTo(Math.round(y));
      expect(texels.data[(Math.round(y) * texels.width + Math.round(x)) * 4]).toBe(k);
    });
  });
});
