import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject3D, firstMaterialOf } from '../disposeObject3D';

describe('disposeObject3D', () => {
  it('frees a mesh\'s geometry and its material', () => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    disposeObject3D(new THREE.Mesh(geometry, material));
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('frees every material of an object with several', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const spies = materials.map(material => vi.spyOn(material, 'dispose'));
    disposeObject3D(new THREE.Mesh(new THREE.BufferGeometry(), materials));
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce());
  });

  it('leaves an object without geometry or material alone', () => {
    expect(() => disposeObject3D(new THREE.Group())).not.toThrow();
  });
});

describe('firstMaterialOf', () => {
  it('gives the only material, the first of several, or nothing', () => {
    const one = new THREE.MeshBasicMaterial();
    const two = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    expect(firstMaterialOf(new THREE.Mesh(new THREE.BufferGeometry(), one))).toBe(one);
    expect(firstMaterialOf(new THREE.Mesh(new THREE.BufferGeometry(), two))).toBe(two[0]);
    expect(firstMaterialOf(new THREE.Group())).toBeUndefined();
  });
});
