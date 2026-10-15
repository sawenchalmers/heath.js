import type { Point3D } from '../types/building';
import { computeAllBuildingAdjacency, computeBuildingAdjacency, type AdjacencyInput, type BuildingAdjacency } from './BuildingAdjacency';

/**
 * Remove repeated points, a closing point equal to the first, and points that lie on a straight
 * line between their neighbours, so every remaining vertex is a real corner.
 */
export const simplifyFootprint = (points: readonly Point3D[]): Point3D[] => {
  const deduped = points.filter((point, index) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
    if (index === 0) return true;
    const previous = points[index - 1];
    return Math.abs(point.x - previous.x) > 1e-6 || Math.abs(point.z - previous.z) > 1e-6;
  });
  if (deduped.length > 2) {
    const first = deduped[0], last = deduped[deduped.length - 1];
    if (first.x === last.x && first.z === last.z) deduped.pop();
  }
  if (deduped.length < 4) return deduped.map(point => ({ ...point }));

  const corners = deduped.filter((current, i) => {
    const previous = deduped[(i - 1 + deduped.length) % deduped.length];
    const next = deduped[(i + 1) % deduped.length];
    const cross = (current.x - previous.x) * (next.z - current.z) - (current.z - previous.z) * (next.x - current.x);
    return Math.abs(cross) > 1e-9;
  });
  return (corners.length >= 3 ? corners : deduped).map(point => ({ ...point }));
};

/** Copy of a building with its footprint simplified. */
const withSimplifiedFootprint = (building: AdjacencyInput): AdjacencyInput => ({ ...building, points: simplifyFootprint(building.points) });

/**
 * The footprint each building is previewed and simulated with: simplified, in Honeybee counter-clockwise
 * order, and split where walls shared with other buildings start and end. Keyed by building id.
 */
export const buildSimulationFootprints = (buildings: readonly AdjacencyInput[]): Map<string, BuildingAdjacency> =>
  computeAllBuildingAdjacency(buildings.map(withSimplifiedFootprint));

/** `buildSimulationFootprints` for a single building, given the buildings around it. */
export const buildSimulationFootprint = (building: AdjacencyInput, buildings: readonly AdjacencyInput[]): BuildingAdjacency =>
  computeBuildingAdjacency(withSimplifiedFootprint(building), buildings.map(withSimplifiedFootprint));

/** Window-to-wall ratio per edge for one storey: 0 on walls shared on that floor, otherwise `wwr`. */
export const wwrByEdgeForFloor = (footprint: BuildingAdjacency, wwr: number, floor: number): number[] =>
  footprint.edges.map(edge => (edge.sharedFloors.includes(floor) ? 0 : wwr));

/**
 * Window-to-wall ratio per floor and edge, as `result[floor - 1][edge]`: 0 where that floor's wall is shared.
 * This is the exact data a multi-storey model needs (energy, and daylight once it models every floor).
 */
export const wwrByFloorAndEdge = (footprint: BuildingAdjacency, wwr: number, floors: number): number[][] =>
  Array.from({ length: floors }, (_, index) => wwrByEdgeForFloor(footprint, wwr, index + 1));

/**
 * Window-to-wall ratio per edge for a whole-building model, where one value applies to every storey:
 * 0 only on walls shared on all floors. Partly shared walls keep their windows until per-floor data
 * is sent to the backend (#13).
 */
export const wwrByEdgeForAllFloors = (footprint: BuildingAdjacency, wwr: number, floors: number): number[] =>
  footprint.edges.map(edge => (edge.sharedFloors.length >= floors ? 0 : wwr));

/**
 * Reorder per-edge values for a footprint whose points have been reversed. Reversing the points
 * turns edge i into edge (n - 2 - i) mod n, running the other way.
 */
export const reverseEdgeValues = <T>(values: readonly T[]): T[] =>
  values.map((_, k) => values[(2 * values.length - 2 - k) % values.length]);
