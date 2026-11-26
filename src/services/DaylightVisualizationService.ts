import * as THREE from 'three';
import {
  DaylightOverlayDataset,
  DaylightRunSummary,
  DaylightSensorPoint,
} from '../types/daylight';
import { cellsOf, cellTexels, cellUV, gridFrameOf, type CellTexels, type GridFrame, type PlanPoint } from '../utils/daylightGrid';

const HISTORICAL_CELL_SIZE_METERS = 0.5;

/**
 * Preserve each result's backend point order and exact submitted grid dimensions.
 * With `outlines` (floor outlines by building id), each dataset carries its building's floor outline to draw inside.
 */
export const getOverlayDatasetsForResults = (
  resultsByBuildingId: Record<string, DaylightRunSummary> | undefined,
  mode: 'df' | 'sda' = 'df',
  outlines?: Record<string, ReadonlyArray<PlanPoint>>
): DaylightOverlayDataset[] => {
  if (!resultsByBuildingId) return [];

  return Object.entries(resultsByBuildingId).flatMap(([buildingId, result]) => {
    const points = mode === 'sda' && result.sdaPoints?.length
      ? result.sdaPoints
      : result.points;
    if (points.length === 0) return [];

    const outline = outlines?.[buildingId];
    return [{
      points,
      cellSizeX: result.sensorGrid?.x_dim ?? HISTORICAL_CELL_SIZE_METERS,
      cellSizeZ: result.sensorGrid?.y_dim ?? HISTORICAL_CELL_SIZE_METERS,
      ...(outline && outline.length >= 3 ? { outline } : {}),
    }];
  });
};

/** Each building's floor outline in plan, by id, for drawing its results inside it. */
export const floorOutlinesById = (buildings: ReadonlyArray<{ id: string; points: ReadonlyArray<PlanPoint> }>) =>
  Object.fromEntries(buildings.map(building => [building.id, building.points]));

/** Cells by a wall with no sensor of their own take a neighbour's colour this many rings deep. */
const EDGE_FILL_CELLS = 2;

/** A dataset's points per floor (by height), keeping their order. */
const floorsOf = (points: readonly DaylightSensorPoint[]): DaylightSensorPoint[][] => {
  const floors = new Map<number, DaylightSensorPoint[]>();
  for (const point of points) {
    const key = Math.round(point.y * 1000);
    const floor = floors.get(key);
    if (floor) floor.push(point);
    else floors.set(key, [point]);
  }
  return [...floors.values()];
};

/** A colour as sRGB bytes, for a texture marked as sRGB. */
const srgbBytes = (color: THREE.Color): [number, number, number] => {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, THREE.SRGBColorSpace);
  return [Math.round(rgb.r * 255), Math.round(rgb.g * 255), Math.round(rgb.b * 255)];
};

