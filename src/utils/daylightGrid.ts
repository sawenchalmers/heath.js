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

// How many points the grid's angle is measured from, and how close a neighbour must be to one cell.
const ANGLE_SAMPLES = 64;
const SPACING_TOLERANCE = 0.02;

/** The frame with `u` at `angle` (radians) through `origin`, and `v` perpendicular to it. */
const frameAt = (origin: PlanPoint, angle: number): GridFrame =>
  ({ origin, u: { x: Math.cos(angle), z: Math.sin(angle) }, v: { x: -Math.sin(angle), z: Math.cos(angle) } });

/** How far the points lie from cell centres in a frame, summed over a sample (0 for a perfect fit). */
const misfit = (points: readonly PlanPoint[], frame: GridFrame, dx: number, dz: number) => points
  .slice(0, ANGLE_SAMPLES)
  .reduce((total, p) => {
    const { s, t } = gridPosition(p, frame, dx, dz);
    return total + Math.abs(s - Math.round(s)) + Math.abs(t - Math.round(t));
  }, 0);

/**
 * The grid's axes, from its points. The engine lays the grid along a wall, so on a slanted building it's rotated.
 * The angle comes from several points' neighbours one cell away along an axis, never a diagonal one, averaged
 * modulo 90°; then `u` is put on whichever axis has the `dx` spacing. Without such a
 * neighbour (a single point, a sparse grid) the plan's own axes are used.
 */
export const gridFrameOf = (points: readonly PlanPoint[], dx: number, dz: number): GridFrame => {
  const origin = { x: points[0].x, z: points[0].z };
  let sumX = 0, sumZ = 0;
  for (const a of points.slice(0, ANGLE_SAMPLES)) {
    for (const b of points) {
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (Math.abs(d - dx) > dx * SPACING_TOLERANCE && Math.abs(d - dz) > dz * SPACING_TOLERANCE) continue;
      // Four times the angle makes directions 90° apart the same, so they can be averaged.
      const four = 4 * Math.atan2(b.z - a.z, b.x - a.x);
      sumX += Math.cos(four); sumZ += Math.sin(four);
    }
  }
  if (Math.hypot(sumX, sumZ) < 1e-9) return frameAt(origin, 0);
  const angle = Math.atan2(sumZ, sumX) / 4;
  const along = frameAt(origin, angle), across = frameAt(origin, angle + Math.PI / 2);
  return misfit(points, across, dx, dz) < misfit(points, along, dx, dz) - 1e-6 ? across : along;
};

/** A plan point's position in the grid, in cells (not rounded): cell (i, j)'s centre is at exactly (i, j). */
export const gridPosition = (p: PlanPoint, frame: GridFrame, dx: number, dz: number) => {
  const rx = p.x - frame.origin.x, rz = p.z - frame.origin.z;
  return { s: (rx * frame.u.x + rz * frame.u.z) / dx, t: (rx * frame.v.x + rz * frame.v.z) / dz };
};

/** The cell of each point, and the range of cells they cover. */
export const cellsOf = (points: readonly PlanPoint[], frame: GridFrame, dx: number, dz: number): GridCells => {
  // A plain loop for the range: spreading a very large array into Math.min can overflow the stack.
  let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
  const cells = points.map(p => {
    const { s, t } = gridPosition(p, frame, dx, dz);
    const i = Math.round(s), j = Math.round(t);
    iMin = Math.min(iMin, i); iMax = Math.max(iMax, i); jMin = Math.min(jMin, j); jMax = Math.max(jMax, j);
    return { i, j };
  });
  return { cells, iMin, iMax, jMin, jMax };
};

/** One texel per cell, with a margin of extra cells on every side (texel (0, 0) is cell (i0, j0)). */
export interface CellTexels { data: Uint8Array; width: number; height: number; i0: number; j0: number }

/**
 * RGBA texels with each point's colour in its cell. Empty cells next to filled ones take a neighbour's colour,
 * `pad` rings deep, so cells by a wall that have no sensor of their own aren't holes; cells further out stay
 * transparent. `colors` holds each point's colour as sRGB bytes, in the points' order.
 * One more ring around that is never filled, so anything outside the cells shows nothing instead of the edge
 * colours stretched by the texture's clamping.
 */
export const cellTexels = (
  grid: GridCells, colors: ReadonlyArray<readonly [number, number, number]>, pad: number,
): CellTexels => {
  const margin = pad + 1;
  const i0 = grid.iMin - margin, j0 = grid.jMin - margin;
  const width = grid.iMax - grid.iMin + 1 + 2 * margin, height = grid.jMax - grid.jMin + 1 + 2 * margin;
  const data = new Uint8Array(width * height * 4);
  grid.cells.forEach(({ i, j }, k) => {
    const at = ((j - j0) * width + (i - i0)) * 4;
    data[at] = colors[k][0]; data[at + 1] = colors[k][1]; data[at + 2] = colors[k][2]; data[at + 3] = 255;
  });
  const steps = [4, -4, width * 4, -width * 4];
  for (let ring = 0; ring < pad; ring++) {
    const before = data.slice();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const at = (y * width + x) * 4;
      if (before[at + 3]) continue;
      for (const step of steps) {
        if (!before[at + step + 3]) continue;
        data[at] = before[at + step]; data[at + 1] = before[at + step + 1]; data[at + 2] = before[at + step + 2]; data[at + 3] = 255;
        break;
      }
    }
  }
  return { data, width, height, i0, j0 };
};

/** Where a plan point falls in the cell texture, as texture coordinates (0 to 1 across the texels). */
export const cellUV = (p: PlanPoint, frame: GridFrame, dx: number, dz: number, texels: CellTexels): [number, number] => {
  const { s, t } = gridPosition(p, frame, dx, dz);
  return [(s - texels.i0 + 0.5) / texels.width, (t - texels.j0 + 0.5) / texels.height];
};
