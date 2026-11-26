// The engine's sensor grid as cells, for drawing daylight results as one surface per floor.
/** A point in plan: x and z of the scene. */
export interface PlanPoint { x: number; z: number }

/** The grid's axes in plan: unit vectors `u` and `v` through `origin`, one cell apart per `dx` and `dz`. */
export interface GridFrame { origin: PlanPoint; u: PlanPoint; v: PlanPoint }

/** Cells of a grid: each point's (i, j) and the range they cover. */
export interface GridCells {
  cells: Array<{ i: number; j: number }>;
  iMin: number; iMax: number; jMin: number; jMax: number;
}

/**
 * The grid's axes, from its points. The engine lays the grid along a footprint's wall, so on a slanted building
 * it's rotated: `u` points from the first point to its nearest neighbour, folded into [0°, 90°), and `v` is
 * perpendicular to it. A single point gets the plan's own axes.
 */
export const gridFrameOf = (points: readonly PlanPoint[]): GridFrame => {
  const origin = { x: points[0].x, z: points[0].z };
  let nearest: PlanPoint | null = null, best = Infinity;
  for (const p of points.slice(1)) {
    const d = Math.hypot(p.x - origin.x, p.z - origin.z);
    if (d > 1e-6 && d < best) { best = d; nearest = p; }
  }
  if (!nearest) return { origin, u: { x: 1, z: 0 }, v: { x: 0, z: 1 } };
  const quarter = Math.PI / 2;
  let angle = Math.atan2(nearest.z - origin.z, nearest.x - origin.x) % quarter;
  if (angle < 0) angle += quarter;
  if (quarter - angle < 1e-9) angle = 0;
  return { origin, u: { x: Math.cos(angle), z: Math.sin(angle) }, v: { x: -Math.sin(angle), z: Math.cos(angle) } };
};

/** A plan point's position in the grid, in cells (not rounded): cell (i, j)'s centre is at exactly (i, j). */
export const gridPosition = (p: PlanPoint, frame: GridFrame, dx: number, dz: number) => {
  const rx = p.x - frame.origin.x, rz = p.z - frame.origin.z;
  return { s: (rx * frame.u.x + rz * frame.u.z) / dx, t: (rx * frame.v.x + rz * frame.v.z) / dz };
};

/** The cell of each point, and the range of cells they cover. */
export const cellsOf = (points: readonly PlanPoint[], frame: GridFrame, dx: number, dz: number): GridCells => {
  const cells = points.map(p => {
    const { s, t } = gridPosition(p, frame, dx, dz);
    return { i: Math.round(s), j: Math.round(t) };
  });
  return {
    cells,
    iMin: Math.min(...cells.map(c => c.i)), iMax: Math.max(...cells.map(c => c.i)),
    jMin: Math.min(...cells.map(c => c.j)), jMax: Math.max(...cells.map(c => c.j)),
  };
};

/** One texel per cell, with `pad` extra cells on every side (texel (0, 0) is cell (iMin - pad, jMin - pad)). */
export interface CellTexels { data: Uint8Array; width: number; height: number; i0: number; j0: number }

/**
 * RGBA texels with each point's colour in its cell. Empty cells next to filled ones take a neighbour's colour,
 * `pad` rings deep, so cells by a wall that have no sensor of their own aren't holes; cells further out stay
 * transparent. `colors` holds each point's colour as sRGB bytes, in the points' order.
 */
export const cellTexels = (
  grid: GridCells, colors: ReadonlyArray<readonly [number, number, number]>, pad: number,
): CellTexels => {
  const i0 = grid.iMin - pad, j0 = grid.jMin - pad;
  const width = grid.iMax - grid.iMin + 1 + 2 * pad, height = grid.jMax - grid.jMin + 1 + 2 * pad;
  const data = new Uint8Array(width * height * 4);
  grid.cells.forEach(({ i, j }, k) => {
    const at = ((j - j0) * width + (i - i0)) * 4;
    data.set([...colors[k], 255], at);
  });
  for (let ring = 0; ring < pad; ring++) {
    const before = data.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (before[at + 3]) continue;
      const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [x + ox, y + oy])
        .find(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height && before[(ny * width + nx) * 4 + 3]);
      if (from) data.set(before.subarray((from[1] * width + from[0]) * 4, (from[1] * width + from[0]) * 4 + 4), at);
    }
  }
  return { data, width, height, i0, j0 };
};

/** Where a plan point falls in the cell texture, as texture coordinates (0 to 1 across the texels). */
export const cellUV = (p: PlanPoint, frame: GridFrame, dx: number, dz: number, texels: CellTexels): [number, number] => {
  const { s, t } = gridPosition(p, frame, dx, dz);
  return [(s - texels.i0 + 0.5) / texels.width, (t - texels.j0 + 0.5) / texels.height];
};