/** The plan corners of the texture's cells, for a floor drawn without an outline. */
const cellExtent = (frame: GridFrame, dx: number, dz: number, texels: CellTexels): PlanPoint[] => {
  const s0 = texels.i0 - 0.5, s1 = texels.i0 + texels.width - 0.5;
  const t0 = texels.j0 - 0.5, t1 = texels.j0 + texels.height - 0.5;
  const at = (s: number, t: number) => ({
    x: frame.origin.x + s * dx * frame.u.x + t * dz * frame.v.x,
    z: frame.origin.z + s * dx * frame.u.z + t * dz * frame.v.z,
  });
  return [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
};

/** A flat surface over `outline` at height `y`, textured with the cells. */
const floorSurface = (outline: readonly PlanPoint[], y: number, frame: GridFrame, dx: number, dz: number, texels: CellTexels) => {
  const triangles = THREE.ShapeUtils.triangulateShape(outline.map(p => new THREE.Vector2(p.x, p.z)), []);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(outline.flatMap(p => [p.x, y, p.z]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(outline.flatMap(p => cellUV(p, frame, dx, dz, texels)), 2));
  geometry.setIndex(triangles.flat());
  return geometry;
};

export class DaylightVisualizationService {
  private overlayGroup: THREE.Group | null = null;
  private visible = false;

  get isVisible(): boolean {
    return this.visible;
  }

  /** Draw the datasets' results in the scene, one surface per floor, replacing any earlier overlay. */
  renderDatasets(
    scene: THREE.Scene,
    datasets: DaylightOverlayDataset[],
    mode: 'df' | 'sda' = 'df'
  ): void {
    this.clear(scene);
    if (!datasets.some((dataset) => dataset.points.length > 0)) return;

    const group = new THREE.Group();
    group.name = 'daylight-sensor-overlay';
    group.userData.analysisRole = 'daylight-overlay';
    group.userData.isDaylightOverlay = true;

    // One surface per floor: the floor outline (or the cells' extent), coloured by a texture with one texel per
    // sensor cell, laid along the engine's grid (rotated on slanted buildings).
    datasets.forEach((dataset, datasetIndex) => {
      floorsOf(dataset.points).forEach((floor, floorIndex) => {
        const dx = dataset.cellSizeX, dz = dataset.cellSizeZ;
        const frame = gridFrameOf(floor, dx, dz);
        const colors = floor.map(point => srgbBytes(mode === 'sda'
          ? this.getColorForSdaAbsolute(point.value)
          : this.getColorForDfAbsolute(point.value)));
        // Without an outline nothing is filled past the sensors' own cells, so nothing sticks out past the walls.
        const texels = cellTexels(cellsOf(floor, frame, dx, dz), colors, dataset.outline ? EDGE_FILL_CELLS : 0);
        const texture = new THREE.DataTexture(texels.data, texels.width, texels.height, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.needsUpdate = true;

        const outline = dataset.outline ?? cellExtent(frame, dx, dz, texels);
        const geometry = floorSurface(outline, floor[0].y, frame, dx, dz, texels);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: false,
          opacity: 1,
          alphaTest: 0.5,
          depthTest: true,
          depthWrite: true,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `daylight-sensor-dataset-${datasetIndex}-floor-${floorIndex}`;
        mesh.userData.analysisRole = 'daylight-overlay';
        mesh.userData.isDaylightOverlay = true;
        group.add(mesh);
      });
    });

    scene.add(group);
    this.overlayGroup = group;
    this.setVisible(scene, true);
  }

  setVisible(_scene: THREE.Scene, visible: boolean): void {
    if (this.overlayGroup) this.overlayGroup.visible = visible;
    this.visible = Boolean(this.overlayGroup && visible);
  }

  clear(scene: THREE.Scene): void {
    if (!this.overlayGroup) {
      this.visible = false;
      return;
    }

    this.overlayGroup.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      // Each floor's material has its own cell texture.
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    });
    scene.remove(this.overlayGroup);
    this.overlayGroup = null;
    this.visible = false;
  }

  private getColorForDfAbsolute(dfPercent: number): THREE.Color {
    const v = Math.max(0, dfPercent);
    if (v < 1) return this.interpolateColor(new THREE.Color('#1e3a8a'), new THREE.Color('#1d4ed8'), v);
    if (v < 2) return this.interpolateColor(new THREE.Color('#1d4ed8'), new THREE.Color('#06b6d4'), v - 1);
    if (v < 5) return this.interpolateColor(new THREE.Color('#06b6d4'), new THREE.Color('#22c55e'), (v - 2) / 3);
    if (v < 10) return this.interpolateColor(new THREE.Color('#22c55e'), new THREE.Color('#f59e0b'), (v - 5) / 5);
    return this.interpolateColor(new THREE.Color('#f59e0b'), new THREE.Color('#ef4444'), Math.min(1, (v - 10) / 5));
  }

  private getColorForSdaAbsolute(sdaPercent: number): THREE.Color {
    return sdaPercent >= 50 ? new THREE.Color('#22c55e') : new THREE.Color('#ef4444');
  }

  private interpolateColor(start: THREE.Color, end: THREE.Color, t: number): THREE.Color {
    return start.clone().lerp(end, Math.max(0, Math.min(1, t)));
  }
}

export const daylightVisualizationService = new DaylightVisualizationService();
