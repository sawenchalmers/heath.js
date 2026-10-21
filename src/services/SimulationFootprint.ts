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

/**
 * The shared floors of every edge, as sent to the backend in `shared_floors_by_edge`, or undefined when
 * no wall is shared, so requests for buildings without neighbours stay unchanged (and keep their cache).
 */
export const sharedFloorsByEdge = (footprint: BuildingAdjacency): number[][] | undefined =>
  footprint.edges.some(edge => edge.sharedFloors.length > 0)
    ? footprint.edges.map(edge => [...edge.sharedFloors])
    : undefined;

/**
 * Reorder per-edge values for a footprint whose points have been reversed. Reversing the points
 * turns edge i into edge (n - 2 - i) mod n, running the other way.
 */
export const reverseEdgeValues = <T>(values: readonly T[]): T[] =>
  values.map((_, k) => values[(2 * values.length - 2 - k) % values.length]);
