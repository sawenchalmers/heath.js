import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingData } from '../../types/building';
import { WindowService } from '../WindowService';
import { buildFacadeLayout, getBuildingFacadeParameters } from '../FacadeGeometry';

const config = {
  windowWidth: 1.2,
  windowHeight: 1.5,
  windowSpacing: 0.3,
  offsetDistance: 0.1,
  frameThickness: 0.05,
  maxWindows: 1000
};

const building = (): BuildingData => ({
  id: 'building-1',
  mesh: {} as BuildingData['mesh'],
  points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }],
  footprintArea: 80,
  metrics: { footprintArea: 80, grossFloorArea: 80, perimeter: 36, totalHeight: 3 },
  floors: 1,
  floorHeight: 3,
  createdAt: new Date(),
  window_to_wall_ratio: 0.4,
  window_overhang: false,
  window_overhang_depth: 0.5
});

const scaleAt = (mesh: THREE.InstancedMesh, index: number): THREE.Vector3 => {
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  return scale;
};

describe('WindowService facade overlays', () => {
  it('renders exact glazing, decorative frames, and three baseline shade planes per aperture', () => {
    const service = new WindowService(new THREE.Scene(), config);
    const testBuilding = building();
    const apertures = buildFacadeLayout(
      testBuilding.points,
      testBuilding.floors,
      testBuilding.floorHeight,
      getBuildingFacadeParameters(testBuilding)
    ).apertures;
    service.addBuildingWindows(testBuilding, config);

    expect(service.getTotalWindowCount()).toBe(apertures.length);
    expect(service.glassInstancedMesh.count).toBe(apertures.length);
    expect(service.frameInstancedMesh.count).toBe(apertures.length * 4);
    expect(service.overhangInstancedMesh.count).toBe(apertures.length * 3);
    expect(scaleAt(service.glassInstancedMesh, 0).x).toBeCloseTo(apertures[0].width, 6);
    expect(scaleAt(service.glassInstancedMesh, 0).y).toBeCloseTo(apertures[0].height, 6);
    const glassMaterial = service.glassInstancedMesh.material as THREE.MeshPhysicalMaterial;
    expect(glassMaterial).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(glassMaterial.polygonOffset).toBe(true);
    expect(glassMaterial.polygonOffsetFactor).toBe(-2);
    expect(glassMaterial.polygonOffsetUnits).toBe(-2);
    expect(glassMaterial.emissive.getHex()).toBe(0x000000);
    expect(service.frameInstancedMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(service.overhangInstancedMesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(scaleAt(service.overhangInstancedMesh, 0).y).toBeCloseTo(0.3, 6);
    expect(scaleAt(service.overhangInstancedMesh, 1).x).toBeCloseTo(0.3, 6);
    expect(scaleAt(service.overhangInstancedMesh, 2).x).toBeCloseTo(0.3, 6);
    service.dispose();
  });

  it('adds enabled additional depth only to horizontal overhang planes', () => {
    const service = new WindowService(new THREE.Scene(), config);
    service.addBuildingWindows({ ...building(), window_overhang: true }, config);

    expect(scaleAt(service.overhangInstancedMesh, 0).y).toBeCloseTo(0.8, 6);
    expect(scaleAt(service.overhangInstancedMesh, 1).x).toBeCloseTo(0.3, 6);
    expect(scaleAt(service.overhangInstancedMesh, 2).x).toBeCloseTo(0.3, 6);
    service.dispose();
  });

  it.each([
    ['counter-clockwise', building().points],
    ['clockwise', [...building().points].reverse()],
    ['irregular', [
      { x: 0, y: 0, z: 0 },
      { x: 7, y: 0, z: -1 },
      { x: 11, y: 0, z: 4 },
      { x: 5, y: 0, z: 9 },
      { x: -2, y: 0, z: 5 },
    ]],
  ])('uses a proper right-handed glass/frame transform for a %s footprint', (_label, points) => {
    const testBuilding = { ...building(), points };
    const service = new WindowService(new THREE.Scene(), config);
    service.addBuildingWindows(testBuilding, config);
    const apertures = buildFacadeLayout(
      testBuilding.points,
      testBuilding.floors,
      testBuilding.floorHeight,
      getBuildingFacadeParameters(testBuilding)
    ).apertures;

    apertures.forEach((aperture, index) => {
      const glassMatrix = new THREE.Matrix4();
      service.glassInstancedMesh.getMatrixAt(index, glassMatrix);
      const glassQuaternion = new THREE.Quaternion();
      glassMatrix.decompose(new THREE.Vector3(), glassQuaternion, new THREE.Vector3());
      const rotation = new THREE.Matrix3().setFromMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(glassQuaternion)
      );
      expect(rotation.determinant()).toBeCloseTo(1, 6);

      const normal = new THREE.Vector3(0, 0, 1).applyMatrix3(rotation).normalize();
      expect(normal.x).toBeCloseTo(aperture.outward.x, 6);
      expect(normal.y).toBeCloseTo(aperture.outward.y, 6);
      expect(normal.z).toBeCloseTo(aperture.outward.z, 6);

      const frameMatrix = new THREE.Matrix4();
      service.frameInstancedMesh.getMatrixAt(index * 4, frameMatrix);
      const frameQuaternion = new THREE.Quaternion();
      frameMatrix.decompose(new THREE.Vector3(), frameQuaternion, new THREE.Vector3());
      const frameRotation = new THREE.Matrix3().setFromMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(frameQuaternion)
      );
      const frameNormal = new THREE.Vector3(0, 0, 1).applyMatrix3(frameRotation).normalize();
      expect(frameRotation.determinant()).toBeCloseTo(1, 6);
      expect(frameNormal.dot(new THREE.Vector3(
        aperture.outward.x,
        aperture.outward.y,
        aperture.outward.z
      ))).toBeCloseTo(1, 6);
    });
    service.dispose();
  });
});

