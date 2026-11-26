import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  DaylightVisualizationService,
  getOverlayDatasetsForResults,
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

    // The outline's corner (0, 0) sits at the outer edge of the first cell's texel: 2 fill rings and an empty ring in.
    const texture = material.map as THREE.DataTexture;
    const uv = mesh.geometry.getAttribute('uv');
    expect(uv.getX(0) * texture.image.width).toBeCloseTo(3);
    expect(uv.getY(0) * texture.image.height).toBeCloseTo(3);
  });

  it('splits floors given in mixed order, keeping each floor together', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    const points = [0.75, 4.25, 0.75, 4.25].map((y, k) => ({ x: (k % 2) * 0.5, y, z: 0, value: k }));
    service.renderDatasets(scene, [{ points, cellSizeX: 0.5, cellSizeZ: 0.5 }]);
    const meshes = (scene.getObjectByName('daylight-sensor-overlay') as THREE.Group).children as THREE.Mesh[];
    expect(meshes.map(mesh => mesh.geometry.getAttribute('position').getY(0))).toEqual([0.75, 4.25]);
  });

  it('shows nothing where an outline reaches past the cells, instead of stretching the edge colours', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    const outline = [{ x: 10, z: 10 }, { x: 11, z: 10 }, { x: 11, z: 11 }];
    service.renderDatasets(scene, [{ points: [{ x: 0, y: 0.75, z: 0, value: 2 }], cellSizeX: 0.5, cellSizeZ: 0.5, outline }]);
    const mesh = (scene.getObjectByName('daylight-sensor-overlay') as THREE.Group).children[0] as THREE.Mesh;
    const texture = (mesh.material as THREE.MeshBasicMaterial).map as THREE.DataTexture;
    const { data, width, height } = texture.image as unknown as { data: Uint8Array; width: number; height: number };
    // The outline lies entirely past the texture, so clamping samples its border, which is never filled.
    const border = [...Array(width).keys()].flatMap(x => [x, (height - 1) * width + x])
      .concat([...Array(height).keys()].flatMap(y => [y * width, y * width + width - 1]));
    expect(border.every(texel => data[texel * 4 + 3] === 0)).toBe(true);
  });

  it("frees each floor's texture when the overlay is cleared", () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    service.renderDatasets(scene, [{ points: [{ x: 0, y: 0.75, z: 0, value: 2 }], cellSizeX: 0.5, cellSizeZ: 0.5 }]);
    const mesh = (scene.getObjectByName('daylight-sensor-overlay') as THREE.Group).children[0] as THREE.Mesh;
    const dispose = vi.spyOn((mesh.material as THREE.MeshBasicMaterial).map!, 'dispose');
    service.clear(scene);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('without an outline, covers only the cells, so nothing is filled past the sensors', () => {
    const scene = new THREE.Scene();
    const service = new DaylightVisualizationService();
    service.renderDatasets(scene, [{ points: [{ x: 1, y: 0.75, z: 1, value: 2 }], cellSizeX: 0.5, cellSizeZ: 0.5 }]);
    const mesh = (scene.getObjectByName('daylight-sensor-overlay') as THREE.Group).children[0] as THREE.Mesh;
    const xs = Array.from({ length: 4 }, (_, k) => mesh.geometry.getAttribute('position').getX(k));
    // The surface spans the cell and the empty ring around it; the ring shows nothing.
    expect(Math.min(...xs)).toBeCloseTo(1 - 0.25 - 0.5);
    expect(Math.max(...xs)).toBeCloseTo(1 + 0.25 + 0.5);
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
