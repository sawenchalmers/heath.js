import type { BuildingModel, Point3D } from '../types/building';
import { ensureHoneybeeCounterClockwise } from './FacadeGeometry';

/** Largest gap in metres between two walls that still counts as a shared wall. */
export const ADJACENCY_TOLERANCE = 0.01;

/** The building properties adjacency depends on. */
export type AdjacencyInput = Pick<BuildingModel, 'id' | 'points' | 'floors' | 'floorHeight'>;

/** One edge of the split footprint, running from `footprint[i]` to `footprint[i + 1]`. */
export interface AdjacencyEdge {
  /** Floors (1-based) whose wall along this edge is shared with a neighbouring building. */
  sharedFloors: number[];
  /** Ids of the neighbouring buildings that share this edge. */
  neighbourIds: string[];
}

/** A building's footprint split where shared walls start and end, with the shared floors of each edge. */
export interface BuildingAdjacency {
  /** Counter-clockwise footprint (Honeybee order) with extra vertices where shared sections start or end. */
  footprint: Point3D[];
  /** One entry per footprint edge, in the same order. */
  edges: AdjacencyEdge[];
}

/** A stretch of an edge, in metres from the edge start, that lies against a neighbour's wall. */
interface CoveredInterval {
  from: number;
  to: number;
  neighbourId: string;
  neighbourHeight: number;
}

/**
 * Floors (1-based) of a building whose storey a neighbour of the given height reaches at least halfway up.
 * Partial overlap in height is simplified to whole storeys, see #19.
 */
const floorsReachedByHeight = (neighbourHeight: number, floors: number, floorHeight: number) =>
  Array.from({ length: floors }, (_, index) => index + 1)
    .filter(floor => neighbourHeight >= (floor - 0.5) * floorHeight - 1e-9);

/**
 * Find where the neighbour's edges lie against edge a→b: they must run the opposite way
 * (both footprints are counter-clockwise) and stay within the tolerance of the edge's line.
 */
const findCoveredIntervals = (a: Point3D, b: Point3D, neighbour: AdjacencyInput, neighbourFootprint: readonly Point3D[]): CoveredInterval[] => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
  const distanceAlong = (p: Point3D) => (p.x - a.x) * ux + (p.z - a.z) * uz;
  const offsetFromLine = (p: Point3D) => (p.x - a.x) * uz - (p.z - a.z) * ux;
  const neighbourHeight = neighbour.floors * neighbour.floorHeight;

  return neighbourFootprint.flatMap((c, i) => {
    const d = neighbourFootprint[(i + 1) % neighbourFootprint.length];
    const tc = distanceAlong(c), td = distanceAlong(d);
    if (td >= tc) return [];
    const from = Math.max(0, td), to = Math.min(length, tc);
    if (to - from <= ADJACENCY_TOLERANCE) return [];
    const offsetAt = (t: number) => offsetFromLine(c) + (t - tc) / (td - tc) * (offsetFromLine(d) - offsetFromLine(c));
    if (Math.abs(offsetAt(from)) > ADJACENCY_TOLERANCE || Math.abs(offsetAt(to)) > ADJACENCY_TOLERANCE) return [];
    return [{ from, to, neighbourId: neighbour.id, neighbourHeight }];
  });
};

/** Sorted cut positions along an edge, snapping cuts within the tolerance of the edge ends or of each other. */
const cutPositions = (length: number, intervals: readonly CoveredInterval[]) => {
  const cuts = [0, length, ...intervals.flatMap(interval => [interval.from, interval.to])]
    .map(t => (t < ADJACENCY_TOLERANCE ? 0 : length - t < ADJACENCY_TOLERANCE ? length : t))
    .sort((p, q) => p - q);
  return cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > ADJACENCY_TOLERANCE);
};

/** Split edge a→b at the covered intervals, and merge neighbouring pieces that end up with the same shared floors. */
const splitEdge = (a: Point3D, b: Point3D, intervals: readonly CoveredInterval[], building: AdjacencyInput) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const pointAt = (t: number): Point3D => ({ x: a.x + (b.x - a.x) * t / length, y: a.y, z: a.z + (b.z - a.z) * t / length });
  const sharing = intervals.filter(interval => floorsReachedByHeight(interval.neighbourHeight, building.floors, building.floorHeight).length > 0);
  const cuts = cutPositions(length, sharing);

  const pieces = cuts.slice(0, -1).map((from, i) => {
    const middle = (from + cuts[i + 1]) / 2;
    const covering = sharing.filter(interval => interval.from <= middle && middle <= interval.to);
    const tallest = Math.max(0, ...covering.map(interval => interval.neighbourHeight));
    return {
      start: from === 0 ? { ...a } : pointAt(from),
      edge: {
        sharedFloors: floorsReachedByHeight(tallest, building.floors, building.floorHeight),
        neighbourIds: [...new Set(covering.map(interval => interval.neighbourId))].sort(),
      },
    };
  });

  const sameEdge = (p: AdjacencyEdge, q: AdjacencyEdge) =>
    p.sharedFloors.join() === q.sharedFloors.join() && p.neighbourIds.join() === q.neighbourIds.join();
  return pieces.filter((piece, i) => i === 0 || !sameEdge(piece.edge, pieces[i - 1].edge));
};

/** Compute the split footprint and the shared floors of each edge for one building, given all other buildings. */
export const computeBuildingAdjacency = (building: AdjacencyInput, others: readonly AdjacencyInput[]): BuildingAdjacency => {
  const footprint = ensureHoneybeeCounterClockwise(building.points);
  const neighbours = others
    .filter(other => other.id !== building.id)
    .map(other => ({ other, footprint: ensureHoneybeeCounterClockwise(other.points) }));

  const pieces = footprint.flatMap((a, i) => {
    const b = footprint[(i + 1) % footprint.length];
    if (Math.hypot(b.x - a.x, b.z - a.z) <= ADJACENCY_TOLERANCE) return [{ start: { ...a }, edge: { sharedFloors: [], neighbourIds: [] } }];
    const intervals = neighbours.flatMap(n => findCoveredIntervals(a, b, n.other, n.footprint));
    return splitEdge(a, b, intervals, building);
  });

  return { footprint: pieces.map(piece => piece.start), edges: pieces.map(piece => piece.edge) };
};

/** Compute adjacency for every building in a workspace, keyed by building id. */
export const computeWorkspaceAdjacency = (buildings: readonly AdjacencyInput[]): Map<string, BuildingAdjacency> =>
  new Map(buildings.map(building => [building.id, computeBuildingAdjacency(building, buildings)]));
