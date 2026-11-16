import type { Point3D } from '../types/building';
import { validateFootprint } from './buildingMetrics';

export type ScreenPoint = { x: number; y: number };
export const centroid = (points: readonly Point3D[]): Point3D => {
  let area = 0, x = 0, z = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.z - q.x * p.z;
    area += cross;
    x += (p.x + q.x) * cross;
    z += (p.z + q.z) * cross;
  });
  if (Math.abs(area) < 1e-10) return { x: 0, y: 0, z: 0 };
  return { x: x / (3 * area), y: 0, z: z / (3 * area) };
};
export const translateFootprint = (points: readonly Point3D[], dx: number, dz: number) =>
  points.map(p => ({ x: p.x + dx, y: 0, z: p.z + dz }));
export const rotateFootprint = (points: readonly Point3D[], angle: number, pivot = centroid(points)) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return points.map(p => ({ x: pivot.x + (p.x - pivot.x) * c - (p.z - pivot.z) * s,
    y: 0, z: pivot.z + (p.x - pivot.x) * s + (p.z - pivot.z) * c }));
};
export const rectangle = (a: Point3D, b: Point3D): Point3D[] =>
  [a, { x: b.x, y: 0, z: a.z }, b, { x: a.x, y: 0, z: b.z }].map(p => ({ ...p }));
export const nearestOnSegment = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, distance: Math.hypot(p.x - point.x, p.y - point.y) };
};

export interface Snap { point: Point3D; kind: 'Close' | 'Vertex' | 'Align X' | 'Align Z' | 'Grid'; key: string }
/** Acquisition/release are measured in CSS pixels, independent of zoom and DPR. */
export function resolveSnap(raw: Point3D, project: (p: Point3D) => ScreenPoint,
  vertices: Point3D[], options: { closure?: Point3D; grid: number | null; bypass?: boolean; previous?: Snap | null; origin?: Point3D; axis?: boolean }): Snap | null {
  const constrained = options.axis && options.origin ? (Math.abs(raw.x - options.origin.x) > Math.abs(raw.z - options.origin.z)
    ? { ...raw, z: options.origin.z } : { ...raw, x: options.origin.x }) : raw;
  if (options.bypass) return constrained !== raw ? { point: constrained, kind: constrained.x === raw.x ? 'Align Z' : 'Align X', key: 'axis' } : null;
  const cursor = project(constrained);
  const candidates: Snap[] = [];
  if (options.closure) candidates.push({ point: options.closure, kind: 'Close', key: 'close' });
  vertices.forEach((point, i) => candidates.push({ point, kind: 'Vertex', key: `v${i}` }));
  vertices.forEach((p, i) => {
    candidates.push({ point: { ...constrained, x: p.x }, kind: 'Align X', key: `x${i}` });
    candidates.push({ point: { ...constrained, z: p.z }, kind: 'Align Z', key: `z${i}` });
  });
  if (options.grid) candidates.push({ point: { x: Math.round(constrained.x / options.grid) * options.grid, y: 0,
    z: Math.round(constrained.z / options.grid) * options.grid }, kind: 'Grid', key: `grid-${Math.round(constrained.x / options.grid)}-${Math.round(constrained.z / options.grid)}` });
  if (options.grid && options.previous?.kind === 'Grid') candidates.push(options.previous);
  const compatible = (p: Point3D) => !options.axis || !options.origin ||
    (constrained.x === options.origin.x ? Math.abs(p.x - options.origin.x) < 1e-8 : Math.abs(p.z - options.origin.z) < 1e-8);
  const distance = (p: Point3D) => { const s = project(p); return Math.hypot(s.x - cursor.x, s.y - cursor.y); };
  const rank = (s: Snap) => s.kind === 'Close' ? 0 : s.kind === 'Vertex' ? 1 : s.kind === 'Grid' ? 3 : 2;
  const eligible = candidates.filter(s => compatible(s.point) && distance(s.point) <= (options.previous?.key === s.key ? 14 : 10));
  eligible.sort((a, b) => rank(a) - rank(b) || (options.previous?.key === a.key ? -1 : options.previous?.key === b.key ? 1 : distance(a.point) - distance(b.point)));
  return eligible[0] ?? (constrained !== raw ? { point: constrained, kind: constrained.x === raw.x ? 'Align Z' : 'Align X', key: 'axis' } : null);
}

export const snapRotation = (angle: number, modifiers: { altKey?: boolean; shiftKey?: boolean }) => {
  if (modifiers.altKey) return angle;
  const increment = (modifiers.shiftKey ? 15 : 5) * Math.PI / 180;
  return Math.round(angle / increment) * increment;
};

export const isOrthogonalFootprint = (points: readonly Point3D[]) => points.every((p, i) => {
  const q = points[(i + 1) % points.length];
  return Math.abs(p.x - q.x) < 1e-8 || Math.abs(p.z - q.z) < 1e-8;
});

/** Why a drawn footprint can't become a building (invalid shape, overlap, or not closing at 90° in orthogonal mode), or null if it can. */
export const footprintCreationError = (
  candidate: readonly Point3D[],
  otherFootprints: readonly (readonly Point3D[])[],
  requireOrthogonal: boolean
): string | null =>
  validateFootprint(candidate, otherFootprints)
  ?? (requireOrthogonal && !isOrthogonalFootprint(candidate) ? 'Align the final point with the start to close at 90°.' : null);