// Visual explanation of these tests (group 4):
// https://claude.ai/artifact/G3TizxVrAig6HLK3U61E8Y (private Claude artifact; share it before others can open it)
describe('windows on shared walls', () => {
  /** Number of apertures a building has on its own, with no neighbours. */
  const aloneCount = (b: BuildingData) =>
    buildFacadeLayout(b.points, b.floors, b.floorHeight, getBuildingFacadeParameters(b)).apertures.length;
  /** Number of apertures on the wall along x = 10 for a 10 × 8 building with the given floors. */
  const sharedWallCount = (floors: number[]) =>
    buildFacadeLayout(building().points, 2, 3, getBuildingFacadeParameters(building()))
      .apertures.filter(aperture => aperture.edgeIndex === 1 && floors.includes(aperture.floorNumber)).length;

  it('removes windows on the shared wall of both buildings, and restores them when they move apart', () => {
    const service = new WindowService(new THREE.Scene(), config);
    const left = { ...building(), id: 'left', floors: 2 };
    const right = { ...building(), id: 'right', floors: 2, points: building().points.map(p => ({ ...p, x: p.x + 10 })) };
    service.addBuildingWindows(left, config);
    service.addBuildingWindows(right, config);

    const removedPerBuilding = sharedWallCount([1, 2]);
    expect(removedPerBuilding).toBeGreaterThan(0);
    expect(service.getBuildingWindowCount('left')).toBe(aloneCount(left) - removedPerBuilding);
    expect(service.getBuildingWindowCount('right')).toBe(aloneCount(right) - removedPerBuilding);

    service.updateBuildingWindows({ ...right, points: right.points.map(p => ({ ...p, x: p.x + 5 })) }, config);
    expect(service.getBuildingWindowCount('left')).toBe(aloneCount(left));
    service.dispose();
  });

  it('keeps windows on the floors above a lower neighbour', () => {
    const service = new WindowService(new THREE.Scene(), config);
    const tall = { ...building(), id: 'tall', floors: 2 };
    const low = { ...building(), id: 'low', floors: 1, points: building().points.map(p => ({ ...p, x: p.x + 10 })) };
    service.addBuildingWindows(tall, config);
    service.addBuildingWindows(low, config);

    expect(service.getBuildingWindowCount('tall')).toBe(aloneCount(tall) - sharedWallCount([1]));
    service.dispose();
  });
});

describe('per-building facade focus', () => {
  it('ghosts only neighboring facade batches and preserves them through updates and restoration', async () => {
    const { SceneAppearanceManager } = await import('../../core/SceneAppearanceManager');
    const scene = new THREE.Scene(), service = new WindowService(scene, config), appearance = new SceneAppearanceManager();
    const a = building(), b = { ...building(), id: 'b', points: building().points.map(p => ({ ...p, x: p.x + 25 })) };
    service.addBuildingWindows(a, config); service.addBuildingWindows(b, config);
    const total = service.getTotalWindowCount(), aCount = service.getBuildingWindowCount(a.id);
    const focus = (id: string | null) => {
      service.setEditingBuilding(id);
      appearance.setMode(scene, id ? { kind: 'editing', buildingId: id } : { kind: 'normal' });
    };
    focus(a.id);
    const contextFrames = scene.getObjectByName('facade-frames-context') as THREE.InstancedMesh;
    const contextGlass = scene.getObjectByName('facade-glass-context') as THREE.InstancedMesh;
    const contextShades = scene.getObjectByName('facade-shades-context') as THREE.InstancedMesh;
    expect(service.glassInstancedMesh.count).toBe(aCount);
    expect(contextGlass.count).toBe(total - aCount);
    for (const mesh of [contextFrames, contextGlass, contextShades]) {
      expect((mesh.material as THREE.Material).opacity).toBe(.28);
      expect((mesh.material as THREE.Material).depthWrite).toBe(false);
      expect(mesh.castShadow).toBe(false);
    }
    expect((service.frameInstancedMesh.material as THREE.Material).opacity).toBe(1);
    expect(contextFrames.boundingBox!.min.x).toBeGreaterThan(20);
    service.updateBuildingWindows({ ...a, floors: 2 }, config);
    expect(contextGlass.count).toBe(total - aCount);
    expect((contextFrames.material as THREE.Material).opacity).toBe(.28);
    focus(b.id);
    expect(service.glassInstancedMesh.count).toBe(total - aCount);
    expect(contextGlass.count).toBe(aCount * 2);
    focus(null);
    expect(contextFrames.visible).toBe(false);
    expect(contextFrames.count).toBe(0);
    expect(service.glassInstancedMesh.count).toBe(service.getTotalWindowCount());
    expect((service.frameInstancedMesh.material as THREE.Material).opacity).toBe(1);
    focus(a.id); service.clearAllWindows();
    expect(contextGlass.count).toBe(0); expect(service.glassInstancedMesh.count).toBe(0);
    appearance.restore(); service.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
