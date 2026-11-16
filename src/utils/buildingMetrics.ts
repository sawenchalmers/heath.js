import type { BuildingMetrics, Point3D } from '../types/building';

export const calculateFootprintArea = (points: readonly Point3D[]): number => {
  if (points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) / 2;
};

export const calculatePerimeter = (points: readonly Point3D[]): number => {
  if (points.length < 2) return 0;
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0);
};

export const calculateBuildingMetrics = (
  points: readonly Point3D[],
  floors: number,
  floorHeight: number
): BuildingMetrics => {
  const safeFloors = Number.isFinite(floors) ? Math.max(0, floors) : 0;
  const safeFloorHeight = Number.isFinite(floorHeight) ? Math.max(0, floorHeight) : 0;
  const footprintArea = calculateFootprintArea(points);
  return {
    footprintArea,
    grossFloorArea: footprintArea * safeFloors,
    perimeter: calculatePerimeter(points),
    totalHeight: safeFloors * safeFloorHeight,
  };
};

const pointsEqual = (a: Point3D, b: Point3D, tolerance = 1e-8) =>
  Math.abs(a.x - b.x) <= tolerance && Math.abs(a.z - b.z) <= tolerance;

const orientation = (a: Point3D, b: Point3D, c: Point3D) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

const onSegment = (a: Point3D, b: Point3D, point: Point3D) =>
  point.x >= Math.min(a.x, b.x) - 1e-8 &&
  point.x <= Math.max(a.x, b.x) + 1e-8 &&
  point.z >= Math.min(a.z, b.z) - 1e-8 &&
  point.z <= Math.max(a.z, b.z) + 1e-8;

const segmentsIntersect = (a: Point3D, b: Point3D, c: Point3D, d: Point3D) => {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
      ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  return (Math.abs(o1) <= 1e-8 && onSegment(a, b, c)) ||
    (Math.abs(o2) <= 1e-8 && onSegment(a, b, d)) ||
    (Math.abs(o3) <= 1e-8 && onSegment(c, d, a)) ||
    (Math.abs(o4) <= 1e-8 && onSegment(c, d, b));
};

/** Distance in metres within which footprint boundaries count as touching rather than overlapping. */
const FOOTPRINT_TOUCH_TOLERANCE = 1e-6;

/** Shortest plan distance from a point to the segment a→b. */
const distanceFromPointToSegment = (point: Point3D, a: Point3D, b: Point3D) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
};

/** Whether a point is inside a polygon, on its boundary, or outside it. */
const locatePointInPolygon = (point: Point3D, polygon: readonly Point3D[]): 'inside' | 'boundary' | 'outside' => {
  let inside = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (distanceFromPointToSegment(point, a, b) <= FOOTPRINT_TOUCH_TOLERANCE) return 'boundary';
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
};

/** Which side of the line a→b point c lies on: -1, 1, or 0 when it is on the line (within tolerance). */
const sideOfLine = (a: Point3D, b: Point3D, c: Point3D) => {
  const distance = orientation(a, b, c) / Math.hypot(b.x - a.x, b.z - a.z);
  return Math.abs(distance) <= FOOTPRINT_TOUCH_TOLERANCE ? 0 : Math.sign(distance);
};

/** True when segments a→b and c→d cross through each other's interiors. Segments that only touch or run along each other do not cross. */
const segmentsCrossProperly = (a: Point3D, b: Point3D, c: Point3D, d: Point3D) =>
  sideOfLine(a, b, c) * sideOfLine(a, b, d) < 0 && sideOfLine(c, d, a) * sideOfLine(c, d, b) < 0;

/**
 * Split each edge of `polygon` at the vertices of `other` that lie on it, and locate each piece
 * relative to `other`. Without proper crossings, every piece lies entirely inside, on or outside `other`.
 */
const locateEdgePiecesInPolygon = (polygon: readonly Point3D[], other: readonly Point3D[]) => polygon.flatMap((start, i) => {
  const end = polygon[(i + 1) % polygon.length];
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const splits = [0, 1, ...other
    .filter(vertex => distanceFromPointToSegment(vertex, start, end) <= FOOTPRINT_TOUCH_TOLERANCE)
    .map(vertex => ((vertex.x - start.x) * dx + (vertex.z - start.z) * dz) / lengthSq)]
    .map(t => Math.max(0, Math.min(1, t)))
    .sort((p, q) => p - q);
  return splits.slice(1)
    .map((t, j) => [splits[j], t])
    .filter(([t0, t1]) => (t1 - t0) * Math.sqrt(lengthSq) > FOOTPRINT_TOUCH_TOLERANCE)
    .map(([t0, t1]) => locatePointInPolygon({ x: start.x + dx * (t0 + t1) / 2, y: 0, z: start.z + dz * (t0 + t1) / 2 }, other));
});

/** True when the bounding boxes of two footprints share area (touching boxes do not). */
const boundingBoxesOverlap = (a: readonly Point3D[], b: readonly Point3D[]) => {
  const box = (polygon: readonly Point3D[]) => ({
    minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)),
    minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)),
  });
  const boxA = box(a), boxB = box(b);
  return boxA.maxX > boxB.minX + FOOTPRINT_TOUCH_TOLERANCE && boxB.maxX > boxA.minX + FOOTPRINT_TOUCH_TOLERANCE &&
    boxA.maxZ > boxB.minZ + FOOTPRINT_TOUCH_TOLERANCE && boxB.maxZ > boxA.minZ + FOOTPRINT_TOUCH_TOLERANCE;
};

/** True when two footprints share interior area. Footprints that only touch along edges or at vertices do not overlap. */
export const footprintsOverlap = (a: readonly Point3D[], b: readonly Point3D[]): boolean => {
  if (!boundingBoxesOverlap(a, b)) return false;

  const edgesCross = a.some((aStart, i) => b.some((bStart, j) =>
    segmentsCrossProperly(aStart, a[(i + 1) % a.length], bStart, b[(j + 1) % b.length])));
  if (edgesCross) return true;

  const aPieces = locateEdgePiecesInPolygon(a, b);
  if (aPieces.includes('inside') || locateEdgePiecesInPolygon(b, a).includes('inside')) return true;
  // With no boundary inside the other footprint, the footprints only overlap if they coincide.
  return aPieces.every(piece => piece === 'boundary');
};

const MIN_FOOTPRINT_AREA = 0.01;
/** Return an error message if a footprint is invalid on its own or overlaps any of `otherFootprints`, otherwise null. */
export const validateFootprint = (points: readonly Point3D[], otherFootprints: readonly (readonly Point3D[])[] = []): string | null => {
  if (points.length < 3) return 'A footprint needs at least three vertices.';
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))) {
    return 'Footprint coordinates must be finite numbers.';
  }
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (pointsEqual(points[i], points[j])) return 'Footprint vertices cannot overlap.';
    }
  }
  for (let i = 0; i < points.length; i += 1) {
    const nextI = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j += 1) {
      const nextJ = (j + 1) % points.length;
      if (i === j || nextI === j || nextJ === i) continue;
      if (segmentsIntersect(points[i], points[nextI], points[j], points[nextJ])) {
        return 'Footprint edges cannot cross.';
      }
    }
  }
  if (calculateFootprintArea(points) < MIN_FOOTPRINT_AREA) return `Footprint area must be at least ${MIN_FOOTPRINT_AREA} m².`;
  if (otherFootprints.some(other => footprintsOverlap(points, other))) {
    return 'Footprints cannot overlap another building. They may only touch.';
  }
  return null;
};
