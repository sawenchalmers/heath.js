import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DaylightVisualizationService,
  getOverlayDatasetsForResults,
  getOverlayPointsForResults,
} from '../DaylightVisualizationService';
import type { DaylightRunSummary } from '../../types/daylight';

const makeResult = (
  points: Array<{ x: number; y: number; z: number; value: number }>,
  grid?: { x_dim: number; y_dim: number; offset: number }
): DaylightRunSummary => ({
  status: 'complete',
  sensorCount: points.length,
  meanDF: 10,
  sda: 50,
  points,
  sensorGrids: [],
  sensorGrid: grid,
  startedAt: '2025-01-01T00:00:00.000Z',
});

describe('daylight overlay datasets', () => {
  it('preserves result and point ordering with the submitted rectangular cell dimensions', () => {
    const first = [{ x: 5, y: 0.75, z: 2, value: 1 }, { x: 1, y: 0.75, z: 9, value: 2 }];
    const second = [{ x: -3, y: 3.75, z: 4, value: 3 }];
    const results = {
      a: makeResult(first, { x_dim: 0.3, y_dim: 0.7, offset: 0.75 }),
      b: makeResult(second, { x_dim: 0.9, y_dim: 0.4, offset: 0.75 }),
    };

    expect(getOverlayPointsForResults(results)).toEqual([...first, ...second]);
    expect(getOverlayDatasetsForResults(results)).toEqual([
      { points: first, cellSizeX: 0.3, cellSizeZ: 0.7 },
      { points: second, cellSizeX: 0.9, cellSizeZ: 0.4 },
    ]);
  });

  it("carries each building's outline when given", () => {
    const points = [{ x: 1, y: 0.75, z: 1, value: 1 }];
    const outline = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }];
    expect(getOverlayDatasetsForResults({ a: makeResult(points), b: makeResult(points) }, 'df', { a: outline })).toEqual([
      { points, cellSizeX: 0.5, cellSizeZ: 0.5, outline },
      { points, cellSizeX: 0.5, cellSizeZ: 0.5 },
    ]);
  });

  it('uses the 0.5 m historical fallback without deriving dimensions from coordinates', () => {
    const points = [{ x: 100, y: 0.75, z: -10, value: 1 }];
    expect(getOverlayDatasetsForResults({ a: makeResult(points) })).toEqual([
      { points, cellSizeX: 0.5, cellSizeZ: 0.5 },
    ]);
  });
});

describe('DaylightVisualizationService', () => {
  it('draws one opaque surface per floor, inside the outline, textured with one texel per cell', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    const floor = (y: number) => [
      { x: 0.25, y, z: 0.25, value: 0.5 }, { x: 0.75, y, z: 0.25, value: 7 },
      { x: 0.25, y, z: 0.75, value: 3 }, { x: 0.75, y, z: 0.75, value: 12 },
    ];
    const outline = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }, { x: 0, z: 1 }];

    service.renderDatasets(scene, [{ points: [...floor(0.75), ...floor(4.25)], cellSizeX: 0.5, cellSizeZ: 0.5, outline }]);

    const group = scene.getObjectByName('daylight-sensor-overlay') as THREE.Group;
    expect(group.children).toHaveLength(2);
    const mesh = group.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.map?.magFilter).toBe(THREE.NearestFilter);

    const position = mesh.geometry.getAttribute('position');
    expect(position.count).toBe(4);
    expect(position.getY(0)).toBeCloseTo(0.75);
    expect((group.children[1] as THREE.Mesh).geometry.getAttribute('position').getY(0)).toBeCloseTo(4.25);
    expect(mesh.geometry.getIndex()?.count).toBe(6);

    // The outline's corner (0, 0) sits at the outer edge of the first cell's texel: 2 fill rings + half a cell in.
    const texture = material.map as THREE.DataTexture;
    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0) * texture.image.width).toBeCloseTo(2);
    expect(uv.getY(0) * texture.image.height).toBeCloseTo(2);
  });

  it('without an outline, covers the cells and the filled ring around them', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    service.renderDatasets(scene, [{ points: [{ x: 1, y: 0.75, z: 1, value: 2 }], cellSizeX: 0.5, cellSizeZ: 0.5 }]);
    const mesh = (scene.getObjectByName('daylight-sensor-overlay') as THREE.Group).children[0] as THREE.Mesh;
    const xs = Array.from({ length: 4 }, (_, k) => mesh.geometry.getAttribute('position').getX(k));
    expect(Math.min(...xs)).toBeCloseTo(1 - 0.25 - 2 * 0.5);
    expect(Math.max(...xs)).toBeCloseTo(1 + 0.25 + 2 * 0.5);
  });

  it('supports repeated hide/show cycles without discarding the overlay', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    service.renderDatasets(scene, [{
      points: [{ x: 0, y: 0.75, z: 0, value: 2 }],
      cellSizeX: 0.5,
      cellSizeZ: 0.5,
    }]);

    service.setVisible(scene, false);
    expect(service.isVisible).toBe(false);
    expect(scene.getObjectByName('daylight-sensor-overlay')?.visible).toBe(false);
    service.setVisible(scene, true);
    expect(service.isVisible).toBe(true);
    expect(scene.getObjectByName('daylight-sensor-overlay')?.visible).toBe(true);
    service.clear(scene);
    expect(service.isVisible).toBe(false);
    expect(scene.getObjectByName('daylight-sensor-overlay')).toBeUndefined();
  });
});
