import * as THREE from 'three';
import type { BuildingModel } from '../types/building';
import { computeWorkspaceAdjacency } from './BuildingAdjacency';

// Temporary debug aid for #13: marks shared walls on each building's own roof, so it is clear
// which building registered the adjacency and for which floors.

/** Width in metres of the band drawn on the roof along a shared edge. */
const BAND_WIDTH = 0.6;
/** Gap in metres between the band and the roof edge, so bands of two touching buildings stay apart. */
const BAND_INSET = 0.15;
/** Height in metres above the roof, so the band doesn't flicker against it. */
const ROOF_OFFSET = 0.05;

/** Describe shared floors compactly, e.g. [1, 2, 3] → "floors 1–3", [2] → "floor 2". */
const describeFloors = (floors: readonly number[]) =>
  floors.length === 1 ? `floor ${floors[0]}` : `floors ${floors[0]}–${floors[floors.length - 1]}`;

/** Create a text label that always faces the camera, or null where canvas text is unavailable (e.g. in tests). */
const createLabel = (text: string): THREE.Sprite | null => {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(134, 25, 143, 0.9)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.font = '600 30px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(3, 0.75, 1);
  sprite.renderOrder = 10;
  return sprite;
};

/** Build, for every building, a band on its own roof along each shared edge, labelled with the shared floors. */
export const buildAdjacencyDebugOverlay = (buildings: readonly BuildingModel[]): THREE.Group => {
  const group = new THREE.Group();
  group.name = 'adjacency-debug-overlay';
  const material = new THREE.MeshBasicMaterial({ color: 0xd946ef, side: THREE.DoubleSide });
  const adjacencyById = computeWorkspaceAdjacency(buildings);

  for (const building of buildings) {
    const { footprint, edges } = adjacencyById.get(building.id)!;
    const roofHeight = building.floors * building.floorHeight + ROOF_OFFSET;
    edges.forEach((edge, i) => {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (!edge.sharedFloors.length || length === 0) return;
      // Footprints are counter-clockwise in Honeybee order, so the building's interior is on the left of each edge.
      const inward = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
      const inset = BAND_INSET + BAND_WIDTH / 2;
      const centre = new THREE.Vector3((a.x + b.x) / 2 + inward.x * inset, roofHeight, (a.z + b.z) / 2 + inward.z * inset);

      const band = new THREE.Mesh(new THREE.PlaneGeometry(length, BAND_WIDTH), material);
      band.position.copy(centre);
      band.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x));
      band.raycast = () => {};
      group.add(band);

      const label = createLabel(describeFloors(edge.sharedFloors));
      if (label) {
        label.position.copy(centre).add(new THREE.Vector3(inward.x * 1.2, 0.6, inward.z * 1.2));
        label.raycast = () => {};
        group.add(label);
      }
    });
  }
  return group;
};

/** Remove an overlay from the scene and free its geometries, materials and label textures. */
export const disposeAdjacencyDebugOverlay = (group: THREE.Group) => {
  group.removeFromParent();
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      materials.add(object.material as THREE.Material);
    } else if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      materials.add(object.material);
    }
  });
  materials.forEach(material => material.dispose());
};
