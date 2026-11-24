import * as THREE from 'three';

/** A scene object that may carry a geometry and one or more materials (meshes, lines, points). */
type WithGeometryAndMaterial = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

/** Free a scene object's geometry and material(s), if it has them; other objects are left alone. */
export const disposeObject3D = (object: THREE.Object3D): void => {
  const { geometry, material } = object as WithGeometryAndMaterial;
  geometry?.dispose();
  for (const each of Array.isArray(material) ? material : material ? [material] : []) each.dispose();
};

/** The first material of a scene object, if it has any. */
export const firstMaterialOf = (object: THREE.Object3D): THREE.Material | undefined => {
  const { material } = object as WithGeometryAndMaterial;
  return Array.isArray(material) ? material[0] : material;
};
