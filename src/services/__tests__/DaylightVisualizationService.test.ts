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

  it('uses the 0.5 m historical fallback without deriving dimensions from coordinates', () => {
    const points = [{ x: 100, y: 0.75, z: -10, value: 1 }];
    expect(getOverlayDatasetsForResults({ a: makeResult(points) })).toEqual([
      { points, cellSizeX: 0.5, cellSizeZ: 0.5 },
    ]);
  });
});

describe('DaylightVisualizationService', () => {
  it('renders one opaque, depth-writing instanced mesh per dataset in sensor order', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    const points = [
      { x: 4, y: 6.75, z: 3, value: 0.5 },
      { x: -2, y: 0.75, z: 8, value: 7 },
    ];

    service.renderDatasets(scene, [{ points, cellSizeX: 0.3, cellSizeZ: 0.7 }]);

    const group = scene.getObjectByName('daylight-sensor-overlay') as THREE.Group;
    const mesh = group.children[0] as THREE.InstancedMesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(group.children).toHaveLength(1);
    expect(mesh.count).toBe(2);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(mesh.renderOrder).toBe(0);

    const size = (mesh.geometry as THREE.PlaneGeometry).parameters;
    expect(size.width).toBeCloseTo(0.3);
    expect(size.height).toBeCloseTo(0.7);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    mesh.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.toArray()).toEqual([4, 6.75, 3]);
    mesh.getMatrixAt(1, matrix);
    position.setFromMatrixPosition(matrix);
    expect(position.toArray()).toEqual([-2, 0.75, 8]);

    const firstColor = new THREE.Color();
    const secondColor = new THREE.Color();
    mesh.getColorAt(0, firstColor);
    mesh.getColorAt(1, secondColor);
    expect(firstColor.equals(secondColor)).toBe(false);
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
