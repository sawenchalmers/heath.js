import * as THREE from 'three';
import { Point3D, BuildingConfig } from '../types/building';
import { calculateCentroid, createShapeFromPoints, ensureCounterClockwise } from '../utils/geometry';
import { getThemeColorAsHex } from '../utils/themeColors';

export class BuildingService {
  private scene: THREE.Scene;
  
  // Reusable geometries and materials for better performance
  private static debugMaterial: THREE.MeshStandardMaterial | null = null;
  
  // Add building state tracking
  private buildingState = {
    isCreatingPreview: false,
    sessionId: 0 // Add session tracking
  };
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeSharedResources();
  }

  private initializeSharedResources(): void {
    if (!BuildingService.debugMaterial) {      BuildingService.debugMaterial = new THREE.MeshStandardMaterial({
        color: getThemeColorAsHex('--color-building-debug', 0x00ff00),
        emissive: getThemeColorAsHex('--color-building-debug', 0x00ff00),
        emissiveIntensity: 0.1,
        roughness: 0.78,
        metalness: 0
      });
    }
  }

  createBuilding(points: Point3D[], config: BuildingConfig): THREE.Mesh {
    if (points.length < 3) {
      throw new Error('Need at least 3 points to create a building');
    }

    // Ensure points are in anti-clockwise order for consistent polygon orientation
    const normalizedPoints = ensureCounterClockwise(points);
    
    const centroid = calculateCentroid(normalizedPoints);
    const shape = createShapeFromPoints(normalizedPoints, centroid);
    
    // Calculate height from floors and floorHeight
    const height = config.height || (config.floors * config.floorHeight);
    
    // Extrude the shape to create 3D geometry
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
      steps: 1
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Rotate geometry so it extrudes upward (Y-axis)
    geometry.rotateX(-Math.PI / 2);
    
    // CRITICAL: Compute geometry attributes for proper raycasting
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    
    // Create material with proper shadow settings
    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0
    });
    
    const building = new THREE.Mesh(geometry, material);
    
    // Position at centroid
    building.position.set(centroid.x, 0, centroid.z);
    
    // IMPORTANT: Enable shadows explicitly
    building.castShadow = true;
    building.receiveShadow = true;
    
    // CRITICAL: Configure for proper raycasting
    building.visible = true;
    building.frustumCulled = false;
    building.matrixAutoUpdate = true;
    building.updateMatrix();
    building.updateMatrixWorld(true);
    
    // Ensure proper userData for interaction (will be overridden by BuildingManager)
    building.userData = { 
      type: 'building',
      interactive: true,
      clickable: true,
      castsShadows: true
    };
    
    // Add to scene
    this.scene.add(building);
    
    console.log('Building created with proper configuration:', {
      castShadow: building.castShadow,
      receiveShadow: building.receiveShadow,
      visible: building.visible,
      frustumCulled: building.frustumCulled,
      position: building.position,
      height: height,
      geometryBoundingBox: building.geometry.boundingBox,
      geometryBoundingSphere: building.geometry.boundingSphere,
      matrixWorldNeedsUpdate: building.matrixWorldNeedsUpdate
    });
    
    return building;
  }

  createPreviewBuilding(points: Point3D[], config: BuildingConfig): THREE.Mesh {
    if (points.length < 3) {
      throw new Error('Need at least 3 points to create a preview building');
    }

    this.buildingState.isCreatingPreview = true;

    const centroid = calculateCentroid(points);
    const shape = createShapeFromPoints(points, centroid);
    
    // Calculate height from floors and floorHeight
    const height = config.height || (config.floors * config.floorHeight);
    
    // Extrude the shape to create 3D geometry
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
      steps: 1
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Rotate geometry so it extrudes upward (Y-axis)
    geometry.rotateX(-Math.PI / 2);
    
    // Create a NEW material instance for each preview (don't share animated/changing materials)
    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      wireframe: false,
      roughness: 0.78,
      metalness: 0
    });
    
    const previewBuilding = new THREE.Mesh(geometry, material);
    
    // Position at centroid
    previewBuilding.position.set(centroid.x, 0, centroid.z);
    
    // Enable shadows for preview too (helps with visualization)
    previewBuilding.castShadow = true;
    previewBuilding.receiveShadow = true;
    
    // Add userData for identification and cleanup
    previewBuilding.userData = {
      isDrawingElement: true,
      isPreview: true,
      type: 'footprint',
      isFootprintPreview: true,
      castsShadows: true,
      createdAt: Date.now() // Add timestamp for debugging
    };
    
    this.scene.add(previewBuilding);
    this.buildingState.isCreatingPreview = false;
    return previewBuilding;
  }

  clearPreviewBuilding(building: THREE.Mesh): void {
    if (!building || this.buildingState.isCreatingPreview) return;
    
    this.scene.remove(building);
    building.geometry.dispose();
    // Always dispose material for preview buildings since they're unique instances
    (building.material as THREE.Material).dispose();
  }

  updatePreviewBuilding(building: THREE.Mesh, points: Point3D[], config: BuildingConfig): void {
    if (points.length < 3) {
      return;
    }

    const centroid = calculateCentroid(points);
    const shape = createShapeFromPoints(points, centroid);
    
    // Calculate height from floors and floorHeight
    const height = config.height || (config.floors * config.floorHeight);
    
    // Extrude the shape to create 3D geometry
    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
      steps: 1
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // Rotate geometry so it extrudes upward (Y-axis)
    geometry.rotateX(-Math.PI / 2);
    
    // Update building geometry and position
    building.geometry.dispose();
    building.geometry = geometry;
    building.position.set(centroid.x, 0, centroid.z);
  }

  createDebugMarker(position: Point3D, color: number = 0x00ff00): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(1.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.1,
      roughness: 0.9,
      metalness: 0
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, position.y, position.z);
    marker.userData = { isDebugMarker: true, temporary: true };
    this.scene.add(marker);
    
    return marker;
  }

  clearDebugMarkers(): void {
    const markersToRemove = this.scene.children.filter(
      child => child.userData?.isDebugMarker
    );
    
    markersToRemove.forEach(marker => {
      this.scene.remove(marker);
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        if (marker.material !== BuildingService.debugMaterial) {
          (marker.material as THREE.Material).dispose();
        }
      }
    });
  }

  // Add method to reset preview state
  resetPreviewState(): void {
    this.buildingState.isCreatingPreview = false;
    this.buildingState.sessionId++; // Increment session ID for new drawing session
  }
}
